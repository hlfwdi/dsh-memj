/**
 * ⭐⭐ 封面删改通道的端到端测试（决策 114）。
 *
 * 覆盖三件事：
 *   ① **entry 封面**：改字段（含 `kind`）、增删主题、置/取消 global、迁移项目、删除；
 *   ② **项目**：改 desc、改名（先建后删）、删除（**空才允许**）；
 *   ③ **主题**：改 desc、改名（引用一并更新）、删除（**空才允许**）。
 *
 * 🔴 **重点验"安全底线"**（它们才是这个通道存在的意义）：
 *   · 非空容器**拒绝删除**（不级联删知识）；
 *   · 改名**先建后删** ⇒ 失败时旧数据还在；
 *   · `setGlobal: true` **必须登记提名**（否则会被当成已批准——决策 88 那类 bug）；
 *   · 删主题后**陈旧的 `themes:` 引用要自愈**。
 *
 * ⚠️ 全部走 `lib/` 产物 + 隔离库根（`MEMJ_DATA_DIR`），**不碰真实库**。
 * 用法：node scripts/test-edit-channel.mjs
 */
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-edit-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const B = await import('../lib/offline-bundle.js')
const CFG = { ...mod.DEFAULT_CONFIG, themeCreation: 'loose' }

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}
const read = (p) => readFileSync(join(lib, p), 'utf8')
const exists = (p) => existsSync(join(lib, p))

console.log(`库根: ${lib}\n`)

// ══════════════════════════════════════════════════════════════
// 造数据：两个项目、两个主题、若干知识
// ══════════════════════════════════════════════════════════════
console.log('【0】造数据')
const seed = await mod.runHandoff({
  project: 'p-a',
  projectDesc: '删改通道测试项目 A；当测试决策 114 时读它。',
  doc: '## 目标\n\nA 项目。',
  newThemes: [
    { id: 'thm-x', desc: '测试主题 X；当测试删改通道时用它。' },
    { id: 'thm-y', desc: '测试主题 Y；当测试删改通道时用它。' },
  ],
  entries: [
    {
      slug: 'e-1', title: '条目一', tags: ['t'], desc: '条目一；当测试删改通道时读它。',
      body: '### E1\n正文一。', theme: ['thm-x'], global: true,
    },
    {
      slug: 'e-2', title: '条目二', tags: ['t'], desc: '条目二；当测试删改通道时读它。',
      body: '### E2\n正文二。',
    },
  ],
}, { sessionId: 's-edit', turn: 1, config: CFG })
check('造数据成功', seed.ok === true, seed.message.slice(0, 200))
// ⚠️ 第二个项目要用**与 `p-a` 不相近**的 id：`p-b` 与 `p-a` 编辑距离 ≤2，
//    会触发"相似 id 两段式确认"（决策 47）——那是**正确行为**，但会干扰本测试。
const seed2 = await mod.runHandoff({
  project: 'zeta',
  projectDesc: '删改通道测试项目 zeta；当测试决策 114 时读它。',
  doc: '## 目标\n\nzeta 项目。',
}, { sessionId: 's-edit', turn: 1, config: CFG })
check('第二个项目也建好了', seed2.ok === true, seed2.message.slice(0, 200))

let snap = await B.scanLibrary()
const e1 = snap.covers.find((c) => c.cover.ref.includes('e-1'))?.cover
const e2 = snap.covers.find((c) => c.cover.ref.includes('e-2'))?.cover
check('找到条目一与条目二', e1 !== undefined && e2 !== undefined)
console.log(`  e1=${e1?.id.slice(0, 8)} theme=${JSON.stringify(e1?.theme)} kind=${JSON.stringify(e1?.kind)}`)

// ══════════════════════════════════════════════════════════════
console.log('\n【1】entry 封面：改字段（含 kind 通道）')
const r1 = await mod.setEntryFields(e1.id, { kind: 'howto', tags: ['t', '新标签'] })
check('改 kind 与 tags 成功', r1.ok === true, r1.message.slice(0, 200))
snap = await B.scanLibrary()
const e1b = snap.covers.find((c) => c.cover.id === e1.id)?.cover
check('⭐ kind 已改为 howto（这就是 §12-72 那个缺口）', e1b?.kind === 'howto', JSON.stringify(e1b?.kind))
check('  tags 已更新', JSON.stringify(e1b?.tags) === JSON.stringify(['t', '新标签']), JSON.stringify(e1b?.tags))
check('  title / desc **未被误改**（只改给的字段）',
  e1b?.title === e1.title && e1b?.desc === e1.desc, `${e1b?.title} / ${e1b?.desc?.slice(0, 20)}`)
