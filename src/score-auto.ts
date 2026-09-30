/**
 * ⭐⭐⭐ **轮末自动评分：钩子 + 四道门**（决策 177；2026-09-29 用户裁定）。
 *
 * ── 形态（用户裁定走甲方案）────────────────────────────────────────────────
 * `agent/turn-stopping` → **四道门** → `subagents.start('spawn', …)`（fire-and-forget）
 * → 子代理调 `memj_score_turn` → **等全部结果汇总后**把回执返回给子代理
 * ⇒ 用户可在会话列表里看到那个子会话、点进去看**过程与结果**。
 *
 * ── 🔴 三条纪律（照 `tag-auto.ts`，都是实测出来的）──────────────────────────
 * 1. **钩子只发起、绝不 await** —— `agent/turn-stopping` 是 **`@mode serial`**
 *    ⇒ 会被 await；在这里等子代理跑完（几秒到几十秒）会**拖住主会话的轮次结束**。
 * 2. **`agentOptions` 必须显式给** —— 不给就继承 parent 的 `requestHeader`
 *    （实测可能是关不掉思考的 `hy3`）。
 * 3. **失败只记日志** —— 钩子里的异常会毁掉整个轮次。
 *
 * @module dsh-memj/score-auto
 */
import type { Context } from '@deepseek-ai/cordis'
import type { MemjConfig } from './config.ts'
import { markPluginSpawned } from './subagent-origin.ts'
import { resolveProject } from './hot-watch.ts'

/** 一次自动评分发起的结果（**只用于日志/诊断**）。 */
export interface AutoScoreOutcome {
  started: boolean
  /** 没发起时的**可判定**原因（便于排障）。 */
  reason: string
  childId?: string
}

/**
 * ⭐⭐⭐ **四道门**（纯函数 ⇒ 可单测）。
 *
 * 🔴🔴 **第②道（不是子代理）是**防递归**的唯一防线** ——
 *    评分子代理自己也会跑完一轮 ⇒ 它结束时也会触发本钩子
 *    ⇒ 不去掉它就**无限起子代理**（每层再套一层）。
 *    ⭐ 判据取自 **`delegationDepth > 0`**（会话头字段，实测可用），
 *       ⚠️ 而**不是** `origin === 'subagent'` —— 后者对"主会话 LLM 起的子代理"
 *       与"插件起的子代理"**都成立**（实测四字段全同，见 `subagent-origin.ts`），
 *       而两者**都该被挡住**（它们的轮次不需要复盘）。
 *
 * ⚠️ **第③道（该轮有内容）不检查"有没有思考"** ——
 *    库内知识 `6ada1f56` 刚记下「触发条件不要依赖模型的可选行为」：
 *    若要求"该轮有 reasoning"，则**不输出思考的模型会让本功能一次都不触发**。
 *    ⇒ ⭐ 判据是"该轮有 `text` 输出"（输出是必然的）。
 * @param opts - 开关 / 会话深度 / 项目 / 是否有内容。
 * @returns 该不该起 + 可判定的理由。
 */
export function decideAutoScore(opts: {
  enabled: boolean
  /** 本会话的 `delegationDepth`（`> 0` = 它自己是子代理）。 */
  delegationDepth: number
  /** 判出来的项目（空 = 判不出）。 */
  project: string
  /** 该轮是否有可评分的内容（`text` 输出）。 */
  hasContent: boolean
}): { start: boolean; reason: string } {
  if (!opts.enabled) return { start: false, reason: '开关关闭（hotScoreOnTurnEnd=false）' }
  // 🔴🔴 防递归（见上）。
  if (opts.delegationDepth > 0) {
    return { start: false, reason: `本会话是子代理（delegationDepth=${opts.delegationDepth}）⇒ 不复盘子代理自己的轮次` }
  }
  if (opts.project === '') return { start: false, reason: '判不出项目（分数是按项目存的）' }
  if (!opts.hasContent) return { start: false, reason: '该轮没有可评分的内容' }
  return { start: true, reason: `项目=${opts.project}` }
}

/**
 * ⭐⭐⭐ **起一个子代理去跑 `memj_score_turn`**（fire-and-forget）。
 *
 * ⚠️ **prompt 里要带 `session` 与 `turn`** —— 子代理的 `exec.agent` 是**它自己**，
 *    不带参数的话工具会去评**子代理自己的那一轮**（那是错的）。
 * ⭐ 措辞**极简且单一任务**（甲方案：判断在工具内部做，子代理只做"调用 + 转达"）。
 * @param ctx - 插件上下文。
 * @param config - 配置（取评分模型）。
 * @param parent - 当前会话的活 agent。
 * @param sessionId - **被复盘的**会话 id。
 * @param turn - 被复盘的那一轮。
 * @returns 子会话 id；没发起时 `undefined`。
 */
