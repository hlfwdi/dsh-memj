/**
 * ⭐⭐⭐ **自动标签规范化：记账（decision 167，修正 165 的三层门）**
 *
 * ── 🔴🔴 为什么要有这个文件（一次真实事故）────────────────────────────────
 * 决策 165 的三层门里，**门② 与门③ 都建立在"读父会话日志"上**，而两者都是错的：
 *
 * | 门 | 165 的实现 | 为什么失效（2026-09-28 生产实测） |
 * |---|---|---|
 * | ② 有沉淀 | 判"**本会话**有没有 `memj_handoff` 的 `tool/call`" | ⚠️ 那是**会话级**判据 —— 一旦调过**永远为真** ⇒ **handoff 之后的每一轮都过门** |
 * | ③ 去重 | 在**父会话**日志找 `memj_normalize_tags` 的 `tool/call` | 🔴 那次调用发生在**子会话**里 ⇒ **父会话日志永远看不到** ⇒ **去重恒不生效** |
 *
 * ⇒ 两道门叠加 = **只要这个会话落过一次知识，之后每轮都起一个子代理**。
 * ⭐ 生产上的铁证：某会话 `memj_handoff` 只发生在 **07:39~07:41 一轮**，
 *    而插件在 **07:45 / 07:52 / 08:07**（后面几轮，**都没沉淀**）各起了一个子代理。
 *
 * ⭐ **用户给的判据**：*"应该是只有有知识沉淀的轮次才跑啊，这个需要插件用脚本去校验。"*
 *
 * ── 修法：**让插件在"写知识"那一刻自己记一笔**，不再事后读日志猜 ──────────
 * - 记什么：**本次 handoff 真的落了知识**（`knowledgeWritten > 0`）的**轮次**，
 *   以及"**这个轮次**有没有已经被规范化过"；
 * - 单位从「会话」改成「**轮次**」—— 这正是 165 错的地方（会话级判据无法区分"哪一轮"）；
 * - ⭐ **不再需要读会话日志**（附带好处：165 每轮都要解压一个 4.7MB 的日志）。
 *
 * @module dsh-memj/tag-auto-state
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { tagAutoStatePath } from './paths.ts'

/**
 * 一条"本会话最近一次落了知识的 handoff"记录。
 *
 * ⚠️ **只有一个槽位**（按会话）而不是一个历史列表：我们只需要"**最后一次**落知识的轮次"，
 *    保留历史会让文件无界增长（且没有任何判据需要更早的那些）。
 */
export interface TagAutoState {
  /** 版本（将来改结构时用它判断）。 */
  version: 1
  /** `会话 id` → 该会话**最近一次落了知识**的 handoff 记录。 */
  sessions: Record<string, {
    /** 那次 handoff 所在的**轮次号**（⚠️ **只作诊断**，判据见 `pending`）。 */
    turn: number
    /** 那次落了几条知识（诊断用）。 */
    written: number
    /** 落知识的时刻（ISO）。 */
    at: string
    /**
     * ⭐⭐⭐ **"这次落知识还没被规范化过"** —— 去重的**唯一判据**。
     *
     * 🔴 **为什么用"待消费"而不是"比对轮次号"**：
     *    轮次号从两处来 —— `handoff` 走 `turnOf()`（读 `turnBoundary` 投影），
     *    钩子走 `payload.turn`。两者**理论同源，但 `turnOf()` 拿不到时会返回 `-1`**
     *    ⇒ 那会让"轮次相等"**永远不成立** ⇒ **功能静默永不触发**
     *    （比现在这个 bug 更隐蔽）。
     *    ⇒ ⭐ 改用**不依赖编号一致**的语义：**落知识时置 `pending: true`；
     *      轮次结束时消费掉（置 `false`）**。语义正好是
     *      "**落知识那一轮的轮次结束时，起一次**"。
     */
    pending: boolean
  }>
}

/** 空状态。 */
export function emptyTagAutoState(): TagAutoState {
  return { version: 1, sessions: {} }
}

/**
 * 读状态。⚠️ **文件不存在/损坏一律回空**（与 `loadVocabulary` 不同：
 * 那个回 `undefined` 表示"没播种过"，这里有明确语义 —— "什么都不知道"）。
 * @returns 状态（永不抛）。
 */
