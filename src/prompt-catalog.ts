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
export type PromptGroup =
  | 'resident'
  | 'tools'
  | 'commands'
  | 'actions'
  | 'hot'
  | 'recall'
  | 'score'
  | 'tags'
  | 'translate'
  | 'templates'

/** 一个分组的展示信息。 */
export interface PromptGroupInfo {
  /** 组标题（页面上那一栏的名字）。 */
  title: string
  /** ⭐ **一句话说清这组是给谁看的、什么时候看**（页面显示在组标题下方）。 */
  about: string
  /** 排序权重（小的在前）。 */
  order: number
}

/**
 * ⭐ **分组表**（顺序即页面顺序）。
 *
 * ⚠️ **轴是"谁看 / 何时看"**，不是"代码在哪个文件"。改这个轴会让页面重新变得难懂，
 *    故在此显式声明理由。
 */
export const PROMPT_GROUPS: Readonly<Record<PromptGroup, PromptGroupInfo>> = {
  resident: {
    title: '① 每轮常驻',
    about: '模型每一轮对话都会读到的两段。协议是"总纲"，使用指导是"操作手册"。',
    order: 10,
  },
  tools: {
    title: '② 工具说明书',
    about: '模型据此决定"该不该调这个工具、怎么调"。每个工具含三部分：说明书（可改）+ 参数表 + 返回格式（后两者是契约，只读）。',
    order: 20,
  },
  commands: {
    title: '③ 斜杠命令（给人看的）',
    about: '你打 / 时菜单里显示的文字。⚠️ 模型看不到这些，改它们只影响你自己的使用体验。',
    order: 30,
  },
  actions: {
    title: '④ 命令触发时注入给模型的',
    about: '你打了某个命令后，插件把这段文字送进会话，让模型知道要做什么。',
    order: 40,
  },
  hot: {
    title: '⑤ 每轮自动注入的热知识',
    about: '插件自动把"跟你当前项目相关的知识"塞进每一轮对话，这些是那段文本的固定片段。',
    order: 50,
  },
  recall: {
    title: '⑥ 主动召回（插件内部判断）',
    about: '⚠️ 模型看不到这些。它们发给一个专门的判定模型（JEV），用来判断"现在要不要帮模型找知识"。',
    order: 60,
  },
  score: {
    title: '⑦ 轮末知识评分（子代理）',
    about: '⚠️ 模型看不到这些。每轮结束后，插件起一个子代理回顾这一轮，给"本来能帮上忙"的知识加分。',
    order: 70,
  },
  tags: {
    title: '⑧ 标签规范化（子代理）',
    about: '⚠️ 模型看不到这些。用来整理知识的标签：合并同义词、去掉太泛的、补英文。',
    order: 80,
  },
  translate: {
    title: '⑨ 英文索引翻译（插件内部）',
    about: '⚠️ 模型看不到这些。把知识封面翻译成英文，供英文优先的判定模型使用。三级依次降级。',
    order: 90,
  },
  templates: {
    title: '⑩ 交接文档模板的写作指导',
    about: '当项目用了自定义文档模板时，读该文档会附上"这份文档有几节、每节要干嘛"。⚠️ 这组属于"模板"功能，只是搭 memj_read 送出去。',
    order: 100,
  },
}

/** 一条提示词的**人读元数据**。 */
export interface PromptCatalogEntry {
  /** 属于哪个分组。 */
  group: PromptGroup
  /** 从属对象（页面标题行显示）。⭐ 必须写**真实归属**，别写成"经由谁送出"。 */
  owner: string
  /**
   * ⭐⭐ **用途说明**（页面正文字段）——要求：
   *  · 说清**这是干嘛的**（不是"这是 XX 的描述"这种同义反复）；
   *  · 说清**谁看、什么时候看**；
   *  · 有反直觉之处时**点出后果**（如"删了它值就进不去了"）。
   */
  purpose: string
  /**
   * 工具条目的**部位**（仅 `tools` 组用）：说明书 / 参数表 / 返回格式。
   * ⚠️ 前端据此把同一工具的 3 条**折成一张卡**（用户要求"该合并的合并"）。
   */
  part?: 'description' | 'parameters' | 'output'
}

/**
 * ⭐⭐⭐ **目录**（键 = `PROMPT_SPECS` 的 key）。
 *
 * 🔴 **加新提示词时必须在这里补一条**（否则检查 ④ 报红、页面显示"（未登记说明）"）。
 */
