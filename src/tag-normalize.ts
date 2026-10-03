/**
 * 标签规范化：三层算法（决策 162）。
 *
 * ── 三层，**贵的那层按水位线、便宜的那层全量** ─────────────────────────────
 * | 层 | 成本 | 范围 | 干什么 |
 * |---|---|---|---|
 * | **B 裁决** | 贵（LLM + 正文） | **只有水位线之后** | 裁决**词表里没有的**新 tag |
 * | **A 应用** | **零 LLM**（纯查表） | **全库** | 按词表把 alias 换成 canonical |
 * | **C 英文** | 便宜（只喂 canonical 列表） | 只补**缺 `en`** 的 | 生成英文规范词 |
 *
 * 执行顺序 **B → A → C → rebuild 一次**。
 * ⇒ A 在 B 之后跑，**顺带把 B 新定的合并传播到全库**（含水位线之外的旧条目）。
 *
 * ── 🔴🔴 为什么必须有 A 层（这是本设计最容易漏的一层）──────────────────────
 * ```
 * 第 1 次：新 tag `静默故障` → LLM 判"新建 canonical" → 词表 += 静默故障
 * 第 5 次：词表更新，判定 `静默故障` 该并入 `静默失败`
 *          🔴 但含 `静默故障` 的条目 updatedAt 太旧 ⇒ 不在 B 的范围里
 *          ⇒ 词表说"要合"，数据里却还留着旧词 —— 【永久不一致】
 * ```
 * **A 层纯查表、跑全库不要钱** ⇒ 词表一变，下次运行自动扫干净全库的旧 alias。
 *
 * ── 水位线（用户 2026-09-28 定）───────────────────────────────────────────
 * - 判据：`updatedAt !== '' ∧ updatedAt > lastRunAt`
 * - ⭐ **首次运行把 `lastRunAt` 初始化为「现在」** ⇒ 范围为空、不花钱，只建词表；
 * - 🔴 **无 `updatedAt` 的【drop】**（现在 59 条，全是活跃知识）。
 *   ⚠️ **不能"宽大处理算在内"**：写入刻意**不碰 `updatedAt`**（保留时间维度）
 *   ⇒ 它们**永远拿不到时间戳** ⇒ 每次运行都会被重新喂一遍正文、**永远出不去**。
 *   ⇒ 要覆盖它们只能用 `full: true`。
 * - 🔴 **`lastRunAt` 必须在【开工前】取**，不是收工后 ——
 *   否则运行期间被改的条目会**永久漏掉**（水位线已经越过它们了）。
 *
 * @module dsh-memj/tag-normalize
 */
import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { deadline } from '@deepseek-ai/dsh-timeout'
import type { MemjConfig } from './config.ts'
import type { Cover } from './schema.ts'
import { scanLibrary } from './store.ts'
// ⭐⭐⭐ 提示词运行期覆盖（本次新增）：登记默认值 + 两处调用走 `promptText`。
import { promptText, registerPromptDefault } from './prompts.ts'
import {
  aliasIndex, applyMerges, emptyVocabulary, findAliasConflicts, loadVocabulary,
  resolveMerges, resolveTag, saveVocabulary,
  type TagVocabulary,
} from './tag-vocab.ts'

/** 一次规范化的范围选项。 */
export interface NormalizeOptions {
  /** 覆盖水位线：只处理此时间之后更新过的（ISO）。 */
  since?: string
  /** 无视水位线，全库重跑。 */
  full?: boolean
  /** 正文给不给、给多少（默认 `'truncated'`）。 */
  includeBody?: 'none' | 'truncated' | 'full'
  /** `true` = 只看不改。 */
  preview?: boolean
}

/** 一个「待裁决」的候选 tag 及其证据。 */
export interface PendingTag {
  tag: string
  /** ⭐ **全库频次**（不是范围内的）——让模型知道这个词有多 established。 */
  count: number
  /**
   * ⭐ 它**已经在词表里**吗（= 是个已有的规范词或别名）。
   *
   * 🔴 **只是给模型的信息，不是过滤条件** —— 词表是**选项清单**：
   *    "已经在里面"意味着模型**可以复用它**，**不等于**"它不用被裁决"。
   */
  inVocabulary: boolean
  /** 它出现在哪些条目上（只带 id 与标题，正文另按开关附）。 */
  samples: Array<{ id: string; title: string; project: string }>
}

/** 一条待改的条目。 */
export interface AffectedEntry {
  id: string
  project: string
  from: string[]
  to: string[]
  /** ⭐ 若是 `retag` 改的，带上模型的理由（供人复核）。 */
  retagWhy?: string
}

/** 一次规范化的完整结果。 */
export interface NormalizeResult {
  ok: boolean
  /** 给人/模型看的回执。 */
  message: string
  /** 水位线之后（或全库）参与裁决的条目数。 */
  scanned: number
  /** 待裁决的候选 tag（B 层的输入）。 */
  pending: PendingTag[]
  /**
   * 词裁决。⚠️ **值都带"为什么"**（用户要求：改/删/新增必须给理由；
   * 缺理由的决定会被硬校验丢掉，并记进 `rejected`）。
   */
  decided: {
    /** `tag` → 合并目标。 */
    merged: Record<string, string>
    /** `tag` → 合并理由。 */
    mergeWhy: Record<string, string>
    /** `tag` → 新增理由。 */
    added: Record<string, string>
    /** `tag` → 丢弃理由。 */
    dropped: Record<string, string>
  }
  /** ⭐ 按正文修正过的条目（`retag`）：`id` → 新 tag 列表 + 理由。 */
  retagged: Array<{ id: string; from: string[]; to: string[]; why: string }>
  /** ⚠️ 被硬校验丢弃的决定（缺理由 / 越界 / 已在词表里还 add…）。 */
  rejected: string[]
  /** 待改（或已改）的条目。 */
  affected: AffectedEntry[]
  /** C 层补了几条英文。 */
  translatedEn: number
  /** `true` = 只预览、没写库。 */
  previewOnly: boolean
  /** 词表统计（回执用）。 */
  vocabStats: { canonical: number; aliases: number; withEn: number }
}

/** 回执里最多列几条改动（避免刷屏）。 */
const MAX_LIST = 12

/**
 * 空裁决（各种**提前返回**路径共用）。
 *
 * ⚠️ 抽成函数是刻意的：它有 **5 处**调用点（路由拿不到 / JSON 不可解析 /
 *    有环 / 冲突 / 正常无候选），逐处手写必然漏字段（TS 会报，但漏的形态
 *    取决于当时写的是哪几个键）——本项目"同一份东西抄五遍必然漂移"的老坑。
 * @returns 空的 `decided`。
 */
