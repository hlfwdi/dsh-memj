import { $ as renderSpecBlockLines, $n as EntryFrontmatter, $t as pluginRoot, A as scanLibrary, An as extractTitle, Ar as currentReservedKinds, At as findSectionRange, B as NARRATIVE_TITLES, Bn as replaceBlockAtLines, Br as Config, Bt as entriesDir, C as readDocReads, Cn as DESC_MAX_CHARS, Cr as ParsedCover, Ct as renderSectionSpecs, D as rebuildDerivedLayers, Dn as charCount, Dr as ThemeFrontmatter, Dt as SectionGroup, E as readUnconsumedSnapshots, En as TITLE_MIN_CHARS, Er as SELECTABLE_ENTRY_KINDS, Et as ReadDecision, F as writeProjectDoc, Fn as parseCovers, Fr as kindsInline, Ft as backupDir, G as buildSkeleton, Gn as yamlScalar, Gr as decisionProvidersOf, Gt as hotEntriesPath, H as SPEC_BLOCK_FENCE, Hn as stripCovers, Hr as DecisionProvider, Ht as entryRelPath, I as writeThemeDoc, In as rawKindFromYaml, Ir as selectableKindList, It as backupNarrativePath, J as docSectionsOf, Jn as CoverIssue, Jr as maxInjectionsPerTurn, Jt as hotSessionsPath, K as cutKnowledgeSection, Kn as ContextItem, Kr as deriveDecisionKeyRef, Kt as hotPersonaPath, L as KNOWLEDGE_SECTION, Ln as renderCover, Lr as setCurrentKindDefs, Lt as defaultTemplatePath, M as writeEntryDoc, Mn as isAbsolutePath, Mr as fillKindMarkers, Mt as parseSections, N as writeGlobalDoc, Nn as isSimilarId, Nr as isEntryKind, Nt as preview, O as rejectNomination, On as coverFromYaml, Or as currentKindDefsOf, Ot as decideRead, P as writeNominations, Pn as narrativeFromProjectText, Pr as kindCatalogText, Pt as sectionTitles, Q as isKnowledgeHeading, Qn as EntryDoc, Qt as nominationsPath, R as KNOWLEDGE_TITLE, Rn as renderFrontmatter, Rr as ACTIVE_BAND_DEFAULT, Rt as docReadLogPath, S as projectIdFromFile, Sn as themesDir, Sr as NominationsFile, St as recordRead, T as readSnapshots, Tn as TITLE_MAX_CHARS, Tr as ReadSnapshot, Tt as DocSection, U as SPEC_SECTION, Un as toStringArray, Ur as MemjConfig, Ut as globalDocPath, V as PROGRESS_TITLE, Vn as splitFrontmatter, Vr as DEFAULT_CONFIG, Vt as entryFileName, W as SPEC_TITLE, Wn as validateCoverShape, Wr as activeDecisionOf, Wt as hotDir, X as extractSpecBlockLines, Xn as ENTRY_KINDS, Xr as resolveDecisionPick, Xt as legacyTemplatePath, Y as extractSpecBlock, Yn as DocReadRecord, Yr as needMinOf, Yt as kindsFilePath, Z as extractSpecSection, Zn as ENTRY_KIND_DEFS, Zr as scoreDecisionOf, Zt as libraryRoot, _ as fixExternalRef, _n as tagVocabularyPath, _r as HotShape, _t as SECTION_SPEC_CLOSING, a as addNomination, an as readLogPath, ar as HOT_SHAPES, at as stripAllSpecBlocks, b as loadProjectDoc, bn as templatesDir, br as LiveKindDef, bt as groupBySourceProject, c as approveNomination, cn as recallLogPath, cr as HotEntriesFile, ct as SearchHit, d as deleteEntryFile, dn as resolveRef, dr as HotPersonaItem, dt as filterContextByTerms, en as projectDocPath, er as EntryKind, et as sectionSpecsOf, f as deleteProjectDoc, fn as safeName, fr as HotProjectEntry, ft as normalizeQuery, g as fixCoverBlock, gn as tagAutoStatePath, gr as HotSessionsFile, gt as HANDOFF_UNTOUCHED_SECTIONS, h as findDocRead, hn as scoreLogPath, hr as HotSessionBinding, ht as HANDOFF_UNTOUCHED_CLOSING, i as ScanOptions, in as promptsDir, ir as HOT_PROJECT_UNKNOWN, it as specBlockRange, j as syncEntryFrontmatter, jn as findSimilarIds, jr as entryKindWhen, jt as groupSections, k as removeNomination, kn as editDistance, kr as currentKindsOf, kt as extractSection, l as byUpdatedDesc, ln as requiredDirs, lr as HotEntrySetting, lt as bodySize, m as ensureLibraryDirs, mn as scoreLogDir, mr as HotSelectionFile, mt as sortHits, n as LibrarySnapshot, nn as promptHistoryDir, nr as HOT_BIND_SOURCES, nt as setSectionSpecBlock, o as appendDocRead, on as readsDir, or as HotBindSource, ot as stripSpecBlock, p as deleteThemeDoc, pn as scoreFilePath, pr as HotProjectSelection, pt as scoreCover, q as cutSpecSection, qn as Cover, qr as itemMinOf, qt as hotSelectionPath, r as ProjectRecord, rn as promptOverridesPath, rr as HOT_CHANNELS, rt as specBlockFenceInfo, s as appendReadSnapshot, sn as recallLogDir, sr as HotChannel, st as HIT_WEIGHTS, t as FixResult, tn as projectsDir, tr as EntryKindDef, tt as sectionsFromNarrative, u as consumeSnapshots, un as resolveInsideLibrary, ur as HotPersonaFile, ut as filterByContext, v as isHistoryCover, vn as tagsDir, vr as KIND_CATALOG_MARKER, vt as SECTION_SPEC_HEAD, w as readNominations, wn as SLUG_RE, wr as ProjectFrontmatter, wt as renderSnapshotList, x as loadThemeFrontmatter, xn as themeDocPath, xr as Nomination, xt as pendingSnapshots, y as loadEntryDoc, yn as templatePath, yr as KIND_LIST_MARKER, yt as SNAPSHOT_CLOSING, z as NARRATIVE_SECTIONS, zn as renderYamlArray, zr as ACTIVE_MAX_INJECTIONS_DEFAULT, zt as docReadsDir } from "./store-Bo8Akf35.js";
//#region src/git.d.ts
/**
 * ⭐⭐ **库内 git 版本维护**（决策 135）。
 *
 * ── 它管什么 ───────────────────────────────────────────────────────────────
 * **仓库根 = `<库根>/backup/`**，`.gitignore` 是**白名单**，**只放行 `narrative/`**：
 * ```
 * *
 * !.gitignore
 * !narrative/
 * !narrative/**
 * ```
 * ⇒ 🔴 **"只维护正文"是这样成立的**：镜像文件里本来就只有正文（见 `narrative.ts`），
 *    所以白名单放行它 = 只版本化正文。`projects/`（含封面）、`entries/`、`reads/`、
 *    `snapshot/`（台账）、`GLOBAL.md` **一律不进仓库**。
 *
 * ── 🔴🔴 四条安全铁律（不做会出事）────────────────────────────────────────
 * 1. **绝不让 git 的失败影响 handoff**：全程 best-effort + 回执如实报警。
 * 2. **绝不让 git 卡住**：`execFile`（**不经 shell**）+ `timeout` +
 *    `windowsHide` + 关掉一切交互（凭据/分页/编辑器）。
 * 3. **绝不写用户的全局 git 配置**：身份只写仓库 `--local`，提交时再显式 `-c`。
 * 4. **只 `--local` 或 `-c`，永不 `--global`**（那会改用户全局身份）。
 *
 * ── 身份三级回落（用户要求"生成一个可复用的身份并记住"）────────────────────
 * ```
 * ① 仓库 local 有          ⇒ 沿用（这就是"插件记住了"）
 * ② 只有全局 global 有     ⇒ 用它并写入 local（此后不依赖全局）
 * ③ 两边都没有            ⇒ 生成 memj-handoff-<主机名> / memj-handoff@<主机名>，写入 local
 * ```
 * ⭐ **记在 `backup/.git/config`**（用户问"记在哪"）：与仓库**同生共死**、
 *    连 `backup/` 目录一起拷走就跟着走；不污染配置通道（那是"人会改的开关"该待的地方）。
 *    ⚠️ 代价如实说：`.git/` 被删 ⇒ 身份随仓库消失、下次开启会**重新生成**。
 *
 * @module dsh-memj/git
 */
