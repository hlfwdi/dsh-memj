/**
 * 诊断：**保存后输入框为什么会还原**（用户 2026-09-29 报告的真 bug）。
 *
 * 🔴 **为什么要有这个脚本**：用户报"改了系统提示词、点保存后输入框还原成默认值"。
 *    要分清是**后端没存**还是**前端显示骗人** —— 两条路的修法完全不同。
 *    判据：拿覆盖表里的文本与**源码默认值**逐字比对。
 *      · 逐字相同 ⇒ **存的是默认值** ⇒ 用户那次编辑**真的丢了**；
 *      · 不同     ⇒ 存住了 ⇒ 只是**界面回显**问题。
 *
 * ⚠️ **默认值必须通过 `apply()` 才登记**（`registerPromptDefault` 在 apply 里调）
 *    —— 直接 `import` 模块是拿不到的（我第一版就漏了这步，报"没有登记默认值"）。
 *
 * 用法：node scripts/diag-prompt-revert.mjs
 * 只读；不改任何东西。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const lib = process.env['MEMJ_DATA_DIR'] ?? join(homedir(), '.dsh-memj')
const p = join(lib, 'prompts', 'overrides.json')
console.log('库根:', lib)
console.log('覆盖表:', p, '｜存在?', existsSync(p))
if (!existsSync(p)) {
  console.log('🔴 覆盖表不存在 ⇒ 没有任何覆盖值落盘（保存从未成功过）')
  process.exit(0)
}

// ⭐ 走 apply() 让各模块登记默认值（否则 promptDefault 全空）。
const mod = await import('../lib/index.js')
const throwaway = mkdtempSync(join(tmpdir(), 'memj-diag-'))
process.env['MEMJ_DATA_DIR'] = throwaway   // ⚠️ 别让 apply 真去读/建生产目录
const injected = []
const logger = { info() {}, warn() {}, error() {} }
const mkCtx = (extra = {}) => ({
  logger, get: () => undefined, on: () => () => {},
  effect(fn) { try { fn() } catch {} return () => {} },
  inject(deps, cb) { injected.push(cb) },
  ...extra,
})
mod.apply(mkCtx(), mod.DEFAULT_CONFIG)
const scoped = mkCtx({
  systemPrompt: { section: () => () => {}, context: () => () => {}, tools: () => () => {}, getSectionOrder: () => 1, getContextOrder: () => 1 },
  tools: { register: () => () => {} },
  commands: { register: () => () => {} },
})
for (const cb of injected) { try { cb(scoped) } catch { /* 忽略：只要能登记默认值 */ } }

const j = JSON.parse(readFileSync(p, 'utf8'))
const keys = Object.keys(j.overrides ?? {})
console.log('版本:', j.version, '｜覆盖条数:', keys.length)
console.log('覆盖的 key:', keys)

for (const k of keys) {
  const o = j.overrides[k]
  console.log('\n─── ' + k)
  console.log('  updatedAt:', o.updatedAt)
  console.log('  覆盖文本长度:', o.text.length)
  const def = mod.promptDefault(k)
  if (def === undefined) {
    console.log('  ⚠️ 仍拿不到默认值（该 key 未登记）')
    continue
  }
  console.log('  默认文本长度:', def.length)
  const same = o.text === def
  console.log('  🔴 **与默认值逐字相同?**', same)
  if (!same) {
    let i = 0
    while (i < Math.min(o.text.length, def.length) && o.text[i] === def[i]) i += 1
    console.log('  首个不同处 index=' + i)
    console.log('    覆盖:', JSON.stringify(o.text.slice(Math.max(0, i - 25), i + 45)))
    console.log('    默认:', JSON.stringify(def.slice(Math.max(0, i - 25), i + 45)))
  } else {
    console.log('  ⇒ **结论：存下来的就是默认值 ⇒ 用户那次编辑真的丢了。**')
  }
}

const h = join(lib, 'prompts', 'history')
if (existsSync(h)) {
  const fs = readdirSync(h)
  console.log('\n历史备份 ' + fs.length + ' 份：')
  for (const f of fs) {
    const t = readFileSync(join(h, f), 'utf8')
    const isDef = mod.promptDefault('section:memj:protocol') === t
    console.log('  ' + f + '  长度=' + t.length + '  等于默认值? ' + isDef)
  }
}
