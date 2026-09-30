/**
 * ⭐⭐⭐ **轮次结束时的自动标签规范化**（决策 165）。
 *
 * ── 一句话 ────────────────────────────────────────────────────────────────
 * 某一轮里**落了知识** ⇒ 轮次结束时，**由插件**起一个 **spawn 子代理**去跑
 * `memj_normalize_tags`。用户在会话列表里能看到那个子会话、能点进去看结果。
 *
 * ── 为什么是"插件自己发起"（用户原话）────────────────────────────────────
 * > *"不用主会话去调用了。直接在有知识沉淀的轮次结束后，校验，如果需要调用工具的话。
 * >   由插件发起子代理调用去处理。"*
 *
 * ⭐ 这比"在 `handoff` 回执里催模型去调"干净得多：
 *   插件自己的动作与 `handoff` 的收尾指令（"到此为止、不要自行动作"，决策 61）
 *   **不冲突** —— 那条管的是**模型**，这条是**插件**在动。
 *
 * ── 🔴 三条硬约束（都是实测/踩过的）──────────────────────────────────────
 * 1. **钩子必须 fire-and-forget**：`agent/turn-stopping` 是 **`@mode serial`**
 *    ⇒ 会被 **await**。若在这里 `await` 子代理跑完（几十秒），
 *    **会拖住主会话的轮次结束**（用户感到卡顿）。
 *    ⇒ 只发起、立刻返回；失败在 catch 里吞掉。
 * 2. **`agentOptions` 必须显式给**（⚠️ 实测：不给就继承主会话模型，
 *    而主会话可能是 `hy3` —— **它关不掉思考**，裁决会输出 0 字符直接失败）。
 * 3. **绝不能影响 handoff 成败**：本模块所有失败都静默吞掉 + 记日志。
 *
 * ── 三层门（全在代码里，不是提示词）──────────────────────────────────────
 * | 门 | 判据 | 为什么需要 |
 * |---|---|---|
 * | ① 开关 | `config.tagNormalizeOnHandoff` | 用户要求可关；关掉就**什么都不做** |
 * | ② 本次落过知识 | 本会话的 `handoff` `tool/call` + 落盘结果 | 没沉淀就没必要规范 |
 * | ③ 没重复调过 | 本会话【上次 handoff 之后】是否已有 `memj_normalize_tags` 的 `tool/call` | **一个 turn 可能落多次 handoff** ⇒ 没去重会**起好几个子代理** |
 *
 * 🔴 **③ 的判据取自【会话日志】**（`tool/call` 事件），与
 *    `parseHandoffFromEvents` 同一条通道 —— 那是**可判定的机制**，
 *    不是"让模型自觉"（本项目已多次栽在"判断类规范不生效"上）。
 *
 * @module dsh-memj/tag-auto
 */
import type { Context } from '@deepseek-ai/cordis'
import type { MemjConfig } from './config.ts'
// ⭐⭐⭐ 决策 167：判据改成"插件自己记的账"（不再读会话日志 —— 详见文件头说明）。
import {
  decideTagAuto,
  loadTagAutoState,
  markNormalized,
  saveTagAutoState,
  type TagAutoState,
} from './tag-auto-state.ts'
import { markPluginSpawned } from './subagent-origin.ts'

/** 自动规范化的结果（**只用于日志/诊断**，不影响任何人）。 */
export interface AutoNormalizeOutcome {
  /** 是否真的发起了子代理。 */
  started: boolean
  /** 没发起时的原因（**可判定**的一句话，便于排障）。 */
  reason: string
  /** 发起成功时的子会话 id。 */
  childId?: string
}

/**
 * ⭐⭐⭐ **起一个子代理去跑 `memj_normalize_tags`**（fire-and-forget）。
 *
 * 🔴 三条纪律（见模块头）：**不 await result** / **显式给 agentOptions** /
 *    **失败只记日志**。
 * @param ctx - 插件上下文。
 * @param config - 配置（取裁决模型）。
 * @param parent - 当前会话的活 agent（子代理的 parent）。
 * @returns 子会话 id；没发起时 `undefined`。
 */
