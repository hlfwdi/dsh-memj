/**
 * ⭐⭐⭐ **热知识的注入通道 + 看门狗**（热知识方案 §6.2）。
 *
 * ── 它做两件事，**必须配对使用** ────────────────────────────────────────────
 * ① **看门狗（判定）**：挂 `llm/stream`，读**模型真实收到的全部消息**，
 *    逐条判断"这次出网还带没带它" ⇒ 记进内存快照 `windowPresent`；
 * ② **注入（补注）**：挂 `agent/pre-step`，用**上一次出网**的快照算出
 *    "缺哪几条" ⇒ **只补缺的那些**（一条不缺就一条不补）。
 *
 * ── 🔴🔴 为什么必须分两个钩子（本项目最容易搞错的一点）──────────────────────
 * `agent/pre-step` **在请求构造之前**（agent-loop `lib/index.js:885-908` 的 `preStep`
 * 先于 `:1014-1030` 的 `step` 内渲染与 append）⇒
 * **在 `pre-step` 里看不到"即将发出的完整请求"**。
 * ⇒ 判据只能用**上一步 `llm/stream` 留下的快照**。
 * ⚠️ 这正是 `dsh-prompt-inject` 的 `windowPresent` 存在的理由
 * （其注释原话："用它判断会永远 false"）——本模块采用同一范式。
 *
 * ── 🔴 指纹用「封面 id」而不是注入文本原文 ──────────────────────────────────
 * - 渲染行里**本来就带完整 id**（`` `95fafbde-…` ``）⇒ **零额外字符成本**；
 * - id **稳定**（原文可能被改写/截断）；
 * - ⭐ 逐条独立判定 ⇒ **正好回答"缺哪条 / 全都缺"**。
 *
 * @module dsh-memj/hot-watch
 */

import type { Context } from '@deepseek-ai/cordis'
// ⚠️ 这两个 type-only import 是**声明合并的来源**：删掉就丢 `llm/stream` 与
//    `agent/pre-step` 的事件类型（本项目既有做法，见 `index.ts` 文件头）。
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { buildHotInjection, detectProjectByDocReads, detectProjectBySessionLog, fingerprintsFromInjectionEvents, fingerprintsInText } from './hot-inject.ts'
import { isPluginSpawned } from './subagent-origin.ts'
import type { HotPreviewItem, ScoreReadOpts } from './hot-inject.ts'
import { HOT_PROJECT_UNKNOWN } from './schema.ts'
import {
  loadEntrySettings,
  loadSessionsFile,
  saveSessionsFile,
  settingOf,
  touchSession,
} from './hot.ts'
import { scanLibrary } from './store.ts'

/** 一次出网的窗口快照：**这个会话这次带了哪些注入内容的 id**。 */
export type WindowSnapshot = {
  /** 本次出网消息里出现的**本次应注入条目**的 id（✅ 还在窗口里）。 */
  present: Set<string>
  /** 判定发生的时刻（ISO，供页面显示"这是哪一次的结果"）。 */
  at: string
  /** 本次判定的会话（便于页面核对）。 */
  sessionId: string
  /**
   * ⭐ **本会话用的模型的上下文窗口**（tokens）；取不到时 `undefined`。
   *
   * 🔴 **为什么要顺手记**：`GenerateOptions` **不含** `contextWindow`
   * （已核实：它只在 `LlmModelContext` 上）⇒ 只能在出网时用
   * `ctx.llm.resolveModelInfo(provider, model)` 换一次。
   * ⚠️ 而网页 API（`/hot`）**拿不到 agent / 模型对象**（`deps` 只有四个字段）
   * ⇒ 这个值**必须存下来**，否则预算只能永远用回落值。
   */
  contextWindow?: number
}

/**
 * ⭐ **热知识注入的运行时状态**（**纯内存**，进程重启即失）。
 *
 * 🔴 **为什么是内存**：
 * - 窗口快照只对"当前这几步"有意义，落盘反而会读到过期数据；
 * - 与之配套的**持久状态（绑定/清单/设置）在 `hot/` 四个文件里**，
 *   两者职责不同（本项目一贯：**状态走落盘、过程走内存**）。
 *
 * 🔴 **为什么必须是模块级单例**（而不是 `apply()` 的闭包）：见 `api.ts` 的约束——
 * `handleApi` 的 `deps` 只有 `{version, config, baseUrl, pluginId}`，
 * **API 层拿不到会话/agent 对象** ⇒ "实时状态"页要读的内存态
 * **只能放在一个两边都够得着的地方**。本模块就是那个地方。
 */
export interface HotRuntimeState {
  /** `sessionId → 最近一次出网的窗口快照`。 */
  windows: Map<string, WindowSnapshot>
  /** `sessionId → 最近一次注入的统计`（供"实时状态"页显示）。 */
  lastInject: Map<string, {
    at: string
    /** 本次**补注**了哪些 id（空 = 全都在窗口里、一条没补）。 */
    injected: string[]
    /** 本次**应注入**的全部 id（含已在窗口里的）。 */
    expected: string[]
    /** 注入文本的字符数（0 = 没注入）。 */
    chars: number
    project: string
  }>
  /** ⚠️ 连续告警去重（本项目纪律：**高频警报会脱敏** ⇒ 只在状态变化时报）。 */
  warnedNoProject: Set<string>
}

/** 全局单例（**同一进程内共享**；见上方的"为什么必须"）。 */
export const hotState: HotRuntimeState = {
  windows: new Map(),
  lastInject: new Map(),
  warnedNoProject: new Set(),
}

