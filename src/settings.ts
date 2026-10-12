/**
 * ⭐ 设置读写：**定点改写当前 profile 的 `cordis.patch.yml`**（决策 97 / §8.8）。
 *
 * ── 为什么是"改配置文件"而不是"存库里" ──────────────────────────────────────
 * 配置的唯一权威来源就是 profile 的 patch 层（`apply(ctx, config)` 的第二参）。
 * 若另存一份到 `~/.dsh-memj/settings.json`，就会有**两套开关**且要自己实现重读——
 * 复用现成机制更简单，也让"人手工改 yml"与"网页点按钮"**写的是同一处**。
 *
 * ── 🔴 路径从哪来（已实测核实，2026-09-19）────────────────────────────────
 * `ctx.baseUrl` **恒等于当前 profile 目录**——`dsh-app-boot` 的 `boot()` 里
 * `ctx.baseUrl = pathToFileURL(dirname(absoluteConfigPath)).href`，
 * 而 `absoluteConfigPath` 就是 `<profileDir>/cordis.yml`。
 * ⇒ `new URL('cordis.patch.yml', baseUrl)` 即目标文件（**不需要拼 `$DSH_HOME`
 * 与 profile 名**——`--profile` 参数根本不在 `ctx` 上）。
 *
 * ── 🔴 为什么用 `parseDocument` 而不是 `parse` ──────────────────────────────
 * `cordis.patch.yml` 是**给人改的层**（模板自带注释，用户也会写中文注释）。
 * `parse` + `stringify` 会把注释**全部吃掉**。`parseDocument`/`toString` 保留注释、
 * 缩进与原条目（已实测：中文注释完好、幂等、多键共存正常）。
 *
 * @module dsh-memj/settings
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'
import type { MemjConfig } from './config.ts'

/**
 * 🔴 **loader 树里的 entry id 与包名不是一回事**（2026-09-19 实测踩到）：
 * 插件自己的 `cordis.patch.yml` 写的是 `insert: [{ id: memj, name: dsh-memj }]`
 * ⇒ **条目 id 是 `memj`**，而 `dsh-memj` 是**包名**。
 *
 * ⚠️ **写错 id 的后果很隐蔽**：patch 文件里会多出一条**永远匹配不到的死条目**，
 * boot 时只打一行 `patch: entry "dsh-memj" not found` 警告，
 * 配置**静默不生效**（面板显示"已保存"、实际毫无作用）。
 *
 * ⇒ 因此**不写死**：优先用调用方从 loader 树里读到的真实 id；拿不到才退回默认值。
 */
const DEFAULT_ENTRY_ID = 'memj'

/**
 * 包名（`package.json` 的 `name`）——**稳定标识**。
 *
 * ⚠️ 与 entry id **不是一回事**：本插件的 bundle patch 写的是
 * `insert: [{ id: memj, name: dsh-memj }]`。用 `name` 兜底可防"id 被改过"。
 */
const PACKAGE_NAME = 'dsh-memj'

/** patch 文件名（与 `dsh-app-boot` 的 `PROFILE_PATCH_FILENAME` 一致）。 */
const PATCH_FILENAME = 'cordis.patch.yml'

/** patchReload 模式（决定"要不要重启"，§8.8.4）。 */
export type PatchReload = 'live' | 'startup' | 'unknown'

