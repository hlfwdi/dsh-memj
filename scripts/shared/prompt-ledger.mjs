// ⭐⭐⭐ 提示词账本一致性：**实际注册的工具** vs **`TOOL_META`（提示词页账本）**。
//
// 🔴🔴 为什么要有这个共用模块（2026-10-12）：
//   事故：决策 205 加了第 11 个工具 `memj_template`，却漏了在 `prompts.ts` 的
//   `TOOL_META` 里登记 ⇒ **它整条不在【提示词】页上**（看不到 / 改不了 /
//   `/api/prompt?key=…` 直接 404），而**运行时一切正常** ⇒ 没有任何机制会报。
//   ⭐ 判据（决策 190 的可迁移版）：**"要列全某类东西"的功能，必须有"从源头扫、
//     与清单对账"的检查**——否则清单完整性只依赖"上次那个人够不够细"。
//
// ⚠️ **为什么抽成模块而不是各写一遍**：`check-prompt-specs.mjs`（测试套件）
//    与 `build.mjs`（构建自检）**两处都要用它**——本项目铁律：
//    **同一判据只留一份实现**（两份必然漂移）。
//
// @module dsh-memj/scripts/lib/prompt-ledger
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 从 `tools.ts` 抽出**实际注册**的工具名。
 *
 * ⚠️ 按 `safeRegister(` 之后的第一个引号串取，而不是全文搜 `memj_`：
 *    后者会把注释、错误提示、字符串里的提及也算进来 ⇒ 假阳性。
 * @param root - 插件仓根。
 * @returns 注册的工具名（按出现顺序）。
 */
