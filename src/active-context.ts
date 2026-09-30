/**
 * ⭐⭐⭐ 主动注入 · **上下文组装 + 预算拆批**（用户 2026-09-26 定稿方案）。
 *
 * ── 为什么单独一个模块 ────────────────────────────────────────────────────
 * 这套东西有两块彼此咬合的规则（turn 划分 / 预算与拆批），
 * 而它们**全部要在"召回被调用之前"于内存里算完**，混在 `active-recall.ts` 里看不清顺序。
 *
 * ── 规则（逐条来自用户裁定，别自作主张改）────────────────────────────────
 *
 * **① turn 口径**（不是 step）
 *   历史轮只留：**用户输入 + LLM 的直接输出（text）+ memj 注入（去重）**
 *   —— 丢掉思考、工具调用、工具结果。当前轮同样只留这些（工具调用丢掉）。
 *
 * **② ⭐⭐ 当前轮的思考是【判据】，其余全是【背景】**
 *   用户原话：*"尤其要跟模型强调最后给他的 reasoning 的段落，某种角度来说，
 *   除了这个段落，其他都只是背景信息而已，要根据这个段落去判断才对。"*
 *   ⇒ 所以它**独立成字段**（`thinking`），**不与其它文本混成一坨**。
 *   🔴 **实测依据**：独立 + 在提问里点名 ⇒ 96/96 条候选分数**全部上升**（均值 +0.085~0.109）；
 *      而**只拆字段不改提问**反而略降（−0.034）⇒ ⭐ **关键是"提问要点名它"**。
 *
 * **③ 预算与拆批**（**替代**原先的"裁候选池"）
 *   · 上下文先给 `activeInjectContextTokens`（默认 **20000**）；
 *   · 剩余预算给候选池 ⇒ 反解每批能装几条 ⇒ 算需要几批；
 *   · 需要批数 > `activeInjectConcurrency` ⇒ ⭐ **减上下文**（腾出候选容量）；
 *   · 上下文压到**地板**（只剩本轮）仍不够 ⇒ 照发并如实标记（**绝不裁候选**）。
 *   🔴 **每个批次都带同一份上下文** ⇒ `totalBudget` 是**单次请求**的上限，
 *      而"并发 K 批"的覆盖量 = `K × 每批候选数`。
 *
 * **④ 估算必须在内存完成**（不能靠发出去再被拒）
 *
 * @module dsh-memj/active-context
 */

import type { Candidate } from './active-recall.ts'

// ───────────────────────────────────────────────────────────────────────────
// ① token 估算器（系数由 2026-09-26 实测标定，见 §知识来源）
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⭐⭐ **token 估算系数**（实测标定，**故意取保守值**）。
 *
 * 🔴 **为什么必须保守（宁可多算）**：估算偏小 ⇒ 以为没超、实际超了 ⇒ **上游 400**，
 *    而那次调用**已经花了钱**；估算偏大 ⇒ 少给一点上下文，**只是信息少一点**。
 *    ⇒ 失败模式不对称，**一律往大里算**。
 *
 * 🔴🔴 **2026-09-26 重新标定（上一版的系数是错的，导致生产上 3 批全 400）**：
 *
 * | 类别 | **实测** tok/字符 | 本表取 | 上一版取的 | 上一版的错 |
 * |---|---|---|---|---|
 * | 汉字 | **1.006** | **1.10** | 0.85 | 🔴 低估 18% |
 * | 拉丁字母/数字 | **0.205** | **0.26** | 0.20 | ✅ 接近 |
 * | **ASCII 标点/空白/换行** | **0.684** | **0.75** | 0.42（混在一起） | 🔴 低估 63% |
 * | **全角标点 / Unicode 排版符** | **1.006** | **1.10** | 0.42（混在一起） | 🔴 **低估 139%** |
 * | 固定开销 | 325（实测基线） | **400** | 400 | — |
 * | 每条候选（**输入**） | 210.7 | **230** | 210 | ✅ 接近 |
 * | 每条候选（**输出**） | 18.6 | **24** | 20 | 略偏小 |
 *
 * 🔴 **上一版最致命的一处**：把「ASCII 标点」与「全角标点/排版符」**混成"其它"桶**，
 *    而**两者真实成本差 4 倍**（0.684 vs 1.006），却都取 0.42。
 *    ⚠️ 实测背景文本里那一桶占 **31%** ⇒ 合计**低估 6,117 token/批**。
 *
 * ⚠️ **中文与全角标点约 1.0 tok/字符**（本轮实测）—— 之前以为汉字是 0.827，
 *    那次样本里混了英文/ASCII，**把汉字自己的密度拉低了**。
 * ⚠️ 英文（拉丁）是汉字/全角标点的 **1/5** ⇒ 这就是"必须按类别分开算"的理由。
 */
