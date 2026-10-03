/**
 * 诊断：列出全部 `editable` 条目及其 `sourceConst`（找出漏登记的）。
 * 判据：editable 但 sourceConst 为空 ⇒ **写回按钮永远不会出现**（这是本次的 bug 形态）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-diag2-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')

// 走 apply 让默认值登记（与真实运行一致）
const injected = []
const logger = { info() {}, warn() {}, error() {} }
const mkCtx = (extra = {}) => ({
  logger, get: () => undefined, on: () => () => {},
  effect(fn) { try { fn() } catch { /* 忽略 */ } return () => {} },
  inject(deps, cb) { injected.push(cb) },
  ...extra,
})
mod.apply(mkCtx(), mod.DEFAULT_CONFIG)
for (const cb of injected) {
  try {
    cb(mkCtx({
      systemPrompt: { section: () => () => {}, context: () => () => {}, tools: () => () => {}, getSectionOrder: () => 1, getContextOrder: () => 1 },
      tools: { register: () => () => {} },
      commands: { register: () => () => {} },
    }))
  } catch { /* 忽略 */ }
}

const specs = mod.PROMPT_SPECS ?? []
const editable = specs.filter((s) => s.editable === true)
console.log(`总条目 ${specs.length}，其中可编辑 ${editable.length}\n`)

let missing = 0
console.log('| key | zone | sourceFile | sourceConst |')
console.log('|---|---|---|---|')
for (const s of editable) {
  const c = s.sourceConst ?? ''
  if (c === '') missing += 1
  console.log(`| \`${s.key}\` | ${s.zone} | ${s.sourceFile} | ${c === '' ? '🔴 空（写回按钮不会出现）' : '`' + c + '`'} |`)
}
console.log(`\n🔴 可编辑但缺 sourceConst 的：${missing} 条`)
