// 端到端验证 memj_handoff 的完整业务流（真实文件系统 + 临时库根）。
// 覆盖：建项目 / 两段式确认 / 落条目 / 跨项目证据建主题 / 全局提名待批 /
//       硬校验失败不半写 / 快照消费 / 外部引用与入库 / 快照工具。
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-e2e-'))
process.env['MEMJ_DATA_DIR'] = lib

// 直接从打包产物里取（含 handoff 逻辑）。
const mod = await import('../lib/index.js')
const B = await import('../lib/offline-bundle.js')

// runHandoff 不在 offline-bundle 里（它依赖 store），从 index 取。
const { runHandoff: rawRunHandoff } = mod
const CFG = mod.DEFAULT_CONFIG

// ══════════════════════════════════════════════════════════════
// ⭐⭐ 决策 112 的测试适配（**如实说明，不是掩盖**）
//
// 新硬校验要求"**写 doc 前必须先读过该项目文档**"。真实使用中，
// 调用方（模型）会**先** `memj_read({ project })`、**再** handoff
// ——所以这里用一个包装函数**如实模拟那个"先读"的动作**，
// 让既有用例继续测它们本来要测的东西。
//
// ⚠️ **校验本身没有被绕过**：`rawRunHandoff` 原样导出，
// 【21】节用它**专门验证"没读就拒"**这条规则确实生效。
// ══════════════════════════════════════════════════════════════
async function runHandoff(req, opts) {
  const hasDoc = typeof req?.doc === 'string' && req.doc.trim() !== ''
  if (hasDoc && typeof req?.project === 'string' && req.project.trim() !== '') {
    // 只有**已存在**的项目才需要（新项目例外），但多记一条也无害。
    await B.appendDocRead(opts.sessionId, {
      project: req.project.trim(),
      turn: opts.turn ?? -1,
      readAt: new Date().toISOString(),
      full: true,
      sections: [],
    })
  }
  return rawRunHandoff(req, opts)
}

let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}
const read = (p) => readFileSync(join(lib, p), 'utf8')
const exists = (p) => existsSync(join(lib, p))

console.log(`库根: ${lib}\n`)

// ══════════════════════════════════════════════════════════════
console.log('【1】首次 handoff：新建项目 + 落 1 条知识')
const r1 = await runHandoff({
  project: 'dsh-memj',
  projectDesc: '记忆系统插件 dsh-memj 的设计与实现项目；当要改动 memj 的架构时来这个项目找知识。',
  doc: '## 目标\n\n实现 memj\n\n## 当前进度\n\nPhase A-C 完成',
  entries: [{
    slug: 'lib-is-real-source',
    title: 'lib/ 才是真源码',
    tags: ['构建', '陷阱'],
    desc: '构建或调研 DSH 插件时，关于仓库里 src/ 与 lib/ 的真实产物关系与陷阱；当要改动旧插件源码时读它。',
    body: '### lib/ 才是真源码\n\n**规则**：仓库可能删掉 src/，而 lib/ 之上还有未提交的增强。\n**Why:** 假设 src/ 是产物来源会把已上线功能改没。\n**How to apply:** 改动前先跑 git status。',
  }],
}, { sessionId: 'sess-e2e-1', config: CFG })

check('handoff 成功', r1.ok === true, r1.message.slice(0, 200))
check('回执明说「已新建项目」', r1.message.includes('已新建项目'), r1.message.slice(0, 120))
check('回执附了现有项目清单', r1.message.includes('库里现有项目'))
check('createdProject = true', r1.createdProject === true)
check('项目文档已建', exists('projects/HANDOFF-dsh-memj.md'))
check('条目正文已落盘', readdirSync(join(lib, 'entries')).length === 1)
check('handoff 含七节', ['## 目标', '## 当前进度', '## 有效做法', '## 失败/踩坑', '## 关键上下文', '## 下一步', '## 沉淀知识']
  .every((s) => read('projects/HANDOFF-dsh-memj.md').includes(s)))
check('封面写在「沉淀知识」节内', read('projects/HANDOFF-dsh-memj.md').includes('<!-- memj:entry'))
check('frontmatter 有项目 desc', read('projects/HANDOFF-dsh-memj.md').includes('desc:'))
check('叙事里没有封面之外的知识正文', !read('projects/HANDOFF-dsh-memj.md').includes('### lib/ 才是真源码'))

// ══════════════════════════════════════════════════════════════
console.log('\n【2】建项目要 projectDesc（新建时必填）')
const r2 = await runHandoff({ project: 'no-desc-proj', doc: '## 目标\n\nx' }, { sessionId: 's', config: CFG })
check('缺 projectDesc ⇒ 拒绝', r2.ok === false && r2.message.includes('projectDesc'), r2.message.slice(0, 100))

console.log('\n【3】相似 id 两段式确认')
const r3 = await runHandoff({
  project: 'dsh_memj', // 与 dsh-memj 互为近义
  projectDesc: '测试用项目；当测试时读它。',
  doc: '## 目标\n\nx',
}, { sessionId: 's', config: CFG })
check('相似 id ⇒ 拒绝并要求确认', r3.ok === false && r3.message.includes('confirmCreate'), r3.message.slice(0, 160))
check('回执列了相似项', r3.similarProjects.includes('dsh-memj'), JSON.stringify(r3.similarProjects))

const r3b = await runHandoff({
  project: 'dsh_memj',
  projectDesc: '测试用项目；当测试时读它。',
  doc: '## 目标\n\nx',
  confirmCreate: true,
}, { sessionId: 's', config: CFG })
check('带 confirmCreate ⇒ 建成', r3b.ok === true && r3b.createdProject === true, r3b.message.slice(0, 100))

// ══════════════════════════════════════════════════════════════
console.log('\n【4】硬校验失败 ⇒ 整份不写（决策 72：不半写）')
const before = readdirSync(join(lib, 'entries')).length
const r4 = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  entries: [
    { slug: '中文slug', title: '中文 slug 测试', tags: ['a'], desc: '合法描述；当 X 时读它。', body: '### T\n正文' },
    { slug: 'ok-slug', title: '', tags: [], desc: '', body: '' },
  ],
}, { sessionId: 's', config: CFG })
check('校验失败 ⇒ ok=false', r4.ok === false)
check('一次报全部问题（决策 62）', r4.issues.length >= 3, `issues=${r4.issues.length}`)
check('点明是 entries[0] 的 slug', r4.issues.some((s) => s.includes('entries[0]') && s.includes('slug')), JSON.stringify(r4.issues))
check('点明 entries[1] 的 desc/tags/body',
  r4.issues.some((s) => s.includes('entries[1]') && s.includes('desc')) &&
  r4.issues.some((s) => s.includes('entries[1]') && s.includes('tags')))