export const PROMPT_CATALOG: Readonly<Record<string, PromptCatalogEntry>> = {
  // ══════ ① 每轮常驻 ══════
  'section:memj:protocol': {
    group: 'resident',
    owner: '系统提示词 · 协议',
    purpose:
      'memj 的"总纲"：只说三件事——什么时候该查库、什么时候该写库、写的边界在哪。' +
      '它占着**消息最前面**（node 0），⚠️ 所以**改它一个字，所有正在进行中的会话缓存全部作废一次**。',
  },
  'context:memj:usage-guidance': {
    group: 'resident',
    owner: '运行时上下文 · 使用指导',
    purpose:
      '总纲的展开版：具体怎么查、查什么、查到什么算数（触发条件表、项目判定、挂主题判据、写作要求等 13 块）。' +
      '⭐ 它追加在消息**尾部** ⇒ **改它不破缓存**，所以"会经常改的指导"都放这里。',
  },

  // ══════ ② 工具说明书 ══════
  'tool:memj_info:description': {
    group: 'tools',
    owner: '工具 memj_info',
    part: 'description',
    purpose: '说明书：这个工具是"语境入口"——告诉你库里有**哪些项目和主题**（以及各自的 id），但**不返回任何知识**。当不知道该去哪个项目找东西时，先调它。',
  },
  'tool:memj_info:parameters': { group: 'tools', owner: '工具 memj_info', part: 'parameters', purpose: '参数表：可以按检索词筛项目/主题，也可以只查其中一类。' },
  'tool:memj_info:output': { group: 'tools', owner: '工具 memj_info', part: 'output', purpose: '返回格式契约：运行时按它校验，多返回一个字段整次调用会被拒收。' },

  'tool:memj_search:description': {
    group: 'tools',
    owner: '工具 memj_search',
    part: 'description',
    purpose: '说明书：**只找不读**——按项目 / 主题 / 关键词筛出**封面**（标题+描述），**不给正文**。找到之后要用 memj_read 取正文。',
  },
  'tool:memj_search:parameters': { group: 'tools', owner: '工具 memj_search', part: 'parameters', purpose: '参数表：三种筛法（按项目 / 按主题 / 按检索词）可以单用或组合。' },
  'tool:memj_search:output': { group: 'tools', owner: '工具 memj_search', part: 'output', purpose: '返回格式契约。' },

  'tool:memj_read:description': {
    group: 'tools',
    owner: '工具 memj_read',
    part: 'description',
    purpose: '说明书：**只读不找**——按 id 取知识正文。也可以传项目 id 读整个交接文档。按文档大小自动分流：短的给全文，长的先给节名清单让人挑。',
  },
  'tool:memj_read:parameters': { group: 'tools', owner: '工具 memj_read', part: 'parameters', purpose: '参数表：id / project 二选一，另有 section / full / offset / limit 四种读法。' },
  'tool:memj_read:output': { group: 'tools', owner: '工具 memj_read', part: 'output', purpose: '返回格式契约。' },

  'tool:memj_snapshots:description': {
    group: 'tools',
    owner: '工具 memj_snapshots',
    part: 'description',
    purpose: '说明书：列出"本会话读过哪些**别项目**的知识"。用途是当证据——证明这个项目确实复用了别的项目的知识（写 handoff 时判断要不要建主题）。',
  },
  'tool:memj_snapshots:parameters': { group: 'tools', owner: '工具 memj_snapshots', part: 'parameters', purpose: '参数表：必须给目标项目 id；可选 scope 决定要不要连本项目自己的也列出来。' },
  'tool:memj_snapshots:output': { group: 'tools', owner: '工具 memj_snapshots', part: 'output', purpose: '返回格式契约。' },

  'tool:memj_handoff:description': {
    group: 'tools',
    owner: '工具 memj_handoff',
    part: 'description',
    purpose:
      '说明书：**写库的主入口**——写交接文档、沉淀新知识、推进归属，三件事一次做完。' +
      '⚠️ **这是最长的一条（约 5000 字符）**，因为"写什么、怎么判项目、怎么归属、正文怎么写、什么会被拒收"全在这里。',
  },
  'tool:memj_handoff:parameters': { group: 'tools', owner: '工具 memj_handoff', part: 'parameters', purpose: '参数表：分步（step）、按节改文档（docSection/docOp）、新增知识（entries）、外部文档入库（adopt）等。' },
  'tool:memj_handoff:output': { group: 'tools', owner: '工具 memj_handoff', part: 'output', purpose: '返回格式契约。' },

  'tool:memj_promote:description': {
    group: 'tools',
    owner: '工具 memj_promote',
    part: 'description',
    purpose: '说明书：**事后**改归属——给知识加/减主题、改封面字段（标题描述标签）、提名进全局。⚠️ 归属是**累加**不是搬家，推进后原有归属都保留。',
  },
  'tool:memj_promote:parameters': { group: 'tools', owner: '工具 memj_promote', part: 'parameters', purpose: '参数表：按封面 id 操作，一次性可传多条。' },
  'tool:memj_promote:output': { group: 'tools', owner: '工具 memj_promote', part: 'output', purpose: '返回格式契约。' },

  'tool:memj_update:description': {
    group: 'tools',
    owner: '工具 memj_update',
    part: 'description',
    purpose: '说明书：更新**一条已有**知识——改正文、或改封面的标题/描述/标签/分类。发现库里有相似条目时用它，别另写一条新的。',
  },
  'tool:memj_update:parameters': { group: 'tools', owner: '工具 memj_update', part: 'parameters', purpose: '参数表：给条目 id；body 改正文，fields 改封面字段。' },
  'tool:memj_update:output': { group: 'tools', owner: '工具 memj_update', part: 'output', purpose: '返回格式契约。' },

  'tool:memj_rebuild:description': {
    group: 'tools',
    owner: '工具 memj_rebuild',
    part: 'description',
    purpose: '说明书：从全部交接文档**重建派生层**（主题页、全局页），同时体检每张封面格式（围栏、id、描述、归属字段）。⚠️ 网页上那个「重建」按钮调的就是它。',
  },
  'tool:memj_rebuild:parameters': { group: 'tools', owner: '工具 memj_rebuild', part: 'parameters', purpose: '参数表：目前不需要参数。' },
  'tool:memj_rebuild:output': { group: 'tools', owner: '工具 memj_rebuild', part: 'output', purpose: '返回格式契约：含体检结论与非法封面清单。' },

  'tool:memj_template:description': {
    group: 'tools',
    owner: '工具 memj_template',
    part: 'description',
    purpose: '说明书：管理**交接文档模板**（列出来 / 新建 / 删除）。⚠️ 模板只在**新建项目**那一刻生效，改删模板都不影响已有文档。新建与删除走**两段式确认**。',
  },
  'tool:memj_template:parameters': { group: 'tools', owner: '工具 memj_template', part: 'parameters', purpose: '参数表：action 三选一（list / create / delete），create 时给模板定义。' },
  'tool:memj_template:output': { group: 'tools', owner: '工具 memj_template', part: 'output', purpose: '返回格式契约。' },

  'tool:memj_normalize_tags:description': {
    group: 'tools',
    owner: '工具 memj_normalize_tags',
    part: 'description',
    purpose: '说明书：**整理标签**——把同义词/大小写变体合并成规范词、去掉太泛的词、给规范词补英文。由插件在轮次结束时自动起子代理来跑。',
  },
  'tool:memj_normalize_tags:parameters': { group: 'tools', owner: '工具 memj_normalize_tags', part: 'parameters', purpose: '参数表：since 限定范围、full 全库重跑、includeBody 给模型多少正文、preview 只看不改。' },
  'tool:memj_normalize_tags:output': { group: 'tools', owner: '工具 memj_normalize_tags', part: 'output', purpose: '返回格式契约：含进了多少决定、丢了多少条（缺理由的会被丢）。' },

  'tool:memj_score_turn:description': {
    group: 'tools',
    owner: '工具 memj_score_turn',
    part: 'description',
    purpose: '说明书：**轮末复盘**——回顾某一轮，从知识库里挑出"本来能帮上忙"的条目并加分。⚠️ 由插件起子代理调，不是主会话模型自己调。',
  },
  'tool:memj_score_turn:parameters': { group: 'tools', owner: '工具 memj_score_turn', part: 'parameters', purpose: '参数表：session 被复盘的会话 id、turn 第几轮（⚠️ 不是当前会话/当前轮）。' },
  'tool:memj_score_turn:output': { group: 'tools', owner: '工具 memj_score_turn', part: 'output', purpose: '返回格式契约。' },

  // ══════ ③ 斜杠命令（给人看的）══════
  'command:memj-handoff:description': {
    group: 'commands',
    owner: '命令 /memj-handoff',
    purpose: '命令菜单里显示的那行字。⚠️ **模型看不到**，纯给人看。改完**需重启**。',
  },
  'command:memj-review:description': {
    group: 'commands',
    owner: '命令 /memj-review',
    purpose: '命令菜单说明：打开人侧状态面板（待批准的全局提名 / 断链的外链 / 非法封面）。⚠️ 模型看不到；需重启。',
  },
  'command:memj-get-handoff-project:description': {
    group: 'commands',
    owner: '命令 /memj-get-handoff-project',
    purpose: '命令菜单说明：把某个项目的交接内容读进当前会话。⚠️ 模型看不到；需重启。',
  },
  'command:memj-get-handoff-theme:description': {
    group: 'commands',
    owner: '命令 /memj-get-handoff-theme',
    purpose: '命令菜单说明：把某个主题下的知识清单读进当前会话。⚠️ 模型看不到；需重启。',
  },
  'command:memj-handoff:hint': {
    group: 'commands',
    owner: '命令 /memj-handoff',
    purpose: '选中这个命令后**落进输入框的那行提示**（告诉你可补充重点，或直接回车）。⚠️ 它**不能为空**——空了命令注册会直接报错。需重启。',
  },
  'command:memj-get-handoff-project:hint': {
    group: 'commands',
    owner: '命令 /memj-get-handoff-project',
    purpose: '选中命令后落进输入框的提示：填项目 id，且可以再补档位（只看文档 / 连带项目知识 / 全部）。⚠️ 不能为空；需重启。',
  },
  'command:memj-get-handoff-theme:hint': {
    group: 'commands',
    owner: '命令 /memj-get-handoff-theme',
    purpose: '选中命令后落进输入框的提示：填主题 id。⚠️ 不能为空；需重启。',
  },

  // ══════ ④ 命令触发时注入给模型的 ══════
  'handoff:prompt': {
    group: 'actions',
    owner: '命令 /memj-handoff · 启动指令（普通）',
    purpose:
      '你打 `/memj-handoff` 回车后，插件把这段注入会话，告诉模型"去做一次交接"，并列四条要点：' +
      '写哪个项目、先读一遍现有文档再写、沉淀知识、处理归属。⚠️ 它只负责"叫模型去做"，真正落盘是模型随后调 memj_handoff 工具。',
  },
  'handoff:prompt-steps': {
    group: 'actions',
    owner: '命令 /memj-handoff · 启动指令（分步）',
    purpose: '当你在命令后写了步骤名（如 `/memj-handoff knowledge`）时走这条：只讲"怎么做这几步"，不再重复全套规范。',
  },
  'handoff:prompt-note': {
    group: 'actions',
    owner: '命令 /memj-handoff · 用户补充语块',
    purpose: '只在**你随命令补了话**（如 `/memj-handoff 这次记网页改造`）时才追加。它把你说的原话带上，并声明"这是额外交代，不是对上面规范的替代"。',
  },
  'inject:closing': {
    group: 'actions',
    owner: '命令 /memj-get-handoff-* · 收尾指令',
    purpose:
      '加在「取交接」注入文本的最后，明确告诉模型"到此为止"：不要写库、不要改文档、不要调工具核对，只可以告诉用户下一步能做什么。' +
      '⭐ **为什么必须有**：不给收尾指令，模型会自己猜该干什么，从而自行动手。',
  },
  'inject:target-project': {
    group: 'actions',
    owner: '命令 /memj-get-handoff-project · 指路句',
    purpose: '紧跟"本次交接的目标项目是 X"后面：说明后续归档就沿用这个项目、不必再查库；但如果明显是另一件事，仍要重新判断归属。',
  },
  'inject:target-theme': {
    group: 'actions',
    owner: '命令 /memj-get-handoff-theme · 指路句',
    purpose: '紧跟"本次交接的目标主题是 X"后面，补充这个主题是用来干嘛的（了解该主题下有哪些可复用知识）。',
  },
  'inject:project-knowledge-hint': {
    group: 'actions',
    owner: '命令 /memj-get-handoff-project · 「本项目的知识」节表头',
    purpose: '知识清单前面那行说明：**只给标题和描述，正文要按需用 memj_read 去读**（长文档它会先给节名清单）。',
  },
  'inject:theme-knowledge-hint': {
    group: 'actions',
    owner: '命令 /memj-get-handoff-project · 「所属主题的知识」节表头',
    purpose: '同上，但措辞用"同样……"（它紧跟在上一节之后，避免重复啰嗦）。',
  },
  'inject:theme-covers-hint': {
    group: 'actions',
    owner: '命令 /memj-get-handoff-theme · 「本主题的知识」节表头',
    purpose: '主题交接里知识清单前的说明，内容与项目交接那条基本一致。',
  },

  // ══════ ⑤ 每轮自动注入的热知识 ══════
  'hot:head-first': {
    group: 'hot',
    owner: '热知识注入 · 首次消息头',
    purpose: '整段热知识的标题行，标明"这是本次会话相关的热知识"。',
  },
  'hot:head-supplement': {
    group: 'hot',
    owner: '热知识注入 · 补注消息头',
    purpose: '当插件发现"有几条之前漏了"会补发一批。这条标题写明"这是**补充**"，免得模型以为又来了一整批新的。',
  },
  'hot:direct-section': {
    group: 'hot',
    owner: '热知识注入 · 「直接可用的内容」段标题',
    purpose: '这一段下面放的是**正文已经完整给出**的内容（用户画像 + 标记为 full 的知识）。⭐ 它和 `hot:meta-hint` 语义正好相反：这里是"正文已在眼前，不用再去读"。',
  },
  'hot:meta-hint': {
    group: 'hot',
    owner: '热知识注入 · 「只给标题和描述」段表头',
    purpose: '这一段只列标题和描述，所以这里提醒模型：**正文要按需用 memj_read 去读**。',
  },
  'hot:closing': {
    group: 'hot',
    owner: '热知识注入 · meta 段收尾',
    purpose: '加在末尾：说明"内容已注入完毕，除非用户的问题正好落在某条上（那就去读正文），否则继续当前任务"；并禁止额外的客套寒暄。',
  },
  'hot:body-closing': {
    group: 'hot',
    owner: '热知识注入 · 正文段收尾',
    purpose: '补注时"正文段"是单独一条消息，它有自己的收尾：说明这些是背景知识但不是任务，让模型继续干活。⭐ 不与 meta 段共用同一句——正文已在眼前，再说"按需读"就不对了。',
  },

  // ══════ ⑥ 主动召回（插件内部判断）══════
  'jev:need': {
    group: 'recall',
    owner: '主动召回 · JEV 需求门',
    purpose: '第一个判断："当前这一步需不需要外部知识？"判成不需要就不去召回了（省时间省钱）。⚠️ 未启用时也会算分，分数进日志供调参。',
  },
  'jev:sufficient': {
    group: 'recall',
    owner: '主动召回 · JEV 充足门',
    purpose: '第二个判断："手头的知识够不够用？"够用就跳过召回。⚠️ 生产上阈值设成了 0.9，而实测最高只有 0.85 ⇒ **这道门目前实际上等于废弃**。',
  },
  'jev:search-intent': {
    group: 'recall',
    owner: '主动召回 · JEV 意图门',
    purpose:
      '第三个判断："模型是不是已经打算自己去查库了？"是的话就不重复注入。' +
      '⭐ **提问必须点名 memj_search / memj_info**——早期措辞太宽（"是否想查知识库"），任何"我该查一下"的念头都命中，实测两次召回全被它拦掉。',
  },
  'jev:candidate': {
    group: 'recall',
    owner: '主动召回 · JEV 逐条打分',
    purpose:
      '最关键的一条：**对每一条候选知识分别问一次**"这条现在帮得上忙吗"，拿到 0~1 的分数后按阈值筛。' +
      '⭐ 里面点名了 `current_thinking`（本步刚结束的思考）与 `background`（背景材料），并声明"只按前者判、后者只是材料"——实测这句措辞能让 96/96 条分数全部上升。',
  },
  'active:header': {
    group: 'recall',
    owner: '主动召回 · 注入文本首行',
    purpose: '召回成功后注入文本的第一行：说明下面是"知识库里与当前工作相关的知识（主动召回）"。',
  },
  'active:body-hint': {
    group: 'recall',
    owner: '主动召回 · 注入文本第二行',
    purpose: '说明只给了标题和描述，**正文要用 memj_read 去读**。⭐ 这一行直接决定模型会不会去读正文，别看它短。',
  },
  'active:closing': {
    group: 'recall',
    owner: '主动召回 · 注入文本收尾',
    purpose: '末尾的收尾指令：明确"以上是背景知识，不是任务；结合它们继续当前工作"。',
  },

  // ══════ ⑦ 轮末知识评分（子代理）══════
  'score:system': {
    group: 'score',
    owner: '知识评分 · 规则段',
    purpose:
      '告诉打分员"你的任务是什么"并给出判断标准：这条知识对项目的**长期工作**有没有实际帮助' +
      '（具体指两种情况：这一轮需要却没有；这一轮犯了错而它能避免）。⚠️ 它后面还会拼上输出格式、取舍原则，以及**约 3.5 万字符的知识库清单**（缓存大头）。',
  },
  'score:quote-rule': {
    group: 'score',
    owner: '知识评分 · 引文硬要求',
    purpose:
      '要求给理由时**必须从本轮工作内容里逐字复制一句原话**当证据。' +
      '⭐ 它和一段机械校验配对：程序会拿这句话去原文做**逐字比对**，不是原句就直接丢弃 ⇒ 措辞一旦放松（模型写成"意思差不多"），入选会被丢光。',
  },
  'score:pick-principle': {
    group: 'score',
    owner: '知识评分 · 取舍原则',
    purpose: '要求"宁少勿滥"、一条都没有就回空数组、不要为了凑数而选。⭐ 实测不给条数上限时模型会选 18~24 条（沾边的都收）⇒ 分数被拉平、失去区分度。',
  },
  'score:index-range': {
    group: 'score',
    owner: '知识评分 · 编号范围提示',
    purpose: '"编号必须在 1 到 N 之间"（N = 候选条数），防止模型回一个越界的编号。',
  },
  'score:pool-header': {
    group: 'score',
    owner: '知识评分 · 清单表头',
    purpose: '「知识库清单（共 N 条）」——告诉模型下面是候选清单。',
  },
  'score:user-task': {
    group: 'score',
    owner: '知识评分 · user 段骨架',
    purpose:
      '每次变的那部分：本轮工作内容 + "最多选几条" + "按能改变做法的程度排序，只留最前面几条"。' +
      '🔴 **为什么它在 user 段而不在规则段**：`{{k}}` 是可配置的数字，写进规则段会让整份规则随配置变化，**把 3.5 万字符的清单一起拖出缓存**。',
  },
  'score:jev-instruction': {
    group: 'score',
    owner: '知识评分 · JEV 通路提问',
    purpose: '如果评分走 JEV 通路（而不是 chat 通路）时用这条提问。⚠️ 与主动召回那 4 条 `jev:*` 不是一回事——那 4 条是"召回时的判定"，这条是"复盘时的提问"。⚠️ 必须英文。',
  },

  // ══════ ⑧ 标签规范化（子代理）══════
  'tag:system': {
    group: 'tags',
    owner: '标签规范化 · 裁决规则',
    purpose:
      '告诉裁决员：输入有什么（词表、范围内的全部标签、相关知识正文摘要）、可以做什么决定（合并 / 新增 / 丢弃 / 改标签）、以及**每个决定都必须给理由**。' +
      '🔴 **关键约束**：词表是「**可优先复用的选项**」，**不是白名单**。早期把它当过滤器用，叠加"把所有标签都登记进词表"之后，**模型永远拿不到需要整理的词、工具完全空转**（实测：253 条参与裁决、0 个候选、模型调用 0 次）。',
  },
  'tag:translate-system': {
    group: 'tags',
    owner: '标签规范化 · 英文化',
    purpose: '把中文标签译成简短的英文规范词（全小写、1~3 个词、保留 CSS/DSH 这类专有名词），输出要求 JSON。',
  },

  // ══════ ⑨ 英文索引翻译（插件内部）══════
  'translate:mt': {
    group: 'translate',
    owner: '英文索引 · 翻译第①级（默认）',
    purpose: '最常用的模板：要求"把编号条目从中文翻成英文、保留编号"，并用**空行**分隔标题与描述两段。⭐ 实测用空行暗示比"强指令"更有效（约 4% 的输出会把两段合并成一行，空行法能显著降低）。',
  },
  'translate:mt-strong': {
    group: 'translate',
    owner: '英文索引 · 翻译第②级',
    purpose: '第①级失败时用：明确要求"**只输出两行**"，不许合并。',
  },
  'translate:instruct': {
    group: 'translate',
    owner: '英文索引 · 翻译第③级',
    purpose: '前两级都失败时用：改成要求返回 JSON。⚠️ **它与解析器配对**——改提示词可以，但改输出形态会让解析器失败。',
  },

  'reads:snapshot-closing': {
    group: 'tools',
    owner: '工具 memj_snapshots · 返回值末尾的判据句',
    purpose:
      'memj_snapshots 会把"本会话读过哪些别项目的知识"列给模型看。末尾这句要求它**逐条判断"这条确实跟本次相关吗"**——' +
      '读了不等于用上了，不相关的要排除。' +
      '⭐ **为什么要有**：这些快照是"跨项目复用"的证据（用来决定要不要建主题），照单全收会拿无关知识去凑证据（本项目真实发生过）。',
  },

  // ══════ ⑩ 交接文档模板的写作指导 ══════
  'tpl:guidance-head': {
    group: 'templates',
    owner: '文档模板 · 写作指导（表头）',
    purpose: '拼装积木之一，拼出"本文档共 N 节（顺序固定……）"这一行。它下面会接若干个"节行"。',
  },
  'tpl:guidance-row': {
    group: 'templates',
    owner: '文档模板 · 写作指导（每个节一行）',
    purpose: '拼装积木之一，**每一节生成一行**：节名 + 这一节要干嘛（你在模板页写的）+ 是否会被自动截断。单独看它只是一行模板，拼起来才是完整指导。',
  },
  'tpl:guidance-trunc-mark': {
    group: 'templates',
    owner: '文档模板 · 截断标记',
    purpose: '拼在节行末尾的小标记，表示"这一节的较早内容会被自动归档"。⚠️ 它还被另一处（`tools.ts` 的兜底分支）用到，改它两处都会变。',
  },
  'tpl:guidance-no-trunc': {
    group: 'templates',
    owner: '文档模板 · 「没有可截断节」说明',
    purpose: '当模板**一节都没声明可截断**时追加这段，如实告诉模型"文档不会自动瘦身"，免得它以为工具会帮忙压。',
  },
  'tpl:guidance-foot': {
    group: 'templates',
    owner: '文档模板 · 写作指导（收尾）',
    purpose: '最后一行：声明「沉淀知识」那一节由工具生成（放封面）。⭐ **为什么必须说**——那一节里放的是机器生成的知识封面，模型若往那里写正文会破坏结构。',
  },
  'tpl:notice-templated': {
    group: 'templates',
    owner: '文档模板 · 通知外壳（找得到模板）',
    purpose: '当文档记着的模板**还在**：用这个外壳包住标题「本文档的写作指导（按模板 X 生成）」和拼好的指导正文。',
  },
  'tpl:notice-fallback': {
    group: 'templates',
    owner: '文档模板 · 通知外壳（模板已删/改名）',
    purpose: '当模板**已经不存在**：改用这个外壳（标题变成「本文档的节结构」），并从**文档自己记着的节名**还原一份。⭐ 这样不撒谎——文档记着自己的节名，还原出来仍然准。',
  },
  'tpl:notice-missing': {
    group: 'templates',
    owner: '文档模板 · 「模板已不存在」说明',
    purpose: '接在上面那个外壳中间：明确告诉模型"原模板 X 已不存在，上面这份是从文档自己记着的节名还原的，**它才是准的**"。',
  },
}