export function registeredToolNames(root) {
  const src = readFileSync(join(root, 'src', 'tools.ts'), 'utf8')
    .replace(/\r\n/g, '\n')
    // 去掉行注释，避免注释里的 `safeRegister('x')` 被算进来。
    .replace(/^\s*\/\/.*$/gm, '')
  const out = []
  const re = /safeRegister\(\s*'([a-z_]+)'/g
  let m
  while ((m = re.exec(src)) !== null) out.push(m[1])
  return out
}

/**
 * 从 `prompts.ts` 抽出 `TOOL_META` 里登记的工具名。
 *
 * ⚠️ **必须只扫 `TOOL_META` 那一段**：直接用全文正则会连带扫到
 *    `PROMPT_SPECS` 里由它派生出的模板串（`tool:${t.name}:description`）——
 *    那是**变量**不是名字，扫进来会得出错误的集合。
 * @param root - 插件仓根。
 * @returns 登记的工具名（按出现顺序）。
 */
export function metaToolNames(root) {
  const src = readFileSync(join(root, 'src', 'prompts.ts'), 'utf8').replace(/\r\n/g, '\n')
  const start = src.indexOf('const TOOL_META')
  if (start < 0) throw new Error('在 src/prompts.ts 里找不到 `const TOOL_META`')
  const arrStart = src.indexOf('[', start)
  const arrEnd = src.indexOf('\n]', arrStart)
  if (arrStart < 0 || arrEnd < 0) throw new Error('TOOL_META 的数组边界没找到')
  const body = src.slice(arrStart, arrEnd)
  const out = []
  const re = /\{\s*name:\s*'([a-z_]+)'/g
  let m
  while ((m = re.exec(body)) !== null) out.push(m[1])
  return out
}

/**
 * 对账两处清单。
 * @param root - 插件仓根。
 * @returns `{ registered, meta, missingInMeta, missingInCode, orderMismatch, ok, sanity }`。
 *   `sanity === false` ⇒ **解析本身没工作**（正则写坏了），此时结论不可信、不该报"通过"。
 */
export function auditPromptLedger(root) {
  const registered = registeredToolNames(root)
  const meta = metaToolNames(root)
  const missingInMeta = registered.filter((n) => !meta.includes(n))
  const missingInCode = meta.filter((n) => !registered.includes(n))
  const common = registered.filter((n) => meta.includes(n))
  const orderMismatch =
    JSON.stringify(common) !== JSON.stringify(meta.filter((n) => registered.includes(n)))
  // ⭐ 两条都要非空，否则是"正则没匹配到"而不是"真的没有差异"——
  //   不加这道闸，正则写坏会**静默报通过**（本项目吃过"校验自己坏了"的亏）。
  const sanity = registered.length > 0 && meta.length > 0
  return {
    registered,
    meta,
    missingInMeta,
    missingInCode,
    orderMismatch,
    sanity,
    ok: sanity && missingInMeta.length === 0 && missingInCode.length === 0 && !orderMismatch,
  }
}

/**
 * ⭐⭐⭐ **检查「可编辑但缺 `sourceConst`」的条目**（2026-10-12 新增，真实事故修）。
 *
 * 🔴🔴 **为什么需要它**：写回功能上线后，我漏给 2 条登记 `sourceConst`
 *   （`section:memj:protocol` / `context:memj:usage-guidance`——
 *    它们是**手工定义**的 spec，不在 `TOOL_META`/`CMD_META` 的循环里，
 *    于是两次批量补登记都没覆盖到）。
 *   后果：**那两条的「写回源码」按钮永远不出现**，而页面上看不出任何异常
 *   ⇒ 只能靠人肉眼发现"这两条怎么没有按钮"（用户就是这么发现的）。
 *
 * ⭐ 判据：**"可编辑"与"可写回"是一对必须同时成立的属性**——
 *   凡 `editable: true` 的条目，要么有 `sourceConst`，要么是**显式声明的例外**。
 *   ⚠️ 现存的合法例外：`handoff:prompt`（参数化模板，不是单个常量 ⇒ 不能整体替换）。
 * @param specs - `PROMPT_SPECS`。
 * @returns 缺 `sourceConst` 的可编辑条目 key 列表。
 */
export function auditEditableWithoutSourceConst(specs) {
  return specs
    .filter((s) => s.editable === true && (s.sourceConst ?? '') === '')
    .map((s) => s.key)
}

/**
 * ⭐⭐ 把对账结果渲染成**给人/模型看的报告**。
 *
 * 🔴 **措辞按用户 2026-10-12 的裁定写**：这检查的目的是**提醒「提示词设置页有缺失」**，
 *   而不是让人自动去改代码。
 *   ⇒ 报告里必须**明写"等用户确认"**，且**不得自行补**——
 *     因为**页面没有"新增条目"的能力**（条目列表来自编译期常量 `TOOL_META`），
 *     补只能在代码里做、补完还要重启才会出现在页面上。
 * @param audit - `auditPromptLedger()` 的返回值。
 * @returns 多行文本。
 */
export function renderLedgerReport(audit) {
  const L = []
  L.push(`  实际注册（tools.ts）：${audit.registered.length} 个`)
  L.push(`  页面账本（prompts.ts TOOL_META）：${audit.meta.length} 个`)

  if (!audit.sanity) {
    L.push('')
    L.push('  🔴 **解析没工作**（某一侧解析出 0 个）⇒ 结论不可信，先修正则！')
    return L.join('\n')
  }

  if (audit.missingInMeta.length > 0) {
    L.push('')
    L.push('  🔴 **提示词设置页缺失以下工具**（注册了但没进 TOOL_META）：')
    for (const n of audit.missingInMeta) {
      L.push(`     · ${n}  ⇒ 缺 3 条：tool:${n}:description / :parameters / :output`)
    }
    L.push('')
    L.push('     ⚠️ 后果：该工具在【提示词】页上**完全看不到、也改不了**，')
    L.push('        `/api/prompt?key=…` 会返回 404。而**运行时是正常的** ⇒ 平时发现不了。')
    L.push('')
    L.push('     🔴 **处理方式（按用户裁定）**：')
    L.push('        1. **先向用户报告**这个缺失，等确认；')
    L.push('        2. 用户确认后，在 `src/prompts.ts` 的 `TOOL_META` 里补一项；')
    L.push('        3. 重新构建 + **重启实例** ⇒ 该工具才会出现在提示词页上。')
    L.push('     ⛔ **不要在页面上补**——页面没有"新增条目"的能力（条目来自编译期常量）。')
    L.push('     ⛔ **不要自行补代码**：这是提醒用户，不是自动修复。')
  }

  if (audit.missingInCode.length > 0) {
    L.push('')
    L.push('  🔴 **账本里有、但没有对应工具**（改名/删工具后忘了同步）：')
    for (const n of audit.missingInCode) L.push(`     · ${n}`)
  }

  if (audit.orderMismatch) {
    L.push('')
    L.push('  ⚠️ 两侧**相对顺序**不一致（页面上分组会跳跃；不致命但建议对齐）')
  }

  if (audit.ok) L.push('  ✅ 一致')
  return L.join('\n')
}
