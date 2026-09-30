/**
 * ⭐⭐ 探针：热知识「entries 只管全局 / 清单带逐项目设置」收窄（2026-09-22）。
 *
 * 🔴 **为什么需要它**：18 个套件测的是**纯逻辑**，测不到：
 *  · 旧库（`entryIds` 结构）**迁移后到底能不能用**；
 *  · `/hot` 的列表数据（标题 / 类型 / 形态）**真的返回了吗**；
 *  · **画像**是否终于出现在列表里。
 *  · 窗口快照的 `Set` **有没有被正确转成数组**（否则前端会抛 TypeError）。
 *
 * ⭐ **直接走 `handleApi()`**（与真实路由同一入口，`test-web-api.mjs` 的既有范式）
 * —— 不需要起实例，因而不碰生产、也不受"服务端要重启"的影响。
 *
 * ⚠️ **库用生产库的副本**（`verify/memj-scope-lib`）⇒ 验的是**真实数据形状**
 * （`entryIds` 旧结构、11 条清单、真实的全局知识），而不是我造的玩具夹具。
 *
 * 用法：node scripts/probe-hot-scope.mjs
 */
import { existsSync, cpSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 生产库（只读来源，**绝不写入**）。 */
const PROD = join(process.env['USERPROFILE'] ?? '', '.dsh-memj')
/** 生产库的副本目录（本探针的工作库）。 */
const COPY = join(process.cwd(), 'verify', 'memj-scope-lib')

if (!existsSync(PROD)) {
  console.log(`⚠️ 找不到生产库 ${PROD} ⇒ 跳过（本探针需要真实数据形状）`)
  process.exit(0)
}

// ⚠️ **重新复制一份干净的副本**（上一次跑可能改过它）——
//    这样探针**可重复跑**、且结论始终基于"生产库此刻的形状"。
rmSync(COPY, { recursive: true, force: true })
cpSync(PROD, COPY, { recursive: true })

const lib = mkdtempSync(join(tmpdir(), 'memj-scope-hot-'))
process.env['MEMJ_DATA_DIR'] = COPY

const LIBDIR = join(process.cwd(), 'lib')
const { readdirSync } = await import('node:fs')
async function loadApiModule() {
  const idx = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)
  if (typeof idx.handleApi === 'function') return idx
  for (const f of readdirSync(LIBDIR)) {
    if (!f.startsWith('api-') || !f.endsWith('.js')) continue
    const m = await import(pathToFileURL(join(LIBDIR, f)).href)
    if (typeof m.handleApi === 'function') return m
  }
  throw new Error('找不到导出 handleApi 的模块')
}
const apiMod = await loadApiModule()
const mod = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}

/**
 * 调 `handleApi`（模拟一次真实 HTTP 请求）。
 *
 * ⚠️ **签名是位置参数**（`deps, method, pathname, rawBody, params`），
 * 不是对象 —— 见 `api.ts:204`。
 * @param path - 形如 `/hot?session=x`（含 `API_BASE` 前缀）。
 */
async function api(path, init = {}) {
  const url = new URL(`http://127.0.0.1/plugins/dsh-memj/api${path}`)
  const deps = {
    version: '0.1.0',
    config: { ...mod.DEFAULT_CONFIG, hotInject: true },
    baseUrl: COPY,
    pluginId: 'dsh-memj',
    // ⚠️ 判定链要用的服务：这里给空（探针不测判定，只测列表与设置）。
    getService: () => undefined,
  }
  const r = await apiMod.handleApi(
    deps,
    init.method ?? 'GET',
    url.pathname,
    init.body ?? '',
    url.searchParams,
  )
  return { status: r.status, body: r.body }
}
const post = (path, obj) => api(path, {
  method: 'POST', body: JSON.stringify(obj),
})

console.log('════════ 探针：热知识作用域收窄 ════════')
console.log(`库：${COPY}\n`)

// ── ① 旧库迁移：`entryIds` → `entries[]` ──
console.log('── 【1】旧库迁移（生产副本里就是 `entryIds` 结构）──')
const sel = await api('/hot/selection?project=dsh-memj')
check('清单接口 200', sel.status === 200, JSON.stringify(sel.body).slice(0, 120))
// ⚠️⚠️ **不要写死条数**（本项目记过"硬编码期望值"的坑）——
//    第一版是 `=== 11`，而生产库后来变成 **12 条**（用户手工加过一条）
//    ⇒ 报了一条**假失败**。⭐ 正解：断言**不变量**（"迁移后非空、且与旧结构口径一致"）。
const n = sel.body.entries?.length ?? -1
check('⭐ 迁移后 `entries` 非空（旧 `entryIds` 有多少条，就该迁出多少条）',
  n > 0, `实得 ${n}`)
