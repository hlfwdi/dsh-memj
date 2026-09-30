/**
 * ⭐⭐ **正文镜像**（决策 135）—— git 版本维护的对象。
 *
 * ── 它解决的是什么问题 ─────────────────────────────────────────────────────
 * 用户的两个诉求在**同一个文件里**是冲突的：
 *   · 想对"**压缩后的正文**"做版本管理（压缩搞砸了能退回去）；
 *   · 但活跃文档 `projects/HANDOFF-<项目>.md` **把封面和正文混在一个文件里**，
 *     而封面是"知识的唯一源头"，**不该被当成正文的版本去回溯**。
 *
 * ⇒ 解法：**另存一份纯正文的文件**给 git 管。它由
 *   `narrativeFromProjectText()` 生成（已剥掉 frontmatter、`# HANDOFF` 标题、
 *   「沉淀知识」节与**全部封面**）⇒ ⭐ **"只维护正文"不是靠过滤技巧，而是它本来就只有正文**。
 *
 * ── 与「历史归档」的分工（**两个东西，别混**）────────────────────────────
 * | | 历史归档（`history.ts`） | 镜像（本模块） |
 * |---|---|---|
 * | 落点 | 库里的一条**条目**（`kind: 'history'`） | 库内文件 `backup/HANDOFF-<项目>.md` |
 * | 内容 | **被截走的原文**（逐字） | **当前正文**（跟随活跃文档） |
 * | 用途 | 兜底：早前写下的原文都查得回 | 版本：截断改坏了能退回去 |
 *
 * ⚠️ **历史（决策 136）**：曾有一个"追加型台账"（`backup/snapshot/`，只追加不压缩），
 *    已被用户裁定**删除**——"存档原文"这件事改由**历史条目**承担，
 *    两套机制并存只会长出两套边界。
 *
 * @module dsh-memj/narrative
 */

import { backupNarrativePath } from './paths.ts'
import { readTextIfExists, writeTextAtomic } from './files.ts'

/**
 * 页眉的**尾标记**（用于读回时剥页眉）。
 *
 * 🔴 用一个固定的尾标记定位、**不按行数剥**——将来页眉加一行，
 *    按行数剥就会把正文的第一行一起吃掉（静默截断）。
 */
const HEADER_END = '压缩改坏了可以用 git 退回。 -->'

/** 镜像文件的固定页眉（说明它是派生物 + 别手改）。 */
function header(projectId: string): string {
  return [
    `<!-- 本文件由 dsh-memj 自动生成，是「${projectId}」交接文档的**正文镜像**（不含封面）。`,
    '     ⚠️ 手改会在下次 handoff 时被覆盖——要改知识，请改 projects/ 下的活跃文档。',
    `     ⭐ 它是 git 版本维护的对象：${HEADER_END}`,
    '',
  ].join('\n')
}

/**
 * 读某项目的镜像正文（**剥掉页眉**，便于与活跃文档的叙事逐字比对）。
 * @param projectId - 项目 id。
 * @returns 正文；不存在时 `undefined`。
 */
export async function readNarrativeMirror(projectId: string): Promise<string | undefined> {
  const text = await readTextIfExists(backupNarrativePath(projectId))
  if (text === undefined) return undefined
  const idx = text.indexOf(HEADER_END)
  // ⚠️ 没有页眉（人手建的/被改过）⇒ 整份当正文，**不报错**。
  if (idx === -1) return text.trim()
  return text.slice(idx + HEADER_END.length).replace(/^\n+/, '').trim()
}

/**
 * ⭐ **写某项目的正文镜像**（覆盖）。
 *
 * 🔴 **必须只在"叙事真的变了"时才写**：否则每次 handoff 都会刷一次文件，
 *    git 里会多出一堆**内容相同的空提交**（提交前虽会判 `porcelain`，
 *    但白写一次盘、且 diff 判断也失去意义）。
 * @param projectId - 项目 id。
 * @param narrative - 纯叙事（`narrativeFromProjectText()` 的结果）。
 * @returns 是否**真的写了**（内容未变时 `false`）。
 */
export async function writeNarrativeMirror(projectId: string, narrative: string): Promise<boolean> {
  const body = narrative.trim()
  const existing = await readNarrativeMirror(projectId)
  // ⚠️ 用 `existing !== undefined` 区分"首次写"与"内容相同"——空正文也是合法内容。
  if (existing !== undefined && existing === body) return false
  await writeTextAtomic(backupNarrativePath(projectId), `${header(projectId)}${body}\n`)
  return true
}