/** 设置的读取结果。 */
export interface SettingsReadResult {
  /**
   * ⚠️ **进程内那一刻的生效配置**（`apply()` 拿到的第二参，已含默认值）。
   *
   * 🔴 **它不等于"磁盘上写着什么"**：写盘（`writeSetting`）不会回头更新它，
   *    要等下一次**热重载/重启**才变。⇒ **面板要显示"刚存下的值"就必须用
   *    `explicit`**（见 `effectiveConfig`），否则会出现"存完立刻弹回旧值"。
   */
  config: MemjConfig
  /**
   * ⭐⭐ **磁盘上显式写了**的键值（`- id: dsh-memj` 那条的 `config` 原样）。
   *
   * ⚠️ 只含**显式写了**的键 —— 没写的键不在这里（它们走 `config` 的默认/回落值）。
   * 🔴 **判断"写没写"必须用 `Object.hasOwn`，不能用取值真伪**：
   *    `false` / `0` / `''` 都是**合法且显式**的值（本项目同族坑）。
   */
  explicit: Record<string, unknown>
  /** ⭐ patch 文件的绝对路径；拿不到时为 `''`。 */
  patchPath: string
  /** 该文件当前是否存在。 */
  patchExists: boolean
  /** 该文件里 `- id: dsh-memj` 那条**显式写了**哪些键（没写的走默认值）。 */
  explicitKeys: string[]
  /**
   * ⭐ 热重载策略——`live` ⇒ 改完自动生效；`startup` ⇒ **必须重启**。
   *
   * ⚠️ 从 profile 的 `package.json` 的 `dsh.profile.patchReload` 读；
   * 读不到时回 `unknown`，此时**不得**向用户承诺"已生效"。
   */
  patchReload: PatchReload
  /** 读失败时的原因（成功为 `''`）。 */
  error: string
}

/**
 * 由 `ctx.baseUrl` 解析当前 profile 目录。
 * @param baseUrl - `ctx.baseUrl`（形如 `file:///D:/.../profiles/web/`）。
 * @returns profile 目录绝对路径；不可用时返回 `''`。
 */
export function profileDirFrom(baseUrl: unknown): string {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') return ''
  try {
    // 末尾带 `/` 才能当目录基准用（`baseUrl` 本身以 `/` 结尾，这里再保一手）。
    const href = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    return fileURLToPath(new URL('.', href))
  } catch {
    return ''
  }
}

/**
 * 解析出 patch 文件的绝对路径。
 * @param baseUrl - `ctx.baseUrl`。
 * @returns 绝对路径；不可用时返回 `''`。
 */
export function patchPathFrom(baseUrl: unknown): string {
  const dir = profileDirFrom(baseUrl)
  if (dir === '') return ''
  try {
    return fileURLToPath(new URL(PATCH_FILENAME, `file:///${dir.replace(/\\/g, '/')}${dir.endsWith('\\') || dir.endsWith('/') ? '' : '/'}`))
  } catch {
    return ''
  }
}

/**
 * 读 profile 的 `patchReload` 设置（决定改完要不要重启）。
 *
 * ── 🔴🔴 为什么"没写"必须回 `live` 而不是 `unknown`（2026-10-07 实测纠正）──────
 * 这条以前回 `unknown`，理由是"不猜"。**那是错的**，两代 DSH 都明确说"没写 = 热重载"：
 *
 * | 版本 | `patchReload` 字段 | 没写时的语义 |
 * |---|---|---|
 * | 0.1.5 | 存在，**可选**（`'live' \| 'startup'`） | 类型注释原文：*"omitted means `live` for custom profiles"*，且 `DEFAULT_PROFILE_PATCH_RELOAD = 'live'` |
 * | 0.2.0-rc.2 | **该字段已被整个删除** | patch 文件由 `dsh-hmr` **无条件**监听（`watchConfig()` 没有任何开关判断）⇒ **恒为 live** |
 *
 * ⇒ ⭐ **两代里"没写"都等于 `live`**，所以这里没有可"猜"的余地。
 *
 * 🔴 **误报的实际后果**（用户 2026-10-07 问出来的）：面板把 `unknown` 渲染成
 *    「读不到本 profile 的热重载策略：保存后可能需要重启才生效」，
 *    而**实测 10/10 项设置都在 ~0.5–2.5 秒内热生效**（探针见
 *    `scripts/probe-hotreload-matrix.mjs`）⇒ **界面在说谎**，用户会去白重启。
 *    ⚠️ 这与本项目既有那条教训同族："**默认值必须通过它自己的校验**"——
 *      这里的形态是"**默认值必须是真实的默认值**"，把"文档写明的默认"报成
 *      "读不到"，等于让界面永远给出错误的保守建议。
 *
 * ⚠️ 显式写了的 `'startup'` **仍然照实回**（0.1.5 上是用户刻意的选择）。
 * @param profileDir - profile 目录。
 * @returns `'live'` / `'startup'`。
 */
