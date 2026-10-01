/**
 * 库根与路径解析（方案 §2.2 / §2.5）。
 *
 * ```
 * ~/.dsh-memj/                    # ★ 整个库 = 一个目录，拷走即迁移
 * ├─ projects/HANDOFF-<项目>.md   # 项目层：唯一写入源头（六节叙事 + 底部封面清单）
 * ├─ entries/<slug>-<uuid8>.md    # 内部条目正文（一条知识一个文档）
 * ├─ themes/THEME-<id>.md         # 主题层：派生
 * ├─ GLOBAL.md                    # 全局层：派生
 * ├─ reads/session-<id>.jsonl     # 读快照（一个会话一个文件）
 * ├─ doc-reads/session-<id>.jsonl # ⭐ 项目文档读记录（决策 112，与读快照平行）
 * ├─ nominations.json             # 待批 global 提名
 * ├─ backup/                      # ⭐⭐ 备份与版本维护（决策 135 / 136）
 *     ├─ .git/                    # git 仓库根
 *     ├─ .gitignore               # 白名单（只放行 narrative/<项目>.md）
 *     └─ HANDOFF-<项目>.md        # 正文镜像（git 维护的对象，无封面）
 * ```
 *
 * 🔴 **`backup/` 不在任何既有消费者的扫描范围内**：`scanLibrary()` 只扫 `projects/`
 *    （见 `store.ts`），所以新增这个目录**对既有逻辑零影响**。
 *
 * ⭐⭐ **镜像不再放子目录**（决策 136，用户裁定）：以前是 `backup/narrative/`，
 *    现在直接在 `backup/` 根下 —— 因为**台账（`backup/snapshot/`）已删除**，
 *    备份目录里只剩镜像一类东西，再套一层子目录没有收益（只有更长的路径）。
 *
 * 🔴 **为什么是用户主目录**（§2.2 的三选一）：
 *  - 放工作区 ⇒ 与「取用不靠物理路径」冲突，且没法整体迁移；
 *  - 放 `$DSH_HOME` ⇒ 绑死具体安装，换版本要搬，且多实例各一份又回到同步老路；
 *  - `~/.dsh-memj/` ⇒ 脱离工作区与实例，**拷一个目录即完成迁移**。
 *
 * @module dsh-memj/paths
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * 库根：`$MEMJ_DATA_DIR`（为空则回落 `~/.dsh-memj`）。
 *
 * ⚠️ **空白环境变量视为未设置**——沿用 `dsh-home-paths` 对 `$DSH_HOME` 的同一约定，
 * 避免 `MEMJ_DATA_DIR=` 这种写法把库根解析成空串。
 * @returns 库根绝对路径。
 */
export function libraryRoot(): string {
  const override = process.env['MEMJ_DATA_DIR']
  if (override !== undefined && override.trim() !== '') return resolve(override.trim())
  return join(homedir(), '.dsh-memj')
}

/** 项目文档目录（唯一写入源头）。 */
export function projectsDir(): string {
  return join(libraryRoot(), 'projects')
}

/** 内部条目正文目录。 */
export function entriesDir(): string {
  return join(libraryRoot(), 'entries')
}

/** 主题派生文档目录。 */
export function themesDir(): string {
  return join(libraryRoot(), 'themes')
}

/** 全局层派生文档。 */
export function globalDocPath(): string {
  return join(libraryRoot(), 'GLOBAL.md')
}

/** 读快照目录。 */
export function readsDir(): string {
  return join(libraryRoot(), 'reads')
}

/**
 * ⭐ **项目文档读记录目录**（决策 112）。
 *
 * 🔴 **为什么不复用 `reads/`**：读快照的语义是"**跨项目证据**"
 * （参与新建主题的闸门判定），且它的结构是**知识封面专用**
 * （`entryId`/`theme`/`owner`）——装不下一份项目文档。
 * 混在一起会让"读过别项目知识"与"读过本项目文档"互相污染。
 */
export function docReadsDir(): string {
  return join(libraryRoot(), 'doc-reads')
}

/** 提名文件。 */
export function nominationsPath(): string {
  return join(libraryRoot(), 'nominations.json')
}

