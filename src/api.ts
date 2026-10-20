/**
 * 人侧 API 路由（`/plugins/dsh-memj/api/*`）。
 *
 * 🔴 **把人侧与 LLM 侧分开**（决策 42）：
 * 提名与断链是**给人看的状态信息**，只出现在这里与 `/memj-review` 命令，
 * **不进任何 LLM 工具的返回**。
 *
 * ⚠️ 路由**无内置鉴权**——插件注册的命名路由绕过静态兜底的一切检查。
 * 这不是配置问题而是架构如此；DSH 默认 bind `127.0.0.1`（仅本机），
 * 与 DSH 自身同级，故按默认配置无需额外处理。**只暴露必要的 API 路径**。
 *
 * @module dsh-memj/api
 */

import { entriesDir, libraryRoot, resolveRef } from './paths.ts'
import {
  appendLogFile,
  checkUpdate,
  startUpgrade,
  upgradeLogPath,
  upgradeStatus,
} from './upgrade.ts'
import { dirname, extname, isAbsolute, relative, resolve as resolvePath, sep } from 'node:path'
import { stat, readFile } from 'node:fs/promises'
// ⭐⭐⭐ 提示词覆盖（本次新增）：清单 / 详情 / 保存 / 恢复 / 历史。
import {
  PROMPT_SPECS,
  hasOverride,
  listPromptHistory,
  overrideUpdatedAt,
  promptCurrent,
  promptDefault,
  readPromptHistory,
  resetPromptOverride,
  restorePromptHistory,
  savePromptOverride,
  specOf,
} from './prompts.ts'
// ⭐⭐ 分组说明（页面用）——人读文案的唯一出处，见那个模块的头注释。
import { PROMPT_GROUPS, catalogOf } from './prompt-catalog.ts'
// ⭐⭐⭐ 写回源码（2026-10-12 新增）——注意它在**单独模块**里，不在 `prompts.ts`
//    （那个模块要 import `paths.ts` 的 `pluginRoot()`，而 `prompts.ts` 是叶子模块、
//      不 import 任何提示词源模块 ⇒ 放进去会破坏那条依赖纪律）。
import { writeBackToSource, writeBackState } from './prompt-writeback.ts'
import { promptOverridesPath } from './paths.ts'
// ⭐ 决策 204：模板 CRUD（人侧管理页的数据源）。
import {
  deleteTemplate,
  listTemplates,
  normalizeTemplate,
  saveTemplate,
  templateWarnings,
  validateTemplate,
  type Template,
} from './templates.ts'
import { templatesDir } from './paths.ts'
// ⭐⭐⭐ 「文档内提问」（2026-10-14）：`/reading/ask` 的入口与依赖类型。
//    ⚠️ **必须静态 import**（与 `api.ts` 其余模块同规）：动态 import 会被打包器
//       拆出带哈希的 chunk，而"动态 import 的哈希 chunk"正是让运行中的实例
//       API 全部 500 的已知坑（memj 库条目 `c9bcc110`）。
import { askAboutSelection, type AskDeps } from './reading-ask.ts'
// ⭐ 段落 ⇄ 会话绑定（阅读页画段落标记的数据源）+ 服务端算好的块清单。
import { bindingsForEntry, extractReadingBlocks, findBindingByChatEntry } from './reading.ts'
import { fileExistsStat, readTextIfExists } from './files.ts'
import {
  fixCoverBlock,
  fixExternalRef,
  loadEntryDoc,
  loadProjectDoc,
  loadThemeFrontmatter,
  readNominations,
  rebuildDerivedLayers,
  scanLibrary,
  approveNomination,
  rejectNomination,
  writeNominations,
  // ⭐⭐ 决策 220：项目详情页的「各节规范块」（读侧）。
  sectionSpecsOf,
} from './store.ts'
import { themeDocPath } from './paths.ts'
import { isAbsolutePath, parseCovers } from './parse.ts'
import { isEntryKind, setCurrentKindDefs } from './schema.ts'
// ⭐⭐⭐ 决策 215：知识类型（`kind`）的**可配置词表**。
//    🔴 决策 217 起**渲染一律读 `schema.ts` 的进程内当前值**（同步），
//       所以这里不再需要 `kindIdsOf` 那类"传表进来"的助手（已删）。
import {
  deleteKindBlockReason,
  loadKinds,
  saveKinds,
  type KindDef,
} from './kinds.ts'
// ⭐⭐ 英文召回索引的「检查并补全」（判据与启动兜底**同源**，见 `en-index.ts`）。
// ⭐⭐⭐ `pairingError` 是「模板 ↔ 模型」配对规则的**唯一出处**（用户 2026-10-07 要求）。
import { checkAndRepair, pairingError } from './en-index.ts'
// ⭐⭐ 封面删改通道的**唯一实现**（决策 114）——人侧与 LLM 侧共用。
import {
  archiveEntry,
  archiveProject,
  deleteEntry,
  deleteProject,
  deleteTheme,
  editEntryThemes,
  moveEntry,
  renameProject,
  renameTheme,
  setEntryFields,
  setEntryGlobal,
  setProjectDesc,
  setProjectFields,
  setSectionSpec,
  setThemeDesc,
  setThemeFields,
  unarchiveEntry,
  unarchiveProject,
} from './edit.ts'
import type { Cover } from './schema.ts'
import type { MemjConfig } from './config.ts'
// ⭐⭐⭐ `effectiveConfig`：**回显必须"磁盘优先"**——`writeSetting` 只改文件、
//    不回头更新进程内配置，否则面板会出现"存完弹回旧值"（甚至把旧值写回去）。
//    ⚠️ **每处读设置的地方都要用它**（本项目同族事故：只改一半 ⇒ 别处照旧弹回）。
import {
  PROGRESS_WARN_MAX, PROGRESS_WARN_MIN, THEME_CREATION_VALUES,
  effectiveConfig, readSettings, writeSetting,
} from './settings.ts'
// ⭐⭐ 热知识取值边界（热知识方案 §10）——与 `config.ts` 的 schemastery 约束**必须一致**。
import {
  HOT_BUDGET_MAX, HOT_BUDGET_MIN,
  HOT_CHARS_PER_TOKEN_MAX, HOT_CHARS_PER_TOKEN_MIN,
  HOT_FULL_WARN_MAX, HOT_FULL_WARN_MIN,
  HOT_RATIO_MAX, HOT_RATIO_MIN,
  HOT_SESSION_KEEP_MAX, HOT_SESSION_KEEP_MIN,
} from './settings.ts'
// ⭐⭐ 主动注入取值边界（设计文档 §10.1）——与 `config.ts` 的 schemastery 约束**必须一致**。
import {
  ACTIVE_BAND_MAX, ACTIVE_BAND_MIN,
  ACTIVE_CALLS_PER_TURN_MAX, ACTIVE_CALLS_PER_TURN_MIN,
  ACTIVE_CHANNEL_VALUES,
  ACTIVE_CONTEXT_ROUNDS_MAX, ACTIVE_CONTEXT_ROUNDS_MIN,
  ACTIVE_POOL_MAX_MAX, ACTIVE_POOL_MAX_MIN,
  ACTIVE_REASONING_MAX_CHARS_MAX, ACTIVE_REASONING_MAX_CHARS_MIN,
  ACTIVE_SCOPE_VALUES,
  ACTIVE_TIMEOUT_MAX, ACTIVE_TIMEOUT_MIN,
  ACTIVE_TOP_K_MAX, ACTIVE_TOP_K_MIN,
} from './settings.ts'
// ⭐ "每 turn 最多注入几次"的**唯一判据**（新键优先、旧键回落）——别在别处再写 `?? 3`。
// ⭐⭐⭐ 决策模型（2026-10-07 多 provider 化）：`decisionProvidersOf` 与两个 `*DecisionOf`
//    是**唯一**解析入口（端点 / 模型 / 派生凭据名三者必须同源）。
import {
  activeDecisionOf, decisionProvidersOf, deriveDecisionKeyRef,
  itemMinOf, maxInjectionsPerTurn, needMinOf, scoreDecisionOf,
} from './config.ts'
import { ensureRepo, lastCommit, probeGit, readRepoState, commitAll } from './git.ts'
import { narrativeFromProjectText } from './parse.ts'
import { writeNarrativeMirror } from './narrative.ts'
// ⭐⭐ 热知识（热知识方案 §8.4）：数据层 + 实时预览。
import {
  defaultEntrySetting,
  loadEntrySettings,
  loadPersona,
  loadSelections,
  loadSessionsFile,
  newPersonaId,
  pruneSessions,
  saveEntrySettings,
  savePersona,
  saveSelections,
  saveSessionsFile,
} from './hot.ts'
import { previewForSession, hotState, resolveProject } from './hot-watch.ts'
import { loadEnIndex } from './en-index.ts'
// ⭐⭐ 主动注入的实时状态（设计文档 §10.4）。
import { activeInjectionsUsed, activeSnapshot, injectTotalsOf, lastInjectionOf } from './active-inject.ts'
// ⭐ chat 通路的最近一次调用诊断（排障：只回 reasoning、拿不到 llm 服务…）。
// ⭐⭐ `resolveJevKey`：「决策模型配置」页的"测试连接"要与真实召回**同源**取密钥。
import { lastChatDiagnostic, resolveJevKey } from './active-recall.ts'
import { HOT_PROJECT_UNKNOWN } from './schema.ts'
import type { HotProjectEntry } from './schema.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** API 依赖。 */
export interface ApiDeps {
  version: string
  /** ⭐ 当前生效的配置（供设置接口读写，决策 97）。 */
  config: MemjConfig
  /**
   * ⭐ `ctx.baseUrl`——**恒等于当前 profile 目录**（`dsh-app-boot` 的 `boot()` 推出）。
   * 设置面板靠它定位 `cordis.patch.yml`（见 `settings.ts` 文件头）。
   */
  baseUrl: unknown
  /** 当前插件的 **entry id**（写 `--dump-config` / patch 定位用）。 */
  pluginId: string
  /**
   * ⭐⭐ **服务查询适配器**（2026-09-22 新增）——只为 `get-handoff` 那条判定判据服务。
   *
   * 🔴 **为什么不是整个 `ctx`**：`handleApi` 是**纯函数**（测试直接调它、不必装配 cordis），
   *    而 `ApiDeps` 一直是"四个字段的窄投影"。塞整个 `ctx` 会让那条边界消失。
   * ⇒ ⭐ **只要一个 `get(name)`**（`detectProjectByGetHandoff` 也只需要它）。
   * ⚠️ **可选**：拿不到时那条判据**自动降级为"判不出"**（其余判据不受影响）。
   */
  getService?: (name: string) => unknown
  /**
   * ⭐⭐ **「文档内提问」的依赖**（2026-10-14 新增，**可选**）。
   *
   * 🔴 **为什么不走 `getService('agents')`**：`ApiDeps` 一直是"窄投影"，
   *    而 `reading/ask` 需要的是**装配好的 `AskDeps`**（含 `ctx`）——
   *    那要在 `apply()` 里用真的 `ctx` 才能建（`createReadingSession` 要
   *    `workspaceRegistry` / `agents` / `agentPresets` / `agentDefaultModel`
   *    四样服务）。⇒ 由 `apply()` 装配好塞进来，`handleApi` 只负责调。
   * ⚠️ **可选**：没装配（测试里常常如此）⇒ `/reading/ask` 回 500 并说清原因，
   *    而**不影响其他路由**。
   */
  readingAsk?: AskDeps
}

/** 一次 API 结果。 */
export interface ApiResult {
  status: number
  body: unknown
  /**
   * ⭐⭐ **按字节回的响应**（2026-10-19 新增，`/asset` 用）——给了就**跳过 JSON 序列化**。
   *
   * 🔴 **为什么必须加这条路**：图片是二进制，`JSON.stringify(Buffer)` 会把它变成
   *    `{"type":"Buffer","data":[…]}` 这种 JSON ⇒ 浏览器拿到的是"看起来像图片的文本"。
   *    ⚠️ 而且这个失败**很隐蔽**：HTTP 200、Content-Type 也改对了，
   *    只有图片**打不开**（和"路由没注册、返回 HTML"是两种不同的裂法）。
   * ⚠️ `contentType` 必填（`res.writeHead` 需要）；`body` 字段此时**不再使用**。
   */
  raw?: { contentType: string; bytes: Uint8Array; cacheControl?: string }
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐⭐ **决策模型（JEV）配置**的四块地基（用户 2026-10-07 要求）
//
// 🔴🔴 **三条贯穿始终的铁律**（本项目的既有教训，这里逐条兑现）：
//   ① **绝不回显密钥**：读半边只走 `describe`（`CredentialInfo` 类型里**没有**
//      放值的槽位）—— 本项目已发生过密钥明文外泄；
//   ② **不 import `dsh-credentials`**：它**不在**本插件的 peerDependencies 里
//      （未声明的包会让解析到另一份副本 ⇒ 同族坑）。⇒ 只用**结构化类型**
//      调用它的方法（和 `resolveJevKey` 的做法一致）；
//   ③ **写失败要说清是哪一类**：`set` 会因"只读来源遮蔽"而**拒绝**
//      （那时写了也白写 —— 解析仍返回被遮蔽的那个值）⇒ 必须如实转达，
//      否则用户会以为存进去了（典型静默失败）。
// ══════════════════════════════════════════════════════════════════════════

/** 凭据服务的**窄结构**（只声明我们用到的四个方法；见铁律②）。 */
interface CredentialSvc {
  resolve?: (ref: unknown) => Promise<{ value?: unknown } | undefined>
  describe?: (ref: unknown) => Promise<{ configured?: boolean; source?: string; writable?: boolean } | undefined>
  set?: (ref: unknown, value: string) => Promise<void>
  unset?: (ref: unknown) => Promise<void>
}

/** 取凭据服务（拿不到 ⇒ `undefined`，调用方各自降级）。 */
function credentialSvc(deps: ApiDeps): CredentialSvc | undefined {
  return deps.getService?.('credentials') as CredentialSvc | undefined
}

/**
 * ⭐ **描述一条凭据引用**（**只回事实、永不回值**）。
 *
 * ⚠️ 拿不到 `describe`（旧运行时 / 服务缺失）⇒ 回 `undefined`，
 *    由调用方**降级**（例如只报"有没有值"，不报"能不能写"）——
 *    **不要**在这里瞎猜一个 `writable: true`（那会让界面显示一个存不进去的输入框）。
 */
async function describeCredential(
  deps: ApiDeps,
  name: string,
): Promise<{ configured: boolean; source: string; writable: boolean } | undefined> {
  if (name === '') return undefined
  try {
    const got = await credentialSvc(deps)?.describe?.(name)
    if (got === undefined) return undefined
    return {
      configured: got.configured === true,
      source: typeof got.source === 'string' ? got.source : '',
      writable: got.writable === true,
    }
  } catch {
    return undefined
  }
}

/**
 * ⭐⭐ **把密钥存进凭据 seam**（`set`：只写、不落 patch、不回显）。
 *
 * 🔴 **失败必须如实说**：`set` 在"只读来源遮蔽"时会**拒绝** ——
 *    那种情况下**不能**报成功（写了也白写：解析仍返回被遮蔽的那个值）。
 *    ⭐ 判据（本项目既有教训）：**"开关在说谎"比"操作失败"更糟** ——
 *    失败就说失败，并把下一步指出来。
 * @returns `{ok, message}`；`ok=false` 时 `message` 是**给人看的**原因。
 */
async function setCredential(
  deps: ApiDeps,
  name: string,
  value: string,
): Promise<{ ok: boolean; message: string }> {
  const svc = credentialSvc(deps)
  if (typeof svc?.set !== 'function') {
    return {
      ok: false,
      message: '当前运行时不提供凭据写入（拿不到 credentials.set）。'
        + '可以改用环境变量注入该密钥，或用 profile 的凭据文件。',
    }
  }
  try {
    await svc.set(name, value)
    return { ok: true, message: 'ok' }
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    // ⭐ 遮蔽是最常见的一种：把它**单独说清**（否则用户会反复重试同一个动作）。
    const shadowed = /shadow|read-only|readonly/i.test(m)
    return {
      ok: false,
      message: shadowed
        ? `未能保存：凭据「${name}」当前被一个**只读来源**（如环境变量）遮住，`
          + `写进去也不会生效。请先移除那个来源，再在这里保存。`
        : `未能保存密钥：${m}`,
    }
  }
}

/** ⭐ **清除凭据**（`unset`；引用缺失时是 no-op）。 */
async function unsetCredential(
  deps: ApiDeps,
  name: string,
): Promise<{ ok: boolean; message: string }> {
  const svc = credentialSvc(deps)
  if (typeof svc?.unset !== 'function') {
    return { ok: false, message: '当前运行时不提供凭据清除（拿不到 credentials.unset）。' }
  }
  try {
    await svc.unset(name)
    return { ok: true, message: 'ok' }
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    const shadowed = /shadow|read-only|readonly/i.test(m)
    return {
      ok: false,
      message: shadowed
        ? `未能清除：凭据「${name}」被一个只读来源遮住，清除它不会改变解析结果。`
        : `未能清除密钥：${m}`,
    }
  }
}

/**
 * ⭐⭐⭐ **测试 JEV 连接** —— 真发**一次**最小请求，回状态与耗时。
 *
 * 🔴 **为什么值得单独做**：`/jev-status` 只查"凭据**存不存在**"，
 *    **不发请求** ⇒ "配了密钥"与"真能调通"是两件事（端点写错、密钥失效、
 *    网关不通都过不了）。本项目一贯判据：**"配置读到了"不等于"功能能工作"**。
 *
 * ⚠️ 与真实召回**同源**：复用 `resolveJevKey` 取密钥、同一套请求体形态
 *    （`{model, state, questions}` + 一个 `noul` 问题），只是**候选只有 1 条**。
 * ⚠️ **超时短**（15 秒）：这是"点一下看看通不通"，不是真实召回
 *    （真实召回有自己的 `activeInjectTimeoutMs`）。
 * 🔴 **绝不回密钥**；失败时回**能指引下一步**的文案（本项目"报错要能直接指引到修法"）。
 */
async function testJevConnection(
  deps: ApiDeps,
  providerId: string,
  modelName: string,
): Promise<{
  ok: boolean
  message: string
  ms?: number
  model?: string
  provider?: string
  endpoint?: string
  /** 上游自报的模型版本（如 `jev-1.13.0`）—— 有它才好确认"真到了网关"。 */
  upstream?: string | undefined
  /** 拿到 noul 才算真通（只有 HTTP 200 不够：可能回了个空壳）。 */
  noul?: number
}> {
  // ⭐⭐ 按 **provider id** 找出这一条（端点与派生凭据名都从它来）。
  const providers = decisionProvidersOf(deps.config)
  const prov = providers.find((p) => p.id === providerId)
  if (prov === undefined) {
    return { ok: false, message: `找不到 provider「${providerId}」—— 请先在列表里加一个，或换一个测试。` }
  }
  const endpoint = prov.endpoint
  // ⚠️ 模型：调用方指定则用它，否则用该 provider 的第一个（都空则报错）。
  const model = (modelName.trim() !== '' ? modelName.trim() : (prov.models[0] ?? ''))
  // ⭐ **凭据名按官方规则派生**（`<ID>_API_KEY`）—— 不问用户，也就不会写错。
  const keyRef = deriveDecisionKeyRef(prov.id)
  const key = await resolveJevKey(
    { get: (n: string) => deps.getService?.(n) } as never,
    deps.config,
    keyRef,
  )
  if (key === undefined) {
    return {
      ok: false,
      provider: prov.id,
      endpoint,
      model,
      message: `没有可用密钥（凭据「${keyRef}」与环境变量均为空）。请先在下面保存该 provider 的密钥。`,
    }
  }
  if (endpoint.trim() === '') {
    return { ok: false, provider: prov.id, message: '该 provider 的端点为空 —— 请填一个。' }
  }
  if (model.trim() === '') {
    return { ok: false, provider: prov.id, endpoint, message: '该 provider 下还没有模型 —— 请先加一个模型名。' }
  }
  const t0 = Date.now()
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        state: { probe: 'connectivity test from the memj settings page' },
        questions: { q0: { type: 'noul', instructions: 'Is this a connectivity test?' } },
      }),
      signal: AbortSignal.timeout(15000),
    })
    const ms = Date.now() - t0
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        ms,
        model,
        provider: prov.id,
        endpoint,
        message: `provider「${prov.id}」回了 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`
          + '。401/403 ⇒ 密钥无效；404 ⇒ 端点路径不对（要 /v1/systemone）。',
      }
    }
    const body = (await res.json().catch(() => ({}))) as {
      model?: string
      answers?: Record<string, { noul?: unknown }>
    }
    const noul = body.answers?.['q0']?.noul
    const num = typeof noul === 'number' ? noul : undefined
    if (num === undefined) {
      // ⭐ 200 但没拿到 noul ⇒ **不算通**（"响应了"与"答对了形态"是两件事）。
      return {
        ok: false,
        ms,
        model,
        provider: prov.id,
        endpoint,
        upstream: typeof body.model === 'string' ? body.model : undefined,
        message: `端点通了（HTTP 200）但响应里没有 noul —— 形态不对。`
          + `确认这真的是 TypeSafe 的 /v1/systemone 端点。`,
      }
    }
    return {
      ok: true,
      ms,
      model,
      provider: prov.id,
      endpoint,
      upstream: typeof body.model === 'string' ? body.model : undefined,
      noul: num,
      message: `连接正常（${prov.id}／${model}，${ms}ms，上游 ${body.model ?? model}，noul=${num}）。`,
    }
  } catch (err) {
    const ms = Date.now() - t0
    const m = err instanceof Error ? err.message : String(err)
    // ⭐ 超时与网络失败**要分开说**（下一步动作不同）。
    const timeout = /timeout|abort/i.test(m)
    return {
      ok: false,
      ms,
      model,
      provider: prov.id,
      endpoint,
      message: timeout
        ? `超时（15 秒未响应）。检查端点是否可达、或换个网络环境。`
        : `请求失败：${m}。`,
    }
  }
}

/**
 * ⭐⭐ **取一条提示词的详情**（【提示词】页的编辑框要它）。
 *
 * 同时给**当前生效文本**与**源码默认文本** —— 这样界面上能直接看出"改了什么"，
 * 而不是让用户凭记忆比对。
 * @param key - 稳定键。
 * @returns 详情（当前 / 默认 / 是否被覆盖 / 版本时间 / 历史文件列表）。
 */
async function readPromptDetail(key: string): Promise<{
  current: string
  defaultText: string
  overridden: boolean
  updatedAt: string
  history: string[]
}> {
  const def = promptDefault(key) ?? ''
  const overridden = hasOverride(key)
  const history = await listPromptHistory(key)
  return {
    current: promptCurrent(key),
    defaultText: def,
    overridden,
    // ⭐ **如实给时间**（第一版这里硬写了 `''` = 界面在撒谎：明明有值却说没有）。
    updatedAt: overrideUpdatedAt(key),
    history,
  }
}

/**
 * 列出封面 + 断链检查。
 *
 * **断链**＝`ext: true` 但目标文件已不存在（§11.6：只报告，**不自动修复**）。
 * @param opts - `includeArchived` = true 时**连归档封面一起列**（决策 133）。
 *   ⚠️ 默认 false ⇒ 活跃列表（知识库页）**天然不含归档**，不用调用方自己过滤。
 * @param opts - ⭐⭐ `includeHistory`（决策 137）：**Web 侧要含 history**。
 *
 *   🔴🔴 **为什么 Web 侧要含、而 LLM 工具侧不含**（这是本机制最容易搞错的一点）：
 *   「历史归档」条目是**给人看的兜底**（「历史进展」小节里的指针点进来要能打开），
 *   ⚠️ 但**不能污染模型的检索**（`memj_search` 捞回一堆"某月某日的进度流水"是无用的）。
 *   ⇒ ⭐ **同一个 `scanLibrary()`，两侧传不同的开关**：
 *     · **模型侧**（`memj_search` / `memj_info` / `memj_rebuild` 的计数）⇒ **不含**；
 *     · **人侧**（`/covers` / `/entry` / 详情页）⇒ **含**。
 * @returns 封面清单与断链项。
 */
