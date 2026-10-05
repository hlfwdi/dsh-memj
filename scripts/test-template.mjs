/**
 * 交接文档模板：**工具决策 + API 契约**测试（决策 204 / 205）。
 *
 * 覆盖：
 *  1. **两段式确认**（用户 2026-09-30 裁定的 (b) 方案）——
 *     create / delete 未确认 ⇒ **什么都不做**；`list` 不需确认；
 *  2. **模板校验**（互为子串 / 沉淀知识 / desc 必填 / 至多一节 truncate）；
 *  3. **模板 CRUD**（存 / 读 / 列 / 删、default 不可删）；
 *  4. ⭐ **`/templates` `/template/save` `/template/delete` 的 API 契约**；
 *  5. ⭐⭐ **模板不回溯已有文档**（用户裁定的核心边界）。
 *
 * ⚠️ 必须在 `pnpm run build` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-template.mjs
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-tpl-'))
process.env['MEMJ_DATA_DIR'] = lib

const LIBDIR = join(process.cwd(), 'lib')
const mod = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)
const B = await import(pathToFileURL(join(LIBDIR, 'offline-bundle.js')).href)

let pass = 0
let fail = 0
function check(name, ok, extra = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${extra !== '' ? `　← ${extra}` : ''}`) }
}

// ── 取需要的实现（构建产物里可能内联在 index.js）──
const T = mod
const decide = mod.decideTemplateTool
const validate = mod.validateTemplate
const saveTpl = mod.saveTemplate
const loadTpl = mod.loadTemplate
const listTpl = mod.listTemplates
const delTpl = mod.deleteTemplate
const runHandoff = mod.runHandoff
const loadProjectDoc = mod.loadProjectDoc
const appendDocRead = mod.appendDocRead
const store = mod
const CFG = mod.DEFAULT_CONFIG

const { handleApi } = await (async () => {
  if (typeof mod.handleApi === 'function') return mod
  throw new Error('找不到 handleApi')
})()

/** 调 API（与真实路由同一入口）—— ⚠️ `handleApi` 是**位置参数**，不是对象。 */
async function api(method, path, body) {
  const raw = body === undefined ? '' : JSON.stringify(body)
  const url = new URL(`http://127.0.0.1${path}`)
  // ⚠️ 路径必须带 `/plugins/dsh-memj/api` 前缀（`handleApi` 内部按它切片）。
  return handleApi({ version: 'test' }, method, `/plugins/dsh-memj/api${url.pathname}`, raw, url.searchParams)
}

console.log('\n【1】两段式确认：未确认 ⇒ 什么都不做')
{
  const req = { action: 'create', template: { id: 'a-tpl', title: 'A', sections: [{ name: '目标', desc: '做什么' }] } }
  const d1 = decide(req)
  check('create 未确认 ⇒ needs-confirm', d1.kind === 'needs-confirm')
  check('回执含「待确认」', d1.kind === 'needs-confirm' && d1.message.includes('待确认'))
  check('回执明说「什么都没做」', d1.kind === 'needs-confirm' && d1.message.includes('什么都没做'))
  check('回执要求取得用户同意', d1.kind === 'needs-confirm' && d1.message.includes('取得同意'))
  check('给了 confirm ⇒ run', decide({ ...req, confirm: true }).kind === 'run')
  check('delete 未确认 ⇒ needs-confirm', decide({ action: 'delete', id: 'a-tpl' }).kind === 'needs-confirm')
  check('delete 回执提醒不影响已有文档',
    decide({ action: 'delete', id: 'a-tpl' }).message.includes('不影响任何已有文档'))
  check('⭐ list 不需确认（只读）', decide({ action: 'list' }).kind === 'run')
  check('未知 action ⇒ reject', decide({ action: 'zzz' }).kind === 'reject')
  check('create 缺 template ⇒ reject', decide({ action: 'create', confirm: true }).kind === 'reject')
  check('delete 缺 id ⇒ reject', decide({ action: 'delete', confirm: true }).kind === 'reject')
  check('delete default ⇒ reject', decide({ action: 'delete', id: 'default', confirm: true }).kind === 'reject')
}