/**
 * ⭐ 判断一条注入内容**是否还在窗口里**。
 *
 * 判据 = 该条的**指纹**（封面 id，或画像的文本指纹）是否出现在任一 text 块里。
 *
 * 🔴🔴 **比对逻辑已改为走共享实现 `fingerprintsInText`**（2026-09-24 按用户要求统一）：
 *    原来这里是"拼全文 + 逐个 `includes`"，而**重建那条路径是另一份实现** ——
 *    同一判据两份代码，迟早漂移（本项目已有多次教训）。
 *    ⭐ 现在两处**共用同一份**：
 *    · **uuid 形状的指纹**（封面 id）⇒ 一次正则扫全文 + 求交，**成本与指纹数无关**；
 *    · **非 uuid 的指纹**（画像文本指纹）⇒ 逐条 `includes` 兜底（🔴 漏了它画像永远判不出）。
 *
 *    ⚠️ **为什么不是简单的"逐条 includes"**：它的成本 = `指纹数 × 全文扫描`。
 *    实测（1142KB 语料）：19 条 ⇒ 7.2ms（比正则快），但 200 条 ⇒ **85.8ms**、
 *    1000 条 ⇒ **403ms**；而正则恒在 11~15ms。
 *    拐点在 20~50 条之间 —— 本项目当前 19 条**尚未越过**，但**清单会长大**
 *    （「批量加入」一次可加 149 条）⇒ 采用"与指纹数无关"的写法，以后不会恶化。
 *    ⭐ 判据：**性能结论必须量出来**（本项目"先量再下结论"）。
 *
 * ⚠️ **已知的"假阳性"**（**不是 bug，别去修**）：`/memj-get-handoff-*` 注入的文本
 * **也含这些 id** ⇒ 那条命令注入过之后，本会话会被判为"在窗口内"。
 * **语义上不算错**（模型确实拿到了那条的标题与描述）。
 * @param messages - 出网消息（`GenerateOptions.messages`）。
 * @param ids - 本次应注入的全部指纹（封面 id + 画像指纹）。
 * @returns 其中"还在窗口里"的那些。
 */
export function idsInWindow(
  messages: readonly unknown[] | undefined,
  ids: readonly string[],
): Set<string> {
  const found = new Set<string>()
  if (!Array.isArray(messages) || ids.length === 0) return found
  // ⚠️ 先把消息里的 text 块拼成一段（**只拼一次**）——比对本身走共享实现。
  const texts: string[] = []
  for (const m of messages) {
    const content = (m as { content?: unknown })?.content
    if (!Array.isArray(content)) continue
    for (const b of content) {
      const t = (b as { text?: unknown })?.text
      if (typeof t === 'string' && t !== '') texts.push(t)
    }
  }
  if (texts.length === 0) return found
  // ⭐ **与重建那条路径共用同一份比对逻辑**（见 `fingerprintsInText` 的注释）。
  for (const fp of fingerprintsInText(texts.join('\n'), ids)) found.add(fp)
  return found
}

/** 一次 `pre-step` 注入的决策结果（**纯数据**，便于单测）。 */
export interface InjectionDecision {
  /** 要注入的文本；**空串 = 本次不注入**。 */
  text: string
  /** 本次补注的 id（= 应注入 ∖ 已在窗口）。 */
  injected: string[]
  /** 本次应注入的全部 id。 */
  expected: string[]
  /** 判定的项目。 */
  project: string
  /**
   * ⭐⭐ **按形态拆开的两段**（用户 2026-09-24 裁定）——
   * 调用方应当**各 push 一条消息**，让两种形态各带各的收尾。
   * - `bodyText` = 画像 + `full` 条目（收尾是"…但不是任务…"）；
   * - `metaText` = 各 meta 组（收尾含"正文按需 `memj_read`"）。
   * ⚠️ 都为空 = 本次不注入（与 `text === ''` 同义）。
   */
  bodyText: string
  metaText: string
}

/**
 * ⭐⭐ **算出"这一次该注入什么"**（看门狗的核心判据）。
 *
 * 🔴 **"忘了哪条补哪条"就落在这个集合差上**：
 * `missing = expected − present`；**一条不缺 ⇒ 文本为空 ⇒ 一个字都不注入**。
 *
 * ⚠️ **首步无快照 ⇒ 必然全缺 ⇒ 全部注入**（**这是正确行为**，别当 bug：
 * 会话刚开始时模型确实还没见过这些内容）。
 *
 * 🔴🔴 **2026-09-24 修（用户报的 bug）：`present` 缺失时要【自己从会话日志找一次】**
 *
 * **原缺口**："从会话日志重建窗口快照"**只写在 `api.ts` 的 `/hot` 里**（给人看页面用），
 *    而**注入侧只读内存** ⇒ **两条路各算各的**：
 *    · 页面上显示「已注入」（它查了日志，结论对）；
 *    · 而这里 `present` 为空 ⇒ 判成"全缺" ⇒ **又全量注入一遍**。
 *    ⚠️ 决策 143 只修了一半：那条修的是"界面别撒谎"，**注入侧的判据没跟着改**。
 *    ⭐ 表象就是用户说的"**重启之后明明显示全部已注入，却还是把热知识全量重注入了一遍**"
 *      （实测日志里连续 4 次 4299 字符全量注入）。
 *
 * **修法（用户 2026-09-24 裁定"方案 A + 写回"）**：
 *    ① **只在 `present === undefined`（内存没有）时才查日志** —— 读日志实测要解压 12MB，
 *       而本函数**每步都跑** ⇒ **绝不能每次都查**；
 *    ② 查到就**通过 `rebuilt` 回传给调用方写回 `hotState.windows`** ⇒
 *       之后（以及正常出网后）都走内存，**每步的常态成本为零**。
 *    ⭐ 一句话：**"缺了才去日志里找一次，找到就记住"**。
 *
 * 🔴 **为什么重建放在本函数内部**（而不是调用方先重建再传进来）：
 *    重建需要 `expected`（本次应注入的全部指纹），而它由 `buildHotInjection` 算出 ——
 *    那是**唯一做 I/O 的重活**（扫全库 + 读正文）⇒ **不能为拿指纹算两遍**。
 *    放在这里 ⇒ `built` 只算一次，指纹现成。
 *
 * @param sessionId - 会话 id。
 * @param projectId - 已判定的项目。
 * @param present - 上一次出网的窗口快照（`undefined` = 内存里没有）。
 * @param ctx - ⭐ 给了才做"缺失时从日志重建"（**给不了就退化为原行为**：
 *   没有快照 ⇒ 全缺 ⇒ 全量注入）。`api.ts` 那条冷路径用的是
 *   `previewForSession`，不走这里。
 * @returns 注入决策；`rebuilt` 非空表示"刚从日志重建了一份"（调用方应写回内存）。
 */
