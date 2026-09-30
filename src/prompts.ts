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

/** 覆盖文件结构版本（结构变了就升它 ⇒ 旧文件当空表，不猜）。 */
export const PROMPT_OVERRIDES_VERSION = 1

/** 覆盖表：`key → { text, updatedAt }`。 */
export interface PromptOverrides {
  version: number
  overrides: Record<string, { text: string; updatedAt: string }>
}

/**
 * **三个分区**（用户 2026-09-29 确认）。
 *
 * 🔴 **为什么按"生效方式/影响面"分，而不是按功能分**：
 *    A 区改了**全废前缀缓存**、B 区工具描述同样全废、C 区**下次调用即生效且与主会话无关**。
 *    混排会让"改完立刻生效"这个预期出错。
 */
export type PromptZone = 'resident' | 'tools' | 'internal'

/**
 * **热生效判定**（探针实测后的三档）。
 *
 * ⚠️ 这一列**必须如实**——它是本页最容易被误解的信息。
 */
export type HotReload =
  /** 保存后下一轮即生效（覆盖层支撑）。 */
  | 'immediate'
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
  zone: PromptZone
  /** 干什么（一句话）。 */
  purpose: string
  /** 属于哪个工具 / 功能（展示用）。 */
  owner: string
  /** 注入方式（落点）。 */
  injectMode: string
  /** 是否破前缀缓存。 */
  breaksCache: 'yes' | 'no' | 'na'
  /** 具体写在哪个文件里（相对插件仓根）。 */
  sourceFile: string
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
  hotInject: 'src/hot-inject.ts',
  recall: 'src/active-recall.ts',
  scoreChat: 'src/score-chat.ts',
  tagNorm: 'src/tag-normalize.ts',
  enIndex: 'src/en-index.ts',
} as const

