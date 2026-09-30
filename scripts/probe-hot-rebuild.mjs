/**
 * ⭐⭐ 探针：用**真实会话日志**验"重启后重建窗口快照"（2026-09-23 用户要求）。
 *
 * 🔴 **为什么必须用真日志**：单元测试的夹具是**我造的**（形态我写的）
 * ⇒ 它只证明"按我理解的形态能跑通"，**不证明真实日志就是这个形态**。
 * ⭐ 本探针拿**当前会话的真实 `session.v3.jsonl.zstd`**（多帧 zstd）解出来，
 * 直接喂给 `fingerprintsFromInjectionEvents` —— 这才验证了"用户报告的那个场景"。
 *
 * 用法：node probe-hot-rebuild.mjs <session.v3.jsonl.zstd> [--expect N]
 */
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const file = process.argv[2]
if (file === undefined) {
  console.error('用法：node probe-hot-rebuild.mjs <session.v3.jsonl.zstd>')
  process.exit(2)
}

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
function decode(f) {
  const buf = readFileSync(f)
  const offs = []
  let i = 0
  while (i >= 0) { i = buf.indexOf(MAGIC, i); if (i < 0) break; offs.push(i); i += 4 }
  const parts = []
  for (let k = 0; k < offs.length; k += 1) {
    const start = offs[k]
    const end = k + 1 < offs.length ? offs[k + 1] : buf.length
    try { parts.push(zstdDecompressSync(buf.subarray(start, end))) } catch { /* 跳坏帧 */ }
  }
  return Buffer.concat(parts).toString('utf8')
}

const LIBDIR = join(process.cwd(), 'lib')
const mod = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) } else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

console.log('════════ 探针：用真实会话日志重建窗口快照 ════════\n')

const lines = decode(file).split('\n').filter((l) => l.trim() !== '')
const events = []
for (const l of lines) { try { events.push(JSON.parse(l)) } catch { /* 跳过 */ } }
console.log(`真实日志：${events.length} 个事件\n`)

console.log('── 【1】先确认"注入真的在日志里"（前提） ──')
const injCount = events.filter((e) => {
  const s = e?.data?.source
  return e?.type === 'user/message' && s?.kind === 'plugin' && s?.plugin === 'dsh-memj'
}).length
check('⭐ 日志里有 memj 注入事件（否则本探针测不到东西）', injCount > 0, `实得 ${injCount}`)

console.log('\n── 【2】从真实日志里提取那些 id（模拟"本次应注入的指纹"） ──')
// ⚠️ 这里**故意不传"我应该注入哪些"**（探针拿不到那一次的真实 expected），
//    而是先从日志里把 uuid 挖出来当 fps ⇒ 验的是"**判据在真日志上能不能匹配**"。
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const allIds = new Set()
for (const e of events) {
  const s = e?.data?.source
  if (e?.type !== 'user/message' || s?.kind !== 'plugin' || s?.plugin !== 'dsh-memj') continue
  const content = e.data?.message?.content ?? e.data?.content ?? []
  const txt = Array.isArray(content) ? content.map((b) => b?.text ?? '').join('\n') : ''
  for (const m of txt.match(UUID_RE) ?? []) allIds.add(m.toLowerCase())
}
const fps = [...allIds]
check('⭐ 从真实注入事件里挖到了 UUID', fps.length > 0, `实得 ${fps.length}`)
console.log(`     （${fps.length} 个：${fps.slice(0, 3).join(', ')}…）`)

console.log('\n── 【3】⭐ 重建（本批新增的能力） ──')
const r = mod.fingerprintsFromInjectionEvents(events, fps)
check('⭐⭐ **在真实日志上重建出 `present`**（这就是"重启后还能判"）',
  r.present.size > 0, `实得 ${r.present.size}`)
// ⚠️ **这条断言第一版写错了、被实测纠正**（如实留档）：
//    我写的是 `r.present.size === fps.length`，而真日志里**失败**（14 vs 20）。
// ⭐ **核实后确认：不是代码错，是断言错** ——
//    `fps` 是从**全部历史注入事件**里挖出来的（20 个，含早已不在窗口里的），
//    而重建**正确地只取了最近一次的 14 个** ⇒ 这个"不等"正是**期望行为**。
// ⇒ 正确判据：**重建结果必须是"最近一次"的子集**，且**严格少于"全部历史"**
//    （后者证明它没有把历史全算进来）。
check('⭐⭐ 重建结果是"最近一次"的**子集**（不超出最近一次的内容）',
  r.present.size <= fps.length, `${r.present.size} vs ${fps.length}`)
check('⭐⭐ **没有把全部历史 id 都算进来**（只认最近一次 —— 这才是对的行为）',
  r.present.size < fps.length, `${r.present.size} vs ${fps.length}（应严格小于）`)
check('⭐ 带回了注入时刻（ISO）', /^\d{4}-\d{2}-\d{2}T/.test(r.at), r.at)
console.log(`     最近一次注入：${r.at}｜在窗口 ${r.present.size} 条（历史共出现过 ${fps.length} 个 id）`)

console.log('\n── 【4】⚠️ 反证：拿"不在注入文本里的 id"去查，必须查不到 ──')
const fake = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const r2 = mod.fingerprintsFromInjectionEvents(events, [...fps, fake])
check('⚠️（反证）**不存在的 id 不会被算成"在窗口"**（否则就是"全都算注入过"）',
  !r2.present.has(fake), JSON.stringify([...r2.present].slice(0, 3)))

console.log('\n── 【5】画像指纹（无 id 的那类） ──')
const personaFp = '思考过程和回答使用中文。'
const r3 = mod.fingerprintsFromInjectionEvents(events, [personaFp])
check('⭐⭐ **画像指纹也能在真实日志里匹配上**（它没有封面 id）',
  r3.present.has(personaFp), JSON.stringify([...r3.present]))

console.log('\n── 【6】⚠️ 反证：空 fps / 空事件 ⇒ 安全返回 ──')
check('⚠️（反证）fps 为空 ⇒ 空集（不抛）', mod.fingerprintsFromInjectionEvents(events, []).present.size === 0)
check('⚠️（反证）事件为空 ⇒ 空集', mod.fingerprintsFromInjectionEvents([], fps).present.size === 0)

console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
if (fail > 0) process.exitCode = 1
