/**
 * dsh-memj —— **「文档内提问」的锚点与绑定**（2026-10-14）
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * 用户阅读某条知识时，选中一段发起提问 ⇒ 插件开一个 DSH 会话、并把问答同步成
 * 一条 `kind: chat` 的条目。本模块管这条链路的**定位与绑定**：
 *
 *   · `anchor`   —— 「选中/被讨论的是哪一段」的**四元组**（§3.1）；
 *   · `bindings` —— 「源条目 + 段落」⇄ 「chat 条目」的**一张表**（§3.2）；
 *   · `cursors`  —— 每个会话**同步到哪个 seq** 的增量游标（§3.3）。
 *
 * ── 🔴🔴 三条设计红线（都是踩过或推演过的坑）────────────────────────────────
 * 1. **锚点绝不能用「第 N 段」** —— 知识条目**会被编辑**（用户改 `when`/`guide`、
 *    归档、重写节），序号会整体漂移 ⇒ 历史绑定**静默指错地方**（比指向失败更糟）。
 *    ⇒ 用**内容哈希 + 原文 + 前后文**四元组，重新解析后能重锚。
 * 2. **`bindings` / `cursors` 必须落盘** —— 只存内存 ⇒ 重启后
 *    · 游标丢了 ⇒ 把**整段会话历史**当增量重跑一遍（chat 条目被重复追加）；
 *    · 绑定丢了 ⇒ 段落标记全消失、再也点不回那些会话。
 *    ⭐ 同族教训：memj 条目 `4f83edd9`「只存内存的状态，重启后界面会撒谎」。
 * 3. **绑定是显式的，不是判定的** —— 用户在「就此提问」那一刻就确定了
 *    ⇒ 不需要 memj 那套「会话→项目自动判定」（那条要覆盖每条写通路，很重）。
 *
 * @module dsh-memj/reading
 */

import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  ensureDir,
  readTextIfExists,
  writeTextAtomic,
} from './files.ts'
import {
  readingBindingsPath,
  readingCursorsPath,
  readingStatePath,
  safeName,
} from './paths.ts'
import { entryRelPath } from './paths.ts'
import type { Cover } from './schema.ts'
import { loadEntryDoc, loadProjectDoc, scanLibrary, writeEntryDoc, writeProjectDoc } from './store.ts'
import { updateEntry } from './edit.ts'

// ══════════════════════════════════════════════════════════════════════════
// 形状
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ **段落锚点**（W3C Web Annotation 的组合选择器思路）。
 *
 * 🔴 **四元组，缺一不可**：
 *   · `blockId`  —— 主键。块的**文本内容哈希**（不是位置序号！）；
 *   · `index`    —— 位置，仅辅助（快速定位、UI 排序）；
 *   · `exact`    —— 用户选中的**原文**（重锚的首要依据）；
 *   · `prefix` / `suffix` —— 前后各若干字（消歧：同一段话在文里出现多次时区分）。
 *
 * ⚠️ **`blockId` 用内容哈希是刻意的**：文本没变 ⇒ 哈希不变 ⇒
 *    与「第几段」无关。重抓取/重解析后，只要那段文字还在，锚就还在。
 */
export interface ReadingAnchor {
  /** 块的文本内容哈希（主键）。 */
  blockId: string
  /** 块在文档里的位置（仅辅助，不作为标识）。 */
  index: number
  /** 用户选中的原文。 */
  exact: string
  /** 选中处之前的一段文字（消歧用）。 */
  prefix: string
  /** 选中处之后的一段文字（消歧用）。 */
  suffix: string
}

/**
 * 一条绑定：**源条目的某段落** ⇄ **一个 chat 条目**。
 *
 * ⭐ `(entryId, blockId)` 是**唯一键** —— 用户裁定「同一段节选只开一个会话」，
 *    所以再次提问同一段落时**复用**（只追加一轮，不新建）。
 */
export interface ReadingBinding {
  /** 被提问的那条知识（源条目）id。 */
  entryId: string
  /** 段落锚点。 */
  anchor: ReadingAnchor
  /** 承载问答的 `kind: chat` 条目 id。 */
  chatEntryId: string
  /** 产生它的 DSH 会话 id（chat 条目 frontmatter 的 `source.sessionId` 同值）。 */
  sessionId: string
  /** 建立时间（ISO 8601）。 */
  createdAt: string
}

/** 阅读状态（轻量：读到哪里了）。 */
export interface ReadingState {
  /** `条目 id → 上次读到的 blockId`。 */
  positions: Record<string, string>
}

// ══════════════════════════════════════════════════════════════════════════
// 锚点构造
// ══════════════════════════════════════════════════════════════════════════

/** 前后文各取多少字（消歧够用即可，别把整段都搬进来）。 */
const CONTEXT_CHARS = 32

