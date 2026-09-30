/**
 * ⭐⭐⭐ **知识评分：纯函数层**（决策 177；2026-09-29 用户裁定）。
 *
 * ── 一句话 ────────────────────────────────────────────────────────────────
 * 每个项目维护一张**知识分数表**；轮次结束时由子代理调 JEV 评「**这一轮里
 * 哪些已有知识本来能帮上忙**」，过阈值的**按档加分**；热知识注入时把
 * **有效分前 N 名**注入（开关打开时替换原清单）。
 *
 * ── 与「主动注入」的分工（⭐ 别混，它们互补）─────────────────────────────
 * | | 时机 | 判据 | 回答的问题 |
 * |---|---|---|---|
 * | 主动注入 | 思考后、**实时** | 当下那段思考 | 「**现在**需要什么」 |
 * | **本模块** | 轮末、**复盘** | 整轮内容 + 项目背景 | 「这个项目**长期**该带什么」 |
 *
 * ── 🔴🔴 本文件最要紧的一条设计：**存【事件列表】，不存「分数 + 时间戳」** ──
 * 用户要的是**滚动窗口**（*"只有比如 30 个小时内有过加分的知识才留下"*）。
 * ⚠️ 若存成 `{ score, lastAt }`，下列情形会算错：
 * ```
 * t=0h  +3   →  score=3, lastAt=0h
 * t=29h +1   →  score=4, lastAt=29h      ← 表面看"4 分、6 小时前刚加过"
 * t=35h      →  按 lastAt 判：还没过期 ⇒ 仍算 4 分
 *              但真相：t=0 那次已出窗（35h > 30h）⇒ 只该剩 1 分
 * ```
 * ⇒ ⭐ **必须逐事件判过期**：`有效分 = 窗口内各事件的 delta 之和`。
 *
 * ── ⭐ 为什么分档加分、而不是直接加分数值 ────────────────────────────────
 * 库内知识 `9ed5626a` 明确写着：**`noul` 是有序档位的期望、数值刻度弱，
 * 不要拿它做数值插值，只用于过阈值**。
 * ⇒ 拿 0.93 与 0.71 的差值当"加几分"是**误用**（两者语义差别没那么大）。
 * ⇒ 分档：`≥0.9 → +3`｜`≥0.8 → +2`｜`≥阈值 → +1`。
 *
 * @module dsh-memj/hot-score
 */

/** 一次加分事件（⚠️ **不可合并** —— 合并就退化成"分数 + 时间戳"，见文件头）。 */
export interface ScoreEvent {
  /** ISO 时刻。 */
  at: string
  /** 这次加的分（1 / 2 / 3）。 */
  delta: number
  /** JEV 给的原始 `noul` 分（排障用：可看出"为什么只加了 1 分"）。 */
  score: number
  /** 发生在第几个 turn（排障用）。 */
  turn: number
}

/** 一条知识的评分记录。 */
export interface EntryScore {
  events: ScoreEvent[]
}

/** 一个项目的评分表。 */
export interface ProjectScore {
  /** 本表最后一次更新时刻（ISO）。 */
  updatedAt: string
  /**
   * ⭐⭐⭐ **最近一次"真的加了分"的评分所在轮次**（决策 182）。
   *
   * 🔴 **为什么必须是【项目级】而不是从条目的 events 里推**：
   *    "最近一次评分"是**整个项目**的概念 —— 而每个条目自己的最后一个事件
   *    可能是很久以前的（它这几轮都没被选中）⇒ 拿条目级的最大 turn 当"最近一次"
   *    **会把老事件误判成新事件**。
   * ⚠️ **语义是"最近一次有加分的评分"**：一条都没加分的轮次**不会**推进它
   *    （那种轮次调用方压根不写盘）—— ⭐ 这正是我们要的（"上一轮加入的"指的是
   *    **真的有知识加入**的那一轮）。
   * ⚠️ **旧数据没有这个字段** ⇒ 读取时兜底成"全部事件里的最大 turn"（见 `lastRunTurn`）。
   */
  lastTurn?: number
  /** `条目 id → 评分记录`。 */
  entries: Record<string, EntryScore>
}

/** `<库根>/hot/scores.json` 的结构。 */
export interface ScoreFile {
  version: number
  projects: Record<string, ProjectScore>
}

/** 当前文件版本（将来改结构时用它做迁移判据）。 */
export const SCORE_FILE_VERSION = 1

/** 空文件。 */
export function emptyScoreFile(): ScoreFile {
  return { version: SCORE_FILE_VERSION, projects: {} }
}