async function readPatchReload(profileDir: string): Promise<PatchReload> {
  // ⚠️ 路径拿不到时才回 `unknown` —— 那种情况下我们**确实**无从判断，
  //    而"无从判断"与"文档写明是 live"是两件事，不能混为一谈。
  if (profileDir === '') return 'unknown'
  try {
    const text = await readFile(`${profileDir}package.json`, 'utf8')
    const pkg = JSON.parse(text) as { dsh?: { profile?: { patchReload?: unknown } } }
    const raw = pkg.dsh?.profile?.patchReload
    if (raw === 'live' || raw === 'startup') return raw
    // ⭐ 没写 / 值不认识 ⇒ **`live`**（理由见上方表格：两代都如此）。
    return 'live'
  } catch {
    // ⚠️ 读不到文件 = 无从判断（与"没写这个键"不同）⇒ 如实回 unknown。
    return 'unknown'
  }
}

/**
 * 定位 YAML 里本插件那一条。
 *
 * ⭐ **两级匹配**（用户可能改过 id）：
 *   ① `id === entryId`（默认 `memj`，与插件 bundle patch 的 `insert` 一致）；
 *   ② 退而匹配 `name === 'dsh-memj'`（**包名**——它才是稳定标识）。
 * @param doc - 已解析的文档。
 * @param entryId - 期望的条目 id。
 * @returns 该条目节点或 `undefined`。
 */
function findEntry(doc: ReturnType<typeof parseDocument>, entryId: string): unknown {
  const items = (doc.contents as { items?: unknown[] } | null)?.items
  if (!Array.isArray(items)) return undefined
  const getter = (item: unknown): ((k: string) => unknown) | undefined => {
    const get = (item as { get?: (k: string) => unknown }).get
    return typeof get === 'function' ? (k) => get.call(item, k) : undefined
  }
  // ① 先按 id 找。
  for (const item of items) {
    const g = getter(item)
    if (g !== undefined && g('id') === entryId) return item
  }
  // ② 再按包名找（id 被改过的情况）。
  for (const item of items) {
    const g = getter(item)
    if (g !== undefined && g('name') === PACKAGE_NAME) return item
  }
  return undefined
}

/**
 * ⭐ 读出当前设置（**只读**，不改任何文件）。
 *
 * ⚠️ `config` 由调用方（`api.ts`）从 `apply()` 拿到的**已解析配置**传入——
 * 这里**不重新解析整棵 loader 树**（那既慢又可能不一致）。
 * 本函数只负责**文件侧**的信息（路径、显式键、patchReload）。
 * @param baseUrl - `ctx.baseUrl`。
 * @param config - 当前生效的配置。
 * @param entryId - ⭐ loader 树里的**真实条目 id**（默认 `memj`；见文件头警告）。
 * @returns 读取结果。
 */
export async function readSettings(
  baseUrl: unknown,
  config: MemjConfig,
  entryId: string = DEFAULT_ENTRY_ID,
): Promise<SettingsReadResult> {
  const dir = profileDirFrom(baseUrl)
  const patchPath = patchPathFrom(baseUrl)
  const patchReload = await readPatchReload(dir)

  let explicitKeys: string[] = []
  let explicit: Record<string, unknown> = {}
  let exists = false
  let error = ''

  if (patchPath === '') {
    error = '拿不到 profile 路径（ctx.baseUrl 不可用），无法定位 cordis.patch.yml。'
  } else {
    try {
      const text = await readFile(patchPath, 'utf8')
      exists = true
      const doc = parseDocument(text)
      if (doc.errors.length > 0) {
        error = `cordis.patch.yml 解析失败：${doc.errors[0]?.message ?? '未知错误'}`
      } else {
        const entry = findEntry(doc, entryId)
        const cfg = (entry as { get?: (k: string) => unknown } | undefined)?.get?.('config')
        const toJSON = (cfg as { toJSON?: () => unknown } | undefined)?.toJSON
        if (typeof toJSON === 'function') {
          const obj = toJSON.call(cfg)
          if (obj !== null && typeof obj === 'object') {
            explicit = obj as Record<string, unknown>
            explicitKeys = Object.keys(explicit)
          }
        }
      }
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'ENOENT') exists = false
      else error = `读 cordis.patch.yml 失败：${err instanceof Error ? err.message : String(err)}`
    }
  }

  return {
    config,
    explicit,
    patchPath,
    patchExists: exists,
    explicitKeys,
    patchReload,
    error,
  }
}

