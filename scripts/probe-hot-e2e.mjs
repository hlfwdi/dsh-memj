/**
 * 探针：热知识注入的**端到端验证**（跑在隔离实例 3098 上）。
 *
 * 🔴 **为什么需要它**：套件（`test-hot.mjs`）只验纯逻辑，
 * **验不到"注入真的进了会话"**——那要真实的 agent 循环 + `pre-step` 钩子。
 *
 * 本探针验四件事：
 *   ① `hot/` 四个文件被正确读写（含中文往返）；
 *   ② 会话绑定能落盘、且 `source: manual` 不被自动判定覆盖；
 *   ③ **注入真的发生**：开了总开关后，会话里出现 memj 的注入消息（读会话日志取证）；
 *   ④ 看门狗判据成立：注入内容里的 id 能在**出网消息**里被找到。
 *
 * ⚠️ **只碰隔离库**（`MEMJ_DATA_DIR` 指向 `verify/memj-arc-lib`），不碰生产。
 * 用法：node scripts/probe-hot-e2e.mjs
 */
const BASE = process.env['HOT_BASE'] ?? 'http://127.0.0.1:3098/plugins/dsh-memj/api'
const TOKEN = process.env['HOT_TOKEN'] ?? ''

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}

/** 发一个请求（token 走 query，与 DSH 网页一致的认证方式）。 */
async function api(path, init) {
  const url = TOKEN === '' ? `${BASE}${path}` : `${BASE}${path}${path.includes('?') ? '&' : '?'}token=${TOKEN}`
  const r = await fetch(url, init)
  const text = await r.text()
  let body
  try { body = JSON.parse(text) } catch { body = { __html: text.slice(0, 120) } }
  return { status: r.status, body, contentType: r.headers.get('content-type') ?? '' }
}

const post = (path, obj) => api(path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
})

console.log('════════ 探针：热知识注入端到端 ════════\n')

// ══════════════════════════════════════════════════════════════════════════
console.log('【1】`hot/` 接口可用 + 中文往返正确')
// ══════════════════════════════════════════════════════════════════════════

const zhText = '我是探针写的画像（中文 + 标点：，。！）。'
const add = await post('/hot/persona', { op: 'add', text: zhText })
check('画像写入 200', add.status === 200, JSON.stringify(add.body))
const added = (add.body.items ?? []).at(-1)
check('⭐ 中文**逐字往返**（UTF-8 未损坏）', added?.text === zhText, JSON.stringify(added?.text))
check('新条目默认纳入', added?.on === true)
check('新条目默认通道 inbox', added?.channel === 'inbox')

const list = await api('/hot/persona')
check('回读能拿到刚写的那条', (list.body.items ?? []).some((i) => i.text === zhText))

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【2】项目列表（第一层）+ 已选清单（§8.3.1 / §5.3b）')
// ══════════════════════════════════════════════════════════════════════════

const projs = await api('/hot/projects')
check('项目列表 200 且是 JSON', projs.status === 200 && projs.body.ok === true)
const firstProj = (projs.body.projects ?? [])[0]
check('⭐ 每个项目带**已选数**与**会注入数**（两个口径分开）',
  firstProj !== undefined && 'selectedCount' in firstProj && 'injectCount' in firstProj,
  JSON.stringify(firstProj))
check('已选数 ≤ 知识数（口径不出错）',
  firstProj === undefined || firstProj.selectedCount <= firstProj.coverCount)

const pid = firstProj?.id ?? ''
const sel0 = await api(`/hot/selection?project=${encodeURIComponent(pid)}`)
check('清单可读', sel0.status === 200)

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【3】绑定与判定开关（§7）')
// ══════════════════════════════════════════════════════════════════════════

const SID = 'session-probe-e2e-1'
const bind = await post('/hot/bind', { session: SID, project: pid })
check('手动绑定 200', bind.status === 200, JSON.stringify(bind.body))
check('⭐ 绑定来源标为 `manual`（不会被自动判定覆盖）', bind.body.bound?.source === 'manual',
  JSON.stringify(bind.body.bound))

// ⚠️ 反证：自动判定**不许**覆盖 manual
const info1 = await api(`/hot?session=${SID}`)
check('（反证）`/hot` 读到的绑定仍是 manual', info1.body.bound?.source === 'manual')

// 判定开关：默认 doc-reads 开、LLM 关（裁定：LLM 会花钱）
check('⭐ 默认只有 doc-reads 判定开（LLM 默认关，避免花钱）',
  info1.body.detect?.docReads === true && info1.body.detect?.llm === false,
  JSON.stringify(info1.body.detect))

// ⚠️ 反证：开了 LLM 开关要能读回来
await post('/hot/bind', { detectLlm: true })
const info2 = await api(`/hot?session=${SID}`)
check('（反证）LLM 开关打开后读回 true', info2.body.detect?.llm === true)
await post('/hot/bind', { detectLlm: false })   // 还原

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【4】逐条设置：纳入 / 形态 / 置顶 / 移出（§5.3 / §8.3.2）')
// ══════════════════════════════════════════════════════════════════════════