/**
 * ⭐ **把一段选中构造成锚点**。
 *
 * 🔴🔴 **`blockId` 哈希的是【块自己的文本】，不是整篇文档** ——
 *    这是本函数最容易写错的地方（第一批实现就错在这）：若哈希整篇，
 *    文档任何一处改动都会让**所有块**的 id 全变 ⇒ 与"用序号"相比只是
 *    换了一种错法（历史绑定照样全丢）。
 *    ⇒ 正确形态：`blockId = hash(块文本)` ⇒ **那段文字没变，id 就不变**。
 *
 * @param blockText - **块自己**的文本（不是整篇）。
 * @param fullText - 整篇正文（只用于切 prefix/suffix）。
 * @param index - 选中所在块的位置。
 * @param start - 选中起点（**在 `fullText` 里**的字符偏移，含）。
 * @param end - 选中终点（在 `fullText` 里，不含）。
 * @returns 锚点四元组。
 */
export function makeAnchor(
  blockText: string,
  fullText: string,
  index: number,
  start: number,
  end: number,
): ReadingAnchor {
  const exact = fullText.slice(start, end)
  return {
    blockId: hashText(blockText),
    index,
    exact,
    prefix: fullText.slice(Math.max(0, start - CONTEXT_CHARS), start),
    suffix: fullText.slice(end, end + CONTEXT_CHARS),
  }
}

/**
 * ⭐ **内容哈希**（`blockId` 用）。
 *
 * ⚠️ **刻意用「非加密 hash」**：这里要的是**同一份文本给同一个值**，
 * 不是防碰撞 —— 加密 hash 更慢，而这个值**每次渲染都会算一遍**。
 * ⚠️ **必须先规范化**（去首尾空白、压缩连续空白）—— 否则用户改一个换行
 * 就让锚点失效，而那段文字明明没变。
 */
export function hashText(text: string): string {
  const norm = text.trim().replace(/\s+/g, ' ')
  // FNV-1a（32 位）—— 快、无依赖、输出稳定。
  let h = 0x811c9dc5
  for (let i = 0; i < norm.length; i += 1) {
    h ^= norm.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).padStart(7, '0')
}

/**
 * ⭐ **在一个文档里重新定位锚点**（重解析/重抓取后救场用）。
 *
 * 三级降级，前一级命中就不走下一级：
 *   ① `exact` 在文里**只出现一次** ⇒ 直接用它（最可靠）；
 *   ② 加上 `prefix` 一起搜 ⇒ 消歧；
 *   ③ 都定位不到 ⇒ 返回 `undefined`（**调用方必须如实说"锚点失效"**，
 *      不要静默指向别处 —— 那是"界面撒谎"）。
 * @param fullText - 当前文档正文。
 * @param anchor - 旧锚点。
 * @returns 新的 `{start, end}`；定位不到 ⇒ `undefined`。
 */
export function relocateAnchor(
  fullText: string,
  anchor: ReadingAnchor,
): { start: number; end: number } | undefined {
  if (anchor.exact === '') return undefined

  const hits: number[] = []
  let from = 0
  for (;;) {
    const at = fullText.indexOf(anchor.exact, from)
    if (at < 0) break
    hits.push(at)
    from = at + 1
  }
  if (hits.length === 1) {
    const at = hits[0] as number
    return { start: at, end: at + anchor.exact.length }
  }
  if (hits.length > 1 && anchor.prefix !== '') {
    for (const at of hits) {
      const before = fullText.slice(Math.max(0, at - CONTEXT_CHARS), at)
      if (before === anchor.prefix) {
        return { start: at, end: at + anchor.exact.length }
      }
    }
  }
  return undefined
}

// ══════════════════════════════════════════════════════════════════════════
// bindings（jsonl）
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ **读全部绑定**。
 *
 * ⚠️ **用 jsonl 而不是 json**：可**追加**（并发写不丢、不需要读-改-写整份）；
 *    量小（一次阅读就几十条）⇒ 全量载入无压力。
 * ⚠️ **坏行跳过不抛**：一行写坏不该让整个功能瘫掉；但**要留痕**
 *    （否则"明明绑定过却看不到"会变成无声故障）。
 * @returns 绑定数组（按写入顺序）。
 */
export async function loadBindings(): Promise<ReadingBinding[]> {
  const text = await readTextIfExists(readingBindingsPath())
  if (text === undefined) return []
  const out: ReadingBinding[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t === '') continue
    try {
      const v = JSON.parse(t) as ReadingBinding
      // ⭐ 形状自检：缺关键字段的当作坏行（防"半个 JSON"被当成有效绑定）。
      if (typeof v.entryId === 'string' && typeof v.chatEntryId === 'string') out.push(v)
    } catch {
      /* 坏行：跳过（见上方注释） */
    }
  }
  return out
}

