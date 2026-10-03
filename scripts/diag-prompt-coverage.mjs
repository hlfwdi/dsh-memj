/**
 * 全面对账：**已登记的提示词默认值** vs **PROMPT_SPECS 账本**（双向）。
 *
 * 🔴🔴 为什么需要它（2026-10-12）：
 *   发现第 11 个工具 `memj_template` **整条不在【提示词】页上**（漏登记 `TOOL_META`）。
 *   修掉之后要回答一个更重要的问题：**还有没有别的缺漏/不一致？**
 *   ⇒ 不能靠逐个肉眼比，要**从源头扫、与清单对账**（决策 190 的可迁移判据）。
 *
 * ⭐ 两个方向都要查：
 *   · **在册但未登记**（`PROMPT_SPECS` 有、`registerPromptDefault` 没调）
 *     ⇒ 页面显示 `textLen: 0`，用户改不了/看到空内容；
 *   · **已登记但不在册**（`registerPromptDefault` 调了、`PROMPT_SPECS` 没有）
 *     ⇒ **页面完全看不到它**（本次的 `memj_template` 事故形态），
 *        `/api/prompt?key=…` 还会 404。
 *
 * ⚠️ **默认值必须通过 `apply()` 才登记**（`registerPromptDefault` 在 apply 里调）——
 *   直接 import 模块拿不到（同 `diag-prompt-revert.mjs` 的教训）。
 *
 * 用法：node scripts/diag-prompt-coverage.mjs
 * 只读；不改任何东西（写到临时目录，不碰生产库）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ⚠️ 必须在 import 插件**之前**改库根：apply 会读它。
const throwaway = mkdtempSync(join(tmpdir(), 'memj-cov-'))
process.env['MEMJ_DATA_DIR'] = throwaway

const mod = await import('../lib/index.js')

const injected = []
const logger = { info() {}, warn() {}, error() {} }
const mkCtx = (extra = {}) => ({
  logger,
  get: () => undefined,
  on: () => () => {},
  effect(fn) { try { fn() } catch { /* 忽略 */ } return () => {} },
  inject(deps, cb) { injected.push(cb) },
  ...extra,
})
mod.apply(mkCtx(), mod.DEFAULT_CONFIG)
const scoped = mkCtx({
  systemPrompt: {
    section: () => () => {},
    context: () => () => {},
    tools: () => () => {},
    getSectionOrder: () => 1,
    getContextOrder: () => 1,
  },
  tools: { register: () => () => {} },
  commands: { register: () => () => {} },
})
for (const cb of injected) {
  try { cb(scoped) } catch { /* 忽略：只要能登记默认值 */ }
}

// ── 两侧集合 ──────────────────────────────────────────────────────────────
const specs = mod.PROMPT_SPECS ?? []
const specKeys = specs.map((s) => s.key)
const specSet = new Set(specKeys)

/** 已登记的 key（`registerPromptDefault` 的结果）。 */
const registeredKeys = typeof mod.registeredPromptKeys === 'function'
  ? mod.registeredPromptKeys()
  : undefined

console.log('=== 提示词覆盖对账 ===')
console.log(`PROMPT_SPECS 账本：${specKeys.length} 条`)
console.log(`库根（临时）：${throwaway}`)

if (registeredKeys === undefined) {
  // 没有导出枚举接口 ⇒ 退化为"按账本逐条查有没有默认值"（单向，只能查方向 ①）。
  console.log('⚠️ 插件未导出 `registeredPromptKeys()` ⇒ 只能做**单向**检查（在册但无默认值）。')
  console.log('   ⇒ 想查方向 ②（已登记但不在册）需要插件导出该函数。\n')
  const noDefault = specKeys.filter((k) => (mod.promptDefault(k) ?? '') === '')
  console.log(`① 在册但**没有**默认值：${noDefault.length} 条`)
  for (const k of noDefault) console.log(`   🔴 ${k}`)
  if (noDefault.length === 0) console.log('   ✅ 全部有默认值')
  process.exit(0)
}

const regSet = new Set(registeredKeys)

// 🔴🔴 **判据修正（2026-10-12 实测踩到）**：只有 `editable: true` 的条目
//   才需要 `registerPromptDefault`——**参数 / 输出 schema 与命令描述本来就不可编辑**
//   （`prompts.ts` 里标着 `editable: false` + `readonlyWhy`），
//   它们的文本由**运行时对象**提供（工具定义、命令注册），不走默认值登记。
//   ⚠️ 第一版没做这个区分 ⇒ 报出 **27 条"在册但未登记"全是误报**，
//      真问题会被这堆噪声淹掉。
const editableKeys = new Set(specs.filter((s) => s.editable === true).map((s) => s.key))

const inSpecNotReg = specKeys.filter((k) => editableKeys.has(k) && !regSet.has(k))
const inRegNotSpec = registeredKeys.filter((k) => !specSet.has(k))
const notEditable = specKeys.filter((k) => !editableKeys.has(k))

console.log(`\n① 可编辑但在册**未登记**（页面显示空、改不了）：${inSpecNotReg.length} 条`)
for (const k of inSpecNotReg) console.log(`   🔴 ${k}`)
if (inSpecNotReg.length === 0) console.log('   ✅ 无')

console.log(`\n② 已登记但**不在册**（页面完全看不到）：${inRegNotSpec.length} 条`)
for (const k of inRegNotSpec) console.log(`   🔴 ${k}`)
if (inRegNotSpec.length === 0) console.log('   ✅ 无')

console.log(`\n③ 只读展示项（不参与默认值登记，属正常）：${notEditable.length} 条`)
console.log('   ' + notEditable.map((k) => k.replace(/^tool:/, '').replace(/:.*$/, '')).filter((v, i, a) => a.indexOf(v) === i).join('、'))

// ④ 按 zone 统计（供交叉核对计数）。
const byZone = {}
for (const s of specs) byZone[s.zone] = (byZone[s.zone] ?? 0) + 1
console.log('\n④ 账本按 zone 分布：')
for (const [z, n] of Object.entries(byZone)) console.log(`   ${z}: ${n}`)

const bad = inSpecNotReg.length + inRegNotSpec.length
console.log(bad === 0 ? '\n✅ 两侧完全一致' : `\n❌ 共 ${bad} 处不一致`)
process.exit(bad === 0 ? 0 : 1)
