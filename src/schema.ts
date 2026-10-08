/**
 * 数据结构（方案 §3.2 / §3.3 / §3.8）。
 *
 * ── 核心模型：封面 + 正文分离 ─────────────────────────────────────────────
 * **封面**（cover）只写在项目级 handoff 文档底部的「沉淀知识」节里，
 * **正文**（body）独立落盘成文档。封面按 project → theme → global 三层聚合。
 *
 * ── 🔴 归属模型：废除 `scope`，三个正交字段 ────────────────────────────────
 * 旧写法的 `scope: project|theme:<id>|global` 是**互斥三选一**；
 * 新模型是 `project`（单值可空）/ `theme`（**数组**）/ `global`（布尔）。
 * 一条知识可以**同时**属于多个层——推进是**累加，不是搬家**（§2.4 铁律 3）。
 *
 * @module dsh-memj/schema
 */

/**
 * ⭐⭐⭐ **知识类型（`kind`）的【唯一定义源】**（2026-10-05 收敛）。
 *
 * ── 为什么必须是**受控词表**（决策 81）────────────────────────────────────
 * 若允许自由取值，LLM 会自行发明命名（`bug`/`pitfall`/`gotcha`/`陷阱` 各写各的），
 * 分类就失去聚合能力。这正是 ETH Zurich 实测到的失效模式 —— 没有受控词表时，
 * LLM 会自己发明 schema 与标签格式，使知识层反而拖累 agent 表现。
 * `tags` 继续承担**自由补充**的角色，两者分工不同。
 *
 * ── 🔴 为什么要收敛成"一张带含义的表"，而不是一个字符串数组 ──────────────────
 * 收敛之前，这套词表在**七个地方各写了一遍**：
 * `schema.ts` 的数组 / `tools.ts` 的 **5 处 `enum`** / `app.js` 的**中文标签数组** /
 * 两处 placeholder / 两处提示词文案。
 * ⇒ ⭐ **一处定义、六处抄写** ⇒ 想加一个类型要同时改七处，**漏一处就是"某处不认它"**
 *   （最典型：工具 schema 不认 ⇒ 模型填了被拒，而 UI 里却能选 —— **两边打架**）。
 *
 * ⇒ 收敛成**一张表**：`id`（机器用）+ `label`（显示）+ `when`（什么时候用）。
 *   `ENTRY_KINDS` 由它派生 ⇒ **不存在"数组与含义不一致"的可能**。
 *
 * ⚠️ **与 `theme` 正交、不是二选一**：`theme` 回答"这条属于谁"（横向聚合、需证据），
 * `kind` 回答"这条本身是什么形态"（纵向属性、无门槛）。
 *
 * ⭐⭐ **`history` 是特殊的一类**（决策 136 / 223）：它**不是知识**，而是
 *    **被取代的正文的归档**（原文照收、原处留指针）。
 *    ⇒ 它**不参与检索**（`scanLibrary` 默认排除），但**能按 id 读回**。
 *
 * 🔴🔴 **2026-10-12（决策 223）：它不再"不给模型选"了** —— 载归档的机制改了：
 *    · **以前**：工具**自动**截断「当前进度」并落一条 `history` ⇒ 所以它 `reserved: true`
 *      （"工具生成的，别让模型手工造一条不进检索的条目"）。
 *    · **现在**：归档**由模型按各节的书写规范去做**（用户裁定：工具读不懂自然语言规范，
 *      所以它**不再执行归档**，只**报数 + 点名**）。
 *      ⇒ `history` **必须开放给模型**，否则模型归档下来的东西只能填别的类型 ⇒
 *        **那些归档会涌进检索**（用户原话见 `ENTRY_KIND_DEFS` 里那条注释）。
 *    ⚠️ **"让人手工造一条不进检索的条目"这个顾虑仍然成立**，只是它的防线换了：
 *      从**结构上禁止**（`reserved`）换成**语义上讲清**（`when`/`guide` 明写"它是留档、不参与检索"）。
 *
 * ── 第二步（未做）会把它变成**运行期可配**──────────────────────────────────
 * 用户已裁定：设置页可配置知识类型，**内置的不可删改**、可另增删改。
 * 那一步会把"读词表"从**编译期常量**改成**运行期读取**。
 * ⚠️ **本表届时降级为"内置默认值"** —— 仍不可删，但不再是被引用的唯一来源。
 */

/**
 * 表里的一项：id + 显示名 + "什么时候用它" + "怎么写它"。
 *
 * 🔴🔴 **两个字段的分工（2026-10-05 用户裁定「丙」，决策 217）—— 别再混**：
 *   · `when`  = **什么内容该归到这一类**（判据，供模型**选**类型）
 *   · `guide` = **这一类该写成什么形状**（骨架/规范，供模型**写**内容）
 *
 * ⚠️⚠️ **历史包袱（本次才拆干净）**：这 4 条内置的 `when` 原先装的是**骨架**
 *   （`现象 → 根因 → 正确做法` 之类）—— 那是从更早的设计原样继承的，
 *   而字段名一直叫"什么时候用"。⇒ 于是**字段名在撒谎**，且与后加的 `guide` 语义重叠。
 *   ✅ 本次把骨架**搬进 `guide`**、给 `when` 补上**真正的判据**。
 */
