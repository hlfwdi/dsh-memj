/**
 * ⭐⭐ **主动召回的调用日志**（2026-09-27 新增；用户要求）。
 *
 * 用户原话：*"主动召回注入有专门的日志吗？我觉得应该要维护个日志记录每次得调用详情，
 * 不然调试起来太麻烦了。"*
 *
 * 🔴🔴 **为什么必须有**（本模块存在的全部理由）：
 *    在此之前，召回的结论**只在内存里**（`active-inject.ts` 的 `activeState.last`）——
 *    ⚠️ 于是有**三重丢失**，实测每一条都让排障变猜：
 *      ① **重启即失**（纯内存）；
 *      ② ⭐ `last` 只留**最近一次** ⇒ 一个 turn 有 5~8 个 step，前几次被覆盖后**永久丢失**
 *         （实测会话 `2b809b4a` 的 turn 6：`callsUsed=3` 却查不出那 3 次各是什么结论）；
 *      ③ ⭐⭐ **三个总控分数**（`need` / `sufficient` / `search_intent`）**算完就丢** ——
 *         而调阈值最需要的正是它们的**分布**。
 *    ⇒ 实测代价：用户报"看不到注入"时，只能**解压会话日志反推**（插件自己什么都没记）。
 *
 * ⭐ **三档内容**（用户 2026-09-27 明确要求 **A+B+C 都要**）：
 *    · **A 结论** —— `kind` / `detail` / 条数 / 耗时 / **三个分数** / **当时的阈值快照**；
 *    · **B 请求快照** —— 真正发给 JEV 的 `state`（上下文 + 候选）与 `questions` 键，
 *      ⇒ **可以重放**（复现"同一条上下文为什么得这个分"）；
 *    · **C 注入正文** —— 真的注进会话的那段文本（`renderActiveInjection` 的产物）。
 *
 * ⭐⭐ **两种事件分开写**（`event` 字段）——**别合成一条**：
 *    · `'recall'`：**每次召回尝试**都写（含 suppressed / skipped —— 那正是最该看的）；
 *    · `'inject'`：**真的注进去了**才写（带正文）。
 *    ⚠️ 合成一条做不到：被抑制的召回**永远不会到达注入点**，
 *       而若只在注入点写，就**看不见"为什么没注入"**——那正是排障的主战场。
 *    ⇒ 关联方式：同 `turn` + 同 `step`（`inject` 行的 `step` 取其消费时的 step）。
 *
 * 🔴 **写入纪律**（与 `.startup-diag.txt` 同款，别改）：
 *    · **失败绝不影响召回** —— 全程 `try/catch` 吞掉：日志是辅助，不能让它毁掉主流程；
 *    · **一行一条 JSON**（jsonl，与 `reads/` / `doc-reads/` 同形态）；
 *    · ⚠️ **追加而不是重写** —— 与 `reads/` 的"同轮只留最新"**故意不同**：
 *      日志的全部价值就在于**逐次留痕**，去重会让它失去意义
 *      （且 `writeTextAtomic` 是"读全部 + 重写"，在日志场景下**会丢并发写**）。
 */
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { recallLogPath } from './paths.ts'

/** 一次召回里"三个总控 `noul` 分数"（⚠️ 只有 JEV 通路有）。 */
export interface RecallScores {
  /** 需求分（`need`）：过 `activeInjectNeedMin` 才继续。 */
  need?: number
  /** 已有知识充足分（`sufficient`）：≥ 阈值则抑制。 */
  sufficient?: number
  /** 检索意图分（`search_intent`）：≥ 阈值则抑制。 */
  searchIntent?: number
}

/**
 * ⭐⭐ **当时的阈值快照**。
 *
 * 🔴 **为什么必须记**：日志是**跨版本长期**的 —— 若只记分数不记阈值，
 *    三个月后回看一行 `suppressed: 需求分 0.58 < 0.7`，**不知道 0.7 是不是当时的配置**
 *    （用户随时会改旋钮）⇒ 那次判断**无法复核**。
 * ⚠️ 与"人会改的值不进提示词常量通道"是同一条纪律的另一面：
 *    **人会改的值要随记录一起冻结**。
 */
export interface RecallThresholds {
  /**
   * ⚠️ **已作废**（2026-09-29 拆成 `needMin` / `itemMin` 两个键）。
   *
   * 🔴 **必须保留成可选字段，不能删** —— 本文件是**跨版本长期**的追加日志，
   *    拆分**之前**写下的那些行里只有 `band`；读取侧若按必需字段处理，
   *    历史行的值会变成 `undefined`（进而在展示/探针里画出 `NaN`）。
   *    删掉一个字段**改不了已落盘的旧行** ⇒ 只会让读取侧替旧数据撒谎。
   */
  band?: number
  /** ⭐ **需求阈值**：「这一轮要不要注入」—— `need` < 此值 ⇒ 整轮不注入。 */
  needMin?: number
  /** ⭐ **入选阈值**：「哪几条候选够格」—— 每条候选分 ≥ 此值才入选。 */
  itemMin?: number
  searchIntentMin: number
  sufficientMin: number
}