/** 取一条的目录信息（未登记返回 `undefined`）。 */
export function catalogOf(key: string): PromptCatalogEntry | undefined {
  return PROMPT_CATALOG[key]
}

/** 分组排序（页面用）。 */
export function groupOrder(g: PromptGroup): number {
  return PROMPT_GROUPS[g].order
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐⭐ **把工具 schema 渲染成人读文本**（2026-10-12）
//
// 🔴 **解决什么问题**：`parameters` / `output` 在源码里是 **JavaScript 对象**
//   （`defineTool({ parameters: {...} })`），**不是字符串常量**
//   ⇒ 页面取不到文本 ⇒ 那 22 条**点进去是空的**（用户看到的就是"列了却没内容"）。
//
// ⭐ **做法**：注册工具时把对象**渲染成 markdown 文本**、当作"默认值"登记
//   ⇒ 页面就能显示真内容；而**它仍然是只读的**（不开放编辑，因为它是契约）。
//
// ⚠️ **渲染是单向的**：只用于**显示**。运行时用的仍是那个对象本身，
//   两者不会互相影响（也就**不存在"显示的和实际用的不一致"**这种风险）。
// ══════════════════════════════════════════════════════════════════════════

/** 一个参数 / 字段的定义（`defineTool` 的松散形状，只取我们认识的键）。 */
interface FieldDef {
  type?: unknown
  description?: unknown
  enum?: unknown
  items?: unknown
  required?: unknown
  [k: string]: unknown
}

/** 把类型描述成人话。 */
function typeText(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => typeText(x)).join(' 或 ')
  if (typeof v === 'string') return v
  if (v === undefined || v === null) return '—'
  return String(v)
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
export function renderParametersText(parameters: unknown): string {
  if (parameters === undefined || parameters === null) return '（该工具不需要参数）'
  if (typeof parameters !== 'object') return String(parameters)
  const p = parameters as { properties?: Record<string, FieldDef> } & Record<string, FieldDef>
  // ⭐ 兼容两种形状：JSON Schema（`properties` 包一层）与扁平表。
  const fields: Record<string, FieldDef> =
    p.properties !== undefined && p.properties !== null && typeof p.properties === 'object'
      ? p.properties
      : (p as Record<string, FieldDef>)
  const entries = Object.entries(fields)
  if (entries.length === 0) return '（该工具不需要参数）'
  const blocks: string[] = []
  for (const [name, def] of entries) {
    const t = typeText(def?.type)
    const head = t === '—' ? name : `${name}（${t}）`
    const lines: string[] = []
    if (typeof def?.description === 'string' && def.description !== '') lines.push(def.description)
    if (Array.isArray(def?.enum)) lines.push(`可选值：${def.enum.map((e) => String(e)).join(' / ')}`)
    const items = def?.items as FieldDef | undefined
    if (items !== undefined && items !== null) lines.push(`数组，元素类型 ${typeText(items.type)}`)
    // ⚠️ 说明按行缩进 —— 缩进是"这属于上一个参数"的唯一视觉线索。
    const body = lines.map((l) => l.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()).filter((l) => l !== '')
    blocks.push(body.length === 0 ? head : `${head}\n${body.map((l) => `    ${l}`).join('\n')}`)
  }
  return blocks.join('\n\n')
}

/**
 * 渲染**返回值契约**。
 *
 * ⚠️ 与 `renderParametersText` 同因：**不用 markdown 表格**（`<pre>` 里对不齐、窄屏散架）。
 * @param output - `defineTool` 的 `output` 对象（形如 `{ schema: {...} }`）。
 * @returns 人读文本。
 */
export function renderOutputText(output: unknown): string {
  if (output === undefined || output === null) return '（该工具没有声明返回值 schema）'
  const o = output as { schema?: { properties?: Record<string, FieldDef>; additionalProperties?: unknown } }
  const schema = o.schema
  if (schema === undefined || schema === null) return '（该工具没有声明返回值 schema）'
  const props = schema.properties ?? {}
  const entries = Object.entries(props)
  const lines: string[] = []
  if (entries.length > 0) {
    lines.push('返回字段：')
    for (const [name, def] of entries) {
      const t = typeText(def?.type)
      const d = typeof def?.description === 'string' ? def.description.replace(/\s+/g, ' ').trim() : ''
      lines.push(`    ${t === '—' ? name : `${name}（${t}）`}${d === '' ? '' : `\n        ${d}`}`)
    }
  } else {
    lines.push('（该工具的返回值没有具名字段）')
  }
  if (schema.additionalProperties === false) {
    // ⚠️ 这条是**硬契约**，必须让读者看见（多一个字段就整次调用被拒）。
    lines.push('', '⚠️ 多返回一个未声明的字段，整次调用会被拒收（additionalProperties: false）。')
  }
  return lines.join('\n')
}
