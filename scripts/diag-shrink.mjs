/**
 * 🔴 诊断：第二次 handoff 后文档**变短**了 294 字符 —— 短在哪？
 * 用法：node scripts/diag-shrink.mjs
 */
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-shrink-'))
mkdirSync(join(lib, 'projects'), { recursive: true })
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const CFG = { ...mod.DEFAULT_CONFIG, themeCreation: 'loose', backupGit: false }
const P = 'shrink1'

const seed = await mod.runHandoff({
  project: P,
  projectDesc: '诊断变短；当诊断时读它。',
  doc: ['## 目标', '', '总目标。', '', '## 当前进度', '', '### 第一批', '', 'x'.repeat(300), ''].join('\n'),
}, { sessionId: 's-sh', turn: 1, config: CFG })
console.log('seed ok =', seed.ok)

const F = join(lib, 'projects', `HANDOFF-${P}.md`)
const before = readFileSync(F, 'utf8')
console.log('第一次后长度 =', before.length)

await mod.appendDocRead('s-sh', { project: P, turn: 2, readAt: new Date().toISOString(), full: true, sections: [] })
const h = await mod.runHandoff({
  project: P,
  doc: ['## 当前进度', '', '### 第二批', '', '又写了一点。', ''].join('\n'),
}, { sessionId: 's-sh', turn: 2, config: CFG })
console.log('handoff ok =', h.ok)

const after = readFileSync(F, 'utf8')
console.log('第二次后长度 =', after.length, '（差', after.length - before.length, '）')

// 逐行 diff（只报"只在一边出现"的行）
const B = before.split('\n')
const A = after.split('\n')
const onlyB = B.filter((l) => !A.includes(l) && l.trim() !== '')
const onlyA = A.filter((l) => !B.includes(l) && l.trim() !== '')
console.log('\n── 只在**第一次**里有的行（= 被弄丢了）──')
for (const l of onlyB.slice(0, 12)) console.log('  -', l.slice(0, 120))
console.log(`  （共 ${onlyB.length} 行）`)
console.log('\n── 只在**第二次**里有的行（= 新增/改写）──')
for (const l of onlyA.slice(0, 12)) console.log('  +', l.slice(0, 120))
console.log(`  （共 ${onlyA.length} 行）`)

// 目标节还在吗？
const goalBefore = before.split('## 目标')[1]?.split('\n## ')[0] ?? ''
const goalAfter = after.split('## 目标')[1]?.split('\n## ')[0] ?? ''
console.log('\n── 「目标」节 ──')
console.log('  第一次长度 =', goalBefore.length, '｜第二次长度 =', goalAfter.length)
console.log('  第一次含「总目标」 =', goalBefore.includes('总目标'), '｜第二次 =', goalAfter.includes('总目标'))