/**
 * ⭐⭐ **主动召回的调用日志目录**（2026-09-27 新增）。
 *
 * 🔴🔴 **为什么必须有它**（用户原话：*"主动召回注入有专门的日志吗？我觉得应该要维护个
 *    日志记录每次得调用详情，不然调试起来太麻烦了。"*）：
 *    在此之前，召回的结论**只在内存里**（`activeState.last` 那几个 Map）——
 *    ⚠️ 于是有**三重丢失**：① 重启即失；② `last` 只留**最近一次**（前几次被覆盖）；
 *    ③ 连"三个总控分数"（`need`/`sufficient`/`search_intent`）**算完就丢**。
 *    实测后果：用户报"看不到注入"时，只能**解压会话日志反推**——因为插件自己什么都没记。
 *
 * ⚠️ **为什么不复用 `reads/`**（同 `docReadsDir` 的理由）：
 *    那个的语义是"**跨项目证据**"（参与新建主题的闸门），结构是**知识封面专用**；
 *    混在一起会让"读过什么知识"与"召回判了什么"互相污染。
 */
export function recallLogDir(): string {
  return join(libraryRoot(), 'recall-log')
}

/**
 * 某会话的**主动召回日志**：`recall-log/session-<id>.jsonl`（一行一次调用）。
 * @param sessionId - 会话 id。
 * @returns 日志文件绝对路径。
 */
export function recallLogPath(sessionId: string): string {
  return join(recallLogDir(), `session-${safeName(sessionId)}.jsonl`)
}

/**
 * ⭐⭐⭐ **知识评分日志目录**：`<库根>/score-log/`（决策 177）。
 *
 * 🔴 **为什么不复用 `recall-log/`**（同 `docReadsDir` / `recallLogDir` 的理由）：
 *    那个的语义是"**主动召回**（实时、逐 step）判了什么"；
 *    这个是"**轮末复盘评分**（逐 turn）给谁加了分"。
 *    两者**时机、判据、频率都不同** ⇒ 混在一起会让"召回判了什么"与"复盘评了什么"互相污染，
 *    而且排障时无法按类型过滤。
 */
export function scoreLogDir(): string {
  return join(libraryRoot(), 'score-log')
}

/**
 * 某会话的**评分日志**：`score-log/session-<id>.jsonl`（一行一次评分）。
 * @param sessionId - 会话 id。
 * @returns 日志文件绝对路径。
 */
export function scoreLogPath(sessionId: string): string {
  return join(scoreLogDir(), `session-${safeName(sessionId)}.jsonl`)
}

/**
 * ⭐⭐⭐ **知识评分表**：`<库根>/hot/scores.json`（决策 177）。
 *
 * ⚠️ **它放在 `hot/` 下**（与 `persona/entries/selection/sessions` 同目录）——
 *    因为它服务的是**热知识注入**（用户裁定：*"这个功能其实是属于热知识注入的板块"*），
 *    与 `hot/` 其余文件的**生命周期、归属（按项目）都一致**。
 *
 * 🔴 **它是 source data、不是 derived data**（同 `tags/vocabulary.json` 的道理，
 *    但**更弱一档**）：分数是**积累出来的**，删了要重新攒；
 *    ⚠️ 但它**有天然的自我修复**（每轮复盘都会重新加分）⇒ 丢了不会永久损失，
 *    只是"前 20 名"会空一阵子。⇒ ⭐ **不必像词表那样严防"重建"**，
 *    但**也不要主动删**（那会让功能退化成"从零开始"）。
 */
export function scoreFilePath(): string {
  return join(hotDir(), 'scores.json')
}

/**
 * ⭐⭐⭐ **标签规范词表目录**：`<库根>/tags/`（决策 162）。
 *
 * 🔴🔴 **它与 `recall/`（英文召回索引）是【两种数据】，健康检查的方式完全不同**：
 *
 * | | `recall/en-index.json` | `tags/vocabulary.json` |
 * |---|---|---|
 * | 怎么来 | **纯投影**（重翻一遍就能重建） | **积累的判断**（人和 LLM 的裁决） |
 * | 丢了怎么办 | 重跑就有 | 🔴 **永久丢失** |
 * | 所以 | "全量重建 + diff" | ⚠️ **只能增量对账，绝不能重建** |
 *
 * ⇒ 它是 **source data，不是 derived data**。⚠️ 别照抄 `en-index` 那套"重建"逻辑
 * （那会把积累的裁决**静默抹掉**，而且看起来像"修好了"）。
 */
