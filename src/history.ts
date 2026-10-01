/**
 * ⭐⭐ **历史归档**（决策 136）—— 把「当前进度」里较早写下的内容截走，存档成条目。
 *
 * ── 它替代了什么 ───────────────────────────────────────────────────────────
 * 用户裁定：**不再做压缩**（`replace`/`drop` 那套），也**删掉追加型台账**；
 * 改为**自动截断归档**：
 *
 * ```
 * 「当前进度」> progressCharsWarn（阈值）
 *   ⇒ 从【最早写入的】 ### 小节开始整节截走，直到剩余 ≤ progressCharsKeep
 *   ⇒ 截走的原文 ⇒ 一条 kind:'history' 的条目（原文逐字，不改写）
 *   ⇒ 原位只留一句概述，归纳进 ### 历史进展 小节（含完整 entry id 指针）
 * ```
 *
 * ── 🔴🔴 为什么这个设计比"压缩"强（本项目实测过的失败）────────────────────
 * 压缩规范写了判据、也加了触发条件（回执每次报体量），**连报 7 次、一次没压**。
 * 根因是"**要模型自己动手**"。而截断是**工具自己做的事**
 * ⇒ ⭐ **"报了但不做"这个失败模式从此不存在**。
 *
 * ── ⚠️ 与"压缩"的语义差别（别混）────────────────────────────────────────
 * | | 压缩（已废弃） | 截断归档（本模块） |
 * |---|---|---|
 * | 谁做 | **模型**（工具只提供 `replace`/`drop`） | **工具自动** |
 * | 丢不丢 | **会丢**（归并掉细节） | **不丢**（原文进条目，可读回） |
 * | 判据 | 模型的语义判断 | 纯字符数 |
 *
 * @module dsh-memj/history
 */

import { randomUUID } from 'node:crypto'
// ⭐ 节名走**唯一源头**（`store.ts`）——历史上这里是硬编码的 `'当前进度'` 字面量，
//   与 `handoff.ts` 的同类判据是**各自一份**（2026-09-30 合并）。
import { PROGRESS_TITLE } from './store.ts'

/** 「历史进展」小节名（**「当前进度」内部**的 `###` 小节，用户裁定）。 */
export const HISTORY_SECTION = '历史进展'

/** 一条待归档的"历史"（一次截断里可能产生多条）。 */
export interface HistoryChunk {
  /** 该组的英文概述（进 slug）——**必须 ASCII**（`SLUG_RE` 只允许小写英文/数字/连字符）。 */
  slugPart: string
  /** 人看的标题，如「历史进展：第三十二~三十七批」。 */
  title: string
  /** 概述句（写进「历史进展」小节那一行）。 */
  summary: string
  /** 被截走的原文（**逐字**，按小节拼接）。 */
  body: string
  /** 这一组包含哪些小节名（用于回执）。 */
  sections: string[]
}

/** 截断结果。 */
export interface TruncateResult {
  /** 截断后的完整叙事（调用方用它落盘）。 */
  narrative: string
  /** 截断前「当前进度」的字符数。 */
  beforeChars: number
  /** 截断后「当前进度」的字符数。 */
  afterChars: number
  /** 要归档的组（已按区间分好）。 */
  chunks: HistoryChunk[]
  /**
   * ⚠️ **没能截断的原因**（成功时为空）。
   * 例如「当前进度」里**没有 `###` 小节**、或**非小节部分自己就超标** ⇒ 工具**不猜**。
   */
  warning: string
}

/**
 * 一条 `###` 小节的边界（含标题行）。
 *
 * ⚠️ **与 `handoff.ts` 的 `splitAny` 同规则**：跳过代码围栏内的伪标题。
 *    自己实现一份是因为 `splitAny` 在 `handoff.ts` 内部、未导出，
 *    而**导出它会扩大模块边界**（那条函数是"按节写"的私有实现）。
 *    ⚠️ 两边规则若漂移会出问题 ⇒ 探针里有一条**断言两者对同一文档切出相同小节**（见 `test-history.mjs`）。
 */
