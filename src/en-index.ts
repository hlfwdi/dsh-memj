/**
 * 英文召回索引（**B 方案：召回只读它**）。
 *
 * ── 它是什么 ──────────────────────────────────────────────────────────────
 * 把全部**活跃封面**（含 project / theme / kind / 中文 title+desc）连同
 * **英文译文**一起投影成一份 JSON：
 * `<库根>/recall/en-index.json`。
 *
 * ⭐ **召回时只读这一个文件**（不再调 `scanLibrary()`）—— 这是用速度换来的
 * **一致性责任**：索引脏了不会自动暴露 ⇒ 必须靠"落盘时重建 + 启动兜底"保鲜。
 *
 * ── 为什么必须"重建"而不是"追加" ─────────────────────────────────────────
 * 追加式维护要在**删除路径**上同步移除 ⇒ **必然漏**（同族事故：派生汇总
 * 只增不减会留下悬空引用）。重建 = 全量 diff ⇒ 增/改/删一次覆盖。
 *
 * ── 四条硬约束（设计文档 §9.3）────────────────────────────────────────────
 * 1. 🔴 **绝不影响 `memj_handoff` 成败** —— 本模块所有失败都静默吞掉；
 * 2. ⭐ **幂等靠 `descHash`** —— 中文没变就不重翻；重复触发安全；
 * 3. **崩了要能自愈** —— 启动时发现"索引缺失 / 封面数对不上"就补一次重建；
 * 4. **触发点挂在"封面发生变化"上** —— `handoff` 落盘后 + 启动兜底。
 *
 * ── 翻译：两条模板（配对解析器）──────────────────────────────────────────
 * | 模板 | 提示词 | 解析 |
 * |---|---|---|
 * | `instruct` | 要 JSON | `JSON.parse` |
 * | `mt` | **编号 + 空行分隔、无标签** | 先按空行切、再按换行切 |
 *
 * ⚠️ **模板与解析器必须配对**（错配 = 静默失败）⇒ 用**一个** `translateTemplate`
 * 同时决定两半。
 *
 * ⚠️ **调用 `ctx.llm.stream()` 时绝不传 `sessionId`** ——
 * 否则会被 `llm/stream` 监听器（含本插件自己的）判成"会话步"⇒ **递归**。
 *
 * @module dsh-memj/en-index
 */
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { deadline } from '@deepseek-ai/dsh-timeout'
// ⚠️ **刻意不用 `@deepseek-ai/dsh-util-values` 的 `deepFreeze`**：
//    它没被本插件声明为依赖（同族坑：未声明的包会让类型解析到另一份副本）。
//    `options` 是本模块自己构造的局部对象，不会被改动 ⇒ 不需要冻结。
import type { Context } from '@deepseek-ai/cordis'
import { libraryRoot, scanLibrary } from './store.ts'
// ⭐⭐⭐ 提示词运行期覆盖（本次新增）：三级翻译提示词走 `promptText` 取值。
import { promptText, registerPromptDefault } from './prompts.ts'
import type { MemjConfig } from './config.ts'

/** 一条索引记录（**B 方案完整投影**：召回不再回读封面）。 */
export interface EnIndexEntry {
  project: string
  theme: string[]
  kind: string
  title: string
  desc: string
  titleEn: string
  descEn: string
  /** 中文 desc 的短哈希 —— **保鲜判据**。 */
  descHash: string
  translatedAt: string
  /** 走的是哪条翻译路径（排障用）。 */
  via?: string
}

/** 索引文件结构。 */
export interface EnIndex {
  version: 1
  builtAt: string
  provider: string
  model: string
  template: string
  coverCount: number
  translated: number
  /** ⭐ 项目 → 主题映射（`project+themes` 范围要用；**不在封面里**）。 */
  projects: Record<string, { themes: string[] }>
  entries: Record<string, EnIndexEntry>
}

/**
 * ⭐⭐⭐ **「模型 ↔ 模板」配对规则**（用户 2026-10-07 要求）——
 * **唯一出处**：服务端保存校验与前端告警**都**从这里取，不许各写一份。
 *
 * ── 为什么要这条规则 ─────────────────────────────────────────────────
 * `translateTemplate` 是"提示词 + 解析器"的**配对开关**：
 * · `instruct` ⇒ 要 JSON、用 `JSON.parse`；
 * · `mt` ⇒ **要求模型是翻译专用模型**（编号 + 空行、无标签），解析器按空行/换行切。
 * 🔴 用户实测踩到：选了 `deepseek-v4.1-flash`（普通对话模型）**却把模板留成 `mt`**
 *    ⇒ 面板**毫无阻拦地存下去了**，而这两半错配就是**静默失败**。
 * ⇒ ⭐ 判据（用户原话）：*"如果选对应比如 mt 模版，但是没有响应的 mt 模型就要警告，
 *    并且保存时报错。"*
 *
 * ⚠️ **`instruct` 那一侧不设限制**：普通对话模型就该配 `instruct`，
 *    而翻译专用模型配 `instruct` 也能跑（库内实测：提示词那一半容错性高）。
 *    ⇒ **只拦"mt 模板 + 非 MT 模型"这一种错配**，别把合法的组合一起拦死。
 */

