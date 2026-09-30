/**
 * ⭐⭐⭐ 上下文组装 + **预算拆批**的测试（用户 2026-09-26 定稿方案）。
 *
 * ⚠️ **本套件的前身测的是"裁切"**（`planBudget` / `trimCandidates`）——
 *    那套已被**整体替代**（装不下就**拆批并发**，**一条候选都不丢**）⇒ 断言全部重写。
 *
 * 覆盖：
 *   ① token 估算器（系数据实测标定；**必须偏保守**，且**含输出**）
 *   ② turn 划分（⚠️ **memj 注入也是 user 角色**，不能当 turn 边界）
 *   ③ 上下文组装（历史轮丢思考/工具；**当前轮思考独立返回**；注入去重）
 *   ④ ⭐⭐ 思考是**独立字段**（`thinking`），不与背景混成一坨
 *   ⑤ 预算与拆批（上下文名义预算 → 剩余给候选 → 按 token 算批数 → 超旋钮则压上下文）
 *   ⑥ 两条通路的预算规则（JEV 单请求预算旋钮 / chat 窗口 60%；chat 不拆批）
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LIB = join(ROOT, 'lib', 'index.js')
const SRC = join(ROOT, 'src')

let pass = 0, fail = 0
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`) }
}

const mod = await import('file://' + LIB.replace(/\\/g, '/'))

const um = (text) => ({ role: 'user', content: [{ type: 'text', text }] })
const inj = (text) => ({ role: 'user', content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'dsh-memj', form: 'instructions' } })
const am = (blocks) => ({ role: 'assistant', content: blocks })
const txt = (t) => ({ type: 'text', text: t })
const rea = (t) => ({ type: 'reasoning', text: t })
const call = (t) => ({ type: 'tool-call', name: t, arguments: '{}' })
const mk = (id) => ({ id, project: 'p', theme: [], kind: 'fact', title: id, desc: 'd', titleEn: id, descEn: 'd' })

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【1】token 估算器（系数实测标定，必须**偏保守**）')
{
  check('导出 estimateTokens / estimatePoolTokens / estimateCandidateTokens',
    typeof mod.estimateTokens === 'function' && typeof mod.estimatePoolTokens === 'function'
    && typeof mod.estimateCandidateTokens === 'function')

  const zh = mod.estimateTokens('这是一段中文文本，用来测试')
  const en = mod.estimateTokens('this is a piece of english text')
  // ⚠️ 比"平均每字符"会被两件事干扰：
  //    ① **构成**（英文样本里的空格进 ASCII 桶 0.75、中文样本里的全角逗号也一样）；
  //    ② ⭐ **`Math.ceil` 的量化** —— 2 个字符时 `ceil` 把小数值抬成 1（1.5 与 0.5 都是它造成的）。
  //    ⇒ ⭐ 判据要用**足够长的纯样本**（这里 200 字符），否则测的是量化误差、不是系数。
  const pureHan = mod.estimateTokens('中'.repeat(200)) / 200
  const pureLatin = mod.estimateTokens('a'.repeat(200)) / 200
  console.log(`     纯汉字 ${pureHan.toFixed(3)} tok/字符；纯拉丁 ${pureLatin.toFixed(3)} tok/字符`)
  check('⭐⭐ 汉字每字符的估算 ≥ 4× 拉丁字母（实测 1.006 vs 0.205）',
    pureHan >= pureLatin * 4, `${pureHan} vs ${pureLatin}`)
  check('⭐ 含空格的真实英文串也不会被估成 0', en > 0)
  check('⭐ 空串 ⇒ 0', mod.estimateTokens('') === 0)
  // 🔴🔴 2026-09-26 重新标定：上一版系数**低估** ⇒ 生产上 **3 批全 400**
  check('⭐⭐⭐ 反证：1000 个中文字的估算 ≥ **实测 1006**（上一版取 0.85 ⇒ 低估 18%）',
    mod.estimateTokens('中'.repeat(1000)) >= 1006, String(mod.estimateTokens('中'.repeat(1000))))
  check('⭐⭐ 反证：1000 个英文字母的估算 ≥ 实测 205', mod.estimateTokens('a'.repeat(1000)) >= 205)
  // ⭐ 关键判据：ASCII 标点 与 全角排版符 **必须分开算**（真实 0.684 vs 1.006，差 4 倍）
  const asciiPunct = mod.estimateTokens('{}[]();=<>|&*#-+ \n\t'.repeat(50))
  const widePunct = mod.estimateTokens('\u2014\u201C\u201D\u3010\u3011\u2026\u00B7'.repeat(50))
  console.log(`     ASCII 标点 850 字符 ⇒ ${asciiPunct} tok；全角排版符 350 字符 ⇒ ${widePunct} tok`)
  check('⭐⭐⭐ **全角排版符的每字符估算明显高于 ASCII 标点**（上一版混成一桶 ⇒ 低估 139%）',
    widePunct / 350 > (asciiPunct / 850) * 1.3,
    `wide/字=${(widePunct / 350).toFixed(3)} ascii/字=${(asciiPunct / 850).toFixed(3)}`)
  check('⭐⭐ `TOKEN_COEF` 里有 `ascii` 与 `wide` **两个**系数（不再只有一个 `code`）',
    typeof mod.TOKEN_COEF.ascii === 'number' && typeof mod.TOKEN_COEF.wide === 'number')
  check('⭐⭐ `wide` 与 `han` 都是 ~1.0 量级（实测两者同价）',
    mod.TOKEN_COEF.wide >= 1.0 && mod.TOKEN_COEF.han >= 1.0)
  check('⭐⭐ 候选池每条的估算 ≥ 实测 210.7（保守）', mod.estimatePoolTokens(1) >= 211)
  check('⭐ 候选池估算随条数线性', mod.estimatePoolTokens(100) === mod.estimatePoolTokens(1) * 100)
  // 🔴 含输出（漏算就会"以为没超、实际 400"）
  check('⭐⭐ `estimateCandidateTokens` = 输入 + 输出（**含输出**）',
    mod.estimateCandidateTokens(10) === mod.estimatePoolTokens(10) + mod.estimatePoolOutputTokens(10))
  check('⭐ 输出成本 > 0 且随条数线性',
    mod.TOKEN_COEF.perCandidateOutput > 0
    && mod.estimatePoolOutputTokens(100) === mod.estimatePoolOutputTokens(1) * 100)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【2】turn 划分 —— ⚠️ memj 注入也是 user 角色，不能当 turn 边界')
{
  const msgs = [
    um('第一个问题'),
    am([rea('思考甲'), txt('回答甲'), call('search')]),
    um('第二个问题'),
    inj('注入的知识 A'),
    am([txt('回答乙')]),
    um('第三个问题'),
    inj('注入的知识 B'),
    am([rea('思考丙'), txt('回答丙')]),
  ]
  const turns = mod.splitTurns(msgs)
  check('⭐⭐ **turn 数 = 真实用户输入数（3）**，注入**没有**另开轮', turns.length === 3, String(turns.length))
  check('⭐⭐ 历史轮的 **reasoning / tool-call 都被丢弃**',
    turns.every((t) => !t.assistantTexts.some((x) => /思考甲|思考丙|search/.test(x))))
  check('⭐ LLM 的 text 被保留', turns[0].assistantTexts.includes('回答甲'))
  check('⭐⭐ 注入**挂在当前开着的轮**，不另起轮也不丢',
    turns[1].injections[0]?.text === '注入的知识 A')
  const dup = mod.splitTurns([um('问题'), inj('同一段注入文本'), inj('同一段注入文本')])
  check('⭐⭐ 同一段注入**只留一份**（去重）', dup[0].injections.length === 1)
  const two = mod.splitTurns([um('q'), inj('注入甲'), inj('注入乙')])
  check('⭐ 反证：**不同**的注入都保留（去重不能误杀）', two[0].injections.length === 2)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【3】上下文组装：当前轮思考保留，历史轮思考丢弃')
{
  const msgs = [
    um('很久以前的问题'),
    am([txt('很久以前的回答' + 'x'.repeat(2000))]),
    um('最近的问题'),
    am([txt('最近的回答')]),
  ]
  const full = mod.assembleContext({ messages: msgs, currentReasoning: '当前思考', reasoningCap: 800, budgetTokens: 0 })
  check('⭐ 预算 0（不检查）⇒ 保留全部轮', full.keptTurns === 2 && full.droppedTurns === 0)
  check('⭐⭐ 当前轮思考在 `thinking` 字段里', full.thinking === '当前思考')
  check('⭐ 历史轮的文本在背景里', full.background.includes('很久以前的问题'))
  check('⭐⭐ 反证：历史轮的思考**不在**背景里（方案要求丢弃）',
    !full.background.includes('思考甲'))

  // 🔴 思考**独立**，不混在背景里
  check('⭐⭐⭐ `background` **不含** thinking（两者是分开的字段）',
    !full.background.includes('当前思考'))
  check('⭐ 合成文本 `text` 里两段都在（chat 通路用）',
    full.text.includes('当前思考') && full.text.includes('很久以前的问题'))

  // 预算紧 ⇒ 只留本轮
  const early = `[user] 很久以前的问题\n[assistant] 很久以前的回答${'x'.repeat(2000)}`
  const tightBudget = Math.max(1, Math.floor(mod.estimateTokens(early) / 2))
  const tight = mod.assembleContext({ messages: msgs, currentReasoning: '当前思考', reasoningCap: 800, budgetTokens: tightBudget })
  check('⭐⭐ 预算装不下早轮 ⇒ 只留本轮（从较早的裁）', tight.keptTurns === 1, `kept=${tight.keptTurns}`)
  check('⭐⭐ **裁到只剩本轮** ⇒ `atFloor = true`', tight.atFloor === true)
  check('⭐⭐⭐ 反证：**当前轮的思考在地板时也必须留**（它是判据）',
    tight.thinking === '当前思考' && tight.text.includes('当前思考'))
  check('⭐ 裁掉的是较早那轮', !tight.background.includes('很久以前的问题'))

  // reasoning 上限
  const long = 'y'.repeat(5000)
  const capped = mod.assembleContext({ messages: msgs, currentReasoning: long, reasoningCap: 100, budgetTokens: 0 })
  check('⭐ 思考超长 ⇒ 截到上限', capped.thinking.length === 100, String(capped.thinking.length))
  check('⭐ 截断保留**尾部**（最近的思考更相关）', capped.thinking === 'y'.repeat(100))
  const none = mod.assembleContext({ messages: msgs, currentReasoning: '   ', reasoningCap: 800, budgetTokens: 0 })
  check('⭐ 反证：没有思考时 `thinking` 是空串（不编造）', none.thinking === '')
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【4】⭐⭐ 预算与拆批（替代裁切）')
{
  const msgs = [um('当前问题'), am([txt('回答')])]
  const pool = (n) => Array.from({ length: n }, (_, i) => mk(`c${i}`))

  // ① 候选少 ⇒ 1 批
  const few = mod.planInjection({
    messages: msgs, currentReasoning: 'th', reasoningCap: 800, pool: pool(10),
    totalBudget: 40000, contextBudget: 20000, maxBatches: 3,
  })
  check('⭐ 候选很少 ⇒ **只拆 1 批**', few.batches.length === 1, String(few.batches.length))
  check('⭐⭐ `batchesOverKnob = false`', few.batchesOverKnob === false)

  // ② 候选多 ⇒ 拆多批，**一条都不丢**
  const many = mod.planInjection({
    messages: msgs, currentReasoning: 'th', reasoningCap: 800, pool: pool(200),
    totalBudget: 40000, contextBudget: 20000, maxBatches: 3,
  })
  const total = many.batches.reduce((s, b) => s + b.length, 0)
  console.log(`     200 条候选 ⇒ ${many.batches.length} 批（每批 ${many.batches.map((b) => b.length).join('/')}），`
    + `上下文 ${many.contextTokens} tok，每批 ≈[${many.perBatchTokens.join(',')}]`)
  check('⭐⭐⭐ **候选一条都没丢**（拆批的核心承诺）', total === 200, String(total))
  check('⭐⭐ 批数 > 1（确实拆了）', many.batches.length > 1)
  check('⭐⭐ 每批的估算都在预算内（含输出）',
    many.perBatchTokens.every((t) => t <= 40000), JSON.stringify(many.perBatchTokens))
  check('⭐⭐ 反证：**没有"裁候选"这回事了**', many.batches.flat().length === 200)

  // ③ 超过并发旋钮 ⇒ 压上下文（关键行为）
  const tight = mod.planInjection({
    messages: [um('问题' + 'z'.repeat(4000)), am([txt('答复' + 'w'.repeat(4000))])],
    currentReasoning: 'th'.repeat(300), reasoningCap: 5000,
    pool: pool(400), totalBudget: 20000, contextBudget: 20000, maxBatches: 2,
  })
  console.log(`     400 条 + 小预算 20k + 并发 2 ⇒ ${tight.batches.length} 批，`
    + `上下文压到 ${tight.contextTokens} tok（名义 ${tight.contextBudget}），超旋钮=${tight.batchesOverKnob}`)
  check('⭐⭐ 批数超旋钮 ⇒ 如实标记（不假装）',
    tight.batchesOverKnob === true || tight.batches.length <= 2, `批次=${tight.batches.length}`)
  check('⭐⭐ 上下文被**往下压**（不超名义预算）', tight.contextTokens <= 20000)
  check('⭐⭐⭐ 反证：**压到地板也仍保留全部候选**', tight.batches.flat().length === 400)

  // ④ 地板：上下文压到只剩本轮
  const floor = mod.planInjection({
    messages: [um('问题' + 'z'.repeat(9000)), am([txt('答复' + 'w'.repeat(9000))])],
    currentReasoning: 'th'.repeat(400), reasoningCap: 5000,
    pool: pool(300), totalBudget: 12000, contextBudget: 20000, maxBatches: 2,
  })
  check('⭐⭐ 上下文到**地板**（只剩本轮）⇒ `atFloor = true`', floor.ctx.atFloor === true,
    `kept=${floor.ctx.keptTurns}/${floor.ctx.totalTurns}`)
  check('⭐⭐⭐ 地板时**思考依然保留**（判据不能丢）', floor.thinking.length > 0)
  check('⭐⭐⭐ 地板时**候选依然全在**', floor.batches.flat().length === 300)

  // ⑤ maxBatches <= 1 ⇒ 不拆批（chat 通路）
  const chat = mod.planInjection({
    messages: msgs, currentReasoning: 'th', reasoningCap: 800, pool: pool(150),
    totalBudget: 40000, contextBudget: 20000, maxBatches: 1,
  })
  check('⭐⭐ `maxBatches=1` ⇒ **不拆批**（chat 通路）', chat.batches.length === 1,
    String(chat.batches.length))
  check('⭐⭐ 且该批**包含全部候选**', chat.batches[0].length === 150, String(chat.batches[0].length))

  // ⑥ 空池
  const empty = mod.planInjection({
    messages: msgs, currentReasoning: 'th', reasoningCap: 800, pool: [],
    totalBudget: 40000, contextBudget: 20000, maxBatches: 3,
  })
  check('⭐ 空候选池 ⇒ 0 批（不抛）', empty.batches.length === 0)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【5】两条通路的预算规则（JEV 单请求旋钮 / chat 窗口 60%）')
{
  const cfgJev = { ...mod.DEFAULT_CONFIG, activeInjectChannel: 'jev', activeInjectBudget: true, activeInjectBudgetTokens: 40000 }
  check('⭐ JEV：用 `activeInjectBudgetTokens`', mod.budgetTokensFor(cfgJev, undefined) === 40000)
  check('⭐⭐ JEV：开关关掉 ⇒ **0 = 不检查**',
    mod.budgetTokensFor({ ...cfgJev, activeInjectBudget: false }, undefined) === 0)
  check('⭐ JEV：**不受**上下文窗口影响', mod.budgetTokensFor(cfgJev, 1000000) === 40000)

  const cfgChat = { ...mod.DEFAULT_CONFIG, activeInjectChannel: 'chat', activeInjectChatWindowRatio: 0.6 }
  check('⭐⭐ chat：窗口 × 60%', mod.budgetTokensFor(cfgChat, 100000) === 60000)
  check('⭐⭐ chat：**拿不到窗口 ⇒ 0 = 不检查**',
    mod.budgetTokensFor(cfgChat, undefined) === 0)

  check('⭐ 默认单请求预算 = 40000', mod.DEFAULT_CONFIG.activeInjectBudgetTokens === 40000)
  check('⭐⭐ 默认上下文名义预算 = 20000（用户定的）', mod.DEFAULT_CONFIG.activeInjectContextTokens === 20000)
  check('⭐⭐ 默认并发批数 = 3', mod.DEFAULT_CONFIG.activeInjectConcurrency === 3)
  check('⭐ 默认比例 = 0.6', mod.DEFAULT_CONFIG.activeInjectChatWindowRatio === 0.6)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【6】静态反证：旧的"裁切"必须**整体删掉**（不能留两份实现）')
{
  const ctxSrc = readFileSync(join(SRC, 'active-context.ts'), 'utf8')
  const recallSrc = readFileSync(join(SRC, 'active-recall.ts'), 'utf8')
  const ctxCode = ctxSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const recallCode = recallSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  check('⭐⭐ 反证：`planBudget` 已删除（被 `planInjection` 取代）',
    !/function planBudget/.test(ctxCode) && /function planInjection/.test(ctxCode))
  check('⭐⭐ 反证：`trimCandidates` 已删除（不再裁候选池）',
    !/function trimCandidates/.test(ctxCode))
  check('⭐⭐ 反证：`lexicalPrefilter` 仍是删掉的状态',
    !/function lexicalPrefilter/.test(recallCode))
  check('⭐⭐ 反证：`active-recall` 里没有 `updatedAt` 残留（它只为"按时间裁"存在）',
    !/updatedAt/.test(recallCode))
  check('⭐ `en-index.ts` 也删掉了 `updatedAt` 字段',
    !/updatedAt/.test(readFileSync(join(SRC, 'en-index.ts'), 'utf8')))
  check('⭐ `active-recall` 用 `planInjection` 而不是 `planBudget`',
    /planInjection\(/.test(recallCode) && !/planBudget\(/.test(recallCode))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【7】⭐⭐ JEV 并发：提问必须**点名 `current_thinking`**')
{
  const recallSrc = readFileSync(join(SRC, 'active-recall.ts'), 'utf8')
  // 实测：拆字段 + 点名提问 ⇒ 96/96 条分数上升（+0.085~0.109）；**只拆字段不改提问反而降**
  check('⭐⭐⭐ 候选提问**点名 `current_thinking`**（实测关键在于这句）',
    /current_thinking/.test(recallSrc))
  check('⭐⭐ 且声明 `background` **只是背景、不要拿它判**',
    /supporting material only/.test(recallSrc))
  check('⭐⭐ `state` 里 `current_thinking` 是**独立字段**',
    /state\['current_thinking'\]/.test(recallSrc))
  check('⭐⭐ 并发发出所有批次（`Promise.all`）', /Promise\.all\(/.test(recallSrc))
  check('⭐⭐ 反证：部分批次失败时**仍然继续**（不因一批失败就全丢）',
    /okIdx/.test(recallSrc))
  check('⭐⭐ 门控合并取**最大值**（用户裁定）', /gateMax/.test(recallSrc))
  check('⭐⭐ 选取规则：过线按分数取 topN（跨批合并成一个池再排）',
    /scored\.sort\(\(a, b\) => b\.score - a\.score\)/.test(recallSrc)
    && /slice\(0, config\.activeInjectTopK\)/.test(recallSrc))
}

console.log(`\n上下文与预算测试：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
