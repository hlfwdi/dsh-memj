/**
 * ⭐⭐⭐ 主动注入 · **触发与注入**（设计文档 §5、§7）。
 *
 * ── 两个钩子，必须配对 ────────────────────────────────────────────────────
 * ① **触发（`llm/stream`）**：流式 chunk 里 `reasoning` 块结束 ⇒ **思考结束，立刻**
 *    启动召回（此时**工具正在执行** ⇒ 把召回延迟藏进工具时间）；
 * ② **注入（`agent/pre-step`）**：下一个 step 前取队列 → 窗口判断 → push 一条插件消息。
 *
 * ── 🔴🔴 本模块最容易搞错的三处（都写在这里，别再踩）────────────────────────
 * 1. **`llm/stream` 监听器必须原样 `yield chunk`** —— 绝不新建/改写对象，
 *    否则 agent-loop **落盘序列化失败**（本项目已踩平）。
 * 2. **块类型在 `chunk.block.type`，不是 `chunk.blockType`** ——
 *    写错的后果是**静默死代码**（`dsh-prompt-inject` 真实事故，条目 `cbd92132`）。
 * 3. ⭐⭐ **"刚刚这次思考"必须在这里自己攒**：触发时刻那段思考
 *    **既不在 `options.messages`（那是请求，只含已提交历史）、也还没落盘**
 *    ⇒ 只能累加流式 chunk。⚠️ 漏了这一步，两个抑制判据（已有知识是否充足 /
 *    搜索意图）**只能读到上一次的思考，判据与时机错位一拍**。
 *
 * ── 与热知识注入的关系（§3.2）────────────────────────────────────────────
 * 两条通道**互补、不替代**（热知识 = 清单驱动；本模块 = 上下文驱动）。
 * 🔴 **去重靠"还在不在窗口里"**（§7.4①）：**还在 ⇒ 不注入；不在了 ⇒ 补**。
 * ⛔ **不做"按会话/turn 记账"式去重** —— 记账记的是"我给过了"，
 *    而模型可能**早就忘了**（被 compaction 压掉）⇒ **给了但被压掉 = 等于没给**，
 *    记账法**不会补**。判据升级成"**还在不在窗口里**"。
 *
 * @module dsh-memj/active-inject
 */

import type { Context } from '@deepseek-ai/cordis'
// ⚠️ 这两个 type-only import 是**声明合并的来源**：删掉就丢 `llm/stream` 与
//    `agent/pre-step` 的事件类型（本项目既有做法，见 `hot-watch.ts` 文件头）。
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { MemjConfig } from './config.ts'
// ⭐ 上限的**唯一判据**（新键优先、旧键回落）—— 别在别处再写 `?? 3`。
import { itemMinOf, maxInjectionsPerTurn, needMinOf } from './config.ts'
import {
  recall,
  renderActiveInjection,
  type Candidate,
  type RecallOutcome,
} from './active-recall.ts'
// ⭐ 上下文窗口**共用热知识看门狗那份实现**（本项目铁律：同一判据只有一份实现）。
import { resolveContextWindow, resolveProject } from './hot-watch.ts'
// ⭐⭐ **召回日志**（2026-09-27；用户要求"维护个日志记录每次调用详情"）——
//    A 结论 / B 请求快照 / C 注入正文 三档都在 `recall-log.ts` 里。
import { appendRecallLog, type RecallThresholds } from './recall-log.ts'
// ⭐ **共用同一份 uuid 形状定义**（本项目铁律：同一判据只能有一份实现）——
//    ⚠️ 漏了它就会出现"热知识认得出这个 id、主动注入认不出"的漂移。
import { UUID_SCAN } from './hot-inject.ts'

/** 排队超过它就丢弃（防跨轮残留）。 */
const QUEUE_TTL_MS = 10 * 60 * 1000

/** 一次召回的排队项。 */
interface QueuedPick {
  at: string
  turn: number
  /** 选中的条目（**已过输出校验**）。 */
  picks: Candidate[]
  /** 召回耗时（毫秒，供页面显示）。 */
  ms: number
  /** 本次是**粗筛后**的结果（粗筛会漏 ⇒ 如实显示）。 */
  batched: boolean
  evaluated: number
  pool: number
  /** ⚠️ 恒为 `false`（排队 ≠ 注入；真正的计数在注入那一刻 —— 见 `noteInjection`）。 */
  counted: boolean
  /** TTL 定时器（消费/过期时清掉）。 */
  timer: ReturnType<typeof setTimeout>
}

/** 本会话最近一次召回的状态（供"实时状态"页显示）。 */
export interface ActiveLastRecall {  at: string
  turn: number
  /** 结论：`injected` / `suppressed` / `skipped` / `empty`。 */
  kind: string
  /** 给人看的一句话。 */
  detail: string
  /** 本次注入了哪些 id（`kind==='injected'` 时有值）。 */
  injected: string[]
  /** 召回耗时。 */
  ms: number
  batched: boolean
  evaluated: number
  pool: number
  /**
   * ⭐⭐ **这一次算不算一次"注入"**（§7.4② 的计数口径，**逐次如实**）。
   *
   * 🔴 2026-09-27：口径从"占用调用额度"改成"**算一次注入**"（用户裁定：
   *    *"每轮最多 3 次注入，没有注入的不算次数。"*）——
   *    ⇒ 只有 `kind === 'injected'` 的那一笔才是 `true`，其余一律 `false`。
   *
   * 🔴 **为什么值得单独存一个字段**（2026-09-26 实测教训）：
   *    我用"看到 `kind=suppressed` 就断言额度为 0"去验口径，结果**假失败**了 ——
   *    因为累计值是**本 turn** 的，而那个 turn 里**之前**已经有过真的注入。
   *    ⚠️ 即：**从"累计值"反推"这一次计没计"是不可靠的**（它混了历史）
   *    ⇒ ⭐ **把这一事实直接记在这一次的结论上**，让判据**可观测**而不是靠推断。
   */
  counted: boolean
}