/**
 * ⭐ **判断一个 model id 是不是"翻译专用模型"**（`mt` 模板只对它成立）。
 *
 * 🔴 **为什么用名字判、而不是查"模型能力"**：DSH 的模型清单里**没有**
 *    "这是不是一个翻译专用模型"这个字段（`GET /models` 只回 id 与显示名）。
 *    ⇒ 只能按**命名**认。⚠️ 所以这条判据是**启发式**，不是权威 ——
 *      因此它只用来**拦明显错的组合**，措辞也要留余地（见 `pairingError` 的文案）。
 *
 * ⭐ 认得的形态（大小写不敏感）：
 * · 名字里含 `mt`**作为独立词**（`Hunyuan-MT-7B` / `xxx-MT` / `mt-7b`）；
 * · 或属于已知的翻译专用模型家族（`hunyuan-mt` / `opus-mt` / `nllb` / `m2m100`）。
 * ⚠️ **不把** `gpt` / `deepseek` / `claude` 这类**通用对话模型**误判成 MT ——
 *    它们名字里没有 `mt` 词，自然落选。
 * ⚠️ 也别把 `mt` 当**子串**乱匹配（那会误伤 `mtt`、`fmt` 之类）⇒ 用词边界。
 * @param provider - provider id（当前不参与判断，留给将来按 provider 收紧）。
 * @param model - model id（**可能含 `/`**，如 `tencent/Hunyuan-MT-7B`）。
 */
export function isMtModel(provider: string, model: string): boolean {
  const m = `${provider}/${model}`.toLowerCase()
  // ① 名字里含独立的 `mt` 词（`-mt` / `mt-` / `_mt` / `/mt` / 结尾 mt）
  if (/(^|[\W_])mt([\W_]|$)/.test(m)) return true
  // ② 已知的翻译专用模型家族（它们名字里未必有独立的 mt 词）
  return /hunyuan-mt|opus-mt|nllb|m2m100|seamless-m4t/.test(m)
}

/**
 * ⭐⭐ **校验「模板 ↔ 模型」是否配对**（不配对时回一条**给人看的中文错误**，否则回 `''`）。
 *
 * 判据（**只有这一条**）：**模板选 `mt` ⇒ 模型必须是翻译专用模型**。
 * ⚠️ 模型为空（= 跟随主会话）时**不拦** —— 那种情况由"主会话模型是什么"决定，
 *    面板此刻无从判断，**不该假装知道**（本项目一贯：不知道就别说）。
 * @param template - `'instruct'` / `'mt'`。
 * @param provider - `translateProvider`。
 * @param model - `translateModel`。
 * @returns 错误文案；`''` = 配对没问题。
 */
export function pairingError(template: string, provider: string, model: string): string {
  if (template !== 'mt') return ''
  if (model.trim() === '') return '' // 跟随主会话：无从判断，不拦
  if (isMtModel(provider, model)) return ''
  return `「${provider}/${model}」看起来不是翻译专用模型，但翻译模板选了 mt`
    + `（mt 要求模型按"编号 + 空行"输出，两者必须配对，否则会静默解析失败）。`
    + `请把模板改成 instruct，或换一个翻译专用模型（如 Hunyuan-MT 系列）。`
}

/** 一次重建的结果（回执/日志用）。 */
export interface RebuildResult {
  covers: number
  added: number
  updated: number
  removed: number
  translated: number
  failed: number
  repaired: number
  /** 非空 = 本次跳过的原因。 */
  skipped: string
}

/** 索引文件路径。 */
export function enIndexPath(): string {
  return join(libraryRoot(), 'recall', 'en-index.json')
}

/** 中文 desc 的短指纹（保鲜判据）。 */
export function descHashOf(desc: string): string {
  return createHash('sha256').update(desc).digest('hex').slice(0, 8)
}

/** 读索引；不存在或损坏 ⇒ `undefined`（**不抛**）。 */
export async function loadEnIndex(): Promise<EnIndex | undefined> {
  try {
    const text = await readFile(enIndexPath(), 'utf8')
    const parsed = JSON.parse(text) as EnIndex
    if (parsed?.version !== 1 || typeof parsed.entries !== 'object') return undefined
    return parsed
  } catch {
    return undefined
  }
}

/** 原子写索引。 */
export async function saveEnIndex(idx: EnIndex): Promise<void> {
  const target = enIndexPath()
  await mkdir(dirname(target), { recursive: true })
  // ⚠️ `mode` 是**必填**（`WriteFileAtomicOptions`）；索引是私有数据 ⇒ 0o600。
  await writeFileAtomic(target, `${JSON.stringify(idx, null, 1)}\n`, { mode: 0o600, dirMode: 0o700 })
}

/** 去空白/粗体/包裹引号 —— MT 与 instruct 的输出都要过这一道。 */
function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“'「]|["”'」]$/g, '')
}

