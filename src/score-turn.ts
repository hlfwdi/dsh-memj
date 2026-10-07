/**
 * ⭐⭐⭐ **轮末知识评分**（决策 177；2026-09-29 用户裁定）。
 *
 * ── 一句话 ────────────────────────────────────────────────────────────────
 * 读**该轮内容**（用户输入 + 思考 + 输出，**不含工具调用**），配上候选知识，
 * 让 JEV 逐条问「**这条知识本来能不能让这轮做得更好**」，过阈值的**按档加分**。
 *
 * ── ⭐⭐ 用户给的判据原话（本模块的全部依据）─────────────────────────────
 * > *"找出对已完成的轮次最有帮助的知识库里的知识……这个帮助指的是，
 * >   比如项目需要什么知识（**不管项目是否使用了知识库里的知识，他可能忘记使用了**）、
 * >   或者他犯了什么错（**但知识库里的知识本来可以让他不犯错**）。"*
 *
 * ⇒ 🔴🔴 **这一条决定了提问怎么写**：它**不是**"这轮用到了什么"，
 *    而是"**假如它手上有这条，会不会做得更好**"。
 *    两种问法差很多：前者只会命中"已经被用上的"（那已经注入了 ⇒ 加分毫无意义，
 *    因为它已经在注入列表里）；⭐ **后者才能命中的是"该给但没给"的那些** ——
 *    而那正是本功能存在的理由（把"这次漏了"变成"下次默认带上"）。
 *
 * ── 为什么"重复加分"是可接受甚至正确的 ──────────────────────────────────
 * ⚠️ 一条知识若**长期**对某项目有用，它会被**反复加分** ⇒ 分数越堆越高。
 *    ⭐ 这是**有意的**：分数表达的正是"这个项目**长期**需要它"的程度。
 *    而"长期没用"的会因**滚动窗口**自然掉出去（`hotScoreWindowHours`）。
 *    ⇒ 两股力量（反复加分 vs 窗口过期）共同决定"前 20 名"，**不需要额外的衰减**。
 *
 * ── 🔴 并行拆批（用户裁定：*"肯定需要并行，具体做法可以参考主动注入那一套"*）───
 * 候选池可能是 200+ 条 ⇒ 单次请求装不下 ⇒ **拆批 + 并发**（复刻 `recallViaJev` 的形态）。
 * ⚠️ 不复用那个函数本身：**它的提问是"实时要不要"、本处是"复盘该不该加分"**，
 *    复用了就得往里塞模式开关（⚠️ 那正是决策 172 那一类"一个函数兼两个语义"的坑）。
 * ⭐ **而复用的是"拆批的算法"**（`planInjection`）与"JEV 的物理 plumbing"。
 *
 * @module dsh-memj/score-turn
 */
import type { Context } from '@deepseek-ai/cordis'
import type { MemjConfig } from './config.ts'
// ⭐⭐⭐ 轮末评分走 `jev` 时选哪条决策 provider（与主动注入**共用 provider 列表**、
//    但**各自选各自的**——见 `scoreDecisionOf`）。
import { scoreDecisionOf } from './config.ts'
import { candidatesForScope, resolveJevKey, type Candidate } from './active-recall.ts'
import { loadEnIndex } from './en-index.ts'
import { planInjection } from './active-context.ts'
import { deltaFor, applyAdds } from './hot-score.ts'
import type { ScoredCandidateLog } from './score-log.ts'
import { updateProjectScore, readProjectScore } from './hot-score-store.ts'
import { appendScoreLog } from './score-log.ts'
import { scanLibrary } from './store.ts'
import { deadline } from '@deepseek-ai/dsh-timeout'
// ⭐⭐⭐ chat 通路（决策 178；用户裁定"先把 jev 搁置、加 chat 通路"）。
import { scoreViaChat } from './score-chat.ts'
// ⭐⭐⭐ 提示词运行期覆盖（本次新增）：JEV 复盘的提问走 `promptText` 取值。
import { promptText, registerPromptDefault } from './prompts.ts'

