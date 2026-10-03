/**
 * ⭐⭐⭐ **知识评分：chat 通路**（决策 178；2026-09-29 用户裁定）。
 *
 * ── 用户原话（本模块的全部依据）────────────────────────────────────────────
 * > *"你先把 jev 通路搁置。就还是这个需求，你加个 chat 通路。你用 wb 的
 * >   deepseek-v4.1-flash 去做，让他**选出真正能帮助到项目的**，并且**给出理由**。
 * >   **不限制条数**。**思考关掉**。"*
 *
 * ── 🔴🔴 与 JEV 通路的契约差异（这是本模块最要紧的一段）────────────────────
 * | | JEV 通路（`scoreViaJev`） | **chat 通路（本模块）** |
 * |---|---|---|
 * | 输出形态 | 逐条 `noul` **分数** | **选中的条目 + 理由**（自然语言） |
 * | 选几条 | 靠**绝对阈值**切 | ⭐ **模型自己决定，不限条数** |
 * | 加分 | 按**分数分档**（3/2/1） | ⚠️ **没有分数 ⇒ 只能"选中即 +1"** |
 * | 拆批 | 会拆批+并发 | ⚠️ **不拆批**（清单在 `system` 里、是缓存大头） |
 *
 * 🔴 **为什么 chat 通路"没有分数"**：它回的是自然语言理由（用户明确要求"给出理由"），
 *    而**理由不是可比的数值** ⇒ 分档加分在结构上不适用。
 *    ⇒ ⭐ 按"**选中就 +1**"实现（唯一自洽的做法）。
 *    ⚠️ 代价（如实写明）：**分数变成"被选中过几次"**，而不是"有多相关"。
 *       这其实更贴近热知识注入要的语义（"这条对项目长期有用"）。
 *
 * ── ⚠️ 为什么**不拆批**（与 JEV 通路的又一处差异）──────────────────────────
 * §6.4 的硬约束：**知识库清单必须放 `system`**（它是输入大头，放 `user` 会
 * 让"每次变的上下文"把它一起拖出缓存）。⇒ 拆批 = 每批一份不同的清单 =
 * **`system` 每批都不同** ⇒ 缓存全废。⭐ 而 chat 通路的预算是"窗口 60%"，
 * 通常很宽裕。⚠️ 若真的超预算 ⇒ **如实报出来**（`overBudget`），不偷偷裁。
 *
 * @module dsh-memj/score-chat
 */
import type { Context } from '@deepseek-ai/cordis'
import type { MemjConfig } from './config.ts'
import type { Candidate } from './active-recall.ts'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
// ⭐⭐⭐ 提示词运行期覆盖（本次新增）：规则段走 `promptText` 取值。
import { fillSlots, promptText, registerPromptDefault } from './prompts.ts'

/** chat 通路的判定结果。 */
export interface ChatScoreOutcome {
  /** 成功拿到可解析的输出。 */
  ok: boolean
  /** 被选中的条目 id（已校验在池内、已去重、**且引文校验通过**）。 */
  picks: string[]
  /** ⭐ **每条的理由**（用户要求"给出理由"；键 = 条目 id）。 */
  reasons: Record<string, string>
  /**
   * ⭐⭐ **每条入选的【原句引文】**（决策 183；键 = 条目 id）。
   * ⚠️ 它**已通过逐字校验**（`checkQuote`）—— 是"这条为什么入选"的**证据**。
   */
  quotes: Record<string, string>
  /**
   * ⭐ **被引文校验丢掉的那些**（`{n, reason}`）。
   * 🔴 **必须如实报出**（库内知识 `5b9bbc6e` / `e4671756`）：
   *    它是"提示词够不够清楚"的**唯一反馈** —— 全被丢掉时，
   *    只有这个字段能区分"模型没引用"与"模型引用了但被我的归一化误杀"。
   */
  rejected: Array<{ n: number; reason: string }>
  /** 原始正文（排障用）。 */
  raw: string
  /** 失败/短路原因（成功时空串）。 */
  error: string
}

/** 空结果（各短路路径共用，保证形状一致）。 */
function empty(error: string, raw = ''): ChatScoreOutcome {
  return { ok: false, picks: [], reasons: {}, quotes: {}, rejected: [], raw, error }
}