/**
 * ⭐⭐ **按 JEV 的分数算"该加几分"**（分档；见文件头的理由）。
 *
 * | 分数 | 加分 |
 * |---|---|
 * | **`< threshold`** | **0**（一分不加 —— ⚠️ **先判这一条**） |
 * | `≥ threshold` | **+1** |
 * | `≥ 0.8` | **+2** |
 * | `≥ 0.9` | **+3** |
 *
 * 🔴🔴 **阈值必须【先】判，再判档位** —— 这是我第一版写错的地方，
 *    而它是本项目 `决策 172`（"一个键兼两个语义"）的**同族**：
 *    ```ts
 *    // ❌ 错：档位在前 ⇒ 阈值被架空
 *    if (score >= 0.9) return 3
 *    if (score >= 0.8) return 2
 *    if (score >= threshold) return 1
 *    ```
 *    ⚠️ 后果：阈值设成 **0.85** 时，**0.82 仍然得 2 分** ——
 *    阈值对它上面的两档**完全失效**（用户调高阈值却拦不住 0.8~0.85 的）。
 *    ⇒ ⭐ **阈值是硬门**（用户原话：*"只有超过阈值的，才加分"*），
 *      过了门**才**按档位分。
 *    ✅ 本项目的单元测试正是**用 `deltaFor(0.82, 0.85) === 1` 这条断言**抓到的。
 *
 * ⚠️ **`threshold` 高于 0.8 时，中间那档自然取不到**（因为 0.8~threshold 那段已被门挡住）——
 *    这是**设计内行为**，不是 bug；⚠️ 别去"修"它。
 * @param score - JEV 的 `noul` 分。
 * @param threshold - 过线阈值（默认取配置里的 `hotScoreThreshold`）。
 * @returns 加几分（0 / 1 / 2 / 3）。
 */
export function deltaFor(score: number, threshold: number): number {
  if (!Number.isFinite(score)) return 0
  // 🔴 **硬门在前**（见上面长注释：反了就会让阈值被档位架空）。
  if (score < threshold) return 0
  if (score >= 0.9) return 3
  if (score >= 0.8) return 2
  return 1
}

/**
 * ⭐⭐ **滚动窗口的判定**：这个事件还在窗口内吗？
 *
 * ⚠️ **边界取"含"**（`at >= now - window`）—— 本项目一贯要求"边界类判据要留容差"，
 *    而这里用"含"就是那个容差（否则恰好在边界上的那次加分会被吃掉）。
 * @param at - 事件时刻（ISO）。
 * @param nowMs - 当前时刻（epoch ms）。
 * @param windowHours - 窗口小时数。
 * @returns 是否还在窗口内。
 */
export function inWindow(at: string, nowMs: number, windowHours: number): boolean {
  const t = Date.parse(at)
  // ⚠️ 解析不出来 ⇒ 当**过期**处理（宁可少留，也不要留一条永远不过期的脏数据）。
  if (!Number.isFinite(t)) return false
  return t >= nowMs - windowHours * 3600_000
}

/**
 * ⭐⭐⭐ **算一条知识的【有效分】**（= 窗口内各事件的 delta 之和）。
 *
 * 🔴 **必须逐事件判**（不能拿 `lastAt` 代表全部 —— 见文件头的反例）。
 * @param score - 该条知识的评分记录。
 * @param nowMs - 当前时刻（epoch ms）。
 * @param windowHours - 窗口小时数。
 * @returns 有效分；窗口内无事件时 `0`。
 */
export function effectiveScore(score: EntryScore | undefined, nowMs: number, windowHours: number): number {
  if (score === undefined || !Array.isArray(score.events)) return 0
  let sum = 0
  for (const e of score.events) {
    if (!inWindow(e.at, nowMs, windowHours)) continue
    const d = typeof e.delta === 'number' && Number.isFinite(e.delta) ? e.delta : 0
    sum += d
  }
  return sum
}

/**
 * **清掉出窗的事件**（写入时调用 ⇒ 文件不会无限长）。
 *
 * ⭐ 读侧仍然要判窗口（`effectiveScore` 自己会判）——
 *    因为"清"只在**有写入时**才发生，中间可能隔很久。
 *    ⇒ ⭐ **清是"顺手瘦身"，判是"正确性"**，两者都不能省。
 * @param score - 该条知识的评分记录。
 * @param nowMs - 当前时刻。
 * @param windowHours - 窗口小时数。
 * @returns 只剩窗口内事件的新记录。
 */
export function pruneEvents(score: EntryScore, nowMs: number, windowHours: number): EntryScore {
  const events = (Array.isArray(score.events) ? score.events : []).filter((e) =>
    inWindow(e.at, nowMs, windowHours),
  )
  return { events }
}

