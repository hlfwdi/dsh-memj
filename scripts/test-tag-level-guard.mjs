/**
 * ⭐⭐⭐ **层级事故的回归测试**（决策 166）——用**生产上真实发生过的三处错误归并**当反例。
 *
 * ── 背景（真实事故，2026-09-28）────────────────────────────────────────────
 * 自动规范化在生产上跑了第一次，模型给出**三处错误的层级归并**：
 *
 * | 错误归并 | 为什么错 |
 * |---|---|
 * | `agent` ← `子代理`, `subagent` | **上位吞下位**：`agent` 是总类（主会话自己也是 agent），`子代理` 是特定实现形态 |
 * | `session` ← `会话` | **中英同义被并**：用户已裁定"中英不强行统一" |
 * | `钩子` ← `turn-stopping` | **通名吞具体名**：「钩子」这个入口词只剩一个实现，丢了区分度 |
 *
 * ⚠️ **提示词里本来就写了"不要合并不同层级"**（还举了 `前端` vs `UI` 的例子），
 *    但模型**没把例子的形态泛化到没列举的形态上**（中英混合、通名 vs 专名）。
 * ⇒ 优化：① 提示词改成**可自检的问句 + 反面清单**；② 输入里加**覆盖范围证据**。
 *
 * 🔴🔴 **本套件验的是"优化真的进了请求里"** ——
 *    因为这是**给模型的输入/措辞**，没法用纯函数断言它的"效果"，
 *    但可以断言"**那几条关键措辞与证据确实被拼进了 user 消息**"。
 *    ⭐ 判据要落在**真正发给模型的那段文本**上（本项目已有同族教训：
 *      "算出的量 ≠ 发出的量"）。
 *
 * ⚠️ 必须在 `pnpm run build` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-tag-level-guard.mjs
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-level-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const { runHandoff, normalizeTags, loadVocabulary, saveVocabulary, emptyVocabulary, seedVocabulary, DEFAULT_CONFIG } = mod

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

console.log(`库根: ${lib}\n`)

// ── 造夹具：故意让 agent/子代理、钩子/turn-stopping、会话/session 同时在场 ──
const E = (slug, title, tags) => ({
  slug, title, tags,
  desc: `${title}；当测试时读它。`,
  body: `### ${title}\n\n正文。`,
})
await runHandoff({
  project: 'p-lvl',
  projectDesc: '层级事故回归测试；当测试时读它。',
  entries: [
    // 总类 agent：跨不同话题的 4 条（覆盖广）
    E('a1', '主会话与 agent 身份', ['agent', 'session']),
    E('a2', 'agent 生命周期', ['agent', '钩子']),
    E('a3', 'agent 与 inbox', ['agent', '队列']),
    E('a4', 'agent 的唤醒方式', ['agent', '注入']),
    // 特定实现：只在 1 条上（覆盖窄）
    E('s1', '插件起子代理', ['子代理', 'subagents.start']),
    E('h1', 'turn-stopping 钩子', ['turn-stopping']),
    E('c1', '中文会话的说法', ['会话']),
  ],
}, { sessionId: 's1', config: { ...DEFAULT_CONFIG, themeCreation: 'loose' } })

// 词表：把库里的词都登记（模拟"播种后"的常态）
const nowIso = new Date().toISOString()
const vocab = emptyVocabulary(nowIso)
seedVocabulary(vocab, ['agent', 'session', '钩子', '子代理', 'subagents.start', 'turn-stopping', '会话', '队列', '注入'])
// ⚠️ 把水位线设早，让所有条目都进范围
vocab.lastRunAt = '2026-01-01T00:00:00.000Z'
await saveVocabulary(vocab)

// ── 打桩 LLM：**抓住真正发给模型的 user 消息** ──
let captured = ''
const ctx = {
  get: (n) => n === 'llm' ? {
    async *stream(options) {
      captured = String(options.messages?.[0]?.content?.[0]?.text ?? '')
      const answer = '{"merge":{},"add":{},"drop":{},"retag":{}}'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: answer }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
    },
  } : undefined,
}
const CFG = { ...DEFAULT_CONFIG, tagNormalizeProvider: 'stub', tagNormalizeModel: 'stub' }

const r = await normalizeTags(ctx, CFG, { includeBody: 'none' })
check('跑通了（有候选、真的调了模型）', r.ok && captured !== '', r.message.slice(0, 100))

console.log('')
// ══════════════════════════════════════════════════════════════
console.log('【1】⭐⭐⭐ 优化①：提示词里的"层级自检"确实进了 system')
// ══════════════════════════════════════════════════════════════
{
  // 🔴 **必须把水位线推回去**：上面那次 `normalizeTags` 已经推进了 `lastRunAt`
  //    ⇒ 再调时**范围为空 ⇒ 不调模型 ⇒ `sys` 永远是空串**（我第一版就是这么假失败的）。
  //    ⚠️ 这正是本项目"前置条件不成立 ⇒ 断言恒真/恒假"的老坑。
  const v1 = await loadVocabulary()
  v1.lastRunAt = '2026-01-01T00:00:00.000Z'
  await saveVocabulary(v1)

  let sys = ''
  const ctx2 = {
    get: (n) => n === 'llm' ? {
      async *stream(options) {
        sys = String(options.system ?? '')
        const a = '{"merge":{},"add":{},"drop":{},"retag":{}}'
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: a }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: a } }
      },
    } : undefined,
  }
  const r1b = await normalizeTags(ctx2, CFG, { includeBody: 'none' })
  // ⭐ 前置条件断言：真的调到了模型（否则下面的断言全是假绿）
  check('  ⭐ 前置：这次真的调到了模型（有候选）', r1b.scanned > 0 && sys !== '',
    `scanned=${r1b.scanned} sysLen=${sys.length}`)
  check('  system 非空', sys.length > 200, `实得 ${sys.length}`)
  check('⭐⭐ 含"LEVEL CHECK"（自检段）', sys.includes('LEVEL CHECK'))
  check('⭐⭐ 含那两个**问句**（而非只有例子）',
    sys.includes('general category') && sys.includes('specific form'),
    '要的是可自检的问句，不是举例')
  check('⭐⭐⭐ 反面清单点名 `agent vs 子代理`',
    sys.includes('agent vs 子代理'), '这正是生产上真出错的那一对')
  check('⭐⭐ 反面清单点名 `钩子 vs turn-stopping`', sys.includes('钩子 vs turn-stopping'))
  check('⭐⭐ 反面清单点名 `会话 vs session`（中英不统一）',
    sys.includes('会话 vs session'))
  check('  ⭐ 明说"中英保持分开"（用户裁定）',
    sys.includes('Chinese and English') && sys.includes('do NOT unify'))
  check('  ⭐ 明说"related is not the same as same"（防"相关就合并"）',
    sys.includes('Related is not the same as same'))
  check('  ⭐ 明说"频次差本身是层级不同的提示"',
    sys.includes('frequency difference is itself a hint'))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【2】⭐⭐⭐ 优化②：覆盖范围证据确实进了 user 消息')
// ══════════════════════════════════════════════════════════════
{
  // `agent` 跨 4 条 ⇒ 应显示 "across N entries" + 样本标题
  const agentLine = captured.split('\n').findIndex((l) => l.startsWith('- agent  ['))
  check('  找得到 `agent` 那一行', agentLine >= 0)
  if (agentLine >= 0) {
    const next = captured.split('\n')[agentLine + 1] ?? ''
    console.log(`     agent 行: ${captured.split('\n')[agentLine].trim()}`)
    console.log(`     覆盖行  : ${next.trim()}`)
    check('⭐⭐ `agent` 带上了"覆盖 N 条"证据', next.includes('across'), next)
    check('  ⭐ 且带样本标题（让模型看得出它是总类）', next.includes('「'), next)
  }
  // `子代理` 只 1 条 ⇒ 应显示 only 1 entry
  const subLine = captured.split('\n').findIndex((l) => l.startsWith('- 子代理  ['))
  check('  找得到 `子代理` 那一行', subLine >= 0)
  if (subLine >= 0) {
    const lines = captured.split('\n')
    console.log(`     子代理行: ${lines[subLine].trim()}`)
    // 覆盖 1 条的**不给**覆盖行（设计如此：单条谈不上总类）
    const next = lines[subLine + 1] ?? ''
    check('⭐ `子代理`（只 1 条）**不带**覆盖行（省 token 且判据用不上）',
      !next.includes('across') && !next.includes('only 1 entry'), next)
  }
  check('⭐⭐ 对比可就位：`agent` 跨多条 vs `子代理` 单条 ⇒ 层级一眼可见',
    captured.includes('across') && !captured.includes('- 子代理  [frequency: 4]'))

  // ⚠️ 覆盖证据的上限说明（只在超限时出现；本夹具没超，不该出现）
  check('  ⭐ 未超上限时**不出现**那条说明（不制造噪音）',
    !captured.includes('coverage evidence shown for the first'))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【3】⭐ 覆盖样本取自【全库】而不是本轮范围（否则层级判据会错）')
// ══════════════════════════════════════════════════════════════
{
  // 把水位线推到"只留 1 条"，但 agent 在全库仍跨 4 条 ⇒ 覆盖证据应仍显示 4
  const v2 = await loadVocabulary()
  const snaps = await mod.scanLibrary({ includeArchived: true })
  const withAgent = snaps.covers.filter((c) => c.cover.tags.includes('agent'))
  // 取最新的一条当水位线 ⇒ 范围只含它
  const times = withAgent.map((c) => c.cover.updatedAt).filter((t) => t !== '').sort()
  v2.lastRunAt = times[times.length - 2] ?? times[0] ?? '2026-01-01T00:00:00.000Z'
  await saveVocabulary(v2)

  let cap2 = ''
  const ctx3 = {
    get: (n) => n === 'llm' ? {
      async *stream(options) {
        cap2 = String(options.messages?.[0]?.content?.[0]?.text ?? '')
        const a = '{"merge":{},"add":{},"drop":{},"retag":{}}'
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: a }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: a } }
      },
    } : undefined,
  }
  const r2 = await normalizeTags(ctx3, CFG, { includeBody: 'none' })
  console.log(`     本轮范围: ${r2.scanned} 条`)
  if (r2.scanned > 0 && cap2 !== '') {
    const line = cap2.split('\n').find((l) => l.startsWith('- agent  ['))
    if (line !== undefined) {
      const i = cap2.split('\n').indexOf(line)
      const cov = cap2.split('\n')[i + 1] ?? ''
      console.log(`     agent 行: ${line.trim()}`)
      console.log(`     覆盖行  : ${cov.trim()}`)
      check('⭐⭐ 覆盖证据是**全库**的（agent 仍显示跨 4 条，尽管本轮只碰 1 条）',
        cov.includes('across 4 entries'), cov)
    } else {
      check('  （本轮范围内没有 agent，跳过这条）', true)
    }
  } else {
    check('  （本轮范围为空，跳过这条）', true)
  }
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
