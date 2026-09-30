/**
 * 探针：热知识页**另两个子导航**的实景截图（全局 / 项目）。
 *
 * 🔴 第一版探针只截了「会话实时状态」（无 `?session=`，几乎是空页）——
 * **那验不到另外两页**。这两页才是内容最多的地方（项目页还是**双层结构**）。
 *
 * 用法：node scripts/probe-hot-ui2.mjs [port] [session]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const TEST = 'D:\\dsh_test\\2026-09-02_13-51-19-115'
const PORT = process.argv[2] ?? '3098'
// ⭐ 带 `?session=` ⇒ 才走"有会话"的分支（实时状态页才有内容）
const SESSION = process.argv[3] ?? 'session-probe-e2e-1'
const CDP_PORT = 9412

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}

const logFile = join(TEST, 'testhome', `arc-${PORT}.log`)
let TOKEN = ''
if (existsSync(logFile)) TOKEN = /token=([A-Za-z0-9_-]+)/.exec(readFileSync(logFile, 'utf8'))?.[1] ?? ''
const url = `http://127.0.0.1:${PORT}/plugins/dsh-memj/?token=${TOKEN}&session=${SESSION}`

const profileDir = mkdtempSync(join(tmpdir(), 'memj-hotshot2-'))
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1400,1400',
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
  await new Promise((r) => setTimeout(r, 6000))

  const evalJs = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    return r.result?.value
  }
  const shot = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const out = join(TEST, 'verify', `shot-${name}.png`)
    writeFileSync(out, Buffer.from(s.data, 'base64'))
    console.log(`     ${out}`)
    return out
  }

  console.log('════════ 热知识页：全局 / 项目 两个子页 ════════\n')

  await evalJs(`document.querySelector('.tab[data-tab="hot"]').click()`)
  await new Promise((r) => setTimeout(r, 2000))

  // ── 带 session 时，实时状态页应该有内容 ──
  console.log('【1】带 `?session=` 的实时状态页')
  // 🔴 **两个踩过的坑都要避开**：
  //   ① `innerText` **依赖布局**——未布局/隐藏元素返回空串（条目 `15be198b`）
  //      ⇒ 改用 `textContent`；
  //   ② 该页要 `await loadHotInfo()`（一次接口往返）⇒ 2s 不够，**等它渲染完**。
  for (let i = 0; i < 20; i += 1) {
    const done = await evalJs(
      `(document.getElementById('hot-live-session')?.textContent ?? '').includes(${JSON.stringify(SESSION)})`,
    )
    if (done === true) break
    await new Promise((r) => setTimeout(r, 500))
  }
  const liveText = await evalJs(`document.getElementById('hotsub-live')?.textContent ?? ''`)
  check('⭐ 显示当前会话 id', String(liveText).includes(SESSION), String(liveText).slice(0, 160))
  check('⭐ 显示绑定来源（手动/自动）',
    /来源：/.test(String(liveText)) || /未知/.test(String(liveText)),
    String(liveText).slice(0, 200))

  // ── 全局热知识页 ──
  console.log('\n【2】全局热知识（画像 + 全局知识两区）')
  await evalJs(`document.querySelector('.subtab[data-hotsub="global"]').click()`)
  // ⚠️ 该页要 `await getJson('/hot/persona')` + `getJson('/hot/global')` **两次往返**
  //    ⇒ 固定 2.5s 可能不够（实测踩到）⇒ **轮询等它渲染完**。
  // ⚠️ 用 `textContent`（不是 `innerText`——后者依赖布局，对这个坑本项目记过一次）。
  for (let i = 0; i < 20; i += 1) {
    const t = await evalJs(`document.getElementById('hotsub-global')?.textContent ?? ''`)
    if (String(t).includes('全局知识')) break
    await new Promise((r) => setTimeout(r, 500))
  }
  const gText = await evalJs(`document.getElementById('hotsub-global')?.textContent ?? ''`)
  check('⭐ 有「用户画像」区', String(gText).includes('用户画像'), String(gText).slice(0, 150))
  check('⭐ 有「全局知识」区', String(gText).includes('全局知识'))
  check('⭐ 画像输入框存在（可保存）', (await evalJs(`!!document.getElementById('hot-persona-input')`)) === true)
  const gShown = await evalJs(`document.getElementById('hotsub-global')?.hidden === false`)
  check('该子页可见（`hidden === false`）', gShown === true, String(gShown))
  await shot('hot-global')

  // ── 项目热知识页（**双层**）──
  console.log('\n【3】项目热知识：第一层（项目列表）')
  await evalJs(`document.querySelector('.subtab[data-hotsub="project"]').click()`)
  for (let i = 0; i < 20; i += 1) {
    const t = await evalJs(`document.getElementById('hot-project-list')?.textContent ?? ''`)
    if (String(t).includes('进入编辑')) break
    await new Promise((r) => setTimeout(r, 500))
  }
  const p1 = await evalJs(`document.getElementById('hot-project-picker')?.textContent ?? ''`)
  check('⭐ 第一层是**项目列表**（用户要求"先选项目"）',
    String(p1).includes('条知识') || String(p1).includes('已选'), String(p1).slice(0, 200))
  check('⭐ 有「打开当前会话的项目」按钮（用户要求）',
    (await evalJs(`!!document.getElementById('hot-open-current')`)) === true)
  // ⚠️ **反证：按钮可用性必须与"是否判定出项目"一致** ——
  //    既不给"点了没反应的按钮"，也不该把一个**能用**的按钮误禁。
  //
  // 🔴 **本条第一版把环境状态写死了**（无条件断言 `disabled === false`），
  //    结果它在**换了库副本之后失败** —— 那个会话在新副本里**没有绑定**
  //    ⇒ 按钮**理应禁用**。⭐ **不是代码回归，是断言写死了**。
  // ⇒ 正解：**先从页面读它自己显示的判定状态，再断言两者一致**（判据落在"一致性"上）。
  const btnDisabled = await evalJs(`document.getElementById('hot-open-current')?.disabled`)
  const bindState = await evalJs(`(() => {
    const t = document.getElementById('hot-live-session')?.textContent ?? ''
    const m = /判定项目：\`([^\`]+)\`/.exec(t)
    return m ? m[1] : ''
  })()`)
  const known = typeof bindState === 'string' && bindState !== ''
  check('⭐ 按钮可用性与「是否判定出项目」**一致**（不误禁、也不给死按钮）',
    btnDisabled === !known,
    `禁用=${String(btnDisabled)} 判定出项目=${JSON.stringify(bindState)}`)
  if (known) {
    check('⭐ 已判定出项目 ⇒ 该按钮**可用**（不误禁）', btnDisabled === false, String(btnDisabled))
  } else {
    check('⭐ 未判定出项目 ⇒ 该按钮**禁用**（不给"点了没反应的按钮"）',
      btnDisabled === true, String(btnDisabled))
  }
  await shot('hot-projects')

  console.log('\n【4】项目热知识：第二层（进入编辑后）')
  // 点第一个「进入编辑」
  const entered = await evalJs(`(()=>{
    const btns=[...document.querySelectorAll('#hot-project-list button')].filter(b=>b.textContent.includes('进入编辑'));
    if(btns.length===0) return false; btns[0].click(); return true;
  })()`)
  check('能进入某项目的编辑页', entered === true)
  // ⚠️ 进入后要 `seedHotSelection()`（一次写）+ `renderHotEditor()`（两次读）⇒ 轮询等
  for (let i = 0; i < 30; i += 1) {
    const ok = await evalJs(`document.getElementById('hot-project-editor')?.hidden === false`)
    if (ok === true) break
    await new Promise((r) => setTimeout(r, 500))
  }
  const editorVisible = await evalJs(`document.getElementById('hot-project-editor')?.hidden === false`)
  check('⭐ 第二层显示（左库 + 右已选）', editorVisible === true, String(editorVisible))
  if (editorVisible === true) {
    for (let i = 0; i < 20; i += 1) {
      const t = await evalJs(`document.getElementById('hot-kb-count')?.textContent ?? ''`)
      if (/\d+ \/ \d+/.test(String(t))) break
      await new Promise((r) => setTimeout(r, 500))
    }
    const left = await evalJs(`document.getElementById('hot-kb-count')?.textContent ?? ''`)
    check('⭐ 左侧知识库列表带**条数**（说明筛选器在工作）', /\d+ \/ \d+/.test(String(left)), String(left))
    const hasFilters = await evalJs(`(()=>['hot-kb-filter','hot-kb-kind','hot-kb-project','hot-kb-theme'].every(id=>!!document.getElementById(id)))()`)
    check('⭐ 左侧有**全部四个筛选控件**（搜索/类型/项目/主题，用户要求"全部筛选功能"）', hasFilters === true)
    const rightTxt = await evalJs(`document.getElementById('hot-editor-selected')?.textContent ?? ''`)
    console.log(`     右栏摘要：${String(rightTxt).slice(0, 200).replace(/\s+/g, ' ')}`)
    // ⭐⭐ **默认清单必须自动生成**（用户要求"默认选择最新的 10 条项目知识 + 5 条不重复的主题知识"）。
    //    🔴 实测踩到过一个真缺陷：`initializedAt` 非空 + 清单为空 ⇒ **永远不再生成**
    //       ⇒ 用户看到空清单且无出口（已在 `openHotProject` 里改成"看是否从未生成过"）。
    const pid = String(await evalJs(`(document.getElementById('hot-editor-title')?.textContent ?? '').replace('项目热知识：','')`))
    const sel = await (await fetch(`http://127.0.0.1:${PORT}/plugins/dsh-memj/api/hot/selection?project=${encodeURIComponent(pid)}`)).json()
    check('⭐⭐ 默认清单**自动生成**了（不是空）', (sel.entryIds ?? []).length > 0,
      `project=${pid}, entryIds=${(sel.entryIds ?? []).length}, initializedAt=${sel.initializedAt}`)
    check('⭐ 默认清单条数合理（≤ 15 = 10 项目 + 5 主题）', (sel.entryIds ?? []).length <= 15,
      String((sel.entryIds ?? []).length))
    const globalToggle = await evalJs(`!!document.getElementById('hot-editor-global-toggle')`)
    check('⭐ 右上有「全局已设置的知识」可收起/展开（用户要求）', globalToggle === true)
    // ⭐⭐ **展开它并核对内容** —— 用户报告的原始症状正是"这里说没有已纳入的条目"
    //    （根因：全局层的缺省值被错误地设成"不纳入"）。⇒ 必须**真的看一眼**。
    await evalJs(`document.getElementById('hot-editor-global-toggle')?.click()`)
    await new Promise((r) => setTimeout(r, 900))
    const gTxt = String(await evalJs(`document.getElementById('hot-editor-global')?.textContent ?? ''`))
    const glApi = await (await fetch(`http://127.0.0.1:${PORT}/plugins/dsh-memj/api/hot/global`)).json()
    const onCount = (glApi.covers ?? []).filter((c) => c.on === true).length
    check('⭐⭐ 展开后**显示全局已纳入的条目**（用户报的那个症状）',
      onCount === 0 ? gTxt.includes('没有已纳入') : !gTxt.includes('没有已纳入'),
      `接口 on:true=${onCount}，块文本=${JSON.stringify(gTxt.slice(0, 140))}`)
    check('⭐ 块内文本与接口口径**一致**（界面不撒谎）',
      onCount === 0 || gTxt.includes('标题形态') || gTxt.includes('正文形态'),
      `onCount=${onCount}, txt=${JSON.stringify(gTxt.slice(0, 100))}`)
    await shot('hot-project-editor')
  }

  console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
} finally {
  try { cdp?.close() } catch { /* ignore */ }
  edge.kill()
  try { rmSync(profileDir, { recursive: true, force: true }) } catch { /* ignore */ }
}
if (fail > 0) process.exitCode = 1
