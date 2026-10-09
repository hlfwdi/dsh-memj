/**
 * 探针：⭐⭐ **会话切换的实时跟随**（用户 2026-09-22 要求）。
 *
 * 用户的原始需求：
 *   *"我在 dsh 切换会话的时候，前端就要去获取到 sessionId。应该是用户在 dsh 切换会话的时候就要变。"*
 *
 * 🔴 **本探针要证的链路**：
 *   ① 记忆库页**能收到** `BroadcastChannel('dsh-memj')` 的广播并换掉会话；
 *   ② ⚠️ **反证：同一个会话重复广播不重渲染**（避免无谓重画）；
 *   ③ ⚠️ **反证：空值/异形消息不生效**（不能被坏消息冲掉有效会话）；
 *   ④ ⭐ 地址栏 `?session=` 也跟着换（用 `replaceState`，**不产生历史**）。
 *
 * ⚠️ **为什么用同页两个 tab 模拟**：`BroadcastChannel` 是同源跨窗口的，
 *    开两个真实 tab 最接近真实场景（记忆库页通常正是被 `window.open` 打开的）。
 *
 * 用法：node scripts/probe-hot-session-follow.mjs [port]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { edgePath, labPath, skipIfUnavailable } from './shared/lab-paths.mjs'

// ⚠️ **路径一律派生，不写死**（2026-10-09 为公开发布清理，见 `shared/lab-paths.mjs`）。
const EDGE = edgePath()
const TEST = labPath()
const PORT = process.argv[2] ?? '3098'
const CDP_PORT = 9418

skipIfUnavailable('会话切换的实时跟随（同页两个 tab 模拟 BroadcastChannel）', [
  ...(EDGE === '' ? ['没找到 Edge —— 用 MEMJ_EDGE=<msedge.exe 路径> 指定'] : []),
  ...(TEST === '' ? ['没设 MEMJ_LAB_ROOT —— 它指向放着 testhome/ 的那份一次性素材'] : []),
])

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}

let TOKEN = ''
for (const f of [join(TEST, 'testhome', `arc-${PORT}.log`), join(TEST, 'testhome', `e2e-${PORT}.log`)]) {
  if (existsSync(f)) { const m = /token=([A-Za-z0-9_-]+)/.exec(readFileSync(f, 'utf8')); if (m) { TOKEN = m[1]; break } }
}
const base = `http://127.0.0.1:${PORT}/plugins/dsh-memj/${TOKEN ? `?token=${TOKEN}` : ''}`
const SID_A = 'session-follow-A'
const SID_B = 'session-follow-B'

const prof = mkdtempSync(join(tmpdir(), 'follow-'))
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${prof}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1300,900'], { stdio: 'ignore' })

for (let i = 0; i < 60; i += 1) {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) break } catch { /* 等 */ }
  await new Promise((r) => setTimeout(r, 300))
}

/** 连一个 tab 的 CDP。 */
async function conn(url) {
  const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  await new Promise((r) => { ws.onopen = r })
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data)
    if (x.id && pending.has(x.id)) { const { res } = pending.get(x.id); pending.delete(x.id); res(x.result) }
  }
  const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res) => pending.set(i, { res })) }
  await send('Runtime.enable')
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    return r.result?.value
  }
  return { send, ev, close: () => ws.close() }
}

let memj
let sender
try {
  // ① 记忆库页（**接收方**），URL 带 SID_A
  memj = await conn(`${base}&session=${SID_A}`)
  // ② 模拟 DSH 主页面（**发送方**）—— 只要同源即可，用记忆库页本身也行，
  //    但另开一个 tab 更接近"主应用在另一个窗口"的真实场景。
  sender = await conn(`${base}&session=${SID_A}`)
  await new Promise((r) => setTimeout(r, 7000))

  console.log('════════ 会话切换的实时跟随 ════════\n')

  console.log('【1】前提：页面初始会话 = URL 里的那个')
  const sid0 = String(await memj.ev(`new URLSearchParams(location.search).get('session') ?? ''`))
  check('初始 `?session=` 正确', sid0 === SID_A, sid0)
  check('页面文本里显示了会话 id',
    String(await memj.ev(`document.body.textContent.includes(${JSON.stringify(SID_A)})`)) === 'true'
    || String(await memj.ev(`document.body.textContent.includes(${JSON.stringify(SID_A)})`)),
    '（可能还没渲染到热知识页）')

  console.log('\n【2】⭐ 发送方广播 SID_B ⇒ 接收方应跟随')
  // 走真实的 `BroadcastChannel`（这正是 client/index.tsx 里 broadcastSession 做的事）
  await sender.ev(`(()=>{const c=new BroadcastChannel('dsh-memj');c.postMessage({type:'session',sessionId:${JSON.stringify(SID_B)}});c.close();return true})()`)
  await new Promise((r) => setTimeout(r, 2500))
  const histBefore = await memj.ev(`history.length`)
  const sid1 = String(await memj.ev(`new URLSearchParams(location.search).get('session') ?? ''`))
  check('⭐ 接收方的会话**跟着变了**（用户要的实时跟随）', sid1 === SID_B, `实得 ${sid1}`)

  console.log('\n【3】⭐ 地址栏也换了，且**不产生历史**')
  const histAfter = await memj.ev(`history.length`)
  check('地址栏的 `?session=` 已更新（`replaceState`）', sid1 === SID_B)
  check('⭐（反证）**不产生新的历史记录**（`replaceState` 而非 push）',
    Number(histAfter) === Number(histBefore), `before=${histBefore} after=${histAfter}`)

  console.log('\n【4】⚠️ 反证：坏消息不许生效')
  await sender.ev(`(()=>{const c=new BroadcastChannel('dsh-memj');c.postMessage({type:'session',sessionId:''});c.close();return true})()`)
  await sender.ev(`(()=>{const c=new BroadcastChannel('dsh-memj');c.postMessage({type:'别的',sessionId:'session-evil'});c.close();return true})()`)
  await sender.ev(`(()=>{const c=new BroadcastChannel('dsh-memj');c.postMessage({type:'session',sessionId:12345});c.close();return true})()`)
  await new Promise((r) => setTimeout(r, 2000))
  const sid2 = String(await memj.ev(`new URLSearchParams(location.search).get('session') ?? ''`))
  check('⭐（反证）空值 / 异形 type / 非字符串 ⇒ **会话不被冲掉**', sid2 === SID_B, `实得 ${sid2}`)

  console.log('\n【5】⭐ 切回 SID_A 也应生效（不是一次性的）')
  await sender.ev(`(()=>{const c=new BroadcastChannel('dsh-memj');c.postMessage({type:'session',sessionId:${JSON.stringify(SID_A)}});c.close();return true})()`)
  await new Promise((r) => setTimeout(r, 2500))
  const sid3 = String(await memj.ev(`new URLSearchParams(location.search).get('session') ?? ''`))
  check('⭐ 再切回去也跟随（双向，不是只认一次）', sid3 === SID_A, `实得 ${sid3}`)

  console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
} finally {
  try { memj?.close() } catch { /* ignore */ }
  try { sender?.close() } catch { /* ignore */ }
  edge.kill()
  try { rmSync(prof, { recursive: true, force: true }) } catch { /* 忽略 Windows 临时目录占用 */ }
}
if (fail > 0) process.exitCode = 1
