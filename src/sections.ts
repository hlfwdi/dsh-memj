/**
 * dsh-memj —— **交接文档的节名契约（唯一源头）**
 *
 * 🔴🔴 **为什么单独一个文件**：这些节名被 `store.ts` / `handoff.ts` / `history.ts` /
 *   `parse.ts` 四处消费，而它们之间**已有依赖方向** `store → parse`
 *   ⇒ 常量若放在 `store.ts`，`parse.ts` 引用它就会形成**循环依赖**。
 *   ⇒ 所以下沉成本模块（**零依赖**，只导出常量与纯函数）。
 *
 * 🔴🔴 **节名不是"文案"，是"程序协议"**（2026-09-30 普查结论）：
 *   · `history.ts`   按 `PROGRESS_TITLE` 找**截断目标节**（找不到 ⇒ 静默不截断）；
 *   · `handoff.ts`   按它统计**孤本判据**（找不到 ⇒ 那道防线整个消失）；
 *   · `handoff.ts`   按 `NARRATIVE_TITLES` 出**回执体量行**；
 *   · `read.ts`      按它做**子串匹配**（`section:"当前进度"` 之类）；
 *   · `store.ts`     按 `NARRATIVE_SECTIONS` 重建文档骨架。
 *
 * ⚠️ **历史教训（这次合并掉的）**：同一份节名曾有 **3 份不共享的副本** ——
 *   ① `store.ts` 的 `NARRATIVE_SECTIONS`（带 `## ` 前缀）
 *   ② `handoff.ts` 的本地 `NARRATIVE_TITLES`（无前缀）
 *   ③ `handoff.ts` 回执体量行里现写的 `order` 数组
 *   加上「沉淀知识」的 **2 处不共享的正则**（`handoff.ts` / `parse.ts`）。
 *   ⇒ 任何一处要动都得全部同改，**漏一处就是静默失效**。
 *
 * @module dsh-memj/sections
 */

/**
 * ⭐⭐⭐ **六节叙事的节名**（顺序固定，§3.1）。**全库唯一源头。**
 */
export const NARRATIVE_TITLES: readonly string[] = [
  '目标',
  '当前进度',
  '有效做法',
  '失败/踩坑',
  '关键上下文',
  '下一步',
]

/** 项目文档的**六节叙事**标题（带 `## ` 前缀，供解析/匹配用）。 */
export const NARRATIVE_SECTIONS: readonly string[] = NARRATIVE_TITLES.map((t) => `## ${t}`)

/**
 * ⭐⭐ **截断目标节名**。
 *
 * 🔴 只对这一节做自动截断（决策 136 / 127）：它是**唯一的主要膨胀源**
 *   （实测占交接文档 46%），其余五节按规范**只做语义精炼、不许删条目**。
 */
export const PROGRESS_TITLE = '当前进度'

/**
 * ⭐⭐⭐ 「沉淀知识」节的**节名**（无 `#` 前缀）。
 *
 * 🔴🔴 **这一节对用户是「钉死」的、不参与任何模板自定义**（用户 2026-09-30 裁定）：
 *   **封面物理上就存在这一节里**（`store.ts` 重建它、`parse.ts` 与 `handoff.ts`
 *   按它砍掉旧封面再写新的）⇒ 一旦改名或删掉，**封面会丢或每轮累积**。
 *   ⭐ 用户侧**无感知**：他不需要知道有这么一节，工具自己会写。
 */
export const KNOWLEDGE_TITLE = '沉淀知识'

/** 「沉淀知识」节标题（带 `## ` 前缀）。 */
export const KNOWLEDGE_SECTION = `## ${KNOWLEDGE_TITLE}`

/**
 * ⭐⭐⭐ 「本档写作规范」节的**节名**（无 `#` 前缀）。
 *
 * 🔴🔴 **它是什么**（2026-10-12，模板与提示词解耦）：
 *   把"每一节该写什么、哪节能自动截断"这份**规范**从
 *   ① 模板 JSON 的 `desc`、② 常驻 `context()` 的写作指导、③ `memj_read` 的按需注入
 *   **三处**，收敛成**一处** —— 就写在这份文档自己的正文里（叙事末尾、`沉淀知识` 之前）。
 *
 * 🔴 **为什么放"末尾一整节"而不是"各节标题下面"**（方案对比见交接文档）：
 *   各节内嵌规范会要求 `mergeNarrative` / `applySectionOp` / `truncateProgress` /
 *   两套 `splitSections` **全都升级成"知道节里有个受保护块"**，且规范字数会
 *   吃掉「当前进度」的截断配额。
 *   落成**独立一节** ⇒ 那些机制**一个都不用改**（它只处理声明的目标节）。
 *
 * 🔴 **模型不能写它**：`narrativeFromDoc()` 会像对待「沉淀知识」一样**先砍掉它**；
 *   落盘时由 `handoff` 按该项目的模板**重建**。手改会被下次落盘覆盖。
 */