/**
 * ⭐⭐⭐ **"磁盘上写了就按磁盘"** 的生效配置（供设置面板回显）。
 *
 * 🔴🔴 **为什么必须有这一步**（2026-10-07 实测复现的真 bug）：
 *   `readSettings` 回显的是 `deps.config` —— 那是 **`apply()` 那一刻解析出来的**
 *   进程内配置。而 `writeSetting` 只改文件，**不会**回头更新它；要等下一次
 *   **热重载/重启**才变。
 *   ⇒ 用户在面板上选好「裁决模型」→ 点保存（**写盘成功了**）→ 面板**立刻**
 *     重新拉 `/settings` → 拿到**旧值** → 把下拉框重新填回旧值
 *      ⇒ 用户看到的正是「**存完就弹回默认**」。
 *   ⚠️ 而且它会**真的丢数据**：控件被填回旧值后，用户再点一次保存（或保存别的项
 *      时把这一项一起带上）⇒ **旧值被写回磁盘**，用户的选择被静默抹掉。
 *      （实测：`user-pick` → 面板回显旧值 → 再存一次 ⇒ 磁盘变回旧值。）
 *
 * ⭐ **口径 = 磁盘显式值优先、进程配置兜底**：
 *   · 磁盘**显式写了**这个键 ⇒ 用磁盘那份（那正是用户刚存下的值）；
 *   · 没写 ⇒ 用 `config` 里的值（含默认值与"旧键回落"的生效值）。
 *   ⚠️ **兜底那一半不能省**：本项目多处键有"回显**生效值**"的约定
 *      （如 `activeInjectNeedMin` 由旧键 `activeInjectBand` 回落而来）——
 *      一律只认磁盘会让那些键显示成空白/默认。
 * ⭐ **做成"合并出一份配置"而不是"逐键取值"**（本项目铁律：实现只留一份）：
 *   调用方拿到的是一份**普通 `MemjConfig`**，于是既有的回落函数
 *   （`needMinOf` / `itemMinOf` / `maxInjectionsPerTurn`）**原样可用**、
 *   也不必在 40 个键上各写一遍（漏一个就留一个"存完弹回"的键）。
 *
 * 🔴 **"写没写"必须用 `Object.hasOwn` 判**，不能用取值真伪：
 *    `false` / `0` / `''` 都是**合法且显式**的值（本项目同族坑，
 *    见 `api.ts` 里"布尔键必须用 `!== undefined` 判存在性"的注释）。
 * @param r - `readSettings` 的结果。
 * @returns 面板应当显示的配置（磁盘显式值覆盖进程内那份）。
 */
export function effectiveConfig(r: SettingsReadResult): MemjConfig {
  if (r.explicitKeys.length === 0) return r.config
  // ⚠️ 只覆盖**磁盘上显式写了**的键 —— 不能整份 `{ ...explicit }` 替换：
  //    `explicit` 里没有的键（走默认/回落值的）必须继续由 `config` 提供。
  const merged: Record<string, unknown> = { ...(r.config as unknown as Record<string, unknown>) }
  for (const k of r.explicitKeys) merged[k] = r.explicit[k]
  return merged as unknown as MemjConfig
}