export function tagsDir(): string {
  return join(libraryRoot(), 'tags')
}

/**
 * 标签规范词表的唯一落盘位置：`tags/vocabulary.json`（决策 162）。
 *
 * ⚠️ **`lastRunAt`（水位线）与词表【同一个文件】**（用户 2026-09-28 裁定）——
 * 它俩要么一起更新、要么一起不动：若分两个文件，就会出现
 * "水位线推了、词表没落盘" ⇒ **那批新 tag 永久跳过**（下次水位线已经越过它们了）。
 */
export function tagVocabularyPath(): string {
  return join(tagsDir(), 'vocabulary.json')
}

/**
 * ⭐⭐⭐ 自动规范化的**记账**位置：`tags/auto-state.json`（决策 167）。
 *
 * 🔴 **为什么要有它**：决策 165 的"三层门"里，门②/门③ 靠**读会话日志**判断，
 *    而两者都失效 —— 门② 是**会话级**判据（一旦落过知识就永远为真，
 *    ⇒ **之后每一轮都起子代理**）；门③ 去查父会话里的 `memj_normalize_tags`
 *    调用，而**那次调用在子会话里**（⇒ 父会话永远看不到 ⇒ **去重恒不生效**）。
 *
 * ⭐ **用户给的判据**（2026-09-28）：*"应该是只有有知识沉淀的轮次才跑啊，
 *    这个需要插件用脚本去校验。"*
 *    ⇒ 改成**插件自己在落知识那一刻记一笔**（**轮次**为单位），不再事后读日志猜。
 *
 * ⚠️ 它是**优化去重**用的：损坏/丢失的最坏后果只是"多起一次子代理"，
 *    ⇒ 读取一律回空、**绝不让轮次结束失败**。
 */
export function tagAutoStatePath(): string {
  return join(tagsDir(), 'auto-state.json')
}

// ───────────────────────────────────────────────────────────────────────────
// ⭐⭐ 备份与版本维护（决策 135）
//
// 🔴 **为什么三类路径必须收在这里**：本项目"两份实现必然漂移"的老坑。
//    备份模块、git 模块、探针都要拼这些路径 ⇒ 只允许有一处实现。
// ───────────────────────────────────────────────────────────────────────────

/**
 * 备份根目录：`<库根>/backup/`（决策 135 / 136）。
 *
 * ⭐ **它既是数据目录、也是 git 仓库的根**（`.git` 就在它里面）
 * ⇒ 整个 `backup/` 是一个**可整体搬走 / 可整体删除**的单元。
 */
export function backupDir(): string {
  return join(libraryRoot(), 'backup')
}

/**
 * 某项目的**正文镜像**路径：`backup/HANDOFF-<项目>.md`。
 *
 * ⭐⭐ **不再有 `narrative/` 子目录**（决策 136，用户裁定）：
 *    台账（`backup/snapshot/`）已删除，备份目录里只剩镜像一类东西
 *    ⇒ 再套一层子目录没有收益。
 *
 * ⚠️ **与活跃文档同名、不同目录**（`projects/HANDOFF-<项目>.md`）——
 * 靠目录区分，不引入第二套命名规则。
 * @param projectId - 项目 id。
 * @returns 绝对路径。
 */
export function backupNarrativePath(projectId: string): string {
  return join(backupDir(), `HANDOFF-${safeName(projectId)}.md`)
}

/**
 * 某会话的读快照文件：`reads/session-<id>.jsonl`（§3.8.1）。
 * @param sessionId - 会话 id。
 * @returns 快照文件绝对路径。
 */
export function readLogPath(sessionId: string): string {
  return join(readsDir(), `session-${safeName(sessionId)}.jsonl`)
}

/**
 * ⭐ 某会话的**项目文档读记录**：`doc-reads/session-<id>.jsonl`（决策 112）。
 * @param sessionId - 会话 id。
 * @returns 读记录文件绝对路径。
 */
export function docReadLogPath(sessionId: string): string {
  return join(docReadsDir(), `session-${safeName(sessionId)}.jsonl`)
}

/** 某项目的 handoff 文档路径。 */
export function projectDocPath(projectId: string): string {
  return join(projectsDir(), `HANDOFF-${safeName(projectId)}.md`)
}