export const SPEC_TITLE = '本档写作规范'

/** 「本档写作规范」节标题（带 `## ` 前缀）。 */
export const SPEC_SECTION = `## ${SPEC_TITLE}`

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐⭐ **规范块**（决策 209）—— 每节标题下的受保护围栏块
//
// ── 它是什么 ──────────────────────────────────────────────────────────────
// `## <节名>` 紧跟一个 ```memj:spec 围栏块。**围栏起始行是机器读的标记**，
// **围栏内是给人/模型读的规范文字**。模板文件与建出来的项目文档**同形**。
//
//   ## 目标
//
//   ```memj:spec
//   这个项目要做什么
//   压缩：只做语义精炼，不删条目
//   ```
//
//   （以下是正文，模型写）
//
// ── 🔴 为什么必须带语言标记（不能用裸 ```）────────────────────────────────
//   裸围栏在本套解析器里的语义**已经是"整段跳过"**（6 处 `inFence` 判断），
//   而**项目文档里到处用裸围栏写代码示例**（真实存在）
//   ⇒ 裸围栏**无法区分**"这是规范"与"这是它的代码示例"。
//
// ── 🔴 三条纪律 ───────────────────────────────────────────────────────────
//   1. **取与砍必须共用同一个 `specBlockRange()`**（同 `specRange()` 的既有铁律）——
//      否则"取出来的"与"砍掉的"范围不一致，会**静默留下半截**；
//   2. **围栏不闭合 ⇒ 当作没有规范块**（不猜、不半取）；
//   3. **本模块零依赖**：只接受**行数组**，节的切分由调用方做
//      （`splitH2` / `splitAny` / `splitSectionsForHistory` 各有各的用途）。
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ 规范块的**围栏语言标记**（唯一源头）。
 *
 * ⚠️ 它同时出现在渲染侧（`renderTemplateDoc` / 建项目的骨架）与解析侧
 *   （本文件的 `specBlockFenceInfo`）⇒ **改它必须两处一起改**；
 *   落在同一常量上 ⇒ 结构上不会漂。
 */
export const SPEC_BLOCK_FENCE = 'memj:spec'

/** 围栏起始行：` ```memj:spec ` 或 ` ```memj:spec truncate `（标记即机器读的那一位）。 */
const SPEC_BLOCK_OPEN_RE = new RegExp(`^\\s*\`\`\`${SPEC_BLOCK_FENCE}(?:\\s+(truncate))?\\s*$`, 'i')

/** 围栏结束行：一个**裸的** ``` 行。 */
const FENCE_CLOSE_RE = /^\s*```\s*$/

/**
 * ⭐ 判一行是不是规范块的**围栏起始行**。
 *
 * ⚠️ **宽容**（与 `.md` 模板的取向一致：选 md 就是为了让人能手改）：
 *   允许行首缩进、允许行尾空白、`truncate` 大小写不敏感。
 * @param line - 一行。
 * @returns 是围栏起始行 ⇒ `{ truncate }`（该节是否声明可截断）；否则 `undefined`。
 */
export function specBlockFenceInfo(line: string): { truncate: boolean } | undefined {
  const m = SPEC_BLOCK_OPEN_RE.exec(line)
  if (m === null) return undefined
  return { truncate: m[1] !== undefined }
}

/** 一个规范块在行数组里的位置（行号相对**传入的那个数组**）。 */
export interface SpecBlockRange {
  /** 围栏起始行下标。 */
  open: number
  /** 正文首行下标（= `open + 1`）。 */
  bodyStart: number
  /** 正文结束下标（不含）—— 即结束围栏那一行。 */
  bodyEnd: number
  /** 结束围栏行下标。 */
  close: number
  /** 该节是否声明可截断。 */
  truncate: boolean
}

/**
 * ⭐⭐ **找一节里的规范块**——本模块的**唯一边界实现**。
 *
 * 🔴 只在**该节自己的行区间**里找（调用方保证区间是"这一节"）：
 *   从标题行之后找**第一个**围栏起始行，再找它后面**第一个**裸 ``` 行。
 * ⚠️ **不闭合 ⇒ `undefined`**（不猜、不半取）。
 * ⚠️ 只找**第一个**块：一节只有一个规范块（多写的第二个会被当正文）。
 * @param lines - 该节的行（**含**标题行）。
 * @param from - 从哪一行开始找（默认 1 = 跳过标题行）。
 * @returns 位置；没有规范块 ⇒ `undefined`。
 */