/**
 * ⭐⭐ **`system`：身份 + 输出纪律 + 判断要求 + 知识库清单**（§6.4 的排布）。
 *
 * 🔴🔴 **清单必须放这里**（不能放 `user`）—— 见文件头"为什么不拆批"。
 *
 * ⭐ **判断要求按用户需求写**：*"选出**真正能帮助到项目的**"* ——
 *    注意是"**帮助到项目**"，不是"与本轮相关"。
 *    ⚠️ 这个区别要紧：项目级价值 ≠ 本轮相关性（后者会命中一堆泛泛沾边的）。
 *
 * ⚠️ **必须"正面规定格式"，不能写"禁止额外输出"** ——
 *    库内知识 `11e7619e`：否定式硬约束会让模型**塌成 1 个 token**。
 * @param opts - 候选池 + 是否给理由 + 是否说明"超预算"。
 * @returns `system` 文本。
 */
/**
 * ⭐⭐⭐ **`system` 的规则段默认文本**（第六十九批的原文，**本次抽成常量以便覆盖**）。
 *
 * 🔴 **只抽"规则"这一段**，不抽清单与预算说明 ——
 *    后两者是**数据**（每条候选的 title/desc）与**运行时状态**，不是提示词。
 * ⚠️ `wantReasons` 分支要用的 JSON 形状**仍由代码拼**（那是与解析器配对的**契约**，
 *    模型改了它就会解析失败 ⇒ 不开放自由编辑）。
 */
const SCORE_SYSTEM_BASE = `你是一个知识库复盘助手。你的任务是**回顾刚刚结束的一轮工作**，
从下面的【知识库清单】里挑出**真正能帮助到这个项目**的知识条目。

【判断要求】
逐条判断这条知识**对这个项目的长期工作有没有实际帮助**，具体指两种情况：
(a) 这一轮**需要**这类知识，但当时手头没有 —— 包括"它忘了自己库里有"的情况；
(b) 这一轮**犯了错**，而这条知识本来能让它不犯。

⭐ 判据：**"如果工程师下次遇到同样的事，提前读到这条会不会做得更好？"**
⚠️ 只是话题沾边**不算**；这条知识必须**真的能改变做法**。
⚠️ **不要因为"它这一轮已经做对了"就排除** —— 只要这条知识对项目有用就选。

【输出格式】
只输出一个 JSON 对象，没有任何其他文字、没有 markdown 代码块。`

/** ⭐ **登记默认值**（展示页要用）。 */
registerPromptDefault('score:system', SCORE_SYSTEM_BASE)

// ⭐⭐⭐ **引文硬要求的措辞 + 取舍原则**（2026-10-12 抽成常量 + 走 `promptText`）。
//
// 🔴 **为什么它们也算提示词**：这两段**逐字进到评分子代理的 `system` 里**，
//    而且它们**直接决定模型挑什么**：
//    · 引文段说清"是**逐字复制**、不是概括"——措辞一松，模型就会写"意思差不多"的话，
//      而机械校验只认逐字子串 ⇒ **入选全被丢掉**（本项目实测过这个坑）；
//    · 取舍段说清"宁少勿滥"——它决定**分数会不会被拉平**（实测：不限条数时模型会选 18~24 条）。
//    ⭐ 判据同 `inject.ts`：**能改变模型怎么做的文本就是提示词**。
//
// ⚠️ **不抽**：JSON 形状行（与解析器配对的**契约**，改坏就解析失败）、
//    编号范围与 `budgetNote`（含运行时数字 `pool.length`）——那些仍由代码拼。
export const SCORE_QUOTE_RULE: string = `【\`quote\` 是硬要求】
\`quote\` 必须是【本轮工作内容】里**逐字复制**的一句原话（不要改写、不要概括、不要翻译）。
⚠️ 它会与上下文做**逐字比对**：不是原文里出现过的原句 ⇒ **该条不予加分**。
⭐ \`why\` 必须说明：**上面那句原话里的需求/错误，被这条知识的哪一点解决了**。
🔴 **只是"话题相关"不够** —— 必须能指出"靠这句原话 + 这条知识，下次会做对什么"。`

export const SCORE_PICK_PRINCIPLE: string = `⭐ **宁少勿滥** —— 只选真的能改变做法的；**一条都没有就回 \`{"picks":[]}\`**。
🔴 **不要为了凑数而选** —— 选错会污染这个项目的注入内容。
⚠️ 如果够格的条目多于本次允许的条数，**只留最能改变做法的那几条**。`

