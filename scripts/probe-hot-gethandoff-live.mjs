/**
 * 探针：⭐【B】**真实会话**里能不能读出 `get-handoff` 痕迹并判出项目。
 *
 * 🔴 **为什么不装配 `sessionQuery`**：它的 provider 是 `dsh-session-query-sqlite`，
 *    需要 `path`（sqlite 索引）+ `sessionPersistence` 服务 —— **依赖链太长**，
 *    而本探针要证的事**不需要整个 query 引擎**（只需"事件数组里有没有那条痕迹"）。
 * ⇒ ⭐ 直接解 zstd 读日志（复用本项目既有的 `verify/zstd-grep.mjs` 的**同款解码**），
 *    然后**把真实事件喂给 `parseGetHandoffFromEvents`**——判据落在**解析函数**上。
 *
 * ⚠️ **只读**：不写任何库、不改任何会话。
 * 用法：node scripts/probe-hot-gethandoff-live.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

process.env['MEMJ_DATA_DIR'] ??= 'C:\\Users\\jojoman\\.dsh-memj'
const mod = await import('../lib/index.js')

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}

const SID = 'session-68cf45d8-07e5-41e5-bd61-416a396de270'
const FILE = `D:\\dsh-standalone-0.1.5-rc.2\\home\\sessions\\--D-dsh-standalone-0.1.5-rc.2-workplaces-2026-09-18_15-36-50-913--\\${SID}\\session.v3.jsonl.zstd`

console.log('════════ 【B】真实会话：读出 get-handoff 痕迹 ════════\n')
check('（前提）会话文件存在（**只读**）', existsSync(FILE), FILE)

/** 多帧 zstd 按 magic 切片逐帧解（与 `verify/zstd-grep.mjs` 同款做法）。 */
function decodeAll(file) {
  const buf = readFileSync(file)
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const offs = []
  let i = 0
  while (i >= 0) {
    i = buf.indexOf(MAGIC, i)
    if (i < 0) break
    offs.push(i)
    i += 4
  }
  const parts = []
  for (let k = 0; k < offs.length; k += 1) {
    const s = offs[k]
    const e = k + 1 < offs.length ? offs[k + 1] : buf.length
    try { parts.push(zstdDecompressSync(buf.subarray(s, e))) } catch { /* 跳过坏帧 */ }
  }
  return Buffer.concat(parts).toString('utf8')
}

const text = existsSync(FILE) ? decodeAll(FILE) : ''
check('（前提）解出内容', text.length > 1000, `${text.length} 字符`)

/** 逐行解析事件（JSONL；坏行跳过）。 */
const events = []
for (const line of text.split('\n')) {
  const t = line.trim()
  if (t === '' || !t.startsWith('{')) continue
  try { events.push(JSON.parse(t)) } catch { /* 坏行跳过 */ }
}
console.log(`     解析出 ${events.length} 个事件`)

// ── 判据 ①：日志里**真的有**那条 command/run ──
const cmds = events.filter((e) => e?.type === 'command/run')
console.log(`     其中 command/run ${cmds.length} 条：`)
for (const c of cmds) {
  console.log(`       · ${c.data?.name}  args=${JSON.stringify(c.data?.args)}  time=${c.time}`)
}
check('⭐ 日志里有 `memj-get-handoff-project` 的 command/run',
  cmds.some((c) => c.data?.name === 'memj-get-handoff-project'))

// ── 判据 ②：⭐ **真跑解析函数**，看它能不能判出项目 ──
const KNOWN = ['dsh-memj', 'dsh-memory', 'dsh-plugin-adapt', 'dsh-sandbox-whitelist', 'dsh-qoder-connect']
const r = mod.parseGetHandoffFromEvents(events, KNOWN)
console.log(`     解析结果：project=${JSON.stringify(r.project)}  atMs=${r.atMs}`)
check('⭐⭐ **判出了 `dsh-memj`**（用户报的那个会话原来判不出）', r.project === 'dsh-memj', JSON.stringify(r))
check('⭐ 带回了那次的时刻（epoch ms ⇒ 可转 ISO 与别的判据比新旧）', r.atMs > 0, String(r.atMs))
if (r.atMs > 0) console.log(`     时刻 = ${new Date(r.atMs).toISOString()}`)