export async function decideInjection(
  sessionId: string,
  projectId: string,
  present: ReadonlySet<string> | undefined,
  ctx?: { get: (name: string) => unknown },
  /**
   * ⭐ 评分模式（决策 177）：`on` ⇒ 项目/主题层换成"有效分前 N 名"。
   * ⚠️ 不传 ⇒ 原清单路径（既有调用点与测试不受影响）。
   */
  score?: ScoreReadOpts,
): Promise<InjectionDecision & { rebuilt?: WindowSnapshot }> {
  const built = await buildHotInjection(sessionId, projectId, score !== undefined ? { score } : {})
  // ⭐⭐ **指纹集合 = 封面 id + 画像指纹**（`fp` 字段，见 `HotPreviewItem`）。
  //
  // 🔴🔴 **为什么要并入画像指纹**（2026-09-22 修一个静默 bug）：
  //    原来 `expected` **只有封面 id**，而画像没有 id ⇒
  //    · 只有画像（没有封面条目）时 `missing` 恒为空 ⇒ 判定成"一条不缺"
  //      ⇒ **画像一个字都不注入**（静默丢掉）；
  //    · 画像在窗口里也**永远检测不到** ⇒ 页面永远显示"未注入"。
  //    ⚠️ 指纹为空串的画像不参与（`personaFingerprint` 对短文本返回空串，
  //       避免"偶然撞上"造成**假绿**）。
  const expected = built.preview.map((p) => p.fp).filter((fp) => fp !== '')
  // ⭐ **内存没有 ⇒ 去日志里找一次**（见上方长注释；这是本次修的核心）。
  let presentNow = present
  let rebuilt: WindowSnapshot | undefined
  if (presentNow === undefined && ctx !== undefined) {
    rebuilt = await rebuildWindowFromSessionLog(ctx, sessionId, expected)
    if (rebuilt !== undefined) presentNow = rebuilt.present
  }
  const withRebuilt = rebuilt === undefined ? {} : { rebuilt }
  /** ⚠️ 不注入时两段都必须给空串（类型要求；调用方据此跳过 push）。 */
  const NO_TEXT = { bodyText: '', metaText: '' }
  if (built.text === '') {
    return { text: '', injected: [], expected, project: projectId, ...NO_TEXT, ...withRebuilt }
  }
  const missing = expected.filter((id) => presentNow === undefined || !presentNow.has(id))
  if (missing.length === 0) {
    // ✅ 全都在窗口里 ⇒ 一条都不补（**省 token 的关键分支**）。
    return { text: '', injected: [], expected, project: projectId, ...NO_TEXT, ...withRebuilt }
  }
  // ⭐⭐⭐ **只渲染缺的那些**（2026-09-24 修 —— 用户最早报的"每次都全量重注入"）。
  //
  // 🔴🔴 **这里原来直接返回 `built.text`（全量）** —— `missing` 只被当成记账塞进 `injected`，
  //    **发出去的仍是整批** ⇒ 实测"只新增一条 62 字符的画像，却重发了全部 4236 字符"。
  //    ⚠️ 那个缺陷**极能潜伏**：`injected` 字段是对的 ⇒ 只断言它的测试全绿、
  //      看日志的人以为"只补了 1 条"，**只有去读真正发出去的文本才能发现**。
  //
  // ⭐ **实现要点（两条）**：
  //    ① `buildHotInjection` 要**按 `missing` 子集重渲染**（渲染层原来只有"渲染全部"一种模式，
  //       所以那次调用不是为了"重新收集"，而是为了拿到"只含 missing 的文本"）；
  //    ② **分形态返回两段**（`supplement: true`）⇒ 调用方各 push 一条消息，
  //       让"正文形态"与"标题形态"各带各的收尾（用户裁定）。
  //    ⚠️ 代价：这里会**多跑一次** `buildHotInjection`（第二次带 `only`）。
  //      可接受：它只在**真的要补注时**才发生，而补注本身是低频动作
  //      （正常轮次一条不缺 ⇒ 走上面的 `missing.length === 0` 提前返回）。
  const onlySet = new Set(missing)
  // 🔴🔴 **`score` 必须原样透传**（2026-09-29 修的 bug）：
  //    这是"**补注**"那条路径（`missing` 的子集重渲染）——
  //    ⚠️ 若这里不传 `score`，补注时会**退回到原清单**渲染
  //    ⇒ 收集到的条目与 `expected`（评分模式算出来的）**是两个集合**
  //    ⇒ **补注的内容与实际该注入的对不上**（发出去的是清单里的、记账记的是评分榜的）。
  //    ⭐ 与上面那次调用**必须同源**（本项目铁律：同一判据只有一份实现）。
  const partial = await buildHotInjection(sessionId, projectId, {
    only: onlySet,
    supplement: true,
    ...(score !== undefined ? { score } : {}),
  })
  return {
    // ⚠️ 兼容字段：`text` 仍给（= 两段拼起来），但**调用方应当用下面两段**分别 push。
    text: [partial.bodyText, partial.metaText].filter((t) => t !== undefined && t !== '').join('\n\n'),
    injected: missing,
    expected,
    project: projectId,
    bodyText: partial.bodyText ?? '',
    metaText: partial.metaText ?? '',
    ...withRebuilt,
  }
}

/**
 * ⭐ 判定一个会话当前该用哪个项目（**把各级判定按优先级合成一个结果**）。
 *
 * 优先级（方案 §7.2）：
 * 1. **手动绑定**（`source: 'manual'`）—— **最高**，否则用户的设置会被自动结果悄悄改掉；
 * 2. **① `doc-reads` 与 `get-handoff` 痕迹**（默认启用，零成本）——
 *    🔴 **两者强度等同、取较新的那个**（用户 2026-09-22 裁定）：
 *    · `doc-reads` = 模型真读了项目文档；
 *    · `get-handoff` = 人执行了 `/memj-get-handoff-project <项目>`（⭐ **从会话日志里读**）。
 *    ⚠️ **不是"get-handoff 无条件优先"**——否则先取 A 的交接、后又读了 B 的文档，会判成 A。
 *    ⚠️ **两者都只在 `detectDocReads` 开关打开时才查**（用户裁定）。
 * 3. **② 后台 LLM 判定**（开关，二期）—— 其结果也写在同一个绑定里（`source: 'llm'`）。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴🔴 **2026-09-23 修（用户报的 bug）：开关只管"要不要【重新】判定"，
 *    **绝不废除"已经判定出来的"绑定**。**
 *
 * **用户实测报告**（原话）：*"我在会话实时状态那一页。关闭程序化判断开关的时候，
 *   热知识注入情况的列表就只显示画像和全局知识了。咋回事？是说关闭开关的时候，
 *   就失去项目判定了？"*
 *
 * ⭐ **用户猜得对，而且根因就是本函数**：旧实现里**只有 `manual` 的绑定会被直接采纳**，
 *    其余一律走"重新判定"，而重新判定的**前提是开关开着**
 *    ⇒ **开关一关，`sessions.json` 里那条已存在的 `doc-reads` 绑定就被无视了**
 *    （⚠️ 注意：**它没被删**，只是不被读）⇒ 返回 `未知`
 *    ⇒ `collectHotItems('未知')` 只收全局 + 画像 ⇒ **项目/主题知识全消失**。
 *
 * 🔴 **两件事被混进了一个条件**（这才是 bug 的本质）：
 *    · **"要不要继续判定"** ← 这才是开关该管的；
 *    · **"已判定的算不算数"** ← **与开关无关**（判定结果一旦落盘就是事实）。
 * ⇒ ⭐ **判据**：**开关控制"动作"，不控制"既成事实"**。
 *
 * ⭐ **修法**：开关**关着**时，把 `sessions.json` 里**已有的绑定**当作结果返回
 *    （**不再跑任何判定** ⇒ 不读会话日志、零成本 —— 这正是用户关掉它的本意）。
 * ⚠️ `llm` 来源**同等对待**（用户裁定：*"llm 来源的绑定也保留"*）——
 *    它与 `manual` 一样是**已经落盘的结果**。
 * ⚠️ 仍然**必须过 `known` 校验**（项目已删/已归档时不算数 —— 不注入一个不存在的项目）。
 *
 * @param ctx - 插件上下文（`get-handoff` 那条判据要读会话日志）。
 * @param sessionId - 会话 id。
 * @returns 项目 id（判不出 = `未知`）+ 来源。
 */