// ⭐⭐ **登记默认值**（2026-10-12）——漏了这两行会让它们在页面上**显示为空、改不了**
//    （本项目已有机械对账盯着这个方向：`scripts/diag-prompt-coverage.mjs` 的检查 ①）。
registerPromptDefault('score:quote-rule', SCORE_QUOTE_RULE)
registerPromptDefault('score:pick-principle', SCORE_PICK_PRINCIPLE)

// ⭐⭐⭐ **`user` 段的骨架**（2026-10-12 开放编辑；`{{k}}` 是插槽）。
//
// 🔴 **为什么它必须留在 `user`、不能挪进 `system`**（§6.4 的硬约束，别改）：
//    `{{k}}`（每轮最多几条）是**可配变量**，每轮都可能变 ⇒ 写进 `system` 会让
//    整份 `system` 失效、**把知识库清单一起拖出前缀缓存**。放 `user` 是零成本的
//    —— 那里本来就装着"本轮内容"，每轮都变。
//
// 🔴 **三处 `{{k}}` 都有用，别合并**：第一处给上限，后两处把"上限"变成**排序要求**
//    （实测：只给数字时模型会理解成"随便挑 K 条"，于是选了 18~24 条、把分数拉平）。
export const SCORE_USER_TASK: string = `请从上面的【知识库清单】里挑出真正能帮助到这个项目的条目，**最多 {{k}} 条**。
⚠️ 如果够格的超过 {{k}} 条，请**按"能改变做法"的程度排序，只留最前面的 {{k}} 条** —— **宁缺勿滥**，凑数会污染这个项目的注入内容。`

registerPromptDefault('score:user-task', SCORE_USER_TASK)

// ⭐⭐⭐ **`system` 里两处带运行时数字的行**（2026-10-12 开放编辑；`{{n}}` 是插槽）。
//    ⚠️ 这两行的数字是**候选池条数**（每轮都变）⇒ 它们本来就住在 `system` 里，
//       而 `system` 只在"库变化"时失效；**别把可配的 K 也搬进来**（见上一条注释）。
export const SCORE_INDEX_RANGE: string = '⚠️ 编号必须在 1 到 {{n}} 之间。'
export const SCORE_POOL_HEADER: string = '【知识库清单】（共 {{n}} 条）'

registerPromptDefault('score:index-range', SCORE_INDEX_RANGE)
registerPromptDefault('score:pool-header', SCORE_POOL_HEADER)

/**
 * ⭐⭐ **`system`：判断要求 + 知识库清单**。
 *
 * ⚠️ **排布不能改**（§6.4 的硬约束）：清单是输入大头，必须与"每次都变的东西"分开，
 *    且 **`system` 里绝不能出现可配的 K**（K 一变 ⇒ 整份 `system` 失效 ⇒ 清单被拖出缓存）。
 * @param opts - 候选池 + 是否给理由 + 清单语言 + 超预算说明。
 * @returns `system` 文本。
 */