function emptyDecided(): NormalizeResult['decided'] {
  return { merged: {}, mergeWhy: {}, added: {}, dropped: {} }
}

/**
 * **各种提前返回路径共用的空结果碎片**（`ok:false` 时用）。
 *
 * ⚠️ 同上：5 处提前返回，逐处手写 `retagged: []` / `rejected: []` 必然漏
 * （TS 会报，但我已经在这个文件里漏过一次字段了）。
 * @param previewOnly - 是否预览。
 * @param vocab - 当前词表（算 `vocabStats`）。
 * @param scanned - 参与裁决的条目数。
 * @param pending - 候选。
 * @returns 可直接展开进返回值的片段。
 */
function emptyTail(
  previewOnly: boolean,
  vocab: TagVocabulary,
  scanned: number,
  pending: PendingTag[],
): Pick<NormalizeResult, 'scanned' | 'pending' | 'decided' | 'retagged' | 'rejected' | 'affected' | 'translatedEn' | 'previewOnly' | 'vocabStats'> {
  const entries = Object.values(vocab.canonical)
  return {
    scanned,
    pending,
    decided: emptyDecided(),
    retagged: [],
    rejected: [],
    affected: [],
    translatedEn: 0,
    previewOnly,
    vocabStats: {
      canonical: entries.length,
      aliases: entries.reduce((s, e) => s + e.aliases.length, 0),
      withEn: entries.filter((e) => e.en !== '').length,
    },
  }
}

/**
 * B 层：裁决提示词。
 *
 * ⚠️ 英文更稳（同 `en-index` 的教训：中文问句会让判断力弱的模型分辨率归零）。
 *
 * 🔴🔴 **它必须【允许动已有规范词】**：我第一版把输入写成"NEW tags（词表里没有的）"
 * 并且只接受"新词"作为键 ⇒ 加上播种把全库 tag 都登记成了 canonical
 * ⇒ **LLM 结构上永远无法合并两个已登记的规范词** ⇒ 词表变成**单向棘轮**
 * （进了词表就再也动不了）。⭐ 用户指出："词表只作为选项和上下文，
 * **所有的处理全都应该交给模型**"。
 */
const ADJUDICATE_SYSTEM = `You curate the TAG VOCABULARY of a personal knowledge base.

INPUT
- "VOCABULARY": the canonical tags that already exist, each with its aliases.
  ⚠️ This is a list of OPTIONS to prefer and reuse — it is NOT a whitelist.
  You MAY merge, rename or drop an existing canonical when it is genuinely wrong,
  but you MUST justify it (see RULES).
- "TAGS IN SCOPE": every tag used by the entries being processed, with its
  frequency in the whole library. Tags already in VOCABULARY appear here too.
- "ENTRIES": the knowledge entries (id, title, current tags, and optionally an
  excerpt of the body).

TASK — decide, and explain every decision:
1. "merge": <tag> means the SAME concept as <target>. Give the target and WHY.
   Typical cases: case/spelling variants (dsh -> DSH, css -> CSS); synonyms
   (排查 -> 排障); a variant folding into a higher-frequency entry point.
2. "drop": <tag> conveys nothing on its own and has no suitable target.
   Give WHY. (e.g. 设计 / 顺序 / 边界 / 处理 / 问题 as a bare word)
3. "add": <tag> is a genuinely NEW topic that the existing vocabulary does not
   cover. Give WHY — and the reason must show that the entries actually discuss
   something the vocabulary cannot express. ⚠️ Do NOT add a new canonical merely
   because a tag is missing from the vocabulary — if it is a synonym or a
   variant of an existing canonical, use "merge" instead.
4. "retag": for an entry whose tags do NOT fit its body, give the corrected list
   and WHY. This is the only place where a tag may be ADDED to or REMOVED from
   an entry. ⚠️ Only do this when the body clearly supports it; when in doubt,
   leave the entry alone (do not output it).

RULES

🔴 RULE 1 — LEVEL CHECK (this is the rule most often violated; read it first).
Before ANY merge, ask these two questions about the source and target:
  (a) Is the TARGET a general category (other, more specific things could also be called by it)?
  (b) Is the SOURCE a specific form, implementation, or proper name of that category?
  If BOTH are yes, it is a broader-into-narrower (or narrower-into-broader) relation:
  **DO NOT MERGE.** Keep both.

Concrete patterns that MUST NOT be merged (regardless of how similar they look):
  - generic noun  vs  specific name     : 钩子 vs turn-stopping ; 工具 vs memj_read
  - category  vs  specific implementation: agent vs 子代理 ; 模型 vs JEV
  - same concept in two LANGUAGES        : 会话 vs session ; 缓存 vs cache
    (the user ruled that Chinese and English tags stay separate — do NOT unify them)
  - broader term vs its subtype          : 前端 vs UI ; 缓存 vs 前缀缓存 ; 注入 vs 主动注入

⚠️ Do NOT reason "they are related, so merge them". Related is not the same as same.
⚠️ Do NOT merge a HIGH-frequency general word into a LOW-frequency specific one,
   or the reverse — frequency difference is itself a hint that levels differ.
   If "TAGS IN SCOPE" shows one tag covering many entries across different topics
   while the other covers one narrow entry, they are almost certainly different levels.

RULE 2 — PREFER REUSE over invention. A new canonical is a long-term commitment —
only add one when the concept is real, recurring, and not already expressible.
When in doubt, do NOT add.

RULE 3 — A high-frequency generic tag can be a useful ENTRY POINT: prefer merging its
variants INTO it (测试策略 -> 测试) rather than dropping it. NOTE: this is about the
generic tag KEEPING its role as an entry point — it does NOT license merging a
specific name into it when that name denotes a distinct thing (see RULE 1).

⚠️ "why" must be a REAL reason (one short clause), not a restatement of the
decision. "they are the same" is not a reason; "same concept, dsh is just the
lowercase spelling" is. Decisions without a reason are REJECTED.
⭐ When you merge, state in "why" WHICH case it is (spelling variant / synonym /
plural / abbreviation) — if you cannot name one of those cases, do not merge.
- Only mention tags that appear in "TAGS IN SCOPE", and entry ids from "ENTRIES".

Reply with ONLY a JSON object, no prose, no code fence. Every value needs "why":
{"merge":{"<tag>":{"to":"<target>","why":"..."}},
 "drop":{"<tag>":{"why":"..."}},
 "add":{"<tag>":{"why":"..."}},
 "retag":{"<entry id>":{"tags":["..."],"why":"..."}}}
Use {} for any category you have no decision about.`