export async function resolveProject(
  ctx: { get: (name: string) => unknown },
  sessionId: string,
): Promise<{ project: string; source: string; at: string }> {
  const file = await loadSessionsFile()
  const bound = file.sessions[sessionId]
  if (bound !== undefined && bound.source === 'manual' && bound.project !== '') {
    return { project: bound.project, source: 'manual', at: bound.boundAt }
  }
  // ⚠️ 已归档/已删的项目**不算数**（不要注入一个不存在的项目）。
  const snapshot = await scanLibrary()
  const known = snapshot.projects.map((p) => p.id)
  if (file.detectDocReads) {
    // ⭐⭐ **三条判据**（都在 `detectDocReads` 开关之下 —— 用户裁定）：
    //     · ⭐⭐⭐ `handoff`：会话日志里 `memj_handoff` 的入参 `project`（**最强**）
    //     · ⭐⭐ `get-handoff`：会话日志里 `/memj-get-handoff-project` 的 args
    //     · ⭐ `doc-reads`：memj 库自己的记录（模型读了项目文档）
    //    ⚠️ **`handoff` 无条件优先**（用户 2026-09-22 裁定：模型自己声明 + 真写了文档）
    //       —— 不是"取最新"，而是**它赢**。
    //    ⚠️ 后两者**强度等同、取较新者**（先前那批的裁定）。
    const [byReads, byLog] = await Promise.all([
      detectProjectByDocReads(sessionId, known),
      // ⚠️ 会话日志的读取**只在真正需要时发生**（这里是判定链上唯一的 I/O 大户）。
      detectProjectBySessionLog(ctx, sessionId, known),
    ])
    if (byLog.project !== HOT_PROJECT_UNKNOWN && byLog.source === 'handoff') {
      return { project: byLog.project, source: 'handoff', at: byLog.at }
    }
    const candidates = [byReads, byLog].filter((c) => c.project !== HOT_PROJECT_UNKNOWN)
    if (candidates.length > 0) {
      const best = candidates.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0]
      if (best !== undefined) {
        return {
          project: best.project,
          // ⭐ 来源如实说是哪一条赢的（"来自会话日志"对排查很重要）。
          source: best === byLog ? 'get-handoff' : 'doc-reads',
          at: best.at,
        }
      }
    }
  }
  // ⭐⭐ **开关关着（或三条判据都没结果）⇒ 回落到"已落盘的绑定"**（2026-09-23 修）。
  //
  // 🔴 **这一段是 bug 的修复点**：旧实现里 `doc-reads` 来源的绑定**只会被"重新判定"覆盖**，
  //    从不被直接采纳 ⇒ 开关一关就**判不出项目**（而记录其实还在 `sessions.json` 里）。
  // ⭐ 采纳**任何非空、且在库里存在**的绑定 —— 它已经是一个**既成事实**，
  //    与"用哪条判据算出来的"无关（`doc-reads` / `get-handoff` / `llm` 一视同仁）。
  // ⚠️ 顺序放在三条判据**之后**：开关开着时，**新结果优先**（判定链的意义就在于此）。
  if (bound !== undefined && bound.project !== '' && known.includes(bound.project)) {
    return {
      project: bound.project,
      // ⚠️ **来源如实回**（页面要显示"是谁定的"）——
      //    这可能与 `manual` / `llm` 是同一个值，但**都能落在这条分支**上：
      //    · `manual` 早在开头就返回了（它不看开关）；
      //    · `llm` 若被这条接住，返回的 source 仍是 `'llm'`（**不篡改来源**）。
      source: bound.source,
      at: bound.boundAt,
    }
  }
  // ⭐⭐⭐ **子代理继承父会话的项目绑定**（2026-09-29 新增；用户裁定）。
  //
  // ── 用户裁定（原话）────────────────────────────────────────────────────────
  //   *"由主会话 llm 发起的子代理需要继承，纯由我插件发起的子代理不继承
  //     比如现在那个做标签规范的。"*
  //   ⇒ 「主会话 LLM 发起的」**继承**；「插件自己发起的」**不继承**。
  //
  // ── 为什么放在**最后**（这个顺序是刻意的）──────────────────────────────────
  //   ⚠️ 继承是**兜底**，不是**判据**：子代理自己若真的 handoff / 读过文档
  //      （上面几条判据命中），那**它自己的事实优先** —— 它可能正在做**另一个项目**的事。
  //   ⭐ 判据：**"继承"回答的是"我没有自己的证据时算谁的"**，不是"我该算谁的"。
  //
  // ── 为什么插件发起的**不能**继承 ───────────────────────────────────────────
  //   🔴 那个子代理跑的是 `memj_normalize_tags`（**全库操作**，与项目无关），
  //      它只是"调用工具的一个壳"（甲方案）⇒ 给它挂上父项目的语境是**错的**
  //      （会让它以为自己在某个项目里干活）。且它是 fire-and-forget 的一次性调用，
  //      **根本不需要项目语境**。
  //
  // ── 老实现为什么没这条 ─────────────────────────────────────────────────────
  //   🔴 **实测（2026-09-29）**：22 个有召回日志的会话里 **17 个判不出项目**，
  //      它们**全是 subagent**（`origin:"subagent"`、零条对话事件）
  //      ⇒ 三条判据全无输入 ⇒ 候选池恒空（318 条"该范围无候选"）。
  //      其中 **9/17** 的子会话创建时，父会话**早已绑定**（信息当时可得）。
  const parentId = await parentSessionIdOf(ctx, sessionId)
  if (parentId !== '' && !isPluginSpawned(sessionId)) {
    const pbound = file.sessions[parentId]
    if (pbound !== undefined && pbound.project !== '' && known.includes(pbound.project)) {
      return { project: pbound.project, source: 'inherited', at: pbound.boundAt }
    }
  }
  return { project: HOT_PROJECT_UNKNOWN, source: '', at: '' }
}

