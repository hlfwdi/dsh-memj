import { $t as writeThemeDoc, A as HANDOFF_UNTOUCHED_SECTIONS, At as fixCoverBlock, Bt as readNominations, C as probeGit, Ct as byUpdatedDesc, D as readNarrativeMirror, Dt as deleteThemeDoc, E as runGit, Et as deleteProjectDoc, F as pendingSnapshots, Ft as loadEntryDoc, Gt as removeNomination, Ht as readUnconsumedSnapshots, I as recordRead, It as loadProjectDoc, Jt as syncEntryFrontmatter, Kt as scanLibrary, L as renderSectionSpecs, Lt as loadThemeFrontmatter, M as SECTION_SPEC_HEAD, Mt as isChatCover, N as SNAPSHOT_CLOSING, Nt as isHistoryCover, O as writeNarrativeMirror, Ot as ensureLibraryDirs, P as groupBySourceProject, Pt as libraryFingerprint, Qt as writeProjectDoc, R as renderSnapshotList, Rt as projectIdFromFile, S as noteGitSuccess, St as approveNomination, T as resetGitFailureStreak, Tt as deleteEntryFile, Ut as rebuildDerivedLayers, Vt as readSnapshots, Wt as rejectNomination, Xt as writeGlobalDoc, Yt as writeEntryDoc, Zt as writeNominations, _ as ensureRepo, a as normalizeQuery, an as decisionProvidersOf, b as normalizeCommitMessage, bt as appendDocRead, c as decideRead, cn as maxInjectionsPerTurn, d as groupSections, dn as scoreDecisionOf, en as ACTIVE_BAND_DEFAULT, f as parseSections, g as defaultIdentity, h as commitAll, i as filterContextByTerms, in as activeDecisionOf, j as SECTION_SPEC_CLOSING, jt as fixExternalRef, k as HANDOFF_UNTOUCHED_CLOSING, kt as findDocRead, l as extractSection, ln as needMinOf, m as sectionTitles, n as bodySize, nn as Config, o as scoreCover, on as deriveDecisionKeyRef, p as preview, r as filterByContext, rn as DEFAULT_CONFIG, s as sortHits, sn as itemMinOf, t as HIT_WEIGHTS, tn as ACTIVE_MAX_INJECTIONS_DEFAULT, u as findSectionRange, un as resolveDecisionPick, v as gitFailureStreak, w as readRepoState, wt as consumeSnapshots, x as noteGitFailure, xt as appendReadSnapshot, y as lastCommit, yt as addNomination, zt as readDocReads } from "./search-CwYiAh_G.js";
import { $ as HOT_SHAPES, $t as tagVocabularyPath, A as SPEC_SECTION, At as nominationsPath, B as renderSpecBlockLines, Bt as readingDir, C as yamlScalar, Ct as hotEntriesPath, D as NARRATIVE_TITLES, Dt as kindsFilePath, E as NARRATIVE_SECTIONS, Et as hotSessionsPath, F as docSectionsOf, Ft as promptOverridesPath, G as specBlockRange, Gt as requiredDirs, H as sectionsFromNarrative, Ht as readsDir, I as extractSpecBlock, It as promptsDir, J as ENTRY_KINDS, Jt as safeName, K as stripAllSpecBlocks, Kt as resolveInsideLibrary, L as extractSpecBlockLines, Lt as readLogPath, M as buildSkeleton, Mt as projectDocPath, N as cutKnowledgeSection, Nt as projectsDir, O as PROGRESS_TITLE, Ot as legacyTemplatePath, P as cutSpecSection, Pt as promptHistoryDir, Q as HOT_PROJECT_UNKNOWN, Qt as tagAutoStatePath, R as extractSpecSection, Rt as readingBindingsPath, S as validateCoverShape, St as hotDir, T as KNOWLEDGE_TITLE, Tt as hotSelectionPath, U as setSectionSpecBlock, Ut as recallLogDir, V as sectionSpecsOf, Vt as readingStatePath, W as specBlockFenceInfo, Wt as recallLogPath, X as HOT_BIND_SOURCES, Xt as scoreLogDir, Y as ENTRY_KIND_DEFS, Yt as scoreFilePath, Z as HOT_CHANNELS, Zt as scoreLogPath, _ as renderYamlArray, _t as docReadsDir, a as charCount, at as currentReservedKinds, b as stripCovers, bt as entryRelPath, c as extractTitle, ct as isEntryKind, d as isSimilarId, dt as selectableKindList, en as tagsDir, et as KIND_CATALOG_MARKER, f as narrativeFromProjectText, ft as setCurrentKindDefs, g as renderFrontmatter, gt as docReadLogPath, h as renderCover, ht as defaultTemplatePath, i as TITLE_MIN_CHARS, in as themesDir, it as currentKindsOf, j as SPEC_TITLE, jt as pluginRoot, k as SPEC_BLOCK_FENCE, kt as libraryRoot, l as findSimilarIds, lt as kindCatalogText, m as rawKindFromYaml, mt as backupNarrativePath, n as SLUG_RE, nn as templatesDir, nt as SELECTABLE_ENTRY_KINDS, o as coverFromYaml, ot as entryKindWhen, p as parseCovers, pt as backupDir, q as stripSpecBlock, qt as resolveRef, r as TITLE_MAX_CHARS, rn as themeDocPath, rt as currentKindDefsOf, s as editDistance, st as fillKindMarkers, t as DESC_MAX_CHARS, tn as templatePath, tt as KIND_LIST_MARKER, u as isAbsolutePath, ut as kindsInline, v as replaceBlockAtLines, vt as entriesDir, w as KNOWLEDGE_SECTION, wt as hotPersonaPath, x as toStringArray, xt as globalDocPath, y as splitFrontmatter, yt as entryFileName, z as isKnowledgeHeading, zt as readingCursorsPath } from "./parse-ClMDsIzD.js";
//#region src/history.ts
/**
* ⭐⭐ **历史归档**（决策 136 → **决策 223 大改**）—— 现在只剩下**读侧**。
*
* ── 🔴🔴 2026-10-12（决策 223）：归档从"工具自动做"改成"模型按规范做" ──────
*
* **用户裁定**（原话）：
* > *"归档交给模型，工具嘛，因为没法识别就不要了。完全交给模型吧。*
* >  *但本身对模型的强提醒和一定程度的校验还是要想办法的。"*
*
* 根因：**归档规则改成写在各节的书写规范里（自然语言）**，
* 而**工具读不懂自然语言** ⇒ 它无法再判断"该不该截、截到哪"。
* ⇒ 于是它**不再执行归档**，改成当**监察者**：
*   ① `memj_handoff` 回执里**报出各节字符数**（模型据此对照规范里的数字）；
*   ② 继续点名「本次没动的节」（决策 222 那套）。
*
* ── 🔴 与旧设计的取舍（**这次是主动放弃了一条防线，要知悉**）──────────────
* 旧设计（本模块原来的注释）写着：
* > 压缩规范写了判据、也加了触发条件，**连报 7 次、一次没压**。
* > 根因是"**要模型自己动手**"；而截断是**工具自己做的事**
* > ⇒ ⭐ **"报了但不做"这个失败模式从此不存在**。
*
* ⚠️ **本次把这个失败模式请回来了** —— 这是用户明确知悉并接受的代价，
*    换来的是"**归档策略完全由各节的书写规范决定**"（阈值、颗粒度、类型、
*    甚至"要不要归档"都能用自然语言写清，不再受限于工具的固定逻辑）。
* ⭐ 缓解手段就是上面那两条**提醒**：**报数**（有确切数字才能对照）+ **点名**。
*
* ── ⚠️ 保留下来的东西（**别再删**）──────────────────────────────────────────
* · `HISTORY_SECTION`：存量文档的「当前进度」末尾**真的有**这个小节
*   （里面是指向已归档条目的指针）⇒ 它必须还能被**读出来、显示出来**；
* · `readHistoryLines()`：同上（读那一节的行）；
* · `splitSectionsForHistory()`：被 `readHistoryLines` 用着。
*
* 🔴 **已删除的**（都是为"工具自动归档"服务的，现已无消费者）：
*   `truncateProgress` / `truncateOneSection` / `groupChunks` / `buildProgressSection` /
*   `fillHistoryId` / `removeSection` / `summarize` / `summarizeTitle` / `slugSegment` /
*   `historySlug` / `newEntryId` / `HistoryChunk` / `TruncateResult`。
*   ⚠️ **它们的 slug/命名规则（如 `dsh-memj-history-b32-b37`）没有丢** ——
*      已作为**例子写进默认模板的规范**里，由模型照着起名（决策 223）。
*
* @module dsh-memj/history
*/
/** 「历史进展」小节名（**「当前进度」内部**的 `###` 小节，用户裁定）。 */
const HISTORY_SECTION = "历史进展";
/**
* 按 `##` / `###` 切节（**跳过围栏**）。
*
* ⚠️ **决策 223 后它只服务读侧**（`readHistoryLines`）—— 写侧（截断）已删。
* @param lines - 全文行。
* @returns 小节数组。
*/
function splitSectionsForHistory(lines) {
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
			start: h.line,
			end
		};
	});
}
/**
* ⭐ 读某份文档里「历史进展」小节的行（**存量指针要原样保住**）。
*
* 🔴 **为什么它还活着**（决策 223 之后）：
*    存量文档（含 `dsh-memj` 自己）的「当前进度」末尾**真的有这一节**，
*    里面是**指向已归档条目的完整 UUID**。工具不再写它，但**必须还能读它** ——
*    否则那些指针会**在正文重写时被当成普通内容丢掉**（本项目吃过"取叙事时丢东西"的亏）。
*
* ⚠️ **`handoff` 主路径已不再调用它**（决策 223 起工具不归档了）——
*    保留它是为了 **API / 未来的迁移脚本 / 读侧渲染**能拿到这段指针。
* @param narrative - 纯叙事。
* @returns 那一节的行（不含标题行本身）；没有该节 ⇒ 空数组。
*/
function readHistoryLines(narrative) {
	const lines = narrative.split(/\r?\n/);
	const sec = splitSectionsForHistory(lines).find((s) => s.title === HISTORY_SECTION);
	if (sec === void 0) return [];
	return lines.slice(sec.start + 1, sec.end).map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
}
//#endregion
export { ACTIVE_BAND_DEFAULT, ACTIVE_MAX_INJECTIONS_DEFAULT, Config, DEFAULT_CONFIG, DESC_MAX_CHARS, ENTRY_KINDS, ENTRY_KIND_DEFS, HANDOFF_UNTOUCHED_CLOSING, HANDOFF_UNTOUCHED_SECTIONS, HISTORY_SECTION, HIT_WEIGHTS, HOT_BIND_SOURCES, HOT_CHANNELS, HOT_PROJECT_UNKNOWN, HOT_SHAPES, KIND_CATALOG_MARKER, KIND_LIST_MARKER, KNOWLEDGE_SECTION, KNOWLEDGE_TITLE, NARRATIVE_SECTIONS, NARRATIVE_TITLES, PROGRESS_TITLE, SECTION_SPEC_CLOSING, SECTION_SPEC_HEAD, SELECTABLE_ENTRY_KINDS, SLUG_RE, SNAPSHOT_CLOSING, SPEC_BLOCK_FENCE, SPEC_SECTION, SPEC_TITLE, TITLE_MAX_CHARS, TITLE_MIN_CHARS, activeDecisionOf, addNomination, appendDocRead, appendReadSnapshot, approveNomination, backupDir, backupNarrativePath, bodySize, buildSkeleton, byUpdatedDesc, charCount, commitAll, consumeSnapshots, coverFromYaml, currentKindDefsOf, currentKindsOf, currentReservedKinds, cutKnowledgeSection, cutSpecSection, decideRead, decisionProvidersOf, defaultIdentity, defaultTemplatePath, deleteEntryFile, deleteProjectDoc, deleteThemeDoc, deriveDecisionKeyRef, docReadLogPath, docReadsDir, docSectionsOf, editDistance, ensureLibraryDirs, ensureRepo, entriesDir, entryFileName, entryKindWhen, entryRelPath, extractSection, extractSpecBlock, extractSpecBlockLines, extractSpecSection, extractTitle, fillKindMarkers, filterByContext, filterContextByTerms, findDocRead, findSectionRange, findSimilarIds, fixCoverBlock, fixExternalRef, gitFailureStreak, globalDocPath, groupBySourceProject, groupSections, hotDir, hotEntriesPath, hotPersonaPath, hotSelectionPath, hotSessionsPath, isAbsolutePath, isChatCover, isEntryKind, isHistoryCover, isKnowledgeHeading, isSimilarId, itemMinOf, kindCatalogText, kindsFilePath, kindsInline, lastCommit, legacyTemplatePath, libraryFingerprint, libraryRoot, loadEntryDoc, loadProjectDoc, loadThemeFrontmatter, maxInjectionsPerTurn, narrativeFromProjectText, needMinOf, nominationsPath, normalizeCommitMessage, normalizeQuery, noteGitFailure, noteGitSuccess, parseCovers, parseSections, pendingSnapshots, pluginRoot, preview, probeGit, projectDocPath, projectIdFromFile, projectsDir, promptHistoryDir, promptOverridesPath, promptsDir, rawKindFromYaml, readDocReads, readHistoryLines, readLogPath, readNarrativeMirror, readNominations, readRepoState, readSnapshots, readUnconsumedSnapshots, readingBindingsPath, readingCursorsPath, readingDir, readingStatePath, readsDir, rebuildDerivedLayers, recallLogDir, recallLogPath, recordRead, rejectNomination, removeNomination, renderCover, renderFrontmatter, renderSectionSpecs, renderSnapshotList, renderSpecBlockLines, renderYamlArray, replaceBlockAtLines, requiredDirs, resetGitFailureStreak, resolveDecisionPick, resolveInsideLibrary, resolveRef, runGit, safeName, scanLibrary, scoreCover, scoreDecisionOf, scoreFilePath, scoreLogDir, scoreLogPath, sectionSpecsOf, sectionTitles, sectionsFromNarrative, selectableKindList, setCurrentKindDefs, setSectionSpecBlock, sortHits, specBlockFenceInfo, specBlockRange, splitFrontmatter, splitSectionsForHistory, stripAllSpecBlocks, stripCovers, stripSpecBlock, syncEntryFrontmatter, tagAutoStatePath, tagVocabularyPath, tagsDir, templatePath, templatesDir, themeDocPath, themesDir, toStringArray, validateCoverShape, writeEntryDoc, writeGlobalDoc, writeNarrativeMirror, writeNominations, writeProjectDoc, writeThemeDoc, yamlScalar };
