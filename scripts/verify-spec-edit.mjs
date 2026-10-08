/**
 * ⭐⭐ **章节规范就地编辑的浏览器验收**（决策 220）——真点、真存、真看落盘。
 *
 * 🔴 为什么非要有它：本项目的自动化测试**测不到前端行为**
 *    （42 套件全绿而界面可能坏）。而这次改动的核心恰恰在界面上：
 *    那个「编辑」按钮到底出没出现、点开是不是真能改、存完是不是真落盘。
 *
 * 本次要证的五件事：
 *  ① 每个**有规范块**的节，块右上角都有一个「编辑」按钮（数量对上）；
 *  ② ⭐ **逐个**点开 ⇒ 标题、预填值、勾选态都**各归各节**（错位是头号风险）；
 *  ③ 改完保存 ⇒ 落盘（**用接口回读**，不看界面自己说成功）；
 *  ④ ⭐ 只改了**那一节**：其它节的规范与正文**一字未变**（含 `truncate` 标记）；
 *  ⑤ 归档项目 / 没有规范块的节 ⇒ **一个按钮都没有**（两种"不给编辑"的边界）。
 *  ⑥ 顺带量一下按钮**没有把布局撑爆 / 没有压住正文**。
 *
 * 用法：node verify-spec-edit.mjs [port] [projectId]
 *   ⚠️ 起浏览器时**不带 `--headless`**（项目纪律：测试要在用户能看见的地方跑）。
 */

const PORT = Number(process.argv[2] ?? 3107)
const PID = process.argv[3] ?? 'dsh-power-control'
const CDP = Number(process.env['CDP_PORT'] ?? 9231)

let pass = 0
let fail = 0
const chk = (ok, name, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  🔴 ${name}${extra ? '  ← ' + extra : ''}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 连上那个已经开着的标签页 ──
const targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
const page = targets.find((t) => t.type === 'page' && t.url.includes('/plugins/dsh-memj/'))
if (page === undefined) {
  console.error('找不到 memj 页面标签：', targets.map((t) => t.url))
  process.exit(1)
}
console.log(`页面: ${page.url}\n`)

// ⚠️ 用 Node 内置的 WebSocket（22+ 有全局 WebSocket）。
const sock = new globalThis.WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  sock.addEventListener('open', res, { once: true })
  sock.addEventListener('error', rej, { once: true })
})
let seq = 0
const pending = new Map()
sock.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data))
  const slot = pending.get(msg.id)
  if (slot === undefined) return
  pending.delete(msg.id)
  slot(msg)
})
const send = (method, params = {}) => new Promise((res) => {
  seq += 1
  pending.set(seq, res)
  sock.send(JSON.stringify({ id: seq, method, params }))
})
/** 在页面里跑一段表达式（返回 JSON 化的值）。 */
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: `(() => { ${expr} })()`,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.result?.exceptionDetails !== undefined) {
    throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300))
  }
  return r.result?.result?.value
}

await send('Page.enable')
await send('Runtime.enable')

// ── ① 先让页面停在"项目页 + 该项目详情"上 ──
await evalJs(`location.hash = '#/project/${PID}'; return true`)
await sleep(2500)

// ── 服务端真值（用来对照界面） ──
const api = async (p) => (await fetch(`http://127.0.0.1:${PORT}/plugins/dsh-memj/api${p}`)).json()
let proj = await api(`/project?id=${encodeURIComponent(PID)}`)
const specTitles = (proj.sections ?? []).map((s) => s.title)
console.log(`服务端认为可编辑的节：${JSON.stringify(specTitles)}\n`)