interface SubSection {
  title: string
  level: 2 | 3
  /** 标题行下标（0 起）。 */
  start: number
  /** 结束下标（不含）——下一个**级别 ≤ 本级**的标题。 */
  end: number
}

/**
 * 按 `##` / `###` 切节（**跳过围栏**）。
 * @param lines - 全文行。
 * @returns 小节数组。
 */
export function splitSectionsForHistory(lines: readonly string[]): SubSection[] {
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
      heads.push({ title: (m[2] ?? '').trim(), level: (m[1] ?? '').length === 2 ? 2 : 3, line: i })
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
    return { title: h.title, level: h.level, start: h.line, end }
  })
}

/**
 * 从一个小节名里提取"批号"（用于生成英文 slug 与中文标题）。
 *
 * ⭐ 本项目「当前进度」的小节名形如 `第三十八批（2026-09-20）：…`。
 * ⚠️ **取不到批号时返回 `undefined`** —— 调用方据此退回**序号**命名
 *    （**不猜**：不能把"某个无关小节"硬说成"第 N 批"）。
 * @param title - 小节名。
 * @returns 批号（阿拉伯数字）或 `undefined`。
 */
export function batchNumberFromTitle(title: string): number | undefined {
  const m = /第([零一二三四五六七八九十百千〇两\d]+)批/.exec(title)
  if (m === null) return undefined
  const raw = m[1] ?? ''
  if (/^\d+$/.test(raw)) return Number(raw)
  // 中文数字换算（够用即可：本项目用到"百"量级）。
  const digits: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  }
  let total = 0
  let section = 0
  let num = 0
  for (const ch of raw) {
    if (ch === '百') { section += (num === 0 ? 1 : num) * 100; num = 0; continue }
    if (ch === '十') { section += (num === 0 ? 1 : num) * 10; num = 0; continue }
    const d = digits[ch]
    if (d === undefined) return undefined
    num = d
  }
  total = section + num
  return total === 0 ? undefined : total
}

/**
 * 把一组小节概括成**一句中文概述**（供「历史进展」那一行）。
 *
 * 🔴 **它不做语义摘要**——工具**读不懂内容**，只能依据**结构性事实**（批号区间、条数）写。
 *    ⚠️ 这是刻意的：**工具不编造内容**（编造出来的概述会撒谎，比没有概述更糟）。
 * @param titles - 该组的小节名。
 * @returns 概述句。
 */
export function summarize(titles: readonly string[]): string {
  const nums = titles.map(batchNumberFromTitle).filter((n): n is number => n !== undefined)
  const label = (() => {
    if (nums.length === 0) return `${titles.length} 个小节`
    const lo = Math.min(...nums)
    const hi = Math.max(...nums)
    return lo === hi ? `第${lo}批` : `第${lo}~${hi}批`
  })()
  return `${label}（${titles.length} 个小节）`
}

/**
 * 生成 slug 的 ASCII 片段（`SLUG_RE = /^[a-z0-9-]{2,48}$/`，**不允许中文**）。
 *
 * ⭐ 用户要求"英文描述" ⇒ 用 **`b<lo>-b<hi>`** 这种可读的批号区间形式。
 * @param titles - 该组的小节名。
 * @returns ASCII 片段（无批号时可退回 `n<条数>`）。
 */
export function slugSegment(titles: readonly string[]): string {
  const nums = titles.map(batchNumberFromTitle).filter((n): n is number => n !== undefined)
  if (nums.length === 0) return `n${titles.length}`
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  return lo === hi ? `b${lo}` : `b${lo}-b${hi}`
}

