/**
 * 库的读写与派生层重建（方案 §2 / §3.3 / §4.4 / §7）。
 *
 * ── 本模块的职责边界 ───────────────────────────────────────────────────────
 * **它是唯一的落盘处**：项目文档、条目正文、派生层（THEME/GLOBAL）、提名文件，
 * 全部经这里写。上层（工具）只负责"决定写什么"，不直接碰文件。
 *
 * ── 派生层的性质（§11.3）────────────────────────────────────────────────────
 * `themes/THEME-*.md` 与 `GLOBAL.md` 是**投影**——内容全部由项目文档里的封面聚合而来，
 * **手改它们会在下次 rebuild 时丢失**。这是"唯一源头"这条铁律的固有代价。
 * ⚠️ 唯一的例外：THEME 文档 frontmatter 里的 **`desc` 必须保留**（§4.3），
 * 它没有别的来源，被清掉就得每次重写。
 *
 * @module dsh-memj/store
 */

import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { ensureDir, listFiles, readTextIfExists, removeFile, writeTextAtomic } from './files.ts'
import {
  entriesDir,
  entryFileName,
  entryRelPath,
  globalDocPath,
  libraryRoot,
  nominationsPath,
  projectDocPath,
  docReadLogPath,
  docReadsDir,
  projectsDir,
  readLogPath,
  readsDir,
  requiredDirs,
  resolveRef,
  safeName,
  themeDocPath,
  themesDir,
} from './paths.ts'
import {
  extractTitle,
  narrativeFromProjectText,
  parseCovers,
  renderCover,
  renderFrontmatter,
  renderYamlArray,
  replaceBlockAtLines,
  splitFrontmatter,
  toStringArray,
  validateCoverShape,
  yamlScalar,
} from './parse.ts'
import { isEntryKind } from './schema.ts'
import type {
  Cover,
  CoverIssue,
  DocReadRecord,
  EntryDoc,
  EntryFrontmatter,
  Nomination,
  NominationsFile,
  ParsedCover,
  ProjectFrontmatter,
  ReadSnapshot,
  ThemeFrontmatter,
} from './schema.ts'

/** 项目文档名的前缀与后缀。 */
const HANDOFF_PREFIX = 'HANDOFF-'
const MD_SUFFIX = '.md'

// ⭐⭐⭐ **节名契约已下沉到 `./sections.ts`**（2026-09-30 去副本）。
//
// 🔴 为什么不留在本文件：节名被 `store` / `handoff` / `history` / `parse` 四处消费，
//   而它们之间**已有依赖方向 `store → parse`** ⇒ 常量放这里，`parse.ts` 引用它
//   就会形成**循环依赖**。⇒ 下沉到零依赖的 `sections.ts`。
//
// ⭐ **引入 + 转出两步都做**：`import` 让本文件自己能用（`writeProjectDoc` 重建骨架要用），
//   `export` 让既有调用点（从 `store.ts` 引这些名字的）**一行都不用改**。
import {
  NARRATIVE_TITLES,
  NARRATIVE_SECTIONS,
  PROGRESS_TITLE,
  KNOWLEDGE_TITLE,
  KNOWLEDGE_SECTION,
  buildSkeleton,
  isKnowledgeHeading,
  cutKnowledgeSection,
  cutSpecSection,
  extractSpecSection,
  docSectionsOf,
  sectionsFromNarrative,
  SPEC_TITLE,
  SPEC_SECTION,
  // ⭐⭐ 决策 209：各节自己的规范块（`## 节名` 下的 ```memj:spec 围栏）。
  SPEC_BLOCK_FENCE,
  specBlockFenceInfo,
  specBlockRange,
  extractSpecBlock,
  extractSpecBlockLines,
  stripSpecBlock,
  stripAllSpecBlocks,
  truncateTitlesFromBlocks,
} from './sections.ts'

export {
  NARRATIVE_TITLES,
  NARRATIVE_SECTIONS,
  PROGRESS_TITLE,
  KNOWLEDGE_TITLE,
  KNOWLEDGE_SECTION,
  buildSkeleton,
  isKnowledgeHeading,
  cutKnowledgeSection,
  cutSpecSection,
  extractSpecSection,
  docSectionsOf,
  sectionsFromNarrative,
  SPEC_TITLE,
  SPEC_SECTION,
  SPEC_BLOCK_FENCE,
  specBlockFenceInfo,
  specBlockRange,
  extractSpecBlock,
  extractSpecBlockLines,
  stripSpecBlock,
  stripAllSpecBlocks,
  truncateTitlesFromBlocks,
}

/** 一个项目在库里的全貌。 */
export interface ProjectRecord {
  id: string
  frontmatter: ProjectFrontmatter
  /** 文档全文。 */
  text: string
}

/** 库的一次快照（读多写少，一次扫描供多处使用）。 */
export interface LibrarySnapshot {
  projects: ProjectRecord[]
  /** 全部封面（含来源与行号）。 */
  covers: ParsedCover[]
  /** 解析中发现的问题（**已按处置语义归类**：这些是"跳过"的）。 */
  issues: CoverIssue[]
  /** 已有主题 id（从 THEME 文档名 + frontmatter 得到）。 */
  themeIds: string[]
}

/**
 * 从项目文档名解析项目 id。
 * @param fileName - 如 `HANDOFF-dsh-memj.md`。
 * @returns 项目 id；不匹配返回 `undefined`。
 */
export function projectIdFromFile(fileName: string): string | undefined {
  if (!fileName.startsWith(HANDOFF_PREFIX) || !fileName.endsWith(MD_SUFFIX)) return undefined
  const id = fileName.slice(HANDOFF_PREFIX.length, -MD_SUFFIX.length)
  return id === '' ? undefined : id
}

/**
 * 解析项目文档的 frontmatter。
 *
 * 容忍缺失——**不报错**，让上层用默认值兜底（文档可能是人刚手建的空壳）。
 * @param data - frontmatter 数据（可能为 null）。
 * @param fallbackId - 从文件名得到的 id。
 * @returns 规范化后的 frontmatter。
 */
function normalizeProjectFrontmatter(
  data: Record<string, unknown> | null,
  fallbackId: string,
): ProjectFrontmatter {
  if (data === null) {
    return {
      project: fallbackId, title: '', desc: '', themes: [],
      createdAt: '', updatedAt: '', archivedAt: '',
      // ⭐ 决策 204：老文档没这几行 ⇒ 读出空
      //    （⚠️ `sections` 字段已于 2026-10-05 删除 —— 节名只认正文）。
      template: '', truncateSections: [],
    }
  }
  const project = typeof data['project'] === 'string' && data['project'].trim() !== ''
    ? data['project'].trim()
    : fallbackId
  return {
    project,
    // ⭐ 显示名（决策 115）：可空 ⇒ 显示时回落成 id。老项目没这个字段 ⇒ 读出空串。
    title: typeof data['title'] === 'string' ? data['title'] : '',
    desc: typeof data['desc'] === 'string' ? data['desc'] : '',
    themes: toStringArray(data['themes']),
    // ⭐ 时间（决策 119）：老数据没这两行 ⇒ 读出空串（由迁移脚本回填）。
    createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : '',
    updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : '',
    // ⭐ 归档时间（决策 133）：老数据没这行 ⇒ 空串 = 活跃。
    archivedAt: typeof data['archivedAt'] === 'string' ? data['archivedAt'] : '',
    // ⭐ 建文档时用的模板 id（决策 204）：纯记录，空串 = 默认模板。
    //    ⚠️ 封面的 `sections` 字段已于 2026-10-05 删除（节名只认正文）；
    //       老文档里若还留着那一行，**读侧不再认它**（存量已用脚本清掉）。
    template: typeof data['template'] === 'string' ? data['template'] : '',
    // ⭐⭐ 自动截断目标节（决策 204 / 206）：**数组**；空 = 不截
    //    （老文档由调用方按默认六节兜底）。
    //    🔴🔴 **必须兼容老的单值形态**（决策 204 时代写的是 `truncateSection: 当前进度`）：
    //       生产库 18 个文档当时全是那个写法 ⇒ 不接住它们就会**全部静默变成"不截"**。
    truncateSections: readTruncateSections(data),
  }
}

/**
 * ⭐ 读 `truncateSections`，**同时兼容老的单值字段 `truncateSection`**。
 *
 * 🔴 **为什么必须兼容**：决策 204 存的是**单个字符串**，决策 206 改成数组。
 *    老文档若不被接住 ⇒ 读出来是空数组 ⇒ 调用方理解成"不截"
 *    ⇒ **那些文档的「当前进度」再也不会自动瘦身**（正是 `a113fcb` 那个事故的同族）。
 * ⚠️ 两个字段**同时存在**时以新的（数组）为准。
 * @param data - frontmatter 原始数据。
 * @returns 节名数组（已去掉空串）。
 */
function readTruncateSections(data: Record<string, unknown>): string[] {
  const arr = toStringArray(data['truncateSections']).map((s) => s.trim()).filter((s) => s !== '')
  if (arr.length > 0) return arr
  const single = typeof data['truncateSection'] === 'string' ? data['truncateSection'].trim() : ''
  return single === '' ? [] : [single]
}

/**
 * ⭐⭐ 扫描选项（决策 133）。
 */
