#!/usr/bin/env node
/**
 * 知识类型词表（`kind`）的**收敛防线**（2026-10-05）。
 *
 * ── 这个套件守的是什么 ────────────────────────────────────────────────────
 * 收敛之前，这套词表在**七个地方各写了一遍**（`schema.ts` / `tools.ts` × 5 /
 * 前端下拉 × 3 / placeholder × 2 / 提示词 × 2），而其中**两处前端下拉互相不一致**
 * （一个带 `history` 不带"未分类"、另一个反过来）—— 抄多处的必然结果。
 *
 * ⇒ 本套件盯三件事：
 *   ① **唯一词表的形状**（id/label/when 齐、派生关系正确）；
 *   ② **保留项语义**（`history` 在"全部"里、但不在"可给模型选"里）；
 *   ③ 🔴🔴 **不再出现第二处抄写** —— 用**静态反证**扫源码，发现谁又手写了一份就报红。
 *
 * ⚠️ 第 ③ 条是本套件的**主要价值**：前两条无论如何都会跟着代码走，
 *    而"别人又抄了一份"是**只有断言才能发现**的那种腐化。
 */
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const LIBDIR = process.env['MEMJ_LIBDIR'] ?? join(process.cwd(), 'lib')
const lib = mkdtempSync(join(tmpdir(), 'memj-kinds-'))
for (const d of ['projects', 'entries', 'themes', 'prompts']) mkdirSync(join(lib, d), { recursive: true })
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)