/**
 * ⭐ **漏翻判据**：译文里残留的中文串，若**在中文原文中未被引号包裹** ⇒ 判为漏翻。
 *
 * 为什么需要它：原文里作为**示例/代码/乱码样本**被引号包起来的中文
 * （如 `「鏂规」`）**应当保留**，而普通词被原样搬进译文才是漏翻 ——
 * 两者表现一样，必须区分，否则会把正确的译文误判成错误。
 */
export function leakedHan(entry: Pick<EnIndexEntry, 'title' | 'desc' | 'titleEn' | 'descEn'>): string[] {
  const hits = [...`${entry.titleEn} ${entry.descEn}`.matchAll(/[\u4e00-\u9fff]+/g)].map((m) => m[0])
  if (hits.length === 0) return []
  const source = `${entry.title} ${entry.desc}`
  return hits.filter((h) => !new RegExp(`[「""'` + '`' + `']${h}[」""'` + '`' + `']`).test(source))
}

/** 从 `1. 标题\n\n描述` 或 `1. 标题\n描述` 里切出两段。 */
function splitTwo(text: string): { titleEn: string; descEn: string } | undefined {
  const body = text.replace(/^\s*\d+[.、]\s*/, '').trim()
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  if (blocks.length >= 2) {
    return { titleEn: cleanText((blocks[0] ?? '').split('\n')[0]), descEn: cleanText(blocks.slice(1).join(' ')) }
  }
  const lines = body.split('\n').map((l) => cleanText(l)).filter(Boolean)
  if (lines.length >= 2) return { titleEn: lines[0] ?? '', descEn: lines.slice(1).join(' ') }
  return undefined
}

const MT_SYS =
  'Translate the following numbered entries from Chinese into English. Keep the entry numbers. ' +
  'Output ONLY the translations: for each entry, one line for the title, then one line for the description.'
const MT_SYS_STRONG =
  'Translate the following numbered entry from Chinese into English. Output EXACTLY two lines. ' +
  'Line 1 = the translated title (keep the leading number). Line 2 = the translated description. Do NOT merge them into one line.'
const INSTRUCT_SYS =
  '你是翻译器。把用户给的「标题」和「描述」完整翻译成英文，不得保留任何中文字符' +
  '（原文中作为示例或代码引用的中文除外）。只输出一个 JSON 对象，没有其他内容。'

// ⭐⭐⭐ **登记默认值**（本次新增；展示页要用）。
// 🔴 **`instruct` 这条是"提示词 + 解析器"配对里的提示词那一半** ——
//    实测【提示词那一半容错性高、真正会静默失败的是解析器那一半】
//    ⇒ 页面上改措辞通常安全，但**不要改成"输出形态"**（例如让它别回 JSON）。
registerPromptDefault('translate:mt', MT_SYS)
registerPromptDefault('translate:mt-strong', MT_SYS_STRONG)
registerPromptDefault('translate:instruct', INSTRUCT_SYS)

/** 一次纯模型调用（⚠️ **绝不传 `sessionId`** —— 否则会触发 llm/stream 监听 ⇒ 递归）。 */
async function callModel(
  ctx: Context,
  config: MemjConfig,
  route: { provider: string; model: string },
  system: string,
  user: string,
): Promise<string | undefined> {
  const messages = [
    createUserMessage({
      content: [{ type: 'text', text: user }],
      source: { kind: 'plugin:dsh-memj' },
    }),
  ]
  const guard = deadline(undefined, config.translateTimeoutMs, 'MEMJ_EN_INDEX_TIMEOUT')
  // 🔴🔴 **必须 `ctx.get('llm')`，不是 `ctx.llm`**（2026-09-26 实测踩到）。
  //
  // 现象：3 条新知识进了索引、**译文全是空串**；索引顶层却记着正确的 `provider: sf`
  // ⇒ 看着像"上游拒绝了翻译"，实际是**根本没发出去**。
  // 根因：`ctx.llm` 是 `undefined` ⇒ `.stream` 抛 TypeError ⇒ 被下面的 catch 吞掉
  // ⇒ 返回 `undefined` ⇒ 记成"翻译失败"。**典型的静默失败**（不报错、只表现为空译文）。
  // ⭐ 本仓库的正确写法就在 `hot-watch.ts` 的 `resolveContextWindow`：`ctx.get('llm')`；
  //    API 层同理走 `deps.getService('llm')`。
  const llm = ctx.get('llm') as
    | { stream?: (options: unknown) => AsyncIterable<unknown> }
    | undefined
  if (llm?.stream === undefined) return undefined
  try {
    const options = {
      provider: route.provider,
      model: route.model,
      messages,
      system,
      temperature: 0,
      maxTokens: config.translateMaxTokens,
      signal: guard.signal,
      // 🔴 刻意不传 sessionId（见模块头注释）
    }
    const assembler = new BlockAssembler()
    for await (const chunk of llm.stream(options)) assembler.push(chunk as never)
    guard.signal.throwIfAborted()
    return assembler
      .blocks()
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join(' ')
  } catch {
    return undefined
  } finally {
    guard[Symbol.dispose]()
  }
}