/**
 * ⭐ **追加一条绑定**（**唯一写入口**）。
 *
 * 🔴 **调用方必须先查过 `findBinding`** —— 本函数**不判重**：
 *    「同一段落复用已有会话」是**业务规则**（用户裁定），
 *    放在调用方（`ask`）更直观；这里保持"纯追加"的单一职责。
 * @param binding - 要追加的绑定。
 */
export async function appendBinding(binding: ReadingBinding): Promise<void> {
  await ensureDir(join(readingBindingsPath(), '..'))
  const line = `${JSON.stringify(binding)}\n`
  // ⚠️ **追加写**（不是读-改-写）—— jsonl 的全部意义所在。
  const { appendFile } = await import('node:fs/promises')
  await appendFile(readingBindingsPath(), line, 'utf8')
}

/**
 * ⭐ **按「源条目 + 段落」查绑定**（复用的判据）。
 *
 * 🔴🔴 **`blockId === ''` 时【永不复用】**（2026-10-20 加）。
 *
 *    背景：`blockId` 现在允许为空（那些前端匹配不到块的选区，见 `api.ts`
 *    的 `/reading/ask`）。若这里照常按 `entryId + ''` 去 `find`，
 *    **同一篇里所有"定位不到块"的提问会命中同一条绑定**
 *    ⇒ 用户在 A 段问一句、又在 B 段问一句 ⇒ 第二句被并进第一个会话里，
 *      而且 `renderAskPrompt` 引的还是 A 段的原文。
 *    ⭐ 那种串台是**静默的**（会话建出来了、也回答了，只是答的是另一段）。
 *
 *    ⇒ 判据：**空 blockId 表示"没有归类信息"，它不该被当成一个真实的键值。**
 *      语义上正确的做法是"每条都算新段落" —— 宁可多开一个会话，也不要串台。
 *      ⚠️ 本项目既有的偏置：**误合并会污染用户数据，多开一个只是多一个会话。**
 * @param entryId - 源条目 id。
 * @param blockId - 段落 blockId（**空串 = 不复用**）。
 * @returns 已有绑定；没有 ⇒ `undefined`。
 */
export async function findBinding(
  entryId: string,
  blockId: string,
): Promise<ReadingBinding | undefined> {
  // ⭐ 空 blockId 不是真实的块 ⇒ 不参与复用（理由见上面的注释）。
  if (blockId === '') return undefined
  const all = await loadBindings()
  return all.find((b) => b.entryId === entryId && b.anchor.blockId === blockId)
}

/**
 * ⭐ **某条目下的全部绑定**（文档页「本篇的会话」用）。
 * @param entryId - 源条目 id。
 * @returns 绑定数组（按写入顺序）。
 */
export async function bindingsForEntry(entryId: string): Promise<ReadingBinding[]> {
  const all = await loadBindings()
  return all.filter((b) => b.entryId === entryId)
}

/**
 * ⭐⭐ **按会话 id 反查绑定**（轮末同步的**第一道门**）。
 *
 * 🔴 **为什么这是第一道门**：用户明确裁定「只同步**从提问入口产生的会话**」。
 *    ⇒ 判据就是"这个 sessionId 在不在 `bindings` 里"。
 *    ⚠️ 绝不能退化成"所有会话都同步"——那会让**每一次普通对话**都往库里
 *    写一条 chat 条目，库被会话流水淹没（而用户要的是"问答沉淀成知识"）。
 *
 * @param sessionId - DSH 会话 id。
 * @returns 绑定；不是提问入口 ⇒ `undefined`。
 */
export async function findBindingBySession(
  sessionId: string,
): Promise<ReadingBinding | undefined> {
  const all = await loadBindings()
  return all.find((b) => b.sessionId === sessionId)
}

/**
 * ⭐⭐ **按 chat 条目 id 反查绑定**（「返回源知识」按钮的判据）。
 *
 * 🔴 **为什么需要它**：`chat` 条目的详情页要能显示「↩ 返回源知识」，
 *    而它需要知道**源条目 id + 那段节选是哪个块** —— 这两样只在 `bindings` 里。
 *    ⚠️ 封面上的 `source` 只有 `sessionId`（那是给「去会话」用的），
 *      **不含源条目信息** ⇒ 必须查这里。
 *
 * ⚠️ **一对一吗**：一条 chat 条目对应一个 `(entryId, blockId)` 绑定
 *    （用户裁定"同一段节选开一个会话"）⇒ 取第一条即可。
 *    但**仍写成 `find` 而不是假定唯一**（数据是外部可改的文本文件，
 *    万一被手工编辑出重复，这里不该崩）。
 *
 * @param chatEntryId - `kind: chat` 条目 id。
 * @returns 绑定；不是问答条目 ⇒ `undefined`。
 */