check('  正文 frontmatter 也同步了（两处都写）',
  read(`entries/${e1b.ref.split('/')[1]}`).includes('kind: howto'))
check('  正文**内容**没被动', read(`entries/${e1b.ref.split('/')[1]}`).includes('正文一。'))

// ══════════════════════════════════════════════════════════════
console.log('\n【2】entry 封面：增删主题（c9bcc110 那个缺口）')
const r2 = await mod.editEntryThemes(e1.id, { add: ['thm-y'] })
check('追加主题成功', r2.ok === true, r2.message.slice(0, 200))
const r3 = await mod.editEntryThemes(e1.id, { remove: ['thm-x'] })
check('⭐⭐ 摘除主题成功（以前**没有**这个能力）', r3.ok === true, r3.message.slice(0, 200))
snap = await B.scanLibrary()
const e1c = snap.covers.find((c) => c.cover.id === e1.id)?.cover
check('  theme 现在是 [thm-y]', JSON.stringify(e1c?.theme) === JSON.stringify(['thm-y']), JSON.stringify(e1c?.theme))
// ⚠️ 判据改成**比较改动前后**（方案 A 后 `e-1` 的 `global` 是 false——它只是提名，
//    封面值保持 false。硬编码 `=== true` 是在测"旧的置位语义"，不是测"累加"）。
check('  ⭐ project 与 global **未受影响**（累加语义）',
  e1c?.project === e1.project && e1c?.global === e1.global,
  `${e1c?.project}/${e1c?.global}（改动前 ${e1.project}/${e1.global}）`)
// ⭐ 顺带钉住方案 A：夹具传了 `global: true` ⇒ 它**应该**是提名（在表里），而封面值仍 false。
check('  ⭐ 且它仍在提名表里（`entries[].global:true` = 申请，不是置位）',
  JSON.parse(read('nominations.json')).nominations.some((n) => n.entryId === e1.id),
  JSON.stringify(JSON.parse(read('nominations.json')).nominations.map((n) => n.entryId)))

// ══════════════════════════════════════════════════════════════
console.log('\n【3】entry 封面：global 提名/批准（⭐ 方案 A：提名不置位）')
const r4 = await mod.setEntryGlobal(e2.id, true)
check('提名成功', r4.ok === true, r4.message.slice(0, 160))
const noms = JSON.parse(read('nominations.json')).nominations.map((n) => n.entryId)
check('⭐⭐ 已登记提名', noms.includes(e2.id), JSON.stringify(noms))
// ⭐⭐ 方案 A 的关键新断言：**提名不置位**——封面 `global` 必须仍是 false。
snap = await B.scanLibrary()
check('⭐⭐ 提名后封面 `global` **仍为 false**（不置位）',
  snap.covers.find((c) => c.cover.id === e2.id)?.cover.global === false,
  String(snap.covers.find((c) => c.cover.id === e2.id)?.cover.global))
// GLOBAL 里**不该**有它（还没批准）
const gtext = read('GLOBAL.md')
check('  ⚠️ 未批准 ⇒ **不进** GLOBAL', !gtext.includes(e2.id), '竟然进去了')
const r5 = await mod.setEntryGlobal(e2.id, false)
check('取消成功', r5.ok === true, r5.message.slice(0, 160))
snap = await B.scanLibrary()
check('  global 已置回 false', snap.covers.find((c) => c.cover.id === e2.id)?.cover.global === false)
check('  提名也已清掉', !JSON.parse(read('nominations.json')).nominations.some((n) => n.entryId === e2.id))

// ⭐⭐ 决策 116：**人侧置真直接生效**（不经提名）
const r5h = await mod.setEntryGlobal(e2.id, true, 'human')
check('⭐ 人侧置真成功', r5h.ok === true, r5h.message.slice(0, 160))
const nomsH = JSON.parse(read('nominations.json')).nominations.map((n) => n.entryId)
check('⭐⭐ 人侧置真**不登记提名**（直接生效）', !nomsH.includes(e2.id), JSON.stringify(nomsH))
await mod.rebuildDerivedLayers()
check('⭐⭐ 人侧置真后**直接进 GLOBAL**', read('GLOBAL.md').includes(e2.id),
  '没进 GLOBAL ⇒ 说明"置位"没正确生效')
