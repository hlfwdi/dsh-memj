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
 * @param entryId - 源条目 id。
 * @param blockId - 段落 blockId。
 * @returns 已有绑定；没有 ⇒ `undefined`。
 */
export async function findBinding(
  entryId: string,
  blockId: string,
): Promise<ReadingBinding | undefined> {
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
  const title = `《${sourceTitle}》问答`.slice(0, 48)
  const cover: Cover = {
    id,
    project,
    theme: [],
    global: false,
    kind: 'chat',
    tags: ['reading-chat'],
    title,
    // ⭐ desc 是**检索键**；chat 不参与检索，但它仍会出现在列表里
    //    ⇒ 写清楚"这是什么 + 该去哪儿看"，别让人以为是普通知识。
    desc: `阅读《${sourceTitle}》时就某段落的问答记录（随会话追加）；原文见正文，会话见 frontmatter source.sessionId。`.slice(0, 200),
    ref: entryRelPath(`chat-${anchor.blockId}`, id),
    ext: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    archivedAt: '',
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
