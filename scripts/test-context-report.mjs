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
import { mkdtempSync, rmSync } from 'node:fs'
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

/** 造一个只实现 `measure` 的 tokenMeter 桩。 */
const meterOf = (ret) => ({ measure: () => ret })

/** 造一个会记录"调了哪个方法、传了什么"的 agent 桩。 */
const agentStub = () => {
  const calls = []
  return {
    calls,
    session: { id: 's-1' },
    inject: (m) => calls.push({ method: 'inject', message: m }),
    followup: (m) => calls.push({ method: 'followup', message: m }),
  }
}

/** 造一个 `ctx.get` 桩。 */
const ctxOf = (svc) => ({ get: (name) => (name === 'tokenMeter' ? svc : undefined) })

const CFG = { ...DEFAULT_CONFIG, contextReportOnTurnEnd: true, contextReportMinPercent: 50 }

// ══════════════════════════════════════════════════════════════
console.log('【1】⭐⭐ 三态：拿不到 / 无窗口 / 低于阈值 / 过阈值')
// ══════════════════════════════════════════════════════════════
{
  // ① tokenMeter 根本没挂
  const a1 = agentStub()
  const r1 = reportContextUsage(ctxOf(undefined), CFG, a1)
  check('① 没挂 tokenMeter ⇒ 不注入', r1.injected === false, JSON.stringify(r1))
  check('  理由点名 tokenMeter', r1.reason.includes('tokenMeter'), r1.reason)
  check('  没调任何 agent 方法', a1.calls.length === 0)

  // ② 挂了，但没有任何 usage（两个字段都缺）
  const a2 = agentStub()
  const r2 = reportContextUsage(ctxOf(meterOf({ surfaceTokens: 0 })), CFG, a2)
  check('② 无 usage ⇒ 不注入', r2.injected === false, JSON.stringify(r2))
  check('  没调任何 agent 方法', a2.calls.length === 0)

  // ③ 有 usage，但路由没上报窗口 ⇒ 算不出百分比 ⇒ 不报
  const a3 = agentStub()
  const r3 = reportContextUsage(ctxOf(meterOf({ pressureTokens: 90000 })), CFG, a3)
  check('③ 无窗口 ⇒ 不注入（没有百分比就没有判断价值）', r3.injected === false, JSON.stringify(r3))
  check('  理由点明窗口', r3.reason.includes('窗口'), r3.reason)

  // ④ 低于阈值
  const a4 = agentStub()
  const r4 = reportContextUsage(ctxOf(meterOf({ pressureTokens: 10000, contextWindow: 100000 })), CFG, a4)
  check('④ 10% < 50% ⇒ 不注入', r4.injected === false, JSON.stringify(r4))
  check('  理由带两个数（占用与阈值）', r4.reason.includes('10%') && r4.reason.includes('50%'), r4.reason)
  check('  没调任何 agent 方法', a4.calls.length === 0)

  // ⑤ 过阈值 ⇒ 注入
  const a5 = agentStub()
  const r5 = reportContextUsage(ctxOf(meterOf({ pressureTokens: 60000, contextWindow: 100000 })), CFG, a5)
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
    ctxOf(meterOf({ pressureTokens: 40000, projectedTokens: 70000, contextWindow: 100000 })),
    { id: 's' },
  )
  check('两个都在时，用 projected（70%）而不是 pressure（40%）',
    both?.percent === 70 && both?.source === 'projected', JSON.stringify(both))

  const onlyPressure = readContextUsage(
    ctxOf(meterOf({ pressureTokens: 55000, contextWindow: 100000 })),
    { id: 's' },
  )
  check('只有 pressure 时退回它', onlyPressure?.percent === 55 && onlyPressure?.source === 'pressure',
    JSON.stringify(onlyPressure))

  // ⚠️ 反证：有 projected 时**不能**退回 pressure
  const a = agentStub()
  const r = reportContextUsage(
    ctxOf(meterOf({ pressureTokens: 10000, projectedTokens: 80000, contextWindow: 100000 })),
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
  const off = reportContextUsage(
    ctxOf(meterOf({ pressureTokens: 90000, contextWindow: 100000 })),
    { ...CFG, contextReportOnTurnEnd: false }, a,
  )
  check('开关关 ⇒ 不注入', off.injected === false && off.reason.includes('开关'), JSON.stringify(off))
  check('  没调 agent', a.calls.length === 0)

  const noAgent = reportContextUsage(ctxOf(meterOf({ pressureTokens: 90000, contextWindow: 100000 })), CFG, undefined)
  check('没有 agent ⇒ 不注入且不抛', noAgent.injected === false, JSON.stringify(noAgent))

  const badAgent = reportContextUsage(
    ctxOf(meterOf({ pressureTokens: 90000, contextWindow: 100000 })), CFG, { session: {} },
  )
  check('agent 没有 inject ⇒ 不注入且不抛', badAgent.injected === false, JSON.stringify(badAgent))

  // 🔴 测量本身抛异常 ⇒ 吞掉，不能连累轮次
  const throwing = { measure: () => { throw new Error('boom') } }
  const t = reportContextUsage(ctxOf(throwing), CFG, agentStub())
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

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