check('⭐ 没有半写：条目数不变', readdirSync(join(lib, 'entries')).length === before,
  `${before} -> ${readdirSync(join(lib, 'entries')).length}`)

// ── ⭐ title 是必填（决策 98）：缺失/过短/超长都要拒、且整份不写
console.log('\n【4a】⭐ title 必填（决策 98）')
const beforeT = readdirSync(join(lib, 'entries')).length
const r4t = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  entries: [
    { slug: 'no-title', tags: ['t'], desc: '缺标题；当 X 时读它。', body: '### T\nx' },
    { slug: 'short-title', title: 'x', tags: ['t'], desc: '标题过短；当 X 时读它。', body: '### T\nx' },
    { slug: 'long-title', title: 'x'.repeat(49), tags: ['t'], desc: '标题超长；当 X 时读它。', body: '### T\nx' },
  ],
}, { sessionId: 's', config: CFG })
check('缺 title ⇒ 拒绝', r4t.ok === false && r4t.issues.some((s) => s.includes('entries[0]') && s.includes('title')),
  JSON.stringify(r4t.issues))
check('title 过短 ⇒ 拒绝', r4t.issues.some((s) => s.includes('entries[1]') && s.includes('过短')), JSON.stringify(r4t.issues))
check('title 超长 ⇒ 拒绝', r4t.issues.some((s) => s.includes('entries[2]') && s.includes('超长')), JSON.stringify(r4t.issues))
check('⭐ title 校验失败也整份不写', readdirSync(join(lib, 'entries')).length === beforeT)

console.log('\n【5】theme 填不存在的主题 ⇒ 拒绝并指路 newThemes')
const r5 = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  entries: [{ slug: 'a-slug', title: 'A 条', tags: ['a'], desc: '描述；当 X 时读它。', body: '### A\nx', theme: ['ghost-theme'] }],
}, { sessionId: 's', config: CFG })
check('不存在主题 ⇒ 拒绝', r5.ok === false && r5.issues.some((s) => s.includes('ghost-theme')), JSON.stringify(r5.issues))
check('提示用 newThemes', r5.issues.some((s) => s.includes('newThemes')))

// ══════════════════════════════════════════════════════════════
console.log('\n【6】新建主题必须有跨项目证据（唯一的一处工具校验）')
const r6 = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  newThemes: [{ id: 'thm-no-evidence', desc: '无证据的主题；当 X 时用它。' }],
}, { sessionId: 'sess-no-read', config: CFG })
check('无跨项目快照 ⇒ 拒绝建主题', r6.ok === false && r6.message.includes('跨项目证据'), r6.message.slice(0, 160))

// 造一条别项目的读快照（模拟"读过别的项目的知识"）
const projB = await runHandoff({
  project: 'other-project',
  projectDesc: '另一个项目；当测试跨项目时读它。',
  doc: '## 目标\n\nB',
  entries: [{ slug: 'other-entry', title: '别项目条目', tags: ['x'], desc: '别项目的知识；当需要别的项目知识时读它。', body: '### Other\n内容' }],
}, { sessionId: 'sess-reader', config: CFG })
check('先建出另一个项目', projB.ok === true, projB.message.slice(0, 80))

const snapCovers = (await B.scanLibrary()).covers
const otherCover = snapCovers.find((c) => c.cover.project === 'other-project')
check('拿到别项目的封面 id', otherCover !== undefined)

// 模拟会话 sess-reader 读过别项目知识
await B.appendReadSnapshot('sess-reader', {
  entryId: otherCover.cover.id,
  title: 'Other',
  desc: otherCover.cover.desc,
  theme: [],
  project: 'other-project',
  owner: { title: 'other-project', desc: '另一个项目；当测试跨项目时读它。' },
  readAt: new Date().toISOString(),
  consumedAt: null,
})

console.log('\n【7】memj_snapshots：传 project 后真正做"别项目"过滤（新时序）')
// 再给会话加一条**本项目**自己的快照，验证它会被 cross 过滤掉。
const sameProjCover = (await B.scanLibrary()).covers.find(
  (c) => c.cover.project === 'dsh-memj' && !c.cover.global,
)
await B.appendReadSnapshot('sess-reader', {
  entryId: sameProjCover.cover.id,
  title: '自己的知识',
  desc: sameProjCover.cover.desc,
  theme: [],
  project: 'dsh-memj', // ← 与本次目标项目相同
  owner: { title: 'dsh-memj', desc: '本项目' },
  readAt: new Date().toISOString(),
  consumedAt: null,
})

const pending = await B.readUnconsumedSnapshots('sess-reader')
check('未消费快照共 2 条（1 别项目 + 1 本项目）', pending.length === 2, String(pending.length))

// 模拟 memj_snapshots({ project }) 的过滤逻辑（与工具实现同一判据）。
const cross = pending.filter((s) => s.project !== '' && s.project !== 'dsh-memj')
check('⭐ cross 过滤后只剩别项目那条', cross.length === 1 && cross[0].project === 'other-project',
  JSON.stringify(cross.map((s) => s.project)))
const allScoped = pending
check("scope='all' 时两条都在", allScoped.length === 2)

console.log('\n【8】有跨项目证据 ⇒ 建主题成功，且**列出的**快照被补挂（决策 111）')
const r8 = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  newThemes: [{ id: 'thm-shared', desc: '跨项目共用的技术知识；当要复用别项目经验时用这个主题。' }],
  // ⭐ 决策 111：必须**显式列出**要补挂的快照；省略 = 一条都不挂。
  linkedSnapshots: [otherCover.cover.id],
  entries: [{
    slug: 'shared-entry', title: '共享条目', tags: ['t'], desc: '共享知识；当需要共享时读它。',
    body: '### Shared\nx', theme: ['thm-shared'],
  }],
}, { sessionId: 'sess-reader', config: CFG })
check('有证据 ⇒ 建主题成功', r8.ok === true, r8.message.slice(0, 160))
check('回执明说「已新建主题」', r8.message.includes('已新建主题'), r8.message.slice(0, 200))
check('createdThemes 含新主题', r8.createdThemes.includes('thm-shared'))
check('THEME 文档已生成', exists('themes/THEME-thm-shared.md'))

