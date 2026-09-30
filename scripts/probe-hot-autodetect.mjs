/**
 * 探针：⭐⭐ **打开会话时按 doc-reads 补算项目**（用户 2026-09-22 要求）。
 *
 * 用户原话：
 *   "当启用 doc-reads 的自动判定时，当打开一个尚未判定出项目的会话时，
 *    如果会话内已有上下文，应该去获取 session 历史，找最新的 doc-reads 去判断项目。"
 *
 * 🔴 **要证的链路**：
 *   ① 一个**有 doc-reads 历史但 sessions.json 里无绑定**的会话，
 *      打开页面（= 请求 `/hot?session=`）时**当场判出项目**；
 *   ② ⭐ 且**落盘**了（再查一次不用重算）；
 *   ③ ⚠️ **反证：已有绑定的会话不被重算**（否则每次刷新项目都会跳）；
 *   ④ ⚠️ **反证：没有 doc-reads 历史的会话仍报「未知」**（不许瞎猜）。
 *
 * ⚠️ 只碰隔离库。用法：node scripts/probe-hot-autodetect.mjs [port]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PORT = process.argv[2] ?? '3098'
const LIB = 'D:\\dsh_test\\2026-09-02_13-51-19-115\\verify\\memj-arc-lib'
const BASE = `http://127.0.0.1:${PORT}/plugins/dsh-memj/api`

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}
const get = async (p) => (await fetch(`${BASE}${p}`)).json()
const post = async (p, b) => (await fetch(`${BASE}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
})).json()

console.log('════════ 打开会话时按 doc-reads 补算 ════════\n')

// ── 找出隔离库里"有 doc-reads 历史"的会话 ──
const docDir = join(LIB, 'doc-reads')
const files = existsSync(docDir) ? readdirSync(docDir).filter((f) => f.endsWith('.jsonl')) : []
/** 文件名 `session-<safeName(id)>.jsonl` ⇒ 还原真实 sessionId（**id 本身自带 `session-` 前缀**）。 */
const sidOf = (f) => f.replace(/\.jsonl$/, '').replace(/^session-/, '')
const candidates = files.map((f) => {
  const text = readFileSync(join(docDir, f), 'utf8')
  const recs = text.split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const last = [...recs].sort((a, b) => String(b.readAt ?? '').localeCompare(String(a.readAt ?? '')))[0]
  return { sid: sidOf(f), project: last?.project ?? '' }
}).filter((x) => x.project !== '')

console.log(`【0】隔离库有 ${candidates.length} 个带 doc-reads 历史的会话`)
check('（前提）确实有可用的样本', candidates.length > 0, `files=${files.length}`)
if (candidates.length === 0) {
  console.log('\n（无可测样本，终止）')
  process.exit(0)
}

const sfileBefore = JSON.parse(readFileSync(join(LIB, 'hot', 'sessions.json'), 'utf8'))
const boundIds = Object.keys(sfileBefore.sessions ?? {})

// 选一个**没有绑定**的样本（正是用户场景）
const target = candidates.find((c) => !boundIds.includes(c.sid))
check('（前提）找到了"有历史但无绑定"的会话（用户场景）', target !== undefined,
  `候选 ${candidates.length} 个，已绑定 ${boundIds.length} 个`)
if (target === undefined) { console.log('（全部已绑定，跳过）'); process.exit(0) }
console.log(`  目标会话：${target.sid.slice(0, 50)}`)
console.log(`  它的 doc-reads 历史里最新项目 = ${target.project}`)
console.log(`  ⚠️ 请求前它在 sessions.json 里**没有绑定** ✓`)

console.log('\n【1】⭐ 打开会话（= 请求 /hot?session=）⇒ 应该当场判出项目')
const info = await get(`/hot?session=${encodeURIComponent(target.sid)}`)
check('⭐ 接口报出了项目', info.bound?.project === target.project,
  `实得 ${info.bound?.project ?? '(无)'}，期望 ${target.project}`)
check('⭐ 来源标为 `doc-reads`（是自动判出来的）', info.bound?.source === 'doc-reads',
  String(info.bound?.source))
check('preview 也用这个项目', info.preview?.project === target.project,
  String(info.preview?.project))

console.log('\n【2】⭐ 已落盘（下次不用重算）')
const sfileAfter = JSON.parse(readFileSync(join(LIB, 'hot', 'sessions.json'), 'utf8'))
check('⭐ 绑定真的写进了 sessions.json', sfileAfter.sessions?.[target.sid]?.project === target.project,
  JSON.stringify(sfileAfter.sessions?.[target.sid] ?? null))
check('落盘来源 = doc-reads', sfileAfter.sessions?.[target.sid]?.source === 'doc-reads')

console.log('\n【3】⚠️ 反证：已有绑定的会话**不被重算**（否则每次刷新项目都跳）')
// 造一个"绑定成别的项目"的会话，看会不会被 doc-reads 覆盖
const fakeSid = 'session-probe-fixed-binding'
await post('/hot/bind', { session: fakeSid, project: 'dsh-memory' })   // 手动绑到别的项目
const info2 = await get(`/hot?session=${encodeURIComponent(fakeSid)}`)
check('⭐（反证）手动绑定**不被自动判定覆盖**', info2.bound?.project === 'dsh-memory' && info2.bound?.source === 'manual',
  `实得 ${info2.bound?.project}/${info2.bound?.source}`)

console.log('\n【4】⚠️ 反证：没有 doc-reads 历史的会话 ⇒ 仍报「未知」（不许瞎猜）')
const info3 = await get('/hot?session=session-never-existed-xyz')
check('⭐（反证）无历史 ⇒ 项目为「未知」', info3.bound == null || info3.bound.project === '未知',
  JSON.stringify(info3.bound))
check('⭐（反证）且**没有**为它建绑定（不给无历史的会话编项目）',
  JSON.parse(readFileSync(join(LIB, 'hot', 'sessions.json'), 'utf8')).sessions?.['session-never-existed-xyz'] === undefined)

console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
if (fail > 0) process.exitCode = 1