/** 某主题的派生文档路径。 */
export function themeDocPath(themeId: string): string {
  return join(themesDir(), `THEME-${safeName(themeId)}.md`)
}

/**
 * 内部条目的正文路径（库内相对路径，§2.5）。
 *
 * **库里存的 `ref` 就是这个相对形式**（`entries/<slug>-<uuid8>.md`），
 * 迁移时不受任何影响。
 * @param slug - 英文短名。
 * @param uuid - 完整 UUID（取前 8 位入文件名）。
 * @returns 相对库根的路径，**始终用正斜杠**。
 */
export function entryRelPath(slug: string, uuid: string): string {
  return `entries/${entryFileName(slug, uuid)}`
}

/**
 * 条目文件名：`<slug>-<uuid前8位>.md`（§3.4）。
 * @param slug - 英文短名。
 * @param uuid - 完整 UUID。
 * @returns 文件名。
 */
export function entryFileName(slug: string, uuid: string): string {
  const safeSlug = slug.trim() === '' ? 'entry' : slug.trim()
  return `${safeSlug}-${uuid.slice(0, 8)}.md`
}

/**
 * 把库内相对路径解析成绝对路径。
 *
 * ⚠️ **拒绝逃逸出库根**——外部的 `ref` 可能来自人手改的文档，
 * 不校验会让 `../../` 读到库外。
 * @param rel - 库内相对路径。
 * @returns 绝对路径；逃逸或为空时返回 `undefined`。
 */
export function resolveInsideLibrary(rel: string): string | undefined {
  const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (normalized.length === 0) return undefined
  // 逐段检查深度，避免 `a/../..` 这类绕过。
  let depth = 0
  for (const segment of normalized.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      depth -= 1
      if (depth < 0) return undefined
      continue
    }
    depth += 1
  }
  return join(libraryRoot(), ...normalized.split('/').filter((s) => s !== '' && s !== '.'))
}

/**
 * 解析封面 `ref` 指向的正文绝对路径（§3.3 / §3.6）。
 *
 * - **内部条目**：库内相对路径 ⇒ 拼到库根；
 * - **外部引用**（`ext: true`）：`ref` 是绝对路径，**原样使用**。
 * @param ref - 封面上的 ref。
 * @param ext - 是否为外部引用。
 * @returns 绝对路径；内部路径逃逸时返回 `undefined`。
 */
export function resolveRef(ref: string, ext: boolean): string | undefined {
  if (ext) return ref
  return resolveInsideLibrary(ref)
}

/**
 * ⭐⭐ **热知识注入**（`hot/`）——四类路径收在这里（与 `backup/` 同一理由）。
 *
 * 🔴 **为什么整块放进 `hot/` 而不是塞进既有文件**：
 * `scanLibrary()` **只扫 `projects/`** ⇒ 放进 `hot/` ⇒
 * **天然不进知识库列表、不进 `memj_search`、不参与任何工具调用**
 * （达成"用户画像与热知识不可见、不入工具"的要求，**零过滤代码**）。
 * ⭐ 与决策 135 的 `backup/` 是**同一手法**。
 */
export function hotDir(): string {
  return join(libraryRoot(), 'hot')
}

/** 用户画像（**多条列表**，人编；§5.2）。 */
export function hotPersonaPath(): string {
  return join(hotDir(), 'persona.json')
}

/** 逐条的「纳入 / 通道 / 形态 / 置顶」设置（§5.3）。 */
export function hotEntriesPath(): string {
  return join(hotDir(), 'entries.json')
}

/** ⭐ **逐项目**的「已选热知识清单」（§5.3b，与 `entries.json` 正交）。 */
export function hotSelectionPath(): string {
  return join(hotDir(), 'selection.json')
}

/** 会话 → 项目绑定 + 判定开关 + 最新活跃时间（§5.4）。 */
export function hotSessionsPath(): string {
  return join(hotDir(), 'sessions.json')
}