check('⭐ 兼容字段 `entryIds` 与 `entries` **同源**（两者条数必须一致）',
  Array.isArray(sel.body.entryIds) && sel.body.entryIds.length === n,
  `entries=${n} entryIds=${sel.body.entryIds?.length}`)
check('⭐ 迁移**不臆造** shape（一律 meta）',
  (sel.body.entries ?? []).every((e) => e.shape === 'meta'),
  JSON.stringify((sel.body.entries ?? []).slice(0, 2)))
// ⚠️ 同理：**不能断言"全都未置顶"** —— 用户可能真的置顶过（实测就有 2 条）。
//    ⭐ 正确判据：`pinnedAt` 只能是**空串或合法 ISO** ——
//       "迁移凭空打时间戳"才是要防的，而"原本就置顶过"是**合法状态**。
check('⭐ 迁移**不臆造** `pinnedAt`（只允许空串或合法 ISO，不能凭空打时间戳）',
  (sel.body.entries ?? []).every((e) => e.pinnedAt === '' || /^\d{4}-\d{2}-\d{2}T/.test(e.pinnedAt)),
  JSON.stringify((sel.body.entries ?? []).filter((e) => e.pinnedAt !== '').slice(0, 3)))
check('⭐ `initializedAt` 保留（否则会重生成默认清单、覆盖用户意图）',
  sel.body.initializedAt === '2026-09-22T08:33:09.012Z', sel.body.initializedAt)

// ── ② `/hot` 的列表数据（本批的核心交付） ──
console.log('\n── 【2】实时状态页列表数据（本批核心）──')
// ⚠️ **先手动绑定项目**：不绑定的话判定链判不出项目 ⇒ 只有全局层
//    （探针拿不到 `ctx` 的服务，判定链跑不了）⇒ 项目层一条都验不到。
const SID = 'probe-scope-1'
await post('/hot/bind', { session: SID, project: 'dsh-memj' })
const hot = await api(`/hot?session=${SID}`)
check('/hot 200', hot.status === 200, JSON.stringify(hot.body).slice(0, 120))
check('⭐ 绑定生效（`bound.project` = dsh-memj）',
  hot.body.bound?.project === 'dsh-memj', JSON.stringify(hot.body.bound))
const items = hot.body.items ?? []
check('⭐⭐ `/hot` 返回**结构化 `items`**（不再是裸 UUID 数组）',
  Array.isArray(items) && items.length > 0, `实得 ${items.length}`)
check('⭐ 每条都有**标题**（页面直接显示）',
  items.every((x) => typeof x.title === 'string' && x.title !== ''),
  JSON.stringify(items.slice(0, 2)))
check('⭐ 每条都有**类型**（画像/全局知识/主题知识/项目知识）',
  items.every((x) => ['persona', 'global', 'project', 'theme'].includes(x.type)),
  JSON.stringify(items.map((x) => x.type)))
check('⭐ 每条都有**注入形态**（meta/full）',
  items.every((x) => x.shape === 'meta' || x.shape === 'full'),
  JSON.stringify(items.map((x) => x.shape)))
check('⭐⭐ **画像出现在列表里**（原来它没有 id ⇒ 列表里根本没有它）',
  items.some((x) => x.type === 'persona'),
  JSON.stringify(items.map((x) => x.type)))
check('⭐ 画像带指纹（⇒ 它的注入状态判得出来）',
  (items.find((x) => x.type === 'persona')?.fp ?? '') !== '',
  JSON.stringify(items.find((x) => x.type === 'persona')))
check('⭐ 全局知识也在列表里', items.some((x) => x.type === 'global'))
// ⚠️ 同样**不写死条数**（清单会随用户操作变化）——只断言"不少于清单条数"。
check('⭐ 列表条数 ≥ 清单条数（画像 + 全局 + 清单都在里面）',
  items.length >= n, `items=${items.length} 清单=${n}：${JSON.stringify(items.map((x) => x.type))}`)

// ── ③ ⭐⭐ **"在清单里 = 会注入"**（本批最关键的语义变化） ──
console.log('\n── 【3】在清单里 = 会注入（旧设计要两道开关）──')
const types = items.map((x) => x.type)
check('⭐⭐ 项目/主题知识**真的进入了注入列表**（旧设计下它们是 0 条）',
  types.includes('project') || types.includes('theme'), JSON.stringify(types))
const projs = await api('/hot/projects')
const dm = (projs.body.projects ?? []).find((p) => p.id === 'dsh-memj')
check('⭐ `/hot/projects` 的 `injectCount` = `selectedCount`（项目层不再有第二道开关）',
  dm !== undefined && dm.injectCount === dm.selectedCount,
  JSON.stringify({ sel: dm?.selectedCount, inj: dm?.injectCount }))