async function listCoversWithLinkCheck(
  opts: { includeArchived?: boolean; includeHistory?: boolean; onlyArchived?: boolean } = {},
): Promise<{
  covers: unknown[]
  brokenLinks: Array<{ id: string; ref: string; project: string; sourceFile: string; line: number }>
  invalid: unknown[]
}> {
  const snapshot = await scanLibrary({
    ...(opts.includeArchived === true ? { includeArchived: true } : {}),
    ...(opts.includeHistory === true ? { includeHistory: true } : {}),
  })
  const covers: unknown[] = []
  const brokenLinks: Array<{ id: string; ref: string; project: string; sourceFile: string; line: number }> = []

  for (const { cover, sourceFile, line } of snapshot.covers) {
    // ⭐⭐ **预筛：只要归档条目时，先按封面字段跳过活跃的**（2026-09-30，为性能）。
    //
    // 🔴 **为什么这很重要**：`/archived` **只要 5 条归档**，却在旧写法里调
    //    `listCoversWithLinkCheck({ includeArchived: true })` ⇒ **对全部 414 条**
    //    各做一次存在性检查，**然后才筛出归档** ⇒ 白付 409 次文件检查；
    //    更糟的是它与 `/covers` **同时**做同一批检查、互相争抢
    //    （实测：两个接口都被拖到 ~1.48s，而扫描共享后只要 ~200ms）。
    // ⭐ **归档判据就在封面上**（`cover.archivedAt`）—— **不碰文件就能筛** ⇒
    //    这一步是纯内存的，零 IO。
    // ⚠️ `invalid`（= `snapshot.issues`）**不受本预筛影响**：它在循环之外取，
    //    仍是**全量**硬校验问题（决策 133 的口径不变）。
    if (opts.onlyArchived === true && (cover.archivedAt ?? '') === '') continue
    const abs = resolveRef(cover.ref, cover.ext)
    // ⭐⭐ **只 `stat` 判存在**（2026-09-30，为性能）：原来这里**无条件**调 `loadEntryDoc`
    //    ⇒ 414 张封面各读一次**全文** + 解析 frontmatter（实测约占 `/covers` 的 700/1000ms）。
    //    🔴 而正文**只在"需要回退值"时**才真的用得上 —— 见下面的 `needFallback`。
    const exists = abs === undefined ? false : await fileExistsStat(abs)
    // 🔴 回退值只有三处用途：标题为空、或两个时间缺任一 ⇒ 才值得为它读全文。
    //    ⚠️ 本判据必须与下面 `covers.push` 里的**取用方式严格对齐**，否则会静默少读/多读。
    const needFallback =
      exists &&
      (cover.title.trim() === '' || (cover.updatedAt ?? '') === '' || (cover.createdAt ?? '') === '')
    const doc = needFallback ? await loadEntryDoc(cover.ref, cover.ext) : undefined
    if (!exists && cover.ext) {
      brokenLinks.push({ id: cover.id, ref: cover.ref, project: cover.project, sourceFile, line })
    }
    covers.push({
      id: cover.id,
      project: cover.project,
      theme: cover.theme,
      global: cover.global,
      // ⭐ 形态分类（决策 81）；空串 = 未分类。
      kind: cover.kind,
      tags: cover.tags,
      desc: cover.desc,
      ref: cover.ref,
      ext: cover.ext,
      // ⭐ 标题优先取封面（决策 98）；`doc?.title` 已含"frontmatter → 正文回退"。
      title: cover.title.trim() !== '' ? cover.title : (doc?.title ?? ''),
      // ⚠️ 判据从 `doc === undefined` 改成 `!exists`（只 stat，2026-09-30）——
      //    语义差别仅在"文件在、但读不动"这个边界（旧：算缺；新：算在）。
      missing: !exists,
      // ⭐ 时间（决策 119 / 123）：列表要**按更新时间倒序**、并显示小字时间。
      // 🔴🔴 **必须"封面优先"**（决策 139 修）：
      //    原来只从**正文文档的 frontmatter** 取 ⇒ **外链条目的时间恒为空**
      //    （`ext` 的文件不是 memj 生成的、根本没有 frontmatter）
      //    ⇒ 后果：外链在列表里**不显示更新时间、且排序永远排到最后**。
      //    ⚠️ 这与 `archivedAt` 那条是**同一个坑**（它旁边就写着"必须从 cover 取"）——
      //      当时只修了归档，漏了这两个时间字段。
      //    ⭐ 而**封面上本来就有这两个值**（决策 119 起），前端详情页**也早就是"封面优先"**了
      //      （`app.js`：`c.createdAt ?? data.frontmatter?.createdAt`）⇒ 只有本列表接口没跟上。
      //    ⚠️ 回退顺序：封面优先，回退正文 frontmatter（内链两者同值，外链只有封面有）。
      updatedAt: cover.updatedAt ?? doc?.frontmatter.updatedAt ?? '',
      createdAt: cover.createdAt ?? doc?.frontmatter.createdAt ?? '',
      /**
       * ⭐ **归档时间**（决策 133）——空串 = 活跃。
       *
       * 🔴 **`archivedAt` 必须从 `cover` 取，不能从正文 frontmatter 取**：
       *    上面两行取正文是历史原因（决策 119/123），而归档是**纯封面层**的动作；
       *    外链条目根本没有正文（`doc === undefined`）⇒ 从正文取会让外链的归档时间恒为空。
       */
      archivedAt: cover.archivedAt ?? '',
      /**
       * ⭐⭐ **溯源**（2026-10-14「文档内提问」透出到前端）。
       *
       * 🔴 **为什么必须在这里透出**：`chat` 条目详情页要有一个「去会话」按钮，
       *    而它靠的正是封面上的 `source.sessionId` —— 这个字段**早就在库里**
       *    （`schema.ts` 的 `EntryFrontmatter.source`、`writeEntryDoc` 会写），
       *    但**从来没有任何读取方** ⇒ 前端拿不到，按钮就无从做起。
       *
       * ⚠️ **只透 `sessionId`，不透 `from`**：`from` 是内部标记
       *    （`'reading-ask'` / `'history-archive'` 之类），对用户没有意义，
       *    透出去只会让 DTO 变胖。
       * ⚠️ **外链条目的 `source` 恒为空**（ext 文件没有 frontmatter）
       *    ⇒ 前端必须做空值处理（没有就不渲染那个按钮）。
       */
      source: cover.source?.sessionId !== undefined ? { sessionId: cover.source.sessionId } : {},
      // ⭐ 块位置：断链的「重新填路径」要靠它定位到具体那一块（§8.5 / §8.6）。
      sourceFile,
      line,
    })
  }
  return { covers, brokenLinks, invalid: snapshot.issues }
}

/**
 * 处理一次 API 请求。
 *
 * ⚠️ **`webServer` 本身不区分 HTTP 方法**——方法判断在这里自己做。
 * @param deps - 依赖。
 * @param method - HTTP 方法（已大写）。
 * @param pathname - 路径。
 * @param rawBody - 请求体原文。
 * @param params - 查询参数。
 * @returns 状态码与响应体。
 */
/**
 * ⭐ **类型表的响应体**（`/kinds`、`/kind/save`、`/kind/delete` 三处共用）。
 *
 * ⚠️ **`count` 必须带 `includeHistory: true`** —— `scanLibrary` 默认**排除** history，
 *    不显式带上它 ⇒ 那一项**恒显示 0**（界面撒谎，本项目已记过这类账）。
 * @returns 可直接塞进响应体的对象。
 */
async function kindsPayload(): Promise<{ items: unknown[]; selectable: string[] }> {
  const defs = await loadKinds()
  const scanned = await scanLibrary({ includeHistory: true })
  const counts = new Map<string, number>()
  for (const c of scanned.covers) {
    const k = c.cover.kind
    if (k !== '') counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return {
    items: defs.map((d) => ({
      id: d.id,
      label: d.label,
      when: d.when,
      guide: d.guide,
      /** 🔴 内置：设置页里**只读**（不可删、id 与显示名都锁）。 */
      builtin: d.builtin,
      /** 🔴 保留项（`history`）：不给模型选，UI 里也标出来。 */
      reserved: d.reserved,
      /** 当前库里有多少条用了它（UI 显示 + 删除保护判据）。 */
      count: counts.get(d.id) ?? 0,
    })),
    selectable: defs.filter((d) => !d.reserved).map((d) => d.id),
  }
}

/**
 * ⭐ **规整【一条】类型定义**（`/kind/upsert` 用）。
 *
 * 🔴 **为什么不直接写 `normalizeKindDefs([item])?.[0]`**：
 *    `item === undefined` 时那样会得到 `[undefined]` ⇒ 里面判非对象 ⇒ 返回 `undefined`，
 *    **结果碰巧对**，但**意图含混**（"一个不存在的元素" vs "没有 item"）。
 *    ⭐ 判据：**形状判定要一眼看出它判的是哪一种**，别靠"恰好也返回 undefined"。
 * @param raw - 请求体里的 `item`。
 * @returns 规整后的单条；形状不对返回 `undefined`。
 */
function normalizeOneKindDef(raw: unknown): KindDef | undefined {
  if (raw === undefined || raw === null) return undefined
  return normalizeKindDefs([raw])?.[0]
}

/**
 * ⭐ **把请求体里的 `items` 规整成 `KindDef[]`**（形状不对 ⇒ `undefined`）。
 *
 * ⚠️ **宽容读、严格校验**：这里只保证"形状像"，**业务规则**（内置不可删改、
 *    id 语法、`when` 非空…）交给 `validateKinds()` —— 一份规则只有一个出处。
 * @param raw - 请求体里的 `items`。
 * @returns 规整后的表；形状不对返回 `undefined`。
 */
function normalizeKindDefs(raw: unknown): KindDef[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: KindDef[] = []
  for (const it of raw) {
    if (typeof it !== "object" || it === null) return undefined
    const o = it as Record<string, unknown>
    if (typeof o["id"] !== "string") return undefined
    out.push({
      id: o["id"].trim(),
      label: typeof o["label"] === "string" ? o["label"] : "",
      when: typeof o["when"] === "string" ? o["when"] : "",
      guide: typeof o["guide"] === "string" ? o["guide"] : "",
      builtin: o["builtin"] === true,
      reserved: o["reserved"] === true,
    })
  }
  return out
}

/**
 * ⭐⭐ **条目的「图片基准目录」**（2026-10-19 新增）——`/asset` 与 `/entry` 共用这一份判据。
 *
 * ── 要解决什么 ───────────────────────────────────────────────────────────
 * 知识正文里的 `![](docs/screenshots/x.png)` 是**相对路径**，而浏览器解析它时
 * 用的基准是 **memj 页面自己**（`/plugins/dsh-memj/`）⇒ 与文档在磁盘上的位置无关
 * ⇒ **所有相对图必然 404**（实测：库内 789 条 + 28 份项目文档正文里没有图片，
 *   但 ext 外链的 README 有 15 张、大模型大师课有 5 张）。
 *
 * ── 基准怎么算（**必须与写入侧同源**）──────────────────────────────────
 * | 条目类型 | 正文文件在哪 | 基准目录 |
 * |---|---|---|
 * | **内部条目**（`ext: false`） | 库根 + `ref` | `ref` 所在目录（通常 `entries/`） |
 * | **外部引用**（`ext: true`） | `ref` 本身就是绝对路径 | **它所在的目录** |
 *
 * ⭐ 两种情况其实是**同一个式子**：`dirname(正文文件绝对路径)`。
 *   ⇒ 抽成一个函数，`/asset`（读图）与 `/entry`（回 `assetBase`）都调它 ——
 *   **同一条判据只有一个出处**（本项目吃过"两份判据必然漂移"的亏）。
 *
 * @param ref - 封面上的 `ref`。
 * @param ext - 是否为外部引用。
 * @returns 基准目录的绝对路径；`ref` 解析不出来时 `undefined`。
 */
export function assetBaseDirOf(ref: string, ext: boolean): string | undefined {
  const abs = resolveRef(ref, ext)
  if (abs === undefined || abs === '') return undefined
  return dirname(resolvePath(abs))
}

/**
 * 🔴🔴 **允许当作图片读回来的扩展名白名单**（用户 2026-10-19 裁定）。
 *
 * ⭐ **为什么是白名单而不是黑名单**：这个接口会**读磁盘上的真实文件**。
 *   黑名单式的"排除 .js/.html"永远漏（`.mjs`、`.cjs`、`.map`、将来别的新扩展名）
 *   ⇒ 一个越界漏洞就被放过去了。白名单的失败方向是**安全**的：
 *   新扩展名**读不出来**，而不是"读出了不该读的东西"。
 * ⚠️ 刻意**不含 `.svg`**：SVG 里可以内嵌 `<script>`，用 `<img>` 引用虽不执行脚本，
 *   但同源直接打开该 URL 就会执行 ⇒ 留一个本机 XSS 面，不值得。
 *   本项目自己的图标是内联在 `index.html` 里的，不走这条路。
 */
const ASSET_EXT_ALLOW: ReadonlySet<string> = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.ico',
])

/** 扩展名 → MIME。⚠️ 只覆盖白名单里那些（其余根本进不来，见上）。 */
const ASSET_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
}

/** 单张图片的大小上限（与 `index.ts` 的 `MAX_STATIC_BYTES` 同值，免得两处不一致）。 */
const MAX_ASSET_BYTES = 4 * 1024 * 1024

/**
 * ⭐⭐⭐ **把「相对图片路径」解析成一个绝对文件路径，并验明它**不会越界**。
 *
 * 🔴🔴 **四条安全约束（缺一条这个接口就成了任意文件读取）**：
 *  ① `rel` 必须是**相对路径**（绝对路径、带盘符、`file:` 一律拒）；
 *  ② `..` 段一律拒（**先按路径段判，不靠字符串前缀**）——
 *     注意解码时机：调用方传进来的应是**已 `decodeURIComponent` 的原文**；
 *  ③ `resolve` 之后再用 `path.relative` **验一次**结果仍在 `base` 内
 *     （挡掉 Windows 上的 `\\?\`、盘符大小写、以及段判漏掉的花样）；
 *  ④ 扩展名必须在**白名单**里，且是常规文件（`isFile()`，挡掉目录与设备文件）。
 *
 * ⚠️ **为什么段判与 `relative` 判都要留**：段判能给出更清楚的错误（"不许 .."），
 *   `relative` 判是最后一道兜底 —— 本项目对安全边界一律**纵深防御**，不赌单个判据完备。
 *
 * @param baseAbs - 基准目录的绝对路径（来自 `assetBaseDirOf`）。
 * @param rel - 正文里写的相对路径（未 URL 解码前的语义由调用方保证）。
 * @returns 绝对路径 + MIME；任何一条约束不过 ⇒ `{ error }`（带可读理由）。
 */
export async function resolveAssetPath(
  baseAbs: string,
  rel: string,
): Promise<{ abs: string; contentType: string } | { error: string }> {
  const cleaned = rel.trim()
  if (cleaned === '') return { error: '缺少 path' }
  // ① 绝对路径一律拒（`isAbsolute` 认得出 `/x`、`C:\x`、`\\server\x`）。
  //    ⚠️ 还要挡 `file:` 之类的 scheme —— 它们不是路径，但会被 resolve 当成相对名。
  if (isAbsolute(cleaned) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned)) {
    return { error: 'path 必须是相对路径' }
  }
  // ② 段判：任何 `..` 直接拒（**先于**任何字符串拼接）。
  const segments = cleaned.replace(/\\/g, '/').split('/')
  if (segments.some((s) => s === '..')) return { error: 'path 不许包含 ..' }
  if (segments.some((s) => s === '' || s === '.')) {
    // 允许 `a//b` 这种冗余斜杠，但拒绝空路径段造成的歧义 —— 归一化掉即可。
  }
  // ③ 拼出来再用 relative 验一次。
  const abs = resolvePath(baseAbs, ...segments.filter((s) => s !== '' && s !== '.'))
  const relCheck = relative(baseAbs, abs)
  if (relCheck === '' || relCheck.startsWith('..') || isAbsolute(relCheck)) {
    return { error: 'path 越出了正文所在目录' }
  }
  // ④ 扩展名白名单 + 必须是常规文件。
  const ext = extname(abs).toLowerCase()
  const contentType = ASSET_MIME[ext]
  if (contentType === undefined || !ASSET_EXT_ALLOW.has(ext)) {
    return { error: `不支持的图片扩展名：${ext === '' ? '(无)' : ext}` }
  }
  try {
    const st = await stat(abs)
    if (!st.isFile()) return { error: '不是一个文件' }
    if (st.size > MAX_ASSET_BYTES) {
      return { error: `图片太大（${Math.round(st.size / 1024)} KB，上限 ${MAX_ASSET_BYTES / 1024 / 1024} MB）` }
    }
  } catch {
    return { error: '图片文件不存在' }
  }
  return { abs, contentType }
}

/**
 * ⭐⭐ **`/asset` 用的封面查找（带短缓存）**——2026-10-19 新增。
 *
 * 🔴🔴 **为什么必须有缓存**：`/entry` 的全库扫描实测 **0.95–1.34 秒**
 *   （840 条封面、28 个项目文档）。一屏 15 张图 ⇒ **15 次扫描 = 15 秒**
 *   ⇒ 用户会看到"图一张一张慢慢冒出来，界面还卡住"。
 *
 * ⭐ **判据：一个请求只为一个字节服务时，它的查找成本必须与"页面上有多少张图"无关。**
 *
 * ⚠️ **为什么不缓存"文件字节"而只缓存"id → baseDir"**：
 *   字节可能是几十 MB（一屏截图就 1.3 MB × 15），而映射只有几十字节；
 *   且缓存映射**不会让用户看到过期的图**（改图立即生效，改 `ref` 最多晚 60 秒）。
 *
 * ⚠️ **过期窗口 60 秒**（有意的）：条目被改 `ref` 后，最多一分钟内旧目录仍可读。
 *   代价可接受（只是"这张图还能取到"），换来的是**不用为每次写操作挂失效钩子**——
 *   后者要改 `edit.ts`/`store.ts` 的每条写路径，而漏一条就静默不失效。
 */
const ASSET_COVER_CACHE_TTL_MS = 60_000

/** `id → { baseDir, at }`；`at` 是写入时刻（毫秒），用于 TTL 判定。 */
const assetCoverCache = new Map<string, { baseDir: string; at: number }>()

/**
 * 按条目 id 取它的**图片基准目录**（带上面的短缓存）。
 *
 * ⭐ 命中缓存时**完全不碰磁盘**（连 `scanLibrary` 都不调）——这正是它的意义。
 * 🔴 **返回的就是 `baseDir` 本身**，不要再交给 `assetBaseDirOf()` 处理一次
 *    （那会多剥一层目录，图会全裂，而且**裂得很像"文件不存在"**——本项目踩过这型）。
 * @param id - 条目 id。
 * @returns 基准目录绝对路径；找不到该封面、或它解析不出目录时 `undefined`。
 */
async function assetBaseDirFor(id: string): Promise<string | undefined> {
  const now = Date.now()
  const hit = assetCoverCache.get(id)
  if (hit !== undefined && now - hit.at < ASSET_COVER_CACHE_TTL_MS) return hit.baseDir

  const snapshot = await scanLibrary({ includeArchived: true, includeHistory: true })
  const found = snapshot.covers.find((c) => c.cover.id === id)
  if (found === undefined) {
    assetCoverCache.delete(id)
    return undefined
  }
  const baseDir = assetBaseDirOf(found.cover.ref, found.cover.ext)
  if (baseDir === undefined) return undefined

  assetCoverCache.set(id, { baseDir, at: now })
  // ⚠️ 顺手清掉过期项：库有 800+ 条目，长期运行不能让这个 Map 无限长。
  //    ⭐ 不清也不会错（只是内存），但"只增不减的缓存"是本项目记过的坑。
  if (assetCoverCache.size > 512) {
    for (const [k, v] of assetCoverCache) {
      if (now - v.at >= ASSET_COVER_CACHE_TTL_MS) assetCoverCache.delete(k)
    }
  }
  return baseDir
}