export function buildChatScoreSystem(opts: {
  pool: Candidate[]
  /** ⭐ 是否要求给理由（用户要求"给出理由" ⇒ 默认 true）。 */
  wantReasons: boolean
  /** 中文清单还是英文清单（⭐ 默认中文：判断"对项目有没有帮助"读母语更准）。 */
  english: boolean
  /** 超预算时的如实说明（空串 = 不显示）。 */
  budgetNote: string
}): string {
  const lines: string[] = []
  // ⭐⭐⭐ **规则段走覆盖**（本次新增）：设置页改完，**下一次评分即生效**（无需重启）。
  //    ⚠️ 覆盖只作用于"规则文本"；**清单（`pool`）、预算说明、以及 `wantReasons`
  //       分支要用的 JSON 形状**仍由代码拼 —— 它们是数据/契约，不是可自由改的提示词。
  lines.push(promptText('score:system', SCORE_SYSTEM_BASE))
  if (opts.wantReasons) {
    lines.push('{"picks":[{"n":编号,"quote":"原句","why":"这条知识怎么解决它"},...]}')
    lines.push('')
    // 🔴🔴 **硬校验**（决策 183；用户原话：*"复盘时入选理由必须从给他的上下文里，
    //    挑出至少一句原句来，阐述知识解决了该理由。……当做一个硬校验。"*）
    //    ⇒ ⭐ 这段措辞必须说清"是**逐字复制**，不是概括" ——
    //      否则模型会写一句"意思差不多"的话，而**机械校验只认逐字子串** ⟹ 全被丢掉。
    lines.push(
      promptText('score:quote-rule', SCORE_QUOTE_RULE),
    )
  } else {
    lines.push('{"picks":[编号,...]}')
  }
  lines.push(
    fillSlots(promptText('score:index-range', SCORE_INDEX_RANGE), { n: String(opts.pool.length) }),
  )
  // 🔴🔴 **"最多几条"这个数字【绝不能】写在这里**（决策 180；§6.4 的硬约束）：
  //    `system` 里装着**知识库清单**（输入大头 ≈35k 字符）——
  //    一旦把可配的 K 写进来，K 一变就**整份 `system` 失效** ⇒ 清单跟着被拖出缓存。
  //    ⭐ 所以这里只写**与 K 无关的原则**，K 由 `buildChatScoreUser` 放进 `user`。
  //    ⚠️ 这三句 2026-10-12 走 `promptText`（措辞可改）；**"与 K 无关"这个性质不能改**
  //      —— 用户若在这里写进具体数字，会让 `system` 随 K 变化、把清单拖出前缀缓存。
  lines.push(promptText('score:pick-principle', SCORE_PICK_PRINCIPLE))
  if (opts.budgetNote !== '') lines.push(`⚠️ ${opts.budgetNote}`)
  lines.push('')
  lines.push(
    fillSlots(promptText('score:pool-header', SCORE_POOL_HEADER), { n: String(opts.pool.length) }),
  )
  opts.pool.forEach((c, i) => {
    const title = opts.english ? (c.titleEn !== '' ? c.titleEn : c.title) : c.title
    const desc = opts.english ? (c.descEn !== '' ? c.descEn : c.desc) : c.desc
    // ⚠️ 编号从 1 开始（§6.4 的既有约定：编号比 id 短得多，且人读也可核对）。
    lines.push(`${i + 1}. TITLE: ${title} / DESC: ${desc}`)
  })
  return lines.join('\n')
}

/**
 * ⭐⭐ **`user`：只放"每次变"的那部分**（§6.4 的排布）。
 *
 * ⭐ 这样切分的收益：`system`（含清单大头）只在**库变化**时失效；
 *    `user` 每次变，但它**不含大头** ⇒ 失效代价极小。
 *
 * ⭐⭐⭐ **"最多几条"（`maxPicks`）就放这里**（决策 180；§6.4 的硬约束）——
 *    §6.4 明写 *"判断要求里不写「最多 K 条」"*：K 是可配变量，写进 `system`
 *    会让它每轮都变、**把清单一起拖出前缀缓存**。
 *    ⚠️ 而在本模块**放 `user` 是零成本的** —— `user` 里装着"本轮内容"，本来就每轮都变。
 *    ⇒ ⭐ **改 `hotScoreMaxPicks` 不会废掉任何缓存。**
 *
 * 🔴🔴 **K 不只是"截断"，它改变模型的取舍标准**（这是实测得出的，不是理论担忧）：
 *    试跑时"条数不限"⇒ 模型选了 **18~24 条**（223 条候选）—— 它不是只挑最相关的，
 *    而是"**沾边的都收**"。⭐ 后果是**几乎每条知识每轮都被加分** ⇒ 分数被拉平
 *    ⇒ 「前 20 名」失去区分度。
 *    ⇒ 所以这里的措辞**必须点明"要排序取舍"**，光给一个上限数字不够
 *      （模型会理解成"随便挑 K 条"）。
 * @param turnContent - 该轮内容（用户输入 + 思考 + 输出）。
 * @param maxPicks - 本次最多选几条（`> 0`）。
 * @returns `user` 文本。
 */
export function buildChatScoreUser(turnContent: string, maxPicks: number): string {
  const k = Math.max(1, Math.floor(maxPicks))
  // ⭐⭐⭐ **插槽模板**（2026-10-12）：`{{k}}` 由程序填，骨架可编辑。
  //    🔴 **`{{k}}` 必须保留三次** —— 三处都在说"最多几条"，
  //       少一处模型就会拿到一句没有数字的要求（本项目 `slots` 校验**双向**拦这个）。
  const head = `【本轮工作内容】\n${turnContent}\n\n`
  return head + fillSlots(promptText('score:user-task', SCORE_USER_TASK), { k: String(k) })
}

