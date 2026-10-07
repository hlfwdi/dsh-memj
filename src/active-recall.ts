/**
 * ⭐⭐⭐ 主动注入 · **召回**（设计文档《memj 主动注入 · 设计方案》§6、§8）。
 *
 * ── 它做什么 ──────────────────────────────────────────────────────────────
 * 给一段「截止本次思考的上下文」，让一个**可配置的召回模型**判断
 * **要不要知识**（两步判断）并**选出最相关的几条**，返回**条目**（不是文本）。
 *
 * ── 两条通路（§6.1）──────────────────────────────────────────────────────
 * | 通路 | 端点 | 输出 | 语言要求 |
 * |---|---|---|---|
 * | `chat` | OpenAI 兼容（走 DSH 内部路由 `ctx.llm`） | **一行 JSON** | 中文即可 |
 * | `jev`  | Knox `/v1/systemone`（**直连 fetch**） | 结构化分数 `noul` | 🔴 **instructions 必须英文** |
 *
 * 🔴 **不要把"通路"从模型名隐式推导**（如"名字含 jev 就走 systemone"）——
 *    换模型时会**静默走错端点**。**显式配置** `activeInjectChannel`。
 *
 * ── 三条不可动摇的设计约束 ────────────────────────────────────────────────
 * 1. ⭐⭐ **召回模型永不输出正文，只输出序号**（§6.2）⇒ 注入文本由 memj 自己渲染，
 *    与清单**逐字一致**（不靠模型排版 ⇒ 不会漂移、不会编造）；
 * 2. 🔴 **清单必须独占一条 `system` 消息**（§8.2）：清单是输入的大头（≈18k tokens），
 *    若与"每次都变的上下文"同处一条消息，按消息粒度缓存的实现会让**整条**都不命中；
 * 3. 🔴 **绝不传 `sessionId`**（§12 风险 1）：否则会被 `llm/stream` 监听器（含本插件自己的）
 *    判成"会话步" ⇒ **递归**。（JEV 直连天然不经过 `llm/stream`，无此风险。）
 *
 * @module dsh-memj/active-recall
 */

import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { deadline } from '@deepseek-ai/dsh-timeout'
import type { Context } from '@deepseek-ai/cordis'
import { loadEnIndex } from './en-index.ts'
import type { EnIndex, EnIndexEntry } from './en-index.ts'
import type { MemjConfig } from './config.ts'
import { activeDecisionOf, itemMinOf, needMinOf } from './config.ts'
// ⭐⭐⭐ 提示词运行期覆盖（本次新增）：登记默认值 + 取值。
import { promptText, registerPromptDefault } from './prompts.ts'
// ⭐⭐ 上下文组装 + 预算拆批（用户 2026-09-26 定稿方案）：
//     turn 级保留 + 思考独立成字段 + 按剩余预算拆批并发。
import { planInjection, type InjectionPlan } from './active-context.ts'

/**
 * ⭐ 模块级：最近一次预算/拆批编排的诊断（进 `/active`）。
 *
 * 🔴 **为什么要有**：预算这套东西一旦估错，表现只是"上游 400"，
 *    而**看不出它当时算的是多少**。实测踩过：147k 字符的上下文直接把 JEV 撑爆。
 */
let lastBudgetDiag: InjectionPlan | undefined

/** 读最近一次预算/拆批编排的诊断。 */
export function lastBudgetDiagnostic(): InjectionPlan | undefined {
  return lastBudgetDiag
}