// ── 判据 ③：确认这个会话**真的没有任何 doc-reads**（所以必须靠日志）──
const dr = await mod.detectProjectByDocReads(SID, KNOWN)
check('⭐（前提复核）它 **没有 doc-reads 记录** ⇒ 旧判据必然判不出（证明本改动的必要性）',
  dr.project === '未知', JSON.stringify(dr))

// ── 判据 ④：⚠️ 反证：把那条命令换掉 ⇒ 判不出 ──
const stripped = events.filter((e) => !(e?.type === 'command/run' && e.data?.name === 'memj-get-handoff-project'))
check('⚠️（反证）去掉那条命令后 ⇒ 判不出（证明判定**确实来自它**）',
  mod.parseGetHandoffFromEvents(stripped, KNOWN).project === '未知')

// ══════════════════════════════════════════════════════════════════════════
console.log('\n════════ 【C】`memj_handoff` 痕迹（用户 2026-09-22 报的第二个会话）════')
// ══════════════════════════════════════════════════════════════════════════
//
// 🔴 用户说："session-0b0e6863-…… 这个会话最后一轮是一次建立项目的交接"，
//    但 `doc-reads` 里**没有它的任何记录**。
//    实测根因：那次交接是**用 `memj_handoff` 工具**做的（5 次），
//    而它与 `get-handoff`（命令）**是两条不同的路径** ⇒ 两条判据都要有。
const SID2 = 'session-0b0e6863-12d1-465a-b34e-d0ee8551699e'
const FILE2 = `D:\\dsh-standalone-0.1.5-rc.2\\home\\sessions\\--D-dsh-standalone-0.1.5-rc.2-workplaces-2026-09-20_11-33-20-098--\\${SID2}\\session.v3.jsonl.zstd`
check('（前提）第二个会话文件存在', existsSync(FILE2))
const text2 = existsSync(FILE2) ? decodeAll(FILE2) : ''
const events2 = []
for (const line of text2.split('\n')) {
  const t = line.trim()
  if (t === '' || !t.startsWith('{')) continue
  try { events2.push(JSON.parse(t)) } catch { /* 坏行 */ }
}
console.log(`     解析出 ${events2.length} 个事件`)
const handoffCalls = events2.filter((e) => e?.type === 'tool/call' && e.data?.name === 'memj_handoff')
console.log(`     其中 memj_handoff 调用 ${handoffCalls.length} 次`)
check('⭐ 日志里有 `memj_handoff` 的 tool/call', handoffCalls.length > 0)

const KNOWN2 = ['dsh-memj', 'dsh-plugin-adapt', 'dsh-016-upgrade', 'dsh-memory']
const r2 = mod.parseHandoffFromEvents(events2, KNOWN2)
console.log(`     解析结果：project=${JSON.stringify(r2.project)}  atMs=${r2.atMs}`)
check('⭐⭐ **判出了 `dsh-016-upgrade`**（最新那次 = "建立项目的交接"）',
  r2.project === 'dsh-016-upgrade', JSON.stringify(r2))
check('⭐（关键）取的是**最新**那次，不是早期那几次（前 4 次是 dsh-plugin-adapt）',
  r2.project !== 'dsh-plugin-adapt', JSON.stringify(r2))
check('⚠️（反证）去掉所有 memj_handoff 调用 ⇒ 判不出',
  mod.parseHandoffFromEvents(events2.filter((e) => e?.type !== 'tool/call' || e.data?.name !== 'memj_handoff'), KNOWN2).project === '未知')

console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
if (fail > 0) process.exitCode = 1