/**
 * ⭐⭐ **解析 chat 通路的输出**（**必须校验，不能信模型** —— §6.4 的既有纪律）。
 *
 * 🔴 **四条校验**（照主动注入 `parseJudgeOutput` 的做法）：
 * 1. **编号在 `1..N` 内**（越界丢弃 —— 模型有时会回"第 0 条"或超出池子）；
 * 2. **去重**（同一编号回两次）；
 * 3. **JSON 解析失败 ⇒ 返回 error**（由调用方静默跳过本次 —— 绝不影响主流程）；
 * 4. ⭐ **超过 `maxPicks` 就截断**（决策 180）—— ⚠️ **不能只靠提示词**：
 *    模型会超发，不截就会让"每轮最多 N 条"这个旋钮**形同虚设**。
 *
 * ⚠️ **容错**：模型可能包一层 markdown 代码块、或在 JSON 前后带解释文字
 *    ⇒ ⭐ 先**剥掉 ``` 围栏**、再**从第一个 `{` 取到最后一个 `}`**（比严格 `JSON.parse` 稳）。
 * @param raw - 模型返回的正文。
 * @param pool - 候选池（用于编号 → id 映射）。
 * @param wantReasons - 是否解析 `why`。
 * @returns 解析结果。
 */
export function parseChatScore(
  raw: string,
  pool: Candidate[],
  wantReasons: boolean,
  /**
   * ⭐ 最多选几条（决策 180）。
   *
   * 🔴 **必须在这里再截一刀，不能只靠提示词** —— 这条纪律与 `parseJudgeOutput`
   *    的"编号越界要丢弃"同源：**模型输出不可信**。
   *    ⚠️ 实测模型会**超发**（"条数不限"时它选了 18~24 条，
   *    给了上限也未必严格守）⇒ 不截就会让"每轮最多 N 条"这个旋钮**形同虚设**。
   * ⚠️ 省略 ⇒ **不截**（保持既有调用/测试的行为不变）。
   */
  maxPicks?: number,
  /**
   * ⭐⭐⭐ **要拿来做引文逐字比对的那段上下文**（决策 183）。
   *
   * ⚠️ **必须是"真正发给它的那段"**（`buildChatScoreUser` 里的本轮内容）——
   *    拿别的东西来比会**恒不通过**（或恒通过）。⭐ 判据：**比对基准 = 输入本身**。
   * ⚠️ 省略 ⇒ **跳过引文校验**（保持既有调用/测试的行为）。
   */
  ctxForQuote?: string,
): ChatScoreOutcome {
  // 🔴🔴 **整个函数不抛**（2026-09-29 反证发现的缺口）：
  //    它是"**模型输出不可信**"的唯一防线，而**防线自己崩掉**比"解析失败"糟得多 ——
  //    解析失败会被调用方当成"本轮没选出东西"（无害）；
  //    抛异常会**打断整条评分链路**。
  //    ⚠️ 反证怎么发现的：把两道越界守卫都去掉后，测试**不是报红而是崩**
  //      （`TypeError: Cannot read properties of undefined`）
  //      ⇒ 说明**没有外层兜底** —— 而这是一个"输入来自模型"的函数最该有的东西。
  try {
    return parseChatScoreInner(raw, pool, wantReasons, maxPicks, ctxForQuote)
  } catch (err) {
    return empty(`解析时抛异常（${String(err).slice(0, 100)}）：${raw.slice(0, 120)}`, raw)
  }
}

