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
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { promptsDir, promptOverridesPath, promptHistoryDir, safeName } from './paths.ts'
import { writeTextAtomic } from './files.ts'
// ⭐ 人读文案（分区 / 用途 / 归属）的唯一出处——见那个模块的头注释。
import { PROMPT_CATALOG, PROMPT_GROUPS, type PromptGroup } from './prompt-catalog.ts'

/** 覆盖文件结构版本（结构变了就升它 ⇒ 旧文件当空表，不猜）。 */
export const PROMPT_OVERRIDES_VERSION = 1

/** 覆盖表：`key → { text, updatedAt }`。 */
export interface PromptOverrides {
  version: number
  overrides: Record<string, { text: string; updatedAt: string }>
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
export type PromptZone = PromptGroup

/**
 * **热生效判定**（探针实测后的三档）。
 *
 * ⚠️ 这一列**必须如实**——它是本页最容易被误解的信息。
 */
export type HotReload =
  /** 保存后下一轮即生效（覆盖层支撑）。 */
  | 'immediate'
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
  | 'restart'
  /** 只读展示（改了会破坏契约）。 */
  | 'readonly'

/**
 * 一条提示词的**静态元数据**（展示用；文案由本模块给出，值由调用点给）。
 *
 * ⚠️ **`title` / `purpose` 等字段是"给人看"的**，它们**不进任何提示词通道**
 *    （本项目纪律：写给人看的说明不占模型的常驻预算）。
 */
export interface PromptSpec {
  /** 稳定键（`<域>:<归属>:<部位>`）——**不是序号**（序号会在增删工具时错位）。 */
  key: string
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
  zone?: PromptZone
  /** 干什么（一句话）。⚠️ 由目录注入，见上。 */
  purpose?: string
  /** 属于哪个工具 / 功能（展示用）。⚠️ 由目录注入，见上。 */
  owner?: string
  /** 注入方式（落点）。 */
  injectMode: string
  /** 是否破前缀缓存。 */
  breaksCache: 'yes' | 'no' | 'na'
  /** 具体写在哪个文件里（相对插件仓根）。 */
  sourceFile: string
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
  sourceConst?: string
  /** 保存后是否热生效。 */
  hotReload: HotReload
  /** 是否允许在页面上编辑（参数/输出 schema 为只读）。 */
  editable: boolean
  /** 编辑时的校验规则（可多条）。 */
  checks: readonly PromptCheck[]
  /** 只读项的说明（为什么不能改）。 */
  readonlyWhy?: string
}

/** 校验规则（**保存时同步拦**——用户裁定"可以改完专门做校验"）。 */
export type PromptCheck =
  /** 不能为空。 */
  | { kind: 'nonEmpty' }
  /** 最多 N 字符（预算）。 */
  | { kind: 'maxChars'; max: number; why: string }
  /** 必须全是英文（JEV 的 4 条：中文会让分辨力归零）。 */
  | { kind: 'englishOnly' }
  /** markdown 围栏必须成对（`gen-context.mjs` 会拒两个围栏的块）。 */
  | { kind: 'fencesBalanced' }
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
   * ⚠️ **校验是双向的**（缺一个不行、多一个也不行）：
   *    · 少了登记的插槽 ⇒ 拒（那个值**再也进不去**，且不报错）；
   *    · 出现**没登记**的插槽 ⇒ 也拒（`fillSlots` 不认识它 ⇒ 会**原样发给模型**）。
   */
  | { kind: 'slots'; tokens: readonly string[]; why: string }

// ══════════════════════════════════════════════════════════════════════
// 注册表元数据
// ══════════════════════════════════════════════════════════════════════

/** 源文件路径（相对插件仓根，展示用）。 */
const F = {
  protocol: 'src/protocol.ts',
  context: 'src/context.ts',
  descriptions: 'src/tool-descriptions.ts',
  tools: 'src/tools.ts',
  commands: 'src/commands.ts',
  inject: 'src/inject.ts',
  reads: 'src/reads.ts',
  templates: 'src/templates.ts',
  hotInject: 'src/hot-inject.ts',
  recall: 'src/active-recall.ts',
  scoreChat: 'src/score-chat.ts',
  tagNorm: 'src/tag-normalize.ts',
  enIndex: 'src/en-index.ts',
} as const

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
const TOOL_META: ReadonlyArray<{ name: string; purpose: string; owner: string }> = [
  { name: 'memj_info', purpose: '列出库里的项目与主题（语境入口，不返回知识条目）', owner: 'memj_info' },
  { name: 'memj_search', purpose: '按项目/主题/检索词筛封面（只找，不回正文）', owner: 'memj_search' },
  { name: 'memj_read', purpose: '按 id 读知识正文或项目交接文档（只读）', owner: 'memj_read' },
  { name: 'memj_snapshots', purpose: '读本会话的读快照清单（跨项目证据来源）', owner: 'memj_snapshots' },
  { name: 'memj_handoff', purpose: '写叙事 + 沉淀知识 + 归属推进（写入主入口）', owner: 'memj_handoff' },
  { name: 'memj_promote', purpose: '事后增删主题归属 / 改封面字段 / 提名全局', owner: 'memj_promote' },
  { name: 'memj_update', purpose: '更新一条已有知识的正文与封面字段', owner: 'memj_update' },
  { name: 'memj_rebuild', purpose: '重建派生层 + 封面体检（人侧也调它）', owner: 'memj_rebuild' },
  // ⭐⭐⭐ 决策 205：交接文档模板（管理模板：list/create/delete；两段式确认）。
  { name: 'memj_template', purpose: '管理交接文档模板（列表 / 新建 / 删除；两段式确认）', owner: 'memj_template' },
  { name: 'memj_normalize_tags', purpose: '标签规范化：裁决合并/新增/丢弃/retag', owner: 'memj_normalize_tags' },
  { name: 'memj_score_turn', purpose: '轮末复盘：挑出能帮上忙的知识并加分', owner: 'memj_score_turn' },
]

/** 四个斜杠命令（元数据）。 */
const CMD_META: ReadonlyArray<{ name: string; purpose: string }> = [
  { name: 'memj-handoff', purpose: '按 memj 规范做一次记忆 handoff' },
  { name: 'memj-review', purpose: '人侧状态面板：待批提名 / 断链 / 非法封面' },
  { name: 'memj-get-handoff-project', purpose: '把某项目的交接内容注入会话' },
  { name: 'memj-get-handoff-theme', purpose: '把某主题的封面清单注入会话' },
]

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
function cmdConstName(name: string): string {
  const M: Record<string, string> = {
    'memj-handoff': 'CMD_HANDOFF_DESCRIPTION',
    'memj-review': 'CMD_REVIEW_DESCRIPTION',
    'memj-get-handoff-project': 'CMD_GET_PROJECT_DESCRIPTION',
    'memj-get-handoff-theme': 'CMD_GET_THEME_DESCRIPTION',
  }
  return M[name] ?? ''
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
const CMD_HINT_META: ReadonlyArray<{ name: string; constName: string; purpose: string }> = [
  {
    name: 'memj-handoff',
    constName: 'HINT_HANDOFF',
    purpose: '命令选中后落进输入框的提示：可以补充本次重点',
  },
  {
    name: 'memj-get-handoff-project',
    constName: 'HINT_GET_PROJECT',
    purpose: '命令选中后落进输入框的提示：填项目 id，可再补档位',
  },
  {
    name: 'memj-get-handoff-theme',
    constName: 'HINT_GET_THEME',
    purpose: '命令选中后落进输入框的提示：填主题 id',
  },
]

/**
 * ⭐⭐⭐ **全部提示词的静态元数据**（唯一一份）。
 *
 * 🔴 **加新提示词时改这里** —— 它是【提示词】页的账本；
 * ⚠️ 装配侧也要同步接上取值（见各调用点的 `promptText(key, fallback)`）。
 */
const PROMPT_SPECS_RAW: readonly PromptSpec[] = [
  // ── A 区：常驻文本 ──
  {
    key: 'section:memj:protocol',
    injectMode: 'systemPrompt.section() —— system 角色，独占 node 0',
    breaksCache: 'yes',
    sourceFile: F.protocol,
    sourceConst: 'PROTOCOL_TEXT',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }, { kind: 'maxChars', max: 2500, why: '协议预算 2500（越了要压缩，别抬阈值）' }, { kind: 'fencesBalanced' }],
  },
  {
    key: 'context:memj:usage-guidance',
    injectMode: 'systemPrompt.context() —— user 角色，尾部 append',
    breaksCache: 'no',
    sourceFile: F.context,
    sourceConst: 'CONTEXT_TEXT',
    hotReload: 'immediate',
    editable: true,
    checks: [
      { kind: 'nonEmpty' },
      { kind: 'fencesBalanced' },
      // ⭐⭐⭐ **决策 217：正文里的「知识类型目录」是一个 HTML 注释标记**。
      //    `<!--memj:kind-catalog-->` 由 `schema.ts` 的 `kindCatalogText()` **每轮现拼**
      //    （`index.ts` 的 `fillKindMarkers()` 填）。
      //    🔴 为什么不能写死：本条目**可编辑**（且已有覆盖层），表写死在正文里就永远是**固定快照**
      //       ⇒ 用户在【知识类型】页改了类型，模型读到的还是旧表。
      //    🔴🔴 **为什么是注释、不是 `{{名字}}` 插槽**（**踩崩一次换来的**）：
      //       `context()` 的文本会被 **DSH 自己再解析一遍 `{{}}`**，而它只认
      //       `/^[a-z][a-z0-9_]*$/` 且要求变量已在 DSH 注册 ⇒ 否则**抛异常、会话装配失败**。
      //       ⭐ 注释**不在 DSH 的语法里** ⇒ 安全；且"新文本 + 旧代码"时只是**原样发出去**，
      //       不会崩 —— 那个窗口因此不再致命。
    ],
  },