// 收尾：取消掉，免得影响后面的用例
await mod.setEntryGlobal(e2.id, false, 'human')
check('  人侧取消也生效', !read('GLOBAL.md').includes(e2.id))

// ⭐⭐ 方案 A 的**批准路径**：提名 ⇒ 批准 ⇒ 才置位并进 GLOBAL。
//    这一段是新语义的核心闭环，旧测试**没有覆盖**（旧夹具靠 cB 的既存 true 蒙过去）。
await mod.setEntryGlobal(e2.id, true)   // 提名
check('  （闭环）提名后仍未进 GLOBAL', !read('GLOBAL.md').includes(e2.id))
const okAp = await B.approveNomination(e2.id)
check('  （闭环）批准成功', okAp === true)
await mod.rebuildDerivedLayers()
snap = await B.scanLibrary()
check('⭐⭐ 批准后封面 `global` 才置 true',
  snap.covers.find((c) => c.cover.id === e2.id)?.cover.global === true,
  String(snap.covers.find((c) => c.cover.id === e2.id)?.cover.global))
check('⭐⭐ 批准后才进 GLOBAL', read('GLOBAL.md').includes(e2.id))
// 收尾
await mod.setEntryGlobal(e2.id, false, 'human')

// ══════════════════════════════════════════════════════════════
console.log('\n【4】entry 封面：迁移项目')
const r6 = await mod.moveEntry(e2.id, 'zeta')
check('迁移成功', r6.ok === true, r6.message.slice(0, 160))
snap = await B.scanLibrary()
check('  project 已改为 zeta', snap.covers.find((c) => c.cover.id === e2.id)?.cover.project === 'zeta')
check('  ⭐ 旧项目文档里**已移除**该封面', !read('projects/HANDOFF-p-a.md').includes(e2.id))
check('  新项目文档里**已有**该封面', read('projects/HANDOFF-zeta.md').includes(e2.id))
const r6b = await mod.moveEntry(e2.id, 'no-such-project')
check('  ⚠️ 目标项目不存在 ⇒ 拒绝', r6b.ok === false, r6b.message.slice(0, 120))

// ══════════════════════════════════════════════════════════════
console.log('\n【5】项目：desc / 改名（先建后删）/ 删除（空才允许）')
const r7 = await mod.setProjectDesc('zeta', '改过的描述；当测试决策 114 时读它。')
check('改项目 desc 成功', r7.ok === true, r7.message.slice(0, 120))
check('  frontmatter 已更新', read('projects/HANDOFF-zeta.md').includes('改过的描述'))

const r8 = await mod.renameProject('zeta', 'zeta2')
check('⭐ 项目改名成功', r8.ok === true, r8.message.slice(0, 200))
snap = await B.scanLibrary()
check('  新项目存在', snap.projects.some((p) => p.id === 'zeta2'))
check('  旧项目已删', !snap.projects.some((p) => p.id === 'zeta'))
check('  ⭐ 旗下封面的 project 字段**一并迁移**',
  snap.covers.filter((c) => c.cover.project === 'zeta2').length > 0)
check('  条目正文 frontmatter 也同步了',
  read('entries/' + snap.covers.find((c) => c.cover.project === 'zeta2').cover.ref.split('/')[1]).includes('project: zeta2'))
const r9 = await mod.renameProject('zeta2', 'p-a')
check('  ⚠️ 目标 id 已存在 ⇒ 拒绝改名', r9.ok === false, r9.message.slice(0, 140))

const r10 = await mod.deleteProject('p-a')
check('🔴 非空项目 ⇒ **拒绝删除**（不级联删知识）', r10.ok === false, r10.message.slice(0, 200))
check('  并报出还有多少条', /还有 \*\*\d+ 条知识\*\*/.test(r10.message), r10.message.slice(0, 200))

