/**
 * 标签规范词表（决策 162）。
 *
 * ── 它解决什么 ────────────────────────────────────────────────────────────
 * `tags` 从第一天起就是**自由格式**（决策 81：*"`kind` 用固定 enum 补上治理缺口，
 * `tags` 继续承担**自由补充**的角色"*）。实测（生产库 335 张封面、2026-09-28）：
 * **807 个不同 tag，571 个（70.8%）只出现 1 次**；8 组大小写同名
 * （`dsh` 51 vs `DSH` 24）；**243 对包含关系** ⇒ 作为聚合维度**不可用**。
 *
 * ⇒ 本模块是那张**规范词表**：canonical（规范词）+ aliases（同义词）。
 *   工具每次裁决完把结论**积累**进来 ⇒ 库越用越干净，而不是每次从零判。
 *
 * ── 🔴🔴 它是 source data，不是 derived data ──────────────────────────────
 * | | `recall/en-index.json` | `tags/vocabulary.json`（本文） |
 * |---|---|---|
 * | 怎么来 | **纯投影**（重翻就能重建） | **积累的判断**（人和 LLM 的裁决） |
 * | 丢了 | 重跑就有 | 🔴 **永久丢失** |
 * | 所以 | 全量重建 + diff | ⚠️ **只能增量对账，绝不"重建"** |
 *
 * ⚠️ **别照抄 `en-index` 那套重建逻辑**——它会**静默抹掉**所有积累的裁决，
 * 而且看起来像"修好了"（条数对、结构对、就是判断没了）。
 *
 * ── 结构 ──────────────────────────────────────────────────────────────────
 * ```json
 * {
 *   "version": 1,
 *   "lastRunAt": "2026-09-28T12:00:00.000Z",
 *   "canonical": {
 *     "静默失败": { "aliases": ["静默失效"], "en": "silent failure" }
 *   }
 * }
 * ```
 * ⭐ **`lastRunAt`（水位线）与词表同一个文件**（用户 2026-09-28 裁定）：
 * 它俩要么一起更新、要么一起不动——分成两个文件就会出现
 * "**水位线推了、词表没落盘**" ⇒ **那批新 tag 永久跳过**。
 *
 * ⚠️ **不存 `count`（频次）**：每次现算。存了必然过期（本项目老坑）。
 *
 * @module dsh-memj/tag-vocab
 */
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { tagVocabularyPath } from './paths.ts'

/** 词表里一个规范词。 */
export interface CanonicalTag {
  /**
   * 同义词（**指向这个 canonical** 的所有写法）。
   *
   * ⚠️ **可以含其它语言**（`silent failure` 也能当 alias）——语言不是这里的轴，
   * **同义才是**（决策 162）。库里 613 个中文 tag 是既成事实，**不强制英文**。
   */
  aliases: string[]
  /**
   * ⭐ 英文规范词（**给 JEV 这类中文不好的模型用**，用户 2026-09-28 要求）。
   *
   * 🔴 **它是【派生字段】，不是独立词表** —— 由 C 层从 canonical **1:1 翻译**而来
   * ⇒ 库里**不存在自由生长的英文 tag** ⇒ **无需对英文做归一**（没有分裂的可能）。
   * ⭐ 做成 canonical 上的字段还有个好处：**删 canonical 时它跟着走，不留孤儿**。
   * ⚠️ 空串 = 还没生成（不是错误）。
   */
  en: string
}

/** 词表。 */
export interface TagVocabulary {
  version: 1
  /** ⭐ 水位线：上次处理到什么时候（`updatedAt > lastRunAt` 才算新的）。 */
  lastRunAt: string
  /** 规范词 → 信息。 */
  canonical: Record<string, CanonicalTag>
}

/** 空词表（首次使用）。 */
export function emptyVocabulary(nowIso: string): TagVocabulary {
  return { version: 1, lastRunAt: nowIso, canonical: {} }
}

/**
 * 读词表；不存在或损坏 ⇒ `undefined`（**不抛**）。
 *
 * ⚠️ **损坏时回 `undefined` 而不是空表**：空表会让调用方以为"库里一个词都没有"，
 * 从而把**全库 tag 当新词**重新裁决一遍（白花一大笔 token，还可能得出不同结论）。
 * ⇒ 判据：**"读不出来"与"确实是空的"必须区分**。
 * @returns 词表；不存在/损坏时 `undefined`。
 */