/** `parseChatScore` 的实现体（**抛异常由外层兜住** ⇒ 见那里的注释）。 */
function parseChatScoreInner(
  raw: string,
  pool: Candidate[],
  wantReasons: boolean,
  maxPicks?: number,
  ctxForQuote?: string,
): ChatScoreOutcome {
  const text = stripFence(raw).trim()
  if (text === '') return empty('模型没有返回正文', raw)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return empty(`没有找到 JSON 对象：${text.slice(0, 120)}`, raw)
  let obj: unknown
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch (err) {
    return empty(`JSON 解析失败（${String(err).slice(0, 80)}）：${text.slice(0, 120)}`, raw)
  }
  const picksRaw = (obj as { picks?: unknown })?.picks
  if (!Array.isArray(picksRaw)) return empty('返回值里没有 `picks` 数组', raw)

  const picks: string[] = []
  const reasons: Record<string, string> = {}
  /** ⭐ 每条入选的**原句引文**（决策 183）—— 它已通过逐字校验。 */
  const quotes: Record<string, string> = {}
  /** ⭐ 被引文校验丢掉的那些（**如实报出**，供调提示词 —— 见函数头的可观测性纪律）。 */
  const rejected: Array<{ n: number; reason: string }> = []
  const seen = new Set<number>()
  // ⭐ 上限（决策 180）：`undefined` = 不截（保持既有行为）。
  const cap = maxPicks === undefined ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor(maxPicks))
  for (const p of picksRaw) {
    // 🔴 校验④：**到上限就停** —— ⚠️ **按模型给的顺序取前 K 个**，
    //    因为 `user` 里明确说了"按能改变做法的程度排序，只留最前面的 K 条"
    //    ⇒ 顺序本身携带优先级信息（重新排序会丢掉它）。
    if (picks.length >= cap) break
    // ⚠️ 两种形态都收：`{n, why}`（要理由时）与裸编号（不要理由时）。
    const nRaw = typeof p === 'number' ? p : (p as { n?: unknown })?.n
    const n = typeof nRaw === 'number' ? nRaw : Number(nRaw)
    // 🔴 校验①：必须是 1..N 的整数（**越界丢弃**，不是报错整份丢）。
    if (!Number.isInteger(n) || n < 1 || n > pool.length) continue
    // 🔴 校验②：去重。
    if (seen.has(n)) continue
    const c = pool[n - 1]
    if (c === undefined) continue
    // 🔴🔴 校验⑤（**硬校验**，决策 183）：`quote` 必须在上下文里逐字出现。
    //    ⚠️ **不过就整条丢掉**（不是"降级成没有理由"）—— 用户明确要求
    //       *"而不只是有关联就加分"* ⇒ 拿不出原句 ⇒ **这条不算"能帮上忙"**。
    //    ⚠️ **只有在 `ctxForQuote` 真的给了的时候才校验**：
    //       没给基准 ⇒ **跳过**（否则会退化成"拿空串比对 ⇒ 恒不通过 ⇒ 一条都选不出来"，
    //       ⚠️ 我第一版就是这样，把 12 条既有测试全打红了）。
    //       ⭐ 这也保证"不传新参数的既有调用"行为不变。
    if (wantReasons && ctxForQuote !== undefined) {
      const chk = checkQuote((p as { quote?: unknown })?.quote, ctxForQuote)
      if (!chk.ok) {
        rejected.push({ n, reason: chk.reason })
        continue
      }
      quotes[c.id] = chk.norm
    }
    seen.add(n)
    picks.push(c.id)
    if (wantReasons) {
      const w = (p as { why?: unknown })?.why
      if (typeof w === 'string' && w.trim() !== '') reasons[c.id] = w.trim()
    }
  }
  return { ok: true, picks, reasons, quotes, rejected, raw, error: '' }
}

/** 剥掉 markdown 代码围栏（模型很爱包一层 ```json）。 */
function stripFence(s: string): string {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(s)
  return m !== null ? (m[1] ?? s) : s
}

/**
 * ⭐⭐⭐ **硬校验：`quote` 必须是上下文里【逐字出现】的原句**（决策 183）。
 *
 * 🔴🔴 **用户原话**（这是本函数的全部依据）：
 * > *"复盘时入选理由必须从给他的上下文里，挑出至少一句原句来，阐述知识解决了该理由。
 * >   而不只是有关联就加分。**当做一个硬校验**。"*
 *
 * ── 🔴 为什么必须"机械比对"、不能信模型自述 ─────────────────────────────
 * 提示词里已经要求逐字复制，但**提示词是软约束** —— 模型很容易写一句
 * "意思差不多"的话（或把两句话缝在一起）⇒ ⭐ 那条**看着像引用了、其实没有**。
 * ⇒ 只有**真的去上下文里找那个子串**才算校验（本项目铁律：**验证要机械**）。
 *
 * ── ⚠️ 归一化（只做"无害"的那几种，不做"意思级"的）────────────────────
 * 比对前把**空白**折叠成一个空格、去掉首尾空白 —— 因为：
 *   · 模型复制长句时**换行/多空格**几乎必然与原句不同（那是**格式**差异，不是内容差异）；
 *   · ⭐ 但**绝不**做"去标点/同义词/模糊匹配" —— 那会把"改写"也判成通过，
 *     而本校验的**全部意义**正是"区分引用与改写"。
 *
 * ── ⚠️ 长度下限 ────────────────────────────────────────────────────────
 * 太短的"原句"（如"好"、"继续"）**必然在上下文里出现** ⇒ 让校验变成走过场。
 * ⇒ 少于 {@link MIN_QUOTE_CHARS} 个字符一律**不通过**（并如实报出原因）。
 * @param quote - 模型给的引文。
 * @param context - **真正发给它的**那段上下文（`user` 里的本轮内容）。
 * @returns 通过与否 + 可判定的原因（原因会进回执/日志，便于调提示词）。
 */