export async function startNormalizeSubagent(
  ctx: Context,
  config: MemjConfig,
  parent: unknown,
): Promise<string | undefined> {
  try {
    const subagents = ctx.get('subagents') as
      | { start?: (name: string, req: unknown) => Promise<{ id: string; result: Promise<unknown>; dispose: () => Promise<void> }> }
      | undefined
    if (subagents?.start === undefined) return undefined
    // ⭐ 显式指定模型（**实测必需**：不给就继承主会话模型，可能是关不掉思考的 hy3）。
    //   ⚠️ 用**与面板裁决模型一致**的那一组（用户 2026-09-28 裁定）。
    const route =
      config.tagNormalizeProvider !== '' && config.tagNormalizeModel !== ''
        ? { provider: config.tagNormalizeProvider, model: config.tagNormalizeModel }
        : undefined
    // ⚠️ 超时要给足：裁决要读全库 tag + 正文，实测一次 2~10 秒。
    //    这里用一个**独立**的 AbortController（不能借用轮次的 signal——
    //    轮次一结束它就 abort，子代理会被连带取消）。
    const ctrl = new AbortController()
    const run = await subagents.start('spawn', {
      label: 'memj：规范化标签',
      prompt: [
        {
          type: 'text',
          // ⚠️ 措辞要**极简且单一任务**：子代理只需转达工具结果，
          //    **不需要它思考**（判断在工具内部做，甲方案）。
          text:
            '调用 memj_normalize_tags 工具（参数：includeBody 用默认值即可），' +
            '然后把工具回执**原样**返回给我。只做这一件事，不要做别的操作。',
        },
      ],
      ...(parent !== undefined ? { parent } : {}),
      signal: ctrl.signal,
      ...(route !== undefined ? { agentOptions: route } : {}),
    })
    // 🔴 **刻意不 await `run.result`**（`agent/turn-stopping` 是 serial 钩子，
    //    await 会拖住主会话的轮次结束）。失败也不影响主流程。
    void run.result.catch(() => {})
    // ⭐⭐⭐ **记下"这个子会话是我发起的"**（用户 2026-09-29 裁定）——
    //    「插件发起的子代理**不继承**父会话项目绑定」（它只是工具的一个壳，
    //     没有项目语境）；而「主会话 LLM 发起的子代理**继承**」。
    //    ⚠️ DSH 的会话头**区分不出这两种**（实测四个字段全同）⇒ 只能自己记账。
    //    ⚠️ 必须**在拿到 id 后立刻**记 —— 子代理的首个 `pre-step` 可能几乎同时发生。
    markPluginSpawned(String(run.id))
    return String(run.id)
  } catch (err) {
    // ⚠️ 起子代理失败**绝不能影响 handoff 成败**。
    try { console.log(`[dsh-memj/tag-auto] 起子代理失败：${String(err)}`) } catch { /* ignore */ }
    return undefined
  }
}

/**
 * ⭐⭐⭐ **挂上"轮次结束自动规范化"的钩子**（决策 165）。
 *
 * ⚠️ **形态照 `registerHotInjection`**：直接 `ctx.on(...)`、不套 `ctx.effect`
 *    —— **与既有实现保持一致**（本项目铁律：引入新写法前先看同载体里有没有人这么写）。
 *
 * 🔴 **开关关着 ⇒ 一个监听器都不挂**（返回 `false`，让调用方能如实记诊断行）。
 *    ⭐ 这与"挂上去再在回调里判 false"不同：后者**仍在事件链上占位**，
 *    而且诊断行会变成**假绿**（"已注册"而实际不工作）。
 * @param opts - `ctx` 与配置。
 * @returns 是否真的挂上了。
 */