/** 一条"排好序的候选"（注入侧要用的最小信息）。 */
export interface ScoredEntry {
  /** 条目 id。 */
  id: string
  /** 窗口内有效分。 */
  score: number
  /**
   * ⭐ 窗口内**最近一次**加分时刻（epoch ms；无事件时 `0`）。
   * 用于同分时的排序（决策 182）。
   */
  lastAt: number
  /** ⭐ 窗口内**最高一次**的 turn（用于"上一轮加入的"那道门）。无事件时 `-1`。 */
  lastTurn: number
}

/** `topScored` 的可选门槛（决策 182）。⚠️ 不传 ⇒ 保持旧行为（纯按分数取前 N）。 */
export interface TopScoredOpts {
  /**
   * ⭐⭐ **入围门槛：或的关系**（用户裁定）。
   * - `minScore`：有效分 ≥ 这个值 ⇒ 入围；
   * - `lastTurn`：**最近一次评分**的轮次号 ⇒ 窗口内**最高 turn 等于它**的条目入围。
   * 两者**满足任一**即入围；两个都不给 ⇒ 全部入围。
   * ⚠️ **为什么不只是 AND/OR 里随便挑**：用户明确要"**上一轮加入的**
   *    *和* **超过 N 分的**才有机会入选" —— 那句"和"在中文里是"并且"的字面，
   *    但语义上是"**这两类都该有机会**"（门槛是"够格"而不是"同时满足"）。
   *    ⇒ ⭐ 按 **OR** 实现，并在配置注释里写明；⚠️ 若要 AND 改一行即可。
   */
  gate?: { minScore: number; lastTurn: number }
}

/**
 * ⭐⭐⭐ **取有效分前 N 名**（注入侧就靠它决定"给哪几条"）。
 *
 * ⚠️ **只回 `score > 0` 的**：0 分表示"窗口内没被加过分"，
 *    它**不属于"有分数的知识"**（用户原话：*"自动注入这些有分数的知识"*）。
 *
 * ── 🔴🔴 排序口径（决策 182 改过，这是本函数最要紧的一段）──────────────────
 * 1. **分数降序**；
 * 2. ⭐ **同分时按【最近一次加分时间】降序**（`lastAt`）；
 * 3. 再同（都无事件或时间相同）⇒ **按 id 升序**兜底（保证确定性）。
 *
 * 🔴 **为什么第 2 条必须存在（这是实测出来的真问题）**：
 *    `chat` 通路**没有分数**（选中即 +1）⇒ 分数只能是 1/2/3… ⇒ **并列是必然的**。
 *    实测生产数据：**33 条有分，其中 25 条并列 1 分**，而位置只有 20 个
 *    ⇒ 旧实现（同分按 **id 字典序**）会把 **13 条"只是 id 排在后面"的丢掉** ——
 *    ⚠️ 那是**任意淘汰**，不是"选最相关的 20 条"。
 *    ⭐ 改成按时间 ⇒ "**刚被证明有用的优先**"，且**仍然确定性**（时间来自事件，不随机）。
 * @param project - 该项目的评分表（可能为 `undefined`）。
 * @param nowMs - 当前时刻。
 * @param windowHours - 窗口小时数。
 * @param topN - 取前几名。
 * @param opts - ⭐ 可选门槛（决策 182）；不传 = 旧行为。
 * @returns 按上述口径排序的条目。
 */
export function topScored(
  project: ProjectScore | undefined,
  nowMs: number,
  windowHours: number,
  topN: number,
  opts?: TopScoredOpts,
): ScoredEntry[] {
  if (project === undefined || project.entries === null || typeof project.entries !== 'object') return []
  const gate = opts?.gate
  const rows: ScoredEntry[] = []
  for (const [id, sc] of Object.entries(project.entries)) {
    const agg = aggregate(sc, nowMs, windowHours)
    if (agg.score <= 0) continue
    // ⭐ 门槛（OR）：分数够 或 是"最近一次评分"里加入的。
    if (gate !== undefined) {
      const byScore = agg.score >= gate.minScore
      const byRecency = gate.lastTurn >= 0 && agg.lastTurn === gate.lastTurn
      if (!byScore && !byRecency) continue
    }
    rows.push({ id, score: agg.score, lastAt: agg.lastAt, lastTurn: agg.lastTurn })
  }
  // ⭐ 分数降序 → 最近加分时间降序 → id 升序（三级都确定性）。
  rows.sort((a, b) =>
    (b.score - a.score)
    || (b.lastAt - a.lastAt)
    || a.id.localeCompare(b.id))
  return rows.slice(0, Math.max(0, topN))
}

/**
 * **把一条知识在窗口内的事件聚合起来**（有效分 / 最近加分时刻 / 最高 turn）。
 *
 * ⚠️ 与 `effectiveScore` **同源判据**（都逐事件判窗口），只是多带回两个派生量 ——
 *    ⭐ 不另写一份"判窗口"的逻辑（本项目铁律：同一判据一份实现）。
 * @param score - 该条知识的评分记录。
 * @param nowMs - 当前时刻。
 * @param windowHours - 窗口小时数。
 * @returns 聚合结果（无窗口内事件时：`{score:0,lastAt:0,lastTurn:-1}`）。
 */