console.log('\n【2】模板校验')
{
  const mk = (sections) => ({ version: 1, id: 't1', title: 'T', sections })
  check('合法 ⇒ 通过', validate(mk([{ name: '目标', desc: 'x' }])).length === 0)
  check('互为子串 ⇒ 拒绝',
    validate(mk([{ name: '进度', desc: 'x' }, { name: '进度详述', desc: 'y' }])).some((e) => e.includes('一次命中两节')))
  check('节名 = 沉淀知识 ⇒ 拒绝',
    validate(mk([{ name: '沉淀知识', desc: 'x' }])).some((e) => e.includes('由工具维护')))
  check('desc 为空 ⇒ 拒绝', validate(mk([{ name: '目标', desc: '' }])).some((e) => e.includes('desc')))
  // ⭐⭐ 决策 206（2026-10-02）：**多个 truncate 现在是允许的**（用户要求"可多选"）。
  //    ⚠️ 原先这条断言是"两个 truncate ⇒ 拒绝" —— 判据随设计更新，不是代码 bug。
  check('多个 truncate ⇒ **允许**（决策 206）',
    validate(mk([{ name: 'A', desc: 'x', truncate: true }, { name: 'B', desc: 'y', truncate: true }])).length === 0)
  check('3 个 truncate 也允许', validate(mk([
    { name: 'A', desc: 'x', truncate: true }, { name: 'B', desc: 'y', truncate: true }, { name: 'C', desc: 'z', truncate: true },
  ])).length === 0)
  check('0 个 truncate ⇒ 允许', validate(mk([{ name: 'A', desc: 'x' }])).length === 0)
  check('id 非法 ⇒ 拒绝', validate(mk([{ name: 'A', desc: 'x' }])).length === 0 && validate({ version: 1, id: 'BAD ID', title: 'T', sections: [{ name: 'A', desc: 'x' }] }).length > 0)
}

console.log('\n【3】模板 CRUD')
{
  check('保存合法 ⇒ 无错', (await saveTpl({ version: 1, id: 'crud-tpl', title: 'C', sections: [{ name: '目标', desc: 'x' }] })).length === 0)
  const back = await loadTpl('crud-tpl')
  check('读回一致', back !== undefined && back.sections.length === 1)
  const all = await listTpl()
  check('列表含 default', all.some((t) => t.id === 'default'))
  check('列表含新建的', all.some((t) => t.id === 'crud-tpl'))
  check('default 不可删', (await delTpl('default')) === false)
  check('自定义可删', (await delTpl('crud-tpl')) === true)
  check('删后读不到', (await loadTpl('crud-tpl')) === undefined)
  check('非法模板 ⇒ 不写盘', (await saveTpl({ version: 1, id: 'bad-tpl', title: 'B', sections: [{ name: 'x', desc: '' }] })).length > 0)
  check(' 且真的没落盘', (await loadTpl('bad-tpl')) === undefined)
}

console.log('\n【4】API 契约')
{
  const r1 = await api('GET', '/templates')
  check('GET /templates ⇒ 200 + items', r1.status === 200 && Array.isArray(r1.body.items))
  check('  含内置 default', r1.body.items.some((t) => t.id === 'default'))
  check('  default 标了不可删', r1.body.items.find((t) => t.id === 'default').deletable === false)
  check('  带 sectionCount', typeof r1.body.items[0].sectionCount === 'number')

  const r2 = await api('POST', '/template/save', {
    template: { id: 'api-tpl', title: 'API', sections: [{ name: '目标', desc: '做什么' }] },
  })
  check('POST /template/save ⇒ 200', r2.status === 200 && r2.body.ok === true)
  check('  真的落了盘', (await loadTpl('api-tpl')) !== undefined)

  const r3 = await api('POST', '/template/save', {
    template: { id: 'bad2', title: 'B', sections: [{ name: '沉淀知识', desc: 'x' }] },
  })
  check('非法模板 ⇒ 400 + errors', r3.status === 400 && r3.body.errors.length > 0)

  // ⭐⭐ **决策 208（2026-10-12）：`default` 现在【可以保存】**（模板落成 .md、默认模板也落盘，
  //    用户可直接编辑它）。⚠️ 原先这条断言是"覆盖 default ⇒ 400" ——
  //    **判据随设计更新，不是代码 bug**（本项目纪律：设计变了就改判据，且要说明为什么）。
  const r4 = await api('POST', '/template/save', { template: { id: 'default', title: 'D', sections: [{ name: 'A', desc: 'x' }] } })
  check('⭐⭐ 覆盖 default ⇒ **200**（决策 208：默认模板可编辑）', r4.status === 200 && r4.body.ok === true)
  check('  ⭐ 落盘后读到的是用户改过的那份', (await loadTpl('default'))?.sections?.[0]?.name === 'A')
  // 还原（否则会影响后续用例：默认模板已不是六节）
  const { defaultTemplate: dtpl, saveTemplate: stpl } = mod
  await stpl(dtpl())

  const r5 = await api('POST', '/template/delete', { id: 'api-tpl' })
  check('POST /template/delete ⇒ 200', r5.status === 200 && r5.body.ok === true)
  check('  真的删了', (await loadTpl('api-tpl')) === undefined)

  const r6 = await api('POST', '/template/delete', { id: 'default' })
  check('删 default ⇒ 400', r6.status === 400)

  const r7 = await api('POST', '/templates', {})
  check('GET 接口只收 GET（405）', r7.status === 405)
}

