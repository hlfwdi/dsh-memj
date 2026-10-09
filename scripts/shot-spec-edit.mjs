/**
 * 给「章节规范就地编辑」拍两张图（决策 220）——**只看不改**。
 *
 * 🔴 本项目铁律：**改了样式必须截图看，不能只对计算样式**
 *    （"断言计算样式等于基准值"不能当验收；样式改了测试全绿但用户仍说难看，已发生过）。
 * ⇒ 这里既拍「只有按钮」的常态，也拍「点开编辑器」的展开态。
 *
 * 用法：node shot-spec-edit.mjs [port] [projectId] [outDir]
 *   ⚠️ 起浏览器时**不带 `--headless`**（在用户能看见的窗口里跑）。
 *   ⭐ 默认输出目录按**本仓库位置**派生（`<仓根>/../verify`）——**不写死部署路径**。
 */
import { dirname, join as joinPath } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.argv[2] ?? 3107)
const PID = process.argv[3] ?? 'dsh-power-control'
const OUT = process.argv[4] ?? joinPath(HERE, '..', '..', 'verify')
const CDP = Number(process.env['CDP_PORT'] ?? 9231)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const page = targets.find((t) => t.type === 'page' && t.url.includes('/plugins/dsh-memj/'))
if (page === undefined) { console.error('找不到 memj 页面'); process.exit(1) }

const sock = new globalThis.WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  sock.addEventListener('open', res, { once: true })
  sock.addEventListener('error', rej, { once: true })
})
let seq = 0
const pending = new Map()
sock.addEventListener('message', (ev) => {
  const m = JSON.parse(String(ev.data))
  const slot = pending.get(m.id)
  if (slot !== undefined) { pending.delete(m.id); slot(m) }
})
const send = (method, params = {}) => new Promise((res) => {
  seq += 1
  pending.set(seq, res)
  sock.send(JSON.stringify({ id: seq, method, params }))
})
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: `(() => { ${expr} })()`, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value
}
const shoot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  const p = `${OUT}\\${name}`
  writeFileSync(p, Buffer.from(r.result.data, 'base64'))
  console.log(`  📷 ${p}`)
}

await send('Page.enable')
await evalJs(`location.hash = '#/project/${PID}'; return true`)
await sleep(2600)
console.log('① 常态（每节一个「编辑」按钮，半透明、不抢戏）')
await shoot('shot-spec-1-list.png')

// 滚到某节，点开编辑器
await evalJs(`
  const h = [...document.querySelectorAll('#pj-detail h2')].find(e => e.textContent.trim() === '目标');
  h?.scrollIntoView({ block: 'start' });
  return true;
`)
await sleep(600)
await evalJs(`
  const h = [...document.querySelectorAll('#pj-detail h2')].find(e => e.textContent.trim() === '目标');
  for (let cur = h.nextElementSibling; cur && cur.tagName !== 'H2'; cur = cur.nextElementSibling) {
    const b = cur.querySelector?.('.spec-edit-btn');
    if (b) { b.click(); return true; }
  }
  return false;
`)
await sleep(700)
console.log('② 展开态（多行输入框 + 可自动截断 + 保存/取消）')
await shoot('shot-spec-2-editor.png')

console.log('③ 窄屏（390×844）——**真点列表进入详情**再量（见下）')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await sleep(1200)
// 🔴 **必须真点列表进入详情，不能靠 hash 导航** —— 本项目既有设计：
//    窄屏下详情**只在"用户主动点列表"时才从右侧滑入覆盖**
//    （`state.narrowUserPick` 语义，见 `renderDetailAndRestore` 的注释）；
//    用 hash 直接导航拿到的是"列表 + 详情并排"的过渡态 ⇒ **验的不是用户看到的那个画面**
//    （我第一版就是这么量/截的，图里详情被视口裁切，差点误判成"布局被撑爆"）。
await evalJs(`
  const card = [...document.querySelectorAll('#pj-list .item')]
    .find(e => e.textContent.includes(${JSON.stringify(PID)}));
  if (card) card.click();
  return true;
`)
await sleep(2000)
const narrow = await evalJs(`
  const det = document.querySelector('#pj-detail');
  const panel = det ? det.parentElement : null;
  const btns = [...document.querySelectorAll('#pj-detail .spec-edit-btn')];
  const ed = document.querySelector('#pj-detail .spec-editor');
  /** 两个窄屏悬浮按钮（返回列表 / 展开目录）——新增的「编辑」按钮不能被它们压住。 */
  const floats = [...document.querySelectorAll('.narrow-back, .toc-btn')].map(e => e.getBoundingClientRect());
  const btnRects = btns.map(b => b.getBoundingClientRect());
  const overlapFloat = btnRects.some(r => floats.some(f =>
    !(r.right < f.left || r.left > f.right || r.bottom < f.top || r.top > f.bottom)));
  return {
    narrowOpen: panel ? panel.hasAttribute('data-narrow-open') : null,
    detailOverflow: det ? det.scrollWidth - det.clientWidth : -1,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    btnInside: btns.every(b => {
      const w = b.closest('.spec-block').getBoundingClientRect();
      const r = b.getBoundingClientRect();
      return r.right <= w.right + 1 && r.left >= w.left - 1 && r.width > 20;
    }),
    btnCount: btns.length,
    btnOverlapFloat: overlapFloat,
    edW: ed ? Math.round(ed.getBoundingClientRect().width) : -1,
    docW: document.documentElement.clientWidth,
  };
`)
console.log('  窄屏量值:', JSON.stringify(narrow))
await shoot('shot-spec-3-narrow.png')
await send('Emulation.clearDeviceMetricsOverride')
await sleep(500)

sock.close()
process.exit(0)
