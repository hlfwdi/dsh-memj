import { t as __exportAll } from "./rolldown-runtime-D7D4PA-g.js";
import { a as readTextIfExists, i as listFiles, o as removeFile, s as writeTextAtomic, t as ensureDir } from "./files-baWgIuqu.js";
import { $t as themeDocPath, A as SPEC_SECTION, At as nominationsPath, B as renderSpecBlockLines, C as yamlScalar, D as NARRATIVE_TITLES, E as NARRATIVE_SECTIONS, F as docSectionsOf, Ft as promptOverridesPath, G as specBlockRange, H as sectionsFromNarrative, I as extractSpecBlock, It as promptsDir, K as stripAllSpecBlocks, L as extractSpecBlockLines, Lt as readLogPath, M as buildSkeleton, Mt as projectDocPath, N as cutKnowledgeSection, Nt as projectsDir, O as PROGRESS_TITLE, P as cutSpecSection, Pt as promptHistoryDir, R as extractSpecSection, Rt as readsDir, S as validateCoverShape, T as KNOWLEDGE_TITLE, U as setSectionSpecBlock, Ut as resolveRef, V as sectionSpecsOf, Vt as requiredDirs, W as specBlockFenceInfo, Wt as safeName, _ as renderYamlArray, _t as docReadsDir, a as charCount, bt as entryRelPath, c as extractTitle, ct as isEntryKind, en as themesDir, f as narrativeFromProjectText, g as renderFrontmatter, gt as docReadLogPath, h as renderCover, j as SPEC_TITLE, k as SPEC_BLOCK_FENCE, mt as backupNarrativePath, p as parseCovers, pt as backupDir, q as stripSpecBlock, v as replaceBlockAtLines, vt as entriesDir, w as KNOWLEDGE_SECTION, x as toStringArray, xt as globalDocPath, y as splitFrontmatter, yt as entryFileName, z as isKnowledgeHeading } from "./parse-DzYS90SW.js";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { execFile } from "node:child_process";
//#region src/config.ts
/**
* 插件配置（`cordis.patch.yml` 的 config 段）。
*
* 🔴 **Config 用 schemastery，不是 zod**（`dsh-plugin-knowledge.md` §1.6）：
* 默认导入 `z`，读配置走 `apply(ctx, config)` 的**第二参**（已校验 + 填默认值），
* **不是** `ctx.config`。
*
* 本插件的配置只有**阈值**一类——大部分决策在 `memj-design.md` 里已拍板，
* 但把易调的数字集中在这里，便于日后按 §12 的待定项调整而不动逻辑。
*
* @module dsh-memj/config
*/
/**
* ⭐⭐⭐ **一个决策模型 provider 的 schema**（2026-10-07 多 provider 化）。
*
* 🔴🔴 **为什么既要抽成具名常量、又要显式标注类型**（两步都必需，已实测）：
*    · **内联**在 `Config` 里 ⇒ 推断类型**无法被命名**（TS2742）；
*    · 只抽成具名常量、**不加类型注解** ⇒ **仍然报 TS2742**（实测）；
*    · 抽出来 + `: Schemastery<{...}>` 注解 ⇒ 通过（实测）。
*    不加注解时 `tsdown` 生成 `.d.ts` 会**直接构建失败**，报：
*    *"The inferred type of 'Config' cannot be named without a reference to
*    `.pnpm/@deepseek-ai+cosmokit@…`. This is likely not portable."*
*    ⭐ 判据：**嵌套 schema 要具名 + 标注类型**（`z.array(z.object(...))` 在本项目是首次）。
*    ⚠️ 根因是 schemastery 的 `Schema<S, T>` 有两个泛型参数，内联时其中一个
*       （`S`，来自 cosmokit）落到声明文件里就**成了不可移植的引用**。
*/
const DecisionProviderSchema = z.object({
	/** 路由标识（同一份配置里不得重名）。 */
	id: z.string(),
	/** 显示名（空 ⇒ 显示 id）。 */
	displayName: z.string().default(""),
	/** 该 provider 的端点。 */
	endpoint: z.string(),
	/** 该 provider 下的模型名列表。 */
	models: z.array(z.string()).default([])
});
/** 插件配置。 */
const Config = z.object({
	/**
	* `memj_read` 的**全文直出阈值**（字符数，§4.2 / §12-39）。
	*
	* ⚠️ 这是**字符数不是字节数**——中文按 UTF-8 一字符 3 字节，
	* 用字节会让中文文档体积虚高 3 倍。
	*
	* 3000 的理由：它正好把**内部条目**（几百–2000 字符，该全文读）
	* 与**外部长文档**（上万，该按节读）分开。
	*/
	readFullMaxChars: z.natural().min(1).default(3e3),
	/** 读快照单文件上限（§3.8.2）：超过它就删较早的若干条。 */
	readLogMaxEntries: z.natural().min(1).default(50),
	/** 触发清理时删除的条数（§3.8.2：> 50 ⇒ 删较早的 25 条）。 */
	readLogTrimCount: z.natural().min(1).default(25),
	/** `memj_search` 默认返回的封面数上限。 */
	searchLimit: z.natural().min(1).max(500).default(30),
	/** 是否注入静态协议（§6 全文）。 */
	injectProtocol: z.boolean().default(true),
	/**
	* 项目/主题 id「近义」判定的编辑距离上限（§12-42 相关的两段式确认）。
	*
	* 判据（§3.9.2 第 10 项）：**互为子串** 或 **编辑距离 ≤ 此值** ⇒ 回相似项确认。
	*/
	similarEditDistance: z.natural().max(10).default(2),
	/**
	* ⭐ **新建主题的模式**（决策 95，2026-09-19 用户拍板；**默认值 2026-10-12 改为 `loose`**）。
	*
	* - `strict`：沿用原门槛——`newThemes` 非空时，本会话必须有一条
	*   `project ≠ 本次 project` 的**未消费读快照**作跨项目证据，否则整份 handoff 报错。
	* - `loose`（⭐ **默认**）：⭐ **取消这道闸门**，是否新建主题**完全由 LLM 判断**，
	*   工具不做该校验。
	*
	* 🔴 **宽松模式只拆闸门，不拆完整性**（两种模式都保留）：
	*   · `id` / `desc` 的**格式校验**——那不是"该不该建"，而是"建了能不能用"；
	*   · **近义 id 的两段式确认**——§12-33 的删除/改名通道是留待做，
	*     近义主题**建错了收拾不掉**，属永久性损坏。
	*
	* ⚠️ **模式信息不进提示词**（决策 96）：协议与工具 description **保持中性、只有一份**，
	*   模式由 `memj_snapshots` 的**返回值**告知 LLM（动态通道 ⇒ 零缓存代价）。
	*
	* ⭐ **用户 2026-10-12 裁定：默认值改为 `loose`**（原默认是 `strict`）。
	*   理由：那道闸门把"该不该建"这件**语义判断**交给工具机械校验，
	*   而它实际拦下的多数是**判断正确、只是本会话没读过别项目**的新建
	*   ⇒ 交给 LLM 自行判断更符合该机制的初衷。仍要闸门的实例在设置页显式选「严格」。
	*   ⚠️ **代价（如实记）**：原先"无证据则拒"是**默认行为**，现在降级成**可选行为**——
	*   既有测试/脚本若**依赖默认值**才走到严格，必须**显式传 `themeCreation: 'strict'`**
	*   （本次已逐个核对补齐，见 `scripts/`）。
	*/
	themeCreation: z.union([z.const("strict"), z.const("loose")]).default("loose"),
	/**
	* ⭐⭐ **归档的【建议】触发阈值**（字符数）—— 🔴🔴 **决策 223 起它不再驱动任何自动行为**。
	*
	* ── 它现在是什么（用户 2026-10-12 裁定之后）────────────────────────────────
	* 归档**不再由工具执行**：规则写在**各节的书写规范里**（自然语言），**由模型照做**。
	* 本值退化成两件事：
	*   ① **回执里的参考值** —— 规范里没写数字的**存量文档**，模型据此有个数可对照；
	*   ② **默认模板那段的来源** —— 新建项目时把"超过 20000 时归档…"写进规范。
	*
	* ── 🔴 为什么保留它而不是删掉 ──────────────────────────────────────────────
	* 存量 21 份文档的规范里**都没有数字**（那段规则是 2026-10-12 才写进默认模板的）
	* ⇒ 删掉它，那些文档**连一个可参照的阈值都没有**（模型无从判断"多少算多"）。
	* ⭐ 保留的代价是"设置页与文档规范可能不一致" —— 已在界面上写明
	*   **规范优先、这里只是建议**（见 `index.html` 那一节的说明）。
	*
	* 🔴 **本值不进提示词**（沿袭既有纪律）：`index.ts` 注册 `context()` 时明确写着
	*    "本函数只返回常量，**绝不含运行时数字**（那会导致永不命中缓存）"
	*    ⇒ 具体数字由**回执每次现报**，用户拧旋钮**不会**改变 `context()` 的文本。
	*/
	progressCharsWarn: z.natural().min(1e3).max(1e6).default(2e4),
	/**
	* ⭐⭐ **是否对正文镜像做 git 版本维护**（决策 135）。
	*
	* 开启后，每次 handoff 会把**纯正文镜像**（`backup/HANDOFF-<项目>.md`，不含封面）
	* 覆盖写入并提交一次 —— 于是"截断改坏了"可以用 git 退回。
	*
	* 🔴 **默认关**：它需要本机有可用的 git；**开启时会在设置页先探测环境**，
	*    不通就拒绝开启（开关若写着"已开"却永不工作，**那是在说谎**）。
	*/
	backupGit: z.boolean().default(false),
	/**
	* ⭐ **git 连续失败多少次后不再逐轮复述**（决策 135）。
	*
	* 🔴 为什么要这个：本项目实测过"同一句警告连报 7 次、一次没被处理"
	*    ⇒ **高频警报会脱敏**（噪音训练人忽略警告）。确认它持续坏掉之后，
	*    只报一次细节、之后改为报累积量。
	*/
	backupGitFailLimit: z.natural().min(1).max(100).default(3),
	/**
	* ⭐⭐ **归档的【建议】目标**（字符数）—— 🔴 **决策 223 起它同样不再驱动自动行为**。
	*
	* 与 `progressCharsWarn` 成对：那个是"多少算多"，本值是"归档到多少以内"。
	* ⚠️ **判据仍是这一节的绝对字符数**；与阈值一样**不进提示词**。
	* ⭐ 它现在只出现在**回执的参考值**与**默认模板的规范文字**里 —— 见上一个键的说明。
	*/
	progressCharsKeep: z.natural().min(1e3).max(1e6).default(12e3),
	/** ⭐ **热知识总开关**（默认关）。 */
	hotInject: z.boolean().default(false),
	/** ⭐ **注入上限比例**（占模型上下文窗口的比例；`0` = 关闭预算检查）。 */
	hotInjectRatio: z.number().min(0).max(100).default(.333),
	/**
	* ⭐ 字符↔token 换算系数。
	*
	* 🔴 **默认 1.0 是刻意保守**：中文大约 1 字符 ≈ 1 token，用它换算
	* = "按最坏情况估" ⇒ **宁可高估占用，别把预算算松了**。
	*/
	hotCharsPerToken: z.number().min(.1).max(10).default(1),
	/** ⭐ 窗口未知时的字符上限（回落值）。 */
	hotBudgetCharsFallback: z.natural().min(1e3).max(1e7).default(4e4),
	/** ⭐ **单条 `full` 正文的提醒阈值**（方案 §9.1c；超了提醒用户，**不阻止**）。 */
	hotFullWarnChars: z.natural().min(1).max(1e6).default(1e3),
	/** ⭐ 会话绑定记录保留条数（裁定 H-4：留最新 50 个）。 */
	hotSessionKeep: z.natural().min(1).max(1e4).default(50),
	/**
	* ⭐⭐⭐ **总开关**（**默认关**；用户裁定）。
	*
	* ⚠️ **关着 ⇒ 一个监听器都不挂**（照 `registerTagAutoNormalize` 的做法）——
	*    不是"挂上去再判 false"：后者仍在事件链上占位，且诊断行会变成**假绿**。
	*/
	hotScoreOnTurnEnd: z.boolean().default(false),
	/**
	* ⭐⭐ **过线阈值**：JEV 的 `noul` ≥ 此值才加分。
	*
	* ⭐ 默认 **0.7** —— 沿用库内既有的分带口径（`≥0.7 act / 0.4~0.7 review / <0.4 drop`）。
	* 🔴 **它与 `activeInjectItemMin` 是【两个键】**（虽然现在值相同）：
	*    两者的**用途、判据对象、调参理由都不同**（一个是"实时要不要给"，一个是"复盘该不该加分"）
	*    ⇒ ⚠️ 合成一个键就会重演决策 172 那个坑（一个键兼两个语义 ⇒ 必然错一半）。
	*/
	hotScoreThreshold: z.number().min(0).max(1).default(.7),
	/**
	* ⭐⭐⭐ **总开关**（**默认关**；用户裁定）。
	*
	* ⚠️ **关着 ⇒ 一个监听器都不挂**（照 `hotScoreOnTurnEnd` 的做法）——
	*    不是"挂上去再判 false"：后者仍在事件链上占位，且诊断行会变成**假绿**。
	*/
	contextReportOnTurnEnd: z.boolean().default(false),
	/**
	* ⭐⭐ **低于此占用率就不报**（默认 50）。
	*
	* 🔴 **为什么必须有阈值、不能每轮都报**：注入的文本**本身占 token**
	*    ⇒ 每轮都报会持续推高占用（"自我强化"）。低占用时模型也不需要动作。
	*
	* ⚠️ **它与提示词里的阈值是【两个不同的东西】，别混**：
	*    本键管"**插件要不要把数报出来**"（省 token）；提示词里的 60% 管
	*    "**模型看到数之后要不要动作**"。两者可以不同值。
	*/
	contextReportMinPercent: z.natural().min(1).max(100).default(50),
	/**
	* ⭐⭐⭐ **边沿触发的台阶**（默认 10，即每涨 10 个百分点才重报一次）。
	*
	* 🔴 **为什么必须有**（2026-10-12 实测）：上面那个键是**电平**判据 ——
	*    一旦过线，只要没掉下去，**每一轮都会报**。而长会话的占用**单调上涨**
	*    ⇒ 从过线那一刻起**每轮一条、永不停止**。
	*    ⚠️ 用户实测连收 **十几条**；而且它**自己在推高占用**（注入文本占 token）
	*    ⇒ **自激**。⭐ 更糟：用户的规则②「同一会话至多一次」一旦成立，
	*    后续每条注入**必然都是空操作** ⇒ 那形态 = **保证无效的每轮噪音**。
	*
	* **语义**：只有 `本次占用 − 上次报过的 ≥ 本值` 时才报。
	* ⚠️ 占用**回落再涨回去** ⇒ 会重报（那是真实状态变化，该报）。
	* ⚠️ 本路由**无窗口**时（算不出百分比）⇒ 没有台阶可比 ⇒ 退化成"每会话至多一次"。
	*/
	contextReportStepPercent: z.natural().min(1).max(100).default(10),
	/**
	* ⭐⭐ **滚动窗口（小时）**：只有窗口内加过分的事件才算数（用户裁定：*"30 个小时"*）。
	*
	* 🔴 **判据是"逐事件判过期"，不是"看最后一个时间戳"** ——
	*    后者会让"早期加分 + 近期加分"的知识**该过期时不过期**（详见 `hot-score.ts` 文件头）。
	* ⚠️ 与 `hotScoreThreshold` 一样：它是**独立的旋钮**，不复用别的阈值键
	*    （库内知识 `3d71bf49`：触发点与目标必须各是一个参数）。
	*/
	hotScoreWindowHours: z.number().min(.1).max(1e4).default(30),
	/** ⭐ **注入取前几名**（用户裁定：*"比如前 20 名"*）。 */
	hotScoreTopN: z.natural().min(1).max(200).default(20),
	/**
	* ⭐⭐⭐ **每轮最多选几条**（决策 180；用户裁定：*"加个设置旋钮，每轮最多选几条的设置"*）。
	*
	* ── 与上面那个 `hotScoreTopN` 是【两个不同的东西】，别混 ──────────────────
	* | 键 | 管什么 | 作用于 |
	* |---|---|---|
	* | **本键** | 模型**一轮最多选几条**（评分时） | 写入侧 |
	* | `hotScoreTopN` | 从分数表里**取前几名去注入** | 读取侧 |
	* ⚠️ 一个管"**进多少**"、一个管"**出多少**" —— 合成一个键就会重演决策 172
	*    （一个键兼两个语义 ⇒ 必然错一半）。
	*
	* ── 🔴 为什么它必须存在（这是我实测出来的，不是理论担忧）────────────────
	* 试跑里模型**选了 18 条 / 24 条**（223 条候选）—— 它不是"只挑最相关的几条"，
	* 而是"**把沾边的都收进来**"。⭐ 那会让**几乎每条知识每轮都被加分** ⇒ 分数被拉平
	* ⇒ 「前 20 名」失去区分度（与 JEV 那条通路遇到的"跨度只有 0.05"是**同一个病**）。
	*
	* ── ⭐ 为什么它写在 `user` 里、不写在 `system` 里（照 §6.4 的硬约束）──────
	* §6.4 明写：**判断要求里不写"最多 K 条"** —— K 是可配变量，写进 `system`
	* 会让它**每轮都变**、**把清单（输入大头）一起拖出前缀缓存**。
	* ⭐ 而在本模块**放 `user` 是零成本的** —— `user` 里装着"本轮内容"，本来就每轮都变。
	* ⚠️ 所以改这个旋钮**不会废掉任何缓存**。
	*
	* ⚠️ 它**同时是一个提示词判据**，不只是"截断":上限会**改变模型的取舍标准**
	*    （逼它排序、而不是"合格就收"）⇒ 见 `buildChatScoreUser` 的措辞。
	*/
	hotScoreMaxPicks: z.natural().min(1).max(200).default(10),
	/**
	* ⭐ **低于这个字符数的轮次不评分**（挡寒暄；用户裁定"要"）。
	*
	* 🔴 **为什么需要**：不设的话**每一轮**都会起一个子代理 —— 包括你说"好的""继续"那种轮次。
	*    ⚠️ 判据取的是**该轮内容总长**（用户输入 + 思考 + 输出，**不含工具调用**），
	*       所以"好的"这种轮次自然是几到几十字符 ⇒ 被挡住。
	*/
	hotScoreMinChars: z.natural().min(0).max(1e6).default(100),
	/**
	* ⭐⭐⭐ **入围门槛：有效分至少这么多**（决策 182；用户裁定：*"加设置页门槛，
	* 只有上一轮加入的**和**超过 2 分的才有机会入选（设置的是哪个 2 分）"*）。
	*
	* ── 🔴 与"上一轮加入的"是 **OR**，不是 AND（这一点必须写明）────────────────
	* 用户的字面是"和"，但语义是"**这两类都该有机会**"：
	*    · **分数够高** ⇒ 长期证明有用的（≥ 本键）；
	*    · **刚加入的** ⇒ 这一轮刚被证明有用、但分还低（= `hotScoreGateLastTurn`）。
	* ⭐ 按 **OR** 实现。⚠️ 若改成 AND，则"刚加入的低分知识"永远进不来
	*    ⇒ 那与本功能的初衷（**把"这次漏了"变成"下次默认带上"**）直接冲突。
	*
	* ── 为什么需要它 ──────────────────────────────────────────────────────
	* 实测生产数据：**33 条有分、其中 25 条并列 1 分**，而位置只有 20 个
	* ⇒ 不设门槛时"1 分的那些谁进谁出"全由**排序规则**决定
	* （旧实现同分按 id 字典序 = **任意淘汰**）。
	* ⭐ 门槛把"值不值得给"与"位子不够"分开：**先够格、再排序**。
	*
	* ⚠️ 默认 **2** = 至少被两次评分选中过（而不是"1 次运气"）。
	* 🔴 它与 `hotScoreThreshold`（**评分那个 0~1 的分**）**完全无关** ——
	*    那个是"单次判定够不够格加分"，这个是"**累计了几分才值得注入**"。
	*/
	hotScoreGateMinScore: z.natural().min(1).max(1e3).default(2),
	/**
	* ⭐⭐⭐ **入围门槛：是否放行"上一轮刚加入的"**（决策 182；默认**开**）。
	*
	* ⭐ **为什么必须有它**（这是门槛另一半的意义）：一条知识**刚**被评分选中
	* ⇒ 它**必然是"这一轮漏了、下一轮该带上"的**（那正是本功能的目的）——
	* 而它此刻累计分**只有 1** ⇒ 若只看分数门槛，**它会被自己的低分挡在外面**，
	* 要等被选中 2 次才注入 ⇒ ⭐ **功能最该起作用的时刻，它偏偏不生效**。
	* ⚠️ 关掉它 ⇒ 退回"只看分数"（与 `hotScoreGateMinScore` 配合即纯分数门槛）。
	*/
	hotScoreGateLastTurn: z.boolean().default(true),
	/**
	* ⭐ **评分的通路口径**（与 `activeInjectChannel` **独立** —— 见默认值处的长注释）。
	*
	* ⚠️ 两条通路的**产出契约不同**（这才是"通路"这个键存在的理由）：
	*    · `chat` ⇒ 走 DSH 内部模型路由（`GET /models` 那份清单）⇒ 回**选中的条目 + 理由**；
	*    · `jev`  ⇒ 走 Knox 的 `/v1/systemone`（决策模型，**不是** chat 端点）⇒ 回**逐条分数**。
	* 🔴 **不要把通路从模型名隐式推导**（"名字含 jev 就走 systemone"）——
	*    换模型时会**静默走错端点**（同族教训 `4a7b1931`）。**显式配置**。
	*/
	hotScoreChannel: z.union([z.const("chat"), z.const("jev")]).default("chat"),
	/**
	* ⭐⭐⭐ **复盘用的模型**（**这个键就是"该通路下的模型"** —— 照 `activeInjectModel` 的做法）。
	*
	* 🔴🔴 **取值形态跟着通路走**（所以设置面板上它是个**内容跟随通路的下拉框**）：
	* | 通路 | 取什么 | 例 |
	* |---|---|---|
	* | `chat` | **`provider/model`** | `workbuddy/deepseek-v4.1-flash` |
	* | `jev`  | **纯模型名**（网关下的） | `jev-latest` |
	* ⚠️ 两条通路的模型名**不通用** —— 拿 JEV 的名字去 chat 端点（或反过来）会**失败**。
	*    ⇒ ⭐ 所以切通路时 UI 会**清空已选**（与主动注入的「召回模型」同一套做法），
	*      避免"留着上一个通路的模型名 ⇒ 静默走错端点"。
	*
	* ⭐ **默认给 WorkBuddy 的 `deepseek-v4.1-flash`**（用户 2026-09-29 点名要用它）——
	*    默认值必须**开箱能用**，否则"开关打开却什么都没发生"会被当成 bug。
	*/
	hotScoreModel: z.string().default("workbuddy/deepseek-v4.1-flash"),
	/**
	* ⭐⭐ **起子代理用的模型**（`provider/model`；**两个都空 = 跟随主会话**）。
	*
	* 🔴 **它和 `hotScoreModel` 是两件事**（别混）：
	*    · `hotScoreModel` ⇒ **工具内部做判断**时调的那个模型（走上面选的通路）；
	*    · **本组** ⇒ 起那个**子代理**用的模型（它只做"调工具 + 转达回执"，不做判断）。
	* ⚠️ 之所以要能单独配：子代理只是**壳**，没必要用贵模型；
	*    而判断质量由 `hotScoreModel` 决定。
	* ⭐ **两个都留空是合法且有意义的**（= 跟随主会话，与 `tagNormalize*` 同款）。
	* 🔴 **但代码里绝不能"不给 `agentOptions`"** —— 实测不给会继承 parent 的
	*    `requestHeader`（可能是关不掉思考的 `hy3` ⇒ 子代理输出 0 字符 ⇒ 直接失败）
	*    ⇒ 为空时**显式走"跟随主会话"那条路**（见 `score-auto.ts`）。
	*/
	hotScoreSubagentProvider: z.string().default(""),
	hotScoreSubagentModel: z.string().default(""),
	/** ⭐ **评分调用的超时**（毫秒）。⚠️ 后台跑，给得比注入宽。 */
	hotScoreTimeoutMs: z.natural().min(1e3).max(3e5).default(6e4),
	/** ⭐ **英文索引开关**（默认**开**）。⚠️ 设置面板**不暴露**它（必要功能）。 */
	enIndex: z.boolean().default(true),
	/** ⭐ **索引诊断日志**（默认关；排障时开）。 */
	enIndexDiag: z.boolean().default(false),
	/**
	* ⭐ **翻译模型**（`provider` + `model` **必须成对**给）。
	*
	* 🔴 **两个都为空 ⇒ 跟随主会话默认模型**（`agentDefaultModel.currentSelection()`）。
	* ⚠️ 跟随主会话可能用的是贵模型 —— 建议在设置面板里显式选一个便宜的。
	*/
	translateProvider: z.string().default(""),
	translateModel: z.string().default(""),
	/**
	* ⭐⭐ **翻译模板**（**一个开关同时决定提示词与解析器**）。
	*
	* - `instruct`（默认）：要 **JSON** 输出 ⇒ `JSON.parse`
	* - `mt`：**编号 + 空行分隔、无标签** ⇒ 先按空行切、再按换行切
	*
	* 🔴 **两者必须配对**（错配 = **静默失败**：给 MT 模型用 instruct 模板会解析不出第二段）
	* ⇒ 所以做成**一个**旋钮，而不是两个。
	* ⚠️ 用 `Hunyuan-MT-7B` 这类翻译专用模型时**必须改成 `mt`**。
	*/
	translateTemplate: z.union([z.const("instruct"), z.const("mt")]).default("instruct"),
	/** 翻译并发（⚠️ 保守：走的是 DSH 内部模型路由，太高会触发上游限流）。 */
	translateConcurrency: z.natural().min(1).max(20).default(3),
	/**
	* ⭐⭐ **每一级的重试次数**（默认 1 ⇒ 每级最多试 2 次）。
	*
	* 🔴 **为什么必须有**：三级修法是**换策略**、不是**重试** ——
	* 实测有一批 3 条，其中 1 条**三级全失败**（MT 把标题与描述合并成一行、解析不出两段），
	* 而**同一输入再跑一次就成功** ⇒ 那是**偶发**（模型输出有随机性，即便 `temperature: 0`）。
	* ⇒ 没有同档重试时，**一次抖动就烧掉全部三级**，那条留空到下次重建。
	* ⚠️ 重试只对"同一输入、同一模板"有意义；**换输入（空行 vs 无空行）是换策略**，两者不互相替代。
	*/
	translateRetries: z.natural().min(0).max(5).default(1),
	/** 单次翻译调用的超时（毫秒）。 */
	translateTimeoutMs: z.natural().min(1e3).max(6e5).default(2e4),
	/** 单次翻译调用的输出上限（tokens）。 */
	translateMaxTokens: z.natural().min(64).max(1e5).default(2e3),
	/**
	* ⭐ 裁决模型（B 层）。**两个都为空 ⇒ 跟随主会话默认模型**。
	*
	* ⚠️ 建议显式选一个**判断力好**的（如 `deepseek-v4.1-flash`）——
	* 跟随主会话可能用的是贵模型，而这一步要看全库 tag + 正文。
	*/
	tagNormalizeProvider: z.string().default(""),
	tagNormalizeModel: z.string().default(""),
	/** 单次裁决调用的超时（毫秒）。⚠️ 比翻译长：它要读正文 + 全库词表。 */
	tagNormalizeTimeoutMs: z.natural().min(1e3).max(6e5).default(6e4),
	/** 单次裁决调用的输出上限（tokens）。⚠️ 输出是映射表，要给足。 */
	tagNormalizeMaxTokens: z.natural().min(64).max(1e5).default(4e3),
	/**
	* ⭐⭐⭐ **裁决模型的思考等级**（决策 168）。
	*
	* 🔴🔴 **用户裁定**（2026-09-28）：
	* > *"还是要把裁决模型的思考关到最低。……哪怕选的是跟随主会话模型，
	* >   也要把裁决模型的思考关掉。"*
	*
	* ⭐ **为什么必须显式给**：这一步只是判断"两个 tag 是不是同义"，不需要推理链；
	*    而**思考会吃掉 `maxTokens`** —— 实测 `hy3` 在非 off 档会把预算烧光。
	*
	* ⭐ **实测（2026-09-28，经 DSH 内部路由；见决策 168）**：
	*
	* | 模型 | 档位 | 思考字符 | 正文 | 耗时 |
	* |---|---|---|---|---|
	* | `deepseek-v4.1-flash` | **`off`** | **0** | ✅ | 1373ms |
	* | `deepseek-v4.1-flash` | `low` | 73 | ✅ | 1521ms |
	* | `deepseek-v4.1-flash` | `high` | 91 | ✅ | 1422ms |
	* | `hy3` | **`off`** | 0 | 🔴 **空** | **2ms** |
	* | `hy3` | 不传 | 42 | ✅ | 1621ms |
	*
	* ⚠️ **顺带否掉一条旧记载**：知识库条目 `045f1832` 说**直连** workbuddy 时
	*    `reasoning_effort:"off"` 会 **400**；但**经 DSH 路由不会**（插件 shim 做了归一）
	*    ⇒ ⭐ **两条记载冲突时以实测为准**（那条讲的是直连场景）。
	*
	* ⚠️ **`off` 是受控值之一**：DSH 侧档位 id 为 `off` / `low` / `medium` / `high`
	*    （WorkBuddy 路由另支持 `max`）—— 见 `dsh-workbuddy-connect/src/adapter.ts`。
	*    空串 = **不传**（用上游默认），⚠️ 与"关到最低"的意图相反，不推荐。
	*/
	tagNormalizeReasoningEffort: z.union([
		z.const(""),
		z.const("off"),
		z.const("low"),
		z.const("medium"),
		z.const("high")
	]).default("off"),
	/**
	* ⭐⭐⭐ **轮次结束时有知识沉淀 ⇒ 自动跑一次标签规范化**（决策 165）。
	*
	* 🔴 **为什么是"插件自动做"而不是"回执里催模型去调"**：
	*    用户原话：*"直接在有知识沉淀的轮次结束后，校验，如果需要调用工具的话，
	*    **由插件发起**子代理调用去处理。"*
	*    ⭐ 这条比"回执里催模型"干净 —— 插件的动作与 `handoff` 的收尾指令
	*    （"到此为止、不要自行动作"，决策 61）**不冲突**：那条管的是**模型**，
	*    这条是**插件**自己在动。
	*
	* ⭐ **默认开**（用户 2026-09-28 裁定）。
	* ⚠️ 关掉时**什么都不做**：不起子代理、也不在回执里提这件事
	*    （用户原话：*"关闭的时候…就直接不做这个事了"*）。
	*/
	tagNormalizeOnHandoff: z.boolean().default(true),
	/** ⭐ **主动注入总开关**（默认关）。关着时**一个监听器都不挂**（零开销）。 */
	activeInject: z.boolean().default(false),
	/**
	* ⭐⭐ **召回通路**（§6.1）。
	*
	* - `chat`（默认）：OpenAI 兼容 `/chat/completions`，走 DSH 内部模型路由
	* - `jev`：Knox 网关的 TypeSafe 决策模型 `/v1/systemone`（**直连 fetch**）
	*
	* 🔴 **不要把"通路"从模型名隐式推导**（如"名字含 jev 就走 systemone"）——
	*    换模型时会**静默走错端点**。**显式配置**。
	*/
	activeInjectChannel: z.union([z.const("chat"), z.const("jev")]).default("chat"),
	/**
	* ⭐ **该通路下的模型**（`provider/model` 形式；空 = 功能不生效）。
	*
	* ⚠️ 两条通路的取值来源不同：`chat` 走 `ctx.llm.listProviders()`；
	*    `jev` 走 Knox 网关的模型名（`jev-latest`）。
	*/
	activeInjectModel: z.string().default(""),
	/**
	* ⭐ **清单范围**（§6.0）：`project` / `project+themes` / `all`。
	*
	* 🔴 **真正的约束是 token 预算，不是"条数硬顶"**（2026-09-26 更正）：
	*    实测（本机）：`project+themes` 在 `dsh-memj` 上是 **245 条**；
	*    `project` 是 **208 条** —— 而英文清单下**每条候选 ≈ 213 token**（输入+输出）
	*    ⇒ 208 条**光自己**就占 **44.6k**，40k 预算下**必然被裁**（实测 208 → 168）。
	*    ⭐ 留多少条由 {@link activeInjectBudgetTokens} 决定（`planBudget`），
	*    ⚠️ **`activeInjectPoolMax` 已不再是召回路径的判据**（那条"超顶粗筛"路径已删除）。
	*/
	activeInjectScope: z.union([
		z.const("project"),
		z.const("project+themes"),
		z.const("all")
	]).default("project+themes"),
	/**
	* ⭐ **JEV 通路下的默认档降级**（用户 2026-09-26 裁定 B）。
	*
	* 🔴 **为什么需要**：`project+themes` 是默认档（245 条），在 JEV 的预算下会被裁掉很多
	*    ⇒ 默认配置下每次都要裁候选池（⚠️ **按时间裁 ⇒ 有系统性偏差：新的留下、老的丢掉**）。
	*    ⭐ 本开关为真时，**JEV 通路把 `project+themes` 降级成 `project`**（208 条），
	*    把范围收窄到"本项目"，减少裁剪带来的偏差。
	* ⚠️ 它**只影响 JEV 通路**：chat 通路的预算按窗口 60% 算，通常很宽裕。
	*/
	activeInjectJevNarrowScope: z.boolean().default(true),
	/**
	* ⭐ **触发口径**（裁定 A-1）：`true`=严格（只认 reasoning 块结束）；
	* `false`=宽松（首个 text 也算）。
	*
	* ⚠️ 严格档下**不输出思考的模型永不触发**（实测触发面约 69%）。
	*/
	activeInjectStrict: z.boolean().default(true),
	/** 命中时最多注入几条。 */
	activeInjectTopK: z.natural().min(1).max(50).default(5),
	/**
	* ⭐⭐ **「要不要注入」的门槛**（三个总控分里的 `need` ≥ 此值才继续）。
	*
	* 🔴🔴 **2026-09-29 从 `activeInjectBand` 拆出来的** —— 原来一个键**兼两个语义**：
	*    · 「这一轮**要不要**知识」（`need`，主观需求强度）
	*    · 「**哪几条**知识够格」（每条候选的 `noul`，条目相关度）
	*    ⚠️ 而这两者的**分数分布完全不同** ⇒ 一个阈值必然错一个：
	*    实测 1359 次召回里 **393 次**倒在"need < 0.7"（need 中位数只有 **0.66**），
	*    另有 **174 次**倒在"need 达标了、但候选没一条到 0.7"。
	*    ⭐ 判据：**一个键同时决定"要不要"与"要哪个"时，它的取值必然在两边都不对**。
	*/
	activeInjectNeedMin: z.number().min(0).max(1).default(.7),
	/**
	* ⭐⭐ **「哪几条候选够格」的门槛**（每条候选的 `noul` ≥ 此值才进候选集）。
	*
	* ⚠️ 它是**同一次请求里的两种 `noul`**（总控 vs 逐条），但**语义与分布都不同**：
	*    总控 `need` 回答"整轮需不需要"，候选 `noul` 回答"这一条相不相关"。
	* ⭐ 沿用 JEV 召回知识的**分带**口径：`≥0.7 act / 0.4~0.7 review / <0.4 drop`
	*    —— 0.7 本来就是"act 带"的下沿，**它属于这里，不属于 `need`**。
	*/
	activeInjectItemMin: z.number().min(0).max(1).default(.7),
	/** 召回超时（官方 `deadline`）。 */
	activeInjectTimeoutMs: z.natural().min(500).max(12e4).default(8e3),
	/**
	* ⭐ **上下文截取的轮数**（§6.5）：
	* 取「本 turn 的全部消息 + 最近 N 轮用户消息」。
	*/
	/**
	* ⚠️ **已作废的旋钮**（2026-09-26 起**召回路径不再读它**）。
	*
	* 🔴 **为什么留着**：它是**用户可见的配置项**（面板上有），
	*    直接从 schemastery 里删掉会让**已写进 `cordis.patch.yml` 的值**变成未知键
	*    （本项目对"未知配置键"的处理未验证）⇒ ⭐ **保留字段、但如实标注它已不生效**。
	*
	* ⭐ **取代它的是 turn 级裁剪**：上下文现在按"**从较早的历史整轮丢**"裁
	*    （见 §6.5 / `active-context.ts` 的 `assembleContext`），
	*    不再有"取最近 N 轮"这个口径 —— 因为实测那个口径会把**思考与工具结果**全带进来
	*    （思考 166 万字符、工具 169 万字符）。
	* ⚠️ 面板上这个输入框**建议下掉**（留着会让人以为它还在起作用 ⇒ **界面在撒谎**）。
	*/
	activeInjectContextRounds: z.natural().min(1).max(50).default(3),
	/**
	* ⚠️ **已作废的旋钮**（2026-09-26 起**召回路径不再读它**）。
	*
	* 🔴 **它原来的用途**：候选超过 240 条（JEV 硬顶）时触发**本地相关性粗筛**
	*    （`lexicalPrefilter`，**那个函数已删除**）。
	* ⭐ **取代它的是 token 预算**：留多少条候选由 {@link activeInjectBudgetTokens} 决定，
	*    超出时按 `updatedAt` **从旧到新**裁（`planBudget` → `trimCandidates`）。
	*
	* ⚠️ **两者不能混为一谈**（本批实测踩到）：
	*    · 那条旧的粗筛按**相关性**漏；新的预算裁剪按**时间**漏（**有系统性偏差：新的留下**）；
	*    ⇒ 所以旧字段 `prefilted`（"按相关性粗筛过"）已改名为 **`trimmedByBudget`**。
	* ⚠️ 面板上这个输入框**建议下掉**（留着会让人以为它还在起作用）。
	*/
	activeInjectPoolMax: z.natural().min(10).max(2e3).default(240),
	/** 是否要模型给"为什么选它"（⚠️ 开了就违背"输出越少越好"，**仅调试用**）。 */
	activeInjectExplain: z.boolean().default(false),
	/** **(b) 搜索意图**抑制开关（§6.6）：主模型已表达检索意图 ⇒ 不注入。 */
	activeInjectSearchIntentGate: z.boolean().default(true),
	/** **仅 JEV 通路**：`search_intent` 概率 ≥ 此值才算"有意图"（⚠️ 刻意保守，见 §6.6）。 */
	activeInjectSearchIntentMin: z.number().min(0).max(1).default(.85),
	/** **(a) 已有知识充足**抑制开关（§6.6）。 */
	activeInjectSufficientGate: z.boolean().default(true),
	/** **仅 JEV 通路**：`sufficient` 概率 ≥ 此值才算"已充足"。 */
	activeInjectSufficientMin: z.number().min(0).max(1).default(.85),
	/**
	* ⭐⭐ **一个 turn 内最多【真正注入】几次**（§7.4 ②）。
	*
	* 🔴🔴 **计数口径（2026-09-27 更正：从"调用"改成"注入"）**：
	*    **只对"真的把知识注进会话"计数**。以下**一律不计**：
	*      · 判完"不需要"（被抑制）；· 没选出条目；· 额度已满而跳过；
	*      · 选中了但**全都还在窗口里**（内容去重后为空 ⇒ 一个字都没注进去）。
	*    ⭐ 用户原话：*"每轮最多 3 次注入，没有注入的不算次数。"*
	*
	* ⚠️ **为什么必须改**（2026-09-27 实测的生产证据）：
	*    旧口径 = "最多调 3 次召回模型"。而实测**一个 turn 前几步很容易全是
	*    "没选出条目"**（需求分没过带）⇒ 3 次额度**在真正需要知识的那几步之前就耗光**。
	*    实测会话 `2b809b4a` 的 turn 6 正是这样：3 次额度全被"非注入"的召回吃掉，
	*    之后一路 `skipped: 本 turn 召回调用已达上限` ⇒ **整个 turn 一次都没注入**。
	*
	* 🔴 **代价（须知，别当成 bug）**：**"调用"本身不再有上限** ⇒
	*    一个 turn 的召回调用数 ≈ 该 turn 的 **step 数**（每次"思考结束"触发一次）。
	*    ⚠️ 但**一旦注入满 3 次，后续 step 的召回会被跳过**（不做无用的调用）。
	*/
	activeInjectMaxInjectionsPerTurn: z.natural().min(0).max(50).required(false),
	/**
	* ⚠️ **已废弃的旧键**（2026-09-27 改名；旧语义 = "每 turn 最多调几次召回模型"）。
	*
	* 🔴 **为什么留着不删**（本项目既有做法，见 `activeInjectPoolMin` 的注释）：
	*    ① 已写进 `cordis.patch.yml` 的旧值**不能变成未知键**；
	*    ② 用户可能手工设过非默认值 ⇒ **改名不该静默重置他的配置**。
	* ⇒ 用 `maxInjectionsPerTurn(config)` 读：**新键优先、旧键回落、最后回默认 3**。
	* ⚠️ **前端不再提交这个键**（面板只写新键）。
	*/
	activeInjectMaxCallsPerTurn: z.natural().min(0).max(50).required(false),
	/** 上下文里 **reasoning 段的字符上限**（§6.5；超了截断 —— 它要进召回输入，会挤预算）。 */
	activeInjectReasoningMaxChars: z.natural().min(100).max(1e5).default(800),
	/**
	* ⭐⭐ **JEV 通路的预算开关**（默认**开**）。
	*
	* ⭐ 用户原话："jev 通道，两者加起来不应该超过 50k token（**这个总量应该做个开关**）"
	*    —— 后经确认那是**旋钮**（不是开关）：默认 50k，可调。
	* ⚠️ 拿它当**总开关**用：关掉 ⇒ **不检查预算**（尽量多放；超了由上游 400 决定）。
	*    ⚠️ 关掉**不等于安全** —— 实测超限就是 `max_tokens_exceeded`。
	*/
	activeInjectBudget: z.boolean().default(true),
	/**
	* ⭐⭐ **单次请求的 token 预算**（**输入 + 输出**合计；默认 **40000**）。
	*
	* 🔴 **口径是"一次请求"，不是"所有批次之和"** ——
	*    每个批次都要带**同一份上下文**（JEV 要靠它判断），所以
	*    "并发 K 批"的实际覆盖面是 `K × 每批候选数`。
	*
	* ⚠️ 实测背景（供日后调参）：
	*    · 英文清单下每条候选 ≈ **194 token 输入 + 18.6 token 输出** ⇒ 每条约 **213**；
	*    · 198 条 + 20k 字符上下文 ⇒ 单批 **400**；拆两批各 99 条 ⇒ 两批都成功；
	*    · 二分实测失败边界（in+out）：40 候选→36.3k、120→42.6k、208→48.8k。
	* 🔴 **必须连【输出】一起算** —— 只算输入会"以为没超、实际 400"（真踩过）。
	*/
	activeInjectBudgetTokens: z.natural().min(1e3).max(2e5).default(4e4),
	/**
	* ⭐⭐ **上下文的名义预算**（默认 **20000**）—— 用户 2026-09-26 原话：
	*    *"这种情况下，会话上下文，我们直接给到 20k 的预算。剩下的给候选池"*。
	*
	* 🔴 **它是"先给这么多"，不是"最多这么多"**：当需要更多批次才能装下候选池时，
	*    `planInjection` 会**主动往下压**这个值（腾出每批的候选容量），
	*    一直压到**地板**（只剩当前轮）为止。
	* ⚠️ 反过来它也**不会超**：实际取 `min(名义值, 总预算 − 候选容量 − 开销)`。
	*/
	activeInjectContextTokens: z.natural().min(1e3).max(2e5).default(2e4),
	/**
	* ⭐⭐ **并发批数上限**（默认 **3**）—— 用户 2026-09-26：*"应该有个并发数旋钮"*。
	*
	* ⚠️ **它的作用**：候选池装不进 1 批时，允许拆成至多这么多批**并发发出**；
	*    若拆到这么多批仍装不下 ⇒ ⭐ **减上下文**（腾出候选容量），
	*    压到地板仍不够 ⇒ 照发并如实标记（**绝不裁候选** —— "不丢知识"是这套方案的初衷）。
	* ⭐ 实测：拆 2 批并发的墙钟 ≈ 单批（96 条单批 2013ms vs 拆两批 1958ms）
	*    —— 因为瓶颈是**网关排队**而不是模型计算。
	* ⚠️ **只对 JEV 通路生效**；`chat` 通路不拆批（它按窗口 60% 算，通常很宽裕）。
	*/
	activeInjectConcurrency: z.natural().min(1).max(16).default(3),
	/**
	* ⭐⭐ **chat 通路占模型上下文窗口的比例**（默认 **0.6** = 60%）。
	*
	* ⭐ 用户裁定：*"chat通道则是不超过模型上下文窗口的60%，估计很难达到这个阈值。"*
	* ⚠️ **拿不到窗口大小 ⇒ 不检查**（`budgetTokensFor` 返回 0）——
	*    宁可不裁，也不要凭猜去裁（裁错了会白丢知识）。
	*/
	activeInjectChatWindowRatio: z.number().min(.1).max(1).default(.6),
	/**
	* ⭐⭐ **召回日志要不要记"请求快照"**（B 档；**默认关**）。
	*
	* 内容：真正发给 JEV 的 `state`（上下文 + 全部候选）与问了哪些键
	* ⇒ 打开后**可以重放**某一次召回，复现"同一条上下文为什么得这个分"。
	*
	* 🔴 **为什么默认关**（用户 2026-09-27 要求三档都要，但这一档代价真实）：
	*    一个 turn 有 5~8 个 step、每步一份**数十 KB** 的上下文快照
	*    ⇒ **几轮就能把磁盘写爆**。⭐ 它是"要复现问题时再临时打开"的旋钮。
	*
	* ⚠️ 另外两档（A 结论 / C 注入正文）**恒开** —— 它们很小，且是排障的主力。
	*/
	activeRecallLogRequest: z.boolean().default(false),
	/**
	* ⚠️ **已作废的旋钮**（2026-09-26 起**召回路径不再读它**）。
	*
	* 🔴 **它原来的用途**：候选池被预算裁到只剩这么几条时就停手。
	* ⭐ **取代它的是拆批**：新方案**根本不裁候选**了 ——
	*    装不下就拆批并发（`activeInjectConcurrency`），上下文压到地板仍不够就照发。
	* ⚠️ 面板上这个输入框**建议下掉**（留着会让人以为它还在起作用 ⇒ 界面在撒谎）。
	*/
	activeInjectPoolMin: z.natural().min(1).max(500).default(10),
	/**
	* ⭐ **JEV 直连端点与凭据引用**（§6.1；`channel==='jev'` 时用）。
	*
	* ⚠️ **为什么不走 `ctx.llm`**：DSH 内部路由**没有** JEV 的 `systemone` 形态
	*    （`settings.yaml` 里把 `jev-latest` 声明成普通 chat 模型，选它会 400
	*    —— `README-JEV-RECALL.md` 踩坑 2/3）⇒ 只能**直连**。
	* ⭐ 而直连**天然不经过 `llm/stream`** ⇒ 不会触发自己的监听器（无递归风险）。
	*
	* 🔴🔴 **2026-10-07：这两个键已被 `decisionProviders` 取代**（用户要求
	*    "可以配置多个决策型模型，有不同的 provider 和对应的模型"）。
	*    ⚠️ **仍然保留**：一是旧 patch 里可能有值（删了会变未知键），
	*    二是 `decisionProviders` 为空时**回落到它们**（"改名不丢旧值"的既有纪律）。
	*    ⇒ 新代码**不要**直接读它们，走 `decisionProviderOf()`。
	*/
	activeInjectJevEndpoint: z.string().default("https://api.knox.chat/v1/systemone"),
	/** JEV 凭据的**环境变量名**（用 `ctx.credentials.resolve()` 取，**不落盘、不打日志**）。 */
	activeInjectJevApiKeyEnv: z.string().default("KNOX_API_KEY"),
	/**
	* ⭐⭐⭐ **JEV 决策模型的模型名**（用户 2026-10-07 要求"统一配置的地方"）。
	*
	* ⚠️ **取值口径（新键优先、旧键回落）**：本键为空时回落到各功能自己的键
	*    —— 免得已写在 `cordis.patch.yml` 里的旧值被静默丢弃。
	* ⚠️ **形态是【纯模型名】**（网关下的名字，如 `jev-latest`），**不是** `provider/model`。
	* 🔴 **2026-10-07 晚：已被 `decisionProviders` 取代**（同上面那两个键的处置）。
	*/
	jevModel: z.string().default("jev-latest"),
	/**
	* ⭐⭐⭐ **决策模型提供商**（用户 2026-10-07 要求，照 DSH 官方「模型」页同构）。
	*
	* ── 用户原话 ─────────────────────────────────────────────────────────
	* > *"就也应该像 dsh 官方的模型设置一样，而且可以配置多个决策型模型。
	* >   有不同的 provider，和对应的模型才对啊。"*
	* > *"就跟翻译模型这个类似。"*（指那个按 provider 分组的 optgroup 下拉）
	*
	* ── 形态（照官方 `llm-pi-ai` 的 provider profile 同构）────────────────
	* 每个 provider 一条：
	* | 字段 | 说明 |
	* |---|---|
	* | `id` | 路由标识（如 `knox`）—— 🔴 **凭据名由它派生**（`knox` → `KNOX_API_KEY`） |
	* | `displayName` | 给人看的名字（空则显示 id） |
	* | `endpoint` | 该 provider 的端点（如 `https://api.knox.chat/v1/systemone`） |
	* | `models` | **该 provider 下的模型名列表**（决策模型的"目录"） |
	*
	* 🔴 **为什么不做成"协议"字段**：官方那页要 `protocol` 是因为它通用
	*    （OpenAI/Anthropic/Responses 都得声明）。而本页**只服务决策模型**这一种
	*    形态（`{model,state,questions}` → `{answers:{…:noul}}`）⇒ 协议是**固定的**，
	*    给用户一个只有一个选项的下拉框是**假选择**。
	*    ⚠️ 将来真接第二种决策协议时再加（那时加才是有意义的）。
	*
	* ⭐ **凭据名派生规则与官方一致**（`deriveDecisionKeyRef`）：`<ID>_API_KEY`
	*    （大写、非字母数字换下划线）⇒ `knox` → **`KNOX_API_KEY`**
	*    （与旧键 `activeInjectJevApiKeyEnv` 的默认值**恰好相同** ⇒ 无缝迁移）。
	*    ⭐ 官方文档原话：*"页面从不询问环境变量名"* —— 本页照做。
	*/
	decisionProviders: z.array(DecisionProviderSchema).default([]),
	/**
	* ⭐⭐ **两条决策通路各自选中的"provider/model"**（用户 2026-10-07 要求）。
	*
	* 用户原话：*"和现在的 dsh 模型一样放在一起去选。就不要通路筛选了，
	*   就选决策型通路的时候，也给全列表。让用户判断是否是决策性模型，是否匹配通路。"*
	* ⇒ 这两个键存 **`<providerId>/<modelName>`**，与 chat 通路的
	*    `activeInjectModel` / `hotScoreModel` **同形**（都是 `provider/model`）。
	* ⚠️ 空 = 未选（该通路不生效）。回落顺序见 `decisionPickOf()`。
	*/
	activeInjectDecisionPick: z.string().default(""),
	hotScoreDecisionPick: z.string().default("")
});
/** 每 turn 最多注入几次的**默认值**（改名后仍取 3 —— 与旧键默认值一致）。 */
const ACTIVE_MAX_INJECTIONS_DEFAULT = 3;
/**
* ⭐⭐ **读"每 turn 最多注入几次"**（2026-09-27 从"调用"改成"注入"）。
*
* 取值优先级（**别改顺序**）：
*   ① `activeInjectMaxInjectionsPerTurn`（**新键**，语义正确）；
*   ② `activeInjectMaxCallsPerTurn`（**旧键**，旧语义 = 调用次数）⇒ 回落，
*      免得已写在 `cordis.patch.yml` 里的旧值被静默丢弃；
*   ③ 都没有 ⇒ `ACTIVE_MAX_INJECTIONS_DEFAULT`。
*
* ⚠️ **为什么单独抽一个函数**：三个消费点（额度检查 / 面板回显 / 输入上限提示）
*    都要用同一个判据 —— 本项目铁律"同一判据只有一份实现"。
*    散着写 `config.a ?? config.b ?? 3` 迟早漂移。
* @param config - 解析后的配置。
* @returns 上限（非负整数）。
*/
function maxInjectionsPerTurn(config) {
	return config.activeInjectMaxInjectionsPerTurn ?? config.activeInjectMaxCallsPerTurn ?? 3;
}
/** ⭐⭐ 两个 `band` 键的默认值（拆键前的旧值就是 0.7 ⇒ 保持行为连续）。 */
const ACTIVE_BAND_DEFAULT = .7;
/**
* ⭐⭐ **读「要不要注入」的门槛**（总控分 `need`）。
*
* 取值优先级（**别改顺序**）：
*   ① `activeInjectNeedMin`（**新键**，语义正确）；
*   ② `activeInjectBand`（**旧键**，旧语义 = 一个键兼两职）⇒ 回落，
*      免得已写在 `cordis.patch.yml` 里的旧值被静默丢弃；
*   ③ 都没有 ⇒ `ACTIVE_BAND_DEFAULT`。
*
* ⚠️ **旧键回落给的是"两个键同一个值"** —— 这正是旧行为，
*    所以升级后**不改变已运行配置的表现**（想分开调才去动新键）。
* @param config - 解析后的配置。
* @returns 0~1 的门槛。
*/
function needMinOf(config) {
	return config.activeInjectNeedMin ?? config.activeInjectBand ?? .7;
}
/**
* ⭐⭐ **读「哪几条候选够格」的门槛**（逐条候选的 `noul`）。
*
* 取值优先级同 {@link needMinOf}：新键 → 旧键 `activeInjectBand` → 默认。
*
* 🔴 **为什么必须与 `needMinOf` 分开成两个函数**：它们是**两种不同的 `noul`**
*    （总控 vs 逐条），分布不同 ⇒ 同一句话里同时出现两个
*    `config.activeInjectNeedMin` / `config.activeInjectItemMin` 时，
*    靠肉眼极易看错（它们只差几个字符）。
* @param config - 解析后的配置。
* @returns 0~1 的门槛。
*/
function itemMinOf(config) {
	return config.activeInjectItemMin ?? config.activeInjectBand ?? .7;
}
/** 默认配置（探针与测试可直接复用）。 */
const DEFAULT_CONFIG = {
	readFullMaxChars: 3e3,
	readLogMaxEntries: 50,
	readLogTrimCount: 25,
	searchLimit: 30,
	injectProtocol: true,
	similarEditDistance: 2,
	themeCreation: "loose",
	progressCharsWarn: 2e4,
	backupGit: false,
	backupGitFailLimit: 3,
	progressCharsKeep: 12e3,
	hotInject: false,
	hotInjectRatio: .333,
	hotCharsPerToken: 1,
	hotBudgetCharsFallback: 4e4,
	hotFullWarnChars: 1e3,
	hotSessionKeep: 50,
	enIndex: true,
	enIndexDiag: false,
	translateProvider: "",
	translateModel: "",
	translateTemplate: "instruct",
	translateConcurrency: 3,
	translateRetries: 1,
	translateTimeoutMs: 2e4,
	translateMaxTokens: 2e3,
	tagNormalizeProvider: "",
	tagNormalizeModel: "",
	tagNormalizeTimeoutMs: 6e4,
	tagNormalizeMaxTokens: 4e3,
	tagNormalizeReasoningEffort: "off",
	tagNormalizeOnHandoff: true,
	hotScoreOnTurnEnd: false,
	contextReportOnTurnEnd: false,
	contextReportMinPercent: 50,
	contextReportStepPercent: 10,
	hotScoreThreshold: .7,
	hotScoreWindowHours: 30,
	hotScoreTopN: 20,
	hotScoreGateMinScore: 2,
	hotScoreGateLastTurn: true,
	hotScoreMaxPicks: 10,
	hotScoreMinChars: 100,
	hotScoreChannel: "chat",
	hotScoreModel: "workbuddy/deepseek-v4.1-flash",
	hotScoreSubagentProvider: "",
	hotScoreSubagentModel: "",
	hotScoreTimeoutMs: 6e4,
	activeInject: false,
	activeInjectChannel: "chat",
	activeInjectModel: "",
	activeInjectScope: "project+themes",
	activeInjectJevNarrowScope: true,
	activeInjectStrict: true,
	activeInjectTopK: 5,
	activeInjectNeedMin: .7,
	activeInjectItemMin: .7,
	activeInjectTimeoutMs: 8e3,
	activeInjectContextRounds: 3,
	activeInjectPoolMax: 240,
	activeInjectExplain: false,
	activeInjectSearchIntentGate: true,
	activeInjectSearchIntentMin: .85,
	activeInjectSufficientGate: true,
	activeInjectSufficientMin: .85,
	activeInjectMaxInjectionsPerTurn: 3,
	activeInjectMaxCallsPerTurn: 3,
	activeInjectReasoningMaxChars: 800,
	activeInjectBudget: true,
	activeInjectBudgetTokens: 4e4,
	activeInjectContextTokens: 2e4,
	activeInjectConcurrency: 3,
	activeInjectChatWindowRatio: .6,
	activeRecallLogRequest: false,
	activeInjectPoolMin: 10,
	activeInjectJevEndpoint: "https://api.knox.chat/v1/systemone",
	activeInjectJevApiKeyEnv: "KNOX_API_KEY",
	jevModel: "jev-latest",
	decisionProviders: [],
	activeInjectDecisionPick: "",
	hotScoreDecisionPick: ""
};
/**
* ⭐⭐⭐ **由 provider id 派生凭据名**（**与 DSH 官方同一条规则**）。
*
* 官方文档原话：*"页面从不询问环境变量名"* —— 它把 typed key 存到
* `<ROUTE>_API_KEY` 这个**派生**出来的引用下。本页照做。
* ⚠️ 好处是 `knox` → **`KNOX_API_KEY`**，与本插件旧键
*    `activeInjectJevApiKeyEnv` 的**默认值恰好相同** ⇒ 无缝迁移。
* @param providerId - provider 路由 id（如 `knox`、`my-gw`）。
* @returns 凭据名（POSIX 环境变量名形态）。
*/
function deriveDecisionKeyRef(providerId) {
	const stem = providerId.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
	return `${stem === "" ? "DECISION" : stem}_API_KEY`;
}
/**
* ⭐⭐ **决策模型 provider 的"生效列表"**（**唯一出处**）。
*
* 取值口径（**别改顺序**）：
*   ① `decisionProviders`（**新键**，用户在页面上配的多 provider 列表）；
*   ② 为空时 ⇒ **回落成单条旧配置**（`activeInjectJevEndpoint` +
*      `activeInjectJevApiKeyEnv` + `jevModel`）—— 免得旧 patch 里的值被静默丢弃。
*      ⭐ 回落出来的那条 `id` 取 `knox`（于是派生名正好是 `KNOX_API_KEY`）。
* ⚠️ **做成一个函数**而不是让两处各自拼：本项目铁律"判据只写一份"。
* @param config - 生效配置。
* @returns provider 列表（**永远非空**；至少回落到那一条旧配置）。
*/
function decisionProvidersOf(config) {
	const list = (config.decisionProviders ?? []).filter((p) => p.id.trim() !== "");
	if (list.length > 0) return list;
	const endpoint = (config.activeInjectJevEndpoint ?? "").trim();
	const model = (config.jevModel ?? "").trim();
	if (endpoint === "" || model === "") return [];
	return [{
		id: "knox",
		displayName: "",
		endpoint,
		models: [model]
	}];
}
/**
* ⭐⭐ **某一列 provider 里，某个"选集"指向哪一条**（消费者侧的唯一解析入口）。
*
* 选集形态 = `<providerId>/<modelName>`（与 chat 通路的 `provider/model` **同形**）。
* ⚠️ 回落顺序：选集本身 → 该 provider 的**第一个模型** → 空字符串（= 未选）。
* @param providers - `decisionProvidersOf()` 的结果。
* @param pick - 选集字符串（`<providerId>/<modelName>`）。
* @param fallbackProviderId - 选集为空时用哪个 provider 兜底（`'knox'` 等）。
* @returns `{provider, model, endpoint, keyRef}`；选不出时 `provider/model` 为空。
*/
function resolveDecisionPick(providers, pick, fallbackProviderId = "knox") {
	const raw = (pick ?? "").trim();
	let pid = "";
	let model = "";
	if (raw !== "") {
		const i = raw.indexOf("/");
		if (i > 0 && i < raw.length - 1) {
			pid = raw.slice(0, i);
			model = raw.slice(i + 1);
		} else {
			const hit = providers.find((p) => p.models.includes(raw));
			if (hit !== void 0) {
				pid = hit.id;
				model = raw;
			}
		}
	}
	const prov = providers.find((p) => p.id === pid) ?? providers.find((p) => p.id === fallbackProviderId) ?? providers[0];
	if (prov === void 0) return {
		provider: "",
		model: "",
		endpoint: "",
		keyRef: ""
	};
	const m = model !== "" && prov.models.includes(model) ? model : prov.models[0] ?? "";
	return {
		provider: prov.id,
		model: m,
		endpoint: prov.endpoint,
		keyRef: deriveDecisionKeyRef(prov.id)
	};
}
/**
* ⭐ **主动注入（召回）那条通路当前选中的决策模型**。
*
* 回落：`activeInjectDecisionPick`（新）→ `activeInjectModel`（旧，可能是裸模型名）。
*/
function activeDecisionOf(config) {
	return resolveDecisionPick(decisionProvidersOf(config), (config.activeInjectDecisionPick ?? "").trim() !== "" ? config.activeInjectDecisionPick : (config.activeInjectModel ?? "").trim(), "knox");
}
/** ⭐ **轮末评分那条通路当前选中的决策模型**（回落：`hotScoreModel`）。 */
function scoreDecisionOf(config) {
	return resolveDecisionPick(decisionProvidersOf(config), (config.hotScoreDecisionPick ?? "").trim() !== "" ? config.hotScoreDecisionPick : (config.hotScoreModel ?? "").trim(), "knox");
}
//#endregion
//#region src/store.ts
/**
* 库的读写与派生层重建（方案 §2 / §3.3 / §4.4 / §7）。
*
* ── 本模块的职责边界 ───────────────────────────────────────────────────────
* **它是唯一的落盘处**：项目文档、条目正文、派生层（THEME/GLOBAL）、提名文件，
* 全部经这里写。上层（工具）只负责"决定写什么"，不直接碰文件。
*
* ── 派生层的性质（§11.3）────────────────────────────────────────────────────
* `themes/THEME-*.md` 与 `GLOBAL.md` 是**投影**——内容全部由项目文档里的封面聚合而来，
* **手改它们会在下次 rebuild 时丢失**。这是"唯一源头"这条铁律的固有代价。
* ⚠️ 唯一的例外：THEME 文档 frontmatter 里的 **`desc` 必须保留**（§4.3），
* 它没有别的来源，被清掉就得每次重写。
*
* @module dsh-memj/store
*/
var store_exports = /* @__PURE__ */ __exportAll({
	KNOWLEDGE_SECTION: () => KNOWLEDGE_SECTION,
	KNOWLEDGE_TITLE: () => KNOWLEDGE_TITLE,
	NARRATIVE_SECTIONS: () => NARRATIVE_SECTIONS,
	NARRATIVE_TITLES: () => NARRATIVE_TITLES,
	PROGRESS_TITLE: () => PROGRESS_TITLE,
	SPEC_BLOCK_FENCE: () => SPEC_BLOCK_FENCE,
	SPEC_SECTION: () => SPEC_SECTION,
	SPEC_TITLE: () => SPEC_TITLE,
	addNomination: () => addNomination,
	appendDocRead: () => appendDocRead,
	appendReadSnapshot: () => appendReadSnapshot,
	approveNomination: () => approveNomination,
	buildSkeleton: () => buildSkeleton,
	byUpdatedDesc: () => byUpdatedDesc,
	consumeSnapshots: () => consumeSnapshots,
	cutKnowledgeSection: () => cutKnowledgeSection,
	cutSpecSection: () => cutSpecSection,
	deleteEntryFile: () => deleteEntryFile,
	deleteProjectDoc: () => deleteProjectDoc,
	deleteThemeDoc: () => deleteThemeDoc,
	docSectionsOf: () => docSectionsOf,
	ensureLibraryDirs: () => ensureLibraryDirs,
	extractSpecBlock: () => extractSpecBlock,
	extractSpecBlockLines: () => extractSpecBlockLines,
	extractSpecSection: () => extractSpecSection,
	findDocRead: () => findDocRead,
	fixCoverBlock: () => fixCoverBlock,
	fixExternalRef: () => fixExternalRef,
	isChatCover: () => isChatCover,
	isHistoryCover: () => isHistoryCover,
	isKnowledgeHeading: () => isKnowledgeHeading,
	loadEntryDoc: () => loadEntryDoc,
	loadProjectDoc: () => loadProjectDoc,
	loadThemeFrontmatter: () => loadThemeFrontmatter,
	projectIdFromFile: () => projectIdFromFile,
	readDocReads: () => readDocReads,
	readNominations: () => readNominations,
	readSnapshots: () => readSnapshots,
	readUnconsumedSnapshots: () => readUnconsumedSnapshots,
	rebuildDerivedLayers: () => rebuildDerivedLayers,
	rejectNomination: () => rejectNomination,
	removeNomination: () => removeNomination,
	renderSpecBlockLines: () => renderSpecBlockLines,
	scanLibrary: () => scanLibrary,
	sectionSpecsOf: () => sectionSpecsOf,
	sectionsFromNarrative: () => sectionsFromNarrative,
	setSectionSpecBlock: () => setSectionSpecBlock,
	specBlockFenceInfo: () => specBlockFenceInfo,
	specBlockRange: () => specBlockRange,
	stripAllSpecBlocks: () => stripAllSpecBlocks,
	stripSpecBlock: () => stripSpecBlock,
	syncEntryFrontmatter: () => syncEntryFrontmatter,
	writeEntryDoc: () => writeEntryDoc,
	writeGlobalDoc: () => writeGlobalDoc,
	writeNominations: () => writeNominations,
	writeProjectDoc: () => writeProjectDoc,
	writeThemeDoc: () => writeThemeDoc
});
/** 项目文档名的前缀与后缀。 */
const HANDOFF_PREFIX = "HANDOFF-";
const MD_SUFFIX = ".md";
/**
* 从项目文档名解析项目 id。
* @param fileName - 如 `HANDOFF-dsh-memj.md`。
* @returns 项目 id；不匹配返回 `undefined`。
*/
function projectIdFromFile(fileName) {
	if (!fileName.startsWith(HANDOFF_PREFIX) || !fileName.endsWith(MD_SUFFIX)) return void 0;
	const id = fileName.slice(8, -3);
	return id === "" ? void 0 : id;
}
/**
* 解析项目文档的 frontmatter。
*
* 容忍缺失——**不报错**，让上层用默认值兜底（文档可能是人刚手建的空壳）。
* @param data - frontmatter 数据（可能为 null）。
* @param fallbackId - 从文件名得到的 id。
* @returns 规范化后的 frontmatter。
*/
function normalizeProjectFrontmatter(data, fallbackId) {
	if (data === null) return {
		project: fallbackId,
		title: "",
		desc: "",
		themes: [],
		createdAt: "",
		updatedAt: "",
		archivedAt: "",
		template: "",
		truncateSections: []
	};
	return {
		project: typeof data["project"] === "string" && data["project"].trim() !== "" ? data["project"].trim() : fallbackId,
		title: typeof data["title"] === "string" ? data["title"] : "",
		desc: typeof data["desc"] === "string" ? data["desc"] : "",
		themes: toStringArray(data["themes"]),
		createdAt: typeof data["createdAt"] === "string" ? data["createdAt"] : "",
		updatedAt: typeof data["updatedAt"] === "string" ? data["updatedAt"] : "",
		archivedAt: typeof data["archivedAt"] === "string" ? data["archivedAt"] : "",
		template: typeof data["template"] === "string" ? data["template"] : "",
		truncateSections: readTruncateSections(data)
	};
}
/**
* ⭐ 读 `truncateSections`，**同时兼容老的单值字段 `truncateSection`**。
*
* 🔴 **为什么必须兼容**：决策 204 存的是**单个字符串**，决策 206 改成数组。
*    老文档若不被接住 ⇒ 读出来是空数组 ⇒ 调用方理解成"不截"
*    ⇒ **那些文档的「当前进度」再也不会自动瘦身**（正是 `a113fcb` 那个事故的同族）。
* ⚠️ 两个字段**同时存在**时以新的（数组）为准。
* @param data - frontmatter 原始数据。
* @returns 节名数组（已去掉空串）。
*/
function readTruncateSections(data) {
	const arr = toStringArray(data["truncateSections"]).map((s) => s.trim()).filter((s) => s !== "");
	if (arr.length > 0) return arr;
	const single = typeof data["truncateSection"] === "string" ? data["truncateSection"].trim() : "";
	return single === "" ? [] : [single];
}
/** 判断一张封面是否是「历史归档」条目。 */
function isHistoryCover(cover) {
	return cover.kind === "history";
}
/**
* ⭐ **判断一张封面是否是「问答」条目**（`kind: 'chat'`，「文档内提问」功能生成）。
*
* ⚠️ **它是保留项**（`reserved: true`）⇒ 模型选不到、也不能手选，
*    只能由插件在"阅读某条知识时节选提问"时自动创建。
*/
function isChatCover(cover) {
	return cover.kind === "chat";
}
/**
* ⭐⭐ **项目列表的排序判据：按 `updatedAt` 倒序**（最近更新的排最前）。
*
* 🔴 **为什么做在这里（`scanLibrary`）而不是各个接口/前端**：
* 项目列表有**四个消费方**——网页项目页、网页下拉框、`/memj-get-handoff-project`
* 的弹窗、以及该命令无参时的机读清单。做在出口 ⇒ **一处生效**；
* 做在消费方 ⇒ 同一语义会有 N 份实现（本项目已多次栽在这上面）。
*
* ⚠️ **空串排最后**：老项目没有 `updatedAt` 字段（读出空串），
* 不能让它靠"空串字典序最小"冒到最前面。
* ⚠️ **必须确定性**：`updatedAt` 相同的两条用 `id` 兜底比较——
* 否则同一份库两次扫描可能给出不同顺序，列表会莫名跳动。
* @param a - 项目记录。
* @param b - 项目记录。
* @returns 比较结果（`<0` ⇒ a 在前）。
*/
function byUpdatedDesc(a, b) {
	const av = a.frontmatter.updatedAt;
	const bv = b.frontmatter.updatedAt;
	if (av !== bv) {
		if (av === "") return 1;
		if (bv === "") return -1;
		return bv.localeCompare(av);
	}
	return a.id.localeCompare(b.id);
}
/**
* **磁盘全量扫描**的在飞登记（仅用于合并并发；扫描一结束就清空）。
* ⚠️ **只登记一份**（不带 options 键）：磁盘扫描与 options 无关 —— 见 `scanLibrary` 的注释。
*/
let inFlightScanAll;
/**
* 扫描整个库（项目文档 + 全部封面 + 主题清单）。
*
* ⚠️ 这是**唯一的全量扫描入口**，`memj_info` / `memj_search` / `rebuild` 都用它。
*
* ⭐⭐ **一次磁盘扫描 + 按 options 内存过滤**（2026-09-30 改造，第二次性能修正）：
*
*    **① 为什么要合并**：网页首页一次并发发 7 个接口，而**每个接口各自**调一次本函数。
*       库已长到 **900KB 文档 / 414 封面**（单次扫描 ~190ms）⇒
*       Node 单线程把这 7 次排成一条队 ⇒ **首屏要等 4~5 秒**
*       （实测：`/covers` 并发 4103ms、连 421B 的 `/health` 都要 2094ms，
*       而它们单独跑只有 1000ms / 357ms）。
*
*    **② 为什么合并的粒度是"整个库"、而不是"每种 options 一份"**：
*       那 7 个接口用了 **3 种 options**（`{}` / `{H}` / `{A}`），按 options 分组合并
*       ⇒ **仍要扫 3 轮库**（实测端到端：全部 API 完成 1889ms，而单次扫描只要 ~190ms
*       ⇒ 绝大部分时间花在"重复读同一批文件"上）。
*       ⇒ 现在**磁盘只扫一次（永远全量）**，各调用方要的视图由 `applyScanOptions`
*         在**内存里**过滤出来 —— ⭐ 过滤是纯内存 O(n)（<1ms），扫描是 ~190ms 的 IO。
*
*    **③ 为什么这样是安全的**：`scanLibrary(options)` 的**对外语义一字未变** ——
*       调用方拿到的仍是"已按自己 options 过滤好的快照" ⇒ **38 处调用点一行不用改**。
*       等价性全部由 `applyScanOptions` 承担（它必须逐字段对齐，见该函数的注释）。
*
* 🔴 **只合并"同时发生"的调用**（单个在飞登记），**扫描一结束就清空**
*    ⇒ **不跨请求保留结果**，所以**不会**让界面看到旧数据
*    —— 这是它与"TTL 缓存"的本质区别（本项目有「缓存导致刷新半生效」的前车之鉴）。
* @param options - 见 `ScanOptions`（默认排除归档物与历史条目）。
* @returns 库快照（**已按 options 过滤**）。
*/
async function scanLibrary(options = {}) {
	const p = inFlightScanAll ?? (inFlightScanAll = scanAllUnfiltered());
	let full;
	try {
		full = await p;
	} finally {
		inFlightScanAll = void 0;
	}
	return applyScanOptions(full, options);
}
/**
* 按 options 把**全量扫描结果**过滤成调用方要的视图。
*
* 🔴🔴 **本函数是"零语义变化"的全部关键**：它必须与旧实现（在扫描循环里逐条过滤）
*    **在每个字段上逐一对齐**，否则 38 处调用点会看到不同的库。三处必须特别小心：
*
*     · **项目排序**：旧实现是"**先过滤、再排序**"（`projects.sort` 只作用于已收集的那些）
*       ⇒ 这里也必须先过滤再排 —— 不能"对全量排完再过滤"（`byUpdatedDesc` 的空串兜底
*       比较会因此变序）；
*     · ⭐ **`themeIds` 必须从【过滤后的 covers】推导**：旧实现的 `themeIdSet` 只遍历
*       **已过滤**的 covers ⇒ 若在这里遍历全量，默认视图会**冒出"只在归档/历史封面里
*       出现过的主题"**（数字与列表都会变，正是本项目最忌讳的"数字悄悄变"）；
*     · **`issues` 不过滤**（决策 133：归档封面的硬校验问题照报，保持硬校验一致）。
* @param full - `scanAllUnfiltered()` 的结果。
* @param options - 见 `ScanOptions`。
* @returns 库快照。
*/
function applyScanOptions(full, options) {
	const includeArchived = options.includeArchived === true;
	const includeHistory = options.includeHistory === true;
	const includeChat = options.includeChat !== false;
	const projects = includeArchived ? [...full.projects] : full.projects.filter((p) => p.frontmatter.archivedAt === "");
	projects.sort(byUpdatedDesc);
	/**
	* ⭐⭐ **2026-10-13（「文档内提问」）：`chat` 刻意【不】在这里排除** ——
	*    用户裁定「chat 出现在知识库列表里」⇒ 它必须过 `scanLibrary`。
	*
	*    🔴 **"进列表" ≠ "进检索"，两者是两条路，别混**：
	*      · `scanLibrary()`（列表 / 读侧）⇒ **含 `chat`**（所以默认纳入）；
	*      · `memj_search` / 热知识注入（模型侧）⇒ **另有两处排除**
	*        （它是会话流水，不是可供复用的知识）。
	*    ⇒ ⭐ 判据：**要改模型侧那两处，不要顺手改这里** ——
	*      改这里 ⇒ 列表里点不开那些 chat 条目（而用户明确要能点开、要看问答）。
	*
	*    ⚠️ `includeChat` 默认 `true` ⇒ **读侧无需传参**；它只是给
	*      "某个调用方想排除 chat"留口子（当前没有这种调用方）。
	*/
	const covers = full.covers.filter((c) => (includeArchived || c.cover.archivedAt === "") && (includeHistory || c.cover.kind !== "history") && (includeChat !== false || c.cover.kind !== "chat"));
	const themeIdSet = /* @__PURE__ */ new Set();
	for (const c of covers) for (const t of c.cover.theme) themeIdSet.add(t);
	for (const id of full.themeFiles) if (id !== "") themeIdSet.add(id);
	return {
		projects,
		covers,
		issues: full.issues,
		themeIds: [...themeIdSet].sort()
	};
}
/**
* `scanLibrary` 的**未过滤**实现 —— 真正读盘的扫描。
*
* 🔴 **它不做任何 options 过滤**（全收：含归档项目、含归档封面、含 history 封面）；
*    过滤是 `applyScanOptions` 的事。
* ⚠️ **不要直接调它**（绕过合并 ⇒ 首页又变回多次扫描）；只有 `scanLibrary` 该调。
* @returns 未过滤的扫描结果。
*/
async function scanAllUnfiltered() {
	const projects = [];
	const covers = [];
	const issues = [];
	const files = await listFiles(projectsDir(), (n) => n.endsWith(MD_SUFFIX));
	for (const file of files) {
		const id = projectIdFromFile(file);
		if (id === void 0) continue;
		const text = await readTextIfExists(join(projectsDir(), file)) ?? "";
		const { data } = splitFrontmatter(text);
		const frontmatter = normalizeProjectFrontmatter(data, id);
		projects.push({
			id,
			frontmatter,
			text
		});
		const parsed = parseCovers(text, file);
		covers.push(...parsed.covers);
		issues.push(...parsed.issues);
	}
	const themeFiles = [];
	const themeFileNames = await listFiles(themesDir(), (n) => n.startsWith("THEME-") && n.endsWith(MD_SUFFIX));
	for (const f of themeFileNames) {
		const id = f.slice(6, -3);
		if (id !== "") themeFiles.push(id);
	}
	return {
		projects,
		covers,
		issues,
		themeFiles
	};
}
/**
* 读某个内部条目的正文文档（§3.3）。
*
* @param ref - 封面上的 ref。
* @param ext - 是否外部引用。
* @returns 条目文档（frontmatter + 正文 + 标题）；取不到时 `undefined`。
*/
async function loadEntryDoc(ref, ext) {
	const abs = resolveRef(ref, ext);
	if (abs === void 0) return void 0;
	const text = await readTextIfExists(abs);
	if (text === void 0) return void 0;
	const { data, body } = splitFrontmatter(text);
	const fm = data ?? {};
	const frontmatter = {
		id: typeof fm["id"] === "string" ? fm["id"] : "",
		slug: typeof fm["slug"] === "string" ? fm["slug"] : "",
		project: typeof fm["project"] === "string" ? fm["project"] : "",
		theme: toStringArray(fm["theme"]),
		global: fm["global"] === true || fm["global"] === "true",
		kind: isEntryKind(fm["kind"]) ? fm["kind"] : "",
		tags: toStringArray(fm["tags"]),
		title: typeof fm["title"] === "string" ? fm["title"] : "",
		desc: typeof fm["desc"] === "string" ? fm["desc"] : "",
		createdAt: typeof fm["createdAt"] === "string" ? fm["createdAt"] : "",
		updatedAt: typeof fm["updatedAt"] === "string" ? fm["updatedAt"] : "",
		archivedAt: typeof fm["archivedAt"] === "string" ? fm["archivedAt"] : ""
	};
	const source = fm["source"];
	if (typeof source === "object" && source !== null) {
		const s = source;
		frontmatter.source = {
			...typeof s["sessionId"] === "string" ? { sessionId: s["sessionId"] } : {},
			...typeof s["from"] === "string" ? { from: s["from"] } : {}
		};
	}
	const fallback = extractTitle(body, ext ? "#" : "###");
	return {
		frontmatter,
		body,
		title: frontmatter.title.trim() !== "" ? frontmatter.title : fallback
	};
}
/**
* 把封面 + 正文落盘成内部条目文档（§3.3）。
*
* 正文结构固定为「### 标题 / 规则 / Why / How to apply」，由调用方（LLM）给出。
* @param cover - 封面（提供 id/project/theme/global/tags/desc）。
* @param slug - 英文短名。
* @param body - 正文。
* @param source - 溯源信息。
* @returns 库内相对路径（即封面的 `ref`）。
*/
async function writeEntryDoc(cover, slug, body, source) {
	const rel = entryRelPath(slug, cover.id);
	const abs = join(entriesDir(), entryFileName(slug, cover.id));
	const fmLines = [
		["id", yamlScalar(cover.id)],
		["slug", yamlScalar(slug)],
		["project", yamlScalar(cover.project)],
		["theme", renderYamlArray(cover.theme)],
		["global", cover.global ? "true" : "false"],
		...isEntryKind(cover.kind) ? [["kind", cover.kind]] : [],
		["tags", renderYamlArray(cover.tags)],
		["title", yamlScalar(cover.title)],
		["desc", yamlScalar(cover.desc)]
	];
	if (source !== void 0 && (source.sessionId !== void 0 || source.from !== void 0)) {
		fmLines.push(["source:", ""]);
		if (source.sessionId !== void 0) fmLines.push(["  sessionId", yamlScalar(source.sessionId)]);
		if (source.from !== void 0) fmLines.push(["  from", yamlScalar(source.from)]);
	}
	if ((cover.createdAt ?? "") !== "") fmLines.push(["createdAt", yamlScalar(cover.createdAt)]);
	if ((cover.updatedAt ?? "") !== "") fmLines.push(["updatedAt", yamlScalar(cover.updatedAt)]);
	const text = `${renderFrontmatter(fmLines)}\n${body.trimEnd()}\n`;
	await writeTextAtomic(abs, text);
	return rel;
}
/**
* 写入（或更新）一份项目文档（§3.1 / §7.1 步骤 2–3）。
*
* 结构：frontmatter + 一级标题 + 六节叙事 + 「沉淀知识」节（封面清单）。
*
* 🔴 **`orphans` 必须原样写回**（§8.7④ / §12-79）：那是"解析失败、但原文还在"的封面块。
* 本函数只渲染能解析成功的 `covers`；若不管 `orphans`，它们会被**静默删除**
* ——表现为"人手改坏一个字符，下次 handoff 就把它弄丢了"。
* 写回后它们仍是原样，直到人把它改对（届时自然被解析、重复块消失）。
* @param id - 项目 id。
* @param frontmatter - 项目 frontmatter。
* @param narrative - 六节叙事正文（**纯叙事**，不含 frontmatter / 标题 / 「沉淀知识」节）。
*   ⚠️ 传"整份文档"会导致 frontmatter 与标题被写两遍——请用 `narrativeFromProjectText()`。
* @param covers - 该项目的全部封面（**写文档时以本次为准**）。
* @param orphans - 解析失败的封面块原文（原样保留，**不得丢弃**）。
* @returns 文档全文（便于调用方复核）。
*/
async function writeProjectDoc(id, frontmatter, narrative, covers, orphans = []) {
	const existingFm = (await loadProjectDoc(id))?.frontmatter;
	const nowIso = (/* @__PURE__ */ new Date()).toISOString();
	const createdAt = (frontmatter.createdAt ?? "") !== "" ? frontmatter.createdAt : (existingFm?.createdAt ?? "") !== "" ? existingFm?.createdAt ?? "" : nowIso;
	const updatedAt = (frontmatter.updatedAt ?? "") !== "" ? frontmatter.updatedAt : (existingFm?.updatedAt ?? "") !== "" ? existingFm?.updatedAt ?? "" : createdAt;
	const fm = renderFrontmatter([
		["project", yamlScalar(frontmatter.project)],
		...(frontmatter.title ?? "") !== "" ? [["title", yamlScalar(frontmatter.title)]] : [],
		["desc", yamlScalar(frontmatter.desc)],
		["themes", renderYamlArray(frontmatter.themes)],
		...createdAt !== "" ? [["createdAt", yamlScalar(createdAt)]] : [],
		...updatedAt !== "" ? [["updatedAt", yamlScalar(updatedAt)]] : [],
		...(frontmatter.archivedAt ?? "") !== "" ? [["archivedAt", yamlScalar(frontmatter.archivedAt)]] : [],
		...(frontmatter.template ?? "") !== "" ? [["template", yamlScalar(frontmatter.template)]] : [],
		...(frontmatter.truncateSections ?? []).length > 0 ? [["truncateSections", renderYamlArray(frontmatter.truncateSections ?? [])]] : []
	]);
	const blocks = covers.map((c) => renderCover(c));
	const orphanBlocks = orphans.map((o) => o.trim()).filter((o) => o !== "");
	const coverBlocks = [...blocks, ...orphanBlocks].join("\n\n");
	const text = [
		fm,
		`# HANDOFF — ${frontmatter.project}`,
		"",
		`<!-- 文件位置：~/.dsh-memj/projects/HANDOFF-${safeName(id)}.md -->`,
		"",
		narrative.trim(),
		"",
		KNOWLEDGE_SECTION,
		"",
		coverBlocks,
		""
	].join("\n");
	await writeTextAtomic(projectDocPath(id), text);
	return text;
}
/**
* 按**已存在的 `ref`** 就地同步条目文档（⭐ 可连同正文一起替换）。
*
* 🔴 **为什么不复用 `writeEntryDoc`**：那个函数按 `<slug>-<uuid8>.md` **重算路径**。
* 若封面上的 `ref` 与重算结果不一致（人手改过文件名、或 slug 后来变了），
* 就会写出**第二个文件**，而旧文件留在原地成孤儿——封面仍指着旧的，正文却写到了新的。
* 本函数严格按 `ref` 定位，**路径绝不漂移**。
*
* ⭐ **`body` 的作用**（决策 104 的覆盖路径）：
* - **省略** ⇒ 只同步 frontmatter，**保留原正文**（原有行为，`memj_rebuild` 用）；
* - **给了** ⇒ **连正文一起替换**（`overwrite: true` 的覆盖用）。
* ⚠️ 两者共用同一份 frontmatter 拼装逻辑——避免"两处各写一遍"必然漂移（本项目的老坑）。
* @param cover - 封面（提供要同步的元数据；`ref` 决定写到哪个文件）。
* @param body - 新正文；省略时保留原正文。
* @returns 是否成功写入（文件不存在时 false）。
*/
async function syncEntryFrontmatter(cover, body) {
	const abs = resolveRef(cover.ref, cover.ext);
	if (abs === void 0) return false;
	const text = await readTextIfExists(abs);
	if (text === void 0) return false;
	const { data, body: oldBody } = splitFrontmatter(text);
	const fm = data ?? {};
	const slug = typeof fm["slug"] === "string" && fm["slug"] !== "" ? fm["slug"] : "entry";
	const fmLines = [
		["id", yamlScalar(cover.id)],
		["slug", yamlScalar(slug)],
		["project", yamlScalar(cover.project)],
		["theme", renderYamlArray(cover.theme)],
		["global", cover.global ? "true" : "false"],
		...isEntryKind(cover.kind) ? [["kind", cover.kind]] : [],
		["tags", renderYamlArray(cover.tags)],
		["title", yamlScalar(cover.title)],
		["desc", yamlScalar(cover.desc)]
	];
	const source = fm["source"];
	if (typeof source === "object" && source !== null) {
		const s = source;
		if (typeof s["sessionId"] === "string" || typeof s["from"] === "string") {
			fmLines.push(["source:", ""]);
			if (typeof s["sessionId"] === "string") fmLines.push(["  sessionId", yamlScalar(s["sessionId"])]);
			if (typeof s["from"] === "string") fmLines.push(["  from", yamlScalar(s["from"])]);
		}
	}
	const createdAt = (cover.createdAt ?? "") !== "" ? cover.createdAt : typeof fm["createdAt"] === "string" ? fm["createdAt"] : "";
	const updatedAt = (cover.updatedAt ?? "") !== "" ? cover.updatedAt : typeof fm["updatedAt"] === "string" ? fm["updatedAt"] : "";
	if (createdAt !== "") fmLines.push(["createdAt", yamlScalar(createdAt)]);
	if (updatedAt !== "") fmLines.push(["updatedAt", yamlScalar(updatedAt)]);
	if ((cover.archivedAt ?? "") !== "") fmLines.push(["archivedAt", yamlScalar(cover.archivedAt)]);
	const outBody = body !== void 0 ? body : oldBody;
	await writeTextAtomic(abs, `${renderFrontmatter(fmLines)}\n${outBody.replace(/^\n+/, "")}`);
	return true;
}
/**
* 读某个项目文档并把它的叙事与封面拆开。
*
* 「叙事」= 去掉封面围栏后的**叙事节**文本（**节数由该文档自己的模板决定**，
* 不是固定六节；保留「沉淀知识」节标题，供写回时重建结构）。
* @param id - 项目 id。
* @returns 文档信息；不存在时 `undefined`。
*/
async function loadProjectDoc(id) {
	const text = await readTextIfExists(projectDocPath(id));
	if (text === void 0) return void 0;
	const { data } = splitFrontmatter(text);
	const { covers, issues, orphans } = parseCovers(text, `HANDOFF-${id}.md`);
	const narrative = narrativeFromProjectText(text);
	return {
		frontmatter: normalizeProjectFrontmatter(data, id),
		narrative,
		covers: covers.map((c) => c.cover),
		issues,
		orphans,
		text
	};
}
/**
* ⭐ **就地修复一个封面块**（§8.6）。
*
* 🔴 **三条硬约束**（决策 88 / 91）：
*  1. **只做局部块替换**——绝不整篇重渲染。否则同文档里其它非法封面块会被静默删掉
*     （实测见 `verify/probe-memj-invalid-cover-loss.mjs`）。
*  2. **必须过硬校验**（`validateCoverShape`，零 LLM）；不通过则**拒绝写入，绝不半写**（决策 72）。
*  3. **只改已存在封面的字段**——不新增、不删除封面；不改正文与叙事。
*
* @param file - 项目文档文件名（如 `HANDOFF-dsh-memj.md`）。
* @param startLine - 目标块起始行（1 起，闭区间）。
* @param endLine - 目标块结束行（1 起，闭区间）。
* @param cover - 修复后的封面。
* @param rawKind - 原始 `kind` 字符串（用于报出"填了非法值"，见 `validateCoverShape`）。
* @returns 结果；失败时带原因与逐条问题。
*/
async function fixCoverBlock(file, startLine, endLine, cover, rawKind) {
	const projectId = projectIdFromFile(file);
	if (projectId === void 0) return {
		ok: false,
		error: `不是项目文档名：${file}`
	};
	const path = projectDocPath(projectId);
	const text = await readTextIfExists(path);
	if (text === void 0) return {
		ok: false,
		error: `项目文档不存在：${file}`
	};
	const pendingIds = new Set((await readNominations()).map((n) => n.entryId));
	const shapeIssues = validateCoverShape(cover, rawKind, pendingIds.has(cover.id));
	if (shapeIssues.length > 0) return {
		ok: false,
		error: "封面校验未通过",
		issues: shapeIssues
	};
	const dup = (await scanLibrary()).covers.find((c) => c.cover.id === cover.id && !(c.sourceFile === file && c.line === startLine));
	if (dup !== void 0) return {
		ok: false,
		error: "封面校验未通过",
		issues: [`id 在库内已存在：${cover.id}（${dup.sourceFile}）`]
	};
	const parsed = parseCovers(text, file);
	if (parsed.blocks.find((b) => b.startLine === startLine && b.endLine === endLine) === void 0) return {
		ok: false,
		error: `定位失败：${file}:${startLine}-${endLine} 不是一个封面块（文档可能已被改动，请刷新重试）`
	};
	const original = parsed.covers.find((c) => c.cover.id === cover.id)?.cover;
	const repaired = {
		...cover,
		createdAt: (cover.createdAt ?? "") !== "" ? cover.createdAt : original?.createdAt ?? "",
		updatedAt: (cover.updatedAt ?? "") !== "" ? cover.updatedAt : original?.updatedAt ?? "",
		archivedAt: original?.archivedAt ?? ""
	};
	const next = replaceBlockAtLines(text, startLine, endLine, renderCover(repaired));
	const after = parseCovers(next, file);
	if (after.blocks.length !== parsed.blocks.length) return {
		ok: false,
		error: `写入被拒绝：块数将从 ${parsed.blocks.length} 变为 ${after.blocks.length}（只允许替换，不允许增删）`
	};
	await writeTextAtomic(path, next);
	if (!repaired.ext) await syncEntryFrontmatter(repaired);
	await rebuildDerivedLayers();
	return { ok: true };
}
/**
* ⭐ **重填一个断链外部引用的 `ref`**（决策 89）。
*
* ⚠️ **只能改 `ref`**（§12-78：不允许改 `ext`）——`ext` 决定 `ref` 的解析方式，
* 互转等于换一种知识形态，超出"修断链"的范围。
* ⚠️ 写前**校验目标路径当前确实存在**；**不自动猜路径、不自动修复**。
* @param file - 项目文档文件名。
* @param startLine - 目标块起始行（1 起）。
* @param endLine - 目标块结束行（1 起）。
* @param ref - 新的 `ref` 路径。
* @returns 结果。
*/
async function fixExternalRef(file, startLine, endLine, ref) {
	const projectId = projectIdFromFile(file);
	if (projectId === void 0) return {
		ok: false,
		error: `不是项目文档名：${file}`
	};
	const text = await readTextIfExists(projectDocPath(projectId));
	if (text === void 0) return {
		ok: false,
		error: `项目文档不存在：${file}`
	};
	const nextRef = ref.trim();
	if (nextRef === "") return {
		ok: false,
		error: "ref 不能为空"
	};
	const parsed = parseCovers(text, file);
	if (parsed.blocks.findIndex((b) => b.startLine === startLine && b.endLine === endLine) === -1) return {
		ok: false,
		error: `定位失败：${file}:${startLine}-${endLine} 不是封面块（可能已被改动，请刷新）`
	};
	const lineIssues = parsed.issues.filter((i) => i.line === startLine);
	const found = parsed.covers.find((c) => c.line === startLine);
	if (found === void 0) return {
		ok: false,
		error: "该块不是可解析的封面（断链修复只针对格式合法的外部引用）",
		issues: lineIssues.map((i) => i.reason)
	};
	if (!found.cover.ext) return {
		ok: false,
		error: "该封面不是外部引用（ext: true），无需重填路径"
	};
	const abs = resolveRef(nextRef, true);
	if (abs === void 0 || !existsSync(abs)) return {
		ok: false,
		error: `目标文件不存在：${nextRef}`
	};
	const nextCover = {
		...found.cover,
		ref: nextRef,
		ext: true
	};
	const nextText = replaceBlockAtLines(text, startLine, endLine, renderCover(nextCover));
	if (parseCovers(nextText, file).blocks.length !== parsed.blocks.length) return {
		ok: false,
		error: "写入被拒绝：块数发生变化（只允许替换）"
	};
	await writeTextAtomic(projectDocPath(projectId), nextText);
	await rebuildDerivedLayers();
	return { ok: true };
}
/** 读主题文档的 frontmatter（主要为保住 `desc`）。 */ async function loadThemeFrontmatter(themeId) {
	const text = await readTextIfExists(themeDocPath(themeId));
	if (text === void 0) return void 0;
	const { data } = splitFrontmatter(text);
	if (data === null) return {
		theme: themeId,
		title: "",
		desc: "",
		createdAt: "",
		updatedAt: ""
	};
	return {
		theme: typeof data["theme"] === "string" && data["theme"].trim() !== "" ? data["theme"].trim() : themeId,
		title: typeof data["title"] === "string" ? data["title"] : "",
		desc: typeof data["desc"] === "string" ? data["desc"] : "",
		createdAt: typeof data["createdAt"] === "string" ? data["createdAt"] : "",
		updatedAt: typeof data["updatedAt"] === "string" ? data["updatedAt"] : ""
	};
}
/**
* 删掉一个项目的 handoff 文档（**连它的全部封面一起消失**）。
*
* 🔴 **这是不可逆操作**——调用方必须先确认"该项目旗下已无知识"
* （`edit.ts` 的 `deleteProject` 会强制这一条）。
* @param projectId - 项目 id。
* @returns 是否真的删掉了（文件本来就不存在时 `false`）。
*/
async function deleteProjectDoc(projectId) {
	const path = projectDocPath(projectId);
	if (!existsSync(path)) return false;
	await removeFile(path);
	return true;
}
/** 删掉一个主题的派生文档。⚠️ 派生文档会被下次 rebuild 重新生成，除非封面也不再提它。 */
async function deleteThemeDoc(themeId) {
	const path = themeDocPath(themeId);
	if (!existsSync(path)) return false;
	await removeFile(path);
	return true;
}
/**
* 删掉一个内部条目的**正文文件**（封面由调用方另行移除）。
*
* ⚠️ **只删内部条目**：外部引用（`ext: true`）的正文在库外，**不属于 memj**，
* 删封面即可，绝不能去删人家的文件。
* @param ref - 封面上的 `ref`。
* @param ext - 是否外部引用。
* @returns 是否真的删掉了。
*/
async function deleteEntryFile(ref, ext) {
	if (ext) return false;
	const abs = resolveRef(ref, false);
	if (abs === void 0 || !existsSync(abs)) return false;
	await removeFile(abs);
	return true;
}
/**
* 建（或更新）一个主题文档（§4.4）。
*
* ⚠️ **已存在时 `desc` 不被覆盖**（§4.2：已存在的主题不要重写它的 desc）——
* 除非显式传入新的非空 desc。
* @param themeId - 主题 id。
* @param desc - 主题描述（新建时必填）。
* @param covers - 该主题下的全部封面。
* @param projects - 覆盖的项目（id + desc）。
* @returns 文档全文。
*/
/**
* 建（或更新）一个主题文档（§4.4）。
*
* ⚠️ **默认 `desc` 优先保留已有的**（§4.2：已存在的主题不要重写它的 desc）——
* 这是为 **`rebuildDerivedLayers`** 设的：它每次重建都传 `''`，
* 若不留旧的，desc 就会被清空（它没有别的来源）。
*
* 🔴 **但"显式改 desc"必须能覆盖**（决策 114）：`setThemeDesc` 就是干这个的。
* ⇒ 用 `forceDesc` 区分两种意图：`rebuild` 不传（保留旧值）、
* 改 desc 的通道传 `true`（以传入的为准）。
* ⚠️ 一度把两者混在一起，结果 `setThemeDesc` **静默无效**（测试抓到）。
* @param themeId - 主题 id。
* @param desc - 主题描述（新建时必填）。
* @param covers - 该主题下的全部封面。
* @param projects - 覆盖的项目（id + desc）。
* @param forceDesc - ⭐ 为真时**以传入的 desc 为准**（显式修改用）。
* @param overrideTitle - ⭐ 显式设置显示名（决策 115）；`undefined` = 继承已有的。
* @param overrideUpdatedAt - ⭐ 显式刷新 `updatedAt`（决策 119）；`undefined` = 继承。
* @returns 文档全文。
*/
async function writeThemeDoc(themeId, desc, covers, projects, forceDesc = false, overrideTitle, overrideUpdatedAt) {
	const existing = await loadThemeFrontmatter(themeId);
	const finalDesc = forceDesc ? desc : existing !== void 0 && existing.desc !== "" ? existing.desc : desc;
	const finalTitle = overrideTitle !== void 0 ? overrideTitle ?? "" : existing?.title ?? "";
	const nowIso = (/* @__PURE__ */ new Date()).toISOString();
	const finalCreatedAt = (existing?.createdAt ?? "") !== "" ? existing?.createdAt ?? "" : nowIso;
	const finalUpdatedAt = overrideUpdatedAt !== void 0 ? overrideUpdatedAt ?? "" : (existing?.updatedAt ?? "") !== "" ? existing?.updatedAt ?? "" : finalCreatedAt;
	const fm = renderFrontmatter([
		["theme", yamlScalar(themeId)],
		...finalTitle !== "" ? [["title", yamlScalar(finalTitle)]] : [],
		["desc", yamlScalar(finalDesc)],
		...finalCreatedAt !== "" ? [["createdAt", yamlScalar(finalCreatedAt)]] : [],
		...finalUpdatedAt !== "" ? [["updatedAt", yamlScalar(finalUpdatedAt)]] : []
	]);
	const projectRows = projects.map((p) => {
		const d = p.desc.trim() === "" ? "_（无描述）_" : p.desc.replace(/\|/g, "\\|").replace(/\n/g, " ");
		return `| ${p.id.replace(/\|/g, "\\|")} | ${d} |`;
	});
	const text = [
		fm,
		`# THEME — ${themeId}`,
		"",
		"> 本文件是**派生层**（投影）：内容由项目文档里的封面聚合而来，手改会在下次重建时丢失。",
		"",
		"## 覆盖的项目",
		"",
		"| 项目 id | 项目 desc |",
		"|---|---|",
		...projectRows.length > 0 ? projectRows : ["| _（暂无）_ | |"],
		"",
		"## 知识封面",
		"",
		covers.length > 0 ? covers.map((c) => renderCover(c)).join("\n\n") : "_（暂无封面）_",
		""
	].join("\n");
	await writeTextAtomic(themeDocPath(themeId), text);
	return text;
}
/**
* 重建 `GLOBAL.md`（§2.2 / §4.1）。
*
* ⭐ **判据（方案 A，2026-09-18）**：**只看 `global: true`**。
* `global` 是"这条是全局知识"这个**事实**；"待批"是**流程状态**，由 `nominations.json`
* 单独表达。两者**不再混用一个字段**。
*
* 🔴 **为什么改**：旧判据是 `global && !pending.has(id)` ⇒ 一条**待批**的封面
* `global` 写着 `true`、却并不在全局层生效 ⇒ **字段本身在撒谎**，
* 且"在队列里"被用来编码状态（本项目已记过这类坑，见知识条目「用『在队列里』编码状态」）。
* 现在：**提名不置位、批准才置位** ⇒ `global: true` 就是"已批准"。
*
* 🔴 **只列封面，不掺人侧信息**（§4.1 + 决策 42）：
* 待批清单是**给人看的状态**，只出现在 `/memj-review` 与网页 UI，
* **不写进派生文档**——派生层是"封面索引"，语义必须单一。
* @param covers - 全部封面。
* @returns 文档全文。
*/
async function writeGlobalDoc(covers) {
	const approved = covers.filter((c) => c.global);
	const text = [
		"# GLOBAL — 全局层",
		"",
		"> 本文件是**派生层**（投影）：由项目文档里 `global: true`（**已批准**）的封面聚合而来。",
		"> 手改会被下次重建覆盖——要改知识就改项目文档里的封面。",
		"",
		"## 知识封面",
		"",
		approved.length > 0 ? approved.map((c) => renderCover(c)).join("\n\n") : "_（暂无）_",
		""
	].join("\n");
	await writeTextAtomic(globalDocPath(), text);
	return text;
}
/**
* 重建整个派生层（§7.1 步骤 6）。
*
* 顺序：先主题（需要各项目的 `themes:`），再 GLOBAL，最后把 `themes:` 汇总回各项目 frontmatter。
* @returns 重建统计，便于回执与探针断言。
*/
async function rebuildDerivedLayers() {
	const snapshot = await scanLibrary();
	new Set((await readNominations()).map((n) => n.entryId));
	const themesByProject = /* @__PURE__ */ new Map();
	for (const c of snapshot.covers) {
		if (c.cover.project === "") continue;
		let set = themesByProject.get(c.cover.project);
		if (set === void 0) {
			set = /* @__PURE__ */ new Set();
			themesByProject.set(c.cover.project, set);
		}
		for (const t of c.cover.theme) set.add(t);
	}
	const coversByTheme = /* @__PURE__ */ new Map();
	for (const c of snapshot.covers) for (const t of c.cover.theme) {
		const list = coversByTheme.get(t);
		if (list === void 0) coversByTheme.set(t, [c.cover]);
		else list.push(c.cover);
	}
	for (const themeId of snapshot.themeIds) {
		const covers = coversByTheme.get(themeId) ?? [];
		const projectIds = /* @__PURE__ */ new Set();
		for (const c of covers) if (c.project !== "") projectIds.add(c.project);
		for (const p of snapshot.projects) if (p.frontmatter.themes.includes(themeId)) projectIds.add(p.id);
		await writeThemeDoc(themeId, "", covers, [...projectIds].sort().map((id) => ({
			id,
			desc: snapshot.projects.find((p) => p.id === id)?.frontmatter.desc ?? ""
		})));
	}
	await writeGlobalDoc(snapshot.covers.map((c) => c.cover));
	let touched = 0;
	const liveThemes = new Set(snapshot.themeIds);
	for (const p of snapshot.projects) {
		const merged = new Set(p.frontmatter.themes.filter((t) => liveThemes.has(t)));
		for (const t of themesByProject.get(p.id) ?? []) merged.add(t);
		const themes = [...merged].sort();
		if (!(themes.length !== p.frontmatter.themes.length || themes.some((t, i) => t !== p.frontmatter.themes[i]))) continue;
		const rest = p.text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
		const fm = renderFrontmatter([
			["project", yamlScalar(p.frontmatter.project)],
			...(p.frontmatter.title ?? "") !== "" ? [["title", yamlScalar(p.frontmatter.title)]] : [],
			["desc", yamlScalar(p.frontmatter.desc)],
			["themes", renderYamlArray(themes)],
			...(p.frontmatter.createdAt ?? "") !== "" ? [["createdAt", yamlScalar(p.frontmatter.createdAt)]] : [],
			...(p.frontmatter.updatedAt ?? "") !== "" ? [["updatedAt", yamlScalar(p.frontmatter.updatedAt)]] : [],
			...(p.frontmatter.archivedAt ?? "") !== "" ? [["archivedAt", yamlScalar(p.frontmatter.archivedAt)]] : [],
			...(p.frontmatter.template ?? "") !== "" ? [["template", yamlScalar(p.frontmatter.template)]] : [],
			...(p.frontmatter.truncateSections ?? []).length > 0 ? [["truncateSections", renderYamlArray(p.frontmatter.truncateSections ?? [])]] : []
		]);
		await writeTextAtomic(projectDocPath(p.id), `${fm}${rest}`);
		touched += 1;
	}
	const approvedCount = snapshot.covers.filter((c) => c.cover.global).length;
	return {
		themes: snapshot.themeIds.length,
		globalApproved: approvedCount,
		projects: touched,
		issues: snapshot.issues
	};
}
/** 读提名文件；不存在或损坏时返回空数组（**不抛**）。 */
async function readNominations() {
	const text = await readTextIfExists(nominationsPath());
	if (text === void 0 || text.trim() === "") return [];
	try {
		const data = JSON.parse(text);
		return Array.isArray(data.nominations) ? data.nominations : [];
	} catch {
		return [];
	}
}
/** 写提名文件。 */
async function writeNominations(list) {
	const data = { nominations: [...list] };
	await writeTextAtomic(nominationsPath(), `${JSON.stringify(data, null, 2)}\n`);
}
/**
* 登记一条 global 提名（**只登记，不落位**，§7.3 底线）。
*
* 🔴 这是安全底线：加入全局**必须由人批准**，工具只能提名。
* 所以本函数**只写 `nominations.json`**，绝不动封面的 `global` 字段
* ——真正的落位发生在人批准之后（`approveNomination`）。
* @param nomination - 提名。
*/
async function addNomination(nomination) {
	const list = await readNominations();
	if (list.some((n) => n.entryId === nomination.entryId)) return;
	list.push(nomination);
	await writeNominations(list);
}
/**
* ⭐ **只从提名表移除**（不碰封面的 `global`）。
*
* 🔴 **为什么必须与 `approveNomination` / `rejectNomination` 分开**（方案 A）：
* 那两者都**会改封面的 `global`**（一个置 true、一个置 false）。
* 而有些场景只需要"清掉这条待批记录"、**不该动 `global`**——
* 典型是"取消"与"人侧直接生效后确保不在表里"。
* ⚠️ 早先没有这个函数，取消路径误用了 `approveNomination`，
* 而它现在**会置 `global: true`** ⇒ 正好与"取消"相反（本函数就是为修这个而抽出的）。
* @param entryId - 封面 id。
* @returns 是否确实移除了（false = 本来就不在表里）。
*/
async function removeNomination(entryId) {
	const list = await readNominations();
	const next = list.filter((n) => n.entryId !== entryId);
	if (next.length === list.length) return false;
	await writeNominations(next);
	return true;
}
/**
* 批准一条提名：⭐ **从提名表移除，并把封面上的 `global` 置为 `true`**。
*
* 🔴 **方案 A（2026-09-18）的关键改动**：置位**发生在批准的这一刻**，而非提名时。
* 早先提名就把 `global` 置 `true`、靠"在不在提名表"表示是否已批
* ⇒ 待批期间 `global` 字段**在撒谎**（写着 true 却不在 GLOBAL 里），
* 且用"队列成员身份"编码状态（本项目已记过这类坑）。
* ⇒ 现在 `global: true` 的语义**唯一**："这条是已批准的全局知识"。
*
* 批准后必须重建派生层，GLOBAL.md 才会收录它。
* @param entryId - 封面 id。
* @returns 是否确实批准了（false = 本来就没有这条提名）。
*/
async function approveNomination(entryId) {
	const list = await readNominations();
	const next = list.filter((n) => n.entryId !== entryId);
	if (next.length === list.length) return false;
	await setCoverGlobalFlag(entryId, true);
	await writeNominations(next);
	return true;
}
/**
* 把某个封面的 `global` 置为目标值（**只动封面与条目 frontmatter，不碰提名表**）。
*
* ⚠️ 抽成一个函数，是因为**批准**与**取消/否决**两条路都要改这个字段——
* 而本项目的老坑正是"同一件事写两处、必然漂移"。
* @param entryId - 封面 id。
* @param value - 目标值。
* @returns 是否确实改了（false = 没找到 / 值本来就对）。
*/
async function setCoverGlobalFlag(entryId, value) {
	const found = (await scanLibrary()).covers.find((c) => c.cover.id === entryId);
	if (found === void 0 || found.cover.project === "") return false;
	const doc = await loadProjectDoc(found.cover.project);
	if (doc === void 0) return false;
	let changed = false;
	const covers = doc.covers.map((c) => {
		if (c.id !== entryId || c.global === value) return c;
		changed = true;
		return {
			...c,
			global: value
		};
	});
	if (!changed) return false;
	await writeProjectDoc(found.cover.project, doc.frontmatter, doc.narrative, covers, doc.orphans);
	const updated = covers.find((c) => c.id === entryId);
	if (updated !== void 0 && !updated.ext) await syncEntryFrontmatter(updated);
	return true;
}
/**
* 否决一条提名：⭐ **从提名表移除**（并防御性地把封面的 `global` 置回 `false`）。
*
* 🔴 **方案 A（2026-09-18）后的语义简化**：
* 现在提名**不置位**，所以正常路径下被否决的封面 `global` 本来就是 `false`。
* 但**存量数据**（旧版提名时置过 `true`）可能残留 `global: true`，
* 而 GLOBAL 收录判据现在**只看 `global`** ⇒ 若不清，一否决就会**被收进 GLOBAL**
* （这正是旧版"否决 = 批准"那个 bug 的同类反扑）。
* ⇒ 保留这一步**防御性清理**，不因为"正常路径不需要"就删掉。
*
* ⚠️ **顺序**：先清 `global`、再销提名。反了会留下"global:true 且不在表里"的瞬间，
* 若此刻重建派生层，它就会被当成已批准。
* @param entryId - 封面 id。
* @returns 是否确实否决了（false = 本来就没有这条提名）。
*/
async function rejectNomination(entryId) {
	const list = await readNominations();
	const next = list.filter((n) => n.entryId !== entryId);
	if (next.length === list.length) return false;
	await setCoverGlobalFlag(entryId, false);
	await writeNominations(next);
	return true;
}
/**
* 追加一条读快照（§3.8.1）。
*
* ⚠️ **同会话重复读同一条不去重**（§12-66）——保留完整阅读痕迹。
* @param sessionId - 会话 id。
* @param snapshot - 快照内容。
*/
async function appendReadSnapshot(sessionId, snapshot) {
	await ensureDir(readsDir());
	const path = readLogPath(sessionId);
	const line = `${JSON.stringify(snapshot)}\n`;
	const existing = await readTextIfExists(path) ?? "";
	await writeTextAtomic(path, existing + line);
}
/**
* 读某会话的全部快照。
* @param sessionId - 会话 id。
* @returns 快照数组（顺序即写入顺序）。
*/
async function readSnapshots(sessionId) {
	const text = await readTextIfExists(readLogPath(sessionId));
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
/**
* 取**本会话未消费**的快照（§3.8.2：取用范围 = `consumedAt === null`）。
*
* ⭐ **不需要算水位线**（决策 64）——只看这一条判据就够。
* @param sessionId - 会话 id。
* @returns 未消费的快照。
*/
async function readUnconsumedSnapshots(sessionId) {
	return (await readSnapshots(sessionId)).filter((s) => s.consumedAt === null);
}
/**
* 把某会话的快照标为已消费，并按 §3.8.2 判定清理。
*
* 🔴 **清理只删已消费的**——未消费的是当前会话正在用的判据，绝不能动。
* ⇒ 结果是"保护优先"：若某会话读了 60 条且全未消费，**一条也删不掉**（§11.14 已记此代价）。
* @param sessionId - 会话 id。
* @param maxEntries - 单文件上限（超过则清理）。
* @param trimCount - 一次删多少条。
* @returns 清理掉的条数。
*/
async function consumeSnapshots(sessionId, maxEntries, trimCount) {
	const all = await readSnapshots(sessionId);
	if (all.length === 0) return 0;
	const now = (/* @__PURE__ */ new Date()).toISOString();
	for (const s of all) if (s.consumedAt === null) s.consumedAt = now;
	let final = all;
	if (all.length > maxEntries) {
		const need = trimCount;
		const keep = [];
		let removed = 0;
		for (const s of all) {
			if (removed < need && s.consumedAt !== null) {
				removed += 1;
				continue;
			}
			keep.push(s);
		}
		final = keep;
	}
	const text = final.map((s) => JSON.stringify(s)).join("\n");
	await writeTextAtomic(readLogPath(sessionId), text === "" ? "" : `${text}\n`);
	return all.length - final.length;
}
/** 确保库目录存在（首次写入前调用一次即可）。 */
async function ensureLibraryDirs() {
	for (const dir of requiredDirs()) await ensureDir(dir);
}
/**
* 追加一条项目文档读记录（决策 112）。
*
* ⚠️ **同一会话 + 同一项目 + 同一轮次**的多次读取**只保留最新一条**
* （同一轮里逐节读时，`sections` 由调用方累积后传进来；
*  同轮重复读同一文档没有保留全部痕迹的价值）。
* ⚠️ **跨轮次的记录会保留**——它们各自代表"那一轮读过"，
* 而硬校验只认当前轮次（见 `findDocRead`）。
* @param sessionId - 会话 id。
* @param record - 读记录内容。
*/
async function appendDocRead(sessionId, record) {
	await ensureDir(docReadsDir());
	const path = docReadLogPath(sessionId);
	const kept = (await readDocReads(sessionId)).filter((r) => !(r.project === record.project && r.turn === record.turn));
	kept.push(record);
	const text = kept.map((r) => JSON.stringify(r)).join("\n");
	await writeTextAtomic(path, `${text}\n`);
}
/**
* 读某会话的全部项目文档读记录（决策 112）。
* @param sessionId - 会话 id。
* @returns 记录数组（最近读的在后）。
*/
async function readDocReads(sessionId) {
	const text = await readTextIfExists(docReadLogPath(sessionId));
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
/**
* ⭐⭐ 本会话**在指定轮次里是否读过**某个项目文档（决策 112 的硬校验用）。
*
* 🔴 **有效期 = 一个完整轮次**（用户明确："不是 step 的颗粒，是一个完整轮次的颗粒"）：
*    · `turn >= 0`（拿到了真实轮次号）⇒ **只认 `turn` 相等的那条**——
*      上一轮读过**不算**：上一轮 handoff 很可能刚改过这份文档。
*    · `turn < 0`（拿不到轮次，如栈内调用）⇒ 退化为**本会话读过即可**，
*      宁可放松也不误拦（硬校验的目的不是卡人，是防"凭记忆写"）。
* @param sessionId - 会话 id。
* @param projectId - 项目 id。
* @param turn - 当前轮次号；`-1` 表示未知。
* @returns 读记录；没读过（或不在本轮）时 `undefined`。
*/
async function findDocRead(sessionId, projectId, turn) {
	const mine = (await readDocReads(sessionId)).filter((r) => r.project === projectId);
	if (mine.length === 0) return void 0;
	if (turn >= 0) return mine.find((r) => r.turn === turn);
	return mine[mine.length - 1];
}
//#endregion
//#region src/prompt-catalog.ts
/**
* ⭐ **分组表**（顺序即页面顺序）。
*
* ⚠️ **轴是"谁看 / 何时看"**，不是"代码在哪个文件"。改这个轴会让页面重新变得难懂，
*    故在此显式声明理由。
*/
const PROMPT_GROUPS = {
	resident: {
		title: "① 每轮常驻",
		about: "模型每一轮对话都会读到的两段。协议是\"总纲\"，使用指导是\"操作手册\"。",
		order: 10
	},
	tools: {
		title: "② 工具说明书",
		about: "模型据此决定\"该不该调这个工具、怎么调\"。每个工具含三部分：说明书（可改）+ 参数表 + 返回格式（后两者是契约，只读）。",
		order: 20
	},
	commands: {
		title: "③ 斜杠命令（给人看的）",
		about: "你打 / 时菜单里显示的文字。⚠️ 模型看不到这些，改它们只影响你自己的使用体验。",
		order: 30
	},
	actions: {
		title: "④ 命令触发时注入给模型的",
		about: "你打了某个命令后，插件把这段文字送进会话，让模型知道要做什么。",
		order: 40
	},
	hot: {
		title: "⑤ 每轮自动注入的热知识",
		about: "插件自动把\"跟你当前项目相关的知识\"塞进每一轮对话，这些是那段文本的固定片段。",
		order: 50
	},
	recall: {
		title: "⑥ 主动召回（插件内部判断）",
		about: "⚠️ 模型看不到这些。它们发给一个专门的判定模型（JEV），用来判断\"现在要不要帮模型找知识\"。",
		order: 60
	},
	score: {
		title: "⑦ 轮末知识评分（子代理）",
		about: "⚠️ 模型看不到这些。每轮结束后，插件起一个子代理回顾这一轮，给\"本来能帮上忙\"的知识加分。",
		order: 70
	},
	tags: {
		title: "⑧ 标签规范化（子代理）",
		about: "⚠️ 模型看不到这些。用来整理知识的标签：合并同义词、去掉太泛的、补英文。",
		order: 80
	},
	translate: {
		title: "⑨ 英文索引翻译（插件内部）",
		about: "⚠️ 模型看不到这些。把知识封面翻译成英文，供英文优先的判定模型使用。三级依次降级。",
		order: 90
	},
	templates: {
		title: "⑩ 交接文档模板的写作指导",
		about: "当项目用了自定义文档模板时，读该文档会附上\"这份文档有几节、每节要干嘛\"。⚠️ 这组属于\"模板\"功能，只是搭 memj_read 送出去。",
		order: 100
	}
};
/**
* ⭐⭐⭐ **目录**（键 = `PROMPT_SPECS` 的 key）。
*
* 🔴 **加新提示词时必须在这里补一条**（否则检查 ④ 报红、页面显示"（未登记说明）"）。
*/
const PROMPT_CATALOG = {
	"section:memj:protocol": {
		group: "resident",
		owner: "系统提示词 · 协议",
		purpose: "memj 的\"总纲\"：只说三件事——什么时候该查库、什么时候该写库、写的边界在哪。它占着**消息最前面**（node 0），⚠️ 所以**改它一个字，所有正在进行中的会话缓存全部作废一次**。"
	},
	"context:memj:usage-guidance": {
		group: "resident",
		owner: "运行时上下文 · 使用指导",
		purpose: "总纲的展开版：具体怎么查、查什么、查到什么算数（触发条件表、项目判定、挂主题判据、写作要求等 13 块）。⭐ 它追加在消息**尾部** ⇒ **改它不破缓存**，所以\"会经常改的指导\"都放这里。"
	},
	"tool:memj_info:description": {
		group: "tools",
		owner: "工具 memj_info",
		part: "description",
		purpose: "说明书：这个工具是\"语境入口\"——告诉你库里有**哪些项目和主题**（以及各自的 id），但**不返回任何知识**。当不知道该去哪个项目找东西时，先调它。"
	},
	"tool:memj_info:parameters": {
		group: "tools",
		owner: "工具 memj_info",
		part: "parameters",
		purpose: "参数表：可以按检索词筛项目/主题，也可以只查其中一类。"
	},
	"tool:memj_info:output": {
		group: "tools",
		owner: "工具 memj_info",
		part: "output",
		purpose: "返回格式契约：运行时按它校验，多返回一个字段整次调用会被拒收。"
	},
	"tool:memj_search:description": {
		group: "tools",
		owner: "工具 memj_search",
		part: "description",
		purpose: "说明书：**只找不读**——按项目 / 主题 / 关键词筛出**封面**（标题+描述），**不给正文**。找到之后要用 memj_read 取正文。"
	},
	"tool:memj_search:parameters": {
		group: "tools",
		owner: "工具 memj_search",
		part: "parameters",
		purpose: "参数表：三种筛法（按项目 / 按主题 / 按检索词）可以单用或组合。"
	},
	"tool:memj_search:output": {
		group: "tools",
		owner: "工具 memj_search",
		part: "output",
		purpose: "返回格式契约。"
	},
	"tool:memj_read:description": {
		group: "tools",
		owner: "工具 memj_read",
		part: "description",
		purpose: "说明书：**只读不找**——按 id 取知识正文。也可以传项目 id 读整个交接文档。按文档大小自动分流：短的给全文，长的先给节名清单让人挑。"
	},
	"tool:memj_read:parameters": {
		group: "tools",
		owner: "工具 memj_read",
		part: "parameters",
		purpose: "参数表：id / project 二选一，另有 section / full / offset / limit 四种读法。"
	},
	"tool:memj_read:output": {
		group: "tools",
		owner: "工具 memj_read",
		part: "output",
		purpose: "返回格式契约。"
	},
	"tool:memj_snapshots:description": {
		group: "tools",
		owner: "工具 memj_snapshots",
		part: "description",
		purpose: "说明书：列出\"本会话读过哪些**别项目**的知识\"。用途是当证据——证明这个项目确实复用了别的项目的知识（写 handoff 时判断要不要建主题）。"
	},
	"tool:memj_snapshots:parameters": {
		group: "tools",
		owner: "工具 memj_snapshots",
		part: "parameters",
		purpose: "参数表：必须给目标项目 id；可选 scope 决定要不要连本项目自己的也列出来。"
	},
	"tool:memj_snapshots:output": {
		group: "tools",
		owner: "工具 memj_snapshots",
		part: "output",
		purpose: "返回格式契约。"
	},
	"tool:memj_handoff:description": {
		group: "tools",
		owner: "工具 memj_handoff",
		part: "description",
		purpose: "说明书：**写库的主入口**——写交接文档、沉淀新知识、推进归属，三件事一次做完。⚠️ **这是最长的一条（约 5000 字符）**，因为\"写什么、怎么判项目、怎么归属、正文怎么写、什么会被拒收\"全在这里。"
	},
	"tool:memj_handoff:parameters": {
		group: "tools",
		owner: "工具 memj_handoff",
		part: "parameters",
		purpose: "参数表：分步（step）、按节改文档（docSection/docOp）、新增知识（entries）、外部文档入库（adopt）等。"
	},
	"tool:memj_handoff:output": {
		group: "tools",
		owner: "工具 memj_handoff",
		part: "output",
		purpose: "返回格式契约。"
	},
	"tool:memj_promote:description": {
		group: "tools",
		owner: "工具 memj_promote",
		part: "description",
		purpose: "说明书：**事后**改归属——给知识加/减主题、改封面字段（标题描述标签）、提名进全局。⚠️ 归属是**累加**不是搬家，推进后原有归属都保留。"
	},
	"tool:memj_promote:parameters": {
		group: "tools",
		owner: "工具 memj_promote",
		part: "parameters",
		purpose: "参数表：按封面 id 操作，一次性可传多条。"
	},
	"tool:memj_promote:output": {
		group: "tools",
		owner: "工具 memj_promote",
		part: "output",
		purpose: "返回格式契约。"
	},
	"tool:memj_update:description": {
		group: "tools",
		owner: "工具 memj_update",
		part: "description",
		purpose: "说明书：更新**一条已有**知识——改正文、或改封面的标题/描述/标签/分类。发现库里有相似条目时用它，别另写一条新的。"
	},
	"tool:memj_update:parameters": {
		group: "tools",
		owner: "工具 memj_update",
		part: "parameters",
		purpose: "参数表：给条目 id；body 改正文，fields 改封面字段。"
	},
	"tool:memj_update:output": {
		group: "tools",
		owner: "工具 memj_update",
		part: "output",
		purpose: "返回格式契约。"
	},
	"tool:memj_rebuild:description": {
		group: "tools",
		owner: "工具 memj_rebuild",
		part: "description",
		purpose: "说明书：从全部交接文档**重建派生层**（主题页、全局页），同时体检每张封面格式（围栏、id、描述、归属字段）。⚠️ 网页上那个「重建」按钮调的就是它。"
	},
	"tool:memj_rebuild:parameters": {
		group: "tools",
		owner: "工具 memj_rebuild",
		part: "parameters",
		purpose: "参数表：目前不需要参数。"
	},
	"tool:memj_rebuild:output": {
		group: "tools",
		owner: "工具 memj_rebuild",
		part: "output",
		purpose: "返回格式契约：含体检结论与非法封面清单。"
	},
	"tool:memj_template:description": {
		group: "tools",
		owner: "工具 memj_template",
		part: "description",
		purpose: "说明书：管理**交接文档模板**（列出来 / 新建 / 删除）。⚠️ 模板只在**新建项目**那一刻生效，改删模板都不影响已有文档。新建与删除走**两段式确认**。"
	},
	"tool:memj_template:parameters": {
		group: "tools",
		owner: "工具 memj_template",
		part: "parameters",
		purpose: "参数表：action 三选一（list / create / delete），create 时给模板定义。"
	},
	"tool:memj_template:output": {
		group: "tools",
		owner: "工具 memj_template",
		part: "output",
		purpose: "返回格式契约。"
	},
	"tool:memj_normalize_tags:description": {
		group: "tools",
		owner: "工具 memj_normalize_tags",
		part: "description",
		purpose: "说明书：**整理标签**——把同义词/大小写变体合并成规范词、去掉太泛的词、给规范词补英文。由插件在轮次结束时自动起子代理来跑。"
	},
	"tool:memj_normalize_tags:parameters": {
		group: "tools",
		owner: "工具 memj_normalize_tags",
		part: "parameters",
		purpose: "参数表：since 限定范围、full 全库重跑、includeBody 给模型多少正文、preview 只看不改。"
	},
	"tool:memj_normalize_tags:output": {
		group: "tools",
		owner: "工具 memj_normalize_tags",
		part: "output",
		purpose: "返回格式契约：含进了多少决定、丢了多少条（缺理由的会被丢）。"
	},
	"tool:memj_score_turn:description": {
		group: "tools",
		owner: "工具 memj_score_turn",
		part: "description",
		purpose: "说明书：**轮末复盘**——回顾某一轮，从知识库里挑出\"本来能帮上忙\"的条目并加分。⚠️ 由插件起子代理调，不是主会话模型自己调。"
	},
	"tool:memj_score_turn:parameters": {
		group: "tools",
		owner: "工具 memj_score_turn",
		part: "parameters",
		purpose: "参数表：session 被复盘的会话 id、turn 第几轮（⚠️ 不是当前会话/当前轮）。"
	},
	"tool:memj_score_turn:output": {
		group: "tools",
		owner: "工具 memj_score_turn",
		part: "output",
		purpose: "返回格式契约。"
	},
	"command:memj-handoff:description": {
		group: "commands",
		owner: "命令 /memj-handoff",
		purpose: "命令菜单里显示的那行字。⚠️ **模型看不到**，纯给人看。改完**需重启**。"
	},
	"command:memj-review:description": {
		group: "commands",
		owner: "命令 /memj-review",
		purpose: "命令菜单说明：打开人侧状态面板（待批准的全局提名 / 断链的外链 / 非法封面）。⚠️ 模型看不到；需重启。"
	},
	"command:memj-get-handoff-project:description": {
		group: "commands",
		owner: "命令 /memj-get-handoff-project",
		purpose: "命令菜单说明：把某个项目的交接内容读进当前会话。⚠️ 模型看不到；需重启。"
	},
	"command:memj-get-handoff-theme:description": {
		group: "commands",
		owner: "命令 /memj-get-handoff-theme",
		purpose: "命令菜单说明：把某个主题下的知识清单读进当前会话。⚠️ 模型看不到；需重启。"
	},
	"command:memj-handoff:hint": {
		group: "commands",
		owner: "命令 /memj-handoff",
		purpose: "选中这个命令后**落进输入框的那行提示**（告诉你可补充重点，或直接回车）。⚠️ 它**不能为空**——空了命令注册会直接报错。需重启。"
	},
	"command:memj-get-handoff-project:hint": {
		group: "commands",
		owner: "命令 /memj-get-handoff-project",
		purpose: "选中命令后落进输入框的提示：填项目 id，且可以再补档位（只看文档 / 连带项目知识 / 全部）。⚠️ 不能为空；需重启。"
	},
	"command:memj-get-handoff-theme:hint": {
		group: "commands",
		owner: "命令 /memj-get-handoff-theme",
		purpose: "选中命令后落进输入框的提示：填主题 id。⚠️ 不能为空；需重启。"
	},
	"handoff:prompt": {
		group: "actions",
		owner: "命令 /memj-handoff · 启动指令（普通）",
		purpose: "你打 `/memj-handoff` 回车后，插件把这段注入会话，告诉模型\"去做一次交接\"，并列四条要点：写哪个项目、先读一遍现有文档再写、沉淀知识、处理归属。⚠️ 它只负责\"叫模型去做\"，真正落盘是模型随后调 memj_handoff 工具。"
	},
	"handoff:prompt-steps": {
		group: "actions",
		owner: "命令 /memj-handoff · 启动指令（分步）",
		purpose: "当你在命令后写了步骤名（如 `/memj-handoff knowledge`）时走这条：只讲\"怎么做这几步\"，不再重复全套规范。"
	},
	"handoff:prompt-note": {
		group: "actions",
		owner: "命令 /memj-handoff · 用户补充语块",
		purpose: "只在**你随命令补了话**（如 `/memj-handoff 这次记网页改造`）时才追加。它把你说的原话带上，并声明\"这是额外交代，不是对上面规范的替代\"。"
	},
	"inject:closing": {
		group: "actions",
		owner: "命令 /memj-get-handoff-* · 收尾指令",
		purpose: "加在「取交接」注入文本的最后，明确告诉模型\"到此为止\"：不要写库、不要改文档、不要调工具核对，只可以告诉用户下一步能做什么。⭐ **为什么必须有**：不给收尾指令，模型会自己猜该干什么，从而自行动手。"
	},
	"inject:target-project": {
		group: "actions",
		owner: "命令 /memj-get-handoff-project · 指路句",
		purpose: "紧跟\"本次交接的目标项目是 X\"后面：说明后续归档就沿用这个项目、不必再查库；但如果明显是另一件事，仍要重新判断归属。"
	},
	"inject:target-theme": {
		group: "actions",
		owner: "命令 /memj-get-handoff-theme · 指路句",
		purpose: "紧跟\"本次交接的目标主题是 X\"后面，补充这个主题是用来干嘛的（了解该主题下有哪些可复用知识）。"
	},
	"inject:project-knowledge-hint": {
		group: "actions",
		owner: "命令 /memj-get-handoff-project · 「本项目的知识」节表头",
		purpose: "知识清单前面那行说明：**只给标题和描述，正文要按需用 memj_read 去读**（长文档它会先给节名清单）。"
	},
	"inject:theme-knowledge-hint": {
		group: "actions",
		owner: "命令 /memj-get-handoff-project · 「所属主题的知识」节表头",
		purpose: "同上，但措辞用\"同样……\"（它紧跟在上一节之后，避免重复啰嗦）。"
	},
	"inject:theme-covers-hint": {
		group: "actions",
		owner: "命令 /memj-get-handoff-theme · 「本主题的知识」节表头",
		purpose: "主题交接里知识清单前的说明，内容与项目交接那条基本一致。"
	},
	"hot:head-first": {
		group: "hot",
		owner: "热知识注入 · 首次消息头",
		purpose: "整段热知识的标题行，标明\"这是本次会话相关的热知识\"。"
	},
	"hot:head-supplement": {
		group: "hot",
		owner: "热知识注入 · 补注消息头",
		purpose: "当插件发现\"有几条之前漏了\"会补发一批。这条标题写明\"这是**补充**\"，免得模型以为又来了一整批新的。"
	},
	"hot:direct-section": {
		group: "hot",
		owner: "热知识注入 · 「直接可用的内容」段标题",
		purpose: "这一段下面放的是**正文已经完整给出**的内容（用户画像 + 标记为 full 的知识）。⭐ 它和 `hot:meta-hint` 语义正好相反：这里是\"正文已在眼前，不用再去读\"。"
	},
	"hot:meta-hint": {
		group: "hot",
		owner: "热知识注入 · 「只给标题和描述」段表头",
		purpose: "这一段只列标题和描述，所以这里提醒模型：**正文要按需用 memj_read 去读**。"
	},
	"hot:closing": {
		group: "hot",
		owner: "热知识注入 · meta 段收尾",
		purpose: "加在末尾：说明\"内容已注入完毕，除非用户的问题正好落在某条上（那就去读正文），否则继续当前任务\"；并禁止额外的客套寒暄。"
	},
	"hot:body-closing": {
		group: "hot",
		owner: "热知识注入 · 正文段收尾",
		purpose: "补注时\"正文段\"是单独一条消息，它有自己的收尾：说明这些是背景知识但不是任务，让模型继续干活。⭐ 不与 meta 段共用同一句——正文已在眼前，再说\"按需读\"就不对了。"
	},
	"jev:need": {
		group: "recall",
		owner: "主动召回 · JEV 需求门",
		purpose: "第一个判断：\"当前这一步需不需要外部知识？\"判成不需要就不去召回了（省时间省钱）。⚠️ 未启用时也会算分，分数进日志供调参。"
	},
	"jev:sufficient": {
		group: "recall",
		owner: "主动召回 · JEV 充足门",
		purpose: "第二个判断：\"手头的知识够不够用？\"够用就跳过召回。⚠️ 生产上阈值设成了 0.9，而实测最高只有 0.85 ⇒ **这道门目前实际上等于废弃**。"
	},
	"jev:search-intent": {
		group: "recall",
		owner: "主动召回 · JEV 意图门",
		purpose: "第三个判断：\"模型是不是已经打算自己去查库了？\"是的话就不重复注入。⭐ **提问必须点名 memj_search / memj_info**——早期措辞太宽（\"是否想查知识库\"），任何\"我该查一下\"的念头都命中，实测两次召回全被它拦掉。"
	},
	"jev:candidate": {
		group: "recall",
		owner: "主动召回 · JEV 逐条打分",
		purpose: "最关键的一条：**对每一条候选知识分别问一次**\"这条现在帮得上忙吗\"，拿到 0~1 的分数后按阈值筛。⭐ 里面点名了 `current_thinking`（本步刚结束的思考）与 `background`（背景材料），并声明\"只按前者判、后者只是材料\"——实测这句措辞能让 96/96 条分数全部上升。"
	},
	"active:header": {
		group: "recall",
		owner: "主动召回 · 注入文本首行",
		purpose: "召回成功后注入文本的第一行：说明下面是\"知识库里与当前工作相关的知识（主动召回）\"。"
	},
	"active:body-hint": {
		group: "recall",
		owner: "主动召回 · 注入文本第二行",
		purpose: "说明只给了标题和描述，**正文要用 memj_read 去读**。⭐ 这一行直接决定模型会不会去读正文，别看它短。"
	},
	"active:closing": {
		group: "recall",
		owner: "主动召回 · 注入文本收尾",
		purpose: "末尾的收尾指令：明确\"以上是背景知识，不是任务；结合它们继续当前工作\"。"
	},
	"score:system": {
		group: "score",
		owner: "知识评分 · 规则段",
		purpose: "告诉打分员\"你的任务是什么\"并给出判断标准：这条知识对项目的**长期工作**有没有实际帮助（具体指两种情况：这一轮需要却没有；这一轮犯了错而它能避免）。⚠️ 它后面还会拼上输出格式、取舍原则，以及**约 3.5 万字符的知识库清单**（缓存大头）。"
	},
	"score:quote-rule": {
		group: "score",
		owner: "知识评分 · 引文硬要求",
		purpose: "要求给理由时**必须从本轮工作内容里逐字复制一句原话**当证据。⭐ 它和一段机械校验配对：程序会拿这句话去原文做**逐字比对**，不是原句就直接丢弃 ⇒ 措辞一旦放松（模型写成\"意思差不多\"），入选会被丢光。"
	},
	"score:pick-principle": {
		group: "score",
		owner: "知识评分 · 取舍原则",
		purpose: "要求\"宁少勿滥\"、一条都没有就回空数组、不要为了凑数而选。⭐ 实测不给条数上限时模型会选 18~24 条（沾边的都收）⇒ 分数被拉平、失去区分度。"
	},
	"score:index-range": {
		group: "score",
		owner: "知识评分 · 编号范围提示",
		purpose: "\"编号必须在 1 到 N 之间\"（N = 候选条数），防止模型回一个越界的编号。"
	},
	"score:pool-header": {
		group: "score",
		owner: "知识评分 · 清单表头",
		purpose: "「知识库清单（共 N 条）」——告诉模型下面是候选清单。"
	},
	"score:user-task": {
		group: "score",
		owner: "知识评分 · user 段骨架",
		purpose: "每次变的那部分：本轮工作内容 + \"最多选几条\" + \"按能改变做法的程度排序，只留最前面几条\"。🔴 **为什么它在 user 段而不在规则段**：`{{k}}` 是可配置的数字，写进规则段会让整份规则随配置变化，**把 3.5 万字符的清单一起拖出缓存**。"
	},
	"score:jev-instruction": {
		group: "score",
		owner: "知识评分 · JEV 通路提问",
		purpose: "如果评分走 JEV 通路（而不是 chat 通路）时用这条提问。⚠️ 与主动召回那 4 条 `jev:*` 不是一回事——那 4 条是\"召回时的判定\"，这条是\"复盘时的提问\"。⚠️ 必须英文。"
	},
	"tag:system": {
		group: "tags",
		owner: "标签规范化 · 裁决规则",
		purpose: "告诉裁决员：输入有什么（词表、范围内的全部标签、相关知识正文摘要）、可以做什么决定（合并 / 新增 / 丢弃 / 改标签）、以及**每个决定都必须给理由**。🔴 **关键约束**：词表是「**可优先复用的选项**」，**不是白名单**。早期把它当过滤器用，叠加\"把所有标签都登记进词表\"之后，**模型永远拿不到需要整理的词、工具完全空转**（实测：253 条参与裁决、0 个候选、模型调用 0 次）。"
	},
	"tag:translate-system": {
		group: "tags",
		owner: "标签规范化 · 英文化",
		purpose: "把中文标签译成简短的英文规范词（全小写、1~3 个词、保留 CSS/DSH 这类专有名词），输出要求 JSON。"
	},
	"translate:mt": {
		group: "translate",
		owner: "英文索引 · 翻译第①级（默认）",
		purpose: "最常用的模板：要求\"把编号条目从中文翻成英文、保留编号\"，并用**空行**分隔标题与描述两段。⭐ 实测用空行暗示比\"强指令\"更有效（约 4% 的输出会把两段合并成一行，空行法能显著降低）。"
	},
	"translate:mt-strong": {
		group: "translate",
		owner: "英文索引 · 翻译第②级",
		purpose: "第①级失败时用：明确要求\"**只输出两行**\"，不许合并。"
	},
	"translate:instruct": {
		group: "translate",
		owner: "英文索引 · 翻译第③级",
		purpose: "前两级都失败时用：改成要求返回 JSON。⚠️ **它与解析器配对**——改提示词可以，但改输出形态会让解析器失败。"
	},
	"reads:snapshot-closing": {
		group: "tools",
		owner: "工具 memj_snapshots · 返回值末尾的判据句",
		purpose: "memj_snapshots 会把\"本会话读过哪些别项目的知识\"列给模型看。末尾这句要求它**逐条判断\"这条确实跟本次相关吗\"**——读了不等于用上了，不相关的要排除。⭐ **为什么要有**：这些快照是\"跨项目复用\"的证据（用来决定要不要建主题），照单全收会拿无关知识去凑证据（本项目真实发生过）。"
	},
	"reads:section-spec-head": {
		group: "tools",
		owner: "工具 memj_read · 读项目文档时的「各节规范」表头",
		purpose: "**整篇读**项目文档时（`full: true`），工具会把\"这份文档每一节的写作规范\"集中列出来（内容取自正文里的规范块），这句是那段清单的**表头**。⚠️ **决策 222 改了触发位置**：原先**每次阅读都给**，用户否掉了那个位置（*\"现在他每一次阅读全都要给他一遍，这有点奇怪吧\"*——无条件 / 重复 / 位置错），现在**只在整篇读时给一次**。⭐ **为什么还要留着**：整篇读通常发生在\"准备大改这份文档\"时，那一刻逐节对照规范是合适的。"
	},
	"reads:section-spec-closing": {
		group: "tools",
		owner: "工具 memj_read · 读项目文档时的「各节规范」收尾",
		purpose: "接在上一条后面，说明这段清单**取自本文档自己的正文**（不是通用清单），并要求：**若某节已明显不符合它自己的规范，顺手整理它**。⭐ **为什么要有这句\"派活\"**：工具只会在**写某一节时**才保护它，**没有东西会说\"这一节该收拾了\"**——「目标」节那种\"长期没人写、内容已经烂掉\"的情况，只有这一眼能发现。"
	},
	"handoff:untouched-sections": {
		group: "tools",
		owner: "工具 memj_handoff · 回执里点名「本次没动的节」",
		purpose: "交接结束时，回执列出**本次没写过的那些节**（名单由程序现填，不是写死的），并要求逐条对照它们**自己的**规范。⭐⭐ **为什么它才是最要紧的一条**：`memj_read` 那段清单只解决了\"看得见\"，而**实测证明看得见不等于会去做**——用户在同一个会话里直接问：*\"写书写规范的目的不就是让他在做交接的时候去按规范去整理和书写吗？刚刚为什么没有做呢？\"*（当时我把规范清单看在了眼里、也去量了「目标」节，却只把它写成了\"给用户的汇报\"、而不是\"我要做的事\"）。⇒ 本条目给的是**触发点**：把\"没动过的节\"摆到交接的收尾处，让\"该整理哪一节\"这件事有机会被真的执行。"
	},
	"handoff:untouched-closing": {
		group: "tools",
		owner: "工具 memj_handoff · 「本次没动的节」的使用说明",
		purpose: "接在上一条后面，讲清三件事：这些节本次**原样保留**（合并规则）、规范就在各节标题下的 `memj:spec` 围栏块里、**若某节已明显不符合规范就现在整理进 `doc`**（整节重写要带上全文）。⚠️ 并明确**不要为了\"顺便\"去改没问题的节**（否则每轮都会去动一堆好好的小节）。"
	},
	"tpl:guidance-head": {
		group: "templates",
		owner: "文档模板 · 写作规范（表头）",
		purpose: "⚠️ **已退役（决策 209）**：不再有任何消费者。保留它只为\"用户若改过，覆盖项不能变成孤儿\"。"
	},
	"tpl:guidance-row": {
		group: "templates",
		owner: "文档模板 · 写作规范（每个节一行）",
		purpose: "⚠️ **已退役（决策 209）**：规范块的形态改由 `renderSpecBlocksSkeleton()` 生成 ⇒ 不再走提示词。"
	},
	"tpl:guidance-trunc-mark": {
		group: "templates",
		owner: "文档模板 · 截断标记（**只剩兼容读**）",
		purpose: "拼在节行末尾的小标记，表示\"这一节的较早内容会被自动归档\"。🔴 **决策 209 后它只服务存量文档**：规范还在**末尾那一节**里的文档，靠它反解\"哪节能截\"（新形态从各节的规范块读）。⚠️ 删了它，那些文档会**静默变成\"不截\"**。"
	},
	"tpl:guidance-no-trunc": {
		group: "templates",
		owner: "文档模板 · 「没有可截断节」说明",
		purpose: "当模板**一节都没声明可截断**时，建项目回执里报这段，如实告诉用户\"文档不会自动瘦身\"，免得以为工具会帮忙压。"
	},
	"tpl:guidance-foot": {
		group: "templates",
		owner: "文档模板 · 写作规范（收尾）",
		purpose: "⚠️ **已退役（决策 209）**：那句话（\"沉淀知识由工具生成\"）改由**回执**报，不再写进文档正文。"
	}
};
/** 取一条的目录信息（未登记返回 `undefined`）。 */
function catalogOf(key) {
	return PROMPT_CATALOG[key];
}
/** 分组排序（页面用）。 */
function groupOrder(g) {
	return PROMPT_GROUPS[g].order;
}
/** 把类型描述成人话。 */
function typeText(v) {
	if (Array.isArray(v)) return v.map((x) => typeText(x)).join(" 或 ");
	if (typeof v === "string") return v;
	if (v === void 0 || v === null) return "—";
	return String(v);
}
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
function renderParametersText(parameters) {
	if (parameters === void 0 || parameters === null) return "（该工具不需要参数）";
	if (typeof parameters !== "object") return String(parameters);
	const p = parameters;
	const fields = p.properties !== void 0 && p.properties !== null && typeof p.properties === "object" ? p.properties : p;
	const entries = Object.entries(fields);
	if (entries.length === 0) return "（该工具不需要参数）";
	const blocks = [];
	for (const [name, def] of entries) {
		const t = typeText(def?.type);
		const head = t === "—" ? name : `${name}（${t}）`;
		const lines = [];
		if (typeof def?.description === "string" && def.description !== "") lines.push(def.description);
		if (Array.isArray(def?.enum)) lines.push(`可选值：${def.enum.map((e) => String(e)).join(" / ")}`);
		const items = def?.items;
		if (items !== void 0 && items !== null) lines.push(`数组，元素类型 ${typeText(items.type)}`);
		const body = lines.map((l) => l.replace(/\n/g, " ").replace(/\s+/g, " ").trim()).filter((l) => l !== "");
		blocks.push(body.length === 0 ? head : `${head}\n${body.map((l) => `    ${l}`).join("\n")}`);
	}
	return blocks.join("\n\n");
}
/**
* 渲染**返回值契约**。
*
* ⚠️ 与 `renderParametersText` 同因：**不用 markdown 表格**（`<pre>` 里对不齐、窄屏散架）。
* @param output - `defineTool` 的 `output` 对象（形如 `{ schema: {...} }`）。
* @returns 人读文本。
*/
function renderOutputText(output) {
	if (output === void 0 || output === null) return "（该工具没有声明返回值 schema）";
	const schema = output.schema;
	if (schema === void 0 || schema === null) return "（该工具没有声明返回值 schema）";
	const props = schema.properties ?? {};
	const entries = Object.entries(props);
	const lines = [];
	if (entries.length > 0) {
		lines.push("返回字段：");
		for (const [name, def] of entries) {
			const t = typeText(def?.type);
			const d = typeof def?.description === "string" ? def.description.replace(/\s+/g, " ").trim() : "";
			lines.push(`    ${t === "—" ? name : `${name}（${t}）`}${d === "" ? "" : `\n        ${d}`}`);
		}
	} else lines.push("（该工具的返回值没有具名字段）");
	if (schema.additionalProperties === false) lines.push("", "⚠️ 多返回一个未声明的字段，整次调用会被拒收（additionalProperties: false）。");
	return lines.join("\n");
}
//#endregion
//#region src/prompts.ts
/**
* ⭐⭐⭐ **提示词注册表与运行期覆盖层**（本次新增）。
*
* ── 这个模块解决什么 ────────────────────────────────────────────────────────
* 插件写给模型的文本原本散在 8 个源文件里，**改一句要重启 3096**（`src/*.ts` 启动时
* import 完），而且**设计文档与代码两份副本会漂**。
* 现在：**设置页的【提示词】子页成为唯一源头**，覆盖值落在
* `<库根>/prompts/overrides.json`，**运行期即刻生效**（实测见
* `scripts/probe-prompt-override.mjs`，13/0）。
*
* ── 运行期生效的机制（已实测，不是推断）────────────────────────────────────
* | 文本类别 | 怎么做到热更新 |
* |---|---|
* | `section()` / `context()` | 它们的 `text` **本来就是函数**，每次装配求值 ⇒ 读覆盖值即可 |
* | 工具 `description` | 注册后**改成 getter**（`Object.defineProperty`）⇒ 每轮装配重新解构 |
* | 命令 / 注入 / 内部调用 | 本来就是**调用点现读常量** ⇒ 改成调本模块的取值函数 |
*
* 🔴🔴 **为什么 `promptText()` 是【同步】的**：上面三类取值点在 DSH 的装配路径上
*    （`text: () => …` / getter），**不允许 async** ⇒ 覆盖值必须在内存里有一份
*    同步可读的缓存。缓存在 `apply` 时预热、每次保存后刷新。
*
* 🔴 **本模块【不 import 任何提示词源模块】** —— 那是**故意**的：
*    每个取值点把**自己的源码常量**当 `fallback` 传进来（`promptText(key, MY_CONST)`），
*    ⇒ 本模块是叶子、不产生循环依赖，且"源码常量"自动成为**默认值**
*    （"恢复默认"就是删掉覆盖项）。
*
* @module dsh-memj/prompts
*/
/** 覆盖文件结构版本（结构变了就升它 ⇒ 旧文件当空表，不猜）。 */
const PROMPT_OVERRIDES_VERSION = 1;
/** 源文件路径（相对插件仓根，展示用）。 */
const F = {
	protocol: "src/protocol.ts",
	context: "src/context.ts",
	descriptions: "src/tool-descriptions.ts",
	tools: "src/tools.ts",
	commands: "src/commands.ts",
	inject: "src/inject.ts",
	reads: "src/reads.ts",
	templates: "src/templates.ts",
	hotInject: "src/hot-inject.ts",
	recall: "src/active-recall.ts",
	scoreChat: "src/score-chat.ts",
	tagNorm: "src/tag-normalize.ts",
	enIndex: "src/en-index.ts"
};
/**
* 十一个工具的展示名（元数据用）。
*
* 🔴🔴 **加新工具时必须在这里补一项**（否则它在【提示词】页上**完全不可见**：
*   `/api/prompts` 的列表直接来自 `PROMPT_SPECS`，而 `PROMPT_SPECS` 由本数组派生出
*   `description` / `parameters` / `output` 三条 ⇒ 漏一项就少三条，页面既看不到、
*   也**改不了**，`/api/prompt?key=…` 还会 **404**）。
*   ⚠️ **真实事故**（2026-10-12）：决策 205 加 `memj_template` 时漏了这一步，
*   十一个月后才被发现。
*   ⭐ **防线**：`scripts/check-prompt-specs.mjs` 会断言「实际注册的工具名集合
*   == 本数组的名字集合」，漏了当场报错（在 `run-all-tests` 里）。
*/
const TOOL_META = [
	{
		name: "memj_info",
		purpose: "列出库里的项目与主题（语境入口，不返回知识条目）",
		owner: "memj_info"
	},
	{
		name: "memj_search",
		purpose: "按项目/主题/检索词筛封面（只找，不回正文）",
		owner: "memj_search"
	},
	{
		name: "memj_read",
		purpose: "按 id 读知识正文或项目交接文档（只读）",
		owner: "memj_read"
	},
	{
		name: "memj_snapshots",
		purpose: "读本会话的读快照清单（跨项目证据来源）",
		owner: "memj_snapshots"
	},
	{
		name: "memj_handoff",
		purpose: "写叙事 + 沉淀知识 + 归属推进（写入主入口）",
		owner: "memj_handoff"
	},
	{
		name: "memj_promote",
		purpose: "事后增删主题归属 / 改封面字段 / 提名全局",
		owner: "memj_promote"
	},
	{
		name: "memj_update",
		purpose: "更新一条已有知识的正文与封面字段",
		owner: "memj_update"
	},
	{
		name: "memj_rebuild",
		purpose: "重建派生层 + 封面体检（人侧也调它）",
		owner: "memj_rebuild"
	},
	{
		name: "memj_template",
		purpose: "管理交接文档模板（列表 / 新建 / 删除；两段式确认）",
		owner: "memj_template"
	},
	{
		name: "memj_normalize_tags",
		purpose: "标签规范化：裁决合并/新增/丢弃/retag",
		owner: "memj_normalize_tags"
	},
	{
		name: "memj_score_turn",
		purpose: "轮末复盘：挑出能帮上忙的知识并加分",
		owner: "memj_score_turn"
	}
];
/** 四个斜杠命令（元数据）。 */
const CMD_META = [
	{
		name: "memj-handoff",
		purpose: "按 memj 规范做一次记忆 handoff"
	},
	{
		name: "memj-review",
		purpose: "人侧状态面板：待批提名 / 断链 / 非法封面"
	},
	{
		name: "memj-get-handoff-project",
		purpose: "把某项目的交接内容注入会话"
	},
	{
		name: "memj-get-handoff-theme",
		purpose: "把某主题的封面清单注入会话"
	}
];
/**
* 命令名 → `commands.ts` 里的描述常量名（供「写回源码」定位）。
*
* ⚠️ **必须显式映射，不能机械推导**：那边导出的常量名与命令名**不是机械对应**
*   （`memj-get-handoff-project` → `CMD_GET_PROJECT_DESCRIPTION`，
*     而不是 `CMD_MEMJ_GET_HANDOFF_PROJECT_DESCRIPTION`）
*   ⇒ 推导会定位到不存在的常量。改 `commands.ts` 的常量名时**这里要一起改**。
* @param name - 命令名（不含前导斜杠）。
* @returns 常量名；未登记 ⇒ 空串（写回会明确报"不支持"）。
*/
function cmdConstName(name) {
	return {
		"memj-handoff": "CMD_HANDOFF_DESCRIPTION",
		"memj-review": "CMD_REVIEW_DESCRIPTION",
		"memj-get-handoff-project": "CMD_GET_PROJECT_DESCRIPTION",
		"memj-get-handoff-theme": "CMD_GET_THEME_DESCRIPTION"
	}[name] ?? "";
}
/**
* ⭐⭐⭐ **三个带 `input.hint` 的命令**（2026-10-12 新增）——它们是**用户在输入框里
* 真正看到的那行字**。
*
* 🔴 **为什么必须单独一张表**：`/memj-review` **没有** `input`（它是 popupSelect 装饰、
*    一选即执行）⇒ 不能像描述那样直接 `CMD_META.map` 出四条。
*
* 🔴 **为什么 hint 也算提示词**（用户 2026-10-12 点名要求接进来）：
*    声明了 `input` 的命令被选中后，宿主会把 `/命令名 ` **连同这句 hint 一起落进输入框**
*    ⇒ 它决定用户**知不知道这个命令能补话、能补什么**（如"可再补档位"）。
*
* ⚠️ **常量名必须显式映射**（与描述同因：常量名与命令名不是机械对应）。
* ⚠️ **热生效档位 = `restart`**：`normalizeDefinition()` 把 `input`
*    `Object.freeze` 进 descriptor（`lib/index.js:149-171` 实测）⇒ 注册后改无效。
*/
const CMD_HINT_META = [
	{
		name: "memj-handoff",
		constName: "HINT_HANDOFF",
		purpose: "命令选中后落进输入框的提示：可以补充本次重点"
	},
	{
		name: "memj-get-handoff-project",
		constName: "HINT_GET_PROJECT",
		purpose: "命令选中后落进输入框的提示：填项目 id，可再补档位"
	},
	{
		name: "memj-get-handoff-theme",
		constName: "HINT_GET_THEME",
		purpose: "命令选中后落进输入框的提示：填主题 id"
	}
];
/**
* ⭐⭐⭐ **全部提示词的静态元数据**（唯一一份）。
*
* 🔴 **加新提示词时改这里** —— 它是【提示词】页的账本；
* ⚠️ 装配侧也要同步接上取值（见各调用点的 `promptText(key, fallback)`）。
*/
const PROMPT_SPECS_RAW = [
	{
		key: "section:memj:protocol",
		injectMode: "systemPrompt.section() —— system 角色，独占 node 0",
		breaksCache: "yes",
		sourceFile: F.protocol,
		sourceConst: "PROTOCOL_TEXT",
		hotReload: "immediate",
		editable: true,
		checks: [
			{ kind: "nonEmpty" },
			{
				kind: "maxChars",
				max: 2500,
				why: "协议预算 2500（越了要压缩，别抬阈值）"
			},
			{ kind: "fencesBalanced" }
		]
	},
	{
		key: "context:memj:usage-guidance",
		injectMode: "systemPrompt.context() —— user 角色，尾部 append",
		breaksCache: "no",
		sourceFile: F.context,
		sourceConst: "CONTEXT_TEXT",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, { kind: "fencesBalanced" }]
	},
	...TOOL_META.flatMap((t) => [
		{
			key: `tool:${t.name}:description`,
			injectMode: "wire `tools` 段的工具 description",
			breaksCache: "yes",
			sourceFile: F.descriptions,
			sourceConst: `${t.name.toUpperCase()}_DESCRIPTION`,
			hotReload: "immediate",
			editable: true,
			/**
			* ⚠️ **这里曾经想加 `slots: ['kindList']` 校验，已撤掉**（决策 217）：
			*   那套"插槽"方案整体作废 —— `{{名字}}` 在 **DSH 的通道里是有主的语法**
			*   （会被它再解析、且只认小写、还要求变量已注册 ⇒ 否则**抛异常**）。
			* ⭐ 现在用 **HTML 注释标记**（`<!--memj:kind-list-->`），
			*   而"禁止 `{{}}`"那道闸由 **通道判定** 统一加（见 `validatePrompt`），
			*   不需要在这条 spec 上单独声明。
			*/
			checks: [{ kind: "nonEmpty" }]
		},
		{
			key: `tool:${t.name}:parameters`,
			injectMode: "wire `tools` 段的 parameters（JSON Schema）",
			breaksCache: "yes",
			sourceFile: F.tools,
			hotReload: "readonly",
			editable: false,
			readonlyWhy: "参数 schema 决定模型怎么调用这个工具；改坏会导致调用被拒或参数错。它是\"可机械验证的契约\"，不是主观文本 ⇒ 只展示。",
			checks: []
		},
		{
			key: `tool:${t.name}:output`,
			injectMode: "不进模型上下文（是运行时校验契约）",
			breaksCache: "no",
			sourceFile: F.tools,
			hotReload: "readonly",
			editable: false,
			readonlyWhy: "返回值 schema 是运行时强校验：多返回一个字段就让整次调用被拒收。只展示。",
			checks: []
		}
	]),
	...CMD_META.map((c) => ({
		key: `command:${c.name}:description`,
		injectMode: "命令描述符（消费方是界面/协议，不进模型上下文）",
		breaksCache: "no",
		sourceFile: F.commands,
		sourceConst: cmdConstName(c.name),
		hotReload: "restart",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	})),
	...CMD_HINT_META.map((c) => ({
		key: `command:${c.name}:hint`,
		injectMode: "命令的 `input.hint`（选中后连同命令名落进输入框；不进模型上下文）",
		breaksCache: "no",
		sourceFile: F.commands,
		sourceConst: c.constName,
		hotReload: "restart",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	})),
	{
		key: "inject:closing",
		injectMode: "命令 followup 注入文本的末尾",
		breaksCache: "no",
		sourceFile: F.inject,
		sourceConst: "CLOSING_INSTRUCTION",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "inject:target-project",
		injectMode: "命令 followup 注入文本（跟在本项目 id 之后）",
		breaksCache: "no",
		sourceFile: F.inject,
		sourceConst: "TARGET_PROJECT_LINE",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "inject:target-theme",
		injectMode: "命令 followup 注入文本（跟在本主题 id 之后）",
		breaksCache: "no",
		sourceFile: F.inject,
		sourceConst: "TARGET_THEME_LINE",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "inject:project-knowledge-hint",
		injectMode: "命令 followup 注入文本的「本项目的知识」节",
		breaksCache: "no",
		sourceFile: F.inject,
		sourceConst: "PROJECT_KNOWLEDGE_HINT",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "inject:theme-knowledge-hint",
		injectMode: "命令 followup 注入文本的「所属主题的知识」节",
		breaksCache: "no",
		sourceFile: F.inject,
		sourceConst: "THEME_KNOWLEDGE_HINT",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "inject:theme-covers-hint",
		injectMode: "命令 followup 注入文本的「本主题的知识」节",
		breaksCache: "no",
		sourceFile: F.inject,
		sourceConst: "THEME_COVERS_HINT",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "handoff:prompt",
		injectMode: "命令 followup 注入（会唤醒模型）",
		breaksCache: "no",
		sourceFile: F.commands,
		sourceConst: "HANDOFF_PROMPT",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "handoff:prompt-steps",
		injectMode: "命令 followup 注入（会唤醒模型）",
		breaksCache: "no",
		sourceFile: F.commands,
		sourceConst: "HANDOFF_PROMPT_STEPS",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, {
			kind: "slots",
			tokens: ["steps", "stepsJson"],
			why: "这两个是\"用户指定了哪几步\"与它的 JSON 形态，由程序填；删掉模型就收不到要做什么"
		}]
	},
	{
		key: "handoff:prompt-note",
		injectMode: "命令 followup 注入的末尾（条件追加）",
		breaksCache: "no",
		sourceFile: F.commands,
		sourceConst: "HANDOFF_PROMPT_NOTE",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, {
			kind: "slots",
			tokens: ["userNote"],
			why: "它是用户补充的那句原话，由程序填；删掉这一块就没有内容可交代了"
		}]
	},
	{
		key: "jev:candidate",
		injectMode: "JEV 请求的 questions[].instructions（不进主会话）",
		breaksCache: "na",
		sourceFile: F.recall,
		sourceConst: "JEV_CANDIDATE_INSTRUCTION",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, { kind: "englishOnly" }]
	},
	{
		key: "jev:need",
		injectMode: "JEV 请求的 questions.need.instructions",
		breaksCache: "na",
		sourceFile: F.recall,
		sourceConst: "JEV_NEED_INSTRUCTION",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, { kind: "englishOnly" }]
	},
	{
		key: "jev:sufficient",
		injectMode: "JEV 请求的 questions.sufficient.instructions",
		breaksCache: "na",
		sourceFile: F.recall,
		sourceConst: "JEV_SUFFICIENT_INSTRUCTION",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, { kind: "englishOnly" }]
	},
	{
		key: "jev:search-intent",
		injectMode: "JEV 请求的 questions.search_intent.instructions",
		breaksCache: "na",
		sourceFile: F.recall,
		sourceConst: "JEV_SEARCH_INTENT_INSTRUCTION",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, { kind: "englishOnly" }]
	},
	{
		key: "active:closing",
		injectMode: "注入进主会话（pre-step 的 user 消息）",
		breaksCache: "no",
		sourceFile: F.recall,
		sourceConst: "ACTIVE_CLOSING_INSTRUCTION",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "active:header",
		injectMode: "注入进主会话（pre-step 的 user 消息）",
		breaksCache: "no",
		sourceFile: F.recall,
		sourceConst: "ACTIVE_HEADER",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "active:body-hint",
		injectMode: "注入进主会话（pre-step 的 user 消息）",
		breaksCache: "no",
		sourceFile: F.recall,
		sourceConst: "ACTIVE_BODY_HINT",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "hot:closing",
		injectMode: "注入进主会话（每轮的背景消息）",
		breaksCache: "no",
		sourceFile: F.hotInject,
		sourceConst: "HOT_CLOSING_INSTRUCTION",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "hot:body-closing",
		injectMode: "注入进主会话（补注时单独一条消息）",
		breaksCache: "no",
		sourceFile: F.hotInject,
		sourceConst: "HOT_BODY_CLOSING_INSTRUCTION",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "hot:head-first",
		injectMode: "注入进主会话（每轮的背景消息）",
		breaksCache: "no",
		sourceFile: F.hotInject,
		sourceConst: "HOT_HEAD_FIRST",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "hot:head-supplement",
		injectMode: "注入进主会话（补注时）",
		breaksCache: "no",
		sourceFile: F.hotInject,
		sourceConst: "HOT_HEAD_SUPPLEMENT",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "hot:direct-section",
		injectMode: "注入进主会话（每轮的背景消息）",
		breaksCache: "no",
		sourceFile: F.hotInject,
		sourceConst: "HOT_DIRECT_SECTION",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "hot:meta-hint",
		injectMode: "注入进主会话（每轮的背景消息）",
		breaksCache: "no",
		sourceFile: F.hotInject,
		sourceConst: "HOT_META_HINT",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "score:system",
		injectMode: "子代理请求的 system（含知识库清单，不进主会话）",
		breaksCache: "na",
		sourceFile: F.scoreChat,
		sourceConst: "SCORE_SYSTEM_BASE",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "score:quote-rule",
		injectMode: "子代理请求的 system（不进主会话）",
		breaksCache: "na",
		sourceFile: F.scoreChat,
		sourceConst: "SCORE_QUOTE_RULE",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "score:user-task",
		injectMode: "子代理请求的 user（含本轮内容，不进主会话）",
		breaksCache: "na",
		sourceFile: F.scoreChat,
		sourceConst: "SCORE_USER_TASK",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, {
			kind: "slots",
			tokens: ["k"],
			why: "它是\"本次最多选几条\"的可配数字，由程序填；删掉模型就不知道上限，也不会去排序取舍"
		}]
	},
	{
		key: "score:pick-principle",
		injectMode: "子代理请求的 system（不进主会话）",
		breaksCache: "na",
		sourceFile: F.scoreChat,
		sourceConst: "SCORE_PICK_PRINCIPLE",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "score:index-range",
		injectMode: "子代理请求的 system（不进主会话）",
		breaksCache: "na",
		sourceFile: F.scoreChat,
		sourceConst: "SCORE_INDEX_RANGE",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, {
			kind: "slots",
			tokens: ["n"],
			why: "它是候选条数（每轮都变），由程序填；删掉模型就不知道合法编号范围"
		}]
	},
	{
		key: "score:pool-header",
		injectMode: "子代理请求的 system（不进主会话）",
		breaksCache: "na",
		sourceFile: F.scoreChat,
		sourceConst: "SCORE_POOL_HEADER",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, {
			kind: "slots",
			tokens: ["n"],
			why: "它是候选条数，由程序填；删掉表头就无法把下文识别成清单"
		}]
	},
	{
		key: "score:jev-instruction",
		injectMode: "JEV 请求的 questions[].instructions（不进主会话）",
		breaksCache: "na",
		sourceFile: "src/score-turn.ts",
		sourceConst: "JEV_SCORE_INSTRUCTION",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, { kind: "englishOnly" }]
	},
	{
		key: "tag:system",
		injectMode: "子代理请求的提示词（不进主会话）",
		breaksCache: "na",
		sourceFile: F.tagNorm,
		sourceConst: "ADJUDICATE_SYSTEM",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "translate:mt",
		injectMode: "翻译请求的提示词（不进主会话）",
		breaksCache: "na",
		sourceFile: F.enIndex,
		sourceConst: "MT_SYS",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "translate:mt-strong",
		injectMode: "翻译请求的提示词（不进主会话）",
		breaksCache: "na",
		sourceFile: F.enIndex,
		sourceConst: "MT_SYS_STRONG",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "translate:instruct",
		injectMode: "翻译请求的提示词（不进主会话）",
		breaksCache: "na",
		sourceFile: F.enIndex,
		sourceConst: "INSTRUCT_SYS",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "tag:translate-system",
		injectMode: "子代理请求的提示词（不进主会话）",
		breaksCache: "na",
		sourceFile: F.tagNorm,
		sourceConst: "TRANSLATE_SYSTEM",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "reads:snapshot-closing",
		injectMode: "工具返回值（进模型上下文；不进 node 0、不破前缀缓存）",
		breaksCache: "no",
		sourceFile: F.reads,
		sourceConst: "SNAPSHOT_CLOSING",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "reads:section-spec-head",
		injectMode: "工具返回值（进模型上下文；不进 node 0、不破前缀缓存）",
		breaksCache: "no",
		sourceFile: F.reads,
		sourceConst: "SECTION_SPEC_HEAD",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "reads:section-spec-closing",
		injectMode: "工具返回值（进模型上下文；不进 node 0、不破前缀缓存）",
		breaksCache: "no",
		sourceFile: F.reads,
		sourceConst: "SECTION_SPEC_CLOSING",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "handoff:untouched-sections",
		injectMode: "工具返回值（进模型上下文；不进 node 0、不破前缀缓存）",
		breaksCache: "no",
		sourceFile: F.reads,
		sourceConst: "HANDOFF_UNTOUCHED_SECTIONS",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, {
			kind: "slots",
			tokens: ["sections"],
			why: "它是\"本次没动过的那几个节\"的实际名字，由程序现填；删了模型就不知道是哪些节"
		}]
	},
	{
		key: "handoff:untouched-closing",
		injectMode: "工具返回值（进模型上下文；不进 node 0、不破前缀缓存）",
		breaksCache: "no",
		sourceFile: F.reads,
		sourceConst: "HANDOFF_UNTOUCHED_CLOSING",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "tpl:guidance-head",
		injectMode: "⚠️ 已退役（决策 209）——不再有消费者，保留登记以免旧覆盖变孤儿",
		breaksCache: "no",
		sourceFile: F.templates,
		sourceConst: "TPL_GUIDANCE_HEAD",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, {
			kind: "slots",
			tokens: ["count"],
			why: "它是这份文档的节数，由程序填；删掉模型就不知道有几节"
		}]
	},
	{
		key: "tpl:guidance-row",
		injectMode: "⚠️ 已退役（决策 209）——规范块的形态改由代码生成，不再走提示词",
		breaksCache: "no",
		sourceFile: F.templates,
		sourceConst: "TPL_GUIDANCE_ROW",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, {
			kind: "slots",
			tokens: [
				"name",
				"desc",
				"trunc"
			],
			why: "节名与\"这一节要干嘛\"是用户自己在模板页写的、trunc 是可截断标记；删掉就等于不告诉模型该写什么"
		}]
	},
	{
		key: "tpl:guidance-trunc-mark",
		injectMode: "⚠️ **只剩兼容读**（决策 209）：只服务\"规范还在末尾那一节\"的存量文档",
		breaksCache: "no",
		sourceFile: F.templates,
		sourceConst: "TPL_GUIDANCE_TRUNC_MARK",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "tpl:guidance-no-trunc",
		injectMode: "建项目回执（\"本模板没有可截断的节\"那句警告）",
		breaksCache: "no",
		sourceFile: F.templates,
		sourceConst: "TPL_GUIDANCE_NO_TRUNC",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }]
	},
	{
		key: "tpl:guidance-foot",
		injectMode: "⚠️ 已退役（决策 209）——那句话改由回执报，不再写进文档",
		breaksCache: "no",
		sourceFile: F.templates,
		sourceConst: "TPL_GUIDANCE_FOOT",
		hotReload: "immediate",
		editable: true,
		checks: [{ kind: "nonEmpty" }, {
			kind: "slots",
			tokens: ["knowledgeTitle"],
			why: "那是「沉淀知识」这个钉死的节名（来自 sections.ts），由程序填；写死会与服务端常量漂开"
		}]
	}
];
/**
* 给每条 spec 从目录补上 `zone` / `purpose` / `owner`。
*
* ⚠️ **目录里没有的 key**：**不报错**（避免运行时炸），但会补一句显眼的占位说明，
*   并由 `scripts/check-prompt-specs.mjs` 的**检查 ④**在套件里报红。
* @param specs - 原始 spec 列表。
* @returns 补齐后的列表（顺序不变）。
*/
function withCatalog(specs) {
	return specs.map((s) => {
		const c = PROMPT_CATALOG[s.key];
		if (c === void 0) return {
			...s,
			zone: "tools",
			purpose: "（未登记说明）",
			owner: "（未登记）"
		};
		return {
			...s,
			zone: c.group,
			purpose: c.purpose,
			owner: c.owner
		};
	});
}
/** ⭐ 【提示词】页的账本：**程序语义 + 目录文案**的合成结果。 */
const PROMPT_SPECS = withCatalog(PROMPT_SPECS_RAW);
/** 按键取元数据。 */
function specOf(key) {
	return PROMPT_SPECS.find((s) => s.key === key);
}
/**
* ⭐⭐ **覆盖值的同步缓存**（`promptText` 靠它）。
*
* 🔴 **为什么必须有**：取值点在 DSH 装配路径上（`text: () => …` / getter），
*    **不允许 async**。⇒ 磁盘只在 `load`/`save` 时读，运行期走内存。
*/
let cache = /* @__PURE__ */ new Map();
/**
* ⭐ **覆盖时间的同步副本**（展示用；与 `cache` 一起装载）。
*
* ⚠️ **与 `cache` 分开存**：`cache` 是**装配路径**要的（只要文本），
*    而时间是**给人看**的。两者一起刷，避免"文本更新了、时间还是旧的"。
*/
let updatedAtCache = /* @__PURE__ */ new Map();
/** 空覆盖表。 */
function emptyOverrides() {
	return {
		version: 1,
		overrides: {}
	};
}
/**
* **读覆盖表**（容错：任何异常回空表）。
*
* ⚠️ 与 `hot-score-store` 同一纪律：**坏文件不该让功能整个挂掉**；
*    但也不静默改语义——版本不符就当空表（宁可回默认值，也不用结构不明的表）。
* @returns 覆盖表。
*/
async function loadPromptOverrides() {
	try {
		const text = await readFile(promptOverridesPath(), "utf8");
		const parsed = JSON.parse(text);
		if (parsed?.version !== 1) return emptyOverrides();
		if (parsed.overrides === null || typeof parsed.overrides !== "object") return emptyOverrides();
		const out = emptyOverrides();
		for (const [k, v] of Object.entries(parsed.overrides)) if (v !== null && typeof v === "object" && typeof v.text === "string") out.overrides[k] = {
			text: v.text,
			updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : ""
		};
		return out;
	} catch {
		return emptyOverrides();
	}
}
/** **原子写**覆盖表。 */
async function savePromptOverrides(o) {
	await mkdir(promptsDir(), { recursive: true });
	await writeTextAtomic(promptOverridesPath(), JSON.stringify(o, null, 1));
}
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
function refreshPromptCacheSync() {
	try {
		const text = readFileSync(promptOverridesPath(), "utf8");
		const parsed = JSON.parse(text);
		if (parsed?.version !== 1) {
			clearCaches();
			return 0;
		}
		if (parsed.overrides === null || typeof parsed.overrides !== "object") {
			clearCaches();
			return 0;
		}
		const next = /* @__PURE__ */ new Map();
		const nextAt = /* @__PURE__ */ new Map();
		for (const [k, v] of Object.entries(parsed.overrides)) if (v !== null && typeof v === "object" && typeof v.text === "string") {
			next.set(k, v.text);
			const at = v.updatedAt;
			if (typeof at === "string" && at !== "") nextAt.set(k, at);
		}
		cache = next;
		updatedAtCache = nextAt;
		return next.size;
	} catch {
		clearCaches();
		return 0;
	}
}
/**
* ⭐⭐⭐ **把覆盖表读进内存**（保存后刷新）。
*
* ⚠️ **写入失败不抛给调用方的主流程**：缓存刷不上只是"本次没生效"，
*    不该让一次保存把整个插件弄崩（照 recall-log 的纪律）。
* @returns 装载的条数（诊断用）。
*/
async function refreshPromptCache() {
	const o = await loadPromptOverrides();
	const next = /* @__PURE__ */ new Map();
	const nextAt = /* @__PURE__ */ new Map();
	for (const [k, v] of Object.entries(o.overrides)) {
		next.set(k, v.text);
		if (v.updatedAt !== "") nextAt.set(k, v.updatedAt);
	}
	cache = next;
	updatedAtCache = nextAt;
	return next.size;
}
/** 两个缓存一起清（**必须成对** —— 只清一个会让时间与文本对不上）。 */
function clearCaches() {
	cache = /* @__PURE__ */ new Map();
	updatedAtCache = /* @__PURE__ */ new Map();
}
/** 清空内存缓存（测试用）。 */
function resetPromptCache() {
	clearCaches();
}
/** 直接注入缓存（测试用：免磁盘）。 */
function setPromptCacheForTest(entries) {
	cache = new Map(Object.entries(entries));
	updatedAtCache = /* @__PURE__ */ new Map();
}
/**
* ⭐⭐⭐ **取一条提示词的当前值**（覆盖值优先，否则用调用方给的源码常量）。
*
* 这是**所有取值点唯一该调的入口**。
* @param key - 稳定键（见 `PROMPT_SPECS`）。
* @param fallback - **调用方自己的源码常量**（即"默认值"；恢复默认 = 删覆盖项）。
* @returns 该生效的文本。
*/
function promptText(key, fallback) {
	const v = cache.get(key);
	return v === void 0 ? fallback : v;
}
/** 该键是否被覆盖（展示用）。 */
function hasOverride(key) {
	return cache.has(key);
}
/**
* **取该键被覆盖的时间**（展示用）；未被覆盖时回 `''`。
*
* 🔴 **为什么要单独存一份时间**：`cache` 只存文本（那是装配路径要的）；而界面上
*    "这是什么时候改的"必须如实显示 —— ⚠️ 我第一版在 API 里硬写了 `updatedAt: ''`，
*    那是**界面在撒谎**（明明有值却说没有），本项目不允许。
*/
function overrideUpdatedAt(key) {
	return updatedAtCache.get(key) ?? "";
}
/** 当前全部覆盖键（展示用）。 */
function overriddenKeys() {
	return [...cache.keys()];
}
/**
* ⭐⭐ **默认文本登记表**（由各模块在加载时登记自己的源码常量）。
*
* 🔴🔴 **为什么用"登记"而不是让本模块直接 import 那些常量**：
*    那会造成**循环依赖**（`tools.ts` → `prompts.ts` → `tool-descriptions.ts` 还行，
*    但 `hot-inject.ts`、`active-recall.ts` 等会与本模块互相引用）。
*    ⇒ 本模块保持**叶子**地位：各模块把默认值送进来。
*
* ⚠️ **不登记也能工作**（覆盖值优先、回落到调用点自己传的 fallback）；
*    登记只是为了**展示页能并排显示"默认 vs 当前"**。
*/
const defaults = /* @__PURE__ */ new Map();
/**
* **登记一条默认文本**（各模块加载时调；重复登记以最后为准）。
* @param key - 稳定键。
* @param text - 源码常量（默认值）。
*/
function registerPromptDefault(key, text) {
	defaults.set(key, text);
}
/** 取默认文本（展示用）；未登记时 `undefined`。 */
function promptDefault(key) {
	return defaults.get(key);
}
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
function registeredPromptKeys() {
	return [...defaults.keys()];
}
/** 当前生效文本（展示用：覆盖优先，否则默认）。 */
function promptCurrent(key) {
	return promptText(key, defaults.get(key) ?? "");
}
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
function checkNoDshVariables(text) {
	const hits = [...text.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[0]);
	if (hits.length === 0) return [];
	const uniq = [...new Set(hits)].slice(0, 5);
	return [`文本里有 ${hits.length} 处 \`{{…}}\`（如 ${uniq.join("、")}）——**DSH 会把这段再解析一遍**，它的变量名只允许小写开头、且必须已注册，否则**会话装配直接抛异常**。memj 自己的占位请改用 HTML 注释标记（<!--memj:kind-catalog-->）。`];
}
function validatePrompt(key, text) {
	const spec = specOf(key);
	if (spec === void 0) return [`未知的提示词键：${key}`];
	if (!spec.editable) return [`${key} 是只读项${spec.readonlyWhy !== void 0 ? `（${spec.readonlyWhy}）` : ""}`];
	const out = [];
	if (spec.injectMode.includes("systemPrompt.") || spec.injectMode.includes("wire `tools`")) out.push(...checkNoDshVariables(text));
	for (const c of spec.checks) if (c.kind === "nonEmpty") {
		if (text.trim() === "") out.push("内容不能为空。");
	} else if (c.kind === "maxChars") {
		if (text.length > c.max) out.push(`超过预算：当前 ${text.length} 字符，上限 ${c.max}（${c.why}）。`);
	} else if (c.kind === "englishOnly") {
		const cjk = text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g);
		if (cjk !== null && cjk.length > 0) out.push(`必须全英文（检测到 ${cjk.length} 个中文字符/全角标点）。中文会让 JEV 分值分布压平、分辨力归零。`);
	} else if (c.kind === "fencesBalanced") {
		const n = (text.match(/^```/gm) ?? []).length;
		if (n % 2 !== 0) out.push(`markdown 围栏不成对（检测到 ${n} 个 \`\`\`，必须是偶数）。`);
	} else if (c.kind === "slots") {
		const present = new Set(slotNames(text));
		const missing = c.tokens.filter((t) => !present.has(t));
		if (missing.length > 0) out.push(`缺少必须保留的变量插槽：${missing.map((t) => `{{${t}}}`).join("、")}（${c.why}）。这些位置由程序填运行时值——删掉它们那些值就再也传不进提示词了（且不会报错）。`);
		const unknown = [...present].filter((t) => !c.tokens.includes(t));
		if (unknown.length > 0) out.push(`出现了未登记的变量插槽：${unknown.map((t) => `{{${t}}}`).join("、")}。它不会被替换、会**原样发给模型**。本条目可用的插槽只有：${c.tokens.map((t) => `{{${t}}}`).join("、")}。`);
	}
	return out;
}
/** 插槽名字符集（`{{名字}}`：字母、数字、下划线；**不含**空格与中文，避免误吞正文）。 */
const SLOT_RE = /\{\{([A-Za-z0-9_]+)\}\}/g;
/**
* ⭐⭐⭐ **取出文本里出现的全部插槽名**（去重）。
*
* ⚠️ **字符集刻意收窄**（`[A-Za-z0-9_]`）：提示词正文里本来就有大量 `{` `}`
*    （如 JSON 示例 `{"picks":[]}`）⇒ 若允许空格/中文，`{ 编号 }` 这类**正常正文**
*    会被误认成插槽，导致保存被无故拒绝。
* @param text - 待扫描文本。
* @returns 插槽名（出现顺序、已去重）。
*/
function slotNames(text) {
	const out = [];
	for (const m of text.matchAll(SLOT_RE)) {
		const name = m[1] ?? "";
		if (name !== "" && !out.includes(name)) out.push(name);
	}
	return out;
}
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
function fillSlots(template, vars) {
	return template.replace(SLOT_RE, (whole, name) => vars[name] ?? whole);
}
/**
* **写一份历史备份**（旧值），返回落点。
*
* 🔴 **防同毫秒撞名**：文件名用 ISO 时间戳（含毫秒），而两次保存**可能落在同一毫秒**
*    （脚本化调用、或用户手速极快）⇒ 若直接写就会**覆盖掉上一份备份**、
*    让"可回退"静默失效。⇒ 撞名时追加 `-2` / `-3`。
* @param key - 稳定键。
* @param text - 要备份的文本（旧值）。
* @returns 备份文件的绝对路径。
*/
async function writeHistoryBackup(key, text) {
	await mkdir(promptHistoryDir(), { recursive: true });
	const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
	const base = `${safeName(key)}-${stamp}`;
	let path = join(promptHistoryDir(), `${base}.txt`);
	for (let n = 2; existsSync(path) && n < 100; n += 1) path = join(promptHistoryDir(), `${base}-${n}.txt`);
	await writeFile(path, text, "utf8");
	return path;
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
async function savePromptOverride(key, text) {
	const errors = validatePrompt(key, text);
	if (errors.length > 0) return {
		ok: false,
		errors,
		saved: false
	};
	let backupPath;
	try {
		const cur = await loadPromptOverrides();
		const old = cur.overrides[key];
		if (old !== void 0 && old.text !== text) backupPath = await writeHistoryBackup(key, old.text);
		cur.overrides[key] = {
			text,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		await savePromptOverrides(cur);
		await refreshPromptCache();
		return {
			ok: true,
			errors: [],
			saved: true,
			...backupPath !== void 0 ? { backupPath } : {}
		};
	} catch (err) {
		return {
			ok: false,
			errors: [`写盘失败：${err instanceof Error ? err.message : String(err)}`],
			saved: false
		};
	}
}
/**
* ⭐ **恢复默认**（删掉覆盖项 ⇒ 自动回落到源码常量）。
* @param key - 稳定键。
* @returns 保存结果（`saved` 表示是否真的写了盘）。
*/
async function resetPromptOverride(key) {
	try {
		const cur = await loadPromptOverrides();
		if (cur.overrides[key] === void 0) return {
			ok: true,
			errors: [],
			saved: false
		};
		const backupPath = await writeHistoryBackup(key, cur.overrides[key].text);
		delete cur.overrides[key];
		await savePromptOverrides(cur);
		await refreshPromptCache();
		return {
			ok: true,
			errors: [],
			saved: true,
			backupPath
		};
	} catch (err) {
		return {
			ok: false,
			errors: [`写盘失败：${err instanceof Error ? err.message : String(err)}`],
			saved: false
		};
	}
}
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
async function restorePromptHistory(key, fileName) {
	const text = await readPromptHistory(fileName);
	if (text === void 0) return {
		ok: false,
		errors: ["读不到该历史版本（文件名不对或已被清理）"],
		saved: false
	};
	return savePromptOverride(key, text);
}
/**
* **列某条提示词的历史版本**（倒序，最新在前）。
* @param key - 稳定键。
* @returns 文件名列表（不含目录）。
*/
async function listPromptHistory(key) {
	try {
		const dir = promptHistoryDir();
		const files = await readdir(dir);
		const prefix = `${safeName(key)}-`;
		return files.filter((f) => f.startsWith(prefix) && f.endsWith(".txt")).sort().reverse();
	} catch {
		return [];
	}
}
/**
* **读某一版历史**。
* @param fileName - `listPromptHistory` 给的文件名。
* @returns 文本；读不到回 `undefined`。
*/
async function readPromptHistory(fileName) {
	try {
		if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return void 0;
		return await readFile(join(promptHistoryDir(), fileName), "utf8");
	} catch {
		return;
	}
}
/**
* **删掉全部历史**（人侧"清理历史"用；⚠️ 不删覆盖表）。
* @returns 删掉的条数。
*/
async function clearPromptHistory() {
	try {
		const dir = promptHistoryDir();
		const files = await readdir(dir);
		let n = 0;
		for (const f of files) {
			await rm(join(dir, f), { force: true });
			n += 1;
		}
		return n;
	} catch {
		return 0;
	}
}
//#endregion
//#region src/reads.ts
/**
* 读快照的记录与消费（方案 §3.8）。
*
* **它解决的问题**（§3.8 开头）：LLM 每次**从别项目取知识来用**，
* 就是一次**真实发生的跨项目复用**——把它记下来，
* "跨了两个项目"这件事**就已经是既成事实**，
* **不需要事后扫全库去猜相似**（这正是 §3.7.2 那唯一一处工具校验的立足点）。
*
* ── 三条已知偏差（§3.8.3，须知悉）──────────────────────────────────────────
* 1. **快照会过期**——长会话中早期读的条目归属可能已被改；**以快照为准**（用户拍板）；
* 2. **不去重**——同会话读同一条几次就记几条；
* 3. **只有读了才记**——凭记忆直接用的情况没有快照，靠项目 `themes:` 兜底。
*
* @module dsh-memj/reads
*/
const SNAPSHOT_CLOSING = `🔴 **逐条判断"它确实和本次要落盘的项目相关吗"**——读了不等于用上了；不相关的要排除，否则会拿无关知识去凑主题证据。`;
registerPromptDefault("reads:snapshot-closing", SNAPSHOT_CLOSING);
const SECTION_SPEC_HEAD = `📐 **本文档各节的写作规范**（逐节对照——写之前先看有没有哪一节已经不符合它自己的规范）：`;
registerPromptDefault("reads:section-spec-head", SECTION_SPEC_HEAD);
const SECTION_SPEC_CLOSING = `⚠️ 上面每一条都取自**这份文档自己的正文**（不是通用清单）。若某节的内容已经明显不符合它自己的规范，**顺手整理它**——「没写某一节」只能靠这一眼发现，工具不会替你检查。`;
registerPromptDefault("reads:section-spec-closing", SECTION_SPEC_CLOSING);
const HANDOFF_UNTOUCHED_SECTIONS = `📋 **本次没动过的节（{{sections}}）**——逐条对照它们**自己的**规范，看有没有哪一节已经不符合了：`;
registerPromptDefault("handoff:untouched-sections", HANDOFF_UNTOUCHED_SECTIONS);
const HANDOFF_UNTOUCHED_CLOSING = `⚠️ 上面这些节本次**原样保留**（合并规则：没写的节沿用旧内容）。规范就写在各节标题下那个 \`memj:spec\` 围栏块里——⭐ **若某节已经明显不符合它自己的规范，现在就把它整理进 \`doc\`** （要整节重写就带上它的全文）。⚠️ 但**不要为了"顺便"去改没问题的节**。`;
registerPromptDefault("handoff:untouched-closing", HANDOFF_UNTOUCHED_CLOSING);
/**
* 记一条读快照（由 `memj_read` 在**成功读到正文后**调用）。
*
* ⚠️ **同会话重复读同一条不去重**（决策 66）——保留完整阅读痕迹。
* @param sessionId - 当前会话 id。
* @param info - 被读条目与它所属项目的信息。
*/
async function recordRead(sessionId, info) {
	await appendReadSnapshot(sessionId, {
		entryId: info.entryId,
		title: info.title,
		desc: info.desc,
		theme: [...info.theme],
		project: info.project,
		owner: {
			title: info.owner.title,
			desc: info.owner.desc
		},
		readAt: (/* @__PURE__ */ new Date()).toISOString(),
		consumedAt: null
	});
}
/**
* 取本会话**未消费**的快照（handoff 时的候选主题来源之一，§3.7.3 来源①）。
* @param sessionId - 当前会话 id。
* @returns 未消费的快照。
*/
async function pendingSnapshots(sessionId) {
	return readUnconsumedSnapshots(sessionId);
}
/**
* 把快照按**来源项目**分组，便于 LLM 逐条判断"这条确实和本次项目相关吗"。
*
* 🔴 这一步的语义筛选**必须由 LLM 做**（§3.7.2 表格）——
* **"读过" ≠ "用上了"**，顺手翻到的、探索性读的要排除。
* 本函数只做机械分组，不替模型判断相关性。
* @param snapshots - 未消费的快照。
* @returns 按 project 分组的映射。
*/
function groupBySourceProject(snapshots) {
	const map = /* @__PURE__ */ new Map();
	for (const s of snapshots) {
		const key = s.project === "" ? "(无项目归属)" : s.project;
		const list = map.get(key);
		if (list === void 0) map.set(key, [s]);
		else list.push(s);
	}
	return map;
}
/**
* 渲染快照清单为给 LLM 的文本（`memj_handoff` 的候选证据）。
*
* ⚠️ **不要在此处塞入提名与断链**（决策 42：人侧与 LLM 侧分开）。
* @param snapshots - 未消费的快照。
* @returns 模型可见文本；无快照时为空串。
*/
function renderSnapshotList(snapshots) {
	if (snapshots.length === 0) return "";
	const byProject = groupBySourceProject(snapshots);
	const parts = [`本会话读过 ${snapshots.length} 条**别的项目**的知识（按来源项目分组）：`];
	for (const [project, list] of byProject) {
		parts.push("");
		parts.push(`- 来源项目 \`${project}\`（${list[0]?.owner.title ?? ""}）`);
		for (const s of list) parts.push(`  · \`${s.entryId}\` **${s.title}** — ${s.desc}`);
	}
	parts.push("");
	parts.push(promptText("reads:snapshot-closing", SNAPSHOT_CLOSING));
	return parts.join("\n");
}
/**
* ⭐⭐ **把本文档各节的写作规范渲染成"集中一处"的一段**（决策 221）。
*
* 🔴 **它只在【读项目文档】时用、且只列"真的有规范块"的节** ——
*    没有规范块的节**不编造**（决策 207：不知道它该有什么规范）。
* @param specs - 各节的规范（`sectionSpecsOf()` 的产物）。
* @returns 模型可见文本；一节规范都没有时返回空串（**不输出空标题**）。
*/
function renderSectionSpecs(specs) {
	if (specs.length === 0) return "";
	const parts = [promptText("reads:section-spec-head", SECTION_SPEC_HEAD)];
	for (const s of specs) {
		const body = s.spec.split(/\r?\n/).map((l) => `    ${l}`).join("\n");
		parts.push(`· **${s.title}**：`);
		parts.push(body);
	}
	parts.push("");
	parts.push(promptText("reads:section-spec-closing", SECTION_SPEC_CLOSING));
	return parts.join("\n");
}
//#endregion
//#region src/narrative.ts
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
* 页眉的**尾标记**（用于读回时剥页眉）。
*
* 🔴 用一个固定的尾标记定位、**不按行数剥**——将来页眉加一行，
*    按行数剥就会把正文的第一行一起吃掉（静默截断）。
*/
const HEADER_END = "压缩改坏了可以用 git 退回。 -->";
/** 镜像文件的固定页眉（说明它是派生物 + 别手改）。 */
function header(projectId) {
	return [
		`<!-- 本文件由 dsh-memj 自动生成，是「${projectId}」交接文档的**正文镜像**（不含封面）。`,
		"     ⚠️ 手改会在下次 handoff 时被覆盖——要改知识，请改 projects/ 下的活跃文档。",
		`     ⭐ 它是 git 版本维护的对象：${HEADER_END}`,
		""
	].join("\n");
}
/**
* 读某项目的镜像正文（**剥掉页眉**，便于与活跃文档的叙事逐字比对）。
* @param projectId - 项目 id。
* @returns 正文；不存在时 `undefined`。
*/
async function readNarrativeMirror(projectId) {
	const text = await readTextIfExists(backupNarrativePath(projectId));
	if (text === void 0) return void 0;
	const idx = text.indexOf(HEADER_END);
	if (idx === -1) return text.trim();
	return text.slice(idx + 20).replace(/^\n+/, "").trim();
}
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
async function writeNarrativeMirror(projectId, narrative) {
	const body = narrative.trim();
	const existing = await readNarrativeMirror(projectId);
	if (existing !== void 0 && existing === body) return false;
	await writeTextAtomic(backupNarrativePath(projectId), `${header(projectId)}${body}\n`);
	return true;
}
//#endregion
//#region src/git.ts
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
/** 单次 git 调用的超时（毫秒）。🔴 宁可失败，也绝不卡住 handoff。 */
const GIT_TIMEOUT_MS = 1e4;
/** 生成身份的形态（`<主机名>` 让多台机器可区分）。 */
function defaultIdentity() {
	const host = hostname().replace(/[^A-Za-z0-9.-]/g, "-");
	return {
		name: `memj-handoff-${host}`,
		email: `memj-handoff@${host}`
	};
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
function runGit(cwd, args, options = {}) {
	const cfg = [];
	for (const [k, v] of options.config ?? []) cfg.push("-c", `${k}=${v}`);
	return new Promise((resolve) => {
		execFile("git", [...cfg, ...args], {
			cwd,
			timeout: options.timeoutMs ?? GIT_TIMEOUT_MS,
			windowsHide: true,
			maxBuffer: 8388608,
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: "0",
				GIT_ASKPASS: "echo",
				GCM_INTERACTIVE: "never",
				GIT_PAGER: "cat",
				GIT_EDITOR: "true",
				LC_ALL: "C"
			}
		}, (err, stdout, stderr) => {
			if (err !== null) {
				const e = err;
				const msg = e.killed === true ? `git 超时（>${options.timeoutMs ?? GIT_TIMEOUT_MS}ms）` : e.code === "ENOENT" ? "找不到 git 可执行文件" : stderr !== "" ? stderr.trim() : e.message;
				resolve({
					ok: false,
					stdout: String(stdout ?? ""),
					stderr: String(stderr ?? ""),
					error: msg
				});
				return;
			}
			resolve({
				ok: true,
				stdout: String(stdout ?? ""),
				stderr: String(stderr ?? ""),
				error: ""
			});
		});
	});
}
/**
* 探测 git 环境（**只读**，不建任何东西）。
*
* ⭐ 用在 `POST /settings`（或 `/backup/setup`）里：**环境不通就拒绝开启开关**——
*    否则开关会写着"已开启"却永不工作，**那是在说谎**（本项目一贯判据）。
* @returns 探测结果。
*/
async function probeGit() {
	const root = backupDir();
	await ensureDir(root);
	const v = await runGit(root, ["--version"], { timeoutMs: 5e3 });
	if (!v.ok) return {
		available: false,
		version: "",
		nestedRepoAt: "",
		error: v.error
	};
	const version = v.stdout.trim().replace(/^git version\s*/, "");
	const top = await runGit(root, ["rev-parse", "--show-toplevel"], { timeoutMs: 5e3 });
	let nestedRepoAt = "";
	if (top.ok) {
		const found = top.stdout.trim().replace(/\\/g, "/");
		const want = `${root.replace(/\\/g, "/")}/.git`;
		if (!top.stdout.trim().replace(/\\/g, "/").endsWith(root.replace(/\\/g, "/")) && found !== "") nestedRepoAt = top.stdout.trim();
		if (existsSync(want)) nestedRepoAt = "";
	}
	return {
		available: true,
		version,
		nestedRepoAt,
		error: ""
	};
}
/** 写 `.gitignore`（白名单）与 `.gitattributes`（行尾）。 */
async function writeRepoMetadata() {
	const root = backupDir();
	await writeTextAtomic(join(root, ".gitignore"), [
		"# dsh-memj 备份仓库：白名单（只维护正文镜像）",
		"*",
		"!.gitignore",
		"!.gitattributes",
		"!HANDOFF-*.md",
		""
	].join("\n"));
	await writeTextAtomic(join(root, ".gitattributes"), ["*.md text eol=lf", ""].join("\n"));
}
/**
* ⭐ **确保仓库存在并可用**（幂等；`POST /backup/setup` 的主实现）。
*
* 顺序：探测 git → 判嵌套 → `git init` → 写 `.gitignore`/`.gitattributes` → 决定身份。
* @returns 逐步骤的真实结果（前端要按它逐个点亮，**不许本地假进度**）。
*/
async function ensureRepo() {
	const steps = [];
	const root = backupDir();
	let identity = {
		name: "",
		email: "",
		source: "none"
	};
	const probe = await probeGit();
	steps.push({
		id: "probe",
		label: "检测 git 可执行文件",
		ok: probe.available,
		detail: probe.available ? `git ${probe.version}` : probe.error
	});
	if (!probe.available) return {
		ok: false,
		steps,
		repoPath: "",
		identity
	};
	const gitDir = join(root, ".git");
	const alreadyInit = existsSync(gitDir);
	if (!alreadyInit && probe.nestedRepoAt !== "") {
		steps.push({
			id: "nested",
			label: "检查仓库位置",
			ok: false,
			detail: `当前目录已在另一个 git 仓库内（${probe.nestedRepoAt}）——为避免把提交写进那个仓库，已停止。请先把该目录移出。`
		});
		return {
			ok: false,
			steps,
			repoPath: "",
			identity
		};
	}
	steps.push({
		id: "nested",
		label: "检查仓库位置",
		ok: true,
		detail: alreadyInit ? "仓库已存在" : "不在其它仓库内"
	});
	await ensureDir(root);
	if (!alreadyInit) {
		const init = await runGit(root, ["init", "--initial-branch=main"]);
		steps.push({
			id: "init",
			label: "初始化仓库",
			ok: init.ok,
			detail: init.ok ? "已创建 backup/.git" : init.error
		});
		if (!init.ok) {
			if (!(await runGit(root, ["init"])).ok) return {
				ok: false,
				steps,
				repoPath: "",
				identity
			};
			steps[steps.length - 1] = {
				...steps[steps.length - 1],
				ok: true,
				detail: "已创建 backup/.git（默认分支）"
			};
		}
	} else steps.push({
		id: "init",
		label: "初始化仓库",
		ok: true,
		detail: "已存在，无需重建"
	});
	try {
		await writeRepoMetadata();
		steps.push({
			id: "metadata",
			label: "写入忽略与行尾规则",
			ok: true,
			detail: ".gitignore（白名单）+ .gitattributes（LF）"
		});
	} catch (err) {
		steps.push({
			id: "metadata",
			label: "写入忽略与行尾规则",
			ok: false,
			detail: err instanceof Error ? err.message : String(err)
		});
		return {
			ok: false,
			steps,
			repoPath: root,
			identity
		};
	}
	await runGit(root, [
		"config",
		"--local",
		"core.autocrlf",
		"false"
	]);
	const localName = await runGit(root, [
		"config",
		"--local",
		"user.name"
	]);
	const localMail = await runGit(root, [
		"config",
		"--local",
		"user.email"
	]);
	if (localName.ok && localMail.ok && localName.stdout.trim() !== "" && localMail.stdout.trim() !== "") identity = {
		name: localName.stdout.trim(),
		email: localMail.stdout.trim(),
		source: "local"
	};
	else {
		const gName = await runGit(root, [
			"config",
			"--global",
			"user.name"
		]);
		const gMail = await runGit(root, [
			"config",
			"--global",
			"user.email"
		]);
		if (gName.ok && gMail.ok && gName.stdout.trim() !== "" && gMail.stdout.trim() !== "") identity = {
			name: gName.stdout.trim(),
			email: gMail.stdout.trim(),
			source: "global"
		};
		else identity = {
			...defaultIdentity(),
			source: "generated"
		};
		await runGit(root, [
			"config",
			"--local",
			"user.name",
			identity.name
		]);
		await runGit(root, [
			"config",
			"--local",
			"user.email",
			identity.email
		]);
	}
	steps.push({
		id: "identity",
		label: "决定提交者身份",
		ok: true,
		detail: identity.source === "local" ? `沿用仓库记录：${identity.name} <${identity.email}>` : identity.source === "global" ? `取自全局配置并记入仓库：${identity.name} <${identity.email}>` : `本次生成并记入仓库：${identity.name} <${identity.email}>`
	});
	return {
		ok: true,
		steps,
		repoPath: root,
		identity
	};
}
/**
* 读仓库现状（**只读**，供设置卡片显示）。
* @returns 现状（仓库不存在时 `initialized: false`）。
*/
async function readRepoState() {
	const root = backupDir();
	if (!existsSync(join(root, ".git"))) return {
		initialized: false,
		identity: {
			name: "",
			email: "",
			source: "none"
		},
		repoPath: root
	};
	const n = await runGit(root, [
		"config",
		"--local",
		"user.name"
	], { timeoutMs: 5e3 });
	const m = await runGit(root, [
		"config",
		"--local",
		"user.email"
	], { timeoutMs: 5e3 });
	const name = n.stdout.trim();
	const email = m.stdout.trim();
	return {
		initialized: true,
		identity: name !== "" && email !== "" ? {
			name,
			email,
			source: "local"
		} : {
			name: "",
			email: "",
			source: "none"
		},
		repoPath: root
	};
}
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
function normalizeCommitMessage(message) {
	const lines = message.replace(/\r\n/g, "\n").trimEnd().split("\n");
	const subject = (lines[0] ?? "").trim();
	const rest = lines.slice(1).join("\n").replace(/^\n+/, "").trimEnd();
	return rest === "" ? subject : `${subject}\n\n${rest}`;
}
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
async function commitAll(identity, message) {
	const root = backupDir();
	const cfg = [
		["user.name", identity.name],
		["user.email", identity.email],
		["commit.gpgsign", "false"],
		["core.autocrlf", "false"],
		["credential.helper", ""]
	];
	const add = await runGit(root, ["add", "-A"], { config: cfg });
	if (!add.ok) return {
		ok: false,
		committed: false,
		hash: "",
		error: `git add 失败：${add.error}`
	};
	const normalized = normalizeCommitMessage(message);
	const msgPath = join(root, ".git", "MEMJ_COMMIT_MSG");
	await writeTextAtomic(msgPath, `${normalized}\n`);
	const commit = await runGit(root, [
		"commit",
		"-F",
		msgPath
	], { config: cfg });
	if (commit.ok) return {
		ok: true,
		committed: true,
		hash: /\[[^\]]*?\s([0-9a-f]{7,})\]/i.exec(commit.stdout)?.[1] ?? "",
		error: ""
	};
	const combined = `${commit.stdout}\n${commit.stderr}`;
	if (/nothing to commit|no changes added to commit|nothing added to commit/i.test(combined)) return {
		ok: true,
		committed: false,
		hash: "",
		error: ""
	};
	return {
		ok: false,
		committed: false,
		hash: "",
		error: `git commit 失败：${commit.error}`
	};
}
/** 最近一次提交（供设置卡片显示）。 */
async function lastCommit() {
	const root = backupDir();
	if (!existsSync(join(root, ".git"))) return void 0;
	const r = await runGit(root, [
		"log",
		"-1",
		"--pretty=%h%x09%s"
	], { timeoutMs: 5e3 });
	if (!r.ok || r.stdout.trim() === "") return void 0;
	const [hash = "", subject = ""] = r.stdout.trim().split("	");
	return {
		hash,
		subject
	};
}
/** 连续失败次数（进程内）。 */
let gitFailStreak = 0;
/** 记一次成功（清零）。 */
function noteGitSuccess() {
	gitFailStreak = 0;
}
/**
* 记一次失败。
* @returns 当前连续失败次数。
*/
function noteGitFailure() {
	gitFailStreak += 1;
	return gitFailStreak;
}
/** 读当前连续失败次数（测试与回执判断用）。 */
function gitFailureStreak() {
	return gitFailStreak;
}
/** 重置计数（测试用）。 */
function resetGitFailureStreak() {
	gitFailStreak = 0;
}
//#endregion
//#region src/read.ts
/**
* 正文读取（方案 §4.2 `memj_read`）。
*
* ── ⭐ 核心：按文档大小分流 ────────────────────────────────────────────────
* ```
* 不给 section / full：
*   · size ≤ 3000 字符            ⇒ 返回全文
*   · size > 3000 且文档有 ##/### ⇒ 返回【节名清单】+ 开头预览 + 提示用 section
*   · 文档没有 ##/### 章节        ⇒ 返回全文，并 ⚠️ 警告"无法节选"
* 给 section：
*   · 命中   ⇒ 返回该节
*   · 不命中 ⇒ ⭐ 返回【节名清单】让模型重挑（**不报错、不回空**）
* 给 full: true：
*   · 无条件返回全文（逃生口）
* ```
*
* ── 🔴 为什么"节名清单"是关键 ──────────────────────────────────────────────
* 模型想按节读，但**封面里没有章节信息**——形成死循环：
* "想按节读 ⇒ 得知道节名 ⇒ 取节名只能先读全文 ⇒ 按节读就没意义了"。
* 让 `memj_read` 在匹配不上时**顺手把节名清单给它**，这个循环就断了，
* 且**不需要模型预先知道任何事**。清单本身只有几十行标题，比全文小两个数量级。
*
* @module dsh-memj/read
*/
/**
* 解析文档里的章节（`##` 与 `###` 都算，§4.2）。
*
* ⚠️ **`##` 也要能取到**——外部文档的层级不受我们控制。
* @param body - 正文。
* @returns 章节数组（按出现顺序）。
*/
function parseSections(body) {
	const lines = body.split(/\r?\n/);
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
		if (m !== null) {
			const hashes = m[1] ?? "";
			const title = m[2] ?? "";
			heads.push({
				title,
				level: hashes.length === 2 ? 2 : 3,
				line: i
			});
		}
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
/** 节名清单（去重，保持顺序）。 */
function sectionTitles(sections) {
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const s of sections) {
		if (seen.has(s.title)) continue;
		seen.add(s.title);
		out.push(s.title);
	}
	return out;
}
/**
* 把章节**按顶层节分组**（决策 134）。
*
* 🔴 **为什么需要分组**：节清单必须**分两级**返回——
*    · **顶层节**是**可写单位**（`memj_handoff` 的合并只按 `##` 对号入座）
*      ⇒ 混在一起列，模型会**挑一个写不进去的节名**；
*    · **子节**是"**分段读**"的单位——一个 28,750 字符的节，只有按子节读才拿得回来。
*    ⭐ 两级的角色不同，所以**不能只给一个扁平清单**。
* @param body - 正文。
* @param sections - 已解析的章节。
* @returns 分组数组（顶层节按出现顺序）。
*/
function groupSections(body, sections) {
	const lines = body.split(/\r?\n/);
	const out = [];
	for (const s of sections) {
		if (s.level === 2) {
			out.push({
				top: s,
				children: [],
				chars: lines.slice(s.startLine, s.endLine).join("\n").trimEnd().length
			});
			continue;
		}
		const last = out[out.length - 1];
		if (last !== void 0) last.children.push(s);
	}
	return out;
}
/**
* 取某一节**在全文行数组里的区间**（决策 134：供"节内分页"定位）。
* @param sections - 已解析的章节。
* @param title - 节名（**精确匹配**优先，否则子串匹配）。
* @returns 命中节的区间；找不到返回 `undefined`。
*/
function findSectionRange(sections, title) {
	const exact = sections.find((s) => s.title === title);
	if (exact !== void 0) return exact;
	const key = title.trim().toLowerCase();
	return sections.find((s) => s.title.toLowerCase().includes(key));
}
/**
* 按 `section` 取节（§4.2 的匹配规则）。
*
* 规则：**大小写不敏感、去首尾空白、允许子串匹配**（`"四阶段"` 能命中 `"四阶段机制"`）；
* 多个命中 ⇒ **都返回**。
*
* 🔴🔴 **嵌套要剔重**（决策 134 / 2026-09-20）：修了 `parseSections` 的 `endLine` 之后，
*    `##` 节**包含**它下面的 `###` 子节 ⇒ 若两者都命中，**同一段内容会被返回两遍**。
*    ⚠️ 实测触发场景：请求 `"当前进度"` 时，
*    `## 当前进度` 与 `### 第三十八批（…回执每次报「当前进度」体量）`
*    **两个都命中**（后者是子串巧合）⇒ 不去重就会把该子节输出两遍。
*    ⭐ 判据：**命中项若被另一个命中项"区间包含"，就丢弃它**（保留外层那个，
*       因为它才是调用方真正要的整节）。
* @param body - 正文。
* @param sections - 已解析的章节。
* @param requested - 请求的节名。
* @returns 命中的节文本（拼接）；无命中返回空串。
*/
function extractSection(body, sections, requested) {
	const key = requested.trim().toLowerCase();
	if (key === "") return {
		text: "",
		matched: false,
		matchedTitles: []
	};
	const raw = sections.filter((s) => s.title.toLowerCase().includes(key));
	if (raw.length === 0) return {
		text: "",
		matched: false,
		matchedTitles: []
	};
	const hits = raw.filter((h) => !raw.some((o) => o !== h && o.startLine <= h.startLine && o.endLine >= h.endLine && !(o.startLine === h.startLine && o.endLine === h.endLine)));
	const dedup = [];
	for (const h of hits) if (!dedup.some((d) => d.startLine === h.startLine && d.endLine === h.endLine)) dedup.push(h);
	const lines = body.split(/\r?\n/);
	const parts = [];
	for (const h of dedup) parts.push(lines.slice(h.startLine, h.endLine).join("\n").trimEnd());
	return {
		text: parts.join("\n\n"),
		matched: true,
		matchedTitles: dedup.map((h) => h.title)
	};
}
/**
* 取正文开头的预览（超阈时给模型一点上下文，便于判断要不要展开）。
* @param body - 正文。
* @param maxChars - 预览的字符上限。
* @returns 预览文本。
*/
function preview(body, maxChars) {
	const chars = [...body];
	if (chars.length <= maxChars) return body;
	return `${chars.slice(0, maxChars).join("")}…`;
}
/**
* 决定本次读取返回什么（§4.2 的全部分流规则）。
*
* @param body - 全文正文。
* @param opts - 读取参数。
* @returns 决策结果。
*/
function decideRead(body, opts) {
	const size = charCount(body);
	const sections = parseSections(body);
	const titles = sectionTitles(sections);
	const sectionGroups = groupSections(body, sections).map((g) => ({
		title: g.top.title,
		chars: g.chars,
		children: g.children.map((c) => ({
			title: c.title,
			chars: body.split(/\r?\n/).slice(c.startLine, c.endLine).join("\n").trimEnd().length
		}))
	}));
	const linesAll = body.split(/\r?\n/);
	if (opts.offset !== void 0 || opts.limit !== void 0) {
		const sec = opts.section !== void 0 && opts.section.trim() !== "" ? findSectionRange(sections, opts.section) : void 0;
		const base = sec === void 0 ? 0 : sec.startLine;
		const total = sec === void 0 ? linesAll.length : sec.endLine - sec.startLine;
		const start = base + Math.max(0, (opts.offset ?? 1) - 1);
		const end = opts.limit === void 0 ? sec === void 0 ? linesAll.length : sec.endLine : Math.min(start + Math.max(0, opts.limit), sec === void 0 ? linesAll.length : sec.endLine);
		const slice = linesAll.slice(start, end);
		const where = sec === void 0 ? `全文第 ${start + 1}–${Math.min(end, linesAll.length)} 行（共 ${linesAll.length} 行）` : `节「${sec.title}」内第 ${start - base + 1}–${Math.min(end, sec.endLine) - base} 行（本节共 ${total} 行）`;
		return {
			content: slice.join("\n"),
			mode: "lines",
			availableSections: titles,
			sectionGroups,
			sectionRequested: opts.section ?? "",
			sectionMatched: sec !== void 0,
			size,
			notice: `已按行区间返回：${where}。` + (sec === void 0 && opts.section !== void 0 && opts.section.trim() !== "" ? `\n⚠️ 未找到名为「${opts.section}」的节 ⇒ **按全文行号**返回，请核对节名。` : "")
		};
	}
	if (opts.section !== void 0 && opts.section.trim() !== "") {
		const hit = extractSection(body, sections, opts.section);
		if (hit.matched) return {
			content: hit.text,
			mode: "section",
			availableSections: titles,
			sectionGroups,
			sectionRequested: opts.section,
			sectionMatched: true,
			size,
			notice: `已返回节：${hit.matchedTitles.join("、")}（${hit.text.length} 字符）。` + (hit.text.length > opts.maxChars ? `\n⚠️ 该节 **${hit.text.length} 字符**，超过直出阈值 ${opts.maxChars}。若只需要其中一部分，可配合 \`offset\`/\`limit\`（**按节内行号**）分段读回。` : "") + "需要整篇时传 full: true。"
		};
		return {
			content: "",
			mode: "section-miss",
			availableSections: titles,
			sectionGroups,
			sectionRequested: opts.section,
			sectionMatched: false,
			size,
			notice: titles.length > 0 ? `未找到名为「${opts.section}」的节。本文可选的节名见 availableSections，请从中重挑一个再调。` : "未找到该节，且本文没有 ## / ### 章节，无法按节读取。"
		};
	}
	if (opts.full === true) return {
		content: body,
		mode: "full",
		availableSections: titles,
		sectionGroups,
		sectionRequested: "",
		sectionMatched: false,
		size,
		notice: ""
	};
	if (size <= opts.maxChars) return {
		content: body,
		mode: "full",
		availableSections: titles,
		sectionGroups,
		sectionRequested: "",
		sectionMatched: false,
		size,
		notice: ""
	};
	if (titles.length === 0) return {
		content: body,
		mode: "full",
		availableSections: [],
		sectionGroups: [],
		sectionRequested: "",
		sectionMatched: false,
		size,
		notice: `⚠️ 本文 ${size} 字符且没有 ## / ### 章节，**无法节选**，已返回全文。`
	};
	return {
		content: "",
		mode: "section-list",
		availableSections: titles,
		sectionGroups,
		sectionRequested: "",
		sectionMatched: false,
		size,
		notice: `本文 ${size} 字符，超过直出阈值 ${opts.maxChars}，未整篇返回。请用 section 指定要哪一节（见 availableSections）；确实要通读整篇时传 full: true。`
	};
}
//#endregion
//#region src/search.ts
/**
* 封面检索（方案 §3.5 / §4.2 `memj_search`）。
*
* 🔴 **本期不做停词表、不做 2-gram 切分、不加 IDF 加权**（决策 37）。
* 取而代之的是**两条约定**：
*
*  1. **查询词由 LLM 提炼**——`query` 给的是**有语义的词**，不是用户原句。
*     例：用户说"注入缓存那个机制是怎么回事" ⇒ 传 `["注入缓存", "缓存", "注入"]`。
*  2. **整词完整命中才算分**——只做子串包含（`text.includes(term)`），**不做二次切分**。
*     ⇒ `入缓` 这种无意义字串**永远不可能被凭空造出来**，因为**没有自动切分**。
*
* 多词之间取 **OR**（命中任一即入选），但**得分累加**——命中词多的排前面。
*
* @module dsh-memj/search
*/
/**
* 命中位置的分值（§3.5）。
*
* ⚠️ **具体数值是占位值**（§12 第 7 条：用户指示"先记为待议"）。
* 它表达的是**次序**：标题 > desc/tags > 正文。
* 要调整只改这里，逻辑不受影响。
*/
const HIT_WEIGHTS = {
	title: 5,
	desc: 3,
	tags: 3,
	body: 1
};
/**
* 把查询输入规范成检索词数组。
*
* 同时接受字符串（按空白/逗号切）与数组（润色后直接用）。
* @param query - 原始查询。
* @returns 去空、去重（保持顺序）的检索词。
*/
function normalizeQuery(query) {
	if (query === void 0) return [];
	const raw = typeof query === "string" ? query.split(/[\s,，、]+/) : [...query];
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const term of raw) {
		const t = term.trim();
		if (t === "" || seen.has(t)) continue;
		seen.add(t);
		out.push(t);
	}
	return out;
}
/**
* 算一条封面在给定检索词下的得分（§3.5）。
*
* 只做**子串包含**判断——不切分、不改写查询词。
* @param cover - 封面。
* @param terms - 检索词。
* @param title - 标题（⭐ 来自封面，决策 98；调用方传 `cover.title`）。
* @param body - 正文（不带 query 的检索不会走到这里）。
* @returns 得分与命中的词。
*/
function scoreCover(cover, terms, title, body) {
	let score = 0;
	const matched = [];
	const hay = {
		title: title.toLowerCase(),
		desc: cover.desc.toLowerCase(),
		tags: cover.tags.join(" ").toLowerCase(),
		body: body.toLowerCase()
	};
	for (const rawTerm of terms) {
		const term = rawTerm.toLowerCase();
		if (term === "") continue;
		let hit = false;
		if (hay.title.includes(term)) {
			score += HIT_WEIGHTS.title;
			hit = true;
		}
		if (hay.desc.includes(term)) {
			score += HIT_WEIGHTS.desc;
			hit = true;
		}
		if (hay.tags.includes(term)) {
			score += HIT_WEIGHTS.tags;
			hit = true;
		}
		if (hay.body.includes(term)) {
			score += HIT_WEIGHTS.body;
			hit = true;
		}
		if (hit) matched.push(rawTerm);
	}
	return {
		score,
		matched
	};
}
/**
* 按项目 / 主题筛封面（§4.2）。
*
* ⛔ **没有 `global` 参数**（决策 36）——全局知识不参与"按上下文筛"。
* @param covers - 全部封面。
* @param project - 项目 id（可选）。
* @param theme - 主题 id（可选）。
* @returns 过滤后的封面。
*/
function filterByContext(covers, project, theme) {
	let out = [...covers];
	if (project !== void 0 && project.trim() !== "") {
		const p = project.trim();
		out = out.filter((c) => c.project === p);
	}
	if (theme !== void 0 && theme.trim() !== "") {
		const t = theme.trim();
		out = out.filter((c) => c.theme.includes(t));
	}
	return out;
}
/**
* 算一张封面对应正文的字符数（§4.2 的 `size`）。
*
* ⚠️ 只有在**带 `query`**（本来就要读正文做匹配）时才调用——
* 不带 query 时**不为了 size 去读正文**。
* @param body - 正文。
* @returns 字符数（**不是字节**）。
*/
function bodySize(body) {
	return charCount(body);
}
/**
* 按得分排序（稳定：得分相同则 desc 更短者在前，便于模型快速判断）。
* @param hits - 命中列表。
* @returns 新数组。
*/
function sortHits(hits) {
	return [...hits].sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		if (a.cover.desc.length !== b.cover.desc.length) return a.cover.desc.length - b.cover.desc.length;
		return a.cover.id.localeCompare(b.cover.id);
	});
}
/**
* 在**项目与主题的语境**里按检索词筛（`memj_info` 的 `query` 用途，§4.2）。
*
* 匹配范围 = **id + 名称 + desc**（**不是知识正文**），规则与 `memj_search` 一致。
* @param items - 语境条目。
* @param terms - 检索词。
* @returns 命中的条目（按得分降序）；**无命中就返回空**（决策 53，不兜底成全量）。
*/
function filterContextByTerms(items, terms) {
	if (terms.length === 0) return [...items];
	const scored = items.map((item) => {
		const hay = `${item.id} ${item.name} ${item.desc}`.toLowerCase();
		let score = 0;
		for (const t of terms) {
			const term = t.toLowerCase();
			if (term !== "" && hay.includes(term)) score += 1;
		}
		return {
			item,
			score
		};
	}).filter((x) => x.score > 0);
	scored.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
	return scored.map((x) => x.item);
}
//#endregion
export { readPromptHistory as $, ACTIVE_BAND_DEFAULT as $t, HANDOFF_UNTOUCHED_SECTIONS as A, fixCoverBlock as At, PROMPT_SPECS as B, readSnapshots as Bt, probeGit as C, byUpdatedDesc as Ct, readNarrativeMirror as D, deleteThemeDoc as Dt, runGit as E, deleteProjectDoc as Et, pendingSnapshots as F, loadProjectDoc as Ft, hasOverride as G, scanLibrary as Gt, clearPromptHistory as H, rebuildDerivedLayers as Ht, recordRead as I, loadThemeFrontmatter as It, overriddenKeys as J, writeEntryDoc as Jt, listPromptHistory as K, store_exports as Kt, renderSectionSpecs as L, projectIdFromFile as Lt, SECTION_SPEC_HEAD as M, isChatCover as Mt, SNAPSHOT_CLOSING as N, isHistoryCover as Nt, writeNarrativeMirror as O, ensureLibraryDirs as Ot, groupBySourceProject as P, loadEntryDoc as Pt, promptText as Q, writeThemeDoc as Qt, renderSnapshotList as R, readDocReads as Rt, noteGitSuccess as S, approveNomination as St, resetGitFailureStreak as T, deleteEntryFile as Tt, emptyOverrides as U, rejectNomination as Ut, checkNoDshVariables as V, readUnconsumedSnapshots as Vt, fillSlots as W, removeNomination as Wt, promptCurrent as X, writeNominations as Xt, overrideUpdatedAt as Y, writeGlobalDoc as Yt, promptDefault as Z, writeProjectDoc as Zt, ensureRepo as _, renderOutputText as _t, normalizeQuery as a, deriveDecisionKeyRef as an, resetPromptOverride as at, normalizeCommitMessage as b, appendDocRead as bt, decideRead as c, needMinOf as cn, savePromptOverrides as ct, groupSections as d, specOf as dt, ACTIVE_MAX_INJECTIONS_DEFAULT as en, refreshPromptCache as et, parseSections as f, validatePrompt as ft, defaultIdentity as g, groupOrder as gt, commitAll as h, catalogOf as ht, filterContextByTerms as i, decisionProvidersOf as in, resetPromptCache as it, SECTION_SPEC_CLOSING as j, fixExternalRef as jt, HANDOFF_UNTOUCHED_CLOSING as k, findDocRead as kt, extractSection as l, resolveDecisionPick as ln, setPromptCacheForTest as lt, sectionTitles as m, PROMPT_GROUPS as mt, bodySize as n, DEFAULT_CONFIG as nn, registerPromptDefault as nt, scoreCover as o, itemMinOf as on, restorePromptHistory as ot, preview as p, PROMPT_CATALOG as pt, loadPromptOverrides as q, syncEntryFrontmatter as qt, filterByContext as r, activeDecisionOf as rn, registeredPromptKeys as rt, sortHits as s, maxInjectionsPerTurn as sn, savePromptOverride as st, HIT_WEIGHTS as t, Config as tn, refreshPromptCacheSync as tt, findSectionRange as u, scoreDecisionOf as un, slotNames as ut, gitFailureStreak as v, renderParametersText as vt, readRepoState as w, consumeSnapshots as wt, noteGitFailure as x, appendReadSnapshot as xt, lastCommit as y, addNomination as yt, PROMPT_OVERRIDES_VERSION as z, readNominations as zt };