export async function startScoreSubagent(
  ctx: Context,
  config: MemjConfig,
  parent: unknown,
  sessionId: string,
  turn: number,
): Promise<string | undefined> {
  try {
    const subagents = ctx.get('subagents') as
      | { start?: (name: string, req: unknown) => Promise<{ id: string; result: Promise<unknown>; dispose: () => Promise<void> }> }
      | undefined
    if (subagents?.start === undefined) return undefined
    // ⭐ 子代理的模型：**两个都给了才用**（⚠️ 只给一个会拼出半个 `provider/model`）。
    //    🔴 **绝不能"不给 `agentOptions`"** —— 那样会继承 parent 的 `requestHeader`
    //       （实测可能是关不掉思考的 `hy3` ⇒ 子代理输出 0 字符、直接失败）。
    //    ⭐ 两个都空 ⇒ **显式走"跟随主会话"那条路**（与 `tagNormalize*` 同款做法）。
    const route =
      config.hotScoreSubagentProvider !== '' && config.hotScoreSubagentModel !== ''
        ? { provider: config.hotScoreSubagentProvider, model: config.hotScoreSubagentModel }
        : undefined
    // ⚠️ **独立 AbortController**：借轮次的 signal 会在轮次结束时连带取消子代理。
    const ctrl = new AbortController()
    const run = await subagents.start('spawn', {
      label: `memj：复盘第 ${turn} 轮`,
      prompt: [
        {
          type: 'text',
          text:
            `调用 memj_score_turn 工具（参数：session 用「${sessionId}」，turn 用 ${turn}），` +
            '然后把工具回执**原样**返回给我。只做这一件事，不要做别的操作。',
        },
      ],
      ...(parent !== undefined ? { parent } : {}),
      signal: ctrl.signal,
      ...(route !== undefined ? { agentOptions: route } : {}),
    })
    // 🔴 **刻意不 await `run.result`**（serial 钩子会拖住轮次结束）。
    void run.result.catch(() => {})
    // ⭐ 记下"这个子会话是插件发起的" ⇒ 它**不继承**父会话项目绑定
    //    （用户 2026-09-29 裁定；它评的是父会话的轮次，自己不需要项目语境）。
    markPluginSpawned(String(run.id))
    return String(run.id)
  } catch (err) {
    try { console.log(`[dsh-memj/score-auto] 起子代理失败：${String(err)}`) } catch { /* ignore */ }
    return undefined
  }
}

/**
 * ⭐⭐⭐ **挂上"轮末自动评分"的钩子**。
 *
 * 🔴 **开关关着 ⇒ 一个监听器都不挂**（照 `registerTagAutoNormalize`）——
 *    "挂上去再判 false"会**仍在事件链上占位**，且诊断行变成**假绿**。
 * @param opts - `ctx` 与配置。
 * @returns 是否真的挂上了。
 */
export function registerAutoScore(opts: { ctx: Context; config: MemjConfig }): boolean {
  const { ctx, config } = opts
  if (!config.hotScoreOnTurnEnd) return false
  // ⚠️ **用 `console.log` 而不是 `ctx.logger.info`** —— 照 `en-index.ts` / `tag-auto.ts`。
  //    🔴 实测 `ctx.logger` 进不了实例日志（`active-<port>.log`），
  //    而本模块**四道门每道都会静默跳过** ⇒ 没日志就分不清"没触发"与"被门挡住"。
  const log = (m: string): void => {
    try { console.log(`[dsh-memj/score-auto] ${m}`) } catch { /* 日志失败不影响主流程 */ }
  }
  ctx.on('agent/turn-stopping', async (payload: { agent?: { id?: unknown }; turn?: unknown }): Promise<void> => {
    try {
      const r = await maybeAutoScore(ctx, config, payload)
      log(r.started ? `started: ${r.reason}` : `skipped: ${r.reason}`)
    } catch (err) {
      // 🔴 钩子里的异常会毁掉整个轮次 ⇒ 必须吞掉。
      log(`THREW: ${String(err)}`)
    }
  })
  return true
}

/**
 * ⭐⭐ **轮末入口**（钩子调它；也可被测试直接调）。
 *
 * ⚠️ **它必须"短"** —— `turn-stopping` 是 serial 钩子。
 *    这里只做：读会话头（拿 depth，一次 I/O）+ 判项目（可能读日志）+ **发起**。
 *    ⚠️ 判项目（`resolveProject`）确实可能读会话日志（重）——
 *    但那**只在"开关开着"时才发生**，且它是**判据的必要输入**
 *    （分数按项目存，判不出就没法评）。⭐ 这也是为什么**默认关**是合理的默认值。
 * @param ctx - 插件上下文。
 * @param config - 配置。
 * @param payload - 钩子载荷。
 * @returns 结论（供日志与测试）。
 */