/**
 * ⭐⭐⭐ **复盘的提问**（🔴 **必须英文** —— 中文会让 JEV 分辨力归零，条目 `efdebc4e`）。
 *
 * 🔴🔴 **措辞是本功能的核心**，三条要点缺一不可：
 * 1. **问"本来能不能帮上"，不问"用没用"** —— 后者只会命中已注入的（无用）。
 * 2. **点名"遗漏"与"错误"两种情形** —— 那是用户给的两个判据
 *    （*"他可能忘记使用了"* / *"本来可以让他不犯错"*）。
 * 3. **声明 `turn_content` 是本轮已完成的记录** —— 让模型知道这是**事后复盘**，
 *    不是"现在需要什么"（否则它会照"下一步要做什么"来判，与判据不符）。
 *
 * ⚠️ **它只进 `questions`（随请求现拼）**，不进提示词缓存、不进常驻上下文
 *    ⇒ 改它**不影响前缀缓存**。
 */
export const JEV_SCORE_INSTRUCTION =
  'This is a RETROSPECTIVE review of a completed turn (see `turn_content`). ' +
  'Would `candidates[N]` have helped the engineer do this turn better — either because ' +
  'they needed this knowledge but did not have it, or because they made a mistake that ' +
  'this knowledge would have prevented? ' +
  'Answer yes only if having that entry available would have MATERIALLY changed what ' +
  'they did. Do NOT answer yes merely because the topic is related, nor because the ' +
  'entry restates something they already did correctly.'

// ⭐⭐⭐ **登记默认值**（本次新增；展示页要用）。
// 🔴 **它是"知识评分 · JEV 通路"的提问**，与 `jev:*` 那四条是**不同功能**的提问
//    （那四条属主动注入）⇒ 单独一个 key，不要混。
registerPromptDefault('score:jev-instruction', JEV_SCORE_INSTRUCTION)

/** 一次评分的结果（供回执与测试）。 */
export interface ScoreTurnResult {
  ok: boolean
  /** 人可读的一句话（**回执就靠它** —— 用户要"显式看到过程和结果"）。 */
  message: string
  /** 归属项目。 */
  project: string
  /** 候选池 / 实际评估条数。 */
  pool: number
  evaluated: number
  /** 拆了几批 / 成功几批。 */
  batches: number
  okBatches: number
  ms: number
  /** ⭐ 全部候选的分数（**不只过阈值的** —— 调阈值唯一需要的分布）。 */
  scores: ScoredCandidateLog[]
  /** ⭐ 本次加分的条目（含加几分与累计分）。 */
  added: Array<{ id: string; title: string; delta: number; score: number; total: number; why?: string }>
  /** 失败或短路原因（成功时为空串）。 */
  note: string
}

/** 空结果（各种短路路径共用，保证形状一致）。 */
function emptyResult(note: string): ScoreTurnResult {
  return {
    ok: false, message: note, project: '', pool: 0, evaluated: 0,
    batches: 0, okBatches: 0, ms: 0, scores: [], added: [], note,
  }
}