/** 解析路由：配了就用自己的，否则**跟随主会话默认模型**；都拿不到 ⇒ `undefined`。 */
function resolveRoute(ctx: Context, config: MemjConfig): { provider: string; model: string } | undefined {
  if (config.translateProvider !== '' && config.translateModel !== '') {
    return { provider: config.translateProvider, model: config.translateModel }
  }
  try {
    const sel = ctx.get('agentDefaultModel') as { currentSelection?: () => { provider?: string; model?: string } } | undefined
    const cur = sel?.currentSelection?.()
    if (cur?.provider && cur.model) return { provider: cur.provider, model: cur.model }
  } catch {
    /* 拿不到就放弃 */
  }
  return undefined
}

/** 简易退避（重试是低频路径，不为此引入定时器抽象）。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * ⭐⭐ **同一级内重试**（2026-09-26 实测补上）。
 *
 * 🔴 **为什么必须有它**：下面三级是**换策略**，不是**重试** ——
 * 实测有一批 3 条，其中 1 条**三级全失败**（MT 把标题与描述合并成一行、解析不出两段），
 * 而**同一输入再跑一次就成功** ⇒ 那是**偶发**（模型输出有随机性，即便 `temperature: 0`）。
 * ⇒ 没有同档重试时，**一次抖动就烧掉全部三级**，那条留空直到下次重建。
 *
 * ⚠️ 重试只对"**同一输入、同一模板**"有意义：输入不同（如①空行 vs ②无空行）是**换策略**，
 * 那是下面三级在做的事，两者不能互相替代。
 * @param fn - 一次尝试；失败返回 `undefined`。
 * @param attempts - 总尝试次数（≥1）。
 * @param onRetry - 发生重试时回调（用于在 `via` 里标注）。
 * @returns 首次成功的结果；全败返回 `undefined`。
 */
async function withRetry<T>(
  fn: () => Promise<T | undefined>,
  attempts: number,
  onRetry?: () => void,
): Promise<T | undefined> {
  for (let i = 0; i < attempts; i++) {
    const got = await fn()
    if (got !== undefined) return got
    if (i < attempts - 1) {
      onRetry?.()
      await sleep(300 * (i + 1))
    }
  }
  return undefined
}

/**
 * 翻一条（**每级内部先重试，再降级**）。
 *
 * 路径：`mt+空行` → `mt+强指令` → `mt降级instruct`（`translateTemplate === 'instruct'` 时直接走最后一步）。
 * 每一级内部按 `translateRetries` 重试，**失败才降级**。
 * @returns 译文与所走路径；全失败返回 `undefined`。
 */
async function translateOne(
  ctx: Context,
  config: MemjConfig,
  route: { provider: string; model: string },
  title: string,
  desc: string,
): Promise<{ titleEn: string; descEn: string; via: string } | undefined> {
  const attempts = Math.max(1, config.translateRetries + 1)
  let retried = false
  const mark = (): void => {
    retried = true
  }
  const tag = (base: string): string => (retried ? `${base}(重试)` : base)

  if (config.translateTemplate === 'mt') {
    // ① 空行分隔（实测比强指令更有效：6 > 4 —— MT 是"忠实翻译格式"的模型）
    const ra = await withRetry(async () => {
      const a = await callModel(ctx, config, route, promptText('translate:mt', MT_SYS), `1. ${title}\n\n${desc}`)
      const r = a === undefined ? undefined : splitTwo(a)
      return r?.titleEn && r.descEn ? r : undefined
    }, attempts, mark)
    if (ra !== undefined) return { ...ra, via: tag('mt+空行') }

    // ② 强指令
    const rb = await withRetry(async () => {
      const b = await callModel(ctx, config, route, promptText('translate:mt-strong', MT_SYS_STRONG), `1. ${title}\n${desc}`)
      const r = b === undefined ? undefined : splitTwo(b)
      return r?.titleEn && r.descEn ? r : undefined
    }, attempts, mark)
    if (rb !== undefined) return { ...rb, via: tag('mt+强指令') }

    // ③ 降级到 instruct 形态
    return await translateInstruct(ctx, config, route, title, desc, tag('mt降级instruct'), attempts)
  }
  return await translateInstruct(ctx, config, route, title, desc, tag('instruct'), attempts)
}

async function translateInstruct(
  ctx: Context,
  config: MemjConfig,
  route: { provider: string; model: string },
  title: string,
  desc: string,
  via: string,
  attempts: number,
): Promise<{ titleEn: string; descEn: string; via: string } | undefined> {
  const user = `【标题】\n${title}\n\n【描述】\n${desc}\n\n只输出一行 JSON：{"title":"<english title>","desc":"<english description>"}`
  return await withRetry(async () => {
    const text = await callModel(ctx, config, route, promptText('translate:instruct', INSTRUCT_SYS), user)
    if (text === undefined) return undefined
    const m = text.match(/\{[\s\S]*\}/)
    if (m === null) return undefined
    try {
      const o = JSON.parse(m[0]) as { title?: string; desc?: string }
      const titleEn = cleanText(o.title)
      const descEn = cleanText(o.desc)
      if (titleEn === '' || descEn === '') return undefined
      return { titleEn, descEn, via }
    } catch {
      return undefined
    }
  }, attempts)
}

