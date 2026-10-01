/**
 * dsh-memj —— **交接文档的节名契约（唯一源头）**
 *
 * 🔴🔴 **为什么单独一个文件**：这些节名被 `store.ts` / `handoff.ts` / `history.ts` /
 *   `parse.ts` 四处消费，而它们之间**已有依赖方向** `store → parse`
 *   ⇒ 常量若放在 `store.ts`，`parse.ts` 引用它就会形成**循环依赖**。
 *   ⇒ 所以下沉成本模块（**零依赖**，只导出常量与纯函数）。
 *
 * 🔴🔴 **节名不是"文案"，是"程序协议"**（2026-09-30 普查结论）：
 *   · `history.ts`   按 `PROGRESS_TITLE` 找**截断目标节**（找不到 ⇒ 静默不截断）；
 *   · `handoff.ts`   按它统计**孤本判据**（找不到 ⇒ 那道防线整个消失）；
 *   · `handoff.ts`   按 `NARRATIVE_TITLES` 出**回执体量行**；
 *   · `read.ts`      按它做**子串匹配**（`section:"当前进度"` 之类）；
 *   · `store.ts`     按 `NARRATIVE_SECTIONS` 重建文档骨架。
 *
 * ⚠️ **历史教训（这次合并掉的）**：同一份节名曾有 **3 份不共享的副本** ——
 *   ① `store.ts` 的 `NARRATIVE_SECTIONS`（带 `## ` 前缀）
 *   ② `handoff.ts` 的本地 `NARRATIVE_TITLES`（无前缀）
 *   ③ `handoff.ts` 回执体量行里现写的 `order` 数组
 *   加上「沉淀知识」的 **2 处不共享的正则**（`handoff.ts` / `parse.ts`）。
 *   ⇒ 任何一处要动都得全部同改，**漏一处就是静默失效**。
 *
 * @module dsh-memj/sections
 */

/**
 * ⭐⭐⭐ **六节叙事的节名**（顺序固定，§3.1）。**全库唯一源头。**
 */
export const NARRATIVE_TITLES: readonly string[] = [
  '目标',
  '当前进度',
  '有效做法',
  '失败/踩坑',
  '关键上下文',
  '下一步',
]

/** 项目文档的**六节叙事**标题（带 `## ` 前缀，供解析/匹配用）。 */
export const NARRATIVE_SECTIONS: readonly string[] = NARRATIVE_TITLES.map((t) => `## ${t}`)

/**
 * ⭐⭐ **截断目标节名**。
 *
 * 🔴 只对这一节做自动截断（决策 136 / 127）：它是**唯一的主要膨胀源**
 *   （实测占交接文档 46%），其余五节按规范**只做语义精炼、不许删条目**。
 */
export const PROGRESS_TITLE = '当前进度'

/**
 * ⭐⭐⭐ 「沉淀知识」节的**节名**（无 `#` 前缀）。
 *
 * 🔴🔴 **这一节对用户是「钉死」的、不参与任何模板自定义**（用户 2026-09-30 裁定）：
 *   **封面物理上就存在这一节里**（`store.ts` 重建它、`parse.ts` 与 `handoff.ts`
 *   按它砍掉旧封面再写新的）⇒ 一旦改名或删掉，**封面会丢或每轮累积**。
 *   ⭐ 用户侧**无感知**：他不需要知道有这么一节，工具自己会写。
 */
export const KNOWLEDGE_TITLE = '沉淀知识'

/** 「沉淀知识」节标题（带 `## ` 前缀）。 */
export const KNOWLEDGE_SECTION = `## ${KNOWLEDGE_TITLE}`

/**
 * ⭐ 判断一行是不是「沉淀知识」的**顶层标题行**。
 *
 * 🔴 **必须按行首精确匹配**（不能用 `indexOf` 查子串）：叙述里可能**引用**
 *   这个标题（例如"见 `## 沉淀知识`"），子串查找会把真实内容误删。
 *   ⚠️ 这是既有实现里明写过的坑 —— 本函数是它的**唯一实现**
 *   （历史上 `handoff.ts` 与 `parse.ts` 各写了一遍同样的正则）。
 * @param line - 待判定的行。
 * @returns 是「沉淀知识」顶层标题 ⇒ true。
 */
export function isKnowledgeHeading(line: string): boolean {
  return new RegExp(`^##\\s+${KNOWLEDGE_TITLE}\\s*$`).test(line)
}

/**
 * ⭐ 砍掉「沉淀知识」节**及其后的全部内容**。
 *
 * 🔴 用途：写文档前先清掉旧封面（那一节由工具重建，只放封面不放正文）。
 *   ⚠️ 按**行首精确匹配**，理由同 `isKnowledgeHeading()`。
 * @param text - 文本。
 * @returns 砍掉后的文本（没有该节 ⇒ 原样返回）。
 */
export function cutKnowledgeSection(text: string): string {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    if (isKnowledgeHeading(lines[i] ?? '')) return lines.slice(0, i).join('\n')
  }
  return text
}