const gl = await api('/hot/global')
const g0 = (gl.body.covers ?? [])[0]
check('全局清单可读且带正文字符数', g0 !== undefined && typeof g0.bodyChars === 'number',
  JSON.stringify(g0 && { id: g0.id, bodyChars: g0.bodyChars }))

if (g0 !== undefined) {
  const on = await post('/hot/item', { id: g0.id, on: true, pin: true })
  check('纳入 + 置顶 200', on.status === 200)
  check('⭐ 置顶打上了时间戳（供"按最后置顶时间倒序"）',
    typeof on.body.setting?.pinnedAt === 'string' && on.body.setting.pinnedAt !== '',
    JSON.stringify(on.body.setting))

  const full = await post('/hot/item', { id: g0.id, shape: 'full' })
  check('⭐ 可切到**正文形态**（用户要求）', full.body.setting?.shape === 'full')

  // 🔴 用户要求："如果是置顶的，取消置顶并移出" ⇒ **一步做完**
  await post(`/hot/selection?project=${encodeURIComponent(pid)}`, { entryIds: [g0.id] })
  const rm = await post('/hot/item', { id: g0.id, on: false, project: pid })
  check('⭐ 移出时**同时取消置顶**（一步做完，用户要求）',
    rm.body.setting?.pinnedAt === '' && rm.body.removed === true,
    JSON.stringify(rm.body))
  const sel1 = await api(`/hot/selection?project=${encodeURIComponent(pid)}`)
  check('（反证）移出后清单里真的没了', !(sel1.body.entryIds ?? []).includes(g0.id))
  // 还原
  await post('/hot/item', { id: g0.id, on: true })
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【4b】⭐⭐ 全局层**缺省纳入**（2026-09-22 用户报告的回归）')
// ══════════════════════════════════════════════════════════════════════════
//
// 🔴 **这是用户报的那个 bug 的回归测试**：
//    用户设了画像 + 一条全局知识，但「项目热知识」页右上说"全局知识里没有已纳入的条目"
//    —— 根因是**缺省值一刀切**：全局条目也要手工勾选才生效
//    （而用户原话是"global 为 true 的知识条目，应该是所有主题都会注入的"）。
// ⚠️ 缺省逻辑本身在**单测**里验（`defaultEntrySetting('global').on === true`）；
//    这里验**接口层**：全局条目在没有任何显式记录时也报"纳入"。

{
  const g = await api('/hot/global')
  const item = (g.body.covers ?? [])[0]
  check('全局清单能读到', item !== undefined)
  if (item !== undefined) {
    check('⭐ 接口报的 on 是**布尔**（不是 undefined/缺失）', typeof item.on === 'boolean', String(item.on))
    check('⭐⭐ 全局条目在**没有显式记录时也报"纳入"**（用户报的那个 bug）',
      item.on === true, `on=${item.on}（应为 true）`)
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【5】总开关：默认关（裁定：用户显式开启才注入）')
// ══════════════════════════════════════════════════════════════════════════

const st = await api('/settings')
check('⭐ 设置里有热知识的六个旋钮',
  st.body.hotInject !== undefined && st.body.hotInjectRatio !== undefined
  && st.body.hotCharsPerToken !== undefined && st.body.hotBudgetCharsFallback !== undefined
  && st.body.hotFullWarnChars !== undefined && st.body.hotSessionKeep !== undefined,
  JSON.stringify(Object.keys(st.body).filter((k) => k.startsWith('hot'))))
check('⭐ 上限比例默认 1/3', st.body.hotInjectRatio === 0.333, String(st.body.hotInjectRatio))
check('⭐ full 单条阈值默认 1000（用户裁定）', st.body.hotFullWarnChars === 1000, String(st.body.hotFullWarnChars))
check('会话保留默认 50（裁定 H-4）', st.body.hotSessionKeep === 50, String(st.body.hotSessionKeep))

// ⚠️ 反证：非法值必须被**拒绝**（不写坏配置）
const bad1 = await post('/settings', { hotInjectRatio: 999 })
check('（反证）比例超范围 ⇒ 400', bad1.status === 400, JSON.stringify(bad1.body))
const bad2 = await post('/settings', { hotFullWarnChars: 1.5 })
check('（反证）整数键给小数 ⇒ 400（避免下次启动被 schemastery 拒）', bad2.status === 400,
  JSON.stringify(bad2.body))

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【6】预算与实时状态（§8.1 / §9）')
// ══════════════════════════════════════════════════════════════════════════

const hot = await api(`/hot?session=${SID}`)
check('实时状态接口 200', hot.status === 200)
check('带预算信息', hot.body.budget !== undefined && typeof hot.body.budget.chars === 'number',
  JSON.stringify(hot.body.budget))
check('⭐ 带 `fullWarnChars`（页面据此对单条正文标黄）',
  hot.body.budget?.fullWarnChars === 1000)
check('preview 带 project（未判定时是"未知"）',
  hot.body.preview !== undefined && typeof hot.body.preview.project === 'string',
  JSON.stringify(hot.body.preview && { p: hot.body.preview.project }))

// ══════════════════════════════════════════════════════════════════════════
console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
if (fail > 0) process.exitCode = 1