// 被列出的那条别项目知识应被补挂同一主题
const after = await B.scanLibrary()
const otherAfter = after.covers.find((c) => c.cover.id === otherCover.cover.id)
check('⭐ 列出的别项目那条被补挂同一主题', otherAfter.cover.theme.includes('thm-shared'),
  JSON.stringify(otherAfter.cover.theme))
// ⭐ 回执回声（决策 111）
check('⭐ 回执回声实际补挂了哪几条', r8.message.includes('快照补挂') && r8.message.includes('补挂了 1 条'),
  r8.message.slice(-260))

// 快照应已被消费
const consumed = await B.readSnapshots('sess-reader')
check('⭐ 快照已标记消费', consumed.every((s) => s.consumedAt !== null), JSON.stringify(consumed.map((s) => s.consumedAt)))

// ══════════════════════════════════════════════════════════════
console.log('\n【9】加入全局 ⇒ 只登记提名，不落位（安全底线）')
const r9 = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  entries: [{
    slug: 'global-entry', title: '全局条目', tags: ['g'], desc: '全局知识；当任何项目都需要时读它。',
    body: '### G\nx', global: true,
  }],
}, { sessionId: 'sess-g', config: CFG })
check('handoff 成功', r9.ok === true, r9.message.slice(0, 120))
check('回执说明只提名、待批准', r9.message.includes('提名') && r9.message.includes('批准'), r9.message.slice(0, 300))

const noms = await B.readNominations()
check('提名已登记', noms.length === 1, JSON.stringify(noms.map((n) => n.entryId)))
// ⭐⭐ 方案 A（2026-09-18）：**提名不置位** ⇒ 不能再靠 `cover.global` 定位那条封面
//     （它批准前恒为 false）。**权威来源是提名表**——从它取 id。
const nominatedId = noms[0].entryId
const gText = read('GLOBAL.md')
const globalCover = (await B.scanLibrary()).covers.find((c) => c.cover.id === nominatedId)
check('⭐ 找到被提名的封面', globalCover !== undefined, String(nominatedId))
// ⭐ 关键新断言：提名后封面 `global` 仍是 false（旧实现会在这里是 true）。
check('⭐⭐ 提名后封面 `global` **仍为 false**（不置位）',
  globalCover?.cover.global === false, String(globalCover?.cover.global))
check('⭐ 未批准 ⇒ 不进 GLOBAL', !gText.includes(nominatedId), '竟然进去了')

const approved = await B.approveNomination(nominatedId)
check('批准成功', approved === true)
// ⭐ 关键新断言：**批准那一刻才置位**。
const afterApprove = (await B.scanLibrary()).covers.find((c) => c.cover.id === nominatedId)
check('⭐⭐ 批准后封面 `global` 才置 true', afterApprove?.cover.global === true,
  String(afterApprove?.cover.global))
await B.rebuildDerivedLayers()
check('⭐ 批准后进 GLOBAL', read('GLOBAL.md').includes(nominatedId))

// ══════════════════════════════════════════════════════════════
console.log('\n【10】外部引用 + 入库（adopt）')
// 造一个外部文件
const extFile = join(lib, '_external.md')
const { writeFileSync } = await import('node:fs')
writeFileSync(extFile, '# 外部文档\n\n这是一份外部知识。\n', 'utf8')

const r10 = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  adopt: [{
    slug: 'adopted-doc', title: '外部文档（已入库）', ref: extFile, mode: 'copy',
    tags: ['ext'], desc: '从外部拷入的知识；当需要外部文档时读它。',
  }],
}, { sessionId: 'sess-adopt', config: CFG })
check('入库成功', r10.ok === true, r10.message.slice(0, 160))
const adopted = (await B.scanLibrary()).covers.find((c) => c.cover.ref.includes('adopted-doc'))
check('入库后 ref 指向库内', adopted !== undefined && !adopted.cover.ext, JSON.stringify(adopted?.cover.ref))
check('入库后去掉 ext', adopted.cover.ext === false)
const adoptedBody = read(adopted.cover.ref)
check('正文含原文', adoptedBody.includes('这是一份外部知识'))
check('⭐ 正文顶部记了原始路径（溯源）', adoptedBody.includes(extFile), adoptedBody.slice(0, 200))

console.log('\n【11】外部引用（只引用不搬动）——走 entries[].ext 入口')
// ⭐⭐ **本用例覆盖本轮补上的能力**：以前"只引用不搬动"**没有 LLM 入口**
//    （entries 的 schema 里没有 ref/ext，只能像旧版这里那样"手工走 store 直接写"）。
//    现在走 `entries[]` 的 `ref` + `ext: true`。
const extDocPath = join(lib, '_external-ref.md')
writeFileSync(extDocPath, '# 外部文档原文\n\n这一行只存在于库外文件里。\n', 'utf8')
const extBefore = readFileSync(extDocPath, 'utf8')

const r11 = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  entries: [{
    slug: 'ext-ref-doc',
    title: '库外文档（只引用）',
    desc: '一份库外文档的引用；当要验证外部引用形态时读它。',
    tags: ['ext'],
    ref: extDocPath,
    ext: true,
    theme: ['thm-shared'],
  }],
}, { sessionId: 'sess-extref', config: CFG })
check('⭐ 外部引用登记成功（entries 带 ref+ext）', r11.ok === true, r11.message.slice(0, 200))

const extCover = (await B.scanLibrary()).covers.find((c) => c.cover.ref === extDocPath)
check('⭐ 封面已落库且 ext=true', extCover !== undefined && extCover.cover.ext === true,
  JSON.stringify(extCover?.cover))
check('⭐ ref 指向库外绝对路径（原样保留）', extCover?.cover.ref === extDocPath,
  String(extCover?.cover.ref))
check('⭐ 归属/字段照常生效', extCover?.cover.title === '库外文档（只引用）' &&
  extCover?.cover.theme.includes('thm-shared'), JSON.stringify(extCover?.cover))
check('⭐⭐ 原库外文件**一个字节都没改**（不搬动）', readFileSync(extDocPath, 'utf8') === extBefore)
// 库内**不应该**多出一个正文文件
const libFiles = readdirSync(join(lib, 'entries'))
check('⭐ 库内没生成这条的正文文件（正文在库外）', !libFiles.some((f) => f.includes('ext-ref-doc')),
  JSON.stringify(libFiles))