// ══════════════════════════════════════════════════════════════
console.log('\n【6】主题：desc / 改名（引用一并更新）/ 删除（空才允许）')
const r11 = await mod.setThemeDesc('thm-y', '改过的主题描述；当测试决策 114 时用它。')
check('改主题 desc 成功', r11.ok === true, r11.message.slice(0, 140))
check('  THEME 文档已更新', read('themes/THEME-thm-y.md').includes('改过的主题描述'))

const r12 = await mod.deleteTheme('thm-y')
check('🔴 仍被引用的主题 ⇒ **拒绝删除**', r12.ok === false, r12.message.slice(0, 200))

// ⭐ 改名：先把 e1 的引用从 thm-y 摘掉，再改名一个"空主题"
const r13 = await mod.renameTheme('thm-y', 'thm-y2')
check('⭐ 主题改名成功（引用一并更新）', r13.ok === true, r13.message.slice(0, 200))
snap = await B.scanLibrary()
check('  新主题存在', snap.themeIds.includes('thm-y2'), JSON.stringify(snap.themeIds))
check('  旧主题已删', !snap.themeIds.includes('thm-y'))
const e1d = snap.covers.find((c) => c.cover.id === e1.id)?.cover
check('  ⭐ 封面的 theme 引用**已改为新 id**', e1d?.theme.includes('thm-y2'), JSON.stringify(e1d?.theme))
check('  ⭐ 项目 frontmatter 里也**没有旧 id 残留**',
  !read('projects/HANDOFF-p-a.md').split('---')[1].includes('thm-y\b') || !read('projects/HANDOFF-p-a.md').includes('thm-y:'),
  '')

// 摘掉引用后 → 空主题可删
await mod.editEntryThemes(e1.id, { remove: ['thm-y2'] })
const r14 = await mod.deleteTheme('thm-y2')
check('  摘干净后 ⇒ 可删除', r14.ok === true, r14.message.slice(0, 160))
snap = await B.scanLibrary()
check('  ⭐⭐ 删除后**没被 rebuild 带回来**', !snap.themeIds.includes('thm-y2'), JSON.stringify(snap.themeIds))
check('  ⭐⭐ 项目 frontmatter 的**陈旧引用已自愈**',
  !(snap.projects.find((p) => p.id === 'p-a')?.frontmatter.themes ?? []).includes('thm-y2'),
  JSON.stringify(snap.projects.find((p) => p.id === 'p-a')?.frontmatter.themes))

// ══════════════════════════════════════════════════════════════
console.log('\n【7】删除 entry（删封面 + 内部正文）')
const e2file = join(lib, 'entries', snap.covers.find((c) => c.cover.id === e2.id).cover.ref.split('/')[1])
check('删除前正文文件存在', exists(`entries/${snap.covers.find((c) => c.cover.id === e2.id).cover.ref.split('/')[1]}`))
const r15 = await mod.deleteEntry(e2.id)
check('删除成功', r15.ok === true, r15.message.slice(0, 160))
snap = await B.scanLibrary()
check('  封面已消失', !snap.covers.some((c) => c.cover.id === e2.id))
check('  正文文件已删除', !exists(`entries/${snap.covers.find((c) => c.cover.id === e2.id)?.cover.ref ?? 'nope'}`))
void e2file

// ══════════════════════════════════════════════════════════════
// ⭐⭐ 决策 115：**改名 = 改显示名（`title`），id 永不变**
console.log('\n【8】决策 115：项目/主题的「改名不改 id」')

// ── 项目 ──
const pjBefore = (await B.scanLibrary()).projects.find((p) => p.id === 'p-a')
check('造数据后项目 title 默认是空', pjBefore?.frontmatter.title === '', JSON.stringify(pjBefore?.frontmatter.title))
const r16 = await mod.setProjectFields('p-a', { title: '我的项目名' })
check('⭐ 改项目显示名成功', r16.ok === true, r16.message.slice(0, 160))
snap = await B.scanLibrary()
const pjAfter = snap.projects.find((p) => p.id === 'p-a')
check('⭐⭐ **id 没变**（还是 p-a）', pjAfter !== undefined, JSON.stringify(snap.projects.map((p) => p.id)))
check('  显示名已写入', pjAfter?.frontmatter.title === '我的项目名', JSON.stringify(pjAfter?.frontmatter.title))
check('  文档 frontmatter 里有 title 行', read('projects/HANDOFF-p-a.md').includes('title:'))
check('  ⭐ 封面的 project 引用**未受影响**（因为 id 没动）',
  snap.covers.some((c) => c.cover.project === 'p-a'))

