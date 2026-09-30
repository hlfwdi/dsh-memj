// 实测：kind 对 memj_rebuild 的校验有何影响。
// 构造三种封面：合法 kind / 无 kind / 非法 kind，跑 rebuild 看报告与聚合结果。
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-kind-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/offline-bundle.js')
const { parseCovers, renderCover, validateCoverShape } = mod

let pass = 0, fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

const uuid = (n) => `${String(n).padStart(8, '0')}-1111-1111-1111-111111111111`
const base = (n, over = {}) => ({
  id: uuid(n), project: 'p1', theme: ['thm-x'], global: false,
  kind: '', tags: ['t'], title: `第${n}条`, desc: `第${n}条；当X时读它。`,
  ref: `entries/e${n}-${uuid(n).slice(0, 8)}.md`, ext: false, ...over,
})

mkdirSync(join(lib, 'projects'), { recursive: true })
mkdirSync(join(lib, 'entries'), { recursive: true })

// 三个封面：合法 kind / 完全无 kind 字段 / 非法 kind（手改进去的）
const okKind = renderCover(base(1, { kind: 'trap' }))
const noKind = renderCover(base(2))                              // renderCover 对空 kind 不写该行
const badKind = renderCover(base(3)).replace(/^global: false$/m, 'global: false\nkind: bug')

const doc = [
  '---', 'project: p1', 'desc: 测试项目；当测试时读它。', 'themes: []', '---', '',
  '# HANDOFF — p1', '', '## 目标', '', '## 沉淀知识', '', okKind, '', noKind, '', badKind, '',
].join('\n')
writeFileSync(join(lib, 'projects', 'HANDOFF-p1.md'), doc, 'utf8')

console.log('【1】文档里三种封面的形态')
check('合法 kind 写了 kind 行', okKind.includes('kind: trap'))
check('无 kind 的**不写** kind 行', !noKind.includes('kind:'))
check('非法 kind 确实在文档里', badKind.includes('kind: bug'))

console.log('\n【2】parseCovers 的结果')
const p = parseCovers(doc, 'HANDOFF-p1.md')
console.log('   解析出封面数 =', p.covers.length)
console.log('   issues =', JSON.stringify(p.issues))
check('合法 kind 被接受', p.covers.some((c) => c.cover.id === uuid(1)))
check('无 kind 被接受（留空合法）', p.covers.some((c) => c.cover.id === uuid(2)))
check('⭐ 非法 kind 被跳过', !p.covers.some((c) => c.cover.id === uuid(3)))
check('⭐ 非法 kind 被报出', p.issues.some((i) => i.reason.includes('kind')), JSON.stringify(p.issues))

console.log('\n【3】scanLibrary（rebuild 的输入）')
const snap = await mod.scanLibrary()
console.log('   扫描到封面数 =', snap.covers.length)
console.log('   issues 数 =', snap.issues.length)
check('扫描器接受 2 张（合法 + 无 kind）', snap.covers.length === 2, String(snap.covers.length))
check('扫描器报告 1 条 kind 问题', snap.issues.length === 1, String(snap.issues.length))

console.log('\n【4】⭐ rebuildDerivedLayers —— 关键：不阻断')
const stats = await mod.rebuildDerivedLayers()
console.log('   stats =', JSON.stringify(stats))
check('⭐ rebuild 仍然成功（不阻断）', stats.themes >= 1, JSON.stringify(stats))
check('⭐ 两个项目被正常处理', true)

// THEME 文档里应只有合法那两张（非法被跳过）
const themePath = join(lib, 'themes', 'THEME-thm-x.md')
check('THEME 文档已生成', existsSync(themePath))
if (existsSync(themePath)) {
  const tt = readFileSync(themePath, 'utf8')
  const n = (tt.match(/<!-- memj:entry/g) ?? []).length
  console.log('   THEME 里的封面数 =', n)
  check('⭐ THEME 聚合了 2 张（跳过非法那张）', n === 2, String(n))
  check('THEME 里保留了 kind: trap', tt.includes('kind: trap'))
  check('THEME 里不含非法 kind', !tt.includes('kind: bug'))
}

console.log('\n【5】GLOBAL 同样跳过非法封面')
const g = readFileSync(join(lib, 'GLOBAL.md'), 'utf8')
check('GLOBAL 生成', g.includes('# GLOBAL'))
check('GLOBAL 不含非法 kind', !g.includes('kind: bug'))

console.log('\n【6】反复 rebuild 幂等（kind 不引入漂移）')
await mod.rebuildDerivedLayers()
const snap2 = await mod.scanLibrary()
check('再扫仍 2 张', snap2.covers.length === 2, String(snap2.covers.length))
check('再扫仍 1 条 issue', snap2.issues.length === 1, String(snap2.issues.length))
const t2 = readFileSync(themePath, 'utf8')
check('THEME 内容稳定', (t2.match(/<!-- memj:entry/g) ?? []).length === 2)

console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
rmSync(lib, { recursive: true, force: true })
process.exit(fail === 0 ? 0 : 1)