export async function findBindingByChatEntry(
  chatEntryId: string,
): Promise<ReadingBinding | undefined> {
  const all = await loadBindings()
  return all.find((b) => b.chatEntryId === chatEntryId)
}

/**
 * ⭐ **数某条 chat 条目已有几轮问答**（决定下一轮的 `Q几` 编号）。
 *
 * ⚠️ **按 `#### Q` 标题数**，不按 `---` 数：分隔线在首轮占位尾注里也有一个，
 *    数它会多数一个。
 * @param chatEntryId - chat 条目 id。
 * @returns 轮数（条目不存在 ⇒ 0）。
 */
export async function countChatTurns(chatEntryId: string): Promise<number> {
  const found = (await scanLibrary()).covers.find((c) => c.cover.id === chatEntryId)
  if (found === undefined) return 0
  const doc = await loadEntryDoc(found.cover.ref, false)
  if (doc === undefined) return 0
  const m = doc.body.match(/^#### Q\d+：/gm)
  return m === null ? 0 : m.length
}

// ══════════════════════════════════════════════════════════════════════════
// 可讨论的块（`/reading/blocks` —— 段落标记的数据源）
// ══════════════════════════════════════════════════════════════════════════

/** 一个「可讨论的块」：内容哈希 + 供前端匹配 DOM 的纯文本。 */
export interface ReadingBlock {
  /** 内容哈希（锚点主键）。 */
  blockId: string
  /**
   * ⭐ **去掉 markdown 行内标记后的纯文本** —— 前端拿它与 DOM 的
   * `textContent` 比对（浏览器渲染后 `**` 就没了）。
   */
  plain: string
  /** 该块在正文里的序号（0 起）。 */
  index: number
  /**
   * ⭐⭐⭐ **这一块在浏览器里会渲染成哪些「叶子文本」**（2026-10-20 新增）。
   *
   * ── 🔴🔴 为什么需要它（实测 5816 个块里 17.5% 因此**永远匹配不上**）──
   * 原来前端只拿 `plain` 与**单个** DOM 元素的 `textContent` 做字面比对。
   * 而 `plain` 里**保留了 markdown 的结构记号**，浏览器却不显示它们：
   *
   * | `plain` 实际长这样 | 浏览器 DOM | 结果 |
   * |---|---|---|
   * | `第 20 集说过：不能只看谁闲…` | `<p>` | ✅ 匹配 |
   * | `而这条请求…\n>\n> ⚠️ 前提是…` | `<p>` + `<blockquote><p>` | ❌ **`>` 不在 textContent 里** |
   * | `\| 部分 \| token 数 \|…`（多行） | 一个 `<td>` 一个元素 | ❌ 整表拼不成一个元素 |
   *
   * ⭐ 所以**不是"少配了几种"，是"拿一段含结构记号的文本去比一个不含它的 DOM"**。
   * ⇒ 正确做法：**服务端把这一块拆成若干「叶子行」**（每行 = 未来某个 DOM 叶子
   * 元素的 textContent），前端逐行去 DOM 里找，找到哪行就给那个元素打 id。
   *
   * ⚠️ **`plain` 仍然保留**（既有绑定、既有测试、以及"整块匹配"那条快路径都靠它）
   * —— 这个字段只增不改，老数据与老调用方零影响。
   */
  lines: string[]
}

/**
 * ⭐⭐ **把一块 markdown 拆成"将来会是 DOM 叶子元素"的若干行纯文本**。
 *
 * 拆法对着**浏览器渲染结果**来，不是对着 markdown 语法来 ——
 * 这是本函数唯一要遵守的规矩（漂移的表现是"标记又不显示"，
 * 且**不报任何错**，所以每一步都写了它对应的 DOM 形态）。
 *
 * | markdown 形态 | 拆成几行 | 浏览器里是 |
 * |---|---|---|
 * | 普通段落（可含软换行） | **1 行**（换行折成空格） | 一个 `<p>` |
 * | `> 引用`（含 `>` 续行） | **每段文本 1 行**（去掉 `>`） | `<blockquote>` 里的 `<p>` |
 * | `\| a \| b \|` 表格 | **每个单元格 1 行**（去掉 `\|` 与分隔行） | `<td>` / `<th>` |
 * | `- x` / `1. x` 列表 | **每项 1 行**（去掉项目符号） | `<li>` |
 * | 标题 `## x` | 1 行（去掉 `#`） | `<h1>`–`<h4>` |
 *
 * 🔴 **表格的分隔行（`\|---\|---\|`）必须丢掉** —— 它不是文本，浏览器里根本
 *    不存在对应元素；留着会让"整表"那条判据永远拼不齐。
 *
 * ⚠️ **行内代码/粗体/链接仍走 `stripInlineMarkdown`** —— 与 `plain` 同一套剥法，
 *    否则同一个块里两个字段的口径会分家。
 * @param block - 一块 markdown 原文（已 `trim`）。
 * @returns 纯文本行（已 trim、空行已丢）。
 */
export function blockLeafLines(block: string): string[] {
  const out: string[] = []
  const push = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim()
    if (t !== '') out.push(t)
  }

  // ── 表格：每个数据行拆成单元格 ──
  if (/^\s*\|/.test(block)) {
    const rows = block.split('\n').filter((l) => l.trim().startsWith('|'))
    for (const row of rows) {
      // ⚠️ 分隔行：`|---|---|` 或 `|:--:|--:|`，全部由 `-`/`:`/`|`/空白组成。
      if (/^\s*\|[\s:|-]+\|?\s*$/.test(row) && row.includes('-')) continue
      const cells = row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
      for (const cell of cells) {
        const t = stripInlineMarkdown(cell)
        // ⚠️ 单元格为空是合法的（GFM 允许），但**不要 push 空串**——
        //    空串会匹配到 DOM 里所有空元素（`byPlain` 里就是被这样排除掉的）。
        if (t !== '') push(t)
      }
    }
    return out
  }

  // ── 块引用：去掉 `>` 后按"空引用行"分段 ──
  if (/^\s*>/.test(block)) {
    // ⚠️ 用 `cur` 而不是 `segs[last]` —— 本仓开了 `noUncheckedIndexedAccess`，
    //    下标访问的类型是 `T | undefined`（而且这里本来就该用"当前段"这个概念）。
    let cur: string[] = []
    const flush = () => {
      if (cur.length > 0) push(stripInlineMarkdown(cur.join('\n')))
      cur = []
    }
    for (const line of block.split('\n')) {
      const s = line.replace(/^\s*>\s?/, '')
      // ⚠️ 引用里的"空行"在 markdown 里写作单独的 `>` 或 `> `，
      //    去掉 `>` 后就是空串 ⇒ 这里把它当**段落分隔**处理
      //    （浏览器渲染成两个相邻的 `<p>`，正是两个可匹配的叶子）。
      if (s.trim() === '') { flush(); continue }
      cur.push(s)
    }
    flush()
    // ⚠️ 引用块里可能嵌了列表（`> - x`）⇒ 这一步没拆它。
    //    **刻意不拆**：那种形态极罕见，而多拆一层就要多一份"与浏览器对齐"的责任，
    //    拆错的表现是静默不匹配（本函数存在的理由就是避免这个）。
    return out
  }

  // ── 列表：每项一行 ──
  const lines = block.split('\n')
  const isList = lines.length > 0 && lines.every((l) => /^\s*(?:[-*+]|\d+\.)\s+/.test(l))
  if (isList) {
    for (const l of lines) push(stripInlineMarkdown(l))
    return out
  }

  // ── 其它（标题 / 普通段落 / 单行）：整块一行，软换行折成空格 ──
  push(stripInlineMarkdown(block))
  return out
}