/** 两种事件的公共字段。 */
interface RecallLogBase {
  /** ISO 时刻。 */
  at: string
  /** 会话 id（与文件名一致，便于把多份日志合起来看）。 */
  sessionId: string
  /** 第几个 turn；拿不到时 `-1`。 */
  turn: number
  /** 第几个 step；拿不到时 `-1`。 */
  step: number
  /** `jev` / `chat`。 */
  channel: string
  /** 模型名。 */
  model: string
  /** 清单范围（`project` / `project+themes` / `all`）。 */
  scope: string
  /**
   * ⭐⭐ **这次召回是哪个触发点发起的**（2026-09-29 新增）。
   *
   * · `reasoning` —— 老的触发点：**思考结束**（`llm/stream` 的 reasoning 块结束）。
   * · `submit`    —— 新触发点：**用户从输入框提交**（用他的输入当判据）。
   *
   * 🔴 **为什么要单独记**：两个触发点的**判据来源不同**（前者是模型的思考、
   *    后者是用户的原话）⇒ 它们的 `scores` **不该混在一起看分布**
   *    （混了就会得出"阈值该定多少"的错误结论）。
   * ⚠️ 老日志没有这个字段 ⇒ **可选**。
   */
  trigger?: string
}

/** ⭐ A+B：**一次召回尝试**（每次都写，含没注入的）。 */
export interface RecallAttemptRecord extends RecallLogBase {
  event: 'recall'
  /** `injected`(待注入) / `suppressed` / `skipped` / `empty` / `failed`。 */
  kind: string
  /** 人可读的一句话原因（与页面显示的是同一句）。 */
  detail: string
  /** ⭐⭐ 三个总控分数 —— **调阈值唯一该看的东西**（要看分布，不是单点）。 */
  scores?: RecallScores
  /** 实际评估的候选条数 / 候选池大小。 */
  evaluated: number
  pool: number
  /** 是不是拆了多批。 */
  batched: boolean
  /** 召回耗时（毫秒）。 */
  ms: number
  /** 过带后被选中的条目 id（`kind==='injected'` 时非空）。 */
  picked: string[]
  /** ⭐ 这一次算不算"注入"（决策 157 的额度口径）。 */
  counted: boolean
  /** ⭐ 当时的阈值快照（见 {@link RecallThresholds}）。 */
  thresholds: RecallThresholds
  /**
   * ⭐ B：真正发给 JEV 的请求体（`state` + 问了哪些键）。
   *
   * ⚠️ **可能很大**（上下文 + 候选，实测数十 KB）⇒ 由配置
   *    `activeRecallLogRequest`（**默认关**）决定要不要记。
   * 🔴 **为什么默认关**：一个 turn 有 5~8 步、每步一份几十 KB
   *    ⇒ 几轮就能把磁盘写爆。**要复现问题时再临时打开**。
   */
  request?: {
    state: unknown
    questionKeys: string[]
    batch?: { index: number; total: number }
  }
}

/** ⭐ C：**真的注进去了**（带正文）。 */
export interface RecallInjectRecord extends RecallLogBase {
  event: 'inject'
  /** 注入了几条。 */
  count: number
  /** 注入了哪些条目 id。 */
  ids: string[]
  /** ⭐ 真的注进会话的那段文本（逐字，`renderActiveInjection` 的产物）。 */
  text: string
}

/** 日志记录（两种事件的联合）。 */
export type RecallLogRecord = RecallAttemptRecord | RecallInjectRecord

/**
 * 追加一条召回日志。
 *
 * 🔴 **绝不抛**（调用方在召回热路径上 —— 日志坏了不能连累召回）。
 * ⚠️ **追加，不是重写**：`appendFile` 保证既有内容不动。
 * @param record - 记录（`at` 缺省由调用方补；`sessionId` 必填，它决定文件名）。
 */
export async function appendRecallLog(record: RecallLogRecord): Promise<void> {
  try {
    const path = recallLogPath(record.sessionId)
    await mkdir(dirname(path), { recursive: true })
    await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8')
  } catch {
    /* 日志失败绝不影响召回 —— 与 `.startup-diag.txt` 同款纪律 */
  }
}

/**
 * 读某会话的召回日志（供探针与排障用）。
 *
 * ⚠️ 与写侧对称：解析失败的**行跳过、不整份丢**（日志是长期文件，
 * 中途某行写坏不该让整份不可读）。
 * @param sessionId - 会话 id。
 * @returns 记录数组（按写入顺序，最早在前）；文件不存在时 `[]`。
 */
export async function readRecallLog(sessionId: string): Promise<RecallLogRecord[]> {
  const { readTextIfExists } = await import('./files.ts')
  const text = await readTextIfExists(recallLogPath(sessionId))
  if (text === undefined || text.trim() === '') return []
  const out: RecallLogRecord[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    try {
      out.push(JSON.parse(line) as RecallLogRecord)
    } catch {
      /* 单行坏了就跳过 —— 不因为一行毁掉整份 */
    }
  }
  return out
}
