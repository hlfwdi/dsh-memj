import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { parse } from "yaml";
//#region src/paths.ts
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
/**
* ⭐⭐⭐ **插件仓根**（2026-10-12 新增）——「写回源码」功能的定位基准。
*
* 🔴 **为什么需要它**：写回要把覆盖文本替换进 `src/*.ts` 的模板串，而这需要一个
*   **插件自己的安装位置**。此前所有路径都只指向库根（`~/.dsh-memj`），
*   插件**完全不知道自己源码在哪** ⇒ 写回无从下手。
*
* ⭐ **怎么定位**：本模块编译后在 `<仓根>/lib/*.js`（`package.json` 的 `main` 是 `lib/index.js`）
*   ⇒ `import.meta.url` 往上一级就是仓根。**这是最可靠的**——它跟着实际加载的文件走，
*   不依赖 `process.cwd()`（那会随调用方变）、也不依赖任何配置项。
*
* ⚠️ **边界**：本函数**只给"写回源码"用**，不要把库内数据路径改到这里——
*   库根（`libraryRoot()`）与插件仓**是两回事**（前者是用户数据、后者是交付物）。
*   本项目的铁律：**用户数据放库根，绝不写进插件仓**。
* @returns 插件仓根绝对路径。
*/
function pluginRoot() {
	const here = fileURLToPath(import.meta.url);
	return resolve(join(here, "..", ".."));
}
/**
* 库根：`$MEMJ_DATA_DIR`（为空则回落 `~/.dsh-memj`）。
*
* ⚠️ **空白环境变量视为未设置**——沿用 `dsh-home-paths` 对 `$DSH_HOME` 的同一约定，
* 避免 `MEMJ_DATA_DIR=` 这种写法把库根解析成空串。
* @returns 库根绝对路径。
*/
function libraryRoot() {
	const override = process.env["MEMJ_DATA_DIR"];
	if (override !== void 0 && override.trim() !== "") return resolve(override.trim());
	return join(homedir(), ".dsh-memj");
}
/** 项目文档目录（唯一写入源头）。 */
function projectsDir() {
	return join(libraryRoot(), "projects");
}
/** 内部条目正文目录。 */
function entriesDir() {
	return join(libraryRoot(), "entries");
}
/** 主题派生文档目录。 */
function themesDir() {
	return join(libraryRoot(), "themes");
}
/** 全局层派生文档。 */
function globalDocPath() {
	return join(libraryRoot(), "GLOBAL.md");
}
/** 读快照目录。 */
function readsDir() {
	return join(libraryRoot(), "reads");
}
/**
* ⭐ **项目文档读记录目录**（决策 112）。
*
* 🔴 **为什么不复用 `reads/`**：读快照的语义是"**跨项目证据**"
* （参与新建主题的闸门判定），且它的结构是**知识封面专用**
* （`entryId`/`theme`/`owner`）——装不下一份项目文档。
* 混在一起会让"读过别项目知识"与"读过本项目文档"互相污染。
*/
function docReadsDir() {
	return join(libraryRoot(), "doc-reads");
}
/** 提名文件。 */
function nominationsPath() {
	return join(libraryRoot(), "nominations.json");
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
function recallLogDir() {
	return join(libraryRoot(), "recall-log");
}
/**
* 某会话的**主动召回日志**：`recall-log/session-<id>.jsonl`（一行一次调用）。
* @param sessionId - 会话 id。
* @returns 日志文件绝对路径。
*/
function recallLogPath(sessionId) {
	return join(recallLogDir(), `session-${safeName(sessionId)}.jsonl`);
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
function scoreLogDir() {
	return join(libraryRoot(), "score-log");
}
/**
* 某会话的**评分日志**：`score-log/session-<id>.jsonl`（一行一次评分）。
* @param sessionId - 会话 id。
* @returns 日志文件绝对路径。
*/
function scoreLogPath(sessionId) {
	return join(scoreLogDir(), `session-${safeName(sessionId)}.jsonl`);
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
function scoreFilePath() {
	return join(hotDir(), "scores.json");
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
function tagsDir() {
	return join(libraryRoot(), "tags");
}
/**
* 标签规范词表的唯一落盘位置：`tags/vocabulary.json`（决策 162）。
*
* ⚠️ **`lastRunAt`（水位线）与词表【同一个文件】**（用户 2026-09-28 裁定）——
* 它俩要么一起更新、要么一起不动：若分两个文件，就会出现
* "水位线推了、词表没落盘" ⇒ **那批新 tag 永久跳过**（下次水位线已经越过它们了）。
*/
function tagVocabularyPath() {
	return join(tagsDir(), "vocabulary.json");
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
function tagAutoStatePath() {
	return join(tagsDir(), "auto-state.json");
}
/**
* 备份根目录：`<库根>/backup/`（决策 135 / 136）。
*
* ⭐ **它既是数据目录、也是 git 仓库的根**（`.git` 就在它里面）
* ⇒ 整个 `backup/` 是一个**可整体搬走 / 可整体删除**的单元。
*/
function backupDir() {
	return join(libraryRoot(), "backup");
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
function backupNarrativePath(projectId) {
	return join(backupDir(), `HANDOFF-${safeName(projectId)}.md`);
}
/**
* 某会话的读快照文件：`reads/session-<id>.jsonl`（§3.8.1）。
* @param sessionId - 会话 id。
* @returns 快照文件绝对路径。
*/
function readLogPath(sessionId) {
	return join(readsDir(), `session-${safeName(sessionId)}.jsonl`);
}
/**
* ⭐ 某会话的**项目文档读记录**：`doc-reads/session-<id>.jsonl`（决策 112）。
* @param sessionId - 会话 id。
* @returns 读记录文件绝对路径。
*/
function docReadLogPath(sessionId) {
	return join(docReadsDir(), `session-${safeName(sessionId)}.jsonl`);
}
/** 某项目的 handoff 文档路径。 */
function projectDocPath(projectId) {
	return join(projectsDir(), `HANDOFF-${safeName(projectId)}.md`);
}
/** 某主题的派生文档路径。 */
function themeDocPath(themeId) {
	return join(themesDir(), `THEME-${safeName(themeId)}.md`);
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
function entryRelPath(slug, uuid) {
	return `entries/${entryFileName(slug, uuid)}`;
}
/**
* 条目文件名：`<slug>-<uuid前8位>.md`（§3.4）。
* @param slug - 英文短名。
* @param uuid - 完整 UUID。
* @returns 文件名。
*/
function entryFileName(slug, uuid) {
	return `${slug.trim() === "" ? "entry" : slug.trim()}-${uuid.slice(0, 8)}.md`;
}
/**
* 把库内相对路径解析成绝对路径。
*
* ⚠️ **拒绝逃逸出库根**——外部的 `ref` 可能来自人手改的文档，
* 不校验会让 `../../` 读到库外。
* @param rel - 库内相对路径。
* @returns 绝对路径；逃逸或为空时返回 `undefined`。
*/
function resolveInsideLibrary(rel) {
	const normalized = rel.replace(/\\/g, "/").replace(/^\/+/, "");
	if (normalized.length === 0) return void 0;
	let depth = 0;
	for (const segment of normalized.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			depth -= 1;
			if (depth < 0) return void 0;
			continue;
		}
		depth += 1;
	}
	return join(libraryRoot(), ...normalized.split("/").filter((s) => s !== "" && s !== "."));
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
function resolveRef(ref, ext) {
	if (ext) return ref;
	return resolveInsideLibrary(ref);
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
function hotDir() {
	return join(libraryRoot(), "hot");
}
/** 用户画像（**多条列表**，人编；§5.2）。 */
function hotPersonaPath() {
	return join(hotDir(), "persona.json");
}
/** 逐条的「纳入 / 通道 / 形态 / 置顶」设置（§5.3）。 */
function hotEntriesPath() {
	return join(hotDir(), "entries.json");
}
/** ⭐ **逐项目**的「已选热知识清单」（§5.3b，与 `entries.json` 正交）。 */
function hotSelectionPath() {
	return join(hotDir(), "selection.json");
}
/** 会话 → 项目绑定 + 判定开关 + 最新活跃时间（§5.4）。 */
function hotSessionsPath() {
	return join(hotDir(), "sessions.json");
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
function promptsDir() {
	return join(libraryRoot(), "prompts");
}
/** 提示词覆盖表（`{ version, overrides: { <stable-key>: { text, updatedAt } } }`）。 */
function promptOverridesPath() {
	return join(promptsDir(), "overrides.json");
}
/**
* ⭐ **提示词改动的历史备份目录**（"分别加"——用户要求既有恢复默认、也有历史）。
*
* 每次保存写一个时间戳文件（`<stable-key 消毒>-<ISO>.txt`）⇒ 可回到任意一版。
* @returns 提示词历史目录绝对路径。
*/
function promptHistoryDir() {
	return join(promptsDir(), "history");
}
/**
* ⭐⭐ **交接文档模板目录**（决策 204）——`<库根>/templates/<id>.md`。
*
* 🔴 **为什么放库根而不是插件仓**：模板是**用户数据**（用户自己建、可能改、会删），
*   而插件仓是交付物（升级会覆盖）⇒ 放库根才能跟着库走、也能被 git 维护。
* ⚠️ **与 `prompts/` 的区别**：那里是**插件文本的覆盖值**（改措辞）；
*    这里是**文档结构的定义**（改节名/节数/每节用途），语义不同 ⇒ 不混放。
* @returns 模板目录绝对路径。
*/
function templatesDir() {
	return join(libraryRoot(), "templates");
}
/**
* ⭐⭐⭐ **知识类型定义文件的绝对路径**（`<库根>/kinds.md`，决策 215）。
*
* ── 为什么是**一个文件**而不是"一堆小文件" ────────────────────────────────
* 与模板（`templates/<id>.md`）**刻意不同**：类型表是一个**有序列表**，
* 而"顺序即 UI 下拉顺序" ⇒ 拆成多文件就没法表达顺序（还得另造一个索引）。
* ⇒ **一张表 = 一个文件**，与它"就是一张表"的心智模型一致。
*
* ── 为什么是这个形态（而不是塞进 `settings.json`）────────────────────────
* 它与模板**同构**：`id` + 显示名 + "什么时候用" + "书写规范"，
*   而模板那套（md + frontmatter + 每节一段）已经被验证可用 ⇒ **零新增认知**。
* ⚠️ `settings.json` 存的是**标量配置**（阈值、开关），塞一个结构化列表进去
*   会让"配置"与"内容"混在一起。
* @returns 绝对路径。
*/
function kindsFilePath() {
	return join(libraryRoot(), "kinds.md");
}
/**
* 一份模板文件的绝对路径。
*
* ⭐⭐ **2026-10-12（决策 208）：模板从 `.json` 改成 `.md`**（用户裁定"做"）。
* 理由：模板现在**就是一份文档的雏形**（每节一个 `## ` 标题 + "这一节要干嘛"的正文），
*   ⇒ 用 markdown 存**人可以直接读、直接手改**，与"建项目 = 复制模板"是同一个心智模型。
*   ⚠️ 旧的 `.json` 仍**兼容读**（见 `legacyTemplatePath()`）——
*   生产库里当时就有一份 `company-deep-research.json`。
*
* ⚠️ **内部自己做 `safeName` 消毒** —— 调用方**不要**再消毒一遍
*    （两处各消一次会让"该不该消毒"变成调用方的记忆负担，本项目吃过这类漂移）。
* @param id - 模板 id。
* @returns 绝对路径。
*/
function templatePath(id) {
	return join(templatesDir(), `${safeName(id)}.md`);
}
/**
* ⭐ **模板的旧路径**（`.json`）——只用于**兼容读与迁移**。
*
* 🔴 **为什么必须兼容读**：决策 204 的模板是 JSON 存的，而**生产库里真有存量**
*   （`templates/company-deep-research.json`）。若不接住它 ⇒ 那份模板**静默消失**
*   ⇒ 已存在文档虽不受影响（它们记着自己的节名），但用户会发现"我的模板没了"。
* @param id - 模板 id。
* @returns 旧格式的绝对路径。
*/
function legacyTemplatePath(id) {
	return join(templatesDir(), `${safeName(id)}.json`);
}
/** ⭐ `default` 模板在磁盘上的路径（决策 208：默认模板**也落盘**，可被用户编辑）。 */
function defaultTemplatePath() {
	return templatePath("default");
}
/**
* 把文件名/id 里的危险字符换掉，避免路径穿越与非法文件名。
*
* 项目 id 与主题 id 会直接进文件名，必须消毒。
* @param name - 原始名字。
* @returns 安全的文件名片段。
*/
function safeName(name) {
	const cleaned = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\.+$/g, "");
	return cleaned === "" ? "_" : cleaned;
}
/**
* ⭐⭐⭐ **「文档内提问」的数据目录**：`<库根>/reading/`（2026-10-14）。
*
* 放三样东西（都是**本功能的 source data**，不是 derived）：
*   · `bindings.jsonl` —— 「源条目的某段落」⇄ 「chat 条目」的绑定；
*   · `cursors.json`   —— 每个会话同步到哪个 seq（增量游标）；
*   · `state.json`     —— 阅读位置等轻量状态。
*
* 🔴 **为什么不复用 `reads/` / `docReads/`**（同 `recallLogDir` 的理由）：
*    那两个的语义是"**读过什么**"（跨项目证据 / 写叙事前置），
*    而这里是"**哪段对话绑哪条知识**"——结构（anchor 四元组）与用途都不同，
*    混在一起会让"读过"与"讨论过"互相污染。
*/
function readingDir() {
	return join(libraryRoot(), "reading");
}
/** 段落 ⇄ 会话绑定表：`reading/bindings.jsonl`（一行一条，可追加）。 */
function readingBindingsPath() {
	return join(readingDir(), "bindings.jsonl");
}
/** 同步游标：`reading/cursors.json`（`sessionId → capturedThroughSeq`）。 */
function readingCursorsPath() {
	return join(readingDir(), "cursors.json");
}
/** 阅读状态：`reading/state.json`。 */
function readingStatePath() {
	return join(readingDir(), "state.json");
}
/** 需要保证存在的目录全集（首次写入时创建）。 */
function requiredDirs() {
	return [
		projectsDir(),
		entriesDir(),
		themesDir(),
		readsDir(),
		docReadsDir(),
		recallLogDir(),
		scoreLogDir(),
		backupDir(),
		hotDir(),
		tagsDir(),
		promptsDir(),
		readingDir()
	];
}
//#endregion
//#region src/schema.ts
/**
* ⭐⭐ **内置知识类型表**（顺序即 UI 下拉顺序）。
*
* ⚠️ **改动这一张表就够** —— 工具 schema、UI 下拉、报错文案、提示词都从这里取。
* 🔴 **2026-10-05（决策 217）**：`when` 全部改写成**真的"什么时候用"**，
*   原先装在这里的骨架文字**搬进了 `guide`**（见 `EntryKindDef` 的说明）。
*/
const ENTRY_KIND_DEFS = [
	{
		id: "fact",
		label: "fact（事实 / 接口）",
		when: "陈述一个**可核实的结论**、接口形态、路径或数字",
		guide: "是什么 + 出处/依据"
	},
	{
		id: "trap",
		label: "trap（陷阱 / 纠错）",
		when: "**出过错 / 反直觉 / 会让人白费功夫**的那类事",
		guide: "现象 → 根因 → 正确做法"
	},
	{
		id: "howto",
		label: "howto（流程步骤）",
		when: "一串**有先后顺序、要照着做**的步骤",
		guide: "步骤清单（编号，每步一句）"
	},
	{
		id: "decision",
		label: "decision（决策 + 理由）",
		when: "在**几个方案里做过的一个选择**",
		guide: "结论 + 理由 + 边界"
	},
	{
		id: "history",
		label: "history（归档·不参与检索）",
		when: "把**已被取代 / 已过时**的正文**原样收存**（如某一节里较早的批次小节），原处换成指针",
		guide: "原文**照收、一字不改**（归档的意义就是留原话）+ 一行批次主题；⭐ 本条**不参与检索**（`memj_search` / 热知识注入都会跳过它）——它是留档，不是知识；⚠️ 若把它写成 `fact`/`trap`/`howto`/`decision`，那些条目就会**正常参与检索**。"
	},
	{
		id: "chat",
		label: "chat（问答·不参与检索）",
		/**
		* 🔴 **保留项**（`reserved: true`）—— **不给模型选、也不让人在下拉里手选**。
		*
		* 它由「文档内提问」功能**自动生成**：阅读某条知识时选中一段发起提问，
		* 插件开一个 DSH 会话，并把该会话的问答**同步成一条 `chat` 条目**。
		* ⇒ 若开放给模型/人手选，普通对话也能造出它 ⇒ 库被会话记录淹没
		*   （用户明确裁定：**只同步"从提问入口产生的会话"**）。
		*
		* ⭐⭐ **为什么不复用 `history` 的"不参与检索"**：两者是**不同的东西** ——
		*   · `history` = 被取代的**旧正文**（内容来自文档自身，本该被替换掉）；
		*   · `chat`   = **新产生的问答**（内容来自人机对话，是增量知识）。
		*   ⚠️ 用户裁定过：*"就只有 history 知识不参与检索"* ⇒ 所以**不能把问答塞进 `history`**。
		*
		* ⭐ **它仍要出现在知识库列表里**（用户裁定）—— 列表与检索是**两条路**：
		*   `scanLibrary()` 只排除 `history`，`chat` 天然在列表里；而检索侧（`memj_search` /
		*   热知识）要另加排除。⇒ 改检索侧时**不要顺手改 `scanLibrary`**，否则列表会丢。
		*/
		reserved: true,
		when: "**由插件自动生成**：阅读某条知识时节选一段发起提问，该会话的问答同步成条目",
		guide: "正文 = 该会话的问答记录（`#### Q1：…` / 回答，随会话**动态追加**）；frontmatter 的 `source.sessionId` 指向产生它的那个 DSH 会话；⭐ **不参与检索**（同 `history` 的理由：它是会话流水，不是可供复用的知识）——⚠️ 但**与 `history` 不同**：它**要出现在知识库列表**里（列表与检索是两条路）。"
	}
];
/** `kind` 的全部取值（含保留项）。 */
const ENTRY_KINDS = ENTRY_KIND_DEFS.map((d) => d.id);
/**
* ⭐⭐ **可以给模型选的**取值（**排除保留项**）—— 工具 schema 的 `enum` 用它。
*
* 🔴 **为什么与 `ENTRY_KINDS` 分开**：两者**不一定相等** ——
*    保留项（`reserved: true`）不进这里，因为它们"不给模型选"。
*
* ⚠️ 2026-10-12（决策 223）曾一度"两者恰好相等"（`history` 开放后无保留项）；
*    ⭐ **2026-10-13 起又不等了**：`chat` 是保留项（插件自动生成，不给人选）
*    ⇒ `ENTRY_KINDS` 6 项、`SELECTABLE_ENTRY_KINDS` 5 项。
* ⭐ 但**这个区分必须留着**：用户自定义的类型将来可能设保留项，
*    而且"过滤"这个动作本身就是那条语义的实现。
*/
const SELECTABLE_ENTRY_KINDS = ENTRY_KIND_DEFS.filter((d) => d.reserved !== true).map((d) => d.id);
let currentDefs = ENTRY_KIND_DEFS.map((d) => ({
	id: d.id,
	when: d.when,
	guide: d.guide,
	label: d.label,
	reserved: d.reserved === true
}));
/**
* ⭐ **设置当前生效的类型表**（插件启动与"保存类型表"两处调用）。
* @param defs - 完整定义（**含保留项** —— 读侧要认 `history`）。
*/
function setCurrentKindDefs(defs) {
	if (defs.length > 0) currentDefs = defs.map((d) => ({ ...d }));
}
/**
* ⭐ **取当前生效的完整定义**（渲染点用它现拼）。
* @returns 完整定义列表。
*/
function currentKindDefsOf() {
	return currentDefs;
}
/**
* ⭐ **取当前生效的词表**（只要 id）。
* @returns 全部合法 id。
*/
function currentKindsOf() {
	return currentDefs.map((d) => d.id);
}
/**
* ⭐⭐ **当前生效的"保留项"id**（不给模型选的那些）。
*
* 🔴 **它也读当前值**（不再读编译期表）：`reserved` 是**表里的一个字段**，
*   与"有哪些类型"一样来自同一份文件 ⇒ 从同一个当前值派生才可能一致。
* @returns 保留项 id。
*/
function currentReservedKinds() {
	return currentDefs.filter((d) => d.reserved).map((d) => d.id);
}
/**
* 判断一个值是否是合法的 `kind`。
*
* ⭐⭐ **2026-10-05（决策 215）起读【当前生效的词表】**，不再是编译期常量 ——
*    用户可在设置页增删改类型。
* ⚠️ 签名**刻意保持不变**（`isEntryKind(value)`，不是 `isEntryKind(value, kinds)`）——
*    它有 18 个调用点、其中两个是纯函数；把词表做成参数会污染它们。
*    ⇒ 改用"进程内当前值 + 明确的刷新时机"（见 `setCurrentKindDefs`）。
* @param value - 待判断的值。
* @returns 是否为合法 kind。
*/
function isEntryKind(value) {
	return typeof value === "string" && currentDefs.some((d) => d.id === value);
}
/**
* ⭐ **取一种 kind 的"什么时候用它"**（提示词与报错文案共用一处）。
* @param id - kind 的 id。
* @returns 那句话；id 不认识 ⇒ 空串。
*/
function entryKindWhen(id) {
	return currentDefs.find((d) => d.id === id)?.when ?? "";
}
/**
* ⭐⭐ **一句话列出所有可选的 kind**（报错文案 / 工具描述共用）。
*
* ⚠️ 收敛前这句在 `handoff.ts` / `parse.ts` / `tools.ts` 里**各写了一遍**，
*    且**四处文案不一致**（有的带含义、有的只列 id）。
* 🔴 **读当前值**（决策 217）—— 以前读编译期表，于是用户加的类型**不出现在报错里**，
*   而报错的用途恰恰是"告诉模型能填什么"。
* ⚠️ **不含保留项**（`history` 不给模型填）—— 曾经的实现用 `ENTRY_KINDS` 把 `history`
*   也列了出来，那是**错的**（会诱导模型手工造一条检索不到的条目）。
* @param sep - 分隔符（默认 ` / `）。
* @returns 形如 `fact / trap / howto / decision`。
*/
function selectableKindList(sep = " / ") {
	return currentDefs.filter((d) => !d.reserved).map((d) => d.id).join(sep);
}
/**
* ⭐⭐ **`id 含义｜id 含义` 形式的一句话**（工具描述里给模型看的那种）。
*
* 收敛前这段串在 `tools.ts` 里**抄了三遍**（长得一模一样），
* 而那正是"加一个类型要改七处"里最容易漏的三处。
* 🔴 **读当前值**（决策 217）—— 用户加的类型必须出现在这里，否则模型
*   在 enum 里看得到一个值、却不知道它是什么意思（**"两边打架"**）。
* @param sep - 条目之间的分隔符（默认 `｜`）。
* @returns 形如 `fact 陈述一个可核实的结论…｜trap 出过错 / 反直觉…｜…`。
*/
function kindsInline(sep = "｜") {
	return currentDefs.filter((d) => !d.reserved).map((d) => `${d.id} ${d.when}`).join(sep);
}
/**
* 🔴🔴 **交给 DSH 的文本里，插槽不能用 `{{…}}`**（决策 217；**这是踩崩一次换来的**）。
*
* ── 事故 ──────────────────────────────────────────────────────────────────
* 我第一版用 `{{kindCatalog}}` 当插槽，结果**整个会话装配失败**：
* `malformed prompt variable reference "{{kindCatalog}}" in context "memj:usage-guidance"`
*
* ── 根因（读 `dsh-system-prompt` 源码确认）────────────────────────────────
* `systemPrompt.context()` 的 `text` **会被 DSH 自己再跑一遍 `interpolate()`**：
* ```js
* const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/     // ← 只允许【小写】开头
* if (!VARIABLE_NAME.test(name)) throw …        // ← 大写 C 直接抛
* if (!Object.hasOwn(variables, name)) throw …  // ← 还得在 DSH 里注册过
* ```
* ⇒ ⭐⭐ **`{{}}` 在 DSH 里是【有主】的语法** —— 不是"谁都能用的占位符"。
*   而 `systemPrompt.context()` / `section()` 的文本**恰恰要交给它** ⇒ 用不了。
* （⚠️ `handoff:prompt-steps` 那些 `{{}}` 之所以没事：它们走**命令注入**，不过 DSH 的 interpolate。）
*
* ── 现在的做法：**HTML 注释标记** ────────────────────────────────────────────
* DSH 的 `interpolate()` **只认 `{{}}`** ⇒ 注释**完全安全**。
* ⭐ 而且它有个关键的降级性质：**新文本 + 旧代码**时，标记会**原样发出去**（看得见的丑），
*   而不是**运行时抛异常**。⇒ **"先改设置页、后重启"的窗口不再致命**。
* ⭐⭐ **判据：给别人家的文本插占位符前，先问"它自己会不会把这段再解析一遍"。**
*/
const KIND_CATALOG_MARKER = "<!--memj:kind-catalog-->";
/** 可选值清单的标记（给工具描述用，同上的理由）。 */
const KIND_LIST_MARKER = "<!--memj:kind-list-->";
/**
* ⭐⭐ **填掉 memj 自己的标记**（`kinds.ts`/`tools.ts`/`index.ts` 三处共用）。
*
* ⚠️ **与 `fillSlots`（`{{名字}}`）是两套东西，别混**：
*   · `fillSlots` 服务**memj 内部**的模板（命令注入那些，宿主不过问）；
*   · 本函数服务**要交给 DSH 的**文本（`context()` / 工具描述），
*     那里 `{{}}` **有主**，只能用注释。
* @param text - 原文本。
* @returns 填好的文本（不认识的标记**原样留着** —— 可见比静默吞掉强）。
*/
function fillKindMarkers(text) {
	return text.replaceAll(KIND_CATALOG_MARKER, kindCatalogText()).replaceAll(KIND_LIST_MARKER, selectableKindList(" / "));
}
/**
* ⭐⭐⭐ **渲染"知识类型目录"**（决策 217）—— 常驻上下文里那张表的**唯一来源**。
*
* 每轮现拼（`when` + `guide` 都来自**当前生效的类型表**）⇒
* 用户改了类型，**下一轮模型就看到新的**，不用重启。
*
* 🔴 **为什么必须现拼、不能写在提示词正文里**：
*   正文那份是**可编辑的固定文本**，而你改了类型它不会跟着变 ——
*   本项目为这类"固定清单与运行时真值脱节"记过账（`写给模型的固定清单会成为「凭印象猜」的源头`）。
*
* ⭐⭐ **决策 223（2026-10-12）：`history` 现在就在表里** ——
*    归档改成由模型按各节规范做（工具读不懂自然语言规范，不再执行归档）
*    ⇒ 它必须**给模型选**，所以不再是保留项、也不再需要"表里为什么没有它"那段说明。
*    ⚠️ 但**"它不参与检索"这条必须由 `when`/`guide` 讲清楚**（原先靠 `reserved` 结构性挡着）。
* @returns markdown 表格。
*/
function kindCatalogText() {
	return [
		"| `kind` | 什么时候用（什么内容归这一类） | 怎么写 |",
		"|---|---|---|",
		...currentDefs.filter((d) => !d.reserved).map((d) => `| \`${d.id}\` | ${d.when} | ${d.guide === "" ? "（自由发挥）" : d.guide} |`),
		"| （留空） | 未分类 | 自由发挥 |",
		"",
		"🔴 **`history` 是\"留档\"不是\"知识\"**：`memj_search` 与热知识注入都会**跳过**它",
		"（这是它的定义，不是缺陷）⇒ 只在**把一个已经被取代的正文原样收存**时用它，",
		"并在原处留指针。⚠️ 反之，**正常情况下不要用它** —— 写成别的类型才会参与检索。"
	].join("\n");
}
/**
* ⭐⭐ **注入形态**（方案 §3.4）。
*
* - `meta`（默认）：给**标题 + desc + id**，模型要正文时自己 `memj_read`；
* - `full`：给**正文 + id** —— ⚠️ 与「用户画像」**连成同一段**
*   （两者都是"直接给 LLM 用、不需要 read"的内容）；
*   🔴 **仍保留 id 的唯一目的 = 看门狗判断**（用户明确要求）。
*/
const HOT_SHAPES = ["meta", "full"];
/**
* ⭐ **注入通道**（方案 §3.3）。
*
* ⚠️ **`section` 仅画像与全局层可用**——`systemPrompt.section()` 在 root scope 注册，
* 它的 `text()` 对**所有 agent** 返回同一份内容，物理上装不下"按项目区分"的东西。
* ⇒ 项目/主题层的条目即使写了 `section`，也**一律按 `inbox` 处理**，
*   并在页面上**明确提示**（本项目一贯：**不静默降级**）。
*/
const HOT_CHANNELS = ["inbox", "section"];
/** ⭐ **项目判定的结果**——`未知` 是**一等公民**（方案 §7.2 ④）。 */
const HOT_PROJECT_UNKNOWN = "未知";
/**
* ⭐ **判定来源**（决定 UI 怎么显示"这个绑定是谁定的"）。
*
* ⭐⭐ **`inherited`（2026-09-29 新增，用户裁定）** —— 本会话是**子代理**，
*    自己没有项目证据，**从父会话继承**得来。与其余四种**语义不同**：
*    · `manual` / `doc-reads` / `llm` / `handoff` 都是"**我自己的**证据"；
*    · `inherited` 是"**我没有证据，按父会话算**"。
*    ⚠️ 所以它**必须单独成值**：UI 要能显示"这是继承来的"，
*       否则用户会以为这个子会话自己 handoff 过。
*/
const HOT_BIND_SOURCES = [
	"doc-reads",
	"llm",
	"manual",
	"inherited"
];
//#endregion
//#region src/sections.ts
/**
* dsh-memj —— **交接文档的节名契约（唯一源头）**
*
* 🔴🔴 **为什么单独一个文件**：这些节名被 `store.ts` / `handoff.ts` / `history.ts` /
*   `parse.ts` 四处消费，而它们之间**已有依赖方向** `store → parse`
*   ⇒ 常量若放在 `store.ts`，`parse.ts` 引用它就会形成**循环依赖**。
*   ⇒ 所以下沉成本模块（**零依赖**，只导出常量与纯函数）。
*
* 🔴🔴 **节名不是"文案"，是"程序协议"**（2026-09-30 普查结论）：
*   · `history.ts`   按 `PROGRESS_TITLE` 找**截断目标节**（找不到 ⇒ 静默不截断）；
*   · `handoff.ts`   按它统计**孤本判据**（找不到 ⇒ 那道防线整个消失）；
*   · `handoff.ts`   按 `NARRATIVE_TITLES` 出**回执体量行**；
*   · `read.ts`      按它做**子串匹配**（`section:"当前进度"` 之类）；
*   · `store.ts`     按 `NARRATIVE_SECTIONS` 重建文档骨架。
*
* ⚠️ **历史教训（这次合并掉的）**：同一份节名曾有 **3 份不共享的副本** ——
*   ① `store.ts` 的 `NARRATIVE_SECTIONS`（带 `## ` 前缀）
*   ② `handoff.ts` 的本地 `NARRATIVE_TITLES`（无前缀）
*   ③ `handoff.ts` 回执体量行里现写的 `order` 数组
*   加上「沉淀知识」的 **2 处不共享的正则**（`handoff.ts` / `parse.ts`）。
*   ⇒ 任何一处要动都得全部同改，**漏一处就是静默失效**。
*
* @module dsh-memj/sections
*/
/**
* ⭐⭐⭐ **六节叙事的节名**（顺序固定，§3.1）。**全库唯一源头。**
*/
const NARRATIVE_TITLES = [
	"目标",
	"当前进度",
	"有效做法",
	"失败/踩坑",
	"关键上下文",
	"下一步"
];
/** 项目文档的**六节叙事**标题（带 `## ` 前缀，供解析/匹配用）。 */
const NARRATIVE_SECTIONS = NARRATIVE_TITLES.map((t) => `## ${t}`);
/**
* ⭐⭐ **截断目标节名**。
*
* 🔴 只对这一节做自动截断（决策 136 / 127）：它是**唯一的主要膨胀源**
*   （实测占交接文档 46%），其余五节按规范**只做语义精炼、不许删条目**。
*/
const PROGRESS_TITLE = "当前进度";
/**
* ⭐⭐⭐ 「沉淀知识」节的**节名**（无 `#` 前缀）。
*
* 🔴🔴 **这一节对用户是「钉死」的、不参与任何模板自定义**（用户 2026-09-30 裁定）：
*   **封面物理上就存在这一节里**（`store.ts` 重建它、`parse.ts` 与 `handoff.ts`
*   按它砍掉旧封面再写新的）⇒ 一旦改名或删掉，**封面会丢或每轮累积**。
*   ⭐ 用户侧**无感知**：他不需要知道有这么一节，工具自己会写。
*/
const KNOWLEDGE_TITLE = "沉淀知识";
/** 「沉淀知识」节标题（带 `## ` 前缀）。 */
const KNOWLEDGE_SECTION = `## ${KNOWLEDGE_TITLE}`;
/**
* ⭐⭐⭐ 「本档写作规范」节的**节名**（无 `#` 前缀）。
*
* 🔴🔴 **它是什么**（2026-10-12，模板与提示词解耦）：
*   把"每一节该写什么、哪节能自动截断"这份**规范**从
*   ① 模板 JSON 的 `desc`、② 常驻 `context()` 的写作指导、③ `memj_read` 的按需注入
*   **三处**，收敛成**一处** —— 就写在这份文档自己的正文里（叙事末尾、`沉淀知识` 之前）。
*
* 🔴 **为什么放"末尾一整节"而不是"各节标题下面"**（方案对比见交接文档）：
*   各节内嵌规范会要求 `mergeNarrative` / `applySectionOp` / `truncateProgress` /
*   两套 `splitSections` **全都升级成"知道节里有个受保护块"**，且规范字数会
*   吃掉「当前进度」的截断配额。
*   落成**独立一节** ⇒ 那些机制**一个都不用改**（它只处理声明的目标节）。
*
* 🔴 **模型不能写它**：`narrativeFromDoc()` 会像对待「沉淀知识」一样**先砍掉它**；
*   落盘时由 `handoff` 按该项目的模板**重建**。手改会被下次落盘覆盖。
*/
const SPEC_TITLE = "本档写作规范";
/** 「本档写作规范」节标题（带 `## ` 前缀）。 */
const SPEC_SECTION = `## ${SPEC_TITLE}`;
/**
* ⭐ 规范块的**围栏语言标记**（唯一源头）。
*
* ⚠️ 它同时出现在渲染侧（`renderTemplateDoc` / 建项目的骨架）与解析侧
*   （本文件的 `specBlockFenceInfo`）⇒ **改它必须两处一起改**；
*   落在同一常量上 ⇒ 结构上不会漂。
*/
const SPEC_BLOCK_FENCE = "memj:spec";
/**
* 围栏起始行：`` ```memj:spec ``。
*
* 🔴🔴 **决策 223（2026-10-12）：不再有 `truncate` 后缀** ——
*    归档改成由模型按各节规范做，工具不再执行 ⇒ 那个标记**没有消费者了**。
* ⚠️⚠️ **但解析侧必须对存量宽容**（否则存量 21 份文档的规范块会**整块失效**，
*    而那会让「节规范」功能——显示、就地编辑、交接点名——**全部静默失灵**）。
*    ⇒ 正则里**仍然接受**旧后缀（任意词，不只是 `truncate`），只是**丢弃它**。
*    ⭐ 判据：**放宽解析、收紧渲染** —— 读要能读旧的，写只写新的。
*/
const SPEC_BLOCK_OPEN_RE = new RegExp(`^\\s*\`\`\`${SPEC_BLOCK_FENCE}(?:\\s+\\S+)?\\s*$`, "i");
/** 围栏结束行：一个**裸的** ``` 行。 */
const FENCE_CLOSE_RE = /^\s*```\s*$/;
/**
* ⭐ 判一行是不是规范块的**围栏起始行**。
*
* ⚠️ **宽容**（与 `.md` 模板的取向一致：选 md 就是为了让人能手改）：
*   允许行首缩进、允许行尾空白、**允许旧版遗留的后缀**（如 ` truncate`，已忽略）。
* @param line - 一行。
* @returns 是围栏起始行 ⇒ `true`；否则 `undefined`。
*/
function specBlockFenceInfo(line) {
	return SPEC_BLOCK_OPEN_RE.test(line) ? true : void 0;
}
/**
* ⭐⭐ **找一节里的规范块**——本模块的**唯一边界实现**。
*
* 🔴 只在**该节自己的行区间**里找（调用方保证区间是"这一节"）：
*   从标题行之后找**第一个**围栏起始行，再找它后面**第一个**裸 ``` 行。
* ⚠️ **不闭合 ⇒ `undefined`**（不猜、不半取）。
* ⚠️ 只找**第一个**块：一节只有一个规范块（多写的第二个会被当正文）。
* @param lines - 该节的行（**含**标题行）。
* @param from - 从哪一行开始找（默认 1 = 跳过标题行）。
* @returns 位置；没有规范块 ⇒ `undefined`。
*/
function specBlockRange(lines, from = 1) {
	for (let i = from; i < lines.length; i += 1) {
		if (specBlockFenceInfo(lines[i] ?? "") === void 0) continue;
		for (let j = i + 1; j < lines.length; j += 1) if (FENCE_CLOSE_RE.test(lines[j] ?? "")) return {
			open: i,
			bodyStart: i + 1,
			bodyEnd: j,
			close: j
		};
		return;
	}
}
/**
* ⭐ 取一节里规范块的**规范文字**（围栏内的内容，已 trim；没有 ⇒ `''`）。
* @param lines - 该节的行（含标题行）。
* @returns 规范文字。
*/
function extractSpecBlock(lines) {
	const r = specBlockRange(lines);
	if (r === void 0) return "";
	return lines.slice(r.bodyStart, r.bodyEnd).join("\n").trim();
}
/**
* ⭐ 取一节里规范块的**原文行**（含围栏起始/结束行；没有 ⇒ `[]`）。
*
* 🔴 用途：`mergeNarrative` **从盘上旧文档回填**规范块 —— 回填必须是
*   **逐字原样**（不能重新渲染，否则用户手改过的措辞会被"规范化"掉）。
* @param lines - 该节的行（含标题行）。
* @returns 规范块原文行。
*/
function extractSpecBlockLines(lines) {
	const r = specBlockRange(lines);
	if (r === void 0) return [];
	return lines.slice(r.open, r.close + 1);
}
/**
* ⭐ 剥掉一节里的规范块（**只剥块，正文一字不动**；没有 ⇒ 原样返回）。
*
* ⚠️ 与 `extractSpecBlock()` **共用 `specBlockRange()`** —— 见本组开头的纪律 1。
* @param lines - 该节的行（含标题行）。
* @returns 剥掉后的行（标题行仍在）。
*/
function stripSpecBlock(lines) {
	const r = specBlockRange(lines);
	if (r === void 0) return [...lines];
	return [...lines.slice(0, r.open), ...lines.slice(r.close + 1)];
}
/**
* 🔴🔴 **`truncateTitlesFromBlocks()` 已于 2026-10-12（决策 223）删除。**
*
* ── 它原来做什么 ────────────────────────────────────────────────────────────
* 从各节的规范块反解"**哪几节声明了可自动截断**"（判据是围栏起始行带不带 `truncate`）。
*
* ── 为什么删 ────────────────────────────────────────────────────────────────
* 用户裁定：**归档完全交给模型、规则写在各节的书写规范里（自然语言）**，
* 工具**不再执行归档**（它读不懂自然语言）⇒ "哪节能截"这个**结构化标记没有消费者了**。
* ⇒ 连带删掉的还有：`truncate` 的**解析**（围栏正则里的那个可选组）、
*   `SpecBlockRange.truncate` 字段、`renderSpecBlockLines()` 的第 2 个参数、
*   以及 `SECTION_SPEC_CLOSING` 里那句"（可自动截断归档）"的渲染。
*
* ⚠️ **围栏语法因此简化成**：`` ```memj:spec `` —— **不再有任何后缀**。
* ⭐ 但**解析侧对存量仍宽容**（见 `specBlockFenceInfo`）：带旧 `truncate` 后缀的行
*   **照样被认作起始行**，只是那个后缀**被忽略** ——
*   否则存量 21 份文档的规范块会**整块失效**（那是本项目最忌的静默失效）。
*/
/**
* 裸反引号围栏那一串。
*
* ⚠️ **不写成字面量**：本项目对"源码/提示词里出现裸围栏"有过多次教训
* （`gen-context.mjs` 会拒绝含两个围栏的提示词块），用 `fromCharCode` 最保险。
*/
const FENCE_BARE = String.fromCharCode(96, 96, 96);
/**
* ⭐ **顶层 `## ` 标题的行号表**（本模块内部唯一实现；**跳过围栏内的伪标题**）。
*
* ⚠️ **两处必须同源**：读（`sectionSpecsOf`）与写（`setSectionSpecBlock`）。
* ⚠️ 与 `sectionsFromNarrative()` **同规**：排除工具维护的两节
*    （`沉淀知识` / `本档写作规范`）—— 它们不是叙事节、也没有"自己的规范块"。
* @param lines - 文档的行数组。
* @returns `{ title, line }[]`（按出现顺序）。
*/
function topHeadingLines(lines) {
	const out = [];
	let inFence = false;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? "";
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = /^##\s+(.+?)\s*$/.exec(line);
		if (m === null) continue;
		const title = (m[1] ?? "").trim();
		if (title === "" || title === "沉淀知识" || title === "本档写作规范") continue;
		out.push({
			title,
			line: i
		});
	}
	return out;
}
/**
* ⭐⭐ **取"这份文档里每一节自己的规范块"**（只回**真的有块**的节）。
*
* 🔴 **没有块的节不出现在结果里** —— 见本组开头的边界 1（绝不合成）。
*    调用方据此就能判断"这一节能不能编辑"：**在结果里 ⇒ 能**。
* @param narrative - 纯叙事文本（可传 `''`）。
* @returns 各节的规范块（按文档顺序）。
*/
function sectionSpecsOf(narrative) {
	const lines = narrative.split(/\r?\n/);
	const heads = topHeadingLines(lines);
	const out = [];
	for (let i = 0; i < heads.length; i += 1) {
		const h = heads[i];
		if (h === void 0) continue;
		const end = i + 1 < heads.length ? heads[i + 1]?.line ?? lines.length : lines.length;
		const seg = lines.slice(h.line, end);
		if (specBlockRange(seg) === void 0) continue;
		out.push({
			title: h.title,
			spec: extractSpecBlock(seg)
		});
	}
	return out;
}
/**
* ⭐ **把一段规范文字渲染成围栏块的行**（写侧的**唯一**渲染点）。
*
* 🔴 **闭合行必须是裸围栏**，不是带语言标记的那一串 —— 写成一样会让
*    `specBlockRange()` **认不出闭合** ⇒ 规范块"不闭合" ⇒ 反解为空
*    （决策 209 实测踩过，见 `handoff.ts` 的 `insertSpecBlocks`）。
* 🔴 **决策 223：起始行不再带任何后缀**（`truncate` 已废除）——
*    ⇒ **写出来的永远是最简形态**，而读侧对旧后缀宽容（见 `specBlockFenceInfo`）。
* @param spec - 规范正文（可多行；空串 ⇒ 渲染出一个只有围栏的块）。
* @returns 行数组（含起始围栏与闭合围栏）。
*/
function renderSpecBlockLines(spec) {
	const out = [`${FENCE_BARE}${SPEC_BLOCK_FENCE}`];
	const body = spec.replace(/\r\n/g, "\n").trim();
	if (body !== "") out.push(...body.split("\n"));
	out.push(FENCE_BARE);
	return out;
}
/**
* ⭐⭐⭐ **替换某一节自己的规范块**（该节正文一字不动）。
*
* 🔴 **三态返回，调用方必须区分**（它们的后果完全不同）：
*   · `ok`         —— 换了；
*   · `no-section` —— 文档里没有这一节（多半是节名写错）；
*   · `no-block`   —— 有这一节，但它**没有规范块** ⇒ **不插入**（边界 1）。
*
* ⚠️ **同名多节取第一个** —— 与 `read.ts` 的按节读取一致（那边是子串匹配，
*    这里是精确匹配；精确匹配仍可能撞上两节同名，而模板校验禁止重复节名）。
* @param narrative - 纯叙事文本。
* @param title - 节名（**精确匹配**，已 trim）。
* @param spec - 新的规范正文。
* @returns 新叙事与状态。
*/
function setSectionSpecBlock(narrative, title, spec) {
	const key = title.trim();
	const lines = narrative.split(/\r?\n/);
	const heads = topHeadingLines(lines);
	const idx = heads.findIndex((h) => h.title === key);
	if (idx === -1) return {
		narrative,
		status: "no-section"
	};
	const start = heads[idx]?.line ?? 0;
	const end = idx + 1 < heads.length ? heads[idx + 1]?.line ?? lines.length : lines.length;
	const seg = lines.slice(start, end);
	const r = specBlockRange(seg);
	if (r === void 0) return {
		narrative,
		status: "no-block"
	};
	return {
		narrative: [
			...lines.slice(0, start),
			...seg.slice(0, r.open),
			...renderSpecBlockLines(spec),
			...seg.slice(r.close + 1),
			...lines.slice(end)
		].join("\n"),
		status: "ok"
	};
}
/**
* ⭐ **剥掉整份文档里所有节内规范块**（模型回传的 `doc` 走这条）。
*
* 🔴 **为什么必须有它**：模型写 `doc` 时可能**照抄**文档（含规范块）——
*   若不剥，`mergeNarrative` 会把那份副本当"正文"，与盘上的规范块**并存**。
* @param narrative - 纯叙事文本。
* @returns 剥掉全部规范块后的文本。
*/
function stripAllSpecBlocks(narrative) {
	const lines = narrative.split(/\r?\n/);
	const out = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? "";
		if (/^##\s+/.test(line)) {
			let j = i + 1;
			while (j < lines.length && !/^##\s+/.test(lines[j] ?? "")) j += 1;
			out.push(line, ...stripSpecBlock(lines.slice(i, j)).slice(1));
			i = j;
			continue;
		}
		out.push(line);
		i += 1;
	}
	return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
/**
* ⭐ 判断一行是不是「本档写作规范」的**顶层标题行**。
*
* 🔴 与 `isKnowledgeHeading()` **同规**：必须按行首精确匹配（不能用 `indexOf` 查子串）
*   —— 叙述里完全可能**引用**这个标题名，子串查找会把真实内容误删。
* @param line - 待判定的行。
* @returns 是「本档写作规范」顶层标题 ⇒ true。
*/
function isSpecHeading(line) {
	return new RegExp(`^##\\s+${SPEC_TITLE}\\s*$`).test(line);
}
/**
* ⭐⭐ 砍掉「本档写作规范」**这一节**（只这一节，**保住它后面的内容**）。
*
* 🔴 **与 `cutKnowledgeSection()` 的关键区别**：
*   那个是"从 `沉淀知识` 砍到**文件末尾**"（因为它后面本来就没有别的东西）；
*   而本函数**只砍一节**（到下一个 `##` 为止）—— 规范节排在叙事末尾，
*   但它未必是文件最后一节（后面还有 `沉淀知识`，由另一个函数负责）。
*
* ⚠️ **两个用途**（缺一不可）：
*  ① **写入前**：模型给的 `doc` 里若带了旧规范（它可能把整份文档回传），
*     必须先砍掉 —— 否则 `mergeNarrative` 会把它当成"一个自定义节"，
*     与我们随后重建的那一份**并存**（= 文档里出现两个规范节）；
*  ② **重建前**：落盘前把旧规范砍掉、再按模板重建（**幂等**）。
* @param text - 文本。
* @returns 砍掉该节后的文本（没有该节 ⇒ 原样返回）。
*/
function cutSpecSection(text) {
	const r = specRange(text);
	if (r === void 0) return text;
	const lines = text.split(/\r?\n/);
	let realEnd = r.end;
	while (realEnd < lines.length && (lines[realEnd] ?? "").trim() === "") realEnd += 1;
	return [...lines.slice(0, r.start), ...lines.slice(realEnd)].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
/**
* ⭐⭐ 取出「本档写作规范」那一节的**原文**（含标题行；没有 ⇒ 空串）。
*
* 🔴 **用途：`handoff` 落盘时"原样保住它"**。
*   它**复制自模板、之后归文档自己所有**（用户 2026-10-12 裁定：
*   *"建立项目的时候用复制初始模板……后续更新项目文档的时候就在项目自己的文档里去更新"*）
*   ⇒ ⚠️ **不按模板重建**（否则用户在本文档里改过的规范会被模板覆盖回去，
*     而模板与文档是**解耦**的——改模板不该影响已有文档）。
*
* ⚠️ 与 `cutSpecSection()` 的关系：一个取、一个砍，**必须用同一套边界规则**
*   （都按行首精确匹配 + 到下一个顶层 `##` 为止）——否则"取出来的"与"砍掉的"
*   范围不一致，会**静默留下半截**。这正是本项目"同一语义两条实现"的经典坑，
*   所以两者挨着写、共用 `specRange()`。
* @param text - 文本。
* @returns 该节原文（含 `## ` 标题行；末尾已 trim）；没有该节 ⇒ `''`。
*/
function extractSpecSection(text) {
	const r = specRange(text);
	if (r === void 0) return "";
	return r.lines.join("\n").trim();
}
/**
* ⭐ 「本档写作规范」节在行数组里的**唯一边界实现**（`cutSpecSection` 与
*   `extractSpecSection` 共用，见前者的注释）。
* @param text - 文本。
* @returns `{ start, end }`（`end` 不含）；没有该节 ⇒ `undefined`。
*/
function specRange(text) {
	const lines = text.split(/\r?\n/);
	let start = -1;
	for (let i = 0; i < lines.length; i += 1) if (isSpecHeading(lines[i] ?? "")) {
		start = i;
		break;
	}
	if (start === -1) return void 0;
	let end = lines.length;
	for (let j = start + 1; j < lines.length; j += 1) if (/^##\s+/.test(lines[j] ?? "")) {
		end = j;
		break;
	}
	return {
		start,
		end,
		lines: lines.slice(start, end)
	};
}
/**
* ⭐ 判断一行是不是「沉淀知识」的**顶层标题行**。
*
* 🔴 **必须按行首精确匹配**（不能用 `indexOf` 查子串）：叙述里可能**引用**
*   这个标题（例如"见 `## 沉淀知识`"），子串查找会把真实内容误删。
*   ⚠️ 这是既有实现里明写过的坑 —— 本函数是它的**唯一实现**
*   （历史上 `handoff.ts` 与 `parse.ts` 各写了一遍同样的正则）。
* @param line - 待判定的行。
* @returns 是「沉淀知识」顶层标题 ⇒ true。
*/
function isKnowledgeHeading(line) {
	return new RegExp(`^##\\s+${KNOWLEDGE_TITLE}\\s*$`).test(line);
}
/**
* ⭐ 砍掉「沉淀知识」节**及其后的全部内容**。
*
* 🔴 用途：写文档前先清掉旧封面（那一节由工具重建，只放封面不放正文）。
*   ⚠️ 按**行首精确匹配**，理由同 `isKnowledgeHeading()`。
* @param text - 文本。
* @returns 砍掉后的文本（没有该节 ⇒ 原样返回）。
*/
function cutKnowledgeSection(text) {
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i += 1) if (isKnowledgeHeading(lines[i] ?? "")) return lines.slice(0, i).join("\n");
	return text;
}
/**
* 🔴 **`sectionsOf()` 已删除**（2026-10-05）。
*
* 它原先的职责是"取文档记着的节名；**没记就回落默认六节**"——
* 而"记在哪"这个前提已经消失（封面的 `sections` 字段删掉了，模板也走 md 了）。
*
* ⭐ **删掉它带来的语义变化（用户裁定）**：
*   旧：文档没声明节名 ⇒ **回落默认六节**（于是"没声明"会被当成"默认六节"）；
*   新：**正文里没有节 ⇒ 就是没有** —— 由调用方决定怎么办（要骨架就去问模板）。
*   ⇒ ⭐ 判据：**"没写"与"写了但为空"必须是两个状态**，不能靠回落把前者伪装成后者。
*/
/**
* ⭐⭐⭐ **从文档正文的 `## ` 标题推导节名清单**（2026-10-12，本函数的诞生是一次真 bug 的根治）。
*
* 🔴🔴 **为什么必需**（实测复现的损坏路径）：
*   原先唯一权威是 `frontmatter.sections`，而它有**两条独立维护路径**：
*   ① `memj_handoff` 建项目时写入；② `rebuildDerivedLayers()` 汇总 `themes:` 时
*   **手工重写整个 frontmatter**，而它那张字段表里**没有 `sections`**
*   ⇒ 一旦某项目的 `themes:` 需要更新，重写就会把 `sections` / `truncateSections` /
*   `template` **整行抹掉**（实测：注入一个不存在的主题强制触发 ⇒ 三个字段全消失，
*   而 `createdAt` / `updatedAt` / `archivedAt` 还在）。
*   ⇒ 之后 `sectionsOf(空)` **回落默认六节** ⇒ 一份用自定义模板建的文档
*   **被程序按默认六节理解** ⇒ 下次 handoff 只更新一节时，
*   **六个默认空壳节被插到最前面**、原有六节被当成"非自定义节"留到后面
*   （实测 6 节 → 12 节；生产 `metax-688802` 的镜像里留下过一次 6 节 → 43 节的真现场）。
*
* ⭐⭐ **修法：让权威源落在"唯一不会被任何旁路改写"的地方 —— 正文自己。**
*   · 正文是 `rebuildDerivedLayers()` **唯一逐字保留**的东西（实测 sha256 相同）；
*   · `frontmatter.sections` **降级为兼容读**（老文档、或正文还没有规范节时用）。
*
* 🔴 **排除两类标题**（否则会把工具自己的节算成"叙事节"）：
*   · `## 沉淀知识`（封面容器，由工具维护）；
*   · `## 本档写作规范`（规范容器，由工具维护）。
* @param narrative - 纯叙事文本（`narrativeFromProjectText()` 的产物，已剥 frontmatter/封面）。
* @returns 节名数组（按文档顺序、已去重）；**一个都没有 ⇒ 空数组**（由调用方决定回落）。
*/
function sectionsFromNarrative(narrative) {
	const out = [];
	let inFence = false;
	for (const line of narrative.split(/\r?\n/)) {
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = /^##\s+(.+?)\s*$/.exec(line);
		if (m === null) continue;
		const t = (m[1] ?? "").trim();
		if (t === "" || t === "沉淀知识" || t === "本档写作规范") continue;
		if (!out.includes(t)) out.push(t);
	}
	return out;
}
/**
* ⭐⭐⭐ **取"这份文档自己的节名清单"的唯一入口**（2026-10-12 起）——**正文优先**。
*
* 🔴🔴 **两处权威、优先级固定，别调换**：
*   ① ⭐ **正文的 `##` 标题**（`sectionsFromNarrative`）——**唯一权威**。
*      理由（实测）：它是 `rebuildDerivedLayers()` 唯一不碰的地方；
*   ② 正文里**一个叙事节都没有**（空骨架 / 刚建还没落正文）⇒ 空数组，
*      由调用方决定去要模板骨架 —— ⚠️ **不再回落"默认六节"**（见下）。
*
* 🔴🔴 **2026-10-05（本次）：`frontmatter.sections` 已删除、`sectionsOf()` 的回落也删了。**
*   起因：模板完全走 md 文档之后，封面那行 `sections:` 成了**节名的最后一份副本**，
*   而"空 ⇒ 默认六节"这条回落**有副作用**：它让"**没声明**"与"**声明了但为空**"
*   无法区分（`defaultTruncateTitle` 的判据分两步就是被它逼出来的，见 `schema.ts`）。
*   ⇒ 现在的语义**更简单也更直白**：**节名只看正文；正文没写就没有**。
* @param narrative - 纯叙事文本（可传 `''`）。
* @returns 该文档的节名（顺序即文档顺序）；正文没有叙事节 ⇒ 空数组。
*/
function docSectionsOf(narrative) {
	return sectionsFromNarrative(narrative);
}
/**
* ⭐ **按给定节名生成"骨架"**（每节一个空标题）——建文档 / 规范化时用。
*
* ⚠️ 与 `NARRATIVE_SECTIONS` 的区别：那个是**默认六节的**固定形态；
*   本函数接受任意节名清单（用户自定义模板用）。
* @param sections - 节名清单。
* @returns 形如 `## 目标\n\n## 进展\n` 的骨架文本。
*/
function buildSkeleton(sections) {
	return sections.map((t) => `## ${t}\n`).join("\n");
}
//#endregion
//#region src/parse.ts
/**
* 封面解析与硬校验（方案 §3.2 / §3.9）。
*
* 🔴 **这是全系统唯一的「确定性解析」处，也是写入校验与 rebuild 校验的共同底座。**
* 决策 71：**可数的事实归程序，语义归模型**——本文件零 LLM、零网络、纯函数。
*
* ── 封面语法（§3.2）──────────────────────────────────────────────────────
* ```
* <!-- memj:entry
* id: 3502af2f-797a-435b-933d-8ab873978ee1
* project: dsh-memj
* theme: [thm-a]
* global: false
* tags: 构建,陷阱
* desc: <这是什么场景下的什么知识>；当<什么场景>时读它。
* ref: entries/lib-is-real-source-3502af2f.md
* -->
* <!-- /memj:entry -->
* ```
* 围栏（`<!-- memj:entry` ↔ `-->`＋`<!-- /memj:entry -->`）是**唯一解析依据**。
*
* ── 两种校验的处置不同（§3.9.3，别混）─────────────────────────────────────
* | | 写入校验（`memj_handoff`） | 重建校验（`memj_rebuild`） |
* |---|---|---|
* | 场景 | **你的输入**有问题 | **别人手改**坏了文档 |
* | 处置 | 🔴 **报错并要求重写**（整份不写） | ⭐ **跳过非法封面 + 记入报告** |
* 本文件**只负责发现并描述问题**，由调用方决定处置。
*
* @module dsh-memj/parse
*/
/** `desc` 的长度上限（字符数，§3.2）。 */
const DESC_MAX_CHARS = 200;
/** `slug` 的硬校验规则（§3.9.2 第 6 项）：全小写英文/数字/连字符，2–48 字符。 */
const SLUG_RE = /^[a-z0-9-]{2,48}$/;
/**
* ⭐ `title` 的长度范围（字符数，决策 98 / §3.9.2 第 3b 项）。
* 与 `slug` 同区间（2–48）——设计文档里两处都写"2–48 字符"。
*/
const TITLE_MIN_CHARS = 2;
/** `title` 的长度上限。 */
const TITLE_MAX_CHARS = 48;
/** UUID 形状（§3.4：`id` = UUID）。 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 封面围栏的起始标记。 */
const FENCE_OPEN = "<!-- memj:entry";
/** 封面围栏的结束标记（与 `-->` 配对出现，缺一不可）。 */
const FENCE_CLOSE = "<!-- /memj:entry -->";
/** 按**码点**计数，避免 emoji 被算成 2（`String.length` 数的是 UTF-16 码元）。 */
function charCount(text) {
	return [...text].length;
}
/**
* 判断一个标量能否**不加引号**安全地写进 YAML。
*
* ⚠️ 必要性：`desc` 里完全可能出现半角 `: `（如 `Why: …`）或行首 `-`，
* 裸写会让 YAML 解析出错或截断。
* @param value - 待写出的字符串。
* @returns 可裸写返回 true。
*/
function isPlainSafe(value) {
	if (value.length === 0) return false;
	if (/[\n\r\t]/.test(value)) return false;
	if (/^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(value)) return false;
	if (value.includes(",")) return false;
	if (/:\s/.test(value)) return false;
	if (/\s#/.test(value)) return false;
	if (/[:#]$/.test(value)) return false;
	if (/\s$/.test(value)) return false;
	return true;
}
/**
* 把一个字符串渲染成 YAML 标量：能裸写就裸写，否则用双引号形式。
*
* JSON 是 YAML 的子集，所以 `JSON.stringify` 的产物**一定是合法的 YAML 双引号标量**。
* @param value - 待写出的字符串。
* @returns YAML 标量文本。
*/
function yamlScalar(value) {
	return isPlainSafe(value) ? value : JSON.stringify(value);
}
/**
* 把可能来自 YAML 的值规范成字符串数组。
*
* 同时接受：`[a, b]`（数组）、`a,b`（逗号分隔串）、`a，b`（中文逗号）。
* @param value - 原始值。
* @returns 去空、去重前的字符串数组。
*/
function toStringArray(value) {
	if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter((s) => s !== "");
	if (typeof value === "string") return value.split(/[,，]/).map((s) => s.trim()).filter((s) => s !== "");
	if (value === null || value === void 0) return [];
	return [String(value).trim()].filter((s) => s !== "");
}
/** 取字符串字段（非字符串一律当空串，交由校验报错）。 */
function str(value) {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return "";
}
/** 取布尔字段（宽松：`true`/`"true"`/`1` 都算真）。 */
function bool(value) {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") return value.trim().toLowerCase() === "true";
	if (typeof value === "number") return value !== 0;
	return false;
}
/**
* 把一段 YAML 文本解析成 `Cover`（**不做校验**，缺失字段留空）。
* @param yamlText - 围栏内的 YAML 原文。
* @returns 封面对象。
*/
function coverFromYaml(yamlText) {
	const data = parse(yamlText) ?? {};
	const rawKind = str(data["kind"]).trim();
	const source = readSourceField(data["source"]);
	return {
		id: str(data["id"]),
		project: str(data["project"]),
		theme: toStringArray(data["theme"]),
		global: bool(data["global"]),
		kind: isEntryKind(rawKind) ? rawKind : "",
		tags: toStringArray(data["tags"]),
		title: str(data["title"]),
		desc: str(data["desc"]),
		ref: str(data["ref"]),
		ext: bool(data["ext"]),
		createdAt: str(data["createdAt"]),
		updatedAt: str(data["updatedAt"]),
		archivedAt: str(data["archivedAt"]),
		...source !== void 0 ? { source } : {}
	};
}
/**
* ⭐ **读 `source` 字段**（封面 YAML 的嵌套块）。
*
* ⚠️ **宽容读**：块不存在 / 不是对象 / 两个子字段都空 ⇒ 返回 `undefined`
*    （而不是空对象）—— 调用方与前端都靠"有没有这个字段"做判断。
* @param raw - YAML 解析出来的原值。
* @returns 规范化后的 source；没有 ⇒ `undefined`。
*/
function readSourceField(raw) {
	if (typeof raw !== "object" || raw === null) return void 0;
	const s = raw;
	const sessionId = str(s["sessionId"]);
	const from = str(s["from"]);
	if (sessionId === "" && from === "") return void 0;
	return {
		...sessionId !== "" ? { sessionId } : {},
		...from !== "" ? { from } : {}
	};
}
/**
* 从原始 YAML 里取 `kind` 的**原样字符串**（不做合法性过滤）。
*
* ⚠️ 必要性：`coverFromYaml` 会把非法 `kind` 落成空串，
* 于是「填了 `bug`」与「根本没填」变得无法区分，校验就报不出错。
* 校验前需要原值来判定。
* @param yamlText - 围栏内的 YAML 原文。
* @returns 原始 kind 字符串（无则空串）。
*/
function rawKindFromYaml(yamlText) {
	try {
		return str((parse(yamlText) ?? {})["kind"]).trim();
	} catch {
		return "";
	}
}
/**
* 渲染一张封面为区块文本（含两侧围栏，**不含**尾随换行）。
*
* 字段顺序固定为 id / project / theme / global / kind / tags / **title** / desc / ref / ext——
* 手改文档时肉眼好核对，也让 rebuild 的 diff 稳定。
* @param cover - 封面。
* @returns 可直接拼进 handoff 文档的文本块。
*/
function renderCover(cover) {
	const lines = [
		FENCE_OPEN,
		`id: ${yamlScalar(cover.id)}`,
		`project: ${yamlScalar(cover.project)}`,
		`theme: [${cover.theme.map((t) => yamlScalar(t)).join(", ")}]`,
		`global: ${cover.global ? "true" : "false"}`
	];
	if (isEntryKind(cover.kind)) lines.push(`kind: ${cover.kind}`);
	if (cover.tags.length > 0) lines.push(`tags: ${renderYamlArray(cover.tags)}`);
	lines.push(`title: ${yamlScalar(cover.title)}`);
	lines.push(`desc: ${yamlScalar(cover.desc)}`);
	lines.push(`ref: ${yamlScalar(cover.ref)}`);
	if (cover.ext) lines.push("ext: true");
	if ((cover.createdAt ?? "") !== "") lines.push(`createdAt: ${yamlScalar(cover.createdAt)}`);
	if ((cover.updatedAt ?? "") !== "") lines.push(`updatedAt: ${yamlScalar(cover.updatedAt)}`);
	if ((cover.archivedAt ?? "") !== "") lines.push(`archivedAt: ${yamlScalar(cover.archivedAt)}`);
	if (cover.source !== void 0 && (cover.source.sessionId !== void 0 || cover.source.from !== void 0)) {
		lines.push("source:");
		if (cover.source.sessionId !== void 0) lines.push(`  sessionId: ${yamlScalar(cover.source.sessionId)}`);
		if (cover.source.from !== void 0) lines.push(`  from: ${yamlScalar(cover.source.from)}`);
	}
	lines.push("-->", FENCE_CLOSE);
	return lines.join("\n");
}
/**
* 校验一张封面的**自包含**规则（§3.9.2 的第 1–5、7 项）。
*
* 「库内唯一」与「theme 必须已存在」需要库的全貌，由 `store` 侧另行校验。
* @param cover - 封面。
* @param rawKind - ⭐ 从 YAML 取的**原始** `kind` 字符串（未过滤）。
*   ⚠️ 必须传它才能报出"填了非法值"——`cover.kind` 里非法值已被落成空串，
*   与"没填"无法区分。不传则跳过这项校验。
* @param pendingNomination - ⭐ **该封面是否在 global 提名表里**（方案 A）。
*   传 `true` 表示"申请了全局、待批准"——三空校验把它**视为一种归属**
*   （否则纯全局知识在批准前写不进去）。不传 ⇒ 不做这层豁免。
* @returns 问题描述数组（空 = 通过）。
*/
function validateCoverShape(cover, rawKind, pendingNomination) {
	const issues = [];
	if (cover.id === "") issues.push("缺 id");
	else if (!UUID_RE.test(cover.id)) issues.push(`id 不是 UUID 形状：${cover.id}`);
	if (cover.desc.trim() === "") issues.push("缺 desc");
	else {
		const n = charCount(cover.desc);
		if (n > 200) issues.push(`desc 超长：${n} 字符（上限 200）`);
	}
	if (cover.title.trim() === "") issues.push("缺 title");
	else {
		const n = charCount(cover.title);
		if (n < 2) issues.push(`title 过短：${n} 字符（下限 2）`);
		if (n > 48) issues.push(`title 超长：${n} 字符（上限 48）`);
	}
	if (cover.ref.trim() === "") issues.push("缺 ref");
	else if (cover.ext && !isAbsolutePath(cover.ref)) issues.push(`ext: true 但 ref 不是绝对路径：${cover.ref}`);
	if (cover.tags.length === 0) issues.push("tags 为空（至少 1 个）");
	if (rawKind !== void 0 && rawKind !== "") {
		if (!isEntryKind(rawKind)) issues.push(`kind 的取值非法：「${rawKind}」——只能是 ${selectableKindList()} 之一，或留空`);
	}
	if ((cover.archivedAt ?? "") !== "" && Number.isNaN(new Date(cover.archivedAt).getTime())) issues.push(`archivedAt 不是可解析的时间：${cover.archivedAt}`);
	if (cover.project === "" && cover.theme.length === 0 && !cover.global && pendingNomination !== true) issues.push("三空：project 空 + theme 空 + 未申请/未批准全局 ⇒ 无任何归属层");
	return issues;
}
/**
* 判断是否绝对路径（兼容 Windows 盘符、UNC 与 POSIX）。
* @param path - 待判断路径。
* @returns 是否绝对路径。
*/
function isAbsolutePath(path) {
	if (path.startsWith("/")) return true;
	if (path.startsWith("\\\\")) return true;
	return /^[a-zA-Z]:[\\/]/.test(path);
}
/**
* 从一份 handoff 文档里**解析出全部封面**（§3.2）。
*
* 解析失败**不抛异常**——逐条记进 `issues`，由调用方决定处置
* （写入时报错要求重写；rebuild 时跳过并报给人）。
* @param text - 文档全文。
* @param sourceFile - 来源文件名（用于报错定位）。
* @returns 解析出的封面与问题清单。
*/
function parseCovers(text, sourceFile) {
	const lines = text.split(/\r?\n/);
	const covers = [];
	const issues = [];
	/**
	* ⭐ **解析失败、但被原样保留的围栏块**（§8.7④ / §12-79）。
	*
	* 🔴 **为什么必须有它**：`writeProjectDoc` 只渲染 `covers`。若写回时不管这些块，
	* 它们就会**被静默删除**——表现为"人手改坏一个字符，下次 handoff 就把它弄丢了"。
	* 设计 §3.9.3 要求非法封面"**跳过并报给人**"，不是"丢掉"。
	*
	* 调用方（`loadProjectDoc`）把它们一并带出，写回时**原样附在封面区末尾**；
	* 修好后它们自然被解析、重复块消失。
	*/
	const orphans = [];
	/** ⭐ 全部围栏块的行区间（含合法与非法），供局部替换定位。 */
	const blocks = [];
	/** 记下一个块的区间（行号 1 起，闭区间）。 */
	const noteBlock = (from, to) => {
		blocks.push({
			startLine: from + 1,
			endLine: to + 1,
			text: lines.slice(from, to + 1).join("\n")
		});
	};
	/** 记一个问题。 */
	const fail = (line, reason) => {
		issues.push({
			file: sourceFile,
			line,
			reason
		});
	};
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? "";
		const openAt = line.indexOf(FENCE_OPEN);
		if (openAt === -1) {
			i += 1;
			continue;
		}
		const blockStart = i;
		const startLine = i + 1;
		const afterOpen = line.slice(openAt + 15);
		let yamlText;
		let endIndex;
		const inlineEnd = afterOpen.indexOf("-->");
		if (inlineEnd !== -1) {
			yamlText = afterOpen.slice(0, inlineEnd);
			endIndex = i;
		} else {
			const collected = [];
			if (afterOpen.trim() !== "") collected.push(afterOpen);
			let j = i + 1;
			let closed = false;
			while (j < lines.length) {
				if ((lines[j] ?? "").trim() === "-->") {
					closed = true;
					break;
				}
				collected.push(lines[j] ?? "");
				j += 1;
			}
			if (!closed) {
				fail(startLine, "封面围栏未闭合：找了 `-->` 但没找到");
				orphans.push(lines.slice(blockStart).join("\n").trimEnd());
				noteBlock(blockStart, lines.length - 1);
				break;
			}
			yamlText = collected.join("\n");
			endIndex = j;
		}
		let k = endIndex + 1;
		while (k < lines.length && (lines[k] ?? "").trim() === "") k += 1;
		if (k >= lines.length || (lines[k] ?? "").trim() !== FENCE_CLOSE) {
			fail(startLine, `缺少配对的 ${FENCE_CLOSE}`);
			orphans.push(lines.slice(blockStart, endIndex + 1).join("\n").trimEnd());
			noteBlock(blockStart, endIndex);
			i = endIndex + 1;
			continue;
		}
		let cover;
		try {
			cover = coverFromYaml(yamlText);
		} catch (err) {
			fail(startLine, `封面的 YAML 解析失败：${err instanceof Error ? err.message : String(err)}`);
			orphans.push(lines.slice(blockStart, k + 1).join("\n").trimEnd());
			noteBlock(blockStart, k);
			i = k + 1;
			continue;
		}
		const shapeIssues = validateCoverShape(cover, rawKindFromYaml(yamlText));
		if (shapeIssues.length > 0) {
			for (const reason of shapeIssues) fail(startLine, `封面 ${cover.id === "" ? "(无 id)" : cover.id} 的 ${reason}`);
			orphans.push(lines.slice(blockStart, k + 1).join("\n").trimEnd());
			noteBlock(blockStart, k);
			i = k + 1;
			continue;
		}
		covers.push({
			cover,
			sourceFile,
			line: startLine
		});
		noteBlock(blockStart, k);
		i = k + 1;
	}
	return {
		covers,
		issues,
		orphans,
		blocks
	};
}
/**
* 从文档里移除全部封面围栏，只留下叙事部分。
*
* `memj_handoff` 写「沉淀知识」节时要先清掉旧封面再写新的，
* 否则会把上一次的封面留在文档里造成重复。
* @param text - 文档全文。
* @returns 去掉封面块后的文本。
*/
function stripCovers(text) {
	const lines = text.split(/\r?\n/);
	const out = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? "";
		if (line.includes(FENCE_OPEN)) {
			if (line.includes("-->")) {
				let k = i + 1;
				while (k < lines.length && (lines[k] ?? "").trim() === "") k += 1;
				i = k < lines.length && (lines[k] ?? "").trim() === FENCE_CLOSE ? k + 1 : i + 1;
				continue;
			}
			let j = i + 1;
			while (j < lines.length && (lines[j] ?? "").trim() !== "-->") j += 1;
			let k = j + 1;
			while (k < lines.length && (lines[k] ?? "").trim() === "") k += 1;
			i = k < lines.length && (lines[k] ?? "").trim() === FENCE_CLOSE ? k + 1 : j + 1;
			continue;
		}
		out.push(line);
		i += 1;
	}
	return out.join("\n");
}
/**
* 从**整份项目文档**里取出「纯叙事」——即 `writeProjectDoc` 期望的那种输入。
*
* 🔴 **为什么必须收成一处**（§8.7② / §12-74）：`writeProjectDoc` 会**自己生成**
* frontmatter、一级标题与「沉淀知识」节。若调用方把"整份文档"当叙事塞进去，
* 这三样就会被写**两遍**（实测：frontmatter 分隔线 4 条、`# HANDOFF` 标题 2 个）。
*
* 三条写回路径里，`memj_handoff` 主路径走的是 `narrativeFromDoc()`（从 LLM 输入剥离，干净）；
* 而 `memj_promote` 与 `linkCoverToTheme` 这两条**事后路径**曾直接拿
* `loadProjectDoc().narrative`（那是"整份文档仅剪掉封面块"）塞回去 ⇒ 重复写。
*
* ⇒ 本函数即"从已有文档取叙事"的**唯一实现**，剥四样：
* ① frontmatter（由程序按库状态重新生成，不让旧值盖新值）；
* ② 封面围栏块（由调用方按 `covers` 重新渲染）；
* ③ 「沉淀知识」节及其后内容（同上）；
* ④ 一级标题（按项目 id 重新拼）。
*
* ⚠️ **不做规范化**（不补空节、不重排）——调用方是程序自己写的文档，结构本就规范；
* 规范化是给"LLM 输入不可信"的主路径用的，见 `handoff.ts` 的 `narrativeFromDoc`。
* @param text - 项目文档全文（可含 frontmatter 与封面）。
* @returns 纯叙事 markdown（不含 frontmatter / 标题 / 封面 / 沉淀知识节）。
*/
function narrativeFromProjectText(text) {
	const { body } = splitFrontmatter(text);
	return cutKnowledgeSection(stripCovers(body)).replace(/^\s*#\s+HANDOFF[^\n]*\n+/i, "").replace(/^\s*<!--\s*文件位置：[^>]*-->\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}
/**
* ⭐ **按行区间局部替换一个封面块**（§8.6「修复」的核心操作）。
*
* 🔴 **为什么必须局部替换**（实测）：`writeProjectDoc` 只渲染能解析成功的 `covers`，
* 而非法封面**进不了 `covers`**。若修复时图省事"整篇重渲染"，
* **同文档里其它非法封面块会被静默删掉**（`verify/probe-memj-invalid-cover-loss.mjs` 实测确认）。
* ⇒ 只换目标块，其余字节原样不动。
*
* @param text - 原文档全文。
* @param startLine - 目标块起始行（**1 起**，闭区间）。
* @param endLine - 目标块结束行（**1 起**，闭区间）。
* @param replacement - 新块文本（一般由 `renderCover` 生成）。
* @returns 替换后的全文。
* @throws 区间越界或非法时抛错（调用方应视为"定位失败，拒绝写入"）。
*/
function replaceBlockAtLines(text, startLine, endLine, replacement) {
	const lines = text.split(/\r?\n/);
	if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine || endLine > lines.length) throw new Error(`行区间非法：${startLine}-${endLine}（文档共 ${lines.length} 行）`);
	const before = lines.slice(0, startLine - 1);
	const after = lines.slice(endLine);
	return [
		...before,
		...replacement.split("\n"),
		...after
	].join("\n");
}
/**
* 拆出文档头部的 YAML frontmatter 与正文。
*
* 没有 frontmatter 时 `data` 为 `null`、`body` 为全文——**不报错**，
* 因为「没有 frontmatter」是合法状态（项目文档尚未建时）。
* @param text - 文档全文。
* @returns frontmatter 数据、正文、以及 frontmatter 的结束行号。
*/
function splitFrontmatter(text) {
	const lines = text.split(/\r?\n/);
	if ((lines[0] ?? "").trim() !== "---") return {
		data: null,
		body: text,
		endLine: 0
	};
	let j = 1;
	while (j < lines.length && (lines[j] ?? "").trim() !== "---") j += 1;
	if (j >= lines.length) return {
		data: null,
		body: text,
		endLine: 0,
		error: "frontmatter 未闭合（缺第二个 `---`）"
	};
	const yamlText = lines.slice(1, j).join("\n");
	try {
		return {
			data: parse(yamlText) ?? {},
			body: lines.slice(j + 1).join("\n"),
			endLine: j + 1
		};
	} catch (err) {
		return {
			data: null,
			body: lines.slice(j + 1).join("\n"),
			endLine: j + 1,
			error: `frontmatter 的 YAML 解析失败：${err instanceof Error ? err.message : String(err)}`
		};
	}
}
/**
* 渲染 YAML frontmatter（含两侧 `---`，末尾带换行）。
* @param entries - 有序的键值对（顺序即输出顺序）。
* @returns frontmatter 文本块。
*/
/**
* 渲染 YAML frontmatter（含两侧 `---`，末尾带换行）。
*
* ⚠️ **块头要写成 `source:`（带冒号）**，不能是 `source`，也不能是 `source:: `。
* 调用方约定：**块头传 `['source:', '']`**（key 自带冒号、值为空串）。
*  - 若一律拼 `${key}: ${value}` ⇒ 渲染成 `source:: ` ——
*    YAML 会把它解析成**字符串** `":"`，整棵子树（`sessionId`/`from`）**丢了**；
*  - 若把冒号剥掉 ⇒ 渲染成 `source` —— YAML 直接**解析失败**
*    （`Implicit keys need to be on a single line`）。
* ⇒ 空值时**原样输出 key**（它已含所需的冒号）。
* @param entries - 有序的键值对（顺序即输出顺序）。
* @returns frontmatter 文本块。
*/
function renderFrontmatter(entries) {
	const lines = ["---"];
	for (const [key, value] of entries) lines.push(value === "" ? key : `${key}: ${value}`);
	lines.push("---", "");
	return lines.join("\n");
}
/** 渲染字符串数组为 YAML 流式序列（`[a, b]`）。 */
function renderYamlArray(values) {
	return `[${values.map((v) => yamlScalar(v)).join(", ")}]`;
}
/**
* 从正文里提取标题（§3.2「标题」行）。
*
* - **内部条目**取首个 `###`；**外部引用**取首个 `#`。
* - 都取不到时返回空串（调用方用 slug 或 id 兜底显示）。
* @param body - 正文（不含 frontmatter）。
* @param level - 要找的标题级别。
* @returns 标题文本。
*/
function extractTitle(body, level = "###") {
	return (level === "###" ? /^###\s+(.+)$/m : /^#\s+(.+)$/m).exec(body)?.[1]?.trim() ?? "";
}
/**
* 计算两串的 Levenshtein 编辑距离（用于 §3.9.2 第 10 项的近义判定）。
*
* 采用滚动数组，空间 O(min(n,m))；id 很短（几十字符），无需更快的算法。
* @param a - 串 A。
* @param b - 串 B。
* @returns 编辑距离。
*/
function editDistance(a, b) {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i += 1) {
		const cur = [i];
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
		}
		prev = cur;
	}
	return prev[b.length] ?? 0;
}
/**
* 判断两个 id 是否**近义**（§3.9.2 第 10 项）。
*
* 判据：**互为子串** 或 **编辑距离 ≤ maxDistance**。
* 命中时工具**不直接建**，而是回相似项让 LLM/人确认。
* @param a - 已有 id。
* @param b - 新 id。
* @param maxDistance - 编辑距离上限。
* @returns 是否近义。
*/
function isSimilarId(a, b, maxDistance) {
	const x = a.trim().toLowerCase();
	const y = b.trim().toLowerCase();
	if (x === "" || y === "") return false;
	if (x === y) return true;
	if (x.includes(y) || y.includes(x)) return true;
	return editDistance(x, y) <= maxDistance;
}
/**
* 在已有 id 清单里找出与新 id 近义的那些（§3.9.2 第 10 项）。
* @param candidate - 想新建的 id。
* @param existing - 已有 id 清单。
* @param maxDistance - 编辑距离上限。
* @returns 近义的已有 id（保持原清单顺序）。
*/
function findSimilarIds(candidate, existing, maxDistance) {
	return existing.filter((id) => id !== candidate && isSimilarId(id, candidate, maxDistance));
}
//#endregion
export { HOT_SHAPES as $, tagVocabularyPath as $t, SPEC_SECTION as A, nominationsPath as At, renderSpecBlockLines as B, readingDir as Bt, yamlScalar as C, hotEntriesPath as Ct, NARRATIVE_TITLES as D, kindsFilePath as Dt, NARRATIVE_SECTIONS as E, hotSessionsPath as Et, docSectionsOf as F, promptOverridesPath as Ft, specBlockRange as G, requiredDirs as Gt, sectionsFromNarrative as H, readsDir as Ht, extractSpecBlock as I, promptsDir as It, ENTRY_KINDS as J, safeName as Jt, stripAllSpecBlocks as K, resolveInsideLibrary as Kt, extractSpecBlockLines as L, readLogPath as Lt, buildSkeleton as M, projectDocPath as Mt, cutKnowledgeSection as N, projectsDir as Nt, PROGRESS_TITLE as O, legacyTemplatePath as Ot, cutSpecSection as P, promptHistoryDir as Pt, HOT_PROJECT_UNKNOWN as Q, tagAutoStatePath as Qt, extractSpecSection as R, readingBindingsPath as Rt, validateCoverShape as S, hotDir as St, KNOWLEDGE_TITLE as T, hotSelectionPath as Tt, setSectionSpecBlock as U, recallLogDir as Ut, sectionSpecsOf as V, readingStatePath as Vt, specBlockFenceInfo as W, recallLogPath as Wt, HOT_BIND_SOURCES as X, scoreLogDir as Xt, ENTRY_KIND_DEFS as Y, scoreFilePath as Yt, HOT_CHANNELS as Z, scoreLogPath as Zt, renderYamlArray as _, docReadsDir as _t, charCount as a, currentReservedKinds as at, stripCovers as b, entryRelPath as bt, extractTitle as c, isEntryKind as ct, isSimilarId as d, selectableKindList as dt, tagsDir as en, KIND_CATALOG_MARKER as et, narrativeFromProjectText as f, setCurrentKindDefs as ft, renderFrontmatter as g, docReadLogPath as gt, renderCover as h, defaultTemplatePath as ht, TITLE_MIN_CHARS as i, themesDir as in, currentKindsOf as it, SPEC_TITLE as j, pluginRoot as jt, SPEC_BLOCK_FENCE as k, libraryRoot as kt, findSimilarIds as l, kindCatalogText as lt, rawKindFromYaml as m, backupNarrativePath as mt, SLUG_RE as n, templatesDir as nn, SELECTABLE_ENTRY_KINDS as nt, coverFromYaml as o, entryKindWhen as ot, parseCovers as p, backupDir as pt, stripSpecBlock as q, resolveRef as qt, TITLE_MAX_CHARS as r, themeDocPath as rn, currentKindDefsOf as rt, editDistance as s, fillKindMarkers as st, DESC_MAX_CHARS as t, templatePath as tn, KIND_LIST_MARKER as tt, isAbsolutePath as u, kindsInline as ut, replaceBlockAtLines as v, entriesDir as vt, KNOWLEDGE_SECTION as w, hotPersonaPath as wt, toStringArray as x, globalDocPath as xt, splitFrontmatter as y, entryFileName as yt, isKnowledgeHeading as z, readingCursorsPath as zt };