let pass = 0
let fail = 0
const check = (cond, name, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${extra ? '  ← ' + extra : ''}`) }
}

console.log('\n【1】唯一词表的形状')
{
  const defs = mod.ENTRY_KIND_DEFS
  check(Array.isArray(defs), 'ENTRY_KIND_DEFS 是数组')
  check(defs.length === 5, `5 项（实得 ${defs.length}）`)
  check(defs.every((d) => d.id && d.label && d.when), '每项都有 id / label / when')
  check(
    JSON.stringify(mod.ENTRY_KINDS) === JSON.stringify(defs.map((d) => d.id)),
    'ENTRY_KINDS 由表派生 ⇒ 不可能与含义不一致',
  )
  // ⭐ 内置四值一个都不能少（存量 566 条都在用它们）
  for (const id of ['fact', 'trap', 'howto', 'decision']) {
    check(mod.ENTRY_KINDS.includes(id), `内置值 ${id} 仍在词表里`)
  }
}

console.log('\n【2】⭐⭐ 决策 223：`history` **已开放给模型**（不再是保留项）')
{
  // 🔴 **这一组原来是"保留项语义"** —— 决策 223（2026-10-12 用户裁定）把它**翻转了**：
  //    > *"他就把内容归档为 history 知识，而 history 知识本身是不参与检索的。
  //    >  就只有 history 知识不参与检索。如果归档为其他的话，那应该正常参与检索。"*
  //    ⇒ 归档从"工具自动做"改成"**模型按各节规范做**" ⇒ `history` **必须给模型选**。
  //    ⭐ 它的特殊性没消失，只是**换了承载方式**：
  //      以前靠 `reserved`（结构性禁止），现在靠 `when`/`guide`（语义上讲清"它不参与检索"）。
  check(mod.ENTRY_KINDS.includes('history'), 'history 仍在【全部】词表里')
  check(mod.SELECTABLE_ENTRY_KINDS.includes('history'),
    '⭐⭐ history **已进【可给模型选】**（归档交给模型做）')
  check(
    JSON.stringify(mod.SELECTABLE_ENTRY_KINDS) === JSON.stringify(['fact', 'trap', 'howto', 'decision', 'history']),
    `可选的恰好 5 个（实得 ${mod.SELECTABLE_ENTRY_KINDS.join(',')}）`,
  )
  // ⭐ 内置类型里**不再有保留项**（机制仍在，但当前无人使用）
  check(
    mod.ENTRY_KIND_DEFS.filter((d) => d.reserved === true).length === 0,
    '⭐ 内置类型里**没有**保留项了',
  )
  check(mod.currentReservedKinds().length === 0, '  ⇒ `currentReservedKinds()` 返回空数组')
  // 🔴 **但"它不参与检索"这件事必须被讲清楚** —— 那正是 `reserved` 曾经挡着的东西。
  const h = mod.ENTRY_KIND_DEFS.find((d) => d.id === 'history')
  check((h?.guide ?? '').includes('不参与检索'),
    '⭐⭐ `history` 的 `guide` **明写"不参与检索"**（防线从结构换成语义）', h?.guide)
  check((h?.when ?? '').trim() !== '' && (h?.when ?? '') !== '（工具自动生成，不手工填写）',
    '⭐ `when` 已改写成真正的"什么时候用它"（不再是"工具生成、别手填"）', h?.when)
}

console.log('\n【3】isEntryKind 行为（零行为变化 —— 收敛不该动它）')
{
  check(mod.isEntryKind('fact') === true, 'fact ⇒ true')
  check(mod.isEntryKind('history') === true, 'history ⇒ true（读侧仍认）')
  check(mod.isEntryKind('nope') === false, 'nope ⇒ false')
  check(mod.isEntryKind('') === false, '空串 ⇒ false')
  check(mod.isEntryKind(undefined) === false, 'undefined ⇒ false')
  check(mod.isEntryKind(123) === false, '数字 ⇒ false')
}

console.log('\n【4】两个派生文案助手（报错/描述共用一处）')
{
  // 🔴 决策 223：`history` 现在**也是**可选项 ⇒ 这两个文案里应当包含它。
  check(mod.selectableKindList() === 'fact / trap / howto / decision / history',
    `selectableKindList() → ${mod.selectableKindList()}`)
  check(mod.selectableKindList('、') === 'fact、trap、howto、decision、history', '自定义分隔符生效')
  const inline = mod.kindsInline()
  // 🔴 **锚点换过**（决策 217）：原先用 `includes('→')` 当"带含义"的判据 ——
  //    而 `→` 只是**骨架**里的箭头，骨架已从 `when` 搬到 `guide` ⇒ 锚点随之蒸发。
  //    ⭐ 这正是本项目记过的那笔账：**断言的锚点要选"被断言对象存在就必然出现"的词**，
  //      不能用"写这段文案时恰好用的那个字符"。
  //    现在改判"四个 id 都在，且每个 id 后面都跟了非空的说明"。
  const ids = ['fact', 'trap', 'howto', 'decision']
  check(ids.every((id) => inline.includes(id)), 'kindsInline() 含四个基础类型')
  check(
    ids.every((id) => new RegExp(`${id} \\S`).test(inline)),
    'kindsInline() 每个 id 后面都跟着说明（不是光秃秃一串 id）',
  )
  // ⭐ 决策 223 起 `history` **也在**（它现在给模型选）。
  check(inline.includes('history'), '⭐ kindsInline() **含 history**（它已开放给模型）')
  check(mod.entryKindWhen('trap') !== '', 'entryKindWhen("trap") 非空')
  check(mod.entryKindWhen('history') !== '', '⭐ entryKindWhen("history") 非空（它现在有正经的判据）')
  check(mod.entryKindWhen('不存在') === '', '未知 id ⇒ 空串（不抛）')
}

console.log('\n【5】🔴🔴 静态反证：不许再出现第二处抄写')
{
  const app = readFileSync(join(process.cwd(), 'src/web/app.js'), 'utf8')
  const html = readFileSync(join(process.cwd(), 'src/web/index.html'), 'utf8')
  const tools = readFileSync(join(process.cwd(), 'src/tools.ts'), 'utf8')

  // ① 前端不能有硬编码的 kind 标签数组（收敛前就是它）
  check(!/\['fact', 'fact（事实/.test(app), 'app.js 无硬编码的 kind 标签数组')
  // ② HTML 不能手写 kind <option>（收敛前有两份，且互相不一致）
  const htmlKindOpts = html
    .split('\n')
    .filter((l) => /<option value="(fact|trap|howto|decision|history)"/.test(l))
  check(htmlKindOpts.length === 0, `index.html 无手写的 kind <option>（实得 ${htmlKindOpts.length} 行）`)
  // ③ 工具 schema 的 enum 不能写字面量数组（收敛前抄了 5 遍）
  const literalEnums = tools
    .split('\n')
    .filter((l) => /enum:\s*\[\s*'fact'/.test(l))
  check(literalEnums.length === 0, `tools.ts 无字面量 kind enum（实得 ${literalEnums.length} 处）`)
  // ④ 前端确实**从 API 取**（而不是"删了硬编码、改从别处抄"）
  check(/getJson\('\/kinds'\)/.test(app), 'app.js 调 /kinds')
  check(/await loadKinds\(\)/.test(app), 'load() 里真的调了 loadKinds()')
  check(/function fillKindFilters\(/.test(app), 'app.js 有 fillKindFilters()')
  // ⑥ 🔴 **失败判据必须是"拿到了数组"，不是"没抛错"**（2026-10-05 实测踩到）
  //    根因：本项目的 `getJson` 在 JSON 解析失败时**静默返回 `{}`**、
  //    且 HTTP 200 时不抛错 ⇒ 路由没注册时（返回 HTML）它会"成功"返回空对象，
  //    于是我第一版把 `kindsLoaded` 置成了 `true` —— **那个字段在撒谎**。
  const loadFn = /async function loadKinds\(\)[\s\S]{0,900}?\n}/.exec(app)?.[0] ?? ''
  check(
    /Array\.isArray\(r\.items\)/.test(loadFn),
    'loadKinds() 校验了期待字段（Array.isArray(r.items)）—— 不只看有没有抛错',
  )
  check(
    /throw new Error/.test(loadFn),
    'loadKinds() 在字段缺失时**主动抛**（否则 kindsLoaded 会撒谎成 true）',
  )
  // ⑤ 服务端确实**暴露了**那个端点
  const api = readFileSync(join(process.cwd(), 'src/api.ts'), 'utf8')
  check(/'\/kinds'/.test(api), 'api.ts 里有 /kinds 处理')
  const index = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8')
  check(/\$\{API_BASE\}\/kinds/.test(index), 'index.ts 里注册了 /kinds 路由（漏了会返回 HTML）')
}

console.log(`\n═══ 知识类型词表：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
