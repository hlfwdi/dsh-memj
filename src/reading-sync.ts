/**
 * dsh-memj —— **「文档内提问」的轮末同步**（2026-10-14，第 3 期）
 *
 * ── 它做什么 ──────────────────────────────────────────────────────────────
 * 用户阅读知识时节选提问 ⇒ 开一个 DSH 会话。之后**每一轮结束**，把该轮的
 * 「用户提问 + 模型回答正文」追加进那条 `kind: chat` 的条目。
 *
 * ── 🔴 三条实现红线（都来自本机的既有教训）────────────────────────────────
 * 1. **只同步"从提问入口产生的会话"** —— 靠 `bindings` 反查（用户裁定）。
 *    ⚠️ 绝不能"所有会话都同步"：那会让**每一次普通对话**都往库里写条目，
 *       库被会话流水淹没（而用户要的是"问答沉淀成知识"）。
 * 2. **绝不阻塞主会话** —— `session/event` 是 `emit`（提交后 fire-and-forget）
 *    ⇒ 必须自己 detach + 全程 try/catch。同族教训见 `2f558352`：
 *    `agent/turn-stopping` 是 serial 钩子（会被 await），**不能**放慢操作。
 * 3. **只取 surface 的 text block** —— 结构性保证，见 §2。
 *
 * @module dsh-memj/reading-sync
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import {
  appendChatTurn,
  countChatTurns,
  findBindingBySession,
  loadCursors,
  renderChatTurn,
  saveCursor,
} from './reading.ts'

// ══════════════════════════════════════════════════════════════════════════
// 形状
// ══════════════════════════════════════════════════════════════════════════

/** 一轮要同步的内容（已过滤：只要 text）。 */
export interface SyncTurn {
  /** 用户的提问（该轮第一条 user 消息的 text）。 */
  question: string
  /** 模型的回答（该轮 assistant 消息的 text，可能多段）。 */
  answer: string
}

// ══════════════════════════════════════════════════════════════════════════
// 纯函数：从 surface 事件里抽一轮问答
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ **取一段 content 里的纯文本**（只收 `text` block）。
 *
 * 🔴🔴 **为什么必须按 block 类型筛**（用户明确要求"不要思考、不要工具调用"）：
 *    `assistant/message` 的 content 是 `ContentBlock[]`，其中
 *    · `text`      —— 用户可见的正文 ✅ 要；
 *    · `reasoning` —— 模型的思考 ⛔ **不要**（它进了库，读者会看到一堆自言自语）；
 *    · `tool-call` —— 工具调用 ⛔ **不要**（arguments 是原始 JSON 串，毫无可读性）。
 *
 *    ⚠️ **`reasoning` 与 `text` 是**分开的 block**（同为 `{type, text}` 形状！）
 *       ⇒ 只按 `block.text` 取会把思考也收进去。**必须判 `type`。**
 *
 * ⭐ 这与 `readSurface` 的"surface 已滤掉 tool/result"是**两层互补**的过滤：
 *    surface 层滤掉的是**事件类型**（`tool/call` 不是 surface 事件），
 *    本函数滤掉的是**块类型**（`reasoning` 在 `assistant/message` 里面）。
 *    ⚠️ 别以为有了前者就够了 —— 思考块是前者管不到的。
 *
 * @param content - 消息的 content block 数组。
 * @returns 拼好的纯文本；一个 text 块都没有 ⇒ 空串。
 */
