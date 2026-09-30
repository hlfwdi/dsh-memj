/**
 * 读快照的记录与消费（方案 §3.8）。
 *
 * **它解决的问题**（§3.8 开头）：LLM 每次**从别项目取知识来用**，
 * 就是一次**真实发生的跨项目复用**——把它记下来，
 * "跨了两个项目"这件事**就已经是既成事实**，
 * **不需要事后扫全库去猜相似**（这正是 §3.7.2 那唯一一处工具校验的立足点）。
 *
 * ── 三条已知偏差（§3.8.3，须知悉）──────────────────────────────────────────
 * 1. **快照会过期**——长会话中早期读的条目归属可能已被改；**以快照为准**（用户拍板）；
 * 2. **不去重**——同会话读同一条几次就记几条；
 * 3. **只有读了才记**——凭记忆直接用的情况没有快照，靠项目 `themes:` 兜底。
 *
 * @module dsh-memj/reads
 */

import { appendReadSnapshot, readUnconsumedSnapshots } from './store.ts'
import type { ReadSnapshot } from './schema.ts'

/**
 * 记一条读快照（由 `memj_read` 在**成功读到正文后**调用）。
 *
 * ⚠️ **同会话重复读同一条不去重**（决策 66）——保留完整阅读痕迹。
 * @param sessionId - 当前会话 id。
 * @param info - 被读条目与它所属项目的信息。
 */
export async function recordRead(
  sessionId: string,
  info: {
    entryId: string
    title: string
    desc: string
    theme: readonly string[]
    project: string
    owner: { title: string; desc: string }
  },
): Promise<void> {
  const snapshot: ReadSnapshot = {
    entryId: info.entryId,
    title: info.title,
    desc: info.desc,
    theme: [...info.theme],
    project: info.project,
    owner: { title: info.owner.title, desc: info.owner.desc },
    readAt: new Date().toISOString(),
    consumedAt: null,
  }
  await appendReadSnapshot(sessionId, snapshot)
}

/**
 * 取本会话**未消费**的快照（handoff 时的候选主题来源之一，§3.7.3 来源①）。
 * @param sessionId - 当前会话 id。
 * @returns 未消费的快照。
 */
export async function pendingSnapshots(sessionId: string): Promise<ReadSnapshot[]> {
  return readUnconsumedSnapshots(sessionId)
}

/**
 * 把快照按**来源项目**分组，便于 LLM 逐条判断"这条确实和本次项目相关吗"。
 *
 * 🔴 这一步的语义筛选**必须由 LLM 做**（§3.7.2 表格）——
 * **"读过" ≠ "用上了"**，顺手翻到的、探索性读的要排除。
 * 本函数只做机械分组，不替模型判断相关性。
 * @param snapshots - 未消费的快照。
 * @returns 按 project 分组的映射。
 */
export function groupBySourceProject(
  snapshots: readonly ReadSnapshot[],
): Map<string, ReadSnapshot[]> {
  const map = new Map<string, ReadSnapshot[]>()
  for (const s of snapshots) {
    const key = s.project === '' ? '(无项目归属)' : s.project
    const list = map.get(key)
    if (list === undefined) map.set(key, [s])
    else list.push(s)
  }
  return map
}

/**
 * 渲染快照清单为给 LLM 的文本（`memj_handoff` 的候选证据）。
 *
 * ⚠️ **不要在此处塞入提名与断链**（决策 42：人侧与 LLM 侧分开）。
 * @param snapshots - 未消费的快照。
 * @returns 模型可见文本；无快照时为空串。
 */
export function renderSnapshotList(snapshots: readonly ReadSnapshot[]): string {
  if (snapshots.length === 0) return ''
  const byProject = groupBySourceProject(snapshots)
  const parts: string[] = [
    `本会话读过 ${snapshots.length} 条**别的项目**的知识（按来源项目分组）：`,
  ]
  for (const [project, list] of byProject) {
    parts.push('')
    parts.push(`- 来源项目 \`${project}\`（${list[0]?.owner.title ?? ''}）`)
    for (const s of list) {
      parts.push(`  · \`${s.entryId}\` **${s.title}** — ${s.desc}`)
    }
  }
  parts.push('')
  parts.push(
    '🔴 **逐条判断"它确实和本次要落盘的项目相关吗"**——读了不等于用上了；' +
      '不相关的要排除，否则会拿无关知识去凑主题证据。',
  )
  return parts.join('\n')
}