/**
 * ⭐⭐ **读出这个会话的父会话 id**（子代理继承用）。
 *
 * ⚠️ 会话头的形状是**实测**出来的（`session.v3.jsonl.zstd` 的首个事件）：
 *    ```json
 *    { "type": "session", "version": 3, "id": "session-<uuid>",
 *      "parentSession": "session-<父>",   ← 只有子会话才有这个字段
 *      "origin": "subagent", "delegationDepth": 1 }
 *    ```
 *    ⇒ 顶层会话**没有** `parentSession` 字段。
 *
 * 🔴🔴 **`parentSession` 在【header】上，不在【events】里**（2026-09-29 实测纠正）——
 *    我第一版读的是 `events[].type === 'session'`，**永远匹配不到** ⇒
 *    继承在生产上**静默失效**（单元测试因为自己造的假 events 里有那一条，反而全绿）。
 *    ⭐ `sessionQuery` 的观察结果**把两者分开返回**：
 *    `readSession()` 回 `{ session: <header>, events: <对话事件> }`；
 *    `observeSession()` 回 `{ header: <会话头>, events: snapshotEvents() }`。
 *    ⚠️ 而 `events` 是 `session.snapshotEvents()` —— **只含对话/工具事件，
 *       不含会话头那一条**（实测 `dsh-session-query/lib/index.js:275-276`）。
 *    ⇒ **必须读 `header.parentSession`**，两个 API 都要兼容
 *      （`observeSession` 用 `header`、`readSession` 用 `session`）。
 *
 * 🔴 **不靠 `origin`/`delegationDepth` 判断"是不是子代理"** ——
 *    它们**区分不出发起方**（LLM 发起的与插件发起的逐字段相同，实测）。
 *    这里只回答"**父会话是谁**"，"该不该继承"由调用方按 `isPluginSpawned` 决定。
 *
 * 🔴🔴 **必须优先用 `observeSession`，不能只用 `readSession`** ——
 *    `readSession()` 对**任何长过东西的 fork 会话**必然抛
 *    `seeded session constructor seed must equal its inherited prefix`
 *    （它走 `Session.create` 的 snapshot 模式，撞上 rc.2 构造器的 isSeeded 不变量）。
 *    ⚠️ 虽然子代理本身 `isSeeded: false`、暂时不会中招，但**这条判据不该赌**
 *    （同一个坑本项目已沉淀成知识条目）⇒ 照 `detectProjectBySessionLog` 的既有做法：
 *    **先 `observeSession`，失败才落 `readSession` 兜底**。
 * @param ctx - 插件上下文。
 * @param sessionId - 会话 id。
 * @returns 父会话 id；顶层会话或读不到时为空串。
 */
async function parentSessionIdOf(
  ctx: { get: (name: string) => unknown },
  sessionId: string,
): Promise<string> {
  try {
    const q = ctx.get('sessionQuery') as
      | {
        observeSession?: (id: string, o?: { projectionMode?: string }) => Promise<unknown>
        readSession?: (id: string) => Promise<unknown>
      }
      | undefined
    if (q === undefined) return ''

    /** 从观察结果里抠出会话头（两个 API 的字段名不同）。 */
    const headerOf = (r: unknown): { parentSession?: unknown } | undefined => {
      if (r === null || typeof r !== 'object') return undefined
      const o = r as { header?: unknown; session?: unknown }
      const h = o.header ?? o.session
      return h !== null && typeof h === 'object' ? (h as { parentSession?: unknown }) : undefined
    }

    let obs: unknown
    if (typeof q.observeSession === 'function') {
      try {
        obs = await q.observeSession(sessionId, { projectionMode: 'none' })
      } catch {
        // ⚠️ 观察不可用**不直接判失败** ⇒ 落到 readSession 兜底（同既有实现）。
        obs = undefined
      } finally {
        try {
          (obs as { [Symbol.dispose]?: () => void } | undefined)?.[Symbol.dispose]?.()
        } catch { /* 释放失败不影响结论 */ }
      }
    }
    let header = headerOf(obs)
    if (header === undefined && typeof q.readSession === 'function') {
      header = headerOf(await q.readSession(sessionId))
    }
    if (header === undefined) return ''
    const p = header.parentSession
    return typeof p === 'string' ? p.trim() : ''
  } catch {
    // ⚠️ 读不到 ⇒ 当"没有父会话"（不继承）—— 继承是**增强**，失败不该影响判定。
    return ''
  }
}

/**
 * ⭐ 取"本会话正在用的模型的上下文窗口"（tokens）。
 *
 * 🔴 **为什么要绕这一下**：`GenerateOptions`（出网请求）**不含** `contextWindow`
 * —— 已核实它只在 `LlmModelContext` 上。⇒ 只能用 `provider`/`model`
 * 去 `ctx.llm.resolveModelInfo()` 换一次。
 *
 * ⚠️ **三重容错**（任一失败都返回 `undefined`，**绝不抛**）：
 * ① `ctx.llm` 取不到（服务没挂）；② provider/model 缺失；
 * ③ `resolveModelInfo` 抛错（适配器不认识这个模型）。
 * ⭐ 且**已有值就不再查**（同一会话的模型极少变）——省掉每次出网的额外开销。
 *
 * ⭐⭐ **已导出**（2026-09-26）：主动注入的 chat 通路要按"窗口的 60%"定预算，
 *    用的**必须是同一个窗口值** ⇒ 两处各写一份必然会漂移（本项目"同一判据只有一份实现"）。
 * @param ctx - 插件上下文。
 * @param options - 本次出网请求。
 * @param cached - 已有值。
 * @returns 窗口大小；拿不到时 `undefined`。
 */
