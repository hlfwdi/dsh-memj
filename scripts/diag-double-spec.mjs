/**
 * 🔴 **诊断：规范块为什么被写了两遍**（决策 223 改造后冒出来的）。
 * 用法：node scripts/diag-double-spec.mjs
 */
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-diag-'))
mkdirSync(join(lib, 'projects'), { recursive: true })
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const CFG = { ...mod.DEFAULT_CONFIG, themeCreation: 'loose', backupGit: false }
const F = String.fromCharCode(96, 96, 96) + 'memj:spec'
const count = (t) => (t.split(F).length - 1)

console.log('── ① 建项目（第一次 handoff）──')
const r1 = await mod.runHandoff({
  project: 'diag1',
  projectDesc: '诊断双写；当诊断时读它。',
  doc: '## 目标\n\n总目标。\n\n## 当前进度\n\n### 第一批\n\n写了一点。\n',
}, { sessionId: 's-diag', turn: 1, config: CFG })
console.log('ok =', r1.ok, '｜ spec 块数 =', count(readFileSync(join(lib, 'projects', 'HANDOFF-diag1.md'), 'utf8')))

console.log('\n── ② 只写一节（第二次 handoff）──')
await mod.appendDocRead('s-diag', {
  project: 'diag1', turn: 2, readAt: new Date().toISOString(), full: true, sections: [],
})
const r2 = await mod.runHandoff({
  project: 'diag1',
  doc: '## 当前进度\n\n### 第二批\n\n又写。\n',
}, { sessionId: 's-diag', turn: 2, config: CFG })
const t2 = readFileSync(join(lib, 'projects', 'HANDOFF-diag1.md'), 'utf8')
console.log('ok =', r2.ok, '｜ spec 块数 =', count(t2))
console.log('\n── 「目标」节片段 ──')
const seg = t2.split('## 目标')[1]?.split('## 当前进度')[0] ?? ''
console.log(seg.slice(0, 300))