/**
 * ⭐⭐ **截断「当前进度」**（本模块的主函数）。
 *
 * 🔴🔴 **两个配额，别用错**（实测踩到过）：
 *  · `warnChars` = **触发点**——「当前进度」**超过它才开始截**；
 *  · `keepChars` = **截断目标**——截到**不超过它**为止。
 *  ⚠️ **只用其中一个当判据是错的**：若拿 `keep` 当触发点，那么"在 keep 与 warn 之间"
 *     的文档**也会被截**（用户的本意是"**超过阈值才动手**"）。
 *
 * 算法（**纯函数**，不碰盘——落盘由调用方做）：
 *  1. 把叙事按 `##` 切开，找到「当前进度」这一节；
 *  2. 若它 ≤ `warnChars` ⇒ **原样返回**（`chunks` 为空）；
 *  3. 否则把它**按 `###` 小节**从**最后**（最早写入的在底部）逐个取走，
 *     直到剩余 ≤ `keepChars`；
 *  4. 取走的小节原文按**区间分组**（见 `groupChunks`），在「当前进度」末尾
 *     追加/更新 `### 历史进展` 小节，写一行概述 + **完整 entry id 指针**。
 *
 * 🔴 **三条边界**（都**不猜**，宁可如实报"没截成"）：
 *  - 「历史进展」小节**自身永不参与截断**（否则会自己吃自己）；
 *  - 若「当前进度」里**没有可截的 `###` 小节**、而它又超标 ⇒ 报 warning，**不动**；
 *  - **至少保留一个小节**（截到只剩标题就等于把这一节清空了，那不是截断该做的事）。
 *
 * @param narrative - 完整叙事。
 * @param warnChars - **触发点**（超过它才截）。
 * @param keepChars - **截断目标**（截后应 ≤ 它）。⚠️ 应 ≤ `warnChars`。
 * @param historyLines - ⭐ **已有的「历史进展」行**（调用方从旧文档里取，用于保留历史指针）。
 * @param targetTitle - ⭐⭐ **要截哪一节**（决策 204）。
 *   · 省略 ⇒ `PROGRESS_TITLE`（**默认六节的行为，一字不变**）；
 *   · 传 `''`（空串）⇒ ⭐ **本模板没有声明可截断的节** ⇒ **不截断**，
 *     并回一条说明性 warning（**如实报，不是错误**）。
 *   ⚠️ 参数**必须加在末尾且可选** —— 测试里有 12 处按前三/四参调用。
 * @returns 截断结果。
 */