export async function resolveContextWindow(
  ctx: Context,
  options: { provider?: unknown; model?: unknown },
  cached: number | undefined,
): Promise<number | undefined> {
  if (typeof cached === 'number' && cached > 0) return cached
  try {
    const provider = typeof options?.provider === 'string' ? options.provider : ''
    const model = typeof options?.model === 'string' ? options.model : ''
    if (provider === '' || model === '') return undefined
    const llm = ctx.get('llm') as
      | { resolveModelInfo?: (p: string, m: string) => Promise<{ context?: { contextWindow?: number } }> }
      | undefined
    if (llm?.resolveModelInfo === undefined) return undefined
    const info = await llm.resolveModelInfo(provider, model)
    const w = info?.context?.contextWindow
    return typeof w === 'number' && w > 0 ? w : undefined
  } catch {
    return undefined   // ⚠️ 拿不到就当"未知"，预算走回落值（不报错、不影响出网）。
  }
}

/**
 * ⭐⭐⭐ **当内存快照缺失时，从会话日志重建它**（2026-09-23 用户要求）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * `hotState.windows` 是**纯内存**的（"进程重启即失"）⇒ 重启后为空
 * ⇒ `/hot` 回 `window: null` ⇒ 页面把**每一条**都显示成"未注入"。
 * 🔴 **而那是假话**：注入内容**持久化在会话日志里**（`user/message` + `source.kind='plugin'`）
 * ⇒ 实测本会话最近一次注入文本里含 **14 个封面 id** ⇒ **判得出来**。
 * 用户原话：*"只要重新启动之后，已注入的内容就会显示未注入，那这是不对的哇？
 * 在每次重启之后，到会话时，或许应该去取 session 看一下？"*
 *
 * ── ⭐ 复用既有的读 session 能力（**不另起一套**，用户明确要求）──────────────
 * 走的是与 `detectProjectBySessionLog` **同一条通道**：
 * `ctx.get('sessionQuery')` ⇒ `observeSession(id, {projectionMode:'none'})` ⇒
 * 拿不到时回落 `readSession(id)` ⇒ 都拿不到就当"读不到"（**不抛**）。
 * ⭐ 判据也复用：`fingerprintsFromInjectionEvents` 与 `idsInWindow` **同一判据**
 * （注入文本里本来就带完整封面 id）⇒ 重建的结论与平时的对得上。
 *
 * ── ⚠️ 什么时候调（性能）────────────────────────────────────────────────────
 * 会话日志**不小**（实测本会话 2.2MB 压缩 / 解压后 6.5MB、1693 个事件）
 * ⇒ 🔴 **只在人打开实时状态页时调一次**（`/hot`），**不进 `pre-step` 热路径**。
 * ⇒ 用户裁定："只在人打开实时状态页时读一次"。
 *
 * ⚠️ **重建失败绝不影响主流程**（读不到日志 ⇒ 返回 `undefined`，页面照旧显示"未注入"）。
 * @param ctx - 插件上下文（要能取到 `sessionQuery`）。
 * @param sessionId - 会话 id。
 * @param fps - 本次应注入的全部指纹（封面 id + 画像指纹）。
 * @returns 重建的窗口快照；读不到日志 / 没有注入事件时 `undefined`。
 */
export async function rebuildWindowFromSessionLog(
  ctx: { get: (name: string) => unknown },
  sessionId: string,
  fps: readonly string[],
): Promise<WindowSnapshot | undefined> {
  if (sessionId === '' || fps.length === 0) return undefined
  try {
    const q = ctx.get('sessionQuery') as
      | {
        observeSession?: (id: string, o?: { projectionMode?: string }) => Promise<unknown>
        readSession?: (id: string) => Promise<unknown>
      }
      | undefined
    if (q === undefined) return undefined

    let events: unknown[] | undefined
    if (typeof q.observeSession === 'function') {
      let obs: unknown
      try {
        obs = await q.observeSession(sessionId, { projectionMode: 'none' })
        const ev = (obs as { events?: unknown })?.events
        if (Array.isArray(ev)) events = ev
      } catch {
        // ⚠️ 观察不可用**不直接判失败** ⇒ 落到 readSession 回退（同 `detectProjectBySessionLog`）。
      } finally {
        try {
          (obs as { [Symbol.dispose]?: () => void } | undefined)?.[Symbol.dispose]?.()
        } catch { /* 释放失败不影响结论 */ }
      }
    }
    if (events === undefined && typeof q.readSession === 'function') {
      const snap = await q.readSession(sessionId)
      const ev = (snap as { events?: unknown })?.events
      if (Array.isArray(ev)) events = ev
    }
    if (events === undefined) return undefined

    const { present, at } = fingerprintsFromInjectionEvents(events, fps)
    // ⚠️ **一条都没匹配上 ⇒ 不当作"重建成功"**：那更可能是"日志里没有 memj 注入"
    //    （新会话 / 从没注入过）⇒ 如实返回 undefined，让页面走"未注入"的正常显示。
    if (present.size === 0) return undefined
    return { present, at, sessionId }
  } catch {
    return undefined   // ⚠️ 重建失败绝不影响判定与注入
  }
}

/**
 * 供 `api.ts` 读取"某会话当前应注入的条目"（实时状态页用；**只读，不注入**）。
 *
 * ⭐⭐ **2026-09-22 改：返回结构化条目而不是一串 id**（用户报告）。
 * 原来只回 `expected: string[]`（封面 id）⇒ 页面列表里是**一串裸 UUID**：
 * 没标题、看不出类型与形态，而且**画像没有 id** ⇒ 列表里根本没有它的位置。
 * ⇒ 现在回 `items: HotPreviewItem[]`（标题 / 类型 / 形态 / 指纹），
 * 页面再叠加"窗口里还在不在"（`present`）就是完整的三列。
 *
 * @param ctx - 插件上下文。
 * @param sessionId - 会话 id。
 * @param score - ⭐ 评分模式（决策 177）：`on` ⇒ 项目/主题层换成"有效分前 N 名"。
 *   🔴🔴 **这是 2026-09-29 修的一个真 bug**：本函数（页面列表的唯一来源）原来
 *   **没传 `score`** ⇒ 它按**原清单**渲染，而 `pre-step` 按**评分榜**注入
 *   ⇒ ⭐ **界面显示的与实际注入的是两个集合**（用户看到的症状就是
 *   *"已经有不少加过分的知识，但没真的加到项目热知识列表"*）。
 *   ⚠️ 根因是我当初只给"注入侧"传了参数、**漏了"显示侧"** ——
 *   而两个消费者都必须拿**同一份**收集结果。
 * @returns 判定结果 + **本次应注入的条目** + 预算口径 + 窗口快照。
 */