/**
 * ⭐⭐⭐ **提示词覆盖目录**（本页成为"提示词唯一源头"的落点）。
 *
 * 🔴🔴 **为什么放在库根、而不是插件仓**：
 *  - 它是**用户数据**（用户在页面上改出来的东西），而插件仓是**交付物**——
 *    交付物会被升级/覆盖，放进去等于把用户改动一起冲掉；
 *  - 库根是"拷一个目录即完成迁移"的既有语义（见本文件头）⇒ 覆盖值跟着库走。
 *
 * ⚠️ **与 `backup/` 的区别**：`backup/` 存的是**知识正文镜像**（给 git 维护用）；
 *    这里存的是**提示词覆盖值**，两者语义无关 ⇒ 不混放。
 * @returns 提示词覆盖目录绝对路径。
 */
export function promptsDir(): string {
  return join(libraryRoot(), 'prompts')
}

/** 提示词覆盖表（`{ version, overrides: { <stable-key>: { text, updatedAt } } }`）。 */
export function promptOverridesPath(): string {
  return join(promptsDir(), 'overrides.json')
}

/**
 * ⭐ **提示词改动的历史备份目录**（"分别加"——用户要求既有恢复默认、也有历史）。
 *
 * 每次保存写一个时间戳文件（`<stable-key 消毒>-<ISO>.txt`）⇒ 可回到任意一版。
 * @returns 提示词历史目录绝对路径。
 */
export function promptHistoryDir(): string {
  return join(promptsDir(), 'history')
}

/**
 * ⭐⭐ **交接文档模板目录**（决策 204）——`<库根>/templates/<id>.json`。
 *
 * 🔴 **为什么放库根而不是插件仓**：模板是**用户数据**（用户自己建、可能改、会删），
 *   而插件仓是交付物（升级会覆盖）⇒ 放库根才能跟着库走、也能被 git 维护。
 * ⚠️ **与 `prompts/` 的区别**：那里是**插件文本的覆盖值**（改措辞）；
 *    这里是**文档结构的定义**（改节名/节数/每节用途），语义不同 ⇒ 不混放。
 * @returns 模板目录绝对路径。
 */
export function templatesDir(): string {
  return join(libraryRoot(), 'templates')
}

/**
 * 一份模板文件的绝对路径。
 *
 * ⚠️ **内部自己做 `safeName` 消毒** —— 调用方**不要**再消毒一遍
 *    （两处各消一次会让"该不该消毒"变成调用方的记忆负担，本项目吃过这类漂移）。
 * @param id - 模板 id。
 * @returns 绝对路径。
 */
export function templatePath(id: string): string {
  return join(templatesDir(), `${safeName(id)}.json`)
}

/**
 * 把文件名/id 里的危险字符换掉，避免路径穿越与非法文件名。
 *
 * 项目 id 与主题 id 会直接进文件名，必须消毒。
 * @param name - 原始名字。
 * @returns 安全的文件名片段。
 */
export function safeName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\.+$/g, '')
  return cleaned === '' ? '_' : cleaned
}

/** 需要保证存在的目录全集（首次写入时创建）。 */
export function requiredDirs(): readonly string[] {
  return [
    projectsDir(),
    entriesDir(),
    themesDir(),
    readsDir(),
    docReadsDir(),
    // ⭐⭐ 主动召回日志目录（2026-09-27）：空目录无副作用，且让首次写入少一次竞态。
    recallLogDir(),
    // ⭐⭐ 知识评分日志目录（决策 177）：同上。
    scoreLogDir(),
    // ⭐ 备份目录（决策 135 / 136）：空目录无副作用，且让首次启用时少一次竞态。
    //    ⚠️ **不含 `backup/` 本身与 `.git`**——仓库由 `git init` 显式创建（见 git.ts）。
    //    ⚠️ 也**不含子目录**：镜像现在直接在 `backup/` 根下（决策 136）。
    backupDir(),
    // ⭐⭐ 热知识目录（热知识方案）：同上——空目录无副作用。
    hotDir(),
    // ⭐⭐⭐ 标签规范词表目录（决策 162）：同上。⚠️ **只在真写入时创建**——
    //    "用户从没用过这个工具" 与 "用过但词表为空" 是两件事，
    //    而一个空目录说明不了区别；真正的判据是文件在不在。
    tagsDir(),
    // ⭐⭐⭐ 提示词覆盖目录（本次新增）：同上——空目录无副作用，
    //    且让首次保存少一次竞态。⚠️ **历史子目录不在这里预建**（首次保存时建）。
    promptsDir(),
  ]
}
