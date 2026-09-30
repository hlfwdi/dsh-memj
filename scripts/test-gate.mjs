/**
 * host 侧硬校验闸门（决策 103 / §3.11.6）。
 *
 * ⚠️ **重点验两件事**（不只是"函数返回了字符串"）：
 *   ① 闸门**真的接在工具管线上**（`tools/pre-execute`），且 `deny` 生效；
 *   ② 被拒时**工具体没有执行**——这才叫"提前拦截"。
 *   ⇒ 用一个"记账"的假工具体，比只调 `gateHandoffArgs()` 更有力。
 *
 * 用法：node scripts/test-gate.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime, defineTool } from '@deepseek-ai/dsh-tools'

const mod = await import('../lib/index.js')
const { gateHandoffArgs } = await import('../lib/gate.js').catch(() => mod)

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}
const textOf = (r) => (r?.content ?? []).map((b) => b.text ?? '').join('\n')

console.log('════════ 闸门：host 硬校验（决策 103）════════\n')

// ══════════════════════════════════════════════════════════════
console.log('【1】纯函数：gateHandoffArgs 的形状校验')
// ══════════════════════════════════════════════════════════════
{
  const okEntry = {
    slug: 'good-slug', title: '合法标题', tags: ['t'],
    desc: '合法描述；当测试时读它。', body: '### 标题\n\n正文。',
  }

  check('合法入参 ⇒ 放行', gateHandoffArgs({ project: 'p', entries: [okEntry] }) === undefined)

  check('⭐ project 只有空白 ⇒ 拒绝',
    gateHandoffArgs({ project: '   ' }) !== undefined)
  check('  缺 project ⇒ 拒绝', gateHandoffArgs({}) !== undefined)

  // ── ⭐ schema 拦不了的那些 ──
  let r = gateHandoffArgs({ project: 'p', entries: [{ ...okEntry, title: 'x' }] })
  check('⭐ title 过短 ⇒ 拒绝（schema 无 minLength）', r !== undefined && r.includes('过短'), String(r).slice(0, 120))

  r = gateHandoffArgs({ project: 'p', entries: [{ ...okEntry, title: 'x'.repeat(49) }] })
  check('⭐ title 超长 ⇒ 拒绝', r !== undefined && r.includes('超长'), String(r).slice(0, 120))

  r = gateHandoffArgs({ project: 'p', entries: [{ ...okEntry, desc: 'x'.repeat(201) }] })
  check('⭐ desc 超长 ⇒ 拒绝', r !== undefined && r.includes('超长'), String(r).slice(0, 120))

  r = gateHandoffArgs({ project: 'p', entries: [{ ...okEntry, slug: '中文slug' }] })
  check('⭐ slug 格式非法 ⇒ 拒绝（schema 无 pattern）', r !== undefined && r.includes('slug'), String(r).slice(0, 120))

  // ⭐⭐ 真实踩过的故障：body 被中途截断
  r = gateHandoffArgs({ project: 'p', entries: [{ ...okEntry, body: '**结论**：基于' }] })
  check('⭐⭐ body 没有标题行 ⇒ 拒绝（防"截断的半句话被落盘"）',
    r !== undefined && r.includes('标题行'), String(r).slice(0, 160))

  r = gateHandoffArgs({ project: 'p', entries: [{ ...okEntry, body: '' }] })
  check('  body 为空 ⇒ 拒绝', r !== undefined, String(r).slice(0, 120))

  // ── step 取值 ──
  check('⭐ step 空数组 ⇒ 拒绝', gateHandoffArgs({ project: 'p', step: [] }) !== undefined)
  check('⭐ step 非法值 ⇒ 拒绝', gateHandoffArgs({ project: 'p', step: 'bogus' }) !== undefined)
  check('  step 合法 ⇒ 放行', gateHandoffArgs({ project: 'p', step: 'knowledge' }) === undefined)
  check('  step 数组合法 ⇒ 放行',
    gateHandoffArgs({ project: 'p', step: ['knowledge', 'theme'] }) === undefined)

  // ── adopt ──
  r = gateHandoffArgs({
    project: 'p',
    adopt: [{ slug: 'a', title: 'x', tags: ['t'], desc: 'd；当x时读它。', ref: 'D:/x.md', mode: 'copy' }],
  })
  check('⭐ adopt 的 title 过短 ⇒ 拒绝', r !== undefined && r.includes('title'), String(r).slice(0, 120))

  // ⭐ 报错里要报**全部**问题（决策 62）
  r = gateHandoffArgs({
    project: 'p',
    entries: [{ ...okEntry, title: 'x' }, { ...okEntry, slug: '中文' }],
  })
  check('⭐ 一次报全部问题（不是报第一个就停）',
    r !== undefined && r.includes('entries[0]') && r.includes('entries[1]'), String(r).slice(0, 200))

  check('  多带无关字段不影响（闸门只看自己认识的）',
    gateHandoffArgs({ project: 'p', entries: [okEntry], whatever: 1 }) === undefined)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【2】⭐⭐ 接在真实工具管线上：deny 生效且工具体未执行')
// ══════════════════════════════════════════════════════════════
{
  const ctx = new Context()
  ctx.provide('systemPrompt', { section: () => () => {}, tools: () => () => {} })
  await ctx.plugin(ToolRuntime)
  const tools = ctx.get('tools')

  let bodyRan = 0
  const fake = defineTool({
    name: 'memj_handoff',
    description: 'fixture',
    parameters: {
      project: { type: 'string', required: true },
      entries: { type: 'array', items: { type: 'json' } },
      step: { type: 'json' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
      render: () => [{ type: 'text', text: 'executed' }],
    },
    async execute() {
      bodyRan += 1
      return { ok: true }
    },
  })
  tools.register(fake)

  // 装上真实的闸门（与 index.ts 注册的是同一个函数）
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name !== 'memj_handoff') return await next()
    const reason = gateHandoffArgs(exec.arguments)
    if (reason !== undefined) return { kind: 'deny', reason }
    return await next()
  })

  const call = (args) =>
    tools.execute({ name: 'memj_handoff', arguments: args, signal: new AbortController().signal })

  // 合法 ⇒ 放行
  // ⚠️ slug 至少要 **2 个字符**（规则是 2–48）——这里曾写成 `'s'`，
  //    结果被闸门正确地拦下，一度误判成"闸门误杀"。教训：**测试数据自己要先合规**。
  bodyRan = 0
  let r = await call({ project: 'p', entries: [{ slug: 'ok', title: '合法标题', tags: ['t'], desc: 'd；当x时读它。', body: '### T\nx' }] })
  check('合法入参 ⇒ 工具体执行了', bodyRan === 1 && r.isError !== true, `bodyRan=${bodyRan}`)

  // 非法 ⇒ 拦截
  bodyRan = 0
  r = await call({ project: 'p', entries: [{ slug: 'ok', title: 'x', tags: ['t'], desc: 'd；当x时读它。', body: '### T\nx' }] })
  check('⭐⭐ 非法入参 ⇒ 工具体**没有执行**', bodyRan === 0, `bodyRan=${bodyRan}`)
  check('⭐⭐ 结果是 isError', r.isError === true, JSON.stringify(r).slice(0, 140))
  check('⭐⭐ 拒绝理由**到达模型**（模型能当场改）',
    textOf(r).includes('过短'), textOf(r).slice(0, 200))
  check('  理由里带"工具体未执行"的说明',
    textOf(r).includes('工具体未执行'), textOf(r).slice(0, 200))

  // ⭐ 反证：闸门只该拦 memj_handoff，别的工具不受影响
  let otherRan = 0
  const other = defineTool({
    name: 'memj_other',
    description: 'x',
    parameters: { a: { type: 'string', required: true } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
      render: () => [{ type: 'text', text: 'other' }],
    },
    async execute() { otherRan += 1; return { ok: true } },
  })
  tools.register(other)
  r = await tools.execute({ name: 'memj_other', arguments: { a: 'x' }, signal: new AbortController().signal })
  check('⭐ 闸门**只管 memj_handoff**，别的工具不受影响',
    otherRan === 1 && r.isError !== true, `otherRan=${otherRan}`)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【3】⭐⭐ post-execute 自愈（决策 103 / §3.11.4）')
// ══════════════════════════════════════════════════════════════
{
  const { selfCheckHandoffResult, registerGate } = mod
  check('导出自愈函数', typeof selfCheckHandoffResult === 'function')

  // ── 该拦的：建了主题、给了知识，但一个都没挂 ──
  const bad = selfCheckHandoffResult(
    { entries: [{ theme: [] }, { theme: ['other'] }] },
    { ok: true, createdThemes: ['thm-new'] },
  )
  check('⭐ 建了主题但知识全没挂 ⇒ 给出反馈', bad !== undefined, String(bad).slice(0, 100))
  check('  反馈里点名了那个主题', String(bad).includes('thm-new'))
  check('  反馈里给出两条具体做法', String(bad).includes('theme') && String(bad).includes('newThemes'))

  // ── 不该拦的（防误伤，每条都要验）──
  check('  挂上了 ⇒ 放行',
    selfCheckHandoffResult(
      { entries: [{ theme: ['thm-new'] }] },
      { ok: true, createdThemes: ['thm-new'] },
    ) === undefined)
  check('  建了两个、只挂了一个 ⇒ 放行（不追求"每个都挂"）',
    selfCheckHandoffResult(
      { entries: [{ theme: ['a'] }] },
      { ok: true, createdThemes: ['a', 'b'] },
    ) === undefined)
  check('  本次没给知识 ⇒ 放行（"先建主题、下次再挂"是合理用法）',
    selfCheckHandoffResult({}, { ok: true, createdThemes: ['x'] }) === undefined)
  check('  没建主题 ⇒ 放行',
    selfCheckHandoffResult({ entries: [{ theme: [] }] }, { ok: true, createdThemes: [] }) === undefined)
  check('  adopt 挂上了也算 ⇒ 放行',
    selfCheckHandoffResult(
      { adopt: [{ theme: ['thm-new'] }] },
      { ok: true, createdThemes: ['thm-new'] },
    ) === undefined)
  check('  结果本身是失败 ⇒ 放行（该由它自己的错误驱动）',
    selfCheckHandoffResult({ entries: [{ theme: [] }] }, { ok: false, createdThemes: ['x'] }) === undefined)

  // ── ⭐⭐ 接在管线上的**真实**验证：block 真的生效、且工具体已执行 ──
  const ctx = new Context()
  ctx.provide('systemPrompt', { section: () => () => {}, tools: () => () => {} })
  await ctx.plugin(ToolRuntime)
  const tools = ctx.get('tools')
  let ran = 0
  tools.register(defineTool({
    name: 'memj_handoff',
    description: 'x',
    parameters: { project: { type: 'string', required: true }, entries: { type: 'json' } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { ok: { type: 'boolean', required: true }, createdThemes: { type: 'array', required: true, items: { type: 'string' } } },
      },
      render: () => [{ type: 'text', text: '原成功内容' }],
    },
    async execute() { ran += 1; return { ok: true, createdThemes: ['thm-empty'] } },
  }))
  registerGate({ ctx })

  const call = (args) => tools.execute({ name: 'memj_handoff', arguments: args, signal: new AbortController().signal })
  /** ⚠️ 夹具必须**形状合法**——否则会先被 pre-execute 拦下，测不到 post-execute。 */
  const okEntry = (theme) => ({ slug: 'ok-slug', title: '合法标题', tags: ['t'], desc: 'd；当x时读它。', body: '### T\nx', theme })

  // 触发自愈
  ran = 0
  let r = await call({ project: 'p', entries: [okEntry([])] })
  check('⭐⭐ 自愈生效：工具体**已经跑过**（post 是事后拦截）', ran === 1, `ran=${ran}`)
  check('⭐⭐ 结果被翻成 isError', r.isError === true, JSON.stringify(r).slice(0, 140))
  check('⭐⭐ 反馈**到达模型**', textOf(r).includes('thm-empty'), textOf(r).slice(0, 160))
  check('  原成功内容被替换掉', !textOf(r).includes('原成功内容'), textOf(r).slice(0, 120))

  // 不该触发的情形：挂上了
  ran = 0
  r = await call({ project: 'p', entries: [okEntry(['thm-empty'])] })
  check('  挂上主题 ⇒ 正常成功（不误伤）', r.isError !== true && textOf(r).includes('原成功内容'),
    textOf(r).slice(0, 120))

  // ⭐ 反证：别的工具不受自愈影响
  let otherRan = 0
  tools.register(defineTool({
    name: 'memj_other2',
    description: 'x',
    parameters: { a: { type: 'string', required: true } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
      render: () => [{ type: 'text', text: 'other-ok' }],
    },
    async execute() { otherRan += 1; return { ok: true } },
  }))
  r = await tools.execute({ name: 'memj_other2', arguments: { a: 'x' }, signal: new AbortController().signal })
  check('⭐ 自愈只管 memj_handoff', otherRan === 1 && r.isError !== true)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【5】⭐ 命令直达某步：parseStepRequest（决策 101）')