// ⭐⭐ **回执措辞必须按 ext 分叉**（原来一律写"正文已落库到 entries/"，对外链是假的）
//    回执是模型判断"库里刚发生了什么"的第一手材料 ⇒ 说错会让它以为库内多了正文副本。
check('⭐⭐ 外链回执不说"正文已落库"', !r11.message.includes('正文已落库'),
  r11.message.slice(0, 200))
check('⭐⭐ 外链回执明说"正文留在库外、未落库"',
  r11.message.includes('外部引用') && r11.message.includes('未落库'),
  r11.message.slice(0, 200))
check('⭐⭐ 外链回执明说"只登记封面，未改动该文件"',
  r11.message.includes('只登记封面') && r11.message.includes('未改动该文件'),
  r11.message.slice(0, 200))
check('⭐⭐ 外链回执逐条给出库外路径',
  r11.message.includes(extDocPath), r11.message.slice(0, 300))

// ── 校验：ref 与 ext 必须配套 ──
const rBadRef = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  entries: [{
    slug: 'bad-ref', title: '错填 ref', desc: '测试用；当验证校验时读它。',
    tags: ['x'], body: '### t\n\nx', ref: extDocPath,
  }],
}, { sessionId: 'sess-bad', config: CFG })
check('⭐ 给了 ref 但没 ext ⇒ 拒绝', rBadRef.ok === false &&
  rBadRef.message.includes('ext'), rBadRef.message.slice(0, 160))

const rBadExt = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  entries: [{
    slug: 'bad-ext', title: '外链缺 ref', desc: '测试用；当验证校验时读它。',
    tags: ['x'], ext: true,
  }],
}, { sessionId: 'sess-bad2', config: CFG })
check('⭐ ext:true 但没 ref ⇒ 拒绝', rBadExt.ok === false &&
  rBadExt.message.includes('ref'), rBadExt.message.slice(0, 160))

const rRelRef = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  entries: [{
    slug: 'rel-ref', title: '相对路径外链', desc: '测试用；当验证校验时读它。',
    tags: ['x'], ref: '_external-ref.md', ext: true,
  }],
}, { sessionId: 'sess-bad3', config: CFG })
check('⭐ ext:true 但 ref 不是绝对路径 ⇒ 拒绝', rRelRef.ok === false &&
  rRelRef.message.includes('绝对路径'), rRelRef.message.slice(0, 160))

// ══════════════════════════════════════════════════════════════
console.log('\n【12】重建派生层：THEME 列覆盖的项目')
const r12 = await B.rebuildDerivedLayers()
const themeText = read('themes/THEME-thm-shared.md')
check('THEME 有覆盖的项目表', themeText.includes('## 覆盖的项目'))
check('THEME 列出两个项目', themeText.includes('dsh-memj') && themeText.includes('other-project'), themeText.slice(0, 600))
check('THEME 保留 desc', themeText.includes('跨项目共用的技术知识'))
check('THEME 有知识封面节', themeText.includes('## 知识封面'))
check('重建返回主题数', r12.themes >= 1, String(r12.themes))

console.log('\n【13】项目 frontmatter 反向链接 themes:')
const projText = read('projects/HANDOFF-dsh-memj.md')
check('项目 frontmatter 含 themes:', /themes: \[/.test(projText), projText.split('\n').slice(0, 6).join(' | '))
check('项目 themes 含 thm-shared', projText.includes('thm-shared'))

console.log('\n【14】重复 handoff 是「更新」而非「新建」')
const r14 = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\n更新后的目标',
}, { sessionId: 's', config: CFG })
check('回执说「已更新项目」', r14.message.includes('已更新项目'), r14.message.slice(0, 100))
check('createdProject = false', r14.createdProject === false)
check('叙事已更新', read('projects/HANDOFF-dsh-memj.md').includes('更新后的目标'))
const keptCovers = (await B.scanLibrary()).covers.filter((c) => c.cover.project === 'dsh-memj')
check('⭐ 更新不丢旧封面', keptCovers.length >= 4, `实得 ${keptCovers.length}`)

console.log('\n【15】更新时保留原 projectDesc')
check('项目 desc 未被清空', read('projects/HANDOFF-dsh-memj.md').includes('记忆系统插件 dsh-memj 的设计'))

// ══════════════════════════════════════════════════════════════
console.log('\n【15b】kind：落盘、往返、非法值拦截')
const rKind = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  entries: [
    { slug: 'k-trap', title: '陷阱类条目', kind: 'trap', tags: ['k'], desc: '陷阱类；当 X 时读它。', body: '### T\n现象→根因→做法' },
    { slug: 'k-howto', title: '流程类条目', kind: 'howto', tags: ['k'], desc: '流程类；当 Y 时读它。', body: '### H\n1. 步骤一' },
    { slug: 'k-none', title: '未分类条目', tags: ['k'], desc: '未分类；当 Z 时读它。', body: '### N\n自由正文' },
  ],
}, { sessionId: 'sess-kind', config: CFG })
check('带 kind 的写入成功', rKind.ok === true, rKind.message.slice(0, 200))

const kindCovers = (await B.scanLibrary()).covers.filter((c) => c.cover.project === 'dsh-memj')
const trap = kindCovers.find((c) => c.cover.ref.includes('k-trap'))
const howto = kindCovers.find((c) => c.cover.ref.includes('k-howto'))
const none = kindCovers.find((c) => c.cover.ref.includes('k-none'))
check('kind: trap 落盘正确', trap?.cover.kind === 'trap', trap?.cover.kind)
check('kind: howto 落盘正确', howto?.cover.kind === 'howto', howto?.cover.kind)
check('未填 kind ⇒ 空串（合法）', none?.cover.kind === '')

const trapEntry = read(trap.cover.ref)
check('条目 frontmatter 同步了 kind', /^kind: trap$/m.test(trapEntry),
  trapEntry.split('\n').slice(0, 9).join(' | '))
check('未分类条目 frontmatter 不写 kind', !/^kind:/m.test(read(none.cover.ref)))

