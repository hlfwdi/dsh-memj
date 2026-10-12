import { t as __exportAll } from "./rolldown-runtime-D7D4PA-g.js";
import { $ as readPromptHistory, A as HANDOFF_UNTOUCHED_SECTIONS, At as fixCoverBlock, B as PROMPT_SPECS, Bt as readUnconsumedSnapshots, C as probeGit, Ct as byUpdatedDesc, Dt as deleteThemeDoc, Et as deleteProjectDoc, F as pendingSnapshots, Ft as loadThemeFrontmatter, G as hasOverride, H as clearPromptHistory, Ht as rejectNomination, I as recordRead, It as projectIdFromFile, J as overriddenKeys, Jt as writeGlobalDoc, K as listPromptHistory, Kt as syncEntryFrontmatter, L as renderSectionSpecs, Lt as readDocReads, M as SECTION_SPEC_HEAD, Mt as isHistoryCover, N as SNAPSHOT_CLOSING, Nt as loadEntryDoc, O as writeNarrativeMirror, Ot as ensureLibraryDirs, P as groupBySourceProject, Pt as loadProjectDoc, Q as promptText, R as renderSnapshotList, Rt as readNominations, S as noteGitSuccess, St as approveNomination, Tt as deleteEntryFile, U as emptyOverrides, Ut as removeNomination, V as checkNoDshVariables, Vt as rebuildDerivedLayers, W as fillSlots, Wt as scanLibrary, X as promptCurrent, Xt as writeProjectDoc, Y as overrideUpdatedAt, Yt as writeNominations, Z as promptDefault, Zt as writeThemeDoc, _ as ensureRepo, _t as renderOutputText, a as normalizeQuery, an as itemMinOf, at as resetPromptOverride, bt as appendDocRead, c as decideRead, ct as savePromptOverrides, d as groupSections, dt as specOf, en as Config, et as refreshPromptCache, f as parseSections, ft as validatePrompt, gt as groupOrder, h as commitAll, ht as catalogOf, i as filterContextByTerms, in as deriveDecisionKeyRef, it as resetPromptCache, j as SECTION_SPEC_CLOSING, jt as fixExternalRef, k as HANDOFF_UNTOUCHED_CLOSING, kt as findDocRead, l as extractSection, ln as scoreDecisionOf, lt as setPromptCacheForTest, m as sectionTitles, mt as PROMPT_GROUPS, n as bodySize, nn as activeDecisionOf, nt as registerPromptDefault, o as scoreCover, on as maxInjectionsPerTurn, ot as restorePromptHistory, p as preview, pt as PROMPT_CATALOG, q as loadPromptOverrides, qt as writeEntryDoc, r as filterByContext, rn as decisionProvidersOf, rt as registeredPromptKeys, s as sortHits, sn as needMinOf, st as savePromptOverride, t as HIT_WEIGHTS, tn as DEFAULT_CONFIG, tt as refreshPromptCacheSync, u as findSectionRange, ut as slotNames, vt as renderParametersText, w as readRepoState, wt as consumeSnapshots, x as noteGitFailure, xt as appendReadSnapshot, y as lastCommit, yt as addNomination, z as PROMPT_OVERRIDES_VERSION, zt as readSnapshots } from "./search-Zl0qE59D.js";
import { a as readTextIfExists, n as fileExistsStat, s as writeTextAtomic, t as ensureDir } from "./files-baWgIuqu.js";
import { $ as HOT_SHAPES, $t as themeDocPath, A as SPEC_SECTION, At as nominationsPath, B as renderSpecBlockLines, Bt as recallLogPath, C as yamlScalar, Ct as hotEntriesPath, D as NARRATIVE_TITLES, Dt as kindsFilePath, E as NARRATIVE_SECTIONS, Et as hotSessionsPath, F as docSectionsOf, Ft as promptOverridesPath, G as specBlockRange, Gt as scoreFilePath, H as sectionsFromNarrative, Ht as resolveInsideLibrary, I as extractSpecBlock, It as promptsDir, J as ENTRY_KINDS, Jt as tagAutoStatePath, K as stripAllSpecBlocks, Kt as scoreLogDir, L as extractSpecBlockLines, Lt as readLogPath, M as buildSkeleton, Mt as projectDocPath, N as cutKnowledgeSection, Nt as projectsDir, O as PROGRESS_TITLE, Ot as legacyTemplatePath, P as cutSpecSection, Pt as promptHistoryDir, Q as HOT_PROJECT_UNKNOWN, Qt as templatesDir, R as extractSpecSection, Rt as readsDir, S as validateCoverShape, St as hotDir, T as KNOWLEDGE_TITLE, Tt as hotSelectionPath, U as setSectionSpecBlock, Ut as resolveRef, V as sectionSpecsOf, Vt as requiredDirs, W as specBlockFenceInfo, Wt as safeName, X as HOT_BIND_SOURCES, Xt as tagsDir, Y as ENTRY_KIND_DEFS, Yt as tagVocabularyPath, Z as HOT_CHANNELS, Zt as templatePath, _ as renderYamlArray, _t as docReadsDir, a as charCount, at as currentReservedKinds, b as stripCovers, bt as entryRelPath, c as extractTitle, ct as isEntryKind, d as isSimilarId, dt as selectableKindList, en as themesDir, et as KIND_CATALOG_MARKER, f as narrativeFromProjectText, ft as setCurrentKindDefs, g as renderFrontmatter, gt as docReadLogPath, h as renderCover, ht as defaultTemplatePath, i as TITLE_MIN_CHARS, it as currentKindsOf, j as SPEC_TITLE, jt as pluginRoot, k as SPEC_BLOCK_FENCE, kt as libraryRoot, l as findSimilarIds, lt as kindCatalogText, m as rawKindFromYaml, mt as backupNarrativePath, n as SLUG_RE, nt as SELECTABLE_ENTRY_KINDS, o as coverFromYaml, ot as entryKindWhen, p as parseCovers, pt as backupDir, q as stripSpecBlock, qt as scoreLogPath, r as TITLE_MAX_CHARS, rt as currentKindDefsOf, s as editDistance, st as fillKindMarkers, t as DESC_MAX_CHARS, tt as KIND_LIST_MARKER, u as isAbsolutePath, ut as kindsInline, v as replaceBlockAtLines, vt as entriesDir, w as KNOWLEDGE_SECTION, wt as hotPersonaPath, x as toStringArray, xt as globalDocPath, y as splitFrontmatter, yt as entryFileName, z as isKnowledgeHeading, zt as recallLogDir } from "./parse-BmdKz3Y1.js";
import { a as effectiveScore, c as inWindow, d as topScored, i as deltaFor, l as lastRunTurn, n as aggregate, o as emptyScoreFile, r as applyAdds, t as SCORE_FILE_VERSION, u as pruneEvents } from "./hot-score-1hpld5lh.js";
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { parseDocument } from "yaml";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { deadline } from "@deepseek-ai/dsh-timeout";
//#region src/templates.ts
/**
* dsh-memj —— **交接文档模板**（决策 204）
*
* ── 它解决什么 ──────────────────────────────────────────────────────────────
* 交接文档原先**硬编码六节**（`sections.ts` 的 `NARRATIVE_TITLES`）。
* 用户要求：能**完全自定义**——自己定节名、节数、**每一节要干嘛**。
*
* ── 🔴 两条硬边界（用户 2026-09-30 裁定）──────────────────────────────────
* 1. **只作用于「新建项目」那一刻** ⇒ 模板**绝不回溯**已有文档。
*    落地方式：建文档时把模板的节骨架与**「本档写作规范」一节**一起写进正文，
*    此后那份文档**按自己正文里的 `##` 标题**工作（决策 207：**正文是节名的唯一权威**；
*    封面的 `sections` 字段**已删除**（2026-10-05）⇒ 节名只认正文）。
*    ⇒ ⭐ 这也意味着**改模板不影响任何已有文档**，删除模板同理。
* 2. **「沉淀知识」节钉死**（`KNOWLEDGE_TITLE`）——封面物理存在那一节里，
*    改名或删掉会让封面丢失或累积。⇒ 模板里**不许出现**这个节名。
*
* ── 数据形状（`<库根>/templates/<id>.md`，决策 208）───────────────────────
* ⭐ 人可读的 markdown：frontmatter 放 `id` / `title`，**每个 `## ` 标题 = 节名，
*    标题下的正文 = "这一节要干嘛"**（行末 `<!-- truncate -->` 标记参与截断）。
*    ⇒ 用户在设置页改模板 ≈ 直接改这份文档（见 `renderTemplateDoc` / `parseTemplateDoc`）。
* ⚠️ 旧的 `<id>.json` 仍**兼容读**（`legacyTemplatePath()`），但**不再写入**；
*    想清掉旧格式用 `scripts/migrate-templates-to-md.mjs`。
* | 字段 | 说明 |
* |---|---|
* | `id` | 模板 id（= 文件名，全小写英文/数字/连字符） |
* | `title` | 给人看的名字 |
* | `sections[]` | ⭐ **顺序即文档节顺序**；每条 `{ name, desc, truncate? }` |
* | `sections[].name` | `## ` 标题本身 |
* | `sections[].desc` | ⭐ **这一节要干嘛**（必填，渲染进该文档自己的「本档写作规范」一节） |
* | `sections[].truncate` | 该节是否参与**自动截断**（**可多节**；全 false = 不自动截断） |
*
* @module dsh-memj/templates
*/
var templates_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_SECTION_NAMES: () => DEFAULT_SECTION_NAMES,
	DESC_SOFT_WARN: () => DESC_SOFT_WARN,
	TEMPLATE_ID_RE: () => TEMPLATE_ID_RE,
	TEMPLATE_VERSION: () => 1,
	TPL_GUIDANCE_FOOT: () => TPL_GUIDANCE_FOOT,
	TPL_GUIDANCE_HEAD: () => TPL_GUIDANCE_HEAD,
	TPL_GUIDANCE_NO_TRUNC: () => TPL_GUIDANCE_NO_TRUNC,
	TPL_GUIDANCE_ROW: () => TPL_GUIDANCE_ROW,
	TPL_GUIDANCE_TRUNC_MARK: () => TPL_GUIDANCE_TRUNC_MARK,
	defaultTemplate: () => defaultTemplate,
	deleteTemplate: () => deleteTemplate,
	ensureDefaultTemplateFile: () => ensureDefaultTemplateFile,
	listTemplates: () => listTemplates,
	loadDefaultTemplate: () => loadDefaultTemplate,
	loadTemplate: () => loadTemplate,
	normalizeTemplate: () => normalizeTemplate,
	parseTemplateDoc: () => parseTemplateDoc,
	renderSpecBlocksSkeleton: () => renderSpecBlocksSkeleton,
	renderTemplateDoc: () => renderTemplateDoc,
	saveTemplate: () => saveTemplate,
	templateDeclaresArchiving: () => templateDeclaresArchiving,
	templateSectionNames: () => templateSectionNames,
	templateWarnings: () => templateWarnings,
	validateTemplate: () => validateTemplate
});
/** @deprecated 决策 209 退役（不再有消费者）。保留常量是为了**不删台账里的 key**。 */
const TPL_GUIDANCE_HEAD = "本文档共 **{{count}} 节**（顺序固定，工具按此输出；缺的节补空标题）：";
/** @deprecated 决策 209 退役（规范块的形态由 `renderSpecBlocksSkeleton` 生成）。 */
const TPL_GUIDANCE_ROW = "- `## {{name}}` —— {{desc}}{{trunc}}";
/**
* ✅ **仍在使用**（唯一还活着的 `tpl:guidance-*`）——**旧形态的兼容读**。
*
* 🔴 用途没变，但**消费者换了**：`truncateTitlesFromSpec()` 现在只服务
*   **存量文档**（决策 207 建的、规范还在末尾那一节里）。
*   ⇒ 删掉它，那些文档会**静默变成"不截"**（`a113fcb` 事故同族）。
*/
const TPL_GUIDANCE_TRUNC_MARK = "　⭐ **本节的较早内容会被自动截断归档**";
/**
* ✅ **仍在使用**：建项目回执里报"这份模板的规范里**没写**归档规则 ⇒ 文档不会自动瘦身"。
*
* 🔴 **2026-10-09 修**：它原先的触发判据是 `sections.every(s => s.truncate !== true)` ——
*   而 `truncate` **已从 `TemplateSection` 删除** ⇒ 那个判据**恒真**
*   ⇒ 这句话会**无条件**出现在每份新建项目的回执里，而它说的是**已废除的机制**。
*   现在改由 {@link templateDeclaresArchiving} 判"规范里有没有写归档规则"（见 `handoff.ts`）。
*/
const TPL_GUIDANCE_NO_TRUNC = `⚠️ **本模板的任何一节规范里都没有写归档规则** ⇒ 文档超长时**不会自动瘦身**。
⭐ 归档现在是**按各节规范里的自然语言**执行的（工具不再自动截断）——
想让某一节瘦身，就把规则写进那一节的规范里。`;
/** @deprecated 决策 209 退役（那句话改由回执报，不再写进文档）。 */
const TPL_GUIDANCE_FOOT = "🔴 **`## {{knowledgeTitle}}` 由工具生成**（放封面，不是你写的），**不在上面这几节里**。";
registerPromptDefault("tpl:guidance-head", TPL_GUIDANCE_HEAD);
registerPromptDefault("tpl:guidance-row", TPL_GUIDANCE_ROW);
registerPromptDefault("tpl:guidance-trunc-mark", TPL_GUIDANCE_TRUNC_MARK);
registerPromptDefault("tpl:guidance-no-trunc", TPL_GUIDANCE_NO_TRUNC);
registerPromptDefault("tpl:guidance-foot", TPL_GUIDANCE_FOOT);
/** 模板结构版本（变了就升 ⇒ 旧模板当不兼容，不猜）。 */
const TEMPLATE_VERSION = 1;
/**
* 代码围栏那一串反引号（避免在模板串里直接写它——本项目的老坑）。
*
* ⚠️ **它是"围栏那行"的唯一来源**：`renderTemplateDoc` / `renderSpecBlocksSkeleton`
*   都从它拼 ⇒ 不会出现"一处写 3 个、另一处写 4 个"。
*/
const FENCE = String.fromCharCode(96, 96, 96);
/** 模板 id 的允许形态（与 slug 同规，因为它同时是文件名）。 */
const TEMPLATE_ID_RE = /^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/;
/**
* ⭐ **内置默认模板**（= 改造前的硬编码六节）。
*
* ⭐⭐ **2026-10-12（决策 208）：`default` 也落盘，用户可直接编辑它。**
*   ⇒ 本函数是**纯函数回落值**（磁盘上没有那份文件时用它）；
*     真正"当前生效的默认模板"请用 **`loadDefaultTemplate()`**（它读盘优先）。
*   ⚠️ **为什么必须留一个纯函数的版本**：很多地方（校验、测试、UI 初值）要一个
*     不依赖磁盘的确定值；而"用户改过默认模板"这件事只影响**新建项目**。
*
* 🔴🔴 **2026-10-12（决策 223）：`truncate` 标记已废除，归档规则改成写进 `desc`。**
*   · **旧**：`{ name:'当前进度', truncate: true }` + 设置页两个全局旋钮
*     ⇒ 工具**自动**截断并落 `history` 条目；
*   · **新**：规则**写成自然语言放进这一节的书写规范**，**由模型执行**；
*     工具不再执行，只在交接回执里**报出各节字符数**（让模型有数字可对照）。
*   ⭐ 用户原话：*"什么阈值触发，压缩目标，要不要截断，怎么归档，归档到什么类型
*     完全由章节的书写规范去定。"*
*/
function defaultTemplate() {
	return {
		version: 1,
		id: "default",
		title: "默认（六节）",
		sections: [
			{
				name: "目标",
				desc: "这个项目要做什么。只保留**总目标**与**最新批次的目标**，用 `###` 子章节分开。"
			},
			{
				name: "当前进度",
				desc: [
					"做到哪了（新进展必须写进这一节）。",
					"最新的批次写在**最上面**；每个批次一个 `###` 小节，格式",
					"`### 第N批（YYYY-MM-DD）：<一句话主题>`（批号用中文数字，同一批次只写一个小节）。",
					"本节字符数**超过 20000 字符**时，把**最早的那些 `###` 小节整节**归档掉，压到**不超过 12000 字符**为止：",
					"· 条目：用 `memj_handoff` 的 `entries` 落成 **`kind: history`** —— ⚠️ **它不参与检索**（是留档，不是知识；写成别的类型就会正常参与检索）；",
					"· 正文**原文照收、一字不改**；`slug` 形如 `dsh-memj-history-b32-b37`；",
					"· 原处**只留一行指针**：**完整 uuid** + 一句话批次主题（例：`· 第32~37批：早期设置页改造 —— 详见条目 9f3c1a2b-…`）；",
					"· 指针集中放进 `### 历史进展` 小节，它在本节**最末尾**。"
				].join("\n")
			},
			{
				name: "有效做法",
				desc: "被验证过的工作方法"
			},
			{
				name: "失败/踩坑",
				desc: "出过的错与根因"
			},
			{
				name: "关键上下文",
				desc: "接手人必须知道的事实（路径、id、机制）"
			},
			{
				name: "下一步",
				desc: "待办"
			}
		]
	};
}
/**
* ⭐⭐ **取"当前生效的默认模板"**（决策 208）——**磁盘优先，回落内置**。
*
* 🔴 **为什么要它**：`default` 落盘之后，用户可能**改过它**
*   （这正是"default 也落盘"的目的）⇒ 凡"要用默认模板去建项目 / 渲染规范"的地方，
*   都该用本函数而不是 `defaultTemplate()`，否则**用户的修改会被内置值悄悄盖掉**。
*
* ⚠️ 与 `loadTemplate('default')` 的关系：那个也能读盘，但它**没有内置回落**
*   （文件不在就 `undefined`）⇒ 默认模板**必须永远可用**（它是 `delete` 的拒绝理由、
*   也是 `template` 参数的默认档），所以这里补上回落。
* @returns 模板（**永不 `undefined`**）。
*/
async function loadDefaultTemplate() {
	return await loadTemplate("default") ?? defaultTemplate();
}
/**
* ⭐⭐ **确保 `default` 模板已落盘**（决策 208）——首次使用时写一份出来。
*
* 🔴 **为什么需要"确保"而不是"启动时无条件写"**：
*   ① 它必须可被用户编辑 ⇒ 不能每次启动都把用户的改动**覆盖回内置值**；
*   ⇒ 判据 = **文件不存在才写**（幂等，不碰已有内容）。
* @returns 是否本次新建了该文件。
*/
async function ensureDefaultTemplateFile() {
	const p = defaultTemplatePath();
	let exists = false;
	try {
		await readFile(p, "utf8");
		exists = true;
	} catch {
		exists = false;
	}
	if (exists) return false;
	await mkdir(templatesDir(), { recursive: true });
	await writeTextAtomic(p, renderTemplateDoc(defaultTemplate()));
	return true;
}
/**
* ⭐⭐ **校验一份模板**（纯函数，不读盘）。
*
* 🔴🔴 **为什么"节名不得互为子串"是硬校验**（本次核实发现）：
*    `read.ts` 的按节匹配是**子串匹配**（`title.toLowerCase().includes(key)`），
*    而 `tools.ts` 累积"读到过哪些节"时**用同一条规则再筛一遍**
*    ⇒ 若两节互为子串（如「进度」与「进度详述」），**一次读取会同时记下两节**
*    ⇒ 「写前先读」闸门判"读全了"时**假绿**（它以为读过了，其实没有）。
*
* 🔴 **为什么必须挡「沉淀知识」**：封面物理存在那一节里（见 `sections.ts`）。
* @param t - 待校验的模板。
* @returns 问题清单（空 = 合法）。
*/
function validateTemplate(t) {
	const errs = [];
	if (!TEMPLATE_ID_RE.test(t.id)) errs.push(`\`id\` 必须是全小写英文/数字/连字符（2–48 字符），当前是 \`${t.id}\`。`);
	if (t.title.trim() === "") errs.push("`title` 不能为空。");
	if (t.sections.length === 0) errs.push("`sections` 至少要有 1 节。");
	const names = [];
	for (const [i, s] of t.sections.entries()) {
		const at = `第 ${i + 1} 节`;
		const name = s.name.trim();
		if (name === "") errs.push(`${at}：节名不能为空。`);
		if (/[\r\n]/.test(s.name)) errs.push(`${at}：节名不能含换行。`);
		if (name.startsWith("#")) errs.push(`${at}：节名不要带 \`#\`（工具会自己加 \`## \`）。`);
		if (s.desc.trim() === "") errs.push(`${at}（${name || "未命名"}）：\`desc\` 必填——它是"这一节要干嘛"。`);
		if (name === "沉淀知识") errs.push(`${at}：节名不能是「${KNOWLEDGE_TITLE}」——**那一节由工具维护**（封面存在那里），不开放给模板。`);
		if (name === "本档写作规范") errs.push(`${at}：节名不能是「${SPEC_TITLE}」——**那一节由工具维护**（写作规范），不开放给模板。`);
		if (/[`|]/.test(s.name)) errs.push(`${at}（${name}）：节名不能含反引号或竖线 —— 它会被渲染进行内代码，**反解时会被截断**（截断会瞄错节）。`);
		if (name.startsWith("#")) errs.push(`${at}：节名不要带 \`#\`（工具会自己加 \`## \`）。`);
		if (names.includes(name)) errs.push(`${at}：节名 \`${name}\` 重复。`);
		names.push(name);
	}
	for (const a of names) for (const b of names) {
		if (a === b || a === "" || b === "") continue;
		if (a.includes(b)) errs.push(`节名 \`${a}\` 含 \`${b}\` ⇒ 按节读取时会**一次命中两节**（读记录会误判"读全了"）。请改成互不包含的名字。`);
	}
	return errs;
}
/**
* ⭐⭐ **`desc` 超过这个长度就提醒**（**不阻断保存**）——2026-10-05 用户裁定。
*
* 🔴 **为什么是"提醒"而不是"上限"**：
*   这一节装的是**完整的书写规范**（要写什么 + 怎么写 + 截断/归档规则），
*   用户明确裁定"**干脆不限**"；而它**不吃截断配额**（规范块被整体剔除）⇒ 写长没有副作用。
* ⚠️ 保留一个提醒的理由很实际：**异常长多半是"误贴了整篇文档进来"** ——
*   那是人要判断的事，工具只负责**让他看见**，不替他拒绝。
*/
const DESC_SOFT_WARN = 2e3;
/**
* ⭐ **模板的"提醒"清单**（**不阻断保存**，与 `validateTemplate` 的"错误"分开）。
*
* ⭐ 为什么要和错误分开：两者的**后果完全不同** ——
*   错误 ⇒ 保存被拒（必须改）；提醒 ⇒ 照常保存，只是一句话告诉你"这看着不太对"。
*   混在一个数组里会让调用方**分不清该不该拦**。
* @param t - 待检查的模板。
* @returns 提醒清单（空 = 没什么可说的）。
*/
function templateWarnings(t) {
	const warns = [];
	for (const [i, s] of t.sections.entries()) {
		const n = [...s.desc].length;
		if (n > 2e3) warns.push(`第 ${i + 1} 节（${s.name.trim() || "未命名"}）：这一节的书写规范有 **${n}** 字符（超过 ${DESC_SOFT_WARN}）—— 请确认不是误贴了整篇文档。**不影响保存**。`);
	}
	return warns;
}
/**
* ⭐ 把模板拼成**该项目的节名清单**（顺序即文档顺序）。
* @param t - 模板。
* @returns 节名数组。
*/
function templateSectionNames(t) {
	return t.sections.map((s) => s.name);
}
/**
* ⭐ **这份模板有没有在任何一节的规范里写「归档规则」**（决策 223 之后的新判据）。
*
* ── 为什么要它 ─────────────────────────────────────────────────────────────
* 🔴🔴 旧判据是 `sections.every(s => s.truncate !== true)` —— 而 `truncate`
*   这个字段**已从 `TemplateSection` 删除**（决策 223）、`normalizeTemplate()` 也不读它
*   ⇒ 它**恒为 `undefined`** ⇒ `every(...)` **恒为 `true`**
*   ⇒ **每一份新建项目的回执都会说那句"文档不会自动瘦身"**，而它说的是**已废除的机制**。
*   ⭐ 判据必须指向**真实存在的东西**；指向一个被删掉的字段，就必然恒真。
*
* ── 现在的判据 ─────────────────────────────────────────────────────────────
* 归档规则**写在 `desc` 里的自然语言中**（工具读不懂它，但**能看出它有没有被写**）——
* 于是这里只做一件可机械判定的事：**任一节的 `desc` 里有没有提到归档**。
*
* ⚠️ **边界（这是"提醒"不是"校验"）**：正则按关键词判，**认不出自由措辞**
*   （用户若写"超过 2 万就把最早的挪到条目里"而不出现"归档/history" ⇒ 会判成"没写"）。
*   ⇒ 假阴性的方向是**多说一句提醒**，不影响功能；所以**不必**把它做成精确解析。
* @param t - 模板。
* @returns 有任一节提到归档 ⇒ `true`。
*/
function templateDeclaresArchiving(t) {
	return t.sections.some((s) => /归档|history/i.test(s.desc));
}
/**
* ⭐⭐⭐ **把一份模板渲染成 markdown 文档**（决策 208，2026-10-12）。
*
* ── 形态（人可读写，机器也能解析）────────────────────────────────────────
* ```
* ---
* version: 1
* id: company-deep-research
* title: 公司深度研究交接文档
* ---
*
* # <文件位置说明>
*
* ## 研究目标
*
* 本次要研究这家公司是为了回答哪些问题……（= 这一节要干嘛）
*
* ## 公司画像
*
* ……
* ```
*
* 🔴 **每节 = 一个 `## ` 标题 + 一段"这一节要干嘛"**：
*   · `## ` 标题就是**节名** → 它同时是 `renderSpecSection()` 里那条 `- \`## X\` —— desc`；
*   · 标题下的正文就是 **`desc`**（决策 204 的"这一节要干嘛"）。
*   ⭐ 于是**同一份文件**既是"模板"、又是人能直接读懂的结构说明 ——
*     这正是用户要的"把初始模板作为一个文档模板存 md"。
*
* 🔴 **"可截断"已不再是一个标记**（决策 223）：归档规则**直接写进那一节的 `desc`**
*   —— 也就是它必须写成**自然语言**（如"本节超过 20000 字符时……"）。
*   ⚠️ 所以模板里**没有** `<!-- truncate -->` 这类机器标记了；解析侧对存量**仍宽容**。
* @param t - 模板。
* @returns markdown 全文（末尾带换行）。
*/
function renderTemplateDoc(t) {
	const parts = [
		renderFrontmatter([
			["version", String(1)],
			["id", yamlScalar(t.id)],
			["title", yamlScalar(t.title)]
		]),
		`# 交接文档模板 — ${t.title || t.id}`,
		"",
		`<!-- 这是模板 \`${t.id}\`：\`## \` 标题 = 节名；标题下的 ${FENCE}${SPEC_BLOCK_FENCE} 围栏里写"这一节要干嘛"。`,
		"     ⭐ 建项目时工具会把**整份结构（含规范块）**复制成那份项目文档，此后两者解耦（改这里不影响已有文档）。",
		"     ⭐ **归档规则也写在这里**（自然语言）：想让某一节自动瘦身，就把\"超过多少字符、",
		"        把什么归档成什么类型、原处留什么\"写进那一节的围栏里 —— 由模型照它执行。 -->",
		""
	];
	for (const s of t.sections) {
		parts.push(`## ${s.name}`, "");
		parts.push(`${FENCE}${SPEC_BLOCK_FENCE}`, s.desc.trim(), FENCE, "");
	}
	return `${parts.join("\n").trimEnd()}\n`;
}
/**
* ⭐⭐ **解析 markdown 模板**（`renderTemplateDoc()` 的逆；决策 208）。
*
* 🔴 **必须能容忍人手改**（这是选 md 的理由之一）：
*   · 标题级别只用 `## `；`# ` 那行是文件标题、**不是节**；
*   · 行末的 `<!-- truncate -->` 决定该节是否可截断（⚠️ 用 `includes` 而非严格相等：
*     人手改时很容易多打个空格）；
*   · `id`/`title` 优先取 frontmatter；**缺 frontmatter 时从文件名兜底**
*     （`fallbackId`）⇒ 用户新建一个裸 md 也能用。
* @param text - markdown 全文。
* @param fallbackId - 文件名推出的 id（frontmatter 没有时用）。
* @returns 模板；**一个 `## ` 节都没有 ⇒ `undefined`**（不猜）。
*/
function parseTemplateDoc(text, fallbackId) {
	const { data, body } = splitFrontmatter(text);
	const id = typeof data?.["id"] === "string" && data["id"].trim() !== "" ? data["id"].trim() : fallbackId.trim();
	if (id === "") return void 0;
	const fmTitle = typeof data?.["title"] === "string" ? data["title"] : "";
	const sections = [];
	/** 当前节在**全文行数组**里的起始下标（攒行用；`undefined` = 还没有节）。 */
	let curFrom = -1;
	let inFence = false;
	const all = body.split(/\r?\n/);
	/** 收尾：把 `all[curFrom, to)` 这一节解析出来（⭐ 规范块由 `specBlockRange` 单独取）。 */
	const flush = (to) => {
		if (curFrom < 0) return;
		const seg = all.slice(curFrom, to);
		const head = /^##\s+(.+?)\s*$/.exec(seg[0] ?? "");
		if (head === null) {
			curFrom = -1;
			return;
		}
		let name = (head[1] ?? "").trim();
		name = name.replace(/<!--\s*truncate\s*-->/i, "").trim();
		if (name === "") {
			curFrom = -1;
			return;
		}
		const r = specBlockRange(seg);
		const desc = r === void 0 ? seg.slice(1).join("\n").trim() : seg.slice(r.bodyStart, r.bodyEnd).join("\n").trim();
		sections.push({
			name,
			desc
		});
		curFrom = -1;
	};
	for (let i = 0; i < all.length; i += 1) {
		const line = all[i] ?? "";
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		if (/^##\s+(.+?)\s*$/.exec(line) !== null) {
			flush(i);
			curFrom = i;
			continue;
		}
		if (/^#\s+/.test(line)) {
			flush(i);
			continue;
		}
	}
	flush(all.length);
	if (sections.length === 0) return void 0;
	return {
		version: 1,
		id,
		title: fmTitle.trim() !== "" ? fmTitle.trim() : id,
		sections
	};
}
/**
* ⭐ 读一份模板 —— **`.md` 优先，回落旧的 `.json`**（决策 208 + 兼容读）。
*
* 🔴 **两种格式都必须接住**：决策 204 的存量是 `.json`（生产库当时有一份
*   `company-deep-research.json`）⇒ 只顾新格式会让它**静默消失**。
* @param id - 模板 id。
* @returns 模板；两种都不存在或都不可解析 ⇒ `undefined`（**不猜**）。
*/
async function loadTemplate(id) {
	let text;
	try {
		text = await readFile(templatePath(id), "utf8");
	} catch {
		text = void 0;
	}
	if (text !== void 0) {
		const t = parseTemplateDoc(text, id);
		if (t !== void 0) return t;
	}
	try {
		const json = await readFile(legacyTemplatePath(id), "utf8");
		return normalizeTemplate(JSON.parse(json));
	} catch {
		return;
	}
}
/**
* 宽松地把任意 JSON 规整成 `Template`（字段缺失用默认值兜）。
* ⚠️ **不在这里做语义校验**（那是 `validateTemplate` 的事）——本函数只保证"形状可用"。
*/
function normalizeTemplate(raw) {
	if (raw === null || typeof raw !== "object") return void 0;
	const o = raw;
	const id = typeof o["id"] === "string" ? o["id"] : "";
	if (id === "") return void 0;
	const title = typeof o["title"] === "string" ? o["title"] : id;
	const secsRaw = Array.isArray(o["sections"]) ? o["sections"] : [];
	const sections = [];
	for (const s of secsRaw) {
		if (s === null || typeof s !== "object") continue;
		const so = s;
		const name = typeof so["name"] === "string" ? so["name"] : "";
		if (name === "") continue;
		sections.push({
			name,
			desc: typeof so["desc"] === "string" ? so["desc"] : ""
		});
	}
	return {
		version: 1,
		id,
		title,
		sections
	};
}
/**
* 列出库里全部模板（含默认，它**总是可用**且不可删）。
*
* ⭐⭐ **2026-10-12（决策 208）**：`default` 现在**也在磁盘上**
*   （`ensureDefaultTemplateFile()` 首次落盘）⇒ 列表里那份**以磁盘为准**
*   （用户可能改过它）；磁盘上没有才回落内置值。
* ⚠️ 兼容读旧的 `.json`（存量模板不会因为改格式而消失）。
*/
async function listTemplates() {
	const out = [await loadDefaultTemplate()];
	let files = [];
	try {
		files = await readdir(templatesDir());
	} catch {
		return out;
	}
	const seen = /* @__PURE__ */ new Set(["default"]);
	for (const ext of [".md", ".json"]) for (const f of files) {
		if (!f.endsWith(ext)) continue;
		const id = f.slice(0, -ext.length);
		if (seen.has(id)) continue;
		const t = await loadTemplate(id);
		if (t === void 0) continue;
		seen.add(id);
		out.push(t);
	}
	return out;
}
/**
* 保存一份模板（**先校验、不合法不写盘**）。
*
* ⭐ **决策 208**：写 `.md`（`renderTemplateDoc`）。
* ⭐ **`default` 现在可以保存**（用户可编辑它）—— 落盘后 `loadDefaultTemplate()` 会读到它。
* @param t - 模板。
* @returns 问题清单（空 = 已写入）。
*/
async function saveTemplate(t) {
	const errs = validateTemplate(t);
	if (errs.length > 0) return errs;
	await mkdir(templatesDir(), { recursive: true });
	await writeTextAtomic(templatePath(t.id), renderTemplateDoc(t));
	return [];
}
/**
* 删除一份模板。
* 🔴 **`default` 不可删**（它是回落目标）。
* @param id - 模板 id。
* @returns 是否真的删了。
*/
async function deleteTemplate(id) {
	if (id === "default") return false;
	let deleted = false;
	for (const p of [templatePath(id), legacyTemplatePath(id)]) try {
		await rm(p, { force: true });
		deleted = true;
	} catch {}
	return deleted;
}
/**
* 🔴🔴 **`renderTemplateGuidance()` 已删除**（2026-10-12，决策 207）。
*
* 它的职责是"按模板拼一段写作指导、由 `memj_read` **按需附在返回值末尾**"。
* 那条通路**已退役**：规范现在**就写在文档正文里**（`## 本档写作规范` 一节，
* 由 `renderSpecSection()` 渲染、建项目时从模板复制）
* ⇒ `memj_read` 返回的 `content` **本来就带着它**。
*
* ⚠️ 留着它等于**同一事实两份实现**：本项目的判据是
*   "一段代码里已经有了一种实现，就问其他几条路径为什么还需要"，
*   而两条路都会输出去给模型看 ⇒ **迟早漂开、且两个副本会同时出现**。
* @see renderSpecSection 它的替代者（落点是**文档正文**，不是工具返回值）。
*/
/** 供内部使用：默认六节的节名（= 无模板时的回落）。 */
const DEFAULT_SECTION_NAMES = NARRATIVE_TITLES;
/**
/**
* ⭐⭐⭐ **渲染"建项目用的骨架"——每节连它的规范块一起生成**（决策 209）。
*
* ── 它取代了什么 ──────────────────────────────────────────────────────────
* 取代 `renderSpecSection()`（决策 207 的"文档末尾单列一节"）。
* 现在规范**长在它讲的那一节自己身上**（用户最初的形态）：
*
*   ## 目标
*
*   ```${SPEC_BLOCK_FENCE}
*   这个项目要做什么
*   ```
*
*   （空行留给模型写正文）
*
* ── 🔴 三条纪律 ───────────────────────────────────────────────────────────
*   1. **纯函数 + 幂等**：建项目路径上每次都会调它（同一输入永远同一输出）；
*   2. **围栏语言标记走 `SPEC_BLOCK_FENCE` 常量**（与解析侧同源，改一处即两侧同步）；
*   3. **只产出"标题 + 规范块 + 空行"**，不动正文（正文由 `mergeNarrative` 负责）。
*
* ⚠️ **desc 为空也照样写围栏** —— 否则解析回来分不清"这一节没有规范"与
*   "规范是空的"，而后者正是 `validateTemplate` 要报的错。
* @param t - 模板。
* @returns 骨架全文（末尾一个换行）。
*/
function renderSpecBlocksSkeleton(t) {
	const out = [];
	for (const s of t.sections) {
		out.push(`## ${s.name}`, "", `${FENCE}${SPEC_BLOCK_FENCE}`);
		if (s.desc.trim() !== "") out.push(s.desc.trim());
		out.push(FENCE, "");
	}
	return `${out.join("\n").trimEnd()}\n`;
}
/**
* 🔴🔴 **`truncateTitlesFromSpec()` 已于 2026-10-12（决策 223）删除。**
*
* ── 它原来做什么 ────────────────────────────────────────────────────────────
* 兼容读**决策 207 的旧形态**：从文档末尾那节「本档写作规范」里反解"哪几节能自动截断"。
*
* ── 为什么现在能删 ──────────────────────────────────────────────────────────
* 它服务的是"**工具自动截断**"这条机制 —— 而该机制已整个废除
* （归档交给模型、规则写成自然语言）⇒ 没有消费者了。
* ⚠️ **代价（已接受）**：存量老文档里那句"本节的较早内容会被自动截断归档"
*    **不再有任何效果** —— 它现在只是一句**给人看的陈述**。
*    用户若要让那些文档继续瘦身，得按新规范**把归档规则写进各节的规范块**。
* ⭐ 这不影响文档可读性（那行本来就只是说明），也不会让页面报错。
*/
//#endregion
//#region src/kinds.ts
/**
* dsh-memj —— **知识类型（`kind`）的可配置词表**（决策 215，2026-10-05）
*
* ── 它解决什么 ──────────────────────────────────────────────────────────────
* 用户要求：*"用户可以在 memj 的设置页去配置知识类型，**已有的知识类型不可删除**。
* 但用户可以自己**增删改**新的类型，并且配置**什么时候用**和**书写规范**。"*
*
* 决策 214 已经把词表**收敛到唯一来源**（`schema.ts` 的 `ENTRY_KIND_DEFS`）；
* 本模块把那个来源从**编译期常量**升级成**运行期可读的文件**，
* 而 `ENTRY_KIND_DEFS` **降级为"内置默认值"**（仍不可删改）。
*
* ── 🔴🔴 三条硬边界（用户裁定 + 安全性论证）────────────────────────────────
* 1. **内置的不可删、不可改名** —— 存量 569 条全在用它们（实测分布：
*    `trap` 319 / `howto` 96 / `fact` 65 / `decision` 53 / `history` 36）。
*    改掉一个内置 id ⇒ 那几百条封面**当场变成非法值**。
* 2. **保留项不进"模型的可选项"** —— ⚠️ **决策 223（2026-10-12）起内置类型里没有保留项**
*    （`history` 已开放给模型：归档改成由模型按各节规范做）。
*    ⭐ 机制仍在（`reserved` 字段 + 下面那条校验），只是当前**没有作用对象**。
*    🔴 历史理由（留着防复发）：保留项是**工具生成**的那种（截断归档的原文），
*    让人手工把一条知识改成它 ⇒ **那条会从检索里消失**（`scanLibrary` 默认排除）。
*    ⭐ 现在这条防线**换了承载方式**：从结构性禁止（`reserved`）
*    换成**语义上讲清**（`history` 的 `when`/`guide` 明写"不参与检索"）。
* 3. **有引用的类型不许删**（拒绝删，不级联清空）——
*    与 `memj_promote` 的「只允许删空容器」同一纪律。
*    ⚠️ 另一条路是"删并把引用清成未分类"，但那要**扫全库改 569 个文件**且**不可逆**。
*
* ── ⭐ 安全论证：为什么"用户定义词表"不违反"必须是受控词表"（决策 81）──────
* 决策 81 的原话是：*"若允许自由取值，LLM 会自行发明命名，分类就失去聚合能力"*
* （ETH Zurich 实测的失效模式）。⭐ 而本设计**仍然是受控的**，只是**词表由用户维护**：
* 模型**不能自由填**，只能从这份表里选（工具 schema 的 `enum` 由它生成）。
* ⇒ ⭐ 判据：**"受控"的敌人是"自由填"，不是"用户可维护"。**
*
* ── 数据形状（`<库根>/kinds.md`）───────────────────────────────────────────
* ```
* ---
* version: 1
* ---
*
* # 知识类型
*
* ## fact
* 显示名：fact（事实 / 接口）
* 什么时候用：是什么 + 出处/依据
* 书写规范：
* （多行，缩进或直奔到下一个 ## 之前）
* ```
* ⚠️ **内置项也写进文件**（而不是"只存自定义的增量"）——
*    否则"文件里没有"就有两种含义（内置 / 被删），而**人读这份文件时看不全**。
*    内置项靠行末 `<!-- 内置 -->` 标记，**读回来时据此判不可删**。
*
* @module dsh-memj/kinds
*/
/**
* ⭐ **kind id 的语法**：小写英文开头，2–32 位，只允许小写字母/数字/连字符。
*
* 🔴 **为什么必须校验**：`kind` 是**要写进封面 YAML 的值**，
*   还会被拼进工具 schema 的 `enum` 与提示词 ⇒ 放行任意串会让"词表里有个怪东西"
*   扩散到所有下游，而**那时已经很难回溯是谁写进去的**。
* ⚠️ 刻意**比模板 id 更严**（模板允许 2–48 位）：kind 要**频繁出现在文档里**，
*   短一点、纯小写更好认。
*/
const KIND_ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
ENTRY_KIND_DEFS.map((d) => d.id);
/**
* ⭐ **内置默认表**（文件不存在 / 读不出来时用它）。
*
* ⚠️ 它与 `schema.ts` 的 `ENTRY_KIND_DEFS` **是同一份数据**，但**用途不同**：
*   · `ENTRY_KIND_DEFS` = **编译期内置值**（决策 214 的唯一来源，现在降级为默认值）；
*   · 本函数 = **把它补全成 `KindDef`**（加上 `builtin` / `reserved` / `guide` 三个字段）。
* 🔴 **不在这里抄第二份 id 列表** —— 一律从 `ENTRY_KIND_DEFS` 派生。
* @returns 内置表的完整定义。
*/
function builtinKindDefs() {
	return ENTRY_KIND_DEFS.map((d) => ({
		id: d.id,
		label: d.label,
		when: d.when,
		/**
		* ⭐⭐ **内置项现在自带书写规范**（决策 217）。
		* 🔴 以前这里写死 `''`，而"骨架"其实装在 `when` 里（**字段名在撒谎**）——
		*    ✅ 本次把骨架搬进 `guide`、`when` 换成真判据。
		* ⚠️ 所以这两处**必须一起改**：只改 `when` 而这里仍给 `''`
		*    ⇒ 骨架会**凭空消失**（模型再也看不到"怎么写"）。
		*/
		guide: d.guide,
		builtin: true,
		reserved: d.reserved === true
	}));
}
/** 内置标记（行尾 HTML 注释，渲染页里不显示）。 */
const BUILTIN_MARK = "<!-- 内置 -->";
/** 保留标记。 */
const RESERVED_MARK = "<!-- 保留 -->";
/**
* ⭐ **把一张类型表渲染成 markdown**（`<库根>/kinds.md`）。
*
* ⚠️ **必须与 `parseKindsDoc()` 往返幂等** —— 手工改过也要能读回来
*   （与模板 md 同一套纪律，本项目为此踩过"改完读不回"的账）。
* @param defs - 类型表（顺序即渲染顺序，也即 UI 下拉顺序）。
* @returns 文件全文。
*/
function renderKindsDoc(defs) {
	/**
	* 🔴 **`renderFrontmatter()` 自己就以 `\n` 结尾**（它的最后一行是 `'---', ''`）
	*    ⇒ 这里**不能再补一个空元素**，否则 frontmatter 与标题之间会多出一个空行，
	*      而**解析不回去**（`splitFrontmatter` 只吃一份）⇒ **往返不幂等**（实测抓到）。
	*    ⭐ 判据：**拼接自带换行的片段时，先看清它到底带没带** —— 多补一个就多一行。
	*/
	const parts = [
		renderFrontmatter([["version", "1"]]),
		"# 知识类型",
		"",
		"<!-- ⭐ 这张表就是\"知识有哪几类\"。",
		"     · 每条一个 `## <id>` 节；id 必须是小写英文/数字/连字符（2–32 位）。",
		"     · `什么时候用` 会进提示词，告诉模型**该选哪一种**。",
		"     · `书写规范` 可多行，也会进提示词，告诉它**这种知识该怎么写**。",
		"     · 带 `<!-- 内置 -->` 的**不可删、不可改名**（存量知识都在用它们）。",
		"     · 带 `<!-- 保留 -->` 的**不给模型选**（工具生成的，手工填会让那条搜不到）。",
		"     ⚠️ 改这份文件后，重启实例或等热重载即生效。 -->",
		""
	];
	for (const d of defs) {
		parts.push(`## ${d.id}`);
		parts.push("");
		parts.push(`显示名：${d.label}${d.builtin ? ` ${BUILTIN_MARK}` : ""}${d.reserved ? ` ${RESERVED_MARK}` : ""}`);
		parts.push(`什么时候用：${d.when}`);
		const guideLines = d.guide.trim() === "" ? [] : d.guide.trimEnd().split("\n");
		parts.push(guideLines.length > 0 ? `书写规范：${guideLines[0]}` : "书写规范：");
		for (const g of guideLines.slice(1)) parts.push(g);
		parts.push("");
	}
	return parts.join("\n").replace(/\n{2,}/g, "\n\n").replace(/\n+$/, "\n");
}
/**
* ⭐ **从 markdown 解析出类型表**。
*
* 🔴 **宽容读**（与模板同一纪律）：只认 `## <id>` 的标题行 + 紧跟着的
*   `显示名：` / `什么时候用：` / `书写规范：` 三行；其余内容**当作书写规范的续行**。
*   ⇒ 用户手写歪一点（多空行、少一个键）也能读出来。
* @param text - 文件全文。
* @returns 类型表；**一条都解析不出来**时返回 `undefined`（调用方回落内置）。
*/
function parseKindsDoc(text) {
	const { body } = splitFrontmatter(text);
	const lines = (body ?? "").split(/\r?\n/);
	const out = [];
	let cur;
	const flush = () => {
		if (cur === void 0) return;
		out.push({
			id: cur.id,
			label: cur.label.trim() === "" ? cur.id : cur.label.trim(),
			when: cur.when.trim(),
			/**
			* ⚠️⚠️ **两端都要削**（实测踩到，往返不幂等）：
			*    渲染时 `书写规范：` 后面跟一个**空行**再是内容，而解析会把那个空行收进 `guide`
			*    ⇒ **开头多一个 `\n`**。只削末尾 ⇒ 第二次渲染又多一行 ⇒ **越读越长**。
			*    ⭐ 判据：**往返幂等要靠"两端都规整"，只削一边等于没削。**
			*/
			guide: cur.guide.join("\n").replace(/^\s+|\s+$/g, ""),
			builtin: cur.builtin,
			reserved: cur.reserved
		});
		cur = void 0;
	};
	for (const line of lines) {
		const h = /^##\s+(\S+)\s*$/.exec(line);
		if (h !== null) {
			flush();
			cur = {
				id: (h[1] ?? "").trim(),
				label: "",
				when: "",
				guide: [],
				builtin: line.includes(BUILTIN_MARK),
				reserved: line.includes(RESERVED_MARK)
			};
			continue;
		}
		if (cur === void 0) continue;
		const mLabel = /^显示名：(.*)$/.exec(line);
		if (mLabel !== null) {
			const v = mLabel[1] ?? "";
			cur.builtin = cur.builtin || v.includes(BUILTIN_MARK);
			cur.reserved = cur.reserved || v.includes(RESERVED_MARK);
			cur.label = v.replace(BUILTIN_MARK, "").replace(RESERVED_MARK, "").trim();
			continue;
		}
		const mWhen = /^什么时候用：(.*)$/.exec(line);
		if (mWhen !== null) {
			cur.when = mWhen[1] ?? "";
			continue;
		}
		const mGuide = /^书写规范：(.*)$/.exec(line);
		if (mGuide !== null) {
			const inline = (mGuide[1] ?? "").trim();
			if (inline !== "") cur.guide.push(inline);
			continue;
		}
		cur.guide.push(line);
	}
	flush();
	return out.length > 0 ? out : void 0;
}
/**
* ⭐⭐⭐ **读取当前生效的类型表** —— 这是**唯一入口**，所有消费方都走它。
*
* 优先级（与 `loadDefaultTemplate()` 同一套纪律）：
*   ① `<库根>/kinds.md` 存在且能解析 ⇒ 用它；
*   ② 否则 ⇒ **内置默认表**。
*
* 🔴 **内置项即使文件里没写也要补回来**（"merge 而不是 replace"）——
*   否则用户手删掉文件里某一行内置项 ⇒ 存量那些知识**当场变非法值**。
*   ⭐ 判据：**文件是"用户可编辑的一份"，不是"唯一真相"** ——
*     内置项的存在性由代码保证，不由文件保证。
*
* ── 🔴🔴 2026-10-09（修 C）：内置项的【身份字段】再也不能被文件压住 ──────────
* **症状**：决策 223（`893f936`）改了 `history` 的 `label`，但**库里的 `kinds.md`
*   还是旧的**（它写在这次提交**之前**）。而本函数当时只补"**id 缺失**"的内置项、
*   **不更新已存在项的字段** ⇒ 文件那份一直生效。
* **为什么它会"卡死"**（比不生效更糟）：
*   `validateKinds()` 要求"**库里的 label 必须等于源码内置的 label**"（内置项不可改名）
*   ⇒ 源码改了 label 之后，**库那张表再也存不回去**（`saveKinds` 必被拒），
*     而"改源码"又会被本函数的磁盘优先盖住 ⇒ ⭐ **两条路互相堵死**。
* **为什么只在重启后暴露**：旧进程那次读盘若失败（`.catch` 吞掉）会回落源码值，
*   看着一切正常 ⇒ 这是"**对的结果、错的原因**"，重启才把不一致揭穿。
*
* ── ✅ 修法：按「身份 vs 内容」分流（本项目的既有判据）──────────────────────
* | 字段 | 性质 | 谁说了算 |
* |---|---|---|
* | `id` / `builtin` / `label` / `reserved` | **身份**（用户改不了，校验也锁着） | ⭐ **源码** |
* | `when` / `guide` | **内容**（决策 217 用户裁定"可编辑但不可删除"） | ⭐ **文件**（保住用户的编辑） |
* ⇒ 内置项的**身份随代码前进**、**内容随用户**，两边各管各的。
* ⚠️ **不能把 `when`/`guide` 也同步成源码** —— 那会**静默抹掉用户对内置项的编辑**
*   （决策 217 明确允许改它们；`validateKinds` 也刻意不校验这两项）。
* @returns 生效的类型表（**保证含全部内置项**，且至少 1 条）。
*/
async function loadKinds() {
	let fromFile;
	try {
		const text = await readTextIfExists(kindsFilePath());
		if (text !== void 0) fromFile = parseKindsDoc(text);
	} catch {
		fromFile = void 0;
	}
	if (fromFile === void 0) return builtinKindDefs();
	const byId = new Map(builtinKindDefs().map((d) => [d.id, d]));
	const base = fromFile.map((d) => {
		const b = byId.get(d.id);
		if (b === void 0) return d;
		return {
			...d,
			label: b.label,
			builtin: b.builtin,
			reserved: b.reserved
		};
	});
	const have = new Set(base.map((d) => d.id));
	const missing = builtinKindDefs().filter((d) => !have.has(d.id));
	return missing.length === 0 ? base : [...missing, ...base];
}
/**
* ⭐ **写入类型表**（校验在前，不过不写盘）。
*
* @param defs - 要写入的完整表。
* @returns 错误清单（空 = 写成功）。
*/
async function saveKinds(defs) {
	const errs = validateKinds(defs);
	if (errs.length > 0) return errs;
	await writeTextAtomic(kindsFilePath(), renderKindsDoc(defs));
	return [];
}
/**
* ⭐⭐ **校验一张类型表**（保存前的**硬闸门**）。
*
* 除了形状，还管三条**业务规则**（用户裁定的那些）：
*   · 内置项的 **id 与 label 都不能改**（改 id ⇒ 存量知识当场非法）；
*   · 内置项**不能少**（少一条 ⇒ 原来用它那些知识变非法值）；
*   · 保留项的 `reserved` **不能被摘掉**（摘了模型就能手工造 `history`）。
*
* ⭐⭐ **2026-10-05 用户裁定（决策 217）：内置项的 `when` / `guide` 【可以编辑】**
*   —— *"可编辑但不可删除"*。
*   ⇒ 本函数**刻意不校验这两项**：它们是**内容**（描述性文字），
*     而"内置"锁的是**身份**（`id` / `label` / 存在性）。
*   ⭐ 判据：**"这是身份还是内容"决定它锁不锁** ——
*     改身份会让存量数据非法（不可逆），改内容只影响措辞（随时可改回）。
* @param defs - 待校验的表。
* @returns 问题清单（空 = 合法）。
*/
function validateKinds(defs) {
	const errs = [];
	if (defs.length === 0) errs.push("至少要有 1 个知识类型。");
	const seen = /* @__PURE__ */ new Set();
	for (const [i, d] of defs.entries()) {
		const at = `第 ${i + 1} 项`;
		if (!KIND_ID_RE.test(d.id)) errs.push(`${at}：id \`${d.id}\` 不合法 —— 必须是**小写英文开头**、2–32 位、只含小写字母/数字/连字符。`);
		if (d.label.trim() === "") errs.push(`${at}（${d.id}）：显示名不能为空。`);
		if (d.when.trim() === "") errs.push(`${at}（${d.id}）：\`什么时候用\` 不能为空 —— 它是告诉模型"该选哪一种"的唯一依据。`);
		if (seen.has(d.id)) errs.push(`${at}：id \`${d.id}\` 重复。`);
		seen.add(d.id);
	}
	const builtinDefaults = builtinKindDefs();
	for (const b of builtinDefaults) {
		const mine = defs.find((d) => d.id === b.id);
		if (mine === void 0) {
			errs.push(`内置类型 \`${b.id}\` **不能删除**（存量知识都在用它）。`);
			continue;
		}
		if (mine.label !== b.label) errs.push(`内置类型 \`${b.id}\` 的显示名**不能改**（当前是「${b.label}」）。`);
		if (b.reserved && !mine.reserved) errs.push(`类型 \`${b.id}\` 是**保留项**，不能把它的"保留"标记去掉 —— 那会让模型手工造出检索不到的知识。`);
	}
	return errs;
}
/**
* ⭐⭐⭐ **删除一条类型前的前置检查**（用户裁定的"引用保护"）。
*
* 🔴 **为什么拒绝删而不是"删了顺带清引用"**：
*   清引用要**扫全库、改 569 个封面文件**，而且**不可逆**（原 kind 再也找不回）。
*   ⇒ 与 `memj_promote` 的「只允许删空容器」**同一纪律**：
*     **容器不空就不删，让用户先自己决定那些条目该归到哪**。
* @param id - 想删的类型 id。
* @param defs - 当前表。
* @param usedCount - 该 id 当前被多少条封面引用（调用方扫库传入）。
* @returns 拒绝理由；空串 = 可以删。
*/
function deleteKindBlockReason(id, defs, usedCount) {
	const d = defs.find((x) => x.id === id);
	if (d === void 0) return `类型 \`${id}\` 不在表里。`;
	if (d.builtin) return `\`${id}\` 是**内置类型**，不能删除（存量知识都在用它）。`;
	if (usedCount > 0) return `\`${id}\` 还有 **${usedCount}** 条知识在用 —— 请先把它们改成别的类型（或留空），再删。`;
	return "";
}
//#endregion
//#region src/protocol.ts
/**
* §6 协议全文——`systemPrompt.section()` 注入的**实际文本**。
*
* 🔴🔴 **本文件的文本必须逐字节恒定。**
*
* 已核实（`dsh-plugin-knowledge.md` §3.1）：
*  - `section()` 的 provider **每次 assembly 都会被调用**，但下游**按内容字符串比较**收口
*    （`dsh-agent-loop/lib/index.js:276,279`）⇒ 返回相同字符串 = 空提交 = 无事件；
*  - 但本机路由（`dsh-llm-pi-ai`）**未声明 `systemPromptUpdate`**
*    ⇒ 走**头部重写模式**：文本一变 ⇒ 重写 node 0 ⇒ **从第一个 token 起全前缀缓存失效**。
*
* ⇒ **绝不把"库里已有 N 条""本次依据 M 条快照"这类运行时数字写进本文本。**
*   需要动态数字时走工具返回值。
*
* 🔴🔴 **本文件是【源头】——直接改它，不需要动任何设计文档。**
*   ⚠️ 它以前由 `scripts/gen-protocol.mjs` 从 `memj-design.md` §6 生成，
*     **现已解耦**（2026-10-12，用户裁定）：那条生成链**不在 `run-all-tests` 回路里**，
*     也不会再重写本文件。生成器降级为**一次性迁移工具**。
*   ⭐ **为什么解耦**：「提示词」设置页要有「把页面的修改**写回源码**」这个能力，
*     而只要生成链还在回路里，写回的代码就会被生成器**静默覆盖**。
*   ⚠️ **代价（已知并接受）**：设计文档 §6 会**逐渐过时**，不再有逐字节校验；
*     已在该节顶部加了「本节已不再与代码同步」的提示。
*
* @module dsh-memj/protocol
*/
/**
* 协议正文（恒定）。
*
* 内容结构：**何时查**（检索三步 + 两处必查）→ **何时写**（项目判据 + 归属两块）
* → **推进归属**（累加不是搬家）→ **边界**。
*/
const PROTOCOL_TEXT = `## memj 记忆协议

memj 库里的可复用知识以**「封面 + 正文」两段**组织，三层结构：项目 → 主题 → 全局。
**封面只写在项目级 handoff 文档里**（唯一源头）；主题与全局是工具从封面聚合出的派生索引。
**文档与知识都集中在 memj 库里，不在工作区**，取用按逻辑地址（项目 id / 主题 / 全局），不以物理路径区分。

### 何时查

任何需要信息的时候都根据需求必须优先使用memj工具，除非确认该信息无法在知识库获得——插件不会自动推送任何记忆。**工具分三层用，别混**：
- \`memj_info\` —— **只报语境**（有哪些项目/主题及 id）；**不返回知识条目**。
- \`memj_search\` —— **只找**：按 project / theme / query 筛，**只回封面**，不回正文。
- \`memj_read\` —— **只读**：按 id 取正文；长文档给**节名清单**，用 \`section\` 取具体节。
- \`memj_snapshots\` —— 只读**本会话的读快照清单**（跨项目证据的来源）。

**典型三步**：\`memj_info\` 拿语境 id ⇒ \`memj_search\` 筛封面 ⇒ \`memj_read\` 取正文。

**两处必须查**：
1. 新会话中，回应第一条用户消息之前；
2. 会话中途用户意图明显转向时（话题对象变了、任务性质变了、显式开新话题）。
   ⚠️ 同一条需求内的追问、补充细节、纠正措辞**不算转向**，不要重复检索。

### 何时写

⭐ **写库规范的唯一出处是 \`memj_handoff\` 工具的 description**——
「写什么、怎么判项目、怎么归属、正文怎么写」全在那里，**协议不再重复**。

🔴 **写之前先调 \`memj_search\`（或 \`memj_info\`）看已有内容，不要写出重复的知识。**

⭐ **新建主题有两种校验模式**（本实例是哪一种，\`memj_snapshots\` 的返回值会明说）：
- **严格**：必须有**别项目的知识**（快照）被本项目采用作证据；没有 ⇒ 工具会拒收；
- **宽松**：不做这项校验，你判断该建就建。

### 推进归属（**累加，不是搬家**）

> 术语：**添加主题**＝往 \`theme\` 数组追加｜**移除主题**＝从数组移除；
> **加入全局**＝登记待批提名（封面 \`global\` **暂不置位**，批准才置 \`true\`）。
> ⭐ **可在写交接文档的 \`memj_handoff\` 调用里一并完成，也可随时用 \`memj_promote\` 单独改。**

- 🔴 **推进不改动原有归属**：加过主题的知识**仍是项目知识**，
  加入全局的**仍命中原来的主题**。**不要用新值覆盖旧值。**
- 🔴 **加入全局只能提名**：**封面 \`global\` 保持 \`false\`**，批准那一刻才置 \`true\`。
  **你不能自己批准**，也别自行置 \`true\`。
- 推进**只改元数据**，不改知识文档的位置与内容。

### 边界

- 知识归属**由你判断**，工具只做解析与校验，不替你分类；
- 经 \`/memj-*\` 命令取到的内容即为权威，不要重复检索同一范围。`;
/**
* 协议在系统提示里的 order。
*
* 取 `3000`：排在全部工具指引（官方最大 `TOOL_REPORT = 2900`）之后、
* `TOOLS_SDK = 5000` 之前——即在"工具怎么用"之后给出"记忆怎么写"。
* 与旧 `dsh-memory` 保持同一位置，便于对照。
*/
const PROTOCOL_SECTION_ORDER = 3e3;
/**
* 取当前协议文本。
* @returns 恒定不变的协议字符串。
*/
function protocolText() {
	return PROTOCOL_TEXT;
}
//#endregion
//#region src/context.ts
/**
* ⭐ **本文件是「默认值 / 回落值」**——运行期真正的生效文本看两处：
*   ① **设置页【提示词】子页**（写 `<库根>/prompts/overrides.json`，
*      **改完即生效、不破前缀缓存**）⇒ ⭐ **它才是运行期唯一源头**；
*   ② 本文件（**没被覆盖过**时用它；改它要**重启**才生效）。
*
* ⚠️ 历史：本文件曾由 `scripts/gen-context.mjs` 从设计文档 §5.2 生成，
*    但**那条生成链已不在 `run-all-tests` 的回路里**（对比 `gen-descriptions.mjs`
*    仍在套件里每次重跑）⇒ **可以直接改本文件**，不需要动设计文档。
*    （本头部模板随之失去了"提醒改源头"的作用，保留只为记录这段历史。）
*
* 这些文本走 `ctx.systemPrompt.context()`（**user 角色、尾部 append**）——
* ⭐ 与协议（`section()`，node 0）不同：**改它不破前缀缓存**。
*
* 用途：承载"会经常改"的指导文本（触发条件 / 判断准则 / 写作要求 / 行为纪律）。
* 契约（硬边界、"会被拒"的情形）**不在这里**——它们在工具 description 与协议里。
*
* ⚠️ `context()` 的成本（知识 940f3bfe 实测）：**同值不发**；
* 但改了文本 ⇒ **append 一条新消息、旧的留在历史**直到 compaction
* ⇒ **不要频繁改**。
*/
/** 注册用的稳定名（同一 scope 内重名会 throw）。 */
const CONTEXT_NAME = "memj:usage-guidance";
/**
* 运行时上下文全文。
*
* 🔴 **本文件是源头——直接改它。**
*   ⭐ **运行期唯一源头是设置页【提示词】子页**（那里改完写 `overrides.json`、即刻生效）；
*     本文件是它**没被覆盖时的默认值 / 回落值**。
*   ⚠️ **生成链已解耦**（`gen-context.mjs` 不在 `run-all-tests` 回路里）。
*   ⭐ 2026-10-12 起 `protocol.ts` / `tool-descriptions.ts` 也按同一做法解耦了。
*/
const CONTEXT_TEXT = `### memj 触发条件（用户这么说 ⇒ 调对应工具）

| 用户说法（示例） | 该调的工具 |
|---|---|
| 「沉淀 / 记到知识库 / 存进 memj / 加入知识库 / 把这个文档入库」 | \`memj_handoff\`（只补知识用 \`step:'knowledge'\`；外部文档用 \`adopt\`） |
| 「更新那条 / 改一下某条知识的内容」 | \`memj_search\` → \`memj_read\` → \`memj_update\` |
| 「记一次交接 / 做个 handoff」 | \`memj_handoff\` |
| 「库里有哪些项目 / 主题」 | \`memj_info\` |
| 「某个主题下有什么知识」 | \`memj_search\`（按 theme 筛） |
| 「查一下 memj 库的状态 / 体检」 | \`memj_rebuild\` |

### 落到哪个项目（handoff 时）

⭐ 偏置方向：**"归错"比"多建"更糟**。

1. **先看本会话上文**——上一次 \`memj_handoff\` 的**调用参数**与**回执**
   （回执明写「已更新项目 \`X\`」/「已新建项目 \`X\`」，**项目 id 就在这句里**）。
   若两处指向同一项目、且本次工作与它确实是同一件事 ⇒ **直接沿用，跳过 \`memj_info\`**。
   只有这几种情况才调 \`memj_info\`：第一次 handoff、上文有多个项目无法确定、
   明显换了新话题、或怀疑库里已变。
2. 只有能确定"是同一个项目"时才**更新**已有项目——判据是本次工作与该项目的描述
   **有直接关系**（同一个插件 / 系统 / 未完成的事）。
   **拿不准就不要硬塞**：把不相干的工作写进别人的项目，会污染它的知识归属，
   **比多建一个项目更糟**。
3. 本次工作是一条独立工作线时**新建**（有自己的目标、预期还会持续多轮）。
4. 不该建新的：只是已有项目的子话题；也不该硬塞：与任何已有项目都没直接关系。
   ⚠️ 两头都别犯错——**判不准时宁可新建**。

### 沉淀知识时：这条要不要挂到主题上（"挂靠"）

🔴🔴 **挂靠的目的（先想清楚这个，判据才不跑偏）**：
   让别人（**该主题 desc 描述下的其他项目**）能**直接拿这条知识去用** ——
   省掉一次搜索、少造一个轮子、少踩一个坑。
   ⇒ ⭐ **判据：把这条知识给「该主题 desc 描述的那个场景下的别的项目」用，成立吗？**
      · **成立** ⇒ **可以挂**（要有具体理由，见下）；
      · **只对本项目成立**（讲的是本项目自己的某次改动/某个接口/某处缺陷/某次实测数据）
        ⇒ **不挂** —— 只留项目归属（\\\`project\\\` 有值就够了，\\\`theme\\\` 留空**是正常的**）。

🔴🔴 **挂之前必须做这一步（不许跳）**：**把这条知识与【全部主题的 desc】逐一比对**，
   然后**问自己那句话**：「它是只对我这个项目有用，还是**对该主题下的所有项目都有用**？」
   ⚠️ 判"**这个话题**通不通用"是**错的口径** —— 通不通用的**不是话题**，
     是「**这条正文里的东西，别的项目拿不拿得走**」。
     （真实事故：三条正文全是"我这次实验的具体数字/报错串/函数名"，
      却因为"话题（并发、报错）听起来很通用"就挂上了跨项目主题。）

⭐ **挂靠要给出依据**（填 \\\`entries[].themeWhy\\\`）：
   **引一句该主题 desc 里的话** + 说明这条知识**怎么服务那个 desc 描述的场景**。
   ⚠️ 工具会检查"**你引的那句话确实逐字出现在该主题 desc 里**"（≈12 字符以上连续片段）；
     引不出来 ⇒ 回执会**警告**（⚠️ 是警告不是拒收，但别当没看见）。

⚠️⚠️ **候选 ≠ 都该挂**：下面是"从哪找候选"，**不是"候选都填上"**。
⭐ **本项目 \\\`themes:\\\` 是"历史上关联过"，不是"这条属于它"**——
   照抄候选清单**等于没判断**。
⚠️ **宁可不挂**：漏挂只是"主题视图里少一条"（可事后用 \\\`memj_promote\\\` 的 \\\`addThemes\\\` 补），
   误挂会**污染所有项目看到的主题视图**。两头都别错，**拿不准就不挂**。

候选主题从**两个来源**凑，**不必再调 \\\`memj_info\\\` 翻主题清单**：
1. **本会话未消费的读快照**——⭐ 先定好项目 id（更新或新建），再带 id 调
   \\\`memj_snapshots({ project: <该 id> })\\\`；工具会把 \\\`project\\\` ≠ 该 id 的那些筛出来
   （别项目的知识），**不必你自己比对**；
2. **本项目 frontmatter 的 \\\`themes:\\\`**——本项目历史上已关联的主题。
   ⚠️ **即便你这次没读任何东西（凭记忆直接用），也要看它**，否则会漏判。

### 写交接文档时的四个决定（怎么判断）

- **① 要不要新建主题**：判据**与模式无关**——这个主题**确实能覆盖不止一个项目、
  或一类反复出现的场景**吗？**优先并入已有主题**；已有主题能容纳就不要另起近义主题；
  不确定是不是同一范畴 ⇒ **宁可晚建**。
  声明方式：\`newThemes: [{ id, desc }]\`。
- **② 每条知识挂不挂主题**：⭐ **要判断，别照抄**——判据见块 C
  （**"给别的项目用成立吗"**；只在**本项目内部**成立 ⇒ **不挂**）。
  ⚠️ 原来这里写的是"你不用单独做什么——填好 \`entries[].theme\` 就行"，
  它把"挂靠"弱化成了一个**不需要判断的动作** ⇒ 实测导致"照抄候选清单、污染主题层"。
  工具**只校验 theme id 存在**，**不校验语义匹配** ⇒ 这一步**只能靠你的判断**。
- **③ 快照里那条别项目知识要不要一并挂上**：⭐ **由你判定，且要显式列出**。
  必须先**逐条判断"它确实和本次要落盘的项目相关吗"**——读了不等于用上了；
  **不相关的不要列**（漏列只是少挂；误列会把无关知识污染进主题文档）。
  回执会**回声**"本次补挂了哪几条"，据此核对有没有漏列。
- **④ 要不要加入全局**：该知识**跨主题通用**（不只服务某一个主题）时，在该条上登记提名。

🔴 **顺序上你可以放心**：工具会**先建主题、再写封面**，所以本次新建的主题 id
可以直接填进封面的 \`theme\` 里。

### 项目文档是「活文档」

⭐ 这份文档记录的是一个项目**一路怎么走过来的**（做过什么、踩过什么坑、怎么改的），
**不是"此刻的快照"**。

- 🔴 **既有节必须写在它自己那一节里**——别为了让新内容不覆盖旧内容就另起一个平行节：
  那是把"该写没写"伪装成"结构选择"，会让按节读的人漏掉它。
  （真实事故：某轮把本次进展写成了顶层自定义节，而没写进「当前进度」。）
- **各节写叙事**（给接手的人看）；最后一节「沉淀知识」**只放封面，不放正文**。
  同一件事只在「沉淀知识」里留一张封面；其它节要引用它时写「详见该条标题」，不要重复。
- ⭐⭐⭐ **写某一节之前，先读它标题下的 \`memj:spec\` 围栏块** ——
  那里面写着**这一节要写什么、以及它的书写/压缩要求**（建项目时从模板复制过来的）。
  ⇒ ⭐ **它就是这一节的写作规范，按它写**；⚠️ **不要凭印象套固定清单**——
  每份文档的节名与要求都可能不同（自定义模板完全不同）。
  ⚠️ 少数老文档还没有这种块（建得早、又没迁过）——**那时按文末的 \`## 本档写作规范\` 一节**；
  两者都没有 ⇒ **以正文现有的 \`##\` 标题为准**（节名只认正文）。
- 🔴 **但那个围栏块本身由工具维护 ⇒ 你不要去写它**：
  **你写 \`doc\` 时不要把它抄进去**（抄了也不算数，工具会用盘上那份覆盖回来）；
  **要改它就直接改文档里那一节**（那才是权威）。

### 文档瘦身 / 归档：**由你按各节的规范执行**（工具只报数）

🔴🔴 **归档规则写在各节的书写规范里**（自然语言），**工具不会替你归档** ——
它读不懂那段自然语言。**执行者是你。**

⭐ **工具给你的是那些数字**：\`memj_handoff\` 落盘后，回执里会列出
**每个 \`##\` 节、以及每个 \`###\` 子节现在多少字符**（归档挪走的是 \`###\` 子节，所以两级都给）。
⇒ **拿它对照那一节规范里的阈值**（规范里通常写死了数字，如"超过 20000 字符时……"），超了就动手。

⭐ **归档的标准流程（四步，顺序不能换）**：

1. **先落条目** —— 把要挪走的 \`###\` 子节**整节**（从它的 \`### \` 行起，
   到下一个 \`###\` 或 \`##\` 之前）用 \`entries\` 落成 **\`kind: history\`** 的条目；
   正文**原文照收、一字不改**（归档的意义就是留原话）。
   相邻的几个批次可以合成一条（\`slug\` 形如 \`dsh-memj-history-b32-b37\`）。
2. **抄下回执给的完整 uuid** —— 每条新知识后面括号里就是；**逐字抄**。
   ⚠️ 只抄 8 位前缀不够用，**更不要自己把它"补全"**（补出来的段是编的 ⇒ 死链）。
3. **删原处** —— 用 \`docSection\` + \`docOp:"drop"\`，**一次一个子节**。
   ⚠️ \`docSection\` 传可识别的片段即可，但**回执会回显它实际命中了哪个节** ——
   看到与你预期不一致，**先停下来核对**。
4. **留指针** —— 用 \`docSection:"历史进展"\` + \`docOp:"prepend"\` 把指针加进去；
   每行形如 \`- **第32~37批**：一句话主题 —— 详见条目 <完整 uuid>。\`

🔴🔴 **两条会丢数据的坑（都真实发生过，务必避开）**：

- **不要用 \`docOp:"replace"\` 改「历史进展」这类累积容器** —— 它的语义是**替换整节**，
  而你想的是"加几行" ⇒ **原有的几十行指针会被一次抹掉**。
  ⭐ **能用 \`prepend\`/\`append\` 就不要用 \`replace\`**；必须 \`replace\` 时，
  要先把该节**完整读出来**、把新内容接上去、再整段写回。
- **uuid 只能抄、不能造** —— 拿不到就**宁可不写指针**（只留一句话主题），也别填占位。

⚠️ **别等着工具动手** —— 它不会。**"报了但不做"是这个机制已知的风险**
（本项目历史上就出现过"连报 7 次、一次没压"）⇒ 所以：**看到数字超标，就当场整理**。

### 库外文档：先引用，还是入库？

库外文档**默认先只引用**（不搬动、不改写原文件）；它的 \`desc\` 由你**读过之后**写。

若你判定它**本身就是一份完整可复用的知识**（不是"顺便有个参考资料"）⇒ **入库**。
判据：整篇有价值 ⇒ \`copy\`；只有部分有用或需跨文档综合 ⇒ \`extract\`。

### 封面字段怎么写（\`title\` / \`desc\` 的质量决定日后搜不搜得到）

- **\`title\`**：2–48 字符的**具体名词短语**。内部条目通常与正文首个 \`###\` 同句
  （正文里那份可以保留，不必删）；外部引用给一个能概括该文档的名字。
  ⚠️ **不要写成整句话或摘要**——它是标题。
- **\`desc\`**：格式为「<这是什么场景下的什么知识>；当<什么场景>时读它。」
  **前半**点出适用场合/领域（如"构建插件时""排查端口占用时"），**后半**是具体触发场景。
  **它是检索键，不是摘要**——判据是"日后带着问题来查，这句话能不能把它捞出来"；
  200 字符内尽量简洁，但**场景词必须写全**，宁可写满也不要为短而丢检索线索。
  ⚠️ 不要写成泛泛的「需要时读它」。
- **\`kind\` 与 \`theme\` 无关**：\`theme\` 是"属于谁"，\`kind\` 是"本身是什么形态"。
- **\`overwrite\` 的默认值偏置**：默认站在**不毁数据**那侧——
  知识是长期资产，误覆盖**不可恢复**；而"多跑一轮"只多花一点 token。

### 沉淀前：怎么写、写什么

**四问（全过才写）**：
1. **跨会话有用吗？**——换一个没有本会话上下文的 agent，需要它吗？
2. **能直接读出来吗？**——能从代码 / 文件直接得出，就不写。
3. **验证过了吗？**——猜测与未核实结论不写。
4. **写得出一句无「或」的范围句吗？**——写不出 ⇒ 它覆盖了两件事，**应拆成多张封面**。

⭐ **空操作出口**：没有候选通过四问 ⇒ **不留任何封面**，只写常规交接。
**为交差而硬凑内容是错误行为。**

### 沉淀前的「扫描清单」（逐类过一遍，每类都要给结论，没有就明说「无」）

| # | 类别 | 判据 |
|---|---|---|
| 1 | ⭐ **实测/核实过的机制或行为** | 调过工具、跑过探针、读过源码才敢下的结论（**不是推断**） |
| 2 | **踩过的坑与根因** | 出过错、且搞清了**为什么**错 |
| 3 | **做过的决策与理由** | 在几个方案里选了某个，**且理由会再次用到** |
| 4 | **查清楚的外部接口** | 服务名 / API / 路径 / 参数形态——**下次不用再查**的那些 |

⚠️ **第 1 类最容易漏**——它往往**在对话里讲得很详细**，于是产生"已经记下来了"的错觉。
**对话不是库，下一会话搜不到。**
⚠️ 清单是"过一遍"，不是"必须每类都写"——**四问仍是闸门**。

### 正文怎么写

**自由写**，只两条软约束：
1. **说清这条知识本身**——结论 / 事实 / 步骤，一句话能讲清就用一句话；
2. ⭐ **若有反直觉之处、或有代价与边界 ⇒ 写清"为什么"**。

⭐ **\`Why\` 别丢**：只记结论会让人**照搬而不知边界**。
但它**只在真有反直觉/代价时才写**——「知道了规则自然知道适用范围」的那种不必硬凑。

**按 \`kind\` 选形态**（建议而非强制）：

<!--memj:kind-catalog-->

> 📌 表格、编号列表、「最初认为 X，实际是 Y」这类纠错写法**都完全合法**——
> 旧库里最自然的几条恰恰不是三段式。

**禁存**：寒暄与来回确认、未验证的猜测、助手自述主张、原始工具输出、完整代码清单、
能从代码或文件直接读出的事实、密钥。**每条只讲一件事**。

### 正文的「知识来源」章节（⭐ 固定章节，写在正文**末尾**）

🔴 **每条知识都应有 \`### 知识来源\` 这一节**，用来说明**这条知识是从哪来的**。

**写什么**（**由你判断**，如实写）：

| 这条知识怎么来的 | 来源里写什么 |
|---|---|
| **读了某个文件**得出的 | 那个文件的**绝对路径**（可写多个） |
| **网络搜索**得到的 | **参考链接**（URL）+（若有）站点/标题 |
| **查了某个接口/工具** | 接口或工具名 + 关键参数 |
| **实测、跑探针**验证的 | 实测对象 +（可选）验证方式 |
| **用户说的 / 会议结论** | 如实写"用户口述"这类描述 |

**格式**（自由写，唯一硬要求是**能定位**）——**标题行 + 每条来源一行**，形如：

> \`### 知识来源\`
> 　\`- <绝对路径或 URL>——一句话说明这个来源提供了什么\`
> 　\`- <另一个来源>\`

⚠️ **本节写在围栏内，所以上面用行内引用示意，不写裸围栏**——
\`gen-context.mjs\` **会拒绝有两个围栏的块**（本项目的已知坑）。

**规则**：

- ⭐ **可以有多个来源**——逐条列出，一条一行；
- ⭐ **也可以没有来源**（例如纯推理得出的结论）⇒ **这种情况整节不写**，
  **不要写"无来源"占位**（\`禁存\`里的"为交差而硬凑"同理）；
- 🔴 **必须放在正文末尾**——\`extractTitle()\` 取**首个 \`###\`** 当标题兜底，
  若把它写在最前面，缺 \`title\` 的老条目**标题会变成"知识来源"**；
- ⚠️ **与封面的 \`source\` 字段不是一回事**：那里记的是**会话 id**（谁写的、哪一轮），
  这里记的是**内容的出处**（这条知识依据了什么）。两者都要写，互不替代。

### 什么时候用 memj_update

- 你在 handoff / 沉淀知识时，先 \`memj_search\` + \`memj_read\` 发现了**相似的已有条目**
  ⇒ **更新它**，而不是再写一条新的（避免库内重复）；
- 某条知识的**事实过期**了 ⇒ 在那个时机刷新它。

### 查/改 memj 自身状态时，优先用工具

⚠️ 优先调 \`memj_rebuild\`（或其它 \`memj_*\` 工具），**不要绕过工具去 import 内部函数写脚本**
——工具带着**封面校验层**，绕过它等于**静默把校验漏掉**。

### 什么时候用 memj_promote

它**通常不需要你直接调**——写 handoff 时的归属落位，\`memj_handoff\` 会更顺手地一并完成。
它的用武之地是**事后/独立**的场景：批量补挂、改错、摘除。

### memj 各工具的用法要点

- **\`memj_search\` 的检索词要你自己提炼**：给**有语义的词**，不是用户原句。
  例：用户说"注入缓存那个机制是怎么回事" ⇒ 传 \`["注入缓存", "缓存", "注入"]\`；
  用户说"插件构建那个 src 和 lib 的坑" ⇒ 传 \`["构建", "插件", "src", "lib"]\`。
  **匹配是整词命中、不做二次切分**——你给的词就是唯一的分词依据，
  每个词都要自带语义（不要给"入缓"这种无意义字串）。命中后按 id 用 \`memj_read\` 取正文。
- **\`memj_info\` 可用 \`query\` 按词筛**、\`kind\` 只查一类、\`withDesc: true\` 附带描述。
- **\`memj_search\` 的封面带 \`size\`**（带 query 时）——用它判断下一步该不该按节读。
- **\`memj_read\` 长文档返回节名清单**；\`section\` 匹配不上会把节名清单回给你；
  确实要通读时传 \`full: true\`。
- **\`memj_snapshots\` 的调用时序**：先 \`memj_info\` 定项目 id，**再**带该 id 调它
  （它会筛出 \`project\` ≠ 该 id 的知识）。

### 添加主题的判据

⚠️ 先分清**两个不同的问题**（实测混淆过一次）：
- **"要不要新建这个主题"** ⇒ 看下面的判据；
- **"这条知识该不该挂到某个已有主题"** ⇒ 判据在块 C（**"给别的项目用成立吗"**）。

这个主题**确实能覆盖不止一个项目、或一类反复出现的场景**吗？
- 满足 ⇒ 用 \`newThemes\` 声明 \`{ id, desc }\`，一次建成并挂上。**免批准。**
- ⚠️ 能否落地取决于本实例的校验模式——**严格模式下必须有跨项目证据**，否则工具会拒收
  （本实例是哪一种，\`memj_snapshots\` 的返回值会明说）。
- **优先并入已有主题**；能容纳就不要另起近义主题；不确定是否同一范畴 ⇒ **宁可晚建**。

### 上下文占用率

⭐ 每轮结束时，插件可能给你一条 \`## 上下文占用\`（窗口大小、当前用量、百分比）。
它是**事实，不是指令**——**只有当用户或项目规范里写了"依据占用率该做什么"时才据此动作**；
没写就**静默忽略**。
⚠️ 它**不是每轮都有**：低于阈值时插件不报 ⇒ **不要因为没看到它而做任何假设**。`;
//#endregion
//#region src/tag-auto-state.ts
/**
* ⭐⭐⭐ **自动标签规范化：记账（decision 167，修正 165 的三层门）**
*
* ── 🔴🔴 为什么要有这个文件（一次真实事故）────────────────────────────────
* 决策 165 的三层门里，**门② 与门③ 都建立在"读父会话日志"上**，而两者都是错的：
*
* | 门 | 165 的实现 | 为什么失效（2026-09-28 生产实测） |
* |---|---|---|
* | ② 有沉淀 | 判"**本会话**有没有 `memj_handoff` 的 `tool/call`" | ⚠️ 那是**会话级**判据 —— 一旦调过**永远为真** ⇒ **handoff 之后的每一轮都过门** |
* | ③ 去重 | 在**父会话**日志找 `memj_normalize_tags` 的 `tool/call` | 🔴 那次调用发生在**子会话**里 ⇒ **父会话日志永远看不到** ⇒ **去重恒不生效** |
*
* ⇒ 两道门叠加 = **只要这个会话落过一次知识，之后每轮都起一个子代理**。
* ⭐ 生产上的铁证：某会话 `memj_handoff` 只发生在 **07:39~07:41 一轮**，
*    而插件在 **07:45 / 07:52 / 08:07**（后面几轮，**都没沉淀**）各起了一个子代理。
*
* ⭐ **用户给的判据**：*"应该是只有有知识沉淀的轮次才跑啊，这个需要插件用脚本去校验。"*
*
* ── 修法：**让插件在"写知识"那一刻自己记一笔**，不再事后读日志猜 ──────────
* - 记什么：**本次 handoff 真的落了知识**（`knowledgeWritten > 0`）的**轮次**，
*   以及"**这个轮次**有没有已经被规范化过"；
* - 单位从「会话」改成「**轮次**」—— 这正是 165 错的地方（会话级判据无法区分"哪一轮"）；
* - ⭐ **不再需要读会话日志**（附带好处：165 每轮都要解压一个 4.7MB 的日志）。
*
* @module dsh-memj/tag-auto-state
*/
/** 空状态。 */
function emptyTagAutoState() {
	return {
		version: 1,
		sessions: {}
	};
}
/**
* 读状态。⚠️ **文件不存在/损坏一律回空**（与 `loadVocabulary` 不同：
* 那个回 `undefined` 表示"没播种过"，这里有明确语义 —— "什么都不知道"）。
* @returns 状态（永不抛）。
*/
async function loadTagAutoState() {
	try {
		const raw = await readFile(tagAutoStatePath(), "utf8");
		const j = JSON.parse(raw);
		if (j?.version !== 1 || typeof j.sessions !== "object" || j.sessions === null) return emptyTagAutoState();
		return {
			version: 1,
			sessions: j.sessions
		};
	} catch {
		return emptyTagAutoState();
	}
}
/**
* 写状态（原子：先写临时文件再 rename）。
* ⚠️ 失败**只记日志、不外溢**（同本模块一贯纪律）。
* @param st - 状态。
*/
async function saveTagAutoState(st) {
	try {
		const p = tagAutoStatePath();
		await mkdir(dirname(p), { recursive: true });
		const tmp = `${p}.tmp`;
		await writeFile(tmp, JSON.stringify(st, null, 2), "utf8");
		await rename(tmp, p);
	} catch (err) {
		try {
			console.log(`[dsh-memj/tag-auto] 状态写盘失败：${String(err)}`);
		} catch {}
	}
}
/**
* ⭐⭐⭐ **记一笔"本轮落了知识"**（由 `handoff` 在**落盘成功后**调用）。
*
* 🔴 **必须在确认写了知识之后调**（`knowledgeWritten > 0`），否则门② 就没意义了。
* @param sessionId - 会话 id。
* @param turn - 轮次号（⚠️ 判据的单位）。
* @param written - 落了几条。
* @returns 无（失败只记日志）。
*/
async function noteKnowledgeWritten(sessionId, turn, written) {
	if (sessionId === "" || written <= 0) return;
	try {
		const st = await loadTagAutoState();
		st.sessions[sessionId] = {
			turn,
			written,
			at: (/* @__PURE__ */ new Date()).toISOString(),
			pending: true
		};
		await saveTagAutoState(st);
	} catch (err) {
		try {
			console.log(`[dsh-memj/tag-auto] 记账失败：${String(err)}`);
		} catch {}
	}
}
/**
* 纯函数：**该不该起子代理**（可单测）。
*
* 🔴 **与 165 的区别（两次修正）**：
* - 165：判"**这个会话**有没有落过知识" ⇒ ⚠️ **会话级**，一旦为真**永远为真**
*   ⇒ **落过一次后每轮都起**（生产事故）；
* - 167：判"**有没有一次还没被消费的落知识**"（`pending`）——
*   ⭐ 语义正好是"**落知识那一轮的轮次结束时，起一次**"。
*
* ⭐ **为什么不用"轮次号相等"**：编号从两处来（`turnOf()` 投影 vs `payload.turn`），
*    而 `turnOf()` 拿不到时回 `-1` ⇒ 会**静默永不触发**（比重复触发更隐蔽）。
*    用 `pending` 就**不依赖两处编号一致**。
* @param opts - 开关 / 账。
* @returns 该不该起 + 可判定的理由。
*/
function decideTagAuto(opts) {
	if (!opts.enabled) return {
		start: false,
		reason: "开关关闭（tagNormalizeOnHandoff=false）"
	};
	const r = opts.record;
	if (r === void 0) return {
		start: false,
		reason: "本会话还没落过知识"
	};
	if (r.pending !== true) return {
		start: false,
		reason: `第 ${r.turn} 轮落的知识已经规范过了（或本会话还没落知识）`
	};
	return {
		start: true,
		reason: `第 ${r.turn} 轮落了 ${r.written} 条知识，还没规范化`
	};
}
/**
* 纯函数：**消费掉"待规范化"标记**（返回**新**状态，不改入参）。
* @param st - 当前状态。
* @param sessionId - 会话 id。
* @returns 新状态（无记录时原样返回）。
*/
function markNormalized(st, sessionId) {
	const r = st.sessions[sessionId];
	if (r === void 0 || r.pending !== true) return st;
	return {
		version: 1,
		sessions: {
			...st.sessions,
			[sessionId]: {
				...r,
				pending: false
			}
		}
	};
}
//#endregion
//#region src/handoff.ts
/**
* `memj_handoff` 的核心逻辑（方案 §3.7 / §4.2 / §7.1）。
*
* ── 执行顺序（顺序即语义，§7.1）────────────────────────────────────────────
* ```
* 0. 创建项目文档（不存在时；相似 id ⇒ 两段式确认）
* 1. ⭐ 建新主题（必须在写封面之前——封面的 theme 要填新主题 id）
* 2. 写叙事
* 3. 写封面 + 落盘内部条目
* 4. 登记外部引用（ext: true）
* 5. ⭐ 入库外部文档（adopt：copy / extract）
* 6. ⭐ 标记读快照为已消费（并判清理）
* 7. ⭐ 硬校验（本地程序，零 LLM）
*    ⇒ 全过 ⇒ 重建派生层；任一非法 ⇒ 报错并要求重写
* ```
*
* ── 🔴 关于「不半写」的实现方式 ────────────────────────────────────────────
* 决策 72 要求校验失败时**不是半写**，而 §3.9.1 说校验发生在"落盘之后"。
* 两者看似冲突，实际解法是：**全部内容先在内存里构建（含生成的 id 与 ref），
* 校验通过后才统一落盘**。这样既保持"零 LLM 的确定性校验"，
* 又真正做到"失败则整份不写"——不会留下半截状态。
*
* ── 🔴 关于「工具校验」：**分模式**（决策 95）────────────────────────────────
* 「≥2 个项目」**不是要用工具去数的量**，而是**事情发生时就成立的事实**：
* 别项目的知识被本项目用了 ⇒ A + B 已经是两个项目。
*
* | 模式 | 跨项目证据校验（快照.project ≠ 本次 project） |
* |---|---|
* | `strict` | ✅ **做**——这是全套机制里**唯一**的一处工具校验 |
* | `loose`（⭐ **默认**，2026-10-12 起） | ❌ **不做**——是否新建主题**完全由 LLM 判断** |
*
* ⚠️ **宽松模式只拆这道闸门，不拆别的东西**：`desc` 非空 / ≤200、近义 id 回确认、
* `theme` 必须已存在——**两种模式都保留**（"能不能用"与"防永久性损坏"，不是"该不该建"）。
*
* @module dsh-memj/handoff
*/
/**
* 给"只有节正文（无标题行）"的片段**补一个占位标题**再做块级切分时用。
*
* 🔴 用途只有一个：`stripSpecBlock()` 期望"含标题行的该节"（它默认从下标 1 找块），
*    而 `splitH2()` 给的是**不含标题行**的 `lines` ⇒ 中间用一个不会被当真的标题接一下。
* ⚠️ 用 `## x` 而不是中文节名 —— 避免与工具维护的节名（「沉淀知识」等）撞上。
*/
const PLACEHOLDER_TITLE = "x";
/**
* 规范块的**围栏那一行**（` ```memj:spec `）。
*
* ⚠️ 语言标记取自 `sections.ts` 的 `SPEC_BLOCK_FENCE`（**唯一源头**）——
*   解析侧（`specBlockRange`）与这里必须同源，否则"写的"与"读的"会漂。
*/
const FENCE_SPEC = `${String.fromCharCode(96, 96, 96)}${SPEC_BLOCK_FENCE}`;
/** 规范块的**结束围栏**（裸那一串反引号）。⚠️ 与 `FENCE_SPEC` **不是同一个**。 */
const FENCE_BARE = String.fromCharCode(96, 96, 96);
/**
* ⭐⭐⭐ **`themeWhy` 里有没有"逐字引用"所挂主题 desc 的某个片段**（决策 156）。
*
* ⚠️ **判据是"连续片段"，不是"分词重合"** —— 后者太松：随便写几个词就能蒙过，
*    而这一步的目的恰恰是**逼调用方真的去读那段 desc**。
*
* 做法：把两边按**标点与空白**切开（去掉标点、折叠空白），然后找
* **最长公共连续子串**（**按字符**）；长度 ≥ `MIN_QUOTE_CHARS` ⇒ 算引用到了。
*
* 🔴 **为什么用字符而不是词**（第一版写错、被测试当场抓到）：
*    本项目的主题 desc **以中文为主、且不带空格** ⇒ 按空白切词时
*    整句会成为一个"词"，而引用时只写其中半句就对不上了
*    （实测：`引了「工具与命令注册」` 被判 false）。
*    ⇒ ⭐ **中文场景下"连续字符"才是自然的单位**（这也与检索那边
*      "整词命中"的教训同源：**分词规则要匹配文本的实际形态**）。
* @param why - 调用方给的挂靠依据。
* @param desc - 该主题的 desc（**可能为空** ⇒ 直接判 false）。
* @returns 是否算"引用到了 desc 原文"。
*/
function quoteAppearsIn(why, desc) {
	if (desc.trim() === "") return false;
	/** 去掉标点、折叠空白 —— 只留"实义字符"，避免标点差异造成假不匹配。 */
	const norm = (s) => s.replace(/[\s，。；：、（）【】《》"'`“”‘’—…·,.;:()<>[\]{}!?！？/\\|-]+/g, "");
	const a = norm(why);
	const b = norm(desc);
	if (a === "" || b === "") return false;
	const MIN_QUOTE_CHARS = 12;
	if (b.length < MIN_QUOTE_CHARS) return false;
	let best = 0;
	for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1) {
		let k = 0;
		while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k += 1;
		if (k > best) best = k;
	}
	return best >= MIN_QUOTE_CHARS;
}
/**
* 三个**可单独执行**的步骤，**顺序即执行顺序**（§3.11.2）。
*
* 🔴 **固定为这个顺序，与调用方给的数组顺序无关**——
* `knowledge` 要挂主题，而主题由 `theme` 建；顺序反了会挂到不存在的主题上。
*/
const HANDOFF_STEP_ORDER = [
	"narrative",
	"theme",
	"knowledge"
];
/**
* 把 `step` 参数规范化成"要跑哪几步"。
*
* 规则（§3.11.2）：
* - **缺省 ⇒ `all`**（保持老行为）；
* - 单个值或**数组**都接受；
* - `all` **不能与其他步骤并存**（含义冲突）；
* - **空数组非法**——静默当成 `all` 会做意外的全量写入；
* - 非法取值 ⇒ 报错并列出合法值。
* @param raw - 入参里的 `step`。
* @returns 步骤计划。
*/
function planSteps(raw) {
	if (raw === void 0) return {
		steps: new Set(HANDOFF_STEP_ORDER),
		isAll: true
	};
	const list = Array.isArray(raw) ? raw : [raw];
	if (list.length === 0) return {
		steps: /* @__PURE__ */ new Set(),
		isAll: false,
		error: `\`step\` 不能是空数组——那意味着什么都不做。
要么省略它（= 全部），要么明确给：${HANDOFF_STEP_ORDER.join(" / ")} / all。`
	};
	const hasAll = list.includes("all");
	const others = list.filter((s) => s !== "all");
	if (hasAll && others.length > 0) return {
		steps: /* @__PURE__ */ new Set(),
		isAll: false,
		error: `\`step\` 里 \`all\` 不能与其他步骤并存（给的是：${list.join("、")}）。`
	};
	if (hasAll) return {
		steps: new Set(HANDOFF_STEP_ORDER),
		isAll: true
	};
	const steps = /* @__PURE__ */ new Set();
	for (const s of list) {
		if (!HANDOFF_STEP_ORDER.includes(s)) return {
			steps: /* @__PURE__ */ new Set(),
			isAll: false,
			error: `\`step\` 取值非法：「${s}」——只能是 ${HANDOFF_STEP_ORDER.map((x) => `'${x}'`).join(" / ")} / 'all'（或它们的数组）。`
		};
		steps.add(s);
	}
	return {
		steps,
		isAll: false
	};
}
/**
* 把一段叙事文本按 `## ` 切成节（**跳过代码围栏内的伪标题**）。
*
* 🔴🔴 **排除"工具自己维护的节"**（2026-10-12）：
*   `## 沉淀知识`（封面容器）与 `## 本档写作规范`（模板复制的规范）
*   **都不是叙事节** —— 它们由工具生成、模型既不写也不该"读到才算读全"。
*   ⚠️ **为什么在这里统一排除**（而不是各个调用点各排一次）：
*     本函数有 **13 个调用点**，其中 9 处要的是"顶层叙事节"
*     ⇒ 逐个加过滤必然漏（本项目判据："一段代码里已经有了一种过滤，
*       就问其他几条路径为什么不需要"）。
*   ⭐ 排除之后的连带好处（都是"少一类静默错误"）：
*     · 合并/规范化**不会**把规范节当成"自定义节"保留下来（否则会与重建的那份并存）；
*     · 体量行与截断配额**不再把规范的字数算进去**（规范可能几百字符）；
*     · `inheritedIn` / `replacedIn` 的回声不再冒出"本档写作规范"这个假节名；
*     · 读记录闸门（`narrativeTopSections`）不会要求模型去读它。
* @param text - 叙事文本。
* @returns 节数组（**不含**工具维护的节）。
*/
/**
* ⭐ **算"一节有多重"——剔除规范块**（决策 209）。
*
* 🔴 **为什么必须剔**：截断判据（`beforeChars > warnChars`）与回执体量行都用它，
*   而规范块是**工具维护的固定开销**（几百字符）⇒ 算进去会让
*   ① 阈值被规范吃掉；② 文档刚建就"接近超阈值"；③ 回执报的体量**虚高**。
* ⭐ **两处必须同源**（同一个函数）—— 否则"该不该截"与"回执报多少"会给出两个数
*   （本项目最忌"同一事实两个数"）。
* @param lines - 该节的行（含标题行）。
* @returns 字符数（已剔除规范块与首尾空白）。
*/
function sectionCharCount(lines) {
	return stripSpecBlock(lines).join("\n").trimEnd().length;
}
function splitH2(text) {
	const out = [];
	let cur;
	let inFence = false;
	for (const line of text.split(/\r?\n/)) {
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			if (cur !== void 0) cur.lines.push(line);
			continue;
		}
		const m = inFence ? null : /^##\s+(.+?)\s*$/.exec(line);
		if (m !== null) {
			const title = (m[1] ?? "").trim();
			if (title === "沉淀知识" || title === "本档写作规范") {
				cur = void 0;
				continue;
			}
			cur = {
				title,
				lines: []
			};
			out.push(cur);
			continue;
		}
		if (cur !== void 0) cur.lines.push(line);
	}
	return out;
}
/**
* 按 `##` **与** `###` 切节（决策 134）。
*
* ⚠️ 边界规则与 `read.ts` 的 `parseSections` **保持一致**：
*    **下一个「级别 ≤ 本级」的标题**才是本节边界
*    ⇒ `## 当前进度` 会**含**它下面全部 `###` 子节。
* @param text - 叙事文本。
* @returns 节数组（按出现顺序；含行号）。
*/
function splitAny(text) {
	const lines = text.split(/\r?\n/);
	const heads = [];
	let inFence = false;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? "";
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
		if (m !== null) heads.push({
			title: (m[2] ?? "").trim(),
			level: (m[1] ?? "").length === 2 ? 2 : 3,
			line: i
		});
	}
	return heads.map((h, idx) => {
		let end = lines.length;
		for (let k = idx + 1; k < heads.length; k += 1) {
			const nxt = heads[k];
			if (nxt !== void 0 && nxt.level <= h.level) {
				end = nxt.line;
				break;
			}
		}
		return {
			title: h.title,
			level: h.level,
			startLine: h.line,
			endLine: end
		};
	});
}
/**
* 按节名找一节（决策 134）。
*
* 匹配规则与 `memj_read` 的 `section` **一致**：精确优先，否则子串、大小写不敏感。
* ⚠️ 同名多命中 ⇒ 取**第一个**（按节写要的是"就那一节"，多命中时**由调用方报错**提示歧义）。
* @param text - 叙事文本。
* @param name - 节名。
* @returns `{ section, all }`——`all` 是全部命中（供"歧义就报错"用）。
*/
function findAnySection(text, name) {
	const secs = splitAny(text);
	const exact = secs.filter((s) => s.title === name);
	if (exact.length > 0) return {
		section: exact[0],
		all: exact,
		exact: true
	};
	const key = name.trim().toLowerCase();
	const subs = secs.filter((s) => s.title.toLowerCase().includes(key));
	return {
		section: subs[0],
		all: subs,
		exact: false
	};
}
/**
* 找出**空壳节**（只有标题、没有内容）——供 `drop` 后的报警用（决策 134 §3.1）。
*
* 🔴 **为什么要这个检查**（用户裁定"允许删空、但回执必须报警"）：
*    工具**分不清**"故意删空"与"误删"（同孤本判据检测的取向）；
*    而**本项目真有一个删不掉的空壳节**（`## 第十二批…`）——
*    正因为删不掉才留在文档里，所以"刚产生一个空壳节"这件事**值得当场说出来**。
* @param text - 叙事文本。
* @returns 空壳节的节名数组。
*/
function findEmptySections(text) {
	const lines = text.split(/\r?\n/);
	const out = [];
	for (const s of splitAny(text)) {
		if (s.level !== 2) continue;
		if (stripSpecBlock(lines.slice(s.startLine + 1, s.endLine)).join("\n").trim() === "") out.push(s.title);
	}
	return out;
}
/**
* ⭐ **找出"同名小节出现了多次"的节名**——供 `replace` 后的报警用（2026-09-21 新增）。
*
* 🔴🔴 **为什么需要它（真实事故）**：
*    我用 `docOp:'replace'` 替换某一小节时，**把后面几节的内容连它们的 `###` 标题一起**
*    写进了 `doc`。结果那些标题**成了新建子节**，而**原有的同名小节仍然在**
*    ⇒ 整段内容**重复了两遍**（实测：一节从 15 个子节变成 20 个、其中 5 个重复）。
*
* ⚠️ **工具当时什么都没说**：它只报"该节 X → Y 字符"，而那次是 `+2908`
*    ⇒ **看起来只是"写多了"，完全不像错误**。
*
* ⭐ **正确的用法是把标题限定在"被替换的那一节自己"**：
*    要合并别的小节 ⇒ **逐个替换它们**，不要把它们的标题塞进这一节里。
*
* ⚠️ 与 `findEmptySections` 同取向：**只警告、不拒绝**——
*    "故意造两个同名小节"在语义上并非不可能（虽然罕见），工具**不该替人做这个决定**。
*
* 🔴🔴 **2026-09-30 修正：只在【同一个父节内】统计子节重名**（原判据是全局计数）。
*    **起因**：本项目的「有效做法」与「失败/踩坑」**各自**都用
*    `### 一、通用方法（跨功能）` / `### 二、按功能` 这种两段式组织
*    ⇒ 全局计数必然报"`一、通用方法（跨功能）`×2、`二、按功能`×2"
*    ⇒ **每轮交接都打一条假警报**（实测：本轮两次 handoff 都被它刷了一遍）。
*    ⭐ **判据**：要防的是「**同一个父节下的重复**」，不是「同名」——
*    跨顶层节的同名子节是**结构性重名**，语义上完全正常。
*    ⚠️ **顶层 `##` 节没有父节** ⇒ 它**仍然按全局唯一**统计
*    （两个 `## 当前进度` 才是真重复）。
* @param text - 叙事文本。
* @returns 出现次数 > 1 的节名（含出现次数与父节名），按首次出现顺序。
*/
function findDuplicateSections(text) {
	const counts = /* @__PURE__ */ new Map();
	let currentTop = "";
	for (const s of splitAny(text)) {
		if (s.level === 2) currentTop = s.title;
		const key = s.level === 2 ? `\u0000##\u0000${s.title}` : `\u0000${currentTop}\u0000${s.title}`;
		const prev = counts.get(key);
		if (prev === void 0) counts.set(key, s.level === 2 ? {
			title: s.title,
			count: 1,
			level: 2
		} : {
			title: s.title,
			count: 1,
			level: 3,
			parent: currentTop
		});
		else prev.count += 1;
	}
	const out = [];
	for (const v of counts.values()) if (v.count > 1) out.push(v);
	return out;
}
/**
* 对某**一节**做一次操作（决策 134 的 B+C）。
*
* 🔴 **为什么必须有它**：旧的 `mergeNarrative` 最小单位是**整个顶层节**
*    ⇒ 要加一段就得**逐字重写整节**（实测「当前进度」28,750 字符，超出单次输出能力），
*    而**压缩**（归并/降级）本质是"**换**"与"**删**"，追加或整节重写都做不了。
*
* ⭐ **`append`/`prepend` 的 `body` 不含节标题**（工具自己加）——
*    这正是"LLM 只产出一段"的关键。
*
* @param text - 现有叙事。
* @param sectionName - 节名（子串匹配）。
* @param op - 操作。
* @param body - 新内容。`append`/`prepend` 时**不含标题**；`replace` 时**含标题**（整节换成它）。
* @returns 结果。
*/
function applySectionOp(text, sectionName, op, body) {
	const name = sectionName.trim();
	if (name === "") return { error: "`docSection` 不能为空。" };
	const { section, all, exact } = findAnySection(text, name);
	if (section === void 0) return { error: `找不到名为「${sectionName}」的节。请用 \`memj_read({ project: … })\` 看**顶层节**清单（回执里会带每节的字符数），从里面重挑一个。` };
	if (all.length > 1) return { error: `节名「${sectionName}」**有歧义**，命中了 ${all.length} 个：${all.map((s) => `\`${s.title}\``).join("、")}。\n请给一个更精确的名字（精确同名优先于子串匹配）。` };
	const lines = text.split(/\r?\n/);
	const titleLine = `${"#".repeat(section.level)} ${section.title}`;
	const beforeChars = sectionCharCount(lines.slice(section.startLine, section.endLine));
	const whole = lines.slice(section.startLine, section.endLine);
	const blk = extractSpecBlockLines(whole);
	const bodyOfSection = stripSpecBlock(whole).slice(1).join("\n").trim();
	const newBody = stripAllSpecBlocks(body.trim());
	let replaced;
	if (op === "drop") replaced = [];
	else if (op === "replace") {
		const given = newBody === "" ? [] : newBody.split(/\r?\n/);
		const content = given.length > 0 && /^#{2,3}\s+/.test(given[0] ?? "") ? given.slice(1) : given;
		replaced = newBody === "" ? [titleLine] : [
			titleLine,
			"",
			...blk.length > 0 ? [...blk, ""] : [],
			...content
		];
	} else {
		if (newBody === "") return { error: `\`docOp: '${op}'\` 时 \`doc\` 不能为空。` };
		const merged = op === "append" ? `${bodyOfSection}\n\n${newBody}`.trim() : `${newBody}\n\n${bodyOfSection}`.trim();
		replaced = [
			titleLine,
			"",
			...blk.length > 0 ? [...blk, ""] : [],
			...merged.split(/\r?\n/)
		];
	}
	const next = [
		...lines.slice(0, section.startLine),
		...replaced,
		...lines.slice(section.endLine)
	].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
	const afterChars = replaced.join("\n").trimEnd().length;
	return {
		narrative: next,
		hitTitle: section.title,
		fuzzyHit: !exact,
		beforeChars,
		afterChars
	};
}
/**
* 把叙事**规范成固定的节结构**（§3.1「顺序固定」）。
*
* ⚠️ **"固定"指的是"按该文档自己的节名清单固定"**，不是"固定六节" ——
*    节名来自 `titles` 参数（= **正文里的 `##` 标题**），自定义模板完全不同。
*
* 🔴 **为什么必须规范化**：LLM 可能只写了其中几节（"这次没有踩坑"很常见）。
* 若不补齐，文档结构就会随每次调用漂移——而设计明确要求**顺序固定**，
* 且 `memj_rebuild`、接手的人都依赖这个固定结构。
*
* 规则：
* 1. 六个标准节**按设计顺序**输出；
* 2. **缺失的节补成空节**（标题仍在，便于看出"这节确实是空的"）；
* 3. **非标准节保留**，附在最后——不丢弃 LLM 写的内容；
* 4. 同名节出现多次 ⇒ 内容合并到该节。
* @param text - 原始叙事文本。
* @param titles - ⭐ **该文档的节名清单**（决策 204）。省略 ⇒ 默认六节。
*   🔴 **必须用该文档【正文】里的节名传入**（自定义模板的文档靠它）。
* @returns 规范化后的叙事。
*/
function normalizeNarrative(text, titles = NARRATIVE_TITLES) {
	const sections = splitH2(text);
	const standard = new Set(titles);
	/** 标准节 → 合并后的内容行。 */
	const merged = /* @__PURE__ */ new Map();
	/** ⭐ 决策 209：节名 → 规范块原文行（**逐字保留**；同一个节名只留第一个）。 */
	const blocks = /* @__PURE__ */ new Map();
	/** 非标准节（保序、去重）。 */
	const extra = [];
	for (const s of sections) {
		const blk = extractSpecBlockLines([`## ${s.title}`, ...s.lines]);
		if (blk.length > 0 && !blocks.has(s.title)) blocks.set(s.title, blk);
		if (standard.has(s.title)) {
			const prev = merged.get(s.title);
			if (prev === void 0) merged.set(s.title, [...s.lines]);
			else prev.push("", ...s.lines);
		} else if (!extra.some((e) => e.title === s.title)) extra.push(s);
	}
	const out = [];
	for (const title of titles) {
		out.push(`## ${title}`, "");
		const blk = blocks.get(title);
		if (blk !== void 0 && blk.length > 0) out.push(...blk, "");
		const body = (merged.get(title) ?? []).join("\n").trim();
		if (body !== "") out.push(body, "");
	}
	for (const e of extra) {
		out.push(`## ${e.title}`, "");
		const blk = blocks.get(e.title);
		if (blk !== void 0 && blk.length > 0) out.push(...blk, "");
		const body = e.lines.join("\n").trim();
		if (body !== "") out.push(body, "");
	}
	return out.join("\n").trimEnd();
}
/**
* ⭐⭐ **按节合并叙事**（决策 109）：`doc` 是"补丁"，不是"整份新版本"。
*
* ── 规则 ────────────────────────────────────────────────────────────────────
* | 本次 `doc` 里…… | 结果 |
* |---|---|
* | **写了某一节** | 该节**替换**成新内容 |
* | **没写某一节** | ⭐ **保留旧内容**（不再被清空） |
* | **写了但内容为空**（如只写 `## 下一步`） | 该节**被清空** |
*
* 🔴 **判据是"这一节在 doc 里出现过没有"**，不是"有没有正文"——
*    ⇒ 想清空某节就把它写出来、内容留空（这是唯一能清空的方式）。
*
* ── 为什么必须做在工具里，而不是"让模型自己带上老内容" ──────────────────────
* 实测发现：**模型没有任何工具能读到项目文档的全部叙事节**
* （`memj_info` 只给项目 desc、`memj_read` 只读知识正文）
* ⇒ 它**只能凭记忆重写**，而"凭记忆"必然压缩、丢细节。
* ⇒ 把合并做在工具里，**累积就变成默认行为**，不依赖模型记得。
*
* ⚠️ **向后兼容**：模型**写全该文档的全部节**时，合并结果与原来的"整份替换"**完全相同**
*    ⇒ 现有行为一个字都不变（这是本改动敢做的前提）。
*    ⚠️ 不是"写全六节"——节数由**该文档自己的节名清单**决定（`titles` 参数）。
*
* ⚠️ **标准节与自定义节一视同仁**：两边都按"出现过 = 替换，没出现 = 保留"处理
*    （自定义节同样**不会被丢弃**——这正是用户报的"内容丢了"的一部分）。
* @param incoming - 本次 `doc`（可能只含部分节）。
* @param existing - 旧叙事（可能为 `undefined` = 新项目）。
* @param titles - ⭐ **该文档的节名清单**（决策 204）。省略 ⇒ 默认六节。
*   🔴 **必须用该文档【正文】里的节名传入** ——
*   否则自定义模板的文档会被"按默认六节合并"，表现为**节错位 / 旧节永远留着**。
* @returns 合并后的完整叙事。
*/
function mergeNarrative(incoming, existing, titles = NARRATIVE_TITLES) {
	if (existing === void 0 || existing.trim() === "") return normalizeNarrative(incoming, titles);
	const ins = splitH2(stripAllSpecBlocks(incoming));
	const old = splitH2(existing);
	const standard = new Set(titles);
	/** 盘上旧文档里，某节的规范块原文行（**逐字保留**，不重新渲染）。 */
	const oldBlocks = /* @__PURE__ */ new Map();
	for (const s of old) {
		const b = extractSpecBlockLines([`## ${s.title}`, ...s.lines]);
		if (b.length > 0) oldBlocks.set(s.title, b);
	}
	/** 本次 `doc` 里，某节**自己带了**规范块 ⇒ 用它（用户/模型显式改规范的唯一通道）。 */
	const newBlocks = /* @__PURE__ */ new Map();
	for (const s of splitH2(incoming)) {
		const b = extractSpecBlockLines([`## ${s.title}`, ...s.lines]);
		if (b.length > 0) newBlocks.set(s.title, b);
	}
	/** 取该节最终要用的规范块：本次显式给的 > 盘上的 > 没有。 */
	const blockFor = (title) => newBlocks.get(title) ?? oldBlocks.get(title) ?? [];
	/** 本次写了的节（同名多次 ⇒ 合并）。 */
	const touched = /* @__PURE__ */ new Map();
	for (const s of ins) {
		const prev = touched.get(s.title);
		if (prev === void 0) touched.set(s.title, [...s.lines]);
		else prev.push("", ...s.lines);
	}
	const out = [];
	/**
	* 🔴🔴 **2026-10-12 修一个【预先存在】的真 bug：规范块被写了两遍。**
	*
	* ── 现象（实测）────────────────────────────────────────────────────────────
	* 建项目后**只写一部分节**再交接一次 ⇒ 那些**没写的节**下面会**多出一份规范块**：
	*   · 第一次 handoff（建项目）：**6** 个块（正确）；
	*   · 第二次（只写「当前进度」）：**11** 个块 ⇒ 未写的 5 节各多了一份。
	* ⚠️ 它是**静默的**：文档照常能读、规范照常生效（`sectionSpecsOf` 取**第一个**块），
	*    只是**每轮交接多长一份** —— 且只在"**没写全**"时发生，而那是**常态**。
	*
	* ── 根因 ────────────────────────────────────────────────────────────────────
	* `splitH2()` **不剥规范块**（它把块的行原样收进 `s.lines`），
	* 而下面又用 `blockFor(title)` **单独回填一次** ⇒ 两条通路各写一份。
	* ⚠️ 只有"**从旧文档取正文**"的那两支会中招（`touched` 那支已经 `stripAllSpecBlocks` 过）。
	*
	* ── 修法 ────────────────────────────────────────────────────────────────────
	* **取旧正文前先剥掉规范块**（`stripSpecBlock`）—— 块由 `blockFor()` 统一回填，
	* 正文里不能再带一份。⭐ 判据：**同一个东西只能有一条写入通路**。
	*
	* 🔴 **为什么留这条注释**：它是我 `git stash` 到改动前、用同一场景跑出来的
	*    （**不是我本轮引入的**）—— 也就是说它**潜伏了很久**，而"静默多长一份"
	*    正是本项目最该警惕的那类失败。
	*/
	/**
	* 取"旧文档里某几节"的**正文**（已剥掉规范块）。
	*
	* 🔴 `splitH2` 的 `s.lines` **不含标题行**，而 `stripSpecBlock` 期望的是
	*    "该节的行（**含标题行**）"（它默认从下标 1 开始找块，见 `specBlockRange` 的 `from = 1`）。
	*    ⇒ 这里**补一个占位标题行**再剥，剥完把占位行去掉。
	*    ⚠️ 占位标题只能用 `## x` 这种**不会被当成工具维护节**的名字（`splitH2` 会滤掉
	*       「沉淀知识」/「本档写作规范」——不过这一步只做纯文本切片，不走 `splitH2`）。
	*/
	const priorBody = (ss) => ss.map((s) => stripSpecBlock([`## ${PLACEHOLDER_TITLE}`, ...s.lines]).slice(1).join("\n")).join("\n").trim();
	for (const title of titles) if (touched.has(title)) {
		out.push(`## ${title}`, "");
		const blk = blockFor(title);
		if (blk.length > 0) out.push(...blk, "");
		const body = (touched.get(title) ?? []).join("\n").trim();
		if (body !== "") out.push(body, "");
	} else {
		const prior = old.filter((s) => s.title === title);
		out.push(`## ${title}`, "");
		const blk = blockFor(title);
		if (blk.length > 0) out.push(...blk, "");
		const body = priorBody(prior);
		if (body !== "") out.push(body, "");
	}
	const extraSeen = /* @__PURE__ */ new Set();
	for (const s of ins) {
		if (standard.has(s.title) || extraSeen.has(s.title)) continue;
		extraSeen.add(s.title);
		out.push(`## ${s.title}`, "");
		const blk = blockFor(s.title);
		if (blk.length > 0) out.push(...blk, "");
		const body = s.lines.join("\n").trim();
		if (body !== "") out.push(body, "");
	}
	for (const s of old) {
		if (standard.has(s.title) || extraSeen.has(s.title)) continue;
		extraSeen.add(s.title);
		out.push(`## ${s.title}`, "");
		const blk = blockFor(s.title);
		if (blk.length > 0) out.push(...blk, "");
		const body = priorBody([s]);
		if (body !== "") out.push(body, "");
	}
	return out.join("\n").trimEnd();
}
/**
* ⭐⭐⭐ **把模板的规范块"插进"已有叙事**（决策 209，建项目专用）。
*
* ── 它与 `mergeNarrative` 的区别（**别混用**）──────────────────────────────
*   · `mergeNarrative(patch, old, titles)` = 「patch 写了哪几节就换掉哪几节」；
*   · `insertSpecBlocks(text, tpl)`       = 「**正文一个字不动**，只在每个节标题后
*      补上该节的规范块」。
*   🔴 我第一版拿前者干后者的活 ⇒ 骨架里的节**没有正文**，
*      于是被当成"本次没写"⇒ **正文全部清空**（实测 6 节只剩规范块）。
*   ⭐ 判据：**"插入"与"合并"是两种操作**，不要借同一个函数（借了就会踩这个坑）。
*
* ⚠️ **已经带规范块的节不动它**（幂等：重复调用结果相同）。
* ⚠️ **模板里没有的节**：不补（宁可没有规范，也不贴错的）。
*
* ⭐⭐ **2026-10-05 导出（决策 216）**：以前它是**私有**的，于是"给老文档补规范块"
*   的迁移脚本只能在**自己那份**里重抄一遍 `insert()`（`migrate-docs-to-spec-blocks.mjs` 的注释
*   写着"那个是内部函数未导出"）。
*   🔴 **那就是第二份副本** —— 两份一旦漂移，"迁移补的块"与"建项目补的块"就不一样了。
*   ⇒ 导出它，让**建项目**与**存量迁移**走同一条路径（决策 214 的同一条纪律）。
* @param text - 已有叙事（含正文）。
* @param tpl - 模板（提供每节的 desc / truncate）。
* @returns 插好规范块的叙事。
*/
function insertSpecBlocks(text, tpl) {
	const descOf = new Map(tpl.sections.map((s) => [s.name, s]));
	const lines = text.split(/\r?\n/);
	const out = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? "";
		const m = /^##\s+(.+?)\s*$/.exec(line);
		if (m === null) {
			out.push(line);
			i += 1;
			continue;
		}
		const title = (m[1] ?? "").trim();
		let j = i + 1;
		while (j < lines.length && !/^##\s+/.test(lines[j] ?? "")) j += 1;
		const seg = lines.slice(i, j);
		out.push(line);
		const s = descOf.get(title);
		if (s !== void 0 && specBlockRange(seg) === void 0) {
			out.push("", FENCE_SPEC);
			if (s.desc.trim() !== "") out.push(s.desc.trim());
			out.push(FENCE_BARE, "");
		}
		out.push(...seg.slice(1));
		i = j;
	}
	return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
/**
* 从 LLM 给的 `doc` 里抽出**叙事部分**并规范化成该文档的节结构。
*
* 这样无论 LLM 传的是"整份文档"还是"只有叙事"、写全了还是只写了几节，
* 结果都是**固定的节结构**（默认六节，或自定义模板的节）。
* @param doc - LLM 给的文档文本。
* @param titles - ⭐ **该文档的节名清单**（决策 204）。省略 ⇒ 默认六节。
* @returns 规范化后的叙事 markdown。
*/
function narrativeFromDoc(doc, titles = NARRATIVE_TITLES) {
	if (doc === void 0 || doc.trim() === "") return buildSkeleton(titles);
	const { body } = splitFrontmatter(doc);
	const withoutCovers = stripCovers(body);
	const normalized = normalizeNarrative(cutKnowledgeSection(withoutCovers).replace(/^#\s+HANDOFF[^\n]*\n+/i, "").replace(/^\s*<!--\s*文件位置：[^>]*-->\s*$/gm, ""), titles);
	return normalized === "" ? buildSkeleton(titles) : normalized;
}
/**
* ⭐ **清理 `doc` 的外壳，但保留"哪些节被写了"这个信息**（决策 109 的合并要用）。
*
* 与 `narrativeFromDoc` 的区别：**不做 `normalizeNarrative`**
* ——那一步会把**缺失的节补成空标题**，于是"没写"和"写了但空"就分不出来了，
* 而合并恰恰靠这个区分（见 `mergeNarrative`）。
* @param doc - LLM 给的文档文本。
* @returns 清理后的原文（节结构保持 LLM 给的样子）。
*/
function narrativeFromDocBare(doc) {
	if (doc === void 0 || doc.trim() === "") return "";
	const { body } = splitFrontmatter(doc);
	const withoutCovers = stripCovers(body);
	const noLoc = cutKnowledgeSection(withoutCovers).replace(/^#\s+HANDOFF[^\n]*\n+/i, "").replace(/^\s*<!--\s*文件位置：[^>]*-->\s*$/gm, "");
	return cutSpecSection(noLoc);
}
/**
* ⭐ **列出叙事里的顶层节标题**（决策 112 的"读全了吗"判据用）。
*
* 与 `inheritedIn` 用同一个 `splitH2`——**同一份解析实现**，
* 否则"哪些节存在"两处会漂移。
*
* 🔴🔴 **必须排除工具自己维护的两节**（2026-10-12 新增；否则闸门会瞎拦）：
*    `## 沉淀知识` 与 `## 本档写作规范` 都**由工具生成**，模型既不需要写、
*    也不该被要求"读过它们才算读全"。
*    ⚠️ 判据据实：`memj_read` 的 `availableSections` 是**按正文切出来的全部顶层节**
*    ⇒ 若这里不过滤，`missing` 会**永远包含规范节** ⇒ **模型把文档读得再全也过不了闸门**
*    （这正是本函数的输出被拿去当"必须读到的集合"用的缘故）。
* @param narrative - 纯叙事文本。
* @returns 节标题数组（按文档顺序，已去重、已剔除工具维护的节）。
*/
function narrativeTopSections(narrative) {
	const out = [];
	for (const s of splitH2(narrative)) if (!out.includes(s.title)) out.push(s.title);
	return out;
}
/**
* ⭐⭐⭐ **算各节的字符数**（决策 223：工具从"执行者"改成"**监察者**"）。
*
* 🔴 **为什么必须有它**：归档交给模型之后，模型**唯一缺的就是"现在多少字"** ——
*    规范里写死了阈值（如"超过 20000 字符"），但模型**量不出来**。
*    ⇒ 工具把这个数字**摆在它眼前**，那条规范才**可自检**。
*
* ⚠️ **剔除规范块**（与既有的 `sectionCharCount` 同源）——
*    否则规范块自己的几百字会被算进配额，让"该不该归档"判断偏早。
*
* ⭐ **两级都报**（2026-10-09 加）：顶层 `##` 节 + 它下面的 `###` 子节。
*    归档的对象是 `###` 子节 ⇒ **不报子节，调用方就没法直接动手**。
* @param narrative - 纯叙事。
* @returns 各节字符数（**按字符数降序** —— 最该归档的自然浮到最上面）。
*/
function measureSections(narrative) {
	const lines = narrative.split(/\r?\n/);
	const secs = splitH2(narrative);
	const out = [];
	for (const s of secs) {
		const start = lines.findIndex((l) => l.trim() === `## ${s.title}`);
		if (start === -1) continue;
		let end = lines.length;
		for (let k = start + 1; k < lines.length; k += 1) if (/^##\s+/.test(lines[k] ?? "")) {
			end = k;
			break;
		}
		const body = lines.slice(start, end);
		out.push({
			title: s.title,
			chars: sectionCharCount(body),
			children: measureSubsections(body)
		});
	}
	return out.sort((a, b) => b.chars - a.chars);
}
/**
* ⭐ **算一节内部各 `###` 子节的字符数**（按字符数降序）。
*
* 🔴 **边界取法必须与"归档时整节挪走"一致**：一个子节 = 从它的 `### ` 行起，
*    **到下一个 `###` 或 `##` 之前**（`##` 不会出现在这里，因为入参就是"一节的正文"）。
* ⚠️ **首个 `###` 之前的内容**（如节首说明）**单独算作一节**——
*    否则那部分字数**凭空消失**，两次报告加不起来会让调用方以为丢了东西。
* @param sectionLines - **含 `##` 标题行**的那一节的全部行。
* @returns 子节体量（没有 `###` ⇒ 空数组）。
*/
function measureSubsections(sectionLines) {
	const marks = [];
	for (let i = 0; i < sectionLines.length; i += 1) if (/^###\s+/.test(sectionLines[i] ?? "")) marks.push(i);
	if (marks.length === 0) return [];
	const out = [];
	for (let m = 0; m < marks.length; m += 1) {
		const from = marks[m] ?? 0;
		const to = m + 1 < marks.length ? marks[m + 1] ?? sectionLines.length : sectionLines.length;
		const chunk = sectionLines.slice(from, to);
		const title = (chunk[0] ?? "").replace(/^###\s+/, "").trim();
		out.push({
			title,
			chars: sectionCharCount(chunk),
			children: []
		});
	}
	return out.sort((a, b) => b.chars - a.chars);
}
/**
* ⭐ **列出本次合并中"沿用了旧内容"的节**（决策 109 的回执要报出来）。
*
* 🔴 **为什么要报**：合并让"没写"变成**安全的默认**（保留旧值），
*    但也带来一个新的静默风险——**模型以为清空了、其实没清**，
*    或者**忘了写某个该更新的节**。
*    ⇒ 把它列出来，模型扫一眼就知道"这些节这轮没动过"。
* @param incoming - 本次 `doc`。
* @param existing - 旧叙事。
* @returns 沿用旧内容的节标题（按旧文档顺序）。
*/
function inheritedIn(incoming, existing) {
	const touched = new Set(splitH2(narrativeFromDocBare(incoming)).map((s) => s.title));
	return splitH2(existing).map((s) => s.title).filter((t) => !touched.has(t));
}
/**
* ⭐⭐ **列出本次合并中"被替换（或清空）"的节，并给出字数变化**。
*
* 🔴🔴 **为什么必须有这一半**（真实事故，2026-09-19）：
*    原来的回执**只报"沿用的节"**，于是**"某节被整节替换"这件事在回执里完全不可见**。
*    实际发生的事故是：模型把"只写有变化的节"理解成"只写这次**新增的那一小段**"，
*    ⇒ 写了 `## 当前进度` 却只带了新增段 ⇒ 工具按"出现过 = 整节替换"处理
*    ⇒ **该节原有的一大段历史被静默删掉**，而回执只说"其他节沿用了旧内容"，
*    **完全看不出刚有一节被砍掉了一大半**。
*    ⇒ 报出**每个被替换节的字数增减**，这类事故就**当场可见**
*      （"-4200 字符"一眼就不对劲）。
*
* ⚠️ **判据要用"节的正文长度"**，不能用行数——正文里长段落的增删才是信号。
* @param incoming - 本次 `doc`（原始）。
* @param existing - 旧叙事。
* @returns 每项含节标题、旧长度、新长度、差值。
*/
function replacedIn(incoming, existing) {
	const bare = narrativeFromDocBare(incoming);
	/** 本次写了的节 → 合并后的正文（同名多次按 `mergeNarrative` 的规则拼接）。 */
	const touched = /* @__PURE__ */ new Map();
	for (const s of splitH2(bare)) {
		const prev = touched.get(s.title);
		if (prev === void 0) touched.set(s.title, [...s.lines]);
		else prev.push("", ...s.lines);
	}
	/** 旧文档里每节的正文长度（同名取合计，与合并行为一致）。 */
	const oldLen = /* @__PURE__ */ new Map();
	for (const s of splitH2(existing)) oldLen.set(s.title, (oldLen.get(s.title) ?? 0) + s.lines.join("\n").trim().length);
	const out = [];
	for (const [title, lines] of touched) {
		const after = lines.join("\n").trim().length;
		const before = oldLen.get(title);
		if (before === void 0) continue;
		out.push({
			title,
			before,
			after
		});
	}
	return out;
}
/**
* 「判据特征词」——一句里出现任一，就算**候选判据**。
*
* ⚠️ **它只是粗筛，必然有误报**（正文里"引用"一条判据时也会命中）。
*    ⇒ 所以整个机制**只用来警告，绝不用来拒绝**（见 `orphanJudgments` 的注释）。
*/
const JUDGMENT_RE = /必须|不许|不得|禁止|不要|会被拒|判据|务必|不能|绝不|一律/;
/**
* 归一化：**只留汉字/字母/数字**，把标点、空白、强调符号全部剥掉。
*
* 🔴 **为什么必须剥**：判据句里全是 `**加粗**`、`⭐`、全角标点；
*    不剥的话"同一句话"在两次渲染里会因格式差异而**永远匹配不上**（假孤本）。
* @param s - 原文本。
* @returns 归一化后的字符序列。
*/
function normalizeForCompare(s) {
	return s.replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, "");
}
/** 比对窗口（连续多少字相同就算"别处有"）。 */
const ORPHAN_WINDOW = 12;
/**
* 该片段是否**在对照文本里出现过**（12 字窗口滑动）。
*
* ⚠️ **为什么用滑窗而不是整句相等**：同一件事在别处往往是**改写**过的，
*    整句比对会把"已备份"误判成"孤本" ⇒ 报警过载 ⇒ 噪音（本项目已验证噪音的代价）。
* @param text - 待検片段。
* @param pool - 对照文本（已归一化）。
* @returns 出现过为 true。
*/
function appearsIn(text, pool) {
	const n = normalizeForCompare(text);
	if (n.length < ORPHAN_WINDOW) return false;
	for (let i = 0; i + ORPHAN_WINDOW <= n.length; i += 3) if (pool.includes(n.slice(i, i + ORPHAN_WINDOW))) return true;
	return false;
}
/**
* ⭐⭐ **数出某节里"孤本判据"的条数**——只在这一节出现、别处没有对应表述的判据。
*
* 🔴🔴 **为什么需要它**（决策 127 的核心；这是"压缩悬崖"的机制化防线）：
*    实测某项目交接文档：「当前进度」占 **46%**（唯一的主要膨胀源），其中
*    · 出现 20 个知识 id ⇒ **全部在库里有封面**（细节有备份 ⇒ **可压**）；
*    · 含判据特征词的 **42 行**里，**只有 5 行**在别的节里有对应表述
*      ⇒ **37 条判据是"孤本"**（删了就**永久丢失**）。
*    ⚠️ **压缩悬崖的成因**：孤本判据与流水账**混在同一节、长得也像**，
*    一旦按"整节归并"处理，**被磨掉的恰恰是那 37 条**。
*
* ⭐ **判据**：**不是"它属于什么类型"，而是"别处有没有备份"**。
* @param section - 待测节的正文行。
* @param otherText - 文档**其余部分**的文本（作为"别处有没有"的对照池）。
* @returns 孤本判据的条数。
*/
function coupleJudgments(section, otherText) {
	const pool = normalizeForCompare(otherText);
	let n = 0;
	for (const raw of section) {
		const line = raw.trim();
		if (line.length < 10) continue;
		if (!JUDGMENT_RE.test(line)) continue;
		if (!appearsIn(line.replace(/`[0-9a-f]{8}`/g, ""), pool)) n += 1;
	}
	return n;
}
/**
* ⭐ **统计某节在"合并前 / 合并后"两个版本里的孤本判据条数**（决策 127 的回执用）。
*
* 🔴 **只对「当前进度」做**——因为它是唯一的主要膨胀源，也是唯一会做"归并压缩"的节；
*    其余五节按规范**只做语义精炼、不许删条目**（见 §5.2 块 E）。
* @param before - 合并前的完整叙事。
* @param after - 合并后的完整叙事。
* @returns 两版各自的孤本判据条数；任一侧取不到该节时为 `undefined`。
*/
function orphanJudgments(before, after) {
	const target = PROGRESS_TITLE;
	const pick = (narrative) => {
		for (const s of splitH2(narrative)) if (s.title === target) return s.lines;
	};
	const a = pick(before);
	const b = pick(after);
	if (a === void 0 || b === void 0) return void 0;
	const others = splitH2(before).filter((s) => s.title !== target).map((s) => s.lines.join("\n")).join("\n");
	const othersAfter = splitH2(after).filter((s) => s.title !== target).map((s) => s.lines.join("\n")).join("\n");
	return {
		before: coupleJudgments(a, `${others}\n${othersAfter}`),
		after: coupleJudgments(b, `${others}\n${othersAfter}`)
	};
}
/**
* ⭐ 校验一条 entry 的**形状**（**纯参数，不读库**）。
*
* 🔴 **为什么抽成独立函数**（决策 103 / §3.11.6）：同一套规则要用于**两处**——
*   ① `pre-execute` 闸门（**提前**拦截，不读盘、不构建，失败理由直接回给模型）；
*   ② `runHandoff` 内部（§3.9 的硬校验，防"直接调工具函数"绕过闸门）。
*   ⚠️ **必须是同一份实现**——两处各写一遍必然漂移（本项目已多次踩到"多副本"坑）。
*
* ⚠️ **只做 schema 表达不了的那部分**（长度/格式/正则）：
*   `required`、类型这些交给工具参数 schema，不在这里重复。
* @param e - 一条 entry 入参。
* @param label - 报错前缀（如 `entries[0]`）。
* @returns 问题列表（空 = 通过）。
*/
function checkEntryShape(e, label) {
	const out = [];
	const slug = (e.slug ?? "").trim();
	if (!SLUG_RE.test(slug)) out.push(`${label} 的 slug 不合规：「${slug}」——须为**全小写英文/数字/连字符**，2–48 字符（中文会被过滤掉，不要用拼音）。`);
	const title = (e.title ?? "").trim();
	if (title === "") out.push(`${label} 缺 title（必填，2–48 字符）`);
	else if (charCount(title) < 2) out.push(`${label} 的 title 过短：${charCount(title)} 字符（下限 2）`);
	else if (charCount(title) > 48) out.push(`${label} 的 title 超长：${charCount(title)} 字符（上限 48）`);
	if (e.desc === void 0 || e.desc.trim() === "") out.push(`${label} 缺 desc（必填）`);
	else if (charCount(e.desc) > 200) out.push(`${label} 的 desc 超长：${charCount(e.desc)} 字符（上限 200）`);
	if ((e.tags ?? []).length === 0) out.push(`${label} 的 tags 为空（至少 1 个）`);
	if (e.ext === true) {
		const ref = (e.ref ?? "").trim();
		if (ref === "") out.push(`${label} 是外部引用（ext: true）但没给 \`ref\`（须为**库外文档的绝对路径**）`);
		else if (!isAbsolutePath(ref)) out.push(`${label} 的 \`ref\` 不是绝对路径：「${ref}」——外部引用必须填绝对路径`);
	} else {
		if ((e.ref ?? "").trim() !== "") out.push(`${label} 给了 \`ref\` 但没设 \`ext: true\`——\`ref\` 只在**外部引用**时由你填；落库条目的 \`ref\` 由工具自动生成，请删掉它（或补 \`ext: true\` 走外部引用）。`);
		const bodyText = (e.body ?? "").trim();
		if (bodyText === "") out.push(`${label} 的 body 为空`);
		else if (!/^#{1,3}\s+\S/m.test(bodyText)) out.push(`${label} 的 body 里找不到标题行（\`###\` / \`##\` / \`#\` 开头）。\n    设计要求正文以标题行开头；若你确实是中途写断了，请补完整再提交。`);
	}
	const rawKind = (e.kind ?? "").trim();
	if (rawKind !== "" && !isEntryKind(rawKind)) out.push(`${label} 的 kind 取值非法：「${rawKind}」——只能是 ${selectableKindList()} 之一，或留空（留空 = 未分类）。`);
	return out;
}
/**
* ⭐ 校验一条 adopt 的**形状**（纯参数，不读库）。与 `checkEntryShape` 同一套理由。
* @param a - 一条 adopt 入参。
* @param label - 报错前缀（如 `adopt[0]`）。
* @returns 问题列表（空 = 通过）。
*/
function checkAdoptShape(a, label) {
	const out = [];
	const slug = (a.slug ?? "").trim();
	if (!SLUG_RE.test(slug)) out.push(`${label} 的 slug 不合规：「${slug}」——须为全小写英文/数字/连字符，2–48 字符`);
	const title = (a.title ?? "").trim();
	if (title === "") out.push(`${label} 缺 title（必填，2–48 字符）`);
	else if (charCount(title) < 2) out.push(`${label} 的 title 过短：${charCount(title)} 字符（下限 2）`);
	else if (charCount(title) > 48) out.push(`${label} 的 title 超长：${charCount(title)} 字符（上限 48）`);
	if (a.desc === void 0 || a.desc.trim() === "") out.push(`${label} 缺 desc（必填）`);
	else if (charCount(a.desc) > 200) out.push(`${label} 的 desc 超长：${charCount(a.desc)} 字符（上限 200）`);
	if ((a.tags ?? []).length === 0) out.push(`${label} 的 tags 为空（至少 1 个）`);
	if ((a.ref ?? "").trim() === "") out.push(`${label} 缺 ref（原文件路径）`);
	const rawKind = (a.kind ?? "").trim();
	if (rawKind !== "" && !isEntryKind(rawKind)) out.push(`${label} 的 kind 取值非法：「${rawKind}」——只能是 ${selectableKindList()} 之一，或留空。`);
	return out;
}
/**
* ⭐⭐ **形状校验的聚合入口**（纯参数、不读库、不抛异常）。
*
* 供 `pre-execute` 闸门与 `runHandoff` **共用**（决策 103 / §3.11.6）。
* 🔴 **只返回问题，不做任何 I/O**——闸门必须够快（它拦在工具体之前）。
* @param entries - 本次的 entries（可为 `undefined`）。
* @param adopt - 本次的 adopt（可为 `undefined`）。
* @returns 问题列表（空 = 通过）。
*/
function checkKnowledgeShape(entries, adopt) {
	const out = [];
	const es = entries ?? [];
	for (let i = 0; i < es.length; i += 1) {
		const e = es[i];
		if (e === void 0) continue;
		out.push(...checkEntryShape(e, `entries[${i}]`));
	}
	const as = adopt ?? [];
	for (let i = 0; i < as.length; i += 1) {
		const a = as[i];
		if (a === void 0) continue;
		out.push(...checkAdoptShape(a, `adopt[${i}]`));
	}
	return out;
}
/**
* ⭐⭐ **按 `slug` 在库里找出已存在的知识**（决策 104）。
*
* ── 为什么需要它 ────────────────────────────────────────────────────────────
* `schema.ts` 里 `slug` 的注释写着"用于重建文件名**与查重**"，
* §6 协议也写着"写之前先看已有内容、**不要写出重复的知识**"——
* 但**实现只做了后者（靠模型自觉），漏了前者（工具硬查）**。
* ⇒ 实测：同一入参调两次会得到**两条知识**（`id` 每次 `randomUUID()`，而 `slug` 从未被查）。
*
* ── ⚠️ 为什么必须读条目文档、不能只看封面 ──────────────────────────────────
* `scanLibrary()` 的 `covers` **只有封面**，而 **`slug` 只存在
* `entries/<slug>-<uuid8>.md` 的 frontmatter 里**（封面上没有这个字段）。
* ⇒ 只能逐一读条目文档。
*
* ⚠️ **只查本项目**：跨项目偶有同名 slug 是允许的（不同项目的知识本就独立）。
* @param covers - 当前项目的封面。
* @param want - 要查的 slug 集合（小写已 trim）。
* @returns slug → 已有封面（同 slug 有多条时取**第一条**，兼容历史重复数据）。
*/
async function findEntriesBySlug(covers, want) {
	const found = /* @__PURE__ */ new Map();
	if (want.size === 0) return found;
	for (const c of covers) {
		if (found.size === want.size) break;
		if (c.ext) continue;
		const slug = (await loadEntryDoc(c.ref, c.ext))?.frontmatter.slug ?? "";
		if (slug !== "" && want.has(slug) && !found.has(slug)) found.set(slug, c);
	}
	return found;
}
/**
* 执行一次 handoff（§7.1 的全部步骤）。
* @param req - 入参。
* @param env - 会话与配置。
* @returns 执行结果。
*/
async function runHandoff(req, env) {
	const projectId = req.project.trim();
	if (projectId === "") return fail("project 不能为空。");
	const plan = planSteps(req.step);
	if (plan.error !== void 0) return fail(plan.error);
	const steps = plan.steps;
	const want = (s) => steps.has(s);
	const snapshot = await scanLibrary();
	const existingProjects = snapshot.projects.map((p) => p.id);
	const isNewProject = !existingProjects.includes(projectId);
	const readAtStart = await pendingSnapshots(env.sessionId);
	const readCountAtStart = readAtStart.length;
	const readTitlesAtStart = readAtStart.map((s) => s.title);
	const wantNarrative = want("narrative");
	const hasDocArg = req.doc !== void 0 && req.doc.trim() !== "";
	const turnNow = env.turn ?? -1;
	if (wantNarrative && hasDocArg && !isNewProject) {
		const rec = await findDocRead(env.sessionId, projectId, turnNow);
		if (rec === void 0) return fail(`写交接文档（\`doc\`）之前，**必须先在本次对话轮次里读一遍项目 \`${projectId}\` 的现有交接文档**。\n⚠️ **凭记忆重写必然压缩、丢细节**（这正是"累积的活文档"要避免的）；
⚠️ **上一轮读过也不算**——上一轮很可能刚改过这份文档，要看**最新**的内容。

请先调用：
  \`memj_read({ project: "${projectId}" })\`\n它会把现有叙事按节返回；读完整篇（或逐节读完）之后再重调本工具。
💡 只做 \`knowledge\` / \`theme\` 步时**不需要**这一步。`);
		if (!rec.full) {
			const allTitles = narrativeTopSections((await loadProjectDoc(projectId))?.narrative ?? "");
			const missing = allTitles.filter((t) => !rec.sections.includes(t));
			if (allTitles.length > 0 && missing.length > 0) return fail(`你读了项目 \`${projectId}\` 的交接文档，但**没有读全**——还差这些节：${missing.map((s) => `\`${s}\``).join("、")}。\n⚠️ 漏读的节可能在 \`doc\` 里被**整节覆盖掉**（"按节合并"只保护**没写**的节）。

请补齐：\`memj_read({ project: "${projectId}", section: "..." })\`，或直接 \`memj_read({ project: "${projectId}", full: true })\` 通读整篇。`);
		}
	}
	const offStep = [];
	if (!want("narrative")) {
		if (req.doc !== void 0 && req.doc.trim() !== "") offStep.push("`doc`");
		if (!isNewProject && req.projectDesc !== void 0 && req.projectDesc.trim() !== "") offStep.push("`projectDesc`");
	}
	if (!want("theme") && (req.newThemes ?? []).length > 0) offStep.push("`newThemes`");
	if (!want("theme") && (req.linkedSnapshots ?? []).length > 0) offStep.push("`linkedSnapshots`");
	if (!want("narrative") && (req.docSection ?? "").trim() !== "") offStep.push("`docSection`");
	if (!want("narrative") && req.docOp !== void 0) offStep.push("`docOp`");
	if (!want("knowledge") && ((req.entries ?? []).length > 0 || (req.adopt ?? []).length > 0)) offStep.push("`entries` / `adopt`");
	if (offStep.length > 0) return fail(`参数与 \`step\` 不一致：本次 step 是 ${[...steps].map((s) => `\`${s}\``).join("、")}（原始输入：\`${String(req.step)}\`），但你给了 ${offStep.join("、")}。\n⚠️ 这些参数**不会被处理**。为避免"你以为写了、其实没写"，这里直接拒绝。
请二选一：把对应步骤加进 \`step\`，或去掉这些参数。`);
	let similarProjects = [];
	if (isNewProject) {
		similarProjects = findSimilarIds(projectId, existingProjects, env.config.similarEditDistance);
		if (similarProjects.length > 0 && req.confirmCreate !== true) return {
			...fail(`库里已有相似的项目 id：${similarProjects.map((s) => `\`${s}\``).join("、")}。\n你是想**更新**它，还是要**新建** \`${projectId}\`？\n若要新建，请带 \`confirmCreate: true\` 再调一次。`),
			similarProjects
		};
		if (req.projectDesc === void 0 || req.projectDesc.trim() === "") return {
			...fail(`新建项目 \`${projectId}\` 时必须给 \`projectDesc\`（项目描述，≤200 字符）。`),
			similarProjects
		};
		if (charCount(req.projectDesc) > 200) return {
			...fail(`projectDesc 超长：${charCount(req.projectDesc)} 字符（上限 200）。`),
			similarProjects
		};
	}
	const pendingThemes = want("theme") ? req.newThemes ?? [] : [];
	const allThemeIds = [...snapshot.themeIds];
	let similarThemes = [];
	const looseThemes = env.config.themeCreation === "loose";
	const linkedIds = new Set((want("theme") ? req.linkedSnapshots ?? [] : []).map((s) => s.trim()).filter((s) => s !== ""));
	if (linkedIds.size > 0 && want("theme")) {
		const snapsForCheck = await pendingSnapshots(env.sessionId);
		const known = new Map(snapsForCheck.map((s) => [s.entryId, s]));
		const linkedIssues = [];
		for (const id of linkedIds) {
			const s = known.get(id);
			if (s === void 0) linkedIssues.push(`\`${id}\` **不在本会话未消费的读快照里**（可能拼错、或那条快照已被消费/已清理）`);
			else if (s.project === projectId) linkedIssues.push(`\`${id}\` 属于**本项目自己**（\`${s.project}\`）——本项目知识无需"补挂"；只有**别项目**的快照才能补挂到主题上`);
			else if (s.project === "") linkedIssues.push(`\`${id}\` **没有项目归属**，不能作为跨项目证据`);
		}
		if (linkedIssues.length > 0) return {
			...fail("`linkedSnapshots` 里有**无效的 id**，整份未写入：\n" + linkedIssues.map((s, i) => `${i + 1}. ${s}`).join("\n") + "\n\n⚠️ 本会话未消费的快照 id 请用 `memj_snapshots` 取（它会把别项目的筛出来）。"),
			similarProjects
		};
	}
	if (pendingThemes.length > 0) {
		if (!looseThemes) {
			const snapshots = await pendingSnapshots(env.sessionId);
			if (snapshots.filter((s) => s.project !== projectId && s.project !== "" && linkedIds.has(s.entryId)).length === 0) return {
				...fail("要新建主题，必须有**跨项目证据**：本会话需读过**别的项目**的知识，**并把那条列进 `linkedSnapshots`**。\n" + (snapshots.some((s) => s.project !== projectId && s.project !== "") ? "⚠️ 你确实读过别项目的知识，但**一条都没列进 `linkedSnapshots`** （省略该参数 = 一条都不挂）。\n   请先逐条判断\"它确实和本次相关吗\"，把相关的那些 id 列进去。\n" : `当前未消费快照里没有一条的 project ≠ \`${projectId}\`。\n`) + "⚠️ 注意：这里只校验这一件事——只要有一条引自别项目的快照**且被你列出**，「≥2 个项目」就已经是既成事实，不需要再数什么。\n若本项目此前已关联主题，也可以直接挂靠已有主题（挂靠无门槛）。\n💡 若希望**不受此限制、由你自行判断新建主题**，可由人在 memj 记忆库页面的「⚙ 设置」里把模式切为**宽松**。"),
				similarProjects
			};
		}
		for (const t of pendingThemes) {
			if (t.id.trim() === "") return {
				...fail("newThemes 里有 id 为空的主题。"),
				similarProjects
			};
			if (t.desc.trim() === "") return {
				...fail(`新建主题 \`${t.id}\` 时必须给 \`desc\`（≤200 字符）。`),
				similarProjects
			};
			if (charCount(t.desc) > 200) return {
				...fail(`主题 \`${t.id}\` 的 desc 超长：${charCount(t.desc)} 字符（上限 200）。`),
				similarProjects
			};
			const similar = findSimilarIds(t.id, allThemeIds, env.config.similarEditDistance);
			if (similar.length > 0) similarThemes.push(...similar);
		}
		if (similarThemes.length > 0) return {
			...fail(`库里已有近义的主题：${[...new Set(similarThemes)].map((s) => `\`${s}\``).join("、")}。\n**优先并入已有主题**，不要另起近义主题。确要新建请改一个不近义的 id。`),
			similarProjects,
			similarThemes: [...new Set(similarThemes)]
		};
	}
	const entryReqs = want("knowledge") ? req.entries ?? [] : [];
	const adoptReqs = want("knowledge") ? req.adopt ?? [] : [];
	const sessionId = env.sessionId;
	/**
	* ⭐ **本次调用统一使用的时间戳**（决策 119）。
	* ⚠️ 一次调用里所有条目共用同一个值——否则它们在时间上会"参差不齐"，
	* 而它们**本来就是同一次沉淀**。
	*/
	const nowIso = (/* @__PURE__ */ new Date()).toISOString();
	/** 本次要写入/更新的项目文档里的封面（含保留的旧封面）。 */
	const existing = await loadProjectDoc(projectId);
	const keptCovers = existing?.covers ?? [];
	const isNewProjForTpl = existing === void 0;
	let newSections = [];
	let templateId = existing?.frontmatter.template ?? "";
	/** ⭐ 本次真正用的那份模板（**只用于回执现报节数**，见下方赋值处）。 */
	let appliedTemplate;
	/**
	* ⭐⭐⭐ **该文档的节名**（所有按节工作的机制都用它）。
	*
	* 🔴🔴 **2026-10-12 改：正文优先，frontmatter 降级为兼容读**（`docSectionsOf`）。
	*   起因是一次实测复现的损坏：`rebuildDerivedLayers()` 汇总 `themes:` 时
	*   **手工重写 frontmatter**，而它那张字段表里**没有 `sections`**
	*   ⇒ 一旦触发重写就把 `sections` / `truncateSections` / `template` 整行抹掉
	*   ⇒ 那时"节名"只能回落默认六节 ⇒ **自定义模板的文档被按默认六节理解**
	*   ⇒ 下次 handoff 只更新一节时，**六个默认空壳节被插到最前面**
	*   （实测 6 → 12 节；生产 `metax-688802` 的镜像里留过一次 6 → 43 节的真现场）。
	*   ⭐ 正文是 `rebuildDerivedLayers()` **唯一逐字保留**的东西（实测 sha256 相同）
	*   ⇒ 把权威放在正文，这**整类**失败模式从结构上消失。
	*/
	let docSections = docSectionsOf(existing?.narrative ?? "");
	if (isNewProjForTpl) {
		const wantTpl = (req.template ?? "").trim();
		if (wantTpl !== "") {
			const t = wantTpl === "default" ? await loadDefaultTemplate() : await loadTemplate(wantTpl);
			if (t === void 0) return {
				...fail(`模板 \`${wantTpl}\` 不存在。可用：${(await listTemplates()).map((x) => `\`${x.id}\``).join("、")}`),
				similarProjects: []
			};
			const tErrs = validateTemplate(t);
			if (tErrs.length > 0) return {
				...fail(`模板 \`${wantTpl}\` 不合法（它坏了，不是你的输入问题）：\n${tErrs.map((e) => `  · ${e}`).join("\n")}`),
				similarProjects: []
			};
			newSections = templateSectionNames(t);
			templateId = wantTpl === "default" ? "" : wantTpl;
			docSections = newSections;
			appliedTemplate = t;
		} else {
			const t = await loadDefaultTemplate();
			newSections = templateSectionNames(t);
			docSections = newSections;
			appliedTemplate = t;
		}
	}
	/**
	* ⭐⭐ **本次真正用的那份模板**（回执要据它现报"几节"，**不写死数字**）。
	* ⚠️ 新建且没给 `template` ⇒ 取"当前生效的默认模板"（它**也落盘、用户可能改过**）。
	* ⚠️ 已有项目 ⇒ 保持 `undefined`（那时回执走"已更新"分支，不报骨架）。
	*/
	if (isNewProjForTpl && appliedTemplate === void 0) appliedTemplate = await loadDefaultTemplate();
	const newCovers = [];
	/** ⭐ 本次**覆盖**掉的知识（决策 104）——回执要单独报，语义与"新增"不同。 */
	const overwritten = [];
	/**
	* 待落盘的正文（先构建，校验过了再写）。
	* ⭐ `overwrite: true` ⇒ **覆盖已有的那条**（按原 `ref` 就地写，不产生第二个文件）。
	*/
	const pendingWrites = [];
	const issues = [];
	if (existing !== void 0 && (existing.frontmatter.archivedAt ?? "") !== "") issues.push(`项目 \`${projectId}\` **已归档**，不可选：不能往它下面新增或更新知识，也不能改它的文档。\n   如需继续沉淀，请先让用户在「归档」标签页恢复该项目。`);
	/**
	* ⭐⭐ **本次申请加入全局（提名）的封面 id**（方案 A，2026-09-18）。
	*
	* 🔴 **为什么需要这个集合**：`entries[].global = true` 的语义是"**申请**加入全局"，
	* 而方案 A 下**封面上的 `global` 只由"人批准"置位**（提名时不置位）。
	* ⇒ 于是"是否申请了全局"就**不能再从 `c.global` 读**（它恒为 false），
	* 必须单独记一份**意图**，供提名登记、三空校验、回执三处使用。
	* ⚠️ 这正是"把意图与状态分开"——旧实现用 `global` 一个字段兼表两件事，
	* 才有"待批时字段撒谎"的问题。
	*/
	const nominationIntent = /* @__PURE__ */ new Set();
	const themeIdSet = /* @__PURE__ */ new Set([...allThemeIds, ...pendingThemes.map((t) => t.id.trim())]);
	/**
	* ⭐⭐⭐ **主题 id → desc**（决策 156：挂靠依据核对要用）。
	*
	* 🔴 为什么要现读：**主题的 desc 存在 `THEME-<id>.md` 的 frontmatter 里，
	*    不在 `snapshot` 上**（`api.ts` 里同一处也注明了这点）。
	* ⚠️ 读失败/不存在 ⇒ 退化成空串 ⇒ 那条的核对会报"引不出 desc"（**宁可多警告**）。
	*/
	const themeDescMap = /* @__PURE__ */ new Map();
	for (const id of themeIdSet) {
		if (id === "") continue;
		try {
			const fm = await loadThemeFrontmatter(id);
			themeDescMap.set(id, (fm?.desc ?? "").trim());
		} catch {
			themeDescMap.set(id, "");
		}
	}
	/**
	* ⭐ **挂靠依据的警告**（决策 156）——**警告，不阻塞写入**（用户 2026-09-26 裁定）。
	* ⚠️ 与 `issues` 分开：`issues` 会**让整份不写入**，而这里只是"回执里告诉你怎么改"。
	*/
	const themeWhyWarnings = [];
	const wantSlugs = /* @__PURE__ */ new Set();
	for (const e of entryReqs) {
		const s = (e?.slug ?? "").trim();
		if (s !== "") wantSlugs.add(s);
	}
	for (const a of adoptReqs) {
		const s = (a?.slug ?? "").trim();
		if (s !== "") wantSlugs.add(s);
	}
	const existingBySlug = await findEntriesBySlug(keptCovers, wantSlugs);
	for (let i = 0; i < entryReqs.length; i += 1) {
		const e = entryReqs[i];
		if (e === void 0) continue;
		const label = `entries[${i}]`;
		const slug = (e.slug ?? "").trim();
		issues.push(...checkEntryShape(e, label));
		const title = (e.title ?? "").trim();
		const rawKind = (e.kind ?? "").trim();
		const themes = (e.theme ?? []).map((t) => t.trim()).filter((t) => t !== "");
		for (const t of themes) if (!themeIdSet.has(t)) issues.push(`${label} 的 theme 填了不存在的主题 \`${t}\`——要新建主题请用 \`newThemes\` 参数，不要直接填一个新 id。`);
		if (themes.length > 0) {
			const why = (e.themeWhy ?? "").trim();
			if (why === "") themeWhyWarnings.push(`${label}（\`${slug}\`）挂了主题 ${themes.map((t) => `\`${t}\``).join("、")}，但**没给 \`themeWhy\`**。
    ⇒ 补一句：**引该主题 \`desc\` 里的话** + 说明这条知识**怎么服务那个场景**。
    ⚠️ 目的：挂靠是给「该主题 desc 描述下的**别的项目**」用的 ——
      若这条**只对本项目成立**（本项目自己的改动/接口/缺陷/实测数据），**应该摘掉主题**。`);
			else if (!themes.some((t) => quoteAppearsIn(why, themeDescMap.get(t) ?? ""))) {
				const descs = themes.map((t) => `      · \`${t}\`：${(themeDescMap.get(t) ?? "（该主题没有 desc）").slice(0, 90)}…`).join("\n");
				themeWhyWarnings.push(`${label}（\`${slug}\`）的 \`themeWhy\` **没有引用所挂主题 desc 里的原文**。\n    你写的：${why.slice(0, 100)}\n    所挂主题的 desc：\n${descs}\n    ⇒ 请**从上面 desc 里逐字引一段（≥12 字符）**再说明用途；
    ⚠️ 若引不出来，说明你**没真的比对过那个 desc** ⇒ 更该问："这条对那个主题下的**所有项目**都有用吗？"`);
			}
		}
		const hit = slug === "" ? void 0 : existingBySlug.get(slug);
		if (hit !== void 0 && e.overwrite !== true) {
			issues.push(`${label} 的知识 \`${slug}\` **已存在**（id \`${hit.id.slice(0, 8)}\`，标题「${hit.title}」）。\n    若你确实要**替换**它，请在**这一条**上加 \`overwrite: true\` 再调一次；
    若想另存一条新知识，请改一个不同的 \`slug\`。`);
			continue;
		}
		const id = hit?.id ?? randomUUID();
		const isExternal = e.ext === true;
		const wantsGlobal = e.global === true;
		if (wantsGlobal) nominationIntent.add(id);
		const cover = {
			id,
			project: projectId,
			theme: themes,
			global: false,
			kind: isEntryKind(rawKind) ? rawKind : "",
			tags: (e.tags ?? []).map((t) => t.trim()).filter((t) => t !== ""),
			title,
			desc: e.desc ?? "",
			ref: isExternal ? (e.ref ?? "").trim() : hit?.ref ?? entryRelPath(slug === "" ? "entry" : slug, id),
			ext: isExternal,
			createdAt: hit !== void 0 && (hit.createdAt ?? "") !== "" ? hit.createdAt : nowIso,
			updatedAt: nowIso,
			archivedAt: hit !== void 0 ? hit.archivedAt ?? "" : ""
		};
		if (hit !== void 0 && (hit.archivedAt ?? "") !== "") issues.push(`${label} 已归档，不可编辑（请先在「归档」标签页恢复它）`);
		if (cover.project === "" && cover.theme.length === 0 && !wantsGlobal) issues.push(`${label} 三空：project 空 + theme 空 + 未申请全局 ⇒ 无任何归属层`);
		if (hit !== void 0) {
			const at = keptCovers.findIndex((c) => c.id === hit.id);
			if (at >= 0) keptCovers[at] = cover;
			overwritten.push(cover);
		} else newCovers.push(cover);
		pendingWrites.push({
			cover,
			slug: slug === "" ? "entry" : slug,
			body: e.body ?? "",
			overwrite: hit !== void 0,
			skipWrite: isExternal
		});
	}
	for (let i = 0; i < adoptReqs.length; i += 1) {
		const a = adoptReqs[i];
		if (a === void 0) continue;
		const label = `adopt[${i}]`;
		const slug = (a.slug ?? "").trim();
		issues.push(...checkAdoptShape(a, label));
		const titleA = (a.title ?? "").trim();
		const rawKindA = (a.kind ?? "").trim();
		const themes = (a.theme ?? []).map((t) => t.trim()).filter((t) => t !== "");
		for (const t of themes) if (!themeIdSet.has(t)) issues.push(`${label} 的 theme 填了不存在的主题 \`${t}\``);
		let body = "";
		if (a.mode === "copy") {
			const text = await readTextIfExists(a.ref);
			if (text === void 0) issues.push(`${label} 要入库的文件读不到：${a.ref}`);
			else body = `> 本文原为外部文档：\`${a.ref}\`\n> 于 ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)} 整体拷入库。以本副本为准，外部文件后续改动不会再同步。

` + text;
		} else {
			if ((a.body ?? "").trim() === "") issues.push(`${label} 的 mode 是 extract，但没给 body`);
			body = a.body ?? "";
		}
		const hitA = slug === "" ? void 0 : existingBySlug.get(slug);
		if (hitA !== void 0 && a.overwrite !== true) {
			issues.push(`${label} 的知识 \`${slug}\` **已存在**（id \`${hitA.id.slice(0, 8)}\`，标题「${hitA.title}」）。\n    若你确实要**替换**它，请在这一条上加 \`overwrite: true\` 再调一次；
    若想另存一条，请改一个不同的 \`slug\`。`);
			continue;
		}
		const id = hitA?.id ?? randomUUID();
		const wantsGlobalA = a.global === true;
		if (wantsGlobalA) nominationIntent.add(id);
		const cover = {
			id,
			project: projectId,
			theme: themes,
			global: false,
			kind: isEntryKind(rawKindA) ? rawKindA : "",
			tags: (a.tags ?? []).map((t) => t.trim()).filter((t) => t !== ""),
			title: titleA,
			desc: a.desc ?? "",
			ref: hitA?.ref ?? entryRelPath(slug === "" ? "entry" : slug, id),
			ext: false,
			createdAt: hitA !== void 0 && (hitA.createdAt ?? "") !== "" ? hitA.createdAt : nowIso,
			updatedAt: nowIso,
			archivedAt: hitA !== void 0 ? hitA.archivedAt ?? "" : ""
		};
		if (hitA !== void 0 && (hitA.archivedAt ?? "") !== "") issues.push(`${label} 已归档，不可编辑（请先在「归档」标签页恢复它）`);
		if (cover.project === "" && cover.theme.length === 0 && !wantsGlobalA) issues.push(`${label} 三空：project 空 + theme 空 + 未申请全局`);
		if (hitA !== void 0) {
			const atA = keptCovers.findIndex((c) => c.id === hitA.id);
			if (atA >= 0) keptCovers[atA] = cover;
			overwritten.push(cover);
		} else newCovers.push(cover);
		pendingWrites.push({
			cover,
			slug: slug === "" ? "entry" : slug,
			body,
			overwrite: hitA !== void 0
		});
		if (a.ref !== void 0) for (let k = keptCovers.length - 1; k >= 0; k -= 1) {
			const c = keptCovers[k];
			if (c !== void 0 && c.ext && c.ref === a.ref) keptCovers.splice(k, 1);
		}
	}
	const existingIds = new Set(snapshot.covers.map((c) => c.cover.id));
	for (const c of newCovers) if (existingIds.has(c.id)) issues.push(`封面 id 与库里已有条目重复：${c.id}`);
	if (issues.length > 0) return {
		...fail(`写入校验未通过，**整份未写入**。请修正后重调：\n` + issues.map((s, i) => `${i + 1}. ${s}`).join("\n")),
		issues,
		similarProjects
	};
	for (const w of pendingWrites) {
		if (w.skipWrite === true) continue;
		if (w.overwrite) {
			if (!await syncEntryFrontmatter(w.cover, w.body)) await writeEntryDoc(w.cover, w.slug, w.body, { sessionId });
		} else await writeEntryDoc(w.cover, w.slug, w.body, { sessionId });
	}
	const projectDesc = req.projectDesc !== void 0 && req.projectDesc.trim() !== "" ? req.projectDesc.trim() : existing?.frontmatter.desc ?? "";
	const hasDoc = req.doc !== void 0 && req.doc.trim() !== "";
	/**
	* ⭐ **按节写也算"本次要动叙事"**（决策 134）。
	*
	* 🔴 **这是我第一版漏掉的**：`narrateNow` 原本只认 `hasDoc`
	*    ⇒ `docSection + docOp:'drop'`（**drop 不需要 `doc`**）会被判成"没给 doc"，
	*    于是**整条按节路径根本进不去**——回执还说"已保留原叙事不动"，
	*    而调用方以为删掉了（实测踩到）。
	* ⚠️ 注意 `drop` 是**唯一不需要 `doc`** 的操作，所以判据不能是 `hasDoc`。
	*/
	const wantsSectionOp = (req.docSection ?? "").trim() !== "";
	const narrateNow = want("narrative") && (hasDoc || wantsSectionOp || existing === void 0);
	const docSectionName = (req.docSection ?? "").trim();
	const docOp = req.docOp ?? "append";
	/** 本次按节操作的结果（回执要回声）。 */
	let sectionOp;
	let sectionOpError = "";
	let sectionEmptyWarn = [];
	if (narrateNow && docSectionName !== "" && existing !== void 0) {
		const docGiven = req.doc !== void 0;
		if (docOp !== "drop" && !docGiven) sectionOpError = `\`docOp: '${docOp}'\` 需要 \`doc\`。\n⚠️ 要**清空**该节：给 \`replace\` + \`doc: ""\`（会留下只有标题的空节，回执会提示）。`;
		else {
			const r = applySectionOp(existing.narrative, docSectionName, docOp, req.doc ?? "");
			if (r.error !== void 0) sectionOpError = r.error;
			else sectionOp = r;
		}
	} else if (narrateNow && docSectionName !== "" && existing === void 0) sectionOpError = "`docSection` 只能用于**已有项目**（新项目没有旧叙事可\"按节改\"）——请直接用 `doc` 给出该项目的各节。";
	if (sectionOpError !== "") return fail(`按节写（\`docSection\`）失败，**整份未写入**：\n${sectionOpError}`);
	/** 按节操作成功时以它为准；否则走原来的"整份 doc 合并"。 */
	const narrative = sectionOp?.narrative !== void 0 ? sectionOp.narrative : narrateNow ? mergeNarrative(narrativeFromDocBare(req.doc), existing?.narrative, docSections) : existing?.narrative ?? narrativeFromDoc(void 0, docSections);
	let withBlocks = narrative;
	if (existing === void 0 && specBlockRange(narrative.split(/\r?\n/)) === void 0) {
		const tpl = (templateId === "" ? await loadDefaultTemplate() : await loadTemplate(templateId)) ?? await loadDefaultTemplate();
		const names = new Set(docSections);
		if (tpl.sections.length > 0 && tpl.sections.every((s) => names.has(s.name))) withBlocks = insertSpecBlocks(narrative, tpl);
	}
	if (sectionOp?.narrative !== void 0 && docOp === "drop") sectionEmptyWarn = findEmptySections(sectionOp.narrative);
	/** ⭐ 本次是否**因为缺 `doc` 而保留了原叙事**（回执要报出来）。
	*  ⚠️ 按节写（`docSection`）不该走这条（它本来就只动一节，不需要整份 `doc`）。 */
	const narrativePreserved = want("narrative") && !hasDoc && !wantsSectionOp && existing !== void 0;
	const usedSectionOp = sectionOp?.narrative !== void 0;
	/** ⭐ **本次合并里，哪些节沿用了旧内容**（决策 109 的回执要报出来）。 */
	const inheritedSections = !usedSectionOp && narrateNow && existing !== void 0 ? inheritedIn(req.doc, existing.narrative) : [];
	/** ⭐⭐ **本次合并里，哪些节被替换、字数增减多少**——用于"整节被砍掉"当场可见。 */
	const replacedSections = !usedSectionOp && narrateNow && existing !== void 0 ? replacedIn(req.doc, existing.narrative) : [];
	const allCoversBase = [...keptCovers, ...newCovers];
	const keptOrphans = existing?.orphans ?? [];
	const finalNarrative = withBlocks;
	const historyLines = [];
	if (narrateNow) historyLines.push(...reportSectionSizes(finalNarrative));
	const allCovers = allCoversBase;
	const legacySpec = extractSpecSection(existing?.narrative ?? finalNarrative);
	const narrativeBody = cutSpecSection(finalNarrative);
	const finalWithSpec = legacySpec === "" ? narrativeBody : `${narrativeBody.trimEnd()}\n\n${legacySpec}\n`;
	sectionsFromNarrative(narrativeBody);
	await writeProjectDoc(projectId, {
		project: projectId,
		title: existing?.frontmatter.title ?? "",
		desc: projectDesc,
		themes: existing?.frontmatter.themes ?? [],
		createdAt: existing !== void 0 && (existing.frontmatter.createdAt ?? "") !== "" ? existing.frontmatter.createdAt : nowIso,
		updatedAt: nowIso,
		archivedAt: existing?.frontmatter.archivedAt ?? "",
		template: existing !== void 0 ? existing.frontmatter.template ?? "" : templateId,
		truncateSections: existing?.frontmatter.truncateSections ?? []
	}, finalWithSpec, allCovers, keptOrphans);
	const createdThemes = [];
	for (const t of pendingThemes) {
		const id = t.id.trim();
		const prior = await loadThemeFrontmatter(id);
		const covers = allCovers.filter((c) => c.theme.includes(id));
		const projects = covers.map((c) => c.project).filter((p) => p !== "").filter((p, i, arr) => arr.indexOf(p) === i).map((p) => ({
			id: p,
			desc: p === projectId ? projectDesc : ""
		}));
		await writeThemeDoc(id, prior === void 0 ? t.desc : "", covers, projects);
		if (prior === void 0) createdThemes.push(id);
	}
	let snapshotCount = 0;
	/** ⭐ **本次实际补挂的快照**（决策 111：回执要回声，让"漏列"当场可见）。 */
	const linkedApplied = [];
	if (want("theme")) {
		const snapshotsBefore = await pendingSnapshots(sessionId);
		const byId = new Map(snapshotsBefore.map((s) => [s.entryId, s]));
		const toLink = [];
		for (const id of linkedIds) {
			const s = byId.get(id);
			if (s !== void 0 && s.project !== projectId && s.project !== "") toLink.push(id);
		}
		for (const theme of pendingThemes) {
			const themeId = theme.id.trim();
			for (const coverId of toLink) {
				await linkCoverToTheme(coverId, themeId, snapshot);
				if (!linkedApplied.includes(coverId)) linkedApplied.push(coverId);
			}
		}
		snapshotCount = snapshotsBefore.length;
		await consumeSnapshots(sessionId, env.config.readLogMaxEntries, env.config.readLogTrimCount);
	}
	for (const c of newCovers) {
		if (!nominationIntent.has(c.id)) continue;
		await addNomination({
			entryId: c.id,
			title: c.title,
			desc: c.desc,
			project: c.project,
			nominatedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
	}
	await rebuildDerivedLayers();
	const backupLines = [];
	backupLines.push(...historyLines);
	try {
		const bk = await runVersionSteps({
			projectId,
			at: nowIso,
			existingNarrative: existing?.narrative,
			finalNarrative,
			config: env.config
		});
		backupLines.push(...bk.lines);
	} catch (err) {
		backupLines.push(`\n💾 **版本维护未能完成**（不影响本次 handoff）：${err instanceof Error ? err.message : String(err)}`);
	}
	const lines = [];
	if (isNewProject) {
		const tplLabel = appliedTemplate === void 0 ? "" : `，模板 \`${appliedTemplate.id === "" ? "default" : appliedTemplate.id}\` 共 ${appliedTemplate.sections.length} 节：` + appliedTemplate.sections.map((s) => `\`${s.name}\``).join(" / ");
		lines.push(`⭐ **已新建项目 \`${projectId}\`**（骨架已按模板建立${tplLabel}）。`, `🔴 **末节 \`## 沉淀知识\` 由工具维护**（放封面）—— 它不是叙事节，不要写它。`, ...appliedTemplate !== void 0 && !templateDeclaresArchiving(appliedTemplate) ? [promptText("tpl:guidance-no-trunc", TPL_GUIDANCE_NO_TRUNC)] : [], `库里现有项目：${[...existingProjects, projectId].map((p) => `\`${p}\``).join("、")}`);
	} else lines.push(`已更新项目 \`${projectId}\`（本项目现共 ${allCovers.length} 张封面）。`);
	{
		const secs = splitH2(finalNarrative);
		const sizes = /* @__PURE__ */ new Map();
		for (const s of secs) {
			/**
			* 🔴🔴 **必须走 `sectionCharCount`（剔规范块），不能手写 `join('\n').trim().length`**。
			*
			* ⚠️ **这里原先就是手写的那一句** —— 而 `sectionCharCount` 的注释明写着
			*   *"两处必须同源（同一个函数）—— 否则'该不该截'与'回执报多少'会给出两个数
			*   （本项目最忌'同一事实两个数'）"*。
			*   ⇒ **注释写了规矩，代码没照做**（实测撞上：本项目「当前进度」回执报 **20043**、
			*     而截断判定算出 **20000** —— 恰好在阈值上 ⇒ 回执说"已超过阈值"、
			*     截断说"没超" ⇒ **静默不截且不给任何提示**）。
			* ⭐ 判据：**"两处必须同源"这类注释要配一条断言**，否则它只是愿望。
			* @see sectionCharCount
			*/
			const n = sectionCharCount(s.lines);
			sizes.set(s.title, (sizes.get(s.title) ?? 0) + n);
		}
		if (existing !== void 0 || newSections.length > 0) {
			const actualTop = sectionsFromNarrative(finalNarrative);
			const tplIdNow = (existing?.frontmatter.template ?? templateId ?? "").trim();
			/** 模板契约里的节名（拿不到 ⇒ `undefined` = 无基准、不报异常）。 */
			let contract;
			if (tplIdNow !== "") {
				const t = await loadTemplate(tplIdNow);
				if (t !== void 0) contract = templateSectionNames(t);
			} else contract = NARRATIVE_TITLES;
			const tplLabel = tplIdNow !== "" ? `（模板 \`${tplIdNow}\`）` : "（默认模板）";
			lines.push(`📐 **本项目节名${tplLabel}**：${actualTop.join(" / ")}` + (actualTop.length > 0 ? "" : "（空）"));
			if (contract !== void 0) {
				const missing = contract.filter((t) => !actualTop.includes(t));
				const defaultSet = new Set(NARRATIVE_TITLES);
				const suspicious = actualTop.filter((t) => !contract.includes(t) && defaultSet.has(t));
				if (suspicious.length > 0 || missing.length > 0) lines.push(`\n⚠️ **文档结构异常**（模板契约 = 该文档本来该有的节，现状 = 盘上真实结构）：` + (suspicious.length > 0 ? `\n    🔴 多出了**模板里没有的默认节**：${suspicious.map((t) => `\`${t}\``).join("、")}
       这多半是**误写**——把别套模板的默认节名写进了本项目的文档。` : "") + (missing.length > 0 ? `\n    模板里有、文档里没有：${missing.map((t) => `\`${t}\``).join("、")}` : "") + "\n    🔴 清理：对每个多出的节用 `docSection` + `docOp: 'drop'` 逐个删。");
			}
		}
		const order = docSections;
		const total = [...sizes.values()].reduce((a, b) => a + b, 0);
		if (sizes.size > 0) {
			const shown = [...order.filter((t) => sizes.has(t)), ...[...sizes.keys()].filter((t) => !order.includes(t))];
			const detail = shown.map((t) => `${t} ${sizes.get(t)}`).join(" ｜ ");
			lines.push(`📋 **叙事共 ${total} 字符**，${shown.length} 节：\n    ${detail}`);
			const warn = env.config.progressCharsWarn;
			const keep = env.config.progressCharsKeep;
			lines.push(`    ⭐ 归档阈值优先看**各节自己的规范**（那才是权威）；规范里没写数字时，可参考旧旋钮的默认值：**超过 ${warn} 字符**时归档、**压到 ${keep} 以内**。`);
		}
	}
	if (newCovers.length > 0 || overwritten.length > 0) {
		if (newCovers.length > 0) {
			const extCount = newCovers.filter((c) => c.ext).length;
			const innerCount = newCovers.length - extCount;
			const parts = [];
			if (innerCount > 0) parts.push(`${innerCount} 条正文已落库到 entries/`);
			if (extCount > 0) parts.push(`${extCount} 条**外部引用（正文留在库外，未落库）**`);
			lines.push(`新增 ${newCovers.length} 条知识（${parts.join("；")}）：`);
			for (const c of newCovers) {
				const tags = c.theme.length > 0 ? `｜主题 ${c.theme.join("、")}` : "";
				const g = nominationIntent.has(c.id) ? "｜**global 提名（待批）**" : "";
				const extNote = c.ext ? `｜⭐ **外部引用**：\`${c.ref}\`（**只登记封面，未改动该文件**）` : "";
				lines.push(`  · **${c.title}**（\`${c.id}\`）${tags}${g}${extNote}`);
			}
		}
		if (overwritten.length > 0) {
			lines.push(`⭐ **覆盖了 ${overwritten.length} 条已有知识**（\`overwrite: true\`，就地更新、未新增文件）：`);
			for (const c of overwritten) lines.push(`  · **${c.title}**（\`${c.id}\`）`);
		}
	}
	for (const t of createdThemes) lines.push(`⭐ **已新建主题 \`${t}\`**` + (looseThemes ? "（**宽松模式**：未做跨项目证据校验，依据你的语义判断建成）。" : "（严格模式：已通过跨项目证据校验）。"));
	const nominated = newCovers.filter((c) => nominationIntent.has(c.id)).length;
	if (nominated > 0) lines.push(`已登记 ${nominated} 条 **global 提名**（封面 \`global\` 保持 \`false\`）——⚠️ 只是提名，**需要人在 /memj-review 批准**（批准时才置位）后才进 GLOBAL。`);
	if (createdThemes.length > 0 && pendingThemes.length > 0) {
		const dangling = createdThemes.filter((t) => !newCovers.some((c) => c.theme.includes(t)) && !allCovers.some((c) => c.theme.includes(t)));
		if (dangling.length > 0) lines.push(`⚠️ **矛盾**：你新建了主题 ${dangling.map((t) => `\`${t}\``).join("、")}，但**没有任何知识挂到它**（本次与库里都是）。
    主题的意义是聚合知识；若只是顺手建的，可以考虑并入已有主题或补上挂靠。`);
	}
	if (snapshotCount > 0) lines.push(`本次依据了 ${snapshotCount} 条读快照作为跨项目证据（已标记为已消费）。`);
	if (want("theme")) {
		if (linkedApplied.length > 0) lines.push(`🔗 **快照补挂**：按你的 \`linkedSnapshots\` 补挂了 ${linkedApplied.length} 条：` + linkedApplied.map((id) => `\`${id.slice(0, 8)}\``).join("、") + "。⚠️ 核对一下：**该挂的都列了吗**？");
		else if (linkedIds.size === 0) lines.push("🔗 **快照补挂**：本次**未补挂任何快照**（没给 `linkedSnapshots`，省略 = 不挂）。\n    ⚠️ 若本次**确实读过**别项目知识、且它与本次主题相关，请带上 `linkedSnapshots: [entryId]` 重调（用 `memj_snapshots` 取 id）。");
	}
	if (themeWhyWarnings.length > 0) lines.push(`⚠️⚠️ **挂靠依据待补（${themeWhyWarnings.length} 条）** —— 挂主题是**为了让该主题 desc 描述下的【别的项目】能直接拿去用**（省一次搜索 / 少造一个轮子 / 少踩一个坑）。
    ⚠️ 若某条**只对本项目成立**（本项目自己的改动 / 接口 / 缺陷 / 实测数据），**它就不该挂主题** ——
       请对照所挂主题的 \`desc\` 逐条自问：**"这对该主题下的【所有项目】都有用吗？"**
` + themeWhyWarnings.map((w) => `  ${w}`).join("\n") + "\n    ⇒ 处理方式（二选一）：**补 `themeWhy`**（引该主题 desc 里的话 + 说明用途）重调那条；或**去掉 `theme`**（只留项目归属 —— `theme` 留空是**正常状态**，不是漏写）。");
	if (keptOrphans.length > 0) lines.push(`⚠️ 保留了 ${keptOrphans.length} 处**无法解析的封面块**（原文未动，已留在「沉淀知识」节末尾）——它们多半是被手改坏了，请用 \`/memj-review\` 查看原因并修复。`);
	if (narrativePreserved) lines.push("⚠️ 你指定了 `narrative` 步，但**没有给 `doc`**：已**保留原叙事不动**（未清空）。\n    如果你确实想重写叙事，请带上 `doc` 重调；只是不想动叙事的话，把 `narrative` 从 `step` 里去掉即可。");
	if (!plan.isAll) {
		const done = HANDOFF_STEP_ORDER.filter((s) => want(s));
		const notInScope = HANDOFF_STEP_ORDER.filter((s) => !want(s));
		lines.push(`\n🔹 本次 step：${done.length > 0 ? done.map((s) => `\`${s}\``).join("、") : "（无）"}；已完成。`);
		if (notInScope.length > 0) lines.push(`🔹 **本次范围之外**（\`step\` 没列它们）：${notInScope.map((s) => `\`${s}\``).join("、")} —— ⛔ **这是本次划定的范围，不是欠账：不要为"补齐"再调一次**。需要另做某一步时，由用户决定。`);
	}
	const readCount = readCountAtStart;
	const knowledgeWritten = newCovers.length + overwritten.length;
	if (readCount > 0) {
		const titles = readTitlesAtStart.slice(0, 5).map((t) => `「${t}」`).join("、");
		const more = readCount > 5 ? ` 等 ${readCount} 条` : "";
		lines.push(`\n🔎 **沉淀自查**：本会话读过 ${titles}${more}。`, "    请按规范里的「扫描清单」逐类过一遍（**没有就明说「无」**）：", "      ① 本轮**实测/核实过**的机制或行为（⚠️ **最容易漏**——它在对话里讲得最详细，", "         于是容易产生\"已经记录下来了\"的错觉；**对话不是库，下一会话搜不到**）", "      ② 踩过的坑与根因　③ 做过的决策与理由　④ 查清楚的外部接口", `    ⚠️ 尤其看：**上面这些领域**里，本轮有没有新发现或修正？`);
	}
	if (knowledgeWritten > 0 && newCovers.every((c) => c.theme.length === 0)) lines.push(`\n🔎 **归属自查**：这次落的 ${knowledgeWritten} 条知识**都没挂主题**。\n    先看「本项目 frontmatter 的 \`themes:\`」确认是不是真没有合适的主题。
    ⭐ **若确认是漏挂 ⇒ 当场补，不必问用户**：挂靠**免批准、无门槛**，用 \`memj_promote\` 的 \`addThemes: ["<主题 id>"]\`，\`refs\` 传**完整 UUID**（不认短 id）。`);
	if (inheritedSections.length > 0) {
		lines.push(`\n📄 **叙事合并**：本次未写的 ${inheritedSections.length} 个节**沿用了原有内容**：${inheritedSections.map((s) => `\`${s}\``).join("、")}。\n    ⚠️ 若其中某个节**本该更新**，请把它写进 \`doc\` 重调；要**清空**某节，就把它写出来、内容留空。`);
		lines.push("\n" + fillSlots(promptText("handoff:untouched-sections", HANDOFF_UNTOUCHED_SECTIONS), { sections: inheritedSections.map((s) => `\`${s}\``).join("、") }) + "\n    " + promptText("handoff:untouched-closing", HANDOFF_UNTOUCHED_CLOSING));
	}
	if (replacedSections.length > 0) {
		const detail = replacedSections.map((s) => {
			const delta = s.after - s.before;
			const sign = delta >= 0 ? "+" : "−";
			return `\`${s.title}\`：${s.before} → ${s.after} 字符（${sign}${Math.abs(delta)}）`;
		}).join("；");
		lines.push(`\n✏️ **本次被替换的节（整节替换，原内容不再保留）**：${detail}\n    🔴 **请核对**：若上面某节**字数大幅减少**，说明你写的该节**没带上它原有的全文**——
    ⚠️ 工具对"写了但写不全的节"**不做保护**（它分不清"故意精简"与"忘带全文"）。
    ⭐ 要修正：把那节的**完整内容**（原有 + 新增）重写一遍再调；想清空某节才应该留空。`);
	}
	if (usedSectionOp && sectionOp !== void 0) {
		const opLabel = {
			append: "追加到该节**末尾**",
			prepend: "追加到该节**开头**",
			replace: "**替换**了该节",
			drop: "**删除**了该节"
		};
		const delta = (sectionOp.afterChars ?? 0) - (sectionOp.beforeChars ?? 0);
		const sign = delta >= 0 ? "+" : "−";
		lines.push(`\n⭐ **按节写**：${opLabel[docOp]} \`${sectionOp.hitTitle ?? docSectionName}\`` + (docOp === "drop" ? `（该节原有 ${sectionOp.beforeChars} 字符，已整节删除）` : `：${sectionOp.beforeChars} → ${sectionOp.afterChars} 字符（${sign}${Math.abs(delta)}）`) + "。\n    其余节**一个字都没动**。");
		if (sectionOp.fuzzyHit === true && sectionOp.hitTitle !== void 0) lines.push(`\n⚠️ **非精确匹配**：你传的是 \`${docSectionName}\`，工具按子串匹配命中的是 \`${sectionOp.hitTitle}\`。\n    ⭐ 上面那句「按节写」改的**就是后者**。
    🔴 若这不是你的本意 ⇒ 用 \`memj_read({ project })\` 核对真实节名，下一次传**完整节名**（精确匹配优先于子串）。`);
		if (sectionEmptyWarn.length > 0) lines.push(`\n⚠️ **该文档现在有 ${sectionEmptyWarn.length} 个空壳节**（只有标题、没有内容）：${sectionEmptyWarn.map((s) => `\`${s}\``).join("、")}。\n    ⭐ 这是**提示，不是错误**——工具分不清"故意删空"与"误删"。
    ⚠️ 请核对：若是有意清空 ⇒ 忽略；若是误删 ⇒ 用 \`docOp: 'append'\` 把内容补回。`);
	}
	const dupes = findDuplicateSections(narrative);
	if (dupes.length > 0) lines.push(`\n🔴 **发现 ${dupes.length} 个"同名小节"**（**同一个父节下**出现了多次）：${dupes.map((d) => d.level === 2 ? `\`${d.title}\`×${d.count}` : `\`${d.parent} › ${d.title}\`×${d.count}`).join("、")}。\n    ⚠️ **最可能的原因**：你在 \`doc\` 里写进了**别的小节的 \`###\` 标题** ——
    那些标题会被当成**新建子节**，而**原有的同名小节仍然在** ⇒ **整段内容重复两遍**。
    ⭐ **正确做法**：写某一节时**只写它自己**的标题与内容；
    要合并别的小节 ⇒ **逐个替换它们**，不要把它们的标题塞进这一节里。
    ⭐ **只在同一个顶层节内统计**：跨顶层节的同名子节（例如「有效做法」与「失败/踩坑」
    各自的「一、通用方法」）是**合法结构**，不算重复 —— 它们不会出现在上面的清单里。
    ⚠️ 请核对：若确实是有意造两个同名节 ⇒ 忽略本提示。`);
	if (narrateNow && existing !== void 0 && true) {
		const oj = orphanJudgments(existing.narrative, finalNarrative);
		if (oj !== void 0 && oj.after < oj.before) lines.push(`\n⚠️ **孤本判据减少**（「${PROGRESS_TITLE}」）：${oj.before} → ${oj.after} 条（−${oj.before - oj.after}）。\n    ⭐ **孤本 = 文档别的节里没有对应表述**——删了**别处查不到**。
    ⚠️ 判据靠**原句**生效（改写成摘要就不再是判据了）。
    🔴 **请核对**：若有意删的是**已被推翻**的判据 ⇒ 忽略本提示；若误删 ⇒ 把**原句**补回来。`);
	}
	if (knowledgeWritten > 0) await noteKnowledgeWritten(sessionId, turnNow, knowledgeWritten);
	return {
		ok: true,
		message: [...lines, ...backupLines].join("\n"),
		issues: [],
		createdProject: isNewProject,
		createdThemes,
		similarProjects: [],
		similarThemes: [],
		snapshotCount
	};
}
/**
* ⭐⭐⭐ **各节体量报告**（决策 223，2026-10-12 用户裁定）—— 工具在这里**只报数、不归档**。
*
* ── 🔴🔴 它取代了什么（`runHistoryArchive` 已删除）────────────────────────────
* 旧机制：工具**自动**截断「当前进度」、落 `kind:'history'` 条目、回填指针。
* 它当时的存在理由写着：
* > 压缩规范写了判据、也加了触发条件（回执每次报体量），**连报 7 次、一次没压**
* > ——根因是"**要模型自己动手**"。截断由工具自己做 ⇒ **那个失败模式从此不存在**。
*
* **用户 2026-10-12 裁定把它换掉**（原话）：
* > *"什么阈值触发，压缩目标，要不要截断，怎么归档，归档到什么类型
* >  完全由章节的书写规范去定。"*
* > *"归档交给模型，工具嘛，因为没法识别就不要了。完全交给模型吧。
* >  但本身对模型的强提醒和一定程度的校验还是要想办法的。"*
*
* ⇒ 根因是：**归档规则改成了自然语言（写在各节规范里），而工具读不懂自然语言**
*   ⇒ 它无法再判断"该不该截、截到哪"。
*   ⭐ **于是它换了个位置：从"执行者"变成"监察者"** ——
*     把**模型量不出来的那个数字**（各节现在多少字符）摆到它眼前。
*
* ── 🔴 为什么"报数"就是那条"强提醒"────────────────────────────────────────
* 规范里写死了阈值（如"超过 20000 字符时……"），而**模型自己数不出字数** ——
* 没有这个数字，那条规范**根本无法自检**（它不知道现在超了没有）。
* ⇒ 报数 + 已有的「本次没动的节」点名（决策 222），合起来就是提醒的全部。
*
* ⚠️ **不再改文档**：本函数**纯读**，不产生条目、不碰叙事
*    （旧版会落盘 ⇒ 现在落盘的只有 `memj_handoff` 自己的那一次）。
* @param narrative - 本次落盘**之后**的叙事（这样报的数就是模型下次看到的那份）。
* @returns 回执行（可能为空数组）。
*/
function reportSectionSizes(narrative) {
	const sizes = measureSections(narrative);
	if (sizes.length === 0) return [];
	const lines = [];
	for (const s of sizes) {
		lines.push(`    · ${s.title}　${s.chars} 字符`);
		for (const c of s.children) lines.push(`        - ${c.title}　${c.chars} 字符`);
	}
	return [`
📏 **各节体量**（对照**各节自己的书写规范**，判断哪一节该归档了；**归档挪走的是 \`###\` 子节**，所以它们也一并列出）：
${lines.join("\n")}\n    ⭐ 规范里的阈值（如"超过 20000 字符"）就写在各节的规范块里；工具**不会替你归档**（它读不懂那段自然语言），**归档由你按规范执行**：
    用 \`entries\` 落成 \`kind: history\` 的条目（**不参与检索**，是留档），原处只留**完整 uuid + 一句话批次主题**。`];
}
/**
* ⭐⭐ **执行版本维护**（决策 135 / 136 的接线处）。
*
* 两步：① 覆盖正文镜像；② git 提交（若开关开着且环境可用）。
*
* 🔴 **任何一步失败都不抛**（调用方还有一层 try），只把如实结果写进回执。
* ⚠️ **历史归档（截断）不在这里** —— 它必须在**落盘之前**做（见 `runHandoff` 的
*    "截断"段），否则要写两次盘；本函数只管"落盘之后"的版本维护。
* @param args - 见各字段注释。
* @returns 回执行。
*/
async function runVersionSteps(args) {
	const lines = [];
	const { projectId, at, config } = args;
	let mirrorChanged = false;
	if (config.backupGit) mirrorChanged = await writeNarrativeMirror(projectId, args.finalNarrative);
	if (config.backupGit) {
		let repo = await readRepoState();
		if (repo.initialized === false) {
			const probe = await probeGit();
			if (probe.available && probe.nestedRepoAt === "") {
				const made = await ensureRepo();
				if (made.ok) {
					repo = await readRepoState();
					lines.push(`
🔧 **git 仓库原先不存在，已自动重建**（\`backup/.git\`）——身份：${made.identity.name} <${made.identity.email}>。`);
				}
			}
		}
		if (!repo.initialized) {
			const n = noteGitFailure();
			lines.push(n <= config.backupGitFailLimit ? "\n🔴 **git 版本维护已开启，但仓库无法建立** —— 本次未提交。\n    请在设置里关闭再重新打开该开关（会重新探测环境并生成身份）。" : `\n🔴 **git 版本维护持续失败（连续 ${n} 次）** —— 本次同样未提交。\n    ⚠️ 不再每轮重复细节：请到设置页检查 git 环境，或把该开关关掉。`);
		} else if (repo.identity.source === "none") {
			noteGitFailure();
			lines.push("\n🔴 **git 提交者身份缺失** —— 本次未提交（请在设置里重新开启该开关以生成身份）。");
		} else {
			const msg = `memj-handoff: ${projectId} @ ${at}\n${summarizeNarrativeChange(args.existingNarrative, args.finalNarrative)}`;
			const c = await commitAll(repo.identity, msg);
			if (!c.ok) {
				const n = noteGitFailure();
				lines.push(n <= config.backupGitFailLimit ? `\n⚠️ **git 提交失败**（不影响本次 handoff）：${c.error}` : `\n⚠️ **git 提交持续失败（连续 ${n} 次）**：${c.error}\n    ⚠️ 不再每轮重复——请检查 git 环境，或把该开关关掉。`);
			} else {
				noteGitSuccess();
				if (c.committed) lines.push(mirrorChanged ? `\n🔖 **已提交正文镜像**（\`${c.hash}\`）——压缩改坏了可以用 git 退回。` : `\n🔖 **已提交正文镜像**（\`${c.hash}\`）——⚠️ 提交的是**先前未提交的遗留变更**（本次 handoff **未改正文**）。`);
				else lines.push("\n🔖 正文镜像**无变化**，本次未提交（内容与上一版相同）。");
			}
		}
	}
	args.existingNarrative;
	return { lines };
}
/**
* 提交信息里的第二行：**说清这次正文变了多少**。
*
* ⭐ 为什么值得写：`git log` 里一眼就能看出"哪一次是压缩"（字数大跌），
*    而"找压缩前那一版"正是版本维护的主要用途。
* @param before - 变更前叙事（可能没有）。
* @param after - 变更后叙事。
* @returns 一行摘要。
*/
function summarizeNarrativeChange(before, after) {
	const afterLen = after.trim().length;
	if (before === void 0) return `首次：${afterLen} 字符`;
	const beforeLen = before.trim().length;
	const delta = afterLen - beforeLen;
	return `正文 ${beforeLen} → ${afterLen} 字符（${delta >= 0 ? "+" : "−"}${Math.abs(delta)}）`;
}
/**
* 把某个已有封面挂到新主题上（跨文档写）。
*
* 用途：建新主题时，**快照里那条别项目的知识一并补挂**（§3.7.5 步骤 2）
* ——否则新主题只有本项目一条证据，那个"跨项目"的事实就丢了。
* @param coverId - 要挂的封面 id。
* @param themeId - 目标主题 id。
* @param snapshot - 库快照（用于定位封面所在项目）。
*/
async function linkCoverToTheme(coverId, themeId, snapshot) {
	const found = snapshot.covers.find((c) => c.cover.id === coverId);
	if (found === void 0) return;
	const ownerProject = found.cover.project;
	if (ownerProject === "") return;
	const doc = await loadProjectDoc(ownerProject);
	if (doc === void 0) return;
	let changed = false;
	const covers = doc.covers.map((c) => {
		if (c.id !== coverId || c.theme.includes(themeId)) return c;
		changed = true;
		return {
			...c,
			theme: [...c.theme, themeId]
		};
	});
	if (!changed) return;
	await writeProjectDoc(ownerProject, {
		...doc.frontmatter,
		themes: [.../* @__PURE__ */ new Set([...doc.frontmatter.themes, themeId])]
	}, doc.narrative, covers, doc.orphans);
	const target = covers.find((c) => c.id === coverId);
	if (target !== void 0 && !target.ext) await syncEntryFrontmatter(target);
}
/** 构造一个失败结果。 */
function fail(message) {
	return {
		ok: false,
		message,
		issues: [],
		createdProject: false,
		createdThemes: [],
		similarProjects: [],
		similarThemes: [],
		snapshotCount: 0
	};
}
/**
* 校验库里全部封面（`memj_rebuild` 的职责二，§4.2）。
*
* ⚠️ 与写入校验的**处置不同**（§3.9.3）：这里**跳过非法封面并记录**，
* 不阻断重建——因为"一次手改的笔误不该让整个库重建不了"。
* @returns 全部非法封面。
*/
async function validateAllCovers() {
	return (await scanLibrary()).issues;
}
//#endregion
//#region src/en-index.ts
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
function isMtModel(provider, model) {
	const m = `${provider}/${model}`.toLowerCase();
	if (/(^|[\W_])mt([\W_]|$)/.test(m)) return true;
	return /hunyuan-mt|opus-mt|nllb|m2m100|seamless-m4t/.test(m);
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
function pairingError(template, provider, model) {
	if (template !== "mt") return "";
	if (model.trim() === "") return "";
	if (isMtModel(provider, model)) return "";
	return `「${provider}/${model}」看起来不是翻译专用模型，但翻译模板选了 mt（mt 要求模型按"编号 + 空行"输出，两者必须配对，否则会静默解析失败）。请把模板改成 instruct，或换一个翻译专用模型（如 Hunyuan-MT 系列）。`;
}
/** 索引文件路径。 */
function enIndexPath() {
	return join(libraryRoot(), "recall", "en-index.json");
}
/** 中文 desc 的短指纹（保鲜判据）。 */
function descHashOf(desc) {
	return createHash("sha256").update(desc).digest("hex").slice(0, 8);
}
/** 读索引；不存在或损坏 ⇒ `undefined`（**不抛**）。 */
async function loadEnIndex() {
	try {
		const text = await readFile(enIndexPath(), "utf8");
		const parsed = JSON.parse(text);
		if (parsed?.version !== 1 || typeof parsed.entries !== "object") return void 0;
		return parsed;
	} catch {
		return;
	}
}
/** 原子写索引。 */
async function saveEnIndex(idx) {
	const target = enIndexPath();
	await mkdir(dirname(target), { recursive: true });
	await writeFileAtomic(target, `${JSON.stringify(idx, null, 1)}\n`, {
		mode: 384,
		dirMode: 448
	});
}
/** 去空白/粗体/包裹引号 —— MT 与 instruct 的输出都要过这一道。 */
function cleanText(value) {
	return String(value ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim().replace(/^["“'「]|["”'」]$/g, "");
}
/**
* ⭐ **漏翻判据**：译文里残留的中文串，若**在中文原文中未被引号包裹** ⇒ 判为漏翻。
*
* 为什么需要它：原文里作为**示例/代码/乱码样本**被引号包起来的中文
* （如 `「鏂规」`）**应当保留**，而普通词被原样搬进译文才是漏翻 ——
* 两者表现一样，必须区分，否则会把正确的译文误判成错误。
*/
function leakedHan(entry) {
	const hits = [...`${entry.titleEn} ${entry.descEn}`.matchAll(/[\u4e00-\u9fff]+/g)].map((m) => m[0]);
	if (hits.length === 0) return [];
	const source = `${entry.title} ${entry.desc}`;
	return hits.filter((h) => !new RegExp(`[「""'\`']${h}[」""'\`']`).test(source));
}
/** 从 `1. 标题\n\n描述` 或 `1. 标题\n描述` 里切出两段。 */
function splitTwo(text) {
	const body = text.replace(/^\s*\d+[.、]\s*/, "").trim();
	const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
	if (blocks.length >= 2) return {
		titleEn: cleanText((blocks[0] ?? "").split("\n")[0]),
		descEn: cleanText(blocks.slice(1).join(" "))
	};
	const lines = body.split("\n").map((l) => cleanText(l)).filter(Boolean);
	if (lines.length >= 2) return {
		titleEn: lines[0] ?? "",
		descEn: lines.slice(1).join(" ")
	};
}
const MT_SYS = "Translate the following numbered entries from Chinese into English. Keep the entry numbers. Output ONLY the translations: for each entry, one line for the title, then one line for the description.";
const MT_SYS_STRONG = "Translate the following numbered entry from Chinese into English. Output EXACTLY two lines. Line 1 = the translated title (keep the leading number). Line 2 = the translated description. Do NOT merge them into one line.";
const INSTRUCT_SYS = "你是翻译器。把用户给的「标题」和「描述」完整翻译成英文，不得保留任何中文字符（原文中作为示例或代码引用的中文除外）。只输出一个 JSON 对象，没有其他内容。";
registerPromptDefault("translate:mt", MT_SYS);
registerPromptDefault("translate:mt-strong", MT_SYS_STRONG);
registerPromptDefault("translate:instruct", INSTRUCT_SYS);
/** 一次纯模型调用（⚠️ **绝不传 `sessionId`** —— 否则会触发 llm/stream 监听 ⇒ 递归）。 */
async function callModel$1(ctx, config, route, system, user) {
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: user
		}],
		source: { kind: "plugin:dsh-memj" }
	})];
	const guard = deadline(void 0, config.translateTimeoutMs, "MEMJ_EN_INDEX_TIMEOUT");
	const llm = ctx.get("llm");
	if (llm?.stream === void 0) return void 0;
	try {
		const options = {
			provider: route.provider,
			model: route.model,
			messages,
			system,
			temperature: 0,
			maxTokens: config.translateMaxTokens,
			signal: guard.signal
		};
		const assembler = new BlockAssembler();
		for await (const chunk of llm.stream(options)) assembler.push(chunk);
		guard.signal.throwIfAborted();
		return assembler.blocks().filter((b) => b.type === "text").map((b) => b.text).join(" ");
	} catch {
		return;
	} finally {
		guard[Symbol.dispose]();
	}
}
/** 解析路由：配了就用自己的，否则**跟随主会话默认模型**；都拿不到 ⇒ `undefined`。 */
function resolveRoute$1(ctx, config) {
	if (config.translateProvider !== "" && config.translateModel !== "") return {
		provider: config.translateProvider,
		model: config.translateModel
	};
	try {
		const cur = ctx.get("agentDefaultModel")?.currentSelection?.();
		if (cur?.provider && cur.model) return {
			provider: cur.provider,
			model: cur.model
		};
	} catch {}
}
/** 简易退避（重试是低频路径，不为此引入定时器抽象）。 */
function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
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
async function withRetry(fn, attempts, onRetry) {
	for (let i = 0; i < attempts; i++) {
		const got = await fn();
		if (got !== void 0) return got;
		if (i < attempts - 1) {
			onRetry?.();
			await sleep(300 * (i + 1));
		}
	}
}
/**
* 翻一条（**每级内部先重试，再降级**）。
*
* 路径：`mt+空行` → `mt+强指令` → `mt降级instruct`（`translateTemplate === 'instruct'` 时直接走最后一步）。
* 每一级内部按 `translateRetries` 重试，**失败才降级**。
* @returns 译文与所走路径；全失败返回 `undefined`。
*/
async function translateOne(ctx, config, route, title, desc) {
	const attempts = Math.max(1, config.translateRetries + 1);
	let retried = false;
	const mark = () => {
		retried = true;
	};
	const tag = (base) => retried ? `${base}(重试)` : base;
	if (config.translateTemplate === "mt") {
		const ra = await withRetry(async () => {
			const a = await callModel$1(ctx, config, route, promptText("translate:mt", MT_SYS), `1. ${title}\n\n${desc}`);
			const r = a === void 0 ? void 0 : splitTwo(a);
			return r?.titleEn && r.descEn ? r : void 0;
		}, attempts, mark);
		if (ra !== void 0) return {
			...ra,
			via: tag("mt+空行")
		};
		const rb = await withRetry(async () => {
			const b = await callModel$1(ctx, config, route, promptText("translate:mt-strong", MT_SYS_STRONG), `1. ${title}\n${desc}`);
			const r = b === void 0 ? void 0 : splitTwo(b);
			return r?.titleEn && r.descEn ? r : void 0;
		}, attempts, mark);
		if (rb !== void 0) return {
			...rb,
			via: tag("mt+强指令")
		};
		return await translateInstruct(ctx, config, route, title, desc, tag("mt降级instruct"), attempts);
	}
	return await translateInstruct(ctx, config, route, title, desc, tag("instruct"), attempts);
}
async function translateInstruct(ctx, config, route, title, desc, via, attempts) {
	const user = `【标题】\n${title}\n\n【描述】\n${desc}\n\n只输出一行 JSON：{"title":"<english title>","desc":"<english description>"}`;
	return await withRetry(async () => {
		const text = await callModel$1(ctx, config, route, promptText("translate:instruct", INSTRUCT_SYS), user);
		if (text === void 0) return void 0;
		const m = text.match(/\{[\s\S]*\}/);
		if (m === null) return void 0;
		try {
			const o = JSON.parse(m[0]);
			const titleEn = cleanText(o.title);
			const descEn = cleanText(o.desc);
			if (titleEn === "" || descEn === "") return void 0;
			return {
				titleEn,
				descEn,
				via
			};
		} catch {
			return;
		}
	}, attempts);
}
/** 有界并发映射。 */
async function mapLimit(items, limit, fn) {
	const out = new Array(items.length);
	let i = 0;
	await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
		while (i < items.length) {
			const k = i++;
			out[k] = await fn(items[k]);
		}
	}));
	return out;
}
/** 模块级重建锁 —— 防并发重建（启动兜底与落盘触发可能撞上）。 */
let rebuilding = false;
/**
* ⭐ **重建索引**（落盘时 / 启动兜底都走这里）。
*
* 流程：`scanLibrary()` 全量 → 与现有索引 diff → 只翻「新增 / `descHash` 过期」
* → 漏翻质检并重翻 → 原子写回。
*
* 🔴 **本函数不抛**（调用方可能是 handoff 的收尾路径）。
*/
async function rebuildEnIndex(opts) {
	const { ctx, config } = opts;
	const empty = {
		covers: 0,
		added: 0,
		updated: 0,
		removed: 0,
		translated: 0,
		failed: 0,
		repaired: 0,
		skipped: ""
	};
	if (rebuilding) return {
		...empty,
		skipped: "已有一次重建在进行中"
	};
	rebuilding = true;
	try {
		const snapshot = await scanLibrary();
		const covers = snapshot.covers.map((c) => c.cover);
		const projects = {};
		for (const p of snapshot.projects) projects[p.id] = { themes: [...p.frontmatter.themes] };
		const archived = await scanLibrary({ includeArchived: true });
		for (const p of archived.projects) if (projects[p.id] === void 0) projects[p.id] = { themes: [...p.frontmatter.themes] };
		const prevEntries = (await loadEnIndex())?.entries ?? {};
		const route = resolveRoute$1(ctx, config);
		const todo = [];
		let updated = 0;
		for (const c of covers) {
			const old = prevEntries[c.id];
			if (!old || old.titleEn === "" || old.descEn === "" || old.descHash !== descHashOf(c.desc)) {
				if (old) updated++;
				todo.push(c);
			}
		}
		const removed = Object.keys(prevEntries).filter((id) => !covers.some((c) => c.id === id)).length;
		const fresh = /* @__PURE__ */ new Map();
		let failed = 0;
		if (route && todo.length > 0) {
			const results = await mapLimit(todo, config.translateConcurrency, (c) => translateOne(ctx, config, route, c.title, c.desc));
			todo.forEach((c, i) => {
				const r = results[i];
				if (r) fresh.set(c.id, r);
				else failed++;
			});
		}
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const entries = {};
		for (const c of covers) {
			const old = prevEntries[c.id];
			const t = fresh.get(c.id);
			const entry = {
				project: c.project,
				theme: [...c.theme],
				kind: c.kind,
				title: c.title,
				desc: c.desc,
				titleEn: t?.titleEn ?? old?.titleEn ?? "",
				descEn: t?.descEn ?? old?.descEn ?? "",
				descHash: descHashOf(c.desc),
				translatedAt: t ? now : old?.translatedAt ?? ""
			};
			const via = t?.via ?? old?.via;
			if (via !== void 0) entry.via = via;
			entries[c.id] = entry;
		}
		let repaired = 0;
		if (route) {
			const leaks = Object.entries(entries).filter(([, e]) => e.titleEn !== "" && leakedHan(e).length > 0);
			if (leaks.length > 0) {
				const leakAttempts = Math.max(1, config.translateRetries + 1);
				await mapLimit(leaks, config.translateConcurrency, async ([id, e]) => {
					const r = await translateInstruct(ctx, config, route, e.title, e.desc, "instruct漏翻修复", leakAttempts);
					if (r) {
						e.titleEn = r.titleEn;
						e.descEn = r.descEn;
						e.translatedAt = now;
						e.via = r.via;
						repaired++;
					}
					return id;
				});
			}
		}
		await saveEnIndex({
			version: 1,
			builtAt: now,
			provider: route?.provider ?? "",
			model: route?.model ?? "",
			template: config.translateTemplate,
			coverCount: covers.length,
			translated: Object.values(entries).filter((e) => e.titleEn !== "" && e.descEn !== "").length,
			projects,
			entries
		});
		const result = {
			covers: covers.length,
			added: todo.length - updated,
			updated,
			removed,
			translated: fresh.size,
			failed,
			repaired,
			skipped: route ? "" : "未配置翻译模型且拿不到主会话路由 ⇒ 只更新了结构"
		};
		diag$2(`rebuild done reason=${opts.reason ?? "-"} ${JSON.stringify(result)}`, config);
		return result;
	} catch (err) {
		diag$2(`rebuild THREW ${err instanceof Error ? err.message : String(err)}`, config);
		return {
			...empty,
			skipped: err instanceof Error ? err.message : String(err)
		};
	} finally {
		rebuilding = false;
	}
}
/**
* ⭐ **触发一次后台重建**（fire-and-forget）—— 给"落盘成功"这类路径调用。
*
* 🔴 **不 await、不抛**：索引是派生数据，它失败**不该影响**调用方（尤其 handoff）。
*/
function triggerEnIndexRebuild(ctx, config, reason) {
	if (!config.enIndex) return;
	rebuildEnIndex({
		ctx,
		config,
		reason
	}).catch(() => {});
}
/** 诊断日志（跟随项目既有约定：只在 config 打开时输出）。 */
function diag$2(message, config) {
	if (!config.enIndexDiag) return;
	try {
		console.log(`[dsh-memj/en-index] ${message}`);
	} catch {}
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
function registerEnIndex(opts) {
	const { ctx, config } = opts;
	if (!config.enIndex) {
		diag$2("disabled (enIndex=false)", config);
		return;
	}
	(async () => {
		try {
			const health = await checkIndex({
				ctx,
				config
			});
			if (!health.needsRepair) {
				diag$2(`startup: 索引与库一致（${health.visible} 条，缺译文 ${health.untranslated}）`, config);
				return;
			}
			diag$2(`startup: 需补全 ⇒ 重建（${health.problems.join("；")}）`, config);
			await rebuildEnIndex({
				ctx,
				config,
				reason: "startup-health"
			});
		} catch (err) {
			diag$2(`startup THREW ${err instanceof Error ? err.message : String(err)}`, config);
		}
	})();
}
/**
* ⭐ **检查索引**（只读，不写盘）。
*
* 判据**与启动兜底同源**（见 {@link IndexHealth} 的说明）。
* @returns 体检报告；任何一步失败都**降级成"不可判定"**而不是抛。
*/
async function checkIndex(opts) {
	const { ctx, config } = opts;
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const empty = {
		exists: false,
		indexed: 0,
		visible: 0,
		ghost: 0,
		absent: 0,
		untranslated: 0,
		staleHash: 0,
		leaked: 0,
		metaDrift: 0,
		projectDrift: 0,
		checkedAt: now,
		builtAt: "",
		route: "",
		needsRepair: false,
		problems: []
	};
	try {
		const [idx, snap] = await Promise.all([loadEnIndex(), scanLibrary()]);
		const visible = snap.covers.length;
		const route = resolveRoute$1(ctx, config);
		if (idx === void 0) return {
			...empty,
			visible,
			route: route ? `${route.provider}/${route.model}` : "",
			needsRepair: true,
			problems: [`索引文件不存在（有 ${visible} 条封面待建索引）`]
		};
		const ids = new Set(snap.covers.map((c) => c.cover.id));
		const ghost = Object.keys(idx.entries).filter((x) => !ids.has(x)).length;
		const absent = [...ids].filter((x) => idx.entries[x] === void 0).length;
		const entries = Object.values(idx.entries);
		const untranslated = entries.filter((e) => e.titleEn === "" || e.descEn === "").length;
		const staleHash = entries.filter((e) => e.descHash !== descHashOf(e.desc)).length;
		const leaked = entries.filter((e) => e.titleEn !== "" && leakedHan(e).length > 0).length;
		const byId = new Map(snap.covers.map((c) => [c.cover.id, c.cover]));
		let metaDrift = 0;
		for (const [id, e] of Object.entries(idx.entries)) {
			const c = byId.get(id);
			if (c === void 0) continue;
			const sameTheme = e.theme.length === c.theme.length && e.theme.every((t, i) => t === c.theme[i]);
			if (e.project !== c.project || !sameTheme) metaDrift++;
		}
		const snapForProjects = await scanLibrary({ includeArchived: true });
		const idxThemes = idx.projects;
		let projectDrift = 0;
		for (const p of snapForProjects.projects) {
			const a = idxThemes[p.id]?.themes ?? [];
			const b = [...p.frontmatter.themes];
			if (a.length !== b.length || a.some((t, i) => t !== b[i])) projectDrift++;
		}
		for (const id of Object.keys(idxThemes)) if (!snapForProjects.projects.some((p) => p.id === id)) projectDrift++;
		const problems = [];
		const structural = [];
		if (idx.coverCount !== visible) {
			const m = `封面数不符：索引 ${idx.coverCount} ≠ 实际 ${visible}`;
			problems.push(m);
			structural.push(m);
		}
		if (ghost > 0) {
			const m = `幽灵条目 ${ghost} 条（库里已删、索引还在）`;
			problems.push(m);
			structural.push(m);
		}
		if (absent > 0) {
			const m = `缺失条目 ${absent} 条（库里有、索引没跟上）`;
			problems.push(m);
			structural.push(m);
		}
		if (staleHash > 0) {
			const m = `指纹过期 ${staleHash} 条（中文 desc 变过、译文没跟）`;
			problems.push(m);
			structural.push(m);
		}
		if (metaDrift > 0) {
			const m = `归属漂移 ${metaDrift} 条（project/theme 改过 ⇒ 范围筛选用错归属）`;
			problems.push(m);
			structural.push(m);
		}
		if (projectDrift > 0) {
			const m = `项目主题映射漂移 ${projectDrift} 项（项目 themes 改过）`;
			problems.push(m);
			structural.push(m);
		}
		if (untranslated > 0) problems.push(`缺译文 ${untranslated} 条`);
		if (leaked > 0) problems.push(`译文残留中文 ${leaked} 条`);
		if (route === void 0 && (untranslated > 0 || leaked > 0)) problems.push("未配置翻译模型、且拿不到主会话路由 ⇒ 这些**要翻译**的项目无法自动补");
		const contentFixable = route !== void 0 && (untranslated > 0 || leaked > 0);
		const needsRepair = structural.length > 0 || contentFixable;
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
			route: route ? `${route.provider}/${route.model}` : "",
			needsRepair,
			problems
		};
	} catch (err) {
		return {
			...empty,
			needsRepair: true,
			problems: [`体检本身失败：${err instanceof Error ? err.message : String(err)}`]
		};
	}
}
/**
* ⭐⭐ **检查并（按需）补全** —— 给人侧「检查并补全」按钮用。
*
* 🔴 **动手前先看体检报告**：**没问题就不重建**（避免每次点击都白花翻译钱）。
* @returns 体检报告 + 本次是否真的重建过 + 重建结果。
*/
async function checkAndRepair(opts) {
	const { ctx, config } = opts;
	const health = await checkIndex({
		ctx,
		config
	});
	if (!health.needsRepair && opts.force !== true) return {
		health,
		repaired: false
	};
	const result = await rebuildEnIndex({
		ctx,
		config,
		reason: "manual-check"
	});
	return {
		health: await checkIndex({
			ctx,
			config
		}),
		repaired: true,
		result
	};
}
//#endregion
//#region src/edit.ts
/**
* ⭐⭐ **封面删改通道**（决策 114）。
*
* ── 它解决什么 ──────────────────────────────────────────────────────────────
* 在此之前，**封面一旦写错就几乎无法收拾**：
*
* | 对象 | 字段 | 改动前 |
* |---|---|---|
* | entry 封面 | `title`/`desc`/`tags` | ❌ 只能 `overwrite` **连正文一起**重写 |
* | | `kind` | ❌ 无（§12-72 明确留待做） |
* | | `theme` | ⚠️ 只能**追加**（`memj_promote`），**删不掉** |
* | | `global` | ⚠️ 只能置真，**取消不了** |
* | | `project` | ❌ 无 |
* | | 整条删除 | ❌ 无 |
* | 项目 | `desc` / 改名 / 删除 | ❌ 全无 |
* | 主题 | `desc` / 改名 / 删除 | ❌ 全无 |
*
* ⚠️ **实际卡住的例子**：`c9bcc110` 被误挂到 `thm-dsh-skill`，
* 用户要"摘掉改挂"——**却没有摘除通道**，只能手工改库文件（违反"取用按逻辑地址"）。
*
* ── 🔴 三条设计原则（用户拍板）────────────────────────────────────────────────
* 1. **单一实现、两处入口**：本模块是唯一的实现；LLM 侧（`memj_promote` 工具）
*    与人侧（网页 API）**都调它**——不写两遍（本项目的老坑）。
* 2. **只管封面/元数据**：**正文的增删改查仍归 `memj_handoff`**
*    （用户明确："交给写 handoff 的时候，只要记住是更新合并的角色即可"）。
*    唯一的例外是**删整条 entry**——那必须连正文一起删，否则留孤儿文件。
* 3. **能改就不删；改名 = 先建后删**（用户明确："项目能改先改，主题先添加再删除"）：
*    改名**不改 id 本身**（id 是引用键），而是"把内容迁到新 id、再删旧的"
*    ——这样引用不会断，且过程中**任何一步失败都不会丢数据**。
*
* ── 🔴 两个安全底线 ──────────────────────────────────────────────────────────
* · **删项目/主题前，旗下必须已无知识**（否则拒绝）。理由：级联删知识是
*   **不可逆的大面积损坏**，而"先迁走再删"多花一步却可恢复。
* · **删 entry 时只删内部正文**：外部引用（`ext: true`）的文件在库外、
*   **不属于 memj**，只移除封面、绝不动人家的文件。
*
* @module dsh-memj/edit
*/
var edit_exports = /* @__PURE__ */ __exportAll({
	archiveEntry: () => archiveEntry,
	archiveProject: () => archiveProject,
	deleteEntry: () => deleteEntry,
	deleteProject: () => deleteProject,
	deleteTheme: () => deleteTheme,
	editEntryThemes: () => editEntryThemes,
	moveEntry: () => moveEntry,
	probeCoverState: () => probeCoverState,
	renameProject: () => renameProject,
	renameTheme: () => renameTheme,
	setEntryFields: () => setEntryFields,
	setEntryGlobal: () => setEntryGlobal,
	setProjectDesc: () => setProjectDesc,
	setProjectFields: () => setProjectFields,
	setSectionSpec: () => setSectionSpec,
	setThemeDesc: () => setThemeDesc,
	setThemeFields: () => setThemeFields,
	unarchiveEntry: () => unarchiveEntry,
	unarchiveProject: () => unarchiveProject,
	updateEntry: () => updateEntry
});
/** 内部：成功。 */
function ok(message, archivedAt) {
	return archivedAt === void 0 ? {
		ok: true,
		message
	} : {
		ok: true,
		message,
		archivedAt
	};
}
/** 内部：失败。 */
function no(message) {
	return {
		ok: false,
		message
	};
}
/**
* ⭐ **改一张封面并按需同步两处**（"两处都写"，§3.3）。
*
* 🔴 **走 `writeProjectDoc` 而不是"按行号局部替换"**：后者（`fixCoverBlock` 用的）
*    需要**调用方先拿到行号**，而行号在并发/多次编辑下会漂移；
*    更重要的是，`writeProjectDoc` **已经正确处理 `orphans`**
*    （解析失败的封面块原样写回，§8.7④）——不会静默丢掉它们。
* @param id - 封面 id。
* @param mutate - 把旧封面映射成新封面。
* @returns 结果（含新旧封面，供回执对比）。
*/
async function mutateCover(id, mutate, opts = {}) {
	const found = (await scanLibrary({ includeArchived: true })).covers.find((c) => c.cover.id === id);
	if (found === void 0) return { result: no(`库里没有 id 为 \`${id}\` 的封面。`) };
	const before = found.cover;
	if ((before.archivedAt ?? "") !== "" && opts.allowArchived !== true) return { result: no(`条目 \`${id.slice(0, 8)}\` **已归档**，不可编辑。请先在「归档」页恢复它。`) };
	const mutated = mutate(before);
	const nowIso = (/* @__PURE__ */ new Date()).toISOString();
	const after = {
		...mutated,
		createdAt: (before.createdAt ?? "") !== "" ? before.createdAt : (mutated.createdAt ?? "") || nowIso,
		updatedAt: opts.preserveUpdatedAt === true ? before.updatedAt ?? "" : nowIso
	};
	const pendingIds = new Set((await readNominations()).map((n) => n.entryId));
	const issues = validateCoverShape(after, void 0, pendingIds.has(after.id));
	if (issues.length > 0) return { result: no(`校验未通过，**未写入**：\n` + issues.map((s) => `  · ${s}`).join("\n")) };
	const owner = projectIdFromFile(found.sourceFile) ?? before.project;
	if (owner === "") return { result: no(`封面 \`${id.slice(0, 8)}\` 没有项目归属，暂不支持修改。`) };
	const doc = await loadProjectDoc(owner);
	if (doc === void 0) return { result: no(`找不到项目文档 \`${owner}\`。`) };
	const covers = doc.covers.map((c) => c.id === id ? after : c);
	await writeProjectDoc(owner, doc.frontmatter, doc.narrative, covers, doc.orphans);
	if (!after.ext) await syncEntryFrontmatter(after);
	return {
		result: ok(""),
		before,
		after,
		owner
	};
}
/**
* ⭐ **改 entry 封面的字段**（`title` / `desc` / `tags` / `kind`）。
*
* ⚠️ **只给要改的字段**；没给的保持不变（**不是**整份替换）。
* @param id - 封面 id。
* @param fields - 要改的字段。
* @param opts - ⭐ `preserveUpdatedAt`（决策 162）：**标签规范化**这类"整理"动作用它，
*   让 `updatedAt` **不被刷新**（否则批量整理会把库里的时间维度整个抹平）。
*   ⚠️ `allowArchived`：规范化要含归档条目 ⇒ 显式放行。
* @returns 结果。
*/
async function setEntryFields(id, fields, opts = {}) {
	const changed = [];
	const r = await mutateCover(id, (c) => {
		const next = { ...c };
		if (fields.title !== void 0 && fields.title !== c.title) {
			next.title = fields.title;
			changed.push(`title: 「${c.title}」→「${fields.title}」`);
		}
		if (fields.desc !== void 0 && fields.desc !== c.desc) {
			next.desc = fields.desc;
			changed.push("desc 已更新");
		}
		if (fields.tags !== void 0) {
			const tags = fields.tags.map((t) => t.trim()).filter((t) => t !== "");
			if (JSON.stringify(tags) !== JSON.stringify(c.tags)) {
				next.tags = tags;
				changed.push(`tags: ${c.tags.join("/")} → ${tags.join("/")}`);
			}
		}
		if (fields.kind !== void 0 && fields.kind !== c.kind) {
			next.kind = fields.kind;
			changed.push(`kind: ${c.kind === "" ? "(未分类)" : c.kind} → ${fields.kind === "" ? "(未分类)" : fields.kind}`);
		}
		return next;
	}, opts);
	if (!r.result.ok) return r.result;
	if (changed.length === 0) return ok(`封面 \`${id.slice(0, 8)}\` 没有需要改的字段（值都相同）。`);
	if (opts.preserveUpdatedAt !== true) await rebuildDerivedLayers();
	return ok(`已更新封面 \`${id.slice(0, 8)}\`（项目 \`${r.owner}\`）：\n` + changed.map((s) => `  · ${s}`).join("\n"));
}
/**
* ⭐⭐ **更新一条已有 entry 的内容**（决策 119）——**改正文**，这是此前缺的通道。
*
* ── 为什么需要它 ────────────────────────────────────────────────────────────
* 在此之前，**改一条知识的正文**只有一条路：`memj_handoff` + `overwrite: true`
* ——那是**整条替换**，`body` 必填 ⇒ **改一个错字也得把整篇重贴一遍**，
* 而且很容易在重贴时漏字段或改坏内容。
*
* ⚠️ **与 `memj_promote` 的分工**（两者不重叠）：
*   · `memj_promote` = **只碰元数据**（主题/字段/global/项目/删除），**不碰正文**；
*   · `memj_update` = **碰正文**（可选连封面字段一起改），**面向"这一条"**。
* ⇒ 加新能力时想清楚归哪边：**要动 `body` 的只在这里**。
*
* ⭐ **用法场景**（用户明确）：
*   ① handoff / 单步沉淀时，先 `memj_search` + `memj_read` 发现有**相似条目**
*      ⇒ 考虑**更新原有那条**，而不是再写一条新的；
*   ② 某条知识的**事实过期**了 ⇒ 在那个时机用本工具刷新它。
*
* 🔴 **`createdAt` 永不变**（那是"这条什么时候产生的"）；
*    **`updatedAt` 每次真正改动都会刷新**（含只改正文、只改封面字段）。
* @param id - 封面 id。
* @param opts - `body`（新正文；给了就替换）与可选的封面字段（同 `setEntryFields`）。
* @returns 结果。
*/
async function updateEntry(id, opts) {
	const blocked = await guardEntryEditable(id);
	if (blocked !== null) return blocked;
	const found = (await scanLibrary()).covers.find((c) => c.cover.id === id);
	if (found === void 0) return no(`库里没有 id 为 \`${id}\` 的封面。`);
	const cover = found.cover;
	if (cover.ext) return no(`\`${id.slice(0, 8)}\` 是**外部引用**（ext: true）——它的正文在库外、**不属于 memj**，本工具**不改外部文件**。若要改，请直接编辑那个文件；封面字段仍可用 \`memj_promote\` 改。`);
	const changed = [];
	const bodyGiven = opts.body !== void 0;
	if (bodyGiven) changed.push("正文已更新");
	const fields = opts.fields ?? {};
	const nextTitle = fields.title !== void 0 ? fields.title : cover.title;
	const nextDesc = fields.desc !== void 0 ? fields.desc : cover.desc;
	const nextKind = fields.kind !== void 0 ? fields.kind : cover.kind;
	const nextTags = fields.tags !== void 0 ? fields.tags.map((t) => t.trim()).filter((t) => t !== "") : cover.tags;
	if (nextTitle !== cover.title) changed.push(`title: 「${cover.title}」→「${nextTitle}」`);
	if (nextDesc !== cover.desc) changed.push("desc 已更新");
	if (nextKind !== cover.kind) changed.push(`kind: ${cover.kind === "" ? "(未分类)" : cover.kind} → ${nextKind === "" ? "(未分类)" : nextKind}`);
	if (JSON.stringify(nextTags) !== JSON.stringify(cover.tags)) changed.push("tags 已更新");
	if (changed.length === 0) return ok(`封面 \`${id.slice(0, 8)}\` 没有任何改动（正文与字段都相同）。`);
	const nowIso = (/* @__PURE__ */ new Date()).toISOString();
	const next = {
		...cover,
		title: nextTitle,
		desc: nextDesc,
		kind: nextKind,
		tags: nextTags,
		createdAt: (cover.createdAt ?? "") !== "" ? cover.createdAt : nowIso,
		updatedAt: nowIso
	};
	const updatePending = new Set((await readNominations()).map((n) => n.entryId));
	const issues = validateCoverShape(next, void 0, updatePending.has(next.id));
	if (issues.length > 0) return no(`校验未通过，**未写入**：\n` + issues.map((s) => `  · ${s}`).join("\n"));
	if (!await syncEntryFrontmatter(next, opts.body)) return no(`条目正文文件写不进去（\`${cover.ref}\` 可能已被移动或删除）。`);
	const owner = cover.project;
	if (owner === "") return no(`封面 \`${id.slice(0, 8)}\` 没有项目归属，无法写回。`);
	const doc = await loadProjectDoc(owner);
	if (doc === void 0) return no(`找不到项目文档 \`${owner}\`。`);
	const covers = doc.covers.map((c) => c.id === id ? next : c);
	await writeProjectDoc(owner, doc.frontmatter, doc.narrative, covers, doc.orphans);
	await rebuildDerivedLayers();
	return ok(`已更新条目 \`${id.slice(0, 8)}\`（「${next.title}」，项目 \`${owner}\`）：\n` + changed.map((s) => `  · ${s}`).join("\n") + (bodyGiven ? `\n  · 新正文 ${[...opts.body ?? ""].length} 字符` : "") + "\n⚠️ `createdAt` 未变，`updatedAt` 已刷新。");
}
/**
* ⭐⭐ **增删 entry 的 `theme`**（决策 114——**这就是 `c9bcc110` 卡住的那个缺口**）。
*
* ⚠️ **累加语义**（与 §6 协议一致）：`add` 是追加、`remove` 是移除，
* 两边都不影响原有归属；`project` 与 `global` **完全不动**。
* @param id - 封面 id。
* @param opts - `add` / `remove` 主题 id 数组。
* @returns 结果。
*/
async function editEntryThemes(id, opts) {
	const snapshot = await scanLibrary();
	const known = new Set(snapshot.themeIds);
	const add = (opts.add ?? []).map((t) => t.trim()).filter((t) => t !== "");
	const remove = (opts.remove ?? []).map((t) => t.trim()).filter((t) => t !== "");
	const unknown = add.filter((t) => !known.has(t));
	if (unknown.length > 0) return no(`主题不存在：${unknown.map((t) => `\`${t}\``).join("、")}。\n库里现有的主题：${snapshot.themeIds.length > 0 ? snapshot.themeIds.map((t) => `\`${t}\``).join("、") : "（暂无）"}`);
	const r = await mutateCover(id, (c) => {
		const set = new Set(c.theme);
		for (const t of add) set.add(t);
		for (const t of remove) set.delete(t);
		return {
			...c,
			theme: [...set]
		};
	});
	if (!r.result.ok) return r.result;
	const b = r.before?.theme ?? [];
	const a = r.after?.theme ?? [];
	if (JSON.stringify(b) === JSON.stringify(a)) return ok(`封面 \`${id.slice(0, 8)}\` 的主题**没有变化**（当前：${a.length > 0 ? a.join("、") : "无"}）。`);
	await rebuildDerivedLayers();
	return ok(`已更新封面 \`${id.slice(0, 8)}\` 的主题：\n  · 改前：${b.length > 0 ? b.join("、") : "（无）"}\n  · 改后：${a.length > 0 ? a.join("、") : "（无）"}\n⚠️ **累加语义**：\`project\` 与 \`global\` 未受影响。`);
}
/**
* **置 `global`**——⭐ **语义随"谁在做"而不同**（决策 116）。
*
* | 谁 | 置真时的行为 | 为什么 |
* |---|---|---|
* | 侧 | 行为 | 理由 |
* |---|---|---|
* | **人侧**（网页编辑面板） | ⭐ **直接生效**（置 `global: true`，清掉提名） | **人本来就是审批者**——他亲手勾选，再让他去审批自己，是多余的一步 |
* | **LLM 侧**（`memj_promote`） | 只登记提名，**封面 `global` 保持 `false`** | §7.3 安全底线：**模型不能自己批准**全局知识 |
*
* ⭐⭐ **方案 A（2026-09-18）的核心语义**：
* `global: true` **只表示"已批准"**；"待批"**只由提名表表达**。
* 旧实现提名时就把 `global` 置 `true`、靠"在不在提名表里"区分是否已批
* ⇒ 待批期间字段**在撒谎**，且用"队列成员身份"编码状态
* （本项目已记过这类坑——「用『在队列里』编码状态，会让『移除』等于『完成』」）。
*
* 🔴🔴 **两侧都走本函数，但 `actor` 必须如实传**：
*    - `actor: 'llm'`（缺省）⇒ **只登记提名，不置位**。
*      ⚠️ 早先的注释写着"只置 `global` 而不登记提名会被当成已批准"——
*      那是**旧判据**下的问题；现在**反过来了**：判据只看 `global`，
*      所以**LLM 侧绝不能置位**（置了就等于自己批准了）。
*    - `actor: 'human'` ⇒ **直接生效**：置 `global: true` 并**确保不在提名表里**。
* @param id - 封面 id。
* @param value - 目标值。
* @param actor - 谁在做：`'llm'`（缺省，只提名）或 `'human'`（直接生效）。
* @returns 结果。
*/
async function setEntryGlobal(id, value, actor = "llm") {
	if (value) {
		if (actor === "human") {
			const r = await mutateCover(id, (c) => ({
				...c,
				global: true
			}));
			if (!r.result.ok) return r.result;
			await removeNomination(id);
			await rebuildDerivedLayers();
			return ok(`封面 \`${id.slice(0, 8)}\` 已加入全局，**已当场生效**（你在人侧直接确认）。`);
		}
		const found = (await scanLibrary()).covers.find((c) => c.cover.id === id);
		if (found === void 0) return no(`库里没有 id 为 \`${id}\` 的封面。`);
		if (found.cover.global) {
			const r = await mutateCover(id, (c) => ({
				...c,
				global: false
			}));
			if (!r.result.ok) return r.result;
		}
		await addNomination({
			entryId: id,
			title: found.cover.title,
			desc: found.cover.desc,
			project: found.cover.project,
			nominatedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		await rebuildDerivedLayers();
		return ok(`封面 \`${id.slice(0, 8)}\` 已**登记为待批提名**（封面 \`global\` 仍为 \`false\`）。\n⚠️ 需人在网页或 \`/memj-review\` 里**批准**后才置位进 GLOBAL——工具不会自己批准。`);
	}
	const r = await mutateCover(id, (c) => ({
		...c,
		global: false
	}));
	if (!r.result.ok) return r.result;
	await removeNomination(id);
	await rebuildDerivedLayers();
	return ok(`封面 \`${id.slice(0, 8)}\` 已**取消** global（置为 false），并清掉了它的提名。`);
}
/**
* ⭐⭐ **条目侧的归档守卫**（决策 133）——给**不走 `mutateCover`** 的写通路用。
*
* 🔴 **为什么需要它**（实测踩到）：`mutateCover` 里的守卫只保护"经过它"的那几条路，
*    而 `updateEntry`（`memj_update` 工具）与 `moveEntry` / `deleteEntry`
*    各自 `scanLibrary()`（**默认不含归档**）找封面 ⇒ 归档条目会命中
*    "**库里没有 id 为 X 的封面**"——🔴 **那是撒谎**：它在库里，只是被归档了。
*    用户明确要求这种情形回"该条目已归档，不可编辑"。
*
* ⚠️ 判据用**含归档**的扫描；`undefined` 才算真的不存在。
* @param id - 封面 id。
* @returns 通过返回 `null`；否则返回应当直接返回给调用方的拒绝结果。
*/
async function guardEntryEditable(id) {
	const cur = await findCoverAny(id);
	if (cur === void 0) return no(`库里没有 id 为 \`${id}\` 的封面。`);
	if ((cur.archivedAt ?? "") !== "") return no(`条目 \`${id.slice(0, 8)}\` **已归档**，不可编辑。请先在「归档」页恢复它。`);
	return null;
}
/** 找一张封面（**含归档**）——给"先判后写"的归档动作做前置探测。 */
async function findCoverAny(id) {
	return (await scanLibrary({ includeArchived: true })).covers.find((c) => c.cover.id === id)?.cover;
}
/**
* ⭐⭐ **只读探测：这张封面是不是"存在但已归档"**（决策 133）。
*
* 🔴 **为什么必须导出**：`memj_promote` 用默认快照（**不含归档**）找封面，
*    归档条目会落到"库里没有这张封面"那条回执上——那是**撒谎**。
*    要区分"真不存在"与"存在但归档"，调用方就得有一个**含归档**的探测手段。
*    ⚠️ 刻意**不复用 `guardEntryEditable`**：那个是"写动作的闸门"（返回拒绝结果），
*       而这里只回答"是不是归档的"这一个事实，调用方自己决定怎么措辞。
* @param id - 封面 id。
* @returns `'active'`（存在且活跃）/ `'archived'`（存在但已归档）/ `'missing'`（真没有）。
*/
async function probeCoverState(id) {
	const cur = await findCoverAny(id);
	if (cur === void 0) return "missing";
	return (cur.archivedAt ?? "") !== "" ? "archived" : "active";
}
/**
* ⭐⭐ **项目侧的归档守卫**（决策 133）——项目类写动作的**统一入口检查**。
*
* 🔴 **为什么需要单独一个函数**：条目的守卫长在 `mutateCover` 里（**所有**条目改动
*    都经过它），而项目**没有那样一个汇聚点**——`setProjectFields` / `renameProject` /
*    `deleteProject` 各自 `loadProjectDoc`。若不显式检查，归档项目会：
*    · `setProjectFields` ⇒ **真的写进去**（改动**成功**了，与"归档不可编辑"直接矛盾）；
*    · `renameProject` / `deleteProject` ⇒ 用**默认快照**找项目 ⇒ 报"项目不存在"，
*      而它其实在库里（只是归档了）⇒ 回执**撒谎**。
*
* ⚠️ 判据用 `loadProjectDoc`（**按 id 直接读文档**），不用 `scanLibrary` ——
*    后者默认**不含**归档项目，用它检查等于没检查。
* @param id - 项目 id。
* @returns 通过返回 `null`；否则返回应当直接返回给调用方的拒绝结果。
*/
async function guardProjectEditable(id) {
	const doc = await loadProjectDoc(id);
	if (doc === void 0) return no(`项目 \`${id}\` 不存在。`);
	if ((doc.frontmatter.archivedAt ?? "") !== "") return no(`项目 \`${id}\` **已归档**，不可编辑。请先在「归档 → 项目」页恢复它。`);
	return null;
}
/**
* 归档一条 entry（决策 133）。
*
* ⚠️ **连带把 `global` 置 false**（用户要求）：归档撤回了全局身份，
* 若不置位，它会**仍以已批准的身份留在 `GLOBAL.md`** 里。
* @param id - 封面 id。
* @returns 结果。
*/
async function archiveEntry(id) {
	const cur = await findCoverAny(id);
	if (cur === void 0) return no(`库里没有 id 为 \`${id}\` 的封面。`);
	if ((cur.archivedAt ?? "") !== "") return no(`条目 \`${id.slice(0, 8)}\` **已经是归档状态**。`);
	const nowIso = (/* @__PURE__ */ new Date()).toISOString();
	const r = await mutateCover(id, (c) => ({
		...c,
		archivedAt: nowIso,
		global: false
	}), { allowArchived: true });
	if (!r.result.ok) return r.result;
	await removeNomination(id);
	await rebuildDerivedLayers();
	return ok(`条目 \`${id.slice(0, 8)}\` 已**归档**（归档时间 ${nowIso}）：不再出现在知识库列表与工具检索里。\n⚠️ 它已退出 \`GLOBAL\`（若原本在）；可在「归档」标签页恢复。`, nowIso);
}
/**
* 恢复一条已归档的 entry（决策 133）。
*
* ⚠️ **不恢复 `global`**：归档撤回了全局身份，"恢复"只是让它回到活跃，
* **不等于重新获批**（批准是人的动作）。要重新全局请再走一遍提名。
* ⚠️ **不检查它的项目是否归档**（用户明确：恢复与项目状态无关）。
* @param id - 封面 id。
* @returns 结果。
*/
async function unarchiveEntry(id) {
	const cur = await findCoverAny(id);
	if (cur === void 0) return no(`库里没有 id 为 \`${id}\` 的封面。`);
	if ((cur.archivedAt ?? "") === "") return no(`条目 \`${id.slice(0, 8)}\` **本来就不是归档状态**。`);
	const r = await mutateCover(id, (c) => ({
		...c,
		archivedAt: ""
	}), { allowArchived: true });
	if (!r.result.ok) return r.result;
	await rebuildDerivedLayers();
	return ok(`条目 \`${id.slice(0, 8)}\` 已**恢复**：重新回到知识库列表与工具检索里。\n⚠️ 它的 \`global\` 仍为 \`false\`（归档时已撤回）——要重新全局请再提名、由人批准。`);
}
/**
* 归档一个项目（决策 133）。
*
* 🔴 **只动项目文档自己的 `archivedAt`**——
* **旗下封面一个都不碰**、封面的 `project` 字段也不变（用户明确裁定）。
* ⇒ 效果是"**项目本身**不再出现在项目列表 / 工具里"，而**它的知识照旧活跃**。
*
* ⚠️ 为什么**不触发 rebuild**：派生层（`THEME-*.md` / `GLOBAL.md`）是从**封面**聚合的，
*    而本动作不改任何封面 ⇒ 投影无变化。多跑一次只会白写文件。
* @param id - 项目 id。
* @returns 结果。
*/
async function archiveProject(id) {
	const doc = await loadProjectDoc(id);
	if (doc === void 0) return no(`项目 \`${id}\` 不存在。`);
	if ((doc.frontmatter.archivedAt ?? "") !== "") return no(`项目 \`${id}\` 已经是归档状态。`);
	const nowIso = (/* @__PURE__ */ new Date()).toISOString();
	await writeProjectDoc(id, {
		...doc.frontmatter,
		archivedAt: nowIso
	}, doc.narrative, doc.covers, doc.orphans);
	const n = doc.covers.length;
	return ok(`项目 \`${id}\` 已**归档**：它本身不再参与工具调用（也不能再往它下面新增知识）。\n⚠️ 它旗下的 **${n} 条知识不受影响**——照旧出现在知识库与检索里，挂靠关系也不变。`);
}
/**
* 恢复一个已归档的项目（决策 133）。
* @param id - 项目 id。
* @returns 结果。
*/
async function unarchiveProject(id) {
	const doc = await loadProjectDoc(id);
	if (doc === void 0) return no(`项目 \`${id}\` 不存在。`);
	if ((doc.frontmatter.archivedAt ?? "") === "") return no(`项目 \`${id}\` 本来就不是归档状态。`);
	await writeProjectDoc(id, {
		...doc.frontmatter,
		archivedAt: ""
	}, doc.narrative, doc.covers, doc.orphans);
	return ok(`项目 \`${id}\` 已**恢复**：重新出现在项目列表里。`);
}
/**
* **把一条 entry 迁到另一个项目**（`project` 字段只有一个来源，改它是"搬家"）。
*
* 🔴 **与"主题"不同**：主题是**累加**（可以同时属于多个），
* 而 `project` 是**单值**——所以这里是**搬运**，旧项目文档里会移除该封面。
* ⚠️ 目标项目**必须已存在**（不新建——新建项目要 `projectDesc`，那属于 handoff 的职责）。
* @param id - 封面 id。
* @param projectId - 目标项目 id。
* @returns 结果。
*/
async function moveEntry(id, projectId) {
	const target = projectId.trim();
	const blocked = await guardEntryEditable(id);
	if (blocked !== null) return blocked;
	const snapshot = await scanLibrary({ includeArchived: true });
	const found = snapshot.covers.find((c) => c.cover.id === id);
	if (found === void 0) return no(`库里没有 id 为 \`${id}\` 的封面。`);
	const from = found.cover.project;
	if (from === target) return ok(`封面 \`${id.slice(0, 8)}\` 本来就在项目 \`${target}\`。`);
	if (!snapshot.projects.some((p) => p.id === target)) return no(`目标项目 \`${target}\` 不存在。\n库里现有项目：${snapshot.projects.map((p) => `\`${p.id}\``).join("、")}\n⚠️ 本通道**不新建项目**（新建要 \`projectDesc\`，请用 \`memj_handoff\`）。`);
	const oldDoc = await loadProjectDoc(from);
	const newDoc = await loadProjectDoc(target);
	if (oldDoc === void 0 || newDoc === void 0) return no(`读不到项目文档（\`${from}\` 或 \`${target}\`）。`);
	const moved = {
		...found.cover,
		project: target
	};
	await writeProjectDoc(from, oldDoc.frontmatter, oldDoc.narrative, oldDoc.covers.filter((c) => c.id !== id), oldDoc.orphans);
	await writeProjectDoc(target, newDoc.frontmatter, newDoc.narrative, [...newDoc.covers, moved], newDoc.orphans);
	if (!moved.ext) await syncEntryFrontmatter(moved);
	await rebuildDerivedLayers();
	return ok(`已把封面 \`${id.slice(0, 8)}\` 从 \`${from}\` 迁到 \`${target}\`。`);
}
/**
* 🔴 **删掉一条 entry**（封面 + 正文文件，不可逆）。
*
* ⚠️ **只删内部正文**：外部引用（`ext: true`）的文件在库外，**只移除封面**。
* @param id - 封面 id。
* @returns 结果。
*/
async function deleteEntry(id) {
	const blocked = await guardEntryEditable(id);
	if (blocked !== null) return blocked;
	const found = (await scanLibrary()).covers.find((c) => c.cover.id === id);
	if (found === void 0) return no(`库里没有 id 为 \`${id}\` 的封面。`);
	const cover = found.cover;
	if (cover.project === "") return no(`封面 \`${id.slice(0, 8)}\` 没有项目归属，暂不支持删除。`);
	const doc = await loadProjectDoc(cover.project);
	if (doc === void 0) return no(`找不到项目文档 \`${cover.project}\`。`);
	await writeProjectDoc(cover.project, doc.frontmatter, doc.narrative, doc.covers.filter((c) => c.id !== id), doc.orphans);
	const removed = await deleteEntryFile(cover.ref, cover.ext);
	await rebuildDerivedLayers();
	return ok(`已删除条目 \`${id.slice(0, 8)}\`（「${cover.title}」）。\n` + (cover.ext ? "  · 它是**外部引用**——只移除了封面，**库外那个文件没有动**。" : `  · 正文文件${removed ? "已删除" : "**未找到**（可能早就不在了），封面已移除"}。`));
}
/**
* ⭐ **改项目的显示名与描述**（决策 115）。
*
* 🔴 **"改名"改的是 `title`，不是 `project`**（用户明确："可以改名，但是不能改 ID，
*    相当于只是改标题"）。`project` 是**文件名 + 全部封面的引用键**，
*    动它要同时改 N 处；而 `title` 只是个显示名，**改了不影响任何引用**。
*
* ⚠️ **只改你给的字段**；没给的保持不变。
* ⚠️ `title` 允许**清空**（空串 = 回落到显示 id）——那是有意义的操作，不是错误。
* @param id - 项目 id。
* @param fields - 要改的字段（`title` / `desc`）。
* @returns 结果。
*/
async function setProjectFields(id, fields) {
	const blocked = await guardProjectEditable(id);
	if (blocked !== null) return blocked;
	const doc = await loadProjectDoc(id);
	if (doc === void 0) return no(`项目 \`${id}\` 不存在。`);
	const next = { ...doc.frontmatter };
	const changed = [];
	if (fields.title !== void 0) {
		const t = fields.title.trim();
		if ([...t].length > 48) return no(`项目名超长：${[...t].length} 字符（上限 48）。`);
		if (t !== doc.frontmatter.title) {
			next.title = t;
			changed.push(`title: ${doc.frontmatter.title === "" ? "(未设置)" : `「${doc.frontmatter.title}」`} → ${t === "" ? "(已清空)" : `「${t}」`}`);
		}
	}
	if (fields.desc !== void 0) {
		const d = fields.desc.trim();
		if (d === "") return no("项目描述不能为空。");
		if ([...d].length > 200) return no(`项目描述超长：${[...d].length} 字符（上限 200）。`);
		if (d !== doc.frontmatter.desc) {
			next.desc = d;
			changed.push("desc 已更新");
		}
	}
	if (changed.length === 0) return ok(`项目 \`${id}\` 没有需要改的字段。`);
	const nowIso = (/* @__PURE__ */ new Date()).toISOString();
	await writeProjectDoc(id, {
		...next,
		createdAt: (doc.frontmatter.createdAt ?? "") !== "" ? doc.frontmatter.createdAt : nowIso,
		updatedAt: nowIso
	}, doc.narrative, doc.covers, doc.orphans);
	await rebuildDerivedLayers();
	return ok(`已更新项目 \`${id}\`：\n` + changed.map((s) => `  · ${s}`).join("\n"));
}
/**
* **改项目描述**（`desc`）——`setProjectFields` 的薄包装（保留旧调用点）。
* @param id - 项目 id。
* @param desc - 新描述（≤200 字符）。
* @returns 结果。
*/
async function setProjectDesc(id, desc) {
	return await setProjectFields(id, { desc });
}
/**
* ⭐⭐⭐ **改某一节的「书写规范」**（决策 220 —— 用户 2026-10-12 要求可编辑）。
*
* ── 它改的是什么 ────────────────────────────────────────────────────────────
* `## <节名>` 下那个 ```memj:spec 围栏块（**块内文字 + 起始行的 `truncate` 标记**）。
* 用户原话：*"就 memj 存量的项目文档，章节下的章节规范，我希望也变成可编辑的。
* 编辑入口就放在…右侧详情页，书写规范块上给一下编辑按钮。"*
*
* ── 🔴🔴 四条设计边界（都是既有裁定，不是这次新定的）────────────────────────
* 1. **只改这一节自己的块** —— 该节正文、其它节、封面、（末尾那个旧的）
*    「本档写作规范」节**一字不动**。本项目既有分工是"正文的增删改查归 `memj_handoff`"，
*    本函数只碰**工具自己生成的**那一块。
* 2. **没有块就拒绝（`no-block`），绝不合成** —— 决策 207：
*    "已有文档没有规范就绝不替它合成"（不知道它该有哪几节，硬贴默认规范是主动误导）。
* 3. **`truncate` 标记改完要回写 frontmatter 镜像** —— 正文是权威
*    （`truncateTitlesFromBlocks`），而 `frontmatter.truncateSections` 是它的镜像；
*    ⚠️ **不跟手会把"哪节能自动截断"两处写成两样**（本项目最忌的"同一事实两份值"）。
*    ⇒ 这里**从新正文反解**再写，而不是"在旧数组上加减一个名字"
*      （后者在"旧镜像本来就与正文不一致"时会把错的那份固化下来）。
* 4. **走同一道归档守卫** —— 归档项目不可编辑（决策 133），与其它项目级写通道一致。
*
* ⚠️ **`metaOnly` 与正文长度无关**：不设上限（与模板那句"不限"一致）——
*    它不吃截断配额（`sectionCharCount` 把整块剔除），写长没有副作用。
* @param id - 项目 id。
* @param title - 节名（**精确匹配**）。
* @param spec - 新的规范正文。
* @returns 结果。
*/
async function setSectionSpec(id, title, spec) {
	const blocked = await guardProjectEditable(id);
	if (blocked !== null) return blocked;
	const name = title.trim();
	if (name === "") return no("缺少节名。");
	const doc = await loadProjectDoc(id);
	if (doc === void 0) return no(`项目 \`${id}\` 不存在。`);
	const before = sectionSpecsOf(doc.narrative).find((s) => s.title === name);
	const applied = setSectionSpecBlock(doc.narrative, name, spec);
	if (applied.status === "no-section") return no(`项目 \`${id}\` 的文档里没有「${name}」这一节（节名必须与正文的 \`## \` 标题逐字相同）。`);
	if (applied.status === "no-block") return no(`「${name}」这一节**没有书写规范块**——本项目不会替已有文档合成规范（不知道它该有哪几节，硬贴一份默认规范是主动误导）。要给它加规范，请直接在该项目的交接文档里手写一个 \`\`\`memj:spec 围栏块。`);
	if (before !== void 0 && before.spec === spec.trim()) return ok(`「${name}」的规范没有变化，未写入。`);
	const narrative = applied.narrative;
	const nowIso = (/* @__PURE__ */ new Date()).toISOString();
	await writeProjectDoc(id, {
		...doc.frontmatter,
		createdAt: (doc.frontmatter.createdAt ?? "") !== "" ? doc.frontmatter.createdAt : nowIso,
		updatedAt: nowIso
	}, narrative, doc.covers, doc.orphans);
	await rebuildDerivedLayers();
	const marks = [];
	if (before !== void 0 && before.spec !== spec.trim()) marks.push(`规范 ${[...before.spec].length} → ${[...spec.trim()].length} 字符`);
	return ok(`已更新项目 \`${id}\` 的「${name}」规范${marks.length > 0 ? `（${marks.join("；")}）` : ""}。`);
}
/**
* ⭐ **项目改名**——**先建后删**（用户拍板："能改先改，主题先添加再删除"）。
*
* 🔴 **为什么不是"就地改 frontmatter"**：项目 id **同时是文件名与全部封面的引用键**
*    （`HANDOFF-<id>.md`、封面的 `project` 字段、派生层里的归属）。
*    就地改要同时动 N 处，中途失败会留下**半迁移状态**（既不在旧、也不在新）。
*    ⇒ 改成：**把内容整体写到新 id → 校验 → 再删旧的**，任一步失败旧数据都在。
* @param oldId - 现项目 id。
* @param newId - 新项目 id。
* @returns 结果。
*/
async function renameProject(oldId, newId) {
	const to = newId.trim();
	if (to === "") return no("新项目 id 不能为空。");
	if (to === oldId) return ok(`新旧 id 相同（\`${oldId}\`），未改动。`);
	const blocked = await guardProjectEditable(oldId);
	if (blocked !== null) return blocked;
	const snapshot = await scanLibrary();
	if (!snapshot.projects.some((p) => p.id === oldId)) return no(`项目 \`${oldId}\` 不存在。`);
	if (snapshot.projects.some((p) => p.id === to)) return no(`项目 \`${to}\` **已存在**——改名不能覆盖已有项目。请先确认目标 id，或先删/改那个项目。`);
	const doc = await loadProjectDoc(oldId);
	if (doc === void 0) return no(`读不到项目文档 \`${oldId}\`。`);
	const movedCovers = doc.covers.map((c) => ({
		...c,
		project: to
	}));
	await writeProjectDoc(to, {
		...doc.frontmatter,
		project: to
	}, doc.narrative, movedCovers, doc.orphans);
	for (const c of movedCovers) if (!c.ext) await syncEntryFrontmatter(c);
	const check = await loadProjectDoc(to);
	if (check === void 0 || check.covers.length !== doc.covers.length) return no(`**改名中止**：新项目文档 \`${to}\` 写入后核对不上（封面数 ${check?.covers.length ?? 0} ≠ ${doc.covers.length}）。\n⚠️ **旧项目未删除**，数据没有丢——请检查库后重试。`);
	await deleteProjectDoc(oldId);
	await rebuildDerivedLayers();
	return ok(`已把项目 \`${oldId}\` 改名为 \`${to}\`（${movedCovers.length} 张封面一并迁移，旧文档已删除）。`);
}
/**
* 🔴 **删掉一个项目**（不可逆）。
*
* ⚠️ **旗下必须已无封面**——否则拒绝。
* 理由：级联删知识是**不可逆的大面积损坏**；而"先把知识迁走/删掉，再删项目"
* 只多一步，却随时可停。⇒ 默认站在**不毁数据**那侧（同决策 104 的偏置）。
* @param id - 项目 id。
* @returns 结果。
*/
async function deleteProject(id) {
	const blocked = await guardProjectEditable(id);
	if (blocked !== null) return blocked;
	const snapshot = await scanLibrary();
	if (!snapshot.projects.some((p) => p.id === id)) return no(`项目 \`${id}\` 不存在。`);
	const own = snapshot.covers.filter((c) => c.cover.project === id);
	if (own.length > 0) return no(`项目 \`${id}\` 下还有 **${own.length} 条知识**，**拒绝删除**。\n⚠️ 本项目**不级联删知识**——那会不可逆地毁掉这些内容。
请二选一：
  · 把它们**迁到别的项目**（改封面的 \`project\`）；
  · 或**逐条删除**这些 entry（各带一次确认）。
涉及：${own.slice(0, 5).map((c) => `\`${c.cover.id.slice(0, 8)}\``).join("、")}${own.length > 5 ? ` 等 ${own.length} 条` : ""}`);
	await deleteProjectDoc(id);
	await rebuildDerivedLayers();
	return ok(`已删除空项目 \`${id}\`。`);
}
/**
* ⭐ **改主题的显示名与描述**（决策 115）。
*
* 🔴 **"改名"改的是 `title`，不是 `theme`**（同项目：`theme` 是**所有封面的引用键**）。
* ⚠️ 只改给的字段；`title` 允许清空。
* @param id - 主题 id。
* @param fields - 要改的字段（`title` / `desc`）。
* @returns 结果。
*/
async function setThemeFields(id, fields) {
	const snapshot = await scanLibrary();
	if (!snapshot.themeIds.includes(id)) return no(`主题 \`${id}\` 不存在。`);
	const prior = await loadThemeFrontmatter(id);
	const nextTitle = fields.title !== void 0 ? fields.title.trim() : void 0;
	if (nextTitle !== void 0 && [...nextTitle].length > 48) return no(`主题名超长：${[...nextTitle].length} 字符（上限 48）。`);
	const nextDesc = fields.desc !== void 0 ? fields.desc.trim() : void 0;
	if (nextDesc !== void 0) {
		if (nextDesc === "") return no("主题描述不能为空。");
		if ([...nextDesc].length > 200) return no(`主题描述超长：${[...nextDesc].length} 字符（上限 200）。`);
	}
	if (nextTitle === void 0 && nextDesc === void 0) return ok(`主题 \`${id}\` 没有需要改的字段。`);
	const changed = [];
	if (nextTitle !== void 0 && nextTitle !== (prior?.title ?? "")) changed.push(`title: ${(prior?.title ?? "") === "" ? "(未设置)" : `「${prior?.title}」`} → ${nextTitle === "" ? "(已清空)" : `「${nextTitle}」`}`);
	if (nextDesc !== void 0 && nextDesc !== (prior?.desc ?? "")) changed.push("desc 已更新");
	if (changed.length === 0) return ok(`主题 \`${id}\` 没有需要改的字段（值都相同）。`);
	const covers = snapshot.covers.filter((c) => c.cover.theme.includes(id)).map((c) => c.cover);
	const projectIds = [...new Set(covers.map((c) => c.project).filter((p) => p !== ""))];
	await writeThemeDoc(id, nextDesc ?? prior?.desc ?? "", covers, projectIds.map((p) => ({
		id: p,
		desc: snapshot.projects.find((x) => x.id === p)?.frontmatter.desc ?? ""
	})), true, nextTitle, (/* @__PURE__ */ new Date()).toISOString());
	return ok(`已更新主题 \`${id}\`：\n` + changed.map((s) => `  · ${s}`).join("\n"));
}
/**
* **改主题描述**（`desc`）——`setThemeFields` 的薄包装（保留旧调用点）。
* @param id - 主题 id。
* @param desc - 新描述（≤200 字符）。
* @returns 结果。
*/
async function setThemeDesc(id, desc) {
	return await setThemeFields(id, { desc });
}
/**
* ⭐ **主题改名**——**先建后删**（同 `renameProject` 的理由）。
*
* 主题是封面的 `theme` 数组里的**引用键** ⇒ 改名要把所有引用它的封面一并换掉。
* @param oldId - 现主题 id。
* @param newId - 新主题 id。
* @returns 结果。
*/
async function renameTheme(oldId, newId) {
	const to = newId.trim();
	if (to === "") return no("新主题 id 不能为空。");
	if (to === oldId) return ok(`新旧 id 相同（\`${oldId}\`），未改动。`);
	const snapshot = await scanLibrary();
	if (!snapshot.themeIds.includes(oldId)) return no(`主题 \`${oldId}\` 不存在。`);
	if (snapshot.themeIds.includes(to)) return no(`主题 \`${to}\` **已存在**——改名不能覆盖。请先确认目标 id，或先删/改那个主题。`);
	const prior = await loadThemeFrontmatter(oldId);
	const desc = prior?.desc ?? "";
	const title = prior?.title ?? "";
	const affected = snapshot.covers.filter((c) => c.cover.theme.includes(oldId));
	const byProject = /* @__PURE__ */ new Map();
	for (const c of affected) {
		const list = byProject.get(c.cover.project);
		if (list === void 0) byProject.set(c.cover.project, [c.cover]);
		else list.push(c.cover);
	}
	for (const [projectId, list] of byProject) {
		if (projectId === "") continue;
		const doc = await loadProjectDoc(projectId);
		if (doc === void 0) continue;
		const next = doc.covers.map((c) => c.theme.includes(oldId) ? {
			...c,
			theme: [...new Set(c.theme.map((t) => t === oldId ? to : t))]
		} : c);
		await writeProjectDoc(projectId, doc.frontmatter, doc.narrative, next, doc.orphans);
		for (const c of next) if (c.theme.includes(to) && !c.ext) await syncEntryFrontmatter(c);
	}
	await writeThemeDoc(to, desc, [], [], false, title);
	await rebuildDerivedLayers();
	const after = await scanLibrary();
	if (!after.themeIds.includes(to)) return no(`**改名中止**：新主题 \`${to}\` 未能建立。⚠️ 旧主题未删，请检查库后重试。`);
	const stillOld = after.covers.filter((c) => c.cover.theme.includes(oldId)).length;
	if (stillOld > 0) return no(`**改名中止**：仍有 ${stillOld} 张封面指向旧主题 \`${oldId}\`。\n⚠️ 未删除旧主题文档，请检查后重试。`);
	await deleteThemeDoc(oldId);
	await rebuildDerivedLayers();
	return ok(`已把主题 \`${oldId}\` 改名为 \`${to}\`（${affected.length} 张封面的引用一并更新，旧主题文档已删除）。`);
}
/**
* 🔴 **删掉一个主题**（不可逆）。
*
* ⚠️ **旗下必须已无封面**——同 `deleteProject` 的理由（不级联）。
* ⚠️ 主题是**派生层**：光删 `THEME-*.md` 没用，只要还有封面提它就会被重建回来
* ——所以本函数**强制要求先摘干净引用**。
* @param id - 主题 id。
* @returns 结果。
*/
async function deleteTheme(id) {
	const snapshot = await scanLibrary();
	if (!snapshot.themeIds.includes(id)) return no(`主题 \`${id}\` 不存在。`);
	const users = snapshot.covers.filter((c) => c.cover.theme.includes(id));
	if (users.length > 0) return no(`主题 \`${id}\` 还被 **${users.length} 张封面**引用着，**拒绝删除**。\n⚠️ 主题只是**派生索引**——不摘干净引用，删了也会被下次重建带回来。
请先摘除这些引用（每条改封面的 \`theme\`），再删主题。
涉及：${users.slice(0, 5).map((c) => `\`${c.cover.id.slice(0, 8)}\``).join("、")}${users.length > 5 ? ` 等 ${users.length} 条` : ""}`);
	await deleteThemeDoc(id);
	await rebuildDerivedLayers();
	return ok(`已删除空主题 \`${id}\`。`);
}
//#endregion
//#region src/template-tool.ts
/**
* 决定该次调用是"待确认"、"执行"还是"拒绝"。
*
* 🔴 **`list` 不需确认**（只读、零副作用）—— 要求确认反而会让模型没法先看有哪些模板。
* @param req - 模型给的请求。
* @returns 决策。
*/
function decideTemplateTool(req) {
	const action = req.action;
	if (action !== "list" && action !== "create" && action !== "delete") return {
		kind: "reject",
		message: `未知的 action：\`${String(action)}\`。只能是 list / create / delete。`
	};
	if (action === "list") return { kind: "run" };
	if (action === "create") {
		if (req.template === void 0 || req.template === null) return {
			kind: "reject",
			message: "`action: \"create\"` 必须给 `template`。"
		};
	}
	if (action === "delete") {
		const id = (req.id ?? "").trim();
		if (id === "") return {
			kind: "reject",
			message: "`action: \"delete\"` 必须给 `id`。"
		};
		if (id === "default") return {
			kind: "reject",
			message: "内置模板 `default` 不可删除。"
		};
	}
	if (req.confirm !== true) return {
		kind: "needs-confirm",
		message: confirmMessage(req)
	};
	return { kind: "run" };
}
/**
* 生成"待用户确认"的回执。
*
* 🔴 **这份文案是给模型看的**，要求它把内容转达给用户、并在**用户明确同意后**
*   才带 `confirm: true` 再调 —— ⚠️ 措辞必须**明确要求用户确认**，
*   不能写成"已保存"（那会让模型以为做完了）。
* @param req - 模型给的请求。
* @returns 回执文本。
*/
function confirmMessage(req) {
	if (req.action === "delete") return `⏸️ **待确认**：要删除模板 \`${(req.id ?? "").trim()}\`。\n\n请把这个操作**告诉用户并取得同意**；用户同意后，带 \`confirm: true\` 重调一次。
⚠️ 本次**什么都没做**。
⭐ 删除模板**不影响任何已有文档** —— 文档记着自己的节名，与模板已解耦。`;
	const t = req.template;
	const id = typeof t?.id === "string" ? t.id : "(未命名)";
	const title = typeof t?.title === "string" ? t.title : "";
	const secs = Array.isArray(t?.sections) ? t.sections : [];
	const names = secs.map((s) => s !== null && typeof s === "object" ? String(s.name ?? "") : "").filter((s) => s !== "");
	const hasArchiving = secs.some((s) => s !== null && typeof s === "object" && /归档|history/i.test(String(s.desc ?? "")));
	return `⏸️ **待确认**：要新建/覆盖模板 \`${id}\`${title !== "" ? `（${title}）` : ""}，共 ${names.length} 节：\n` + (names.length > 0 ? `${names.map((n) => `  · ${n}`).join("\n")}\n` : "") + (hasArchiving ? "" : "⚠️ **这些节的规范里都没有写归档规则** ⇒ 用它的文档**超长时不会自动瘦身**。\n⭐ 归档现在由模型按**各节规范里的自然语言**执行；若希望某一节瘦身，把规则写进那一节的 `desc`。\n") + "\n请把这个模板**逐节告诉用户并取得同意**；用户同意后，带 `confirm: true` 重调一次。\n⚠️ 本次**什么都没做**（模板尚未写入）。";
}
//#endregion
//#region src/tool-descriptions.ts
/**
* 各工具的 `description` 原文。
*
* 🔴🔴 **本文件是【源头】——直接改它，不需要动任何设计文档。**
*   ⚠️ 它以前由 `scripts/gen-descriptions.mjs` 从 `memj-design.md` §4.2 生成，
*     **现已解耦**（2026-10-12，用户裁定）：那条生成链**不在 `run-all-tests` 回路里**，
*     也不会再重写本文件。生成器降级为**一次性迁移工具**（要从设计文档重拉一次正文时才跑）。
*   ⭐ **为什么解耦**：「提示词」设置页要有「把页面的修改**写回源码**」这个能力——
*     而只要生成链还在回路里，写回的代码就会被生成器**静默覆盖** ⇒ 写回等于白写。
*     （与 `context.ts` 当初的解耦同一做法。）
*   ⚠️ **代价（已知并接受）**：设计文档 §4.2 会**逐渐过时**，不再有逐字节校验；
*     已在该节顶部加了「本节已不再与代码同步」的提示。
*
* ⚠️ **为什么这些文本要集中在一个文件**：它们是**每步都进上下文**的内容
*   （wire `tools` 段），一旦漂移，模型看到的行为规范就与实现不符。
*
* @module dsh-memj/tool-descriptions
*/
/** `memj_info` 的 description 原文。 */
const MEMJ_INFO_DESCRIPTION = `列出 memj 库里有哪些**项目**和**主题**（各自的 id 与名称）。

可选参数 query：**检索词数组**，按词筛项目与主题，只回相关的那几个。
  规则与 memj_search 一致：给你**提炼过的语义词**（不是原句），**整词命中才算分**；
  匹配 id、名称与描述。**没有命中就如实说没有匹配**（不要回退成全部清单）。
  库里语境多时**务必用它缩小范围**——例：做 handoff 前先
  memj_info({ query: ["memj", "记忆系统"], kind: "project", withDesc: true })
  看该写成哪个项目。
可选参数 kind：'project' 或 'theme'，**只查其中一类**；不给则两类都回。
  例：判断"更新还是新建项目"时用 kind: "project"，免得主题清单占版面。
可选参数 withDesc：为 true 时附带项目与主题的描述，便于判断该用哪个语境；
  默认 false（只回 id 与名称，最省 token）。
  ⚠️ 判断"是不是同一个项目"时**必须**开 withDesc——描述是唯一依据。

**本工具不返回知识条目**——要看某语境下有哪些知识，用 memj_search。
典型用法：先调 memj_info 拿到项目/主题 id ⇒ 再用 memj_search 按语境筛 ⇒ 再用 memj_read 取正文。`;
/** `memj_search` 的 description 原文。 */
const MEMJ_SEARCH_DESCRIPTION = `检索知识**封面**（只回封面，不回正文）。三种筛法可单用或组合：
- project：按归属项目筛，给项目 id；
- theme：按命中主题筛，给主题 id；
- query：**检索词数组**。

⚠️ query 要给你**提炼过的检索词**，不要给用户的原句：
  用户说"注入缓存那个机制是怎么回事" ⇒ 传 ["注入缓存", "缓存", "注入"]；
  用户说"插件构建那个 src 和 lib 的坑" ⇒ 传 ["构建", "插件", "src", "lib"]。
  每个词都必须**自带语义**（不要给"入缓"这种无意义字串）；
  长词和它的子词可以同时给，命中长词得分更高。
  多词之间取 OR（命中任一即入选），命中词多的排在前面。

匹配是**整词命中**（不做二次切分），所以你自己给的词就是唯一的分词依据。
项目、主题筛与 query 可并用；**本工具不接受 global**。

返回的每张封面上有 title（标题，**来自封面本身**）与 size（正文字符数，仅在带 query 时给出）——
size 用来**判断下一步该不该按节读**：size 大就先用 memj_read 的 section 取具体节，别整篇倒进上下文。
检索命中后，用 memj_read 按 id 取正文——不要凭标题猜内容。
搜不到就如实说搜不到，不要用别的封面凑数。`;
/** `memj_read` 的 description 原文。 */
const MEMJ_READ_DESCRIPTION = `读取一条知识的**正文**，或一份**项目交接文档**的正文。

⚠️ 两个入口，**二选一**：
- \`id\`（知识条目的 UUID，从 memj_search 的封面里拿）；
- \`project\`（⭐ 项目文档 id，如 "dsh-memj"）——读该项目的交接文档正文。
  🔴 **写交接文档（\`doc\`）之前必须先读一遍它**，否则 memj_handoff 会拒绝。
  ⭐⭐⭐ **读的时候留意每一节标题下的 \`memj:spec\` 围栏块** ——
  那里面写着**这一节要写什么、怎么写、怎么压**（= 这一节的写作规范）。
  ⇒ **写某一节之前按它写**；⚠️ 但那个块**由工具维护，你不要写它**（写了也会被盘上那份覆盖）。

**默认按文档大小分流，别让长文档整篇占满上下文**：
- 短文档（约 3000 字符以内）⇒ 直接返回全文；
- 长文档 ⇒ 返回**节名清单** + 开头预览，让你用 section 指定要哪一节；
- 文档里没有 ## / ### 章节 ⇒ 只能返回全文（会提示"无法节选"）。

参数：
- section：按 ## / ### 标题取某一节，如 section: "四阶段机制"。
  大小写不敏感、允许子串匹配；**匹配不上不会报错，而是回给你该文档的节名清单**，
  你据此重挑一个即可。
  ⚠️ 读项目文档时若**只按节读**，必须**把全部节都读到**
  （\`memj_handoff\` 会核对"读全了没有"，漏节会被拒）。
- full: true：**强制返回全文**——确实需要通读整篇时用（如要重写这份知识）。
- offset / limit：按行区间取（兜底用）。

正文可能在库里（内部条目），也可能是外部路径上的已有文档（封面标了 ext）——两种都直接读。
找不到该 id 时如实返回，不要用别的内容替代。

（工具会自动记下这次阅读。若你读的是**别的项目**的知识，
写 handoff 时这些记录会作为"可能该提炼成主题"的证据回给你——你无需自己记。
⚠️ 具体清单**用 \`memj_snapshots\` 取**。）`;
/** `memj_snapshots` 的 description 原文。 */
const MEMJ_SNAPSHOTS_DESCRIPTION = `读出**本会话的读快照清单**——你在本次会话里用 memj_read 读过的知识。

⭐ **调用时序（别搞反）**：
1. 先确定本次的项目 id（【更新】已有项目 还是【新建】项目）——⭐ **优先看本会话上文**
   （上一次 memj_handoff 的调用参数与回执里就写着项目 id）；上文不足以确定时才调 memj_info；
2. 再调本工具，把该 id 传进 project 参数。

参数：
- project（**必填**）：本次要落盘的目标项目 id。工具会筛出
  \`快照.project ≠ project\` 的那些——**这些才是"跨项目复用"的证据**。
- scope：
  - 'cross'（默认）：只回**别项目**的快照（project ≠ 传入值）。
  - 'all'：连本项目自己的也回。

⭐ **返回值会明说本实例的校验模式**——严格 / 宽松，
以及"本次有没有跨项目证据、因此能不能新建主题"。**这是你获知模式的唯一途径**
（协议与工具描述本身**不分模式、保持中性**）。

拿到清单后**逐条判断"它确实和本次要落盘的项目相关吗"**——
「读过」不等于「用上了」；顺手翻到的、探索性读的都要排除。

⚠️ 本工具**只读**，不消费也不清理；消费发生在 memj_handoff 里。
⚠️ 它不返回待批提名与断链——那是给人看的信息，走 /memj-review 与网页 UI。`;
/** `memj_handoff` 的 description 原文。 */
const MEMJ_HANDOFF_DESCRIPTION = `写入或更新一份**项目级 handoff 文档**（\`projects/HANDOFF-<项目>.md\`），并落盘它引用的知识。

⭐ **外部文档入库**用 \`adopt\`（把正文收进库）；**只引用不搬动**则在该条 \`entries[]\` 上
给 \`ref\`（绝对路径）+ \`ext: true\`（**不搬动原文件**，正文永远留在库外）。

**\`project\`**：库里已有 ⇒ **更新**；没有 ⇒ **新建**（连同骨架一起建立；⚠️ **节名/节数以该项目的模板为准**，
  回执会**现报**这次用的模板与它的真实节清单）。

**\`project\` 归属**：新 id 与库里已有 id 相似（如 \`dsh_memj\` vs \`dsh-memj\`）⇒
工具**不会直接建**，会回相似项要你确认；确认要新建就带 \`confirmCreate: true\` 再调一次。
⚠️ **新建项目必须给 \`projectDesc\`**（≤200 字符），格式：
「<这是什么项目>；当<什么场景>时来这个项目找知识。」

⛔ 知识归属：\`theme\` **只能填已存在的主题 id**——填不存在的**会被拒**。
   要新建主题用 \`newThemes\`（见 \`step:'theme'\`）。**挂靠本身无门槛。**

**写封面时的四条硬约束**（违反会被拒或静默出错）：
- **① \`newThemes\`**：本实例可能是**严格模式**——那时必须有**别项目的知识**被本次采用作证据，
  否则工具**拒收**。（\`memj_snapshots\` 的返回值会明说本实例是哪种模式。）
- **② 项目挂靠主题**：⭐ 你**不用单独做什么**——填好 \`entries[].theme\` 即可，
  项目 frontmatter 的 \`themes:\` 由工具重建时**自动汇总**。
  ⚠️ \`themes:\` **不是参数**，不要去找它。
- **③ \`linkedSnapshots\`**：工具**只补挂你列出的**；**省略 = 一条都不挂**（fail-closed）。
  填的必须是**有效 id**，否则**整份不写入**。
- **④ \`global\`**：\`entries[].global = true\` 只是**登记提名**——
  封面 \`global\` **保持 \`false\`**，**批准那一刻才置位**。

### \`doc\` 按节合并（**不是重写**）

🔴🔴 **写 \`doc\` 之前，必须先在本次对话轮次里读一遍现有文档**（**工具会拒绝**）：
\`memj_read({ project: "<本项目 id>" })\` 读全文；或按 \`section\` **逐节读完**。
⚠️ **漏节会被拒**——因为漏读的节可能在你的 \`doc\` 里被**整节覆盖**。
⚠️ **新项目不需要这一步**（本来就没文档）；**上一轮读过也不算**。

⭐⭐⭐ **节名不是固定的——以【这份文档正文里的 \`##\` 标题】为准（唯一来源）。**

🔴 封面的 \`sections\` 字段**已删除**（2026-10-05）—— 节名**只认正文**，不再有第二份副本。
每份文档都可能不同：默认模板是下面这六节，自定义模板则**完全不同**
（实测有 \`研究目标 / 公司画像 / …\` 这类）⇒ **不要凭印象套固定清单、也别把别项目的节名套过来**：
错位是**静默的**（写进"看起来不存在"的节，工具不报错）。

⭐ **怎么拿真值**（按可靠性排序）：
1. ⭐⭐⭐ **每节标题下那个 \`memj:spec\` 围栏块** —— **它不只是节名，它就是这一节的写作规范**，
   ⇒ **写某一节之前先读它、按它写**。
   ⚠️ 那是工具维护的，**你不要写它**（写了也会被盘上那份覆盖）；要改就直接改文档里那一节。
2. 少数老文档还没有规范块 ⇒ **看文末的 \`## 本档写作规范\` 一节**；
   两者都没有 ⇒ **以正文现有的 \`##\` 标题为准**（节名只认正文）；
3. 新建时 \`template\` 决定节名（回执会现报节清单）；
4. 每轮回执首行报「📐 本项目节名」，并检出与模板契约不一致。

⚠️ **正文一个叙事节都没有时**才回落这六节（顺序固定、缺的补空标题）：
\`目标\` / \`当前进度\` / \`有效做法\` / \`失败/踩坑\` / \`关键上下文\` / \`下一步\`。

⭐ 末节 \`## 沉淀知识\` **由工具生成**（只放封面）⇒ 别写进 \`doc\`（会连其后内容整段砍掉）。

**合并规则**：两种写法，**长文档必须用第二种**。

| 你怎么给 | 结果 |
|---|---|
| **只给 \`doc\`** | 按 \`##\` 节名对号入座：写了某节 ⇒ **整节替换**；没写的节 ⇒ **保留旧内容** |
| ⭐ **给 \`docSection\` + \`docOp\`** | **只动那一节**，你只需给**要变的那部分** |

### ⭐⭐ 按节写（\`docSection\` + \`docOp\`）—— 推荐；长文档**只能**这样

| \`docOp\` | 做什么 | 用途 |
|---|---|---|
| \`append\`（**缺省**） | 追加到该节**末尾** | 新增进展 |
| \`prepend\` | 追加到该节**开头** | 新增进展（放最前） |
| \`replace\` | **替换**该节（给出的必须是**该节完整新内容**） | 重写某一节 |
| \`drop\` | **删除**该节 | 去掉整节 |

- \`docSection\` 是节名（子串匹配）；**顶层 \`##\` 节与 \`###\` 子节都可以**。
  ⚠️ 子串匹配**可能命中你没点名的那个节**（例：项目里有「研究目标」而你传「目标」）
  ⇒ **回执会回显它实际命中的是哪个节**；看到与你不一致，**先停下来核对**。
- ✅ 追加时 \`doc\` **只给正文片段、不要带节标题**（带了会被拒）。
- ✅ 指向子节时，**只动那个子节，它的兄弟子节全保留**。
- 🔴 **\`docOp\` 缺省是 \`append\`**：忘给参数时**只会追加、不会覆盖**（覆盖须显式 \`replace\`）。
- 🔴 **文档瘦身/归档由【你】按各节规范执行**：规则在各节规范里（自然语言），
  工具**不会替你归档**，只**报数**（\`##\` 与 \`###\` 两级字符数）。
  ⭐ **四步流程 + 两个坑见运行时上下文「文档瘦身 / 归档」**。
  ⚠️ 超标就**当场整理**；**"报了但不做"是已知风险**。
- ⚠️ 找不到该节 ⇒ 回**全部可用节名**，请重挑（不猜、也不新建）。
- ⚠️ \`drop\` 删到只剩标题 ⇒ **回执会报警**（工具分不清"故意删空"与"误删"）。

### 只给 \`doc\` 时（整节替换）——**必须带上该节完整内容**

🔴🔴 **"写了某一节" = 把这一节的完整内容写出来**，不是只写这次新增的那一小段。
- ✅ 该节原有 3 段 ⇒ 把**原有 3 段 + 新段一起**写进去。
- ⭐ **更好的做法**：改用 \`docSection:"<该节名>"\` + \`docOp:"prepend"\`，**只给新段**——
  **结构上不可能丢历史**（长节尤其必须这样）。
- ❌ 只写"新增的那一段"又**不给 \`docSection\`** ⇒ 整节被替换、**原有内容全消失**。
- 📌 **判据**：**"没写的节"受保护，"写了但写不全的节"不受保护。**

⇒ 只写"有变化的那几个节"就够（**没变化的节整个不用出现**）。
要**清空**某节：把节标题写出来、内容留空或写「（无）」。
⚠️ 节名清单**之后**可以另起 \`##\` 自定义节（排在清单之后、\`## 沉淀知识\` 之前）。

**知识的两种落盘方式**（都走 \`entries[]\`；选哪种决定要不要给 \`ref\`/\`ext\`）：

| | 何时用 | 该条要给的字段 |
|---|---|---|
| **落库**（默认） | 会话总结出的新知识 | \`body\`（必填）；\`ref\`/\`ext\` **不要填**（工具自动生成路径） |
| **外部引用** | 已存在的库外文档（**不搬动**，正文留在原处） | \`ref\` = **绝对路径**（必填）+ \`ext: true\`；**\`body\` 仍必填**（写 **200 字以内摘要**，⛔ 不贴全文） |

⚠️ 两者互斥：给 \`ref\` 就必须同时 \`ext: true\`；落库条目给了 \`ref\` 会被拒。
🔴 **外部引用绝不去写/改那个库外文件**——与本插件"不动库外文件"的边界一致。

**入库外部文档**用 \`adopt\`：\`mode:'copy'\`（工具自己读全文写进 entries，**你不必贴回来**）
或 \`mode:'extract'\`（你通读后把要点写成 \`body\`）。
⚠️ 入库后**封面替换**（\`ref\` 改库内路径、**去掉 \`ext\`**），**不并存**；
原始路径由工具写进正文顶部作溯源。**由你当场判定，无需批准。**
⚠️ \`adopt\` **只负责把正文收进库**——它**不替你**建项目、挂主题、或填 \`slug\`/\`title\`/\`desc\`/\`tags\`。

**\`entries[]\` / \`adopt[]\` 的字段**（违反任一 ⇒ 该条**被拒**，且**整份不写入**）：

| 字段 | 必填 | 取值 / 上限 |
|---|---|---|
| \`slug\` | 是（强烈建议） | 全小写英文/数字/连字符，**2–48**；**同时是查重键** |
| \`title\` | ✅ | **2–48** 字符的具体名词短语（**权威来源；检索不必读正文**） |
| \`desc\` | ✅ | **≤200** 字符（**检索键**，不是摘要） |
| \`tags\` | ✅ | 至少 1 个 |
| \`body\` | ✅ **都必填** | 落库 = 正文 markdown（须以标题行开头）；**外部引用 = 200 字以内的摘要**（⛔ 不贴全文） |
| \`ref\` | **外部引用时必填** | 库外文档的**绝对路径**；⚠️ **落库条目不要给**（工具自动生成） |
| \`ext\` | 与 \`ref\` 配套 | 外部引用填 \`true\`；落库不填 |
| \`kind\` | 否 | 只能 <!--memj:kind-list-->，或留空 |
| \`theme\` | 否 | **只能填已存在的主题 id**（要新建用 \`newThemes\`） |
| \`project\` | 否 | 归属项目 id；留空 = 无项目归属 |
| \`global\` | 否 | \`true\` = 跨主题共用（**只登记提名，待批准**） |
| \`overwrite\` | 否（默认 \`false\`） | 同 \`slug\` 已存在时：**缺省 ⇒ 拒绝**；\`true\` ⇒ **就地替换**（复用原 \`id\`/\`ref\`，不新增文件） |

**三条硬约束**：
1. 🔴 **\`slug\` 是查重键**——库里已有同 slug ⇒ **拒绝**（除非 \`overwrite: true\`）。
2. 🔴 **归属不能三空**：\`project\` 空 + \`theme\` 空 + 未申请 \`global\` ⇒ **拒收**。
   （三者**不是三选一**——可以同时有值，原归属不消失。）
3. 🔴 **\`id\` 由工具生成，你不用给**。

**写入被拒的情形**（任一条成立 ⇒ **整份文档不写入**）：
- 围栏不成对 / 缺 id / 缺 \`desc\` / 缺 \`ref\` / \`desc\` 超 200 字符；
- **归属三空**：\`project\` 空 + \`theme\` 空 + 未申请 \`global\`。
  （三者**不是三选一**——可以同时有值，原归属不消失。）

⚠️ **不校验正文格式，也不强制 \`kind\`**——只判上面这些**可判定的**。`;
/** `memj_promote` 的 description 原文。 */
const MEMJ_PROMOTE_DESCRIPTION = `把知识**推进归属**，或**修改/删除已有的封面**。**归属是累加，不是搬家**：推进后原有归属全部保留。

⚠️ **通常不需要你直接调它**：写 handoff 时的归属落位由 memj_handoff 一并完成
（它在建主题、写封面、提全局上更顺手，也不会打断你的 handoff 流程）。
本工具用于**事后/独立**的场景（如批量补挂、改错、摘除）。

**一、增删主题（累加语义）**
- \`addThemes: [主题id...]\`：往封面的 theme 数组**追加**这些 id（已存在的去重）。
- \`removeThemes: [主题id...]\`：从 theme 数组**移除**这些 id（挂错了用这个）。
  ⚠️ \`removeThemes\` **只能填已存在的主题 id**——本工具**不新建主题**；
  要新建主题请走 \`memj_handoff\` 的 \`newThemes\`。
- 🔴 **不要覆盖已有归属**：不要用新的 theme 数组替掉旧的，也不要因为加入全局就清空 project/theme。

**二、改封面的字段**
- \`setFields: { title?, desc?, tags?, kind? }\`：**只改你给的字段**，没给的保持不变。
  · \`kind\` 是受控词表（<!--memj:kind-list-->），空串 = 改回"未分类"。
  ⚠️ 它**只改封面（与条目正文的 frontmatter）**，**不动正文内容**。

**三、global**
- \`setGlobal: true\`：置真并**登记一条待批准提名**。
  ⚠️ 注意：**用户在网页上勾选是直接生效的**（他本来就是审批者）——
  这条限制**只针对你**。
- \`setGlobal: false\`：**取消** global，并清掉它的提名。

**四、项目 / 主题级操作（\`action\`）**
- ⭐ \`{ kind: 'setProjectFields', id, title?, desc? }\` / \`{ kind: 'setThemeFields', id, title?, desc? }\`
  **只改你给的字段**。⭐ **\`title\` 是显示名**——**改它不动 id**，
  所以**不影响任何引用**；\`title: ''\` = 清空（回落成显示 id）。
  ⇒ **想让项目/主题"改个名字"，用这个**，不要用 \`rename*\`。
- \`{ kind: 'setProjectDesc', id, desc }\` / \`{ kind: 'setThemeDesc', id, desc }\`
  （只改描述；等价于只传 \`desc\` 的上面那个）
- \`{ kind: 'renameProject', id, newId }\` / \`{ kind: 'renameTheme', id, newId }\`
  🔴 **这是改 id 本身**（另一种需求）——⭐ **先建后删**：把内容迁到新 id、
  校验通过，才删旧的 ⇒ 中途失败**不丢数据**。
  ⚠️ 会**改写所有引用**（封面的 project / theme），因此**不要用它来"改名"**。
- \`{ kind: 'deleteProject', id }\` / \`{ kind: 'deleteTheme', id }\`
  🔴 **只允许删空容器**：旗下还有知识/引用 ⇒ **拒绝**（本工具**不级联删知识**）。
  要删就先把它旗下的条目迁走或逐条删掉。
- \`{ kind: 'deleteEntry', id }\`
  🔴 **不可逆**：删封面 + **内部正文文件**。⚠️ 外部引用（ext）**只移封面**，
  **绝不去删库外那个文件**（它不属于 memj）。

参数 refs 是封面 id（UUID）数组。`;
/** `memj_update` 的 description 原文。 */
const MEMJ_UPDATE_DESCRIPTION = `更新**一条已有知识**的内容（正文，以及可选的封面字段）。

**什么时候用它**：
- 你在 handoff / 沉淀知识时，先 memj_search + memj_read 发现了**相似的已有条目**
  ⇒ **更新它**，而不是再写一条新的（避免库内重复）；
- 某条知识的**事实过期**了 ⇒ 在那个时机刷新它。

参数：
- id（必填）：封面 UUID。
- body（可选）：**给了就替换正文**。
- fields（可选）：封面字段 { title?, desc?, tags?, kind? }，规格同 entries。
⚠️ 至少要给 body 或 fields 之一；**只给要改的**，没给的保持不变。

🔴 **外部引用（ext: true）不能改正文**——它的文件在库外、不属于 memj，
   本工具**绝不去动库外那个文件**。

🔴 **与 memj_promote 的分工**：那个**只碰元数据、不碰正文**；
   要动正文就用本工具。`;
/** `memj_rebuild` 的 description 原文。 */
const MEMJ_REBUILD_DESCRIPTION = `从库里的全部项目级 handoff 文档（\`projects/\`）重建派生层
（\`themes/THEME-<id>.md\`、\`GLOBAL.md\`）——派生层列的是**封面索引**，不是正文副本。

同时校验每张封面的格式（围栏、id、desc、ref、归属字段），
因为人可以手改这些文档。**非法封面跳过重建并记入报告**（合法照常重建，不阻断）。
⭐ 返回值里**恒常**给一行体检结论（N 张合法 / M 张非法）；
**明细（哪几处）只报给人**（\`/memj-review\` 与网页 UI），不在返回值里。
⚠️ **要查/改 memj 自身状态，优先调本工具（或其它 \`memj_*\` 工具），
不要绕过工具去 import 内部函数写脚本**——工具带着封面校验层，绕过它
等于**静默把校验漏掉**。

派生文档是**投影**：手改会被下次重建覆盖——**要改知识就改 handoff 封面**。
不带参数为全量重建；给 \`project\` 则只重建涉及该项目的部分。`;
/** `memj_template` 的 description 原文。 */
const MEMJ_TEMPLATE_DESCRIPTION = `管理「交接文档模板」——用户可自定义交接文档的结构（节名、节数、每一节要干嘛）。

## 它解决什么
交接文档默认是六节。用户可以用模板**完全自定义**：自己定节名、节数、每节用途。
⭐ 模板**存成可读的 markdown**（\`templates/<id>.md\`，每节一个 \`## \` 标题 + "这一节要干嘛"）；
默认模板 \`default\` **也落盘、也可以编辑**（它就是"没指定模板时用的那套"）。

## 🔴 什么时候用
- **新建项目前**：先 list 看有哪些模板，再在 memj_handoff 里传 template 参数。
- **用户想建/改文档结构时**：用 create 建一份新模板给以后的项目用。

## 🔴🔴 两段式确认（必须遵守）
create / delete **不会立刻执行**：第一次调用只回一份「待确认」回执。
你必须**把回执内容转达给用户并取得明确同意**，然后才带 confirm: true 重调一次。
⚠️ 不要在第一段就说"已经建好了"——那时**什么都没发生**。
list 不需要确认。

## 参数
- action: 'list'（列出全部模板）/ 'create'（新建或覆盖）/ 'delete'（删除）。
- template: create 时给，形状为
  { id, title, sections: [{ name, desc }] }。
  ⭐ desc 必填——它就是**这一节的书写规范**（会进该节的规范块，模型按它写这一节）。
  🔴 **归档规则也写在 desc 里**（自然语言）：想让某一节自动瘦身，就在它那段规范里
  写清"超过多少字符、把什么归档成什么类型、原处留什么"。⚠️ **把数字写死**
  （如"超过 20000 字符"）——因为工具会把实际字数报给模型，有确切数字才对照得上。
  ⭐ id 给 \`default\` 就是**改默认模板**（合法，不是错误）。
- id: delete 时给要删的模板 id。
- confirm: 用户同意后才传 true。

## 三条硬约束（违反会被拒）
1. 节名不能是「沉淀知识」——那一节由工具维护（封面存在那里）。
2. **节名之间不得互为子串**——按节读取是子串匹配，互为子串会一次命中两节。
3. 节名不能为空、不能重复；\`desc\`（**这一节的书写规范**）必填 ——
   ⭐ **没有字数上限**（它不吃截断配额，写多长都行；超过 2000 字会有一条**提醒**，不阻断保存）。

## 边界
- 模板**只影响【新建项目】**；已有文档记着自己的节名，**改模板、删模板都不影响它们**。
- 删除模板**不会**动任何文档。
- \`default\` **可编辑、不可删**（删了就没有回落目标了）。`;
/** `memj_normalize_tags` 的 description 原文。 */
const MEMJ_NORMALIZE_TAGS_DESCRIPTION = `规范化库里的标签（tags）：把同义/大小写变体合并到规范词，去掉纯泛化词，
并给规范词补英文（供中文不好的模型用）。

## 什么时候调
⭐ 沉淀完知识之后**单独调一次**（与 memj_handoff 解耦）。
不要期望 handoff 自动帮你规范标签——那是本工具的职责。

## 它怎么工作（三层）
① **裁决**：把**本次范围内知识涉及的全部 tag**、连同它们在全库的出现频次、
   现有词表（**作为可复用的选项，不是白名单**）、以及相关条目的正文
   （按 includeBody）交给一个模型，让它判：
   同义合并 / 泛化词该丢 / 确实需要新增规范词 / 某条的 tag 与正文不符该改。
   ⚠️ 这一步**按水位线增量**（只处理上次运行之后更新过的条目）。
   🔴 **改/删已有词、新增规范词都必须给理由**——不给理由的决定会被丢弃并如实报出。
   新增的门槛更高（要说明"正文在讲词表覆盖不了的事"），因为**判错会永久多一个桶**。
② **应用**：按词表把全库的旧写法换成规范写法（纯查表，零模型调用）。
   ⭐ 全库跑，**不受水位线限制**——这样词表的新决定能传播到老条目。
③ **英文**：给还没有英文的规范词补英文（单独一次调用）。

## 参数
- \`since\`：只处理此时间之后更新过的（不给则用水位线）。
- \`full\`：无视水位线全库重跑。⚠️ **很可能超规模**（生产规模下约 14 万 token
  ⇒ 会被护栏拒绝），一般配合 \`includeBody:'none'\` 用。
- \`includeBody\`：\`truncated\`（默认，每条正文前 1000 字符）/ \`none\` / \`full\` ——
  给裁决模型多少正文。给正文能让它判"这条的 tag 打得对不对"（该补/该换），但更贵。
- \`preview\`：\`true\` = 只看不改。

## 边界
- ⚠️ **不改 \`updatedAt\`**（规范化是"整理"，不是内容更新）——所以它**不会**
  影响按时间排序、也不推进水位线之外的条目。
- ⚠️ 水位线在**同一份词表文件**里；**首次运行会把水位线设为"现在"**（不花钱）。
- 🔴 **首次调用前建议先播种**：库里现有标签一次性登记进词表。
  ⚠️ 但**播种不等于"免于裁决"**——已在词表里的词**照样会被送去裁决**，
  词表只是"可以复用这些词"的选项清单。
- 合并后若某条一个标签都不剩 ⇒ **回退保留原样**（标签至少 1 个是硬校验）。
- ⚠️ **不拆批**：裁决要看全局（拆批会让同一个词在不同批里判出不同结论）
  ⇒ 单次请求过大时**明确拒绝并告诉你怎么降**，而不是发出去 400。`;
/** `memj_score_turn` 的 description 原文。 */
const MEMJ_SCORE_TURN_DESCRIPTION = `复盘**某一轮已完成的会话**：判断知识库里的哪些知识**本来能帮上忙**，给它们加分。

## 什么时候调
⭐ 由插件在**轮次结束时**起子代理来调，**不是**主会话模型自己调。
⚠️ 参数要显式给：\`session\` 是**被复盘的那个会话**（不是当前子会话），\`turn\` 是那一轮的编号。

## 它判什么（⭐ 这是本工具最要紧的一条）
问的是「**假如它手上有这条知识，会不会做得更好**」——具体指两种情况：
- **需要却没有**（它可能**忘记用了**，或压根没意识到库里有）；
- **犯了错，而这条知识本来能让它不犯**。

🔴 **不是**问"这一轮用到了什么"：那样只会命中**已经被注入过的**知识，
而它们已经在注入列表里了 ⇒ 给它们加分**毫无意义**。
⭐ 本工具的价值在于**发现"该给但没给"的那些**。

## 它怎么工作
① 读该轮内容（**用户输入 + 思考 + 输出；不含工具调用**）；
② 取该项目的候选知识（**剔除全局知识**——它们无条件注入，评了也没用）；
③ **拆批并发**交给决策模型，逐条问一个概率；
④ 过阈值的**按档加分**（\`≥0.9\` 加 3、\`≥0.8\` 加 2、过线加 1）；
⑤ 写进该项目的分数表，并把**全部候选的分数**记进 \`score-log/\`（供日后调阈值）。

## 边界
- ⚠️ **分数按项目存**：判不出项目的会话**不评分**（无处归属）。
- ⚠️ **滚动窗口**：只有窗口内加过分的事件才算数 —— ⭐ 所以一条知识若长期没用，会自然掉出去。
- ⚠️ **一条都没加分不代表出错**：回执里会给出**最高分**，
  用它区分"真的都不相关"与"阈值太高"（⚠️ 这两种表现一样，只能靠分数分布分辨）。
- ⚠️ **全局知识不参与评分**（它无条件注入）。`;
//#endregion
//#region src/tools.ts
/**
* 取当前会话 id。
*
* ⚠️ **`exec.agent` 是可选的**——非模型直呼（如栈内调用）时为 `undefined`。
* 读快照按会话分文件，拿不到会话时退化成一个固定名字，**不能因此中断读取**。
* @param agent - `exec.agent`。
/**
* @returns 会话 id。
*/
function sessionIdOf(agent) {
	const id = agent?.session?.id;
	return typeof id === "string" && id !== "" ? id : "unknown-session";
}
/**
* ⭐⭐ 取**当前轮次号**（决策 112 的"有效期粒度 = 一个完整轮次"）。
*
* ── 来源（已核 DSH 上游源码，非猜测：`@deepseek-ai/dsh-agent` 的会话与投影定义）
*    ⚠️ 这里**不写本地源码目录**（那是一台机器上的检出位置，对读者无意义且不该公开）——
*    要复核就看下面这几个**包内路径**，它们在任何安装里都存在。
* · 会话事件 `turn/start` / `turn/end` 带 `turn: number`
*   （`packages/core/session/src/types.d.ts`）；
* · agent-loop 把边界折成投影、key = **`turnBoundary`**
*   （`turnBoundaryProjectionDefinition = { key: 'turnBoundary', … }`）；
* · 形状 `TurnBoundaryProjection.lastTurn: number`
*   ——"Turn number of the latest `turn/start`; 0 before the first turn"；
* · 读法 **`ctx.sessionProjections.stateOf(session, 'turnBoundary')`**
*   （服务名取自 `super(ctx, 'sessionProjections')`）。
*
* ⚠️ **拿不到就返回 `-1`**（不抛、不中断）：非模型直呼（栈内调用）时
* `exec.agent` 为 `undefined`，或该投影未注册（无 agent-loop）。
* ⇒ 校验侧会**退化为"本会话读过即可"**——硬校验的目的是防"凭记忆写"，
* **不是卡人**，所以宁可放松也不误拦。
* @param ctx - 插件 ctx（要能取到 `sessionProjections`）。
* @param agent - `exec.agent`。
* @returns 轮次号；未知时 `-1`。
*/
function turnOf(ctx, agent) {
	try {
		const session = agent?.session;
		if (session === void 0 || session === null) return -1;
		const t = (ctx.get("sessionProjections")?.stateOf?.(session, "turnBoundary"))?.lastTurn;
		return typeof t === "number" && Number.isFinite(t) ? t : -1;
	} catch {
		return -1;
	}
}
/**
* 注册全部工具（逐个 try）。
* @param deps - 依赖。
*/
function registerTools(deps) {
	const { ctx, config } = deps;
	/**
	* ⭐⭐⭐ **`kind` 字段的 schema 片段（`enum` 与 `description` 都每轮现算）**。
	*
	* ── 🔴 为什么需要它 ────────────────────────────────────────────────────────
	* 词表**运行期可配**了（用户在设置页增删类型）⇒ 两者**都不能是"注册时算一次"的**：
	*   · 只看 `enum` 不算数 ⇒ 用户加的类型会 **"UI 能选、工具不认"**（模型填了被判非法）；
	*   · **只看描述也不算数** —— 描述里写着"有哪些类型/各自什么意思"，
	*     若它是注册时定死的，就会出现 🔴🔴 **同一个 schema 内部自相矛盾**：
	*     `enum` 里有 `pitfall`，而描述说"只能 fact/trap/howto/decision"。
	*     ⚠️ 这正是本项目反复记的"**两边打架**"，只不过发生在一个字段内部。
	*
	* ── 机制（与 `description` 的覆盖 getter **同源**，见 `safeRegister` 的长注释）──
	* DSH 的装配路径是 `ctx.systemPrompt.tools((context) => this.wireSchemas(...))`
	* ⇒ **每轮重新 `schemaOf()`** ⇒ 参数对象上的 **getter 每轮都会被求值**。
	* ⇒ ⭐ 把两者都做成 getter，**改完类型下一轮即时生效、不用重启**。
	*
	* ⚠️ **`parameters` 是 `defineTool` 一次性构造的普通对象** ⇒
	*    这里返回的也必须是**它当场能吃下的形态**。
	*
	* 🔴🔴 **2026-10-09 重大修正：上面那句"getter 一直有效"是错的，而且【不能】靠 getter 修。**
	*
	* ── 第一层错：getter 被【对象展开】吃掉了（曾经的真实状态）────────────────
	*   本函数**返回**的对象带 getter，但 5 个调用点全写成 `{ ...kindParam(...) }`，
	*   而 **展开运算符走 `[[Get]]`**：读值、然后在新对象上建**数据属性**
	*   ⇒ **getter 不会被带过去**（实测：`{...o}` 之后 `getOwnPropertyDescriptor(x,'enum').get` 为 undefined）。
	*   ⭐ 后果：enum 退化成**注册时快照**，与决策 215 的初衷正好相反。
	*
	* ── 🔴🔴 第二层错（更根本，2026-10-09 实测才知道）：**DSH 根本不接受动态 schema**
	*   我第一版修法是"用一个 symbol 标记穿过展开，再在最终对象上重装 getter"。
	*   **结果 4 个工具整条注册失败**：
	*   ```
	*   JsonSchemaError: unsupported JSON schema:
	*     parameters.entries.items.properties.kind must be a value schema object
	*   ```
	*   ⭐ 根因（查 `dsh-tools/lib/index.js` 的 `isJsonSchemaRecord`）：
	*   它要求参数对象 **只有 own enumerable string keys**
	*   （`hasOnlyEnumerableStringKeys`：`Reflect.ownKeys(v).every(k => typeof k === 'string' && …)`）
	*   ⇒ **symbol 键直接不合格**；而**访问器属性**同样过不了 "value schema object"。
	*   ⇒ 🔴 **DSH 会把 `parameters` 编译成 JSON Schema**（见「知识来源」那条知识），
	*     所以"每轮现算的 schema"**在参数层从原理上做不到**。
	*   ⚠️ 更讽刺的是：**原来那个"展开吃掉 getter"的 bug，恰好让 schema 变成了静态数据属性** ——
	*     它**无意中满足了 DSH 的要求**。所以那 5 个工具一直能注册。
	*     ⭐ 判据：**"能注册上"不等于"设计对了"** —— 两者在这里恰好由同一个 bug 维持。
	*
	* ── ✅ 正确做法（两级，各管各的）────────────────────────────────────────────
	* | 层 | 谁负责 | 怎么保证"用户加的类能用" |
	* |---|---|---|
	* | **参数层**（`enum`） | ⭐ **注册时快照，静态** —— DSH 的要求 | 用户改类型后**下次重启**生效（`enum` 只影响"模型能否填"，是**建议面**）|
	* | **运行期**（`execute` 里） | ⭐ **现算校验**（`isEntryKind` 读进程内词表） | ⭐ **改完立即生效**，且报错**列出当前全部合法值** |
	* ⇒ 这就是库里那条知识给的判据：**"把闸门从参数层移到运行时校验"** ——
	*   拦住集合不变、报错信息量更大、且**不受 DSH 的 schema 限制**。
	* @param descOf - **现算描述**的函数（各处文案不同，但都从当前词表取）。
	* @returns 可直接放进 `parameters` 的 schema 片段（**普通数据属性**）。
	*/
	const kindParam = (descOf) => ({
		type: "string",
		/**
		* ⚠️ **注册时的快照**（不再做成 getter）—— 理由上面那段。
		* 🔴 **它只用于"告诉模型有哪些可选"**，**不是**最终闸门：
		*   真正的合法性判断在 `execute` 里走 `isEntryKind()`（读**进程内当前词表**）。
		* ⭐ 所以"用户新加的类型在模型填了之后会不会被拒"这件事，**由运行期那一层保证**。
		*/
		enum: currentKindsOf().filter((id) => !new Set(currentReservedKinds()).has(id)),
		/** 描述是**纯展示文本**，做成快照没有副作用（改类型后重启即更新）。 */
		description: descOf()
	});
	/**
	* 逐个注册，**一个失败不拖垮其余**（同 `dsh-memory` 的教训）。
	*
	* ⭐⭐⭐ **这里是工具描述接入"运行期覆盖"的唯一漏斗**（本次新增）。
	*
	* 🔴🔴 **为什么必须在这里做、且必须用 getter**（实测见 `scripts/probe-prompt-override.mjs`，
	*    13/0）：
	*  - `defineTool` 内部是 `description: options.description` —— **普通属性赋值**，
	*    取值一次就固化了 ⇒ 事后改覆盖值**它不会跟着变**；
	*  - 而 DSH 的装配路径是 `ctx.systemPrompt.tools((context) => this.wireSchemas(...))`
	*    （`dsh-tools:2609`）⇒ 每轮重新 `schemaOf()` ⇒ `const { description } = definition`
	*    （`:2935`）⇒ **getter 每轮都会被求值**。
	*  ⇒ ⭐ **改成 getter 后，改覆盖值无需重启、无需重新注册，下一轮即生效**。
	*    （反证：不加 getter 时改覆盖值**不跟随** —— 探针 D2 专门盯着这一点。）
	*
	* ⚠️ **必须在 `make()` 返回之后做**：早了会被 `defineTool` 的普通赋值覆盖掉。
	* @param name - 工具名（仅用于日志）。
	* @param make - 构造工具定义。
	*/
	const safeRegister = (name, make) => {
		try {
			const def = make();
			const fallback = def.description;
			registerPromptDefault(`tool:${name}:description`, fallback);
			Object.defineProperty(def, "description", {
				enumerable: true,
				configurable: true,
				/**
				* ⭐⭐⭐ **决策 217：这里同时填 `{{kindList}}` 插槽**。
				*
				* 🔴 **为什么**：`memj_handoff` / `memj_promote` 的描述里有"只能 {{kindList}}"，
				*    而那句以前是**写死的四值** ⇒ 用户加了类型之后，
				*    同一个 schema 的 `enum` 里有它、描述却说"只能四个" —— **自相矛盾**。
				* ✅ 做成插槽 + **每轮现填** ⇒ 描述永远跟着类型表走。
				* ⚠️ 不认识 `{{…}}` 的（别的工具描述里没有）**原样保留** ——
				*    `fillSlots` 的语义就是"没提供的插槽不填空串"（宁可在输出里可见，也别静默吞掉）。
				*/
				get: () => fillKindMarkers(promptText(`tool:${name}:description`, fallback))
			});
			registerPromptDefault(`tool:${name}:parameters`, renderParametersText(def.parameters));
			registerPromptDefault(`tool:${name}:output`, renderOutputText(def.output));
			ctx.tools.register(def);
		} catch (err) {
			ctx.logger?.error?.("dsh-memj: 工具 %s 注册失败（该工具将不可用）: %o", name, err);
		}
	};
	safeRegister("memj_info", () => defineTool({
		name: "memj_info",
		description: MEMJ_INFO_DESCRIPTION,
		parameters: {
			query: {
				type: "array",
				items: { type: "string" },
				description: "检索词数组——按词筛**项目与主题**，只回相关的那几个。规则与 memj_search 一致：给提炼过的语义词（不是原句），整词命中才算分；匹配 id、名称与描述。没有命中就如实说没有匹配（不要回退成全部清单）。"
			},
			kind: {
				type: "string",
				enum: ["project", "theme"],
				description: "只查其中一类：'project' 或 'theme'；不给则两类都回。"
			},
			withDesc: {
				type: "boolean",
				description: "为 true 时附带项目与主题的描述（判断\"是不是同一个项目\"时必须开）。默认 false。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					projects: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								name: {
									type: "string",
									required: true
								},
								desc: {
									type: "string",
									required: true
								}
							}
						}
					},
					themes: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								name: {
									type: "string",
									required: true
								},
								desc: {
									type: "string",
									required: true
								}
							}
						}
					}
				}
			},
			render: (_args, value) => {
				const v = value;
				const parts = [];
				parts.push("## 项目");
				if (v.projects.length === 0) parts.push("_（没有匹配的项目）_");
				for (const p of v.projects) parts.push(`- \`${p.id}\` **${p.name}**${p.desc === "" ? "" : ` — ${p.desc}`}`);
				parts.push("", "## 主题");
				if (v.themes.length === 0) parts.push("_（没有匹配的主题）_");
				for (const t of v.themes) parts.push(`- \`${t.id}\` **${t.name}**${t.desc === "" ? "" : ` — ${t.desc}`}`);
				return [{
					type: "text",
					text: parts.join("\n")
				}];
			}
		},
		async execute(args) {
			const { query, kind, withDesc } = args;
			const terms = normalizeQuery(query);
			const snapshot = await scanLibrary();
			let projects = snapshot.projects.map((p) => ({
				id: p.id,
				name: p.id,
				desc: p.frontmatter.desc
			}));
			const themes = [];
			for (const id of snapshot.themeIds) {
				const text = await loadThemeDesc(id);
				themes.push({
					id,
					name: id,
					desc: text
				});
			}
			if (terms.length > 0) {
				if (kind !== "theme") projects = filterContextByTerms(projects, terms);
				if (kind !== "project") {
					const filtered = filterContextByTerms(themes, terms);
					themes.length = 0;
					themes.push(...filtered);
				}
			} else if (kind === "project") themes.length = 0;
			else if (kind === "theme") projects = [];
			return {
				projects: withDesc === true ? projects : projects.map((p) => ({
					...p,
					desc: ""
				})),
				themes: withDesc === true ? themes : themes.map((t) => ({
					...t,
					desc: ""
				}))
			};
		}
	}));
	safeRegister("memj_search", () => defineTool({
		name: "memj_search",
		description: MEMJ_SEARCH_DESCRIPTION,
		parameters: {
			project: {
				type: "string",
				description: "按归属项目筛，给项目 id。"
			},
			theme: {
				type: "string",
				description: "按命中主题筛，给主题 id。"
			},
			kind: { ...kindParam(() => `按**形态分类**筛（决策 81）：${kindsInline()}。与 project/theme 正交，可并用。`) },
			query: {
				type: "array",
				items: { type: "string" },
				description: "检索词数组——**给提炼过的语义词，不要给用户原句**。整词命中才算分（不做二次切分）。"
			},
			limit: {
				type: "integer",
				description: `最多返回几张封面，默认 ${config.searchLimit}。`
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					hits: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								title: {
									type: "string",
									required: true
								},
								desc: {
									type: "string",
									required: true
								},
								project: {
									type: "string",
									required: true
								},
								theme: {
									type: "string",
									required: true
								},
								kind: {
									type: "string",
									required: true
								},
								global: {
									type: "boolean",
									required: true
								},
								tags: {
									type: "string",
									required: true
								},
								ext: {
									type: "boolean",
									required: true
								},
								size: {
									type: "integer",
									required: true
								},
								ref: {
									type: "string",
									required: true
								}
							}
						}
					},
					total: {
						type: "integer",
						required: true
					}
				}
			},
			render: (_args, value) => {
				const v = value;
				if (v.hits.length === 0) return [{
					type: "text",
					text: "没有命中任何封面。不要用别的封面凑数——如实说搜不到。"
				}];
				const lines = v.hits.map((h) => {
					const sizeNote = h.size > 0 ? `｜size ${h.size} 字符` : "";
					const extNote = h.ext ? "｜外部引用" : "";
					const gNote = h.global ? "｜global" : "";
					const kNote = h.kind !== "" ? `｜${h.kind}` : "";
					return `- \`${h.id}\`${kNote} **${h.title}** — ${h.desc}\n  （project: ${h.project || "(无)"}｜theme: ${h.theme || "(无)"}${gNote}${extNote}${sizeNote}｜tags: ${h.tags}）`;
				});
				const tail = v.total > v.hits.length ? `\n\n（共 ${v.total} 条，此处列出 ${v.hits.length} 条。）` : "";
				return [{
					type: "text",
					text: `${lines.join("\n")}${tail}`
				}];
			}
		},
		async execute(args) {
			const { project, theme, kind, query, limit } = args;
			const terms = normalizeQuery(query);
			const snapshot = await scanLibrary();
			let candidates = filterByContext(snapshot.covers.map((c) => c.cover), project, theme);
			if (kind !== void 0 && kind.trim() !== "") candidates = candidates.filter((c) => c.kind === kind.trim());
			const hits = [];
			for (const cover of candidates) {
				const title = cover.title;
				if (terms.length === 0) {
					hits.push({
						cover,
						score: 0,
						matched: [],
						title,
						size: 0
					});
					continue;
				}
				const body = (await loadEntryDoc(cover.ref, cover.ext))?.body ?? "";
				const scored = scoreCover(cover, terms, title, body);
				if (scored.score === 0) continue;
				hits.push({
					cover,
					score: scored.score,
					matched: scored.matched,
					title,
					size: bodySize(body)
				});
			}
			const ordered = terms.length > 0 ? sortHits(hits) : hits;
			return {
				hits: ordered.slice(0, typeof limit === "number" && limit > 0 ? limit : config.searchLimit).map((h) => ({
					id: h.cover.id,
					title: h.title,
					desc: h.cover.desc,
					project: h.cover.project,
					theme: h.cover.theme.join(", "),
					kind: h.cover.kind,
					global: h.cover.global,
					tags: h.cover.tags.join("、"),
					ext: h.cover.ext,
					size: h.size ?? 0,
					ref: h.cover.ref
				})),
				total: ordered.length
			};
		}
	}));
	safeRegister("memj_read", () => defineTool({
		name: "memj_read",
		description: MEMJ_READ_DESCRIPTION,
		parameters: {
			id: {
				type: "string",
				description: "封面上的 UUID，来自 memj_search。⚠️ 读**项目文档**时改用 `project`（二选一）。"
			},
			project: {
				type: "string",
				description: "⭐ **项目文档的 id**——读 `projects/HANDOFF-<项目>.md` 的正文（决策 112）。写交接文档前**必须先读一遍**，所以这是那个前置动作的正规入口。与 `id` 二选一。"
			},
			section: {
				type: "string",
				description: "按 `##` / `###` 标题取某一节（子串匹配）。\n⭐ 给**顶层 `##` 节名**时，会**连它下面全部 `###` 子节一起返回**；\n⭐ 也可以直接给 **`###` 子节名**、单独读它（节太长时分段读用）。"
			},
			full: {
				type: "boolean",
				description: "强制返回全文（逃生口）。⚠️ 文档很长时它会很大（可能超出上下文）。"
			},
			offset: {
				type: "integer",
				description: "按行区间取：起始行（1 起）。\n⭐ **给了 `section` 时按「节内行号」算**（不是全文行号）——长节分段读就靠它；没给 `section` 时仍按全文行号。"
			},
			limit: {
				type: "integer",
				description: "按行区间取：取多少行。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					found: {
						type: "boolean",
						required: true
					},
					id: {
						type: "string",
						required: true
					},
					title: {
						type: "string",
						required: true
					},
					mode: {
						type: "string",
						required: true
					},
					content: {
						type: "string",
						required: true
					},
					availableSections: {
						type: "array",
						required: true,
						items: { type: "string" }
					},
					/**
					* ⭐⭐ **分两级的节清单**（决策 134）——**顶层节可写、子节只读定位**，
					* 且**每节带字符数** ⇒ 不必先读全文就知道该动哪一节。
					*/
					sectionGroups: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								title: {
									type: "string",
									required: true
								},
								chars: {
									type: "integer",
									required: true
								},
								children: {
									type: "array",
									required: true,
									items: {
										type: "object",
										additionalProperties: false,
										properties: {
											title: {
												type: "string",
												required: true
											},
											chars: {
												type: "integer",
												required: true
											}
										}
									}
								}
							}
						}
					},
					sectionRequested: {
						type: "string",
						required: true
					},
					sectionMatched: {
						type: "boolean",
						required: true
					},
					size: {
						type: "integer",
						required: true
					},
					notice: {
						type: "string",
						required: true
					},
					/**
					* ⭐⭐⭐ **决策 221：本文档各节的写作规范**（集中一处，读项目文档时才有）。
					*
					* 🔴 **为什么要有它**：规范原本散落在几万字的正文里，模型读文档时
					*    视线只落在"它这次要写的那一节"⇒ 没有任何东西提醒它"别的节该整理了"。
					*    实测代价见 `reads:section-spec-head` 的目录说明（「目标」节 27 次没被碰过）。
					* ⚠️ 它**只在读项目文档时非空**（读知识条目时恒为空串）。
					*/
					sectionSpecs: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => {
				const v = value;
				if (!v.found) return [{
					type: "text",
					text: (v.notice !== "" ? v.notice : "找不到该 id 的知识条目。") + "\n不要用别的内容替代。"
				}];
				const parts = [];
				if ((v.sectionSpecs ?? "") !== "") parts.push(String(v.sectionSpecs), "", "---", "");
				if (v.mode === "section-list" || v.mode === "section-miss") {
					if (v.notice !== "") parts.push(v.notice, "");
					if (v.sectionGroups.length > 0) {
						parts.push("顶层节（⭐ **可作 `memj_handoff` 的 `docSection`**；括号内是字符数）：");
						for (const g of v.sectionGroups) parts.push(`- ${g.title}（${g.chars} 字符）`);
						const withKids = v.sectionGroups.filter((g) => g.children.length > 0);
						if (withKids.length > 0) {
							parts.push("", "各顶层节下的子节（**只读定位**——可单独 `section` 取它，不能作 `docSection`）：");
							for (const g of withKids) {
								parts.push(`· ${g.title}：`);
								for (const c of g.children) parts.push(`    - ${c.title}（${c.chars} 字符）`);
							}
						}
					} else if (v.availableSections.length > 0) {
						parts.push("本文的节名：");
						for (const s of v.availableSections) parts.push(`- ${s}`);
					}
				} else {
					parts.push(`# ${v.title}`, "", v.content);
					if (v.notice !== "") parts.push("", `（${v.notice}）`);
				}
				return [{
					type: "text",
					text: parts.join("\n")
				}];
			}
		},
		async execute(args, exec) {
			const { id, project, section, full, offset, limit } = args;
			if (project !== void 0 && project.trim() !== "") {
				const projectId = project.trim();
				const pdoc = await loadProjectDoc(projectId);
				if (pdoc === void 0) return {
					found: false,
					id: projectId,
					title: "",
					mode: "not-found",
					content: "",
					sectionGroups: [],
					availableSections: [],
					sectionRequested: "",
					sectionMatched: false,
					size: 0,
					sectionSpecs: "",
					notice: `没有项目 \`${projectId}\`（不存在它的交接文档）。`
				};
				if ((pdoc.frontmatter.archivedAt ?? "") !== "") return {
					found: false,
					id: projectId,
					title: "",
					mode: "archived",
					content: "",
					sectionGroups: [],
					availableSections: [],
					sectionRequested: "",
					sectionMatched: false,
					size: 0,
					sectionSpecs: "",
					notice: `项目 \`${projectId}\` **已归档**，信息不可用（归档时间 ${pdoc.frontmatter.archivedAt}）。`
				};
				const body = pdoc.narrative;
				const decision = decideRead(body, {
					section,
					full,
					offset,
					limit,
					maxChars: config.readFullMaxChars
				});
				if (decision.content.trim() !== "") try {
					const sid = sessionIdOf(exec.agent);
					const turn = turnOf(ctx, exec.agent);
					const prev = await findDocRead(sid, projectId, turn);
					const isFull = decision.mode === "full" || (prev?.full ?? false);
					const seen = new Set(prev?.sections ?? []);
					if (decision.sectionMatched && decision.sectionRequested.trim() !== "") {
						const key = decision.sectionRequested.trim().toLowerCase();
						for (const t of decision.availableSections) if (t.toLowerCase().includes(key)) seen.add(t);
					}
					await appendDocRead(sid, {
						project: projectId,
						turn,
						readAt: (/* @__PURE__ */ new Date()).toISOString(),
						full: isFull,
						sections: [...seen]
					});
				} catch {}
				const specBlock = decision.mode === "full" ? renderSectionSpecs(sectionSpecsOf(pdoc.narrative)) : "";
				return {
					found: true,
					id: projectId,
					title: `项目交接文档 ${projectId}`,
					mode: decision.mode,
					content: decision.content,
					sectionSpecs: specBlock,
					availableSections: decision.availableSections,
					sectionGroups: decision.sectionGroups,
					sectionRequested: decision.sectionRequested,
					sectionMatched: decision.sectionMatched,
					size: decision.size,
					notice: decision.notice
				};
			}
			if (id === void 0 || id.trim() === "") return {
				found: false,
				id: "",
				title: "",
				mode: "not-found",
				content: "",
				sectionGroups: [],
				availableSections: [],
				sectionRequested: "",
				sectionMatched: false,
				size: 0,
				sectionSpecs: "",
				notice: "要给 `id`（知识条目的 UUID，来自 memj_search）或 `project`（项目文档 id，如 `dsh-memj`）其中之一。"
			};
			const found = (await scanLibrary({
				includeArchived: true,
				includeHistory: true
			})).covers.find((c) => c.cover.id === id);
			if (found !== void 0 && (found.cover.archivedAt ?? "") !== "") return {
				found: false,
				id,
				title: found.cover.title,
				mode: "archived",
				content: "",
				sectionGroups: [],
				availableSections: [],
				sectionRequested: "",
				sectionMatched: false,
				size: 0,
				sectionSpecs: "",
				notice: `该条目**已归档**，信息不可用（归档时间 ${found.cover.archivedAt}）。`
			};
			if (found === void 0) return {
				found: false,
				id,
				title: "",
				mode: "not-found",
				content: "",
				sectionGroups: [],
				availableSections: [],
				sectionRequested: "",
				sectionMatched: false,
				size: 0,
				sectionSpecs: "",
				notice: ""
			};
			const cover = found.cover;
			const doc = resolveRef(cover.ref, cover.ext) === void 0 ? void 0 : await loadEntryDoc(cover.ref, cover.ext);
			if (doc === void 0) return {
				found: false,
				id,
				title: "",
				mode: "body-missing",
				content: "",
				sectionGroups: [],
				availableSections: [],
				sectionRequested: "",
				sectionMatched: false,
				size: 0,
				sectionSpecs: "",
				notice: `封面存在但正文读不到：${cover.ref}${cover.ext ? "（外部引用，文件可能已被移动或删除）" : ""}`
			};
			const decision = decideRead(doc.body, {
				section,
				full,
				offset,
				limit,
				maxChars: config.readFullMaxChars
			});
			if (decision.content.trim() !== "") {
				const ownerProject = cover.project === "" ? void 0 : await loadProjectDoc(cover.project);
				try {
					await recordRead(sessionIdOf(exec.agent), {
						entryId: cover.id,
						title: doc.title,
						desc: cover.desc,
						theme: cover.theme,
						project: cover.project,
						owner: {
							title: ownerProject?.frontmatter.project ?? "",
							desc: ownerProject?.frontmatter.desc ?? ""
						}
					});
				} catch {}
			}
			return {
				found: true,
				id,
				title: doc.title,
				mode: decision.mode,
				content: decision.content,
				sectionSpecs: "",
				availableSections: decision.availableSections,
				sectionGroups: decision.sectionGroups,
				sectionRequested: decision.sectionRequested,
				sectionMatched: decision.sectionMatched,
				size: decision.size,
				notice: decision.notice
			};
		}
	}));
	safeRegister("memj_snapshots", () => defineTool({
		name: "memj_snapshots",
		description: MEMJ_SNAPSHOTS_DESCRIPTION,
		parameters: {
			project: {
				type: "string",
				required: true,
				description: "本次要落盘的**目标项目 id**。工具据此筛出 `快照.project ≠ project` 的那些（跨项目证据）。🔴 **必须先用 memj_info 判断好\"更新还是新建项目\"、拿到 id 之后再来调本工具**。"
			},
			scope: {
				type: "string",
				enum: ["cross", "all"],
				description: "'cross'（默认）只回**别项目**的快照（project ≠ 传入值）；'all' 连本项目自己的也回。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					entries: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								entryId: {
									type: "string",
									required: true
								},
								title: {
									type: "string",
									required: true
								},
								desc: {
									type: "string",
									required: true
								},
								theme: {
									type: "string",
									required: true
								},
								project: {
									type: "string",
									required: true
								},
								ownerTitle: {
									type: "string",
									required: true
								},
								ownerDesc: {
									type: "string",
									required: true
								},
								readAt: {
									type: "string",
									required: true
								}
							}
						}
					},
					total: {
						type: "integer",
						required: true
					},
					hint: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => {
				const v = value;
				const loose = config.themeCreation === "loose";
				const modeLine = loose ? "📋 **本实例的校验模式：宽松**——工具**不校验跨项目证据**，是否新建主题**由你判断**。" : "📋 **本实例的校验模式：严格**——新建主题**必须有跨项目证据**（见下）。";
				if (v.entries.length === 0) return [{
					type: "text",
					text: modeLine + "\n\n本会话**没有读过别的项目**的知识（按当前 scope 没有未消费的快照）。\n" + (loose ? "⇒ 本实例是**宽松模式**，这**不妨碍你新建主题**（工具不做该校验）；仍可挂靠本项目已关联的主题（挂靠无门槛）。" : "⇒ 本次**没有跨项目证据**，因此**不能新建主题**；仍可挂靠本项目已关联的主题（挂靠无门槛）。")
				}];
				const byProject = /* @__PURE__ */ new Map();
				for (const e of v.entries) {
					const key = e.project === "" ? "(无项目归属)" : e.project;
					const list = byProject.get(key);
					if (list === void 0) byProject.set(key, [e]);
					else list.push(e);
				}
				const parts = [
					modeLine,
					"",
					`本会话读过 ${v.total} 条知识（按来源项目分组）：`
				];
				for (const [project, list] of byProject) {
					parts.push("", `- 来源项目 \`${project}\`（${list[0]?.ownerTitle ?? ""}）`);
					for (const e of list) parts.push(`  · \`${e.entryId}\` **${e.title}** — ${e.desc}` + (e.theme === "" ? "" : `（已挂主题：${e.theme}）`));
				}
				parts.push("", v.hint);
				return [{
					type: "text",
					text: parts.join("\n")
				}];
			}
		},
		async execute(args, exec) {
			const { project, scope } = args;
			const target = (project ?? "").trim();
			const sessionId = sessionIdOf(exec.agent);
			const all = await pendingSnapshots(sessionId);
			const entries = scope === "all" ? all : all.filter((s) => s.project !== "" && s.project !== target);
			return {
				entries: entries.map((s) => ({
					entryId: s.entryId,
					title: s.title,
					desc: s.desc,
					theme: s.theme.join(", "),
					project: s.project,
					ownerTitle: s.owner.title,
					ownerDesc: s.owner.desc,
					readAt: s.readAt
				})),
				total: entries.length,
				hint: `以上是本会话读过的、且**不属于项目 \`${target}\`** 的知识（按来源项目分组；工具已替你完成"快照.项目 ≠ ${target}"这处比较）。\n\n🔴 **逐条判断"它确实和本次要落盘的项目相关吗"**——「读过」不等于「用上了」；顺手翻到的、探索性读的都要排除。
通过判断的那些，就是"跨项目复用"的证据：若其中某条与本次知识属**同一语义范畴**，可用 \`memj_handoff\` 的 \`newThemes\` 新建主题（别的项目 A + 本次项目 B ⇒ 已经是 2 个项目，不需要再数什么）。
` + (config.themeCreation === "loose" ? "⚠️ 但**本实例是宽松模式**：新建主题**不要求**这些证据，由你判断即可。" : "⚠️ **本实例是严格模式**：**没有通过判断的快照 ⇒ 不要新建主题**，留在项目层或挂靠本项目已关联的主题即可。")
			};
		}
	}));
	safeRegister("memj_handoff", () => defineTool({
		name: "memj_handoff",
		description: MEMJ_HANDOFF_DESCRIPTION,
		parameters: {
			project: {
				type: "string",
				required: true,
				description: "项目 id；已存在则更新，不存在则新建。"
			},
			step: {
				oneOf: [{
					type: "string",
					enum: [
						"narrative",
						"theme",
						"knowledge",
						"all"
					]
				}, {
					type: "array",
					items: {
						type: "string",
						enum: [
							"narrative",
							"theme",
							"knowledge",
							"all"
						]
					}
				}],
				description: "⭐ **本次做哪几步**（决策 101）。可给单个值，也可给数组；**缺省 = `all`**。\n· `narrative` 只写项目叙事（`doc` / `projectDesc`）\n· `theme` 只建主题（`newThemes`）\n· `knowledge` 只落知识（`entries` / `adopt`）\n· `all` 全部（缺省，等价于以前的一次完整 handoff）\n🔴 **执行顺序固定** narrative → theme → knowledge，**与数组顺序无关**。\n💡 用途：只想补一条知识而不重写叙事 ⇒ `step: 'knowledge'`。\n🔴 **没有\"欠账\"**：`step` 没列的步骤**不在本次范围**——回执会列出它们并**明确说\"不要为补齐再调一次\"**（⚠️ 分步之间无原子性，可能留下\"半套\"）。\n⚠️ 参数必须与 step 一致：传了不属于本次 step 的参数（如 step 不含 narrative 却给 `doc`）会被**直接拒绝**，而不是静默忽略。"
			},
			projectDesc: {
				type: "string",
				description: "项目描述（新建该项目时必填，≤200 字符）。"
			},
			template: {
				type: "string",
				description: "⭐ **新建项目时用哪份交接文档模板**（决定建档的节名与节数）；**缺省 = `default`**。\n🔴 **只在「新建项目」那一刻有效**：项目**已存在** ⇒ 本参数**被忽略** ⇒\n   **模板绝不回溯已有文档**（要换结构只能新建项目，这是有意的）。\n📋 **有哪些可选**：用 `memj_template({ action: 'list' })` 查（每份都有 id 与节清单）。\n⚠️ 传了不存在的 id ⇒ 工具会报错并列出可用模板，**不会静默回落**。\n💡 **什么时候该挑**：当本次要建的项目明显属于某类已有专门模板时\n   （例如公司深度研究用 `company-deep-research`）⇒ **先 list 再挑**，\n   或**问用户**要用哪份；别默认套六节。"
			},
			doc: {
				type: "string",
				description: "handoff 文档的叙事（markdown，按该项目的节清单写）。\n⚠️ **节名不是固定的**——由建档时的模板决定，回执会回声本项目节名清单。\n⭐ **给了 `docSection` 时**：这里只写**该节要变的那部分**（`append`/`prepend` 时**不要带节标题**，工具会加）；\n**没给 `docSection` 时**：按 `##` 节名对号入座，写了的那一节**整节替换**（⚠️ 此时必须给出该节的**完整内容**，否则原有内容会丢）。"
			},
			docSection: {
				type: "string",
				description: "⭐ **只写某一节**（节名，同 `memj_read` 的 `section` 规则：子串匹配、大小写不敏感）。\n顶层 `##` 节与 `###` 子节都可以（⚠️ 节名有歧义时会报错并列出候选）。\n🔴 **文档很长时用它可以只产出一段**——不必逐字重写整节。\n💡 该用哪一节：先 `memj_read({ project })`，回执里会给出**每节的字符数**。\n⚠️ 找不到该节 ⇒ 报错并提示；**不会**猜、也不会新建。"
			},
			docOp: {
				type: "string",
				enum: [
					"append",
					"prepend",
					"replace",
					"drop"
				],
				description: "配合 `docSection` 使用，**缺省 `append`**：\n· `append` 追加到该节**末尾**（新增进展）\n· `prepend` 追加到该节**开头**（新增进展、放最前）\n· `replace` **替换**该节（给出的必须是**该节完整新内容**）\n· `drop` **删除**该节\n🔴 **缺省是 `append` 是故意的**：忘给参数时**只会追加、不会覆盖**（要覆盖必须显式说 `replace`）。\n⭐ **文档瘦身/归档由你按各节规范执行**（决策 223）：规则写在**各节规范里**（自然语言），**工具不会替你归档**。超阈值时**就用 `replace`/`drop` 动手**。\n⭐ **完整四步流程见运行时上下文「文档瘦身 / 归档」**；⚠️ 尤其别拿 `replace`去改「历史进展」那种**累积容器**（它的语义是**替换整节** ⇒ 会抹掉已有指针）。\n⚠️ 追加时 `doc` 只给正文片段、**不要带节标题**；`drop` 后若留下空壳节，回执会报警（工具分不清\"故意删空\"与\"误删\"）。"
			},
			entries: {
				type: "array",
				description: "要落盘的知识（会话总结出的）。",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						slug: {
							type: "string",
							required: true,
							description: "英文短名（从标题翻译），全小写英文/数字/连字符，2–48 字符。"
						},
						title: {
							type: "string",
							required: true,
							description: "知识标题（**必填**，2–48 字符的具体名词短语）。⭐ **它是封面的字段**——检索时不必打开正文就能拿到标题，所以**必须自己给**。内部条目通常与正文首个 `###` 同句（正文里那份**可以保留**，不必删）。⚠️ 不要写成整句话或摘要——它是标题，`desc` 才承担\"这条讲什么、何时读\"。"
						},
						desc: {
							type: "string",
							required: true,
							description: "检索键（不是摘要），≤200 字符。"
						},
						body: {
							type: "string",
							required: true,
							description: "正文 markdown。⭐ **外部引用（`ext: true`）也要给**：那种情况写 **200 字以内的摘要**（说清那份库外文件讲了什么），⛔ **不要贴全文**。"
						},
						overwrite: {
							type: "boolean",
							description: "⭐ **同 `slug` 已存在时是否覆盖**（默认 `false`）。\n· 缺省 ⇒ **拒绝**并提示\"已存在\"（**不静默覆盖**）；\n· `true` ⇒ **就地替换**那条知识（不产生第二个文件）。\n⚠️ 这是为了防**重复写入**：同一入参重发（网络重试、分步补写）\n本该幂等，而原先会写出两条知识。"
						},
						kind: { ...kindParam(() => `形态分类（**可选**）：${kindsInline()}。留空合法。它决定正文用哪种骨架，也便于按类型筛选。⚠️ 与 theme 无关：theme 是"属于谁"，kind 是"本身是什么形态"。`) },
						tags: {
							type: "array",
							required: true,
							items: { type: "string" },
							description: "至少 1 个。"
						},
						theme: {
							type: "array",
							items: { type: "string" },
							description: "要挂靠的主题 id（只能填已存在的）。"
						},
						themeWhy: {
							type: "string",
							description: "⭐ **挂了 `theme` 就要给依据**（没挂则不需要）。\n写法：**引一句该主题 `desc` 里的话** + 说明这条知识**怎么服务那个 desc 描述的场景**。\n⚠️ 工具会检查你引的那句**确实逐字出现在该主题 desc 里**（≥12 字符连续片段）；\n引不出来 ⇒ 回执**警告**（不拒收，但别当没看见）。\n🔴 **判据**：这条知识**对「该主题 desc 描述的场景下的别的项目」有用**吗？\n只对本项目成立（讲的是本项目自己的某次改动/接口/缺陷/实测数据）⇒ **别挂**。"
						},
						global: {
							type: "boolean",
							description: "是否申请加入全局（只登记提名；封面 global 保持 false，批准时才置位，待用户批准）。"
						},
						ref: {
							type: "string",
							description: "⭐ **只引用不搬动时必填**：库外文档的**绝对路径**（须与 `ext: true` 同时给）。⚠️ **落库条目不要填它**——那种情况 `ref` 由工具按 `<slug>-<uuid8>.md` 自动生成。"
						},
						ext: {
							type: "boolean",
							description: "⭐ `true` = **外部引用**（**只建封面、不搬动库外文件**，正文永远留在原处）。⚠️ 与 `adopt` 的区别：`adopt` 是**入库**（把正文收进库）；本字段是**只引用**。⚠️ 置 `true` 时必须给 `ref`（绝对路径）；`body` **仍要填**，但写的是 **200 字以内的摘要**（⛔ 不是全文）——正文一律留在库外那个文件里。"
						}
					}
				}
			},
			newThemes: {
				type: "array",
				description: "本次要新建的主题（id + desc）。",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						id: {
							type: "string",
							required: true
						},
						desc: {
							type: "string",
							required: true,
							description: "主题描述，≤200 字符。"
						}
					}
				}
			},
			linkedSnapshots: {
				type: "array",
				items: { type: "string" },
				description: "**只补挂这些快照**（别项目 entry id 数组，用 memj_snapshots 取）。🔴 **省略 = 一条都不挂**（fail-closed）：先逐条判断\"它确实和本次相关吗\"，把相关的列进来；不相关的**不要列**。⚠️ 回执会回声实际补挂了哪几条。"
			},
			adopt: {
				type: "array",
				description: "入库外部文档（copy = 工具自己读全文；extract = 用 body 作为正文）。",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						slug: {
							type: "string",
							required: true
						},
						title: {
							type: "string",
							required: true,
							description: "入库条目的标题（**必填**，2–48 字符）。⚠️ **外部引用也要自己写**——以前靠\"读正文首个 `#`\"现算，那要求每次检索都打开外部文件。"
						},
						ref: {
							type: "string",
							required: true,
							description: "外部文档的绝对路径。"
						},
						mode: {
							type: "string",
							required: true,
							enum: ["copy", "extract"]
						},
						body: {
							type: "string",
							description: "mode='extract' 时的正文。"
						},
						desc: {
							type: "string",
							required: true
						},
						kind: { ...kindParam(() => `形态分类（可选），同 entries[].kind。可选：${selectableKindList("、")}。`) },
						tags: {
							type: "array",
							required: true,
							items: { type: "string" }
						},
						theme: {
							type: "array",
							items: { type: "string" }
						},
						global: { type: "boolean" },
						overwrite: {
							type: "boolean",
							description: "⭐ 同 `slug` 已存在时是否覆盖（默认 `false`）。语义与 `entries[].overwrite` 相同。"
						}
					}
				}
			},
			confirmCreate: {
				type: "boolean",
				description: "确认新建项目（命中相似 id 时必须带 true）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					message: {
						type: "string",
						required: true
					},
					createdProject: {
						type: "boolean",
						required: true
					},
					createdThemes: {
						type: "array",
						required: true,
						items: { type: "string" }
					},
					snapshotCount: {
						type: "integer",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return [{
					type: "text",
					text: value.message
				}];
			}
		},
		async execute(args, exec) {
			const r = await runHandoff(args, {
				sessionId: sessionIdOf(exec.agent),
				turn: turnOf(ctx, exec.agent),
				config
			});
			if (!r.ok) throw new Error(r.message);
			try {
				const pid = typeof args.project === "string" ? args.project.trim() : "";
				if (pid !== "") {
					const sid = sessionIdOf(exec.agent);
					await appendDocRead(sid, {
						project: pid,
						turn: turnOf(ctx, exec.agent),
						readAt: (/* @__PURE__ */ new Date()).toISOString(),
						full: true,
						sections: [],
						via: "handoff"
					});
				}
			} catch {}
			try {
				triggerEnIndexRebuild(ctx, config, "handoff");
			} catch {}
			return {
				ok: r.ok,
				message: r.message,
				createdProject: r.createdProject,
				createdThemes: r.createdThemes,
				snapshotCount: r.snapshotCount
			};
		}
	}));
	safeRegister("memj_promote", () => defineTool({
		name: "memj_promote",
		description: MEMJ_PROMOTE_DESCRIPTION,
		parameters: {
			refs: {
				type: "array",
				items: { type: "string" },
				description: "要推进/修改的封面 id（UUID）数组。⚠️ **项目/主题级操作（`action`）不需要它**。"
			},
			addThemes: {
				type: "array",
				items: { type: "string" },
				description: "要**追加**的主题 id 数组。⚠️ **只能填已存在的主题 id**——本工具**不新建主题**（新建主题请走 memj_handoff 的 newThemes）。"
			},
			removeThemes: {
				type: "array",
				items: { type: "string" },
				description: "⭐ **要移除**的主题 id 数组（**挂错了用这个**，决策 114）。⚠️ 与 `addThemes` 同为**累加语义**：只动 `theme`，**不碰** `project` / `global`。"
			},
			setFields: {
				type: "object",
				additionalProperties: false,
				description: "⭐ **改封面的字段**（决策 114）。⚠️ **只改你给的字段**，没给的保持不变——**不是**整份替换。",
				properties: {
					title: {
						type: "string",
						description: "新标题（2–48 字符）。"
					},
					desc: {
						type: "string",
						description: "新描述（≤200，检索键）。"
					},
					tags: {
						type: "array",
						items: { type: "string" },
						description: "新标签（至少 1 个）。"
					},
					kind: { ...kindParam(() => `形态分类（受控词表：${selectableKindList("、")}）。⚠️ **这是 \`kind\` 的修改通道**（以前写完只能手工改库文件）。`) }
				}
			},
			setGlobal: {
				type: "boolean",
				description: "`true` = **登记待批提名**（封面 `global` 保持 false，批准时才置位；工具不会自己批准）；`false` = **取消** 并清掉提名、把 `global` 置回 false。"
			},
			action: {
				type: "object",
				additionalProperties: false,
				description: "⭐ **项目 / 主题级操作**（决策 114）。⚠️ 与 `refs` 互斥——它作用于项目/主题本身，不是单个封面。",
				properties: {
					kind: {
						type: "string",
						enum: [
							"setProjectFields",
							"setProjectDesc",
							"renameProject",
							"deleteProject",
							"setThemeFields",
							"setThemeDesc",
							"renameTheme",
							"deleteTheme",
							"deleteEntry"
						],
						description: "要做的操作。🔴 `delete*` **只允许删空容器**（旗下还有知识/引用 ⇒ 拒绝，**不级联删**）；`rename*` 是**先建后删**（中途失败不丢数据）。⭐ 注意：**只改显示名请用 `setProjectFields` / `setThemeFields`**（它们改的是 `title`，**不动 id**，因而不影响任何引用）。"
					},
					id: {
						type: "string",
						description: "目标 id（项目 / 主题 / 封面）。"
					},
					newId: {
						type: "string",
						description: "`rename*` 时的新 id。"
					},
					title: {
						type: "string",
						description: "⭐ **显示名**（决策 115）：`setProjectFields` / `setThemeFields` 用。⚠️ 它**不是 id**——改它不影响任何引用。空串 = 清空（回落成显示 id）。"
					},
					desc: {
						type: "string",
						description: "`setProject(Theme)Fields` / `setProjectDesc` / `setThemeDesc` 的新描述（≤200）。"
					}
				}
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					message: {
						type: "string",
						required: true
					},
					updated: {
						type: "array",
						required: true,
						items: { type: "string" }
					}
				}
			},
			render: (_args, value) => {
				return [{
					type: "text",
					text: value.message
				}];
			}
		},
		async execute(args) {
			const { refs, addThemes, removeThemes, setFields, setGlobal, action } = args;
			if (action !== void 0 && typeof action.kind === "string" && action.kind !== "") {
				const id = (action.id ?? "").trim();
				const newId = (action.newId ?? "").trim();
				const desc = action.desc ?? "";
				const title = action.title ?? "";
				if (id === "") return {
					ok: false,
					message: "`action.id` 不能为空。",
					updated: []
				};
				let r;
				switch (action.kind) {
					case "setProjectFields":
						r = await setProjectFields(id, {
							...action.title !== void 0 ? { title } : {},
							...action.desc !== void 0 ? { desc } : {}
						});
						break;
					case "setProjectDesc":
						r = await setProjectDesc(id, desc);
						break;
					case "renameProject":
						r = await renameProject(id, newId);
						break;
					case "deleteProject":
						r = await deleteProject(id);
						break;
					case "setThemeFields":
						r = await setThemeFields(id, {
							...action.title !== void 0 ? { title } : {},
							...action.desc !== void 0 ? { desc } : {}
						});
						break;
					case "setThemeDesc":
						r = await setThemeDesc(id, desc);
						break;
					case "renameTheme":
						r = await renameTheme(id, newId);
						break;
					case "deleteTheme":
						r = await deleteTheme(id);
						break;
					case "deleteEntry":
						r = await deleteEntry(id);
						break;
					default: return {
						ok: false,
						message: `未知的 action.kind：\`${action.kind}\`。\n可用：setProjectFields / setProjectDesc / renameProject / deleteProject / setThemeFields / setThemeDesc / renameTheme / deleteTheme / deleteEntry。`,
						updated: []
					};
				}
				if (!r.ok) return {
					ok: false,
					message: r.message,
					updated: []
				};
				return {
					ok: true,
					message: r.message,
					updated: [id]
				};
			}
			const ids = (refs ?? []).map((s) => s.trim()).filter((s) => s !== "");
			const hasCoverAction = (addThemes ?? []).length > 0 || (removeThemes ?? []).length > 0 || setFields !== void 0 || setGlobal !== void 0;
			if (ids.length === 0) return {
				ok: false,
				message: "要给 `refs`（封面 id 数组，做封面级操作），或给 `action`（做项目/主题级操作）。",
				updated: []
			};
			if (!hasCoverAction) return {
				ok: false,
				message: "至少给一个动作：`addThemes` / `removeThemes` / `setFields` / `setGlobal`。",
				updated: []
			};
			const snapshot = await scanLibrary();
			const updated = [];
			const lines = [];
			const newOnes = (addThemes ?? []).map((t) => t.trim()).filter((t) => t !== "");
			const unknown = newOnes.filter((t) => !snapshot.themeIds.includes(t));
			if (unknown.length > 0) return {
				ok: false,
				message: `主题不存在：${unknown.map((t) => `\`${t}\``).join("、")}。\n⚠️ 本工具**不新建主题**——新建主题请用 \`memj_handoff\` 的 \`newThemes\`。
⭐ **理由与模式无关**：新建主题是**跨条目、跨项目的聚合判断**，**只有写项目文档那一次调用才有这个视角**，而本工具是事后/独立操作。
库里现有的主题：${snapshot.themeIds.length > 0 ? snapshot.themeIds.map((t) => `\`${t}\``).join("、") : "（暂无）"}`,
				updated: []
			};
			for (const id of ids) {
				if (snapshot.covers.find((c) => c.cover.id === id) === void 0) {
					if (await probeCoverState(id) === "archived") lines.push(`- \`${id}\`：该条目**已归档**，不可编辑（请先在「归档」标签页恢复它）。`);
					else lines.push(`- \`${id}\`：库里没有这张封面，跳过。`);
					continue;
				}
				const applied = [];
				if (newOnes.length > 0 || (removeThemes ?? []).length > 0) {
					const r = await editEntryThemes(id, {
						add: newOnes,
						...removeThemes !== void 0 ? { remove: removeThemes } : {}
					});
					if (!r.ok) {
						lines.push(`- \`${id}\`：${r.message}`);
						continue;
					}
					if (newOnes.length > 0) applied.push(`追加主题 [${newOnes.join(", ")}]`);
					if ((removeThemes ?? []).length > 0) applied.push(`移除主题 [${removeThemes.join(", ")}]`);
				}
				if (setFields !== void 0) {
					const rawKind = setFields.kind;
					const kind = rawKind === void 0 ? void 0 : rawKind === "" ? "" : isEntryKind(rawKind) ? rawKind : void 0;
					if (rawKind !== void 0 && kind === void 0) {
						lines.push(`- \`${id}\`：\`kind\` 非法（\`${rawKind}\`），跳过。`);
						continue;
					}
					const r = await setEntryFields(id, {
						...setFields.title !== void 0 ? { title: setFields.title } : {},
						...setFields.desc !== void 0 ? { desc: setFields.desc } : {},
						...setFields.tags !== void 0 ? { tags: setFields.tags } : {},
						...kind !== void 0 ? { kind } : {}
					});
					if (!r.ok) {
						lines.push(`- \`${id}\`：${r.message}`);
						continue;
					}
					applied.push("改字段");
				}
				if (setGlobal !== void 0) {
					const r = await setEntryGlobal(id, setGlobal);
					if (!r.ok) {
						lines.push(`- \`${id}\`：${r.message}`);
						continue;
					}
					applied.push(setGlobal ? "登记 global 提名（封面 global 仍为 false）" : "取消 global");
				}
				updated.push(id);
				lines.push(`- \`${id}\`：${applied.join("；")}。`);
			}
			await rebuildDerivedLayers();
			return {
				ok: true,
				message: `已处理 ${updated.length} 张封面（**累加语义：原有归属全部保留**）：\n${lines.join("\n")}\n\n` + (setGlobal === true ? "⚠️ 只是**登记提名**（封面 `global` 保持 `false`）——需要人在 /memj-review 或网页里**批准**后才置位进 GLOBAL。" : "⚠️ 添加主题免批准，已当场生效。"),
				updated
			};
		}
	}));
	safeRegister("memj_update", () => defineTool({
		name: "memj_update",
		description: MEMJ_UPDATE_DESCRIPTION,
		parameters: {
			id: {
				type: "string",
				required: true,
				description: "封面 UUID（从 memj_search 拿）。"
			},
			body: {
				type: "string",
				description: "⭐ **新正文**（给了就替换）。⚠️ 只对**内部条目**有效——外部引用（ext）的正文在库外，本工具不动它。"
			},
			fields: {
				type: "object",
				additionalProperties: false,
				description: "可选：同时改封面字段（同 `entries[].*` 的规格）。⚠️ 只改给的字段。",
				properties: {
					title: {
						type: "string",
						description: "新标题（2–48 字符）。"
					},
					desc: {
						type: "string",
						description: "新描述（≤200，检索键）。"
					},
					tags: {
						type: "array",
						items: { type: "string" },
						description: "新标签（至少 1 个）。"
					},
					kind: { ...kindParam(() => `形态分类（受控词表：${selectableKindList("、")}）。`) }
				}
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					message: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return [{
					type: "text",
					text: value.message
				}];
			}
		},
		async execute(args) {
			const { id, body, fields } = args;
			const entryId = (id ?? "").trim();
			if (entryId === "") return {
				ok: false,
				message: "`id` 不能为空。"
			};
			if (body === void 0 && fields === void 0) return {
				ok: false,
				message: "至少要给 `body`（新正文）或 `fields`（封面字段）之一。"
			};
			const rawKind = fields?.kind;
			const kind = rawKind === void 0 ? void 0 : rawKind === "" ? "" : isEntryKind(rawKind) ? rawKind : void 0;
			if (rawKind !== void 0 && kind === void 0) return {
				ok: false,
				message: `\`kind\` 非法：\`${rawKind}\`（只能是 ${selectableKindList("、")} 之一，或留空）。`
			};
			const r = await updateEntry(entryId, {
				...body !== void 0 ? { body } : {},
				...fields !== void 0 ? { fields: {
					...fields.title !== void 0 ? { title: fields.title } : {},
					...fields.desc !== void 0 ? { desc: fields.desc } : {},
					...fields.tags !== void 0 ? { tags: fields.tags } : {},
					...kind !== void 0 ? { kind } : {}
				} } : {}
			});
			if (!r.ok) throw new Error(r.message);
			return {
				ok: true,
				message: r.message
			};
		}
	}));
	safeRegister("memj_rebuild", () => defineTool({
		name: "memj_rebuild",
		description: MEMJ_REBUILD_DESCRIPTION,
		parameters: { project: {
			type: "string",
			description: "只重建涉及该项目的部分；不给则全量。"
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					message: {
						type: "string",
						required: true
					},
					themes: {
						type: "integer",
						required: true
					},
					projects: {
						type: "integer",
						required: true
					},
					globalApproved: {
						type: "integer",
						required: true
					},
					invalidCovers: {
						type: "integer",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return [{
					type: "text",
					text: value.message
				}];
			}
		},
		async execute() {
			const snapshot = await scanLibrary({
				includeArchived: true,
				includeHistory: true
			});
			const issues = snapshot.issues;
			const activeCovers = snapshot.covers.filter((c) => (c.cover.archivedAt ?? "") === "");
			const archivedCount = snapshot.covers.length - activeCovers.length;
			const historyCount = activeCovers.filter((c) => c.cover.kind === "history").length;
			const knowledgeCount = activeCovers.length - historyCount;
			const stats = await rebuildDerivedLayers();
			const legal = activeCovers.length - issues.length;
			const lines = [`派生层已重建：${stats.themes} 个主题、${stats.projects} 个项目 frontmatter 被更新、${stats.globalApproved} 条已生效的全局知识。`, `✅ **封面校验**：${legal} 张合法` + (issues.length > 0 ? `、${issues.length} 张**非法**（重建时已跳过）。` : "（全部合法）。") + (archivedCount > 0 ? ` ⚠️ 另有 **${archivedCount} 张已归档**（不在上面的活跃计数里）。` : "") + (historyCount > 0 ? ` ⭐ 其中 **${historyCount} 张是历史归档**（\`kind: history\`，**不参与检索**；其余 ${knowledgeCount} 张是知识）。` : "")];
			if (issues.length > 0) lines.push("⚠️ 非法封面明细**给人处理**——请看 `/memj-review`，或网页 UI 的封面错误列表。");
			return {
				ok: true,
				message: lines.join("\n"),
				themes: stats.themes,
				projects: stats.projects,
				globalApproved: stats.globalApproved,
				invalidCovers: issues.length
			};
		}
	}));
	safeRegister("memj_template", () => defineTool({
		name: "memj_template",
		description: MEMJ_TEMPLATE_DESCRIPTION,
		parameters: {
			action: {
				type: "string",
				description: "要做什么：'list' 列出全部模板（不需确认）/ 'create' 新建或覆盖 / 'delete' 删除。"
			},
			template: {
				type: "object",
				additionalProperties: false,
				description: "`create` 时给。⭐ `desc` 必填（**这一节要干嘛**，会写进该节标题下的规范块）；⭐ **归档规则也写在 `desc` 里**（自然语言）：想让某一节自动瘦身，就在它那段规范里写清\"超过多少字符、把什么归档成什么类型、原处留什么\"。⚠️ **把数字写死**（如\"超过 20000 字符\"）—— 因为工具会把实际字数报给模型，有确切数字才对照得上。",
				properties: {
					id: {
						type: "string",
						required: true,
						description: "模板 id（全小写英文/数字/连字符，2–48 字符；同时是文件名）。"
					},
					title: {
						type: "string",
						description: "给人看的名字。"
					},
					sections: {
						type: "array",
						required: true,
						description: "节定义，**顺序即文档里的顺序**。",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								name: {
									type: "string",
									required: true,
									description: "节名（`## ` 后面那个词）。"
								},
								desc: {
									type: "string",
									required: true,
									description: "⭐ **这一节的书写规范**（必填）—— 它会写进该节标题下的规范块。**没有字数上限**（不占截断配额；超过 2000 字只给提醒，不阻断保存）。"
								}
							}
						}
					}
				}
			},
			id: {
				type: "string",
				description: "`delete` 时要删的模板 id。内置 `default` 不可删。"
			},
			confirm: {
				type: "boolean",
				description: "⭐ **用户同意后才传 true**。不给 ⇒ 本工具**只回一份待确认回执、什么都不做**（两段式确认）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					message: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return [{
					type: "text",
					text: value.message
				}];
			}
		},
		async execute(args) {
			const a = args;
			const req = {
				action: typeof a.action === "string" ? a.action.trim() : "",
				template: a.template,
				id: typeof a.id === "string" ? a.id : "",
				confirm: a.confirm === true
			};
			const decision = decideTemplateTool(req);
			if (decision.kind === "reject") return {
				ok: false,
				message: decision.message
			};
			if (decision.kind === "needs-confirm") return {
				ok: true,
				message: decision.message
			};
			const { listTemplates, normalizeTemplate, saveTemplate, deleteTemplate, validateTemplate } = await Promise.resolve().then(() => templates_exports);
			if (req.action === "list") {
				const all = await listTemplates();
				const lines = [`共 ${all.length} 份模板：`, ""];
				for (const t of all) {
					const errs = validateTemplate(t);
					lines.push(`- \`${t.id}\`（${t.title}）— ${t.sections.length} 节` + (t.id === "default" ? "｜**内置，不可删**" : "") + (errs.length > 0 ? `\n  ⚠️ 该模板不合法：${errs.join("；")}` : ""));
					for (const s of t.sections) lines.push(`  · \`${s.name}\` —— ${s.desc}`);
				}
				lines.push("", "⭐ 要在新建项目时用它：在 `memj_handoff` 里传 `template: \"<id>\"`。", "⚠️ **模板只影响新建项目**；已有文档记着自己的节名，不受模板影响。");
				return {
					ok: true,
					message: lines.join("\n")
				};
			}
			if (req.action === "create") {
				const t = normalizeTemplate(req.template);
				if (t === void 0) return {
					ok: false,
					message: "模板形状不合法（缺 `id`，或 `sections` 全为空）。"
				};
				if (t.id === "default") return {
					ok: false,
					message: "`default` 是内置模板，不可覆盖（可以另建一个 id）。"
				};
				const errs = await saveTemplate(t);
				if (errs.length > 0) return {
					ok: false,
					message: `模板**未写入**（校验没过）：\n${errs.map((e) => `  · ${e}`).join("\n")}`
				};
				return {
					ok: true,
					message: `✅ 模板 \`${t.id}\`（${t.title}）已保存，共 ${t.sections.length} 节。\n⭐ **归档规则写在各节的书写规范里**（自然语言）：想让某一节自动瘦身，就在它那段规范里写清"超过多少字符、归档成什么类型、原处留什么"。
⭐ 在新建项目时用：\`memj_handoff\` 里传 \`template: "` + t.id + "\"`。\n⚠️ **不影响任何已有文档**。"
				};
			}
			const okDel = await deleteTemplate(req.id ?? "");
			return {
				ok: okDel,
				message: okDel ? `✅ 模板 \`${req.id}\` 已删除。\n⭐ **没有任何已有文档受到影响** —— 它们记着自己的节名。` : `模板 \`${req.id}\` 不存在（或不可删）。`
			};
		}
	}));
	safeRegister("memj_normalize_tags", () => defineTool({
		name: "memj_normalize_tags",
		description: MEMJ_NORMALIZE_TAGS_DESCRIPTION,
		parameters: {
			since: {
				type: "string",
				description: "只处理此时间之后更新过的条目（ISO 8601，如 `2026-09-28`）。不给则用水位线。"
			},
			full: {
				type: "boolean",
				description: "无视水位线，全库重跑（较贵）。⚠️ 只有它能把\"没有 updatedAt 的老条目\"纳入。"
			},
			includeBody: {
				type: "string",
				enum: [
					"none",
					"truncated",
					"full"
				],
				description: "给裁决模型多少正文：`truncated`（默认，每条前 1000 字符）/ `none` / `full`。"
			},
			preview: {
				type: "boolean",
				description: "`true` = 只看不改（默认 false = 直接改）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					message: {
						type: "string",
						required: true
					},
					scanned: {
						type: "integer",
						required: true
					},
					pending: {
						type: "integer",
						required: true
					},
					changed: {
						type: "integer",
						required: true
					},
					previewOnly: {
						type: "boolean",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return [{
					type: "text",
					text: value.message
				}];
			}
		},
		async execute(args) {
			const { normalizeTags } = await Promise.resolve().then(() => tag_normalize_exports);
			const a = args;
			const r = await normalizeTags(ctx, config, {
				...a.since !== void 0 && a.since.trim() !== "" ? { since: a.since.trim() } : {},
				...a.full === true ? { full: true } : {},
				...a.includeBody !== void 0 ? { includeBody: a.includeBody } : {},
				...a.preview === true ? { preview: true } : {}
			});
			return {
				ok: r.ok,
				message: r.message,
				scanned: r.scanned,
				pending: r.pending.length,
				changed: r.affected.length,
				previewOnly: r.previewOnly
			};
		}
	}));
	safeRegister("memj_score_turn", () => defineTool({
		name: "memj_score_turn",
		description: MEMJ_SCORE_TURN_DESCRIPTION,
		parameters: {
			session: {
				type: "string",
				description: "要复盘的那个会话 id（`session-<uuid>`）。⚠️ 不是当前子会话的 id。"
			},
			turn: {
				type: "integer",
				description: "要复盘第几轮（该轮已结束）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					message: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return [{
					type: "text",
					text: value.message
				}];
			}
		},
		async execute(args) {
			const a = args;
			const sessionId = typeof a.session === "string" ? a.session.trim() : "";
			const turn = typeof a.turn === "number" ? a.turn : -1;
			if (sessionId === "" || turn < 0) return {
				ok: false,
				message: "参数不完整：需要 `session`（会话 id）与 `turn`（轮次号）。"
			};
			const { resolveProject } = await Promise.resolve().then(() => hot_watch_exports);
			const r = await resolveProject(ctx, sessionId);
			const { scoreTurn } = await Promise.resolve().then(() => score_turn_exports);
			const out = await scoreTurn(ctx, config, {
				sessionId,
				turn,
				project: r.project
			});
			return {
				ok: out.ok,
				message: out.message
			};
		}
	}));
}
/** 读主题 desc（小工具，避免循环依赖）。 */
async function loadThemeDesc(themeId) {
	const { loadThemeFrontmatter } = await import("./search-Zl0qE59D.js").then((n) => n.Gt);
	return (await loadThemeFrontmatter(themeId))?.desc ?? "";
}
//#endregion
//#region src/inject.ts
/**
* ⭐ **「取交接」的注入内容构造**（决策 110）。
*
* 两个命令的**共同职责**：把一个项目/主题的上下文**渲染成模型可见的文本**。
* 它只**构造文本**，不碰会话——送进会话由 `commands.ts` 负责。
*
* ── 为什么单独一个模块 ──────────────────────────────────────────────────────
* ① 纯函数（除读库外无副作用）⇒ **可单测**、不必起会话；
* ② 档位逻辑（三档 + 去重）是**最容易出错的语义**，需独立可测；
* ③ 与命令注册解耦 ⇒ 将来别的入口（工具、网页）也能复用同一份渲染。
*
* ── ⚠️ 对模型的措辞要求（全部来自实际需要，不是客套）──────────────────────
* 🔴 **知识只给「标题 + desc + id + 阅读方式」，正文按需读**——
*    否则一次注入可能几万字，把上下文挤爆，而其中大半这次用不上。
* 🔴 **必须告知"本次针对哪个项目/主题"**——否则模型后续 handoff 时
*    还得调 `memj_info` 去判断归属（用户明确指出的痛点）。
* ⚠️ 但措辞要**弱**：说「**本次交接的目标项目是 X**」，
*    而**不说**「本会话属于 X」——后者会让模型把后续无关工作也记到 X 上。
*
* @module dsh-memj/inject
*/
/** 交接档位（**从小到大**，2 是默认）。 */
const HANDOFF_LEVELS = [
	1,
	2,
	3
];
/** 默认档位：文档 + 项目知识（第 2 档）。 */
const DEFAULT_LEVEL = 2;
/** 档位说明（同时用于提示词与回执）。 */
const LEVEL_LABELS = {
	1: "只交接文档",
	2: "连带项目知识",
	3: "全部（文档 + 项目知识 + 所属主题知识）"
};
/**
* ⭐ **从用户补充的话里解析档位**（"语义选择模式"）。
*
* 🔴 **设计原则**：**认不出就用默认档，并在回执里明说**——
*    绝不猜。用户说了"只看文档"却给了三档（或反之）比"没识别出来"更糟。
*
* ⚠️ 匹配**宁可窄**：只在出现明确的档位词时才认定；含糊的表述（如"整理一下"）
*    一律当没说 ⇒ 走默认档 + 回执告知。
* @param note - 用户补充的话（已 trim）。
* @returns 识别出的档位；**没识别出来时 `undefined`**（调用方用默认档）。
*/
function parseLevel(note) {
	const t = note.trim();
	if (t === "") return void 0;
	if (/全部|都要|所有|连同主题|带主题|加主题|三档|档\s*3|level\s*3/i.test(t)) return 3;
	if (/不要知识|不带知识|别带知识|不含知识/.test(t)) return 1;
	if (/(只看|只要|仅看|仅要|只是|只交接|仅交接)/.test(t) && /文档/.test(t)) return 1;
	if (/一档|档\s*1|level\s*1/i.test(t)) return 1;
	if (/连带|加上知识|带知识|项目知识|二档|档\s*2|level\s*2/i.test(t)) return 2;
}
/**
* ⭐⭐ 「取交接」注入文本的**收尾指令**（决策 110 补充，用户拍板 2026-09-19）。
*
* 🔴 **为什么必须有**：命令用 `followup`（**会唤醒驱动器**，见 `commands.ts`）——
*    模型收到注入后**必然会开始一轮**。而在加这段之前，注入文本**以内容结尾、
*    没有任何收尾**，模型只能自己猜"我该干什么"⇒ 极易**自行动作**
*    （去写库、去改文档、去调工具核对），而用户**只是想让模型知道上下文**。
*
* ⭐ **两个命令共用这一份**（项目 vs 主题）——同一件事写两遍必然漂移。
*
* ── 措辞为什么这么硬 ──────────────────────────────────────────────────────
* 本项目惯例是「**回执/提示词要"给动作"，不能只说"确认一下"**」：
* 所以这里不是"请谨慎"，而是**明确的禁止项 + 唯一的允许项**：
* - 禁止：写库 / 改交接文档 / 调工具核对或补全；
* - 允许（且仅允许）：**告诉用户下一步能做什么**；
* - 收尾：**停下等指令，不要自行开始那件事**。
*
* ⚠️ **"不管什么档位"**：这段**加在 `parts` 末尾、`return` 之前** ⇒
*    三档（1/2/3）与主题交接**都会带上**，不依赖档位分支。
* @returns 收尾指令 markdown（含前置分隔线）。
*/
const CLOSING_INSTRUCTION = `---

⭐ **以上内容已注入完毕——这就够了。**

🔴 **你不需要为了"用上"这些信息而做任何动作**：
不要写库、不要改交接文档、不要调工具去核对或补全。
（这些信息的作用是**让你知道上下文**，不是**让你产出**。）

⭐ **唯一可以做的**：如果合适，**告诉用户接下来可以让你做什么**。
⚠️ **然后就停下**，等用户的下一条指令——**不要自行开始那件事**。`;
const TARGET_PROJECT_LINE = `后续 handoff 若要归档本次工作到这个项目，可直接沿用，**不必再调 \`memj_info\` 判断归属**；⚠️ 但若**后续工作明显是另一件事**，仍应按新话题重新判断。`;
const TARGET_THEME_LINE = "（用于了解这个主题下有哪些可复用知识）。";
const PROJECT_KNOWLEDGE_HINT = `⭐ **以下只给标题与描述，正文按需读**——用 \`memj_read\` 传 \`id\` 取正文（长文档它会回节名清单，再用 \`section\` 取某一节）。`;
const THEME_KNOWLEDGE_HINT = "⭐ **同样只给标题与描述，正文按需读**（`memj_read`）。";
const THEME_COVERS_HINT = `⭐ **只给标题与描述，正文按需读**——用 \`memj_read\` 传 \`id\` 取正文（长文档它会回节名清单，再用 \`section\` 取某一节）。`;
registerPromptDefault("inject:closing", CLOSING_INSTRUCTION);
registerPromptDefault("inject:target-project", TARGET_PROJECT_LINE);
registerPromptDefault("inject:target-theme", TARGET_THEME_LINE);
registerPromptDefault("inject:project-knowledge-hint", PROJECT_KNOWLEDGE_HINT);
registerPromptDefault("inject:theme-knowledge-hint", THEME_KNOWLEDGE_HINT);
registerPromptDefault("inject:theme-covers-hint", THEME_COVERS_HINT);
/**
* 渲染一条知识的**封面行**（不给正文）。
*
* ⚠️ **不再在行尾重复"读它"提示**（决策 124 分层改造）：
* 各节的**表头**已经统一写了"只给标题与描述，正文按需读 + 用 `memj_read` 取"——
* 每行再重复一次是**同一件事写 N 遍**：单行提示 21 字符 + 换行缩进 3 = 24 字符，
* 以本项目 70 张封面算 ≈ **1,680 字符**的白费。
* @param c - 封面。
* @returns markdown 行。
*/
function renderKnowledgeLine(c) {
	const kind = c.kind === "" ? "" : ` [${c.kind}]`;
	const ext = c.ext ? "（外部引用）" : "";
	return `- \`${c.id}\`${kind} **${c.title}**${ext} — ${c.desc}`;
}
/**
* 渲染一个项目的交接内容。
*
* 档位：
* - **1**：只有交接文档正文；
* - **2**：+ 项目自己的知识（**不含**主题的）；
* - **3**：+ 该项目所属主题下的知识。
*
* @param projectId - 项目 id。
* @param level - 档位。
* @returns 模型可见文本；项目不存在时返回 `undefined`。
*/
async function renderProjectHandoff(projectId, level) {
	const doc = await loadProjectDoc(projectId);
	if (doc === void 0) return void 0;
	const snapshot = await scanLibrary();
	const parts = [];
	parts.push(`## 项目交接：\`${projectId}\``);
	parts.push("");
	parts.push(`⭐ **本次交接的目标项目是 \`${projectId}\`**。` + promptText("inject:target-project", TARGET_PROJECT_LINE));
	parts.push("");
	if (doc.frontmatter.desc.trim() !== "") {
		parts.push(`> 项目描述：${doc.frontmatter.desc}`);
		parts.push("");
	}
	parts.push("### 交接文档");
	parts.push("");
	parts.push(doc.narrative.trim() === "" ? "_（该项目暂无叙事内容）_" : doc.narrative.trim());
	parts.push("");
	const counts = {
		narrative: true,
		project: 0,
		theme: 0
	};
	if (level >= 2) {
		const own = snapshot.covers.filter((c) => c.cover.project === projectId);
		counts.project = own.length;
		parts.push(`### 本项目的知识（${own.length} 条）`);
		parts.push("");
		parts.push(promptText("inject:project-knowledge-hint", PROJECT_KNOWLEDGE_HINT));
		parts.push("");
		if (own.length === 0) parts.push("_（本项目暂无知识条目）_");
		else for (const { cover } of own) parts.push(renderKnowledgeLine(cover));
		parts.push("");
	}
	if (level >= 3) {
		const themeIds = [...new Set(doc.frontmatter.themes)].filter((t) => t !== "");
		parts.push(`### 所属主题的知识（主题：${themeIds.length > 0 ? themeIds.join("、") : "无"}）`);
		parts.push("");
		if (themeIds.length === 0) parts.push("_（本项目尚未关联任何主题）_");
		else {
			const shown = new Set(snapshot.covers.filter((c) => c.cover.project === projectId).map((c) => c.cover.id));
			const extra = snapshot.covers.filter((c) => c.cover.theme.some((t) => themeIds.includes(t)) && !shown.has(c.cover.id));
			counts.theme = extra.length;
			if (extra.length === 0) parts.push("_（这些主题下的知识都已在上面的「本项目知识」里列出，无新增条目）_");
			else {
				parts.push(promptText("inject:theme-knowledge-hint", THEME_KNOWLEDGE_HINT));
				parts.push("");
				for (const { cover } of extra) parts.push(renderKnowledgeLine(cover));
			}
		}
		parts.push("");
	}
	parts.push("");
	parts.push(promptText("inject:closing", CLOSING_INSTRUCTION));
	return {
		text: parts.join("\n").trimEnd(),
		counts
	};
}
/**
* 渲染一个主题的交接内容。
*
* ⭐ 内容是：**主题封面（frontmatter）+ 该主题下的知识清单**（只给标题/描述/id）。
* ⚠️ 主题没有"交接文档正文"——`THEME-<id>.md` 是**派生层**，
*    它的正文（覆盖的项目表 + 封面块）是机器生成的，给模型没意义。
*
* @param themeId - 主题 id。
* @returns 模型可见文本；主题不存在时返回 `undefined`。
*/
async function renderThemeHandoff(themeId) {
	const snapshot = await scanLibrary();
	if (!snapshot.themeIds.includes(themeId)) return void 0;
	const fm = await loadThemeFrontmatter(themeId);
	const covers = snapshot.covers.filter((c) => c.cover.theme.includes(themeId));
	const parts = [];
	parts.push(`## 主题：\`${themeId}\``);
	parts.push("");
	parts.push(`⭐ **本次交接的目标主题是 \`${themeId}\`**` + promptText("inject:target-theme", TARGET_THEME_LINE));
	parts.push("");
	parts.push(`> 主题描述：${fm?.desc !== void 0 && fm.desc.trim() !== "" ? fm.desc : "（无描述）"}`);
	parts.push("");
	const projectIds = [...new Set(covers.map((c) => c.cover.project).filter((p) => p !== ""))];
	parts.push(`### 覆盖的项目（${projectIds.length}）`);
	parts.push("");
	parts.push(projectIds.length === 0 ? "_（暂无）_" : projectIds.map((p) => `- \`${p}\``).join("\n"));
	parts.push("");
	parts.push(`### 本主题的知识（${covers.length} 条）`);
	parts.push("");
	parts.push(promptText("inject:theme-covers-hint", THEME_COVERS_HINT));
	parts.push("");
	if (covers.length === 0) parts.push("_（该主题暂无知识条目）_");
	else for (const { cover } of covers) parts.push(renderKnowledgeLine(cover));
	parts.push("");
	parts.push(promptText("inject:closing", CLOSING_INSTRUCTION));
	return {
		text: parts.join("\n").trimEnd(),
		counts: {
			covers: covers.length,
			projects: projectIds.length
		}
	};
}
//#endregion
//#region src/commands.ts
/** `/memj-handoff` 的描述（默认值）。 */
const CMD_HANDOFF_DESCRIPTION = "按 memj 规范做一次记忆 handoff（写叙事 + 沉淀知识 + 归属推进）。";
/** `/memj-review` 的描述（默认值）。 */
const CMD_REVIEW_DESCRIPTION = "人侧状态面板：待批 global 提名 / 断链 / 非法封面。";
/** `/memj-get-handoff-project` 的描述（默认值）。 */
const CMD_GET_PROJECT_DESCRIPTION = "把某个项目的交接内容注入会话（文档 / +项目知识 / +主题知识）。";
/** `/memj-get-handoff-theme` 的描述（默认值）。 */
const CMD_GET_THEME_DESCRIPTION = "把某个主题的封面与知识清单注入会话（正文按需读）。";
const HINT_HANDOFF = "（可补充本次重点，或直接回车）";
const HINT_GET_PROJECT = "（项目 id，可再补档位：只看文档 / 连带项目知识 / 全部）";
const HINT_GET_THEME = "（主题 id）";
/** 分步分支：用户用 `/memj-handoff knowledge` 之类指定了步骤时走这条。 */
const HANDOFF_PROMPT_STEPS = `## 请做一次记忆 handoff（分步）

用户指定**只做这几步**：{{steps}}

请调用 \`memj_handoff\`，带上 \`step: {{stepsJson}}\`——**各步要见该工具的说明**。

🔴 **参数必须与 \`step\` 一致**——传了不属于这几步的参数会被**直接拒绝**
（这是防"你以为写了、其实没写"）。
🔴 **执行顺序固定** narrative → theme → knowledge，与你给的顺序无关。
🔴 **只做这几步**——其余步骤**不在本次范围**，**不是欠账**：
回执会列出"本次范围之外"的步骤，**不要为了"补齐"再调一次**。`;
/** 普通分支：不带步骤时走这条（四条要点）。 */
const HANDOFF_PROMPT = `## 请做一次记忆 handoff

按 \`memj_handoff\` 工具的说明执行。要点：

1. **写哪个项目**——判据见 \`memj_handoff\` 的说明与运行时上下文；
   ⭐ **上文能确定就直接沿用，不必再查库**（那才是重复劳动）。
2. **先读一遍现有交接文档，再写叙事**（**硬性要求**）：
   \`memj_read({ project: "<项目 id>" })\` 读全文；或按 \`section\` **逐节读完**。
   ⚠️ **不读就写 \`doc\` 会被直接拒绝**——凭记忆重写必然压缩、丢细节；
   ⚠️ **上一轮读过也不算**（有效期是**一个完整轮次**），要看**最新**内容。
   🔴 **每一节该写什么，以【它标题下面那个 \`memj:spec\` 围栏块】为准** ——
   那里面写着**这一节的写作要求**（不只是节名），建项目时从模板复制过来的。
   ⇒ ⭐ **写某一节之前先读它、按它写**。
   ⚠️ **节名以正文的 \`##\` 标题为准**（默认六条只在"正文一节都没有"时才回落）——
   自定义模板的节名**完全不同**，别把别项目的节名套过来。
   ⚠️ **那是工具维护的规范块，你不要写它**——写了也会被盘上那份覆盖；
   要改规范就直接改文档里那一节。
   ⚠️ 少数老文档还没有这种块 ⇒ **看文末的 \`## 本档写作规范\` 一节**；
   两者都没有 ⇒ **以正文现有的 \`##\` 标题为准**（节名只认正文）。
   ⚠️ **不要凭印象套固定清单**——写错节名的错位是**静默的**（工具不报错）。
   不确定时看回执首行的「📐 本项目节名」那一行（它每轮都会现报）。
   ⚠️ **既有节要写在它自己那一节里**——别为了让新内容不覆盖旧内容就另起一个平行节，
      那是把"该写没写"伪装成"结构选择"。
3. **沉淀知识**：把值得跨会话复用的知识写进 \`entries\`（每条一个 \`slug\`/\`desc\`/\`body\`/\`tags\`）。
   \`desc\` 是**检索键不是摘要**——写清"什么场景下的什么知识；当什么场景时读它"。
4. **归属**：能挂到本项目已关联的主题就挂（免批准）；
   要建主题就用 \`newThemes\` 声明 \`{ id, desc }\`——
   ⚠️ **能不能建取决于本实例的校验模式**（严格 / 宽松），\`memj_snapshots\` 的返回值会明说；
   要进全局就登记提名（\`entries[].global = true\`）——**封面 \`global\` 保持 false、批准时才置位**；
   ⚠️ **不要自己把封面写成 \`global: true\`**（那等于自己批准了，而你不能批准）。

⚠️ 没有值得记的内容时**不要硬凑**——只更新叙事即可，\`entries\` 留空是正确行为。
💡 **只想做其中一步**？可以带上 \`step\`（\`narrative\` / \`theme\` / \`knowledge\`），
   或直接用 \`/memj-handoff knowledge\` 这样的命令。`;
/** 普通分支后面**追加**的那块（仅当用户在命令后补了话）。 */
const HANDOFF_PROMPT_NOTE = `---

⭐ **用户随命令补充的话**：{{userNote}}

⚠️ 这是**额外交代**，**不是对上面规范的替代**——四条照常走，再按这句调整侧重。`;
/** 机读清单的头部标识（client 的 `options()` 会解析它）。 */
const LIST_HEADER = "items=";
/**
* 把清单编码成**机读文本**（client 侧 `popupSelect.options()` 解析）。
*
* 用 `\t` 分隔、`\n` 分行——简单且不怕内容里有逗号。
* @param rows - 每行 `[id, label, detail]`。
* @returns 编码后的文本。
*/
function encodeList(rows) {
	const lines = [`${LIST_HEADER}${rows.length}`];
	for (const [id, label, detail] of rows) {
		const clean = (s) => s.replace(/[\t\n\r]/g, " ");
		lines.push(`${clean(id)}\t${clean(label)}\t${clean(detail)}`);
	}
	return lines.join("\n");
}
/**
* 把一段文本作为**独立的一轮**送进当前 agent，并**唤醒驱动器**。
*
* 🔴 **为什么必须是 `followup` 而不是 `inject`**（本会话实测踩到，是本命令的核心）：
* `dsh-agent` 的类型文档写得很明确，两者**唤醒语义不同**——
*
* | API | 文档原文 | 空闲时 |
* |---|---|---|
* | `agent.inject()` | "Queue model-facing context for the next pre-step **without waking the driver**… **idle drivers leave it pending**" | ❌ **一直挂着** |
* | `agent.followup()` | "Queue an ordinary follow-up turn **and wake the driver**" | ✅ **立刻开始一轮** |
*
* ⇒ 早先用 `inject` 时，命令执行后模型**根本不动**，界面停在「上下文注入 / 待注入」状态
* ——用户看到的就是"打了命令没反应"。官方 `/goal` 用的也是 `followup`。
*
* ⚠️ 另一条已知事实（`form` 只是语义标签，**不提供"取代上一次"的机制**）：
* 队列一律 `surfaceOp:'append'` ⇒ **重复执行会累积**（旧内容留在历史里持续计费），**不替换**。
* 但它追加在尾部、不碰 node 0，**不破坏前缀缓存**。
* @param agent - 目标 agent。
* @param text - 要送进上下文的文本。
* @param tag - 分节名（溯源用）。
*/
function submitContext(agent, text, tag) {
	agent.followup(createUserMessage({
		content: [{
			type: "text",
			text
		}],
		source: {
			kind: "plugin:dsh-memj",
			form: "instructions",
			sections: [{
				name: tag,
				text
			}]
		}
	}));
}
/**
* ⭐ **从用户补充的话里识别"要做哪几步"**（决策 101 的"指令直达某步"）。
*
* 用法示例：`/memj-handoff knowledge`、`/memj-handoff theme, knowledge`。
*
* 🔴 **只认"整句就是步骤列表"这一种形式**——不做模糊匹配。
*    理由：用户补充的话**可能是一句自然语言**（"这次记网页改造"），
*    在里面**猜**步骤会把正常描述误判成步骤（例如"主题"二字出现在句子里）。
*    ⇒ 判据收紧成：**每个词都是合法步骤名**（以空格/逗号/顿号/`+` 分隔），
*    才认为是在指定步骤；否则整句当普通补充语。
* @param userNote - 用户在命令后补充的那句话。
* @returns 识别出的步骤；没识别出来时 `undefined`。
*/
function parseStepRequest(userNote) {
	const text = userNote.trim();
	if (text === "") return void 0;
	const parts = text.split(/[\s,，、+]+/).map((s) => s.trim()).filter((s) => s !== "");
	if (parts.length === 0) return void 0;
	if (parts.includes("all")) return parts.length === 1 ? ["all"] : void 0;
	return parts.every((p) => HANDOFF_STEP_ORDER.includes(p)) ? parts : void 0;
}
/**
* 渲染一次 handoff 的**启动指令**给模型。
*
* 它只负责"让模型按规范去做"，真正的落盘由模型调用 `memj_handoff` 完成。
* @param userNote - ⭐ 用户在命令后**随手补充的那句话**（空串 = 没写）。
*   它来自 `invocation.rawInput`——因为本命令声明了 `input`，
*   客户端会把 `/memj-handoff ` 落进输入框、允许用户接着写，提交时整行回传。
*   ⚠️ **不要假设它是"重点/范围"**：用户可能写的是范围（"这次记网页改造"），
*   也可能是做法或程度（"整理一下"、"写详细点"）。所以措辞保持中性（"用户补充"）。
*   ⭐ 但它**也可能是在指定步骤**（如 `knowledge`）——那种情况下整句就是步骤列表，
*   见 `parseStepRequest`。
* @returns 模型可见文本。
*/
function renderHandoffPrompt(userNote = "") {
	const steps = parseStepRequest(userNote);
	if (steps !== void 0 && steps[0] !== "all") return fillSlots(promptText("handoff:prompt-steps", HANDOFF_PROMPT_STEPS), {
		steps: steps.map((s) => `\`${s}\``).join("、"),
		stepsJson: JSON.stringify(steps)
	});
	let text = promptText("handoff:prompt", HANDOFF_PROMPT);
	if (userNote !== "") text += "\n\n" + fillSlots(promptText("handoff:prompt-note", HANDOFF_PROMPT_NOTE), { userNote });
	return text;
}
/**
* 注册两个斜杠命令（逐个 try）。
* @param deps - 依赖。
*/
function registerCommands(deps) {
	const { ctx } = deps;
	registerPromptDefault("command:memj-handoff:description", CMD_HANDOFF_DESCRIPTION);
	registerPromptDefault("command:memj-review:description", CMD_REVIEW_DESCRIPTION);
	registerPromptDefault("command:memj-get-handoff-project:description", CMD_GET_PROJECT_DESCRIPTION);
	registerPromptDefault("command:memj-get-handoff-theme:description", CMD_GET_THEME_DESCRIPTION);
	registerPromptDefault("command:memj-handoff:hint", HINT_HANDOFF);
	registerPromptDefault("command:memj-get-handoff-project:hint", HINT_GET_PROJECT);
	registerPromptDefault("command:memj-get-handoff-theme:hint", HINT_GET_THEME);
	registerPromptDefault("handoff:prompt", HANDOFF_PROMPT);
	registerPromptDefault("handoff:prompt-steps", HANDOFF_PROMPT_STEPS);
	registerPromptDefault("handoff:prompt-note", HANDOFF_PROMPT_NOTE);
	/**
	* 逐个注册，一个失败不拖垮其余。
	* @param name - 命令名（日志用）。
	* @param register - 注册动作。
	*/
	const safeRegister = (name, register) => {
		try {
			register();
		} catch (err) {
			ctx.logger?.error?.("dsh-memj: 命令 %s 注册失败（该命令将不可用）: %o", name, err);
		}
	};
	safeRegister("memj-handoff", () => ctx.commands.register({
		name: "memj-handoff",
		description: promptText("command:memj-handoff:description", CMD_HANDOFF_DESCRIPTION),
		input: { hint: promptText("command:memj-handoff:hint", HINT_HANDOFF) },
		handler: (invocation) => {
			const agent = invocation.agent;
			if (agent === void 0) return {
				kind: "success",
				text: "当前上下文没有 agent，无法发起 handoff。"
			};
			const userNote = (invocation.rawInput ?? "").trim();
			submitContext(agent, renderHandoffPrompt(userNote), "memj-handoff");
			return {
				kind: "success",
				text: userNote === "" ? "已把 handoff 规范送进上下文，模型将据此执行。" : `已把 handoff 规范送进上下文，并附上你补充的话：${userNote}`
			};
		}
	}));
	safeRegister("memj-review", () => ctx.commands.register({
		name: "memj-review",
		description: promptText("command:memj-review:description", CMD_REVIEW_DESCRIPTION),
		handler: async (invocation) => {
			const raw = (invocation.rawInput ?? "").trim();
			const lines = [];
			if (raw === "") {
				const noms = await readNominations();
				const { broken, invalidCount } = await countProblems(await scanLibrary());
				return {
					kind: "success",
					text: encodeList([
						[
							"pending",
							`待批 global 提名（${noms.length}）`,
							noms.map((n) => n.desc.slice(0, 40)).join("；")
						],
						[
							"broken",
							`断链的外部引用（${broken}）`,
							"目标文件已不存在，需要人工处理"
						],
						[
							"invalid",
							`非法封面（${invalidCount}）`,
							"格式不合法，已在重建时跳过"
						],
						[
							"rebuild",
							"重建派生层",
							"从项目文档重新聚合 THEME / GLOBAL"
						]
					])
				};
			}
			if (raw === "pending") {
				const noms = await readNominations();
				if (noms.length === 0) return {
					kind: "success",
					text: "没有待批准的 global 提名。"
				};
				lines.push(`## 待批 global 提名（${noms.length}）`, "");
				for (const n of noms) lines.push(`- \`${n.entryId}\`（项目 \`${n.project}\`）— ${n.desc}`);
				lines.push("", `批准：POST /plugins/dsh-memj/api/approve  {"entryId":"..."}`);
				lines.push(`否决：POST /plugins/dsh-memj/api/reject  {"entryId":"..."}`);
				return {
					kind: "success",
					text: lines.join("\n")
				};
			}
			if (raw === "broken") {
				const snapshot = await scanLibrary();
				const brokenItems = [];
				for (const { cover } of snapshot.covers) {
					if (!cover.ext) continue;
					if ((resolveRef(cover.ref, cover.ext) === void 0 ? void 0 : await loadEntryDoc(cover.ref, cover.ext)) === void 0) brokenItems.push(`- \`${cover.id}\` — ${cover.ref}`);
				}
				if (brokenItems.length === 0) return {
					kind: "success",
					text: "没有断链的外部引用。"
				};
				lines.push("## 断链的外部引用", "", ...brokenItems, "", "⚠️ 外部文档不归 memj 管，**不自动修复**——请补档或删封面。");
				return {
					kind: "success",
					text: lines.join("\n")
				};
			}
			if (raw === "invalid") {
				const snapshot = await scanLibrary();
				if (snapshot.issues.length === 0) return {
					kind: "success",
					text: "全部封面格式合法。"
				};
				lines.push(`## 非法封面（${snapshot.issues.length}）`, "");
				for (const i of snapshot.issues) lines.push(`- ${i.file}:${i.line} — ${i.reason}`);
				return {
					kind: "success",
					text: lines.join("\n")
				};
			}
			if (raw === "rebuild") {
				const { rebuildDerivedLayers } = await import("./search-Zl0qE59D.js").then((n) => n.Gt);
				const stats = await rebuildDerivedLayers();
				return {
					kind: "success",
					text: `派生层已重建：${stats.themes} 个主题、${stats.projects} 个项目 frontmatter 更新。`
				};
			}
			return {
				kind: "success",
				text: `未知的子命令「${raw}」。可用：pending / broken / invalid / rebuild。`
			};
		}
	}));
	safeRegister("memj-get-handoff-project", () => ctx.commands.register({
		name: "memj-get-handoff-project",
		description: promptText("command:memj-get-handoff-project:description", CMD_GET_PROJECT_DESCRIPTION),
		input: { hint: promptText("command:memj-get-handoff-project:hint", HINT_GET_PROJECT) },
		handler: async (invocation) => {
			const agent = invocation.agent;
			if (agent === void 0) return {
				kind: "success",
				text: "当前上下文没有 agent。"
			};
			const raw = (invocation.rawInput ?? "").trim();
			const snapshot = await scanLibrary();
			if (raw === "") return {
				kind: "success",
				text: encodeList(snapshot.projects.map((p) => [
					p.id,
					p.id,
					p.frontmatter.desc
				]))
			};
			const [projectId = "", ...rest] = raw.split(/\s+/);
			const note = rest.join(" ");
			const level = parseLevel(note) ?? 2;
			const levelNote = parseLevel(note) !== void 0 ? `按你说的「${note}」定为**第 ${level} 档**（${LEVEL_LABELS[level]}）` : note === "" ? `未指定档位 ⇒ 用**默认第 ${level} 档**（${LEVEL_LABELS[level]}）` : `⚠️ 没看懂「${note}」指的哪一档 ⇒ 用**默认第 ${level} 档**（${LEVEL_LABELS[level]}）；可用说法：只看文档 / 连带项目知识 / 全部`;
			const rendered = await renderProjectHandoff(projectId, level);
			if (rendered === void 0) return {
				kind: "error",
				text: `没有该项目：\`${projectId}\`。库里有：${snapshot.projects.map((p) => `\`${p.id}\``).join("、") || "（库里还没有项目）"}`
			};
			try {
				await appendDocRead(sessionIdOf(agent), {
					project: projectId,
					turn: turnOf(ctx, agent),
					readAt: (/* @__PURE__ */ new Date()).toISOString(),
					full: true,
					sections: [],
					via: "gethandoff"
				});
			} catch {}
			submitContext(agent, rendered.text, "memj-get-handoff-project");
			return {
				kind: "success",
				text: `已注入项目 \`${projectId}\` 的交接内容（${levelNote}）。其中：交接文档 ✅、本项目知识 ${rendered.counts.project} 条` + (level >= 3 ? `、主题新增知识 ${rendered.counts.theme} 条（已去重）` : "") + "。\n⚠️ 已提示模型**到此为止**——它只应确认收到、（可选）告诉你下一步能做什么，**不会再自行动作**（不写库、不改文档、不调工具核对）。"
			};
		}
	}));
	safeRegister("memj-get-handoff-theme", () => ctx.commands.register({
		name: "memj-get-handoff-theme",
		description: promptText("command:memj-get-handoff-theme:description", CMD_GET_THEME_DESCRIPTION),
		input: { hint: promptText("command:memj-get-handoff-theme:hint", HINT_GET_THEME) },
		handler: async (invocation) => {
			const agent = invocation.agent;
			if (agent === void 0) return {
				kind: "success",
				text: "当前上下文没有 agent。"
			};
			const raw = (invocation.rawInput ?? "").trim();
			const snapshot = await scanLibrary();
			if (raw === "") {
				const rows = [];
				for (const id of snapshot.themeIds) {
					const fm = await loadThemeFrontmatter(id);
					rows.push([
						id,
						id,
						fm?.desc ?? ""
					]);
				}
				return {
					kind: "success",
					text: encodeList(rows)
				};
			}
			const themeId = raw.split(/\s+/)[0] ?? "";
			const rendered = await renderThemeHandoff(themeId);
			if (rendered === void 0) return {
				kind: "error",
				text: `没有该主题：\`${themeId}\`。库里有：${snapshot.themeIds.map((t) => `\`${t}\``).join("、") || "（库里还没有主题）"}`
			};
			submitContext(agent, rendered.text, "memj-get-handoff-theme");
			return {
				kind: "success",
				text: `已注入主题 \`${themeId}\`（覆盖项目 ${rendered.counts.projects} 个、知识 ${rendered.counts.covers} 条；⚠️ 只给了标题与描述，正文按需读）。\n⚠️ 已提示模型**到此为止**——它只应确认收到、（可选）告诉你下一步能做什么，**不会再自行动作**（不写库、不改文档、不调工具核对）。`
			};
		}
	}));
}
/**
* 数一下断链与非法封面（`/memj-review` 无参时给概要）。
* @param snapshot - 库快照。
* @returns 断链数与非法封面数。
*/
async function countProblems(snapshot) {
	let broken = 0;
	for (const { cover } of snapshot.covers) {
		if (!cover.ext) continue;
		if (await loadEntryDoc(cover.ref, cover.ext) === void 0) broken += 1;
	}
	return {
		broken,
		invalidCount: snapshot.issues.length
	};
}
//#endregion
//#region src/hot-score-store.ts
/**
* ⭐⭐⭐ **知识评分：落盘（`<库根>/hot/scores.json`）**（决策 177）。
*
* ── 🔴🔴 为什么需要一个"互斥"（本项目第一次需要）────────────────────────────
* 本模块的写入是**读-改-写**（读全表 → 在内存里加事件 → 整份写回）。
* ⚠️ 两个评分子代理**并发**跑时（连续快速对话，上一轮的还没跑完下一轮就来了）：
* ```
* A 读 {x: 3}   B 读 {x: 3}   A 写 {x: 4}   B 写 {x: 4}   ← B 那次 +1 丢了
* ```
* ⇒ ⭐ **必须串行化**。
*
* ⚠️ **为什么不用"逐个字段追加"（真追加写）来绕开**：
*    那要改成"一行一条事件"的 jsonl 形状，而用户要看的是
*    **"每个项目、每条知识现在多少分"**（面板/回执都要整表）⇒ 仍然得聚合。
*    ⇒ 既然总要聚合，就**一次读-改-写 + 互斥**最简单。
*
* 🔴 **互斥的作用域是"本进程"** —— 多实例同时评同一个项目仍会丢更新。
*    ⚠️ 这是**已知边界**，不是疏漏：本项目的库是单用户单实例（`~/.dsh-memj`），
*    且评分子代理由**同一进程的钩子**发起 ⇒ 进程内互斥就够。
*    ⭐ 若将来真要多实例，再上文件锁（不要为不存在的场景提前加复杂度）。
*
* @module dsh-memj/hot-score-store
*/
/** 进程内互斥链（见文件头）。 */
let chain = Promise.resolve();
/**
* ⭐⭐ **串行执行**一段异步逻辑（进程内互斥）。
*
* ⚠️ **失败不阻塞后续**：前一个任务抛错时，链仍然继续
*    （否则一次失败会把后面所有写入永久卡死 —— 那比丢更新更糟）。
* @param fn - 要串行执行的逻辑。
* @returns `fn` 的返回值。
*/
function withScoreLock(fn) {
	const run = chain.then(fn, fn);
	chain = run.then(() => void 0, () => void 0);
	return run;
}
/**
* **读整份评分表**。
*
* ⚠️ **任何异常都回空表**（照 `tag-auto-state` 的纪律：坏文件不该让功能整个挂掉）。
*    🔴 但**不吞掉"结构不对"这件事** —— 版本不符时也当空表（见下）。
* @returns 评分表（读不到时为空表）。
*/
async function loadScoreFile() {
	try {
		const text = await readFile(scoreFilePath(), "utf8");
		const parsed = JSON.parse(text);
		if (parsed?.version !== 1) return emptyScoreFile();
		if (parsed.projects === null || typeof parsed.projects !== "object") return emptyScoreFile();
		return {
			version: 1,
			projects: parsed.projects
		};
	} catch {
		return emptyScoreFile();
	}
}
/** **原子写**（临时文件 + rename ⇒ 中途崩了不会留下半份文件）。 */
async function saveScoreFile(f) {
	const p = scoreFilePath();
	await mkdir(dirname(p), { recursive: true });
	const tmp = `${p}.tmp`;
	await writeFile(tmp, JSON.stringify(f, null, 1), "utf8");
	await rename(tmp, p);
}
/**
* ⭐⭐⭐ **一次原子的"读-改-写"**（加分会走这条）。
*
* @param mutate - 拿到**当前**项目表（可能 `undefined`），回新的项目表；
*   回 `undefined` ⇒ **不写盘**（用于"没什么可加的"这类短路）。
* @param projectId - 项目 id。
* @returns 写入后的项目表（`undefined` = 本次没写）。
*/
async function updateProjectScore(projectId, mutate) {
	if (projectId === "") return void 0;
	return withScoreLock(async () => {
		const f = await loadScoreFile();
		const next = mutate(f.projects[projectId]);
		if (next === void 0) return void 0;
		f.projects[projectId] = next;
		await saveScoreFile(f);
		return next;
	});
}
/** **读一个项目的评分表**（注入侧用；只读、不加锁）。 */
async function readProjectScore(projectId) {
	return (await loadScoreFile()).projects[projectId];
}
//#endregion
//#region src/hot.ts
/**
* ⭐⭐ **热知识注入的数据层**（热知识方案 §5）。
*
* ── 它是什么 ────────────────────────────────────────────────────────────────
* 把"**与该会话相关的知识**（封面 / 正文）按会话推送给模型"这件事所需的
* **人侧设置**收在一处：画像、逐条设置、项目清单、会话绑定。
*
* ── 为什么单独一个模块 ──────────────────────────────────────────────────────
* ① **职责单一**：它只管"读 / 写 / 归一化 `hot/` 下的四个 JSON"，
*    **不做判定、不做渲染、不碰会话** ⇒ 可单测、无副作用；
* ② 🔴 **这些文件不是知识**（不属于"封面 + 正文"模型）——
*    放进 `store.ts` 会让"store 只管库里内容"这条边界模糊；
* ③ ⭐ 判定（§7）、渲染（§6）、注入（§6.2）都要读它 ⇒ **只能有一份实现**
*    （本项目铁律：**一套逻辑两处入口，实现只留一份**）。
*
* ── 🔴 四条设计约束（都来自方案，改动前先读）────────────────────────────────
* 1. **缺省 = 不纳入**（裁定 H-1）：`entries.json` 里没有的条目**一律不注入**。
*    理由：本项目自己有 140+ 张封面，一开就爆预算。
* 2. **画像可以有多条**（用户第二轮要求"保存后加入列表"）⇒ 是数组，不是单文件。
* 3. **`entries.json` 与 `selection.json` 正交**（跨项目属性 vs 逐项目清单）。
* 4. 🔴 **一切读取都容错**：库是用户可手改的，任一文件坏掉**不该让插件挂**
*    ⇒ 解析失败时**退化为空结构**（并**不静默**：由调用方在页面/回执上说明）。
*
* @module dsh-memj/hot
*/
/** 当前文件格式版本（与 `hot/` 下四个文件共用）。 */
const HOT_FILE_VERSION = 1;
/**
* ⭐⭐ 一条**全局知识**设置的默认值。
*
* | 层 | 缺省 | 为什么 |
* |---|---|---|
* | **全局** | ✅ **纳入** | ⭐ **用户最初的需求原话**：「**global 为 true 的知识条目，应该是所有主题都会注入的**」。<br>⚠️ 且全局条目按定义就是"所有会话都该看到"的（数量极少，不会撑爆预算）。 |
*
* 🔴🔴 **历史与收窄（两个阶段，都要记住）**：
* 1. **第一阶段**：本函数**按层返回不同缺省**（项目/主题层 = 不纳入，裁定 H-1）。
* 2. **第二阶段（2026-09-22，用户裁定）**：🔴 **项目/主题知识不再走本结构**
*    ⇒ 它们存进 `selection.json`，而**"在清单里 = 会注入"**（没有 `on` 这个字段）。
*    ⇒ ⚠️ **`layer` 参数保留只为兼容调用点的签名**，值不再影响结果。
*
* ⭐ **为什么项目层不该有"缺省不纳入"**：H-1 的本意是
* "**项目层有 140+ 条、一开就爆预算**"——而候选集**已经被项目清单限住了**
* （默认清单最多 15 条）⇒ 那个担忧在清单这一层**早已被解决**，
* 再叠一道 `on` 只会造成"**选了却不生效**"（实测：选中 11 条、注入 0 条）。
*
* ⚠️ **显式值永远优先**：`entries.json` 里存了 `on: false` 就是 false
* （缺省只在"这条**没有任何记录**"时生效）。
* @param layer - ⚠️ **已不再影响返回值**（保留只为签名兼容，见上）。
* @returns 全局知识条目的默认设置。
*/
function defaultEntrySetting(layer = "global") {
	return {
		on: true,
		channel: "inbox",
		shape: "meta"
	};
}
/**
* 容错解析一个 JSON 文件。
*
* 🔴 **为什么吞掉异常**：库可手改 ⇒ 一个坏文件不该让整个插件/页面挂掉。
* ⚠️ 但**不静默**：坏掉时返回 `undefined`，由调用方决定怎么告知人。
* @param path - 文件绝对路径。
* @returns 解析结果；文件不存在或解析失败时 `undefined`。
*/
async function readJson(path) {
	const text = await readTextIfExists(path);
	if (text === void 0 || text.trim() === "") return void 0;
	try {
		const parsed = JSON.parse(text);
		if (parsed === null || typeof parsed !== "object") return void 0;
		return parsed;
	} catch {
		return;
	}
}
/** 写一个 JSON 文件（**原子写** + 末尾换行，便于人查看与 git 版本维护）。 */
async function writeJson(path, value) {
	await ensureDir(hotDir());
	await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}
/** 画像的默认通道——⚠️ 画像**可以用 `section`**（方案 §3.2：它是"所有会话一样"的内容）。 */
const PERSONA_DEFAULT_CHANNEL = "inbox";
/**
* 读全部画像条目（**保序**）。
*
* ⚠️ **不做任何过滤**——`on: false` 的也返回（页面要显示它、允许再次打开）。
* 过滤由调用方（渲染层）按 `on` 做。
* @returns 画像条目数组；文件缺失/损坏时为空数组。
*/
async function loadPersona() {
	const file = await readJson(hotPersonaPath());
	if (file === void 0 || !Array.isArray(file.items)) return [];
	const out = [];
	for (const raw of file.items) {
		if (raw === null || typeof raw !== "object") continue;
		const it = raw;
		if (typeof it.id !== "string" || it.id === "") continue;
		if (typeof it.text !== "string") continue;
		out.push({
			id: it.id,
			text: it.text,
			on: it.on !== false,
			channel: it.channel === "section" ? "section" : PERSONA_DEFAULT_CHANNEL,
			createdAt: typeof it.createdAt === "string" ? it.createdAt : "",
			updatedAt: typeof it.updatedAt === "string" ? it.updatedAt : ""
		});
	}
	return out;
}
/** 覆盖写全部画像条目。 */
async function savePersona(items) {
	await writeJson(hotPersonaPath(), {
		version: 1,
		items: [...items]
	});
}
/**
* 生成一个画像条目 id（本地即可，**不必**是封面 UUID）。
* ⚠️ 前缀 `p-` 让它一眼区别于封面 id（后者是纯 UUID）。
* @returns 新 id。
*/
function newPersonaId() {
	const rand = Math.random().toString(36).slice(2, 8);
	return `p-${Date.now().toString(36)}${rand}`;
}
/**
* 读全部**全局知识**的逐条设置（**原样返回**，不补默认值——补默认由 `settingOf` 做）。
*
* ⚠️ **2026-09-22 起本表只服务全局层**（见 `HotEntrySetting` 的注释）。
* 旧文件里项目/主题条目的记录**仍会被读出来**，但 `collectHotItems` 不再消费它们
* ⇒ 无害残留。
*
* 🔴🔴 **这些残留【不会被自动清理】**（用户 2026-09-22 裁定的"惰性"同一条：
* **读操作不该有副作用**）⇒ `entries.json` 里会**长期**留着那几条不再生效的记录。
* ⚠️ **所以"entries.json 里有 5 条"不等于"有 5 条在生效"**——
* 实测：5 条里 **4 条是残留**（2 条 history 条目 + 2 条别的项目的知识），
* 真正起作用的只有那 1 条 `global: true` 的。
* ⭐ 要看"到底哪几条在生效"，**看 `GET /hot/global`**（那是人侧接口，已按新逻辑过滤）。
* ⚠️ **为什么留着不删**：用户回滚到旧版本时还要用（旧代码会把它们当有效设置读）。
*/
async function loadEntrySettings() {
	const file = await readJson(hotEntriesPath());
	if (file === void 0 || file.entries === null || typeof file.entries !== "object") return {};
	const out = {};
	for (const [id, raw] of Object.entries(file.entries)) {
		if (raw === null || typeof raw !== "object") continue;
		const v = raw;
		out[id] = {
			on: v.on === true,
			channel: v.channel === "section" ? "section" : "inbox",
			shape: v.shape === "full" ? "full" : "meta"
		};
	}
	return out;
}
/**
* ⭐ 取某一**条**的设置；**没有记录 ⇒ 返回"不纳入"的默认值**（裁定 H-1）。
* @param all - 已读出的全部设置。
* @param entryId - 封面 id。
* @param layer - ⚠️ **已不再影响结果**（保留只为签名兼容，见 `defaultEntrySetting`）。
* @returns 该条的设置（永远是完整形状）。
*/
function settingOf(all, entryId, layer = "global") {
	return all[entryId] ?? defaultEntrySetting(layer);
}
/** 覆盖写全部逐条设置。 */
async function saveEntrySettings(entries) {
	await writeJson(hotEntriesPath(), {
		version: 1,
		entries: { ...entries }
	});
}
/**
* 读全部项目清单（**含旧结构自动迁移**）。
*
* 🔴🔴 **2026-09-22 结构变更**：`entryIds: string[]` → `entries: HotProjectEntry[]`。
* 迁移规则（**读时惰性迁移**，不单独写迁移脚本）：
*
* | 旧字段 | 新归属 |
* |---|---|
* | `entryIds[i]` | `entries[i].id`，`shape` 取 `'meta'`、`pinnedAt` 取 `''` |
* | `entries.json[封面id].shape` | ⚠️ **不迁移**——旧值是按"知识自己的属性"设的， |
* | `entries.json[封面id].pinnedAt` | 而新语义是"逐项目" ⇒ 搬过来等于**替用户做决定** |
*
* ⚠️ **为什么 shape 不迁移**：旧 `shape` 只对**全局知识**有意义（旧设计里项目层
* 因 `on` 缺省 `false` 而**从未真正注入过**，所以它们的 `shape` 也从未生效）
* ⇒ 项目层一律以 `'meta'` 起步，等用户在项目页显式改成正文形态。
*
* ──────────────────────────────────────────────────────────────────────────
* 🔴🔴 **"惰性"的确切含义：只读时【不回写磁盘】。这是用户 2026-09-22 的裁定。**
*
* 后果（**有意如此，别当 bug 去"修"**）：
* - **只要用户不动这个项目的清单** ⇒ `selection.json` **会一直保持旧结构**
*   （`entryIds: string[]`），程序照样读得对；
* - 一旦发生**任何写**（置顶 / 切形态 / 加入 / 移出 / 生成默认清单）⇒
*   `saveSelections()` 用**新结构**覆盖整个文件，那一刻它才落盘。
*
* ⚠️ **为什么当初考虑过"读到就落盘"又否掉了**：
* > 那样**肉眼可验证**（用户能直接看到文件变了），但代价是
* > **一次纯读取动作会改用户的库文件** —— 与"只读不写"的直觉相反，
* > 而且用户若回滚到旧版本，会看到一份它读不懂的结构。
* ⇒ ⭐ **判据：读操作不该有副作用**（用户选了这个）。
*
* 🔴🔴 **所以"文件还是旧的"≠"迁移没生效"** —— 这两件事要分清：
* | 你想知道 | 看哪里 |
* |---|---|
* | 迁移生效了吗 | **`GET /hot/selection` 的 `entries` 字段**（人侧接口，已归一） |
* | 文件落盘了吗 | `selection.json` 的 mtime 与内容（**只写时才变**） |
* ⚠️ 实测踩到：用户看到"库根的 entries/selection 还是没变化"而怀疑迁移没跑
* —— 真相是**磁盘本来就不该变**（且当时 3096 还跑着旧代码，见下）。
*
* ⚠️ **另一个容易误判的点**：这个文件是**服务端**读的 ⇒
* 改了 `hot.ts` **必须重启实例**才生效（进程启动时就 import 完了）。
* 旧进程读到的仍是旧逻辑 ⇒ **接口也回旧结构**（有 `entryIds`、没有 `entries`）。
* ⭐ 判据：**先看接口回的是哪个结构**，再判断"迁移到底跑没跑"。
*/
async function loadSelections() {
	const file = await readJson(hotSelectionPath());
	if (file === void 0 || file.projects === null || typeof file.projects !== "object") return {};
	const out = {};
	for (const [pid, raw] of Object.entries(file.projects)) {
		if (raw === null || typeof raw !== "object") continue;
		const v = raw;
		let entries = [];
		if (Array.isArray(v.entries)) for (const e of v.entries) {
			if (e === null || typeof e !== "object") continue;
			const it = e;
			if (typeof it.id !== "string" || it.id === "") continue;
			entries.push({
				id: it.id,
				shape: it.shape === "full" ? "full" : "meta",
				pinnedAt: typeof it.pinnedAt === "string" ? it.pinnedAt : ""
			});
		}
		else if (Array.isArray(v.entryIds)) entries = v.entryIds.filter((x) => typeof x === "string" && x !== "").map((id) => ({
			id,
			shape: "meta",
			pinnedAt: ""
		}));
		out[pid] = {
			entries,
			initializedAt: typeof v.initializedAt === "string" ? v.initializedAt : ""
		};
	}
	return out;
}
/** 覆盖写全部项目清单。 */
async function saveSelections(projects) {
	await writeJson(hotSelectionPath(), {
		version: 1,
		projects: { ...projects }
	});
}
/**
* ⭐ **保留多少个会话绑定**（裁定 H-4：留最新 50 个，按最新活跃时间倒序淘汰）。
*
* 🔴 **淘汰只动这个文件，绝不删 DSH 的会话数据**——
* 官方持久化层**根本没有删除接口**（README 明文 "Nothing deletes session files"），
* 归档也只是不可逆的显示过滤 ⇒ 我们更不该越界删用户的会话。
*/
const HOT_SESSION_KEEP = 50;
/** 读会话绑定文件的**完整内容**（含三个判定开关）。 */
async function loadSessionsFile() {
	const file = await readJson(hotSessionsPath());
	const sessions = {};
	if (file !== void 0 && file.sessions !== null && typeof file.sessions === "object") for (const [sid, raw] of Object.entries(file.sessions)) {
		if (raw === null || typeof raw !== "object") continue;
		const v = raw;
		if (typeof v.project !== "string" || v.project === "") continue;
		const src = v.source;
		sessions[sid] = {
			project: v.project,
			source: src === "llm" || src === "manual" || src === "inherited" ? src : "doc-reads",
			boundAt: typeof v.boundAt === "string" ? v.boundAt : "",
			lastActiveAt: typeof v.lastActiveAt === "string" ? v.lastActiveAt : ""
		};
	}
	const m = file?.detectLlmModel;
	return {
		version: 1,
		detectDocReads: file?.detectDocReads !== false,
		detectLlm: file?.detectLlm === true,
		detectLlmModel: m !== null && m !== void 0 && typeof m.provider === "string" && typeof m.model === "string" ? {
			provider: m.provider,
			model: m.model
		} : null,
		sessions
	};
}
/** 覆盖写会话绑定文件。 */
async function saveSessionsFile(file) {
	await writeJson(hotSessionsPath(), {
		version: 1,
		detectDocReads: file.detectDocReads,
		detectLlm: file.detectLlm,
		detectLlmModel: file.detectLlmModel,
		sessions: file.sessions
	});
}
/**
* ⭐⭐ **按最新活跃时间淘汰**，只留最新 `keep` 个（裁定 H-4）。
*
* 🔴 **纯函数**（不碰磁盘）⇒ 可单测；且**只处理这个文件的数据**，
* 与 DSH 的会话存储无关。
*
* ⚠️ **排序判据是 `lastActiveAt` 倒序**；空串（从未记过）排最后。
* @param sessions - 全部绑定。
* @param keep - 保留条数（默认 `HOT_SESSION_KEEP`）。
* @returns 淘汰后的新对象 + 被丢弃的会话 id 列表。
*/
function pruneSessions(sessions, keep = 50) {
	const ids = Object.keys(sessions);
	if (ids.length <= keep) return {
		kept: { ...sessions },
		dropped: []
	};
	const sorted = [...ids].sort((a, b) => {
		const av = sessions[a]?.lastActiveAt ?? "";
		return (sessions[b]?.lastActiveAt ?? "").localeCompare(av);
	});
	const keptIds = sorted.slice(0, keep);
	const dropped = sorted.slice(keep);
	const kept = {};
	for (const id of keptIds) {
		const v = sessions[id];
		if (v !== void 0) kept[id] = v;
	}
	return {
		kept,
		dropped
	};
}
/**
* ⭐ **记一次"这个会话还活跃"**（写 `lastActiveAt`）。
*
* 🔴 **为什么要有**：`Session` 上**没有任何"最后活跃"字段**（已核实），
* 而裁定 H-4 要按最新活跃时间淘汰 ⇒ 只能**我们在真的跑过时**写一笔。
* ⚠️ **不新建绑定**：只更新**已存在**的绑定（没有绑定就什么都不做）——
* 否则会把每个路过的会话都记进来（那正是要淘汰的东西）。
* @param sessionId - 会话 id。
* @param nowIso - 当前时间（ISO；注入便于测试）。
* @returns 是否发生了更新。
*/
async function touchSession(sessionId, nowIso) {
	const file = await loadSessionsFile();
	const cur = file.sessions[sessionId];
	if (cur === void 0) return false;
	cur.lastActiveAt = nowIso;
	await saveSessionsFile(file);
	return true;
}
/**
* ⭐ 写一个会话的**绑定**（并顺手淘汰超量的旧绑定）。
* @param sessionId - 会话 id。
* @param binding - 绑定内容。
*/
async function setSessionBinding(sessionId, binding) {
	const file = await loadSessionsFile();
	file.sessions[sessionId] = binding;
	const { kept, dropped } = pruneSessions(file.sessions);
	file.sessions = kept;
	await saveSessionsFile(file);
	return { dropped };
}
/**
* ⭐ 取一个会话的绑定（**不落盘、不新建**）。
* @param sessionId - 会话 id。
* @returns 绑定；没有则 `undefined`。
*/
async function getSessionBinding(sessionId) {
	return (await loadSessionsFile()).sessions[sessionId];
}
//#endregion
//#region src/hot-inject.ts
/**
* ⭐⭐ **热知识的判定与渲染**（热知识方案 §6 / §7）。
*
* ── 两件事，都刻意做成**纯函数**（除读库外无副作用）─────────────────────────
* ① **判定**：这个会话在做哪个项目？（§7）
* ② **渲染**：把该给的内容拼成一段注入文本（§6）
*
* 🔴 **为什么不和 `hot.ts` 合并**：那个模块只管"读写 `hot/` 下的文件"，
* 这个模块管"**判断给谁、给什么**"——前者的调用方是网页 API，后者是 `pre-step` 钩子。
* 混在一起会让"网页读设置"与"每步注入"两条路径互相牵连。
*
* 🔴 **为什么不和 `inject.ts`（取交接）合并**：那条是**人主动触发的一次性注入**
* （`followup`，会唤醒模型，末尾要"停下等指令"）；本模块是**每步自动注入的背景知识**
* （`pre-step` 追加，不唤醒，末尾要"继续当前任务"）。
* ⚠️ **两者的收尾指令语义相反** ⇒ 共用渲染会写错措辞。
*
* @module dsh-memj/hot-inject
*/
/**
* ⭐ **收尾指令**（方案 §6.1）——措辞**逐字取自用户 2026-09-21 的要求**。
*
* 🔴 **必须存在**（本项目既有纪律，条目 `ee1034ef`）：注入类文本**不能以内容结尾**，
* 否则模型会自己猜该干什么 ⇒ 自行动作（写库、改文档、调工具核对）。
*
* ⚠️ **与 `inject.ts` 的 `CLOSING_INSTRUCTION` 差别（三点，都别改回去）**：
* 1. **"继续当前任务"** 而不是"停下等指令"——热知识是**每轮都在的背景**，
*    注入完就该接着干原来的活；说"停下"会让模型误以为要等指令；
* 2. ⭐ **"你本身寻求的信息"**（用户原话）——它给了模型一个**主动取正文**的正当理由；
* 3. ⭐ **禁止客套寒暄**（用户原话）——针对"好的，我已了解背景……"这类纯噪音。
*/
const HOT_CLOSING_INSTRUCTION = `---

⭐ **以上内容已注入完毕——这就够了。**

除非**用户的问题**、或**你本身正在寻求的信息**正好落在上面某条（\`meta\` 形态的）条目上
（那时用 \`memj_read\` 传 \`id\` 取正文），否则**继续当前任务**。

🔴 **禁止额外的客套、寒暄**，以及"我已了解上下文"这类确认性输出。`;
/**
* ⭐⭐ **「正文形态」那一段的收尾**（用户 2026-09-24 逐字给定）。
*
* 🔴 **为什么要与上面那条分开**（用户裁定）：
*   正文形态（画像 + `full` 条目）的内容**已经在模型眼前**，
*   上面那句"正文按需 `memj_read`"**对它不适用** ⇒ 不该混用同一段收尾。
*   ⇒ **拆成两段消息、各带各的收尾**（补注时；首次全量仍合成一条，见 `renderHotText`）。
*
* ⭐ **措辞是用户原话，别改**：
*   *"以上是用户要求或者背景知识，但不是任务；结合上述要求或知识继续当前工作。"*
* ⚠️ 它同时承担两个作用：① 说明这些内容的**性质**（不是任务）；
*   ② 给出**唯一动作**（继续当前工作）——符合本项目"注入类文本必须有收尾指令"的纪律。
*/
const HOT_BODY_CLOSING_INSTRUCTION = "以上是用户要求或者背景知识，但不是任务；结合上述要求或知识继续当前工作。";
const HOT_HEAD_FIRST = "## memj 热知识（本次会话相关）";
const HOT_HEAD_SUPPLEMENT = "## memj 热知识（补充）";
const HOT_DIRECT_SECTION = "### 直接可用的内容（画像 + 正文形态的知识）";
const HOT_META_HINT = "⭐ **以下只给标题与描述，正文按需读**——用 `memj_read` 传 `id` 取正文。";
registerPromptDefault("hot:closing", HOT_CLOSING_INSTRUCTION);
registerPromptDefault("hot:body-closing", HOT_BODY_CLOSING_INSTRUCTION);
registerPromptDefault("hot:head-first", HOT_HEAD_FIRST);
registerPromptDefault("hot:head-supplement", HOT_HEAD_SUPPLEMENT);
registerPromptDefault("hot:direct-section", HOT_DIRECT_SECTION);
registerPromptDefault("hot:meta-hint", HOT_META_HINT);
/**
* 渲染一行 `meta` 形态的条目（**与 `inject.ts` 的 `renderKnowledgeLine` 同形**）。
*
* ⚠️ **行里本来就带完整 id** ⇒ 看门狗**不需要额外字符成本**就能做指纹（方案 §6.2）。
* @param c - 封面。
* @returns markdown 行。
*/
function renderMetaLine(c) {
	const kind = c.kind === "" ? "" : ` [${c.kind}]`;
	const ext = c.ext ? "（外部引用）" : "";
	return `- \`${c.id}\`${kind} **${c.title}**${ext} — ${c.desc}`;
}
/**
* ⭐⭐ **画像的"指纹"**——用来判断它在不在窗口里。
*
* 🔴🔴 **为什么画像需要它**：看门狗（`idsInWindow`）按**封面 id** 判定，
* 而**画像没有封面 id**（它是 `persona.json` 里的人编内容，注入时**原样**拼接、
* 不带任何 id 前缀）⇒ 它**永远检测不到**，在页面上永远显示"未注入"。
*
* 🔴 **还有一个更严重的连带后果**（本函数同时修掉它）：
* `decideInjection` 算的是 `missing = expected − present`，而 `expected` **只有封面 id**
* ⇒ **只有画像、没有封面条目时 `missing` 恒为空** ⇒ 判定成"一条不缺" ⇒
* **一个字都不注入**（画像被静默丢掉）。
* ⇒ 把画像指纹并入 `expected` / `present` 同一集合后，
* "画像变了但封面条目都在"这种情况也能被正确补注。
*
* ⚠️ **取前 60 字符**：够长到不会偶然撞上，又短到不受后续编辑影响。
*
* 🔴🔴 **阈值是 8 而不是 20**（实测修正）：生产库里用户的画像是
* **「思考过程和回答使用中文。」（13 字符）** —— 按 20 的阈值它**没有指纹**
* ⇒ 它在列表里永远显示"未注入"（而它其实每轮都在注入）⇒ **界面在撒谎**。
* ⭐ 判据：**阈值要按"真实用户会写多短"定，不是按"我觉得多长才安全"定**。
* ⚠️ 8 字符的中文整句（如"思考过程和回答使用中文。"）在任何消息里偶然重现
* 的概率极低 ⇒ 不会造成假绿；而**假红的代价只是多注入一次**（可接受）。
*
* ⚠️ **取舍的方向**：宁可口径偏"严"（判成未注入 ⇒ 多补一次），
* 也不能偏"松"（判成已注入 ⇒ **该注入的没注入**，用户看不到任何提示）。
* @param text - 画像正文。
* @returns 指纹串（不参与判定时返回空串）。
*/
function personaFingerprint(text) {
	const t = text.trim();
	return t.length < 8 ? "" : t.slice(0, 60);
}
/**
* ⭐⭐ 把"画像 + 正文形态条目 + 三组 meta 条目"拼成一段注入文本（方案 §6.1）。
*
* 🔴 **分段规则**（用户要求，别改）：
* - **画像**与**`shape: 'full'` 的条目**合并成**第一段「直接可用的内容」——
*   两者都是"**内容现在就在模型眼前、不需要 read**"；
* - 其余按 **全局 → 项目 → 主题** 三组，每组带表头。
*
* ⚠️ **纯函数**：`full` 条目的正文由调用方通过 `bodies` 传入
* （本函数**不做 I/O** ⇒ 可单测；读正文在 `buildHotInjection`）。
* ⚠️ **空段不输出**（不写"（无）"占位——那只是噪音）。
* @param persona - 全部画像条目（**本函数自己按 `on` 过滤**）。
* @param items - 待注入的条目（已按层分组，见 `collectHotItems`）。
* @param bodies - `entryId → 正文`；缺失的 `full` 条目**降级成 meta 行**
*   （⚠️ **不静默丢弃**：宁可少给形态，也不能让模型以为它拿到了正文）。
* @returns 渲染结果；**全空时 `text` 为空串**。
*/
function renderHotText(persona, items, bodies = /* @__PURE__ */ new Map(), opts = {}) {
	const only = opts.only;
	/** ⚠️ 统一的"这条要不要渲染"判据（三处循环共用，避免各写一份）。 */
	const wanted = (fp) => only === void 0 || fp !== "" && only.has(fp);
	const counts = {
		personaFull: 0,
		entryFull: 0,
		globalMeta: 0,
		projectMeta: 0,
		themeMeta: 0,
		metaChars: 0,
		fullChars: 0
	};
	/** ⭐ 本次**真正参与渲染**的条目（供页面显示；见 `HotPreviewItem`）。 */
	const preview = [];
	/** 第一段的行（画像正文 + `full` 条目的带 id 标题与正文）。 */
	const direct = [];
	for (const p of persona) {
		if (!p.on || p.text.trim() === "") continue;
		if (!wanted(personaFingerprint(p.text))) continue;
		counts.personaFull += 1;
		counts.fullChars += p.text.length;
		direct.push(p.text.trim());
		preview.push({
			id: "",
			type: "persona",
			title: firstLine(p.text),
			shape: "full",
			fp: personaFingerprint(p.text)
		});
	}
	/** ⚠️ 正文缺失的 `full` 条目 ⇒ 退回 meta 组（见 `renderableItems`）。 */
	const fallbackMeta = [];
	for (const it of items) {
		if (it.setting.shape !== "full") continue;
		if (!wanted(it.cover.id)) continue;
		const body = bodies.get(it.cover.id);
		if (body === void 0 || body.trim() === "") {
			fallbackMeta.push({
				...it,
				setting: {
					...it.setting,
					shape: "meta"
				}
			});
			continue;
		}
		counts.entryFull += 1;
		counts.fullChars += body.length;
		direct.push(`#### \`${it.cover.id}\` ${it.cover.title}`, "", body.trim());
		preview.push({
			id: it.cover.id,
			type: it.layer,
			title: it.cover.title,
			shape: "full",
			fp: it.cover.id
		});
	}
	const all = fallbackMeta.length === 0 ? items : [...items, ...fallbackMeta];
	const groups = [
		{
			title: "全局知识",
			layer: "global",
			key: "globalMeta"
		},
		{
			title: "项目知识",
			layer: "project",
			key: "projectMeta"
		},
		{
			title: "所属主题的知识",
			layer: "theme",
			key: "themeMeta"
		}
	];
	const parts = [];
	/** ⭐ meta 段的行（**单独攒**，好让补注时分成两条消息、各带各的收尾）。 */
	const metaParts = [];
	if (direct.length > 0) {
		parts.push(promptText("hot:direct-section", HOT_DIRECT_SECTION), "");
		parts.push(...direct);
	}
	for (const g of groups) {
		const rows = all.filter((it) => it.setting.shape === "meta" && it.layer === g.layer && wanted(it.cover.id));
		if (rows.length === 0) continue;
		counts[g.key] = rows.length;
		metaParts.push("", `### ${g.title}（${rows.length} 条）`, "");
		metaParts.push(promptText("hot:meta-hint", HOT_META_HINT), "");
		for (const it of rows) {
			metaParts.push(renderMetaLine(it.cover));
			preview.push({
				id: it.cover.id,
				type: it.layer,
				title: it.cover.title,
				shape: "meta",
				fp: it.cover.id
			});
		}
	}
	counts.metaChars = all.filter((it) => it.setting.shape === "meta" && wanted(it.cover.id)).reduce((n, it) => n + renderMetaLine(it.cover).length, 0);
	if (opts.supplement !== true) {
		const both = metaParts.length === 0 ? parts : [...parts, ...metaParts];
		if (both.length === 0) return {
			text: "",
			counts,
			preview
		};
		return {
			text: [
				promptText("hot:head-first", HOT_HEAD_FIRST),
				"",
				...both,
				"",
				promptText("hot:closing", HOT_CLOSING_INSTRUCTION)
			].join("\n"),
			counts,
			preview
		};
	}
	const head = promptText("hot:head-supplement", HOT_HEAD_SUPPLEMENT);
	const bodyText = parts.length === 0 ? "" : [
		head,
		"",
		...parts,
		"",
		promptText("hot:body-closing", HOT_BODY_CLOSING_INSTRUCTION)
	].join("\n");
	const metaText = metaParts.length === 0 ? "" : [
		head,
		"",
		...metaParts,
		"",
		promptText("hot:closing", HOT_CLOSING_INSTRUCTION)
	].join("\n");
	return {
		text: bodyText === "" ? metaText : bodyText,
		counts,
		preview,
		bodyText,
		metaText
	};
}
/** 取一段文本的**首行**（画像的显示标题；空文本返回 `(空)`）。 */
function firstLine(text) {
	const line = text.trim().split("\n")[0]?.trim() ?? "";
	return line === "" ? "(空)" : line.slice(0, 80);
}
/**
* ⭐ **本项目声明的主题集合**（用于评分模式的归属校验）。
*
* ⚠️ 与 `collectHotItems` 里主题层用的是**同一个来源**（`loadProjectDoc` 的 `themes:`），
*    不另读一份 —— 否则两处判据会漂移。
* @param projectId - 项目 id。
* @returns 主题 id 集合（读不到时为空集）。
*/
async function projectThemeSet(projectId) {
	try {
		const doc = await loadProjectDoc(projectId);
		return new Set((doc?.frontmatter.themes ?? []).filter((t) => t !== ""));
	} catch {
		return /* @__PURE__ */ new Set();
	}
}
async function collectHotItems(projectId, scoreOpts) {
	const snapshot = await scanLibrary();
	const settings = await loadEntrySettings();
	const selections = await loadSelections();
	const known = projectId !== "未知" && projectId !== "";
	/** 本项目清单：`封面 id → 该条在清单里的设置`（形状 `shape` / `pinnedAt`）。 */
	const selEntries = /* @__PURE__ */ new Map();
	if (known) for (const e of selections[projectId]?.entries ?? []) selEntries.set(e.id, {
		shape: e.shape,
		pinnedAt: e.pinnedAt
	});
	const out = [];
	for (const { cover } of snapshot.covers) {
		if (!cover.global) continue;
		const st = settingOf(settings, cover.id, "global");
		if (!st.on) continue;
		out.push({
			cover,
			setting: st,
			layer: "global",
			pinnedAt: ""
		});
	}
	if (known) {
		if (scoreOpts?.on === true) {
			const proj = await readProjectScore(projectId);
			const rankings = topScored(proj, Date.now(), scoreOpts.windowHours, scoreOpts.topN, scoreOpts.gate === true ? { gate: {
				minScore: scoreOpts.gateMinScore ?? 1,
				lastTurn: scoreOpts.gateLastTurn === false ? -1 : lastRunTurn(proj)
			} } : void 0);
			const shownScored = new Set(out.map((it) => it.cover.id));
			const byId = new Map(snapshot.covers.map((c) => [c.cover.id, c.cover]));
			const themeAllows = await projectThemeSet(projectId);
			for (const r of rankings) {
				if (shownScored.has(r.id)) continue;
				const cover = byId.get(r.id);
				if (cover === void 0) continue;
				if (cover.project !== projectId && !cover.theme.some((t) => themeAllows.has(t))) continue;
				shownScored.add(r.id);
				out.push({
					cover,
					setting: {
						on: true,
						channel: "inbox",
						shape: selEntries.get(r.id)?.shape ?? "meta"
					},
					layer: "project",
					pinnedAt: ""
				});
			}
			return out;
		}
		const shown = new Set(out.map((it) => it.cover.id));
		for (const { cover } of snapshot.covers) {
			if (cover.project !== projectId) continue;
			if (shown.has(cover.id)) continue;
			const sel = selEntries.get(cover.id);
			if (sel === void 0) continue;
			out.push({
				cover,
				setting: {
					on: true,
					channel: "inbox",
					shape: sel.shape
				},
				layer: "project",
				pinnedAt: sel.pinnedAt
			});
		}
		const doc = await loadProjectDoc(projectId);
		const themeIds = [...new Set(doc?.frontmatter.themes ?? [])].filter((t) => t !== "");
		if (themeIds.length > 0) {
			const shown2 = new Set(out.map((it) => it.cover.id));
			for (const { cover } of snapshot.covers) if (cover.theme.some((t) => themeIds.includes(t)) && !shown2.has(cover.id)) {
				const sel = selEntries.get(cover.id);
				if (sel === void 0) continue;
				out.push({
					cover,
					setting: {
						on: true,
						channel: "inbox",
						shape: sel.shape
					},
					layer: "theme",
					pinnedAt: sel.pinnedAt
				});
				shown.add(cover.id);
			}
		}
	}
	const pinned = out.filter((it) => it.pinnedAt !== "").sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
	const rest = out.filter((it) => it.pinnedAt === "");
	return [...pinned, ...rest];
}
/**
* ⭐⭐ **判定"这个会话在做哪个项目"**（方案 §7.2）。
*
* 🔴 **只用 `doc-reads`，绝不用 `reads`**（用户明确要求，且机制上更正确）：
* `reads` 记的是"读过某条**知识**"，而知识**可以跨项目复用**（那正是主题存在的理由）
* ⇒ 用它判定会把"A 读了 B 的知识"**误判成"在做 B"**。
* `doc-reads` 记的是"读过某个**项目文档**"，**没有跨项目复用这一说** ⇒ 信号干净。
*
* ⚠️ **"最新一条"是刻意的**（不是"最多数"）：用户会中途换项目，
* **最近读的最能代表"现在在做什么"**。
* @param sessionId - 会话 id。
* @param knownProjects - 当前库里的活跃项目 id（用来排除已删/已归档的）。
* @returns 项目 id；判不出时返回 `HOT_PROJECT_UNKNOWN`（**一等公民**，不抛错）。
*/
async function detectProjectByDocReads(sessionId, knownProjects) {
	const reads = await readDocReads(sessionId);
	if (reads.length === 0) return {
		project: HOT_PROJECT_UNKNOWN,
		at: ""
	};
	const sorted = [...reads].sort((a, b) => (b.readAt ?? "").localeCompare(a.readAt ?? ""));
	for (const r of sorted) {
		const pid = r.project ?? "";
		if (pid === "") continue;
		if (!knownProjects.includes(pid)) continue;
		return {
			project: pid,
			at: r.readAt ?? ""
		};
	}
	return {
		project: HOT_PROJECT_UNKNOWN,
		at: ""
	};
}
/**
* ⭐⭐ **从会话事件里解析"取过哪个项目的交接"**（2026-09-22 新增，用户要求）。
*
* ── 为什么需要它 ────────────────────────────────────────────────────────────
* 用户实测报告：某个会话**做过 `/memj-get-handoff-project dsh-memj`**，
* 但自动判定**判不出项目** —— 因为那条命令**当时不写任何记录**。
* 用户原话："这个也应该能够从历史 session 里读出 …… 这个方式也应该加到
* doc-reads 开启后的判定方法里。"
*
* ── 判据是什么（实测确认的形态）──────────────────────────────────────────────
* 会话日志里的 `command/run` 事件**带着 `args`**，形如：
* ```json
* {"type":"command/run","seq":46,"time":1790040880001,
*  "data":{"commandId":"…","name":"memj-get-handoff-project","args":" dsh-memj 档1","source":{"kind":"user"}}}
* ```
* ⇒ ⭐ **命令名 + `args` 的第一个词**就是项目 id（与 `commands.ts:372` 的解析**同一规则**）。
*
* ⚠️ **只认这两个命令**（项目级）：`memj-get-handoff-project`。
*    主题级的 `memj-get-handoff-theme` **不算项目判据**（它给的是主题 id，不是项目）。
*
* 🔴 **纯函数**（不碰 I/O）⇒ 可单测；日志读取在 `detectProjectByGetHandoff`。
* @param events - 会话事件（`SessionEvent[]`，含 `data`）。
* @param knownProjects - 当前活跃项目 id（排除已删/已归档）。
* @returns 项目 id + 该命令发生的时刻（epoch ms）；判不出时 `project` 为 `未知`。
*/
function parseGetHandoffFromEvents(events, knownProjects) {
	let best;
	for (const raw of events) {
		const e = raw;
		if (e?.type !== "command/run") continue;
		const d = e.data;
		if ((typeof d?.name === "string" ? d.name : "") !== "memj-get-handoff-project") continue;
		const pid = (typeof d?.args === "string" ? d.args : "").trim().split(/\s+/)[0] ?? "";
		if (pid === "") continue;
		if (!knownProjects.includes(pid)) continue;
		const atMs = typeof e.time === "number" ? e.time : 0;
		if (best === void 0 || atMs > best.atMs) best = {
			project: pid,
			atMs
		};
	}
	return best ?? {
		project: "未知",
		atMs: 0
	};
}
/**
* ⭐⭐ **读会话日志，按"会话里留下的痕迹"判定项目**（2026-09-22）。
*
* 🔴 **一次读日志、跑两个解析器**（**别读两遍** —— 会话日志可能很大）：
* - ⭐⭐⭐ `parseHandoffFromEvents`（**`memj_handoff` 的 `tool/call`，最强**）；
* - ⭐ `parseGetHandoffFromEvents`（`/memj-get-handoff-project` 的 `command/run`）。
*
* ⭐ **优先级**（用户 2026-09-22 裁定）：**`handoff` 高于 `get-handoff`**
* —— 前者是**模型自己声明并真的写了文档**，后者只是"人要了上下文"。
* ⚠️ 但两者**都在 `detectDocReads` 开关之下**（开关关着时压根不调本函数）。
*
* 🔴 **为什么优先 `observeSession` 而不是 `readSession`**（本项目既有实测结论，
* 见 `dsh-history-rewind/lib/index.js:124-153` 的注释）：
* `readSession()` 用 `Session.create` 的快照模式构造日志，**要求
* `inheritedEventCount === log.length`** ⇒ **任何 fork 后又有追加的会话
* （grown fork）它都必然抛错**（原文："for every grown fork, deterministically"）。
* 而 `observeSession()` 走 restore（detached）路径，**能吃 grown fork**
* ⇒ **优先它，把 `readSession` 留作回退**（给没有该方法的旧核）。
*
* ⚠️ **三重容错**（任一失败都返回"未知"，**绝不抛**）：
* ① 服务不存在（非 web 组装）；② `observeSession` 抛错且回退也失败；③ 事件里没有痕迹。
* @param ctx - 插件上下文（要能取到 `sessionQuery`）。
* @param sessionId - 会话 id。
* @param knownProjects - 当前活跃项目 id。
* @returns 项目 id + 来源（`handoff` / `get-handoff`）+ 时刻（ISO）；
*   判不出时 `未知` + 空来源 + 空串。
*/
async function detectProjectBySessionLog(ctx, sessionId, knownProjects) {
	try {
		const q = ctx.get("sessionQuery");
		if (q === void 0) return {
			project: HOT_PROJECT_UNKNOWN,
			source: "",
			at: ""
		};
		let events;
		if (typeof q.observeSession === "function") {
			let obs;
			try {
				obs = await q.observeSession(sessionId, { projectionMode: "none" });
				const ev = obs?.events;
				if (Array.isArray(ev)) events = ev;
			} catch {} finally {
				try {
					obs?.[Symbol.dispose]?.();
				} catch {}
			}
		}
		if (events === void 0 && typeof q.readSession === "function") {
			const ev = (await q.readSession(sessionId))?.events;
			if (Array.isArray(ev)) events = ev;
		}
		if (events === void 0) return {
			project: HOT_PROJECT_UNKNOWN,
			source: "",
			at: ""
		};
		const byHandoff = parseHandoffFromEvents(events, knownProjects);
		if (byHandoff.project !== "未知") return {
			project: byHandoff.project,
			source: "handoff",
			at: byHandoff.atMs > 0 ? new Date(byHandoff.atMs).toISOString() : ""
		};
		const byGet = parseGetHandoffFromEvents(events, knownProjects);
		if (byGet.project !== "未知") return {
			project: byGet.project,
			source: "get-handoff",
			at: byGet.atMs > 0 ? new Date(byGet.atMs).toISOString() : ""
		};
		return {
			project: HOT_PROJECT_UNKNOWN,
			source: "",
			at: ""
		};
	} catch {
		return {
			project: HOT_PROJECT_UNKNOWN,
			source: "",
			at: ""
		};
	}
}
/**
* ⭐⭐⭐ **从会话事件里解析"这个会话 handoff 过哪个项目"**（2026-09-22 用户要求）。
*
* ── 为什么它是最强的判据 ────────────────────────────────────────────────────
* 用户实测报告：某会话**做过 5 次 `memj_handoff`**（含一次"建立项目"的交接），
* 但自动判定**判不出项目** —— 因为那条路径**以前不写任何记录**。
* 用户原话："这个会话最后一轮是一次建立项目的交接。"
*
* ── 判据是什么 ──────────────────────────────────────────────────────────────
* `tool/call` 事件的 `data.name === 'memj_handoff'`，而它的**入参里明写着 `project`**：
* ```json
* {"type":"tool/call","data":{"name":"memj_handoff",
*   "arguments":{"project":"dsh-016-upgrade","projectDesc":"…","doc":"…","entries":[…]}}}
* ```
* ⇒ ⭐ **模型自己声明的项目**，而且它**真的写了那个项目的文档**
*    ⇒ 比 `doc-reads`（读了文档）与 `get-handoff`（人要了上下文）**都直接**。
*
* ⚠️ **`step: 'knowledge'` 的那几次也算**（同样声明了 `project`，只是没写叙事）
*    —— 用户裁定"取最新一次"。
* ⚠️ **参数可能是字符串**（工具调用参数在流里是 JSON 字符串）⇒ 两种形态都要吃。
* 🔴 **纯函数**（不碰 I/O）⇒ 可单测。
* @param events - 会话事件（`SessionEvent[]`，含 `data`）。
* @param knownProjects - 当前活跃项目 id（排除已删/已归档）。
* @returns 项目 id + 该调用发生的时刻（epoch ms）；判不出时 `project` 为 `未知`。
*/
function parseHandoffFromEvents(events, knownProjects) {
	let best;
	for (const raw of events) {
		const e = raw;
		if (e?.type !== "tool/call") continue;
		const d = e.data;
		if (d?.name !== "memj_handoff") continue;
		let obj;
		const a = d.arguments ?? d.args;
		if (typeof a === "string") try {
			obj = JSON.parse(a);
		} catch {
			continue;
		}
		else if (a !== null && typeof a === "object") obj = a;
		const pid = typeof obj?.project === "string" ? obj.project.trim() : "";
		if (pid === "") continue;
		if (!knownProjects.includes(pid)) continue;
		const atMs = typeof e.time === "number" ? e.time : 0;
		if (best === void 0 || atMs > best.atMs) best = {
			project: pid,
			atMs
		};
	}
	return best ?? {
		project: "未知",
		atMs: 0
	};
}
/**
* ⚠️ 通道归一化：**项目/主题层不允许 `section`**（方案 §3.2）。
*
* 🔴 `systemPrompt.section()` 在 root scope 注册 ⇒ 它的 `text()` 对**所有 agent**
* 返回同一份内容 ⇒ "按项目区分"的东西**物理上装不进去**。
* ⇒ 即便用户写了 `section`，项目/主题层也**一律按 `inbox` 处理**，
*   并在页面上**明确提示**（**不静默降级**——本项目一贯）。
* @param channel - 用户设置的通道。
* @param layer - 该条属于哪一层。
* @returns 实际生效的通道 + 是否发生了降级。
*/
function effectiveChannel(channel, layer) {
	if (channel === "section" && layer !== "global") return {
		channel: "inbox",
		downgraded: true
	};
	return {
		channel,
		downgraded: false
	};
}
/**
* ⭐⭐ **从一段文本里认出"这批指纹里出现过的那些"**（两处共用同一实现）。
*
* 🔴 **为什么要有这个共享函数**：同一判据（"这段注入文本里有没有这条"）有**两个调用方**——
*    · 看门狗 `idsInWindow`（`hot-watch.ts`，**每次出网都跑**）；
*    · 重建 `fingerprintsFromInjectionEvents`（`/hot` 的冷路径）。
*    本项目铁律：**实现只留一份**——否则两处迟早漂移（已发生过多次）。
*
* ── ⭐ 两条路径（2026-09-24 按用户要求改，**先量后定**）────────────────────────
* | 指纹形态 | 走哪条 | 成本 |
* |---|---|---|
* | **uuid 形状**（封面 id，绝大多数） | **一次正则扫出文本里所有 uuid + 求交** | **与指纹数无关**（只扫一遍文本） |
* | **非 uuid**（画像的文本指纹，现实里 1~几条） | 逐条 `includes` | 与条数成正比，但条数极少 |
*
* 🔴🔴 **为什么按指纹数分两路**（实测拐点，不是拍脑袋）：
*    · `includes` 是 **SIMD 优化的子串搜索**，**指纹少时完胜**正则
*      （实测 1142KB 语料 / 19 条指纹：**逐条 7.2ms vs 正则 13.7ms**）；
*    · 但它的成本 = `指纹数 × 全文扫描` ⇒ **线性增长**（200 条时 85.8ms、1000 条时 403ms）；
*    · 正则的成本**基本恒定**（11~15ms，只扫一遍文本）。
*    ⇒ **实测拐点在 20~50 条之间**；本项目当前 19 条（3 画像 + 16 封面）。
*    ⚠️ 但**清单会长大**（「批量加入」一次可加 149 条）⇒ 现在按"与指纹数无关"的写法做，
*      以后不会随清单增长而恶化。
*    ⭐ 判据：**性能结论必须量出来**，别凭"正则看着更高级"或"逐条看着更土"下判断。
*
* ⚠️ **非 uuid 指纹不能漏**：画像**没有封面 id**，它的身份就是**正文前 60 字符的文本指纹**
*    （见 `personaFingerprint`）⇒ 它**不可能**被 uuid 正则扫到 ⇒ 必须单独用 `includes` 兜。
*    🔴 这是本函数最容易写错的一处：只写正则 ⇒ **画像永远显示「未注入」**。
*
* @param text - 要扫描的文本（注入文本 / 出网消息拼接的全文）。
* @param wanted - 待认的全部指纹（封面 id + 画像指纹）；空串会被忽略。
* @returns 其中出现的那些（新集合；调用方自行合并）。
*/
function fingerprintsInText(text, wanted) {
	const found = /* @__PURE__ */ new Set();
	if (text === "" || wanted.length === 0) return found;
	/** uuid 形状的（走正则 + 求交）。 */
	const uuidWanted = /* @__PURE__ */ new Set();
	/** 非 uuid 的（画像文本指纹；走逐条 includes）。 */
	const textWanted = [];
	for (const fp of wanted) {
		if (fp === "") continue;
		if (UUID_SHAPE.test(fp)) uuidWanted.add(fp);
		else textWanted.push(fp);
	}
	if (uuidWanted.size > 0) {
		for (const m of text.matchAll(UUID_SCAN)) if (uuidWanted.has(m[0])) found.add(m[0]);
	}
	for (const fp of textWanted) if (text.includes(fp)) found.add(fp);
	return found;
}
/** 封面 id 的形状（**全小写** 8-4-4-4-12）。⚠️ 只用于**判定形状**，不带 `/g`（避免 `lastIndex` 状态）。 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/**
* 从文本里**扫出所有 uuid 形状的串**（`/g` + `matchAll`；见 `fingerprintsInText` 的注释）。
*
* ⭐ **导出它**，是为了让主动注入的"窗口快照"能**共用同一份形状定义**：
*    那边要扫的是"**所有**出现过的封面 id"（不预设待找列表），用法不同、
*    但**什么算一个 id** 必须只有一处定义 —— 否则两个判据会各认各的
*    （本项目铁律：同一判据只能有一份实现）。
*/
const UUID_SCAN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
/**
* ⭐⭐⭐ **从会话事件里读出"最近一次热知识注入包含哪些指纹"**（2026-09-23 用户要求）。
*
* ── 为什么需要它（真实缺陷，用户实测报告）────────────────────────────────────
* 用户原话：*"隔了一整夜，此会话之前已经注入的内容，现在显示未注入了。
* 我怀疑，只要重新启动之后，已注入的内容就会显示未注入，那这是不对的哇？"*
*
* 🔴 **用户说得对，而且根因是"界面在撒谎"**：
* 看门狗的窗口快照 `hotState.windows` 是**纯内存**的（代码原文"**进程重启即失**"）
* ⇒ 重启后为空 ⇒ `/hot` 回 `window: null` ⇒ 页面把**每一条**都显示成"未注入"。
* ⚠️ 而**注入的内容其实好好地躺在会话里**（实测：本会话日志里有 3 个
* `user/message` 事件、`source={kind: 'plugin:dsh-memj'}`，最近一次含 **14 个封面 id**）
* ⇒ 那是**假话**：模型眼前明明有，界面却说"未注入"。
*
* ── 判据与看门狗【完全一致】─────────────────────────────────────────────────
* 注入文本就是**当初真发出去的那段**，里面**本来就带每条封面的完整 id**
* （`meta` 行 `- \`<id>\` …`、`full` 段标题 `#### \`<id>\` 标题`）
* ⇒ 在它里面 `includes(id)` ＝ 当时那条在不在窗口里，**与 `idsInWindow` 同一判据**。
* ⭐ 所以重建出来的快照**与平时的结论对得上**（不会出现"重启前说已注入、重启后说没有"）。
*
* 🔴🔴 **"最近一次 memj 注入" ≠ "最近一次【热知识】注入"**（2026-09-24 实测修）：
*    `plugin: 'dsh-memj'` 这个标记**命令注入也在用** ——
*    例如 `/memj-handoff` 的提示词走的是**同一条** `source: {kind: 'plugin:dsh-memj'}`。
*    ⚠️ 实例：本会话日志里 `11:41:37` 有一条 **979 字符、命中 0/19** 的注入
*    （内容是"请做一次记忆 handoff"），它排在真正的热知识注入**之后**。
*    ⇒ 旧实现取到它 ⇒ 一条指纹都对不上 ⇒ 下面的 `present.size === 0` 守卫
*      判成"这个会话从没注入过热知识" ⇒ `/hot` 回 `windowSource: null`
*      ⇒ **页面把每一条都显示成「未注入」**（而在下一次真实出网后又会自己变好，
*        所以这种"撒谎"极难复现、极难排查）。
*
* 🔴🔴 **为什么不是"取最近一条【含指纹的】注入"，而是"每条指纹各自找"**（2026-09-24 用户当场质疑后改）：
*    我第一版修法是"跳过不含指纹的事件、取最近那一条含指纹的" ——
*    ⚠️ **用户指出它不成立**：*"如果补了单条，那其他的不就被判断成未注入了？"*
*    ⭐ **他说的对，而且根因是那条判据的【前提】被打破了**：
*    · 「只取最近一次」成立的**前提是"每次注入都是全量的"** ——
*      那样最近一次的文本 = 模型眼前的热知识全集；
*    · 而**补注方案（缺哪条补哪条）恰恰是增量的** ⇒ 最近一次可能**只含 1 条**
*      ⇒ 取它当全集 ⇒ **其余 18 条全被判成「未注入」**（页面在撒谎，且是常态性的）。
*    ⇒ ⭐ **正确判据**：**对每条指纹独立判定"它在任何一次注入里出现过没有"** ——
*      全量注入与增量补注**都能对**（本次全量给的 + 历次补的 = 模型眼前真实持有）。
*    ⚠️ **它同时免掉了"命令注入"那类问题**：那种文本一条指纹都不含 ⇒ 天然不贡献任何 present。
*
* ⚠️ **纯函数**（不碰 I/O）⇒ 可单测；读日志在 `hot-watch.ts`。
* @param events - 会话事件（含 `user/message`）。
* @param fps - 本次应注入的全部指纹（封面 id + 画像指纹）。
* @returns 其中"在**任何一次** memj 注入文本里出现过的" + **最后一次含指纹的注入**时刻（ISO）；
*   找不到含指纹的注入事件时 `present` 为空集、`at` 为空串。
*/
function fingerprintsFromInjectionEvents(events, fps) {
	const wanted = fps.filter((fp) => fp !== "");
	const present = /* @__PURE__ */ new Set();
	if (wanted.length === 0) return {
		present,
		at: ""
	};
	/** 最后一次**含指纹**的 memj 注入时刻（命令注入不参与 ⇒ 不会被它带偏）。 */
	let lastAt = "";
	for (const raw of events) {
		const e = raw;
		if (e?.type !== "user/message") continue;
		const d = e.data;
		if ((d?.source)?.kind !== "plugin:dsh-memj") continue;
		const msg = d?.message;
		const content = Array.isArray(msg?.content) ? msg.content : d?.content;
		if (!Array.isArray(content)) continue;
		const text = content.map((b) => {
			const t = b?.text;
			return typeof t === "string" ? t : "";
		}).join("\n");
		if (text === "") continue;
		const hits = fingerprintsInText(text, wanted);
		if (hits.size === 0) continue;
		for (const fp of hits) present.add(fp);
		lastAt = typeof e.time === "number" && e.time > 0 ? new Date(e.time).toISOString() : "";
	}
	return {
		present,
		at: lastAt
	};
}
/**
* ⭐ 某条是否该走 `section` 通道（**画像与全局层才可能**）。
*
* @deprecated 🔴 **本函数全项目零调用，且名字与实现对不上**
* （它叫 `isSection`，判的却是 `shape`）——两个问题都在，留着会误导。
* 真要判"走不走 section"，用 `effectiveChannel(setting.channel, layer)`。
* ⚠️ **暂不删**：`test-hot.mjs` 可能引用它；等二期做 `section` 通道时一并清理。
*/
function isSectionShape(shape) {
	return shape === "full";
}
/**
* ⭐⭐ **一次完整的注入组装**（判定 → 收集 → 读正文 → 渲染）。
*
* 🔴 **这是唯一做 I/O 的入口**（读库 + 读正文）；上面三个都是纯函数。
* 拆开是为了：**规则可单测**、**I/O 只在一处**、`pre-step` 里能一眼看清顺序。
*
* ⚠️ **性能**：`collectHotItems` 每次都要 `scanLibrary()`（扫全部项目文档）。
* 本方案接受这一点——因为**只在有热知识要注入时才跑**，
* 且 `pre-step` 本身一轮才一次（方案 §7.2 已确认不需要节流）。
* @param sessionId - 会话 id（用于告警定位；本函数不读它）。
* @param projectId - 已判定的项目（`未知` = 只注入全局 + 画像）。
* @param opts - ⭐ 透传给 `renderHotText` 的渲染选项（`only` 子集 / `supplement` 补注模式）。
*   ⚠️ **`only` 还会顺带省掉读正文**：不参与本次注入的 `full` 条目**根本不读盘**
*     （补注常常只缺一两条，没必要把整批正文都读出来）。
* @returns 注入文本 + 统计 + 参与注入的条目（供看门狗做指纹）。
*/
async function buildHotInjection(sessionId, projectId, opts = {}) {
	const [persona, items] = await Promise.all([loadPersona(), collectHotItems(projectId, opts.score)]);
	const bodies = /* @__PURE__ */ new Map();
	const needBody = items.filter((it) => it.setting.shape === "full" && (opts.only === void 0 || opts.only.has(it.cover.id)));
	if (needBody.length > 0) {
		const { loadEntryDoc } = await import("./search-Zl0qE59D.js").then((n) => n.Gt);
		for (const it of needBody) try {
			const doc = await loadEntryDoc(it.cover.ref, it.cover.ext);
			if (doc?.body !== void 0 && doc.body !== null) bodies.set(it.cover.id, doc.body);
		} catch {}
	}
	return {
		...renderHotText(persona, items, bodies, opts),
		items
	};
}
//#endregion
//#region src/subagent-origin.ts
/**
* ⭐⭐⭐ **子代理的"发起方"登记表**（2026-09-29 新增，用户裁定）。
*
* ── 为什么需要这张表 ────────────────────────────────────────────────────────
* 用户裁定（原话）：
*   *"由主会话 llm 发起的子代理需要继承，纯由我插件发起的子代理不继承
*     比如现在那个做标签规范的。"*
*
* ⇒ 「主会话 LLM 发起的子代理」**继承父会话的项目绑定**；
*   「插件自己发起的子代理」**不继承**（它只是工具的一个壳，没有项目语境）。
*
* ── 难点：DSH 的会话头**区分不出这两种** ──────────────────────────────────
* 🔴 **实测（2026-09-29）**：解压 169 个会话的 `session.v3.jsonl.zstd` 首事件后比对 ——
*    两种子代理的头**逐字段相同**：
*    ```json
*    { "origin": "subagent", "delegationDepth": 1,
*      "parentSession": "session-<父>", "agentPreset": "cordis", "isSeeded": false }
*    ```
*    ⚠️ 我逐一核过 `origin` / `agentPreset` / `delegationDepth` / `parentSession`
*       四个字段，**没有一个能区分"谁发起的"**
*       （LLM 发起的 `514dbad5` 与插件发起的 `a4e6311d` 完全同形）。
*    ⚠️ `SubagentStartRequest`（`@deepseek-ai/dsh-subagent` 的 `types.d.ts:136`）
*       也**没有**任何"发起方"字段 —— 两条路都只是传一个 `parent: Agent`。
*
* ⇒ ⭐ **只能由插件自己记账**：**插件发起时把子会话 id 记下来**，
*   "在这一列里 ⇒ 是我发起的 ⇒ 不继承"；"不在 ⇒ 是别处发起的 ⇒ 继承"。
*
* ── 为什么记在内存而不是落盘 ────────────────────────────────────────────────
* ⚠️ 这里记的是**刚 spawn 出来的子会话**，而继承判定发生在**该子会话自己的
*    首个 `pre-step`**（秒级之内、同一进程内）⇒ 内存足够。
* 🔴 **不用落盘的理由**：落盘会引入"什么时候清"的问题（子会话结束后要删，
*    否则文件无限长），而**漏删的后果是"下一次同 id 复用时不继承"**——
*    这类跨版本残留脏数据正是本项目栽过的坑（如 `entries.json` 的残留）。
* ⚠️ **代价（如实写明）**：**进程重启后这张表就空了** ⇒ 重启前起的插件子代理
*    在重启后会被当成"别处发起的"而**继承**。
*    ⇒ 但那个子代理**早就跑完了**（它是 fire-and-forget 的一次性调用），
*      重启后不会再有它的 `pre-step` ⇒ **实际不会有影响**。
*/
/** 插件自己发起的子会话 id（`session-<uuid>` 形态）。 */
const pluginSpawned = /* @__PURE__ */ new Set();
/**
* 记下"这个子会话是我（插件）发起的"。
*
* ⚠️ 必须在**拿到子会话 id 之后立刻**调用 —— 子代理的首个 `pre-step`
*    可能几乎同时发生。
* @param childId - 子会话 id（`run.id`）。
*/
function markPluginSpawned(childId) {
	const id = childId.trim();
	if (id === "") return;
	pluginSpawned.add(id);
}
/**
* 这个会话是不是**插件自己发起**的子代理？
*
* @param sessionId - 会话 id。
* @returns `true` = 插件发起（**不继承**父会话项目）；`false` = 别处发起（可继承）。
*/
function isPluginSpawned(sessionId) {
	return pluginSpawned.has(sessionId.trim());
}
/** ⚠️ 仅供测试：清空登记表（生产代码不该调）。 */
function clearPluginSpawnedForTest() {
	pluginSpawned.clear();
}
//#endregion
//#region src/hot-watch.ts
var hot_watch_exports = /* @__PURE__ */ __exportAll({
	decideInjection: () => decideInjection,
	detectProjectByDocReads: () => detectProjectByDocReads,
	hotState: () => hotState,
	idsInWindow: () => idsInWindow,
	previewForSession: () => previewForSession,
	rebuildWindowFromSessionLog: () => rebuildWindowFromSessionLog,
	registerHotInjection: () => registerHotInjection,
	resetHotState: () => resetHotState,
	resolveContextWindow: () => resolveContextWindow,
	resolveProject: () => resolveProject,
	touchSession: () => touchSession
});
/** 全局单例（**同一进程内共享**；见上方的"为什么必须"）。 */
const hotState = {
	windows: /* @__PURE__ */ new Map(),
	lastInject: /* @__PURE__ */ new Map(),
	warnedNoProject: /* @__PURE__ */ new Set()
};
/**
* ⭐ 判断一条注入内容**是否还在窗口里**。
*
* 判据 = 该条的**指纹**（封面 id，或画像的文本指纹）是否出现在任一 text 块里。
*
* 🔴🔴 **比对逻辑已改为走共享实现 `fingerprintsInText`**（2026-09-24 按用户要求统一）：
*    原来这里是"拼全文 + 逐个 `includes`"，而**重建那条路径是另一份实现** ——
*    同一判据两份代码，迟早漂移（本项目已有多次教训）。
*    ⭐ 现在两处**共用同一份**：
*    · **uuid 形状的指纹**（封面 id）⇒ 一次正则扫全文 + 求交，**成本与指纹数无关**；
*    · **非 uuid 的指纹**（画像文本指纹）⇒ 逐条 `includes` 兜底（🔴 漏了它画像永远判不出）。
*
*    ⚠️ **为什么不是简单的"逐条 includes"**：它的成本 = `指纹数 × 全文扫描`。
*    实测（1142KB 语料）：19 条 ⇒ 7.2ms（比正则快），但 200 条 ⇒ **85.8ms**、
*    1000 条 ⇒ **403ms**；而正则恒在 11~15ms。
*    拐点在 20~50 条之间 —— 本项目当前 19 条**尚未越过**，但**清单会长大**
*    （「批量加入」一次可加 149 条）⇒ 采用"与指纹数无关"的写法，以后不会恶化。
*    ⭐ 判据：**性能结论必须量出来**（本项目"先量再下结论"）。
*
* ⚠️ **已知的"假阳性"**（**不是 bug，别去修**）：`/memj-get-handoff-*` 注入的文本
* **也含这些 id** ⇒ 那条命令注入过之后，本会话会被判为"在窗口内"。
* **语义上不算错**（模型确实拿到了那条的标题与描述）。
* @param messages - 出网消息（`GenerateOptions.messages`）。
* @param ids - 本次应注入的全部指纹（封面 id + 画像指纹）。
* @returns 其中"还在窗口里"的那些。
*/
function idsInWindow(messages, ids) {
	const found = /* @__PURE__ */ new Set();
	if (!Array.isArray(messages) || ids.length === 0) return found;
	const texts = [];
	for (const m of messages) {
		const content = m?.content;
		if (!Array.isArray(content)) continue;
		for (const b of content) {
			const t = b?.text;
			if (typeof t === "string" && t !== "") texts.push(t);
		}
	}
	if (texts.length === 0) return found;
	for (const fp of fingerprintsInText(texts.join("\n"), ids)) found.add(fp);
	return found;
}
/**
* ⭐⭐ **算出"这一次该注入什么"**（看门狗的核心判据）。
*
* 🔴 **"忘了哪条补哪条"就落在这个集合差上**：
* `missing = expected − present`；**一条不缺 ⇒ 文本为空 ⇒ 一个字都不注入**。
*
* ⚠️ **首步无快照 ⇒ 必然全缺 ⇒ 全部注入**（**这是正确行为**，别当 bug：
* 会话刚开始时模型确实还没见过这些内容）。
*
* 🔴🔴 **2026-09-24 修（用户报的 bug）：`present` 缺失时要【自己从会话日志找一次】**
*
* **原缺口**："从会话日志重建窗口快照"**只写在 `api.ts` 的 `/hot` 里**（给人看页面用），
*    而**注入侧只读内存** ⇒ **两条路各算各的**：
*    · 页面上显示「已注入」（它查了日志，结论对）；
*    · 而这里 `present` 为空 ⇒ 判成"全缺" ⇒ **又全量注入一遍**。
*    ⚠️ 决策 143 只修了一半：那条修的是"界面别撒谎"，**注入侧的判据没跟着改**。
*    ⭐ 表象就是用户说的"**重启之后明明显示全部已注入，却还是把热知识全量重注入了一遍**"
*      （实测日志里连续 4 次 4299 字符全量注入）。
*
* **修法（用户 2026-09-24 裁定"方案 A + 写回"）**：
*    ① **只在 `present === undefined`（内存没有）时才查日志** —— 读日志实测要解压 12MB，
*       而本函数**每步都跑** ⇒ **绝不能每次都查**；
*    ② 查到就**通过 `rebuilt` 回传给调用方写回 `hotState.windows`** ⇒
*       之后（以及正常出网后）都走内存，**每步的常态成本为零**。
*    ⭐ 一句话：**"缺了才去日志里找一次，找到就记住"**。
*
* 🔴 **为什么重建放在本函数内部**（而不是调用方先重建再传进来）：
*    重建需要 `expected`（本次应注入的全部指纹），而它由 `buildHotInjection` 算出 ——
*    那是**唯一做 I/O 的重活**（扫全库 + 读正文）⇒ **不能为拿指纹算两遍**。
*    放在这里 ⇒ `built` 只算一次，指纹现成。
*
* @param sessionId - 会话 id。
* @param projectId - 已判定的项目。
* @param present - 上一次出网的窗口快照（`undefined` = 内存里没有）。
* @param ctx - ⭐ 给了才做"缺失时从日志重建"（**给不了就退化为原行为**：
*   没有快照 ⇒ 全缺 ⇒ 全量注入）。`api.ts` 那条冷路径用的是
*   `previewForSession`，不走这里。
* @returns 注入决策；`rebuilt` 非空表示"刚从日志重建了一份"（调用方应写回内存）。
*/
async function decideInjection(sessionId, projectId, present, ctx, score) {
	const built = await buildHotInjection(sessionId, projectId, score !== void 0 ? { score } : {});
	const expected = built.preview.map((p) => p.fp).filter((fp) => fp !== "");
	let presentNow = present;
	let rebuilt;
	if (presentNow === void 0 && ctx !== void 0) {
		rebuilt = await rebuildWindowFromSessionLog(ctx, sessionId, expected);
		if (rebuilt !== void 0) presentNow = rebuilt.present;
	}
	const withRebuilt = rebuilt === void 0 ? {} : { rebuilt };
	/** ⚠️ 不注入时两段都必须给空串（类型要求；调用方据此跳过 push）。 */
	const NO_TEXT = {
		bodyText: "",
		metaText: ""
	};
	if (built.text === "") return {
		text: "",
		injected: [],
		expected,
		project: projectId,
		...NO_TEXT,
		...withRebuilt
	};
	const missing = expected.filter((id) => presentNow === void 0 || !presentNow.has(id));
	if (missing.length === 0) return {
		text: "",
		injected: [],
		expected,
		project: projectId,
		...NO_TEXT,
		...withRebuilt
	};
	const partial = await buildHotInjection(sessionId, projectId, {
		only: new Set(missing),
		supplement: true,
		...score !== void 0 ? { score } : {}
	});
	return {
		text: [partial.bodyText, partial.metaText].filter((t) => t !== void 0 && t !== "").join("\n\n"),
		injected: missing,
		expected,
		project: projectId,
		bodyText: partial.bodyText ?? "",
		metaText: partial.metaText ?? "",
		...withRebuilt
	};
}
/**
* ⭐ 判定一个会话当前该用哪个项目（**把各级判定按优先级合成一个结果**）。
*
* 优先级（方案 §7.2）：
* 1. **手动绑定**（`source: 'manual'`）—— **最高**，否则用户的设置会被自动结果悄悄改掉；
* 2. **① `doc-reads` 与 `get-handoff` 痕迹**（默认启用，零成本）——
*    🔴 **两者强度等同、取较新的那个**（用户 2026-09-22 裁定）：
*    · `doc-reads` = 模型真读了项目文档；
*    · `get-handoff` = 人执行了 `/memj-get-handoff-project <项目>`（⭐ **从会话日志里读**）。
*    ⚠️ **不是"get-handoff 无条件优先"**——否则先取 A 的交接、后又读了 B 的文档，会判成 A。
*    ⚠️ **两者都只在 `detectDocReads` 开关打开时才查**（用户裁定）。
* 3. **② 后台 LLM 判定**（开关，二期）—— 其结果也写在同一个绑定里（`source: 'llm'`）。
*
* ────────────────────────────────────────────────────────────────────────────
* 🔴🔴 **2026-09-23 修（用户报的 bug）：开关只管"要不要【重新】判定"，
*    **绝不废除"已经判定出来的"绑定**。**
*
* **用户实测报告**（原话）：*"我在会话实时状态那一页。关闭程序化判断开关的时候，
*   热知识注入情况的列表就只显示画像和全局知识了。咋回事？是说关闭开关的时候，
*   就失去项目判定了？"*
*
* ⭐ **用户猜得对，而且根因就是本函数**：旧实现里**只有 `manual` 的绑定会被直接采纳**，
*    其余一律走"重新判定"，而重新判定的**前提是开关开着**
*    ⇒ **开关一关，`sessions.json` 里那条已存在的 `doc-reads` 绑定就被无视了**
*    （⚠️ 注意：**它没被删**，只是不被读）⇒ 返回 `未知`
*    ⇒ `collectHotItems('未知')` 只收全局 + 画像 ⇒ **项目/主题知识全消失**。
*
* 🔴 **两件事被混进了一个条件**（这才是 bug 的本质）：
*    · **"要不要继续判定"** ← 这才是开关该管的；
*    · **"已判定的算不算数"** ← **与开关无关**（判定结果一旦落盘就是事实）。
* ⇒ ⭐ **判据**：**开关控制"动作"，不控制"既成事实"**。
*
* ⭐ **修法**：开关**关着**时，把 `sessions.json` 里**已有的绑定**当作结果返回
*    （**不再跑任何判定** ⇒ 不读会话日志、零成本 —— 这正是用户关掉它的本意）。
* ⚠️ `llm` 来源**同等对待**（用户裁定：*"llm 来源的绑定也保留"*）——
*    它与 `manual` 一样是**已经落盘的结果**。
* ⚠️ 仍然**必须过 `known` 校验**（项目已删/已归档时不算数 —— 不注入一个不存在的项目）。
*
* @param ctx - 插件上下文（`get-handoff` 那条判据要读会话日志）。
* @param sessionId - 会话 id。
* @returns 项目 id（判不出 = `未知`）+ 来源。
*/
async function resolveProject(ctx, sessionId) {
	const file = await loadSessionsFile();
	const bound = file.sessions[sessionId];
	if (bound !== void 0 && bound.source === "manual" && bound.project !== "") return {
		project: bound.project,
		source: "manual",
		at: bound.boundAt
	};
	const known = (await scanLibrary()).projects.map((p) => p.id);
	if (file.detectDocReads) {
		const [byReads, byLog] = await Promise.all([detectProjectByDocReads(sessionId, known), detectProjectBySessionLog(ctx, sessionId, known)]);
		if (byLog.project !== "未知" && byLog.source === "handoff") return {
			project: byLog.project,
			source: "handoff",
			at: byLog.at
		};
		const candidates = [byReads, byLog].filter((c) => c.project !== HOT_PROJECT_UNKNOWN);
		if (candidates.length > 0) {
			const best = candidates.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
			if (best !== void 0) return {
				project: best.project,
				source: best === byLog ? "get-handoff" : "doc-reads",
				at: best.at
			};
		}
	}
	if (bound !== void 0 && bound.project !== "" && known.includes(bound.project)) return {
		project: bound.project,
		source: bound.source,
		at: bound.boundAt
	};
	const parentId = await parentSessionIdOf(ctx, sessionId);
	if (parentId !== "" && !isPluginSpawned(sessionId)) {
		const pbound = file.sessions[parentId];
		if (pbound !== void 0 && pbound.project !== "" && known.includes(pbound.project)) return {
			project: pbound.project,
			source: "inherited",
			at: pbound.boundAt
		};
	}
	return {
		project: HOT_PROJECT_UNKNOWN,
		source: "",
		at: ""
	};
}
/**
* ⭐⭐ **读出这个会话的父会话 id**（子代理继承用）。
*
* ⚠️ 会话头的形状是**实测**出来的（`session.v3.jsonl.zstd` 的首个事件）：
*    ```json
*    { "type": "session", "version": 3, "id": "session-<uuid>",
*      "parentSession": "session-<父>",   ← 只有子会话才有这个字段
*      "origin": "subagent", "delegationDepth": 1 }
*    ```
*    ⇒ 顶层会话**没有** `parentSession` 字段。
*
* 🔴🔴 **`parentSession` 在【header】上，不在【events】里**（2026-09-29 实测纠正）——
*    我第一版读的是 `events[].type === 'session'`，**永远匹配不到** ⇒
*    继承在生产上**静默失效**（单元测试因为自己造的假 events 里有那一条，反而全绿）。
*    ⭐ `sessionQuery` 的观察结果**把两者分开返回**：
*    `readSession()` 回 `{ session: <header>, events: <对话事件> }`；
*    `observeSession()` 回 `{ header: <会话头>, events: snapshotEvents() }`。
*    ⚠️ 而 `events` 是 `session.snapshotEvents()` —— **只含对话/工具事件，
*       不含会话头那一条**（实测 `dsh-session-query/lib/index.js:275-276`）。
*    ⇒ **必须读 `header.parentSession`**，两个 API 都要兼容
*      （`observeSession` 用 `header`、`readSession` 用 `session`）。
*
* 🔴 **不靠 `origin`/`delegationDepth` 判断"是不是子代理"** ——
*    它们**区分不出发起方**（LLM 发起的与插件发起的逐字段相同，实测）。
*    这里只回答"**父会话是谁**"，"该不该继承"由调用方按 `isPluginSpawned` 决定。
*
* 🔴🔴 **必须优先用 `observeSession`，不能只用 `readSession`** ——
*    `readSession()` 对**任何长过东西的 fork 会话**必然抛
*    `seeded session constructor seed must equal its inherited prefix`
*    （它走 `Session.create` 的 snapshot 模式，撞上 rc.2 构造器的 isSeeded 不变量）。
*    ⚠️ 虽然子代理本身 `isSeeded: false`、暂时不会中招，但**这条判据不该赌**
*    （同一个坑本项目已沉淀成知识条目）⇒ 照 `detectProjectBySessionLog` 的既有做法：
*    **先 `observeSession`，失败才落 `readSession` 兜底**。
* @param ctx - 插件上下文。
* @param sessionId - 会话 id。
* @returns 父会话 id；顶层会话或读不到时为空串。
*/
async function parentSessionIdOf(ctx, sessionId) {
	try {
		const q = ctx.get("sessionQuery");
		if (q === void 0) return "";
		/** 从观察结果里抠出会话头（两个 API 的字段名不同）。 */
		const headerOf = (r) => {
			if (r === null || typeof r !== "object") return void 0;
			const o = r;
			const h = o.header ?? o.session;
			return h !== null && typeof h === "object" ? h : void 0;
		};
		let obs;
		if (typeof q.observeSession === "function") try {
			obs = await q.observeSession(sessionId, { projectionMode: "none" });
		} catch {
			obs = void 0;
		} finally {
			try {
				obs?.[Symbol.dispose]?.();
			} catch {}
		}
		let header = headerOf(obs);
		if (header === void 0 && typeof q.readSession === "function") header = headerOf(await q.readSession(sessionId));
		if (header === void 0) return "";
		const p = header.parentSession;
		return typeof p === "string" ? p.trim() : "";
	} catch {
		return "";
	}
}
/**
* ⭐ 取"本会话正在用的模型的上下文窗口"（tokens）。
*
* 🔴 **为什么要绕这一下**：`GenerateOptions`（出网请求）**不含** `contextWindow`
* —— 已核实它只在 `LlmModelContext` 上。⇒ 只能用 `provider`/`model`
* 去 `ctx.llm.resolveModelInfo()` 换一次。
*
* ⚠️ **三重容错**（任一失败都返回 `undefined`，**绝不抛**）：
* ① `ctx.llm` 取不到（服务没挂）；② provider/model 缺失；
* ③ `resolveModelInfo` 抛错（适配器不认识这个模型）。
* ⭐ 且**已有值就不再查**（同一会话的模型极少变）——省掉每次出网的额外开销。
*
* ⭐⭐ **已导出**（2026-09-26）：主动注入的 chat 通路要按"窗口的 60%"定预算，
*    用的**必须是同一个窗口值** ⇒ 两处各写一份必然会漂移（本项目"同一判据只有一份实现"）。
* @param ctx - 插件上下文。
* @param options - 本次出网请求。
* @param cached - 已有值。
* @returns 窗口大小；拿不到时 `undefined`。
*/
async function resolveContextWindow(ctx, options, cached) {
	if (typeof cached === "number" && cached > 0) return cached;
	try {
		const provider = typeof options?.provider === "string" ? options.provider : "";
		const model = typeof options?.model === "string" ? options.model : "";
		if (provider === "" || model === "") return void 0;
		const llm = ctx.get("llm");
		if (llm?.resolveModelInfo === void 0) return void 0;
		const w = (await llm.resolveModelInfo(provider, model))?.context?.contextWindow;
		return typeof w === "number" && w > 0 ? w : void 0;
	} catch {
		return;
	}
}
/**
* ⭐⭐⭐ **当内存快照缺失时，从会话日志重建它**（2026-09-23 用户要求）。
*
* ── 为什么需要它 ────────────────────────────────────────────────────────────
* `hotState.windows` 是**纯内存**的（"进程重启即失"）⇒ 重启后为空
* ⇒ `/hot` 回 `window: null` ⇒ 页面把**每一条**都显示成"未注入"。
* 🔴 **而那是假话**：注入内容**持久化在会话日志里**（`user/message` + `source.kind='plugin'`）
* ⇒ 实测本会话最近一次注入文本里含 **14 个封面 id** ⇒ **判得出来**。
* 用户原话：*"只要重新启动之后，已注入的内容就会显示未注入，那这是不对的哇？
* 在每次重启之后，到会话时，或许应该去取 session 看一下？"*
*
* ── ⭐ 复用既有的读 session 能力（**不另起一套**，用户明确要求）──────────────
* 走的是与 `detectProjectBySessionLog` **同一条通道**：
* `ctx.get('sessionQuery')` ⇒ `observeSession(id, {projectionMode:'none'})` ⇒
* 拿不到时回落 `readSession(id)` ⇒ 都拿不到就当"读不到"（**不抛**）。
* ⭐ 判据也复用：`fingerprintsFromInjectionEvents` 与 `idsInWindow` **同一判据**
* （注入文本里本来就带完整封面 id）⇒ 重建的结论与平时的对得上。
*
* ── ⚠️ 什么时候调（性能）────────────────────────────────────────────────────
* 会话日志**不小**（实测本会话 2.2MB 压缩 / 解压后 6.5MB、1693 个事件）
* ⇒ 🔴 **只在人打开实时状态页时调一次**（`/hot`），**不进 `pre-step` 热路径**。
* ⇒ 用户裁定："只在人打开实时状态页时读一次"。
*
* ⚠️ **重建失败绝不影响主流程**（读不到日志 ⇒ 返回 `undefined`，页面照旧显示"未注入"）。
* @param ctx - 插件上下文（要能取到 `sessionQuery`）。
* @param sessionId - 会话 id。
* @param fps - 本次应注入的全部指纹（封面 id + 画像指纹）。
* @returns 重建的窗口快照；读不到日志 / 没有注入事件时 `undefined`。
*/
async function rebuildWindowFromSessionLog(ctx, sessionId, fps) {
	if (sessionId === "" || fps.length === 0) return void 0;
	try {
		const q = ctx.get("sessionQuery");
		if (q === void 0) return void 0;
		let events;
		if (typeof q.observeSession === "function") {
			let obs;
			try {
				obs = await q.observeSession(sessionId, { projectionMode: "none" });
				const ev = obs?.events;
				if (Array.isArray(ev)) events = ev;
			} catch {} finally {
				try {
					obs?.[Symbol.dispose]?.();
				} catch {}
			}
		}
		if (events === void 0 && typeof q.readSession === "function") {
			const ev = (await q.readSession(sessionId))?.events;
			if (Array.isArray(ev)) events = ev;
		}
		if (events === void 0) return void 0;
		const { present, at } = fingerprintsFromInjectionEvents(events, fps);
		if (present.size === 0) return void 0;
		return {
			present,
			at,
			sessionId
		};
	} catch {
		return;
	}
}
/**
* 供 `api.ts` 读取"某会话当前应注入的条目"（实时状态页用；**只读，不注入**）。
*
* ⭐⭐ **2026-09-22 改：返回结构化条目而不是一串 id**（用户报告）。
* 原来只回 `expected: string[]`（封面 id）⇒ 页面列表里是**一串裸 UUID**：
* 没标题、看不出类型与形态，而且**画像没有 id** ⇒ 列表里根本没有它的位置。
* ⇒ 现在回 `items: HotPreviewItem[]`（标题 / 类型 / 形态 / 指纹），
* 页面再叠加"窗口里还在不在"（`present`）就是完整的三列。
*
* @param ctx - 插件上下文。
* @param sessionId - 会话 id。
* @param score - ⭐ 评分模式（决策 177）：`on` ⇒ 项目/主题层换成"有效分前 N 名"。
*   🔴🔴 **这是 2026-09-29 修的一个真 bug**：本函数（页面列表的唯一来源）原来
*   **没传 `score`** ⇒ 它按**原清单**渲染，而 `pre-step` 按**评分榜**注入
*   ⇒ ⭐ **界面显示的与实际注入的是两个集合**（用户看到的症状就是
*   *"已经有不少加过分的知识，但没真的加到项目热知识列表"*）。
*   ⚠️ 根因是我当初只给"注入侧"传了参数、**漏了"显示侧"** ——
*   而两个消费者都必须拿**同一份**收集结果。
* @returns 判定结果 + **本次应注入的条目** + 预算口径 + 窗口快照。
*/
async function previewForSession(ctx, sessionId, score) {
	const r = await resolveProject(ctx, sessionId);
	const built = await buildHotInjection(sessionId, r.project, score !== void 0 ? { score } : {});
	/** ⚠️ **判定指纹**（封面 id + 画像指纹）——页面用它跟窗口快照求交集。 */
	const expected = built.preview.map((p) => p.fp).filter((fp) => fp !== "");
	const mem = hotState.windows.get(sessionId);
	if (mem !== void 0) return {
		project: r.project,
		source: r.source,
		expected,
		items: built.preview,
		chars: built.text.length,
		window: mem,
		windowFromLog: false
	};
	const rebuilt = await rebuildWindowFromSessionLog(ctx, sessionId, expected);
	return {
		project: r.project,
		source: r.source,
		expected,
		items: built.preview,
		chars: built.text.length,
		window: rebuilt,
		windowFromLog: rebuilt !== void 0
	};
}
/** ⚠️ 仅供测试：清空内存态（**不改磁盘**）。 */
function resetHotState() {
	hotState.windows.clear();
	hotState.lastInject.clear();
	hotState.warnedNoProject.clear();
}
/**
* ⭐⭐ **挂上热知识的两个钩子**（热知识方案 §6.2）。
*
* 🔴 **两个钩子必须一起挂**（缺一不可）：
* - 只挂 `pre-step` ⇒ 没有窗口快照 ⇒ **每次都全量重注入**（把上下文撑爆）；
* - 只挂 `llm/stream` ⇒ 只观测不注入 ⇒ 功能不生效。
*
* ⚠️ **总开关关着时不挂任何钩子**（`config.hotInject === false` 直接返回）
* ⇒ 关掉时**零开销**，也不在别人的事件链上占位。
*
* 🔴 **失败绝不影响主流程**：两条链路各自 `try/catch` 到底
* （本项目一贯：钩子里的异常会毁掉整个轮次）。
* @param opts - `ctx` 与配置。
*/
function registerHotInjection(opts) {
	const { ctx, config } = opts;
	if (!config.hotInject) return;
	/**
	* ⭐⭐⭐ **把配置映射成"评分读取选项"**（决策 177/182）——**唯一的一份**。
	*
	* 🔴 **为什么必须有这个函数**（这是决策 181 那次事故的根治）：
	*    那个参数要在**四个调用点**都传（`decideInjection` / `previewForSession` /
	*    `llm/stream` / 补注）—— ⚠️ 我上次**只传了一处**，造出"页面显示与实际注入
	*    是两个集合"。⇒ ⭐ 抽成**一个函数**，调用点只写 `scoreOptsOf(config)`，
	*    **字段增减只改这一处**（结构上不可能再漏）。
	*/
	const scoreOptsOf = (c) => ({
		on: c.hotScoreOnTurnEnd,
		windowHours: c.hotScoreWindowHours,
		topN: c.hotScoreTopN,
		gate: true,
		gateMinScore: c.hotScoreGateMinScore,
		gateLastTurn: c.hotScoreGateLastTurn
	});
	const log = (m) => {
		try {
			ctx.logger?.info?.(`[dsh-memj/hot] ${m}`);
		} catch {}
	};
	ctx.on("llm/stream", async function* (options, next) {
		try {
			const sid = typeof options?.sessionId === "string" ? options.sessionId : "";
			if (sid !== "" && options?.purpose === void 0) {
				const ids = (await buildHotInjection(sid, (await resolveProject(ctx, sid)).project, { score: scoreOptsOf(config) })).preview.map((p) => p.fp).filter((fp) => fp !== "");
				const present = idsInWindow(options.messages, ids);
				const prev = hotState.windows.get(sid);
				const contextWindow = await resolveContextWindow(ctx, options, prev?.contextWindow);
				hotState.windows.set(sid, {
					present,
					at: (/* @__PURE__ */ new Date()).toISOString(),
					sessionId: sid,
					...contextWindow !== void 0 ? { contextWindow } : {}
				});
			}
		} catch (err) {
			try {
				ctx.logger?.warn?.(`[dsh-memj/hot] 窗口快照失败：${String(err)}`);
			} catch {}
		}
		yield* next();
	});
	ctx.on("agent/pre-step", async (payload, next) => {
		const decision = await next();
		try {
			if (decision === void 0 || decision.kind !== "enter") return decision;
			const messages = decision.messages;
			if (!Array.isArray(messages)) return decision;
			const sid = typeof payload?.agent?.id === "string" ? payload.agent.id : "";
			if (sid === "") return decision;
			const r = await resolveProject(ctx, sid);
			const window = hotState.windows.get(sid);
			const plan = await decideInjection(sid, r.project, window?.present, ctx, scoreOptsOf(config));
			if (plan.rebuilt !== void 0) {
				hotState.windows.set(sid, plan.rebuilt);
				log(`会话 ${sid} 内存快照为空 ⇒ 已从会话日志重建（${plan.rebuilt.present.size} 条）`);
			}
			touchSession(sid, (/* @__PURE__ */ new Date()).toISOString()).catch(() => {});
			if (r.project !== "未知" && r.source === "doc-reads") {
				const file = await loadSessionsFile();
				const cur = file.sessions[sid];
				if (cur === void 0 || cur.source !== "manual") {
					file.sessions[sid] = {
						project: r.project,
						source: "doc-reads",
						boundAt: cur?.boundAt !== void 0 && cur.boundAt !== "" ? cur.boundAt : (/* @__PURE__ */ new Date()).toISOString(),
						lastActiveAt: (/* @__PURE__ */ new Date()).toISOString()
					};
					await saveSessionsFile(file);
				}
			}
			if (r.project === "未知" && !hotState.warnedNoProject.has(sid)) {
				hotState.warnedNoProject.add(sid);
				log(`会话 ${sid} 未能判定项目 ⇒ 本次只注入全局 + 画像`);
			}
			hotState.lastInject.set(sid, {
				at: (/* @__PURE__ */ new Date()).toISOString(),
				injected: plan.injected,
				expected: plan.expected,
				chars: plan.text.length,
				project: plan.project
			});
			if (plan.text === "") return decision;
			const push = (text) => {
				messages.push({
					id: `memj-hot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
					role: "user",
					content: [{
						type: "text",
						text
					}],
					source: {
						kind: "plugin:dsh-memj",
						form: "instructions"
					}
				});
			};
			if (plan.bodyText !== "") push(plan.bodyText);
			if (plan.metaText !== "") push(plan.metaText);
			log(`已补注 ${plan.injected.length}/${plan.expected.length} 条（正文段 ${plan.bodyText.length} + meta 段 ${plan.metaText.length} 字符）`);
		} catch (err) {
			try {
				ctx.logger?.warn?.(`[dsh-memj/hot] 注入失败：${String(err)}`);
			} catch {}
		}
		return decision;
	});
}
//#endregion
//#region src/tag-auto.ts
/**
* ⭐⭐⭐ **起一个子代理去跑 `memj_normalize_tags`**（fire-and-forget）。
*
* 🔴 三条纪律（见模块头）：**不 await result** / **显式给 agentOptions** /
*    **失败只记日志**。
* @param ctx - 插件上下文。
* @param config - 配置（取裁决模型）。
* @param parent - 当前会话的活 agent（子代理的 parent）。
* @returns 子会话 id；没发起时 `undefined`。
*/
async function startNormalizeSubagent(ctx, config, parent) {
	try {
		const subagents = ctx.get("subagents");
		if (subagents?.start === void 0) return void 0;
		const route = config.tagNormalizeProvider !== "" && config.tagNormalizeModel !== "" ? {
			provider: config.tagNormalizeProvider,
			model: config.tagNormalizeModel
		} : void 0;
		const ctrl = new AbortController();
		const run = await subagents.start("spawn", {
			label: "memj：规范化标签",
			prompt: [{
				type: "text",
				text: "调用 memj_normalize_tags 工具（参数：includeBody 用默认值即可），然后把工具回执**原样**返回给我。只做这一件事，不要做别的操作。"
			}],
			...parent !== void 0 ? { parent } : {},
			signal: ctrl.signal,
			...route !== void 0 ? { agentOptions: route } : {}
		});
		run.result.catch(() => {});
		markPluginSpawned(String(run.id));
		return String(run.id);
	} catch (err) {
		try {
			console.log(`[dsh-memj/tag-auto] 起子代理失败：${String(err)}`);
		} catch {}
		return;
	}
}
/**
* ⭐⭐⭐ **挂上"轮次结束自动规范化"的钩子**（决策 165）。
*
* ⚠️ **形态照 `registerHotInjection`**：直接 `ctx.on(...)`、不套 `ctx.effect`
*    —— **与既有实现保持一致**（本项目铁律：引入新写法前先看同载体里有没有人这么写）。
*
* 🔴 **开关关着 ⇒ 一个监听器都不挂**（返回 `false`，让调用方能如实记诊断行）。
*    ⭐ 这与"挂上去再在回调里判 false"不同：后者**仍在事件链上占位**，
*    而且诊断行会变成**假绿**（"已注册"而实际不工作）。
* @param opts - `ctx` 与配置。
* @returns 是否真的挂上了。
*/
function registerTagAutoNormalize(opts) {
	const { ctx, config } = opts;
	if (!config.tagNormalizeOnHandoff) return false;
	const log = (m) => {
		try {
			console.log(`[dsh-memj/tag-auto] ${m}`);
		} catch {}
	};
	ctx.on("agent/turn-stopping", async (payload) => {
		try {
			const r = await maybeAutoNormalize(ctx, config, payload);
			log(r.started ? `started: ${r.reason}` : `skipped: ${r.reason}`);
		} catch (err) {
			log(`THREW: ${String(err)}`);
		}
	});
	return true;
}
/**
* ⭐⭐⭐ **轮次结束时的入口**（`agent/turn-stopping` 钩子调它）。
*
* ⚠️ **它不该被 await 很久** —— 读一个几十字节的记账文件（本地、极快），
*    起子代理那步是 fire-and-forget。
*
* 🔴 **判据（决策 167，第二次修正 165）**：只看记账里的 **`pending`** ——
*    "**有一次落知识还没被规范化**"。⚠️ 语义正好是
*    "**落知识那一轮的轮次结束时，起一次**"。
*    ⭐ **不比对轮次号**：编号从两处来（`turnOf()` 投影 vs `payload.turn`），
*    而 `turnOf()` 拿不到时回 `-1` ⇒ 会**静默永不触发**（比重复触发更隐蔽）。
* @param ctx - 插件上下文。
* @param config - 配置。
* @param payload - 钩子载荷（`agent`；`turn` 只作诊断）。
* @returns 结论（供日志与测试）。
*/
async function maybeAutoNormalize(ctx, config, payload) {
	const enabled = config.tagNormalizeOnHandoff;
	const sessionId = typeof payload?.agent?.id === "string" ? payload.agent.id : "";
	try {
		const st = await loadTagAutoState();
		const prefixed = `session-${sessionId}`;
		const key = st.sessions[sessionId] !== void 0 ? sessionId : prefixed;
		const rec = st.sessions[key];
		const d = decideTagAuto({
			enabled,
			record: rec
		});
		if (!d.start) return {
			started: false,
			reason: d.reason
		};
		const childId = await startNormalizeSubagent(ctx, config, payload.agent);
		if (childId === void 0) return {
			started: false,
			reason: "起子代理失败（见日志）"
		};
		await saveTagAutoState(markNormalized(st, key));
		return {
			started: true,
			reason: `已起子代理 ${childId}`,
			childId
		};
	} catch (err) {
		try {
			console.log(`[dsh-memj/tag-auto] 失败：${String(err)}`);
		} catch {}
		return {
			started: false,
			reason: `异常：${String(err)}`
		};
	}
}
//#endregion
//#region src/score-auto.ts
/**
* ⭐⭐⭐ **四道门**（纯函数 ⇒ 可单测）。
*
* 🔴🔴 **第②道（不是子代理）是**防递归**的唯一防线** ——
*    评分子代理自己也会跑完一轮 ⇒ 它结束时也会触发本钩子
*    ⇒ 不去掉它就**无限起子代理**（每层再套一层）。
*    ⭐ 判据取自 **`delegationDepth > 0`**（会话头字段，实测可用），
*       ⚠️ 而**不是** `origin === 'subagent'` —— 后者对"主会话 LLM 起的子代理"
*       与"插件起的子代理"**都成立**（实测四字段全同，见 `subagent-origin.ts`），
*       而两者**都该被挡住**（它们的轮次不需要复盘）。
*
* ⚠️ **第③道（该轮有内容）不检查"有没有思考"** ——
*    库内知识 `6ada1f56` 刚记下「触发条件不要依赖模型的可选行为」：
*    若要求"该轮有 reasoning"，则**不输出思考的模型会让本功能一次都不触发**。
*    ⇒ ⭐ 判据是"该轮有 `text` 输出"（输出是必然的）。
* @param opts - 开关 / 会话深度 / 项目 / 是否有内容。
* @returns 该不该起 + 可判定的理由。
*/
function decideAutoScore(opts) {
	if (!opts.enabled) return {
		start: false,
		reason: "开关关闭（hotScoreOnTurnEnd=false）"
	};
	if (opts.delegationDepth > 0) return {
		start: false,
		reason: `本会话是子代理（delegationDepth=${opts.delegationDepth}）⇒ 不复盘子代理自己的轮次`
	};
	if (opts.project === "") return {
		start: false,
		reason: "判不出项目（分数是按项目存的）"
	};
	if (!opts.hasContent) return {
		start: false,
		reason: "该轮没有可评分的内容"
	};
	return {
		start: true,
		reason: `项目=${opts.project}`
	};
}
/**
* ⭐⭐⭐ **起一个子代理去跑 `memj_score_turn`**（fire-and-forget）。
*
* ⚠️ **prompt 里要带 `session` 与 `turn`** —— 子代理的 `exec.agent` 是**它自己**，
*    不带参数的话工具会去评**子代理自己的那一轮**（那是错的）。
* ⭐ 措辞**极简且单一任务**（甲方案：判断在工具内部做，子代理只做"调用 + 转达"）。
* @param ctx - 插件上下文。
* @param config - 配置（取评分模型）。
* @param parent - 当前会话的活 agent。
* @param sessionId - **被复盘的**会话 id。
* @param turn - 被复盘的那一轮。
* @returns 子会话 id；没发起时 `undefined`。
*/
async function startScoreSubagent(ctx, config, parent, sessionId, turn) {
	try {
		const subagents = ctx.get("subagents");
		if (subagents?.start === void 0) return void 0;
		const route = config.hotScoreSubagentProvider !== "" && config.hotScoreSubagentModel !== "" ? {
			provider: config.hotScoreSubagentProvider,
			model: config.hotScoreSubagentModel
		} : void 0;
		const ctrl = new AbortController();
		const run = await subagents.start("spawn", {
			label: `memj：复盘第 ${turn} 轮`,
			prompt: [{
				type: "text",
				text: `调用 memj_score_turn 工具（参数：session 用「${sessionId}」，turn 用 ${turn}），然后把工具回执**原样**返回给我。只做这一件事，不要做别的操作。`
			}],
			...parent !== void 0 ? { parent } : {},
			signal: ctrl.signal,
			...route !== void 0 ? { agentOptions: route } : {}
		});
		run.result.catch(() => {});
		markPluginSpawned(String(run.id));
		return String(run.id);
	} catch (err) {
		try {
			console.log(`[dsh-memj/score-auto] 起子代理失败：${String(err)}`);
		} catch {}
		return;
	}
}
/**
* ⭐⭐⭐ **挂上"轮末自动评分"的钩子**。
*
* 🔴 **开关关着 ⇒ 一个监听器都不挂**（照 `registerTagAutoNormalize`）——
*    "挂上去再判 false"会**仍在事件链上占位**，且诊断行变成**假绿**。
* @param opts - `ctx` 与配置。
* @returns 是否真的挂上了。
*/
function registerAutoScore(opts) {
	const { ctx, config } = opts;
	if (!config.hotScoreOnTurnEnd) return false;
	const log = (m) => {
		try {
			console.log(`[dsh-memj/score-auto] ${m}`);
		} catch {}
	};
	ctx.on("agent/turn-stopping", async (payload) => {
		try {
			const r = await maybeAutoScore(ctx, config, payload);
			log(r.started ? `started: ${r.reason}` : `skipped: ${r.reason}`);
		} catch (err) {
			log(`THREW: ${String(err)}`);
		}
	});
	return true;
}
/**
* ⭐⭐ **轮末入口**（钩子调它；也可被测试直接调）。
*
* ⚠️ **它必须"短"** —— `turn-stopping` 是 serial 钩子。
*    这里只做：读会话头（拿 depth，一次 I/O）+ 判项目（可能读日志）+ **发起**。
*    ⚠️ 判项目（`resolveProject`）确实可能读会话日志（重）——
*    但那**只在"开关开着"时才发生**，且它是**判据的必要输入**
*    （分数按项目存，判不出就没法评）。⭐ 这也是为什么**默认关**是合理的默认值。
* @param ctx - 插件上下文。
* @param config - 配置。
* @param payload - 钩子载荷。
* @returns 结论（供日志与测试）。
*/
async function maybeAutoScore(ctx, config, payload) {
	const sessionId = typeof payload?.agent?.id === "string" ? payload.agent.id : "";
	const turnRaw = payload?.turn;
	const turn = typeof turnRaw === "number" ? turnRaw : -1;
	if (sessionId === "") return {
		started: false,
		reason: "拿不到会话 id"
	};
	if (turn < 0) return {
		started: false,
		reason: "拿不到轮次号"
	};
	try {
		const depth = await delegationDepthOf$1(ctx, sessionId);
		if (depth > 0) return {
			started: false,
			reason: `本会话是子代理（delegationDepth=${depth}）⇒ 不复盘`
		};
		const r = await resolveProject(ctx, sessionId);
		const hasContent = await turnHasOutput(ctx, sessionId, turn);
		const d = decideAutoScore({
			enabled: config.hotScoreOnTurnEnd,
			delegationDepth: depth,
			project: r.project,
			hasContent
		});
		if (!d.start) return {
			started: false,
			reason: d.reason
		};
		const childId = await startScoreSubagent(ctx, config, payload.agent, sessionId, turn);
		if (childId === void 0) return {
			started: false,
			reason: "起子代理失败（见日志）"
		};
		return {
			started: true,
			reason: `项目=${r.project}，已起子代理 ${childId}`,
			childId
		};
	} catch (err) {
		try {
			console.log(`[dsh-memj/score-auto] 失败：${String(err)}`);
		} catch {}
		return {
			started: false,
			reason: `异常：${String(err)}`
		};
	}
}
/**
* 读本会话的 `delegationDepth`（会话头字段）。
*
* ⚠️ **读不到时回 `0`** —— 那表示"当作顶层会话处理"。
*    🔴 **这个默认值是"偏向触发"的**，选它是因为：
*    若回一个大数（当作子代理），一旦读取失败 ⇒ **功能永不触发**（更隐蔽）；
*    而回 0 的最坏后果是"一个子代理的轮次被复盘了一次"（无害：它只是多算一次分）。
*    ⭐ 判据：**`0` 的失败模式更轻**（本项目一贯的"失败模式不对称"取舍）。
* @param ctx - 插件上下文。
* @param sessionId - 会话 id。
* @returns `delegationDepth`（读不到时 0）。
*/
async function delegationDepthOf$1(ctx, sessionId) {
	try {
		const q = ctx.get("sessionQuery");
		if (q?.observeSession === void 0) return 0;
		let obs;
		try {
			obs = await q.observeSession(sessionId, { projectionMode: "none" });
			const d = (obs?.header)?.delegationDepth;
			return typeof d === "number" && Number.isFinite(d) ? d : 0;
		} finally {
			try {
				obs?.[Symbol.dispose]?.();
			} catch {}
		}
	} catch {
		return 0;
	}
}
/**
* 该轮有没有 `text` 输出（**判据不依赖思考**，见 `decideAutoScore`）。
*
* ⚠️ 读不到日志时回 `true` —— **偏向触发**：真正的内容长度检查在工具内部
*    （`hotScoreMinChars`），那里有**纯文本**可量；这里只是"值不值得起子代理"的粗筛。
* @param ctx - 插件上下文。
* @param sessionId - 会话 id。
* @param turn - 轮次号。
* @returns 有输出时 `true`。
*/
async function turnHasOutput(ctx, sessionId, turn) {
	try {
		const { readTurnContent } = await Promise.resolve().then(() => score_turn_exports);
		return await readTurnContent(ctx, sessionId, turn) !== "";
	} catch {
		return true;
	}
}
//#endregion
//#region src/context-report.ts
/** 把未知值收成有限正数；否则 `undefined`。 */
function posNum(v) {
	if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return void 0;
	return v;
}
/**
* 读当前会话的上下文占用。
*
* @param ctx - 插件上下文（只要它能 `get`）。
* @param session - 会话对象（`agent/turn-stopping` 载荷里那个 agent 的 session）。
* @returns 占用结果；**任何一环拿不到就返回 `undefined`**（调用方据此静默跳过）。
*/
function readContextUsage(ctx, session) {
	if (session === void 0 || session === null) return void 0;
	let sp;
	try {
		sp = ctx.get("sessionProjections");
	} catch {
		return;
	}
	if (sp === void 0 || sp === null || typeof sp.stateOf !== "function") return void 0;
	let st;
	try {
		st = sp.stateOf(session, "contextPressure");
	} catch {
		return;
	}
	if (st === void 0 || st === null) return void 0;
	const projected = posNum(st.projectedTokens);
	const pressure = posNum(st.pressureTokens);
	const used = projected ?? pressure;
	if (used === void 0) return void 0;
	const win = posNum(st.contextWindow);
	const out = {
		used: Math.round(used),
		source: projected !== void 0 ? "projected" : "pressure"
	};
	if (win !== void 0) {
		out.window = Math.round(win);
		out.percent = Math.round(used / win * 100);
	}
	return out;
}
/**
* ⭐⭐ **同一份占用的第二种入口：补上"窗口从哪来"**。
*
* 🔴 **为什么需要它**（2026-10-12 实测）：`contextPressure` 投影的 `contextWindow`
*    在**本机生产环境恒为 `null`** —— 因为**这个路由没上报窗口**
*    （`/api/hot` 的 `budget.contextWindow` 也是 null、`basis:"fallback"`）。
*    ⇒ 只走投影那一路的话，`percent` 永远算不出来、功能**永久静默失效**。
*
* ⭐ **正规来源**（`token-meter` 的 README 原话）：
*    *"模型容量属于拥有精确提供方／模型路由的适配器，可通过
*      `ctx.llm.resolveModelInfo().context` 获取"*。
*    本项目**早有实现**：`hot-watch.ts` 的 `resolveContextWindow()`（主动注入的 chat 通路
*    算"窗口 60% 预算"就用它）⇒ 这里**复用同一条查询**（不另写一份）。
*
* @param ctx - 插件上下文。
* @param session - 会话对象。
* @param provider - 路由提供方（来自 `agent.options.provider`）。
* @param model - 模型名（来自 `agent.options.model`）。
* @returns 占用结果；投影不可用时返回 `undefined`。
*/
async function readContextUsageWithWindow(ctx, session, provider, model) {
	const base = readContextUsage(ctx, session);
	if (base === void 0) return base;
	if (base.window !== void 0) return base;
	if (provider === "" || model === "") return base;
	try {
		const llm = ctx.get("llm");
		if (llm?.resolveModelInfo === void 0) return base;
		const w = posNum((await llm.resolveModelInfo(provider, model))?.context?.contextWindow);
		if (w === void 0) return base;
		return {
			...base,
			window: Math.round(w),
			percent: Math.round(base.used / w * 100)
		};
	} catch {
		return base;
	}
}
/**
* 把占用结果渲染成**给模型看的一段文本**。
*
* 🔴🔴 **最后那句是灵魂**，别删：它让「要不要动作」**留在用户的提示词里**，
*    插件**只提供事实、不规定任何阈值动作**。三件事缺一不可：
*    ① 明确授权（"若提示词有规定，照做"）；② 明确免责（"否则忽略"）；
*    ③ ⛔ **插件自己绝不写"超过 X% 就做 Y"** —— 那会把用户的自由度收走。
*
* ⚠️ **数字不进常驻文本**：本段文本只在**每轮末注入一次**，
*    所以它带运行时数字是安全的；但**绝不能搬进 `context()`**（那会每轮重发、破前缀缓存）。
*
* @param u - `readContextUsage()` 的结果。
* @returns 注入用的 markdown 片段。
*/
function renderContextUsage(u) {
	const used = u.used.toLocaleString("en-US");
	return [
		"## 上下文占用",
		(u.window !== void 0 && u.percent !== void 0 ? `窗口 ${u.window.toLocaleString("en-US")} · 当前约 ${used}（${u.percent}%）` : `当前约 ${used}（本路由未上报窗口大小，只有占用绝对值）`) + "。",
		"若你的提示词中规定了依据上下文占用率执行的动作，现在可以判断是否执行；否则忽略本条。"
	].join("\n");
}
//#endregion
//#region src/context-auto.ts
/** 注入消息的分节名（溯源用；照 `commands.ts` 的 `submitContext`）。 */
const SECTION_NAME = "上下文占用";
/**
* ⭐⭐⭐ **挂上"轮末报上下文占用"的钩子**。
*
* @param opts - `ctx` 与配置。
* @returns 是否真的挂上了（供启动诊断区分 `registered` / `skipped(disabled)`）。
*/
function registerContextReport(opts) {
	const { ctx, config } = opts;
	if (!config.contextReportOnTurnEnd) return false;
	const log = (m) => {
		try {
			console.log(`[dsh-memj/context-auto] ${m}`);
		} catch {}
	};
	ctx.on("agent/turn-stopping", async (payload) => {
		try {
			const r = await reportContextUsage(ctx, config, payload?.agent, log);
			if (!r.injected) log(`skipped: ${r.reason}`);
		} catch (err) {
			log(`THREW: ${String(err)}`);
		}
	});
	return true;
}
/**
* ⭐⭐⭐ **读本会话的 `delegationDepth`**（`> 0` = 它自己是子代理）。
*
* ── 为什么这条如此重要 ──────────────────────────────────────────────────────
* 用户那条演示规则是「占用 ≥60% ⇒ fork 子代理去 handoff」，而 `subagent_fork`
* **继承本会话上下文** ⇒ 子代理一出生就带着同样高的占用 ⇒ 它也会收到注入
* ⇒ 再 fork ⇒ **递归**。⚠️ 不报错，只是子会话越滚越多。
* ⇒ **本函数就是那道"防递归的唯一防线"**（与 `score-auto` 的第②道门同一判据）。
*
* ── 怎么读（比 `score-auto` 更省）────────────────────────────────────────────
* ⭐ `delegationDepth` 就在 **`session.header`** 上（`SessionHeader.delegationDepth`，
*    读 `@deepseek-ai/dsh-session` 的 `types.d.ts` 确认："absent (zero) for a
*    top-level session, parent depth + 1 for a subagent child"）
*    ⇒ **同步可读**，不必像 `score-auto` 那样走 `sessionQuery.observeSession()` 那趟 I/O。
*    ⚠️ 这对 `agent/turn-stopping`（`@mode serial`，会被 await）尤其要紧。
*
* ⚠️ **读不到时回 `0`（= 当作顶层会话）** —— 与 `score-auto` 的取舍一致：
*    回 0 的最坏后果是"子代理多报了一次占用"（无害）；
*    回大数则一旦读取失败就**永久不报**（更隐蔽）。
*
* @param session - `agent.session`。
* @returns `delegationDepth`；读不到时 `0`。
*/
function delegationDepthOf(session) {
	try {
		const d = (session?.header)?.delegationDepth;
		return typeof d === "number" && Number.isFinite(d) ? d : 0;
	} catch {
		return 0;
	}
}
/**
* ⭐⭐ **轮末入口**（钩子调它；也可被测试直接调）。
*
* 🔴 顺序刻意如此：**开关 → agent 形状 → 读占用（廉价、纯回放）→ 阈值 → 才注入**。
*    每一步都是"可判定地早退 + 给出原因"，便于在日志里分清是哪一道挡的。
*
* @param ctx - 插件上下文（要 `ctx.get('tokenMeter')`）。
* @param config - 配置。
* @param agent - 钩子载荷里的 agent（要它的 `session` 与 `inject`）。
* @param log - 日志函数（测试可传空实现）。
* @returns 结论。
*/
async function reportContextUsage(ctx, config, agent, log = () => {}) {
	if (!config.contextReportOnTurnEnd) return {
		injected: false,
		reason: "开关关着"
	};
	if (agent === void 0 || agent === null) return {
		injected: false,
		reason: "载荷里没有 agent"
	};
	if (typeof agent.inject !== "function") return {
		injected: false,
		reason: "agent 没有 inject 方法"
	};
	const depth = delegationDepthOf(agent.session);
	if (depth > 0) return {
		injected: false,
		reason: `本会话是子代理（delegationDepth=${depth}）⇒ 不报（防递归）`
	};
	const opts = agent.options ?? {};
	const provider = typeof opts.provider === "string" ? opts.provider : "";
	const model = typeof opts.model === "string" ? opts.model : "";
	const usage = await readContextUsageWithWindow(ctx, agent.session, provider, model);
	if (usage === void 0) return {
		injected: false,
		reason: "拿不到上下文测量（sessionProjections / contextPressure 不可用）"
	};
	if (usage.percent !== void 0 && usage.percent < config.contextReportMinPercent) return {
		injected: false,
		reason: `占用 ${usage.percent}% < 阈值 ${config.contextReportMinPercent}%`
	};
	const text = renderContextUsage(usage);
	const message = createUserMessage({
		content: [{
			type: "text",
			text
		}],
		source: {
			kind: "plugin:dsh-memj",
			form: "instructions",
			sections: [{
				name: SECTION_NAME,
				text
			}]
		}
	});
	agent.inject(message);
	log(`injected: ${usage.percent === void 0 ? "（无窗口）" : `${usage.percent}%`}（source=${usage.source}，used=${usage.used}，window=${usage.window ?? "—"}）`);
	return {
		injected: true,
		reason: usage.percent === void 0 ? `占用 ${usage.used}（无窗口）` : `占用 ${usage.percent}%`,
		...usage.percent === void 0 ? {} : { percent: usage.percent }
	};
}
//#endregion
//#region src/active-context.ts
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
const TOKEN_COEF = {
	/** 汉字（CJK 统一表意文字 + 中日韩标点 + 全角符号）。 */
	han: 1.1,
	/** 拉丁字母/数字。 */
	latin: .26,
	/**
	* ⭐ **ASCII 标点 / 空白 / 换行**（`{}[]();=<>|&` 等）—— 实测 **0.684**。
	* 🔴 它与 `wide` **不是一回事**，别合并（上一版合并 ⇒ 低估 63%）。
	*/
	ascii: .75,
	/**
	* ⭐ **非 ASCII、又非汉字的符号**（`—` `–` `“”` `‘’` `…` `·` `「」` 等）——
	* 实测 **约 1.006**，**与汉字同价**。
	* 🔴 上一版把它算成 0.42 ⇒ **低估 139%**（本项目最严重的一次估算偏差）。
	*/
	wide: 1.1,
	/** 请求结构 + 固定问句的**固定开销**（输入侧）。 */
	overhead: 400,
	/** **每条候选**的**输入**成本（候选正文 + 它自己的那个 `noul` 问句；实测 210.7）。 */
	perCandidate: 230,
	/**
	* ⭐ **每条候选**的**输出**成本（模型回一个 `noul` 概率，实测 18.6）。
	* 🔴 **漏了它就会"以为没超、实际超"** —— 见下方说明。
	*/
	perCandidateOutput: 24
};
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
function estimateTokens(text) {
	if (text === "") return 0;
	let han = 0;
	let latin = 0;
	let ascii = 0;
	let wide = 0;
	for (const ch of text) {
		const c = ch.codePointAt(0) ?? 0;
		if (c >= 19968 && c <= 40959 || c >= 13312 && c <= 19903 || c >= 12288 && c <= 12351 || c >= 65280 && c <= 65519) han++;
		else if (c >= 65 && c <= 90 || c >= 97 && c <= 122 || c >= 48 && c <= 57) latin++;
		else if (c < 128) ascii++;
		else wide++;
	}
	return Math.ceil(han * TOKEN_COEF.han + latin * TOKEN_COEF.latin + ascii * TOKEN_COEF.ascii + wide * TOKEN_COEF.wide);
}
/** 候选池的估算**输入**成本（每条含它自己的问句）。 */
function estimatePoolTokens(count) {
	return Math.ceil(count * TOKEN_COEF.perCandidate);
}
/**
* ⭐⭐ 候选池的估算**输出**成本（模型要为每条候选回一个 `noul`）。
*
* 🔴 **必须与输入一起算进预算** —— 漏了它就是"以为没超、实际超"（见 `TOKEN_COEF`）。
*/
function estimatePoolOutputTokens(count) {
	return Math.ceil(count * TOKEN_COEF.perCandidateOutput);
}
/**
* 是不是 memj 的注入消息。
*
* 🔴 0.2.0 起判据是 `source.kind === 'plugin:dsh-memj'` —— V4 会话日志
* **拒绝** 旧的 catch-all `kind: 'plugin'`（`dsh-llm` 的注释原话：
* "there is no shared catch-all `plugin` kind"），插件必须用自己的 kind。
* 判据必须与写入端（`active-inject.ts` / `hot-watch.ts` / `commands.ts`）同源。
*/
const MEMJ_SOURCE_KIND = "plugin:dsh-memj";
function isMemjInjection(msg) {
	return (msg?.source)?.kind === MEMJ_SOURCE_KIND;
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
function splitTurns(messages) {
	const turns = [];
	if (!Array.isArray(messages)) return turns;
	let cur;
	/** 去重：同一段注入文本只算一次（方案要求）。 */
	const seenInject = /* @__PURE__ */ new Set();
	const ensure = () => {
		if (cur === void 0) {
			cur = {
				userText: "",
				assistantTexts: [],
				injections: []
			};
			turns.push(cur);
		}
		return cur;
	};
	for (const m of messages) {
		const role = typeof m?.role === "string" ? String(m.role) : "";
		const content = m?.content;
		if (!Array.isArray(content)) continue;
		const injected = isMemjInjection(m);
		if (role === "user" && !injected) {
			cur = {
				userText: content.filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).filter((t) => t !== "").join("\n"),
				assistantTexts: [],
				injections: []
			};
			turns.push(cur);
			continue;
		}
		if (injected) {
			const t = content.filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).join("\n");
			if (t === "") continue;
			const key = t.slice(0, 300);
			if (seenInject.has(key)) continue;
			seenInject.add(key);
			ensure().injections.push({
				role: "user",
				text: t,
				injected: true,
				injectKey: key
			});
			continue;
		}
		if (role === "assistant") {
			const texts = content.filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).filter((t) => t !== "");
			if (texts.length > 0) for (const t of texts) ensure().assistantTexts.push(t);
			continue;
		}
	}
	return turns;
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
function assembleContext(opts) {
	const turns = splitTurns(opts.messages);
	const cap = Math.max(0, opts.reasoningCap);
	const r = opts.currentReasoning.trim();
	const thinking = r === "" ? "" : r.length > cap ? r.slice(r.length - cap) : r;
	/** 渲染一轮的背景部分（**不含思考** —— 思考只来自当前轮，且单独返回）。 */
	const renderTurn = (turn) => {
		const parts = [];
		if (turn.userText !== "") parts.push(`[user] ${turn.userText}`);
		for (const t of turn.assistantTexts) parts.push(`[assistant] ${t}`);
		for (const inj of turn.injections) parts.push(`[injected] ${inj.text}`);
		return parts.join("\n");
	};
	const total = turns.length;
	if (total === 0) return {
		background: "",
		thinking,
		text: thinking,
		keptTurns: 0,
		totalTurns: 0,
		droppedTurns: 0,
		atFloor: true,
		tokens: estimateTokens(thinking)
	};
	const budget = opts.budgetTokens;
	const kept = [];
	let used = estimateTokens(thinking);
	let keptCount = 0;
	for (let i = total - 1; i >= 0; i--) {
		const block = renderTurn(turns[i]);
		const cost = estimateTokens(block);
		if (budget > 0 && used + cost > budget && keptCount > 0) break;
		kept.unshift(block);
		used += cost;
		keptCount++;
	}
	const background = kept.filter((s) => s !== "").join("\n\n");
	const text = [thinking === "" ? "" : `[reasoning] ${thinking}`, background].filter((s) => s !== "").join("\n\n");
	return {
		background,
		thinking,
		text,
		keptTurns: keptCount,
		totalTurns: total,
		droppedTurns: total - keptCount,
		atFloor: keptCount <= 1,
		tokens: estimateTokens(text)
	};
}
/** 一条候选的**总**成本（输入 + 输出）。 */
function estimateCandidateTokens(count) {
	return estimatePoolTokens(count) + estimatePoolOutputTokens(count);
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
function planInjection(opts) {
	const pool = opts.pool;
	const N = pool.length;
	const B = opts.totalBudget;
	const K = Math.max(1, Math.floor(opts.maxBatches));
	const O = TOKEN_COEF.overhead;
	const perCand = TOKEN_COEF.perCandidate + TOKEN_COEF.perCandidateOutput;
	const floorTokens = assembleContext({
		messages: opts.messages,
		currentReasoning: opts.currentReasoning,
		reasoningCap: opts.reasoningCap,
		budgetTokens: 1
	}).tokens;
	let ctxBudget;
	if (B === 0) ctxBudget = opts.contextBudget;
	else if (K <= 1) ctxBudget = Math.max(floorTokens, B - estimateCandidateTokens(N) - O);
	else {
		const perBatchNeed = Math.ceil(N / K);
		const ctxAllowed = B - O - perBatchNeed * perCand;
		ctxBudget = Math.max(floorTokens, Math.min(opts.contextBudget, ctxAllowed));
	}
	const ctx = assembleContext({
		messages: opts.messages,
		currentReasoning: opts.currentReasoning,
		reasoningCap: opts.reasoningCap,
		budgetTokens: ctxBudget
	});
	const room = B === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, B - ctx.tokens - O);
	const perBatch = B === 0 ? N : Math.max(1, Math.floor(room / perCand));
	const needed = N === 0 ? 0 : Math.max(1, Math.ceil(N / perBatch));
	const batches = [];
	if (N > 0) {
		const chunk = Math.ceil(N / needed);
		for (let i = 0; i < N; i += chunk) batches.push(pool.slice(i, i + chunk));
	}
	const perBatchTokens = batches.map((b) => estimateCandidateTokens(b.length) + ctx.tokens + O);
	const overBudget = B > 0 && perBatchTokens.some((t) => t > B);
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
		overBudget
	};
}
//#endregion
//#region src/active-recall.ts
/**
* ⭐⭐⭐ 主动注入 · **召回**（设计文档《memj 主动注入 · 设计方案》§6、§8）。
*
* ── 它做什么 ──────────────────────────────────────────────────────────────
* 给一段「截止本次思考的上下文」，让一个**可配置的召回模型**判断
* **要不要知识**（两步判断）并**选出最相关的几条**，返回**条目**（不是文本）。
*
* ── 两条通路（§6.1）──────────────────────────────────────────────────────
* | 通路 | 端点 | 输出 | 语言要求 |
* |---|---|---|---|
* | `chat` | OpenAI 兼容（走 DSH 内部路由 `ctx.llm`） | **一行 JSON** | 中文即可 |
* | `jev`  | Knox `/v1/systemone`（**直连 fetch**） | 结构化分数 `noul` | 🔴 **instructions 必须英文** |
*
* 🔴 **不要把"通路"从模型名隐式推导**（如"名字含 jev 就走 systemone"）——
*    换模型时会**静默走错端点**。**显式配置** `activeInjectChannel`。
*
* ── 三条不可动摇的设计约束 ────────────────────────────────────────────────
* 1. ⭐⭐ **召回模型永不输出正文，只输出序号**（§6.2）⇒ 注入文本由 memj 自己渲染，
*    与清单**逐字一致**（不靠模型排版 ⇒ 不会漂移、不会编造）；
* 2. 🔴 **清单必须独占一条 `system` 消息**（§8.2）：清单是输入的大头（≈18k tokens），
*    若与"每次都变的上下文"同处一条消息，按消息粒度缓存的实现会让**整条**都不命中；
* 3. 🔴 **绝不传 `sessionId`**（§12 风险 1）：否则会被 `llm/stream` 监听器（含本插件自己的）
*    判成"会话步" ⇒ **递归**。（JEV 直连天然不经过 `llm/stream`，无此风险。）
*
* @module dsh-memj/active-recall
*/
/**
* ⭐ 模块级：最近一次预算/拆批编排的诊断（进 `/active`）。
*
* 🔴 **为什么要有**：预算这套东西一旦估错，表现只是"上游 400"，
*    而**看不出它当时算的是多少**。实测踩过：147k 字符的上下文直接把 JEV 撑爆。
*/
let lastBudgetDiag;
/** 读最近一次预算/拆批编排的诊断。 */
function lastBudgetDiagnostic() {
	return lastBudgetDiag;
}
/** 诊断日志（跟随项目既有约定：只在配置打开时输出）。 */
function diag$1(message, config) {
	if (!config.enIndexDiag) return;
	try {
		console.log(`[dsh-memj/active] ${message}`);
	} catch {}
}
/** 索引条目 → 候选。 */
function toCandidate(id, e) {
	return {
		id,
		project: e.project,
		theme: [...e.theme],
		kind: e.kind,
		title: e.title,
		desc: e.desc,
		titleEn: e.titleEn,
		descEn: e.descEn
	};
}
/** 空结论（各种"没做"的路径都用它，保证形状一致）。 */
function emptyOutcome(patch = {}) {
	return {
		need: false,
		picks: [],
		batched: false,
		evaluated: 0,
		pool: 0,
		ms: 0,
		skipped: "",
		suppressed: "",
		called: false,
		why: "",
		...patch
	};
}
/** 索引里的全部活跃封面（**顺序稳定**：`scanLibrary()` 的写入顺序 ⇒ 追加式缓存的前提）。 */
function allCandidates(idx) {
	return Object.entries(idx.entries).map(([id, e]) => toCandidate(id, e));
}
/**
* ⭐ **按范围取候选池**（§6.0）。
*
* | 范围 | 内容 |
* |---|---|
* | `project` | `project === pid` |
* | `project+themes` | 项目封面 + 项目 `themes:` 下所有封面（**已去重**） |
* | `all` | 全库 |
*
* 🔴 **会话未绑定项目时**（`pid === ''`）：
*    `project` / `project+themes` ⇒ **无候选 ⇒ 跳过**。
*    ⛔ **不要退化成全量** —— 那会让成本突然跳变（"未知"是一等公民）。
* @param idx - 索引。
* @param pid - 会话绑定的项目 id（空 = 未绑定）。
* @param scope - 范围。
* @returns 候选（`project*` 且未绑定项目时返回空数组）。
*/
function candidatesForScope(idx, pid, scope) {
	const all = allCandidates(idx);
	if (scope === "all") return all;
	if (pid === "") return [];
	if (scope === "project") return all.filter((c) => c.project === pid);
	const themes = new Set(idx.projects[pid]?.themes ?? []);
	return all.filter((c) => c.project === pid || c.theme.some((t) => themes.has(t)));
}
/**
* ⭐⭐ **JEV 通路把默认档降级成 `project`**（用户 2026-09-26 裁定 B）。
*
* 🔴 **为什么**：实测本机 282 条池子下，`project+themes` 在 `dsh-memj` 上是 **245 条
*    ⇒ 已超 JEV 的 240 硬顶**（`thm-dsh-plugin` 被 6 个项目共享 ⇒ 几乎每个项目的这一档
*    都被放大到 ~187~245）⇒ 默认配置下会**每次都吃一次本地粗筛**（粗筛会漏）。
*    ⭐ 降级成 `project` 就落回"**唯一可能不粗筛直接送**"的范围，把确定性换回来。
* ⚠️ **只影响 JEV 通路**：chat 通路没有 240 硬顶，不必牺牲范围。
* @param scope - 配置的范围。
* @param channel - 通路。
* @param narrow - `activeInjectJevNarrowScope` 开关。
* @returns 实际生效的范围。
*/
function effectiveScope(scope, channel, narrow) {
	if (channel === "jev" && narrow && scope === "project+themes") return "project";
	return scope;
}
/**
* ⭐ 渲染一条候选行。
*
* ⚠️ **用英文 `TITLE/DESC` 还是中文？** 两条通路不同（§9.1）：
*    · `jev`  ⇒ **英文更优**（实测 margin 0.303 → 0.357），且**它有英文译文**
*    · `chat` ⇒ **中文即可**，但用英文同样成立 ⇒ **统一用英文**（少一条分支）
* ⚠️ 英文译文可能为空（未翻译完）⇒ **回落中文**（不是错误，§9.4）。
*/
function renderManifestLine(c, i, english) {
	const title = english && c.titleEn !== "" ? c.titleEn : c.title;
	const desc = english && c.descEn !== "" ? c.descEn : c.desc;
	return `${i + 1}. TITLE: ${title} / DESC: ${desc}`;
}
/**
* ⭐⭐ **渲染知识库清单**（放进 `system` 的**尾部**，独占一条消息 —— §8.2）。
*
* 🔴 **必须是"只追加、不改序"**：新知识 append 到末尾 ⇒ 前面全部仍命中前缀缓存。
*    ⚠️ **已知例外**：**新增项目**会让它后面所有项目的封面**整体后移**
*    ⇒ 前缀缓存**全废一次**。⭐ 这是本设计**接受的代价**（低频事件），
*    ⛔ **不要为此去改排序策略**（那会把"低频全废"变成"高频局部失效"）。
* @param pool - 候选（顺序即清单顺序）。
* @param english - 是否用英文。
* @returns 清单文本。
*/
function renderManifest(pool, english) {
	const lines = pool.map((c, i) => renderManifestLine(c, i, english));
	return `【知识库清单】（共 ${pool.length} 条）\n${lines.join("\n")}`;
}
/**
* ⭐ **`system` 的固定头部**（身份 + 输出纪律 + 判断要求）。
*
* ⚠️ **这一段永不变** ⇒ 永远命中前缀缓存 ⇒ 放在**清单之前**。
*/
const JUDGE_HEAD = ["你是一个知识召回判断器。你只能从用户给出的知识库清单里挑选条目，不得编造清单外的内容。", "你的输出只有一个 JSON 对象，没有任何其他文字、没有 markdown 代码块。"].join("\n");
/**
* ⭐⭐ **判断要求**（§6.4②）。
*
* 🔴 **第一步 = 两条抑制条件**（各自受一个开关控制）：
*    **(a) 已有知识足够** —— 含系统注入的背景知识、之前注入的知识，
*        **以及主模型对它们的反馈**（它在思考里是否引用过、是否说不够、是否说无关）；
*    **(b) 主模型已表达检索意图**。
* ⭐ **第二步必须保留**（用户指出）：它负责筛掉**无意义的闲聊** ——
*    没有它，闲聊轮次也可能被塞进几条不相干的知识。
*
* ⚠️ **这里不写"最多 K 条"** —— K 是**可配变量**，写进 `system` 会让它**每次都变**、
*    把清单一起拖出缓存。K 放 `user`。
* @param sufficientGate - `(a)` 开关。
* @param searchIntentGate - `(b)` 开关。
* @returns 判断要求文本；**两条都关**时退回单步版本。
*/
function renderJudgeRules(sufficientGate, searchIntentGate) {
	if (!sufficientGate && !searchIntentGate) return [
		"【判断要求】",
		"判断当前上下文是否需要清单里的知识才能更好地完成工作。",
		"如果需要，选出最相关的条目；如果只是闲聊或没有知识需求，输出 {\"need\":false}。"
	].join("\n");
	const first = ["第一步：判断是否已经不需要再注入知识。满足以下任一条，就输出 {\"need\":false}，不要做第二步："];
	if (sufficientGate) first.push("(a) 当前上下文里已有的知识已经足够 —— 已有的知识包括系统注入的背景知识、之前注入的知识，", "    以及主模型对它们的反馈（它在思考里是否引用过、是否说不够、是否说无关）。", "    判据：主模型最近的思考里已经引用了这些知识，或这些知识与当前问题的关键点逐条对得上（不是只沾边）。");
	if (searchIntentGate) first.push("(b) 主模型已经表达了要自己去检索知识库的意图", "    （例如说\"我搜一下 memj\"、\"查查知识库里有没有\"、或已经知道该查哪一条具体知识）。");
	return [
		"【判断要求】",
		...first,
		"第二步：否则判断当前上下文是否需要清单里的知识才能更好地完成工作。",
		"如果需要，选出最相关的条目。"
	].join("\n");
}
/** 输出格式说明（`explain` 打开时多要一个 `why` —— **仅调试**）。 */
function renderOutputSpec(explain) {
	if (explain) return [
		"只输出一行 JSON，格式为：",
		"{\"need\":true,\"picks\":[编号,...],\"why\":\"一句话理由\"}",
		"或",
		"{\"need\":false,\"why\":\"一句话理由\"}"
	].join("\n");
	return [
		"只输出一行 JSON，格式为：",
		"{\"need\":true,\"picks\":[编号,...]}",
		"或",
		"{\"need\":false}"
	].join("\n");
}
/**
* ⭐⭐ **组装 `system`**（身份 + 纪律 + 要求 + **清单**）。
*
* 🔴 **顺序**：清单放**最末** ⇒ 身份/纪律/要求那几十个 token 永远命中，
*    清单变化时**只损失它自己那一段**。
* ⚠️ **`system` 必须存在** —— WorkBuddy 上游硬要求（首条非 `system` 会 400 `code 11128`）。
*/
function buildSystemPrompt(opts) {
	return [
		JUDGE_HEAD,
		"",
		renderJudgeRules(opts.sufficientGate, opts.searchIntentGate),
		"",
		renderOutputSpec(opts.explain),
		"",
		renderManifest(opts.pool, opts.english)
	].join("\n");
}
/**
* ⭐⭐ **组装 `user`**（**只有每次都变的部分** ⇒ 它失效的代价极小）。
*
* 🔴 **只写"当前上下文" + 上限 K**：清单留在 `system`。
* 🔴 **必须写成"正面规定格式"，不要写"禁止额外输出"** ——
*    实测：否定式硬约束会让模型**整段拒答或塌成 1 个 token**（条目 `11e7619e`）。
* @param context - 截取的上下文。
* @param topK - 上限（**放这里而不是 `system`**，见 `renderJudgeRules`）。
* @param note - 可选的补充说明（如"候选已粗筛"）。
*/
function buildUserPrompt(context, topK, note = "") {
	return [
		"【当前上下文】",
		context,
		"",
		...note !== "" ? [note, ""] : [],
		`最多选 ${topK} 条。`
	].join("\n");
}
/**
* ⭐ **解析并校验模型输出**（两条通路共用）。
*
* 校验三件（§6.4④）：① 编号在 `1..N` 内；② 去重；③ JSON 解析失败 ⇒ 报错跳过。
* ⚠️ **越界项丢弃、不报错**（模型偶尔会多数一个，那不该毁掉整次召回）。
* @param text - 模型输出（可能带 markdown 围栏、前后杂字）。
* @param n - 清单条数。
* @param explain - 是否期待 `why`。
*/
function parseJudgeOutput(text, n, explain) {
	const fail = (error) => ({
		need: false,
		picks: [],
		why: "",
		error
	});
	const raw = String(text ?? "").trim();
	if (raw === "") return fail("模型输出为空");
	const m = raw.match(/\{[\s\S]*\}/);
	if (m === null) return fail("模型输出里没有 JSON 对象");
	let o;
	try {
		o = JSON.parse(m[0]);
	} catch {
		return fail("JSON 解析失败");
	}
	const why = explain && typeof o.why === "string" ? o.why : "";
	if (o.need !== true) return {
		need: false,
		picks: [],
		why,
		error: ""
	};
	const list = Array.isArray(o.picks) ? o.picks : [];
	const seen = /* @__PURE__ */ new Set();
	const picks = [];
	for (const v of list) {
		const k = typeof v === "number" ? v : Number(v);
		if (!Number.isInteger(k) || k < 1 || k > n) continue;
		if (seen.has(k)) continue;
		seen.add(k);
		picks.push(k);
	}
	if (picks.length === 0) return {
		need: false,
		picks: [],
		why,
		error: ""
	};
	return {
		need: true,
		picks,
		why,
		error: ""
	};
}
/**
* 把编号映射回候选（**按清单顺序**输出 ⇒ 注入文本顺序稳定）。
* @param picks - 1-based 编号。
* @param pool - 候选（与清单同序）。
* @param topK - 上限。
*/
function pickCandidates(picks, pool, topK) {
	const out = [];
	for (const k of [...picks].sort((a, b) => a - b)) {
		const c = pool[k - 1];
		if (c !== void 0) out.push(c);
		if (out.length >= topK) break;
	}
	return out;
}
/** 拆 `provider/model`（⚠️ **首个 `/`**：模型名里可能还有 `/`，如 `tencent/Hunyuan-MT-7B`）。 */
function splitRoute(s) {
	const i = s.indexOf("/");
	if (i <= 0 || i === s.length - 1) return void 0;
	return {
		provider: s.slice(0, i),
		model: s.slice(i + 1)
	};
}
/**
* 从模型输出里取纯文本（**只看 text 块**，reasoning 不算答案）。
* @param assembler - 已收完的块装配器。
* @returns 文本，以及**实际收到的块类型清单**（诊断用 —— 见 `chatDiag`）。
*/
function textOf(assembler) {
	const blocks = assembler.blocks();
	const kinds = [...new Set(blocks.map((b) => String(b.type)))];
	return {
		text: blocks.filter((b) => b.type === "text").map((b) => b.text).join(""),
		kinds
	};
}
/** 模块级：最近一次 chat 调用的诊断（**纯内存**）。 */
let lastChatDiag;
/** 读最近一次 chat 调用的诊断（`/active` 用）。 */
function lastChatDiagnostic() {
	return lastChatDiag;
}
/**
* ⭐ **chat 通路调用**（走 DSH 内部模型路由）。
*
* 🔴🔴 **绝不传 `sessionId`** —— 否则被 `llm/stream` 判成"会话步" ⇒ **递归**。
* 🔴 **`ctx.get('llm')`，不是 `ctx.llm`**：后者运行时是 `undefined`，
*    被 `try/catch` 吞掉后**只表现为空结果**（本项目真实踩过，见 `en-index.ts`）。
* ⚠️ **关思考用 `reasoningEffort: 'off'`**（provider-neutral 档位）——
*    设计文档 §6.4⑤ 写的 `enable_thinking:false` 是针对**直连** WorkBuddy 的形态；
*    走内部路由时由适配器翻译（deepseek 适配器把 `off` 翻成 `thinking:disabled`）。
*    ⚠️ 有些模型**不能被关思考**（如 hy3）⇒ 带 `off` 会抛
*    `UNSUPPORTED_REASONING_EFFORT`。⭐ 那种情况**回落成"不传档位"**再试一次。
* 🔴 **但"关不掉思考"与"只回思考没回正文"是两回事**（实测）：
*    后者表现为 `kinds: ['reasoning']` 且 `chars: 0` —— 那种情况**必须报出来**，
*    否则用户只看到"模型输出为空"，会以为是索引/配置坏了。
* @returns `{ text, error }`：`error` 非空 = 调用没成（并且原因可读）。
*/
async function callChat(opts) {
	const llm = opts.ctx.get("llm");
	if (llm?.stream === void 0) {
		lastChatDiag = {
			at: (/* @__PURE__ */ new Date()).toISOString(),
			provider: opts.route.provider,
			model: opts.route.model,
			tries: [{
				kind: "off",
				error: "ctx.get('llm') 拿不到服务",
				kinds: [],
				chars: 0,
				ms: 0
			}]
		};
		return {
			text: "",
			error: "拿不到 llm 服务（ctx.get('llm') 是 undefined）"
		};
	}
	const base = {
		provider: opts.route.provider,
		model: opts.route.model,
		system: opts.system,
		messages: [createUserMessage({
			content: [{
				type: "text",
				text: opts.user
			}],
			source: { kind: "plugin:dsh-memj" }
		})],
		temperature: 0,
		maxTokens: 200
	};
	const tries = [];
	/** 一次尝试；`effort` 为 `'off'` 时带关思考档位。 */
	const attempt = async (kind) => {
		const t0 = Date.now();
		const guard = deadline(void 0, opts.config.activeInjectTimeoutMs, "MEMJ_ACTIVE_RECALL_TIMEOUT");
		try {
			const options = {
				...base,
				...kind === "off" ? { reasoningEffort: "off" } : {},
				signal: guard.signal
			};
			const assembler = new BlockAssembler();
			for await (const chunk of llm.stream(options)) assembler.push(chunk);
			guard.signal.throwIfAborted();
			const { text, kinds } = textOf(assembler);
			tries.push({
				kind,
				error: "",
				kinds,
				chars: text.length,
				ms: Date.now() - t0
			});
			return text;
		} catch (err) {
			tries.push({
				kind,
				error: err instanceof Error ? err.message : String(err),
				kinds: [],
				chars: 0,
				ms: Date.now() - t0
			});
			throw err;
		} finally {
			guard[Symbol.dispose]();
		}
	};
	/**
	* 🔴🔴 **两条降级判据，不是一条**（2026-09-26 实测修，这是我自己写的真 bug）：
	*    · **抛异常**（`UNSUPPORTED_REASONING_EFFORT`）⇒ 该换一次；
	*    · ⭐ **没抛、但正文为空**（`kinds` 里只有 `reasoning`、甚至一个块都没有）⇒ **同样该换**。
	*    我第一版只按"抛异常"降级 ⇒ 实测 hy3 上 `off` **不抛、直接回空**
	*    ⇒ 降级**从未发生**，结果恒是"模型没有返回正文"（毫秒级返回，请求根本没发出去）。
	*    ⭐ 判据：**降级的触发条件必须包含"结果不可用"，不能只看"报没报错"** ——
	*    "没报错但什么也没给"是最难查的一类失败。
	*/
	const usable = (text) => text.trim() !== "";
	try {
		const text = await attempt("off");
		if (usable(text)) {
			lastChatDiag = {
				at: (/* @__PURE__ */ new Date()).toISOString(),
				provider: opts.route.provider,
				model: opts.route.model,
				tries
			};
			return {
				text,
				error: ""
			};
		}
	} catch {}
	try {
		const text = await attempt("plain");
		lastChatDiag = {
			at: (/* @__PURE__ */ new Date()).toISOString(),
			provider: opts.route.provider,
			model: opts.route.model,
			tries
		};
		if (usable(text)) return {
			text,
			error: ""
		};
		return {
			text: "",
			error: ""
		};
	} catch {
		lastChatDiag = {
			at: (/* @__PURE__ */ new Date()).toISOString(),
			provider: opts.route.provider,
			model: opts.route.model,
			tries
		};
		return {
			text: "",
			error: `两次调用都失败：${tries.map((t) => `${t.kind}=${t.error}`).join("；")}`
		};
	}
}
/**
* JEV 的候选提问模板（🔴 **必须英文** —— 中文会让分辨力归零，条目 `efdebc4e`）。
*
* ⭐⭐ **点名 `current_thinking` 并声明"其余只是背景"**（用户 2026-09-26 设计意图）。
* 🔴 **实测依据**（96 条候选、真实会话上下文，两轮一致）：
*    · 平铺 + 老提问 ⇒ 均值 0.414
*    · 拆字段 + 点名提问 ⇒ 均值 **0.522**（96/96 条**全部上升**，均值 +0.085~0.109）
*    · ⚠️ **只拆字段不改提问反而略降**（−0.034）⇒ ⭐ **效果主要来自"提问里点名它"**。
* ⚠️ 所以**这句措辞不能省** —— 它比字段结构更关键。
*/
const JEV_CANDIDATE_INSTRUCTION = "Does `candidates[N]` directly help with the problem the assistant is currently working through in `current_thinking`? Answer yes only if reading that entry would change what the engineer does next. `background` is supporting material only — do not judge relevance against it; only `current_thinking` defines what is needed right now.";
/** JEV 的"是否需要"提问（英文）。 */
const JEV_NEED_INSTRUCTION = "Does the current context need external knowledge from the list to do this work well?";
/** JEV 的"已有知识是否充足"提问（英文；§6.3）。 */
const JEV_SUFFICIENT_INSTRUCTION = "Does the context already contain enough knowledge to do this work well — including system-injected background, previously injected entries, and the assistant's own reaction to them?";
/**
* ⭐⭐ JEV 的"搜索意图"提问（英文；§6.3）。
*
* 🔴🔴 **2026-09-27 收窄语义**（用户裁定，原话）：
*    *"我需要确认一下意图门，应该是**只有他有打算用 `memj_search` 或者 `memj_info`
*      工具去获取信息的检索意图时**，才去拦。而不是只要他有检索意图我就要拦。"*
*
* ⚠️ **旧文案为什么错**（`Has the assistant already expressed an intent to search
*    the knowledge base itself?`）：它没限定"用**哪个**手段" ⇒ **任何**"我该查一下 /
*    找找看 / 看看知识库"的念头都算命中。而本项目的思考里天然频繁出现这类字眼
*    ⇒ 实测生产上 `search_intent` = **0.910 / 0.940 / 0.960**（几乎必拦）
*    ⇒ **主动注入被常态性关闭**（会话 `bcf11432` / `9108fc3f` 实测都是这样被拦的）。
*
* ⭐ **新文案为什么对**：**点名两个工具**，判据变成"它是否**明确打算调用**这两个工具"。
*    ✅ 这样才与这条门的设计意图（"它自己会搜，不用重复给"）对得上 ——
*        ⚠️ 而**"打算搜" ≠ "搜得到"**（`memj_search` 是整词匹配，实测 top1 只中 **5/10**）
*        ⇒ 主动注入**正是那个兜底**，不该把它关在"它打算自己搜"上。
*
* 🔴 **必须仍是英文** —— 中文会让 JEV 的分辨力归零（条目 `efdebc4e`：
*    30 条候选全挤在 0.66~0.86、排名接近随机）。
* ⚠️ 本常量是**每次召回现拼进 `questions` 的**（不进提示词缓存、不进模型上下文）
*    ⇒ 改它**不影响前缀缓存**，也不属于"写给模型的常驻文本"那六处副本。
*/
const JEV_SEARCH_INTENT_INSTRUCTION = "Has the assistant explicitly stated that it will call the `memj_search` or `memj_info` tool to look something up? Answer yes only if it named one of those tools (or unambiguously described calling them). A general wish to check, look for, or recall information is NOT enough.";
/** 读 JEV 的 `noul` 概率。 */
function noulOf(answers, key) {
	const v = answers?.[key]?.noul;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : 0;
}
/**
* ⭐⭐ **JEV 通路调用**（一次请求同时问"总控" + 每条候选）。
* ⭐ **零额外成本**：输出免费、输入本来就要全发 ⇒ 加判断维度**不增加**成本与延迟。
* 🔴 **`instructions` 必须英文**；候选与上下文**中文可用**（英文的候选更优）。
* ⚠️ **`noul` 没有 `confidence` 字段**（只有 `choice`/`score` 有）⇒ 只能用概率本身比阈值。
*
* ⭐⭐ **`state` 分成 `current_thinking` + `background` 两个字段**（用户 2026-09-26 设计意图）：
*    *"除了这个段落，其他都只是背景信息而已，要根据这个段落去判断才对"*。
*    🔴 实测：这样拆 + 在提问里点名 ⇒ 96/96 条候选分数**全部上升**（均值 +0.085~0.109）。
*    ⚠️ `background` 为空时**不传该字段**（避免传空串让模型困惑）。
*
* ⚠️ **一次请求的总量**（state + 问句，含输出）有上限 ⇒ 候选池要靠 `planInjection` **拆批**。
* @returns 答案 + **请求快照**（后者供召回日志 B 档重放用）；拿不到凭据/上游失败时 `undefined`。
*/
async function callJev(opts) {
	const key = await resolveJevKey(opts.ctx, opts.config, opts.keyRef);
	if (key === void 0) return void 0;
	const state = { candidates: opts.pool.map((c, i) => ({
		i,
		title: c.titleEn !== "" ? c.titleEn : c.title,
		desc: c.descEn !== "" ? c.descEn : c.desc
	})) };
	state["current_thinking"] = opts.thinking;
	if (opts.background !== "") state["background"] = opts.background;
	const questions = { need: {
		type: "noul",
		instructions: promptText("jev:need", JEV_NEED_INSTRUCTION)
	} };
	if (opts.sufficientGate) questions["sufficient"] = {
		type: "noul",
		instructions: promptText("jev:sufficient", JEV_SUFFICIENT_INSTRUCTION)
	};
	if (opts.searchIntentGate) questions["search_intent"] = {
		type: "noul",
		instructions: promptText("jev:search-intent", JEV_SEARCH_INTENT_INSTRUCTION)
	};
	const candidateInstruction = promptText("jev:candidate", JEV_CANDIDATE_INSTRUCTION);
	opts.pool.forEach((_, i) => {
		questions[`c${i}`] = {
			type: "noul",
			instructions: candidateInstruction
		};
	});
	const questionKeys = Object.keys(questions);
	const guard = deadline(void 0, opts.config.activeInjectTimeoutMs, "MEMJ_ACTIVE_JEV_TIMEOUT");
	try {
		const res = await fetch(opts.endpoint, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: opts.model,
				state,
				questions
			}),
			signal: guard.signal
		});
		if (!res.ok) return void 0;
		return {
			answers: (await res.json()).answers,
			state,
			questionKeys
		};
	} catch {
		return;
	} finally {
		guard[Symbol.dispose]();
	}
}
/**
* ⭐ 取 JEV 的 API key。
*
* 🔴 **两条来源都要试，顺序固定**：
*    ① `ctx.credentials.resolve()`（**正规通道**；走它的好处是"改凭据不必重启"）
*    ② `process.env[名字]`（⚠️ 隔离实例就是靠这条路 —— 用户裁定 A：
*       **用环境变量注入，不把凭据文件复制进测试目录**）
* ⚠️ **绝不把 key 写进日志/回执**（本项目已发生过密钥明文外泄）。
* @param keyRefOverride - ⭐⭐ **本次要用哪个凭据名**（2026-10-07 多 provider 化）。
*   由调用方从 `activeDecisionOf(config)` / `scoreDecisionOf(config)` 解出来传进来
*   —— 每条 provider **各用自己的派生名**（`deriveDecisionKeyRef`）。
*   ⚠️ 不传时回落到旧键 `activeInjectJevApiKeyEnv`（兼容老调用点与测试）。
*/
async function resolveJevKey(ctx, config, keyRefOverride) {
	const name = (keyRefOverride ?? config.activeInjectJevApiKeyEnv ?? "").trim();
	if (name === "") return void 0;
	try {
		const got = await ctx.get("credentials")?.resolve?.(name);
		if (typeof got?.value === "string" && got.value !== "") return got.value;
	} catch {}
	const env = process.env[name];
	return typeof env === "string" && env !== "" ? env : void 0;
}
/**
* ⭐⭐⭐ **一次召回**（两条通路共用入口）。
*
* 流程（**预算在调模型之前就算好**，用户 2026-09-26 裁定）：
*   ① `loadEnIndex()` → 按范围取池；
*   ② ⭐ **`planBudget`**：组装上下文（turn 级裁剪）+ 必要时裁候选池，
*      直到总量落在预算内（JEV 50k 旋钮／chat 窗口 60%）；
*   ③ 调模型 → 解析校验 → 映射回条目。
*
* 🔴 **本函数不抛**：召回失败**绝不能影响主会话**（§12 风险 13）。
* 🔴 **被抑制时填 `suppressed` 而不是 `skipped`** —— 前者**不计入额度**（§7.4）。
* @param opts - 会话消息快照、本步思考、项目、以及预算来源。
*/
async function recall(opts) {
	const { ctx, config } = opts;
	const t0 = Date.now();
	const done = (o) => ({
		...o,
		ms: Date.now() - t0
	});
	try {
		if (config.activeInjectModel === "") return done(emptyOutcome({ skipped: "未配置召回模型" }));
		const idx = await loadEnIndex();
		if (idx === void 0) return done(emptyOutcome({ skipped: "索引不存在（召回只读它）" }));
		const scope = effectiveScope(config.activeInjectScope, config.activeInjectChannel, config.activeInjectJevNarrowScope);
		const full = candidatesForScope(idx, opts.project, scope);
		if (full.length === 0) {
			let why;
			if (opts.project === "") why = "会话未绑定项目 ⇒ 该范围无候选";
			else if (!Object.prototype.hasOwnProperty.call(idx.projects, opts.project)) why = `项目「${opts.project}」不在索引的 projects 映射里 ⇒ 该范围无候选`;
			else why = `项目「${opts.project}」在索引里没有任何条目（scope=${scope}）⇒ 该范围无候选`;
			return done(emptyOutcome({ skipped: why }));
		}
		const isJev = config.activeInjectChannel === "jev";
		const plan = planInjection({
			messages: opts.messages,
			currentReasoning: opts.currentReasoning,
			reasoningCap: config.activeInjectReasoningMaxChars,
			pool: full,
			totalBudget: budgetTokensFor(config, opts.contextWindow),
			contextBudget: config.activeInjectContextTokens,
			maxBatches: isJev ? config.activeInjectConcurrency : 1
		});
		lastBudgetDiag = plan;
		diag$1(`plan budget=${plan.totalBudget || "∞"} ctx=${plan.contextTokens}/${plan.contextBudget} (${plan.ctx.keptTurns}/${plan.ctx.totalTurns}轮) pool=${full.length}⇒${plan.batches.length}批 每批≈[${plan.perBatchTokens.join(",")}]` + (plan.batchesOverKnob ? ` ⚠️**批数超旋钮(${plan.batches.length}>${config.activeInjectConcurrency})**` : "") + (plan.overBudget ? " ⚠️**超预算**" : ""), config);
		const english = true;
		if (isJev) return done(await recallViaJev({
			ctx,
			config,
			thinking: plan.thinking,
			background: plan.background,
			full,
			plan
		}));
		return done(await recallViaChat({
			ctx,
			config,
			context: plan.context,
			pool: plan.batches[0] ?? full,
			full,
			batched: plan.batches.length > 1,
			english,
			plan
		}));
	} catch (err) {
		return done(emptyOutcome({ skipped: `召回异常：${err instanceof Error ? err.message : String(err)}` }));
	}
}
/**
* ⭐⭐ **这次调用该用多少 token 预算**（两条通路的规则不同）。
*
* | 通路 | 上限 | 依据 |
* |---|---|---|
* | `jev` | **单次请求 ≤ `activeInjectBudgetTokens`（默认 40000）** | 用户裁定；关掉开关 ⇒ `0` = **不检查** |
* | `chat` | **≤ 模型上下文窗口的 60%** | 用户裁定；⚠️ 窗口拿不到 ⇒ 不检查（估不准就别乱裁） |
*
* 🔴 **注意口径**：JEV 的预算是**单次请求**的上限 ——
*    每个批次都要带同一份上下文，所以"并发 3 批"的实际覆盖面是 `3 × 每批候选数`。
* 🔴 **实测支撑**（2026-09-26，英文清单 + 真实会话）：
*    · 每条候选 ≈ **194 输入 + 18.6 输出**（模型要为每条回一个 `noul`）；
*    · 198 条候选 + 20k 字符上下文 ⇒ 单批 **400 `max_tokens_exceeded`**，
*      而拆两批各 99 条 ⇒ **两批都成功**（墙钟 2064ms，与单批持平）。
* @param config - 插件配置。
* @param contextWindow - 本会话模型的上下文窗口（chat 通路用）。
* @returns 预算 token 数；**`0` = 不检查**。
*/
function budgetTokensFor(config, contextWindow) {
	if (config.activeInjectChannel === "jev") return config.activeInjectBudget ? config.activeInjectBudgetTokens : 0;
	if (typeof contextWindow !== "number" || contextWindow <= 0) return 0;
	return Math.floor(contextWindow * config.activeInjectChatWindowRatio);
}
/** chat 通路的召回。 */
async function recallViaChat(opts) {
	const { ctx, config } = opts;
	const route = splitRoute(config.activeInjectModel);
	if (route === void 0) return emptyOutcome({ skipped: `chat 通路的模型要写成 provider/model，当前是「${config.activeInjectModel}」（去设置面板的「召回模型」重选一个即可）` });
	const got = await callChat({
		ctx,
		config,
		route,
		system: buildSystemPrompt({
			pool: opts.pool,
			english: opts.english,
			sufficientGate: config.activeInjectSufficientGate,
			searchIntentGate: config.activeInjectSearchIntentGate,
			explain: config.activeInjectExplain
		}),
		user: buildUserPrompt(opts.context, config.activeInjectTopK, opts.batched ? "（候选清单已按 token 预算裁剪过，较早的条目被移出）" : "")
	});
	if (got.error !== "") return emptyOutcome({
		skipped: `chat 通路调用失败：${got.error}`,
		evaluated: opts.pool.length,
		pool: opts.full.length,
		batched: opts.batched
	});
	const text = got.text;
	if (text.trim() === "") return emptyOutcome({
		skipped: `模型没有返回正文（收到的块：${lastChatDiagnostic()?.tries.at(-1)?.kinds?.join("+") ?? "?"}）—— 若只收到 reasoning，说明该模型关不掉思考、思考把 maxTokens 吃完了（换一个能关思考的模型，如 deepseek 系）`,
		evaluated: opts.pool.length,
		pool: opts.full.length,
		batched: opts.batched,
		called: true
	});
	const parsed = parseJudgeOutput(text, opts.pool.length, config.activeInjectExplain);
	if (parsed.error !== "") return emptyOutcome({
		skipped: parsed.error,
		evaluated: opts.pool.length,
		pool: opts.full.length,
		batched: opts.batched,
		called: true
	});
	if (!parsed.need) return emptyOutcome({
		suppressed: "模型判定不需要（已有知识足够 / 已表达检索意图 / 无知识需求）",
		evaluated: opts.pool.length,
		pool: opts.full.length,
		batched: opts.batched,
		called: true,
		why: parsed.why
	});
	return emptyOutcome({
		need: true,
		picks: pickCandidates(parsed.picks, opts.pool, config.activeInjectTopK),
		evaluated: opts.pool.length,
		pool: opts.full.length,
		batched: opts.batched,
		called: true,
		why: parsed.why
	});
}
/**
* JEV 通路的召回。
*
* ⭐ **三个"总控 `noul`" + N 个候选 `noul` 仍在一次请求里** ⇒ **零额外成本**。
* 判定顺序（§6.3）：**充足 ⇒ 不注入；有搜索意图 ⇒ 不注入；
* `need >= 需求阈值` ⇒ 按分数取 top-K；否则不注入**。
*
* 🔴 **两个阈值的分工（2026-09-29 拆开，别混）**：
*    · `needMin`（总控分 `need`）⇒ 决定「**这一轮要不要**注入」；
*    · `itemMin`（逐条候选分）  ⇒ 决定「**哪几条**够格入选」。
*    ⚠️ 它们回答的是两个不同的问题，**分数分布也不同** —— 共用一个阈值时，
*       两条路里必然有一条的取值是错的（实测：393 次倒在 need、174 次倒在候选）。
*/
async function recallViaJev(opts) {
	const { ctx, config } = opts;
	const batches = opts.plan.batches;
	const pick = activeDecisionOf(config);
	if (pick.endpoint === "" || pick.model === "") return emptyOutcome({ skipped: "未配置决策模型（或该 provider 下没有模型）⇒ 去「设置 → 决策模型配置」里加一个 provider 并选模型。" });
	/**
	* ⭐⭐ **并发发出全部批次**（实测：拆两批的墙钟 ≈ 单批，因为瓶颈是网关排队而不是模型计算 ——
	*    实测 96 条单批 2013ms vs 拆两批并发 1958ms，比值 0.97×）。
	*
	* 🔴 **每批单独计时并记进诊断** —— 曾经出现过"整次召回 30 秒（正好撞超时）"
	*    却看不出**是哪一批慢**的情况 ⇒ 没有每批耗时就只能猜。
	*/
	const batchMs = [];
	let reqSnapshot;
	const results = await Promise.all(batches.map(async (batch, bi) => {
		const t0 = Date.now();
		const r = await callJev({
			ctx,
			config,
			thinking: opts.thinking,
			background: opts.background,
			pool: batch,
			sufficientGate: config.activeInjectSufficientGate,
			searchIntentGate: config.activeInjectSearchIntentGate,
			model: pick.model,
			endpoint: pick.endpoint,
			keyRef: pick.keyRef
		});
		batchMs[bi] = Date.now() - t0;
		if (bi === 0 && r !== void 0 && config.activeRecallLogRequest) reqSnapshot = {
			state: r.state,
			questionKeys: r.questionKeys,
			batch: {
				index: 1,
				total: batches.length
			}
		};
		diag$1(`jev batch ${bi + 1}/${batches.length}: ${batch.length} 条 耗时=${batchMs[bi]}ms ${r === void 0 ? "❌失败" : "✅成功"}`, config);
		return r;
	}));
	const okIdx = results.map((r, i) => r === void 0 ? -1 : i).filter((i) => i >= 0);
	if (okIdx.length === 0) return emptyOutcome({ skipped: `JEV 通路调用失败（${batches.length} 批全失败：拿不到 KNOX_API_KEY 或上游报错）` });
	const base = {
		evaluated: opts.full.length,
		pool: opts.full.length,
		batched: batches.length > 1,
		called: true,
		...reqSnapshot !== void 0 ? { request: reqSnapshot } : {}
	};
	const gateMax = (key) => Math.max(...okIdx.map((i) => noulOf(results[i]?.answers, key)));
	const scores = {
		need: gateMax("need"),
		sufficient: gateMax("sufficient"),
		searchIntent: gateMax("search_intent")
	};
	if (config.activeInjectSufficientGate) {
		const s = scores.sufficient;
		if (s >= config.activeInjectSufficientMin) return emptyOutcome({
			...base,
			scores,
			suppressed: `已有知识充足（${s.toFixed(3)} ≥ ${config.activeInjectSufficientMin}）`
		});
	}
	if (config.activeInjectSearchIntentGate) {
		const s = scores.searchIntent;
		if (s >= config.activeInjectSearchIntentMin) return emptyOutcome({
			...base,
			scores,
			suppressed: `主模型已有检索意图（${s.toFixed(3)} ≥ ${config.activeInjectSearchIntentMin}）`
		});
	}
	const need = scores.need;
	const needMin = needMinOf(config);
	if (need < needMin) return emptyOutcome({
		...base,
		scores,
		suppressed: `需求分 ${need.toFixed(3)} < ${needMin}`
	});
	const scored = [];
	const itemMin = itemMinOf(config);
	for (const bi of okIdx) {
		const ans = results[bi]?.answers;
		(batches[bi] ?? []).forEach((c, i) => {
			const score = noulOf(ans, `c${i}`);
			if (score >= itemMin) scored.push({
				c,
				score
			});
		});
	}
	scored.sort((a, b) => b.score - a.score);
	const picks = scored.slice(0, config.activeInjectTopK).map((s) => s.c);
	if (picks.length === 0) return emptyOutcome({
		...base,
		scores,
		skipped: `need=${need.toFixed(3)}（≥${needMin}）但无候选达到条目阈值 ${itemMin}`
	});
	const batchNote = batches.length > 1 ? `，${batches.length} 批并发（成功 ${okIdx.length}；各批 ${batchMs.join("/")}ms）` : "";
	return emptyOutcome({
		...base,
		scores,
		need: true,
		picks,
		why: `need=${need.toFixed(3)}${batchNote}`
	});
}
/**
* ⭐⭐ **注入文本的收尾指令**（条目 `ee1034ef`）。
*
* 🔴 **为什么必须写硬**：注入的是**背景知识，不是任务** ——
*    没有收尾指令时，模型会自作主张地"用上"它们（去读正文、去改库、去补全）。
* ⚠️ **放在渲染函数末尾** ⇒ 保证每个变体都带上。
*/
const ACTIVE_CLOSING_INSTRUCTION = `---

⭐ **以上是背景知识，不是任务**；结合上述知识继续当前工作。`;
const ACTIVE_HEADER = "⭐ **以下是知识库里与当前工作相关的知识（主动召回）。**";
const ACTIVE_BODY_HINT = "只给标题与描述，**正文按需读** —— 用 `memj_read` 传 `id`。";
registerPromptDefault("active:closing", ACTIVE_CLOSING_INSTRUCTION);
registerPromptDefault("jev:candidate", JEV_CANDIDATE_INSTRUCTION);
registerPromptDefault("jev:need", JEV_NEED_INSTRUCTION);
registerPromptDefault("jev:sufficient", JEV_SUFFICIENT_INSTRUCTION);
registerPromptDefault("jev:search-intent", JEV_SEARCH_INTENT_INSTRUCTION);
registerPromptDefault("active:header", ACTIVE_HEADER);
registerPromptDefault("active:body-hint", ACTIVE_BODY_HINT);
/**
* ⭐⭐ **渲染注入文本**（由 **memj 自己**渲染，不靠模型排版 —— §6.2）。
*
* ⚠️ 用的是**清单里那份中文 title/desc** ⇒ **逐字一致**，不会漂移、不会编造。
* @param picks - 选中的条目。
* @param note - 可选的前置说明（如"本次是主动召回"）。
*/
function renderActiveInjection(picks, note = "") {
	if (picks.length === 0) return "";
	const parts = [];
	parts.push(promptText("active:header", ACTIVE_HEADER));
	parts.push(promptText("active:body-hint", ACTIVE_BODY_HINT));
	parts.push("");
	for (const c of picks) {
		const kind = c.kind === "" ? "" : ` [${c.kind}]`;
		parts.push(`- \`${c.id}\`${kind} **${c.title}** — ${c.desc}`);
	}
	if (note !== "") {
		parts.push("");
		parts.push(note);
	}
	parts.push("");
	parts.push(promptText("active:closing", ACTIVE_CLOSING_INSTRUCTION));
	return parts.join("\n");
}
//#endregion
//#region src/recall-log.ts
/**
* ⭐⭐ **主动召回的调用日志**（2026-09-27 新增；用户要求）。
*
* 用户原话：*"主动召回注入有专门的日志吗？我觉得应该要维护个日志记录每次得调用详情，
* 不然调试起来太麻烦了。"*
*
* 🔴🔴 **为什么必须有**（本模块存在的全部理由）：
*    在此之前，召回的结论**只在内存里**（`active-inject.ts` 的 `activeState.last`）——
*    ⚠️ 于是有**三重丢失**，实测每一条都让排障变猜：
*      ① **重启即失**（纯内存）；
*      ② ⭐ `last` 只留**最近一次** ⇒ 一个 turn 有 5~8 个 step，前几次被覆盖后**永久丢失**
*         （实测会话 `2b809b4a` 的 turn 6：`callsUsed=3` 却查不出那 3 次各是什么结论）；
*      ③ ⭐⭐ **三个总控分数**（`need` / `sufficient` / `search_intent`）**算完就丢** ——
*         而调阈值最需要的正是它们的**分布**。
*    ⇒ 实测代价：用户报"看不到注入"时，只能**解压会话日志反推**（插件自己什么都没记）。
*
* ⭐ **三档内容**（用户 2026-09-27 明确要求 **A+B+C 都要**）：
*    · **A 结论** —— `kind` / `detail` / 条数 / 耗时 / **三个分数** / **当时的阈值快照**；
*    · **B 请求快照** —— 真正发给 JEV 的 `state`（上下文 + 候选）与 `questions` 键，
*      ⇒ **可以重放**（复现"同一条上下文为什么得这个分"）；
*    · **C 注入正文** —— 真的注进会话的那段文本（`renderActiveInjection` 的产物）。
*
* ⭐⭐ **两种事件分开写**（`event` 字段）——**别合成一条**：
*    · `'recall'`：**每次召回尝试**都写（含 suppressed / skipped —— 那正是最该看的）；
*    · `'inject'`：**真的注进去了**才写（带正文）。
*    ⚠️ 合成一条做不到：被抑制的召回**永远不会到达注入点**，
*       而若只在注入点写，就**看不见"为什么没注入"**——那正是排障的主战场。
*    ⇒ 关联方式：同 `turn` + 同 `step`（`inject` 行的 `step` 取其消费时的 step）。
*
* 🔴 **写入纪律**（与 `.startup-diag.txt` 同款，别改）：
*    · **失败绝不影响召回** —— 全程 `try/catch` 吞掉：日志是辅助，不能让它毁掉主流程；
*    · **一行一条 JSON**（jsonl，与 `reads/` / `doc-reads/` 同形态）；
*    · ⚠️ **追加而不是重写** —— 与 `reads/` 的"同轮只留最新"**故意不同**：
*      日志的全部价值就在于**逐次留痕**，去重会让它失去意义
*      （且 `writeTextAtomic` 是"读全部 + 重写"，在日志场景下**会丢并发写**）。
*/
/**
* 追加一条召回日志。
*
* 🔴 **绝不抛**（调用方在召回热路径上 —— 日志坏了不能连累召回）。
* ⚠️ **追加，不是重写**：`appendFile` 保证既有内容不动。
* @param record - 记录（`at` 缺省由调用方补；`sessionId` 必填，它决定文件名）。
*/
async function appendRecallLog(record) {
	try {
		const path = recallLogPath(record.sessionId);
		await mkdir(dirname(path), { recursive: true });
		await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
	} catch {}
}
//#endregion
//#region src/active-inject.ts
/** 排队超过它就丢弃（防跨轮残留）。 */
const QUEUE_TTL_MS = 6e5;
/** 全局单例（**同一进程内共享** —— `api.ts` 的 `/active` 要读它，见 `hotState` 的同款理由）。 */
const activeState = {
	queue: /* @__PURE__ */ new Map(),
	windowPresent: /* @__PURE__ */ new Map(),
	currentTurn: /* @__PURE__ */ new Map(),
	currentStep: /* @__PURE__ */ new Map(),
	last: /* @__PURE__ */ new Map(),
	warned: /* @__PURE__ */ new Set(),
	lastInjection: /* @__PURE__ */ new Map(),
	injectTotals: /* @__PURE__ */ new Map(),
	contextWindows: /* @__PURE__ */ new Map(),
	injections: /* @__PURE__ */ new Map(),
	submitTriggered: /* @__PURE__ */ new Map()
};
/** ⚠️ 仅供测试：清空内存态（**不改磁盘**）。 */
function resetActiveState() {
	for (const v of activeState.queue.values()) clearTimeout(v.timer);
	activeState.queue.clear();
	activeState.windowPresent.clear();
	activeState.currentTurn.clear();
	activeState.currentStep.clear();
	activeState.last.clear();
	activeState.warned.clear();
	activeState.lastInjection.clear();
	activeState.injectTotals.clear();
	activeState.contextWindows.clear();
	activeState.injections.clear();
	activeState.submitTriggered.clear();
}
/**
* 本 turn 还能不能**注入**（🔴 2026-09-27：只对**真正注进去**的计数）。
*
* ⭐⭐ **口径改了**（用户原话：*"每轮最多 3 次注入，没有注入的不算次数。"*）：
*    旧口径 = "最多调 3 次召回模型" ⇒ 一个 turn 前几步只要全是"没选出条目"，
*    额度就**在真正需要知识的那几步之前耗光**（实测会话 `2b809b4a` 的 turn 6 正是如此）。
*    新口径 = 只有**真把知识注进会话**才 +1。
* @param sid - 会话 id。
* @param turn - 当前 turn。
* @param config - 配置（上限经 {@link maxInjectionsPerTurn} 解析，含旧键回落）。
* @returns 剩余可注入次数。
*/
function injectionsLeft(sid, turn, config) {
	const cur = activeState.injections.get(sid);
	const used = cur !== void 0 && cur.turn === turn ? cur.n : 0;
	return maxInjectionsPerTurn(config) - used;
}
/** 记一次**真正发生的注入**（⚠️ 只有真注进去了才调它）。 */
function noteInjection(sid, turn) {
	const cur = activeState.injections.get(sid);
	activeState.injections.set(sid, cur !== void 0 && cur.turn === turn ? {
		turn,
		n: cur.n + 1
	} : {
		turn,
		n: 1
	});
}
/**
* ⭐⭐ **判断"这次思考结束"**（§5.2 严格 / 宽松）。
*
* | 口径 | 判据 | 触发面 |
* |---|---|---|
* | **严格**（默认） | `chunk.type==='block-end' && chunk.block?.type==='reasoning'` | 约 **69%** 的 step；⚠️ **不输出思考的模型永不触发** |
* | 宽松 | 上面那条 **或** 首个 `text-delta` | 几乎每步 |
*
* ⚠️ 宽松口径下**必须防重复触发**：一个 step 里 `reasoning` 和 `text` 都可能出现
*    ⇒ 由调用方用 `thoughtEnded` 标志位收口（首次命中即置位）。
* ⚠️ **块类型在 `chunk.block.type`**（不是 `chunk.blockType`）。
* @param chunk - 流式 chunk。
* @param strict - 严格档。
* @returns 是否判定"思考结束"。
*/
function isThoughtEnd(chunk, strict) {
	const c = chunk;
	if (c === void 0 || c === null) return false;
	if (c.type === "block-end" && c.block?.type === "reasoning") return true;
	if (!strict && c.type === "text-delta") return true;
	return false;
}
/** 从 chunk 里取本次思考的**完整文本**（`block-end` 的 `chunk.block` 是完整块）。 */
function reasoningTextOf(chunk) {
	const c = chunk;
	if (c?.type === "block-end" && c.block?.type === "reasoning" && typeof c.block.text === "string") return c.block.text;
	return "";
}
/** 累加 `reasoning-delta`（§6.5 的另一种攒法）。 */
function deltaTextOf(chunk) {
	const c = chunk;
	if (c?.type === "reasoning-delta" && typeof c.text === "string") return c.text;
	return "";
}
/**
* ⭐⭐ **挂上主动注入的两个钩子**（`index.ts` 在依赖就绪后调用）。
*
* ⚠️ **总开关关着时不挂任何钩子** ⇒ 关掉时**零开销**，也不在别人的事件链上占位。
* 🔴 **失败绝不影响主流程**：两条链路各自 `try/catch` 到底
*    （钩子里的异常会毁掉整个轮次）。
* @returns ⭐ **是否真的挂上了钩子** —— 调用方拿它写诊断。
*   🔴 **为什么必须回一个布尔**：`index.ts` 里那句 `diag('active-injection-registered')`
*   是**无条件**打的，开关关着时也会打 ⇒ 它**证明不了钩子挂上了**
*   （本项目铁律：**"什么都没发生"不能靠自觉** —— 那正是"假绿"）。返回值让诊断能区分。
*/
function registerActiveInjection(opts) {
	const { ctx, config } = opts;
	if (!config.activeInject) return false;
	const log = (m) => {
		try {
			ctx.logger?.info?.(`[dsh-memj/active] ${m}`);
		} catch {}
	};
	const warn = (m) => {
		try {
			ctx.logger?.warn?.(`[dsh-memj/active] ${m}`);
		} catch {}
	};
	ctx.on("llm/stream", async function* (options, next) {
		const sid = typeof options?.sessionId === "string" ? options.sessionId : "";
		const isSessionStep = sid !== "" && options?.purpose === void 0;
		if (isSessionStep && Array.isArray(options?.messages)) {
			try {
				activeState.windowPresent.set(sid, snapshotWindow(options.messages));
			} catch (err) {
				warn(`窗口快照失败：${String(err)}`);
			}
			try {
				const cw = await resolveContextWindow(ctx, options, activeState.contextWindows.get(sid));
				if (typeof cw === "number" && cw > 0) activeState.contextWindows.set(sid, cw);
			} catch {}
		}
		let acc = "";
		let thoughtEnded = false;
		for await (const chunk of next()) {
			if (isSessionStep) {
				const d = deltaTextOf(chunk);
				if (d !== "") acc += d;
				const full = reasoningTextOf(chunk);
				if (full !== "") acc = full;
				if (!thoughtEnded && isThoughtEnd(chunk, config.activeInjectStrict)) {
					thoughtEnded = true;
					runRecall({
						ctx,
						config,
						sid,
						turn: activeState.currentTurn.get(sid) ?? -1,
						step: activeState.currentStep.get(sid) ?? -1,
						messages: options.messages,
						reasoning: acc,
						contextWindow: activeState.contextWindows.get(sid),
						trigger: "reasoning",
						log,
						warn
					});
				}
			}
			yield chunk;
		}
	});
	ctx.on("agent/pre-step", async (payload, next) => {
		const sid = typeof payload?.agent?.id === "string" ? payload.agent.id : "";
		const turn = typeof payload?.turn === "number" ? payload.turn : void 0;
		const stepRaw = payload?.step;
		const step = typeof stepRaw === "number" ? stepRaw : void 0;
		try {
			if (sid !== "" && turn !== void 0) activeState.currentTurn.set(sid, turn);
			if (sid !== "" && step !== void 0) activeState.currentStep.set(sid, step);
		} catch {}
		const decision = await next();
		try {
			if (sid !== "" && turn !== void 0 && decision !== void 0 && decision.kind === "enter") {
				if (activeState.submitTriggered.get(sid) !== turn) {
					const userText = extractUserSubmit(payload.messages ?? [], config.activeInjectReasoningMaxChars);
					if (userText !== "") {
						activeState.submitTriggered.set(sid, turn);
						log(`${sid} 提交触发：用户输入 ${userText.length} 字符 ⇒ 发起召回`);
						runRecall({
							ctx,
							config,
							sid,
							turn,
							step: step ?? -1,
							messages: Array.isArray(decision.messages) ? decision.messages : payload.messages,
							reasoning: userText,
							contextWindow: activeState.contextWindows.get(sid),
							trigger: "submit",
							log,
							warn
						});
					}
				}
			}
		} catch (err) {
			warn(`提交触发失败：${String(err)}`);
		}
		try {
			if (sid === "" || decision === void 0 || decision.kind !== "enter") return decision;
			const item = activeState.queue.get(sid);
			if (item === void 0) return decision;
			if (turn !== void 0 && item.turn !== turn) {
				clearTimeout(item.timer);
				activeState.queue.delete(sid);
				log(`过期丢弃 ${sid}（排队 turn=${item.turn} ≠ 当前 turn=${turn}）`);
				return decision;
			}
			const messages = decision.messages;
			if (!Array.isArray(messages)) return decision;
			clearTimeout(item.timer);
			activeState.queue.delete(sid);
			const present = activeState.windowPresent.get(sid);
			const fresh = item.picks.filter((c) => !(present?.has(c.id) ?? false));
			if (fresh.length === 0) {
				activeState.last.set(sid, {
					at: (/* @__PURE__ */ new Date()).toISOString(),
					turn: item.turn,
					kind: "empty",
					detail: "选中的条目全都还在窗口里 ⇒ 不重复注入",
					injected: [],
					ms: 0,
					batched: false,
					evaluated: 0,
					pool: 0,
					counted: item.counted
				});
				log(`${sid} 选中 ${item.picks.length} 条但全在窗口里 ⇒ 本次不注入`);
				return decision;
			}
			const text = renderActiveInjection(fresh);
			if (text === "") return decision;
			messages.push({
				id: `memj-active-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
				role: "user",
				content: [{
					type: "text",
					text
				}],
				source: {
					kind: "plugin:dsh-memj",
					form: "instructions"
				}
			});
			noteInjection(sid, item.turn);
			const counted = true;
			activeState.last.set(sid, {
				at: (/* @__PURE__ */ new Date()).toISOString(),
				turn: item.turn,
				kind: "injected",
				detail: `注入 ${fresh.length} 条（召回 ${item.ms}ms）`,
				injected: fresh.map((c) => c.id),
				ms: item.ms,
				batched: item.batched,
				evaluated: item.evaluated,
				pool: item.pool,
				counted
			});
			const rec = {
				at: (/* @__PURE__ */ new Date()).toISOString(),
				turn: item.turn,
				kind: "injected",
				detail: `注入 ${fresh.length} 条（召回 ${item.ms}ms）`,
				injected: fresh.map((c) => c.id),
				ms: item.ms,
				batched: item.batched,
				evaluated: item.evaluated,
				pool: item.pool,
				counted
			};
			activeState.lastInjection.set(sid, rec);
			const tot = activeState.injectTotals.get(sid);
			activeState.injectTotals.set(sid, {
				times: (tot?.times ?? 0) + 1,
				entries: (tot?.entries ?? 0) + fresh.length,
				at: rec.at
			});
			appendRecallLog({
				event: "inject",
				at: (/* @__PURE__ */ new Date()).toISOString(),
				sessionId: sid,
				turn: item.turn,
				step: activeState.currentStep.get(sid) ?? -1,
				channel: config.activeInjectChannel,
				model: config.activeInjectModel,
				scope: config.activeInjectScope,
				count: fresh.length,
				ids: fresh.map((c) => c.id),
				text
			});
			log(`${sid} 已注入 ${fresh.length} 条（${text.length} 字符）`);
		} catch (err) {
			warn(`注入失败：${String(err)}`);
		}
		return decision;
	});
	ctx.on("agent/turn-stopping", async (payload) => {
		try {
			const sid = payload?.agent?.id ?? "";
			if (sid === "") return;
			const q = activeState.queue.get(sid);
			if (q !== void 0 && (payload?.turn === void 0 || q.turn === payload.turn)) {
				clearTimeout(q.timer);
				activeState.queue.delete(sid);
			}
		} catch {}
	});
	return true;
}
/**
* ⭐ 给"实时状态"页用的只读快照（**最近一次召回**）。
*
* ⚠️ 它与 {@link lastInjectionOf} 是**两件事**：这个是"最近一次判断"，
*    那个是"最近一次真的注进去"（前者会被后续召回覆盖、后者不会）。
* @param sid - 会话 id。
* @returns 最近一次召回；没有时 `undefined`。
*/
function activeSnapshot(sid) {
	return activeState.last.get(sid);
}
/**
* ⭐ **最近一次真的注入**（不会被后续召回覆盖 —— 见 `lastInjection` 的注释）。
* @param sid - 会话 id。
*/
function lastInjectionOf(sid) {
	return activeState.lastInjection.get(sid);
}
/** 本会话累计注入（次数 / 条数 / 时刻）；一次都没注入过时 `undefined`。 */
function injectTotalsOf(sid) {
	return activeState.injectTotals.get(sid);
}
/**
* 本 turn 已**真正注入**的次数（页面显示"额度用了几个"）。
*
* 🔴 2026-09-27：口径从"调用次数"改成"**注入次数**"（用户原话：
* *"每轮最多 3 次注入，没有注入的不算次数。"*）⇒ 函数名与语义同步改。
* @param sid - 会话 id。
*/
function activeInjectionsUsed(sid) {
	return activeState.injections.get(sid)?.n ?? 0;
}
/**
* 从出网消息里挑出"已出现的封面 id"。
*
* ⭐ **共用 `UUID_SCAN`**（与热知识看门狗同一份"什么算一个封面 id"的定义）——
*  ⚠️ 与 `fingerprintsInText` 的**用法不同**：那边是"**给定的**一批 id 里哪些出现了"，
*  这边是"**所有**出现过的 id 是哪些"（哨兵只需排除，不需要预设列表）。
*  两者共用形状定义，但**不能共用一个函数**（一个是求交、一个是全扫）。
* ⚠️ 已知"假阳性"（**不是 bug，别去修**）：别的插件注入的 uuid 也会被扫进来 ——
*  但那只会让我们**少注入一次**（保守方向），不会注入错东西。
* @param messages - `options.messages` 快照。
* @returns 出现的全部 uuid 形状串。
*/
function snapshotWindow(messages) {
	const found = /* @__PURE__ */ new Set();
	for (const m of messages) {
		const content = m?.content;
		if (!Array.isArray(content)) continue;
		for (const b of content) {
			const t = b?.text;
			if (typeof t !== "string" || t === "") continue;
			for (const hit of t.matchAll(UUID_SCAN)) found.add(hit[0]);
		}
	}
	return found;
}
/**
* ⭐⭐⭐ **从这一步的消息里挑出"用户刚从输入框提交的那段话"**（2026-09-29 新增）。
*
* 用户裁定（原话）：*"之前是只在思考后去调用。我需要加个情况，就是用户从输入框
* submit 后，也要用用户的输入内容作为判据去调用一次。"*
*
* ── 判据为什么是 `source.kind === 'user'`（实测确认，不是推断）─────────────
* 真实会话日志里 `user/message` 的 `source` 只有两类：
* ```jsonc
* // ① 真人从输入框提交
* {"kind":"user","rpcId":"…","clientTimeZone":"Asia/Shanghai"}
* // ② 插件注入（含 memj 自己的热知识/主动注入）
* {"kind":"plugin","plugin":"dsh-memj","form":"instructions"}
* {"kind":"plugin","plugin":"@deepseek-ai/dsh-system-prompt","form":"snapshot",…}
* {"kind":"plugin","plugin":"user-approval"}
* // ③ 别的 agent 来的
* {"kind":"agent-message","form":"relay","senderSessionId":"…"}
* {"kind":"subagent-settled","form":"notice","summary":"…"}
* ```
* ⇒ ⭐ **`kind === 'user'` 就是"真人提交"**（`rpcId` 是客户端请求 id，只有真人点提交才有）。
* 🔴 **不能用"消息里有文字"当判据** —— 插件注入的也都是 user 角色的文本，
*    那样会把**我们自己注入的热知识**当成用户输入，**每次都自我触发**。
*
* ⚠️ **只取本步新增的**：`payload.messages` 是"**这一步被 claim 的**消息"
*    （类型定义：*"messages removed from the inbox for this step"*），
*    所以它天然只含本次提交的内容 + 同批的插件注入。
*
* @param messages - `agent/pre-step` 的 `payload.messages`。
* @param maxChars - 截断上限（判据要进召回输入，会挤预算）。
* @returns 用户输入的纯文本；没有则空串。
*/
function extractUserSubmit(messages, maxChars) {
	const parts = [];
	for (const m of messages) {
		const o = m;
		if (o?.role !== "user") continue;
		if (o.source?.kind !== "user") continue;
		if (!Array.isArray(o.content)) continue;
		for (const b of o.content) {
			const t = b?.type;
			const txt = b?.text;
			if (t === "text" && typeof txt === "string" && txt.trim() !== "") parts.push(txt.trim());
		}
	}
	if (parts.length === 0) return "";
	const joined = parts.join("\n\n");
	return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}
/** 跑一次召回并入队（**fire-and-forget**，绝不抛）。 */ async function runRecall(opts) {
	const { ctx, config, sid, turn, step } = opts;
	/**
	* ⭐⭐ **当时的阈值快照**（召回日志用）—— 见 `RecallThresholds` 的注释：
	*    日志是跨版本的长期文件，只记分数不记阈值 ⇒ **日后无法复核那次判断按什么标准做的**。
	*/
	const thresholds = {
		needMin: needMinOf(config),
		itemMin: itemMinOf(config),
		searchIntentMin: config.activeInjectSearchIntentMin,
		sufficientMin: config.activeInjectSufficientMin
	};
	/**
	* ⭐⭐ **写一条召回日志**（A 档：结论 + 三个分数 + 阈值快照）。
	*
	* 🔴 **每次都写，含"没注入"的那些** —— 那正是排障的主战场
	*    （用户实测的两次都是 `suppressed`；若只在注入时写，就**什么都看不见**）。
	* ⚠️ `void`：日志是 fire-and-forget，**绝不拖慢也不影响召回**（`appendRecallLog` 内部吞异常）。
	*/
	const logRecall = (kind, detail, extra = {}) => {
		appendRecallLog({
			event: "recall",
			at: (/* @__PURE__ */ new Date()).toISOString(),
			sessionId: sid,
			turn,
			step,
			channel: config.activeInjectChannel,
			model: config.activeInjectModel,
			scope: config.activeInjectScope,
			...opts.trigger !== void 0 ? { trigger: opts.trigger } : {},
			kind,
			detail,
			...outScores !== void 0 ? { scores: outScores } : {},
			evaluated: extra.evaluated ?? 0,
			pool: extra.pool ?? 0,
			batched: extra.batched ?? false,
			ms: extra.ms ?? 0,
			picked: (extra.injected ?? []).slice(),
			counted: extra.counted ?? false,
			thresholds,
			...outRequest !== void 0 ? { request: outRequest } : {}
		});
	};
	let outScores;
	let outRequest;
	const put = (detail, kind, extra = {}) => {
		if (turn >= 0) activeState.last.set(sid, {
			at: (/* @__PURE__ */ new Date()).toISOString(),
			turn,
			kind,
			detail,
			injected: [],
			ms: 0,
			batched: false,
			evaluated: 0,
			pool: 0,
			counted: false,
			...extra
		});
		logRecall(kind, detail, extra);
	};
	try {
		if (turn >= 0 && injectionsLeft(sid, turn, config) <= 0) {
			put(`本 turn 注入已达上限 ${maxInjectionsPerTurn(config)} 次`, "skipped");
			return;
		}
		const out = await recall({
			ctx,
			config,
			project: (await resolveProject(ctx, sid)).project,
			messages: opts.messages,
			currentReasoning: opts.reasoning,
			contextWindow: opts.contextWindow
		});
		outScores = out.scores;
		outRequest = out.request;
		const base = {
			ms: out.ms,
			batched: out.batched,
			evaluated: out.evaluated,
			pool: out.pool,
			counted: false
		};
		if (out.need && out.picks.length > 0) {
			const prev = activeState.queue.get(sid);
			if (prev !== void 0) clearTimeout(prev.timer);
			const timer = setTimeout(() => {
				activeState.queue.delete(sid);
			}, QUEUE_TTL_MS);
			try {
				timer.unref?.();
			} catch {}
			activeState.queue.set(sid, {
				picks: out.picks,
				turn,
				at: (/* @__PURE__ */ new Date()).toISOString(),
				timer,
				...base
			});
			put(`选中 ${out.picks.length} 条，待注入`, "queued", base);
			opts.log(`${sid} 召回命中 ${out.picks.length} 条（${out.ms}ms，评估 ${out.evaluated}/${out.pool}${out.batched ? "，已按预算裁" : ""}）`);
			return;
		}
		if (out.suppressed !== "") {
			put(out.suppressed, "suppressed", base);
			opts.log(`${sid} 召回被抑制：${out.suppressed}（额度不计）`);
			return;
		}
		put(out.skipped !== "" ? out.skipped : "模型未选出条目", "skipped", base);
	} catch (err) {
		opts.warn(`召回失败：${String(err)}`);
	}
}
//#endregion
//#region src/gate.ts
/** 本插件要拦的工具名（只拦自己的，不碰别的插件）。 */
const HANDOFF_TOOL = "memj_handoff";
/** 从 `exec.arguments` 里安全地取一个对象字段。 */
function field(args, key) {
	if (typeof args !== "object" || args === null) return void 0;
	return args[key];
}
/**
* ⭐ 对 `memj_handoff` 的入参做**纯形状校验**（不读库、不抛异常）。
*
* 只查 schema 表达不了的：长度 / 格式 / 正则。
* ⚠️ **不查** `step` 与参数的一致性——那条要看库状态（新项目时 `projectDesc` 例外），
* 留在 `runHandoff` 内（§3.11.6）。
* @param args - 工具入参。
* @returns 拒绝理由（`undefined` = 放行）。
*/
function gateHandoffArgs(args) {
	const project = field(args, "project");
	if (typeof project !== "string" || project.trim() === "") return "`project` 不能为空（或只有空白字符）。";
	const rawStep = field(args, "step");
	if (rawStep !== void 0) {
		const plan = planSteps(rawStep);
		if (plan.error !== void 0) return plan.error;
	}
	const issues = checkKnowledgeShape(field(args, "entries"), field(args, "adopt"));
	if (issues.length > 0) return "参数形状校验未通过（**工具体未执行**，无需重新读库）：\n" + issues.map((s, i) => `${i + 1}. ${s}`).join("\n") + "\n\n修正后重调即可。";
}
/**
* ⭐⭐ **后置自愈：检查"看起来成功、其实半套"的结果**（决策 103 / §3.11.4）。
*
* ── 它解决什么 ──────────────────────────────────────────────────────────────
* `pre-execute` 只能拦**参数形状**；而有一类错误**只有跑完才知道**：
* 比如"新建了主题，却没有任何知识挂到它"——主题白建（聚合能力为 0）。
* 这类错误**可数、确定**（§3.9 的既有哲学），但光看回执里的"成功"发现不了。
*
* ⚠️ **只做"确定且罕见"的检查**，绝不猜语义——
* `block` 会把一次**已经成功**的调用翻成错误、要求模型重做，
* **误报的代价很高**。⇒ 规则必须窄。
*
* ── 当前唯一的规则 ──────────────────────────────────────────────────────────
* **本次既新建了主题、又落了知识，但那些知识一条都没挂到新主题上。**
* ⚠️ 只在**同一次调用里**两边都有时才判——跨调用无法可靠归因
* （知识可能在上一轮就挂好了）。
* @param args - 工具入参。
* @param value - 工具的成功返回值（`output.schema` 声明的形状）。
* @returns 需要模型重做时给出的反馈；`undefined` = 放行。
*/
function selfCheckHandoffResult(args, value) {
	if (typeof value !== "object" || value === null) return void 0;
	const v = value;
	if (v.ok !== true) return void 0;
	const created = Array.isArray(v.createdThemes) ? v.createdThemes : [];
	if (created.length === 0) return void 0;
	const entries = field(args, "entries") ?? [];
	const adopt = field(args, "adopt") ?? [];
	const provided = [...entries, ...adopt];
	if (provided.length === 0) return void 0;
	const attached = /* @__PURE__ */ new Set();
	for (const item of provided) for (const t of item.theme ?? []) attached.add(t);
	const dangling = created.filter((t) => !attached.has(t));
	if (dangling.length === created.length && dangling.length > 0) return `你新建了主题 ${created.map((t) => `\`${t}\``).join("、")}，但本次落盘的 ${provided.length} 条知识**一个都没挂到这些主题上**。\n⚠️ 这个主题目前是**空的**——它聚合不到任何知识。
请二选一后重调：
  · 把 \`entries[].theme\` 填上刚建的主题 id（若确实属于它）；
  · 或者这次先别建主题（从 \`newThemes\` 里去掉），等有知识挂它时再建。`;
}
/**
* 注册 host 侧闸门。
*
* ⚠️ **只拦 `memj_handoff`**——其它工具（search/read/...）是本插件自己的读工具，
* 参数简单，没必要加一道。
* @param deps - 依赖。
* @returns 卸载函数（正常情况下由 `ctx.effect` 托管，无需手工调用）。
*/
function registerGate(deps) {
	const { ctx } = deps;
	const disposers = [];
	try {
		const off = ctx.on("tools/pre-execute", async (exec, next) => {
			if (exec.name !== HANDOFF_TOOL) return await next();
			const reason = gateHandoffArgs(exec.arguments);
			if (reason !== void 0) return {
				kind: "deny",
				reason
			};
			return await next();
		});
		disposers.push(off);
	} catch (err) {
		ctx.logger?.error?.("dsh-memj: pre-execute 闸门注册失败（将退化为仅工具内校验）: %o", err);
	}
	try {
		const off = ctx.on("tools/post-execute", async (exec, result, next) => {
			if (exec.name !== HANDOFF_TOOL) return await next();
			if (result.isError === true) return await next();
			const feedback = selfCheckHandoffResult(exec.arguments, result.value);
			if (feedback === void 0) return await next();
			return {
				kind: "block",
				feedback: [{
					type: "text",
					text: feedback
				}]
			};
		});
		disposers.push(off);
	} catch (err) {
		ctx.logger?.error?.("dsh-memj: post-execute 自愈注册失败（将退化为仅回执警告）: %o", err);
	}
	return () => {
		for (const d of disposers) try {
			d();
		} catch {}
	};
}
//#endregion
//#region src/prompt-writeback.ts
/**
* ⭐⭐⭐ **写回源码**：把【提示词】设置页的当前生效文本，固化进 `src/*.ts` 的常量。
*
* ── 这个功能解决什么 ────────────────────────────────────────────────────────
* 运行期取值的优先级是 `覆盖值 ?? 源码默认值`（见 `prompts.ts` 的 `promptText`）。
* ⇒ 页面上改的东西**只活在库里的 `overrides.json`**：
*   · 换机器 / 拷库漏了 → 丢；
*   · 点「恢复默认」→ **静默退回旧措辞**；
*   · 想给别人 → 得手工抄。
* ⇒ 本模块把编辑**固化回源码**，让它进版本库、成为新的默认值。
*
* 🔴🔴 **它不改变任何运行时行为**（2026-10-12 用户确认的判据）：
*   运行期永远读覆盖层 ⇒ 写回**不需要重启即已"生效"**（本来就在生效）。
*   它改变的是**"这条编辑的归属"**——从库里的临时覆盖，变成源码里的正式默认值。
*   ⚠️ 所以界面上的措辞必须说清这一点，**不要让用户以为"不重启就没生效"**。
*   ⭐ 唯一的例外是**命令描述**（`hotReload: 'restart'`）：它**本来就要重启才生效**
*     （`dsh-commands` 注册时固化 descriptor，没有 getter 通路）。
*
* 🔴 **保留覆盖项**（用户 2026-10-12 裁定）：写回后**不删** `overrides.json` 里那条。
*   理由：写回是"固化"，不是"撤掉覆盖"。删了会让生效来源突然切换
*   （虽然文本相同、行为一样，但"我在页面上改的那个值还在不在"会变得难以回答）。
*   ⚠️ 代价：下次改**源码**时，覆盖项仍会挡住它 ⇒ 界面必须显示三态让这件事可见
*     （`未改` / `已改未写回` / `已写回`）。
*
* ⚠️ **它写的是插件仓，不是库**——与本项目"用户数据只进库根"的边界相反。
*   这是**有意的例外**：本功能的语义就是"把库里的编辑搬进交付物"。
*   因此它**只在用户点按钮时**发生，**绝不自动**。
*
* @module dsh-memj/prompt-writeback
*/
/** 反引号（避免在模板串里直接写它）。 */
const BT = String.fromCharCode(96);
/**
* 把文本转义成可放进**字符串字面量**的形式。
*
* ⚠️ **按引号类型分叉**（两者的危险字符不同，转义规则不能混）：
*   · **模板串**：`\` 反斜杠、`` ` `` 反引号（会提前闭合）、`${`（会被当插值）；
*   · **单引号串**：`\` 反斜杠、`'` 单引号、**换行**（单引号串不能跨行 ⇒ 必须转成 `\n`）。
* ⚠️ 顺序重要：**先反斜杠**，否则后两步新引入的反斜杠会被二次转义。
* @param text - 原文本。
* @param quote - 目标引号（`` ` `` 或 `'`）。
* @returns 可安全嵌入该字面量的文本。
*/
function escapeForLiteral(text, quote) {
	let out = text.replace(/\\/g, "\\\\");
	if (quote === BT) out = out.replace(new RegExp(BT, "g"), "\\`").replace(/\$\{/g, "\\${");
	else out = out.replace(/'/g, "\\'").replace(/\n/g, "\\n");
	return out;
}
/**
* 在源码里定位一个「字符串常量」的值正文范围——支持**三种**实际形态。
*
* ── 实测遇到的三种形态（`src/` 里真实存在）────────────────────────────────
* 1. **模板串**：`export const X = \`...\``（`protocol.ts` / `tool-descriptions.ts` …）
* 2. **单引号串**：`export const X = '...'`
* 3. ⭐ **值在下一行**：`export const X =\n  '...'`
*    ⚠️ 这是**实测踩到的真 bug**：第一版正则要求 `=` 后**紧跟**引号，
*    于是 `active-recall.ts` 里那几条（`JEV_NEED_INSTRUCTION` 等）**永远定位不到**，
*    写回直接报 `not-found`。
*
* ⚠️ **不用正则跨行匹配正文**：正文里可能含转义引号（`\'` / `` \` ``），
*   正则会**提前收尾**（本项目记过这个坑：`indexOf` 找收尾遇到转义反引号
*   会截断错位、报出"7 处不一致"的假漂移）⇒ 必须**逐字符扫描并跳过转义**。
*
* ⚠️ **只支持单段字面量**：形如 `'a' + 'b'` 的多段拼接**不支持**
*   （替换它要重排多行、风险高）⇒ 返回 `undefined`，由调用方报"不支持写回"，
*   **绝不半改**（改一半会让源码语法坏掉）。
* @param src - 源文件全文（已把 CRLF 归一为 LF）。
* @param constName - 常量名。
* @returns `{ bodyStart, bodyEnd, quote }`——正文首尾下标与引号字符；不支持 ⇒ `undefined`。
*/
function locateTemplateBody(src, constName) {
	const m = new RegExp("(?:^|\\n)(?:export )?const " + constName + "\\s*(?::[^=\\n]+)?=\\s*").exec(src);
	if (m === null) return void 0;
	let i = m.index + m[0].length;
	while (i < src.length && (src[i] === " " || src[i] === "	" || src[i] === "\n" || src[i] === "\r")) i += 1;
	const quote = src[i];
	if (quote !== BT && quote !== "'") return void 0;
	const bodyStart = i + 1;
	let j = bodyStart;
	while (j < src.length) {
		const ch = src[j];
		if (ch === "\\") {
			j += 2;
			continue;
		}
		if (ch === quote) {
			let k = j + 1;
			while (k < src.length && /\s/.test(src[k] ?? "")) k += 1;
			if (src[k] === "+") return void 0;
			return {
				bodyStart,
				bodyEnd: j,
				quote
			};
		}
		if (ch === "\n") {
			if (quote === "'") return void 0;
		}
		j += 1;
	}
}
/**
* 把**字面量正文**还原成运行时文本（反转义）。
*
* ⚠️ 必须还原，否则"源码里的值 vs 当前值"比较会**永远不相等**，
*   于是每次写回都重写文件（幂等性坏掉、且 `already-same` 永不触发）。
*
* 🔴🔴 **反转义必须按 JS 的规则做，不能只处理自己转义的那几个字符**：
*   源码里本来就可能含 `\n`（转义的换行，非模板串形态常见）——
*   若不还原它，比较时会把"一个换行"与"两个字符 `\` `n`"判成不同 ⇒ **假不等**。
*   ⭐ 判据：**转义/反转义是一对，写这一侧时必须想到对侧**。
* @param body - 字面量内部原文。
* @param quote - 该字面量的引号。
* @returns 运行期文本。
*/
function unescapeFromTemplate(body, quote = BT) {
	let out = body;
	if (quote === BT) out = out.replace(/* @__PURE__ */ new RegExp("\\\\`", "g"), BT).replace(/\\\$\{/g, "${");
	else out = out.replace(/\\'/g, "'");
	out = out.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "	").replace(/\\\\/g, "\\");
	return out;
}
/**
* ⭐⭐ **执行写回**。
*
* 逐条处理；**一条失败不影响其余**（与 `safeRegister` 同一取向：
* 一个坏掉的条目不该让整次操作白费——用户可以只对成功的那几条得到结果）。
*
* @param keys - 要写回的 key 列表（来自设置页的勾选/单选）。
* @returns 汇总结果。
*/
async function writeBackToSource(keys) {
	const root = pluginRoot();
	const items = [];
	/** 文件 → 新内容（同一文件多条改动要累积，不能各自写盘覆盖彼此）。 */
	const pending = /* @__PURE__ */ new Map();
	for (const key of keys) {
		const spec = PROMPT_SPECS.find((s) => s.key === key);
		if (spec === void 0) {
			items.push({
				key,
				status: "not-found",
				message: "设置页里没有这个 key（清单可能已变）"
			});
			continue;
		}
		const constName = spec.sourceConst ?? "";
		if (constName === "") {
			items.push({
				key,
				status: "unsupported",
				message: "该条不支持写回（参数/输出 schema 或值形态不可机械替换）",
				file: spec.sourceFile
			});
			continue;
		}
		const rel = spec.sourceFile;
		const abs = join(root, rel);
		let src;
		try {
			src = (pending.get(rel) ?? readFileSync(abs, "utf8")).replace(/\r\n/g, "\n");
		} catch (err) {
			items.push({
				key,
				status: "error",
				message: `读不到 ${rel}：${err instanceof Error ? err.message : String(err)}`,
				file: rel,
				constName
			});
			continue;
		}
		const loc = locateTemplateBody(src, constName);
		if (loc === void 0) {
			items.push({
				key,
				status: "not-found",
				message: `在 ${rel} 里找不到 \`export const ${constName} = \\\`…\\\`\` 形式（可能已改名或改成了数组）`,
				file: rel,
				constName
			});
			continue;
		}
		const current = promptCurrent(key);
		const inSource = unescapeFromTemplate(src.slice(loc.bodyStart, loc.bodyEnd), loc.quote);
		if (inSource === current) {
			items.push({
				key,
				status: "already-same",
				message: "源码里已经是这个值，无需写回",
				file: rel,
				constName
			});
			continue;
		}
		const nextSrc = src.slice(0, loc.bodyStart) + escapeForLiteral(current, loc.quote) + src.slice(loc.bodyEnd);
		pending.set(rel, nextSrc);
		items.push({
			key,
			status: "written",
			message: `已写入（${inSource.length} → ${current.length} 字符）`,
			file: rel,
			constName
		});
	}
	let filesChanged = 0;
	for (const [rel, content] of pending) try {
		await writeTextAtomic(join(root, rel), content);
		filesChanged += 1;
	} catch (err) {
		const msg = `写盘失败：${err instanceof Error ? err.message : String(err)}`;
		for (const it of items) if (it.file === rel && it.status === "written") {
			it.status = "error";
			it.message = msg;
		}
	}
	const written = items.filter((i) => i.status === "written").length;
	const same = items.filter((i) => i.status === "already-same").length;
	const bad = items.filter((i) => i.status !== "written" && i.status !== "already-same").length;
	const summary = `写回 ${written} 条（改动 ${filesChanged} 个文件）` + (same > 0 ? `，${same} 条已相同` : "") + (bad > 0 ? `，🔴 ${bad} 条失败` : "");
	return {
		ok: bad === 0,
		items,
		filesChanged,
		summary
	};
}
/**
* ⭐⭐ **三态**：判断某条 key 相对源码处于哪种状态（供设置页显示）。
*
* 🔴 **为什么必须有**：写回**保留覆盖项**（用户裁定）⇒ 覆盖值会一直挡着源码。
*   若不显示状态，用户**看不出写回做过没有**，也看不出"我改了源码怎么没生效"。
*
* ⭐ **判据（三态的定义别看错）**：
*   · 没有覆盖项 ⇒ `untouched`（页面值就是源码值，没什么可写回的）；
*   · 有覆盖项，且**覆盖值 == 源码值** ⇒ `written`（写回过了——写回的结果就是这个状态）；
*   · 有覆盖项，且**覆盖值 != 源码值** ⇒ `edited`（改了但还没写回）。
* ⚠️ 第一版把"有覆盖"一律当 `edited`，于是**写回成功后仍显示"已改未写回"**
*   （用户会以为写回没生效）——正是"界面在撒谎"。
* @param key - 稳定键。
* @returns `untouched` 未改 / `edited` 已改未写回 / `written` 已写回 / `unsupported` 不支持。
*/
function writeBackState(key) {
	const spec = PROMPT_SPECS.find((s) => s.key === key);
	if (spec === void 0) return "unsupported";
	const constName = spec.sourceConst ?? "";
	if (constName === "") return "unsupported";
	let src;
	try {
		src = readFileSync(join(pluginRoot(), spec.sourceFile), "utf8").replace(/\r\n/g, "\n");
	} catch {
		return "unsupported";
	}
	const loc = locateTemplateBody(src, constName);
	if (loc === void 0) return "unsupported";
	if (unescapeFromTemplate(src.slice(loc.bodyStart, loc.bodyEnd), loc.quote) === promptCurrent(key)) return hasOverride(key) ? "written" : "untouched";
	return "edited";
}
//#endregion
//#region src/settings.ts
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
const DEFAULT_ENTRY_ID = "memj";
/**
* 包名（`package.json` 的 `name`）——**稳定标识**。
*
* ⚠️ 与 entry id **不是一回事**：本插件的 bundle patch 写的是
* `insert: [{ id: memj, name: dsh-memj }]`。用 `name` 兜底可防"id 被改过"。
*/
const PACKAGE_NAME = "dsh-memj";
/** patch 文件名（与 `dsh-app-boot` 的 `PROFILE_PATCH_FILENAME` 一致）。 */
const PATCH_FILENAME = "cordis.patch.yml";
/**
* 由 `ctx.baseUrl` 解析当前 profile 目录。
* @param baseUrl - `ctx.baseUrl`（形如 `file:///D:/.../profiles/web/`）。
* @returns profile 目录绝对路径；不可用时返回 `''`。
*/
function profileDirFrom(baseUrl) {
	if (typeof baseUrl !== "string" || baseUrl.trim() === "") return "";
	try {
		const href = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
		return fileURLToPath(new URL(".", href));
	} catch {
		return "";
	}
}
/**
* 解析出 patch 文件的绝对路径。
* @param baseUrl - `ctx.baseUrl`。
* @returns 绝对路径；不可用时返回 `''`。
*/
function patchPathFrom(baseUrl) {
	const dir = profileDirFrom(baseUrl);
	if (dir === "") return "";
	try {
		return fileURLToPath(new URL(PATCH_FILENAME, `file:///${dir.replace(/\\/g, "/")}${dir.endsWith("\\") || dir.endsWith("/") ? "" : "/"}`));
	} catch {
		return "";
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
async function readPatchReload(profileDir) {
	if (profileDir === "") return "unknown";
	try {
		const text = await readFile(`${profileDir}package.json`, "utf8");
		const raw = JSON.parse(text).dsh?.profile?.patchReload;
		if (raw === "live" || raw === "startup") return raw;
		return "live";
	} catch {
		return "unknown";
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
function findEntry(doc, entryId) {
	const items = doc.contents?.items;
	if (!Array.isArray(items)) return void 0;
	const getter = (item) => {
		const get = item.get;
		return typeof get === "function" ? (k) => get.call(item, k) : void 0;
	};
	for (const item of items) {
		const g = getter(item);
		if (g !== void 0 && g("id") === entryId) return item;
	}
	for (const item of items) {
		const g = getter(item);
		if (g !== void 0 && g("name") === PACKAGE_NAME) return item;
	}
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
async function readSettings(baseUrl, config, entryId = DEFAULT_ENTRY_ID) {
	const dir = profileDirFrom(baseUrl);
	const patchPath = patchPathFrom(baseUrl);
	const patchReload = await readPatchReload(dir);
	let explicitKeys = [];
	let explicit = {};
	let exists = false;
	let error = "";
	if (patchPath === "") error = "拿不到 profile 路径（ctx.baseUrl 不可用），无法定位 cordis.patch.yml。";
	else try {
		const text = await readFile(patchPath, "utf8");
		exists = true;
		const doc = parseDocument(text);
		if (doc.errors.length > 0) error = `cordis.patch.yml 解析失败：${doc.errors[0]?.message ?? "未知错误"}`;
		else {
			const cfg = findEntry(doc, entryId)?.get?.("config");
			const toJSON = cfg?.toJSON;
			if (typeof toJSON === "function") {
				const obj = toJSON.call(cfg);
				if (obj !== null && typeof obj === "object") {
					explicit = obj;
					explicitKeys = Object.keys(explicit);
				}
			}
		}
	} catch (err) {
		if (err.code === "ENOENT") exists = false;
		else error = `读 cordis.patch.yml 失败：${err instanceof Error ? err.message : String(err)}`;
	}
	return {
		config,
		explicit,
		patchPath,
		patchExists: exists,
		explicitKeys,
		patchReload,
		error
	};
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
function effectiveConfig(r) {
	if (r.explicitKeys.length === 0) return r.config;
	const merged = { ...r.config };
	for (const k of r.explicitKeys) merged[k] = r.explicit[k];
	return merged;
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
async function writeSetting(baseUrl, key, value, entryId = DEFAULT_ENTRY_ID) {
	const dir = profileDirFrom(baseUrl);
	const patchPath = patchPathFrom(baseUrl);
	const needsRestart = await readPatchReload(dir) !== "live";
	if (patchPath === "") return {
		ok: false,
		message: "拿不到 profile 路径（ctx.baseUrl 不可用），未写入任何内容。",
		patchPath: "",
		needsRestart
	};
	let text = "";
	try {
		text = await readFile(patchPath, "utf8");
	} catch (err) {
		if (err.code !== "ENOENT") return {
			ok: false,
			message: `读 ${PATCH_FILENAME} 失败：${err instanceof Error ? err.message : String(err)}`,
			patchPath,
			needsRestart
		};
		text = "";
	}
	let next;
	try {
		const isEmptyStart = text.trim() === "" || text.trim() === "[]";
		const doc = isEmptyStart ? parseDocument("") : parseDocument(text);
		if (doc.errors.length > 0) return {
			ok: false,
			message: `未写入：${PATCH_FILENAME} 当前不是合法 YAML（${doc.errors[0]?.message ?? "未知错误"}）。\n为避免破坏你的文件，本次改动已放弃——请先手工修好该文件。`,
			patchPath,
			needsRestart
		};
		if (doc.contents === null) doc.contents = doc.createNode([], { flow: false });
		else if (isEmptyStart) {
			const c = doc.contents;
			if (c.flow === true) c.flow = false;
		}
		let entry = findEntry(doc, entryId);
		if (entry === void 0) {
			const created = doc.createNode({
				id: entryId,
				config: {}
			});
			doc.contents.add(created);
			entry = created;
		}
		let cfg = entry.get("config");
		if (cfg === null || cfg === void 0) {
			entry.set("config", doc.createNode({}));
			cfg = entry.get("config");
		}
		cfg.set(key, value);
		next = doc.toString();
	} catch (err) {
		return {
			ok: false,
			message: `改写失败（未写入）：${err instanceof Error ? err.message : String(err)}`,
			patchPath,
			needsRestart
		};
	}
	try {
		const { writeFile } = await import("node:fs/promises");
		await writeFile(patchPath, next, { encoding: "utf8" });
	} catch (err) {
		return {
			ok: false,
			message: `写 ${PATCH_FILENAME} 失败：${err instanceof Error ? err.message : String(err)}`,
			patchPath,
			needsRestart
		};
	}
	return {
		ok: true,
		message: needsRestart ? `已写入 ${PATCH_FILENAME}。⚠️ 本 profile 的 patchReload 不是 live，**需要重启才生效**。` : `已写入 ${PATCH_FILENAME}，热重载会在数秒内生效。`,
		patchPath,
		needsRestart
	};
}
/** 合法取值（供 API 层校验）。 */
const THEME_CREATION_VALUES = ["strict", "loose"];
/**
* ⭐ `progressCharsWarn` 的合法区间（供 API 层校验）。
*
* ⚠️ 与 `config.ts` 里 schemastery 的 `min(1000).max(1000000)` **必须一致**——
*    两处都是"能不能用"的边界，不一致会让"网页上存得进、插件启动却被拒"。
*/
const PROGRESS_WARN_MIN = 1e3;
const PROGRESS_WARN_MAX = 1e6;
/**
* ⭐⭐ 热知识的取值边界（供 API 层校验）。
*
* ⚠️ 与 `config.ts` 里 schemastery 的约束**必须一致**（同 `PROGRESS_WARN_*` 的理由）：
* 不一致会让"网页上存得进、插件启动却被拒"。
*/
const HOT_RATIO_MIN = 0;
const HOT_RATIO_MAX = 100;
const HOT_CHARS_PER_TOKEN_MIN = .1;
const HOT_CHARS_PER_TOKEN_MAX = 10;
const HOT_BUDGET_MIN = 1e3;
const HOT_BUDGET_MAX = 1e7;
const HOT_FULL_WARN_MIN = 1;
const HOT_FULL_WARN_MAX = 1e6;
const HOT_SESSION_KEEP_MIN = 1;
const HOT_SESSION_KEEP_MAX = 1e4;
/**
* ⭐⭐ 主动注入的取值边界（供 API 层校验；设计文档 §10.1）。
*
* ⚠️ 与 `config.ts` 里 schemastery 的约束**必须一致**（同 `PROGRESS_WARN_*` 的理由）：
*    不一致会让"网页上存得进、插件启动却被拒"。
*/
const ACTIVE_TOP_K_MIN = 1;
const ACTIVE_TOP_K_MAX = 50;
const ACTIVE_BAND_MIN = 0;
const ACTIVE_BAND_MAX = 1;
const ACTIVE_TIMEOUT_MIN = 500;
const ACTIVE_TIMEOUT_MAX = 12e4;
const ACTIVE_CONTEXT_ROUNDS_MIN = 1;
const ACTIVE_CONTEXT_ROUNDS_MAX = 50;
const ACTIVE_POOL_MAX_MIN = 10;
const ACTIVE_POOL_MAX_MAX = 2e3;
const ACTIVE_CALLS_PER_TURN_MIN = 0;
const ACTIVE_CALLS_PER_TURN_MAX = 50;
const ACTIVE_REASONING_MAX_CHARS_MIN = 100;
const ACTIVE_REASONING_MAX_CHARS_MAX = 1e5;
/** 主动注入的**通路**受控两值（§6.1）。 */
const ACTIVE_CHANNEL_VALUES = ["chat", "jev"];
/** 主动注入的**清单范围**受控三值（§6.0）。 */
const ACTIVE_SCOPE_VALUES = [
	"project",
	"project+themes",
	"all"
];
//#endregion
//#region src/api.ts
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
/** 取凭据服务（拿不到 ⇒ `undefined`，调用方各自降级）。 */
function credentialSvc(deps) {
	return deps.getService?.("credentials");
}
/**
* ⭐ **描述一条凭据引用**（**只回事实、永不回值**）。
*
* ⚠️ 拿不到 `describe`（旧运行时 / 服务缺失）⇒ 回 `undefined`，
*    由调用方**降级**（例如只报"有没有值"，不报"能不能写"）——
*    **不要**在这里瞎猜一个 `writable: true`（那会让界面显示一个存不进去的输入框）。
*/
async function describeCredential(deps, name) {
	if (name === "") return void 0;
	try {
		const got = await credentialSvc(deps)?.describe?.(name);
		if (got === void 0) return void 0;
		return {
			configured: got.configured === true,
			source: typeof got.source === "string" ? got.source : "",
			writable: got.writable === true
		};
	} catch {
		return;
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
async function setCredential(deps, name, value) {
	const svc = credentialSvc(deps);
	if (typeof svc?.set !== "function") return {
		ok: false,
		message: "当前运行时不提供凭据写入（拿不到 credentials.set）。可以改用环境变量注入该密钥，或用 profile 的凭据文件。"
	};
	try {
		await svc.set(name, value);
		return {
			ok: true,
			message: "ok"
		};
	} catch (err) {
		const m = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			message: /shadow|read-only|readonly/i.test(m) ? `未能保存：凭据「${name}」当前被一个**只读来源**（如环境变量）遮住，写进去也不会生效。请先移除那个来源，再在这里保存。` : `未能保存密钥：${m}`
		};
	}
}
/** ⭐ **清除凭据**（`unset`；引用缺失时是 no-op）。 */
async function unsetCredential(deps, name) {
	const svc = credentialSvc(deps);
	if (typeof svc?.unset !== "function") return {
		ok: false,
		message: "当前运行时不提供凭据清除（拿不到 credentials.unset）。"
	};
	try {
		await svc.unset(name);
		return {
			ok: true,
			message: "ok"
		};
	} catch (err) {
		const m = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			message: /shadow|read-only|readonly/i.test(m) ? `未能清除：凭据「${name}」被一个只读来源遮住，清除它不会改变解析结果。` : `未能清除密钥：${m}`
		};
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
async function testJevConnection(deps, providerId, modelName) {
	const prov = decisionProvidersOf(deps.config).find((p) => p.id === providerId);
	if (prov === void 0) return {
		ok: false,
		message: `找不到 provider「${providerId}」—— 请先在列表里加一个，或换一个测试。`
	};
	const endpoint = prov.endpoint;
	const model = modelName.trim() !== "" ? modelName.trim() : prov.models[0] ?? "";
	const keyRef = deriveDecisionKeyRef(prov.id);
	const key = await resolveJevKey({ get: (n) => deps.getService?.(n) }, deps.config, keyRef);
	if (key === void 0) return {
		ok: false,
		provider: prov.id,
		endpoint,
		model,
		message: `没有可用密钥（凭据「${keyRef}」与环境变量均为空）。请先在下面保存该 provider 的密钥。`
	};
	if (endpoint.trim() === "") return {
		ok: false,
		provider: prov.id,
		message: "该 provider 的端点为空 —— 请填一个。"
	};
	if (model.trim() === "") return {
		ok: false,
		provider: prov.id,
		endpoint,
		message: "该 provider 下还没有模型 —— 请先加一个模型名。"
	};
	const t0 = Date.now();
	try {
		const res = await fetch(endpoint, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model,
				state: { probe: "connectivity test from the memj settings page" },
				questions: { q0: {
					type: "noul",
					instructions: "Is this a connectivity test?"
				} }
			}),
			signal: AbortSignal.timeout(15e3)
		});
		const ms = Date.now() - t0;
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			return {
				ok: false,
				ms,
				model,
				provider: prov.id,
				endpoint,
				message: `provider「${prov.id}」回了 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ""}。401/403 ⇒ 密钥无效；404 ⇒ 端点路径不对（要 /v1/systemone）。`
			};
		}
		const body = await res.json().catch(() => ({}));
		const noul = body.answers?.["q0"]?.noul;
		const num = typeof noul === "number" ? noul : void 0;
		if (num === void 0) return {
			ok: false,
			ms,
			model,
			provider: prov.id,
			endpoint,
			upstream: typeof body.model === "string" ? body.model : void 0,
			message: "端点通了（HTTP 200）但响应里没有 noul —— 形态不对。确认这真的是 TypeSafe 的 /v1/systemone 端点。"
		};
		return {
			ok: true,
			ms,
			model,
			provider: prov.id,
			endpoint,
			upstream: typeof body.model === "string" ? body.model : void 0,
			noul: num,
			message: `连接正常（${prov.id}／${model}，${ms}ms，上游 ${body.model ?? model}，noul=${num}）。`
		};
	} catch (err) {
		const ms = Date.now() - t0;
		const m = err instanceof Error ? err.message : String(err);
		const timeout = /timeout|abort/i.test(m);
		return {
			ok: false,
			ms,
			model,
			provider: prov.id,
			endpoint,
			message: timeout ? `超时（15 秒未响应）。检查端点是否可达、或换个网络环境。` : `请求失败：${m}。`
		};
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
async function readPromptDetail(key) {
	const def = promptDefault(key) ?? "";
	const overridden = hasOverride(key);
	const history = await listPromptHistory(key);
	return {
		current: promptCurrent(key),
		defaultText: def,
		overridden,
		updatedAt: overrideUpdatedAt(key),
		history
	};
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
async function listCoversWithLinkCheck(opts = {}) {
	const snapshot = await scanLibrary({
		...opts.includeArchived === true ? { includeArchived: true } : {},
		...opts.includeHistory === true ? { includeHistory: true } : {}
	});
	const covers = [];
	const brokenLinks = [];
	for (const { cover, sourceFile, line } of snapshot.covers) {
		if (opts.onlyArchived === true && (cover.archivedAt ?? "") === "") continue;
		const abs = resolveRef(cover.ref, cover.ext);
		const exists = abs === void 0 ? false : await fileExistsStat(abs);
		const doc = exists && (cover.title.trim() === "" || (cover.updatedAt ?? "") === "" || (cover.createdAt ?? "") === "") ? await loadEntryDoc(cover.ref, cover.ext) : void 0;
		if (!exists && cover.ext) brokenLinks.push({
			id: cover.id,
			ref: cover.ref,
			project: cover.project,
			sourceFile,
			line
		});
		covers.push({
			id: cover.id,
			project: cover.project,
			theme: cover.theme,
			global: cover.global,
			kind: cover.kind,
			tags: cover.tags,
			desc: cover.desc,
			ref: cover.ref,
			ext: cover.ext,
			title: cover.title.trim() !== "" ? cover.title : doc?.title ?? "",
			missing: !exists,
			updatedAt: cover.updatedAt ?? doc?.frontmatter.updatedAt ?? "",
			createdAt: cover.createdAt ?? doc?.frontmatter.createdAt ?? "",
			/**
			* ⭐ **归档时间**（决策 133）——空串 = 活跃。
			*
			* 🔴 **`archivedAt` 必须从 `cover` 取，不能从正文 frontmatter 取**：
			*    上面两行取正文是历史原因（决策 119/123），而归档是**纯封面层**的动作；
			*    外链条目根本没有正文（`doc === undefined`）⇒ 从正文取会让外链的归档时间恒为空。
			*/
			archivedAt: cover.archivedAt ?? "",
			sourceFile,
			line
		});
	}
	return {
		covers,
		brokenLinks,
		invalid: snapshot.issues
	};
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
async function kindsPayload() {
	const defs = await loadKinds();
	const scanned = await scanLibrary({ includeHistory: true });
	const counts = /* @__PURE__ */ new Map();
	for (const c of scanned.covers) {
		const k = c.cover.kind;
		if (k !== "") counts.set(k, (counts.get(k) ?? 0) + 1);
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
			count: counts.get(d.id) ?? 0
		})),
		selectable: defs.filter((d) => !d.reserved).map((d) => d.id)
	};
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
function normalizeOneKindDef(raw) {
	if (raw === void 0 || raw === null) return void 0;
	return normalizeKindDefs([raw])?.[0];
}
/**
* ⭐ **把请求体里的 `items` 规整成 `KindDef[]`**（形状不对 ⇒ `undefined`）。
*
* ⚠️ **宽容读、严格校验**：这里只保证"形状像"，**业务规则**（内置不可删改、
*    id 语法、`when` 非空…）交给 `validateKinds()` —— 一份规则只有一个出处。
* @param raw - 请求体里的 `items`。
* @returns 规整后的表；形状不对返回 `undefined`。
*/
function normalizeKindDefs(raw) {
	if (!Array.isArray(raw)) return void 0;
	const out = [];
	for (const it of raw) {
		if (typeof it !== "object" || it === null) return void 0;
		const o = it;
		if (typeof o["id"] !== "string") return void 0;
		out.push({
			id: o["id"].trim(),
			label: typeof o["label"] === "string" ? o["label"] : "",
			when: typeof o["when"] === "string" ? o["when"] : "",
			guide: typeof o["guide"] === "string" ? o["guide"] : "",
			builtin: o["builtin"] === true,
			reserved: o["reserved"] === true
		});
	}
	return out;
}
async function handleApi(deps, method, pathname, rawBody, params) {
	const route = pathname.slice(21) || "/";
	try {
		if (route === "/health") {
			const snapshot = await scanLibrary({ includeArchived: true });
			const activeCovers = snapshot.covers.filter((c) => (c.cover.archivedAt ?? "") === "");
			const activeProjects = snapshot.projects.filter((p) => (p.frontmatter.archivedAt ?? "") === "");
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
					nominations: (await readNominations()).length
				}
			};
		}
		if (route === "/active") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			const sid = params.get("sessionId") ?? "";
			const last = sid === "" ? void 0 : activeSnapshot(sid);
			return {
				status: 200,
				body: {
					ok: true,
					sessionId: sid,
					enabled: deps.config.activeInject,
					channel: deps.config.activeInjectChannel,
					model: deps.config.activeInjectModel,
					scope: deps.config.activeInjectScope,
					maxInjectionsPerTurn: maxInjectionsPerTurn(deps.config),
					maxCallsPerTurn: maxInjectionsPerTurn(deps.config),
					injectionsUsed: sid === "" ? 0 : activeInjectionsUsed(sid),
					callsUsed: sid === "" ? 0 : activeInjectionsUsed(sid),
					last: last ?? null,
					lastInjection: sid === "" ? null : lastInjectionOf(sid) ?? null,
					totals: sid === "" ? null : injectTotalsOf(sid) ?? null,
					lastChatCall: lastChatDiagnostic() ?? null
				}
			};
		}
		if (route === "/projects") return {
			status: 200,
			body: {
				ok: true,
				projects: (await scanLibrary()).projects.map((p) => ({
					id: p.id,
					title: p.frontmatter.title,
					desc: p.frontmatter.desc,
					themes: p.frontmatter.themes,
					updatedAt: p.frontmatter.updatedAt,
					createdAt: p.frontmatter.createdAt
				}))
			}
		};
		if (route === "/themes") {
			const snapshot = await scanLibrary();
			const themes = [];
			for (const id of snapshot.themeIds) {
				const fm = await loadThemeFrontmatter(id);
				const covers = snapshot.covers.filter((c) => c.cover.theme.includes(id));
				themes.push({
					id,
					title: fm?.title ?? "",
					desc: fm?.desc ?? "",
					updatedAt: fm?.updatedAt ?? "",
					createdAt: fm?.createdAt ?? "",
					covers: covers.length,
					projects: covers.map((c) => c.cover.project).filter((p) => p !== "").filter((p, i, arr) => arr.indexOf(p) === i)
				});
			}
			return {
				status: 200,
				body: {
					ok: true,
					themes,
					themeIds: snapshot.themeIds
				}
			};
		}
		if (route === "/theme") {
			const id = params.get("id") ?? "";
			if (id === "") return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 id"
				}
			};
			const snapshot = await scanLibrary();
			if (!snapshot.themeIds.includes(id)) return {
				status: 404,
				body: {
					ok: false,
					error: "没有这个主题"
				}
			};
			const fm = await loadThemeFrontmatter(id);
			const covers = snapshot.covers.filter((c) => c.cover.theme.includes(id));
			const projects = covers.map((c) => c.cover.project).filter((p) => p !== "").filter((p, i, arr) => arr.indexOf(p) === i).map((pid) => ({
				id: pid,
				desc: snapshot.projects.find((p) => p.id === pid)?.frontmatter.desc ?? ""
			}));
			const text = await readTextIfExists(themeDocPath(id));
			return {
				status: 200,
				body: {
					ok: true,
					frontmatter: {
						theme: id,
						title: fm?.title ?? "",
						desc: fm?.desc ?? "",
						createdAt: fm?.createdAt ?? "",
						updatedAt: fm?.updatedAt ?? ""
					},
					/** 覆盖的项目（id + desc）——详情页上半部。 */
					projects,
					/** 该主题下的封面数。 */
					coverCount: covers.length,
					/** ⚠️ 派生文档缺失（理论上重建后一定有）。 */
					missingDoc: text === void 0
				}
			};
		}
		if (route === "/covers") return {
			status: 200,
			body: {
				ok: true,
				...await listCoversWithLinkCheck({ includeHistory: true })
			}
		};
		if (route === "/archived") {
			const kind = params.get("kind") === "project" ? "project" : "entry";
			const snapshot = await scanLibrary({ includeArchived: true });
			if (kind === "project") {
				const activeCovers = snapshot.covers.filter((c) => (c.cover.archivedAt ?? "") === "");
				return {
					status: 200,
					body: {
						ok: true,
						kind,
						projects: snapshot.projects.filter((p) => (p.frontmatter.archivedAt ?? "") !== "").map((p) => ({
							id: p.id,
							title: p.frontmatter.title,
							desc: p.frontmatter.desc,
							themes: p.frontmatter.themes,
							updatedAt: p.frontmatter.updatedAt,
							createdAt: p.frontmatter.createdAt,
							/** ⭐ 归档时间（非空，就是筛选条件）。 */
							archivedAt: p.frontmatter.archivedAt,
							/** 该项目旗下**活跃**知识条数。 */
							coverCount: activeCovers.filter((c) => c.cover.project === p.id).length
						}))
					}
				};
			}
			const data = await listCoversWithLinkCheck({
				includeArchived: true,
				onlyArchived: true
			});
			return {
				status: 200,
				body: {
					ok: true,
					kind,
					covers: data.covers,
					invalid: data.invalid
				}
			};
		}
		if (route === "/hot") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			const sessionId = params.get("session") ?? "";
			const file = await loadSessionsFile();
			const getSvc = { get: (n) => deps.getService?.(n) };
			if (sessionId !== "" && file.detectDocReads) {
				const cur = file.sessions[sessionId];
				if (cur === void 0 || cur.project === "" || cur.project === "未知") {
					const r = await resolveProject(getSvc, sessionId);
					if (r.project !== "未知") {
						file.sessions[sessionId] = {
							project: r.project,
							source: r.source === "inherited" ? "inherited" : r.source === "get-handoff" || r.source === "handoff" ? "doc-reads" : r.source,
							boundAt: (/* @__PURE__ */ new Date()).toISOString(),
							lastActiveAt: cur?.lastActiveAt ?? (/* @__PURE__ */ new Date()).toISOString()
						};
						const { kept } = pruneSessions(file.sessions, deps.config.hotSessionKeep);
						file.sessions = kept;
						await saveSessionsFile(file);
					}
				}
			}
			const bound = sessionId === "" ? void 0 : file.sessions[sessionId];
			const preview = sessionId === "" ? void 0 : await previewForSession(getSvc, sessionId, {
				on: deps.config.hotScoreOnTurnEnd,
				windowHours: deps.config.hotScoreWindowHours,
				topN: deps.config.hotScoreTopN,
				gate: true,
				gateMinScore: deps.config.hotScoreGateMinScore,
				gateLastTurn: deps.config.hotScoreGateLastTurn
			});
			const ratio = deps.config.hotInjectRatio;
			const cpt = deps.config.hotCharsPerToken;
			const win = sessionId === "" ? void 0 : hotState.windows.get(sessionId)?.contextWindow;
			const budget = ratio <= 0 ? 0 : typeof win === "number" && win > 0 ? Math.floor(win * ratio / (cpt > 0 ? cpt : 1)) : deps.config.hotBudgetCharsFallback;
			return {
				status: 200,
				body: {
					ok: true,
					sessionId,
					inject: deps.config.hotInject,
					detect: {
						docReads: file.detectDocReads,
						llm: file.detectLlm,
						llmModel: file.detectLlmModel
					},
					bound: bound ?? null,
					preview: preview ?? null,
					items: preview?.items ?? [],
					window: preview?.window === void 0 ? null : {
						at: preview.window.at,
						sessionId: preview.window.sessionId,
						contextWindow: preview.window.contextWindow ?? null,
						present: [...preview.window.present]
					},
					windowSource: preview === void 0 || preview.window === void 0 ? null : preview.windowFromLog ? "log" : "memory",
					budget: {
						ratio,
						charsPerToken: cpt,
						chars: budget,
						fullWarnChars: deps.config.hotFullWarnChars,
						basis: ratio <= 0 ? "off" : typeof win === "number" && win > 0 ? "window" : "fallback",
						contextWindow: typeof win === "number" ? win : null
					},
					keep: deps.config.hotSessionKeep
				}
			};
		}
		if (route === "/hot/projects") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			const snapshot = await scanLibrary();
			const selections = await loadSelections();
			return {
				status: 200,
				body: {
					ok: true,
					projects: snapshot.projects.map((p) => {
						const sel = selections[p.id];
						const ids = (sel?.entries ?? []).map((e) => e.id);
						return {
							id: p.id,
							title: p.frontmatter.title,
							desc: p.frontmatter.desc,
							themes: p.frontmatter.themes,
							updatedAt: p.frontmatter.updatedAt,
							coverCount: snapshot.covers.filter((c) => c.cover.project === p.id).length,
							selectedCount: ids.length,
							injectCount: ids.length,
							initializedAt: sel?.initializedAt ?? ""
						};
					})
				}
			};
		}
		if (route === "/hot/persona") {
			if (method === "GET") return {
				status: 200,
				body: {
					ok: true,
					items: await loadPersona()
				}
			};
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET / POST"
				}
			};
			let p;
			try {
				p = JSON.parse(rawBody);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			const items = await loadPersona();
			const op = typeof p.op === "string" ? p.op : "";
			const now = (/* @__PURE__ */ new Date()).toISOString();
			if (op === "add") {
				const text = typeof p.text === "string" ? p.text : "";
				if (text.trim() === "") return {
					status: 400,
					body: {
						ok: false,
						error: "画像正文不能为空。"
					}
				};
				items.push({
					id: newPersonaId(),
					text,
					on: true,
					channel: p.channel === "section" ? "section" : "inbox",
					createdAt: now,
					updatedAt: now
				});
			} else if (op === "update") {
				const idx = items.findIndex((it) => it.id === p.id);
				if (idx < 0) return {
					status: 404,
					body: {
						ok: false,
						error: "没有这条画像"
					}
				};
				const cur = items[idx];
				if (cur === void 0) return {
					status: 404,
					body: {
						ok: false,
						error: "没有这条画像"
					}
				};
				items[idx] = {
					...cur,
					...typeof p.text === "string" ? { text: p.text } : {},
					...typeof p.on === "boolean" ? { on: p.on } : {},
					...p.channel === "section" || p.channel === "inbox" ? { channel: p.channel } : {},
					updatedAt: now
				};
			} else if (op === "delete") {
				const idx = items.findIndex((it) => it.id === p.id);
				if (idx < 0) return {
					status: 404,
					body: {
						ok: false,
						error: "没有这条画像"
					}
				};
				items.splice(idx, 1);
			} else return {
				status: 400,
				body: {
					ok: false,
					error: "op 只能是 add / update / delete。"
				}
			};
			await savePersona(items);
			return {
				status: 200,
				body: {
					ok: true,
					items
				}
			};
		}
		if (route === "/hot/selection") {
			const projectId = params.get("project") ?? "";
			if (projectId === "") return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 project"
				}
			};
			const selections = await loadSelections();
			if (method === "GET") {
				const sel = selections[projectId];
				return {
					status: 200,
					body: {
						ok: true,
						project: projectId,
						entries: sel?.entries ?? [],
						entryIds: (sel?.entries ?? []).map((e) => e.id),
						initializedAt: sel?.initializedAt ?? ""
					}
				};
			}
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET / POST"
				}
			};
			let p;
			try {
				p = JSON.parse(rawBody);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			const prev = selections[projectId];
			/** 把"传进来的 id 数组"合成为新结构（**保留已存在的 shape/pinnedAt**）。 */
			const fromIds = (ids) => {
				const old = new Map((prev?.entries ?? []).map((e) => [e.id, e]));
				return ids.map((id) => old.get(id) ?? {
					id,
					shape: "meta",
					pinnedAt: ""
				});
			};
			let entries;
			if (Array.isArray(p.entries)) {
				entries = [];
				for (const e of p.entries) {
					if (e === null || typeof e !== "object") continue;
					const it = e;
					if (typeof it.id !== "string" || it.id === "") continue;
					entries.push({
						id: it.id,
						shape: it.shape === "full" ? "full" : "meta",
						pinnedAt: typeof it.pinnedAt === "string" ? it.pinnedAt : ""
					});
				}
			} else if (Array.isArray(p.entryIds)) entries = fromIds(p.entryIds.filter((x) => typeof x === "string"));
			else entries = prev?.entries ?? [];
			selections[projectId] = {
				entries,
				initializedAt: p.init === true || (prev?.initializedAt ?? "") === "" ? (/* @__PURE__ */ new Date()).toISOString() : prev?.initializedAt ?? ""
			};
			await saveSelections(selections);
			return {
				status: 200,
				body: {
					ok: true,
					project: projectId,
					entries,
					entryIds: entries.map((e) => e.id),
					initializedAt: selections[projectId]?.initializedAt ?? ""
				}
			};
		}
		if (route === "/hot/bind") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let p;
			try {
				p = JSON.parse(rawBody);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			const file = await loadSessionsFile();
			if (typeof p.detectDocReads === "boolean") file.detectDocReads = p.detectDocReads;
			if (typeof p.detectLlm === "boolean") file.detectLlm = p.detectLlm;
			if (p.llmModel !== void 0) {
				const m = p.llmModel;
				file.detectLlmModel = m !== null && typeof m?.provider === "string" && typeof m?.model === "string" ? {
					provider: m.provider,
					model: m.model
				} : null;
			}
			const sessionId = typeof p.session === "string" ? p.session : "";
			if (sessionId !== "" && p.project !== void 0) {
				const project = typeof p.project === "string" ? p.project : "";
				const now = (/* @__PURE__ */ new Date()).toISOString();
				if (project === "") delete file.sessions[sessionId];
				else file.sessions[sessionId] = {
					project,
					source: "manual",
					boundAt: now,
					lastActiveAt: file.sessions[sessionId]?.lastActiveAt ?? now
				};
			}
			const { kept } = pruneSessions(file.sessions, deps.config.hotSessionKeep);
			file.sessions = kept;
			await saveSessionsFile(file);
			return {
				status: 200,
				body: {
					ok: true,
					detectDocReads: file.detectDocReads,
					detectLlm: file.detectLlm,
					llmModel: file.detectLlmModel,
					bound: file.sessions[sessionId] ?? null
				}
			};
		}
		if (route === "/hot/item") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let p;
			try {
				p = JSON.parse(rawBody);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			const id = typeof p.id === "string" ? p.id : "";
			if (id === "") return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 id"
				}
			};
			const projectId = typeof p.project === "string" ? p.project : "";
			if (((await scanLibrary()).covers.find((c) => c.cover.id === id)?.cover)?.global === true) {
				const entries = await loadEntrySettings();
				const next = { ...entries[id] ?? defaultEntrySetting("global") };
				if (typeof p.on === "boolean") next.on = p.on;
				if (p.channel === "section" || p.channel === "inbox") next.channel = p.channel;
				if (p.shape === "meta" || p.shape === "full") next.shape = p.shape;
				entries[id] = next;
				await saveEntrySettings(entries);
				return {
					status: 200,
					body: {
						ok: true,
						scope: "global",
						setting: next,
						removed: false,
						...p.pin !== void 0 ? { note: "全局知识不参与置顶（它每次都会注入）。" } : {}
					}
				};
			}
			if (projectId === "") return {
				status: 400,
				body: {
					ok: false,
					error: "这条不是全局知识 ⇒ 它的形态/置顶是**逐项目**的，必须传 `project` 指明是哪个项目。"
				}
			};
			const selections = await loadSelections();
			const sel = selections[projectId] ?? {
				entries: [],
				initializedAt: ""
			};
			const idx = sel.entries.findIndex((e) => e.id === id);
			const curEntry = idx >= 0 ? sel.entries[idx] : void 0;
			if (p.on === false && idx >= 0) {
				sel.entries.splice(idx, 1);
				selections[projectId] = sel;
				await saveSelections(selections);
				return {
					status: 200,
					body: {
						ok: true,
						scope: "project",
						removed: true,
						entries: sel.entries,
						entryIds: sel.entries.map((e) => e.id)
					}
				};
			}
			if (curEntry === void 0) return {
				status: 404,
				body: {
					ok: false,
					error: "这条不在该项目的热知识清单里 ⇒ 没有可改的设置。先把它加入清单（`POST /hot/selection`）。"
				}
			};
			const nextEntry = { ...curEntry };
			if (p.shape === "meta" || p.shape === "full") nextEntry.shape = p.shape;
			if (p.pin === true) nextEntry.pinnedAt = (/* @__PURE__ */ new Date()).toISOString();
			if (p.pin === false) nextEntry.pinnedAt = "";
			sel.entries[idx] = nextEntry;
			selections[projectId] = sel;
			await saveSelections(selections);
			return {
				status: 200,
				body: {
					ok: true,
					scope: "project",
					entry: nextEntry,
					removed: false,
					entries: sel.entries,
					entryIds: sel.entries.map((e) => e.id)
				}
			};
		}
		if (route === "/hot/global") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			const snapshot = await scanLibrary();
			const entries = await loadEntrySettings();
			const out = [];
			for (const { cover } of snapshot.covers) {
				if (!cover.global) continue;
				const doc = await loadEntryDoc(cover.ref, cover.ext);
				const st = entries[cover.id] ?? defaultEntrySetting("global");
				out.push({
					id: cover.id,
					title: cover.title,
					desc: cover.desc,
					kind: cover.kind,
					project: cover.project,
					on: st.on,
					channel: st.channel,
					shape: st.shape,
					bodyChars: (doc?.body ?? "").length,
					body: doc?.body ?? ""
				});
			}
			return {
				status: 200,
				body: {
					ok: true,
					covers: out,
					fullWarnChars: deps.config.hotFullWarnChars
				}
			};
		}
		if (route === "/entry") {
			const id = params.get("id") ?? "";
			if (id === "") return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 id"
				}
			};
			const found = (await scanLibrary({
				includeArchived: true,
				includeHistory: true
			})).covers.find((c) => c.cover.id === id);
			if (found === void 0) return {
				status: 404,
				body: {
					ok: false,
					error: "库里没有这张封面"
				}
			};
			const cover = found.cover;
			const doc = resolveRef(cover.ref, cover.ext) === void 0 ? void 0 : await loadEntryDoc(cover.ref, cover.ext);
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
						title: cover.title,
						desc: cover.desc,
						ref: cover.ref,
						ext: cover.ext,
						createdAt: cover.createdAt,
						updatedAt: cover.updatedAt,
						/**
						* ⭐ **归档时间**（决策 133）——空串 = 活跃。
						*
						* 🔴 前端**靠这个字段自己判断该画"归档"还是"恢复"按钮**，
						*    而不是靠"我当前在哪个标签页"——因为一个过期的书签 hash
						*    可以把你带到知识库页上的归档条目，那时画错按钮就是**撒谎**。
						*/
						archivedAt: cover.archivedAt ?? ""
					},
					title: cover.title.trim() !== "" ? cover.title : doc?.title ?? "",
					/**
					* ⭐ **外部引用也渲染正文**（决策 128，**取代** §12-80）。
					*
					* 🔴 原来这里写 `cover.ext ? '' : (doc?.body ?? '')`——对外链恒返回空串。
					*    而 `loadEntryDoc(cover.ref, cover.ext)` **本来就会真的读那个库外文件**
					*    （`resolveRef` 认 `ext` ⇒ 按绝对路径读）⇒ **正文一直是有的，只是被这里丢弃**。
					*    ⇒ 本改动**不新增任何读取逻辑**，只是"别再丢掉"。
					* ⚠️ 断链时 `doc === undefined` ⇒ 自然回落成 `''`（见 `missing`）。
					*/
					body: doc?.body ?? "",
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
					frontmatter: cover.ext ? null : doc?.frontmatter ?? null,
					missing: doc === void 0,
					sourceFile: found.sourceFile,
					line: found.line
				}
			};
		}
		if (route === "/project") {
			const id = params.get("id") ?? "";
			if (id === "") return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 id"
				}
			};
			const doc = await loadProjectDoc(id);
			if (doc === void 0) return {
				status: 404,
				body: {
					ok: false,
					error: "没有这个项目"
				}
			};
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
					orphanCount: doc.orphans.length
				}
			};
		}
		if (route === "/block") {
			const file = params.get("file") ?? "";
			const line = Number(params.get("line") ?? "0");
			if (file === "" || !Number.isInteger(line) || line < 1) return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 file 或 line"
				}
			};
			const projectId = file.startsWith("HANDOFF-") && file.endsWith(".md") ? file.slice(8, -3) : "";
			if (projectId === "") return {
				status: 400,
				body: {
					ok: false,
					error: `不是项目文档名：${file}`
				}
			};
			const doc = await loadProjectDoc(projectId);
			if (doc === void 0) return {
				status: 404,
				body: {
					ok: false,
					error: `项目文档不存在：${file}`
				}
			};
			const parsed = parseCovers(doc.text, file);
			const block = parsed.blocks.find((b) => b.startLine === line);
			if (block === void 0) return {
				status: 404,
				body: {
					ok: false,
					error: "该行不是封面块"
				}
			};
			const issue = parsed.issues.find((i) => i.line === line);
			return {
				status: 200,
				body: {
					ok: true,
					file,
					startLine: block.startLine,
					endLine: block.endLine,
					raw: block.text,
					reason: issue?.reason ?? ""
				}
			};
		}
		if (route === "/nominations") return {
			status: 200,
			body: {
				ok: true,
				nominations: await readNominations()
			}
		};
		if (route === "/approve" || route === "/reject") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let payload;
			try {
				payload = JSON.parse(rawBody);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			const entryId = payload.entryId;
			if (typeof entryId !== "string" || entryId === "") return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 entryId"
				}
			};
			if (!(route === "/approve" ? await approveNomination(entryId) : await rejectNomination(entryId))) return {
				status: 404,
				body: {
					ok: false,
					error: "没有这条待批提名"
				}
			};
			await rebuildDerivedLayers();
			return {
				status: 200,
				body: {
					ok: true,
					entryId
				}
			};
		}
		if (route === "/rebuild") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			return {
				status: 200,
				body: {
					ok: true,
					...await rebuildDerivedLayers()
				}
			};
		}
		if (route === "/edit") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let payload;
			try {
				payload = JSON.parse(rawBody);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			const id = (payload.id ?? "").trim();
			if (id === "") return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 id"
				}
			};
			let result;
			switch (payload.target) {
				case "entry":
					if (payload.fields !== void 0) {
						const rawKind = payload.fields.kind;
						const kind = rawKind === void 0 || rawKind === "" ? rawKind === "" ? "" : void 0 : isEntryKind(rawKind) ? rawKind : void 0;
						if (rawKind !== void 0 && rawKind !== "" && kind === void 0) return {
							status: 400,
							body: {
								ok: false,
								error: `kind 非法：${rawKind}`
							}
						};
						result = await setEntryFields(id, {
							...payload.fields.title !== void 0 ? { title: payload.fields.title } : {},
							...payload.fields.desc !== void 0 ? { desc: payload.fields.desc } : {},
							...payload.fields.tags !== void 0 ? { tags: payload.fields.tags } : {},
							...kind !== void 0 ? { kind } : {}
						});
						break;
					}
					if (payload.addThemes !== void 0 || payload.removeThemes !== void 0) {
						result = await editEntryThemes(id, {
							...payload.addThemes !== void 0 ? { add: payload.addThemes } : {},
							...payload.removeThemes !== void 0 ? { remove: payload.removeThemes } : {}
						});
						break;
					}
					if (payload.moveTo !== void 0) {
						result = await moveEntry(id, payload.moveTo);
						break;
					}
					if (payload.setGlobal !== void 0) {
						result = await setEntryGlobal(id, payload.setGlobal, "human");
						break;
					}
					return {
						status: 400,
						body: {
							ok: false,
							error: "entry 操作需要 fields / addThemes / removeThemes / moveTo / setGlobal 之一"
						}
					};
				case "deleteEntry":
					result = await deleteEntry(id);
					break;
				case "archiveEntry":
					result = await archiveEntry(id);
					break;
				case "unarchiveEntry":
					result = await unarchiveEntry(id);
					break;
				case "archiveProject":
					result = await archiveProject(id);
					break;
				case "unarchiveProject":
					result = await unarchiveProject(id);
					break;
				case "projectDesc":
					result = await setProjectDesc(id, payload.fields?.desc ?? "");
					break;
				case "projectFields":
					result = await setProjectFields(id, {
						...payload.fields?.title !== void 0 ? { title: payload.fields.title } : {},
						...payload.fields?.desc !== void 0 ? { desc: payload.fields.desc } : {}
					});
					break;
				case "sectionSpec":
					if (typeof payload.section !== "string" || payload.section.trim() === "") return {
						status: 400,
						body: {
							ok: false,
							error: "缺少 section（要改哪一节）。"
						}
					};
					if (typeof payload.spec !== "string") return {
						status: 400,
						body: {
							ok: false,
							error: "缺少 spec（规范正文）。"
						}
					};
					result = await setSectionSpec(id, payload.section, payload.spec);
					break;
				case "renameProject":
					result = await renameProject(id, payload.newId ?? "");
					break;
				case "deleteProject":
					result = await deleteProject(id);
					break;
				case "themeDesc":
					result = await setThemeDesc(id, payload.fields?.desc ?? "");
					break;
				case "themeFields":
					result = await setThemeFields(id, {
						...payload.fields?.title !== void 0 ? { title: payload.fields.title } : {},
						...payload.fields?.desc !== void 0 ? { desc: payload.fields.desc } : {}
					});
					break;
				case "renameTheme":
					result = await renameTheme(id, payload.newId ?? "");
					break;
				case "deleteTheme":
					result = await deleteTheme(id);
					break;
				default: return {
					status: 400,
					body: {
						ok: false,
						error: "`target` 必须是：entry / deleteEntry / archiveEntry / unarchiveEntry / projectFields / projectDesc / sectionSpec / renameProject / deleteProject / archiveProject / unarchiveProject / themeFields / themeDesc / renameTheme / deleteTheme。"
					}
				};
			}
			if (!result.ok) return {
				status: 400,
				body: result
			};
			return {
				status: 200,
				body: result
			};
		}
		if (route === "/index-check") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let force = false;
			try {
				force = (rawBody.trim() === "" ? {} : JSON.parse(rawBody)).force === true;
			} catch {}
			try {
				return {
					status: 200,
					body: {
						ok: true,
						...await checkAndRepair({
							ctx: { get: (n) => deps.getService?.(n) },
							config: deps.config,
							force
						})
					}
				};
			} catch (err) {
				return {
					status: 500,
					body: {
						ok: false,
						error: err instanceof Error ? err.message : String(err)
					}
				};
			}
		}
		if (route === "/prompts") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			return {
				status: 200,
				body: {
					ok: true,
					items: PROMPT_SPECS.map((s) => ({
						key: s.key,
						zone: s.zone,
						purpose: s.purpose,
						owner: s.owner,
						injectMode: s.injectMode,
						breaksCache: s.breaksCache,
						sourceFile: s.sourceFile,
						hotReload: s.hotReload,
						editable: s.editable,
						readonlyWhy: s.readonlyWhy ?? "",
						checks: s.checks.map((c) => ({
							kind: c.kind,
							max: c.kind === "maxChars" ? c.max : 0,
							why: c.kind === "maxChars" ? c.why : "",
							tokens: c.kind === "slots" ? [...c.tokens] : []
						})),
						overridden: hasOverride(s.key),
						textLen: promptCurrent(s.key).length,
						canWriteBack: s.editable === true && (s.sourceConst ?? "") !== "",
						writeBackState: s.editable === true ? writeBackState(s.key) : "",
						sourceConst: s.sourceConst ?? "",
						part: catalogOf(s.key)?.part ?? ""
					})),
					groups: Object.entries(PROMPT_GROUPS).map(([id, g]) => ({
						id,
						title: g.title,
						about: g.about,
						order: g.order
					})).sort((a, b) => a.order - b.order),
					overridesPath: promptOverridesPath()
				}
			};
		}
		if (route === "/prompt") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			const key = params.get("key") ?? "";
			const spec = specOf(key);
			if (spec === void 0) return {
				status: 404,
				body: {
					ok: false,
					error: `未知的提示词键：${key}`
				}
			};
			const d = await readPromptDetail(key);
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
					readonlyWhy: spec.readonlyWhy ?? ""
				}
			};
		}
		if (route === "/prompt/save") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let key = "";
			let text = "";
			try {
				const body = JSON.parse(rawBody);
				key = typeof body.key === "string" ? body.key : "";
				text = typeof body.text === "string" ? body.text : "";
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			const r = await savePromptOverride(key, text);
			return {
				status: r.ok ? 200 : 400,
				body: {
					ok: r.ok,
					errors: r.errors,
					saved: r.saved,
					backupPath: r.backupPath ?? ""
				}
			};
		}
		if (route === "/prompt/writeback") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let keys = [];
			try {
				const body = JSON.parse(rawBody);
				if (typeof body.key === "string" && body.key !== "") keys = [body.key];
				else if (Array.isArray(body.keys)) keys = body.keys.filter((k) => typeof k === "string");
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			if (keys.length === 0) return {
				status: 400,
				body: {
					ok: false,
					error: "没有给要写回的 key"
				}
			};
			const unknown = keys.filter((k) => specOf(k) === void 0);
			if (unknown.length > 0) return {
				status: 404,
				body: {
					ok: false,
					error: `未知的提示词键：${unknown.join("、")}`
				}
			};
			const r = await writeBackToSource(keys);
			return {
				status: r.ok ? 200 : 400,
				body: {
					ok: r.ok,
					items: r.items,
					filesChanged: r.filesChanged,
					summary: r.summary
				}
			};
		}
		if (route === "/prompt/reset") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let key = "";
			try {
				key = JSON.parse(rawBody).key ?? "";
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			if (typeof key !== "string" || specOf(key) === void 0) return {
				status: 404,
				body: {
					ok: false,
					error: `未知的提示词键：${String(key)}`
				}
			};
			const r = await resetPromptOverride(key);
			return {
				status: r.ok ? 200 : 400,
				body: {
					ok: r.ok,
					errors: r.errors,
					saved: r.saved
				}
			};
		}
		if (route === "/prompt/history") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			const key = params.get("key") ?? "";
			const file = params.get("file") ?? "";
			const text = await readPromptHistory(file);
			if (text === void 0) return {
				status: 404,
				body: {
					ok: false,
					error: "读不到该历史版本"
				}
			};
			return {
				status: 200,
				body: {
					ok: true,
					key,
					file,
					text
				}
			};
		}
		if (route === "/prompt/restore") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let key = "";
			let file = "";
			try {
				const body = JSON.parse(rawBody);
				key = typeof body.key === "string" ? body.key : "";
				file = typeof body.file === "string" ? body.file : "";
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			if (specOf(key) === void 0) return {
				status: 404,
				body: {
					ok: false,
					error: `未知的提示词键：${key}`
				}
			};
			const r = await restorePromptHistory(key, file);
			return {
				status: r.ok ? 200 : 400,
				body: {
					ok: r.ok,
					errors: r.errors,
					saved: r.saved,
					backupPath: r.backupPath ?? ""
				}
			};
		}
		if (route === "/templates") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			return {
				status: 200,
				body: {
					ok: true,
					items: (await listTemplates()).map((t) => ({
						id: t.id,
						title: t.title,
						sectionCount: t.sections.length,
						sections: t.sections.map((s) => ({
							name: s.name,
							desc: s.desc
						})),
						deletable: t.id !== "default",
						errors: validateTemplate(t),
						warnings: templateWarnings(t)
					})),
					dir: templatesDir()
				}
			};
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
		if (route === "/kinds") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			return {
				status: 200,
				body: {
					ok: true,
					...await kindsPayload()
				}
			};
		}
		/**
		* ⭐⭐ **保存整张类型表**（设置页的「保存」用）。
		*
		* ⚠️ **为什么是"整张表"而不是"加一条/改一条"**：顺序有意义（UI 下拉顺序），
		*    而"增/删/改/排序"四种操作对顺序的影响各不相同 ⇒
		*    **让前端提交最终形态**是最不容易错的做法（与模板保存同一取向）。
		*/
		if (route === "/kind/save") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let defs;
			try {
				defs = normalizeKindDefs(JSON.parse(rawBody).items);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			if (defs === void 0) return {
				status: 400,
				body: {
					ok: false,
					error: "类型表形状不合法（缺 items 数组）"
				}
			};
			const errs = await saveKinds(defs);
			if (errs.length > 0) return {
				status: 400,
				body: {
					ok: false,
					errors: errs
				}
			};
			setCurrentKindDefs(defs);
			return {
				status: 200,
				body: {
					ok: true,
					errors: [],
					...await kindsPayload()
				}
			};
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
		if (route === "/kind/upsert") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let one;
			try {
				one = normalizeOneKindDef(JSON.parse(rawBody).item);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			if (one === void 0) return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 item（单条类型定义）"
				}
			};
			const cur = await loadKinds();
			const at = cur.findIndex((d) => d.id === one.id);
			const next = at >= 0 ? cur.map((d, i) => i === at ? one : d) : [one, ...cur];
			const errs = await saveKinds(next);
			if (errs.length > 0) return {
				status: 400,
				body: {
					ok: false,
					errors: errs
				}
			};
			setCurrentKindDefs(next);
			return {
				status: 200,
				body: {
					ok: true,
					errors: [],
					...await kindsPayload()
				}
			};
		}
		/**
		* ⭐⭐ **删除一个类型**（**有引用就拒绝**，用户裁定的保护）。
		*
		* 🔴 **为什么拒绝而不是"删了顺带把引用清成未分类"**：那要扫全库改几百个封面文件、
		*    **不可逆**（原 kind 再也找不回）。与 `memj_promote` 的「只允许删空容器」同一纪律。
		*/
		if (route === "/kind/delete") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let id = "";
			try {
				const body = JSON.parse(rawBody);
				id = typeof body.id === "string" ? body.id.trim() : "";
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			if (id === "") return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 id"
				}
			};
			const defs = await loadKinds();
			const used = (await scanLibrary({ includeHistory: true })).covers.filter((c) => c.cover.kind === id).length;
			const why = deleteKindBlockReason(id, defs, used);
			if (why !== "") return {
				status: 400,
				body: {
					ok: false,
					errors: [why]
				}
			};
			const errs = await saveKinds(defs.filter((d) => d.id !== id));
			if (errs.length > 0) return {
				status: 400,
				body: {
					ok: false,
					errors: errs
				}
			};
			setCurrentKindDefs(await loadKinds());
			return {
				status: 200,
				body: {
					ok: true,
					errors: [],
					...await kindsPayload()
				}
			};
		}
		/** 保存一份模板（**校验在前，不过不写盘**）。 */
		if (route === "/template/save") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let t;
			try {
				t = normalizeTemplate(JSON.parse(rawBody).template);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			if (t === void 0) return {
				status: 400,
				body: {
					ok: false,
					error: "模板形状不合法（缺 id 或 sections 全空）"
				}
			};
			const errs = await saveTemplate(t);
			return {
				status: errs.length === 0 ? 200 : 400,
				body: {
					ok: errs.length === 0,
					errors: errs,
					warnings: errs.length === 0 ? templateWarnings(t) : []
				}
			};
		}
		if (route === "/template/delete") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let id = "";
			try {
				id = String(JSON.parse(rawBody).id ?? "");
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			if (id === "default") return {
				status: 400,
				body: {
					ok: false,
					error: "内置模板 default 不可删除。"
				}
			};
			const ok = await deleteTemplate(id);
			return {
				status: ok ? 200 : 404,
				body: {
					ok,
					error: ok ? "" : `模板 \`${id}\` 不存在。`
				}
			};
		}
		if (route === "/models") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			try {
				const llm = deps.getService?.("llm");
				const providers = llm?.listProviders?.() ?? [];
				const out = [];
				for (const p of providers) {
					let models = [];
					try {
						models = (await llm?.listModels?.(p.id) ?? []).map((m) => ({
							id: m.id,
							name: m.name ?? m.id
						}));
					} catch {}
					out.push({
						provider: p.id,
						name: p.name ?? p.id,
						models
					});
				}
				return {
					status: 200,
					body: {
						ok: true,
						providers: out
					}
				};
			} catch (err) {
				return {
					status: 500,
					body: {
						ok: false,
						error: err instanceof Error ? err.message : String(err)
					}
				};
			}
		}
		if (route === "/jev-status") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			try {
				const providers = decisionProvidersOf(deps.config);
				const rows = [];
				for (const p of providers) {
					const keyRef = deriveDecisionKeyRef(p.id);
					const meta = await describeCredential(deps, keyRef);
					rows.push({
						id: p.id,
						displayName: p.displayName,
						endpoint: p.endpoint,
						models: p.models,
						keyRef,
						credential: meta,
						ready: meta?.configured === true
					});
				}
				const aPick = activeDecisionOf(deps.config);
				const sPick = scoreDecisionOf(deps.config);
				return {
					status: 200,
					body: {
						ok: true,
						providers: rows,
						empty: rows.length === 0,
						activeInjectPick: aPick.provider === "" ? "" : `${aPick.provider}/${aPick.model}`,
						hotScorePick: sPick.provider === "" ? "" : `${sPick.provider}/${sPick.model}`,
						reason: rows.length === 0 ? "还没有配置任何决策模型 provider ⇒ 选了 jev 通路会在运行期调用失败。请先添加一个。" : ""
					}
				};
			} catch (err) {
				return {
					status: 500,
					body: {
						ok: false,
						error: err instanceof Error ? err.message : String(err)
					}
				};
			}
		}
		if (route === "/jev/key") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let body = {};
			try {
				body = JSON.parse(rawBody === "" ? "{}" : rawBody);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON。"
					}
				};
			}
			const value = typeof body.key === "string" ? body.key : "";
			const pid = typeof body.providerId === "string" ? body.providerId.trim() : "";
			if (pid === "") return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 providerId（密钥要存到某个 provider 名下）。"
				}
			};
			if (!decisionProvidersOf(deps.config).some((p) => p.id === pid)) return {
				status: 400,
				body: {
					ok: false,
					error: `找不到 provider「${pid}」—— 请先保存 provider 配置，再存它的密钥。`
				}
			};
			if (value.trim() === "") return {
				status: 400,
				body: {
					ok: false,
					error: "密钥不能为空。要清除请点「清除密钥」。"
				}
			};
			const keyRef = deriveDecisionKeyRef(pid);
			const r = await setCredential(deps, keyRef, value);
			if (!r.ok) return {
				status: 400,
				body: {
					ok: false,
					error: r.message
				}
			};
			return {
				status: 200,
				body: {
					ok: true,
					message: `「${pid}」的密钥已保存到凭据「${keyRef}」（只写，永不回显）。`
				}
			};
		}
		if (route === "/jev/key/clear") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let pid = "";
			try {
				pid = String(JSON.parse(rawBody === "" ? "{}" : rawBody).providerId ?? "").trim();
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON。"
					}
				};
			}
			if (pid === "") return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 providerId。"
				}
			};
			const keyRef = deriveDecisionKeyRef(pid);
			const r = await unsetCredential(deps, keyRef);
			if (!r.ok) return {
				status: 400,
				body: {
					ok: false,
					error: r.message
				}
			};
			return {
				status: 200,
				body: {
					ok: true,
					message: `已清除「${pid}」的凭据「${keyRef}」。`
				}
			};
		}
		if (route === "/jev/test") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let pid = "";
			let model = "";
			try {
				const b = JSON.parse(rawBody === "" ? "{}" : rawBody);
				pid = String(b.providerId ?? "").trim();
				model = String(b.model ?? "").trim();
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON。"
					}
				};
			}
			if (pid === "") return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 providerId（要测哪一条？）。"
				}
			};
			return {
				status: 200,
				body: await testJevConnection(deps, pid, model)
			};
		}
		if (route === "/settings") {
			if (method === "GET") {
				const r = await readSettings(deps.baseUrl, deps.config, deps.pluginId);
				const cfg = effectiveConfig(r);
				return {
					status: 200,
					body: {
						ok: true,
						themeCreation: cfg.themeCreation,
						progressCharsWarn: cfg.progressCharsWarn,
						progressCharsKeep: cfg.progressCharsKeep,
						backupGit: cfg.backupGit,
						hotInject: cfg.hotInject,
						hotInjectRatio: cfg.hotInjectRatio,
						hotCharsPerToken: cfg.hotCharsPerToken,
						hotBudgetCharsFallback: cfg.hotBudgetCharsFallback,
						hotFullWarnChars: cfg.hotFullWarnChars,
						hotSessionKeep: cfg.hotSessionKeep,
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
						contextReportOnTurnEnd: cfg.contextReportOnTurnEnd,
						contextReportMinPercent: cfg.contextReportMinPercent,
						enIndex: cfg.enIndex,
						enIndexDiag: cfg.enIndexDiag,
						translateProvider: cfg.translateProvider,
						translateModel: cfg.translateModel,
						translateTemplate: cfg.translateTemplate,
						translateConcurrency: cfg.translateConcurrency,
						translateRetries: cfg.translateRetries,
						translateTimeoutMs: cfg.translateTimeoutMs,
						translateMaxTokens: cfg.translateMaxTokens,
						tagNormalizeProvider: cfg.tagNormalizeProvider,
						tagNormalizeModel: cfg.tagNormalizeModel,
						tagNormalizeTimeoutMs: cfg.tagNormalizeTimeoutMs,
						tagNormalizeMaxTokens: cfg.tagNormalizeMaxTokens,
						tagNormalizeOnHandoff: cfg.tagNormalizeOnHandoff,
						tagNormalizeReasoningEffort: cfg.tagNormalizeReasoningEffort,
						activeInject: cfg.activeInject,
						activeInjectChannel: cfg.activeInjectChannel,
						activeInjectModel: cfg.activeInjectModel,
						activeInjectScope: cfg.activeInjectScope,
						activeInjectJevNarrowScope: cfg.activeInjectJevNarrowScope,
						decisionProviders: decisionProvidersOf(cfg),
						activeInjectDecisionPick: cfg.activeInjectDecisionPick,
						hotScoreDecisionPick: cfg.hotScoreDecisionPick,
						activeInjectJevEndpoint: cfg.activeInjectJevEndpoint,
						activeInjectJevApiKeyEnv: cfg.activeInjectJevApiKeyEnv,
						jevModel: cfg.jevModel,
						activeInjectStrict: cfg.activeInjectStrict,
						activeInjectTopK: cfg.activeInjectTopK,
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
						activeInjectMaxInjectionsPerTurn: maxInjectionsPerTurn(cfg),
						activeInjectReasoningMaxChars: cfg.activeInjectReasoningMaxChars,
						activeInjectBudget: cfg.activeInjectBudget,
						activeInjectBudgetTokens: cfg.activeInjectBudgetTokens,
						activeInjectContextTokens: cfg.activeInjectContextTokens,
						activeInjectConcurrency: cfg.activeInjectConcurrency,
						activeInjectChatWindowRatio: cfg.activeInjectChatWindowRatio,
						activeInjectPoolMin: cfg.activeInjectPoolMin,
						activeRecallLogRequest: cfg.activeRecallLogRequest,
						patchPath: r.patchPath,
						patchExists: r.patchExists,
						explicitKeys: r.explicitKeys,
						patchReload: r.patchReload,
						needsRestart: r.patchReload !== "live",
						error: r.error
					}
				};
			}
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET / POST"
				}
			};
			let payload;
			try {
				payload = JSON.parse(rawBody);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			const wantsTheme = payload.themeCreation !== void 0;
			const wantsWarn = payload.progressCharsWarn !== void 0;
			const wantsKeep = payload.progressCharsKeep !== void 0;
			const wantsGitAny = payload.backupGit !== void 0;
			const wantsHotInject = payload.hotInject !== void 0;
			const wantsHotRatio = payload.hotInjectRatio !== void 0;
			const wantsHotCpt = payload.hotCharsPerToken !== void 0;
			const wantsHotBudget = payload.hotBudgetCharsFallback !== void 0;
			const wantsHotFullWarn = payload.hotFullWarnChars !== void 0;
			const wantsHotKeep = payload.hotSessionKeep !== void 0;
			const wantsEnIndex = payload.enIndex !== void 0;
			const wantsEnDiag = payload.enIndexDiag !== void 0;
			const wantsTrProvider = payload.translateProvider !== void 0;
			const wantsTrModel = payload.translateModel !== void 0;
			const wantsTrTemplate = payload.translateTemplate !== void 0;
			const wantsTrConc = payload.translateConcurrency !== void 0;
			const wantsTrRetries = payload.translateRetries !== void 0;
			const wantsTrTimeout = payload.translateTimeoutMs !== void 0;
			const wantsTrMaxTok = payload.translateMaxTokens !== void 0;
			const HOT_SCORE_BOOL_KEYS = ["hotScoreOnTurnEnd", "hotScoreGateLastTurn"];
			const HOT_SCORE_NUM_KEYS = [
				"hotScoreThreshold",
				"hotScoreWindowHours",
				"hotScoreTopN",
				"hotScoreMaxPicks",
				"hotScoreGateMinScore",
				"hotScoreMinChars"
			];
			const HOT_SCORE_STR_KEYS = [
				"hotScoreChannel",
				"hotScoreModel",
				"hotScoreSubagentProvider",
				"hotScoreSubagentModel"
			];
			const wantsAnyHotScore = [
				...HOT_SCORE_BOOL_KEYS,
				...HOT_SCORE_NUM_KEYS,
				...HOT_SCORE_STR_KEYS,
				"hotScoreTimeoutMs"
			].filter((k) => payload[k] !== void 0).length > 0;
			const CONTEXT_REPORT_BOOL_KEYS = ["contextReportOnTurnEnd"];
			const CONTEXT_REPORT_NUM_KEYS = ["contextReportMinPercent"];
			const wantsAnyContextReport = [...CONTEXT_REPORT_BOOL_KEYS, ...CONTEXT_REPORT_NUM_KEYS].filter((k) => payload[k] !== void 0).length > 0;
			const wantsActive = payload.activeInject !== void 0;
			const wantsActiveChannel = payload.activeInjectChannel !== void 0;
			const wantsActiveModel = payload.activeInjectModel !== void 0;
			const wantsActiveScope = payload.activeInjectScope !== void 0;
			const wantsActiveJevNarrow = payload.activeInjectJevNarrowScope !== void 0;
			const wantsDecisionProviders = payload.decisionProviders !== void 0;
			const wantsActiveDecisionPick = payload.activeInjectDecisionPick !== void 0;
			const wantsHotScoreDecisionPick = payload.hotScoreDecisionPick !== void 0;
			const wantsActiveStrict = payload.activeInjectStrict !== void 0;
			const wantsActiveTopK = payload.activeInjectTopK !== void 0;
			const wantsActiveNeedMin = payload.activeInjectNeedMin !== void 0;
			const wantsActiveItemMin = payload.activeInjectItemMin !== void 0;
			const wantsActiveBand = payload.activeInjectBand !== void 0;
			const wantsActiveTimeout = payload.activeInjectTimeoutMs !== void 0;
			const wantsActiveRounds = payload.activeInjectContextRounds !== void 0;
			const wantsActivePool = payload.activeInjectPoolMax !== void 0;
			const wantsActiveExplain = payload.activeInjectExplain !== void 0;
			const wantsActiveIntentGate = payload.activeInjectSearchIntentGate !== void 0;
			const wantsActiveIntentMin = payload.activeInjectSearchIntentMin !== void 0;
			const wantsActiveSuffGate = payload.activeInjectSufficientGate !== void 0;
			const wantsActiveSuffMin = payload.activeInjectSufficientMin !== void 0;
			const wantsActiveInjections = payload.activeInjectMaxInjectionsPerTurn !== void 0;
			const wantsActiveReasoningCap = payload.activeInjectReasoningMaxChars !== void 0;
			const wantsActiveBudget = payload.activeInjectBudget !== void 0;
			const wantsActiveBudgetTok = payload.activeInjectBudgetTokens !== void 0;
			const wantsActiveCtxTok = payload.activeInjectContextTokens !== void 0;
			const wantsActiveConc = payload.activeInjectConcurrency !== void 0;
			const wantsActiveChatRatio = payload.activeInjectChatWindowRatio !== void 0;
			const wantsActivePoolMin = payload.activeInjectPoolMin !== void 0;
			const wantsRecallLogRequest = payload.activeRecallLogRequest !== void 0;
			const wantsTagProvider = payload.tagNormalizeProvider !== void 0;
			const wantsTagModel = payload.tagNormalizeModel !== void 0;
			const wantsTagAuto = payload.tagNormalizeOnHandoff !== void 0;
			const wantsTagEffort = payload.tagNormalizeReasoningEffort !== void 0;
			if (!wantsTheme && !wantsWarn && !wantsKeep && !wantsGitAny && !wantsHotInject && !wantsHotRatio && !wantsHotCpt && !wantsHotBudget && !wantsHotFullWarn && !wantsHotKeep && !wantsEnIndex && !wantsEnDiag && !wantsTrProvider && !wantsTrModel && !wantsTrTemplate && !wantsTrConc && !wantsTrRetries && !wantsTrTimeout && !wantsTrMaxTok && !wantsTagProvider && !wantsTagModel && !wantsTagAuto && !wantsTagEffort && !wantsActive && !wantsActiveChannel && !wantsActiveModel && !wantsActiveScope && !wantsActiveJevNarrow && !wantsActiveStrict && !wantsActiveTopK && !wantsActiveBand && !wantsDecisionProviders && !wantsActiveDecisionPick && !wantsHotScoreDecisionPick && !wantsActiveNeedMin && !wantsActiveItemMin && !wantsActiveTimeout && !wantsActiveRounds && !wantsActivePool && !wantsActiveExplain && !wantsActiveIntentGate && !wantsActiveIntentMin && !wantsActiveSuffGate && !wantsActiveSuffMin && !wantsActiveInjections && !wantsActiveReasoningCap && !wantsActiveBudget && !wantsActiveBudgetTok && !wantsActiveChatRatio && !wantsActivePoolMin && !wantsActiveCtxTok && !wantsActiveConc && !wantsRecallLogRequest && !wantsAnyHotScore && !wantsAnyContextReport) return {
				status: 400,
				body: {
					ok: false,
					error: "至少要给 `themeCreation` / `progressCharsWarn` / `progressCharsKeep` / `backupGit` / `hotInject` / `hotInjectRatio` / `hotCharsPerToken` / `hotBudgetCharsFallback` / `hotFullWarnChars` / `hotSessionKeep` / `enIndex` / `translateProvider` / `translateModel` / `translateTemplate` / `tagNormalizeProvider` / `tagNormalizeModel` / `tagNormalizeOnHandoff` / `tagNormalizeReasoningEffort` / `contextReportOnTurnEnd` / `contextReportMinPercent` 之一。"
				}
			};
			if (wantsTheme) {
				const value = payload.themeCreation;
				if (typeof value !== "string" || !THEME_CREATION_VALUES.includes(value)) return {
					status: 400,
					body: {
						ok: false,
						error: `themeCreation 只能是 ${THEME_CREATION_VALUES.map((v) => `\`${v}\``).join(" / ")}。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "themeCreation", value, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			let warnWritten;
			if (wantsWarn) {
				const n = payload.progressCharsWarn;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1e3 || n > 1e6) return {
					status: 400,
					body: {
						ok: false,
						error: `progressCharsWarn 必须是 ${PROGRESS_WARN_MIN}–${PROGRESS_WARN_MAX} 之间的整数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "progressCharsWarn", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
				warnWritten = n;
			}
			let keepWritten;
			if (wantsKeep) {
				const n = payload.progressCharsKeep;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1e3 || n > 1e6) return {
					status: 400,
					body: {
						ok: false,
						error: `progressCharsKeep 必须是 ${PROGRESS_WARN_MIN}–${PROGRESS_WARN_MAX} 之间的整数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "progressCharsKeep", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
				keepWritten = n;
			}
			if (payload.backupGit !== void 0) {
				if (typeof payload.backupGit !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "backupGit 必须是布尔值（true / false）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "backupGit", payload.backupGit, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsHotInject) {
				if (typeof payload.hotInject !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "hotInject 必须是布尔值（true / false）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "hotInject", payload.hotInject, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsHotRatio) {
				const n = payload.hotInjectRatio;
				if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100) return {
					status: 400,
					body: {
						ok: false,
						error: `hotInjectRatio 必须是 0–100 之间的数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "hotInjectRatio", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsHotCpt) {
				const n = payload.hotCharsPerToken;
				if (typeof n !== "number" || !Number.isFinite(n) || n < .1 || n > 10) return {
					status: 400,
					body: {
						ok: false,
						error: `hotCharsPerToken 必须是 ${HOT_CHARS_PER_TOKEN_MIN}–10 之间的数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "hotCharsPerToken", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			let hotBudgetWritten;
			if (wantsHotBudget) {
				const n = payload.hotBudgetCharsFallback;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1e3 || n > 1e7) return {
					status: 400,
					body: {
						ok: false,
						error: `hotBudgetCharsFallback 必须是 ${HOT_BUDGET_MIN}–${HOT_BUDGET_MAX} 之间的整数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "hotBudgetCharsFallback", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
				hotBudgetWritten = n;
			}
			let hotFullWarnWritten;
			if (wantsHotFullWarn) {
				const n = payload.hotFullWarnChars;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 1e6) return {
					status: 400,
					body: {
						ok: false,
						error: `hotFullWarnChars 必须是 1–${HOT_FULL_WARN_MAX} 之间的整数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "hotFullWarnChars", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
				hotFullWarnWritten = n;
			}
			let hotKeepWritten;
			if (wantsHotKeep) {
				const n = payload.hotSessionKeep;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 1e4) return {
					status: 400,
					body: {
						ok: false,
						error: `hotSessionKeep 必须是 1–${HOT_SESSION_KEEP_MAX} 之间的整数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "hotSessionKeep", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
				hotKeepWritten = n;
			}
			if (wantsEnIndex) {
				if (typeof payload.enIndex !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "enIndex 必须是布尔值（true / false）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "enIndex", payload.enIndex, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsEnDiag) {
				if (typeof payload.enIndexDiag !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "enIndexDiag 必须是布尔值（true / false）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "enIndexDiag", payload.enIndexDiag, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsTrProvider || wantsTrModel || wantsTrTemplate) {
				const cur = effectiveConfig(await readSettings(deps.baseUrl, deps.config, deps.pluginId));
				const effTemplate = wantsTrTemplate ? String(payload.translateTemplate) : cur.translateTemplate;
				const effProvider = wantsTrProvider ? String(payload.translateProvider) : cur.translateProvider;
				const effModel = wantsTrModel ? String(payload.translateModel) : cur.translateModel;
				const bad = pairingError(effTemplate, effProvider, effModel);
				if (bad !== "") return {
					status: 400,
					body: {
						ok: false,
						error: `未保存：${bad}`,
						pairingError: {
							template: effTemplate,
							provider: effProvider,
							model: effModel
						}
					}
				};
			}
			if (wantsTrProvider) {
				const v = payload.translateProvider;
				if (typeof v !== "string" || v.length > 200) return {
					status: 400,
					body: {
						ok: false,
						error: "translateProvider 必须是字符串（≤200 字符）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "translateProvider", v, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsTrModel) {
				const v = payload.translateModel;
				if (typeof v !== "string" || v.length > 200) return {
					status: 400,
					body: {
						ok: false,
						error: "translateModel 必须是字符串（≤200 字符）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "translateModel", v, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsTrTemplate) {
				if (payload.translateTemplate !== "instruct" && payload.translateTemplate !== "mt") return {
					status: 400,
					body: {
						ok: false,
						error: "translateTemplate 只能是 \"instruct\" 或 \"mt\"。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "translateTemplate", payload.translateTemplate, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsTrConc) {
				const n = payload.translateConcurrency;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 20) return {
					status: 400,
					body: {
						ok: false,
						error: "translateConcurrency 必须是 1–20 之间的整数。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "translateConcurrency", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsTrRetries) {
				const n = payload.translateRetries;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 5) return {
					status: 400,
					body: {
						ok: false,
						error: "translateRetries 必须是 0–5 之间的整数。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "translateRetries", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsTrTimeout) {
				const n = payload.translateTimeoutMs;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1e3 || n > 6e5) return {
					status: 400,
					body: {
						ok: false,
						error: "translateTimeoutMs 必须是 1000–600000 之间的整数。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "translateTimeoutMs", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsTrMaxTok) {
				const n = payload.translateMaxTokens;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 64 || n > 1e5) return {
					status: 400,
					body: {
						ok: false,
						error: "translateMaxTokens 必须是 64–100000 之间的整数。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "translateMaxTokens", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (payload.tagNormalizeProvider !== void 0) {
				const v = payload.tagNormalizeProvider;
				if (typeof v !== "string" || v.length > 200) return {
					status: 400,
					body: {
						ok: false,
						error: "tagNormalizeProvider 必须是字符串（≤200 字符）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "tagNormalizeProvider", v, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (payload.tagNormalizeModel !== void 0) {
				const v = payload.tagNormalizeModel;
				if (typeof v !== "string" || v.length > 200) return {
					status: 400,
					body: {
						ok: false,
						error: "tagNormalizeModel 必须是字符串（≤200 字符）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "tagNormalizeModel", v, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsTagAuto) {
				if (typeof payload.tagNormalizeOnHandoff !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "tagNormalizeOnHandoff 必须是布尔值（true / false）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "tagNormalizeOnHandoff", payload.tagNormalizeOnHandoff, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsTagEffort) {
				const v = payload.tagNormalizeReasoningEffort;
				if (typeof v !== "string" || ![
					"",
					"off",
					"low",
					"medium",
					"high"
				].includes(v)) return {
					status: 400,
					body: {
						ok: false,
						error: "tagNormalizeReasoningEffort 只能是 空 / off / low / medium / high 之一。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "tagNormalizeReasoningEffort", v, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActive) {
				if (typeof payload.activeInject !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "activeInject 必须是布尔值（true / false）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInject", payload.activeInject, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveChannel) {
				const v = payload.activeInjectChannel;
				if (typeof v !== "string" || !ACTIVE_CHANNEL_VALUES.includes(v)) return {
					status: 400,
					body: {
						ok: false,
						error: `activeInjectChannel 只能是 ${ACTIVE_CHANNEL_VALUES.map((x) => `\`${x}\``).join(" / ")}。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectChannel", v, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveModel) {
				const v = payload.activeInjectModel;
				if (typeof v !== "string" || v.length > 200) return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectModel 必须是字符串（≤200 字符）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectModel", v, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveScope) {
				const v = payload.activeInjectScope;
				if (typeof v !== "string" || !ACTIVE_SCOPE_VALUES.includes(v)) return {
					status: 400,
					body: {
						ok: false,
						error: `activeInjectScope 只能是 ${ACTIVE_SCOPE_VALUES.map((x) => `\`${x}\``).join(" / ")}。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectScope", v, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveJevNarrow) {
				if (typeof payload.activeInjectJevNarrowScope !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectJevNarrowScope 必须是布尔值。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectJevNarrowScope", payload.activeInjectJevNarrowScope, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsDecisionProviders) {
				const v = payload.decisionProviders;
				if (!Array.isArray(v)) return {
					status: 400,
					body: {
						ok: false,
						error: "decisionProviders 必须是数组。"
					}
				};
				const cleaned = [];
				const seen = /* @__PURE__ */ new Set();
				for (const raw of v) {
					if (raw === null || typeof raw !== "object") return {
						status: 400,
						body: {
							ok: false,
							error: "decisionProviders 的每一项必须是对象。"
						}
					};
					const o = raw;
					const id = typeof o["id"] === "string" ? o["id"].trim() : "";
					if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(id)) return {
						status: 400,
						body: {
							ok: false,
							error: `provider id「${id || "(空)"}」不合法：只能是字母数字开头、含字母数字/下划线/连字符，最长 48（它会派生出凭据名，所以不能随意写）。`
						}
					};
					if (seen.has(id)) return {
						status: 400,
						body: {
							ok: false,
							error: `provider id「${id}」重复了（同一份配置里必须唯一）。`
						}
					};
					seen.add(id);
					const endpoint = typeof o["endpoint"] === "string" ? o["endpoint"].trim() : "";
					if (!/^https?:\/\/\S+$/i.test(endpoint)) return {
						status: 400,
						body: {
							ok: false,
							error: `provider「${id}」的端点必须是 http:// 或 https:// 开头的 URL（如 https://api.knox.chat/v1/systemone）。`
						}
					};
					const models = (Array.isArray(o["models"]) ? o["models"] : []).filter((m) => typeof m === "string").map((m) => m.trim()).filter((m) => m !== "");
					cleaned.push({
						id,
						displayName: typeof o["displayName"] === "string" ? o["displayName"].trim().slice(0, 100) : "",
						endpoint,
						models
					});
				}
				const w = await writeSetting(deps.baseUrl, "decisionProviders", cleaned, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			for (const [key, wants] of [["activeInjectDecisionPick", wantsActiveDecisionPick], ["hotScoreDecisionPick", wantsHotScoreDecisionPick]]) {
				if (!wants) continue;
				const v = payload[key];
				if (typeof v !== "string" || v.length > 200) return {
					status: 400,
					body: {
						ok: false,
						error: `${key} 必须是字符串（≤200 字符）。`
					}
				};
				const pick = v.trim();
				if (pick !== "") {
					const i = pick.indexOf("/");
					const pid = i > 0 ? pick.slice(0, i) : "";
					if (pid === "") return {
						status: 400,
						body: {
							ok: false,
							error: `${key} 要写成「providerId/模型名」（当前是「${pick}」）。`
						}
					};
					if (!decisionProvidersOf(effectiveConfig(await readSettings(deps.baseUrl, deps.config, deps.pluginId))).some((p) => p.id === pid)) return {
						status: 400,
						body: {
							ok: false,
							error: `${key} 指向的 provider「${pid}」不存在 —— 请先在列表里加它。`
						}
					};
				}
				const w = await writeSetting(deps.baseUrl, key, pick, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveStrict) {
				if (typeof payload.activeInjectStrict !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectStrict 必须是布尔值。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectStrict", payload.activeInjectStrict, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveExplain) {
				if (typeof payload.activeInjectExplain !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectExplain 必须是布尔值。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectExplain", payload.activeInjectExplain, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveIntentGate) {
				if (typeof payload.activeInjectSearchIntentGate !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectSearchIntentGate 必须是布尔值。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectSearchIntentGate", payload.activeInjectSearchIntentGate, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveSuffGate) {
				if (typeof payload.activeInjectSufficientGate !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectSufficientGate 必须是布尔值。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectSufficientGate", payload.activeInjectSufficientGate, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveTopK) {
				const n = payload.activeInjectTopK;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 50) return {
					status: 400,
					body: {
						ok: false,
						error: `activeInjectTopK 必须是 1–50 之间的整数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectTopK", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveTimeout) {
				const n = payload.activeInjectTimeoutMs;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 500 || n > 12e4) return {
					status: 400,
					body: {
						ok: false,
						error: `activeInjectTimeoutMs 必须是 500–${ACTIVE_TIMEOUT_MAX} 之间的整数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectTimeoutMs", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveRounds) {
				const n = payload.activeInjectContextRounds;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 50) return {
					status: 400,
					body: {
						ok: false,
						error: `activeInjectContextRounds 必须是 1–50 之间的整数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectContextRounds", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActivePool) {
				const n = payload.activeInjectPoolMax;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 10 || n > 2e3) return {
					status: 400,
					body: {
						ok: false,
						error: `activeInjectPoolMax 必须是 10–${ACTIVE_POOL_MAX_MAX} 之间的整数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectPoolMax", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveInjections) {
				const n = payload.activeInjectMaxInjectionsPerTurn;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 50) return {
					status: 400,
					body: {
						ok: false,
						error: `activeInjectMaxInjectionsPerTurn 必须是 0–50 之间的整数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectMaxInjectionsPerTurn", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveReasoningCap) {
				const n = payload.activeInjectReasoningMaxChars;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 100 || n > 1e5) return {
					status: 400,
					body: {
						ok: false,
						error: `activeInjectReasoningMaxChars 必须是 100–${ACTIVE_REASONING_MAX_CHARS_MAX} 之间的整数。`
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectReasoningMaxChars", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveBudget) {
				if (typeof payload.activeInjectBudget !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectBudget 必须是布尔值。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectBudget", payload.activeInjectBudget, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveBudgetTok) {
				const n = payload.activeInjectBudgetTokens;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1e3 || n > 2e5) return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectBudgetTokens 必须是 1000–200000 之间的整数。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectBudgetTokens", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveCtxTok) {
				const n = payload.activeInjectContextTokens;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1e3 || n > 2e5) return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectContextTokens 必须是 1000–200000 之间的整数。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectContextTokens", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveConc) {
				const n = payload.activeInjectConcurrency;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 16) return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectConcurrency 必须是 1–16 之间的整数。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectConcurrency", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActiveChatRatio) {
				const n = payload.activeInjectChatWindowRatio;
				if (typeof n !== "number" || !Number.isFinite(n) || n < .1 || n > 1) return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectChatWindowRatio 必须是 0.1–1 之间的数。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectChatWindowRatio", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsActivePoolMin) {
				const n = payload.activeInjectPoolMin;
				if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 500) return {
					status: 400,
					body: {
						ok: false,
						error: "activeInjectPoolMin 必须是 1–500 之间的整数。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeInjectPoolMin", n, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			if (wantsRecallLogRequest) {
				if (typeof payload.activeRecallLogRequest !== "boolean") return {
					status: 400,
					body: {
						ok: false,
						error: "activeRecallLogRequest 必须是布尔值（true / false）。"
					}
				};
				const w = await writeSetting(deps.baseUrl, "activeRecallLogRequest", payload.activeRecallLogRequest, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
			}
			const writeFraction = async (key, raw) => {
				if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) return {
					ok: false,
					error: `${key} 必须是 0–1 之间的数。`
				};
				const w = await writeSetting(deps.baseUrl, key, raw, deps.pluginId);
				return w.ok ? { ok: true } : {
					ok: false,
					error: w.message
				};
			};
			if (wantsActiveBand) {
				const r = await writeFraction("activeInjectBand", payload.activeInjectBand);
				if (!r.ok) return {
					status: 400,
					body: {
						ok: false,
						error: r.error
					}
				};
			}
			if (wantsActiveNeedMin) {
				const r = await writeFraction("activeInjectNeedMin", payload.activeInjectNeedMin);
				if (!r.ok) return {
					status: 400,
					body: {
						ok: false,
						error: r.error
					}
				};
			}
			if (wantsActiveItemMin) {
				const r = await writeFraction("activeInjectItemMin", payload.activeInjectItemMin);
				if (!r.ok) return {
					status: 400,
					body: {
						ok: false,
						error: r.error
					}
				};
			}
			if (wantsActiveIntentMin) {
				const r = await writeFraction("activeInjectSearchIntentMin", payload.activeInjectSearchIntentMin);
				if (!r.ok) return {
					status: 400,
					body: {
						ok: false,
						error: r.error
					}
				};
			}
			if (wantsActiveSuffMin) {
				const r = await writeFraction("activeInjectSufficientMin", payload.activeInjectSufficientMin);
				if (!r.ok) return {
					status: 400,
					body: {
						ok: false,
						error: r.error
					}
				};
			}
			const hotScoreWritten = {};
			/**
			* 统一的"写一个键"（校验通过才写；失败立刻返回 400）。
			* ⚠️ `key` 的类型是 `Parameters<typeof writeSetting>[1]` —— **不写死 `string`**，
			*    否则 `writeSetting` 的受控键联合会拒收（那是它的契约，别放松它）。
			*/
			const writeHotScore = async (key, raw, check) => {
				const err = check(raw);
				if (err !== void 0) return {
					status: 400,
					body: {
						ok: false,
						error: err
					}
				};
				const w = await writeSetting(deps.baseUrl, key, raw, deps.pluginId);
				if (!w.ok) return {
					status: 400,
					body: {
						ok: false,
						error: w.message,
						patchPath: w.patchPath
					}
				};
				hotScoreWritten[key] = raw;
			};
			const boolAt = (key) => typeof payload[key] === "boolean" ? void 0 : `${key} 必须是布尔值（true / false）。`;
			/** 0–1 的小数（⚠️ 不能用 `Number.isInteger`）。 */
			const fracAt = (key) => {
				const v = payload[key];
				return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? void 0 : `${key} 必须是 0–1 之间的数。`;
			};
			/** 非负整数（带上限）。 */
			const natAt = (key, max) => {
				const v = payload[key];
				return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? void 0 : `${key} 必须是 0–${max} 之间的整数。`;
			};
			/** 正数（窗口小时数允许小数）。 */
			const posAt = (key, max) => {
				const v = payload[key];
				return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? void 0 : `${key} 必须是 0–${max} 之间的正数。`;
			};
			const strAt = (key) => typeof payload[key] === "string" ? void 0 : `${key} 必须是字符串。`;
			const oneOfAt = (key, allowed) => {
				const v = payload[key];
				return typeof v === "string" && allowed.includes(v) ? void 0 : `${key} 只能是 ${allowed.map((x) => `\`${x}\``).join(" / ")}。`;
			};
			for (const k of HOT_SCORE_BOOL_KEYS) {
				if (payload[k] === void 0) continue;
				const bad = await writeHotScore(k, payload[k], () => boolAt(k));
				if (bad !== void 0) return bad;
			}
			if (payload.hotScoreThreshold !== void 0) {
				const bad = await writeHotScore("hotScoreThreshold", payload.hotScoreThreshold, () => fracAt("hotScoreThreshold"));
				if (bad !== void 0) return bad;
			}
			if (payload.hotScoreWindowHours !== void 0) {
				const bad = await writeHotScore("hotScoreWindowHours", payload.hotScoreWindowHours, () => posAt("hotScoreWindowHours", 1e4));
				if (bad !== void 0) return bad;
			}
			if (payload.hotScoreTopN !== void 0) {
				const bad = await writeHotScore("hotScoreTopN", payload.hotScoreTopN, () => natAt("hotScoreTopN", 200));
				if (bad !== void 0) return bad;
			}
			if (payload.hotScoreMaxPicks !== void 0) {
				const bad = await writeHotScore("hotScoreMaxPicks", payload.hotScoreMaxPicks, () => natAt("hotScoreMaxPicks", 200));
				if (bad !== void 0) return bad;
			}
			if (payload.hotScoreGateMinScore !== void 0) {
				const bad = await writeHotScore("hotScoreGateMinScore", payload.hotScoreGateMinScore, () => natAt("hotScoreGateMinScore", 1e3));
				if (bad !== void 0) return bad;
			}
			if (payload.hotScoreMinChars !== void 0) {
				const bad = await writeHotScore("hotScoreMinChars", payload.hotScoreMinChars, () => natAt("hotScoreMinChars", 1e6));
				if (bad !== void 0) return bad;
			}
			if (payload.hotScoreChannel !== void 0) {
				const bad = await writeHotScore("hotScoreChannel", payload.hotScoreChannel, () => oneOfAt("hotScoreChannel", ["chat", "jev"]));
				if (bad !== void 0) return bad;
			}
			for (const k of [
				"hotScoreModel",
				"hotScoreSubagentProvider",
				"hotScoreSubagentModel"
			]) {
				const raw = payload[k];
				if (raw === void 0) continue;
				const bad = await writeHotScore(k, raw, () => strAt(k));
				if (bad !== void 0) return bad;
			}
			if (payload.hotScoreTimeoutMs !== void 0) {
				const bad = await writeHotScore("hotScoreTimeoutMs", payload.hotScoreTimeoutMs, () => posAt("hotScoreTimeoutMs", 3e5));
				if (bad !== void 0) return bad;
			}
			for (const k of CONTEXT_REPORT_BOOL_KEYS) {
				if (payload[k] === void 0) continue;
				const bad = await writeHotScore(k, payload[k], () => boolAt(k));
				if (bad !== void 0) return bad;
			}
			for (const k of CONTEXT_REPORT_NUM_KEYS) {
				if (payload[k] === void 0) continue;
				const bad = await writeHotScore(k, payload[k], () => natAt(k, 100));
				if (bad !== void 0) return bad;
			}
			const r2 = await readSettings(deps.baseUrl, deps.config, deps.pluginId);
			return {
				status: 200,
				body: {
					ok: true,
					...wantsTheme ? { themeCreation: payload.themeCreation } : {},
					...warnWritten !== void 0 ? { progressCharsWarn: warnWritten } : {},
					...keepWritten !== void 0 ? { progressCharsKeep: keepWritten } : {},
					...payload.backupGit !== void 0 ? { backupGit: payload.backupGit } : {},
					...wantsHotInject ? { hotInject: payload.hotInject } : {},
					...wantsHotRatio ? { hotInjectRatio: payload.hotInjectRatio } : {},
					...wantsHotCpt ? { hotCharsPerToken: payload.hotCharsPerToken } : {},
					...hotBudgetWritten !== void 0 ? { hotBudgetCharsFallback: hotBudgetWritten } : {},
					...hotFullWarnWritten !== void 0 ? { hotFullWarnChars: hotFullWarnWritten } : {},
					...hotKeepWritten !== void 0 ? { hotSessionKeep: hotKeepWritten } : {},
					...wantsEnIndex ? { enIndex: payload.enIndex } : {},
					...wantsEnDiag ? { enIndexDiag: payload.enIndexDiag } : {},
					...wantsTrProvider ? { translateProvider: payload.translateProvider } : {},
					...wantsTrModel ? { translateModel: payload.translateModel } : {},
					...wantsTagProvider ? { tagNormalizeProvider: payload.tagNormalizeProvider } : {},
					...wantsTagModel ? { tagNormalizeModel: payload.tagNormalizeModel } : {},
					...wantsTagAuto ? { tagNormalizeOnHandoff: payload.tagNormalizeOnHandoff } : {},
					...wantsTagEffort ? { tagNormalizeReasoningEffort: payload.tagNormalizeReasoningEffort } : {},
					...wantsTrTemplate ? { translateTemplate: payload.translateTemplate } : {},
					...wantsTrConc ? { translateConcurrency: payload.translateConcurrency } : {},
					...wantsTrRetries ? { translateRetries: payload.translateRetries } : {},
					...wantsTrTimeout ? { translateTimeoutMs: payload.translateTimeoutMs } : {},
					...wantsTrMaxTok ? { translateMaxTokens: payload.translateMaxTokens } : {},
					...wantsActive ? { activeInject: payload.activeInject } : {},
					...wantsActiveChannel ? { activeInjectChannel: payload.activeInjectChannel } : {},
					...wantsActiveModel ? { activeInjectModel: payload.activeInjectModel } : {},
					...wantsActiveScope ? { activeInjectScope: payload.activeInjectScope } : {},
					...wantsActiveJevNarrow ? { activeInjectJevNarrowScope: payload.activeInjectJevNarrowScope } : {},
					...wantsDecisionProviders ? { decisionProviders: payload.decisionProviders } : {},
					...wantsActiveDecisionPick ? { activeInjectDecisionPick: payload.activeInjectDecisionPick } : {},
					...wantsHotScoreDecisionPick ? { hotScoreDecisionPick: payload.hotScoreDecisionPick } : {},
					...wantsActiveStrict ? { activeInjectStrict: payload.activeInjectStrict } : {},
					...wantsActiveTopK ? { activeInjectTopK: payload.activeInjectTopK } : {},
					...wantsActiveBand ? { activeInjectBand: payload.activeInjectBand } : {},
					...wantsActiveNeedMin ? { activeInjectNeedMin: payload.activeInjectNeedMin } : {},
					...wantsActiveItemMin ? { activeInjectItemMin: payload.activeInjectItemMin } : {},
					...wantsActiveTimeout ? { activeInjectTimeoutMs: payload.activeInjectTimeoutMs } : {},
					...wantsActiveRounds ? { activeInjectContextRounds: payload.activeInjectContextRounds } : {},
					...wantsActivePool ? { activeInjectPoolMax: payload.activeInjectPoolMax } : {},
					...wantsActiveExplain ? { activeInjectExplain: payload.activeInjectExplain } : {},
					...wantsActiveIntentGate ? { activeInjectSearchIntentGate: payload.activeInjectSearchIntentGate } : {},
					...wantsActiveIntentMin ? { activeInjectSearchIntentMin: payload.activeInjectSearchIntentMin } : {},
					...wantsActiveSuffGate ? { activeInjectSufficientGate: payload.activeInjectSufficientGate } : {},
					...wantsActiveSuffMin ? { activeInjectSufficientMin: payload.activeInjectSufficientMin } : {},
					...hotScoreWritten,
					...wantsActiveInjections ? { activeInjectMaxInjectionsPerTurn: payload.activeInjectMaxInjectionsPerTurn } : {},
					...wantsActiveReasoningCap ? { activeInjectReasoningMaxChars: payload.activeInjectReasoningMaxChars } : {},
					...wantsActiveBudget ? { activeInjectBudget: payload.activeInjectBudget } : {},
					...wantsActiveBudgetTok ? { activeInjectBudgetTokens: payload.activeInjectBudgetTokens } : {},
					...wantsActiveCtxTok ? { activeInjectContextTokens: payload.activeInjectContextTokens } : {},
					...wantsActiveConc ? { activeInjectConcurrency: payload.activeInjectConcurrency } : {},
					...wantsActiveChatRatio ? { activeInjectChatWindowRatio: payload.activeInjectChatWindowRatio } : {},
					...wantsActivePoolMin ? { activeInjectPoolMin: payload.activeInjectPoolMin } : {},
					...wantsRecallLogRequest ? { activeRecallLogRequest: payload.activeRecallLogRequest } : {},
					message: r2.patchReload === "live" ? "已写入 cordis.patch.yml，热重载会在数秒内生效。" : "已写入 cordis.patch.yml。⚠️ 本 profile 的 patchReload 不是 live，**需要重启才生效**。",
					patchPath: r2.patchPath,
					needsRestart: r2.patchReload !== "live"
				}
			};
		}
		if (route === "/backup/status") {
			if (method !== "GET") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 GET"
				}
			};
			const probe = await probeGit();
			const repo = await readRepoState();
			const last = await lastCommit();
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
					progressCharsKeep: deps.config.progressCharsKeep
				}
			};
		}
		if (route === "/backup/setup") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			const r = await ensureRepo();
			const steps = [...r.steps];
			let baselineCount = 0;
			if (r.ok && r.identity.name !== "") try {
				const snap = await (await import("./search-Zl0qE59D.js").then((n) => n.Gt)).scanLibrary({ includeArchived: true });
				for (const p of snap.projects) {
					const narrative = narrativeFromProjectText(p.text);
					if (await writeNarrativeMirror(p.id, narrative)) baselineCount += 1;
				}
				if (baselineCount > 0) {
					const c = await commitAll(r.identity, "memj-handoff: 初始基线（本开关开启时建立）\n把所有项目的正文镜像登记为第一个版本");
					steps.push({
						id: "baseline",
						label: "建立正文镜像基线",
						ok: c.ok,
						detail: c.ok ? `为 ${baselineCount} 个项目建了基线${c.committed && c.hash !== "" ? `（提交 ${c.hash}）` : ""}` : c.error
					});
				} else steps.push({
					id: "baseline",
					label: "建立正文镜像基线",
					ok: true,
					detail: "无需新建（镜像已是最新）"
				});
			} catch (err) {
				steps.push({
					id: "baseline",
					label: "建立正文镜像基线",
					ok: false,
					detail: `${err instanceof Error ? err.message : String(err)}（不影响开启，下次 handoff 会补上）`
				});
			}
			return {
				status: r.ok ? 200 : 400,
				body: {
					ok: r.ok,
					steps,
					repoPath: r.repoPath,
					identity: r.identity,
					baselineCount,
					error: r.ok ? "" : r.steps.find((s) => !s.ok)?.detail ?? "环境准备失败"
				}
			};
		}
		/** 修复非法封面：局部块替换 + 硬校验。 */
		if (route === "/fix-cover") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let payload;
			try {
				payload = JSON.parse(rawBody);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			const file = payload.file ?? "";
			const startLine = Number(payload.startLine ?? 0);
			const endLine = Number(payload.endLine ?? 0);
			if (file === "" || startLine < 1 || endLine < 1) return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 file / startLine / endLine"
				}
			};
			const raw = payload.cover ?? {};
			const cover = {
				id: typeof raw.id === "string" ? raw.id.trim() : "",
				project: typeof raw.project === "string" ? raw.project.trim() : "",
				theme: Array.isArray(raw.theme) ? raw.theme.map((t) => String(t).trim()).filter((t) => t !== "") : [],
				global: raw.global === true,
				kind: isEntryKind(raw.kind) ? raw.kind : "",
				tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim()).filter((t) => t !== "") : [],
				title: typeof raw.title === "string" ? raw.title : "",
				desc: typeof raw.desc === "string" ? raw.desc : "",
				ref: typeof raw.ref === "string" ? raw.ref.trim() : "",
				ext: raw.ext === true,
				createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
				updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
				archivedAt: typeof raw.archivedAt === "string" ? raw.archivedAt : ""
			};
			const rawKind = typeof payload.rawKind === "string" ? payload.rawKind : typeof raw.kind === "string" ? raw.kind : void 0;
			const result = await fixCoverBlock(file, startLine, endLine, cover, rawKind);
			if (!result.ok) return {
				status: 400,
				body: { ...result }
			};
			return {
				status: 200,
				body: { ok: true }
			};
		}
		/** 断链修复：只允许改 `ref`（§12-78 不允许改 ext）。 */
		if (route === "/fix-ref") {
			if (method !== "POST") return {
				status: 405,
				body: {
					ok: false,
					error: "该接口只接受 POST"
				}
			};
			let payload;
			try {
				payload = JSON.parse(rawBody);
			} catch {
				return {
					status: 400,
					body: {
						ok: false,
						error: "请求体不是合法 JSON"
					}
				};
			}
			const file = payload.file ?? "";
			const startLine = Number(payload.startLine ?? 0);
			const endLine = Number(payload.endLine ?? 0);
			const ref = payload.ref ?? "";
			if (file === "" || startLine < 1 || endLine < 1) return {
				status: 400,
				body: {
					ok: false,
					error: "缺少 file / startLine / endLine"
				}
			};
			if (!isAbsolutePath(ref.trim())) return {
				status: 400,
				body: {
					ok: false,
					error: "外部引用的 ref 必须是绝对路径"
				}
			};
			const result = await fixExternalRef(file, startLine, endLine, ref);
			if (!result.ok) return {
				status: 400,
				body: { ...result }
			};
			return {
				status: 200,
				body: { ok: true }
			};
		}
		return {
			status: 404,
			body: {
				ok: false,
				error: `未知的 API 路径：${route}`
			}
		};
	} catch (err) {
		return {
			status: 500,
			body: {
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			}
		};
	}
}
//#endregion
//#region src/tag-vocab.ts
/**
* 标签规范词表（决策 162）。
*
* ── 它解决什么 ────────────────────────────────────────────────────────────
* `tags` 从第一天起就是**自由格式**（决策 81：*"`kind` 用固定 enum 补上治理缺口，
* `tags` 继续承担**自由补充**的角色"*）。实测（生产库 335 张封面、2026-09-28）：
* **807 个不同 tag，571 个（70.8%）只出现 1 次**；8 组大小写同名
* （`dsh` 51 vs `DSH` 24）；**243 对包含关系** ⇒ 作为聚合维度**不可用**。
*
* ⇒ 本模块是那张**规范词表**：canonical（规范词）+ aliases（同义词）。
*   工具每次裁决完把结论**积累**进来 ⇒ 库越用越干净，而不是每次从零判。
*
* ── 🔴🔴 它是 source data，不是 derived data ──────────────────────────────
* | | `recall/en-index.json` | `tags/vocabulary.json`（本文） |
* |---|---|---|
* | 怎么来 | **纯投影**（重翻就能重建） | **积累的判断**（人和 LLM 的裁决） |
* | 丢了 | 重跑就有 | 🔴 **永久丢失** |
* | 所以 | 全量重建 + diff | ⚠️ **只能增量对账，绝不"重建"** |
*
* ⚠️ **别照抄 `en-index` 那套重建逻辑**——它会**静默抹掉**所有积累的裁决，
* 而且看起来像"修好了"（条数对、结构对、就是判断没了）。
*
* ── 结构 ──────────────────────────────────────────────────────────────────
* ```json
* {
*   "version": 1,
*   "lastRunAt": "2026-09-28T12:00:00.000Z",
*   "canonical": {
*     "静默失败": { "aliases": ["静默失效"], "en": "silent failure" }
*   }
* }
* ```
* ⭐ **`lastRunAt`（水位线）与词表同一个文件**（用户 2026-09-28 裁定）：
* 它俩要么一起更新、要么一起不动——分成两个文件就会出现
* "**水位线推了、词表没落盘**" ⇒ **那批新 tag 永久跳过**。
*
* ⚠️ **不存 `count`（频次）**：每次现算。存了必然过期（本项目老坑）。
*
* @module dsh-memj/tag-vocab
*/
/** 空词表（首次使用）。 */
function emptyVocabulary(nowIso) {
	return {
		version: 1,
		lastRunAt: nowIso,
		canonical: {}
	};
}
/**
* 读词表；不存在或损坏 ⇒ `undefined`（**不抛**）。
*
* ⚠️ **损坏时回 `undefined` 而不是空表**：空表会让调用方以为"库里一个词都没有"，
* 从而把**全库 tag 当新词**重新裁决一遍（白花一大笔 token，还可能得出不同结论）。
* ⇒ 判据：**"读不出来"与"确实是空的"必须区分**。
* @returns 词表；不存在/损坏时 `undefined`。
*/
async function loadVocabulary() {
	let text;
	try {
		text = await readFile(tagVocabularyPath(), "utf8");
	} catch {
		return;
	}
	try {
		const p = JSON.parse(text);
		if (p?.version !== 1 || typeof p.canonical !== "object" || p.canonical === null) return void 0;
		if (typeof p.lastRunAt !== "string") return void 0;
		const cleaned = {};
		for (const [k, v] of Object.entries(p.canonical)) {
			if (k.trim() === "") continue;
			const raw = v ?? {};
			cleaned[k] = {
				aliases: Array.isArray(raw.aliases) ? raw.aliases.map((a) => String(a).trim()).filter((a) => a !== "" && a !== k) : [],
				en: typeof raw.en === "string" ? raw.en.trim() : ""
			};
		}
		return {
			version: 1,
			lastRunAt: p.lastRunAt,
			canonical: cleaned
		};
	} catch {
		return;
	}
}
/** 原子写词表（`mode 0o600`，与 `en-index.json` 同手法）。 */
async function saveVocabulary(vocab) {
	const target = tagVocabularyPath();
	await mkdir(dirname(target), { recursive: true });
	await writeFileAtomic(target, `${JSON.stringify(vocab, null, 1)}\n`, {
		mode: 384,
		dirMode: 448
	});
}
/**
* 建一张「词 → canonical」的反查表（**含 canonical 自身**）。
*
* ⭐ **canonical 自身也映射到自己**：这样 `resolveTag` 对"已经是规范词"的输入
* 返回它自己，调用方**不必先判它是不是 canonical**（少一处漏判的机会）。
* @param vocab - 词表。
* @returns 反查表。
*/
function aliasIndex(vocab) {
	const m = /* @__PURE__ */ new Map();
	for (const [canon, info] of Object.entries(vocab.canonical)) {
		m.set(canon, canon);
		for (const a of info.aliases) if (!m.has(a)) m.set(a, canon);
	}
	return m;
}
/**
* ⭐⭐ **解析一个 tag 到它的 canonical**（纯查表，**零 LLM**）。
*
* ⇒ 这是「应用层」的核心：**便宜、可对全库跑**。
* @param tag - 原始 tag。
* @param idx - `aliasIndex()` 的产物。
* @returns canonical；**词表里没有**时 `undefined`（= 待裁决的新词）。
*/
function resolveTag(tag, idx) {
	return idx.get(tag.trim());
}
/**
* 检出 alias 冲突（同一 alias 指向多个 canonical）。
*
* 🔴 **必须报错而不是"后来者覆盖"**：那会让裁决结果取决于**对象键序**
* （同一份词表两次读可能给出不同结果），是最难查的一类不一致。
* @param vocab - 词表。
* @returns 冲突清单（alias + 它指向的多个 canonical）。
*/
function findAliasConflicts(vocab) {
	const seen = /* @__PURE__ */ new Map();
	for (const [canon, info] of Object.entries(vocab.canonical)) for (const a of info.aliases) {
		if (!seen.has(a)) seen.set(a, /* @__PURE__ */ new Set());
		seen.get(a)?.add(canon);
	}
	const out = [];
	for (const [alias, targets] of seen) if (targets.size > 1) out.push({
		alias,
		targets: [...targets].sort()
	});
	return out.sort((a, b) => a.alias.localeCompare(b.alias));
}
/**
* 把一组合并映射**解析成最终形态**（处理传递合并与环）。
*
* 例：`{A→B, B→C}` ⇒ `{A→C, B→C}`；`{A→B, B→A}` ⇒ 判为环、整组拒绝。
*
* 🔴 **为什么必须做**：LLM 一次给出多条映射时，完全可能 `A→B` 而 `B` 自己也
* 被并走了。若原样应用，**先改 A 成 B、再把 B 改成 C** ⇒ 取决于顺序
* （本项目"顺序敏感的静默错误"老坑）。⇒ 先归一成**指向终点**的形态。
* @param merge - 原始映射。
* @returns `ok:false` 时带环里的词。
*/
function resolveMerges(merge) {
	const map = {};
	for (const [from, to] of Object.entries(merge)) {
		const f = from.trim();
		const t = to.trim();
		if (f === "" || t === "" || f === t) continue;
		map[f] = t;
	}
	const final = {};
	for (const start of Object.keys(map)) {
		const path = [start];
		let cur = map[start];
		while (cur !== void 0 && map[cur] !== void 0) {
			if (path.includes(cur)) return {
				ok: false,
				cycle: [...path, cur]
			};
			path.push(cur);
			cur = map[cur];
		}
		final[start] = cur ?? start;
	}
	return {
		ok: true,
		map: final
	};
}
/**
* 应用合并后的 canonical 是否会**自相矛盾**（两个 canonical 并到同一个目标）。
*
* ⚠️ 这**不是错误**（合法且常见），但调用方要**把它们合成一条**——
* 否则会留下两个 canonical 指向同一目标，`aliasIndex` 就会报冲突。
* @param vocab - 词表。
* @param merges - 已解析的合并映射（`resolveMerges` 的产物）。
* @returns 新的 `canonical` 表（canonical 自身被并走时，其 aliases 归到目标名下）。
*/
function applyMerges(vocab, merges) {
	const next = {};
	for (const [canon, info] of Object.entries(vocab.canonical)) {
		const target = merges[canon] ?? canon;
		if (!next[target]) next[target] = {
			aliases: [],
			en: ""
		};
		if (target !== canon) next[target].aliases.push(canon);
		for (const a of info.aliases) if ((merges[a] ?? a) !== target) next[target].aliases.push(a);
		if (next[target].en === "") next[target].en = info.en;
	}
	for (const [from, to] of Object.entries(merges)) {
		if (to === from) continue;
		if (!next[to]) next[to] = {
			aliases: [],
			en: ""
		};
		if (from !== to) next[to].aliases.push(from);
	}
	for (const [canon, info] of Object.entries(next)) info.aliases = [...new Set(info.aliases)].filter((a) => a !== canon);
	return {
		...vocab,
		canonical: next
	};
}
//#endregion
//#region src/tag-normalize.ts
var tag_normalize_exports = /* @__PURE__ */ __exportAll({
	extractJson: () => extractJson,
	normalizeTags: () => normalizeTags,
	seedVocabulary: () => seedVocabulary
});
/** 回执里最多列几条改动（避免刷屏）。 */
const MAX_LIST = 12;
/**
* 空裁决（各种**提前返回**路径共用）。
*
* ⚠️ 抽成函数是刻意的：它有 **5 处**调用点（路由拿不到 / JSON 不可解析 /
*    有环 / 冲突 / 正常无候选），逐处手写必然漏字段（TS 会报，但漏的形态
*    取决于当时写的是哪几个键）——本项目"同一份东西抄五遍必然漂移"的老坑。
* @returns 空的 `decided`。
*/
function emptyDecided() {
	return {
		merged: {},
		mergeWhy: {},
		added: {},
		dropped: {}
	};
}
/**
* **各种提前返回路径共用的空结果碎片**（`ok:false` 时用）。
*
* ⚠️ 同上：5 处提前返回，逐处手写 `retagged: []` / `rejected: []` 必然漏
* （TS 会报，但我已经在这个文件里漏过一次字段了）。
* @param previewOnly - 是否预览。
* @param vocab - 当前词表（算 `vocabStats`）。
* @param scanned - 参与裁决的条目数。
* @param pending - 候选。
* @returns 可直接展开进返回值的片段。
*/
function emptyTail(previewOnly, vocab, scanned, pending) {
	const entries = Object.values(vocab.canonical);
	return {
		scanned,
		pending,
		decided: emptyDecided(),
		retagged: [],
		rejected: [],
		affected: [],
		translatedEn: 0,
		previewOnly,
		vocabStats: {
			canonical: entries.length,
			aliases: entries.reduce((s, e) => s + e.aliases.length, 0),
			withEn: entries.filter((e) => e.en !== "").length
		}
	};
}
/**
* B 层：裁决提示词。
*
* ⚠️ 英文更稳（同 `en-index` 的教训：中文问句会让判断力弱的模型分辨率归零）。
*
* 🔴🔴 **它必须【允许动已有规范词】**：我第一版把输入写成"NEW tags（词表里没有的）"
* 并且只接受"新词"作为键 ⇒ 加上播种把全库 tag 都登记成了 canonical
* ⇒ **LLM 结构上永远无法合并两个已登记的规范词** ⇒ 词表变成**单向棘轮**
* （进了词表就再也动不了）。⭐ 用户指出："词表只作为选项和上下文，
* **所有的处理全都应该交给模型**"。
*/
const ADJUDICATE_SYSTEM = `You curate the TAG VOCABULARY of a personal knowledge base.

INPUT
- "VOCABULARY": the canonical tags that already exist, each with its aliases.
  ⚠️ This is a list of OPTIONS to prefer and reuse — it is NOT a whitelist.
  You MAY merge, rename or drop an existing canonical when it is genuinely wrong,
  but you MUST justify it (see RULES).
- "TAGS IN SCOPE": every tag used by the entries being processed, with its
  frequency in the whole library. Tags already in VOCABULARY appear here too.
- "ENTRIES": the knowledge entries (id, title, current tags, and optionally an
  excerpt of the body).

TASK — decide, and explain every decision:
1. "merge": <tag> means the SAME concept as <target>. Give the target and WHY.
   Typical cases: case/spelling variants (dsh -> DSH, css -> CSS); synonyms
   (排查 -> 排障); a variant folding into a higher-frequency entry point.
2. "drop": <tag> conveys nothing on its own and has no suitable target.
   Give WHY. (e.g. 设计 / 顺序 / 边界 / 处理 / 问题 as a bare word)
3. "add": <tag> is a genuinely NEW topic that the existing vocabulary does not
   cover. Give WHY — and the reason must show that the entries actually discuss
   something the vocabulary cannot express. ⚠️ Do NOT add a new canonical merely
   because a tag is missing from the vocabulary — if it is a synonym or a
   variant of an existing canonical, use "merge" instead.
4. "retag": for an entry whose tags do NOT fit its body, give the corrected list
   and WHY. This is the only place where a tag may be ADDED to or REMOVED from
   an entry. ⚠️ Only do this when the body clearly supports it; when in doubt,
   leave the entry alone (do not output it).

RULES

🔴 RULE 1 — LEVEL CHECK (this is the rule most often violated; read it first).
Before ANY merge, ask these two questions about the source and target:
  (a) Is the TARGET a general category (other, more specific things could also be called by it)?
  (b) Is the SOURCE a specific form, implementation, or proper name of that category?
  If BOTH are yes, it is a broader-into-narrower (or narrower-into-broader) relation:
  **DO NOT MERGE.** Keep both.

Concrete patterns that MUST NOT be merged (regardless of how similar they look):
  - generic noun  vs  specific name     : 钩子 vs turn-stopping ; 工具 vs memj_read
  - category  vs  specific implementation: agent vs 子代理 ; 模型 vs JEV
  - same concept in two LANGUAGES        : 会话 vs session ; 缓存 vs cache
    (the user ruled that Chinese and English tags stay separate — do NOT unify them)
  - broader term vs its subtype          : 前端 vs UI ; 缓存 vs 前缀缓存 ; 注入 vs 主动注入

⚠️ Do NOT reason "they are related, so merge them". Related is not the same as same.
⚠️ Do NOT merge a HIGH-frequency general word into a LOW-frequency specific one,
   or the reverse — frequency difference is itself a hint that levels differ.
   If "TAGS IN SCOPE" shows one tag covering many entries across different topics
   while the other covers one narrow entry, they are almost certainly different levels.

RULE 2 — PREFER REUSE over invention. A new canonical is a long-term commitment —
only add one when the concept is real, recurring, and not already expressible.
When in doubt, do NOT add.

RULE 3 — A high-frequency generic tag can be a useful ENTRY POINT: prefer merging its
variants INTO it (测试策略 -> 测试) rather than dropping it. NOTE: this is about the
generic tag KEEPING its role as an entry point — it does NOT license merging a
specific name into it when that name denotes a distinct thing (see RULE 1).

⚠️ "why" must be a REAL reason (one short clause), not a restatement of the
decision. "they are the same" is not a reason; "same concept, dsh is just the
lowercase spelling" is. Decisions without a reason are REJECTED.
⭐ When you merge, state in "why" WHICH case it is (spelling variant / synonym /
plural / abbreviation) — if you cannot name one of those cases, do not merge.
- Only mention tags that appear in "TAGS IN SCOPE", and entry ids from "ENTRIES".

Reply with ONLY a JSON object, no prose, no code fence. Every value needs "why":
{"merge":{"<tag>":{"to":"<target>","why":"..."}},
 "drop":{"<tag>":{"why":"..."}},
 "add":{"<tag>":{"why":"..."}},
 "retag":{"<entry id>":{"tags":["..."],"why":"..."}}}
Use {} for any category you have no decision about.`;
/** C 层：生成英文规范词的提示词。 */
const TRANSLATE_SYSTEM = `Translate each Chinese knowledge-base tag into a short English canonical tag.
Rules:
- Lowercase, except well-known acronyms and product names (CSS, DSH, PowerShell, YAML, CDP, UI, JEV).
- Keep it 1-3 words, no punctuation, no trailing period.
- Use the same English term for tags that mean the same thing.
Reply with ONLY a JSON object mapping the Chinese tag to its English form,
no prose, no code fence.`;
registerPromptDefault("tag:system", ADJUDICATE_SYSTEM);
registerPromptDefault("tag:translate-system", TRANSLATE_SYSTEM);
/** 读取正文（按开关截断）。 */
async function loadBodyExcerpt(cover, mode) {
	if (mode === "none" || cover.ext) return "";
	const { loadEntryDoc } = await import("./search-Zl0qE59D.js").then((n) => n.Gt);
	const body = ((await loadEntryDoc(cover.ref, cover.ext))?.body ?? "").trim();
	if (body === "") return "";
	const limit = mode === "full" ? Number.POSITIVE_INFINITY : 1e3;
	return body.length > limit ? `${body.slice(0, limit)}…` : body;
}
async function callModel(ctx, config, route, system, user) {
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: user
		}],
		source: { kind: "plugin:dsh-memj" }
	})];
	const guard = deadline(void 0, config.tagNormalizeTimeoutMs, "MEMJ_TAG_NORMALIZE_TIMEOUT");
	const llm = ctx.get("llm");
	if (llm?.stream === void 0) return {
		text: "",
		empty: true,
		finish: "",
		reasoningChars: 0,
		called: false
	};
	try {
		const assembler = new BlockAssembler();
		const effort = config.tagNormalizeReasoningEffort;
		for await (const chunk of llm.stream({
			provider: route.provider,
			model: route.model,
			messages,
			system,
			temperature: 0,
			maxTokens: config.tagNormalizeMaxTokens,
			signal: guard.signal,
			...effort === "" ? {} : { reasoningEffort: effort }
		})) assembler.push(chunk);
		guard.signal.throwIfAborted();
		const blocks = assembler.blocks();
		const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
		const reasoningChars = blocks.filter((b) => b.type === "reasoning").reduce((s, b) => s + b.text.length, 0);
		return {
			text,
			empty: text.trim() === "",
			finish: String(assembler.finish?.kind ?? ""),
			reasoningChars,
			called: true
		};
	} catch (err) {
		return {
			text: "",
			empty: true,
			finish: `异常：${err instanceof Error ? err.message : String(err)}`.slice(0, 120),
			reasoningChars: 0,
			called: true
		};
	} finally {
		guard[Symbol.dispose]();
	}
}
/** 从模型输出里抠出第一个 JSON 对象（容忍 ```json 围栏与前后噪音）。 */
function extractJson(text) {
	const body = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? text;
	const start = body.indexOf("{");
	const end = body.lastIndexOf("}");
	if (start < 0 || end <= start) return void 0;
	try {
		return JSON.parse(body.slice(start, end + 1));
	} catch {
		return;
	}
}
/**
* 跑一次规范化（三层）。
* @param ctx - 插件上下文（B/C 层要调模型）。
* @param config - 配置。
* @param opts - 范围与开关。
* @returns 结果（含回执）。
*/
async function normalizeTags(ctx, config, opts = {}) {
	const mode = opts.includeBody ?? "truncated";
	const previewOnly = opts.preview === true;
	const openedAt = (/* @__PURE__ */ new Date()).toISOString();
	let vocab = await loadVocabulary();
	const firstRun = vocab === void 0;
	if (vocab === void 0) vocab = emptyVocabulary(openedAt);
	const startedFrom = opts.since ?? vocab.lastRunAt;
	const useWatermark = opts.full !== true && opts.since === void 0;
	const conflicts = findAliasConflicts(vocab);
	if (conflicts.length > 0) return {
		ok: false,
		message: `词表有 **${conflicts.length} 处 alias 冲突**（同一同义词指向多个规范词）——必须先修掉，否则合并结果取决于对象键序：
` + conflicts.map((c) => `  · \`${c.alias}\` → ${c.targets.map((t) => `\`${t}\``).join(" 与 ")}`).join("\n"),
		...emptyTail(previewOnly, vocab, 0, [])
	};
	const snapshot = await scanLibrary({ includeArchived: true });
	const idx = aliasIndex(vocab);
	const watermark = vocab.lastRunAt;
	const inScope = snapshot.covers.filter((c) => {
		if (opts.full === true) return true;
		const t = c.cover.updatedAt ?? "";
		if (t === "") return false;
		if (opts.since !== void 0) return t > opts.since;
		if (useWatermark) return t > watermark;
		return true;
	});
	const globalFreq = /* @__PURE__ */ new Map();
	const globalSamples = /* @__PURE__ */ new Map();
	for (const c of snapshot.covers) for (const t of c.cover.tags) {
		globalFreq.set(t, (globalFreq.get(t) ?? 0) + 1);
		const arr = globalSamples.get(t) ?? [];
		if (arr.length < 3) {
			arr.push({
				id: c.cover.id,
				title: c.cover.title,
				project: c.cover.project
			});
			globalSamples.set(t, arr);
		}
	}
	const pendingMap = /* @__PURE__ */ new Map();
	for (const c of inScope) for (const t of c.cover.tags) if (!pendingMap.has(t)) pendingMap.set(t, {
		tag: t,
		count: globalFreq.get(t) ?? 0,
		inVocabulary: resolveTag(t, idx) !== void 0,
		samples: globalSamples.get(t) ?? []
	});
	const pending = [...pendingMap.values()].sort((a, b) => b.count - a.count);
	const merged = {};
	const mergeWhyAll = {};
	const added = {};
	const addWhyAll = {};
	const dropped = {};
	const dropWhyAll = {};
	/** ⭐ `retag`：按正文修条目的 tag（**唯一允许增删条目 tag 的通道**）。 */
	const retagAll = /* @__PURE__ */ new Map();
	/** ⚠️ 被硬校验丢弃的决定（**必须如实报出**，否则模型不知道输出被削过）。 */
	const rejectedAll = [];
	let adjudicationNote = "";
	if (pending.length > 0 && firstRun && opts.full !== true && opts.since === void 0) adjudicationNote = "（首次运行：水位线已初始化为现在，未裁决任何历史 tag）";
	else if (pending.length > 0) {
		const estTokens = Math.round((Object.keys(vocab.canonical).length * 40 + pending.length * 60 + (mode === "none" ? 0 : inScope.length * (mode === "full" ? 3e3 : 1e3))) / 2);
		if (estTokens > 6e4) return {
			ok: false,
			message: `⚠️ **这次请求会太大**（约 ${estTokens} token：${pending.length} 个候选 tag、${inScope.length} 条正文、词表 ${Object.keys(vocab.canonical).length} 条）——**未发出**。\n⚠️ 本工具**不拆批**（裁决要看全局，拆批会让同一个词在不同批里判出不同结论）⇒
    请任选其一降规模：
      · \`includeBody: 'none'\`（不喂正文，最省）；
      · 去掉 \`full\`，让它只处理水位线之后的知识（**常态用法**）；
      · 先用 \`preview: true\` 看规模，再决定。`,
			...emptyTail(previewOnly, vocab, inScope.length, pending)
		};
		const route = resolveRoute(ctx, config);
		if (route === void 0) return {
			ok: false,
			message: `发现 **${pending.length} 个候选 tag** 需要裁决，但**拿不到模型路由**。\n⚠️ 请在设置面板里配好「标签裁决模型」（\`tagNormalizeProvider\` / \`tagNormalizeModel\`），或让主会话有默认模型。`,
			...emptyTail(previewOnly, vocab, inScope.length, pending)
		};
		const lines = ["## VOCABULARY (options to prefer and reuse — NOT a whitelist)"];
		for (const [canon, info] of Object.entries(vocab.canonical)) lines.push(`- ${canon}${info.aliases.length > 0 ? ` (aliases: ${info.aliases.join(", ")})` : ""}`);
		lines.push("", "## TAGS IN SCOPE (every tag used by the entries below)");
		const showCoverage = (p) => {
			if (p.samples.length === 0) return "";
			const titles = p.samples.slice(0, 3).map((s) => s.title);
			return `  ← ${p.count === 1 ? "only 1 entry" : `across ${p.count} entries`}: ${titles.map((t) => `「${t}」`).join(" ")}`;
		};
		const MAX_COVERAGE = 150;
		let coverageShown = 0;
		for (const p of pending) {
			lines.push(`- ${p.tag}  [frequency: ${p.count}]${p.inVocabulary ? "  (already in vocabulary)" : ""}`);
			if (p.count >= 2 && coverageShown < MAX_COVERAGE) {
				const cov = showCoverage(p);
				if (cov !== "") {
					lines.push(cov);
					coverageShown += 1;
				}
			}
		}
		if (coverageShown >= MAX_COVERAGE && pending.length > MAX_COVERAGE) lines.push(`(coverage evidence shown for the first ${MAX_COVERAGE} multi-entry tags only; tags without it are either single-entry or beyond that limit)`);
		if (mode !== "none") {
			lines.push("", "## ENTRIES");
			const byId = new Map(snapshot.covers.map((c) => [c.cover.id, c.cover]));
			for (const c of inScope) {
				const cover = byId.get(c.cover.id);
				if (cover === void 0) continue;
				const body = await loadBodyExcerpt(cover, mode);
				lines.push(`### id: ${c.cover.id} | ${c.cover.title}`);
				lines.push(`current tags: ${c.cover.tags.join(", ")}`);
				if (body !== "") lines.push("body excerpt:", body);
				lines.push("");
			}
		}
		const reply = await callModel(ctx, config, route, promptText("tag:system", ADJUDICATE_SYSTEM), lines.join("\n"));
		const parsed = reply.text === "" ? void 0 : extractJson(reply.text);
		if (parsed === void 0 || typeof parsed !== "object" || parsed === null) {
			const effortNow = config.tagNormalizeReasoningEffort;
			const looksUnsupported = reply.empty && reply.reasoningChars === 0 && effortNow !== "";
			return {
				ok: false,
				message: `裁决失败，本轮**未写入任何东西**。\n  ${!reply.called ? "拿不到 `llm` 服务（`ctx.get('llm')` 为空）。" : reply.empty ? `**模型没有输出任何内容**（finish=\`${reply.finish}\`，思考 ${reply.reasoningChars} 字符）。\n` + (looksUnsupported ? `    ⚠️ **思考为 0 而正文也为空** ⇒ 很可能是**这个模型不支持 \`${effortNow}\` 档**\n       （实测：\`hy3\` + \`off\` 会在 **2ms** 内返回空正文，且**不报错**）。\n       · 换 \`deepseek-v4.1-flash\`（实测 \`off\` 下思考 0、正文正常）；
       · 或把「思考等级」改成**空**（不传，让它用上游默认）。` : "    ⚠️ 若 `finish=length` 且思考字符很多 ⇒ **思考吃掉了 maxTokens**：\n       · 换一个**能关掉思考**的模型（实测 `hy3` 关不掉，会烧光输出预算）；\n       · 或调大 `tagNormalizeMaxTokens`。") : `模型**输出了内容但不是可解析的 JSON**（${reply.text.length} 字符）。\n    （片段：${reply.text.slice(0, 200)}）`}`,
				...emptyTail(previewOnly, vocab, inScope.length, pending)
			};
		}
		const rejected = [];
		const candidateSet = new Set(pending.map((p) => p.tag));
		/** 取 `why`；太短（<8 字符）视为"没给理由"（"same" 这种不算理由）。 */
		const whyOf = (v) => {
			if (v === null || typeof v !== "object") return "";
			const w = v.why;
			return typeof w === "string" ? w.trim() : "";
		};
		const reasonOk = (w) => w.length >= 8;
		const o = parsed;
		const rawMerge = {};
		const mergeWhy = {};
		if (o.merge !== null && typeof o.merge === "object") for (const [k, v] of Object.entries(o.merge)) {
			if (!candidateSet.has(k)) {
				rejected.push(`merge \`${k}\`（不在本轮候选里）`);
				continue;
			}
			const to = typeof v?.to === "string" ? String(v.to).trim() : "";
			const why = whyOf(v);
			if (to === "") {
				rejected.push(`merge \`${k}\`（缺 to）`);
				continue;
			}
			if (!reasonOk(why)) {
				rejected.push(`merge \`${k}\`（**缺理由**）`);
				continue;
			}
			if (!candidateSet.has(to) && resolveTag(to, idx) === void 0) {
				rejected.push(`merge \`${k}\`→\`${to}\`（目标是词表外的未知词）`);
				continue;
			}
			rawMerge[k] = to;
			mergeWhy[k] = why;
		}
		const addList = [];
		const addWhy = {};
		if (o.add !== null && typeof o.add === "object") for (const [k, v] of Object.entries(o.add)) {
			if (!candidateSet.has(k)) {
				rejected.push(`add \`${k}\`（不在本轮候选里）`);
				continue;
			}
			if (resolveTag(k, idx) !== void 0) {
				rejected.push(`add \`${k}\`（**已在词表里**，应走复用）`);
				continue;
			}
			const why = whyOf(v);
			if (!reasonOk(why) || why.length < 20) {
				rejected.push(`add \`${k}\`（**理由不足**：新增规范词要说明"正文在讲词表覆盖不了的事"）`);
				continue;
			}
			addList.push(k);
			addWhy[k] = why;
		}
		const dropList = [];
		const dropWhy = {};
		if (o.drop !== null && typeof o.drop === "object") for (const [k, v] of Object.entries(o.drop)) {
			if (!candidateSet.has(k)) {
				rejected.push(`drop \`${k}\`（不在本轮候选里）`);
				continue;
			}
			const why = whyOf(v);
			if (!reasonOk(why)) {
				rejected.push(`drop \`${k}\`（**缺理由**）`);
				continue;
			}
			dropList.push(k);
			dropWhy[k] = why;
		}
		const retag = /* @__PURE__ */ new Map();
		if (o.retag !== null && typeof o.retag === "object") {
			const inScopeIds = new Set(inScope.map((c) => c.cover.id));
			for (const [id, v] of Object.entries(o.retag)) {
				if (!inScopeIds.has(id)) {
					rejected.push(`retag \`${id.slice(0, 8)}\`（不在本轮范围内）`);
					continue;
				}
				const tags = Array.isArray(v?.tags) ? v.tags.map((x) => String(x).trim()).filter((x) => x !== "") : [];
				const why = whyOf(v);
				if (!reasonOk(why)) {
					rejected.push(`retag \`${id.slice(0, 8)}\`（**缺理由**）`);
					continue;
				}
				if (tags.length === 0) {
					rejected.push(`retag \`${id.slice(0, 8)}\`（**改成了空列表**）`);
					continue;
				}
				retag.set(id, {
					tags,
					why
				});
			}
		}
		Object.assign(mergeWhyAll, mergeWhy);
		Object.assign(addWhyAll, addWhy);
		Object.assign(dropWhyAll, dropWhy);
		retagAll.clear();
		for (const [k, v] of retag) retagAll.set(k, v);
		rejectedAll.push(...rejected);
		const resolved = resolveMerges(rawMerge);
		if (!resolved.ok) return {
			ok: false,
			message: `裁决结果里有**循环合并**（${resolved.cycle.map((c) => `\`${c}\``).join(" → ")}），本轮**未写入**。\n⚠️ 循环合并会让结果取决于应用顺序 ⇒ 必须人工看一眼。`,
			...emptyTail(previewOnly, vocab, inScope.length, pending)
		};
		Object.assign(merged, resolved.map);
		for (const t of addList) if (!(t in merged)) added[t] = addWhy[t] ?? "";
		for (const t of dropList) dropped[t] = dropWhy[t] ?? "";
	}
	const nextVocab = applyMerges(vocab, merged);
	for (const t of Object.keys(added)) if (nextVocab.canonical[t] === void 0) nextVocab.canonical[t] = {
		aliases: [],
		en: ""
	};
	for (const t of Object.keys(dropped)) delete nextVocab.canonical[t];
	const applyIdx = aliasIndex(nextVocab);
	const affected = [];
	for (const c of snapshot.covers) {
		const rt = retagAll.get(c.cover.id);
		const source = rt !== void 0 ? rt.tags : c.cover.tags;
		const to = [];
		for (const t of source) {
			const r = resolveTag(t, applyIdx);
			if (r === void 0) {
				if (!to.includes(t)) to.push(t);
				continue;
			}
			if (!to.includes(r)) to.push(r);
		}
		const final = to.length === 0 ? [...c.cover.tags] : to;
		if (JSON.stringify(final) !== JSON.stringify(c.cover.tags)) affected.push({
			id: c.cover.id,
			project: c.cover.project,
			from: [...c.cover.tags],
			to: final,
			...rt !== void 0 ? { retagWhy: rt.why } : {}
		});
	}
	let written = 0;
	if (!previewOnly && affected.length > 0) {
		const { setEntryFields } = await Promise.resolve().then(() => edit_exports);
		for (const a of affected) if ((await setEntryFields(a.id, { tags: a.to }, {
			preserveUpdatedAt: true,
			allowArchived: true
		})).ok) written += 1;
		const { rebuildDerivedLayers } = await import("./search-Zl0qE59D.js").then((n) => n.Gt);
		await rebuildDerivedLayers();
	}
	let translatedEn = 0;
	if (!previewOnly) {
		const needEn = Object.entries(nextVocab.canonical).filter(([, v]) => v.en === "");
		if (needEn.length > 0) {
			const route = resolveTranslateRoute(ctx, config);
			if (route !== void 0) {
				const chunks = chunkBy(needEn.map(([k]) => k), 80);
				for (const chunk of chunks) {
					const reply = await callModel(ctx, config, route, promptText("tag:translate-system", TRANSLATE_SYSTEM), `Tags:\n${chunk.map((t) => `- ${t}`).join("\n")}`);
					const parsed = reply.text === "" ? void 0 : extractJson(reply.text);
					if (parsed === null || parsed === void 0 || typeof parsed !== "object") continue;
					for (const [k, v] of Object.entries(parsed)) if (nextVocab.canonical[k] !== void 0 && typeof v === "string" && v.trim() !== "") {
						nextVocab.canonical[k].en = v.trim();
						translatedEn += 1;
					}
				}
			}
		}
	}
	if (!previewOnly) {
		nextVocab.lastRunAt = openedAt;
		await saveVocabulary(nextVocab);
	}
	vocab = nextVocab;
	const stats = vocabStatsOf(vocab);
	const mergedCount = Object.keys(merged).length;
	const lines = [];
	lines.push(`${previewOnly ? "🔍 **预览**（未写入）" : "✅ **标签规范化完成**"} —— 词表 ${stats.canonical} 个规范词 / ${stats.aliases} 个同义词 / ${stats.withEn} 条有英文。`);
	lines.push(`范围：${inScope.length} 条参与裁决${opts.full === true ? "（**全库重跑**）" : `（水位线 ${startedFrom}）`}`);
	if (pending.length === 0) lines.push("候选 tag：**0 个**（水位线之后没有需要看的知识）。");
	else lines.push(`候选 tag：${pending.length} 个（其中 **${pending.filter((p) => p.inVocabulary).length} 个已在词表里**——⚠️ 它们**照样被送去裁决**，词表只是选项清单） → 合并 ${mergedCount}、新增 ${Object.keys(added).length}、丢弃 ${Object.keys(dropped).length}`);
	for (const [k, why] of Object.entries(mergeWhyAll).slice(0, MAX_LIST)) lines.push(`  · 合并 \`${k}\` → \`${merged[k]}\`：${why}`);
	for (const [k, why] of Object.entries(addWhyAll).slice(0, MAX_LIST)) lines.push(`  · ⭐ 新增规范词 \`${k}\`：${why}`);
	for (const [k, why] of Object.entries(dropWhyAll).slice(0, MAX_LIST)) lines.push(`  · 丢弃 \`${k}\`：${why}`);
	if (retagAll.size > 0) {
		lines.push(`⭐ 按正文修正的条目：**${retagAll.size} 条**（这是唯一会增删条目 tag 的通道）`);
		for (const [id, v] of [...retagAll.entries()].slice(0, MAX_LIST)) lines.push(`  · ${id.slice(0, 8)}：${v.tags.join(", ")} —— ${v.why}`);
	}
	if (affected.length === 0) lines.push("条目改动：**0 条**（词表决定已全部落到数据上）。");
	else {
		lines.push(`条目改动：**${affected.length} 条**${previewOnly ? "" : `（已写 ${written}）`}`);
		for (const a of affected.slice(0, MAX_LIST)) lines.push(`  · ${a.project}/${a.id.slice(0, 8)}：${a.from.join(", ")}  →  ${a.to.join(", ")}`);
		if (affected.length > MAX_LIST) lines.push(`  …（还有 ${affected.length - MAX_LIST} 条）`);
	}
	if (rejectedAll.length > 0) lines.push(`⚠️ **${rejectedAll.length} 条决定被硬校验丢弃**（缺理由 / 越界 / 已在词表里还"新增"…）：\n` + rejectedAll.slice(0, MAX_LIST).map((r) => `  · ${r}`).join("\n") + "\n    ⇒ 改/删已有词、新增规范词**都必须给 `why`**；新增还要说明\"正文在讲词表覆盖不了的事\"。");
	if (translatedEn > 0) lines.push(`英文规范词：新增 ${translatedEn} 条。`);
	if (adjudicationNote !== "") lines.push(adjudicationNote);
	return {
		ok: true,
		message: lines.join("\n"),
		scanned: inScope.length,
		pending: pending.slice(0, MAX_LIST),
		decided: {
			merged,
			mergeWhy: mergeWhyAll,
			added,
			dropped
		},
		retagged: [...retagAll.entries()].map(([id, v]) => ({
			id,
			from: [...snapshot.covers.find((c) => c.cover.id === id)?.cover.tags ?? []],
			to: v.tags,
			why: v.why
		})),
		rejected: rejectedAll,
		affected,
		translatedEn,
		previewOnly,
		vocabStats: stats
	};
	function vocabStatsOf(v) {
		const entries = Object.values(v.canonical);
		return {
			canonical: entries.length,
			aliases: entries.reduce((s, e) => s + e.aliases.length, 0),
			withEn: entries.filter((e) => e.en !== "").length
		};
	}
}
/** 按大小切块（英文翻译分批，避免一次性请求过长）。 */
function chunkBy(arr, size) {
	const out = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}
/** 裁决模型的路由（配了用自己的，否则跟主会话默认）。 */
function resolveRoute(ctx, config) {
	if (config.tagNormalizeProvider !== "" && config.tagNormalizeModel !== "") return {
		provider: config.tagNormalizeProvider,
		model: config.tagNormalizeModel
	};
	return defaultRoute(ctx);
}
/** 翻译模型的路由（复用 en-index 的键）。 */
function resolveTranslateRoute(ctx, config) {
	if (config.translateProvider !== "" && config.translateModel !== "") return {
		provider: config.translateProvider,
		model: config.translateModel
	};
	return defaultRoute(ctx);
}
/** 主会话的默认模型。 */
function defaultRoute(ctx) {
	try {
		const cur = ctx.get("agentDefaultModel")?.currentSelection?.();
		if (cur?.provider && cur.model) return {
			provider: cur.provider,
			model: cur.model
		};
	} catch {}
}
/**
* ⭐⭐ **播种词表**（决策 162）：把库里现有的全部 tag 登记为 canonical（**零 LLM**）。
*
* 🔴 **为什么需要**：不播种的话，词表从空开始 ⇒ `插件`(51)、`缓存`(12) 这些
* **老词头几次会被当成"新 tag"裁决一遍**（能判对，但白花 token，还可能被误判）。
*
* ⚠️ **播种不推水位线**（保持"现在"）—— 否则首次运行就会把 276 条正文全喂一遍。
* @param vocab - 词表（会被就地修改）。
* @param tags - 要登记的 tag（含频次无所谓，只登记名字）。
* @returns 新登记了几个。
*/
function seedVocabulary(vocab, tags) {
	let n = 0;
	for (const t of tags) {
		const tag = t.trim();
		if (tag === "") continue;
		if (vocab.canonical[tag] === void 0) {
			vocab.canonical[tag] = {
				aliases: [],
				en: ""
			};
			n += 1;
		}
	}
	return n;
}
//#endregion
//#region src/score-log.ts
/**
* ⭐⭐⭐ **知识评分日志**（决策 177；`<库根>/score-log/session-<id>.jsonl`）。
*
* ── 为什么必须落盘（照 `recall-log` 的同一理由 —— 库内知识 `5b9bbc6e`）──────
* > **"算完就丢的中间量是调参能力的缺口"**
*
* 本功能有一个**必然要调**的参数：`hotScoreThreshold`（过多少分才加分）。
* ⚠️ 阈值定得不合适时，表现是**"一条都没加分"** —— 而那有**两种解释而表现一样**：
* ① 真的没有相关知识；② 阈值太高。⇒ ⭐ **唯一能区分的证据是【全部分数的分布】**。
* ⇒ 日志**记全部候选的 raw 分数**，不只记过阈值的。
*
* ⭐ 用户对这一条的原话是 *"先做出来再调试"* ⇒ **分布数据就是"调试"的输入**。
*
* @module dsh-memj/score-log
*/
/**
* 追加一条评分日志。
*
* 🔴 **绝不抛** —— 日志坏了不能连累评分（它与 `.startup-diag.txt` 同款纪律）。
* ⚠️ **追加，不是重写**：`appendFile` 保证既有内容不动。
* @param record - 记录。
*/
async function appendScoreLog(record) {
	try {
		const path = scoreLogPath(record.sessionId);
		await mkdir(dirname(path), { recursive: true });
		await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
	} catch {}
}
/**
* 读某会话的评分日志（供探针与排障用）。
*
* ⚠️ 与写侧对称：解析失败的**行跳过、不整份丢**。
* @param sessionId - 会话 id。
* @returns 记录数组（按写入顺序）；文件不存在时 `[]`。
*/
async function readScoreLog(sessionId) {
	const { readTextIfExists } = await import("./files-baWgIuqu.js").then((n) => n.r);
	const text = await readTextIfExists(scoreLogPath(sessionId));
	if (text === void 0 || text.trim() === "") return [];
	const out = [];
	for (const line of text.split(/\r?\n/)) {
		if (line.trim() === "") continue;
		try {
			out.push(JSON.parse(line));
		} catch {}
	}
	return out;
}
//#endregion
//#region src/score-chat.ts
/** 空结果（各短路路径共用，保证形状一致）。 */
function empty(error, raw = "") {
	return {
		ok: false,
		picks: [],
		reasons: {},
		quotes: {},
		rejected: [],
		raw,
		error
	};
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
只输出一个 JSON 对象，没有任何其他文字、没有 markdown 代码块。`;
/** ⭐ **登记默认值**（展示页要用）。 */
registerPromptDefault("score:system", SCORE_SYSTEM_BASE);
const SCORE_QUOTE_RULE = `【\`quote\` 是硬要求】
\`quote\` 必须是【本轮工作内容】里**逐字复制**的一句原话（不要改写、不要概括、不要翻译）。
⚠️ 它会与上下文做**逐字比对**：不是原文里出现过的原句 ⇒ **该条不予加分**。
⭐ \`why\` 必须说明：**上面那句原话里的需求/错误，被这条知识的哪一点解决了**。
🔴 **只是"话题相关"不够** —— 必须能指出"靠这句原话 + 这条知识，下次会做对什么"。`;
const SCORE_PICK_PRINCIPLE = `⭐ **宁少勿滥** —— 只选真的能改变做法的；**一条都没有就回 \`{"picks":[]}\`**。
🔴 **不要为了凑数而选** —— 选错会污染这个项目的注入内容。
⚠️ 如果够格的条目多于本次允许的条数，**只留最能改变做法的那几条**。`;
registerPromptDefault("score:quote-rule", SCORE_QUOTE_RULE);
registerPromptDefault("score:pick-principle", SCORE_PICK_PRINCIPLE);
const SCORE_USER_TASK = `请从上面的【知识库清单】里挑出真正能帮助到这个项目的条目，**最多 {{k}} 条**。
⚠️ 如果够格的超过 {{k}} 条，请**按"能改变做法"的程度排序，只留最前面的 {{k}} 条** —— **宁缺勿滥**，凑数会污染这个项目的注入内容。`;
registerPromptDefault("score:user-task", SCORE_USER_TASK);
const SCORE_INDEX_RANGE = "⚠️ 编号必须在 1 到 {{n}} 之间。";
const SCORE_POOL_HEADER = "【知识库清单】（共 {{n}} 条）";
registerPromptDefault("score:index-range", SCORE_INDEX_RANGE);
registerPromptDefault("score:pool-header", SCORE_POOL_HEADER);
/**
* ⭐⭐ **`system`：判断要求 + 知识库清单**。
*
* ⚠️ **排布不能改**（§6.4 的硬约束）：清单是输入大头，必须与"每次都变的东西"分开，
*    且 **`system` 里绝不能出现可配的 K**（K 一变 ⇒ 整份 `system` 失效 ⇒ 清单被拖出缓存）。
* @param opts - 候选池 + 是否给理由 + 清单语言 + 超预算说明。
* @returns `system` 文本。
*/
function buildChatScoreSystem(opts) {
	const lines = [];
	lines.push(promptText("score:system", SCORE_SYSTEM_BASE));
	if (opts.wantReasons) {
		lines.push("{\"picks\":[{\"n\":编号,\"quote\":\"原句\",\"why\":\"这条知识怎么解决它\"},...]}");
		lines.push("");
		lines.push(promptText("score:quote-rule", SCORE_QUOTE_RULE));
	} else lines.push("{\"picks\":[编号,...]}");
	lines.push(fillSlots(promptText("score:index-range", SCORE_INDEX_RANGE), { n: String(opts.pool.length) }));
	lines.push(promptText("score:pick-principle", SCORE_PICK_PRINCIPLE));
	if (opts.budgetNote !== "") lines.push(`⚠️ ${opts.budgetNote}`);
	lines.push("");
	lines.push(fillSlots(promptText("score:pool-header", SCORE_POOL_HEADER), { n: String(opts.pool.length) }));
	opts.pool.forEach((c, i) => {
		const title = opts.english ? c.titleEn !== "" ? c.titleEn : c.title : c.title;
		const desc = opts.english ? c.descEn !== "" ? c.descEn : c.desc : c.desc;
		lines.push(`${i + 1}. TITLE: ${title} / DESC: ${desc}`);
	});
	return lines.join("\n");
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
function buildChatScoreUser(turnContent, maxPicks) {
	const k = Math.max(1, Math.floor(maxPicks));
	return `【本轮工作内容】\n${turnContent}\n\n` + fillSlots(promptText("score:user-task", SCORE_USER_TASK), { k: String(k) });
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
function parseChatScore(raw, pool, wantReasons, maxPicks, ctxForQuote) {
	try {
		return parseChatScoreInner(raw, pool, wantReasons, maxPicks, ctxForQuote);
	} catch (err) {
		return empty(`解析时抛异常（${String(err).slice(0, 100)}）：${raw.slice(0, 120)}`, raw);
	}
}
/** `parseChatScore` 的实现体（**抛异常由外层兜住** ⇒ 见那里的注释）。 */
function parseChatScoreInner(raw, pool, wantReasons, maxPicks, ctxForQuote) {
	const text = stripFence(raw).trim();
	if (text === "") return empty("模型没有返回正文", raw);
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start < 0 || end <= start) return empty(`没有找到 JSON 对象：${text.slice(0, 120)}`, raw);
	let obj;
	try {
		obj = JSON.parse(text.slice(start, end + 1));
	} catch (err) {
		return empty(`JSON 解析失败（${String(err).slice(0, 80)}）：${text.slice(0, 120)}`, raw);
	}
	const picksRaw = obj?.picks;
	if (!Array.isArray(picksRaw)) return empty("返回值里没有 `picks` 数组", raw);
	const picks = [];
	const reasons = {};
	/** ⭐ 每条入选的**原句引文**（决策 183）—— 它已通过逐字校验。 */
	const quotes = {};
	/** ⭐ 被引文校验丢掉的那些（**如实报出**，供调提示词 —— 见函数头的可观测性纪律）。 */
	const rejected = [];
	const seen = /* @__PURE__ */ new Set();
	const cap = maxPicks === void 0 ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor(maxPicks));
	for (const p of picksRaw) {
		if (picks.length >= cap) break;
		const nRaw = typeof p === "number" ? p : p?.n;
		const n = typeof nRaw === "number" ? nRaw : Number(nRaw);
		if (!Number.isInteger(n) || n < 1 || n > pool.length) continue;
		if (seen.has(n)) continue;
		const c = pool[n - 1];
		if (c === void 0) continue;
		if (wantReasons && ctxForQuote !== void 0) {
			const chk = checkQuote(p?.quote, ctxForQuote);
			if (!chk.ok) {
				rejected.push({
					n,
					reason: chk.reason
				});
				continue;
			}
			quotes[c.id] = chk.norm;
		}
		seen.add(n);
		picks.push(c.id);
		if (wantReasons) {
			const w = p?.why;
			if (typeof w === "string" && w.trim() !== "") reasons[c.id] = w.trim();
		}
	}
	return {
		ok: true,
		picks,
		reasons,
		quotes,
		rejected,
		raw,
		error: ""
	};
}
/** 剥掉 markdown 代码围栏（模型很爱包一层 ```json）。 */
function stripFence(s) {
	const m = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
	return m !== null ? m[1] ?? s : s;
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
function checkQuote(quote, context) {
	/** ⚠️ 只折叠空白（格式差异），**不做**任何"意思级"归一。 */
	const norm = (s) => s.replace(/\s+/g, " ").trim();
	if (typeof quote !== "string") return {
		ok: false,
		reason: "没有给 `quote` 字段",
		norm: ""
	};
	const q = norm(quote);
	if (q.length < 8) return {
		ok: false,
		reason: `引文太短（${q.length} < 8 字符）⇒ 无法证明是引用`,
		norm: q
	};
	const hay = norm(context);
	if (hay === "") return {
		ok: false,
		reason: "上下文为空 ⇒ 无从比对",
		norm: q
	};
	if (!hay.includes(q)) return {
		ok: false,
		reason: "引文在上下文里【找不到逐字匹配】⇒ 是改写而非引用",
		norm: q
	};
	return {
		ok: true,
		reason: "",
		norm: q
	};
}
/**
* ⭐ **引文的最短字符数**（决策 183）。
*
* ⚠️ 取 8 是个**折中**：太短（如 4）会让"随便抄几个字"就通过；太长（如 30）
* 会让**短而准**的引用（"注入没触发"这种）被误杀。
* ⭐ 按"失败模式不对称"（库内知识 `9d61d1e3`）：**误杀**只是少加一次分（下轮还会再来），
*    而**放过**会让"改写"混进来、让这个门槛形同虚设 ⇒ 宁可略严。
*/
const MIN_QUOTE_CHARS = 8;
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
async function scoreViaChat(ctx, config, opts) {
	const route = splitRoute$1(config.hotScoreModel);
	if (route === void 0) return empty(`chat 通路的模型要写成 provider/model，当前是「${config.hotScoreModel}」（去设置面板重选一个即可）`);
	const llm = ctx.get("llm");
	if (llm?.stream === void 0) return empty("拿不到 llm 服务（ctx.get('llm') 是 undefined）");
	const system = buildChatScoreSystem({
		pool: opts.pool,
		wantReasons: true,
		english: false,
		budgetNote: ""
	});
	const maxPicks = Math.max(1, Math.floor(config.hotScoreMaxPicks));
	const user = buildChatScoreUser(opts.turnContent, maxPicks);
	const guard = deadline(void 0, config.hotScoreTimeoutMs, "MEMJ_SCORE_CHAT_TIMEOUT");
	try {
		const options = {
			provider: route.provider,
			model: route.model,
			system,
			messages: [createUserMessage({
				content: [{
					type: "text",
					text: user
				}],
				source: { kind: "plugin:dsh-memj" }
			})],
			temperature: 0,
			maxTokens: 4e3,
			reasoningEffort: "off",
			signal: guard.signal
		};
		const assembler = new BlockAssembler();
		for await (const chunk of llm.stream(options)) assembler.push(chunk);
		guard.signal.throwIfAborted();
		const { text, kinds } = textOfAssembler(assembler);
		if (text.trim() === "") {
			const ks = kinds.join("+");
			return empty(ks.includes("reasoning") ? `模型只回了思考、没有正文（收到的块：${ks}）⇒ 该模型关不掉思考，换一个能关的` : `模型没有返回任何内容（收到的块：${ks || "无"}）`);
		}
		return parseChatScore(text, opts.pool, true, maxPicks, opts.turnContent);
	} catch (err) {
		return empty(`chat 通路调用失败：${String(err)}`);
	} finally {
		guard[Symbol.dispose]();
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
function textOfAssembler(a) {
	const blocks = a.blocks();
	const kinds = [...new Set(blocks.map((b) => String(b.type)))];
	return {
		text: blocks.filter((b) => b.type === "text").map((b) => b.text).join(""),
		kinds
	};
}
/** 拆 `provider/model`（⚠️ model 里可能含 `/` ⇒ **只按第一个 `/` 切**）。 */
function splitRoute$1(s) {
	const i = s.indexOf("/");
	if (i <= 0 || i === s.length - 1) return void 0;
	return {
		provider: s.slice(0, i),
		model: s.slice(i + 1)
	};
}
//#endregion
//#region src/score-turn.ts
var score_turn_exports = /* @__PURE__ */ __exportAll({
	JEV_SCORE_INSTRUCTION: () => JEV_SCORE_INSTRUCTION,
	readTurnContent: () => readTurnContent,
	scoreTurn: () => scoreTurn,
	scoredEntryIds: () => scoredEntryIds
});
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
const JEV_SCORE_INSTRUCTION = "This is a RETROSPECTIVE review of a completed turn (see `turn_content`). Would `candidates[N]` have helped the engineer do this turn better — either because they needed this knowledge but did not have it, or because they made a mistake that this knowledge would have prevented? Answer yes only if having that entry available would have MATERIALLY changed what they did. Do NOT answer yes merely because the topic is related, nor because the entry restates something they already did correctly.";
registerPromptDefault("score:jev-instruction", JEV_SCORE_INSTRUCTION);
/** 空结果（各种短路路径共用，保证形状一致）。 */
function emptyResult(note) {
	return {
		ok: false,
		message: note,
		project: "",
		pool: 0,
		evaluated: 0,
		batches: 0,
		okBatches: 0,
		ms: 0,
		scores: [],
		added: [],
		note
	};
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
async function readTurnContent(ctx, sessionId, turn) {
	try {
		const q = ctx.get("sessionQuery");
		if (q === void 0) return "";
		let events;
		let obs;
		if (typeof q.observeSession === "function") try {
			obs = await q.observeSession(sessionId, { projectionMode: "none" });
			const ev = obs?.events;
			if (Array.isArray(ev)) events = ev;
		} catch {} finally {
			try {
				obs?.[Symbol.dispose]?.();
			} catch {}
		}
		if (events === void 0 && typeof q.readSession === "function") {
			const ev = (await q.readSession(sessionId))?.events;
			if (Array.isArray(ev)) events = ev;
		}
		if (events === void 0) return "";
		const parts = [];
		let curTurn = -1;
		let seen = false;
		for (const e of events) {
			const o = e;
			if (o?.type === "turn/start") {
				const t = o.data?.turn;
				curTurn = typeof t === "number" ? t : curTurn + 1;
				if (curTurn === turn) seen = true;
				continue;
			}
			if (o?.type === "turn/end") {
				if (curTurn === turn) break;
				continue;
			}
			if (!seen || curTurn !== turn) continue;
			const c = o.data?.message?.content;
			if (!Array.isArray(c)) continue;
			for (const b of c) {
				const t = b?.type;
				if (t !== "reasoning" && t !== "text") continue;
				const txt = b?.text;
				if (typeof txt === "string" && txt.trim() !== "") parts.push(txt.trim());
			}
		}
		return parts.join("\n\n");
	} catch {
		return "";
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
async function scoreTurn(ctx, config, opts) {
	const t0 = Date.now();
	const { sessionId, turn, project } = opts;
	try {
		if (project === "") return emptyResult("判不出项目 ⇒ 分数是按项目存的，无法归属");
		const content = await readTurnContent(ctx, sessionId, turn);
		if (content.length < config.hotScoreMinChars) return emptyResult(`该轮内容只有 ${content.length} 字符（< ${config.hotScoreMinChars}）⇒ 判定为寒暄，跳过`);
		const idx = await loadEnIndex();
		if (idx === void 0) return emptyResult("索引不存在（评分只读它）");
		let all = candidatesForScope(idx, project, "project+themes");
		if (all.length === 0) return emptyResult(`项目「${project}」在索引里没有任何条目 ⇒ 无候选`);
		const snapshot = await scanLibrary();
		const globalIds = new Set(snapshot.covers.filter((c) => c.cover.global).map((c) => c.cover.id));
		const pool = all.filter((c) => !globalIds.has(c.id));
		if (pool.length === 0) return emptyResult("候选池里只剩全局知识（已剔除）⇒ 无需评分");
		const plan = planInjection({
			messages: void 0,
			currentReasoning: content,
			reasoningCap: Number.MAX_SAFE_INTEGER,
			pool,
			totalBudget: config.activeInjectBudgetTokens,
			contextBudget: config.activeInjectContextTokens,
			maxBatches: config.activeInjectConcurrency
		});
		if (config.hotScoreChannel === "chat") {
			const out = await scoreViaChat(ctx, config, {
				turnContent: content,
				pool
			});
			const msC = Date.now() - t0;
			if (!out.ok) {
				const r = emptyResult(`chat 通路评分失败：${out.error}`);
				r.project = project;
				r.pool = pool.length;
				r.ms = msC;
				await logRun(config, {
					sessionId,
					turn,
					project,
					pool: pool.length,
					evaluated: pool.length,
					batches: 1,
					ms: msC,
					scores: [],
					added: [],
					note: r.note
				});
				return r;
			}
			const addsC = out.picks.map((id) => ({
				id,
				delta: 1,
				score: 0,
				turn
			}));
			const nowC = /* @__PURE__ */ new Date();
			let afterC = void 0;
			if (addsC.length > 0) afterC = await updateProjectScore(project, (cur) => applyAdds(cur, addsC, nowC.toISOString(), nowC.getTime(), config.hotScoreWindowHours));
			const titleOfC = new Map(pool.map((c) => [c.id, c.title]));
			const addedC = addsC.map((a) => ({
				id: a.id,
				title: titleOfC.get(a.id) ?? "",
				delta: 1,
				score: 0,
				why: out.reasons[a.id] ?? "",
				quote: out.quotes[a.id] ?? "",
				total: sumFor(afterC, a.id, nowC.getTime(), config.hotScoreWindowHours)
			}));
			const messageC = renderReceiptChat({
				project,
				turn,
				pool: pool.length,
				ms: msC,
				windowHours: config.hotScoreWindowHours,
				added: addedC,
				contentChars: content.length,
				model: config.hotScoreModel,
				rejected: out.rejected
			});
			await logRun(config, {
				sessionId,
				turn,
				project,
				pool: pool.length,
				evaluated: pool.length,
				batches: 1,
				ms: msC,
				scores: out.picks.map((id) => ({
					id,
					score: 0,
					delta: 1
				})),
				added: addsC.map((a) => ({
					id: a.id,
					delta: 1,
					score: 0
				})),
				note: `通路=chat（无分数，选中即加分）；模型给的理由见回执`,
				channelUsed: "chat"
			});
			return {
				ok: true,
				message: messageC,
				project,
				pool: pool.length,
				evaluated: pool.length,
				batches: 1,
				okBatches: 1,
				ms: msC,
				scores: [],
				added: addedC,
				note: ""
			};
		}
		const results = await Promise.all(plan.batches.map(async (batch) => callJevForScore(ctx, config, content, batch)));
		const okIdx = results.map((r, i) => r === void 0 ? -1 : i).filter((i) => i >= 0);
		if (okIdx.length === 0) {
			const r = emptyResult(`JEV 调用失败（${plan.batches.length} 批全失败）`);
			r.pool = pool.length;
			r.batches = plan.batches.length;
			r.ms = Date.now() - t0;
			await logRun(config, {
				sessionId,
				turn,
				project,
				pool: pool.length,
				evaluated: 0,
				batches: plan.batches.length,
				ms: r.ms,
				scores: [],
				added: [],
				note: r.note
			});
			return r;
		}
		const thresholds = config.hotScoreThreshold;
		const allScores = [];
		const adds = [];
		const titleOf = /* @__PURE__ */ new Map();
		for (const c of pool) titleOf.set(c.id, c.title);
		for (const bi of okIdx) {
			const ans = results[bi]?.answers;
			(plan.batches[bi] ?? []).forEach((c, i) => {
				const sc = noulAt(ans, `c${i}`);
				const delta = deltaFor(sc, thresholds);
				allScores.push({
					id: c.id,
					score: sc,
					delta
				});
				if (delta > 0) adds.push({
					id: c.id,
					delta,
					score: sc,
					turn
				});
			});
		}
		const now = /* @__PURE__ */ new Date();
		const nowIso = now.toISOString();
		const nowMs = now.getTime();
		let after = void 0;
		if (adds.length > 0) after = await updateProjectScore(project, (cur) => applyAdds(cur, adds, nowIso, nowMs, config.hotScoreWindowHours));
		const ms = Date.now() - t0;
		const added = adds.sort((a, b) => b.score - a.score).map((a) => ({
			id: a.id,
			title: titleOf.get(a.id) ?? "",
			delta: a.delta,
			score: a.score,
			total: sumFor(after, a.id, nowMs, config.hotScoreWindowHours)
		}));
		const maxScore = allScores.reduce((m, s) => s.score > m ? s.score : m, 0);
		const message = renderReceipt({
			project,
			turn,
			pool: pool.length,
			evaluated: pool.length,
			batches: plan.batches.length,
			okBatches: okIdx.length,
			ms,
			threshold: thresholds,
			windowHours: config.hotScoreWindowHours,
			maxScore,
			added,
			contentChars: content.length
		});
		await logRun(config, {
			sessionId,
			turn,
			project,
			pool: pool.length,
			evaluated: pool.length,
			batches: plan.batches.length,
			ms,
			scores: allScores,
			added: adds.map((a) => ({
				id: a.id,
				delta: a.delta,
				score: a.score
			})),
			note: ""
		});
		return {
			ok: true,
			message,
			project,
			pool: pool.length,
			evaluated: pool.length,
			batches: plan.batches.length,
			okBatches: okIdx.length,
			ms,
			scores: allScores,
			added,
			note: ""
		};
	} catch (err) {
		return emptyResult(`评分异常：${String(err)}`);
	}
}
/** 读 JEV 的 `noul`（越界/缺失 ⇒ 0）。 */
function noulAt(answers, key) {
	const v = answers?.[key]?.noul;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : 0;
}
/** 从写回的项目表里取某条的有效分（**只用于回执展示**）。 */
function sumFor(project, id, nowMs, windowHours) {
	const e = project?.entries?.[id];
	if (e === void 0) return 0;
	let s = 0;
	for (const ev of e.events) {
		const t = Date.parse(ev.at);
		if (Number.isFinite(t) && t >= nowMs - windowHours * 36e5) s += ev.delta;
	}
	return s;
}
/**
* ⭐⭐ **渲染回执**（用户要"显式看到过程和结果"）。
*
* 🔴 **必须包含"失败时也有信息"**：若一条都没加分，回执里要有
*    **最高分是多少** —— 否则"0 条加分"有**两种解释而表现一样**
*    （真的都不相关 / 阈值太高），而这两种的处置完全不同（库内知识 `e1340d94`）。
*/
function renderReceipt(o) {
	const head = `本轮评分：turn=${o.turn} 项目=\`${o.project}\` 判据=${o.contentChars} 字符 候选=${o.pool}（${o.batches} 批，成功 ${o.okBatches}/${o.batches}，${o.ms}ms）阈值=${o.threshold} 窗口=${o.windowHours}h`;
	if (o.added.length === 0) return [
		head,
		`⚠️ **一条都没加分** —— 全部候选里最高分 **${o.maxScore.toFixed(3)}**（阈值 ${o.threshold}）。`,
		"",
		o.maxScore >= o.threshold ? "（最高分已过阈值，却没有条目被加分 ⇒ 这是**不该发生**的，请查日志。）" : "（最高分也没过阈值 ⇒ 要么这轮确实没有相关知识，要么阈值偏高。两者用\"分数分布\"区分，见 `score-log/`。）"
	].join("\n");
	const lines = o.added.map((a) => `  +${a.delta}  ${a.score.toFixed(3)}  \`${a.id.slice(0, 8)}\` ${a.title}  → 累计 ${a.total} 分`);
	return [
		head,
		`✅ 加分 ${o.added.length} 条：`,
		...lines
	].join("\n");
}
/**
* ⭐⭐⭐ **渲染 chat 通路的回执**（用户要求"选出 + 给出理由"）。
*
* ⚠️ 与 JEV 版（`renderReceipt`）**不同**：这里**没有分数**，所以不显示分数与档位，
*    而是显示**模型给的理由** —— 那正是用户要"显式看到"的东西。
*/
function renderReceiptChat(o) {
	const head = `本轮评分（chat 通路）：turn=${o.turn} 项目=\`${o.project}\` 模型=\`${o.model}\` 判据=${o.contentChars} 字符 候选=${o.pool}（${o.ms}ms）窗口=${o.windowHours}h`;
	const rej = o.rejected !== void 0 && o.rejected.length > 0 ? `\n⚠️ **${o.rejected.length} 条因【引文校验不通过】被丢弃**（${[...new Set(o.rejected.map((r) => r.reason))].slice(0, 2).join("；")}）` : "";
	if (o.added.length === 0) return [
		head,
		"本轮**没有选中任何知识**（模型回 `{\"picks\":[]}` 或引文校验全不通过）。",
		"⭐ 这是**有效结论**：说明这一轮没有需要补充的知识 —— 与\"调用失败\"不同（失败会显示失败原因）。",
		rej
	].filter((x) => x !== "").join("\n");
	const lines = o.added.map((a) => {
		const q = a.quote !== void 0 && a.quote !== "" ? `\n     原句：「${a.quote}」` : "";
		const why = a.why !== void 0 && a.why !== "" ? `\n     理由：${a.why}` : "";
		return `  +1  \`${a.id.slice(0, 8)}\` ${a.title}  → 累计 ${a.total} 分${q}${why}`;
	});
	return [
		head,
		`✅ 选中 ${o.added.length} 条（各 +1 分）：`,
		...lines,
		rej
	].filter((x) => x !== "").join("\n");
}
/** 写评分日志（**绝不抛**；含全部候选分数与当时的阈值快照）。 */
async function logRun(config, o) {
	await appendScoreLog({
		event: "score",
		at: (/* @__PURE__ */ new Date()).toISOString(),
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
			topN: config.hotScoreTopN
		},
		note: o.note,
		channel: o.channelUsed ?? config.hotScoreChannel
	});
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
async function callJevForScore(ctx, config, content, pool) {
	const pick = scoreDecisionOf(config);
	if (pick.endpoint === "" || pick.model === "") return void 0;
	const key = await resolveJevKey(ctx, config, pick.keyRef);
	if (key === void 0) return void 0;
	const state = {
		candidates: pool.map((c, i) => ({
			i,
			title: c.titleEn !== "" ? c.titleEn : c.title,
			desc: c.descEn !== "" ? c.descEn : c.desc
		})),
		turn_content: content
	};
	const questions = {};
	pool.forEach((_, i) => {
		questions[`c${i}`] = {
			type: "noul",
			instructions: promptText("score:jev-instruction", JEV_SCORE_INSTRUCTION)
		};
	});
	const guard = deadline(void 0, config.hotScoreTimeoutMs, "MEMJ_SCORE_JEV_TIMEOUT");
	try {
		const res = await fetch(pick.endpoint, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: pick.model,
				state,
				questions
			}),
			signal: guard.signal
		});
		if (!res.ok) return void 0;
		return { answers: (await res.json()).answers };
	} catch {
		return;
	} finally {
		guard[Symbol.dispose]();
	}
}
/** ⭐ 导出给注入侧用：读某项目的"有效分前 N 名"。 */
async function scoredEntryIds(projectId, config, nowMs) {
	const p = await readProjectScore(projectId);
	const { topScored } = await import("./hot-score-1hpld5lh.js").then((n) => n.s);
	return topScored(p, nowMs, config.hotScoreWindowHours, config.hotScoreTopN).map((r) => r.id);
}
//#endregion
//#region src/index.ts
const name = "dsh-memj";
/**
* 需要的服务。
*
* ⚠️ **缺任何一个，`ctx.inject` 的回调就永不执行且无报错**——
* 表现为"插件加载了但工具/命令一个都没有"。见下方 `diag`。
*/
const inject = [
	"webServer",
	"systemPrompt",
	"tools",
	"commands"
];
/** 插件在路由表里的路径前缀（**必须带包名**）。 */
const PLUGIN_BASE = "/plugins/dsh-memj";
/**
* ⭐ **loader 树里的 entry id —— 与包名不是一回事**（2026-09-19 实测踩到）。
*
* 本插件的 bundle patch（`cordis.patch.yml`）写的是
* `insert: [{ id: memj, name: dsh-memj }]` ⇒ **条目 id 是 `memj`**，
* 而 `dsh-memj` 是**包名**。
*
* 🔴 **为什么必须区分**：设置面板（决策 97）要往 profile 的 `cordis.patch.yml`
* 写一条 `- id: <这个值>` 的 config 覆盖；**写错 id 的后果极隐蔽**——
* boot 时只打一行 `patch: entry "dsh-memj" not found` 警告，
* 配置**静默不生效**，而面板还显示"已保存"。
*/
const PLUGIN_ENTRY_ID = "memj";
/** API 前缀（人侧界面用）。 */
const API_BASE = `${PLUGIN_BASE}/api`;
/** 取版本号；未注入时退回 '0.0.0'。 */
function pluginVersion() {
	return "0.1.1";
}
/**
* 网页资源的产物目录。
*
* ⚠️ **没有官方 helper**：实测 tsdown 原样保留 `import.meta.url`，
* 且在 `link:` 安装下解析到真实源码路径 ⇒ 资源必须落在**产物目录** `lib/web/`。
*/
const WEB_ROOT = fileURLToPath(new URL("./web/", import.meta.url));
/** 扩展名 → MIME。官方静态兜底**未导出**可复用的 helper，这里自己写一张小表。 */
const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".png": "image/png",
	".woff2": "font/woff2"
};
/** 单个静态文件大小上限。 */
const MAX_STATIC_BYTES = 4194304;
/** 看起来像资源文件的路径（这些**不做** SPA 回退）。 */
const ASSET_EXT_RE = /\.[a-z0-9]{1,8}$/i;
/**
* 服务一个网页静态文件；未知的**页面路径**回退到 `index.html`。
*
* ⚠️ **回退只对"像页面"的路径生效**：`/favicon.ico`、`/app.js.map` 这类
* **带扩展名但文件不存在**的请求必须**直接 404**——否则浏览器会把
* `index.html` 当成图标/脚本，控制台刷 404 且可能误解析。
* （官方静态兜底不做 SPA fallback；这个回退是我们自己加的，所以要自己把握边界。）
* @param pathname - 请求路径名。
* @param res - 响应对象。
*/
async function serveWeb(pathname, res) {
	const rel = pathname.slice(17).replace(/^\/+/, "");
	const looksLikeAsset = ASSET_EXT_RE.test(rel);
	const candidates = rel.length === 0 ? ["index.html"] : looksLikeAsset ? [rel] : [rel, "index.html"];
	for (const candidate of candidates) {
		const url = new URL(`./${candidate}`, `file:///${WEB_ROOT.replace(/\\/g, "/")}/`);
		const abs = fileURLToPath(url);
		if (!abs.startsWith(WEB_ROOT)) continue;
		try {
			const content = await readFile(abs);
			if (content.length > MAX_STATIC_BYTES) continue;
			res.writeHead(200, {
				"Content-Type": MIME[extname(abs).toLowerCase()] ?? "application/octet-stream",
				"Cache-Control": "no-store"
			});
			res.end(content);
			return;
		} catch {}
	}
	res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
	res.end(rel.length === 0 || !looksLikeAsset ? "dsh-memj: web asset not built (run `pnpm run build`)" : `dsh-memj: no such asset: ${rel}`);
}
/**
* 把启动诊断写进库根的小文件。
*
* 🔴 必要性：`ctx.inject` 的回调**等所有列出的服务就绪才执行**，缺一个就
* **永不执行且没有任何报错**。这是"插件看起来加载了、但工具/命令/注入全没有"
* 的头号原因。`ctx.logger` 的输出不一定落在能读到的地方，**写文件最可靠**。
* @param stage - 阶段名。
* @param config - 配置（提供库根）。
*/
function diag(stage, config) {
	(async () => {
		try {
			const root = libraryRoot();
			await mkdir(root, { recursive: true });
			await appendFile(join(root, ".startup-diag.txt"), `${(/* @__PURE__ */ new Date()).toISOString()} ${stage}\n`, "utf8");
		} catch {}
	})();
}
/**
* 挂载协议、工具、命令与路由。
*
* 配置走**第二参**（已校验 + 填好默认值），不是 `ctx.config`。
* @param ctx - 插件上下文。
* @param config - 已解析的插件配置。
*/
function apply(ctx, config = DEFAULT_CONFIG) {
	const version = pluginVersion();
	diag(`apply-start v${version} root=${libraryRoot()}`, config);
	ensureLibraryDirs().catch(() => {});
	ensureDefaultTemplateFile().catch(() => {});
	loadKinds().then((defs) => setCurrentKindDefs(defs)).catch(() => {});
	registerPromptDefault("section:memj:protocol", PROTOCOL_TEXT);
	registerPromptDefault("context:memj:usage-guidance", CONTEXT_TEXT);
	diag(`prompt-overrides-loaded count=${refreshPromptCacheSync()}`, config);
	const webServer = ctx.get("webServer");
	ctx.inject([
		"systemPrompt",
		"tools",
		"commands"
	], (scoped) => {
		diag("inject-callback-ran", config);
		if (config.injectProtocol) try {
			scoped.systemPrompt.section({
				name: "memj:protocol",
				order: PROTOCOL_SECTION_ORDER,
				text: () => promptText("section:memj:protocol", protocolText())
			});
			diag("protocol-registered", config);
		} catch (err) {
			diag(`protocol-THREW ${err instanceof Error ? err.message : String(err)}`, config);
		}
		try {
			scoped.systemPrompt.context({
				name: CONTEXT_NAME,
				order: 125,
				text: () => fillKindMarkers(promptText("context:memj:usage-guidance", CONTEXT_TEXT))
			});
			diag("context-registered", config);
		} catch (err) {
			diag(`context-THREW ${err instanceof Error ? err.message : String(err)}`, config);
		}
		registerTools({
			ctx: scoped,
			config,
			version
		});
		diag("tools-registered", config);
		try {
			registerGate({ ctx: scoped });
			diag("gate-registered", config);
		} catch (err) {
			diag(`gate-THREW ${err instanceof Error ? err.message : String(err)}`, config);
		}
		registerCommands({
			ctx: scoped,
			config
		});
		diag("commands-registered", config);
		registerHotInjection({
			ctx: scoped,
			config
		});
		diag("hot-injection-registered", config);
		try {
			registerEnIndex({
				ctx: scoped,
				config
			});
			diag("en-index-registered", config);
		} catch (err) {
			diag(`en-index-THREW ${err instanceof Error ? err.message : String(err)}`, config);
		}
		try {
			diag(registerActiveInjection({
				ctx: scoped,
				config
			}) ? "active-injection-registered" : "active-injection-skipped(disabled)", config);
		} catch (err) {
			diag(`active-injection-THREW ${err instanceof Error ? err.message : String(err)}`, config);
		}
		try {
			diag(registerTagAutoNormalize({
				ctx: scoped,
				config
			}) ? "tag-auto-registered" : "tag-auto-skipped(disabled)", config);
		} catch (err) {
			diag(`tag-auto-THREW ${err instanceof Error ? err.message : String(err)}`, config);
		}
		try {
			diag(registerAutoScore({
				ctx: scoped,
				config
			}) ? "score-auto-registered" : "score-auto-skipped(disabled)", config);
		} catch (err) {
			diag(`score-auto-THREW ${err instanceof Error ? err.message : String(err)}`, config);
		}
		try {
			diag(registerContextReport({
				ctx: scoped,
				config
			}) ? "context-report-registered" : "context-report-skipped(disabled)", config);
		} catch (err) {
			diag(`context-report-THREW ${err instanceof Error ? err.message : String(err)}`, config);
		}
	});
	ctx.effect(() => {
		const disposers = [];
		const apiHandler = async (req, res) => {
			const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
			const method = (req.method ?? "GET").toUpperCase();
			let rawBody = "";
			if (method !== "GET" && method !== "HEAD") {
				const chunks = [];
				let total = 0;
				for await (const chunk of req) {
					const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
					total += buf.length;
					if (total > 1048576) {
						res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
						res.end(JSON.stringify({
							ok: false,
							error: "request body too large"
						}));
						return;
					}
					chunks.push(buf);
				}
				rawBody = Buffer.concat(chunks).toString("utf8");
			}
			if (method === "HEAD") {
				res.writeHead(204);
				res.end();
				return;
			}
			try {
				const result = await handleApi({
					version,
					config,
					baseUrl: ctx.baseUrl,
					pluginId: PLUGIN_ENTRY_ID,
					getService: (n) => ctx.get(n)
				}, method, url.pathname, rawBody, url.searchParams);
				res.writeHead(result.status, {
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "no-store"
				});
				res.end(JSON.stringify(result.body));
			} catch (err) {
				res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
				res.end(JSON.stringify({
					ok: false,
					error: err instanceof Error ? err.message : String(err)
				}));
			}
		};
		for (const path of [
			`${API_BASE}/health`,
			`${API_BASE}/projects`,
			`${API_BASE}/themes`,
			`${API_BASE}/covers`,
			`${API_BASE}/archived`,
			`${API_BASE}/nominations`,
			`${API_BASE}/approve`,
			`${API_BASE}/reject`,
			`${API_BASE}/rebuild`,
			`${API_BASE}/entry`,
			`${API_BASE}/project`,
			`${API_BASE}/theme`,
			`${API_BASE}/block`,
			`${API_BASE}/fix-cover`,
			`${API_BASE}/fix-ref`,
			`${API_BASE}/settings`,
			`${API_BASE}/models`,
			`${API_BASE}/jev-status`,
			`${API_BASE}/jev/key`,
			`${API_BASE}/jev/key/clear`,
			`${API_BASE}/jev/test`,
			`${API_BASE}/index-check`,
			`${API_BASE}/backup/status`,
			`${API_BASE}/backup/setup`,
			`${API_BASE}/edit`,
			`${API_BASE}/hot`,
			`${API_BASE}/hot/projects`,
			`${API_BASE}/hot/persona`,
			`${API_BASE}/hot/selection`,
			`${API_BASE}/hot/bind`,
			`${API_BASE}/hot/item`,
			`${API_BASE}/hot/global`,
			`${API_BASE}/active`,
			`${API_BASE}/prompts`,
			`${API_BASE}/prompt`,
			`${API_BASE}/prompt/save`,
			`${API_BASE}/prompt/reset`,
			`${API_BASE}/prompt/history`,
			`${API_BASE}/prompt/restore`,
			`${API_BASE}/prompt/writeback`,
			`${API_BASE}/templates`,
			`${API_BASE}/template/save`,
			`${API_BASE}/template/delete`,
			`${API_BASE}/kinds`,
			`${API_BASE}/kind/save`,
			`${API_BASE}/kind/upsert`,
			`${API_BASE}/kind/delete`
		]) disposers.push(webServer.register({
			kind: "exact",
			path,
			handler: apiHandler
		}));
		disposers.push(webServer.register({
			kind: "prefix",
			path: PLUGIN_BASE,
			handler: (req, res) => {
				serveWeb(new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`).pathname, res);
			}
		}));
		return () => {
			for (const dispose of disposers) try {
				dispose();
			} catch {}
		};
	}, "dsh-memj: routes");
}
//#endregion
export { ACTIVE_BAND_MAX, ACTIVE_BAND_MIN, ACTIVE_BODY_HINT, ACTIVE_CALLS_PER_TURN_MAX, ACTIVE_CALLS_PER_TURN_MIN, ACTIVE_CHANNEL_VALUES, ACTIVE_CLOSING_INSTRUCTION, ACTIVE_CONTEXT_ROUNDS_MAX, ACTIVE_CONTEXT_ROUNDS_MIN, ACTIVE_HEADER, ACTIVE_POOL_MAX_MAX, ACTIVE_POOL_MAX_MIN, ACTIVE_REASONING_MAX_CHARS_MAX, ACTIVE_REASONING_MAX_CHARS_MIN, ACTIVE_SCOPE_VALUES, ACTIVE_TIMEOUT_MAX, ACTIVE_TIMEOUT_MIN, ACTIVE_TOP_K_MAX, ACTIVE_TOP_K_MIN, CLOSING_INSTRUCTION, Config, DEFAULT_CONFIG, DEFAULT_LEVEL, DEFAULT_SECTION_NAMES, DESC_MAX_CHARS, DESC_SOFT_WARN, ENTRY_KINDS, ENTRY_KIND_DEFS, HANDOFF_LEVELS, HANDOFF_STEP_ORDER, HANDOFF_UNTOUCHED_CLOSING, HANDOFF_UNTOUCHED_SECTIONS, HIT_WEIGHTS, HOT_BIND_SOURCES, HOT_BODY_CLOSING_INSTRUCTION, HOT_BUDGET_MAX, HOT_BUDGET_MIN, HOT_CHANNELS, HOT_CHARS_PER_TOKEN_MAX, HOT_CHARS_PER_TOKEN_MIN, HOT_CLOSING_INSTRUCTION, HOT_DIRECT_SECTION, HOT_FILE_VERSION, HOT_FULL_WARN_MAX, HOT_FULL_WARN_MIN, HOT_HEAD_FIRST, HOT_HEAD_SUPPLEMENT, HOT_META_HINT, HOT_PROJECT_UNKNOWN, HOT_RATIO_MAX, HOT_RATIO_MIN, HOT_SESSION_KEEP, HOT_SESSION_KEEP_MAX, HOT_SESSION_KEEP_MIN, HOT_SHAPES, JEV_CANDIDATE_INSTRUCTION, JEV_NEED_INSTRUCTION, JEV_SCORE_INSTRUCTION, JEV_SEARCH_INTENT_INSTRUCTION, JEV_SUFFICIENT_INSTRUCTION, JUDGE_HEAD, KIND_CATALOG_MARKER, KIND_ID_RE, KIND_LIST_MARKER, KNOWLEDGE_SECTION, KNOWLEDGE_TITLE, LEVEL_LABELS, MIN_QUOTE_CHARS, NARRATIVE_SECTIONS, NARRATIVE_TITLES, PROGRESS_TITLE, PROGRESS_WARN_MAX, PROGRESS_WARN_MIN, PROJECT_KNOWLEDGE_HINT, PROMPT_CATALOG, PROMPT_GROUPS, PROMPT_OVERRIDES_VERSION, PROMPT_SPECS, PROTOCOL_SECTION_ORDER, PROTOCOL_TEXT, SCORE_FILE_VERSION, SCORE_INDEX_RANGE, SCORE_PICK_PRINCIPLE, SCORE_POOL_HEADER, SCORE_QUOTE_RULE, SCORE_USER_TASK, SECTION_SPEC_CLOSING, SECTION_SPEC_HEAD, SELECTABLE_ENTRY_KINDS, SLUG_RE, SNAPSHOT_CLOSING, SPEC_BLOCK_FENCE, SPEC_SECTION, SPEC_TITLE, TARGET_PROJECT_LINE, TARGET_THEME_LINE, TEMPLATE_ID_RE, TEMPLATE_VERSION, THEME_COVERS_HINT, THEME_CREATION_VALUES, THEME_KNOWLEDGE_HINT, TITLE_MAX_CHARS, TITLE_MIN_CHARS, TOKEN_COEF, TPL_GUIDANCE_FOOT, TPL_GUIDANCE_HEAD, TPL_GUIDANCE_NO_TRUNC, TPL_GUIDANCE_ROW, TPL_GUIDANCE_TRUNC_MARK, UUID_SCAN, activeInjectionsUsed, activeSnapshot, activeState, addNomination, aggregate, aliasIndex, allCandidates, appendDocRead, appendReadSnapshot, appendScoreLog, apply, applyAdds, applyMerges, applySectionOp, approveNomination, archiveEntry, archiveProject, assembleContext, backupDir, backupNarrativePath, bodySize, budgetTokensFor, buildChatScoreSystem, buildChatScoreUser, buildHotInjection, buildSkeleton, buildSystemPrompt, buildUserPrompt, builtinKindDefs, byUpdatedDesc, callJev, candidatesForScope, catalogOf, charCount, checkAdoptShape, checkAndRepair, checkEntryShape, checkIndex, checkKnowledgeShape, checkNoDshVariables, checkQuote, clearPluginSpawnedForTest, clearPromptHistory, collectHotItems, confirmMessage, consumeSnapshots, coverFromYaml, currentKindDefsOf, currentKindsOf, currentReservedKinds, cutKnowledgeSection, cutSpecSection, decideAutoScore, decideInjection, decideRead, decideTagAuto, decideTemplateTool, defaultEntrySetting, defaultTemplate, defaultTemplatePath, deleteEntry, deleteEntryFile, deleteKindBlockReason, deleteProject, deleteProjectDoc, deleteTemplate, deleteTheme, deleteThemeDoc, deltaFor, deltaTextOf, descHashOf, detectProjectByDocReads, detectProjectBySessionLog, docReadLogPath, docReadsDir, docSectionsOf, editDistance, editEntryThemes, effectiveChannel, effectiveConfig, effectiveScope, effectiveScore, emptyOverrides, emptyScoreFile, emptyTagAutoState, emptyVocabulary, enIndexPath, ensureDefaultTemplateFile, ensureLibraryDirs, entriesDir, entryFileName, entryKindWhen, entryRelPath, estimateCandidateTokens, estimatePoolOutputTokens, estimatePoolTokens, estimateTokens, extractJson, extractSection, extractSpecBlock, extractSpecBlockLines, extractSpecSection, extractTitle, extractUserSubmit, fillKindMarkers, fillSlots, filterByContext, filterContextByTerms, findAliasConflicts, findDocRead, findEmptySections, findSectionRange, findSimilarIds, fingerprintsFromInjectionEvents, fingerprintsInText, fixCoverBlock, fixExternalRef, gateHandoffArgs, getSessionBinding, globalDocPath, groupBySourceProject, groupOrder, groupSections, handleApi, hasOverride, hotDir, hotEntriesPath, hotPersonaPath, hotSelectionPath, hotSessionsPath, hotState, idsInWindow, inWindow, inject, injectTotalsOf, insertSpecBlocks, isAbsolutePath, isEntryKind, isHistoryCover, isKnowledgeHeading, isMtModel, isPluginSpawned, isSectionShape, isSimilarId, isThoughtEnd, kindCatalogText, kindsFilePath, kindsInline, lastBudgetDiagnostic, lastChatDiagnostic, lastInjectionOf, lastRunTurn, leakedHan, legacyTemplatePath, libraryRoot, listPromptHistory, listTemplates, loadDefaultTemplate, loadEnIndex, loadEntryDoc, loadEntrySettings, loadKinds, loadPersona, loadProjectDoc, loadPromptOverrides, loadScoreFile, loadSelections, loadSessionsFile, loadTagAutoState, loadTemplate, loadThemeFrontmatter, loadVocabulary, locateTemplateBody, markNormalized, markPluginSpawned, maybeAutoNormalize, maybeAutoScore, measureSections, mergeNarrative, moveEntry, name, narrativeFromProjectText, newPersonaId, nominationsPath, normalizeNarrative, normalizeQuery, normalizeTags, normalizeTemplate, noteKnowledgeWritten, overriddenKeys, overrideUpdatedAt, pairingError, parseChatScore, parseCovers, parseGetHandoffFromEvents, parseHandoffFromEvents, parseJudgeOutput, parseKindsDoc, parseLevel, parseSections, parseStepRequest, parseTemplateDoc, patchPathFrom, pendingSnapshots, personaFingerprint, pickCandidates, planInjection, planSteps, pluginRoot, preview, previewForSession, probeCoverState, profileDirFrom, projectDocPath, projectIdFromFile, projectsDir, promptCurrent, promptDefault, promptHistoryDir, promptOverridesPath, promptText, promptsDir, protocolText, pruneEvents, pruneSessions, quoteAppearsIn, rawKindFromYaml, readContextUsage, readContextUsageWithWindow, readDocReads, readLogPath, readNominations, readProjectScore, readPromptHistory, readScoreLog, readSettings, readSnapshots, readTurnContent, readUnconsumedSnapshots, readsDir, reasoningTextOf, rebuildDerivedLayers, rebuildEnIndex, rebuildWindowFromSessionLog, recall, recallLogDir, recallLogPath, recordRead, refreshPromptCache, refreshPromptCacheSync, registerActiveInjection, registerAutoScore, registerContextReport, registerEnIndex, registerGate, registerHotInjection, registerPromptDefault, registerTagAutoNormalize, registeredPromptKeys, rejectNomination, removeNomination, renameProject, renameTheme, renderActiveInjection, renderContextUsage, renderCover, renderFrontmatter, renderHotText, renderJudgeRules, renderKindsDoc, renderManifest, renderMetaLine, renderOutputSpec, renderOutputText, renderParametersText, renderProjectHandoff, renderSectionSpecs, renderSnapshotList, renderSpecBlockLines, renderSpecBlocksSkeleton, renderTemplateDoc, renderThemeHandoff, renderYamlArray, replaceBlockAtLines, reportContextUsage, requiredDirs, resetActiveState, resetHotState, resetPromptCache, resetPromptOverride, resolveContextWindow, resolveInsideLibrary, resolveJevKey, resolveMerges, resolveProject, resolveRef, resolveTag, restorePromptHistory, runHandoff, safeName, saveEnIndex, saveEntrySettings, saveKinds, savePersona, savePromptOverride, savePromptOverrides, saveScoreFile, saveSelections, saveSessionsFile, saveTagAutoState, saveTemplate, saveVocabulary, scanLibrary, scoreCover, scoreFilePath, scoreLogDir, scoreLogPath, scoreTurn, scoreViaChat, scoredEntryIds, sectionSpecsOf, sectionTitles, sectionsFromNarrative, seedVocabulary, selectableKindList, selfCheckHandoffResult, setCurrentKindDefs, setEntryFields, setEntryGlobal, setProjectDesc, setProjectFields, setPromptCacheForTest, setSectionSpec, setSectionSpecBlock, setSessionBinding, setThemeDesc, setThemeFields, settingOf, slotNames, snapshotWindow, sortHits, specBlockFenceInfo, specBlockRange, specOf, splitFrontmatter, splitRoute, splitTurns, startNormalizeSubagent, startScoreSubagent, stripAllSpecBlocks, stripCovers, stripSpecBlock, syncEntryFrontmatter, tagAutoStatePath, tagVocabularyPath, tagsDir, templateDeclaresArchiving, templatePath, templateSectionNames, templateWarnings, templatesDir, themeDocPath, themesDir, toStringArray, topScored, touchSession, triggerEnIndexRebuild, unarchiveEntry, unarchiveProject, unescapeFromTemplate, updateEntry, updateProjectScore, validateAllCovers, validateCoverShape, validateKinds, validatePrompt, validateTemplate, withScoreLock, writeBackState, writeBackToSource, writeEntryDoc, writeGlobalDoc, writeNominations, writeProjectDoc, writeSetting, writeThemeDoc, yamlScalar };