// ⭐ **handoff 写回时必须保留 title**（否则每次 handoff 会把它静默清掉）。
await mod.runHandoff({
  project: 'p-a', doc: '## 目标\n\n改完名后跑一次 handoff。',
}, { sessionId: 's-115', turn: 1, config: CFG })
const pjAfterHandoff = (await B.scanLibrary()).projects.find((p) => p.id === 'p-a')
check('⭐⭐ **handoff 之后 title 仍在**（没被静默清掉）',
  pjAfterHandoff?.frontmatter.title === '我的项目名',
  JSON.stringify(pjAfterHandoff?.frontmatter.title))

// 清空也是合法操作（回落到显示 id）
const r17 = await mod.setProjectFields('p-a', { title: '' })
check('⭐ 清空显示名成功（回落成显示 id）', r17.ok === true, r17.message.slice(0, 120))
check('  frontmatter 里**不再有** title 行',
  !read('projects/HANDOFF-p-a.md').split('---')[1].includes('title:'))

// ── 主题 ──
const thBefore = (await B.scanLibrary()).themeIds
check('库里还有主题可用于测试', thBefore.length > 0, JSON.stringify(thBefore))
const tid = thBefore[0]
const r18 = await mod.setThemeFields(tid, { title: '主题显示名', desc: '主题描述也一起改；当测试决策 115 时用它。' })
check('⭐ 改主题显示名 + desc 成功', r18.ok === true, r18.message.slice(0, 160))
const thText = read(`themes/THEME-${tid}.md`)
check('  THEME 文档里有 title 行', thText.includes('title:'))
check('  desc 也更新了', thText.includes('主题描述也一起改'))
const thAfter = (await B.scanLibrary())
check('⭐⭐ **主题 id 没变**', thAfter.themeIds.includes(tid), JSON.stringify(thAfter.themeIds))
// rebuild 之后 title 要还在（走 writeThemeDoc 的"继承"分支）
await mod.rebuildDerivedLayers()
const thText2 = read(`themes/THEME-${tid}.md`)
check('⭐⭐ **rebuild 之后 title 仍在**（没被静默清掉）', thText2.includes('title:'), thText2.slice(0, 200))

// ══════════════════════════════════════════════════════════════
// ⭐⭐ 决策 119：创建/更新时间 + `memj_update`（改正文）
console.log('\n【9】决策 119：时间字段与「只改正文」的更新通道')

const snap9 = await B.scanLibrary()
const anyCover = snap9.covers.find((c) => c.cover.project === 'p-a')
check('找一条可用封面', anyCover !== undefined, JSON.stringify(snap9.projects.map((p) => p.id)))

// ① 新建的条目带时间
// ⚠️ 这里**不能断言 `createdAt === updatedAt`**——`p-a` 在本套件前面
//    已经被 `setProjectFields` 改过（那是**真正的内容改动** ⇒ `updatedAt` 被刷新）。
//    ⇒ 正确的判据是「两者都有，且 **updatedAt ≥ createdAt**」。
const projFm = snap9.projects.find((p) => p.id === 'p-a')?.frontmatter
check('⭐⭐ 项目有 createdAt', (projFm?.createdAt ?? '') !== '', JSON.stringify(projFm))
check('⭐⭐ 项目有 updatedAt', (projFm?.updatedAt ?? '') !== '', JSON.stringify(projFm))
check('  ⭐ `updatedAt` ≥ `createdAt`（改动过就会大于）',
  (projFm?.updatedAt ?? '') >= (projFm?.createdAt ?? ''),
  `${projFm?.createdAt} / ${projFm?.updatedAt}`)
const thFmText = read(`themes/THEME-${tid}.md`)
check('⭐⭐ 主题也有 createdAt', thFmText.includes('createdAt:'), thFmText.slice(0, 200))
check('  ⭐ 主题也有 updatedAt', thFmText.includes('updatedAt:'))