console.log('═══ 【1】「编辑」按钮出现在**每个有规范块**的节上 ═══')
{
  const st = await evalJs(`
    const box = document.querySelector('#pj-detail') || document.querySelector('.detail');
    const btns = [...document.querySelectorAll('#pj-detail .spec-edit-btn')];
    const blocks = [...document.querySelectorAll('#pj-detail .spec-block')];
    return { btns: btns.length, blocks: blocks.length, texts: btns.map(b => b.textContent) };
  `)
  chk(st.blocks === specTitles.length,
    `规范块数 == 服务端给的节数（${st.blocks} == ${specTitles.length}）`, JSON.stringify(st))
  chk(st.btns === specTitles.length, `每个块上都有一个「编辑」按钮（${st.btns}）`, JSON.stringify(st.texts))
  chk(st.texts.every((t) => t === '编辑'), '按钮文字都是「编辑」', JSON.stringify(st.texts))
}

console.log('\n═══ 【2】按钮的位置与布局（没撑爆、没压住正文） ═══')
{
  const g = await evalJs(`
    const out = [];
    for (const w of document.querySelectorAll('#pj-detail .spec-block')) {
      const pre = w.querySelector('pre');
      const btn = w.querySelector('.spec-edit-btn');
      const pr = pre.getBoundingClientRect(), br = btn.getBoundingClientRect();
      out.push({
        insideX: br.right <= pr.right + 1,          // 按钮在块内（右边不溢出）
        insideY: br.top >= pr.top - 1,              // 上边不超出块
        noOverlapText: br.left > pr.left,           // 没盖住块左半（文字起点）
        btnW: Math.round(br.width), btnH: Math.round(br.height),
      });
    }
    const det = document.querySelector('#pj-detail');
    return { out, overflow: det.scrollWidth - det.clientWidth };
  `)
  chk(g.out.length > 0 && g.out.every((o) => o.insideX && o.insideY),
    '每个按钮都**在规范块内**（右上角，没有溢出到块外）', JSON.stringify(g.out[0]))
  chk(g.out.every((o) => o.noOverlapText), '按钮没有盖住规范文字的左半（不挡阅读）')
  chk(g.overflow <= 1, `⭐ 详情栏**没有被撑出横向溢出**（overflow=${g.overflow}px）`)
  chk(g.out.every((o) => o.btnW > 20 && o.btnH > 10),
    '按钮尺寸正常（不是 0×0 的隐形元素）', JSON.stringify(g.out[0]))
}

/**
 * 打开某一节的规范编辑器（页面内真点那个按钮）。
 *
 * 🔴 **别写成"找 h2 的兄弟里那个 PRE"** —— 实现把 `pre` **包进了 `div.spec-block`**
 *    ⇒ `h2.nextElementSibling` 是那个 div、不是 pre。我第一版就是这么写的，
 *    于是它一路走到下一个 h2 才放弃、返回 false（**探针的 bug，不是产品的**）。
 *    ⭐ 判据：探针要按**真实 DOM 形态**找，不能按"我以为的形态"找。
 * @param {string} title - 节名。
 * @returns 是否真的点到了按钮。
 */
const openEditorFor = (title) => evalJs(`
  const heads = [...document.querySelectorAll('#pj-detail h2, #arcp-detail h2')];
  for (const h of heads) {
    if (h.textContent.trim() !== ${JSON.stringify(title)}) continue;
    for (let cur = h.nextElementSibling; cur !== null && cur.tagName !== 'H2'; cur = cur.nextElementSibling) {
      const wrap = cur.classList?.contains('spec-block') ? cur : cur.closest?.('.spec-block');
      const btn = wrap?.querySelector('.spec-edit-btn');
      if (btn) { btn.click(); return true; }
    }
    return false;
  }
  return false;
`)