export async function loadVocabulary(): Promise<TagVocabulary | undefined> {
  let text: string
  try {
    text = await readFile(tagVocabularyPath(), 'utf8')
  } catch {
    return undefined
  }
  try {
    const p = JSON.parse(text) as TagVocabulary
    if (p?.version !== 1 || typeof p.canonical !== 'object' || p.canonical === null) return undefined
    if (typeof p.lastRunAt !== 'string') return undefined
    // 逐条净化：aliases 必须是字符串数组，en 必须是字符串（防手改坏格式后静默出错）。
    const cleaned: Record<string, CanonicalTag> = {}
    for (const [k, v] of Object.entries(p.canonical)) {
      if (k.trim() === '') continue
      const raw = (v ?? {}) as { aliases?: unknown; en?: unknown }
      cleaned[k] = {
        aliases: Array.isArray(raw.aliases)
          ? raw.aliases.map((a) => String(a).trim()).filter((a) => a !== '' && a !== k)
          : [],
        en: typeof raw.en === 'string' ? raw.en.trim() : '',
      }
    }
    return { version: 1, lastRunAt: p.lastRunAt, canonical: cleaned }
  } catch {
    return undefined
  }
}

/** 原子写词表（`mode 0o600`，与 `en-index.json` 同手法）。 */
export async function saveVocabulary(vocab: TagVocabulary): Promise<void> {
  const target = tagVocabularyPath()
  await mkdir(dirname(target), { recursive: true })
  await writeFileAtomic(target, `${JSON.stringify(vocab, null, 1)}\n`, { mode: 0o600, dirMode: 0o700 })
}

/**
 * 建一张「词 → canonical」的反查表（**含 canonical 自身**）。
 *
 * ⭐ **canonical 自身也映射到自己**：这样 `resolveTag` 对"已经是规范词"的输入
 * 返回它自己，调用方**不必先判它是不是 canonical**（少一处漏判的机会）。
 * @param vocab - 词表。
 * @returns 反查表。
 */
export function aliasIndex(vocab: TagVocabulary): Map<string, string> {
  const m = new Map<string, string>()
  for (const [canon, info] of Object.entries(vocab.canonical)) {
    m.set(canon, canon)
    for (const a of info.aliases) {
      // ⚠️ **先到先得**：同一 alias 指向两个 canonical 是**冲突**
      //    （`findAliasConflicts` 会报出来，这里不静默覆盖成"后一个赢"）。
      if (!m.has(a)) m.set(a, canon)
    }
  }
  return m
}

/**
 * ⭐⭐ **解析一个 tag 到它的 canonical**（纯查表，**零 LLM**）。
 *
 * ⇒ 这是「应用层」的核心：**便宜、可对全库跑**。
 * @param tag - 原始 tag。
 * @param idx - `aliasIndex()` 的产物。
 * @returns canonical；**词表里没有**时 `undefined`（= 待裁决的新词）。
 */
export function resolveTag(tag: string, idx: ReadonlyMap<string, string>): string | undefined {
  return idx.get(tag.trim())
}

/**
 * 检出 alias 冲突（同一 alias 指向多个 canonical）。
 *
 * 🔴 **必须报错而不是"后来者覆盖"**：那会让裁决结果取决于**对象键序**
 * （同一份词表两次读可能给出不同结果），是最难查的一类不一致。
 * @param vocab - 词表。
 * @returns 冲突清单（alias + 它指向的多个 canonical）。
 */
export function findAliasConflicts(vocab: TagVocabulary): Array<{ alias: string; targets: string[] }> {
  const seen = new Map<string, Set<string>>()
  for (const [canon, info] of Object.entries(vocab.canonical)) {
    for (const a of info.aliases) {
      if (!seen.has(a)) seen.set(a, new Set())
      seen.get(a)?.add(canon)
    }
  }
  const out: Array<{ alias: string; targets: string[] }> = []
  for (const [alias, targets] of seen) {
    if (targets.size > 1) out.push({ alias, targets: [...targets].sort() })
  }
  return out.sort((a, b) => a.alias.localeCompare(b.alias))
}