/** 诊断日志（跟随项目既有约定：只在配置打开时输出）。 */
function diag(message: string, config: MemjConfig): void {
  if (!config.enIndexDiag) return
  try {
    // eslint-disable-next-line no-console
    console.log(`[dsh-memj/active] ${message}`)
  } catch {
    /* ignore */
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 类型
// ───────────────────────────────────────────────────────────────────────────

/** 一条候选（**来自索引，不回读封面** —— B 方案的速度前提）。 */
export interface Candidate {
  id: string
  project: string
  theme: string[]
  kind: string
  /** 中文标题（**注入文本用它**，§7.3）。 */
  title: string
  desc: string
  /** 英文标题（**只给模型看**：召回质量用）。 */
  titleEn: string
  descEn: string
}

/** 索引条目 → 候选。 */
function toCandidate(id: string, e: EnIndexEntry): Candidate {
  return {
    id,
    project: e.project,
    theme: [...e.theme],
    kind: e.kind,
    title: e.title,
    desc: e.desc,
    titleEn: e.titleEn,
    descEn: e.descEn,
  }
}

/** 一次召回的结论。 */
export interface RecallOutcome {
  /** 是否要注入（`false` = 不注入）。 */
  need: boolean
  /** 选中的条目（**已按清单顺序**、已去重、已越界过滤）。 */
  picks: Candidate[]
  /**
   * ⭐⭐ **本次候选被拆成了多批并发发出**（`batches.length > 1`）。
   *
   * 🔴 **这个名字换过两次，因为机制换过两次**（⚠️ 别照旧名理解）：
   * | 名字 | 当时的机制 | 依据 |
   * |---|---|---|
   * | `prefilted` | 本地**相关性**粗筛（`lexicalPrefilter`，已删） | 候选超 240 硬顶 |
   * | `trimmedByBudget` | **按预算裁候选池**（`trimCandidates`，已删） | 超 token 预算 |
   * | **`batched`（现在）** | ⭐ **拆成多批并发**，**一条候选都不丢** | 用户 2026-09-26 方案 |
   * ⚠️ 共用旧名字会让人推错结论（实测踩过：把"超预算裁了"读成"相关性筛过"）。
   */
  batched: boolean
  /** 评估了多少条候选。 */
  evaluated: number
  /** 池子里**原本**有多少条（= 该范围下的全部候选，**未裁剪时**等于 `evaluated`）。 */
  pool: number
  /** 召回耗时（毫秒）。 */
  ms: number
  /** 非空 = 本次没调模型（拿不到路由 / 无候选 / 额度用尽 …）。 */
  skipped: string
  /** ⭐ **被抑制**（第一步判定"不需要"）—— 与 `skipped` 分开，因为**不计入额度**（§7.4）。 */
  suppressed: string
  /**
   * ⭐⭐ **本次是否真的把请求发出去了**（花了钱）—— 额度口径的**唯一依据**（§7.4②）。
   *
   * 🔴 **计数规则**（用户 2026-09-26 裁定的那张表，逐行照做）：
   * | 情形 | `called` | `suppressed` | 计不计额度 |
   * |---|---|---|---|
   * | 真正发生的调用 | `true` | `''` | ✅ **计** |
   * | **被抑制的**（第一步判定"不需要"） | `true` | 非空 | ❌ **不计** |
   * | 因"没路由 / 索引不可用 / 无候选"跳过 | `false` | — | ❌ 不计 |
   *
   * ⚠️ **不能只看 `called`**：被抑制的那次**也发了请求**（钱花了），但用户明确裁定
   * **不计额度** —— 理由见 `activeInjectMaxCallsPerTurn` 的注释（否则一个 turn 前 3 步
   * 很容易全被抑制，后面"模型摸清情况后"最有价值的那几步反而一次判断都没有）。
   */
  called: boolean
  /** 模型自报的理由（**仅在 `activeInjectExplain` 打开时**才有）。 */
  why: string
  /**
   * ⭐⭐ **三个总控 `noul` 分数**（2026-09-27 新增）—— 召回日志要留痕的那些。
   *
   * 🔴 **为什么把它从函数里带出来**：这三个数**本来就算过了**
   *    （`gateMax('need')` / `gateMax('sufficient')` / `gateMax('search_intent')`），
   *    但**算完就丢** ⇒ 调阈值时**没有分布可看**（实测只能拿单点猜）。
   *    ⚠️ 只在 JEV 通路有值；chat 通路（模型自己给结论）拿不到分数 ⇒ `undefined`。
   */
  scores?: { need?: number; sufficient?: number; searchIntent?: number }
  /**
   * ⭐ B：**发给模型的请求快照**（召回日志的可重放档用）。
   *
   * ⚠️ **只在 `activeRecallLogRequest` 打开时才会被填** ——
   *    否则每步数十 KB 的上下文会把磁盘写爆。
   */
  request?: { state: unknown; questionKeys: string[]; batch?: { index: number; total: number } }
}

/** 空结论（各种"没做"的路径都用它，保证形状一致）。 */
function emptyOutcome(patch: Partial<RecallOutcome> = {}): RecallOutcome {
  return {
    need: false,
    picks: [],
    batched: false,
    evaluated: 0,
    pool: 0,
    ms: 0,
    skipped: '',
    suppressed: '',
    called: false,
    why: '',
    ...patch,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// ① 候选池（§6.0）
// ───────────────────────────────────────────────────────────────────────────

/** 索引里的全部活跃封面（**顺序稳定**：`scanLibrary()` 的写入顺序 ⇒ 追加式缓存的前提）。 */
export function allCandidates(idx: EnIndex): Candidate[] {
  return Object.entries(idx.entries).map(([id, e]) => toCandidate(id, e))
}

/**
 * ⭐ **按范围取候选池**（§6.0）。
 *
 * | 范围 | 内容 |
 * |---|---|
 * | `project` | `project === pid` |
 * | `project+themes` | 项目封面 + 项目 `themes:` 下所有封面（**已去重**） |
 * | `all` | 全库 |
 *
 * 🔴 **会话未绑定项目时**（`pid === ''`）：
 *    `project` / `project+themes` ⇒ **无候选 ⇒ 跳过**。
 *    ⛔ **不要退化成全量** —— 那会让成本突然跳变（"未知"是一等公民）。
 * @param idx - 索引。
 * @param pid - 会话绑定的项目 id（空 = 未绑定）。
 * @param scope - 范围。
 * @returns 候选（`project*` 且未绑定项目时返回空数组）。
 */
export function candidatesForScope(idx: EnIndex, pid: string, scope: string): Candidate[] {
  const all = allCandidates(idx)
  if (scope === 'all') return all
  if (pid === '') return []
  if (scope === 'project') return all.filter((c) => c.project === pid)
  // project+themes
  const themes = new Set(idx.projects[pid]?.themes ?? [])
  return all.filter((c) => c.project === pid || c.theme.some((t) => themes.has(t)))
}

/**
 * ⭐⭐ **JEV 通路把默认档降级成 `project`**（用户 2026-09-26 裁定 B）。
 *
 * 🔴 **为什么**：实测本机 282 条池子下，`project+themes` 在 `dsh-memj` 上是 **245 条
 *    ⇒ 已超 JEV 的 240 硬顶**（`thm-dsh-plugin` 被 6 个项目共享 ⇒ 几乎每个项目的这一档
 *    都被放大到 ~187~245）⇒ 默认配置下会**每次都吃一次本地粗筛**（粗筛会漏）。
 *    ⭐ 降级成 `project` 就落回"**唯一可能不粗筛直接送**"的范围，把确定性换回来。
 * ⚠️ **只影响 JEV 通路**：chat 通路没有 240 硬顶，不必牺牲范围。
 * @param scope - 配置的范围。
 * @param channel - 通路。
 * @param narrow - `activeInjectJevNarrowScope` 开关。
 * @returns 实际生效的范围。
 */
export function effectiveScope(scope: string, channel: string, narrow: boolean): string {
  if (channel === 'jev' && narrow && scope === 'project+themes') return 'project'
  return scope
}

// ───────────────────────────────────────────────────────────────────────────
// ② （已删除）本地粗筛
//
// 🔴 **这里原来有 `grams()` + `lexicalPrefilter()`（字符 bigram 相关性粗筛），
//    已整体删除（2026-09-26）** —— 理由：
//    · 旧的触发点 `activeInjectPoolMax`（"候选超 240 硬顶"）**已被预算机制取代**：
//      现在由 `planBudget` 按 token 预算决定留多少条（§6.5），**不再有"超顶"这个概念**；
//    · ⭐ 而且**两条路径的漏法完全不同**：相关性粗筛按词面漏、预算裁剪按**时间**漏
//      ⇒ 把二者混在一个 `batched` 标志里会让人推错结论（本批实测踩到）。
// ⚠️ **留个记录**：如果日后又要做"相关性粗筛"，它是**另一个策略**，
//    要**单独开一个字段**（如 `trimmedByRelevance`），**不要与预算裁剪共用一个布尔**。
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// ③ 清单与提示词（§6.4、§8.2）
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⭐ 渲染一条候选行。
 *
 * ⚠️ **用英文 `TITLE/DESC` 还是中文？** 两条通路不同（§9.1）：
 *    · `jev`  ⇒ **英文更优**（实测 margin 0.303 → 0.357），且**它有英文译文**
 *    · `chat` ⇒ **中文即可**，但用英文同样成立 ⇒ **统一用英文**（少一条分支）
 * ⚠️ 英文译文可能为空（未翻译完）⇒ **回落中文**（不是错误，§9.4）。
 */
function renderManifestLine(c: Candidate, i: number, english: boolean): string {
  const title = english && c.titleEn !== '' ? c.titleEn : c.title
  const desc = english && c.descEn !== '' ? c.descEn : c.desc
  return `${i + 1}. TITLE: ${title} / DESC: ${desc}`
}

/**
 * ⭐⭐ **渲染知识库清单**（放进 `system` 的**尾部**，独占一条消息 —— §8.2）。
 *
 * 🔴 **必须是"只追加、不改序"**：新知识 append 到末尾 ⇒ 前面全部仍命中前缀缓存。
 *    ⚠️ **已知例外**：**新增项目**会让它后面所有项目的封面**整体后移**
 *    ⇒ 前缀缓存**全废一次**。⭐ 这是本设计**接受的代价**（低频事件），
 *    ⛔ **不要为此去改排序策略**（那会把"低频全废"变成"高频局部失效"）。
 * @param pool - 候选（顺序即清单顺序）。
 * @param english - 是否用英文。
 * @returns 清单文本。
 */
export function renderManifest(pool: Candidate[], english: boolean): string {
  const lines = pool.map((c, i) => renderManifestLine(c, i, english))
  return `【知识库清单】（共 ${pool.length} 条）\n${lines.join('\n')}`
}

/**
 * ⭐ **`system` 的固定头部**（身份 + 输出纪律 + 判断要求）。
 *
 * ⚠️ **这一段永不变** ⇒ 永远命中前缀缓存 ⇒ 放在**清单之前**。
 */
export const JUDGE_HEAD = [
  '你是一个知识召回判断器。你只能从用户给出的知识库清单里挑选条目，不得编造清单外的内容。',
  '你的输出只有一个 JSON 对象，没有任何其他文字、没有 markdown 代码块。',
].join('\n')

/**
 * ⭐⭐ **判断要求**（§6.4②）。
 *
 * 🔴 **第一步 = 两条抑制条件**（各自受一个开关控制）：
 *    **(a) 已有知识足够** —— 含系统注入的背景知识、之前注入的知识，
 *        **以及主模型对它们的反馈**（它在思考里是否引用过、是否说不够、是否说无关）；
 *    **(b) 主模型已表达检索意图**。
 * ⭐ **第二步必须保留**（用户指出）：它负责筛掉**无意义的闲聊** ——
 *    没有它，闲聊轮次也可能被塞进几条不相干的知识。
 *
 * ⚠️ **这里不写"最多 K 条"** —— K 是**可配变量**，写进 `system` 会让它**每次都变**、
 *    把清单一起拖出缓存。K 放 `user`。
 * @param sufficientGate - `(a)` 开关。
 * @param searchIntentGate - `(b)` 开关。
 * @returns 判断要求文本；**两条都关**时退回单步版本。
 */
export function renderJudgeRules(sufficientGate: boolean, searchIntentGate: boolean): string {
  if (!sufficientGate && !searchIntentGate) {
    return [
      '【判断要求】',
      '判断当前上下文是否需要清单里的知识才能更好地完成工作。',
      '如果需要，选出最相关的条目；如果只是闲聊或没有知识需求，输出 {"need":false}。',
    ].join('\n')
  }
  const first: string[] = ['第一步：判断是否已经不需要再注入知识。满足以下任一条，就输出 {"need":false}，不要做第二步：']
  if (sufficientGate) {
    first.push(
      '(a) 当前上下文里已有的知识已经足够 —— 已有的知识包括系统注入的背景知识、之前注入的知识，',
      '    以及主模型对它们的反馈（它在思考里是否引用过、是否说不够、是否说无关）。',
      '    判据：主模型最近的思考里已经引用了这些知识，或这些知识与当前问题的关键点逐条对得上（不是只沾边）。',
    )
  }
  if (searchIntentGate) {
    first.push(
      '(b) 主模型已经表达了要自己去检索知识库的意图',
      '    （例如说"我搜一下 memj"、"查查知识库里有没有"、或已经知道该查哪一条具体知识）。',
    )
  }
  return [
    '【判断要求】',
    ...first,
    '第二步：否则判断当前上下文是否需要清单里的知识才能更好地完成工作。',
    '如果需要，选出最相关的条目。',
  ].join('\n')
}

/** 输出格式说明（`explain` 打开时多要一个 `why` —— **仅调试**）。 */
export function renderOutputSpec(explain: boolean): string {
  if (explain) {
    return [
      '只输出一行 JSON，格式为：',
      '{"need":true,"picks":[编号,...],"why":"一句话理由"}',
      '或',
      '{"need":false,"why":"一句话理由"}',
    ].join('\n')
  }
  return [
    '只输出一行 JSON，格式为：',
    '{"need":true,"picks":[编号,...]}',
    '或',
    '{"need":false}',
  ].join('\n')
}

/**
 * ⭐⭐ **组装 `system`**（身份 + 纪律 + 要求 + **清单**）。
 *
 * 🔴 **顺序**：清单放**最末** ⇒ 身份/纪律/要求那几十个 token 永远命中，
 *    清单变化时**只损失它自己那一段**。
 * ⚠️ **`system` 必须存在** —— WorkBuddy 上游硬要求（首条非 `system` 会 400 `code 11128`）。
 */
export function buildSystemPrompt(opts: {
  pool: Candidate[]
  english: boolean
  sufficientGate: boolean
  searchIntentGate: boolean
  explain: boolean
}): string {
  return [
    JUDGE_HEAD,
    '',
    renderJudgeRules(opts.sufficientGate, opts.searchIntentGate),
    '',
    renderOutputSpec(opts.explain),
    '',
    renderManifest(opts.pool, opts.english),
  ].join('\n')
}

/**
 * ⭐⭐ **组装 `user`**（**只有每次都变的部分** ⇒ 它失效的代价极小）。
 *
 * 🔴 **只写"当前上下文" + 上限 K**：清单留在 `system`。
 * 🔴 **必须写成"正面规定格式"，不要写"禁止额外输出"** ——
 *    实测：否定式硬约束会让模型**整段拒答或塌成 1 个 token**（条目 `11e7619e`）。
 * @param context - 截取的上下文。
 * @param topK - 上限（**放这里而不是 `system`**，见 `renderJudgeRules`）。
 * @param note - 可选的补充说明（如"候选已粗筛"）。
 */
export function buildUserPrompt(context: string, topK: number, note = ''): string {
  return [
    '【当前上下文】',
    context,
    '',
    ...(note !== '' ? [note, ''] : []),
    `最多选 ${topK} 条。`,
  ].join('\n')
}

// ───────────────────────────────────────────────────────────────────────────
// ④ 输出校验（⚠️ **不能信模型** —— §6.4④）
// ───────────────────────────────────────────────────────────────────────────

/** 一次解析的结果。 */
export interface ParsedJudge {
  need: boolean
  /** 原始编号（**未**越界过滤，便于测试断言）。 */
  picks: number[]
  why: string
  /** 非空 = 解析失败（**静默跳过本次召回，绝不影响主会话**）。 */
  error: string
}

/**
 * ⭐ **解析并校验模型输出**（两条通路共用）。
 *
 * 校验三件（§6.4④）：① 编号在 `1..N` 内；② 去重；③ JSON 解析失败 ⇒ 报错跳过。
 * ⚠️ **越界项丢弃、不报错**（模型偶尔会多数一个，那不该毁掉整次召回）。
 * @param text - 模型输出（可能带 markdown 围栏、前后杂字）。
 * @param n - 清单条数。
 * @param explain - 是否期待 `why`。
 */
export function parseJudgeOutput(text: string, n: number, explain: boolean): ParsedJudge {
  const fail = (error: string): ParsedJudge => ({ need: false, picks: [], why: '', error })
  const raw = String(text ?? '').trim()
  if (raw === '') return fail('模型输出为空')
  // 宽容地抠出第一个 JSON 对象（模型可能包 ```json 围栏或加一句话）
  const m = raw.match(/\{[\s\S]*\}/)
  if (m === null) return fail('模型输出里没有 JSON 对象')
  let o: { need?: unknown; picks?: unknown; why?: unknown }
  try {
    o = JSON.parse(m[0]) as typeof o
  } catch {
    return fail('JSON 解析失败')
  }
  const why = explain && typeof o.why === 'string' ? o.why : ''
  if (o.need !== true) return { need: false, picks: [], why, error: '' }
  const list = Array.isArray(o.picks) ? o.picks : []
  const seen = new Set<number>()
  const picks: number[] = []
  for (const v of list) {
    const k = typeof v === 'number' ? v : Number(v)
    // 🔴 编号必须在 1..N 内，且是整数
    if (!Number.isInteger(k) || k < 1 || k > n) continue
    if (seen.has(k)) continue
    seen.add(k)
    picks.push(k)
  }
  // `need:true` 但一条有效编号都没有 ⇒ 当作"不注入"（模型自相矛盾）
  if (picks.length === 0) return { need: false, picks: [], why, error: '' }
  return { need: true, picks, why, error: '' }
}

/**
 * 把编号映射回候选（**按清单顺序**输出 ⇒ 注入文本顺序稳定）。
 * @param picks - 1-based 编号。
 * @param pool - 候选（与清单同序）。
 * @param topK - 上限。
 */
export function pickCandidates(picks: readonly number[], pool: Candidate[], topK: number): Candidate[] {
  const out: Candidate[] = []
  for (const k of [...picks].sort((a, b) => a - b)) {
    const c = pool[k - 1]
    if (c !== undefined) out.push(c)
    if (out.length >= topK) break
  }
  return out
}

// ───────────────────────────────────────────────────────────────────────────
// ⑤ 上下文截取 → **已迁到 `active-context.ts`**
//
// 🔴 **这里原来有一份 `sliceContext`（口径"最近 N 轮的 text 块"），已删除**。
//    原因（2026-09-26 生产实测 + 用户定新方案）：
//    · 那个口径**只给 reasoning 限长、消息部分完全不限** ⇒
//      长会话里截出 **146,591 字符** ⇒ JEV 直接 `max_tokens_exceeded`；
//    · 而且它**按"消息"取而不是按"轮"取** ⇒ 把思考/工具结果全带进来了
//      （实测：思考 166 万字符、工具调用 169 万字符）。
// ⭐ 现在统一走 `active-context.ts` 的 `planBudget`：
//    **turn 级裁剪 + token 预算 + 候选池裁剪**，全部在调模型之前算好。
// ⚠️ **不要在这里再加一份"备用"实现** —— 两份必然漂移（本项目铁律）。
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// ⑥ chat 通路
// ───────────────────────────────────────────────────────────────────────────

/** 拆 `provider/model`（⚠️ **首个 `/`**：模型名里可能还有 `/`，如 `tencent/Hunyuan-MT-7B`）。 */
export function splitRoute(s: string): { provider: string; model: string } | undefined {
  const i = s.indexOf('/')
  if (i <= 0 || i === s.length - 1) return undefined
  return { provider: s.slice(0, i), model: s.slice(i + 1) }
}

/**
 * 从模型输出里取纯文本（**只看 text 块**，reasoning 不算答案）。
 * @param assembler - 已收完的块装配器。
 * @returns 文本，以及**实际收到的块类型清单**（诊断用 —— 见 `chatDiag`）。
 */
function textOf(assembler: BlockAssembler): { text: string; kinds: string[] } {
  const blocks = assembler.blocks()
  const kinds = [...new Set(blocks.map((b) => String(b.type)))]
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
  return { text, kinds }
}

/**
 * ⭐ `chat` 通路最近一次调用的**诊断**（排障用，进 `/active` 的 detail）。
 *
 * 🔴🔴 **为什么必须有它**（2026-09-26 实测踩到的真实缺口）：
 *    端到端跑出 `ms=13 / detail="模型输出为空"` —— **13 毫秒根本发不出一次网络请求**，
 *    但我**无法从任何地方看出到底发生了什么**（是拿不到 llm？是抛异常？
 *    是只回了 reasoning 没有 text？还是被 maxTokens 截断在思考里？）。
 *    ⇒ 于是"模型输出为空"这一个笼统结论，把**四种完全不同的故障**混成了一条消息。
 *    ⭐ 本项目铁律：**可观测性不是可选项** —— 排障时最缺的就是"当时到底收到了什么"。
 *
 * ⚠️ 只记**最近一次**（内存、不落盘、随进程消失）：这是排障信息，不是业务数据。
 */
export interface ChatDiag {
  at: string
  provider: string
  model: string
  /** 两次尝试的结果（`off` = 带关思考档位；`plain` = 不带）。 */
  tries: Array<{
    kind: 'off' | 'plain'
    /** 流是否抛了异常；抛了就记消息。 */
    error: string
    /** 收到的块类型（如 `['reasoning']` = **只有思考、没有正文**）。 */
    kinds: string[]
    /** 取到的正文长度。 */
    chars: number
    ms: number
  }>
}

/** 模块级：最近一次 chat 调用的诊断（**纯内存**）。 */
let lastChatDiag: ChatDiag | undefined

/** 读最近一次 chat 调用的诊断（`/active` 用）。 */
export function lastChatDiagnostic(): ChatDiag | undefined {
  return lastChatDiag
}

/**
 * ⭐ **chat 通路调用**（走 DSH 内部模型路由）。
 *
 * 🔴🔴 **绝不传 `sessionId`** —— 否则被 `llm/stream` 判成"会话步" ⇒ **递归**。
 * 🔴 **`ctx.get('llm')`，不是 `ctx.llm`**：后者运行时是 `undefined`，
 *    被 `try/catch` 吞掉后**只表现为空结果**（本项目真实踩过，见 `en-index.ts`）。
 * ⚠️ **关思考用 `reasoningEffort: 'off'`**（provider-neutral 档位）——
 *    设计文档 §6.4⑤ 写的 `enable_thinking:false` 是针对**直连** WorkBuddy 的形态；
 *    走内部路由时由适配器翻译（deepseek 适配器把 `off` 翻成 `thinking:disabled`）。
 *    ⚠️ 有些模型**不能被关思考**（如 hy3）⇒ 带 `off` 会抛
 *    `UNSUPPORTED_REASONING_EFFORT`。⭐ 那种情况**回落成"不传档位"**再试一次。
 * 🔴 **但"关不掉思考"与"只回思考没回正文"是两回事**（实测）：
 *    后者表现为 `kinds: ['reasoning']` 且 `chars: 0` —— 那种情况**必须报出来**，
 *    否则用户只看到"模型输出为空"，会以为是索引/配置坏了。
 * @returns `{ text, error }`：`error` 非空 = 调用没成（并且原因可读）。
 */
async function callChat(opts: {
  ctx: Context
  config: MemjConfig
  route: { provider: string; model: string }
  system: string
  user: string
}): Promise<{ text: string; error: string }> {
  const llm = opts.ctx.get('llm') as
    | { stream?: (options: unknown) => AsyncIterable<unknown> }
    | undefined
  if (llm?.stream === undefined) {
    lastChatDiag = {
      at: new Date().toISOString(), provider: opts.route.provider, model: opts.route.model,
      tries: [{ kind: 'off', error: 'ctx.get(\'llm\') 拿不到服务', kinds: [], chars: 0, ms: 0 }],
    }
    return { text: '', error: "拿不到 llm 服务（ctx.get('llm') 是 undefined）" }
  }
  const base = {
    provider: opts.route.provider,
    model: opts.route.model,
    system: opts.system,
    messages: [
      createUserMessage({
        content: [{ type: 'text', text: opts.user }],
        source: { kind: 'plugin:dsh-memj' },
      }),
    ],
    temperature: 0,
    maxTokens: 200,
    // 🔴 刻意不传 sessionId（见上方说明）
  }
  const tries: ChatDiag['tries'] = []
  /** 一次尝试；`effort` 为 `'off'` 时带关思考档位。 */
  const attempt = async (kind: 'off' | 'plain'): Promise<string> => {
    const t0 = Date.now()
    const guard = deadline(undefined, opts.config.activeInjectTimeoutMs, 'MEMJ_ACTIVE_RECALL_TIMEOUT')
    try {
      const options = {
        ...base,
        ...(kind === 'off' ? { reasoningEffort: 'off' } : {}),
        signal: guard.signal,
      }
      const assembler = new BlockAssembler()
      for await (const chunk of llm.stream!(options)) assembler.push(chunk as never)
      guard.signal.throwIfAborted()
      const { text, kinds } = textOf(assembler)
      tries.push({ kind, error: '', kinds, chars: text.length, ms: Date.now() - t0 })
      return text
    } catch (err) {
      tries.push({
        kind, error: err instanceof Error ? err.message : String(err),
        kinds: [], chars: 0, ms: Date.now() - t0,
      })
      throw err
    } finally {
      guard[Symbol.dispose]()
    }
  }
  /**
   * 🔴🔴 **两条降级判据，不是一条**（2026-09-26 实测修，这是我自己写的真 bug）：
   *    · **抛异常**（`UNSUPPORTED_REASONING_EFFORT`）⇒ 该换一次；
   *    · ⭐ **没抛、但正文为空**（`kinds` 里只有 `reasoning`、甚至一个块都没有）⇒ **同样该换**。
   *    我第一版只按"抛异常"降级 ⇒ 实测 hy3 上 `off` **不抛、直接回空**
   *    ⇒ 降级**从未发生**，结果恒是"模型没有返回正文"（毫秒级返回，请求根本没发出去）。
   *    ⭐ 判据：**降级的触发条件必须包含"结果不可用"，不能只看"报没报错"** ——
   *    "没报错但什么也没给"是最难查的一类失败。
   */
  const usable = (text: string): boolean => text.trim() !== ''
  try {
    const text = await attempt('off')
    if (usable(text)) {
      lastChatDiag = { at: new Date().toISOString(), provider: opts.route.provider, model: opts.route.model, tries }
      return { text, error: '' }
    }
    // 空正文 ⇒ 落到下面不带档位再试（**不是直接返回空**）
  } catch {
    /* 抛了 ⇒ 同样落到下面再试 */
  }
  try {
    const text = await attempt('plain')
    lastChatDiag = { at: new Date().toISOString(), provider: opts.route.provider, model: opts.route.model, tries }
    if (usable(text)) return { text, error: '' }
    return { text: '', error: '' }
  } catch {
    lastChatDiag = { at: new Date().toISOString(), provider: opts.route.provider, model: opts.route.model, tries }
    return { text: '', error: `两次调用都失败：${tries.map((t) => `${t.kind}=${t.error}`).join('；')}` }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// ⑦ JEV 通路
// ───────────────────────────────────────────────────────────────────────────

/**
 * JEV 的候选提问模板（🔴 **必须英文** —— 中文会让分辨力归零，条目 `efdebc4e`）。
 *
 * ⭐⭐ **点名 `current_thinking` 并声明"其余只是背景"**（用户 2026-09-26 设计意图）。
 * 🔴 **实测依据**（96 条候选、真实会话上下文，两轮一致）：
 *    · 平铺 + 老提问 ⇒ 均值 0.414
 *    · 拆字段 + 点名提问 ⇒ 均值 **0.522**（96/96 条**全部上升**，均值 +0.085~0.109）
 *    · ⚠️ **只拆字段不改提问反而略降**（−0.034）⇒ ⭐ **效果主要来自"提问里点名它"**。
 * ⚠️ 所以**这句措辞不能省** —— 它比字段结构更关键。
 */
export const JEV_CANDIDATE_INSTRUCTION =
  'Does `candidates[N]` directly help with the problem the assistant is currently ' +
  'working through in `current_thinking`? Answer yes only if reading that entry would change ' +
  'what the engineer does next. `background` is supporting material only — do not judge ' +
  'relevance against it; only `current_thinking` defines what is needed right now.'

/** JEV 的"是否需要"提问（英文）。 */
export const JEV_NEED_INSTRUCTION =
  'Does the current context need external knowledge from the list to do this work well?'

/** JEV 的"已有知识是否充足"提问（英文；§6.3）。 */
export const JEV_SUFFICIENT_INSTRUCTION =
  'Does the context already contain enough knowledge to do this work well — including system-injected ' +
  "background, previously injected entries, and the assistant's own reaction to them?"

/**
 * ⭐⭐ JEV 的"搜索意图"提问（英文；§6.3）。
 *
 * 🔴🔴 **2026-09-27 收窄语义**（用户裁定，原话）：
 *    *"我需要确认一下意图门，应该是**只有他有打算用 `memj_search` 或者 `memj_info`
 *      工具去获取信息的检索意图时**，才去拦。而不是只要他有检索意图我就要拦。"*
 *
 * ⚠️ **旧文案为什么错**（`Has the assistant already expressed an intent to search
 *    the knowledge base itself?`）：它没限定"用**哪个**手段" ⇒ **任何**"我该查一下 /
 *    找找看 / 看看知识库"的念头都算命中。而本项目的思考里天然频繁出现这类字眼
 *    ⇒ 实测生产上 `search_intent` = **0.910 / 0.940 / 0.960**（几乎必拦）
 *    ⇒ **主动注入被常态性关闭**（会话 `bcf11432` / `9108fc3f` 实测都是这样被拦的）。
 *
 * ⭐ **新文案为什么对**：**点名两个工具**，判据变成"它是否**明确打算调用**这两个工具"。
 *    ✅ 这样才与这条门的设计意图（"它自己会搜，不用重复给"）对得上 ——
 *        ⚠️ 而**"打算搜" ≠ "搜得到"**（`memj_search` 是整词匹配，实测 top1 只中 **5/10**）
 *        ⇒ 主动注入**正是那个兜底**，不该把它关在"它打算自己搜"上。
 *
 * 🔴 **必须仍是英文** —— 中文会让 JEV 的分辨力归零（条目 `efdebc4e`：
 *    30 条候选全挤在 0.66~0.86、排名接近随机）。
 * ⚠️ 本常量是**每次召回现拼进 `questions` 的**（不进提示词缓存、不进模型上下文）
 *    ⇒ 改它**不影响前缀缓存**，也不属于"写给模型的常驻文本"那六处副本。
 */
export const JEV_SEARCH_INTENT_INSTRUCTION =
  'Has the assistant explicitly stated that it will call the `memj_search` or `memj_info` ' +
  'tool to look something up? Answer yes only if it named one of those tools (or unambiguously ' +
  'described calling them). A general wish to check, look for, or recall information is NOT enough.'

/** 读 JEV 的 `noul` 概率。 */
function noulOf(answers: Record<string, { noul?: unknown }> | undefined, key: string): number {
  const v = answers?.[key]?.noul
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * ⭐⭐ **JEV 调用结果**：答案 + **可重放的请求快照**（2026-09-27）。
 *
 * 🔴 **为什么要把 `state`/`questions` 一起带回来**：召回日志的 B 档
 * （`activeRecallLogRequest`）要能**重放**某次召回，而请求体是在 {@link callJev}
 * **内部**拼的 —— 若不带出来，调用方就只能再拼一遍 ⇒ **两份实现必然漂移**
 * （本项目铁律："同一判据只有一份实现"）。
 */
export interface JevCallResult {
  /** 模型的答案（各问句的 `noul`）；上游没回 `answers` 时 `undefined`。 */
  answers: Record<string, { noul?: unknown }> | undefined
  /** ⭐ 真正发出去的请求体（`state`）；可用于重放。 */
  state: unknown
  /** ⭐ 问了哪些键（`need` / `sufficient` / `search_intent` / `c0..cN`）。 */
  questionKeys: string[]
}

/**
 * ⭐⭐ **JEV 通路调用**（一次请求同时问"总控" + 每条候选）。
 * ⭐ **零额外成本**：输出免费、输入本来就要全发 ⇒ 加判断维度**不增加**成本与延迟。
 * 🔴 **`instructions` 必须英文**；候选与上下文**中文可用**（英文的候选更优）。
 * ⚠️ **`noul` 没有 `confidence` 字段**（只有 `choice`/`score` 有）⇒ 只能用概率本身比阈值。
 *
 * ⭐⭐ **`state` 分成 `current_thinking` + `background` 两个字段**（用户 2026-09-26 设计意图）：
 *    *"除了这个段落，其他都只是背景信息而已，要根据这个段落去判断才对"*。
 *    🔴 实测：这样拆 + 在提问里点名 ⇒ 96/96 条候选分数**全部上升**（均值 +0.085~0.109）。
 *    ⚠️ `background` 为空时**不传该字段**（避免传空串让模型困惑）。
 *
 * ⚠️ **一次请求的总量**（state + 问句，含输出）有上限 ⇒ 候选池要靠 `planInjection` **拆批**。
 * @returns 答案 + **请求快照**（后者供召回日志 B 档重放用）；拿不到凭据/上游失败时 `undefined`。
 */
export async function callJev(opts: {
  ctx: Context
  config: MemjConfig
  /** ⭐ 判据段（本步刚结束的思考）。 */
  thinking: string
  /** 背景段（历史轮 + 当前轮的用户输入/正文/注入）。 */
  background: string
  pool: Candidate[]
  sufficientGate: boolean
  searchIntentGate: boolean
  model: string
  /**
   * ⭐⭐ **本次要用的端点与凭据名**（2026-10-07 多 provider 化）。
   * ⚠️ 由调用方从 `activeDecisionOf(config)` 解出来传进来 —— **不在这里自己读
   *    `config.activeInjectJevEndpoint`**：那是旧单 provider 的键，
   *    多 provider 下会指向错的端点（同族坑：`4a7b1931` 记过"走错端点"）。
   */
  endpoint: string
  keyRef: string
}): Promise<JevCallResult | undefined> {
  const key = await resolveJevKey(opts.ctx, opts.config, opts.keyRef)
  if (key === undefined) return undefined
  const state: Record<string, unknown> = {
    candidates: opts.pool.map((c, i) => ({
      i,
      // ⚠️ 英文更优（实测 margin 0.303 → 0.357）；译文为空则回落中文
      title: c.titleEn !== '' ? c.titleEn : c.title,
      desc: c.descEn !== '' ? c.descEn : c.desc,
    })),
  }
  // ⭐ 判据段永远给（哪怕为空 —— 那是"本步没有思考"，模型该知道）
  state['current_thinking'] = opts.thinking
  // ⚠️ 背景为空就**不传**，别传空串
  if (opts.background !== '') state['background'] = opts.background
  const questions: Record<string, unknown> = {
    // ⭐⭐⭐ **走 `promptText` 取覆盖值**（本次新增）：设置页改完**下一次召回即生效**。
    //    ⚠️ 这是"每次召回现拼"的 —— 既不影响主会话前缀缓存，也不需要重启。
    //    🔴 **四条 JEV 提问必须英文**（中文会让分值分布压平、分辨力归零，条目 `efdebc4e`）
    //       ⇒ 设置页对这四个键做了 `englishOnly` 硬校验。
    need: { type: 'noul', instructions: promptText('jev:need', JEV_NEED_INSTRUCTION) },
  }
  if (opts.sufficientGate) {
    questions['sufficient'] = { type: 'noul', instructions: promptText('jev:sufficient', JEV_SUFFICIENT_INSTRUCTION) }
  }
  if (opts.searchIntentGate) {
    questions['search_intent'] = { type: 'noul', instructions: promptText('jev:search-intent', JEV_SEARCH_INTENT_INSTRUCTION) }
  }
  const candidateInstruction = promptText('jev:candidate', JEV_CANDIDATE_INSTRUCTION)
  opts.pool.forEach((_, i) => {
    questions[`c${i}`] = { type: 'noul', instructions: candidateInstruction }
  })
  const questionKeys = Object.keys(questions)
  const guard = deadline(undefined, opts.config.activeInjectTimeoutMs, 'MEMJ_ACTIVE_JEV_TIMEOUT')
  try {
    const res = await fetch(opts.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: opts.model, state, questions }),
      signal: guard.signal,
    })
    if (!res.ok) return undefined
    const body = (await res.json()) as { answers?: Record<string, { noul?: unknown }> }
    // ⭐ 请求快照**随答案一起回**（B 档要它；拼装只有这一处实现）。
    return { answers: body.answers, state, questionKeys }
  } catch {
    return undefined
  } finally {
    guard[Symbol.dispose]()
  }
}

/**
 * ⭐ 取 JEV 的 API key。
 *
 * 🔴 **两条来源都要试，顺序固定**：
 *    ① `ctx.credentials.resolve()`（**正规通道**；走它的好处是"改凭据不必重启"）
 *    ② `process.env[名字]`（⚠️ 隔离实例就是靠这条路 —— 用户裁定 A：
 *       **用环境变量注入，不把凭据文件复制进测试目录**）
 * ⚠️ **绝不把 key 写进日志/回执**（本项目已发生过密钥明文外泄）。
 * @param keyRefOverride - ⭐⭐ **本次要用哪个凭据名**（2026-10-07 多 provider 化）。
 *   由调用方从 `activeDecisionOf(config)` / `scoreDecisionOf(config)` 解出来传进来
 *   —— 每条 provider **各用自己的派生名**（`deriveDecisionKeyRef`）。
 *   ⚠️ 不传时回落到旧键 `activeInjectJevApiKeyEnv`（兼容老调用点与测试）。
 */
export async function resolveJevKey(
  ctx: Context,
  config: MemjConfig,
  keyRefOverride?: string,
): Promise<string | undefined> {
  const name = (keyRefOverride ?? config.activeInjectJevApiKeyEnv ?? '').trim()
  if (name === '') return undefined
  try {
    const creds = ctx.get('credentials') as
      | { resolve?: (ref: unknown) => Promise<{ value?: string } | undefined> }
      | undefined
    // ⚠️ 不 import `credentialRef`（那会把 `dsh-credentials` 变成硬依赖）：
    //    它的运行时实现就是 `brandString(value)` = **原样返回**，故直接传字符串等价。
    const got = await creds?.resolve?.(name)
    if (typeof got?.value === 'string' && got.value !== '') return got.value
  } catch {
    /* 回落环境变量 */
  }
  const env = process.env[name]
  return typeof env === 'string' && env !== '' ? env : undefined
}

// ───────────────────────────────────────────────────────────────────────────
// ⑧ 召回主流程
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⭐⭐⭐ **一次召回**（两条通路共用入口）。
 *
 * 流程（**预算在调模型之前就算好**，用户 2026-09-26 裁定）：
 *   ① `loadEnIndex()` → 按范围取池；
 *   ② ⭐ **`planBudget`**：组装上下文（turn 级裁剪）+ 必要时裁候选池，
 *      直到总量落在预算内（JEV 50k 旋钮／chat 窗口 60%）；
 *   ③ 调模型 → 解析校验 → 映射回条目。
 *
 * 🔴 **本函数不抛**：召回失败**绝不能影响主会话**（§12 风险 13）。
 * 🔴 **被抑制时填 `suppressed` 而不是 `skipped`** —— 前者**不计入额度**（§7.4）。
 * @param opts - 会话消息快照、本步思考、项目、以及预算来源。
 */
export async function recall(opts: {
  ctx: Context
  config: MemjConfig
  /** 会话绑定的项目 id（空 = 未绑定 ⇒ `project*` 范围跳过）。 */
  project: string
  /** ⭐ `llm/stream` 的 `options.messages` 快照（预算要在内存里按它算）。 */
  messages: readonly unknown[] | undefined
  /** ⭐ **本步刚结束的那次思考**（当前轮保留；历史轮的思考按方案丢弃）。 */
  currentReasoning: string
  /** ⭐ **本会话模型的上下文窗口**（tokens；chat 通路的 60% 靠它）。拿不到时 `undefined`。 */
  contextWindow?: number | undefined
}): Promise<RecallOutcome> {
  const { ctx, config } = opts
  const t0 = Date.now()
  const done = (o: RecallOutcome): RecallOutcome => ({ ...o, ms: Date.now() - t0 })
  try {
    if (config.activeInjectModel === '') return done(emptyOutcome({ skipped: '未配置召回模型' }))
    const idx = await loadEnIndex()
    if (idx === undefined) return done(emptyOutcome({ skipped: '索引不存在（召回只读它）' }))

    const scope = effectiveScope(config.activeInjectScope, config.activeInjectChannel, config.activeInjectJevNarrowScope)
    const full = candidatesForScope(idx, opts.project, scope)
    if (full.length === 0) {
      // ⛔ **不要退化成全量** —— "未知"是一等公民，范围退化会让成本突然跳变
      //
      // 🔴🔴 **这三种病必须分开报**（2026-09-29 修）——
      //    它们**修法完全不同**，而旧文案把三种压成同一句「该范围无候选」：
      //      · 会话没绑项目   ⇒ 去修「会话→项目」判定（或确认它本就不该绑）
      //      · 绑了但索引里没这个项目 ⇒ 绑定指向一个已删/已改名的项目 ⇒ 修绑定
      //      · 绑了、索引里也有 ⇒ 只是没有任何封面落进这个项目（或该项目真的没知识）
      //    ⚠️ 实测代价：630 条日志全是旧文案 ⇒ 无法判断该修哪一处。
      //    判据来自本项目老坑「报错文案把多类原因压成一句会让排障靠猜」。
      let why: string
      if (opts.project === '') {
        why = '会话未绑定项目 ⇒ 该范围无候选'
      } else if (!Object.prototype.hasOwnProperty.call(idx.projects, opts.project)) {
        why = `项目「${opts.project}」不在索引的 projects 映射里 ⇒ 该范围无候选`
      } else {
        why = `项目「${opts.project}」在索引里没有任何条目（scope=${scope}）⇒ 该范围无候选`
      }
      return done(emptyOutcome({ skipped: why }))
    }

    // ⭐⭐⭐ **先算预算并拆批**（这一步定下"上下文给多少、候选分几批"）
    //    ⚠️ 拆批只对 JEV 通路开（`chat` 不拆 ⇒ 并发上限传 1）
    const isJev = config.activeInjectChannel === 'jev'
    const plan = planInjection({
      messages: opts.messages,
      currentReasoning: opts.currentReasoning,
      reasoningCap: config.activeInjectReasoningMaxChars,
      pool: full,
      totalBudget: budgetTokensFor(config, opts.contextWindow),
      contextBudget: config.activeInjectContextTokens,
      maxBatches: isJev ? config.activeInjectConcurrency : 1,
    })
    lastBudgetDiag = plan
    diag(`plan budget=${plan.totalBudget || '∞'} ctx=${plan.contextTokens}/${plan.contextBudget}`
      + ` (${plan.ctx.keptTurns}/${plan.ctx.totalTurns}轮)`
      + ` pool=${full.length}⇒${plan.batches.length}批`
      + ` 每批≈[${plan.perBatchTokens.join(',')}]`
      + (plan.batchesOverKnob ? ` ⚠️**批数超旋钮(${plan.batches.length}>${config.activeInjectConcurrency})**` : '')
      + (plan.overBudget ? ' ⚠️**超预算**' : ''), config)

    const english = true // 两条通路都用英文（§9.1），译文为空时自动回落中文
    if (isJev) {
      return done(await recallViaJev({
        ctx, config,
        thinking: plan.thinking,
        background: plan.background,
        full,
        plan,
      }))
    }
    return done(await recallViaChat({
      ctx, config,
      context: plan.context,
      pool: plan.batches[0] ?? full,
      full,
      batched: plan.batches.length > 1,
      english,
      plan,
    }))
  } catch (err) {
    return done(emptyOutcome({ skipped: `召回异常：${err instanceof Error ? err.message : String(err)}` }))
  }
}

/**
 * ⭐⭐ **这次调用该用多少 token 预算**（两条通路的规则不同）。
 *
 * | 通路 | 上限 | 依据 |
 * |---|---|---|
 * | `jev` | **单次请求 ≤ `activeInjectBudgetTokens`（默认 40000）** | 用户裁定；关掉开关 ⇒ `0` = **不检查** |
 * | `chat` | **≤ 模型上下文窗口的 60%** | 用户裁定；⚠️ 窗口拿不到 ⇒ 不检查（估不准就别乱裁） |
 *
 * 🔴 **注意口径**：JEV 的预算是**单次请求**的上限 ——
 *    每个批次都要带同一份上下文，所以"并发 3 批"的实际覆盖面是 `3 × 每批候选数`。
 * 🔴 **实测支撑**（2026-09-26，英文清单 + 真实会话）：
 *    · 每条候选 ≈ **194 输入 + 18.6 输出**（模型要为每条回一个 `noul`）；
 *    · 198 条候选 + 20k 字符上下文 ⇒ 单批 **400 `max_tokens_exceeded`**，
 *      而拆两批各 99 条 ⇒ **两批都成功**（墙钟 2064ms，与单批持平）。
 * @param config - 插件配置。
 * @param contextWindow - 本会话模型的上下文窗口（chat 通路用）。
 * @returns 预算 token 数；**`0` = 不检查**。
 */
export function budgetTokensFor(config: MemjConfig, contextWindow: number | undefined): number {
  if (config.activeInjectChannel === 'jev') {
    return config.activeInjectBudget ? config.activeInjectBudgetTokens : 0
  }
  // chat：窗口的 60%；拿不到窗口 ⇒ 不检查（宁可不裁，也不要凭猜去裁）
  if (typeof contextWindow !== 'number' || contextWindow <= 0) return 0
  return Math.floor(contextWindow * config.activeInjectChatWindowRatio)
}

/** chat 通路的召回。 */
async function recallViaChat(opts: {
  ctx: Context
  config: MemjConfig
  context: string
  pool: Candidate[]
  full: Candidate[]
  batched: boolean
  english: boolean
  /** ⭐ 本次的预算/拆批明细（进诊断；`overBudget` 要如实报出来）。 */
  plan: InjectionPlan
}): Promise<RecallOutcome> {
  const { ctx, config } = opts
  const route = splitRoute(config.activeInjectModel)
  if (route === undefined) {
    // ⭐ 这条报错要**能直接指引到修法**：`chat` 通路的模型必须是 `provider/model`。
    //    ⚠️ 实测出现过"面板保存把 provider 前缀丢了"⇒ 存成裸模型名
    //    ⇒ 这里报得含糊的话，人会去查索引/网络，而真正的原因是**模型名少了前缀**。
    return emptyOutcome({
      skipped: `chat 通路的模型要写成 provider/model，当前是「${config.activeInjectModel}」`
        + '（去设置面板的「召回模型」重选一个即可）',
    })
  }
  const system = buildSystemPrompt({
    pool: opts.pool,
    english: opts.english,
    sufficientGate: config.activeInjectSufficientGate,
    searchIntentGate: config.activeInjectSearchIntentGate,
    explain: config.activeInjectExplain,
  })
  const user = buildUserPrompt(opts.context, config.activeInjectTopK, opts.batched ? '（候选清单已按 token 预算裁剪过，较早的条目被移出）' : '')
  const got = await callChat({ ctx, config, route, system, user })
  if (got.error !== '') {
    return emptyOutcome({ skipped: `chat 通路调用失败：${got.error}`, evaluated: opts.pool.length, pool: opts.full.length, batched: opts.batched })
  }
  const text = got.text
  if (text.trim() === '') {
    // 🔴 **"没有正文"要报清是哪一种**（见 `ChatDiag` 的注释）：
    //    只回思考、或压根没回内容 —— 两者的处置完全不同（一个该换模型、一个该查调用）。
    const d = lastChatDiagnostic()
    const kinds = d?.tries.at(-1)?.kinds?.join('+') ?? '?'
    return emptyOutcome({
      skipped: `模型没有返回正文（收到的块：${kinds}）—— 若只收到 reasoning，说明该模型关不掉思考、`
        + '思考把 maxTokens 吃完了（换一个能关思考的模型，如 deepseek 系）',
      evaluated: opts.pool.length, pool: opts.full.length, batched: opts.batched, called: true,
    })
  }
  const parsed = parseJudgeOutput(text, opts.pool.length, config.activeInjectExplain)
  if (parsed.error !== '') {
    return emptyOutcome({ skipped: parsed.error, evaluated: opts.pool.length, pool: opts.full.length, batched: opts.batched, called: true })
  }
  if (!parsed.need) {
    // ⭐ 被抑制 ⇒ **请求发了，但额度不计**（§7.4②）
    return emptyOutcome({
      suppressed: '模型判定不需要（已有知识足够 / 已表达检索意图 / 无知识需求）',
      evaluated: opts.pool.length,
      pool: opts.full.length,
      batched: opts.batched,
      called: true,
      why: parsed.why,
    })
  }
  return emptyOutcome({
    need: true,
    picks: pickCandidates(parsed.picks, opts.pool, config.activeInjectTopK),
    evaluated: opts.pool.length,
    pool: opts.full.length,
    batched: opts.batched,
    called: true,
    why: parsed.why,
  })
}

/**
 * JEV 通路的召回。
 *
 * ⭐ **三个"总控 `noul`" + N 个候选 `noul` 仍在一次请求里** ⇒ **零额外成本**。
 * 判定顺序（§6.3）：**充足 ⇒ 不注入；有搜索意图 ⇒ 不注入；
 * `need >= 需求阈值` ⇒ 按分数取 top-K；否则不注入**。
 *
 * 🔴 **两个阈值的分工（2026-09-29 拆开，别混）**：
 *    · `needMin`（总控分 `need`）⇒ 决定「**这一轮要不要**注入」；
 *    · `itemMin`（逐条候选分）  ⇒ 决定「**哪几条**够格入选」。
 *    ⚠️ 它们回答的是两个不同的问题，**分数分布也不同** —— 共用一个阈值时，
 *       两条路里必然有一条的取值是错的（实测：393 次倒在 need、174 次倒在候选）。
 */
async function recallViaJev(opts: {
  ctx: Context
  config: MemjConfig
  /** ⭐ 判据段（本步思考）。 */
  thinking: string
  /** 背景段。 */
  background: string
  full: Candidate[]
  /** ⭐ 拆批结果（每批一次请求；**并发**发出）。 */
  plan: InjectionPlan
}): Promise<RecallOutcome> {
  const { ctx, config } = opts
  const batches = opts.plan.batches
  // ⭐⭐ **本次要用哪条 provider**（端点 + 模型 + 派生凭据名）——**解一次、全程复用**。
  //    ⚠️ 取值口径见 `activeDecisionOf`（选集优先、回落旧键）——
  //       别在这里自己拼 `config.activeInjectJevEndpoint`（那是旧单 provider 的键）。
  const pick = activeDecisionOf(config)
  if (pick.endpoint === '' || pick.model === '') {
    // ⚠️ 没配 provider 或没选模型 ⇒ **如实说清该去哪配**（别静默不注入）。
    return emptyOutcome({
      skipped: '未配置决策模型（或该 provider 下没有模型）⇒ 去「设置 → 决策模型配置」里加一个 provider 并选模型。',
    })
  }
  /**
   * ⭐⭐ **并发发出全部批次**（实测：拆两批的墙钟 ≈ 单批，因为瓶颈是网关排队而不是模型计算 ——
   *    实测 96 条单批 2013ms vs 拆两批并发 1958ms，比值 0.97×）。
   *
   * 🔴 **每批单独计时并记进诊断** —— 曾经出现过"整次召回 30 秒（正好撞超时）"
   *    却看不出**是哪一批慢**的情况 ⇒ 没有每批耗时就只能猜。
   */
  const batchMs: number[] = []
  // ⭐ 请求快照（B 档）——**取第一批**代表整次召回：
  //    ⚠️ 各批的 `state` 只差 `candidates` 那一段（上下文是同一份），
  //       全存会把日志撑大数倍；重放时用"第一批"就够复现判定口径。
  let reqSnapshot: RecallOutcome['request']
  const results = await Promise.all(
    batches.map(async (batch, bi) => {
      const t0 = Date.now()
      const r = await callJev({
        ctx,
        config,
        thinking: opts.thinking,
        background: opts.background,
        pool: batch,
        sufficientGate: config.activeInjectSufficientGate,
        searchIntentGate: config.activeInjectSearchIntentGate,
        // ⭐⭐⭐ 多 provider：模型 / 端点 / 凭据名**都来自本次选中的那条 provider**。
        //    ⚠️ 取值口径见 `activeDecisionOf`（选集优先、旧键回落）——
        //       别在这里自己拼，也别读旧的 `activeInjectJevEndpoint`（那是单 provider 时代的键）。
        model: pick.model,
        endpoint: pick.endpoint,
        keyRef: pick.keyRef,
      })
      batchMs[bi] = Date.now() - t0
      // ⭐ B 档：只有**开了开关**才留快照（默认关 —— 每步数十 KB，几轮就能写爆磁盘）。
      if (bi === 0 && r !== undefined && config.activeRecallLogRequest) {
        reqSnapshot = {
          state: r.state,
          questionKeys: r.questionKeys,
          batch: { index: 1, total: batches.length },
        }
      }
      diag(`jev batch ${bi + 1}/${batches.length}: ${batch.length} 条 耗时=${batchMs[bi]}ms `
        + `${r === undefined ? '❌失败' : '✅成功'}`, config)
      return r
    }),
  )

  // ⚠️ **失败批次的处置**：只要有**一批**返回了结果就继续（部分成功好过全丢）；
  //    全部失败才报失败。⚠️ 但要在诊断里如实标明**成功了几批**。
  const okIdx = results.map((r, i) => (r === undefined ? -1 : i)).filter((i) => i >= 0)
  if (okIdx.length === 0) {
    // ⚠️ 这里**分不清**"没凭据没发出去"与"发出去了但上游报错" ⇒ 统一按 `called:false`
    return emptyOutcome({ skipped: `JEV 通路调用失败（${batches.length} 批全失败：拿不到 KNOX_API_KEY 或上游报错）` })
  }
  const base = {
    evaluated: opts.full.length,
    pool: opts.full.length,
    batched: batches.length > 1,
    called: true,
    // ⭐ B 档快照（只在开关打开时有值；`undefined` 时字段不进 JSON）。
    ...(reqSnapshot !== undefined ? { request: reqSnapshot } : {}),
  }

  // ── ⭐ 门控合并：**取各批的最大值**（用户裁定；任一批认为"够充足/有意图"就认）──
  const gateMax = (key: string): number =>
    Math.max(...okIdx.map((i) => noulOf(results[i]?.answers, key)))
  // ⭐⭐ **把三个总控分数一次算齐并带进返回值**（2026-09-27）——
  //    🔴 它们**本来就都要算**（三道门各读一次），这里只是**别算完就丢**：
  //       召回日志（A 档）要靠它们回答"为什么没注入 / 阈值该怎么调"。
  //    ⚠️ 未启用的门**也要算**（值本身有诊断价值：能看到"如果开了会怎样"）。
  const scores = {
    need: gateMax('need'),
    sufficient: gateMax('sufficient'),
    searchIntent: gateMax('search_intent'),
  }
  if (config.activeInjectSufficientGate) {
    const s = scores.sufficient
    if (s >= config.activeInjectSufficientMin) {
      return emptyOutcome({ ...base, scores, suppressed: `已有知识充足（${s.toFixed(3)} ≥ ${config.activeInjectSufficientMin}）` })
    }
  }
  if (config.activeInjectSearchIntentGate) {
    const s = scores.searchIntent
    if (s >= config.activeInjectSearchIntentMin) {
      return emptyOutcome({ ...base, scores, suppressed: `主模型已有检索意图（${s.toFixed(3)} ≥ ${config.activeInjectSearchIntentMin}）` })
    }
  }
  const need = scores.need
  const needMin = needMinOf(config)
  if (need < needMin) {
    return emptyOutcome({ ...base, scores, suppressed: `需求分 ${need.toFixed(3)} < ${needMin}` })
  }

  // ── ⭐⭐ 选取（用户 2026-09-26 裁定）────────────────────────────────────
  //    *"过线的，按照我们设定的最大注入条数去分数最高的 topN。
  //      过线的如果不超过我们设定的最大注入条数，那就直接都给就可以了。"*
  //    ⇒ **跨批合并成一个池**再按分数排序取 topN（不足 N 条就全给）。
  const scored: { c: Candidate; score: number }[] = []
  const itemMin = itemMinOf(config)
  for (const bi of okIdx) {
    const ans = results[bi]?.answers
    ;(batches[bi] ?? []).forEach((c, i) => {
      const score = noulOf(ans, `c${i}`)
      if (score >= itemMin) scored.push({ c, score })
    })
  }
  scored.sort((a, b) => b.score - a.score)
  const picks = scored.slice(0, config.activeInjectTopK).map((s) => s.c)
  if (picks.length === 0) {
    // `need` 过高但没有一条候选过带 ⇒ 不注入（**不是抑制**，是"没选出东西"）
    //
    // ⚠️ 文案里**必须同时出现两个门槛**：`need` 说的是"这轮确实需要"，
    //    这里失败的是"候选够格"那一个 ⇒ 只报一个数字会让人误以为要调错的那个旋钮。
    return emptyOutcome({
      ...base,
      scores,
      skipped: `need=${need.toFixed(3)}（≥${needMin}）但无候选达到条目阈值 ${itemMin}`,
    })
  }
  const batchNote = batches.length > 1
    ? `，${batches.length} 批并发（成功 ${okIdx.length}；各批 ${batchMs.join('/')}ms）`
    : ''
  return emptyOutcome({ ...base, scores, need: true, picks, why: `need=${need.toFixed(3)}${batchNote}` })
}

// ───────────────────────────────────────────────────────────────────────────
// ⑨ 注入文本（§6.2、§7.3）
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⭐⭐ **注入文本的收尾指令**（条目 `ee1034ef`）。
 *
 * 🔴 **为什么必须写硬**：注入的是**背景知识，不是任务** ——
 *    没有收尾指令时，模型会自作主张地"用上"它们（去读正文、去改库、去补全）。
 * ⚠️ **放在渲染函数末尾** ⇒ 保证每个变体都带上。
 */
export const ACTIVE_CLOSING_INSTRUCTION = `---

⭐ **以上是背景知识，不是任务**；结合上述知识继续当前工作。`

// ⭐⭐⭐ **主动召回的两行表头**（2026-10-12 抽成常量 + 走 `promptText`）。
//
// 🔴 **为什么它们也算提示词**：它们**逐字写在注入给模型的那段文本里** ——
//    尤其第二行（"正文按需读"）直接决定模型会不会去调 `memj_read` 取正文。
//    ⭐ 判据同 `inject.ts`：**能改变模型怎么做的文本就是提示词**。
// ⚠️ 改它们**不改变召回集合**（那是代码判据），只改"模型怎么看这批内容"。
export const ACTIVE_HEADER = '⭐ **以下是知识库里与当前工作相关的知识（主动召回）。**'
export const ACTIVE_BODY_HINT = '只给标题与描述，**正文按需读** —— 用 `memj_read` 传 `id`。'

// ⭐ **登记默认值**（展示页要用；覆盖优先级见 `prompts.ts`）。
registerPromptDefault('active:closing', ACTIVE_CLOSING_INSTRUCTION)
registerPromptDefault('jev:candidate', JEV_CANDIDATE_INSTRUCTION)
registerPromptDefault('jev:need', JEV_NEED_INSTRUCTION)
registerPromptDefault('jev:sufficient', JEV_SUFFICIENT_INSTRUCTION)
registerPromptDefault('jev:search-intent', JEV_SEARCH_INTENT_INSTRUCTION)
// ⭐⭐⭐ **主动召回的两行表头**（2026-10-12 抽成常量 + 走 `promptText`）。
//
// 🔴 **为什么它们也算提示词**：它们**逐字写在注入给模型的那段文本里** ——
//    尤其第二行（"正文按需读"）直接决定模型会不会去调 `memj_read` 取正文。
//    ⭐ 判据同 `inject.ts`：**能改变模型怎么做的文本就是提示词**。
// ⚠️ 改它们**不改变召回集合**（那是代码判据），只改"模型怎么看这批内容"。
registerPromptDefault('active:header', ACTIVE_HEADER)
registerPromptDefault('active:body-hint', ACTIVE_BODY_HINT)

/**
 * ⭐⭐ **渲染注入文本**（由 **memj 自己**渲染，不靠模型排版 —— §6.2）。
 *
 * ⚠️ 用的是**清单里那份中文 title/desc** ⇒ **逐字一致**，不会漂移、不会编造。
 * @param picks - 选中的条目。
 * @param note - 可选的前置说明（如"本次是主动召回"）。
 */
export function renderActiveInjection(picks: readonly Candidate[], note = ''): string {
  if (picks.length === 0) return ''
  const parts: string[] = []
  parts.push(promptText('active:header', ACTIVE_HEADER))
  parts.push(promptText('active:body-hint', ACTIVE_BODY_HINT))
  parts.push('')
  for (const c of picks) {
    const kind = c.kind === '' ? '' : ` [${c.kind}]`
    parts.push(`- \`${c.id}\`${kind} **${c.title}** — ${c.desc}`)
  }
  if (note !== '') {
    parts.push('')
    parts.push(note)
  }
  parts.push('')
  // ⭐⭐⭐ **走 `promptText` 取覆盖值**（本次新增；收尾指令是用户逐字定过的措辞，
  //    页面上改它属于"用户自己的决定"，不是我们擅自改）。
  parts.push(promptText('active:closing', ACTIVE_CLOSING_INSTRUCTION))
  return parts.join('\n')
}