/**
 * ⭐⭐ **从 markdown 正文抽出「可讨论的块」**（`/reading/blocks` 的数据源）。
 *
 * 🔴🔴 **为什么这件事必须由服务端做**（真机探针抓到的设计缺陷）：
 *    前端只有**渲染后**的 DOM，`textContent` 里 `**粗体**` 的星号已经没了
 *    ⇒ 它按 `textContent` 算哈希，与后端按 **markdown 原文**算的**永远对不上**
 *    ⇒ 段落标记永远不显示，而且**不报任何错**。
 *    ⭐ 实测：`三科均满分 100、**70 分（含）以上合格**，闭卷机考。` 两边算出
 *      `1mpx8by`（原文）vs `191ccmm`（渲染后）—— 差的就是那两个 `**`。
 *
 * ⇒ ⭐ **判据：内容哈希必须由「拥有原文的那一侧」算**。
 *    前端拿到这份清单后，按 `plain` 去 DOM 里找对应元素（见
 *    `app.js` 的 `markReadingBlocks`），**自己不哈希**。
 *
 * ⚠️ **粒度**：按**空行切段**（与 `marked` 的块级输出大体一致）；
 *    段内若全是列表行，则**每行一块**（浏览器里那是多个 `<li>`）。
 * @param body - markdown 正文。
 * @returns 块清单（保持正文顺序）。
 */