export function truncateProgress(
  narrative: string,
  warnChars: number,
  keepChars: number,
  historyLines: readonly string[] = [],
  targetTitle: string = PROGRESS_TITLE,
): TruncateResult {
  // ⭐ 模板声明"没有可截断的节" ⇒ 明确不截（不是找不到节那种异常）。
  if (targetTitle === '') {
    return {
      narrative,
      beforeChars: 0,
      afterChars: 0,
      chunks: [],
      warning: '本模板没有声明可自动截断的节 ⇒ 未截断（文档不会自动瘦身，需要手动归并）。',
    }
  }
  const lines = narrative.split(/\r?\n/)
  const secs = splitSectionsForHistory(lines)
  // ── 找目标节（默认「当前进度」，自定义模板由调用方传入） ──
  const progress = secs.find((s) => s.level === 2 && s.title === targetTitle)
  if (progress === undefined) {
    return { narrative, beforeChars: 0, afterChars: 0, chunks: [], warning: `没有「${targetTitle}」这一节，未截断。` }
  }
  const secLines = lines.slice(progress.start, progress.end)
  const beforeChars = secLines.join('\n').trimEnd().length
  // 🔴 **触发判据是 `warnChars`**（阈值），不是 `keepChars`。
  if (beforeChars <= warnChars) {
    return { narrative, beforeChars, afterChars: beforeChars, chunks: [], warning: '' }
  }

  // ── 该节内部的小节（`###`），去掉「历史进展」自己 ──
  const inner = splitSectionsForHistory(secLines)
    .filter((s) => s.level === 3 && s.title !== HISTORY_SECTION)
    .map((s) => ({ ...s, start: s.start + progress.start, end: s.end + progress.start }))
  if (inner.length === 0) {
    return {
      narrative,
      beforeChars,
      afterChars: beforeChars,
      chunks: [],
      warning:
        `「${targetTitle}」超过目标、但里面**没有可截的 \`###\` 小节**（或只有「历史进展」）⇒ 未截断。` +
        '⚠️ 工具不猜——请人工确认这一节为什么这么长。',
    }
  }

  // ── 从最后一个小节往前取，直到剩余 ≤ keepChars ──
  //    ⭐ **从最后开始**＝从**最早写入的**开始（本项目的文档是**新内容在上**）。
  const taken: SubSection[] = []
  let remaining = beforeChars
  for (let i = inner.length - 1; i >= 0; i -= 1) {
    const sec = inner[i]
    if (sec === undefined) continue
    if (remaining <= keepChars) break
    // 🔴🔴 **至少保留一个小节**（实测踩到的边界）：
    //    若把 `inner` 全截光，「当前进度」就**只剩标题**（实测 `afterChars` 掉到 58），
    //    而那违背本机制的定位——它是"**挪走较早的**"，不是"**清空这一节**"。
    //    ⚠️ 后果：最后一个不截 ⇒ 截后**可能仍超目标**（当那一节自己就比目标大）。
    //       ⭐ 这时**宁可超目标，也不清空**——并让回执如实报出"还剩多少"。
    if (taken.length >= inner.length - 1) break
    const len = lines.slice(sec.start, sec.end).join('\n').trimEnd().length
    taken.unshift(sec)
    remaining -= len
  }
  if (taken.length === 0) {
    return { narrative, beforeChars, afterChars: beforeChars, chunks: [], warning: '' }
  }

  // ⚠️ **"截到只剩非小节内容"这种情况已经由上面的"至少留一个小节"挡住了**
  //    ⇒ 这里**不再单独判"前言超标"**。
  //
  // 🔴🔴 **实测踩到的坑**：我原先在这里加了一条"小节之前的正文若超过目标 ⇒ 拒绝截断"，
  //    本意是防清空；但它把 **`## 当前进度` 标题行 + 空行**（实测 119 字符）也算进"前言"
  //    ⇒ **目标较小时会误判成"会清空"而拒绝截断**（6 个小节明明可以截，却一个都不截）。
  //    ⭐ 判据：**两条规则防同一件事时，宽的那条会让窄的那条永远误触发**——
  //       既然"至少留一个"已经保证不清空，就不该再有第二条更严的判据。
  const firstTaken = taken[0]
  if (firstTaken === undefined) {
    return { narrative, beforeChars, afterChars: beforeChars, chunks: [], warning: '' }
  }

  // ── 分组 + 生成 chunks ──
  const chunks = groupChunks(lines, taken)
  // ── 重写「当前进度」：保留未截部分 + 重建「历史进展」 ──
  //
  // 🔴🔴 **必须先把"旧的「历史进展」小节"从保留区里剔掉**（实测踩到的真 bug）：
  //    `buildProgressSection` 会**重新写一个**「历史进展」，
  //    而旧的若还在保留区里 ⇒ **同一个文档里出现两个 `### 历史进展`**（实测复现）。
  //    ⚠️ 判据：**"我会重建 X" ⇒ 就必须先把旧的 X 删掉**，否则是"追加了第二个"。
  const keptRaw = lines.slice(progress.start, firstTaken.start)
  const keptLines = stripHistorySection(keptRaw)
  const newSecLines = buildProgressSection(keptLines, historyLines, chunks)
  const out = [
    ...lines.slice(0, progress.start),
    ...newSecLines,
    ...lines.slice(progress.end),
  ]
  const next = out.join('\n')
  const afterChars = newSecLines.join('\n').trimEnd().length
  return { narrative: next, beforeChars, afterChars, chunks, warning: '' }
}

/**
 * 把已取走的小节**按区间分组**（每组 = 一条 `history` 条目）。
 *
 * ⚠️ **一次最多 3 组**（用户裁定"1~3 条"）：批号连续的归一组，
 *    断了就新开一组；超过 3 组时**后面的并进最后一组**（避免条目爆炸）。
 * @param lines - 全文行。
 * @param taken - 已取走的小节（按文档顺序）。
 * @returns 分组。
 */