/**
 * ⭐⭐⭐ **从会话日志里取出「第 turn 轮」的内容**（用户输入 + 思考 + 输出，**不含工具调用**）。
 *
 * ── 为什么用会话日志、而不是"自己在流里攒" ──────────────────────────────────
 * ⭐ **会话日志按 turn 有天然边界**（`turn/start` ~ `turn/end`），且**已有的都能读到**
 *    （实测：`reasoning` / `text` 块都在里面）。
 * ⚠️ 而"自己在 `llm/stream` 里攒"要在**轮次之间保持状态**，而这判据是**轮末**跑的
 *    ⇒ 攒的东西还得经历"轮次切换、压缩、fork" —— 日志是**唯一一份权威记录**。
 *
 * 🔴 **取块类型的判据**：只取 `reasoning` 与 `text`，**明确排除 `tool-call`/`tool-result`**
 *    （用户要求：*"包括思考和输出，不包含工具调用"*）。
 *    ⚠️ 理由不只是"用户说了"：工具调用是**执行细节**（一次性、不可复用），
 *    而思考与输出才是"这轮在想什么、结论是什么" ⇒ 后者才与"该带什么知识"相关。
 *
 * ⚠️ **不用 `readSession`**：它对**长过东西的 fork 会话必然抛**
 *    （库内知识 `189ad127`）⇒ 照既有做法先 `observeSession`、失败才回落。
 * @param ctx - 插件上下文。
 * @param sessionId - 会话 id。
 * @param turn - 第几轮。
 * @returns 该轮内容的纯文本（含用户输入 / 思考 / 输出）；读不到时为空串。
 */
export async function readTurnContent(
  ctx: { get: (name: string) => unknown },
  sessionId: string,
  turn: number,
): Promise<string> {
  try {
    const q = ctx.get('sessionQuery') as
      | {
        observeSession?: (id: string, o?: { projectionMode?: string }) => Promise<unknown>
        readSession?: (id: string) => Promise<unknown>
      }
      | undefined
    if (q === undefined) return ''

    let events: unknown[] | undefined
    let obs: unknown
    if (typeof q.observeSession === 'function') {
      try {
        obs = await q.observeSession(sessionId, { projectionMode: 'none' })
        const ev = (obs as { events?: unknown })?.events
        if (Array.isArray(ev)) events = ev
      } catch {
        // ⚠️ 观察不可用**不直接判失败** ⇒ 落到 readSession 兜底（同既有实现）。
      } finally {
        try {
          (obs as { [Symbol.dispose]?: () => void } | undefined)?.[Symbol.dispose]?.()
        } catch { /* 释放失败不影响结论 */ }
      }
    }
    if (events === undefined && typeof q.readSession === 'function') {
      const snap = await q.readSession(sessionId)
      const ev = (snap as { events?: unknown })?.events
      if (Array.isArray(ev)) events = ev
    }
    if (events === undefined) return ''

    const parts: string[] = []
    let curTurn = -1
    let seen = false
    for (const e of events) {
      const o = e as { type?: unknown; data?: { turn?: unknown; message?: { content?: unknown } } }
      // ⭐ 轮次边界：只在目标轮内取内容。
      if (o?.type === 'turn/start') {
        const t = o.data?.turn
        curTurn = typeof t === 'number' ? t : curTurn + 1
        if (curTurn === turn) seen = true
        continue
      }
      if (o?.type === 'turn/end') {
        if (curTurn === turn) break
        continue
      }
      if (!seen || curTurn !== turn) continue
      const c = o.data?.message?.content
      if (!Array.isArray(c)) continue
      for (const b of c) {
        const t = (b as { type?: unknown })?.type
        // 🔴 **只取思考与输出**（明确排除 tool-call / tool-result）。
        if (t !== 'reasoning' && t !== 'text') continue
        const txt = (b as { text?: unknown })?.text
        if (typeof txt === 'string' && txt.trim() !== '') parts.push(txt.trim())
      }
    }
    return parts.join('\n\n')
  } catch {
    return ''
  }
}

/**
 * ⭐⭐⭐ **跑一次轮末评分**（由工具 `memj_score_turn` 调；也可被测试直接调）。
 *
 * 全流程：**判项目 → 取该轮内容 → 组候选池 → 拆批并发调 JEV → 分档加分 → 落盘 → 回执**。
 *
 * 🔴 **本函数绝不抛**（它跑在子代理的工具里，异常会让子代理失败；
 *    而"评分失败"**不该是个事件** —— 下一轮自然会再来一次）。
 * @param ctx - 插件上下文。
 * @param config - 配置。
 * @param opts - 会话 id + 轮次。
 * @returns 结果（含**给用户看的过程**）。
 */
