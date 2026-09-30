/**
 * ⭐⭐ **host 侧硬校验闸门**（决策 103 / §3.11.6）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * 用户质疑：**"现在的设计有很大随机性，指令遵循一旦出错就会出错"**。
 * 提示词/工具描述都是**软约束**（靠模型遵守），而模型**会出错**——
 * 实测过的真实故障：`body` 被中途截断、参数漏填、漏传整个参数。
 *
 * ⇒ 这里把「**schema 表达不了的**」那部分校验，从提示词搬到**程序**：
 *
 * | | 提示词约束 | **本闸门** |
 * |---|---|---|
 * | token | **每轮进上下文**（§11.1 一直在付这个代价） | ⭐ **零**（代码不进上下文） |
 * | 可靠性 | 概率性 | **确定性** |
 * | 失败可见 | 静默 | ⭐ **带 reason 回给模型**，当场可改 |
 * | 维护 | 多处副本要同步 | **一处代码** |
 *
 * ── 🔴 职责边界（别和工具内校验重复）──────────────────────────────────────
 * 本闸门**只做纯参数校验**（长度 / 格式 / 正则），**绝不读库**——
 * 它拦在工具体之前，必须够快。
 * 需要看库状态的（主题是否存在、跨项目证据、`step` 与参数一致性）
 * **留给 `runHandoff` 内部**（§3.9）。
 *
 * ⚠️ **规则实现是共享的**：本闸门与 `runHandoff` 都调用
 * `handoff.ts` 的 `checkKnowledgeShape()`——**同一份实现**，
 * 否则两处规则必然漂移（本项目多次踩到"多副本"坑）。
 *
 * ── ⚠️ 实测依据 ────────────────────────────────────────────────────────────
 * 本模块依赖的行为**全部经 `scripts/probe-tool-hooks.mjs` 实测**（24 项全绿），
 * 不是从类型定义推断的：
 *  · `deny` ⇒ **工具体完全不执行**，`reason` 以 `Error: <reason>` 回给模型；
 *  · `guard` 在 `pre-execute` 之后，且**先 deny 者胜**；
 *  · 参数 schema **不支持 `minLength`/`pattern`**（声明即报错）⇒ 只能在此校验。
 *
 * @module dsh-memj/gate
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { checkKnowledgeShape, type AdoptRequest, type HandoffEntry, type HandoffStep, planSteps } from './handoff.ts'

/** 本插件要拦的工具名（只拦自己的，不碰别的插件）。 */
const HANDOFF_TOOL = 'memj_handoff'

/** 闸门依赖。 */
export interface GateDeps {
  ctx: Context
}

/** 从 `exec.arguments` 里安全地取一个对象字段。 */
function field<T>(args: unknown, key: string): T | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  return (args as Record<string, unknown>)[key] as T | undefined
}

/**
 * ⭐ 对 `memj_handoff` 的入参做**纯形状校验**（不读库、不抛异常）。
 *
 * 只查 schema 表达不了的：长度 / 格式 / 正则。
 * ⚠️ **不查** `step` 与参数的一致性——那条要看库状态（新项目时 `projectDesc` 例外），
 * 留在 `runHandoff` 内（§3.11.6）。
 * @param args - 工具入参。
 * @returns 拒绝理由（`undefined` = 放行）。
 */
export function gateHandoffArgs(args: unknown): string | undefined {
  // ── ① `project` 必填且非空白（schema 只能查"有没有给"，查不了"是不是空白"）──
  const project = field<unknown>(args, 'project')
  if (typeof project !== 'string' || project.trim() === '') {
    return '`project` 不能为空（或只有空白字符）。'
  }

  // ── ② `step` 的取值合法性（schema 已用 enum 限了值，但**数组里**的非法值
  //      与"空数组 / all 与他项并存"表达不了）──
  const rawStep = field<HandoffStep | readonly HandoffStep[]>(args, 'step')
  if (rawStep !== undefined) {
    const plan = planSteps(rawStep)
    if (plan.error !== undefined) return plan.error
  }

  // ── ③ `entries` / `adopt` 的形状（长度 / 格式 / body 标题行）──
  //      ⭐ 与 runHandoff **共用同一份实现**（§3.11.6）。
  const entries = field<HandoffEntry[]>(args, 'entries')
  const adopt = field<AdoptRequest[]>(args, 'adopt')
  const issues = checkKnowledgeShape(entries, adopt)
  if (issues.length > 0) {
    return (
      '参数形状校验未通过（**工具体未执行**，无需重新读库）：\n' +
      issues.map((s, i) => `${i + 1}. ${s}`).join('\n') +
      '\n\n修正后重调即可。'
    )
  }

  return undefined
}