function groupChunks(lines: readonly string[], taken: readonly SubSection[]): HistoryChunk[] {
  /** 按"批号是否连续"切组。 */
  const groups: SubSection[][] = []
  let cur: SubSection[] = []
  let prevNum: number | undefined
  for (const sec of taken) {
    const n = batchNumberFromTitle(sec.title)
    const continuous = n !== undefined && prevNum !== undefined && n === prevNum + 1
    if (cur.length > 0 && !continuous) {
      groups.push(cur)
      cur = []
    }
    cur.push(sec)
    prevNum = n
  }
  if (cur.length > 0) groups.push(cur)
  // ⚠️ 超过 3 组 ⇒ 并进最后一组（用户裁定上限 3 条）。
  const MAX_GROUPS = 3
  if (groups.length > MAX_GROUPS) {
    const head = groups.slice(0, MAX_GROUPS - 1)
    const tail = groups.slice(MAX_GROUPS - 1).flat()
    head.push(tail)
    groups.length = 0
    groups.push(...head)
  }
  return groups.map((g) => {
    const sections = g.map((s) => s.title)
    const body = g.map((s) => lines.slice(s.start, s.end).join('\n').trim()).join('\n\n')
    return {
      slugPart: slugSegment(sections),
      title: `历史进展：${summarizeTitle(sections)}`,
      summary: summarize(sections),
      body: `${body}\n`,
      sections,
    }
  })
}

/**
 * ⭐ 从一段行里**剔除「历史进展」整个小节**（连同它的标题与内容）。
 *
 * 🔴 **为什么必须有它**（实测 bug）：重建「历史进展」时若不先删旧的，
 *    文档里会出现**两个** `### 历史进展`（旧的 + 新的）。
 * @param lines - 待处理的片段。
 * @returns 去掉该小节后的行。
 */
export function stripHistorySection(lines: readonly string[]): string[] {
  const heads = splitSectionsForHistory(lines)
  const idx = heads.findIndex((s) => s.title === HISTORY_SECTION)
  if (idx === -1) return [...lines]
  const sec = heads[idx]
  if (sec === undefined) return [...lines]
  // ⚠️ 连**它前面的空行**一起删（免得留下连续空行）。
  let start = sec.start
  while (start > 0 && (lines[start - 1] ?? '').trim() === '') start -= 1
  return [...lines.slice(0, start), ...lines.slice(sec.end)]
}

/**
 * 由小节名生成**人看的标题**（如「第三十二~三十七批」）。
 * @param titles - 小节名。
 * @returns 标题片段。
 */
export function summarizeTitle(titles: readonly string[]): string {
  const nums = titles.map(batchNumberFromTitle).filter((n): n is number => n !== undefined)
  if (nums.length === 0) return `${titles.length} 个小节`
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  return lo === hi ? `第${lo}批` : `第${lo}~${hi}批`
}

/**
 * 重建「当前进度」的内容：**未截走的部分** + `### 历史进展`。
 *
 * 🔴 **已有的历史行必须保留**（它们指向更早归档的条目）——用户要求"指针"能一路查回去。
 * 🔴 **新行接在已有行之后**（时间顺序：越靠下越早）。
 * @param keptLines - 未截走的部分（含 `## 当前进度` 标题）。
 * @param historyLines - 已有的历史行。
 * @param chunks - 本次新归档的组。
 * @returns 新的「当前进度」行。
 */
function buildProgressSection(
  keptLines: readonly string[],
  historyLines: readonly string[],
  chunks: readonly HistoryChunk[],
): string[] {
  // ⚠️ 去掉末尾空行（下面统一补）。
  const kept = [...keptLines]
  while (kept.length > 0 && (kept[kept.length - 1] ?? '').trim() === '') kept.pop()
  // ⚠️ **全新条目占位**：chunk 的 id 由落盘时生成 ⇒ 这里先用**占位符**，
  //    落盘后由调用方回填（见 `renderHistoryLine`）。
  const newLines = chunks.map((c, i) => renderHistoryLine(c.summary, historyIdPlaceholder(i)))
  const all = [...historyLines, ...newLines]
  return [...kept, '', `### ${HISTORY_SECTION}`, '', ...all, '']
}

/**
 * ⭐ 一行「历史进展」的**唯一渲染实现**。
 *
 * 形如：
 * `- **第三十二~三十七批**（6 个小节）：详见条目 \`<完整 UUID>\`。`
 *
 * 🔴 **指针必须是完整 UUID**（用户裁定）——`memj_read` **只认完整 id**，
 *    写短 id 会让模型"拿着指针读不回来"（本项目实测踩过）。
 * @param summary - 概述（`summarize` 的产物）。
 * @param entryId - 条目 id（完整 UUID）。
 * @returns 一行 markdown。
 */
