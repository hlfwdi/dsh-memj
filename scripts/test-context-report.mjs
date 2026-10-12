/**
 * ⭐⭐⭐ **轮末上下文占用上报**（决策 226；2026-10-12 用户裁定）测试。
 *
 * ── 本套件要盯住的东西 ──────────────────────────────────────────────────────
 * 这个功能的**主要失败模式是"静默"**：
 * · `tokenMeter` 没挂 ⇒ 它什么都不做（**这是对的**，但没人验就会以为"功能坏了"）；
 * · 路由没上报窗口 ⇒ 算不出百分比 ⇒ 不报；
 * · 低于阈值 ⇒ 不报。
 * ⇒ ⭐ **三态各要有断言**，且要断言**理由是"可判定"的**（不是笼统一句"没触发"）。
 *
 * 🔴 另外两条**必须机械守住**的纪律：
 * ① **必须用 `inject()`，绝不能用 `followup()`** ——
 *    `followup` 会**唤醒驱动器**、每轮多跑一轮。这条是**行为契约**，
 *    所以本套件用**桩 agent** 记录"到底调了哪个方法"来钉死它；
 * ② **注入的文本里【不许】出现插件自己规定的阈值动作** ——
 *    插件只提供事实；「到 60% 就做什么」必须留在**用户的提示词**里。
 *
 * ⚠️ 必须在 `pnpm run build` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-context-report.mjs
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-ctxreport-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const {
  readContextUsage,
  renderContextUsage,
  reportContextUsage,
  registerContextReport,
  DEFAULT_CONFIG,
} = mod

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

console.log(`库根: ${lib}\n`)

/**
 * 造一个 `sessionProjections` 桩：`stateOf(session, 'contextPressure')` 回给定值。
 *
 * 🔴🔴 **2026-10-12 修正**：本套件第一版造的是 **`tokenMeter` 桩**（`{ measure: () => ret }`），
 *    而**真实代码根本不从 `measure()` 读那三个字段** ——
 *    `measure()` 的真实返回是 `{ logRevision, baseline, surfaceDeltaTokens,
 *    totalTokens, surfaceTokens, nodes }`，**没有** `pressureTokens` /
 *    `projectedTokens` / `contextWindow`。
 *    ⇒ 那三个字段来自**会话投影** `contextPressure`。
 *
 *    ⚠️ **第一版全绿、而产品一行都没注入过** —— 因为**桩喂了不存在的形状**，
 *       刚好把那个 bug「喂饱」了。这正是本项目记过的
 *       「夹具要照真实 API 形状，不是照自己的想象」+「用假对象核外部 API = 没核」。
 *    ✅ 现在按**真实入口**造桩：`stateOf(session, 'contextPressure')`。
 */
const projOf = (ret) => ({ stateOf: (_s, key) => (key === 'contextPressure' ? ret : undefined) })

/**
 * 造一个会记录"调了哪个方法、传了什么"的 agent 桩。
 *
 * 🔴🔴 **每个桩必须有自己的 `session.id`**（2026-10-12 修）：
 *    边沿触发把"上次报过的百分比"**按 session.id 记在内存表里**
 *    ⇒ 若所有用例都用同一个 id（我第一版写的 `'s-1'`），
 *      **前一个用例报过 80%，后一个用例就被判"不足一阶"而不报** ⇒
 *      **5 条假失败**（而产品完全正确）。
 *    ⭐ 判据：**凡"按 id 记状态"的实现，测试夹具就必须给每个用例独立的 id** ——
 *       否则用例之间会通过那张表互相污染（本项目"设计 N 次重复实验时先问每轮起点一样吗"的同族）。
 */
let nextSessionSeq = 0
const agentStub = (opts = {}) => {
  const calls = []
  nextSessionSeq += 1
  return {
    calls,
    // ⭐ `delegationDepth` 挂在 **session.header** 上（`SessionHeader`，同步可读）。
    session: {
      id: opts.id ?? `s-${nextSessionSeq}`,
      header: opts.depth === undefined ? {} : { delegationDepth: opts.depth },
    },
    // ⭐ `agent.options` 是**真实存在的字段**（`runtime-types.d.ts` 的 Agent 接口）
    //    —— 我拿它取 provider/model，再去问路由要窗口。
    options: { provider: opts.provider ?? 'p', model: opts.model ?? 'm' },
    inject: (m) => calls.push({ method: 'inject', message: m }),
    followup: (m) => calls.push({ method: 'followup', message: m }),
  }
}