  // ── B 区：工具描述（可改） + 参数/输出 schema（只读展示）──
  //
  // 🔴🔴 **参数与输出为什么必须"展示但不可改"**（用户 2026-09-29 裁定）：
  //    · 参数 schema 是**模型决定怎么调这个工具的依据** ⇒ 改坏它模型会调错；
  //    · 输出 schema 是**运行时强校验**（`additionalProperties: false`）⇒
  //      改坏它会让**整次调用被拒收**（本项目踩过：多返回一个字段就整次失败）。
  //    ⭐ 它们的"正确性"是**可机械判定的**（能不能注册成功、能不能通过校验），
  //      不是主观文本编辑 ⇒ 不该开放给自由编辑。
  ...TOOL_META.flatMap((t): PromptSpec[] => [
    {
      key: `tool:${t.name}:description`,
      injectMode: 'wire `tools` 段的工具 description',
      breaksCache: 'yes',
      sourceFile: F.descriptions,
      // ⭐ **写回定位**：工具描述的常量名有固定规律（`src/tool-descriptions.ts`）。
      //    ⚠️ 它是**推导出来的**而不是登记的——若哪天改了命名规律，写回会定位失败
      //    （那时 `writeBackToSource()` 会明确报"找不到常量"，不会静默改错）。
      sourceConst: `${t.name.toUpperCase()}_DESCRIPTION`,
      hotReload: 'immediate',
      editable: true,
      /**
       * ⚠️ **这里曾经想加 `slots: ['kindList']` 校验，已撤掉**（决策 217）：
       *   那套"插槽"方案整体作废 —— `{{名字}}` 在 **DSH 的通道里是有主的语法**
       *   （会被它再解析、且只认小写、还要求变量已注册 ⇒ 否则**抛异常**）。
       * ⭐ 现在用 **HTML 注释标记**（`<!--memj:kind-list-->`），
       *   而"禁止 `{{}}`"那道闸由 **通道判定** 统一加（见 `validatePrompt`），
       *   不需要在这条 spec 上单独声明。
       */
      checks: [{ kind: 'nonEmpty' }],
    },
    {
      key: `tool:${t.name}:parameters`,
      injectMode: 'wire `tools` 段的 parameters（JSON Schema）',
      breaksCache: 'yes',
      sourceFile: F.tools,
      hotReload: 'readonly',
      editable: false,
      readonlyWhy: '参数 schema 决定模型怎么调用这个工具；改坏会导致调用被拒或参数错。它是"可机械验证的契约"，不是主观文本 ⇒ 只展示。',
      checks: [],
    },
    {
      key: `tool:${t.name}:output`,
      injectMode: '不进模型上下文（是运行时校验契约）',
      breaksCache: 'no',
      sourceFile: F.tools,
      hotReload: 'readonly',
      editable: false,
      readonlyWhy: '返回值 schema 是运行时强校验：多返回一个字段就让整次调用被拒收。只展示。',
      checks: [],
    },
  ]),

