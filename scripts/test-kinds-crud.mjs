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
  check(b.length === 5, `5 条（实得 ${b.length}）`)
  check(b.every((d) => d.builtin === true), '全部标 builtin')
  check(b.filter((d) => d.reserved).map((d) => d.id).join() === 'history', '只有 history 是 reserved')
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
  check(mod.validateKinds(mk('history', { reserved: false })).some((e) => e.includes('保留项')), '摘掉 history 保留标记 ⇒ 报错')
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
  check(items.length === 5, `初始 5 条（实得 ${items.length}）`)
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
  check(/'\/kinds'/.test(api) && /'\/kind\/save'/.test(api) && /'\/kind\/delete'/.test(api), 'api.ts 三个端点都在')
  const index = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8')
  check(/\$\{API_BASE\}\/kind\/save/.test(index) && /\$\{API_BASE\}\/kind\/delete/.test(index), 'index.ts 两个新路由都注册了')
  check(/loadKinds\(\)/.test(index), '⭐ 启动时预热词表（漏了 ⇒ 新类型首次解析不被认）')
}

console.log(`\n═══ 知识类型词表：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
