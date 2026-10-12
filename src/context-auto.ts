/**
 * ⭐⭐⭐ **轮末把上下文占用率报给模型**（决策 226；2026-10-12 用户裁定）。
 *
 * ── 用户的原话（这是本模块存在的全部理由）──────────────────────────────────
 * *"有脚本在每轮结束的时候，主动注入上下文占用率，提示模型，如果模型发现提示词有
 *   基于上下文占用率需要去做动作的情况，那就做动作。如果没有的话，就静默忽略。
 *   这能做到吗？"*
 *
 * ⇒ ⭐ **能。而且这个设计比"插件自己判阈值"更好**：它把「要不要动作」**还给模型**，
 *    插件**只提供事实**。于是「到 60% 就异步沉淀」这类规则可以**完全写在提示词里**，
 *    用户自己定阈值、自己定动作 —— 这正是本项目「一切都开放」卖点的一部分。
 *
 * ── 为什么必须是 `agent.inject()`，不能是 `followup()`（本模块的硬约束）──────
 * 读 `dsh-agent` 的类型文档原文（`commands.ts` 里已摘过）：
 * · `inject()` —— *"Queue model-facing context for the next pre-step **without waking
 *   the driver**… **idle drivers leave it pending**"* ⇒ ⭐ **不额外烧一轮**；
 * · `followup()` —— *"Queue an ordinary follow-up turn **and wake the driver**"*
 *   ⇒ 🔴 **每轮都会强行多跑一轮**，模型会"自言自语"一次。
 *
 * ⇒ ⭐ **本模块只用 `inject()`**。用 `followup()` 会让"每轮报一次占用"变成
 *   "每轮多跑一轮"，那是灾难。
 *
 * ⚠️ 代价（用户已知情并认可）：**`inject` 在空闲时不唤醒** ⇒
 *   轮末注入的那条，跟着**下一轮的 pre-step** 到达模型。轮末报、下一轮第一步看到 —— 正合用。
 *
 * ── 🔴 三条纪律（照 `score-auto.ts` / `tag-auto.ts`，都是实测出来的）──────────
 * 1. **钩子只发起、绝不 await 慢操作** —— `agent/turn-stopping` 是 **`@mode serial`**
 *    ⇒ 会被 await；在这里做重 I/O 会拖住主会话的轮次结束。
 *    ⭐ 本模块**只做一次同步测量**（`tokenMeter.measure` 是**纯回放、无模型调用**，
 *    见其 README：*"结果确定且不进行模型调用"*）⇒ 成本可控。
 * 2. **失败只记日志** —— 钩子里的异常会毁掉整个轮次。
 * 3. **开关关着 ⇒ 一个监听器都不挂**（照既有的四处）——
 *    不是"挂上去再判 false"：后者仍在事件链上占位，且诊断行会变成**假绿**。
 *
 * ── ⚠️ 一条与 `score-auto` 不同的地方（别照抄错）────────────────────────────
 * `score-auto` 走 `ctx.subagents.start('spawn', …)`（起子代理）；
 * 本模块**不起任何东西**，只是 `agent.inject()` 一条消息 ⇒ **同步完成、无 I/O 等待**。
 *
 * @module dsh-memj/context-auto
 */

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { MemjConfig } from './config.ts'
import { readContextUsageWithWindow, renderContextUsage } from './context-report.ts'

/** 一次轮末注入的结果（**只用于日志与测试**）。 */
export interface AutoContextOutcome {
  /** 是否真的注入了。 */
  injected: boolean
  /** 未注入时的**可判定**原因（便于排障；本项目一贯的"报数要点名"）。 */
  reason: string
  /** 注入时带上，供测试断言。 */
  percent?: number
}

/** 注入消息的分节名（溯源用；照 `commands.ts` 的 `submitContext`）。 */
const SECTION_NAME = '上下文占用'

/**
 * 🔴 **"上次报过的百分比"**（每会话一个）—— 边沿触发要用。
 *
 * ⚠️ **只在内存**（进程重启即失）。⭐ 可接受：重启后第一轮会重报一次，
 *    而那**正是"新状态"**（进程换了、模型可能也换了），重报一次无害。
 * ⚠️ 不落盘的理由：它只是个**去噪用的记忆**，丢了最坏是"多报一条"，不值得为它引入 I/O。
 */
const lastReportedPercent = new Map<string, number>()