export function checkQuote(
  quote: unknown,
  context: string,
): { ok: boolean; reason: string; norm: string } {
  /** ⚠️ 只折叠空白（格式差异），**不做**任何"意思级"归一。 */
  const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()
  if (typeof quote !== 'string') return { ok: false, reason: '没有给 `quote` 字段', norm: '' }
  const q = norm(quote)
  if (q.length < MIN_QUOTE_CHARS) {
    return { ok: false, reason: `引文太短（${q.length} < ${MIN_QUOTE_CHARS} 字符）⇒ 无法证明是引用`, norm: q }
  }
  const hay = norm(context)
  if (hay === '') return { ok: false, reason: '上下文为空 ⇒ 无从比对', norm: q }
  if (!hay.includes(q)) return { ok: false, reason: '引文在上下文里【找不到逐字匹配】⇒ 是改写而非引用', norm: q }
  return { ok: true, reason: '', norm: q }
}

/**
 * ⭐ **引文的最短字符数**（决策 183）。
 *
 * ⚠️ 取 8 是个**折中**：太短（如 4）会让"随便抄几个字"就通过；太长（如 30）
 * 会让**短而准**的引用（"注入没触发"这种）被误杀。
 * ⭐ 按"失败模式不对称"（库内知识 `9d61d1e3`）：**误杀**只是少加一次分（下轮还会再来），
 *    而**放过**会让"改写"混进来、让这个门槛形同虚设 ⇒ 宁可略严。
 */
export const MIN_QUOTE_CHARS = 8

/**
 * ⭐⭐⭐ **跑一次 chat 通路评分**（由 `scoreTurn` 在 `channel==='chat'` 时分派）。
 *
 * 🔴 **纪律（照 `callChat`）**：
 *    · **不传 `sessionId`**（否则被 `llm/stream` 监听器当成会话步 ⇒ 自己触发自己，
 *      库内知识 `02252b4b`）；
 *    · **`reasoningEffort: 'off'` 关思考**（用户明确要求；⚠️ 实测有些模型关不掉 ⇒
 *      那会输出 0 字符，所以下面**如实报**而不是假装成功）；
 *    · **失败绝不抛**。
 * @param ctx - 插件上下文。
 * @param config - 配置。
 * @param opts - 该轮内容 + 候选池。
 * @returns 判定结果。
 */
