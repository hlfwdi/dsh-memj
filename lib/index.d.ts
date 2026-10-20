import { $ as isKnowledgeHeading, $n as CoverIssue, $t as nominationsPath, A as removeNomination, An as TITLE_MAX_CHARS, Ar as ReadSnapshot, At as extractSection, B as NARRATIVE_SECTIONS, Bn as parseCovers, Br as kindsInline, Bt as docReadsDir, C as projectIdFromFile, Cn as tagsDir, Cr as KIND_CATALOG_MARKER, Ct as recordRead, D as readUnconsumedSnapshots, Dn as themesDir, Dr as NominationsFile, Dt as ReadDecision, E as readSnapshots, En as themeDocPath, Er as Nomination, Et as DocSection, F as writeNominations, Fn as extractTitle, Fr as currentReservedKinds, Ft as sectionTitles, G as SPEC_TITLE, Gn as replaceBlockAtLines, Gr as Config, Gt as hotDir, H as PROGRESS_TITLE, Hn as renderCover, Hr as setCurrentKindDefs, Ht as entryFileName, I as writeProjectDoc, In as findSimilarIds, Ir as entryKindWhen, It as backupDir, J as cutSpecSection, Jn as toStringArray, Jr as MemjConfig, Jt as hotSelectionPath, K as buildSkeleton, Kn as splitFrontmatter, Kr as DEFAULT_CONFIG, Kt as hotEntriesPath, L as writeThemeDoc, Ln as isAbsolutePath, Lr as fillKindMarkers, Lt as backupNarrativePath, M as syncEntryFrontmatter, Mn as charCount, Mr as ThemeFrontmatter, Mt as groupSections, N as writeEntryDoc, Nn as coverFromYaml, Nr as currentKindDefsOf, Nt as parseSections, O as rebuildDerivedLayers, On as DESC_MAX_CHARS, Or as ParsedCover, Ot as SectionGroup, P as writeGlobalDoc, Pn as editDistance, Pr as currentKindsOf, Pt as preview, Q as extractSpecSection, Qn as Cover, Qt as libraryRoot, R as KNOWLEDGE_SECTION, Rn as isSimilarId, Rr as isEntryKind, Rt as defaultTemplatePath, S as loadThemeFrontmatter, Sn as tagVocabularyPath, Sr as HotShape, St as pendingSnapshots, T as readNominations, Tn as templatesDir, Tr as LiveKindDef, Tt as renderSnapshotList, U as SPEC_BLOCK_FENCE, Un as renderFrontmatter, Ut as entryRelPath, V as NARRATIVE_TITLES, Vn as rawKindFromYaml, Vr as selectableKindList, Vt as entriesDir, W as SPEC_SECTION, Wn as renderYamlArray, Wt as globalDocPath, X as extractSpecBlock, Xn as yamlScalar, Xt as kindsFilePath, Y as docSectionsOf, Yn as validateCoverShape, Yt as hotSessionsPath, Z as extractSpecBlockLines, Zn as ContextItem, Zt as legacyTemplatePath, _ as fixExternalRef, _n as safeName, _r as HotProjectEntry, _t as HANDOFF_UNTOUCHED_SECTIONS, a as addNomination, an as promptsDir, ar as EntryKind, at as specBlockRange, b as loadEntryDoc, bn as scoreLogPath, br as HotSessionBinding, bt as SNAPSHOT_CLOSING, c as approveNomination, cn as readingCursorsPath, cr as HOT_CHANNELS, ct as HIT_WEIGHTS, d as deleteEntryFile, dn as readsDir, dr as HotBindSource, dt as filterByContext, en as pluginRoot, er as DocReadRecord, et as renderSpecBlockLines, f as deleteProjectDoc, fn as recallLogDir, fr as HotChannel, ft as filterContextByTerms, g as fixCoverBlock, gn as resolveRef, gr as HotPersonaItem, gt as HANDOFF_UNTOUCHED_CLOSING, h as findDocRead, hn as resolveInsideLibrary, hr as HotPersonaFile, ht as sortHits, i as ScanOptions, in as promptOverridesPath, ir as EntryFrontmatter, it as specBlockFenceInfo, j as scanLibrary, jn as TITLE_MIN_CHARS, jr as SELECTABLE_ENTRY_KINDS, jt as findSectionRange, k as rejectNomination, kn as SLUG_RE, kr as ProjectFrontmatter, kt as decideRead, l as byUpdatedDesc, ln as readingDir, lr as HOT_PROJECT_UNKNOWN, lt as SearchHit, m as ensureLibraryDirs, mn as requiredDirs, mr as HotEntrySetting, mt as scoreCover, n as LibrarySnapshot, nn as projectsDir, nr as ENTRY_KIND_DEFS, nt as sectionsFromNarrative, o as appendDocRead, on as readLogPath, or as EntryKindDef, ot as stripAllSpecBlocks, p as deleteThemeDoc, pn as recallLogPath, pr as HotEntriesFile, pt as normalizeQuery, q as cutKnowledgeSection, qn as stripCovers, qt as hotPersonaPath, r as ProjectRecord, rn as promptHistoryDir, rr as EntryDoc, rt as setSectionSpecBlock, s as appendReadSnapshot, sn as readingBindingsPath, sr as HOT_BIND_SOURCES, st as stripSpecBlock, t as FixResult, tn as projectDocPath, tr as ENTRY_KINDS, tt as sectionSpecsOf, u as consumeSnapshots, un as readingStatePath, ur as HOT_SHAPES, ut as bodySize, v as isChatCover, vn as scoreFilePath, vr as HotProjectSelection, vt as SECTION_SPEC_CLOSING, w as readDocReads, wn as templatePath, wr as KIND_LIST_MARKER, wt as renderSectionSpecs, x as loadProjectDoc, xn as tagAutoStatePath, xr as HotSessionsFile, xt as groupBySourceProject, y as isHistoryCover, yn as scoreLogDir, yr as HotSelectionFile, yt as SECTION_SPEC_HEAD, z as KNOWLEDGE_TITLE, zn as narrativeFromProjectText, zr as kindCatalogText, zt as docReadLogPath } from "./store-BaLujeRB.js";
import { ContentBlock } from "@deepseek-ai/dsh-llm";
import { Context } from "@deepseek-ai/cordis";
import { Agent } from "@deepseek-ai/dsh-agent";
//#region src/protocol.d.ts
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
declare const PROTOCOL_TEXT = "## memj 记忆协议\n\nmemj 库里的可复用知识以**「封面 + 正文」两段**组织，三层结构：项目 → 主题 → 全局。\n**封面只写在项目级 handoff 文档里**（唯一源头）；主题与全局是工具从封面聚合出的派生索引。\n**文档与知识都集中在 memj 库里，不在工作区**，取用按逻辑地址（项目 id / 主题 / 全局），不以物理路径区分。\n\n### 何时查\n\n任何需要信息的时候都根据需求必须优先使用memj工具，除非确认该信息无法在知识库获得——插件不会自动推送任何记忆。**工具分三层用，别混**：\n- `memj_info` —— **只报语境**（有哪些项目/主题及 id）；**不返回知识条目**。\n- `memj_search` —— **只找**：按 project / theme / query 筛，**只回封面**，不回正文。\n- `memj_read` —— **只读**：按 id 取正文；长文档给**节名清单**，用 `section` 取具体节。\n- `memj_snapshots` —— 只读**本会话的读快照清单**（跨项目证据的来源）。\n\n**典型三步**：`memj_info` 拿语境 id ⇒ `memj_search` 筛封面 ⇒ `memj_read` 取正文。\n\n**两处必须查**：\n1. 新会话中，回应第一条用户消息之前；\n2. 会话中途用户意图明显转向时（话题对象变了、任务性质变了、显式开新话题）。\n   ⚠️ 同一条需求内的追问、补充细节、纠正措辞**不算转向**，不要重复检索。\n\n### 何时写\n\n⭐ **写库规范的唯一出处是 `memj_handoff` 工具的 description**——\n「写什么、怎么判项目、怎么归属、正文怎么写」全在那里，**协议不再重复**。\n\n🔴 **写之前先调 `memj_search`（或 `memj_info`）看已有内容，不要写出重复的知识。**\n\n⭐ **新建主题有两种校验模式**（本实例是哪一种，`memj_snapshots` 的返回值会明说）：\n- **严格**：必须有**别项目的知识**（快照）被本项目采用作证据；没有 ⇒ 工具会拒收；\n- **宽松**：不做这项校验，你判断该建就建。\n\n### 推进归属（**累加，不是搬家**）\n\n> 术语：**添加主题**＝往 `theme` 数组追加｜**移除主题**＝从数组移除；\n> **加入全局**＝登记待批提名（封面 `global` **暂不置位**，批准才置 `true`）。\n> ⭐ **可在写交接文档的 `memj_handoff` 调用里一并完成，也可随时用 `memj_promote` 单独改。**\n\n- 🔴 **推进不改动原有归属**：加过主题的知识**仍是项目知识**，\n  加入全局的**仍命中原来的主题**。**不要用新值覆盖旧值。**\n- 🔴 **加入全局只能提名**：**封面 `global` 保持 `false`**，批准那一刻才置 `true`。\n  **你不能自己批准**，也别自行置 `true`。\n- 推进**只改元数据**，不改知识文档的位置与内容。\n\n### 边界\n\n- 知识归属**由你判断**，工具只做解析与校验，不替你分类；\n- 经 `/memj-*` 命令取到的内容即为权威，不要重复检索同一范围。";
/**
 * 协议在系统提示里的 order。
 *
 * 取 `3000`：排在全部工具指引（官方最大 `TOOL_REPORT = 2900`）之后、
 * `TOOLS_SDK = 5000` 之前——即在"工具怎么用"之后给出"记忆怎么写"。
 * 与旧 `dsh-memory` 保持同一位置，便于对照。
 */
declare const PROTOCOL_SECTION_ORDER = 3000;
/**
 * 取当前协议文本。
 * @returns 恒定不变的协议字符串。
 */
declare function protocolText(): string;
//#endregion
//#region src/prompt-catalog.d.ts
/**
 * ⭐⭐⭐ **提示词目录**（2026-10-12 新增）——设置页【提示词】的**人读元数据唯一出处**。
 *
 * ── 为什么单独一个模块 ──────────────────────────────────────────────────────
 * `prompts.ts` 的 `PROMPT_SPECS` 负责**程序语义**（key / 校验 / 热生效 / 源码常量），
 * 而本模块负责**给人看的文字**（分组 / 归属 / 用途说明）。
 * ⇒ ⭐ 分开的好处：改文案不必碰程序逻辑；且**可以机械校验"每条 spec 都有目录条目"**
 *   （见 `scripts/check-prompt-specs.mjs` 的检查 ④）。
 *
 * ── 分组轴：**谁在什么时候看到这段文本**（不是按代码模块分）────────────────
 * 这是用户提出的判据 —— 按功能模块分会让人看不懂（"为什么 memj_read 有 11 条"）。
 * 按"谁看"分，一眼就明白这段文字的作用域。
 *
 * | 组 | 谁看 | 什么时候 |
 * |---|---|---|
 * | `resident` | **模型** | 每轮对话都在 |
 * | `tools` | **模型** | 决定"调哪个工具、怎么调"时 |
 * | `commands` | **人** | 命令菜单 / 输入框（⚠️ 模型看不到） |
 * | `actions` | **模型** | 你打了某个命令时，注入会话 |
 * | `hot` | **模型** | 每轮自动注入的背景知识 |
 * | `recall` | **判定模型**（JEV） | 插件内部判断"要不要召回"时 |
 * | `score` | **子代理** | 每轮结束时复盘打分 |
 * | `tags` | **子代理** | 整理标签时 |
 * | `translate` | **翻译模型** | 重建英文索引时 |
 * | `templates` | **模型** | 读用了自定义模板的项目文档时 |
 *
 * @module dsh-memj/prompt-catalog
 */
/** 分组 id（受控）。 */
type PromptGroup = 'resident' | 'tools' | 'commands' | 'actions' | 'hot' | 'recall' | 'score' | 'tags' | 'translate' | 'templates';
/** 一个分组的展示信息。 */
interface PromptGroupInfo {
  /** 组标题（页面上那一栏的名字）。 */
  title: string;
  /** ⭐ **一句话说清这组是给谁看的、什么时候看**（页面显示在组标题下方）。 */
  about: string;
  /** 排序权重（小的在前）。 */
  order: number;
}
/**
 * ⭐ **分组表**（顺序即页面顺序）。
 *
 * ⚠️ **轴是"谁看 / 何时看"**，不是"代码在哪个文件"。改这个轴会让页面重新变得难懂，
 *    故在此显式声明理由。
 */
declare const PROMPT_GROUPS: Readonly<Record<PromptGroup, PromptGroupInfo>>;
/** 一条提示词的**人读元数据**。 */
interface PromptCatalogEntry {
  /** 属于哪个分组。 */
  group: PromptGroup;
  /** 从属对象（页面标题行显示）。⭐ 必须写**真实归属**，别写成"经由谁送出"。 */
  owner: string;
  /**
   * ⭐⭐ **用途说明**（页面正文字段）——要求：
   *  · 说清**这是干嘛的**（不是"这是 XX 的描述"这种同义反复）；
   *  · 说清**谁看、什么时候看**；
   *  · 有反直觉之处时**点出后果**（如"删了它值就进不去了"）。
   */
  purpose: string;
  /**
   * 工具条目的**部位**（仅 `tools` 组用）：说明书 / 参数表 / 返回格式。
   * ⚠️ 前端据此把同一工具的 3 条**折成一张卡**（用户要求"该合并的合并"）。
   */
  part?: 'description' | 'parameters' | 'output';
}
/**
 * ⭐⭐⭐ **目录**（键 = `PROMPT_SPECS` 的 key）。
 *
 * 🔴 **加新提示词时必须在这里补一条**（否则检查 ④ 报红、页面显示"（未登记说明）"）。
 */
declare const PROMPT_CATALOG: Readonly<Record<string, PromptCatalogEntry>>;
/** 取一条的目录信息（未登记返回 `undefined`）。 */
declare function catalogOf(key: string): PromptCatalogEntry | undefined;
/** 分组排序（页面用）。 */
declare function groupOrder(g: PromptGroup): number;
/**
 * 渲染**参数表**。
 *
 * ── 格式选择：为什么用「分条列表」而不是 markdown 表格 ──────────────────────
 * 🔴 **第一版用了 markdown 表格**（`| 参数 | 类型 | 说明 |`），而它是**贴在 `<pre>` 里**
 *    当纯文本显示的 ⇒ 两个后果：
 *      · 等宽字体里**中文宽度是 2、竖线是 1** ⇒ **列永远对不齐**（看起来像没排版）；
 *      · **窄屏**（420px）下换行后彻底散架（用户正是要在移动端看）。
 *    ⭐ 换成**分条列表**：参数名 + 类型一行，说明缩进在下面。
 *      ⇒ 宽窄屏都清晰，且**不需要前端做表格渲染**（少一层可能出错的东西）。
 *
 * 🔴 **必须处理"JSON Schema 形状"**（实测踩到）：`defineTool` 的 `parameters`
 *    **不是**扁平的 `{参数名: 定义}`，而是 `{ type: 'object', properties: {…} }`
 *    ⇒ 直接 `Object.entries` 会渲染出 `type` / `properties` 两行（**看起来像参数名，其实是壳**）。
 *    ⭐ 判据：**渲染前先看数据的真实形状**，别按想象的形状写。
 * @param parameters - `defineTool` 的 `parameters` 对象。
 * @returns 人读文本；无参数时回一句说明。
 */
declare function renderParametersText(parameters: unknown): string;
/**
 * 渲染**返回值契约**。
 *
 * ⚠️ 与 `renderParametersText` 同因：**不用 markdown 表格**（`<pre>` 里对不齐、窄屏散架）。
 * @param output - `defineTool` 的 `output` 对象（形如 `{ schema: {...} }`）。
 * @returns 人读文本。
 */
declare function renderOutputText(output: unknown): string;
//#endregion
//#region src/prompts.d.ts
/** 覆盖文件结构版本（结构变了就升它 ⇒ 旧文件当空表，不猜）。 */
declare const PROMPT_OVERRIDES_VERSION = 1;
/** 覆盖表：`key → { text, updatedAt }`。 */
interface PromptOverrides {
  version: number;
  overrides: Record<string, {
    text: string;
    updatedAt: string;
  }>;
}
/**
 * **分区**（⭐ 2026-10-12 从"三个"扩成"目录的十个分组"）。
 *
 * 🔴 **分组的轴 = "谁在什么时候看到这段文本"**（用户提出的判据）。
 *    ⚠️ 旧轴是"生效方式 / 影响面"（resident / tools / internal）——
 *      它**对改代码的人有用，对看页面的人没用**（用户原话：
 *      *"这样拆，每条都那么一两句话，完全不知道咋回事"*）。
 *    ⇒ 现在按"谁看"分：模型每轮看 / 模型调工具时看 / **人**看 / 子代理看 / 判定模型看。
 *      ⭐ 每组都有页面上的说明（见目录模块的 `PROMPT_GROUPS`）。
 *
 * ⚠️ **与目录的 `PromptGroup` 是同一个类型**（此处是别名，
 *   保持既有 import 路径 `PromptZone` 可用 ⇒ 消费方零改动）。
 */
type PromptZone = PromptGroup;
/**
 * **热生效判定**（探针实测后的三档）。
 *
 * ⚠️ 这一列**必须如实**——它是本页最容易被误解的信息。
 */
type HotReload =
/** 保存后下一轮即生效（覆盖层支撑）。 */
'immediate' |
/**
 * ⭐⭐ **保存后需【重启实例】才生效**（2026-10-12 新增第三档）。
 *
 * 🔴 **为什么必须有这一档**：原来只有 `immediate` / `readonly` 两档，
 *   而**命令描述属于第三种情况**——它能改、覆盖层也存得住、**但没有热更新通路**：
 *   `dsh-commands` 在 **注册那一刻**就把 `description` **固化进 descriptor**
 *   （对比工具描述：`tools.ts` 用 `Object.defineProperty` 换成了 getter ⇒ 每轮重读）。
 *   ⇒ 若把它标成 `immediate`，是**界面在撒谎**（用户改完发现没变，会以为功能坏了）；
 *     标成 `readonly` 又**剥夺了本来可用的能力**（重启后确实生效）。
 *   ⭐ 判据：**"改了会不会生效"与"什么时候生效"是两个问题**，不能合并成一个布尔。
 */
'restart' |
/** 只读展示（改了会破坏契约）。 */
'readonly';
/**
 * 一条提示词的**静态元数据**（展示用；文案由本模块给出，值由调用点给）。
 *
 * ⚠️ **`title` / `purpose` 等字段是"给人看"的**，它们**不进任何提示词通道**
 *    （本项目纪律：写给人看的说明不占模型的常驻预算）。
 */
interface PromptSpec {
  /** 稳定键（`<域>:<归属>:<部位>`）——**不是序号**（序号会在增删工具时错位）。 */
  key: string;
  /**
   * ⭐⭐⭐ **分区 / 用途 / 归属已搬到 `prompt-catalog.ts`**（2026-10-12）。
   *
   * 🔴 **为什么搬**：它们是**给人看的文案**，而本文件是**程序语义**
   *   （校验 / 热生效 / 源码常量）。混在一起会让"改一句话"必须读程序逻辑，
   *   而且**没法机械校验"每条 spec 都有说明"**。
   *
   * ⚠️ 字段仍然**保留在类型里**（运行时由 `withCatalog()` 从目录注入），
   *   所以**所有既有消费方一行都不用改**（`api.ts` / 前端 / 测试）。
   *   ⇒ ⭐ 这是一次"零破坏"的重构：**数据搬家，接口不变**。
   */
  zone?: PromptZone;
  /** 干什么（一句话）。⚠️ 由目录注入，见上。 */
  purpose?: string;
  /** 属于哪个工具 / 功能（展示用）。⚠️ 由目录注入，见上。 */
  owner?: string;
  /** 注入方式（落点）。 */
  injectMode: string;
  /** 是否破前缀缓存。 */
  breaksCache: 'yes' | 'no' | 'na';
  /** 具体写在哪个文件里（相对插件仓根）。 */
  sourceFile: string;
  /**
   * ⭐⭐⭐ **该 key 在源码里的常量名**（2026-10-12 新增）——供「写回源码」功能定位。
   *
   * 🔴 **为什么必须有**：写回要做的是「把覆盖文本替换进
   *   `export const XXX = \`...\`` 的模板串正文」，**光有 `sourceFile` 不够**
   *   （一个文件里有多个常量，如 `tag-normalize.ts` 同时装
   *   `ADJUDICATE_SYSTEM` 与 `TRANSLATE_SYSTEM`）⇒ 必须知道替换**哪一个**。
   *
   * ⚠️ **空串 = 不支持写回**（下列几种情况）：
   *   · 参数 / 输出 schema（值由运行时对象提供，源码里没有对应常量）；
   *   · 动态拼出来的 key（如 `tool:${name}:description`，常量名由扫描得出，
   *     但目前已在 `TOOL_META` 侧固定，不逐个登记）；
   *   · 值形态不是单个字符串、无法机械替换的。
   *   ⇒ 写回 API 遇到空串要**明确报"该条不支持写回"**，不许静默跳过。
   */
  sourceConst?: string;
  /** 保存后是否热生效。 */
  hotReload: HotReload;
  /** 是否允许在页面上编辑（参数/输出 schema 为只读）。 */
  editable: boolean;
  /** 编辑时的校验规则（可多条）。 */
  checks: readonly PromptCheck[];
  /** 只读项的说明（为什么不能改）。 */
  readonlyWhy?: string;
}
/** 校验规则（**保存时同步拦**——用户裁定"可以改完专门做校验"）。 */
type PromptCheck =
/** 不能为空。 */
{
  kind: 'nonEmpty';
} |
/** 最多 N 字符（预算）。 */
{
  kind: 'maxChars';
  max: number;
  why: string;
} |
/** 必须全是英文（JEV 的 4 条：中文会让分辨力归零）。 */
{
  kind: 'englishOnly';
} |
/** markdown 围栏必须成对（`gen-context.mjs` 会拒两个围栏的块）。 */
{
  kind: 'fencesBalanced';
} |
/**
 * ⭐⭐⭐ **必须原样保留的变量插槽**（2026-10-12 新增）。
 *
 * 🔴 **为什么必须有这一档**：有一类提示词**不是整段常量** —— 正文里嵌着
 *    **运行时才算得出来的值**（如"用户指定的这几步"、文档节名）。这类文本
 *    以前只能标 `readonly`（理由是"参数化模板，开放编辑会让分支逻辑与文本脱节"）。
 *
 * ⭐ **本档把它变成可编辑的**：正文写成**带插槽的模板**（`{{名字}}`），
 *    运行时由 `fillSlots()` 填值；保存时**机械校验插槽没被删掉、也没写错**。
 *    ⇒ 用户能改措辞，**但破坏不了"值一定会被填进去"这件事**。
 *
 * 🔴🔴 **2026-10-05 血的补充：本档只适用于【memj 自己填】的通道**（命令注入那些）。
 *    交给 DSH 的通道（`systemPrompt.section()` / `.context()` / 工具描述）
 *    **不能用 `{{名字}}`** —— DSH 会把那段**再解析一遍**，而它只认小写开头、
 *    且要求变量已在 DSH 注册 ⇒ 否则**抛异常、整个会话装配失败**（实测踩崩一次）。
 *    ⇒ 那些通道改用 **HTML 注释标记**（如 `<!--memj:kind-catalog-->`）。
 *    ⚠️ **所以"通道判定"必须与"插槽校验"分开**：见 `validatePrompt` 里的 `dshOwned`。
 *
 * ⚠️ **校验是双向的**（缺一个不行、多一个也不行）：
 *    · 少了登记的插槽 ⇒ 拒（那个值**再也进不去**，且不报错）；
 *    · 出现**没登记**的插槽 ⇒ 也拒（`fillSlots` 不认识它 ⇒ 会**原样发给模型**）。
 */
{
  kind: 'slots';
  tokens: readonly string[];
  why: string;
};
/** ⭐ 【提示词】页的账本：**程序语义 + 目录文案**的合成结果。 */
declare const PROMPT_SPECS: readonly PromptSpec[];
/** 按键取元数据。 */
declare function specOf(key: string): PromptSpec | undefined;
/** 空覆盖表。 */
declare function emptyOverrides(): PromptOverrides;
/**
 * **读覆盖表**（容错：任何异常回空表）。
 *
 * ⚠️ 与 `hot-score-store` 同一纪律：**坏文件不该让功能整个挂掉**；
 *    但也不静默改语义——版本不符就当空表（宁可回默认值，也不用结构不明的表）。
 * @returns 覆盖表。
 */
declare function loadPromptOverrides(): Promise<PromptOverrides>;
/** **原子写**覆盖表。 */
declare function savePromptOverrides(o: PromptOverrides): Promise<void>;
/**
 * ⭐⭐⭐ **同步预热覆盖缓存**（`apply` 时调，**必须是同步的**）。
 *
 * 🔴🔴 **为什么不能用 async 版**：`apply()` 本身是**同步**的，而
 *    `ctx.inject([...], cb)` 的回调**可能在预热完成之前就跑了** ⇒
 *    首次装配读到的是**默认值**（用户会看到"我明明改了、这一轮没生效"）。
 *    ⭐ 用同步读消除这个竞态 —— 覆盖表很小（几 KB），同步读的代价可忽略。
 *
 * ⚠️ **任何异常都当"没有覆盖"**（回源码默认值）——绝不让它阻断启动。
 * @returns 装载的条数（诊断用）。
 */
declare function refreshPromptCacheSync(): number;
/**
 * ⭐⭐⭐ **把覆盖表读进内存**（保存后刷新）。
 *
 * ⚠️ **写入失败不抛给调用方的主流程**：缓存刷不上只是"本次没生效"，
 *    不该让一次保存把整个插件弄崩（照 recall-log 的纪律）。
 * @returns 装载的条数（诊断用）。
 */
declare function refreshPromptCache(): Promise<number>;
/** 清空内存缓存（测试用）。 */
declare function resetPromptCache(): void;
/** 直接注入缓存（测试用：免磁盘）。 */
declare function setPromptCacheForTest(entries: Record<string, string>): void;
/**
 * ⭐⭐⭐ **取一条提示词的当前值**（覆盖值优先，否则用调用方给的源码常量）。
 *
 * 这是**所有取值点唯一该调的入口**。
 * @param key - 稳定键（见 `PROMPT_SPECS`）。
 * @param fallback - **调用方自己的源码常量**（即"默认值"；恢复默认 = 删覆盖项）。
 * @returns 该生效的文本。
 */
declare function promptText(key: string, fallback: string): string;
/** 该键是否被覆盖（展示用）。 */
declare function hasOverride(key: string): boolean;
/**
 * **取该键被覆盖的时间**（展示用）；未被覆盖时回 `''`。
 *
 * 🔴 **为什么要单独存一份时间**：`cache` 只存文本（那是装配路径要的）；而界面上
 *    "这是什么时候改的"必须如实显示 —— ⚠️ 我第一版在 API 里硬写了 `updatedAt: ''`，
 *    那是**界面在撒谎**（明明有值却说没有），本项目不允许。
 */
declare function overrideUpdatedAt(key: string): string;
/** 当前全部覆盖键（展示用）。 */
declare function overriddenKeys(): string[];
/**
 * **登记一条默认文本**（各模块加载时调；重复登记以最后为准）。
 * @param key - 稳定键。
 * @param text - 源码常量（默认值）。
 */
declare function registerPromptDefault(key: string, text: string): void;
/** 取默认文本（展示用）；未登记时 `undefined`。 */
declare function promptDefault(key: string): string | undefined;
/**
 * ⭐⭐ **已登记默认值的全部 key**（2026-10-12 新增）——供**对账**用。
 *
 * 🔴 **为什么需要它**：`PROMPT_SPECS`（页面账本）与 `registerPromptDefault`
 *   （各模块实际登记）是**两条路各自维护同一个事实** ⇒ 会漂。
 *   而要查出"**已登记但不在册**"这个方向（页面完全看不到它——
 *   本次 `memj_template` 事故的形态），就必须能**枚举已登记的 key**。
 *   ⚠️ 只有 `promptDefault(key)` 是查不出这个方向的：它要求你先知道 key。
 *
 * ⭐ 消费方：`scripts/diag-prompt-coverage.mjs`（双向对账，只读诊断）。
 * @returns 已登记的 key（插入顺序）。
 */
declare function registeredPromptKeys(): string[];
/** 当前生效文本（展示用：覆盖优先，否则默认）。 */
declare function promptCurrent(key: string): string;
/**
 * ⭐⭐ **保存前的校验**（用户要求"可以改完专门做校验"）。
 *
 * 🔴 **为什么要在这里拦**：
 *  - `section()` 改坏 ⇒ **每轮全废前缀缓存**，且模型看到坏协议；
 *  - JEV 四条改成中文 ⇒ **分数分布被压平、主动注入静默失效**（实测条目 `efdebc4e`）；
 *  - 围栏多一个 ⇒ `gen-context.mjs` 直接罢工（本项目已知坑）。
 *
 * ⚠️ 校验**只判"可判定的"**，语义好坏机器判不了（照本项目一贯边界）。
 * @param key - 稳定键。
 * @param text - 待保存文本。
 * @returns 违规说明列表（空 = 通过）。
 */
/**
 * 🔴🔴 **常驻防线：交给 DSH 的文本里禁止 `{{…}}`**（决策 217，**踩崩一次换来的**）。
 *
 * ── 事故 ──────────────────────────────────────────────────────────────────
 * 我用 `{{kindCatalog}}` 当插槽，**没有走本文件的校验**（那次是直接写覆盖层），
 * 结果整个会话装配抛：
 * `malformed prompt variable reference "{{kindCatalog}}" in context "memj:usage-guidance"`
 *
 * ── 根因 ──────────────────────────────────────────────────────────────────
 * `systemPrompt.context()` / `section()` 的文本会被 **DSH 自己再跑一遍 `interpolate()`**：
 * `VARIABLE_NAME = /^[a-z][a-z0-9_]*$/`（只允许小写开头）且变量须已注册 ⇒ 否则 **throw**。
 * ⇒ ⭐⭐ **`{{}}` 在 DSH 里是"有主"的语法**，memj 的常驻文本**用不了**。
 *
 * ── 为什么必须做成检查 ─────────────────────────────────────────────────────
 * 这类文本有**两个投递口**：设置页保存（走 `validatePrompt`）与**直接写覆盖表**。
 * 只顾一头 ⇒ 另一头能把会话搞崩。⇒ **把判据放在"文本进入系统"的必经之处**。
 * @param text - 要交给 DSH 的文本。
 * @returns 问题清单（空 = 安全）。
 */
declare function checkNoDshVariables(text: string): string[];
declare function validatePrompt(key: string, text: string): string[];
/**
 * ⭐⭐⭐ **取出文本里出现的全部插槽名**（去重）。
 *
 * ⚠️ **字符集刻意收窄**（`[A-Za-z0-9_]`）：提示词正文里本来就有大量 `{` `}`
 *    （如 JSON 示例 `{"picks":[]}`）⇒ 若允许空格/中文，`{ 编号 }` 这类**正常正文**
 *    会被误认成插槽，导致保存被无故拒绝。
 * @param text - 待扫描文本。
 * @returns 插槽名（出现顺序、已去重）。
 */