export function extractReadingBlocks(body: string): ReadingBlock[] {
  const out: ReadingBlock[] = []
  const paras = body.split(/\n{2,}/)
  let index = 0
  for (const para of paras) {
    const trimmed = para.trim()
    if (trimmed === '') continue
    // ⚠️ 代码围栏整块跳过（那是示例，不是可讨论的正文）——
    //    与前端 `markReadingBlocks` 里 `closest('pre')` 的排除对齐。
    if (trimmed.startsWith('```')) continue
    const lines = trimmed.split('\n')
    const isList = lines.length > 1 && lines.every((l) => /^\s*(?:[-*+]|\d+\.)\s+/.test(l))
    const chunks = isList ? lines : [trimmed]
    for (const c of chunks) {
      // ⚠️ 表格行（`| a | b |`）也当一块：浏览器里是 `<tr>`/`<td>`。
      const plain = stripInlineMarkdown(c)
      if (plain === '') continue
      // 🔴🔴 **`blockId` 必须用【原文】算，不能用 `plain`** ——
      //    锚点的写入侧（`makeAnchor(blockText, …)`，`blockText` 是 markdown 原文）
      //    用的就是原文哈希 ⇒ 这里若用剥掉 `**` 的 `plain` 算，两边又对不上
      //    （实测：原文 `1mpx8by` vs 剥标记 `191ccmm`），段落标记照样不显示。
      //    ⭐ **`plain` 只服务一件事：给前端匹配 DOM**（浏览器里没有 `**`）。
      //    两个字段各司其职，别拿错。
      out.push({ blockId: hashText(c), plain, index, lines: blockLeafLines(c) })
      index += 1
    }
  }
  return out
}

/**
 * ⭐ **去掉 markdown 行内标记**（粗体/斜体/行内代码/链接/列表前缀）。
 *
 * ⚠️ **只处理"影响 `textContent`"的那几种** —— 多剥一种就多一处
 *    与浏览器实际行为的漂移风险，而漂移的后果是**静默的**（标记不显示）。
 *
 * 🔴 **必须与 `hashText` 的规范化口径一致**：`hashText` 内部会
 *    `trim + 压缩连续空白`，所以本函数返回值里保留的空白形态**不影响哈希**；
 *    但**前端拿 `plain` 与 `textContent` 比对时是字面比较**
 *    ⇒ 这里两端必须 trim（否则"看起来一样"的两串不相等）。
 * @param s - 一段 markdown 文本。
 * @returns 纯文本（**与浏览器 `textContent` 对齐**）。
 */