/** 写入结果。 */
export interface SettingsWriteResult {
  ok: boolean
  /** 给人看的说明（成功与失败都要有）。 */
  message: string
  /** 写完后的 patch 文件绝对路径。 */
  patchPath: string
  /** ⭐ 是否需要重启才生效（`patchReload !== 'live'`）。 */
  needsRestart: boolean
}

/**
 * ⭐ **定点写入** `themeCreation` / `progressCharsWarn`（决策 97）。
 *
 * 只改 `- id: dsh-memj` 这一条的 `config.<key>` **一个键**：
 * · 保留文件里**其余全部内容**（注释、其他条目、其他键）；
 * · 该条目不存在 ⇒ **新增一条**（不覆盖任何已有条目）；
 * · 幂等（改两次结果一致）。
 *
 * ⚠️ **本函数只管"写"，不管"值合不合法"**——取值校验在 `api.ts`（人侧入口）与
 *    `config.ts` 的 schemastery（插件启动）各自完成，与既有 `themeCreation` 的分工一致。
 * @param baseUrl - `ctx.baseUrl`。
 * @param key - 要写的配置键。
 * @param value - 要写的值（已由调用方校验）。
 * @param entryId - ⭐ loader 树里的**真实条目 id**（默认 `memj`；见文件头警告）。
 * @returns 写入结果。
 */