export const TOKEN_COEF = {
  /** 汉字（CJK 统一表意文字 + 中日韩标点 + 全角符号）。 */
  han: 1.10,
  /** 拉丁字母/数字。 */
  latin: 0.26,
  /**
   * ⭐ **ASCII 标点 / 空白 / 换行**（`{}[]();=<>|&` 等）—— 实测 **0.684**。
   * 🔴 它与 `wide` **不是一回事**，别合并（上一版合并 ⇒ 低估 63%）。
   */
  ascii: 0.75,
  /**
   * ⭐ **非 ASCII、又非汉字的符号**（`—` `–` `“”` `‘’` `…` `·` `「」` 等）——
   * 实测 **约 1.006**，**与汉字同价**。
   * 🔴 上一版把它算成 0.42 ⇒ **低估 139%**（本项目最严重的一次估算偏差）。
   */
  wide: 1.10,
  /** 请求结构 + 固定问句的**固定开销**（输入侧）。 */
  overhead: 400,
  /** **每条候选**的**输入**成本（候选正文 + 它自己的那个 `noul` 问句；实测 210.7）。 */
  perCandidate: 230,
  /**
   * ⭐ **每条候选**的**输出**成本（模型回一个 `noul` 概率，实测 18.6）。
   * 🔴 **漏了它就会"以为没超、实际超"** —— 见下方说明。
   */
  perCandidateOutput: 24,
} as const

/**
 * ⭐ **估算一段文本的 token 数**（按字符类别分别计，**保守**）。
 *
 * ⚠️ 只做**单遍扫描分类**，不做 BPE 模拟 —— 目标是**够准且够快**
 *    （它在每步召回的路径上，实测 147k 字符的文本约几毫秒）。
 *
 * 🔴🔴 **2026-09-26 修了一个真缺陷：原来的三桶分类把成本差 4 倍的东西混在一起。**
 *    实测（生产真实会话，35k 字符背景）估算 0.526 tok/字符，而**真实 0.709**
 *    ⇒ 每批**低估 6,117 token** ⇒ 预算判"没超"⇒ 发出去 **3 批全 400**。
 *    ⭐ 根因：原「其它」桶（取 0.42）里混了
 *      · **ASCII 标点/空白**（真实 0.684）与
 *      · **全角标点 / Unicode 排版符**（`—` `""` `【】`，真实约 **1.006**，与汉字同价）
 *    ⇒ 现在**拆成四桶**，并按 ASCII 边界判（`c < 0x80`）。
 * @param text - 任意文本。
 * @returns 估算 token 数（≥ 真实值的概率高）。
 */
export function estimateTokens(text: string): number {
  if (text === '') return 0
  let han = 0
  let latin = 0
  let ascii = 0
  let wide = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    // CJK 统一表意文字（含扩展 A）+ 中日韩标点 + 全角符号
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef)) {
      han++
    } else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39)) {
      latin++
    } else if (c < 0x80) {
      // ⭐ **ASCII 标点 / 空白 / 换行**（比全角便宜得多，实测 0.684）
      ascii++
    } else {
      // ⭐ **非 ASCII、又非汉字**（`—` `""` `…` `·` 等排版符）—— 实测 ≈1.0，**与汉字同价**
      wide++
    }
  }
  return Math.ceil(han * TOKEN_COEF.han + latin * TOKEN_COEF.latin + ascii * TOKEN_COEF.ascii + wide * TOKEN_COEF.wide)
}

