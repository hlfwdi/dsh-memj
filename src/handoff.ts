/**
 * `memj_handoff` 的核心逻辑（方案 §3.7 / §4.2 / §7.1）。
 *
 * ── 执行顺序（顺序即语义，§7.1）────────────────────────────────────────────
 * ```
 * 0. 创建项目文档（不存在时；相似 id ⇒ 两段式确认）
 * 1. ⭐ 建新主题（必须在写封面之前——封面的 theme 要填新主题 id）
 * 2. 写叙事
 * 3. 写封面 + 落盘内部条目
 * 4. 登记外部引用（ext: true）
 * 5. ⭐ 入库外部文档（adopt：copy / extract）
 * 6. ⭐ 标记读快照为已消费（并判清理）
 * 7. ⭐ 硬校验（本地程序，零 LLM）
 *    ⇒ 全过 ⇒ 重建派生层；任一非法 ⇒ 报错并要求重写
 * ```
 *
 * ── 🔴 关于「不半写」的实现方式 ────────────────────────────────────────────
 * 决策 72 要求校验失败时**不是半写**，而 §3.9.1 说校验发生在"落盘之后"。
 * 两者看似冲突，实际解法是：**全部内容先在内存里构建（含生成的 id 与 ref），
 * 校验通过后才统一落盘**。这样既保持"零 LLM 的确定性校验"，
 * 又真正做到"失败则整份不写"——不会留下半截状态。
 *
 * ── 🔴 关于「工具校验」：**分模式**（决策 95）────────────────────────────────
 * 「≥2 个项目」**不是要用工具去数的量**，而是**事情发生时就成立的事实**：
 * 别项目的知识被本项目用了 ⇒ A + B 已经是两个项目。
 *
 * | 模式 | 跨项目证据校验（快照.project ≠ 本次 project） |
 * |---|---|
 * | `strict`（默认） | ✅ **做**——这是全套机制里**唯一**的一处工具校验 |
 * | `loose` | ❌ **不做**——是否新建主题**完全由 LLM 判断** |
 *
 * ⚠️ **宽松模式只拆这道闸门，不拆别的东西**：`desc` 非空 / ≤200、近义 id 回确认、
 * `theme` 必须已存在——**两种模式都保留**（"能不能用"与"防永久性损坏"，不是"该不该建"）。
 *
 * @module dsh-memj/handoff
 */

import { randomUUID } from 'node:crypto'
import type { MemjConfig } from './config.ts'
import { readTextIfExists } from './files.ts'
import {
  SLUG_RE,
  TITLE_MAX_CHARS,
  TITLE_MIN_CHARS,
  extractTitle,
  findSimilarIds,
  isAbsolutePath,
  parseCovers,
  splitFrontmatter,
  stripCovers,
  charCount,
} from './parse.ts'
import {
  KNOWLEDGE_SECTION,
  KNOWLEDGE_TITLE,
  NARRATIVE_TITLES,
  PROGRESS_TITLE,
  SPEC_TITLE,
  buildSkeleton,
  cutKnowledgeSection,
  cutSpecSection,
  docSectionsOf,
  extractSpecBlockLines,
  extractSpecSection,
  sectionsFromNarrative,
  sectionsOf,
  SPEC_BLOCK_FENCE,
  specBlockRange,
  stripAllSpecBlocks,
  stripSpecBlock,
  truncateTitlesFromBlocks,
} from './sections.ts'
import {
  loadEntryDoc,
  loadProjectDoc,
  readNominations,
  rebuildDerivedLayers,
  addNomination,
  scanLibrary,
  syncEntryFrontmatter,
  writeEntryDoc,
  writeProjectDoc,
  consumeSnapshots,
  loadThemeFrontmatter,
  writeThemeDoc,
  findDocRead,
} from './store.ts'
import { entryRelPath } from './paths.ts'
// ⭐⭐⭐ 决策 204：模板（用户可自定义文档结构）。
import {
  defaultTemplate,
  listTemplates,
  loadDefaultTemplate,
  loadTemplate,
  renderSpecBlocksSkeleton,
  TPL_GUIDANCE_NO_TRUNC,
  truncateTitlesFromSpec,
  templateSectionNames,
  validateTemplate,
} from './templates.ts'
// ⭐⭐⭐ 决策 167：落知识时**由插件自己记一笔**（供轮次结束的自动规范化判断）。
import { noteKnowledgeWritten } from './tag-auto-state.ts'
import { pendingSnapshots } from './reads.ts'
import { narrativeFromProjectText } from './parse.ts'
import {
  countHistoryPlaceholders,
  fillHistoryId,
  historySlug,
  newEntryId,
  readHistoryLines,
  truncateProgress,
} from './history.ts'
import { readNarrativeMirror, writeNarrativeMirror } from './narrative.ts'
// ⭐ 决策 209：建项目回执里要报"本模板没有可截断的节"（那句文案走提示词页、可编辑）。
import { promptText } from './prompts.ts'
import type { Template } from './templates.ts'

/**
 * 规范块的**围栏那一行**（` ```memj:spec `）。
 *
 * ⚠️ 语言标记取自 `sections.ts` 的 `SPEC_BLOCK_FENCE`（**唯一源头**）——
 *   解析侧（`specBlockRange`）与这里必须同源，否则"写的"与"读的"会漂。
 */
const FENCE_SPEC = `${String.fromCharCode(96, 96, 96)}${SPEC_BLOCK_FENCE}`
/** 规范块的**结束围栏**（裸那一串反引号）。⚠️ 与 `FENCE_SPEC` **不是同一个**。 */
const FENCE_BARE = String.fromCharCode(96, 96, 96)
import { commitAll, ensureRepo, noteGitFailure, noteGitSuccess, probeGit, readRepoState } from './git.ts'
import type { Cover, CoverIssue } from './schema.ts'
import { ENTRY_KINDS, isEntryKind } from './schema.ts'

/**
 * ⭐⭐⭐ **`themeWhy` 里有没有"逐字引用"所挂主题 desc 的某个片段**（决策 156）。
 *
 * ⚠️ **判据是"连续片段"，不是"分词重合"** —— 后者太松：随便写几个词就能蒙过，
 *    而这一步的目的恰恰是**逼调用方真的去读那段 desc**。
 *
 * 做法：把两边按**标点与空白**切开（去掉标点、折叠空白），然后找
 * **最长公共连续子串**（**按字符**）；长度 ≥ `MIN_QUOTE_CHARS` ⇒ 算引用到了。
 *
 * 🔴 **为什么用字符而不是词**（第一版写错、被测试当场抓到）：
 *    本项目的主题 desc **以中文为主、且不带空格** ⇒ 按空白切词时
 *    整句会成为一个"词"，而引用时只写其中半句就对不上了
 *    （实测：`引了「工具与命令注册」` 被判 false）。
 *    ⇒ ⭐ **中文场景下"连续字符"才是自然的单位**（这也与检索那边
 *      "整词命中"的教训同源：**分词规则要匹配文本的实际形态**）。
 * @param why - 调用方给的挂靠依据。
 * @param desc - 该主题的 desc（**可能为空** ⇒ 直接判 false）。
 * @returns 是否算"引用到了 desc 原文"。
 */
export function quoteAppearsIn(why: string, desc: string): boolean {
  if (desc.trim() === '') return false
  /** 去掉标点、折叠空白 —— 只留"实义字符"，避免标点差异造成假不匹配。 */
  const norm = (s: string): string => s.replace(/[\s，。；：、（）【】《》"'`“”‘’—…·,.;:()<>[\]{}!?！？/\\|-]+/g, '')
  const a = norm(why)
  const b = norm(desc)
  if (a === '' || b === '') return false
  // ⚠️ **要求引用的片段足够长**（12 字符）——太短（如"插件"）等于没比对。
  const MIN_QUOTE_CHARS = 12
  if (b.length < MIN_QUOTE_CHARS) return false
  // 最长公共连续子串（字符级）。desc 只有一两句（几十~上百字）⇒ 双重循环完全够快。
  let best = 0
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      let k = 0
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k += 1
      if (k > best) best = k
    }
  }
  return best >= MIN_QUOTE_CHARS
}

/** 要落盘的一条知识。 */
export interface HandoffEntry {
  /** 英文短名（LLM 从标题翻译）。 */
  slug: string
  /**
   * ⭐ **标题**（决策 98，**必填**，2–48 字符）。
   *
   * 🔴 **它是封面的字段**——以前标题从正文现算，逼得 `memj_search`
   * 为**每个候选**打开文件；现在不读正文也能回标题。
   */
  title: string
  /** 标签，至少 1 个。 */
  tags: string[]
  /** 检索键（必填，≤200 字符）。 */
  desc: string
  /** 正文 markdown（首个 `###` 作为标题）。 */
  body: string
  /**
   * ⭐⭐ **只引用不搬动**（`ext: true` 时必填）：库外文档的**绝对路径**。
   *
   * 🔴 **为什么补这个字段**：实现在 `handoff` 流程里**本来就有第 4 步
   * 「登记外部引用（`ext: true`）」**，`Cover` 结构、`parse.ts` 的
   * `coverToYaml`/`validateCoverShape`、`store.ts` 的重填路径与删除逻辑
   * **全都支持 `ext`**；工具描述也写着"只引用不搬动则建 `ext: true` 的封面"。
   * 但**参数 schema 与这个接口里都没有 `ref`/`ext`** ⇒ 模型**没有任何入口**
   * 能登记外部引用（描述给了能力、实现没开口子）。
   *
   * | 场景 | `ref` | `ext` | `body` |
   * |---|---|---|---|
   * | 落库（默认） | 不填（工具按 slug+id 算） | 不填 | **必填** |
   * | 只引用不搬动 | **绝对路径**（必填） | `true` | 不填（正文在库外） |
   */
  ref?: string | undefined
  /**
   * ⭐ `true` = **外部引用**（不搬动库外文件，只建封面）。
   *
   * ⚠️ 与 `adopt` 的区别：`adopt` 是**入库**（把正文收进库、封面 `ext` 置 `false`）；
   * 本字段是**只引用**（正文永远留在库外）。
   */
  ext?: boolean | undefined
  /**
   * ⭐ 形态分类（决策 81，**可选**）：`fact`/`trap`/`howto`/`decision`。
   * 与 `theme` 正交——theme 是"属于谁"，kind 是"本身是什么形态"。
   */
  kind?: string | undefined
  /** 要挂靠的主题 id（**只能填已存在的**）。 */
  theme?: string[]
  /**
   * ⭐⭐⭐ **挂靠依据**（决策 156）：**引一句该主题 `desc` 里的话** +
   * 说明这条知识**怎么服务那个 desc 描述的场景**。
   *
   * 🔴 **挂了 `theme` 就该给**（不给 ⇒ 回执**警告**，但不拒收）。
   * ⚠️ 目的：把"凭感觉判通不通用"换成"**必须去读那段 desc**" ——
   *    真实事故里，三条正文全是本项目专属数据、却因"话题听起来通用"挂上了跨主题主题。
   */
  themeWhy?: string | undefined
  /** 是否加入全局（**只登记提名**）。 */
  global?: boolean
  /**
   * ⭐ **同 `slug` 已存在时，是否覆盖**（决策 104，默认 `false`）。
   *
   * - `false`（缺省）⇒ **拒绝**并提示"已存在"，避免静默覆盖；
   * - `true` ⇒ **就地覆盖**那条知识（不产生第二个文件）。
   *
   * ⚠️ 它解决的是**幂等**问题：同一入参重发（网络重试、分步补写）
   * 不会在库里堆出重复知识。
   */
  overwrite?: boolean
}

/** 本次要新建的主题。 */
export interface NewThemeRequest {
  id: string
  desc: string
}

/** 入库一项外部文档。 */
export interface AdoptRequest {
  slug: string
  /** ⭐ **标题**（决策 98，必填，2–48 字符）。 */
  title: string
  ref: string
  /** `copy` = 工具自己读全文；`extract` = 用 `body` 作为正文。 */
  mode: 'copy' | 'extract'
  body?: string
  tags: string[]
  desc: string
  /** ⭐ 形态分类（可选），同 `HandoffEntry.kind`。 */
  kind?: string | undefined
  theme?: string[]
  global?: boolean
  /** ⭐ 同 `slug` 已存在时是否覆盖（决策 104，默认 `false`）。同 `HandoffEntry.overwrite`。 */
  overwrite?: boolean
}

/**
 * ⭐ **handoff 的分步取值**（决策 101 / §3.11）。
 *
 * | 值 | 做什么 |
 * |---|---|
 * | `narrative` | 写项目叙事（`doc` / `projectDesc`） |
 * | `theme` | 建主题（`newThemes`）；⭐ **并在这里消费读快照**（决策 102） |
 * | `knowledge` | 落知识（`entries` / `adopt`） |
 * | `all` | 全部（**缺省**，等价于一次完整 handoff） |
 */
export type HandoffStep = 'narrative' | 'theme' | 'knowledge' | 'all'

/**
 * 三个**可单独执行**的步骤，**顺序即执行顺序**（§3.11.2）。
 *
 * 🔴 **固定为这个顺序，与调用方给的数组顺序无关**——
 * `knowledge` 要挂主题，而主题由 `theme` 建；顺序反了会挂到不存在的主题上。
 */
export const HANDOFF_STEP_ORDER: readonly Exclude<HandoffStep, 'all'>[] = [
  'narrative',
  'theme',
  'knowledge',
]

/** 一次 handoff 实际要跑的步骤集合。 */
interface StepPlan {
  /** 要跑的步骤（`all` 会被展开成三个）。 */
  steps: Set<Exclude<HandoffStep, 'all'>>
  /** 是否是 `all`（或等价形态）。 */
  isAll: boolean
  /** 非法输入时的说明（有值即失败）。 */
  error?: string
}

/**
 * 把 `step` 参数规范化成"要跑哪几步"。
 *
 * 规则（§3.11.2）：
 * - **缺省 ⇒ `all`**（保持老行为）；
 * - 单个值或**数组**都接受；
 * - `all` **不能与其他步骤并存**（含义冲突）；
 * - **空数组非法**——静默当成 `all` 会做意外的全量写入；
 * - 非法取值 ⇒ 报错并列出合法值。
 * @param raw - 入参里的 `step`。
 * @returns 步骤计划。
 */
export function planSteps(raw: HandoffStep | readonly HandoffStep[] | undefined): StepPlan {
  if (raw === undefined) return { steps: new Set(HANDOFF_STEP_ORDER), isAll: true }

  const list: readonly string[] = Array.isArray(raw) ? raw : [raw as string]
  if (list.length === 0) {
    return {
      steps: new Set(),
      isAll: false,
      error:
        '`step` 不能是空数组——那意味着什么都不做。\n' +
        `要么省略它（= 全部），要么明确给：${HANDOFF_STEP_ORDER.join(' / ')} / all。`,
    }
  }

  const hasAll = list.includes('all')
  const others = list.filter((s) => s !== 'all')
  if (hasAll && others.length > 0) {
    return {
      steps: new Set(),
      isAll: false,
      error: `\`step\` 里 \`all\` 不能与其他步骤并存（给的是：${list.join('、')}）。`,
    }
  }
  if (hasAll) return { steps: new Set(HANDOFF_STEP_ORDER), isAll: true }

  const steps = new Set<Exclude<HandoffStep, 'all'>>()
  for (const s of list) {
    if (!HANDOFF_STEP_ORDER.includes(s as Exclude<HandoffStep, 'all'>)) {
      return {
        steps: new Set(),
        isAll: false,
        error:
          `\`step\` 取值非法：「${s}」——只能是 ` +
          `${HANDOFF_STEP_ORDER.map((x) => `'${x}'`).join(' / ')} / 'all'（或它们的数组）。`,
      }
    }
    steps.add(s as Exclude<HandoffStep, 'all'>)
  }
  return { steps, isAll: false }
}

/** `memj_handoff` 的入参。 */
export interface HandoffRequest {
  project: string
  /** ⭐ **本次做哪几步**（决策 101）：缺省 `all`；可给数组；顺序固定。 */
  step?: HandoffStep | readonly HandoffStep[] | undefined
  projectDesc?: string | undefined
  /** 文档的叙事部分（该文档自己的叙事节）；不含封面。 */
  doc?: string | undefined
  /**
   * ⭐⭐ **只写某一节**（决策 134）——节名，匹配规则与 `memj_read` 的 `section` 一致。
   *
   * 🔴 **为什么需要**：旧路径的最小单位是**整个顶层节** ⇒ 要加一段就得**逐字重写整节**
   *    （实测「当前进度」28,750 字符，超出单次输出能力）⇒ **长文档 handoff 走不通**。
   * ⭐ 给了它 ⇒ `doc` **只当这一节的内容**，其余节**一律不动**。
   * ⚠️ 顶层 `##` 节与 `###` 子节都可以。
   */
  docSection?: string | undefined
  /**
   * ⭐⭐ **怎么改那一节**（决策 134，配合 `docSection`）。
   *
   * - `append`（**缺省**）：追加到该节末尾
   * - `prepend`：追加到该节开头
   * - `replace`：替换该节（**压缩**用：把一整段改写成归并版）
   * - `drop`：删除该节（**压缩**用：几条归并成一条时删掉旧的）
   *
   * 🔴 **缺省取 `append` 是刻意的**：忘给参数时**只会追加、不会覆盖**
   *    ⇒ 把"忘带全文就丢历史"从**靠人记得**变成**结构上做不到**。
   */
  docOp?: DocOp | undefined
  entries?: HandoffEntry[] | undefined
  newThemes?: NewThemeRequest[] | undefined
  /**
   * ⭐⭐ **准挂表**（决策 111）：**只补挂这些快照**（别项目 entry id 数组）。
   *
   * 🔴 **省略 = 一条都不挂**（fail-closed）——不列就不挂。理由见决策 111：
   * 设计一直要求「相关性由 LLM 逐条判断」，但原先实现里 LLM **没有落点**
   * （`handoff.ts` 无条件把全部别项目快照挂到每个新主题上）⇒ 无关知识被误挂。
   * ⚠️ **失败模式对比**：漏列只是**少挂**（可发现、不污染）；若用"排除表"，
   * 漏写则**误挂依旧**（正是本 bug）。
   */
  linkedSnapshots?: string[] | undefined
  adopt?: AdoptRequest[] | undefined
  confirmCreate?: boolean | undefined
  /**
   * ⭐⭐ **用哪份模板建这份文档**（决策 204）。
   *
   * 🔴🔴 **只在「新建项目」那一刻有效**（用户 2026-09-30 裁定）：
   *    · 项目**已存在** ⇒ 本参数**被忽略**（**模板绝不回溯已有文档**）；
   *    · 新建 ⇒ 按该模板的节名建骨架，并把节名**写进文档自己的 frontmatter**。
   *   ⇒ 此后那份文档**按自己记着的节名**工作，**与模板解耦**
   *     （改模板、甚至删掉模板，都**不影响**它）。
   *   ⚠️ **2026-10-05 起**：frontmatter 那份是**镜像**（权威已改成**正文的 `##` 标题**，
   *      见 `docSectionsOf()`）—— 因为 frontmatter 会被某些重建流程改写，而正文不会。
   *
   * ⚠️ **省略 = 用"当前生效的默认模板"**（它**也落盘、用户可能改过** ⇒
   *   `loadDefaultTemplate()` 读盘优先；内置值只是回落）—— 节数**不保证是六节**。
   * ⚠️ **模型要改已有文档的结构 ⇒ 做不到，这是有意的**；要换结构只能新建项目。
   */
  template?: string | undefined
}

/** 执行结果。 */
export interface HandoffResult {
  ok: boolean
  /** 回执（成功时）或错误说明（失败时）——**必须区分"更新/新建"**（决策 48）。 */
  message: string
  /** 校验失败时的逐条问题（决策 62：**一次报全部**，让 LLM 一次改完）。 */
  issues: string[]
  createdProject: boolean
  createdThemes: string[]
  /** 疑似重复的项目 id（两段式确认用）。 */
  similarProjects: string[]
  /** 疑似重复的主题 id（两段式确认用）。 */
  similarThemes: string[]
  /** 本次依据的未消费快照条数（§12-57）。 */
  snapshotCount: number
}

// ⭐⭐⭐ **第二份节名清单已删除**（2026-09-30）：这里原来还有一个本地
//   `const NARRATIVE_TITLES = ['目标', '当前进度', …]`（**无 `## ` 前缀**形态），
//   与 `store.ts` 的 `NARRATIVE_SECTIONS` 是**两份必须同改的副本**。
//   ⇒ 现在唯一源头是 `store.ts` 的 `NARRATIVE_TITLES`（见文件头部 import）。

// ⭐⭐⭐ 决策 204：**默认骨架已由 `buildSkeleton(titles)` 生成**（支持任意节名）。
//   原来这里的 `NARRATIVE_TEMPLATE`（写死默认六节）已删除——
//   它会让自定义模板的文档**被按默认六节建骨架**。

/**
 * 把一段叙事文本按 `## ` 切成节（**跳过代码围栏内的伪标题**）。
 *
 * 🔴🔴 **排除"工具自己维护的节"**（2026-10-12）：
 *   `## 沉淀知识`（封面容器）与 `## 本档写作规范`（模板复制的规范）
 *   **都不是叙事节** —— 它们由工具生成、模型既不写也不该"读到才算读全"。
 *   ⚠️ **为什么在这里统一排除**（而不是各个调用点各排一次）：
 *     本函数有 **13 个调用点**，其中 9 处要的是"顶层叙事节"
 *     ⇒ 逐个加过滤必然漏（本项目判据："一段代码里已经有了一种过滤，
 *       就问其他几条路径为什么不需要"）。
 *   ⭐ 排除之后的连带好处（都是"少一类静默错误"）：
 *     · 合并/规范化**不会**把规范节当成"自定义节"保留下来（否则会与重建的那份并存）；
 *     · 体量行与截断配额**不再把规范的字数算进去**（规范可能几百字符）；
 *     · `inheritedIn` / `replacedIn` 的回声不再冒出"本档写作规范"这个假节名；
 *     · 读记录闸门（`narrativeTopSections`）不会要求模型去读它。
 * @param text - 叙事文本。
 * @returns 节数组（**不含**工具维护的节）。
 */
/**
 * ⭐ **算"一节有多重"——剔除规范块**（决策 209）。
 *
 * 🔴 **为什么必须剔**：截断判据（`beforeChars > warnChars`）与回执体量行都用它，
 *   而规范块是**工具维护的固定开销**（几百字符）⇒ 算进去会让
 *   ① 阈值被规范吃掉；② 文档刚建就"接近超阈值"；③ 回执报的体量**虚高**。
 * ⭐ **两处必须同源**（同一个函数）—— 否则"该不该截"与"回执报多少"会给出两个数
 *   （本项目最忌"同一事实两个数"）。
 * @param lines - 该节的行（含标题行）。
 * @returns 字符数（已剔除规范块与首尾空白）。
 */
function sectionCharCount(lines: readonly string[]): number {
  return stripSpecBlock(lines).join('\n').trimEnd().length
}

function splitH2(text: string): Array<{ title: string; lines: string[] }> {
  const out: Array<{ title: string; lines: string[] }> = []
  let cur: { title: string; lines: string[] } | undefined
  let inFence = false
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      if (cur !== undefined) cur.lines.push(line)
      continue
    }
    const m = inFence ? null : /^##\s+(.+?)\s*$/.exec(line)
    if (m !== null) {
      const title = (m[1] ?? '').trim()
      // ⭐ 工具维护的节：**整节丢弃**（连它的正文也不并进上一节）。
      if (title === KNOWLEDGE_TITLE || title === SPEC_TITLE) {
        cur = undefined
        continue
      }
      cur = { title, lines: [] }
      out.push(cur)
      continue
    }
    if (cur !== undefined) cur.lines.push(line)
    // 节之前的内容（如引言）没有归属，直接丢弃——固定节结构里没有前言的位置。
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐ **按节操作**（决策 134）——`docSection` + `docOp` 的实现
//
// 🔴 **为什么不改 `splitH2`**（这一点很关键，别当成"顺手统一"）：
//    查清 `splitH2` 的**全部 13 个调用点** ⇒ **9 处要的是"顶层节"**
//    （`normalizeNarrative` / 读记录闸门 / 孤本判据检测 / 回执体量行…），
//    只有"按节操作"这处需要"子节"能力。
//    ⇒ 把 `splitH2` 改成认 `###` 会**同时改变那 9 处的行为**（风险不值得）。
//    ⭐ 所以：**`splitH2` 行为零变化**，另写下面这组函数（认 `##` + `###`）。
// ══════════════════════════════════════════════════════════════════════════