export function specBlockRange(lines: readonly string[], from = 1): SpecBlockRange | undefined {
  for (let i = from; i < lines.length; i += 1) {
    const info = specBlockFenceInfo(lines[i] ?? '')
    if (info === undefined) continue
    for (let j = i + 1; j < lines.length; j += 1) {
      if (FENCE_CLOSE_RE.test(lines[j] ?? '')) {
        return { open: i, bodyStart: i + 1, bodyEnd: j, close: j, truncate: info.truncate }
      }
    }
    return undefined // 起始行有了、结束行没有 ⇒ 不认
  }
  return undefined
}

/**
 * ⭐ 取一节里规范块的**规范文字**（围栏内的内容，已 trim；没有 ⇒ `''`）。
 * @param lines - 该节的行（含标题行）。
 * @returns 规范文字。
 */
export function extractSpecBlock(lines: readonly string[]): string {
  const r = specBlockRange(lines)
  if (r === undefined) return ''
  return lines.slice(r.bodyStart, r.bodyEnd).join('\n').trim()
}

/**
 * ⭐ 取一节里规范块的**原文行**（含围栏起始/结束行；没有 ⇒ `[]`）。
 *
 * 🔴 用途：`mergeNarrative` **从盘上旧文档回填**规范块 —— 回填必须是
 *   **逐字原样**（不能重新渲染，否则用户手改过的措辞会被"规范化"掉）。
 * @param lines - 该节的行（含标题行）。
 * @returns 规范块原文行。
 */
export function extractSpecBlockLines(lines: readonly string[]): string[] {
  const r = specBlockRange(lines)
  if (r === undefined) return []
  return lines.slice(r.open, r.close + 1)
}

/**
 * ⭐ 剥掉一节里的规范块（**只剥块，正文一字不动**；没有 ⇒ 原样返回）。
 *
 * ⚠️ 与 `extractSpecBlock()` **共用 `specBlockRange()`** —— 见本组开头的纪律 1。
 * @param lines - 该节的行（含标题行）。
 * @returns 剥掉后的行（标题行仍在）。
 */
export function stripSpecBlock(lines: readonly string[]): string[] {
  const r = specBlockRange(lines)
  if (r === undefined) return [...lines]
  return [...lines.slice(0, r.open), ...lines.slice(r.close + 1)]
}

/**
 * ⭐⭐ **取"这份文档里哪几节声明了可自动截断"**（决策 209 —— 取代
 *   `truncateTitlesFromSpec()`）。
 *
 * 🔴 **为什么权威在正文**（与节名同一取向，见 `docSectionsOf` 的注释）：
 *   规范块住正文，而正文是 `rebuildDerivedLayers()` **唯一逐字保留**的地方
 *   （实测 sha256 相同）⇒ 它不会被旁路重写抹掉。
 *
 * ⚠️ **判据是"该节规范块的围栏起始行带不带 `truncate`"** ——
 *   与渲染侧共用同一份语法（`SPEC_BLOCK_FENCE`）⇒ 写与读**同源**。
 * ⚠️ 跳过围栏内的伪标题（与 `sectionsFromNarrative` 同规）。
 * @param narrative - 纯叙事文本（含规范块）。
 * @returns 可截断的节名数组（顺序即文档顺序）。
 */
export function truncateTitlesFromBlocks(narrative: string): string[] {
  const lines = narrative.split(/\r?\n/)
  const out: string[] = []
  let cur: { title: string; from: number } | undefined
  let inFence = false
  const flush = (to: number): void => {
    if (cur === undefined) return
    const inner = lines.slice(cur.from, to)
    const r = specBlockRange(inner)
    if (r !== undefined && r.truncate && !out.includes(cur.title)) out.push(cur.title)
    cur = undefined
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    // 🔴 **必须跳过所有围栏内的行**（否则规范块里若写了 `## 示例` 会被当成一节）。
    if (specBlockFenceInfo(line) !== undefined || FENCE_CLOSE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m !== null) {
      flush(i)
      const title = (m[1] ?? '').trim()
      if (title !== '' && title !== KNOWLEDGE_TITLE && title !== SPEC_TITLE) {
        cur = { title, from: i }
      }
      continue
    }
  }
  flush(lines.length)
  return out
}