/** 生成身份的形态（`<主机名>` 让多台机器可区分）。 */
declare function defaultIdentity(): {
  name: string;
  email: string;
};
/** 一次 git 调用的结果。 */
interface GitRun {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** 失败原因（超时 / 命令不存在 / 非零退出）。 */
  error: string;
}
/** git 调用选项。 */
interface GitOptions {
  /** 额外 `-c key=value`（显式身份等）。 */
  config?: ReadonlyArray<readonly [string, string]>;
  /** 超时（毫秒）。 */
  timeoutMs?: number;
}
/**
 * 跑一次 git（**唯一的调用实现**）。
 *
 * 🔴 环境变量是安全边界的一部分：
 *   · `GIT_TERMINAL_PROMPT=0` —— 任何凭据提示直接失败，**绝不等待输入**；
 *   · `GIT_ASKPASS=echo` / `GCM_INTERACTIVE=never` —— 双层兜底；
 *   · `GIT_PAGER=cat` / `GIT_EDITOR=true` —— 不许分页器/编辑器挂住进程；
 *   · `LC_ALL=C` —— 让错误信息稳定（便于判据匹配），不被本地化影响。
 * @param cwd - 工作目录（一般是仓库根）。
 * @param args - git 参数。
 * @param options - 见 `GitOptions`。
 * @returns 结果（**不抛**）。
 */