export function textOfContent(content: readonly ContentBlock[] | undefined): string {
  if (content === undefined) return ''
  return content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/**
 * ⭐ **从一批 surface 事件里抽出「一轮问答」**。
 *
 * 🔴 **两种事件的 data 形状不同**（本项目"夹具要照真实 API 形状"的同类坑）：
 *   · `user/message` 的 data **就是** `UserMessage`（直接有 `content`）；
 *   · `assistant/message` 的 data 是 `{turn, step, message, stream}` ——
 *     content 在 **`data.message.content`** 里。
 *   ⚠️ 把两者写成一个形状 ⇒ 一边永远取到空 ⇒ "凑不齐一问一答"永久成立
 *     （而症状是"功能从来没同步过"，不报错）。
 *
 * 取法：该轮**第一条** `user/message` 的 text 作为提问；
 * **最后一条非空** `assistant/message` 的 text 作为回答。
 *
 * ⚠️ **为什么回答取"最后一条"而不是全拼**：一轮里可能有多个 step
 *    （模型调了工具再继续答），每个 step 都产出一条 `assistant/message`。
 *    · 全拼 ⇒ 中间那些"过渡句"（"我先查一下…"）会混进正文；
 *    · 取最后一条 ⇒ 拿到的是**该轮最终的完整回答**。
 *    ⚠️ 但若最后一条是空的（被中断），则**回退到最后一条非空的**。
 *
 * @param events - 本轮的 surface 事件（已按游标裁过增量）。
 * @returns 一轮内容；凑不齐一问一答 ⇒ `undefined`（调用方**不要**写半轮）。
 */
export function extractTurn(events: readonly unknown[]): SyncTurn | undefined {
  let question = ''
  let answer = ''

  for (const ev of events) {
    const e = ev as {
      type?: unknown
      /** `user/message`：data 本身就是消息。 */
      content?: ContentBlock[]
      /** `assistant/message`：data 里嵌着消息。 */
      data?: { message?: { content?: ContentBlock[] } }
    }
    if (e.type === 'user/message') {
      // ⭐ 提问只取**第一条**（后续的 user 消息可能是注入的上下文，不是人在问）。
      if (question === '') question = textOfContent(e.content)
      continue
    }
    if (e.type === 'assistant/message') {
      const t = textOfContent(e.data?.message?.content)
      // ⭐ 见上方注释：优先最后一条，但跳过空的（被中断的那种）。
      if (t !== '') answer = t
    }
  }

  if (question === '' || answer === '') return undefined
  return { question, answer }
}

// ══════════════════════════════════════════════════════════════════════════
// 同步主体
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐⭐ **注册轮末同步**（供插件 `apply()` 调用）。
 *
 * ⚠️ **形态照本项目其他 5 处 register**（`registerTagAutoNormalize` /
 *    `registerAutoScore` / …）：**返回"挂上了没有"**，让调用方打诊断行时
 *    能区分"已注册"与"没注册"——无条件打一行"已注册"是**假绿**。
 *
 * 🔴 **本功能没有总开关**（刻意）：它不是"可选增强"，而是
 *    「阅读提问」这条链路的**必要一半**（否则 chat 条目永远是空的）。
 *    ⚠️ 但它**零成本**：第一道门（`findBySession`）对非阅读会话直接返回，
 *    而 `bindings.jsonl` 在没人用过阅读功能时根本不存在（读一次 `undefined`）。
 *
 * @param ctx - 插件上下文。
 * @returns 是否挂上了（`sessionQuery` 不在 ⇒ `false`，调用方据此打诊断行）。
 */
export function registerReadingSync(ctx: Context): boolean {
  // ⚠️ `sessionQuery` 要 `ctx.get()` 取 —— `ctx.sessionQuery` 属性访问
  //    运行时是 `undefined`（memj 库条目 `4cfbb8d6`，本项目踩过）。
  const q = ctx.get('sessionQuery') as SyncDeps['sessionQuery']
  if (q?.readSurface !== undefined) {
    attachReadingSync(ctx, {
      sessionQuery: q,
      findBySession: (id) => findBindingBySession(id),
      loadCursors: () => loadCursors(),
      saveCursor: (id, n) => saveCursor(id, n),
      appendChatTurn: (id, frag) => appendChatTurn(id, frag),
      renderChatTurn,
      countTurns: (id) => countChatTurns(id),
    })
    return true
  }
  return false
}

/** 依赖（由调用方注入，便于测试）。 */
export interface SyncDeps {
  /**
   * `ctx.get('sessionQuery')` 的**最小面**（只声明用到的那个方法）。
   *
   * ⭐ **刻意与项目里既有 4 处同一种写法**（`hot-inject` / `hot-watch` /
   *    `score-auto` / `score-turn` 都是 `ctx.get('sessionQuery') as {...} | undefined`）：
   *    · 不 import 真实类型 ⇒ 不被 `dsh-session-query` 的导出形状绑死；
   *    · 参数用 `string` ⇒ 调用处不需要 branded 断言；
   *    · **标注可选** ⇒ 服务不在时优雅退化成"不同步"（见 `attachReadingSync`）。
   */
  sessionQuery?:
    | {
        readSurface(id: string): Promise<{
          inheritedEventCount: number
          capturedThroughSeq: number | null
          events: Array<{ seq: number } & Record<string, unknown>>
        }>
      }
    | undefined
  /** 读绑定（判断这个会话是不是提问入口产生的）。 */
  findBySession(sessionId: string): Promise<
    { entryId: string; anchor: { blockId: string }; chatEntryId: string } | undefined
  >
  /** 读游标。 */
  loadCursors(): Promise<Record<string, number>>
  /** 写游标。 */
  saveCursor(sessionId: string, throughSeq: number): Promise<void>
  /** 给 chat 条目追加一轮。 */
  appendChatTurn(chatEntryId: string, fragment: string): Promise<{ ok: true } | { ok: false; error: string }>
  /** 渲染一轮片段（纯函数，注入以便测试）。 */
  renderChatTurn(roundNo: number, question: string, answer: string): string
  /** 数某条目已有几轮（决定 `Q几` 的编号）。 */
  countTurns(chatEntryId: string): Promise<number>
}

/**
 * ⭐⭐ **同步一个会话**（轮末调用）。
 *
 * 全流程：
 * ```
 * ① 反查 bindings —— 不是提问入口 ⇒ 直接返回（不碰库）
 * ② readSurface —— 拿 surface + capturedThroughSeq
 * ③ 按游标裁增量（seq > cursor）；首次从 inheritedEventCount 起
 * ④ extractTurn —— 抽一问一答（只要 text block）
 * ⑤ appendChatTurn —— 追加进 chat 条目
 * ⑥ saveCursor —— 落盘新游标（🔴 必须在 ⑤ 之后，见下）
 * ```
 *
 * 🔴🔴 **为什么游标要在「追加成功之后」才写**：
 *    先写游标 ⇒ 追加失败（磁盘满 / 校验拒）时，那一轮**永久丢失**
 *    （下次再来时游标已经越过它，`extractTurn` 再也看不到）。
 *    ⭐ 判据：**游标是"已处理到哪"的承诺，不是"打算处理到哪"** ——
 *       承诺必须发生在事情真正办成之后。
 *
 * @param sessionId - 会话 id。
 * @param deps - 依赖。
 * @returns 同步结果（供日志/测试断言）。
 */
export async function syncSession(
  sessionId: string,
  deps: SyncDeps,
): Promise<
  | { status: 'skipped'; reason: string }
  | { status: 'empty' }
  | { status: 'synced'; roundNo: number }
  | { status: 'failed'; error: string }
> {
  // ① 🔴 只同步提问入口产生的会话（用户裁定：避免库被普通对话淹没）。
  const binding = await deps.findBySession(sessionId)
  if (binding === undefined) return { status: 'skipped', reason: 'not-a-reading-session' }

  // ② 读 surface（同时拿事件与游标终点）。
  //    ⚠️ `sessionQuery` 不在 ⇒ 优雅退化成"不同步"（绝不外抛）。
  const q = deps.sessionQuery
  if (q?.readSurface === undefined) return { status: 'skipped', reason: 'no-session-query' }
  const snap = await q.readSurface(sessionId)
  if (snap.capturedThroughSeq === null) return { status: 'empty' }

  // ③ 按游标裁增量。
  //    ⭐ 首次（无游标）从 `inheritedEventCount` **起**——那是 fork 继承的前缀
  //      长度，而 seq 是 **0-based** ⇒ 第一个"自己的"事件 seq 正好等于它
  //      ⇒ 必须**含**这个边界（用 `>` 会把那一问一答的头半个挡掉，
  //        于是"凑不齐一问一答"永久成立 —— 症状是"同步从来没成功过"）。
  //      ⚠️ 已处理过的情况（有游标）仍用 `>`：游标记的是"已处理到哪个 seq"，
  //        含它就会把上一轮的最后一条重复处理一遍。
  //    ⭐ fork 安全：不从 0 开始 ⇒ 父会话的内容不会被当成增量（`4c6a96b8`）。
  const cursors = await deps.loadCursors()
  const seen = cursors[sessionId]
  const from = seen ?? snap.inheritedEventCount
  const fresh = seen === undefined
    ? snap.events.filter((e) => e.seq >= from)
    : snap.events.filter((e) => e.seq > from)
  if (fresh.length === 0) return { status: 'empty' }

  // ④ 抽一问一答。凑不齐 ⇒ **不写半轮**（chat 条目里出现只有一个问题的
  //    一节，比没有更糟：读者会以为模型没答上来）。
  const turn = extractTurn(fresh)
  if (turn === undefined) {
    // ⚠️ 但游标**仍然要推进** —— 否则下一轮会把同一批事件反复重抽
    //    （典型场景：用户问了一句、模型还在跑就被中断 ⇒ 永远凑不齐）。
    await deps.saveCursor(sessionId, snap.capturedThroughSeq)
    return { status: 'empty' }
  }

  // ⑤ 追加进 chat 条目。
  const roundNo = (await deps.countTurns(binding.chatEntryId)) + 1
  const r = await deps.appendChatTurn(
    binding.chatEntryId,
    deps.renderChatTurn(roundNo, turn.question, turn.answer),
  )
  if (!r.ok) return { status: 'failed', error: r.error }

  // ⑥ 🔴 追加成功才推进游标（见上方红线）。
  await deps.saveCursor(sessionId, snap.capturedThroughSeq)
  return { status: 'synced', roundNo }
}

/**
 * ⭐ **挂轮末同步**（fire-and-forget 形态）。
 *
 * 🔴🔴 **为什么用 `agent/turn-stopping` 而不是 `session/event` 的 `turn/end`**：
 *    · 本项目**既有 5 处**（tag-auto / score-auto / context-auto / active-inject 等）
 *      全部用 `agent/turn-stopping` ⇒ 保持一致，不另造写法；
 *    · ⭐ **它的载荷直接带 `agent.id`**（那就是 sessionId）⇒ 不用从事件 subject 猜；
 *    · ⚠️ 它是 **`@mode serial`（会被 await）** ⇒ 见下方纪律 2。
 *
 * 🔴 **三条纪律**：
 * 1. **钩子本身只做"读记账 + 发起"，不 await 后台任务** ——
 *    serial 钩子里 await 一个跑几十秒的操作会**拖住主会话的轮次结束**，
 *    用户感到卡顿（`2f558352`；本项目 5 处实现都是这个形态）。
 * 2. **全程 try/catch** —— 钩子里的异常会**毁掉整个轮次**
 *    （`2f558352`）⇒ 同步失败绝不能影响用户正在进行的对话。
 * 3. **per-session 串行化** —— 同一会话连续两轮都快结束时，两个后台任务会同时写
 *    同一个 chat 条目 ⇒ 用 Promise 链串起来（否则两条追加可能交叉成乱序内容）。
 *
 * @param ctx - Cordis 上下文。
 * @param deps - 依赖。
 * @returns 取消监听的 disposer。
 */
export function attachReadingSync(ctx: Context, deps: SyncDeps): () => void {
  /** per-session 串行链（见纪律 3）。 */
  const chains = new Map<string, Promise<unknown>>()
  /** 🔴 日志：本项目要求"没起也要如实记"（否则分不清"没触发"与"被门挡住"）。 */
  const log = (m: string): void => {
    try { console.log(`[dsh-memj/reading-sync] ${m}`) } catch { /* 日志失败不影响主流程 */ }
  }

  const off = ctx.on(
    'agent/turn-stopping',
    async (payload: { agent?: { id?: unknown }; turn?: unknown }): Promise<void> => {
      // ⭐ `agent.id` 就是 sessionId；取不到就什么都不做（不猜）。
      const raw = payload?.agent?.id
      if (typeof raw !== 'string' || raw === '') return

      // ⭐ 串行化：把新任务接到该会话既有链条的末尾。
      const prev = chains.get(raw) ?? Promise.resolve()
      const next = prev
        .then(async () => {
          try {
            const r = await syncSession(raw, deps)
            // ⭐ 每种结局都记一行 —— "skipped" 是**常态**（绝大多数会话不是阅读会话），
            //   但排障时必须有据可查（本项目一贯的可观测性要求）。
            if (r.status === 'synced') log(`synced: ${raw} 第 ${r.roundNo} 轮`)
            else if (r.status === 'failed') log(`FAILED: ${raw} ${r.error}`)
          } catch (err) {
            // 🔴 只记日志，绝不外抛（否则会变成轮次错误）。
            log(`THREW: ${raw} ${String(err)}`)
          }
        })
        .finally(() => {
          // ⭐ 链条跑完就清掉，避免 Map 无限增长（一次阅读几十个会话）。
          if (chains.get(raw) === next) chains.delete(raw)
        })
      chains.set(raw, next)
      // 🔴 刻意不 await、也不返回值（fire-and-forget）。
      void next.catch(() => {})
    },
  )

  return off
}
