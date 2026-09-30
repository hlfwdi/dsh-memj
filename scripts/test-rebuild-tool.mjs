// 直接实测**工具** memj_rebuild（不是内部函数）：库里放一张非法 kind 的封面，看工具怎么回。
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-rb-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const B = await import('../lib/offline-bundle.js')
const { renderCover } = B

let pass = 0, fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

const uuid = (n) => `${String(n).padStart(8, '0')}-1111-1111-1111-111111111111`
const base = (n, over = {}) => ({
  id: uuid(n), project: 'p1', theme: [], global: false, kind: '',
  tags: ['t'], title: `第${n}条`, desc: `第${n}条；当X时读它。`,
  ref: `entries/e${n}-${uuid(n).slice(0, 8)}.md`, ext: false, ...over,
})

mkdirSync(join(lib, 'projects'), { recursive: true })
mkdirSync(join(lib, 'entries'), { recursive: true })

// 2 张合法（1 张带 kind、1 张不带）+ 1 张**非法 kind**（模拟人手改坏）
const doc = [
  '---', 'project: p1', 'desc: 测试项目；当测试时读它。', 'themes: []', '---', '',
  '# HANDOFF — p1', '', '## 目标', '', '## 沉淀知识', '',
  renderCover(base(1, { kind: 'trap' })), '',
  renderCover(base(2)), '',
  renderCover(base(3)).replace(/^global: false$/m, 'global: false\nkind: bug'), '',
].join('\n')
writeFileSync(join(lib, 'projects', 'HANDOFF-p1.md'), doc, 'utf8')

// 抓注册的工具
const tools = []
const scoped = {
  logger: {}, systemPrompt: { section: () => () => {} },
  tools: { register: (d) => { tools.push(d); return () => {} } },
  commands: { register: () => () => {} },
}
mod.apply({
  logger: {}, get: (n) => (n === 'webServer' ? { register: () => () => {} } : undefined),
  effect: (f) => { f() }, inject: (d, cb) => cb(scoped),
}, mod.DEFAULT_CONFIG)

const rebuild = tools.find((t) => t.name === 'memj_rebuild')
console.log('【1】工具存在且参数/输出正确')
check('memj_rebuild 已注册', rebuild !== undefined)
console.log('   参数:', JSON.stringify(Object.keys(rebuild.parameters.properties ?? {})))
console.log('   输出字段:', JSON.stringify(Object.keys(rebuild.output.schema.properties ?? {})))

console.log('\n【2】⭐ 用工具跑一次（库里有 1 张非法 kind）')
const r = await rebuild.execute({}, { agent: undefined })
console.log('   返回 =', JSON.stringify(r, null, 2))

check('工具调用成功（ok=true）', r.ok === true)
check('⭐ 非法封面被计数（invalidCovers=1）', r.invalidCovers === 1, String(r.invalidCovers))
check('主题已重建', typeof r.themes === 'number')
check('项目已处理', typeof r.projects === 'number')
// 🔴 关键：明细**不能**出现在工具返回里（决策 42：人侧与 LLM 侧分开）
const msg = r.message
// ⭐ 决策 122：回执改为"恒常给一行体检结论"（形如 `✅ 封面校验：1 张合法、1 张非法`），
//    数量仍要点出来，但**明细照旧不列**。判据随之更新（**不放宽**——明细检查原样保留）。
check('⭐ 消息报出非法数量，但不列明细',
  msg.includes('1 张**非法**') && !msg.includes('kind: bug') && !msg.includes('取值非法'),
  msg)
// ⭐ 决策 122 的新增断言：体检结论**恒常出现**（这是"走工具"的可感知价值）。
check('⭐⭐ 回执含"封面校验"体检行（决策 122）', msg.includes('封面校验'), msg)
check('消息指向人侧界面', msg.includes('/memj-review'))
check('⭐ 返回字段全在 schema 里（不会被拒收）',
  Object.keys(r).every((k) => k in rebuild.output.schema.properties),
  Object.keys(r).join(','))

console.log('\n【3】render 不抛，且内容合理')
const blocks = rebuild.output.render({}, r)
check('render 返回内容块', Array.isArray(blocks) && blocks.length > 0)
console.log('   渲染文本:')
console.log('   ' + String(blocks[0].text).replace(/\n/g, '\n   '))

console.log('\n【4】合法封面照常重建（跳过 ≠ 阻断）')
const snap = await mod.scanLibrary()
check('⭐ 2 张合法封面仍在', snap.covers.length === 2, String(snap.covers.length))
check('⭐ 1 条 issue 被报出', snap.issues.length === 1, String(snap.issues.length))
check('带 kind 的那张保留了 kind', snap.covers.some((c) => c.cover.kind === 'trap'))

console.log('\n【5】无非法封面时，工具不误报')
writeFileSync(join(lib, 'projects', 'HANDOFF-p1.md'),
  doc.replace(/^kind: bug$/m, 'kind: fact'), 'utf8')
const r2 = await rebuild.execute({}, { agent: undefined })
check('⭐ invalidCovers=0', r2.invalidCovers === 0, String(r2.invalidCovers))
check('消息里不再提"非法封面"', !r2.message.includes('非法封面'), r2.message)
const snap2 = await mod.scanLibrary()
check('3 张全部收录', snap2.covers.length === 3, String(snap2.covers.length))
check('kind 分布正确',
  snap2.covers.filter((c) => c.cover.kind === 'fact').length === 1 &&
  snap2.covers.filter((c) => c.cover.kind === 'trap').length === 1 &&
  snap2.covers.filter((c) => c.cover.kind === '').length === 1)

console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
rmSync(lib, { recursive: true, force: true })
process.exit(fail === 0 ? 0 : 1)