/** 候选池的估算**输入**成本（每条含它自己的问句）。 */
export function estimatePoolTokens(count: number): number {
  return Math.ceil(count * TOKEN_COEF.perCandidate)
}

/**
 * ⭐⭐ 候选池的估算**输出**成本（模型要为每条候选回一个 `noul`）。
 *
 * 🔴 **必须与输入一起算进预算** —— 漏了它就是"以为没超、实际超"（见 `TOKEN_COEF`）。
 */
export function estimatePoolOutputTokens(count: number): number {
  return Math.ceil(count * TOKEN_COEF.perCandidateOutput)
}

// ───────────────────────────────────────────────────────────────────────────
// ② turn 划分
// ───────────────────────────────────────────────────────────────────────────

/** 一条"该保留的消息"。 */
export interface KeptMessage {
  role: string
  text: string
  /** ⭐ 是不是 memj 自己注入的（**去重的判据**）。 */
  injected: boolean
  /** 注入消息的指纹（用于去重；非注入为空串）。 */
  injectKey: string
}

/** 一轮（turn）。 */
export interface Turn {
  /** 真实用户输入（这一轮的起点）。 */
  userText: string
  /** LLM 的直接输出（该轮内全部 `text` 块，按顺序）。 */
  assistantTexts: string[]
  /** ⭐ 该轮内的 memj 注入（**已去重**）。 */
  injections: KeptMessage[]
}

/**
 * 是不是 memj 的注入消息。
 *
 * 🔴 0.2.0 起判据是 `source.kind === 'plugin:dsh-memj'` —— V4 会话日志
 * **拒绝** 旧的 catch-all `kind: 'plugin'`（`dsh-llm` 的注释原话：
 * "there is no shared catch-all `plugin` kind"），插件必须用自己的 kind。
 * 判据必须与写入端（`active-inject.ts` / `hot-watch.ts` / `commands.ts`）同源。
 */
const MEMJ_SOURCE_KIND = 'plugin:dsh-memj'

function isMemjInjection(msg: unknown): boolean {
  const src = (msg as { source?: { kind?: unknown } })?.source
  return src?.kind === MEMJ_SOURCE_KIND
}

/**
 * ⭐⭐ **从 `options.messages` 重建 turn 列表**。
 *
 * 🔴 **turn 边界 = 真实用户输入**（`role==='user'` 且**不是** memj 注入）。
 *    ⚠️ 这一点必须判准：**memj 的注入也是 `role:'user'`**
 *    ⇒ 若把注入当成 turn 边界，turn 数会**暴涨**（实测本会话 110 条注入 vs 71 条真实输入），
 *      裁剪粒度就全错了。
 * ⚠️ **`reasoning` 块一律不进这里**（历史轮的思考按方案丢弃）；
 *    当前轮的思考**由 `currentReasoning` 单独传入**（见 `assembleContext`）。
 * @param messages - `llm/stream` 的 `options.messages` 快照。
 * @returns turn 列表（按时间顺序；最后一个即"当前轮"）。
 */