export async function previewForSession(
  ctx: { get: (name: string) => unknown },
  sessionId: string,
  score?: ScoreReadOpts,
): Promise<{
  project: string
  source: string
  expected: string[]
  items: HotPreviewItem[]
  chars: number
  window: WindowSnapshot | undefined
  /** ⭐ 窗口快照是**从会话日志重建**的（内存里没有）——页面据此如实说明来源。 */
  windowFromLog: boolean
}> {
  const r = await resolveProject(ctx, sessionId)
  // 🔴 **必须与 `pre-step` 那条路**传**同一份 score 选项**（见函数头的说明）。
  const built = await buildHotInjection(sessionId, r.project, score !== undefined ? { score } : {})
  /** ⚠️ **判定指纹**（封面 id + 画像指纹）——页面用它跟窗口快照求交集。 */
  const expected = built.preview.map((p) => p.fp).filter((fp) => fp !== '')
  // ⭐⭐ **内存快照优先；缺失时从会话日志重建**（2026-09-23 用户要求）。
  //
  // 🔴 **为什么不能只用内存**：它"进程重启即失" ⇒ 重启后页面把**每一条**都显示成
  //    "未注入"，而注入内容其实**还在会话里** ⇒ **界面在撒谎**（用户实测报告：
  //    *"隔了一整夜，此会话之前已经注入的内容，现在显示未注入了……那这是不对的哇？"*）。
  // ⚠️ **内存快照更新鲜**（它是"最近一次真实出网"的结论）⇒ **有就绝不用日志覆盖它**。
  // ⚠️ **重建只在人打开实时状态页时发生**（这里是 `/hot` 的唯一入口）——
  //    不进 `pre-step` 热路径（会话日志实测 2.2MB，不该每轮都读）。
  const mem = hotState.windows.get(sessionId)
  if (mem !== undefined) {
    return {
      project: r.project,
      source: r.source,
      expected,
      items: built.preview,
      chars: built.text.length,
      window: mem,
      windowFromLog: false,
    }
  }
  const rebuilt = await rebuildWindowFromSessionLog(ctx, sessionId, expected)
  return {
    project: r.project,
    source: r.source,
    expected,
    items: built.preview,
    chars: built.text.length,
    window: rebuilt,
    windowFromLog: rebuilt !== undefined,
  }
}

/** ⚠️ 仅供测试：清空内存态（**不改磁盘**）。 */
export function resetHotState(): void {
  hotState.windows.clear()
  hotState.lastInject.clear()
  hotState.warnedNoProject.clear()
}

// ───────────────────────────────────────────────────────────────────────────
// ⭐⭐ 注册两个钩子（由 `index.ts` 在依赖就绪后调用）
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⭐⭐ **挂上热知识的两个钩子**（热知识方案 §6.2）。
 *
 * 🔴 **两个钩子必须一起挂**（缺一不可）：
 * - 只挂 `pre-step` ⇒ 没有窗口快照 ⇒ **每次都全量重注入**（把上下文撑爆）；
 * - 只挂 `llm/stream` ⇒ 只观测不注入 ⇒ 功能不生效。
 *
 * ⚠️ **总开关关着时不挂任何钩子**（`config.hotInject === false` 直接返回）
 * ⇒ 关掉时**零开销**，也不在别人的事件链上占位。
 *
 * 🔴 **失败绝不影响主流程**：两条链路各自 `try/catch` 到底
 * （本项目一贯：钩子里的异常会毁掉整个轮次）。
 * @param opts - `ctx` 与配置。
 */
