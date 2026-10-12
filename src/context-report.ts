/**
 * ⭐⭐⭐ **上下文占用的读取**（决策 226；2026-10-12 用户裁定）。
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * 「上下文用到多少了」这件事，DSH **只对插件可见、不对模型可见**：
 * · `@deepseek-ai/dsh-compaction` 的 README 原文：*"**面向用户的命令，而非模型工具**——
 *   压缩由 `/compact` 命令与自动压力触发；**不会注册面向模型的压缩工具**"*；
 * · `@deepseek-ai/dsh-token-meter` 提供 `ctx.tokenMeter`，但它是**给插件用的 ctx 服务**
 *   （README 反复强调"不添加模型可见内容"）。
 * ⇒ ⭐ **判据：「插件能看到」≠「模型能看到」。**
 * 于是用户设想的「到 60% 就自动沉淀」**在纯提示词下不可能实现**——模型拿不到那个数。
 *
 * 本模块把那件事补上：**把占用率读出来，交给 `context-auto.ts` 每轮末如实报给模型**。
 *
 * ── 🔴 三条硬约束（都照本项目的既有纪律）────────────────────────────────────
 * 1. **取服务一律 `ctx.get('tokenMeter')`，不用属性访问** ——
 *    声明合并能让 `ctx.tokenMeter` 过 typecheck、运行时却是 `undefined`
 *    （库内真出过：`ctx.llm` 那次 ⇒ 表现是"结构对、内容缺"）。
 * 2. 🔴 **不 import `dsh-token-meter`** —— 它**不在本包的 `peerDependencies` 里**
 *    ⇒ 与 `credentials` 同处置：**只用结构化类型调它的方法**（库里已有这条纪律）。
 * 3. **拿不到就返回 `undefined`，绝不抛** —— 该服务可能压根没挂
 *    （无 agent-loop 的环境）⇒ 那时这个功能**静默不生效**，而不是把轮次弄挂。
 *
 * ── 用哪个数：`projectedTokens` 优先 ────────────────────────────────────────
 * `measure()` 回的 `ContextPressureProjection` 有三个字段（读 `projection.d.ts` 确认）：
 * · `pressureTokens` —— **最近一次请求**的 prompt 大小（provider 自报，**不含本轮输出**）；
 * · `projectedTokens` —— ⭐ **下一次请求**的 prompt 会是多少
 *   = `pressureTokens` + 采样之后 surface 的增减（**因此它能反映 compaction**，
 *   而 `pressureTokens` 单独做不到——压缩自己不产生 usage 报告）；
 * · `contextWindow` —— 最新记录的路由容量。
 *
 * ⇒ ⭐ **报给模型要用 `projectedTokens`**：模型要判断的是"我接下来还能装多少"，
 *   而不是"上一次请求花了多少"。⚠️ 但它可能缺席（还没有任何 provider 报过 usage）
 *   ⇒ 那时退回 `pressureTokens`。
 *
 * @module dsh-memj/context-report
 */

/** 一次上下文占用的测量结果（**只读、纯数据**）。 */
export interface ContextUsage {
  /** 模型窗口大小（token）。⚠️ 路由没声明容量时缺席。 */
  window?: number
  /** 当前占用（token）。优先 `projectedTokens`，缺席时退回 `pressureTokens`。 */
  used: number
  /** 占用百分比（0–100，已四舍五入）。⚠️ 无 `window` 时缺席。 */
  percent?: number
  /** 用的是哪个数（供诊断/测试断言）。 */
  source: 'projected' | 'pressure'
}

/** `ctx.get('tokenMeter')` 的结构化类型（**不 import 它的包**，见文件头约束 2）。 */
interface TokenMeterLike {
  measure?: (
    session: unknown,
    requestHeader?: unknown,
  ) => {
    pressureTokens?: unknown
    projectedTokens?: unknown
    contextWindow?: unknown
  } | undefined
}

/** 把未知值收成有限正数；否则 `undefined`。 */
function posNum(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined
  return v
}

/**
 * 读当前会话的上下文占用。
 *
 * @param ctx - 插件上下文（只要它能 `get`）。
 * @param session - 会话对象（`agent/turn-stopping` 载荷里那个 agent 的 session）。
 * @returns 占用结果；**任何一环拿不到就返回 `undefined`**（调用方据此静默跳过）。
 */
export function readContextUsage(
  ctx: { get: (name: string) => unknown },
  session: unknown,
): ContextUsage | undefined {
  if (session === undefined || session === null) return undefined
  let meter: TokenMeterLike | undefined
  try {
    meter = ctx.get('tokenMeter') as TokenMeterLike | undefined
  } catch {
    return undefined
  }
  if (meter === undefined || meter === null || typeof meter.measure !== 'function') return undefined

  let m: ReturnType<NonNullable<TokenMeterLike['measure']>>
  try {
    m = meter.measure(session)
  } catch {
    // ⚠️ 测量失败（会话形状不符/回放异常）⇒ 静默跳过，**不能连累轮次结束**。
    return undefined
  }
  if (m === undefined || m === null) return undefined

  const projected = posNum(m.projectedTokens)
  const pressure = posNum(m.pressureTokens)
  const used = projected ?? pressure
  if (used === undefined) return undefined

  const win = posNum(m.contextWindow)
  const out: ContextUsage = {
    used: Math.round(used),
    source: projected !== undefined ? 'projected' : 'pressure',
  }
  if (win !== undefined) {
    out.window = Math.round(win)
    out.percent = Math.round((used / win) * 100)
  }
  return out
}

/**
 * 把占用结果渲染成**给模型看的一段文本**。
 *
 * 🔴🔴 **最后那句是灵魂**，别删：它让「要不要动作」**留在用户的提示词里**，
 *    插件**只提供事实、不规定任何阈值动作**。三件事缺一不可：
 *    ① 明确授权（"若提示词有规定，照做"）；② 明确免责（"否则忽略"）；
 *    ③ ⛔ **插件自己绝不写"超过 X% 就做 Y"** —— 那会把用户的自由度收走。
 *
 * ⚠️ **数字不进常驻文本**：本段文本只在**每轮末注入一次**，
 *    所以它带运行时数字是安全的；但**绝不能搬进 `context()`**（那会每轮重发、破前缀缓存）。
 *
 * @param u - `readContextUsage()` 的结果。
 * @returns 注入用的 markdown 片段。
 */
export function renderContextUsage(u: ContextUsage): string {
  const used = u.used.toLocaleString('en-US')
  const head =
    u.window !== undefined && u.percent !== undefined
      ? `窗口 ${u.window.toLocaleString('en-US')} · 当前约 ${used}（${u.percent}%）`
      : `当前约 ${used}（本路由未上报窗口大小，只有占用绝对值）`
  return [
    '## 上下文占用',
    head + '。',
    '若你的提示词中规定了依据上下文占用率执行的动作，现在可以判断是否执行；否则忽略本条。',
  ].join('\n')
}