/** 有界并发映射。 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (i < items.length) {
        const k = i++
        out[k] = await fn(items[k] as T)
      }
    }),
  )
  return out
}

/** 模块级重建锁 —— 防并发重建（启动兜底与落盘触发可能撞上）。 */
let rebuilding = false

/**
 * ⭐ **重建索引**（落盘时 / 启动兜底都走这里）。
 *
 * 流程：`scanLibrary()` 全量 → 与现有索引 diff → 只翻「新增 / `descHash` 过期」
 * → 漏翻质检并重翻 → 原子写回。
 *
 * 🔴 **本函数不抛**（调用方可能是 handoff 的收尾路径）。
 */
export async function rebuildEnIndex(opts: {
  ctx: Context
  config: MemjConfig
  reason?: string
}): Promise<RebuildResult> {
  const { ctx, config } = opts
  const empty: RebuildResult = {
    covers: 0, added: 0, updated: 0, removed: 0, translated: 0, failed: 0, repaired: 0, skipped: '',
  }
  if (rebuilding) return { ...empty, skipped: '已有一次重建在进行中' }
  rebuilding = true
  try {
    const snapshot = await scanLibrary()
    const covers = snapshot.covers.map((c) => c.cover)
    const projects: Record<string, { themes: string[] }> = {}
    for (const p of snapshot.projects) projects[p.id] = { themes: [...p.frontmatter.themes] }
    // 🔴🔴 **归档项目也要建映射**（2026-09-29 修）——
    //    `scanLibrary()` **有意**把归档项目排除出 `snapshot.projects`（决策 133：项目列表看不见它），
    //    但**同时有意**保留它旗下的封面（同一条决策："归档项目时旗下知识不归档"）。
    //    ⇒ 结果是**归档项目的封面在 `entries` 里、项目却不在 `projects` 里**。
    //    ⚠️ 后果是静默的：`candidatesForScope` 的 `project` 档走 `c.project === pid`
    //       **能命中**（所以 `scope=project` 看似正常），而 `project+themes` 档走
    //       `idx.projects[pid]?.themes ?? []` ⇒ **拿到空数组** ⇒ 范围**静默缩成单项目**。
    //    ⭐ 实测：`qoder2api` 已归档、旗下 10 张封面仍在 `entries`，而 `projects` 里没有它。
    //    ⭐ 判据：**"项目层过滤"与"封面层过滤"是两件独立的事** ——
    //       建派生映射时不能只跟着其中一边走（`store.ts` 的 `scanLibrary` 注释写过同一句）。
    //    ⚠️ 只补"确实有封面落进索引"的那些项目（`entries` 的来源）——
    //       没封面的归档项目不必进映射（它进了也没人查）。
    const archived = await scanLibrary({ includeArchived: true })
    for (const p of archived.projects) {
      if (projects[p.id] === undefined) projects[p.id] = { themes: [...p.frontmatter.themes] }
    }

    const prev = await loadEnIndex()
    const prevEntries = prev?.entries ?? {}

    const route = resolveRoute(ctx, config)
    const todo: typeof covers = []
    let updated = 0
    for (const c of covers) {
      const old = prevEntries[c.id]
      if (!old || old.titleEn === '' || old.descEn === '' || old.descHash !== descHashOf(c.desc)) {
        if (old) updated++
        todo.push(c)
      }
    }
    const removed = Object.keys(prevEntries).filter((id) => !covers.some((c) => c.id === id)).length

    // 翻译（无路由 ⇒ 只更新结构，译文留空 —— 不是错误）
    const fresh = new Map<string, { titleEn: string; descEn: string; via: string }>()
    let failed = 0
    if (route && todo.length > 0) {
      const results = await mapLimit(todo, config.translateConcurrency, (c) =>
        translateOne(ctx, config, route, c.title, c.desc),
      )
      todo.forEach((c, i) => {
        const r = results[i]
        if (r) fresh.set(c.id, r)
        else failed++
      })
    }

    // 组装（未变的沿用旧译文）
    const now = new Date().toISOString()
    const entries: Record<string, EnIndexEntry> = {}
    for (const c of covers) {
      const old = prevEntries[c.id]
      const t = fresh.get(c.id)
      const entry: EnIndexEntry = {
        project: c.project,
        theme: [...c.theme],
        kind: c.kind,
        title: c.title,
        desc: c.desc,
        titleEn: t?.titleEn ?? old?.titleEn ?? '',
        descEn: t?.descEn ?? old?.descEn ?? '',
        descHash: descHashOf(c.desc),
        translatedAt: t ? now : (old?.translatedAt ?? ''),
      }
      const via = t?.via ?? old?.via
      if (via !== undefined) entry.via = via
      entries[c.id] = entry
    }

    // ⭐ 漏翻质检：残留中文若未被原文引号包裹 ⇒ 重翻（用 instruct 形态）
    let repaired = 0
    if (route) {
      const leaks = Object.entries(entries).filter(([, e]) => e.titleEn !== '' && leakedHan(e).length > 0)
      if (leaks.length > 0) {
        const leakAttempts = Math.max(1, config.translateRetries + 1)
        await mapLimit(leaks, config.translateConcurrency, async ([id, e]) => {
          const r = await translateInstruct(ctx, config, route, e.title, e.desc, 'instruct漏翻修复', leakAttempts)
          if (r) {
            e.titleEn = r.titleEn
            e.descEn = r.descEn
            e.translatedAt = now
            e.via = r.via
            repaired++
          }
          return id
        })
      }
    }

    const idx: EnIndex = {
      version: 1,
      builtAt: now,
      provider: route?.provider ?? '',
      model: route?.model ?? '',
      template: config.translateTemplate,
      coverCount: covers.length,
      translated: Object.values(entries).filter((e) => e.titleEn !== '' && e.descEn !== '').length,
      projects,
      entries,
    }
    await saveEnIndex(idx)

    const result: RebuildResult = {
      covers: covers.length,
      added: todo.length - updated,
      updated,
      removed,
      translated: fresh.size,
      failed,
      repaired,
      skipped: route ? '' : '未配置翻译模型且拿不到主会话路由 ⇒ 只更新了结构',
    }
    diag(`rebuild done reason=${opts.reason ?? '-'} ${JSON.stringify(result)}`, config)
    return result
  } catch (err) {
    // 🔴 绝不外抛（调用方可能是 handoff 收尾）
    diag(`rebuild THREW ${err instanceof Error ? err.message : String(err)}`, config)
    return { ...empty, skipped: err instanceof Error ? err.message : String(err) }
  } finally {
    rebuilding = false
  }
}

