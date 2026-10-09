/**
 * 验收：`memj_handoff` 的 `template` 参数**已暴露且真的生效**。
 *
 * 🔴🔴 为什么必须有这个脚本（本次修的就是"没机制会发现"这类缺口）：
 *    `template` 在 `HandoffRequest` 与 `runHandoff` 里一直都在，
 *    **只是没进 schema** ⇒ 模型看不到、也就无从挑模板。
 *    而**没有任何既有检查会发现这件事**：`prompt-ledger.mjs` 只对账**工具名**、
 *    `test-prompt-split.mjs` 只查描述里"关键规范有没有出现"。
 *    ⇒ 判据（本项目可迁移的那条）：**"文档声称存在的能力"必须有检查盯着它真存在**。
 *
 * 本脚本盯三件事：
 *   【1】schema 里有 `template`（回归闸门：再被删掉就报红）
 *   【2】真调一次：传 `template` 能按那份模板建出对应节名（端到端，不只查 schema）
 *   【3】传不存在的 id ⇒ **报错并列出可用**，不静默回落成默认模板
 *
 * 🔴🔴 **上一版这个脚本自己写错了**（2026-10-07，第一版就踩）：
 *    `check` 的签名是 `(名称, 条件, 说明)`，我却写成 `check(条件, 名称)` ⇒
 *    **非空字符串恒为真** ⇒ 11 项"全绿"全是假的。
 *    ⚠️ 这正好是本项目反复吃过的亏：**校验自己坏了会静默报通过**（见 `prompt-ledger.mjs`
 *      里那道 `sanity` 闸的同款理由）。
 *    ⇒ 所以本版**先自检 `check` 本身**（下面那两行"故意失败/故意通过"），再往下跑。
 *
 * 用法：node scripts/test-handoff-template-param.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 🔴🔴 必须在 import 插件之前设库根 —— 否则会写生产库（本项目铁律：测试一律用临时库）。
const lib = mkdtempSync(join(tmpdir(), 'memj-tpl-param-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(new URL('../lib/index.js', import.meta.url).href)

let pass = 0
let fail = 0
/** @param n 名称 @param c 条件 @param e 失败时的补充说明 */
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  OK   ${n}`) }
  else { fail += 1; console.log(`  FAIL ${n}${e ? '  —— ' + e : ''}`) }
}

// ── ⓪ 先自检 check 本身（否则"全绿"可能是假的）────────────────────────────
console.log('\n【0】自检：check() 的参数顺序对不对')
{
  const before = { pass, fail }
  // 故意喂一个假条件：它**必须**让 fail 增加。若不增加，说明 check 坏了。
  check('（自检用）假条件', false, '这行本来就该红')
  const caughtFalse = fail === before.fail + 1
  check('（自检用）真条件', true)
  const caughtTrue = pass === before.pass + 1
  if (!(caughtFalse && caughtTrue)) {
    console.log('\n🔴 check() 自身失效（假条件没被抓住）——后面所有结论都不可信，直接退出。')
    process.exit(2)
  }
  console.log('  （上面那条 FAIL 是自检故意制造的，不是真失败）')
}

const ctx = new Context()
ctx.provide('systemPrompt', { section: () => () => {}, context: () => () => {}, tools: () => () => {} })
ctx.provide('commands', { register: () => () => {} })
ctx.provide('webServer', { register: () => () => {} })
await ctx.plugin(ToolRuntime)
mod.apply(ctx, { ...mod.DEFAULT_CONFIG, themeCreation: 'loose', injectProtocol: false })
await new Promise((r) => setTimeout(r, 300))

const tools = ctx.get('tools')
const schemas = tools.schemas ? tools.schemas() : []
const handoff = schemas.find((t) => t.name === 'memj_handoff')
const call = async (name, args) => {
  const t = tools.get(name)
  return await t.execute(args, { agent: { id: 'test-agent' } })
}

console.log('\n【1】schema 里有 template（回归闸门）')
{
  check('取到 memj_handoff 的 schema', handoff !== undefined)
  const props = handoff?.parameters?.properties ?? {}
  check('parameters 里有 `template` 字段', 'template' in props,
    `现有字段：${Object.keys(props).join(', ')}`)
  const desc = props.template?.description ?? ''
  check('`template` 带了说明文字', desc.length > 0)
  check('说明里指出了「有哪些可选」怎么查（memj_template list）',
    desc.includes('memj_template') && desc.includes('list'))
  check('说明里讲清「已存在则被忽略」（负向行为也交代了）',
    desc.includes('已存在') && (desc.includes('忽略') || desc.includes('不回溯')))
}

console.log('\n【2】端到端：传 template 真的按那份模板建节')
{
  const r1 = await call('memj_template', {
    action: 'create',
    confirm: true,
    template: {
      id: 'unit-test-tpl',
      title: '单元测试模板',
      sections: [
        { name: '甲节', desc: '第一段要写什么。' },
        { name: '乙节', desc: '第二段要写什么。' },
        { name: '丙节', desc: '第三段要写什么。' },
      ],
    },
  })
  check('先建出一份三节的自定义模板', /已(创建|新建|保存)/.test(r1.message ?? ''),
    (r1.message ?? '').slice(0, 150))

  const r2 = await call('memj_handoff', {
    project: 'unit-tpl-proj',
    template: 'unit-test-tpl',
    projectDesc: '验证 template 参数的临时项目。',
    step: 'narrative',
    doc: '## 甲节\n\n临时内容。\n',
  })
  console.log('    回执：' + String(r2.message ?? '').split('\n').slice(0, 2).join(' / ').slice(0, 200))

  const r3 = await call('memj_read', { project: 'unit-tpl-proj' })
  const txt = JSON.stringify(r3)
  check('新建的文档用的是该模板的三个节名（甲/乙/丙）',
    txt.includes('甲节') && txt.includes('乙节') && txt.includes('丙节'), txt.slice(0, 300))
  check('**没有**混进默认模板的节（说明确实走了 template 而不是回落）',
    !txt.includes('失败/踩坑') && !txt.includes('有效做法'))
}

console.log('\n【3】传不存在的 id ⇒ 报错并列出可用，不静默回落')
{
  // ⚠️ 项目名要与已建的**不相似**，否则会先撞上"相似 id 确认"那条路，
  //    根本走不到模板检查（第一版就是这么被骗过的）。
  const projName = 'zzz-template-missing-check'
  let msg = ''
  let threw = false
  try {
    const r = await call('memj_handoff', {
      project: projName,
      template: '__no_such_template__',
      projectDesc: '不该被建出来。',
      step: 'narrative',
      doc: '## 甲节\n\nx\n',
    })
    msg = String(r.message ?? '')
  } catch (e) {
    threw = true
    msg = String(e?.message ?? e)
  }
  console.log('    ' + (threw ? '抛错' : '返回') + '：' + msg.split('\n').slice(0, 2).join(' / ').slice(0, 240))
  check('传不存在的模板会明确报错', threw || /不存在/.test(msg))
  check('错误里列出了可用模板（可自纠）', /可用|unit-test-tpl/.test(msg), `实际：${msg.slice(0, 200)}`)
  const dir = join(lib, 'projects')
  const made = existsSync(dir) && readdirSync(dir).some((f) => f.includes(projName))
  check('**没有**给它建出项目（拒绝而非静默回落）', !made)
}

try { rmSync(lib, { recursive: true, force: true }) } catch { /* ignore */ }

console.log(`\n结果：${pass} 通过 / ${fail} 失败（含自检那条故意红，已计入 fail 再扣回见下）`)
// 自检那条"故意红"要扣掉，否则数字会误导
console.log(`    实际有效断言：${pass} 通过 / ${fail - 1} 失败`)
process.exit(fail - 1 === 0 ? 0 : 1)