export async function scoreTurn(
  ctx: Context,
  config: MemjConfig,
  opts: { sessionId: string; turn: number; project: string },
): Promise<ScoreTurnResult> {
  const t0 = Date.now()
  const { sessionId, turn, project } = opts
  try {
    if (project === '') return emptyResult('判不出项目 ⇒ 分数是按项目存的，无法归属')

    // ── ① 取该轮内容 ──
    const content = await readTurnContent(ctx, sessionId, turn)
    if (content.length < config.hotScoreMinChars) {
      return emptyResult(`该轮内容只有 ${content.length} 字符（< ${config.hotScoreMinChars}）⇒ 判定为寒暄，跳过`)
    }

    // ── ② 组候选池（复用既有函数；⭐ 剔除全局知识）──
    const idx = await loadEnIndex()
    if (idx === undefined) return emptyResult('索引不存在（评分只读它）')
    // ⭐ 范围用 `project+themes`（评分是"这个项目该带什么"，主题知识也算）
    let all = candidatesForScope(idx, project, 'project+themes')
    if (all.length === 0) return emptyResult(`项目「${project}」在索引里没有任何条目 ⇒ 无候选`)
    // 🔴 **剔除全局知识**（用户 2026-09-29 裁定）：它**无条件注入**，
    //    评它既浪费候选位、又永远得高分（已经是必给的了）⇒ 加它的分没有任何作用。
    const snapshot = await scanLibrary()
    const globalIds = new Set(snapshot.covers.filter((c) => c.cover.global).map((c) => c.cover.id))
    const pool: Candidate[] = all.filter((c) => !globalIds.has(c.id))
    if (pool.length === 0) return emptyResult('候选池里只剩全局知识（已剔除）⇒ 无需评分')

    // ── ③ 拆批（复用主动注入的拆批算法）──
    //    ⚠️ `messages` 传 `undefined`：**评分不需要会话上下文** ——
    //       判据是 `turn_content`（已完成的整轮），历史会话反而是噪声。
    const plan = planInjection({
      messages: undefined,
      currentReasoning: content,
      reasoningCap: Number.MAX_SAFE_INTEGER,   // 整轮内容不作截断（它本身就是判据）
      pool,
      totalBudget: config.activeInjectBudgetTokens,
      contextBudget: config.activeInjectContextTokens,
      maxBatches: config.activeInjectConcurrency,
    })

    // ── ③′ ⭐⭐⭐ **分派：两条通路契约不同**（决策 178）──
    //
    // 🔴🔴 **两条通路的产出【不是同一个东西】，别混**：
    // | | JEV 通路 | chat 通路 |
    // |---|---|---|
    // | 产出 | 逐条**分数** | **选中的条目 + 理由**（自然语言） |
    // | 选几条 | 靠**绝对阈值**切 | ⭐ **模型自己决定，不限条数** |
    // | 加分 | 按**分数分档** | ⚠️ **选中即 +1**（没有分数可档） |
    // | 拆批 | 会拆批并发 | ⚠️ **不拆批**（清单在 `system`，拆了缓存全废） |
    //
    // ⚠️ 用户 2026-09-29 裁定："**先把 jev 通路搁置**……加个 chat 通路"
    //    ⇒ 默认走 chat；JEV 那套**保留**（换回去只需改配置，不必改代码）。
    if (config.hotScoreChannel === 'chat') {
      const out = await scoreViaChat(ctx, config, { turnContent: content, pool })
      const msC = Date.now() - t0
      if (!out.ok) {
        const r = emptyResult(`chat 通路评分失败：${out.error}`)
        r.project = project
        r.pool = pool.length
        r.ms = msC
        await logRun(config, {
          sessionId, turn, project, pool: pool.length, evaluated: pool.length,
          batches: 1, ms: msC, scores: [], added: [], note: r.note,
        })
        return r
      }
      // ⭐ chat 通路**没有分数** ⇒ 选中即 +1（见 `score-chat.ts` 文件头的说明）。
      const addsC = out.picks.map((id) => ({ id, delta: 1, score: 0, turn }))
      const nowC = new Date()
      let afterC: Awaited<ReturnType<typeof updateProjectScore>> = undefined
      if (addsC.length > 0) {
        afterC = await updateProjectScore(project, (cur) =>
          applyAdds(cur, addsC, nowC.toISOString(), nowC.getTime(), config.hotScoreWindowHours),
        )
      }
      const titleOfC = new Map(pool.map((c) => [c.id, c.title]))
      const addedC = addsC.map((a) => ({
        id: a.id,
        title: titleOfC.get(a.id) ?? '',
        delta: 1,
        score: 0,
        // ⭐ 回执里带上**模型给的理由**（用户要求"给出理由"）。
        why: out.reasons[a.id] ?? '',
        // ⭐⭐ **原句引文**（决策 183）—— 已通过逐字校验，是"为什么加分"的证据。
        quote: out.quotes[a.id] ?? '',
        total: sumFor(afterC, a.id, nowC.getTime(), config.hotScoreWindowHours),
      }))
      const messageC = renderReceiptChat({
        project, turn, pool: pool.length, ms: msC,
        windowHours: config.hotScoreWindowHours, added: addedC,
        contentChars: content.length, model: config.hotScoreModel,
        // ⭐ **被引文校验丢掉的那些** —— 必须显示（那是"提示词够不够清楚"的唯一反馈）。
        rejected: out.rejected,
      })
      await logRun(config, {
        sessionId, turn, project, pool: pool.length, evaluated: pool.length,
        batches: 1, ms: msC,
        // ⚠️ chat 通路**没有分数** ⇒ `scores` 记空（并靠 `note` 说明，别让人误以为"全是 0 分"）。
        scores: out.picks.map((id) => ({ id, score: 0, delta: 1 })),
        added: addsC.map((a) => ({ id: a.id, delta: 1, score: 0 })),
        note: `通路=chat（无分数，选中即加分）；模型给的理由见回执`,
        channelUsed: 'chat',
      })
      return {
        ok: true, message: messageC, project, pool: pool.length, evaluated: pool.length,
        batches: 1, okBatches: 1, ms: msC, scores: [], added: addedC, note: '',
      }
    }

    // ── ④ 并发调 JEV（复刻 `recallViaJev` 的形态）──
    const results = await Promise.all(
      plan.batches.map(async (batch) => callJevForScore(ctx, config, content, batch)),
    )
    const okIdx = results.map((r, i) => (r === undefined ? -1 : i)).filter((i) => i >= 0)
    if (okIdx.length === 0) {
      const r = emptyResult(`JEV 调用失败（${plan.batches.length} 批全失败）`)
      r.pool = pool.length
      r.batches = plan.batches.length
      r.ms = Date.now() - t0
      await logRun(config, { sessionId, turn, project, pool: pool.length, evaluated: 0, batches: plan.batches.length, ms: r.ms, scores: [], added: [], note: r.note })
      return r
    }

    // ── ⑤ 收全部候选的分数（⭐ 不只过阈值的：调阈值要看分布）──
    const thresholds = config.hotScoreThreshold
    const allScores: ScoredCandidateLog[] = []
    const adds: Array<{ id: string; delta: number; score: number; turn: number }> = []
    const titleOf = new Map<string, string>()
    for (const c of pool) titleOf.set(c.id, c.title)
    for (const bi of okIdx) {
      const ans = results[bi]?.answers
      const batch = plan.batches[bi] ?? []
      batch.forEach((c, i) => {
        const sc = noulAt(ans, `c${i}`)
        const delta = deltaFor(sc, thresholds)
        allScores.push({ id: c.id, score: sc, delta })
        if (delta > 0) adds.push({ id: c.id, delta, score: sc, turn })
      })
    }

    // ── ⑥ 落盘（原子读-改-写；⭐ 窗口内的事件才留下）──
    const now = new Date()
    const nowIso = now.toISOString()
    const nowMs = now.getTime()
    let after: Awaited<ReturnType<typeof updateProjectScore>> = undefined
    if (adds.length > 0) {
      after = await updateProjectScore(project, (cur) =>
        applyAdds(cur, adds, nowIso, nowMs, config.hotScoreWindowHours),
      )
    }

    // ── ⑦ 回执（⭐ 用户要"显式看到过程和结果"）──
    const ms = Date.now() - t0
    const added = adds
      .sort((a, b) => b.score - a.score)
      .map((a) => ({
        id: a.id,
        title: titleOf.get(a.id) ?? '',
        delta: a.delta,
        score: a.score,
        total: sumFor(after, a.id, nowMs, config.hotScoreWindowHours),
      }))
    const maxScore = allScores.reduce((m, s) => (s.score > m ? s.score : m), 0)
    const message = renderReceipt({
      project, turn, pool: pool.length, evaluated: pool.length,
      batches: plan.batches.length, okBatches: okIdx.length, ms,
      threshold: thresholds, windowHours: config.hotScoreWindowHours,
      maxScore, added, contentChars: content.length,
    })
    await logRun(config, {
      sessionId, turn, project, pool: pool.length, evaluated: pool.length,
      batches: plan.batches.length, ms, scores: allScores,
      added: adds.map((a) => ({ id: a.id, delta: a.delta, score: a.score })),
      note: '',
    })
    return {
      ok: true, message, project, pool: pool.length, evaluated: pool.length,
      batches: plan.batches.length, okBatches: okIdx.length, ms,
      scores: allScores, added, note: '',
    }
  } catch (err) {
    // 🔴 绝不抛：评分失败不该是个事件（下一轮自然会再来一次）。
    return emptyResult(`评分异常：${String(err)}`)
  }
}