export interface ScanOptions {
  /**
   * 是否把**归档物**也纳入快照。默认 `false`（= 只给活跃的）。
   *
   * 🔴 **默认值的取舍是有意的**：默认排除 ⇒ **38 处现有调用一行不改就全部正确**
   * （`memj_info` / `memj_search` / `rebuild` / 网页列表……自动看不到归档物），
   * 而不是"让每个调用点都记得过滤一遍"。本项目已吃过"提醒写在文档里、没变成机制"的亏。
   *
   * ⚠️ 传 `true` 时返回的是**全集（活跃 + 归档）**，不是"只要归档的"——
   * 由调用方自己按 `cover.archivedAt` / `frontmatter.archivedAt` 分流
   * （归档页要分两个子页、编辑面板要列"归档项目"候选，都需要同时看到两类）。
   */
  includeArchived?: boolean
  /**
   * ⭐⭐ **是否把「历史归档」条目也纳入快照**（决策 136）。默认 `false`。
   *
   * 🔴 **为什么默认排除**：`kind: 'history'` 的**不是知识**，而是「当前进度」被
   *    自动截断时**被截走的原文**。让它们进检索会**污染搜索结果**
   *    （问一件事，捞回一堆"某月某日的进度流水"）。
   *
   * ⚠️ **但必须能被 `memj_read` 按 id 读到**——「历史进展」小节里留了**完整 UUID 指针**，
   *    那正是它存在的意义 ⇒ **读侧**要走 `includeHistory: true`。
   *    ⚠️ 与 `includeArchived` 不同的是：这里**"排除"是加一层过滤**，
   *       而"归档"是另一个正交维度（历史条目也可以是归档的）。
   */
  includeHistory?: boolean
}

/** 判断一张封面是否是「历史归档」条目。 */
export function isHistoryCover(cover: { kind: string }): boolean {
  return cover.kind === 'history'
}

/**
 * ⭐⭐ **项目列表的排序判据：按 `updatedAt` 倒序**（最近更新的排最前）。
 *
 * 🔴 **为什么做在这里（`scanLibrary`）而不是各个接口/前端**：
 * 项目列表有**四个消费方**——网页项目页、网页下拉框、`/memj-get-handoff-project`
 * 的弹窗、以及该命令无参时的机读清单。做在出口 ⇒ **一处生效**；
 * 做在消费方 ⇒ 同一语义会有 N 份实现（本项目已多次栽在这上面）。
 *
 * ⚠️ **空串排最后**：老项目没有 `updatedAt` 字段（读出空串），
 * 不能让它靠"空串字典序最小"冒到最前面。
 * ⚠️ **必须确定性**：`updatedAt` 相同的两条用 `id` 兜底比较——
 * 否则同一份库两次扫描可能给出不同顺序，列表会莫名跳动。
 * @param a - 项目记录。
 * @param b - 项目记录。
 * @returns 比较结果（`<0` ⇒ a 在前）。
 */
export function byUpdatedDesc(
  a: { id: string; frontmatter: { updatedAt: string } },
  b: { id: string; frontmatter: { updatedAt: string } },
): number {
  const av = a.frontmatter.updatedAt
  const bv = b.frontmatter.updatedAt
  if (av !== bv) {
    if (av === '') return 1
    if (bv === '') return -1
    // ISO 8601 同格式同长度 ⇒ 字典序 = 时间序；倒序即 b 在前。
    return bv.localeCompare(av)
  }
  return a.id.localeCompare(b.id)
}

/**
 * **磁盘全量扫描**的在飞登记（仅用于合并并发；扫描一结束就清空）。
 * ⚠️ **只登记一份**（不带 options 键）：磁盘扫描与 options 无关 —— 见 `scanLibrary` 的注释。
 */
let inFlightScanAll: Promise<UnfilteredSnapshot> | undefined

/** 未经 options 过滤的原始扫描结果（`applyScanOptions` 的输入）。 */
interface UnfilteredSnapshot {
  /** 全部项目（**含归档**），顺序为文档遍历序（排序在过滤之后做）。 */
  projects: ProjectRecord[]
  /** 全部封面（**含归档 + history**）。 */
  covers: ParsedCover[]
  /** 硬校验问题（**永远不过滤**：归档封面的问题照报，决策 133）。 */
  issues: CoverIssue[]
  /** `themes/` 目录里的主题 id（已去掉 `THEME-` 前缀与后缀）。 */
  themeFiles: string[]
}

/**
 * 扫描整个库（项目文档 + 全部封面 + 主题清单）。
 *
 * ⚠️ 这是**唯一的全量扫描入口**，`memj_info` / `memj_search` / `rebuild` 都用它。
 *
 * ⭐⭐ **一次磁盘扫描 + 按 options 内存过滤**（2026-09-30 改造，第二次性能修正）：
 *
 *    **① 为什么要合并**：网页首页一次并发发 7 个接口，而**每个接口各自**调一次本函数。
 *       库已长到 **900KB 文档 / 414 封面**（单次扫描 ~190ms）⇒
 *       Node 单线程把这 7 次排成一条队 ⇒ **首屏要等 4~5 秒**
 *       （实测：`/covers` 并发 4103ms、连 421B 的 `/health` 都要 2094ms，
 *       而它们单独跑只有 1000ms / 357ms）。
 *
 *    **② 为什么合并的粒度是"整个库"、而不是"每种 options 一份"**：
 *       那 7 个接口用了 **3 种 options**（`{}` / `{H}` / `{A}`），按 options 分组合并
 *       ⇒ **仍要扫 3 轮库**（实测端到端：全部 API 完成 1889ms，而单次扫描只要 ~190ms
 *       ⇒ 绝大部分时间花在"重复读同一批文件"上）。
 *       ⇒ 现在**磁盘只扫一次（永远全量）**，各调用方要的视图由 `applyScanOptions`
 *         在**内存里**过滤出来 —— ⭐ 过滤是纯内存 O(n)（<1ms），扫描是 ~190ms 的 IO。
 *
 *    **③ 为什么这样是安全的**：`scanLibrary(options)` 的**对外语义一字未变** ——
 *       调用方拿到的仍是"已按自己 options 过滤好的快照" ⇒ **38 处调用点一行不用改**。
 *       等价性全部由 `applyScanOptions` 承担（它必须逐字段对齐，见该函数的注释）。
 *
 * 🔴 **只合并"同时发生"的调用**（单个在飞登记），**扫描一结束就清空**
 *    ⇒ **不跨请求保留结果**，所以**不会**让界面看到旧数据
 *    —— 这是它与"TTL 缓存"的本质区别（本项目有「缓存导致刷新半生效」的前车之鉴）。
 * @param options - 见 `ScanOptions`（默认排除归档物与历史条目）。
 * @returns 库快照（**已按 options 过滤**）。
 */
export async function scanLibrary(options: ScanOptions = {}): Promise<LibrarySnapshot> {
  const p = inFlightScanAll ?? (inFlightScanAll = scanAllUnfiltered())
  let full: UnfilteredSnapshot
  try {
    full = await p
  } finally {
    // 🔴 **必须清**：留着就退化成"永久缓存"（写操作之后界面会看到旧数据）。
    inFlightScanAll = undefined
  }
  return applyScanOptions(full, options)
}

/**
 * 按 options 把**全量扫描结果**过滤成调用方要的视图。
 *
 * 🔴🔴 **本函数是"零语义变化"的全部关键**：它必须与旧实现（在扫描循环里逐条过滤）
 *    **在每个字段上逐一对齐**，否则 38 处调用点会看到不同的库。三处必须特别小心：
 *
 *     · **项目排序**：旧实现是"**先过滤、再排序**"（`projects.sort` 只作用于已收集的那些）
 *       ⇒ 这里也必须先过滤再排 —— 不能"对全量排完再过滤"（`byUpdatedDesc` 的空串兜底
 *       比较会因此变序）；
 *     · ⭐ **`themeIds` 必须从【过滤后的 covers】推导**：旧实现的 `themeIdSet` 只遍历
 *       **已过滤**的 covers ⇒ 若在这里遍历全量，默认视图会**冒出"只在归档/历史封面里
 *       出现过的主题"**（数字与列表都会变，正是本项目最忌讳的"数字悄悄变"）；
 *     · **`issues` 不过滤**（决策 133：归档封面的硬校验问题照报，保持硬校验一致）。
 * @param full - `scanAllUnfiltered()` 的结果。
 * @param options - 见 `ScanOptions`。
 * @returns 库快照。
 */
function applyScanOptions(full: UnfilteredSnapshot, options: ScanOptions): LibrarySnapshot {
  const includeArchived = options.includeArchived === true
  const includeHistory = options.includeHistory === true
  // ⭐ 先过滤、再排序（与旧实现一致）。
  const projects = includeArchived
    ? [...full.projects]
    : full.projects.filter((p) => p.frontmatter.archivedAt === '')
  projects.sort(byUpdatedDesc)
  const covers = full.covers.filter(
    (c) =>
      (includeArchived || c.cover.archivedAt === '') && (includeHistory || c.cover.kind !== 'history'),
  )
  const themeIdSet = new Set<string>()
  for (const c of covers) for (const t of c.cover.theme) themeIdSet.add(t)
  for (const id of full.themeFiles) if (id !== '') themeIdSet.add(id)
  return { projects, covers, issues: full.issues, themeIds: [...themeIdSet].sort() }
}

/**
 * `scanLibrary` 的**未过滤**实现 —— 真正读盘的扫描。
 *
 * 🔴 **它不做任何 options 过滤**（全收：含归档项目、含归档封面、含 history 封面）；
 *    过滤是 `applyScanOptions` 的事。
 * ⚠️ **不要直接调它**（绕过合并 ⇒ 首页又变回多次扫描）；只有 `scanLibrary` 该调。
 * @returns 未过滤的扫描结果。
 */