export function registerTagAutoNormalize(opts: {
  ctx: Context
  config: MemjConfig
}): boolean {
  const { ctx, config } = opts
  if (!config.tagNormalizeOnHandoff) return false
  // ⚠️ **用 `console.log` 而不是 `ctx.logger.info`** —— 照 `en-index.ts` 的做法。
  //    🔴 我第一版用了 `ctx.logger?.info`，**端到端实测发现它进不了实例日志**
  //    （`active-<port>.log` 里只有 en-index / active 那些 `console.log` 的行）
  //    ⇒ 排障时"看不到它跑没跑"，而功能其实是好的 —— **可观测性缺口**。
  //    ⚠️ 这也正是本模块最需要日志的地方：三层门**每一层都会静默跳过**，
  //       没有日志就分不清"没触发"与"被门挡住"（本项目一贯的可观测性要求）。
  const log = (m: string): void => {
    try { console.log(`[dsh-memj/tag-auto] ${m}`) } catch { /* 日志失败不影响主流程 */ }
  }
  // ⚠️ `agent/turn-stopping` 是 **`@mode serial`** ⇒ 会被 **await**。
  //    🔴 所以本回调**只做"读记账 + 发起"**，**绝不 await 子代理跑完**
  //       （那会拖住主会话的轮次结束几十秒，用户感到卡顿）。
  //    ⭐ 决策 167 起**不再读会话日志**（165 那版每轮都要解压一个 4.7MB 的日志，
  //       而读到的判据还是错的 —— 详见 `tag-auto-state.ts` 的文件头）。
  ctx.on('agent/turn-stopping', async (payload: { agent?: { id?: unknown }; turn?: unknown }): Promise<void> => {
    try {
      const r = await maybeAutoNormalize(ctx, config, payload)
      // ⭐ **"没起"也要如实记** —— 否则排障时分不清"没触发"与"被门挡住"。
      log(r.started ? `started: ${r.reason}` : `skipped: ${r.reason}`)
    } catch (err) {
      // 🔴 钩子里的异常会毁掉整个轮次 ⇒ 必须吞掉。
      log(`THREW: ${String(err)}`)
    }
  })
  return true
}

/**
 * ⭐⭐⭐ **轮次结束时的入口**（`agent/turn-stopping` 钩子调它）。
 *
 * ⚠️ **它不该被 await 很久** —— 读一个几十字节的记账文件（本地、极快），
 *    起子代理那步是 fire-and-forget。
 *
 * 🔴 **判据（决策 167，第二次修正 165）**：只看记账里的 **`pending`** ——
 *    "**有一次落知识还没被规范化**"。⚠️ 语义正好是
 *    "**落知识那一轮的轮次结束时，起一次**"。
 *    ⭐ **不比对轮次号**：编号从两处来（`turnOf()` 投影 vs `payload.turn`），
 *    而 `turnOf()` 拿不到时回 `-1` ⇒ 会**静默永不触发**（比重复触发更隐蔽）。
 * @param ctx - 插件上下文。
 * @param config - 配置。
 * @param payload - 钩子载荷（`agent`；`turn` 只作诊断）。
 * @returns 结论（供日志与测试）。
 */
export async function maybeAutoNormalize(
  ctx: Context,
  config: MemjConfig,
  payload: { agent?: { id?: unknown }; turn?: unknown },
): Promise<AutoNormalizeOutcome> {
  const enabled = config.tagNormalizeOnHandoff
  const sessionId = typeof payload?.agent?.id === 'string' ? payload.agent.id : ''
  try {
    const st = await loadTagAutoState()
    // ⚠️ 会话 id 的形态：账里存的是 `session-<uuid>`（`payload.agent.id`），
    //    而钩子载荷里的 id 可能不带前缀 ⇒ 两种键都试一次（只读，无副作用）。
    const prefixed = `session-${sessionId}`
    const key = st.sessions[sessionId] !== undefined ? sessionId : prefixed
    const rec = st.sessions[key]
    const d = decideTagAuto({ enabled, record: rec })
    if (!d.start) return { started: false, reason: d.reason }
    const childId = await startNormalizeSubagent(ctx, config, payload.agent)
    if (childId === undefined) return { started: false, reason: '起子代理失败（见日志）' }
    // 🔴 **起成功后立刻消费标记** —— 否则**后续每一轮**都会再起一个
    //    （这正是决策 165 那个 bug 的形态）。
    await saveTagAutoState(markNormalized(st, key))
    return { started: true, reason: `已起子代理 ${childId}`, childId }
  } catch (err) {
    // ⚠️ 同上：本模块的任何失败都不得外溢。
    try { console.log(`[dsh-memj/tag-auto] 失败：${String(err)}`) } catch { /* ignore */ }
    return { started: false, reason: `异常：${String(err)}` }
  }
}