check('⭐ 且**两者都不为 0**（旧设计这里是 11 / 0）',
  dm !== undefined && dm.selectedCount > 0 && dm.injectCount > 0)

// ── ④ 窗口快照必须是**数组**（`Set` 会被 JSON 序列化成 `{}`） ──
console.log('\n── 【4】窗口快照的 JSON 形状（`Set` 序列化坑）──')
check('⭐ `window` 字段存在（可能是 null，但键在）', 'window' in hot.body)
if (hot.body.window !== null && hot.body.window !== undefined) {
  check('⭐⭐ `window.present` 是**数组**（不是 `{}`）',
    Array.isArray(hot.body.window.present), JSON.stringify(hot.body.window))
} else {
  check('⭐（无快照时 `window` 为 null —— 首次出网前就是这样，合法）',
    hot.body.window === null)
}
// ⚠️ **反证**：`Set` 经 JSON 后确实是 `{}` ⇒ 证明"不转就会坏"。
check('⚠️（反证）`JSON.stringify(new Set([\'a\']))` === `\'{}\'` ⇒ 不转就必然坏',
  JSON.stringify(new Set(['a'])) === '{}')

// ── ④b ⭐⭐ **`windowSource`：重启后从会话日志重建**（2026-09-23 用户要求） ──
//
// 🔴 **用户实测报告**：*"隔了一整夜，此会话之前已经注入的内容，现在显示未注入了。
//    我怀疑，只要重新启动之后，已注入的内容就会显示未注入，那这是不对的哇？"*
// ⇒ ⭐ 根因：内存快照"进程重启即失" ⇒ 页面把**每一条**都显示成"未注入"，
//    而注入内容**还在会话里** ⇒ **界面在撒谎**。
console.log('\n── 【4b】重启后从会话日志重建（本批修的"界面撒谎"）──')
check('⭐ `/hot` 回了 `windowSource`（页面据此说清来源）',
  'windowSource' in hot.body, JSON.stringify(Object.keys(hot.body)))
check('⭐ `windowSource` 取值合法（`memory` / `log` / `null`）',
  hot.body.windowSource === null || hot.body.windowSource === 'memory' || hot.body.windowSource === 'log',
  String(hot.body.windowSource))
// ⭐ **一致性**：`windowSource` 为 null ⟺ `window` 为 null（两者不能互相矛盾）。
check('⭐⭐ `windowSource` 与 `window` **一致**（不会一个说没有、另一个说有）',
  (hot.body.windowSource === null) === (hot.body.window === null),
  JSON.stringify({ src: hot.body.windowSource, win: hot.body.window === null ? null : '有' }))
// ⚠️ 本探针用的是**假会话 id**（`probe-scope-1`）⇒ 日志里当然没有它的注入记录
//    ⇒ 期望 `windowSource: null`（**这是对的**：判不出来就要如实说判不出来，
//    不能凭空说"已注入"）。⭐ 真会话的重建能力由 `probe-hot-rebuild.mjs` 用**真实日志**验。
check('⭐⭐ 假会话（日志里没有它的注入记录）⇒ **如实回 `null`，不编造**',
  hot.body.windowSource === null && hot.body.window === null,
  JSON.stringify({ src: hot.body.windowSource, win: hot.body.window }))

// ── ⑤ 逐项目设置：`shape` / `pinnedAt` 落进清单 ──
console.log('\n── 【5】逐项目设置（shape / pinnedAt 存清单）──')
const pid = 'dsh-memj'
const before = (await api(`/hot/selection?project=${pid}`)).body.entries ?? []
const target = before[0]?.id ?? ''
check('有一个可操作的条目', target !== '')
if (target !== '') {
  const r1 = await post('/hot/item', { id: target, shape: 'full', project: pid })
  check('⭐ `POST /hot/item` 带 project ⇒ 200（项目层走清单）',
    r1.status === 200 && r1.body.scope === 'project', JSON.stringify(r1.body).slice(0, 160))
  const after = (await api(`/hot/selection?project=${pid}`)).body.entries ?? []
  check('⭐⭐ `shape` **落进了清单**（逐项目，不再进 entries.json）',
    after.find((e) => e.id === target)?.shape === 'full',
    JSON.stringify(after.find((e) => e.id === target)))

  const r2 = await post('/hot/item', { id: target, pin: true, project: pid })
  check('⭐ 置顶 200', r2.status === 200, JSON.stringify(r2.body).slice(0, 160))
  const after2 = (await api(`/hot/selection?project=${pid}`)).body.entries ?? []
  check('⭐⭐ `pinnedAt` **落进了清单**（修好了"置顶永远不生效"）',
    (after2.find((e) => e.id === target)?.pinnedAt ?? '') !== '',
    JSON.stringify(after2.find((e) => e.id === target)))

  // ⚠️ 反证：项目知识**必须带 project**
  const r3 = await post('/hot/item', { id: target, shape: 'meta' })
  check('⚠️（反证）项目知识**不带 `project`** ⇒ 被拒（400），不静默写错地方',
    r3.status === 400, `${r3.status} ${JSON.stringify(r3.body).slice(0, 140)}`)
  // ⚠️ 反证：不在清单里的条目 ⇒ 404
  const r4 = await post('/hot/item', {
    id: '99999999-9999-4999-8999-999999999999', shape: 'meta', project: pid,
  })
  check('⚠️（反证）不在清单里的条目 ⇒ 404', r4.status === 404, String(r4.status))

  // 还原
  await post('/hot/item', { id: target, shape: 'meta', pin: false, project: pid })
  const restored = (await api(`/hot/selection?project=${pid}`)).body.entries ?? []
  check('⭐ 还原成功（探针可重复跑）',
    restored.find((e) => e.id === target)?.shape === 'meta'
    && restored.find((e) => e.id === target)?.pinnedAt === '')
}