/**
 * ⭐ **剥掉整份文档里所有节内规范块**（模型回传的 `doc` 走这条）。
 *
 * 🔴 **为什么必须有它**：模型写 `doc` 时可能**照抄**文档（含规范块）——
 *   若不剥，`mergeNarrative` 会把那份副本当"正文"，与盘上的规范块**并存**。
 * @param narrative - 纯叙事文本。
 * @returns 剥掉全部规范块后的文本。
 */
export function stripAllSpecBlocks(narrative: string): string {
  const lines = narrative.split(/\r?\n/)
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    // 顶层节标题 ⇒ 从它开始找块，找到就整块跳过。
    if (/^##\s+/.test(line)) {
      let j = i + 1
      while (j < lines.length && !/^##\s+/.test(lines[j] ?? '')) j += 1
      out.push(line, ...stripSpecBlock(lines.slice(i, j)).slice(1))
      i = j
      continue
    }
    out.push(line)
    i += 1
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * ⭐ 判断一行是不是「本档写作规范」的**顶层标题行**。
 *
 * 🔴 与 `isKnowledgeHeading()` **同规**：必须按行首精确匹配（不能用 `indexOf` 查子串）
 *   —— 叙述里完全可能**引用**这个标题名，子串查找会把真实内容误删。
 * @param line - 待判定的行。
 * @returns 是「本档写作规范」顶层标题 ⇒ true。
 */
export function isSpecHeading(line: string): boolean {
  return new RegExp(`^##\\s+${SPEC_TITLE}\\s*$`).test(line)
}

/**
 * ⭐⭐ 砍掉「本档写作规范」**这一节**（只这一节，**保住它后面的内容**）。
 *
 * 🔴 **与 `cutKnowledgeSection()` 的关键区别**：
 *   那个是"从 `沉淀知识` 砍到**文件末尾**"（因为它后面本来就没有别的东西）；
 *   而本函数**只砍一节**（到下一个 `##` 为止）—— 规范节排在叙事末尾，
 *   但它未必是文件最后一节（后面还有 `沉淀知识`，由另一个函数负责）。
 *
 * ⚠️ **两个用途**（缺一不可）：
 *  ① **写入前**：模型给的 `doc` 里若带了旧规范（它可能把整份文档回传），
 *     必须先砍掉 —— 否则 `mergeNarrative` 会把它当成"一个自定义节"，
 *     与我们随后重建的那一份**并存**（= 文档里出现两个规范节）；
 *  ② **重建前**：落盘前把旧规范砍掉、再按模板重建（**幂等**）。
 * @param text - 文本。
 * @returns 砍掉该节后的文本（没有该节 ⇒ 原样返回）。
 */
export function cutSpecSection(text: string): string {
  const r = specRange(text)
  if (r === undefined) return text
  const lines = text.split(/\r?\n/)
  // ⚠️ 连同**紧邻其后的空行**一起删（免得留下连续空行）。
  let realEnd = r.end
  while (realEnd < lines.length && (lines[realEnd] ?? '').trim() === '') realEnd += 1
  const out = [...lines.slice(0, r.start), ...lines.slice(realEnd)]
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/**
 * ⭐⭐ 取出「本档写作规范」那一节的**原文**（含标题行；没有 ⇒ 空串）。
 *
 * 🔴 **用途：`handoff` 落盘时"原样保住它"**。
 *   它**复制自模板、之后归文档自己所有**（用户 2026-10-12 裁定：
 *   *"建立项目的时候用复制初始模板……后续更新项目文档的时候就在项目自己的文档里去更新"*）
 *   ⇒ ⚠️ **不按模板重建**（否则用户在本文档里改过的规范会被模板覆盖回去，
 *     而模板与文档是**解耦**的——改模板不该影响已有文档）。
 *
 * ⚠️ 与 `cutSpecSection()` 的关系：一个取、一个砍，**必须用同一套边界规则**
 *   （都按行首精确匹配 + 到下一个顶层 `##` 为止）——否则"取出来的"与"砍掉的"
 *   范围不一致，会**静默留下半截**。这正是本项目"同一语义两条实现"的经典坑，
 *   所以两者挨着写、共用 `specRange()`。
 * @param text - 文本。
 * @returns 该节原文（含 `## ` 标题行；末尾已 trim）；没有该节 ⇒ `''`。
 */
export function extractSpecSection(text: string): string {
  const r = specRange(text)
  if (r === undefined) return ''
  return r.lines.join('\n').trim()
}

/**
 * ⭐ 「本档写作规范」节在行数组里的**唯一边界实现**（`cutSpecSection` 与
 *   `extractSpecSection` 共用，见前者的注释）。
 * @param text - 文本。
 * @returns `{ start, end }`（`end` 不含）；没有该节 ⇒ `undefined`。
 */
function specRange(text: string): { start: number; end: number; lines: string[] } | undefined {
  const lines = text.split(/\r?\n/)
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (isSpecHeading(lines[i] ?? '')) {
      start = i
      break
    }
  }
  if (start === -1) return undefined
  // 到下一个**顶层** `## ` 标题为止（规范节排在叙事末尾、`沉淀知识` 之前）。
  let end = lines.length
  for (let j = start + 1; j < lines.length; j += 1) {
    if (/^##\s+/.test(lines[j] ?? '')) {
      end = j
      break
    }
  }
  return { start, end, lines: lines.slice(start, end) }
}

/**
 * ⭐ 判断一行是不是「沉淀知识」的**顶层标题行**。
 *
 * 🔴 **必须按行首精确匹配**（不能用 `indexOf` 查子串）：叙述里可能**引用**
 *   这个标题（例如"见 `## 沉淀知识`"），子串查找会把真实内容误删。
 *   ⚠️ 这是既有实现里明写过的坑 —— 本函数是它的**唯一实现**
 *   （历史上 `handoff.ts` 与 `parse.ts` 各写了一遍同样的正则）。
 * @param line - 待判定的行。
 * @returns 是「沉淀知识」顶层标题 ⇒ true。
 */
export function isKnowledgeHeading(line: string): boolean {
  return new RegExp(`^##\\s+${KNOWLEDGE_TITLE}\\s*$`).test(line)
}

/**
 * ⭐ 砍掉「沉淀知识」节**及其后的全部内容**。
 *
 * 🔴 用途：写文档前先清掉旧封面（那一节由工具重建，只放封面不放正文）。
 *   ⚠️ 按**行首精确匹配**，理由同 `isKnowledgeHeading()`。
 * @param text - 文本。
 * @returns 砍掉后的文本（没有该节 ⇒ 原样返回）。
 */
export function cutKnowledgeSection(text: string): string {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    if (isKnowledgeHeading(lines[i] ?? '')) return lines.slice(0, i).join('\n')
  }
  return text
}

/**
 * ⭐⭐⭐ **取"这份文档自己的节名清单"**（决策 204）——所有机制的**统一入口**。
 *
 * 🔴🔴 **为什么必须有它**：交接文档的节名从"全局硬编码六节"变成了
 *   "**每份文档自己记一份**"（`ProjectFrontmatter.sections`，支持用户自定义模板）。
 *   任何要按节工作的机制（合并 / 截断 / 回执 / 骨架重建）**都必须经由本函数**取节名，
 *   而不是直接用 `NARRATIVE_TITLES` —— 否则它会**按错误的节名工作**
 *   （表现为：自定义模板的文档里，那些机制静默失效或错位）。
 *
 * ⭐ **回落规则**：文档没记节名（老文档 / 未指定）⇒ **默认六节**。
 *   ⇒ 这就是**零行为变化**的保证：改造前建的所有文档行为一字不变。
 * @param sections - 文档 frontmatter 里的节名清单（可能为空）。
 * @returns 该文档的节名（顺序即文档顺序）。
 */
export function sectionsOf(sections: readonly string[] | undefined): readonly string[] {
  const cleaned = (sections ?? []).map((s) => s.trim()).filter((s) => s !== '')
  return cleaned.length > 0 ? cleaned : NARRATIVE_TITLES
}

/**
 * ⭐⭐⭐ **从文档正文的 `## ` 标题推导节名清单**（2026-10-12，本函数的诞生是一次真 bug 的根治）。
 *
 * 🔴🔴 **为什么必需**（实测复现的损坏路径）：
 *   原先唯一权威是 `frontmatter.sections`，而它有**两条独立维护路径**：
 *   ① `memj_handoff` 建项目时写入；② `rebuildDerivedLayers()` 汇总 `themes:` 时
 *   **手工重写整个 frontmatter**，而它那张字段表里**没有 `sections`**
 *   ⇒ 一旦某项目的 `themes:` 需要更新，重写就会把 `sections` / `truncateSections` /
 *   `template` **整行抹掉**（实测：注入一个不存在的主题强制触发 ⇒ 三个字段全消失，
 *   而 `createdAt` / `updatedAt` / `archivedAt` 还在）。
 *   ⇒ 之后 `sectionsOf(空)` **回落默认六节** ⇒ 一份用自定义模板建的文档
 *   **被程序按默认六节理解** ⇒ 下次 handoff 只更新一节时，
 *   **六个默认空壳节被插到最前面**、原有六节被当成"非自定义节"留到后面
 *   （实测 6 节 → 12 节；生产 `metax-688802` 的镜像里留下过一次 6 节 → 43 节的真现场）。
 *
 * ⭐⭐ **修法：让权威源落在"唯一不会被任何旁路改写"的地方 —— 正文自己。**
 *   · 正文是 `rebuildDerivedLayers()` **唯一逐字保留**的东西（实测 sha256 相同）；
 *   · `frontmatter.sections` **降级为兼容读**（老文档、或正文还没有规范节时用）。
 *
 * 🔴 **排除两类标题**（否则会把工具自己的节算成"叙事节"）：
 *   · `## 沉淀知识`（封面容器，由工具维护）；
 *   · `## 本档写作规范`（规范容器，由工具维护）。
 * @param narrative - 纯叙事文本（`narrativeFromProjectText()` 的产物，已剥 frontmatter/封面）。
 * @returns 节名数组（按文档顺序、已去重）；**一个都没有 ⇒ 空数组**（由调用方决定回落）。
 */
export function sectionsFromNarrative(narrative: string): string[] {
  const out: string[] = []
  let inFence = false
  for (const line of narrative.split(/\r?\n/)) {
    // ⚠️ 必须跳过代码围栏内的伪标题（与 `splitH2` 同规，否则文档里的示例代码会变成"节"）。
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m === null) continue
    const t = (m[1] ?? '').trim()
    if (t === '' || t === KNOWLEDGE_TITLE || t === SPEC_TITLE) continue
    if (!out.includes(t)) out.push(t)
  }
  return out
}