/**
 * ⭐ **触发一次后台重建**（fire-and-forget）—— 给"落盘成功"这类路径调用。
 *
 * 🔴 **不 await、不抛**：索引是派生数据，它失败**不该影响**调用方（尤其 handoff）。
 */
export function triggerEnIndexRebuild(ctx: Context, config: MemjConfig, reason: string): void {
  // ⚠️ 总开关关着 ⇒ **立刻返回**（不读库、不调模型）
  if (!config.enIndex) return
  void rebuildEnIndex({ ctx, config, reason }).catch(() => {})
}

/** 诊断日志（跟随项目既有约定：只在 config 打开时输出）。 */
function diag(message: string, config: MemjConfig): void {
  if (!config.enIndexDiag) return
  try {
    // eslint-disable-next-line no-console
    console.log(`[dsh-memj/en-index] ${message}`)
  } catch {
    /* ignore */
  }
}

/**
 * 注册英文索引机制（`index.ts` 的 `apply` 里调用）。
 *
 * 只做**启动兜底**（"落盘时重建"由 `tools.ts` 在 handoff 成功后触发）。
 *
 * ⭐⭐ **判据与「检查」按钮同源**（都用 {@link checkIndex}）——
 * 🔴 本项目铁律「**同一判据只能有一份实现**」：启动兜底与页面体检各算各的，
 * 迟早出现"页面说健康、启动却说该重建"。
 *
 * 判据（`needsRepair`）覆盖：索引缺失 / 封面数不符 / **幽灵** / **缺失** /
 * **缺译文** / **指纹过期** / **译文残留中文**。
 * ⚠️ 其中"未配置翻译模型"**不算需要补全**（那是配置问题，重建也补不出来）。
 */
export function registerEnIndex(opts: { ctx: Context; config: MemjConfig }): void {
  const { ctx, config } = opts
  if (!config.enIndex) {
    diag('disabled (enIndex=false)', config)
    return
  }
  void (async () => {
    try {
      const health = await checkIndex({ ctx, config })
      if (!health.needsRepair) {
        diag(`startup: 索引与库一致（${health.visible} 条，缺译文 ${health.untranslated}）`, config)
        return
      }
      diag(`startup: 需补全 ⇒ 重建（${health.problems.join('；')}）`, config)
      await rebuildEnIndex({ ctx, config, reason: 'startup-health' })
    } catch (err) {
      diag(`startup THREW ${err instanceof Error ? err.message : String(err)}`, config)
    }
  })()
}

/**
 * ⭐⭐ **索引体检报告**（人侧「检查」按钮 + 启动兜底**共用同一份判据**）。
 *
 * 🔴 **为什么必须共用**：本项目铁律「**同一判据只能有一份实现**」——
 * 启动兜底与页面体检若各算各的，迟早出现"页面说健康、启动却说该重建"。
 *
 * 报告**只读**（不写盘）。
 */
export interface IndexHealth {
  /** 索引文件是否存在。 */
  exists: boolean
  /** 索引里的条数（不存在为 0）。 */
  indexed: number
  /** `scanLibrary()` 的活跃封面数（**权威口径**）。 */
  visible: number
  /** 索引有、库里无（**幽灵条目** —— 会把已删的知识当成存在）。 */
  ghost: number
  /** 库里有、索引无（**缺失** —— 召回会漏掉新知识）。 */
  absent: number
  /** 缺译文的条数（结构对、内容空）。 */
  untranslated: number
  /** 中文 desc 与 `descHash` 对不上的条数（**保鲜判据失效** ⇒ 会反复重翻）。 */
  staleHash: number
  /** 命中漏翻判据的条数（译文里残留普通中文词）。 */
  leaked: number
  /** ⭐ **归属漂移**：条目的 `project`/`theme` 与库里对不上的条数（范围筛选会用错归属）。 */
  metaDrift: number
  /** ⭐ **项目主题映射漂移**：项目 `themes:` 与索引里记的对不上的项数。 */
  projectDrift: number
  /** 体检时刻。 */
  checkedAt: string
  /** 上次重建时刻（索引不存在时为空）。 */
  builtAt: string
  /** 当前生效的翻译路由（配置来，拿不到为空）。 */
  route: string
  /** ⭐ **是否需要补全**（任一项有问题）。 */
  needsRepair: boolean
  /** 是否需要补全的**理由清单**（给人看，逐条说清）。 */
  problems: string[]
}

