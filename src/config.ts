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

import z from '@deepseek-ai/schemastery'
// ⭐⭐⭐ 类型也要 import（**只为给下面那个具名子 schema 加注解**）——
//    🔴 不加注解时 `Config` 的推断类型**无法被命名**（TS2742），
//       `tsdown` 生成 `.d.ts` 会**直接构建失败**。⚠️ 详见 `DecisionProviderSchema` 的注释。
import type Schemastery from '@deepseek-ai/schemastery'

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
const DecisionProviderSchema: Schemastery<{
  id: string
  displayName: string
  endpoint: string
  models: string[]
}> = z.object({
  /** 路由标识（同一份配置里不得重名）。 */
  id: z.string(),
  /** 显示名（空 ⇒ 显示 id）。 */
  displayName: z.string().default(''),
  /** 该 provider 的端点。 */
  endpoint: z.string(),
  /** 该 provider 下的模型名列表。 */
  models: z.array(z.string()).default([]),
})

/** 插件配置。 */
export const Config = z.object({
  /**
   * `memj_read` 的**全文直出阈值**（字符数，§4.2 / §12-39）。
   *
   * ⚠️ 这是**字符数不是字节数**——中文按 UTF-8 一字符 3 字节，
   * 用字节会让中文文档体积虚高 3 倍。
   *
   * 3000 的理由：它正好把**内部条目**（几百–2000 字符，该全文读）
   * 与**外部长文档**（上万，该按节读）分开。
   */
  readFullMaxChars: z.natural().min(1).default(3000),

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
   * ⭐ **新建主题的模式**（决策 95，2026-09-19 用户拍板）。
   *
   * - `strict`（**默认**）：沿用现行门槛——`newThemes` 非空时，本会话必须有一条
   *   `project ≠ 本次 project` 的**未消费读快照**作跨项目证据，否则整份 handoff 报错。
   * - `loose`：⭐ **取消这道闸门**，是否新建主题**完全由 LLM 判断**，工具不做该校验。
   *
   * 🔴 **宽松模式只拆闸门，不拆完整性**（两种模式都保留）：
   *   · `id` / `desc` 的**格式校验**——那不是"该不该建"，而是"建了能不能用"；
   *   · **近义 id 的两段式确认**——§12-33 的删除/改名通道是留待做，
   *     近义主题**建错了收拾不掉**，属永久性损坏。
   *
   * ⚠️ **模式信息不进提示词**（决策 96）：协议与工具 description **保持中性、只有一份**，
   *   模式由 `memj_snapshots` 的**返回值**告知 LLM（动态通道 ⇒ 零缓存代价）。
   *
   * ⚠️ **默认必须是 `strict`**：改成 `loose` 会让现有测试语义全变、且新用户被静默放开。
   */
  themeCreation: z.union([z.const('strict'), z.const('loose')]).default('strict'),

  /**
   * ⭐⭐ **「当前进度」的压缩阈值**（字符数；决策 127 的触发条件）。
   *
   * `memj_handoff` 落盘后会在回执里报「当前进度」的字符数；
   * **超过本值** ⇒ 这一轮应当顺手把已完结的历史归并（从「完整」降到「归并」）。
   *
   * ⚠️ 判据是**这一节的绝对字符数**，不是它占全文的比例。
   *
   * 🔴 **本值不进提示词**（这是刻意的）：`index.ts` 注册 `context()` 时明确写着
   *    "本函数只返回常量，**绝不含运行时数字**（那会导致永不命中缓存）"。
   *    ⇒ 规范里只说"**超过阈值就压**"，**具体数字由回执每次现报**——
   *      这样用户拧旋钮**不会**改变 `context()` 的文本。
   *      （`context()` 落 user 角色、尾部 append ⇒ 不破前缀缓存；
   *        但文本一变就会多出一条新的上下文快照，旧的仍留在历史里 ⇒ 仍要避免。）
   */
  progressCharsWarn: z.natural().min(1000).max(1000000).default(20000),

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
   * ⭐⭐ **「当前进度」的截断目标**（字符数；决策 136）。
   *
   * 超过 `progressCharsWarn`（阈值）后，**自动**把较早写下的 `###` 小节截走、
   * 归档成 `kind: 'history'` 的条目，直到这一节 **≤ 本值**。
   *
   * 🔴 **与"压缩"的本质区别**：压缩要模型自己动手（本项目实测**报了 7 次、一次没做**）；
   *    截断是**工具自己做的事** ⇒ ⭐ **那个失败模式从此不存在**。
   *
   * ⚠️ 判据仍是**这一节的绝对字符数**；与 `progressCharsWarn` 一样**不进提示词**
   *    （"人会改的值不能进常量通道"）。
   */
  progressCharsKeep: z.natural().min(1000).max(1000000).default(12000),

  // ═════════════════════════════════════════════════════════════════════════
  // ⭐⭐ 热知识注入（热知识方案 §10）
  //
  // 🔴 **总开关默认关**：与 memj 一贯姿态（"插件不推、模型主动查"）一致，
  //    **用户显式开启才注入**。⚠️ 它是本功能唯一的"是否自动推送"闸门。
  // ═════════════════════════════════════════════════════════════════════════

  /** ⭐ **热知识总开关**（默认关）。 */
  hotInject: z.boolean().default(false),

  /** ⭐ **注入上限比例**（占模型上下文窗口的比例；`0` = 关闭预算检查）。 */
  hotInjectRatio: z.number().min(0).max(100).default(0.333),

  /**
   * ⭐ 字符↔token 换算系数。
   *
   * 🔴 **默认 1.0 是刻意保守**：中文大约 1 字符 ≈ 1 token，用它换算
   * = "按最坏情况估" ⇒ **宁可高估占用，别把预算算松了**。
   */
  hotCharsPerToken: z.number().min(0.1).max(10).default(1.0),

  /** ⭐ 窗口未知时的字符上限（回落值）。 */
  hotBudgetCharsFallback: z.natural().min(1000).max(10000000).default(40000),

  /** ⭐ **单条 `full` 正文的提醒阈值**（方案 §9.1c；超了提醒用户，**不阻止**）。 */
  hotFullWarnChars: z.natural().min(1).max(1000000).default(1000),

  /** ⭐ 会话绑定记录保留条数（裁定 H-4：留最新 50 个）。 */
  hotSessionKeep: z.natural().min(1).max(10000).default(50),

  // ═════════════════════════════════════════════════════════════════════════
  // ⭐⭐⭐ 知识评分（决策 177；2026-09-29 用户裁定）
  //
  // ── 一句话 ──────────────────────────────────────────────────────────────
  // 每轮结束时由子代理调 JEV 评「**这一轮里哪些已有知识本来能帮上忙**」，
  // 过阈值的**按档加分**；热知识注入时把**有效分前 N 名**注入
  //（开关打开时**替换**原清单 —— 用户裁定：*"打开开关时替换"*）。
  //
  // ── 为什么它是一门心思给「热知识注入」的（用户原话）──────────────────────
  // > *"这个功能其实是属于热知识注入的板块。应该在设置面板有个开关，默认关。"*
  // ⇒ 键名统一 `hotScore*`、面板放在**热知识注入**子页。
  //
  // ── 与「主动注入」的分工（互补，别混）───────────────────────────────────
  // | | 时机 | 判据 | 回答 |
  // |---|---|---|---|
  // | 主动注入 | 思考后、实时 | 当下那段思考 | 「**现在**需要什么」 |
  // | **本功能** | 轮末、复盘 | 整轮内容 + 项目背景 | 「这个项目**长期**该带什么」 |
  // ═════════════════════════════════════════════════════════════════════════

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
  hotScoreThreshold: z.number().min(0).max(1).default(0.7),

  /**
   * ⭐⭐ **滚动窗口（小时）**：只有窗口内加过分的事件才算数（用户裁定：*"30 个小时"*）。
   *
   * 🔴 **判据是"逐事件判过期"，不是"看最后一个时间戳"** ——
   *    后者会让"早期加分 + 近期加分"的知识**该过期时不过期**（详见 `hot-score.ts` 文件头）。
   * ⚠️ 与 `hotScoreThreshold` 一样：它是**独立的旋钮**，不复用别的阈值键
   *    （库内知识 `3d71bf49`：触发点与目标必须各是一个参数）。
   */
  hotScoreWindowHours: z.number().min(0.1).max(10000).default(30),

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
  hotScoreMinChars: z.natural().min(0).max(1000000).default(100),

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
  hotScoreGateMinScore: z.natural().min(1).max(1000).default(2),

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
  hotScoreChannel: z.union([z.const('chat'), z.const('jev')]).default('chat'),

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
  hotScoreModel: z.string().default('workbuddy/deepseek-v4.1-flash'),

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
  hotScoreSubagentProvider: z.string().default(''),
  hotScoreSubagentModel: z.string().default(''),

  /** ⭐ **评分调用的超时**（毫秒）。⚠️ 后台跑，给得比注入宽。 */
  hotScoreTimeoutMs: z.natural().min(1000).max(300000).default(60000),

  // ═════════════════════════════════════════════════════════════════════════
  // ⭐⭐ 英文召回索引（设计文档 §9；**B 方案：召回只读它**）
  //
  // 🔴🔴 **默认开 —— 它是必要功能，不是可选开关**
  //     （用户 2026-09-26 裁定原话："英文索引功能不需要开关。是必要功能。"）
  //     ⇒ ⭐ **设置面板上不出现这个开关**（只留模型 / 模板 / 并发三个控件）。
  // ⚠️ 键**保留、不删**：① 排障时可以手工在 `cordis.patch.yml` 里关掉；
  //     ② 已有配置里可能已经写着 `enIndex: true`，删键会变成"未知键"。
  // ⚠️ 它只在**每次 handoff 落盘后**翻「新增 / `descHash` 过期」的那几条
  //     ⇒ 平时零成本；拿不到翻译路由时**只更新结构、不调模型**。
  // ═════════════════════════════════════════════════════════════════════════

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
  translateProvider: z.string().default(''),
  translateModel: z.string().default(''),

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
  translateTemplate: z.union([z.const('instruct'), z.const('mt')]).default('instruct'),

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
  translateTimeoutMs: z.natural().min(1000).max(600000).default(20000),

  /** 单次翻译调用的输出上限（tokens）。 */
  translateMaxTokens: z.natural().min(64).max(100000).default(2000),

  // ═════════════════════════════════════════════════════════════════════════
  // ⭐⭐⭐ 标签规范化（决策 162，2026-09-28）
  //
  // 🔴 **与 `translate*` 分开的键、不能复用**：翻译模型**只会翻译、不会判断**
  //    ——而这一层要判"这两个词是不是同义""这个词是不是太泛"，
  //    是**裁决**不是翻译。用 MT 模型做裁决会得到一个看起来合理、实则随机的映射。
  //    ⚠️ 英文规范词那一步（C 层）**才是翻译** ⇒ 它复用 `translate*`。
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * ⭐ 裁决模型（B 层）。**两个都为空 ⇒ 跟随主会话默认模型**。
   *
   * ⚠️ 建议显式选一个**判断力好**的（如 `deepseek-v4.1-flash`）——
   * 跟随主会话可能用的是贵模型，而这一步要看全库 tag + 正文。
   */
  tagNormalizeProvider: z.string().default(''),
  tagNormalizeModel: z.string().default(''),

  /** 单次裁决调用的超时（毫秒）。⚠️ 比翻译长：它要读正文 + 全库词表。 */
  tagNormalizeTimeoutMs: z.natural().min(1000).max(600000).default(60000),

  /** 单次裁决调用的输出上限（tokens）。⚠️ 输出是映射表，要给足。 */
  tagNormalizeMaxTokens: z.natural().min(64).max(100000).default(4000),

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
  tagNormalizeReasoningEffort: z
    .union([z.const(''), z.const('off'), z.const('low'), z.const('medium'), z.const('high')])
    .default('off'),

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

  // ═════════════════════════════════════════════════════════════════════════
  // ⭐⭐ 主动注入（设计文档《memj 主动注入 · 设计方案》§10）
  //
  // 一句话：**每次「思考结束」后**，把截止该步的上下文交给一个可配置的召回模型，
  // 它一次调用完成两步判断（要不要知识 / 要哪几条），命中则在下一个 step 前注入回会话。
  //
  // 🔴 **总开关默认关**：与热知识一致（"插件不推、模型主动查"是本项目一贯姿态）。
  //    失败模式不对称 —— **漏做只是少做，误做会烧 token + 污染上下文**。
  //
  // ⚠️ **与热知识注入是两条通道，不是替代**（§3.2）：
  //    热知识 = 清单驱动（会话开始全量注入 + 看门狗补缺）；
  //    主动注入 = 上下文驱动（每步按当前思考动态召回）。
  // ═════════════════════════════════════════════════════════════════════════

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
  activeInjectChannel: z.union([z.const('chat'), z.const('jev')]).default('chat'),

  /**
   * ⭐ **该通路下的模型**（`provider/model` 形式；空 = 功能不生效）。
   *
   * ⚠️ 两条通路的取值来源不同：`chat` 走 `ctx.llm.listProviders()`；
   *    `jev` 走 Knox 网关的模型名（`jev-latest`）。
   */
  activeInjectModel: z.string().default(''),

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
  activeInjectScope: z
    .union([z.const('project'), z.const('project+themes'), z.const('all')])
    .default('project+themes'),

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
  activeInjectNeedMin: z.number().min(0).max(1).default(0.7),

  /**
   * ⭐⭐ **「哪几条候选够格」的门槛**（每条候选的 `noul` ≥ 此值才进候选集）。
   *
   * ⚠️ 它是**同一次请求里的两种 `noul`**（总控 vs 逐条），但**语义与分布都不同**：
   *    总控 `need` 回答"整轮需不需要"，候选 `noul` 回答"这一条相不相关"。
   * ⭐ 沿用 JEV 召回知识的**分带**口径：`≥0.7 act / 0.4~0.7 review / <0.4 drop`
   *    —— 0.7 本来就是"act 带"的下沿，**它属于这里，不属于 `need`**。
   */
  activeInjectItemMin: z.number().min(0).max(1).default(0.7),

  /** 召回超时（官方 `deadline`）。 */
  activeInjectTimeoutMs: z.natural().min(500).max(120000).default(8000),

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
  activeInjectPoolMax: z.natural().min(10).max(2000).default(240),

  /** 是否要模型给"为什么选它"（⚠️ 开了就违背"输出越少越好"，**仅调试用**）。 */
  activeInjectExplain: z.boolean().default(false),

  /** **(b) 搜索意图**抑制开关（§6.6）：主模型已表达检索意图 ⇒ 不注入。 */
  activeInjectSearchIntentGate: z.boolean().default(true),

  /** **仅 JEV 通路**：`search_intent` 概率 ≥ 此值才算"有意图"（⚠️ 刻意保守，见 §6.6）。 */
  activeInjectSearchIntentMin: z.number().min(0).max(1).default(0.85),

  /** **(a) 已有知识充足**抑制开关（§6.6）。 */
  activeInjectSufficientGate: z.boolean().default(true),

  /** **仅 JEV 通路**：`sufficient` 概率 ≥ 此值才算"已充足"。 */
  activeInjectSufficientMin: z.number().min(0).max(1).default(0.85),

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
  // ⚠️ **不给 `.default()`**：默认值放在 `DEFAULT_CONFIG` + `maxInjectionsPerTurn()` 里。
  //    理由：要让"新键没写"与"新键显式写成 3"可区分 —— 否则旧键回落会被默认值吃掉。
  //    ⚠️ schemastery 里**没有 `.optional()`**，可选键的写法是 **`.required(false)`**。
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
  activeInjectReasoningMaxChars: z.natural().min(100).max(100000).default(800),

  // ═════════════════════════════════════════════════════════════════════════
  // ⭐⭐⭐ 预算与裁剪（用户 2026-09-26 定的方案）
  //
  // 一句话：**召回被调用之前，在内存里把总量算好并裁到位**。
  //
  // 裁剪顺序（**别自作主张改**）：
  //   ① 先按 turn 裁上下文 —— 从**较早的历史**整轮丢，直到**只剩本轮**（地板）；
  //   ② 上下文不可再裁 ⇒ 才裁**候选池**（按 `updatedAt` **从旧到新**丢）；
  //   ③ 都到下限仍超 ⇒ **如实报超预算**，不假装成功。
  // ═════════════════════════════════════════════════════════════════════════

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
  activeInjectBudgetTokens: z.natural().min(1000).max(200000).default(40000),

  /**
   * ⭐⭐ **上下文的名义预算**（默认 **20000**）—— 用户 2026-09-26 原话：
   *    *"这种情况下，会话上下文，我们直接给到 20k 的预算。剩下的给候选池"*。
   *
   * 🔴 **它是"先给这么多"，不是"最多这么多"**：当需要更多批次才能装下候选池时，
   *    `planInjection` 会**主动往下压**这个值（腾出每批的候选容量），
   *    一直压到**地板**（只剩当前轮）为止。
   * ⚠️ 反过来它也**不会超**：实际取 `min(名义值, 总预算 − 候选容量 − 开销)`。
   */
  activeInjectContextTokens: z.natural().min(1000).max(200000).default(20000),

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
  activeInjectChatWindowRatio: z.number().min(0.1).max(1).default(0.6),

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
  activeInjectJevEndpoint: z.string().default('https://api.knox.chat/v1/systemone'),

  /** JEV 凭据的**环境变量名**（用 `ctx.credentials.resolve()` 取，**不落盘、不打日志**）。 */
  activeInjectJevApiKeyEnv: z.string().default('KNOX_API_KEY'),

  /**
   * ⭐⭐⭐ **JEV 决策模型的模型名**（用户 2026-10-07 要求"统一配置的地方"）。
   *
   * ⚠️ **取值口径（新键优先、旧键回落）**：本键为空时回落到各功能自己的键
   *    —— 免得已写在 `cordis.patch.yml` 里的旧值被静默丢弃。
   * ⚠️ **形态是【纯模型名】**（网关下的名字，如 `jev-latest`），**不是** `provider/model`。
   * 🔴 **2026-10-07 晚：已被 `decisionProviders` 取代**（同上面那两个键的处置）。
   */
  jevModel: z.string().default('jev-latest'),

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
  activeInjectDecisionPick: z.string().default(''),
  hotScoreDecisionPick: z.string().default(''),
})