/** C 层：生成英文规范词的提示词。 */
const TRANSLATE_SYSTEM = `Translate each Chinese knowledge-base tag into a short English canonical tag.
Rules:
- Lowercase, except well-known acronyms and product names (CSS, DSH, PowerShell, YAML, CDP, UI, JEV).
- Keep it 1-3 words, no punctuation, no trailing period.
- Use the same English term for tags that mean the same thing.
Reply with ONLY a JSON object mapping the Chinese tag to its English form,
no prose, no code fence.`

// ⭐⭐⭐ **登记默认值**（本次新增；展示页要用）。
// 🔴 **判据段必须保持英文**：这两段是给标签规范化模型看的，且 B 层的"层级自检"
//    是实测调出来的措辞（曾因措辞不清做出三处错误层级归并）⇒ 页面上可改，
//    但改动会影响裁决质量 —— 元数据里如实标注了归属与用途。
registerPromptDefault('tag:system', ADJUDICATE_SYSTEM)
registerPromptDefault('tag:translate-system', TRANSLATE_SYSTEM)

/** 读取正文（按开关截断）。 */
async function loadBodyExcerpt(cover: Cover, mode: NonNullable<NormalizeOptions['includeBody']>): Promise<string> {
  if (mode === 'none' || cover.ext) return ''
  const { loadEntryDoc } = await import('./store.ts')
  const doc = await loadEntryDoc(cover.ref, cover.ext)
  const body = (doc?.body ?? '').trim()
  if (body === '') return ''
  const limit = mode === 'full' ? Number.POSITIVE_INFINITY : 1000
  return body.length > limit ? `${body.slice(0, limit)}…` : body
}

/**
 * 一次纯模型调用。
 *
 * 🔴🔴 **绝不传 `sessionId`**（同 `en-index`）：`llm/stream` 上挂着监听器
 * （含本项目自己的热知识看门狗），它们靠 `isSessionStep = sessionId && !purpose`
 * 区分"这是不是会话步" ⇒ 传了就会**自己触发自己**。
 * ⚠️ `purpose` **不能当解药**（它是受控两值，填哪个都是冒用别人的语义）。
 * @param ctx - 插件上下文。
 * @param config - 配置。
 * @param route - 模型路由。
 * @param system - 系统提示词。
 * @param user - 用户消息。
 * @returns 模型输出；失败时 `undefined`。
 */
/**
 * 一次纯模型调用的结果（**带诊断**）。
 *
 * 🔴🔴 **为什么要带诊断，而不是只回一个字符串**（2026-09-28 真机实测出的洞）：
 *    在隔离实例上用 `hy3` 跑，得到 `finish=length、思考 11109 字符、输出 0 字符`
 *    —— 也就是**模型把 maxTokens 全烧在思考上、正文一个字没有**。
 *    而我的代码把它归成"**没有返回可解析的 JSON**"。
 *    ⚠️ **那是一句会把人带偏的话**：看到它第一个念头是"提示词让它输出错格式了"，
 *    而真因是"**输出为空**"（该调参 / 该换模型 / 该调大 maxTokens）。
 *    ⭐ 这正是本项目已沉淀的判据：**降级的触发判据要包含「结果不可用」，
 *       不能只看抛没抛异常**（条目 `c8723080`）—— 我当时把那条知识用在了
 *       "要不要降级"上，**却没用在"错误怎么报"上**。
 *    ⇒ 现在把 `empty` / `finish` / 思考字符数**如实带出来**。
 */
interface ModelReply {
  text: string
  /** 是否**一个字都没输出**（与"输出了但不是 JSON"完全不同）。 */
  empty: boolean
  /** 上游 finish 原因（`length` = 撞 maxTokens 被截断）。 */
  finish: string
  /** 思考字符数（⚠️ hy3 这类模型关不掉思考 ⇒ 会挤占 maxTokens）。 */
  reasoningChars: number
  /** 是否真的发起了调用（拿不到 `llm` 服务时为 false）。 */
  called: boolean
}

async function callModel(
  ctx: Context,
  config: MemjConfig,
  route: { provider: string; model: string },
  system: string,
  user: string,
): Promise<ModelReply> {
  const messages = [
    createUserMessage({
      content: [{ type: 'text', text: user }],
      source: { kind: 'plugin:dsh-memj' },
    }),
  ]
  const guard = deadline(undefined, config.tagNormalizeTimeoutMs, 'MEMJ_TAG_NORMALIZE_TIMEOUT')
  // 🔴 **必须 `ctx.get('llm')`，不是 `ctx.llm`**（声明合并让它能过 typecheck、运行时却是
  //    `undefined` ⇒ 被 catch 吞掉 ⇒ 只表现为"什么都没发生"）。详见 `en-index.ts` 的注释。
  const llm = ctx.get('llm') as
    | { stream?: (options: unknown) => AsyncIterable<unknown> }
    | undefined
  if (llm?.stream === undefined) {
    return { text: '', empty: true, finish: '', reasoningChars: 0, called: false }
  }
  try {
    const assembler = new BlockAssembler()
    // ⭐⭐⭐ **思考等级必须显式传**（决策 168，用户要求关到最低）。
    //    🔴 **为什么"跟随主会话模型"也要传**：主会话可能带 `high` 档
    //       （实测 parent 的 requestHeader 就是 `hy3 + reasoningEffort:high`）
    //       ⇒ 不传就会**继承一个高思考档**，而这一步只需要"判同义"。
    //    ⚠️ 空串 ⇒ **不传这个字段**（让它用上游默认）—— 与"关到最低"的意图相反。
    const effort = config.tagNormalizeReasoningEffort
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      messages,
      system,
      temperature: 0,
      maxTokens: config.tagNormalizeMaxTokens,
      signal: guard.signal,
      ...(effort === '' ? {} : { reasoningEffort: effort }),
      // 🔴 刻意不传 sessionId
    })) {
      assembler.push(chunk as never)
    }
    guard.signal.throwIfAborted()
    const blocks = assembler.blocks()
    const text = blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
    const reasoningChars = blocks
      .filter((b) => b.type === 'reasoning')
      .reduce((s, b) => s + (b as { text: string }).text.length, 0)
    return {
      text,
      empty: text.trim() === '',
      finish: String((assembler.finish as { kind?: string } | undefined)?.kind ?? ''),
      reasoningChars,
      called: true,
    }
  } catch (err) {
    return {
      text: '',
      empty: true,
      finish: `异常：${err instanceof Error ? err.message : String(err)}`.slice(0, 120),
      reasoningChars: 0,
      called: true,
    }
  } finally {
    guard[Symbol.dispose]()
  }
}