// 非法值必须在**写入前**被拦下（且不半写）
const beforeKind = readdirSync(join(lib, 'entries')).length
const rBad = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  entries: [{ slug: 'k-bad', title: '非法 kind 条目', kind: 'bug', tags: ['k'], desc: '非法 kind；当 X 时读它。', body: '### B\nx' }],
}, { sessionId: 's', config: CFG })
check('⭐ 非法 kind ⇒ 拒绝写入', rBad.ok === false && rBad.issues.some((s) => s.includes('kind')),
  JSON.stringify(rBad.issues))
check('⭐ 非法 kind ⇒ 没有半写', readdirSync(join(lib, 'entries')).length === beforeKind)

check('按 kind 筛选可用（分类的实际价值）',
  kindCovers.filter((c) => c.cover.kind === 'trap').length >= 1)

// ══════════════════════════════════════════════════════════════
console.log('\n【16】memj_promote 的成功路径（追加已有主题 + 提名 global）')
const beforePromote = await B.scanLibrary()
const targetCover = beforePromote.covers.find(
  (c) => c.cover.project === 'dsh-memj' && !c.cover.global && !c.cover.theme.includes('thm-shared'),
)
check('找到一条待推进的封面', targetCover !== undefined)

// 直接调纯逻辑：模拟 promote 的行为（追加主题 + 提名）。
// ⭐⭐ 方案 A（2026-09-18）：**提名不置位** ⇒ 这里**不再把 `global` 改成 true**，
//    只登记提名（与 `memj_promote` 现在的真实行为一致）。
const promoteCovers = (await B.loadProjectDoc('dsh-memj')).covers
const nextCovers = promoteCovers.map((c) =>
  c.id === targetCover.cover.id
    ? { ...c, theme: [...new Set([...c.theme, 'thm-shared'])] }
    : c,
)
await B.writeProjectDoc(
  'dsh-memj',
  // ⚠️ `title` 是决策 115 新增的必填字段，夹具要跟上。
  { project: 'dsh-memj', title: '', desc: '记忆系统插件 dsh-memj 的设计与实现项目；当要改动 memj 时来这个项目找知识。', themes: ['thm-shared'] },
  (await B.loadProjectDoc('dsh-memj')).narrative,
  nextCovers,
)
await B.syncEntryFrontmatter(nextCovers.find((c) => c.id === targetCover.cover.id))
await B.addNomination({
  entryId: targetCover.cover.id,
  title: '',
  desc: targetCover.cover.desc,
  project: 'dsh-memj',
  nominatedAt: new Date().toISOString(),
})
await B.rebuildDerivedLayers()

const afterPromote = await B.scanLibrary()
const promoted = afterPromote.covers.find((c) => c.cover.id === targetCover.cover.id)
check('⭐ 主题已追加（累加，不是覆盖）', promoted.cover.theme.includes('thm-shared'),
  JSON.stringify(promoted.cover.theme))
check('⭐ 原归属保留（project 仍在）', promoted.cover.project === 'dsh-memj', promoted.cover.project)
check('⭐ 提名后封面 `global` **仍为 false**（方案 A：不置位）', promoted.cover.global === false,
  String(promoted.cover.global))
const entryAfter = read(promoted.cover.ref)
check('⭐ 条目 frontmatter 同步（两处都写）', /theme: \[[^\]]*thm-shared/.test(entryAfter),
  entryAfter.split('\n').slice(0, 9).join(' | '))
check('提名已登记', (await B.readNominations()).some((n) => n.entryId === targetCover.cover.id))
check('⭐ 未批准 ⇒ 不进 GLOBAL', !read('GLOBAL.md').includes(targetCover.cover.id))

// ══════════════════════════════════════════════════════════════
// ⭐ 【17】严格 / 宽松 双模式（决策 95）——**正反对照**
//
// 🔴 这一节的意义：单侧断言（"strict 拒绝"）无法证明闸门真的存在，
//    单侧断言（"loose 通过"）也无法证明它不是在别的模式下也通过。
//    ⇒ **同一份输入、只换配置**，两侧都要断言。
console.log('\n【17】⭐ 双模式正反对照：同一输入、只换 themeCreation')

const LOOSE = { ...CFG, themeCreation: 'loose' }
const STRICT = { ...CFG, themeCreation: 'strict' }

// 用一个**全新会话**（无任何读快照）⇒ 严格模式下必然无跨项目证据。
const modeReq = (id) => ({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  newThemes: [{ id, desc: '双模式测试主题；当验证模式开关时用它。' }],
})

// ── 严格侧：必须拒绝 ──
const strictRes = await runHandoff(modeReq('thm-mode-strict'), {
  sessionId: 'sess-mode-fresh-a',
  config: STRICT,
})
check('⭐ 严格模式：无跨项目证据 ⇒ **拒绝**', strictRes.ok === false, strictRes.message.slice(0, 160))
check('  拒绝理由提到"跨项目证据"', strictRes.message.includes('跨项目证据'))
check('  未建出该主题', !exists('themes/THEME-thm-mode-strict.md'))
check('  createdThemes 为空', strictRes.createdThemes.length === 0, JSON.stringify(strictRes.createdThemes))

// ── 宽松侧：**同一份输入**必须通过 ──
const looseRes = await runHandoff(modeReq('thm-mode-loose'), {
  sessionId: 'sess-mode-fresh-b',
  config: LOOSE,
})
check('⭐⭐ 宽松模式：同一输入 ⇒ **通过**', looseRes.ok === true, looseRes.message.slice(0, 200))
check('  建出了主题', looseRes.createdThemes.includes('thm-mode-loose'), JSON.stringify(looseRes.createdThemes))
check('  THEME 文档已生成', exists('themes/THEME-thm-mode-loose.md'))
check('  ⭐ 回执标明"宽松模式"', looseRes.message.includes('宽松模式'), looseRes.message.slice(0, 240))

// ── 反向：严格模式下的**通过**路径（证明 strict 不是"一律拒绝"）──
// 先给一个新会话造一条别项目的读快照。
const modeSnapCover = (await B.scanLibrary()).covers.find((c) => c.cover.project === 'other-project')
await B.appendReadSnapshot('sess-mode-with-evidence', {
  entryId: modeSnapCover.cover.id,
  title: 'Other',
  desc: modeSnapCover.cover.desc,
  theme: [],
  project: 'other-project',
  owner: { title: 'other-project', desc: '另一个项目' },
  readAt: new Date().toISOString(),
  consumedAt: null,
})
const strictOk = await runHandoff(
  // ⭐ 决策 111：严格模式还要求那条证据**被 linkedSnapshots 列出**。
  { ...modeReq('thm-mode-strict-ok'), linkedSnapshots: [modeSnapCover.cover.id] },
  {
    sessionId: 'sess-mode-with-evidence',
    config: STRICT,
  },
)
check('⭐ 严格模式：**有**跨项目证据 ⇒ 通过（证明不是一律拒绝）', strictOk.ok === true, strictOk.message.slice(0, 200))
check('  回执标明"严格模式"', strictOk.message.includes('严格模式'), strictOk.message.slice(0, 240))