export function registerHotInjection(opts: {
  ctx: Context
  /**
   * ⚠️ 只声明**自己用到的**配置字段（本模块不读全量配置）。
   * ⭐ 决策 177 加了三个评分字段（`pre-step` 要把它们传给 `decideInjection`）。
   * ⭐⭐ 决策 182 又加了**门槛**两个字段。
   */
  config: {
    hotInject: boolean
    hotScoreOnTurnEnd: boolean
    hotScoreWindowHours: number
    hotScoreTopN: number
    hotScoreGateMinScore: number
    hotScoreGateLastTurn: boolean
  }
}): void {
  const { ctx, config } = opts
  if (!config.hotInject) return
  /**
   * ⭐⭐⭐ **把配置映射成"评分读取选项"**（决策 177/182）——**唯一的一份**。
   *
   * 🔴 **为什么必须有这个函数**（这是决策 181 那次事故的根治）：
   *    那个参数要在**四个调用点**都传（`decideInjection` / `previewForSession` /
   *    `llm/stream` / 补注）—— ⚠️ 我上次**只传了一处**，造出"页面显示与实际注入
   *    是两个集合"。⇒ ⭐ 抽成**一个函数**，调用点只写 `scoreOptsOf(config)`，
   *    **字段增减只改这一处**（结构上不可能再漏）。
   */
  const scoreOptsOf = (c: typeof config): ScoreReadOpts => ({
    on: c.hotScoreOnTurnEnd,
    windowHours: c.hotScoreWindowHours,
    topN: c.hotScoreTopN,
    // ⭐ 门槛（决策 182）：**分数够 或 上一轮刚加入的**（OR，见 config 的注释）。
    gate: true,
    gateMinScore: c.hotScoreGateMinScore,
    gateLastTurn: c.hotScoreGateLastTurn,
  })
  const log = (m: string): void => {
    try { ctx.logger?.info?.(`[dsh-memj/hot] ${m}`) } catch { /* 日志失败不影响注入 */ }
  }

  // ── ① 看门狗：每次出网记一次窗口快照（**判定**）──
  //
  // 🔴 回调签名照 `llm/stream` waterfall：`(options, next) => AsyncIterable`。
  //    ⚠️ **必须透传 chunk**（`yield* next()`）——本项目已知坑：
  //    在 `llm/stream` 里 yield 自造对象会触发 agent-loop 的落盘序列化问题。
  ctx.on('llm/stream', async function* (
    options: GenerateOptions,
    next: () => AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
    try {
      // ⚠️ `purpose` 非空 = 辅助调用（压缩 / 会话标题）⇒ **不是主会话请求**，跳过。
      const sid = typeof options?.sessionId === 'string' ? options.sessionId : ''
      if (sid !== '' && options?.purpose === undefined) {
        const r = await resolveProject(ctx, sid)
        // 🔴🔴 **必须与 `decideInjection` 用【同一份】收集结果**（2026-09-29 修的 bug）。
        //    本处算的是"**这次出网还带没带它**"（`present`），而 `decideInjection`
        //    算的是 `expected` —— ⭐ **`missing = expected − present`**。
        //    ⚠️ 若这里按原清单、那边按评分榜 ⇒ 两个集合不同源
        //    ⇒ **`missing` 算错** ⇒ 要么**重复注入**（`present` 里没有评分榜的条目）、
        //      要么**该注没注**。⭐ 这正是"界面与我算的不一致"那类 bug 的根源。
        const built = await buildHotInjection(sid, r.project, { score: scoreOptsOf(config) })
        // ⚠️ 指纹集合与 `decideInjection` **必须同源**（否则"缺哪条"算不对）：
        //    封面 id + 画像指纹，空指纹剔除。见那里关于画像的注释。
        const ids = built.preview.map((p) => p.fp).filter((fp) => fp !== '')
        const present = idsInWindow(options.messages as unknown[], ids)
        // ⭐ **顺手记下上下文窗口**（给预算用；见 `WindowSnapshot.contextWindow`）。
        //    ⚠️ 取不到就不写这个字段（前端如实显示"按回落值估算"）。
        const prev = hotState.windows.get(sid)
        const contextWindow = await resolveContextWindow(ctx, options, prev?.contextWindow)
        hotState.windows.set(sid, {
          present,
          at: new Date().toISOString(),
          sessionId: sid,
          ...(contextWindow !== undefined ? { contextWindow } : {}),
        })
      }
    } catch (err) {
      // ⚠️ 观测失败**不能影响出网**。
      try { ctx.logger?.warn?.(`[dsh-memj/hot] 窗口快照失败：${String(err)}`) } catch { /* ignore */ }
    }
    yield* next()
  })

  // ── ② 注入：下一次 pre-step 时补齐缺的（**补注**）──
  ctx.on('agent/pre-step', async (
    payload: { agent: { id: string }; messages: unknown[] },
    next: () => Promise<PreStepDecision>,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    try {
      if (decision === undefined || decision.kind !== 'enter') return decision
      const messages = decision.messages as unknown[] | undefined
      if (!Array.isArray(messages)) return decision
      const sid = typeof payload?.agent?.id === 'string' ? payload.agent.id : ''
      if (sid === '') return decision

      const r = await resolveProject(ctx, sid)
      const window = hotState.windows.get(sid)
      // ⭐⭐⭐ **把 `ctx` 传进去** ⇒ 内存快照缺失时，`decideInjection` 会**自己从会话日志
      //    重建一份**（用户 2026-09-24 报的 bug：重启后明明显示已注入、却仍全量重注）。
      //    🔴 原缺口：重建只写在 `api.ts` 的 `/hot` 里，**注入侧只读内存** ⇒ 两条路各算各的。
      //    ⚠️ 性能：**只在内存没有时**才查日志（读 12MB 日志不便宜，而本钩子每步都跑）
      //       ⇒ 查到立刻写回内存，之后常态零成本。详见 `decideInjection` 的注释。
      const plan = await decideInjection(sid, r.project, window?.present, ctx, scoreOptsOf(config))
      // ⭐ **写回内存**：刚重建的那份立刻生效 ⇒ 本步之后（直到正常出网刷新）
      //    都不用再读日志。⚠️ 这正是"方案 A + 写回"里的"写回"。
      if (plan.rebuilt !== undefined) {
        hotState.windows.set(sid, plan.rebuilt)
        log(`会话 ${sid} 内存快照为空 ⇒ 已从会话日志重建（${plan.rebuilt.present.size} 条）`)
      }

      // ⭐ **记一笔活跃**（裁定 H-4 的淘汰依据；只更新已存在的绑定，不新建）。
      void touchSession(sid, new Date().toISOString()).catch(() => {})

      // ⭐ 判定出项目时**顺手落一次绑定**（下一轮就不用重判；⚠️ 手动绑定不会被覆盖）。
      if (r.project !== HOT_PROJECT_UNKNOWN && r.source === 'doc-reads') {
        const file = await loadSessionsFile()
        const cur = file.sessions[sid]
        if (cur === undefined || cur.source !== 'manual') {
          file.sessions[sid] = {
            project: r.project,
            source: 'doc-reads',
            boundAt: cur?.boundAt !== undefined && cur.boundAt !== '' ? cur.boundAt : new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
          }
          await saveSessionsFile(file)
        }
      }
      // ⚠️ 判不出项目时**只报一次**（本项目纪律：**高频警报会脱敏**）。
      if (r.project === HOT_PROJECT_UNKNOWN && !hotState.warnedNoProject.has(sid)) {
        hotState.warnedNoProject.add(sid)
        log(`会话 ${sid} 未能判定项目 ⇒ 本次只注入全局 + 画像`)
      }

      hotState.lastInject.set(sid, {
        at: new Date().toISOString(),
        injected: plan.injected,
        expected: plan.expected,
        chars: plan.text.length,
        project: plan.project,
      })

      if (plan.text === '') return decision
      // ⭐⭐ **按形态 push 两条消息**（用户 2026-09-24 裁定）——
      //    两段的收尾语义不同，混在一条里就分不开了（详见 `HOT_BODY_CLOSING_INSTRUCTION`）。
      //    ⚠️ 某段为空就跳过（只有 meta 缺、或只有正文缺，都是常态）。
      //    ⚠️ **不唤醒驱动**——`pre-step` 本来就在跑（本项目既有做法，别改成 followup）。
      const push = (text: string): void => {
        messages.push({
          id: `memj-hot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'user',
          content: [{ type: 'text', text }],
          source: { kind: 'plugin:dsh-memj', form: 'instructions' },
        })
      }
      if (plan.bodyText !== '') push(plan.bodyText)
      if (plan.metaText !== '') push(plan.metaText)
      log(`已补注 ${plan.injected.length}/${plan.expected.length} 条`
        + `（正文段 ${plan.bodyText.length} + meta 段 ${plan.metaText.length} 字符）`)
    } catch (err) {
      // 🔴 **注入失败绝不能让这个 step 挂掉**（钩子里抛错会毁掉整个轮次）。
      try { ctx.logger?.warn?.(`[dsh-memj/hot] 注入失败：${String(err)}`) } catch { /* ignore */ }
    }
    return decision
  })
}

/** 重新导出几个常用的（避免调用方从两个模块各 import 一次）。 */
export { loadEntrySettings, settingOf, touchSession, detectProjectByDocReads }
