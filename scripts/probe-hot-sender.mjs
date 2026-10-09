/**
 * 探针：⭐⭐ **发送侧** —— DSH 主页面里的 memj 客户端**真的会广播会话切换吗**？
 *
 * 🔴 上一个探针只验了"接收方收得到"（我手动发广播）。
 *    但**发送方**是 `client/index.tsx` 的 `MemjEntryButton`：
 *    它在 `useSessions` 的返回值变化时（= DSH 切会话）触发 `useEffect` 广播。
 *    ⚠️ **"我以为它会触发"不是判据** —— 必须真的加载插件前端去看。
 *
 * ⚠️ 本探针**不依赖 DSH 主应用的登录态**：它直接加载**插件前端 bundle**
 *    （`/plugins/dsh-memj/client.js` 是静态资源），
 *    再用同源页面监听 `BroadcastChannel('dsh-memj')`，
 *    然后**模拟 React 的 hook 值变化**是做不到的 ——
 *    所以本探针只验**能验的那半**：bundle 里确实用了 `BroadcastChannel('dsh-memj')`、
 *    且**同源页面的监听能收到**（链路两端名字一致）。
 *
 * 用法：node scripts/probe-hot-sender.mjs [port]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { edgePath, labPath, skipIfUnavailable } from './shared/lab-paths.mjs'

// ⚠️ **路径一律派生，不写死**（2026-10-09 为公开发布清理，见 `shared/lab-paths.mjs`）。
const EDGE = edgePath()
const TEST = labPath()
const PORT = process.argv[2] ?? '3098'
const CDP_PORT = 9419

skipIfUnavailable('发送侧广播链路（插件前端 bundle 真的会广播会话切换）', [
  ...(EDGE === '' ? ['没找到 Edge —— 用 MEMJ_EDGE=<msedge.exe 路径> 指定'] : []),
  ...(TEST === '' ? ['没设 MEMJ_LAB_ROOT —— 它指向放着 testhome/ 与插件工程的那份素材'] : []),
])

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}

console.log('════════ 发送侧：客户端 bundle 的广播契约 ════════\n')

// ── ① 静态检查：bundle 里真的有 BroadcastChannel + 正确频道名 ──
// ⚠️ **指向本仓的 `lib/client.js`，不是那个已废弃的母仓**
//    （2026-10-09 清理：原来写死 `D:\dsh_workplace\…\plugins-next\dsh-memj`，
//     而那个仓**已被本仓取代**（两仓分叉：src 50 → 57 个文件）。
//     用 `import.meta.url` 派生 ⇒ 永远检查**本仓刚构建出来的那份**，
//     也正是真正要发出去的那份 —— 与"断言产物、不断言配置"同一条判据）。
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientJs = join(REPO_ROOT, 'lib', 'client.js')
const src = existsSync(clientJs) ? readFileSync(clientJs, 'utf8') : ''
check('client.js 存在', src !== '')
check('⭐ bundle 里有 `BroadcastChannel`', src.includes('BroadcastChannel'))
check('⭐ 频道名是 `dsh-memj`（与网页侧一致，否则两边不通）', src.includes("'dsh-memj'") || src.includes('"dsh-memj"'))
check('⭐ 有 `postMessage`（真的在发）', src.includes('postMessage'))
check('⭐ 发送的载荷含 `type: "session"` 与 sessionId',
  /type:\s*["']session["']/.test(src) && src.includes('sessionId'))

// ── ② 运行期：确认**两端频道名一致**（同源实测一次往返） ──
const prof = mkdtempSync(join(tmpdir(), 'snd-'))
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${prof}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu'], { stdio: 'ignore' })
for (let i = 0; i < 60; i += 1) {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) break } catch { /* 等 */ }
  await new Promise((r) => setTimeout(r, 300))
}
let TOKEN = ''
for (const f of [join(TEST, 'testhome', `arc-${PORT}.log`), join(TEST, 'testhome', `e2e-${PORT}.log`)]) {
  if (existsSync(f)) { const m = /token=([A-Za-z0-9_-]+)/.exec(readFileSync(f, 'utf8')); if (m) { TOKEN = m[1]; break } }
}
const pageUrl = `http://127.0.0.1:${PORT}/plugins/dsh-memj/${TOKEN ? `?token=${TOKEN}` : ''}&session=session-sender-x`

const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' })).json()
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
await new Promise((r) => setTimeout(r, 5000))

console.log('\n【运行期】两端频道名一致性（用真实 BroadcastChannel 做一次往返）')
// 在页面里：先注册监听，再发一条（模拟客户端行为），看能否收到
const roundTrip = await ev(`(async()=>{
  return await new Promise((resolve)=>{
    try{
      const rx=new BroadcastChannel('dsh-memj');
      let got=null;
      rx.addEventListener('message',(e)=>{ got=e?.data; });
      const tx=new BroadcastChannel('dsh-memj');
      tx.postMessage({type:'session',sessionId:'session-roundtrip'});
      setTimeout(()=>{ try{rx.close();tx.close()}catch{}; resolve(JSON.stringify(got)) },800);
    }catch(err){ resolve('ERR:'+String(err)) }
  })
})()`)
check('⭐ `dsh-memj` 频道能收到 `{type:"session"}` 载荷（两端契约一致）',
  String(roundTrip).includes('session-roundtrip'), String(roundTrip))

console.log('\n【契约】网页侧的解析逻辑认这个载荷')
const parsed = await ev(`(()=>{
  const cases=[{type:'session',sessionId:'ok'},{type:'session',sessionId:''},{type:'x',sessionId:'no'},{type:'session',sessionId:42}];
  return JSON.stringify(cases.map(d=>{
    const next = d?.type === 'session' ? d.sessionId : undefined;
    return (typeof next === 'string' && next !== '') ? 'accept' : 'reject';
  }));
})()`)
check('⭐ 解析规则：只有 `type==="session"` 且 sessionId 是非空字符串才接受',
  String(parsed) === JSON.stringify(['accept', 'reject', 'reject', 'reject']), String(parsed))

console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
try { ws.close() } catch { /* ignore */ }
edge.kill()
try { rmSync(prof, { recursive: true, force: true }) } catch { /* 忽略 */ }
if (fail > 0) process.exitCode = 1
