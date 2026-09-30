/**
 * 探针：**提示词的运行期覆盖**是否真的可行（决定【提示词】设置页的架构）。
 *
 * 为什么要实测：读源码得出的结论是"能"（`dsh-tools:2609` 的 tools provider 每次装配求值、
 * `dsh-system-prompt:322-326` 每次重新解构 `description`），但**读源码 ≠ 行为正确**
 * ——本项目已有"机制不支持这类判断必须先做一次最小实验"的纪律。
 *
 * 本探针**不 mock 任何被测对象**：用真的 `SystemPrompt` 服务 + 真的 `ToolRuntime`，
 * 走真的 `assemble()` 装配路径，读装配结果里模型实际会看到的 `description`。
 *
 * 测四件事：
 *   A. **基线**：注册一个普通（字符串 description）工具 ⇒ 装配结果里是原字符串。
 *   B. 🔴 **核心**：把同一个工具定义改成 **getter description**，注册后
 *      改"覆盖值" ⇒ **下一次装配**拿到的描述是否跟着变？（这决定能否热更新）
 *   C. **通道文本**：`section()` / `context()` 的 `text` 是函数 ⇒ 改覆盖值后是否跟着变？
 *   D. **反证**：把 getter 换回普通属性 ⇒ 改覆盖值后描述**应当不变**
 *      （证明 B 的"变了"不是装配本身每次都乱变的假象）。
 *
 * 用法：node scripts/probe-prompt-override.mjs
 * ⚠️ 不碰生产代码、不碰库（只建内存对象）。
 */
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime, defineTool } from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  OK   ${n}`) }
  else { fail += 1; console.log(`  FAIL ${n}${e ? `  ⟵ ${e}` : ''}`) }
}

console.log('════════ 探针：提示词运行期覆盖（getter 方案）════════\n')

// ── 建真环境：真 SystemPrompt + 真 ToolRuntime ──
const ctx = new Context()
// ⚠️ **不要预注册 stub**：真 `SystemPrompt` 自己会 `provide('systemPrompt')`，
//    先手工 provide 一个再 plugin 真服务 ⇒ 报 `service "systemPrompt" has been registered`。
//    （旧探针 `probe-tool-hooks.mjs` 用的是 stub 才需要 provide，本探针用真服务。）
await ctx.plugin(SystemPrompt)                // 真服务接管（它负责 provide）
await ctx.plugin(ToolRuntime)                 // 它内部会调 ctx.systemPrompt.tools(...)
const tools = ctx.get('tools')
const sp = ctx.get('systemPrompt')
check('真 SystemPrompt 已挂载', sp !== undefined && typeof sp.assemble === 'function')
check('真 ToolRuntime 已挂载', tools !== undefined && typeof tools.register === 'function')

/** 从装配结果里取某个工具的描述（**模型实际会看到的那份**）。 */
async function descriptionOf(name) {
  const asm = await sp.assemble({})
  const hit = asm.tools.find((t) => t.name === name)
  return hit?.description
}
/** 从装配结果里取某个 section/context 的文本。 */
async function sectionTextOf(name) {
  const asm = await sp.assemble({})
  const all = [...(asm.sections ?? []), ...(asm.contexts ?? [])]
  const hit = all.find((s) => s.name === name)
  return hit?.text
}

// ══════════════════════════════════════════════════════════════════
// A. 基线：普通字符串 description
// ══════════════════════════════════════════════════════════════════
console.log('\n── A. 基线（普通字符串 description）──')

const plain = defineTool({
  name: 'probe_plain',
  description: 'PLAIN-BASE',
  parameters: {},
  output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } }, render: () => [{ type: 'text', text: 'ok' }] },
  async execute() { return { ok: true } },
})
tools.register(plain)
check('A1 普通工具注册成功，装配里拿到原描述', (await descriptionOf('probe_plain')) === 'PLAIN-BASE')

// ══════════════════════════════════════════════════════════════════
// B. 🔴 核心：getter description ⇒ 改覆盖值后下一次装配应当跟着变
// ══════════════════════════════════════════════════════════════════
console.log('\n── B. 核心：getter description（模拟"覆盖层"）──')

/** 模拟覆盖层：一个会在运行期被改写的变量。 */
const store = { toolDesc: 'OVERRIDE-1' }

const dyn = defineTool({
  name: 'probe_dynamic',
  description: 'SOURCE-DEFAULT',        // defineTool 会立即取一次值（普通属性）
  parameters: {},
  output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } }, render: () => [{ type: 'text', text: 'ok' }] },
  async execute() { return { ok: true } },
})

// 🔴 **关键动作**：照 DSH 自己给 run_code 的写法，把 description 覆盖成 getter。
//    必须在 `defineTool()` 返回**之后**做——因为 defineTool 内部是普通属性赋值。
Object.defineProperty(dyn, 'description', {
  enumerable: true,
  configurable: true,
  get: () => store.toolDesc,
})

tools.register(dyn)
check('B1 覆盖成 getter 后注册成功', true)
check('B2 装配拿到的是覆盖值（不是源码默认值）', (await descriptionOf('probe_dynamic')) === 'OVERRIDE-1',
  `实得 ${JSON.stringify(await descriptionOf('probe_dynamic'))}`)

// ⭐⭐ 核心断言：**改覆盖值 ⇒ 不重新注册、不重启，下一次装配就应当是新的**
store.toolDesc = 'OVERRIDE-2'
const after2 = await descriptionOf('probe_dynamic')
check('B3 ⭐ 改覆盖值后，下一次装配即为新值（无需重新注册）', after2 === 'OVERRIDE-2',
  `实得 ${JSON.stringify(after2)}`)

store.toolDesc = 'OVERRIDE-3'
check('B4 ⭐ 再改一次仍然跟随（不是巧合）', (await descriptionOf('probe_dynamic')) === 'OVERRIDE-3')

// ══════════════════════════════════════════════════════════════════
// C. 通道文本：section() / context() 的 text 是函数
// ══════════════════════════════════════════════════════════════════
console.log('\n── C. 通道文本（section / context 的 text 为函数）──')

const chan = { protocol: 'PROTO-1', guidance: 'GUIDE-1' }
sp.section({ name: 'probe:protocol', order: 3000, text: () => chan.protocol })
sp.context({ name: 'probe:guidance', order: 125, text: () => chan.guidance })

check('C1 section 装配拿到初值', (await sectionTextOf('probe:protocol')) === 'PROTO-1')
check('C2 context 装配拿到初值', (await sectionTextOf('probe:guidance')) === 'GUIDE-1')

chan.protocol = 'PROTO-2'
chan.guidance = 'GUIDE-2'
check('C3 ⭐ 改覆盖值后 section 跟随（无需重注册）', (await sectionTextOf('probe:protocol')) === 'PROTO-2')
check('C4 ⭐ 改覆盖值后 context 跟随（无需重注册）', (await sectionTextOf('probe:guidance')) === 'GUIDE-2')

// ══════════════════════════════════════════════════════════════════
// D. 反证：普通属性（不加 getter）⇒ 改覆盖值后**必须不变**
// ══════════════════════════════════════════════════════════════════
console.log('\n── D. 反证：普通属性不跟随（证明 B 的"变"来自 getter）──')

const roStore = { desc: 'RO-1' }
const ro = defineTool({
  name: 'probe_plainprop',
  description: roStore.desc,           // 一次性取值，普通属性
  parameters: {},
  output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } }, render: () => [{ type: 'text', text: 'ok' }] },
  async execute() { return { ok: true } },
})
tools.register(ro)
check('D1 反证基线：普通属性装配拿到注册时的值', (await descriptionOf('probe_plainprop')) === 'RO-1')

roStore.desc = 'RO-2'
const d2 = await descriptionOf('probe_plainprop')
check('D2 ⭐ 普通属性**不跟随**（这正是 getter 必须存在的理由）', d2 === 'RO-1',
  `实得 ${JSON.stringify(d2)} —— 若它变成了 RO-2，说明 B 的结论不可信`)

// ══════════════════════════════════════════════════════════════════
console.log(`\n════════ 结果：${pass} 通过 / ${fail} 失败 ════════`)
if (fail > 0) {
  console.log('\n🔴 结论：getter 方案**不成立** ⇒ 【提示词】页面改工具描述必须走"重启生效"。')
  process.exit(1)
}
console.log('\n✅ 结论：工具描述与通道文本**都能运行期生效** ⇒ 可做运行期覆盖。')
