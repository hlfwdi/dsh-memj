/**
 * 探针：热知识页**三个子导航**的可见性与布局（热知识方案 §8）。
 *
 * 🔴 **为什么必须看图**（本项目铁律，条目 `d348e58f`）：
 * "计算样式对上基准"**不等于**"看着对"。上一轮只对数字 ⇒ 用户说"很难看"。
 * ⇒ 本探针**既截图、又量尺寸**：截图给人看、量尺寸抓"把容器撑爆"这类硬伤。
 *
 * ⚠️ 四个必避的假警报（本项目记录在案）：
 *  ① 等待太短（首次加载要等 `load()` + 接口往返）；
 *  ② 搜错文件（类名可能只在 CSS 里）；
 *  ③ **选择器没限定在"可见面板"**——切过标签后，非活动面板的 DOM 仍在文档里（宽高 0）；
 *  ④ 扫描范围过窄（判重叠只扫子集会漏）。
 *
 * 用法：node scripts/probe-hot-ui.mjs [port]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const TEST = 'D:\\dsh_test\\2026-09-02_13-51-19-115'
const PORT = process.argv[2] ?? '3098'
const CDP_PORT = 9411
const OUT = join(TEST, 'verify', 'shot-hot-page.png')

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}

// token：与既有探针同源（从启动日志里抠）
const logFile = join(TEST, 'testhome', `arc-${PORT}.log`)
let TOKEN = ''
if (existsSync(logFile)) TOKEN = /token=([A-Za-z0-9_-]+)/.exec(readFileSync(logFile, 'utf8'))?.[1] ?? ''
const url = `http://127.0.0.1:${PORT}/plugins/dsh-memj/?token=${TOKEN}`
console.log(`端口 ${PORT}，token ${TOKEN.slice(0, 8)}…`)

const profileDir = mkdtempSync(join(tmpdir(), 'memj-hotshot-'))
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,1200',
], { stdio: 'ignore' })

async function waitCdp() {
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) return } catch { /* 等 */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('CDP 未就绪')
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.onopen = () => resolve({
      send(method, params = {}) {
        const mid = ++id
        ws.send(JSON.stringify({ id: mid, method, params }))
        return new Promise((res, rej) => pending.set(mid, { res, rej }))
      },
      close: () => ws.close(),
    })
    ws.onerror = () => reject(new Error('ws error'))
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(JSON.stringify(msg.error)))
        else res(msg.result)
      }
    }
  })
}

let cdp
try {
  await waitCdp()
  const tab = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()
  cdp = await connect(tab.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  // ⚠️ 首次加载要等 `load()` + 接口往返 ⇒ 6s（本项目实测 5s 不够）。
  await new Promise((r) => setTimeout(r, 6000))

  const evalJs = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    return r.result?.value
  }

  console.log('\n════════ 热知识页 UI ════════\n')
  console.log('【1】页面能打开且 memj 页签存在')
  const title = await evalJs('document.title')
  check('页面已加载', typeof title === 'string' && title.length > 0, title)
  const tabs = await evalJs(`JSON.stringify([...document.querySelectorAll('.tab')].map(b=>b.dataset.tab))`)
  check('⭐ 有「热知识」页签', String(tabs).includes('hot'), String(tabs))

  console.log('\n【2】切到热知识页 + 三个子导航')
  await evalJs(`document.querySelector('.tab[data-tab="hot"]').click()`)
  await new Promise((r) => setTimeout(r, 1500))
  const subs = await evalJs(`JSON.stringify([...document.querySelectorAll('.subtab[data-hotsub]')].map(b=>b.dataset.hotsub))`)
  check('⭐ 三个子导航都在（会话实时状态/全局/项目）',
    ['live', 'global', 'project'].every((s) => String(subs).includes(s)), String(subs))

  // ⚠️ 选择器**必须限定可见面板**（切过标签后非活动面板的 DOM 仍在，但宽高 0）
  const vis = async (sel) => await evalJs(
    `(()=>{const p=document.querySelector('#panel-hot:not([hidden])');if(!p)return null;const e=p.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return JSON.stringify({w:Math.round(r.width),h:Math.round(r.height),hidden:e.hidden===true})})()`,
  )

  const master = await vis('#hot-master')
  check('⭐ 总开关在**显著位置**（裁定 H-1）且可见', master !== null && JSON.parse(master).w > 0, String(master))

  const livePanel = await vis('#hotsub-live')
  check('默认子页是「会话实时状态」且可见', livePanel !== null && JSON.parse(livePanel).hidden === false, String(livePanel))

  console.log('\n【3】逐个切换子导航（每个都要真的显示）')
  for (const s of ['global', 'project', 'live']) {
    await evalJs(`document.querySelector('.subtab[data-hotsub="${s}"]').click()`)
    await new Promise((r) => setTimeout(r, 1200))
    const st = await vis(`#hotsub-${s}`)
    const shown = st !== null && JSON.parse(st).hidden === false
    check(`切到「${s}」后该子页可见`, shown, String(st))
    // ⚠️ 反向断言：**别的子页必须隐藏**（否则三页叠在一起）
    const others = ['live', 'global', 'project'].filter((x) => x !== s)
    let allHidden = true
    for (const o of others) {
      const v = await vis(`#hotsub-${o}`)
      if (v !== null && JSON.parse(v).hidden === false) allHidden = false
    }
    check(`（反证）切到「${s}」时另外两个子页**已隐藏**`, allHidden)
  }

  console.log('\n【4】布局硬伤：有没有被撑爆（横向溢出）')
  const overflow = await evalJs(`JSON.stringify({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bodyW: document.body.scrollWidth
  })`)
  const o = JSON.parse(overflow)
  // ⭐ 本项目实测过的真 bug：内容把容器撑到 5192px。这里守一个宽松但有效的界。
  check('⭐ 无横向溢出（scrollWidth ≤ clientWidth + 8）',
    o.sw <= o.cw + 8, JSON.stringify(o))

  console.log('\n【5】热知识页的元素宽度是否正常（不是 0、也没撑爆）')
  const widths = await evalJs(`(()=>{
    const p=document.querySelector('#panel-hot:not([hidden])'); if(!p) return '[]';
    return JSON.stringify([...p.querySelectorAll('*')]
      .map(e=>({t:e.tagName,c:String(e.className).slice(0,30),w:Math.round(e.getBoundingClientRect().width)}))
      .filter(x=>x.w>0).sort((a,b)=>b.w-a.w).slice(0,5));
  })()`)
  const top = JSON.parse(widths)
  check('页面里有**正常宽度**的元素（不是整页塌成 0）',
    top.length > 0 && top[0].w > 200, widths)
  console.log('     最宽的几个元素：' + top.map((x) => `${x.t}.${x.c}=${x.w}`).join(', '))

  console.log('\n【6】截图（给人看）')
  // 先回到「会话实时状态」再截（默认视图）
  await evalJs(`document.querySelector('.subtab[data-hotsub="live"]')?.click()`)
  await new Promise((r) => setTimeout(r, 1200))
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  check('截图已保存', existsSync(OUT), OUT)
  console.log(`     ${OUT}`)

  console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
} finally {
  try { cdp?.close() } catch { /* ignore */ }
  edge.kill()
  try { rmSync(profileDir, { recursive: true, force: true }) } catch { /* ignore */ }
}
if (fail > 0) process.exitCode = 1