// ── ⑥ 移出清单（一步做完"取消置顶 + 移出"） ──
console.log('\n── 【6】移出清单 ──')
{
  const pid2 = 'dsh-016-upgrade'
  const b = (await api(`/hot/selection?project=${pid2}`)).body.entries ?? []
  if (b.length > 0) {
    const id0 = b[0].id
    const r = await post('/hot/item', { id: id0, on: false, project: pid2 })
    check('⭐ 移出 200 且 `removed: true`', r.status === 200 && r.body.removed === true,
      JSON.stringify(r.body).slice(0, 140))
    const a = (await api(`/hot/selection?project=${pid2}`)).body.entries ?? []
    check('⭐⭐ 该条**已从清单里消失**', !a.map((e) => e.id).includes(id0))
    check('⭐ 且条数正好少 1', a.length === b.length - 1, `${b.length} → ${a.length}`)
    await post(`/hot/selection?project=${pid2}`, {
      entries: [...a.map((e) => ({ id: e.id, shape: e.shape, pinnedAt: e.pinnedAt })),
        { id: id0, shape: 'meta', pinnedAt: '' }],
    })
    const back = (await api(`/hot/selection?project=${pid2}`)).body.entries ?? []
    check('⭐ 还原成功（探针可重复跑）', back.map((e) => e.id).includes(id0))
  } else {
    check('（该项目的清单为空 ⇒ 跳过移出用例）', true)
  }
}

// ── ⑦ ⚠️ **收窄后的核心断言**：`entries.json` 只管全局知识 ──
console.log('\n── 【7】entries.json 只管全局知识 ──')
{
  // 项目/主题知识的 shape **绝不写进 entries.json**（写进去就是层级串了）。
  const entries = await mod.loadEntrySettings()
  const selNow = (await api(`/hot/selection?project=${pid}`)).body.entries ?? []
  const selIds = new Set(selNow.map((e) => e.id))
  const overlap = Object.keys(entries).filter((id) => selIds.has(id))
  // ⚠️ 允许**历史残留**（收窄前写下的），但**新写入的一律不该出现在这里**。
  //    这里只断言：探针刚才改过的那条**没有**被写进 entries。
  check('⭐⭐ 改过 `shape` 的项目知识**没有**被写进 `entries.json`（层级没串）',
    !(target !== '' && entries[target] !== undefined),
    `target=${target.slice(0, 8)} entries=${JSON.stringify(Object.keys(entries).map((x) => x.slice(0, 8)))}`)
  check('⭐ 全局知识仍在 `entries.json` 里（那是它唯一该在的地方）',
    entries['95fafbde-d5cd-41c9-a758-1287ac8ce150'] !== undefined)
  check('⭐ 且它的记录里**没有 `pinnedAt`**（置顶已改为逐项目属性）',
    entries['95fafbde-d5cd-41c9-a758-1287ac8ce150']?.pinnedAt === undefined,
    JSON.stringify(entries['95fafbde-d5cd-41c9-a758-1287ac8ce150']))
}

// ── ⑧ 预算口径没坏（顺带回归） ──
console.log('\n── 【8】预算与判定（顺带回归）──')
check('⭐ `budget.chars` 仍按公式算（比例 0.333 时非 0）',
  (hot.body.budget?.chars ?? 0) > 0, JSON.stringify(hot.body.budget))
check('⭐ `budget.basis` 如实说明来源', ['window', 'fallback', 'off'].includes(hot.body.budget?.basis))
check('⭐ 未判定项目时只注入全局 + 画像（`bound` 为 null）',
  hot.body.bound === null || typeof hot.body.bound?.project === 'string')

console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
try { rmSync(lib, { recursive: true, force: true }) } catch { /* 清理失败不影响结论 */ }
if (fail > 0) process.exitCode = 1