/** 从会话对象取 id（读不到时回 `''`，那时边沿判据退化成"每会话至多一次"）。 */
function sessionIdOf(session: unknown): string {
  try {
    const id = (session as { id?: unknown } | undefined)?.id
    return typeof id === 'string' ? id : ''
  } catch {
    return ''
  }
}

/** 记住"这次报的是多少"（`percent` 缺席时记 `-1`，表示"报过绝对值了"）。 */
function rememberReportedPercent(sid: string, percent: number | undefined): void {
  try {
    lastReportedPercent.set(sid, percent === undefined ? -1 : percent)
  } catch { /* 记不住不影响主流程 */ }
}

/**
 * ⭐⭐⭐ **挂上"轮末报上下文占用"的钩子**。
 *
 * @param opts - `ctx` 与配置。
 * @returns 是否真的挂上了（供启动诊断区分 `registered` / `skipped(disabled)`）。
 */
export function registerContextReport(opts: { ctx: Context; config: MemjConfig }): boolean {
  const { ctx, config } = opts
  if (!config.contextReportOnTurnEnd) return false
  // ⚠️ 用 `console.log` 而不是 `ctx.logger.info` —— 照 `score-auto.ts` / `en-index.ts`。
  //    实测 `ctx.logger` 进不了实例日志（`active-<port>.log`），
  //    而这个功能**大部分轮次都会静默跳过**（未过阈值 / 拿不到测量）
  //    ⇒ 没日志就分不清"没触发"与"被门挡住"。
  const log = (m: string): void => {
    try { console.log(`[dsh-memj/context-auto] ${m}`) } catch { /* 日志失败不影响主流程 */ }
  }
  ctx.on('agent/turn-stopping', async (payload: { agent?: Agent }): Promise<void> => {
    try {
      // ⚠️ `reportContextUsage` 现在是 async（拿窗口要向 `ctx.llm.resolveModelInfo` 问一次）。
      //    ⭐ 这一步**很快**（一次本地查表，且同模型会命中适配器缓存）⇒ 不违反
      //    "serial 钩子里别 await 慢操作"那条纪律（它**不起子代理、不发网络请求**）。
      const r = await reportContextUsage(ctx, config, payload?.agent, log)
      // ⭐ **未注入也记一行**（"为什么没报"是排障主战场）；
      //    真注入时 `reportContextUsage` 内部已打过一行更详细的。
      if (!r.injected) log(`skipped: ${r.reason}`)
    } catch (err) {
      // 🔴 钩子里的异常会毁掉整个轮次 ⇒ 必须吞掉。
      log(`THREW: ${String(err)}`)
    }
  })
  return true
}

/**
 * ⭐⭐⭐ **读本会话的 `delegationDepth`**（`> 0` = 它自己是子代理）。
 *
 * ── 为什么这条如此重要 ──────────────────────────────────────────────────────
 * 用户那条演示规则是「占用 ≥60% ⇒ fork 子代理去 handoff」，而 `subagent_fork`
 * **继承本会话上下文** ⇒ 子代理一出生就带着同样高的占用 ⇒ 它也会收到注入
 * ⇒ 再 fork ⇒ **递归**。⚠️ 不报错，只是子会话越滚越多。
 * ⇒ **本函数就是那道"防递归的唯一防线"**（与 `score-auto` 的第②道门同一判据）。
 *
 * ── 怎么读（比 `score-auto` 更省）────────────────────────────────────────────
 * ⭐ `delegationDepth` 就在 **`session.header`** 上（`SessionHeader.delegationDepth`，
 *    读 `@deepseek-ai/dsh-session` 的 `types.d.ts` 确认："absent (zero) for a
 *    top-level session, parent depth + 1 for a subagent child"）
 *    ⇒ **同步可读**，不必像 `score-auto` 那样走 `sessionQuery.observeSession()` 那趟 I/O。
 *    ⚠️ 这对 `agent/turn-stopping`（`@mode serial`，会被 await）尤其要紧。
 *
 * ⚠️ **读不到时回 `0`（= 当作顶层会话）** —— 与 `score-auto` 的取舍一致：
 *    回 0 的最坏后果是"子代理多报了一次占用"（无害）；
 *    回大数则一旦读取失败就**永久不报**（更隐蔽）。
 *
 * @param session - `agent.session`。
 * @returns `delegationDepth`；读不到时 `0`。
 */