/**
 * 把一组合并映射**解析成最终形态**（处理传递合并与环）。
 *
 * 例：`{A→B, B→C}` ⇒ `{A→C, B→C}`；`{A→B, B→A}` ⇒ 判为环、整组拒绝。
 *
 * 🔴 **为什么必须做**：LLM 一次给出多条映射时，完全可能 `A→B` 而 `B` 自己也
 * 被并走了。若原样应用，**先改 A 成 B、再把 B 改成 C** ⇒ 取决于顺序
 * （本项目"顺序敏感的静默错误"老坑）。⇒ 先归一成**指向终点**的形态。
 * @param merge - 原始映射。
 * @returns `ok:false` 时带环里的词。
 */
export function resolveMerges(
  merge: Readonly<Record<string, string>>,
): { ok: true; map: Record<string, string> } | { ok: false; cycle: string[] } {
  const map: Record<string, string> = {}
  for (const [from, to] of Object.entries(merge)) {
    const f = from.trim()
    const t = to.trim()
    if (f === '' || t === '' || f === t) continue
    map[f] = t
  }
  const final: Record<string, string> = {}
  for (const start of Object.keys(map)) {
    const path: string[] = [start]
    let cur = map[start]
    while (cur !== undefined && map[cur] !== undefined) {
      if (path.includes(cur)) return { ok: false, cycle: [...path, cur] }
      path.push(cur)
      cur = map[cur]
    }
    final[start] = cur ?? start
  }
  return { ok: true, map: final }
}

/**
 * 应用合并后的 canonical 是否会**自相矛盾**（两个 canonical 并到同一个目标）。
 *
 * ⚠️ 这**不是错误**（合法且常见），但调用方要**把它们合成一条**——
 * 否则会留下两个 canonical 指向同一目标，`aliasIndex` 就会报冲突。
 * @param vocab - 词表。
 * @param merges - 已解析的合并映射（`resolveMerges` 的产物）。
 * @returns 新的 `canonical` 表（canonical 自身被并走时，其 aliases 归到目标名下）。
 */
export function applyMerges(
  vocab: TagVocabulary,
  merges: Readonly<Record<string, string>>,
): TagVocabulary {
  const next: Record<string, CanonicalTag> = {}
  for (const [canon, info] of Object.entries(vocab.canonical)) {
    const target = merges[canon] ?? canon
    if (!next[target]) next[target] = { aliases: [], en: '' }
    // 被并走的 canonical 自己降级成一条 alias（它的 aliases 一并带过去）
    if (target !== canon) next[target].aliases.push(canon)
    for (const a of info.aliases) {
      const at = merges[a] ?? a
      if (at !== target) next[target].aliases.push(a)
    }
    // ⭐ 英文：**目标没有就继承来源的**（别把已经翻好的英文丢掉）
    if (next[target].en === '') next[target].en = info.en
  }

  // 🔴🔴 **必须补这一步**：上面的循环只覆盖【已在词表里的 canonical】，
  //    而**最常见的一类裁决恰恰是「【新词】并进某个已有 canonical」** ——
  //    `静默故障 → 静默失败` 里 `静默故障` **根本不在词表里** ⇒ 上面那圈永远碰不到它
  //    ⇒ 结论会被**静默丢掉**（词表说"合并了"，数据里却什么都没变）。
  //    ⚠️ 我第一版就是漏了这一段，是**端到端测试**（带打桩 LLM）才抓出来的
  //      —— 纯函数测试只喂了"两个都在词表里"的映射，**照不到这条路径**。
  for (const [from, to] of Object.entries(merges)) {
    if (to === from) continue
    // 目标可能也还不存在（新词 → 另一个新词）⇒ 先建出来
    if (!next[to]) next[to] = { aliases: [], en: '' }
    if (from !== to) next[to].aliases.push(from)
    // 若 `from` 本身在词表里（上面已处理过），这里会把重复项加一次 ⇒ 下面统一去重
  }

  // 去重 + 去掉"自己是自己的 alias"
  for (const [canon, info] of Object.entries(next)) {
    info.aliases = [...new Set(info.aliases)].filter((a) => a !== canon)
  }
  return { ...vocab, canonical: next }
}