export function renderHistoryLine(summary: string, entryId: string): string {
  return `- **${summary}**：详见条目 \`${entryId}\`。`
}

/**
 * 「历史进展」行里，entry id 的**占位符**（落盘前用它，落盘后回填）。
 *
 * 🔴🔴 **必须是"每组唯一"的令牌**（`{{ENTRY_ID_0}}` / `{{ENTRY_ID_1}}` …），
 *    **不能全组共用一个占位符再按下标替换** —— 那是**实测踩到的真 bug**：
 *    第 1 次替换后，第 2 个占位符**变成了"第 0 个剩余占位符"**
 *    ⇒ 用"组序号 1"去匹配就**永远匹配不上** ⇒ 文档里留下 `{{ENTRY_ID}}`，
 *    **那行指针就废了**（而指针存在的全部意义就是"能读回"）。
 *    ⚠️ 判据：**"按出现次序替换第 N 个"这种接口，在"替换会改变次序"时必然错位**
 *       —— 改成"每组一个唯一令牌"就没有次序这回事。
 * @param index - 组序号（0 起）。
 * @returns 该组的唯一占位符。
 */
export function historyIdPlaceholder(index: number): string {
  return `{{ENTRY_ID_${index}}}`
}

/**
 * 把占位符**回填**成真实 entry id（按**唯一令牌**替换，无次序问题）。
 * @param narrative - 含占位符的叙事。
 * @param chunkIndex - 第几组（与 `chunks` 同序）。
 * @param entryId - 该组的条目 id。
 * @returns 回填后的叙事。
 */
export function fillHistoryId(narrative: string, chunkIndex: number, entryId: string): string {
  return narrative.split(historyIdPlaceholder(chunkIndex)).join(entryId)
}

/**
 * 检测叙事里**是否还残留任何占位符**（回填后必须为空；实测踩到过残留）。
 * @param narrative - 叙事。
 * @returns 残留处数。
 */
export function countHistoryPlaceholders(narrative: string): number {
  return (narrative.match(/\{\{ENTRY_ID_\d+\}\}/g) ?? []).length
}

/**
 * 从已有叙事里**取出**「历史进展」的现有行（截断时要保留它们）。
 * @param narrative - 完整叙事。
 * @returns 历史行数组（没有则空数组）。
 */
export function readHistoryLines(narrative: string): string[] {
  const lines = narrative.split(/\r?\n/)
  const secs = splitSectionsForHistory(lines)
  const sec = secs.find((s) => s.title === HISTORY_SECTION)
  if (sec === undefined) return []
  return lines
    .slice(sec.start + 1, sec.end)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
}

/**
 * 生成一条 history 条目的 slug（**英文描述**，用户裁定）。
 *
 * 形如 `dsh-memj-history-b32-b37`（拼上 `-<uuid8>` 就是文件名）。
 * ⚠️ 必须满足 `SLUG_RE = /^[a-z0-9-]{2,48}$/` ⇒ **不含中文**。
 * @param projectId - 项目 id。
 * @param slugPart - 区间片段（`slugSegment` 的产物）。
 * @returns slug。
 */
export function historySlug(projectId: string, slugPart: string): string {
  const safeProject = projectId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
  const base = `${safeProject === '' ? 'project' : safeProject}-history-${slugPart}`
  // ⚠️ 上限 48 ⇒ 超了就**从项目名中间截断**（保留 `-history-<区间>` 这段后缀，它信息量最大）。
  if (base.length <= 48) return base
  const suffix = `-history-${slugPart}`
  const room = 48 - suffix.length
  return room >= 2 ? `${safeProject.slice(0, room)}${suffix}` : `h-${slugPart}`.slice(0, 48)
}

/** 生成新条目 id（与 `handoff.ts` 同源：`randomUUID`）。 */
export function newEntryId(): string {
  return randomUUID()
}