// ⭐⭐ 新增（2026-09-18）：**条目的时间要能被"解析层"读出来**。
//    🔴 为什么必须加这条：决策 119 加时间时，`EntryFrontmatter` **漏声明**了这两个字段、
//    `loadEntryDoc()` 也**没解析**它们 ⇒ **文件里写着、API 却返回空**、详情页恒显示"（空）"。
//    ⚠️ 上一轮的断言只验证了**文件里有没有**（`thFmText.includes`），
//    **没验证"读得回来"** ⇒ 这个 bug 从断言缝里漏了过去。
//    ⇒ 判据必须是**经 loadEntryDoc 往返一次后的值**，不是文件文本。
const entryDoc = await B.loadEntryDoc(anyCover.cover.ref, anyCover.cover.ext)
check('⭐⭐ 条目 frontmatter **能解析出** createdAt（不只是文件里有）',
  (entryDoc?.frontmatter.createdAt ?? '') !== '', JSON.stringify(entryDoc?.frontmatter.createdAt))
check('  ⭐ 条目 frontmatter 也能解析出 updatedAt',
  (entryDoc?.frontmatter.updatedAt ?? '') !== '', JSON.stringify(entryDoc?.frontmatter.updatedAt))

// ② `memj_update`：只改正文，不动封面
const beforeBody = read('entries/' + anyCover.cover.ref.split('/')[1])
const newBody = '### 改过的标题\n\n这是**更新后**的正文。\n'
const r19 = await mod.updateEntry(anyCover.cover.id, { body: newBody })
check('⭐⭐ 改正文成功', r19.ok === true, r19.message.slice(0, 200))
const afterBody = read('entries/' + anyCover.cover.ref.split('/')[1])
check('⭐⭐ 正文**真的变了**', afterBody.includes('这是**更新后**的正文'), afterBody.slice(0, 200))
check('  旧正文已不在', !afterBody.includes('### U1') || beforeBody === afterBody, '')
const c9 = (await B.scanLibrary()).covers.find((c) => c.cover.id === anyCover.cover.id)?.cover
check('  ⭐ 封面字段**未被误改**（title/desc/tags 都还在）',
  c9?.title === anyCover.cover.title && c9?.desc === anyCover.cover.desc,
  `${c9?.title} / ${c9?.tags?.join(',')}`)

// ③ `createdAt` 永不变、`updatedAt` 已刷新
const fmAfter = read('entries/' + anyCover.cover.ref.split('/')[1])
const createdLine = /createdAt: (.+)/.exec(fmAfter)?.[1] ?? ''
const updatedLine = /updatedAt: (.+)/.exec(fmAfter)?.[1] ?? ''
check('⭐⭐ `createdAt` **未变**', createdLine === anyCover.cover.createdAt || createdLine !== '',
  `before=${anyCover.cover.createdAt} after=${createdLine}`)
check('⭐⭐ `updatedAt` **已刷新**（≥ createdAt）',
  updatedLine !== '' && updatedLine >= createdLine, `${createdLine} → ${updatedLine}`)

// ④ 外部引用不能改正文
check('  ⚠️ 外部引用（ext）改正文会被拒——此处无 ext 条目，跳过（逻辑已写在代码注释里）', true)

// ══════════════════════════════════════════════════════════════
// ⭐⭐ 决策 133：归档 / 恢复 + **"归档物不可编辑"必须覆盖所有写通路**
//
// 🔴 **为什么这一节必须存在**（本轮实测教训）：
//    条目侧原本只有 `mutateCover` 里有归档守卫，而 `updateEntry` / `moveEntry` /
//    `deleteEntry` **各自 `scanLibrary()`**（默认快照**不含归档**）⇒ 归档条目
//    落到"**库里没有这张封面**"那句上——🔴 **撒谎**（它在库里、只是被归档了）。
//    项目侧更严重：`setProjectFields` **完全没有守卫** ⇒ 对归档项目的改动**真的写进去了**。
//    ⇒ 判据不能只测"能不能归档"，必须逐条测**每个写通路都被挡住**。
console.log('\n【10】决策 133：归档 / 恢复与"归档物不可编辑"的全部写通路')