/** 从模型输出里抠出第一个 JSON 对象（容忍 ```json 围栏与前后噪音）。 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = fenced?.[1] ?? text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return undefined
  }
}

/**
 * 跑一次规范化（三层）。
 * @param ctx - 插件上下文（B/C 层要调模型）。
 * @param config - 配置。
 * @param opts - 范围与开关。
 * @returns 结果（含回执）。
 */
export async function normalizeTags(ctx: Context, config: MemjConfig, opts: NormalizeOptions = {}): Promise<NormalizeResult> {
  const mode = opts.includeBody ?? 'truncated'
  const previewOnly = opts.preview === true
  const nowIso = new Date().toISOString()

  // ⭐⭐ **水位线在【开工前】取**（收工后取会漏掉运行期间被改的条目）。
  const openedAt = nowIso
  let vocab = await loadVocabulary()
  const firstRun = vocab === undefined
  // ⭐ 首次运行：**水位线初始化成「现在」**（用户定）⇒ 范围为空、不花钱，只建词表。
  if (vocab === undefined) vocab = emptyVocabulary(openedAt)

  const startedFrom = opts.since ?? vocab.lastRunAt
  const useWatermark = opts.full !== true && opts.since === undefined

  // ── 冲突检测：alias 指向多个 canonical ⇒ 拒绝（否则结果取决于键序）──
  const conflicts = findAliasConflicts(vocab)
  if (conflicts.length > 0) {
    return {
      ok: false,
      message:
        `词表有 **${conflicts.length} 处 alias 冲突**（同一同义词指向多个规范词）` +
        '——必须先修掉，否则合并结果取决于对象键序：\n' +
        conflicts.map((c) => `  · \`${c.alias}\` → ${c.targets.map((t) => `\`${t}\``).join(' 与 ')}`).join('\n'),
      ...emptyTail(previewOnly, vocab, 0, []),
    }
  }

  const snapshot = await scanLibrary({ includeArchived: true })
  const idx = aliasIndex(vocab)
  // ⚠️ 先把水位线取成局部常量：TS 的窄化**不进闭包**，直接引用会让整个回调
  //    报 "possibly undefined"（而那只是类型问题，不是真的会 undefined）。
  const watermark = vocab.lastRunAt

  // ── 选范围（B 层，贵）─────────────────────────────────────────────────
  const inScope = snapshot.covers.filter((c) => {
    if (opts.full === true) return true
    const t = c.cover.updatedAt ?? ''
    // 🔴 **无时间戳的 drop**（见模块头注释：它们永远出不去）。
    if (t === '') return false
    if (opts.since !== undefined) return t > opts.since
    if (useWatermark) return t > watermark
    return true
  })

  // ── 收集候选：**范围内知识涉及的全部 tag**（⭐ 不再按词表过滤）─────────
  //
  // 🔴🔴 **这里曾经是整条链路最致命的 bug**：原来写的是
  //     `if (resolveTag(t, idx) !== undefined) continue  // 词表里有 ⇒ 不是新词`
  //     ⇒ **凡在词表里的 tag 一律不进候选**。而播种又把库里所有 tag 都登记进了
  //     词表 ⇒ **LLM 永远看不到要归一的那些词**（实测：253 条参与裁决、
  //     0 个候选、**LLM 调用 0 次** —— 工具完全空转）。
  //
  // ⭐ **用户给的定性**（2026-09-28）：*"词表只作为选项和上下文，
  //    所有的处理全都应该交给模型。"*
  //    ⇒ 词表是**参照物**（帮模型优先复用已有词），**不是过滤器**。
  //
  // ⚠️ 范围仍由**水位线**限制（看哪些知识），这与"候选要不要过滤"是两件事：
  //    水位线管成本，词表管判断 —— 不能把两者混成一个条件。
  const globalFreq = new Map<string, number>()
  // ⭐⭐ **样本取自【全库】而不是 `inScope`**（决策 166 优化 ②）：
  //    我们要给模型的是"**这个 tag 覆盖多广**"——那是**全局属性**。
  //    ⚠️ 若只从 `inScope` 取，一个跨 6 条的总类词可能因为本轮只碰到 1 条
  //       而显示成"only 1 entry" ⇒ **层级判据直接就错了**。
  const globalSamples = new Map<string, PendingTag['samples']>()
  for (const c of snapshot.covers) {
    for (const t of c.cover.tags) {
      globalFreq.set(t, (globalFreq.get(t) ?? 0) + 1)
      const arr = globalSamples.get(t) ?? []
      if (arr.length < 3) {
        arr.push({ id: c.cover.id, title: c.cover.title, project: c.cover.project })
        globalSamples.set(t, arr)
      }
    }
  }
  const pendingMap = new Map<string, PendingTag>()
  for (const c of inScope) {
    for (const t of c.cover.tags) {
      if (!pendingMap.has(t)) {
        pendingMap.set(t, {
          tag: t,
          count: globalFreq.get(t) ?? 0,
          // ⭐ 如实告诉模型"它已经在词表里了"——它是**选项**，不是新词。
          inVocabulary: resolveTag(t, idx) !== undefined,
          // ⭐ 覆盖样本取自**全库**（见上面 `globalSamples` 的理由）。
          samples: globalSamples.get(t) ?? [],
        })
      }
    }
  }
  const pending = [...pendingMap.values()].sort((a, b) => b.count - a.count)

  // ── B 层：裁决 ────────────────────────────────────────────────────────
  // ⭐ 三项决定都带**理由**（用户要求：改/删/新增都必须说明为什么）。
  const merged: Record<string, string> = {}
  const mergeWhyAll: Record<string, string> = {}
  const added: Record<string, string> = {}
  const addWhyAll: Record<string, string> = {}
  const dropped: Record<string, string> = {}
  const dropWhyAll: Record<string, string> = {}
  /** ⭐ `retag`：按正文修条目的 tag（**唯一允许增删条目 tag 的通道**）。 */
  const retagAll = new Map<string, { tags: string[]; why: string }>()
  /** ⚠️ 被硬校验丢弃的决定（**必须如实报出**，否则模型不知道输出被削过）。 */
  const rejectedAll: string[] = []
  let adjudicationNote = ''

  if (pending.length > 0 && firstRun && opts.full !== true && opts.since === undefined) {
    // ⚠️ 首次运行范围为空的**正常路径**：不该走到这（pending 必为空），
    //    但若用户手工塞了个词表进来、里面没登记库里的老词，这里会拦一道。
    adjudicationNote = '（首次运行：水位线已初始化为现在，未裁决任何历史 tag）'
  } else if (pending.length > 0) {
    // 🔴 **规模护栏**：候选与正文都是**一次请求**发出去（不拆批）。
    //    实测（生产规模 253 条 + 680 个 tag）：`full` + `truncated(1000)` 约
    //    **14 万 token** ⇒ 会 400（上游上限远小于此），且**花了钱才发现**。
    //    ⚠️ 本工具与 `active-recall` 不同：那里有拆批机制，这里没有
    //    （裁决要看**全局**，拆批会让同一个词在不同批里被判出不同结论）。
    //    ⇒ 所以宁可**明确拒绝并告诉怎么降**，也不要发出去 400。
    // ⭐ 每条候选的估算从 30 → **60**：本轮加了「覆盖证据」行（最多 150 条带上它，
    //    每条约 40~60 字符中文标题）⇒ 按最坏情况算，别让护栏漏判。
    const estTokens = Math.round(
      (Object.keys(vocab.canonical).length * 40 + pending.length * 60 +
        (mode === 'none' ? 0 : inScope.length * (mode === 'full' ? 3000 : 1000))) / 2,
    )
    if (estTokens > 60000) {
      return {
        ok: false,
        message:
          `⚠️ **这次请求会太大**（约 ${estTokens} token：${pending.length} 个候选 tag、` +
          `${inScope.length} 条正文、词表 ${Object.keys(vocab.canonical).length} 条）——**未发出**。\n` +
          '⚠️ 本工具**不拆批**（裁决要看全局，拆批会让同一个词在不同批里判出不同结论）⇒\n' +
          '    请任选其一降规模：\n' +
          '      · `includeBody: \'none\'`（不喂正文，最省）；\n' +
          '      · 去掉 `full`，让它只处理水位线之后的知识（**常态用法**）；\n' +
          '      · 先用 `preview: true` 看规模，再决定。',
        ...emptyTail(previewOnly, vocab, inScope.length, pending),
      }
    }
    const route = resolveRoute(ctx, config)
    if (route === undefined) {
      return {
        ok: false,
        message:
          `发现 **${pending.length} 个候选 tag** 需要裁决，但**拿不到模型路由**。\n` +
          '⚠️ 请在设置面板里配好「标签裁决模型」（`tagNormalizeProvider` / `tagNormalizeModel`），' +
          '或让主会话有默认模型。',
        ...emptyTail(previewOnly, vocab, inScope.length, pending),
      }
    }
    // 组请求：词表（**选项清单**）+ 候选（**范围内涉及的全部 tag**）+ 条目正文
    const lines: string[] = ['## VOCABULARY (options to prefer and reuse — NOT a whitelist)']
    for (const [canon, info] of Object.entries(vocab.canonical)) {
      lines.push(`- ${canon}${info.aliases.length > 0 ? ` (aliases: ${info.aliases.join(', ')})` : ''}`)
    }
    lines.push('', '## TAGS IN SCOPE (every tag used by the entries below)')
    // ⭐⭐ **给出「覆盖范围」证据**（决策 166 优化 ②）——这是治本的一步。
    //
    // 🔴🔴 **为什么必须给**：生产上真出过"上位吞下位"的事故 ——
    //    模型把 `子代理`/`subagent` 并进了 `agent`（`agent` 是总类，主会话自己也是 agent）、
    //    把 `turn-stopping` 并进了 `钩子`（通名吞掉具体名）。
    //    ⚠️ **光看两个词本身判不出层级**（那是**语义关系**，不是词的形态）——
    //    但**看它们各自覆盖哪些条目，层级一眼就出来了**。
    //    ⭐ 所以这里把每个候选 tag 的**覆盖条目数 + 最多 3 个标题**一并给模型。
    //    ⚠️ 白名单**必须有上限**（生产规模下 600+ 候选，全给标题会撑爆请求）：
    //       只给**跨 2 条以上**的那些（覆盖 1 条的词本来就谈不上"总类"），且最多 150 个。
    const showCoverage = (p: PendingTag): string => {
      if (p.samples.length === 0) return ''
      const titles = p.samples.slice(0, 3).map((s) => s.title)
      // ⚠️ 用 `count === 1` 而不是 `samples.length`：samples 只收了前 3 个样本。
      const span = p.count === 1 ? 'only 1 entry' : `across ${p.count} entries`
      return `  ← ${span}: ${titles.map((t) => `「${t}」`).join(' ')}`
    }
    // ⚠️ **必须有上限**：生产规模下 600+ 候选，逐个加覆盖行会让请求**翻倍**。
    //    只给"**跨 2 条以上**"的（覆盖 1 条的词本来就谈不上"总类"，层级判据用不上），
    //    且最多 `MAX_COVERAGE` 条 —— 其余照旧只给频次。
    const MAX_COVERAGE = 150
    let coverageShown = 0
    for (const p of pending) {
      lines.push(`- ${p.tag}  [frequency: ${p.count}]${p.inVocabulary ? '  (already in vocabulary)' : ''}`)
      if (p.count >= 2 && coverageShown < MAX_COVERAGE) {
        const cov = showCoverage(p)
        if (cov !== '') { lines.push(cov); coverageShown += 1 }
      }
    }
    // ⭐ 如实说明"覆盖证据是抽样给的"——否则模型以为没给的就是"只覆盖 1 条"。
    if (coverageShown >= MAX_COVERAGE && pending.length > MAX_COVERAGE) {
      lines.push(
        `(coverage evidence shown for the first ${MAX_COVERAGE} multi-entry tags only;` +
          ' tags without it are either single-entry or beyond that limit)',
      )
    }
    if (mode !== 'none') {
      lines.push('', '## ENTRIES')
      // ⚠️ 这里存的是 **Cover 本身**（不是 ParsedCover）——所以下面直接传 `cover`。
      const byId = new Map(snapshot.covers.map((c) => [c.cover.id, c.cover]))
      // ⭐ **按条目**组织（不是按 tag）——因为 `retag` 判的是"这一条的 tag 合不合适"，
      //    按 tag 分组会让同一条的正文被重复贴很多次（浪费 token 且看不出全貌）。
      for (const c of inScope) {
        const cover = byId.get(c.cover.id)
        if (cover === undefined) continue
        const body = await loadBodyExcerpt(cover, mode)
        lines.push(`### id: ${c.cover.id} | ${c.cover.title}`)
        lines.push(`current tags: ${c.cover.tags.join(', ')}`)
        if (body !== '') lines.push('body excerpt:', body)
        lines.push('')
      }
    }
    const reply = await callModel(ctx, config, route, promptText('tag:system', ADJUDICATE_SYSTEM), lines.join('\n'))
    const parsed = reply.text === '' ? undefined : extractJson(reply.text)
    if (parsed === undefined || typeof parsed !== 'object' || parsed === null) {
      // 🔴 **如实区分三种失败**（别把"输出为空"说成"格式不对"）：
      //    ① 拿不到 llm 服务；② 输出为空；③ 真输出了但JSON 解析不出。
      //    ⭐⭐ 决策 168 起，② 又多了一种**具体**成因（本批实测）：
      //       **模型不支持 `off` 档** —— 实测 `hy3` + `off` = **2ms 返回空正文**
      //       （不是"思考烧光预算"，而是"这个档位对它无效 ⇒ 直接空响应"）。
      //       ⚠️ 它**不抛异常**（本项目条目 `c8723080` 那个坑）⇒ 必须靠**症状**认出来。
      //       判据：**思考字符为 0 且耗时极短且正文为空**。
      const effortNow = config.tagNormalizeReasoningEffort
      const looksUnsupported =
        reply.empty && reply.reasoningChars === 0 && effortNow !== ''
      const diag =
        !reply.called
          ? '拿不到 `llm` 服务（`ctx.get(\'llm\')` 为空）。'
          : reply.empty
            ? `**模型没有输出任何内容**（finish=\`${reply.finish}\`，思考 ${reply.reasoningChars} 字符）。\n` +
              (looksUnsupported
                ? `    ⚠️ **思考为 0 而正文也为空** ⇒ 很可能是**这个模型不支持 \`${effortNow}\` 档**\n` +
                  `       （实测：\`hy3\` + \`off\` 会在 **2ms** 内返回空正文，且**不报错**）。\n` +
                  '       · 换 `deepseek-v4.1-flash`（实测 `off` 下思考 0、正文正常）；\n' +
                  '       · 或把「思考等级」改成**空**（不传，让它用上游默认）。'
                : '    ⚠️ 若 `finish=length` 且思考字符很多 ⇒ **思考吃掉了 maxTokens**：\n' +
                  '       · 换一个**能关掉思考**的模型（实测 `hy3` 关不掉，会烧光输出预算）；\n' +
                  '       · 或调大 `tagNormalizeMaxTokens`。')
            : `模型**输出了内容但不是可解析的 JSON**（${reply.text.length} 字符）。\n` +
              `    （片段：${reply.text.slice(0, 200)}）`
      return {
        ok: false,
        message: `裁决失败，本轮**未写入任何东西**。\n  ${diag}`,
        ...emptyTail(previewOnly, vocab, inScope.length, pending),
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 🔴🔴 **硬校验：每条改/删/新增都必须给出理由**（用户 2026-09-28 要求）
    //
    // 原话：*"如果要改或者删已有的候选词必须给出理由"* +
    //       *"不能随意增加新的规范词，除非正文确实在描述一个词表里没有覆盖的事情"*。
    //
    // 形状：`{ "静默故障": { "to": "静默失败", "why": "..." } }`
    // ⚠️ **没有 `why` 的决定一律丢弃**（不是拒整轮）——理由缺失是**单条**的问题，
    //    不该让本轮其余正确的裁决一起陪着不写（那会让工具"时好时坏"、难以察觉）。
    //    ⚠️ 但**必须如实报出被丢弃的条数**，否则模型不会知道自己的输出被削过。
    // ══════════════════════════════════════════════════════════════════════
    const rejected: string[] = []
    const candidateSet = new Set(pending.map((p) => p.tag))
    /** 取 `why`；太短（<8 字符）视为"没给理由"（"same" 这种不算理由）。 */
    const whyOf = (v: unknown): string => {
      if (v === null || typeof v !== 'object') return ''
      const w = (v as { why?: unknown }).why
      return typeof w === 'string' ? w.trim() : ''
    }
    const reasonOk = (w: string): boolean => w.length >= 8

    const o = parsed as { merge?: unknown; add?: unknown; drop?: unknown; retag?: unknown }
    const rawMerge: Record<string, string> = {}
    const mergeWhy: Record<string, string> = {}
    if (o.merge !== null && typeof o.merge === 'object') {
      for (const [k, v] of Object.entries(o.merge as Record<string, unknown>)) {
        // ⭐ **键必须是本轮的候选词**（模型不能凭这条通道去动一个本轮根本没碰的词）
        if (!candidateSet.has(k)) { rejected.push(`merge \`${k}\`（不在本轮候选里）`); continue }
        const to = typeof (v as { to?: unknown })?.to === 'string' ? String((v as { to: string }).to).trim() : ''
        const why = whyOf(v)
        if (to === '') { rejected.push(`merge \`${k}\`（缺 to）`); continue }
        if (!reasonOk(why)) { rejected.push(`merge \`${k}\`（**缺理由**）`); continue }
        // ⭐ 目标也必须在候选或词表里（否则是把词并到一个不存在的东西上）
        if (!candidateSet.has(to) && resolveTag(to, idx) === undefined) {
          rejected.push(`merge \`${k}\`→\`${to}\`（目标是词表外的未知词）`); continue
        }
        rawMerge[k] = to
        mergeWhy[k] = why
      }
    }
    const addList: string[] = []
    const addWhy: Record<string, string> = {}
    if (o.add !== null && typeof o.add === 'object') {
      for (const [k, v] of Object.entries(o.add as Record<string, unknown>)) {
        if (!candidateSet.has(k)) { rejected.push(`add \`${k}\`（不在本轮候选里）`); continue }
        // ⭐ **已经在词表里的词不能再 add**（那是"复用"，不是"新增"）
        if (resolveTag(k, idx) !== undefined) { rejected.push(`add \`${k}\`（**已在词表里**，应走复用）`); continue }
        const why = whyOf(v)
        // 🔴 **新增规范词的门槛比合并高**：用户要求"不能随意增加"。
        //    合并判错只是换个写法（还能从词表看出来），**新增判错会永久多一个桶**。
        if (!reasonOk(why) || why.length < 20) {
          rejected.push(`add \`${k}\`（**理由不足**：新增规范词要说明"正文在讲词表覆盖不了的事"）`); continue
        }
        addList.push(k)
        addWhy[k] = why
      }
    }
    const dropList: string[] = []
    const dropWhy: Record<string, string> = {}
    if (o.drop !== null && typeof o.drop === 'object') {
      for (const [k, v] of Object.entries(o.drop as Record<string, unknown>)) {
        if (!candidateSet.has(k)) { rejected.push(`drop \`${k}\`（不在本轮候选里）`); continue }
        const why = whyOf(v)
        if (!reasonOk(why)) { rejected.push(`drop \`${k}\`（**缺理由**）`); continue }
        dropList.push(k)
        dropWhy[k] = why
      }
    }
    // ⭐ `retag`：按正文修某条知识的 tag（**唯一允许增删条目 tag 的通道**）
    const retag = new Map<string, { tags: string[]; why: string }>()
    if (o.retag !== null && typeof o.retag === 'object') {
      const inScopeIds = new Set(inScope.map((c) => c.cover.id))
      for (const [id, v] of Object.entries(o.retag as Record<string, unknown>)) {
        if (!inScopeIds.has(id)) { rejected.push(`retag \`${id.slice(0, 8)}\`（不在本轮范围内）`); continue }
        const tags = Array.isArray((v as { tags?: unknown })?.tags)
          ? ((v as { tags: unknown[] }).tags).map((x) => String(x).trim()).filter((x) => x !== '')
          : []
        const why = whyOf(v)
        if (!reasonOk(why)) { rejected.push(`retag \`${id.slice(0, 8)}\`（**缺理由**）`); continue }
        // 🔴 安全阀：空列表会违反"tags 至少 1 个"的硬校验
        if (tags.length === 0) { rejected.push(`retag \`${id.slice(0, 8)}\`（**改成了空列表**）`); continue }
        retag.set(id, { tags, why })
      }
    }
    Object.assign(mergeWhyAll, mergeWhy)
    Object.assign(addWhyAll, addWhy)
    Object.assign(dropWhyAll, dropWhy)
    retagAll.clear()
    for (const [k, v] of retag) retagAll.set(k, v)
    rejectedAll.push(...rejected)

    // 🔴 **解析传递合并**（`A→B` 且 `B→C` ⇒ `A→C`；有环则拒绝整组）
    const resolved = resolveMerges(rawMerge)
    if (!resolved.ok) {
      return {
        ok: false,
        message:
          `裁决结果里有**循环合并**（${resolved.cycle.map((c) => `\`${c}\``).join(' → ')}），本轮**未写入**。\n` +
          '⚠️ 循环合并会让结果取决于应用顺序 ⇒ 必须人工看一眼。',
        ...emptyTail(previewOnly, vocab, inScope.length, pending),
      }
    }
    Object.assign(merged, resolved.map)
    for (const t of addList) if (!(t in merged)) added[t] = addWhy[t] ?? ''
    for (const t of dropList) dropped[t] = dropWhy[t] ?? ''
  }

  // ── 更新词表（B 层的结论）────────────────────────────────────────────
  const nextVocab: TagVocabulary = applyMerges(vocab, merged)
  for (const t of Object.keys(added)) {
    if (nextVocab.canonical[t] === undefined) nextVocab.canonical[t] = { aliases: [], en: '' }
  }
  for (const t of Object.keys(dropped)) delete nextVocab.canonical[t]

  // ── A 层：应用（**全库、纯查表、零 LLM**）────────────────────────────
  //    🔴 这一层**不受水位线限制** —— 它的职责正是"把词表的新决定传播到全库"。
  const applyIdx = aliasIndex(nextVocab)
  const affected: AffectedEntry[] = []
  for (const c of snapshot.covers) {
    // ⭐⭐ **`retag` 优先**：那是模型**看着正文**判的"这条该有什么 tag"，
    //    比"按词表换写法"更权威 ⇒ 有 retag 就用它，再走一遍 alias 归一。
    const rt = retagAll.get(c.cover.id)
    const source = rt !== undefined ? rt.tags : c.cover.tags
    const to: string[] = []
    for (const t of source) {
      const r = resolveTag(t, applyIdx)
      if (r === undefined) {
        // 词表里没有的（首次运行的老词 / 被 drop 的）⇒ 原样保留
        if (!to.includes(t)) to.push(t)
        continue
      }
      if (!to.includes(r)) to.push(r)
    }
    // ⭐ 安全阀：全被删光 ⇒ 保持原样（否则违反"至少 1 个"，且失败是静默的）
    const final = to.length === 0 ? [...c.cover.tags] : to
    if (JSON.stringify(final) !== JSON.stringify(c.cover.tags)) {
      affected.push({
        id: c.cover.id, project: c.cover.project,
        from: [...c.cover.tags], to: final,
        ...(rt !== undefined ? { retagWhy: rt.why } : {}),
      })
    }
  }

  // ── 写库（非预览时）──────────────────────────────────────────────────
  let written = 0
  if (!previewOnly && affected.length > 0) {
    const { setEntryFields } = await import('./edit.ts')
    for (const a of affected) {
      const r = await setEntryFields(a.id, { tags: a.to }, { preserveUpdatedAt: true, allowArchived: true })
      if (r.ok) written += 1
    }
    const { rebuildDerivedLayers } = await import('./store.ts')
    await rebuildDerivedLayers()
  }

  // ── C 层：英文规范词（**单独一次调用**，用户定）──────────────────────
  let translatedEn = 0
  if (!previewOnly) {
    const needEn = Object.entries(nextVocab.canonical).filter(([, v]) => v.en === '')
    if (needEn.length > 0) {
      const route = resolveTranslateRoute(ctx, config)
      if (route !== undefined) {
        const chunks = chunkBy(needEn.map(([k]) => k), 80)
        for (const chunk of chunks) {
          const reply = await callModel(
            ctx, config, route, promptText('tag:translate-system', TRANSLATE_SYSTEM),
            `Tags:\n${chunk.map((t) => `- ${t}`).join('\n')}`,
          )
          // ⚠️ C 层失败**不阻塞**（英文只是增强）——但要如实计入未翻条数。
          const parsed = reply.text === '' ? undefined : extractJson(reply.text)
          if (parsed === null || parsed === undefined || typeof parsed !== 'object') continue
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (nextVocab.canonical[k] !== undefined && typeof v === 'string' && v.trim() !== '') {
              nextVocab.canonical[k].en = v.trim()
              translatedEn += 1
            }
          }
        }
      }
    }
  }

  // ── 落盘：词表 + 水位线【同一个文件】──────────────────────────────────
  if (!previewOnly) {
    nextVocab.lastRunAt = openedAt
    await saveVocabulary(nextVocab)
  }
  vocab = nextVocab

  // ── 回执 ──────────────────────────────────────────────────────────────
  const stats = vocabStatsOf(vocab)
  const mergedCount = Object.keys(merged).length
  const lines: string[] = []
  lines.push(
    `${previewOnly ? '🔍 **预览**（未写入）' : '✅ **标签规范化完成**'} —— ` +
      `词表 ${stats.canonical} 个规范词 / ${stats.aliases} 个同义词 / ${stats.withEn} 条有英文。`,
  )
  lines.push(`范围：${inScope.length} 条参与裁决${opts.full === true ? '（**全库重跑**）' : `（水位线 ${startedFrom}）`}`)
  if (pending.length === 0) lines.push('候选 tag：**0 个**（水位线之后没有需要看的知识）。')
  else {
    lines.push(
      `候选 tag：${pending.length} 个（其中 **${pending.filter((p) => p.inVocabulary).length} 个已在词表里**` +
        '——⚠️ 它们**照样被送去裁决**，词表只是选项清单）' +
        ` → 合并 ${mergedCount}、新增 ${Object.keys(added).length}、丢弃 ${Object.keys(dropped).length}`,
    )
  }
  // ⭐ **把理由报出来**（用户要求改/删/新增都要有理由 ⇒ 人也该看得到）
  for (const [k, why] of Object.entries(mergeWhyAll).slice(0, MAX_LIST)) {
    lines.push(`  · 合并 \`${k}\` → \`${merged[k]}\`：${why}`)
  }
  for (const [k, why] of Object.entries(addWhyAll).slice(0, MAX_LIST)) {
    lines.push(`  · ⭐ 新增规范词 \`${k}\`：${why}`)
  }
  for (const [k, why] of Object.entries(dropWhyAll).slice(0, MAX_LIST)) {
    lines.push(`  · 丢弃 \`${k}\`：${why}`)
  }
  if (retagAll.size > 0) {
    lines.push(`⭐ 按正文修正的条目：**${retagAll.size} 条**（` +
      '这是唯一会增删条目 tag 的通道）')
    for (const [id, v] of [...retagAll.entries()].slice(0, MAX_LIST)) {
      lines.push(`  · ${id.slice(0, 8)}：${v.tags.join(', ')} —— ${v.why}`)
    }
  }
  if (affected.length === 0) lines.push('条目改动：**0 条**（词表决定已全部落到数据上）。')
  else {
    lines.push(`条目改动：**${affected.length} 条**${previewOnly ? '' : `（已写 ${written}）`}`)
    for (const a of affected.slice(0, MAX_LIST)) {
      lines.push(`  · ${a.project}/${a.id.slice(0, 8)}：${a.from.join(', ')}  →  ${a.to.join(', ')}`)
    }
    if (affected.length > MAX_LIST) lines.push(`  …（还有 ${affected.length - MAX_LIST} 条）`)
  }
  // ⚠️ **必须如实报**：不报的话模型以为自己的决定都生效了（本项目"回执要如实"的一贯要求）。
  if (rejectedAll.length > 0) {
    lines.push(
      `⚠️ **${rejectedAll.length} 条决定被硬校验丢弃**（缺理由 / 越界 / 已在词表里还"新增"…）：\n` +
        rejectedAll.slice(0, MAX_LIST).map((r) => `  · ${r}`).join('\n') +
        '\n    ⇒ 改/删已有词、新增规范词**都必须给 `why`**；新增还要说明' +
        '"正文在讲词表覆盖不了的事"。',
    )
  }
  if (translatedEn > 0) lines.push(`英文规范词：新增 ${translatedEn} 条。`)
  if (adjudicationNote !== '') lines.push(adjudicationNote)

  return {
    ok: true,
    message: lines.join('\n'),
    scanned: inScope.length,
    pending: pending.slice(0, MAX_LIST),
    decided: { merged, mergeWhy: mergeWhyAll, added, dropped },
    retagged: [...retagAll.entries()].map(([id, v]) => ({
      id,
      from: [...(snapshot.covers.find((c) => c.cover.id === id)?.cover.tags ?? [])],
      to: v.tags,
      why: v.why,
    })),
    rejected: rejectedAll,
    affected,
    translatedEn,
    previewOnly,
    vocabStats: stats,
  }
  function vocabStatsOf(v: TagVocabulary): { canonical: number; aliases: number; withEn: number } {
    const entries = Object.values(v.canonical)
    return {
      canonical: entries.length,
      aliases: entries.reduce((s, e) => s + e.aliases.length, 0),
      withEn: entries.filter((e) => e.en !== '').length,
    }
  }
}

/** 按大小切块（英文翻译分批，避免一次性请求过长）。 */
function chunkBy<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** 裁决模型的路由（配了用自己的，否则跟主会话默认）。 */
function resolveRoute(ctx: Context, config: MemjConfig): { provider: string; model: string } | undefined {
  if (config.tagNormalizeProvider !== '' && config.tagNormalizeModel !== '') {
    return { provider: config.tagNormalizeProvider, model: config.tagNormalizeModel }
  }
  return defaultRoute(ctx)
}

/** 翻译模型的路由（复用 en-index 的键）。 */
function resolveTranslateRoute(ctx: Context, config: MemjConfig): { provider: string; model: string } | undefined {
  if (config.translateProvider !== '' && config.translateModel !== '') {
    return { provider: config.translateProvider, model: config.translateModel }
  }
  return defaultRoute(ctx)
}

/** 主会话的默认模型。 */
function defaultRoute(ctx: Context): { provider: string; model: string } | undefined {
  try {
    const sel = ctx.get('agentDefaultModel') as
      | { currentSelection?: () => { provider?: string; model?: string } }
      | undefined
    const cur = sel?.currentSelection?.()
    if (cur?.provider && cur.model) return { provider: cur.provider, model: cur.model }
  } catch {
    /* 拿不到就放弃 */
  }
  return undefined
}

/**
 * ⭐⭐ **播种词表**（决策 162）：把库里现有的全部 tag 登记为 canonical（**零 LLM**）。
 *
 * 🔴 **为什么需要**：不播种的话，词表从空开始 ⇒ `插件`(51)、`缓存`(12) 这些
 * **老词头几次会被当成"新 tag"裁决一遍**（能判对，但白花 token，还可能被误判）。
 *
 * ⚠️ **播种不推水位线**（保持"现在"）—— 否则首次运行就会把 276 条正文全喂一遍。
 * @param vocab - 词表（会被就地修改）。
 * @param tags - 要登记的 tag（含频次无所谓，只登记名字）。
 * @returns 新登记了几个。
 */
export function seedVocabulary(vocab: TagVocabulary, tags: readonly string[]): number {
  let n = 0
  for (const t of tags) {
    const tag = t.trim()
    if (tag === '') continue
    if (vocab.canonical[tag] === undefined) {
      vocab.canonical[tag] = { aliases: [], en: '' }
      n += 1
    }
  }
  return n
}