console.log('\n═══ 【3】逐个节点开 ⇒ 每个都预填**它自己那一节**的值（错位是头号风险） ═══')
{
  let allOk = true
  const rows = []
  for (const s of proj.sections ?? []) {
    // 先关掉可能开着的编辑器（保证"这一次是我刚点开的"）
    await evalJs(`document.querySelectorAll('#pj-detail .spec-editor').forEach(e => e.remove()); return true`)
    await sleep(150)
    const opened = await openEditorFor(s.title)
    await sleep(250)
    const ed = await evalJs(`
      const ed = document.querySelector('#pj-detail .spec-editor');
      if (!ed) return null;
      const ta = ed.querySelector('textarea');
      const cb = ed.querySelector('input[type=checkbox]');
      return { value: ta?.value ?? null, truncate: cb?.checked ?? null,
               head: ed.querySelector('.spec-editor-head strong')?.textContent ?? '',
               count: document.querySelectorAll('#pj-detail .spec-editor').length };
    `)
    const titleInHead = String(ed?.head ?? '').match(/「(.+?)」/)?.[1] ?? ''
    const ok = opened === true && titleInHead === s.title &&
      ed?.value === s.spec && ed?.truncate === s.truncate && ed?.count === 1
    if (!ok) allOk = false
    rows.push({ 节: s.title, 点开了: opened, 标题对: titleInHead === s.title, 值对: ed?.value === s.spec,
      勾选对: ed?.truncate === s.truncate, 编辑器数: ed?.count })
    console.log(`  ${ok ? '✅' : '🔴'} 「${s.title}」：点开=${opened} 标题=${JSON.stringify(titleInHead)} ` +
      `预填=${JSON.stringify(ed?.value)} 勾选=${ed?.truncate} 表单数=${ed?.count}`)
  }
  chk(allOk, `⭐⭐ ${(proj.sections ?? []).length} 个节**逐个**验过：点开、标题、预填值、勾选态全部各归各节`)
  chk(rows.every((r) => r.编辑器数 === 1),
    '⭐⭐ 每节**同时只会有一个编辑器**（重复点开不会叠出第二个表单）', JSON.stringify(rows.map((r) => r.编辑器数)))
}

