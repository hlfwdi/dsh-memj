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

import { resolveRef } from './paths.ts'
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
  validateTemplate,
  type Template,
} from './templates.ts'
import { templatesDir } from './paths.ts'
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
} from './store.ts'
import { themeDocPath } from './paths.ts'
import { isAbsolutePath, parseCovers } from './parse.ts'
import { isEntryKind } from './schema.ts'
// ⭐⭐ 英文召回索引的「检查并补全」（判据与启动兜底**同源**，见 `en-index.ts`）。
import { checkAndRepair } from './en-index.ts'
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
  setThemeDesc,
  setThemeFields,
  unarchiveEntry,
  unarchiveProject,
} from './edit.ts'
import type { Cover } from './schema.ts'
import type { MemjConfig } from './config.ts'
import { PROGRESS_WARN_MAX, PROGRESS_WARN_MIN, THEME_CREATION_VALUES, readSettings, writeSetting } from './settings.ts'
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
import { itemMinOf, maxInjectionsPerTurn, needMinOf } from './config.ts'
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
import { lastChatDiagnostic } from './active-recall.ts'
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
}

/** 一次 API 结果。 */
export interface ApiResult {
  status: number
  body: unknown
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
      return {
        status: 200,
        body: {
          ok: true,
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
                'projectFields / projectDesc / renameProject / deleteProject / archiveProject / ' +
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
        sections: t.sections.map((s) => ({ name: s.name, desc: s.desc, truncate: s.truncate === true })),
        // ⭐ 内置的 default **不可删**（它是回落目标）。
        deletable: t.id !== 'default',
        errors: validateTemplate(t),
      }))
      return { status: 200, body: { ok: true, items, dir: templatesDir() } }
    }

    // 保存一份模板（**校验在前，不过不写盘**）。
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
      if (t.id === 'default') {
        return { status: 400, body: { ok: false, error: '`default` 是内置模板，不可覆盖（可以另建一个 id）。' } }
      }
      const errs = await saveTemplate(t)
      return { status: errs.length === 0 ? 200 : 400, body: { ok: errs.length === 0, errors: errs } }
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
        // ⭐ 复用召回通路的 JEV 凭据解析（正规通道 credentials → 环境变量），
        //    与 `active-recall.ts` 的 `resolveJevKey` 同源。
        const name = deps.config.activeInjectJevApiKeyEnv || ''
        let key: string | undefined
        if (name !== '') {
          try {
            const creds = (deps.getService?.('credentials') as
              | { resolve?: (n: string) => Promise<{ value?: unknown }> }
              | undefined)
            const got = await creds?.resolve?.(name)
            if (typeof got?.value === 'string' && got.value !== '') key = got.value
          } catch {
            /* 正规通道取不到就退环境变量的路 */
          }
          if (key === undefined) {
            const env = process.env[name]
            if (typeof env === 'string' && env !== '') key = env
          }
        }
        const ready = typeof key === 'string' && key !== ''
        return {
          status: 200,
          body: {
            ok: true,
            ready,
            envName: name,
            reason: ready
              ? ''
              : '未检测到 JEV 凭据（credentials 与对应环境变量均为空），选了 jev 通路会在运行期调用失败。'
          }
        }
      } catch (err) {
        return { status: 500, body: { ok: false, error: err instanceof Error ? err.message : String(err) } }
      }
    }

    if (route === '/settings') {
      if (method === 'GET') {
        const r = await readSettings(deps.baseUrl, deps.config, deps.pluginId)
        return {
          status: 200,
          body: {
            ok: true,
            // ⭐ 只透出**本面板管的项**——不把整份配置倒给前端。
            themeCreation: r.config.themeCreation,
            // ⭐ 压缩阈值（决策 127 的触发条件；用户要求做成旋钮）。
            progressCharsWarn: r.config.progressCharsWarn,
            // ⭐⭐ 截断目标（决策 136）：超过阈值后自动截到 ≤ 本值。
            progressCharsKeep: r.config.progressCharsKeep,
            // ⭐ git 版本维护开关（决策 135；台账开关已在决策 136 删除）。
            backupGit: r.config.backupGit,
            // ⭐⭐ 热知识（热知识方案 §10）——预算类旋钮放主设置面板（用户裁定）。
            hotInject: r.config.hotInject,
            hotInjectRatio: r.config.hotInjectRatio,
            hotCharsPerToken: r.config.hotCharsPerToken,
            hotBudgetCharsFallback: r.config.hotBudgetCharsFallback,
            hotFullWarnChars: r.config.hotFullWarnChars,
            hotSessionKeep: r.config.hotSessionKeep,
            // ⭐⭐⭐ 知识评分（决策 177；属**热知识注入**板块）
            hotScoreOnTurnEnd: r.config.hotScoreOnTurnEnd,
            hotScoreThreshold: r.config.hotScoreThreshold,
            hotScoreWindowHours: r.config.hotScoreWindowHours,
            hotScoreTopN: r.config.hotScoreTopN,
            hotScoreGateMinScore: r.config.hotScoreGateMinScore,
            hotScoreGateLastTurn: r.config.hotScoreGateLastTurn,
            hotScoreMaxPicks: r.config.hotScoreMaxPicks,
            hotScoreMinChars: r.config.hotScoreMinChars,
            hotScoreChannel: r.config.hotScoreChannel,
            hotScoreModel: r.config.hotScoreModel,
            hotScoreSubagentProvider: r.config.hotScoreSubagentProvider,
            hotScoreSubagentModel: r.config.hotScoreSubagentModel,
            hotScoreTimeoutMs: r.config.hotScoreTimeoutMs,
            // ⭐⭐ 英文召回索引（设计文档 §9）：翻译模型 / 模板 / 并发 / 诊断
            enIndex: r.config.enIndex,
            enIndexDiag: r.config.enIndexDiag,
            translateProvider: r.config.translateProvider,
            translateModel: r.config.translateModel,
            translateTemplate: r.config.translateTemplate,
            translateConcurrency: r.config.translateConcurrency,
            translateRetries: r.config.translateRetries,
            translateTimeoutMs: r.config.translateTimeoutMs,
            translateMaxTokens: r.config.translateMaxTokens,
            // ⭐⭐⭐ 标签规范化（决策 162）：裁决模型（B 层）。
            tagNormalizeProvider: r.config.tagNormalizeProvider,
            tagNormalizeModel: r.config.tagNormalizeModel,
            tagNormalizeTimeoutMs: r.config.tagNormalizeTimeoutMs,
            tagNormalizeMaxTokens: r.config.tagNormalizeMaxTokens,
            // ⭐ 决策 165：轮次结束有沉淀时**自动**跑（默认开）。
            tagNormalizeOnHandoff: r.config.tagNormalizeOnHandoff,
            // ⭐ 决策 168：裁决模型的思考等级（默认 off）。
            tagNormalizeReasoningEffort: r.config.tagNormalizeReasoningEffort,
            // ⭐⭐ 主动注入（设计文档 §10.1）：开关 / 通路 / 模型 / 范围 / 触发口径 / 阈值
            activeInject: r.config.activeInject,
            activeInjectChannel: r.config.activeInjectChannel,
            activeInjectModel: r.config.activeInjectModel,
            activeInjectScope: r.config.activeInjectScope,
            activeInjectJevNarrowScope: r.config.activeInjectJevNarrowScope,
            activeInjectStrict: r.config.activeInjectStrict,
            activeInjectTopK: r.config.activeInjectTopK,
            // ⭐ 回显**生效值**（走回落函数）—— 旧键有值、新键没写时，
            //   面板要显示"实际在用的那个数"，而不是空白（否则用户一存就把回落值写没了）。
            activeInjectNeedMin: needMinOf(r.config),
            activeInjectItemMin: itemMinOf(r.config),
            activeInjectBand: r.config.activeInjectBand,
            activeInjectTimeoutMs: r.config.activeInjectTimeoutMs,
            activeInjectContextRounds: r.config.activeInjectContextRounds,
            activeInjectPoolMax: r.config.activeInjectPoolMax,
            activeInjectExplain: r.config.activeInjectExplain,
            activeInjectSearchIntentGate: r.config.activeInjectSearchIntentGate,
            activeInjectSearchIntentMin: r.config.activeInjectSearchIntentMin,
            activeInjectSufficientGate: r.config.activeInjectSufficientGate,
            activeInjectSufficientMin: r.config.activeInjectSufficientMin,
            // ⭐ 2026-09-27：新键（每 turn 最多**注入**几次）。
            //    ⚠️ 解析后回显（含旧键回落）—— 面板显示的是**真正生效的值**，
            //       而不是"新键写没写"（否则旧配置会显示成空白/0，让用户误以为丢了设置）。
            activeInjectMaxInjectionsPerTurn: maxInjectionsPerTurn(r.config),
            activeInjectReasoningMaxChars: r.config.activeInjectReasoningMaxChars,
            // ⭐⭐⭐ 预算与拆批（用户 2026-09-26 定稿方案）
            activeInjectBudget: r.config.activeInjectBudget,
            activeInjectBudgetTokens: r.config.activeInjectBudgetTokens,
            activeInjectContextTokens: r.config.activeInjectContextTokens,
            activeInjectConcurrency: r.config.activeInjectConcurrency,
            activeInjectChatWindowRatio: r.config.activeInjectChatWindowRatio,
            // ⚠️ 已作废（保留字段，见 config.ts）
            activeInjectPoolMin: r.config.activeInjectPoolMin,
            // ⭐⭐ 召回日志的"请求快照"档（B 档；默认关）。
            activeRecallLogRequest: r.config.activeRecallLogRequest,
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
      // ⭐⭐ 主动注入（设计文档 §10.1）
      const wantsActive = payload.activeInject !== undefined
      const wantsActiveChannel = payload.activeInjectChannel !== undefined
      const wantsActiveModel = payload.activeInjectModel !== undefined
      const wantsActiveScope = payload.activeInjectScope !== undefined
      const wantsActiveJevNarrow = payload.activeInjectJevNarrowScope !== undefined
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
              '`tagNormalizeReasoningEffort` 之一。',
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