// ══════════════════════════════════════════════════════════════
{
  const { parseStepRequest } = mod
  check('导出 parseStepRequest', typeof parseStepRequest === 'function')

  // ── 该识别的 ──
  check('单个步骤名 ⇒ 识别', JSON.stringify(parseStepRequest('knowledge')) === '["knowledge"]',
    JSON.stringify(parseStepRequest('knowledge')))
  check('逗号分隔 ⇒ 识别',
    JSON.stringify(parseStepRequest('theme, knowledge')) === '["theme","knowledge"]',
    JSON.stringify(parseStepRequest('theme, knowledge')))
  check('空格分隔 ⇒ 识别',
    JSON.stringify(parseStepRequest('narrative theme')) === '["narrative","theme"]')
  check('顿号/加号也能分 ⇒ 识别',
    JSON.stringify(parseStepRequest('narrative、theme+knowledge')) === '["narrative","theme","knowledge"]',
    JSON.stringify(parseStepRequest('narrative、theme+knowledge')))
  check('all 单独出现 ⇒ 识别', JSON.stringify(parseStepRequest('all')) === '["all"]')

  // ── ⭐ 不该识别的（防把自然语言误判成步骤）──
  check('⭐ 自然语言 ⇒ 不识别（保持原样当补充语）',
    parseStepRequest('这次记网页改造') === undefined)
  check('⭐ 含步骤名但整句不是列表 ⇒ 不识别',
    parseStepRequest('记一下 theme 那件事') === undefined,
    JSON.stringify(parseStepRequest('记一下 theme 那件事')))
  check('  含非法词 ⇒ 不识别',
    parseStepRequest('knowledge bogus') === undefined)
  check('  all 与他项并存 ⇒ 不识别（交给工具去报错更清楚）',
    parseStepRequest('all knowledge') === undefined)
  check('  空串 ⇒ 不识别', parseStepRequest('') === undefined)
  check('  纯空白 ⇒ 不识别', parseStepRequest('   ') === undefined)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【6】⭐ runHandoff 内部仍保留同样的校验（防绕过闸门）')
// ══════════════════════════════════════════════════════════════
{
  const { checkKnowledgeShape, checkEntryShape } = mod
  check('导出了共享校验函数（闸门与工具内共用一份实现）',
    typeof checkKnowledgeShape === 'function' && typeof checkEntryShape === 'function')

  const bad = checkKnowledgeShape(
    [{ slug: 'ok', title: 'ok标题', tags: ['t'], desc: 'd；当x时读它。', body: '没标题' }],
    undefined,
  )
  check('⭐ 共享实现也会拦 body 没标题行', bad.some((s) => s.includes('标题行')), JSON.stringify(bad))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【7】🔴 回归：工具层的校验失败必须变成 isError')
// ══════════════════════════════════════════════════════════════
// 真实实例验收抓到的 bug：`runHandoff` 返回 `ok:false` 时，
// 工具**只 return 不 throw** ⇒ 管线认为调用**成功** ⇒ 模型看到"工具跑完了"，
// 而不是"我错了、要改"。⇒ 校验失败必须**抛**。
{
  const ctx = new Context()
  ctx.provide('systemPrompt', { section: () => () => {}, tools: () => () => {} })
  ctx.provide('commands', { register: () => () => {} })
  ctx.provide('webServer', { register: () => () => {} })
  await ctx.plugin(ToolRuntime)

  const lib = (await import('node:fs')).mkdtempSync(
    (await import('node:path')).join((await import('node:os')).tmpdir(), 'memj-throw-'),
  )
  process.env['MEMJ_DATA_DIR'] = lib
  // ⚠️ 重新导入，让库根生效（模块读 env 是懒加载的，这里换个入口即可）。
  mod.apply(ctx, { ...mod.DEFAULT_CONFIG, themeCreation: 'loose', injectProtocol: false })
  await new Promise((r) => setTimeout(r, 200))

  const tools = ctx.get('tools')
  const call = (args) => tools.execute({ name: 'memj_handoff', arguments: args, signal: new AbortController().signal })

  // ⭐ 参数与 step 不一致 ⇒ runHandoff 返回 ok:false ⇒ 必须 isError
  const r = await call({ project: 'throw-proj', step: 'knowledge', doc: '## 目标\n\nx' })
  check('⭐⭐ 校验失败 ⇒ `isError` 为真（不是"成功"）', r.isError === true, JSON.stringify(r).slice(0, 200))
  check('⭐⭐ 失败原因到达模型', textOf(r).includes('不一致'), textOf(r).slice(0, 200))
}

console.log(`\n═══ 闸门结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