export async function scoreViaChat(
  ctx: Context,
  config: MemjConfig,
  opts: { turnContent: string; pool: Candidate[] },
): Promise<ChatScoreOutcome> {
  const route = splitRoute(config.hotScoreModel)
  if (route === undefined) {
    // ⭐ 报错要**能直接指引到修法**（同 `recallViaChat`）：chat 通路必须是 `provider/model`。
    return empty(`chat 通路的模型要写成 provider/model，当前是「${config.hotScoreModel}」（去设置面板重选一个即可）`)
  }  const llm = ctx.get('llm') as { stream?: (o: unknown) => AsyncIterable<unknown> } | undefined
  if (llm?.stream === undefined) return empty("拿不到 llm 服务（ctx.get('llm') 是 undefined）")

  const budgetNote = ''
  const system = buildChatScoreSystem({
    pool: opts.pool,
    wantReasons: true,          // ⭐ 用户要求"给出理由" ⇒ 恒要。
    english: false,             // ⭐ 中文清单：判断"对项目有没有帮助"读母语更准。
    budgetNote,
  })
  const maxPicks = Math.max(1, Math.floor(config.hotScoreMaxPicks))
  const user = buildChatScoreUser(opts.turnContent, maxPicks)

  const guard = deadline(undefined, config.hotScoreTimeoutMs, 'MEMJ_SCORE_CHAT_TIMEOUT')
  try {
    const options = {
      provider: route.provider,
      model: route.model,
      system,
      messages: [
        createUserMessage({
          content: [{ type: 'text', text: user }],
          source: { kind: 'plugin:dsh-memj' },
        }),
      ],
      temperature: 0,
      // ⚠️ 输出可能很长（不限条数 + 每条一句理由）⇒ 给足。
      maxTokens: 4000,
      // 🔴 关思考（用户要求）。⚠️ **不传 sessionId**（见函数头）。
      reasoningEffort: 'off',
      signal: guard.signal,
    }
    const assembler = new BlockAssembler()
    for await (const chunk of llm.stream(options)) assembler.push(chunk as never)
    guard.signal.throwIfAborted()
    const { text, kinds } = textOfAssembler(assembler)
    if (text.trim() === '') {
      // 🔴 **"没有正文"要报清是哪一种**（同 `recallViaChat` 的纪律）：
      //    只回思考 ⇒ 该模型关不掉思考（思考把 maxTokens 吃完了）；
      //    没有内容 ⇒ 该查调用本身。两者的处置完全不同。
      const ks = kinds.join('+')
      return empty(
        ks.includes('reasoning')
          ? `模型只回了思考、没有正文（收到的块：${ks}）⇒ 该模型关不掉思考，换一个能关的`
          : `模型没有返回任何内容（收到的块：${ks || '无'}）`,
      )
    }
    // ⭐ 传 `maxPicks` ⇒ 解析器**自己再截一刀**（见 `parseChatScore` 的校验④）。
    // ⭐ 传 `opts.turnContent` ⇒ **引文逐字校验的基准**（决策 183）。
    //    ⚠️ **必须是同一段文本**（就是 `user` 里那份）—— 见参数说明。
    return parseChatScore(text, opts.pool, true, maxPicks, opts.turnContent)
  } catch (err) {
    return empty(`chat 通路调用失败：${String(err)}`)
  } finally {
    guard[Symbol.dispose]()
  }
}

/**
 * 从汇编器里取正文与收到的块类型。
 *
 * 🔴🔴 **这里是本模块最严重那个 bug 的现场**（2026-09-29 生产实测暴露）：
 *    我第一版写的是
 *    ```ts
 *    const text = typeof t.text === 'function' ? t.text() : ''   // ← 永远 ''
 *    ```
 *    ⚠️ 而 `BlockAssembler` **根本没有 `text()` 方法** —— 权威定义
 *    （`dsh-llm/lib/types/assembler.d.ts`）只有：
 *    `push` / `blocks()` / `interruptedBlocks()` / `message()` /
 *    `usage` / `finish` / `replayState`。
 *    ⇒ **`text` 恒为空串** ⇒ 每次评分都报"模型没有返回任何内容"，
 *      而**同一句日志里 `kinds` 却明明写着 `text`**（`blocks()` 是真能拿到的）。
 *    ⭐ 那个"**块有、文字没有**"的自相矛盾**就是这行的指纹** ——
 *      日后看到类似的自相矛盾，先怀疑"取值的 API 用错了"。
 *
 * ⭐ **正确做法：照抄同代码库里【已验证】的实现** ——
 *    `active-recall.ts` 的 `textOf()`（支撑整条 chat 通路召回，生产上稳定运行）。
 *    ⚠️ 我犯的错正是"**放着旁边能用的实现不抄，自己发明了一个 API**"：
 *    想复用现有实现，就**去读它**，而不是凭印象写一个签名相似的。
 * @param a - 已喂完 chunk 的汇编器。
 * @returns 正文 + 去重后的块类型列表。
 */
function textOfAssembler(a: BlockAssembler): { text: string; kinds: string[] } {
  const blocks = a.blocks()
  const kinds = [...new Set(blocks.map((b) => String(b.type)))]
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
  return { text, kinds }
}

/** 拆 `provider/model`（⚠️ model 里可能含 `/` ⇒ **只按第一个 `/` 切**）。 */
function splitRoute(s: string): { provider: string; model: string } | undefined {
  const i = s.indexOf('/')
  if (i <= 0 || i === s.length - 1) return undefined
  return { provider: s.slice(0, i), model: s.slice(i + 1) }
}