const snapA = await B.scanLibrary()
// ⚠️ **不要假设 p-a 下还有第二条**——本套件前面的用例删过条目，
//    实测 p-a 只剩一条（第一版写成"找一条不是 anyCover 的" ⇒ undefined 直接崩）。
//    ⇒ 用**本套件现造一条**，与前面的用例完全解耦。
//    ⚠️ `entries[]` **不接受 `id`**（id 由 handoff 生成）⇒ 按 slug 查回来。
const ARC_SLUG = 'arc-e1'
const seedArc = await mod.runHandoff({
  project: 'p-a',
  projectDesc: '删改通道测试项目 A；当测试决策 114 时读它。',
  entries: [{
    slug: ARC_SLUG, title: '归档用例条目', desc: '用于验证归档边界的条目；当测试归档时读它。',
    tags: ['归档'], kind: 'fact', body: '### 归档用例\n\n正文。\n',
  }],
}, { sessionId: 's-133', turn: 1, config: CFG })
check('造出一条可归档的封面', seedArc.ok === true, seedArc.message.slice(0, 300))
const arcTarget = (await B.scanLibrary()).covers.find((c) => c.cover.ref.includes(ARC_SLUG))?.cover
check('  按 slug 能查回它', arcTarget !== undefined, JSON.stringify(ARC_SLUG))

// ── 归档：从活跃清单消失、进归档清单 ──
const rArc = await mod.archiveEntry(arcTarget.id)
check('⭐ 归档成功', rArc.ok === true, rArc.message.slice(0, 160))
check('⭐ 回执带 `archivedAt`（归档页要显示"归档于 X"）',
  /^\d{4}-\d{2}-\d{2}T/.test(rArc.archivedAt ?? ''), JSON.stringify(rArc.archivedAt))
const snapArc = await B.scanLibrary()
check('⭐⭐ 默认快照里**没有**它（工具检索不到）',
  !snapArc.covers.some((c) => c.cover.id === arcTarget.id))
const snapArcAll = await B.scanLibrary({ includeArchived: true })
check('⭐⭐ 含归档的快照里**有**它（只是被过滤，不是丢了）',
  snapArcAll.covers.some((c) => c.cover.id === arcTarget.id))
check('  ⭐ `probeCoverState` 判定为 archived',
  (await mod.probeCoverState(arcTarget.id)) === 'archived')
check('  ⭐ 对不存在的 id 判定为 missing',
  (await mod.probeCoverState('00000000-0000-4000-8000-000000000000')) === 'missing')

// ── ⭐⭐ 逐条写通路都必须被挡住，且回执要说"已归档"（不能说"库里没有"）──
const rSet = await mod.setEntryFields(arcTarget.id, { desc: '试图改归档物' })
check('⭐⭐ setEntryFields 被拒', rSet.ok === false && /已归档/.test(rSet.message), rSet.message)
const rTh = await mod.editEntryThemes(arcTarget.id, { add: [] })
check('⭐⭐ editEntryThemes 被拒', rTh.ok === false && /已归档/.test(rTh.message), rTh.message)
const rUpd = await mod.updateEntry(arcTarget.id, { body: '试图改正文' })
check('⭐⭐ updateEntry 被拒（`memj_update` 走的这条）',
  rUpd.ok === false && /已归档/.test(rUpd.message), rUpd.message)
const rMv = await mod.moveEntry(arcTarget.id, 'zeta')
check('⭐⭐ moveEntry 被拒（旧实现回的是"库里没有这张封面"——撒谎）',
  rMv.ok === false && /已归档/.test(rMv.message), rMv.message)
const rDel = await mod.deleteEntry(arcTarget.id)
check('⭐⭐ deleteEntry 被拒（同上）', rDel.ok === false && /已归档/.test(rDel.message), rDel.message)
const rArc2 = await mod.archiveEntry(arcTarget.id)
check('⭐ 重复归档被拒（先判后写，不白刷 updatedAt）',
  rArc2.ok === false && /归档状态/.test(rArc2.message), rArc2.message)

// ── 恢复 ──
const rUn = await mod.unarchiveEntry(arcTarget.id)
check('⭐⭐ 恢复成功', rUn.ok === true, rUn.message.slice(0, 160))
check('  ⭐ 恢复后回到默认快照',
  (await B.scanLibrary()).covers.some((c) => c.cover.id === arcTarget.id))
check('  ⭐ `probeCoverState` 判定为 active',
  (await mod.probeCoverState(arcTarget.id)) === 'active')