async function scanAllUnfiltered(): Promise<UnfilteredSnapshot> {
  const projects: ProjectRecord[] = []
  const covers: ParsedCover[] = []
  const issues: CoverIssue[] = []

  const files = await listFiles(projectsDir(), (n) => n.endsWith(MD_SUFFIX))
  for (const file of files) {
    const id = projectIdFromFile(file)
    if (id === undefined) continue
    const text = (await readTextIfExists(join(projectsDir(), file))) ?? ''
    const { data } = splitFrontmatter(text)
    const frontmatter = normalizeProjectFrontmatter(data, id)
    // ⭐ **全收**（含归档项目）—— 归档过滤交给 `applyScanOptions`。
    projects.push({ id, frontmatter, text })

    // 🔴🔴 **无论项目是否归档，都必须解析它的封面**（判据一字未改）：
    //     用户明确裁定「**归档项目时，旗下知识不归档**」，而**封面物理上就存在这个项目文档里**
    //     ⇒ 若按"归档项目就跳过整个文档"来做，它旗下的封面会**一起消失**，正好与要求相反。
    //     ⇒ ⭐ **项目层的过滤与封面层的过滤是两件独立的事**，现在分别在 `applyScanOptions`
    //       里各做各的（原来是在这里各写一个条件）。
    const parsed = parseCovers(text, file)
    // ⭐ **全收**（含归档封面与 `history` 封面）—— 同样交给 `applyScanOptions`。
    covers.push(...parsed.covers)
    // ⚠️ `issues` **不过滤**：归档封面的硬校验问题照报（决策 133：硬校验保持一致）。
    issues.push(...parsed.issues)
  }

  // ⚠️ **这里不排序**：项目排序发生在 `applyScanOptions` 的"**过滤之后**"
  //    —— 必须与旧实现同序（旧实现只对"已收集的项目"排序，空串兜底比较会因集合不同而变序）。

  // 主题 id 的"文件侧"来源（`themes/` 目录）—— ⚠️ **封面侧的主题**由
  // `applyScanOptions` 在**过滤后**并进来（否则默认视图会冒出只在归档/历史封面里出现过的主题）。
  const themeFiles: string[] = []
  const themeFileNames = await listFiles(
    themesDir(),
    (n) => n.startsWith('THEME-') && n.endsWith(MD_SUFFIX),
  )
  for (const f of themeFileNames) {
    const id = f.slice('THEME-'.length, -MD_SUFFIX.length)
    if (id !== '') themeFiles.push(id)
  }

  return { projects, covers, issues, themeFiles }
}

/**
 * 读某个内部条目的正文文档（§3.3）。
 *
 * @param ref - 封面上的 ref。
 * @param ext - 是否外部引用。
 * @returns 条目文档（frontmatter + 正文 + 标题）；取不到时 `undefined`。
 */
export async function loadEntryDoc(ref: string, ext: boolean): Promise<EntryDoc | undefined> {
  const abs = resolveRef(ref, ext)
  if (abs === undefined) return undefined
  const text = await readTextIfExists(abs)
  if (text === undefined) return undefined

  const { data, body } = splitFrontmatter(text)
  const fm = (data ?? {}) as Record<string, unknown>
  const frontmatter: EntryFrontmatter = {
    id: typeof fm['id'] === 'string' ? fm['id'] : '',
    slug: typeof fm['slug'] === 'string' ? fm['slug'] : '',
    project: typeof fm['project'] === 'string' ? fm['project'] : '',
    theme: toStringArray(fm['theme']),
    global: fm['global'] === true || fm['global'] === 'true',
    // ⭐ `kind` 是受控词表：非法值落成空串（= 未分类），与"没填"同义。
    kind: isEntryKind(fm['kind']) ? fm['kind'] : '',
    tags: toStringArray(fm['tags']),
    // ⭐ `title` 是 frontmatter 的字段（决策 98）。
    title: typeof fm['title'] === 'string' ? fm['title'] : '',
    desc: typeof fm['desc'] === 'string' ? fm['desc'] : '',
    // ⭐ 时间字段（决策 119）。
    //    🔴 **这里曾漏掉**（2026-09-18 实测发现）：`EntryFrontmatter` 里它们是必填，
    //    但本函数是**手工构造**该对象 ⇒ 漏了不报错、运行时变 `undefined`
    //    ⇒ 详情页 API 收到空值、页面上时间恒显示"（空）"。
    //    ⚠️ 这正是本项目反复踩的"**手工构造点**"老坑（知识条目 `d65742af`）：
    //    类型系统能兜住"构造对象"，兜不住"逐个字段手抄"。
    createdAt: typeof fm['createdAt'] === 'string' ? fm['createdAt'] : '',
    updatedAt: typeof fm['updatedAt'] === 'string' ? fm['updatedAt'] : '',
    // ⭐ 归档时间（决策 133）——🔴 **同属上面那个"手工构造点"**：
    //    漏了它不报错、运行时只是 undefined（本项目老坑，见该对象上方注释）。
    archivedAt: typeof fm['archivedAt'] === 'string' ? fm['archivedAt'] : '',
  }
  const source = fm['source']
  if (typeof source === 'object' && source !== null) {
    const s = source as Record<string, unknown>
    frontmatter.source = {
      ...(typeof s['sessionId'] === 'string' ? { sessionId: s['sessionId'] } : {}),
      ...(typeof s['from'] === 'string' ? { from: s['from'] } : {}),
    }
  }

  // ⭐ **标题优先取 frontmatter 的 `title`**（决策 98，权威来源）；
  //    ⚠️ 取不到时**回退到正文**（内部条目 `###` / 外部引用 `#`）——
  //    这条回退路径**只为存量文档保留**，迁移补全 `title` 后就不再走到。
  const fallback = extractTitle(body, ext ? '#' : '###')
  const title = frontmatter.title.trim() !== '' ? frontmatter.title : fallback
  return { frontmatter, body, title }
}

/**
 * 把封面 + 正文落盘成内部条目文档（§3.3）。
 *
 * 正文结构固定为「### 标题 / 规则 / Why / How to apply」，由调用方（LLM）给出。
 * @param cover - 封面（提供 id/project/theme/global/tags/desc）。
 * @param slug - 英文短名。
 * @param body - 正文。
 * @param source - 溯源信息。
 * @returns 库内相对路径（即封面的 `ref`）。
 */
export async function writeEntryDoc(
  cover: Cover,
  slug: string,
  body: string,
  source?: { sessionId?: string; from?: string },
): Promise<string> {
  // 🔴 **路径拼法只允许有一处实现**（`paths.entryRelPath`）。
  // 之前这里与 handoff.ts 各写一遍同样的模板串，一旦两处漂移，
  // 封面上的 `ref` 就会指向一个不存在的文件——而正文写到了另一个文件名上。
  const rel = entryRelPath(slug, cover.id)
  const abs = join(entriesDir(), entryFileName(slug, cover.id))

  const fmLines: Array<readonly [string, string]> = [
    ['id', yamlScalar(cover.id)],
    ['slug', yamlScalar(slug)],
    ['project', yamlScalar(cover.project)],
    ['theme', renderYamlArray(cover.theme)],
    ['global', cover.global ? 'true' : 'false'],
    // ⚠️ `kind` 留空时**不写这一行**（"未分类"就是字段缺席）。
    //    🔴 判据必须是 isEntryKind，不能写 `cover.kind !== ''`：
    //    调用方可能根本没给 kind 键（undefined），那样会把 `kind: undefined` 写进去。
    ...(isEntryKind(cover.kind) ? ([['kind', cover.kind]] as Array<readonly [string, string]>) : []),
    ['tags', renderYamlArray(cover.tags)],
    // ⭐ `title`（决策 98）：与封面同值。
    ['title', yamlScalar(cover.title)],
    ['desc', yamlScalar(cover.desc)],
  ]
  if (source !== undefined && (source.sessionId !== undefined || source.from !== undefined)) {
    fmLines.push(['source:', ''])
    if (source.sessionId !== undefined) fmLines.push(['  sessionId', yamlScalar(source.sessionId)])
    if (source.from !== undefined) fmLines.push(['  from', yamlScalar(source.from)])
  }
  // ⭐ 时间（决策 119）：新建条目时由调用方给（同一对值）。
  if ((cover.createdAt ?? '') !== '') fmLines.push(['createdAt', yamlScalar(cover.createdAt)])
  if ((cover.updatedAt ?? '') !== '') fmLines.push(['updatedAt', yamlScalar(cover.updatedAt)])

  const text = `${renderFrontmatter(fmLines)}\n${body.trimEnd()}\n`
  await writeTextAtomic(abs, text)
  return rel
}

/**
 * 写入（或更新）一份项目文档（§3.1 / §7.1 步骤 2–3）。
 *
 * 结构：frontmatter + 一级标题 + 六节叙事 + 「沉淀知识」节（封面清单）。
 *
 * 🔴 **`orphans` 必须原样写回**（§8.7④ / §12-79）：那是"解析失败、但原文还在"的封面块。
 * 本函数只渲染能解析成功的 `covers`；若不管 `orphans`，它们会被**静默删除**
 * ——表现为"人手改坏一个字符，下次 handoff 就把它弄丢了"。
 * 写回后它们仍是原样，直到人把它改对（届时自然被解析、重复块消失）。
 * @param id - 项目 id。
 * @param frontmatter - 项目 frontmatter。
 * @param narrative - 六节叙事正文（**纯叙事**，不含 frontmatter / 标题 / 「沉淀知识」节）。
 *   ⚠️ 传"整份文档"会导致 frontmatter 与标题被写两遍——请用 `narrativeFromProjectText()`。
 * @param covers - 该项目的全部封面（**写文档时以本次为准**）。
 * @param orphans - 解析失败的封面块原文（原样保留，**不得丢弃**）。
 * @returns 文档全文（便于调用方复核）。
 */