// ── ⭐ 宽松只拆闸门、不拆完整性：desc 与近义确认两模式都保留 ──
console.log('\n【18】⭐ 宽松模式**仍保留**的校验（"只拆闸门，不拆完整性"）')
const looseNoDesc = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  newThemes: [{ id: 'thm-loose-nodesc', desc: '' }],
}, { sessionId: 'sess-loose-x1', config: LOOSE })
check('⭐ 宽松下缺 desc ⇒ 仍拒绝', looseNoDesc.ok === false && looseNoDesc.message.includes('desc'),
  looseNoDesc.message.slice(0, 140))
check('  未建出该主题', !exists('themes/THEME-thm-loose-nodesc.md'))

const looseSimilar = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  // `thm-mode-loose` 已存在 ⇒ 这个 id 与它编辑距离 ≤2 ⇒ 必须回相似项。
  newThemes: [{ id: 'thm-mode-loose2', desc: '近义测试；当验证防重名时用它。' }],
}, { sessionId: 'sess-loose-x2', config: LOOSE })
check('⭐ 宽松下近义 id ⇒ 仍回相似项确认（防重名）', looseSimilar.ok === false,
  looseSimilar.message.slice(0, 180))
check('  similarThemes 里有那个已有主题',
  (looseSimilar.similarThemes ?? []).includes('thm-mode-loose'),
  JSON.stringify(looseSimilar.similarThemes))
check('  未硬建近义主题', !exists('themes/THEME-thm-mode-loose2.md'))

// ── ⭐ 宽松下"快照补挂"仍要跑（那一处与模式无关）──
console.log('\n【19】⭐ 宽松模式下"快照补挂"不受影响（与闸门无关）')
const looseSnapCover = (await B.scanLibrary()).covers.find((c) => c.cover.project === 'other-project')
await B.appendReadSnapshot('sess-loose-link', {
  entryId: looseSnapCover.cover.id,
  title: 'Other',
  desc: looseSnapCover.cover.desc,
  theme: [],
  project: 'other-project',
  owner: { title: 'other-project', desc: '另一个项目' },
  readAt: new Date().toISOString(),
  consumedAt: null,
})
const looseLink = await runHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\nx',
  newThemes: [{ id: 'thm-loose-link', desc: '宽松补挂测试；当验证补挂与模式无关时用它。' }],
  // ⭐ 决策 111：显式列出（放宽模式也一样，补挂与模式无关）。
  linkedSnapshots: [looseSnapCover.cover.id],
  entries: [{
    slug: 'loose-link-entry', title: '宽松补挂条目', tags: ['t'], desc: '宽松补挂条目；当验证补挂时读它。',
    body: '### L\nx', theme: ['thm-loose-link'],
  }],
}, { sessionId: 'sess-loose-link', config: LOOSE })
check('宽松下建主题成功', looseLink.ok === true, looseLink.message.slice(0, 160))
const looseLinkAfter = await B.scanLibrary()
const linked = looseLinkAfter.covers.find((c) => c.cover.id === looseSnapCover.cover.id)
check('⭐ 列出的别项目那条被补挂同一主题（与模式无关）', linked.cover.theme.includes('thm-loose-link'),
  JSON.stringify(linked.cover.theme))

// ══════════════════════════════════════════════════════════════
// ⭐⭐ 决策 111：`linkedSnapshots`（准挂表）——这是本轮的核心变更。
//    要证明三件事：① 省略 = 不挂（fail-closed）；② 列了才挂（且只挂列出的）；
//    ③ 列了无效 id ⇒ 整份拒绝（不静默）。
console.log('\n【20】决策 111：linkedSnapshots 准挂表')

// ── 准备：造两条别项目知识，都记入快照 ──
const setup = await runHandoff({
  project: 'other-snap',
  projectDesc: '快照测试用的别项目；当测试准挂表时读它。',
  doc: '## 目标\n\nx',
  entries: [
    { slug: 'snap-relevant', title: '相关的别项目知识', tags: ['t'], desc: '相关的别项目知识；当测试时读它。', body: '### A\nx' },
    { slug: 'snap-irrelevant', title: '**不相关**的别项目知识', tags: ['t'], desc: '不相关的别项目知识；当测试时读它。', body: '### B\nx' },
  ],
}, { sessionId: 'sess-111', config: CFG })
check('造两条别项目知识成功', setup.ok === true, setup.message.slice(0, 120))
const snap111 = (await B.scanLibrary()).covers.filter((c) => c.cover.project === 'other-snap')
check('找到两条别项目封面', snap111.length === 2, String(snap111.length))
const relevant = snap111.find((c) => c.cover.ref.includes('snap-relevant'))
const irrelevant = snap111.find((c) => c.cover.ref.includes('snap-irrelevant'))
for (const c of [relevant, irrelevant]) {
  await B.appendReadSnapshot('sess-111', {
    entryId: c.cover.id, title: c.cover.title, desc: c.cover.desc, theme: [],
    project: 'other-snap', owner: { title: 'other-snap', desc: '别项目' },
    readAt: new Date().toISOString(), consumedAt: null,
  })
}

// ── ① 省略 linkedSnapshots ⇒ 一条都不挂，且严格模式的闸门会拦住建主题 ──
const omitted = await runHandoff({
  project: 'proj-111',
  projectDesc: '准挂表测试项目；当测试决策 111 时读它。',
  doc: '## 目标\n\nx',
  newThemes: [{ id: 'thm-111', desc: '准挂表测试主题；当测试决策 111 时用它。' }],
  entries: [{ slug: 'e-111', title: '本次知识', tags: ['t'], desc: '本次知识；当测试时读它。', body: '### C\nx', theme: ['thm-111'] }],
}, { sessionId: 'sess-111', config: CFG })  // CFG = strict
check('🔴 省略 linkedSnapshots ⇒ 严格模式下**拒绝建主题**（fail-closed）', omitted.ok === false,
  omitted.message.slice(0, 200))