declare function runGit(cwd: string, args: readonly string[], options?: GitOptions): Promise<GitRun>;
/**
 * 探测 git 环境（**只读**，不建任何东西）。
 *
 * ⭐ 用在 `POST /settings`（或 `/backup/setup`）里：**环境不通就拒绝开启开关**——
 *    否则开关会写着"已开启"却永不工作，**那是在说谎**（本项目一贯判据）。
 * @returns 探测结果。
 */
declare function probeGit(): Promise<{
  available: boolean;
  version: string;
  /** 库根是否已在**别的**仓库里（嵌套仓库会让我们的提交落到别人的仓库里）。 */
  nestedRepoAt: string;
  error: string;
}>;
/** 仓库当前的配置（身份 + 是否已 init）。 */
interface RepoState {
  /** `backup/.git` 是否存在。 */
  initialized: boolean;
  /** 当前生效的提交者身份（可能来自 local / global / 生成）。 */
  identity: {
    name: string;
    email: string;
    source: 'local' | 'global' | 'generated' | 'none';
  };
  /** 仓库根绝对路径。 */
  repoPath: string;
}
/**
 * ⭐ **确保仓库存在并可用**（幂等；`POST /backup/setup` 的主实现）。
 *
 * 顺序：探测 git → 判嵌套 → `git init` → 写 `.gitignore`/`.gitattributes` → 决定身份。
 * @returns 逐步骤的真实结果（前端要按它逐个点亮，**不许本地假进度**）。
 */
declare function ensureRepo(): Promise<{
  ok: boolean;
  steps: Array<{
    id: string;
    label: string;
    ok: boolean;
    detail: string;
  }>;
  repoPath: string;
  identity: RepoState['identity'];
}>;
/**
 * 读仓库现状（**只读**，供设置卡片显示）。
 * @returns 现状（仓库不存在时 `initialized: false`）。
 */