export async function loadTagAutoState(): Promise<TagAutoState> {
  try {
    const raw = await readFile(tagAutoStatePath(), 'utf8')
    const j = JSON.parse(raw) as Partial<TagAutoState>
    if (j?.version !== 1 || typeof j.sessions !== 'object' || j.sessions === null) {
      return emptyTagAutoState()
    }
    return { version: 1, sessions: j.sessions }
  } catch {
    // ⚠️ 损坏 ⇒ 回空（**不是**回 undefined）：本状态是"优化去重"用的，
    //    最坏后果只是多起一次子代理，**绝不该因为读不了而让轮次结束失败**。
    return emptyTagAutoState()
  }
}

/**
 * 写状态（原子：先写临时文件再 rename）。
 * ⚠️ 失败**只记日志、不外溢**（同本模块一贯纪律）。
 * @param st - 状态。
 */
export async function saveTagAutoState(st: TagAutoState): Promise<void> {
  try {
    const p = tagAutoStatePath()
    await mkdir(dirname(p), { recursive: true })
    const tmp = `${p}.tmp`
    await writeFile(tmp, JSON.stringify(st, null, 2), 'utf8')
    await rename(tmp, p)
  } catch (err) {
    try { console.log(`[dsh-memj/tag-auto] 状态写盘失败：${String(err)}`) } catch { /* ignore */ }
  }
}

/**
 * ⭐⭐⭐ **记一笔"本轮落了知识"**（由 `handoff` 在**落盘成功后**调用）。
 *
 * 🔴 **必须在确认写了知识之后调**（`knowledgeWritten > 0`），否则门② 就没意义了。
 * @param sessionId - 会话 id。
 * @param turn - 轮次号（⚠️ 判据的单位）。
 * @param written - 落了几条。
 * @returns 无（失败只记日志）。
 */
export async function noteKnowledgeWritten(
  sessionId: string,
  turn: number,
  written: number,
): Promise<void> {
  if (sessionId === '' || written <= 0) return
  try {
    const st = await loadTagAutoState()
    st.sessions[sessionId] = { turn, written, at: new Date().toISOString(), pending: true }
    await saveTagAutoState(st)
  } catch (err) {
    try { console.log(`[dsh-memj/tag-auto] 记账失败：${String(err)}`) } catch { /* ignore */ }
  }
}

/**
 * 纯函数：**该不该起子代理**（可单测）。
 *
 * 🔴 **与 165 的区别（两次修正）**：
 * - 165：判"**这个会话**有没有落过知识" ⇒ ⚠️ **会话级**，一旦为真**永远为真**
 *   ⇒ **落过一次后每轮都起**（生产事故）；
 * - 167：判"**有没有一次还没被消费的落知识**"（`pending`）——
 *   ⭐ 语义正好是"**落知识那一轮的轮次结束时，起一次**"。
 *
 * ⭐ **为什么不用"轮次号相等"**：编号从两处来（`turnOf()` 投影 vs `payload.turn`），
 *    而 `turnOf()` 拿不到时回 `-1` ⇒ 会**静默永不触发**（比重复触发更隐蔽）。
 *    用 `pending` 就**不依赖两处编号一致**。
 * @param opts - 开关 / 账。
 * @returns 该不该起 + 可判定的理由。
 */
export function decideTagAuto(opts: {
  enabled: boolean
  /** 该会话的记账（`undefined` = 本会话没落过知识）。 */
  record: TagAutoState['sessions'][string] | undefined
}): { start: boolean; reason: string } {
  if (!opts.enabled) return { start: false, reason: '开关关闭（tagNormalizeOnHandoff=false）' }
  const r = opts.record
  if (r === undefined) return { start: false, reason: '本会话还没落过知识' }
  // ⭐⭐ **核心**：只有"落过知识且还没消费"时才起。
  if (r.pending !== true) {
    return { start: false, reason: `第 ${r.turn} 轮落的知识已经规范过了（或本会话还没落知识）` }
  }
  return { start: true, reason: `第 ${r.turn} 轮落了 ${r.written} 条知识，还没规范化` }
}

/**
 * 纯函数：**消费掉"待规范化"标记**（返回**新**状态，不改入参）。
 * @param st - 当前状态。
 * @param sessionId - 会话 id。
 * @returns 新状态（无记录时原样返回）。
 */
export function markNormalized(st: TagAutoState, sessionId: string): TagAutoState {
  const r = st.sessions[sessionId]
  if (r === undefined || r.pending !== true) return st
  return {
    version: 1,
    sessions: { ...st.sessions, [sessionId]: { ...r, pending: false } },
  }
}
