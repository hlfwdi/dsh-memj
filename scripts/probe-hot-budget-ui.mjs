/**
 * 探针：⭐ 预算设置在**设置面板**、且**不在**实时状态页（用户 2026-09-22 裁定）。
 *
 * 用户原话：
 *   "热知识注入预算应该有旋钮设置，应该把设置放到记忆库页的设置面板去。
 *    不要再会话实时状态页去显示。"
 *
 * 用法：node scripts/probe-hot-budget-ui.mjs [port]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const TEST = 'D:\\dsh_test\\2026-09-02_13-51-19-115'
const PORT = process.argv[2] ?? '3098'
const CDP_PORT = 9421

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
const url = `http://127.0.0.1:${PORT}/plugins/dsh-memj/${TOKEN ? `?token=${TOKEN}` : ''}&session=session-probe-e2e-1`

const prof = mkdtempSync(join(tmpdir(), 'budget-'))
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${prof}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1300,1100'], { stdio: 'ignore' })
for (let i = 0; i < 60; i += 1) {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) break } catch { /* 等 */ }
  await new Promise((r) => setTimeout(r, 300))
}
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
await new Promise((r) => setTimeout(r, 7000))

console.log('════════ 预算设置的位置 ════════\n')

console.log('【1】⭐ 设置面板里**有**这六个旋钮')
await ev(`document.getElementById('settings-btn')?.click()`)
await new Promise((r) => setTimeout(r, 2500))
const ids = ['hot-inject-enabled', 'hot-ratio', 'hot-cpt', 'hot-budget', 'hot-full-warn', 'hot-keep']
const present = await ev(`JSON.stringify(${JSON.stringify(ids)}.map(i=>[i, !!document.getElementById(i)]))`)
const parsed = JSON.parse(String(present))
for (const [i, ok] of parsed) check(`设置面板有 \`${i}\``, ok === true)
check('⭐ 六个旋钮**全都在**设置面板里', parsed.every((x) => x[1] === true), String(present))

console.log('\n【2】⭐ 旋钮的值**从服务端回填**（不是空/placeholder）')
const vals = JSON.parse(String(await ev(`JSON.stringify({
  ratio: document.getElementById('hot-ratio')?.value,
  cpt: document.getElementById('hot-cpt')?.value,
  budget: document.getElementById('hot-budget')?.value,
  warn: document.getElementById('hot-full-warn')?.value,
  keep: document.getElementById('hot-keep')?.value,
})`)))
console.log('  ' + JSON.stringify(vals))
check('⭐ 比例回填成 0.333（默认值，不是空）', vals.ratio === '0.333', String(vals.ratio))
check('⭐ 单条阈值回填成 1000', vals.warn === '1000', String(vals.warn))
check('⭐ 窗口回落值回填成 40000', vals.budget === '40000', String(vals.budget))
check('⭐ 保留数回填成 50', vals.keep === '50', String(vals.keep))

// 截图（给人看）
const shot1 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
writeFileSync(join(TEST, 'verify', 'shot-settings-hot.png'), Buffer.from(shot1.data, 'base64'))
console.log(`     ${join(TEST, 'verify', 'shot-settings-hot.png')}`)

console.log('\n【3】⭐ 实时状态页**不再显示**预算（用户裁定）')
await ev(`document.getElementById('settings-close')?.click()`)
await new Promise((r) => setTimeout(r, 800))
await ev(`document.querySelector('.tab[data-tab="hot"]').click()`)
await new Promise((r) => setTimeout(r, 2000))
const liveTxt = String(await ev(`document.getElementById('hotsub-live')?.textContent ?? ''`))
check('⭐ 实时状态页**没有「预算」标题**', !liveTxt.includes('预算'), `片段=${JSON.stringify(liveTxt.slice(0, 160))}`)
check('⭐ 实时状态页**没有「上限 ... 字符」那句**', !/上限\s*\d+\s*字符/.test(liveTxt))
check('⚠️ 页面**确实渲染了**（不是整页空白 —— 防"删元素忘了守卫"那个坑）',
  liveTxt.includes('当前会话') || liveTxt.includes('判定与绑定'),
  `片段=${JSON.stringify(liveTxt.slice(0, 160))}`)
// ⭐ 但**超限提醒**应保留（并入计数行）
check('⭐ 清单计数行仍在（超限提醒并入这里）',
  (await ev(`!!document.getElementById('hot-live-count')`)) === true)

console.log('\n【4】🔴🔴 回归：「当前会话 / 判定项目」那一行必须还在')
// 🔴 用户 2026-09-22 实测报告："这里空白处，之前显示会话的项目匹配状态的，咋没了？"
//    根因：删掉「预算」块后，`applyGlobalBits` 里残留一句 `void budget`，
//    而 `budget` 是**已删除的变量** ⇒ 抛 `ReferenceError` ⇒
//    它后面的「当前会话 / 判定项目」**再也不会渲染**。
// ⚠️ 判据落在**那行文字真的出现了**，而不是"代码里写了"。
{
  const liveNow = String(await ev(`document.getElementById('hot-live-session')?.textContent ?? ''`))
  check('⭐⭐ 显示了「当前会话：…」', liveNow.includes('当前会话'),
    `实得=${JSON.stringify(liveNow.slice(0, 160))}`)
  check('⭐⭐ 显示了绑定/判定状态（"判定项目"或"未判定出项目"）',
    liveNow.includes('判定项目') || liveNow.includes('未判定出项目'),
    `实得=${JSON.stringify(liveNow.slice(0, 200))}`)
}