declare function readRepoState(): Promise<RepoState>;
/**
 * ⭐ **规范化提交信息**：标题行与正文之间强制留一个空行。
 *
 * 🔴 为什么必须做（实测）：`git commit -F` 的消息里，
 *    **连续的非空行属于同一段** ⇒ `"标题\n正文"` 会让 `%s` = `"标题 正文"`、
 *    `%b` 为空。表现是"提交成功、内容也在"，但 **`git log --oneline` 里主题被污染**，
 *    而 `%b`（我们用来读"这次正文变了多少"）**永远是空的**。
 * @param message - 原始信息（一般为"标题\n正文"）。
 * @returns 规范化后的信息（标题 + 空行 + 正文）。
 */
declare function normalizeCommitMessage(message: string): string;
/**
 * ⭐ **提交一次**（`git add` + 有变化才 commit）。
 *
 * 🔴 身份**每次显式传**（`-c`），不隐式依赖任何配置文件——
 *    用户明确要求"显式去给身份做相关操作"。
 *
 * ⭐⭐ **只起 2 个 git 进程**（本轮优化，实测 874ms → 约 400ms）：
 *    · 旧写法是 `add` → `status --porcelain` → `commit` → `rev-parse` **四个**，
 *      而**进程启动本身就是主要开销**（Windows 上每个约 200ms）。
 *    · 现在：**无变化时 `commit` 会返回非零** ⇒ 直接用它的退出码判断"要不要提交"，
 *      **省掉 `status`**；**提交号从 `commit` 的 stdout 里抠**（`[main abc1234]`），
 *      **省掉 `rev-parse`**。
 * @param identity - 生效身份。
 * @param message - 提交信息（**多行必须走 `-F` 文件**：`-m` 会把多行中文拆坏，本项目踩过）。
 * @returns 结果；`committed: false` 表示无变化（**不是失败**）。
 */
declare function commitAll(identity: {
  name: string;
  email: string;
}, message: string): Promise<{
  ok: boolean;
  committed: boolean;
  hash: string;
  error: string;
}>;
/** 最近一次提交（供设置卡片显示）。 */
declare function lastCommit(): Promise<{
  hash: string;
  subject: string;
} | undefined>;
/** 记一次成功（清零）。 */
declare function noteGitSuccess(): void;
/**
 * 记一次失败。
 * @returns 当前连续失败次数。
 */
declare function noteGitFailure(): number;
/** 读当前连续失败次数（测试与回执判断用）。 */
declare function gitFailureStreak(): number;
/** 重置计数（测试用）。 */
declare function resetGitFailureStreak(): void;
//#endregion
//#region src/history.d.ts
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
declare const HISTORY_SECTION = "历史进展";
/**
 * 一条 `###` 小节的边界（含标题行）。
 *
 * ⚠️ **与 `handoff.ts` 的 `splitAny` 同规则**：跳过代码围栏内的伪标题。
 *    自己实现一份是因为 `splitAny` 在 `handoff.ts` 内部、未导出。
 *    ⚠️ 两边规则若漂移会出问题 ⇒ 探针里有一条**断言两者对同一文档切出相同小节**。
 */
interface SubSection {
  title: string;
  level: 2 | 3;
  /** 标题行下标（0 起）。 */
  start: number;
  /** 结束下标（不含）——下一个**级别 ≤ 本级**的标题。 */
  end: number;
}
/**
 * 按 `##` / `###` 切节（**跳过围栏**）。
 *
 * ⚠️ **决策 223 后它只服务读侧**（`readHistoryLines`）—— 写侧（截断）已删。
 * @param lines - 全文行。
 * @returns 小节数组。
 */