check('  错误信息**明确指出**读过却没列', omitted.message.includes('linkedSnapshots'),
  omitted.message.slice(0, 300))
// 那两条别项目知识**都没被挂**
const afterOmit = await B.scanLibrary()
check('  两条别项目知识**都未被挂**到 thm-111',
  ![relevant, irrelevant].some((c) =>
    afterOmit.covers.find((x) => x.cover.id === c.cover.id)?.cover.theme.includes('thm-111')),
  '')

// ── ② 只列出「相关」那条 ⇒ 只有它被挂，「不相关」那条不被挂 ──
const picked = await runHandoff({
  project: 'proj-111',
  projectDesc: '准挂表测试项目；当测试决策 111 时读它。',
  doc: '## 目标\n\nx',
  newThemes: [{ id: 'thm-111', desc: '准挂表测试主题；当测试决策 111 时用它。' }],
  linkedSnapshots: [relevant.cover.id],
  entries: [{ slug: 'e-111', title: '本次知识', tags: ['t'], desc: '本次知识；当测试时读它。', body: '### C\nx', theme: ['thm-111'] }],
}, { sessionId: 'sess-111', config: CFG })
check('列出一条相关快照 ⇒ 建主题成功', picked.ok === true, picked.message.slice(0, 200))
const afterPick = await B.scanLibrary()
const relNow = afterPick.covers.find((x) => x.cover.id === relevant.cover.id)
const irrNow = afterPick.covers.find((x) => x.cover.id === irrelevant.cover.id)
check('⭐⭐ 列出的那条**被挂**上', relNow.cover.theme.includes('thm-111'), JSON.stringify(relNow.cover.theme))
check('⭐⭐ 未列出的那条**不被挂**（这正是本轮修的 bug）', !irrNow.cover.theme.includes('thm-111'),
  JSON.stringify(irrNow.cover.theme))

// ── ③ 列出无效 id ⇒ 整份拒绝、说清原因 ──
const bogus = await runHandoff({
  project: 'proj-111',
  projectDesc: '准挂表测试项目；当测试决策 111 时读它。',
  doc: '## 目标\n\nx',
  newThemes: [{ id: 'thm-bogus', desc: '不该被建的主题；当测试无效 id 时用它。' }],
  linkedSnapshots: ['00000000-0000-4000-8000-000000000000'],
  entries: [{ slug: 'e-bogus', title: '不该写入', tags: ['t'], desc: '不该写入；当测试时读它。', body: '### D\nx' }],
}, { sessionId: 'sess-111', config: CFG })
check('🔴 列出不存在的快照 id ⇒ 拒绝', bogus.ok === false, bogus.message.slice(0, 200))
check('  并说明该 id 不在未消费快照里', bogus.message.includes('不在本会话未消费的读快照里'),
  bogus.message.slice(0, 300))
check('  整份未写入（主题没建）', !exists('themes/THEME-thm-bogus.md'))

// ── ④ 列出「本项目自己」的快照 id ⇒ 拒绝（它不构成跨项目证据）──
const selfCover = (await B.scanLibrary()).covers.find((c) => c.cover.project === 'proj-111')
check('找到一条本项目自己的封面', selfCover !== undefined, '')
await B.appendReadSnapshot('sess-111', {
  entryId: selfCover.cover.id, title: selfCover.cover.title, desc: selfCover.cover.desc, theme: [],
  project: 'proj-111', owner: { title: 'proj-111', desc: '本项目' },
  readAt: new Date().toISOString(), consumedAt: null,
})
const selfLinked = await runHandoff({
  project: 'proj-111',
  projectDesc: '准挂表测试项目；当测试决策 111 时读它。',
  doc: '## 目标\n\nx',
  newThemes: [{ id: 'thm-self', desc: '不该被建；当测试本项目 id 时用它。' }],
  linkedSnapshots: [selfCover.cover.id],
  entries: [{ slug: 'e-self2', title: 'x', tags: ['t'], desc: 'x；当测试时读它。', body: '### F\nx' }],
}, { sessionId: 'sess-111', config: CFG })
check('🔴 列出本项目的快照 id ⇒ 拒绝', selfLinked.ok === false, selfLinked.message.slice(0, 200))
check('  并说明它属于本项目自己', selfLinked.message.includes('本项目自己'), selfLinked.message.slice(0, 300))

// ══════════════════════════════════════════════════════════════
// ⭐⭐ 决策 112：写叙事前必须先读项目文档。
//    ⚠️ 本段**一律用 `rawRunHandoff`**（不走上面的适配包装），
//       因为要验的正是"**没读就拒**"这条规则本身。
//    四件事：① 没读 ⇒ 拒；② 读了（同轮）⇒ 放行；③ 逐节漏节 ⇒ 拒；
//            ④ **上一轮读过不算**（有效期 = 一个完整轮次）。
console.log('\n【21】决策 112：写 doc 前的"读过"硬校验（轮次粒度）')

const beforeDoc = read('projects/HANDOFF-dsh-memj.md')

// ① 没读就写 ⇒ 拒绝
const noRead = await rawRunHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\n没读就写，应被拒。',
}, { sessionId: 'sess-112-fresh', turn: 7, config: CFG })
check('🔴 没读过项目文档就写 doc ⇒ 拒绝', noRead.ok === false, noRead.message.slice(0, 200))
check('  错误信息给出正规入口 memj_read({ project })',
  noRead.message.includes('memj_read') && noRead.message.includes('project'), noRead.message.slice(0, 300))
check('  文档未被改动', read('projects/HANDOFF-dsh-memj.md') === beforeDoc)

// ② 新项目例外（没有文档可读，不能要求）
const newProj = await rawRunHandoff({
  project: 'brand-new-112',
  projectDesc: '全新项目；当测试新项目例外时读它。',
  doc: '## 目标\n\n新项目没有旧文档可读。',
}, { sessionId: 'sess-112-fresh', turn: 7, config: CFG })
check('⭐ 新项目**不受此限制**（无文档可读）', newProj.ok === true, newProj.message.slice(0, 200))