  // ── B 区：命令描述（⚠️ 实测不可热更新 ⇒ 如实标只读）──
  //
  // 🔴🔴 **为什么命令描述标成只读**（本次实测，见 HANDOFF 记录）：
  //    `dsh-commands` 的 `normalizeDefinition()` 在注册时就把 description
  //    **`Object.freeze` 进 descriptor**（`lib/index.js:158-172`），
  //    而 `list(agent)` 只回那份冻结快照（`:278-280`）⇒ **注册后再改无效**。
  //    ⚠️ 且它**不进模型上下文**（消费方是 UI/协议，不是 wire `tools` 段）
  //      ⇒ 改它对"模型行为"没有影响，只是界面上的说明文字。
  //
  // 🔴🔴 **2026-10-12 改为开放编辑**（原来是 `editable: false` + `'readonly'`）：
  //    ① 原来它**根本没有 `promptText` 通路**（`commands.ts` 里是硬编码字面串）
  //       ⇒ 页面即使存了覆盖值也**没人读** ⇒ 改了等于白改。
  //       本次已把那 4 处改成走 `promptText`（含 `registerPromptDefault` 登记默认值）。
  //    ② 它能改、覆盖层也存得住，但**没有热更新通路** ⇒ 需要第三档 `'restart'`。
  //    ⭐ 判据：**能力接通了就该开放；但"什么时候生效"必须如实标**——
  //      原标 `readonly` 是**低估自己**（重启后明明生效），改标 `immediate` 则是**撒谎**。
  ...CMD_META.map(
    (c): PromptSpec => ({
      key: `command:${c.name}:description`,
      injectMode: '命令描述符（消费方是界面/协议，不进模型上下文）',
      breaksCache: 'no',
      sourceFile: F.commands,
      sourceConst: cmdConstName(c.name),
      hotReload: 'restart',
      editable: true,
      checks: [{ kind: 'nonEmpty' }],
    }),
  ),

  // ── B 区：命令 `input.hint`（2026-10-12 新增；⚠️ 与描述同因 ⇒ `restart`）──
  //
  // 🔴🔴 **`nonEmpty` 是硬约束，不是客套**：`dsh-commands` 的 `normalizeDefinition()`
  //    对空 hint **直接 throw**（`input hint must not be empty`）
  //    ⇒ 用户清空后若被放行，**命令注册会挂**（该命令整条不可用）。
  //    ⭐ 判据：**校验要配在"会被下游当成硬条件用"的字段上**。
  ...CMD_HINT_META.map(
    (c): PromptSpec => ({
      key: `command:${c.name}:hint`,
      injectMode: '命令的 `input.hint`（选中后连同命令名落进输入框；不进模型上下文）',
      breaksCache: 'no',
      sourceFile: F.commands,
      sourceConst: c.constName,
      hotReload: 'restart',
      editable: true,
      checks: [{ kind: 'nonEmpty' }],
    }),
  ),

