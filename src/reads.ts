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

// ⭐⭐⭐ **交接时的「哪些节没动 / 该整理」点名**（决策 222，2026-10-12 用户裁定）。
//
// ── 为什么从「每次阅读都给」搬到「交接时点名」──────────────────────────────
// 决策 221 把各节规范**集中列在 `memj_read` 的返回值最前面**。用户当场否掉了这个位置：
//   *"现在他每一次阅读全都要给他一遍，这有点奇怪吧"* —— ⭐ **三点都对**：
//   ① **无条件**：读一条知识、查一个事实，也带上整份规范清单；
//   ② **重复**：一次交接要逐节读文档 ⇒ **同一份清单被给 7 遍**（本次实测）；
//   ③ **位置错**：它是"**要写的时候**才需要"的东西，却挂在"读"上。
// 🔴 更要紧的是它**会自我失效** —— 库里已有判据：
//   **一个总在报警的警报，与没有警报等价**（每轮都刷 ⇒ 变背景音 ⇒ 等于没给）。
//
// ── 🔴🔴 而用户同时指出了一件更要紧的事（本决策的真正动机）────────────────
//   *"写书写规范的目的不就是让他在做交接的时候去按规范去整理和书写吗？刚刚为什么没有做呢？"*
// ⇒ **规范只有"可见性"是不够的，它需要一个【触发点】。**
//   实测反例（就在提出 221 的那个会话里）：我逐节读文档时**看到**了规范清单、
//   也**真的去量了**「目标」节（18616 字符 / 0 个 `###`）—— 然后把它写成了
//   **"给用户的汇报"**，而**不是"我要做的事"**。⇒ ⭐ **看得见 ≠ 会去做。**
//
// ⭐ 所以本决策做两件事：
//   ① **阅读侧退回"按需"** —— 只在**整篇读**（`full`）时给一次；按节读**不给**
//      （逐节读的场景本来就会读很多次）；
//   ② **交接侧点名** —— `memj_handoff` 落盘后在回执里列出
//      **"本次没动的节"**，并明确要求逐条对照它们自己的规范。
//
// 🔴 **必须写成【单段字面量】**（不要在源码里用 `+` 拼多段）：
//    `prompt-writeback.ts` 的定位器只支持单段形态，多段拼接会被判 `unsupported`
//    ⇒ **设置页上不会出现"写回"按钮**（本项目实测踩过一次）。
export const SECTION_SPEC_HEAD: string =
  `📐 **本文档各节的写作规范**（逐节对照——写之前先看有没有哪一节已经不符合它自己的规范）：`

registerPromptDefault('reads:section-spec-head', SECTION_SPEC_HEAD)

export const SECTION_SPEC_CLOSING: string =
  `⚠️ 上面每一条都取自**这份文档自己的正文**（不是通用清单）。若某节的内容已经明显不符合它自己的规范，**顺手整理它**——「没写某一节」只能靠这一眼发现，工具不会替你检查。`

registerPromptDefault('reads:section-spec-closing', SECTION_SPEC_CLOSING)

// ⭐⭐⭐ **交接回执里那段「本次没动的节」的点名**（决策 222）。
//
// 🔴🔴 **它才是"规范会被执行"的那一环**（用户指出的关键）：
//    决策 221 只解决了"看得见"，而**实测证明看得见不等于会去做**（见上）。
//    本段给的是**触发点**：交接结束时把**没写过的节**摆出来，要求逐条对照规范。
//
// ⚠️ **`{{sections}}` 是一个插槽**（`fillSlots` 填）—— 由程序填进真实节名，
//    所以文案本身**不列节名**（那会与文档实际结构漂开）。
//    🔴 插槽校验是**双向**的：少了它 ⇒ 模型不知道是哪些节；多了 ⇒ 原样发给模型。
export const HANDOFF_UNTOUCHED_SECTIONS: string =
  `📋 **本次没动过的节（{{sections}}）**——逐条对照它们**自己的**规范，看有没有哪一节已经不符合了：`

registerPromptDefault('handoff:untouched-sections', HANDOFF_UNTOUCHED_SECTIONS)

// 🔴 **必须写成【单段字面量】**（不要在源码里用 `+` 拼多段）：
//    `prompt-writeback.ts` 的定位器只支持单段形态，多段拼接会被判 `not-found`
//    ⇒ **设置页上不会出现"写回"按钮**（本项目**已踩过三次**：221 那次是拼三段、
//      本次是拼两段 —— ⭐ 判据：**新增提示词常量时，先想"它能不能被写回"**）。
export const HANDOFF_UNTOUCHED_CLOSING: string =
  `⚠️ 上面这些节本次**原样保留**（合并规则：没写的节沿用旧内容）。规范就写在各节标题下那个 \`memj:spec\` 围栏块里——⭐ **若某节已经明显不符合它自己的规范，现在就把它整理进 \`doc\`** （要整节重写就带上它的全文）。⚠️ 但**不要为了"顺便"去改没问题的节**。`

registerPromptDefault('handoff:untouched-closing', HANDOFF_UNTOUCHED_CLOSING)

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
  specs: readonly { title: string; spec: string }[],
): string {
  if (specs.length === 0) return ''
  const parts: string[] = [promptText('reads:section-spec-head', SECTION_SPEC_HEAD)]
  for (const s of specs) {
    // ⭐ 规范原文**逐字**列出（多行照原样缩进），不做摘要、不改写。
    const body = s.spec
      .split(/\r?\n/)
      .map((l) => `    ${l}`)
      .join('\n')
    // 🔴 **决策 223：不再标注"（可自动截断归档）"** —— 那个标记已整个废除。
    parts.push(`· **${s.title}**：`)
    parts.push(body)
  }
  parts.push('')
  parts.push(promptText('reads:section-spec-closing', SECTION_SPEC_CLOSING))
  return parts.join('\n')
}