// ③ 同一轮里读过全文 ⇒ 放行
await B.appendDocRead('sess-112-read', {
  project: 'dsh-memj', turn: 3, readAt: new Date().toISOString(), full: true, sections: [],
})
const withRead = await rawRunHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\n读过全文后写的。',
}, { sessionId: 'sess-112-read', turn: 3, config: CFG })
check('⭐ **同一轮**里读过全文 ⇒ 放行', withRead.ok === true, withRead.message.slice(0, 200))
check('  内容确实写进去了', read('projects/HANDOFF-dsh-memj.md').includes('读过全文后写的'))

// ⭐⭐ ④ **上一轮读过 ⇒ 不算**（有效期 = 一个完整轮次）
const staleTurn = await rawRunHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\n上一轮读过、这一轮没读。',
}, { sessionId: 'sess-112-read', turn: 4, config: CFG })
check('⭐⭐ **上一轮读过不算**（第 3 轮读的，第 4 轮要重读）',
  staleTurn.ok === false, staleTurn.message.slice(0, 200))
check('  错误信息点明"上一轮读过也不算"',
  staleTurn.message.includes('上一轮'), staleTurn.message.slice(0, 300))

// ⑤ 逐节读、**漏节** ⇒ 拒绝
const allTitles = ['目标', '当前进度', '有效做法', '失败/踩坑', '关键上下文', '下一步']
await B.appendDocRead('sess-112-partial', {
  project: 'dsh-memj', turn: 5, readAt: new Date().toISOString(), full: false,
  sections: ['目标', '当前进度'],   // 只读了 2 节
})
const partial = await rawRunHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\n漏读了其它节。',
}, { sessionId: 'sess-112-partial', turn: 5, config: CFG })
check('🔴 只按节读且**漏节** ⇒ 拒绝', partial.ok === false, partial.message.slice(0, 200))
check('  点名还差哪些节', /还差这些节/.test(partial.message), partial.message.slice(0, 300))
check('  提示可 full: true 通读', partial.message.includes('full: true'), partial.message.slice(0, 400))

// ⑥ 逐节读**读全** ⇒ 放行
await B.appendDocRead('sess-112-allsec', {
  project: 'dsh-memj', turn: 6, readAt: new Date().toISOString(), full: false,
  sections: allTitles,
})
const allSec = await rawRunHandoff({
  project: 'dsh-memj',
  doc: '## 目标\n\n逐节读全后写的。',
}, { sessionId: 'sess-112-allsec', turn: 6, config: CFG })
check('⭐ 逐节读**读全**了 ⇒ 放行', allSec.ok === true, allSec.message.slice(0, 200))

// ⑦ 边界：只做 knowledge 步**不需要**读（用户拍板）
const knowOnly = await rawRunHandoff({
  project: 'dsh-memj',
  step: 'knowledge',
  entries: [{
    slug: 'no-read-needed', title: '只补知识不必先读文档', tags: ['t'],
    desc: '只补知识不必先读文档；当测试决策 112 边界时读它。', body: '### K\nx',
  }],
}, { sessionId: 'sess-112-knowonly', turn: 7, config: CFG })
check('⭐ 只做 knowledge 步 ⇒ **不受**此限制（边界）', knowOnly.ok === true, knowOnly.message.slice(0, 200))

// ⑧ 读记录落了盘（独立文件，不与读快照混），且带**轮次号**
const docReadFileExists = exists('doc-reads/session-sess-112-read.jsonl')
check('⭐ 读记录落在 doc-reads/（与读快照分开）', docReadFileExists)
const recText = docReadFileExists ? read('doc-reads/session-sess-112-read.jsonl') : ''
check('  记录含 project / turn / full / sections',
  recText.includes('"project"') && recText.includes('"turn"') &&
    recText.includes('"full"') && recText.includes('"sections"'),
  recText.slice(0, 240))
check('  轮次号确实是 3（不是 4）', recText.includes('"turn":3'), recText.slice(0, 240))

// ⑨ ⭐⭐ 同名小节判据：**只在同一个父节内**才报（2026-09-30 修正）
//
// 起因：本项目的「有效做法」与「失败/踩坑」**各自**都有
//   `### 一、通用方法（跨功能）` / `### 二、按功能` ⇒ 旧的"按节名全局计数"
//   会把这种**跨顶层节的合法重名**报成"同名小节"，每轮交接都刷一条假警报。
// ⚠️ 两条构造注意：
//   ① 该检查**只在按节路径（`docSection` / `docOp`）里跑** —— 整份 `doc` 路径不跑它
//      ⇒ 用例**必须走 `replace`**，否则断言恒真（第一版就是这么假绿的）；
//   ② 这是该判据**唯一的防线**（`findDuplicateSections` 只被 handoff.ts 内部调用）。
const legalOne = await runHandoff({
  project: 'dsh-memj',
  docSection: '当前进度', docOp: 'replace',
  doc: '## 当前进度\n\n新进度\n\n### 一、通用方法\n\n乙',
}, { sessionId: 'sess-dup-legal', turn: 8, config: CFG })
const legalTwo = await runHandoff({
  project: 'dsh-memj',
  docSection: '目标', docOp: 'replace',
  doc: '## 目标\n\n新目标\n\n### 一、通用方法\n\n甲',
}, { sessionId: 'sess-dup-legal', turn: 9, config: CFG })
check('⭐⭐ 跨顶层节的同名子节 ⇒ **不报**同名小节（旧判据下必报）',
  legalOne.ok === true && legalTwo.ok === true && !legalTwo.message.includes('同名小节'),
  legalTwo.message.slice(0, 240))

const dupReal = await runHandoff({
  project: 'dsh-memj',
  docSection: '目标', docOp: 'replace',
  doc: '## 目标\n\n新目标\n\n### 一、通用方法\n\n甲\n\n### 一、通用方法\n\n乙',
}, { sessionId: 'sess-dup-real', turn: 10, config: CFG })
check('🔴 同一个父节下的同名子节 ⇒ **报**同名小节',
  dupReal.ok === true && dupReal.message.includes('同名小节'),
  dupReal.message.slice(0, 240))
check('  报警里带父节名（`父节 › 子节` 形态）',
  dupReal.message.includes('目标 › 一、通用方法'), dupReal.message.slice(0, 320))

console.log(`\n═══ 端到端结果：通过 ${pass} / 失败 ${fail} ═══`)
console.log(`库根保留在: ${lib}（供人工查看；测试结束会删除）`)
rmSync(lib, { recursive: true, force: true })
process.exit(fail === 0 ? 0 : 1)