/** 读 JEV 的 `noul`（越界/缺失 ⇒ 0）。 */
function noulAt(answers: Record<string, { noul?: unknown }> | undefined, key: string): number {
  const v = answers?.[key]?.noul
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 从写回的项目表里取某条的有效分（**只用于回执展示**）。 */
function sumFor(
  project: { entries: Record<string, { events: Array<{ at: string; delta: number }> }> } | undefined,
  id: string,
  nowMs: number,
  windowHours: number,
): number {
  const e = project?.entries?.[id]
  if (e === undefined) return 0
  let s = 0
  for (const ev of e.events) {
    const t = Date.parse(ev.at)
    if (Number.isFinite(t) && t >= nowMs - windowHours * 3600_000) s += ev.delta
  }
  return s
}

/**
 * ⭐⭐ **渲染回执**（用户要"显式看到过程和结果"）。
 *
 * 🔴 **必须包含"失败时也有信息"**：若一条都没加分，回执里要有
 *    **最高分是多少** —— 否则"0 条加分"有**两种解释而表现一样**
 *    （真的都不相关 / 阈值太高），而这两种的处置完全不同（库内知识 `e1340d94`）。
 */
function renderReceipt(o: {
  project: string
  turn: number
  pool: number
  evaluated: number
  batches: number
  okBatches: number
  ms: number
  threshold: number
  windowHours: number
  maxScore: number
  added: Array<{ id: string; title: string; delta: number; score: number; total: number }>
  contentChars: number
}): string {
  const head =
    `本轮评分：turn=${o.turn} 项目=\`${o.project}\` 判据=${o.contentChars} 字符 候选=${o.pool}` +
    `（${o.batches} 批，成功 ${o.okBatches}/${o.batches}，${o.ms}ms）阈值=${o.threshold} 窗口=${o.windowHours}h`
  if (o.added.length === 0) {
    return [
      head,
      `⚠️ **一条都没加分** —— 全部候选里最高分 **${o.maxScore.toFixed(3)}**（阈值 ${o.threshold}）。`,
      '',
      o.maxScore >= o.threshold
        ? '（最高分已过阈值，却没有条目被加分 ⇒ 这是**不该发生**的，请查日志。）'
        : '（最高分也没过阈值 ⇒ 要么这轮确实没有相关知识，要么阈值偏高。两者用"分数分布"区分，见 `score-log/`。）',
    ].join('\n')
  }
  const lines = o.added.map(
    (a) => `  +${a.delta}  ${a.score.toFixed(3)}  \`${a.id.slice(0, 8)}\` ${a.title}  → 累计 ${a.total} 分`,
  )
  return [head, `✅ 加分 ${o.added.length} 条：`, ...lines].join('\n')
}

/**
 * ⭐⭐⭐ **渲染 chat 通路的回执**（用户要求"选出 + 给出理由"）。
 *
 * ⚠️ 与 JEV 版（`renderReceipt`）**不同**：这里**没有分数**，所以不显示分数与档位，
 *    而是显示**模型给的理由** —— 那正是用户要"显式看到"的东西。
 */
function renderReceiptChat(o: {
  project: string
  turn: number
  pool: number
  ms: number
  windowHours: number
  added: Array<{ id: string; title: string; delta: number; total: number; why?: string; quote?: string }>
  contentChars: number
  model: string
  /** ⭐ 被**引文逐字校验**丢掉的那些（决策 183）。 */
  rejected?: Array<{ n: number; reason: string }>
}): string {
  const head =
    `本轮评分（chat 通路）：turn=${o.turn} 项目=\`${o.project}\` 模型=\`${o.model}\`` +
    ` 判据=${o.contentChars} 字符 候选=${o.pool}（${o.ms}ms）窗口=${o.windowHours}h`
  // ⭐ **被引文校验丢掉的**：无论有没有选中都要显示 —— 它是提示词质量的唯一反馈。
  const rej = o.rejected !== undefined && o.rejected.length > 0
    ? `\n⚠️ **${o.rejected.length} 条因【引文校验不通过】被丢弃**（` +
      `${[...new Set(o.rejected.map((r) => r.reason))].slice(0, 2).join('；')}）`
    : ''
  if (o.added.length === 0) {
    return [
      head,
      '本轮**没有选中任何知识**（模型回 `{"picks":[]}` 或引文校验全不通过）。',
      '⭐ 这是**有效结论**：说明这一轮没有需要补充的知识 —— 与"调用失败"不同（失败会显示失败原因）。',
      rej,
    ].filter((x) => x !== '').join('\n')
  }
  const lines = o.added.map((a) => {
    // ⭐ **引文在前、理由在后**：引文是证据，理由是解释（决策 183）。
    const q = a.quote !== undefined && a.quote !== '' ? `\n     原句：「${a.quote}」` : ''
    const why = a.why !== undefined && a.why !== '' ? `\n     理由：${a.why}` : ''
    return `  +1  \`${a.id.slice(0, 8)}\` ${a.title}  → 累计 ${a.total} 分${q}${why}`
  })
  return [head, `✅ 选中 ${o.added.length} 条（各 +1 分）：`, ...lines, rej]
    .filter((x) => x !== '').join('\n')
}

/** 写评分日志（**绝不抛**；含全部候选分数与当时的阈值快照）。 */
async function logRun(
  config: MemjConfig,
  o: {
    sessionId: string
    turn: number
    project: string
    pool: number
    evaluated: number
    batches: number
    ms: number
    scores: ScoredCandidateLog[]
    added: Array<{ id: string; delta: number; score: number }>
    note: string
    /** ⭐ 本次实际走了哪条通路（`chat` / `jev`）—— ⚠️ 免得日后看日志分不清。 */
    channelUsed?: string
  },
): Promise<void> {
  await appendScoreLog({
    event: 'score',
    at: new Date().toISOString(),
    sessionId: o.sessionId,
    turn: o.turn,
    project: o.project,
    pool: o.pool,
    evaluated: o.evaluated,
    batches: o.batches,
    ms: o.ms,
    scores: o.scores,
    added: o.added,
    thresholds: {
      min: config.hotScoreThreshold,
      windowHours: config.hotScoreWindowHours,
      topN: config.hotScoreTopN,
    },
    note: o.note,
    channel: o.channelUsed ?? config.hotScoreChannel,
  })
}

/**
 * ⭐⭐ **一次 JEV 调用（评分用）** —— 只问每条候选一个 `noul`，**不问总控**。
 *
 * 🔴 **为什么没有 `need`/`sufficient`/`search_intent`**：那三个是**实时召回**的抑制门
 *    （"现在要不要给"），而本处是**事后复盘**（"本来该不该有"）⇒ 它们**没有意义**。
 *    ⚠️ 硬塞进来会**白烧 token 且误导**（模型会以为在判"现在需不需要"）。
 *
 * ⚠️ **端点/凭据/模型都来自"本次选中的那条决策 provider"**（2026-10-07 多 provider 化）
 *    —— 与主动注入**共用同一份 provider 列表**，但**各自选各自的**（`hotScoreDecisionPick`）。
 * @returns 答案；失败时 `undefined`。
 */
async function callJevForScore(
  ctx: Context,
  config: MemjConfig,
  content: string,
  pool: Candidate[],
): Promise<{ answers: Record<string, { noul?: unknown }> | undefined } | undefined> {
  // ⭐⭐ 解一次、全程复用（模型 / 端点 / 派生凭据名三者必须同源）。
  const pick = scoreDecisionOf(config)
  if (pick.endpoint === '' || pick.model === '') return undefined
  const key = await resolveJevKey(ctx, config, pick.keyRef)
  if (key === undefined) return undefined
  const state: Record<string, unknown> = {
    candidates: pool.map((c, i) => ({
      i,
      title: c.titleEn !== '' ? c.titleEn : c.title,
      desc: c.descEn !== '' ? c.descEn : c.desc,
    })),
    // ⭐ 判据段用 `turn_content`（**不叫 `current_thinking`** —— 那个名字的语义是
    //    "正在进行的思考"，与"已完成的整轮"是两回事，用同一个名字会让模型误判时机）。
    turn_content: content,
  }
  const questions: Record<string, unknown> = {}
  pool.forEach((_, i) => {
    questions[`c${i}`] = { type: 'noul', instructions: promptText('score:jev-instruction', JEV_SCORE_INSTRUCTION) }
  })
  const guard = deadline(undefined, config.hotScoreTimeoutMs, 'MEMJ_SCORE_JEV_TIMEOUT')
  try {
    const res = await fetch(pick.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      // ⭐⭐⭐ 多 provider：模型来自**本次选中的那条 provider**，
      //    与上面那个端点/凭据名三者同源（别读旧的 `hotScoreModel` 单键）。
      body: JSON.stringify({ model: pick.model, state, questions }),
      signal: guard.signal,
    })
    if (!res.ok) return undefined
    const body = (await res.json()) as { answers?: Record<string, { noul?: unknown }> }
    return { answers: body.answers }
  } catch {
    return undefined
  } finally {
    guard[Symbol.dispose]()
  }
}

/** ⭐ 导出给注入侧用：读某项目的"有效分前 N 名"。 */
export async function scoredEntryIds(
  projectId: string,
  config: MemjConfig,
  nowMs: number,
): Promise<string[]> {
  const p = await readProjectScore(projectId)
  const { topScored } = await import('./hot-score.ts')
  return topScored(p, nowMs, config.hotScoreWindowHours, config.hotScoreTopN).map((r) => r.id)
}