export interface EntryKindDef {
  /** 机器用的 id（小写英文；**它就是写进封面 `kind:` 的那个值**）。 */
  id: string
  /** 给人看的短名（UI 下拉、报错文案里用）。 */
  label: string
  /** ⭐ **什么内容该归到这一类**（判据）—— 会进提示词。 */
  when: string
  /**
   * ⭐ **这一类该怎么写**（骨架/规范，可多行）—— 会进提示词。
   * ⚠️ 可以为空；但**内置项都已经写上了**（含 `history` —— 决策 223 起它也给模型用，
   *    所以它的"该怎么写"必须讲清楚，见那条的注释）。
   */
  guide: string
  /**
   * 🔴 **保留项**：不可删、不可改名、**不作为模型的可选项**。
   *
   * ⚠️ **决策 223（2026-10-12）起，内置类型里【没有】保留项了** ——
   *    `history` 已开放给模型（归档改成由模型按规范做）。
   * ⭐ 本字段**保留**（机制仍在、用户自定义的类型将来可能用到），
   *    但当前 `currentReservedKinds()` **返回空数组**，相关防线处于"空转"状态
   *    （`kinds.ts` 的"保留标记不可摘"因此没有作用对象）。
   * @default false
   */
  reserved?: boolean
}

/**
 * ⭐⭐ **内置知识类型表**（顺序即 UI 下拉顺序）。
 *
 * ⚠️ **改动这一张表就够** —— 工具 schema、UI 下拉、报错文案、提示词都从这里取。
 * 🔴 **2026-10-05（决策 217）**：`when` 全部改写成**真的"什么时候用"**，
 *   原先装在这里的骨架文字**搬进了 `guide`**（见 `EntryKindDef` 的说明）。
 */
export const ENTRY_KIND_DEFS: readonly EntryKindDef[] = [
  {
    id: 'fact',
    label: 'fact（事实 / 接口）',
    when: '陈述一个**可核实的结论**、接口形态、路径或数字',
    guide: '是什么 + 出处/依据',
  },
  {
    id: 'trap',
    label: 'trap（陷阱 / 纠错）',
    when: '**出过错 / 反直觉 / 会让人白费功夫**的那类事',
    guide: '现象 → 根因 → 正确做法',
  },
  {
    id: 'howto',
    label: 'howto（流程步骤）',
    when: '一串**有先后顺序、要照着做**的步骤',
    guide: '步骤清单（编号，每步一句）',
  },
  {
    id: 'decision',
    label: 'decision（决策 + 理由）',
    when: '在**几个方案里做过的一个选择**',
    guide: '结论 + 理由 + 边界',
  },
  {
    id: 'history',
    label: 'history（归档·不参与检索）',
    // ⭐⭐⭐ 决策 223（2026-10-12 用户裁定）：**归档从"工具自动做"改成"模型按规范做"**
    //    ⇒ `history` 必须**开放给模型选**，所以它**不再是保留项**。
    //
    // 🔴 **它的特殊性没有消失，只是换了承载方式**：
    //    以前靠 `reserved`（"不给模型选"）来保证"模型不会手工造一条不进检索的条目"；
    //    现在靠 **when / guide 把语义讲清楚** ——
    //    ⭐ **不进检索不是缺陷，而是它的定义**（"留档"与"知识"是两种东西）。
    // ⚠️ **用户明确裁定**（原话）：*"他就把内容归档为 history 知识，而 history 知识本身
    //    是不参与检索的。就只有 history 知识不参与检索。如果归档为其他的话，
    //    那应该正常参与检索。"* ⇒ 所以**不新增类型**，直接用它。
    when: '把**已被取代 / 已过时**的正文**原样收存**（如某一节里较早的批次小节），原处换成指针',
    guide:
      '原文**照收、一字不改**（归档的意义就是留原话）+ 一行批次主题；' +
      '⭐ 本条**不参与检索**（`memj_search` / 热知识注入都会跳过它）——它是留档，不是知识；' +
      '⚠️ 若把它写成 `fact`/`trap`/`howto`/`decision`，那些条目就会**正常参与检索**。',
    // ⭐ `builtin: true` 仍然保留 —— 它**不可删、不可改名**（存量文档里已有这种条目）。
  },
]

/** `kind` 的全部取值（含保留项）。 */
export const ENTRY_KINDS: readonly string[] = ENTRY_KIND_DEFS.map((d) => d.id)

/**
 * ⭐⭐ **可以给模型选的**取值（**排除保留项**）—— 工具 schema 的 `enum` 用它。
 *
 * 🔴 **为什么与 `ENTRY_KINDS` 分开**：两者**不一定相等** ——
 *    保留项（`reserved: true`）不进这里，因为它们"不给模型选"。
 *
 * ⚠️ **决策 223（2026-10-12）起，内置类型里没有保留项了** ⇒ 当前两者**恰好相等**
 *    （`history` 已开放，见 `ENTRY_KIND_DEFS` 里那条的说明）。
 * ⭐ 但**这个区分必须留着**：用户自定义的类型将来可能设保留项，
 *    而且"过滤"这个动作本身就是那条语义的实现。
 */
export const SELECTABLE_ENTRY_KINDS: readonly string[] = ENTRY_KIND_DEFS.filter(
  (d) => d.reserved !== true,
).map((d) => d.id)

/** `kind` 的取值类型（⚠️ 收敛后仍是**编译期字面量联合**；第二步开放配置时会放宽成 `string`）。 */
export type EntryKind = (typeof ENTRY_KIND_DEFS)[number]['id']