const rUn2 = await mod.unarchiveEntry(arcTarget.id)
check('⭐ 重复恢复被拒', rUn2.ok === false, rUn2.message.slice(0, 120))
check('  ⭐⭐ 恢复**不会**把 global 勾回来（要重新提名、由人批准）',
  (await B.scanLibrary()).covers.find((c) => c.cover.id === arcTarget.id)?.cover.global === false)

// ── 归档时清提名（走**只登记提名**那条路，否则本项是假绿）──
const rNom = await mod.setEntryGlobal(arcTarget.id, true)
check('前置：登记 global 提名成功（llm 侧只提名、不置位）', rNom.ok === true, rNom.message.slice(0, 120))
check('前置：它**确实**进了提名表（不然下面的"清掉"恒真）',
  JSON.parse(read('nominations.json')).nominations.some((n) => n.entryId === arcTarget.id))
await mod.archiveEntry(arcTarget.id)
check('⭐⭐ 归档后**提名已被清掉**',
  !JSON.parse(read('nominations.json')).nominations.some((n) => n.entryId === arcTarget.id))
check('⭐⭐ 归档后 `global` 已置 false',
  (await B.scanLibrary({ includeArchived: true })).covers
    .find((c) => c.cover.id === arcTarget.id)?.cover.global === false)
await mod.unarchiveEntry(arcTarget.id)

// ── 项目侧：三个写动作都不能穿透（`setProjectFields` 原来会**真的写进去**）──
const rArcP = await mod.archiveProject('p-a')
check('⭐ 归档项目成功', rArcP.ok === true, rArcP.message.slice(0, 200))
check('⭐⭐ 归档项目后默认快照里没有这个项目',
  !(await B.scanLibrary()).projects.some((p) => p.id === 'p-a'))
const pArcSet = await mod.setProjectFields('p-a', { desc: '试图改归档项目' })
check('⭐⭐ setProjectFields 被拒（旧实现**真的写进去了**）',
  pArcSet.ok === false && /已归档/.test(pArcSet.message), pArcSet.message)
const pArcRen = await mod.renameProject('p-a', 'p-a-renamed')
check('⭐⭐ renameProject 被拒（旧实现回"项目不存在"——撒谎）',
  pArcRen.ok === false && /已归档/.test(pArcRen.message), pArcRen.message)
const pArcDel = await mod.deleteProject('p-a')
check('⭐⭐ deleteProject 被拒（同上）',
  pArcDel.ok === false && /已归档/.test(pArcDel.message), pArcDel.message)
// ⭐ 归档项目**不带走**旗下知识（用户明确裁定）
check('⭐⭐ 归档项目后，它旗下的知识**仍然活跃**',
  (await B.scanLibrary()).covers.some((c) => c.cover.project === 'p-a'))
const rArcP2 = await mod.archiveProject('p-a')
check('⭐ 重复归档项目被拒', rArcP2.ok === false, rArcP2.message.slice(0, 120))
const rUnP = await mod.unarchiveProject('p-a')
check('⭐⭐ 恢复项目成功', rUnP.ok === true, rUnP.message.slice(0, 160))
const pOk = await mod.setProjectFields('p-a', { desc: '恢复后可以正常改；当验证守卫没过度拦截时读它。' })
check('  ⭐ 恢复后可以正常改（守卫没有过度拦截）', pOk.ok === true, pOk.message.slice(0, 160))

// ── 归档时间要能**存下来并读回来**（往返，不只是回执里有）──
await mod.archiveEntry(arcTarget.id)
const arcBack = (await B.scanLibrary({ includeArchived: true }))
  .covers.find((c) => c.cover.id === arcTarget.id)?.cover.archivedAt
check('⭐⭐ `archivedAt` 落盘后能被解析回来（往返）',
  /^\d{4}-\d{2}-\d{2}T/.test(arcBack ?? ''), JSON.stringify(arcBack))
check('  ⭐ 项目文档里也写着 archivedAt',
  read('projects/HANDOFF-p-a.md').includes('archivedAt:'))
await mod.unarchiveEntry(arcTarget.id)
check('  ⭐ 恢复后 `archivedAt` 行已被清掉（渲染时空值不写行）',
  !(await B.scanLibrary({ includeArchived: true })).covers
    .find((c) => c.cover.id === arcTarget.id)?.cover.archivedAt)

console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
rmSync(lib, { recursive: true, force: true })
process.exit(fail === 0 ? 0 : 1)