export function stripInlineMarkdown(s: string): string {
  let t = s.trim()
  // 块级前缀（标题 / 列表 / 引用）
  t = t.replace(/^#{1,6}\s+/, '')
  t = t.replace(/^(?:[-*+]|\d+\.)\s+/, '')
  t = t.replace(/^>\s*/, '')
  // 行内代码
  t = t.replace(/`([^`]*)`/g, '$1')
  // 粗体 / 斜体（先长后短，否则 `***x***` 会被拆错）
  t = t.replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1')
  t = t.replace(/__([^_]+)__/g, '$1')
  // ⚠️ 单个 `*x*` 放最后：前面两步已把 `**`/`***` 处理掉，
  //    这里只管剩下的单星号（用非贪婪 + 前后不留星号避免误吞）。
  t = t.replace(/\*([^*]+)\*/g, '$1')
  // 链接 [文本](地址) ⇒ 文本
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  return t.trim()
}

// ══════════════════════════════════════════════════════════════════════════
// cursors（增量游标）
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ **读全部同步游标**（`sessionId → capturedThroughSeq`）。
 *
 * 🔴 **为什么必须落盘**（红线 2）：只存内存 ⇒ 重启后游标归零 ⇒
 *    下一轮 `turn/end` 会把**整段会话历史**当增量 ⇒ chat 条目被**重复追加**。
 *    ⭐ 这正是 memj 踩过的同族坑（`4f83edd9`），不要再踩一次。
 * @returns 游标表；文件不存在 ⇒ 空表。
 */
export async function loadCursors(): Promise<Record<string, number>> {
  const text = await readTextIfExists(readingCursorsPath())
  if (text === undefined) return {}
  try {
    const v = JSON.parse(text) as Record<string, number>
    return typeof v === 'object' && v !== null ? v : {}
  } catch {
    return {}
  }
}

/**
 * ⭐ **更新一个会话的游标**。
 *
 * ⚠️ **读-改-写整份**：游标表很小（一次阅读几十条），
 *    且**需要按 sessionId 覆写**（jsonl 那种追加语义不适用）。
 * @param sessionId - 会话 id。
 * @param throughSeq - 已同步到的最高 seq。
 */
export async function saveCursor(sessionId: string, throughSeq: number): Promise<void> {
  const cur = await loadCursors()
  cur[safeName(sessionId)] = throughSeq
  await writeTextAtomic(readingCursorsPath(), `${JSON.stringify(cur, null, 2)}\n`)
}

// ══════════════════════════════════════════════════════════════════════════
// state（阅读位置）
// ══════════════════════════════════════════════════════════════════════════

/** 读阅读位置（文件不存在 ⇒ 空状态）。 */
export async function loadReadingState(): Promise<ReadingState> {
  const text = await readTextIfExists(readingStatePath())
  if (text === undefined) return { positions: {} }
  try {
    const v = JSON.parse(text) as ReadingState
    return typeof v?.positions === 'object' && v.positions !== null ? v : { positions: {} }
  } catch {
    return { positions: {} }
  }
}

/**
 * 记住「某条目读到哪里」。
 * @param entryId - 条目 id。
 * @param blockId - 读到的 blockId。
 */
export async function saveReadingPosition(entryId: string, blockId: string): Promise<void> {
  const st = await loadReadingState()
  st.positions[entryId] = blockId
  await writeTextAtomic(readingStatePath(), `${JSON.stringify(st, null, 2)}\n`)
}

// ══════════════════════════════════════════════════════════════════════════
// chat 条目
// ══════════════════════════════════════════════════════════════════════════

/** chat 条目的正文初始形态（首轮之前）。 */
export const CHAT_ENTRY_KIND = 'chat'

/**
 * ⭐ **渲染 chat 条目的正文**。
 *
 * 🔴 **必须以 `###` 开头**：`extractTitle(body, '###')` 靠它做标题兜底
 *    （虽然 frontmatter 的 `title` 才是权威来源，决策 98）。
 * @param sourceTitle - 被提问的那条知识的标题。
 * @param anchor - 段落锚点。
 * @returns 正文 markdown。
 */
export function renderChatEntryBody(sourceTitle: string, anchor: ReadingAnchor): string {
  return [
    `### 《${sourceTitle}》· 段落讨论`,
    '',
    `**来源条目**：《${sourceTitle}》　**段落**：\`${anchor.blockId}\``,
    '',
    '**被讨论的原文**：',
    '',
    `> ${anchor.exact}`,
    '',
    '---',
    '',
    '_（问答将随会话自动追加到这里。）_',
    '',
  ].join('\n')
}

/**
 * ⭐ **把一轮问答渲染成正文片段**（追加用）。
 * @param question - 用户的提问。
 * @param answer - 模型的回答（**只要 text block**，见 `sync.ts` 的过滤）。
 * @param roundNo - 第几轮（从 1 开始）。
 * @returns 要追加的 markdown 片段。
 */
export function renderChatTurn(roundNo: number, question: string, answer: string): string {
  return [
    '',
    `#### Q${roundNo}：${question.trim()}`,
    '',
    answer.trim(),
    '',
    '---',
    '',
  ].join('\n')
}

/**
 * ⭐ **建一条 chat 条目**（正文 + 封面 + 挂到源条目所属项目）。
 *
 * 🔴 **为什么归属 = 源条目的项目**：用户要在知识库里按项目浏览这些问答
 *    （"这篇的会话"），而 memj 的组织方式就是「项目 → 主题 → 全局」。
 *    ⇒ 挂在同一项目下，它才能与被讨论的那条知识**出现在一起**。
 *
 * ⚠️ **不挂主题**（`theme: []`）：它是**派生的对话记录**，不是独立知识，
 *    挂主题会让它在主题层被当成一条"知识"检索/注入（而 `chat` 在模型侧已被排除，
 *    但主题页的人侧列表会多出一条看不懂的东西）。
 *
 * ⚠️ **封面块必须并进项目文档**——只写 `entries/` 下的正文文件是不够的：
 *    memj 的封面**只存在于项目文档里**（`parseCovers` 从那儿读）⇒ 不并进去
 *    等于这条知识**不存在**（`scanLibrary` 扫不到）。
 *
 * @param sourceEntryId - 被提问的那条知识 id。
 * @param sourceTitle - 被提问的那条知识标题。
 * @param anchor - 段落锚点。
 * @param sessionId - 产生它的 DSH 会话 id（写进 frontmatter `source.sessionId`）。
 * @returns 新建条目的 id；失败 ⇒ `undefined`（并给出原因）。
 */
export async function createChatEntry(
  sourceEntryId: string,
  sourceTitle: string,
  anchor: ReadingAnchor,
  sessionId: string,
): Promise<{ id: string } | { error: string }> {
  const snapshot = await scanLibrary()
  const src = snapshot.covers.find((c) => c.cover.id === sourceEntryId)
  if (src === undefined) return { error: `找不到源条目 \`${sourceEntryId}\`。` }
  const project = src.cover.project
  if (project === '') {
    return { error: `源条目 \`${sourceEntryId.slice(0, 8)}\` 没有项目归属 ⇒ chat 条目无处可挂。` }
  }

  const id = randomUUID()
  const nowIso = new Date().toISOString()
  /**
   * ⭐⭐ **标题必须带段落摘录** —— 真机验收时发现的可用性缺陷：
   *    写死成 `《标题》问答` 的话，同一篇知识的**每一条**问答条目
   *    标题**完全一样**（实测列表里连着 5 条一模一样，只有时间不同）
   *    ⇒ 用户**分不清哪条是哪段** ⇒ 那个列表就没法用。
   *    ⚠️ 上限 48 字符（`Cover.title` 的硬校验）⇒ 先给书名留位置再截段落。
   */
  const snippet = stripInlineMarkdown(anchor.exact).slice(0, 16)
  const title = (snippet === '' ? `《${sourceTitle}》问答` : `《${sourceTitle}》· ${snippet}…`).slice(0, 48)
  const cover: Cover = {
    id,
    project,
    theme: [],
    global: false,
    kind: 'chat',
    tags: ['reading-chat'],
    title,
    // ⭐ desc 是**检索键**；chat 不参与检索，但它仍会出现在列表里
    //    ⇒ 写清楚"这是什么 + **哪一段** + 该去哪儿看"。
    //    ⚠️ **带上段落摘录**（同 `title` 的理由：同篇知识的多个问答要能分清）。
    desc: (
      snippet === ''
        ? `阅读《${sourceTitle}》时就某段落的问答记录（随会话追加）。`
        : `阅读《${sourceTitle}》时就「${snippet}…」一段的问答记录（随会话追加）。`
    ).slice(0, 200),
    ref: entryRelPath(`chat-${anchor.blockId}`, id),
    ext: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    archivedAt: '',
    /**
     * 🔴🔴 **`source` 必须写在【封面】上，不只是正文 frontmatter** ——
     *     真机探针当场抓到：只传给 `writeEntryDoc`（它只写**正文**的 frontmatter）
     *     ⇒ `cover.source` 是空对象 ⇒ 前端「去会话」按钮拿不到 sessionId
     *     ⇒ **按钮永远不渲染**（而现象是"没有按钮"，不像报错，极易漏过）。
     *     ⭐ 判据：**前端读的是封面侧**（`api.ts` 的两个接口都只扫封面、
     *       不读正文 frontmatter —— 那是为了不读文件）⇒ 封面必须有。
     *     ⚠️ 这也正是第 2 批把 `source` 加进 `Cover` 类型的原因（当时就为此）。
     */
    ...(sessionId !== '' ? { source: { sessionId, from: 'reading-ask' } } : {}),
  }

  // ① 正文落盘（`writeEntryDoc` 是唯一入口：它管 path/slug 规范与 frontmatter）。
  await writeEntryDoc(cover, `chat-${anchor.blockId}`, renderChatEntryBody(sourceTitle, anchor), {
    sessionId,
    from: 'reading-ask',
  })

  // ② 封面并进项目文档（否则 `scanLibrary` 扫不到它）。
  const doc = await loadProjectDoc(project)
  if (doc === undefined) return { error: `找不到项目文档 \`${project}\`。` }
  await writeProjectDoc(project, doc.frontmatter, doc.narrative, [...doc.covers, cover], doc.orphans)

  return { id }
}

/**
 * ⭐ **给 chat 条目追加一轮问答**。
 *
 * ⚠️ **走 `updateEntry(id, {body})`**（正规通道）而不是自己读-改-写：
 *    它会同步封面 frontmatter、刷 `updatedAt`、并 `rebuildDerivedLayers()`。
 * 🔴 **但它是"整篇替换"** ⇒ 调用方必须先把「旧正文 + 新片段」拼好再传。
 *    这正是方案里说的"只追加本轮增量"：**读一次旧的、拼上新的、写一次**
 *    —— 不是把整段会话历史重放一遍。
 * @param chatEntryId - chat 条目 id。
 * @param fragment - 本轮片段（`renderChatTurn` 的产物）。
 * @returns 是否成功（附原因）。
 */
export async function appendChatTurn(
  chatEntryId: string,
  fragment: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // ⭐ 一次扫描同时拿 ref（`loadEntryDoc` 要它）与存在性。
  const found = (await scanLibrary()).covers.find((c) => c.cover.id === chatEntryId)
  if (found === undefined) return { ok: false, error: `找不到 chat 条目 \`${chatEntryId}\`。` }
  const doc = await loadEntryDoc(found.cover.ref, false)
  if (doc === undefined) return { ok: false, error: `chat 条目 \`${chatEntryId}\` 的正文读不到（\`${found.cover.ref}\`）。` }
  // ⭐ 把占位尾注换成分割线（首轮之后就不需要那句"将自动追加"了）。
  const base = doc.body.replace(/\n_（问答将随会话自动追加到这里。）_\n/, '\n')
  const r = await updateEntry(chatEntryId, { body: base + fragment })
  if (!r.ok) return { ok: false, error: r.message }
  return { ok: true }
}