export async function writeSetting(
  baseUrl: unknown,
  key:
    | 'themeCreation'
    | 'progressCharsWarn'
    | 'progressCharsKeep'
    | 'backupGit'
    // ⭐⭐ 热知识（热知识方案 §10）：预算类旋钮放**主设置面板**（用户裁定）。
    | 'hotInject'
    | 'hotInjectRatio'
    | 'hotCharsPerToken'
    | 'hotBudgetCharsFallback'
    | 'hotFullWarnChars'
    | 'hotSessionKeep'
    // ⭐⭐⭐ 知识评分（决策 177；属**热知识注入**板块）
    | 'hotScoreOnTurnEnd'
    | 'hotScoreThreshold'
    | 'hotScoreWindowHours'
    | 'hotScoreTopN'
    | 'hotScoreGateMinScore'
    | 'hotScoreGateLastTurn'
    | 'hotScoreMaxPicks'
    | 'hotScoreMinChars'
    | 'hotScoreChannel'
    | 'hotScoreModel'
    | 'hotScoreSubagentProvider'
    | 'hotScoreSubagentModel'
    | 'hotScoreTimeoutMs'
    // ⭐⭐ 英文召回索引（设计文档 §9）：翻译模型 / 模板 / 并发 / 诊断
    | 'enIndex'
    | 'enIndexDiag'
    | 'translateProvider'
    | 'translateModel'
    | 'translateTemplate'
    | 'translateConcurrency'
    | 'translateRetries'
    | 'translateTimeoutMs'
    | 'translateMaxTokens'
    // ⭐⭐⭐ 标签规范化（决策 162）：裁决模型（B 层）——
    //    🔴 **与 `translate*` 分开**：翻译模型只会翻译、不会判断"这两个词是不是同义"。
    | 'tagNormalizeProvider'
    | 'tagNormalizeModel'
    | 'tagNormalizeTimeoutMs'
    | 'tagNormalizeMaxTokens'
    // ⭐ 决策 168：裁决模型的思考等级（默认 `off` —— 用户要求关到最低）。
    | 'tagNormalizeReasoningEffort'
    // ⭐ 决策 165：有知识沉淀时**自动**跑一次（默认开，可关）。
    | 'tagNormalizeOnHandoff'
    // ⭐⭐⭐ 决策 177：轮末知识评分（属**热知识注入**板块；用户裁定）。
    | 'hotScoreOnTurnEnd'
    | 'hotScoreThreshold'
    | 'hotScoreWindowHours'
    | 'hotScoreTopN'
    | 'hotScoreGateMinScore'
    | 'hotScoreGateLastTurn'
    | 'hotScoreMaxPicks'
    | 'hotScoreMinChars'
    | 'hotScoreChannel'
    | 'hotScoreModel'
    | 'hotScoreSubagentProvider'
    | 'hotScoreSubagentModel'
    | 'hotScoreTimeoutMs'
    // ⭐⭐⭐ 上下文占用率上报（决策 226；2026-10-12 用户裁定）——
    //    轮末把占用率注入给模型（`agent.inject`，不唤醒），
    //    让它能依据"提示词里写的阈值动作"自行判断该不该动作。
    //    ⭐ 它服务的是**上下文管理**，与热知识/主动注入都不同；
    //    🔴 **默认关 ⇒ 不影响任何现有行为**。
    | 'contextReportOnTurnEnd'
    | 'contextReportMinPercent'
    // ⭐⭐ 主动注入（设计文档 §10.1）：开关 / 通路 / 模型 / 范围 / 触发口径 / 各种阈值
    | 'activeInject'
    | 'activeInjectChannel'
    | 'activeInjectModel'
    | 'activeInjectScope'
    | 'activeInjectJevNarrowScope'
    // ⭐⭐⭐ 决策模型（JEV）配置（用户 2026-10-07）：端点 / 凭据名 / 两条 jev 通路共用的模型名。
    //    ⚠️ **密钥不在这个白名单里** —— 它走凭据 seam（`/jev/key`），**不进 patch 文件**。
    | 'activeInjectJevEndpoint'
    | 'activeInjectJevApiKeyEnv'
    | 'jevModel'
    | 'activeInjectStrict'
    | 'activeInjectTopK'
    // ⭐⭐ 2026-09-29：`activeInjectBand` 拆成两个键（它原来一个键兼两个语义）。
    //    ⚠️ 旧键**仍在下面保留可写** —— 已有 patch 里可能写着它，删了会变未知键。
    | 'activeInjectNeedMin'
    | 'activeInjectItemMin'
    | 'activeInjectBand'
    | 'activeInjectTimeoutMs'
    | 'activeInjectContextRounds'
    | 'activeInjectPoolMax'
    | 'activeInjectExplain'
    | 'activeInjectSearchIntentGate'
    | 'activeInjectSearchIntentMin'
    | 'activeInjectSufficientGate'
    | 'activeInjectSufficientMin'
    // ⭐ 2026-09-27：改名 —— 旧语义"每 turn 最多调几次召回模型"
    //    ⇒ 新键 `activeInjectMaxInjectionsPerTurn`（每 turn 最多**注入**几次）。
    | 'activeInjectMaxInjectionsPerTurn'
    // ⚠️ 旧键**保留可写**：用户可能手工改过它；删掉会让已有配置变成"写了也不认"。
    //    解析侧按新键优先、旧键回落（见 `config.ts` 的 `maxInjectionsPerTurn`）。
    //    🔴 但**前端不再提交旧键**（面板只写新键）。
    | 'activeInjectMaxCallsPerTurn'
    | 'activeInjectReasoningMaxChars'
    // ⭐⭐⭐ 预算与拆批（用户 2026-09-26 定稿方案）
    | 'activeInjectBudget'
    | 'activeInjectBudgetTokens'
    | 'activeInjectContextTokens'
    | 'activeInjectConcurrency'
    | 'activeInjectChatWindowRatio'
    // ⚠️ 已作废（召回路径不再读它）—— 保留字段，避免已写进 patch 的值变成未知键
    | 'activeInjectPoolMin'
    // ⭐⭐ 召回日志的"请求快照"档（B 档；2026-09-27）—— 默认关，要复现问题时临时打开。
    | 'activeRecallLogRequest'
    // ⭐⭐⭐ 决策模型（2026-10-07 多 provider 化，用户要求）：provider 列表 + 两处选集。
    | 'decisionProviders'
    | 'activeInjectDecisionPick'
    | 'hotScoreDecisionPick',
  /**
   * 新值。
   * ⭐⭐ **2026-10-07 放宽到也收数组/对象**：`decisionProviders` 是
   *    `Array<{id, displayName, endpoint, models}>`（用户要求"多 provider"）。
   *    ⚠️ 放宽的只是**这个入口的类型**，**逐键校验仍在 `api.ts`**（那里才是契约）——
   *    别以为这里不校验就可以随便传。
   */
  value: string | number | boolean | unknown[] | Record<string, unknown>,
  entryId: string = DEFAULT_ENTRY_ID,
): Promise<SettingsWriteResult> {
  const dir = profileDirFrom(baseUrl)
  const patchPath = patchPathFrom(baseUrl)
  const reload = await readPatchReload(dir)
  const needsRestart = reload !== 'live'

  if (patchPath === '') {
    return {
      ok: false,
      message: '拿不到 profile 路径（ctx.baseUrl 不可用），未写入任何内容。',
      patchPath: '',
      needsRestart,
    }
  }

  let text = ''
  try {
    text = await readFile(patchPath, 'utf8')
  } catch (err) {
    if ((err as { code?: string }).code !== 'ENOENT') {
      return {
        ok: false,
        message: `读 ${PATCH_FILENAME} 失败：${err instanceof Error ? err.message : String(err)}`,
        patchPath,
        needsRestart,
      }
    }
    text = '' // 不存在 ⇒ 从零建
  }

  let next: string
  try {
    // ⚠️ 空文件/只有 `[]` 时要造一个**块风格**的空数组，否则写出来是
    //    `[ { id: memj, config: {...} } ]` **一整行**（flow 风格）——
    //    与 patch 文件里人手写的**块风格**（`- id: x` 分行）不一致、可读性差。
    // 🔴 **只在"文件不存在 / 为空 / 内容就是 `[]`"这条路径上出现**：
    //    往已有条目的文件里追加时，风格由既有文档决定。
    //    （这是测试【4】抓到的真实缺陷：`parseDocument('[]')` 给出的是
    //     **空的 flow 风格 YAMLSeq**，`!== null` ⇒ 早先的 `contents === null` 分支根本不进。）
    const isEmptyStart = text.trim() === '' || text.trim() === '[]'
    const doc = isEmptyStart ? parseDocument('') : parseDocument(text)
    if (doc.errors.length > 0) {
      return {
        ok: false,
        message:
          `未写入：${PATCH_FILENAME} 当前不是合法 YAML（${doc.errors[0]?.message ?? '未知错误'}）。\n` +
          '为避免破坏你的文件，本次改动已放弃——请先手工修好该文件。',
        patchPath,
        needsRestart,
      }
    }
    // ⚠️ `doc.contents` 可能是 `null`（空文档）⇒ 造一个**块风格**空数组节点，
    //    后续才有地方 `add`。类型上 `createNode` 与 `contents` 的声明不完全兼容
    //    （`Parsed` vs `ParsedNode` 的 `range`），故此处走 `unknown` 收口。
    if (doc.contents === null) {
      ;(doc as unknown as { contents: unknown }).contents = doc.createNode([], { flow: false })
    } else if (isEmptyStart) {
      // `[]` 解析出的 seq 是 **flow 风格** ⇒ 显式改回块风格（见上方说明）。
      const c = doc.contents as { flow?: boolean }
      if (c.flow === true) c.flow = false
    }

    let entry = findEntry(doc, entryId) as
      | { get: (k: string) => unknown; set: (k: string, v: unknown) => void }
      | undefined
    if (entry === undefined) {
      const created = doc.createNode({ id: entryId, config: {} }) as unknown as {
        get: (k: string) => unknown
        set: (k: string, v: unknown) => void
      }
      ;(doc.contents as { add: (n: unknown) => void }).add(created)
      entry = created
    }
    let cfg = entry.get('config') as { set: (k: string, v: unknown) => void } | null
    if (cfg === null || cfg === undefined) {
      entry.set('config', doc.createNode({}))
      cfg = entry.get('config') as { set: (k: string, v: unknown) => void }
    }
    cfg.set(key, value)
    next = doc.toString()
  } catch (err) {
    return {
      ok: false,
      message: `改写失败（未写入）：${err instanceof Error ? err.message : String(err)}`,
      patchPath,
      needsRestart,
    }
  }

  try {
    // ⚠️ **无 BOM**（`WriteAllText` 的 UTF-8 默认带 BOM，会被 `JSON.parse`/YAML 读成乱码——
    //    本工作区踩过：`Set-Content -Encoding utf8` 写的 package.json 直接解析失败）。
    const { writeFile } = await import('node:fs/promises')
    await writeFile(patchPath, next, { encoding: 'utf8' })
  } catch (err) {
    return {
      ok: false,
      message: `写 ${PATCH_FILENAME} 失败：${err instanceof Error ? err.message : String(err)}`,
      patchPath,
      needsRestart,
    }
  }

  return {
    ok: true,
    message: needsRestart
      ? `已写入 ${PATCH_FILENAME}。⚠️ 本 profile 的 patchReload 不是 live，**需要重启才生效**。`
      : `已写入 ${PATCH_FILENAME}，热重载会在数秒内生效。`,
    patchPath,
    needsRestart,
  }
}