declare function slotNames(text: string): string[];
/**
 * ⭐⭐⭐ **把 `{{名字}}` 填成运行时值**（`slots` 校验的对侧）。
 *
 * 🔴 **两者必须成对**：`slots` 校验保证"插槽还在"，本函数保证"值真的填进去了"。
 *    只做一侧就会出现本项目反复记过的那类静默失败。
 *
 * ⚠️ **未提供的插槽保持原样**（不填空串）：这样它**在输出里可见**
 *    （模型会看到 `{{xxx}}`，人排查时也能一眼认出），比静默吞掉强。
 *    正常路径上不该发生——`slots` 校验已经拦住了没登记的插槽。
 * @param template - 带插槽的模板文本。
 * @param vars - 插槽名 → 值。
 * @returns 填好的文本。
 */
declare function fillSlots(template: string, vars: Readonly<Record<string, string>>): string;
/** 保存结果。 */
interface SavePromptResult {
  ok: boolean;
  /** 失败原因（`ok:false` 时非空）。 */
  errors: readonly string[];
  /** 是否写盘成功（校验通过但写盘失败时 `ok:false` 且这里为 false）。 */
  saved: boolean;
  /** 备份文件的绝对路径（写了才有）。 */
  backupPath?: string;
}
/**
 * ⭐⭐⭐ **保存一条提示词的覆盖值**（校验 → 备份 → 写盘 → 刷缓存）。
 *
 * 🔴 **顺序不能变**：校验必须在写入之前（本项目纪律：校验是"对当前磁盘状态的判断"，
 *    必须发生在任何会改写磁盘的动作之前）；备份必须在覆盖之前（否则没有回退）。
 * @param key - 稳定键。
 * @param text - 新文本。
 * @returns 保存结果。
 */
declare function savePromptOverride(key: string, text: string): Promise<SavePromptResult>;
/**
 * ⭐ **恢复默认**（删掉覆盖项 ⇒ 自动回落到源码常量）。
 * @param key - 稳定键。
 * @returns 保存结果（`saved` 表示是否真的写了盘）。
 */
declare function resetPromptOverride(key: string): Promise<SavePromptResult>;
/**
 * ⭐⭐ **回退到某一版历史**（用户要求"备份回退"的第二个方向）。
 *
 * 🔴🔴 **为什么要校验**：历史文件是**过去某个时刻**的文本，而**校验规则可能已经变严**
 *    （例如某条后来加了"必须英文"）。⇒ 回退**不能绕过校验**，否则会用它把一条
 *    当前不合规的文本重新装回线上 —— 那比"不能回退"更糟。
 *    ⭐ 判据：**回退 = 用历史文本调一次保存**（同一道闸门），不是"直接写覆盖表"。
 * @param key - 稳定键。
 * @param fileName - 历史文件名（来自 `listPromptHistory`）。
 * @returns 保存结果（读不到历史时 `ok:false`）。
 */
declare function restorePromptHistory(key: string, fileName: string): Promise<SavePromptResult>;
/**
 * **列某条提示词的历史版本**（倒序，最新在前）。
 * @param key - 稳定键。
 * @returns 文件名列表（不含目录）。
 */
declare function listPromptHistory(key: string): Promise<string[]>;
/**
 * **读某一版历史**。
 * @param fileName - `listPromptHistory` 给的文件名。
 * @returns 文本；读不到回 `undefined`。
 */
declare function readPromptHistory(fileName: string): Promise<string | undefined>;
/**
 * **删掉全部历史**（人侧"清理历史"用；⚠️ 不删覆盖表）。
 * @returns 删掉的条数。
 */