/** 解析后的配置类型（schemastery 用 `TypeT`，**没有** `z.infer`）。 */
export type MemjConfig = Schemastery.TypeT<typeof Config>

/** 每 turn 最多注入几次的**默认值**（改名后仍取 3 —— 与旧键默认值一致）。 */
export const ACTIVE_MAX_INJECTIONS_DEFAULT = 3

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
export function maxInjectionsPerTurn(config: {
  activeInjectMaxInjectionsPerTurn?: number | undefined
  activeInjectMaxCallsPerTurn?: number | undefined
}): number {
  return config.activeInjectMaxInjectionsPerTurn
    ?? config.activeInjectMaxCallsPerTurn
    ?? ACTIVE_MAX_INJECTIONS_DEFAULT
}

/** ⭐⭐ 两个 `band` 键的默认值（拆键前的旧值就是 0.7 ⇒ 保持行为连续）。 */
export const ACTIVE_BAND_DEFAULT = 0.7

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
export function needMinOf(config: {
  activeInjectNeedMin?: number | undefined
  activeInjectBand?: number | undefined
}): number {
  return config.activeInjectNeedMin ?? config.activeInjectBand ?? ACTIVE_BAND_DEFAULT
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
export function itemMinOf(config: {
  activeInjectItemMin?: number | undefined
  activeInjectBand?: number | undefined
}): number {
  return config.activeInjectItemMin ?? config.activeInjectBand ?? ACTIVE_BAND_DEFAULT
}

/** 默认配置（探针与测试可直接复用）。 */
export const DEFAULT_CONFIG: MemjConfig = {
  readFullMaxChars: 3000,
  readLogMaxEntries: 50,
  readLogTrimCount: 25,
  searchLimit: 30,
  injectProtocol: true,
  similarEditDistance: 2,
  // ⚠️ **必须是 strict**：现有 353 项测试全部建立在"无证据则拒绝"之上，
  //    改成 loose 会让它们的语义静默全变。
  themeCreation: 'strict',
  // 默认 2 万字符（用户 2026-09-20 定）。
  progressCharsWarn: 20000,
  // ⭐ 决策 135：git 默认**关**（需要本机有 git，开启时要先探测环境）。
  backupGit: false,
  backupGitFailLimit: 3,
  // ⭐ 决策 136：截断目标 1.2 万（用户 2026-09-21 定）。
  progressCharsKeep: 12000,
  // ⭐⭐ 热知识（热知识方案）：总开关**默认关**（用户显式开启才注入）。
  hotInject: false,
  hotInjectRatio: 0.333,
  hotCharsPerToken: 1.0,
  hotBudgetCharsFallback: 40000,
  hotFullWarnChars: 1000,
  hotSessionKeep: 50,
  // ⭐⭐ 英文索引（设计文档 §9）：**默认开** —— 它是**必要功能，不是可选开关**
  //    （用户 2026-09-26 裁定）⇒ ⚠️ 设置面板上**不出现**这个开关。
  enIndex: true,
  enIndexDiag: false,
  // 翻译模型：两个都空 ⇒ 跟随主会话默认模型。
  translateProvider: '',
  translateModel: '',
  // ⚠️ 用 Hunyuan-MT 这类翻译专用模型时必须改成 'mt'。
  translateTemplate: 'instruct',
  translateConcurrency: 3,
  // ⭐ 每级重试 1 次（共 2 次尝试）—— 防"一次偶发失败烧掉全部三级"。
  translateRetries: 1,
  translateTimeoutMs: 20000,
  translateMaxTokens: 2000,
  // ⭐⭐⭐ 标签规范化（决策 162）：裁决模型默认**跟随主会话**（两个空串）；
  //    超时给长一点——它要读正文 + 全库词表（比翻译重）。
  tagNormalizeProvider: '',
  tagNormalizeModel: '',
  tagNormalizeTimeoutMs: 60000,
  tagNormalizeMaxTokens: 4000,
  // ⭐⭐ 决策 168：裁决模型的思考等级（**默认 `off`** —— 用户要求关到最低；
  //    ⚠️ 且**即使"跟随主会话模型"也要关** ⇒ 调用处显式传，不依赖模型默认）。
  tagNormalizeReasoningEffort: 'off',
  // ⭐⭐ 决策 165：有知识沉淀时**自动**跑一次标签规范化（默认开）。
  tagNormalizeOnHandoff: true,
  // ⭐⭐⭐ 知识评分（决策 177 / 178）：总开关**默认关**（用户裁定）；**其余是它的参数**。
  hotScoreOnTurnEnd: false,
  hotScoreThreshold: 0.7,
  hotScoreWindowHours: 30,
  hotScoreTopN: 20,
  // ⭐⭐⭐ 入围门槛（决策 182）：**分数 ≥ 2 或 上一轮刚加入的**（OR 关系，见 schema 注释）。
  hotScoreGateMinScore: 2,
  hotScoreGateLastTurn: true,
  // ⭐⭐⭐ 每轮最多选几条（决策 180）。⚠️ 与 `hotScoreTopN`（注入取前几名）**不是一回事**。
  hotScoreMaxPicks: 10,
  hotScoreMinChars: 100,
  // ⭐⭐⭐ **默认通路 = `chat`**（决策 178；用户 2026-09-29 裁定：
  //    *"你先把 jev 通路搁置……加个 chat 通路。你用 wb 的 deepseek-v4.1-flash 去做，
  //      让他选出真正能帮助到项目的，并且给出理由。不限制条数。思考关掉。"*）
  //    ⚠️ 两条通路的**产出契约不同**（见 `score-turn.ts` 的分派注释）：
  //       · `chat` ⇒ 选出条目 + 理由，**不限条数**，选中即 +1（**没有分数**）；
  //       · `jev`  ⇒ 逐条分数，靠**绝对阈值**切，按分数分档。
  //    ⚠️ **JEV 那套完整保留** —— 换回去只需改这个键，不必改代码。
  hotScoreChannel: 'chat',
  // ⭐⭐⭐ **复盘模型**（形态跟着通路：chat ⇒ `provider/model`、jev ⇒ 纯模型名）。
  //    ⭐ 默认 WorkBuddy 的 `deepseek-v4.1-flash`（用户 2026-09-29 点名）。
  hotScoreModel: 'workbuddy/deepseek-v4.1-flash',
  // ⭐⭐ **起子代理用的模型**（两个都空 = 跟随主会话；⚠️ 只是壳，不必用贵模型）。
  hotScoreSubagentProvider: '',
  hotScoreSubagentModel: '',
  // ⚠️ 比注入的默认（10s）长：它在后台跑，慢一点无所谓，但**超时就会白跑一次**。
  hotScoreTimeoutMs: 60000,
  // ⭐⭐ 主动注入（设计文档 §10）：总开关**默认关**（失败模式不对称：漏做只是少做）。
  //    ⚠️ 用户 2026-09-26 裁定：默认通路 chat、默认范围 project+themes、默认严格档。
  activeInject: false,
  activeInjectChannel: 'chat',
  activeInjectModel: '',
  activeInjectScope: 'project+themes',
  // ⭐ 用户裁定 B：JEV 通路把默认档降级成 project（实测 project+themes 在 JEV 上 245 条，
  //    已超 240 硬顶 ⇒ 默认配置下会每次都吃一次粗筛）。
  activeInjectJevNarrowScope: true,
  activeInjectStrict: true,
  activeInjectTopK: 5,
  // ⭐⭐ 2026-09-29：`activeInjectBand` 拆成两个键（见 schema 处的长注释）。
  //    · `activeInjectNeedMin`  = 「要不要注入」的门槛（总控分 `need`）
  //    · `activeInjectItemMin`  = 「哪几条候选够格」的门槛（逐条 `noul`）
  //    ⚠️ 旧键 `activeInjectBand` **保留可写**（避免已有 patch 变成未知键），
  //       由 `needMinOf()` / `itemMinOf()` 回落 —— 与 `maxInjectionsPerTurn` 同一套做法。
  activeInjectNeedMin: 0.7,
  activeInjectItemMin: 0.7,
  activeInjectTimeoutMs: 8000,
  activeInjectContextRounds: 3,
  // ⚠️ 240 = JEV 实测硬顶（258 条会 max_tokens_exceeded）。
  activeInjectPoolMax: 240,
  activeInjectExplain: false,
  activeInjectSearchIntentGate: true,
  // ⚠️ 0.85 刻意保守：「打算搜 ≠ 搜得到」（memj_search 是整词匹配，实测 top1 只中 5/10）
  //    ⇒ 宁可漏抑制（多给一次），也不要误抑制（该给没给）。
  activeInjectSearchIntentMin: 0.85,
  activeInjectSufficientGate: true,
  activeInjectSufficientMin: 0.85,
  // ⭐⭐ 每 turn 最多【注入】几次（2026-09-27：从"调用"改成"注入"）。
  //    ⚠️ 旧键 `activeInjectMaxCallsPerTurn` **不在这里给值** —— 由
  //       `maxInjectionsPerTurn()` 回落，避免把"没写"当成"写了"。
  activeInjectMaxInjectionsPerTurn: ACTIVE_MAX_INJECTIONS_DEFAULT,
  // ⚠️ 旧键**在这里只为了让 TS 过**（schemastery 的 `ObjectT` 把**所有**键都算必填，
  //    哪怕 schema 上写了 `.required(false)`）。
  //    🔴 **别拿它当"旧键还有默认值"的证据** —— 真正的取值只看
  //    `maxInjectionsPerTurn()`（新键 → 旧键 → 常量）。
  activeInjectMaxCallsPerTurn: ACTIVE_MAX_INJECTIONS_DEFAULT,
  activeInjectReasoningMaxChars: 800,
  // ⭐⭐⭐ 预算与拆批（用户 2026-09-26 定稿方案；**已替代"裁候选池"**）
  activeInjectBudget: true,
  // ⚠️ 40k 是用户定的（**单次请求**上限，含输入+输出）。
  activeInjectBudgetTokens: 40000,
  // ⚠️ 上下文名义预算 20k；不够时 planInjection 会往下压到地板。
  activeInjectContextTokens: 20000,
  activeInjectConcurrency: 3,
  activeInjectChatWindowRatio: 0.6,
  // ⭐ 召回日志的"请求快照"（B 档）默认关 —— 每步数十 KB，几轮就能写爆磁盘。
  activeRecallLogRequest: false,
  activeInjectPoolMin: 10,
  activeInjectJevEndpoint: 'https://api.knox.chat/v1/systemone',
  activeInjectJevApiKeyEnv: 'KNOX_API_KEY',
  // ⭐ 两条 jev 通路共用的模型名（空则回落到各功能自己的键）。
  jevModel: 'jev-latest',
  decisionProviders: [],
  activeInjectDecisionPick: '',
  hotScoreDecisionPick: '',
}

/** 一个决策模型 provider（= `decisionProviders` 的元素）。 */
export interface DecisionProvider {
  id: string
  displayName: string
  endpoint: string
  models: string[]
}

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
export function deriveDecisionKeyRef(providerId: string): string {
  const stem = providerId.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `${stem === '' ? 'DECISION' : stem}_API_KEY`
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
export function decisionProvidersOf(config: {
  decisionProviders?: DecisionProvider[]
  activeInjectJevEndpoint?: string
  activeInjectJevApiKeyEnv?: string
  jevModel?: string
}): DecisionProvider[] {
  const list = (config.decisionProviders ?? []).filter((p) => p.id.trim() !== '')
  if (list.length > 0) return list
  // ── 回落：把三条旧键拼成一条 provider ──
  const endpoint = (config.activeInjectJevEndpoint ?? '').trim()
  const model = (config.jevModel ?? '').trim()
  // ⚠️ 端点与模型都空 ⇒ 真的没配，回空列表（别再编一条出来）。
  if (endpoint === '' || model === '') return []
  // ⚠️ 旧键的凭据名可能是别的（用户手工改过）⇒ **照实带着它**，不强行派生
  //    （否则会去一个不存在的名字下找密钥 ⇒ 静默取不到值）。
  return [{ id: 'knox', displayName: '', endpoint, models: [model] }]
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
export function resolveDecisionPick(
  providers: DecisionProvider[],
  pick: string,
  fallbackProviderId = 'knox',
): { provider: string; model: string; endpoint: string; keyRef: string } {
  const raw = (pick ?? '').trim()
  let pid = ''
  let model = ''
  if (raw !== '') {
    const i = raw.indexOf('/')
    // ⚠️ 用**首个 `/`** 拆（模型名本身可能含 `/`，如 `tencent/Hunyuan-MT-7B`）。
    if (i > 0 && i < raw.length - 1) {
      pid = raw.slice(0, i)
      model = raw.slice(i + 1)
    } else {
      // 没有 `/` ⇒ 当作"裸模型名"，在 providers 里找它属于谁（兼容旧形态）。
      const hit = providers.find((p) => p.models.includes(raw))
      if (hit !== undefined) {
        pid = hit.id
        model = raw
      }
    }
  }
  // 找不到指定的 provider ⇒ 回落到兜底那条（或第一条）。
  const prov = providers.find((p) => p.id === pid)
    ?? providers.find((p) => p.id === fallbackProviderId)
    ?? providers[0]
  if (prov === undefined) return { provider: '', model: '', endpoint: '', keyRef: '' }
  const m = model !== '' && prov.models.includes(model)
    ? model
    : (prov.models[0] ?? '')
  return {
    provider: prov.id,
    model: m,
    endpoint: prov.endpoint,
    keyRef: deriveDecisionKeyRef(prov.id),
  }
}

/**
 * ⭐ **主动注入（召回）那条通路当前选中的决策模型**。
 *
 * 回落：`activeInjectDecisionPick`（新）→ `activeInjectModel`（旧，可能是裸模型名）。
 */
export function activeDecisionOf(config: MemjConfig): {
  provider: string; model: string; endpoint: string; keyRef: string
} {
  const providers = decisionProvidersOf(config)
  const pick = (config.activeInjectDecisionPick ?? '').trim() !== ''
    ? config.activeInjectDecisionPick
    : (config.activeInjectModel ?? '').trim()
  return resolveDecisionPick(providers, pick, 'knox')
}

/** ⭐ **轮末评分那条通路当前选中的决策模型**（回落：`hotScoreModel`）。 */
export function scoreDecisionOf(config: MemjConfig): {
  provider: string; model: string; endpoint: string; keyRef: string
} {
  const providers = decisionProvidersOf(config)
  const pick = (config.hotScoreDecisionPick ?? '').trim() !== ''
    ? config.hotScoreDecisionPick
    : (config.hotScoreModel ?? '').trim()
  return resolveDecisionPick(providers, pick, 'knox')
}