console.log('\n【5b】⭐⭐ 多节截断（决策 206）—— 各自独立')
{
  // ⚠️ `truncateProgress` 在 **offline-bundle** 里（`lib/index.js` 是插件主入口，不含它）。
  const { truncateProgress } = B
  // 造一份文档：两节都超标。
  // ⚠️ **每节必须有 ≥3 个 `###` 小节** —— 截断有"**至少保留一个小节**"的规则
  //    （否则等于把这一节清空）。第一版我只放了 2 个 ⇒ 只截走 1 个、留下的那个
  //    正是我拿来断言"已被截走"的那段 ⇒ **假失败**。
  const big = (tag) => `### 第3批\n\n${tag.repeat(300)}\n\n### 第2批\n\n${tag.repeat(300)}\n\n### 第1批\n\n${tag.repeat(300)}\n`
  const doc = [
    '# HANDOFF — x', '',
    '## 甲节', '', big('甲'), '',
    '## 乙节', '', big('乙'), '',
    '## 丙节', '', '短的。', '',
  ].join('\n')

  // ① 只截「甲节」⇒ 只有甲被截
  const one = truncateProgress(doc, 100, 50, [], ['甲节'])
  check('单节：截到 1 个归档块', one.chunks.length > 0 && one.warning === '', `chunks=${one.chunks.length} warn=${one.warning}`)
  check('单节：甲节被截（最早的「第1批」已移走）', !one.narrative.includes('### 第1批\n\n' + '甲'.repeat(300)))
  check('单节：乙节**没被动**（乙的最早那批还在）', one.narrative.includes('### 第1批\n\n' + '乙'.repeat(300)))

  // ② 两节都列为可截 ⇒ **两块**都被截（各自独立）
  const two = truncateProgress(doc, 100, 50, [], ['甲节', '乙节'])
  check('多节：两节各自产出归档块（chunks ≥ 2）', two.chunks.length >= 2, `chunks=${two.chunks.length}`)
  check('多节：甲节被截', !two.narrative.includes('### 第1批\n\n' + '甲'.repeat(300)))
  check('多节：乙节也被截', !two.narrative.includes('### 第1批\n\n' + '乙'.repeat(300)))
  check('多节：丙节（未列）**原样保留**', two.narrative.includes('丙节') && two.narrative.includes('短的。'))

  // ③ 兼容：老的单值字符串形态仍然可用
  const legacy = truncateProgress(doc, 100, 50, [], '甲节')
  check('兼容：单值字符串参数仍可用', legacy.chunks.length > 0)

  // ④ 空数组 = 不截（明确报，不是错误）
  const none = truncateProgress(doc, 100, 50, [], [])
  check('空数组 ⇒ 不截 + 明确说明', none.chunks.length === 0 && none.warning.includes('没有声明'))
}

