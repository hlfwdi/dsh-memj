#!/usr/bin/env node
/**
 * **知识类型（`kind`）的可配置词表**的防线（决策 215，2026-10-05）。
 *
 * ── 这个套件守什么 ────────────────────────────────────────────────────────
 * 词表从**编译期常量**变成了**用户可改的文件**（`<库根>/kinds.md`），
 * 能力大了、**坏法也多了**。本套件盯四类：
 *
 *   ① **md 往返幂等** —— 渲染→解析→再渲染必须逐字相同（人手改过也要能读回来）；
 *   ② **三条内置保护** —— 不可删、不可改名、保留标记不可摘
 *      （存量 **569 条**知识都在用它们，改一条就有一批当场变非法值）；
 *   ③ **删除的引用保护** —— 有知识在用就拒绝删（不级联清空，不可逆的操作不做）；
 *   ④ **读侧立即生效** —— 保存后 `isEntryKind` 当场认新类型（不用重启）。
 *
 * ⚠️ 第 ④ 条最容易漏：写盘只是持久化，而**判定用的是进程内那份当前词表**。
 */
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const LIBDIR = process.env['MEMJ_LIBDIR'] ?? join(process.cwd(), 'lib')
const T = mkdtempSync(join(tmpdir(), 'memj-kinds-test-'))
for (const d of ['projects', 'entries', 'themes', 'prompts']) mkdirSync(join(T, d), { recursive: true })
process.env['MEMJ_DATA_DIR'] = T

const mod = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)