export async function maybeAutoScore(
  ctx: Context,
  config: MemjConfig,
  payload: { agent?: { id?: unknown }; turn?: unknown },
): Promise<AutoScoreOutcome> {
  const sessionId = typeof payload?.agent?.id === 'string' ? payload.agent.id : ''
  const turnRaw = payload?.turn
  const turn = typeof turnRaw === 'number' ? turnRaw : -1
  if (sessionId === '') return { started: false, reason: '拿不到会话 id' }
  if (turn < 0) return { started: false, reason: '拿不到轮次号' }
  try {
    // ── 第②道门的输入：本会话是不是子代理 ──
    const depth = await delegationDepthOf(ctx, sessionId)
    if (depth > 0) {
      // ⚠️ **早退**（省掉后面的判项目 —— 它可能读会话日志，重）。
      //    🔴 这一条必须在**任何重 I/O 之前**，因为子代理的轮次结束频繁。
      return { started: false, reason: `本会话是子代理（delegationDepth=${depth}）⇒ 不复盘` }
    }
    // ── 第③道门的输入：判项目 ──
    const r = await resolveProject(ctx, sessionId)
    // ── 第④道门的输入：该轮有没有内容（用"有没有 text 输出"当判据，见 `decideAutoScore`）──
    const hasContent = await turnHasOutput(ctx, sessionId, turn)
    const d = decideAutoScore({
      enabled: config.hotScoreOnTurnEnd,
      delegationDepth: depth,
      project: r.project,
      hasContent,
    })
    if (!d.start) return { started: false, reason: d.reason }
    const childId = await startScoreSubagent(ctx, config, payload.agent, sessionId, turn)
    if (childId === undefined) return { started: false, reason: '起子代理失败（见日志）' }
    return { started: true, reason: `项目=${r.project}，已起子代理 ${childId}`, childId }
  } catch (err) {
    try { console.log(`[dsh-memj/score-auto] 失败：${String(err)}`) } catch { /* ignore */ }
    return { started: false, reason: `异常：${String(err)}` }
  }
}

/**
 * 读本会话的 `delegationDepth`（会话头字段）。
 *
 * ⚠️ **读不到时回 `0`** —— 那表示"当作顶层会话处理"。
 *    🔴 **这个默认值是"偏向触发"的**，选它是因为：
 *    若回一个大数（当作子代理），一旦读取失败 ⇒ **功能永不触发**（更隐蔽）；
 *    而回 0 的最坏后果是"一个子代理的轮次被复盘了一次"（无害：它只是多算一次分）。
 *    ⭐ 判据：**`0` 的失败模式更轻**（本项目一贯的"失败模式不对称"取舍）。
 * @param ctx - 插件上下文。
 * @param sessionId - 会话 id。
 * @returns `delegationDepth`（读不到时 0）。
 */
async function delegationDepthOf(
  ctx: { get: (name: string) => unknown },
  sessionId: string,
): Promise<number> {
  try {
    const q = ctx.get('sessionQuery') as
      | { observeSession?: (id: string, o?: { projectionMode?: string }) => Promise<unknown> }
      | undefined
    if (q?.observeSession === undefined) return 0
    let obs: unknown
    try {
      obs = await q.observeSession(sessionId, { projectionMode: 'none' })
      const h = (obs as { header?: { delegationDepth?: unknown } })?.header
      const d = h?.delegationDepth
      return typeof d === 'number' && Number.isFinite(d) ? d : 0
    } finally {
      try {
        (obs as { [Symbol.dispose]?: () => void } | undefined)?.[Symbol.dispose]?.()
      } catch { /* 释放失败不影响结论 */ }
    }
  } catch {
    return 0
  }
}

/**
 * 该轮有没有 `text` 输出（**判据不依赖思考**，见 `decideAutoScore`）。
 *
 * ⚠️ 读不到日志时回 `true` —— **偏向触发**：真正的内容长度检查在工具内部
 *    （`hotScoreMinChars`），那里有**纯文本**可量；这里只是"值不值得起子代理"的粗筛。
 * @param ctx - 插件上下文。
 * @param sessionId - 会话 id。
 * @param turn - 轮次号。
 * @returns 有输出时 `true`。
 */
async function turnHasOutput(
  ctx: { get: (name: string) => unknown },
  sessionId: string,
  turn: number,
): Promise<boolean> {
  try {
    const { readTurnContent } = await import('./score-turn.ts')
    const text = await readTurnContent(ctx, sessionId, turn)
    return text !== ''
  } catch {
    return true
  }
}