console.log('\n【5】⭐⭐ 模板不回溯已有文档（用户裁定核心）')
{
  await saveTpl({
    version: 1, id: 'nb-tpl', title: 'NB',
    sections: [{ name: '目标', desc: 'g' }, { name: '进展', desc: 'p', truncate: true }],
  })
  // 用模板建项目
  const r1 = await runHandoff(
    { project: 'nb-proj', projectDesc: 'nb；当 x 时读它。', doc: '## 目标\n\nA\n## 进展\n\nB\n', template: 'nb-tpl', confirmCreate: true },
    { sessionId: 's-nb', config: CFG, turn: 1 },
  )
  check('用模板建项目成功', r1.ok, r1.message.slice(0, 160))
  const d1 = await loadProjectDoc('nb-proj')
  // ⭐ 2026-10-05：封面的 `sections` 字段已删除 ⇒ 观察点换成**正文**（它本来就是权威）。
  check('文档的节名正确', mod.sectionsFromNarrative(d1?.narrative ?? '').join(',') === '目标,进展')
  check('文档记了截断节（数组，决策 206）', (d1?.frontmatter.truncateSections ?? []).join(',') === '进展')
  check('文档记了模板 id', d1?.frontmatter.template === 'nb-tpl')

  // ⭐ 再传另一个模板更新它 —— 应被**忽略**
  await appendDocRead('s-nb', { project: 'nb-proj', turn: 2, readAt: new Date().toISOString(), full: true, sections: [] })
  const r2 = await runHandoff(
    { project: 'nb-proj', doc: '## 进展\n\nB2\n', template: 'default' },
    { sessionId: 's-nb', config: CFG, turn: 2 },
  )
  check('已存在项目传别的模板 ⇒ 成功但忽略', r2.ok, r2.message.slice(0, 160))
  const d2 = await loadProjectDoc('nb-proj')
  check('⭐ 节名没被换成默认六节', mod.sectionsFromNarrative(d2?.narrative ?? '').join(',') === '目标,进展')
  check('  文档里没有「当前进度」', !readFileSync(join(lib, 'projects', 'HANDOFF-nb-proj.md'), 'utf8').includes('## 当前进度'))

  // ⭐ 删掉模板 —— 已有文档**不受影响**
  await delTpl('nb-tpl')
  const d3 = await loadProjectDoc('nb-proj')
  check('⭐ 模板被删后，文档的节名不受影响', mod.sectionsFromNarrative(d3?.narrative ?? '').join(',') === '目标,进展')
  check('  截断节也还在', (d3?.frontmatter.truncateSections ?? []).join(',') === '进展')
  // 而且还能正常 handoff
  await appendDocRead('s-nb', { project: 'nb-proj', turn: 3, readAt: new Date().toISOString(), full: true, sections: [] })
  const r3 = await runHandoff(
    { project: 'nb-proj', doc: '## 进展\n\nB3\n' },
    { sessionId: 's-nb', config: CFG, turn: 3 },
  )
  check('  模板删除后仍能正常 handoff', r3.ok, r3.message.slice(0, 160))
}

console.log('\n【6】老文档回落默认六节（零行为变化）')
{
  // 造一份"没有 sections"的文档（模拟迁移前的存量）
  const docPath = join(lib, 'projects', 'HANDOFF-legacy-proj.md')
  writeFileSync(docPath, [
    '---',
    'project: legacy-proj',
    'desc: legacy；当 x 时读它。',
    'themes: []',
    '---',
    '',
    '# HANDOFF — legacy-proj',
    '',
    '## 目标',
    '',
    '旧内容。',
    '',
    '## 当前进度',
    '',
    '旧进度。',
    '',
    '## 沉淀知识',
    '',
  ].join('\n'), 'utf8')
  const d = await loadProjectDoc('legacy-proj')
  check('老文档读出来 sections 为空', (d?.frontmatter.sections ?? []).length === 0)
  await appendDocRead('s-leg', { project: 'legacy-proj', turn: 1, readAt: new Date().toISOString(), full: true, sections: [] })
  const r = await runHandoff(
    { project: 'legacy-proj', doc: '## 当前进度\n\n新进度\n' },
    { sessionId: 's-leg', config: CFG, turn: 1 },
  )
  check('老文档仍按默认六节合并', r.ok, r.message.slice(0, 160))
  const after = readFileSync(docPath, 'utf8')
  check('  含新的「当前进度」', after.includes('新进度'))
  check('⭐ 没被写进 sections 行（零 diff）', !/^sections:/m.test(after))
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 模板测试：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