/**
 * ⭐⭐⭐ **取"这份文档自己的节名清单"的唯一入口**（2026-10-12 起）——**正文优先**。
 *
 * 🔴🔴 **两处权威、优先级固定，别调换**：
 *   ① ⭐ **正文的 `##` 标题**（`sectionsFromNarrative`）——**权威**，因为它是
 *      `rebuildDerivedLayers()` 唯一不碰的地方（见该函数注释里的实测证据）；
 *   ② **frontmatter 的 `sections`** —— **兼容读**：正文里一个叙事节都没有时
 *      （老文档、或刚建的骨架还没落正文）才用它。
 *   ③ 两者都空 ⇒ **默认六节**（改造前的行为，零变化保证）。
 *
 * ⚠️ **为什么不把 frontmatter 一并"合并"进来**：两份清单不一致时合并会**造出第三节清单**
 *   （既不是文档现状、也不是建档契约）⇒ 后续"结构不一致检出"就无从判断了。
 *   这里刻意**只用正文**，把 frontmatter 当**候选证据**交给回执去报（见 `handoff` 的检出段）。
 *
 * @param narrative - 纯叙事文本（可传 `''`）。
 * @param declared - 文档 frontmatter 里的节名清单（兼容读用）。
 * @returns 该文档的节名（顺序即文档顺序）。
 */
export function docSectionsOf(narrative: string, declared: readonly string[] | undefined): readonly string[] {
  const fromBody = sectionsFromNarrative(narrative)
  if (fromBody.length > 0) return fromBody
  return sectionsOf(declared)
}

/**
 * ⭐ **按给定节名生成"骨架"**（每节一个空标题）——建文档 / 规范化时用。
 *
 * ⚠️ 与 `NARRATIVE_SECTIONS` 的区别：那个是**默认六节的**固定形态；
 *   本函数接受任意节名清单（用户自定义模板用）。
 * @param sections - 节名清单。
 * @returns 形如 `## 目标\n\n## 进展\n` 的骨架文本。
 */
export function buildSkeleton(sections: readonly string[]): string {
  return sections.map((t) => `## ${t}\n`).join('\n')
}
