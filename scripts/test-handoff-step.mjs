/**
 * `memj_handoff` 的 `step` 参数（决策 101 / §3.11）。
 *
 * ⚠️ **重点不在"新功能对不对"，而在两件事**：
 *   ① `all`（缺省）**必须与拆分前逐字一致**——这是硬约束（§11.36）；
 *   ② 分步之间**不能静默丢参数**（那是"半套状态"里最隐蔽的一种）。
 *
 * 用法：node scripts/test-handoff-step.mjs
 */
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-step-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const B = await import('../lib/offline-bundle.js')
const { runHandoff: rawRunHandoff, DEFAULT_CONFIG } = mod

// ⭐⭐ 决策 112 的测试适配：写 `doc` 前要先读过该项目文档。
//    ⚠️ 本套件测的是 `step` 拆分与**叙事按节合并**（决策 109），
//       与新前置条件无关 ⇒ 用一个包装函数**如实模拟"先读"这个动作**。
//    ⚠️ 校验本身在 test-handoff.mjs【21】专门验证（那里用 rawRunHandoff）。
async function runHandoff(req, opts) {
  const hasDoc = typeof req?.doc === 'string' && req.doc.trim() !== ''
  if (hasDoc && typeof req?.project === 'string' && req.project.trim() !== '') {
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

// ⭐ **本套件用 `loose` 模式**：默认是 `strict`，建主题要"跨项目证据"，
//    那会把被测的 step 逻辑和证据闸门**搅在一起**。用 loose 隔离。
//    ⚠️ strict 下的闸门另在 test-handoff.mjs【6】测，不在这里重复。
const CFG = { ...DEFAULT_CONFIG, themeCreation: 'loose' }

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}
const read = (p) => readFileSync(join(lib, p), 'utf8')
const exists = (p) => existsSync(join(lib, p))
const entryCount = () => readdirSync(join(lib, 'entries')).length

console.log(`库根: ${lib}\n`)

const ENTRY = (slug, title) => ({
  slug, title, tags: ['t'], desc: `${title}；当测试时读它。`, body: `### ${title}\n\n正文。`,
})

// ══════════════════════════════════════════════════════════════
console.log('【1】缺省 step = all（向后兼容的**硬约束**）')
// ══════════════════════════════════════════════════════════════
{
  const r = await runHandoff({
    project: 'p-all',
    projectDesc: '缺省 step 的项目；当测试兼容性时读它。',
    doc: '## 目标\n\n缺省 all',
    entries: [ENTRY('e-all', '缺省 all 条目')],
  }, { sessionId: 's1', config: CFG })
  check('缺省 step ⇒ 成功', r.ok === true, r.message.slice(0, 160))
  check('⭐ 叙事写入', read('projects/HANDOFF-p-all.md').includes('缺省 all'))
  check('⭐ 知识落盘', exists('entries/e-all-' + read('projects/HANDOFF-p-all.md').match(/id: ([0-9a-f-]+)/)?.[1]?.slice(0, 8) + '.md') || entryCount() > 0)
  check('⭐ 回执**不含**分步提示（all 不该出现"本次范围之外"）',
    !r.message.includes('本次范围之外') && !r.message.includes('还差'), r.message.slice(0, 200))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【2】step 取值与合法性')
// ══════════════════════════════════════════════════════════════
{
  let r = await runHandoff({ project: 'p-all', step: 'bogus' }, { sessionId: 's', config: CFG })
  check('非法取值 ⇒ 拒绝', r.ok === false && r.message.includes('bogus'), r.message.slice(0, 140))
  check('  错误里列出合法值', r.message.includes('narrative') && r.message.includes('knowledge'))

  r = await runHandoff({ project: 'p-all', step: [] }, { sessionId: 's', config: CFG })
  check('⭐ 空数组 ⇒ 拒绝（静默当 all 会做意外的全量写入）',
    r.ok === false && r.message.includes('空数组'), r.message.slice(0, 140))

  r = await runHandoff({ project: 'p-all', step: ['all', 'knowledge'] }, { sessionId: 's', config: CFG })
  check('⭐ all 与其他并存 ⇒ 拒绝（含义冲突）',
    r.ok === false && r.message.includes('并存'), r.message.slice(0, 140))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【3】⭐ 参数与 step 不一致 ⇒ 拒绝（防"静默忽略"）')
// ══════════════════════════════════════════════════════════════
{
  const before = entryCount()

  let r = await runHandoff({
    project: 'p-all', step: 'knowledge',
    doc: '## 目标\n\n这段不该被处理',
  }, { sessionId: 's', config: CFG })
  check('⭐ step 不含 narrative 却给 doc ⇒ 拒绝', r.ok === false, r.message.slice(0, 160))
  check('  错误点明是 `doc`', r.message.includes('`doc`'), r.message.slice(0, 200))
  check('  ⚠️ 且**叙事未被改动**（拒绝得彻底，不是半做）',
    !read('projects/HANDOFF-p-all.md').includes('这段不该被处理'))

  r = await runHandoff({
    project: 'p-all', step: 'narrative',
    newThemes: [{ id: 'thm-should-not-exist', desc: '不该被建；当测试时读它。' }],
  }, { sessionId: 's', config: CFG })
  check('⭐ step 不含 theme 却给 newThemes ⇒ 拒绝', r.ok === false, r.message.slice(0, 160))
  check('  ⚠️ 主题**没被建出来**', !exists('themes/THEME-thm-should-not-exist.md'))

  r = await runHandoff({
    project: 'p-all', step: 'narrative',
    entries: [ENTRY('nope', '不该被写')],
  }, { sessionId: 's', config: CFG })
  check('⭐ step 不含 knowledge 却给 entries ⇒ 拒绝', r.ok === false, r.message.slice(0, 160))
  check('  ⚠️ 条目数未变', entryCount() === before, `${before} -> ${entryCount()}`)

  r = await runHandoff({
    project: 'p-all', step: 'knowledge',
    entries: [ENTRY('ok-know', '正常知识')],
  }, { sessionId: 's', config: CFG })
  check('  一致时正常通过', r.ok === true, r.message.slice(0, 160))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【4】⭐ 单步执行：只做该做的事')
// ══════════════════════════════════════════════════════════════
{
  const narrativeBefore = read('projects/HANDOFF-p-all.md')

  // 只加知识 ⇒ 叙事**必须原样不动**（这是最容易出错的地方）
  const r = await runHandoff({
    project: 'p-all', step: 'knowledge',
    entries: [ENTRY('e-only-know', '只加知识的条目')],
  }, { sessionId: 's', config: CFG })
  check('step:knowledge 成功', r.ok === true, r.message.slice(0, 160))
  const after = read('projects/HANDOFF-p-all.md')
  check('⭐⭐ 叙事**逐字未变**（只加了封面）',
    after.includes('## 目标\n\n缺省 all'), '叙事被改动了')
  check('⭐ 新知识已落盘', after.includes('只加知识的条目'))
  check('⭐ 回执说明"本次范围之外"哪些步', r.message.includes('本次范围之外'), r.message.slice(-320))
  check('  且其中含 narrative / theme',
    r.message.includes('`narrative`') && r.message.includes('`theme`'))
  // 🔴🔴 决策 126：回执**不得**写成"欠账/补齐"（那会把用户划定的范围说成没干完的活，
  //      实测诱导模型越界：用户只说"沉淀知识"，模型却去重写了 6 个叙事节）。
  check('⭐⭐ 回执**不得**出现"还差"（决策 126：不派活）',
    !r.message.includes('还差'), r.message.slice(-320))
  // ⚠️ **不能直接断言 `!includes('补齐')`**——新措辞是 `不要为"补齐"再调一次`，
  //    它**否定的正是旧框架**，本身就含"补齐"二字 ⇒ 那样断言与正确文本**必然打架**
  //    （实测：第一版就是这么写错的，套件报 93/1）。
  //    ⭐ 要防的是**祈使性的旧句式**，不是那个词本身 ⇒ 断言"祈使句式已消失"。
  check('⭐⭐ 回执**不得**出现祈使句"可再调一次"（旧框架的载体）',
    !r.message.includes('可再调一次'), r.message.slice(-320))
  check('⭐⭐ 回执不得让 `step:\'all\'` 当"补齐"的解法',
    !/step: ?'all'[^\n]*补齐/.test(r.message), r.message.slice(-320))
  check('   且"补齐"若出现，只能是**被禁止**的那种说法',
    !r.message.includes('补齐') || r.message.includes('不要为"补齐"'), r.message.slice(-320))
  check('⭐ 回执**明确说"不是欠账"**（这是范围声明，不是待办）',
    r.message.includes('不是欠账'), r.message.slice(-320))
  check('  本次 step 已标明', r.message.includes('本次 step'), r.message.slice(-320))
  void narrativeBefore
}

// ══════════════════════════════════════════════════════════════
console.log('\n【5】⭐ 分步：先建主题、再挂知识（顺序约束）')
// ══════════════════════════════════════════════════════════════
{
  const r1 = await runHandoff({
    project: 'p-all', step: 'theme',
    newThemes: [{ id: 'thm-step-test', desc: '分步测试主题；当测试分步时用它。' }],
  }, { sessionId: 's', config: CFG })
  check('step:theme 成功', r1.ok === true, r1.message.slice(0, 160))
  check('  主题文档已建', exists('themes/THEME-thm-step-test.md'))
  check('  回执列出**本次范围之外**的 knowledge',
    r1.message.includes('本次范围之外') && r1.message.includes('`knowledge`'), r1.message.slice(-300))
  check('🔴 且**不**说"还差"（决策 126）', !r1.message.includes('还差'), r1.message.slice(-300))

  const r2 = await runHandoff({
    project: 'p-all', step: 'knowledge',
    entries: [{ ...ENTRY('e-themed', '挂了主题的条目'), theme: ['thm-step-test'] }],
  }, { sessionId: 's', config: CFG })
  check('step:knowledge 挂已存在的主题 ⇒ 成功', r2.ok === true, r2.message.slice(0, 160))
  const snap = await B.scanLibrary()
  const themed = snap.covers.find((c) => c.cover.title === '挂了主题的条目')
  check('⭐ 主题确实挂上了', themed?.cover.theme.includes('thm-step-test'),
    JSON.stringify(themed?.cover.theme))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【6】⭐ 数组形式 + 固定执行顺序')
// ══════════════════════════════════════════════════════════════
{
  // 故意把顺序**倒着写**：knowledge 在前、theme 在后
  // ⚠️ 项目 id 要**与前面几个拉开距离**——否则会触发"近义 id 两段式确认"，
  //    那是另一条正交的规则，会把本测试搅乱（踩过）。
  const r = await runHandoff({
    project: 'proj-array-order',
    projectDesc: '数组顺序测试；当测试时读它。',
    step: ['knowledge', 'narrative', 'theme'],
    doc: '## 目标\n\n数组顺序',
    entries: [{ ...ENTRY('e-arr', '数组顺序条目'), theme: ['thm-arr-order'] }],
    newThemes: [{ id: 'thm-arr-order', desc: '数组顺序主题；当测试时用它。' }],
  }, { sessionId: 's', config: CFG })
  check('数组形式成功（顺序颠倒也应成功）', r.ok === true, r.message.slice(0, 200))
  const snap = await B.scanLibrary()
  const c = snap.covers.find((x) => x.cover.title === '数组顺序条目')
  check('⭐⭐ 主题挂上了（证明 theme 先于 knowledge 执行）',
    c?.cover.theme.includes('thm-arr-order'), JSON.stringify(c?.cover.theme))
  // ⚠️ 先确认"调用真的成功了"再断言 absence——否则失败调用也会"不含"（假阳性）
  check('  三个都做完 ⇒ 回执**不该**列"本次范围之外"',
    r.ok === true && !r.message.includes('本次范围之外') && !r.message.includes('还差'),
    r.message.slice(-200))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【7】⭐ 新建项目时的 projectDesc 例外（防死锁）')
// ══════════════════════════════════════════════════════════════
{
  const r = await runHandoff({
    project: 'p-new-step',
    projectDesc: '新建项目 + 只建主题；当测试时读它。',
    step: 'theme',
    newThemes: [{ id: 'thm-new-proj-x', desc: '新项目里的主题；当测试时用它。' }],
  }, { sessionId: 's', config: CFG })
  check('⭐⭐ 新项目 + step:theme ⇒ **不该死锁**（projectDesc 被放行）',
    r.ok === true, r.message.slice(0, 220))
  check('  项目文档已建', exists('projects/HANDOFF-p-new-step.md'))
  check('  主题已建', exists('themes/THEME-thm-new-proj-x.md'))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【8】⭐ 快照消费只在 theme 步（决策 102）')
// ══════════════════════════════════════════════════════════════
{
  // 造一条"别项目"的读快照
  // ⚠️ 先**另建一个项目**并给它一条知识，确保库里有"别的项目"的知识可引用；
  //    直接找现成的可能一条都没有（前几步失败时更甚）。
  const projB = await runHandoff({
    project: 'proj-snapshot-source',
    projectDesc: '给快照当来源的项目；当测试消费时读它。',
    entries: [ENTRY('e-src', '快照来源条目')],
  }, { sessionId: 's-seed', config: CFG })
  check('造出"别项目"及其知识', projB.ok === true, projB.message.slice(0, 120))

  const snap = await B.scanLibrary()
  const other = snap.covers.find((c) => c.cover.project === 'proj-snapshot-source')
  check('找到别项目的封面', other !== undefined)
  await B.appendReadSnapshot('s-snap', {
    entryId: other.cover.id,
    title: other.cover.title,
    desc: other.cover.desc,
    theme: [],
    project: other.cover.project,
    owner: { title: other.cover.project, desc: '别项目' },
    readAt: new Date().toISOString(),
    consumedAt: null,
  })
  const unconsumed = async () => (await B.readUnconsumedSnapshots('s-snap')).length
  check('造出 1 条未消费快照', (await unconsumed()) === 1)

  // ⭐ 只做 knowledge ⇒ **不该消费**（证据要留给 theme 步）
  await runHandoff({
    project: 'p-all', step: 'knowledge',
    entries: [ENTRY('e-noconsume', '不该消费快照')],
  }, { sessionId: 's-snap', config: CFG })
  check('⭐⭐ step:knowledge **不消费快照**（决策 102 的核心）',
    (await unconsumed()) === 1, `剩余 ${await unconsumed()}`)

  // ⭐ 做 theme ⇒ 这时才消费
  await runHandoff({
    project: 'p-all', step: 'theme',
    newThemes: [{ id: 'thm-consume', desc: '触发消费的主题；当测试时用它。' }],
  }, { sessionId: 's-snap', config: CFG })
  check('⭐ step:theme 才消费快照', (await unconsumed()) === 0, `剩余 ${await unconsumed()}`)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【9】🔴 回归：真实实例验收抓到的两个 bug')
// ══════════════════════════════════════════════════════════════
{
  // ── bug 1：「文件位置」注释**每轮 +1**（累积）──
  //    根因：`narrativeFromProjectText` / `narrativeFromDoc` 从已有文档取叙事时，
  //    没剥掉 `writeProjectDoc` 自己生成的那条行内注释。
  const readDoc = () => read('projects/HANDOFF-p-all.md')
  const countLoc = (t) => (t.match(/<!--\s*文件位置：/g) ?? []).length

  const c0 = countLoc(readDoc())
  await runHandoff({ project: 'p-all', step: 'knowledge', entries: [ENTRY('e-loc', '注释累积测试')] },
    { sessionId: 's', config: CFG })
  const c1 = countLoc(readDoc())
  await runHandoff({ project: 'p-all', step: 'knowledge', entries: [ENTRY('e-loc2', '注释累积测试2')] },
    { sessionId: 's', config: CFG })
  const c2 = countLoc(readDoc())
  check('⭐「文件位置」注释**不累积**（多轮后仍为 1）',
    c0 === 1 && c1 === 1 && c2 === 1, `${c0} → ${c1} → ${c2}`)

  // ── bug 2：`narrative` 步但不给 doc ⇒ **不清空原叙事** ──
  const before2 = readDoc()
  const r2 = await runHandoff({ project: 'p-all', step: 'narrative' }, { sessionId: 's', config: CFG })
  check('narrative 步缺 doc ⇒ 仍成功（不报错）', r2.ok === true, r2.message.slice(0, 140))
  check('⭐⭐ 原叙事**未被清空**', readDoc().includes('缺省 all'), '叙事内容丢失')
  check('⭐ 回执**警告**了"保留了原叙事"', r2.message.includes('保留原叙事') || r2.message.includes('没有给 `doc`'),
    r2.message.slice(0, 240))
  void before2
}

// ══════════════════════════════════════════════════════════════
console.log('\n【10】🔴 回归：校验失败必须**抛错**（否则模型看到"成功"）')
// ══════════════════════════════════════════════════════════════
{
  // `runHandoff` 返回 `ok:false` 只是**函数级**约定；
  // 工具层必须把它**抛成异常**，否则 `isError` 为 false ⇒ 模型以为工具跑完了。
  // （真实实例验收抓到的 bug：参数与 step 不一致时，模型收到的是"成功"。）
  const r = await runHandoff({ project: 'p-all', step: 'knowledge', doc: '## 目标\n\nx' },
    { sessionId: 's', config: CFG })
  check('runHandoff 仍返回 ok=false（函数语义不变）', r.ok === false, r.message.slice(0, 120))
  check('  且 message 里说清了原因', r.message.includes('不一致'), r.message.slice(0, 160))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【11】⭐⭐ 幂等：同 slug 查重与覆盖（决策 104）')
// ══════════════════════════════════════════════════════════════
{
  const readEntries = () =>
    readdirSync(join(lib, 'entries')).filter((f) => f.startsWith('idem-')).sort()

  const K = (over = {}) => ({
    slug: 'idem-slug', title: '幂等测试条目', tags: ['t'],
    desc: '幂等测试；当测试时读它。', body: '### 幂等测试条目\n\n第一版。',
    ...over,
  })

  // ── 第 1 次：正常写入 ──
  const r1 = await runHandoff({ project: 'p-idem', projectDesc: '幂等项目；当测试时读它。', entries: [K()] },
    { sessionId: 's', config: CFG })
  check('第 1 次写入成功', r1.ok === true, r1.message.slice(0, 140))
  check('  只产生 1 个条目文件', readEntries().length === 1, readEntries().join(', '))

  // ── ⭐⭐ 第 2 次：**完全相同的入参**（模拟网络重试）⇒ 必须拒绝 ──
  const r2 = await runHandoff({ project: 'p-idem', entries: [K()] }, { sessionId: 's', config: CFG })
  check('⭐⭐ 重发同一入参 ⇒ **拒绝**（不是静默写第二份）', r2.ok === false, r2.message.slice(0, 200))
  check('⭐⭐ 拒绝后**仍然只有 1 个文件**（幂等的核心）',
    readEntries().length === 1, readEntries().join(', '))
  check('⭐ 错误里点明了 slug', r2.message.includes('idem-slug'), r2.message.slice(0, 220))
  check('⭐ 错误里说清了怎么覆盖', r2.message.includes('overwrite'), r2.message.slice(0, 250))
  check('  错误里报出了已有条目的 id 与标题',
    r2.message.includes('幂等测试条目'), r2.message.slice(0, 250))

  // ── ⭐ 带上 overwrite ⇒ 覆盖，且**仍然只有 1 个文件** ──
  const r3 = await runHandoff({
    project: 'p-idem',
    entries: [K({ overwrite: true, body: '### 幂等测试条目\n\n**第二版**（已覆盖）。' })],
  }, { sessionId: 's', config: CFG })
  check('⭐ 带 overwrite: true ⇒ 成功', r3.ok === true, r3.message.slice(0, 200))
  check('⭐⭐ 覆盖后**依然只有 1 个文件**（就地更新，不产生第二个）',
    readEntries().length === 1, readEntries().join(', '))
  check('⭐ 回执**单独报了"覆盖"**（与"新增"区分）',
    r3.message.includes('覆盖'), r3.message.slice(-300))

  // ── ⭐ 正文真的被换掉了（不是只改了元数据）──
  const doc = await B.loadEntryDoc(
    (await B.scanLibrary()).covers.find((c) => c.cover.title === '幂等测试条目').cover.ref, false)
  check('⭐⭐ 正文被替换成新版本', doc.body.includes('第二版'), doc.body.slice(0, 120))
  check('  旧正文不再存在', !doc.body.includes('第一版'))

  // ── ⭐ 同一次调用里重发两次 ⇒ 也要拒绝（防"一次调用里塞两条同 slug"）──
  const r4 = await runHandoff({
    project: 'p-idem',
    entries: [K({ slug: 'idem-slug2', title: '组内重复' }), K({ slug: 'idem-slug2', title: '组内重复' })],
  }, { sessionId: 's', config: CFG })
  // ⚠️ 这两条**库内都不存在**（是新 slug），因此不会走查重分支。
  //    它们会各写一份 ⇒ 这属于"同一批里自己重复"，**当前不查**（见下方说明）。
  check('  （同批次内重复 slug 当前不拦——库内查重只管"与已有知识"冲突）',
    r4.ok === true, r4.message.slice(0, 160))

  // ── ⭐ adopt 走完全相同的语义 ──
  const extFile = join(lib, 'ext-src.md')
  writeFileSync(extFile, '# 外部文档\n\n内容。')
  const ra1 = await runHandoff({
    project: 'p-idem',
    adopt: [{ slug: 'idem-adopt', title: '入库的外部文档', ref: extFile, mode: 'copy', tags: ['t'], desc: 'd；当x时读它。' }],
  }, { sessionId: 's', config: CFG })
  check('adopt 首次成功', ra1.ok === true, ra1.message.slice(0, 160))
  const ra2 = await runHandoff({
    project: 'p-idem',
    adopt: [{ slug: 'idem-adopt', title: '入库的外部文档', ref: extFile, mode: 'copy', tags: ['t'], desc: 'd；当x时读它。' }],
  }, { sessionId: 's', config: CFG })
  check('⭐ adopt 同 slug ⇒ 也拒绝（与 entries 同一套语义）', ra2.ok === false, ra2.message.slice(0, 200))
  check('  文件数未增加', readEntries().filter((f) => f.startsWith('idem-adopt')).length === 1)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【12】⭐ 「沉淀自查」回执（决策 108 的方案 3）')
// ══════════════════════════════════════════════════════════════
// 🔴 它要抓的是**真实事故**：一轮会话读了东西、查清了机制，
//    却只沉淀了不相关的几条 ⇒ 光看"成功"发现不了。
{
  // 先用另一个会话 id 造一条"读快照"，模拟"本会话读过知识"。
  const src = await runHandoff({
    project: 'p-selfcheck',
    projectDesc: '自查测试项目；当测试时读它。',
    entries: [{ slug: 'sc-src', title: '被读过的那条', tags: ['t'], desc: 'd；当x时读它。', body: '### T\n\nx' }],
  }, { sessionId: 's-selfcheck-seed', config: CFG })
  check('造出被读条目', src.ok === true)

  const snap = await B.scanLibrary()
  const target = snap.covers.find((c) => c.cover.title === '被读过的那条')
  await B.appendReadSnapshot('s-selfcheck', {
    entryId: target.cover.id,
    title: target.cover.title,
    desc: target.cover.desc,
    theme: [],
    project: 'p-selfcheck',
    owner: { title: 'p-selfcheck', desc: '' },
    readAt: new Date().toISOString(),
    consumedAt: null,
  })

  // ⚠️ **关键**：落了**别的**知识（不是 0 条）——这正是真实事故的形态。
  //    只判"落 0 条"的窄条件抓不住它。
  const r = await runHandoff({
    project: 'p-selfcheck',
    step: 'knowledge',
    entries: [{ slug: 'sc-other', title: '另外一条无关的', tags: ['t'], desc: 'd；当x时读它。', body: '### T\n\nx' }],
  }, { sessionId: 's-selfcheck', config: CFG })
  check('落了知识 ⇒ 成功', r.ok === true, r.message.slice(0, 160))
  check('⭐⭐ 回执含「沉淀自查」', r.message.includes('沉淀自查'), r.message.slice(-400))
  check('⭐⭐ 列出了**读过的条目标题**（让人针对具体领域回忆）',
    r.message.includes('被读过的那条'), r.message.slice(-400))
  check('  四类清单都在（①机制 ②坑 ③决策 ④外部接口）',
    r.message.includes('实测') && r.message.includes('踩过的坑') &&
      r.message.includes('决策') && r.message.includes('外部接口'),
    r.message.slice(-400))

  // ⭐ 反证：**没读过东西**的会话 ⇒ 不该出现这个提示（免得变噪音）。
  const r2 = await runHandoff({
    project: 'p-selfcheck',
    step: 'knowledge',
    entries: [{ slug: 'sc-quiet', title: '安静会话落的条', tags: ['t'], desc: 'd；当x时读它。', body: '### T\n\nx' }],
  }, { sessionId: 's-quiet-no-reads', config: CFG })
  check('⭐ 反证：没读过知识的会话 ⇒ **不出**自查提示（防噪音）',
    r2.ok === true && !r2.message.includes('沉淀自查'), r2.message.slice(-200))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【13】⭐⭐ 叙事「按节合并」（决策 109）')
// ══════════════════════════════════════════════════════════════
// 🔴 用户报的问题：**每次交接丢掉以前的内容**（凭记忆重写 ⇒ 老的没了）。
//    修法：`doc` 当补丁 —— 写了的节替换、**没写的节保留旧值**。
{
  const p = 'p-merge'
  const narrativeOf = async () => (await mod.loadProjectDoc(p))?.narrative ?? ''

  // ── 第 1 次：六节齐全 + 一个自定义节 ──
  const first = await runHandoff({
    project: p,
    projectDesc: '合并测试项目；当测试时读它。',
    doc:
      '## 目标\n\n目标A\n\n## 当前进度\n\n进度A\n\n## 有效做法\n\n做法A\n\n' +
      '## 失败/踩坑\n\n**坑A**\n\n## 关键上下文\n\n上下文A\n\n## 下一步\n\n下一步A\n\n## 自定义节\n\n自定义A',
  }, { sessionId: 's-merge', config: CFG })
  check('第 1 次写入成功', first.ok === true, first.message.slice(0, 120))

  // ── ⭐⭐ 第 2 次：**只写「目标」**（用户报的真实场景）──
  const second = await runHandoff({
    project: p,
    doc: '## 目标\n\n**目标B（只改了这里）**',
  }, { sessionId: 's-merge', config: CFG })
  check('第 2 次（doc 只含一节）成功', second.ok === true, second.message.slice(0, 120))
  const n = await narrativeOf()

  check('⭐⭐ 写了的节 ⇒ **被替换**', n.includes('目标B（只改了这里）') && !n.includes('目标A'),
    n.slice(0, 200))
  check('⭐⭐ 没写的节 ⇒ **保留旧内容**（本决策的核心）',
    n.includes('进度A') && n.includes('做法A') && n.includes('**坑A**') &&
      n.includes('上下文A') && n.includes('下一步A'),
    n.slice(0, 400))
  check('⭐⭐ **自定义节也被保留**', n.includes('自定义A'), n.slice(-200))
  check('⭐ 六节标题顺序仍固定',
    /## 目标[\s\S]*## 当前进度[\s\S]*## 有效做法[\s\S]*## 失败\/踩坑[\s\S]*## 关键上下文[\s\S]*## 下一步/.test(n))
  check('⭐ 回执报出「哪些节沿用了原有内容」',
    second.message.includes('叙事合并') && second.message.includes('失败/踩坑'),
    second.message.slice(-300))

  // ── ⭐⭐ 回执必须报出「被替换的节 + 字数变化」（决策 109 缺口的另一半）──
  //    没有这段，**"某节被整节替换、原内容被删掉"在回执里完全不可见**。
  check('⭐⭐ 回执报出「被替换的节」',
    second.message.includes('被替换的节'), second.message.slice(-400))
  check('⭐⭐ 被替换的节带字数变化（旧 → 新）',
    /目标`：\d+ → \d+ 字符/.test(second.message), second.message.slice(-400))
  check('⭐⭐ 回执含"工具不保护写了但写不全的节"的警告',
    second.message.includes('写了但写不全的节'), second.message.slice(-400))

  // ── ⭐ 清空约定：写出来但内容留空 ⇒ 该节被清空 ──
  const third = await runHandoff({ project: p, doc: '## 下一步\n\n' }, { sessionId: 's-merge', config: CFG })
  check('写空节 ⇒ 成功', third.ok === true, third.message.slice(0, 120))
  const n3 = await narrativeOf()
  check('⭐ 写了空节 ⇒ **该节被清空**', !n3.includes('下一步A'), n3.slice(-200))
  check('  但**标题仍在**', n3.includes('## 下一步'))
  check('  其它节仍未受影响', n3.includes('**坑A**'))

  // ── ⭐⭐ 向后兼容：**写全六节时等价于原来的"整份替换"** ──
  const full = '## 目标\n\nT\n\n## 当前进度\n\nP\n\n## 有效做法\n\nW\n\n' +
    '## 失败/踩坑\n\nF\n\n## 关键上下文\n\nC\n\n## 下一步\n\nN'
  const fourth = await runHandoff({ project: p, doc: full }, { sessionId: 's-merge', config: CFG })
  check('写全六节 ⇒ 成功', fourth.ok === true, fourth.message.slice(0, 120))
  const n4 = await narrativeOf()
  check('⭐⭐ 写全六节 ⇒ 老内容**全被替换**（= 原行为，零变化）',
    n4.includes('T') && n4.includes('P') && n4.includes('W') && n4.includes('F') &&
      !n4.includes('**坑A**') && !n4.includes('做法A'),
    n4.slice(0, 300))
  check('  ⚠️ 但**自定义节仍被保留**（六节写全 ≠ 清掉自定义节）',
    n4.includes('自定义A') && fourth.message.includes('自定义节'),
    fourth.message.slice(-260))

  // ── ⭐⭐⭐ 复现真实事故：**只写了大节里新增的一小段** ⇒ 原内容被整节删掉 ──
  //    🔴 这是本次修法要防的场景。判据不是"工具拦住它"（它**拦不住**，见设计文档），
  //    而是**回执必须把"字数大幅减少"当场摆出来**，让人/模型立刻看见。
  const p2 = 'audit-big-section'
  const bigBody = Array.from({ length: 40 }, (_, i) => `第 ${i + 1} 行历史记录，内容比较长一些。`).join('\n')
  const one = await runHandoff({
    project: p2,
    projectDesc: '大字减少复现；当测试时读它。',
    doc: `## 目标\n\n目标\n\n## 当前进度\n\n${bigBody}`,
  }, { sessionId: 's-big', config: CFG })
  check('大字（40 行）首次写入成功', one.ok === true, one.message.slice(0, 140))

  // ⭐ 第二次：只补"新增的那一行"，**不带原全文** ⇒ 旧内容被整节替换掉
  const two = await runHandoff({
    project: p2,
    doc: '## 当前进度\n\n新增的一行。',
  }, { sessionId: 's-big', config: CFG })
  check('第二次（只写新增行）成功', two.ok === true, two.message.slice(0, 140))
  const nBig = (await mod.loadProjectDoc(p2))?.narrative ?? ''
  check('⚠️ 旧内容**确实被删掉**（工具挡不住——这正是事故本身）',
    !nBig.includes('第 40 行历史记录'), nBig.slice(0, 200))
  // ⭐⭐ 关键断言：**回执把这次大幅缩水摆出来了**
  check('⭐⭐⭐ 回执报出该节的字数大幅减少（旧 → 新）',
    /当前进度`：\d+ → \d+ 字符（−\d+）/.test(two.message), two.message.slice(-500))
  check('⭐⭐⭐ 回执明说"若不带上原有全文请修正"',
    two.message.includes('没带上它原有的全文') || two.message.includes('完整内容'),
    two.message.slice(-500))
  // ⭐ **决策 127（C 层）**：上面那节全是"流水账"（无判据词）⇒
  //    **不该**报"孤本判据减少"（否则每轮都报 = 噪音）。
  check('⭐ 纯流水账缩水 ⇒ **不报**「孤本判据减少」（防噪音）',
    !two.message.includes('孤本判据减少'), two.message.slice(-500))

  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐ 决策 127（C 层）：**孤本判据检测**——"压缩悬崖"的机制化防线
  //
  // 🔴 要防的真实场景：把「当前进度」里**只在这一节出现的判据**
  //    当成流水账一起归并掉（实测某文档有 37 条这种孤本，删了就永久丢失）。
  // ⚠️ 机制**只警告、不拒绝**（工具区分不了"故意删失效判据"与"误压"）。
  // ══════════════════════════════════════════════════════════════════════
  const p3 = 'orphan-judgment-probe'
  const withJudgments = [
    '### 第一批',
    '- 我先跑了探针，报了假漂移。',
    '- 验收：17 套件全绿。',
    '',
    '- 🔴 **校验必须排在会改写被判对象的动作之前**——否则永久假绿。',
    '- 🔴 **回执里的祈使句会被模型当成任务**——只陈述事实，不派活。',
    '- 🔴 **孤本判据绝不能靠整节归并压掉**——它靠原句生效。',
  ].join('\n')
  const j1 = await runHandoff({
    project: p3,
    projectDesc: '孤本判据检测；当测试时读它。',
    doc: `## 目标\n\n目标\n\n## 当前进度\n\n${withJudgments}`,
  }, { sessionId: 's-orphan', config: CFG })
  check('孤本判据项目建好', j1.ok === true, j1.message.slice(0, 140))

  // ① 判据**不减少**（还新增一条）⇒ 不该报警
  const j2 = await runHandoff({
    project: p3,
    doc: `## 当前进度\n\n${withJudgments}\n- 🔴 **又新增一条判据：仅供测试**。`,
  }, { sessionId: 's-orphan', config: CFG })
  check('⭐ 判据未减少 ⇒ **不报**「孤本判据减少」',
    j2.ok === true && !j2.message.includes('孤本判据减少'), j2.message.slice(-400))

  // ② 把 3 条孤本判据全压掉 ⇒ **必须报警**，且给出前后条数
  const j3 = await runHandoff({
    project: p3,
    doc: '## 当前进度\n\n### 第一批（已归并）\n\n- 做了些事，跑了探针，验收通过。',
  }, { sessionId: 's-orphan', config: CFG })
  check('⭐⭐ 孤本判据被压掉 ⇒ **报出**「孤本判据减少」',
    j3.ok === true && j3.message.includes('孤本判据减少'), j3.message.slice(-500))
  check('⭐⭐ 且给出「旧 → 新 条数」',
    /孤本判据减少[\s\S]{0,40}?\d+ → \d+ 条/.test(j3.message), j3.message.slice(-500))
  check('⭐ 措辞是"请核对"（只警告、不定罪）',
    j3.message.includes('请核对'), j3.message.slice(-500))
  // ⚠️ 本条**断言换过一次**（决策 136）：旧文案里有"其余五节只做语义精炼、不许删条目"
  //    —— 那属于**已废弃的压缩规范**；现在该处只讲"判据靠原句生效"。
  check('⭐ 判据措辞里带"原句"（说明为什么不能改写成摘要）',
    j3.message.includes('原句'), j3.message.slice(-500))

  // ── ⭐ 新项目（无旧叙事）⇒ 退回"规范成固定六节" ──
  // ⚠️ 项目 id 要**与 `p-merge` 拉开距离**，否则触发"近义 id 两段式确认"，
  //    那是另一条正交规则（踩过：`p-merge-fresh` 被判与 `p-merge` 相似而被拒）。
  const fresh = await runHandoff({
    project: 'fresh-merge-probe',
    projectDesc: '新项目；当测试时读它。',
    doc: '## 目标\n\n只有这一节',
  }, { sessionId: 's-merge', config: CFG })
  check('新项目 ⇒ 成功', fresh.ok === true, fresh.message.slice(0, 160))
  const nf = (await mod.loadProjectDoc('fresh-merge-probe'))?.narrative ?? ''
  check('⭐ 新项目 ⇒ **六节都补出标题**（退回原行为）',
    ['目标', '当前进度', '有效做法', '失败/踩坑', '关键上下文', '下一步'].every((t) => nf.includes(`## ${t}`)),
    nf.slice(0, 200))
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ step 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