function delegationDepthOf(session: unknown): number {
  try {
    const h = (session as { header?: { delegationDepth?: unknown } } | undefined)?.header
    const d = h?.delegationDepth
    return typeof d === 'number' && Number.isFinite(d) ? d : 0
  } catch {
    return 0
  }
}

/**
 * ⭐⭐ **轮末入口**（钩子调它；也可被测试直接调）。
 *
 * 🔴 顺序刻意如此：**开关 → agent 形状 → 读占用（廉价、纯回放）→ 阈值 → 才注入**。
 *    每一步都是"可判定地早退 + 给出原因"，便于在日志里分清是哪一道挡的。
 *
 * @param ctx - 插件上下文（要 `ctx.get('tokenMeter')`）。
 * @param config - 配置。
 * @param agent - 钩子载荷里的 agent（要它的 `session` 与 `inject`）。
 * @param log - 日志函数（测试可传空实现）。
 * @returns 结论。
 */
export async function reportContextUsage(
  ctx: { get: (name: string) => unknown },
  config: MemjConfig,
  agent: Agent | undefined,
  log: (m: string) => void = (): void => {},
): Promise<AutoContextOutcome> {
  if (!config.contextReportOnTurnEnd) return { injected: false, reason: '开关关着' }
  if (agent === undefined || agent === null) return { injected: false, reason: '载荷里没有 agent' }
  if (typeof agent.inject !== 'function') return { injected: false, reason: 'agent 没有 inject 方法' }

  // ── ⓪ 🔴🔴 **防递归**（2026-10-12 补；这是本模块**最要紧**的一道门）──
  //
  // **为什么必须有**：用户那条演示规则的形态是
  //    「占用 ≥60% ⇒ fork 一个子代理去做 handoff」。
  // 🔴 而 `subagent_fork` **继承本会话上下文** ⇒ 子代理**一出生就带着同样高的占用**
  //    ⇒ 它**同样会收到本条注入** ⇒ 按同一条规则**再 fork 一个** ⇒ **无限递归**。
  //    ⚠️ 而且它**不报错**（只会看到子会话越来越多、token 猛烧）。
  //
  // ⭐ 与 `score-auto` 的「第②道门」**同一判据**（那里明写它是"防递归的唯一防线"）。
  // ⚠️ **提示词里也写了"你自己是子代理就别触发"，但那只靠模型自觉** ——
  //    模型漏检一次就炸 ⇒ **插件侧这道门才是真的防线**。
  //
  // ⚠️ 读不到时按 `0`（= 当作顶层会话）—— 与 `score-auto` 的取舍一致：
  //    回 0 的最坏后果是"子代理多报了一次占用"（无害）；
  //    回大数则一旦读取失败就**永久不报**（更隐蔽）。
  // ⭐ 好在 `delegationDepth` 就在 `session.header` 上 ⇒ **同步可读**，不用查日志。
  const depth = delegationDepthOf(agent.session)
  if (depth > 0) {
    return { injected: false, reason: `本会话是子代理（delegationDepth=${depth}）⇒ 不报（防递归）` }
  }

  // ── ① 读占用 ──
  // ⭐ 走 `readContextUsageWithWindow`：投影不给窗口时，**再向 `ctx.llm.resolveModelInfo`
  //    问一次**（本机实测投影的 `contextWindow` 恒为 null ⇒ 只走投影会永久失效）。
  const opts = (agent.options ?? {}) as { provider?: unknown; model?: unknown }
  const provider = typeof opts.provider === 'string' ? opts.provider : ''
  const model = typeof opts.model === 'string' ? opts.model : ''
  const usage = await readContextUsageWithWindow(ctx, agent.session, provider, model)
  if (usage === undefined) {
    return { injected: false, reason: '拿不到上下文测量（sessionProjections / contextPressure 不可用）' }
  }

  // ── ② 阈值门 ──
  // 🔴🔴 **2026-10-12 修正一处设计缺陷**：原来"无窗口 ⇒ 整条不报"，
  //    而实测**本路由就是不上报窗口**（`/api/hot` 的 `contextWindow` 恒为 null）
  //    ⇒ 那条规则等于**永久关闭这个功能**，且不报错（用户看到的就是"什么都没发生"）。
  //    ✅ 改成：**有窗口就用百分比判阈值；没有窗口就退回"只看绝对值"** ——
  //       绝对值对"到 X% 就做事"没判断价值，但**如实报出来**总比**什么都不说**好，
  //       而且它能让用户看出"这个路由不给窗口"这件事。
  //    ⚠️ 阈值门此时**无法生效**（没有分母）⇒ 直接放行，并在文本里说明。
  if (usage.percent !== undefined && usage.percent < config.contextReportMinPercent) {
    return { injected: false, reason: `占用 ${usage.percent}% < 阈值 ${config.contextReportMinPercent}%` }
  }

  // ── ②′ 🔴🔴 **边沿触发**（2026-10-12 补；治"每轮刷屏"）──
  //
  // **现象**：`contextReportMinPercent` 是**电平**判据 —— 一旦过线，
  //   只要没掉下去，**每一轮都会报**。而占用在长会话里**单调上涨**
  //   ⇒ 从过线那一刻起，**每轮一条，永不停止**。
  //   ⚠️ 实测：用户连收 **十几条**"不动作"的注入；而且它**自己在推高占用**
  //      （注入文本占 token ⇒ 占用更高 ⇒ 下一轮更过线）⇒ **自激**。
  //   ⭐ 更糟的是：**规则②「同一会话至多一次」一旦成立，后续每一条都必然是空操作**
  //      ⇒ 当前形态 = **保证无效的每轮噪音**。
  //
  // **修法**：改成**边沿触发** —— 只在"**比上次报过的高出一个台阶**"时才报。
  //   ⭐ 台阶 = `contextReportStepPercent`（默认 10）：60% 报一次、70% 再报一次……
  //   ⇒ 一条长会话总共报几次，而不是每轮一次。
  //   ⚠️ **占用回落再涨回去** ⇒ 会重报（那是真实的状态变化，该报）。
  //
  // ⚠️ 记忆在**内存**（每会话一个数）⇒ 重启即失。可接受：
  //    重启后第一轮会重报一次（无害，而且那正是"新状态"）。
  const sid = sessionIdOf(agent.session)
  const lastReported = lastReportedPercent.get(sid)
  if (usage.percent !== undefined && lastReported !== undefined) {
    if (usage.percent - lastReported < config.contextReportStepPercent) {
      return {
        injected: false,
        reason: `占用 ${usage.percent}% 距上次报过的 ${lastReported}% 不足一阶（${config.contextReportStepPercent}%）⇒ 不重复报`,
      }
    }
  } else if (usage.percent === undefined && lastReported === undefined) {
    // 无百分比（本路由不给窗口）：没有"台阶"可比 ⇒ 退回**每会话至多一次**。
    // ⚠️ 不这样兜的话，无窗口路由会退回"每轮都报"那个老毛病。
  } else if (usage.percent === undefined && lastReported !== undefined) {
    return { injected: false, reason: '本路由无窗口（无台阶可比）且已报过一次 ⇒ 不重复报' }
  }

  // ── ③ 注入（**只提供事实，不规定动作**）──
  // ⚠️ `inject()` 收的是 **`UserMessage`**（`runtime-types.d.ts:209`），
  //    不是裸对象 ⇒ 必须走 `createUserMessage`（照 `commands.ts` 的 `submitContext`）。
  const text = renderContextUsage(usage)
  const message = createUserMessage({
    content: [{ type: 'text', text } as ContentBlock],
    source: {
      kind: 'plugin:dsh-memj',
      form: 'instructions',
      sections: [{ name: SECTION_NAME, text }],
    },
  })
  agent.inject(message)
  // ⭐ 记下"这次报的是多少"，供下一轮的边沿判据用。
  rememberReportedPercent(sid, usage.percent)
  // ⚠️ `percent` 可能是 `undefined`（本路由不给窗口）⇒ 那句日志要如实写成 `—`，
  //    不能拼成 "undefined%"（那看着像 bug，而其实是数据源的已知边界）。
  const pct = usage.percent === undefined ? '（无窗口）' : `${usage.percent}%`
  log(`injected: ${pct}（source=${usage.source}，used=${usage.used}，window=${usage.window ?? '—'}）`)
  return {
    injected: true,
    reason: usage.percent === undefined ? `占用 ${usage.used}（无窗口）` : `占用 ${usage.percent}%`,
    ...(usage.percent === undefined ? {} : { percent: usage.percent }),
  }
}