/** 按节操作里"一节"的形态（比 `splitH2` 多带 `level` 与行号）。 */
interface AnySection {
  title: string
  level: 2 | 3
  /** 标题行在行数组里的下标。 */
  startLine: number
  /** 结束行下标（不含）——下一个**级别 ≤ 本级**的标题。 */
  endLine: number
}

/**
 * 按 `##` **与** `###` 切节（决策 134）。
 *
 * ⚠️ 边界规则与 `read.ts` 的 `parseSections` **保持一致**：
 *    **下一个「级别 ≤ 本级」的标题**才是本节边界
 *    ⇒ `## 当前进度` 会**含**它下面全部 `###` 子节。
 * @param text - 叙事文本。
 * @returns 节数组（按出现顺序；含行号）。
 */
function splitAny(text: string): AnySection[] {
  const lines = text.split(/\r?\n/)
  const heads: Array<{ title: string; level: 2 | 3; line: number }> = []
  let inFence = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line)
    if (m !== null) {
      heads.push({
        title: (m[2] ?? '').trim(),
        level: (m[1] ?? '').length === 2 ? 2 : 3,
        line: i,
      })
    }
  }
  return heads.map((h, idx) => {
    let end = lines.length
    for (let k = idx + 1; k < heads.length; k += 1) {
      const nxt = heads[k]
      if (nxt !== undefined && nxt.level <= h.level) {
        end = nxt.line
        break
      }
    }
    return { title: h.title, level: h.level, startLine: h.line, endLine: end }
  })
}

/**
 * 按节名找一节（决策 134）。
 *
 * 匹配规则与 `memj_read` 的 `section` **一致**：精确优先，否则子串、大小写不敏感。
 * ⚠️ 同名多命中 ⇒ 取**第一个**（按节写要的是"就那一节"，多命中时**由调用方报错**提示歧义）。
 * @param text - 叙事文本。
 * @param name - 节名。
 * @returns `{ section, all }`——`all` 是全部命中（供"歧义就报错"用）。
 */
function findAnySection(
  text: string,
  name: string,
): { section?: AnySection | undefined; all: AnySection[]; exact: boolean } {
  const secs = splitAny(text)
  const exact = secs.filter((s) => s.title === name)
  if (exact.length > 0) return { section: exact[0], all: exact, exact: true }
  const key = name.trim().toLowerCase()
  const subs = secs.filter((s) => s.title.toLowerCase().includes(key))
  return { section: subs[0], all: subs, exact: false }
}

/** `docOp` 的四种取值（决策 134）。 */
export type DocOp = 'append' | 'prepend' | 'replace' | 'drop'

/** 一次按节操作的结果。 */
export interface SectionOpResult {
  /** 操作后的完整叙事；失败时为 `undefined`。 */
  narrative?: string
  /** 失败原因（成功时为空）。 */
  error?: string
  /** 命中的节名（成功时）。 */
  hitTitle?: string
  /**
   * ⭐⭐ **命中是否为精确匹配**（2026-10-12 新增，真实事故修）。
   *
   * 🔴 **为什么必须有它**：子串匹配会把「目标」命中到「研究目标」——
   *   而**回执报的是调用方请求的名字**，于是那次操作看起来「成功」，
   *   调用方完全看不出自己改错了对象。
   * 🔴 **真实事故**：模型传 `docSection:"目标"`，工具改的是 `## 研究目标`，
   *   回执报「替换了该节 `目标`：5 → 51 字符」⇒ 手误被完全掩盖。
   *
   * ⭐ 精确匹配（`section.title === name`）时为 `false`；靠子串兜底命中时为 `true`
   *   ⇒ 回执如实说「你传的是 A，实际命中的是 B」。
   */
  fuzzyHit?: boolean
  /** 该节操作前后的字符数（供回执回声）。 */
  beforeChars?: number
  afterChars?: number
}

/**
 * 找出**空壳节**（只有标题、没有内容）——供 `drop` 后的报警用（决策 134 §3.1）。
 *
 * 🔴 **为什么要这个检查**（用户裁定"允许删空、但回执必须报警"）：
 *    工具**分不清**"故意删空"与"误删"（同孤本判据检测的取向）；
 *    而**本项目真有一个删不掉的空壳节**（`## 第十二批…`）——
 *    正因为删不掉才留在文档里，所以"刚产生一个空壳节"这件事**值得当场说出来**。
 * @param text - 叙事文本。
 * @returns 空壳节的节名数组。
 */
export function findEmptySections(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (const s of splitAny(text)) {
    // 只报顶层节（子节空着往往是有意的占位；顶层空壳才是文档结构问题）。
    if (s.level !== 2) continue
    // ⭐⭐ **决策 209：判空壳前先剥规范块** ——
    //    否则"只有规范、还没写正文"的节**永远不被判为空壳**
    //    ⇒ 用户再也看不到"这一节还没写"的提醒（那是这条检查的全部用处）。
    const body = stripSpecBlock(lines.slice(s.startLine + 1, s.endLine)).join('\n').trim()
    if (body === '') out.push(s.title)
  }
  return out
}

/**
 * ⭐ **找出"同名小节出现了多次"的节名**——供 `replace` 后的报警用（2026-09-21 新增）。
 *
 * 🔴🔴 **为什么需要它（真实事故）**：
 *    我用 `docOp:'replace'` 替换某一小节时，**把后面几节的内容连它们的 `###` 标题一起**
 *    写进了 `doc`。结果那些标题**成了新建子节**，而**原有的同名小节仍然在**
 *    ⇒ 整段内容**重复了两遍**（实测：一节从 15 个子节变成 20 个、其中 5 个重复）。
 *
 * ⚠️ **工具当时什么都没说**：它只报"该节 X → Y 字符"，而那次是 `+2908`
 *    ⇒ **看起来只是"写多了"，完全不像错误**。
 *
 * ⭐ **正确的用法是把标题限定在"被替换的那一节自己"**：
 *    要合并别的小节 ⇒ **逐个替换它们**，不要把它们的标题塞进这一节里。
 *
 * ⚠️ 与 `findEmptySections` 同取向：**只警告、不拒绝**——
 *    "故意造两个同名小节"在语义上并非不可能（虽然罕见），工具**不该替人做这个决定**。
 *
 * 🔴🔴 **2026-09-30 修正：只在【同一个父节内】统计子节重名**（原判据是全局计数）。
 *    **起因**：本项目的「有效做法」与「失败/踩坑」**各自**都用
 *    `### 一、通用方法（跨功能）` / `### 二、按功能` 这种两段式组织
 *    ⇒ 全局计数必然报"`一、通用方法（跨功能）`×2、`二、按功能`×2"
 *    ⇒ **每轮交接都打一条假警报**（实测：本轮两次 handoff 都被它刷了一遍）。
 *    ⭐ **判据**：要防的是「**同一个父节下的重复**」，不是「同名」——
 *    跨顶层节的同名子节是**结构性重名**，语义上完全正常。
 *    ⚠️ **顶层 `##` 节没有父节** ⇒ 它**仍然按全局唯一**统计
 *    （两个 `## 当前进度` 才是真重复）。
 * @param text - 叙事文本。
 * @returns 出现次数 > 1 的节名（含出现次数与父节名），按首次出现顺序。
 */
export function findDuplicateSections(
  text: string,
): Array<{ title: string; count: number; level: 2 | 3; parent?: string }> {
  // 🔑 **计数键 = 父节 › 节名**（顶层节用 `##` 占位，等价于"全局唯一"）。
  const counts = new Map<string, { title: string; count: number; level: 2 | 3; parent?: string }>()
  let currentTop = ''
  for (const s of splitAny(text)) {
    if (s.level === 2) currentTop = s.title
    const key = s.level === 2 ? `\u0000##\u0000${s.title}` : `\u0000${currentTop}\u0000${s.title}`
    const prev = counts.get(key)
    if (prev === undefined) {
      counts.set(
        key,
        s.level === 2
          ? { title: s.title, count: 1, level: 2 }
          : { title: s.title, count: 1, level: 3, parent: currentTop },
      )
    } else prev.count += 1
  }
  const out: Array<{ title: string; count: number; level: 2 | 3; parent?: string }> = []
  // ⚠️ 用 `splitAny` 的顺序输出（`Map` 保持插入序），与"文档里第一次出现的位置"一致。
  for (const v of counts.values()) if (v.count > 1) out.push(v)
  return out
}

/**
 * 对某**一节**做一次操作（决策 134 的 B+C）。
 *
 * 🔴 **为什么必须有它**：旧的 `mergeNarrative` 最小单位是**整个顶层节**
 *    ⇒ 要加一段就得**逐字重写整节**（实测「当前进度」28,750 字符，超出单次输出能力），
 *    而**压缩**（归并/降级）本质是"**换**"与"**删**"，追加或整节重写都做不了。
 *
 * ⭐ **`append`/`prepend` 的 `body` 不含节标题**（工具自己加）——
 *    这正是"LLM 只产出一段"的关键。
 *
 * @param text - 现有叙事。
 * @param sectionName - 节名（子串匹配）。
 * @param op - 操作。
 * @param body - 新内容。`append`/`prepend` 时**不含标题**；`replace` 时**含标题**（整节换成它）。
 * @returns 结果。
 */
export function applySectionOp(
  text: string,
  sectionName: string,
  op: DocOp,
  body: string,
): SectionOpResult {
  const name = sectionName.trim()
  if (name === '') return { error: '`docSection` 不能为空。' }
  const { section, all, exact } = findAnySection(text, name)
  if (section === undefined) {
    return {
      error:
        `找不到名为「${sectionName}」的节。请用 \`memj_read({ project: … })\` ` +
        '看**顶层节**清单（回执里会带每节的字符数），从里面重挑一个。',
    }
  }
  // ⚠️ 歧义：多个节名都含这个子串 ⇒ 报错并列出，**不猜**（决策 134 的"别猜"取向）。
  if (all.length > 1) {
    return {
      error:
        `节名「${sectionName}」**有歧义**，命中了 ${all.length} 个：` +
        `${all.map((s) => `\`${s.title}\``).join('、')}。\n` +
        '请给一个更精确的名字（精确同名优先于子串匹配）。',
    }
  }

  const lines = text.split(/\r?\n/)
  // 🔴 **标题必须按该节真实级别写回**（`##` 或 `###`）——我第一版写死了 `##`，
  //    结果 `append`/`prepend` 一个 **`###` 子节**时会把它**降级成顶层节**，
  //    文档结构当场被破坏（实测：`### 第二十批` 变成 `## 第二十批`，
  //    后续的 `### 第十九批` 于是"挂"到了它下面）。
  //    ⭐ 判据：**凡是"把解析出来的结构再写回"的地方，级别/缩进这类属性必须原样带上**。
  const titleLine = `${'#'.repeat(section.level)} ${section.title}`
  const beforeChars = sectionCharCount(lines.slice(section.startLine, section.endLine))

  // ⭐⭐ **决策 209：规范块是"受保护块"** ——
  //   · `append`/`prepend` 只动**正文**，规范块位置不动（新内容插在它**之后**）；
  //   · `replace` **保住盘上的规范块**（"故意删 vs 没抄"工具分不出 ⇒ 不猜）。
  const whole = lines.slice(section.startLine, section.endLine)
  const blk = extractSpecBlockLines(whole)
  const bodyOfSection = stripSpecBlock(whole).slice(1).join('\n').trim()
  const newBody = stripAllSpecBlocks(body.trim())

  let replaced: string[]
  if (op === 'drop') {
    replaced = []
  } else if (op === 'replace') {
    // ⚠️ `replace` 时调用方给的是**整节**（含标题）⇒ 直接用；没给标题就补上。
    // 🔴 原文是 `if (/^#{2,3}\s+/.test(given[0])) replaced = given` ——
    //    **决策 209 补**：规范块必须保住 ⇒ 无论哪一支，标题之后都要插回规范块。
    const given = newBody === '' ? [] : newBody.split(/\r?\n/)
    // 给了标题 ⇒ 去掉它（我们自己按实际级别重写）；没给 ⇒ 保底补上。
    const content = given.length > 0 && /^#{2,3}\s+/.test(given[0] ?? '') ? given.slice(1) : given
    replaced = newBody === ''
      ? [titleLine]
      : [titleLine, '', ...(blk.length > 0 ? [...blk, ''] : []), ...content]
  } else {
    // append / prepend：只动正文，标题与结构都保留。
    if (newBody === '') return { error: `\`docOp: '${op}'\` 时 \`doc\` 不能为空。` }
    const merged = op === 'append'
      ? `${bodyOfSection}\n\n${newBody}`.trim()
      : `${newBody}\n\n${bodyOfSection}`.trim()
    replaced = [
      titleLine,
      '',
      ...(blk.length > 0 ? [...blk, ''] : []),
      ...merged.split(/\r?\n/),
    ]
  }

  // 拼回：该节之前 + 新节 + 该节之后。
  const out = [
    ...lines.slice(0, section.startLine),
    ...replaced,
    ...lines.slice(section.endLine),
  ]
  const next = out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
  const afterChars = replaced.join('\n').trimEnd().length

  return {
    narrative: next,
    hitTitle: section.title,
    // 🔴 精确匹配为 false；靠子串兜底命中为 true（供回执点破"你传的 ≠ 我改的"）。
    fuzzyHit: !exact,
    beforeChars,
    afterChars,
  }
}

/**
 * 把叙事**规范成固定的节结构**（§3.1「顺序固定」）。
 *
 * ⚠️ **"固定"指的是"按该文档自己的节名清单固定"**，不是"固定六节" ——
 *    节名来自 `titles` 参数（`sectionsOf(fm.sections)`），自定义模板完全不同。
 *
 * 🔴 **为什么必须规范化**：LLM 可能只写了其中几节（"这次没有踩坑"很常见）。
 * 若不补齐，文档结构就会随每次调用漂移——而设计明确要求**顺序固定**，
 * 且 `memj_rebuild`、接手的人都依赖这个固定结构。
 *
 * 规则：
 * 1. 六个标准节**按设计顺序**输出；
 * 2. **缺失的节补成空节**（标题仍在，便于看出"这节确实是空的"）；
 * 3. **非标准节保留**，附在最后——不丢弃 LLM 写的内容；
 * 4. 同名节出现多次 ⇒ 内容合并到该节。
 * @param text - 原始叙事文本。
 * @param titles - ⭐ **该文档的节名清单**（决策 204）。省略 ⇒ 默认六节。
 *   🔴 **必须用 `sectionsOf(fm.sections)` 的结果传入**（自定义模板的文档靠它）。
 * @returns 规范化后的叙事。
 */
export function normalizeNarrative(text: string, titles: readonly string[] = NARRATIVE_TITLES): string {
  const sections = splitH2(text)
  const standard = new Set(titles)
  /** 标准节 → 合并后的内容行。 */
  const merged = new Map<string, string[]>()
  /** ⭐ 决策 209：节名 → 规范块原文行（**逐字保留**；同一个节名只留第一个）。 */
  const blocks = new Map<string, string[]>()
  /** 非标准节（保序、去重）。 */
  const extra: Array<{ title: string; lines: string[] }> = []

  for (const s of sections) {
    const blk = extractSpecBlockLines([`## ${s.title}`, ...s.lines])
    if (blk.length > 0 && !blocks.has(s.title)) blocks.set(s.title, blk)
    if (standard.has(s.title)) {
      const prev = merged.get(s.title)
      if (prev === undefined) merged.set(s.title, [...s.lines])
      else prev.push('', ...s.lines)
    } else if (!extra.some((e) => e.title === s.title)) {
      extra.push(s)
    }
  }

  const out: string[] = []
  for (const title of titles) {
    out.push(`## ${title}`, '')
    // ⭐ 规范块插在正文之前（**逐字保留**，不重新渲染 —— 用户可能手改过措辞）。
    const blk = blocks.get(title)
    if (blk !== undefined && blk.length > 0) out.push(...blk, '')
    const body = (merged.get(title) ?? []).join('\n').trim()
    if (body !== '') out.push(body, '')
  }
  for (const e of extra) {
    out.push(`## ${e.title}`, '')
    const blk = blocks.get(e.title)
    if (blk !== undefined && blk.length > 0) out.push(...blk, '')
    const body = e.lines.join('\n').trim()
    if (body !== '') out.push(body, '')
  }
  return out.join('\n').trimEnd()
}

/**
 * ⭐⭐ **按节合并叙事**（决策 109）：`doc` 是"补丁"，不是"整份新版本"。
 *
 * ── 规则 ────────────────────────────────────────────────────────────────────
 * | 本次 `doc` 里…… | 结果 |
 * |---|---|
 * | **写了某一节** | 该节**替换**成新内容 |
 * | **没写某一节** | ⭐ **保留旧内容**（不再被清空） |
 * | **写了但内容为空**（如只写 `## 下一步`） | 该节**被清空** |
 *
 * 🔴 **判据是"这一节在 doc 里出现过没有"**，不是"有没有正文"——
 *    ⇒ 想清空某节就把它写出来、内容留空（这是唯一能清空的方式）。
 *
 * ── 为什么必须做在工具里，而不是"让模型自己带上老内容" ──────────────────────
 * 实测发现：**模型没有任何工具能读到项目文档的全部叙事节**
 * （`memj_info` 只给项目 desc、`memj_read` 只读知识正文）
 * ⇒ 它**只能凭记忆重写**，而"凭记忆"必然压缩、丢细节。
 * ⇒ 把合并做在工具里，**累积就变成默认行为**，不依赖模型记得。
 *
 * ⚠️ **向后兼容**：模型**写全该文档的全部节**时，合并结果与原来的"整份替换"**完全相同**
 *    ⇒ 现有行为一个字都不变（这是本改动敢做的前提）。
 *    ⚠️ 不是"写全六节"——节数由**该文档自己的节名清单**决定（`titles` 参数）。
 *
 * ⚠️ **标准节与自定义节一视同仁**：两边都按"出现过 = 替换，没出现 = 保留"处理
 *    （自定义节同样**不会被丢弃**——这正是用户报的"内容丢了"的一部分）。
 * @param incoming - 本次 `doc`（可能只含部分节）。
 * @param existing - 旧叙事（可能为 `undefined` = 新项目）。
 * @param titles - ⭐ **该文档的节名清单**（决策 204）。省略 ⇒ 默认六节。
 *   🔴 **必须用 `sectionsOf(existingFm.sections)` 的结果传入** ——
 *   否则自定义模板的文档会被"按默认六节合并"，表现为**节错位 / 旧节永远留着**。
 * @returns 合并后的完整叙事。
 */
export function mergeNarrative(
  incoming: string,
  existing: string | undefined,
  titles: readonly string[] = NARRATIVE_TITLES,
): string {
  // 新项目（无旧叙事）⇒ 等价于原来那个"规范成固定六节"的行为。
  if (existing === undefined || existing.trim() === '') return normalizeNarrative(incoming, titles)

  // ⭐⭐⭐ **决策 209：规范块是"受保护块"** ——
  //  🔴 `doc` 里**不可能带规范**（模型不会一字不差抄一遍）⇒ 不剥+回填就是**静默抹掉**
  //     （实测：合并后 `## 目标` 下的规范块消失）。
  //  ⭐ **裁定**：规范块**一律以盘上旧文档为准**，模型在 `doc` 里写什么都不改它
  //     （"故意删规范"与"没抄规范"工具**分不出** —— 与 `findEmptySections` 的
  //      "故意删空 vs 误删"同族，所以不猜）。
  const ins = splitH2(stripAllSpecBlocks(incoming))
  const old = splitH2(existing)
  const standard = new Set(titles)

  /** 盘上旧文档里，某节的规范块原文行（**逐字保留**，不重新渲染）。 */
  const oldBlocks = new Map<string, string[]>()
  for (const s of old) {
    const b = extractSpecBlockLines([`## ${s.title}`, ...s.lines])
    if (b.length > 0) oldBlocks.set(s.title, b)
  }
  /** 本次 `doc` 里，某节**自己带了**规范块 ⇒ 用它（用户/模型显式改规范的唯一通道）。 */
  const newBlocks = new Map<string, string[]>()
  for (const s of splitH2(incoming)) {
    const b = extractSpecBlockLines([`## ${s.title}`, ...s.lines])
    if (b.length > 0) newBlocks.set(s.title, b)
  }
  /** 取该节最终要用的规范块：本次显式给的 > 盘上的 > 没有。 */
  const blockFor = (title: string): string[] => newBlocks.get(title) ?? oldBlocks.get(title) ?? []

  /** 本次写了的节（同名多次 ⇒ 合并）。 */
  const touched = new Map<string, string[]>()
  for (const s of ins) {
    const prev = touched.get(s.title)
    if (prev === undefined) touched.set(s.title, [...s.lines])
    else prev.push('', ...s.lines)
  }

  const out: string[] = []
  // ── 标准节（= 该文档自己的节名）：本次写了用新的，没写沿用旧的 ──
  for (const title of titles) {
    if (touched.has(title)) {
      out.push(`## ${title}`, '')
      // ⭐ 规范块插在**正文之前**（不是"最前面"就够——`## 标题` 必须在它之前）。
      const blk = blockFor(title)
      if (blk.length > 0) out.push(...blk, '')
      const body = (touched.get(title) ?? []).join('\n').trim()
      if (body !== '') out.push(body, '') // ⚠️ 空内容 ⇒ 只留标题 ⇒ **这一节被清空**
    } else {
      const prior = old.filter((s) => s.title === title)
      out.push(`## ${title}`, '')
      const blk = blockFor(title)
      if (blk.length > 0) out.push(...blk, '')
      const body = prior.map((s) => s.lines.join('\n')).join('\n').trim()
      if (body !== '') out.push(body, '')
    }
  }

  // ── 非标准节：先按本次 doc 的顺序输出（写了用新的），再补旧的里没被碰过的 ──
  const extraSeen = new Set<string>()
  for (const s of ins) {
    if (standard.has(s.title) || extraSeen.has(s.title)) continue
    extraSeen.add(s.title)
    out.push(`## ${s.title}`, '')
    const blk = blockFor(s.title)
    if (blk.length > 0) out.push(...blk, '')
    const body = s.lines.join('\n').trim()
    if (body !== '') out.push(body, '')
  }
  for (const s of old) {
    if (standard.has(s.title) || extraSeen.has(s.title)) continue
    extraSeen.add(s.title)
    out.push(`## ${s.title}`, '')
    // ⭐ 决策 209：这一支同样要回填规范块（旧的没被碰过的自定义节）。
    const blk = blockFor(s.title)
    if (blk.length > 0) out.push(...blk, '')
    const body = s.lines.join('\n').trim()
    if (body !== '') out.push(body, '')
  }

  return out.join('\n').trimEnd()
}