export async function writeProjectDoc(
  id: string,
  frontmatter: ProjectFrontmatter,
  narrative: string,
  covers: readonly Cover[],
  orphans: readonly string[] = [],
): Promise<string> {
  // ⭐ 时间（决策 119）：**调用方没给就继承已有的**。
  //    🔴 为什么必须继承：`rebuildDerivedLayers` 与若干事后路径都会**重写整个
  //    frontmatter**——若不继承，每跑一次 rebuild 就会把项目的时间**擦成空**。
  //    ⚠️ 而 `createdAt` 一旦有值**永不变**；`updatedAt` 由"真正改内容"的路径显式传入。
  //
  // 🔴 **补一个"存量为空"的兜底**（2026-09-18，与 `writeThemeDoc` 对称修复）：
  //    旧写法在"文件已存在但时间字段为空"时给出**空串** ⇒ **永远填不上**。
  //    ⇒ 现在：**已有值优先；两边都没有就补 `now`**（只在原本为空时才补，
  //      仍然满足 `createdAt` 不可变）。
  const existingFm = (await loadProjectDoc(id))?.frontmatter
  const nowIso = new Date().toISOString()
  const createdAt = (frontmatter.createdAt ?? '') !== ''
    ? frontmatter.createdAt
    : ((existingFm?.createdAt ?? '') !== '' ? (existingFm?.createdAt ?? '') : nowIso)
  const updatedAt = (frontmatter.updatedAt ?? '') !== ''
    ? frontmatter.updatedAt
    : ((existingFm?.updatedAt ?? '') !== '' ? (existingFm?.updatedAt ?? '') : createdAt)

  const fm = renderFrontmatter([
    ['project', yamlScalar(frontmatter.project)],
    // ⭐ 显示名（决策 115）：**空就不写这一行**（"没设置"就是字段缺席，
    //    与 `kind` 的处理一致——避免往库里写一堆 `title: ''`）。
    //    ⚠️ `?? ''` 是**容错**：调用方（尤其旧测试夹具/脚本）可能没给这个字段，
    //    直接 `yamlScalar(undefined)` 会**崩在 `value.length`**（实测踩到）。
    ...((frontmatter.title ?? '') !== ''
      ? ([['title', yamlScalar(frontmatter.title)]] as Array<readonly [string, string]>)
      : []),
    ['desc', yamlScalar(frontmatter.desc)],
    ['themes', renderYamlArray(frontmatter.themes)],
    // ⭐ 时间（决策 119）：空就不写行。
    ...(createdAt !== '' ? ([['createdAt', yamlScalar(createdAt)]] as Array<readonly [string, string]>) : []),
    ...(updatedAt !== '' ? ([['updatedAt', yamlScalar(updatedAt)]] as Array<readonly [string, string]>) : []),
    // ⭐ 归档时间（决策 133）：空就不写行（= 活跃）。⚠️ 必须**从 frontmatter 透传**——
    //    否则任何一次重写项目文档（改描述、rename、rebuild……）都会**把归档状态擦掉**，
    //    表现为"归档过的项目自己又冒出来了"。
    ...((frontmatter.archivedAt ?? '') !== ''
      ? ([['archivedAt', yamlScalar(frontmatter.archivedAt)]] as Array<readonly [string, string]>)
      : []),
    // 🔴 **`sections` 行已于 2026-10-05 删除**（用户裁定：模板走 md 之后，
    //    封面那行成了"节名的最后一份副本"，而权威早已在正文）。
    //    ⚠️ 只从本函数删**不够** —— `rebuildDerivedLayers()` 的字段表里
    //       也有一段同样的渲染（两处必须同步，否则 rebuild 会把老行留着）。
    // ⭐ 建文档时用的模板 id（决策 204）：空就不写行。
    //    ⚠️ **必须从 frontmatter 透传**（同 `archivedAt` 的理由）——
    //    否则任何一次重写（改描述 / rename / rebuild）都会**把这个记录擦掉**。
    ...((frontmatter.template ?? '') !== ''
      ? ([['template', yamlScalar(frontmatter.template)]] as Array<readonly [string, string]>)
      : []),
    // ⭐⭐ 自动截断目标节（决策 204 / 206）：**数组**，**空就不写行**。
    //    🔴 **只有"自定义模板且声明了截断节"时才有值** ⇒ 老文档与默认模板
    //    都不会被写这一行（**零 diff**）。
    //    ⚠️ 写成 `truncateSections: [A, B]`（与 `sections`/`themes` 同一套 `renderYamlArray`）。
    ...((frontmatter.truncateSections ?? []).length > 0
      ? ([['truncateSections', renderYamlArray(frontmatter.truncateSections ?? [])]] as Array<readonly [string, string]>)
      : []),
  ])

  // ⭐ 合法封面 + 原样保留的孤儿块，一起构成封面区。
  const blocks = covers.map((c) => renderCover(c))
  const orphanBlocks = orphans.map((o) => o.trim()).filter((o) => o !== '')
  const coverBlocks = [...blocks, ...orphanBlocks].join('\n\n')
  const parts = [
    fm,
    `# HANDOFF — ${frontmatter.project}`,
    '',
    `<!-- 文件位置：~/.dsh-memj/projects/HANDOFF-${safeName(id)}.md -->`,
    '',
    narrative.trim(),
    '',
    KNOWLEDGE_SECTION,
    '',
    coverBlocks,
    '',
  ]
  const text = parts.join('\n')
  await writeTextAtomic(projectDocPath(id), text)
  return text
}

/**
 * 按**已存在的 `ref`** 就地同步条目文档（⭐ 可连同正文一起替换）。
 *
 * 🔴 **为什么不复用 `writeEntryDoc`**：那个函数按 `<slug>-<uuid8>.md` **重算路径**。
 * 若封面上的 `ref` 与重算结果不一致（人手改过文件名、或 slug 后来变了），
 * 就会写出**第二个文件**，而旧文件留在原地成孤儿——封面仍指着旧的，正文却写到了新的。
 * 本函数严格按 `ref` 定位，**路径绝不漂移**。
 *
 * ⭐ **`body` 的作用**（决策 104 的覆盖路径）：
 * - **省略** ⇒ 只同步 frontmatter，**保留原正文**（原有行为，`memj_rebuild` 用）；
 * - **给了** ⇒ **连正文一起替换**（`overwrite: true` 的覆盖用）。
 * ⚠️ 两者共用同一份 frontmatter 拼装逻辑——避免"两处各写一遍"必然漂移（本项目的老坑）。
 * @param cover - 封面（提供要同步的元数据；`ref` 决定写到哪个文件）。
 * @param body - 新正文；省略时保留原正文。
 * @returns 是否成功写入（文件不存在时 false）。
 */
export async function syncEntryFrontmatter(cover: Cover, body?: string): Promise<boolean> {
  const abs = resolveRef(cover.ref, cover.ext)
  if (abs === undefined) return false
  const text = await readTextIfExists(abs)
  if (text === undefined) return false

  const { data, body: oldBody } = splitFrontmatter(text)
  const fm = (data ?? {}) as Record<string, unknown>
  const slug = typeof fm['slug'] === 'string' && fm['slug'] !== '' ? fm['slug'] : 'entry'

  const fmLines: Array<readonly [string, string]> = [
    ['id', yamlScalar(cover.id)],
    ['slug', yamlScalar(slug)],
    ['project', yamlScalar(cover.project)],
    ['theme', renderYamlArray(cover.theme)],
    ['global', cover.global ? 'true' : 'false'],
    // ⚠️ `kind` 留空时**不写这一行**（"未分类"就是字段缺席）。
    //    🔴 判据必须是 isEntryKind（同 `writeEntryDoc`，理由见那里）。
    ...(isEntryKind(cover.kind) ? ([['kind', cover.kind]] as Array<readonly [string, string]>) : []),
    ['tags', renderYamlArray(cover.tags)],
    // ⭐ `title`（决策 98）：与封面同值。
    ['title', yamlScalar(cover.title)],
    ['desc', yamlScalar(cover.desc)],
  ]
  const source = fm['source']
  if (typeof source === 'object' && source !== null) {
    const s = source as Record<string, unknown>
    if (typeof s['sessionId'] === 'string' || typeof s['from'] === 'string') {
      fmLines.push(['source:', ''])
      if (typeof s['sessionId'] === 'string') fmLines.push(['  sessionId', yamlScalar(s['sessionId'])])
      if (typeof s['from'] === 'string') fmLines.push(['  from', yamlScalar(s['from'])])
    }
  }
  // ⭐ 时间（决策 119）：**封面是权威来源**（"两处都写"）；
  //    封面没给就**继承正文文件里已有的**（避免重写时擦掉）。
  const createdAt = (cover.createdAt ?? '') !== ''
    ? cover.createdAt
    : (typeof fm['createdAt'] === 'string' ? fm['createdAt'] : '')
  const updatedAt = (cover.updatedAt ?? '') !== ''
    ? cover.updatedAt
    : (typeof fm['updatedAt'] === 'string' ? fm['updatedAt'] : '')
  if (createdAt !== '') fmLines.push(['createdAt', yamlScalar(createdAt)])
  if (updatedAt !== '') fmLines.push(['updatedAt', yamlScalar(updatedAt)])
  // ⭐ 归档时间（决策 133）：**封面是权威来源**（同 `global` 的"两处都写"）。
  //    ⚠️ 这里**不做"封面没给就继承正文"**——归档是**可撤销的布尔式状态**：
  //        `cover.archivedAt` 为空就是"已恢复"，必须**把正文里那行清掉**；
  //        若照时间字段那样继承，恢复后正文里的旧 archivedAt 会被写入回来，
  //        于是"恢复不了"（封面活跃、正文却说已归档 ⇒ rebuild 报不一致）。
  if ((cover.archivedAt ?? '') !== '') fmLines.push(['archivedAt', yamlScalar(cover.archivedAt)])

  const outBody = body !== undefined ? body : oldBody
  await writeTextAtomic(abs, `${renderFrontmatter(fmLines)}\n${outBody.replace(/^\n+/, '')}`)
  return true
}

/**
 * 读某个项目文档并把它的叙事与封面拆开。
 *
 * 「叙事」= 去掉封面围栏后的**叙事节**文本（**节数由该文档自己的模板决定**，
 * 不是固定六节；保留「沉淀知识」节标题，供写回时重建结构）。
 * @param id - 项目 id。
 * @returns 文档信息；不存在时 `undefined`。
 */
export async function loadProjectDoc(id: string): Promise<
  | {
      frontmatter: ProjectFrontmatter
      /** ⭐ **纯叙事**（不含 frontmatter / 一级标题 / 封面 / 沉淀知识节）。 */
      narrative: string
      covers: Cover[]
      issues: CoverIssue[]
      /** ⭐ 解析失败但**原文仍在**的封面块（写回时必须原样带上，§12-79）。 */
      orphans: string[]
      text: string
    }
  | undefined