/**
 * ⭐⭐⭐ **【当前生效】的 `kind` 词表** —— 运行期可配（决策 215）。
 *
 * ── 🔴 为什么需要一个"模块级当前值" ────────────────────────────────────────
 * `kind` 的合法性**到处都要判**（实测 **18 处**：`api.ts` / `edit.ts` / `handoff.ts` /
 * `parse.ts` / `store.ts` / `tools.ts`），而其中 `parse.ts` / `store.ts` 是
 * **纯函数、不读配置**。
 * ⇒ 把词表做成**参数** ⇒ 18 处签名全改、纯函数被污染；
 *   做成**进程内当前值** ⇒ 签名一字不动、行为可配。
 * ⭐ 判据：**"到处都要用的东西"值得一个进程内当前值**，代价是它的**刷新时机必须明确**。
 *
 * ── ⚠️ 边界 ───────────────────────────────────────────────────────────────
 * · 它是**进程内状态** ⇒ 改了 `kinds.md` **必须有人刷新它**
 *   （本项目的刷新点：插件 `apply()` 读一次 + 每次保存成功后立即刷新）；
 * · 🔴 它决定"合法性" ⇒ **删掉一个类型会让存量封面变成非法值** ——
 *   这正是"有引用不许删"（`deleteKindBlockReason`）要挡住的事。
 */
/**
 * 🔴🔴 **进程内当前值 = 【完整定义】，不只是 id**（决策 217 从"只存 id"扩成这个）。
 *
 * ⚠️ **为什么必须存完整定义**：`when`/`guide` 现在要**每轮现拼进提示词**，
 *    而拼装点（工具描述 getter、`context()` 的 `text()`）**必须是同步的**；
 *    `loadKinds()`（读 `kinds.md`）是 **async** ⇒ 只能靠这个同步缓存。
 * ⭐ 判据：**"同步的渲染点"与"异步的读取源"之间，必须有一个同步快照。**
 *
 * ⚠️ 形状**刻意与 `KindDef` 结构兼容**（只取渲染用得上的四个字段）——
 *    这样 `kinds.ts` 可以直接把 `KindDef[]` 传进来，**不必反向 import**（避免循环依赖）。
 */
export interface LiveKindDef {
  id: string
  when: string
  guide: string
  /** `label` 不参与提示词渲染，但留着便于调试与将来的展示点。 */
  label: string
  reserved: boolean
}

let currentDefs: readonly LiveKindDef[] = ENTRY_KIND_DEFS.map((d) => ({
  id: d.id,
  when: d.when,
  guide: d.guide,
  label: d.label,
  reserved: d.reserved === true,
}))

/**
 * ⭐ **设置当前生效的类型表**（插件启动与"保存类型表"两处调用）。
 * @param defs - 完整定义（**含保留项** —— 读侧要认 `history`）。
 */
export function setCurrentKindDefs(defs: readonly LiveKindDef[]): void {
  if (defs.length > 0) currentDefs = defs.map((d) => ({ ...d }))
}

/**
 * ⭐ **取当前生效的完整定义**（渲染点用它现拼）。
 * @returns 完整定义列表。
 */
export function currentKindDefsOf(): readonly LiveKindDef[] {
  return currentDefs
}

/**
 * ⭐ **取当前生效的词表**（只要 id）。
 * @returns 全部合法 id。
 */
export function currentKindsOf(): readonly string[] {
  return currentDefs.map((d) => d.id)
}

/**
 * ⭐⭐ **当前生效的"保留项"id**（不给模型选的那些）。
 *
 * 🔴 **它也读当前值**（不再读编译期表）：`reserved` 是**表里的一个字段**，
 *   与"有哪些类型"一样来自同一份文件 ⇒ 从同一个当前值派生才可能一致。
 * @returns 保留项 id。
 */