/**
 * ⭐⭐⭐ **把模板的规范块"插进"已有叙事**（决策 209，建项目专用）。
 *
 * ── 它与 `mergeNarrative` 的区别（**别混用**）──────────────────────────────
 *   · `mergeNarrative(patch, old, titles)` = 「patch 写了哪几节就换掉哪几节」；
 *   · `insertSpecBlocks(text, tpl)`       = 「**正文一个字不动**，只在每个节标题后
 *      补上该节的规范块」。
 *   🔴 我第一版拿前者干后者的活 ⇒ 骨架里的节**没有正文**，
 *      于是被当成"本次没写"⇒ **正文全部清空**（实测 6 节只剩规范块）。
 *   ⭐ 判据：**"插入"与"合并"是两种操作**，不要借同一个函数（借了就会踩这个坑）。
 *
 * ⚠️ **已经带规范块的节不动它**（幂等：重复调用结果相同）。
 * ⚠️ **模板里没有的节**：不补（宁可没有规范，也不贴错的）。
 * @param text - 已有叙事（含正文）。
 * @param tpl - 模板（提供每节的 desc / truncate）。
 * @returns 插好规范块的叙事。
 */
function insertSpecBlocks(text: string, tpl: Template): string {
  const descOf = new Map(tpl.sections.map((s) => [s.name, s]))
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m === null) {
      out.push(line)
      i += 1
      continue
    }
    const title = (m[1] ?? '').trim()
    // 这一节的行区间（到下一个顶层 `##` 之前）。
    let j = i + 1
    while (j < lines.length && !/^##\s+/.test(lines[j] ?? '')) j += 1
    const seg = lines.slice(i, j)
    out.push(line)
    const s = descOf.get(title)
    // ⚠️ 已有规范块 ⇒ 原样保留（幂等）；模板里没这一节 ⇒ 不补。
    if (s !== undefined && specBlockRange(seg) === undefined) {
      out.push('', `${FENCE_SPEC}${s.truncate === true ? ' truncate' : ''}`)
      if (s.desc.trim() !== '') out.push(s.desc.trim())
      // 🔴 **闭合行是裸围栏**（不是 `FENCE_SPEC`）——我第一版两处都用了 `FENCE_SPEC`
      //    ⇒ 渲染出 ` ```memj:spec ` 当收尾 ⇒ `specBlockRange` **认不出闭合**
      //    ⇒ 规范块"不闭合" ⇒ 反解为空、`truncateSections` 不写（实测抓到）。
      out.push(FENCE_BARE, '')
    }
    out.push(...seg.slice(1))
    i = j
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/**
 * 从 LLM 给的 `doc` 里抽出**叙事部分**并规范化成该文档的节结构。
 *
 * 这样无论 LLM 传的是"整份文档"还是"只有叙事"、写全了还是只写了几节，
 * 结果都是**固定的节结构**（默认六节，或自定义模板的节）。
 * @param doc - LLM 给的文档文本。
 * @param titles - ⭐ **该文档的节名清单**（决策 204）。省略 ⇒ 默认六节。
 * @returns 规范化后的叙事 markdown。
 */
export function narrativeFromDoc(doc: string | undefined, titles: readonly string[] = NARRATIVE_TITLES): string {
  if (doc === undefined || doc.trim() === '') return buildSkeleton(titles)
  // 去掉 frontmatter（我们会重新生成）。
  const { body } = splitFrontmatter(doc)
  // 去掉封面围栏块。
  const withoutCovers = stripCovers(body)
  // 砍掉「沉淀知识」节及其后内容——那一节只放封面，由我们重建。
  const narrative = cutKnowledgeSection(withoutCovers)
  // 去掉一级标题（我们按项目 id 重新生成）。
  const noTitle = narrative.replace(/^#\s+HANDOFF[^\n]*\n+/i, '')
  // 🔴 **去掉「文件位置」行内注释**（同 `parse.ts` 的理由）：LLM 若把
  //    "上一轮生成的整份文档"原样当 `doc` 传回来，里面就带着我们自己的注释，
  //    不剥掉会**每轮 +1**（实测累积 bug）。
  const noLoc = noTitle.replace(/^\s*<!--\s*文件位置：[^>]*-->\s*$/gm, '')
  const normalized = normalizeNarrative(noLoc, titles)
  return normalized === '' ? buildSkeleton(titles) : normalized
}

/**
 * ⭐ **清理 `doc` 的外壳，但保留"哪些节被写了"这个信息**（决策 109 的合并要用）。
 *
 * 与 `narrativeFromDoc` 的区别：**不做 `normalizeNarrative`**
 * ——那一步会把**缺失的节补成空标题**，于是"没写"和"写了但空"就分不出来了，
 * 而合并恰恰靠这个区分（见 `mergeNarrative`）。
 * @param doc - LLM 给的文档文本。
 * @returns 清理后的原文（节结构保持 LLM 给的样子）。
 */
function narrativeFromDocBare(doc: string | undefined): string {
  if (doc === undefined || doc.trim() === '') return ''
  const { body } = splitFrontmatter(doc)
  const withoutCovers = stripCovers(body)
  const narrative = cutKnowledgeSection(withoutCovers)
  const noTitle = narrative.replace(/^#\s+HANDOFF[^\n]*\n+/i, '')
  // 同 `narrativeFromDoc`：剥掉我们自己加的「文件位置」注释，防止每轮 +1。
  const noLoc = noTitle.replace(/^\s*<!--\s*文件位置：[^>]*-->\s*$/gm, '')
  // 🔴🔴 **必须砍掉「本档写作规范」节**（2026-10-12）：模型若把整份文档回传
  //   （它确实会——本项目实测过多次），旧规范就会作为**一个自定义节**进入合并
  //   ⇒ 与我们随后重建的那一份**并存**（文档里出现两个规范节）。
  //   ⚠️ 与「沉淀知识」同样的处置：**内容由工具维护 ⇒ 先砍掉、后重建**。
  return cutSpecSection(noLoc)
}

/**
 * ⭐ **列出叙事里的顶层节标题**（决策 112 的"读全了吗"判据用）。
 *
 * 与 `inheritedIn` 用同一个 `splitH2`——**同一份解析实现**，
 * 否则"哪些节存在"两处会漂移。
 *
 * 🔴🔴 **必须排除工具自己维护的两节**（2026-10-12 新增；否则闸门会瞎拦）：
 *    `## 沉淀知识` 与 `## 本档写作规范` 都**由工具生成**，模型既不需要写、
 *    也不该被要求"读过它们才算读全"。
 *    ⚠️ 判据据实：`memj_read` 的 `availableSections` 是**按正文切出来的全部顶层节**
 *    ⇒ 若这里不过滤，`missing` 会**永远包含规范节** ⇒ **模型把文档读得再全也过不了闸门**
 *    （这正是本函数的输出被拿去当"必须读到的集合"用的缘故）。
 * @param narrative - 纯叙事文本。
 * @returns 节标题数组（按文档顺序，已去重、已剔除工具维护的节）。
 */
function narrativeTopSections(narrative: string): string[] {
  const out: string[] = []
  for (const s of splitH2(narrative)) if (!out.includes(s.title)) out.push(s.title)
  return out
}

/**
 * ⭐⭐ **该文档要自动截断的那些节**（决策 204 / 206）——**完全从文档自己身上取**。
 *
 * 🔴🔴 **为什么不查模板**：模板**可以被改、被删**，而文档与它**解耦**
 *   ⇒ 文档必须**自描述**。光有节名不够（节名不表达"哪节能截"）。
 *
 * 🔴🔴 **2026-10-12 起：正文优先**（与节名同一取向，见 `docSectionsOf`）。
 *   原先只读 `frontmatter.truncateSections`，而那个字段会被
 *   `rebuildDerivedLayers()` 的旁路重写**抹掉**（实测复现）⇒ "哪节能截"丢失。
 *   现在：**规范节里写着的那份**（正文，权威）→ frontmatter → 默认六节的目标。
 *
 * ⚠️ **判据顺序有意义（别调换）**：
 *   ① 正文规范节里解析出「有截断标记」的节 ⇒ 用它（**哪怕结果为空数组**：那是"真的不截"）；
 *   ② 正文没有规范节（老文档）⇒ 看 frontmatter：`sections` 空 ⇒ 默认六节目标；
 *      `sections` 非空 ⇒ 以 `truncateSections` 为准（空 = 不截，**不猜**）。
 * @param sections - 文档 frontmatter 里的节名清单。
 * @param truncateSections - 文档 frontmatter 里的截断目标节（**可多个**，决策 206）。
 * @param narrative - 纯叙事文本（含规范节；**权威来源**）。
 * @returns 要截断的节名数组；空数组 = 不截。
 */
function defaultTruncateTitle(
  sections: readonly string[] | undefined,
  truncateSections: readonly string[] | undefined,
  narrative?: string,
): string[] {
  // ① ⭐⭐ **正文优先**（决策 209 改：从**各节自己的规范块**读）。
  //    🔴 与决策 207 的区别：那时规范在**末尾一节**里、用行内列表反解；
  //       现在规范**长在各节自己身上**（围栏起始行的 `truncate`）。
  //    ⚠️ 语义不变：**"解析出来是空数组"= 真的不截**（不是"没找到"）。
  const fromBlocks = truncateTitlesFromBlocks(narrative ?? '')
  if (fromBlocks.length > 0) return fromBlocks
  // ⚠️ **兼容决策 207 的旧形态**：文档里若还留着末尾的 `## 本档写作规范` 节
  //    （存量、或用户手写的），仍从它反解 —— 否则那些文档会**静默变成"不截"**。
  const legacy = extractSpecSection(narrative ?? '')
  if (legacy.trim() !== '') return truncateTitlesFromSpec(legacy)
  // ② 回落 frontmatter（老文档 / 还没生成规范块）。
  const mine = (sections ?? []).map((s) => s.trim()).filter((s) => s !== '')
  if (mine.length === 0) return [PROGRESS_TITLE]
  return (truncateSections ?? []).map((s) => s.trim()).filter((s) => s !== '')
}

/**
 * ⭐ 从模板取"要截断的节名"（**可多个**，决策 206）。
 * @param t - 模板。
 * @returns 节名数组；没有节声明 `truncate` ⇒ **空数组**。
 */
function templateTruncateTitle(t: { sections: Array<{ name: string; truncate?: boolean }> }): string[] {
  return t.sections.filter((s) => s.truncate === true).map((s) => s.name)
}

/**
 * ⭐ **列出本次合并中"沿用了旧内容"的节**（决策 109 的回执要报出来）。
 *
 * 🔴 **为什么要报**：合并让"没写"变成**安全的默认**（保留旧值），
 *    但也带来一个新的静默风险——**模型以为清空了、其实没清**，
 *    或者**忘了写某个该更新的节**。
 *    ⇒ 把它列出来，模型扫一眼就知道"这些节这轮没动过"。
 * @param incoming - 本次 `doc`。
 * @param existing - 旧叙事。
 * @returns 沿用旧内容的节标题（按旧文档顺序）。
 */
function inheritedIn(incoming: string | undefined, existing: string): string[] {
  const touched = new Set(splitH2(narrativeFromDocBare(incoming)).map((s) => s.title))
  return splitH2(existing)
    .map((s) => s.title)
    .filter((t) => !touched.has(t))
}

/**
 * ⭐⭐ **列出本次合并中"被替换（或清空）"的节，并给出字数变化**。
 *
 * 🔴🔴 **为什么必须有这一半**（真实事故，2026-09-19）：
 *    原来的回执**只报"沿用的节"**，于是**"某节被整节替换"这件事在回执里完全不可见**。
 *    实际发生的事故是：模型把"只写有变化的节"理解成"只写这次**新增的那一小段**"，
 *    ⇒ 写了 `## 当前进度` 却只带了新增段 ⇒ 工具按"出现过 = 整节替换"处理
 *    ⇒ **该节原有的一大段历史被静默删掉**，而回执只说"其他节沿用了旧内容"，
 *    **完全看不出刚有一节被砍掉了一大半**。
 *    ⇒ 报出**每个被替换节的字数增减**，这类事故就**当场可见**
 *      （"-4200 字符"一眼就不对劲）。
 *
 * ⚠️ **判据要用"节的正文长度"**，不能用行数——正文里长段落的增删才是信号。
 * @param incoming - 本次 `doc`（原始）。
 * @param existing - 旧叙事。
 * @returns 每项含节标题、旧长度、新长度、差值。
 */
function replacedIn(
  incoming: string | undefined,
  existing: string,
): Array<{ title: string; before: number; after: number }> {
  const bare = narrativeFromDocBare(incoming)
  /** 本次写了的节 → 合并后的正文（同名多次按 `mergeNarrative` 的规则拼接）。 */
  const touched = new Map<string, string[]>()
  for (const s of splitH2(bare)) {
    const prev = touched.get(s.title)
    if (prev === undefined) touched.set(s.title, [...s.lines])
    else prev.push('', ...s.lines)
  }
  /** 旧文档里每节的正文长度（同名取合计，与合并行为一致）。 */
  const oldLen = new Map<string, number>()
  for (const s of splitH2(existing)) {
    oldLen.set(s.title, (oldLen.get(s.title) ?? 0) + s.lines.join('\n').trim().length)
  }

  const out: Array<{ title: string; before: number; after: number }> = []
  for (const [title, lines] of touched) {
    const after = lines.join('\n').trim().length
    const before = oldLen.get(title)
    // ⚠️ 只报**旧文档里本来就有**的节——全新节是"新增"，不是"替换"，另说会误导。
    if (before === undefined) continue
    out.push({ title, before, after })
  }
  return out
}

// ───────────────────────────────────────────────────────────────────────────
// ⭐ **孤本判据检测**（决策 127，本块是 C 层的机制兜底）
// ───────────────────────────────────────────────────────────────────────────

/**
 * 「判据特征词」——一句里出现任一，就算**候选判据**。
 *
 * ⚠️ **它只是粗筛，必然有误报**（正文里"引用"一条判据时也会命中）。
 *    ⇒ 所以整个机制**只用来警告，绝不用来拒绝**（见 `orphanJudgments` 的注释）。
 */
const JUDGMENT_RE = /必须|不许|不得|禁止|不要|会被拒|判据|务必|不能|绝不|一律/

/**
 * 归一化：**只留汉字/字母/数字**，把标点、空白、强调符号全部剥掉。
 *
 * 🔴 **为什么必须剥**：判据句里全是 `**加粗**`、`⭐`、全角标点；
 *    不剥的话"同一句话"在两次渲染里会因格式差异而**永远匹配不上**（假孤本）。
 * @param s - 原文本。
 * @returns 归一化后的字符序列。
 */
function normalizeForCompare(s: string): string {
  return s.replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '')
}

/** 比对窗口（连续多少字相同就算"别处有"）。 */
const ORPHAN_WINDOW = 12

/**
 * 该片段是否**在对照文本里出现过**（12 字窗口滑动）。
 *
 * ⚠️ **为什么用滑窗而不是整句相等**：同一件事在别处往往是**改写**过的，
 *    整句比对会把"已备份"误判成"孤本" ⇒ 报警过载 ⇒ 噪音（本项目已验证噪音的代价）。
 * @param text - 待検片段。
 * @param pool - 对照文本（已归一化）。
 * @returns 出现过为 true。
 */
function appearsIn(text: string, pool: string): boolean {
  const n = normalizeForCompare(text)
  if (n.length < ORPHAN_WINDOW) return false
  for (let i = 0; i + ORPHAN_WINDOW <= n.length; i += 3) {
    if (pool.includes(n.slice(i, i + ORPHAN_WINDOW))) return true
  }
  return false
}

/**
 * ⭐⭐ **数出某节里"孤本判据"的条数**——只在这一节出现、别处没有对应表述的判据。
 *
 * 🔴🔴 **为什么需要它**（决策 127 的核心；这是"压缩悬崖"的机制化防线）：
 *    实测某项目交接文档：「当前进度」占 **46%**（唯一的主要膨胀源），其中
 *    · 出现 20 个知识 id ⇒ **全部在库里有封面**（细节有备份 ⇒ **可压**）；
 *    · 含判据特征词的 **42 行**里，**只有 5 行**在别的节里有对应表述
 *      ⇒ **37 条判据是"孤本"**（删了就**永久丢失**）。
 *    ⚠️ **压缩悬崖的成因**：孤本判据与流水账**混在同一节、长得也像**，
 *    一旦按"整节归并"处理，**被磨掉的恰恰是那 37 条**。
 *
 * ⭐ **判据**：**不是"它属于什么类型"，而是"别处有没有备份"**。
 * @param section - 待测节的正文行。
 * @param otherText - 文档**其余部分**的文本（作为"别处有没有"的对照池）。
 * @returns 孤本判据的条数。
 */
function coupleJudgments(section: readonly string[], otherText: string): number {
  const pool = normalizeForCompare(otherText)
  let n = 0
  for (const raw of section) {
    const line = raw.trim()
    if (line.length < 10) continue
    if (!JUDGMENT_RE.test(line)) continue
    // ⚠️ 先剥掉「指向知识条目」的 id 再比对：id 本身在库里，
    //    不能因为"这行引了 id"就把它判成"别处有"（那会把孤本判据漏掉）。
    const stripped = line.replace(/`[0-9a-f]{8}`/g, '')
    if (!appearsIn(stripped, pool)) n += 1
  }
  return n
}

/**
 * ⭐ **统计某节在"合并前 / 合并后"两个版本里的孤本判据条数**（决策 127 的回执用）。
 *
 * 🔴 **只对「当前进度」做**——因为它是唯一的主要膨胀源，也是唯一会做"归并压缩"的节；
 *    其余五节按规范**只做语义精炼、不许删条目**（见 §5.2 块 E）。
 * @param before - 合并前的完整叙事。
 * @param after - 合并后的完整叙事。
 * @returns 两版各自的孤本判据条数；任一侧取不到该节时为 `undefined`。
 */
function orphanJudgments(
  before: string,
  after: string,
): { before: number; after: number } | undefined {
  const target = PROGRESS_TITLE
  const pick = (narrative: string): string[] | undefined => {
    for (const s of splitH2(narrative)) if (s.title === target) return s.lines
    return undefined
  }
  const a = pick(before)
  const b = pick(after)
  if (a === undefined || b === undefined) return undefined
  // 对照池 = 该文档**其余部分**（含另一版里的同一节，避免"自己跟自己比"）。
  const others = splitH2(before)
    .filter((s) => s.title !== target)
    .map((s) => s.lines.join('\n'))
    .join('\n')
  const othersAfter = splitH2(after)
    .filter((s) => s.title !== target)
    .map((s) => s.lines.join('\n'))
    .join('\n')
  return {
    before: coupleJudgments(a, `${others}\n${othersAfter}`),
    after: coupleJudgments(b, `${others}\n${othersAfter}`),
  }
}

/**
 * ⭐ 校验一条 entry 的**形状**（**纯参数，不读库**）。
 *
 * 🔴 **为什么抽成独立函数**（决策 103 / §3.11.6）：同一套规则要用于**两处**——
 *   ① `pre-execute` 闸门（**提前**拦截，不读盘、不构建，失败理由直接回给模型）；
 *   ② `runHandoff` 内部（§3.9 的硬校验，防"直接调工具函数"绕过闸门）。
 *   ⚠️ **必须是同一份实现**——两处各写一遍必然漂移（本项目已多次踩到"多副本"坑）。
 *
 * ⚠️ **只做 schema 表达不了的那部分**（长度/格式/正则）：
 *   `required`、类型这些交给工具参数 schema，不在这里重复。
 * @param e - 一条 entry 入参。
 * @param label - 报错前缀（如 `entries[0]`）。
 * @returns 问题列表（空 = 通过）。
 */
export function checkEntryShape(e: HandoffEntry, label: string): string[] {
  const out: string[] = []
  const slug = (e.slug ?? '').trim()
  if (!SLUG_RE.test(slug)) {
    out.push(
      `${label} 的 slug 不合规：「${slug}」——须为**全小写英文/数字/连字符**，2–48 字符` +
        '（中文会被过滤掉，不要用拼音）。',
    )
  }
  const title = (e.title ?? '').trim()
  if (title === '') out.push(`${label} 缺 title（必填，2–48 字符）`)
  else if (charCount(title) < TITLE_MIN_CHARS) {
    out.push(`${label} 的 title 过短：${charCount(title)} 字符（下限 ${TITLE_MIN_CHARS}）`)
  } else if (charCount(title) > TITLE_MAX_CHARS) {
    out.push(`${label} 的 title 超长：${charCount(title)} 字符（上限 ${TITLE_MAX_CHARS}）`)
  }
  if (e.desc === undefined || e.desc.trim() === '') out.push(`${label} 缺 desc（必填）`)
  else if (charCount(e.desc) > 200) {
    out.push(`${label} 的 desc 超长：${charCount(e.desc)} 字符（上限 200）`)
  }
  if ((e.tags ?? []).length === 0) out.push(`${label} 的 tags 为空（至少 1 个）`)
  // ⭐⭐ **两种落盘方式互斥**（决策：只引用不搬动 vs 落库）：
  //   · `ext: true` ⇒ **外部引用**：正文在库外 ⇒ **不校验 body**，改校验 `ref` 是绝对路径；
  //   · 否则 ⇒ **落库**：`body` 必填且要以标题行开头。
  if (e.ext === true) {
    const ref = (e.ref ?? '').trim()
    if (ref === '') {
      out.push(`${label} 是外部引用（ext: true）但没给 \`ref\`（须为**库外文档的绝对路径**）`)
    } else if (!isAbsolutePath(ref)) {
      out.push(`${label} 的 \`ref\` 不是绝对路径：「${ref}」——外部引用必须填绝对路径`)
    }
  } else {
    if ((e.ref ?? '').trim() !== '') {
      out.push(
        `${label} 给了 \`ref\` 但没设 \`ext: true\`——\`ref\` 只在**外部引用**时由你填；` +
          '落库条目的 `ref` 由工具自动生成，请删掉它（或补 `ext: true` 走外部引用）。',
      )
    }
    const bodyText = (e.body ?? '').trim()
    if (bodyText === '') out.push(`${label} 的 body 为空`)
    else if (!/^#{1,3}\s+\S/m.test(bodyText)) {
      // 🔴 **为什么查这个**（§3.3）：设计要求正文以标题行开头（`### 标题`）。
      //    实测踩到的真实故障是**body 被中途截断**——残留一段没有标题的碎片
      //    （如 `**结论**：基于`）被原样落盘，**读者看不出它其实是半句话**。
      //    ⚠️ schema **表达不了正则**（不支持 `pattern`），只能在这里查。
      out.push(
        `${label} 的 body 里找不到标题行（\`###\` / \`##\` / \`#\` 开头）。\n` +
          '    设计要求正文以标题行开头；若你确实是中途写断了，请补完整再提交。',
      )
    }
  }

  // ⭐ `kind` 是**受控四值**（决策 81）；留空合法，填了别的值才报错。
  const rawKind = (e.kind ?? '').trim()
  if (rawKind !== '' && !isEntryKind(rawKind)) {
    out.push(
      `${label} 的 kind 取值非法：「${rawKind}」——只能是 ` +
        `${ENTRY_KINDS.join(' / ')} 之一，或留空（留空 = 未分类）。`,
    )
  }
  return out
}

/**
 * ⭐ 校验一条 adopt 的**形状**（纯参数，不读库）。与 `checkEntryShape` 同一套理由。
 * @param a - 一条 adopt 入参。
 * @param label - 报错前缀（如 `adopt[0]`）。
 * @returns 问题列表（空 = 通过）。
 */
export function checkAdoptShape(a: AdoptRequest, label: string): string[] {
  const out: string[] = []
  const slug = (a.slug ?? '').trim()
  if (!SLUG_RE.test(slug)) {
    out.push(`${label} 的 slug 不合规：「${slug}」——须为全小写英文/数字/连字符，2–48 字符`)
  }
  const title = (a.title ?? '').trim()
  if (title === '') out.push(`${label} 缺 title（必填，2–48 字符）`)
  else if (charCount(title) < TITLE_MIN_CHARS) {
    out.push(`${label} 的 title 过短：${charCount(title)} 字符（下限 ${TITLE_MIN_CHARS}）`)
  } else if (charCount(title) > TITLE_MAX_CHARS) {
    out.push(`${label} 的 title 超长：${charCount(title)} 字符（上限 ${TITLE_MAX_CHARS}）`)
  }
  if (a.desc === undefined || a.desc.trim() === '') out.push(`${label} 缺 desc（必填）`)
  else if (charCount(a.desc) > 200) {
    out.push(`${label} 的 desc 超长：${charCount(a.desc)} 字符（上限 200）`)
  }
  if ((a.tags ?? []).length === 0) out.push(`${label} 的 tags 为空（至少 1 个）`)
  if ((a.ref ?? '').trim() === '') out.push(`${label} 缺 ref（原文件路径）`)
  const rawKind = (a.kind ?? '').trim()
  if (rawKind !== '' && !isEntryKind(rawKind)) {
    out.push(
      `${label} 的 kind 取值非法：「${rawKind}」——只能是 ` +
        `${ENTRY_KINDS.join(' / ')} 之一，或留空。`,
    )
  }
  return out
}

/**
 * ⭐⭐ **形状校验的聚合入口**（纯参数、不读库、不抛异常）。
 *
 * 供 `pre-execute` 闸门与 `runHandoff` **共用**（决策 103 / §3.11.6）。
 * 🔴 **只返回问题，不做任何 I/O**——闸门必须够快（它拦在工具体之前）。
 * @param entries - 本次的 entries（可为 `undefined`）。
 * @param adopt - 本次的 adopt（可为 `undefined`）。
 * @returns 问题列表（空 = 通过）。
 */
export function checkKnowledgeShape(
  entries: readonly HandoffEntry[] | undefined,
  adopt: readonly AdoptRequest[] | undefined,
): string[] {
  const out: string[] = []
  const es = entries ?? []
  for (let i = 0; i < es.length; i += 1) {
    const e = es[i]
    if (e === undefined) continue
    out.push(...checkEntryShape(e, `entries[${i}]`))
  }
  const as = adopt ?? []
  for (let i = 0; i < as.length; i += 1) {
    const a = as[i]
    if (a === undefined) continue
    out.push(...checkAdoptShape(a, `adopt[${i}]`))
  }
  return out
}

/**
 * ⭐⭐ **按 `slug` 在库里找出已存在的知识**（决策 104）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * `schema.ts` 里 `slug` 的注释写着"用于重建文件名**与查重**"，
 * §6 协议也写着"写之前先看已有内容、**不要写出重复的知识**"——
 * 但**实现只做了后者（靠模型自觉），漏了前者（工具硬查）**。
 * ⇒ 实测：同一入参调两次会得到**两条知识**（`id` 每次 `randomUUID()`，而 `slug` 从未被查）。
 *
 * ── ⚠️ 为什么必须读条目文档、不能只看封面 ──────────────────────────────────
 * `scanLibrary()` 的 `covers` **只有封面**，而 **`slug` 只存在
 * `entries/<slug>-<uuid8>.md` 的 frontmatter 里**（封面上没有这个字段）。
 * ⇒ 只能逐一读条目文档。
 *
 * ⚠️ **只查本项目**：跨项目偶有同名 slug 是允许的（不同项目的知识本就独立）。
 * @param covers - 当前项目的封面。
 * @param want - 要查的 slug 集合（小写已 trim）。
 * @returns slug → 已有封面（同 slug 有多条时取**第一条**，兼容历史重复数据）。
 */
async function findEntriesBySlug(
  covers: readonly Cover[],
  want: ReadonlySet<string>,
): Promise<Map<string, Cover>> {
  const found = new Map<string, Cover>()
  if (want.size === 0) return found
  for (const c of covers) {
    if (found.size === want.size) break
    // 外部引用没有 frontmatter（不是 memj 生成的），跳过。
    if (c.ext) continue
    const doc = await loadEntryDoc(c.ref, c.ext)
    const slug = doc?.frontmatter.slug ?? ''
    if (slug !== '' && want.has(slug) && !found.has(slug)) found.set(slug, c)
  }
  return found
}

/**
 * 执行一次 handoff（§7.1 的全部步骤）。
 * @param req - 入参。
 * @param env - 会话与配置。
 * @returns 执行结果。
 */
export async function runHandoff(
  req: HandoffRequest,
  env: { sessionId: string; turn?: number; config: MemjConfig },
): Promise<HandoffResult> {
  const projectId = req.project.trim()
  if (projectId === '') {
    return fail('project 不能为空。')
  }

  // ── ⭐ 先决定本次做哪几步（决策 101 / §3.11）──
  //    ⚠️ **缺省 `all`** ⇒ 老协议/老会话/裸调命令的行为**完全不变**。
  const plan = planSteps(req.step)
  if (plan.error !== undefined) return fail(plan.error)
  const steps = plan.steps
  const want = (s: Exclude<HandoffStep, 'all'>): boolean => steps.has(s)

  const snapshot = await scanLibrary()
  const existingProjects = snapshot.projects.map((p) => p.id)
  const isNewProject = !existingProjects.includes(projectId)

  // ⭐ **本会话读过哪些知识**（决策 108 的方案 3：回执事实核对要用）。
  //    🔴 **必须在 `theme` 步消费快照之前取**——那一步会把它们标记为已消费，
  //    之后 `pendingSnapshots()` 就查不到了（会恒为 0，提示永远不触发）。
  const readAtStart = await pendingSnapshots(env.sessionId)
  const readCountAtStart = readAtStart.length
  const readTitlesAtStart = readAtStart.map((s) => s.title)

  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐ **写叙事前必须先读过该项目文档**（决策 112）
  //
  // 🔴 **为什么是硬校验**：决策 109 让 `doc` 按节合并，但当时就承认了缺口——
  //    **模型没有任何工具能读到项目文档的全部叙事节** ⇒ 只能凭记忆重写。
  //    ⚠️ **真实事故**：某轮 handoff 我读了四节、**唯独漏读「当前进度」**
  //    ——恰恰是要写的那一节 ⇒ 没把新批次写进该节，反而另起了一个顶层自定义节，
  //    把"该写没写"包装成了"按节合并的设计如此"。
  //    ⇒ 这不是态度问题，是**机制上没有要求、也没有正规通道**。
  //
  // ⭐ **边界（用户拍板）**：只在**真的要写叙事**时要求——即
  //    `narrative` 步 + 给了 `doc`。单做 `knowledge`/`theme` 步**不受影响**。
  // ⚠️ **新项目例外**：库里本来就没有文档可读，不能要求（否则死锁）。
  //
  // ⭐⭐ **有效期 = 一个完整轮次**（用户明确："不是 step 的颗粒，是一个完整轮次的颗粒"）：
  //    **上一轮读过不算**——上一轮 handoff 很可能刚改过这份文档，
  //    凭上一轮的印象写就等于没读。`turn < 0`（拿不到轮次）时退化为
  //    "本会话读过即可"（宁可放松也不误拦）。
  // ══════════════════════════════════════════════════════════════════════
  const wantNarrative = want('narrative')
  const hasDocArg = req.doc !== undefined && req.doc.trim() !== ''
  const turnNow = env.turn ?? -1
  if (wantNarrative && hasDocArg && !isNewProject) {
    const rec = await findDocRead(env.sessionId, projectId, turnNow)
    if (rec === undefined) {
      return fail(
        `写交接文档（\`doc\`）之前，**必须先在本次对话轮次里读一遍项目 \`${projectId}\` 的现有交接文档**。\n` +
          '⚠️ **凭记忆重写必然压缩、丢细节**（这正是"累积的活文档"要避免的）；\n' +
          '⚠️ **上一轮读过也不算**——上一轮很可能刚改过这份文档，要看**最新**的内容。\n\n' +
          '请先调用：\n' +
          `  \`memj_read({ project: "${projectId}" })\`\n` +
          '它会把现有叙事按节返回；读完整篇（或逐节读完）之后再重调本工具。\n' +
          '💡 只做 `knowledge` / `theme` 步时**不需要**这一步。',
      )
    }
    // ⚠️ 逐节读的情形：必须**把全部节都读到**才算"完整读过一遍"。
    //    判据是"读到的节名集合 ⊇ 文档现有的顶层节名集合"。
    if (!rec.full) {
      const existing0 = await loadProjectDoc(projectId)
      const allTitles = narrativeTopSections(existing0?.narrative ?? '')
      const missing = allTitles.filter((t) => !rec.sections.includes(t))
      if (allTitles.length > 0 && missing.length > 0) {
        return fail(
          `你读了项目 \`${projectId}\` 的交接文档，但**没有读全**——还差这些节：` +
            `${missing.map((s) => `\`${s}\``).join('、')}。\n` +
            '⚠️ 漏读的节可能在 `doc` 里被**整节覆盖掉**（"按节合并"只保护**没写**的节）。\n\n' +
            `请补齐：\`memj_read({ project: "${projectId}", section: "..." })\`，` +
            `或直接 \`memj_read({ project: "${projectId}", full: true })\` 通读整篇。`,
        )
      }
    }
  }

  // ── 🔴 参数与 step 的一致性（**防"静默忽略"**）──
  //    为什么必须有：若 `step:'knowledge'` 却传了 `doc`，**静默忽略**会让调用方
  //    **以为叙事更新了**——这正是"半套状态"里最隐蔽的一种。
  //    ⇒ 宁可**直接拒绝**并要求二选一，也不要默默丢掉参数。
  //    ⚠️ 判据是"**给了非空值**"：`entries: []` 这类空数组不算冲突。
  //    ⚠️ **`projectDesc` 例外**：新建项目时它**被真正使用**（建文档必需），
  //       不是被忽略 ⇒ 那种情况下放行。否则「新项目 + step:'theme'」会**死锁**
  //       （建文档要它、一致性检查又拦它）。
  const offStep: string[] = []
  if (!want('narrative')) {
    if (req.doc !== undefined && req.doc.trim() !== '') offStep.push('`doc`')
    if (!isNewProject && req.projectDesc !== undefined && req.projectDesc.trim() !== '') {
      offStep.push('`projectDesc`')
    }
  }
  if (!want('theme') && (req.newThemes ?? []).length > 0) offStep.push('`newThemes`')
  if (!want('theme') && (req.linkedSnapshots ?? []).length > 0) offStep.push('`linkedSnapshots`')
  // ⭐ 决策 134：`docSection` / `docOp` 也属叙事步——不给 narrative 步时它们无处生效。
  if (!want('narrative') && (req.docSection ?? '').trim() !== '') offStep.push('`docSection`')
  if (!want('narrative') && req.docOp !== undefined) offStep.push('`docOp`')
  if (!want('knowledge') && ((req.entries ?? []).length > 0 || (req.adopt ?? []).length > 0)) {
    offStep.push('`entries` / `adopt`')
  }
  if (offStep.length > 0) {
    return fail(
      `参数与 \`step\` 不一致：本次 step 是 ${[...steps].map((s) => `\`${s}\``).join('、')}` +
        `（原始输入：\`${String(req.step)}\`），但你给了 ${offStep.join('、')}。\n` +
        '⚠️ 这些参数**不会被处理**。为避免"你以为写了、其实没写"，这里直接拒绝。\n' +
        '请二选一：把对应步骤加进 `step`，或去掉这些参数。',
    )
  }

  // ── 0. 项目：新建时先做相似 id 的两段式确认（§4.2 步骤 0 / 决策 47）──
  let similarProjects: string[] = []
  if (isNewProject) {
    similarProjects = findSimilarIds(projectId, existingProjects, env.config.similarEditDistance)
    if (similarProjects.length > 0 && req.confirmCreate !== true) {
      return {
        ...fail(
          `库里已有相似的项目 id：${similarProjects.map((s) => `\`${s}\``).join('、')}。\n` +
            `你是想**更新**它，还是要**新建** \`${projectId}\`？\n` +
            '若要新建，请带 `confirmCreate: true` 再调一次。',
        ),
        similarProjects,
      }
    }
    if (req.projectDesc === undefined || req.projectDesc.trim() === '') {
      return { ...fail(`新建项目 \`${projectId}\` 时必须给 \`projectDesc\`（项目描述，≤200 字符）。`), similarProjects }
    }
    if (charCount(req.projectDesc) > 200) {
      return {
        ...fail(`projectDesc 超长：${charCount(req.projectDesc)} 字符（上限 200）。`),
        similarProjects,
      }
    }
  }

  // ── 1. 新建主题（⭐ 必须在写封面之前）──
  //    ⭐ **数据门控**：不在本次 step 里 ⇒ 当成"没给"，后续全部自然跳过。
  const pendingThemes = want('theme') ? (req.newThemes ?? []) : []
  const allThemeIds = [...snapshot.themeIds]
  let similarThemes: string[] = []

  // ⭐ **跨项目证据只是 strict 模式下的闸门**（决策 95）。
  //    loose 模式下这一问**完全交给 LLM**，工具不做该校验（用户 2026-09-19 拍板）。
  const looseThemes = env.config.themeCreation === 'loose'

  // ⭐⭐ **准挂表**（决策 111）：只补挂 LLM **显式列出**的快照 id。
  //    🔴 **省略 = 一条都不挂**（fail-closed）——这是有意的行为变更：
  //    原先无条件全挂，导致"读过但无关"的知识被误挂进主题（用户发现）。
  const linkedIds = new Set(
    (want('theme') ? (req.linkedSnapshots ?? []) : []).map((s) => s.trim()).filter((s) => s !== ''),
  )

  // ── ⭐⭐ `linkedSnapshots` 的逐项核对（决策 111）──
  //    🔴 **为什么必须核对、且必须在校验闸门之前**：这个参数的语义是"列了才挂"。
  //    若列了一个**不存在**的 id（拼错、或已被消费/清理），闸门会先报
  //    「你一条都没列」——**那是误导**，真实原因是那条 id 无效。
  //    ⇒ 先逐项核对、说清每条的原因，再进闸门。
  if (linkedIds.size > 0 && want('theme')) {
    const snapsForCheck = await pendingSnapshots(env.sessionId)
    const known = new Map(snapsForCheck.map((s) => [s.entryId, s]))
    const linkedIssues: string[] = []
    for (const id of linkedIds) {
      const s = known.get(id)
      if (s === undefined) {
        linkedIssues.push(
          `\`${id}\` **不在本会话未消费的读快照里**（可能拼错、或那条快照已被消费/已清理）`,
        )
      } else if (s.project === projectId) {
        linkedIssues.push(
          `\`${id}\` 属于**本项目自己**（\`${s.project}\`）——` +
            '本项目知识无需"补挂"；只有**别项目**的快照才能补挂到主题上',
        )
      } else if (s.project === '') {
        linkedIssues.push(`\`${id}\` **没有项目归属**，不能作为跨项目证据`)
      }
    }
    if (linkedIssues.length > 0) {
      return {
        ...fail(
          '`linkedSnapshots` 里有**无效的 id**，整份未写入：\n' +
            linkedIssues.map((s, i) => `${i + 1}. ${s}`).join('\n') +
            '\n\n⚠️ 本会话未消费的快照 id 请用 `memj_snapshots` 取（它会把别项目的筛出来）。',
        ),
        similarProjects,
      }
    }
  }

  if (pendingThemes.length > 0) {
    // 🔴 **严格模式下唯一的一处工具校验**（决策 76、§3.7.2）：
    //    用作证据的快照条目，其 `project` **≠** 本次的 project。
    //    ⚠️ **宽松模式整段跳过**。注意：下面那次 `pendingSnapshots()`
    //    **不属于这里**——它服务于"快照补挂"与"标记已消费"，两种模式都要跑。
    //    ⭐ **决策 111 起**：证据还必须是**被 `linkedSnapshots` 列出**的那条
    //    ——否则"读过一条无关的别项目知识"就能充当建主题的证据。
    if (!looseThemes) {
      const snapshots = await pendingSnapshots(env.sessionId)
      const crossProject = snapshots.filter(
        (s) =>
          s.project !== projectId && s.project !== '' && linkedIds.has(s.entryId),
      )
      if (crossProject.length === 0) {
        const anyCross = snapshots.some((s) => s.project !== projectId && s.project !== '')
        return {
          ...fail(
            `要新建主题，必须有**跨项目证据**：本会话需读过**别的项目**的知识，` +
              `**并把那条列进 \`linkedSnapshots\`**。\n` +
              (anyCross
                ? '⚠️ 你确实读过别项目的知识，但**一条都没列进 `linkedSnapshots`** ' +
                  '（省略该参数 = 一条都不挂）。\n' +
                  '   请先逐条判断"它确实和本次相关吗"，把相关的那些 id 列进去。\n'
                : `当前未消费快照里没有一条的 project ≠ \`${projectId}\`。\n`) +
              '⚠️ 注意：这里只校验这一件事——只要有一条引自别项目的快照**且被你列出**，' +
              '「≥2 个项目」就已经是既成事实，不需要再数什么。\n' +
              '若本项目此前已关联主题，也可以直接挂靠已有主题（挂靠无门槛）。\n' +
              '💡 若希望**不受此限制、由你自行判断新建主题**，' +
              '可由人在 memj 记忆库页面的「⚙ 设置」里把模式切为**宽松**。',
          ),
          similarProjects,
        }
      }
    }
    for (const t of pendingThemes) {
      if (t.id.trim() === '') return { ...fail('newThemes 里有 id 为空的主题。'), similarProjects }
      if (t.desc.trim() === '') {
        return { ...fail(`新建主题 \`${t.id}\` 时必须给 \`desc\`（≤200 字符）。`), similarProjects }
      }
      if (charCount(t.desc) > 200) {
        return {
          ...fail(`主题 \`${t.id}\` 的 desc 超长：${charCount(t.desc)} 字符（上限 200）。`),
          similarProjects,
        }
      }
      // 近义 ⇒ 回相似项确认，不硬建（决策 49）。
      const similar = findSimilarIds(t.id, allThemeIds, env.config.similarEditDistance)
      if (similar.length > 0) {
        similarThemes.push(...similar)
      }
    }
    if (similarThemes.length > 0) {
      return {
        ...fail(
          `库里已有近义的主题：${[...new Set(similarThemes)].map((s) => `\`${s}\``).join('、')}。\n` +
            '**优先并入已有主题**，不要另起近义主题。确要新建请改一个不近义的 id。',
        ),
        similarProjects,
        similarThemes: [...new Set(similarThemes)],
      }
    }
  }

  // ── 2–5. 在内存里构建全部待写内容（这样校验失败才能真正"不半写"）──
  //    ⭐ **数据门控**（决策 101）：不在本次 step 里的，一律当成"没给"。
  //    ⇒ 后续所有构建/校验/落盘逻辑**一行都不用改**，自然只处理该步的数据。
  const entryReqs = want('knowledge') ? (req.entries ?? []) : []
  const adoptReqs = want('knowledge') ? (req.adopt ?? []) : []
  const sessionId = env.sessionId
  /**
   * ⭐ **本次调用统一使用的时间戳**（决策 119）。
   * ⚠️ 一次调用里所有条目共用同一个值——否则它们在时间上会"参差不齐"，
   * 而它们**本来就是同一次沉淀**。
   */
  const nowIso = new Date().toISOString()

  /** 本次要写入/更新的项目文档里的封面（含保留的旧封面）。 */
  const existing = await loadProjectDoc(projectId)
  const keptCovers: Cover[] = existing?.covers ?? []

  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐⭐ **模板 → 节名**（决策 204）
  //
  // 🔴🔴 **只在新建项目时取值**（用户裁定：模板不回溯已有文档）：
  //    · 项目已存在 ⇒ `newSections` 用**它自己的** `sections`（写回时也沿用）；
  //    · 新建 ⇒ 按 `req.template` 的节名建骨架（省略模板 ⇒ 默认六节）。
  //
  // ⚠️ **`templateId` 是纯记录**（哪份文档按哪套结构建的）；真正生效的是节名。
  // ══════════════════════════════════════════════════════════════════════
  const isNewProjForTpl = existing === undefined
  let newSections: string[] = existing?.frontmatter.sections ?? []
  let templateId = existing?.frontmatter.template ?? ''
  let newTruncateSection: string[] = existing?.frontmatter.truncateSections ?? []
  /** ⭐ 本次真正用的那份模板（**只用于回执现报节数**，见下方赋值处）。 */
  let appliedTemplate: { id: string; sections: Array<{ name: string }> } | undefined
  /**
   * ⭐⭐⭐ **该文档的节名**（所有按节工作的机制都用它）。
   *
   * 🔴🔴 **2026-10-12 改：正文优先，frontmatter 降级为兼容读**（`docSectionsOf`）。
   *   起因是一次实测复现的损坏：`rebuildDerivedLayers()` 汇总 `themes:` 时
   *   **手工重写 frontmatter**，而它那张字段表里**没有 `sections`**
   *   ⇒ 一旦触发重写就把 `sections` / `truncateSections` / `template` 整行抹掉
   *   ⇒ `sectionsOf(空)` 回落默认六节 ⇒ **自定义模板的文档被按默认六节理解**
   *   ⇒ 下次 handoff 只更新一节时，**六个默认空壳节被插到最前面**
   *   （实测 6 → 12 节；生产 `metax-688802` 的镜像里留过一次 6 → 43 节的真现场）。
   *   ⭐ 正文是 `rebuildDerivedLayers()` **唯一逐字保留**的东西（实测 sha256 相同）
   *   ⇒ 把权威放在正文，这**整类**失败模式从结构上消失。
   */
  let docSections: readonly string[] = docSectionsOf(
    existing?.narrative ?? '',
    existing?.frontmatter.sections,
  )
  /** 该文档要截断的**那些**节（决策 206：可多节；空数组 = 不截）。 */
  let docTruncateTitle: string[] = defaultTruncateTitle(
    existing?.frontmatter.sections,
    existing?.frontmatter.truncateSections,
    existing?.narrative,
  )

  if (isNewProjForTpl) {
    const wantTpl = (req.template ?? '').trim()
    if (wantTpl !== '') {
      // ⭐⭐ 决策 208：`default` **也落盘了**，用户可能改过它
      //    ⇒ 必须走 `loadDefaultTemplate()`（磁盘优先、回落内置），
      //      不能用纯函数 `defaultTemplate()` 把用户的改动盖掉。
      const t = wantTpl === 'default' ? await loadDefaultTemplate() : await loadTemplate(wantTpl)
      if (t === undefined) {
        return { ...fail(`模板 \`${wantTpl}\` 不存在。可用：${(await listTemplates()).map((x) => `\`${x.id}\``).join('、')}`), similarProjects: [] }
      }
      const tErrs = validateTemplate(t)
      if (tErrs.length > 0) {
        return { ...fail(`模板 \`${wantTpl}\` 不合法（它坏了，不是你的输入问题）：\n${tErrs.map((e) => `  · ${e}`).join('\n')}`), similarProjects: [] }
      }
      newSections = templateSectionNames(t)
      newTruncateSection = templateTruncateTitle(t)
      templateId = wantTpl === 'default' ? '' : wantTpl
      docSections = newSections
      docTruncateTitle = newTruncateSection
      appliedTemplate = t
    }
  }
  /**
   * ⭐⭐ **本次真正用的那份模板**（回执要据它现报"几节"，**不写死数字**）。
   * ⚠️ 新建且没给 `template` ⇒ 取"当前生效的默认模板"（它**也落盘、用户可能改过**）。
   * ⚠️ 已有项目 ⇒ 保持 `undefined`（那时回执走"已更新"分支，不报骨架）。
   */
  if (isNewProjForTpl && appliedTemplate === undefined) {
    appliedTemplate = await loadDefaultTemplate()
  }
  const newCovers: Cover[] = []
  /** ⭐ 本次**覆盖**掉的知识（决策 104）——回执要单独报，语义与"新增"不同。 */
  const overwritten: Cover[] = []
  /**
   * 待落盘的正文（先构建，校验过了再写）。
   * ⭐ `overwrite: true` ⇒ **覆盖已有的那条**（按原 `ref` 就地写，不产生第二个文件）。
   */
  const pendingWrites: Array<{
    cover: Cover
    slug: string
    body: string
    overwrite: boolean
    /** ⭐ 外部引用（`ext: true`）⇒ **不落正文**（正文在库外）。 */
    skipWrite?: boolean
  }> = []
  const issues: string[] = []
  // 🔴🔴 **归档项目不可写入**（决策 133 / 用户明确要求：
  //     *"模型添加时回执项目已归档，不可选。就项目归档后，不应该有新的知识挂靠归档的项目。"*）
  //
  // ⚠️ 这里**对整个项目一律拒绝**（不只挡"新增知识"，连只改叙事也挡）：
  //    归档的语义是"**项目本身**不再参与工具调用"，若放行 narrative 步，
  //    模型就还能改写一个它已经看不见的项目的文档——那不是"不参与"，是"半个参与"。
  //
  // ⭐ 挂在 `issues` 上 ⇒ 走既有的"**整份未写入 + 报错**"通道（见下方 `issues.length > 0`），
  //    而不是静默跳过——静默跳过会让模型以为写成功了。
  if (existing !== undefined && (existing.frontmatter.archivedAt ?? '') !== '') {
    issues.push(
      `项目 \`${projectId}\` **已归档**，不可选：不能往它下面新增或更新知识，也不能改它的文档。\n` +
        '   如需继续沉淀，请先让用户在「归档」标签页恢复该项目。',
    )
  }
  /**
   * ⭐⭐ **本次申请加入全局（提名）的封面 id**（方案 A，2026-09-18）。
   *
   * 🔴 **为什么需要这个集合**：`entries[].global = true` 的语义是"**申请**加入全局"，
   * 而方案 A 下**封面上的 `global` 只由"人批准"置位**（提名时不置位）。
   * ⇒ 于是"是否申请了全局"就**不能再从 `c.global` 读**（它恒为 false），
   * 必须单独记一份**意图**，供提名登记、三空校验、回执三处使用。
   * ⚠️ 这正是"把意图与状态分开"——旧实现用 `global` 一个字段兼表两件事，
   * 才有"待批时字段撒谎"的问题。
   */
  const nominationIntent = new Set<string>()

  const themeIdSet = new Set([...allThemeIds, ...pendingThemes.map((t) => t.id.trim())])

  /**
   * ⭐⭐⭐ **主题 id → desc**（决策 156：挂靠依据核对要用）。
   *
   * 🔴 为什么要现读：**主题的 desc 存在 `THEME-<id>.md` 的 frontmatter 里，
   *    不在 `snapshot` 上**（`api.ts` 里同一处也注明了这点）。
   * ⚠️ 读失败/不存在 ⇒ 退化成空串 ⇒ 那条的核对会报"引不出 desc"（**宁可多警告**）。
   */
  const themeDescMap = new Map<string, string>()
  for (const id of themeIdSet) {
    if (id === '') continue
    try {
      const fm = await loadThemeFrontmatter(id)
      themeDescMap.set(id, (fm?.desc ?? '').trim())
    } catch {
      themeDescMap.set(id, '')
    }
  }

  /**
   * ⭐ **挂靠依据的警告**（决策 156）——**警告，不阻塞写入**（用户 2026-09-26 裁定）。
   * ⚠️ 与 `issues` 分开：`issues` 会**让整份不写入**，而这里只是"回执里告诉你怎么改"。
   */
  const themeWhyWarnings: string[] = []

  // ── 会话总结出的知识 ⇒ 落库 ──
  //
  // ⭐⭐ **先按 slug 查重**（决策 104）：库内已有同 slug ⇒ 拒绝，除非显式 `overwrite`。
  //    这一步解决**幂等**：重试/补写不会在库里堆出重复知识。
  const wantSlugs = new Set<string>()
  for (const e of entryReqs) {
    const s = (e?.slug ?? '').trim()
    if (s !== '') wantSlugs.add(s)
  }
  for (const a of adoptReqs) {
    const s = (a?.slug ?? '').trim()
    if (s !== '') wantSlugs.add(s)
  }
  const existingBySlug = await findEntriesBySlug(keptCovers, wantSlugs)

  for (let i = 0; i < entryReqs.length; i += 1) {
    const e = entryReqs[i]
    if (e === undefined) continue
    const label = `entries[${i}]`
    const slug = (e.slug ?? '').trim()
    // ⭐ 形状校验走**共享实现**（§3.11.6）——闸门与这里必须是同一套规则。
    issues.push(...checkEntryShape(e, label))
    // ⭐ 这两个仍要取出来给封面用（校验已在上面做过）。
    const title = (e.title ?? '').trim()
    const rawKind = (e.kind ?? '').trim()

    const themes = (e.theme ?? []).map((t) => t.trim()).filter((t) => t !== '')
    for (const t of themes) {
      if (!themeIdSet.has(t)) {
        issues.push(
          `${label} 的 theme 填了不存在的主题 \`${t}\`——` +
            '要新建主题请用 `newThemes` 参数，不要直接填一个新 id。',
        )
      }
    }

    // ⭐⭐⭐ **挂靠依据核对**（决策 156，2026-09-26）——**警告，不拒收**。
    //
    // 🔴 为什么要有：挂靠的唯一目的是**让该主题 desc 描述下的别的项目能直接拿去用**
    //    （省一次搜索 / 少造一个轮子 / 少踩一个坑）。而"只对本项目有用"的知识挂上去
    //    会**污染所有项目看到的主题视图**。
    //    ⚠️ 真实事故（同一形态**已发生过两次**）：三条知识的正文全是"我这次实验的具体
    //    数字 / 报错串 / 函数名"，却因为"**话题**（并发、报错）听起来通用"就挂上了跨项目主题。
    // ⇒ ⭐ 这一步把"**凭感觉判**"换成"**必须引一句该主题 desc 里的话**" ——
    //    引不出来就说明**没真的去比对过那个 desc**。
    // ⚠️ **为什么是警告而不是拒收**（用户 2026-09-26 裁定）：
    //    语义正确性机器判不了（引了 desc 也可能仍挂错），而拒收会让一次完整的
    //    handoff 白跑一轮 ⇒ **回执里说清"缺什么 + 为什么要写"**，由调用方自己改。
    if (themes.length > 0) {
      const why = (e.themeWhy ?? '').trim()
      if (why === '') {
        themeWhyWarnings.push(
          `${label}（\`${slug}\`）挂了主题 ${themes.map((t) => `\`${t}\``).join('、')}，` +
            '但**没给 `themeWhy`**。\n' +
            '    ⇒ 补一句：**引该主题 `desc` 里的话** + 说明这条知识**怎么服务那个场景**。\n' +
            '    ⚠️ 目的：挂靠是给「该主题 desc 描述下的**别的项目**」用的 ——\n' +
            '      若这条**只对本项目成立**（本项目自己的改动/接口/缺陷/实测数据），**应该摘掉主题**。',
        )
      } else {
        // ⭐ 核对：引的那句话是否**真的**出现在某个所挂主题的 desc 里（≥12 字符连续片段）。
        const matched = themes.some((t) => quoteAppearsIn(why, themeDescMap.get(t) ?? ''))
        if (!matched) {
          const descs = themes
            .map((t) => `      · \`${t}\`：${(themeDescMap.get(t) ?? '（该主题没有 desc）').slice(0, 90)}…`)
            .join('\n')
          themeWhyWarnings.push(
            `${label}（\`${slug}\`）的 \`themeWhy\` **没有引用所挂主题 desc 里的原文**。\n` +
              `    你写的：${why.slice(0, 100)}\n` +
              `    所挂主题的 desc：\n${descs}\n` +
              '    ⇒ 请**从上面 desc 里逐字引一段（≥12 字符）**再说明用途；\n' +
              '    ⚠️ 若引不出来，说明你**没真的比对过那个 desc** ⇒ 更该问："这条对那个主题下的**所有项目**都有用吗？"',
          )
        }
      }
    }

    // ⭐⭐ **查重**（决策 104）：库内已有同 slug。
    const hit = slug === '' ? undefined : existingBySlug.get(slug)
    if (hit !== undefined && e.overwrite !== true) {
      // 缺省 ⇒ **拒绝**，并说清怎么覆盖。**不静默覆盖**（知识是长期资产、误覆盖不可恢复）。
      issues.push(
        `${label} 的知识 \`${slug}\` **已存在**（id \`${hit.id.slice(0, 8)}\`，标题「${hit.title}」）。\n` +
          '    若你确实要**替换**它，请在**这一条**上加 `overwrite: true` 再调一次；\n' +
          '    若想另存一条新知识，请改一个不同的 `slug`。',
      )
      continue
    }

    // ⭐ 覆盖时**复用原有的 id 与 ref**（就地更新 ⇒ 不产生第二个文件、不留下孤儿）。
    const id = hit?.id ?? randomUUID()
    // ⭐⭐ **本次这条是不是"只引用不搬动"**（正文在库外，不写库内文件）。
    const isExternal = e.ext === true
    // ⭐ **方案 A**：`entries[].global === true` 表示"**申请**加入全局"，
    //    但**封面上的 `global` 保持 false**——它只由"人批准"置位。
    const wantsGlobal = e.global === true
    if (wantsGlobal) nominationIntent.add(id)
    const cover: Cover = {
      id,
      project: projectId,
      theme: themes,
      global: false,
      kind: isEntryKind(rawKind) ? rawKind : '',
      tags: (e.tags ?? []).map((t) => t.trim()).filter((t) => t !== ''),
      // ⭐ 标题**存在封面上**（决策 98）——不再从正文现算。
      title,
      desc: e.desc ?? '',
      // ⚠️ **路径拼法只允许有一处实现**（`paths.entryRelPath`）——与
      //    `store.writeEntryDoc` 必须用同一个函数，否则封面 ref 会指错文件。
      //    ⭐ 覆盖时用**原有 ref**（它可能因为人手改过文件名而与我们算的不同）。
      //    ⭐⭐ **外部引用（`ext: true`）用调用方给的绝对路径**——那条正文在库外，
      //       绝不能用 `entryRelPath` 算库内路径（否则封面会指向一个不存在的库内文件）。
      ref: isExternal
        ? (e.ref ?? '').trim()
        : (hit?.ref ?? entryRelPath(slug === '' ? 'entry' : slug, id)),
      ext: isExternal,
      // ⭐ 时间（决策 119）：**新建 ⇒ 两者都是现在；覆盖 ⇒ 保留原 createdAt、
      //    刷新 updatedAt**（"创建时间不可变"是这条的硬约束）。
      createdAt: hit !== undefined && (hit.createdAt ?? '') !== '' ? hit.createdAt : nowIso,
      updatedAt: nowIso,
      // ⭐ 归档时间（决策 133）：**覆盖时沿用原有的**（更新一条知识不该顺带解除它的归档；
      //    "两处都写"同 `global`）。新建 ⇒ 空串 = 活跃。
      archivedAt: hit !== undefined ? (hit.archivedAt ?? '') : '',
    }
    // 🔴 **归档条目不可编辑**（决策 133 / 用户明确要求）：
    //    与"三空"同一层——**报进 `issues` ⇒ 整份写入被拒**，而不是静默跳过。
    //    ⚠️ 用"报错拒绝"而不是"悄悄不改它"：后者会让模型以为写成功了。
    if (hit !== undefined && (hit.archivedAt ?? '') !== '') {
      issues.push(`${label} 已归档，不可编辑（请先在「归档」标签页恢复它）`)
    }
    // 三空校验（决策 34）：至少要有一个归属层。
    // ⭐ **方案 A**：**"申请了全局（待批）"也算一种归属**——
    //    否则一条纯全局知识在批准前会是 project 空 + theme 空 + global:false
    //    ⇒ 被判非法、整份写入被拒（批准前根本写不进去）。
    if (cover.project === '' && cover.theme.length === 0 && !wantsGlobal) {
      issues.push(`${label} 三空：project 空 + theme 空 + 未申请全局 ⇒ 无任何归属层`)
    }
    if (hit !== undefined) {
      // ⭐ **覆盖**：就地替换 `keptCovers` 里的那一张，**不进 `newCovers`**
      //    （否则同一个 id 会出现两次 ⇒ 文档里两个封面块）。
      const at = keptCovers.findIndex((c) => c.id === hit.id)
      if (at >= 0) keptCovers[at] = cover
      overwritten.push(cover)
    } else {
      newCovers.push(cover)
    }
    pendingWrites.push({
      cover,
      slug: slug === '' ? 'entry' : slug,
      body: e.body ?? '',
      overwrite: hit !== undefined,
      // ⭐⭐ **外部引用不落正文**：正文在库外，本工具**绝不去写那个文件**
      //    （与 `memj_promote` 的"外部引用不动库外文件"、`edit.ts` 的
      //     "删 entry 时只删内部正文"是同一条边界）。
      skipWrite: isExternal,
    })
  }

  // ── 入库外部文档（adopt）──
  for (let i = 0; i < adoptReqs.length; i += 1) {
    const a = adoptReqs[i]
    if (a === undefined) continue
    const label = `adopt[${i}]`
    const slug = (a.slug ?? '').trim()
    // ⭐ 形状校验走**共享实现**（§3.11.6）。
    issues.push(...checkAdoptShape(a, label))
    // ⭐ 取出来给封面用（校验已在上面的共享实现里做过）。
    //    外部引用也**必须自己给 title**（决策 98）——
    //    以前靠"读正文首个 `#`"现算，那要求每次检索都打开外部文件。
    const titleA = (a.title ?? '').trim()
    const rawKindA = (a.kind ?? '').trim()

    const themes = (a.theme ?? []).map((t) => t.trim()).filter((t) => t !== '')
    for (const t of themes) {
      if (!themeIdSet.has(t)) issues.push(`${label} 的 theme 填了不存在的主题 \`${t}\``)
    }

    // 正文来源：copy ⇒ 工具自己读文件（LLM 不必把全文贴回来）；extract ⇒ 用 body。
    let body = ''
    if (a.mode === 'copy') {
      const text = await readTextIfExists(a.ref)
      if (text === undefined) {
        issues.push(`${label} 要入库的文件读不到：${a.ref}`)
      } else {
        // 封面替换后**原始路径由工具写进正文顶部作溯源**（§3.6.3）。
        body =
          `> 本文原为外部文档：\`${a.ref}\`\n` +
          `> 于 ${new Date().toISOString().slice(0, 10)} 整体拷入库。` +
          '以本副本为准，外部文件后续改动不会再同步。\n\n' +
          text
      }
    } else {
      if ((a.body ?? '').trim() === '') issues.push(`${label} 的 mode 是 extract，但没给 body`)
      body = a.body ?? ''
    }

    // ⭐⭐ **查重**（决策 104）：同 `slug` 与 `entries` 走完全相同的语义。
    const hitA = slug === '' ? undefined : existingBySlug.get(slug)
    if (hitA !== undefined && a.overwrite !== true) {
      issues.push(
        `${label} 的知识 \`${slug}\` **已存在**（id \`${hitA.id.slice(0, 8)}\`，标题「${hitA.title}」）。\n` +
          '    若你确实要**替换**它，请在这一条上加 `overwrite: true` 再调一次；\n' +
          '    若想另存一条，请改一个不同的 `slug`。',
      )
      continue
    }

    const id = hitA?.id ?? randomUUID()
    // ⭐ 与 `entries` 分支同一套语义（方案 A）：意图单记、封面 global 保持 false。
    const wantsGlobalA = a.global === true
    if (wantsGlobalA) nominationIntent.add(id)
    const cover: Cover = {
      id,
      project: projectId,
      theme: themes,
      global: false,
      kind: isEntryKind(rawKindA) ? rawKindA : '',
      tags: (a.tags ?? []).map((t) => t.trim()).filter((t) => t !== ''),
      // ⭐ 标题在封面上（决策 98）。
      title: titleA,
      desc: a.desc ?? '',
      // 入库后封面**一律替换**（ref 改为库内路径、去掉 ext），不并存（§3.6.3）。
      // ⭐ 覆盖时沿用原有 ref（就地更新，不产生第二个文件）。
      ref: hitA?.ref ?? entryRelPath(slug === '' ? 'entry' : slug, id),
      ext: false,
      // ⭐ 时间（决策 119）：与 `entries` 同一套语义。
      createdAt: hitA !== undefined && (hitA.createdAt ?? '') !== '' ? hitA.createdAt : nowIso,
      updatedAt: nowIso,
      // ⭐ 归档时间（决策 133）：同 `entries` 那条——覆盖沿用、新建为空。
      archivedAt: hitA !== undefined ? (hitA.archivedAt ?? '') : '',
    }
    // 🔴 归档条目不可编辑（决策 133）——同 `entries` 那条，报错拒绝。
    if (hitA !== undefined && (hitA.archivedAt ?? '') !== '') {
      issues.push(`${label} 已归档，不可编辑（请先在「归档」标签页恢复它）`)
    }
    if (cover.project === '' && cover.theme.length === 0 && !wantsGlobalA) {
      issues.push(`${label} 三空：project 空 + theme 空 + 未申请全局`)
    }
    if (hitA !== undefined) {
      const atA = keptCovers.findIndex((c) => c.id === hitA.id)
      if (atA >= 0) keptCovers[atA] = cover
      overwritten.push(cover)
    } else {
      newCovers.push(cover)
    }
    pendingWrites.push({
      cover,
      slug: slug === '' ? 'entry' : slug,
      body,
      overwrite: hitA !== undefined,
    })

    // 入库后原外部封面**不再并存**：从保留集合里移除指向同一 ref 的那张。
    if (a.ref !== undefined) {
      for (let k = keptCovers.length - 1; k >= 0; k -= 1) {
        const c = keptCovers[k]
        if (c !== undefined && c.ext && c.ref === a.ref) keptCovers.splice(k, 1)
      }
    }
  }

  // ── 库里 id 唯一性（§3.9.2 第 2 项）──
  const existingIds = new Set(snapshot.covers.map((c) => c.cover.id))
  for (const c of newCovers) {
    if (existingIds.has(c.id)) issues.push(`封面 id 与库里已有条目重复：${c.id}`)
  }

  // ── 🔴 硬校验失败 ⇒ **报错并要求重写**（决策 72：不静默丢弃、不半写）──
  if (issues.length > 0) {
    return {
      ...fail(
        `写入校验未通过，**整份未写入**。请修正后重调：\n` +
          issues.map((s, i) => `${i + 1}. ${s}`).join('\n'),
      ),
      issues,
      similarProjects,
    }
  }

  // ── 校验通过 ⇒ 统一落盘 ──
  for (const w of pendingWrites) {
    // ⭐⭐ **外部引用（`ext: true`）跳过正文落盘**：它的正文在库外，
    //    本工具只登记封面；**绝不去写/改那个库外文件**。
    if (w.skipWrite === true) continue
    if (w.overwrite) {
      // ⭐⭐ **覆盖**（决策 104）：**按原 `ref` 就地写**，而不是按现 slug 重算路径。
      //    🔴 为什么不能用 `writeEntryDoc`：它按 `<slug>-<uuid8>.md` **重算路径**，
      //    若原文件名与我们算的不同（人手改过、或 slug 变了）⇒ **写出第二个文件**，
      //    旧文件成孤儿、封面还指着旧的。`syncEntryFrontmatter` 严格按 `ref` 定位。
      const ok = await syncEntryFrontmatter(w.cover, w.body)
      if (!ok) {
        // 极端情况：库里记着这条知识、但它的正文文件不见了。
        // ⇒ 退回"新建"（否则这次覆盖会**静默什么都没写**，而封面已更新）。
        await writeEntryDoc(w.cover, w.slug, w.body, { sessionId })
      }
    } else {
      await writeEntryDoc(w.cover, w.slug, w.body, { sessionId })
    }
  }

  // 项目 frontmatter：新建时用 projectDesc，更新时保留原 desc。
  const projectDesc =
    req.projectDesc !== undefined && req.projectDesc.trim() !== ''
      ? req.projectDesc.trim()
      : (existing?.frontmatter.desc ?? '')

  // ── 叙事（⭐ 只有 `narrative` 步才更新）──
  //    🔴 **不在 step 里时必须沿用已有叙事**，不能传 `undefined` 给 `narrativeFromDoc`
  //    ——那会退回空模板、**把原叙事清空**（实测过：这是静默数据丢失）。
  //
  //    🔴🔴 **`narrative` 步但没给 `doc`**：同样**保留原叙事**，只在回执里警告。
  //    实测确认（2026-09-19）：`step:'narrative'` 且不传 `doc` 会**静默清空**
  //    已有叙事，而 `ok` 仍是 `true` —— 这正是"指令遵循出错就出错"的典型：
  //    模型只是漏了一个参数，**几周后才发现内容没了**。
  //    ⇒ **默认值必须站在安全那侧**：想清空叙事是极罕见的，
  //      而"只做别的步、顺手把 doc 漏了"极常见。
  const hasDoc = req.doc !== undefined && req.doc.trim() !== ''
  /**
   * ⭐ **按节写也算"本次要动叙事"**（决策 134）。
   *
   * 🔴 **这是我第一版漏掉的**：`narrateNow` 原本只认 `hasDoc`
   *    ⇒ `docSection + docOp:'drop'`（**drop 不需要 `doc`**）会被判成"没给 doc"，
   *    于是**整条按节路径根本进不去**——回执还说"已保留原叙事不动"，
   *    而调用方以为删掉了（实测踩到）。
   * ⚠️ 注意 `drop` 是**唯一不需要 `doc`** 的操作，所以判据不能是 `hasDoc`。
   */
  const wantsSectionOp = (req.docSection ?? '').trim() !== ''
  const narrateNow = want('narrative') && (hasDoc || wantsSectionOp || existing === undefined)

  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐ **按节写**（决策 134）——`docSection` + `docOp`
  //
  // 🔴 与"只给 doc"那条路的区别：**这里只动一节**，其余节**一律不碰**。
  //    ⇒ LLM 只需给出**要变的那部分**（一段），不必逐字重写整节
  //      （实测「当前进度」28,750 字符 ⇒ 长文档 handoff 的关键）。
  // ⚠️ 只对**已有项目**生效：新项目没有旧叙事可"按节改"（那时应走整份 `doc`）。
  // ══════════════════════════════════════════════════════════════════════
  const docSectionName = (req.docSection ?? '').trim()
  const docOp: DocOp = req.docOp ?? 'append'
  /** 本次按节操作的结果（回执要回声）。 */
  let sectionOp: SectionOpResult | undefined
  let sectionOpError = ''
  let sectionEmptyWarn: string[] = []

  if (narrateNow && docSectionName !== '' && existing !== undefined) {
    // 🔴 **必须区分"字段没给"与"给了空内容"**（实测踩到）：
    //    · `req.doc === undefined` ⇒ 调用方**漏了**参数 ⇒ 该拒绝；
    //    · `req.doc === ''` ⇒ **有意清空**该节 ⇒ 合法（描述里就写着"要清空某节：内容留空"）。
    //    ⚠️ 我第一版用 `hasDoc`（`trim() !== ''`）判，于是 `replace` **永远无法清空**——
    //       而"清空"正是 `drop` 之外的另一种压缩结果。
    const docGiven = req.doc !== undefined
    if (docOp !== 'drop' && !docGiven) {
      sectionOpError =
        `\`docOp: '${docOp}'\` 需要 \`doc\`。\n` +
        '⚠️ 要**清空**该节：给 `replace` + `doc: ""`（会留下只有标题的空节，回执会提示）。'
    } else {
      const r = applySectionOp(existing.narrative, docSectionName, docOp, req.doc ?? '')
      if (r.error !== undefined) sectionOpError = r.error
      else sectionOp = r
    }
  } else if (narrateNow && docSectionName !== '' && existing === undefined) {
    sectionOpError =
      '`docSection` 只能用于**已有项目**（新项目没有旧叙事可"按节改"）——' +
      '请直接用 `doc` 给出该项目的各节。'
  }

  // 🔴 **按节操作失败 ⇒ 在落盘之前直接拒绝**（决策 134）。
  //    ⚠️ 为什么必须拒绝而不是"退回整份合并"：那会**静默做错事**——
  //       模型以为只改了一节，实际却把整个 `doc` 当成整节去替换了。
  if (sectionOpError !== '') return fail(`按节写（\`docSection\`）失败，**整份未写入**：\n${sectionOpError}`)

  /** 按节操作成功时以它为准；否则走原来的"整份 doc 合并"。 */
  const narrative = sectionOp?.narrative !== undefined
    ? sectionOp.narrative
    : narrateNow
      ? // 🔴 **合并，不是替换**（决策 109）：`doc` 当成"补丁"——
        //    本次写了的节替换、**没写的节保留旧值**。
        //    ⚠️ 新项目时 `existing === undefined` ⇒ 退回原来的"规范成固定六节"。
        mergeNarrative(narrativeFromDocBare(req.doc), existing?.narrative, docSections)
      : (existing?.narrative ?? narrativeFromDoc(undefined, docSections))

  // ⭐⭐⭐ **决策 209：新建项目时，骨架要连"每节的规范块"一起长出来。**
  //
  // 🔴 **为什么必须在这里补**（而不是靠 `narrativeFromDoc`）：
  //    那个函数只产**节标题骨架**（`## X\n\n## Y`），它**不知道模板的 desc**
  //    （`docSections` 只是节名数组）⇒ 规范块必须由**模板**渲染。
  // ⚠️ **只在"正文里一个规范块都没有"时才补**：
  //    ① 新建 ⇒ 补（这是"建项目 = 复制模板"的落地点）；
  //    ② 更新但文档还没规范块 ⇒ **不补**（决策 207 的裁定：
  //       "已有文档没有规范就绝不替它合成" —— 我们不知道它该有哪几节规范，
  //       硬贴一份六节默认规范到一份结构不同的文档上是**主动误导**）；
  //    ③ 更新且已有规范块 ⇒ 早就保住了（`mergeNarrative` 负责）。
  let withBlocks = narrative
  if (existing === undefined && specBlockRange(narrative.split(/\r?\n/)) === undefined) {
    // ⭐ 决策 208：`default` 也落盘且可被用户编辑 ⇒ 走读盘优先的那一个。
    const tplForSkeleton = templateId === '' ? await loadDefaultTemplate() : await loadTemplate(templateId)
    const tpl = tplForSkeleton ?? (await loadDefaultTemplate())
    // ⚠️ 只在**节名对得上**时才用它的 desc（模板被换过 ⇒ 宁可不写规范，也不贴错）。
    const names = new Set(docSections)
    if (tpl.sections.length > 0 && tpl.sections.every((s) => names.has(s.name))) {
      // 🔴🔴 **不能用 `mergeNarrative`**（我第一版就是这么错的，实测把正文**全吃掉**）：
      //    那个函数的语义是「**第一个参数是补丁、第二个是旧的**」——
      //    写成 `mergeNarrative(骨架, narrative, …)` 等于说"骨架是新的、narrative 是旧的"
      //    ⇒ 骨架里那些节**没有正文**，于是"本次没写正文"⇒ **整节被清空**
      //    （实测：6 节正文全没了，只剩规范块）。
      //    ⭐ 判据：**"把 A 插进 B" 与 "用 A 合并 B" 是两件事，别借同一个函数**。
      withBlocks = insertSpecBlocks(narrative, tpl)
    }
  }

  // ⭐ `drop` 之后**必须检查有没有产生空壳节**（决策 134 §3.1 / 用户裁定：
  //    "允许删到只剩标题，但回执必须报警"）——工具分不清"故意删空"与"误删"。
  if (sectionOp?.narrative !== undefined && docOp === 'drop') {
    sectionEmptyWarn = findEmptySections(sectionOp.narrative)
  }
  /** ⭐ 本次是否**因为缺 `doc` 而保留了原叙事**（回执要报出来）。
   *  ⚠️ 按节写（`docSection`）不该走这条（它本来就只动一节，不需要整份 `doc`）。 */
  const narrativePreserved = want('narrative') && !hasDoc && !wantsSectionOp && existing !== undefined

  // ⚠️ **按节写时，这两个"整份合并"的统计必须跳过**（决策 134）：
  //    它们按 `req.doc` 里的 `##` 节名与旧文档比对，而**按节写时 `doc` 里没有节标题**
  //    ⇒ 硬算会得出"本次未写的 6 个节全部沿用旧内容"这类**看似合理、实则无意义**的回声
  //    （那一节明明被改了）。按节路径的回声改由下面的 `sectionOp` 提供。
  const usedSectionOp = sectionOp?.narrative !== undefined
  /** ⭐ **本次合并里，哪些节沿用了旧内容**（决策 109 的回执要报出来）。 */
  const inheritedSections = !usedSectionOp && narrateNow && existing !== undefined
    ? inheritedIn(req.doc, existing.narrative)
    : []
  /** ⭐⭐ **本次合并里，哪些节被替换、字数增减多少**——用于"整节被砍掉"当场可见。 */
  const replacedSections = !usedSectionOp && narrateNow && existing !== undefined
    ? replacedIn(req.doc, existing.narrative)
    : []
  const allCoversBase = [...keptCovers, ...newCovers]
  // 🔴 **孤儿块必须原样写回**（§8.7④ / §12-79）：它们解析失败但**原文还在**，
  //    本函数只渲染能解析成功的 `keptCovers` + `newCovers`；不带 `orphans` 就是**静默删除**。
  const keptOrphans = existing?.orphans ?? []
  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐ **8. 历史归档：超过阈值就自动截断**（决策 136）
  //
  // 🔴🔴 **必须在落盘之前做**：截断会改变要写进盘的叙事 ⇒ 先算好再写，
  //    否则要写两次盘（而两次写之间有失败窗口）。
  //
  // ⭐⭐ **它替代了"压缩"**：压缩要**模型自己动手**（本项目实测"连报 7 次、一次没压"），
  //    而截断是**工具自己做的事** ⇒ ⭐ **那个失败模式从此不存在**。
  //
  // ⚠️ **只在 `narrative` 步做**（没动叙事就不该截）。
  // ⚠️ **任何失败都不影响 handoff**：best-effort，问题只进回执。
  // ══════════════════════════════════════════════════════════════════════
  let finalNarrative = withBlocks
  const historyLines: string[] = []
  /** ⭐ 本次是否**真的归档了历史**（截断发生了）——孤本判据检测据此**跳过本轮**。 */
  let historyArchived = false
  /**
   * ⭐⭐ **本次新建的 history 封面**——必须**并进 `allCovers`** 才能写进项目文档！
   *
   * 🔴🔴 **这是我实测踩到的一个真 bug**：条目正文落盘了、但封面没进文档，
   *    于是 `scanLibrary` 查不到它 ⇒ **指针指向一个"查不到"的条目**
   *    （而指针存在的全部意义就是"能读回"）。
   *    ⚠️ 判据：**写了条目正文 ≠ 建了封面** —— 封面只由 `allCovers` 渲染进文档。
   */
  const historyCovers: Cover[] = []
  try {
    const trunc = await runHistoryArchive({
      projectId,
      // 🔴🔴 **决策 209 修**：这里原先传的是 `narrative` —— 而新建项目时
      //    `withBlocks`（含规范块）是在它**之后**才算出来的 ⇒ 截断拿旧文本跑，
      //    再把结果赋回 `finalNarrative` ⇒ **规范块被整个丢掉**（实测：文档里没有规范块、
      //    `truncateSections` 也落空）。⭐ 判据：**"后面还会加工这份文本"时，
      //    下游必须拿加工后的那一份**，否则前面的加工白做。
      narrative: withBlocks,
      existingNarrative: existing?.narrative,
      config: env.config,
      narrateNow,
      sessionId,
      // ⭐ 决策 204：该文档自己的截断目标（默认六节 == 「当前进度」；空串 = 不截）。
      truncateTitle: docTruncateTitle,
    })
    finalNarrative = trunc.narrative
    historyArchived = trunc.archived
    historyLines.push(...trunc.lines)
    historyCovers.push(...trunc.covers)
  } catch (err) {
    historyLines.push(
      `\n📦 **历史归档未能完成**（不影响本次 handoff）：` +
        `${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // ⭐⭐ **history 封面必须并进来**（否则条目查不到、指针失效）——
  //    见 `historyCovers` 的注释（那是实测踩到的真 bug）。
  const allCovers = [...allCoversBase, ...historyCovers]

  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐⭐ **本档写作规范节**（2026-10-12，模板与提示词解耦）
  //
  // 🔴🔴 **它的权威在文档正文里**（不在模板、不在 frontmatter）：
  //    · **已有文档** ⇒ **原样保住它**（`extractSpecSection`）——
  //      用户裁定"后续更新项目文档的时候就在项目自己的文档里去更新"
  //      ⇒ ⚠️ **不按模板重建**（否则用户在本文档里改过的规范会被模板覆盖回去，
  //        而模板与文档是**解耦**的：改模板不该影响已有文档）。
  //    · **新建文档** ⇒ 从它建时用的模板**复制一份进来**（`renderSpecSection`）
  //      —— 这就是"建项目 = 复制模板"落地的地方。
  //
  // 🔴🔴 **已有文档若【没有】规范节，绝不替它合成一份**（我第一版就是这么错的）：
  //    它的 `template:` 很可能**从来没记过**（生产实测：全库 0 份文档有该字段——
  //    早期项目是手工照模板写的）⇒ 那时只能回落 `defaultTemplate()`，
  //    于是会给一份**六节默认规范**贴到一份**结构完全不同的文档**上
  //    （实例：`metax-688802` 的节是「研究目标 / 公司画像 / …」）
  //    ⇒ 那是**主动误导**，比没有规范更糟。
  //    ⭐ 判据：**合成规范的前提是"我知道这份文档该有哪几节"**；不知道就**什么都不写**。
  //
  // 🔴 **必须砍掉旧的再拼**：`finalNarrative` 可能带着模型回传的旧规范
  //    （`narrativeFromDocBare` 已砍一次，但按节路径 `applySectionOp` 与
  //     `existing.narrative` 那条路都可能把它带过来）⇒ 这里统一"先砍后拼"。
  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐⭐ **决策 209：规范块已经"随各节一起"被保住了** —— 这一段不再拼末尾那节。
  //
  // 🔴 **为什么可以删掉这一整段**：决策 207 时规范住在**末尾独立一节**里，
  //    而 `mergeNarrative()` 按该文档的节名重建叙事（规范节不是叙事节）
  //    ⇒ 必须在外面**另取再拼回**。
  //    现在规范**长在各节自己身上**（标题下的 `memj:spec` 围栏）
  //    ⇒ `mergeNarrative` / `normalizeNarrative` / `applySectionOp` 三处
  //      **各自负责回填它自己那一节的规范块**（见那三个函数的实现）
  //    ⇒ 这里**不需要**再做一次，否则就是**同一件事的第二份实现**。
  //
  // ⚠️ **但存量文档里那个末尾节还在**（决策 207 建的）⇒ 仍然要**原样保住它**，
  //    否则那些文档的规范会**静默消失**。判据：工具维护的内容，
  //    只有"我还知道它在哪"时才敢重建；不知道就**原样端过去**。
  // ══════════════════════════════════════════════════════════════════════
  const legacySpec = extractSpecSection(existing?.narrative ?? finalNarrative)
  const narrativeBody = cutSpecSection(finalNarrative)
  const finalWithSpec = legacySpec === '' ? narrativeBody : `${narrativeBody.trimEnd()}\n\n${legacySpec}\n`

  // ⭐⭐⭐ **frontmatter 的 `sections` / `truncateSections` 改成"正文的镜像"**（2026-10-12）。
  //
  // 🔴🔴 **为什么必须镜像而不是"沿用旧的"**：
  //   权威已经是**正文**（`docSectionsOf`）⇒ 若 frontmatter 继续留着**旧值**，
  //   两者就会漂开，而 `sections` 仍是**索引/兼容读**的来源之一
  //   ⇒ 出现"程序按正文工作、但某个读 frontmatter 的地方按旧值工作"这种
  //   **半新半旧**状态（本项目判据：同一事实两份值 ⇒ 必然漂开）。
  //   ⭐ 每次落盘顺手把正文的事实**写回**frontmatter ⇒ 两者**结构上不可能不一致**。
  //
  // ⚠️ **顺序很重要**：必须在 `finalWithSpec` 算完之后取（规范节已被排除，
  //   `sectionsFromNarrative` 不会把「本档写作规范」算成一个叙事节）。
  const mirrorSections = sectionsFromNarrative(narrativeBody)
  // ⭐⭐ 决策 209：截断声明**从各节自己的规范块反解**（`truncateTitlesFromBlocks`）；
  //    存量文档的末尾规范节由 `defaultTruncateTitle` 那条兼容分支兜住。
  const mirrorTruncate = truncateTitlesFromBlocks(narrativeBody)
  /** 正文里**有没有规范块**（决定 `truncateSections` 用镜像值还是沿用旧值）。 */
  const hasSpecBlock = specBlockRange(narrativeBody.split(/\r?\n/)) !== undefined || legacySpec !== ''

  await writeProjectDoc(
    projectId,
    {
      project: projectId,
      // ⭐ **显示名必须沿用已有的**（决策 115）：handoff 不管改名，
      //    若这里不带上，每次 handoff 都会把用户设的项目名**静默清掉**。
      title: existing?.frontmatter.title ?? '',
      desc: projectDesc,
      themes: existing?.frontmatter.themes ?? [],
      // ⭐ 时间（决策 119）：**新建 ⇒ 现在；更新 ⇒ 保留 createdAt、刷新 updatedAt**。
      createdAt: existing !== undefined && (existing.frontmatter.createdAt ?? '') !== ''
        ? existing.frontmatter.createdAt
        : nowIso,
      updatedAt: nowIso,
      // ⭐⭐ 归档时间（决策 133）：**必须沿用已有的**——和上面 `title`/`themes` 同一类陷阱。
      //    🔴 漏了它的后果特别重：**每次 handoff 都会把归档过的项目静默解除归档**，
      //       表现为"我明明归档了，怎么又出现在项目列表里"。
      //    （正常路径下归档项目会在更早处被拒，这里是**纵深防御**：
      //      万一哪条路径绕过了那道闸门，也绝不静默改掉人的设置。）
      archivedAt: existing?.frontmatter.archivedAt ?? '',
      // ⭐⭐ 节名清单：**正文的镜像**（见上面 `mirrorSections` 的说明）。
      //
      // 🔴🔴 **老文档保持"空就不写"**（`test-template.mjs` 的【6】盯着这条，它抓到了一个真陷阱）：
      //    `store.ts` 的渲染规则是"**空就不写这一行**"⇒ 语义上"没有这一行" == "空数组"
      //    == "回落默认六节 + 「当前进度」可截断"。
      //    ⚠️ 但**一旦给它写上非空值，判据就翻转**：
      //      `defaultTruncateTitle()` 的第二步是"`sections` 非空 ⇒ 以 `truncateSections` 为准"
      //      ⇒ 老文档若只被写进 `sections`、而 `truncateSections` 仍为空
      //      ⇒ **它从此再也不自动截断**（`a113fcb` 那个真事故的同族）。
      //    ⇒ ⭐ 判据：**只把"已经有值"的文档镜像化**；老文档（原来就是空）**保持空**
      //      —— 反正它与正文**本来就一致**（空 = 回落 = 正文那六节）。
      sections: mirrorSections.length > 0 && (existing?.frontmatter.sections ?? []).length > 0
        ? mirrorSections
        : (existing !== undefined ? existing.frontmatter.sections : newSections),
      // ⭐ 建文档用的模板 id（决策 204）：同样**必须沿用已有的**（纯记录，但别擦）。
      template: existing !== undefined ? (existing.frontmatter.template ?? '') : templateId,
      // ⭐⭐ 自动截断目标节：**正文规范块的镜像**（决策 209）。
      //    ⚠️ 与 `sections` 同一纪律：老文档（两个字段都空）**保持空**，
      //       否则会把它推进"以 `truncateSections` 为准"的分支 ⇒ 静默不截。
      //    ⭐ 判据：**"正文里有规范块"与"正文里一个块都没有"要分开** ——
      //       前者才用镜像值（哪怕是空数组：那是"真的不截"）；
      //       后者（老文档 / 还没迁移）**沿用旧值**。
      truncateSections: hasSpecBlock || (existing?.frontmatter.truncateSections ?? []).length > 0
        ? (hasSpecBlock ? mirrorTruncate : newTruncateSection)
        : (existing?.frontmatter.truncateSections ?? []),
    },
    finalWithSpec,
    allCovers,
    keptOrphans,
  )

  // ── 建主题文档（此时 desc 才写进去；已存在的主题不重写 desc）──
  const createdThemes: string[] = []
  for (const t of pendingThemes) {
    const id = t.id.trim()
    const prior = await loadThemeFrontmatter(id)
    const covers = allCovers.filter((c) => c.theme.includes(id))
    const projects = covers
      .map((c) => c.project)
      .filter((p) => p !== '')
      .filter((p, i, arr) => arr.indexOf(p) === i)
      .map((p) => ({ id: p, desc: p === projectId ? projectDesc : '' }))
    await writeThemeDoc(id, prior === undefined ? t.desc : '', covers, projects)
    if (prior === undefined) createdThemes.push(id)
  }

  // ══════════════════════════════════════════════════════════════════
  // ── 读快照：⭐ **只在 `theme` 步处理**（决策 102）──
  //
  // 🔴 **为什么必须这样**：原先每次 handoff 都**无条件**消费本会话全部未消费快照
  //    ——即便这次根本没建主题 ⇒ **证据被白白吃掉**（那本身就是个 bug）。
  //    ⇒ 改为只在 `theme` 步消费。这样单步调 `knowledge` **不消费**，
  //    证据留到后面的 `theme` 步，**拆分才成立**。
  //
  // ⚠️ 这一步同时负责两件事：① 把**被 LLM 列出**的别项目快照补挂到新主题
  //    （§3.7.5 步骤 2 + 决策 111）；② 标记已消费。
  // ⚠️ `all` 模式含 `theme` 步 ⇒ 除"只挂列出的"之外，行为与拆分前一致。
  // ══════════════════════════════════════════════════════════════════
  let snapshotCount = 0
  /** ⭐ **本次实际补挂的快照**（决策 111：回执要回声，让"漏列"当场可见）。 */
  const linkedApplied: string[] = []
  if (want('theme')) {
    const snapshotsBefore = await pendingSnapshots(sessionId)
    // 🔴 **只挂 LLM 显式列出的那些**（决策 111）——不再无条件全挂。
    //    ⚠️ 仍要求 `project ≠ 本次`：本项目的条目本来就在自己文档里，无需"补挂"。
    const byId = new Map(snapshotsBefore.map((s) => [s.entryId, s]))
    const toLink: string[] = []
    for (const id of linkedIds) {
      const s = byId.get(id)
      if (s !== undefined && s.project !== projectId && s.project !== '') toLink.push(id)
    }
    for (const theme of pendingThemes) {
      const themeId = theme.id.trim()
      for (const coverId of toLink) {
        await linkCoverToTheme(coverId, themeId, snapshot)
        if (!linkedApplied.includes(coverId)) linkedApplied.push(coverId)
      }
    }
    // ── 6. 标记读快照为已消费（并判清理）──
    snapshotCount = snapshotsBefore.length
    await consumeSnapshots(sessionId, env.config.readLogMaxEntries, env.config.readLogTrimCount)
  }

  // ── 全局提名（**只登记，不落位**，决策 70 / §7.3 / 方案 A）──
  for (const c of newCovers) {
    // ⭐ **方案 A**：判据是**提名意图**，不再是封面上的 `global`
    //    （后者提名时恒为 false，只由人批准置位）。
    if (!nominationIntent.has(c.id)) continue
    // ⭐ **标题必须填**（§8.7③）：待批列表要让人**有依据地**决定通过与否。
    //    早先这里写死 `title: ''`，于是审批页只能显示"(无描述)"，看不出是哪条。
    //    ⭐ 现在**直接用封面上的 `title`**（决策 98）——不再从正文里抠。
    await addNomination({
      entryId: c.id,
      title: c.title,
      desc: c.desc,
      project: c.project,
      nominatedAt: new Date().toISOString(),
    })
    // 🔴 安全底线：**不自动批准**。封面 `global` 保持 `false`，
    //    真正生效要等人在 /memj-review 里批准（那时 `approveNomination` 才置位）。
  }

  // ── 7. 重建派生层 ──
  await rebuildDerivedLayers()

  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐ **9. 版本维护**（决策 135）—— 正文镜像 + git 提交
  //
  // 🔴 **历史归档（截断）已在上面的第 8 步做完**（它必须在落盘之前）。
  //    本步只管"落盘之后"的事：镜像与提交。
  //
  // 🔴🔴 **绝不让它影响 handoff**：全程 best-effort，失败只进回执。
  // ══════════════════════════════════════════════════════════════════════
  const backupLines: string[] = []
  // ⭐ **历史归档的回执行先放进来**（它属"叙事层"，与下面的"文件层"是两条通道）。
  backupLines.push(...historyLines)
  try {
    const bk = await runVersionSteps({
      projectId,
      at: nowIso,
      existingNarrative: existing?.narrative,
      finalNarrative,
      config: env.config,
    })
    backupLines.push(...bk.lines)
  } catch (err) {
    // ⚠️ 连"版本维护模块自己崩了"也不能影响主流程。
    backupLines.push(
      `\n💾 **版本维护未能完成**（不影响本次 handoff）：` +
        `${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // ── 回执：**必须区分"更新/新建"**（决策 48）──
  const lines: string[] = []
  if (isNewProject) {
    // 🔴 **不要写死"七节/六节"**（2026-10-05 修）：节名与节数由**该项目的模板**决定，
      //    默认模板是六节、自定义模板完全不同 ⇒ 写死等于**给模型一个假事实**
      //    （本项目真实事故：模型照写死的清单去猜节名，把文档结构写坏）。
      //    ⭐ 判据：**回执里凡"节数/节名"一律现取自本次真正用的那份模板**。
    const tplLabel = appliedTemplate === undefined
      ? ''
      : `，模板 \`${appliedTemplate.id === '' ? 'default' : appliedTemplate.id}\` 共 ${appliedTemplate.sections.length} 节：` +
        appliedTemplate.sections.map((s) => `\`${s.name}\``).join(' / ')
    lines.push(
      `⭐ **已新建项目 \`${projectId}\`**（骨架已按模板建立${tplLabel}）。`,
      // ⭐⭐ **决策 209：这两句原先写在文档正文里，现在改由回执报** ——
      //    · "沉淀知识由工具生成" ⇒ 它是给模型看的纪律，而模型每轮都看得到协议；
      //    · "没有可截断节 ⇒ 文档不会瘦身" ⇒ 那是**模板级**的事实，不是这份文档的正文。
      //    ⚠️ 判据：**能由回执说清的事，不要塞进文档正文**（正文是给人读的项目记录）。
      `🔴 **末节 \`## 沉淀知识\` 由工具维护**（放封面）—— 它不是叙事节，不要写它。`,
      ...(appliedTemplate !== undefined && appliedTemplate.sections.every((s) => (s as { truncate?: boolean }).truncate !== true)
        ? [promptText('tpl:guidance-no-trunc', TPL_GUIDANCE_NO_TRUNC)]
        : []),
      `库里现有项目：${[...existingProjects, projectId].map((p) => `\`${p}\``).join('、')}`,
    )
  } else {
    lines.push(`已更新项目 \`${projectId}\`（本项目现共 ${allCovers.length} 张封面）。`)
  }

  // ⭐⭐ **每次 handoff 都报「各节清单 + 字符数」**（决策 134 的 D + 决策 127 的触发条件）。
  //
  // 🔴 **为什么必须"每次报"**：压缩规范一直写在 `context()` 里，但**没有触发条件**——
  //    实测连续几轮交接都没压，「当前进度」涨到 24,983 字符仍在涨。
  //    ⇒ 把体量变成**每次看得见的事实**，比再写一条规范有效（"记在文档里不构成防线"）。
  //
  // 🔴🔴 **为什么报的是"全部叙事节"而不只是「当前进度」**（2026-09-21 补）：
  //    实测发现——**只报一节时，模型要压缩还得自己数其余节的大小**
  //    （本项目真实发生过：我为了量「有效做法/失败踩坑」各多大，**自己跑 node 脚本去数文件**）。
  //    ⇒ ⭐ 那就等于"**触发条件报了一个数，却把判断所需的其余数留给调用方自己找**"——
  //      判据不完整。**一次把全部叙事节都报出来，压缩该动哪一节就是现成的**。
  //    ⚠️ 是"该文档自己的节"，**不是写死的六节**（自定义模板的文档节名完全不同）。
  //
  // ⚠️ **只报数字，不提「批次」等内部形态**——规范**不规定**「当前进度」怎么划分
  //    （可以按批次、按阶段、按主题、或一张表里的几行）。
  //
  // ⚠️ 阈值取自配置（用户可在网页设置里调）——**它不进提示词**：
  //    `context()` 是常量文本（"绝不含运行时数字"），数字只能由这里现报。
  //
  // ⚠️ 算的是**刚落盘/当前生效**的那份叙事（本次没写叙事时就是库里现有的那份），
  //    因为"该不该截断"看的正是文档现在的体量。
  //    🔴 **必须用 `finalNarrative`**（截断**之后**的那份）——否则报的是截断前的大小，
  //       而回执必须反映**盘上真实的状态**（决策 103：回执是模型判断"刚发生了什么"的第一手材料）。
  {
    const secs = splitH2(finalNarrative)
    const sizes = new Map<string, number>()
    for (const s of secs) {
      // ⚠️ 同名节取**合并后**的总量（`mergeNarrative` 允许同名节合并）。
      const n = s.lines.join('\n').trim().length
      sizes.set(s.title, (sizes.get(s.title) ?? 0) + n)
    }

    // ⭐⭐⭐ **节名清单回声 + 结构一致性检出**（2026-10-12 新增，真实事故修）。
    //
    // 🔴🔴 **为什么必须有**（真实事故）：
    //    模型在一个**用了自定义模板**（6 个自定义节）的项目里，传了
    //    `docSection:"目标"` ⇒ 子串匹配命中了 `## 研究目标` ⇒ 整节被替换成
    //    默认六节骨架。**根因是模型不知道这个项目的节名**——而工具描述当时
    //    硬编码了"项目文档共七节"，模型只能凭印象猜。
    //    ⭐ 光改描述不够：**每一轮都把"本项目真实的节名清单"摆在回执最前面**，
    //    模型下一次就不用猜。
    // 🔴 **一致性检出**（2026-10-12 改基准）：
    //    ⭐ **权威已经是正文**（`docSectionsOf`）⇒ "清单 vs 现状"这种比较**已无意义**
    //      （两者同源，必然相等）。
    //    ⇒ 改为与**模板契约**比：`template:` 记着"这份文档本来该有哪几节"
    //      —— 它是**独立于文档现状**的一手证据，才能检出"文档被写坏了"。
    //    ⚠️ 模板可能已被删/改名 ⇒ 那时**不猜**（只回声现状，不报异常）。
    if (existing !== undefined || newSections.length > 0) {
      const actualTop = sectionsFromNarrative(finalNarrative)
      const tplIdNow = (existing?.frontmatter.template ?? templateId ?? '').trim()
      /** 模板契约里的节名（拿不到 ⇒ `undefined` = 无基准、不报异常）。 */
      let contract: readonly string[] | undefined
      if (tplIdNow !== '') {
        const t = await loadTemplate(tplIdNow)
        if (t !== undefined) contract = templateSectionNames(t)
      } else {
        contract = NARRATIVE_TITLES
      }
      const tplLabel = tplIdNow !== '' ? `（模板 \`${tplIdNow}\`）` : '（默认模板）'
      lines.push(
        `📐 **本项目节名${tplLabel}**：${actualTop.join(' / ')}` +
          (actualTop.length > 0 ? '' : '（空）'),
      )
      if (contract !== undefined) {
        const missing = contract.filter((t) => !actualTop.includes(t))
        // 🔴🔴 **只报「与默认六节同名」的多余节**（2026-10-12 收窄，防误报）。
        //
        // ⭐ 为什么必须收窄：**"文档里有额外自定义节"在这个库里是既成事实、不是异常**
        //    （实例：`dsh-memj` 项目自己的文档就有一个 `第十二批…` 自定义节，
        //     而 `第十二批` 是它自己有意加的）。
        // ⇒ 若把所有多余节都报成"不一致"，会**天天误报**，真问题就被淹掉了。
        // 🔴 **真正的误写特征**：多出的节名**恰好在默认六节里**
        //    且**不在本项目的模板清单里** —— 那说明"别套模板的节名"被写了进来
        //    （`metax-688802` 那次 6 节 → 43 节的真事故，前六个正是默认六节）。
        const defaultSet = new Set(NARRATIVE_TITLES)
        const suspicious = actualTop.filter(
          (t) => !contract.includes(t) && defaultSet.has(t),
        )
        if (suspicious.length > 0 || missing.length > 0) {
          lines.push(
            `\n⚠️ **文档结构异常**（模板契约 = 该文档本来该有的节，现状 = 盘上真实结构）：` +
              (suspicious.length > 0
                ? `\n    🔴 多出了**模板里没有的默认节**：${suspicious.map((t) => `\`${t}\``).join('、')}` +
                  '\n       这多半是**误写**——把别套模板的默认节名写进了本项目的文档。'
                : '') +
              (missing.length > 0
                ? `\n    模板里有、文档里没有：${missing.map((t) => `\`${t}\``).join('、')}`
                : '') +
              '\n    🔴 清理：对每个多出的节用 `docSection` + `docOp: \'drop\'` 逐个删。',
          )
        }
      }
    }

    // ⭐⭐ 体量行按**该文档自己的节名**展示（决策 204）。
    //    🔴 原来是写死的默认六节 ⇒ 自定义模板的文档会**报错节名 / 漏报自定义节**
    //       （那正是"回执在撒谎"的一类）。现在：本研究文档记着的节名在前，
    //       文档里实际出现的其它节（如 LLM 自己加的自定义节）附后。
    const order = docSections
    // ⭐ 截断目标也按**该文档自己的**（默认六节时就是「当前进度」）。
    //    ⭐⭐ 决策 206：**可多节** ⇒ 合计它们的字符数做阈值判断，
    //       并在"已超阈值"那句里**逐个列出**（否则用户看不出是哪一节超了）。
    const truncTitles = docTruncateTitle
    const truncSet = new Set(truncTitles)
    const progressChars = truncTitles.reduce((a, t) => a + (sizes.get(t) ?? 0), 0)
    const total = [...sizes.values()].reduce((a, b) => a + b, 0)
    if (progressChars > 0 || sizes.size > 0) {
      const warn = env.config.progressCharsWarn
      const over = progressChars > warn
      const shown = [
        ...order.filter((t) => sizes.has(t)),
        ...[...sizes.keys()].filter((t) => !order.includes(t)),
      ]
      const detail = shown
        .map((t) => (truncSet.has(t) ? `**${t} ${sizes.get(t)}**` : `${t} ${sizes.get(t)}`))
        .join(' ｜ ')
      // ⚠️ 多节时写出每节各多少（单节时就是那一节的数），措辞按节数分叉。
      const perSec = truncTitles
        .filter((t) => (sizes.get(t) ?? 0) > 0)
        .map((t) => `${t} ${sizes.get(t)}`)
        .join('、')
      lines.push(
        `📋 **叙事共 ${total} 字符**，${shown.length} 节：\n    ${detail}` +
          (progressChars > 0
            ? `\n📏 **可截断节合计 ${progressChars} 字符**（${perSec}；阈值 ${warn}）。` +
              (over
                ? '\n    ⚠️ **已超过阈值**——请把已完结的历史归并（判据见 `context()` 的压缩规范）。'
                : '')
            : ''),
      )
    }
  }
  if (newCovers.length > 0 || overwritten.length > 0) {
    // ⭐⭐ **回声：逐条列出落盘了哪些知识**（§3.11.4 / 决策 103）。
    //    🔴 为什么必须列标题而不只给数量：模型说"我记了 6 条"、而实际只传进来 4 条
    //    （**本会话真实发生过**），只报数字是**看不出来**的；
    //    逐条列出，模型扫一眼就能发现"第 5 条呢"。
    if (newCovers.length > 0) {
      // ⭐⭐ **回执必须按 `ext` 分叉措辞**（见下方注释）。
      //    🔴 原来无论内外一律写"正文已落库到 entries/"——**对外部引用是假的**：
      //    外链条目走 `skipWrite`，**根本不落正文**（正文一直在库外那个文件里）。
      //    回执是模型判断"库里刚发生了什么"的第一手材料，说错会让它以为
      //    库里多了一份正文副本、进而做出错误推断（如"正文已入库，可以改它"）。
      const extCount = newCovers.filter((c) => c.ext).length
      const innerCount = newCovers.length - extCount
      const parts: string[] = []
      if (innerCount > 0) parts.push(`${innerCount} 条正文已落库到 entries/`)
      if (extCount > 0) parts.push(`${extCount} 条**外部引用（正文留在库外，未落库）**`)
      lines.push(`新增 ${newCovers.length} 条知识（${parts.join('；')}）：`)
      for (const c of newCovers) {
        const tags = c.theme.length > 0 ? `｜主题 ${c.theme.join('、')}` : ''
        const g = nominationIntent.has(c.id) ? '｜**global 提名（待批）**' : ''
        // ⭐ 外链逐条标注路径，并**明说工具没有动它**——与 `memj_promote` /
        //    `memj_update` 对库外文件的那条边界一致。
        const extNote = c.ext ? `｜⭐ **外部引用**：\`${c.ref}\`（**只登记封面，未改动该文件**）` : ''
        lines.push(`  · **${c.title}**（\`${c.id.slice(0, 8)}\`）${tags}${g}${extNote}`)
      }
    }
    // ⭐ **覆盖要单独报**（决策 104）：它与"新增"语义不同，混在一起会让人
    //    以为又写了一条新的——而实际上旧内容**已经被替换掉了**。
    if (overwritten.length > 0) {
      lines.push(
        `⭐ **覆盖了 ${overwritten.length} 条已有知识**（\`overwrite: true\`，就地更新、未新增文件）：`,
      )
      for (const c of overwritten) {
        lines.push(`  · **${c.title}**（\`${c.id.slice(0, 8)}\`）`)
      }
    }
  }
  // ⭐ **回执必须标明模式**（决策 95/96）：它是模型判断"库里刚发生了什么"的第一手材料。
  //    不写它，模型下次会误以为"一定通过过某道校验"、从而错误推断库里已有跨项目证据。
  for (const t of createdThemes) {
    lines.push(
      `⭐ **已新建主题 \`${t}\`**` +
        (looseThemes
          ? '（**宽松模式**：未做跨项目证据校验，依据你的语义判断建成）。'
          : '（严格模式：已通过跨项目证据校验）。'),
    )
  }
  const nominated = newCovers.filter((c) => nominationIntent.has(c.id)).length
  if (nominated > 0) {
    lines.push(
      `已登记 ${nominated} 条 **global 提名**（封面 \`global\` 保持 \`false\`）——` +
        '⚠️ 只是提名，**需要人在 /memj-review 批准**（批准时才置位）后才进 GLOBAL。',
    )
  }

  // ⭐⭐ **矛盾检测**（§3.11.4 / 决策 103）：把"看起来做完、其实半套"的状态点出来。
  //    🔴 为什么必须做：这些都是**可数的确定性事实**（§3.9 的既有哲学），
  //    但**光看"成功"二字发现不了**。⚠️ **只警告、不报错**——
  //    "建了主题暂时没挂知识"有时是合理的中间状态，硬失败会把合法流程堵死。
  if (createdThemes.length > 0 && pendingThemes.length > 0) {
    const dangling = createdThemes.filter(
      (t) => !newCovers.some((c) => c.theme.includes(t)) && !allCovers.some((c) => c.theme.includes(t)),
    )
    if (dangling.length > 0) {
      lines.push(
        `⚠️ **矛盾**：你新建了主题 ${dangling.map((t) => `\`${t}\``).join('、')}，` +
          '但**没有任何知识挂到它**（本次与库里都是）。\n' +
          '    主题的意义是聚合知识；若只是顺手建的，可以考虑并入已有主题或补上挂靠。',
      )
    }
  }
  if (snapshotCount > 0) {
    lines.push(`本次依据了 ${snapshotCount} 条读快照作为跨项目证据（已标记为已消费）。`)
  }
  // ⭐⭐ **补挂回声**（决策 111）：说清"本次到底补挂了哪几条"。
  //    🔴 为什么必须有：`linkedSnapshots` 省略 = 一条都不挂（fail-closed），
  //    而"忘了列"与"判断后认为都无关"在**结果上完全一样**——不回声就无法区分，
  //    模型会在"以为挂上了"的状态下继续。⇒ 把实际动作摆出来。
  if (want('theme')) {
    if (linkedApplied.length > 0) {
      lines.push(
        `🔗 **快照补挂**：按你的 \`linkedSnapshots\` 补挂了 ${linkedApplied.length} 条：` +
          linkedApplied.map((id) => `\`${id.slice(0, 8)}\``).join('、') +
          '。⚠️ 核对一下：**该挂的都列了吗**？',
      )
    } else if (linkedIds.size === 0) {
      lines.push(
        '🔗 **快照补挂**：本次**未补挂任何快照**（没给 `linkedSnapshots`，省略 = 不挂）。\n' +
          '    ⚠️ 若本次**确实读过**别项目知识、且它与本次主题相关，' +
          '请带上 `linkedSnapshots: [entryId]` 重调（用 `memj_snapshots` 取 id）。',
      )
    }
  }
  // ⭐⭐⭐ **挂靠依据的警告**（决策 156）——用户 2026-09-26 裁定：**警告，不拒收**。
  //    ⭐ 回执要**说清"缺什么 + 为什么要写"**，由调用方自己决定改不改。
  if (themeWhyWarnings.length > 0) {
    lines.push(
      `⚠️⚠️ **挂靠依据待补（${themeWhyWarnings.length} 条）** —— ` +
        '挂主题是**为了让该主题 desc 描述下的【别的项目】能直接拿去用**（省一次搜索 / 少造一个轮子 / 少踩一个坑）。\n' +
        '    ⚠️ 若某条**只对本项目成立**（本项目自己的改动 / 接口 / 缺陷 / 实测数据），**它就不该挂主题** ——\n' +
        '       请对照所挂主题的 `desc` 逐条自问：**"这对该主题下的【所有项目】都有用吗？"**\n' +
        themeWhyWarnings.map((w) => `  ${w}`).join('\n') +
        '\n    ⇒ 处理方式（二选一）：**补 `themeWhy`**（引该主题 desc 里的话 + 说明用途）重调那条；' +
        '或**去掉 `theme`**（只留项目归属 —— `theme` 留空是**正常状态**，不是漏写）。',
    )
  }
  // ⚠️ **必须报出来**（§3.9.3：非法封面要"跳过并报给人"，不是丢掉）。
  //    这些块没能解析（多半是人手改坏了），原样保留在文档里，等人去修。
  if (keptOrphans.length > 0) {
    lines.push(
      `⚠️ 保留了 ${keptOrphans.length} 处**无法解析的封面块**（原文未动，已留在「沉淀知识」节末尾）——` +
        '它们多半是被手改坏了，请用 `/memj-review` 查看原因并修复。',
    )
  }

  // ⭐⭐ **回声：把"这次到底改了什么"说清楚**（§3.11.4 / 决策 103）。
  //    🔴 为什么必须有：光报"成功"看不出**哪些参数其实没生效**——
  //    而"少写了一个字段"恰恰是最常见、又最晚被发现的错误。
  if (narrativePreserved) {
    lines.push(
      '⚠️ 你指定了 `narrative` 步，但**没有给 `doc`**：已**保留原叙事不动**（未清空）。\n' +
        '    如果你确实想重写叙事，请带上 `doc` 重调；只是不想动叙事的话，' +
        '把 `narrative` 从 `step` 里去掉即可。',
    )
  }

  // ⭐⭐ **分步回执：说清"这次做了什么、没做什么"**（§3.11.4 / 决策 101 / 决策 126）。
  //    🔴 为什么必须报：分步调用**没有跨步原子性**，最容易悄悄留下"半套状态"。
  //    只报"成功"会让人看不出**这次的边界在哪**。
  //
  //    🔴🔴 **但措辞不能带"欠账"框架**（决策 126；2026-09-19 的真实事故）。
  //    原先写的是「⚠️ **还差**：… 可再调一次（`step:'narrative'`）或 `step:'all'` 补齐」——
  //    而这份列表**只是 `step` 声明的补集**（`want()` 读的是**声明的 step 集合**，
  //    **不看"是否真的欠着"**）⇒ 任何一次 `step ≠ all` 的**成功**调用都必然打出
  //    "还差 + 补齐"，把**用户主动划定的范围**重新描述成**一份没干完的活**。
  //    ⚠️ 实测后果：用户只说"沉淀知识"，模型读成"还差 narrative ⇒ 去补"，
  //    越界重写了 6 个叙事节（正是用户反复强调的"别乱动"）。
  //
  //    ⭐ 而"声明了某步却漏了参数"这种**真缺口**根本到不了这里——
  //    上面的 `offStep` 校验已经**直接拒绝**了 ⇒ 成功路径上"还差"**没有合法触发场景**。
  //    ⭐ 对照：同文件里 `narrativePreserved` 那条写得就对——它是**检测到真缺口**才提示。
  //
  //    ⇒ 改法：**保留信息、去掉指令性与欠账框架**。
  //    ⚠️ 这是**返回值**文本，不进 node 0 ⇒ **不破前缀缓存**。
  if (!plan.isAll) {
    const done = HANDOFF_STEP_ORDER.filter((s) => want(s))
    const notInScope = HANDOFF_STEP_ORDER.filter((s) => !want(s))
    lines.push(
      `\n🔹 本次 step：${done.length > 0 ? done.map((s) => `\`${s}\``).join('、') : '（无）'}` +
        `；已完成。`,
    )
    if (notInScope.length > 0) {
      lines.push(
        `🔹 **本次范围之外**（\`step\` 没列它们）：` +
          `${notInScope.map((s) => `\`${s}\``).join('、')} —— ` +
          `⛔ **这是本次划定的范围，不是欠账：不要为"补齐"再调一次**。` +
          `需要另做某一步时，由用户决定。`,
      )
    }
  }

  // ⭐⭐⭐ **事实核对：用"插件自己就知道的数字"反问模型有没有漏沉淀**（决策 108 的方案 3）。
  //
  // 🔴 **为什么必须有这一段**：实测发现——**光靠"临场回忆本会话干了什么"，一定会漏**。
  //    真实事故（2026-09-19）：一轮会话里查清了**三条命令机制**，
  //    却**一条都没沉淀**，只记了"最后踩的坑"。
  //
  // ⚠️ **它的作用不是"检查对错"，而是"让可疑变得可见"**：
  //    插件**看不到模型的推理过程**，判不了"这条知识值不值得记"（那是语义判断）；
  //    但它**能看到量**——"这轮读过 N 条、改了 M 条、只落 K 条"。
  //    ⇒ 把量摆出来，让模型**自己**发现"哎我明明干了不少事"。
  //
  // ⚠️ **只在"读得多、写得少"时才提示**——否则每轮都念一遍，会变成噪音
  //    （噪音会训练人忽略警告，那比没有警告更糟：决策 103 同一条原则）。
  const readCount = readCountAtStart
  const knowledgeWritten = newCovers.length + overwritten.length
  // ⭐⭐⭐ **把"本会话读过哪些条目"摆出来**（决策 108 的方案 3）。
  //
  // 🔴 **为什么不能用"落 0 条"当唯一判据**：真实事故里我**落了 3 条**，
  //    所以"一条都没落"**根本不会触发**——判据太窄就抓不住。
  //
  // ⭐ **真正有用的信号是"读过哪些"**：读过的条目 = **当时的关注领域**，
  //    而遗漏恰恰发生在"查完就往下走、没回头想'这算不算知识'"的地方。
  //    ⇒ 把标题列出来，让模型**针对具体领域**回忆，而不是泛泛地问"有没有漏"。
  //
  // ⚠️ **只在真读过时才出现**（读过 = 有上下文积累）；且**最多列 5 条**，
  //    避免长列表变噪音——噪音会训练人忽略警告（决策 103 同一条原则）。
  if (readCount > 0) {
    const titles = readTitlesAtStart.slice(0, 5).map((t) => `「${t}」`).join('、')
    const more = readCount > 5 ? ` 等 ${readCount} 条` : ''
    lines.push(
      `\n🔎 **沉淀自查**：本会话读过 ${titles}${more}。`,
      '    请按规范里的「扫描清单」逐类过一遍（**没有就明说「无」**）：',
      '      ① 本轮**实测/核实过**的机制或行为（⚠️ **最容易漏**——它在对话里讲得最详细，',
      '         于是容易产生"已经记录下来了"的错觉；**对话不是库，下一会话搜不到**）',
      '      ② 踩过的坑与根因　③ 做过的决策与理由　④ 查清楚的外部接口',
      `    ⚠️ 尤其看：**上面这些领域**里，本轮有没有新发现或修正？`,
    )
  }
  // ⭐ 另一侧的提示：**明明落了知识，却一条都没提主题** ⇒ 可能漏了归属判断。
  //
  // 🔴 措辞必须**给动作**，不能只说"确认一下"（2026-09-18 实测踩到）：
  //    旧文案写"确认一下是本项目确实无合适主题，还是漏看了…"，模型会把它读成
  //    "**去问用户**"⇒ 一个**免批准**的补挂动作被拖成一轮多余的追问。
  //    ⇒ 现在明说「**确认是漏挂 ⇒ 当场补**，不必问」，并给出**可直接执行**的调用。
  if (knowledgeWritten > 0 && newCovers.every((c) => c.theme.length === 0)) {
    lines.push(
      `\n🔎 **归属自查**：这次落的 ${knowledgeWritten} 条知识**都没挂主题**。\n` +
        '    先看「本项目 frontmatter 的 `themes:`」确认是不是真没有合适的主题。\n' +
        '    ⭐ **若确认是漏挂 ⇒ 当场补，不必问用户**：挂靠**免批准、无门槛**，' +
        '用 `memj_promote` 的 `addThemes: ["<主题 id>"]`，`refs` 传**完整 UUID**（不认短 id）。',
    )
  }

  // ⭐⭐ **合并回执**（决策 109）：说清"哪些节这次没写、沿用了旧内容"。
  //    🔴 为什么必须报：合并让"没写"变成**安全的默认**，但也带来新的静默风险——
  //    模型**以为清空了、其实没清**；或**忘了写某个本该更新的节**。
  if (inheritedSections.length > 0) {
    lines.push(
      `\n📄 **叙事合并**：本次未写的 ${inheritedSections.length} 个节**沿用了原有内容**：` +
        `${inheritedSections.map((s) => `\`${s}\``).join('、')}。\n` +
        '    ⚠️ 若其中某个节**本该更新**，请把它写进 `doc` 重调；' +
        '要**清空**某节，就把它写出来、内容留空。',
    )
  }

  // ⭐⭐ **被替换的节 + 字数变化**（决策 109 缺口的另一半，见 `replacedIn` 的注释）。
  //    🔴 没有这一段，**"整节内容被静默删掉"在回执里完全不可见**——
  //    真实事故就是靠它才能当场发现（写了一个节、却只带了新增的那一小段）。
  if (replacedSections.length > 0) {
    const detail = replacedSections
      .map((s) => {
        const delta = s.after - s.before
        const sign = delta >= 0 ? '+' : '−'
        return `\`${s.title}\`：${s.before} → ${s.after} 字符（${sign}${Math.abs(delta)}）`
      })
      .join('；')
    lines.push(
      `\n✏️ **本次被替换的节（整节替换，原内容不再保留）**：${detail}\n` +
        '    🔴 **请核对**：若上面某节**字数大幅减少**，说明你写的该节**没带上它原有的全文**——\n' +
        '    ⚠️ 工具对"写了但写不全的节"**不做保护**（它分不清"故意精简"与"忘带全文"）。\n' +
        '    ⭐ 要修正：把那节的**完整内容**（原有 + 新增）重写一遍再调；' +
        '想清空某节才应该留空。',
    )
  }

  // ⭐⭐ **按节写的回声**（决策 134）——**回声落盘结果**，让"改错了"当场看得见。
  //    这是"让模型写对参数"的第 ⑥ 条措施：它给出**可对照的事实**
  //    （改的是哪一节、什么操作、该节 X → Y 字符），而不是一句"已保存"。
  if (usedSectionOp && sectionOp !== undefined) {
    const opLabel: Record<DocOp, string> = {
      append: '追加到该节**末尾**',
      prepend: '追加到该节**开头**',
      replace: '**替换**了该节',
      drop: '**删除**了该节',
    }
    const delta = (sectionOp.afterChars ?? 0) - (sectionOp.beforeChars ?? 0)
    const sign = delta >= 0 ? '+' : '−'
    lines.push(
      `\n⭐ **按节写**：${opLabel[docOp]} \`${sectionOp.hitTitle ?? docSectionName}\`` +
        (docOp === 'drop'
          ? `（该节原有 ${sectionOp.beforeChars} 字符，已整节删除）`
          : `：${sectionOp.beforeChars} → ${sectionOp.afterChars} 字符（${sign}${Math.abs(delta)}）`) +
        '。\n    其余节**一个字都没动**。',
    )
    // 🔴🔴 **非精确命中必须点破**（2026-10-12 新增，真实事故修）。
    //    ⭐ 事故：模型传 `docSection:"目标"`，实际改的是 `## 研究目标`
    //       （子串匹配），而回执只打节名 ⇒ 手误被完全掩盖。
    //    ⇒ 这里把"你传的"与"我改的"并排写出来，让人与模型都能一眼看出不一致。
    if (sectionOp.fuzzyHit === true && sectionOp.hitTitle !== undefined) {
      lines.push(
        `\n⚠️ **非精确匹配**：你传的是 \`${docSectionName}\`，` +
          `工具按子串匹配命中的是 \`${sectionOp.hitTitle}\`。\n` +
          '    ⭐ 上面那句「按节写」改的**就是后者**。\n' +
          '    🔴 若这不是你的本意 ⇒ 用 `memj_read({ project })` 核对真实节名，' +
          '下一次传**完整节名**（精确匹配优先于子串）。',
      )
    }
    // 🔴 **`drop` 之后必须检查空壳节**（用户裁定：允许删空、但回执必须报警）。
    if (sectionEmptyWarn.length > 0) {
      lines.push(
        `\n⚠️ **该文档现在有 ${sectionEmptyWarn.length} 个空壳节**（只有标题、没有内容）：` +
          `${sectionEmptyWarn.map((s) => `\`${s}\``).join('、')}。\n` +
          '    ⭐ 这是**提示，不是错误**——工具分不清"故意删空"与"误删"。\n' +
          '    ⚠️ 请核对：若是有意清空 ⇒ 忽略；若是误删 ⇒ 用 `docOp: \'append\'` 把内容补回。',
      )
    }
  }

  // ⭐⭐ **重复节名检测**（2026-09-21 新增；**2026-09-30 移出按节分支**）。
  //
  // 🔴 触发场景：写 `doc` 时**把别的小节的 `###` 标题一起抄了进去**
  //    ⇒ 那些标题成了新子节、而原有小节还在 ⇒ **内容重复**。
  //    ⚠️ **工具原本什么都不说**（只报字数，而那次是 `+2908`，看起来像"写多了"）。
  //
  // 🔴🔴 **为什么现在放在分支外**：它原先嵌在 `usedSectionOp` 分支里
  //    ⇒ **整份 `doc` 路径根本不检查**；而"把别节标题抄进 doc"这个坑
  //    **两条路径都会踩**（本轮构造用例时，正是这个缺口把断言照成了假绿）。
  //    ⭐ 判据：**一段代码里已经有了一种检查，就问其他几条路径为什么不需要。**
  // ⚠️ 只警告、不拒绝（"故意同名"虽罕见但合法，工具不替人决定）。
  const dupes = findDuplicateSections(narrative)
  if (dupes.length > 0) {
    lines.push(
      `\n🔴 **发现 ${dupes.length} 个"同名小节"**（**同一个父节下**出现了多次）：` +
        `${dupes
          .map((d) =>
            d.level === 2 ? `\`${d.title}\`×${d.count}` : `\`${d.parent} › ${d.title}\`×${d.count}`,
          )
          .join('、')}。\n` +
        '    ⚠️ **最可能的原因**：你在 `doc` 里写进了**别的小节的 `###` 标题** ——\n' +
        '    那些标题会被当成**新建子节**，而**原有的同名小节仍然在** ⇒ **整段内容重复两遍**。\n' +
        '    ⭐ **正确做法**：写某一节时**只写它自己**的标题与内容；\n' +
        '    要合并别的小节 ⇒ **逐个替换它们**，不要把它们的标题塞进这一节里。\n' +
        '    ⭐ **只在同一个顶层节内统计**：跨顶层节的同名子节（例如「有效做法」与「失败/踩坑」\n' +
        '    各自的「一、通用方法」）是**合法结构**，不算重复 —— 它们不会出现在上面的清单里。\n' +
        '    ⚠️ 请核对：若确实是有意造两个同名节 ⇒ 忽略本提示。',
    )
  }


  // ⭐⭐ **孤本判据检测**（决策 127 的 C 层兜底；决策 136 改造）。
  //
  // 🔴 **为什么单列一段**：上面那段只报**字数**，而"字数减少"本身**不是信号**——
  //    截断/压缩都会让字数减少。真正要防的是：**把"孤本判据"当流水账一起磨掉**。
  //
  // 🔴🔴 **决策 136 的关键改造**：**截断是工具做的、且原文进了历史条目** ⇒
  //    截断导致的判据减少**不是风险，而是预期行为**（原文完整存在条目里）。
  //    ⇒ 所以**跳过本轮**：否则每次截断都会打一句"请核对"，那就是**噪音**
  //      （本项目实测：同一句警告连报 7 次 ⇒ 脱敏 ⇒ 反而没人看）。
  //    ⚠️ **它仍然守着"人改叙事"那条路**（`docOp`/`doc` 直接改动导致的减少）。
  //    ⭐ 判据：**一个机制"每次都会触发"时，它的措辞就不再是警报、而成了背景音**。
  //
  // ⚠️ **只在"减少"时报**：不减少就不说话。
  // 🔴🔴 **只能警告，不能拒绝**：工具**区分不了**"故意删掉一条已失效的判据"与"误删"。
  if (narrateNow && existing !== undefined && !historyArchived) {
    const oj = orphanJudgments(existing.narrative, finalNarrative)
    if (oj !== undefined && oj.after < oj.before) {
      lines.push(
        `\n⚠️ **孤本判据减少**（「${PROGRESS_TITLE}」）：${oj.before} → ${oj.after} 条` +
          `（−${oj.before - oj.after}）。\n` +
          '    ⭐ **孤本 = 文档别的节里没有对应表述**——删了**别处查不到**。\n' +
          '    ⚠️ 判据靠**原句**生效（改写成摘要就不再是判据了）。\n' +
          '    🔴 **请核对**：若有意删的是**已被推翻**的判据 ⇒ 忽略本提示；若误删 ⇒ 把**原句**补回来。',
      )
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐⭐ **记账：本轮落了知识**（决策 167）
  //
  // 🔴🔴 **为什么必须在这里记**：决策 165 的自动规范化**靠事后读会话日志**判断
  //    "这轮有没有落知识"，而那是**错的** —— 它只能判出"**这个会话**落过知识"
  //    （会话级判据），**一旦落过就永远为真** ⇒ **之后每一轮都会起一个子代理**。
  //    ⭐ 生产实测铁证：某会话 `memj_handoff` 只发生在 07:39~07:41 一轮，
  //       而插件在 07:45 / 07:52 / 08:07（**都没沉淀**）各起了一个。
  //
  // ⭐ **用户给的判据**：*"应该是只有有知识沉淀的轮次才跑啊，
  //    这个需要插件用脚本去校验。"* ⇒ **在"写知识那一刻"由插件自己记一笔**，
  //    记的单位是**轮次**（不是会话）。
  //
  // ⚠️ **best-effort**：记账失败只记日志，**绝不影响 handoff 成败**
  //    （最坏后果只是"少去重一次"）。
  // ══════════════════════════════════════════════════════════════════════
  if (knowledgeWritten > 0) {
    await noteKnowledgeWritten(sessionId, turnNow, knowledgeWritten)
  }

  return {
    ok: true,
    message: [...lines, ...backupLines].join('\n'),
    issues: [],
    createdProject: isNewProject,
    createdThemes,
    similarProjects: [],
    similarThemes: [],
    snapshotCount,
  }
}

/**
 * ⭐⭐ **历史归档：超过阈值就自动截断**（决策 136）。
 *
 * 流程：① 截断「当前进度」（`truncateProgress`）⇒ ② 把截走的原文落成
 * `kind:'history'` 的条目 ⇒ ③ 回填「历史进展」行里的 entry id 指针。
 *
 * 🔴🔴 **为什么必须有它**：压缩规范写了判据、也加了触发条件（回执每次报体量），
 *    **连报 7 次、一次没压** —— 根因是"**要模型自己动手**"。
 *    截断由工具自己做 ⇒ ⭐ **那个失败模式从此不存在**。
 *
 * ⚠️ **与压缩的语义差别**：压缩**会丢**（归并掉细节）；截断**不丢**
 *    （原文逐字进条目，且「历史进展」里留了**完整 entry id 指针**可读回）。
 *
 * @param args - 见各字段注释。
 * @returns 新的叙事（可能未变）与回执行。
 */
async function runHistoryArchive(args: {
  projectId: string
  narrative: string
  existingNarrative: string | undefined
  config: MemjConfig
  narrateNow: boolean
  sessionId: string
  /**
   * ⭐⭐ **该文档要截断哪些节**（决策 204 / 206）——**可多节**。
   * 空数组 = 本模板不声明自动截断 ⇒ 不截（如实报，不算错误）。
   */
  truncateTitle: readonly string[]
}): Promise<{ narrative: string; lines: string[]; archived: boolean; covers: Cover[] }> {
  const lines: string[] = []
  const { projectId, config } = args
  // ⚠️ **只在 `narrative` 步做**：没动叙事就不该截（否则"只落知识"也会顺带改文档）。
  if (!args.narrateNow) return { narrative: args.narrative, lines, archived: false, covers: [] }

  // ⭐ **已有的「历史进展」行要保留**（它们指向更早归档的条目）——
  //    从**旧文档**里取（而不是从本次新叙事里取：本次叙事可能是按节改的、不含那一节）。
  const src = args.existingNarrative ?? args.narrative
  const priorLines = readHistoryLines(src)

  // 🔴🔴 **两个配额都要传**（实测踩到过）：只传 `keep` 会让"在 keep 与 warn 之间"
  //     的文档**也被截**，而用户的本意是"**超过阈值才动手、截到 12000 以内**"。
  // ⭐ 第 5 参 = **该文档自己的截断目标节**（决策 204 / 206；默认六节时 == 「当前进度」）。
  const r = truncateProgress(
    args.narrative,
    config.progressCharsWarn,
    config.progressCharsKeep,
    priorLines,
    args.truncateTitle,
  )
  if (r.warning !== '') {
    lines.push(`\n📦 **历史归档未执行**：${r.warning}`)
    return { narrative: args.narrative, lines, archived: false, covers: [] }
  }
  if (r.chunks.length === 0) return { narrative: args.narrative, lines, archived: false, covers: [] }

  // ── 落盘：每组一条 `kind:'history'` 的条目 ──
  let narrative = r.narrative
  const created: Array<{ slug: string; id: string; summary: string; count: number }> = []
  const covers: Cover[] = []
  for (let i = 0; i < r.chunks.length; i += 1) {
    const c = r.chunks[i]
    if (c === undefined) continue
    const id = newEntryId()
    const slug = historySlug(projectId, c.slugPart)
    const cover: Cover = {
      id,
      project: projectId,
      // ⚠️ **不挂主题**：它不是知识（挂主题会污染跨项目主题视图）。
      theme: [],
      global: false,
      kind: 'history',
      tags: ['历史进展'],
      title: c.title,
      desc: `「${PROGRESS_TITLE}」自动截断时归档的原文（${c.summary}）；当要查这一段的历史细节时读它。`,
      ref: '', // 由 writeEntryDoc 生成
      ext: false,
      createdAt: nowIsoNow(),
      updatedAt: nowIsoNow(),
      archivedAt: '',
    }
    // 🔴 **必须走 `writeEntryDoc`**（唯一落盘处，它负责 path/slug 规范与 frontmatter）。
    cover.ref = await writeEntryDoc(cover, slug, c.body, { sessionId: args.sessionId, from: 'history-archive' })
    covers.push(cover)
    // ⭐ 回填指针（**完整 UUID** —— `memj_read` 只认完整 id）。
    narrative = fillHistoryId(narrative, i, id)
    created.push({ slug, id, summary: c.summary, count: c.sections.length })
  }

  // 🔴 **回填后必须复核"没有残留占位符"**——实测踩到过：
  //    组数与占位符数目对不上（或 `fillHistoryId` 的序号错位）时，
  //    文档里会留下一串 `{{ENTRY_ID}}`，而**那行指针就废了**。
  //    ⚠️ 工具**不猜**：如实报出来（不静默）。
  if (countHistoryPlaceholders(narrative) > 0) {
    lines.push(
      `\n⚠️ **历史归档：指针回填不完整** —— 文档里仍留有 ${countHistoryPlaceholders(narrative)} 处占位符，` +
        '请用 `memj_read` 核对「历史进展」小节（这是工具侧的问题，请报告）。',
    )
  }

  if (created.length > 0) {
    lines.push(
      `\n📦 **历史归档（自动截断）**：「${PROGRESS_TITLE}」${r.beforeChars} → ${r.afterChars} 字符` +
        `（目标 ${config.progressCharsKeep}）。\n` +
        created
          .map(
            (c) =>
              `    · **${c.summary}**（${c.count} 节）⇒ 条目 \`${c.id}\`（\`kind: history\`，slug \`${c.slug}\`）`,
          )
          .join('\n') +
        '\n    ⭐ 原文**逐字保留**在该条目里，用 `memj_read({ id: "<完整 UUID>" })` 可读回；' +
        '\n    ⚠️ history 条目**不参与检索**（不会混进 `memj_search` 结果）。',
    )
  }
  return { narrative, lines, archived: created.length > 0, covers }
}

/** 当前时间的 ISO 串（小工具，避免重复 `new Date()`）。 */
function nowIsoNow(): string {
  return new Date().toISOString()
}

/**
 * ⭐⭐ **执行版本维护**（决策 135 / 136 的接线处）。
 *
 * 两步：① 覆盖正文镜像；② git 提交（若开关开着且环境可用）。
 *
 * 🔴 **任何一步失败都不抛**（调用方还有一层 try），只把如实结果写进回执。
 * ⚠️ **历史归档（截断）不在这里** —— 它必须在**落盘之前**做（见 `runHandoff` 的
 *    "截断"段），否则要写两次盘；本函数只管"落盘之后"的版本维护。
 * @param args - 见各字段注释。
 * @returns 回执行。
 */
async function runVersionSteps(args: {
  projectId: string
  at: string
  existingNarrative: string | undefined
  finalNarrative: string
  config: MemjConfig
}): Promise<{ lines: string[] }> {
  const lines: string[] = []
  const { projectId, at, config } = args

  // ══ ① 正文镜像（**git 维护的对象**）══
  //
  // 🔴 **只在 git 版本维护开着时才写**（用户裁定，2026-09-21）：
  //    镜像与"台账"不同——**它存在的唯一目的就是给 git 做版本基线**。
  //    开着 git 才写 ⇒ 「关掉开关」的字面意思与行为一致（关 = 这条链路全停）。
  let mirrorChanged = false
  if (config.backupGit) {
    mirrorChanged = await writeNarrativeMirror(projectId, args.finalNarrative)
  }

  // ══ ② git 提交 ══
  if (config.backupGit) {
    let repo = await readRepoState()
    // ⭐⭐ **自愈：仓库不见了就重建**（决策 135 实测踩到）。
    //
    // 🔴 为什么必须自愈而不是只报错：开关**已经在配置里开着**，而仓库可能因为
    //    "人清过 backup/ 目录 / 换机器拷了配置但没拷目录"而消失。
    //    只报错的话，用户每轮 handoff 都会看到同一句"仓库不存在"，
    //    而**没有任何一步会自动把它修好**——那正是本项目"警报脱敏"的成因。
    //    ⚠️ 但**不能无条件重建**：先探测环境（没装 git 时重建必然失败，且会刷屏）。
    if (repo.initialized === false) {
      const probe = await probeGit()
      if (probe.available && probe.nestedRepoAt === '') {
        const made = await ensureRepo()
        if (made.ok) {
          repo = await readRepoState()
          lines.push(
            '\n🔧 **git 仓库原先不存在，已自动重建**（`backup/.git`）——' +
              `身份：${made.identity.name} <${made.identity.email}>。`,
          )
        }
      }
    }

    if (!repo.initialized) {
      const n = noteGitFailure()
      // ⚠️ 连败到阈值后**不再逐轮复述**（否则它会变成背景音）。
      lines.push(
        n <= config.backupGitFailLimit
          ? '\n🔴 **git 版本维护已开启，但仓库无法建立** —— 本次未提交。\n' +
              '    请在设置里关闭再重新打开该开关（会重新探测环境并生成身份）。'
          : `\n🔴 **git 版本维护持续失败（连续 ${n} 次）** —— 本次同样未提交。\n` +
              '    ⚠️ 不再每轮重复细节：请到设置页检查 git 环境，或把该开关关掉。',
      )
    } else if (repo.identity.source === 'none') {
      noteGitFailure()
      lines.push('\n🔴 **git 提交者身份缺失** —— 本次未提交（请在设置里重新开启该开关以生成身份）。')
    } else {
      const msg = `memj-handoff: ${projectId} @ ${at}\n${summarizeNarrativeChange(args.existingNarrative, args.finalNarrative)}`
      const c = await commitAll(repo.identity, msg)
      if (!c.ok) {
        const n = noteGitFailure()
        lines.push(
          n <= config.backupGitFailLimit
            ? `\n⚠️ **git 提交失败**（不影响本次 handoff）：${c.error}`
            : `\n⚠️ **git 提交持续失败（连续 ${n} 次）**：${c.error}\n` +
                '    ⚠️ 不再每轮重复——请检查 git 环境，或把该开关关掉。',
        )
      } else {
        noteGitSuccess()
        if (c.committed) {
          // ⭐⭐ **措辞必须区分"这次改的"与"先前遗留的"**（用户裁定，2026-09-21 改）。
          //
          // 🔴 旧写法无论哪种情况都报「已提交正文镜像」——
          //    而在"本次 handoff 没改正文、只是把先前遗留的镜像变更补提交"时，
          //    那句话会被读成"**这次改了正文**"。
          //    ⚠️ 回执是模型判断"库里刚刚发生了什么"的**第一手材料**（决策 103），
          //      措辞含糊会让它据此做出错误推断。
          lines.push(
            mirrorChanged
              ? `\n🔖 **已提交正文镜像**（\`${c.hash}\`）——压缩改坏了可以用 git 退回。`
              : `\n🔖 **已提交正文镜像**（\`${c.hash}\`）——⚠️ 提交的是**先前未提交的遗留变更**` +
                  '（本次 handoff **未改正文**）。',
          )
        } else {
          lines.push('\n🔖 正文镜像**无变化**，本次未提交（内容与上一版相同）。')
        }
      }
    }
  }

  void args.existingNarrative
  return { lines }
}

/**
 * 提交信息里的第二行：**说清这次正文变了多少**。
 *
 * ⭐ 为什么值得写：`git log` 里一眼就能看出"哪一次是压缩"（字数大跌），
 *    而"找压缩前那一版"正是版本维护的主要用途。
 * @param before - 变更前叙事（可能没有）。
 * @param after - 变更后叙事。
 * @returns 一行摘要。
 */
function summarizeNarrativeChange(before: string | undefined, after: string): string {
  const afterLen = after.trim().length
  if (before === undefined) return `首次：${afterLen} 字符`
  const beforeLen = before.trim().length
  const delta = afterLen - beforeLen
  const sign = delta >= 0 ? '+' : '−'
  return `正文 ${beforeLen} → ${afterLen} 字符（${sign}${Math.abs(delta)}）`
}

/**
 * 把某个已有封面挂到新主题上（跨文档写）。
 *
 * 用途：建新主题时，**快照里那条别项目的知识一并补挂**（§3.7.5 步骤 2）
 * ——否则新主题只有本项目一条证据，那个"跨项目"的事实就丢了。
 * @param coverId - 要挂的封面 id。
 * @param themeId - 目标主题 id。
 * @param snapshot - 库快照（用于定位封面所在项目）。
 */
async function linkCoverToTheme(
  coverId: string,
  themeId: string,
  snapshot: Awaited<ReturnType<typeof scanLibrary>>,
): Promise<void> {
  const found = snapshot.covers.find((c) => c.cover.id === coverId)
  if (found === undefined) return
  const ownerProject = found.cover.project
  if (ownerProject === '') return
  const doc = await loadProjectDoc(ownerProject)
  if (doc === undefined) return

  let changed = false
  const covers = doc.covers.map((c) => {
    if (c.id !== coverId || c.theme.includes(themeId)) return c
    changed = true
    return { ...c, theme: [...c.theme, themeId] }
  })
  if (!changed) return

  await writeProjectDoc(
    ownerProject,
    { ...doc.frontmatter, themes: [...new Set([...doc.frontmatter.themes, themeId])] },
    doc.narrative,
    covers,
    doc.orphans,
  )

  // 同步该条目的 frontmatter（"两处都写"，§3.3）。
  const target = covers.find((c) => c.id === coverId)
  if (target !== undefined && !target.ext) {
    // ⚠️ 用 `syncEntryFrontmatter`（按既有 ref 就地改），**不要**用
    // `writeEntryDoc`（它按 slug 重算路径，会把正文写到另一个文件、留下孤儿）。
    await syncEntryFrontmatter(target)
  }
}

/** 构造一个失败结果。 */
function fail(message: string): HandoffResult {
  return {
    ok: false,
    message,
    issues: [],
    createdProject: false,
    createdThemes: [],
    similarProjects: [],
    similarThemes: [],
    snapshotCount: 0,
  }
}

/**
 * 校验库里全部封面（`memj_rebuild` 的职责二，§4.2）。
 *
 * ⚠️ 与写入校验的**处置不同**（§3.9.3）：这里**跳过非法封面并记录**，
 * 不阻断重建——因为"一次手改的笔误不该让整个库重建不了"。
 * @returns 全部非法封面。
 */
export async function validateAllCovers(): Promise<CoverIssue[]> {
  const snapshot = await scanLibrary()
  return snapshot.issues
}

/** 复用：判断某文档里是否已有指定 ref 的外部封面。 */
export async function findExternalCoverByRef(
  projectId: string,
  ref: string,
): Promise<Cover | undefined> {
  const doc = await loadProjectDoc(projectId)
  return doc?.covers.find((c) => c.ext && c.ref === ref)
}

/** 读提名清单（供人侧命令与工具回执使用）。 */
export { readNominations }

/** 解析封面（供 UI/探针复用）。 */
export { parseCovers }
