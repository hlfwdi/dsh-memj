/**
 * ⭐⭐⭐ 轮次结束自动规范化（决策 165 + **167 的修正**）测试。
 *
 * ── 🔴 本套件的核心：**验"只有落知识的轮次才跑"** ─────────────────────────
 * 决策 165 的门靠**读父会话日志**判断，而那是**错的**（2026-09-28 生产事故）：
 *
 * | 门 | 165 的实现 | 为什么失效 |
 * |---|---|---|
 * | ② 有沉淀 | 判"**本会话**有没有 `memj_handoff`" | ⚠️ **会话级**判据 ⇒ 一旦为真**永远为真** |
 * | ③ 去重 | 在**父会话**找 `memj_normalize_tags` 的调用 | 🔴 调用在**子会话**里 ⇒ **永远看不到** |
 *
 * ⇒ 叠加 = **落过一次知识后，每轮都起一个子代理**。
 * ⭐ 生产铁证：`handoff` 只在 07:39~07:41 一轮，子代理却在 **07:45 / 07:52 / 08:07**
 *    （后两轮**都没沉淀**）各起一个。
 *
 * ⭐ **决策 167 的修法**（用户原话：*"这个需要插件用脚本去校验"*）：
 *    插件在**落知识那一刻**自己记一笔（`pending`），轮次结束时**消费**掉它
 *    ⇒ 语义 = "**落知识那一轮的轮次结束时，起一次**"。
 *
 * ⚠️ 必须在 `pnpm run build` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-tag-auto.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-tagauto-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const {
  decideTagAuto, markNormalized, emptyTagAutoState,
  loadTagAutoState, noteKnowledgeWritten,
  DEFAULT_CONFIG,
} = mod

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

console.log(`库根: ${lib}\n`)

const REC = (o = {}) => ({ turn: 3, written: 2, at: '2026-09-28T00:00:00.000Z', pending: true, ...o })

// ══════════════════════════════════════════════════════════════
console.log('【1】⭐⭐⭐ 只在该跑的时候跑（本套件的核心）')
// ══════════════════════════════════════════════════════════════
{
  // ① 开关
  const off = decideTagAuto({ enabled: false, record: REC() })
  check('⭐⭐ 门① 开关关 ⇒ 不起', off.start === false, JSON.stringify(off))
  check('  理由点明是开关', off.reason.includes('开关'), off.reason)

  // ② 没落过知识
  const none = decideTagAuto({ enabled: true, record: undefined })
  check('⭐⭐ 门② 本会话没落过知识 ⇒ 不起', none.start === false, JSON.stringify(none))
  check('  理由点明没落过', none.reason.includes('还没落过'), none.reason)

  // ③ 正例：落了、还没消费 ⇒ 起
  const yes = decideTagAuto({ enabled: true, record: REC() })
  check('⭐⭐ 正例：落过且未消费 ⇒ 起', yes.start === true, JSON.stringify(yes))
  check('  理由带上落知识的轮次与条数', yes.reason.includes('3') && yes.reason.includes('2'), yes.reason)

  // ⭐⭐⭐ **本次事故的回归**：消费过之后 ⇒ 不起（哪怕"这个会话落过知识"仍为真）
  const consumed = decideTagAuto({ enabled: true, record: REC({ pending: false }) })
  check('⭐⭐⭐ **事故回归**：已消费过 ⇒ 不起（165 在这里会误起）',
    consumed.start === false, JSON.stringify(consumed))
  check('  理由点明"已经规范过"', consumed.reason.includes('规范过'), consumed.reason)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【2】⭐⭐ 消费语义：起过就不再起（防"每轮一个"）')
// ══════════════════════════════════════════════════════════════
{
  const st0 = { version: 1, sessions: { 'session-s1': REC() } }
  const st1 = markNormalized(st0, 'session-s1')
  check('  消费后 `pending` 变 false', st1.sessions['session-s1'].pending === false)
  check('  ⭐ **不改入参**（纯函数）', st0.sessions['session-s1'].pending === true)
  check('  ⭐ 保留其它字段（turn/written 不被抹掉）',
    st1.sessions['session-s1'].turn === 3 && st1.sessions['session-s1'].written === 2)
  // ⭐ 模拟"同一个会话的后续轮次"：连判 3 次，只该第一次起
  let starts = 0
  let cur = st0
  for (let i = 0; i < 3; i++) {
    const d = decideTagAuto({ enabled: true, record: cur.sessions['session-s1'] })
    if (d.start) { starts += 1; cur = markNormalized(cur, 'session-s1') }
  }
  check('⭐⭐⭐ **连判 3 次只起 1 次**（165 会起 3 次 —— 生产事故形态）', starts === 1, `实得 ${starts}`)

  // 无记录时消费是 no-op
  const st2 = emptyTagAutoState()
  check('  无记录时消费 = 原样返回', markNormalized(st2, 'nope') === st2)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【3】记账：落知识才记，且记的是"待消费"')
// ══════════════════════════════════════════════════════════════
{
  await noteKnowledgeWritten('session-s2', 7, 3)
  const st = await loadTagAutoState()
  const r = st.sessions['session-s2']
  check('  记下了这条', r !== undefined, JSON.stringify(st.sessions))
  check('  轮次记对', r?.turn === 7, String(r?.turn))
  check('  条数记对', r?.written === 3, String(r?.written))
  check('⭐⭐ 初始是 `pending: true`（= 待规范化）', r?.pending === true, String(r?.pending))

  // ⚠️ 落 0 条**不该**记账（否则每轮都算"落过知识"）
  await noteKnowledgeWritten('session-s3', 9, 0)
  const st2 = await loadTagAutoState()
  check('⭐⭐ `written=0` ⇒ **不记账**（否则门② 失去意义）',
    st2.sessions['session-s3'] === undefined, JSON.stringify(st2.sessions['session-s3']))
  // 空会话 id 也不记
  await noteKnowledgeWritten('', 1, 5)
  const st3 = await loadTagAutoState()
  check('  空会话 id ⇒ 不记账', st3.sessions[''] === undefined)

  // ⭐ 覆盖语义：同一会话再落一次 ⇒ 重新置 pending（新一轮该再跑一次）
  await noteKnowledgeWritten('session-s2', 8, 1)
  const st4 = await loadTagAutoState()
  check('⭐⭐ 同一会话再落知识 ⇒ 重新 `pending: true`（新的一轮该再跑）',
    st4.sessions['session-s2'].pending === true && st4.sessions['session-s2'].turn === 8,
    JSON.stringify(st4.sessions['session-s2']))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【4】⭐ 损坏/缺失的状态不该让功能崩（最坏只是多跑一次）')
// ══════════════════════════════════════════════════════════════
{
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { tagAutoStatePath } = mod
  mkdirSync(join(lib, 'tags'), { recursive: true })
  writeFileSync(tagAutoStatePath(), '{ 这不是合法 JSON', 'utf8')
  const st = await loadTagAutoState()
  check('⭐⭐ 损坏 ⇒ 回**空状态**、不抛', st.version === 1 && Object.keys(st.sessions).length === 0,
    JSON.stringify(st))
  const d = decideTagAuto({ enabled: true, record: st.sessions['x'] })
  check('  空状态下 ⇒ 不起（不是崩溃）', d.start === false)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【5】配置默认值')
// ══════════════════════════════════════════════════════════════
{
  check('⭐⭐ `tagNormalizeOnHandoff` 默认 **true**', DEFAULT_CONFIG.tagNormalizeOnHandoff === true)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【6】⭐⭐ 静态反证：钩子的硬约束 + 不再读会话日志')
// ══════════════════════════════════════════════════════════════
{
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(join(process.cwd(), 'src', 'tag-auto.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  check('⭐⭐ 不得 `await run.result`（`turn-stopping` 是 serial 钩子）',
    !/await\s+run\.result/.test(code))
  check('  ⭐ 且对 result 挂了 catch', /run\.result\.catch/.test(code))
  check('⭐⭐ 显式传 `agentOptions`（实测不给就继承 hy3）', /agentOptions/.test(code))
  check('⭐⭐ 失败只记日志、不外溢', /console\.log\(`\[dsh-memj\/tag-auto\]/.test(code))
  check('⭐⭐ 开关关着时 `registerTagAutoNormalize` 提前 return false',
    /if \(!config\.tagNormalizeOnHandoff\) return false/.test(code))
  check('⚠️ 本模块不直接调 llm（判断在工具内部 —— 甲方案）',
    !/llm\.stream|ctx\.get\('llm'\)/.test(code))
  // ⭐⭐⭐ **本次修正的关键**：不该再读会话日志
  check('⭐⭐⭐ **不再读会话日志**（167 修正了 165 那个"会话级"判据）',
    !/sessionQuery|readSessionEvents|lastHandoffCallAt|lastNormalizeCallAt/.test(code),
    '165 靠读日志判断 ⇒ 会话级判据 + 去重恒失效 ⇒ 每轮都起')
  check('⭐ 消费标记（否则后续每轮都会再起）', /markNormalized\(/.test(code))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【7】⭐⭐⭐ 端到端：**真跑一次 handoff** ⇒ 记账真的写进去了')
// ══════════════════════════════════════════════════════════════
{
  // 🔴🔴 **为什么必须有这一段**：上面【3】直接调 `noteKnowledgeWritten`，
  //    只验了"记账函数本身对"。而**"handoff 真的会去记账吗"**是另一件事 ——
  //    ⚠️ 我做过反证：把 `handoff` 里那行注释掉，**31 条全绿**（毫无反应）
  //    ⇒ 那就是"接上了没有"**没有测试盯着**的典型。
  //    ⭐ 本项目的同族判据：**要证明"链路真的通了"，得跑真入口，不能只测零件**。
  const { runHandoff } = mod
  const sid = 'session-e2e-ledger'
  // 记账前：这个会话没有任何记录
  const before = await loadTagAutoState()
  check('  前置：该会话此前无记账', before.sessions[sid] === undefined)

  const r = await runHandoff({
    project: 'p-ledger',
    projectDesc: '记账链路端到端测试；当测试时读它。',
    entries: [{
      slug: 'led-1', title: '记账链路测试条目',
      desc: '验证 handoff 落知识后真的会记账；当测试时读它。',
      body: '### 记账链路测试条目\n\n正文。',
      tags: ['测试'],
    }],
  }, { sessionId: sid, turn: 11, config: { ...DEFAULT_CONFIG, themeCreation: 'loose' } })

  check('  前置：handoff 成功', r.ok === true, r.message?.slice(0, 120))
  const after = await loadTagAutoState()
  const rec = after.sessions[sid]
  check('⭐⭐⭐ **handoff 真的记了账**（不是只有零件对）', rec !== undefined,
    JSON.stringify(after.sessions))
  check('  ⭐ `pending: true`（待规范化）', rec?.pending === true, String(rec?.pending))
  check('  ⭐ 记下了轮次 11', rec?.turn === 11, String(rec?.turn))
  check('  ⭐ 记下了条数（≥1）', (rec?.written ?? 0) >= 1, String(rec?.written))
  // 而且这个记录**足以让门通过**
  check('⭐⭐ 端到端：这份记账让 `decideTagAuto` 判"该起"',
    decideTagAuto({ enabled: true, record: rec }).start === true)

  // ⭐ 反例：**落了 0 条知识**时不该记账（`overwrite` 不算落新知识时也一样）
  const sid2 = 'session-e2e-none'
  await runHandoff({
    project: 'p-ledger',
    // 只写叙事、不传 entries ⇒ `knowledgeWritten === 0`
    doc: '## 当前进度\n\n（无新知识。）',
  }, { sessionId: sid2, turn: 12, config: { ...DEFAULT_CONFIG, themeCreation: 'loose' } })
  const after2 = await loadTagAutoState()
  check('⭐⭐ **没落知识 ⇒ 不记账**（否则每轮都会被当成"落过知识"）',
    after2.sessions[sid2] === undefined, JSON.stringify(after2.sessions[sid2]))
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
