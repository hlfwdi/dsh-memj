/**
 * 探针：热知识注入的**三条机制前提**（开工前必测，方案 §13 第 8 条）。
 *
 * 🔴 **为什么要这个探针**：方案 §4 的机制结论**都是"读源码"级**，本项目纪律是
 *    「要当设计依据就得补实测」。本探针**跑真实服务**（不是 stub 猜），验三件事：
 *
 *   【1】`agent/pre-step` waterfall 返回 `{kind:'enter', messages:[...]}` ⇒ 追加的 user 消息
 *        **真的会进模型请求**吗？（这是整个注入通道的地基）
 *   【2】**两个 `pre-step` 监听器叠加**时，双方追加的消息是否**都在**、顺序是否稳定？
 *        （本机已装 `dsh-prompt-inject`，它也往同一个 `messages` 里 push）
 *   【3】`llm/stream` waterfall 能否读到**完整出网 messages**（看门狗的判据来源）？
 *
 * ⚠️ **不碰生产**：只用内存 `Context` + 临时库；不启端口、不读写生产库。
 * 用法：node scripts/probe-hot-inject.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt, renderContextSections, joinContextSections } from '@deepseek-ai/dsh-system-prompt'

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}

console.log('════════ 探针：热知识注入的机制前提 ════════\n')

// ══════════════════════════════════════════════════════════════════════════
// 【1】pre-step 追加消息是否真的进请求
//
// 🔴 机制：agent-loop 的 `preStep()` 形如
//      const decision = await dispatch.waterfall('agent/pre-step', {messages, ...}, () => ({kind:'enter', messages}))
//      ⇒ **waterfall 的返回值就是最终 decision**。
//    类比：`ctx.waterfall('agent/pre-step', payload, () => defaultDecision)`。
// ══════════════════════════════════════════════════════════════════════════
console.log('【1】pre-step waterfall：追加的 user 消息是否进最终 decision')

const ctx = new Context()

/** 造一条插件 user 消息（与方案 §6.1 的形态一致）。 */
const makeMsg = (text, plugin) => ({
  id: `${plugin}-${Math.random().toString(36).slice(2, 10)}`,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'plugin', plugin, form: 'instructions' },
})

// 模拟 agent-loop 的调用形态：默认决策 = 本步准入消息。
const baseMessages = [makeMsg('用户的问题', 'user')]
const call = () => ctx.waterfall('agent/pre-step', {
  agent: { id: 'session-probe-1' },
  messages: baseMessages,
  turn: 1,
  step: 1,
  signal: new AbortController().signal,
}, () => Promise.resolve({ kind: 'enter', messages: [...baseMessages] }))

// 监听器 A：往 messages 里 push（第一版写法：直接改数组）
ctx.on('agent/pre-step', async (payload, next) => {
  const d = await next()
  if (d.kind === 'enter') d.messages.push(makeMsg('HOT-A', 'memj'))
  return d
})

let d1 = await call()
check('监听器改 `d.messages` 后，追加消息在最终 decision 里',
  d1.messages.some((m) => m.content[0].text === 'HOT-A'),
  `实际 ${d1.messages.length} 条`)
check('原消息未被破坏', d1.messages.some((m) => m.content[0].text === '用户的问题'))

// ══════════════════════════════════════════════════════════════════════════
// 【2】两个 pre-step 监听器叠加（memj + dsh-prompt-inject 的真实形态）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【2】两个 pre-step 监听器叠加：两条消息是否都在、顺序是否稳定')

// 监听器 B：复刻 `dsh-prompt-inject/src/host/index.ts:241-272` 的写法
//   —— `const decision = await next()` 然后 `messages.push(...)`，`return {kind:'enter', messages}`。
ctx.on('agent/pre-step', async (payload, next) => {
  const decision = await next()
  if (!decision || decision.kind !== 'enter') return decision
  const messages = Array.isArray(decision.messages) ? decision.messages : []
  messages.push(makeMsg('INJECT-B', 'dsh-prompt-inject'))
  return { kind: 'enter', messages }
})

const d2 = await call()
const texts2 = d2.messages.map((m) => m.content[0].text)
check('A 的消息在', texts2.includes('HOT-A'), JSON.stringify(texts2))
check('B 的消息在', texts2.includes('INJECT-B'), JSON.stringify(texts2))
check('原消息仍在', texts2.includes('用户的问题'), JSON.stringify(texts2))
check('⭐ 两条追加消息**都在**（叠加不吞）', texts2.includes('HOT-A') && texts2.includes('INJECT-B'))
console.log(`     顺序：${texts2.join(' → ')}`)

// 顺序稳定性：连跑 5 次应完全一致
const orders = []
for (let i = 0; i < 5; i += 1) {
  const d = await call()
  orders.push(d.messages.map((m) => m.content[0].text).join('|'))
}
check('⭐ 顺序稳定（连跑 5 次一致）', new Set(orders).size === 1, `实得 ${new Set(orders).size} 种`)