/**
 * 造一个 `ctx.get` 桩（按服务名分派）。
 * @param svc - `sessionProjections` 桩。
 * @param extra - 额外服务（如 `llm`）—— ⭐ 窗口的**第二来源**要走它。
 */
const ctxOf = (svc, extra = {}) => ({
  get: (n) => (n === 'sessionProjections' ? svc : extra[n]),
})

/** 造一个 `llm` 桩：`resolveModelInfo` 回窗口。 */
const llmOf = (window) => ({
  resolveModelInfo: async () => ({ context: window === undefined ? {} : { contextWindow: window } }),
})

const CFG = { ...DEFAULT_CONFIG, contextReportOnTurnEnd: true, contextReportMinPercent: 50 }

// ══════════════════════════════════════════════════════════════
console.log('【1】⭐⭐ 三态：拿不到 / 无窗口 / 低于阈值 / 过阈值')
// ══════════════════════════════════════════════════════════════
{
  // ① 投影服务根本没挂
  const a1 = agentStub()
  const r1 = await reportContextUsage(ctxOf(undefined), CFG, a1)
  check('① 没挂 sessionProjections ⇒ 不注入', r1.injected === false, JSON.stringify(r1))
  check('  理由点名投影服务', r1.reason.includes('sessionProjections'), r1.reason)
  check('  没调任何 agent 方法', a1.calls.length === 0)

  // ② 挂了，但没有任何 usage（两个字段都缺）
  const a2 = agentStub()
  const r2 = await reportContextUsage(ctxOf(projOf({ surfaceTokens: 0 })), CFG, a2)
  check('② 无 usage ⇒ 不注入', r2.injected === false, JSON.stringify(r2))
  check('  没调任何 agent 方法', a2.calls.length === 0)

  // ③ 有 usage、两边都没窗口 ⇒ ⭐ **降级成只报绝对值**（不是不报，见【7】）
  const a3 = agentStub()
  const r3 = await reportContextUsage(ctxOf(projOf({ pressureTokens: 90000 })), CFG, a3)
  check('③ 无窗口 ⇒ **仍注入**（降级报绝对值；旧版这里是不报 ⇒ 永久失效）',
    r3.injected === true, JSON.stringify(r3))

  // ④ 低于阈值
  const a4 = agentStub()
  const r4 = await reportContextUsage(ctxOf(projOf({ pressureTokens: 10000, contextWindow: 100000 })), CFG, a4)
  check('④ 10% < 50% ⇒ 不注入', r4.injected === false, JSON.stringify(r4))
  check('  理由带两个数（占用与阈值）', r4.reason.includes('10%') && r4.reason.includes('50%'), r4.reason)
  check('  没调任何 agent 方法', a4.calls.length === 0)

  // ⑤ 过阈值 ⇒ 注入
  const a5 = agentStub()
  const r5 = await reportContextUsage(ctxOf(projOf({ pressureTokens: 60000, contextWindow: 100000 })), CFG, a5)
  check('⑤ 60% ≥ 50% ⇒ 注入', r5.injected === true, JSON.stringify(r5))
  check('  结论带上百分比', r5.percent === 60, String(r5.percent))
  check('  **只调了 inject、没调 followup**',
    a5.calls.length === 1 && a5.calls[0].method === 'inject',
    JSON.stringify(a5.calls.map((c) => c.method)))
}