/** 十个工具的展示名（元数据用）。 */
const TOOL_META: ReadonlyArray<{ name: string; purpose: string; owner: string }> = [
  { name: 'memj_info', purpose: '列出库里的项目与主题（语境入口，不返回知识条目）', owner: 'memj_info' },
  { name: 'memj_search', purpose: '按项目/主题/检索词筛封面（只找，不回正文）', owner: 'memj_search' },
  { name: 'memj_read', purpose: '按 id 读知识正文或项目交接文档（只读）', owner: 'memj_read' },
  { name: 'memj_snapshots', purpose: '读本会话的读快照清单（跨项目证据来源）', owner: 'memj_snapshots' },
  { name: 'memj_handoff', purpose: '写叙事 + 沉淀知识 + 归属推进（写入主入口）', owner: 'memj_handoff' },
  { name: 'memj_promote', purpose: '事后增删主题归属 / 改封面字段 / 提名全局', owner: 'memj_promote' },
  { name: 'memj_update', purpose: '更新一条已有知识的正文与封面字段', owner: 'memj_update' },
  { name: 'memj_rebuild', purpose: '重建派生层 + 封面体检（人侧也调它）', owner: 'memj_rebuild' },
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
 * ⭐⭐⭐ **全部提示词的静态元数据**（唯一一份）。
 *
 * 🔴 **加新提示词时改这里** —— 它是【提示词】页的账本；
 * ⚠️ 装配侧也要同步接上取值（见各调用点的 `promptText(key, fallback)`）。
 */
export const PROMPT_SPECS: readonly PromptSpec[] = [
  // ── A 区：常驻文本 ──
  {
    key: 'section:memj:protocol',
    zone: 'resident',
    purpose: '记忆协议全文：何时查 / 何时写 / 推进归属 / 边界。每轮常驻。',
    owner: '系统提示词通道（section）',
    injectMode: 'systemPrompt.section() —— system 角色，独占 node 0',
    breaksCache: 'yes',
    sourceFile: F.protocol,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }, { kind: 'maxChars', max: 2500, why: '协议预算 2500（越了要压缩，别抬阈值）' }, { kind: 'fencesBalanced' }],
  },
  {
    key: 'context:memj:usage-guidance',
    zone: 'resident',
    purpose: '使用指导：触发条件表、项目判定、挂靠判据、写作要求等（13 块）。每轮常驻。',
    owner: '运行时上下文通道（context）',
    injectMode: 'systemPrompt.context() —— user 角色，尾部 append',
    breaksCache: 'no',
    sourceFile: F.context,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }, { kind: 'fencesBalanced' }],
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
      zone: 'tools',
      purpose: t.purpose,
      owner: t.name,
      injectMode: 'wire `tools` 段的工具 description',
      breaksCache: 'yes',
      sourceFile: F.descriptions,
      hotReload: 'immediate',
      editable: true,
      checks: [{ kind: 'nonEmpty' }],
    },
    {
      key: `tool:${t.name}:parameters`,
      zone: 'tools',
      purpose: `${t.name} 的参数 schema（模型据此决定怎么调它）`,
      owner: t.name,
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
      zone: 'tools',
      purpose: `${t.name} 的返回值 schema（运行时强校验，additionalProperties: false）`,
      owner: t.name,
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
  //    ⇒ ⭐ **如实标只读**：宁可说清"它不可改"，也不要给一个改了不生效的输入框
  //      （本项目反复强调：界面不许撒谎）。
  ...CMD_META.map(
    (c): PromptSpec => ({
      key: `command:${c.name}:description`,
      zone: 'tools',
      purpose: c.purpose,
      owner: `/\\${c.name}`,
      injectMode: '命令描述符（消费方是界面/协议，不进模型上下文）',
      breaksCache: 'no',
      sourceFile: F.commands,
      hotReload: 'readonly',
      editable: false,
      readonlyWhy:
        '实测不可热更新：dsh-commands 在注册时就把描述 freeze 进 descriptor，注册后修改无效；' +
        '且它不进模型上下文（只用于界面展示）⇒ 改了也不会改变模型行为。',
      checks: [],
    }),
  ),

  // ── B 区：手写提示词（无生成器、无校验的那两类）──
  {
    key: 'inject:closing',
    zone: 'tools',
    purpose: '「取交接」注入文本的收尾指令：禁止写库/改文档，只允许告知下一步然后停下',
    owner: '/memj-get-handoff-*（两个命令共用）',
    injectMode: '命令 followup 注入文本的末尾',
    breaksCache: 'no',
    sourceFile: F.inject,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'handoff:prompt',
    zone: 'tools',
    purpose: 'handoff 命令的规范提示词（让模型按六节流程做一次交接）',
    owner: '/memj-handoff',
    injectMode: '命令 followup 注入（会唤醒模型）',
    breaksCache: 'no',
    sourceFile: F.commands,
    hotReload: 'readonly',
    editable: false,
    readonlyWhy:
      '它是**参数化模板**：正文里要按用户补充的话/分步参数拼出不同分支，' +
      '不是一段可整体替换的常量 ⇒ 开放编辑会让分支逻辑与文本脱节。' +
      '要改措辞请改源码（本页只展示它的固定骨架）。',
    checks: [],
  },

  // ── C 区：插件内部调 LLM 的提示词 ──
  {
    key: 'jev:candidate',
    zone: 'internal',
    purpose: '逐条候选打 noul 分：判断它是否直接帮到当前这一步',
    owner: '主动注入 · JEV 通路',
    injectMode: 'JEV 请求的 questions[].instructions（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.recall,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }, { kind: 'englishOnly' }],
  },
  {
    key: 'jev:need',
    zone: 'internal',
    purpose: '需求门：当前上下文是否需要外部知识',
    owner: '主动注入 · JEV 通路',
    injectMode: 'JEV 请求的 questions.need.instructions',
    breaksCache: 'na',
    sourceFile: F.recall,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }, { kind: 'englishOnly' }],
  },
  {
    key: 'jev:sufficient',
    zone: 'internal',
    purpose: '充足门：上下文里已有的知识是否已经够用',
    owner: '主动注入 · JEV 通路',
    injectMode: 'JEV 请求的 questions.sufficient.instructions',
    breaksCache: 'na',
    sourceFile: F.recall,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }, { kind: 'englishOnly' }],
  },
  {
    key: 'jev:search-intent',
    zone: 'internal',
    purpose: '意图门：模型是否明确打算调 memj_search / memj_info（命中则不注入）',
    owner: '主动注入 · JEV 通路',
    injectMode: 'JEV 请求的 questions.search_intent.instructions',
    breaksCache: 'na',
    sourceFile: F.recall,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }, { kind: 'englishOnly' }],
  },
  {
    key: 'active:closing',
    zone: 'internal',
    purpose: '主动注入文本的收尾指令',
    owner: '主动注入',
    injectMode: '注入进主会话（pre-step 的 user 消息）',
    breaksCache: 'no',
    sourceFile: F.recall,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'hot:closing',
    zone: 'internal',
    purpose: '热知识（meta 段）收尾：告知按需 memj_read 取正文、禁止客套',
    owner: '热知识注入',
    injectMode: '注入进主会话（每轮的背景消息）',
    breaksCache: 'no',
    sourceFile: F.hotInject,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'hot:body-closing',
    zone: 'internal',
    purpose: '热知识（正文段）收尾：说清性质（不是任务）+ 唯一动作（继续当前工作）',
    owner: '热知识注入',
    injectMode: '注入进主会话（补注时单独一条消息）',
    breaksCache: 'no',
    sourceFile: F.hotInject,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'score:system',
    zone: 'internal',
    purpose: '轮末复盘的判断要求与输出格式（挑出能帮上忙的知识 + 原句引文硬要求）',
    owner: '知识评分 · chat 通路',
    injectMode: '子代理请求的 system（含知识库清单，不进主会话）',
    breaksCache: 'na',
    sourceFile: F.scoreChat,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'score:jev-instruction',
    zone: 'internal',
    purpose: '轮末复盘的提问（JEV 通路；⚠️ 与主动注入那四条 jev:* 不是一回事）',
    owner: '知识评分 · JEV 通路',
    injectMode: 'JEV 请求的 questions[].instructions（不进主会话）',
    breaksCache: 'na',
    sourceFile: 'src/score-turn.ts',
    hotReload: 'immediate',
    editable: true,
    // 🔴 **必须英文**：与主动注入那四条同因 —— 中文会让 JEV 分值分布压平、分辨力归零。
    checks: [{ kind: 'nonEmpty' }, { kind: 'englishOnly' }],
  },
  {
    key: 'tag:system',
    zone: 'internal',
    purpose: '标签裁决的规则与输出格式（合并/新增/丢弃/retag，必须给理由）',
    owner: '标签规范化',
    injectMode: '子代理请求的提示词（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.tagNorm,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'translate:mt',
    zone: 'internal',
    purpose: '翻译第①级：编号 + 空行分隔（实测比强指令更有效）',
    owner: '英文召回索引 · 翻译',
    injectMode: '翻译请求的提示词（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.enIndex,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'translate:mt-strong',
    zone: 'internal',
    purpose: '翻译第②级：强指令（明确要求两行、不许合并）',
    owner: '英文召回索引 · 翻译',
    injectMode: '翻译请求的提示词（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.enIndex,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'translate:instruct',
    zone: 'internal',
    purpose: '翻译第③级 / instruct 模板：要 JSON（⚠️ 与解析器配对 —— 改提示词可以，改输出形态会让解析器失败）',
    owner: '英文召回索引 · 翻译',
    injectMode: '翻译请求的提示词（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.enIndex,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
  {
    key: 'tag:translate-system',
    zone: 'internal',
    purpose: '标签英文化（C 层）：把中文 tag 译成英文规范词，要 JSON',
    owner: '标签规范化',
    injectMode: '子代理请求的提示词（不进主会话）',
    breaksCache: 'na',
    sourceFile: F.tagNorm,
    hotReload: 'immediate',
    editable: true,
    checks: [{ kind: 'nonEmpty' }],
  },
]

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
export function validatePrompt(key: string, text: string): string[] {
  const spec = specOf(key)
  if (spec === undefined) return [`未知的提示词键：${key}`]
  if (!spec.editable) return [`${key} 是只读项${spec.readonlyWhy !== undefined ? `（${spec.readonlyWhy}）` : ''}`]
  const out: string[] = []
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
    }
  }
  return out
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