declare function clearPromptHistory(): Promise<number>;
//#endregion
//#region src/prompt-writeback.d.ts
/** 一次写回的结果（逐条）。 */
interface WriteBackItem {
  key: string;
  /** 结果状态。 */
  status:
  /** ✅ 已写入源码。 */
  'written' |
  /** ⏭️ 源码里的值与当前值**已经相同**，无需写。 */
  'already-same' |
  /** 🔴 该条**不支持写回**（没有 `sourceConst`）。 */
  'unsupported' |
  /** 🔴 定位不到常量（源码被改过 / 命名变了）。 */
  'not-found' |
  /** 🔴 值形态不是可替换的单字符串。 */
  'bad-form' |
  /** 🔴 写盘失败。 */
  'error';
  /** 人可读的说明。 */
  message: string;
  /** 源码文件（相对仓根）。 */
  file?: string;
  /** 常量名。 */
  constName?: string;
}
/** 整次写回的结果。 */
interface WriteBackResult {
  ok: boolean;
  items: WriteBackItem[];
  /** 实际改动的文件数。 */
  filesChanged: number;
  /** 汇总一句话（回执用）。 */
  summary: string;
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
declare function locateTemplateBody(src: string, constName: string): {
  bodyStart: number;
  bodyEnd: number;
  quote: string;
} | undefined;
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
declare function unescapeFromTemplate(body: string, quote?: string): string;
/**
 * ⭐⭐ **执行写回**。
 *
 * 逐条处理；**一条失败不影响其余**（与 `safeRegister` 同一取向：
 * 一个坏掉的条目不该让整次操作白费——用户可以只对成功的那几条得到结果）。
 *
 * @param keys - 要写回的 key 列表（来自设置页的勾选/单选）。
 * @returns 汇总结果。
 */
declare function writeBackToSource(keys: readonly string[]): Promise<WriteBackResult>;
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
declare function writeBackState(key: string): 'untouched' | 'edited' | 'written' | 'unsupported';
//#endregion
//#region src/kinds.d.ts
/** ⭐ 一条知识类型的**完整定义**（= 表里的一行）。 */
interface KindDef {
  /** 机器用的 id；**它就是写进封面 `kind:` 的那个值**。 */
  id: string;
  /** 给人看的短名（UI 下拉 / 报错文案）。 */
  label: string;
  /** ⭐ "**什么时候用这一种**" —— 一句话，会进提示词。 */
  when: string;
  /** ⭐⭐ "**书写规范**" —— 可多行，会进提示词（告诉模型这条知识该怎么写）。 */
  guide: string;
  /**
   * 🔴 **内置项**：不可删、不可改名（id 与 label 都锁）。
   * ⚠️ 与 `reserved` 是**两个不同的锁**，别混：
   *   · `builtin` 锁的是"**这条是我预置的**"；
   *   · `reserved` 锁的是"**它不该给模型选**"。
   */
  builtin: boolean;
  /**
   * 🔴 **保留项**：不作为**模型的可选项**。
   * ⚠️ **2026-10-13 起内置类型里【有】保留项：`chat`** ——
   *    它由「文档内提问」功能自动生成（阅读知识时节选提问 ⇒ 会话问答同步成条目），
   *    **不给模型选、也不让人手选**（否则普通对话也能造它 ⇒ 库被会话流水淹没）。
   * ⚠️ **`history` 不是保留项**（决策 223：归档改由模型按规范做 ⇒ 它必须给模型选）。
   * ⭐ 字段与机制都留着：用户自定义的类型将来可能要用。
   */
  reserved: boolean;
}
/**
 * ⭐ **kind id 的语法**：小写英文开头，2–32 位，只允许小写字母/数字/连字符。
 *
 * 🔴 **为什么必须校验**：`kind` 是**要写进封面 YAML 的值**，
 *   还会被拼进工具 schema 的 `enum` 与提示词 ⇒ 放行任意串会让"词表里有个怪东西"
 *   扩散到所有下游，而**那时已经很难回溯是谁写进去的**。
 * ⚠️ 刻意**比模板 id 更严**（模板允许 2–48 位）：kind 要**频繁出现在文档里**，
 *   短一点、纯小写更好认。
 */
declare const KIND_ID_RE: RegExp;
/**
 * ⭐ **内置默认表**（文件不存在 / 读不出来时用它）。
 *
 * ⚠️ 它与 `schema.ts` 的 `ENTRY_KIND_DEFS` **是同一份数据**，但**用途不同**：
 *   · `ENTRY_KIND_DEFS` = **编译期内置值**（决策 214 的唯一来源，现在降级为默认值）；
 *   · 本函数 = **把它补全成 `KindDef`**（加上 `builtin` / `reserved` / `guide` 三个字段）。
 * 🔴 **不在这里抄第二份 id 列表** —— 一律从 `ENTRY_KIND_DEFS` 派生。
 * @returns 内置表的完整定义。
 */
declare function builtinKindDefs(): KindDef[];
/**
 * ⭐ **把一张类型表渲染成 markdown**（`<库根>/kinds.md`）。
 *
 * ⚠️ **必须与 `parseKindsDoc()` 往返幂等** —— 手工改过也要能读回来
 *   （与模板 md 同一套纪律，本项目为此踩过"改完读不回"的账）。
 * @param defs - 类型表（顺序即渲染顺序，也即 UI 下拉顺序）。
 * @returns 文件全文。
 */
declare function renderKindsDoc(defs: readonly KindDef[]): string;
/**
 * ⭐ **从 markdown 解析出类型表**。
 *
 * 🔴 **宽容读**（与模板同一纪律）：只认 `## <id>` 的标题行 + 紧跟着的
 *   `显示名：` / `什么时候用：` / `书写规范：` 三行；其余内容**当作书写规范的续行**。
 *   ⇒ 用户手写歪一点（多空行、少一个键）也能读出来。
 * @param text - 文件全文。
 * @returns 类型表；**一条都解析不出来**时返回 `undefined`（调用方回落内置）。
 */
declare function parseKindsDoc(text: string): KindDef[] | undefined;
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
declare function loadKinds(): Promise<KindDef[]>;
/**
 * ⭐ **写入类型表**（校验在前，不过不写盘）。
 *
 * @param defs - 要写入的完整表。
 * @returns 错误清单（空 = 写成功）。
 */
declare function saveKinds(defs: readonly KindDef[]): Promise<string[]>;
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
declare function validateKinds(defs: readonly KindDef[]): string[];
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
declare function deleteKindBlockReason(id: string, defs: readonly KindDef[], usedCount: number): string;
//#endregion
//#region src/reading.d.ts
/**
 * dsh-memj —— **「文档内提问」的锚点与绑定**（2026-10-14）
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * 用户阅读某条知识时，选中一段发起提问 ⇒ 插件开一个 DSH 会话、并把问答同步成
 * 一条 `kind: chat` 的条目。本模块管这条链路的**定位与绑定**：
 *
 *   · `anchor`   —— 「选中/被讨论的是哪一段」的**四元组**（§3.1）；
 *   · `bindings` —— 「源条目 + 段落」⇄ 「chat 条目」的**一张表**（§3.2）；
 *   · `cursors`  —— 每个会话**同步到哪个 seq** 的增量游标（§3.3）。
 *
 * ── 🔴🔴 三条设计红线（都是踩过或推演过的坑）────────────────────────────────
 * 1. **锚点绝不能用「第 N 段」** —— 知识条目**会被编辑**（用户改 `when`/`guide`、
 *    归档、重写节），序号会整体漂移 ⇒ 历史绑定**静默指错地方**（比指向失败更糟）。
 *    ⇒ 用**内容哈希 + 原文 + 前后文**四元组，重新解析后能重锚。
 * 2. **`bindings` / `cursors` 必须落盘** —— 只存内存 ⇒ 重启后
 *    · 游标丢了 ⇒ 把**整段会话历史**当增量重跑一遍（chat 条目被重复追加）；
 *    · 绑定丢了 ⇒ 段落标记全消失、再也点不回那些会话。
 *    ⭐ 同族教训：memj 条目 `4f83edd9`「只存内存的状态，重启后界面会撒谎」。
 * 3. **绑定是显式的，不是判定的** —— 用户在「就此提问」那一刻就确定了
 *    ⇒ 不需要 memj 那套「会话→项目自动判定」（那条要覆盖每条写通路，很重）。
 *
 * @module dsh-memj/reading
 */
/**
 * ⭐ **段落锚点**（W3C Web Annotation 的组合选择器思路）。
 *
 * 🔴 **四元组，缺一不可**：
 *   · `blockId`  —— 主键。块的**文本内容哈希**（不是位置序号！）；
 *   · `index`    —— 位置，仅辅助（快速定位、UI 排序）；
 *   · `exact`    —— 用户选中的**原文**（重锚的首要依据）；
 *   · `prefix` / `suffix` —— 前后各若干字（消歧：同一段话在文里出现多次时区分）。
 *
 * ⚠️ **`blockId` 用内容哈希是刻意的**：文本没变 ⇒ 哈希不变 ⇒
 *    与「第几段」无关。重抓取/重解析后，只要那段文字还在，锚就还在。
 */
interface ReadingAnchor {
  /** 块的文本内容哈希（主键）。 */
  blockId: string;
  /** 块在文档里的位置（仅辅助，不作为标识）。 */
  index: number;
  /** 用户选中的原文。 */
  exact: string;
  /** 选中处之前的一段文字（消歧用）。 */
  prefix: string;
  /** 选中处之后的一段文字（消歧用）。 */
  suffix: string;
}
/**
 * 一条绑定：**源条目的某段落** ⇄ **一个 chat 条目**。
 *
 * ⭐ `(entryId, blockId)` 是**唯一键** —— 用户裁定「同一段节选只开一个会话」，
 *    所以再次提问同一段落时**复用**（只追加一轮，不新建）。
 */
interface ReadingBinding {
  /** 被提问的那条知识（源条目）id。 */
  entryId: string;
  /** 段落锚点。 */
  anchor: ReadingAnchor;
  /** 承载问答的 `kind: chat` 条目 id。 */
  chatEntryId: string;
  /** 产生它的 DSH 会话 id（chat 条目 frontmatter 的 `source.sessionId` 同值）。 */
  sessionId: string;
  /** 建立时间（ISO 8601）。 */
  createdAt: string;
}
/** 阅读状态（轻量：读到哪里了）。 */
interface ReadingState {
  /** `条目 id → 上次读到的 blockId`。 */
  positions: Record<string, string>;
}
/**
 * ⭐ **把一段选中构造成锚点**。
 *
 * 🔴🔴 **`blockId` 哈希的是【块自己的文本】，不是整篇文档** ——
 *    这是本函数最容易写错的地方（第一批实现就错在这）：若哈希整篇，
 *    文档任何一处改动都会让**所有块**的 id 全变 ⇒ 与"用序号"相比只是
 *    换了一种错法（历史绑定照样全丢）。
 *    ⇒ 正确形态：`blockId = hash(块文本)` ⇒ **那段文字没变，id 就不变**。
 *
 * @param blockText - **块自己**的文本（不是整篇）。
 * @param fullText - 整篇正文（只用于切 prefix/suffix）。
 * @param index - 选中所在块的位置。
 * @param start - 选中起点（**在 `fullText` 里**的字符偏移，含）。
 * @param end - 选中终点（在 `fullText` 里，不含）。
 * @returns 锚点四元组。
 */
declare function makeAnchor(blockText: string, fullText: string, index: number, start: number, end: number): ReadingAnchor;
/**
 * ⭐ **内容哈希**（`blockId` 用）。
 *
 * ⚠️ **刻意用「非加密 hash」**：这里要的是**同一份文本给同一个值**，
 * 不是防碰撞 —— 加密 hash 更慢，而这个值**每次渲染都会算一遍**。
 * ⚠️ **必须先规范化**（去首尾空白、压缩连续空白）—— 否则用户改一个换行
 * 就让锚点失效，而那段文字明明没变。
 */
declare function hashText(text: string): string;
/**
 * ⭐ **在一个文档里重新定位锚点**（重解析/重抓取后救场用）。
 *
 * 三级降级，前一级命中就不走下一级：
 *   ① `exact` 在文里**只出现一次** ⇒ 直接用它（最可靠）；
 *   ② 加上 `prefix` 一起搜 ⇒ 消歧；
 *   ③ 都定位不到 ⇒ 返回 `undefined`（**调用方必须如实说"锚点失效"**，
 *      不要静默指向别处 —— 那是"界面撒谎"）。
 * @param fullText - 当前文档正文。
 * @param anchor - 旧锚点。
 * @returns 新的 `{start, end}`；定位不到 ⇒ `undefined`。
 */
declare function relocateAnchor(fullText: string, anchor: ReadingAnchor): {
  start: number;
  end: number;
} | undefined;
/**
 * ⭐ **读全部绑定**。
 *
 * ⚠️ **用 jsonl 而不是 json**：可**追加**（并发写不丢、不需要读-改-写整份）；
 *    量小（一次阅读就几十条）⇒ 全量载入无压力。
 * ⚠️ **坏行跳过不抛**：一行写坏不该让整个功能瘫掉；但**要留痕**
 *    （否则"明明绑定过却看不到"会变成无声故障）。
 * @returns 绑定数组（按写入顺序）。
 */
declare function loadBindings(): Promise<ReadingBinding[]>;
/**
 * ⭐ **追加一条绑定**（**唯一写入口**）。
 *
 * 🔴 **调用方必须先查过 `findBinding`** —— 本函数**不判重**：
 *    「同一段落复用已有会话」是**业务规则**（用户裁定），
 *    放在调用方（`ask`）更直观；这里保持"纯追加"的单一职责。
 * @param binding - 要追加的绑定。
 */
declare function appendBinding(binding: ReadingBinding): Promise<void>;
/**
 * ⭐ **按「源条目 + 段落」查绑定**（复用的判据）。
 *
 * 🔴🔴 **`blockId === ''` 时【永不复用】**（2026-10-20 加）。
 *
 *    背景：`blockId` 现在允许为空（那些前端匹配不到块的选区，见 `api.ts`
 *    的 `/reading/ask`）。若这里照常按 `entryId + ''` 去 `find`，
 *    **同一篇里所有"定位不到块"的提问会命中同一条绑定**
 *    ⇒ 用户在 A 段问一句、又在 B 段问一句 ⇒ 第二句被并进第一个会话里，
 *      而且 `renderAskPrompt` 引的还是 A 段的原文。
 *    ⭐ 那种串台是**静默的**（会话建出来了、也回答了，只是答的是另一段）。
 *
 *    ⇒ 判据：**空 blockId 表示"没有归类信息"，它不该被当成一个真实的键值。**
 *      语义上正确的做法是"每条都算新段落" —— 宁可多开一个会话，也不要串台。
 *      ⚠️ 本项目既有的偏置：**误合并会污染用户数据，多开一个只是多一个会话。**
 * @param entryId - 源条目 id。
 * @param blockId - 段落 blockId（**空串 = 不复用**）。
 * @returns 已有绑定；没有 ⇒ `undefined`。
 */
declare function findBinding(entryId: string, blockId: string): Promise<ReadingBinding | undefined>;
/**
 * ⭐ **某条目下的全部绑定**（文档页「本篇的会话」用）。
 * @param entryId - 源条目 id。
 * @returns 绑定数组（按写入顺序）。
 */
declare function bindingsForEntry(entryId: string): Promise<ReadingBinding[]>;
/**
 * ⭐⭐ **按会话 id 反查绑定**（轮末同步的**第一道门**）。
 *
 * 🔴 **为什么这是第一道门**：用户明确裁定「只同步**从提问入口产生的会话**」。
 *    ⇒ 判据就是"这个 sessionId 在不在 `bindings` 里"。
 *    ⚠️ 绝不能退化成"所有会话都同步"——那会让**每一次普通对话**都往库里
 *    写一条 chat 条目，库被会话流水淹没（而用户要的是"问答沉淀成知识"）。
 *
 * @param sessionId - DSH 会话 id。
 * @returns 绑定；不是提问入口 ⇒ `undefined`。
 */
declare function findBindingBySession(sessionId: string): Promise<ReadingBinding | undefined>;
/**
 * ⭐⭐ **按 chat 条目 id 反查绑定**（「返回源知识」按钮的判据）。
 *
 * 🔴 **为什么需要它**：`chat` 条目的详情页要能显示「↩ 返回源知识」，
 *    而它需要知道**源条目 id + 那段节选是哪个块** —— 这两样只在 `bindings` 里。
 *    ⚠️ 封面上的 `source` 只有 `sessionId`（那是给「去会话」用的），
 *      **不含源条目信息** ⇒ 必须查这里。
 *
 * ⚠️ **一对一吗**：一条 chat 条目对应一个 `(entryId, blockId)` 绑定
 *    （用户裁定"同一段节选开一个会话"）⇒ 取第一条即可。
 *    但**仍写成 `find` 而不是假定唯一**（数据是外部可改的文本文件，
 *    万一被手工编辑出重复，这里不该崩）。
 *
 * @param chatEntryId - `kind: chat` 条目 id。
 * @returns 绑定；不是问答条目 ⇒ `undefined`。
 */
declare function findBindingByChatEntry(chatEntryId: string): Promise<ReadingBinding | undefined>;
/**
 * ⭐ **数某条 chat 条目已有几轮问答**（决定下一轮的 `Q几` 编号）。
 *
 * ⚠️ **按 `#### Q` 标题数**，不按 `---` 数：分隔线在首轮占位尾注里也有一个，
 *    数它会多数一个。
 * @param chatEntryId - chat 条目 id。
 * @returns 轮数（条目不存在 ⇒ 0）。
 */
declare function countChatTurns(chatEntryId: string): Promise<number>;
/** 一个「可讨论的块」：内容哈希 + 供前端匹配 DOM 的纯文本。 */
interface ReadingBlock {
  /** 内容哈希（锚点主键）。 */
  blockId: string;
  /**
   * ⭐ **去掉 markdown 行内标记后的纯文本** —— 前端拿它与 DOM 的
   * `textContent` 比对（浏览器渲染后 `**` 就没了）。
   */
  plain: string;
  /** 该块在正文里的序号（0 起）。 */
  index: number;
  /**
   * ⭐⭐⭐ **这一块在浏览器里会渲染成哪些「叶子文本」**（2026-10-20 新增）。
   *
   * ── 🔴🔴 为什么需要它（实测 5816 个块里 17.5% 因此**永远匹配不上**）──
   * 原来前端只拿 `plain` 与**单个** DOM 元素的 `textContent` 做字面比对。
   * 而 `plain` 里**保留了 markdown 的结构记号**，浏览器却不显示它们：
   *
   * | `plain` 实际长这样 | 浏览器 DOM | 结果 |
   * |---|---|---|
   * | `第 20 集说过：不能只看谁闲…` | `<p>` | ✅ 匹配 |
   * | `而这条请求…\n>\n> ⚠️ 前提是…` | `<p>` + `<blockquote><p>` | ❌ **`>` 不在 textContent 里** |
   * | `\| 部分 \| token 数 \|…`（多行） | 一个 `<td>` 一个元素 | ❌ 整表拼不成一个元素 |
   *
   * ⭐ 所以**不是"少配了几种"，是"拿一段含结构记号的文本去比一个不含它的 DOM"**。
   * ⇒ 正确做法：**服务端把这一块拆成若干「叶子行」**（每行 = 未来某个 DOM 叶子
   * 元素的 textContent），前端逐行去 DOM 里找，找到哪行就给那个元素打 id。
   *
   * ⚠️ **`plain` 仍然保留**（既有绑定、既有测试、以及"整块匹配"那条快路径都靠它）
   * —— 这个字段只增不改，老数据与老调用方零影响。
   */
  lines: string[];
}
/**
 * ⭐⭐ **把一块 markdown 拆成"将来会是 DOM 叶子元素"的若干行纯文本**。
 *
 * 拆法对着**浏览器渲染结果**来，不是对着 markdown 语法来 ——
 * 这是本函数唯一要遵守的规矩（漂移的表现是"标记又不显示"，
 * 且**不报任何错**，所以每一步都写了它对应的 DOM 形态）。
 *
 * | markdown 形态 | 拆成几行 | 浏览器里是 |
 * |---|---|---|
 * | 普通段落（可含软换行） | **1 行**（换行折成空格） | 一个 `<p>` |
 * | `> 引用`（含 `>` 续行） | **每段文本 1 行**（去掉 `>`） | `<blockquote>` 里的 `<p>` |
 * | `\| a \| b \|` 表格 | **每个单元格 1 行**（去掉 `\|` 与分隔行） | `<td>` / `<th>` |
 * | `- x` / `1. x` 列表 | **每项 1 行**（去掉项目符号） | `<li>` |
 * | 标题 `## x` | 1 行（去掉 `#`） | `<h1>`–`<h4>` |
 *
 * 🔴 **表格的分隔行（`\|---\|---\|`）必须丢掉** —— 它不是文本，浏览器里根本
 *    不存在对应元素；留着会让"整表"那条判据永远拼不齐。
 *
 * ⚠️ **行内代码/粗体/链接仍走 `stripInlineMarkdown`** —— 与 `plain` 同一套剥法，
 *    否则同一个块里两个字段的口径会分家。
 * @param block - 一块 markdown 原文（已 `trim`）。
 * @returns 纯文本行（已 trim、空行已丢）。
 */
declare function blockLeafLines(block: string): string[];
/**
 * ⭐⭐ **从 markdown 正文抽出「可讨论的块」**（`/reading/blocks` 的数据源）。
 *
 * 🔴🔴 **为什么这件事必须由服务端做**（真机探针抓到的设计缺陷）：
 *    前端只有**渲染后**的 DOM，`textContent` 里 `**粗体**` 的星号已经没了
 *    ⇒ 它按 `textContent` 算哈希，与后端按 **markdown 原文**算的**永远对不上**
 *    ⇒ 段落标记永远不显示，而且**不报任何错**。
 *    ⭐ 实测：`三科均满分 100、**70 分（含）以上合格**，闭卷机考。` 两边算出
 *      `1mpx8by`（原文）vs `191ccmm`（渲染后）—— 差的就是那两个 `**`。
 *
 * ⇒ ⭐ **判据：内容哈希必须由「拥有原文的那一侧」算**。
 *    前端拿到这份清单后，按 `plain` 去 DOM 里找对应元素（见
 *    `app.js` 的 `markReadingBlocks`），**自己不哈希**。
 *
 * ⚠️ **粒度**：按**空行切段**（与 `marked` 的块级输出大体一致）；
 *    段内若全是列表行，则**每行一块**（浏览器里那是多个 `<li>`）。
 * @param body - markdown 正文。
 * @returns 块清单（保持正文顺序）。
 */
declare function extractReadingBlocks(body: string): ReadingBlock[];
/**
 * ⭐ **去掉 markdown 行内标记**（粗体/斜体/行内代码/链接/列表前缀）。
 *
 * ⚠️ **只处理"影响 `textContent`"的那几种** —— 多剥一种就多一处
 *    与浏览器实际行为的漂移风险，而漂移的后果是**静默的**（标记不显示）。
 *
 * 🔴 **必须与 `hashText` 的规范化口径一致**：`hashText` 内部会
 *    `trim + 压缩连续空白`，所以本函数返回值里保留的空白形态**不影响哈希**；
 *    但**前端拿 `plain` 与 `textContent` 比对时是字面比较**
 *    ⇒ 这里两端必须 trim（否则"看起来一样"的两串不相等）。
 * @param s - 一段 markdown 文本。
 * @returns 纯文本（**与浏览器 `textContent` 对齐**）。
 */
declare function stripInlineMarkdown(s: string): string;
/**
 * ⭐ **读全部同步游标**（`sessionId → capturedThroughSeq`）。
 *
 * 🔴 **为什么必须落盘**（红线 2）：只存内存 ⇒ 重启后游标归零 ⇒
 *    下一轮 `turn/end` 会把**整段会话历史**当增量 ⇒ chat 条目被**重复追加**。
 *    ⭐ 这正是 memj 踩过的同族坑（`4f83edd9`），不要再踩一次。
 * @returns 游标表；文件不存在 ⇒ 空表。
 */
declare function loadCursors(): Promise<Record<string, number>>;
/**
 * ⭐ **更新一个会话的游标**。
 *
 * ⚠️ **读-改-写整份**：游标表很小（一次阅读几十条），
 *    且**需要按 sessionId 覆写**（jsonl 那种追加语义不适用）。
 * @param sessionId - 会话 id。
 * @param throughSeq - 已同步到的最高 seq。
 */
declare function saveCursor(sessionId: string, throughSeq: number): Promise<void>;
/** 读阅读位置（文件不存在 ⇒ 空状态）。 */
declare function loadReadingState(): Promise<ReadingState>;
/**
 * 记住「某条目读到哪里」。
 * @param entryId - 条目 id。
 * @param blockId - 读到的 blockId。
 */
declare function saveReadingPosition(entryId: string, blockId: string): Promise<void>;
/** chat 条目的正文初始形态（首轮之前）。 */
declare const CHAT_ENTRY_KIND = "chat";
/**
 * ⭐ **渲染 chat 条目的正文**。
 *
 * 🔴 **必须以 `###` 开头**：`extractTitle(body, '###')` 靠它做标题兜底
 *    （虽然 frontmatter 的 `title` 才是权威来源，决策 98）。
 * @param sourceTitle - 被提问的那条知识的标题。
 * @param anchor - 段落锚点。
 * @returns 正文 markdown。
 */
declare function renderChatEntryBody(sourceTitle: string, anchor: ReadingAnchor): string;
/**
 * ⭐ **把一轮问答渲染成正文片段**（追加用）。
 * @param question - 用户的提问。
 * @param answer - 模型的回答（**只要 text block**，见 `sync.ts` 的过滤）。
 * @param roundNo - 第几轮（从 1 开始）。
 * @returns 要追加的 markdown 片段。
 */
declare function renderChatTurn(roundNo: number, question: string, answer: string): string;
/**
 * ⭐ **建一条 chat 条目**（正文 + 封面 + 挂到源条目所属项目）。
 *
 * 🔴 **为什么归属 = 源条目的项目**：用户要在知识库里按项目浏览这些问答
 *    （"这篇的会话"），而 memj 的组织方式就是「项目 → 主题 → 全局」。
 *    ⇒ 挂在同一项目下，它才能与被讨论的那条知识**出现在一起**。
 *
 * ⚠️ **不挂主题**（`theme: []`）：它是**派生的对话记录**，不是独立知识，
 *    挂主题会让它在主题层被当成一条"知识"检索/注入（而 `chat` 在模型侧已被排除，
 *    但主题页的人侧列表会多出一条看不懂的东西）。
 *
 * ⚠️ **封面块必须并进项目文档**——只写 `entries/` 下的正文文件是不够的：
 *    memj 的封面**只存在于项目文档里**（`parseCovers` 从那儿读）⇒ 不并进去
 *    等于这条知识**不存在**（`scanLibrary` 扫不到）。
 *
 * @param sourceEntryId - 被提问的那条知识 id。
 * @param sourceTitle - 被提问的那条知识标题。
 * @param anchor - 段落锚点。
 * @param sessionId - 产生它的 DSH 会话 id（写进 frontmatter `source.sessionId`）。
 * @returns 新建条目的 id；失败 ⇒ `undefined`（并给出原因）。
 */
declare function createChatEntry(sourceEntryId: string, sourceTitle: string, anchor: ReadingAnchor, sessionId: string): Promise<{
  id: string;
} | {
  error: string;
}>;
/**
 * ⭐ **给 chat 条目追加一轮问答**。
 *
 * ⚠️ **走 `updateEntry(id, {body})`**（正规通道）而不是自己读-改-写：
 *    它会同步封面 frontmatter、刷 `updatedAt`、并 `rebuildDerivedLayers()`。
 * 🔴 **但它是"整篇替换"** ⇒ 调用方必须先把「旧正文 + 新片段」拼好再传。
 *    这正是方案里说的"只追加本轮增量"：**读一次旧的、拼上新的、写一次**
 *    —— 不是把整段会话历史重放一遍。
 * @param chatEntryId - chat 条目 id。
 * @param fragment - 本轮片段（`renderChatTurn` 的产物）。
 * @returns 是否成功（附原因）。
 */
declare function appendChatTurn(chatEntryId: string, fragment: string): Promise<{
  ok: true;
} | {
  ok: false;
  error: string;
}>;
//#endregion
//#region src/reading-sync.d.ts
/** 一轮要同步的内容（已过滤：只要 text）。 */
interface SyncTurn {
  /** 用户的提问（该轮第一条 user 消息的 text）。 */
  question: string;
  /** 模型的回答（该轮 assistant 消息的 text，可能多段）。 */
  answer: string;
}
/**
 * ⭐ **取一段 content 里的纯文本**（只收 `text` block）。
 *
 * 🔴🔴 **为什么必须按 block 类型筛**（用户明确要求"不要思考、不要工具调用"）：
 *    `assistant/message` 的 content 是 `ContentBlock[]`，其中
 *    · `text`      —— 用户可见的正文 ✅ 要；
 *    · `reasoning` —— 模型的思考 ⛔ **不要**（它进了库，读者会看到一堆自言自语）；
 *    · `tool-call` —— 工具调用 ⛔ **不要**（arguments 是原始 JSON 串，毫无可读性）。
 *
 *    ⚠️ **`reasoning` 与 `text` 是**分开的 block**（同为 `{type, text}` 形状！）
 *       ⇒ 只按 `block.text` 取会把思考也收进去。**必须判 `type`。**
 *
 * ⭐ 这与 `readSurface` 的"surface 已滤掉 tool/result"是**两层互补**的过滤：
 *    surface 层滤掉的是**事件类型**（`tool/call` 不是 surface 事件），
 *    本函数滤掉的是**块类型**（`reasoning` 在 `assistant/message` 里面）。
 *    ⚠️ 别以为有了前者就够了 —— 思考块是前者管不到的。
 *
 * @param content - 消息的 content block 数组。
 * @returns 拼好的纯文本；一个 text 块都没有 ⇒ 空串。
 */
declare function textOfContent(content: readonly ContentBlock[] | undefined): string;
/**
 * ⭐ **从一批 surface 事件里抽出「一轮问答」**。
 *
 * 🔴 **两种事件的 data 形状不同**（本项目"夹具要照真实 API 形状"的同类坑）：
 *   · `user/message` 的 data **就是** `UserMessage`（直接有 `content`）；
 *   · `assistant/message` 的 data 是 `{turn, step, message, stream}` ——
 *     content 在 **`data.message.content`** 里。
 *   ⚠️ 把两者写成一个形状 ⇒ 一边永远取到空 ⇒ "凑不齐一问一答"永久成立
 *     （而症状是"功能从来没同步过"，不报错）。
 *
 * 取法：该轮**第一条** `user/message` 的 text 作为提问；
 * **最后一条非空** `assistant/message` 的 text 作为回答。
 *
 * ⚠️ **为什么回答取"最后一条"而不是全拼**：一轮里可能有多个 step
 *    （模型调了工具再继续答），每个 step 都产出一条 `assistant/message`。
 *    · 全拼 ⇒ 中间那些"过渡句"（"我先查一下…"）会混进正文；
 *    · 取最后一条 ⇒ 拿到的是**该轮最终的完整回答**。
 *    ⚠️ 但若最后一条是空的（被中断），则**回退到最后一条非空的**。
 *
 * @param events - 本轮的 surface 事件（已按游标裁过增量）。
 * @returns 一轮内容；凑不齐一问一答 ⇒ `undefined`（调用方**不要**写半轮）。
 */
declare function extractTurn(events: readonly unknown[]): SyncTurn | undefined;
/**
 * ⭐⭐ **注册轮末同步**（供插件 `apply()` 调用）。
 *
 * ⚠️ **形态照本项目其他 5 处 register**（`registerTagAutoNormalize` /
 *    `registerAutoScore` / …）：**返回"挂上了没有"**，让调用方打诊断行时
 *    能区分"已注册"与"没注册"——无条件打一行"已注册"是**假绿**。
 *
 * 🔴 **本功能没有总开关**（刻意）：它不是"可选增强"，而是
 *    「阅读提问」这条链路的**必要一半**（否则 chat 条目永远是空的）。
 *    ⚠️ 但它**零成本**：第一道门（`findBySession`）对非阅读会话直接返回，
 *    而 `bindings.jsonl` 在没人用过阅读功能时根本不存在（读一次 `undefined`）。
 *
 * @param ctx - 插件上下文。
 * @returns 是否挂上了（`sessionQuery` 不在 ⇒ `false`，调用方据此打诊断行）。
 */
declare function registerReadingSync(ctx: Context): boolean;
/** 依赖（由调用方注入，便于测试）。 */
interface SyncDeps {
  /**
   * `ctx.get('sessionQuery')` 的**最小面**（只声明用到的那个方法）。
   *
   * ⭐ **刻意与项目里既有 4 处同一种写法**（`hot-inject` / `hot-watch` /
   *    `score-auto` / `score-turn` 都是 `ctx.get('sessionQuery') as {...} | undefined`）：
   *    · 不 import 真实类型 ⇒ 不被 `dsh-session-query` 的导出形状绑死；
   *    · 参数用 `string` ⇒ 调用处不需要 branded 断言；
   *    · **标注可选** ⇒ 服务不在时优雅退化成"不同步"（见 `attachReadingSync`）。
   */
  sessionQuery?: {
    readSurface(id: string): Promise<{
      inheritedEventCount: number;
      capturedThroughSeq: number | null;
      events: Array<{
        seq: number;
      } & Record<string, unknown>>;
    }>;
  } | undefined;
  /** 读绑定（判断这个会话是不是提问入口产生的）。 */
  findBySession(sessionId: string): Promise<{
    entryId: string;
    anchor: {
      blockId: string;
    };
    chatEntryId: string;
  } | undefined>;
  /** 读游标。 */
  loadCursors(): Promise<Record<string, number>>;
  /** 写游标。 */
  saveCursor(sessionId: string, throughSeq: number): Promise<void>;
  /** 给 chat 条目追加一轮。 */
  appendChatTurn(chatEntryId: string, fragment: string): Promise<{
    ok: true;
  } | {
    ok: false;
    error: string;
  }>;
  /** 渲染一轮片段（纯函数，注入以便测试）。 */
  renderChatTurn(roundNo: number, question: string, answer: string): string;
  /** 数某条目已有几轮（决定 `Q几` 的编号）。 */
  countTurns(chatEntryId: string): Promise<number>;
}
/**
 * ⭐⭐ **同步一个会话**（轮末调用）。
 *
 * 全流程：
 * ```
 * ① 反查 bindings —— 不是提问入口 ⇒ 直接返回（不碰库）
 * ② readSurface —— 拿 surface + capturedThroughSeq
 * ③ 按游标裁增量（seq > cursor）；首次从 inheritedEventCount 起
 * ④ extractTurn —— 抽一问一答（只要 text block）
 * ⑤ appendChatTurn —— 追加进 chat 条目
 * ⑥ saveCursor —— 落盘新游标（🔴 必须在 ⑤ 之后，见下）
 * ```
 *
 * 🔴🔴 **为什么游标要在「追加成功之后」才写**：
 *    先写游标 ⇒ 追加失败（磁盘满 / 校验拒）时，那一轮**永久丢失**
 *    （下次再来时游标已经越过它，`extractTurn` 再也看不到）。
 *    ⭐ 判据：**游标是"已处理到哪"的承诺，不是"打算处理到哪"** ——
 *       承诺必须发生在事情真正办成之后。
 *
 * @param sessionId - 会话 id。
 * @param deps - 依赖。
 * @returns 同步结果（供日志/测试断言）。
 */
declare function syncSession(sessionId: string, deps: SyncDeps): Promise<{
  status: 'skipped';
  reason: string;
} | {
  status: 'empty';
} | {
  status: 'synced';
  roundNo: number;
} | {
  status: 'failed';
  error: string;
}>;
/**
 * ⭐ **挂轮末同步**（fire-and-forget 形态）。
 *
 * 🔴🔴 **为什么用 `agent/turn-stopping` 而不是 `session/event` 的 `turn/end`**：
 *    · 本项目**既有 5 处**（tag-auto / score-auto / context-auto / active-inject 等）
 *      全部用 `agent/turn-stopping` ⇒ 保持一致，不另造写法；
 *    · ⭐ **它的载荷直接带 `agent.id`**（那就是 sessionId）⇒ 不用从事件 subject 猜；
 *    · ⚠️ 它是 **`@mode serial`（会被 await）** ⇒ 见下方纪律 2。
 *
 * 🔴 **三条纪律**：
 * 1. **钩子本身只做"读记账 + 发起"，不 await 后台任务** ——
 *    serial 钩子里 await 一个跑几十秒的操作会**拖住主会话的轮次结束**，
 *    用户感到卡顿（`2f558352`；本项目 5 处实现都是这个形态）。
 * 2. **全程 try/catch** —— 钩子里的异常会**毁掉整个轮次**
 *    （`2f558352`）⇒ 同步失败绝不能影响用户正在进行的对话。
 * 3. **per-session 串行化** —— 同一会话连续两轮都快结束时，两个后台任务会同时写
 *    同一个 chat 条目 ⇒ 用 Promise 链串起来（否则两条追加可能交叉成乱序内容）。
 *
 * @param ctx - Cordis 上下文。
 * @param deps - 依赖。
 * @returns 取消监听的 disposer。
 */
declare function attachReadingSync(ctx: Context, deps: SyncDeps): () => void;
//#endregion
//#region src/reading-ask.d.ts
/** 「就此提问」的入参。 */
interface ReadingAskRequest {
  /** 被提问的那条知识 id。 */
  entryId: string;
  /** 段落锚点四元组。 */
  anchor: ReadingAnchor;
  /** 用户的问题。 */
  question: string;
}
/** 「就此提问」的结果。 */
type ReadingAskResult = {
  ok: true;
  /** 会话 id（复用或新建）。 */
  sessionId: string;
  /** chat 条目 id。 */
  chatEntryId: string;
  /** ⭐ `true` = 复用了已有会话（没开新的）。 */
  reused: boolean;
} | {
  ok: false;
  error: string;
};
/** 依赖（注入以便测试）。 */
interface AskDeps {
  /** 建/复用会话。 */
  ensureSession(input: {
    entryId: string;
    entryTitle: string;
    anchor: ReadingAnchor;
    question: string;
  }): Promise<{
    sessionId: string;
    chatEntryId: string;
    created: boolean;
  }>;
  /** 取被提问条目的标题（首轮消息与 chat 条目都要用）。 */
  entryTitle(entryId: string): Promise<string>;
  /**
   * ⭐ **绑定写入后的回调**（刷新 `context()` 的同步缓存）。
   *
   * 🔴 **为什么必须有它**：`systemPrompt.context()` 的 `text()` 查的是内存 Map，
   *    而绑定刚写进 `bindings.jsonl` ⇒ 不刷新的话，同一会话的**下一轮**
   *    注入会查不到 ⇒ **文档上下文静默丢失**（不报错，只是模型突然"看不到全文"）。
   * ⚠️ 可选（测试里可以不给）；调用处用 `void` 触发，不 await。
   */
  onBound?: () => void;
}
/**
 * ⭐ **渲染首轮消息**（`followup` 提交给模型的那条）。
 *
 * 🔴 **刻意不含全文** —— 全文由 `context()` 注入（见红线 2）。
 *    这里只放三样：**出处**（哪条知识）、**锚点段落**（问题针对哪里）、
 *    **问题本身**。
 *
 * ⭐ 「出处 + 锚点」是用户说的「方便 AI 锁定我读到哪里、到底要问什么」的落点：
 *    没有它，模型只知道"有人问了个问题"；有了它，模型知道
 *    "问题针对《某知识》里的这一小段"。
 *
 * @param entryTitle - 被提问条目的标题。
 * @param anchor - 段落锚点。
 * @param question - 用户的问题。
 * @returns 消息文本。
 */
declare function renderAskPrompt(entryTitle: string, anchor: ReadingAnchor, question: string): string;
/**
 * ⭐⭐ **「就此提问」的主流程**。
 *
 * @param req - 入参。
 * @param deps - 依赖。
 * @returns 结果（含复用与否）。
 */
declare function askAboutSelection(req: ReadingAskRequest, deps: AskDeps): Promise<ReadingAskResult>;
/**
 * ⭐ **阅读会话专用工作区的目录名**（相对库根）。
 *
 * 🔴 **必须拼成绝对路径再给 `workspaceRegistry.create()`** ——
 *    第一版直接传了这个相对路径，隔离实例上当场报
 *    `Workspace path is not fully qualified: 'reading-sessions'`（真机探针抓到的）。
 *    ⭐ 官方先例 `dsh-webhook` 对入参就做了 `isAbsolute` 硬校验
 *    （`lib/index.js:79`）⇒ 那不是可选的。
 */
declare const READING_WORKSPACE_DIR = "reading-sessions";
/**
 * ⭐ **阅读工作区的绝对路径**（`<库根>/reading-sessions`）。
 *
 * ⚠️ **放在库根下**（而不是 `os.homedir()` 或临时目录）：
 *    · 库根本身就是"拷一个目录即迁移"的那个目录 ⇒ 会话跟着库走；
 *    · ⚠️ 但**它不是 memj 的知识数据**，而是 DSH 的 workspace 注册项
 *      ⇒ 刻意**不加进 `requiredDirs()`**（那个函数管的是库内数据目录；
 *      混进去会让"库目录清单"多一项与会话相关的东西）。
 */
declare function readingWorkspacePath(): string;
/**
 * ⭐⭐ **建一个阅读会话**（真实 DSH 会话）。
 *
 * 🔴🔴 **这一步是整个功能唯一"碰运行时"的地方**，顺序照 `dsh-webhook`
 *    （官方从外部请求建会话的先例，`lib/index.js:148-198`）：
 *
 *    1. `workspaceRegistry.create(path)` —— 建/取工作区；
 *    2. `agents.create({sessionId, meta:{cwd, agentPreset}, agentOptions})`；
 *    3. `workspace.attachSession(sessionId)` —— 挂到工作区（否则会话列表里看不到）；
 *    4. `sessionTitle.rename(...)` + `agent.followup(...)` —— 设标题、提交首轮
 *       （`followup` **会唤醒驱动器**）。
 *
 * ⭐⭐ **为什么"建会话"排在"建 chat 条目"之前**（本批特意调的次序）：
 *    chat 条目的 frontmatter 要写 `source.sessionId`（「去会话」按钮的数据来源），
 *    · 先建条目 ⇒ 那时候还没有 sessionId ⇒ 要么留空、要么事后补写；
 *    · 🔴 而 `EntryFieldChange`（`edit.ts` 的字段修改通道）**没有 `source`**，
 *      为它单独加一个口子会把那条"给人用的"通道弄胖；
 *    · ⇒ **先建会话、再建条目** ⇒ `source.sessionId` **一次写对**，没有后补动作。
 *    ⚠️ 代价：若建条目失败，会话已经开了（孤儿）。但那比"按钮永远失效"好——
 *      而且失败会**如实报错**（`ok:false`），用户看得到。
 *
 * ⚠️ **为什么要独立工作区**（`READING_WORKSPACE_DIR`）：一段一会话 ⇒
 *    会话条数会很多。混在日常工作区里会把**用户的会话列表淹掉**
 *    （这正是 v2 反对"真实会话"的主要理由，用工作区隔离来解决）。
 *
 * ⚠️ **`agentOptions` 必须显式给 `{provider, model}`** ——
 *    不传会继承 parent 的 requestHeader（memj 库条目 `d8bf9b47`：
 *    实测继承到 `hy3` 后 maxTokens 被烧光、输出 0 字符）。
 *
 * @param ctx - 插件上下文（untraced，由调用方从 `scoped` 转来）。
 * @param input - 出处 + 锚点 + 问题。
 * @returns 会话 id 与 chat 条目 id。
 */
declare function createReadingSession(ctx: Context, input: {
  entryId: string;
  entryTitle: string;
  anchor: ReadingAnchor;
  question: string;
}): Promise<{
  sessionId: string;
  chatEntryId: string;
  created: boolean;
}>;
/**
 * ⭐ **把本模块的依赖装配好**（供 `api.ts` 的路由调用）。
 *
 * ⚠️ **`onBound` 必须由调用方给**（刷新 `context()` 的同步缓存）：
 *    绑定写进 `bindings.jsonl` 之后，`text()` 查的那张内存 Map 还是旧的
 *    ⇒ 同一会话的**下一轮**注入会查不到 ⇒ 文档上下文静默丢失。
 *    ⚠️ 它是 `void` 调用（fire-and-forget）⇒ 刷新失败不影响本次提问的成功回执。
 *
 * @param ctx - 插件上下文。
 * @param onBound - 绑定写入后的回调（刷新缓存）。
 * @returns `AskDeps`。
 */
declare function readingAskDeps(ctx: Context, onBound?: () => void): AskDeps;
//#endregion
//#region src/reading-context.d.ts
/**
 * dsh-memj —— **「文档内提问」的上下文注入**（2026-10-14，第 4 期）
 *
 * ── 它做什么 ──────────────────────────────────────────────────────────────
 * 用户裁定的核心诉求：**「把文档本身作为上下文通过 context 注入的方式注入」**。
 * 本模块把「被提问的那条知识的全文」注入进**那个阅读会话**的模型上下文。
 *
 * ── 🔴 三条设计红线 ────────────────────────────────────────────────────────
 * 1. **必须按 sessionId 过滤** —— `systemPrompt.context()` 是**全局注册**的，
 *    它的 `text(ctx)` 对**所有 agent** 返回同一份内容。不在里面判
 *    「这个会话绑定了哪条知识」⇒ **所有会话都被塞进同一条文档**。
 *    ⚠️ 空字符串是安全值：`project()` 里 `current.length === 0` 走 CLEARED 分支，
 *    不会给无关会话塞东西。
 * 2. **内容完整性自检** —— 框架保证「同值不发 / 丢了补发」，
 *    **不保证「发出去的确实是完整全文」**。渲染前后校验首尾片段在不在；
 *    ⚠️ **宁可不注入，也别注入半篇**（模型会拿着半篇自信回答，
 *    而用户以为它看着全文 —— 这个失败模式是静默的）。
 * 3. **`text()` 必须快** —— 它**每轮都调用** ⇒ 查库要带**同步内存缓存**
 *    （缓存失效：bindings 变更时清）。
 *
 * @module dsh-memj/reading-context
 */
/** 依赖（注入以便测试）。 */
interface DocContextDeps {
  /**
   * 查「这个会话绑定了哪条知识」。
   * ⚠️ **必须同步**（`text()` 要同步返回）⇒ 背后是内存 Map。
   */
  docOf(sessionId: string): {
    entryId: string;
    blockId: string;
  } | undefined;
  /** 读某条知识的正文（同步，走缓存）。 */
  entryBody(entryId: string): string | undefined;
  /** 读某条知识的标题（同步，走缓存）。 */
  entryTitle(entryId: string): string | undefined;
}
/**
 * ⭐⭐ **装配「正在阅读的知识条目」注入**（供 `apply()` 在 `ctx.inject` 回调里调用）。
 *
 * 🔴🔴 **为什么需要"同步缓存"这一层**：
 *    `systemPrompt.context()` 的 `text()` 必须**同步返回**（签名就是 `(ctx) => string`），
 *    而 bindings 与条目正文都是**异步读盘**的。
 *    · 直接在 `text()` 里 `await` ⇒ 不可能（签名不允许）；
 *    · 用 `fs.readFileSync` ⇒ 每轮一次磁盘 IO，且项目已有 `readTextIfExists` 那套
 *      异步封装，另起一套会漂移；
 *    · ⇒ **预热进内存 Map**，`text()` 只查 Map（红线 3「必须快」）。
 *
 * ⭐ **缓存什么时候刷新**：
 *    · 启动时预热一次（异步，不阻塞 apply；失败由 catch 兜住）；
 *    · `askAboutSelection` 建完绑定后调返回的 `refresh()`（否则同一会话的**下一轮**
 *      注入会查不到刚建的绑定 ⇒ 文档上下文丢了 —— 而那是静默的）；
 *    · ⚠️ **不做定时刷新**：库文件可能在别处被改，但「阅读会话」的生命周期很短
 *      （一次阅读几分钟），重启即刷新，收益不足以换取每轮读盘。
 *
 * ⚠️ **它不自己注册**（不像第一版那样内部 `ctx.inject`）：
 *    调用方**已经在** `ctx.inject(['systemPrompt'], cb)` 回调里了 ⇒
 *    那里拿到的 `scoped` 没有 `.inject` 方法（`probe-host.mjs` 抓到过
 *    `ctx.inject is not a function`）⇒ 注册那一步由调用方用 `scoped` 直接做。
 *
 * @returns 缓存三件套 + `refresh`（建绑定后调用 `refresh`）。
 */
declare function installDocContext(): DocContextCache;
/**
 * ⭐ **渲染「正在阅读的知识条目」上下文块**。
 *
 * ⭐ **形态照 memj 已有的 `context()` 用法**（`order=125` 那一类）：
 *    状态类内容、cache-safe（尾部 append，不破前缀缓存）、
 *    同值不发、压缩后自动补 —— 这三条是框架给的（`RuntimeContextProjection`）。
 *
 * ⚠️ **刻意不把「被讨论的段落」单独复制一遍到 `<doc>` 外面** ——
 *    那会把那段文本发两次。用标记（❖）指向即可（`markAnchor`）。
 *
 * @param entryTitle - 条目标题。
 * @param body - 条目正文（全文）。
 * @param anchorExact - 用户选中的原文（用于在正文里打标记）。
 * @returns 注入文本；正文为空 ⇒ 空串（调用方据此跳过注入）。
 */
declare function renderDocContext(entryTitle: string, body: string, anchorExact: string): string;
/**
 * ⭐ **在正文里给锚点段落打标记**（❖ 包裹）。
 *
 * ⚠️ **找不到就原样返回**（不抛错）：锚点可能因为条目被编辑而位移，
 *    但全文仍然有效 ⇒ 打不上标记不该让整个注入失败。
 * @param body - 条目正文。
 * @param exact - 选中的原文。
 * @returns 打过标记的正文。
 */
declare function markAnchor(body: string, exact: string): string;
/**
 * ⭐⭐ **内容完整性自检**（红线 2）。
 *
 * 🔴 **为什么需要它**：框架的 `project()` 只判「与上次是否同值」，
 *     不判「这次渲染出来的是不是完整的」。若 `entryBody` 因为某种原因
 *     只读到一半（文件被截断、读盘中断、缓存污染），
 *     ⇒ 注入半篇 ⇒ 模型拿着半篇**自信地回答**，用户以为它看着全文。
 *     ⭐ **宁可不注入**：用户会看到"AI 好像不知道后面内容"，
 *     而那至少是可察觉的；注入半篇则是**静默的错**。
 *
 * ⚠️⚠️ **必须先剥掉锚点标记再比** —— 第一批实现就在这里错：
 *     `markAnchor` 会把 `exact` 替换成 `❖ exact ❖`（**插入了 4 个字符**）
 *     ⇒ 含 `exact` 的头/尾片段在渲染文本里**不再逐字存在** ⇒ 自检恒不过关
 *     ⇒ 表现是"永远不注入"（而现象看起来像"完整性校验太严"，很容易误判）。
 *     ⭐ 判据：**"比对原文"与"原文被装饰过"是两件事** ——
 *        装饰（打标记）只服务于人/模型的**阅读**，不该参与完整性判据。
 *
 * @param rendered - 渲染后的注入文本（**可能带 ❖ 标记**）。
 * @param body - 原始正文（未打标记）。
 * @returns 是否完整（首尾片段都在）。
 */
declare function isCompleteContext(rendered: string, body: string): boolean;
/**
 * ⭐ **剥掉锚点标记**（`❖ x ❖` ⇒ `x`）。
 *
 * ⚠️ **只剥这一种模式**：`markAnchor` 是唯一写入方，模式固定
 *    ⇒ 用同一个字面量反向替换即可，不需要通用 markdown 解析。
 * @param text - 可能带标记的文本。
 * @returns 剥掉标记的文本。
 */
declare function stripAnchorMarks(text: string): string;
/**
 * ⭐⭐ **注册「正在阅读的知识条目」上下文**（供 `apply()` 调用）。
 *
 * 🔴 **`scoped` 是 `ctx.inject([...])` 回调里的那个对象**，不是 `ctx` 本身 ——
 *    `ctx.inject` 在回调里**不存在**（第一版在这里写了 `ctx.inject(['systemPrompt'], …)`，
 *    被 `probe-host.mjs` 当场抓到 `ctx.inject is not a function`）。
 *    ⭐ 直接用它注册（照 `index.ts` 既有的 `scoped.systemPrompt.context({...})` 写法）。
 *
 * 🔴 **`text()` 的三条纪律**（见文件头红线）：
 *    1. 按 sessionId 过滤（无关会话返回 `''`）；
 *    2. 完整性自检（不过关返回 `''`）；
 *    3. **同步、快**（依赖全是内存缓存）。
 *
 * @param scoped - `ctx.inject(['systemPrompt'], cb)` 回调里的作用域对象。
 * @param deps - 依赖。
 * @param order - 插入顺序（照 memj 既有 `context()` 的取值往后排）。
 */
declare function registerDocContext(scoped: SystemPromptScope, deps: DocContextDeps, order?: number): void;
/** `ctx.inject(['systemPrompt'], cb)` 回调里那个作用域的**最小面**。 */
interface SystemPromptScope {
  systemPrompt: {
    context(spec: {
      name: string;
      order: number;
      /**
       * ⭐ DSH **0.2.1+** 才有的字段：标记"这是操作型上下文"，
       * 使它在 `suppressRuntimeContext()` / `includeRuntimeContext:false` 时**不被摘掉**。
       * ⚠️ 旧版本只是忽略它（多传一个不认识的键无害）。
       */
      required?: boolean;
      text: (ctx: {
        agent?: {
          session?: {
            id?: string;
          };
        };
      }) => string;
    }): unknown;
  };
}
/**
 * ⭐ **`installDocContext()` 的返回值**：三张同步表 + 刷新函数。
 *
 * ⚠️ **刻意把三张表直接暴露**（而不是包成 getter）：
 *    调用方（`index.ts`）要把它们接进 `registerDocContext` 的 `deps`，
 *    而 `deps` 的三个方法就是同步查表 ⇒ 直接给表最直白，少一层间接。
 */
interface DocContextCache {
  /** `refresh()` —— 重新预热（建绑定后必须调）。 */
  refresh(): Promise<void>;
  /** sessionId → 绑定。 */
  index: Map<string, {
    entryId: string;
    blockId: string;
  }>;
  /** entryId → 正文。 */
  bodies: Map<string, string>;
  /** entryId → 标题。 */
  titles: Map<string, string>;
}
//#endregion
//#region src/templates.d.ts
/** @deprecated 决策 209 退役（不再有消费者）。保留常量是为了**不删台账里的 key**。 */
declare const TPL_GUIDANCE_HEAD: string;
/** @deprecated 决策 209 退役（规范块的形态由 `renderSpecBlocksSkeleton` 生成）。 */
declare const TPL_GUIDANCE_ROW: string;
/**
 * ✅ **仍在使用**（唯一还活着的 `tpl:guidance-*`）——**旧形态的兼容读**。
 *
 * 🔴 用途没变，但**消费者换了**：`truncateTitlesFromSpec()` 现在只服务
 *   **存量文档**（决策 207 建的、规范还在末尾那一节里）。
 *   ⇒ 删掉它，那些文档会**静默变成"不截"**（`a113fcb` 事故同族）。
 */
declare const TPL_GUIDANCE_TRUNC_MARK: string;
/**
 * ✅ **仍在使用**：建项目回执里报"这份模板的规范里**没写**归档规则 ⇒ 文档不会自动瘦身"。
 *
 * 🔴 **2026-10-09 修**：它原先的触发判据是 `sections.every(s => s.truncate !== true)` ——
 *   而 `truncate` **已从 `TemplateSection` 删除** ⇒ 那个判据**恒真**
 *   ⇒ 这句话会**无条件**出现在每份新建项目的回执里，而它说的是**已废除的机制**。
 *   现在改由 {@link templateDeclaresArchiving} 判"规范里有没有写归档规则"（见 `handoff.ts`）。
 */
declare const TPL_GUIDANCE_NO_TRUNC: string;
/** @deprecated 决策 209 退役（那句话改由回执报，不再写进文档）。 */
declare const TPL_GUIDANCE_FOOT: string;
/** 模板结构版本（变了就升 ⇒ 旧模板当不兼容，不猜）。 */
declare const TEMPLATE_VERSION = 1;
/** 模板 id 的允许形态（与 slug 同规，因为它同时是文件名）。 */
declare const TEMPLATE_ID_RE: RegExp;
/** 一节的定义。 */
interface TemplateSection {
  /** 节名（`## ` 后面那个词）。 */
  name: string;
  /**
   * ⭐⭐ **这一节的书写规范**（必填）—— 会进该节的规范块，**模型按它写这一节**。
   *
   * 🔴🔴 **决策 223（2026-10-12）起，它还可能承载"归档规则"**（自然语言）：
   *    用户裁定"**归档完全交给模型、规则写在各节的书写规范里**"，工具不再执行归档
   *    （它读不懂自然语言）⇒ **规范里怎么写，模型就怎么做**。
   *    ⚠️ 所以规范要写得**模型能自检**：**把数字写死**（如"超过 20000 字符"），
   *       因为工具会在交接回执里**把实际字符数报给它**，有确切数字才对照得上。
   */
  desc: string;
}
/** 一份模板。 */
interface Template {
  version: number;
  id: string;
  title: string;
  sections: TemplateSection[];
}
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
declare function defaultTemplate(): Template;
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
declare function loadDefaultTemplate(): Promise<Template>;
/**
 * ⭐⭐ **确保 `default` 模板已落盘**（决策 208）——首次使用时写一份出来。
 *
 * 🔴 **为什么需要"确保"而不是"启动时无条件写"**：
 *   ① 它必须可被用户编辑 ⇒ 不能每次启动都把用户的改动**覆盖回内置值**；
 *   ⇒ 判据 = **文件不存在才写**（幂等，不碰已有内容）。
 * @returns 是否本次新建了该文件。
 */
declare function ensureDefaultTemplateFile(): Promise<boolean>;
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
declare function validateTemplate(t: Template): string[];
/**
 * ⭐⭐ **`desc` 超过这个长度就提醒**（**不阻断保存**）——2026-10-05 用户裁定。
 *
 * 🔴 **为什么是"提醒"而不是"上限"**：
 *   这一节装的是**完整的书写规范**（要写什么 + 怎么写 + 截断/归档规则），
 *   用户明确裁定"**干脆不限**"；而它**不吃截断配额**（规范块被整体剔除）⇒ 写长没有副作用。
 * ⚠️ 保留一个提醒的理由很实际：**异常长多半是"误贴了整篇文档进来"** ——
 *   那是人要判断的事，工具只负责**让他看见**，不替他拒绝。
 */
declare const DESC_SOFT_WARN = 2000;
/**
 * ⭐ **模板的"提醒"清单**（**不阻断保存**，与 `validateTemplate` 的"错误"分开）。
 *
 * ⭐ 为什么要和错误分开：两者的**后果完全不同** ——
 *   错误 ⇒ 保存被拒（必须改）；提醒 ⇒ 照常保存，只是一句话告诉你"这看着不太对"。
 *   混在一个数组里会让调用方**分不清该不该拦**。
 * @param t - 待检查的模板。
 * @returns 提醒清单（空 = 没什么可说的）。
 */
declare function templateWarnings(t: Template): string[];
/**
 * ⭐ 把模板拼成**该项目的节名清单**（顺序即文档顺序）。
 * @param t - 模板。
 * @returns 节名数组。
 */
declare function templateSectionNames(t: Template): string[];
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
declare function templateDeclaresArchiving(t: Template): boolean;
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
declare function renderTemplateDoc(t: Template): string;
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
declare function parseTemplateDoc(text: string, fallbackId: string): Template | undefined;
/**
 * ⭐ 读一份模板 —— **`.md` 优先，回落旧的 `.json`**（决策 208 + 兼容读）。
 *
 * 🔴 **两种格式都必须接住**：决策 204 的存量是 `.json`（生产库当时有一份
 *   `company-deep-research.json`）⇒ 只顾新格式会让它**静默消失**。
 * @param id - 模板 id。
 * @returns 模板；两种都不存在或都不可解析 ⇒ `undefined`（**不猜**）。
 */
declare function loadTemplate(id: string): Promise<Template | undefined>;
/**
 * 宽松地把任意 JSON 规整成 `Template`（字段缺失用默认值兜）。
 * ⚠️ **不在这里做语义校验**（那是 `validateTemplate` 的事）——本函数只保证"形状可用"。
 */
declare function normalizeTemplate(raw: unknown): Template | undefined;
/**
 * 列出库里全部模板（含默认，它**总是可用**且不可删）。
 *
 * ⭐⭐ **2026-10-12（决策 208）**：`default` 现在**也在磁盘上**
 *   （`ensureDefaultTemplateFile()` 首次落盘）⇒ 列表里那份**以磁盘为准**
 *   （用户可能改过它）；磁盘上没有才回落内置值。
 * ⚠️ 兼容读旧的 `.json`（存量模板不会因为改格式而消失）。
 */
declare function listTemplates(): Promise<Template[]>;
/**
 * 保存一份模板（**先校验、不合法不写盘**）。
 *
 * ⭐ **决策 208**：写 `.md`（`renderTemplateDoc`）。
 * ⭐ **`default` 现在可以保存**（用户可编辑它）—— 落盘后 `loadDefaultTemplate()` 会读到它。
 * @param t - 模板。
 * @returns 问题清单（空 = 已写入）。
 */
declare function saveTemplate(t: Template): Promise<string[]>;
/**
 * 删除一份模板。
 * 🔴 **`default` 不可删**（它是回落目标）。
 * @param id - 模板 id。
 * @returns 是否真的删了。
 */
declare function deleteTemplate(id: string): Promise<boolean>;
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
declare const DEFAULT_SECTION_NAMES: readonly string[];
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
declare function renderSpecBlocksSkeleton(t: Template): string;
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
//#region src/template-tool.d.ts
/** 模板工具的动作。 */
type TemplateAction = 'list' | 'create' | 'delete';
/** 请求（来自模型）。 */
interface TemplateToolRequest {
  action: TemplateAction;
  /** `create` 时的模板（形状宽松，由 `normalizeTemplate` 规整）。 */
  template?: unknown;
  /** `delete` 时的模板 id。 */
  id?: string;
  /** ⭐ 用户的确认（第一段不给 ⇒ 只回"待确认"）。 */
  confirm?: boolean;
}
/** 决策结果。 */
type TemplateToolDecision =
/** 需要用户确认 —— **本次什么都没做**。 */
{
  kind: 'needs-confirm';
  message: string;
} |
/** 直接执行（`list`，或已确认）。 */
{
  kind: 'run';
} |
/** 明确拒绝（输入不对）。 */
{
  kind: 'reject';
  message: string;
};
/**
 * 决定该次调用是"待确认"、"执行"还是"拒绝"。
 *
 * 🔴 **`list` 不需确认**（只读、零副作用）—— 要求确认反而会让模型没法先看有哪些模板。
 * @param req - 模型给的请求。
 * @returns 决策。
 */
declare function decideTemplateTool(req: TemplateToolRequest): TemplateToolDecision;
/**
 * 生成"待用户确认"的回执。
 *
 * 🔴 **这份文案是给模型看的**，要求它把内容转达给用户、并在**用户明确同意后**
 *   才带 `confirm: true` 再调 —— ⚠️ 措辞必须**明确要求用户确认**，
 *   不能写成"已保存"（那会让模型以为做完了）。
 * @param req - 模型给的请求。
 * @returns 回执文本。
 */
declare function confirmMessage(req: TemplateToolRequest): string;
//#endregion
//#region src/settings.d.ts
/** patchReload 模式（决定"要不要重启"，§8.8.4）。 */
type PatchReload = 'live' | 'startup' | 'unknown';
/** 设置的读取结果。 */
interface SettingsReadResult {
  /**
   * ⚠️ **进程内那一刻的生效配置**（`apply()` 拿到的第二参，已含默认值）。
   *
   * 🔴 **它不等于"磁盘上写着什么"**：写盘（`writeSetting`）不会回头更新它，
   *    要等下一次**热重载/重启**才变。⇒ **面板要显示"刚存下的值"就必须用
   *    `explicit`**（见 `effectiveConfig`），否则会出现"存完立刻弹回旧值"。
   */
  config: MemjConfig;
  /**
   * ⭐⭐ **磁盘上显式写了**的键值（`- id: dsh-memj` 那条的 `config` 原样）。
   *
   * ⚠️ 只含**显式写了**的键 —— 没写的键不在这里（它们走 `config` 的默认/回落值）。
   * 🔴 **判断"写没写"必须用 `Object.hasOwn`，不能用取值真伪**：
   *    `false` / `0` / `''` 都是**合法且显式**的值（本项目同族坑）。
   */
  explicit: Record<string, unknown>;
  /** ⭐ patch 文件的绝对路径；拿不到时为 `''`。 */
  patchPath: string;
  /** 该文件当前是否存在。 */
  patchExists: boolean;
  /** 该文件里 `- id: dsh-memj` 那条**显式写了**哪些键（没写的走默认值）。 */
  explicitKeys: string[];
  /**
   * ⭐ 热重载策略——`live` ⇒ 改完自动生效；`startup` ⇒ **必须重启**。
   *
   * ⚠️ 从 profile 的 `package.json` 的 `dsh.profile.patchReload` 读；
   * 读不到时回 `unknown`，此时**不得**向用户承诺"已生效"。
   */
  patchReload: PatchReload;
  /** 读失败时的原因（成功为 `''`）。 */
  error: string;
}
/**
 * 由 `ctx.baseUrl` 解析当前 profile 目录。
 * @param baseUrl - `ctx.baseUrl`（形如 `file:///D:/.../profiles/web/`）。
 * @returns profile 目录绝对路径；不可用时返回 `''`。
 */
declare function profileDirFrom(baseUrl: unknown): string;
/**
 * 解析出 patch 文件的绝对路径。
 * @param baseUrl - `ctx.baseUrl`。
 * @returns 绝对路径；不可用时返回 `''`。
 */
declare function patchPathFrom(baseUrl: unknown): string;
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
declare function readSettings(baseUrl: unknown, config: MemjConfig, entryId?: string): Promise<SettingsReadResult>;
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
declare function effectiveConfig(r: SettingsReadResult): MemjConfig;
/** 写入结果。 */
interface SettingsWriteResult {
  ok: boolean;
  /** 给人看的说明（成功与失败都要有）。 */
  message: string;
  /** 写完后的 patch 文件绝对路径。 */
  patchPath: string;
  /** ⭐ 是否需要重启才生效（`patchReload !== 'live'`）。 */
  needsRestart: boolean;
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
declare function writeSetting(baseUrl: unknown, key: 'themeCreation' | 'progressCharsWarn' | 'progressCharsKeep' | 'backupGit' | 'hotInject' | 'hotInjectRatio' | 'hotCharsPerToken' | 'hotBudgetCharsFallback' | 'hotFullWarnChars' | 'hotSessionKeep' | 'hotScoreOnTurnEnd' | 'hotScoreThreshold' | 'hotScoreWindowHours' | 'hotScoreTopN' | 'hotScoreGateMinScore' | 'hotScoreGateLastTurn' | 'hotScoreMaxPicks' | 'hotScoreMinChars' | 'hotScoreChannel' | 'hotScoreModel' | 'hotScoreSubagentProvider' | 'hotScoreSubagentModel' | 'hotScoreTimeoutMs' | 'enIndex' | 'enIndexDiag' | 'translateProvider' | 'translateModel' | 'translateTemplate' | 'translateConcurrency' | 'translateRetries' | 'translateTimeoutMs' | 'translateMaxTokens' | 'tagNormalizeProvider' | 'tagNormalizeModel' | 'tagNormalizeTimeoutMs' | 'tagNormalizeMaxTokens' | 'tagNormalizeReasoningEffort' | 'tagNormalizeOnHandoff' | 'hotScoreOnTurnEnd' | 'hotScoreThreshold' | 'hotScoreWindowHours' | 'hotScoreTopN' | 'hotScoreGateMinScore' | 'hotScoreGateLastTurn' | 'hotScoreMaxPicks' | 'hotScoreMinChars' | 'hotScoreChannel' | 'hotScoreModel' | 'hotScoreSubagentProvider' | 'hotScoreSubagentModel' | 'hotScoreTimeoutMs' | 'contextReportOnTurnEnd' | 'contextReportMinPercent' | 'contextReportStepPercent' | 'activeInject' | 'activeInjectChannel' | 'activeInjectModel' | 'activeInjectScope' | 'activeInjectJevNarrowScope' | 'activeInjectJevEndpoint' | 'activeInjectJevApiKeyEnv' | 'jevModel' | 'activeInjectStrict' | 'activeInjectTopK' | 'activeInjectNeedMin' | 'activeInjectItemMin' | 'activeInjectBand' | 'activeInjectTimeoutMs' | 'activeInjectContextRounds' | 'activeInjectPoolMax' | 'activeInjectExplain' | 'activeInjectSearchIntentGate' | 'activeInjectSearchIntentMin' | 'activeInjectSufficientGate' | 'activeInjectSufficientMin' | 'activeInjectMaxInjectionsPerTurn' | 'activeInjectMaxCallsPerTurn' | 'activeInjectReasoningMaxChars' | 'activeInjectBudget' | 'activeInjectBudgetTokens' | 'activeInjectContextTokens' | 'activeInjectConcurrency' | 'activeInjectChatWindowRatio' | 'activeInjectPoolMin' | 'activeRecallLogRequest' | 'decisionProviders' | 'activeInjectDecisionPick' | 'hotScoreDecisionPick',
/**
 * 新值。
 * ⭐⭐ **2026-10-07 放宽到也收数组/对象**：`decisionProviders` 是
 *    `Array<{id, displayName, endpoint, models}>`（用户要求"多 provider"）。
 *    ⚠️ 放宽的只是**这个入口的类型**，**逐键校验仍在 `api.ts`**（那里才是契约）——
 *    别以为这里不校验就可以随便传。
 */
value: string | number | boolean | unknown[] | Record<string, unknown>, entryId?: string): Promise<SettingsWriteResult>;
/** 合法取值（供 API 层校验）。 */
declare const THEME_CREATION_VALUES: readonly string[];
/**
 * ⭐ `progressCharsWarn` 的合法区间（供 API 层校验）。
 *
 * ⚠️ 与 `config.ts` 里 schemastery 的 `min(1000).max(1000000)` **必须一致**——
 *    两处都是"能不能用"的边界，不一致会让"网页上存得进、插件启动却被拒"。
 */
declare const PROGRESS_WARN_MIN = 1000;
declare const PROGRESS_WARN_MAX = 1000000;
/**
 * ⭐⭐ 热知识的取值边界（供 API 层校验）。
 *
 * ⚠️ 与 `config.ts` 里 schemastery 的约束**必须一致**（同 `PROGRESS_WARN_*` 的理由）：
 * 不一致会让"网页上存得进、插件启动却被拒"。
 */
declare const HOT_RATIO_MIN = 0;
declare const HOT_RATIO_MAX = 100;
declare const HOT_CHARS_PER_TOKEN_MIN = 0.1;
declare const HOT_CHARS_PER_TOKEN_MAX = 10;
declare const HOT_BUDGET_MIN = 1000;
declare const HOT_BUDGET_MAX = 10000000;
declare const HOT_FULL_WARN_MIN = 1;
declare const HOT_FULL_WARN_MAX = 1000000;
declare const HOT_SESSION_KEEP_MIN = 1;
declare const HOT_SESSION_KEEP_MAX = 10000;
/**
 * ⭐⭐ 主动注入的取值边界（供 API 层校验；设计文档 §10.1）。
 *
 * ⚠️ 与 `config.ts` 里 schemastery 的约束**必须一致**（同 `PROGRESS_WARN_*` 的理由）：
 *    不一致会让"网页上存得进、插件启动却被拒"。
 */
declare const ACTIVE_TOP_K_MIN = 1;
declare const ACTIVE_TOP_K_MAX = 50;
declare const ACTIVE_BAND_MIN = 0;
declare const ACTIVE_BAND_MAX = 1;
declare const ACTIVE_TIMEOUT_MIN = 500;
declare const ACTIVE_TIMEOUT_MAX = 120000;
declare const ACTIVE_CONTEXT_ROUNDS_MIN = 1;
declare const ACTIVE_CONTEXT_ROUNDS_MAX = 50;
declare const ACTIVE_POOL_MAX_MIN = 10;
declare const ACTIVE_POOL_MAX_MAX = 2000;
declare const ACTIVE_CALLS_PER_TURN_MIN = 0;
declare const ACTIVE_CALLS_PER_TURN_MAX = 50;
declare const ACTIVE_REASONING_MAX_CHARS_MIN = 100;
declare const ACTIVE_REASONING_MAX_CHARS_MAX = 100000;
/** 主动注入的**通路**受控两值（§6.1）。 */
declare const ACTIVE_CHANNEL_VALUES: readonly string[];
/** 主动注入的**清单范围**受控三值（§6.0）。 */
declare const ACTIVE_SCOPE_VALUES: readonly string[];
//#endregion
//#region src/handoff.d.ts
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
declare function quoteAppearsIn(why: string, desc: string): boolean;
/** 要落盘的一条知识。 */
interface HandoffEntry {
  /** 英文短名（LLM 从标题翻译）。 */
  slug: string;
  /**
   * ⭐ **标题**（决策 98，**必填**，2–48 字符）。
   *
   * 🔴 **它是封面的字段**——以前标题从正文现算，逼得 `memj_search`
   * 为**每个候选**打开文件；现在不读正文也能回标题。
   */
  title: string;
  /** 标签，至少 1 个。 */
  tags: string[];
  /** 检索键（必填，≤200 字符）。 */
  desc: string;
  /** 正文 markdown（首个 `###` 作为标题）。 */
  body: string;
  /**
   * ⭐⭐ **只引用不搬动**（`ext: true` 时必填）：库外文档的**绝对路径**。
   *
   * 🔴 **为什么补这个字段**：实现在 `handoff` 流程里**本来就有第 4 步
   * 「登记外部引用（`ext: true`）」**，`Cover` 结构、`parse.ts` 的
   * `coverToYaml`/`validateCoverShape`、`store.ts` 的重填路径与删除逻辑
   * **全都支持 `ext`**；工具描述也写着"只引用不搬动则建 `ext: true` 的封面"。
   * 但**参数 schema 与这个接口里都没有 `ref`/`ext`** ⇒ 模型**没有任何入口**
   * 能登记外部引用（描述给了能力、实现没开口子）。
   *
   * | 场景 | `ref` | `ext` | `body` |
   * |---|---|---|---|
   * | 落库（默认） | 不填（工具按 slug+id 算） | 不填 | **必填** |
   * | 只引用不搬动 | **绝对路径**（必填） | `true` | 不填（正文在库外） |
   */
  ref?: string | undefined;
  /**
   * ⭐ `true` = **外部引用**（不搬动库外文件，只建封面）。
   *
   * ⚠️ 与 `adopt` 的区别：`adopt` 是**入库**（把正文收进库、封面 `ext` 置 `false`）；
   * 本字段是**只引用**（正文永远留在库外）。
   */
  ext?: boolean | undefined;
  /**
   * ⭐ 形态分类（决策 81，**可选**）：`fact`/`trap`/`howto`/`decision`。
   * 与 `theme` 正交——theme 是"属于谁"，kind 是"本身是什么形态"。
   */
  kind?: string | undefined;
  /** 要挂靠的主题 id（**只能填已存在的**）。 */
  theme?: string[];
  /**
   * ⭐⭐⭐ **挂靠依据**（决策 156）：**引一句该主题 `desc` 里的话** +
   * 说明这条知识**怎么服务那个 desc 描述的场景**。
   *
   * 🔴 **挂了 `theme` 就该给**（不给 ⇒ 回执**警告**，但不拒收）。
   * ⚠️ 目的：把"凭感觉判通不通用"换成"**必须去读那段 desc**" ——
   *    真实事故里，三条正文全是本项目专属数据、却因"话题听起来通用"挂上了跨主题主题。
   */
  themeWhy?: string | undefined;
  /** 是否加入全局（**只登记提名**）。 */
  global?: boolean;
  /**
   * ⭐ **同 `slug` 已存在时，是否覆盖**（决策 104，默认 `false`）。
   *
   * - `false`（缺省）⇒ **拒绝**并提示"已存在"，避免静默覆盖；
   * - `true` ⇒ **就地覆盖**那条知识（不产生第二个文件）。
   *
   * ⚠️ 它解决的是**幂等**问题：同一入参重发（网络重试、分步补写）
   * 不会在库里堆出重复知识。
   */
  overwrite?: boolean;
}
/** 本次要新建的主题。 */
interface NewThemeRequest {
  id: string;
  desc: string;
}
/** 入库一项外部文档。 */
interface AdoptRequest {
  slug: string;
  /** ⭐ **标题**（决策 98，必填，2–48 字符）。 */
  title: string;
  ref: string;
  /** `copy` = 工具自己读全文；`extract` = 用 `body` 作为正文。 */
  mode: 'copy' | 'extract';
  body?: string;
  tags: string[];
  desc: string;
  /** ⭐ 形态分类（可选），同 `HandoffEntry.kind`。 */
  kind?: string | undefined;
  theme?: string[];
  global?: boolean;
  /** ⭐ 同 `slug` 已存在时是否覆盖（决策 104，默认 `false`）。同 `HandoffEntry.overwrite`。 */
  overwrite?: boolean;
}
/**
 * ⭐ **handoff 的分步取值**（决策 101 / §3.11）。
 *
 * | 值 | 做什么 |
 * |---|---|
 * | `narrative` | 写项目叙事（`doc` / `projectDesc`） |
 * | `theme` | 建主题（`newThemes`）；⭐ **并在这里消费读快照**（决策 102） |
 * | `knowledge` | 落知识（`entries` / `adopt`） |
 * | `all` | 全部（**缺省**，等价于一次完整 handoff） |
 */
type HandoffStep = 'narrative' | 'theme' | 'knowledge' | 'all';
/**
 * 三个**可单独执行**的步骤，**顺序即执行顺序**（§3.11.2）。
 *
 * 🔴 **固定为这个顺序，与调用方给的数组顺序无关**——
 * `knowledge` 要挂主题，而主题由 `theme` 建；顺序反了会挂到不存在的主题上。
 */
declare const HANDOFF_STEP_ORDER: readonly Exclude<HandoffStep, 'all'>[];
/** 一次 handoff 实际要跑的步骤集合。 */
interface StepPlan {
  /** 要跑的步骤（`all` 会被展开成三个）。 */
  steps: Set<Exclude<HandoffStep, 'all'>>;
  /** 是否是 `all`（或等价形态）。 */
  isAll: boolean;
  /** 非法输入时的说明（有值即失败）。 */
  error?: string;
}
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
declare function planSteps(raw: HandoffStep | readonly HandoffStep[] | undefined): StepPlan;
/** `memj_handoff` 的入参。 */
interface HandoffRequest {
  project: string;
  /** ⭐ **本次做哪几步**（决策 101）：缺省 `all`；可给数组；顺序固定。 */
  step?: HandoffStep | readonly HandoffStep[] | undefined;
  projectDesc?: string | undefined;
  /** 文档的叙事部分（该文档自己的叙事节）；不含封面。 */
  doc?: string | undefined;
  /**
   * ⭐⭐ **只写某一节**（决策 134）——节名，匹配规则与 `memj_read` 的 `section` 一致。
   *
   * 🔴 **为什么需要**：旧路径的最小单位是**整个顶层节** ⇒ 要加一段就得**逐字重写整节**
   *    （实测「当前进度」28,750 字符，超出单次输出能力）⇒ **长文档 handoff 走不通**。
   * ⭐ 给了它 ⇒ `doc` **只当这一节的内容**，其余节**一律不动**。
   * ⚠️ 顶层 `##` 节与 `###` 子节都可以。
   */
  docSection?: string | undefined;
  /**
   * ⭐⭐ **怎么改那一节**（决策 134，配合 `docSection`）。
   *
   * - `append`（**缺省**）：追加到该节末尾
   * - `prepend`：追加到该节开头
   * - `replace`：替换该节（**压缩**用：把一整段改写成归并版）
   * - `drop`：删除该节（**压缩**用：几条归并成一条时删掉旧的）
   *
   * 🔴 **缺省取 `append` 是刻意的**：忘给参数时**只会追加、不会覆盖**
   *    ⇒ 把"忘带全文就丢历史"从**靠人记得**变成**结构上做不到**。
   */
  docOp?: DocOp | undefined;
  entries?: HandoffEntry[] | undefined;
  newThemes?: NewThemeRequest[] | undefined;
  /**
   * ⭐⭐ **准挂表**（决策 111）：**只补挂这些快照**（别项目 entry id 数组）。
   *
   * 🔴 **省略 = 一条都不挂**（fail-closed）——不列就不挂。理由见决策 111：
   * 设计一直要求「相关性由 LLM 逐条判断」，但原先实现里 LLM **没有落点**
   * （`handoff.ts` 无条件把全部别项目快照挂到每个新主题上）⇒ 无关知识被误挂。
   * ⚠️ **失败模式对比**：漏列只是**少挂**（可发现、不污染）；若用"排除表"，
   * 漏写则**误挂依旧**（正是本 bug）。
   */
  linkedSnapshots?: string[] | undefined;
  adopt?: AdoptRequest[] | undefined;
  confirmCreate?: boolean | undefined;
  /**
   * ⭐⭐ **用哪份模板建这份文档**（决策 204）。
   *
   * 🔴🔴 **只在「新建项目」那一刻有效**（用户 2026-09-30 裁定）：
   *    · 项目**已存在** ⇒ 本参数**被忽略**（**模板绝不回溯已有文档**）；
   *    · 新建 ⇒ 按该模板的节名建骨架，并把节名**写进文档自己的 frontmatter**。
   *   ⇒ 此后那份文档**按自己记着的节名**工作，**与模板解耦**
   *     （改模板、甚至删掉模板，都**不影响**它）。
   *   ⚠️ **2026-10-05 起**：frontmatter 那份是**镜像**（权威已改成**正文的 `##` 标题**，
   *      见 `docSectionsOf()`）—— 因为 frontmatter 会被某些重建流程改写，而正文不会。
   *
   * ⚠️ **省略 = 用"当前生效的默认模板"**（它**也落盘、用户可能改过** ⇒
   *   `loadDefaultTemplate()` 读盘优先；内置值只是回落）—— 节数**不保证是六节**。
   * ⚠️ **模型要改已有文档的结构 ⇒ 做不到，这是有意的**；要换结构只能新建项目。
   */
  template?: string | undefined;
}
/** 执行结果。 */
interface HandoffResult {
  ok: boolean;
  /** 回执（成功时）或错误说明（失败时）——**必须区分"更新/新建"**（决策 48）。 */
  message: string;
  /** 校验失败时的逐条问题（决策 62：**一次报全部**，让 LLM 一次改完）。 */
  issues: string[];
  createdProject: boolean;
  createdThemes: string[];
  /** 疑似重复的项目 id（两段式确认用）。 */
  similarProjects: string[];
  /** 疑似重复的主题 id（两段式确认用）。 */
  similarThemes: string[];
  /** 本次依据的未消费快照条数（§12-57）。 */
  snapshotCount: number;
}
/** `docOp` 的四种取值（决策 134）。 */
type DocOp = 'append' | 'prepend' | 'replace' | 'drop';
/** 一次按节操作的结果。 */
interface SectionOpResult {
  /** 操作后的完整叙事；失败时为 `undefined`。 */
  narrative?: string;
  /** 失败原因（成功时为空）。 */
  error?: string;
  /** 命中的节名（成功时）。 */
  hitTitle?: string;
  /**
   * ⭐⭐ **命中是否为精确匹配**（2026-10-12 新增，真实事故修）。
   *
   * 🔴 **为什么必须有它**：子串匹配会把「目标」命中到「研究目标」——
   *   而**回执报的是调用方请求的名字**，于是那次操作看起来「成功」，
   *   调用方完全看不出自己改错了对象。
   * 🔴 **真实事故**：模型传 `docSection:"目标"`，工具改的是 `## 研究目标`，
   *   回执报「替换了该节 `目标`：5 → 51 字符」⇒ 手误被完全掩盖。
   *
   * ⭐ 精确匹配（`section.title === name`）时为 `false`；靠子串兜底命中时为 `true`
   *   ⇒ 回执如实说「你传的是 A，实际命中的是 B」。
   */
  fuzzyHit?: boolean;
  /** 该节操作前后的字符数（供回执回声）。 */
  beforeChars?: number;
  afterChars?: number;
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
declare function findEmptySections(text: string): string[];
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
declare function applySectionOp(text: string, sectionName: string, op: DocOp, body: string): SectionOpResult;
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
declare function normalizeNarrative(text: string, titles?: readonly string[]): string;
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
declare function mergeNarrative(incoming: string, existing: string | undefined, titles?: readonly string[]): string;
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
declare function insertSpecBlocks(text: string, tpl: Template): string;
/**
 * 🔴🔴 **`defaultTruncateTitle()` / `templateTruncateTitle()` 已于 2026-10-12（决策 223）删除。**
 *
 * ── 它们原来做什么 ──────────────────────────────────────────────────────────
 * 决定「**哪几节要自动截断**」—— 判据依次是：正文规范块的 `truncate` 标记 →
 * 旧形态的「本档写作规范」节 → `frontmatter.truncateSections`。
 *
 * ── 为什么删 ────────────────────────────────────────────────────────────────
 * 用户裁定：**归档完全交给模型**（规则写在各节的书写规范里，自然语言），
 * 工具**不再执行归档**（它读不懂自然语言）⇒ "哪节能截"这个判定**没有消费者了**。
 * ⇒ 连带删除：`truncateProgress()` 调用、`truncateTitle` 参数、
 *   `frontmatter.truncateSections` 的**反解与写回**（字段本身仍在读侧兼容）。
 *
 * ⚠️ **代价（用户明确知悉并接受）**：旧设计里"工具自动截断"这条**确定性**没了 ——
 *    本项目记过"模型连报 7 次、一次没压"。本次把它请回来，换来的是
 *    "**归档策略完全由书写规范决定**"。
 * ⭐ 缓解：交接回执里**报出各节字符数**（模型有确切数字可对照规范的阈值）。
 */
/** 各节的体量（用于回执里"报数"—— 决策 223）。 */
interface SectionSize {
  title: string;
  chars: number;
  /**
   * 它下面的 `###` 子节（**按字符数降序**；没有子节就是空数组）。
   *
   * 🔴 **为什么要这一层**（2026-10-09 修）：**归档挪走的正是 `###` 子节**，
   *   而第一版只报顶层 `##` 节 ⇒ 模型看到"当前进度 33853 字符"却**不知道该挪哪几段**，
   *   实测后果：**它自己去写脚本量子节**（还量错了边界）。
   *   ⭐ 判据：**报数要报到"能够直接动手"的那一级** ——
   *   只报总量而操作对象是子节，等于把最关键的一步留给调用方去猜。
   */
  children: SectionSize[];
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
declare function measureSections(narrative: string): SectionSize[];
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
declare function checkEntryShape(e: HandoffEntry, label: string): string[];
/**
 * ⭐ 校验一条 adopt 的**形状**（纯参数，不读库）。与 `checkEntryShape` 同一套理由。
 * @param a - 一条 adopt 入参。
 * @param label - 报错前缀（如 `adopt[0]`）。
 * @returns 问题列表（空 = 通过）。
 */
declare function checkAdoptShape(a: AdoptRequest, label: string): string[];
/**
 * ⭐⭐ **形状校验的聚合入口**（纯参数、不读库、不抛异常）。
 *
 * 供 `pre-execute` 闸门与 `runHandoff` **共用**（决策 103 / §3.11.6）。
 * 🔴 **只返回问题，不做任何 I/O**——闸门必须够快（它拦在工具体之前）。
 * @param entries - 本次的 entries（可为 `undefined`）。
 * @param adopt - 本次的 adopt（可为 `undefined`）。
 * @returns 问题列表（空 = 通过）。
 */
declare function checkKnowledgeShape(entries: readonly HandoffEntry[] | undefined, adopt: readonly AdoptRequest[] | undefined): string[];
/**
 * 执行一次 handoff（§7.1 的全部步骤）。
 * @param req - 入参。
 * @param env - 会话与配置。
 * @returns 执行结果。
 */
declare function runHandoff(req: HandoffRequest, env: {
  sessionId: string;
  turn?: number;
  config: MemjConfig;
}): Promise<HandoffResult>;
/**
 * 校验库里全部封面（`memj_rebuild` 的职责二，§4.2）。
 *
 * ⚠️ 与写入校验的**处置不同**（§3.9.3）：这里**跳过非法封面并记录**，
 * 不阻断重建——因为"一次手改的笔误不该让整个库重建不了"。
 * @returns 全部非法封面。
 */
declare function validateAllCovers(): Promise<CoverIssue[]>;
//#endregion
//#region src/commands.d.ts
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
declare function parseStepRequest(userNote: string): HandoffStep[] | undefined;
//#endregion
//#region src/gate.d.ts
/** 闸门依赖。 */
interface GateDeps {
  ctx: Context;
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
declare function gateHandoffArgs(args: unknown): string | undefined;
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
declare function selfCheckHandoffResult(args: unknown, value: unknown): string | undefined;
/**
 * 注册 host 侧闸门。
 *
 * ⚠️ **只拦 `memj_handoff`**——其它工具（search/read/...）是本插件自己的读工具，
 * 参数简单，没必要加一道。
 * @param deps - 依赖。
 * @returns 卸载函数（正常情况下由 `ctx.effect` 托管，无需手工调用）。
 */
declare function registerGate(deps: GateDeps): () => void;
//#endregion
//#region src/inject.d.ts
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
declare const HANDOFF_LEVELS: readonly [1, 2, 3];
/** 档位类型。 */
type HandoffLevel = (typeof HANDOFF_LEVELS)[number];
/** 默认档位：文档 + 项目知识（第 2 档）。 */
declare const DEFAULT_LEVEL: HandoffLevel;
/** 档位说明（同时用于提示词与回执）。 */
declare const LEVEL_LABELS: Record<HandoffLevel, string>;
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
declare function parseLevel(note: string): HandoffLevel | undefined;
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
declare const CLOSING_INSTRUCTION: string;
declare const TARGET_PROJECT_LINE: string;
declare const TARGET_THEME_LINE: string;
declare const PROJECT_KNOWLEDGE_HINT: string;
declare const THEME_KNOWLEDGE_HINT: string;
declare const THEME_COVERS_HINT: string;
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
declare function renderProjectHandoff(projectId: string, level: HandoffLevel): Promise<{
  text: string;
  counts: {
    narrative: boolean;
    project: number;
    theme: number;
  };
} | undefined>;
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
declare function renderThemeHandoff(themeId: string): Promise<{
  text: string;
  counts: {
    covers: number;
    projects: number;
  };
} | undefined>;
//#endregion
//#region src/en-index.d.ts
/** 一条索引记录（**B 方案完整投影**：召回不再回读封面）。 */
interface EnIndexEntry {
  project: string;
  theme: string[];
  kind: string;
  title: string;
  desc: string;
  titleEn: string;
  descEn: string;
  /** 中文 desc 的短哈希 —— **保鲜判据**。 */
  descHash: string;
  translatedAt: string;
  /** 走的是哪条翻译路径（排障用）。 */
  via?: string;
}
/** 索引文件结构。 */
interface EnIndex {
  version: 1;
  builtAt: string;
  provider: string;
  model: string;
  template: string;
  coverCount: number;
  translated: number;
  /** ⭐ 项目 → 主题映射（`project+themes` 范围要用；**不在封面里**）。 */
  projects: Record<string, {
    themes: string[];
  }>;
  entries: Record<string, EnIndexEntry>;
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
declare function isMtModel(provider: string, model: string): boolean;
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
declare function pairingError(template: string, provider: string, model: string): string;
/** 一次重建的结果（回执/日志用）。 */
interface RebuildResult {
  covers: number;
  added: number;
  updated: number;
  removed: number;
  translated: number;
  failed: number;
  repaired: number;
  /** 非空 = 本次跳过的原因。 */
  skipped: string;
}
/** 索引文件路径。 */
declare function enIndexPath(): string;
/** 中文 desc 的短指纹（保鲜判据）。 */
declare function descHashOf(desc: string): string;
/** 读索引；不存在或损坏 ⇒ `undefined`（**不抛**）。 */
declare function loadEnIndex(): Promise<EnIndex | undefined>;
/** 原子写索引。 */
declare function saveEnIndex(idx: EnIndex): Promise<void>;
/**
 * ⭐ **漏翻判据**：译文里残留的中文串，若**在中文原文中未被引号包裹** ⇒ 判为漏翻。
 *
 * 为什么需要它：原文里作为**示例/代码/乱码样本**被引号包起来的中文
 * （如 `「鏂规」`）**应当保留**，而普通词被原样搬进译文才是漏翻 ——
 * 两者表现一样，必须区分，否则会把正确的译文误判成错误。
 */
declare function leakedHan(entry: Pick<EnIndexEntry, 'title' | 'desc' | 'titleEn' | 'descEn'>): string[];
/**
 * ⭐ **重建索引**（落盘时 / 启动兜底都走这里）。
 *
 * 流程：`scanLibrary()` 全量 → 与现有索引 diff → 只翻「新增 / `descHash` 过期」
 * → 漏翻质检并重翻 → 原子写回。
 *
 * 🔴 **本函数不抛**（调用方可能是 handoff 的收尾路径）。
 */
declare function rebuildEnIndex(opts: {
  ctx: Context;
  config: MemjConfig;
  reason?: string;
}): Promise<RebuildResult>;
/**
 * ⭐ **触发一次后台重建**（fire-and-forget）—— 给"落盘成功"这类路径调用。
 *
 * 🔴 **不 await、不抛**：索引是派生数据，它失败**不该影响**调用方（尤其 handoff）。
 */
declare function triggerEnIndexRebuild(ctx: Context, config: MemjConfig, reason: string): void;
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
declare function registerEnIndex(opts: {
  ctx: Context;
  config: MemjConfig;
}): void;
/**
 * ⭐⭐ **索引体检报告**（人侧「检查」按钮 + 启动兜底**共用同一份判据**）。
 *
 * 🔴 **为什么必须共用**：本项目铁律「**同一判据只能有一份实现**」——
 * 启动兜底与页面体检若各算各的，迟早出现"页面说健康、启动却说该重建"。
 *
 * 报告**只读**（不写盘）。
 */
interface IndexHealth {
  /** 索引文件是否存在。 */
  exists: boolean;
  /** 索引里的条数（不存在为 0）。 */
  indexed: number;
  /** `scanLibrary()` 的活跃封面数（**权威口径**）。 */
  visible: number;
  /** 索引有、库里无（**幽灵条目** —— 会把已删的知识当成存在）。 */
  ghost: number;
  /** 库里有、索引无（**缺失** —— 召回会漏掉新知识）。 */
  absent: number;
  /** 缺译文的条数（结构对、内容空）。 */
  untranslated: number;
  /** 中文 desc 与 `descHash` 对不上的条数（**保鲜判据失效** ⇒ 会反复重翻）。 */
  staleHash: number;
  /** 命中漏翻判据的条数（译文里残留普通中文词）。 */
  leaked: number;
  /** ⭐ **归属漂移**：条目的 `project`/`theme` 与库里对不上的条数（范围筛选会用错归属）。 */
  metaDrift: number;
  /** ⭐ **项目主题映射漂移**：项目 `themes:` 与索引里记的对不上的项数。 */
  projectDrift: number;
  /** 体检时刻。 */
  checkedAt: string;
  /** 上次重建时刻（索引不存在时为空）。 */
  builtAt: string;
  /** 当前生效的翻译路由（配置来，拿不到为空）。 */
  route: string;
  /** ⭐ **是否需要补全**（任一项有问题）。 */
  needsRepair: boolean;
  /** 是否需要补全的**理由清单**（给人看，逐条说清）。 */
  problems: string[];
}
/**
 * ⭐ **检查索引**（只读，不写盘）。
 *
 * 判据**与启动兜底同源**（见 {@link IndexHealth} 的说明）。
 * @returns 体检报告；任何一步失败都**降级成"不可判定"**而不是抛。
 */
declare function checkIndex(opts: {
  ctx: Context;
  config: MemjConfig;
}): Promise<IndexHealth>;
/**
 * ⭐⭐ **检查并（按需）补全** —— 给人侧「检查并补全」按钮用。
 *
 * 🔴 **动手前先看体检报告**：**没问题就不重建**（避免每次点击都白花翻译钱）。
 * @returns 体检报告 + 本次是否真的重建过 + 重建结果。
 */
declare function checkAndRepair(opts: {
  ctx: Context;
  config: MemjConfig;
  force?: boolean;
}): Promise<{
  health: IndexHealth;
  repaired: boolean;
  result?: RebuildResult;
}>;
//#endregion
//#region src/active-context.d.ts
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
declare const TOKEN_COEF: {
  /** 汉字（CJK 统一表意文字 + 中日韩标点 + 全角符号）。 */
  readonly han: 1.1;
  /** 拉丁字母/数字。 */
  readonly latin: 0.26;
  /**
   * ⭐ **ASCII 标点 / 空白 / 换行**（`{}[]();=<>|&` 等）—— 实测 **0.684**。
   * 🔴 它与 `wide` **不是一回事**，别合并（上一版合并 ⇒ 低估 63%）。
   */
  readonly ascii: 0.75;
  /**
   * ⭐ **非 ASCII、又非汉字的符号**（`—` `–` `“”` `‘’` `…` `·` `「」` 等）——
   * 实测 **约 1.006**，**与汉字同价**。
   * 🔴 上一版把它算成 0.42 ⇒ **低估 139%**（本项目最严重的一次估算偏差）。
   */
  readonly wide: 1.1;
  /** 请求结构 + 固定问句的**固定开销**（输入侧）。 */
  readonly overhead: 400;
  /** **每条候选**的**输入**成本（候选正文 + 它自己的那个 `noul` 问句；实测 210.7）。 */
  readonly perCandidate: 230;
  /**
   * ⭐ **每条候选**的**输出**成本（模型回一个 `noul` 概率，实测 18.6）。
   * 🔴 **漏了它就会"以为没超、实际超"** —— 见下方说明。
   */
  readonly perCandidateOutput: 24;
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
declare function estimateTokens(text: string): number;
/** 候选池的估算**输入**成本（每条含它自己的问句）。 */
declare function estimatePoolTokens(count: number): number;
/**
 * ⭐⭐ 候选池的估算**输出**成本（模型要为每条候选回一个 `noul`）。
 *
 * 🔴 **必须与输入一起算进预算** —— 漏了它就是"以为没超、实际超"（见 `TOKEN_COEF`）。
 */
declare function estimatePoolOutputTokens(count: number): number;
/** 一条"该保留的消息"。 */
interface KeptMessage {
  role: string;
  text: string;
  /** ⭐ 是不是 memj 自己注入的（**去重的判据**）。 */
  injected: boolean;
  /** 注入消息的指纹（用于去重；非注入为空串）。 */
  injectKey: string;
}
/** 一轮（turn）。 */
interface Turn {
  /** 真实用户输入（这一轮的起点）。 */
  userText: string;
  /** LLM 的直接输出（该轮内全部 `text` 块，按顺序）。 */
  assistantTexts: string[];
  /** ⭐ 该轮内的 memj 注入（**已去重**）。 */
  injections: KeptMessage[];
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
declare function splitTurns(messages: readonly unknown[] | undefined): Turn[];
/** 一次组装的结果。 */
interface ContextAssembly {
  /** 背景部分（历史轮 + 当前轮的用户输入/正文/注入）。 */
  background: string;
  /**
   * ⭐⭐ **本步刚结束的那段思考** —— JEV 判相关性的**唯一判据**（用户 2026-09-26 的设计意图：
   * *"除了这个段落，其他都只是背景信息而已，要根据这个段落去判断才对"*）。
   * 🔴 实测：把它独立成字段并在提问里点名 ⇒ 96/96 条候选分数**全部上升**（均值 +0.085~0.109）。
   */
  thinking: string;
  /** 合成文本（`chat` 通路用；= thinking 段 + background 段）。 */
  text: string;
  /** 保留了几轮（含当前轮）。 */
  keptTurns: number;
  /** 一共有几轮。 */
  totalTurns: number;
  /** 从较早的历史裁掉了几轮。 */
  droppedTurns: number;
  /** ⭐ 是否已经裁到"只剩本轮"（**地板**：当前轮永不裁）。 */
  atFloor: boolean;
  /** 估算 token（按 `text` 算，即实际发出去的量）。 */
  tokens: number;
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
declare function assembleContext(opts: {
  messages: readonly unknown[] | undefined;
  currentReasoning: string;
  reasoningCap: number;
  /** 上下文预算（token）；**0 = 不检查**（尽量多放）。 */
  budgetTokens: number;
}): ContextAssembly;
/** 一条候选的**总**成本（输入 + 输出）。 */
declare function estimateCandidateTokens(count: number): number;
/** 拆批编排的结果。 */
interface InjectionPlan {
  /** 合成上下文（`chat` 通路用）。 */
  context: string;
  /** ⭐ 判据段（`jev` 通路的 `current_thinking` 字段）。 */
  thinking: string;
  /** 背景段（`jev` 通路的 `background` 字段）。 */
  background: string;
  /** ⭐ **拆好的批**（每批一个请求；`jev` 并发发出）。 */
  batches: Candidate[][];
  /** 上下文组装明细。 */
  ctx: ContextAssembly;
  /** 总预算（一次请求的上限；0 = 不检查）。 */
  totalBudget: number;
  /** 上下文的名义预算（`activeInjectContextTokens`）。 */
  contextBudget: number;
  /** 上下文实际占用的 token。 */
  contextTokens: number;
  /** 每批的估算 token。 */
  perBatchTokens: number[];
  /** 实际需要的批数。 */
  batchesNeeded: number;
  /** ⚠️ 需要的批数**超过了并发旋钮**（上下文已压到地板仍不够）。 */
  batchesOverKnob: boolean;
  /** 是否超预算（按"最大那一批"算）。 */
  overBudget: boolean;
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
declare function planInjection(opts: {
  messages: readonly unknown[] | undefined;
  currentReasoning: string;
  reasoningCap: number;
  pool: Candidate[];
  /** **单次请求**的总预算（token，含输入与输出）；**0 = 不检查**。 */
  totalBudget: number;
  /** 上下文的名义预算（token）。 */
  contextBudget: number;
  /** 并发批数上限（`<= 1` ⇒ 不拆批）。 */
  maxBatches: number;
}): InjectionPlan;
//#endregion
//#region src/active-recall.d.ts
/** 读最近一次预算/拆批编排的诊断。 */
declare function lastBudgetDiagnostic(): InjectionPlan | undefined;
/** 一条候选（**来自索引，不回读封面** —— B 方案的速度前提）。 */
interface Candidate {
  id: string;
  project: string;
  theme: string[];
  kind: string;
  /** 中文标题（**注入文本用它**，§7.3）。 */
  title: string;
  desc: string;
  /** 英文标题（**只给模型看**：召回质量用）。 */
  titleEn: string;
  descEn: string;
}
/** 一次召回的结论。 */
interface RecallOutcome {
  /** 是否要注入（`false` = 不注入）。 */
  need: boolean;
  /** 选中的条目（**已按清单顺序**、已去重、已越界过滤）。 */
  picks: Candidate[];
  /**
   * ⭐⭐ **本次候选被拆成了多批并发发出**（`batches.length > 1`）。
   *
   * 🔴 **这个名字换过两次，因为机制换过两次**（⚠️ 别照旧名理解）：
   * | 名字 | 当时的机制 | 依据 |
   * |---|---|---|
   * | `prefilted` | 本地**相关性**粗筛（`lexicalPrefilter`，已删） | 候选超 240 硬顶 |
   * | `trimmedByBudget` | **按预算裁候选池**（`trimCandidates`，已删） | 超 token 预算 |
   * | **`batched`（现在）** | ⭐ **拆成多批并发**，**一条候选都不丢** | 用户 2026-09-26 方案 |
   * ⚠️ 共用旧名字会让人推错结论（实测踩过：把"超预算裁了"读成"相关性筛过"）。
   */
  batched: boolean;
  /** 评估了多少条候选。 */
  evaluated: number;
  /** 池子里**原本**有多少条（= 该范围下的全部候选，**未裁剪时**等于 `evaluated`）。 */
  pool: number;
  /** 召回耗时（毫秒）。 */
  ms: number;
  /** 非空 = 本次没调模型（拿不到路由 / 无候选 / 额度用尽 …）。 */
  skipped: string;
  /** ⭐ **被抑制**（第一步判定"不需要"）—— 与 `skipped` 分开，因为**不计入额度**（§7.4）。 */
  suppressed: string;
  /**
   * ⭐⭐ **本次是否真的把请求发出去了**（花了钱）—— 额度口径的**唯一依据**（§7.4②）。
   *
   * 🔴 **计数规则**（用户 2026-09-26 裁定的那张表，逐行照做）：
   * | 情形 | `called` | `suppressed` | 计不计额度 |
   * |---|---|---|---|
   * | 真正发生的调用 | `true` | `''` | ✅ **计** |
   * | **被抑制的**（第一步判定"不需要"） | `true` | 非空 | ❌ **不计** |
   * | 因"没路由 / 索引不可用 / 无候选"跳过 | `false` | — | ❌ 不计 |
   *
   * ⚠️ **不能只看 `called`**：被抑制的那次**也发了请求**（钱花了），但用户明确裁定
   * **不计额度** —— 理由见 `activeInjectMaxCallsPerTurn` 的注释（否则一个 turn 前 3 步
   * 很容易全被抑制，后面"模型摸清情况后"最有价值的那几步反而一次判断都没有）。
   */
  called: boolean;
  /** 模型自报的理由（**仅在 `activeInjectExplain` 打开时**才有）。 */
  why: string;
  /**
   * ⭐⭐ **三个总控 `noul` 分数**（2026-09-27 新增）—— 召回日志要留痕的那些。
   *
   * 🔴 **为什么把它从函数里带出来**：这三个数**本来就算过了**
   *    （`gateMax('need')` / `gateMax('sufficient')` / `gateMax('search_intent')`），
   *    但**算完就丢** ⇒ 调阈值时**没有分布可看**（实测只能拿单点猜）。
   *    ⚠️ 只在 JEV 通路有值；chat 通路（模型自己给结论）拿不到分数 ⇒ `undefined`。
   */
  scores?: {
    need?: number;
    sufficient?: number;
    searchIntent?: number;
  };
  /**
   * ⭐ B：**发给模型的请求快照**（召回日志的可重放档用）。
   *
   * ⚠️ **只在 `activeRecallLogRequest` 打开时才会被填** ——
   *    否则每步数十 KB 的上下文会把磁盘写爆。
   */
  request?: {
    state: unknown;
    questionKeys: string[];
    batch?: {
      index: number;
      total: number;
    };
  };
}
/** 索引里的全部活跃封面（**顺序稳定**：`scanLibrary()` 的写入顺序 ⇒ 追加式缓存的前提）。 */
declare function allCandidates(idx: EnIndex): Candidate[];
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
declare function candidatesForScope(idx: EnIndex, pid: string, scope: string): Candidate[];
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
declare function effectiveScope(scope: string, channel: string, narrow: boolean): string;
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
declare function renderManifest(pool: Candidate[], english: boolean): string;
/**
 * ⭐ **`system` 的固定头部**（身份 + 输出纪律 + 判断要求）。
 *
 * ⚠️ **这一段永不变** ⇒ 永远命中前缀缓存 ⇒ 放在**清单之前**。
 */
declare const JUDGE_HEAD: string;
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
declare function renderJudgeRules(sufficientGate: boolean, searchIntentGate: boolean): string;
/** 输出格式说明（`explain` 打开时多要一个 `why` —— **仅调试**）。 */
declare function renderOutputSpec(explain: boolean): string;
/**
 * ⭐⭐ **组装 `system`**（身份 + 纪律 + 要求 + **清单**）。
 *
 * 🔴 **顺序**：清单放**最末** ⇒ 身份/纪律/要求那几十个 token 永远命中，
 *    清单变化时**只损失它自己那一段**。
 * ⚠️ **`system` 必须存在** —— WorkBuddy 上游硬要求（首条非 `system` 会 400 `code 11128`）。
 */
declare function buildSystemPrompt(opts: {
  pool: Candidate[];
  english: boolean;
  sufficientGate: boolean;
  searchIntentGate: boolean;
  explain: boolean;
}): string;
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
declare function buildUserPrompt(context: string, topK: number, note?: string): string;
/** 一次解析的结果。 */
interface ParsedJudge {
  need: boolean;
  /** 原始编号（**未**越界过滤，便于测试断言）。 */
  picks: number[];
  why: string;
  /** 非空 = 解析失败（**静默跳过本次召回，绝不影响主会话**）。 */
  error: string;
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
declare function parseJudgeOutput(text: string, n: number, explain: boolean): ParsedJudge;
/**
 * 把编号映射回候选（**按清单顺序**输出 ⇒ 注入文本顺序稳定）。
 * @param picks - 1-based 编号。
 * @param pool - 候选（与清单同序）。
 * @param topK - 上限。
 */
declare function pickCandidates(picks: readonly number[], pool: Candidate[], topK: number): Candidate[];
/** 拆 `provider/model`（⚠️ **首个 `/`**：模型名里可能还有 `/`，如 `tencent/Hunyuan-MT-7B`）。 */
declare function splitRoute(s: string): {
  provider: string;
  model: string;
} | undefined;
/**
 * ⭐ `chat` 通路最近一次调用的**诊断**（排障用，进 `/active` 的 detail）。
 *
 * 🔴🔴 **为什么必须有它**（2026-09-26 实测踩到的真实缺口）：
 *    端到端跑出 `ms=13 / detail="模型输出为空"` —— **13 毫秒根本发不出一次网络请求**，
 *    但我**无法从任何地方看出到底发生了什么**（是拿不到 llm？是抛异常？
 *    是只回了 reasoning 没有 text？还是被 maxTokens 截断在思考里？）。
 *    ⇒ 于是"模型输出为空"这一个笼统结论，把**四种完全不同的故障**混成了一条消息。
 *    ⭐ 本项目铁律：**可观测性不是可选项** —— 排障时最缺的就是"当时到底收到了什么"。
 *
 * ⚠️ 只记**最近一次**（内存、不落盘、随进程消失）：这是排障信息，不是业务数据。
 */
interface ChatDiag {
  at: string;
  provider: string;
  model: string;
  /** 两次尝试的结果（`off` = 带关思考档位；`plain` = 不带）。 */
  tries: Array<{
    kind: 'off' | 'plain';
    /** 流是否抛了异常；抛了就记消息。 */
    error: string;
    /** 收到的块类型（如 `['reasoning']` = **只有思考、没有正文**）。 */
    kinds: string[];
    /** 取到的正文长度。 */
    chars: number;
    ms: number;
  }>;
}
/** 读最近一次 chat 调用的诊断（`/active` 用）。 */
declare function lastChatDiagnostic(): ChatDiag | undefined;
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
declare const JEV_CANDIDATE_INSTRUCTION: string;
/** JEV 的"是否需要"提问（英文）。 */
declare const JEV_NEED_INSTRUCTION = "Does the current context need external knowledge from the list to do this work well?";
/** JEV 的"已有知识是否充足"提问（英文；§6.3）。 */
declare const JEV_SUFFICIENT_INSTRUCTION: string;
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
declare const JEV_SEARCH_INTENT_INSTRUCTION: string;
/**
 * ⭐⭐ **JEV 调用结果**：答案 + **可重放的请求快照**（2026-09-27）。
 *
 * 🔴 **为什么要把 `state`/`questions` 一起带回来**：召回日志的 B 档
 * （`activeRecallLogRequest`）要能**重放**某次召回，而请求体是在 {@link callJev}
 * **内部**拼的 —— 若不带出来，调用方就只能再拼一遍 ⇒ **两份实现必然漂移**
 * （本项目铁律："同一判据只有一份实现"）。
 */
interface JevCallResult {
  /** 模型的答案（各问句的 `noul`）；上游没回 `answers` 时 `undefined`。 */
  answers: Record<string, {
    noul?: unknown;
  }> | undefined;
  /** ⭐ 真正发出去的请求体（`state`）；可用于重放。 */
  state: unknown;
  /** ⭐ 问了哪些键（`need` / `sufficient` / `search_intent` / `c0..cN`）。 */
  questionKeys: string[];
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
declare function callJev(opts: {
  ctx: Context;
  config: MemjConfig;
  /** ⭐ 判据段（本步刚结束的思考）。 */
  thinking: string;
  /** 背景段（历史轮 + 当前轮的用户输入/正文/注入）。 */
  background: string;
  pool: Candidate[];
  sufficientGate: boolean;
  searchIntentGate: boolean;
  model: string;
  /**
   * ⭐⭐ **本次要用的端点与凭据名**（2026-10-07 多 provider 化）。
   * ⚠️ 由调用方从 `activeDecisionOf(config)` 解出来传进来 —— **不在这里自己读
   *    `config.activeInjectJevEndpoint`**：那是旧单 provider 的键，
   *    多 provider 下会指向错的端点（同族坑：`4a7b1931` 记过"走错端点"）。
   */
  endpoint: string;
  keyRef: string;
}): Promise<JevCallResult | undefined>;
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
declare function resolveJevKey(ctx: Context, config: MemjConfig, keyRefOverride?: string): Promise<string | undefined>;
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
declare function recall(opts: {
  ctx: Context;
  config: MemjConfig;
  /** 会话绑定的项目 id（空 = 未绑定 ⇒ `project*` 范围跳过）。 */
  project: string;
  /** ⭐ `llm/stream` 的 `options.messages` 快照（预算要在内存里按它算）。 */
  messages: readonly unknown[] | undefined;
  /** ⭐ **本步刚结束的那次思考**（当前轮保留；历史轮的思考按方案丢弃）。 */
  currentReasoning: string;
  /** ⭐ **本会话模型的上下文窗口**（tokens；chat 通路的 60% 靠它）。拿不到时 `undefined`。 */
  contextWindow?: number | undefined;
}): Promise<RecallOutcome>;
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
declare function budgetTokensFor(config: MemjConfig, contextWindow: number | undefined): number;
/**
 * ⭐⭐ **注入文本的收尾指令**（条目 `ee1034ef`）。
 *
 * 🔴 **为什么必须写硬**：注入的是**背景知识，不是任务** ——
 *    没有收尾指令时，模型会自作主张地"用上"它们（去读正文、去改库、去补全）。
 * ⚠️ **放在渲染函数末尾** ⇒ 保证每个变体都带上。
 */
declare const ACTIVE_CLOSING_INSTRUCTION = "---\n\n⭐ **以上是背景知识，不是任务**；结合上述知识继续当前工作。";
declare const ACTIVE_HEADER = "⭐ **以下是知识库里与当前工作相关的知识（主动召回）。**";
declare const ACTIVE_BODY_HINT = "只给标题与描述，**正文按需读** —— 用 `memj_read` 传 `id`。";
/**
 * ⭐⭐ **渲染注入文本**（由 **memj 自己**渲染，不靠模型排版 —— §6.2）。
 *
 * ⚠️ 用的是**清单里那份中文 title/desc** ⇒ **逐字一致**，不会漂移、不会编造。
 * @param picks - 选中的条目。
 * @param note - 可选的前置说明（如"本次是主动召回"）。
 */
declare function renderActiveInjection(picks: readonly Candidate[], note?: string): string;
//#endregion
//#region src/active-inject.d.ts
/** 一次召回的排队项。 */
interface QueuedPick {
  at: string;
  turn: number;
  /** 选中的条目（**已过输出校验**）。 */
  picks: Candidate[];
  /** 召回耗时（毫秒，供页面显示）。 */
  ms: number;
  /** 本次是**粗筛后**的结果（粗筛会漏 ⇒ 如实显示）。 */
  batched: boolean;
  evaluated: number;
  pool: number;
  /** ⚠️ 恒为 `false`（排队 ≠ 注入；真正的计数在注入那一刻 —— 见 `noteInjection`）。 */
  counted: boolean;
  /** TTL 定时器（消费/过期时清掉）。 */
  timer: ReturnType<typeof setTimeout>;
}
/** 本会话最近一次召回的状态（供"实时状态"页显示）。 */
interface ActiveLastRecall {
  at: string;
  turn: number;
  /** 结论：`injected` / `suppressed` / `skipped` / `empty`。 */
  kind: string;
  /** 给人看的一句话。 */
  detail: string;
  /** 本次注入了哪些 id（`kind==='injected'` 时有值）。 */
  injected: string[];
  /** 召回耗时。 */
  ms: number;
  batched: boolean;
  evaluated: number;
  pool: number;
  /**
   * ⭐⭐ **这一次算不算一次"注入"**（§7.4② 的计数口径，**逐次如实**）。
   *
   * 🔴 2026-09-27：口径从"占用调用额度"改成"**算一次注入**"（用户裁定：
   *    *"每轮最多 3 次注入，没有注入的不算次数。"*）——
   *    ⇒ 只有 `kind === 'injected'` 的那一笔才是 `true`，其余一律 `false`。
   *
   * 🔴 **为什么值得单独存一个字段**（2026-09-26 实测教训）：
   *    我用"看到 `kind=suppressed` 就断言额度为 0"去验口径，结果**假失败**了 ——
   *    因为累计值是**本 turn** 的，而那个 turn 里**之前**已经有过真的注入。
   *    ⚠️ 即：**从"累计值"反推"这一次计没计"是不可靠的**（它混了历史）
   *    ⇒ ⭐ **把这一事实直接记在这一次的结论上**，让判据**可观测**而不是靠推断。
   */
  counted: boolean;
}
/** ⭐ 主动注入的运行时状态（**纯内存**，进程重启即失）。 */
interface ActiveRuntimeState {
  /** `sessionId → 待注入队列`（下一个 `pre-step` 消费）。 */
  queue: Map<string, QueuedPick>;
  /**
   * `sessionId → 最近一次出网时窗口里已有哪些封面 id`。
   *
   * 🔴 **必须来自 `llm/stream` 的 `options.messages`** —— `decision.messages` 只是
   *    **本轮 claimed、不含历史**，用它判断会**永远 false**（§7.2 第 2 条）。
   */
  windowPresent: Map<string, Set<string>>;
  /** `sessionId → 当前 turn`（条件监听不含 turn，用它打戳）。 */
  currentTurn: Map<string, number>;
  /**
   * `sessionId → 当前 step`（⭐ 2026-09-27 新增，给召回日志定位用）。
   *
   * 🔴 **为什么需要**：`llm/stream` 的 `options` **不含 step**
   *    （只有 `sessionId`），而召回是从那个监听器里触发的 ⇒ 想让日志能说清
   *    "**哪一步**判的"，只能从 `agent/pre-step` 把 `step` 记下来中转。
   *    ⚠️ 与 `currentTurn` 同款理由、同款写法（条件监听拿不到这两个值）。
   */
  currentStep: Map<string, number>;
  /**
   * `sessionId → 本 turn 已【真正注入】的次数`（§7.4②）。
   *
   * 🔴🔴 **口径（2026-09-27 更正：从"调用"改成"注入"）** —— 用户原话：
   *    *"每轮最多 3 次注入，没有注入的不算次数。"*
   *    ⇒ **只有真的把知识注进会话才 +1**。被抑制的、没选出条目的、
   *      选中但全在窗口里（去重后为空）的，**一律不计**。
   *    ⚠️ 旧口径"每 turn 最多调几次模型"会让额度**提前耗光**（详见 `injectionsLeft`）。
   */
  injections: Map<string, {
    turn: number;
    n: number;
  }>;
  /**
   * ⭐⭐ `sessionId → 已经为哪个 turn 做过"提交触发"的召回`（2026-09-29 新增）。
   *
   * 🔴 **为什么需要**：`pre-step` 在一个 turn 里会跑**很多次**
   *    （实测一个 turn 有 5~8 个 step），而"用户提交"只发生在**第一步**。
   *    ⇒ 若不加这道去重，就会变成"**每个 step 都用同一句用户输入召回一次**"
   *      （严重的重复调用与浪费）。
   * ⭐ 判据：**只在 turn 变化后的第一次 `pre-step`** 里做提交触发。
   *    ⚠️ 记的是 **turn 号**（不是布尔）—— 新 turn 一来，号变了 ⇒ 自动又能触发。
   */
  submitTriggered: Map<string, number>;
  /** `sessionId → 最近一次召回的结论`（页面用）。 */
  last: Map<string, ActiveLastRecall>;
  /**
   * ⭐⭐ `sessionId → 本会话模型的上下文窗口`（tokens）。
   *
   * 用途：chat 通路的预算 = **窗口的 60%**（用户裁定）。
   * ⚠️ `GenerateOptions` 不含它，只能在出网时用 provider/model 换一次后**存下来**。
   */
  contextWindows: Map<string, number>;
  /** ⚠️ 连续告警去重（本项目纪律：**高频警报会脱敏**）。 */
  warned: Set<string>;
  /**
   * `sessionId → 最近一次**真的注入了**的记录`（§7.1 的"这个会话注入了多少"）。
   *
   * 🔴🔴 **为什么要与 `last` 分开**（2026-09-26 实测抓到的真缺陷）：
   *    一个 turn 有 5~8 个 step ⇒ **注入之后还会有新的召回**（下个 step 的思考又触发一次）。
   *    那些后续召回（queued / suppressed / skipped）会**把 `last` 覆盖掉**
   *    ⇒ 于是"这个会话到底注入过没有"**永远看不出来**
   *    （实测：日志里明明有注入事件、`/active` 却显示 `queued`）。
   * ⭐ 判据：**"最近一次召回"与"最近一次注入"是两件事** ——
   *    前者是过程，后者是**结果**；页面要回答的是后者。
   */
  lastInjection: Map<string, ActiveLastRecall>;
  /** `sessionId → 本会话累计注入次数 / 条数`（页面显示"注入了多少"）。 */
  injectTotals: Map<string, {
    times: number;
    entries: number;
    at: string;
  }>;
}
/** 全局单例（**同一进程内共享** —— `api.ts` 的 `/active` 要读它，见 `hotState` 的同款理由）。 */
declare const activeState: ActiveRuntimeState;
/** ⚠️ 仅供测试：清空内存态（**不改磁盘**）。 */
declare function resetActiveState(): void;
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
declare function isThoughtEnd(chunk: unknown, strict: boolean): boolean;
/** 从 chunk 里取本次思考的**完整文本**（`block-end` 的 `chunk.block` 是完整块）。 */
declare function reasoningTextOf(chunk: unknown): string;
/** 累加 `reasoning-delta`（§6.5 的另一种攒法）。 */
declare function deltaTextOf(chunk: unknown): string;
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
declare function registerActiveInjection(opts: {
  ctx: Context;
  config: MemjConfig;
}): boolean;
/**
 * ⭐ 给"实时状态"页用的只读快照（**最近一次召回**）。
 *
 * ⚠️ 它与 {@link lastInjectionOf} 是**两件事**：这个是"最近一次判断"，
 *    那个是"最近一次真的注进去"（前者会被后续召回覆盖、后者不会）。
 * @param sid - 会话 id。
 * @returns 最近一次召回；没有时 `undefined`。
 */
declare function activeSnapshot(sid: string): ActiveLastRecall | undefined;
/**
 * ⭐ **最近一次真的注入**（不会被后续召回覆盖 —— 见 `lastInjection` 的注释）。
 * @param sid - 会话 id。
 */
declare function lastInjectionOf(sid: string): ActiveLastRecall | undefined;
/** 本会话累计注入（次数 / 条数 / 时刻）；一次都没注入过时 `undefined`。 */
declare function injectTotalsOf(sid: string): {
  times: number;
  entries: number;
  at: string;
} | undefined;
/**
 * 本 turn 已**真正注入**的次数（页面显示"额度用了几个"）。
 *
 * 🔴 2026-09-27：口径从"调用次数"改成"**注入次数**"（用户原话：
 * *"每轮最多 3 次注入，没有注入的不算次数。"*）⇒ 函数名与语义同步改。
 * @param sid - 会话 id。
 */
declare function activeInjectionsUsed(sid: string): number;
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
declare function snapshotWindow(messages: readonly unknown[]): Set<string>;
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
declare function extractUserSubmit(messages: readonly unknown[], maxChars: number): string;
//#endregion
//#region src/hot.d.ts
/** 当前文件格式版本（与 `hot/` 下四个文件共用）。 */
declare const HOT_FILE_VERSION = 1;
/** 设置所属的层（⚠️ **2026-09-22 后只有 `global` 会落到 `entries.json`**）。 */
type HotLayer = 'global' | 'project' | 'theme';
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
declare function defaultEntrySetting(layer?: HotLayer): HotEntrySetting;
/**
 * 读全部画像条目（**保序**）。
 *
 * ⚠️ **不做任何过滤**——`on: false` 的也返回（页面要显示它、允许再次打开）。
 * 过滤由调用方（渲染层）按 `on` 做。
 * @returns 画像条目数组；文件缺失/损坏时为空数组。
 */
declare function loadPersona(): Promise<HotPersonaItem[]>;
/** 覆盖写全部画像条目。 */
declare function savePersona(items: readonly HotPersonaItem[]): Promise<void>;
/**
 * 生成一个画像条目 id（本地即可，**不必**是封面 UUID）。
 * ⚠️ 前缀 `p-` 让它一眼区别于封面 id（后者是纯 UUID）。
 * @returns 新 id。
 */
declare function newPersonaId(): string;
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
declare function loadEntrySettings(): Promise<Record<string, HotEntrySetting>>;
/**
 * ⭐ 取某一**条**的设置；**没有记录 ⇒ 返回"不纳入"的默认值**（裁定 H-1）。
 * @param all - 已读出的全部设置。
 * @param entryId - 封面 id。
 * @param layer - ⚠️ **已不再影响结果**（保留只为签名兼容，见 `defaultEntrySetting`）。
 * @returns 该条的设置（永远是完整形状）。
 */
declare function settingOf(all: Readonly<Record<string, HotEntrySetting>>, entryId: string, layer?: HotLayer): HotEntrySetting;
/** 覆盖写全部逐条设置。 */
declare function saveEntrySettings(entries: Readonly<Record<string, HotEntrySetting>>): Promise<void>;
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
declare function loadSelections(): Promise<Record<string, HotProjectSelection>>;
/** 覆盖写全部项目清单。 */
declare function saveSelections(projects: Readonly<Record<string, HotProjectSelection>>): Promise<void>;
/**
 * ⭐ **保留多少个会话绑定**（裁定 H-4：留最新 50 个，按最新活跃时间倒序淘汰）。
 *
 * 🔴 **淘汰只动这个文件，绝不删 DSH 的会话数据**——
 * 官方持久化层**根本没有删除接口**（README 明文 "Nothing deletes session files"），
 * 归档也只是不可逆的显示过滤 ⇒ 我们更不该越界删用户的会话。
 */
declare const HOT_SESSION_KEEP = 50;
/** 读会话绑定文件的**完整内容**（含三个判定开关）。 */
declare function loadSessionsFile(): Promise<HotSessionsFile>;
/** 覆盖写会话绑定文件。 */
declare function saveSessionsFile(file: HotSessionsFile): Promise<void>;
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
declare function pruneSessions(sessions: Readonly<Record<string, HotSessionBinding>>, keep?: number): {
  kept: Record<string, HotSessionBinding>;
  dropped: string[];
};
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
declare function touchSession(sessionId: string, nowIso: string): Promise<boolean>;
/**
 * ⭐ 写一个会话的**绑定**（并顺手淘汰超量的旧绑定）。
 * @param sessionId - 会话 id。
 * @param binding - 绑定内容。
 */
declare function setSessionBinding(sessionId: string, binding: HotSessionBinding): Promise<{
  dropped: string[];
}>;
/**
 * ⭐ 取一个会话的绑定（**不落盘、不新建**）。
 * @param sessionId - 会话 id。
 * @returns 绑定；没有则 `undefined`。
 */
declare function getSessionBinding(sessionId: string): Promise<HotSessionBinding | undefined>;
//#endregion
//#region src/hot-inject.d.ts
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
declare const HOT_CLOSING_INSTRUCTION: string;
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
declare const HOT_BODY_CLOSING_INSTRUCTION: string;
declare const HOT_HEAD_FIRST = "## memj 热知识（本次会话相关）";
declare const HOT_HEAD_SUPPLEMENT = "## memj 热知识（补充）";
declare const HOT_DIRECT_SECTION = "### 直接可用的内容（画像 + 正文形态的知识）";
declare const HOT_META_HINT = "⭐ **以下只给标题与描述，正文按需读**——用 `memj_read` 传 `id` 取正文。";
/**
 * 一条待注入的条目（渲染层的输入单元）。
 *
 * ⚠️ **`type` 与 `layer` 不是一回事**（页面要分别显示）：
 * · `layer` = 它**从哪来**（全局表 / 本项目 / 所属主题），决定排在注入文本哪一段；
 * · `type`  = 页面上的**类型标签**（画像 / 全局知识 / 主题知识 / 项目知识）。
 * 现在两者一一对应，但画像**没有 cover** ⇒ 它只能是 `type`、没有 `layer`。
 */
interface HotItem {
  cover: Cover;
  /** 该条的设置（已补默认值）。 */
  setting: HotEntrySetting;
  /** 它属于哪一层——决定它排在注入文本的哪一段。 */
  layer: 'global' | 'project' | 'theme';
  /**
   * ⭐ **最后置顶时间**（ISO）；**空串 = 未置顶**。
   *
   * 🔴 **为什么不在 `setting` 里**：`setting` 是 `entries.json` 的形状（只管全局知识），
   * 而**置顶是逐项目属性**（存 `selection.json`）⇒ 两者来源不同，硬塞进一个结构
   * 会让"全局层恒为空、项目层才有值"这件事看不出来。
   * ⚠️ 全局层的 `pinnedAt` **恒为空**（全局知识本来就每次都注入，没有排序问题）。
   */
  pinnedAt: string;
}
/** 渲染结果：两段分开（`full` 与画像同段，`meta` 各自成组）。 */
interface HotRenderResult {
  /** 注入文本；**没有任何内容时为空串**（调用方据此决定要不要注入）。 */
  text: string;
  /** 统计（供页面与预算用）。 */
  counts: {
    personaFull: number;
    entryFull: number;
    globalMeta: number;
    projectMeta: number;
    themeMeta: number;
    /** `meta` 形态的总字符数（**只算渲染出来的行**）。 */
    metaChars: number;
    /** `full` 形态的总字符数（正文原文）。 */
    fullChars: number;
  };
  /**
   * ⭐⭐ **本次真正参与渲染的条目**（供「会话实时状态」页显示）。
   *
   * ⚠️ **这是"打算注入的"**（= 收集 + 过滤 + 渲染的结果），
   * **不是"模型窗口里真的还有的"**——后者要问 `hotState.windows` 的快照。
   * 页面必须把这两件事分开显示（本项目一贯：**不撒谎**）。
   */
  preview: HotPreviewItem[];
  /**
   * ⭐⭐ **补注模式下按形态拆开的两段文本**（用户 2026-09-24 裁定）。
   *
   * - `bodyText` = 画像 + `full` 条目（内容已在眼前）⇒ 收尾是
   *   `HOT_BODY_CLOSING_INSTRUCTION`（"…但不是任务…"）；
   * - `metaText` = 各 meta 组（只给标题描述）⇒ 收尾是 `HOT_CLOSING_INSTRUCTION`
   *   （含"正文按需 `memj_read`"）。
   *
   * ⚠️ **只在 `renderHotText({supplement: true})` 时才有值**；
   *    首次全量注入**不设**它们（那时合成一条 `text`，与改动前逐字一致）。
   * ⚠️ 调用方要**各 push 一条消息**（否则两段收尾又会混在一起，等于没拆）。
   */
  bodyText?: string;
  metaText?: string;
}
/**
 * ⭐⭐ **一条"本次参与注入"的条目 —— 供页面显示**（会话实时状态页的列表数据源）。
 *
 * 🔴 **为什么要有这个结构**（2026-09-22 用户报告后加）：
 * 原来看门狗只把**封面 id 数组**（`expected: string[]`）交给页面
 * ⇒ 页面列表里**只有一串裸 UUID**：没有标题、看不出类型、看不出形态，
 * 而且**画像根本没有 id** ⇒ 它在列表里**没有位置**（永远看不见）。
 * ⇒ 用户原话："*列表还是需要以可读的列表形式展现……应该要展示出标题、类型
 * （画像、全局知识、主题知识、项目知识），注入形式（正文形态、标题形态），
 * 注入状态（已注入、未注入）*"。
 *
 * ⚠️ **`id` 对画像为空串**：画像没有封面 id ⇒ 用 `fp`（指纹）当它的身份。
 */
interface HotPreviewItem {
  /** 封面 id；⚠️ **画像为空串**（它没有封面）。 */
  id: string;
  /**
   * ⭐ **页面上的类型标签**：`persona`（画像）/ `global`（全局知识）/
   * `project`（项目知识）/ `theme`（主题知识）。
   */
  type: 'persona' | 'global' | 'project' | 'theme';
  /** 标题；⚠️ 画像取正文首行（与「全局热知识」页的画像是同一显示口径）。 */
  title: string;
  /** 注入形态：`full`（正文形态）｜ `meta`（标题形态）。 */
  shape: HotShape;
  /** 这条的**判定指纹**（封面 id，或画像的文本指纹）——页面用不到，供服务端自己核。 */
  fp: string;
}
/**
 * 渲染一行 `meta` 形态的条目（**与 `inject.ts` 的 `renderKnowledgeLine` 同形**）。
 *
 * ⚠️ **行里本来就带完整 id** ⇒ 看门狗**不需要额外字符成本**就能做指纹（方案 §6.2）。
 * @param c - 封面。
 * @returns markdown 行。
 */
declare function renderMetaLine(c: Cover): string;
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
declare function personaFingerprint(text: string): string;
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
declare function renderHotText(persona: readonly HotPersonaItem[], items: readonly HotItem[], bodies?: ReadonlyMap<string, string>, opts?: {
  /**
   * ⭐⭐ **只渲染指纹在这个集合里的条目**（省略 = 全部）。
   *
   * 🔴 **为什么需要它**（用户 2026-09-24 报的 bug）：补注时**只该发缺的那几条**，
   *    而本函数原来**只有"渲染全部"一种模式** ⇒ `decideInjection` 算出了 `missing`
   *    却只能发全量 `text` ⇒ **每次补注都变成全量重注入**（实测：只缺 1 条也重发 4271 字符）。
   * ⚠️ **判据用指纹**（封面 id / 画像文本指纹），与看门狗、重建**同一套**（实现只留一份）。
   */
  only?: ReadonlySet<string>;
  /**
   * ⭐ **补注模式**：标题用「补充」措辞、且**分形态返回两段**（各带各的收尾）。
   * 省略 = 首次全量注入（合并成一条，行为与改动前**逐字一致**）。
   */
  supplement?: boolean;
}): HotRenderResult;
/**
 * ⭐ **收集"本次该注入哪些条目"**（判定 → 取条目 → 过滤 → 排序）。
 *
 * 分层规则（方案 §3.1，**累加**）：
 * - **全局**：封面 `global === true`（已批准）；
 * - **项目**：封面 `project === 该项目` **且在项目清单里**；
 * - **主题**：该项目文档 `themes:` 下**其它项目**的封面 **且在项目清单里**
 *   ⚠️ **要去重**（同一张可能既属本项目又挂本项目主题 ⇒ 只出一次）。
 *
 * 🔴🔴 **2026-09-22 改（用户裁定）—— 三层的"开关"不再一样**：
 *
 * | 层 | 纳入判据 | 形态 / 置顶从哪来 |
 * |---|---|---|
 * | **全局** | `entries.json` 的 `on`（**缺省纳入**） | 同一个 `entries.json`（全局只有一份，合理） |
 * | **项目 / 主题** | ⭐ **在项目清单里 = 纳入**（**没有第二道 `on`**） | ⭐ **`selection.json` 的 `entries[i]`**（逐项目） |
 *
 * ⚠️ **为什么项目/主题层不再看 `entries.json`**：旧设计里它们是"在清单里 ∧ `on`"
 * 两道**串行**开关，而 `on` 缺省 `false` ⇒ 实测**选中 11 条、注入 0 条**；
 * 且 `on` 的入口在**另一个子页**（「全局热知识」）还叫"纳入" ⇒ 用户**无从察觉**。
 * ⇒ 现在"在清单里 = 会注入"，**界面上所见即所得**。
 *
 * ⚠️ **还有一道过滤**：必须**不是** `kind: 'history'`
 * （它不参与任何面向模型的展示）—— `scanLibrary()` 默认已排除，天然成立。
 *
 * ⚠️⚠️ **2026-10-13 起多第二道：不是 `kind: 'chat'`** —— ⭐ 但它与 `history`
 * **走的路不同，别混**：
 *   · `history` ⇒ `scanLibrary()` 默认排除（**列表也不要它**）；
 *   · `chat`   ⇒ **列表要它**（用户裁定「chat 出现在知识库列表里」）
 *     ⇒ `scanLibrary()` **不能**排除 ⇒ 只能由**本函数在入口过滤**（`snapshotForModel`）。
 * 🔴 判据：**"进列表"与"进模型上下文"是两条路** ——
 *    想排除某类条目时，先问"列表要不要它"，再决定改哪一处；
 *    改错一处 ⇒ 要么列表点不开（改 `scanLibrary`），要么模型看到会话流水（不改这里）。
 *
 * ⚠️ **排序**：置顶优先（按 `pinnedAt` 倒序），其余保持清单原顺序。
 * @param projectId - 该会话判定的项目（`未知` 时只收全局层）。
 * @returns 待注入条目（未渲染）。
 */
/**
 * ⭐⭐ **评分模式的读取选项**（决策 177 / 182）。
 *
 * 🔴 **为什么做成一个具名类型、四处共用**：它在 `buildHotInjection` /
 *    `decideInjection` / `previewForSession` / `api.ts` **四处**出现 ——
 *    ⚠️ 各写一份必然漂移（本项目已因"同一份判据多份实现"出过多次事故，
 *    最近一次就是这四处**忘了传 `score`**，见决策 181）。
 * @property on - 是否启用评分模式（`true` ⇒ 项目/主题层换成"有效分前 N 名"）。
 * @property windowHours - 滚动窗口小时数。
 * @property topN - 取前几名。
 * @property gate - ⭐ 是否启用入围门槛（决策 182）；省略 = 不设门槛。
 * @property gateMinScore - 分数门槛。
 * @property gateLastTurn - 是否放行"上一轮刚加入的"（`false` ⇒ 纯分数门槛）。
 */
interface ScoreReadOpts {
  on: boolean;
  windowHours: number;
  topN: number;
  gate?: boolean;
  gateMinScore?: number;
  gateLastTurn?: boolean;
}
declare function collectHotItems(projectId: string,
/**
 * ⭐ 评分模式的配置（决策 177）。
 *
 * ⚠️ **可选**：不传 ⇒ 走**原清单路径**（保持所有既有调用点/测试不变）。
 *    ⭐ 这与本项目"新增可选项不要改所有调用点"的做法一致；
 *    而 `pre-step` 那条真实路径**会传**（见 `hot-watch.ts`）。
 */
scoreOpts?: ScoreReadOpts): Promise<HotItem[]>;
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
declare function detectProjectByDocReads(sessionId: string, knownProjects: readonly string[]): Promise<{
  project: string;
  at: string;
}>;
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
declare function parseGetHandoffFromEvents(events: readonly unknown[], knownProjects: readonly string[]): {
  project: string;
  atMs: number;
};
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
declare function detectProjectBySessionLog(ctx: {
  get: (name: string) => unknown;
}, sessionId: string, knownProjects: readonly string[]): Promise<{
  project: string;
  source: 'handoff' | 'get-handoff' | '';
  at: string;
}>;
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
declare function parseHandoffFromEvents(events: readonly unknown[], knownProjects: readonly string[]): {
  project: string;
  atMs: number;
};
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
declare function effectiveChannel(channel: HotChannel, layer: HotItem['layer']): {
  channel: HotChannel;
  downgraded: boolean;
};
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
declare function fingerprintsInText(text: string, wanted: readonly string[]): Set<string>;
/**
 * 从文本里**扫出所有 uuid 形状的串**（`/g` + `matchAll`；见 `fingerprintsInText` 的注释）。
 *
 * ⭐ **导出它**，是为了让主动注入的"窗口快照"能**共用同一份形状定义**：
 *    那边要扫的是"**所有**出现过的封面 id"（不预设待找列表），用法不同、
 *    但**什么算一个 id** 必须只有一处定义 —— 否则两个判据会各认各的
 *    （本项目铁律：同一判据只能有一份实现）。
 */
declare const UUID_SCAN: RegExp;
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
declare function fingerprintsFromInjectionEvents(events: readonly unknown[], fps: readonly string[]): {
  present: Set<string>;
  at: string;
};
/**
 * ⭐ 某条是否该走 `section` 通道（**画像与全局层才可能**）。
 *
 * @deprecated 🔴 **本函数全项目零调用，且名字与实现对不上**
 * （它叫 `isSection`，判的却是 `shape`）——两个问题都在，留着会误导。
 * 真要判"走不走 section"，用 `effectiveChannel(setting.channel, layer)`。
 * ⚠️ **暂不删**：`test-hot.mjs` 可能引用它；等二期做 `section` 通道时一并清理。
 */
declare function isSectionShape(shape: HotShape): boolean;
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
declare function buildHotInjection(sessionId: string, projectId: string, opts?: {
  only?: ReadonlySet<string>;
  supplement?: boolean;
  /**
   * ⭐ 评分模式（决策 177）：给了且 `on` ⇒ 项目/主题层换成"有效分前 N 名"。
   * ⚠️ 不传 ⇒ 原清单路径（既有调用点与测试不受影响）。
   */
  score?: ScoreReadOpts;
}): Promise<HotRenderResult & {
  items: HotItem[];
}>;
//#endregion
//#region src/hot-watch.d.ts
/** 一次出网的窗口快照：**这个会话这次带了哪些注入内容的 id**。 */
type WindowSnapshot = {
  /** 本次出网消息里出现的**本次应注入条目**的 id（✅ 还在窗口里）。 */
  present: Set<string>;
  /** 判定发生的时刻（ISO，供页面显示"这是哪一次的结果"）。 */
  at: string;
  /** 本次判定的会话（便于页面核对）。 */
  sessionId: string;
  /**
   * ⭐ **本会话用的模型的上下文窗口**（tokens）；取不到时 `undefined`。
   *
   * 🔴 **为什么要顺手记**：`GenerateOptions` **不含** `contextWindow`
   * （已核实：它只在 `LlmModelContext` 上）⇒ 只能在出网时用
   * `ctx.llm.resolveModelInfo(provider, model)` 换一次。
   * ⚠️ 而网页 API（`/hot`）**拿不到 agent / 模型对象**（`deps` 只有四个字段）
   * ⇒ 这个值**必须存下来**，否则预算只能永远用回落值。
   */
  contextWindow?: number;
};
/**
 * ⭐ **热知识注入的运行时状态**（**纯内存**，进程重启即失）。
 *
 * 🔴 **为什么是内存**：
 * - 窗口快照只对"当前这几步"有意义，落盘反而会读到过期数据；
 * - 与之配套的**持久状态（绑定/清单/设置）在 `hot/` 四个文件里**，
 *   两者职责不同（本项目一贯：**状态走落盘、过程走内存**）。
 *
 * 🔴 **为什么必须是模块级单例**（而不是 `apply()` 的闭包）：见 `api.ts` 的约束——
 * `handleApi` 的 `deps` 只有 `{version, config, baseUrl, pluginId}`，
 * **API 层拿不到会话/agent 对象** ⇒ "实时状态"页要读的内存态
 * **只能放在一个两边都够得着的地方**。本模块就是那个地方。
 */
interface HotRuntimeState {
  /** `sessionId → 最近一次出网的窗口快照`。 */
  windows: Map<string, WindowSnapshot>;
  /** `sessionId → 最近一次注入的统计`（供"实时状态"页显示）。 */
  lastInject: Map<string, {
    at: string;
    /** 本次**补注**了哪些 id（空 = 全都在窗口里、一条没补）。 */
    injected: string[];
    /** 本次**应注入**的全部 id（含已在窗口里的）。 */
    expected: string[];
    /** 注入文本的字符数（0 = 没注入）。 */
    chars: number;
    project: string;
  }>;
  /** ⚠️ 连续告警去重（本项目纪律：**高频警报会脱敏** ⇒ 只在状态变化时报）。 */
  warnedNoProject: Set<string>;
}
/** 全局单例（**同一进程内共享**；见上方的"为什么必须"）。 */
declare const hotState: HotRuntimeState;
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
declare function idsInWindow(messages: readonly unknown[] | undefined, ids: readonly string[]): Set<string>;
/** 一次 `pre-step` 注入的决策结果（**纯数据**，便于单测）。 */
interface InjectionDecision {
  /** 要注入的文本；**空串 = 本次不注入**。 */
  text: string;
  /** 本次补注的 id（= 应注入 ∖ 已在窗口）。 */
  injected: string[];
  /** 本次应注入的全部 id。 */
  expected: string[];
  /** 判定的项目。 */
  project: string;
  /**
   * ⭐⭐ **按形态拆开的两段**（用户 2026-09-24 裁定）——
   * 调用方应当**各 push 一条消息**，让两种形态各带各的收尾。
   * - `bodyText` = 画像 + `full` 条目（收尾是"…但不是任务…"）；
   * - `metaText` = 各 meta 组（收尾含"正文按需 `memj_read`"）。
   * ⚠️ 都为空 = 本次不注入（与 `text === ''` 同义）。
   */
  bodyText: string;
  metaText: string;
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
declare function decideInjection(sessionId: string, projectId: string, present: ReadonlySet<string> | undefined, ctx?: {
  get: (name: string) => unknown;
},
/**
 * ⭐ 评分模式（决策 177）：`on` ⇒ 项目/主题层换成"有效分前 N 名"。
 * ⚠️ 不传 ⇒ 原清单路径（既有调用点与测试不受影响）。
 */
score?: ScoreReadOpts): Promise<InjectionDecision & {
  rebuilt?: WindowSnapshot;
}>;
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
declare function resolveProject(ctx: {
  get: (name: string) => unknown;
}, sessionId: string): Promise<{
  project: string;
  source: string;
  at: string;
}>;
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
declare function resolveContextWindow(ctx: Context, options: {
  provider?: unknown;
  model?: unknown;
}, cached: number | undefined): Promise<number | undefined>;
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
declare function rebuildWindowFromSessionLog(ctx: {
  get: (name: string) => unknown;
}, sessionId: string, fps: readonly string[]): Promise<WindowSnapshot | undefined>;
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
declare function previewForSession(ctx: {
  get: (name: string) => unknown;
}, sessionId: string, score?: ScoreReadOpts): Promise<{
  project: string;
  source: string;
  expected: string[];
  items: HotPreviewItem[];
  chars: number;
  window: WindowSnapshot | undefined;
  /** ⭐ 窗口快照是**从会话日志重建**的（内存里没有）——页面据此如实说明来源。 */
  windowFromLog: boolean;
}>;
/** ⚠️ 仅供测试：清空内存态（**不改磁盘**）。 */
declare function resetHotState(): void;
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
declare function registerHotInjection(opts: {
  ctx: Context;
  /**
   * ⚠️ 只声明**自己用到的**配置字段（本模块不读全量配置）。
   * ⭐ 决策 177 加了三个评分字段（`pre-step` 要把它们传给 `decideInjection`）。
   * ⭐⭐ 决策 182 又加了**门槛**两个字段。
   */
  config: {
    hotInject: boolean;
    hotScoreOnTurnEnd: boolean;
    hotScoreWindowHours: number;
    hotScoreTopN: number;
    hotScoreGateMinScore: number;
    hotScoreGateLastTurn: boolean;
  };
}): void;
//#endregion
//#region src/tag-vocab.d.ts
/** 词表里一个规范词。 */
interface CanonicalTag {
  /**
   * 同义词（**指向这个 canonical** 的所有写法）。
   *
   * ⚠️ **可以含其它语言**（`silent failure` 也能当 alias）——语言不是这里的轴，
   * **同义才是**（决策 162）。库里 613 个中文 tag 是既成事实，**不强制英文**。
   */
  aliases: string[];
  /**
   * ⭐ 英文规范词（**给 JEV 这类中文不好的模型用**，用户 2026-09-28 要求）。
   *
   * 🔴 **它是【派生字段】，不是独立词表** —— 由 C 层从 canonical **1:1 翻译**而来
   * ⇒ 库里**不存在自由生长的英文 tag** ⇒ **无需对英文做归一**（没有分裂的可能）。
   * ⭐ 做成 canonical 上的字段还有个好处：**删 canonical 时它跟着走，不留孤儿**。
   * ⚠️ 空串 = 还没生成（不是错误）。
   */
  en: string;
}
/** 词表。 */
interface TagVocabulary {
  version: 1;
  /** ⭐ 水位线：上次处理到什么时候（`updatedAt > lastRunAt` 才算新的）。 */
  lastRunAt: string;
  /** 规范词 → 信息。 */
  canonical: Record<string, CanonicalTag>;
}
/** 空词表（首次使用）。 */
declare function emptyVocabulary(nowIso: string): TagVocabulary;
/**
 * 读词表；不存在或损坏 ⇒ `undefined`（**不抛**）。
 *
 * ⚠️ **损坏时回 `undefined` 而不是空表**：空表会让调用方以为"库里一个词都没有"，
 * 从而把**全库 tag 当新词**重新裁决一遍（白花一大笔 token，还可能得出不同结论）。
 * ⇒ 判据：**"读不出来"与"确实是空的"必须区分**。
 * @returns 词表；不存在/损坏时 `undefined`。
 */
declare function loadVocabulary(): Promise<TagVocabulary | undefined>;
/** 原子写词表（`mode 0o600`，与 `en-index.json` 同手法）。 */
declare function saveVocabulary(vocab: TagVocabulary): Promise<void>;
/**
 * 建一张「词 → canonical」的反查表（**含 canonical 自身**）。
 *
 * ⭐ **canonical 自身也映射到自己**：这样 `resolveTag` 对"已经是规范词"的输入
 * 返回它自己，调用方**不必先判它是不是 canonical**（少一处漏判的机会）。
 * @param vocab - 词表。
 * @returns 反查表。
 */
declare function aliasIndex(vocab: TagVocabulary): Map<string, string>;
/**
 * ⭐⭐ **解析一个 tag 到它的 canonical**（纯查表，**零 LLM**）。
 *
 * ⇒ 这是「应用层」的核心：**便宜、可对全库跑**。
 * @param tag - 原始 tag。
 * @param idx - `aliasIndex()` 的产物。
 * @returns canonical；**词表里没有**时 `undefined`（= 待裁决的新词）。
 */
declare function resolveTag(tag: string, idx: ReadonlyMap<string, string>): string | undefined;
/**
 * 检出 alias 冲突（同一 alias 指向多个 canonical）。
 *
 * 🔴 **必须报错而不是"后来者覆盖"**：那会让裁决结果取决于**对象键序**
 * （同一份词表两次读可能给出不同结果），是最难查的一类不一致。
 * @param vocab - 词表。
 * @returns 冲突清单（alias + 它指向的多个 canonical）。
 */
declare function findAliasConflicts(vocab: TagVocabulary): Array<{
  alias: string;
  targets: string[];
}>;
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
declare function resolveMerges(merge: Readonly<Record<string, string>>): {
  ok: true;
  map: Record<string, string>;
} | {
  ok: false;
  cycle: string[];
};
/**
 * 应用合并后的 canonical 是否会**自相矛盾**（两个 canonical 并到同一个目标）。
 *
 * ⚠️ 这**不是错误**（合法且常见），但调用方要**把它们合成一条**——
 * 否则会留下两个 canonical 指向同一目标，`aliasIndex` 就会报冲突。
 * @param vocab - 词表。
 * @param merges - 已解析的合并映射（`resolveMerges` 的产物）。
 * @returns 新的 `canonical` 表（canonical 自身被并走时，其 aliases 归到目标名下）。
 */
declare function applyMerges(vocab: TagVocabulary, merges: Readonly<Record<string, string>>): TagVocabulary;
//#endregion
//#region src/tag-normalize.d.ts
/** 一次规范化的范围选项。 */
interface NormalizeOptions {
  /** 覆盖水位线：只处理此时间之后更新过的（ISO）。 */
  since?: string;
  /** 无视水位线，全库重跑。 */
  full?: boolean;
  /** 正文给不给、给多少（默认 `'truncated'`）。 */
  includeBody?: 'none' | 'truncated' | 'full';
  /** `true` = 只看不改。 */
  preview?: boolean;
}
/** 一个「待裁决」的候选 tag 及其证据。 */
interface PendingTag {
  tag: string;
  /** ⭐ **全库频次**（不是范围内的）——让模型知道这个词有多 established。 */
  count: number;
  /**
   * ⭐ 它**已经在词表里**吗（= 是个已有的规范词或别名）。
   *
   * 🔴 **只是给模型的信息，不是过滤条件** —— 词表是**选项清单**：
   *    "已经在里面"意味着模型**可以复用它**，**不等于**"它不用被裁决"。
   */
  inVocabulary: boolean;
  /** 它出现在哪些条目上（只带 id 与标题，正文另按开关附）。 */
  samples: Array<{
    id: string;
    title: string;
    project: string;
  }>;
}
/** 一条待改的条目。 */
interface AffectedEntry {
  id: string;
  project: string;
  from: string[];
  to: string[];
  /** ⭐ 若是 `retag` 改的，带上模型的理由（供人复核）。 */
  retagWhy?: string;
}
/** 一次规范化的完整结果。 */
interface NormalizeResult {
  ok: boolean;
  /** 给人/模型看的回执。 */
  message: string;
  /** 水位线之后（或全库）参与裁决的条目数。 */
  scanned: number;
  /** 待裁决的候选 tag（B 层的输入）。 */
  pending: PendingTag[];
  /**
   * 词裁决。⚠️ **值都带"为什么"**（用户要求：改/删/新增必须给理由；
   * 缺理由的决定会被硬校验丢掉，并记进 `rejected`）。
   */
  decided: {
    /** `tag` → 合并目标。 */
    merged: Record<string, string>;
    /** `tag` → 合并理由。 */
    mergeWhy: Record<string, string>;
    /** `tag` → 新增理由。 */
    added: Record<string, string>;
    /** `tag` → 丢弃理由。 */
    dropped: Record<string, string>;
  };
  /** ⭐ 按正文修正过的条目（`retag`）：`id` → 新 tag 列表 + 理由。 */
  retagged: Array<{
    id: string;
    from: string[];
    to: string[];
    why: string;
  }>;
  /** ⚠️ 被硬校验丢弃的决定（缺理由 / 越界 / 已在词表里还 add…）。 */
  rejected: string[];
  /** 待改（或已改）的条目。 */
  affected: AffectedEntry[];
  /** C 层补了几条英文。 */
  translatedEn: number;
  /** `true` = 只预览、没写库。 */
  previewOnly: boolean;
  /** 词表统计（回执用）。 */
  vocabStats: {
    canonical: number;
    aliases: number;
    withEn: number;
  };
}
/** 从模型输出里抠出第一个 JSON 对象（容忍 ```json 围栏与前后噪音）。 */
declare function extractJson(text: string): unknown;
/**
 * 跑一次规范化（三层）。
 * @param ctx - 插件上下文（B/C 层要调模型）。
 * @param config - 配置。
 * @param opts - 范围与开关。
 * @returns 结果（含回执）。
 */
declare function normalizeTags(ctx: Context, config: MemjConfig, opts?: NormalizeOptions): Promise<NormalizeResult>;
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
declare function seedVocabulary(vocab: TagVocabulary, tags: readonly string[]): number;
//#endregion
//#region src/tag-auto.d.ts
/** 自动规范化的结果（**只用于日志/诊断**，不影响任何人）。 */
interface AutoNormalizeOutcome {
  /** 是否真的发起了子代理。 */
  started: boolean;
  /** 没发起时的原因（**可判定**的一句话，便于排障）。 */
  reason: string;
  /** 发起成功时的子会话 id。 */
  childId?: string;
}
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
declare function startNormalizeSubagent(ctx: Context, config: MemjConfig, parent: unknown): Promise<string | undefined>;
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
declare function registerTagAutoNormalize(opts: {
  ctx: Context;
  config: MemjConfig;
}): boolean;
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
declare function maybeAutoNormalize(ctx: Context, config: MemjConfig, payload: {
  agent?: {
    id?: unknown;
  };
  turn?: unknown;
}): Promise<AutoNormalizeOutcome>;
//#endregion
//#region src/tag-auto-state.d.ts
/**
 * 一条"本会话最近一次落了知识的 handoff"记录。
 *
 * ⚠️ **只有一个槽位**（按会话）而不是一个历史列表：我们只需要"**最后一次**落知识的轮次"，
 *    保留历史会让文件无界增长（且没有任何判据需要更早的那些）。
 */
interface TagAutoState {
  /** 版本（将来改结构时用它判断）。 */
  version: 1;
  /** `会话 id` → 该会话**最近一次落了知识**的 handoff 记录。 */
  sessions: Record<string, {
    /** 那次 handoff 所在的**轮次号**（⚠️ **只作诊断**，判据见 `pending`）。 */
    turn: number;
    /** 那次落了几条知识（诊断用）。 */
    written: number;
    /** 落知识的时刻（ISO）。 */
    at: string;
    /**
     * ⭐⭐⭐ **"这次落知识还没被规范化过"** —— 去重的**唯一判据**。
     *
     * 🔴 **为什么用"待消费"而不是"比对轮次号"**：
     *    轮次号从两处来 —— `handoff` 走 `turnOf()`（读 `turnBoundary` 投影），
     *    钩子走 `payload.turn`。两者**理论同源，但 `turnOf()` 拿不到时会返回 `-1`**
     *    ⇒ 那会让"轮次相等"**永远不成立** ⇒ **功能静默永不触发**
     *    （比现在这个 bug 更隐蔽）。
     *    ⇒ ⭐ 改用**不依赖编号一致**的语义：**落知识时置 `pending: true`；
     *      轮次结束时消费掉（置 `false`）**。语义正好是
     *      "**落知识那一轮的轮次结束时，起一次**"。
     */
    pending: boolean;
  }>;
}
/** 空状态。 */
declare function emptyTagAutoState(): TagAutoState;
/**
 * 读状态。⚠️ **文件不存在/损坏一律回空**（与 `loadVocabulary` 不同：
 * 那个回 `undefined` 表示"没播种过"，这里有明确语义 —— "什么都不知道"）。
 * @returns 状态（永不抛）。
 */
declare function loadTagAutoState(): Promise<TagAutoState>;
/**
 * 写状态（原子：先写临时文件再 rename）。
 * ⚠️ 失败**只记日志、不外溢**（同本模块一贯纪律）。
 * @param st - 状态。
 */
declare function saveTagAutoState(st: TagAutoState): Promise<void>;
/**
 * ⭐⭐⭐ **记一笔"本轮落了知识"**（由 `handoff` 在**落盘成功后**调用）。
 *
 * 🔴 **必须在确认写了知识之后调**（`knowledgeWritten > 0`），否则门② 就没意义了。
 * @param sessionId - 会话 id。
 * @param turn - 轮次号（⚠️ 判据的单位）。
 * @param written - 落了几条。
 * @returns 无（失败只记日志）。
 */
declare function noteKnowledgeWritten(sessionId: string, turn: number, written: number): Promise<void>;
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
declare function decideTagAuto(opts: {
  enabled: boolean;
  /** 该会话的记账（`undefined` = 本会话没落过知识）。 */
  record: TagAutoState['sessions'][string] | undefined;
}): {
  start: boolean;
  reason: string;
};
/**
 * 纯函数：**消费掉"待规范化"标记**（返回**新**状态，不改入参）。
 * @param st - 当前状态。
 * @param sessionId - 会话 id。
 * @returns 新状态（无记录时原样返回）。
 */
declare function markNormalized(st: TagAutoState, sessionId: string): TagAutoState;
//#endregion
//#region src/subagent-origin.d.ts
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
/**
 * 记下"这个子会话是我（插件）发起的"。
 *
 * ⚠️ 必须在**拿到子会话 id 之后立刻**调用 —— 子代理的首个 `pre-step`
 *    可能几乎同时发生。
 * @param childId - 子会话 id（`run.id`）。
 */
declare function markPluginSpawned(childId: string): void;
/**
 * 这个会话是不是**插件自己发起**的子代理？
 *
 * @param sessionId - 会话 id。
 * @returns `true` = 插件发起（**不继承**父会话项目）；`false` = 别处发起（可继承）。
 */
declare function isPluginSpawned(sessionId: string): boolean;
/** ⚠️ 仅供测试：清空登记表（生产代码不该调）。 */
declare function clearPluginSpawnedForTest(): void;
//#endregion
//#region src/hot-score.d.ts
/**
 * ⭐⭐⭐ **知识评分：纯函数层**（决策 177；2026-09-29 用户裁定）。
 *
 * ── 一句话 ────────────────────────────────────────────────────────────────
 * 每个项目维护一张**知识分数表**；轮次结束时由子代理调 JEV 评「**这一轮里
 * 哪些已有知识本来能帮上忙**」，过阈值的**按档加分**；热知识注入时把
 * **有效分前 N 名**注入（开关打开时替换原清单）。
 *
 * ── 与「主动注入」的分工（⭐ 别混，它们互补）─────────────────────────────
 * | | 时机 | 判据 | 回答的问题 |
 * |---|---|---|---|
 * | 主动注入 | 思考后、**实时** | 当下那段思考 | 「**现在**需要什么」 |
 * | **本模块** | 轮末、**复盘** | 整轮内容 + 项目背景 | 「这个项目**长期**该带什么」 |
 *
 * ── 🔴🔴 本文件最要紧的一条设计：**存【事件列表】，不存「分数 + 时间戳」** ──
 * 用户要的是**滚动窗口**（*"只有比如 30 个小时内有过加分的知识才留下"*）。
 * ⚠️ 若存成 `{ score, lastAt }`，下列情形会算错：
 * ```
 * t=0h  +3   →  score=3, lastAt=0h
 * t=29h +1   →  score=4, lastAt=29h      ← 表面看"4 分、6 小时前刚加过"
 * t=35h      →  按 lastAt 判：还没过期 ⇒ 仍算 4 分
 *              但真相：t=0 那次已出窗（35h > 30h）⇒ 只该剩 1 分
 * ```
 * ⇒ ⭐ **必须逐事件判过期**：`有效分 = 窗口内各事件的 delta 之和`。
 *
 * ── ⭐ 为什么分档加分、而不是直接加分数值 ────────────────────────────────
 * 库内知识 `9ed5626a` 明确写着：**`noul` 是有序档位的期望、数值刻度弱，
 * 不要拿它做数值插值，只用于过阈值**。
 * ⇒ 拿 0.93 与 0.71 的差值当"加几分"是**误用**（两者语义差别没那么大）。
 * ⇒ 分档：`≥0.9 → +3`｜`≥0.8 → +2`｜`≥阈值 → +1`。
 *
 * @module dsh-memj/hot-score
 */
/** 一次加分事件（⚠️ **不可合并** —— 合并就退化成"分数 + 时间戳"，见文件头）。 */
interface ScoreEvent {
  /** ISO 时刻。 */
  at: string;
  /** 这次加的分（1 / 2 / 3）。 */
  delta: number;
  /** JEV 给的原始 `noul` 分（排障用：可看出"为什么只加了 1 分"）。 */
  score: number;
  /** 发生在第几个 turn（排障用）。 */
  turn: number;
}
/** 一条知识的评分记录。 */
interface EntryScore {
  events: ScoreEvent[];
}
/** 一个项目的评分表。 */
interface ProjectScore {
  /** 本表最后一次更新时刻（ISO）。 */
  updatedAt: string;
  /**
   * ⭐⭐⭐ **最近一次"真的加了分"的评分所在轮次**（决策 182）。
   *
   * 🔴 **为什么必须是【项目级】而不是从条目的 events 里推**：
   *    "最近一次评分"是**整个项目**的概念 —— 而每个条目自己的最后一个事件
   *    可能是很久以前的（它这几轮都没被选中）⇒ 拿条目级的最大 turn 当"最近一次"
   *    **会把老事件误判成新事件**。
   * ⚠️ **语义是"最近一次有加分的评分"**：一条都没加分的轮次**不会**推进它
   *    （那种轮次调用方压根不写盘）—— ⭐ 这正是我们要的（"上一轮加入的"指的是
   *    **真的有知识加入**的那一轮）。
   * ⚠️ **旧数据没有这个字段** ⇒ 读取时兜底成"全部事件里的最大 turn"（见 `lastRunTurn`）。
   */
  lastTurn?: number;
  /** `条目 id → 评分记录`。 */
  entries: Record<string, EntryScore>;
}
/** `<库根>/hot/scores.json` 的结构。 */
interface ScoreFile {
  version: number;
  projects: Record<string, ProjectScore>;
}
/** 当前文件版本（将来改结构时用它做迁移判据）。 */
declare const SCORE_FILE_VERSION = 1;
/** 空文件。 */
declare function emptyScoreFile(): ScoreFile;
/**
 * ⭐⭐ **按 JEV 的分数算"该加几分"**（分档；见文件头的理由）。
 *
 * | 分数 | 加分 |
 * |---|---|
 * | **`< threshold`** | **0**（一分不加 —— ⚠️ **先判这一条**） |
 * | `≥ threshold` | **+1** |
 * | `≥ 0.8` | **+2** |
 * | `≥ 0.9` | **+3** |
 *
 * 🔴🔴 **阈值必须【先】判，再判档位** —— 这是我第一版写错的地方，
 *    而它是本项目 `决策 172`（"一个键兼两个语义"）的**同族**：
 *    ```ts
 *    // ❌ 错：档位在前 ⇒ 阈值被架空
 *    if (score >= 0.9) return 3
 *    if (score >= 0.8) return 2
 *    if (score >= threshold) return 1
 *    ```
 *    ⚠️ 后果：阈值设成 **0.85** 时，**0.82 仍然得 2 分** ——
 *    阈值对它上面的两档**完全失效**（用户调高阈值却拦不住 0.8~0.85 的）。
 *    ⇒ ⭐ **阈值是硬门**（用户原话：*"只有超过阈值的，才加分"*），
 *      过了门**才**按档位分。
 *    ✅ 本项目的单元测试正是**用 `deltaFor(0.82, 0.85) === 1` 这条断言**抓到的。
 *
 * ⚠️ **`threshold` 高于 0.8 时，中间那档自然取不到**（因为 0.8~threshold 那段已被门挡住）——
 *    这是**设计内行为**，不是 bug；⚠️ 别去"修"它。
 * @param score - JEV 的 `noul` 分。
 * @param threshold - 过线阈值（默认取配置里的 `hotScoreThreshold`）。
 * @returns 加几分（0 / 1 / 2 / 3）。
 */
declare function deltaFor(score: number, threshold: number): number;
/**
 * ⭐⭐ **滚动窗口的判定**：这个事件还在窗口内吗？
 *
 * ⚠️ **边界取"含"**（`at >= now - window`）—— 本项目一贯要求"边界类判据要留容差"，
 *    而这里用"含"就是那个容差（否则恰好在边界上的那次加分会被吃掉）。
 * @param at - 事件时刻（ISO）。
 * @param nowMs - 当前时刻（epoch ms）。
 * @param windowHours - 窗口小时数。
 * @returns 是否还在窗口内。
 */
declare function inWindow(at: string, nowMs: number, windowHours: number): boolean;
/**
 * ⭐⭐⭐ **算一条知识的【有效分】**（= 窗口内各事件的 delta 之和）。
 *
 * 🔴 **必须逐事件判**（不能拿 `lastAt` 代表全部 —— 见文件头的反例）。
 * @param score - 该条知识的评分记录。
 * @param nowMs - 当前时刻（epoch ms）。
 * @param windowHours - 窗口小时数。
 * @returns 有效分；窗口内无事件时 `0`。
 */
declare function effectiveScore(score: EntryScore | undefined, nowMs: number, windowHours: number): number;
/**
 * **清掉出窗的事件**（写入时调用 ⇒ 文件不会无限长）。
 *
 * ⭐ 读侧仍然要判窗口（`effectiveScore` 自己会判）——
 *    因为"清"只在**有写入时**才发生，中间可能隔很久。
 *    ⇒ ⭐ **清是"顺手瘦身"，判是"正确性"**，两者都不能省。
 * @param score - 该条知识的评分记录。
 * @param nowMs - 当前时刻。
 * @param windowHours - 窗口小时数。
 * @returns 只剩窗口内事件的新记录。
 */
declare function pruneEvents(score: EntryScore, nowMs: number, windowHours: number): EntryScore;
/** 一条"排好序的候选"（注入侧要用的最小信息）。 */
interface ScoredEntry {
  /** 条目 id。 */
  id: string;
  /** 窗口内有效分。 */
  score: number;
  /**
   * ⭐ 窗口内**最近一次**加分时刻（epoch ms；无事件时 `0`）。
   * 用于同分时的排序（决策 182）。
   */
  lastAt: number;
  /** ⭐ 窗口内**最高一次**的 turn（用于"上一轮加入的"那道门）。无事件时 `-1`。 */
  lastTurn: number;
}
/** `topScored` 的可选门槛（决策 182）。⚠️ 不传 ⇒ 保持旧行为（纯按分数取前 N）。 */
interface TopScoredOpts {
  /**
   * ⭐⭐ **入围门槛：或的关系**（用户裁定）。
   * - `minScore`：有效分 ≥ 这个值 ⇒ 入围；
   * - `lastTurn`：**最近一次评分**的轮次号 ⇒ 窗口内**最高 turn 等于它**的条目入围。
   * 两者**满足任一**即入围；两个都不给 ⇒ 全部入围。
   * ⚠️ **为什么不只是 AND/OR 里随便挑**：用户明确要"**上一轮加入的**
   *    *和* **超过 N 分的**才有机会入选" —— 那句"和"在中文里是"并且"的字面，
   *    但语义上是"**这两类都该有机会**"（门槛是"够格"而不是"同时满足"）。
   *    ⇒ ⭐ 按 **OR** 实现，并在配置注释里写明；⚠️ 若要 AND 改一行即可。
   */
  gate?: {
    minScore: number;
    lastTurn: number;
  };
}
/**
 * ⭐⭐⭐ **取有效分前 N 名**（注入侧就靠它决定"给哪几条"）。
 *
 * ⚠️ **只回 `score > 0` 的**：0 分表示"窗口内没被加过分"，
 *    它**不属于"有分数的知识"**（用户原话：*"自动注入这些有分数的知识"*）。
 *
 * ── 🔴🔴 排序口径（决策 182 改过，这是本函数最要紧的一段）──────────────────
 * 1. **分数降序**；
 * 2. ⭐ **同分时按【最近一次加分时间】降序**（`lastAt`）；
 * 3. 再同（都无事件或时间相同）⇒ **按 id 升序**兜底（保证确定性）。
 *
 * 🔴 **为什么第 2 条必须存在（这是实测出来的真问题）**：
 *    `chat` 通路**没有分数**（选中即 +1）⇒ 分数只能是 1/2/3… ⇒ **并列是必然的**。
 *    实测生产数据：**33 条有分，其中 25 条并列 1 分**，而位置只有 20 个
 *    ⇒ 旧实现（同分按 **id 字典序**）会把 **13 条"只是 id 排在后面"的丢掉** ——
 *    ⚠️ 那是**任意淘汰**，不是"选最相关的 20 条"。
 *    ⭐ 改成按时间 ⇒ "**刚被证明有用的优先**"，且**仍然确定性**（时间来自事件，不随机）。
 * @param project - 该项目的评分表（可能为 `undefined`）。
 * @param nowMs - 当前时刻。
 * @param windowHours - 窗口小时数。
 * @param topN - 取前几名。
 * @param opts - ⭐ 可选门槛（决策 182）；不传 = 旧行为。
 * @returns 按上述口径排序的条目。
 */
declare function topScored(project: ProjectScore | undefined, nowMs: number, windowHours: number, topN: number, opts?: TopScoredOpts): ScoredEntry[];
/**
 * **把一条知识在窗口内的事件聚合起来**（有效分 / 最近加分时刻 / 最高 turn）。
 *
 * ⚠️ 与 `effectiveScore` **同源判据**（都逐事件判窗口），只是多带回两个派生量 ——
 *    ⭐ 不另写一份"判窗口"的逻辑（本项目铁律：同一判据一份实现）。
 * @param score - 该条知识的评分记录。
 * @param nowMs - 当前时刻。
 * @param windowHours - 窗口小时数。
 * @returns 聚合结果（无窗口内事件时：`{score:0,lastAt:0,lastTurn:-1}`）。
 */
declare function aggregate(score: EntryScore | undefined, nowMs: number, windowHours: number): {
  score: number;
  lastAt: number;
  lastTurn: number;
};
/**
 * **把一批加分并进评分表**（纯函数；I/O 在 `hot-score-store.ts`）。
 *
 * ⚠️ 它**只加不删条目**：某条知识的有效分掉到 0 后，它的外壳仍留在文件里
 *    （`events` 被清空）。⭐ 这是**有意的** —— 删外壳需要"扫全库判断该不该删"，
 *    而空外壳的代价只是几百字节；⚠️ 但**读取侧必须按 `score > 0` 过滤**
 *    （`topScored` 已如此），否则空的也会被当成"有分数的知识"注入。
 * @param project - 原评分表（`undefined` = 新建）。
 * @param adds - `条目 id → { delta, score, turn }`。
 * @param nowIso - 当前时刻（ISO）。
 * @param nowMs - 当前时刻（epoch ms，用于顺手清出窗事件）。
 * @param windowHours - 窗口小时数。
 * @returns 新的评分表（不修改入参）。
 */
declare function applyAdds(project: ProjectScore | undefined, adds: ReadonlyArray<{
  id: string;
  delta: number;
  score: number;
  turn: number;
}>, nowIso: string, nowMs: number, windowHours: number): ProjectScore;
/**
 * ⭐⭐ **读"最近一次加分的轮次"**（决策 182）。
 *
 * 🔴 **旧数据没有 `lastTurn` 字段**（本决策之前写的 `scores.json`）⇒
 *    兜底成"**全部事件里的最大 turn**"。
 *    ⚠️ 那个兜底**不精确**（条目级的最大 turn 可能来自很久以前），但它是
 *    **唯一能用的近似**，且只会让门槛**更松**（多放几条进来）——
 *    ⭐ 按"失败模式不对称"（库内知识 `9d61d1e3`）：多给几条只是多花 token，
 *      而**少给**会让"刚加入的知识"被静默漏掉。选更松的那侧。
 * @param project - 该项目的评分表（可能为 `undefined`）。
 * @returns 轮次号；**一个事件都没有时 `-1`**（表示"没有可依据的轮次" ⇒ 该门不生效）。
 */
declare function lastRunTurn(project: ProjectScore | undefined): number;
//#endregion
//#region src/hot-score-store.d.ts
/**
 * ⭐⭐ **串行执行**一段异步逻辑（进程内互斥）。
 *
 * ⚠️ **失败不阻塞后续**：前一个任务抛错时，链仍然继续
 *    （否则一次失败会把后面所有写入永久卡死 —— 那比丢更新更糟）。
 * @param fn - 要串行执行的逻辑。
 * @returns `fn` 的返回值。
 */
declare function withScoreLock<T>(fn: () => Promise<T>): Promise<T>;
/**
 * **读整份评分表**。
 *
 * ⚠️ **任何异常都回空表**（照 `tag-auto-state` 的纪律：坏文件不该让功能整个挂掉）。
 *    🔴 但**不吞掉"结构不对"这件事** —— 版本不符时也当空表（见下）。
 * @returns 评分表（读不到时为空表）。
 */
declare function loadScoreFile(): Promise<ScoreFile>;
/** **原子写**（临时文件 + rename ⇒ 中途崩了不会留下半份文件）。 */
declare function saveScoreFile(f: ScoreFile): Promise<void>;
/**
 * ⭐⭐⭐ **一次原子的"读-改-写"**（加分会走这条）。
 *
 * @param mutate - 拿到**当前**项目表（可能 `undefined`），回新的项目表；
 *   回 `undefined` ⇒ **不写盘**（用于"没什么可加的"这类短路）。
 * @param projectId - 项目 id。
 * @returns 写入后的项目表（`undefined` = 本次没写）。
 */
declare function updateProjectScore(projectId: string, mutate: (cur: ProjectScore | undefined) => ProjectScore | undefined): Promise<ProjectScore | undefined>;
/** **读一个项目的评分表**（注入侧用；只读、不加锁）。 */
declare function readProjectScore(projectId: string): Promise<ProjectScore | undefined>;
//#endregion
//#region src/score-log.d.ts
/** 一次评分里**某条候选**的分数（⭐ 不截断：未过阈值的也要记）。 */
interface ScoredCandidateLog {
  /** 条目 id。 */
  id: string;
  /** JEV 给的 `noul` 分。 */
  score: number;
  /** 本次给它加了几分（0 = 没过阈值 ⇒ 没加）。 */
  delta: number;
}
/** **一次轮末评分**（一个 turn 一条）。 */
interface ScoreRunRecord {
  event: 'score';
  /** ISO 时刻。 */
  at: string;
  /** 会话 id（与文件名一致，便于把多份日志合起来看）。 */
  sessionId: string;
  /** 评的是第几个 turn。 */
  turn: number;
  /** 归属项目（⚠️ 判不出项目时不会评分 —— 分数是按项目存的）。 */
  project: string;
  /**
   * ⭐⭐ **本次走的哪条通路**（`chat` / `jev`；决策 178）。
   *
   * 🔴 **必须记**：两条通路的**产出契约不同**（JEV 给分数、chat 给"选中+理由"）
   *    ⇒ 看日志时若不知道走的是哪条，就**没法解释**"为什么没有分数"。
   */
  channel?: string;
  /** 候选池大小 / 实际评估条数（拆批时两者可能不同）。 */
  pool: number;
  evaluated: number;
  /** 拆了几批。 */
  batches: number;
  /** 耗时（毫秒）。 */
  ms: number;
  /**
   * ⭐⭐ **全部候选的分数**（**不只过阈值的**）。
   *
   * 🔴 它是本日志存在的主要理由 —— 调 `hotScoreThreshold` 唯一需要的分布。
   * ⚠️ 它**可能较大**（候选可达 240 条）⇒ 单行几十 KB。
   *    ⚠️ 但**一 turn 只有一条**（不像召回是每 step 一条）⇒ 量级可接受，不另设开关。
   */
  scores: ScoredCandidateLog[];
  /** ⭐ 本次真的加分的条目（`scores` 的子集，便于快速看结果）。 */
  added: Array<{
    id: string;
    delta: number;
    score: number;
  }>;
  /**
   * ⭐⭐ **当时的判据快照**（阈值 / 窗口 / 前 N）。
   *
   * 🔴 **必须记**（库内知识 `5b9bbc6e` 的原话）：日志是**跨版本长期**的 ——
   *    三个月后回看 `score 0.68 没加分`，**不知道 0.7 是不是当时的配置** ⇒ 那次判断无法复核。
   */
  thresholds: {
    /** 过线阈值。 */
    min: number;
    /** 滚动窗口小时数。 */
    windowHours: number;
    /** 注入取前几名。 */
    topN: number;
  };
  /** 失败/短路的可判定原因（成功时为空串）。 */
  note: string;
}
/**
 * 追加一条评分日志。
 *
 * 🔴 **绝不抛** —— 日志坏了不能连累评分（它与 `.startup-diag.txt` 同款纪律）。
 * ⚠️ **追加，不是重写**：`appendFile` 保证既有内容不动。
 * @param record - 记录。
 */
declare function appendScoreLog(record: ScoreRunRecord): Promise<void>;
/**
 * 读某会话的评分日志（供探针与排障用）。
 *
 * ⚠️ 与写侧对称：解析失败的**行跳过、不整份丢**。
 * @param sessionId - 会话 id。
 * @returns 记录数组（按写入顺序）；文件不存在时 `[]`。
 */
declare function readScoreLog(sessionId: string): Promise<ScoreRunRecord[]>;
//#endregion
//#region src/score-turn.d.ts
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
declare const JEV_SCORE_INSTRUCTION: string;
/** 一次评分的结果（供回执与测试）。 */
interface ScoreTurnResult {
  ok: boolean;
  /** 人可读的一句话（**回执就靠它** —— 用户要"显式看到过程和结果"）。 */
  message: string;
  /** 归属项目。 */
  project: string;
  /** 候选池 / 实际评估条数。 */
  pool: number;
  evaluated: number;
  /** 拆了几批 / 成功几批。 */
  batches: number;
  okBatches: number;
  ms: number;
  /** ⭐ 全部候选的分数（**不只过阈值的** —— 调阈值唯一需要的分布）。 */
  scores: ScoredCandidateLog[];
  /** ⭐ 本次加分的条目（含加几分与累计分）。 */
  added: Array<{
    id: string;
    title: string;
    delta: number;
    score: number;
    total: number;
    why?: string;
  }>;
  /** 失败或短路原因（成功时为空串）。 */
  note: string;
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
declare function readTurnContent(ctx: {
  get: (name: string) => unknown;
}, sessionId: string, turn: number): Promise<string>;
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
declare function scoreTurn(ctx: Context, config: MemjConfig, opts: {
  sessionId: string;
  turn: number;
  project: string;
}): Promise<ScoreTurnResult>;
/** ⭐ 导出给注入侧用：读某项目的"有效分前 N 名"。 */
declare function scoredEntryIds(projectId: string, config: MemjConfig, nowMs: number): Promise<string[]>;
//#endregion
//#region src/score-chat.d.ts
/** chat 通路的判定结果。 */
interface ChatScoreOutcome {
  /** 成功拿到可解析的输出。 */
  ok: boolean;
  /** 被选中的条目 id（已校验在池内、已去重、**且引文校验通过**）。 */
  picks: string[];
  /** ⭐ **每条的理由**（用户要求"给出理由"；键 = 条目 id）。 */
  reasons: Record<string, string>;
  /**
   * ⭐⭐ **每条入选的【原句引文】**（决策 183；键 = 条目 id）。
   * ⚠️ 它**已通过逐字校验**（`checkQuote`）—— 是"这条为什么入选"的**证据**。
   */
  quotes: Record<string, string>;
  /**
   * ⭐ **被引文校验丢掉的那些**（`{n, reason}`）。
   * 🔴 **必须如实报出**（库内知识 `5b9bbc6e` / `e4671756`）：
   *    它是"提示词够不够清楚"的**唯一反馈** —— 全被丢掉时，
   *    只有这个字段能区分"模型没引用"与"模型引用了但被我的归一化误杀"。
   */
  rejected: Array<{
    n: number;
    reason: string;
  }>;
  /** 原始正文（排障用）。 */
  raw: string;
  /** 失败/短路原因（成功时空串）。 */
  error: string;
}
declare const SCORE_QUOTE_RULE: string;
declare const SCORE_PICK_PRINCIPLE: string;
declare const SCORE_USER_TASK: string;
declare const SCORE_INDEX_RANGE: string;
declare const SCORE_POOL_HEADER: string;
/**
 * ⭐⭐ **`system`：判断要求 + 知识库清单**。
 *
 * ⚠️ **排布不能改**（§6.4 的硬约束）：清单是输入大头，必须与"每次都变的东西"分开，
 *    且 **`system` 里绝不能出现可配的 K**（K 一变 ⇒ 整份 `system` 失效 ⇒ 清单被拖出缓存）。
 * @param opts - 候选池 + 是否给理由 + 清单语言 + 超预算说明。
 * @returns `system` 文本。
 */
declare function buildChatScoreSystem(opts: {
  pool: Candidate[];
  /** ⭐ 是否要求给理由（用户要求"给出理由" ⇒ 默认 true）。 */
  wantReasons: boolean;
  /** 中文清单还是英文清单（⭐ 默认中文：判断"对项目有没有帮助"读母语更准）。 */
  english: boolean;
  /** 超预算时的如实说明（空串 = 不显示）。 */
  budgetNote: string;
}): string;
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
declare function buildChatScoreUser(turnContent: string, maxPicks: number): string;
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
declare function parseChatScore(raw: string, pool: Candidate[], wantReasons: boolean,
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
ctxForQuote?: string): ChatScoreOutcome;
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
declare function checkQuote(quote: unknown, context: string): {
  ok: boolean;
  reason: string;
  norm: string;
};
/**
 * ⭐ **引文的最短字符数**（决策 183）。
 *
 * ⚠️ 取 8 是个**折中**：太短（如 4）会让"随便抄几个字"就通过；太长（如 30）
 * 会让**短而准**的引用（"注入没触发"这种）被误杀。
 * ⭐ 按"失败模式不对称"（库内知识 `9d61d1e3`）：**误杀**只是少加一次分（下轮还会再来），
 *    而**放过**会让"改写"混进来、让这个门槛形同虚设 ⇒ 宁可略严。
 */
declare const MIN_QUOTE_CHARS = 8;
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
declare function scoreViaChat(ctx: Context, config: MemjConfig, opts: {
  turnContent: string;
  pool: Candidate[];
}): Promise<ChatScoreOutcome>;
//#endregion
//#region src/score-auto.d.ts
/** 一次自动评分发起的结果（**只用于日志/诊断**）。 */
interface AutoScoreOutcome {
  started: boolean;
  /** 没发起时的**可判定**原因（便于排障）。 */
  reason: string;
  childId?: string;
}
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
declare function decideAutoScore(opts: {
  enabled: boolean;
  /** 本会话的 `delegationDepth`（`> 0` = 它自己是子代理）。 */
  delegationDepth: number;
  /** 判出来的项目（空 = 判不出）。 */
  project: string;
  /** 该轮是否有可评分的内容（`text` 输出）。 */
  hasContent: boolean;
}): {
  start: boolean;
  reason: string;
};
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
declare function startScoreSubagent(ctx: Context, config: MemjConfig, parent: unknown, sessionId: string, turn: number): Promise<string | undefined>;
/**
 * ⭐⭐⭐ **挂上"轮末自动评分"的钩子**。
 *
 * 🔴 **开关关着 ⇒ 一个监听器都不挂**（照 `registerTagAutoNormalize`）——
 *    "挂上去再判 false"会**仍在事件链上占位**，且诊断行变成**假绿**。
 * @param opts - `ctx` 与配置。
 * @returns 是否真的挂上了。
 */
declare function registerAutoScore(opts: {
  ctx: Context;
  config: MemjConfig;
}): boolean;
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
declare function maybeAutoScore(ctx: Context, config: MemjConfig, payload: {
  agent?: {
    id?: unknown;
  };
  turn?: unknown;
}): Promise<AutoScoreOutcome>;
//#endregion
//#region src/context-report.d.ts
/**
 * ⭐⭐⭐ **上下文占用的读取**（决策 226；2026-10-12 用户裁定）。
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * 「上下文用到多少了」这件事，DSH **只对插件可见、不对模型可见**：
 * · `@deepseek-ai/dsh-compaction` 的 README 原文：*"**面向用户的命令，而非模型工具**——
 *   压缩由 `/compact` 命令与自动压力触发；**不会注册面向模型的压缩工具**"*；
 * · `@deepseek-ai/dsh-token-meter` 提供 `ctx.tokenMeter`，但它是**给插件用的 ctx 服务**
 *   （README 反复强调"不添加模型可见内容"）。
 * ⇒ ⭐ **判据：「插件能看到」≠「模型能看到」。**
 * 于是用户设想的「到 60% 就自动沉淀」**在纯提示词下不可能实现**——模型拿不到那个数。
 *
 * 本模块把那件事补上：**把占用率读出来，交给 `context-auto.ts` 每轮末如实报给模型**。
 *
 * ── 🔴 三条硬约束（都照本项目的既有纪律）────────────────────────────────────
 * 1. **取服务一律 `ctx.get('tokenMeter')`，不用属性访问** ——
 *    声明合并能让 `ctx.tokenMeter` 过 typecheck、运行时却是 `undefined`
 *    （库内真出过：`ctx.llm` 那次 ⇒ 表现是"结构对、内容缺"）。
 * 2. 🔴 **不 import `dsh-token-meter`** —— 它**不在本包的 `peerDependencies` 里**
 *    ⇒ 与 `credentials` 同处置：**只用结构化类型调它的方法**（库里已有这条纪律）。
 * 3. **拿不到就返回 `undefined`，绝不抛** —— 该服务可能压根没挂
 *    （无 agent-loop 的环境）⇒ 那时这个功能**静默不生效**，而不是把轮次弄挂。
 *
 * ── 用哪个数：`projectedTokens` 优先 ────────────────────────────────────────
 * `measure()` 回的 `ContextPressureProjection` 有三个字段（读 `projection.d.ts` 确认）：
 * · `pressureTokens` —— **最近一次请求**的 prompt 大小（provider 自报，**不含本轮输出**）；
 * · `projectedTokens` —— ⭐ **下一次请求**的 prompt 会是多少
 *   = `pressureTokens` + 采样之后 surface 的增减（**因此它能反映 compaction**，
 *   而 `pressureTokens` 单独做不到——压缩自己不产生 usage 报告）；
 * · `contextWindow` —— 最新记录的路由容量。
 *
 * ⇒ ⭐ **报给模型要用 `projectedTokens`**：模型要判断的是"我接下来还能装多少"，
 *   而不是"上一次请求花了多少"。⚠️ 但它可能缺席（还没有任何 provider 报过 usage）
 *   ⇒ 那时退回 `pressureTokens`。
 *
 * @module dsh-memj/context-report
 */
/** 一次上下文占用的测量结果（**只读、纯数据**）。 */
interface ContextUsage {
  /** 模型窗口大小（token）。⚠️ 路由没声明容量时缺席。 */
  window?: number;
  /** 当前占用（token）。优先 `projectedTokens`，缺席时退回 `pressureTokens`。 */
  used: number;
  /** 占用百分比（0–100，已四舍五入）。⚠️ 无 `window` 时缺席。 */
  percent?: number;
  /** 用的是哪个数（供诊断/测试断言）。 */
  source: 'projected' | 'pressure';
}
/**
 * 读当前会话的上下文占用。
 *
 * @param ctx - 插件上下文（只要它能 `get`）。
 * @param session - 会话对象（`agent/turn-stopping` 载荷里那个 agent 的 session）。
 * @returns 占用结果；**任何一环拿不到就返回 `undefined`**（调用方据此静默跳过）。
 */
declare function readContextUsage(ctx: {
  get: (name: string) => unknown;
}, session: unknown): ContextUsage | undefined;
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
declare function readContextUsageWithWindow(ctx: {
  get: (name: string) => unknown;
}, session: unknown, provider: string, model: string): Promise<ContextUsage | undefined>;
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
declare function renderContextUsage(u: ContextUsage): string;
//#endregion
//#region src/context-auto.d.ts
/** 一次轮末注入的结果（**只用于日志与测试**）。 */
interface AutoContextOutcome {
  /** 是否真的注入了。 */
  injected: boolean;
  /** 未注入时的**可判定**原因（便于排障；本项目一贯的"报数要点名"）。 */
  reason: string;
  /** 注入时带上，供测试断言。 */
  percent?: number;
}
/**
 * ⭐⭐⭐ **挂上"轮末报上下文占用"的钩子**。
 *
 * @param opts - `ctx` 与配置。
 * @returns 是否真的挂上了（供启动诊断区分 `registered` / `skipped(disabled)`）。
 */
declare function registerContextReport(opts: {
  ctx: Context;
  config: MemjConfig;
}): boolean;
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
declare function reportContextUsage(ctx: {
  get: (name: string) => unknown;
}, config: MemjConfig, agent: Agent | undefined, log?: (m: string) => void): Promise<AutoContextOutcome>;
//#endregion
//#region src/api.d.ts
/** API 依赖。 */
interface ApiDeps {
  version: string;
  /** ⭐ 当前生效的配置（供设置接口读写，决策 97）。 */
  config: MemjConfig;
  /**
   * ⭐ `ctx.baseUrl`——**恒等于当前 profile 目录**（`dsh-app-boot` 的 `boot()` 推出）。
   * 设置面板靠它定位 `cordis.patch.yml`（见 `settings.ts` 文件头）。
   */
  baseUrl: unknown;
  /** 当前插件的 **entry id**（写 `--dump-config` / patch 定位用）。 */
  pluginId: string;
  /**
   * ⭐⭐ **服务查询适配器**（2026-09-22 新增）——只为 `get-handoff` 那条判定判据服务。
   *
   * 🔴 **为什么不是整个 `ctx`**：`handleApi` 是**纯函数**（测试直接调它、不必装配 cordis），
   *    而 `ApiDeps` 一直是"四个字段的窄投影"。塞整个 `ctx` 会让那条边界消失。
   * ⇒ ⭐ **只要一个 `get(name)`**（`detectProjectByGetHandoff` 也只需要它）。
   * ⚠️ **可选**：拿不到时那条判据**自动降级为"判不出"**（其余判据不受影响）。
   */
  getService?: (name: string) => unknown;
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
  readingAsk?: AskDeps;
}
/** 一次 API 结果。 */
interface ApiResult {
  status: number;
  body: unknown;
  /**
   * ⭐⭐ **按字节回的响应**（2026-10-19 新增，`/asset` 用）——给了就**跳过 JSON 序列化**。
   *
   * 🔴 **为什么必须加这条路**：图片是二进制，`JSON.stringify(Buffer)` 会把它变成
   *    `{"type":"Buffer","data":[…]}` 这种 JSON ⇒ 浏览器拿到的是"看起来像图片的文本"。
   *    ⚠️ 而且这个失败**很隐蔽**：HTTP 200、Content-Type 也改对了，
   *    只有图片**打不开**（和"路由没注册、返回 HTML"是两种不同的裂法）。
   * ⚠️ `contentType` 必填（`res.writeHead` 需要）；`body` 字段此时**不再使用**。
   */
  raw?: {
    contentType: string;
    bytes: Uint8Array;
    cacheControl?: string;
  };
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
declare function assetBaseDirOf(ref: string, ext: boolean): string | undefined;
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
declare function resolveAssetPath(baseAbs: string, rel: string): Promise<{
  abs: string;
  contentType: string;
} | {
  error: string;
}>;
declare function handleApi(deps: ApiDeps, method: string, pathname: string, rawBody: string, params: URLSearchParams): Promise<ApiResult>;
//#endregion
//#region src/edit.d.ts
/** 一次删改的结果。 */
interface EditResult {
  ok: boolean;
  /** 给人/模型看的回执（成功时说明改了什么，失败时说明为什么）。 */
  message: string;
  /**
   * ⭐ **归档时间**（决策 133）——只有"归档"成功时才有值。
   *
   * 🔴 **为什么要把时间回给调用方**：人侧的归档页列表要显示"归档于 X"，
   *    而归档动作一完成，前端手上的那一条**还没有**这个字段（它刚从活跃清单搬走）。
   *    只回一句文案的话，前端要么再拉一次全量、要么显示空时间。
   *    ⚠️ 与 `updatedAt` 不同：那是"最后一次改动"，不是"被归档的时刻"。
   */
  archivedAt?: string;
}
/** 可改的 entry 封面字段。 */
interface EntryFieldChange {
  title?: string;
  desc?: string;
  tags?: readonly string[];
  /** ⭐ `kind` 的修改通道（补 §12-72 那个留待做）。空串 = 改回"未分类"。 */
  kind?: EntryKind | '';
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
declare function setEntryFields(id: string, fields: EntryFieldChange, opts?: {
  preserveUpdatedAt?: boolean;
  allowArchived?: boolean;
}): Promise<EditResult>;
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
declare function updateEntry(id: string, opts: {
  body?: string;
  fields?: EntryFieldChange;
}): Promise<EditResult>;
/**
 * ⭐⭐ **增删 entry 的 `theme`**（决策 114——**这就是 `c9bcc110` 卡住的那个缺口**）。
 *
 * ⚠️ **累加语义**（与 §6 协议一致）：`add` 是追加、`remove` 是移除，
 * 两边都不影响原有归属；`project` 与 `global` **完全不动**。
 * @param id - 封面 id。
 * @param opts - `add` / `remove` 主题 id 数组。
 * @returns 结果。
 */
declare function editEntryThemes(id: string, opts: {
  add?: readonly string[];
  remove?: readonly string[];
}): Promise<EditResult>;
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
declare function setEntryGlobal(id: string, value: boolean, actor?: 'llm' | 'human'): Promise<EditResult>;
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
declare function probeCoverState(id: string): Promise<'active' | 'archived' | 'missing'>;
/**
 * 归档一条 entry（决策 133）。
 *
 * ⚠️ **连带把 `global` 置 false**（用户要求）：归档撤回了全局身份，
 * 若不置位，它会**仍以已批准的身份留在 `GLOBAL.md`** 里。
 * @param id - 封面 id。
 * @returns 结果。
 */
declare function archiveEntry(id: string): Promise<EditResult>;
/**
 * 恢复一条已归档的 entry（决策 133）。
 *
 * ⚠️ **不恢复 `global`**：归档撤回了全局身份，"恢复"只是让它回到活跃，
 * **不等于重新获批**（批准是人的动作）。要重新全局请再走一遍提名。
 * ⚠️ **不检查它的项目是否归档**（用户明确：恢复与项目状态无关）。
 * @param id - 封面 id。
 * @returns 结果。
 */
declare function unarchiveEntry(id: string): Promise<EditResult>;
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
declare function archiveProject(id: string): Promise<EditResult>;
/**
 * 恢复一个已归档的项目（决策 133）。
 * @param id - 项目 id。
 * @returns 结果。
 */
declare function unarchiveProject(id: string): Promise<EditResult>;
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
declare function moveEntry(id: string, projectId: string): Promise<EditResult>;
/**
 * 🔴 **删掉一条 entry**（封面 + 正文文件，不可逆）。
 *
 * ⚠️ **只删内部正文**：外部引用（`ext: true`）的文件在库外，**只移除封面**。
 * @param id - 封面 id。
 * @returns 结果。
 */
declare function deleteEntry(id: string): Promise<EditResult>;
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
declare function setProjectFields(id: string, fields: {
  title?: string;
  desc?: string;
}): Promise<EditResult>;
/**
 * **改项目描述**（`desc`）——`setProjectFields` 的薄包装（保留旧调用点）。
 * @param id - 项目 id。
 * @param desc - 新描述（≤200 字符）。
 * @returns 结果。
 */
declare function setProjectDesc(id: string, desc: string): Promise<EditResult>;
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
declare function setSectionSpec(id: string, title: string, spec: string): Promise<EditResult>;
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
declare function renameProject(oldId: string, newId: string): Promise<EditResult>;
/**
 * 🔴 **删掉一个项目**（不可逆）。
 *
 * ⚠️ **旗下必须已无封面**——否则拒绝。
 * 理由：级联删知识是**不可逆的大面积损坏**；而"先把知识迁走/删掉，再删项目"
 * 只多一步，却随时可停。⇒ 默认站在**不毁数据**那侧（同决策 104 的偏置）。
 * @param id - 项目 id。
 * @returns 结果。
 */
declare function deleteProject(id: string): Promise<EditResult>;
/**
 * ⭐ **改主题的显示名与描述**（决策 115）。
 *
 * 🔴 **"改名"改的是 `title`，不是 `theme`**（同项目：`theme` 是**所有封面的引用键**）。
 * ⚠️ 只改给的字段；`title` 允许清空。
 * @param id - 主题 id。
 * @param fields - 要改的字段（`title` / `desc`）。
 * @returns 结果。
 */
declare function setThemeFields(id: string, fields: {
  title?: string;
  desc?: string;
}): Promise<EditResult>;
/**
 * **改主题描述**（`desc`）——`setThemeFields` 的薄包装（保留旧调用点）。
 * @param id - 主题 id。
 * @param desc - 新描述（≤200 字符）。
 * @returns 结果。
 */
declare function setThemeDesc(id: string, desc: string): Promise<EditResult>;
/**
 * ⭐ **主题改名**——**先建后删**（同 `renameProject` 的理由）。
 *
 * 主题是封面的 `theme` 数组里的**引用键** ⇒ 改名要把所有引用它的封面一并换掉。
 * @param oldId - 现主题 id。
 * @param newId - 新主题 id。
 * @returns 结果。
 */
declare function renameTheme(oldId: string, newId: string): Promise<EditResult>;
/**
 * 🔴 **删掉一个主题**（不可逆）。
 *
 * ⚠️ **旗下必须已无封面**——同 `deleteProject` 的理由（不级联）。
 * ⚠️ 主题是**派生层**：光删 `THEME-*.md` 没用，只要还有封面提它就会被重建回来
 * ——所以本函数**强制要求先摘干净引用**。
 * @param id - 主题 id。
 * @returns 结果。
 */
declare function deleteTheme(id: string): Promise<EditResult>;
//#endregion
//#region src/index.d.ts
declare const name = "dsh-memj";
/**
 * 需要的服务。
 *
 * ⚠️ **缺任何一个，`ctx.inject` 的回调就永不执行且无报错**——
 * 表现为"插件加载了但工具/命令一个都没有"。见下方 `diag`。
 *
 * 🔴🔴 **`webServer` 必须留在这里，且[不能]改成可选**（2026-10-19 核过，别动）：
 *    `dsh-headless` 明确不挂 HTTP server（其 patch 原话：*"It mounts no Host,
 *    HTTP server, Web Runtime, or browser plugin"*，`webserver` 行只在
 *    `dsh-web-app` 的 patch 里）⇒ 在 `--profile headless` 下这条永不满足。
 *    ⚠️ 后果是**整个 inject 回调不执行**：工具/命令/协议/热知识/主动注入/评分
 *    **全部不注册、且没有任何报错**。
 *    ⭐ **这是【有意】的能力边界**：memj 的**知识写入面**（`memj_handoff` 等 8 个工具）
 *    与**人侧界面**（`/plugins/dsh-memj/` 的十几个页面）是同一个交付物，
 *    拆开没有意义；而 headless 是"一次性任务"场景，本来就没有人侧界面。
 *    ⇒ **不要把 `webServer` 改成可选**来"让 memj 在 headless 里能加载"：
 *      那样加载出来的是一半插件（工具能用、设置页全 404），比干脆不加载更难排查。
 *    📌 若将来真要让 headless 用 memj 的工具面，正确做法是**再开一份只含工具/命令的
 *      轻量入口**（另立 `inject` 数组），而不是让现有入口降级。
 */
declare const inject: string[];
/**
 * 挂载协议、工具、命令与路由。
 *
 * 配置走**第二参**（已校验 + 填好默认值），不是 `ctx.config`。
 * @param ctx - 插件上下文。
 * @param config - 已解析的插件配置。
 */
declare function apply(ctx: Context, config?: MemjConfig): void;
//#endregion
export { ACTIVE_BAND_MAX, ACTIVE_BAND_MIN, ACTIVE_BODY_HINT, ACTIVE_CALLS_PER_TURN_MAX, ACTIVE_CALLS_PER_TURN_MIN, ACTIVE_CHANNEL_VALUES, ACTIVE_CLOSING_INSTRUCTION, ACTIVE_CONTEXT_ROUNDS_MAX, ACTIVE_CONTEXT_ROUNDS_MIN, ACTIVE_HEADER, ACTIVE_POOL_MAX_MAX, ACTIVE_POOL_MAX_MIN, ACTIVE_REASONING_MAX_CHARS_MAX, ACTIVE_REASONING_MAX_CHARS_MIN, ACTIVE_SCOPE_VALUES, ACTIVE_TIMEOUT_MAX, ACTIVE_TIMEOUT_MIN, ACTIVE_TOP_K_MAX, ACTIVE_TOP_K_MIN, ActiveLastRecall, ActiveRuntimeState, type AdoptRequest, AffectedEntry, AskDeps, AutoContextOutcome, AutoNormalizeOutcome, AutoScoreOutcome, CHAT_ENTRY_KIND, CLOSING_INSTRUCTION, Candidate, CanonicalTag, ChatDiag, ChatScoreOutcome, Config, ContextAssembly, ContextItem, ContextUsage, Cover, CoverIssue, DEFAULT_CONFIG, DEFAULT_LEVEL, DEFAULT_SECTION_NAMES, DESC_MAX_CHARS, DESC_SOFT_WARN, DocContextCache, DocContextDeps, type DocOp, DocReadRecord, DocSection, ENTRY_KINDS, ENTRY_KIND_DEFS, EditResult, EnIndex, EnIndexEntry, EntryDoc, EntryFieldChange, EntryFrontmatter, EntryKind, EntryKindDef, EntryScore, FixResult, GateDeps, HANDOFF_LEVELS, HANDOFF_STEP_ORDER, HANDOFF_UNTOUCHED_CLOSING, HANDOFF_UNTOUCHED_SECTIONS, HIT_WEIGHTS, HOT_BIND_SOURCES, HOT_BODY_CLOSING_INSTRUCTION, HOT_BUDGET_MAX, HOT_BUDGET_MIN, HOT_CHANNELS, HOT_CHARS_PER_TOKEN_MAX, HOT_CHARS_PER_TOKEN_MIN, HOT_CLOSING_INSTRUCTION, HOT_DIRECT_SECTION, HOT_FILE_VERSION, HOT_FULL_WARN_MAX, HOT_FULL_WARN_MIN, HOT_HEAD_FIRST, HOT_HEAD_SUPPLEMENT, HOT_META_HINT, HOT_PROJECT_UNKNOWN, HOT_RATIO_MAX, HOT_RATIO_MIN, HOT_SESSION_KEEP, HOT_SESSION_KEEP_MAX, HOT_SESSION_KEEP_MIN, HOT_SHAPES, type HandoffEntry, HandoffLevel, type HandoffRequest, type HandoffResult, type HandoffStep, HotBindSource, HotChannel, HotEntriesFile, HotEntrySetting, HotItem, HotLayer, HotPersonaFile, HotPersonaItem, HotPreviewItem, HotProjectEntry, HotProjectSelection, HotReload, HotRenderResult, HotRuntimeState, HotSelectionFile, HotSessionBinding, HotSessionsFile, HotShape, IndexHealth, InjectionDecision, InjectionPlan, JEV_CANDIDATE_INSTRUCTION, JEV_NEED_INSTRUCTION, JEV_SCORE_INSTRUCTION, JEV_SEARCH_INTENT_INSTRUCTION, JEV_SUFFICIENT_INSTRUCTION, JUDGE_HEAD, JevCallResult, KIND_CATALOG_MARKER, KIND_ID_RE, KIND_LIST_MARKER, KNOWLEDGE_SECTION, KNOWLEDGE_TITLE, KeptMessage, KindDef, LEVEL_LABELS, LibrarySnapshot, LiveKindDef, MIN_QUOTE_CHARS, NARRATIVE_SECTIONS, NARRATIVE_TITLES, type NewThemeRequest, Nomination, NominationsFile, NormalizeOptions, NormalizeResult, PROGRESS_TITLE, PROGRESS_WARN_MAX, PROGRESS_WARN_MIN, PROJECT_KNOWLEDGE_HINT, PROMPT_CATALOG, PROMPT_GROUPS, PROMPT_OVERRIDES_VERSION, PROMPT_SPECS, PROTOCOL_SECTION_ORDER, PROTOCOL_TEXT, ParsedCover, ParsedJudge, PatchReload, PendingTag, ProjectFrontmatter, ProjectRecord, ProjectScore, PromptCatalogEntry, PromptCheck, PromptGroup, PromptGroupInfo, PromptOverrides, PromptSpec, PromptZone, READING_WORKSPACE_DIR, ReadDecision, ReadSnapshot, ReadingAnchor, ReadingAskRequest, ReadingAskResult, ReadingBinding, ReadingBlock, ReadingState, RebuildResult, RecallOutcome, SCORE_FILE_VERSION, SCORE_INDEX_RANGE, SCORE_PICK_PRINCIPLE, SCORE_POOL_HEADER, SCORE_QUOTE_RULE, SCORE_USER_TASK, SECTION_SPEC_CLOSING, SECTION_SPEC_HEAD, SELECTABLE_ENTRY_KINDS, SLUG_RE, SNAPSHOT_CLOSING, SPEC_BLOCK_FENCE, SPEC_SECTION, SPEC_TITLE, SavePromptResult, ScanOptions, ScoreEvent, ScoreFile, ScoreReadOpts, ScoreRunRecord, ScoreTurnResult, ScoredCandidateLog, ScoredEntry, SearchHit, SectionGroup, type SectionOpResult, SettingsReadResult, SettingsWriteResult, SyncDeps, SyncTurn, TARGET_PROJECT_LINE, TARGET_THEME_LINE, TEMPLATE_ID_RE, TEMPLATE_VERSION, THEME_COVERS_HINT, THEME_CREATION_VALUES, THEME_KNOWLEDGE_HINT, TITLE_MAX_CHARS, TITLE_MIN_CHARS, TOKEN_COEF, TPL_GUIDANCE_FOOT, TPL_GUIDANCE_HEAD, TPL_GUIDANCE_NO_TRUNC, TPL_GUIDANCE_ROW, TPL_GUIDANCE_TRUNC_MARK, TagAutoState, TagVocabulary, Template, TemplateAction, TemplateSection, TemplateToolDecision, TemplateToolRequest, ThemeFrontmatter, TopScoredOpts, Turn, UUID_SCAN, WindowSnapshot, WriteBackItem, WriteBackResult, activeInjectionsUsed, activeSnapshot, activeState, addNomination, aggregate, aliasIndex, allCandidates, appendBinding, appendChatTurn, appendDocRead, appendReadSnapshot, appendScoreLog, apply, applyAdds, applyMerges, applySectionOp, approveNomination, archiveEntry, archiveProject, askAboutSelection, assembleContext, assetBaseDirOf, attachReadingSync, backupDir, backupNarrativePath, bindingsForEntry, blockLeafLines, bodySize, budgetTokensFor, buildChatScoreSystem, buildChatScoreUser, buildHotInjection, buildSkeleton, buildSystemPrompt, buildUserPrompt, builtinKindDefs, byUpdatedDesc, callJev, candidatesForScope, catalogOf, charCount, checkAdoptShape, checkAndRepair, checkEntryShape, checkIndex, checkKnowledgeShape, checkNoDshVariables, checkQuote, clearPluginSpawnedForTest, clearPromptHistory, collectHotItems, confirmMessage, consumeSnapshots, countChatTurns, coverFromYaml, createChatEntry, createReadingSession, currentKindDefsOf, currentKindsOf, currentReservedKinds, cutKnowledgeSection, cutSpecSection, decideAutoScore, decideInjection, decideRead, decideTagAuto, decideTemplateTool, defaultEntrySetting, defaultTemplate, defaultTemplatePath, deleteEntry, deleteEntryFile, deleteKindBlockReason, deleteProject, deleteProjectDoc, deleteTemplate, deleteTheme, deleteThemeDoc, deltaFor, deltaTextOf, descHashOf, detectProjectByDocReads, detectProjectBySessionLog, docReadLogPath, docReadsDir, docSectionsOf, editDistance, editEntryThemes, effectiveChannel, effectiveConfig, effectiveScope, effectiveScore, emptyOverrides, emptyScoreFile, emptyTagAutoState, emptyVocabulary, enIndexPath, ensureDefaultTemplateFile, ensureLibraryDirs, entriesDir, entryFileName, entryKindWhen, entryRelPath, estimateCandidateTokens, estimatePoolOutputTokens, estimatePoolTokens, estimateTokens, extractJson, extractReadingBlocks, extractSection, extractSpecBlock, extractSpecBlockLines, extractSpecSection, extractTitle, extractTurn, extractUserSubmit, fillKindMarkers, fillSlots, filterByContext, filterContextByTerms, findAliasConflicts, findBinding, findBindingByChatEntry, findBindingBySession, findDocRead, findEmptySections, findSectionRange, findSimilarIds, fingerprintsFromInjectionEvents, fingerprintsInText, fixCoverBlock, fixExternalRef, gateHandoffArgs, getSessionBinding, globalDocPath, groupBySourceProject, groupOrder, groupSections, handleApi, hasOverride, hashText, hotDir, hotEntriesPath, hotPersonaPath, hotSelectionPath, hotSessionsPath, hotState, idsInWindow, inWindow, inject, injectTotalsOf, insertSpecBlocks, installDocContext, isAbsolutePath, isChatCover, isCompleteContext, isEntryKind, isHistoryCover, isKnowledgeHeading, isMtModel, isPluginSpawned, isSectionShape, isSimilarId, isThoughtEnd, kindCatalogText, kindsFilePath, kindsInline, lastBudgetDiagnostic, lastChatDiagnostic, lastInjectionOf, lastRunTurn, leakedHan, legacyTemplatePath, libraryRoot, listPromptHistory, listTemplates, loadBindings, loadCursors, loadDefaultTemplate, loadEnIndex, loadEntryDoc, loadEntrySettings, loadKinds, loadPersona, loadProjectDoc, loadPromptOverrides, loadReadingState, loadScoreFile, loadSelections, loadSessionsFile, loadTagAutoState, loadTemplate, loadThemeFrontmatter, loadVocabulary, locateTemplateBody, makeAnchor, markAnchor, markNormalized, markPluginSpawned, maybeAutoNormalize, maybeAutoScore, measureSections, mergeNarrative, moveEntry, name, narrativeFromProjectText, newPersonaId, nominationsPath, normalizeNarrative, normalizeQuery, normalizeTags, normalizeTemplate, noteKnowledgeWritten, overriddenKeys, overrideUpdatedAt, pairingError, parseChatScore, parseCovers, parseGetHandoffFromEvents, parseHandoffFromEvents, parseJudgeOutput, parseKindsDoc, parseLevel, parseSections, parseStepRequest, parseTemplateDoc, patchPathFrom, pendingSnapshots, personaFingerprint, pickCandidates, planInjection, planSteps, pluginRoot, preview, previewForSession, probeCoverState, profileDirFrom, projectDocPath, projectIdFromFile, projectsDir, promptCurrent, promptDefault, promptHistoryDir, promptOverridesPath, promptText, promptsDir, protocolText, pruneEvents, pruneSessions, quoteAppearsIn, rawKindFromYaml, readContextUsage, readContextUsageWithWindow, readDocReads, readLogPath, readNominations, readProjectScore, readPromptHistory, readScoreLog, readSettings, readSnapshots, readTurnContent, readUnconsumedSnapshots, readingAskDeps, readingBindingsPath, readingCursorsPath, readingDir, readingStatePath, readingWorkspacePath, readsDir, reasoningTextOf, rebuildDerivedLayers, rebuildEnIndex, rebuildWindowFromSessionLog, recall, recallLogDir, recallLogPath, recordRead, refreshPromptCache, refreshPromptCacheSync, registerActiveInjection, registerAutoScore, registerContextReport, registerDocContext, registerEnIndex, registerGate, registerHotInjection, registerPromptDefault, registerReadingSync, registerTagAutoNormalize, registeredPromptKeys, rejectNomination, relocateAnchor, removeNomination, renameProject, renameTheme, renderActiveInjection, renderAskPrompt, renderChatEntryBody, renderChatTurn, renderContextUsage, renderCover, renderDocContext, renderFrontmatter, renderHotText, renderJudgeRules, renderKindsDoc, renderManifest, renderMetaLine, renderOutputSpec, renderOutputText, renderParametersText, renderProjectHandoff, renderSectionSpecs, renderSnapshotList, renderSpecBlockLines, renderSpecBlocksSkeleton, renderTemplateDoc, renderThemeHandoff, renderYamlArray, replaceBlockAtLines, reportContextUsage, requiredDirs, resetActiveState, resetHotState, resetPromptCache, resetPromptOverride, resolveAssetPath, resolveContextWindow, resolveInsideLibrary, resolveJevKey, resolveMerges, resolveProject, resolveRef, resolveTag, restorePromptHistory, runHandoff, safeName, saveCursor, saveEnIndex, saveEntrySettings, saveKinds, savePersona, savePromptOverride, savePromptOverrides, saveReadingPosition, saveScoreFile, saveSelections, saveSessionsFile, saveTagAutoState, saveTemplate, saveVocabulary, scanLibrary, scoreCover, scoreFilePath, scoreLogDir, scoreLogPath, scoreTurn, scoreViaChat, scoredEntryIds, sectionSpecsOf, sectionTitles, sectionsFromNarrative, seedVocabulary, selectableKindList, selfCheckHandoffResult, setCurrentKindDefs, setEntryFields, setEntryGlobal, setProjectDesc, setProjectFields, setPromptCacheForTest, setSectionSpec, setSectionSpecBlock, setSessionBinding, setThemeDesc, setThemeFields, settingOf, slotNames, snapshotWindow, sortHits, specBlockFenceInfo, specBlockRange, specOf, splitFrontmatter, splitRoute, splitTurns, startNormalizeSubagent, startScoreSubagent, stripAllSpecBlocks, stripAnchorMarks, stripCovers, stripInlineMarkdown, stripSpecBlock, syncEntryFrontmatter, syncSession, tagAutoStatePath, tagVocabularyPath, tagsDir, templateDeclaresArchiving, templatePath, templateSectionNames, templateWarnings, templatesDir, textOfContent, themeDocPath, themesDir, toStringArray, topScored, touchSession, triggerEnIndexRebuild, unarchiveEntry, unarchiveProject, unescapeFromTemplate, updateEntry, updateProjectScore, validateAllCovers, validateCoverShape, validateKinds, validatePrompt, validateTemplate, withScoreLock, writeBackState, writeBackToSource, writeEntryDoc, writeGlobalDoc, writeNominations, writeProjectDoc, writeSetting, writeThemeDoc, yamlScalar };