/** 合法取值（供 API 层校验）。 */
export const THEME_CREATION_VALUES: readonly string[] = ['strict', 'loose']

/**
 * ⭐ `progressCharsWarn` 的合法区间（供 API 层校验）。
 *
 * ⚠️ 与 `config.ts` 里 schemastery 的 `min(1000).max(1000000)` **必须一致**——
 *    两处都是"能不能用"的边界，不一致会让"网页上存得进、插件启动却被拒"。
 */
export const PROGRESS_WARN_MIN = 1000
export const PROGRESS_WARN_MAX = 1000000

/**
 * ⭐⭐ 热知识的取值边界（供 API 层校验）。
 *
 * ⚠️ 与 `config.ts` 里 schemastery 的约束**必须一致**（同 `PROGRESS_WARN_*` 的理由）：
 * 不一致会让"网页上存得进、插件启动却被拒"。
 */
export const HOT_RATIO_MIN = 0
export const HOT_RATIO_MAX = 100
export const HOT_CHARS_PER_TOKEN_MIN = 0.1
export const HOT_CHARS_PER_TOKEN_MAX = 10
export const HOT_BUDGET_MIN = 1000
export const HOT_BUDGET_MAX = 10000000
export const HOT_FULL_WARN_MIN = 1
export const HOT_FULL_WARN_MAX = 1000000
export const HOT_SESSION_KEEP_MIN = 1
export const HOT_SESSION_KEEP_MAX = 10000