/** ⭐ 主动注入的运行时状态（**纯内存**，进程重启即失）。 */
export interface ActiveRuntimeState {
  /** `sessionId → 待注入队列`（下一个 `pre-step` 消费）。 */
  queue: Map<string, QueuedPick>
  /**
   * `sessionId → 最近一次出网时窗口里已有哪些封面 id`。
   *
   * 🔴 **必须来自 `llm/stream` 的 `options.messages`** —— `decision.messages` 只是
   *    **本轮 claimed、不含历史**，用它判断会**永远 false**（§7.2 第 2 条）。
   */
  windowPresent: Map<string, Set<string>>
  /** `sessionId → 当前 turn`（条件监听不含 turn，用它打戳）。 */
  currentTurn: Map<string, number>
  /**
   * `sessionId → 当前 step`（⭐ 2026-09-27 新增，给召回日志定位用）。
   *
   * 🔴 **为什么需要**：`llm/stream` 的 `options` **不含 step**
   *    （只有 `sessionId`），而召回是从那个监听器里触发的 ⇒ 想让日志能说清
   *    "**哪一步**判的"，只能从 `agent/pre-step` 把 `step` 记下来中转。
   *    ⚠️ 与 `currentTurn` 同款理由、同款写法（条件监听拿不到这两个值）。
   */
  currentStep: Map<string, number>
  /**
   * `sessionId → 本 turn 已【真正注入】的次数`（§7.4②）。
   *
   * 🔴🔴 **口径（2026-09-27 更正：从"调用"改成"注入"）** —— 用户原话：
   *    *"每轮最多 3 次注入，没有注入的不算次数。"*
   *    ⇒ **只有真的把知识注进会话才 +1**。被抑制的、没选出条目的、
   *      选中但全在窗口里（去重后为空）的，**一律不计**。
   *    ⚠️ 旧口径"每 turn 最多调几次模型"会让额度**提前耗光**（详见 `injectionsLeft`）。
   */
  injections: Map<string, { turn: number; n: number }>
  /**
   * ⭐⭐ `sessionId → 已经为哪个 turn 做过"提交触发"的召回`（2026-09-29 新增）。
   *
   * 🔴 **为什么需要**：`pre-step` 在一个 turn 里会跑**很多次**
   *    （实测一个 turn 有 5~8 个 step），而"用户提交"只发生在**第一步**。
   *    ⇒ 若不加这道去重，就会变成"**每个 step 都用同一句用户输入召回一次**"
   *      （严重的重复调用与浪费）。
   * ⭐ 判据：**只在 turn 变化后的第一次 `pre-step`** 里做提交触发。
   *    ⚠️ 记的是 **turn 号**（不是布尔）—— 新 turn 一来，号变了 ⇒ 自动又能触发。
   */
  submitTriggered: Map<string, number>
  /** `sessionId → 最近一次召回的结论`（页面用）。 */
  last: Map<string, ActiveLastRecall>
  /**
   * ⭐⭐ `sessionId → 本会话模型的上下文窗口`（tokens）。
   *
   * 用途：chat 通路的预算 = **窗口的 60%**（用户裁定）。
   * ⚠️ `GenerateOptions` 不含它，只能在出网时用 provider/model 换一次后**存下来**。
   */
  contextWindows: Map<string, number>
  /** ⚠️ 连续告警去重（本项目纪律：**高频警报会脱敏**）。 */
  warned: Set<string>
  /**
   * `sessionId → 最近一次**真的注入了**的记录`（§7.1 的"这个会话注入了多少"）。
   *
   * 🔴🔴 **为什么要与 `last` 分开**（2026-09-26 实测抓到的真缺陷）：
   *    一个 turn 有 5~8 个 step ⇒ **注入之后还会有新的召回**（下个 step 的思考又触发一次）。
   *    那些后续召回（queued / suppressed / skipped）会**把 `last` 覆盖掉**
   *    ⇒ 于是"这个会话到底注入过没有"**永远看不出来**
   *    （实测：日志里明明有注入事件、`/active` 却显示 `queued`）。
   * ⭐ 判据：**"最近一次召回"与"最近一次注入"是两件事** ——
   *    前者是过程，后者是**结果**；页面要回答的是后者。
   */
  lastInjection: Map<string, ActiveLastRecall>
  /** `sessionId → 本会话累计注入次数 / 条数`（页面显示"注入了多少"）。 */
  injectTotals: Map<string, { times: number; entries: number; at: string }>
}

/** 全局单例（**同一进程内共享** —— `api.ts` 的 `/active` 要读它，见 `hotState` 的同款理由）。 */
export const activeState: ActiveRuntimeState = {
  queue: new Map(),
  windowPresent: new Map(),
  currentTurn: new Map(),
  currentStep: new Map(),
  last: new Map(),
  warned: new Set(),
  lastInjection: new Map(),
  injectTotals: new Map(),
  contextWindows: new Map(),
  injections: new Map(),
  submitTriggered: new Map(),
}

