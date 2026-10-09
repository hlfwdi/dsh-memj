/**
 * ⭐⭐ **回执不得写死"交接文档节数/节名"**（2026-10-05，真实隐患修复）。
 *
 * ── 它防的是什么 ──────────────────────────────────────────────────────────
 * 回执里曾写死"（连同**七节**骨架一起建立）"—— 而节名由**该项目的模板**决定，
 * 默认模板是六节、自定义模板完全不同 ⇒ **写死等于给模型一个假事实**。
 * ⚠️ 本项目真实事故：模型照写死的清单去猜节名，**把一份文档的结构写坏**。
 * ⭐ 判据：**回执里凡"节数/节名"一律现取自本次真正用的那份模板。**
 *
 * ── 三条断言 ──────────────────────────────────────────────────────────────
 *  1. 默认模板新建 ⇒ 现报"6 节"+ 真实节名，且**不含"七节"**；
 *  2. 自定义模板新建 ⇒ 报**该模板**的节数与节名，**不混进默认六节**；
 *  3. ⭐ **改了磁盘上的 `default.md` 之后 ⇒ 回执跟着变**
 *     （证明它读的是**盘上那份**，而不是内置常量 —— 那正是"默认模板可编辑"的意义）。
 *
 * ⚠️ 必须在 `node scripts/build.mjs` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-receipt-no-hardcode.mjs
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-receipt-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const CFG = mod.DEFAULT_CONFIG

let pass = 0
let fail = 0
function check(name, ok, extra = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${extra !== '' ? `　← ${extra}` : ''}`) }
}

console.log('\n【1】默认模板新建 ⇒ 回执现报真实节清单（不写死）')
{
  const r = await mod.runHandoff(
    { project: 'rc-def', projectDesc: 'rc；当 x 时读它。', doc: '## 目标\n\nG\n', confirmCreate: true },
    { sessionId: 's1', config: CFG, turn: 1 },
  )
  const first = r.message.split('\n')[0] ?? ''
  check('handoff 成功', r.ok, r.ok ? '' : r.message.slice(0, 200))
  check('⭐ 不含"七节"（曾经的写死值）', !first.includes('七节'))
  check('⭐ 现报"6 节"', first.includes('6 节'))
  check('⭐ 现报真实节名（含「当前进度」「下一步」）',
    first.includes('当前进度') && first.includes('下一步'))
}

console.log('\n【2】自定义模板 ⇒ 报该模板的节，不混默认六节')
{
  await mod.saveTemplate({
    version: 1, id: 'rc-tpl', title: 'RC',
    sections: [
      { name: '研究目标', desc: 'A' },
      { name: '证据链', desc: 'B' },
      { name: '估值', desc: 'C' },
    ],
  })
  const r = await mod.runHandoff(
    {
      project: 'rc-custom', projectDesc: 'rc2；当 x 时读它。',
      doc: '## 研究目标\n\nA\n', template: 'rc-tpl', confirmCreate: true,
    },
    { sessionId: 's2', config: CFG, turn: 1 },
  )
  const first = r.message.split('\n')[0] ?? ''
  check('handoff 成功', r.ok, r.ok ? '' : r.message.slice(0, 200))
  check('⭐ 报出模板 id', first.includes('rc-tpl'))
  check('⭐ 报出真实节数 3', first.includes('3 节'))
  check('⭐ 报出自定义节名', first.includes('证据链') && first.includes('估值'))
  check('⭐⭐ 没有混进默认六节的节名', !first.includes('当前进度'))
}

console.log('\n【3】⭐ 改了 default.md ⇒ 回执跟着变（证明读盘优先）')
{
  await mod.saveTemplate({
    version: 1, id: 'default', title: '改过的默认',
    sections: [{ name: '甲节', desc: 'x' }, { name: '乙节', desc: 'y' }],
  })
  const r = await mod.runHandoff(
    { project: 'rc-def2', projectDesc: 'rc3；当 x 时读它。', doc: '## 甲节\n\nA\n', confirmCreate: true },
    { sessionId: 's3', config: CFG, turn: 1 },
  )
  const first = r.message.split('\n')[0] ?? ''
  check('handoff 成功', r.ok, r.ok ? '' : r.message.slice(0, 200))
  check('⭐ 报出改后的 2 节', first.includes('2 节'))
  check('⭐ 报出用户改过的节名', first.includes('甲节') && first.includes('乙节'))
  check('⭐⭐ 没有回落成内置六节（读盘优先生效）', !first.includes('当前进度'))
}

console.log('\n【4】静态反证：源码里不得再有"七节骨架"这类写死')
{
  const src = readFileSync(join(process.cwd(), 'src', 'handoff.ts'), 'utf8')
  // ⚠️ 只查**模型可见的模板串**，不查注释（注释里解释历史是允许的）。
  const visible = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  check('⭐ 代码行里没有"七节骨架"', !visible.includes('七节骨架'))
  check('⭐ 代码行里没有"连同七节"', !visible.includes('连同七节'))
}

console.log('\n【5】⭐⭐ 决策 223 的"归档提醒"判据 —— 不得再恒真（2026-10-09 修）')
{
  // ── 为什么单独立这一组 ─────────────────────────────────────────────────
  // 旧判据是 `sections.every(s => s.truncate !== true)`，而 `truncate` 字段
  // **已从 TemplateSection 删除** ⇒ 恒为 undefined ⇒ **every 恒为 true**
  // ⇒ 每一份新建项目的回执都说那句"文档不会自动瘦身"，而它说的是**已废除的机制**。
  // ⭐ 本组的关键是**反证臂**：必须能证明"写了归档规则的模板 ⇒ 不提这句"，
  //    否则改动只是把恒真从一处搬到另一处。
  const NO_TRUNC_MARK = '不会自动瘦身'

  // ① 真事实：默认模板的「当前进度」规范里**写了**归档规则 ⇒ 不该提这句
  await mod.saveTemplate({
    version: 1, id: 'default', title: '默认（六节）',
    sections: mod.defaultTemplate().sections,
  })
  const r1 = await mod.runHandoff(
    { project: 'rc-arch1', projectDesc: 'rc4；当 x 时读它。', doc: '## 目标\n\nG\n', confirmCreate: true },
    { sessionId: 's4', config: CFG, turn: 1 },
  )
  check('handoff 成功（默认模板）', r1.ok, r1.ok ? '' : r1.message.slice(0, 200))
  check('⭐⭐ 默认模板**写了**归档规则 ⇒ **不提**那句提醒',
    !r1.message.includes(NO_TRUNC_MARK),
    '⚠️ 提了就说明判据又恒真了')

  // ② 反证臂：一份**没写**归档规则的模板 ⇒ 必须提
  await mod.saveTemplate({
    version: 1, id: 'rc-noarch', title: '没写归档',
    sections: [{ name: '研究目标', desc: 'A' }, { name: '估值', desc: 'C' }],
  })
  const r2 = await mod.runHandoff(
    {
      project: 'rc-arch2', projectDesc: 'rc5；当 x 时读它。',
      doc: '## 研究目标\n\nA\n', template: 'rc-noarch', confirmCreate: true,
    },
    { sessionId: 's5', config: CFG, turn: 1 },
  )
  check('handoff 成功（无归档规则）', r2.ok, r2.ok ? '' : r2.message.slice(0, 200))
  check('⭐⭐ **没写**归档规则 ⇒ **要提**这句（反证臂）',
    r2.message.includes(NO_TRUNC_MARK),
    '⚠️ 不提就说明这条提醒成了死代码')

  // ③ 静态反证：源码里不许再读那个已废字段当判据
  // 🔴🔴 **必须剥注释再判**（2026-10-09 本脚本第一版就踩了）：
  //    我改这几处时，注释里**逐字引用了旧代码**（"旧判据是 `s.truncate !== true`…"）
  //    ⇒ 全文搜会**命中我自己的说明** ⇒ 两条假红。
  //    ⭐ 这与决策 223 那次记下的判据**完全同族**：
  //    **判"某东西不该出现"必须指明范围** —— 注释不是"发出去的行为"。
  //    （同族第三次：本项目已在 223 与本批各踩一次。）
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const handoffCode = stripComments(readFileSync(join(process.cwd(), 'src', 'handoff.ts'), 'utf8'))
  check('⛔ `handoff.ts` 代码里不再有 `s.truncate !== true` 那种恒真判据',
    !handoffCode.includes('truncate !== true'))
  check('⛔ 代码里也不再从 `appliedTemplate` 上取 `truncate`',
    !/appliedTemplate[\s\S]{0,120}truncate/.test(handoffCode))

  // ④ 参数 schema 里不该留"传了也不生效"的字段
  const toolsCode = stripComments(readFileSync(join(process.cwd(), 'src', 'tools.ts'), 'utf8'))
  check('⛔ `memj_template` 的参数 schema 里不再有 `truncate`',
    !/truncate:\s*\{\s*\n\s*type:\s*'boolean'/.test(toolsCode))
  check('⭐ `docOp` 的说明改成"瘦身由你按规范执行"（不再是"不用你做"）',
    toolsCode.includes('文档瘦身/归档由你按各节规范执行') &&
      !toolsCode.includes('瘦身不用你做'))
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 回执不写死节数：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