export function aggregate(
  score: EntryScore | undefined,
  nowMs: number,
  windowHours: number,
): { score: number; lastAt: number; lastTurn: number } {
  let sum = 0
  let lastAt = 0
  let lastTurn = -1
  for (const e of score?.events ?? []) {
    if (!inWindow(e.at, nowMs, windowHours)) continue
    const d = typeof e.delta === 'number' && Number.isFinite(e.delta) ? e.delta : 0
    sum += d
    const t = Date.parse(e.at)
    if (Number.isFinite(t) && t > lastAt) lastAt = t
    if (typeof e.turn === 'number' && e.turn > lastTurn) lastTurn = e.turn
  }
  return { score: sum, lastAt, lastTurn }
}

/**
 * **把一批加分并进评分表**（纯函数；I/O 在 `hot-score-store.ts`）。
 *
 * ⚠️ 它**只加不删条目**：某条知识的有效分掉到 0 后，它的外壳仍留在文件里
 *    （`events` 被清空）。⭐ 这是**有意的** —— 删外壳需要"扫全库判断该不该删"，
 *    而空外壳的代价只是几百字节；⚠️ 但**读取侧必须按 `score > 0` 过滤**
 *    （`topScored` 已如此），否则空的也会被当成"有分数的知识"注入。
 * @param project - 原评分表（`undefined` = 新建）。
 * @param adds - `条目 id → { delta, score, turn }`。
 * @param nowIso - 当前时刻（ISO）。
 * @param nowMs - 当前时刻（epoch ms，用于顺手清出窗事件）。
 * @param windowHours - 窗口小时数。
 * @returns 新的评分表（不修改入参）。
 */
export function applyAdds(
  project: ProjectScore | undefined,
  adds: ReadonlyArray<{ id: string; delta: number; score: number; turn: number }>,
  nowIso: string,
  nowMs: number,
  windowHours: number,
): ProjectScore {
  const entries: Record<string, EntryScore> = {}
  // ⚠️ 先顺手清一遍**所有**条目的出窗事件（不只本次加分的那些）——
  //    否则长期没被加分的条目的旧事件会一直赖在文件里。
  for (const [id, sc] of Object.entries(project?.entries ?? {})) {
    entries[id] = pruneEvents(sc, nowMs, windowHours)
  }
  let lastTurn = project?.lastTurn
  for (const a of adds) {
    if (a.delta <= 0) continue
    const cur = entries[a.id] ?? { events: [] }
    entries[a.id] = { events: [...cur.events, { at: nowIso, delta: a.delta, score: a.score, turn: a.turn }] }
    // ⭐⭐⭐ **推进"最近一次加分的轮次"**（决策 182）——
    //    它支撑"上一轮加入的知识必入围"那道门。
    //    ⚠️ 取**最大** turn（同一批 adds 的 turn 应当相同，但取最大更稳）。
    if (typeof a.turn === 'number' && (lastTurn === undefined || a.turn > lastTurn)) lastTurn = a.turn
  }
  // ⚠️ 全空的条目外壳**也保留**（见上面注释）。
  return {
    updatedAt: nowIso,
    ...(lastTurn !== undefined ? { lastTurn } : {}),
    entries,
  }
}

/**
 * ⭐⭐ **读"最近一次加分的轮次"**（决策 182）。
 *
 * 🔴 **旧数据没有 `lastTurn` 字段**（本决策之前写的 `scores.json`）⇒
 *    兜底成"**全部事件里的最大 turn**"。
 *    ⚠️ 那个兜底**不精确**（条目级的最大 turn 可能来自很久以前），但它是
 *    **唯一能用的近似**，且只会让门槛**更松**（多放几条进来）——
 *    ⭐ 按"失败模式不对称"（库内知识 `9d61d1e3`）：多给几条只是多花 token，
 *      而**少给**会让"刚加入的知识"被静默漏掉。选更松的那侧。
 * @param project - 该项目的评分表（可能为 `undefined`）。
 * @returns 轮次号；**一个事件都没有时 `-1`**（表示"没有可依据的轮次" ⇒ 该门不生效）。
 */
export function lastRunTurn(project: ProjectScore | undefined): number {
  if (project === undefined) return -1
  if (typeof project.lastTurn === 'number' && Number.isFinite(project.lastTurn)) return project.lastTurn
  let mx = -1
  for (const sc of Object.values(project.entries ?? {})) {
    for (const e of sc.events ?? []) {
      if (typeof e.turn === 'number' && e.turn > mx) mx = e.turn
    }
  }
  return mx
}