/**
 * ⭐⭐ **后置自愈：检查"看起来成功、其实半套"的结果**（决策 103 / §3.11.4）。
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * `pre-execute` 只能拦**参数形状**；而有一类错误**只有跑完才知道**：
 * 比如"新建了主题，却没有任何知识挂到它"——主题白建（聚合能力为 0）。
 * 这类错误**可数、确定**（§3.9 的既有哲学），但光看回执里的"成功"发现不了。
 *
 * ⚠️ **只做"确定且罕见"的检查**，绝不猜语义——
 * `block` 会把一次**已经成功**的调用翻成错误、要求模型重做，
 * **误报的代价很高**。⇒ 规则必须窄。
 *
 * ── 当前唯一的规则 ──────────────────────────────────────────────────────────
 * **本次既新建了主题、又落了知识，但那些知识一条都没挂到新主题上。**
 * ⚠️ 只在**同一次调用里**两边都有时才判——跨调用无法可靠归因
 * （知识可能在上一轮就挂好了）。
 * @param args - 工具入参。
 * @param value - 工具的成功返回值（`output.schema` 声明的形状）。
 * @returns 需要模型重做时给出的反馈；`undefined` = 放行。
 */
export function selfCheckHandoffResult(args: unknown, value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as { ok?: unknown; createdThemes?: unknown }

  // 只处理成功结果（失败结果本来就是要模型改的，不必再翻一次）。
  if (v.ok !== true) return undefined

  const created = Array.isArray(v.createdThemes) ? (v.createdThemes as string[]) : []
  if (created.length === 0) return undefined

  // 本次给了哪些知识？以及它们各自挂了什么主题？
  const entries = field<Array<{ theme?: readonly string[] }>>(args, 'entries') ?? []
  const adopt = field<Array<{ theme?: readonly string[] }>>(args, 'adopt') ?? []
  const provided = [...entries, ...adopt]
  // ⚠️ **本次没给知识** ⇒ 不判（"先建主题、下次再挂"是合理用法）。
  if (provided.length === 0) return undefined

  const attached = new Set<string>()
  for (const item of provided) {
    for (const t of item.theme ?? []) attached.add(t)
  }

  const dangling = created.filter((t) => !attached.has(t))
  // ⚠️ **只要有任何一个新主题被挂上了就不拦**——不追求"每个都挂"，
  //    因为"建两个主题、这次只用一个"是正常做法。只拦**全都没挂**这种明显异常。
  if (dangling.length === created.length && dangling.length > 0) {
    return (
      `你新建了主题 ${created.map((t) => `\`${t}\``).join('、')}，` +
      `但本次落盘的 ${provided.length} 条知识**一个都没挂到这些主题上**。\n` +
      '⚠️ 这个主题目前是**空的**——它聚合不到任何知识。\n' +
      '请二选一后重调：\n' +
      '  · 把 `entries[].theme` 填上刚建的主题 id（若确实属于它）；\n' +
      '  · 或者这次先别建主题（从 `newThemes` 里去掉），等有知识挂它时再建。'
    )
  }
  return undefined
}

/**
 * 注册 host 侧闸门。
 *
 * ⚠️ **只拦 `memj_handoff`**——其它工具（search/read/...）是本插件自己的读工具，
 * 参数简单，没必要加一道。
 * @param deps - 依赖。
 * @returns 卸载函数（正常情况下由 `ctx.effect` 托管，无需手工调用）。
 */
export function registerGate(deps: GateDeps): () => void {
  const { ctx } = deps
  const disposers: Array<() => void> = []

  // ⭐ 用 `tools/pre-execute` 的 waterfall：能拿到 `exec.name`（只处理自己的工具），
  //    且 `deny` 带 reason 会以 `Error: <reason>` 回给模型（已实测）。
  try {
    const off = ctx.on('tools/pre-execute', async (exec, next) => {
      if (exec.name !== HANDOFF_TOOL) return await next()
      const reason = gateHandoffArgs(exec.arguments)
      if (reason !== undefined) return { kind: 'deny', reason }
      return await next()
    })
    disposers.push(off)
  } catch (err) {
    // 闸门注册失败**不该拖垮插件**（工具本身仍可用，只是少了提前拦截）。
    ctx.logger?.error?.('dsh-memj: pre-execute 闸门注册失败（将退化为仅工具内校验）: %o', err)
  }

  // ⭐⭐ 后置自愈（决策 103）：把"成功但半套"的结果翻成错误，让模型**当场重做**。
  //    实测依据：`block` + `feedback` ⇒ 结果是 `isError`、feedback 原样到达模型、
  //    且**工具体已经跑过了**（所以它只能"要求重做"，不能"阻止副作用"）。
  try {
    const off = ctx.on('tools/post-execute', async (exec, result, next) => {
      if (exec.name !== HANDOFF_TOOL) return await next()
      // ⚠️ 只对**成功**结果做自愈——失败结果本身就是要模型改的。
      if (result.isError === true) return await next()
      const feedback = selfCheckHandoffResult(exec.arguments, result.value)
      if (feedback === undefined) return await next()
      return { kind: 'block', feedback: [{ type: 'text', text: feedback }] }
    })
    disposers.push(off)
  } catch (err) {
    ctx.logger?.error?.('dsh-memj: post-execute 自愈注册失败（将退化为仅回执警告）: %o', err)
  }

  return () => {
    for (const d of disposers) {
      try {
        d()
      } catch {
        /* 已卸载 */
      }
    }
  }
}