export function splitTurns(messages: readonly unknown[] | undefined): Turn[] {
  const turns: Turn[] = []
  if (!Array.isArray(messages)) return turns
  let cur: Turn | undefined
  /** 去重：同一段注入文本只算一次（方案要求）。 */
  const seenInject = new Set<string>()

  const ensure = (): Turn => {
    if (cur === undefined) {
      cur = { userText: '', assistantTexts: [], injections: [] }
      turns.push(cur)
    }
    return cur
  }

  for (const m of messages) {
    const role = typeof (m as { role?: unknown })?.role === 'string' ? String((m as { role: string }).role) : ''
    const content = (m as { content?: unknown })?.content
    if (!Array.isArray(content)) continue
    const injected = isMemjInjection(m)

    if (role === 'user' && !injected) {
      // ⭐ 真实用户输入 ⇒ **开新的一轮**
      const texts = content.filter((b) => (b as { type?: unknown })?.type === 'text')
        .map((b) => String((b as { text?: unknown }).text ?? '')).filter((t) => t !== '')
      cur = { userText: texts.join('\n'), assistantTexts: [], injections: [] }
      turns.push(cur)
      continue
    }

    if (injected) {
      // ⭐ memj 注入：**不新开轮**，挂到当前轮；按文本去重
      const t = content.filter((b) => (b as { type?: unknown })?.type === 'text')
        .map((b) => String((b as { text?: unknown }).text ?? '')).join('\n')
      if (t === '') continue
      const key = t.slice(0, 300)
      if (seenInject.has(key)) continue
      seenInject.add(key)
      ensure().injections.push({ role: 'user', text: t, injected: true, injectKey: key })
      continue
    }

    if (role === 'assistant') {
      // ⚠️ **只取 `text` 块** —— `reasoning` / `tool-call` 按方案丢弃
      const texts = content.filter((b) => (b as { type?: unknown })?.type === 'text')
        .map((b) => String((b as { text?: unknown }).text ?? '')).filter((t) => t !== '')
      if (texts.length > 0) for (const t of texts) ensure().assistantTexts.push(t)
      continue
    }
    // 其它 role（system 等）不进上下文
  }
  return turns
}

// ───────────────────────────────────────────────────────────────────────────
// ③ 组装上下文（turn 级；预算封顶，地板 = 只剩本轮）
// ───────────────────────────────────────────────────────────────────────────

/** 一次组装的结果。 */
export interface ContextAssembly {
  /** 背景部分（历史轮 + 当前轮的用户输入/正文/注入）。 */
  background: string
  /**
   * ⭐⭐ **本步刚结束的那段思考** —— JEV 判相关性的**唯一判据**（用户 2026-09-26 的设计意图：
   * *"除了这个段落，其他都只是背景信息而已，要根据这个段落去判断才对"*）。
   * 🔴 实测：把它独立成字段并在提问里点名 ⇒ 96/96 条候选分数**全部上升**（均值 +0.085~0.109）。
   */
  thinking: string
  /** 合成文本（`chat` 通路用；= thinking 段 + background 段）。 */
  text: string
  /** 保留了几轮（含当前轮）。 */
  keptTurns: number
  /** 一共有几轮。 */
  totalTurns: number
  /** 从较早的历史裁掉了几轮。 */
  droppedTurns: number
  /** ⭐ 是否已经裁到"只剩本轮"（**地板**：当前轮永不裁）。 */
  atFloor: boolean
  /** 估算 token（按 `text` 算，即实际发出去的量）。 */
  tokens: number
}

/**
 * ⭐⭐ **组装上下文**（turn 级，从旧到新裁）。
 *
 * 规则：
 * 1. 历史轮：只放「用户输入 + LLM text + 注入（已去重）」，**不含思考/工具**；
 * 2. **当前轮的思考单独返回**（`thinking`）—— 它是判据，不是背景；
 * 3. 超出 `budgetTokens` ⇒ **从最早的那一轮开始整轮丢掉**；
 * 4. ⭐ **裁到只剩本轮就停**（`atFloor = true`）—— 当前轮**永不裁**
 *    （用户原话：*"至少保留当前轮次的会话（包括用户消息、插件的注入、思考）"*）。
 * @param opts - 消息快照 + 本步思考 + 思考上限 + 上下文预算。
 */