declare function splitSectionsForHistory(lines: readonly string[]): SubSection[];
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
declare function readHistoryLines(narrative: string): string[];
//#endregion
//#region src/narrative.d.ts
/**
 * ⭐⭐ **正文镜像**（决策 135）—— git 版本维护的对象。
 *
 * ── 它解决的是什么问题 ─────────────────────────────────────────────────────
 * 用户的两个诉求在**同一个文件里**是冲突的：
 *   · 想对"**压缩后的正文**"做版本管理（压缩搞砸了能退回去）；
 *   · 但活跃文档 `projects/HANDOFF-<项目>.md` **把封面和正文混在一个文件里**，
 *     而封面是"知识的唯一源头"，**不该被当成正文的版本去回溯**。
 *
 * ⇒ 解法：**另存一份纯正文的文件**给 git 管。它由
 *   `narrativeFromProjectText()` 生成（已剥掉 frontmatter、`# HANDOFF` 标题、
 *   「沉淀知识」节与**全部封面**）⇒ ⭐ **"只维护正文"不是靠过滤技巧，而是它本来就只有正文**。
 *
 * ── 与「历史归档」的分工（**两个东西，别混**）────────────────────────────
 * | | 历史归档（`history.ts`） | 镜像（本模块） |
 * |---|---|---|
 * | 落点 | 库里的一条**条目**（`kind: 'history'`） | 库内文件 `backup/HANDOFF-<项目>.md` |
 * | 内容 | **被截走的原文**（逐字） | **当前正文**（跟随活跃文档） |
 * | 用途 | 兜底：早前写下的原文都查得回 | 版本：截断改坏了能退回去 |
 *
 * ⚠️ **历史（决策 136）**：曾有一个"追加型台账"（`backup/snapshot/`，只追加不压缩），
 *    已被用户裁定**删除**——"存档原文"这件事改由**历史条目**承担，
 *    两套机制并存只会长出两套边界。
 *
 * @module dsh-memj/narrative
 */
/**
 * 读某项目的镜像正文（**剥掉页眉**，便于与活跃文档的叙事逐字比对）。
 * @param projectId - 项目 id。
 * @returns 正文；不存在时 `undefined`。
 */
declare function readNarrativeMirror(projectId: string): Promise<string | undefined>;
/**
 * ⭐ **写某项目的正文镜像**（覆盖）。
 *
 * 🔴 **必须只在"叙事真的变了"时才写**：否则每次 handoff 都会刷一次文件，
 *    git 里会多出一堆**内容相同的空提交**（提交前虽会判 `porcelain`，
 *    但白写一次盘、且 diff 判断也失去意义）。
 * @param projectId - 项目 id。
 * @param narrative - 纯叙事（`narrativeFromProjectText()` 的结果）。
 * @returns 是否**真的写了**（内容未变时 `false`）。
 */
