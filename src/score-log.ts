/**
 * ⭐⭐⭐ **知识评分日志**（决策 177；`<库根>/score-log/session-<id>.jsonl`）。
 *
 * ── 为什么必须落盘（照 `recall-log` 的同一理由 —— 库内知识 `5b9bbc6e`）──────
 * > **"算完就丢的中间量是调参能力的缺口"**
 *
 * 本功能有一个**必然要调**的参数：`hotScoreThreshold`（过多少分才加分）。
 * ⚠️ 阈值定得不合适时，表现是**"一条都没加分"** —— 而那有**两种解释而表现一样**：
 * ① 真的没有相关知识；② 阈值太高。⇒ ⭐ **唯一能区分的证据是【全部分数的分布】**。
 * ⇒ 日志**记全部候选的 raw 分数**，不只记过阈值的。
 *
 * ⭐ 用户对这一条的原话是 *"先做出来再调试"* ⇒ **分布数据就是"调试"的输入**。
 *
 * @module dsh-memj/score-log
 */
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { scoreLogPath } from './paths.ts'

/** 一次评分里**某条候选**的分数（⭐ 不截断：未过阈值的也要记）。 */
export interface ScoredCandidateLog {
  /** 条目 id。 */
  id: string
  /** JEV 给的 `noul` 分。 */
  score: number
  /** 本次给它加了几分（0 = 没过阈值 ⇒ 没加）。 */
  delta: number
}

/** **一次轮末评分**（一个 turn 一条）。 */
export interface ScoreRunRecord {
  event: 'score'
  /** ISO 时刻。 */
  at: string
  /** 会话 id（与文件名一致，便于把多份日志合起来看）。 */
  sessionId: string
  /** 评的是第几个 turn。 */
  turn: number
  /** 归属项目（⚠️ 判不出项目时不会评分 —— 分数是按项目存的）。 */
  project: string
  /**
   * ⭐⭐ **本次走的哪条通路**（`chat` / `jev`；决策 178）。
   *
   * 🔴 **必须记**：两条通路的**产出契约不同**（JEV 给分数、chat 给"选中+理由"）
   *    ⇒ 看日志时若不知道走的是哪条，就**没法解释**"为什么没有分数"。
   */
  channel?: string
  /** 候选池大小 / 实际评估条数（拆批时两者可能不同）。 */
  pool: number
  evaluated: number
  /** 拆了几批。 */
  batches: number
  /** 耗时（毫秒）。 */
  ms: number
  /**
   * ⭐⭐ **全部候选的分数**（**不只过阈值的**）。
   *
   * 🔴 它是本日志存在的主要理由 —— 调 `hotScoreThreshold` 唯一需要的分布。
   * ⚠️ 它**可能较大**（候选可达 240 条）⇒ 单行几十 KB。
   *    ⚠️ 但**一 turn 只有一条**（不像召回是每 step 一条）⇒ 量级可接受，不另设开关。
   */
  scores: ScoredCandidateLog[]
  /** ⭐ 本次真的加分的条目（`scores` 的子集，便于快速看结果）。 */
  added: Array<{ id: string; delta: number; score: number }>
  /**
   * ⭐⭐ **当时的判据快照**（阈值 / 窗口 / 前 N）。
   *
   * 🔴 **必须记**（库内知识 `5b9bbc6e` 的原话）：日志是**跨版本长期**的 ——
   *    三个月后回看 `score 0.68 没加分`，**不知道 0.7 是不是当时的配置** ⇒ 那次判断无法复核。
   */
  thresholds: {
    /** 过线阈值。 */
    min: number
    /** 滚动窗口小时数。 */
    windowHours: number
    /** 注入取前几名。 */
    topN: number
  }
  /** 失败/短路的可判定原因（成功时为空串）。 */
  note: string
}

/**
 * 追加一条评分日志。
 *
 * 🔴 **绝不抛** —— 日志坏了不能连累评分（它与 `.startup-diag.txt` 同款纪律）。
 * ⚠️ **追加，不是重写**：`appendFile` 保证既有内容不动。
 * @param record - 记录。
 */
export async function appendScoreLog(record: ScoreRunRecord): Promise<void> {
  try {
    const path = scoreLogPath(record.sessionId)
    await mkdir(dirname(path), { recursive: true })
    await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8')
  } catch {
    /* 日志失败绝不影响评分 */
  }
}

/**
 * 读某会话的评分日志（供探针与排障用）。
 *
 * ⚠️ 与写侧对称：解析失败的**行跳过、不整份丢**。
 * @param sessionId - 会话 id。
 * @returns 记录数组（按写入顺序）；文件不存在时 `[]`。
 */
export async function readScoreLog(sessionId: string): Promise<ScoreRunRecord[]> {
  const { readTextIfExists } = await import('./files.ts')
  const text = await readTextIfExists(scoreLogPath(sessionId))
  if (text === undefined || text.trim() === '') return []
  const out: ScoreRunRecord[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    try {
      out.push(JSON.parse(line) as ScoreRunRecord)
    } catch {
      // 单行损坏不该毁掉整个文件——跳过它。
    }
  }
  return out
}