/** ⚠️ 仅供测试：清空内存态（**不改磁盘**）。 */
export function resetActiveState(): void {
  for (const v of activeState.queue.values()) clearTimeout(v.timer)
  activeState.queue.clear()
  activeState.windowPresent.clear()
  activeState.currentTurn.clear()
  activeState.currentStep.clear()
  activeState.last.clear()
  activeState.warned.clear()
  activeState.lastInjection.clear()
  activeState.injectTotals.clear()
  activeState.contextWindows.clear()
  activeState.injections.clear()
  activeState.submitTriggered.clear()
}

/**
 * 本 turn 还能不能**注入**（🔴 2026-09-27：只对**真正注进去**的计数）。
 *
 * ⭐⭐ **口径改了**（用户原话：*"每轮最多 3 次注入，没有注入的不算次数。"*）：
 *    旧口径 = "最多调 3 次召回模型" ⇒ 一个 turn 前几步只要全是"没选出条目"，
 *    额度就**在真正需要知识的那几步之前耗光**（实测会话 `2b809b4a` 的 turn 6 正是如此）。
 *    新口径 = 只有**真把知识注进会话**才 +1。
 * @param sid - 会话 id。
 * @param turn - 当前 turn。
 * @param config - 配置（上限经 {@link maxInjectionsPerTurn} 解析，含旧键回落）。
 * @returns 剩余可注入次数。
 */
function injectionsLeft(sid: string, turn: number, config: MemjConfig): number {
  const cur = activeState.injections.get(sid)
  const used = cur !== undefined && cur.turn === turn ? cur.n : 0
  return maxInjectionsPerTurn(config) - used
}

/** 记一次**真正发生的注入**（⚠️ 只有真注进去了才调它）。 */
function noteInjection(sid: string, turn: number): void {
  const cur = activeState.injections.get(sid)
  activeState.injections.set(sid, cur !== undefined && cur.turn === turn ? { turn, n: cur.n + 1 } : { turn, n: 1 })
}

/**
 * ⭐⭐ **判断"这次思考结束"**（§5.2 严格 / 宽松）。
 *
 * | 口径 | 判据 | 触发面 |
 * |---|---|---|
 * | **严格**（默认） | `chunk.type==='block-end' && chunk.block?.type==='reasoning'` | 约 **69%** 的 step；⚠️ **不输出思考的模型永不触发** |
 * | 宽松 | 上面那条 **或** 首个 `text-delta` | 几乎每步 |
 *
 * ⚠️ 宽松口径下**必须防重复触发**：一个 step 里 `reasoning` 和 `text` 都可能出现
 *    ⇒ 由调用方用 `thoughtEnded` 标志位收口（首次命中即置位）。
 * ⚠️ **块类型在 `chunk.block.type`**（不是 `chunk.blockType`）。
 * @param chunk - 流式 chunk。
 * @param strict - 严格档。
 * @returns 是否判定"思考结束"。
 */
export function isThoughtEnd(chunk: unknown, strict: boolean): boolean {
  const c = chunk as { type?: unknown; block?: { type?: unknown } } | undefined
  if (c === undefined || c === null) return false
  if (c.type === 'block-end' && c.block?.type === 'reasoning') return true
  if (!strict && c.type === 'text-delta') return true
  return false
}

/** 从 chunk 里取本次思考的**完整文本**（`block-end` 的 `chunk.block` 是完整块）。 */
export function reasoningTextOf(chunk: unknown): string {
  const c = chunk as { type?: unknown; block?: { type?: unknown; text?: unknown } } | undefined
  if (c?.type === 'block-end' && c.block?.type === 'reasoning' && typeof c.block.text === 'string') {
    return c.block.text
  }
  return ''
}

/** 累加 `reasoning-delta`（§6.5 的另一种攒法）。 */
export function deltaTextOf(chunk: unknown): string {
  const c = chunk as { type?: unknown; text?: unknown } | undefined
  if (c?.type === 'reasoning-delta' && typeof c.text === 'string') return c.text
  return ''
}

/**
 * ⭐⭐ **挂上主动注入的两个钩子**（`index.ts` 在依赖就绪后调用）。
 *
 * ⚠️ **总开关关着时不挂任何钩子** ⇒ 关掉时**零开销**，也不在别人的事件链上占位。
 * 🔴 **失败绝不影响主流程**：两条链路各自 `try/catch` 到底
 *    （钩子里的异常会毁掉整个轮次）。
 * @returns ⭐ **是否真的挂上了钩子** —— 调用方拿它写诊断。
 *   🔴 **为什么必须回一个布尔**：`index.ts` 里那句 `diag('active-injection-registered')`
 *   是**无条件**打的，开关关着时也会打 ⇒ 它**证明不了钩子挂上了**
 *   （本项目铁律：**"什么都没发生"不能靠自觉** —— 那正是"假绿"）。返回值让诊断能区分。
 */
