/**
 * 探针：实测 DSH 工具管线的三个 host 侧钩子，判定 memj 能否用它们做**硬校验闸门**。
 *
 * 为什么要实测：上一轮的教训是"**读类型定义 ≠ 行为正确**"。
 * 本探针**不读文档下结论**，而是真的建一个 ToolRuntime、注册工具、跑一次调用，
 * 观察三个钩子的实际效果。
 *
 * 测三件事：
 *   A. `tools/pre-execute` 的 `{kind:'deny'}` —— 是否真能**阻止工具体运行**？reason 去向？
 *   B. `ctx.tools.guard()` —— 与 pre-execute 的**先后**？deny 的强度？
 *   C. `tools/post-execute` 的 `{kind:'block', feedback}` —— 把结果变成什么？工具体是否已跑过？
 *
 * 用法：node scripts/probe-tool-hooks.mjs
 * ⚠️ 不碰任何生产代码、不碰库。
 */
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime, defineTool } from '@deepseek-ai/dsh-tools'

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  OK   ${n}`) }
  else { fail += 1; console.log(`  FAIL ${n} ${e}`) }
}
/** 从结果里取纯文本（content 可能是块数组）。 */
const textOf = (r) => (r?.content ?? []).map((b) => b.text ?? '').join('\n')

console.log('════════ 探针：DSH 工具管线钩子 ════════\n')

// ── 建一个最小 Context + ToolRuntime ──
// ⚠️ `ToolRuntime.inject = ['systemPrompt']` ⇒ **必须先有 systemPrompt 服务**，
//    否则 `ctx.plugin(ToolRuntime)` 一直等依赖、`ctx.get('tools')` 拿到 undefined。
//    （本项目 HANDOFF 记过这个通用坑：缺 inject 依赖时回调永不执行且**无报错**。）
// ⚠️ 构造函数里调的是 `ctx.systemPrompt.tools(...)`（**不是 `section`**）——
//    所以 stub 至少要有 `tools()` 与 `section()` 两个方法。
const ctx = new Context()
ctx.provide('systemPrompt', {
  section: () => () => {},
  tools: () => () => {},
})
await ctx.plugin(ToolRuntime)
const tools = ctx.get('tools')
check('ToolRuntime 已挂载（ctx.get("tools") 可用）', tools !== undefined && typeof tools.register === 'function')

/** 每次试验前的痕迹记录。 */
let trace = []
const reset = () => { trace = [] }

// ⭐ 被测工具：**记录自己有没有被真的执行**
let bodyRan = 0
const spyTool = defineTool({
  name: 'spy',
  description: 'probe fixture',
  parameters: {
    name: { type: 'string', required: true },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { ok: { type: 'boolean', required: true } },
    },
    render: () => [{ type: 'text', text: 'spy-ok' }],
  },
  async execute(args) {
    bodyRan += 1
    // ⚠️ **只能返回 output.schema 声明过的字段**——多带一个就会被运行时拒收
    //    （本项目踩过：`additionalProperties: false` 下多返回字段 ⇒ 整次调用失败）。
    return { ok: true }
  },
})

tools.register(spyTool)

/** 跑一次调用，返回最终结果。 */
async function call(name, args) {
  return await tools.execute({ name, arguments: args, signal: new AbortController().signal })
}

// ══════════════════════════════════════════════════════════════════
console.log('【A】tools/pre-execute 的 deny')
// ══════════════════════════════════════════════════════════════════
{
  reset()
  bodyRan = 0
  // 注册一个：name === 'blocked' 时拒绝
  const off = ctx.on('tools/pre-execute', async (exec, next) => {
    trace.push('pre-execute')
    if (exec.arguments?.name === 'blocked') {
      return { kind: 'deny', reason: '这是 host 的硬拒绝理由' }
    }
    return await next()
  })

  const r1 = await call('spy', { name: 'ok-path' })
  check('放行路径：工具体执行了', bodyRan === 1, `bodyRan=${bodyRan}`)
  check('放行路径：结果是成功', r1.isError !== true, JSON.stringify(r1).slice(0, 120))

  bodyRan = 0
  const r2 = await call('spy', { name: 'blocked' })
  check('⭐⭐ deny 路径：**工具体没有执行**', bodyRan === 0, `bodyRan=${bodyRan}`)
  check('⭐⭐ deny 路径：结果是 **isError**', r2.isError === true, JSON.stringify(r2).slice(0, 160))
  check('⭐⭐ deny 的 reason **出现在给模型的内容里**',
    textOf(r2).includes('这是 host 的硬拒绝理由'), JSON.stringify(textOf(r2).slice(0, 160)))
  check('  内容形如 "Error: <reason>"（模型能看懂这是失败）',
    /Error:/.test(textOf(r2)), textOf(r2).slice(0, 80))
  off()
}

// ══════════════════════════════════════════════════════════════════
console.log('\n【B】ctx.tools.guard 的单调性与先后')
// ══════════════════════════════════════════════════════════════════
{
  reset()
  bodyRan = 0
  // pre-execute 明确 allow
  const off1 = ctx.on('tools/pre-execute', async (_exec, next) => {
    trace.push('pre-execute')
    return await next()
  })
  // guard 拒绝
  const off2 = tools.guard((exec) => {
    trace.push('guard')
    if (exec.arguments?.name === 'blocked') return 'guard 拒绝它的理由'
    return undefined
  })

  const r = await call('spy', { name: 'blocked' })
  check('⭐⭐ guard 能拒绝（deny 生效）', r.isError === true, JSON.stringify(r).slice(0, 140))
  check('⭐ guard 的 reason 到达模型', textOf(r).includes('guard 拒绝它的理由'), textOf(r).slice(0, 120))
  check('⭐ guard 在 pre-execute **之后**执行（顺序固定）',
    trace.join(' → ') === 'pre-execute → guard', trace.join(' → '))
  check('  guard 拒绝时工具体未执行', bodyRan === 0)
  off1(); off2()
}

// ══════════════════════════════════════════════════════════════════
console.log('\n【C】tools/post-execute 的 block + feedback')
// ══════════════════════════════════════════════════════════════════
{
  reset()
  bodyRan = 0
  const off = ctx.on('tools/post-execute', async (exec, result, next) => {
    trace.push('post-execute')
    // 只在参数 name === 'rewrite' 时拦截
    if (exec.arguments?.name === 'rewrite') {
      return {
        kind: 'block',
        feedback: [{ type: 'text', text: '你的 body 被截断了，请重新提交' }],
      }
    }
    return await next()
  })

  const rOk = await call('spy', { name: 'normal' })
  check('普通路径：post-execute 放行 ⇒ 成功', rOk.isError !== true, JSON.stringify(rOk).slice(0, 120))

  bodyRan = 0
  const rB = await call('spy', { name: 'rewrite' })
  check('⭐⭐ block：工具体**已经跑过了**（是事后拦截）', bodyRan === 1, `bodyRan=${bodyRan}`)
  check('⭐⭐ block：结果被**翻成 isError**', rB.isError === true, JSON.stringify(rB).slice(0, 160))
  check('⭐⭐ feedback 文案**原样到达模型**',
    textOf(rB).includes('你的 body 被截断了，请重新提交'), textOf(rB).slice(0, 160))
  check('  原成功内容不再出现（被替换掉了）', !textOf(rB).includes('spy-ok'), textOf(rB).slice(0, 120))
  off()
}

// ══════════════════════════════════════════════════════════════════
console.log('\n【D】关键约束：参数 schema 能否表达 minLength / pattern')
// ══════════════════════════════════════════════════════════════════
{
  let threw = false
  let err = ''
  try {
    defineTool({
      name: 'bad-schema',
      description: 'x',
      parameters: { t: { type: 'string', required: true, minLength: 2 } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
        render: () => [{ type: 'text', text: 'x' }],
      },
      async execute() { return { ok: true } },
    })
  } catch (e) { threw = true; err = String(e.message ?? e) }
  check('⭐ schema 不支持 minLength（声明即报错）—— 证实"字符串约束只有 enum/const"',
    threw, threw ? '' : '居然接受了 minLength！')
  console.log(`     （报错信息：${err.slice(0, 100)}）`)
}

// ══════════════════════════════════════════════════════════════════
console.log('\n【E】deny 的抗翻案强度：后面的 listener 能否 allow 回来？')
// ══════════════════════════════════════════════════════════════════
{
  reset()
  bodyRan = 0
  // 先注册一个 deny
  const off1 = ctx.on('tools/pre-execute', async (exec, next) => {
    trace.push('deny-1')
    if (exec.arguments?.name === 'blocked') return { kind: 'deny', reason: '第一个 listener 拒绝' }
    return await next()
  })
  // 再注册一个：故意想 allow
  const off2 = ctx.on('tools/pre-execute', async (exec, next) => {
    trace.push('allow-2')
    if (exec.arguments?.name === 'blocked') return { kind: 'allow' }
    return await next()
  })
  const r = await call('spy', { name: 'blocked' })
  check('⭐ waterfall 中**先 deny 者胜**（后面的 allow 翻不了案）',
    r.isError === true, JSON.stringify(r).slice(0, 140))
  check('  且工具体未执行', bodyRan === 0)
  console.log(`     （listener 调用顺序：${trace.join(' → ')}）`)
  off1(); off2()
}

// ══════════════════════════════════════════════════════════════════
console.log('\n【F】post-execute 的 additionalContexts（能否追问/提示模型）')
// ══════════════════════════════════════════════════════════════════
{
  const off = ctx.on('tools/post-execute', async (exec, result, next) => {
    if (exec.arguments?.name === 'ctx-path') {
      return { kind: 'accept', additionalContexts: ['【后台提示】还差 theme 这一步没做'] }
    }
    return await next()
  })
  const r = await call('spy', { name: 'ctx-path' })
  check('accept + additionalContexts：调用仍成功', r.isError !== true, JSON.stringify(r).slice(0, 120))
  const ctxs = r.additionalContexts ?? []
  check('⭐ additionalContexts 被带回（可供 loop 注入下一轮）', ctxs.length === 1,
    JSON.stringify(ctxs).slice(0, 160))
  off()
}

// ══════════════════════════════════════════════════════════════════
console.log('\n【G】可用性：插件上下文能否注册这三种钩子')
// ══════════════════════════════════════════════════════════════════
{
  let ok = true
  let err = ''
  try {
    const off1 = ctx.on('tools/pre-execute', async (_e, next) => await next())
    const off2 = ctx.on('tools/post-execute', async (_e, _r, next) => await next())
    const off3 = tools.guard(() => undefined)
    off1(); off2(); off3()
  } catch (e) { ok = false; err = String(e.message ?? e) }
  check('⭐ 三种钩子都能在普通 ctx 上注册/注销', ok, err)
}

// ══════════════════════════════════════════════════════════════════
console.log('\n【H】🔴 反证：撤掉钩子后，同一调用必须**恢复成功**')
// ══════════════════════════════════════════════════════════════════
// 目的：证明前面那些"被拒绝"**确实是钩子造成的**，
//       而不是这个 fixture 本身就走不通（否则整个探针是空转）。
{
  bodyRan = 0
  const r = await call('spy', { name: 'blocked' })
  check('⭐⭐ 无钩子时：同一参数 ⇒ **成功**（证明拒绝确由钩子产生）',
    r.isError !== true, JSON.stringify(r).slice(0, 160))
  check('  且工具体这次真的执行了', bodyRan === 1, `bodyRan=${bodyRan}`)
}

console.log(`\n═══ 探针结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
