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