// ══════════════════════════════════════════════════════════════
console.log('【2】⭐⭐⭐ 优先用 projectedTokens（它能反映 compaction）')
// ══════════════════════════════════════════════════════════════
{
  const both = readContextUsage(
    ctxOf(projOf({ pressureTokens: 40000, projectedTokens: 70000, contextWindow: 100000 })),
    { id: 's' },
  )
  check('两个都在时，用 projected（70%）而不是 pressure（40%）',
    both?.percent === 70 && both?.source === 'projected', JSON.stringify(both))

  const onlyPressure = readContextUsage(
    ctxOf(projOf({ pressureTokens: 55000, contextWindow: 100000 })),
    { id: 's' },
  )
  check('只有 pressure 时退回它', onlyPressure?.percent === 55 && onlyPressure?.source === 'pressure',
    JSON.stringify(onlyPressure))

  // ⚠️ 反证：有 projected 时**不能**退回 pressure
  const a = agentStub()
  const r = await reportContextUsage(
    ctxOf(projOf({ pressureTokens: 10000, projectedTokens: 80000, contextWindow: 100000 })),
    CFG, a,
  )
  check('⭐ 反证：pressure 只有 10%，但 projected 80% ⇒ 仍要注入',
    r.injected === true && r.percent === 80, JSON.stringify(r))
}

// ══════════════════════════════════════════════════════════════
console.log('【3】⭐⭐⭐ 注入文本：只给事实，不给动作（本功能的边界）')
// ══════════════════════════════════════════════════════════════
{
  const text = renderContextUsage({ window: 100000, used: 60000, percent: 60, source: 'projected' })
  check('带窗口与百分比', text.includes('100,000') && text.includes('60%'), text)
  check('⭐ 有"若你的提示词中规定了…否则忽略"这句（把决定权留给用户）',
    text.includes('提示词') && text.includes('忽略'), text)
  // 🔴 反证：插件**不许**自己规定任何阈值动作
  const forbidden = ['fork', '子代理', 'handoff', '沉淀', '你必须', '立即']
  const hit = forbidden.filter((w) => text.includes(w))
  check('🔴 反证：文本里没有插件自定的动作词', hit.length === 0, `命中：${hit.join(',')}`)

  // 无窗口时的措辞（不能编一个百分比出来）
  const noWin = renderContextUsage({ used: 90000, source: 'pressure' })
  check('无窗口 ⇒ 如实说"未上报窗口"、且不出现百分比',
    noWin.includes('未上报') && !/\d+%/.test(noWin), noWin)
}

// ══════════════════════════════════════════════════════════════
console.log('【4】⭐⭐ 开关与载荷边界')
// ══════════════════════════════════════════════════════════════
{
  const a = agentStub()
  const off = await reportContextUsage(
    ctxOf(projOf({ pressureTokens: 90000, contextWindow: 100000 })),
    { ...CFG, contextReportOnTurnEnd: false }, a,
  )
  check('开关关 ⇒ 不注入', off.injected === false && off.reason.includes('开关'), JSON.stringify(off))
  check('  没调 agent', a.calls.length === 0)

  const noAgent = await reportContextUsage(ctxOf(projOf({ pressureTokens: 90000, contextWindow: 100000 })), CFG, undefined)
  check('没有 agent ⇒ 不注入且不抛', noAgent.injected === false, JSON.stringify(noAgent))

  const badAgent = await reportContextUsage(
    ctxOf(projOf({ pressureTokens: 90000, contextWindow: 100000 })), CFG, { session: {} },
  )
  check('agent 没有 inject ⇒ 不注入且不抛', badAgent.injected === false, JSON.stringify(badAgent))

  // 🔴 测量本身抛异常 ⇒ 吞掉，不能连累轮次
  const throwing = { measure: () => { throw new Error('boom') } }
  const t = await reportContextUsage(ctxOf(throwing), CFG, agentStub())
  check('🔴 测量抛异常 ⇒ 吞掉、不注入（不能毁掉轮次）', t.injected === false, JSON.stringify(t))
}

// ══════════════════════════════════════════════════════════════
console.log('【5】⭐⭐⭐ 注册：关着 ⇒ 一个监听器都不挂')
// ══════════════════════════════════════════════════════════════
{
  const handlers = []
  const fakeCtx = { on: (ev, fn) => handlers.push({ ev, fn }), get: () => undefined }

  const hookedOff = registerContextReport({ ctx: fakeCtx, config: { ...CFG, contextReportOnTurnEnd: false } })
  check('⭐ 开关关 ⇒ 返回 false（诊断会记 skipped）', hookedOff === false)
  check('  且**一个监听器都没挂**', handlers.length === 0, String(handlers.length))

  const hookedOn = registerContextReport({ ctx: fakeCtx, config: CFG })
  check('开关开 ⇒ 返回 true', hookedOn === true)
  check('  挂了 1 个监听器', handlers.length === 1, String(handlers.length))
  check('  事件名是 agent/turn-stopping', handlers[0]?.ev === 'agent/turn-stopping', handlers[0]?.ev)

  // 钩子本身**不能抛**（抛了会毁掉整个轮次）
  let threw = false
  try { handlers[0].fn({}) } catch { threw = true }
  check('🔴 钩子收到空载荷也不抛（钩子异常会毁掉轮次）', threw === false)

}

