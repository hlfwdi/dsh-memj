/**
 * 封面检索（方案 §3.5 / §4.2 `memj_search`）。
 *
 * 🔴 **本期不做停词表、不做 2-gram 切分、不加 IDF 加权**（决策 37）。
 * 取而代之的是**两条约定**：
 *
 *  1. **查询词由 LLM 提炼**——`query` 给的是**有语义的词**，不是用户原句。
 *     例：用户说"注入缓存那个机制是怎么回事" ⇒ 传 `["注入缓存", "缓存", "注入"]`。
 *  2. **整词完整命中才算分**——只做子串包含（`text.includes(term)`），**不做二次切分**。
 *     ⇒ `入缓` 这种无意义字串**永远不可能被凭空造出来**，因为**没有自动切分**。
 *
 * 多词之间取 **OR**（命中任一即入选），但**得分累加**——命中词多的排前面。
 *
 * @module dsh-memj/search
 */

import { charCount } from './parse.ts'
import type { Cover } from './schema.ts'

/**
 * 命中位置的分值（§3.5）。
 *
 * ⚠️ **具体数值是占位值**（§12 第 7 条：用户指示"先记为待议"）。
 * 它表达的是**次序**：标题 > desc/tags > 正文。
 * 要调整只改这里，逻辑不受影响。
 */
export const HIT_WEIGHTS = {
  title: 5,
  desc: 3,
  tags: 3,
  body: 1,
} as const

/** 一条检索命中。 */
export interface SearchHit {
  cover: Cover
  /** 命中得分（多词累加）。 */
  score: number
  /** 命中了哪些查询词（便于模型判断"为什么它被选中"）。 */
  matched: string[]
  /**
   * 标题。⭐ **来自封面**（`cover.title`，决策 98）——不再从正文现算。
   *
   * ⚠️ 入库时由调用方把"正文回退值"填进来（存量文档兼容），见 `memj_search`。
   */
  title: string
  /** 正文字符数；**不带 query 时为 `undefined`**（不为它去读正文，§4.2）。 */
  size?: number
}

/**
 * 把查询输入规范成检索词数组。
 *
 * 同时接受字符串（按空白/逗号切）与数组（润色后直接用）。
 * @param query - 原始查询。
 * @returns 去空、去重（保持顺序）的检索词。
 */
export function normalizeQuery(query: string | readonly string[] | undefined): string[] {
  if (query === undefined) return []
  const raw = typeof query === 'string' ? query.split(/[\s,，、]+/) : [...query]
  const out: string[] = []
  const seen = new Set<string>()
  for (const term of raw) {
    const t = term.trim()
    if (t === '' || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/**
 * 算一条封面在给定检索词下的得分（§3.5）。
 *
 * 只做**子串包含**判断——不切分、不改写查询词。
 * @param cover - 封面。
 * @param terms - 检索词。
 * @param title - 标题（⭐ 来自封面，决策 98；调用方传 `cover.title`）。
 * @param body - 正文（不带 query 的检索不会走到这里）。
 * @returns 得分与命中的词。
 */
export function scoreCover(
  cover: Cover,
  terms: readonly string[],
  title: string,
  body: string,
): { score: number; matched: string[] } {
  let score = 0
  const matched: string[] = []
  const hay = {
    title: title.toLowerCase(),
    desc: cover.desc.toLowerCase(),
    tags: cover.tags.join(' ').toLowerCase(),
    body: body.toLowerCase(),
  }

  for (const rawTerm of terms) {
    const term = rawTerm.toLowerCase()
    if (term === '') continue
    let hit = false
    if (hay.title.includes(term)) {
      score += HIT_WEIGHTS.title
      hit = true
    }
    if (hay.desc.includes(term)) {
      score += HIT_WEIGHTS.desc
      hit = true
    }
    if (hay.tags.includes(term)) {
      score += HIT_WEIGHTS.tags
      hit = true
    }
    if (hay.body.includes(term)) {
      score += HIT_WEIGHTS.body
      hit = true
    }
    if (hit) matched.push(rawTerm)
  }

  return { score, matched }
}

/**
 * 按项目 / 主题筛封面（§4.2）。
 *
 * ⛔ **没有 `global` 参数**（决策 36）——全局知识不参与"按上下文筛"。
 * @param covers - 全部封面。
 * @param project - 项目 id（可选）。
 * @param theme - 主题 id（可选）。
 * @returns 过滤后的封面。
 */
export function filterByContext(
  covers: readonly Cover[],
  project: string | undefined,
  theme: string | undefined,
): Cover[] {
  let out = [...covers]
  if (project !== undefined && project.trim() !== '') {
    const p = project.trim()
    out = out.filter((c) => c.project === p)
  }
  if (theme !== undefined && theme.trim() !== '') {
    const t = theme.trim()
    out = out.filter((c) => c.theme.includes(t))
  }
  return out
}

/**
 * 算一张封面对应正文的字符数（§4.2 的 `size`）。
 *
 * ⚠️ 只有在**带 `query`**（本来就要读正文做匹配）时才调用——
 * 不带 query 时**不为了 size 去读正文**。
 * @param body - 正文。
 * @returns 字符数（**不是字节**）。
 */
export function bodySize(body: string): number {
  return charCount(body)
}

/**
 * 按得分排序（稳定：得分相同则 desc 更短者在前，便于模型快速判断）。
 * @param hits - 命中列表。
 * @returns 新数组。
 */
export function sortHits(hits: readonly SearchHit[]): SearchHit[] {
  return [...hits].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.cover.desc.length !== b.cover.desc.length) {
      return a.cover.desc.length - b.cover.desc.length
    }
    return a.cover.id.localeCompare(b.cover.id)
  })
}

/**
 * 在**项目与主题的语境**里按检索词筛（`memj_info` 的 `query` 用途，§4.2）。
 *
 * 匹配范围 = **id + 名称 + desc**（**不是知识正文**），规则与 `memj_search` 一致。
 * @param items - 语境条目。
 * @param terms - 检索词。
 * @returns 命中的条目（按得分降序）；**无命中就返回空**（决策 53，不兜底成全量）。
 */
export function filterContextByTerms<T extends { id: string; name: string; desc: string }>(
  items: readonly T[],
  terms: readonly string[],
): T[] {
  if (terms.length === 0) return [...items]
  const scored = items
    .map((item) => {
      const hay = `${item.id} ${item.name} ${item.desc}`.toLowerCase()
      let score = 0
      for (const t of terms) {
        const term = t.toLowerCase()
        if (term !== '' && hay.includes(term)) score += 1
      }
      return { item, score }
    })
    .filter((x) => x.score > 0)
  scored.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
  return scored.map((x) => x.item)
}