declare function writeNarrativeMirror(projectId: string, narrative: string): Promise<boolean>;
//#endregion
export { ACTIVE_BAND_DEFAULT, ACTIVE_MAX_INJECTIONS_DEFAULT, Config, ContextItem, Cover, CoverIssue, DEFAULT_CONFIG, DESC_MAX_CHARS, DecisionProvider, DocReadRecord, DocSection, ENTRY_KINDS, ENTRY_KIND_DEFS, EntryDoc, EntryFrontmatter, EntryKind, EntryKindDef, FixResult, GitRun, HANDOFF_UNTOUCHED_CLOSING, HANDOFF_UNTOUCHED_SECTIONS, HISTORY_SECTION, HIT_WEIGHTS, HOT_BIND_SOURCES, HOT_CHANNELS, HOT_PROJECT_UNKNOWN, HOT_SHAPES, HotBindSource, HotChannel, HotEntriesFile, HotEntrySetting, HotPersonaFile, HotPersonaItem, HotProjectEntry, HotProjectSelection, HotSelectionFile, HotSessionBinding, HotSessionsFile, HotShape, KIND_CATALOG_MARKER, KIND_LIST_MARKER, KNOWLEDGE_SECTION, KNOWLEDGE_TITLE, LibrarySnapshot, LiveKindDef, MemjConfig, NARRATIVE_SECTIONS, NARRATIVE_TITLES, Nomination, NominationsFile, PROGRESS_TITLE, ParsedCover, ProjectFrontmatter, ProjectRecord, ReadDecision, ReadSnapshot, RepoState, SECTION_SPEC_CLOSING, SECTION_SPEC_HEAD, SELECTABLE_ENTRY_KINDS, SLUG_RE, SNAPSHOT_CLOSING, SPEC_BLOCK_FENCE, SPEC_SECTION, SPEC_TITLE, ScanOptions, SearchHit, SectionGroup, SubSection, TITLE_MAX_CHARS, TITLE_MIN_CHARS, ThemeFrontmatter, activeDecisionOf, addNomination, appendDocRead, appendReadSnapshot, approveNomination, backupDir, backupNarrativePath, bodySize, buildSkeleton, byUpdatedDesc, charCount, commitAll, consumeSnapshots, coverFromYaml, currentKindDefsOf, currentKindsOf, currentReservedKinds, cutKnowledgeSection, cutSpecSection, decideRead, decisionProvidersOf, defaultIdentity, defaultTemplatePath, deleteEntryFile, deleteProjectDoc, deleteThemeDoc, deriveDecisionKeyRef, docReadLogPath, docReadsDir, docSectionsOf, editDistance, ensureLibraryDirs, ensureRepo, entriesDir, entryFileName, entryKindWhen, entryRelPath, extractSection, extractSpecBlock, extractSpecBlockLines, extractSpecSection, extractTitle, fillKindMarkers, filterByContext, filterContextByTerms, findDocRead, findSectionRange, findSimilarIds, fixCoverBlock, fixExternalRef, gitFailureStreak, globalDocPath, groupBySourceProject, groupSections, hotDir, hotEntriesPath, hotPersonaPath, hotSelectionPath, hotSessionsPath, isAbsolutePath, isEntryKind, isHistoryCover, isKnowledgeHeading, isSimilarId, itemMinOf, kindCatalogText, kindsFilePath, kindsInline, lastCommit, legacyTemplatePath, libraryRoot, loadEntryDoc, loadProjectDoc, loadThemeFrontmatter, maxInjectionsPerTurn, narrativeFromProjectText, needMinOf, nominationsPath, normalizeCommitMessage, normalizeQuery, noteGitFailure, noteGitSuccess, parseCovers, parseSections, pendingSnapshots, pluginRoot, preview, probeGit, projectDocPath, projectIdFromFile, projectsDir, promptHistoryDir, promptOverridesPath, promptsDir, rawKindFromYaml, readDocReads, readHistoryLines, readLogPath, readNarrativeMirror, readNominations, readRepoState, readSnapshots, readUnconsumedSnapshots, readsDir, rebuildDerivedLayers, recallLogDir, recallLogPath, recordRead, rejectNomination, removeNomination, renderCover, renderFrontmatter, renderSectionSpecs, renderSnapshotList, renderSpecBlockLines, renderYamlArray, replaceBlockAtLines, requiredDirs, resetGitFailureStreak, resolveDecisionPick, resolveInsideLibrary, resolveRef, runGit, safeName, scanLibrary, scoreCover, scoreDecisionOf, scoreFilePath, scoreLogDir, scoreLogPath, sectionSpecsOf, sectionTitles, sectionsFromNarrative, selectableKindList, setCurrentKindDefs, setSectionSpecBlock, sortHits, specBlockFenceInfo, specBlockRange, splitFrontmatter, splitSectionsForHistory, stripAllSpecBlocks, stripCovers, stripSpecBlock, syncEntryFrontmatter, tagAutoStatePath, tagVocabularyPath, tagsDir, templatePath, templatesDir, themeDocPath, themesDir, toStringArray, validateCoverShape, writeEntryDoc, writeGlobalDoc, writeNarrativeMirror, writeNominations, writeProjectDoc, writeThemeDoc, yamlScalar };