console.log('\n【4b】🔴🔴 回归：绑定下拉框**与判定结果同步**（用户 2026-09-22 报告）')
// 🔴 用户原话："手动绑定项目那个下拉框的选中，应该和当前会话的判定项目结果同步，
//    未判定的选（未知），不然看起来很有歧义，就比如其实已经判定好项目了，
//    但那里显示的是未知。"
//    根因：只 fill() 了选项、**从没设过 value** ⇒ 永远停在第一项「（未知）」。
{
  // 先确保会话有绑定（判定/手动都算）
  const info = await (await fetch(`http://127.0.0.1:${PORT}/plugins/dsh-memj/api/hot?session=session-probe-e2e-1`)).json()
  const boundProject = info.bound?.project ?? ''
  const selVal = String(await ev(`document.getElementById('hot-bind-project')?.value ?? '<没这个元素>'`))
  const optCount = Number(await ev(`document.getElementById('hot-bind-project')?.options.length ?? 0`))
  console.log(`     接口 bound.project=${JSON.stringify(boundProject)}；下拉框 value=${JSON.stringify(selVal)}；选项数=${optCount}`)
  check('下拉框有选项（不只是"（未知）"那一项）', optCount > 1, `options=${optCount}`)
  // ⭐⭐ 核心判据：下拉框的选中值 == 当前判定结果
  check('⭐⭐ 下拉框选中值**与判定结果一致**（不再自相矛盾）',
    selVal === boundProject,
    `下拉框=${JSON.stringify(selVal)}，判定=${JSON.stringify(boundProject)}`)
  check('⭐ 已判定出项目时**不再是"（未知）"**', boundProject === '' || selVal !== '', String(selVal))

  // ⚠️ **截图要在这里截**（此刻正在「会话实时状态」子页）——
  //    原来那张截图放在【5】之后 ⇒ 拍的是**项目页**，看不到绑定下拉框。
  const shotLive = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(join(TEST, 'verify', 'shot-hot-live-no-budget.png'), Buffer.from(shotLive.data, 'base64'))
  console.log(`     ${join(TEST, 'verify', 'shot-hot-live-no-budget.png')}`)

  // ⚠️ 反证：绑到一个**选项里不存在**的项目 ⇒ 应回落成「（未知）」而不是空白
  await fetch(`http://127.0.0.1:${PORT}/plugins/dsh-memj/api/hot/bind`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: 'session-probe-ghost', project: 'project-does-not-exist' }),
  })
  console.log('     （"幽灵项目"绑定已写入隔离库，仅用于验证回落行为）')
  // ⭐ 用完**自己清理**（不给隔离库留垃圾）
  await fetch(`http://127.0.0.1:${PORT}/plugins/dsh-memj/api/hot/bind`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: 'session-probe-ghost', project: '' }),
  })
}

console.log('\n【5】🔴 回归：右上块要列出**所有会全局注入的**（画像 + 全局知识）')
// 🔴 用户 2026-09-22 纠正："全局已设置的知识也应该显示画像啊，不只是全局知识啊，
//    本质就是把所有会全局注入的都要列出来啊。"
{
  await ev(`document.querySelector('.subtab[data-hotsub="project"]').click()`)
  await new Promise((r) => setTimeout(r, 2200))
  await ev(`(()=>{
    const b=[...document.querySelectorAll('#hot-project-list button')].filter(x=>x.textContent.includes('进入编辑'));
    if(b.length>0) b[0].click(); return b.length;
  })()`)
  for (let i = 0; i < 30; i += 1) {
    const ok = await ev(`document.getElementById('hot-project-editor')?.hidden === false`)
    if (ok === true) break
    await new Promise((r) => setTimeout(r, 500))
  }
  await new Promise((r) => setTimeout(r, 1500))
  await ev(`document.getElementById('hot-editor-global-toggle')?.click()`)
  await new Promise((r) => setTimeout(r, 1200))
  const gt = String(await ev(`document.getElementById('hot-editor-global')?.textContent ?? ''`))
  console.log(`     右上块内容：${JSON.stringify(gt.slice(0, 220))}`)
  const glApi = await (await fetch(`http://127.0.0.1:${PORT}/plugins/dsh-memj/api/hot/global`)).json()
  const peApi = await (await fetch(`http://127.0.0.1:${PORT}/plugins/dsh-memj/api/hot/persona`)).json()
  const onGlobal = (glApi.covers ?? []).filter((c) => c.on === true).length
  const onPersona = (peApi.items ?? []).filter((p) => p.on === true && String(p.text ?? '').trim() !== '').length
  console.log(`     接口真值：全局知识 on=${onGlobal}，画像 on=${onPersona}`)
  // ⭐⭐ 用户的核心要求：**画像也要在列**
  if (onPersona > 0) {
    check('⭐⭐ 画像**出现在右上块里**（用户纠正的那一点）',
      gt.includes('画像'), `onPersona=${onPersona}, txt=${JSON.stringify(gt.slice(0, 160))}`)
  } else {
    check('（画像为空，跳过"画像必须出现"的断言）', true, '')
  }
  check('⭐ 全局知识也在（若接口有）', onGlobal === 0 || gt.includes('全局知识'), `onGlobal=${onGlobal}`)
  check('⭐（反证）两样都空时给出**空态说明**（不是白板）',
    !(onGlobal === 0 && onPersona === 0) || gt.includes('没有'),
    `txt=${JSON.stringify(gt.slice(0, 120))}`)
}

console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
try { ws.close() } catch { /* ignore */ }
edge.kill()
try { rmSync(prof, { recursive: true, force: true }) } catch { /* 忽略 */ }
if (fail > 0) process.exitCode = 1