/**
 * ⭐⭐ 主动注入的取值边界（供 API 层校验；设计文档 §10.1）。
 *
 * ⚠️ 与 `config.ts` 里 schemastery 的约束**必须一致**（同 `PROGRESS_WARN_*` 的理由）：
 *    不一致会让"网页上存得进、插件启动却被拒"。
 */
export const ACTIVE_TOP_K_MIN = 1
export const ACTIVE_TOP_K_MAX = 50
export const ACTIVE_BAND_MIN = 0
export const ACTIVE_BAND_MAX = 1
export const ACTIVE_TIMEOUT_MIN = 500
export const ACTIVE_TIMEOUT_MAX = 120000
export const ACTIVE_CONTEXT_ROUNDS_MIN = 1
export const ACTIVE_CONTEXT_ROUNDS_MAX = 50
export const ACTIVE_POOL_MAX_MIN = 10
export const ACTIVE_POOL_MAX_MAX = 2000
export const ACTIVE_CALLS_PER_TURN_MIN = 0
export const ACTIVE_CALLS_PER_TURN_MAX = 50
export const ACTIVE_REASONING_MAX_CHARS_MIN = 100
export const ACTIVE_REASONING_MAX_CHARS_MAX = 100000

/** 主动注入的**通路**受控两值（§6.1）。 */
export const ACTIVE_CHANNEL_VALUES: readonly string[] = ['chat', 'jev']

/** 主动注入的**清单范围**受控三值（§6.0）。 */
export const ACTIVE_SCOPE_VALUES: readonly string[] = ['project', 'project+themes', 'all']