export function registerActiveInjection(opts: { ctx: Context; config: MemjConfig }): boolean {
  const { ctx, config } = opts
  if (!config.activeInject) return false
  const log = (m: string): void => {
    try { ctx.logger?.info?.(`[dsh-memj/active] ${m}`) } catch { /* 日志失败不影响注入 */ }
  }
  const warn = (m: string): void => {
    try { ctx.logger?.warn?.(`[dsh-memj/active] ${m}`) } catch { /* ignore */ }
  }

  // ── ① 触发：思考结束 ⇒ 启动召回（与工具执行并行）──
  //
  // 🔴 回调签名照 `llm/stream` waterfall：`(options, next) => AsyncIterable`。
  //    ⚠️ **必须原样透传 chunk**（`yield chunk`）——绝不新建/改写对象。
  ctx.on('llm/stream', async function* (
    options: GenerateOptions,
    next: () => AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
    // ⚠️ `purpose` 非空 = 辅助调用（压缩 / 会话标题）⇒ **不是主会话请求**，跳过。
    //    🔴 这也是为什么本插件自己的召回调用（**不带 sessionId**）不会触发这里。
    const sid = typeof options?.sessionId === 'string' ? options.sessionId : ''
    const isSessionStep = sid !== '' && options?.purpose === undefined
    if (isSessionStep && Array.isArray(options?.messages)) {
      // ⭐ **窗口快照**：这次出网的消息里已经带了哪些封面 id。
      //    ⚠️ 只有**候选池里可能出现的 id** 才需要认 —— 但池子要靠索引才知道，
      //    而这里在读流的热路径上（每步一次）⇒ **只索引一次、缓存起来**。
      try {
        activeState.windowPresent.set(sid, snapshotWindow(options.messages))
      } catch (err) {
        warn(`窗口快照失败：${String(err)}`)
      }
      // ⭐⭐ **顺手记下上下文窗口**（chat 通路的"60% 预算"要用）。
      //    ⚠️ `GenerateOptions` **不含** `contextWindow` ⇒ 只能用 provider/model 换一次；
      //    同一会话模型极少变 ⇒ 已有值就直接复用（与热知识看门狗共用同一个实现）。
      try {
        const cw = await resolveContextWindow(ctx, options, activeState.contextWindows.get(sid))
        if (typeof cw === 'number' && cw > 0) activeState.contextWindows.set(sid, cw)
      } catch { /* 拿不到就不检查预算，不抛 */ }
    }
    let acc = ''
    let thoughtEnded = false
    for await (const chunk of next()) {
      if (isSessionStep) {
        // 自己攒这次思考（见模块头第 3 条）
        const d = deltaTextOf(chunk)
        if (d !== '') acc += d
        const full = reasoningTextOf(chunk)
        if (full !== '') acc = full
        if (!thoughtEnded && isThoughtEnd(chunk, config.activeInjectStrict)) {
          thoughtEnded = true
          // ⭐ **fire-and-forget**：召回与随后的工具执行**并行** ⇒ 不拖慢主会话。
          void runRecall({
            ctx,
            config,
            sid,
            turn: activeState.currentTurn.get(sid) ?? -1,
            // ⚠️ `llm/stream` 的 options **不含 step** ⇒ 从 `pre-step` 记下的那个值取。
            step: activeState.currentStep.get(sid) ?? -1,
            messages: options.messages,
            reasoning: acc,
            contextWindow: activeState.contextWindows.get(sid),
            trigger: 'reasoning',
            log,
            warn,
          })
        }
      }
      // 🔴 **永远原样透传**（含 finish），绝不 yield 改写/新建对象。
      yield chunk
    }
  })

  // ── ② 注入：下一个 step 前消费队列 ──
  ctx.on('agent/pre-step', async (
    payload: { agent: { id: string }; messages: unknown[]; turn?: number },
    next: () => Promise<PreStepDecision>,
  ): Promise<PreStepDecision> => {
    // ⚠️ 本轮次开始的判定必须在 `next()` **之前**（要用 payload 的 turn 打戳）。
    const sid = typeof payload?.agent?.id === 'string' ? payload.agent.id : ''
    const turn = typeof payload?.turn === 'number' ? payload.turn : undefined
    // ⭐ `step` 只在这里拿得到（`llm/stream` 的 options 没有它）⇒ 记下来给召回日志定位。
    //    ⚠️ 用 `as unknown as` 两步转换：本文件把 payload 类型收窄成了最小子集
    //    （只声明自己用到的字段），而 `step` 不在那个子集里。
    const stepRaw = (payload as unknown as { step?: unknown })?.step
    const step = typeof stepRaw === 'number' ? stepRaw : undefined
    try {
      if (sid !== '' && turn !== undefined) activeState.currentTurn.set(sid, turn)
      if (sid !== '' && step !== undefined) activeState.currentStep.set(sid, step)
    } catch { /* ignore */ }
    const decision = await next()

    // ── ②b ⭐⭐⭐ **提交触发**：用户从输入框 submit ⇒ 用他的话当判据再召回一次 ──
    //
    // 🔴🔴 **必须独立于下面的注入逻辑**（2026-09-29 我第一版放错了，实测才看清）：
    //    下面的注入段在**队列为空时会 `return decision`**，而
    //    ⭐ **第一步的队列必然是空的**（还没有任何召回跑过）⇒ 放进去就**永远不触发**。
    //    ⇒ 两件事只是**恰好共用 `payload.messages`**，没有从属关系。
    //
    // 用户裁定（原话）：*"之前是只在思考后去调用。我需要加个情况，就是用户从输入框
    //   submit 后，也要用用户的输入内容作为判据去调用一次。"*
    //
    // 🔴 **为什么"思考结束"那条不够用**：它**只在模型输出 reasoning 时才触发**。
    //    实测（2026-09-29）：本会话 345 条 assistant 消息里 **reasoning 块 = 0**
    //    ⇒ 严格档下**永不触发**（用户报"一次主动注入都没有"的根因）。
    //    ⭐ 而"用户提交"是**必然发生**的事件 ⇒ 这条触发点**不依赖模型行为**。
    //
    // ⚠️ **判据是用户的输入**（`source.kind==='user'`，见 `extractUserSubmit`），
    //    **不是**"这一步有消息" —— 后者会把我们自己注入的热知识当成用户输入。
    try {
      if (sid !== '' && turn !== undefined && decision !== undefined && decision.kind === 'enter') {
        // ⭐ **一个 turn 只做一次**（`pre-step` 每个 step 都跑，不加这道会重复召回 N 次）。
        if (activeState.submitTriggered.get(sid) !== turn) {
          const userText = extractUserSubmit(
            (payload.messages ?? []) as readonly unknown[],
            config.activeInjectReasoningMaxChars,
          )
          if (userText !== '') {
            // ⚠️ **先标记再发**（失败了也不重试 —— 免得每步都重发一次）。
            activeState.submitTriggered.set(sid, turn)
            log(`${sid} 提交触发：用户输入 ${userText.length} 字符 ⇒ 发起召回`)
            // ⭐ **fire-and-forget**（召回的延迟藏在后面几步里，绝不拖慢这一步）。
            void runRecall({
              ctx,
              config,
              sid,
              turn,
              step: step ?? -1,
              // ⚠️ **背景用 `decision.messages`（本步真正要进的那批），不是 `payload.messages`**：
              //    后者只是**本步从 inbox 领到的那几条**（实测＝用户刚提交的那一句），
              //    拿它当上下文会让 `background` 几乎是空的。
              //    🔴 **但判据那段不受影响** —— 它是 `reasoning`（下面单独传用户原文），
              //       而提问里明说"**只按 `current_thinking` 判、background 只是材料**"。
              messages: Array.isArray(decision.messages)
                ? (decision.messages as unknown[])
                : payload.messages,
              // ⭐⭐ **判据换成人话**：用户的原话就是"这一轮要做什么"的最强声明。
              //    ⚠️ 复用的是同一个字段（召回的 `current_thinking`）—— 召回侧不需要
              //      知道这段文字是模型的思考还是用户的话，它只负责"按这段判据找知识"。
              reasoning: userText,
              contextWindow: activeState.contextWindows.get(sid),
              trigger: 'submit',
              log,
              warn,
            })
          }
        }
      }
    } catch (err) {
      warn(`提交触发失败：${String(err)}`)
    }

    try {
      if (sid === '' || decision === undefined || decision.kind !== 'enter') return decision
      const item = activeState.queue.get(sid)
      if (item === undefined) return decision
      // ⚠️ 跨轮 ⇒ 过期丢弃（本轮内消费语义）
      if (turn !== undefined && item.turn !== turn) {
        clearTimeout(item.timer)
        activeState.queue.delete(sid)
        log(`过期丢弃 ${sid}（排队 turn=${item.turn} ≠ 当前 turn=${turn}）`)
        return decision
      }
      const messages = decision.messages as unknown[] | undefined
      if (!Array.isArray(messages)) return decision
      clearTimeout(item.timer)
      activeState.queue.delete(sid)

      // ⭐⭐ **① 内容去重的机械兜底**（§7.4①）：把「已经还在窗口里」的剔掉。
      //     🔴 **必须用 `llm/stream` 的 `options.messages` 快照**（windowPresent）——
      //        用 `decision.messages` 会**永远判 false**（它只是本轮 claimed）。
      const present = activeState.windowPresent.get(sid)
      const fresh = item.picks.filter((c) => !(present?.has(c.id) ?? false))
      if (fresh.length === 0) {
        activeState.last.set(sid, {
          at: new Date().toISOString(), turn: item.turn, kind: 'empty',
          detail: '选中的条目全都还在窗口里 ⇒ 不重复注入',
          injected: [], ms: 0, batched: false, evaluated: 0, pool: 0, counted: item.counted,
        })
        log(`${sid} 选中 ${item.picks.length} 条但全在窗口里 ⇒ 本次不注入`)
        return decision
      }
      const text = renderActiveInjection(fresh)
      if (text === '') return decision
      // 🔴 **注入消息带 `source`** ⇒ 来源可审计（`ContextForm` 六值之一）。
      messages.push({
        id: `memj-active-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: 'plugin:dsh-memj', form: 'instructions' },
      })
      // ⭐⭐⭐ **额度在这里才计**（2026-09-27：从"调用"改成"注入"）。
      //    🔴 **必须放在"消息真的 push 进 messages"之后** —— 那才是"注进去了"的定义。
      //    放在更早的任何位置（召回返回时 / 出队时）都会把"选中了但没注成"算进额度。
      //    ⚠️ 用 `item.turn`（这一笔排队自带的 turn）而不是 `payload.turn`：
      //       前者是这个注入的**身份**，且两者在上一段已校验过相等。
      noteInjection(sid, item.turn)
      // ⭐⭐ **把"这一次算不算一次注入"如实标出来**（供页面/排障，不靠反推）。
      const counted = true
      activeState.last.set(sid, {
        at: new Date().toISOString(), turn: item.turn, kind: 'injected',
        detail: `注入 ${fresh.length} 条（召回 ${item.ms}ms）`,
        injected: fresh.map((c) => c.id), ms: item.ms, batched: item.batched,
        evaluated: item.evaluated, pool: item.pool, counted,
      })
      // ⭐⭐ **另外记一笔"真的注入了"**（它**不会**被后续召回覆盖 —— 见 `lastInjection` 注释）
      const rec: ActiveLastRecall = {
        at: new Date().toISOString(), turn: item.turn, kind: 'injected',
        detail: `注入 ${fresh.length} 条（召回 ${item.ms}ms）`,
        injected: fresh.map((c) => c.id), ms: item.ms, batched: item.batched,
        evaluated: item.evaluated, pool: item.pool, counted,
      }
      activeState.lastInjection.set(sid, rec)
      const tot = activeState.injectTotals.get(sid)
      activeState.injectTotals.set(sid, {
        times: (tot?.times ?? 0) + 1,
        entries: (tot?.entries ?? 0) + fresh.length,
        at: rec.at,
      })
      // ⭐⭐⭐ **C 档：把真的注进去的那段正文记进日志**（用户 2026-09-27 要求）。
      //    🔴 **必须在此处（`messages.push` 之后）** —— 它才是"模型实际看到了什么"的逐字证据；
      //       召回日志的 A 档只能说"选中了几条"，**说不出注入的正文长什么样**
      //       （本项目已记过"算出的量 ≠ 发出的量"，那次就是只信了记账字段）。
      //    ⚠️ 它是**第二种事件**（`event: 'inject'`），与 A 档的 `recall` 行**分开写**：
      //       被抑制的召回到不了这里，合成一条会让"为什么没注入"看不见。
      //    ⚠️ `void` + 内部吞异常 ⇒ 日志绝不连累注入本身。
      void appendRecallLog({
        event: 'inject',
        at: new Date().toISOString(),
        sessionId: sid,
        turn: item.turn,
        step: activeState.currentStep.get(sid) ?? -1,
        channel: config.activeInjectChannel,
        model: config.activeInjectModel,
        scope: config.activeInjectScope,
        count: fresh.length,
        ids: fresh.map((c) => c.id),
        text,
      })
      // ⚠️ **不唤醒驱动** —— `pre-step` 本来就在跑（本项目既有做法，别改成 followup）。
      log(`${sid} 已注入 ${fresh.length} 条（${text.length} 字符）`)
    } catch (err) {
      // 🔴 **注入失败绝不能让这个 step 挂掉**（钩子抛错会毁掉整个轮次）。
      warn(`注入失败：${String(err)}`)
    }
    return decision
  })

  // ── ③ 轮末丢弃（本轮内消费语义）──
  ctx.on('agent/turn-stopping', async (payload: { agent?: { id?: string }; turn?: number }) => {
    try {
      const sid = payload?.agent?.id ?? ''
      if (sid === '') return
      const q = activeState.queue.get(sid)
      if (q !== undefined && (payload?.turn === undefined || q.turn === payload.turn)) {
        clearTimeout(q.timer)
        activeState.queue.delete(sid)
      }
    } catch { /* ignore */ }
  })

  return true
}

/**
 * ⭐ 给"实时状态"页用的只读快照（**最近一次召回**）。
 *
 * ⚠️ 它与 {@link lastInjectionOf} 是**两件事**：这个是"最近一次判断"，
 *    那个是"最近一次真的注进去"（前者会被后续召回覆盖、后者不会）。
 * @param sid - 会话 id。
 * @returns 最近一次召回；没有时 `undefined`。
 */
export function activeSnapshot(sid: string): ActiveLastRecall | undefined {
  return activeState.last.get(sid)
}

/**
 * ⭐ **最近一次真的注入**（不会被后续召回覆盖 —— 见 `lastInjection` 的注释）。
 * @param sid - 会话 id。
 */
export function lastInjectionOf(sid: string): ActiveLastRecall | undefined {
  return activeState.lastInjection.get(sid)
}

/** 本会话累计注入（次数 / 条数 / 时刻）；一次都没注入过时 `undefined`。 */
export function injectTotalsOf(sid: string): { times: number; entries: number; at: string } | undefined {
  return activeState.injectTotals.get(sid)
}

/**
 * 本 turn 已**真正注入**的次数（页面显示"额度用了几个"）。
 *
 * 🔴 2026-09-27：口径从"调用次数"改成"**注入次数**"（用户原话：
 * *"每轮最多 3 次注入，没有注入的不算次数。"*）⇒ 函数名与语义同步改。
 * @param sid - 会话 id。
 */
export function activeInjectionsUsed(sid: string): number {
  return activeState.injections.get(sid)?.n ?? 0
}

/**
 * 从出网消息里挑出"已出现的封面 id"。
 *
 * ⭐ **共用 `UUID_SCAN`**（与热知识看门狗同一份"什么算一个封面 id"的定义）——
 *  ⚠️ 与 `fingerprintsInText` 的**用法不同**：那边是"**给定的**一批 id 里哪些出现了"，
 *  这边是"**所有**出现过的 id 是哪些"（哨兵只需排除，不需要预设列表）。
 *  两者共用形状定义，但**不能共用一个函数**（一个是求交、一个是全扫）。
 * ⚠️ 已知"假阳性"（**不是 bug，别去修**）：别的插件注入的 uuid 也会被扫进来 ——
 *  但那只会让我们**少注入一次**（保守方向），不会注入错东西。
 * @param messages - `options.messages` 快照。
 * @returns 出现的全部 uuid 形状串。
 */
export function snapshotWindow(messages: readonly unknown[]): Set<string> {
  const found = new Set<string>()
  for (const m of messages) {
    const content = (m as { content?: unknown })?.content
    if (!Array.isArray(content)) continue
    for (const b of content) {
      const t = (b as { text?: unknown })?.text
      if (typeof t !== 'string' || t === '') continue
      for (const hit of t.matchAll(UUID_SCAN)) found.add(hit[0])
    }
  }
  return found
}

/**
 * ⭐⭐⭐ **从这一步的消息里挑出"用户刚从输入框提交的那段话"**（2026-09-29 新增）。
 *
 * 用户裁定（原话）：*"之前是只在思考后去调用。我需要加个情况，就是用户从输入框
 * submit 后，也要用用户的输入内容作为判据去调用一次。"*
 *
 * ── 判据为什么是 `source.kind === 'user'`（实测确认，不是推断）─────────────
 * 真实会话日志里 `user/message` 的 `source` 只有两类：
 * ```jsonc
 * // ① 真人从输入框提交
 * {"kind":"user","rpcId":"…","clientTimeZone":"Asia/Shanghai"}
 * // ② 插件注入（含 memj 自己的热知识/主动注入）
 * {"kind":"plugin","plugin":"dsh-memj","form":"instructions"}
 * {"kind":"plugin","plugin":"@deepseek-ai/dsh-system-prompt","form":"snapshot",…}
 * {"kind":"plugin","plugin":"user-approval"}
 * // ③ 别的 agent 来的
 * {"kind":"agent-message","form":"relay","senderSessionId":"…"}
 * {"kind":"subagent-settled","form":"notice","summary":"…"}
 * ```
 * ⇒ ⭐ **`kind === 'user'` 就是"真人提交"**（`rpcId` 是客户端请求 id，只有真人点提交才有）。
 * 🔴 **不能用"消息里有文字"当判据** —— 插件注入的也都是 user 角色的文本，
 *    那样会把**我们自己注入的热知识**当成用户输入，**每次都自我触发**。
 *
 * ⚠️ **只取本步新增的**：`payload.messages` 是"**这一步被 claim 的**消息"
 *    （类型定义：*"messages removed from the inbox for this step"*），
 *    所以它天然只含本次提交的内容 + 同批的插件注入。
 *
 * @param messages - `agent/pre-step` 的 `payload.messages`。
 * @param maxChars - 截断上限（判据要进召回输入，会挤预算）。
 * @returns 用户输入的纯文本；没有则空串。
 */
export function extractUserSubmit(messages: readonly unknown[], maxChars: number): string {
  const parts: string[] = []
  for (const m of messages) {
    const o = m as { role?: unknown; source?: unknown; content?: unknown }
    if (o?.role !== 'user') continue
    const kind = (o.source as { kind?: unknown } | undefined)?.kind
    // 🔴 **只认真人提交**（见上面长注释的实测依据）。
    if (kind !== 'user') continue
    if (!Array.isArray(o.content)) continue
    for (const b of o.content) {
      const t = (b as { type?: unknown; text?: unknown })?.type
      const txt = (b as { text?: unknown })?.text
      if (t === 'text' && typeof txt === 'string' && txt.trim() !== '') parts.push(txt.trim())
    }
  }
  if (parts.length === 0) return ''
  const joined = parts.join('\n\n')
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined
}

/** 跑一次召回并入队（**fire-and-forget**，绝不抛）。 */async function runRecall(opts: {
  ctx: Context
  config: MemjConfig
  sid: string
  turn: number
  /** ⭐ 当前 step（召回日志定位用）；拿不到时 `-1`。 */
  step: number
  messages: readonly unknown[] | undefined
  reasoning: string
  /** ⭐ 本会话模型的上下文窗口（chat 通路的"60%"要用）；拿不到时 `undefined`。 */
  contextWindow: number | undefined
  /**
   * ⭐⭐ **这次召回是哪个触发点发起的**（2026-09-29 新增）。
   * · `reasoning` —— 思考结束（老触发点）
   * · `submit`    —— 用户从输入框提交（新触发点）
   * ⚠️ 只影响**日志标注**，不影响任何判据。
   */
  trigger?: string
  log: (m: string) => void
  warn: (m: string) => void
}): Promise<void> {
  const { ctx, config, sid, turn, step } = opts
  /**
   * ⭐⭐ **当时的阈值快照**（召回日志用）—— 见 `RecallThresholds` 的注释：
   *    日志是跨版本的长期文件，只记分数不记阈值 ⇒ **日后无法复核那次判断按什么标准做的**。
   */
  const thresholds: RecallThresholds = {
    // ⚠️ 不再写 `band`（已作废）；两个新键**都记** —— 它们现在语义不同，
    //    只记一个会让日后回看时又分不清"是哪一个没过线"。
    needMin: needMinOf(config),
    itemMin: itemMinOf(config),
    searchIntentMin: config.activeInjectSearchIntentMin,
    sufficientMin: config.activeInjectSufficientMin,
  }
  /**
   * ⭐⭐ **写一条召回日志**（A 档：结论 + 三个分数 + 阈值快照）。
   *
   * 🔴 **每次都写，含"没注入"的那些** —— 那正是排障的主战场
   *    （用户实测的两次都是 `suppressed`；若只在注入时写，就**什么都看不见**）。
   * ⚠️ `void`：日志是 fire-and-forget，**绝不拖慢也不影响召回**（`appendRecallLog` 内部吞异常）。
   */
  const logRecall = (kind: string, detail: string, extra: Partial<ActiveLastRecall> = {}): void => {
    void appendRecallLog({
      event: 'recall',
      at: new Date().toISOString(),
      sessionId: sid,
      turn,
      step,
      channel: config.activeInjectChannel,
      model: config.activeInjectModel,
      scope: config.activeInjectScope,
      ...(opts.trigger !== undefined ? { trigger: opts.trigger } : {}),
      kind,
      detail,
      ...(outScores !== undefined ? { scores: outScores } : {}),
      evaluated: extra.evaluated ?? 0,
      pool: extra.pool ?? 0,
      batched: extra.batched ?? false,
      ms: extra.ms ?? 0,
      picked: (extra.injected ?? []).slice(),
      counted: extra.counted ?? false,
      thresholds,
      ...(outRequest !== undefined ? { request: outRequest } : {}),
    })
  }
  // ⭐ 这两个在 `recall()` 返回后才有值；用闭包变量让上面的 `logRecall` 能读到
  //    （⚠️ 声明在 `put` 之前，因为 `put` 会在早退路径里调 `logRecall`）。
  let outScores: RecallOutcome['scores']
  let outRequest: RecallOutcome['request']
  const put = (detail: string, kind: string, extra: Partial<ActiveLastRecall> = {}): void => {
    if (turn >= 0) {
      activeState.last.set(sid, {
        at: new Date().toISOString(), turn, kind, detail,
        injected: [], ms: 0, batched: false, evaluated: 0, pool: 0, counted: false, ...extra,
      })
    }
    // ⭐ 页面内存态与日志**同一处写**（避免"页面有、日志没有"这种两份实现漂移）。
    logRecall(kind, detail, extra)
  }
  try {
    // ⭐⭐ **额度检查放在最前**：**注入次数**已用满 ⇒ 连召回都不做（§7.4②）。
    //    🔴 口径是 **"已注入几次"**，不是"调了几次模型"（2026-09-27 更正）——
    //       用户原话：*"每轮最多 3 次注入，没有注入的不算次数。"*
    //    ⚠️ 这里**只是省一次无用调用**；真正的计数在注入那一刻（见 `noteInjection`）。
    if (turn >= 0 && injectionsLeft(sid, turn, config) <= 0) {
      put(`本 turn 注入已达上限 ${maxInjectionsPerTurn(config)} 次`, 'skipped')
      return
    }
    // ⭐ 项目绑定（**"未知"是一等公民**：判不出 ⇒ `project*` 范围跳过，不退化成全量）
    const r = await resolveProject(ctx, sid)
    // ⭐⭐ **预算与裁剪交给 `recall` 统一做**（用户 2026-09-26 方案）：
    //    它会在调模型**之前**组装上下文（turn 级裁）并（必要时）裁候选池。
    //    ⇒ 这里**不再自己截上下文** —— 那会与"先预算后裁剪"的顺序打架。
    // ⚠️ `contextWindow` 用于 chat 通路的"窗口 60%"；拿不到就不检查（不凭猜裁）。
    const out: RecallOutcome = await recall({
      ctx,
      config,
      project: r.project,
      messages: opts.messages,
      currentReasoning: opts.reasoning,
      contextWindow: opts.contextWindow,
    })
    // ⭐⭐ **把召回带回来的两个诊断件交给 `logRecall`**（它们要在 `put` 里被写进日志）：
    //    · `scores`   = 三个总控分数（A 档最该看的东西）；
    //    · `request`  = 发给 JEV 的请求快照（B 档，仅开关打开时有值）。
    outScores = out.scores
    outRequest = out.request
    // ⭐⭐ **⚠️ 这里不再计额度**（2026-09-27 更正）。
    //    🔴 旧写法是 `counts = out.called && out.suppressed === ''` + `noteCall(...)` ——
    //       它计的是"**调了一次模型**"，而**选中了条目 ≠ 注进去了**
    //       （下一个 pre-step 才真注入，还可能因"全在窗口里"而放弃）。
    //    ⇒ 计数已移到**注入那一刻**（`noteInjection`，见 ② 段）。
    //    ⚠️ 判据（本项目一贯）：**"算出的量"与"真正发生的量"不能是两回事。**
    // ⭐ 把"这一次计没计额度"**直接记进结论**（别让人从累计值反推 —— 反推不可靠）：
    //    ⚠️ 到这里**一律还没注入** ⇒ `counted: false` 是**如实**的；
    //       真要注入时，② 段会用 `counted: true` 覆盖这一笔。
    const counts = false
    const base = {
      ms: out.ms, batched: out.batched, evaluated: out.evaluated, pool: out.pool, counted: counts,
    }
    if (out.need && out.picks.length > 0) {
      const prev = activeState.queue.get(sid)
      if (prev !== undefined) clearTimeout(prev.timer)
      const timer = setTimeout(() => { activeState.queue.delete(sid) }, QUEUE_TTL_MS)
      // ⚠️ `timer.unref` 不存在于浏览器类型里，但在 Node 下可用；拿不到就跳过。
      try { (timer as unknown as { unref?: () => void }).unref?.() } catch { /* ignore */ }
      activeState.queue.set(sid, {
        picks: out.picks, turn, at: new Date().toISOString(), timer, ...base,
      })
      put(`选中 ${out.picks.length} 条，待注入`, 'queued', base)
      opts.log(`${sid} 召回命中 ${out.picks.length} 条（${out.ms}ms，评估 ${out.evaluated}/${out.pool}${out.batched ? '，已按预算裁' : ''}）`)
      return
    }
    // ⭐ **如实记录抑制**（配套的可观测性要求：日后可回看"被抑制的召回里有多少是它搜不到的"）
    if (out.suppressed !== '') {
      put(out.suppressed, 'suppressed', base)
      opts.log(`${sid} 召回被抑制：${out.suppressed}（额度不计）`)
      return
    }
    put(out.skipped !== '' ? out.skipped : '模型未选出条目', 'skipped', base)
  } catch (err) {
    // 🔴 召回失败**绝不能影响主会话**
    opts.warn(`召回失败：${String(err)}`)
  }
}