// ══════════════════════════════════════════════════════════════
console.log('【6】⭐⭐⭐ 静态反证：不得再从 `tokenMeter.measure()` 读那三个字段')
// ══════════════════════════════════════════════════════════════
// 🔴🔴 **这是本次真 bug 的防线**（2026-10-12）：
//    第一版从 `ctx.get('tokenMeter').measure(session)` 读
//    `pressureTokens` / `projectedTokens` / `contextWindow`，
//    而**那三个字段不在 measure() 的返回里**（实测返回是
//    `{logRevision, baseline, surfaceDeltaTokens, totalTokens, surfaceTokens, nodes}`）
//    ⇒ 每次都走"拿不到测量"那一支早退 ⇒ **一行都没注入过，且不报错**。
//
//    ⚠️ 套件当时**全绿**，因为桩喂了不存在的形状（夹具照想象写）。
//    ⇒ 光改对代码不够，**还要有一条能报红的检查**盯着它别回来。
//    ⭐ 判据：这类"调用了一个方法、却读了它没有的字段"的错，
//       **运行时是静默的**（字段 just undefined），只有静态核对方法名/字段名才拦得住。
{
  const src = readFileSync(new URL('../src/context-report.ts', import.meta.url), 'utf8')
  // 去掉注释，免得注释里提到旧写法就假红（本项目踩过：修复说明里逐字引用了错代码）。
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('🔴 源码里**没有** `tokenMeter` 这个服务名', !/tokenMeter/.test(code),
    '又回去读 measure() 了？那三个字段不在它的返回里')
  check('🔴 源码里**没有** `.measure(` 调用', !/\.measure\s*\(/.test(code),
    'measure() 返回 totalTokens/surfaceTokens，不是 pressure/projected/contextWindow')
  check('⭐ 走的是 `sessionProjections` 的 `contextPressure` 投影',
    /sessionProjections/.test(code) && /contextPressure/.test(code))
}

// ══════════════════════════════════════════════════════════════
console.log('【7】⭐⭐⭐ 投影不给窗口时，向路由要（本机生产就是这个情形）')
// ══════════════════════════════════════════════════════════════
// 🔴 **这是用户实测撞到的第二个坑**（2026-10-12）：
//    本机 `/api/hot` 的 `budget.contextWindow` **恒为 null、basis=fallback**
//    ⇒ `contextPressure` 投影**不给窗口** ⇒ 只有投影那一路的话 `percent` 永远算不出来
//    ⇒ 功能**永久静默失效**（用户看到的就是"什么都没发生"）。
//    ✅ 兜底：拿 `agent.options.provider/model` 去 `ctx.llm.resolveModelInfo()` 问一次
//       （`token-meter` 的 README 明说"模型容量……可通过 resolveModelInfo().context 获取"；
//        本项目 `hot-watch.ts` 的 `resolveContextWindow` 早有同款实现）。
{
  // ① 投影不给窗口，但 llm 能给 ⇒ 必须算出百分比并注入
  const a = agentStub()
  const r = await reportContextUsage(
    ctxOf(projOf({ pressureTokens: 80000 }), { llm: llmOf(100000) }),
    CFG, a,
  )
  check('⭐ 投影无窗口 + llm 有窗口 ⇒ 算出 80% 并注入',
    r.injected === true && r.percent === 80, JSON.stringify(r))

  // ② 两边都没有窗口 ⇒ 仍然注入（降级成"只报绝对值"），不是整条不报
  const a2 = agentStub()
  const r2 = await reportContextUsage(
    ctxOf(projOf({ pressureTokens: 80000 }), { llm: llmOf(undefined) }),
    CFG, a2,
  )
  check('⭐ 两边都没窗口 ⇒ **仍然注入**（降级报绝对值，不是永久失效）',
    r2.injected === true, JSON.stringify(r2))
  check('  此时 reason 里如实写"无窗口"', r2.reason.includes('无窗口'), r2.reason)
  check('  且**不伪造** percent', r2.percent === undefined, String(r2.percent))

  const msg = a2.calls[0]?.message
  const txt = JSON.stringify(msg ?? {})
  check('  注入文本说明"本路由未上报窗口"', txt.includes('未上报'), txt.slice(0, 200))
  check('🔴 文本里**不出现**编造的百分比（没有分母就不能给小数）', !/\d+%/.test(txt), txt.slice(0, 200))

  // ③ 投影有窗口 ⇒ 不该再去问 llm（省一次查询）
  let asked = 0
  const a3 = agentStub()
  await reportContextUsage(
    ctxOf(projOf({ pressureTokens: 60000, contextWindow: 100000 }), {
      llm: { resolveModelInfo: async () => { asked += 1; return { context: { contextWindow: 1 } } } },
    }),
    CFG, a3,
  )
  check('⭐ 投影已给窗口 ⇒ 不再问 llm（省一次查询）', asked === 0, `问了 ${asked} 次`)

  // ④ llm 抛错 ⇒ 吞掉，不连累轮次
  const a4 = agentStub()
  const r4 = await reportContextUsage(
    ctxOf(projOf({ pressureTokens: 80000 }), {
      llm: { resolveModelInfo: async () => { throw new Error('boom') } },
    }),
    CFG, a4,
  )
  check('🔴 llm 抛错 ⇒ 吞掉、仍注入（不能毁掉轮次）', r4.injected === true, JSON.stringify(r4))
}

// ══════════════════════════════════════════════════════════════
console.log('【8】⭐⭐⭐ 防递归（插件的最后一道防线）')
// ══════════════════════════════════════════════════════════════
// 🔴 **这是本模块最要紧的一道门**（2026-10-12 补）：
//    演示规则的形态是「占用 ≥60% ⇒ fork 子代理去 handoff」，而 `subagent_fork`
//    **继承本会话上下文** ⇒ 子代理一出生就带着同样高的占用 ⇒ **它也会收到注入**
//    ⇒ 再 fork ⇒ **无限递归**。⚠️ 不报错，只是子会话越滚越多、token 猛烧。
//    ⭐ 与 `score-auto` 的第②道门同一判据（那里明写它是"防递归的唯一防线"）。
//    ⚠️ 提示词里也写了"你是子代理就别触发"，但**那只靠模型自觉** ——
//       模型漏检一次就炸 ⇒ **插件这道门才是真防线**，所以它必须有断言盯着。
{
  // ① 子代理 ⇒ 不注入（哪怕占用 90%、远过阈值）
  const a = agentStub({ depth: 1 })
  const r = await reportContextUsage(
    ctxOf(projOf({ pressureTokens: 900000, contextWindow: 1000000 }), { llm: llmOf(1000000) }),
    CFG, a,
  )
  check('🔴 子代理（depth=1）⇒ **不注入**（哪怕 90% 也拦住）',
    r.injected === false, JSON.stringify(r))
  check('  理由点名 delegationDepth 与"防递归"',
    r.reason.includes('delegationDepth') && r.reason.includes('递归'), r.reason)
  check('  没调任何 agent 方法', a.calls.length === 0)

  // ② 顶层会话（header 无该字段）⇒ 照常注入
  const a2 = agentStub({ depth: undefined })
  const r2 = await reportContextUsage(
    ctxOf(projOf({ pressureTokens: 900000, contextWindow: 1000000 }), { llm: llmOf(1000000) }),
    CFG, a2,
  )
  check('⭐ 顶层会话（header 无该字段 ⇒ 当 0）⇒ 照常注入', r2.injected === true, JSON.stringify(r2))

  // ③ depth = 0 显式 ⇒ 照常
  const a3 = agentStub({ depth: 0 })
  const r3 = await reportContextUsage(
    ctxOf(projOf({ pressureTokens: 900000, contextWindow: 1000000 }), { llm: llmOf(1000000) }),
    CFG, a3,
  )
  check('⭐ depth=0 显式 ⇒ 照常注入', r3.injected === true, JSON.stringify(r3))

  // ④ 嵌套更深（depth=2）⇒ 同样拦住
  const a4 = agentStub({ depth: 2 })
  const r4 = await reportContextUsage(
    ctxOf(projOf({ pressureTokens: 900000, contextWindow: 1000000 }), { llm: llmOf(1000000) }),
    CFG, a4,
  )
  check('🔴 更深嵌套（depth=2）⇒ 同样拦住', r4.injected === false, JSON.stringify(r4))
}

// ══════════════════════════════════════════════════════════════
console.log('【9】⭐⭐⭐ 边沿触发（治"过线后每轮刷屏"）')
// ══════════════════════════════════════════════════════════════
// 🔴 **用户实测撞到的第三个坑**（2026-10-12）：`contextReportMinPercent` 是**电平**判据 ——
//    一旦过线，只要没掉下去就**每轮都报**；而长会话占用**单调上涨**
//    ⇒ 从过线那一刻起**每轮一条、永不停止**。用户连收 **十几条**"不动作"的注入。
//    ⚠️ 而且它**自激**：注入文本占 token ⇒ 占用更高 ⇒ 下一轮更过线。
//    ⭐ 最糟的是：规则②「同一会话至多一次」一旦成立 ⇒ 后续每条**必然空操作**
//       ⇒ 那形态 = **保证无效的每轮噪音**。
{
  const cfg = { ...CFG, contextReportStepPercent: 10 }
  const runs = []

  // ⚠️ 记忆表按 `session.id` 存 ⇒ **必须用同一个 agent 桩**才测得到边沿。
  const shared = agentStub()
  shared.session.id = 's-edge'
  const driveSame = async (pct) => {
    const r = await reportContextUsage(
      ctxOf(projOf({ pressureTokens: pct * 10000, contextWindow: 1000000 }), { llm: llmOf(1000000) }),
      cfg, shared,
    )
    runs.push({ pct, injected: r.injected, reason: r.reason })
    return r
  }
  await driveSame(61)   // 首次过阈值 ⇒ 报
  await driveSame(62)   // 只涨 1% ⇒ 不报
  await driveSame(65)   // 涨 4% ⇒ 不报
  await driveSame(69)   // 累计涨 8% ⇒ 不报（不足一阶 10）
  await driveSame(71)   // 累计涨 10% ⇒ 报
  await driveSame(72)   // 又只涨 1% ⇒ 不报

  console.log('  序列:', runs.map((r) => `${r.pct}%:${r.injected ? '报' : '—'}`).join('  '))
  check('⭐ 61% 首次报', runs[0].injected === true, JSON.stringify(runs[0]))
  check('🔴 62% 不报（每轮都报的旧毛病已治）', runs[1].injected === false, JSON.stringify(runs[1]))
  check('🔴 65% 不报', runs[2].injected === false, JSON.stringify(runs[2]))
  check('🔴 69% 仍不报（累计 +8% < 一阶 10%）', runs[3].injected === false, JSON.stringify(runs[3]))
  check('⭐ 71% 报（累计 +10% 达一阶）', runs[4].injected === true, JSON.stringify(runs[4]))
  check('🔴 72% 又不报', runs[5].injected === false, JSON.stringify(runs[5]))
  check('  未报的理由点明"一阶"',
    String(runs[1].reason).includes('一阶'), runs[1].reason)

  // 反证：台阶=1 ⇒ 每涨 1% 都该报（证明台阶真的在起作用）
  const shared2 = agentStub()
  shared2.session.id = 's-step1'
  const cfg1 = { ...CFG, contextReportStepPercent: 1 }
  const q = (pct) => reportContextUsage(
    ctxOf(projOf({ pressureTokens: pct * 10000, contextWindow: 1000000 }), { llm: llmOf(1000000) }),
    cfg1, shared2,
  )
  const q1 = await q(70)
  const q2 = await q(71)
  check('🔴 反证：台阶=1 时 70%→71% 也该报（证明台阶在起作用）',
    q1.injected === true && q2.injected === true, `${q1.injected}/${q2.injected}`)
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