let pass = 0
let fail = 0
const check = (cond, name, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${extra ? '  ← ' + extra : ''}`) }
}

const API = '/plugins/dsh-memj/api'
const deps = { config: mod.DEFAULT_CONFIG, pluginId: 'dsh-memj', baseUrl: 'http://127.0.0.1:3100' }
const call = (method, path, body) =>
  mod.handleApi(deps, method, API + path, body === undefined ? '' : JSON.stringify(body), new URLSearchParams())

console.log('\n【1】内置默认表（与决策 214 的唯一词表同源）')
{
  const b = mod.builtinKindDefs()
  check(b.length === 6, `6 条（实得 ${b.length}）`)
  check(b.every((d) => d.builtin === true), '全部标 builtin')
  // ⭐⭐ **2026-10-13（「文档内提问」）：保留项从"没有"变成"恰好 chat 一个"**。
  //
  //    · 决策 223（2026-10-12）当时：`history` 开放给模型 ⇒ 保留项**为空**；
  //    · 现在：`chat` 启用它（插件自动生成，不给模型选也不给人手选）。
  //    ⚠️ `history` 的裁定**没被推翻** —— 它仍开放给模型（见下面那条）。
  check(
    b.filter((d) => d.reserved).map((d) => d.id).join(',') === 'chat',
    '⭐ 内置保留项恰好是 `chat`（2026-10-13 起）',
    b.filter((d) => d.reserved).map((d) => d.id).join(','),
  )
  check(b.find((d) => d.id === 'history')?.reserved === false,
    '⭐ `history` 仍【不是】保留项（决策 223 的裁定保持不变）')
  check(
    JSON.stringify(b.map((d) => d.id)) === JSON.stringify(mod.ENTRY_KINDS),
    'id 与 ENTRY_KINDS 逐字一致（没抄第二份）',
  )
}

console.log('\n【2】md 往返幂等（含多行书写规范）')
{
  const defs = [
    ...mod.builtinKindDefs(),
    { id: 'pitfall', label: 'pitfall（我方踩的坑）', when: '自己踩过、值得别人绕开', guide: '现象 → 根因 → 我改了什么', builtin: false, reserved: false },
    { id: 'perf', label: 'perf（性能数字）', when: '实测的耗时/内存', guide: '多行规范：\n- 写清环境\n- 写清方法', builtin: false, reserved: false },
  ]
  const t1 = mod.renderKindsDoc(defs)
  const back = mod.parseKindsDoc(t1)
  check(back !== undefined && back.length === defs.length, `往返条数一致（${back?.length}）`)
  check(t1 === mod.renderKindsDoc(back ?? []), '⭐ 两次渲染逐字相同（幂等）')
  for (const d of defs) {
    const b = back?.find((x) => x.id === d.id)
    check(b?.guide === d.guide, `${d.id}: 书写规范逐字往返（含多行）`, JSON.stringify(b?.guide))
    check(b?.builtin === d.builtin, `${d.id}: builtin 标记往返`)
    check(b?.reserved === d.reserved, `${d.id}: reserved 标记往返`)
  }
}

console.log('\n【3】宽容读（人手改歪也能读出来）')
{
  const messy = ['---', 'version: 1', '---', '', '## fact', '', '显示名：fact 事实', '什么时候用：是什么'].join('\n')
  const m = mod.parseKindsDoc(messy)
  check(m?.length === 1, `读到 1 条（实得 ${m?.length}）`)
  check(m?.[0]?.builtin === false, '手写的没标记 ⇒ 不误判成内置')
  check(mod.parseKindsDoc('随便什么都不是') === undefined, '完全不是类型表 ⇒ undefined（调用方回落内置）')
}

console.log('\n【4】三条内置保护')
{
  const defs = [...mod.builtinKindDefs(), { id: 'x1', label: 'X', when: 'w', guide: '', builtin: false, reserved: false }]
  const mk = (id, over) => defs.map((d) => (d.id === id ? { ...d, ...over } : d))
  check(mod.validateKinds(defs).length === 0, '完整表 ⇒ 无错误')
  check(mod.validateKinds(defs.filter((d) => d.id !== 'trap')).some((e) => e.includes('不能删除')), '删内置 ⇒ 报"不能删除"')
  check(mod.validateKinds(mk('fact', { label: '事实' })).some((e) => e.includes('显示名**不能改')), '改内置显示名 ⇒ 报错')
  // ⭐⭐ **2026-10-13：这一支从"空转"变成"真跑"了** —— `chat` 是保留项，
  //    所以"摘掉它的保留标记 ⇒ 报错"现在**有作用对象**（决策 223 之后它一度空转）。
  //    ⚠️ 同时保留下面的静态反证：那是防"有人把整段校验删掉"，
  //      而上面这条只证明"当前数据下它会报"—— 两者互补，不是重复。
  check(mod.validateKinds(mk('chat', { reserved: false })).some((e) => e.includes('保留')),
    '⭐⭐ 摘掉 `chat` 的保留标记 ⇒ 报错（保留项防线重新有作用对象）')
  // 🔴 **决策 223 之后它曾空转**（内置无保留项）⇒ 当时改用静态反证证明"防线还在"。
  //    ⭐ 判据（本项目一贯）：**空转的防线 ≠ 多余的防线** —— 触发条件是数据，不是代码。
  //    ⭐ 现在虽然真跑了，这条静态反证**仍留着**：它防的是"整段校验被删掉"，
  //      而那正是空转期最常见的动手方式（"反正走不到"）。
  {
    const src = readFileSync(join(process.cwd(), 'src', 'kinds.ts'), 'utf8')
    check(src.includes('不能把它的"保留"标记去掉'),
      '⭐⭐ 保留项的校验**仍在源码里**（防的是"整段被删掉"）')
    check(src.includes('if (b.reserved && !mine.reserved)'),
      '  ⇒ 触发条件那句也在')
  }
  check(mod.validateKinds([...defs, { ...defs[5], id: 'X1' }]).some((e) => e.includes('不合法')), '大写 id ⇒ 报不合法')
  check(mod.validateKinds([...defs, { ...defs[5], id: 'x1' }]).some((e) => e.includes('重复')), '重复 id ⇒ 报错')
  check(mod.validateKinds([{ ...defs[5], when: ' ' }]).some((e) => e.includes('什么时候用')), 'when 为空 ⇒ 报错')
  check(mod.validateKinds([]).length > 0, '空表 ⇒ 报错')
}

console.log('\n【5】删除的引用保护')
{
  const defs = [...mod.builtinKindDefs(), { id: 'x1', label: 'X', when: 'w', guide: '', builtin: false, reserved: false }]
  check(mod.deleteKindBlockReason('fact', defs, 0) !== '', '内置 ⇒ 拒绝（哪怕没人用）')
  check(mod.deleteKindBlockReason('x1', defs, 0) === '', '自定义 + 无引用 ⇒ 可删')
  check(mod.deleteKindBlockReason('x1', defs, 7).includes('7'), '自定义 + 有引用 ⇒ 拒绝且报数字')
  check(mod.deleteKindBlockReason('nope', defs, 0) !== '', 'id 不在表里 ⇒ 拒绝')
}

console.log('\n【6】端点：读 / 存 / 删 + 读侧立即生效')
{
  let r = await call('GET', '/kinds')
  check(r.status === 200 && r.body.ok === true, 'GET /kinds 200')
  const items = r.body.items
  // ⭐ **6 条**（2026-10-13 起加了 `chat`）—— 与 `test-kinds.mjs` 的【1】同源。
  check(items.length === 6, `初始 6 条（实得 ${items.length}）`)
  check(items.every((x) => x.builtin === true), '初始全部 builtin')
  check(items.every((x) => typeof x.count === 'number'), '每条都带 count')

  const added = { id: 'pitfall', label: 'pitfall（坑）', when: '踩过的', guide: '现象→根因', builtin: false, reserved: false }
  r = await call('POST', '/kind/save', { items: [...items, added] })
  check(r.status === 200 && r.body.ok === true, `加一条 ⇒ 200（${r.status}）`, JSON.stringify(r.body.errors))
  check(r.body.selectable.includes('pitfall'), '新类型进了 selectable（模型能选）')
  check(mod.isEntryKind('pitfall') === true, '⭐ 读侧**立即**认得它（不用重启）')
  check(readFileSync(join(T, 'kinds.md'), 'utf8').includes('## pitfall'), '落盘文件里有它')

  r = await call('POST', '/kind/save', { items: (await call('GET', '/kinds')).body.items.filter((x) => x.id !== 'fact') })
  check(r.status === 400, '删内置 ⇒ 400')
  check((r.body.errors ?? []).some((e) => e.includes('不能删除')), '  报"不能删除"')

  r = await call('POST', '/kind/delete', { id: 'pitfall' })
  check(r.status === 200, `无引用 ⇒ 删成功（${r.status}）`)
  check(mod.isEntryKind('pitfall') === false, '⭐ 删除后读侧也立即不认它了')

  r = await call('POST', '/kind/delete', { id: 'fact' })
  check(r.status === 400, '内置走 delete 端点 ⇒ 400')
}

console.log('\n【6b】⭐⭐ 单条端点 `/kind/upsert`（2026-10-05：设置页改成"每条各自保存"）')
{
  // ── ① 新增：找不到 id ⇒ **插到最前**（用户裁定"始终插最前"）──
  let r = await call('GET', '/kinds')
  const before = r.body.items.map((x) => x.id)
  check(before[0] === 'fact', `前置：当前第一条是 fact（实得 ${before[0]}）`)

  r = await call('POST', '/kind/upsert', {
    item: { id: 'zzz-new', label: 'Z', when: '新类型什么时候用', guide: '怎么写', builtin: false, reserved: false },
  })
  check(r.status === 200 && r.body.ok === true, `新增 ⇒ 200（${r.status}）`, JSON.stringify(r.body.errors))
  const afterAdd = r.body.items.map((x) => x.id)
  check(afterAdd[0] === 'zzz-new', `⭐ 新条**插到最前**（实得第一条 ${afterAdd[0]}）`)
  check(afterAdd.length === before.length + 1, '条数 +1')
  check(mod.isEntryKind('zzz-new') === true, '⭐ 读侧立即认得它（不用重启）')

  // ── ② 改一条：找到 id ⇒ **就地替换、位置不动** ──
  r = await call('POST', '/kind/upsert', {
    item: { id: 'zzz-new', label: 'Z改', when: '改过的判据', guide: '改过的骨架', builtin: false, reserved: false },
  })
  check(r.status === 200, `改 ⇒ 200（${r.status}）`)
  check(r.body.items.map((x) => x.id).join() === afterAdd.join(), '⭐ 位置**没动**（顺序不变）')
  const z = r.body.items.find((x) => x.id === 'zzz-new')
  check(z?.when === '改过的判据' && z?.guide === '改过的骨架', '⭐ 改的内容已生效')
  check(mod.selectableKindList().includes('zzz-new'), '可选值清单里有它')

  // ── ③ **只动这一条**：别条一概不碰（这正是"不提交整表"的意义）──
  const others = r.body.items.filter((x) => x.id !== 'zzz-new').map((x) => `${x.id}:${x.when}`)
  const expected = before.length
  check(others.length === expected, `别条仍是 ${expected} 条`)
  check(others.some((s) => s.startsWith('fact:')), '内置 fact 未被波及')

  // ── ④ 内置换 `when`/`guide`：**允许**（决策 217 用户裁定"可编辑但不可删除"）──
  r = await call('POST', '/kind/upsert', {
    item: { id: 'fact', label: 'fact（事实 / 接口）', when: '改过的内置判据', guide: '是什么 + 出处/依据', builtin: true, reserved: false },
  })
  check(r.status === 200, `改内置的 when/guide ⇒ 200（${r.status}）`, JSON.stringify(r.body.errors))
  check(r.body.items.find((x) => x.id === 'fact')?.when === '改过的内置判据', '⭐ 内置的 when 真的改了')

  // ── ⑤ 内置改**显示名** ⇒ 仍拒绝（身份锁死）──
  r = await call('POST', '/kind/upsert', {
    item: { id: 'fact', label: '换个名', when: 'x', guide: '', builtin: true, reserved: false },
  })
  check(r.status === 400, '改内置显示名 ⇒ 400')
  check((r.body.errors ?? []).some((e) => e.includes('显示名')), '  报"显示名不能改"')

  // ── ⑥ 形状与方法边界 ──
  check((await call('GET', '/kind/upsert')).status === 405, 'GET ⇒ 405')
  check((await call('POST', '/kind/upsert', {})).status === 400, '缺 item ⇒ 400')
  check((await call('POST', '/kind/upsert', { item: { label: 'x' } })).status === 400, 'item 缺 id ⇒ 400')
  check((await call('POST', '/kind/upsert', { item: { id: 'BAD大写' } })).status === 400, 'id 非法 ⇒ 400')

  // ── ⑦ 清理 ──
  r = await call('POST', '/kind/delete', { id: 'zzz-new' })
  check(r.status === 200, '清理测试类型 ⇒ 200')
}

console.log('\n【7】形状与方法的边界')
{
  check((await call('POST', '/kinds')).status === 405, 'POST /kinds ⇒ 405')
  check((await call('GET', '/kind/save')).status === 405, 'GET /kind/save ⇒ 405')
  check((await call('GET', '/kind/delete')).status === 405, 'GET /kind/delete ⇒ 405')
  check((await call('POST', '/kind/delete', {})).status === 400, 'delete 缺 id ⇒ 400')
  check((await call('POST', '/kind/save', { items: 'nope' })).status === 400, 'items 不是数组 ⇒ 400')
  check((await call('POST', '/kind/save', { items: [{ id: 'BAD' }] })).status === 400, '大写 id ⇒ 400')
}

console.log('\n【8】静态反证：工具 schema 的 enum 必须**每轮现算**')
{
  const tools = readFileSync(join(process.cwd(), 'src/tools.ts'), 'utf8')
  const literalEnums = tools.split('\n').filter((l) => /enum:\s*\[\s*'fact'/.test(l))
  check(literalEnums.length === 0, `tools.ts 无字面量 kind enum（实得 ${literalEnums.length}）`)
  check(!/enum: \[\.\.\.SELECTABLE_ENTRY_KINDS\]/.test(tools), '⭐ 已不用"注册时算一次"的常量 enum')
  check(/get:\s*\(\)\s*=>/.test(tools) && /kindParam/.test(tools), 'kindParam 用了 getter（每轮现算）')
  // ⚠️ 它是 `const kindParam = (…) => {…}`（**箭头函数**），不是 `function kindParam` ——
  //    我第一版按后者写，断言当场假失败。⭐ 判据：**断言里搜"定义形态"要用对语法**。
  check(/const\s+kindParam\s*=/.test(tools), 'kindParam 已定义')
  const api = readFileSync(join(process.cwd(), 'src/api.ts'), 'utf8')
  const index = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8')
  // ⚠️ 2026-10-05 起是**四个**端点（`/kind/upsert` 是新增的单条保存）。
  //    🔴 旧断言写"三个端点都在" ⇒ 加了 upsert 之后**它照样报绿**（只查存在、不查全不全）
  //       —— 正是 `5f063b9b`「校验范围过窄会比漏检更糟：它报绿」的形态。
  //    ✅ 改成**逐个点名**：以后再加端点，这里必须跟着加一行（否则新端点无人守）。
  for (const p of ['/kinds', '/kind/save', '/kind/upsert', '/kind/delete']) {
    check(api.includes("'" + p + "'"), `api.ts 有 ${p} 处理`)
    check(index.includes('${API_BASE}' + p), `index.ts 注册了 ${p}（漏了 ⇒ 落到 SPA 兜底返回 HTML）`)
  }
  check(/loadKinds\(\)/.test(index), '⭐ 启动时预热词表（漏了 ⇒ 新类型首次解析不被认）')
}


console.log('\n【9】⭐⭐ 保存前确认：**只在该破前缀缓存时弹**（2026-10-05 用户要求）')
{
  /**
   * 判据（本轮核实过）：
   *   · 只改 when / guide（id 与数量不变） ⇒ ✅ 不破（tools 侧清单**只有 id**）
   *   · 改 id / 增 / 删 ⇒ 🔴 破（可选值清单变 ⇒ tools 变 ⇒ node 0 重写）
   * ⭐ **只在该破时弹** —— 每次都弹 ⇒ 用户会无脑确认 ⇒ 弹窗等于不存在。
   *
   * ⚠️ 这段函数在前端（app.js），这里用 **vm 单测它的判定分支** ——
   *    因为"判据函数"最怕**看起来对、实际某一支是死代码**（我第一版就有）。
   */
  const vm = await import('node:vm')
  const js = readFileSync(join(process.cwd(), 'src', 'web', 'app.js'), 'utf8')
  const s = js.indexOf('/**\n * ⭐⭐⭐ **这次保存会不会破坏前缀缓存？**')
  const e = js.indexOf('/**\n * ⭐ **保存【这一条】**')
  check(s >= 0 && e > s, '在 app.js 里找到 kindChangeBreaksCache')
  const ctx = vm.createContext({ console, kindsState: { items: [], originals: new Map() } })
  vm.runInContext(js.slice(s, e) + '\n;globalThis.__f = kindChangeBreaksCache; globalThis.__st = kindsState', ctx)
  const f = ctx.__f
  const st = ctx.__st
  const mk = (id, when, guide) => ({ id, label: id, when, guide, builtin: true, reserved: false, count: 0 })

  st.originals = new Map([['fact', mk('fact', '旧', '旧')], ['trap', mk('trap', 'w', 'g')]])

  st.items = [mk('fact', '新判据', '新骨架'), mk('trap', 'w', 'g')]
  check(f(st.items[0]) === '', '只改 when/guide ⇒ **不弹**（本来就不破）')

  st.items = [mk('fact', '旧', '旧'), mk('trap', 'w', 'g')]
  check(f(st.items[0]) === '', '什么都没改 ⇒ 不弹')

  st.items = [mk('newone', 'w', 'g'), mk('fact', '旧', '旧'), mk('trap', 'w', 'g')]
  const rNew = f(st.items[0])
  check(rNew !== '' && rNew.includes('新增'), '新增 ⇒ 弹，且文案说「新增」')
  check(rNew.includes('前缀缓存'), '  文案点明「前缀缓存」')

  st.originals = new Map([['fact', mk('fact', 'w', 'g')], ['trap', mk('trap', 'w', 'g')]])
  st.items = [mk('fact2', 'w', 'g'), mk('trap', 'w', 'g')]
  const rRen = f(st.items[0])
  check(rRen.includes('改了一个类型的 id'), '⭐ 改 id ⇒ 弹，且文案说「改 id」（**不是"新增"**）')
  check(!rRen.includes('新增'), '  没误报成「新增」')

  // ⭐ 静态反证：删除那条路也必须有确认（我第一版漏了它）
  check(/async function deleteKind\(id\)[\s\S]{0,400}window\.confirm/.test(js),
    '⭐ 删除路径也有确认（删除同样破缓存，且不可逆）')
  check(/async function saveOneKind\(k, i\)[\s\S]{0,300}kindChangeBreaksCache/.test(js),
    '保存路径调了判据函数')
}

console.log(`\n═══ 知识类型词表：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