export function currentReservedKinds(): readonly string[] {
  return currentDefs.filter((d) => d.reserved).map((d) => d.id)
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
export function isEntryKind(value: unknown): value is EntryKind {
  return typeof value === 'string' && currentDefs.some((d) => d.id === value)
}

/**
 * ⭐ **取一种 kind 的"什么时候用它"**（提示词与报错文案共用一处）。
 * @param id - kind 的 id。
 * @returns 那句话；id 不认识 ⇒ 空串。
 */
export function entryKindWhen(id: string): string {
  return currentDefs.find((d) => d.id === id)?.when ?? ''
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
export function selectableKindList(sep = ' / '): string {
  return currentDefs.filter((d) => !d.reserved).map((d) => d.id).join(sep)
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
export function kindsInline(sep = '｜'): string {
  return currentDefs
    .filter((d) => !d.reserved)
    .map((d) => `${d.id} ${d.when}`)
    .join(sep)
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
export const KIND_CATALOG_MARKER = '<!--memj:kind-catalog-->'
/** 可选值清单的标记（给工具描述用，同上的理由）。 */
export const KIND_LIST_MARKER = '<!--memj:kind-list-->'

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
export function fillKindMarkers(text: string): string {
  return text
    .replaceAll(KIND_CATALOG_MARKER, kindCatalogText())
    .replaceAll(KIND_LIST_MARKER, selectableKindList(' / '))
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
export function kindCatalogText(): string {
  const rows = currentDefs
    .filter((d) => !d.reserved)
    .map((d) => `| \`${d.id}\` | ${d.when} | ${d.guide === '' ? '（自由发挥）' : d.guide} |`)
  return [
    '| `kind` | 什么时候用（什么内容归这一类） | 怎么写 |',
    '|---|---|---|',
    ...rows,
    '| （留空） | 未分类 | 自由发挥 |',
    '',
    '🔴 **`history` 是"留档"不是"知识"**：`memj_search` 与热知识注入都会**跳过**它',
    '（这是它的定义，不是缺陷）⇒ 只在**把一个已经被取代的正文原样收存**时用它，',
    '并在原处留指针。⚠️ 反之，**正常情况下不要用它** —— 写成别的类型才会参与检索。',
  ].join('\n')
}

/**
 * 一张封面（§3.2）。
 *
 * 它就是 handoff 文档里 `<!-- memj:entry ... -->` 围栏内那段 YAML 的解析结果。
 */
export interface Cover {
  /** UUID，库内唯一（由工具生成，不给 LLM）。 */
  id: string
  /** 归属项目 id；空串 = 无项目归属（纯 global 知识）。 */
  project: string
  /** 命中的主题 id 列表；空数组 = 无主题归属。 */
  theme: string[]
  /** 是否跨主题共用。注意：为 true 时**只登记提名**，待人批准。 */
  global: boolean
  /**
   * ⭐ 形态分类（决策 81）。**可选**——空串 = 未分类。
   * 与 `theme` 正交；决定正文用哪种骨架（建议而非强制）。
   */
  kind: EntryKind | ''
  /** 标签，至少 1 个。 */
  tags: string[]
  /**
   * ⭐ **标题**（决策 98，2026-09-19 新增）。**必填**，2–48 字符。
   *
   * 🔴 **它是标题的权威来源**——以前标题是"从正文现算"的
   * （内部条目取首个 `###`、外部引用取首个 `#`），那要求**每个消费方都读正文**：
   * `memj_search` 尤其要为**每一个候选**打开文件。
   *
   * ⚠️ **正文里可以保留同名标题**（用户明确要求，**不要求删**）——
   * 两份写成同一句最省事，但技术上互不依赖。
   */
  title: string
  /** 检索键（**不是摘要**），必填，≤200 字符。 */
  desc: string
  /** 正文位置：内部条目写库内相对路径；外部引用写绝对路径。 */
  ref: string
  /** 仅外部引用为 true。 */
  ext: boolean
  /**
   * ⭐ **创建时间**（决策 119，2026-09-19 新增）。ISO 8601；空串 = 未知。
   *
   * 🔴 **为什么要有**：在此之前**三者都没有任何时间字段**，想知道"这条什么时候
   * 加的"只能去看文件系统时间——而那个**会被重写刷新**（原子写 = 换文件，
   * `CreationTime` 跟着变），**拷库/同步更会直接失真**。
   *
   * ⚠️ **不可变**：一旦有值，**后续任何更新都不许改它**。
   * @see updatedAt
   */
  createdAt: string
  /**
   * ⭐ **最后更新时间**（决策 119）。ISO 8601；空串 = 未知。
   *
   * 🔴 **只在"内容真的变了"时刷新**——**派生层重建（rebuild）不算更新**
   * （它只是重算投影，知识本身没动）。
   */
  updatedAt: string
  /**
   * ⭐⭐ **归档时间**（决策 133）。ISO 8601；**空串 = 未归档（活跃）**。
   *
   * 🔴 **为什么用"时间戳单字段"而不是 `archived: true` + `archivedAt` 两个字段**：
   * 两个字段会重演 `global` 那个教训——它一度兼表"是全局"与"已批准"两件**不同**的事，
   * 于是字段开始撒谎（写着 `true` 却不在 GLOBAL 里）。
   * 而这里「有归档时间」与「已归档」是**同一事实的两个面向**，单字段不可能自相矛盾，
   * 还顺手给了归档页一个可排序、可显示的时间。
   *
   * ⚠️ **缺省（无此行）= 活跃**——这是**有意选的失败方向**：
   * 若缺省取"已归档"，一旦哪个手抄字段的地方漏带它，**全库知识会集体消失**；
   * 取"活跃"则最坏只是"某条归档物复活"。两害相权取轻（见「有效做法」的默认值不对称）。
   * @see updatedAt
   */
  archivedAt: string
}

/**
 * 一张封面 + 它的来源（解析时才有，不落盘）。
 *
 * `themes:` 用于把封面归回它所属的项目文档。
 */
export interface ParsedCover {
  cover: Cover
  /** 来源项目文档的文件名（`HANDOFF-<id>.md`）。 */
  sourceFile: string
  /** 该封面在源文档中的行号（1 起），用于报错定位。 */
  line: number
}

/**
 * 内部条目的 frontmatter（§3.3）。
 *
 * ⚠️ 与封面**同值**（"两处都写"）；**冲突时以 handoff 封面为准**，
 * `memj_rebuild` 会把封面同步进来，**发现不一致时报出来、不静默改**。
 */
export interface EntryFrontmatter {
  id: string
  /** 英文短名，用于重建文件名与查重。 */
  slug: string
  project: string
  theme: string[]
  global: boolean
  /** ⭐ 形态分类（可选，空串 = 未分类）。与 `theme` 正交（决策 81）。 */
  kind: EntryKind | ''
  tags: string[]
  /** ⭐ **标题**（决策 98，必填）。与封面同值。 */
  title: string
  desc: string
  /**
   * ⭐ **创建时间 / 最后更新时间**（决策 119）。ISO 8601；空串 = 未知。
   *
   * 🔴 **为什么这两个字段一度缺失**（2026-09-18 实测发现）：决策 119 把时间加到了
   * `Cover` 与 `Project/ThemeFrontmatter`，**唯独漏了这里**——
   * 而 `store.syncEntryFrontmatter()` 是**从 `Cover` 取值直接拼进正文 frontmatter** 的
   * ⇒ **文件里其实一直写着这两行**，只是**类型没声明**、`loadEntryDoc()` 也不解析
   * ⇒ 详情页 API 拿到空值、页面上时间**恒显示"（空）"**。
   * ⚠️ 这正是本项目的老坑「**新增字段要找全手工构造点**」（知识条目 `d65742af`）：
   * 类型系统能兜住"构造对象"，但**漏声明的字段，它反而不报错**（多写才报）。
   */
  createdAt: string
  updatedAt: string
  /**
   * ⭐ **归档时间**（决策 133）。ISO 8601；空串 = 未归档。
   *
   * ⚠️ 与 `global` 同性质：**封面是权威来源**，这里只是"两处都写"的镜像
   * （`store.syncEntryFrontmatter()` 从 `Cover` 取值拼进来）。
   * 🔴 **加字段必须同时改三处**：本类型、`coverFromYaml`/`renderCover`（封面侧）、
   * 以及 `loadEntryDoc()` 里那个**手工构造** `EntryFrontmatter` 的地方——
   * 漏了它不报错、只是运行时变 `undefined`（本类型上方那段注释记的正是这个坑）。
   */
  archivedAt: string
  /** 溯源（只记会话 id 与出处，**不记绝对路径**，§2.5）。 */
  source?: {
    sessionId?: string
    from?: string
  }
}

/**
 * 条目正文文档的完整形态（frontmatter + 正文）。
 */
export interface EntryDoc {
  frontmatter: EntryFrontmatter
  /** 正文（不含 frontmatter）。 */
  body: string
  /**
   * 标题（决策 98）。
   *
   * ⭐ **优先取 frontmatter 的 `title`**（权威来源）；
   * ⚠️ 取不到时**回退到正文**（首个 `###` / 外部引用首个 `#`）——
   * 这是为**存量文档**保留的兼容路径，迁移完成后就不再需要。
   */
  title: string
}

/**
 * 项目文档的 frontmatter（§4.3）。
 *
 * ⭐ `themes:` 是**项目 → 主题的反向链接**（§12-68）：由 rebuild 汇总，
 * 用于「LLM 凭记忆直接用、没触发 read」时的候选主题兜底（§3.7.3 来源②）。
 */
export interface ProjectFrontmatter {
  project: string
  /**
   * ⭐ **显示名**（决策 115，2026-09-18 新增）。可空 ⇒ 显示时回落到 `project`（即 id）。
   *
   * 🔴 **为什么需要它**：用户要求"项目可以改名，但是**不能改 ID**，相当于只是改标题"。
   * 而 `project` 字段**就是 id 本身**（同时是文件名 `HANDOFF-<id>.md` 与全部封面的
   * `project` 引用键）⇒ 就地改 id 要同时动 N 处、中途失败会留下半迁移状态。
   * ⇒ **把"显示名"独立成一个字段**：改名只动 `title`，**id 永不变、引用永不断**。
   * ⚠️ 空串 = 未设置（不是错误）——老项目没有这个字段，读出来就是空。
   */
  title: string
  /** 项目描述（检索键，≤200 字符）。 */
  desc: string
  /** 本项目已关联的主题 id。 */
  themes: string[]
  /** ⭐ 创建时间（决策 119，ISO；空串 = 未知）。**不可变**。 */
  createdAt: string
  /** ⭐ 最后更新时间（决策 119，ISO；空串 = 未知）。⚠️ rebuild **不算**更新。 */
  updatedAt: string
  /**
   * ⭐⭐ **归档时间**（决策 133）。ISO 8601；**空串 = 未归档（活跃）**。语义同 `Cover.archivedAt`。
   *
   * 🔴 **项目归档 ≠ 旗下知识归档**（用户明确裁定）：
   * 项目归档后，它旗下的**封面照旧活跃**、`project` 挂靠字段**照旧不变**，
   * 只是**项目本身**不再出现在项目列表 / 不再参与工具调用。
   * ⚠️ 因此**扫描时必须仍然解析它的文档**去取封面——
   * 项目层的过滤与封面层的过滤是**两件事**，不能混（见 `scanLibrary`）。
   */
  archivedAt: string
  /**
   * 🔴 **`sections` 字段已删除**（2026-10-05，用户裁定）。
   *
   * 它原先记"本项目有哪几节"（决策 204）。**删它的理由**：
   *   · 模板改走 md 之后，这行成了**节名的最后一份副本**；
   *   · 而"节名"的权威**早就**挪到**正文的 `##` 标题**了（决策 207：正文是
   *     `rebuildDerivedLayers()` 唯一不碰的地方）；
   *   · 它剩下的唯一实际作用是个**副作用**：非空会让截断判据落到
   *     "以 `truncateSections` 为准"那一支 ⇒ 老文档"只被补了 `sections`、
   *     没补 `truncateSections`"时**自动截断静默关闭**（实测踩到 11 份）。
   * ⇒ ⭐ 判据：**同一事实有两份副本时，删掉那份"只是被回落的"，而不是给它加防线。**
   *
   * ⚠️ **读侧不再认它**：老文档里残留的这行**没有任何效果**（存量已用脚本清掉）。
   */

  /**
   * ⭐ **建文档时用的模板 id**（决策 204）。空串 = 默认模板。
   *
   * ⚠️ **纯记录用途**（便于人回溯"这个文档当初按哪套结构建的"）——
   *   **它不是运行时依据**：真正生效的节名在**正文**里。
   *   ⇒ 模板被改/被删之后，这个字段**照样保留**，不影响任何行为。
   */
  template: string
  /**
   * ⭐⭐ **本项目的自动截断目标节**（决策 204 / 206）——**可多个**；空数组 = **不自动截断**。
   *
   * 🔴🔴 **为什么必须存进文档、而不能"运行时去查模板"**：
   *   模板**可以被改、被删**，而文档要与它**解耦**（改模板不影响已有文档）
   *   ⇒ 文档必须**完全自描述**：光有节名不够，还得知道**哪些节可以截**。
   *
   * ⭐ **决策 206（2026-10-02）从单值改成数组**：用户指出"最多一节可截断"是错的
   *   —— 交接文档里可能有好几节都会无限膨胀。语义是**各自独立**：
   *   每节各自与阈值比、各自截、各自产出自己的历史归档块。
   *   ⚠️ **兼容读**：老文档存的是**单个字符串**（`truncateSection: 当前进度`），
   *   读侧按"单值 → 单元素数组"接住（见 `store.ts` 的解析）。
   *
   * ⭐⭐ **2026-10-05 起的判据（`sections` 删掉之后，只剩一条）**：
   *   · **正文各节规范块里写了 `truncate` 的节** ⇒ 就是它们（决策 209 主路径）；
   *   · 旧形态（末尾 `## 本档写作规范` 一节）⇒ 从它反解（存量兼容读）；
   *   · **都没有 ⇒ 本字段** —— 空数组就是**真的不截**（用户裁定：**规范里没写就不截**）。
   *   ⚠️ 本字段是**镜像**：`handoff` 每次落盘会把它写成"从正文反解出来的那份"。
   */
  truncateSections: string[]
}

/** 主题文档的 frontmatter（§4.3）。 */
export interface ThemeFrontmatter {
  theme: string
  /**
   * ⭐ **显示名**（决策 115）——同 `ProjectFrontmatter.title`：
   * 改名只动它，**`theme`（id）永不变**，避免断掉封面的 `theme` 引用。
   */
  title: string
  /** 主题描述（检索键，≤200 字符）。**重建时必须保留**，不能被清掉。 */
  desc: string
  /** ⭐ 创建时间（决策 119，ISO；空串 = 未知）。**不可变**。 */
  createdAt: string
  /** ⭐ 最后更新时间（决策 119，ISO；空串 = 未知）。⚠️ rebuild **不算**更新。 */
  updatedAt: string
}

/**
 * 一条读快照（§3.8.1）。
 *
 * **它解决的问题**：LLM 每次从别项目取知识来用，就是一次**真实发生的跨项目复用**——
 * 记下来，"跨了两个项目"这件事就已经是既成事实，不需要事后扫全库去猜相似。
 */
export interface ReadSnapshot {
  /** 被读 entry 的封面快照。 */
  entryId: string
  title: string
  desc: string
  theme: string[]
  project: string
  /**
   * ⭐ 其**所属项目**的标题与 desc——供判断"能不能提炼成主题"。
   * （§12-56：只带项目标题/desc，不带更多。）
   */
  owner: { title: string; desc: string }
  readAt: string
  /** `null` = 还没被 handoff 消费。 */
  consumedAt: string | null
}

/**
 * ⭐ **项目文档读记录**（决策 112）。
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * 决策 109 把项目文档改成"累积的活文档"（`doc` 按节合并），
 * 但当时就承认了一个缺口：**模型没有任何工具能读到项目文档的六节**
 * ⇒ 只能凭记忆重写，而"凭记忆"必然压缩、丢细节。
 *
 * ⚠️ **实际事故**：某轮 handoff 时，我读了文档的「目标/有效做法/失败踩坑/下一步」四节，
 * **唯独漏读「当前进度」**——恰恰是要写的那一节 ⇒ 于是没把新批次写进该节，
 * 转而新建了一个顶层自定义节，破坏了文档结构。
 *
 * ⇒ 本记录 = **"本会话真的读过哪个项目文档"**这件事的凭据，
 * 供 `memj_handoff` 在**写叙事前**做硬校验（没读 ⇒ 拒绝）。
 *
 * 🔴 **与 `ReadSnapshot` 是两回事**（所以单独一个文件、单独一个目录）：
 * | | `ReadSnapshot` | **本记录** |
 * |---|---|---|
 * | 对象 | **知识条目**（别项目的） | **项目文档**（本项目的） |
 * | 用途 | 跨项目证据（建主题的闸门） | 写叙事的前置条件 |
 * | 装得下吗 | 结构是封面专用，装不下文档 | —— |
 * | 有效期 | 会话级（未消费即有效） | ⭐ **轮次级**（决策 112 用户拍板） |
 */
export interface DocReadRecord {
  /** 项目 id（项目文档就是 `HANDOFF-<id>.md`）。 */
  project: string
  /**
   * ⭐⭐ **这条记录是怎么来的**（2026-09-22 新增）。
   *
   * - `read`（默认，缺省即它）：模型**真的调 `memj_read` 读了项目文档**；
   * - `gethandoff`：人执行了 **`/memj-get-handoff-project <项目>`**
   *   —— ⭐ **同样是"人明确要了那个项目的上下文"**，强度等同（用户裁定）。
   *   🔴 它以前**不写任何记录** ⇒ 那些会话判不出项目
   *   （用户实测：某会话做过 get-handoff，但 `doc-reads` 文件根本不存在）。
   * - ⭐⭐ `handoff`：模型调了 **`memj_handoff`**（**入参里明写着 `project`**）
   *   —— **最强的判据**：既是**模型自己声明的项目**，
   *   又**真的写了那个项目的文档**。🔴 同样以前不写记录
   *   （用户实测：某会话做过 5 次 handoff、含一次建项目的交接，却判不出项目）。
   *
   * ⚠️ **缺省 = `read`**（向后兼容：旧记录没有这个字段）。
   */
  via?: 'read' | 'gethandoff' | 'handoff'
  /**
   * ⭐⭐ **读它时所在的轮次号**（决策 112 的**有效期粒度**）。
   *
   * 🔴 **用户明确要求**："不是 step 的颗粒，是一个完整轮次的颗粒。"
   * ⇒ 硬校验只认**当前轮次**里的读记录：上一轮读过不算——因为
   * **上一轮 handoff 很可能刚改过这份文档**，凭旧印象写就等于没读。
   *
   * 来源：`ctx.sessionProjections.stateOf(session, 'turnBoundary')?.lastTurn`
   * （`turn/start` / `turn/end` 事件带的 `turn: number`）。
   * ⚠️ 拿不到时记 `-1`（= 未知）⇒ 校验侧**退化为"本会话读过即可"**，
   * 宁可放松也不误拦（见 `findDocRead`）。
   */
  turn: number
  /** 读的时刻（ISO）。 */
  readAt: string
  /** 本次读到的是不是**全文**（按节读时为 `false`）。 */
  full: boolean
  /** 本次读到的节名（全文读时为空数组）。 */
  sections: string[]
}

/** 待批的 global 提名（§2.2 `nominations.json`）。 */
export interface Nomination {

  /** 被提名的封面 id。 */
  entryId: string
  /** 提名时的封面标题/desc，供人侧列表显示。 */
  title: string
  desc: string
  /** 来源项目 id。 */
  project: string
  /** 提名时间。 */
  nominatedAt: string
}

/** 提名文件的结构。 */
export interface NominationsFile {
  nominations: Nomination[]
}

/** 一次封面校验失败（§3.9.2）。 */
export interface CoverIssue {
  /** 出问题的来源文件（项目文档名）。 */
  file: string
  /** 行号（1 起）；未知时为 0。 */
  line: number
  /** **哪一条、哪一项**不合格——错误信息必须能指明（§3.9.1）。 */
  reason: string
}

/** 项目或主题的「语境」条目（`memj_info` 的返回单元）。 */
export interface ContextItem {
  id: string
  name: string
  desc: string
}

// ═══════════════════════════════════════════════════════════════════════════
// ⭐⭐ 热知识注入（热知识方案 §5）
//
// 🔴 **这些类型描述的是 `hot/` 下的文件，不是封面**——它们**不是知识**，
//    而是"哪些知识要注入、以什么形态注入"的**人侧设置**。
//    ⚠️ 封面不该承担这个语义（那样会让"封面即知识"这条铁律出现例外）。
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⭐⭐ **注入形态**（方案 §3.4）。
 *
 * - `meta`（默认）：给**标题 + desc + id**，模型要正文时自己 `memj_read`；
 * - `full`：给**正文 + id** —— ⚠️ 与「用户画像」**连成同一段**
 *   （两者都是"直接给 LLM 用、不需要 read"的内容）；
 *   🔴 **仍保留 id 的唯一目的 = 看门狗判断**（用户明确要求）。
 */
export const HOT_SHAPES = ['meta', 'full'] as const
export type HotShape = (typeof HOT_SHAPES)[number]

/**
 * ⭐ **注入通道**（方案 §3.3）。
 *
 * ⚠️ **`section` 仅画像与全局层可用**——`systemPrompt.section()` 在 root scope 注册，
 * 它的 `text()` 对**所有 agent** 返回同一份内容，物理上装不下"按项目区分"的东西。
 * ⇒ 项目/主题层的条目即使写了 `section`，也**一律按 `inbox` 处理**，
 *   并在页面上**明确提示**（本项目一贯：**不静默降级**）。
 */
export const HOT_CHANNELS = ['inbox', 'section'] as const
export type HotChannel = (typeof HOT_CHANNELS)[number]

/** ⭐ 一条**用户画像**（方案 §5.2；**多条列表**，不是单个文件）。 */
export interface HotPersonaItem {
  /** 本地生成的 id（形如 `p-xxxxxx`；**不必**是封面 id）。 */
  id: string
  /** 画像正文（markdown **原样**注入，不解析、不切分）。 */
  text: string
  /** 是否参与注入。 */
  on: boolean
  channel: HotChannel
  createdAt: string
  updatedAt: string
}

/** `hot/persona.json` 的结构。 */
export interface HotPersonaFile {
  version: number
  items: HotPersonaItem[]
}

/**
 * ⭐⭐ **一条【全局知识】的注入设置**（方案 §5.3）。
 *
 * 🔴🔴 **2026-09-22 收窄：本结构只服务全局层**（用户裁定）。
 * 判据是**"作用的层级 = 存的地方"**：
 *
 * | 谁 | 设置存哪 | 为什么 |
 * |---|---|---|
 * | **画像** | `persona.json` 自带 `on`/`channel` | 它不属任何项目 |
 * | **全局知识** | **本结构** | 它对**所有项目**生效 ⇒ 设置天然是全局的 |
 * | **项目 / 主题知识** | **`selection.json`**（逐项目） | 同一个项目的用法**逐项目不同** |
 *
 * ⚠️ **旧设计把三层都塞进本结构** ⇒ 出现"两道隐形串行开关"（在清单里 ∧ `on`），
 * 而 `on` 缺省 `false` ⇒ 实测**选中 11 条、注入 0 条**。
 * 且 `on` / `shape` / `pinnedAt` 三个字段其实**都是"项目对这条的用法"**，
 * 存在全局表里 ⇒ 项目 A 置顶、项目 B 也跟着置顶（**字段在撒谎**）。
 */
export interface HotEntrySetting {
  /** 是否纳入注入。⚠️ **全局层缺省 = 纳入**（它按定义就该被所有会话看到）。 */
  on: boolean
  /**
   * 注入通道（`inbox` = `agent/pre-step` 追加 user 消息；`section` = root 级系统提示词）。
   *
   * 🔴 **一期只实现 `inbox`**（`section` 通道是二期）；
   * ⚠️ 但**字段现在就留着**——二期上线时用户已勾好的选择**直接生效**，不必重配。
   * ⚠️ **只有全局层有意义**：`section()` 注册在 root scope ⇒
   * 按项目区分的东西**物理上装不进去**（方案 §3.2）。
   */
  channel: HotChannel
  /** `meta`（只给标题 + desc + id）｜ `full`（给整篇正文）。 */
  shape: HotShape
}

/**
 * `hot/entries.json` 的结构。键 = **封面 id**（稳定，不随 slug/title 变）。
 *
 * ⚠️ **文件名保持不变**（虽然语义已收窄为"全局知识设置"）：
 * 改名要连带迁移，且**用户回滚到旧版本时会读不到数据**（看起来像丢了）。
 * ⇒ 取舍：**留名、改注释**。
 */
export interface HotEntriesFile {
  version: number
  entries: Record<string, HotEntrySetting>
}

/**
 * ⭐⭐ **某个项目清单里的一条热知识**（方案 §5.3b）。
 *
 * 🔴🔴 **2026-09-22：`on` / `shape` / `pinnedAt` 从 `entries.json` 搬到这里**（用户裁定）。
 *
 * ⭐ **本结构没有 `on` 字段，这是有意的**：
 * **在清单里 = 会注入**。原来"在清单里 ∧ `on`"两道串行开关
 * 在界面上完全看不出来（`on` 的入口在另一个子页、还叫"纳入"）
 * ⇒ 用户选中 11 条却一条都不注入，**无从察觉**。
 */
export interface HotProjectEntry {
  /** 封面 id。 */
  id: string
  /** `meta`｜`full` —— **逐项目**（项目 A 要正文、项目 B 只要标题是合法需求）。 */
  shape: HotShape
  /**
   * ⭐ **最后置顶时间**（ISO）；**空串 = 未置顶**。
   *
   * 🔴 **必须单独记**，不能复用封面的 `updatedAt`——
   * 排序规则是"**置顶优先，置顶内部按最后置顶时间倒序**"，
   * 而 `updatedAt` 是**知识自己**的更新时间（两件事）。
   * ⚠️ **置顶只对项目热知识有意义**：全局知识与画像本来就全局注入，
   * 没有"排在哪里"的问题（它们的入口也没有置顶按钮）。
   */
  pinnedAt: string
}

/**
 * ⭐ **某个项目选中的热知识**（方案 §5.3b）。
 *
 * 🔴 **与 `entries.json` 的关系（2026-09-22 重划）**：
 * · `entries.json` = **全局知识**的设置 —— 全局只有一份；
 * · 本结构        = **本项目**选了哪些项目/主题知识、各自什么形态、置不置顶 —— **逐项目**。
 */
export interface HotProjectSelection {
  /**
   * 已选条目（**有序**；置顶的排在最前，由 `pinnedAt` 决定）。
   *
   * ⚠️ **旧结构是 `entryIds: string[]`** ⇒ `loadSelections()` 会自动迁移（见那里）。
   */
  entries: HotProjectEntry[]
  /**
   * ⭐ **首次生成默认清单的时间**（ISO）。
   *
   * 🔴 **只在为空时生成一次**（"最新的 10 条项目知识 + 5 条不重复的主题知识"）
   * ⇒ 之后**尊重用户的手工增删**（绝不覆盖）。
   */
  initializedAt: string
}

/** `hot/selection.json` 的结构。 */
export interface HotSelectionFile {
  version: number
  projects: Record<string, HotProjectSelection>
}

/** ⭐ **项目判定的结果**——`未知` 是**一等公民**（方案 §7.2 ④）。 */
export const HOT_PROJECT_UNKNOWN = '未知'

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
export const HOT_BIND_SOURCES = ['doc-reads', 'llm', 'manual', 'inherited'] as const
export type HotBindSource = (typeof HOT_BIND_SOURCES)[number]

/** ⭐ **一个会话的热知识绑定**（方案 §5.4）。 */
export interface HotSessionBinding {
  /** 项目 id；`未知` 见 `HOT_PROJECT_UNKNOWN`。 */
  project: string
  /** 这个绑定是谁定的。⚠️ **必须记**——否则 UI 答不出"是我定的还是它自己猜的"。 */
  source: HotBindSource
  /** 绑定时间（ISO）。 */
  boundAt: string
  /**
   * ⭐ **最新活跃时间**（ISO）。
   *
   * 🔴 裁定 H-4 要求"留最新 50 个会话、按最新活跃时间倒序淘汰"。
   * ⚠️ `Session` 上**没有任何"最后活跃"字段**（已核实 `dsh-session/lib/types/index.d.ts:103-145`）
   * ⇒ 由**我们在该会话真的跑过 `pre-step` 时**写。
   * ⭐ 与官方 `updatedAt`（= 最后一次**人类消息**时间）**语义不同**，页面上分开显示。
   */
  lastActiveAt: string
}

/** `hot/sessions.json` 的结构。 */
export interface HotSessionsFile {
  version: number
  /** ① `doc-reads` 强判定（**唯一默认启用**）。 */
  detectDocReads: boolean
  /** ② 后台 LLM 判定（**开关，默认关**；⚠️ 会额外消耗 token）。 */
  detectLlm: boolean
  /** ② 用哪个模型（`''` = 用主会话的路由）；形如 `{ provider, model }`。 */
  detectLlmModel: { provider: string; model: string } | null
  sessions: Record<string, HotSessionBinding>
}