/**
 * ⭐ **检查索引**（只读，不写盘）。
 *
 * 判据**与启动兜底同源**（见 {@link IndexHealth} 的说明）。
 * @returns 体检报告；任何一步失败都**降级成"不可判定"**而不是抛。
 */
export async function checkIndex(opts: { ctx: Context; config: MemjConfig }): Promise<IndexHealth> {
  const { ctx, config } = opts
  const now = new Date().toISOString()
  const empty: IndexHealth = {
    exists: false, indexed: 0, visible: 0, ghost: 0, absent: 0, untranslated: 0,
    staleHash: 0, leaked: 0, metaDrift: 0, projectDrift: 0,
    checkedAt: now, builtAt: '', route: '', needsRepair: false, problems: [],
  }
  try {
    const [idx, snap] = await Promise.all([loadEnIndex(), scanLibrary()])
    const visible = snap.covers.length
    const route = resolveRoute(ctx, config)
    if (idx === undefined) {
      return {
        ...empty,
        visible,
        route: route ? `${route.provider}/${route.model}` : '',
        needsRepair: true,
        problems: [`索引文件不存在（有 ${visible} 条封面待建索引）`],
      }
    }
    const ids = new Set(snap.covers.map((c) => c.cover.id))
    const ghost = Object.keys(idx.entries).filter((x) => !ids.has(x)).length
    const absent = [...ids].filter((x) => idx.entries[x] === undefined).length
    const entries = Object.values(idx.entries)
    const untranslated = entries.filter((e) => e.titleEn === '' || e.descEn === '').length
    const staleHash = entries.filter((e) => e.descHash !== descHashOf(e.desc)).length
    const leaked = entries.filter((e) => e.titleEn !== '' && leakedHan(e).length > 0).length

    // ⭐⭐ **归属漂移**（2026-09-26 核实补，这是一条**判据盲区**）：
    //    人侧（网页）或 LLM 侧都能改条目的 `project` / `theme`（`moveEntry` / `editEntryThemes`
    //    / `renameProject` / `renameTheme` / `deleteProject` / `deleteTheme` / 归档…）。
    //    🔴 **而上面那些判据一条都发现不了它** —— 实测：把某条的 project/theme 改掉后，
    //    `ghost=0 / absent=0 / staleHash=0 / untranslated=0` ⇒ **needsRepair=false**。
    //    ⚠️ 后果：`project` / `project+themes` **范围筛选会用错的归属**（选错候选池）。
    //    ⇒ ⭐ 单独比这两项（**重建时元数据每次从库重读，所以重建即可修好**）。
    const byId = new Map(snap.covers.map((c) => [c.cover.id, c.cover]))
    let metaDrift = 0
    for (const [id, e] of Object.entries(idx.entries)) {
      const c = byId.get(id)
      if (c === undefined) continue
      const sameTheme = e.theme.length === c.theme.length && e.theme.every((t, i) => t === c.theme[i])
      if (e.project !== c.project || !sameTheme) metaDrift++
    }
    // ⭐ 项目 → 主题映射也要比（它不在封面里，手工改动同样发现不了）
    //
    // 🔴🔴 **2026-10-07 修一个真 bug：这里必须与【写入侧】用同一份口径**
    //    （`scanLibrary({ includeArchived: true })`）。
    //
    //    **病症**：索引的 `projects` 映射里**恒有 2 条"漂移"**，**重建也修不掉**
    //    ⇒ `needsRepair` **永远为 true** ⇒ 用户每次打开英文索引页都触发一次**整轮重建**
    //    （实测：每次点检查跑满约 75 秒、155 条翻译全部白试一遍）。
    //
    //    **根因**：两侧口径不一致 ——
    //      · **写入侧**（`rebuildEnIndex`，见上面那段注释）：**有意**把**归档项目**
    //        也写进 `projects` 映射（因为归档项目旗下的封面**仍在** `entries` 里，
    //        少了映射会让 `project+themes` 范围**静默缩成单项目**）；
    //      · **检查侧**（原代码）：拿 `snap.projects` 比，而默认的 `scanLibrary()`
    //        **不含归档项目** ⇒ 把索引里那两条**正确**记录判成"漂移"。
    //    ⇒ 实测：`hindsight-research` / `qoder2api` 两个**已归档**项目，
    //      重建完（`builtAt` 就是刚写的）仍然是 `projectDrift = 2`。
    //
    //    ⭐⭐ **判据（可迁移）："检查"与"生成"必须共用同一份口径** ——
    //      判据里写一句"应该是什么样"，就等于把生成逻辑抄了第二遍；
    //      两份一旦不同步，症状是**"修不掉的红"**（比不报更糟：它让体检结果不可信，
    //      还会每次白跑一整轮重建）。
    //    ⚠️ 本项目已多次记过同族（"同一语义两条实现，修一条不等于修了它"）。
    const snapForProjects = await scanLibrary({ includeArchived: true })
    const idxThemes = idx.projects
    let projectDrift = 0
    for (const p of snapForProjects.projects) {
      const a = idxThemes[p.id]?.themes ?? []
      const b = [...p.frontmatter.themes]
      if (a.length !== b.length || a.some((t, i) => t !== b[i])) projectDrift++
    }
    for (const id of Object.keys(idxThemes)) {
      // ⚠️ 同一份口径：**归档项目也算"存在"**（写入侧把它们写进了映射）。
      if (!snapForProjects.projects.some((p) => p.id === id)) projectDrift++
    }

    const problems: string[] = []
    const structural: string[] = []   // ⭐ 只有"结构类"问题才值得重建（见下）
    if (idx.coverCount !== visible) { const m = `封面数不符：索引 ${idx.coverCount} ≠ 实际 ${visible}`; problems.push(m); structural.push(m) }
    if (ghost > 0) { const m = `幽灵条目 ${ghost} 条（库里已删、索引还在）`; problems.push(m); structural.push(m) }
    if (absent > 0) { const m = `缺失条目 ${absent} 条（库里有、索引没跟上）`; problems.push(m); structural.push(m) }
    if (staleHash > 0) { const m = `指纹过期 ${staleHash} 条（中文 desc 变过、译文没跟）`; problems.push(m); structural.push(m) }
    if (metaDrift > 0) { const m = `归属漂移 ${metaDrift} 条（project/theme 改过 ⇒ 范围筛选用错归属）`; problems.push(m); structural.push(m) }
    if (projectDrift > 0) { const m = `项目主题映射漂移 ${projectDrift} 项（项目 themes 改过）`; problems.push(m); structural.push(m) }
    if (untranslated > 0) problems.push(`缺译文 ${untranslated} 条`)
    if (leaked > 0) problems.push(`译文残留中文 ${leaked} 条`)
    if (route === undefined && (untranslated > 0 || leaked > 0)) {
      problems.push('未配置翻译模型、且拿不到主会话路由 ⇒ 这些**要翻译**的项目无法自动补')
    }

    // 🔴🔴 **哪些问题值得触发重建**（2026-09-26 隔离实测修正）：
    //    · **结构类**（封面数 / 幽灵 / 缺失 / 指纹过期）⇒ 重建能修 ⇒ **该重建**；
    //    · **缺译文 / 残留中文** ⇒ **只有拿得到翻译路由时重建才有意义** ——
    //      没路由时重建**一条也翻不出来**，只会白写一次盘 ⇒ ⛔ **不该触发重建**。
    //    ⚠️ 我第一版把"缺译文"也算进去 ⇒ 实测在无路由环境下**每次点检查都会重建**。
    const contentFixable = route !== undefined && (untranslated > 0 || leaked > 0)
    const needsRepair = structural.length > 0 || contentFixable

    return {
      exists: true,
      indexed: Object.keys(idx.entries).length,
      visible,
      ghost,
      absent,
      untranslated,
      staleHash,
      leaked,
      metaDrift,
      projectDrift,
      checkedAt: now,
      builtAt: idx.builtAt,
      route: route ? `${route.provider}/${route.model}` : '',
      // 🔴 **用上面算好的 `needsRepair`**（结构类 or 有路由的内容类）——
      //    ⚠️ 这里原本写的是 `problems.some(...)`，**没把"没路由 ⇒ 不重建"算进去**
      //    ⇒ 实测在无路由环境下每次点检查都会白重建一次（隔离测试抓到的）。
      needsRepair,
      problems,
    }
  } catch (err) {
    return {
      ...empty,
      needsRepair: true,
      problems: [`体检本身失败：${err instanceof Error ? err.message : String(err)}`],
    }
  }
}

/**
 * ⭐⭐ **检查并（按需）补全** —— 给人侧「检查并补全」按钮用。
 *
 * 🔴 **动手前先看体检报告**：**没问题就不重建**（避免每次点击都白花翻译钱）。
 * @returns 体检报告 + 本次是否真的重建过 + 重建结果。
 */
export async function checkAndRepair(opts: {
  ctx: Context
  config: MemjConfig
  force?: boolean
}): Promise<{ health: IndexHealth; repaired: boolean; result?: RebuildResult }> {
  const { ctx, config } = opts
  const health = await checkIndex({ ctx, config })
  if (!health.needsRepair && opts.force !== true) {
    return { health, repaired: false }
  }
  const result = await rebuildEnIndex({ ctx, config, reason: 'manual-check' })
  // 重建后再体检一次 ⇒ 回执反映**补全后**的真实状态（而不是动手前的）
  const after = await checkIndex({ ctx, config })
  return { health: after, repaired: true, result }
}