console.log('\n═══ 【4】改一句话 + 翻转截断 ⇒ 真落盘（接口回读） ═══')
{
  // 挑一个**不带 truncate** 的节（翻转它才能验"截断标记也跟着变"）
  const target = (proj.sections ?? []).find((s) => s.truncate === false) ?? proj.sections[0]
  await evalJs(`document.querySelectorAll('#pj-detail .spec-editor').forEach(e => e.remove()); return true`)
  await sleep(150)
  const openIt = await openEditorFor(target.title)
  chk(openIt === true, `打开「${target.title}」那一节的编辑器`)
  await sleep(400)
  // ⭐ 反证：确认现在开着的那一个**就是这一节**的（不是上一次残留的）
  const which = await evalJs(`
    const ed = document.querySelector('#pj-detail .spec-editor');
    return { head: ed?.querySelector('.spec-editor-head strong')?.textContent ?? '',
             val: ed?.querySelector('textarea')?.value ?? null };
  `)
  chk(String(which.head).includes(`「${target.title}」`) && which.val === target.spec,
    `⭐ 反证：开着的那一个确实是「${target.title}」的（不是残留的别的节）`, JSON.stringify(which))

  const RAW = `**浏览器验收写入**（${new Date().toISOString()}）`
  await evalJs(`
    const ed = document.querySelector('#pj-detail .spec-editor');
    const ta = ed.querySelector('textarea');
    ta.value = ${JSON.stringify(RAW)};
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const cb = ed.querySelector('input[type=checkbox]');
    cb.checked = ${target.truncate ? 'false' : 'true'};
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    ed.querySelector('.spec-editor-foot button.primary').click();
    return true;
  `)
  await sleep(3000)

  const after = await api(`/project?id=${encodeURIComponent(PID)}`)
  const got = (after.sections ?? []).find((s) => s.title === target.title)
  chk(got?.spec === RAW, `⭐⭐ **服务端回读到新规范**（不是界面自己说成功）`, JSON.stringify(got?.spec))
  chk(got?.truncate === !target.truncate, `⭐⭐ 截断标记也跟着翻转了（${target.truncate} → ${got?.truncate}）`)

  // ⭐⭐ 只动了那一节
  const others = (after.sections ?? []).filter((s) => s.title !== target.title)
  const alsoOthers = (proj.sections ?? []).filter((s) => s.title !== target.title)
  chk(JSON.stringify(others) === JSON.stringify(alsoOthers),
    '⭐⭐ **其它节的规范一字未变**（含各自的 truncate 标记）',
    JSON.stringify({ before: alsoOthers.map((s) => s.title), after: others.map((s) => s.title) }))

  // ⭐⭐ 该节与其它节的**正文**也没变（用叙事整段比）
  const bodyBefore = proj.narrative
  const bodyAfter = after.narrative
  const stripOne = (t) => t
    .replace(new RegExp(`## ${target.title}\\n\\n\\u0060\\u0060\\u0060memj:spec[^\\n]*\\n[\\s\\S]*?\\n\\u0060\\u0060\\u0060\\n`), `## ${target.title}\n\n`)
  chk(stripOne(bodyBefore) === stripOne(bodyAfter),
    '⭐⭐ 除那一节的那个块以外，**整份叙事逐字节相同**（正文/其它块/子节都没动）')

  // ⭐ 镜像：frontmatter 的 truncateSections 跟着正文走
  const mirror = after.frontmatter?.truncateSections ?? []
  chk(mirror.includes(target.title) === !target.truncate,
    `⭐ \`truncateSections\` 镜像跟着走（现在是 ${JSON.stringify(mirror)}）`)

  // 还原现场（把那一节改回去），免得把副本留成脏的
  const back = await fetch(`http://127.0.0.1:${PORT}/plugins/dsh-memj/api/edit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target: 'sectionSpec', id: PID, section: target.title, spec: target.spec, truncate: target.truncate }),
  })
  const backJson = await back.json()
  chk(backJson.ok === true, '（还原现场：把它改回原样）', JSON.stringify(backJson).slice(0, 120))
}

console.log('\n═══ 【5】归档项目**不给按钮**（决策 133：归档物不可编辑） ═══')
{
  const arch = proj.frontmatter?.archivedAt
  if ((arch ?? '') === '') {
    // 现找一个归档项目来验
    const list = await api('/archived?kind=project')
    const ap = (list.projects ?? [])[0]
    if (ap === undefined) {
      console.log('  （本库里没有归档项目 ⇒ 本组跳过，如实记下）')
    } else {
      await evalJs(`location.hash = '#/archive/project/${encodeURIComponent(ap.id)}'; return true`)
      await sleep(2500)
      const n = await evalJs(`return [...document.querySelectorAll('#arcp-detail .spec-edit-btn')].length`)
      chk(n === 0, `归档项目「${ap.id}」的规范块上**一个按钮都没有**（实测 ${n} 个）`)
      const blocks = await evalJs(`return [...document.querySelectorAll('#arcp-detail .spec-block')].length`)
      chk(blocks === 0, '  连 `.spec-block` 都没包（说明是**根本没装饰**，不是"按钮被藏了"）')
    }
  }
}

console.log('\n═══ 【6】没有规范块的节**不给按钮**（决策 207：绝不合成） ═══')
{
  // 库里 `dsh-sandbox-whitelist` 全身没有规范块 —— 拿它验
  const bare = 'dsh-sandbox-whitelist'
  const p2 = await api(`/project?id=${encodeURIComponent(bare)}`)
  const n = p2.sections?.length ?? -1
  await evalJs(`location.hash = '#/project/${bare}'; return true`)
  await sleep(2500)
  const st = await evalJs(`
    return {
      btns: [...document.querySelectorAll('#pj-detail .spec-edit-btn')].length,
      h2: [...document.querySelectorAll('#pj-detail h2')].length,
    };
  `)
  chk(n === 0, `服务端说「${bare}」有 0 个规范块（实测 ${n}）`)
  chk(st.btns === 0, `⭐⭐ 页面上**一个「编辑」按钮都没有**（实测 ${st.btns}）`, JSON.stringify(st))
  chk(st.h2 > 0, '  ⚠️ 反证：这一页**确实渲染出了节标题**（不是"整页没渲染"造成的假绿）', String(st.h2))
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
sock.close()
process.exit(fail === 0 ? 0 : 1)
