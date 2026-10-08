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
import { promptText, registerPromptDefault } from './prompts.ts'
import type { ReadSnapshot } from './schema.ts'

// ⭐⭐⭐ **快照清单的收尾指令**（2026-10-12 抽成常量 + 走 `promptText`）。
//
// 🔴 **为什么它也算提示词**：这段话**逐字附在 `memj_snapshots` 的返回值里** ——
//    而它是模型**要不要把某条快照当证据挂上去**的唯一判据来源。
//    ⚠️ 措辞一松（例如漏掉"读了不等于用上了"），模型就会**照单全收**
//      ⇒ 拿无关知识去凑主题证据（本项目记过这个真实事故）。
//    ⭐ 判据同 `inject.ts`：**能改变模型怎么做的文本就是提示词**。
export const SNAPSHOT_CLOSING: string =
  `🔴 **逐条判断"它确实和本次要落盘的项目相关吗"**——读了不等于用上了；不相关的要排除，否则会拿无关知识去凑主题证据。`

registerPromptDefault('reads:snapshot-closing', SNAPSHOT_CLOSING)

// ⭐⭐⭐ **各节写作规范的对照提示**（决策 221，2026-10-12 用户要求）。
//
// ── 它解决什么问题（用户实测发现的）────────────────────────────────────────
// 用户看到 `dsh-memj` 的「目标」节有 18616 字符、0 个 `###`，而它自己的规范
// 明写着"只保留总目标与最新批次、以 `###` 子章节划分" —— 问"为什么之前 handoff
// 没按这个规范做？"。查证结论：**规范从 2026-10-07 写进正文起，27 次 handoff
// 里「目标」节一次都没被写过**（每次只写「当前进度」）。
//
// 🔴 所以缺口**不是"没按规范写"，而是"没人提醒这一节该被整理"**：
//    `memj_read` 明明把规范原文交给了模型（它就在正文里），但它
//    **混在几万字的正文中间**，而模型当时要写的是别的一节 ⇒ 视线不会落到它上面。
//
// ⭐ 判据（用户拍板）：**写前必读那道硬闸门已经存在**（不读就拒绝 handoff）
//    ⇒ 既然工具**已经强制模型读一遍**，那就在**那一刻**把各节的规范
//    **集中、显眼地**交出去，而不是让它们散落在正文各处。
//
// ⚠️ **与 2026-10-12 退役的那条"按需注入写作指导"的区别**（别当成走回头路）：
//    · 退役的那条：**从模板重新渲染**一份指导 ⇒ 与正文是**两个来源**，会漂；
//    · 本条：**从正文里读出来、原样列出**（`sectionSpecsOf(narrative)`）
//      ⇒ 与正文**同一次读取、同一个来源**，结构上不可能不一致。
//
// 🔴 **必须写成【单段字面量】**（不要在源码里用 `+` 拼多段）：
//    `prompt-writeback.ts` 的定位器只支持单段形态，多段拼接会被判 `unsupported`
//    ⇒ **设置页上不会出现"写回"按钮**（我第一版就是拼了三段，实测被它挡下）。
export const SECTION_SPEC_HEAD: string =
  `📐 **本文档各节的写作规范**（逐节对照——写之前先看有没有哪一节已经不符合它自己的规范）：`

registerPromptDefault('reads:section-spec-head', SECTION_SPEC_HEAD)

export const SECTION_SPEC_CLOSING: string =
  `⚠️ 上面每一条都取自**这份文档自己的正文**（不是通用清单）。若某节的内容已经明显不符合它自己的规范，**顺手整理它**——「没写某一节」只能靠这一眼发现，工具不会替你检查。`

registerPromptDefault('reads:section-spec-closing', SECTION_SPEC_CLOSING)

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
  parts.push(promptText('reads:snapshot-closing', SNAPSHOT_CLOSING))
  return parts.join('\n')
}

/**
 * ⭐⭐ **把本文档各节的写作规范渲染成"集中一处"的一段**（决策 221）。
 *
 * 🔴 **它只在【读项目文档】时用、且只列"真的有规范块"的节** ——
 *    没有规范块的节**不编造**（决策 207：不知道它该有什么规范）。
 * @param specs - 各节的规范（`sectionSpecsOf()` 的产物）。
 * @returns 模型可见文本；一节规范都没有时返回空串（**不输出空标题**）。
 */
export function renderSectionSpecs(
  specs: readonly { title: string; spec: string; truncate: boolean }[],
): string {
  if (specs.length === 0) return ''
  const parts: string[] = [promptText('reads:section-spec-head', SECTION_SPEC_HEAD)]
  for (const s of specs) {
    // ⭐ 规范原文**逐字**列出（多行照原样缩进），不做摘要、不改写。
    const body = s.spec
      .split(/\r?\n/)
      .map((l) => `    ${l}`)
      .join('\n')
    parts.push(`· **${s.title}**${s.truncate ? '（可自动截断归档）' : ''}：`)
    parts.push(body)
  }
  parts.push('')
  parts.push(promptText('reads:section-spec-closing', SECTION_SPEC_CLOSING))
  return parts.join('\n')
}