  // ── B 区：手写提示词（无生成器、无校验的那两类）──
  {
    key: 'inject:closing',
    injectMode: '命令 followup 注入文本的末尾',
    breaksCache: 'no',
    sourceFile: F.inject,
      sourceConst: 'CLOSING_INSTRUCTION',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  // ⭐⭐⭐ **注入段表头**（2026-10-12 新增）——它们**逐字写在注入给模型的那段文本里**，
  //    与收尾指令同性质（本项目判据：**能改变模型怎么做的文本就是提示词**）。
  //    ⚠️ 它们**不决定注入哪些条目**（那是代码判据）⇒ 改它们只影响措辞。
  {
    key: 'inject:target-project',
    injectMode: '命令 followup 注入文本（跟在本项目 id 之后）',
    breaksCache: 'no',
    sourceFile: F.inject,
    sourceConst: 'TARGET_PROJECT_LINE',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'inject:target-theme',
    injectMode: '命令 followup 注入文本（跟在本主题 id 之后）',
    breaksCache: 'no',
    sourceFile: F.inject,
    sourceConst: 'TARGET_THEME_LINE',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'inject:project-knowledge-hint',
    injectMode: '命令 followup 注入文本的「本项目的知识」节',
    breaksCache: 'no',
    sourceFile: F.inject,
    sourceConst: 'PROJECT_KNOWLEDGE_HINT',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'inject:theme-knowledge-hint',
    injectMode: '命令 followup 注入文本的「所属主题的知识」节',
    breaksCache: 'no',
    sourceFile: F.inject,
    sourceConst: 'THEME_KNOWLEDGE_HINT',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'inject:theme-covers-hint',
    injectMode: '命令 followup 注入文本的「本主题的知识」节',
    breaksCache: 'no',
    sourceFile: F.inject,
    sourceConst: 'THEME_COVERS_HINT',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  // ⭐⭐⭐ `/memj-handoff` 的启动提示词（2026-10-12：**由只读改为可编辑**）。
  //
  // 🔴🔴 **原来为什么只读**：正文里嵌着运行时才算得出的值（用户补充的话、指定步骤）
  //    ⇒ 它是**参数化模板**，不是一段可整体替换的常量。
  //
  // ⭐⭐ **现在怎么做到可编辑又破坏不了**（用户裁定）：
  //    正文写成**带插槽的模板**（`{{名字}}`），运行时 `fillSlots()` 填值；
  //    保存时 `slots` 校验**双向机械拦**（少一个拒、多一个也拒）。
  //    ⭐ 判据：**"能不能安全地开放"取决于"能不能机械判定它没被改坏"** ——
  //      参数化本身不是拒绝开放的理由，"无法校验"才是。
  {
    key: 'handoff:prompt',
    injectMode: '命令 followup 注入（会唤醒模型）',
    breaksCache: 'no',
    sourceFile: F.commands,
    sourceConst: 'HANDOFF_PROMPT',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'handoff:prompt-steps',
    injectMode: '命令 followup 注入（会唤醒模型）',
    breaksCache: 'no',
    sourceFile: F.commands,
    sourceConst: 'HANDOFF_PROMPT_STEPS',
    hotReload: 'immediate',
    editable: true,
    checks: [
      { kind: 'nonEmpty' },
      {
        kind: 'slots',
        tokens: ['steps', 'stepsJson'],
        why: '这两个是"用户指定了哪几步"与它的 JSON 形态，由程序填；删掉模型就收不到要做什么',
      },
    ],
  },
  {
    key: 'handoff:prompt-note',
    injectMode: '命令 followup 注入的末尾（条件追加）',
    breaksCache: 'no',
    sourceFile: F.commands,
    sourceConst: 'HANDOFF_PROMPT_NOTE',
    hotReload: 'immediate',
    editable: true,
    checks: [
      { kind: 'nonEmpty' },
      {
        kind: 'slots',
        tokens: ['userNote'],
        why: '它是用户补充的那句原话，由程序填；删掉这一块就没有内容可交代了',
      },
    ],
  },

  // ── C 区：插件内部调 LLM 的提示词 ──
  {
    key: 'jev:candidate',
    injectMode: 'JEV 请求的 questions[].instructions（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.recall,
      sourceConst: 'JEV_CANDIDATE_INSTRUCTION',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }, { kind: 'englishOnly' }],
  },
  {
    key: 'jev:need',
    injectMode: 'JEV 请求的 questions.need.instructions',
    breaksCache: 'na',
    sourceFile: F.recall,
      sourceConst: 'JEV_NEED_INSTRUCTION',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }, { kind: 'englishOnly' }],
  },
  {
    key: 'jev:sufficient',
    injectMode: 'JEV 请求的 questions.sufficient.instructions',
    breaksCache: 'na',
    sourceFile: F.recall,
      sourceConst: 'JEV_SUFFICIENT_INSTRUCTION',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }, { kind: 'englishOnly' }],
  },
  {
    key: 'jev:search-intent',
    injectMode: 'JEV 请求的 questions.search_intent.instructions',
    breaksCache: 'na',
    sourceFile: F.recall,
      sourceConst: 'JEV_SEARCH_INTENT_INSTRUCTION',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }, { kind: 'englishOnly' }],
  },
  {
    key: 'active:closing',
    injectMode: '注入进主会话（pre-step 的 user 消息）',
    breaksCache: 'no',
    sourceFile: F.recall,
      sourceConst: 'ACTIVE_CLOSING_INSTRUCTION',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  // ⭐⭐⭐ 主动召回的两行表头（2026-10-12 新增）——**逐字进注入文本**。
  //    🔴 尤其 `active:body-hint`：它直接决定模型会不会去 `memj_read` 取正文。
  {
    key: 'active:header',
    injectMode: '注入进主会话（pre-step 的 user 消息）',
    breaksCache: 'no',
    sourceFile: F.recall,
    sourceConst: 'ACTIVE_HEADER',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'active:body-hint',
    injectMode: '注入进主会话（pre-step 的 user 消息）',
    breaksCache: 'no',
    sourceFile: F.recall,
    sourceConst: 'ACTIVE_BODY_HINT',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'hot:closing',
    injectMode: '注入进主会话（每轮的背景消息）',
    breaksCache: 'no',
    sourceFile: F.hotInject,
      sourceConst: 'HOT_CLOSING_INSTRUCTION',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'hot:body-closing',
    injectMode: '注入进主会话（补注时单独一条消息）',
    breaksCache: 'no',
    sourceFile: F.hotInject,
      sourceConst: 'HOT_BODY_CLOSING_INSTRUCTION',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  // ⭐⭐⭐ 热知识的段头与表头（2026-10-12 新增）——**逐字进注入文本**。
  //    🔴 `hot:head-supplement` 有**实质语义**：模型据此知道"这是补发的缺项、不是新的一批"。
  //    🔴 `hot:direct-section` 与 `hot:meta-hint` 的语义**正好相反**（正文已在眼前 vs 需按需读）。
  {
    key: 'hot:head-first',
    injectMode: '注入进主会话（每轮的背景消息）',
    breaksCache: 'no',
    sourceFile: F.hotInject,
    sourceConst: 'HOT_HEAD_FIRST',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'hot:head-supplement',
    injectMode: '注入进主会话（补注时）',
    breaksCache: 'no',
    sourceFile: F.hotInject,
    sourceConst: 'HOT_HEAD_SUPPLEMENT',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'hot:direct-section',
    injectMode: '注入进主会话（每轮的背景消息）',
    breaksCache: 'no',
    sourceFile: F.hotInject,
    sourceConst: 'HOT_DIRECT_SECTION',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'hot:meta-hint',
    injectMode: '注入进主会话（每轮的背景消息）',
    breaksCache: 'no',
    sourceFile: F.hotInject,
    sourceConst: 'HOT_META_HINT',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'score:system',
    injectMode: '子代理请求的 system（含知识库清单，不进主会话）',
    breaksCache: 'na',
    sourceFile: F.scoreChat,
      sourceConst: 'SCORE_SYSTEM_BASE',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  // ⭐⭐⭐ 复盘里**决定模型挑什么**的两段（2026-10-12 新增）。
  //    🔴 `score:quote-rule` 与**机械校验**配对：措辞一松，模型写"意思差不多"的话
  //      ⇒ 逐字比对全部失败 ⇒ 入选被丢光（本项目实测过这个坑）。
  //    🔴 `score:pick-principle` 决定分数会不会被拉平（实测：不限条数时模型会选 18~24 条）。
  //    ⚠️ 两段都**必须与 K（每轮最多几条）无关** —— 写进具体数字会让 `system`
  //      随 K 变化、把知识库清单一起拖出前缀缓存（§6.4 的硬约束）。
  {
    key: 'score:quote-rule',
    injectMode: '子代理请求的 system（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.scoreChat,
    sourceConst: 'SCORE_QUOTE_RULE',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'score:user-task',
    injectMode: '子代理请求的 user（含本轮内容，不进主会话）',
    breaksCache: 'na',
    sourceFile: F.scoreChat,
    sourceConst: 'SCORE_USER_TASK',
    hotReload: 'immediate',
    editable: true,
    checks: [
      { kind: 'nonEmpty' },
      {
        kind: 'slots',
        tokens: ['k'],
        why: '它是"本次最多选几条"的可配数字，由程序填；删掉模型就不知道上限，也不会去排序取舍',
      },
    ],
  },
  {
    key: 'score:pick-principle',
    injectMode: '子代理请求的 system（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.scoreChat,
    sourceConst: 'SCORE_PICK_PRINCIPLE',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'score:index-range',
    injectMode: '子代理请求的 system（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.scoreChat,
    sourceConst: 'SCORE_INDEX_RANGE',
    hotReload: 'immediate',
    editable: true,
    checks: [
      { kind: 'nonEmpty' },
      {
        kind: 'slots',
        tokens: ['n'],
        why: '它是候选条数（每轮都变），由程序填；删掉模型就不知道合法编号范围',
      },
    ],
  },
  {
    key: 'score:pool-header',
    injectMode: '子代理请求的 system（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.scoreChat,
    sourceConst: 'SCORE_POOL_HEADER',
    hotReload: 'immediate',
    editable: true,
    checks: [
      { kind: 'nonEmpty' },
      {
        kind: 'slots',
        tokens: ['n'],
        why: '它是候选条数，由程序填；删掉表头就无法把下文识别成清单',
      },
    ],
  },
  {
    key: 'score:jev-instruction',
    injectMode: 'JEV 请求的 questions[].instructions（不进主会话）',
    breaksCache: 'na',
    sourceFile: 'src/score-turn.ts',
      sourceConst: 'JEV_SCORE_INSTRUCTION',
    hotReload: 'immediate',
    editable: true,
    // 🔴 **必须英文**：与主动注入那四条同因 —— 中文会让 JEV 分值分布压平、分辨力归零。
    checks: [{ kind: 'nonEmpty' }, { kind: 'englishOnly' }],
  },
  {
    key: 'tag:system',
    injectMode: '子代理请求的提示词（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.tagNorm,
      sourceConst: 'ADJUDICATE_SYSTEM',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'translate:mt',
    injectMode: '翻译请求的提示词（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.enIndex,
      sourceConst: 'MT_SYS',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'translate:mt-strong',
    injectMode: '翻译请求的提示词（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.enIndex,
      sourceConst: 'MT_SYS_STRONG',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'translate:instruct',
    injectMode: '翻译请求的提示词（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.enIndex,
      sourceConst: 'INSTRUCT_SYS',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'tag:translate-system',
    injectMode: '子代理请求的提示词（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.tagNorm,
      sourceConst: 'TRANSLATE_SYSTEM',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  // ⭐⭐⭐ `memj_snapshots` 返回值末尾的判据句（2026-10-12 新增）。
  //    🔴 它**逐字附在工具的返回值里**，是模型"要不要把某条快照当跨项目证据"的
  //      唯一判据来源 ⇒ 措辞一松就会拿无关知识去凑主题证据（本项目记过这个真实事故）。
  {
    key: 'reads:snapshot-closing',
    injectMode: '工具返回值（进模型上下文；不进 node 0、不破前缀缓存）',
    breaksCache: 'no',
    sourceFile: F.reads,
    sourceConst: 'SNAPSHOT_CLOSING',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },

  // ⚠️⚠️ **决策 209（2026-10-05）：`tpl:guidance-*` 五条已退役三条。**
  //    规范不再住"文档末尾那一节"，而是**长在各节自己身上**
  //    （`## 节名` 下的 ```memj:spec 围栏，形态由代码生成、**不过提示词**）
  //    ⇒ ⭐ 顺带消灭了当年的坑：**用户把外壳改坏 ⇒ 反解静默失效**（现在改不了）。
  //    🔴 **退役的 key 仍然登记**（不能删）：用户可能在设置页改过它们，
  //       删 key 会让那份覆盖变成**孤儿**（页面上看不到、也删不掉）。
  {
    key: 'tpl:guidance-head',
    injectMode: '⚠️ 已退役（决策 209）——不再有消费者，保留登记以免旧覆盖变孤儿',
    breaksCache: 'no',
    sourceFile: F.templates,
    sourceConst: 'TPL_GUIDANCE_HEAD',
    hotReload: 'immediate',
    editable: true,
    checks: [
      { kind: 'nonEmpty' },
      { kind: 'slots', tokens: ['count'], why: '它是这份文档的节数，由程序填；删掉模型就不知道有几节' },
    ],
  },
  {
    key: 'tpl:guidance-row',
    injectMode: '⚠️ 已退役（决策 209）——规范块的形态改由代码生成，不再走提示词',
    breaksCache: 'no',
    sourceFile: F.templates,
    sourceConst: 'TPL_GUIDANCE_ROW',
    hotReload: 'immediate',
    editable: true,
    checks: [
      { kind: 'nonEmpty' },
      {
        kind: 'slots',
        tokens: ['name', 'desc', 'trunc'],
        why: '节名与"这一节要干嘛"是用户自己在模板页写的、trunc 是可截断标记；删掉就等于不告诉模型该写什么',
      },
    ],
  },
  {
    key: 'tpl:guidance-trunc-mark',
    injectMode: '⚠️ **只剩兼容读**（决策 209）：只服务"规范还在末尾那一节"的存量文档',
    breaksCache: 'no',
    sourceFile: F.templates,
    sourceConst: 'TPL_GUIDANCE_TRUNC_MARK',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'tpl:guidance-no-trunc',
    injectMode: '建项目回执（"本模板没有可截断的节"那句警告）',
    breaksCache: 'no',
    sourceFile: F.templates,
    sourceConst: 'TPL_GUIDANCE_NO_TRUNC',
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'tpl:guidance-foot',
    injectMode: '⚠️ 已退役（决策 209）——那句话改由回执报，不再写进文档',
    breaksCache: 'no',
    sourceFile: F.templates,
    sourceConst: 'TPL_GUIDANCE_FOOT',
    hotReload: 'immediate',
    editable: true,
    checks: [
      { kind: 'nonEmpty' },
      {
        kind: 'slots',
        tokens: ['knowledgeTitle'],
        why: '那是「沉淀知识」这个钉死的节名（来自 sections.ts），由程序填；写死会与服务端常量漂开',
      },
    ],
  },
]

// ══════════════════════════════════════════════════════════════════════
// ⭐⭐⭐ **把人读文案从目录注入**（2026-10-12）
//
// 🔴 **为什么用注入而不是让每条 spec 自己写**：`prompt-catalog.ts` 是**唯一出处**，
//   而本模块是**程序语义**。分开之后：
//     · 加一条 spec 却忘了写说明 ⇒ **检查脚本能报红**（以前做不到）；
//     · 改文案不必碰程序逻辑。
// ⚠️ **代价**：`PROMPT_SPECS` 由"纯字面量数组"变成"派生数组" ⇒ 静态扫源码看不出内容；
//   本项目已有先例（`TOOL_META.flatMap` 派生的那些），照旧。
// ══════════════════════════════════════════════════════════════════════

/**
 * 给每条 spec 从目录补上 `zone` / `purpose` / `owner`。
 *
 * ⚠️ **目录里没有的 key**：**不报错**（避免运行时炸），但会补一句显眼的占位说明，
 *   并由 `scripts/check-prompt-specs.mjs` 的**检查 ④**在套件里报红。
 * @param specs - 原始 spec 列表。
 * @returns 补齐后的列表（顺序不变）。
 */
function withCatalog(specs: readonly PromptSpec[]): readonly PromptSpec[] {
  return specs.map((s): PromptSpec => {
    const c = PROMPT_CATALOG[s.key]
    if (c === undefined) {
      return { ...s, zone: 'tools', purpose: '（未登记说明）', owner: '（未登记）' }
    }
    return { ...s, zone: c.group, purpose: c.purpose, owner: c.owner }
  })
}

/** ⭐ 【提示词】页的账本：**程序语义 + 目录文案**的合成结果。 */
export const PROMPT_SPECS: readonly PromptSpec[] = withCatalog(PROMPT_SPECS_RAW)


/** 按键取元数据。 */
export function specOf(key: string): PromptSpec | undefined {
  return PROMPT_SPECS.find((s) => s.key === key)
}

// ══════════════════════════════════════════════════════════════════════
// 覆盖层：内存缓存 + 读写
// ══════════════════════════════════════════════════════════════════════

/**
 * ⭐⭐ **覆盖值的同步缓存**（`promptText` 靠它）。
 *
 * 🔴 **为什么必须有**：取值点在 DSH 装配路径上（`text: () => …` / getter），
 *    **不允许 async**。⇒ 磁盘只在 `load`/`save` 时读，运行期走内存。
 */
let cache = new Map<string, string>()

/**
 * ⭐ **覆盖时间的同步副本**（展示用；与 `cache` 一起装载）。
 *
 * ⚠️ **与 `cache` 分开存**：`cache` 是**装配路径**要的（只要文本），
 *    而时间是**给人看**的。两者一起刷，避免"文本更新了、时间还是旧的"。
 */
let updatedAtCache = new Map<string, string>()

/** 空覆盖表。 */
export function emptyOverrides(): PromptOverrides {
  return { version: PROMPT_OVERRIDES_VERSION, overrides: {} }
}

/**
 * **读覆盖表**（容错：任何异常回空表）。
 *
 * ⚠️ 与 `hot-score-store` 同一纪律：**坏文件不该让功能整个挂掉**；
 *    但也不静默改语义——版本不符就当空表（宁可回默认值，也不用结构不明的表）。
 * @returns 覆盖表。
 */
export async function loadPromptOverrides(): Promise<PromptOverrides> {
  try {
    const text = await readFile(promptOverridesPath(), 'utf8')
    const parsed = JSON.parse(text) as Partial<PromptOverrides>
    if (parsed?.version !== PROMPT_OVERRIDES_VERSION) return emptyOverrides()
    if (parsed.overrides === null || typeof parsed.overrides !== 'object') return emptyOverrides()
    const out = emptyOverrides()
    for (const [k, v] of Object.entries(parsed.overrides)) {
      if (v !== null && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string') {
        out.overrides[k] = {
          text: (v as { text: string }).text,
          updatedAt: typeof (v as { updatedAt?: unknown }).updatedAt === 'string' ? (v as { updatedAt: string }).updatedAt : '',
        }
      }
    }
    return out
  } catch {
    return emptyOverrides()
  }
}

/** **原子写**覆盖表。 */
export async function savePromptOverrides(o: PromptOverrides): Promise<void> {
  await mkdir(promptsDir(), { recursive: true })
  await writeTextAtomic(promptOverridesPath(), JSON.stringify(o, null, 1))
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
export function refreshPromptCacheSync(): number {
  try {
    const text = readFileSync(promptOverridesPath(), 'utf8')
    const parsed = JSON.parse(text) as Partial<PromptOverrides>
    if (parsed?.version !== PROMPT_OVERRIDES_VERSION) { clearCaches(); return 0 }
    if (parsed.overrides === null || typeof parsed.overrides !== 'object') { clearCaches(); return 0 }
    const next = new Map<string, string>()
    const nextAt = new Map<string, string>()
    for (const [k, v] of Object.entries(parsed.overrides)) {
      if (v !== null && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string') {
        next.set(k, (v as { text: string }).text)
        const at = (v as { updatedAt?: unknown }).updatedAt
        if (typeof at === 'string' && at !== '') nextAt.set(k, at)
      }
    }
    cache = next
    updatedAtCache = nextAt
    return next.size
  } catch {
    clearCaches()
    return 0
  }
}

/**
 * ⭐⭐⭐ **把覆盖表读进内存**（保存后刷新）。
 *
 * ⚠️ **写入失败不抛给调用方的主流程**：缓存刷不上只是"本次没生效"，
 *    不该让一次保存把整个插件弄崩（照 recall-log 的纪律）。
 * @returns 装载的条数（诊断用）。
 */
export async function refreshPromptCache(): Promise<number> {
  const o = await loadPromptOverrides()
  const next = new Map<string, string>()
  const nextAt = new Map<string, string>()
  for (const [k, v] of Object.entries(o.overrides)) {
    next.set(k, v.text)
    if (v.updatedAt !== '') nextAt.set(k, v.updatedAt)
  }
  cache = next
  updatedAtCache = nextAt
  return next.size
}

/** 两个缓存一起清（**必须成对** —— 只清一个会让时间与文本对不上）。 */
function clearCaches(): void {
  cache = new Map()
  updatedAtCache = new Map()
}

/** 清空内存缓存（测试用）。 */
export function resetPromptCache(): void {
  clearCaches()
}

/** 直接注入缓存（测试用：免磁盘）。 */
export function setPromptCacheForTest(entries: Record<string, string>): void {
  cache = new Map(Object.entries(entries))
  updatedAtCache = new Map()
}

/**
 * ⭐⭐⭐ **取一条提示词的当前值**（覆盖值优先，否则用调用方给的源码常量）。
 *
 * 这是**所有取值点唯一该调的入口**。
 * @param key - 稳定键（见 `PROMPT_SPECS`）。
 * @param fallback - **调用方自己的源码常量**（即"默认值"；恢复默认 = 删覆盖项）。
 * @returns 该生效的文本。
 */
export function promptText(key: string, fallback: string): string {
  const v = cache.get(key)
  return v === undefined ? fallback : v
}

/** 该键是否被覆盖（展示用）。 */
export function hasOverride(key: string): boolean {
  return cache.has(key)
}

/**
 * **取该键被覆盖的时间**（展示用）；未被覆盖时回 `''`。
 *
 * 🔴 **为什么要单独存一份时间**：`cache` 只存文本（那是装配路径要的）；而界面上
 *    "这是什么时候改的"必须如实显示 —— ⚠️ 我第一版在 API 里硬写了 `updatedAt: ''`，
 *    那是**界面在撒谎**（明明有值却说没有），本项目不允许。
 */
export function overrideUpdatedAt(key: string): string {
  return updatedAtCache.get(key) ?? ''
}

/** 当前全部覆盖键（展示用）。 */
export function overriddenKeys(): string[] {
  return [...cache.keys()]
}

// ══════════════════════════════════════════════════════════════════════
// 默认值登记（供展示页对照"改了什么"与"恢复默认"）
// ══════════════════════════════════════════════════════════════════════

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
const defaults = new Map<string, string>()

/**
 * **登记一条默认文本**（各模块加载时调；重复登记以最后为准）。
 * @param key - 稳定键。
 * @param text - 源码常量（默认值）。
 */
export function registerPromptDefault(key: string, text: string): void {
  defaults.set(key, text)
}

/** 取默认文本（展示用）；未登记时 `undefined`。 */
export function promptDefault(key: string): string | undefined {
  return defaults.get(key)
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
export function registeredPromptKeys(): string[] {
  return [...defaults.keys()]
}

/** 当前生效文本（展示用：覆盖优先，否则默认）。 */
export function promptCurrent(key: string): string {
  return promptText(key, defaults.get(key) ?? '')
}

// ══════════════════════════════════════════════════════════════════════
// 校验
// ══════════════════════════════════════════════════════════════════════

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
export function checkNoDshVariables(text: string): string[] {
  const hits = [...text.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[0])
  if (hits.length === 0) return []
  const uniq = [...new Set(hits)].slice(0, 5)
  return [
    `文本里有 ${hits.length} 处 \`{{…}}\`（如 ${uniq.join('、')}）——` +
      '**DSH 会把这段再解析一遍**，它的变量名只允许小写开头、且必须已注册，' +
      '否则**会话装配直接抛异常**。' +
      // ⚠️ 提示里的标记用**拼接**写 —— 直接在字符串里放 HTML 注释会被 .mjs 解析器拒（本脚本踩过）。
      'memj 自己的占位请改用 HTML 注释标记（<' + '!--memj:kind-catalog--' + '>）。',
  ]
}

export function validatePrompt(key: string, text: string): string[] {
  const spec = specOf(key)
  if (spec === undefined) return [`未知的提示词键：${key}`]
  if (!spec.editable) return [`${key} 是只读项${spec.readonlyWhy !== undefined ? `（${spec.readonlyWhy}）` : ''}`]
  const out: string[] = []
  /**
   * 🔴🔴 **只有"交给 DSH 的通道"才禁 `{{…}}`**（决策 217，**踩崩一次换来的**）。
   *
   * ⚠️⚠️ **范围必须精确 —— 我第一版设成全局，当场误伤了两条合法条目**：
   *   `handoff:prompt-steps` / `handoff:prompt-note` 的 `{{steps}}` / `{{userNote}}`
   *   走的是**命令注入**（memj 自己 `fillSlots` 填），**不过 DSH 的 `interpolate()`**
   *   ⇒ 它们**本来就合法**。被 `check-prompt-specs` 的"默认值必须过自己的校验"当场抓到。
   *
   * ⭐ **判据：一条规则该管的范围，取决于【谁还会再解析这段文本】，而不是文本本身。**
   *   本项目的通道分工：
   *   · **交给 DSH**（会被它再解析 `{{}}`）⇒ `section()` / `context()` / 工具描述
   *     —— 这几条**禁 `{{}}`**，占位用 HTML 注释标记。
   *   · **memj 自填**（命令注入）⇒ `command:*` / `handoff:prompt-*` / `score:*` 等
   *     —— 那些 `{{}}` 是 memj 自己的插槽，**合法且必须留着**。
   */
  const dshOwned =
    spec.injectMode.includes('systemPrompt.') || spec.injectMode.includes('wire `tools`')
  if (dshOwned) out.push(...checkNoDshVariables(text))
  for (const c of spec.checks) {
    if (c.kind === 'nonEmpty') {
      if (text.trim() === '') out.push('内容不能为空。')
    } else if (c.kind === 'maxChars') {
      if (text.length > c.max) out.push(`超过预算：当前 ${text.length} 字符，上限 ${c.max}（${c.why}）。`)
    } else if (c.kind === 'englishOnly') {
      // ⚠️ 判据要"合身"：中文字符（含全角标点）出现即违规；
      //    ⚠️ **不要**用"非 ASCII 即违规" —— 那会把引号、破折号也判违规。
      const cjk = text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g)
      if (cjk !== null && cjk.length > 0) {
        out.push(`必须全英文（检测到 ${cjk.length} 个中文字符/全角标点）。中文会让 JEV 分值分布压平、分辨力归零。`)
      }
    } else if (c.kind === 'fencesBalanced') {
      const n = (text.match(/^```/gm) ?? []).length
      if (n % 2 !== 0) out.push(`markdown 围栏不成对（检测到 ${n} 个 \`\`\`，必须是偶数）。`)
    } else if (c.kind === 'slots') {
      // ⭐⭐⭐ **双向校验**（2026-10-12）：缺一个不行，多一个也不行。
      //    🔴 **两侧的失败都是静默的**，所以必须机械判：
      //      · 少一个登记的插槽 ⇒ 那个值**再也进不去**（模型看到一句没有主语的残句）；
      //      · 多一个没登记的插槽 ⇒ `fillSlots` 不认识它 ⇒ **原样发给模型**（`{{xxx}}`）。
      const present = new Set(slotNames(text))
      const missing = c.tokens.filter((t) => !present.has(t))
      if (missing.length > 0) {
        out.push(
          `缺少必须保留的变量插槽：${missing.map((t) => `{{${t}}}`).join('、')}（${c.why}）。` +
            '这些位置由程序填运行时值——删掉它们那些值就再也传不进提示词了（且不会报错）。',
        )
      }
      const unknown = [...present].filter((t) => !c.tokens.includes(t))
      if (unknown.length > 0) {
        out.push(
          `出现了未登记的变量插槽：${unknown.map((t) => `{{${t}}}`).join('、')}。` +
            `它不会被替换、会**原样发给模型**。本条目可用的插槽只有：${c.tokens.map((t) => `{{${t}}}`).join('、')}。`,
        )
      }
    }
  }
  return out
}

/** 插槽名字符集（`{{名字}}`：字母、数字、下划线；**不含**空格与中文，避免误吞正文）。 */
const SLOT_RE = /\{\{([A-Za-z0-9_]+)\}\}/g

/**
 * ⭐⭐⭐ **取出文本里出现的全部插槽名**（去重）。
 *
 * ⚠️ **字符集刻意收窄**（`[A-Za-z0-9_]`）：提示词正文里本来就有大量 `{` `}`
 *    （如 JSON 示例 `{"picks":[]}`）⇒ 若允许空格/中文，`{ 编号 }` 这类**正常正文**
 *    会被误认成插槽，导致保存被无故拒绝。
 * @param text - 待扫描文本。
 * @returns 插槽名（出现顺序、已去重）。
 */
export function slotNames(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(SLOT_RE)) {
    const name = m[1] ?? ''
    if (name !== '' && !out.includes(name)) out.push(name)
  }
  return out
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
export function fillSlots(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(SLOT_RE, (whole, name: string) => vars[name] ?? whole)
}

// ══════════════════════════════════════════════════════════════════════
// 保存 / 恢复默认 / 历史
// ══════════════════════════════════════════════════════════════════════

/** 保存结果。 */
export interface SavePromptResult {
  ok: boolean
  /** 失败原因（`ok:false` 时非空）。 */
  errors: readonly string[]
  /** 是否写盘成功（校验通过但写盘失败时 `ok:false` 且这里为 false）。 */
  saved: boolean
  /** 备份文件的绝对路径（写了才有）。 */
  backupPath?: string
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
async function writeHistoryBackup(key: string, text: string): Promise<string> {
  await mkdir(promptHistoryDir(), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const base = `${safeName(key)}-${stamp}`
  let path = join(promptHistoryDir(), `${base}.txt`)
  for (let n = 2; existsSync(path) && n < 100; n += 1) {
    path = join(promptHistoryDir(), `${base}-${n}.txt`)
  }
  await writeFile(path, text, 'utf8')
  return path
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
export async function savePromptOverride(key: string, text: string): Promise<SavePromptResult> {
  const errors = validatePrompt(key, text)
  if (errors.length > 0) return { ok: false, errors, saved: false }

  let backupPath: string | undefined
  try {
    // ① 备份**旧值**（有覆盖才备份；"即将被覆盖的默认值"没有备份意义 ⇒ 跳过）
    const cur = await loadPromptOverrides()
    const old = cur.overrides[key]
    if (old !== undefined && old.text !== text) {
      backupPath = await writeHistoryBackup(key, old.text)
    }
    // ② 写新值
    cur.overrides[key] = { text, updatedAt: new Date().toISOString() }
    await savePromptOverrides(cur)
    // ③ 刷内存缓存（**必须** —— 否则取值点读到的还是旧值）
    await refreshPromptCache()
    return { ok: true, errors: [], saved: true, ...(backupPath !== undefined ? { backupPath } : {}) }
  } catch (err) {
    return { ok: false, errors: [`写盘失败：${err instanceof Error ? err.message : String(err)}`], saved: false }
  }
}

/**
 * ⭐ **恢复默认**（删掉覆盖项 ⇒ 自动回落到源码常量）。
 * @param key - 稳定键。
 * @returns 保存结果（`saved` 表示是否真的写了盘）。
 */
export async function resetPromptOverride(key: string): Promise<SavePromptResult> {
  try {
    const cur = await loadPromptOverrides()
    if (cur.overrides[key] === undefined) {
      return { ok: true, errors: [], saved: false }
    }
    // 备份被丢弃的那一版（可回退"恢复到覆盖值之前"）
    const backupPath = await writeHistoryBackup(key, cur.overrides[key].text)
    delete cur.overrides[key]
    await savePromptOverrides(cur)
    await refreshPromptCache()
    return { ok: true, errors: [], saved: true, backupPath }
  } catch (err) {
    return { ok: false, errors: [`写盘失败：${err instanceof Error ? err.message : String(err)}`], saved: false }
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
export async function restorePromptHistory(key: string, fileName: string): Promise<SavePromptResult> {
  const text = await readPromptHistory(fileName)
  if (text === undefined) return { ok: false, errors: ['读不到该历史版本（文件名不对或已被清理）'], saved: false }
  // ⭐ 走与保存**同一条路径**（含校验与备份）—— 这是本节开头那条判据的落地。
  return savePromptOverride(key, text)
}

/**
 * **列某条提示词的历史版本**（倒序，最新在前）。
 * @param key - 稳定键。
 * @returns 文件名列表（不含目录）。
 */
export async function listPromptHistory(key: string): Promise<string[]> {
  try {
    const dir = promptHistoryDir()
    const files = await readdir(dir)
    const prefix = `${safeName(key)}-`
    return files.filter((f) => f.startsWith(prefix) && f.endsWith('.txt')).sort().reverse()
  } catch {
    return []
  }
}

/**
 * **读某一版历史**。
 * @param fileName - `listPromptHistory` 给的文件名。
 * @returns 文本；读不到回 `undefined`。
 */
export async function readPromptHistory(fileName: string): Promise<string | undefined> {
  try {
    // 🔴 **防路径穿越**：只接受 basename，绝不接受带分隔符的输入。
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) return undefined
    return await readFile(join(promptHistoryDir(), fileName), 'utf8')
  } catch {
    return undefined
  }
}

/**
 * **删掉全部历史**（人侧"清理历史"用；⚠️ 不删覆盖表）。
 * @returns 删掉的条数。
 */
export async function clearPromptHistory(): Promise<number> {
  try {
    const dir = promptHistoryDir()
    const files = await readdir(dir)
    let n = 0
    for (const f of files) {
      await rm(join(dir, f), { force: true })
      n += 1
    }
    return n
  } catch {
    return 0
  }
}
