/**
 * ⭐⭐⭐ **知识评分：落盘（`<库根>/hot/scores.json`）**（决策 177）。
 *
 * ── 🔴🔴 为什么需要一个"互斥"（本项目第一次需要）────────────────────────────
 * 本模块的写入是**读-改-写**（读全表 → 在内存里加事件 → 整份写回）。
 * ⚠️ 两个评分子代理**并发**跑时（连续快速对话，上一轮的还没跑完下一轮就来了）：
 * ```
 * A 读 {x: 3}   B 读 {x: 3}   A 写 {x: 4}   B 写 {x: 4}   ← B 那次 +1 丢了
 * ```
 * ⇒ ⭐ **必须串行化**。
 *
 * ⚠️ **为什么不用"逐个字段追加"（真追加写）来绕开**：
 *    那要改成"一行一条事件"的 jsonl 形状，而用户要看的是
 *    **"每个项目、每条知识现在多少分"**（面板/回执都要整表）⇒ 仍然得聚合。
 *    ⇒ 既然总要聚合，就**一次读-改-写 + 互斥**最简单。
 *
 * 🔴 **互斥的作用域是"本进程"** —— 多实例同时评同一个项目仍会丢更新。
 *    ⚠️ 这是**已知边界**，不是疏漏：本项目的库是单用户单实例（`~/.dsh-memj`），
 *    且评分子代理由**同一进程的钩子**发起 ⇒ 进程内互斥就够。
 *    ⭐ 若将来真要多实例，再上文件锁（不要为不存在的场景提前加复杂度）。
 *
 * @module dsh-memj/hot-score-store
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { scoreFilePath } from './paths.ts'
import {
  SCORE_FILE_VERSION,
  emptyScoreFile,
  type ScoreFile,
  type ProjectScore,
} from './hot-score.ts'

/** 进程内互斥链（见文件头）。 */
let chain: Promise<unknown> = Promise.resolve()

/**
 * ⭐⭐ **串行执行**一段异步逻辑（进程内互斥）。
 *
 * ⚠️ **失败不阻塞后续**：前一个任务抛错时，链仍然继续
 *    （否则一次失败会把后面所有写入永久卡死 —— 那比丢更新更糟）。
 * @param fn - 要串行执行的逻辑。
 * @returns `fn` 的返回值。
 */
export function withScoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn)
  // ⚠️ 链上只挂"永不 reject"的影子，避免未处理的 rejection 冒出来。
  chain = run.then(() => undefined, () => undefined)
  return run
}

/**
 * **读整份评分表**。
 *
 * ⚠️ **任何异常都回空表**（照 `tag-auto-state` 的纪律：坏文件不该让功能整个挂掉）。
 *    🔴 但**不吞掉"结构不对"这件事** —— 版本不符时也当空表（见下）。
 * @returns 评分表（读不到时为空表）。
 */
export async function loadScoreFile(): Promise<ScoreFile> {
  try {
    const text = await readFile(scoreFilePath(), 'utf8')
    const parsed = JSON.parse(text) as Partial<ScoreFile>
    // ⭐ 版本不符 ⇒ **当空表**（宁可从头攒分，也不要用一个结构不明的表去算注入内容）。
    if (parsed?.version !== SCORE_FILE_VERSION) return emptyScoreFile()
    if (parsed.projects === null || typeof parsed.projects !== 'object') return emptyScoreFile()
    return { version: SCORE_FILE_VERSION, projects: parsed.projects }
  } catch {
    return emptyScoreFile()
  }
}

/** **原子写**（临时文件 + rename ⇒ 中途崩了不会留下半份文件）。 */
export async function saveScoreFile(f: ScoreFile): Promise<void> {
  const p = scoreFilePath()
  await mkdir(dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  await writeFile(tmp, JSON.stringify(f, null, 1), 'utf8')
  await rename(tmp, p)
}

/**
 * ⭐⭐⭐ **一次原子的"读-改-写"**（加分会走这条）。
 *
 * @param mutate - 拿到**当前**项目表（可能 `undefined`），回新的项目表；
 *   回 `undefined` ⇒ **不写盘**（用于"没什么可加的"这类短路）。
 * @param projectId - 项目 id。
 * @returns 写入后的项目表（`undefined` = 本次没写）。
 */
export async function updateProjectScore(
  projectId: string,
  mutate: (cur: ProjectScore | undefined) => ProjectScore | undefined,
): Promise<ProjectScore | undefined> {
  if (projectId === '') return undefined
  return withScoreLock(async () => {
    const f = await loadScoreFile()
    const next = mutate(f.projects[projectId])
    if (next === undefined) return undefined
    f.projects[projectId] = next
    await saveScoreFile(f)
    return next
  })
}

/** **读一个项目的评分表**（注入侧用；只读、不加锁）。 */
export async function readProjectScore(projectId: string): Promise<ProjectScore | undefined> {
  const f = await loadScoreFile()
  return f.projects[projectId]
}