export async function handleApi(
  deps: ApiDeps,
  method: string,
  pathname: string,
  rawBody: string,
  params: URLSearchParams,
): Promise<ApiResult> {
  const base = '/plugins/dsh-memj/api'
  const route = pathname.slice(base.length) || '/'

  try {
    // ── 健康检查（探针与部署判据用）──
    if (route === '/health') {
      // ⭐⭐ **含归档地扫一次**（决策 133），再自己分成"活跃 / 归档"两组。
      //    🔴 为什么不直接用默认快照：默认快照**不含归档** ⇒ 顶栏的「封面 N」
      //       会比用户自己在库文件里数到的**少**（他数的是全部封面块）。
      //       这不是错，但**必须解释**——所以多回一个 `archivedCovers`，
      //       前端把它显示成「归档 N」（本项目反复强调：数字不许悄悄变少）。
      const snapshot = await scanLibrary({ includeArchived: true })
      const activeCovers = snapshot.covers.filter((c) => (c.cover.archivedAt ?? '') === '')
      const activeProjects = snapshot.projects.filter((p) => (p.frontmatter.archivedAt ?? '') === '')
      return {
        status: 200,
        body: {
          ok: true,
          version: deps.version,
          projects: activeProjects.length,
          themes: snapshot.themeIds.length,
          covers: activeCovers.length,
          archivedCovers: snapshot.covers.length - activeCovers.length,
          archivedProjects: snapshot.projects.length - activeProjects.length,
          invalidCovers: snapshot.issues.length,
          nominations: (await readNominations()).length,
        },
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⭐⭐ 主动注入的**实时状态**（设计文档 §10.4：状态归页面、旋钮归设置面板）。
    //
    // 🔴 **只读**：本次召回注入了哪些 / 被抑制了几次 / 额度用了几个。
    //    ⚠️ 三个数字**必须分开报**，别合成一个"命中率"：
    //       · `injected`  = 真的注入了
    //       · `suppressed`= 判定"不需要"（**不计额度**，§7.4②）
    //       · `skipped`   = 没零件（没路由 / 无候选 / 超出额度 / 解析失败）
    //    ⇒ 合成一个数就分不清"模型说不需要"与"我们没配上"——那正是排障最需要的区别。
    // ⚠️ 数据源是**模块级内存单例**（与 `hotState` 同款理由：API 层拿不到 agent/session 对象）。
    // ══════════════════════════════════════════════════════════════════════
    if (route === '/active') {
      if (method !== 'GET') {
        return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      }
      // ⚠️ 查 `sessionId` 用函数入参 `params`（**不要自己解析 `req.url`** ——
      //    这个 handler 拿不到 `req`，那是路由层的对象，见 `handleApi` 的签名）。
      const sid = params.get('sessionId') ?? ''
      const last = sid === '' ? undefined : activeSnapshot(sid)
      return {
        status: 200,
        body: {
          ok: true,
          sessionId: sid,
          // ⭐ 开关与关键旋钮（页面据此解释"为什么没有数字"）
          enabled: deps.config.activeInject,
          channel: deps.config.activeInjectChannel,
          model: deps.config.activeInjectModel,
          scope: deps.config.activeInjectScope,
          // ⭐ 2026-09-27：口径从"每 turn 调用上限"改成"**每 turn 注入上限**"。
          //    ⚠️ 两个字段名都透出（新名 + 旧名），免得页面/排障脚本读不到——
          //       旧名保留**只作兼容**，值是同一个（都走 `maxInjectionsPerTurn`）。
          maxInjectionsPerTurn: maxInjectionsPerTurn(deps.config),
          maxCallsPerTurn: maxInjectionsPerTurn(deps.config),
          // ⭐ 本 turn **已真正注入**的次数（新名）。
          injectionsUsed: sid === '' ? 0 : activeInjectionsUsed(sid),
          // ⚠️ 旧名保留**只作兼容**（语义已改：它现在是"注入次数"、不再是"调用次数"）。
          callsUsed: sid === '' ? 0 : activeInjectionsUsed(sid),
          // ⚠️ **两个字段是两件事**（见 `lastInjection` 的注释）：
          //    `last`         = 最近一次**判断**（会被后续召回覆盖）；
          //    `lastInjection`= 最近一次**真的注进去**（不被覆盖）+ 累计次数/条数。
          //    ⇒ 页面问"这个会话注入了多少"要读后者（前者可能显示 queued，让人误以为没注入）。
          last: last ?? null,
          lastInjection: sid === '' ? null : (lastInjectionOf(sid) ?? null),
          totals: sid === '' ? null : (injectTotalsOf(sid) ?? null),
          // ⭐ **最近一次 chat 调用的原始形态**（排障用）：
          //    实测踩到 `ms=13 / "模型输出为空"` 时，**任何地方都看不出发生了什么**
          //    ⇒ 把"收到了哪些块类型"如实透出来（只读、纯内存）。
          lastChatCall: lastChatDiagnostic() ?? null,
        },
      }
    }

    if (route === '/projects') {
      const snapshot = await scanLibrary()
      return {
        status: 200,
        body: {
          ok: true,
          projects: snapshot.projects.map((p) => ({
            id: p.id,
            // ⭐ 显示名（决策 115）：空 = 未设置 ⇒ 前端回落成显示 id。
            title: p.frontmatter.title,
            desc: p.frontmatter.desc,
            themes: p.frontmatter.themes,
            // ⭐ 时间（决策 123）：列表按 `updatedAt` 倒序 + 显示小字时间。
            updatedAt: p.frontmatter.updatedAt,
            createdAt: p.frontmatter.createdAt,
          })),
        },
      }
    }

    if (route === '/themes') {
      const snapshot = await scanLibrary()
      // ⭐ **给主题页左侧列表用的字段**（与 `/projects` 对称）：
      //    · `desc`   —— 主题文档 frontmatter 里的描述（列表第二行）
      //    · `covers` —— 该主题下有几条知识
      //    · `projects` —— 覆盖了哪些项目（卡片上的标签）
      //    ⚠️ 都要现算：主题 desc 存在 `THEME-<id>.md` 里，不在 snapshot 上。
      const themes = []
      for (const id of snapshot.themeIds) {
        const fm = await loadThemeFrontmatter(id)
        const covers = snapshot.covers.filter((c) => c.cover.theme.includes(id))
        themes.push({
          id,
          // ⭐ 显示名（决策 115）：空 = 未设置 ⇒ 前端回落成显示 id。
          title: fm?.title ?? '',
          desc: fm?.desc ?? '',
          // ⭐ 时间（决策 123）：列表按 `updatedAt` 倒序 + 显示小字时间。
          updatedAt: fm?.updatedAt ?? '',
          createdAt: fm?.createdAt ?? '',
          covers: covers.length,
          projects: covers
            .map((c) => c.cover.project)
            .filter((p) => p !== '')
            .filter((p, i, arr) => arr.indexOf(p) === i),
        })
      }
      return { status: 200, body: { ok: true, themes, themeIds: snapshot.themeIds } }
    }

    // ── ⭐ 主题详情（与 `/project` 对称，供主题页右栏）──
    if (route === '/theme') {
      const id = params.get('id') ?? ''
      if (id === '') return { status: 400, body: { ok: false, error: '缺少 id' } }
      const snapshot = await scanLibrary()
      if (!snapshot.themeIds.includes(id)) {
        return { status: 404, body: { ok: false, error: '没有这个主题' } }
      }
      const fm = await loadThemeFrontmatter(id)
      // ⭐ 只回**结构化字段**，不回渲染好的 markdown：
      //    `THEME-<id>.md` 是**派生层**（投影），前端要的是"有哪些封面/项目"，
      //    直接给它数据比让它解析 markdown 更稳（也不会把"手改会丢"的告诫渲染出来）。
      const covers = snapshot.covers.filter((c) => c.cover.theme.includes(id))
      const projectIds = covers
        .map((c) => c.cover.project)
        .filter((p) => p !== '')
        .filter((p, i, arr) => arr.indexOf(p) === i)
      const projects = projectIds.map((pid) => ({
        id: pid,
        desc: snapshot.projects.find((p) => p.id === pid)?.frontmatter.desc ?? '',
      }))
      const text = await readTextIfExists(themeDocPath(id))
      return {
        status: 200,
        body: {
          ok: true,
          // ⭐ `title` 是**显示名**（决策 115）；`desc` 是检索键。两者都可改。
          //    ⚠️ 前端**必须**从 `frontmatter.desc` 读（曾误写成 `data.desc` ⇒ 预填永远为空）。
          // ⭐ 时间字段（决策 119）也要带上——详情页文件头要显示它们。
          //    🔴 这里是**手工构造** frontmatter，不是直传 `loadThemeFrontmatter()` 的结果
          //    ⇒ 漏一个字段就静默不显示（本项目"手工构造点"的老坑，见知识条目 `d65742af`）。
          frontmatter: {
            theme: id,
            title: fm?.title ?? '',
            desc: fm?.desc ?? '',
            createdAt: fm?.createdAt ?? '',
            updatedAt: fm?.updatedAt ?? '',
          },
          /** 覆盖的项目（id + desc）——详情页上半部。 */
          projects,
          /** 该主题下的封面数。 */
          coverCount: covers.length,
          /** ⚠️ 派生文档缺失（理论上重建后一定有）。 */
          missingDoc: text === undefined,
        },
      }
    }

    // ── 封面 + 断链 + 非法封面（人侧状态面板的数据源）──
    if (route === '/covers') {
      // ⭐⭐ **含 history**（决策 137）：用户在知识库页要能看到历史归档条目
      //    （类型筛选里也能选 history）⇒ 人侧列表必须含它。
      //    🔴 而模型侧（`memj_search` 等）**不含** —— 见 `listCoversWithLinkCheck` 的注释。
      const data = await listCoversWithLinkCheck({ includeHistory: true })
      return { status: 200, body: { ok: true, ...data } }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⭐⭐ **归档清单（人侧"归档"页的数据源）**（决策 133）
    //
    // 🔴 **为什么单开一个接口、而不是给 `/covers` 加参数**：
    //    归档页要的是**两个互不相干的清单**（知识 / 项目），它们的字段形状也不同
    //    （封面 vs 项目 frontmatter）。塞进 `/covers` 会让"活跃列表"那条路径
    //    多出一个恒为空的 `archivedAt` 过滤分支——本项目吃过"一个接口两种语义"的亏。
    //
    // ⚠️ 归档页**只读**：进来只为看 + 点「恢复」。所有写动作都走 `/edit`。
    // ══════════════════════════════════════════════════════════════════════
    if (route === '/archived') {
      const kind = params.get('kind') === 'project' ? 'project' : 'entry'
      const snapshot = await scanLibrary({ includeArchived: true })
      if (kind === 'project') {
        // ⚠️ 「N 条知识」只数**活跃**封面——归档项目旗下的知识**不跟着归档**（用户裁定 ①），
        //    它们照常出现在知识库页 ⇒ 这里的计数要与知识库页看到的一致。
        const activeCovers = snapshot.covers.filter((c) => (c.cover.archivedAt ?? '') === '')
        const projects = snapshot.projects
          .filter((p) => (p.frontmatter.archivedAt ?? '') !== '')
          .map((p) => ({
            id: p.id,
            title: p.frontmatter.title,
            desc: p.frontmatter.desc,
            themes: p.frontmatter.themes,
            updatedAt: p.frontmatter.updatedAt,
            createdAt: p.frontmatter.createdAt,
            /** ⭐ 归档时间（非空，就是筛选条件）。 */
            archivedAt: p.frontmatter.archivedAt,
            /** 该项目旗下**活跃**知识条数。 */
            coverCount: activeCovers.filter((c) => c.cover.project === p.id).length,
          }))
        return { status: 200, body: { ok: true, kind, projects } }
      }
      // ⭐⭐ **只要归档的**（`onlyArchived`）⇒ 存在性检查从 414 次降到归档那几条。
      //    🔴 原来传 `{ includeArchived: true }` 再在下面 `.filter(...)` —— 那是
      //       "**先全量检查、再筛**"，白付 409 次文件检查（详见该函数的注释）。
      const data = await listCoversWithLinkCheck({ includeArchived: true, onlyArchived: true })
      return { status: 200, body: { ok: true, kind, covers: data.covers, invalid: data.invalid } }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⭐⭐ **热知识**（热知识方案 §8.4）——**只有人能调**，不在任何 LLM 工具里
    //
    // 🔴🔴 **路由必须逐条登记进 `index.ts` 的白名单**（漏了会静默失败：
    //      请求落到 SPA 兜底、返回 HTML，前端 JSON.parse 报错，而服务端毫无异常）。
    // ══════════════════════════════════════════════════════════════════════

    // ── GET /hot?session=<id>：实时状态页的数据源（§8.1）──
    if (route === '/hot') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      const sessionId = params.get('session') ?? ''
      const file = await loadSessionsFile()
      // ⭐ 服务查询适配器（`detectProjectByGetHandoff` 要读会话日志）——
      //    ⚠️ 拿不到时那条判据**自动降级**，其余判据不受影响。
      const getSvc = { get: (n: string): unknown => deps.getService?.(n) }
      // ⭐⭐ **打开会话时就补算一次判定**（用户 2026-09-22 要求）。
      //
      // 🔴 **为什么需要**：判定原本只挂在 `agent/pre-step` / `llm/stream` 上
      //    ⇒ 那两个**只在会话真的跑一轮时才触发**。
      //    而用户"打开一个已有历史的会话"往往**只是切过去看**（还没发消息）
      //    ⇒ 一个钩子都不触发 ⇒ 页面上永远显示「未知」。
      // ⇒ ⭐ 这里在**页面来问的时候**补算一次，并**顺手落盘**（下次就不用再算）。
      //
      // ⚠️ **只补算"还没判定出项目"的会话**（已有绑定就尊重它，不重算——
      //    否则用户看到的项目会随每次刷新跳变）。
      // ⚠️ 只读历史、**不注入、不发消息**（纯查询副作用，安全）。
      //
      // ⭐⭐ **走统一的 `resolveProject`**（2026-09-22 改）：
      //    原来这里只调 `detectProjectByDocReads` ⇒ 新增的"读会话日志找 get-handoff 痕迹"
      //    那条判据**不会生效**。⇒ 改成调 `resolveProject`（它内部已把两条判据并列合成），
      //    **不再重复实现优先级**（本项目铁律：实现只留一份）。
      if (sessionId !== '' && file.detectDocReads) {
        const cur = file.sessions[sessionId]
        const unbound = cur === undefined || cur.project === '' || cur.project === HOT_PROJECT_UNKNOWN
        if (unbound) {
          const r = await resolveProject(getSvc, sessionId)
          if (r.project !== HOT_PROJECT_UNKNOWN) {
            file.sessions[sessionId] = {
              project: r.project,
              // ⭐ 来源如实记（`get-handoff` 与 `doc-reads` 强度等同，但**来源不同**）。
              // ⚠️ `handoff`（模型自己声明并真写了文档）**也归到 `doc-reads`** ——
              //    它是 doc-reads 那条判据里最强的一支，落盘时不必单列。
              // 🔴 **但 `inherited` 必须原样保留**（2026-09-29）：它是"我没有自己的证据、
              //    按父会话算"—— 如果在这里被改写成 `doc-reads`，UI 就会**撒谎**
              //    说"这个子会话自己读过项目文档"。
              source: r.source === 'inherited'
                ? 'inherited'
                : (r.source === 'get-handoff' || r.source === 'handoff' ? 'doc-reads' : (r.source as 'doc-reads')),
              boundAt: new Date().toISOString(),
              lastActiveAt: cur?.lastActiveAt ?? new Date().toISOString(),
            }
            const { kept } = pruneSessions(file.sessions, deps.config.hotSessionKeep)
            file.sessions = kept
            await saveSessionsFile(file)
          }
        }
      }
      const bound = sessionId === '' ? undefined : file.sessions[sessionId]
      // ⚠️ 判不出项目时**如实返回 `未知`**（不猜、不空着）。
      const preview = sessionId === ''
        ? undefined
        : await previewForSession(getSvc, sessionId, {
          // ⭐⭐⭐ **必须传**（2026-09-29 修的 bug）：不传 ⇒ 页面按**原清单**渲染，
          //    而实际注入按**评分榜** ⇒ **界面显示的与实际注入的是两个集合**
          //    （用户症状："加过分的知识没出现在项目热知识列表里"）。
          on: deps.config.hotScoreOnTurnEnd,
          windowHours: deps.config.hotScoreWindowHours,
          topN: deps.config.hotScoreTopN,
          // ⭐ 门槛（决策 182）—— ⚠️ **与注入侧必须同值**，否则两边又是两个集合。
          gate: true,
          gateMinScore: deps.config.hotScoreGateMinScore,
          gateLastTurn: deps.config.hotScoreGateLastTurn,
        })
      // ⭐⭐ **预算**（热知识方案 §9.1）。
      //
      // 🔴 公式（别改）：`chars = 窗口(tokens) × 比例 ÷ 字符每token`
      //    · **比例 = 0 ⇒ 关闭预算检查**（返回 0，前端据此不显示上限）；
      //    · **窗口未知 ⇒ 回落 `hotBudgetCharsFallback`**（那个值本身就是**字符数**，
      //      ⚠️ **不再乘比例** —— 它是"窗口未知时的替代上限"，不是 token 数）。
      //    ⚠️ 实测踩到：这里一度写成 `fallback * 1`，**比例与换算系数都被丢掉**
      //       ⇒ 网页显示的"上限"与用户配的旋钮**完全无关**（界面在撒谎）。
      const ratio = deps.config.hotInjectRatio
      const cpt = deps.config.hotCharsPerToken
      // 本会话已知的上下文窗口（由 `llm/stream` 顺带记下；没有就是未知）。
      const win = sessionId === '' ? undefined : hotState.windows.get(sessionId)?.contextWindow
      const budget = ratio <= 0
        ? 0   // 0 = 关闭预算检查
        : (typeof win === 'number' && win > 0
          ? Math.floor((win * ratio) / (cpt > 0 ? cpt : 1))
          : deps.config.hotBudgetCharsFallback)
      return {
        status: 200,
        body: {
          ok: true,
          sessionId,
          inject: deps.config.hotInject,
          detect: {
            docReads: file.detectDocReads,
            llm: file.detectLlm,
            llmModel: file.detectLlmModel,
          },
          bound: bound ?? null,
          preview: preview ?? null,
          // ⭐ 列表数据（**给人看的**）：标题 / 类型 / 形态 / 指纹。
          //    ⚠️ 与 `preview` 分开是有意的——`preview` 是判定口径（含预算、窗口），
          //    这里是页面渲染口径；两者都来自同一次 `buildHotInjection`（同源）。
          items: preview?.items ?? [],
          // ⭐⭐ **窗口快照必须在这里转成 JSON 安全形状**。
          //
          // 🔴🔴 **实测的坑（本批修）**：`WindowSnapshot.present` 是 **`Set<string>`**，
          //    而 `JSON.stringify(new Set(['a']))` === **`'{}'`**（Set 没有 toJSON）
          //    ⇒ 前端拿到的是**空对象** ⇒ `win.present.includes(...)` **不是函数、抛 TypeError**
          //    ⇒ **整段列表渲染直接中断**（而页面上只是"什么都没有"，看不出是报错）。
          // ⚠️ 也正因如此，**"注入状态"这个功能此前从未真正工作过**。
          // ⭐ 修在**接口边界**（而不是让前端去兼容 `{}`）：那是"离开进程"的最后一站，
          //    之后任何消费者拿到的都是同一个形状（本项目：**实现只留一份**）。
          window: preview?.window === undefined
            ? null
            : {
                at: preview.window.at,
                sessionId: preview.window.sessionId,
                contextWindow: preview.window.contextWindow ?? null,
                // ⚠️ Set ⇒ 数组（这是唯一必须转的东西）。
                present: [...preview.window.present],
              },
          // ⭐⭐ **如实告知这个快照是从哪来的**（2026-09-23 加）。
          //
          // 🔴 内存快照"进程重启即失" ⇒ 重启后它为空、页面把每条都显示成"未注入"，
          //    而**注入内容其实还在会话里** ⇒ 那是假话（用户实测报告：
          //    *"隔了一整夜……现在显示未注入了。那这是不对的哇？"*）。
          // ⇒ 现在内存缺失时**从会话日志重建**，并在这里说明来源：
          //    · `'memory'` = 最近一次真实出网的判定（**最新鲜**）；
          //    · `'log'`    = 内存没有、由会话日志重建（**重启后就是这种**）；
          //    · `null`     = 都没有 ⇒ 页面如实显示"未注入"，且能说清为什么。
          windowSource: preview === undefined || preview.window === undefined
            ? null
            : (preview.windowFromLog ? 'log' : 'memory'),
          budget: {
            ratio,
            charsPerToken: cpt,
            chars: budget,
            fullWarnChars: deps.config.hotFullWarnChars,
            // ⭐ 如实告知这个上限**是从哪来的**（窗口算的 / 回落值）。
            basis: ratio <= 0 ? 'off' : (typeof win === 'number' && win > 0 ? 'window' : 'fallback'),
            contextWindow: typeof win === 'number' ? win : null,
          },
          keep: deps.config.hotSessionKeep,
        },
      }
    }

    // ── GET /hot/projects：项目热知识**第一层**（项目列表 + 各自已选条数，§8.3.1）──
    if (route === '/hot/projects') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      const snapshot = await scanLibrary()
      const selections = await loadSelections()
      return {
        status: 200,
        body: {
          ok: true,
          projects: snapshot.projects.map((p) => {
            const sel = selections[p.id]
            const ids = (sel?.entries ?? []).map((e) => e.id)
            return {
              id: p.id,
              title: p.frontmatter.title,
              desc: p.frontmatter.desc,
              themes: p.frontmatter.themes,
              updatedAt: p.frontmatter.updatedAt,
              coverCount: snapshot.covers.filter((c) => c.cover.project === p.id).length,
              selectedCount: ids.length,
              // ⭐⭐ **2026-09-22：`injectCount` 恒等于 `selectedCount`** ——
              //    项目层不再有第二道 `on` 开关（"在清单里 = 会注入"）。
              //    ⚠️ **字段保留**（页面还在显示它），但**两个数字永远一样**；
              //    留着是为了"页面上能看出这两件事现在是一件事"。
              injectCount: ids.length,
              initializedAt: sel?.initializedAt ?? '',
            }
          }),
        },
      }
    }

    // ── GET/POST /hot/persona：画像的增删改（§8.2）──
    if (route === '/hot/persona') {
      if (method === 'GET') {
        return { status: 200, body: { ok: true, items: await loadPersona() } }
      }
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 GET / POST' } }
      let p: { op?: unknown; id?: unknown; text?: unknown; on?: unknown; channel?: unknown }
      try { p = JSON.parse(rawBody) as typeof p } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      const items = await loadPersona()
      const op = typeof p.op === 'string' ? p.op : ''
      const now = new Date().toISOString()
      if (op === 'add') {
        const text = typeof p.text === 'string' ? p.text : ''
        if (text.trim() === '') return { status: 400, body: { ok: false, error: '画像正文不能为空。' } }
        items.push({
          id: newPersonaId(), text, on: true,
          channel: p.channel === 'section' ? 'section' : 'inbox',
          createdAt: now, updatedAt: now,
        })
      } else if (op === 'update') {
        const idx = items.findIndex((it) => it.id === p.id)
        if (idx < 0) return { status: 404, body: { ok: false, error: '没有这条画像' } }
        const cur = items[idx]
        if (cur === undefined) return { status: 404, body: { ok: false, error: '没有这条画像' } }
        items[idx] = {
          ...cur,
          ...(typeof p.text === 'string' ? { text: p.text } : {}),
          ...(typeof p.on === 'boolean' ? { on: p.on } : {}),
          ...(p.channel === 'section' || p.channel === 'inbox' ? { channel: p.channel } : {}),
          updatedAt: now,
        }
      } else if (op === 'delete') {
        const idx = items.findIndex((it) => it.id === p.id)
        if (idx < 0) return { status: 404, body: { ok: false, error: '没有这条画像' } }
        items.splice(idx, 1)
      } else {
        return { status: 400, body: { ok: false, error: 'op 只能是 add / update / delete。' } }
      }
      await savePersona(items)
      return { status: 200, body: { ok: true, items } }
    }

    // ── GET/POST /hot/selection?project=<id>：某项目的清单（§5.3b）──
    if (route === '/hot/selection') {
      const projectId = params.get('project') ?? ''
      if (projectId === '') return { status: 400, body: { ok: false, error: '缺少 project' } }
      const selections = await loadSelections()
      if (method === 'GET') {
        const sel = selections[projectId]
        return {
          status: 200,
          body: {
            ok: true,
            project: projectId,
            // ⭐ 新结构：每条带 `shape` / `pinnedAt`（见 `HotProjectEntry`）。
            entries: sel?.entries ?? [],
            // ⚠️ **兼容字段**：页面还有几处在读 `entryIds`。
            //    保留它 = 页面可以渐进迁移，且**不会出现"两种读法给出不同结果"**
            //    （它就是从 `entries` 现算的，同源）。
            entryIds: (sel?.entries ?? []).map((e) => e.id),
            initializedAt: sel?.initializedAt ?? '',
          },
        }
      }
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 GET / POST' } }
      let p: { entryIds?: unknown; entries?: unknown; init?: unknown }
      try { p = JSON.parse(rawBody) as typeof p } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      const prev = selections[projectId]
      /** 把"传进来的 id 数组"合成为新结构（**保留已存在的 shape/pinnedAt**）。 */
      const fromIds = (ids: readonly string[]): HotProjectEntry[] => {
        const old = new Map((prev?.entries ?? []).map((e) => [e.id, e]))
        return ids.map((id) => old.get(id) ?? { id, shape: 'meta' as const, pinnedAt: '' })
      }
      let entries: HotProjectEntry[]
      if (Array.isArray(p.entries)) {
        // ⭐ 新写法：整份替换（页面用了新结构时走这条）。
        entries = []
        for (const e of p.entries) {
          if (e === null || typeof e !== 'object') continue
          const it = e as Partial<HotProjectEntry>
          if (typeof it.id !== 'string' || it.id === '') continue
          entries.push({
            id: it.id,
            shape: it.shape === 'full' ? 'full' : 'meta',
            pinnedAt: typeof it.pinnedAt === 'string' ? it.pinnedAt : '',
          })
        }
      } else if (Array.isArray(p.entryIds)) {
        // ⚠️ 旧写法（只给 id 列表）：**仍然接受**，但**已有的 shape/pinnedAt 会保留**
        //    （不能因为调用方只会传 id 就把用户设过的形态/置顶抹掉 —— 本项目老坑：
        //     "替换型接口要问一句：我给的这坨是不是完整的"）。
        entries = fromIds(p.entryIds.filter((x): x is string => typeof x === 'string'))
      } else {
        entries = prev?.entries ?? []
      }
      selections[projectId] = {
        entries,
        // ⭐ **首次生成时打时间戳**（§5.3b：之后尊重用户手工增删，绝不覆盖）。
        initializedAt: p.init === true || (prev?.initializedAt ?? '') === ''
          ? new Date().toISOString()
          : (prev?.initializedAt ?? ''),
      }
      await saveSelections(selections)
      return {
        status: 200,
        body: {
          ok: true,
          project: projectId,
          entries,
          entryIds: entries.map((e) => e.id),
          initializedAt: selections[projectId]?.initializedAt ?? '',
        },
      }
    }

    // ── POST /hot/bind：手动绑定 / 切换判定开关（§7.3）──
    if (route === '/hot/bind') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let p: { session?: unknown; project?: unknown; detectDocReads?: unknown; detectLlm?: unknown; llmModel?: unknown }
      try { p = JSON.parse(rawBody) as typeof p } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      const file = await loadSessionsFile()
      // 三个判定开关（全局，不逐会话）。
      if (typeof p.detectDocReads === 'boolean') file.detectDocReads = p.detectDocReads
      if (typeof p.detectLlm === 'boolean') file.detectLlm = p.detectLlm
      if (p.llmModel !== undefined) {
        const m = p.llmModel as { provider?: unknown; model?: unknown } | null
        file.detectLlmModel = m !== null && typeof m?.provider === 'string' && typeof m?.model === 'string'
          ? { provider: m.provider, model: m.model }
          : null
      }
      // 手动绑定（逐会话）。
      const sessionId = typeof p.session === 'string' ? p.session : ''
      if (sessionId !== '' && p.project !== undefined) {
        const project = typeof p.project === 'string' ? p.project : ''
        const now = new Date().toISOString()
        if (project === '') delete file.sessions[sessionId]
        else {
          file.sessions[sessionId] = {
            project,
            // ⭐ **手动绑定必须标 `manual`**——否则会被下一次自动判定悄悄改掉（§7.3）。
            source: 'manual',
            boundAt: now,
            lastActiveAt: file.sessions[sessionId]?.lastActiveAt ?? now,
          }
        }
      }
      const { kept } = pruneSessions(file.sessions, deps.config.hotSessionKeep)
      file.sessions = kept
      await saveSessionsFile(file)
      return { status: 200, body: { ok: true, detectDocReads: file.detectDocReads, detectLlm: file.detectLlm, llmModel: file.detectLlmModel, bound: file.sessions[sessionId] ?? null } }
    }

    // ── POST /hot/item：逐条设置（纳入 / 通道 / 形态 / 置顶 / 移出）──
    //
    // 🔴🔴 **2026-09-22 起按层级分流**（用户裁定："作用的层级 = 存的地方"）：
    //   · **全局知识** ⇒ `entries.json`（它对所有项目生效，设置天然全局）；
    //   · **项目 / 主题知识** ⇒ **项目清单**（`selection.json`，逐项目）。
    // ⚠️ 判据是**该条封面是不是 `global: true`**，而不是"调用方传了哪个 project"
    //    —— 否则同一条知识在 A 项目走清单、在 B 项目走全局表，两份设置会打架。
    if (route === '/hot/item') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let p: { id?: unknown; on?: unknown; channel?: unknown; shape?: unknown; pin?: unknown; project?: unknown }
      try { p = JSON.parse(rawBody) as typeof p } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      const id = typeof p.id === 'string' ? p.id : ''
      if (id === '') return { status: 400, body: { ok: false, error: '缺少 id' } }
      const projectId = typeof p.project === 'string' ? p.project : ''
      const cover = (await scanLibrary()).covers.find((c) => c.cover.id === id)?.cover
      const isGlobal = cover?.global === true

      // ══ ① 全局知识：设置存 `entries.json` ══
      if (isGlobal) {
        const entries = await loadEntrySettings()
        const cur = entries[id] ?? defaultEntrySetting('global')
        const next = { ...cur }
        if (typeof p.on === 'boolean') next.on = p.on
        if (p.channel === 'section' || p.channel === 'inbox') next.channel = p.channel
        if (p.shape === 'meta' || p.shape === 'full') next.shape = p.shape
        // ⚠️ **置顶对全局知识无意义**（它本来就每次都注入，没有"排在哪"的问题，
        //    界面上也没有它的置顶按钮）⇒ 忽略 `pin`，**不静默**：回执里说明。
        entries[id] = next
        await saveEntrySettings(entries)
        return {
          status: 200,
          body: {
            ok: true, scope: 'global', setting: next, removed: false,
            ...(p.pin !== undefined ? { note: '全局知识不参与置顶（它每次都会注入）。' } : {}),
          },
        }
      }

      // ══ ② 项目 / 主题知识：设置存**项目清单** ══
      if (projectId === '') {
        return {
          status: 400,
          body: {
            ok: false,
            error: '这条不是全局知识 ⇒ 它的形态/置顶是**逐项目**的，必须传 `project` 指明是哪个项目。',
          },
        }
      }
      const selections = await loadSelections()
      const sel = selections[projectId] ?? { entries: [], initializedAt: '' }
      const idx = sel.entries.findIndex((e) => e.id === id)
      const curEntry = idx >= 0 ? sel.entries[idx] : undefined

      // **移出清单**（`on: false` + 传了 project）：一步做完"取消置顶 + 移出"。
      if (p.on === false && idx >= 0) {
        sel.entries.splice(idx, 1)
        selections[projectId] = sel
        await saveSelections(selections)
        return {
          status: 200,
          body: { ok: true, scope: 'project', removed: true, entries: sel.entries, entryIds: sel.entries.map((e) => e.id) },
        }
      }
      // 其余情况要求它已在清单里（**不在清单里就没有"这条的设置"可言**）。
      if (curEntry === undefined) {
        return {
          status: 404,
          body: {
            ok: false,
            error: '这条不在该项目的热知识清单里 ⇒ 没有可改的设置。先把它加入清单（`POST /hot/selection`）。',
          },
        }
      }
      const nextEntry = { ...curEntry }
      if (p.shape === 'meta' || p.shape === 'full') nextEntry.shape = p.shape
      // ⭐ 置顶：`pin: true` 打时间戳、`pin: false` 清空（"按最后置顶时间倒序"）。
      if (p.pin === true) nextEntry.pinnedAt = new Date().toISOString()
      if (p.pin === false) nextEntry.pinnedAt = ''
      sel.entries[idx] = nextEntry
      selections[projectId] = sel
      await saveSelections(selections)
      return {
        status: 200,
        body: {
          ok: true, scope: 'project', entry: nextEntry, removed: false,
          entries: sel.entries, entryIds: sel.entries.map((e) => e.id),
        },
      }
    }

    // ── GET /hot/global：全局知识清单（含正文，供展开；§8.2）──
    if (route === '/hot/global') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      const snapshot = await scanLibrary()
      const entries = await loadEntrySettings()
      const out = []
      for (const { cover } of snapshot.covers) {
        if (!cover.global) continue
        const doc = await loadEntryDoc(cover.ref, cover.ext)
        const st = entries[cover.id] ?? defaultEntrySetting('global')
        out.push({
          id: cover.id, title: cover.title, desc: cover.desc, kind: cover.kind,
          project: cover.project,
          on: st.on, channel: st.channel, shape: st.shape,
          // ⚠️ **不再返回 `pinnedAt`**：全局知识不参与置顶（它每次都会注入，
          //    没有"排在哪"的问题，界面上也没有置顶按钮）—— 见 `HotEntrySetting`。
          // ⚠️ 正文**长度**要如实给出（页面据此显示体量与 1000 字符警告，§9.1c）。
          bodyChars: (doc?.body ?? '').length,
          body: doc?.body ?? '',
        })
      }
      return { status: 200, body: { ok: true, covers: out, fullWarnChars: deps.config.hotFullWarnChars } }
    }

    // ── ⭐ 详情数据源（§8.2：详情数据走「按 id 取」，**不靠前端拼路径**）──
    // ⭐⭐⭐ **正文里的图片**（2026-10-19 新增）——`/asset?entry=<id>&path=<相对路径>`。
    //
    // 🔴 **为什么需要这个接口**：markdown 里的 `![](docs/x.png)` 是相对路径，
    //    而 memj 页面在 `/plugins/dsh-memj/` ⇒ 浏览器按那个 URL 去取，
    //    **与文档在磁盘上的位置毫无关系** ⇒ 图必然 404（真机实测确认）。
    //
    // ⭐ **三件事一起成立才能显示**：
    //    ① 前端把相对 `src` 重写成指向本接口（`app.js` 的 `localizeImages()`）；
    //    ② 本接口按**条目的 ref 所在目录**去磁盘上找那个文件（`assetBaseDirOf`）；
    //    ③ 还要**允许它被读**（扩展名白名单 + 不许越界，见 `resolveAssetPath`）。
    //
    // ⚠️ **为什么用 `entry` 参数而不是让前端传绝对路径**：
    //    绝对路径等于把"能读哪个目录"的决定权交给浏览器 —— 那正是任意文件读取。
    //    ⇒ 只认条目 id：**能读的范围由那条条目的 ref 决定**，前端说了不算。
    if (route === '/asset') {
      const id = params.get('entry') ?? ''
      if (id === '') return { status: 400, body: { ok: false, error: '缺少 entry' } }
      // 🔴⚠️ **必须与 `/entry` 同源：含归档 + 含历史**。用别的取法会出现
      //    "详情页打得开、但它的图是裂的"——那种不一致比整页打不开更难查。
      //    ⚠️ 代价：一次全库扫描（实测 ~1 秒），由 `assetBaseDirFor` 的短缓存摊掉。
      const baseDir = await assetBaseDirFor(id)
      if (baseDir === undefined) return { status: 404, body: { ok: false, error: '库里没有这张封面' } }
      const rel = params.get('path') ?? ''
      const got = await resolveAssetPath(baseDir, rel)
      if ('error' in got) {
        // ⚠️ **404 而不是 400**：路径错、文件不在、扩展名不支持 —— 对浏览器来说
        //    都是"这张图取不到"，而 `<img>` 的 onerror 不区分状态码。
        //    ⭐ 但错误文案要**说清是哪一类**（本项目：报错不得把多类原因压成一句）。
        return { status: 404, body: { ok: false, error: got.error } }
      }
      try {
        const bytes = await readFile(got.abs)
        return {
          status: 200,
          body: null,
          raw: {
            contentType: got.contentType,
            bytes,
            // ⭐ 图片内容由 md 正文决定、正文变了图名通常也变 ⇒ 短缓存即可。
            //    🔴 **不能用 `no-store`**：一屏十几张图，每次切条目都重新拉一遍
            //       几十 MB 的截图，界面会明显卡顿。
            cacheControl: 'private, max-age=300',
          },
        }
      } catch (e) {
        return { status: 404, body: { ok: false, error: `读取图片失败：${e instanceof Error ? e.message : String(e)}` } }
      }
    }

    if (route === '/entry') {
      const id = params.get('id') ?? ''
      if (id === '') return { status: 400, body: { ok: false, error: '缺少 id' } }
      // ⭐⭐ **必须"含归档 + 含历史"地找**（决策 137）：
      //    · **归档**（决策 133）：归档条目不在默认快照里，但其详情页要能按 id 取到。
      //    · **历史**（决策 137）：`kind: 'history'` 的条目不进模型检索，
      //      ⚠️ 但「历史进展」小节里的**指针**要能点进来看到全文
      //      ⇒ 🔴 详情接口**必须能取到它**，否则那个链接会 404。
      const snapshot = await scanLibrary({ includeArchived: true, includeHistory: true })
      const found = snapshot.covers.find((c) => c.cover.id === id)
      if (found === undefined) return { status: 404, body: { ok: false, error: '库里没有这张封面' } }
      const cover = found.cover
      const abs = resolveRef(cover.ref, cover.ext)
      const doc = abs === undefined ? undefined : await loadEntryDoc(cover.ref, cover.ext)
      /**
       * ⭐⭐ **「返回源知识」的判据**（2026-10-14 第 9 期）——
       * 只有 `kind: chat` 的条目才有意义（其余条目没有"源"）。
       *
       * 🔴 **为什么由服务端算，而不是让前端查 `/reading/bindings`**：
       *    · 前端要的是"**这条 chat 条目**的源"，而 bindings 那个接口是**按源条目**查的
       *      ⇒ 前端拿不到反向映射；
       *    · 更重要的是本项目铁律：**能给人看的列表必须由服务端回结构化条目**
       *      （免得"候选集合"的判据有第二份实现，迟早与后端不一致）。
       *
       * ⚠️ 查不到绑定（数据被清、或条目是手工建的）⇒ 返回 `null`
       *    ⇒ 前端**不渲染那个按钮**（不撒谎：没有源就不给入口）。
       */
      const readingSource = cover.kind === 'chat'
        ? await findBindingByChatEntry(cover.id).then((b) =>
            b === undefined
              ? null
              : { entryId: b.entryId, blockId: b.anchor.blockId, exact: b.anchor.exact },
          )
        : null
      return {
        status: 200,
        body: {
          ok: true,
          /**
           * ⭐ **源知识指针**：`{ entryId, blockId, exact }` 或 `null`。
           * 前端据此渲染「↩ 返回源知识」并在源条目里**滚到那一段**。
           */
          readingSource,
          cover: {
            id: cover.id,
            project: cover.project,
            theme: cover.theme,
            global: cover.global,
            kind: cover.kind,
            tags: cover.tags,
            // ⭐ `title` 也是封面字段（决策 98）——详情页要能显示/编辑它。
            title: cover.title,
            desc: cover.desc,
            ref: cover.ref,
            ext: cover.ext,
            // ⭐⭐ **时间要从封面带出去**（决策 119）——🔴 修一个实测缺陷：
            //    前端原来只从**正文** `frontmatter` 读时间，而**外部引用没有正文**
            //    （下面 `frontmatter` 恒为 `null`）⇒ 外链条目的时间**恒显示为空**。
            //    封面本来就存着这两个字段 ⇒ 这里一并返回，前端优先从封面读。
            createdAt: cover.createdAt,
            updatedAt: cover.updatedAt,
            /**
             * ⭐⭐ **溯源**（2026-10-14「文档内提问」）——`chat` 条目的「去会话」按钮靠它。
             *
             * 🔴 **这个接口才是按钮真正的数据来源**（列表接口那一份是顺带透出）：
             *    用户在知识库点开一条 `chat` 条目 ⇒ 走这里 ⇒ 要能拿到
             *    `source.sessionId` 才能跳回产生它的那个会话。
             * ⚠️ 没有 `source` 的条目（绝大多数）返回空对象 ⇒ 前端据此**不渲染**那个按钮。
             */
            source: cover.source?.sessionId !== undefined ? { sessionId: cover.source.sessionId } : {},
            /**
             * ⭐ **归档时间**（决策 133）——空串 = 活跃。
             *
             * 🔴 前端**靠这个字段自己判断该画"归档"还是"恢复"按钮**，
             *    而不是靠"我当前在哪个标签页"——因为一个过期的书签 hash
             *    可以把你带到知识库页上的归档条目，那时画错按钮就是**撒谎**。
             */
            archivedAt: cover.archivedAt ?? '',
          },
          // ⭐ 标题优先取封面（决策 98）；`doc?.title` 已含"frontmatter → 正文回退"。
          title: cover.title.trim() !== '' ? cover.title : (doc?.title ?? ''),
          /**
           * ⭐ **外部引用也渲染正文**（决策 128，**取代** §12-80）。
           *
           * 🔴 原来这里写 `cover.ext ? '' : (doc?.body ?? '')`——对外链恒返回空串。
           *    而 `loadEntryDoc(cover.ref, cover.ext)` **本来就会真的读那个库外文件**
           *    （`resolveRef` 认 `ext` ⇒ 按绝对路径读）⇒ **正文一直是有的，只是被这里丢弃**。
           *    ⇒ 本改动**不新增任何读取逻辑**，只是"别再丢掉"。
           * ⚠️ 断链时 `doc === undefined` ⇒ 自然回落成 `''`（见 `missing`）。
           */
          body: doc?.body ?? '',
          /**
           * ⭐⭐ **正文里相对图片的基准目录**（2026-10-19 新增，`/asset` 的 A+B 一半）。
           *
           * 🔴 **为什么必须由服务端给**：前端拿不到"正文文件在磁盘哪里"这个事实
           *    （外链条目的 `ref` 是绝对路径，但它指向的可能是**另一个盘/另一个目录**）。
           *    让前端自己猜基准 = 让它持有一份与后端不同的路径规则 ⇒ 必然漂移。
           * ⭐ 本项目铁律：**能给人看的列表/数据必须由服务端回结构化条目**。
           *
           * ⚠️ **只回目录、不回文件内容**：能否读出某个文件仍由 `/asset` 判
           *    （白名单 + 不越界）——**前端拿到这个目录并不等于它能读那个目录**。
           *
           * ⚠️ 正文里**没有图片时也照常给**：判"有没有图"是前端的活
           *    （它手上才有正文，见 `localizeImages()`），后端多判一次就是第二份判据。
           */
          assetBase: assetBaseDirOf(cover.ref, cover.ext) ?? '',
          /**
           * 文件头（§8.2：详情页上半部渲染）。
           *
           * ⚠️ **外链恒为 `null`，这是有意的**（决策 128 维持 A 方案）：
           *    §3.3 明写「**外部引用不写 frontmatter**——那文档不是 memj 生成的，
           *    往里塞字段等于改用户文件」。所以目标文件里**根本没有 frontmatter**。
           * 🔴 **不能改成 `doc?.frontmatter ?? null`**：`loadEntryDoc` 构造时
           *    会把缺的字段填成**空串**（它永远返回一个对象，不是 `undefined`）
           *    ⇒ 那样外链会拿到**一个"全空对象"**，反而暗示"有 frontmatter 但它空"，
           *    语义比 `null` 更差。
           * ⭐ 外链的元数据**只存在于封面**——详情页的文件头面板**从 `cover` 取值**（`app.js`），
           *    所以外链照样有文件头显示，不受这里影响。
           */
          frontmatter: cover.ext ? null : (doc?.frontmatter ?? null),
          missing: doc === undefined,
          sourceFile: found.sourceFile,
          line: found.line,
        },
      }
    }

    if (route === '/project') {
      const id = params.get('id') ?? ''
      if (id === '') return { status: 400, body: { ok: false, error: '缺少 id' } }
      const doc = await loadProjectDoc(id)
      if (doc === undefined) return { status: 404, body: { ok: false, error: '没有这个项目' } }
      return {
        status: 200,
        body: {
          ok: true,
          frontmatter: doc.frontmatter,
          /** 项目详情显示的是**六节叙事**（不含封面区，§8.2）。 */
          narrative: doc.narrative,
          /**
           * ⭐⭐ **决策 220：各节自己的规范块**（供项目详情页就地编辑）。
           *
           * ⚠️ **只列"真的有规范块"的节** —— 没有块的节**不出现在这里**，
           *    前端据此就不给它画「编辑」按钮。🔴 这条对应既有硬裁定
           *    「已有文档没有规范就**绝不替它合成**」（决策 207）：
           *    工具不知道那份文档该有哪几节规范 ⇒ 硬贴一份默认规范是**主动误导**。
           * ⚠️ 与 `narrative` 同源（都从这份文档算），所以页面上"看到的"与
           *    "能改的"**不可能是两回事**（本项目最忌的那种静默错位）。
           */
          sections: sectionSpecsOf(doc.narrative),
          coverCount: doc.covers.length,
          orphanCount: doc.orphans.length,
        },
      }
    }

    // ── ⭐ 非法封面：取原始块（供"修复表单"预填，§8.6）──
    if (route === '/block') {
      const file = params.get('file') ?? ''
      const line = Number(params.get('line') ?? '0')
      if (file === '' || !Number.isInteger(line) || line < 1) {
        return { status: 400, body: { ok: false, error: '缺少 file 或 line' } }
      }
      const projectId = file.startsWith('HANDOFF-') && file.endsWith('.md')
        ? file.slice('HANDOFF-'.length, -'.md'.length)
        : ''
      if (projectId === '') return { status: 400, body: { ok: false, error: `不是项目文档名：${file}` } }
      const doc = await loadProjectDoc(projectId)
      if (doc === undefined) return { status: 404, body: { ok: false, error: `项目文档不存在：${file}` } }
      const parsed = parseCovers(doc.text, file)
      const block = parsed.blocks.find((b) => b.startLine === line)
      if (block === undefined) return { status: 404, body: { ok: false, error: '该行不是封面块' } }
      const issue = parsed.issues.find((i) => i.line === line)
      return {
        status: 200,
        body: {
          ok: true,
          file,
          startLine: block.startLine,
          endLine: block.endLine,
          raw: block.text,
          reason: issue?.reason ?? '',
        },
      }
    }

    if (route === '/nominations') {
      return { status: 200, body: { ok: true, nominations: await readNominations() } }
    }

    // ── 批准 / 否决（**只有人能调**：这两个动作不在任何 LLM 工具里）──
    if (route === '/approve' || route === '/reject') {
      if (method !== 'POST') {
        return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      }
      let payload: { entryId?: string }
      try {
        payload = JSON.parse(rawBody) as { entryId?: string }
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      const entryId = payload.entryId
      if (typeof entryId !== 'string' || entryId === '') {
        return { status: 400, body: { ok: false, error: '缺少 entryId' } }
      }
      const acted =
        route === '/approve' ? await approveNomination(entryId) : await rejectNomination(entryId)
      if (!acted) return { status: 404, body: { ok: false, error: '没有这条待批提名' } }
      // 批准/否决后必须重建：GLOBAL 的收录与否取决于提名表。
      await rebuildDerivedLayers()
      return { status: 200, body: { ok: true, entryId } }
    }

    if (route === '/rebuild') {
      if (method !== 'POST') {
        return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      }
      const stats = await rebuildDerivedLayers()
      return { status: 200, body: { ok: true, ...stats } }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⭐⭐ **封面删改通道（人侧）**（决策 114）
    //
    // 🔴 **与 `memj_promote` 工具调的是同一份实现**（`edit.ts`）——
    //    刻意**不在这里重写一遍**：本项目吃过"多副本必然漂移"的亏。
    //    ⇒ 人侧只是"多一个入口"，逻辑一模一样。
    //
    // ⚠️ 人侧**可以做的事比工具侧更多**：工具侧删除类操作有硬校验
    //    （不级联删），这里同样走那套校验——**两侧安全底线一致**。
    // ══════════════════════════════════════════════════════════════════════
    if (route === '/edit') {
      if (method !== 'POST') {
        return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      }
      let payload: {
        target?: string
        id?: string
        fields?: { title?: string; desc?: string; tags?: string[]; kind?: string }
        addThemes?: string[]
        removeThemes?: string[]
        moveTo?: string
        setGlobal?: boolean
        newId?: string
        // ⭐⭐ 决策 220：改某一节的书写规范（`target: 'sectionSpec'`）。
        section?: string
        spec?: string
        truncate?: boolean
      }
      try {
        payload = JSON.parse(rawBody) as typeof payload
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      const id = (payload.id ?? '').trim()
      if (id === '') return { status: 400, body: { ok: false, error: '缺少 id' } }

      let result
      switch (payload.target) {
        case 'entry':
          if (payload.fields !== undefined) {
            const rawKind = payload.fields.kind
            const kind = rawKind === undefined || rawKind === ''
              ? (rawKind === '' ? '' as const : undefined)
              : (isEntryKind(rawKind) ? rawKind : undefined)
            if (rawKind !== undefined && rawKind !== '' && kind === undefined) {
              return { status: 400, body: { ok: false, error: `kind 非法：${rawKind}` } }
            }
            result = await setEntryFields(id, {
              ...(payload.fields.title !== undefined ? { title: payload.fields.title } : {}),
              ...(payload.fields.desc !== undefined ? { desc: payload.fields.desc } : {}),
              ...(payload.fields.tags !== undefined ? { tags: payload.fields.tags } : {}),
              ...(kind !== undefined ? { kind } : {}),
            })
            break
          }
          if (payload.addThemes !== undefined || payload.removeThemes !== undefined) {
            result = await editEntryThemes(id, {
              ...(payload.addThemes !== undefined ? { add: payload.addThemes } : {}),
              ...(payload.removeThemes !== undefined ? { remove: payload.removeThemes } : {}),
            })
            break
          }
          if (payload.moveTo !== undefined) {
            result = await moveEntry(id, payload.moveTo)
            break
          }
          if (payload.setGlobal !== undefined) {
            // ⭐ **人侧直接生效**（决策 116）：人本来就是审批者，勾选即批准。
            //    ⚠️ LLM 侧（`memj_promote`）仍只登记提名，**不能自己批准**。
            result = await setEntryGlobal(id, payload.setGlobal, 'human')
            break
          }
          return { status: 400, body: { ok: false, error: 'entry 操作需要 fields / addThemes / removeThemes / moveTo / setGlobal 之一' } }
        case 'deleteEntry':
          result = await deleteEntry(id)
          break
        // ⭐⭐ **归档 / 恢复**（决策 133）——**只在这里有入口**：
        //    没有任何 LLM 工具能归档 ⇒ "归档"是**纯人侧的治理动作**（用户裁定 ③）。
        //    ⚠️ 实现仍在 `edit.ts`（与其它封面改动同一份），这里只是入口。
        case 'archiveEntry':
          result = await archiveEntry(id)
          break
        case 'unarchiveEntry':
          result = await unarchiveEntry(id)
          break
        case 'archiveProject':
          result = await archiveProject(id)
          break
        case 'unarchiveProject':
          result = await unarchiveProject(id)
          break
        case 'projectDesc':
          result = await setProjectDesc(id, payload.fields?.desc ?? '')
          break
        // ⭐ 决策 115：项目的显示名 + 描述（**改名不改 id**）。
        case 'projectFields':
          result = await setProjectFields(id, {
            ...(payload.fields?.title !== undefined ? { title: payload.fields.title } : {}),
            ...(payload.fields?.desc !== undefined ? { desc: payload.fields.desc } : {}),
          })
          break
        // ⭐⭐⭐ **改某一节的书写规范**（决策 220，2026-10-12 用户要求）——
        //    入口在项目详情页每个规范块上的「编辑」按钮。
        //    ⚠️ 与其它 target 不同，它**不走 `fields`**：改的是 `## 节名` 下那个
        //       ```memj:spec 围栏块（块内文字 + 起始行的 `truncate` 标记），
        //       而那两个值**必须一起给**（分开给会出现"只改了文字、截断标记还是旧的"这种
        //       半套状态，而页面上是一次表单提交）。
        case 'sectionSpec':
          if (typeof payload.section !== 'string' || payload.section.trim() === '') {
            return { status: 400, body: { ok: false, error: '缺少 section（要改哪一节）。' } }
          }
          if (typeof payload.spec !== 'string') {
            return { status: 400, body: { ok: false, error: '缺少 spec（规范正文）。' } }
          }
          // 🔴 **决策 223：不再收 `truncate`**（归档规则已改成规范里的自然语言）。
          result = await setSectionSpec(id, payload.section, payload.spec)
          break
        case 'renameProject':
          result = await renameProject(id, payload.newId ?? '')
          break
        case 'deleteProject':
          result = await deleteProject(id)
          break
        case 'themeDesc':
          result = await setThemeDesc(id, payload.fields?.desc ?? '')
          break
        // ⭐ 决策 115：主题的显示名 + 描述（**改名不改 id**）。
        case 'themeFields':
          result = await setThemeFields(id, {
            ...(payload.fields?.title !== undefined ? { title: payload.fields.title } : {}),
            ...(payload.fields?.desc !== undefined ? { desc: payload.fields.desc } : {}),
          })
          break
        case 'renameTheme':
          result = await renameTheme(id, payload.newId ?? '')
          break
        case 'deleteTheme':
          result = await deleteTheme(id)
          break
        default:
          return {
            status: 400,
            body: {
              ok: false,
              error:
                '`target` 必须是：entry / deleteEntry / archiveEntry / unarchiveEntry / ' +
                'projectFields / projectDesc / sectionSpec / renameProject / deleteProject / archiveProject / ' +
                'unarchiveProject / themeFields / themeDesc / renameTheme / deleteTheme。',
            },
          }
      }
      // ⚠️ `EditResult` 自带 `ok`，不要再写一遍（TS2783 重复键）。
      if (!result.ok) return { status: 400, body: result }
      return { status: 200, body: result }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⭐ 设置（§8.8 / 决策 97）——**只有人能调**，不在任何 LLM 工具里
    //
    // 🔴 边界：只读写 `- id: dsh-memj` 的 `config` 段下**本面板管的那几个键**；
    //    保留 patch 文件里的注释与其余内容（用 `parseDocument`，见 settings.ts）。
    // ══════════════════════════════════════════════════════════════════════
    // ⭐⭐ 英文召回索引「检查并补全」（用户 2026-09-26 要求）：
    //    人侧手动按一下 ⇒ 自动体检索引，有问题就地补全。
    //
    // 🔴 **判据与启动兜底同源**（都走 `checkIndex`）——本项目铁律：同一判据只能有一份实现。
    // ⚠️ `en-index` 只需要一个 `ctx.get('llm')` ⇒ 这里把 `getService` **投影成 ctx 形状**
    //    传进去，**不把整个 `ctx` 漏进 API 层**（保持 `ApiDeps` 那条窄边界）。
    // ⚠️ 这是**写操作**（可能触发翻译、改索引）⇒ 只接受 POST。
    if (route === '/index-check') {
      if (method !== 'POST') {
        return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      }
      let force = false
      try {
        const body = rawBody.trim() === '' ? {} : (JSON.parse(rawBody) as { force?: unknown })
        force = body.force === true
      } catch {
        /* 空体/坏体都当"非强制" —— 检查本身是安全的只读+按需补全 */
      }
      try {
        const fakeCtx = { get: (n: string) => deps.getService?.(n) }
        const r = await checkAndRepair({
          ctx: fakeCtx as never,
          config: deps.config,
          force,
        })
        return { status: 200, body: { ok: true, ...r } }
      } catch (err) {
        return { status: 500, body: { ok: false, error: err instanceof Error ? err.message : String(err) } }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // ⭐⭐⭐ 提示词（本次新增）：清单 / 单条 / 保存 / 恢复默认 / 历史
    //
    // 🔴 **为什么字段这么全**：用户要求每条都要说清
    //    "干什么 / 属于谁 / 以什么方式注入 / 是否破缓存 / 写在哪个文件 / 是否热生效" ——
    //    这些**全部由服务端回结构化条目**（本项目判据：能给人看的列表必须由
    //    服务端回结构化条目，不要让前端拿 id 去拼）。
    // ==================================================================
    if (route === '/prompts') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      const items = PROMPT_SPECS.map((s) => ({
        key: s.key,
        zone: s.zone,
        purpose: s.purpose,
        owner: s.owner,
        injectMode: s.injectMode,
        breaksCache: s.breaksCache,
        sourceFile: s.sourceFile,
        hotReload: s.hotReload,
        editable: s.editable,
        readonlyWhy: s.readonlyWhy ?? '',
        checks: s.checks.map((c) => ({
          kind: c.kind,
          max: c.kind === 'maxChars' ? c.max : 0,
          why: c.kind === 'maxChars' ? c.why : '',
          // ⭐ 插槽校验要把它要求的插槽名回给前端（页面据此显示"必须保留哪些"）。
          tokens: c.kind === 'slots' ? [...c.tokens] : [],
        })),
        overridden: hasOverride(s.key),
        textLen: promptCurrent(s.key).length,
        // ⭐⭐ 写回相关（2026-10-12 新增）：页面据此决定「写回」按钮是否可用、以及显示三态。
        //    ⚠️ 只有 `editable: true` 且 `sourceConst` 非空才可写回
        //      （参数/输出 schema 在源码里没有对应常量）。
        canWriteBack: s.editable === true && (s.sourceConst ?? '') !== '',
        writeBackState: s.editable === true ? writeBackState(s.key) : '',
        sourceConst: s.sourceConst ?? '',
        // ⭐⭐⭐ **工具条目的"部位"**（2026-10-12 新增）——前端据此把同一工具的 3 条
        //   **折成一张卡**（用户要求"该合并的合并"）。
        //   ⚠️ 非工具条目回空串。
        part: catalogOf(s.key)?.part ?? '',
      }))
      // ⭐⭐ **分组说明也回给前端**（不只是 id）——本项目判据：
      //    **能给人看的列表必须由服务端回结构化条目**，不让前端自己维护一份说明。
      const groups = Object.entries(PROMPT_GROUPS)
        .map(([id, g]) => ({ id, title: g.title, about: g.about, order: g.order }))
        .sort((a, b) => a.order - b.order)
      return {
        status: 200,
        body: { ok: true, items, groups, overridesPath: promptOverridesPath() },
      }
    }

    // 取**某一条的当前生效文本 + 默认文本**（编辑框要同时显示两者，便于"看改了什么"）。
    if (route === '/prompt') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      const key = params.get('key') ?? ''
      const spec = specOf(key)
      if (spec === undefined) return { status: 404, body: { ok: false, error: `未知的提示词键：${key}` } }
      const d = await readPromptDetail(key)
      return {
        status: 200,
        body: {
          ok: true,
          key,
          current: d.current,
          defaultText: d.defaultText,
          overridden: d.overridden,
          updatedAt: d.updatedAt,
          history: d.history,
          readonlyWhy: spec.readonlyWhy ?? '',
        },
      }
    }

    // 保存一条覆盖值（**校验在前面**：不过则不写盘）。
    if (route === '/prompt/save') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let key = ''
      let text = ''
      try {
        const body = JSON.parse(rawBody) as { key?: unknown; text?: unknown }
        key = typeof body.key === 'string' ? body.key : ''
        text = typeof body.text === 'string' ? body.text : ''
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      const r = await savePromptOverride(key, text)
      return { status: r.ok ? 200 : 400, body: { ok: r.ok, errors: r.errors, saved: r.saved, backupPath: r.backupPath ?? '' } }
    }

    // ⭐⭐⭐ 写回源码：把当前生效文本固化进 `src/*.ts`（2026-10-12 新增）。
    //
    // 🔴 **它不改变运行时行为**：运行期永远读覆盖层 ⇒ 写回**不需要重启就已"生效"**
    //   （本来就在生效）。它改的是**归属**——从库里的临时覆盖变成源码里的正式默认值。
    //   ⚠️ 唯一例外是命令描述（`hotReload: 'restart'`）：它本来就要重启才生效。
    // ⚠️ **保留覆盖项**（用户裁定）⇒ 页面要靠三态显示让"写回做过没有"可见。
    if (route === '/prompt/writeback') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let keys: string[] = []
      try {
        const body = JSON.parse(rawBody) as { keys?: unknown; key?: unknown }
        // 允许传单个 key（`key`）或一批（`keys`）——前者是"只写回这一条"的常用形态。
        if (typeof body.key === 'string' && body.key !== '') keys = [body.key]
        else if (Array.isArray(body.keys)) keys = body.keys.filter((k): k is string => typeof k === 'string')
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      if (keys.length === 0) return { status: 400, body: { ok: false, error: '没有给要写回的 key' } }
      const unknown = keys.filter((k) => specOf(k) === undefined)
      if (unknown.length > 0) {
        return { status: 404, body: { ok: false, error: `未知的提示词键：${unknown.join('、')}` } }
      }
      const r = await writeBackToSource(keys)
      return { status: r.ok ? 200 : 400, body: { ok: r.ok, items: r.items, filesChanged: r.filesChanged, summary: r.summary } }
    }

    // 恢复默认（删掉覆盖项）。
    if (route === '/prompt/reset') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let key = ''
      try {
        key = (JSON.parse(rawBody) as { key?: unknown }).key as string ?? ''
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      if (typeof key !== 'string' || specOf(key) === undefined) {
        return { status: 404, body: { ok: false, error: `未知的提示词键：${String(key)}` } }
      }
      const r = await resetPromptOverride(key)
      return { status: r.ok ? 200 : 400, body: { ok: r.ok, errors: r.errors, saved: r.saved } }
    }

    // 读某一版历史（回退用）。
    if (route === '/prompt/history') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      const key = params.get('key') ?? ''
      const file = params.get('file') ?? ''
      const text = await readPromptHistory(file)
      if (text === undefined) return { status: 404, body: { ok: false, error: '读不到该历史版本' } }
      return { status: 200, body: { ok: true, key, file, text } }
    }

    // ⭐⭐ **回退到某一版历史**（用户要求"备份回退"）。
    //    🔴 **走与保存同一条路径**（含校验 + 备份）—— 历史文本是过去写的，
    //       而校验规则可能已变严；直接写覆盖表会绕过闸门（本项目判据：回退 = 一次保存）。
    if (route === '/prompt/restore') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let key = ''
      let file = ''
      try {
        const body = JSON.parse(rawBody) as { key?: unknown; file?: unknown }
        key = typeof body.key === 'string' ? body.key : ''
        file = typeof body.file === 'string' ? body.file : ''
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      if (specOf(key) === undefined) return { status: 404, body: { ok: false, error: `未知的提示词键：${key}` } }
      const r = await restorePromptHistory(key, file)
      return { status: r.ok ? 200 : 400, body: { ok: r.ok, errors: r.errors, saved: r.saved, backupPath: r.backupPath ?? '' } }
    }

    // ══════════════════════════════════════════════════════════════════
    // ⭐⭐⭐ **交接文档模板**（决策 204 / 205）
    //
    // 🔴🔴 **路由注册是【两份清单】**：加了这里的分支，**必须**同时去
    //    `index.ts` 的注册数组里加一行 —— 漏了 ⇒ 请求落到 SPA 兜底、
    //    返回 **HTML**，前端 `JSON.parse` 报错，而**服务端毫无异常**。
    //    ⚠️ 本项目已因此踩过三次（`/archived`、`/backup/*`、`/prompts`）。
    // ══════════════════════════════════════════════════════════════════

    // 列出全部模板（含内置 default）+ 每个模板的合法性。
    if (route === '/templates') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      const list = await listTemplates()
      const items = list.map((t) => ({
        id: t.id,
        title: t.title,
        sectionCount: t.sections.length,
        // 🔴 决策 223：不再回 `truncate`（归档规则已改成 `desc` 里的自然语言）。
        sections: t.sections.map((s) => ({ name: s.name, desc: s.desc })),
        // ⭐ 内置的 default **不可删**（它是回落目标）。
        deletable: t.id !== 'default',
        errors: validateTemplate(t),
        // ⭐⭐ 2026-10-05：**提醒**与**错误**分开返回（错误拦保存、提醒只告知）。
        warnings: templateWarnings(t),
      }))
      return { status: 200, body: { ok: true, items, dir: templatesDir() } }
    }

    /**
     * ⭐⭐⭐ **知识类型词表**（`kind`）—— **唯一读取入口**。
     *
     * 🔴 **为什么要有这个端点**（决策 214）：收敛之前，这套词表在**七处各写一遍**
     * （`schema.ts` / `tools.ts` × 5 / 前端下拉 × 3 / placeholder × 2 / 提示词 × 2），
     * 而其中**两处前端下拉还互相不一致** —— 那正是"抄写多处"的必然结果。
     * ⇒ 前端**从这里取**，不再自己写一份。
     *
     * ⭐⭐ **决策 215：词表已变成运行期可配**（`<库根>/kinds.md`）⇒
     *    本端点回的是**当前生效的那份**（用户加的类型会出现在这里）。
     */
    if (route === '/kinds') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      return { status: 200, body: { ok: true, ...(await kindsPayload()) } }
    }

    /**
     * ⭐⭐ **保存整张类型表**（设置页的「保存」用）。
     *
     * ⚠️ **为什么是"整张表"而不是"加一条/改一条"**：顺序有意义（UI 下拉顺序），
     *    而"增/删/改/排序"四种操作对顺序的影响各不相同 ⇒
     *    **让前端提交最终形态**是最不容易错的做法（与模板保存同一取向）。
     */
    if (route === '/kind/save') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let defs: KindDef[] | undefined
      try {
        const body = JSON.parse(rawBody) as { items?: unknown }
        defs = normalizeKindDefs(body.items)
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      if (defs === undefined) return { status: 400, body: { ok: false, error: '类型表形状不合法（缺 items 数组）' } }
      const errs = await saveKinds(defs)
      if (errs.length > 0) return { status: 400, body: { ok: false, errors: errs } }
      // ⭐⭐ **保存成功后立即刷新进程内词表** —— 否则"新类型"要等重启才对读侧生效
      //     （写盘只是持久化；判定与渲染用的是进程内那份，见 `schema.ts` 的 `setCurrentKindDefs`）。
      setCurrentKindDefs(defs)
      return { status: 200, body: { ok: true, errors: [], ...(await kindsPayload()) } }
    }

    /**
     * ⭐⭐⭐ **保存【一条】类型**（2026-10-05 用户裁定新增）—— 设置页的单条「保存」用它。
     *
     * ── 为什么不复用 `/kind/save`（整表）──────────────────────────────────────
     * 用户把界面从"全部展开 + 一个总保存"改成"**收起列表 + 每条各自保存**"
     * ⇒ 单条保存**不该**要求前端先拼出整张表（那样很容易把别条未保存的改动一起带上去）。
     *
     * ── 语义 ────────────────────────────────────────────────────────────────
     * · **按 `id` 找**：找到 ⇒ **就地替换那一条**（**位置不动**）；
     * · 找不到 ⇒ **插到最前面**（用户裁定：*"始终插最前"*）；
     * · ⚠️ **只动这一条**，别条一概不碰（这正是"不提交整表"的意义）。
     *
     * 🔴 **顺序是由用户控制的**（= UI 下拉顺序）⇒ 所以"新增插最前"是**明确的产品决定**，
     *    不是实现细节。想做排序就得靠"删了重加"或整表保存。
     *
     * ⚠️ **仍走同一套校验**（`validateKinds`）—— 它校验**整张合并后的表**，
     *    因为"内置项不能少 / id 不能重复"这类规则**只有看全表才判得了**。
     */
    if (route === '/kind/upsert') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let one: KindDef | undefined
      try {
        const body = JSON.parse(rawBody) as { item?: unknown }
        one = normalizeOneKindDef(body.item)
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      if (one === undefined) return { status: 400, body: { ok: false, error: '缺少 item（单条类型定义）' } }

      const cur = await loadKinds()
      const at = cur.findIndex((d) => d.id === one.id)
      const next = at >= 0
        ? cur.map((d, i) => (i === at ? one : d))       // 找到 ⇒ **就地替换**（位置不动）
        : [one, ...cur]                                  // 没有 ⇒ **插到最前**（用户裁定）
      const errs = await saveKinds(next)
      if (errs.length > 0) return { status: 400, body: { ok: false, errors: errs } }
      // ⭐ 与 `/kind/save` 一样：**保存成功后立即刷新进程内词表**（读侧要当场生效）。
      setCurrentKindDefs(next)
      return { status: 200, body: { ok: true, errors: [], ...(await kindsPayload()) } }
    }

    /**
     * ⭐⭐ **删除一个类型**（**有引用就拒绝**，用户裁定的保护）。
     *
     * 🔴 **为什么拒绝而不是"删了顺带把引用清成未分类"**：那要扫全库改几百个封面文件、
     *    **不可逆**（原 kind 再也找不回）。与 `memj_promote` 的「只允许删空容器」同一纪律。
     */
    if (route === '/kind/delete') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let id = ''
      try {
        const body = JSON.parse(rawBody) as { id?: unknown }
        id = typeof body.id === 'string' ? body.id.trim() : ''
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      if (id === '') return { status: 400, body: { ok: false, error: '缺少 id' } }
      const defs = await loadKinds()
      /** ⚠️ 现数引用 —— 用 `includeHistory: true`，别把 `history` 自己漏算。 */
      const scanned = await scanLibrary({ includeHistory: true })
      const used = scanned.covers.filter((c) => c.cover.kind === id).length
      const why = deleteKindBlockReason(id, defs, used)
      if (why !== '') return { status: 400, body: { ok: false, errors: [why] } }
      const errs = await saveKinds(defs.filter((d) => d.id !== id))
      if (errs.length > 0) return { status: 400, body: { ok: false, errors: errs } }
      setCurrentKindDefs(await loadKinds())
      return { status: 200, body: { ok: true, errors: [], ...(await kindsPayload()) } }
    }

    /** 保存一份模板（**校验在前，不过不写盘**）。 */
    if (route === '/template/save') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let t: Template | undefined
      try {
        const body = JSON.parse(rawBody) as { template?: unknown }
        t = normalizeTemplate(body.template)
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      if (t === undefined) return { status: 400, body: { ok: false, error: '模板形状不合法（缺 id 或 sections 全空）' } }
      // ⭐⭐ 决策 208：`default` **现在可以保存**（用户可编辑默认模板）。
      //    ⚠️ 组件包办"落盘后 loadDefaultTemplate() 会读到它" ⇒ 这里只放开闸门，不加特判。
      const errs = await saveTemplate(t)
      // ⭐⭐ 2026-10-05：保存**成功**时也要把提醒带回去（`ok: true` + `warnings`）——
      //    否则"太长了"这条提示永远到不了人眼前。
      return {
        status: errs.length === 0 ? 200 : 400,
        body: {
          ok: errs.length === 0,
          errors: errs,
          warnings: errs.length === 0 ? templateWarnings(t) : [],
        },
      }
    }

    // 删除一份模板（⚠️ **不影响任何已有文档**——文档记着自己的节名）。
    if (route === '/template/delete') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let id = ''
      try {
        id = String((JSON.parse(rawBody) as { id?: unknown }).id ?? '')
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      if (id === 'default') return { status: 400, body: { ok: false, error: '内置模板 default 不可删除。' } }
      const ok = await deleteTemplate(id)
      return { status: ok ? 200 : 404, body: { ok, error: ok ? '' : `模板 \`${id}\` 不存在。` } }
    }

    // ⭐⭐ 英文召回索引（设计文档 §9.2）：**翻译模型下拉框的数据源**。
    //    ⚠️ 走 `deps.getService('llm')`（API 层不直接持有 `ctx`，见 `ApiDeps` 的注释）；
    //    单个 provider 取列表失败**不影响其余**（降级成一个空模型列表）。
    if (route === '/models') {      if (method !== 'GET') {
        return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      }
      try {
        const llm = deps.getService?.('llm') as
          | {
              listProviders?: () => Array<{ id: string; name?: string }>
              listModels?: (p: string) => Promise<Array<{ id: string; name?: string }>>
            }
          | undefined
        const providers = llm?.listProviders?.() ?? []
        const out: Array<{ provider: string; name: string; models: Array<{ id: string; name: string }> }> = []
        for (const p of providers) {
          let models: Array<{ id: string; name: string }> = []
          try {
            const list = (await llm?.listModels?.(p.id)) ?? []
            models = list.map((m) => ({ id: m.id, name: m.name ?? m.id }))
          } catch {
            /* 单个 provider 失败不影响其余 */
          }
          out.push({ provider: p.id, name: p.name ?? p.id, models })
        }
        return { status: 200, body: { ok: true, providers: out } }
      } catch (err) {
        return { status: 500, body: { ok: false, error: err instanceof Error ? err.message : String(err) } }
      }
    }

    if (route === '/jev-status') {
      if (method !== 'GET') {
        return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      }
      try {
        // ⭐⭐⭐ 2026-10-07 多 provider 化；**回一份完整清单**（每个 provider 的
        //    凭据状态与派生凭据名），配置面据此一次画完，不必逐条再问。
        //    🔴 **绝不回值** —— 每条只回 `describe` 的三个事实
        //       （`CredentialInfo` 类型里没有放值的槽位）。
        const providers = decisionProvidersOf(deps.config)
        const rows = []
        for (const p of providers) {
          const keyRef = deriveDecisionKeyRef(p.id)
          const meta = await describeCredential(deps, keyRef)
          rows.push({
            id: p.id,
            displayName: p.displayName,
            endpoint: p.endpoint,
            models: p.models,
            // ⭐ 凭据名**由 id 派生**（与官方同规则）—— 用户不必知道它，但排障要能看见。
            keyRef,
            credential: meta,
            ready: meta?.configured === true,
          })
        }
        // ⭐ 两条通路各自**选中**了哪条（回 `provider/model`，前端直接显示）。
        const aPick = activeDecisionOf(deps.config)
        const sPick = scoreDecisionOf(deps.config)
        return {
          status: 200,
          body: {
            ok: true,
            providers: rows,
            // ⚠️ 列表为空 ⇒ 前端要显示引导（"加一个 provider"），而不是空白。
            empty: rows.length === 0,
            activeInjectPick: aPick.provider === '' ? '' : `${aPick.provider}/${aPick.model}`,
            hotScorePick: sPick.provider === '' ? '' : `${sPick.provider}/${sPick.model}`,
            reason: rows.length === 0
              ? '还没有配置任何决策模型 provider ⇒ 选了 jev 通路会在运行期调用失败。请先添加一个。'
              : '',
          }
        }
      } catch (err) {
        return { status: 500, body: { ok: false, error: err instanceof Error ? err.message : String(err) } }
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⭐⭐⭐ **决策模型（JEV）配置**（用户 2026-10-07 要求：在前端配，别在环境里配）
    //
    // 用户原话：*"我还是需要能够在 dsh 前端去配置决策模型的。而不是这样，
    //   直接在环境里直连。哪怕是在插件的前端里面去配置。"*
    // 以及：*"就也应该像 dsh 官方的模型设置一样，而且可以配置多个决策型模型。
    //   有不同的 provider，和对应的模型才对啊。"*
    //
    // 🔴 **它与 `/settings` 分开的理由**：这里有一件事 `/settings` **做不到** ——
    //    **写密钥**。`/settings` 只改 `cordis.patch.yml` 的**配置值**，
    //    而密钥必须进**凭据 seam**（只写、不回显、不落 patch 文件）。
    //    ⭐ 且"测试连接"要**发一次真实请求**，那也不是"改配置"的语义。
    //
    // 🔴🔴 **凭据名由 provider id 派生**（`deriveDecisionKeyRef`，与官方同规则）——
    //    **页面从不询问环境变量名**（官方 README 原话）。
    //    ⇒ 这三个端点都**收 provider id**，不收凭据名。
    // ══════════════════════════════════════════════════════════════════════

    // ── ① 保存密钥（**只写**：收下值，存进 seam，不回显任何东西）──
    if (route === '/jev/key') {
      if (method !== 'POST') {
        return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      }
      let body: { key?: unknown; providerId?: unknown } = {}
      try {
        body = JSON.parse(rawBody === '' ? '{}' : rawBody) as { key?: unknown; providerId?: unknown }
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON。' } }
      }
      const value = typeof body.key === 'string' ? body.key : ''
      const pid = typeof body.providerId === 'string' ? body.providerId.trim() : ''
      if (pid === '') {
        return { status: 400, body: { ok: false, error: '缺少 providerId（密钥要存到某个 provider 名下）。' } }
      }
      // ⚠️ provider 必须**真的存在**（否则会往一个谁也不用的名字下存密钥 ⇒ 静默无效）。
      if (!decisionProvidersOf(deps.config).some((p) => p.id === pid)) {
        return {
          status: 400,
          body: { ok: false, error: `找不到 provider「${pid}」—— 请先保存 provider 配置，再存它的密钥。` },
        }
      }
      // ⚠️ **空值一律拒绝**（想清空请用「清除」那个动作 —— 与 seam 的 set/unset 分工一致）。
      if (value.trim() === '') {
        return { status: 400, body: { ok: false, error: '密钥不能为空。要清除请点「清除密钥」。' } }
      }
      const keyRef = deriveDecisionKeyRef(pid)
      const r = await setCredential(deps, keyRef, value)
      if (!r.ok) return { status: 400, body: { ok: false, error: r.message } }
      // ⭐ 回执**只说成了**，不回值、不回长度、不回前几位（本项目已发生过密钥外泄）。
      return {
        status: 200,
        body: { ok: true, message: `「${pid}」的密钥已保存到凭据「${keyRef}」（只写，永不回显）。` },
      }
    }

    // ── ② 清除密钥（走 seam 的 unset；缺失即 no-op）──
    if (route === '/jev/key/clear') {
      if (method !== 'POST') {
        return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      }
      let pid = ''
      try {
        pid = String((JSON.parse(rawBody === '' ? '{}' : rawBody) as { providerId?: unknown }).providerId ?? '').trim()
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON。' } }
      }
      if (pid === '') {
        return { status: 400, body: { ok: false, error: '缺少 providerId。' } }
      }
      const keyRef = deriveDecisionKeyRef(pid)
      const r = await unsetCredential(deps, keyRef)
      if (!r.ok) return { status: 400, body: { ok: false, error: r.message } }
      return { status: 200, body: { ok: true, message: `已清除「${pid}」的凭据「${keyRef}」。` } }
    }

    // ── ③ 测试连接（真发一次最小请求；**回状态与耗时，绝不回密钥**）──
    if (route === '/jev/test') {
      if (method !== 'POST') {
        return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      }
      let pid = ''
      let model = ''
      try {
        const b = JSON.parse(rawBody === '' ? '{}' : rawBody) as { providerId?: unknown; model?: unknown }
        pid = String(b.providerId ?? '').trim()
        model = String(b.model ?? '').trim()
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON。' } }
      }
      if (pid === '') {
        return { status: 400, body: { ok: false, error: '缺少 providerId（要测哪一条？）。' } }
      }
      const r = await testJevConnection(deps, pid, model)
      // ⚠️ 连不上**不是服务器错误**（是用户配置问题）⇒ 回 200 + `ok:false`，
      //    让界面把它当"测试结果"显示，而不是当"接口挂了"。
      return { status: 200, body: r }
    }

    if (route === '/settings') {
      if (method === 'GET') {
        const r = await readSettings(deps.baseUrl, deps.config, deps.pluginId)
        // ⭐⭐⭐ **回显必须"磁盘优先"**（2026-10-07 修的真 bug）：
        //    `r.config` 是 **`apply()` 那一刻**的进程内配置，`writeSetting` 只改文件、
        //    不回头更新它 ⇒ 存完立刻拉 `/settings` 会拿到**旧值**
        //    ⇒ 面板把控件填回旧值 ⇒ 用户看到「存完就弹回默认」，
        //    而且**再存一次会把旧值写回磁盘**（真丢数据，已实测复现）。
        //    ⚠️ `effectiveConfig` 只覆盖**磁盘上显式写了**的键，
        //      其余仍走 `r.config`（保住"旧键回落生效值"那些键的回显）。
        const cfg = effectiveConfig(r)
        return {
          status: 200,
          body: {
            ok: true,
            // ⭐ 只透出**本面板管的项**——不把整份配置倒给前端。
            themeCreation: cfg.themeCreation,
            // ⭐ 压缩阈值（决策 127 的触发条件；用户要求做成旋钮）。
            progressCharsWarn: cfg.progressCharsWarn,
            // ⭐⭐ 截断目标（决策 136）：超过阈值后自动截到 ≤ 本值。
            progressCharsKeep: cfg.progressCharsKeep,
            // ⭐ git 版本维护开关（决策 135；台账开关已在决策 136 删除）。
            backupGit: cfg.backupGit,
            // ⭐⭐ 热知识（热知识方案 §10）——预算类旋钮放主设置面板（用户裁定）。
            hotInject: cfg.hotInject,
            hotInjectRatio: cfg.hotInjectRatio,
            hotCharsPerToken: cfg.hotCharsPerToken,
            hotBudgetCharsFallback: cfg.hotBudgetCharsFallback,
            hotFullWarnChars: cfg.hotFullWarnChars,
            hotSessionKeep: cfg.hotSessionKeep,
            // ⭐⭐⭐ 知识评分（决策 177；属**热知识注入**板块）
            hotScoreOnTurnEnd: cfg.hotScoreOnTurnEnd,
            hotScoreThreshold: cfg.hotScoreThreshold,
            hotScoreWindowHours: cfg.hotScoreWindowHours,
            hotScoreTopN: cfg.hotScoreTopN,
            hotScoreGateMinScore: cfg.hotScoreGateMinScore,
            hotScoreGateLastTurn: cfg.hotScoreGateLastTurn,
            hotScoreMaxPicks: cfg.hotScoreMaxPicks,
            hotScoreMinChars: cfg.hotScoreMinChars,
            hotScoreChannel: cfg.hotScoreChannel,
            hotScoreModel: cfg.hotScoreModel,
            hotScoreSubagentProvider: cfg.hotScoreSubagentProvider,
            hotScoreSubagentModel: cfg.hotScoreSubagentModel,
            hotScoreTimeoutMs: cfg.hotScoreTimeoutMs,
            // ⭐⭐⭐ 上下文占用率上报（决策 226；2026-10-12）
            contextReportOnTurnEnd: cfg.contextReportOnTurnEnd,
            contextReportMinPercent: cfg.contextReportMinPercent,
            contextReportStepPercent: cfg.contextReportStepPercent,
            // ⭐⭐ 英文召回索引（设计文档 §9）：翻译模型 / 模板 / 并发 / 诊断
            enIndex: cfg.enIndex,
            enIndexDiag: cfg.enIndexDiag,
            translateProvider: cfg.translateProvider,
            translateModel: cfg.translateModel,
            translateTemplate: cfg.translateTemplate,
            translateConcurrency: cfg.translateConcurrency,
            translateRetries: cfg.translateRetries,
            translateTimeoutMs: cfg.translateTimeoutMs,
            translateMaxTokens: cfg.translateMaxTokens,
            // ⭐⭐⭐ 标签规范化（决策 162）：裁决模型（B 层）。
            tagNormalizeProvider: cfg.tagNormalizeProvider,
            tagNormalizeModel: cfg.tagNormalizeModel,
            tagNormalizeTimeoutMs: cfg.tagNormalizeTimeoutMs,
            tagNormalizeMaxTokens: cfg.tagNormalizeMaxTokens,
            // ⭐ 决策 165：轮次结束有沉淀时**自动**跑（默认开）。
            tagNormalizeOnHandoff: cfg.tagNormalizeOnHandoff,
            // ⭐ 决策 168：裁决模型的思考等级（默认 off）。
            tagNormalizeReasoningEffort: cfg.tagNormalizeReasoningEffort,
            // ⭐⭐ 主动注入（设计文档 §10.1）：开关 / 通路 / 模型 / 范围 / 触发口径 / 阈值
            activeInject: cfg.activeInject,
            activeInjectChannel: cfg.activeInjectChannel,
            activeInjectModel: cfg.activeInjectModel,
            activeInjectScope: cfg.activeInjectScope,
            activeInjectJevNarrowScope: cfg.activeInjectJevNarrowScope,
            // ⭐⭐⭐ 决策模型（JEV）配置（用户 2026-10-07）——
            //    ⚠️ **前三项**是「决策模型配置」页要显示/编辑的；**密钥不在这里**
            //    （它走凭据 seam，只写、永不回显 ⇒ 只能从 `/jev-status` 拿"有没有"）。
            // ⭐⭐⭐ 决策模型（JEV）配置（用户 2026-10-07 多 provider 化）——
            //    ⚠️ **只回"生效列表"**（`decisionProvidersOf` 会把旧单 provider 的三条键
            //    回落成一条）⇒ 界面永远看到一份统一的 provider 列表，不必自己拼回落。
            decisionProviders: decisionProvidersOf(cfg),
            activeInjectDecisionPick: cfg.activeInjectDecisionPick,
            hotScoreDecisionPick: cfg.hotScoreDecisionPick,
            // ⚠️ 这三个旧键**继续透出**（只为排障/兼容：让人能看出"值是从哪回落的"）。
            activeInjectJevEndpoint: cfg.activeInjectJevEndpoint,
            activeInjectJevApiKeyEnv: cfg.activeInjectJevApiKeyEnv,
            // ⚠️ 这个旧键**继续透出**（只为排障/兼容：让人能看出"值是从哪回落的"）。
            jevModel: cfg.jevModel,
            activeInjectStrict: cfg.activeInjectStrict,
            activeInjectTopK: cfg.activeInjectTopK,
            // ⭐ 回显**生效值**（走回落函数）—— 旧键有值、新键没写时，
            //   面板要显示"实际在用的那个数"，而不是空白（否则用户一存就把回落值写没了）。
            //   ⚠️ 传 `cfg`（磁盘优先那份）而不是 `r.config`：新键刚存下去、
            //      进程内还没热重载时，回落函数**必须看见新键**，否则照样弹回旧值。
            activeInjectNeedMin: needMinOf(cfg),
            activeInjectItemMin: itemMinOf(cfg),
            activeInjectBand: cfg.activeInjectBand,
            activeInjectTimeoutMs: cfg.activeInjectTimeoutMs,
            activeInjectContextRounds: cfg.activeInjectContextRounds,
            activeInjectPoolMax: cfg.activeInjectPoolMax,
            activeInjectExplain: cfg.activeInjectExplain,
            activeInjectSearchIntentGate: cfg.activeInjectSearchIntentGate,
            activeInjectSearchIntentMin: cfg.activeInjectSearchIntentMin,
            activeInjectSufficientGate: cfg.activeInjectSufficientGate,
            activeInjectSufficientMin: cfg.activeInjectSufficientMin,
            // ⭐ 2026-09-27：新键（每 turn 最多**注入**几次）。
            //    ⚠️ 解析后回显（含旧键回落）—— 面板显示的是**真正生效的值**，
            //       而不是"新键写没写"（否则旧配置会显示成空白/0，让用户误以为丢了设置）。
            activeInjectMaxInjectionsPerTurn: maxInjectionsPerTurn(cfg),
            activeInjectReasoningMaxChars: cfg.activeInjectReasoningMaxChars,
            // ⭐⭐⭐ 预算与拆批（用户 2026-09-26 定稿方案）
            activeInjectBudget: cfg.activeInjectBudget,
            activeInjectBudgetTokens: cfg.activeInjectBudgetTokens,
            activeInjectContextTokens: cfg.activeInjectContextTokens,
            activeInjectConcurrency: cfg.activeInjectConcurrency,
            activeInjectChatWindowRatio: cfg.activeInjectChatWindowRatio,
            // ⚠️ 已作废（保留字段，见 config.ts）
            activeInjectPoolMin: cfg.activeInjectPoolMin,
            // ⭐⭐ 召回日志的"请求快照"档（B 档；默认关）。
            activeRecallLogRequest: cfg.activeRecallLogRequest,
            patchPath: r.patchPath,
            patchExists: r.patchExists,
            explicitKeys: r.explicitKeys,
            patchReload: r.patchReload,
            // ⚠️ 如实告知"改了要不要重启"（§8.8.4）——不能假装一定生效。
            needsRestart: r.patchReload !== 'live',
            error: r.error,
          },
        }
      }
      if (method !== 'POST') {
        return { status: 405, body: { ok: false, error: '该接口只接受 GET / POST' } }
      }
      let payload: {
        themeCreation?: unknown
        progressCharsWarn?: unknown
        progressCharsKeep?: unknown
        backupGit?: unknown
        // ⭐⭐ 热知识（热知识方案 §10）
        hotInject?: unknown
        hotInjectRatio?: unknown
        hotCharsPerToken?: unknown
        hotBudgetCharsFallback?: unknown
        hotFullWarnChars?: unknown
        hotSessionKeep?: unknown
        // ⭐⭐⭐ 知识评分（决策 177）
        hotScoreOnTurnEnd?: unknown
        hotScoreThreshold?: unknown
        hotScoreWindowHours?: unknown
        hotScoreTopN?: unknown
        hotScoreGateMinScore?: unknown
        hotScoreGateLastTurn?: unknown
        hotScoreMaxPicks?: unknown
        hotScoreMinChars?: unknown
        hotScoreChannel?: unknown
        hotScoreModel?: unknown
        hotScoreSubagentProvider?: unknown
        hotScoreSubagentModel?: unknown
        hotScoreTimeoutMs?: unknown
        // ⭐⭐ 英文召回索引（设计文档 §9）
        enIndex?: unknown
        enIndexDiag?: unknown
        translateProvider?: unknown
        translateModel?: unknown
        translateTemplate?: unknown
        translateConcurrency?: unknown
        translateRetries?: unknown
        translateTimeoutMs?: unknown
        translateMaxTokens?: unknown
        // ⭐⭐⭐ 标签规范化（决策 162）：裁决模型
        tagNormalizeProvider?: unknown
        tagNormalizeModel?: unknown
        // ⭐ 决策 165：轮次结束自动规范化开关
        tagNormalizeOnHandoff?: unknown
        // ⭐ 决策 168：裁决模型的思考等级
        tagNormalizeReasoningEffort?: unknown
        // ⭐⭐ 主动注入（设计文档 §10.1）
        activeInject?: unknown
        activeInjectChannel?: unknown
        activeInjectModel?: unknown
        activeInjectScope?: unknown
        activeInjectJevNarrowScope?: unknown
        // ⭐⭐⭐ 决策模型（2026-10-07 多 provider 化）。
        decisionProviders?: unknown
        activeInjectDecisionPick?: unknown
        hotScoreDecisionPick?: unknown
        activeInjectStrict?: unknown
        activeInjectTopK?: unknown
        activeInjectNeedMin?: unknown
        activeInjectItemMin?: unknown
        activeInjectBand?: unknown
        activeInjectTimeoutMs?: unknown
        activeInjectContextRounds?: unknown
        activeInjectPoolMax?: unknown
        activeInjectExplain?: unknown
        activeInjectSearchIntentGate?: unknown
        activeInjectSearchIntentMin?: unknown
        activeInjectSufficientGate?: unknown
        activeInjectSufficientMin?: unknown
        // ⭐ 2026-09-27：新键（每 turn 最多**注入**几次）。
        activeInjectMaxInjectionsPerTurn?: unknown
        activeInjectReasoningMaxChars?: unknown        // ⭐⭐⭐ 预算与裁剪
        activeInjectBudget?: unknown
        activeInjectBudgetTokens?: unknown
        activeInjectContextTokens?: unknown
        activeInjectConcurrency?: unknown
        activeInjectChatWindowRatio?: unknown
        activeInjectPoolMin?: unknown
        // ⭐⭐ 召回日志的"请求快照"档（B 档；2026-09-27）
        activeRecallLogRequest?: unknown
      }
      try {
        payload = JSON.parse(rawBody) as typeof payload
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }

      // ⭐⭐ **多个键都可选、逐项写入**（2026-09-20 扩展：原来只认 themeCreation）。
      //    🔴 为什么要改：设置卡片现在有多个控件，前端**一次提交全部值**——
      //       若还按"必须给 themeCreation"校验，用户只改阈值就会被拒。
      //    ⚠️ 但**至少要给一个**：空请求应当报错，而不是静默成功（那会让人以为存上了）。
      const wantsTheme = payload.themeCreation !== undefined
      const wantsWarn = payload.progressCharsWarn !== undefined
      const wantsKeep = payload.progressCharsKeep !== undefined
      const wantsGitAny = payload.backupGit !== undefined
      // ⭐⭐ 热知识（热知识方案 §10）
      const wantsHotInject = payload.hotInject !== undefined
      const wantsHotRatio = payload.hotInjectRatio !== undefined
      const wantsHotCpt = payload.hotCharsPerToken !== undefined
      const wantsHotBudget = payload.hotBudgetCharsFallback !== undefined
      const wantsHotFullWarn = payload.hotFullWarnChars !== undefined
      const wantsHotKeep = payload.hotSessionKeep !== undefined
      // ⭐⭐ 英文召回索引（设计文档 §9）
      const wantsEnIndex = payload.enIndex !== undefined
      const wantsEnDiag = payload.enIndexDiag !== undefined
      const wantsTrProvider = payload.translateProvider !== undefined
      const wantsTrModel = payload.translateModel !== undefined
      const wantsTrTemplate = payload.translateTemplate !== undefined
      const wantsTrConc = payload.translateConcurrency !== undefined
      const wantsTrRetries = payload.translateRetries !== undefined
      const wantsTrTimeout = payload.translateTimeoutMs !== undefined
      const wantsTrMaxTok = payload.translateMaxTokens !== undefined
      // ⭐⭐⭐ 知识评分（决策 177）：**10 个键**。
      //
      // 🔴 **为什么这里用"表驱动"而不是照抄十行 `const wantsX = …`**：
      //    本文件那处「至少给一个」的大条件（下面 `if (… && !wantsHotScore…)`）
      //    **历史上真出过一次事故**（第六十六批：加了写入块却漏了条件 ⇒ 面板保存 400，
      //    而 tsc 与既有单测**都照不到**）。
      //    ⇒ ⭐ 键一多，**手抄的落点就多、漏一个就静默坏**。
      //    表驱动把"10 个键"压成**一份清单**：想知道有没有漏，数一下这个数组就行。
      //    🔴 **判据**：数一下下面三个数组的元素个数 + 1（`hotScoreTimeoutMs`）
      //       是否等于 `settings.ts` 里 `hotScore*` 的键数 —— 不等就是漏了。
      //    ⚠️ 但它**只覆盖"机械的那部分"**（判断有没有给 + 写过没）；
      //       逐键的**类型/区间校验**仍在下面手写（那部分每键都不一样，无法表驱动）。
      const HOT_SCORE_BOOL_KEYS = ['hotScoreOnTurnEnd', 'hotScoreGateLastTurn'] as const
      const HOT_SCORE_NUM_KEYS = ['hotScoreThreshold', 'hotScoreWindowHours', 'hotScoreTopN', 'hotScoreMaxPicks', 'hotScoreGateMinScore', 'hotScoreMinChars'] as const
      // 🔴 **`hotScoreChannel` 必须在这份清单里**（2026-09-29 真踩到）：
      //    我重构模型键时把它从 `HOT_SCORE_STR_KEYS` 拿掉了，却**忘了它也是"要接受的键"**
      //    ⇒ 单独提交它被判"什么都没给" ⇒ **400**。
      //    ⭐ 这正是第六十六批那次事故的同族（加了键却漏进条件），
      //      而**这次是被 `test-web-api.mjs` 的逐键提交清单抓到的**（不是靠记性）。
      const HOT_SCORE_STR_KEYS = [
        'hotScoreChannel', 'hotScoreModel',
        'hotScoreSubagentProvider', 'hotScoreSubagentModel',
      ] as const
      /** 本次 payload 里出现的评分键（用于「至少给一个」与回执）。 */
      const hotScoreWanted = [
        ...HOT_SCORE_BOOL_KEYS, ...HOT_SCORE_NUM_KEYS, ...HOT_SCORE_STR_KEYS,
        'hotScoreTimeoutMs',
      ].filter((k) => (payload as Record<string, unknown>)[k] !== undefined)
      const wantsAnyHotScore = hotScoreWanted.length > 0
      // ⭐⭐⭐ 上下文占用率上报（决策 226；2026-10-12）——
      //    ⚠️ 与上面那组**键名不像但性质相同**：漏进这份"要接受的键"清单
      //    ⇒ 单独提交会被判"什么都没给" ⇒ **400**（本项目已踩过一次，见上方的注释）。
      const CONTEXT_REPORT_BOOL_KEYS = ['contextReportOnTurnEnd'] as const
      const CONTEXT_REPORT_NUM_KEYS = ['contextReportMinPercent', 'contextReportStepPercent'] as const
      const contextReportWanted = [
        ...CONTEXT_REPORT_BOOL_KEYS, ...CONTEXT_REPORT_NUM_KEYS,
      ].filter((k) => (payload as Record<string, unknown>)[k] !== undefined)
      const wantsAnyContextReport = contextReportWanted.length > 0
      // ⭐⭐ 主动注入（设计文档 §10.1）
      const wantsActive = payload.activeInject !== undefined
      const wantsActiveChannel = payload.activeInjectChannel !== undefined
      const wantsActiveModel = payload.activeInjectModel !== undefined
      const wantsActiveScope = payload.activeInjectScope !== undefined
      const wantsActiveJevNarrow = payload.activeInjectJevNarrowScope !== undefined
      // ⭐⭐⭐ 决策模型（2026-10-07 多 provider 化，用户要求）：
      //    provider 列表 + 两条通路各自的选集。⚠️ 旧的三个单 provider 键
      //    （endpoint / keyEnv / jevModel）**不再接受写入**（只读回落，见 `decisionProvidersOf`）。
      const wantsDecisionProviders = payload.decisionProviders !== undefined
      const wantsActiveDecisionPick = payload.activeInjectDecisionPick !== undefined
      const wantsHotScoreDecisionPick = payload.hotScoreDecisionPick !== undefined
      const wantsActiveStrict = payload.activeInjectStrict !== undefined
      const wantsActiveTopK = payload.activeInjectTopK !== undefined
      const wantsActiveNeedMin = payload.activeInjectNeedMin !== undefined
      const wantsActiveItemMin = payload.activeInjectItemMin !== undefined
      const wantsActiveBand = payload.activeInjectBand !== undefined
      const wantsActiveTimeout = payload.activeInjectTimeoutMs !== undefined
      const wantsActiveRounds = payload.activeInjectContextRounds !== undefined
      const wantsActivePool = payload.activeInjectPoolMax !== undefined
      const wantsActiveExplain = payload.activeInjectExplain !== undefined
      const wantsActiveIntentGate = payload.activeInjectSearchIntentGate !== undefined
      const wantsActiveIntentMin = payload.activeInjectSearchIntentMin !== undefined
      const wantsActiveSuffGate = payload.activeInjectSufficientGate !== undefined
      const wantsActiveSuffMin = payload.activeInjectSufficientMin !== undefined
      // ⭐ 2026-09-27：改名（每 turn 最多**注入**几次）。
      const wantsActiveInjections = payload.activeInjectMaxInjectionsPerTurn !== undefined
      const wantsActiveReasoningCap = payload.activeInjectReasoningMaxChars !== undefined      // ⭐⭐⭐ 预算与裁剪
      const wantsActiveBudget = payload.activeInjectBudget !== undefined
      const wantsActiveBudgetTok = payload.activeInjectBudgetTokens !== undefined
      const wantsActiveCtxTok = payload.activeInjectContextTokens !== undefined
      const wantsActiveConc = payload.activeInjectConcurrency !== undefined
      const wantsActiveChatRatio = payload.activeInjectChatWindowRatio !== undefined
      const wantsActivePoolMin = payload.activeInjectPoolMin !== undefined
      // ⭐⭐ 召回日志的"请求快照"档（B 档；2026-09-27）
      const wantsRecallLogRequest = payload.activeRecallLogRequest !== undefined
      // ⭐⭐⭐ 标签规范化（决策 162）：裁决模型。
      //    🔴 **必须同时在下面那个"至少给一个"的条件里** ——
      //       我第一版只加了写入块与**报错文案**、**漏了条件本身**
      //       ⇒ 只提交这两个键会被判"什么都没给"、返回 400。
      //       ⚠️ 是**端到端实测**（隔离实例上 POST settings）抓到的，
      //         而类型检查与单元测试**都照不到**（它们不跑那条条件）。
      const wantsTagProvider = payload.tagNormalizeProvider !== undefined
      const wantsTagModel = payload.tagNormalizeModel !== undefined
      // ⭐ 决策 165：自动规范化开关。
      //    🔴 **必须同时进下面那个"至少给一个"的条件** —— 上一批我加
      //       `tagNormalizeProvider` 时**只加了写入块与报错文案、漏了条件本身**
      //       ⇒ 单独提交那两个键会 400（是隔离实例实测抓到的）。
      //       ⚠️ 这次有专门的回归测试逐个键盯着（`test-web-api.mjs`）。
      const wantsTagAuto = payload.tagNormalizeOnHandoff !== undefined
      // ⭐ 决策 168：思考等级（受控枚举）。
      const wantsTagEffort = payload.tagNormalizeReasoningEffort !== undefined
      if (
        !wantsTheme && !wantsWarn && !wantsKeep && !wantsGitAny
        && !wantsHotInject && !wantsHotRatio && !wantsHotCpt && !wantsHotBudget
        && !wantsHotFullWarn && !wantsHotKeep
        && !wantsEnIndex && !wantsEnDiag && !wantsTrProvider && !wantsTrModel
        && !wantsTrTemplate && !wantsTrConc && !wantsTrRetries && !wantsTrTimeout && !wantsTrMaxTok
        && !wantsTagProvider && !wantsTagModel && !wantsTagAuto && !wantsTagEffort
        && !wantsActive && !wantsActiveChannel && !wantsActiveModel && !wantsActiveScope
        && !wantsActiveJevNarrow && !wantsActiveStrict && !wantsActiveTopK && !wantsActiveBand
        // ⭐⭐⭐ 决策模型（多 provider）—— ⚠️ **必须同时进这个条件**，否则单独提交它们
        //    会被判"什么都没给"⇒ 400（本项目已两次踩过这个形态）。
        && !wantsDecisionProviders && !wantsActiveDecisionPick && !wantsHotScoreDecisionPick
        && !wantsActiveNeedMin && !wantsActiveItemMin
        && !wantsActiveTimeout && !wantsActiveRounds && !wantsActivePool && !wantsActiveExplain
        && !wantsActiveIntentGate && !wantsActiveIntentMin && !wantsActiveSuffGate
        && !wantsActiveSuffMin && !wantsActiveInjections && !wantsActiveReasoningCap
        && !wantsActiveBudget && !wantsActiveBudgetTok && !wantsActiveChatRatio && !wantsActivePoolMin
        && !wantsActiveCtxTok && !wantsActiveConc && !wantsRecallLogRequest
        // ⭐⭐⭐ 知识评分（决策 177）—— ⚠️ **这一行就是第六十六批那次事故的同类落点**：
        //    当时加了写入块却漏了本条件 ⇒ 单独提交新键返 400、面板保存失败，
        //    而 tsc 与单测都照不到（只有隔离实例真 POST 才抓到）。
        //    ⇒ ⭐ 本次用**一个布尔**（表驱动算出来的）覆盖全部 10 个键 ⇒ 结构上漏不了。
        && !wantsAnyHotScore
        // ⭐⭐⭐ 上下文占用率上报（决策 226）—— 🔴 **同一个落点**：
        //    漏了这里 ⇒ 单独提交这两个键返 400、面板保存失败（tsc 与单测都照不到）。
        && !wantsAnyContextReport
      ) {
        return {
          status: 400,
          body: {
            ok: false,
            error:
              '至少要给 `themeCreation` / `progressCharsWarn` / `progressCharsKeep` / `backupGit` / ' +
              '`hotInject` / `hotInjectRatio` / `hotCharsPerToken` / `hotBudgetCharsFallback` / ' +
              '`hotFullWarnChars` / `hotSessionKeep` / `enIndex` / `translateProvider` / ' +
              '`translateModel` / `translateTemplate` / `tagNormalizeProvider` / ' +
              '`tagNormalizeModel` / `tagNormalizeOnHandoff` / ' +
              '`tagNormalizeReasoningEffort` / ' +
              '`contextReportOnTurnEnd` / `contextReportMinPercent` 之一。',
          },
        }
      }

      // 🔴 **硬校验取值**：只接受受控值，其余一律拒绝（不写坏配置）。
      if (wantsTheme) {
        const value = payload.themeCreation
        if (typeof value !== 'string' || !THEME_CREATION_VALUES.includes(value)) {
          return {
            status: 400,
            body: {
              ok: false,
              error: `themeCreation 只能是 ${THEME_CREATION_VALUES.map((v) => `\`${v}\``).join(' / ')}。`,
            },
          }
        }
        const w = await writeSetting(deps.baseUrl, 'themeCreation', value, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }

      let warnWritten: number | undefined
      if (wantsWarn) {
        const n = payload.progressCharsWarn
        // ⚠️ 必须是**整数**：YAML 里写小数会让下次启动的 schemastery（`z.natural()`）拒绝。
        if (typeof n !== 'number' || !Number.isInteger(n) || n < PROGRESS_WARN_MIN || n > PROGRESS_WARN_MAX) {
          return {
            status: 400,
            body: {
              ok: false,
              error: `progressCharsWarn 必须是 ${PROGRESS_WARN_MIN}–${PROGRESS_WARN_MAX} 之间的整数。`,
            },
          }
        }
        const w = await writeSetting(deps.baseUrl, 'progressCharsWarn', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
        warnWritten = n
      }

      // ⭐⭐ **截断目标**（决策 136）：与阈值同一套校验。
      //    🔴 **必须 < 阈值才有意义**——截断目标高于阈值会让"超过阈值就截"变成"截完仍超阈"
      //       ⇒ 下一轮又截，来回震荡。这里不做跨键校验（两键可能分两次提交），
      //       改为在**回执里如实提示**（见下）。
      let keepWritten: number | undefined
      if (wantsKeep) {
        const n = payload.progressCharsKeep
        if (typeof n !== 'number' || !Number.isInteger(n) || n < PROGRESS_WARN_MIN || n > PROGRESS_WARN_MAX) {
          return {
            status: 400,
            body: {
              ok: false,
              error: `progressCharsKeep 必须是 ${PROGRESS_WARN_MIN}–${PROGRESS_WARN_MAX} 之间的整数。`,
            },
          }
        }
        const w = await writeSetting(deps.baseUrl, 'progressCharsKeep', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
        keepWritten = n
      }

      // ⭐ **git 开关**（决策 135；台账开关已在决策 136 删除）。
      //
      // 🔴🔴 **必须区分"字段没给"与"给了 false"**（这是本项目踩过的同族坑）：
      //    `progressCharsWarn` 用 `!== undefined` 判存在性是对的，
      //    布尔开关若写成 `payload.backupGit ? … : …`，**关掉开关会被当成"没给"**
      //    ⇒ 用户点了关闭，配置里那个键纹丝不动，**开关看起来失灵**。
      if (payload.backupGit !== undefined) {
        if (typeof payload.backupGit !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'backupGit 必须是布尔值（true / false）。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'backupGit', payload.backupGit, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }

      // ══════════════════════════════════════════════════════════════════════
      // ⭐⭐ 热知识（热知识方案 §10）
      //
      // 🔴 **一律逐项硬校验**（不写坏配置）：数值键必须是**有限数**且在区间内、
      //    比率/系数允许小数，整数键必须是整数。
      // ⚠️ 但**唯一例外是总开关**：它是**热知识页**上的开关（裁定 H-1"放显著位置"），
      //    这里也接受——两个入口写同一个键，**行为必须一致**（本项目多入口铁律）。
      // ══════════════════════════════════════════════════════════════════════
      if (wantsHotInject) {
        if (typeof payload.hotInject !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'hotInject 必须是布尔值（true / false）。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'hotInject', payload.hotInject, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsHotRatio) {
        const n = payload.hotInjectRatio
        if (typeof n !== 'number' || !Number.isFinite(n) || n < HOT_RATIO_MIN || n > HOT_RATIO_MAX) {
          return { status: 400, body: { ok: false, error: `hotInjectRatio 必须是 ${HOT_RATIO_MIN}–${HOT_RATIO_MAX} 之间的数。` } }
        }
        const w = await writeSetting(deps.baseUrl, 'hotInjectRatio', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsHotCpt) {
        const n = payload.hotCharsPerToken
        if (typeof n !== 'number' || !Number.isFinite(n) || n < HOT_CHARS_PER_TOKEN_MIN || n > HOT_CHARS_PER_TOKEN_MAX) {
          return {
            status: 400,
            body: { ok: false, error: `hotCharsPerToken 必须是 ${HOT_CHARS_PER_TOKEN_MIN}–${HOT_CHARS_PER_TOKEN_MAX} 之间的数。` },
          }
        }
        const w = await writeSetting(deps.baseUrl, 'hotCharsPerToken', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      // ⚠️ 以下四个是**整数**（config 里用的是 `z.natural()`，写小数会让下次启动被拒）。
      let hotBudgetWritten: number | undefined
      if (wantsHotBudget) {
        const n = payload.hotBudgetCharsFallback
        if (typeof n !== 'number' || !Number.isInteger(n) || n < HOT_BUDGET_MIN || n > HOT_BUDGET_MAX) {
          return { status: 400, body: { ok: false, error: `hotBudgetCharsFallback 必须是 ${HOT_BUDGET_MIN}–${HOT_BUDGET_MAX} 之间的整数。` } }
        }
        const w = await writeSetting(deps.baseUrl, 'hotBudgetCharsFallback', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
        hotBudgetWritten = n
      }
      let hotFullWarnWritten: number | undefined
      if (wantsHotFullWarn) {
        const n = payload.hotFullWarnChars
        if (typeof n !== 'number' || !Number.isInteger(n) || n < HOT_FULL_WARN_MIN || n > HOT_FULL_WARN_MAX) {
          return { status: 400, body: { ok: false, error: `hotFullWarnChars 必须是 ${HOT_FULL_WARN_MIN}–${HOT_FULL_WARN_MAX} 之间的整数。` } }
        }
        const w = await writeSetting(deps.baseUrl, 'hotFullWarnChars', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
        hotFullWarnWritten = n
      }
      let hotKeepWritten: number | undefined
      if (wantsHotKeep) {
        const n = payload.hotSessionKeep
        if (typeof n !== 'number' || !Number.isInteger(n) || n < HOT_SESSION_KEEP_MIN || n > HOT_SESSION_KEEP_MAX) {
          return { status: 400, body: { ok: false, error: `hotSessionKeep 必须是 ${HOT_SESSION_KEEP_MIN}–${HOT_SESSION_KEEP_MAX} 之间的整数。` } }
        }
        const w = await writeSetting(deps.baseUrl, 'hotSessionKeep', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
        hotKeepWritten = n
      }

      // ══════════════════════════════════════════════════════════════════════
      // ⭐⭐ 英文召回索引（设计文档 §9）：面板 5 个键 + 3 个进阶键
      // 🔴 两条通路的约束一致：`translateTemplate` 是**受控两值**
      //    （`instruct` / `mt`）—— 它同时决定**提示词与解析器**，错配 = 静默失败。
      // ══════════════════════════════════════════════════════════════════════
      if (wantsEnIndex) {
        if (typeof payload.enIndex !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'enIndex 必须是布尔值（true / false）。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'enIndex', payload.enIndex, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsEnDiag) {
        if (typeof payload.enIndexDiag !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'enIndexDiag 必须是布尔值（true / false）。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'enIndexDiag', payload.enIndexDiag, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      // ══════════════════════════════════════════════════════════════════════
      // ⭐⭐⭐ **「翻译模板 ↔ 模型」配对校验**（用户 2026-10-07 要求）
      //
      // 用户原话：*"如果选对应比如 mt 模版，但是没有响应的 mt 模型就要警告，
      //   并且保存时报错。"*
      //
      // 🔴 **为什么要在这里拦**：`translateTemplate` 是"提示词 + 解析器"的**配对开关**，
      //    错配是**静默失败**（实测踩到：选了普通对话模型却把模板留成 `mt`，
      //    面板**毫无阻拦地存下去了**）。⇒ 用户明确要求：**保存时就报错**。
      //
      // ⚠️⚠️ **三条实现纪律**（都是本项目踩过的）：
      //   ① **必须在任何写入【之前】校验** —— 排在下面那几个 `writeSetting` 前面，
      //      否则会出现"模板已写进去、模型校验又失败"的**半套配置**；
      //   ② **判据用【生效组合】，不是只看本次 payload** —— 用户可能只改模板、
      //      只改模型、或两个一起改 ⇒ 三种情形都要能算出"改完之后是什么组合"。
      //      故用**磁盘优先**的 `effectiveConfig`（本文件刚统一过的口径），
      //      避免拿进程内那份**过时**的配置去判（那会漏判或误判）；
      //   ③ **判据本身只写一份** —— 调 `pairingError()`（`en-index.ts`），
      //      前端告警也用它，**不要在这里再抄一遍规则**。
      // ══════════════════════════════════════════════════════════════════════
      if (wantsTrProvider || wantsTrModel || wantsTrTemplate) {
        const cur = effectiveConfig(await readSettings(deps.baseUrl, deps.config, deps.pluginId))
        const effTemplate = wantsTrTemplate
          ? String(payload.translateTemplate)
          : cur.translateTemplate
        const effProvider = wantsTrProvider ? String(payload.translateProvider) : cur.translateProvider
        const effModel = wantsTrModel ? String(payload.translateModel) : cur.translateModel
        const bad = pairingError(effTemplate, effProvider, effModel)
        if (bad !== '') {
          return {
            status: 400,
            body: {
              ok: false,
              // ⚠️ 文案要能独立读懂（前端直接把它显示在结果行里）。
              error: `未保存：${bad}`,
              // ⭐ 结构化字段：前端/脚本不必去解析那句话。
              pairingError: { template: effTemplate, provider: effProvider, model: effModel },
            },
          }
        }
      }
      if (wantsTrProvider) {
        const v = payload.translateProvider
        if (typeof v !== 'string' || v.length > 200) {
          return { status: 400, body: { ok: false, error: 'translateProvider 必须是字符串（≤200 字符）。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'translateProvider', v, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsTrModel) {
        const v = payload.translateModel
        if (typeof v !== 'string' || v.length > 200) {
          return { status: 400, body: { ok: false, error: 'translateModel 必须是字符串（≤200 字符）。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'translateModel', v, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsTrTemplate) {
        if (payload.translateTemplate !== 'instruct' && payload.translateTemplate !== 'mt') {
          return { status: 400, body: { ok: false, error: 'translateTemplate 只能是 "instruct" 或 "mt"。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'translateTemplate', payload.translateTemplate, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsTrConc) {
        const n = payload.translateConcurrency
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 20) {
          return { status: 400, body: { ok: false, error: 'translateConcurrency 必须是 1–20 之间的整数。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'translateConcurrency', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsTrRetries) {
        const n = payload.translateRetries
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 5) {
          return { status: 400, body: { ok: false, error: 'translateRetries 必须是 0–5 之间的整数。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'translateRetries', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsTrTimeout) {
        const n = payload.translateTimeoutMs
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 1000 || n > 600000) {
          return { status: 400, body: { ok: false, error: 'translateTimeoutMs 必须是 1000–600000 之间的整数。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'translateTimeoutMs', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsTrMaxTok) {
        const n = payload.translateMaxTokens
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 64 || n > 100000) {
          return { status: 400, body: { ok: false, error: 'translateMaxTokens 必须是 64–100000 之间的整数。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'translateMaxTokens', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }

      // ══════════════════════════════════════════════════════════════════════
      // ⭐⭐⭐ 标签规范化（决策 162）：裁决模型
      //    ⚠️ 校验口径与 `translate*` **完全一致**（同一类值、同一套边界），
      //       但**键是分开的** —— 翻译模型只会翻、裁决模型要会判断，两者不能混用。
      // ══════════════════════════════════════════════════════════════════════
      if (payload.tagNormalizeProvider !== undefined) {
        const v = payload.tagNormalizeProvider
        if (typeof v !== 'string' || v.length > 200) {
          return { status: 400, body: { ok: false, error: 'tagNormalizeProvider 必须是字符串（≤200 字符）。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'tagNormalizeProvider', v, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (payload.tagNormalizeModel !== undefined) {
        const v = payload.tagNormalizeModel
        if (typeof v !== 'string' || v.length > 200) {
          return { status: 400, body: { ok: false, error: 'tagNormalizeModel 必须是字符串（≤200 字符）。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'tagNormalizeModel', v, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      // ⭐ 决策 165：轮次结束自动规范化的开关（**布尔**校验，同其它布尔键）。
      //    ⚠️ 判存在性必须用 `!== undefined`（写成 `payload.x ? …` 会让
      //       **"关掉开关"被当成"没给"** —— 本项目同族坑，见 `backupGit` 的注释）。
      if (wantsTagAuto) {
        if (typeof payload.tagNormalizeOnHandoff !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'tagNormalizeOnHandoff 必须是布尔值（true / false）。' } }
        }
        const w = await writeSetting(
          deps.baseUrl, 'tagNormalizeOnHandoff', payload.tagNormalizeOnHandoff, deps.pluginId,
        )
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      // ⭐ 决策 168：裁决模型的思考等级（**受控枚举**：空 / off / low / medium / high）。
      //    ⚠️ 校验口径与其它枚举键一致（只认列出的值）—— 否则写进 YAML 会让下次启动 zod 报错。
      if (wantsTagEffort) {
        const v = payload.tagNormalizeReasoningEffort
        if (typeof v !== 'string' || !['', 'off', 'low', 'medium', 'high'].includes(v)) {
          return {
            status: 400,
            body: { ok: false, error: 'tagNormalizeReasoningEffort 只能是 空 / off / low / medium / high 之一。' },
          }
        }
        const w = await writeSetting(deps.baseUrl, 'tagNormalizeReasoningEffort', v, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }

      // ══════════════════════════════════════════════════════════════════════
      // ⭐⭐ 主动注入（设计文档 §10.1）
      //
      // 🔴 **一律逐项硬校验**（不写坏配置）：受控枚举只认列出的值、布尔只认 bool、
      //    数值必须有限且在区间内、**整数键必须是整数**（YAML 里写小数会让下次启动的
      //    schemastery `z.natural()` 拒绝 —— 本项目已踩过）。
      // ⚠️ 布尔键必须用 `!== undefined` 判存在性：写成 `payload.x ? …` 会让
      //    **关掉开关被当成"没给"**（本项目同族坑，见上面 backupGit 的注释）。
      // ══════════════════════════════════════════════════════════════════════
      if (wantsActive) {
        if (typeof payload.activeInject !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'activeInject 必须是布尔值（true / false）。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInject', payload.activeInject, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveChannel) {
        const v = payload.activeInjectChannel
        if (typeof v !== 'string' || !ACTIVE_CHANNEL_VALUES.includes(v)) {
          return {
            status: 400,
            body: { ok: false, error: `activeInjectChannel 只能是 ${ACTIVE_CHANNEL_VALUES.map((x) => `\`${x}\``).join(' / ')}。` },
          }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectChannel', v, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveModel) {
        const v = payload.activeInjectModel
        if (typeof v !== 'string' || v.length > 200) {
          return { status: 400, body: { ok: false, error: 'activeInjectModel 必须是字符串（≤200 字符）。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectModel', v, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveScope) {
        const v = payload.activeInjectScope
        if (typeof v !== 'string' || !ACTIVE_SCOPE_VALUES.includes(v)) {
          return {
            status: 400,
            body: { ok: false, error: `activeInjectScope 只能是 ${ACTIVE_SCOPE_VALUES.map((x) => `\`${x}\``).join(' / ')}。` },
          }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectScope', v, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveJevNarrow) {
        if (typeof payload.activeInjectJevNarrowScope !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'activeInjectJevNarrowScope 必须是布尔值。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectJevNarrowScope', payload.activeInjectJevNarrowScope, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      // ⭐⭐⭐ **决策模型 providers 列表**（用户 2026-10-07 多 provider 化）。
      //    ⚠️ 这是**普通配置值**（进 `cordis.patch.yml`）；**密钥不在其中**
      //    （密钥走凭据 seam，由 `/jev/key` 单独收，且名字由 id 派生）。
      if (wantsDecisionProviders) {
        const v = payload.decisionProviders
        if (!Array.isArray(v)) {
          return { status: 400, body: { ok: false, error: 'decisionProviders 必须是数组。' } }
        }
        const cleaned: Array<{ id: string; displayName: string; endpoint: string; models: string[] }> = []
        const seen = new Set<string>()
        for (const raw of v) {
          if (raw === null || typeof raw !== 'object') {
            return { status: 400, body: { ok: false, error: 'decisionProviders 的每一项必须是对象。' } }
          }
          const o = raw as Record<string, unknown>
          const id = typeof o['id'] === 'string' ? o['id'].trim() : ''
          // ⚠️ id 是**路由标识**：它会派生出凭据名 ⇒ 必须是安全的短标识符。
          //    写成中文/空格/斜杠会派生出一个古怪的凭据名，且**失败是静默的**。
          if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(id)) {
            return {
              status: 400,
              body: {
                ok: false,
                error: `provider id「${id || '(空)'}」不合法：只能是字母数字开头、含字母数字/下划线/连字符，最长 48（它会派生出凭据名，所以不能随意写）。`,
              },
            }
          }
          if (seen.has(id)) {
            return { status: 400, body: { ok: false, error: `provider id「${id}」重复了（同一份配置里必须唯一）。` } }
          }
          seen.add(id)
          const endpoint = typeof o['endpoint'] === 'string' ? o['endpoint'].trim() : ''
          if (!/^https?:\/\/\S+$/i.test(endpoint)) {
            return {
              status: 400,
              body: {
                ok: false,
                error: `provider「${id}」的端点必须是 http:// 或 https:// 开头的 URL（如 https://api.knox.chat/v1/systemone）。`,
              },
            }
          }
          const modelsRaw = Array.isArray(o['models']) ? o['models'] : []
          const models = modelsRaw
            .filter((m): m is string => typeof m === 'string')
            .map((m) => m.trim())
            .filter((m) => m !== '')
          cleaned.push({
            id,
            displayName: typeof o['displayName'] === 'string' ? o['displayName'].trim().slice(0, 100) : '',
            endpoint,
            models,
          })
        }
        // ⚠️ 存成**结构化数组**（YAML 会写成漂亮的块风格 —— 已实测）。
        const w = await writeSetting(deps.baseUrl, 'decisionProviders', cleaned, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      // ⭐⭐ 两处选集（`<providerId>/<modelName>`）—— 格式校验 + **必须指向存在的 provider**。
      for (const [key, wants] of [
        ['activeInjectDecisionPick', wantsActiveDecisionPick],
        ['hotScoreDecisionPick', wantsHotScoreDecisionPick],
      ] as const) {
        if (!wants) continue
        const v = payload[key as 'activeInjectDecisionPick' | 'hotScoreDecisionPick']
        if (typeof v !== 'string' || v.length > 200) {
          return { status: 400, body: { ok: false, error: `${key} 必须是字符串（≤200 字符）。` } }
        }
        const pick = v.trim()
        if (pick !== '') {
          const i = pick.indexOf('/')
          const pid = i > 0 ? pick.slice(0, i) : ''
          if (pid === '') {
            return {
              status: 400,
              body: { ok: false, error: `${key} 要写成「providerId/模型名」（当前是「${pick}」）。` },
            }
          }
          // 🔴 **必须指向一个真的存在的 provider** —— 否则运行期会静默回落到别的
          //    provider（`resolveDecisionPick` 的兜底），而用户以为自己选对了。
          const exists = decisionProvidersOf(effectiveConfig(
            await readSettings(deps.baseUrl, deps.config, deps.pluginId),
          )).some((p) => p.id === pid)
          if (!exists) {
            return {
              status: 400,
              body: { ok: false, error: `${key} 指向的 provider「${pid}」不存在 —— 请先在列表里加它。` },
            }
          }
        }
        const w = await writeSetting(deps.baseUrl, key, pick, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveStrict) {
        if (typeof payload.activeInjectStrict !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'activeInjectStrict 必须是布尔值。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectStrict', payload.activeInjectStrict, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveExplain) {
        if (typeof payload.activeInjectExplain !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'activeInjectExplain 必须是布尔值。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectExplain', payload.activeInjectExplain, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveIntentGate) {
        if (typeof payload.activeInjectSearchIntentGate !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'activeInjectSearchIntentGate 必须是布尔值。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectSearchIntentGate', payload.activeInjectSearchIntentGate, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveSuffGate) {
        if (typeof payload.activeInjectSufficientGate !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'activeInjectSufficientGate 必须是布尔值。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectSufficientGate', payload.activeInjectSufficientGate, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      // ⚠️ 以下整数键：必须是整数（写小数会让下次启动被拒）。
      if (wantsActiveTopK) {
        const n = payload.activeInjectTopK
        if (typeof n !== 'number' || !Number.isInteger(n) || n < ACTIVE_TOP_K_MIN || n > ACTIVE_TOP_K_MAX) {
          return { status: 400, body: { ok: false, error: `activeInjectTopK 必须是 ${ACTIVE_TOP_K_MIN}–${ACTIVE_TOP_K_MAX} 之间的整数。` } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectTopK', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveTimeout) {
        const n = payload.activeInjectTimeoutMs
        if (typeof n !== 'number' || !Number.isInteger(n) || n < ACTIVE_TIMEOUT_MIN || n > ACTIVE_TIMEOUT_MAX) {
          return { status: 400, body: { ok: false, error: `activeInjectTimeoutMs 必须是 ${ACTIVE_TIMEOUT_MIN}–${ACTIVE_TIMEOUT_MAX} 之间的整数。` } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectTimeoutMs', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveRounds) {
        const n = payload.activeInjectContextRounds
        if (typeof n !== 'number' || !Number.isInteger(n) || n < ACTIVE_CONTEXT_ROUNDS_MIN || n > ACTIVE_CONTEXT_ROUNDS_MAX) {
          return { status: 400, body: { ok: false, error: `activeInjectContextRounds 必须是 ${ACTIVE_CONTEXT_ROUNDS_MIN}–${ACTIVE_CONTEXT_ROUNDS_MAX} 之间的整数。` } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectContextRounds', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActivePool) {
        const n = payload.activeInjectPoolMax
        if (typeof n !== 'number' || !Number.isInteger(n) || n < ACTIVE_POOL_MAX_MIN || n > ACTIVE_POOL_MAX_MAX) {
          return { status: 400, body: { ok: false, error: `activeInjectPoolMax 必须是 ${ACTIVE_POOL_MAX_MIN}–${ACTIVE_POOL_MAX_MAX} 之间的整数。` } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectPoolMax', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveInjections) {
        const n = payload.activeInjectMaxInjectionsPerTurn
        if (typeof n !== 'number' || !Number.isInteger(n) || n < ACTIVE_CALLS_PER_TURN_MIN || n > ACTIVE_CALLS_PER_TURN_MAX) {
          return { status: 400, body: { ok: false, error: `activeInjectMaxInjectionsPerTurn 必须是 ${ACTIVE_CALLS_PER_TURN_MIN}–${ACTIVE_CALLS_PER_TURN_MAX} 之间的整数。` } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectMaxInjectionsPerTurn', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveReasoningCap) {
        const n = payload.activeInjectReasoningMaxChars
        if (typeof n !== 'number' || !Number.isInteger(n) || n < ACTIVE_REASONING_MAX_CHARS_MIN || n > ACTIVE_REASONING_MAX_CHARS_MAX) {
          return { status: 400, body: { ok: false, error: `activeInjectReasoningMaxChars 必须是 ${ACTIVE_REASONING_MAX_CHARS_MIN}–${ACTIVE_REASONING_MAX_CHARS_MAX} 之间的整数。` } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectReasoningMaxChars', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      // ⭐⭐⭐ 预算与裁剪（用户 2026-09-26 方案）——一律逐项硬校验。
      if (wantsActiveBudget) {
        if (typeof payload.activeInjectBudget !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'activeInjectBudget 必须是布尔值。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectBudget', payload.activeInjectBudget, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveBudgetTok) {
        const n = payload.activeInjectBudgetTokens
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 1000 || n > 200000) {
          return { status: 400, body: { ok: false, error: 'activeInjectBudgetTokens 必须是 1000–200000 之间的整数。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectBudgetTokens', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      // ⭐⭐⭐ 拆批（用户 2026-09-26 定稿方案）
      if (wantsActiveCtxTok) {
        const n = payload.activeInjectContextTokens
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 1000 || n > 200000) {
          return { status: 400, body: { ok: false, error: 'activeInjectContextTokens 必须是 1000–200000 之间的整数。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectContextTokens', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveConc) {
        const n = payload.activeInjectConcurrency
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 16) {
          return { status: 400, body: { ok: false, error: 'activeInjectConcurrency 必须是 1–16 之间的整数。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectConcurrency', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActiveChatRatio) {
        const n = payload.activeInjectChatWindowRatio
        // ⚠️ **小数键** ⇒ 不要用 Number.isInteger（那会把 0.6 拒掉）。
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0.1 || n > 1) {
          return { status: 400, body: { ok: false, error: 'activeInjectChatWindowRatio 必须是 0.1–1 之间的数。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectChatWindowRatio', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsActivePoolMin) {
        const n = payload.activeInjectPoolMin
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 500) {
          return { status: 400, body: { ok: false, error: 'activeInjectPoolMin 必须是 1–500 之间的整数。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeInjectPoolMin', n, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      if (wantsRecallLogRequest) {
        // ⭐⭐ 布尔键 —— 与 `enIndexDiag` 同款校验（别漏：漏了会让字符串静默写进配置）。
        if (typeof payload.activeRecallLogRequest !== 'boolean') {
          return { status: 400, body: { ok: false, error: 'activeRecallLogRequest 必须是布尔值（true / false）。' } }
        }
        const w = await writeSetting(deps.baseUrl, 'activeRecallLogRequest', payload.activeRecallLogRequest, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
      }
      // ⚠️ 以下三个是**小数**键（阈值/分数）⇒ 只要求有限数且在 0–1 内。
      //    ⚠️ **不要用 `Number.isInteger`** —— 那会把 0.7 / 0.85 全拒掉（同族坑）。
      const writeFraction = async (
        key: 'activeInjectBand' | 'activeInjectNeedMin' | 'activeInjectItemMin'
          | 'activeInjectSearchIntentMin' | 'activeInjectSufficientMin',
        raw: unknown,
      ): Promise<{ ok: true } | { ok: false; error: string }> => {
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < ACTIVE_BAND_MIN || raw > ACTIVE_BAND_MAX) {
          return { ok: false, error: `${key} 必须是 ${ACTIVE_BAND_MIN}–${ACTIVE_BAND_MAX} 之间的数。` }
        }
        const w = await writeSetting(deps.baseUrl, key, raw, deps.pluginId)
        return w.ok ? { ok: true } : { ok: false, error: w.message }
      }
      if (wantsActiveBand) {
        const r = await writeFraction('activeInjectBand', payload.activeInjectBand)
        if (!r.ok) return { status: 400, body: { ok: false, error: r.error } }
      }
      if (wantsActiveNeedMin) {
        const r = await writeFraction('activeInjectNeedMin', payload.activeInjectNeedMin)
        if (!r.ok) return { status: 400, body: { ok: false, error: r.error } }
      }
      if (wantsActiveItemMin) {
        const r = await writeFraction('activeInjectItemMin', payload.activeInjectItemMin)
        if (!r.ok) return { status: 400, body: { ok: false, error: r.error } }
      }
      if (wantsActiveIntentMin) {
        const r = await writeFraction('activeInjectSearchIntentMin', payload.activeInjectSearchIntentMin)
        if (!r.ok) return { status: 400, body: { ok: false, error: r.error } }
      }
      if (wantsActiveSuffMin) {
        const r = await writeFraction('activeInjectSufficientMin', payload.activeInjectSufficientMin)
        if (!r.ok) return { status: 400, body: { ok: false, error: r.error } }
      }

      // ══════════════════════════════════════════════════════════════════════
      // ⭐⭐⭐ 知识评分（决策 177）：10 个键
      //
      // ⚠️ **校验分三档，与 `config.ts` 的 schema 逐项对齐**（不一致会"存得进、启动被拒"）：
      //    · 布尔：`hotScoreOnTurnEnd`
      //    · 0–1 小数：`hotScoreThreshold`（⚠️ **不要 `Number.isInteger`**）
      //    · 非负整数：`hotScoreWindowHours` 是**小数**（允许 0.5 小时）、
      //      `hotScoreTopN` / `hotScoreMinChars` / `hotScoreTimeoutMs` 是整数
      //    · 字符串：四个（`hotScoreChannel` 受控两值）
      // ⭐ 写入成功与否**统一收集到 `hotScoreWritten`**（回执要用；空了就不写它）。
      // ══════════════════════════════════════════════════════════════════════
      const hotScoreWritten: Record<string, unknown> = {}
      /**
       * 统一的"写一个键"（校验通过才写；失败立刻返回 400）。
       * ⚠️ `key` 的类型是 `Parameters<typeof writeSetting>[1]` —— **不写死 `string`**，
       *    否则 `writeSetting` 的受控键联合会拒收（那是它的契约，别放松它）。
       */
      const writeHotScore = async (
        key: Parameters<typeof writeSetting>[1],
        raw: unknown,
        check: (v: unknown) => string | undefined,
      ): Promise<{ status: number; body: unknown } | undefined> => {
        const err = check(raw)
        if (err !== undefined) return { status: 400, body: { ok: false, error: err } }
        // ⚠️ `writeSetting` 的 `value` 只接受标量 ⇒ 这里收窄（校验器已保证形态）。
        const w = await writeSetting(deps.baseUrl, key, raw as string | number | boolean, deps.pluginId)
        if (!w.ok) return { status: 400, body: { ok: false, error: w.message, patchPath: w.patchPath } }
        hotScoreWritten[key] = raw
        return undefined
      }
      const boolAt = (key: string): string | undefined =>
        typeof (payload as Record<string, unknown>)[key] === 'boolean' ? undefined : `${key} 必须是布尔值（true / false）。`
      /** 0–1 的小数（⚠️ 不能用 `Number.isInteger`）。 */
      const fracAt = (key: string): string | undefined => {
        const v = (payload as Record<string, unknown>)[key]
        return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
          ? undefined
          : `${key} 必须是 0–1 之间的数。`
      }
      /** 非负整数（带上限）。 */
      const natAt = (key: string, max: number): string | undefined => {
        const v = (payload as Record<string, unknown>)[key]
        return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max
          ? undefined
          : `${key} 必须是 0–${max} 之间的整数。`
      }
      /** 正数（窗口小时数允许小数）。 */
      const posAt = (key: string, max: number): string | undefined => {
        const v = (payload as Record<string, unknown>)[key]
        return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max
          ? undefined
          : `${key} 必须是 0–${max} 之间的正数。`
      }
      const strAt = (key: string): string | undefined =>
        typeof (payload as Record<string, unknown>)[key] === 'string' ? undefined : `${key} 必须是字符串。`
      const oneOfAt = (key: string, allowed: readonly string[]): string | undefined => {
        const v = (payload as Record<string, unknown>)[key]
        return typeof v === 'string' && allowed.includes(v)
          ? undefined
          : `${key} 只能是 ${allowed.map((x) => `\`${x}\``).join(' / ')}。`
      }
      // ⚠️ 逐键走一遍（**只处理本次真的给了的**）。
      for (const k of HOT_SCORE_BOOL_KEYS) {
        if ((payload as Record<string, unknown>)[k] === undefined) continue
        const bad = await writeHotScore(k, (payload as Record<string, unknown>)[k], () => boolAt(k))
        if (bad !== undefined) return bad as never
      }
      if (payload.hotScoreThreshold !== undefined) {
        const bad = await writeHotScore('hotScoreThreshold', payload.hotScoreThreshold, () => fracAt('hotScoreThreshold'))
        if (bad !== undefined) return bad as never
      }
      if (payload.hotScoreWindowHours !== undefined) {
        const bad = await writeHotScore('hotScoreWindowHours', payload.hotScoreWindowHours, () => posAt('hotScoreWindowHours', 10000))
        if (bad !== undefined) return bad as never
      }
      if (payload.hotScoreTopN !== undefined) {
        const bad = await writeHotScore('hotScoreTopN', payload.hotScoreTopN, () => natAt('hotScoreTopN', 200))
        if (bad !== undefined) return bad as never
      }
      if (payload.hotScoreMaxPicks !== undefined) {
        const bad = await writeHotScore('hotScoreMaxPicks', payload.hotScoreMaxPicks, () => natAt('hotScoreMaxPicks', 200))
        if (bad !== undefined) return bad as never
      }
      if (payload.hotScoreGateMinScore !== undefined) {
        const bad = await writeHotScore('hotScoreGateMinScore', payload.hotScoreGateMinScore, () => natAt('hotScoreGateMinScore', 1000))
        if (bad !== undefined) return bad as never
      }
      if (payload.hotScoreMinChars !== undefined) {
        const bad = await writeHotScore('hotScoreMinChars', payload.hotScoreMinChars, () => natAt('hotScoreMinChars', 1000000))
        if (bad !== undefined) return bad as never
      }
      if (payload.hotScoreChannel !== undefined) {
        const bad = await writeHotScore('hotScoreChannel', payload.hotScoreChannel, () => oneOfAt('hotScoreChannel', ['chat', 'jev']))
        if (bad !== undefined) return bad as never
      }
      for (const k of ['hotScoreModel', 'hotScoreSubagentProvider', 'hotScoreSubagentModel'] as const) {
        const raw = (payload as Record<string, unknown>)[k]
        if (raw === undefined) continue
        const bad = await writeHotScore(k, raw, () => strAt(k))
        if (bad !== undefined) return bad as never
      }
      if (payload.hotScoreTimeoutMs !== undefined) {
        const bad = await writeHotScore('hotScoreTimeoutMs', payload.hotScoreTimeoutMs, () => posAt('hotScoreTimeoutMs', 300000))
        if (bad !== undefined) return bad as never
      }

      // ⭐⭐⭐ 上下文占用率上报（决策 226；2026-10-12 用户裁定）——
      //    ⚠️ 复用 `writeHotScore` 那个助手（它只是"校验通过才写"，与评分无关，
      //       名字带 hotScore 是历史原因；⭐ 不新造第二个几乎相同的助手）。
      for (const k of CONTEXT_REPORT_BOOL_KEYS) {
        if ((payload as Record<string, unknown>)[k] === undefined) continue
        const bad = await writeHotScore(k, (payload as Record<string, unknown>)[k], () => boolAt(k))
        if (bad !== undefined) return bad as never
      }
      for (const k of CONTEXT_REPORT_NUM_KEYS) {
        if ((payload as Record<string, unknown>)[k] === undefined) continue
        // 1–100 的整数（百分比）。
        const bad = await writeHotScore(k, (payload as Record<string, unknown>)[k], () => natAt(k, 100))
        if (bad !== undefined) return bad as never
      }

      // ⚠️ 回执**只回本次真正写了的键**——回一个没写的键会让人以为它也被改了。
      const r2 = await readSettings(deps.baseUrl, deps.config, deps.pluginId)
      return {
        status: 200,
        body: {
          ok: true,
          ...(wantsTheme ? { themeCreation: payload.themeCreation } : {}),
          ...(warnWritten !== undefined ? { progressCharsWarn: warnWritten } : {}),
          ...(keepWritten !== undefined ? { progressCharsKeep: keepWritten } : {}),
          ...(payload.backupGit !== undefined ? { backupGit: payload.backupGit } : {}),
          // ⭐⭐ 热知识（热知识方案 §10）
          ...(wantsHotInject ? { hotInject: payload.hotInject } : {}),
          ...(wantsHotRatio ? { hotInjectRatio: payload.hotInjectRatio } : {}),
          ...(wantsHotCpt ? { hotCharsPerToken: payload.hotCharsPerToken } : {}),
          ...(hotBudgetWritten !== undefined ? { hotBudgetCharsFallback: hotBudgetWritten } : {}),
          ...(hotFullWarnWritten !== undefined ? { hotFullWarnChars: hotFullWarnWritten } : {}),
          ...(hotKeepWritten !== undefined ? { hotSessionKeep: hotKeepWritten } : {}),
          // ⭐⭐ 英文召回索引（设计文档 §9）
          ...(wantsEnIndex ? { enIndex: payload.enIndex } : {}),
          ...(wantsEnDiag ? { enIndexDiag: payload.enIndexDiag } : {}),
          ...(wantsTrProvider ? { translateProvider: payload.translateProvider } : {}),
          ...(wantsTrModel ? { translateModel: payload.translateModel } : {}),
          // ⭐⭐⭐ 标签规范化（决策 162）：把写进去的值回声给调用方。
          ...(wantsTagProvider ? { tagNormalizeProvider: payload.tagNormalizeProvider } : {}),
          ...(wantsTagModel ? { tagNormalizeModel: payload.tagNormalizeModel } : {}),
          ...(wantsTagAuto ? { tagNormalizeOnHandoff: payload.tagNormalizeOnHandoff } : {}),
          ...(wantsTagEffort ? { tagNormalizeReasoningEffort: payload.tagNormalizeReasoningEffort } : {}),
          ...(wantsTrTemplate ? { translateTemplate: payload.translateTemplate } : {}),
          ...(wantsTrConc ? { translateConcurrency: payload.translateConcurrency } : {}),
          ...(wantsTrRetries ? { translateRetries: payload.translateRetries } : {}),
          ...(wantsTrTimeout ? { translateTimeoutMs: payload.translateTimeoutMs } : {}),
          ...(wantsTrMaxTok ? { translateMaxTokens: payload.translateMaxTokens } : {}),
          // ⭐⭐ 主动注入（设计文档 §10.1）
          ...(wantsActive ? { activeInject: payload.activeInject } : {}),
          ...(wantsActiveChannel ? { activeInjectChannel: payload.activeInjectChannel } : {}),
          ...(wantsActiveModel ? { activeInjectModel: payload.activeInjectModel } : {}),
          ...(wantsActiveScope ? { activeInjectScope: payload.activeInjectScope } : {}),
          ...(wantsActiveJevNarrow ? { activeInjectJevNarrowScope: payload.activeInjectJevNarrowScope } : {}),
          // ⭐⭐⭐ 决策模型（2026-10-07 多 provider 化）
          ...(wantsDecisionProviders ? { decisionProviders: payload.decisionProviders } : {}),
          ...(wantsActiveDecisionPick ? { activeInjectDecisionPick: payload.activeInjectDecisionPick } : {}),
          ...(wantsHotScoreDecisionPick ? { hotScoreDecisionPick: payload.hotScoreDecisionPick } : {}),
          ...(wantsActiveStrict ? { activeInjectStrict: payload.activeInjectStrict } : {}),
          ...(wantsActiveTopK ? { activeInjectTopK: payload.activeInjectTopK } : {}),
          ...(wantsActiveBand ? { activeInjectBand: payload.activeInjectBand } : {}),
          ...(wantsActiveNeedMin ? { activeInjectNeedMin: payload.activeInjectNeedMin } : {}),
          ...(wantsActiveItemMin ? { activeInjectItemMin: payload.activeInjectItemMin } : {}),
          ...(wantsActiveTimeout ? { activeInjectTimeoutMs: payload.activeInjectTimeoutMs } : {}),
          ...(wantsActiveRounds ? { activeInjectContextRounds: payload.activeInjectContextRounds } : {}),
          ...(wantsActivePool ? { activeInjectPoolMax: payload.activeInjectPoolMax } : {}),
          ...(wantsActiveExplain ? { activeInjectExplain: payload.activeInjectExplain } : {}),
          ...(wantsActiveIntentGate ? { activeInjectSearchIntentGate: payload.activeInjectSearchIntentGate } : {}),
          ...(wantsActiveIntentMin ? { activeInjectSearchIntentMin: payload.activeInjectSearchIntentMin } : {}),
          ...(wantsActiveSuffGate ? { activeInjectSufficientGate: payload.activeInjectSufficientGate } : {}),
          ...(wantsActiveSuffMin ? { activeInjectSufficientMin: payload.activeInjectSufficientMin } : {}),
          // ⭐⭐⭐ 知识评分（决策 177）：⭐ **只回声本次真正写了的那些**
          //     （回一个没写的键会让人以为它也被改了 —— 与上面同款纪律）。
          ...hotScoreWritten,
          ...(wantsActiveInjections ? { activeInjectMaxInjectionsPerTurn: payload.activeInjectMaxInjectionsPerTurn } : {}),
          ...(wantsActiveReasoningCap ? { activeInjectReasoningMaxChars: payload.activeInjectReasoningMaxChars } : {}),
          ...(wantsActiveBudget ? { activeInjectBudget: payload.activeInjectBudget } : {}),
          ...(wantsActiveBudgetTok ? { activeInjectBudgetTokens: payload.activeInjectBudgetTokens } : {}),
          ...(wantsActiveCtxTok ? { activeInjectContextTokens: payload.activeInjectContextTokens } : {}),
          ...(wantsActiveConc ? { activeInjectConcurrency: payload.activeInjectConcurrency } : {}),
          ...(wantsActiveChatRatio ? { activeInjectChatWindowRatio: payload.activeInjectChatWindowRatio } : {}),
          ...(wantsActivePoolMin ? { activeInjectPoolMin: payload.activeInjectPoolMin } : {}),
          ...(wantsRecallLogRequest ? { activeRecallLogRequest: payload.activeRecallLogRequest } : {}),
          message: r2.patchReload === 'live'
            ? '已写入 cordis.patch.yml，热重载会在数秒内生效。'
            : '已写入 cordis.patch.yml。⚠️ 本 profile 的 patchReload 不是 live，**需要重启才生效**。',
          patchPath: r2.patchPath,
          needsRestart: r2.patchReload !== 'live',
        },
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⭐⭐ **备份与版本维护**（决策 135）——**只有人能调**，不在任何 LLM 工具里
    //
    // 🔴 为什么把"探测"与"落盘开关"分成两个接口：
    //    前端**不能**在本地假装进度（那会显示"正在初始化…"而服务端其实早失败了
    //    ⇒ 开关就在说谎）。⇒ `setup` 返回**逐步的真实结果**，前端逐行点亮；
    //    **全部成功之后**才由前端调 `/settings` 把开关存下来。
    //    ⚠️ 这样"开关已开"这个状态**必然意味着环境可用**。
    // ══════════════════════════════════════════════════════════════════════
    if (route === '/backup/status') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      const probe = await probeGit()
      const repo = await readRepoState()
      const last = await lastCommit()
      return {
        status: 200,
        body: {
          ok: true,
          gitAvailable: probe.available,
          gitVersion: probe.version,
          gitError: probe.error,
          nestedRepoAt: probe.nestedRepoAt,
          repoInitialized: repo.initialized,
          repoPath: repo.repoPath,
          identity: repo.identity,
          lastCommit: last ?? null,
          backupGit: deps.config.backupGit,
          progressCharsWarn: deps.config.progressCharsWarn,
          progressCharsKeep: deps.config.progressCharsKeep,
        },
      }
    }

    if (route === '/backup/setup') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      // ⭐ 幂等：重复调用只做必要的补齐（已存在则跳过 init/身份）。
      const r = await ensureRepo()
      const steps = [...r.steps]
      // ⭐⭐ **为所有项目建镜像基线并首次提交**（2026-09-21 补）。
      //
      // 🔴 为什么必须有这一步：镜像现在**只在 git 开关开着时才写**（用户裁定
      //    "关掉就该全停"）⇒ 若开启之前镜像不存在，那**"开启那一刻之前的历史"就没有基线**。
      //    在这里补一次，等于把"开启时的状态"钉成第一个版本——
      //    ⭐ **一开启就有完整基线**，之后每次 handoff 只需提交增量。
      // ⚠️ 失败**不阻断**开启（环境已就绪，基线可以在下次 handoff 补上）——
      //    只作为一条 step 如实回报。
      let baselineCount = 0
      if (r.ok && r.identity.name !== '') {
        try {
          const store = await import('./store.ts')
          const snap = await store.scanLibrary({ includeArchived: true })
          for (const p of snap.projects) {
            const narrative = narrativeFromProjectText(p.text)
            if (await writeNarrativeMirror(p.id, narrative)) baselineCount += 1
          }
          if (baselineCount > 0) {
            const c = await commitAll(r.identity, 'memj-handoff: 初始基线（本开关开启时建立）\n把所有项目的正文镜像登记为第一个版本')
            steps.push({
              id: 'baseline',
              label: '建立正文镜像基线',
              ok: c.ok,
              detail: c.ok
                ? `为 ${baselineCount} 个项目建了基线${c.committed && c.hash !== '' ? `（提交 ${c.hash}）` : ''}`
                : c.error,
            })
          } else {
            steps.push({ id: 'baseline', label: '建立正文镜像基线', ok: true, detail: '无需新建（镜像已是最新）' })
          }
        } catch (err) {
          steps.push({
            id: 'baseline',
            label: '建立正文镜像基线',
            ok: false,
            detail: `${err instanceof Error ? err.message : String(err)}（不影响开启，下次 handoff 会补上）`,
          })
        }
      }
      return {
        status: r.ok ? 200 : 400,
        body: {
          ok: r.ok,
          steps,
          repoPath: r.repoPath,
          identity: r.identity,
          baselineCount,
          // ⚠️ 环境不通时**不写任何配置**——由前端把开关回弹到关。
          error: r.ok ? '' : (r.steps.find((s) => !s.ok)?.detail ?? '环境准备失败'),
        },
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⭐ 修复写通道（§8.6 / 决策 88 / 89 / 91）——**只有人能调**，不在任何 LLM 工具里
    // ══════════════════════════════════════════════════════════════════════

    /** 修复非法封面：局部块替换 + 硬校验。 */
    if (route === '/fix-cover') {
      if (method !== 'POST') {
        return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      }
      let payload: {
        file?: string
        startLine?: number
        endLine?: number
        cover?: Partial<Cover>
        rawKind?: string
      }
      try {
        payload = JSON.parse(rawBody) as typeof payload
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      const file = payload.file ?? ''
      const startLine = Number(payload.startLine ?? 0)
      const endLine = Number(payload.endLine ?? 0)
      if (file === '' || startLine < 1 || endLine < 1) {
        return { status: 400, body: { ok: false, error: '缺少 file / startLine / endLine' } }
      }
      const raw = payload.cover ?? {}
      // 组装成 Cover；类型细节交给 validateCoverShape 判（它才是唯一权威）。
      const cover: Cover = {
        id: typeof raw.id === 'string' ? raw.id.trim() : '',
        project: typeof raw.project === 'string' ? raw.project.trim() : '',
        theme: Array.isArray(raw.theme) ? raw.theme.map((t) => String(t).trim()).filter((t) => t !== '') : [],
        global: raw.global === true,
        kind: isEntryKind(raw.kind) ? raw.kind : '',
        tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim()).filter((t) => t !== '') : [],
        // ⭐ `title` 也是封面字段（决策 98）——修复表单必须能带上它，
        //    否则"修好一个非法封面"会把标题**静默丢掉**（然后又被判缺 title）。
        title: typeof raw.title === 'string' ? raw.title : '',
        desc: typeof raw.desc === 'string' ? raw.desc : '',
        ref: typeof raw.ref === 'string' ? raw.ref.trim() : '',
        ext: raw.ext === true,
        // ⭐ 时间（决策 119）：修复表单**不带**这两个字段 ⇒ 传空串，
        //    由 `fixCoverBlock` 从**原文里继承**（修复不该改创建/更新时间）。
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
        // ⭐ 归档时间（决策 133）：**同理从原文继承**。
        //    🔴 否则"修好一个非法封面"会**静默把它解除归档**——一条本该雪藏的知识
        //    会因为一次格式修复而重新出现在检索里，而人毫无察觉。
        archivedAt: typeof raw.archivedAt === 'string' ? raw.archivedAt : '',
      }
      // ⚠️ `kind` 是受控四值：填了非法值要能报出来，而不是被静默落成空串。
      const rawKind = typeof payload.rawKind === 'string' ? payload.rawKind : (typeof raw.kind === 'string' ? raw.kind : undefined)
      const result = await fixCoverBlock(file, startLine, endLine, cover, rawKind)
      // ⚠️ `result` 自身带 `ok: false`，不要再写一遍（TS 会报重复键）。
      if (!result.ok) return { status: 400, body: { ...result } }
      return { status: 200, body: { ok: true } }
    }

    /** 断链修复：只允许改 `ref`（§12-78 不允许改 ext）。 */
    if (route === '/fix-ref') {
      if (method !== 'POST') {
        return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      }
      let payload: { file?: string; startLine?: number; endLine?: number; ref?: string }
      try {
        payload = JSON.parse(rawBody) as typeof payload
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      const file = payload.file ?? ''
      const startLine = Number(payload.startLine ?? 0)
      const endLine = Number(payload.endLine ?? 0)
      const ref = payload.ref ?? ''
      if (file === '' || startLine < 1 || endLine < 1) {
        return { status: 400, body: { ok: false, error: '缺少 file / startLine / endLine' } }
      }
      // ⚠️ 外部引用的 ref 必须是**绝对路径**（§2.5）。
      if (!isAbsolutePath(ref.trim())) {
        return { status: 400, body: { ok: false, error: '外部引用的 ref 必须是绝对路径' } }
      }
      const result = await fixExternalRef(file, startLine, endLine, ref)
      // ⚠️ 同上：`result` 自带 `ok`。
      if (!result.ok) return { status: 400, body: { ...result } }
      return { status: 200, body: { ok: true } }
    }

    // ── POST /reading/ask：「文档内提问」的入口（2026-10-14）──
    //    ⭐ 前端在阅读页选中一段、点「就此提问」⇒ 调这里。
    //    ⚠️ 它**开真实 DSH 会话**（`agents.create` + `followup`）⇒
    //       是整个功能唯一"碰运行时"的入口，错误必须如实回给前端。
    if (route === '/reading/ask') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let p: { entryId?: unknown; anchor?: unknown; question?: unknown }
      try { p = JSON.parse(rawBody) as typeof p } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      const entryId = typeof p.entryId === 'string' ? p.entryId.trim() : ''
      const question = typeof p.question === 'string' ? p.question.trim() : ''
      if (entryId === '' || question === '') {
        return { status: 400, body: { ok: false, error: '缺少 entryId 或 question' } }
      }
      // ⭐ 锚点四元组：缺字段 ⇒ 400（前端构造不完整，别让后端猜）。
      //
      // 🔴🔴 **2026-10-20 改：`blockId` 允许为空**（原来空 ⇒ 400）。
      //
      //    用户报："同一篇里有的地方能出现就此提问、有的地方没反应。"
      //    根因是两层，这是第二层：有些块（块引用 / 多行表格）前端**匹配不到
      //    `data-block-id`** ⇒ 拿不到 blockId。原来前端干脆不弹工具条，
      //    而**即便弹了也会被这里 400 掉** —— 两道门都得开。
      //
      //    ⭐ 判据：**`exact`（用户选中的原文）才是这个功能的必要信息**，
      //      `blockId` 只决定"这段讨论归到哪一块"——它是**分类**，不是**前提**。
      //      ⇒ 缺 blockId 时降级成"一条独立绑定"，而不是拒绝整个请求。
      //
      //    ⚠️ **`exact` 仍然必须有**：没有它问答条目就失去"这段是在说哪段"
      //      ⇒ 后端没法 `makeAnchor`，`renderAskPrompt` 也引不出原文。
      const a = (p.anchor ?? {}) as Record<string, unknown>
      const anchor = {
        blockId: typeof a['blockId'] === 'string' ? a['blockId'] : '',
        index: typeof a['index'] === 'number' ? a['index'] : 0,
        exact: typeof a['exact'] === 'string' ? a['exact'] : '',
        prefix: typeof a['prefix'] === 'string' ? a['prefix'] : '',
        suffix: typeof a['suffix'] === 'string' ? a['suffix'] : '',
      }
      if (anchor.exact === '') {
        return { status: 400, body: { ok: false, error: 'anchor 不完整（缺 exact：用户选中的原文）' } }
      }
      // ⚠️ `readingAskDeps` 需要 ctx ⇒ 由 `index.ts` 通过 deps 传进来
      //    （`handleApi` 的既有签名不带 ctx，见该函数的 `deps` 形状）。
      const ask = deps.readingAsk
      if (ask === undefined) {
        return { status: 500, body: { ok: false, error: 'reading/ask 未装配（插件缺 readingAsk 依赖）' } }
      }
      const r = await askAboutSelection({ entryId, anchor, question }, ask)
      if (!r.ok) return { status: 400, body: { ok: false, error: r.error } }
      return {
        status: 200,
        body: {
          ok: true,
          sessionId: r.sessionId,
          chatEntryId: r.chatEntryId,
          // ⭐ 复用与否要回给前端：复用时**不该**再跳一次会话（用户已经在看别的了），
          //    前端可以据此决定"跳过去"还是"只提示已加入"。
          reused: r.reused,
        },
      }
    }

    // ── GET /reading/bindings：某条目下已讨论过的段落（2026-10-14 第 6 期）──
    //    ⭐ 阅读页靠它画**段落标记**：哪些段落已经有会话、点它能跳到哪条 chat 条目。
    //    🔴 **一次回全部**（不是逐段查）—— 页面渲染时要对每个块判"有没有标记"，
    //       逐段请求会打出几十个 HTTP。
    if (route === '/reading/bindings') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      const entryId = params.get('entryId') ?? ''
      if (entryId === '') return { status: 400, body: { ok: false, error: '缺少 entryId' } }
      const all = await bindingsForEntry(entryId)
      // ⭐ **回结构化条目**（本项目铁律：能给人看的列表必须由服务端回结构化条目，
      //    不要让前端拿 id 再去拼 —— 那样判据会有第二份实现）。
      return {
        status: 200,
        body: {
          ok: true,
          entryId,
          bindings: all.map((b) => ({
            blockId: b.anchor.blockId,
            exact: b.anchor.exact,
            chatEntryId: b.chatEntryId,
            sessionId: b.sessionId,
            createdAt: b.createdAt,
          })),
        },
      }
    }

    // ── GET /reading/blocks：**服务端算好的块 id**（2026-10-14 第 6 期）──
    //
    // 🔴🔴 **为什么必须有这个接口**（真机探针抓到的设计缺陷）：
    //    前端要从 DOM 反推块 id 才能画段落标记，而 DOM 里的文本是**渲染后**的
    //    （markdown 的 `**粗体**` 已经变成了 `<strong>`，`textContent` 里**没有 `**`**）
    //    ⇒ 前端按 `textContent` 算哈希，与后端按 **markdown 原文**算的**永远对不上**
    //    ⇒ 段落标记永远不显示（而**不报任何错**）。
    //    ⭐ 实例：`三科均满分 100、**70 分（含）以上合格**` 两边算出
    //      `1mpx8by` vs `191ccmm` —— 差的就是那两个 `**`。
    //
    //    ⇒ ⭐ **判据：内容哈希必须由【拥有原文的那一侧】算** ——
    //      前端没有原文（只有渲染结果），就不该自己算。
    //      前端拿到这份清单后**按渲染后的文本匹配 DOM**（见 `markReadingBlocks`）。
    if (route === '/reading/blocks') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      const entryId = params.get('entryId') ?? ''
      if (entryId === '') return { status: 400, body: { ok: false, error: '缺少 entryId' } }
      const snap = await scanLibrary({ includeArchived: true, includeHistory: true })
      const found = snap.covers.find((c) => c.cover.id === entryId)
      if (found === undefined) return { status: 404, body: { ok: false, error: '库里没有这张封面' } }
      const doc = await loadEntryDoc(found.cover.ref, found.cover.ext)
      if (doc === undefined) return { status: 200, body: { ok: true, entryId, blocks: [] } }
      const blocks = extractReadingBlocks(doc.body)
      return { status: 200, body: { ok: true, entryId, blocks } }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⭐⭐⭐ **面板内升级**（2026-10-20，用户要求）
    //
    //  用户原话：*"我希望在面板上加升级方案，应该参考 bili-scroll 本地我的分支
    //              版本的面板内升级方案…… 提示入口可以放在头部记忆库基础信息的右边。"*
    //  ⭐ 照 `@jojoman2024/dsh-bili-scroll@0.1.9` 的判据抄（见 `upgrade.ts` 的模块头）。
    // ══════════════════════════════════════════════════════════════════════
    if (route === '/update') {
      // ⚠️ 只读操作，**GET**（前端头部会自动预热一次；也允许手动点"检查更新"）。
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      // ⚠️ **永远不抛**（`checkUpdate` 内部已 catch）—— 网络失败也要给前端一个能显示的对象，
      //    否则头部会因为没有数据而**什么都不显示**，用户以为没这个功能。
      const r = await checkUpdate()
      return { status: 200, body: r }
    }

    if (route === '/upgrade') {
      if (method !== 'POST') return { status: 405, body: { ok: false, error: '该接口只接受 POST' } }
      let p: { version?: unknown } = {}
      try {
        p = JSON.parse(rawBody) as typeof p
      } catch {
        return { status: 400, body: { ok: false, error: '请求体不是合法 JSON' } }
      }
      const want = typeof p.version === 'string' ? p.version.trim() : ''
      // 🔴 **必须带明确版本号**：profile 里写的是精确版本，只给包名时
      //    pnpm 会说 "Already up to date" 什么也不做（bili-scroll 实测）。
      if (want === '') {
        return { status: 400, body: { ok: false, error: '缺少 version（要升到哪个版本）' } }
      }
      const r = startUpgrade(want, upgradeLogPath(libraryRoot()))
      return { status: r.ok ? 200 : 500, body: r }
    }

    if (route === '/upgrade/status') {
      if (method !== 'GET') return { status: 405, body: { ok: false, error: '该接口只接受 GET' } }
      const st = upgradeStatus(upgradeLogPath(libraryRoot()))
      // ⚠️ 顺手把内存日志落盘一次（很小），让"重启后还能查上次升级为什么失败"成立。
      //    判据：**只存内存的状态，重启后界面会撒谎**（本项目记过这条）。
      if (st.log !== '') appendLogFile(st.logFile, st.log)
      return { status: 200, body: { ok: true, ...st } }
    }

    return { status: 404, body: { ok: false, error: `未知的 API 路径：${route}` } }
  } catch (err) {
    return { status: 500, body: { ok: false, error: err instanceof Error ? err.message : String(err) } }
  }
}

/** 供未来页面使用：显式忽略未用参数，保持签名稳定。 */
export type { IncomingMessage, ServerResponse }

/** 清空提名（人侧维护用；不在 LLM 工具里）。 */
export async function clearNominations(): Promise<void> {
  await writeNominations([])
}
