/**
 * 写回完整性与审批正确性回归测试（§8.7①②③④ 的修复）。
 *
 * 这一套**直接测工具本体**（不是内部函数）——因为它们全是"用户调用工具时才会犯"的错：
 *  1. **否决 ≠ 批准**：否决一条 global 提名后，它**不能**出现在 GLOBAL.md 里；
 *  2. **写回不重复 frontmatter**：`memj_promote` 后文档只有 2 条 `---`、1 个 `# HANDOFF`；
 *  3. **孤儿块不丢**：解析失败的封面块在 `memj_handoff` / `memj_promote` 后**仍在**；
 *  4. **提名带标题**：提名写入的 `title` 不再是空串（审批页要能看出是哪条）。
 *
 * ⚠️ 必须在 `pnpm run build` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-rewrite-integrity.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-rewrite-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const B = await import('../lib/offline-bundle.js')
const { renderCover } = B

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

const OK_ID = 'aaaaaaaa-1111-4111-8111-111111111111'
const BAD_ID = 'ffffffff-9999-4999-8999-999999999999'

/** 造一个库：p1 有 1 张合法封面 + 1 张非法封面（desc 超长）；p2 提供主题证据。 */
function seed() {
  mkdirSync(join(lib, 'projects'), { recursive: true })
  mkdirSync(join(lib, 'entries'), { recursive: true })
  writeFileSync(
    join(lib, 'projects', 'HANDOFF-p1.md'),
    [
      '---', 'project: p1', 'desc: 测试项目；当测试时读它。', 'themes: []', '---', '',
      '# HANDOFF — p1', '',
      '## 目标', '', '旧目标。', '',
      '## 沉淀知识', '',
      renderCover({
        id: OK_ID, project: 'p1', theme: [], global: false, kind: 'fact',
        tags: ['t'], title: '合法标题', desc: '合法条目；当测试时读它。', ref: 'entries/e1-aaaaaaaa.md', ext: false,
      }), '',
      '<!-- memj:entry', `id: ${BAD_ID}`, 'project: p1', 'theme: []', 'global: false',
      'kind: fact', 'tags: t', 'title: 非法条目', `desc: ${'x'.repeat(260)}`,
      'ref: entries/bad-ffffffff.md', '-->', '<!-- /memj:entry -->', '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(lib, 'projects', 'HANDOFF-p2.md'),
    [
      '---', 'project: p2', 'desc: 另一个项目；当测试时读它。', 'themes: []', '---', '',
      '# HANDOFF — p2', '', '## 目标', '', 'x', '', '## 沉淀知识', '',
      renderCover({
        id: 'bbbbbbbb-2222-4222-8222-222222222222', project: 'p2', theme: ['thm-x'],
        global: false, kind: '', tags: ['t'], title: '别项目条目', desc: '别项目条目；当测试时读它。',
        ref: 'entries/e2-bbbbbbbb.md', ext: false,
      }), '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(lib, 'entries', 'e1-aaaaaaaa.md'),
    `---\nid: ${OK_ID}\nslug: e1\nproject: p1\ntheme: []\nglobal: false\ntags: [t]\ndesc: 合法条目；当测试时读它。\n---\n\n### 合法标题\n\n正文。\n`,
    'utf8',
  )
}

/** 抓取注册的工具（用 stub 上下文跑 apply）。 */
function toolsOf() {
  const tools = []
  const scoped = {
    logger: {}, systemPrompt: { section: () => () => {} },
    tools: { register: (d) => { tools.push(d); return () => {} } },
    commands: { register: () => () => {} },
  }
  mod.apply(
    {
      logger: {}, get: (n) => (n === 'webServer' ? { register: () => () => {} } : undefined),
      effect: (f) => { f() }, inject: (d, cb) => cb(scoped),
    },
    mod.DEFAULT_CONFIG,
  )
  return tools
}

/** 数文档结构（frontmatter 分隔线 / 一级标题）。 */
function structure(text) {
  return {
    fm: (text.match(/^---\s*$/gm) ?? []).length,
    title: (text.match(/^#\s+HANDOFF/gm) ?? []).length,
  }
}

const p1Path = join(lib, 'projects', 'HANDOFF-p1.md')

// ══════════════════════════════════════════════════════════════════════
console.log('【1】memj_promote：不重复 frontmatter / 不丢孤儿块 / 提名带标题')
// ══════════════════════════════════════════════════════════════════════
seed()
let tools = toolsOf()
const promote = tools.find((t) => t.name === 'memj_promote')
check('memj_promote 已注册', promote !== undefined)

const beforePromote = readFileSync(p1Path, 'utf8')
check('调用前：孤儿块在文档里', beforePromote.includes(BAD_ID))

const rp = await promote.execute(
  { refs: [OK_ID], addThemes: ['thm-x'], setGlobal: true },
  { agent: undefined },
)
check('promote 调用成功', rp.ok === true, JSON.stringify(rp).slice(0, 200))

const afterPromote = readFileSync(p1Path, 'utf8')
const s1 = structure(afterPromote)
check('⭐ frontmatter 只有一份（2 条 ---）', s1.fm === 2, `实际 ${s1.fm}`)
check('⭐ 一级标题只有一个', s1.title === 1, `实际 ${s1.title}`)
check('⭐ 孤儿块没有被删掉', afterPromote.includes(BAD_ID))
check('主题已追加', afterPromote.includes('thm-x'))
check('合法封面仍在', afterPromote.includes(OK_ID))

// 提名带标题（§8.7③）
const noms = await B.readNominations()
check('已登记 1 条提名', noms.length === 1, `实际 ${noms.length}`)
check(
  '⭐ 提名的 title 非空（审批页要能看出是哪条）',
  noms.length === 1 && noms[0].title === '合法标题',
  `实际 ${JSON.stringify(noms[0]?.title)}`,
)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【2】否决 ≠ 批准（§8.7①）')
// ══════════════════════════════════════════════════════════════════════
let globalText = readFileSync(join(lib, 'GLOBAL.md'), 'utf8')
check('提名待批时：GLOBAL 不含它', !globalText.includes(OK_ID))

const rejected = await B.rejectNomination(OK_ID)
check('否决调用成功', rejected === true)
await B.rebuildDerivedLayers()
globalText = readFileSync(join(lib, 'GLOBAL.md'), 'utf8')
check('⭐ 否决后：GLOBAL **仍不含**它', !globalText.includes(OK_ID), '——否决等于批准，回归了')

const afterReject = readFileSync(p1Path, 'utf8')
check('⭐ 否决后：封面 global 已置回 false', /global: false/.test(afterReject))
check('否决后：孤儿块仍在', afterReject.includes(BAD_ID))
const s2 = structure(afterReject)
check('否决后：frontmatter 仍只有一份', s2.fm === 2, `实际 ${s2.fm}`)
check('否决后：一级标题仍只有一个', s2.title === 1, `实际 ${s2.title}`)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【3】memj_handoff 主路径：不丢孤儿块 / 不重复结构')
// ══════════════════════════════════════════════════════════════════════
rmSync(lib, { recursive: true, force: true })
seed()
tools = toolsOf()
const handoff = tools.find((t) => t.name === 'memj_handoff')
check('memj_handoff 已注册', handoff !== undefined)

// ⭐⭐ 决策 112：写 `doc` 前必须先读过该项目文档。
//    ⚠️ 这里**如实模拟"先读"这个动作**（真实使用中由模型调 `memj_read`），
//       因为本套件要测的是"写回完整性"（孤儿块 / 重复结构），不是那条前置校验。
//    ⚠️ 校验本身在 test-handoff.mjs【21】专门验证。
const markRead = () =>
  B.appendDocRead('sess-test', {
    project: 'p1', turn: -1, readAt: new Date().toISOString(), full: true, sections: [],
  })
await markRead()

const rh = await handoff.execute(
  { project: 'p1', doc: '## 目标\n\n新目标。\n', entries: [] },
  { agent: { session: { id: 'sess-test' } } },
)
check('handoff 调用成功', rh.ok === true, JSON.stringify(rh).slice(0, 200))

const afterHandoff = readFileSync(p1Path, 'utf8')
check('⭐ 孤儿块没有被静默删掉', afterHandoff.includes(BAD_ID))
const s3 = structure(afterHandoff)
check('frontmatter 只有一份', s3.fm === 2, `实际 ${s3.fm}`)
check('一级标题只有一个', s3.title === 1, `实际 ${s3.title}`)
check(
  '⭐ 回执报出了"保留了 N 处无法解析的封面块"',
  String(rh.message).includes('无法解析的封面块'),
  String(rh.message).slice(0, 300),
)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【4】幂等：连续两次 handoff 不累积孤儿块')
// ══════════════════════════════════════════════════════════════════════
await handoff.execute(
  { project: 'p1', doc: '## 目标\n\n再跑一次。\n', entries: [] },
  { agent: { session: { id: 'sess-test' } } },
)
const afterTwice = readFileSync(p1Path, 'utf8')
check('孤儿块仍只有 1 份（没有重复累加）', (afterTwice.match(new RegExp(BAD_ID, 'g')) ?? []).length === 1,
  `实际 ${(afterTwice.match(new RegExp(BAD_ID, 'g')) ?? []).length} 份`)
const s4 = structure(afterTwice)
check('二次 handoff 后 frontmatter 仍只有一份', s4.fm === 2, `实际 ${s4.fm}`)

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