> {
  const text = await readTextIfExists(projectDocPath(id))
  if (text === undefined) return undefined
  const { data } = splitFrontmatter(text)
  const { covers, issues, orphans } = parseCovers(text, `HANDOFF-${id}.md`)

  // 🔴 **`narrative` 必须是纯叙事**（§8.7② / §12-74）：它会被直接交给 `writeProjectDoc`，
  //    而后者**自己会生成** frontmatter、一级标题与「沉淀知识」节。
  //    早先这里只剥了封面块，于是 `memj_promote` / `linkCoverToTheme` 两条路径
  //    把 frontmatter 与标题**各写了两遍**（实测）。剥离逻辑现收在 `narrativeFromProjectText`。
  const narrative = narrativeFromProjectText(text)

  return {
    frontmatter: normalizeProjectFrontmatter(data, id),
    narrative,
    covers: covers.map((c) => c.cover),
    issues,
    orphans,
    text,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 人侧修复写通道（§8.6，决策 88 / 89 / 91）
// ───────────────────────────────────────────────────────────────────────────

/** 一次修复请求的结果。 */
export interface FixResult {
  ok: boolean
  /** 失败原因（面向人，可直接显示）。 */
  error?: string
  /** 硬校验发现的问题（决策 62：一次报全部）。 */
  issues?: string[]
}

/**
 * ⭐ **就地修复一个封面块**（§8.6）。
 *
 * 🔴 **三条硬约束**（决策 88 / 91）：
 *  1. **只做局部块替换**——绝不整篇重渲染。否则同文档里其它非法封面块会被静默删掉
 *     （实测见 `verify/probe-memj-invalid-cover-loss.mjs`）。
 *  2. **必须过硬校验**（`validateCoverShape`，零 LLM）；不通过则**拒绝写入，绝不半写**（决策 72）。
 *  3. **只改已存在封面的字段**——不新增、不删除封面；不改正文与叙事。
 *
 * @param file - 项目文档文件名（如 `HANDOFF-dsh-memj.md`）。
 * @param startLine - 目标块起始行（1 起，闭区间）。
 * @param endLine - 目标块结束行（1 起，闭区间）。
 * @param cover - 修复后的封面。
 * @param rawKind - 原始 `kind` 字符串（用于报出"填了非法值"，见 `validateCoverShape`）。
 * @returns 结果；失败时带原因与逐条问题。
 */
export async function fixCoverBlock(
  file: string,
  startLine: number,
  endLine: number,
  cover: Cover,
  rawKind?: string,
): Promise<FixResult> {
  const projectId = projectIdFromFile(file)
  if (projectId === undefined) return { ok: false, error: `不是项目文档名：${file}` }

  const path = projectDocPath(projectId)
  const text = await readTextIfExists(path)
  if (text === undefined) return { ok: false, error: `项目文档不存在：${file}` }

  // ── 1. 硬校验（零 LLM）──
  //    ⭐ **方案 A**：把"该封面是否在提名表里"喂给校验器——待批的纯全局知识
  //    在批准前 `global` 仍是 false，不豁免会被判三空而修不了。
  const pendingIds = new Set((await readNominations()).map((n) => n.entryId))
  const shapeIssues = validateCoverShape(cover, rawKind, pendingIds.has(cover.id))
  if (shapeIssues.length > 0) return { ok: false, error: '封面校验未通过', issues: shapeIssues }

  // ── 2. id 唯一性（§12-77：允许改 id，但必须库内唯一）──
  const snapshot = await scanLibrary()
  const dup = snapshot.covers.find(
    (c) => c.cover.id === cover.id && !(c.sourceFile === file && c.line === startLine),
  )
  if (dup !== undefined) {
    return { ok: false, error: '封面校验未通过', issues: [`id 在库内已存在：${cover.id}（${dup.sourceFile}）`] }
  }

  // ── 3. 确认目标区间确实是"封面块"（防止行号漂移导致误改正文）──
  const parsed = parseCovers(text, file)
  const target = parsed.blocks.find((b) => b.startLine === startLine && b.endLine === endLine)
  if (target === undefined) {
    return {
      ok: false,
      error: `定位失败：${file}:${startLine}-${endLine} 不是一个封面块（文档可能已被改动，请刷新重试）`,
    }
  }

  // ── 4. 局部替换（**只换这一块**）──
  //    ⭐ 时间继承（决策 119）：修复表单**不带**这两个字段 ⇒ 从原文里取
  //    （"修复一个非法封面"**不该改**它的创建/更新时间）。
  const original = parsed.covers.find((c) => c.cover.id === cover.id)?.cover
  const repaired: Cover = {
    ...cover,
    createdAt: (cover.createdAt ?? '') !== '' ? cover.createdAt : (original?.createdAt ?? ''),
    updatedAt: (cover.updatedAt ?? '') !== '' ? cover.updatedAt : (original?.updatedAt ?? ''),
    // ⭐ 归档时间（决策 133）：**同上面两条，从原文继承**——
    //    "修复一个非法封面"绝不该顺带改变它的归档状态。
    //    ⚠️ 这里没有"修复表单会不带它 ⇒ 传空串就继承"的宽松余地：
    //       空串是**合法且有意义的值**（= 活跃），所以判据必须看
    //       "**表单有没有给**"而不是"给的值空不空"……
    //       ⇒ 但修复表单**永远不给** archivedAt（它不在表单字段里），
    //         所以这里直接取原文的值就是对的。
    archivedAt: original?.archivedAt ?? '',
  }
  const next = replaceBlockAtLines(text, startLine, endLine, renderCover(repaired))

  // ── 5. 复核：替换后应仍只多不少地保留其它块 ──
  const after = parseCovers(next, file)
  if (after.blocks.length !== parsed.blocks.length) {
    return {
      ok: false,
      error: `写入被拒绝：块数将从 ${parsed.blocks.length} 变为 ${after.blocks.length}（只允许替换，不允许增删）`,
    }
  }

  await writeTextAtomic(path, next)

  // ── 6. 内部条目同步 frontmatter（"两处都写"，§3.3）──
  if (!repaired.ext) await syncEntryFrontmatter(repaired)

  await rebuildDerivedLayers()
  return { ok: true }
}

/**
 * ⭐ **重填一个断链外部引用的 `ref`**（决策 89）。
 *
 * ⚠️ **只能改 `ref`**（§12-78：不允许改 `ext`）——`ext` 决定 `ref` 的解析方式，
 * 互转等于换一种知识形态，超出"修断链"的范围。
 * ⚠️ 写前**校验目标路径当前确实存在**；**不自动猜路径、不自动修复**。
 * @param file - 项目文档文件名。
 * @param startLine - 目标块起始行（1 起）。
 * @param endLine - 目标块结束行（1 起）。
 * @param ref - 新的 `ref` 路径。
 * @returns 结果。
 */
export async function fixExternalRef(
  file: string,
  startLine: number,
  endLine: number,
  ref: string,
): Promise<FixResult> {
  const projectId = projectIdFromFile(file)
  if (projectId === undefined) return { ok: false, error: `不是项目文档名：${file}` }
  const text = await readTextIfExists(projectDocPath(projectId))
  if (text === undefined) return { ok: false, error: `项目文档不存在：${file}` }

  const nextRef = ref.trim()
  if (nextRef === '') return { ok: false, error: 'ref 不能为空' }

  // 定位该块并解析出当前封面。
  const parsed = parseCovers(text, file)
  const idx = parsed.blocks.findIndex((b) => b.startLine === startLine && b.endLine === endLine)
  if (idx === -1) {
    return { ok: false, error: `定位失败：${file}:${startLine}-${endLine} 不是封面块（可能已被改动，请刷新）` }
  }
  const lineIssues = parsed.issues.filter((i) => i.line === startLine)
  // ⚠️ 断链的封面**通常仍是合法封面**（只是目标文件没了），所以要从 covers 里找。
  const found = parsed.covers.find((c) => c.line === startLine)
  if (found === undefined) {
    return {
      ok: false,
      error: '该块不是可解析的封面（断链修复只针对格式合法的外部引用）',
      issues: lineIssues.map((i) => i.reason),
    }
  }
  if (!found.cover.ext) return { ok: false, error: '该封面不是外部引用（ext: true），无需重填路径' }

  // ⭐ 目标路径必须当前存在。
  const abs = resolveRef(nextRef, true)
  if (abs === undefined || !existsSync(abs)) {
    return { ok: false, error: `目标文件不存在：${nextRef}` }
  }

  const nextCover: Cover = { ...found.cover, ref: nextRef, ext: true }
  const nextText = replaceBlockAtLines(text, startLine, endLine, renderCover(nextCover))
  const after = parseCovers(nextText, file)
  if (after.blocks.length !== parsed.blocks.length) {
    return { ok: false, error: '写入被拒绝：块数发生变化（只允许替换）' }
  }

  await writeTextAtomic(projectDocPath(projectId), nextText)
  await rebuildDerivedLayers()
  return { ok: true }
}

/** 读主题文档的 frontmatter（主要为保住 `desc`）。 */export async function loadThemeFrontmatter(themeId: string): Promise<ThemeFrontmatter | undefined> {
  const text = await readTextIfExists(themeDocPath(themeId))
  if (text === undefined) return undefined
  const { data } = splitFrontmatter(text)
  if (data === null) return { theme: themeId, title: '', desc: '', createdAt: '', updatedAt: '' }
  return {
    theme: typeof data['theme'] === 'string' && data['theme'].trim() !== ''
      ? data['theme'].trim()
      : themeId,
    // ⭐ 显示名（决策 115）：可空。
    title: typeof data['title'] === 'string' ? data['title'] : '',
    desc: typeof data['desc'] === 'string' ? data['desc'] : '',
    // ⭐ 时间（决策 119）：老数据没有 ⇒ 空串。
    createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : '',
    updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : '',
  }
}

// ───────────────────────────────────────────────────────────────────────────
// ⭐ 删除原语（决策 114：封面删改通道）
//
// 🔴 **为什么必须在 store 里**：本模块是**唯一落盘处**（文件头约定）。
//    删改通道的实现在 `edit.ts`，但它**只能通过这里**动文件。
// ───────────────────────────────────────────────────────────────────────────

/**
 * 删掉一个项目的 handoff 文档（**连它的全部封面一起消失**）。
 *
 * 🔴 **这是不可逆操作**——调用方必须先确认"该项目旗下已无知识"
 * （`edit.ts` 的 `deleteProject` 会强制这一条）。
 * @param projectId - 项目 id。
 * @returns 是否真的删掉了（文件本来就不存在时 `false`）。
 */
export async function deleteProjectDoc(projectId: string): Promise<boolean> {
  const path = projectDocPath(projectId)
  if (!existsSync(path)) return false
  await removeFile(path)
  return true
}

/** 删掉一个主题的派生文档。⚠️ 派生文档会被下次 rebuild 重新生成，除非封面也不再提它。 */
export async function deleteThemeDoc(themeId: string): Promise<boolean> {
  const path = themeDocPath(themeId)
  if (!existsSync(path)) return false
  await removeFile(path)
  return true
}

/**
 * 删掉一个内部条目的**正文文件**（封面由调用方另行移除）。
 *
 * ⚠️ **只删内部条目**：外部引用（`ext: true`）的正文在库外，**不属于 memj**，
 * 删封面即可，绝不能去删人家的文件。
 * @param ref - 封面上的 `ref`。
 * @param ext - 是否外部引用。
 * @returns 是否真的删掉了。
 */
export async function deleteEntryFile(ref: string, ext: boolean): Promise<boolean> {
  if (ext) return false
  const abs = resolveRef(ref, false)
  if (abs === undefined || !existsSync(abs)) return false
  await removeFile(abs)
  return true
}

/**
 * 建（或更新）一个主题文档（§4.4）。
 *
 * ⚠️ **已存在时 `desc` 不被覆盖**（§4.2：已存在的主题不要重写它的 desc）——
 * 除非显式传入新的非空 desc。
 * @param themeId - 主题 id。
 * @param desc - 主题描述（新建时必填）。
 * @param covers - 该主题下的全部封面。
 * @param projects - 覆盖的项目（id + desc）。
 * @returns 文档全文。
 */
/**
 * 建（或更新）一个主题文档（§4.4）。
 *
 * ⚠️ **默认 `desc` 优先保留已有的**（§4.2：已存在的主题不要重写它的 desc）——
 * 这是为 **`rebuildDerivedLayers`** 设的：它每次重建都传 `''`，
 * 若不留旧的，desc 就会被清空（它没有别的来源）。
 *
 * 🔴 **但"显式改 desc"必须能覆盖**（决策 114）：`setThemeDesc` 就是干这个的。
 * ⇒ 用 `forceDesc` 区分两种意图：`rebuild` 不传（保留旧值）、
 * 改 desc 的通道传 `true`（以传入的为准）。
 * ⚠️ 一度把两者混在一起，结果 `setThemeDesc` **静默无效**（测试抓到）。
 * @param themeId - 主题 id。
 * @param desc - 主题描述（新建时必填）。
 * @param covers - 该主题下的全部封面。
 * @param projects - 覆盖的项目（id + desc）。
 * @param forceDesc - ⭐ 为真时**以传入的 desc 为准**（显式修改用）。
 * @param overrideTitle - ⭐ 显式设置显示名（决策 115）；`undefined` = 继承已有的。
 * @param overrideUpdatedAt - ⭐ 显式刷新 `updatedAt`（决策 119）；`undefined` = 继承。
 * @returns 文档全文。
 */
export async function writeThemeDoc(
  themeId: string,
  desc: string,
  covers: readonly Cover[],
  projects: ReadonlyArray<{ id: string; desc: string }>,
  forceDesc = false,
  overrideTitle?: string,
  overrideUpdatedAt?: string,
): Promise<string> {
  const existing = await loadThemeFrontmatter(themeId)
  // 🔴 desc 优先保留已有的——它没有别的来源，被清掉就得每次重写。
  //    ⚠️ 除非调用方**显式**要求改（`forceDesc`）。
  const finalDesc = forceDesc
    ? desc
    : (existing !== undefined && existing.desc !== '' ? existing.desc : desc)
  // ⭐ 显示名（决策 115）：同理——`overrideTitle` 给了就用它，否则继承已有的。
  //    ⚠️ `?? ''` 容错：旧调用方可能没给。
  const finalTitle = overrideTitle !== undefined
    ? (overrideTitle ?? '')
    : (existing?.title ?? '')
  // ⭐ 时间（决策 119）：**继承已有的**（`rebuild` 会反复重写本文件，
  //    不继承就会把时间擦掉）。`createdAt` 永不变；`updatedAt` 由显式改动的路径
  //    通过 `overrideUpdatedAt` 刷新。
  //
  // 🔴🔴 **修一个继承逻辑缺陷**（2026-09-18 实测发现，两处对称修复）：
  //    旧写法 `existing.createdAt !== '' ? 已有 : (isNew ? 现在 : '')` ——
  //    在"**文件已存在、但时间字段为空**"时给出**空串** ⇒ **永远填不上**。
  //    而存量主题（迁移前创建的）**正是这种状态** ⇒ 页面上时间恒为空。
  //    ⇒ 判据改为「**已有值优先；没有值就补 `now`**」——`isNew` 不再是必要条件。
  //    ⚠️ `createdAt` 的"不可变"约束仍然成立：**只在原来为空时**才补，
  //       有值就绝不覆盖。
  const nowIso = new Date().toISOString()
  const finalCreatedAt = (existing?.createdAt ?? '') !== ''
    ? (existing?.createdAt ?? '')
    : nowIso
  const finalUpdatedAt = overrideUpdatedAt !== undefined
    ? (overrideUpdatedAt ?? '')
    : ((existing?.updatedAt ?? '') !== '' ? (existing?.updatedAt ?? '') : finalCreatedAt)

  const fm = renderFrontmatter([
    ['theme', yamlScalar(themeId)],
    ...(finalTitle !== ''
      ? ([['title', yamlScalar(finalTitle)]] as Array<readonly [string, string]>)
      : []),
    ['desc', yamlScalar(finalDesc)],
    ...(finalCreatedAt !== ''
      ? ([['createdAt', yamlScalar(finalCreatedAt)]] as Array<readonly [string, string]>)
      : []),
    ...(finalUpdatedAt !== ''
      ? ([['updatedAt', yamlScalar(finalUpdatedAt)]] as Array<readonly [string, string]>)
      : []),
  ])

  const projectRows = projects.map((p) => {
    const d = p.desc.trim() === '' ? '_（无描述）_' : p.desc.replace(/\|/g, '\\|').replace(/\n/g, ' ')
    return `| ${p.id.replace(/\|/g, '\\|')} | ${d} |`
  })

  const parts = [
    fm,
    `# THEME — ${themeId}`,
    '',
    '> 本文件是**派生层**（投影）：内容由项目文档里的封面聚合而来，手改会在下次重建时丢失。',
    '',
    '## 覆盖的项目',
    '',
    '| 项目 id | 项目 desc |',
    '|---|---|',
    ...(projectRows.length > 0 ? projectRows : ['| _（暂无）_ | |']),
    '',
    '## 知识封面',
    '',
    covers.length > 0 ? covers.map((c) => renderCover(c)).join('\n\n') : '_（暂无封面）_',
    '',
  ]
  const text = parts.join('\n')
  await writeTextAtomic(themeDocPath(themeId), text)
  return text
}

/**
 * 重建 `GLOBAL.md`（§2.2 / §4.1）。
 *
 * ⭐ **判据（方案 A，2026-09-18）**：**只看 `global: true`**。
 * `global` 是"这条是全局知识"这个**事实**；"待批"是**流程状态**，由 `nominations.json`
 * 单独表达。两者**不再混用一个字段**。
 *
 * 🔴 **为什么改**：旧判据是 `global && !pending.has(id)` ⇒ 一条**待批**的封面
 * `global` 写着 `true`、却并不在全局层生效 ⇒ **字段本身在撒谎**，
 * 且"在队列里"被用来编码状态（本项目已记过这类坑，见知识条目「用『在队列里』编码状态」）。
 * 现在：**提名不置位、批准才置位** ⇒ `global: true` 就是"已批准"。
 *
 * 🔴 **只列封面，不掺人侧信息**（§4.1 + 决策 42）：
 * 待批清单是**给人看的状态**，只出现在 `/memj-review` 与网页 UI，
 * **不写进派生文档**——派生层是"封面索引"，语义必须单一。
 * @param covers - 全部封面。
 * @returns 文档全文。
 */
export async function writeGlobalDoc(
  covers: readonly Cover[],
): Promise<string> {
  const approved = covers.filter((c) => c.global)

  const parts = [
    '# GLOBAL — 全局层',
    '',
    '> 本文件是**派生层**（投影）：由项目文档里 `global: true`（**已批准**）的封面聚合而来。',
    '> 手改会被下次重建覆盖——要改知识就改项目文档里的封面。',
    '',
    '## 知识封面',
    '',
    approved.length > 0 ? approved.map((c) => renderCover(c)).join('\n\n') : '_（暂无）_',
    '',
  ]
  const text = parts.join('\n')
  await writeTextAtomic(globalDocPath(), text)
  return text
}

/**
 * 重建整个派生层（§7.1 步骤 6）。
 *
 * 顺序：先主题（需要各项目的 `themes:`），再 GLOBAL，最后把 `themes:` 汇总回各项目 frontmatter。
 * @returns 重建统计，便于回执与探针断言。
 */
export async function rebuildDerivedLayers(): Promise<{
  themes: number
  globalApproved: number
  projects: number
  issues: CoverIssue[]
}> {
  const snapshot = await scanLibrary()
  const pending = new Set((await readNominations()).map((n) => n.entryId))

  // ── 项目 frontmatter 的 `themes:` 汇总（§12-68：项目 → 主题的反向链接）──
  // 由「该项目下任一封面命中该主题」推出，**不需要人维护**。
  const themesByProject = new Map<string, Set<string>>()
  for (const c of snapshot.covers) {
    if (c.cover.project === '') continue
    let set = themesByProject.get(c.cover.project)
    if (set === undefined) {
      set = new Set<string>()
      themesByProject.set(c.cover.project, set)
    }
    for (const t of c.cover.theme) set.add(t)
  }

  // ── 逐主题聚合封面 ──
  const coversByTheme = new Map<string, Cover[]>()
  for (const c of snapshot.covers) {
    for (const t of c.cover.theme) {
      const list = coversByTheme.get(t)
      if (list === undefined) coversByTheme.set(t, [c.cover])
      else list.push(c.cover)
    }
  }

  for (const themeId of snapshot.themeIds) {
    const covers = coversByTheme.get(themeId) ?? []
    // 覆盖的项目：该主题下出现过封面的那些项目。
    const projectIds = new Set<string>()
    for (const c of covers) if (c.project !== '') projectIds.add(c.project)
    // ⭐ 还要并上「项目 frontmatter 里显式挂了该主题」的项目（§3.7.1 环节 B ②）。
    for (const p of snapshot.projects) {
      if (p.frontmatter.themes.includes(themeId)) projectIds.add(p.id)
    }
    const projects = [...projectIds]
      .sort()
      .map((id) => ({
        id,
        desc: snapshot.projects.find((p) => p.id === id)?.frontmatter.desc ?? '',
      }))
    await writeThemeDoc(themeId, '', covers, projects)
  }

  // ── GLOBAL ──
  await writeGlobalDoc(snapshot.covers.map((c) => c.cover))

  // ── 把汇总出的 `themes:` 写回各项目 frontmatter ──
  //
  // 🔴🔴 **必须是"以封面为准的双向同步"**（决策 114 修正）：
  //    原实现是 `new Set(p.frontmatter.themes)` **只 add 不 remove**
  //    ⇒ 一旦某主题不再被任何封面引用（**典型场景：用户删掉了那个主题**），
  //    项目 frontmatter 里那条**陈旧引用永远不会消失**。
  //    ⚠️ 后果：`snapshot.projects[].frontmatter.themes` 一直被污染，
  //    而 §3.7.3「候选主题的来源②」与派生层的"覆盖项目"表都**读它**
  //    ⇒ 已经删掉的主题会被当成"本项目仍关联的主题"。
  //    ⇒ 改为：**先移除"本项目已不再引用的主题"，再加入新汇总出的**。
  //    ⚠️ `snapshot.themeIds`（库里当前真实存在的主题）之外的一律清掉——
  //    这就是"删了主题之后陈旧引用能自愈"的关键。
  let touched = 0
  const liveThemes = new Set(snapshot.themeIds)
  for (const p of snapshot.projects) {
    const merged = new Set(
      p.frontmatter.themes.filter((t) => liveThemes.has(t)),   // ← 关键：清掉已不存在的
    )
    for (const t of themesByProject.get(p.id) ?? []) merged.add(t)
    const themes = [...merged].sort()
    const changed =
      themes.length !== p.frontmatter.themes.length ||
      themes.some((t, i) => t !== p.frontmatter.themes[i])
    if (!changed) continue
    const rest = p.text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    // ⚠️ 这里**手工重写 frontmatter**（不是走 `writeProjectDoc`），
    //    所以新增字段时**两处都要加**——漏了会把 `title` 静默丢掉。
    //
    // 🔴🔴 **2026-10-12 实测事故：这个坑又踩了一次**（本项目判据"同一事实两条维护
    //    路径 ⇒ 必须两条都查"的又一个实例）。上一轮的注释只警告了 `title`，而
    //    决策 204 之后新增的 `sections` / `truncateSections` / `template` /
    //    `archivedAt` **都不在这张表里** ⇒ 一旦某项目的 `themes:` 需要更新，
    //    重写就把它们**整行抹掉**：
    //      · 那时"节名"只能回落默认六节 ⇒ 自定义模板的文档
    //        被按默认六节理解 ⇒ 下次 handoff **插进六个默认空壳节**（实测 6 → 12 节）；
    //      · `archivedAt` 被抹 ⇒ **归档过的项目自己冒出来**（正是下面注释警告的那件事）。
    //    ⭐ 根治有两层（**都已落地，缺一不可**）：
    //      ① 本条：**把字段补全**（存量文档的安全网）；
    //      ② `docSectionsOf()`：把"节名"的权威**移到正文**（rebuild 唯一不碰的地方）
    //         —— 结构类信息从此**不依赖这张表**。
    const fm = renderFrontmatter([
      ['project', yamlScalar(p.frontmatter.project)],
      ...((p.frontmatter.title ?? '') !== ''
        ? ([['title', yamlScalar(p.frontmatter.title)]] as Array<readonly [string, string]>)
        : []),
      ['desc', yamlScalar(p.frontmatter.desc)],
      ['themes', renderYamlArray(themes)],
      // ⭐ 时间（决策 119）：**必须一起带上**——rebuild **不是**"更新"，
      //    它只是重算投影 ⇒ 两个时间都要**原样保留**。
      //    🔴 漏了这两行的后果：每跑一次 rebuild 就把项目时间**擦掉**
      //    （实测踩到：`createdAt` 与 `updatedAt` 莫名相差 51ms，就是这一处漏了）。
      ...((p.frontmatter.createdAt ?? '') !== ''
        ? ([['createdAt', yamlScalar(p.frontmatter.createdAt)]] as Array<readonly [string, string]>)
        : []),
      ...((p.frontmatter.updatedAt ?? '') !== ''
        ? ([['updatedAt', yamlScalar(p.frontmatter.updatedAt)]] as Array<readonly [string, string]>)
        : []),
      // ⭐⭐ 归档时间（决策 133）：**空就不写行**（= 活跃）。
      ...((p.frontmatter.archivedAt ?? '') !== ''
        ? ([['archivedAt', yamlScalar(p.frontmatter.archivedAt)]] as Array<readonly [string, string]>)
        : []),
      // 🔴 **`sections` 行已于 2026-10-05 删除**（见 `renderProjectFrontmatter` 的说明）。
      //    ⚠️ 它与那一处**必须同步**：字段表是"字段全集"的唯一落地处，
      //       而本项目已因"两处不同步"踩过一次真事故（决策 207 / 风险 42）。
      // ⭐ 建文档时用的模板 id（决策 204）：**空就不写行**。
      ...((p.frontmatter.template ?? '') !== ''
        ? ([['template', yamlScalar(p.frontmatter.template)]] as Array<readonly [string, string]>)
        : []),
      // ⭐⭐ 自动截断目标节（决策 204 / 206）：**空就不写行**。
      ...((p.frontmatter.truncateSections ?? []).length > 0
        ? ([['truncateSections', renderYamlArray(p.frontmatter.truncateSections ?? [])]] as Array<readonly [string, string]>)
        : []),
    ])
    await writeTextAtomic(projectDocPath(p.id), `${fm}${rest}`)
    touched += 1
  }

  const approvedCount = snapshot.covers.filter((c) => c.cover.global).length
  return {
    themes: snapshot.themeIds.length,
    globalApproved: approvedCount,
    projects: touched,
    issues: snapshot.issues,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 提名
// ───────────────────────────────────────────────────────────────────────────

/** 读提名文件；不存在或损坏时返回空数组（**不抛**）。 */
export async function readNominations(): Promise<Nomination[]> {
  const text = await readTextIfExists(nominationsPath())
  if (text === undefined || text.trim() === '') return []
  try {
    const data = JSON.parse(text) as NominationsFile
    return Array.isArray(data.nominations) ? data.nominations : []
  } catch {
    return []
  }
}

/** 写提名文件。 */
export async function writeNominations(list: readonly Nomination[]): Promise<void> {
  const data: NominationsFile = { nominations: [...list] }
  await writeTextAtomic(nominationsPath(), `${JSON.stringify(data, null, 2)}\n`)
}

/**
 * 登记一条 global 提名（**只登记，不落位**，§7.3 底线）。
 *
 * 🔴 这是安全底线：加入全局**必须由人批准**，工具只能提名。
 * 所以本函数**只写 `nominations.json`**，绝不动封面的 `global` 字段
 * ——真正的落位发生在人批准之后（`approveNomination`）。
 * @param nomination - 提名。
 */
export async function addNomination(nomination: Nomination): Promise<void> {
  const list = await readNominations()
  if (list.some((n) => n.entryId === nomination.entryId)) return
  list.push(nomination)
  await writeNominations(list)
}

/**
 * ⭐ **只从提名表移除**（不碰封面的 `global`）。
 *
 * 🔴 **为什么必须与 `approveNomination` / `rejectNomination` 分开**（方案 A）：
 * 那两者都**会改封面的 `global`**（一个置 true、一个置 false）。
 * 而有些场景只需要"清掉这条待批记录"、**不该动 `global`**——
 * 典型是"取消"与"人侧直接生效后确保不在表里"。
 * ⚠️ 早先没有这个函数，取消路径误用了 `approveNomination`，
 * 而它现在**会置 `global: true`** ⇒ 正好与"取消"相反（本函数就是为修这个而抽出的）。
 * @param entryId - 封面 id。
 * @returns 是否确实移除了（false = 本来就不在表里）。
 */
export async function removeNomination(entryId: string): Promise<boolean> {
  const list = await readNominations()
  const next = list.filter((n) => n.entryId !== entryId)
  if (next.length === list.length) return false
  await writeNominations(next)
  return true
}

/**
 * 批准一条提名：⭐ **从提名表移除，并把封面上的 `global` 置为 `true`**。
 *
 * 🔴 **方案 A（2026-09-18）的关键改动**：置位**发生在批准的这一刻**，而非提名时。
 * 早先提名就把 `global` 置 `true`、靠"在不在提名表"表示是否已批
 * ⇒ 待批期间 `global` 字段**在撒谎**（写着 true 却不在 GLOBAL 里），
 * 且用"队列成员身份"编码状态（本项目已记过这类坑）。
 * ⇒ 现在 `global: true` 的语义**唯一**："这条是已批准的全局知识"。
 *
 * 批准后必须重建派生层，GLOBAL.md 才会收录它。
 * @param entryId - 封面 id。
 * @returns 是否确实批准了（false = 本来就没有这条提名）。
 */
export async function approveNomination(entryId: string): Promise<boolean> {
  const list = await readNominations()
  const next = list.filter((n) => n.entryId !== entryId)
  if (next.length === list.length) return false
  // ⭐ **先置位、再销提名**：若置位失败，提名仍在表里（人可重试），不会静默丢掉它。
  await setCoverGlobalFlag(entryId, true)
  await writeNominations(next)
  return true
}

/**
 * 把某个封面的 `global` 置为目标值（**只动封面与条目 frontmatter，不碰提名表**）。
 *
 * ⚠️ 抽成一个函数，是因为**批准**与**取消/否决**两条路都要改这个字段——
 * 而本项目的老坑正是"同一件事写两处、必然漂移"。
 * @param entryId - 封面 id。
 * @param value - 目标值。
 * @returns 是否确实改了（false = 没找到 / 值本来就对）。
 */
async function setCoverGlobalFlag(entryId: string, value: boolean): Promise<boolean> {
  const snapshot = await scanLibrary()
  const found = snapshot.covers.find((c) => c.cover.id === entryId)
  if (found === undefined || found.cover.project === '') return false
  const doc = await loadProjectDoc(found.cover.project)
  if (doc === undefined) return false

  let changed = false
  const covers = doc.covers.map((c) => {
    if (c.id !== entryId || c.global === value) return c
    changed = true
    return { ...c, global: value }
  })
  if (!changed) return false

  await writeProjectDoc(found.cover.project, doc.frontmatter, doc.narrative, covers, doc.orphans)
  // 同步条目 frontmatter（"两处都写"，§3.3）。
  const updated = covers.find((c) => c.id === entryId)
  if (updated !== undefined && !updated.ext) await syncEntryFrontmatter(updated)
  return true
}

/**
 * 否决一条提名：⭐ **从提名表移除**（并防御性地把封面的 `global` 置回 `false`）。
 *
 * 🔴 **方案 A（2026-09-18）后的语义简化**：
 * 现在提名**不置位**，所以正常路径下被否决的封面 `global` 本来就是 `false`。
 * 但**存量数据**（旧版提名时置过 `true`）可能残留 `global: true`，
 * 而 GLOBAL 收录判据现在**只看 `global`** ⇒ 若不清，一否决就会**被收进 GLOBAL**
 * （这正是旧版"否决 = 批准"那个 bug 的同类反扑）。
 * ⇒ 保留这一步**防御性清理**，不因为"正常路径不需要"就删掉。
 *
 * ⚠️ **顺序**：先清 `global`、再销提名。反了会留下"global:true 且不在表里"的瞬间，
 * 若此刻重建派生层，它就会被当成已批准。
 * @param entryId - 封面 id。
 * @returns 是否确实否决了（false = 本来就没有这条提名）。
 */
export async function rejectNomination(entryId: string): Promise<boolean> {
  const list = await readNominations()
  const next = list.filter((n) => n.entryId !== entryId)
  if (next.length === list.length) return false

  // ⭐ 防御性回滚（存量数据可能有 global:true 的待批封面）。
  await setCoverGlobalFlag(entryId, false)

  await writeNominations(next)
  return true
}

// ───────────────────────────────────────────────────────────────────────────
// 读快照
// ───────────────────────────────────────────────────────────────────────────

/**
 * 追加一条读快照（§3.8.1）。
 *
 * ⚠️ **同会话重复读同一条不去重**（§12-66）——保留完整阅读痕迹。
 * @param sessionId - 会话 id。
 * @param snapshot - 快照内容。
 */
export async function appendReadSnapshot(sessionId: string, snapshot: ReadSnapshot): Promise<void> {
  await ensureDir(readsDir())
  const path = readLogPath(sessionId)
  const line = `${JSON.stringify(snapshot)}\n`
  const existing = (await readTextIfExists(path)) ?? ''
  await writeTextAtomic(path, existing + line)
}

/**
 * 读某会话的全部快照。
 * @param sessionId - 会话 id。
 * @returns 快照数组（顺序即写入顺序）。
 */
export async function readSnapshots(sessionId: string): Promise<ReadSnapshot[]> {
  const text = await readTextIfExists(readLogPath(sessionId))
  if (text === undefined || text.trim() === '') return []
  const out: ReadSnapshot[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    try {
      out.push(JSON.parse(line) as ReadSnapshot)
    } catch {
      // 单行损坏不该毁掉整个文件——跳过它。
    }
  }
  return out
}

/**
 * 取**本会话未消费**的快照（§3.8.2：取用范围 = `consumedAt === null`）。
 *
 * ⭐ **不需要算水位线**（决策 64）——只看这一条判据就够。
 * @param sessionId - 会话 id。
 * @returns 未消费的快照。
 */
export async function readUnconsumedSnapshots(sessionId: string): Promise<ReadSnapshot[]> {
  return (await readSnapshots(sessionId)).filter((s) => s.consumedAt === null)
}

/**
 * 把某会话的快照标为已消费，并按 §3.8.2 判定清理。
 *
 * 🔴 **清理只删已消费的**——未消费的是当前会话正在用的判据，绝不能动。
 * ⇒ 结果是"保护优先"：若某会话读了 60 条且全未消费，**一条也删不掉**（§11.14 已记此代价）。
 * @param sessionId - 会话 id。
 * @param maxEntries - 单文件上限（超过则清理）。
 * @param trimCount - 一次删多少条。
 * @returns 清理掉的条数。
 */
export async function consumeSnapshots(
  sessionId: string,
  maxEntries: number,
  trimCount: number,
): Promise<number> {
  const all = await readSnapshots(sessionId)
  if (all.length === 0) return 0
  const now = new Date().toISOString()
  for (const s of all) if (s.consumedAt === null) s.consumedAt = now

  let final = all
  if (all.length > maxEntries) {
    // 删除**较早的**若干条，但**只删已消费的**。
    const need = trimCount
    const keep: ReadSnapshot[] = []
    let removed = 0
    for (const s of all) {
      if (removed < need && s.consumedAt !== null) {
        removed += 1
        continue
      }
      keep.push(s)
    }
    final = keep
  }

  const text = final.map((s) => JSON.stringify(s)).join('\n')
  await writeTextAtomic(readLogPath(sessionId), text === '' ? '' : `${text}\n`)
  return all.length - final.length
}

/** 确保库目录存在（首次写入前调用一次即可）。 */
export async function ensureLibraryDirs(): Promise<void> {
  for (const dir of requiredDirs()) await ensureDir(dir)
}

// ───────────────────────────────────────────────────────────────────────────
// ⭐ 项目文档读记录（决策 112）
//    🔴 **与上面的读快照完全平行、但互不相干**：那个记"读过别项目的知识"
//    （跨项目证据），这个记"读过本项目的文档"（写叙事的前置条件）。
// ───────────────────────────────────────────────────────────────────────────

/**
 * 追加一条项目文档读记录（决策 112）。
 *
 * ⚠️ **同一会话 + 同一项目 + 同一轮次**的多次读取**只保留最新一条**
 * （同一轮里逐节读时，`sections` 由调用方累积后传进来；
 *  同轮重复读同一文档没有保留全部痕迹的价值）。
 * ⚠️ **跨轮次的记录会保留**——它们各自代表"那一轮读过"，
 * 而硬校验只认当前轮次（见 `findDocRead`）。
 * @param sessionId - 会话 id。
 * @param record - 读记录内容。
 */
export async function appendDocRead(sessionId: string, record: DocReadRecord): Promise<void> {
  await ensureDir(docReadsDir())
  const path = docReadLogPath(sessionId)
  const existing = await readDocReads(sessionId)
  const kept = existing.filter((r) => !(r.project === record.project && r.turn === record.turn))
  kept.push(record)
  const text = kept.map((r) => JSON.stringify(r)).join('\n')
  await writeTextAtomic(path, `${text}\n`)
}

/**
 * 读某会话的全部项目文档读记录（决策 112）。
 * @param sessionId - 会话 id。
 * @returns 记录数组（最近读的在后）。
 */
export async function readDocReads(sessionId: string): Promise<DocReadRecord[]> {
  const text = await readTextIfExists(docReadLogPath(sessionId))
  if (text === undefined || text.trim() === '') return []
  const out: DocReadRecord[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    try {
      out.push(JSON.parse(line) as DocReadRecord)
    } catch {
      // 单行损坏不该毁掉整个文件——跳过它。
    }
  }
  return out
}

/**
 * ⭐⭐ 本会话**在指定轮次里是否读过**某个项目文档（决策 112 的硬校验用）。
 *
 * 🔴 **有效期 = 一个完整轮次**（用户明确："不是 step 的颗粒，是一个完整轮次的颗粒"）：
 *    · `turn >= 0`（拿到了真实轮次号）⇒ **只认 `turn` 相等的那条**——
 *      上一轮读过**不算**：上一轮 handoff 很可能刚改过这份文档。
 *    · `turn < 0`（拿不到轮次，如栈内调用）⇒ 退化为**本会话读过即可**，
 *      宁可放松也不误拦（硬校验的目的不是卡人，是防"凭记忆写"）。
 * @param sessionId - 会话 id。
 * @param projectId - 项目 id。
 * @param turn - 当前轮次号；`-1` 表示未知。
 * @returns 读记录；没读过（或不在本轮）时 `undefined`。
 */
export async function findDocRead(
  sessionId: string,
  projectId: string,
  turn: number,
): Promise<DocReadRecord | undefined> {
  const all = await readDocReads(sessionId)
  const mine = all.filter((r) => r.project === projectId)
  if (mine.length === 0) return undefined
  // 拿得到轮次 ⇒ 只认本轮的；拿不到 ⇒ 认全部（放宽）。
  if (turn >= 0) return mine.find((r) => r.turn === turn)
  return mine[mine.length - 1]
}

/** 库根（供诊断输出）。 */
export { libraryRoot }
