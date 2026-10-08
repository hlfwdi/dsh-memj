/**
 * ⭐⭐ **历史归档**（决策 136 → **决策 223 大改**）—— 现在只剩下**读侧**。
 *
 * ── 🔴🔴 2026-10-12（决策 223）：归档从"工具自动做"改成"模型按规范做" ──────
 *
 * **用户裁定**（原话）：
 * > *"归档交给模型，工具嘛，因为没法识别就不要了。完全交给模型吧。*
 * >  *但本身对模型的强提醒和一定程度的校验还是要想办法的。"*
 *
 * 根因：**归档规则改成写在各节的书写规范里（自然语言）**，
 * 而**工具读不懂自然语言** ⇒ 它无法再判断"该不该截、截到哪"。
 * ⇒ 于是它**不再执行归档**，改成当**监察者**：
 *   ① `memj_handoff` 回执里**报出各节字符数**（模型据此对照规范里的数字）；
 *   ② 继续点名「本次没动的节」（决策 222 那套）。
 *
 * ── 🔴 与旧设计的取舍（**这次是主动放弃了一条防线，要知悉**）──────────────
 * 旧设计（本模块原来的注释）写着：
 * > 压缩规范写了判据、也加了触发条件，**连报 7 次、一次没压**。
 * > 根因是"**要模型自己动手**"；而截断是**工具自己做的事**
 * > ⇒ ⭐ **"报了但不做"这个失败模式从此不存在**。
 *
 * ⚠️ **本次把这个失败模式请回来了** —— 这是用户明确知悉并接受的代价，
 *    换来的是"**归档策略完全由各节的书写规范决定**"（阈值、颗粒度、类型、
 *    甚至"要不要归档"都能用自然语言写清，不再受限于工具的固定逻辑）。
 * ⭐ 缓解手段就是上面那两条**提醒**：**报数**（有确切数字才能对照）+ **点名**。
 *
 * ── ⚠️ 保留下来的东西（**别再删**）──────────────────────────────────────────
 * · `HISTORY_SECTION`：存量文档的「当前进度」末尾**真的有**这个小节
 *   （里面是指向已归档条目的指针）⇒ 它必须还能被**读出来、显示出来**；
 * · `readHistoryLines()`：同上（读那一节的行）；
 * · `splitSectionsForHistory()`：被 `readHistoryLines` 用着。
 *
 * 🔴 **已删除的**（都是为"工具自动归档"服务的，现已无消费者）：
 *   `truncateProgress` / `truncateOneSection` / `groupChunks` / `buildProgressSection` /
 *   `fillHistoryId` / `removeSection` / `summarize` / `summarizeTitle` / `slugSegment` /
 *   `historySlug` / `newEntryId` / `HistoryChunk` / `TruncateResult`。
 *   ⚠️ **它们的 slug/命名规则（如 `dsh-memj-history-b32-b37`）没有丢** ——
 *      已作为**例子写进默认模板的规范**里，由模型照着起名（决策 223）。
 *
 * @module dsh-memj/history
 */

/** 「历史进展」小节名（**「当前进度」内部**的 `###` 小节，用户裁定）。 */
export const HISTORY_SECTION = '历史进展'

/**
 * 一条 `###` 小节的边界（含标题行）。
 *
 * ⚠️ **与 `handoff.ts` 的 `splitAny` 同规则**：跳过代码围栏内的伪标题。
 *    自己实现一份是因为 `splitAny` 在 `handoff.ts` 内部、未导出。
 *    ⚠️ 两边规则若漂移会出问题 ⇒ 探针里有一条**断言两者对同一文档切出相同小节**。
 */
export interface SubSection {
  title: string
  level: 2 | 3
  /** 标题行下标（0 起）。 */
  start: number
  /** 结束下标（不含）——下一个**级别 ≤ 本级**的标题。 */
  end: number
}

/**
 * 按 `##` / `###` 切节（**跳过围栏**）。
 *
 * ⚠️ **决策 223 后它只服务读侧**（`readHistoryLines`）—— 写侧（截断）已删。
 * @param lines - 全文行。
 * @returns 小节数组。
 */
export function splitSectionsForHistory(lines: readonly string[]): SubSection[] {
  const heads: Array<{ title: string; level: 2 | 3; line: number }> = []
  let inFence = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line)
    if (m !== null) {
      heads.push({ title: (m[2] ?? '').trim(), level: (m[1] ?? '').length === 2 ? 2 : 3, line: i })
    }
  }
  return heads.map((h, idx) => {
    let end = lines.length
    for (let k = idx + 1; k < heads.length; k += 1) {
      const nxt = heads[k]
      if (nxt !== undefined && nxt.level <= h.level) {
        end = nxt.line
        break
      }
    }
    return { title: h.title, level: h.level, start: h.line, end }
  })
}

/**
 * ⭐ 读某份文档里「历史进展」小节的行（**存量指针要原样保住**）。
 *
 * 🔴 **为什么它还活着**（决策 223 之后）：
 *    存量文档（含 `dsh-memj` 自己）的「当前进度」末尾**真的有这一节**，
 *    里面是**指向已归档条目的完整 UUID**。工具不再写它，但**必须还能读它** ——
 *    否则那些指针会**在正文重写时被当成普通内容丢掉**（本项目吃过"取叙事时丢东西"的亏）。
 *
 * ⚠️ **`handoff` 主路径已不再调用它**（决策 223 起工具不归档了）——
 *    保留它是为了 **API / 未来的迁移脚本 / 读侧渲染**能拿到这段指针。
 * @param narrative - 纯叙事。
 * @returns 那一节的行（不含标题行本身）；没有该节 ⇒ 空数组。
 */
export function readHistoryLines(narrative: string): string[] {
  const lines = narrative.split(/\r?\n/)
  const secs = splitSectionsForHistory(lines)
  const sec = secs.find((s) => s.title === HISTORY_SECTION)
  if (sec === undefined) return []
  return lines
    .slice(sec.start + 1, sec.end)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
}