// 值语义检查：追加的消息必须是**合法 UserMessage 形状**（有 id/role/content/source）
const injected = d2.messages.find((m) => m.content[0].text === 'HOT-A')
check('追加消息形状合法（id/role/content/source 齐全）',
  injected !== undefined && typeof injected.id === 'string' && injected.role === 'user'
  && Array.isArray(injected.content) && injected.source?.kind === 'plugin')

// ══════════════════════════════════════════════════════════════════════════
// 【3】llm/stream 能否读到完整出网 messages
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【3】llm/stream waterfall：能否读到完整出网 messages（看门狗判据来源）')

let seen = null
ctx.on('llm/stream', async function* (options, next) {
  seen = {
    messageCount: Array.isArray(options?.messages) ? options.messages.length : -1,
    texts: (options?.messages ?? []).map((m) => (m.content ?? []).map((b) => b.text ?? '').join('')),
    sessionId: options?.sessionId,
    provider: options?.provider,
    model: options?.model,
  }
  yield* next()
})

// 模拟一次出网请求（options 形状照 `GenerateOptions`：provider/model/messages/sessionId）
const outMessages = [
  { id: 'm0', role: 'system', content: [{ type: 'text', text: 'system' }], source: { kind: 'plugin', plugin: 'sp' } },
  makeMsg('用户的问题', 'user'),
  makeMsg('HOT-A', 'memj'),
]
const chunks = []
for await (const c of ctx.waterfall({}, 'llm/stream', {
  provider: 'probe', model: 'probe-model', messages: outMessages, sessionId: 'session-probe-1',
}, () => (async function* () { yield { type: 'text-delta', index: 0, text: 'hi' } })())) {
  chunks.push(c)
}

check('llm/stream 被调用', seen !== null)
check('⭐ 能读到完整 messages（条数一致）', seen?.messageCount === outMessages.length,
  `读到 ${seen?.messageCount} / 应 ${outMessages.length}`)
check('⭐ 能读到注入内容的**原文**（看门狗据此判定「还在不在窗口」）',
  seen?.texts?.some((t) => t.includes('HOT-A')))
check('能读到 sessionId（用于按会话分桶）', seen?.sessionId === 'session-probe-1')
check('能读到 provider/model', seen?.provider === 'probe' && seen?.model === 'probe-model')
check('chunk 原样透传（不改写流）', chunks.length === 1 && chunks[0].text === 'hi')

// ══════════════════════════════════════════════════════════════════════════
// 【4】⭐ 附带验证：`systemPrompt.context()` 的「同值不发」与函数式 text
//     —— 这决定方案 §3.3「context() 这条路为什么不用」的结论是否成立
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【4】附带：context() 的 text 是函数时每次装配都会重算吗')

const ctx2 = new Context()
await ctx2.plugin(SystemPrompt)
let calls = 0
ctx2.systemPrompt.context({ name: 'probe:ctx', order: 999, text: () => { calls += 1; return `v${calls}` } })
const a1 = await ctx2.systemPrompt.assemble()
const a2 = await ctx2.systemPrompt.assemble()
check('context().text 每次装配都被调用（⇒ 可按 agent 现算）', calls === 2, `调了 ${calls} 次`)
check('两次装配取到不同内容（证明是现算、不是快照常量）',
  renderContextSections(a1)[0]?.text === 'v1' && renderContextSections(a2)[0]?.text === 'v2',
  `${renderContextSections(a1)[0]?.text} / ${renderContextSections(a2)[0]?.text}`)
check('AssembleContext 里能拿到 agent（方案说 context() 可按 agent 区分）',
  // assemble({agent}) ⇒ text 函数收到的 context 应带 agent
  true) // 下面单独验
const seenCtx = []
ctx2.systemPrompt.context({ name: 'probe:ctx2', order: 998, text: (c) => { seenCtx.push(c); return '' } })
await ctx2.systemPrompt.assemble({ agent: { id: 'session-probe-1' }, scope: { id: 'session-probe-1' } })
check('⭐ text(ctx) 确实收到 agent/scope（可按会话现算）',
  seenCtx.length > 0 && seenCtx[seenCtx.length - 1]?.agent?.id === 'session-probe-1',
  JSON.stringify(seenCtx[seenCtx.length - 1] ?? null))
check('joinContextSections 会把多个 context 拼成**同一条**（方案 §3.3 的取舍依据）',
  joinContextSections(renderContextSections(a1)).startsWith('Current runtime context.'),
  joinContextSections(renderContextSections(a1)).slice(0, 40))

// ══════════════════════════════════════════════════════════════════════════
console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
if (fail > 0) process.exitCode = 1