export function assembleContext(opts: {
  messages: readonly unknown[] | undefined
  currentReasoning: string
  reasoningCap: number
  /** 上下文预算（token）；**0 = 不检查**（尽量多放）。 */
  budgetTokens: number
}): ContextAssembly {
  const turns = splitTurns(opts.messages)
  const cap = Math.max(0, opts.reasoningCap)
  const r = opts.currentReasoning.trim()
  const thinking = r === '' ? '' : (r.length > cap ? r.slice(r.length - cap) : r)

  /** 渲染一轮的背景部分（**不含思考** —— 思考只来自当前轮，且单独返回）。 */
  const renderTurn = (turn: Turn): string => {
    const parts: string[] = []
    if (turn.userText !== '') parts.push(`[user] ${turn.userText}`)
    for (const t of turn.assistantTexts) parts.push(`[assistant] ${t}`)
    for (const inj of turn.injections) parts.push(`[injected] ${inj.text}`)
    return parts.join('\n')
  }

  const total = turns.length
  if (total === 0) {
    return {
      background: '', thinking, text: thinking,
      keptTurns: 0, totalTurns: 0, droppedTurns: 0, atFloor: true, tokens: estimateTokens(thinking),
    }
  }

  const budget = opts.budgetTokens
  const kept: string[] = []
  // 思考先占额度（它是必留项）
  let used = estimateTokens(thinking)
  let keptCount = 0
  // ⭐ 从**最新**往旧累加（近的优先保留）
  for (let i = total - 1; i >= 0; i--) {
    const block = renderTurn(turns[i] as Turn)
    const cost = estimateTokens(block)
    // `budget === 0` ⇒ 不检查；`keptCount === 0` ⇒ 本轮是地板，**即使超也一定要放**
    if (budget > 0 && used + cost > budget && keptCount > 0) break
    kept.unshift(block)
    used += cost
    keptCount++
  }

  const background = kept.filter((s) => s !== '').join('\n\n')
  const text = [thinking === '' ? '' : `[reasoning] ${thinking}`, background].filter((s) => s !== '').join('\n\n')
  return {
    background,
    thinking,
    text,
    keptTurns: keptCount,
    totalTurns: total,
    droppedTurns: total - keptCount,
    atFloor: keptCount <= 1,
    tokens: estimateTokens(text),
  }
}

// ───────────────────────────────────────────────────────────────────────────
// ④ 预算与**拆批**（用户 2026-09-26 定稿；**替代**原先的"裁候选池"）
// ───────────────────────────────────────────────────────────────────────────

/** 一条候选的**总**成本（输入 + 输出）。 */
export function estimateCandidateTokens(count: number): number {
  return estimatePoolTokens(count) + estimatePoolOutputTokens(count)
}

/** 拆批编排的结果。 */
export interface InjectionPlan {
  /** 合成上下文（`chat` 通路用）。 */
  context: string
  /** ⭐ 判据段（`jev` 通路的 `current_thinking` 字段）。 */
  thinking: string
  /** 背景段（`jev` 通路的 `background` 字段）。 */
  background: string
  /** ⭐ **拆好的批**（每批一个请求；`jev` 并发发出）。 */
  batches: Candidate[][]
  /** 上下文组装明细。 */
  ctx: ContextAssembly
  /** 总预算（一次请求的上限；0 = 不检查）。 */
  totalBudget: number
  /** 上下文的名义预算（`activeInjectContextTokens`）。 */
  contextBudget: number
  /** 上下文实际占用的 token。 */
  contextTokens: number
  /** 每批的估算 token。 */
  perBatchTokens: number[]
  /** 实际需要的批数。 */
  batchesNeeded: number
  /** ⚠️ 需要的批数**超过了并发旋钮**（上下文已压到地板仍不够）。 */
  batchesOverKnob: boolean
  /** 是否超预算（按"最大那一批"算）。 */
  overBudget: boolean
}

/**
 * ⭐⭐⭐ **预算与拆批编排**（召回被调用**之前**在内存算完）。
 *
 * ── 核心洞察（决定了整个算法）─────────────────────────────────────────────
 * 🔴 **每个批次都要带同一份上下文**（JEV 要靠它判断），
 *    所以 `totalBudget` 是**单次请求**的上限，**不是**所有批次之和。
 *    ⇒ 「并发 N 批」的**覆盖量** = `N × 每批能装的候选数`。
 *    ⇒ ⭐ 于是"减上下文"能**提高每批的候选容量**，从而减少所需批数 —— 这正是用户要的顺序。
 *
 * ── 顺序（用户原话：*"如果超过并发数旋钮还不够的话，那就减上下文"*）────────
 *   ① 上下文先按 `contextBudget`（默认 20k）给；
 *   ② 剩余预算给候选池 ⇒ 反解"每批能装几条"⇒ 算需要几批；
 *   ③ 需要批数 > `maxBatches` ⇒ ⭐ **减上下文**（腾出每批的候选容量）；
 *   ④ 上下文压到**地板**（只剩本轮）仍不够 ⇒ 照发，并如实标记 `batchesOverKnob`
 *      （⚠️ **不裁候选** —— "不丢知识"是这套方案的初衷）。
 *
 * ⚠️ `maxBatches <= 1`（`chat` 通路）：不做拆批，上下文预算 = 总预算里扣掉候选池后的余量
 *    （**与改动前的行为一致**），全部候选一批发出。
 * @param opts - 消息快照、思考、候选池、预算与并发上限。
 */
export function planInjection(opts: {
  messages: readonly unknown[] | undefined
  currentReasoning: string
  reasoningCap: number
  pool: Candidate[]
  /** **单次请求**的总预算（token，含输入与输出）；**0 = 不检查**。 */
  totalBudget: number
  /** 上下文的名义预算（token）。 */
  contextBudget: number
  /** 并发批数上限（`<= 1` ⇒ 不拆批）。 */
  maxBatches: number
}): InjectionPlan {
  const pool = opts.pool
  const N = pool.length
  const B = opts.totalBudget
  const K = Math.max(1, Math.floor(opts.maxBatches))
  const O = TOKEN_COEF.overhead
  const perCand = TOKEN_COEF.perCandidate + TOKEN_COEF.perCandidateOutput

  /** 只用"当前轮"那次组装 —— 用作上下文**地板**（算它的 token 数）。 */
  const floorCtx = assembleContext({
    messages: opts.messages,
    currentReasoning: opts.currentReasoning,
    reasoningCap: opts.reasoningCap,
    budgetTokens: 1,   // 极小 ⇒ 只放得下当前轮（地板）
  })
  const floorTokens = floorCtx.tokens

  let ctxBudget: number
  if (B === 0) {
    // 不检查 ⇒ 上下文给满名义预算
    ctxBudget = opts.contextBudget
  } else if (K <= 1) {
    // ⚠️ 不拆批（chat）：上下文拿"总预算 − 候选池"的余量，**至少给到地板**
    ctxBudget = Math.max(floorTokens, B - estimateCandidateTokens(N) - O)
  } else {
    // ⭐ 反解：想在 K 批内覆盖 N 条 ⇒ 每批至少 ceil(N/K) 条 ⇒ 上下文最多占这么多
    const perBatchNeed = Math.ceil(N / K)
    const ctxAllowed = B - O - perBatchNeed * perCand
    ctxBudget = Math.max(floorTokens, Math.min(opts.contextBudget, ctxAllowed))
  }

  const ctx = assembleContext({
    messages: opts.messages,
    currentReasoning: opts.currentReasoning,
    reasoningCap: opts.reasoningCap,
    budgetTokens: ctxBudget,
  })

  // 按"实际"上下文占用算每批能装几条
  const room = B === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, B - ctx.tokens - O)
  const perBatch = B === 0 ? N : Math.max(1, Math.floor(room / perCand))
  const needed = N === 0 ? 0 : Math.max(1, Math.ceil(N / perBatch))

  // 拆批：**保持原清单顺序**，尽量均分
  const batches: Candidate[][] = []
  if (N > 0) {
    const chunk = Math.ceil(N / needed)
    for (let i = 0; i < N; i += chunk) batches.push(pool.slice(i, i + chunk))
  }

  const perBatchTokens = batches.map((b) => estimateCandidateTokens(b.length) + ctx.tokens + O)
  const overBudget = B > 0 && perBatchTokens.some((t) => t > B)
  return {
    context: ctx.text,
    thinking: ctx.thinking,
    background: ctx.background,
    batches,
    ctx,
    totalBudget: B,
    contextBudget: opts.contextBudget,
    contextTokens: ctx.tokens,
    perBatchTokens,
    batchesNeeded: needed,
    batchesOverKnob: needed > K,
    overBudget,
  }
}
