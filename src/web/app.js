/**
 * memj 人侧面板（纯前端，零依赖）—— **四标签导航 + 左列表右详情**（§8.2，决策 83）。
 *
 * ## 这一版和旧版的区别
 * 旧版是"单页长列表"（提名/断链/非法封面/全部封面四节平铺）；
 * 新版按 §8.2 改成四个顶层标签：**知识库 / 项目 / 热知识 / 审批**。
 *
 * ## 三条来自设计的硬约束
 *  1. 🔴 **只做"给人看 + 人的动作"**（决策 42）：提名与断链只在这里出现，不进 LLM 工具。
 *  2. 🔴 **详情数据走「按 id 取」**（§8.2）：`/api/entry?id=…`、`/api/project?id=…`，
 *     **前端绝不自己拼文件路径**——那等于把库内布局暴露给浏览器。
 *  3. 🔴 **Markdown 渲染关掉原始 HTML 直通**（§8.4）：marked 默认放行 `<script>`；
 *     知识正文是 LLM 写的、且可被人手改，**不能当可信输入** ⇒ 把 html token 转义。
 *     断网时（`window.marked` 不存在）**不渲染、直接显示原文**（决策 86）。
 *
 * ## 写能力（§8.6，决策 91）
 * 只有两处，且都走服务端硬校验：**非法封面修复**（`/api/fix-cover`）、
 * **断链重填路径**（`/api/fix-ref`）。其余一律只读。
 */

const API = '/plugins/dsh-memj/api'

/** 顶层标签（顺序即显示顺序）。 */
const TABS = ['kb', 'projects', 'themes', 'hot', 'review', 'archive', 'settings']
// ⭐⭐ 设置页的子导航（决策 169）。⚠️ 与 SUBTABS / ARC_SUBTABS / HOT_SUBTABS
//    **必须分开**，否则各页子标签会互相抢 `active`。
//    ⭐ 分页轴 = 知识在哪个环节被动用：沉淀 → 热知识 → 主动注入 → 英文索引。
//    ⚠️ 2026-09-28：**「标签规范化」已从 index 页搬到 sink 页**（用户要求）——
//       它是"沉淀之后的整理"，与"沉淀"同属**写入侧**；而英文索引服务于**召回**。
//       ⭐ 所以 index 页的标签也从"索引与规范化"改成了"英文索引"。
//    ⭐⭐⭐ 2026-09-29：**新增 `prompts`**（用户需求）。
//    ⭐⭐⭐ 2026-10-12：**该页的分组轴换成"谁在什么时候看到这段文本"**
//       （旧轴"生效方式与影响面"对看页面的人没用 —— 用户原话：
//        *"这样拆，每条都那么一两句话，完全不知道咋回事"*）。
//       ⇒ **分组不再手写在前端**：由服务端 `GET /api/prompts` 的 `groups` 回，
//         前端只负责画（本项目判据：能给人看的列表必须由服务端回结构化条目）。
//    ⭐⭐⭐ 2026-10-07：**新增 `jev`**（决策模型配置）—— 用户要求"能在前端配 JEV"。
//       🔴 **它不进 `SAVE_UNITS`**：本页的三个动作语义各不相同（保存配置 / 保存密钥 /
//          测试连接），而不是"一个版块一个保存按钮"那一套。
const SET_SUBTABS = ['sink', 'hot', 'active', 'index', 'jev', 'prompts', 'templates', 'kinds']

/**
 * ⭐⭐⭐ **保存单元 → 所属子页**（2026-10-07，用户裁定）。
 *
 * 🔴 **为什么要这张表**：`data-savepage` 原来**同时**当"子页名"用
 *    （保存按钮、消息区 id、`openSettingsPage` 的页面判定全按它算）。
 *    现在**每个设置版块各存各的** ⇒ **单元 ≠ 子页**，两件事必须分开：
 *      · **单元**（`data-savepage` / `settings-msg-<单元>` / `data-unit`）= 一次提交的粒度；
 *      · **子页**（`state.setSub` / `#setsub-<页>`）= 界面上一次看一屏的粒度。
 *    ⚠️ **不分开的后果**：`settings-msg-sink` 这种"页级" id **已经不存在了**
 *       ⇒ 保存结果那行字**永远不显示**（静默：按钮照常工作、只是没有反馈）。
 *
 * ⭐⭐⭐ 用户 2026-10-07 第二次裁定：*"还是把所有设置页面的子页面，
 *    全都按设置板块去分别保存吧。不要按页去保存了。"*
 *    ⇒ 从"只有沉淀页拆"扩到**全部设置页**。
 *    🔴 **为什么这不是"为了整齐"**：绑在一起意味着**改一处要连带提交十几项**，
 *      任一处读值/校验出错就**整页存不了**，而且报错会指向一个
 *      **当前版块根本没有的字段**（本项目已两次踩到这个形态：决策 169、
 *      以及"删了控件却留着读它的代码"）。
 *    ⚠️ 顺带一个真实收益：git 环境探测、召回模型守卫这类**有代价的前置动作**，
 *      只在本版块保存时跑 —— 以前改个阈值也会顺带探一次 git。
 *
 * ⭐⭐⭐ 用户 2026-10-07 第三次裁定：*"热知识注入和主动注入的总开关不需要保存按钮，
 *    应该是点击开关直接生效的。"*
 *    ⇒ `hot-inject`（启用热知识注入）与 `active-on`（启用主动注入）**移出本表**：
 *      它们由 `change` 事件**即时写配置**（见 `bindInstantToggles`）。
 *    🔴 **判据（为什么不给所有键都做成即时）**：**一个键、独立成项、无配套参数** ⇒
 *      即时生效最自然（点了就是它的全部语义）。
 *      而带**配套参数**的版块（如"预算"有 5 个数值）必须留保存按钮 ——
 *      否则每敲一个字符就写一次盘，且**半成品配置会被热重载吃进去**（状态不一致）。
 */
const SAVE_UNITS = {
  // ── 沉淀 ──
  'sink-theme': 'sink',
  'sink-progress': 'sink',
  'sink-git': 'sink',
  'sink-tag': 'sink',
  // ── 热知识注入 ──
  // ⚠️ `hot-inject`（总开关）**故意不在这里** —— 它是即时生效项。
  'hot-budget': 'hot',
  'hot-score': 'hot',
  // ── 主动注入 ──
  // ⚠️ `active-on`（总开关）**故意不在这里** —— 它是即时生效项。
  'active-recall': 'active',
  'active-judge': 'active',
  'active-budget': 'active',
  'active-gate': 'active',
  'active-debug': 'active',
  // ── 英文索引 ──
  'index-en': 'index',
}

/**
 * ⭐⭐⭐ **即时生效的开关**（用户 2026-10-07 裁定）：`[控件 id, 配置键, 所属子页]`。
 *
 * 🔴 **与"保存单元"的区别**：这些**没有保存按钮**，勾选/取消**立刻写配置**。
 *    ⇒ 它们**不属于 `SAVE_UNITS`**（那是"按钮驱动"的表），是另一条通道。
 * ⚠️ **别把带配套参数的项塞进来**：即时写盘的前提是"这一个勾选就是全部语义"。
 *    例：`ai-strict`（严格触发口径）看着也像个开关，但它与同版的通路/模型/范围
 *    一起构成"召回模型"那一块、且保存时要过"开着却没选模型"那道守卫
 *    ⇒ **它仍留在 `active-recall` 里走保存按钮**。
 * ⚠️ 第三列是**所属子页**——`saveUnitsOf` 靠它把即时开关也算进"本页要清的消息"。
 */
const INSTANT_TOGGLES = [
  ['hot-inject-enabled', 'hotInject', 'hot'],
  ['ai-on', 'activeInject', 'active'],
]

/**
 * ⭐⭐ **每个子页上有哪些"会写配置的项"**（用于消息清理）。
 *
 * 🔴 与 `SAVE_UNITS` **互为反向**，必须是同一份事实的两个方向：
 *    改了 `SAVE_UNITS` 而忘了这里 ⇒ 某个单元保存后**不会刷新**（值看着没变）。
 *    ⚠️ 本项目判据：这种"两份互逆清单"要**从同一份推导**，不要手抄两遍
 *       （故这里由 `SAVE_UNITS` 现算，不写死）。
 * ⭐⭐ 2026-10-07：**即时生效的开关也要算进来**（它们同样写配置、同样要显示回执）
 *    —— 否则切页回来时那行"已保存"清不掉，用户会以为是这一次操作的结果。
 * @param page - 子页 id（`sink` / `hot` / `active` / `index`）。
 * @returns 该页上所有会写配置的项 id（保存单元 + 即时开关）。
 */
function saveUnitsOf(page) {
  const units = Object.keys(SAVE_UNITS).filter((u) => SAVE_UNITS[u] === page)
  // ⚠️ 即时开关的 id **本身就是**它那一项的名字（与保存单元同一套取值口径）。
  const instant = INSTANT_TOGGLES.filter(([, , p]) => p === page).map(([id]) => id)
  const all = [...units, ...instant]
  return all.length > 0 ? all : [page]
}

/**
 * ⭐⭐⭐ **每个保存单元里的数值键**：`[控件 id, 配置键, 显示名, min, max, 是否必须整数]`。
 *
 * 🔴🔴 **这张表同时驱动【校验】与【提交】两件事**（本项目铁律"实现只留一份"）。
 *    以前它们是分开写的：一张 `aiDefs` 管校验、另一处再列一遍键名管提交 ——
 *    那种写法下**插入一个控件就可能让两边错位**（实测踩过：按下标取值的时代，
 *    中间插 3 个控件就让后面全部错位，而**报错不在插入处**、
 *    只是把值写到了别的配置键上）。
 *    ⇒ 现在两者来自同一行：**结构上不可能漂移**。
 *
 * ⚠️ **按单元分组 = 按【读值】裁剪**。这一点是本项目最贵的一课（决策 169）：
 *    只裁提交体、不裁读值 ⇒ 在 A 版块点保存时它仍去读 B 版块的控件，
 *    而 B 的控件此刻可能是空的 ⇒ 报「某某必须是 1–50 之间的整数」，
 *    那个字段**在 A 版块界面上根本不存在**。
 *    ⇒ ⭐ 判据：**"拆分"必须同时裁【写】与【读】两条路径**。
 *
 * ⚠️ `integer` 要如实标：小数键写成 `true` 会把 0.6 拒掉（本项目踩过）。
 */
const NUM_KEYS = {
  // ── 沉淀 · 当前进度自动截断归档 ──
  'sink-progress': [
    ['progress-warn', 'progressCharsWarn', '触发阈值', 1000, 1000000, true],
    ['progress-keep', 'progressCharsKeep', '截断目标', 1000, 1000000, true],
  ],
  // ── 热知识注入 · 预算 ──
  'hot-budget': [
    ['hot-ratio', 'hotInjectRatio', '注入上限比例', 0, 100, false],
    ['hot-cpt', 'hotCharsPerToken', '字符/token 换算', 0.1, 10, false],
    ['hot-budget', 'hotBudgetCharsFallback', '窗口未知时的上限', 1000, 10000000, true],
    ['hot-full-warn', 'hotFullWarnChars', '单条正文提醒阈值', 1, 1000000, true],
    ['hot-keep', 'hotSessionKeep', '会话绑定保留数', 1, 10000, true],
  ],
  // ── 热知识注入 · 知识评分（决策 177）──
  'hot-score': [
    ['hs-threshold', 'hotScoreThreshold', '加分阈值', 0, 1, false],
    ['hs-window', 'hotScoreWindowHours', '滚动窗口小时数', 0.1, 10000, false],
    ['hs-topn', 'hotScoreTopN', '注入前几名', 1, 200, true],
    // ⭐ 决策 180：每轮最多选几条（**写入侧**，与 `hs-topn` 那个读取侧不是一回事）。
    ['hs-maxpicks', 'hotScoreMaxPicks', '每轮最多选几条', 1, 200, true],
    // ⭐ 决策 182：入围门槛分数（⚠️ 1–1000，不是 0–1 —— 它比的是**累计分**）。
    ['hs-gate-min', 'hotScoreGateMinScore', '入围门槛：至少几分', 1, 1000, true],
    ['hs-minchars', 'hotScoreMinChars', '低于多少字符不评分', 0, 1000000, true],
    ['hs-timeout', 'hotScoreTimeoutMs', '复盘超时', 1000, 300000, true],
  ],
  // ── 英文索引 ──
  'index-en': [
    ['tr-conc', 'translateConcurrency', '翻译并发', 1, 20, true],
  ],
  // ── 主动注入 · 判断参数 ──
  'active-judge': [
    ['ai-topk', 'activeInjectTopK', '最多注入条数', 1, 50, true],
    // ⭐⭐ 原来的 `ai-band`（一个键兼两个语义）拆成两个控件。
    //    · need-min  = 「要不要注入」（总控分）
    //    · item-min  = 「哪几条候选够格」（逐条候选分）
    //    ⚠️ 键名与 id 只差一个词，**别写反** —— 写反的后果是"两个阈值被换掉"，
    //       而它**不报错**（两个都是 0–1 的合法分数），只表现为筛选行为莫名改变。
    ['ai-need-min', 'activeInjectNeedMin', '需求阈值（要不要注入）', 0, 1, false],
    ['ai-item-min', 'activeInjectItemMin', '入选阈值（哪几条够格）', 0, 1, false],
    ['ai-timeout', 'activeInjectTimeoutMs', '召回超时', 500, 120000, true],
    ['ai-calls', 'activeInjectMaxInjectionsPerTurn', '每 turn 注入上限', 0, 50, true],
    ['ai-reasoncap', 'activeInjectReasoningMaxChars', '思考段字符上限', 100, 100000, true],
  ],
  // ── 主动注入 · 预算与拆批并发 ──
  'active-budget': [
    ['ai-budgettok', 'activeInjectBudgetTokens', 'JEV 预算(token)', 1000, 200000, true],
    ['ai-ctxtok', 'activeInjectContextTokens', '上下文名义预算', 1000, 200000, true],
    ['ai-conc', 'activeInjectConcurrency', '并发批数上限', 1, 16, true],
    // ⚠️ **小数键** ⇒ integer=false（写成 true 会把 0.6 拒掉）
    ['ai-chatratio', 'activeInjectChatWindowRatio', 'chat 占窗口比例', 0.1, 1, false],
  ],
  // ── 主动注入 · 抑制门（两个阈值在描述文字里内联，见 `.inline-num`）──
  'active-gate': [
    ['ai-suff-min', 'activeInjectSufficientMin', '已有知识充足阈值', 0, 1, false],
    ['ai-intent-min', 'activeInjectSearchIntentMin', '检索意图阈值', 0, 1, false],
  ],
}

/**
 * ⭐⭐ **【提示词】页的分组排序兜底**（2026-10-12）。
 *
 * 🔴 **分组本身由服务端回**（`state.promptGroups`，来自 `GET /api/prompts` 的 `groups`）——
 *    这里**只留一份兜底顺序**，用于服务端没回（旧进程）时不至于乱序。
 * ⚠️ **不在这里写组标题与说明**：那些是文案，唯一出处是 `src/prompt-catalog.ts`
 *    （前端再抄一份必然漂开 —— 本项目已记过多次"多副本"的坑）。
 */
const PROMPT_GROUP_FALLBACK = [
  'resident', 'tools', 'commands', 'actions', 'hot',
  'recall', 'score', 'tags', 'translate', 'templates',
]

/**
 * ⭐⭐ **所有列表的每页条数**（用户 2026-09-25：*"默认一次加载50条"*）。
 *
 * 🔴 **只有一个数字**（本项目铁律：实现只留一份）——
 *    改这里，**9 个列表**的分页一起变。
 */
const PAGE_SIZE = 50

/** 审批页子标签。 */
const SUBTABS = ['pending', 'invalid', 'broken']

/**
 * ⭐ **归档页子标签**（决策 133）——两个子导航页：知识 / 项目。
 *
 * 🔴 **为什么另起一个数组、而不是塞进 `SUBTABS`**：`renderTabs()` 用的是
 *    **共享的** `state.sub`，而 `SUBTABS` 的三个值属于**审批页**。
 *    两者混在一起，会出现"从审批页切到归档页时，`state.sub` 还停在 `pending`
 *    ⇒ 归档页两个子页**都不显示**"（`sub-*` 面板一个都不匹配）。
 *    ⇒ 归档页用**自己的** `state.arcSub`。
 */
const ARC_SUBTABS = ['entry', 'project']

// ───────────────────────────────────────────────────────────────────────────
// 小工具
// ───────────────────────────────────────────────────────────────────────────

/**
 * 取 JSON；失败时抛。
 *
 * ⚠️ 抛出的 Error 上挂了 `body`——修复表单需要读 `body.issues` 逐条显示校验问题。
 * @param path - API 路径。
 * @returns 解析后的 body。
 */
async function getJson(path) {
  const res = await fetch(`${API}${path}`, { cache: 'no-store' })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`)
    err.body = body
    throw err
  }
  return body
}

/** 发 POST JSON（错误同样挂 `body`）。 */
async function postJson(path, payload) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`)
    err.body = body
    throw err
  }
  return body
}

/** 轻量 toast。 */
function toast(msg, isErr = false) {
  let el = document.querySelector('.toast')
  if (!el) {
    el = document.createElement('div')
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.classList.toggle('err', isErr)
  el.classList.add('show')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), 3600)
}

/** 建一个元素。 */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k === 'html') el.innerHTML = v
    else if (k === 'value') el.value = v
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
    else if (v === true) el.setAttribute(k, '')
    else if (v !== false && v != null) el.setAttribute(k, v)
  }
  for (const kid of kids) if (kid != null && kid !== '') el.append(kid)
  return el
}

/** 小标签。 */
function tag(text, cls = '') {
  return h('span', { class: `tag ${cls}`.trim(), text })
}

/** 把原始块里的某个字段抠出来（块本身就是 YAML 文本）。 */
function pickField(raw, key) {
  const m = new RegExp(`^\\s*${key}:\\s*(.*)$`, 'm').exec(raw)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

/** 抠出一个数组字段（支持 `[a, b]` 与 `a, b` 两种写法）。 */
function pickArray(raw, key) {
  const v = pickField(raw, key)
  if (v === '') return []
  const inner = /^\[(.*)\]$/.exec(v)
  const body = inner ? inner[1] : v
  return body
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((s) => s !== '')
}

// ───────────────────────────────────────────────────────────────────────────
// Markdown 渲染（§8.4）
// ───────────────────────────────────────────────────────────────────────────

/** 是否已经配好"转义原始 HTML"的 renderer。 */
let markedReady = false

/**
 * 配置 marked：**把原始 HTML 转义成文本**（§8.4 的安全要求）。
 *
 * 🔴 为什么必须做：marked 默认**原样放行** HTML（实测 `<script>alert(1)</script>`
 * 原样输出、`<img src=x onerror=…>` 同样放行）。知识正文是 LLM 写的、且可被人手改，
 * 不能当可信输入。转义后它只会**显示成文字**，不会执行。
 * ⚠️ 实测该做法**不影响** GFM 表格与代码块渲染。
 * @returns 是否可用（`window.marked` 不存在 = 断网，返回 false）。
 */
function setupMarked() {
  if (markedReady) return true
  if (typeof window.marked === 'undefined') return false
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  try {
    window.marked.use({
      renderer: {
        html(token) {
          const raw = typeof token === 'string' ? token : (token?.text ?? token?.raw ?? '')
          return esc(raw)
        },
      },
    })
    markedReady = true
    return true
  } catch {
    return false
  }
}

/**
 * ⭐⭐ **把正文里的「条目 UUID」变成可点击的内部链接**（决策 137）。
 *
 * ── 为什么需要 ─────────────────────────────────────────────────────────────
 * 「当前进度」被自动截断后会留一行：
 * `- **第22~36批**：详见条目 \`091a8a75-aa16-4918-b01f-1110ba04607a\`。`
 * 用户要求：**那个 id 要能点，跳到知识库详情页**。
 *
 * ── 判据（**任何 UUID** 都变，不限定句式）────────────────────────────────
 * 用户裁定：**"任何 UUID"** ⇒ 不去匹配"详见条目"这个句式，
 * 而是**认 UUID 的形状**（8-4-4-4-12）。⭐ 好处：正文里任何地方提到一条知识
 * （不止历史进展那一行）都能点，**这是更通用的能力**。
 *
 * 🔴 **只改"孤立的"行内代码**——必须排除两种情况，否则会误伤：
 *  ① 代码块（`pre` / `pre code`）里的 UUID（那是**示例/输出**，不该变链接）；
 *  ② `<a>` 里已有的链接（避免套娃）。
 *
 * ⚠️ **`marked` 输出里行内代码是 `<code>xxx</code>`**（无 class）；
 *    围栏代码块是 `<pre><code class="language-…">` ⇒ 用 `closest('pre')` 一刀切掉。
 * @param root - 已渲染好的正文容器（原地修改）。
 */
function linkifyEntryIds(root) {
  // UUID v4 形状即可（`id` 由 `randomUUID()` 生成，恒为此形）。
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  for (const code of root.querySelectorAll('code')) {
    // ① 代码块里的不动（那是示例，不是引用）。
    if (code.closest('pre') !== null) continue
    const id = code.textContent.trim()
    if (!UUID_RE.test(id)) continue
    // ② 已经是链接的（或外面套着链接的）不动——避免 `<a><a>`。
    if (code.closest('a') !== null) continue
    const a = document.createElement('a')
    a.className = 'entry-link'
    a.href = `#/kb/${id}`
    // ⭐ 与全站导航一致：**走 `replaceState`**（决策 129）——
    //    用 `<a href>` 的默认行为会污染历史（本项目实测踩过）。
    a.addEventListener('click', (e) => { e.preventDefault(); navigate(`#/kb/${id}`) })
    a.title = '在知识库里打开这条条目'
    a.textContent = id
    code.replaceWith(a)
  }
}

/**
 * 渲染正文：能渲染就渲染，**断网就原样显示**（决策 86：不做降级解析）。
 * @param body - markdown 原文。
 * @returns 承载内容的元素。
 */
function renderBody(body) {
  const wrap = h('div', { class: 'md' })
  if (setupMarked()) {
    try {
      wrap.innerHTML = window.marked.parse(body, { gfm: true, breaks: false })
      // 给标题加稳定 id，便于锚点跳转（参考 mdview.html）。
      const seen = {}
      wrap.querySelectorAll('h1,h2,h3,h4').forEach((el) => {
        let id = el.textContent.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '')
        if (id === '') id = 'section'
        if (seen[id]) { seen[id] += 1; id = `${id}-${seen[id]}` } else { seen[id] = 1 }
        el.id = id
      })
      // ⭐⭐ **条目 id 可点**（决策 137）——必须在 `innerHTML` 之后做。
      linkifyEntryIds(wrap)
      return wrap
    } catch {
      wrap.replaceChildren()
    }
  }
  // ⭐ 断网兜底：不渲染，直接显示原文。
  wrap.append(
    h('div', { class: 'notice warn', text: '⚠️ Markdown 渲染库未加载（首次需联网）——以下是原文。' }),
    h('pre', { class: 'raw', text: body }),
  )
  return wrap
}

// ───────────────────────────────────────────────────────────────────────────
// ⭐⭐ 详情页目录（决策 132）
//
// 用户要求：**会渲染 md 的详情页**，左侧边放一个悬浮按钮「展开目录」；
// 点开后目录**从右侧栏往左滑出、正好覆盖左侧列表栏**，按钮变「收起目录」；
// 再点即收起、露出原本的列表。目录交互**照搬参考实现 `mdview.html`**。
//
// 🔴 与本项目既有纪律的两处对齐：
//  ① **点击不碰 `location.hash`**——决策 129 刚把全部导航改成页内（hash 赋值
//     等价于 `pushState`，会污染历史）。这里用 `scrollIntoView` 且**不写 hash**
//     ⇒ 目录跳转**不产生任何历史记录**，后退行为不受影响。
//  ② **滚动监听挂在详情自己的滚动容器上**（`.detail`），不是 `window`。
// ───────────────────────────────────────────────────────────────────────────

/**
 * 移除某详情容器上已挂的目录（按钮 + 面板 + 滚动监听）。
 *
 * 🔴 **必须在每次重画详情时先调**：否则从"有条目"切到"空/加载失败"时，
 *    旧目录会**留在新页面上**（那条路径根本不会走到 `attachToc`）。
 * @param detailBox - 详情容器。
 */
function clearToc(detailBox) {
  const side = detailBox?.parentElement?.querySelector('.side')
  if (side) {
    side.classList.remove('toc-open')
    for (const el of side.querySelectorAll('.toc-layer, .toc-btn')) el.remove()
  }
  if (detailBox) {
    detailBox.onscroll = null
    detailBox.classList.remove('has-toc')
  }
}

/**
 * 从已渲染的正文里采集标题，生成目录按钮与目录面板。
 *
 * 交互照搬参考实现 `mdview.html`：**h1–h4 入目录、h3/h4 缩进一档、
 * 点击平滑滚到该节、滚动时高亮当前节**。
 *
 * ⚠️ **按钮的显示判据**（用户原话："有正文就显示，哪怕最后目录只有一行也没关系。
 *    不过如果对应库是空的时候，是不显示按钮的"）：
 *    ⇒ 判据是**"正文是不是空的"**，**不是"有没有标题"**。
 *    ⭐ 所以正文非空、但一个小节都没有时**照样出按钮**，面板里写「（本篇无小节）」——
 *       用户明确说"不用专门区分了"，不必为这种情况做特例。
 *    ⛔ 正文为空（`''`）⇒ **不显示按钮**。
 *
 * @param detailBox - 详情容器（滚动发生在它身上）。
 * @param mdWrap - `renderBody()` 返回的 `.md` 元素。
 * @param bodyText - 正文原文（**判据用它，不用 DOM**——渲染失败时 DOM 会成为 `pre` 原文）。
 */
function attachToc(detailBox, mdWrap, bodyText) {
  const side = detailBox?.parentElement?.querySelector('.side')
  if (!side || !mdWrap) return
  clearToc(detailBox)
  if (String(bodyText ?? '').trim() === '') return

  const heads = [...mdWrap.querySelectorAll('h1,h2,h3,h4')]

  const list = h('div', { class: 'toc-list' })
  /** @type {Array<{a: HTMLElement, el: HTMLElement}>} */
  const pairs = []
  for (const el of heads) {
    const a = h('a', {
      class: /^H[34]$/.test(el.tagName) ? 'lvl3' : '',
      text: el.textContent.trim() || '(无标题)',
      tabindex: '0',
    })
    const jump = (e) => {
      e.preventDefault()   // 🔴 不写 hash（决策 129：hash 赋值 = pushState）
      // 🔴🔴 **不能再用 `el.scrollIntoView()`**（2026-09-20 用户报告"跳转时目录也跟着跳"）：
      //    `scrollIntoView` 会**滚动所有可滚祖先**——包括那些 `overflow: hidden` 的容器
      //    （它们是**可编程滚动**的，只是没有滚动条）。
      //    而在**有子导航页**的页面里（审批 / 归档），目录面板挂在 `.side` 上、
      //    `.side` 又在这个可滚的 `.subpanel` 里 ⇒ 祖先被滚一下，**目录自己跟着位移**。
      //    ⭐ 判据：**只想滚"某一个"容器时，必须直接算它的 `scrollTop`**，
      //       不要用会自动沿祖先链找目标的 `scrollIntoView`。
      //    ⚠️ 用相对位置算：`标题相对视口的 top − 容器相对视口的 top + 容器当前 scrollTop`。
      const boxTop = detailBox.getBoundingClientRect().top
      detailBox.scrollTo({
        top: detailBox.scrollTop + (el.getBoundingClientRect().top - boxTop),
        behavior: 'smooth',
      })
      // ⭐⭐ **窄屏下跳转后自动收起目录**（用户 2026-09-24 要求：
      //    *"点击跳专项后，应该自动收起。"*）。
      // 🔴 **为什么只在窄屏收**：宽屏下目录面板挂在左栏（`.side`）里、**不遮挡正文**
      //    ⇒ 用户可以连着点好几节；**收起来反而要重新展开**。
      //    而窄屏下它是**全屏遮罩**，不收的话**根本看不到跳过去的正文**
      //    （跳转等于没发生）。
      // ⭐ 判据：**"跳完要不要收"取决于"它遮不遮住目标"**，不是统一规定。
      // ⚠️ 用 `isNarrow()`（与 CSS 断点同一个 900）——**不在 JS 里另写一个数字**。
      // ⚠️⚠️ **这里引用的 `setOpen` 定义在本行【之后】**（它在下面那段 `const btn = …` 旁边）
      //    —— 这是**安全的**，因为 `jump` 只在**点击时**执行，那一刻 `setOpen` 早已初始化
      //    （⭐ 已用最小实验确认：闭包内**延迟调用** OK；**同步立即调用**才会
      //      `ReferenceError: Cannot access before initialization`）。
      //    🔴 所以**别把本段改成同步执行**（例如挪到函数体外、或在 `attachToc` 里直接调一遍），
      //      那会立刻撞上 TDZ。本项目已记过"TDZ 只在点击时才炸、很难发现"。
      if (isNarrow()) setOpen(false)
    }
    a.onclick = jump
    // ⚠️ `a` 没有 `href` ⇒ 浏览器不会把回车转成 click，要自己接一下。
    a.onkeydown = (e) => { if (e.key === 'Enter') jump(e) }
    pairs.push({ a, el })
    list.append(a)
  }
  // 有正文但没有小节：**照样给面板**，写一句说明即可（不做置灰之类的特例）。
  if (pairs.length === 0) list.append(h('div', { class: 'toc-empty', text: '（本篇无小节）' }))

  const layer = h('div', { class: 'toc-layer' },
    h('div', { class: 'toc-panel' },
      h('div', { class: 'toc-head', text: '目录' }),
      list,
    ),
  )

  const btn = h('button', { type: 'button', class: 'toc-btn', text: '展开目录' })
  const setOpen = (open) => {
    side.classList.toggle('toc-open', open)
    btn.textContent = open ? '收起目录' : '展开目录'
    btn.setAttribute('aria-expanded', open ? 'true' : 'false')
  }
  btn.onclick = () => setOpen(!side.classList.contains('toc-open'))
  setOpen(false)

  // 滚动高亮：**最后一个"顶边已越过容器顶部"的标题**即当前节（与参考实现同一判据）。
  // ⚠️ 参考实现用 `el.offsetTop`——那在它自己的 DOM 里恰好可用；
  //    这里标题的 `offsetParent` 是 `body`（`.detail` 没有定位），直接用
  //    `offsetTop` 会比错基准 ⇒ 改用**相对滚动容器顶边的距离**，判据等价但基准正确。
  // 🔴 **初值必须是第一条，不能是 `null`**（实测踩到）：
  //    详情顶部有 `padding-top: 48px`（给按钮留位），而标题的顶边在**内边距之下**
  //    ⇒ 滚到最顶端时，**没有任何标题的顶边越过阈值** ⇒ 一个都不高亮
  //    （表现为"我看着第一篇，目录里却没一条亮的"）。
  //    ⭐ 初值取第一条正好补上这段"还没滚过任何标题"的区间。
  const highlight = () => {
    if (pairs.length === 0) return
    const boxTop = detailBox.getBoundingClientRect().top
    let cur = pairs[0].a
    for (const { a, el } of pairs) {
      if (el.getBoundingClientRect().top - boxTop <= 24) cur = a
    }
    for (const { a } of pairs) a.classList.toggle('active', a === cur)
  }
  detailBox.onscroll = highlight
  highlight()

  side.append(layer, btn)
  // 🔴 按钮顶在正文区左上角 ⇒ 必须给详情留出顶部空间，否则**压住标题**。
  detailBox.classList.add('has-toc')
}

// ───────────────────────────────────────────────────────────────────────────
// 文件头（frontmatter）渲染成键值表（§8.2）
// ───────────────────────────────────────────────────────────────────────────

/** 把值渲染成可读文本。 */
function fmtValue(v) {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.length === 0 ? '（空）' : v.join('、')
  if (typeof v === 'object') return JSON.stringify(v)
  if (v === '') return '（空）'
  return String(v)
}

// ───────────────────────────────────────────────────────────────────────────
// 时间显示（决策 119 存 UTC；决策 123 改为**按本地时区显示**）
// ───────────────────────────────────────────────────────────────────────────
//
// 🔴 **存储与显示分开**：库里存的是 `toISOString()` 的 **UTC**（带 `Z`）。
//    直接展示对人**不友好**（本机是 UTC+8，要心算 +8 才知道是下午几点）。
//    ⇒ 这里只在**渲染时**转成本地时区，**存储格式不变**（跨时区可比、排序即时间序）。
//    ⚠️ 不要因此把存储改成"本地时间字符串"——那会让存量 UTC 与新数据混在一起。
/**
 * 库内 ISO（UTC）⇒ **本地时区**可读文本。用于详情页文件头。
 * @param {string} iso - ISO 字符串（带 `Z`）；空串 = 未知。
 * @returns {string} 形如 `2026-09-18 21:09:27`；解析不了时**原样返回**。
 */
function fmtLocalTime(iso) {
  if (iso === null || iso === undefined || iso === '') return '（空）'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * 列表里的小字时间：`YYYY-MM-DD HH:MM`（用户指定，决策 123）。
 *
 * ⚠️ 格式**与详情页的 `fmtLocalTime` 不同是有意的**：列表空间小、要一眼扫过。
 * ⚠️ 日期段是**标准**的 `YYYY-MM-DD`、时间与日期之间**一个空格**、时间用 `HH:MM`。
 *    （先前版本曾写成 `YYYY-MMDD`——那是**误读**了用户给的格式，已纠正。）
 *
 * 🔴🔴 **前缀（"更新于"）不再硬编码在本函数里**（决策 133 修正）。
 *    原来它把"更新于"和格式化**揉在一起**，而归档页要显示的是"**归档于** …"
 *    ⇒ 我直接复用它，页面上就成了 **"归档于 更新于 2026-09-20 22:11"**（实测截图抓到）。
 *    ⭐ 判据：**一个函数不该同时决定"时间怎么格式化"与"这个时间是什么语义"**——
 *       语义属于**调用点**（只有那里知道这个 `iso` 是更新时间还是归档时间）。
 * @param {string} iso - ISO 字符串；空串 = 未知。
 * @returns {string} 形如 `2026-09-18 20:45`；空/无法解析时返回 `''`（**整行不显示**）。
 */
function fmtCompactTime(iso) {
  if (iso === null || iso === undefined || iso === '') return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 列表小字：**更新时间**行（`更新于 …`）。 */
function fmtUpdatedLine(iso) {
  const t = fmtCompactTime(iso)
  return t === '' ? '' : `更新于 ${t}`
}

/** 列表小字：**归档时间**行（`归档于 …`，决策 133）。 */
function fmtArchivedLine(iso) {
  const t = fmtCompactTime(iso)
  return t === '' ? '' : `归档于 ${t}`
}

/**
 * 按 `updatedAt` **倒序**排序（决策 123）。
 *
 * ⚠️ 空串（未知/正文缺失）**排到最后**——不能让它靠"空串字典序最小"冒到最前。
 * ⚠️ 用 `slice()` 复制，**不改调用方数组**（`state.*` 是共享状态）。
 * @param {Array<object>} rows - 带 `updatedAt` 字段的列表。
 * @returns {Array<object>} 新数组（已排序）。
 */
function sortByUpdatedDesc(rows) {
  return rows.slice().sort((a, b) => {
    const av = a?.updatedAt ?? ''
    const bv = b?.updatedAt ?? ''
    if (av === '' && bv === '') return 0
    if (av === '') return 1
    if (bv === '') return -1
    // ISO 字符串（同格式同长度）字典序 = 时间序 ⇒ 倒序即 b 在前。
    return bv.localeCompare(av)
  })
}

/**
 * 渲染文件头键值表（§8.2：详情页**上半部先渲染 frontmatter**）。
 * @param entries - `[键, 值]` 数组。
 * @returns 元素。
 */
function renderFrontmatter(entries) {
  const table = h('table', { class: 'fm' })
  for (const [k, v] of entries) {
    table.append(h('tr', {}, h('th', { text: k }), h('td', { text: fmtValue(v) })))
  }
  return h('div', { class: 'fm-wrap' }, h('div', { class: 'fm-title', text: '文件头' }), table)
}

// ───────────────────────────────────────────────────────────────────────────
// 全局状态
// ───────────────────────────────────────────────────────────────────────────

const state = {
  tab: 'kb',
  sub: 'pending',
  /**
   * ⭐ **归档页的当前子标签**（决策 133）：`entry`（知识）/ `project`（项目）。
   * ⚠️ 与 `state.sub`（审批页）**刻意分开**——见 `ARC_SUBTABS` 的说明。
   */
  arcSub: 'entry',
    // ⭐⭐ 设置页当前子页（决策 169）。⚠️ 与 sub/arcSub 分开。
    setSub: 'sink',
  /**
   * ⭐⭐⭐ **知识类型词表**（2026-10-05 收敛）——从 `/kinds` 取，**前端不再自己写一份**。
   *
   * 🔴 收敛前这里是**硬编码的中文标签数组**，而 `index.html` 里还有**两个手写的下拉**
   *    （且那两处**互相不一致**：一个带 `history` 不带"未分类"、另一个反过来）。
   * ⇒ 现在三处**都从这里取**。
   * ⚠️ 初始为空数组；`loadKinds()` 成功后填充。取不到时**下拉仍可用**（只有"未分类"），
   *    不会把界面卡住 —— 但会 `console.warn`，便于排查。
   */
  kinds: [],
  kindsLoaded: false,
  covers: [],
  projects: [],
  themes: [],
  nominations: [],
  broken: [],
  invalid: [],
  /**
   * ⭐⭐ **归档清单**（决策 133）——两个独立数据源，只在归档页用。
   *
   * 🔴 `state.covers` / `state.projects` **不含**归档物（服务端默认就不给），
   *    所以「知识库页 / 项目页不显示归档物」是**数据层面**成立的，
   *    不是靠前端过滤。这两份只是**给归档页**用的。
   */
  archivedEntries: [],
  archivedProjects: [],
  /**
   * ⭐ **每个标签"上次看的条目 id"**（决策 107）。
   *
   * 🔴 **为什么需要**：在主题页点某个项目/知识跳走之后，**再点标签栏的「主题」**
   *    会回到 `#/theme`（**不带 id**）⇒ 详情区变空白，用户丢失了原来的位置。
   *    ⇒ 记住每个标签各自的选择，切回来时恢复。
   *
   * ⚠️ **只记 id，不记筛选条件**——筛选器（搜索词 / kind / 项目 / 主题）
   *    是**另一个维度**的意图，粘住它反而会让用户困惑（"我明明没筛，怎么少了一半"）。
   */
  lastId: { kb: '', projects: '', themes: '', review: '', archive: '' },

  /**
   * ⭐⭐ **每个标签、每个滚动容器的精确位置**（决策 138）。
   *
   * ── 为什么需要 ───────────────────────────────────────────────────────────
   * 用户报告：*"在项目正文滑动到某个位置，点击跳转到了知识库，再回项目的时候，
   * 应该要处在刚刚正文滑动的位置"* —— 而实测（CDP）：
   *   · **`hidden` 切换标签时浏览器其实自己保留 `scrollTop`**（实验：1500 → 隐藏期间读 0 → 恢复显示后 **1500**）；
   *   · 🔴 **但 `renderXxxDetail()` 每次 `replaceChildren()` 重画 ⇒ 位置被清零且不可逆**
   *     （实验：1500 → 清空后 0 → 重新 append 仍是 **0**）。
   * ⇒ ⭐ **丢位置的真正原因是"重画"，不是"切标签"**。
   *
   * ── 粒度：按「标签 + 条目 id」 ─────────────────────────────────────────
   * 🔴 **必须是两维**，否则做不到用户要的分叉：
   *   · **同一条目**切走再回来 ⇒ **恢复到离开时的精确位置**（用户原话"完全一致的位置"）；
   *   · **换成另一条**（点列表里别的条目）⇒ **回到头部**（用户明确要求）。
   *
   * ⚠️ 只存内存、**不进 `localStorage`**：刷新页面后位置失效是可接受的
   *    （与 `lastId` 同级；本项目的既有取向是"筛选与滚动都是当前视图状态，不该粘住"）。
   */
  scroll: {},

  /**
   * ⭐ **上一次渲染的条目 id（按标签）** —— 用来判断"这是换条目还是回到原条目"。
   * ⚠️ 与 `lastId` 不同：`lastId` 是"用户上次选的"，这个是"**上一次真的画进详情区的**"。
   */
  renderedId: { kb: '', projects: '', themes: '', review: '', archive: '' },

  /**
   * ⭐⭐ **各列表"当前已显示多少条"**（分页游标；用户 2026-09-25 要求分页）。
   *
   * 🔴 **按"列表 key"记账，不按 DOM** —— 这些列表**每次操作都会 `replaceChildren()` 重画**
   *    ⇒ 记在 DOM 上会丢。⚠️ 而且重画时要**沿用**上次的页数，
   *    否则用户翻了 5 页、点一下卡片就被打回第 1 页。
   * ⚠️ **筛选/搜索变了要重置**（那是"换了一批数据"）⇒ 调用方换一个 `key` 即可。
   */
  pageShown: {},

  /**
   * ⭐ **本次导航是不是"用户主动点了列表某条"**（窄屏两级导航用，用户 2026-09-24）。
   *
   * 🔴 **为什么需要它**：窄屏下"详情栏滑不滑入"**不能看 `id` 是否为空** ——
   *    进页面时 `goto()` 会带"上次看的条目"、`applyRoute` 还会兜底到列表第一条
   *    ⇒ `id` **几乎总是非空** ⇒ 按"有 id 就滑入"会**一进来就是详情页**，
   *    而用户要的是*"打开的时候，默认是全屏的左栏列表"*。
   * ⇒ 只有**用户亲手点的那一次**才滑入；**消费一次即清**（由
   *    `renderDetailAndRestore` 读取后置回 `false`）。
   */
  narrowUserPick: false,
}

/**
 * ⭐⭐ **当前标签的滚动容器**（决策 138）。
 *
 * 🔴 **必须是"每个标签各自的一对容器"**——本页**没有整页滚动**（`body` 不滚），
 *    所有滚动都发生在这些 `overflow: auto` 的元素里
 *    （实测：`pj-detail` 的 `scrollHeight` 41723 / `clientHeight` 789）。
 * ⇒ **记 `window.scrollY` 是错的**（它恒为 0）。
 * @param tab - 标签名。
 * @returns 该标签的 `{ list, detail }` 元素（取不到时为 null）。
 */
function scrollBoxesOf(tab) {
  const map = {
    kb: ['kb-list', 'kb-detail'],
    projects: ['pj-list', 'pj-detail'],
    themes: ['th-list', 'th-detail'],
    review: ['pending-list', 'pending-detail'],
    archive: ['arc-list', 'arc-detail'],
  }
  const ids = map[tab]
  if (ids === undefined) return { list: null, detail: null }
  return { list: document.getElementById(ids[0]), detail: document.getElementById(ids[1]) }
}

/**
 * ⭐ **存下当前标签、当前条目的滚动位置**（决策 138）。
 *
 * 🔴 **时机很关键：必须在"离开前"存**。
 *    ⚠️ 不能等 `scroll` 事件——那是异步的，而且**重画会把位置清零**，
 *       等重画完再读就晚了。⇒ 统一在 `navigate()` 开头**主动读一次**。
 * ⚠️ **隐藏期间读到的是 0**（实验证实）⇒ 若在错误的时机存，
 *    会把"0"当成用户的位置覆盖掉真实值。所以**只在标签真的可见时存**。
 */
function saveScroll() {
  const tab = state.tab
  const { list, detail } = scrollBoxesOf(tab)
  const id = state.renderedId[tab] ?? ''
  // ⚠️ 没有 id（详情区还是空态）⇒ 不记，免得把空态的位置记成这条的位置。
  if (id === '') return
  // 🔴🔴 **只在"这一栏真的没有被隐藏"时存**——CDP 实测：`hidden` 期间读 `scrollTop` **恒为 0**，
  //    存下去会把真实位置**覆盖成 0**。
  //    ⚠️ 这条守卫同时挡掉一个真实的时序陷阱：`goto()` 会**先改 `state.tab` 再调 `navigate()`**
  //       （而 `navigate()` 内部会存）⇒ 那一刻新面板**还没显示**，
  //       没有这道守卫就会把新标签的位置记成 0。
  if (detail !== null && detail.closest('[hidden]') !== null) return
  if (list !== null && list.closest('[hidden]') !== null) return
  const key = `${tab}\u0000${id}`
  state.scroll[key] = {
    list: list === null ? 0 : list.scrollTop,
    detail: detail === null ? 0 : detail.scrollTop,
  }
}

/**
 * ⭐ **恢复滚动位置**（决策 138）。
 *
 * 🔴 **必须在内容渲染完之后调用**——重画会把 `scrollTop` 清零（实验证实），
 *    早调等于白调。⚠️ 本项目已记过同族坑："探针的没等到 ≠ 代码没渲染"。
 * 🔴 **换条目 ⇒ 不恢复**（回到头部，用户明确要求）。
 * @param tab - 标签名。
 * @param id - 这次的条目 id。
 * @param prevId - 上一次**画进详情区**的 id（`''` = 之前是空态/首次）。
 */
function restoreScroll(tab, id, prevId) {
  const { list, detail } = scrollBoxesOf(tab)
  // ⭐⭐ **换了条目 ⇒ **只有右侧正文**回到头部**（决策 138，用户明确纠正过）。
  //
  // 🔴🔴 **左侧列表绝不能动** —— 我第一版在这里把 `list.scrollTop = 0` 也写了，
  //    用户在列表中部点一条，**列表自己跳回顶部**，他就找不到刚点的那条了。
  //    ⚠️ 用户的原话是「**打开详情的时候**应该回到头部」——
  //       主语是**正文页（右侧栏）**，我当时擅自把"回到头部"扩到了两个栏。
  //    ⭐ 而且**列表保持不动本来就有用**：点完还能看到自己在列表的哪个位置、
  //       上下相邻的条目也还在视野里（连着看几条时不必反复滚）。
  if (id !== prevId) {
    if (detail !== null) detail.scrollTop = 0
    return
  }
  const saved = state.scroll[`${tab}\u0000${id}`]
  if (saved === undefined) return
  // ⚠️ 用 `scrollTo`（而不是直接赋值 `scrollTop`）——语义更明确，且便于将来加平滑滚动。
  if (list !== null) list.scrollTo({ top: saved.list })
  if (detail !== null) detail.scrollTo({ top: saved.detail })
}

// ───────────────────────────────────────────────────────────────────────────
// 知识库标签
// ───────────────────────────────────────────────────────────────────────────

/** 从 hash 里取当前选中 id（`#/kb/<id>` / `#/project/<id>` / `#/theme/<id>` / `#/review/<id>` / `#/archive/<kind>/<id>`）。 */
function currentId() {
  // ⭐ 归档页的 hash **多一段 kind**（`entry` / `project`）——因为两个子页的 id
  //    是两个互不相干的命名空间（条目 id 与项目 id），不带 kind 就分不清该去哪边找。
  const a = /^#\/archive\/(?:entry|project)\/(.+)$/.exec(location.hash)
  if (a) return decodeURIComponent(a[1])
  const m = /^#\/(kb|project|theme|review)\/(.+)$/.exec(location.hash)
  return m ? decodeURIComponent(m[2]) : ''
}

/**
 * 归档页 hash 里的**子页**（`entry` / `project`）（决策 133）。
 * @returns 子页名；不是归档页的 hash 时返回 `''`。
 */
function currentArchiveKind() {
  const m = /^#\/archive\/(entry|project)(?:\/|$)/.exec(location.hash)
  return m ? m[1] : ''
}

/**
 * 取归档页某个子页对应的**清单**（决策 133）。
 * @param kind - `entry` / `project`。
 * @returns 该子页的清单数组。
 */
function archiveListOf(kind) {
  return kind === 'project' ? state.archivedProjects : state.archivedEntries
}

/**
 * 按当前筛选条件过滤封面（§8.3）。
 *
 * ⚠️ **「只看缺失正文」开关已按决策 85 取消**——它与审批页的"断链"语义重叠且实测恒为 0。
 */
function filteredCovers() {
  const q = document.getElementById('kb-filter').value.trim().toLowerCase()
  const kind = document.getElementById('kb-kind').value
  const project = document.getElementById('kb-project').value
  const theme = document.getElementById('kb-theme').value

  return state.covers.filter((c) => {
    if (kind === '__none__') {
      if (c.kind) return false
    } else if (kind !== '' && c.kind !== kind) return false
    if (project !== '' && c.project !== project) return false
    if (theme !== '' && !c.theme.includes(theme)) return false
    if (q === '') return true
    return `${c.id} ${c.project} ${c.theme.join(' ')} ${c.desc} ${c.ref} ${c.tags.join(' ')} ${c.kind ?? ''}`
      .toLowerCase()
      .includes(q)
  })
}

/**
 * ⭐ **把选中项滚进可视区**（决策 131）。
 *
 * 🔴 **为什么需要**：用户要求"网页加载时默认选中列表第一条并展开详情"，
 *    而列表**按更新时间倒序**、条目可达上百条 ⇒ 默认选中的那条**可能不在可视区**
 *    （用户看到右侧有详情、左侧却找不到是哪条亮着）。
 *    ⚠️ 项目此前**完全没有滚动逻辑**（实测 `grep scrollIntoView` 零命中）。
 *
 * 🔴🔴 **不能用 `scrollIntoView`**（2026-09-20 与目录跳转同批修）：
 *    它会**滚动所有可滚祖先**——包括那些 `overflow: hidden`、**仍可编程滚动**的容器。
 *    在**有子导航页**的页面里（审批 / 归档），列表在 `.subpanel` 内部
 *    ⇒ 点一条会让**整个子面板**也跟着滚一下（左右两栏一起错位）。
 *    ⭐ 只滚 `listBox` 自己：直接算它的 `scrollTop`。
 *    ⚠️ 用 `nearest` 语义：元素已在可视区内时**不动**（避免每次重画都跳一下）。
 * @param listBox - 列表容器（有 `overflow: auto`）。
 */
function revealActiveItem(listBox) {
  const el = listBox.querySelector('.item.active')
  if (el === null) return
  const boxTop = listBox.getBoundingClientRect().top
  const elTop = el.getBoundingClientRect().top
  const offset = elTop - boxTop          // 元素顶边相对容器可视区顶边
  // 🔴🔴 **"已可见"的判据必须留容差**（决策 138 修，实测踩到）：
  //    原判据是 `offset + el.offsetHeight <= listBox.clientHeight`，
  //    而**滚到底**时最后一项的底边**恰好等于**容器底边 ⇒ 浮点/亚像素误差
  //    让它被判成"不可见" ⇒ **列表无端跳一下**（实测 79 → 4）。
  //    ⚠️ 触发场景正是用户报的："在列表中部点一条，列表自己动了"。
  //    ⭐ 加 1px 容差即可（这类"边界相等"的判据**永远要留容差**）。
  //    ⚠️ 另一处也一并加：顶边 `offset >= 0` 同理（`offset` 可能是 -0.5）。
  const TOL = 1
  if (offset >= -TOL && offset + el.offsetHeight <= listBox.clientHeight + TOL) return  // 已可见 ⇒ 不动
  // 把元素顶边对齐到容器顶边（略留 4px 余量，视觉上更舒服）。
  listBox.scrollTo({ top: listBox.scrollTop + offset - 4 })
}

/**
 * ⭐⭐⭐ **分页渲染器（所有列表共用这一份实现）**（用户 2026-09-25：
 *    *"所有的列表都要做分页，默认一次加载50条。滑动到边界加载新的条目。"*）
 *
 * 🔴 **为什么要抽成一份**：本项目有 **9 个列表**（知识库 / 项目 / 主题 / 审批 /
 *    归档知识 / 归档项目 / 热知识的实时·全局·项目选择器）——
 *    逐处各写一遍分页，迟早长成 9 套行为不一的实现（本项目铁律：**实现只留一份**）。
 *
 * ⭐ **做法**：调用方只负责"把一条画成卡片"（`draw`），
 *    分页、游标、滚动监听、底部提示**全在这里**。
 *
 * 🔴 **游标按「列表 key」记账**（`state.pageShown[key]`），**不按 DOM** ——
 *    这些列表**每次操作都会 `replaceChildren()` 重画** ⇒ 记在 DOM 上会丢。
 * ⚠️ **重画时保留已翻的页数**（`key` 相同 ⇒ 沿用上次的 `shown`）——
 *    否则用户翻了 5 页、点一下卡片就被打回第 1 页。
 *    ⚠️ **但筛选/搜索变了要重置**（那是"换了一批数据"，不是"同一批的延续"）
 *    ⇒ 调用方**换一个 key** 即可（见 `pageKey`）。
 *
 * @param box - 列表容器（`box.replaceChildren()` 的对象）。
 * @param rows - **完整的**数据行（未分页）。
 * @param draw - 画一行：`(row) => HTMLElement`。
 * @param opts - `{ key, empty }`：`key` = 分页游标的身份；`empty` = 空态文案。
 */
function renderPagedList(box, rows, draw, opts) {
  const key = opts.key
  // ⭐ **游标**：首次见到这个 key ⇒ 从 1 页开始；已见过 ⇒ **沿用**（见上面对重画的说明）。
  const shown = state.pageShown[key] ?? PAGE_SIZE
  state.pageShown[key] = shown
  const slice = rows.slice(0, shown)

  box.replaceChildren()
  if (rows.length === 0) {
    box.append(h('div', { class: 'empty', text: opts.empty }))
    return
  }
  for (const r of slice) box.append(draw(r))
  // ⭐ 底部哨兵：**没加载完才画**（加载完了什么都不画 —— 不留一条"已全部加载"的噪音）。
  if (shown < rows.length) {
    const more = h('div', { class: 'list-more', text: `加载中…（已显示 ${shown} / ${rows.length}）` })
    box.append(more)
  }
  attachInfiniteScroll(box, rows, draw, opts)
  revealActiveItem(box)
}

/**
 * ⭐ **给列表容器挂"滑到边界就加载"**（配合 `renderPagedList`）。
 *
 * 🔴 **滚动容器不一定是列表本身** ——
 *    · 知识库等页：`.list` 自己有 `overflow: auto`；
 *    · 热知识页：列表在 `.hot-scroll` 里，**滚动的是那个祖先**。
 *    ⇒ 用 `closest` 先找"最近的、真的在滚的祖先"（见 `scrollHostOf`）。
 *
 * ⚠️ **监听器要幂等**（`dataset.pagedBound`）—— 这些列表**反复重画**，
 *    每次都 `addEventListener` 会**越积越多**（本项目记过同族坑：
 *    "每展开一次积一个监听器"）。
 * ⚠️ **`scroll` 里不重画整个列表**：只 `append` 新增的那些 ——
 *    重画会**丢失滚动位置**、也会让已渲染的卡片闪烁。
 */
function attachInfiniteScroll(box, rows, draw, opts) {
  const host = scrollHostOf(box)
  if (host === null) return
  // ⚠️ **监听器挂在滚动宿主上、但按"当前这个 box"记账** ——
  //    同一个宿主里换列表时（如切子页）旧监听器仍在，靠 `box.dataset` 判"这个 box 挂过没有"。
  if (box.dataset.pagedBound === '1') {
    // 已挂过 ⇒ **只更新"这次要用的数据"**（监听器读的是 box 上的引用）。
    box.__paged = { rows, draw, opts }
    return
  }
  box.dataset.pagedBound = '1'
  box.__paged = { rows, draw, opts }
  host.addEventListener('scroll', () => { maybeLoadMore(box, host) })
}

/**
 * ⭐ **滚到接近底部时补一页**。
 *
 * ⭐ **阈值用"距底部 200px 以内"**（不是"到底"）—— 到底才加载会让用户
 *    **看到一瞬间的空白**（尤其在触屏上甩得快时）。
 * ⚠️ **`host.scrollHeight - host.scrollTop - host.clientHeight`** 是标准算法；
 *    ⚠️ 必须留**容差**（亚像素误差，本项目记过"边界相等类判据永远要留容差"）。
 */
function maybeLoadMore(box, host) {
  const d = box.__paged
  if (d === undefined) return
  const key = d.opts.key
  const shown = state.pageShown[key] ?? PAGE_SIZE
  if (shown >= d.rows.length) return          // 已全部加载
  const remain = host.scrollHeight - host.scrollTop - host.clientHeight
  if (remain > 200) return                    // 还早
  const next = Math.min(shown + PAGE_SIZE, d.rows.length)
  state.pageShown[key] = next
  // ⭐ **只 append 新增的那些**（不重画 —— 重画会丢滚动位置）。
  const sentinel = box.querySelector(':scope > .list-more')
  for (const r of d.rows.slice(shown, next)) box.insertBefore(d.draw(r), sentinel)
  if (next >= d.rows.length) sentinel?.remove()
  else if (sentinel !== null) sentinel.textContent = `加载中…（已显示 ${next} / ${d.rows.length}）`
}

/**
 * ⭐ **找"真正在滚的那个祖先"**（列表本身，或它最近的可滚祖先）。
 *
 * 🔴 判据用 **`scrollHeight > clientHeight`**（**真的能滚**），
 *    不是"有没有 `overflow: auto`" —— 后者会把"设了 overflow 但内容没超出"的也算进来，
 *    那会导致**监听了一个永远不滚的元素** ⇒ 分页再也不触发。
 * ⚠️ 一路走到 `body` 都没找到 ⇒ 返回列表本身（至少不会崩）。
 */
function scrollHostOf(box) {
  let el = box
  while (el !== null && el !== document.body) {
    if (el.scrollHeight > el.clientHeight + 1) return el
    el = el.parentElement
  }
  return box
}

/** 渲染知识库左侧列表。 */
function renderKbList() {
  const box = document.getElementById('kb-list')
  if (!box) return
  // ⭐ 决策 123：**按更新时间倒序**（最近改的排最前）。
  const rows = sortByUpdatedDesc(filteredCovers())
  document.getElementById('kb-count').textContent = `${rows.length} / ${state.covers.length} 条`
  const cur = currentId()
  // ⭐⭐ **分页**（用户 2026-09-25）——`key` 里带上筛选条件：
  //    🔴 **筛选变了就是"换了一批数据"** ⇒ 必须回到第 1 页（见 `state.pageShown` 的说明）。
  //    ⚠️ 但**选中项变了不算换数据**（`cur` 不进 key）—— 否则点一条就打回第 1 页。
  const fKey = ['kb-filter', 'kb-kind', 'kb-project', 'kb-theme']
    .map((id) => document.getElementById(id)?.value ?? '').join('\u0000')
  renderPagedList(box, rows, (c) => {
    const card = h('div', {
      class: `item${cur === c.id ? ' active' : ''}`,
      onclick: () => { navigate(`#/kb/${c.id}`, true) },
    })
    card.append(h('div', { class: 'item-title', text: c.title || '(无标题)' }))
    const meta = h('div', { class: 'meta' })
    if (c.kind) meta.append(tag(c.kind, 'kind'))
    if (c.project) meta.append(tag(c.project))
    for (const t of c.theme) meta.append(tag(t, 'theme'))
    if (c.global) meta.append(tag('global', 'global'))
    if (c.ext) meta.append(tag('外部', 'ext'))
    if (c.missing) meta.append(tag('正文缺失', 'missing'))
    card.append(meta)
    // ⭐ 决策 123：小字更新时间放在**列表块最下面**（标签之下）。
    //    ⚠️ 用户明确要求过"放中间不好看" ⇒ **不要**再挪回标题与标签之间。
    const ts = fmtUpdatedLine(c.updatedAt)
    if (ts !== '') card.append(h('div', { class: 'item-time', text: ts }))
    return card
  }, { key: `kb|${fKey}`, empty: '没有匹配的知识。' })
}

/**
 * 渲染知识条目右侧详情（§8.2：上半部文件头，下半部正文）。
 *
 * ⭐ **知识库页与归档页共用这一个渲染器**（决策 133）——用户要求归档页的列表
 *    与知识库页一致，详情自然也一致；差别只有**容器 id** 与**空态文案**。
 *    🔴 刻意**不按调用方传"是不是归档态"**：归档与否只能由数据（`cover.archivedAt`）
 *       决定——否则同一个 id 在知识库页与归档页会渲染出不同的按钮（那就是两套真相）。
 * @param id - 条目 id。
 * @param opts - 可选：`{ boxId, tab, emptyText }`。
 */
async function renderEntryDetail(id, opts = {}) {
  const box = document.getElementById(opts.boxId ?? 'kb-detail')
  if (!box) return
  const tab = opts.tab ?? 'kb'
  // 🔴 每次重画**先清掉旧目录**（见 `clearToc` 的说明）——含"空/加载失败"那几条提前返回的路径。
  clearToc(box)
  if (!id) {
    box.replaceChildren(h('div', { class: 'empty', text: opts.emptyText ?? '从左侧选择一条知识。' }))
    return
  }
  box.replaceChildren(h('div', { class: 'empty', text: '加载中…' }))
  let data
  try {
    data = await getJson(`/entry?id=${encodeURIComponent(id)}`)
  } catch (e) {
    // ⚠️ 记忆失效（条目已不在库里）⇒ 忘掉，避免永久卡在"加载失败"。
    forgetIfStale(tab, id)
    box.replaceChildren(h('div', { class: 'empty', text: `加载失败：${e.message}` }))
    return
  }
  const c = data.cover
  const isArchived = (c.archivedAt ?? '') !== ''
  // ⭐⭐ **历史归档条目**（决策 137）：`kind: 'history'`。
  //    ⚠️ 它不是知识，而是「当前进度」自动截断时归档的**原文**
  //    ⇒ 🔴 **必须一眼看出来**，否则用户会以为"库里怎么多了这种条目"。
  const isHistory = (c.kind ?? '') === 'history'
  box.replaceChildren()
  box.append(h('h2', { class: 'detail-title', text: data.title || '(无标题)' }))
  // ⭐⭐ **历史归档横幅**（决策 137）：它是**兜底存档**，不是知识。
  //    🔴 说清三件事：它从哪来、**不参与模型检索**、以及它对应的正文在哪。
  if (isHistory) {
    box.append(
      h('div', { class: 'notice history' },
        h('div', { text: '📦 这是**历史归档**条目——交接文档「当前进度」被自动截断时，把较早的小节原文存到了这里。' }),
        h('div', { class: 'dim small', text: '原文**逐字保留**（没有改写或丢内容）。' }),
        h('div', { class: 'dim small', text: '它**不参与模型检索**（`memj_search` 搜不到它），但可以在这里查阅；要引用那一段，请在正文里按 id 说明。' }),
      ),
    )
  }
  // ⭐⭐ **归档横幅**（决策 133）：从知识库页的**过期书签**进来时（`/entry` 是按 id 取的，
  //    归档条目也取得到），必须一眼看出"它不在活跃库里了、要去归档页恢复"。
  //    ⚠️ 这条提示是**必要的**，因为知识库页的列表里根本点不到它 ⇒ 用户会疑惑
  //       "我明明没搜到它，怎么详情能打开"。
  if (isArchived) {
    box.append(
      h('div', { class: 'notice archived' },
        h('div', { text: `📦 该条目**已归档**（${fmtLocalTime(c.archivedAt)}）——它不参与知识库列表与工具的搜索/展示。` }),
        h('div', { class: 'dim small', text: '要让它重新可用，请在下面的编辑面板点「恢复」（也可到「归档 → 知识」页统一管理）。' }),
      ),
    )
  }
  box.append(
    renderFrontmatter([
      ['id', c.id],
      ['project', c.project],
      ['theme', c.theme],
      ['global', c.global],
      ['kind', c.kind === '' ? '（未分类）' : c.kind],
      ['tags', c.tags],
      ['desc', c.desc],
      ['ref', c.ref],
      ['ext', c.ext],
      ['source', data.frontmatter?.source ?? null],
      // ⭐ 时间字段（决策 119）——🔴 **要从封面读，不是正文 frontmatter**。
      //    ⚠️ 原来的注释写着"封面上没有这两个字段"，**那是错的**：决策 119 起封面也有
      //       `createdAt`/`updatedAt`。而**外部引用（ext）根本没有正文** ⇒
      //       `data.frontmatter` 恒为 `null` ⇒ 外链的时间**恒显示为空**（实测踩到）。
      //    ⭐ 兜底顺序：封面优先，回退正文 frontmatter（内链两者同值）。
      //    ⭐ 决策 123：存的是 UTC，这里**转成本地时区**显示（存储格式不变）。
      ['createdAt', fmtLocalTime(c.createdAt ?? data.frontmatter?.createdAt)],
      ['updatedAt', fmtLocalTime(c.updatedAt ?? data.frontmatter?.updatedAt)],
      // ⭐ 归档时间（决策 133）——**只在归档时显示**，活跃条目不显示这个空行。
      ...(isArchived ? [['已归档于', fmtLocalTime(c.archivedAt)]] : []),
    ]),
  )

  // ⭐⭐ 封面编辑面板（决策 114）——**人侧入口**，与工具侧共用同一实现。
  //    ⚠️ 候选（项目/主题）由面板自己读 `state`，不在这里传。
  box.append(renderEntryEditor(c))

  // ⭐ 外部引用**也渲染正文**（决策 128，**取代** §12-80）。
  //    🔴 原来这里对 `ext` **直接 return**（只显示"不渲染全文 + 路径"）。
  //    ⭐ 改动只针对**渲染与否**：外链的**身份提示（外部引用 + 库外路径）仍然保留**——
  //       那是有效信息（提醒"正文不归 memj 管、改动它不会被同步"）。
  //    ⚠️ **断链时仍然不渲染**（没有内容可渲染），提示里去审批页重填路径。
  if (c.ext && data.missing) {
    box.append(
      h('div', { class: 'notice' },
        h('div', { text: '这是一条外部引用（ext: true）——正文来自库外文件，memj 不改动它。' }),
        h('div', { class: 'mono dim', text: c.ref }),
      ),
      h('div', { class: 'notice err', text: '⚠️ 目标文件当前不存在（断链）——请到「审批 → 断链外部引用」重填路径。' }),
    )
    return
  }
  if (c.ext) {
    box.append(
      h('div', { class: 'notice' },
        h('div', { text: '这是一条外部引用（ext: true）——正文来自库外文件，memj 不改动它。' }),
        h('div', { class: 'mono dim', text: c.ref }),
      ),
    )
  }

  if (data.missing) {
    box.append(h('div', { class: 'notice err', text: '⚠️ 正文文件不存在（ref 指向的文件读不到）。' }))
    return
  }
  const md = renderBody(data.body ?? '')
  box.append(md)
  // ⭐ 目录（决策 132）：判据是"正文非空"，正文为空时不显示按钮。
  attachToc(box, md, data.body ?? '')
}

// ───────────────────────────────────────────────────────────────────────────
// ⭐⭐ 封面编辑面板（决策 114）——**人侧入口**
//
// 🔴 **它调的是 `/api/edit`，而那与 `memj_promote` 工具共用同一份实现**
//    （`src/edit.ts`）⇒ 两侧行为、安全底线（非空不删、改名先建后删）**完全一致**。
//    这里只负责画表单与收集输入，**不放任何业务规则**。
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⭐ **编辑面板的公共构件**（决策 114，2026-09-18 按用户要求重做）。
 *
 * 用户对形态的要求（逐条落实）：
 *   · 字段顺序 **项目 → 主题 → global**；
 *   · **多选一律用勾选面板**（列出库里全部候选，已选的预勾上）——
 *     "添加和删除也用勾选或者取消勾选控制"；
 *   · `title`/`desc` **各占一行**，`desc` 给**约 3 行**高度；
 *   · **整块只有一个「保存」**，放**右下角**，旁边是「删除」。
 */

/** 一行文本输入（单列）。 */
function fieldText(label, value, opts = {}) {
  const id = `ef-${Math.random().toString(36).slice(2, 8)}`
  const hint = opts.hint ? h('div', { class: 'fhint', text: opts.hint }) : null
  const input = opts.multiline
    ? h('textarea', { id, rows: String(opts.rows ?? 3), placeholder: opts.placeholder ?? '' })
    : h('input', { id, type: 'text', value: value ?? '', placeholder: opts.placeholder ?? '' })
  // ⚠️ textarea 的初始值用 `value` 属性设不上（要设 textContent/value 属性）。
  if (opts.multiline) input.value = value ?? ''
  // ⭐ **归档物不可编辑**（决策 133 / 用户裁定 ③）：字段一律禁用。
  //    🔴 为什么不"让它可改、点保存再报错"：那会让人白填一遍，
  //       而"已归档"是**确定会失败**的（不是校验运气问题）⇒ 干脆不给输入。
  if (opts.disabled === true) input.disabled = true
  const wrap = h('div', { class: 'field' }, h('label', { class: 'lbl', for: id, text: label }), hint, input)
  return { wrap, input }
}

/**
 * ⭐ **勾选面板**：列出 `all` 里每一项，`selected` 里的预勾上。
 *
 * @param all - 全部候选。
 * @param selected - 预选的 key 数组。
 * @param keyOf - 取 key。
 * @param labelOf - 取显示文本。
 * @param single - ⭐ **单选模式**（决策 116）：用 `radio` 语义——
 *   点一个**自动取消其它**。用于 `project` 这种**单值**字段。
 *   ⚠️ 用户报的 bug：项目字段原先是多选勾选，**能同时勾好几个**——
 *   而 `project` 是单值，多选毫无意义（保存时只会取第一个）。
 * @param disabledOf - ⭐ 可选；`(item) => boolean`，返回 true 的项**可见但禁用**。
 *   ⭐⭐ 用于**归档项目**（决策 133 / 用户裁定 ⑦⑧）：它要**出现在候选里**
 *   （否则看不出"这条知识挂在一个已归档项目上"），但**不能被选中**
 *   （"项目归档后不应有新知识挂靠它"）。两条要求同时满足只有这一个形态。
 */
function checkPanel(all, selected, keyOf, labelOf, single = false, disabledOf = null) {
  const panel = h('div', { class: 'check-panel' })
  const boxes = new Map()
  if (all.length === 0) {
    panel.append(h('div', { class: 'empty-hint', text: '（库里暂无候选）' }))
    return { wrap: panel, boxes }
  }
  const sel = new Set(selected ?? [])
  // ⚠️ 单选模式要**共享同一个 name**，浏览器才会自动互斥。
  const groupName = `rd-${Math.random().toString(36).slice(2, 8)}`
  for (const item of all) {
    const key = keyOf(item)
    const id = `ck-${Math.random().toString(36).slice(2, 8)}`
    const cb = h('input', single
      ? { id, type: 'radio', name: groupName }
      : { id, type: 'checkbox' })
    cb.checked = sel.has(key)
    const off = disabledOf !== null && disabledOf(item) === true
    if (off) cb.disabled = true
    boxes.set(key, cb)
    panel.append(
      h('label', { class: `check-item${off ? ' off' : ''}`, for: id }, cb,
        h('span', { class: 'tag-id', text: labelOf(item) }),
      ),
    )
  }
  return { wrap: panel, boxes }
}

/** 读勾选面板的结果：返回被勾上的 key 数组。 */
function checkedKeys(boxes) {
  const out = []
  for (const [k, cb] of boxes.entries()) if (cb.checked) out.push(k)
  return out
}

/**
 * ⭐ **底部操作栏**：状态文字 + 保存（右下角）+ 可选的删除。
 *
 * 🔴 **整块只有一个保存**——所有字段的改动**一次提交**（用户明确要求）。
 * @param onSave - 收齐字段后提交；返回回执文本。
 *   ⭐ **可以不传**（决策 133）：归档物不可编辑 ⇒ 只有「恢复」一个按钮。
 * @param onDelete - 可选；给了才画删除按钮。
 * @param onArchive - ⭐ 可选；**归档 / 恢复**按钮（决策 133）。
 *   `{ text, confirmText, run, after }`——与 `onDelete` **同形**。
 *   ⚠️ 归档物**不可编辑**（用户裁定 ③）⇒ 归档态下**只有这个按钮**，
 *      不传 `onSave` 就不画「保存」（见 `renderEntryEditor` 的归档分支）。
 */
function editFooter(onSave, onDelete, onArchive) {
  const msg = h('div', { class: 'foot-msg', text: '' })
  const saveBtn = h('button', {
    class: 'primary',
    text: '保存',
    onclick: async () => {
      msg.className = 'foot-msg'
      msg.textContent = '保存中…'
      try {
        const out = await onSave()
        msg.className = 'foot-msg ok'
        msg.textContent = (out?.message ?? '已保存').split('\n')[0].slice(0, 120)
        toast('已保存')
        await load()
      } catch (e) {
        msg.className = 'foot-msg err'
        msg.textContent = (e.body?.message ?? e.message).split('\n')[0].slice(0, 160)
      }
    },
  })
  const row = h('div', { class: 'edit-footer' }, msg)
  // ⚠️ 按钮**按此顺序 append**（= 从左到右）：保存 → 归档/恢复 → 删除。
  //    ⭐ `onSave` 现在是**可选**的：归档物只有「恢复」一个按钮（决策 133）。
  if (onSave) row.append(saveBtn)
  // ⭐ **归档 / 恢复**（决策 133）——排在「删除」**左边**（破坏性最强的放最右，与既有排布一致）。
  if (onArchive) {
    row.append(h('button', {
      // ⚠️ **不套 `danger`**：归档是**可逆**的（归档页随时能恢复），
      //    而 `danger` 在本项目是"要毁掉东西"的语义色（删除、断链）。
      //    用它会让"归档"看起来比"删除"更吓人 —— 与事实不符。
      text: onArchive.text,
      onclick: async () => {
        if (!confirm(onArchive.confirmText)) return
        msg.className = 'foot-msg'
        msg.textContent = `${onArchive.text}中…`
        try {
          const out = await onArchive.run()
          toast((out?.message ?? `已${onArchive.text}`).split('\n')[0].slice(0, 60))
          // ⚠️ 顺序：**先刷新数据、再忘掉记忆、最后重画路由**（决策 133）。
          //    🔴 归档 / 恢复会把这条在"活跃清单"与"归档清单"之间**搬家** ⇒
          //       不重画路由的话，右侧会一直停在一个**已经不属于当前清单的 id** 上
          //       （表现为"我刚归档了它，右边的按钮却还是「归档」"）。
          await load()
          onArchive.after?.()
          applyRoute()
        } catch (e) {
          msg.className = 'foot-msg err'
          msg.textContent = (e.body?.message ?? e.message).split('\n')[0].slice(0, 160)
        }
      },
    }))
  }
  if (onDelete) {
    const del = h('button', {
      class: 'danger',
      text: '删除',
      onclick: async () => {
        if (!confirm(onDelete.confirmText)) return
        msg.className = 'foot-msg'
        msg.textContent = '删除中…'
        try {
          const out = await onDelete.run()
          toast((out?.message ?? '已删除').split('\n')[0].slice(0, 60))
          onDelete.after?.()
          await load()
        } catch (e) {
          msg.className = 'foot-msg err'
          msg.textContent = (e.body?.message ?? e.message).split('\n')[0].slice(0, 160)
        }
      },
    })
    row.append(del)
  }
  return { wrap: row, msg }
}

/**
 * ⭐⭐ **知识条目的编辑面板**（决策 114）。
 *
 * 字段顺序按用户要求：**项目 → 主题 → global**。
 *
 * ⭐ **归档态**（决策 133）：面板仍在，但**字段全禁用**，底部只剩一个「恢复」按钮。
 *    🔴 判据取自 **`cover.archivedAt`**（数据），**不是"我现在在哪个标签页"**——
 *       一个过期的书签 hash 能把归档条目带到知识库页，那时按标签页画按钮就是撒谎。
 * @param cover - 该条封面（来自 `/api/entry`）。
 */
function renderEntryEditor(cover) {
  const isArchived = (cover.archivedAt ?? '') !== ''
  const wrap = h('details', { class: 'editor' }, h('summary', { text: '✏️ 编辑' }))

  // ① title / desc（各占一行；desc 约 3 行高）
  const title = fieldText('title', cover.title, { placeholder: '2–48 字符', disabled: isArchived })
  const desc = fieldText('desc', cover.desc, {
    multiline: true, rows: 3, placeholder: '≤200 字符；写清"什么场景下的什么知识；当什么场景时读它"',
    disabled: isArchived,
  })
  const kindSel = h('select', { id: 'ef-kind' })
  if (isArchived) kindSel.disabled = true
  /**
   * ⭐⭐⭐ 下拉内容 = **（未分类）+ 全部词表项**，全部从 `state.kinds` 生成
   *    （2026-10-05 收敛；以前是这里写死一份、`index.html` 里再写两份）。
   * ⚠️ **保留项（`history`）也要列出来，但存在时置 `disabled`** ——
   *    列它是为了"详情页能说清这条是什么"（否则一条 history 的 kind 会显示成空）；
   *    **不给选**是因为它是**工具生成的**，手工把一条知识改成它会让那条**从检索里消失**。
   *    🔴 `disabled` 只对**别的项**生效；当前值若正好是保留项，那一项仍可选中（否则回显会丢）。
   */
  kindSel.append(h('option', { value: '', text: '（未分类）' }))
  for (const k of state.kinds) {
    const o = h('option', { value: k.id, text: k.label })
    if (k.reserved === true && (cover.kind ?? '') !== k.id) {
      o.disabled = true
      o.title = '由工具自动生成，不能手工指定'
    }
    if (k.id === (cover.kind ?? '')) o.selected = true
    kindSel.append(o)
  }
  const tagsField = fieldText('tags', (cover.tags ?? []).join(', '), {
    placeholder: '逗号分隔', disabled: isArchived,
  })
  wrap.append(
    h('div', { class: 'edit-block' },
      h('h4', { text: '基本信息' }),
      h('div', { class: 'form-grid single' },
        title.wrap,
        desc.wrap,
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'ef-kind', text: 'kind' }), kindSel),
        tagsField.wrap,
      ),
    ),
  )

  // ② 项目（⭐ **单选**——`project` 是单值字段，决策 116）
  //
  // ⭐⭐ 候选 = **活跃项目 + 归档项目**（决策 133 / 用户裁定 ⑦⑧）：
  //    ⚠️ 归档项目**必须出现在这里**，否则"我这条知识挂在一个已归档项目上"
  //       在界面上**完全看不出来**（它的 project 字段指着一个候选列表里没有的 id）。
  //    🔴 但它**禁用**（`disabledOf`）：项目归档后**不应再有新知识挂靠它**。
  //    ⭐ 两者同时成立 ⇒ 只能"可见但不可选"，没有别的形态。
  const projCands = [
    ...state.projects.map((p) => ({ id: p.id, archived: false })),
    ...state.archivedProjects.map((p) => ({ id: p.id, archived: true })),
  ]
  const projPanel = checkPanel(
    projCands,
    [cover.project],
    (p) => p.id,
    (p) => (p.archived ? `${p.id}（已归档）` : p.id),
    true,
    // ⭐ 两种情况都要禁：**项目自己归档了**（不可新挂靠），或**这条条目归档了**（整体不可编辑）。
    //    🔴 `disabledOf` 只覆盖前者——后者原来**漏了**（实测：归档条目的详情页里，
    //       项目候选 7 个 radio **全都能点**，而旁边的主题勾选已禁用）⇒ 现补上。
    (p) => p.archived || isArchived,
  )
  // ⚠️ **项目候选全部禁用时补一句说明**——否则用户会以为"项目栏坏了/没有候选"。
  if (isArchived) {
    for (const cb of projPanel.boxes.values()) cb.disabled = true
    for (const label of projPanel.wrap.querySelectorAll('.check-item')) label.classList.add('off')
  }
  wrap.append(
    h('div', { class: 'edit-block' },
      h('h4', { text: '项目' }),
      projPanel.wrap,
      h('div', { class: 'dim small', text: '一条知识只属于一个项目（勾新的 = 迁移过去）。⚠️ 标注「（已归档）」的项目不可选。' }),
    ),
  )

  // ③ 主题（勾选面板，多选）
  const themePanel = checkPanel(state.themes, cover.theme ?? [], (t) => t.id, (t) => t.id)
  if (isArchived) for (const cb of themePanel.boxes.values()) cb.disabled = true
  wrap.append(
    h('div', { class: 'edit-block' },
      h('h4', { text: '主题' }),
      themePanel.wrap,
      h('div', { class: 'dim small', text: '可多选；取消勾选 = 从该主题摘除（累加语义，不影响项目）。' }),
    ),
  )

  // ④ global（只留一个勾选）
  const globalCb = h('input', { id: 'ef-global', type: 'checkbox' })
  globalCb.checked = cover.global === true
  if (isArchived) globalCb.disabled = true
  wrap.append(
    h('div', { class: 'edit-block' },
      h('h4', { text: 'global' }),
      // ⭐⭐ **人侧勾选 = 直接生效，不需要审批**（决策 116；用户 2026-09-21 确认并纠正文案）。
      //    🔴 **旧文案写着"（只登记提名，待人批准）"——那是 LLM 侧的语义，挂在这里是错的**。
      //    ⭐ 两侧的分工（见 `edit.ts` 的 `setEntryGlobal`）：
      //      · **人侧**（本面板）⇒ `actor: 'human'` ⇒ **直接置 `global: true` 并清掉提名**
      //        ——「**人本来就是审批者**」，让他勾完再去审批自己是多余的一步；
      //      · **LLM 侧**（`memj_promote`）⇒ 只登记提名、`global` 保持 `false`
      //        —— 那是 §7.3 的安全底线「**模型不能自己批准**」，那条与本面板无关。
      h('label', { class: 'check-item', for: 'ef-global' }, globalCb,
        h('span', { text: '加入全局' })),
      // ⭐ 描述用**灰色小字、放在开关下方**（用户要求的样式与位置）。
      h('div', { class: 'dim small', text: '全局知识将作为热知识在所有项目注入' }),
      // ⭐ 归档时 `global` 被**清成 false**（用户裁定 ④）——这里把这条事实写出来，
      //    否则恢复之后看到"global 没勾"会以为丢了数据。
      //    🔴 恢复**不会**把 global 勾回来（已确认的默认）：要重新勾选。
      isArchived
        ? h('div', { class: 'dim small', text: '归档时已取消 global，并清掉了提名；恢复后不会自动恢复，需要重新勾选。' })
        : null,
    ),
  )

  // ⑤ 底部：保存 + 删除（活跃）／只有恢复（归档）
  const footer = editFooter(
    isArchived
      ? null
      : async () => {
        // ⚠️ **逐项提交**（`/api/edit` 一次只做一个动作），但**只提交真正变了的**。
        const msgs = []
        const pickedProject = checkedKeys(projPanel.boxes)
        const pickedThemes = checkedKeys(themePanel.boxes)
        const curThemes = cover.theme ?? []

        const hasFieldChange =
          title.input.value !== (cover.title ?? '') ||
          desc.input.value !== (cover.desc ?? '') ||
          kindSel.value !== (cover.kind ?? '') ||
          tagsField.input.value !== (cover.tags ?? []).join(', ')
        if (hasFieldChange) {
          const r = await postJson('/edit', {
            target: 'entry', id: cover.id,
            fields: {
              title: title.input.value, desc: desc.input.value,
              tags: tagsField.input.value.split(',').map((s) => s.trim()).filter((s) => s !== ''),
              kind: kindSel.value,
            },
          })
          msgs.push(r.message)
        }
        if (pickedProject.length === 1 && pickedProject[0] !== cover.project) {
          const r = await postJson('/edit', { target: 'entry', id: cover.id, moveTo: pickedProject[0] })
          msgs.push(r.message)
        }
        const addT = pickedThemes.filter((t) => !curThemes.includes(t))
        const rmT = curThemes.filter((t) => !pickedThemes.includes(t))
        if (addT.length > 0 || rmT.length > 0) {
          const r = await postJson('/edit', {
            target: 'entry', id: cover.id, addThemes: addT, removeThemes: rmT,
          })
          msgs.push(r.message)
        }
        if (globalCb.checked !== (cover.global === true)) {
          const r = await postJson('/edit', { target: 'entry', id: cover.id, setGlobal: globalCb.checked })
          msgs.push(r.message)
        }
        if (msgs.length === 0) return { message: '没有改动' }
        return { message: `已保存 ${msgs.length} 项改动` }
      },
    isArchived
      // ⚠️ 归档物**不给删除**：`deleteEntry` 走的是同一套"归档不可编辑"守卫，
      //    点了只会报错。要删就先恢复（用户裁定 ③：归档物不可编辑）。
      ? null
      : {
        confirmText: `确定删除「${cover.title}」？\n\n⚠️ 不可逆：会同时删除它的正文文件（外部引用只移封面）。`,
        run: async () => await postJson('/edit', { target: 'deleteEntry', id: cover.id }),
        after: () => forgetIfStale('kb', cover.id),
      },
    // ⭐ 归档 / 恢复（决策 133）——**同一个按钮位，两种文字**（用户裁定 ⑨）。
    isArchived
      ? {
        text: '恢复',
        confirmText: `恢复「${cover.title}」？\n\n它将回到知识库页，并重新参与工具的搜索与展示。`,
        run: async () => await postJson('/edit', { target: 'unarchiveEntry', id: cover.id }),
        // ⚠️ 恢复后**离开归档页的位置记忆**，否则右侧会一直停在"这条已经不在归档清单里"的 id 上。
        after: () => forgetIfStale('archive', cover.id),
      }
      : {
        text: '归档',
        confirmText: `归档「${cover.title}」？\n\n它将从知识库页移入「归档 → 知识」，工具侧也搜不到它（可随时恢复）。`,
        run: async () => await postJson('/edit', { target: 'archiveEntry', id: cover.id }),
        after: () => forgetIfStale('kb', cover.id),
      },
  )
  wrap.append(footer.wrap)

  return wrap
}

// ───────────────────────────────────────────────────────────────────────────
// 项目标签
// ───────────────────────────────────────────────────────────────────────────

/** 渲染项目左侧列表。 */
function renderProjectList() {
  const box = document.getElementById('pj-list')
  if (!box) return
  document.getElementById('pj-count').textContent = `${state.projects.length} 个项目`
  const cur = currentId()
  // ⭐ 决策 123：**按更新时间倒序**。
  // ⭐⭐ **分页**（用户 2026-09-25）——项目页**没有筛选** ⇒ key 只需区分"这是哪个列表"。
  renderPagedList(box, sortByUpdatedDesc(state.projects), (p) => {
    const card = h('div', {
      class: `item${cur === p.id ? ' active' : ''}`,
      onclick: () => { navigate(`#/project/${p.id}`, true) },
    })
    // ⭐ 显示名优先（决策 115）；没设就显示 id。
    card.append(h('div', { class: 'item-title', text: p.title || p.id }))
    if (p.title) card.append(h('div', { class: 'dim small', text: p.id }))
    card.append(h('div', { class: 'item-desc', text: p.desc || '（无描述）' }))
    const meta = h('div', { class: 'meta' })
    const n = state.covers.filter((c) => c.project === p.id).length
    meta.append(tag(`${n} 条知识`))
    for (const t of p.themes ?? []) meta.append(tag(t, 'theme'))
    card.append(meta)
    // ⭐ 决策 123：小字更新时间放在**列表块最下面**（标签之下）。
    const pts = fmtUpdatedLine(p.updatedAt)
    if (pts !== '') card.append(h('div', { class: 'item-time', text: pts }))
    return card
  }, { key: 'projects', empty: '库里还没有项目。' })
}

/**
 * 渲染项目右侧详情（该项目 handoff 文档的叙事部分）。
 *
 * ⭐ 与 `renderEntryDetail` 同理（决策 133）：**项目页与归档页共用**，
 *    差别只有容器 id 与空态文案；归档态**由数据决定**（`frontmatter.archivedAt`）。
 * @param id - 项目 id。
 * @param opts - 可选：`{ boxId, tab, emptyText }`。
 */
async function renderProjectDetail(id, opts = {}) {
  const box = document.getElementById(opts.boxId ?? 'pj-detail')
  if (!box) return
  const tab = opts.tab ?? 'projects'
  // 🔴 每次重画**先清掉旧目录**（见 `clearToc` 的说明）。
  clearToc(box)
  if (!id) {
    box.replaceChildren(h('div', { class: 'empty', text: opts.emptyText ?? '从左侧选择一个项目。' }))
    return
  }
  box.replaceChildren(h('div', { class: 'empty', text: '加载中…' }))
  let data
  try {
    data = await getJson(`/project?id=${encodeURIComponent(id)}`)
  } catch (e) {
    // ⚠️ 记忆失效（项目已不在库里）⇒ 忘掉，避免永久卡在"加载失败"。
    forgetIfStale(tab, id)
    box.replaceChildren(h('div', { class: 'empty', text: `加载失败：${e.message}` }))
    return
  }
  const isArchived = (data.frontmatter.archivedAt ?? '') !== ''
  box.replaceChildren()
  box.append(h('h2', { class: 'detail-title', text: `HANDOFF — ${data.frontmatter.project}` }))
  if (isArchived) {
    // ⭐ 归档项目的横幅要**说清"它旗下的知识没被归档"**——用户裁定 ①，
    //    也是最容易被误解的一点（看到"项目归档"会以为整个项目连知识一起封存）。
    box.append(
      h('div', { class: 'notice archived' },
        h('div', { text: `📦 该项目**已归档**（${fmtLocalTime(data.frontmatter.archivedAt)}）——它自己不再参与工具的检索与展示。` }),
        h('div', { class: 'dim small', text: '⚠️ 旗下的知识**没有**跟着归档，仍照常出现在知识库页。要恢复项目，请在下面的编辑面板点「恢复」。' }),
      ),
    )
  }
  box.append(
    renderFrontmatter([
      ['project', data.frontmatter.project],
      ['desc', data.frontmatter.desc],
      ['themes', data.frontmatter.themes],
      ['封面数', data.coverCount],
      ['保留的非法块', data.orphanCount > 0 ? `${data.orphanCount} 处（待修）` : 0],
      // ⭐ 时间字段（决策 119）；决策 123：转本地时区显示。
      ['createdAt', fmtLocalTime(data.frontmatter.createdAt)],
      ['updatedAt', fmtLocalTime(data.frontmatter.updatedAt)],
      // ⭐ 归档时间（决策 133）。
      ...(isArchived ? [['已归档于', fmtLocalTime(data.frontmatter.archivedAt)]] : []),
    ]),
  )
  if (data.orphanCount > 0) {
    box.append(h('div', { class: 'notice err', text: `⚠️ 该项目里有 ${data.orphanCount} 处无法解析的封面块（原文已保留）——请到「审批 → 非法封面」修复。` }))
  }
  // ⭐⭐ 项目编辑面板（决策 114 / 115）。
  //    ⚠️ **ID 只读**——改名改的是显示名（`title`），**不动 id**（用户明确要求）。
  {
    const nameIn = fieldText('显示名', data.frontmatter.title ?? '', {
      placeholder: '留空 = 显示 id；改名**不改 id**', disabled: isArchived,
    })
    const descIn = fieldText('desc', data.frontmatter.desc ?? '', {
      multiline: true, rows: 3, placeholder: '≤200 字符；写清"这是什么项目；当什么场景时来这找知识"',
      disabled: isArchived,
    })
    // 项目 → 主题（勾选面板）
    const themePanel = checkPanel(state.themes, data.frontmatter.themes ?? [], (t) => t.id, (t) => t.id)
    // ⭐ 归档项目**不可编辑**（决策 133，与条目一致）。
    if (isArchived) for (const cb of themePanel.boxes.values()) cb.disabled = true
    const footer = editFooter(
      isArchived
        ? null
        : async () => {
        const r = await postJson('/edit', {
          target: 'projectFields', id: data.frontmatter.project,
          fields: { title: nameIn.input.value, desc: descIn.input.value },
        })
        // ⭐ 主题勾选：与当前对比出增删（复用 entry 的同一套语义）。
        const picked = checkedKeys(themePanel.boxes)
        const cur = data.frontmatter.themes ?? []
        const add = picked.filter((t) => !cur.includes(t))
        const remove = cur.filter((t) => !picked.includes(t))
        if (add.length > 0 || remove.length > 0) {
          // ⚠️ 项目的 `themes:` 是**汇总出来的**（由旗下封面推出），
          //    这里通过"把关系落到该项目的封面上"来实现——
          //    ⚠️ 若项目下没有封面，勾选**无处可落**，故明确告知。
          const own = state.covers.filter((c) => c.project === data.frontmatter.project)
          if (own.length === 0) {
            throw new Error('该项目下还没有知识——主题关联由封面聚合而来，没有封面就无处可落。请先给它加知识。')
          }
          for (const c of own) {
            await postJson('/edit', { target: 'entry', id: c.id, addThemes: add, removeThemes: remove })
          }
        }
        return { message: r.message }
      },
      isArchived
        ? null
        : {
          confirmText: `确定删除项目「${data.frontmatter.title || data.frontmatter.project}」？\n\n⚠️ 只有它旗下已无知识时才允许。`,
          run: async () => await postJson('/edit', { target: 'deleteProject', id: data.frontmatter.project }),
          after: () => forgetIfStale('project', data.frontmatter.project),
        },
      // ⭐ 归档 / 恢复（决策 133 / 用户裁定 ⑨：项目面板同样有这个按钮）。
      isArchived
        ? {
          text: '恢复',
          confirmText: `恢复项目「${data.frontmatter.project}」？\n\n它将回到项目页，并重新参与工具的搜索与展示。`,
          run: async () => await postJson('/edit', { target: 'unarchiveProject', id: data.frontmatter.project }),
          after: () => forgetIfStale('archive', data.frontmatter.project),
        }
        : {
          text: '归档',
          confirmText:
            `归档项目「${data.frontmatter.project}」？\n\n` +
            '它自己将从项目页移入「归档 → 项目」，工具侧也搜不到它。\n' +
            '⚠️ 它旗下的知识**不跟着归档**（仍在知识库页），挂靠关系也不变。可随时恢复。',
          run: async () => await postJson('/edit', { target: 'archiveProject', id: data.frontmatter.project }),
          after: () => forgetIfStale('projects', data.frontmatter.project),
        },
    )
    box.append(
      h('details', { class: 'editor' },
        h('summary', { text: '✏️ 编辑' }),
        // ⭐ 归档项目**不可编辑**（决策 133）——面板还在（要在里面点「恢复」），
        //    但字段全禁用，并明确说出原因，免得让人以为"界面坏了"。
        isArchived
          ? h('div', { class: 'dim small', text: '📦 已归档的项目不可编辑——面板里只能做「恢复」。' })
          : null,
        h('div', { class: 'edit-block' },
          h('h4', { text: '基本信息' }),
          h('div', { class: 'form-grid single' },
            h('div', { class: 'field' },
              h('label', { class: 'lbl', text: 'id（只读，改名不会改它）' }),
              h('div', { class: 'ro', text: data.frontmatter.project }),
            ),
            nameIn.wrap,
            descIn.wrap,
          ),
        ),
        h('div', { class: 'edit-block' },
          h('h4', { text: '主题' }),
          themePanel.wrap,
          h('div', { class: 'dim small', text: '勾选 = 关联；取消 = 解除。⚠️ 项目的主题由**旗下封面**聚合而来，需要项目下有知识。' }),
        ),
        footer.wrap,
      ),
    )
  }
  const md = renderBody(data.narrative ?? '')
  box.append(md)
  // ⭐ 目录（决策 132）——项目详情渲染的是 handoff 的叙事节（**节名/节数由该文档自己的模板决定**），
  //    目录就按实际渲染出来的标题生成（不假定是六节）。
  attachToc(box, md, data.narrative ?? '')
}

// ───────────────────────────────────────────────────────────────────────────
// 主题标签（决策 106）—— 与「项目」页**同布局、同功能**
// ───────────────────────────────────────────────────────────────────────────

/** 渲染主题左侧列表。 */
function renderThemeList() {
  const box = document.getElementById('th-list')
  if (!box) return
  document.getElementById('th-count').textContent = `${state.themes.length} 个主题`
  const cur = currentId()
  // ⭐ 决策 123：**按更新时间倒序**。
  // ⭐⭐ **分页**（用户 2026-09-25）。
  renderPagedList(box, sortByUpdatedDesc(state.themes), (t) => {
    const card = h('div', {
      class: `item${cur === t.id ? ' active' : ''}`,
      onclick: () => { navigate(`#/theme/${t.id}`, true) },
    })
    // ⭐ 显示名优先（决策 115）；没设就显示 id。
    card.append(h('div', { class: 'item-title', text: t.title || t.id }))
    if (t.title) card.append(h('div', { class: 'dim small', text: t.id }))
    card.append(h('div', { class: 'item-desc', text: t.desc || '（无描述）' }))
    const meta = h('div', { class: 'meta' })
    meta.append(tag(`${t.covers ?? 0} 条知识`))
    // ⭐ 与项目页对称：项目页打**主题**标签，主题页打**项目**标签。
    for (const p of t.projects ?? []) meta.append(tag(p))
    card.append(meta)
    // ⭐ 决策 123：小字更新时间放在**列表块最下面**（标签之下）。
    const tts = fmtUpdatedLine(t.updatedAt)
    if (tts !== '') card.append(h('div', { class: 'item-time', text: tts }))
    return card
  }, { key: 'themes', empty: '库里还没有主题。' })
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐ 详情加载失败 ⇒ **清掉该标签的记忆**（决策 107）
// ══════════════════════════════════════════════════════════════════════════
// 🔴 为什么必须清：记忆里的 id 可能**已经不存在**了（条目被改名/删除，
//    或者库被换了）。若不清，用户每次切回这个标签都会看到同一个"加载失败"，
//    而且**没有任何办法自愈**——他会以为页面坏了。
//    清掉之后，下次切回来是干净的"请选择"状态，可以从头挑。
/**
 * 某个标签记住的 id 失效了 ⇒ 忘掉它。
 * @param tab - 标签名（`kb` / `projects` / `themes`）。
 * @param badId - 失效的 id（与当前记忆一致才清，避免误清新选的）。
 */
function forgetIfStale(tab, badId) {
  if (state.lastId[tab] === badId) state.lastId[tab] = ''
}

/** 渲染主题右侧详情（该主题覆盖的项目 + 知识清单）。 */
async function renderThemeDetail(id) {
  const box = document.getElementById('th-detail')
  if (!box) return
  if (!id) {
    box.replaceChildren(h('div', { class: 'empty', text: '从左侧选择一个主题。' }))
    return
  }
  box.replaceChildren(h('div', { class: 'empty', text: '加载中…' }))
  let data
  try {
    data = await getJson(`/theme?id=${encodeURIComponent(id)}`)
  } catch (e) {
    // ⚠️ 记错了（主题已不在库里）⇒ 忘掉它，别让用户卡在这个错上。
    forgetIfStale('themes', id)
    box.replaceChildren(h('div', { class: 'empty', text: `加载失败：${e.message}` }))
    return
  }
  box.replaceChildren()
  box.append(h('h2', { class: 'detail-title', text: data.frontmatter.title || `THEME — ${data.frontmatter.theme}` }))
  box.append(
    renderFrontmatter([
      ['theme', data.frontmatter.theme],
      ['显示名', data.frontmatter.title || '（未设置，显示 id）'],
      ['desc', data.frontmatter.desc],
      ['封面数', data.coverCount],
      ['覆盖项目', (data.projects ?? []).length],
      // ⭐ 时间字段（决策 119）——⚠️ 依赖 `/theme` 接口把它们带出来
      //    （那个 frontmatter 是**手工构造**的，曾漏掉时间 ⇒ 这里恒显示"（空）"）。
      //    决策 123：转本地时区显示。
      ['createdAt', fmtLocalTime(data.frontmatter.createdAt)],
      ['updatedAt', fmtLocalTime(data.frontmatter.updatedAt)],
    ]),
  )

  // ⭐⭐ 主题编辑面板（决策 114 / 115）——**紧跟在文件头下面**（用户要求）。
  //    ⚠️ 原先被我追加在**知识列表之后**，位置不对。
  //    ⚠️ desc **必须从 `data.frontmatter.desc` 读**——曾经误写成 `data.desc`
  //       ⇒ 输入框永远是空的（用户报的 bug）。
  //    🔴 **改名改的是显示名（`title`），id 永不变**（用户："只能改名，不能改 ID"）。
  {
    const nameIn = fieldText('显示名', data.frontmatter.title ?? '', {
      placeholder: '留空 = 显示 id；改名**不改 id**',
    })
    const descIn = fieldText('desc', data.frontmatter.desc ?? '', {
      multiline: true, rows: 3, placeholder: '≤200 字符；写清"这个主题覆盖什么；当什么场景时用它"',
    })
    const footer = editFooter(
      async () => await postJson('/edit', {
        target: 'themeFields', id,
        fields: { title: nameIn.input.value, desc: descIn.input.value },
      }),
      {
        confirmText: `确定删除主题「${data.frontmatter.title || id}」？\n\n⚠️ 只有它已无任何封面引用时才允许。`,
        run: async () => await postJson('/edit', { target: 'deleteTheme', id }),
        after: () => forgetIfStale('theme', id),
      },
    )
    box.append(
      h('details', { class: 'editor' },
        h('summary', { text: '✏️ 编辑' }),
        h('div', { class: 'edit-block' },
          h('h4', { text: '基本信息' }),
          h('div', { class: 'form-grid single' },
            h('div', { class: 'field' },
              h('label', { class: 'lbl', text: 'id（只读，改名不会改它）' }),
              h('div', { class: 'ro', text: data.frontmatter.theme }),
            ),
            nameIn.wrap,
            descIn.wrap,
          ),
        ),
        footer.wrap,
      ),
    )
  }
  // ⚠️ 如实提示这是**派生层**（决策 42）：主题文档是从封面聚合的投影，
  //    没有它照样能跑，但它缺失说明"重建没跑过"。
  if (data.missingDoc) {
    box.append(
      h('div', {
        class: 'notice err',
        text: '⚠️ 该主题的派生文档 `THEME-<id>.md` 不存在——封面仍在，但派生层没重建过。可用 `memj_rebuild` 重建。',
      }),
    )
  }

  // ── 覆盖的项目（与 THEME 文档的「覆盖的项目」节同构）──
  const projects = data.projects ?? []
  box.append(h('h3', { class: 'section-title', text: `覆盖的项目（${projects.length}）` }))
  if (projects.length === 0) {
    box.append(h('div', { class: 'empty', text: '（暂无）' }))
  } else {
    // ⭐ 用 `renderFrontmatter` 那套两列表格，且**项目 id 可点** ⇒ 跳到项目页
    //    （主题页与项目页互相导航，用户不用回标签栏绕）。
    const table = h('table', { class: 'fm' })
    for (const p of projects) {
      const tr = h('tr', {})
      tr.append(h('th', { text: p.id || '（无项目）' }))
      const td = h('td', {})
      // 🔴🔴 **这里原来是 `<a href="#/project/…">`**——🔴 **它同样会污染历史**：
      //    hash 链接的默认行为**等价于 pushState**（点一次多一条历史）。
      //    ⭐ 决策 129 改法：剥掉 `href` 的导航语义，改用 `navigate()`。
      //    ⚠️ 保留 `<a>` 标签本身（它是"链接"的语义与样式，
      //      也保留了键盘可达性——用 `href="#"` 占位而非删除 `href`）。
      const link = h('a', {
        href: '#',
        text: '打开项目 →',
        onclick: (e) => { e.preventDefault(); navigate(`#/project/${encodeURIComponent(p.id)}`, true) },
      })
      td.append(link)
      if ((p.desc ?? '') !== '') td.append(document.createTextNode(`　${p.desc}`))
      tr.append(td)
      table.append(tr)
    }
    box.append(h('div', { class: 'fm-wrap' }, table))
  }

  // ── 该主题下的知识（点进知识库）──
  const covers = state.covers.filter((c) => c.theme.includes(id))
  box.append(h('h3', { class: 'section-title', text: `知识（${covers.length}）` }))
  if (covers.length === 0) {
    box.append(h('div', { class: 'empty', text: '（暂无）' }))
  } else {
    for (const c of covers) {
      const row = h('div', {
        class: 'item',
        onclick: () => { navigate(`#/kb/${c.id}`, true) },
      })
      row.append(h('div', { class: 'item-title', text: c.title || c.id }))
      const meta = h('div', { class: 'meta' })
      if (c.project) meta.append(tag(c.project))
      if (c.kind) meta.append(tag(c.kind))
      row.append(meta)
      box.append(row)
    }
  }

  // ⚠️ 主题的编辑面板**已移到文件头下面**（决策 115，用户要求）——
  //    这里不再重复渲染。
}

// ───────────────────────────────────────────────────────────────────────────
// ⭐⭐ 归档标签（决策 133）
//
// 🔴 **这一页只有一个动作：恢复**（外加只读查看）。归档是**人侧的治理动作**——
//    模型侧没有任何工具能归档/恢复，也没有工具能改归档物（用户裁定 ③）。
//
// ⚠️ **列表形态与知识库页 / 项目页一致**（用户明确要求）：
//    左列表（可搜索）+ 右详情 + 详情里的编辑面板（面板底部是「恢复」）。
//    因此这里**复用** `renderEntryDetail` / `renderProjectDetail`，
//    只换容器 id 与空态文案——**不另写一套渲染**（本项目吃过"多副本必然漂移"的亏）。
// ───────────────────────────────────────────────────────────────────────────

/**
 * 归档知识的**列表**（形态照抄 `renderKbList`）。
 *
 * ⚠️ 数据源是 `state.archivedEntries`（`/archived?kind=entry`），
 *    **不是** `state.covers`——后者按定义不含归档物。
 */
function renderArchiveEntryList() {
  const box = document.getElementById('arc-list')
  if (!box) return
  const q = (document.getElementById('arc-filter')?.value ?? '').trim().toLowerCase()
  const rows = state.archivedEntries.filter((c) => {
    if (q === '') return true
    return `${c.id} ${c.title} ${c.project} ${c.theme.join(' ')} ${c.desc} ${c.ref} ${c.tags.join(' ')} ${c.kind ?? ''}`
      .toLowerCase()
      .includes(q)
  })
  const cnt = document.getElementById('arc-count')
  if (cnt) cnt.textContent = `${rows.length} / ${state.archivedEntries.length} 条`
  const cur = currentId()
  // ⚠️ 排序仍按 `updatedAt` 倒序（与知识库页一致）；
  //    **归档时间只显示、不参与排序**——否则同一页里"列表序"与别的页会不一致。
  // ⭐⭐ **分页**（用户 2026-09-25）。⚠️ 本页有**两种空态**，而分页器只收一个文案
  //    ⇒ **在这里把文案算好再传进去**（判据留在一处，别让分页器去猜）。
  renderPagedList(box, sortByUpdatedDesc(rows), (c) => {
    const card = h('div', {
      class: `item${cur === c.id ? ' active' : ''}`,
      onclick: () => { navigate(`#/archive/entry/${encodeURIComponent(c.id)}`, true) },
    })
    card.append(h('div', { class: 'item-title', text: c.title || '(无标题)' }))
    const meta = h('div', { class: 'meta' })
    if (c.kind) meta.append(tag(c.kind, 'kind'))
    if (c.project) meta.append(tag(c.project))
    for (const t of c.theme) meta.append(tag(t, 'theme'))
    if (c.ext) meta.append(tag('外部', 'ext'))
    card.append(meta)
    // ⭐ 用户要求：归档页列表**显示归档时间**（决策 133 / 裁定 ⑨）。
    //    ⚠️ 放在**标签之下**、与别的页的小字时间同一位置（`.item-time`）——
    //       用户此前明确要求过"时间放中间不好看"。
    const ts = fmtArchivedLine(c.archivedAt)
    if (ts !== '') card.append(h('div', { class: 'item-time', text: ts }))
    return card
  }, {
    // ⚠️ 筛选条件进 key ⇒ 换筛选就回到第 1 页。
    key: `arc-entry|${document.getElementById('arc-filter')?.value.trim().toLowerCase() ?? ''}`,
    empty: state.archivedEntries.length === 0 ? '没有归档的知识。' : '没有匹配的归档知识。',
  })
}

/**
 * 归档项目的**列表**（形态照抄 `renderProjectList`）。
 *
 * ⚠️ 「N 条知识」= 该项目旗下**仍然活跃**的知识数（服务端算的 `coverCount`）——
 *    归档项目**不带着知识一起归档**（用户裁定 ①），所以这个数通常**不是 0**，
 *    那正是要让用户看到的事实。
 */
function renderArchiveProjectList() {
  const box = document.getElementById('arcp-list')
  if (!box) return
  const cnt = document.getElementById('arcp-count')
  if (cnt) cnt.textContent = `${state.archivedProjects.length} 个项目`
  const cur = currentId()
  // ⭐⭐ **分页**（用户 2026-09-25）。
  renderPagedList(box, sortByUpdatedDesc(state.archivedProjects), (p) => {
    const card = h('div', {
      class: `item${cur === p.id ? ' active' : ''}`,
      onclick: () => { navigate(`#/archive/project/${encodeURIComponent(p.id)}`, true) },
    })
    card.append(h('div', { class: 'item-title', text: p.title || p.id }))
    if (p.title) card.append(h('div', { class: 'dim small', text: p.id }))
    card.append(h('div', { class: 'item-desc', text: p.desc || '（无描述）' }))
    const meta = h('div', { class: 'meta' })
    meta.append(tag(`${p.coverCount ?? 0} 条知识`))
    for (const t of p.themes ?? []) meta.append(tag(t, 'theme'))
    card.append(meta)
    const ts = fmtArchivedLine(p.archivedAt)
    if (ts !== '') card.append(h('div', { class: 'item-time', text: ts }))
    return card
  }, { key: 'arc-projects', empty: '没有归档的项目。' })
}

/** 归档知识详情——复用知识库页的渲染器，只换容器。 */
async function renderArchiveEntryDetail(id) {
  await renderEntryDetail(id, {
    boxId: 'arc-detail',
    tab: 'archive',
    emptyText: '从左侧选择一条归档知识。',
  })
}

/** 归档项目详情——复用项目页的渲染器，只换容器。 */
async function renderArchiveProjectDetail(id) {
  await renderProjectDetail(id, {
    boxId: 'arcp-detail',
    tab: 'archive',
    emptyText: '从左侧选择一个归档项目。',
  })
}

// ───────────────────────────────────────────────────────────────────────────
// 审批标签（§8.5）
// ───────────────────────────────────────────────────────────────────────────

/**
 * 按 `entryId` 找该封面（用于取**主题**等封面字段）。
 *
 * 🔴 **为什么需要**：`nominations.json` 里**只存了** `entryId / title / desc / project / nominatedAt`
 *    （见 `schema.ts` 的 `Nomination`），**没有 `theme`**。
 *    而列表要显示主题标签 ⇒ 从**前端已有的全量封面**里按 id 查。
 * @param entryId - 封面 id。
 * @returns 封面对象；查不到时 `undefined`（如条目已被删，提名成孤儿）。
 */
function coverById(entryId) {
  return state.covers.find((c) => c.id === entryId)
}

/** 渲染待批列表（**只列表**；详情与按钮在右侧，见 `renderPendingDetail`）。 */
function renderPending() {
  const box = document.getElementById('pending-list')
  if (!box) return
  const cnt = document.getElementById('pending-count')
  if (cnt) cnt.textContent = `${state.nominations.length} 条待批`
  const cur = currentId()
  // ⭐⭐ **分页**（用户 2026-09-25）。
  renderPagedList(box, state.nominations, (n) => {
    // ⭐⭐ 决策 130：选中项**不再跳走**（原来点它跳知识库页），而是**在本页右侧渲染详情**。
    const card = h('div', {
      class: n.entryId === cur ? 'item active' : 'item',
      onclick: () => { navigate(`#/review/${encodeURIComponent(n.entryId)}`, true) },
    })
    card.append(h('div', { class: 'item-title', text: n.title || '(无标题)' }))
    card.append(h('div', { class: 'item-desc', text: n.desc || '（无描述）' }))
    // ⭐ 标签区：**去掉 id 标签**（用户要求）、留项目 + 加主题（决策 130）。
    const meta = h('div', { class: 'meta' })
    if (n.project) meta.append(tag(`项目 ${n.project}`))
    const cv = coverById(n.entryId)
    if (cv) for (const t of cv.theme) meta.append(tag(t, 'theme'))
    card.append(meta)
    // ⭐ 提名时间：**小字、非标签**、放标签下面（决策 130，用户明确要求）。
    //    ⚠️ 写明前缀"提名时间："——原来只显示一个裸时间，看不出是什么时间。
    if (n.nominatedAt) {
      card.append(h('div', { class: 'pending-time', text: `提名时间：${fmtLocalTime(n.nominatedAt)}` }))
    }
    return card
  }, { key: 'review-pending', empty: '没有待批准的 global 提名。' })
}

/**
 * 渲染待批**详情**（右栏，决策 130）。
 *
 * 🔴 **与知识库详情的区别**：这里**不放编辑面板**——审批页的动作只有"通过/否决"，
 *    放「编辑」会诱导在审批时改内容（改内容该去知识库页）。
 * ⭐ **按钮也搬到这里**（原来贴在列表卡上）：左右布局后，
 *    按钮留左边会导致"右边看详情、左边点按钮"视线来回跳。
 * @param id - 提名对应的 entryId；空串 ⇒ 显示占位。
 */
async function renderPendingDetail(id) {
  const box = document.getElementById('pending-detail')
  if (!box) return
  // 🔴 每次重画**先清掉旧目录**（见 `clearToc` 的说明）——含"空提名"那条提前返回的路径。
  clearToc(box)
  const n = state.nominations.find((x) => x.entryId === id)
  if (id === '' || n === undefined) {
    box.replaceChildren(h('div', { class: 'empty', text: '从左侧选择一条待批提名。' }))
    return
  }
  box.replaceChildren(h('div', { class: 'empty', text: '加载中…' }))

  /** 重画本页（批准/否决后调用：刷新列表与详情）。 */
  const refresh = async () => {
    await load()
  }

  const ok = h('button', { class: 'primary', text: '通过' })
  ok.onclick = async () => {
    ok.disabled = true
    try {
      await postJson('/approve', { entryId: n.entryId })
      toast('已通过，已重建派生层')
      await refresh()
    } catch (err) { toast(err.message, true); ok.disabled = false }
  }
  const no = h('button', { class: 'danger', text: '否决' })
  no.onclick = async () => {
    no.disabled = true
    try {
      // ⭐ 否决：从提名表移除（并防御性清理存量可能残留的 global:true）。
      await postJson('/reject', { entryId: n.entryId })
      toast('已否决（提名已移除）')
      await refresh()
    } catch (err) { toast(err.message, true); no.disabled = false }
  }

  const cv = coverById(n.entryId)
  box.replaceChildren()
  // ⭐ 标题 + 按钮区**放最上面**（先决定、再往下看细节）。
  box.append(h('h2', { class: 'detail-title', text: n.title || '(无标题)' }))
  box.append(h('div', { class: 'pending-actions' }, ok, no))
  // ⭐ 文件头（与知识库详情同款键值表，但**只读、不放编辑入口**）。
  box.append(
    renderFrontmatter([
      ['id', n.entryId],
      ['project', n.project],
      ['theme', cv?.theme ?? []],
      ['kind', cv?.kind || '（未分类）'],
      ['desc', n.desc],
      ['提名时间', fmtLocalTime(n.nominatedAt)],
      // ⚠️ 条目可能已被删（提名成孤儿）——明说，否则下面对不上会让人困惑。
      ...(cv === undefined ? [['⚠️ 注意', '该条目已不在库里（提名成了孤儿）']] : []),
    ]),
  )
  // ⭐ 正文：走与知识库详情**同一条** `/entry` 渲染路径（含外链渲染，决策 128）。
  try {
    const data = await getJson(`/entry?id=${encodeURIComponent(n.entryId)}`)
    // ⚠️ 期间用户可能已切走 —— 只有一个"当前 id"符合才落笔（防串台）。
    if (currentId() !== n.entryId) return
    if (data.missing) {
      box.append(h('div', { class: 'notice err', text: '⚠️ 正文文件不存在（ref 指向的文件读不到）。' }))
    } else {
      if (data.cover?.ext) {
        box.append(
          h('div', { class: 'notice' },
            h('div', { text: '这是一条外部引用（ext: true）——正文来自库外文件，memj 不改动它。' }),
            h('div', { class: 'mono dim', text: data.cover.ref }),
          ),
        )
      }
      const md = renderBody(data.body ?? '')
      box.append(md)
      // ⭐ 目录（决策 132）——与知识库详情同一条渲染路径，故同样支持目录。
      attachToc(box, md, data.body ?? '')
    }
  } catch (e) {
    box.append(h('div', { class: 'notice err', text: `正文加载失败：${e.message}` }))
  }
}

/** 渲染非法封面列表（含「修复」按钮 → 就地编辑表单）。 */
function renderInvalid() {
  const box = document.getElementById('invalid-list')
  if (!box) return
  // ⭐⭐ **分页**（用户 2026-09-25）。
  renderPagedList(box, state.invalid, (it) => {
    const card = h('div', { class: 'card' })
    card.append(h('div', { class: 'row1' }, h('span', { class: 'title', text: it.reason })))
    card.append(h('div', { class: 'meta' }, tag(`${it.file}:${it.line}`, 'id')))

    const formBox = h('div', { class: 'form-box' })
    const btn = h('button', { class: 'primary', text: '🛠 修复' })
    btn.onclick = async () => {
      btn.disabled = true
      try {
        const blk = await getJson(`/block?file=${encodeURIComponent(it.file)}&line=${it.line}`)
        formBox.replaceChildren(buildCoverForm(blk, () => load()))
      } catch (e) {
        toast(e.message, true)
      } finally {
        btn.disabled = false
      }
    }
    card.append(h('div', { class: 'row1 actions' }, btn), formBox)
    return card
  }, { key: 'review-invalid', empty: '全部封面格式合法。' })
}

/** 渲染断链列表（含「重新填路径」按钮）。 */
function renderBroken() {
  const box = document.getElementById('broken-list')
  if (!box) return
  // ⭐⭐ **分页**（用户 2026-09-25）。
  renderPagedList(box, state.broken, (b) => {
    const card = h('div', { class: 'card' })
    card.append(h('div', { class: 'row1' }, h('span', { class: 'title mono', text: b.ref })))
    const meta = h('div', { class: 'meta' })
    meta.append(tag(b.id, 'id'))
    if (b.project) meta.append(tag(`项目 ${b.project}`))
    meta.append(tag('目标文件不存在', 'missing'))
    card.append(meta)

    const formBox = h('div', { class: 'form-box' })
    const btn = h('button', { class: 'primary', text: '🔗 重新填路径' })
    btn.onclick = async () => {
      btn.disabled = true
      try {
        const loc = findBlockLocation(b.id)
        if (loc === null) throw new Error('定位失败：库里找不到这张封面的位置')
        const blk = await getJson(`/block?file=${encodeURIComponent(loc.file)}&line=${loc.line}`)
        formBox.replaceChildren(buildRefForm(blk, () => load()))
      } catch (e) {
        toast(e.message, true)
      } finally {
        btn.disabled = false
      }
    }
    card.append(h('div', { class: 'row1 actions' }, btn), formBox)
    return card
  }, { key: 'review-broken', empty: '没有断链的外部引用。' })
}

/** 从封面清单里找出某 id 的块位置（file + line）。 */
function findBlockLocation(id) {
  const c = state.covers.find((x) => x.id === id)
  if (!c || c.sourceFile === undefined || c.line === undefined) return null
  return { file: c.sourceFile, line: c.line }
}

/**
 * 构建封面编辑表单（§8.6）。
 *
 * ⚠️ **允许改 `id`**（§12-77 用户拍板）：否则"id 不是 UUID 形状 / 缺 id"这两类
 * 在页面上根本无法修复。形状与**库内唯一性由服务端硬校验把关**。
 * ⚠️ **不允许改 `ext`**（§12-78 用户拍板）：它决定 ref 的解析方式，互转等于换知识形态。
 * @param block - `/api/block` 的返回。
 * @param onDone - 保存成功后的回调。
 * @returns 表单元素。
 */
function buildCoverForm(block, onDone) {
  const raw = block.raw ?? ''
  const ext = pickField(raw, 'ext') === 'true'

  const f = {
    id: h('input', { value: pickField(raw, 'id'), placeholder: 'UUID' }),
    project: h('input', { value: pickField(raw, 'project') }),
    theme: h('input', { value: pickArray(raw, 'theme').join(', '), placeholder: '逗号分隔' }),
    kind: h('input', { value: pickField(raw, 'kind'), placeholder: `${kindIdsForPlaceholder()}（可留空）` }),    tags: h('input', { value: pickArray(raw, 'tags').join(', '), placeholder: '逗号分隔' }),
    // ⭐ `title` 是封面字段（决策 98）——修复表单必须带上它，
    //    否则"修好一个非法封面"会把标题丢掉、又被判缺 title。
    title: h('input', { value: pickField(raw, 'title'), placeholder: '2–48 字符' }),
    desc: h('textarea', { rows: 3, value: pickField(raw, 'desc') }),
    ref: h('input', { value: pickField(raw, 'ref') }),
  }
  const globalChk = h('input', { type: 'checkbox' })
  if (pickField(raw, 'global') === 'true') globalChk.checked = true

  const grid = h('div', { class: 'form-grid' })
  const row = (label, el, hint) =>
    grid.append(
      h('label', { class: 'field' },
        h('span', { class: 'lbl', text: label }),
        el,
        hint ? h('span', { class: 'fhint', text: hint }) : null,
      ),
    )

  row('id', f.id, '⭐ 可改，但必须是 UUID 形状且在库内唯一（服务端校验）')
  row('project', f.project)
  row('theme', f.theme, '逗号分隔；只能填已存在的主题 id')
  // ⭐⭐ **人侧勾选 = 直接生效**（决策 116）——修复表单同样走人侧写入
  //    （`/fix-cover` 把 `global` 直接写进封面，见 `api.ts`）⇒ **不提"提名/批准"**。
  row('global', globalChk, '勾选 = 加入全局（直接生效）')
  row('kind', f.kind, `受控词表（${state.kinds.filter((k) => k.reserved !== true).length || 4} 值），留空 = 未分类`)
  row('tags', f.tags, '至少 1 个，逗号分隔')
  row('title', f.title, '⭐ 必填，2–48 字符（标题的权威来源是封面）')
  row('desc', f.desc, '必填，≤200 字符')
  row('ref', f.ref, '内部条目为库内相对路径；外部引用为绝对路径')
  grid.append(
    h('div', { class: 'field' },
      h('span', { class: 'lbl', text: 'ext' }),
      h('span', { class: 'ro', text: ext ? 'true（外部引用，不可改）' : 'false（库内条目，不可改）' }),
    ),
  )

  const errBox = h('div', { class: 'form-err' })
  const save = h('button', { class: 'primary', text: '保存' })
  const cancel = h('button', { text: '取消' })
  cancel.onclick = () => formBoxOf(grid).replaceChildren()

  save.onclick = async () => {
    save.disabled = true
    errBox.replaceChildren()
    try {
      await postJson('/fix-cover', {
        file: block.file,
        startLine: block.startLine,
        endLine: block.endLine,
        rawKind: f.kind.value.trim(),
        cover: {
          id: f.id.value.trim(),
          project: f.project.value.trim(),
          theme: f.theme.value.split(',').map((s) => s.trim()).filter((s) => s !== ''),
          global: globalChk.checked,
          kind: f.kind.value.trim(),
          tags: f.tags.value.split(',').map((s) => s.trim()).filter((s) => s !== ''),
          title: f.title.value.trim(),
          desc: f.desc.value,
          ref: f.ref.value.trim(),
          ext,
        },
      })
      toast('已修复并写回')
      if (onDone) await onDone()
    } catch (e) {
      showFormError(errBox, e)
      save.disabled = false
    }
  }

  return h('div', {},
    h('div', { class: 'raw-block' }, h('div', { class: 'fm-title', text: '原始块' }), h('pre', { text: raw })),
    grid,
    h('div', { class: 'row1 actions' }, save, cancel),
    errBox,
  )
}

/**
 * 构建断链重填表单（§8.6 / 决策 89）。
 *
 * ⚠️ **只允许改 `ref`**（§12-78 用户拍板：不允许改 `ext`）。
 * ⚠️ 写前服务端会校验**目标文件当前确实存在**。
 * @param block - `/api/block` 的返回。
 * @param onDone - 保存成功后的回调。
 * @returns 表单元素。
 */
function buildRefForm(block, onDone) {
  const raw = block.raw ?? ''
  const input = h('input', { value: pickField(raw, 'ref'), placeholder: '绝对路径，如 D:\\path\\to\\doc.md' })
  const errBox = h('div', { class: 'form-err' })
  const save = h('button', { class: 'primary', text: '保存' })
  const cancel = h('button', { text: '取消' })
  cancel.onclick = () => formBoxOf(input).replaceChildren()

  save.onclick = async () => {
    save.disabled = true
    errBox.replaceChildren()
    try {
      await postJson('/fix-ref', {
        file: block.file,
        startLine: block.startLine,
        endLine: block.endLine,
        ref: input.value.trim(),
      })
      toast('已重填路径并写回')
      if (onDone) await onDone()
    } catch (e) {
      showFormError(errBox, e)
      save.disabled = false
    }
  }

  const grid = h('div', { class: 'form-grid' },
    h('label', { class: 'field' },
      h('span', { class: 'lbl', text: 'ref（新路径）' }),
      input,
      h('span', { class: 'fhint', text: '必须是绝对路径，且文件当前存在；ext 不允许改' }),
    ),
  )
  return h('div', {},
    h('div', { class: 'raw-block' }, h('div', { class: 'fm-title', text: '原始块' }), h('pre', { text: raw })),
    grid,
    h('div', { class: 'row1 actions' }, save, cancel),
    errBox,
  )
}

/** 找表单外层的 `.form-box`（取消时清空它）。 */
function formBoxOf(el) {
  return el.closest('.form-box') ?? el.parentElement
}

/** 把失败原因（含逐条 issues，决策 62）显示在表单里。 */
function showFormError(errBox, e) {
  errBox.append(h('div', { class: 'err-line', text: `保存失败：${e.message}` }))
  const issues = (e.body && e.body.issues) || []
  for (const it of issues) errBox.append(h('div', { class: 'err-line', text: `· ${it}` }))
}

// ───────────────────────────────────────────────────────────────────────────
// 路由与标签切换
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⭐⭐ **取"该标签的默认选中项"**（决策 131）——**列表第一条**。
 *
 * 🔴 **为什么需要**：用户要求"网页加载时，默认选中列表第一条并展开详情"。
 *    此前首次加载**右侧是空占位**（"从左侧选择一条知识"），得手动点一下。
 *
 * ⚠️ **只在"既没有 hash id、也没有记忆"时兜底**（用户选 A）——
 *    这样**不破坏决策 107**（"切回来还在原条目"）：看过的标签仍有记忆，走记忆。
 *
 * ⚠️ **判据必须与列表渲染完全一致**（同一个过滤 + 同一个排序），
 *    否则会出现"高亮的不在第一条"这种怪现象（列表按 A 排序、兜底却取了 B 的第一条）。
 * @param tab - 标签名（`kb` / `projects` / `themes` / `review`）。
 * @returns 第一条的 id；列表为空时返回 `''`（⭐ 用户明确："列表为空除外"）。
 */
function defaultIdFor(tab) {
  if (tab === 'kb') {
    // ⚠️ 与 `renderKbList` 一致：**走 `filteredCovers()` + 同一个排序**。
    //    但**只在筛选器全为默认时才兜底**（见 `isFilterDefault`）——
    //    否则用户一边打字搜索、右侧详情会乱跳（用户已确认"筛选后不自动选中"）。
    if (!isFilterDefault()) return ''
    const rows = sortByUpdatedDesc(filteredCovers())
    return rows.length > 0 ? rows[0].id : ''
  }
  if (tab === 'projects') {
    const rows = sortByUpdatedDesc(state.projects)
    return rows.length > 0 ? rows[0].id : ''
  }
  if (tab === 'themes') {
    const rows = sortByUpdatedDesc(state.themes)
    return rows.length > 0 ? rows[0].id : ''
  }
  if (tab === 'review' && state.sub === 'pending') {
    return state.nominations.length > 0 ? state.nominations[0].entryId : ''
  }
  if (tab === 'archive') {
    // ⚠️ 与 `renderArchiveEntryList` 一致：**搜索框有内容时不自动选中**
    //    （与知识库页同理——搜索是"缩小范围"，选中是"我要看这条"，别让右侧乱跳）。
    if (state.arcSub === 'entry' && (document.getElementById('arc-filter')?.value ?? '').trim() !== '') return ''
    const rows = sortByUpdatedDesc(archiveListOf(state.arcSub))
    return rows.length > 0 ? rows[0].id : ''
  }
  return ''
}

/**
 * 知识库筛选器是否**全为默认值**（决策 131）。
 *
 * 🔴 **为什么需要**：用户裁定"**筛选后不自动选中**"——
 *    筛选是"缩小范围"，选中是"我要看这条"，两者意图不同；
 *    自动跳会让搜索时右侧不断闪。
 * @returns 全默认返回 true。
 */
function isFilterDefault() {
  const q = document.getElementById('kb-filter')?.value.trim() ?? ''
  const kind = document.getElementById('kb-kind')?.value ?? ''
  const project = document.getElementById('kb-project')?.value ?? ''
  const theme = document.getElementById('kb-theme')?.value ?? ''
  return q === '' && kind === '' && project === '' && theme === ''
}

/** 应用 hash 路由（刷新后仍停在原条目，§8.2 的【我默认】①）。 */
function applyRoute() {
  const m = /^#\/(\w+)(?:\/(.+))?$/.exec(location.hash)
  const seg = m ? m[1] : ''
  if (seg === 'kb') state.tab = 'kb'
  else if (seg === 'project') state.tab = 'projects'
  else if (seg === 'theme') state.tab = 'themes'
  else if (seg === 'hot' || seg === 'review') state.tab = seg
  // ⭐⭐ 设置页（决策 169）：hash 里带子页就以它为准（刷新后落回同一个子页）。
  else if (seg === 'settings') {
    state.tab = 'settings'
    const sub = m?.[2] ?? ''
    if (SET_SUBTABS.includes(sub)) state.setSub = sub
  }
  else if (seg === 'archive') {
    state.tab = 'archive'
    // ⭐ hash 里带 kind 就以它为准（`#/archive/project/<id>` 刷新后要落在**项目**子页）。
    const k = currentArchiveKind()
    if (k !== '') state.arcSub = k
  }
  renderTabs()

  // ⭐ **记住"每个标签上次看的条目"**（决策 107）：
  //    从 hash 里取到 id 就记下来；没取到（如 `#/theme` 这种**标签级**路由）
  //    就**回落到上次记的** —— 这正是"切回来还在原处"的关键。
  let fromHash = currentId()
  // ⭐⭐ **归档页特有的严格化**（决策 133）：**清单里没有的 id 一律不认**。
  //    🔴 为什么别的页不用这样：只有归档页的 id 会**在两个清单之间搬家**
  //       （归档 / 恢复都会搬），而 hash 不会自己跟着变
  //       ⇒ 不认它，才能干净地回落到"该子页的第一条"，
  //          而不是把右侧停在一个"已经不在这个清单里"的条目上。
  if (state.tab === 'archive' && fromHash !== '' && !archiveListOf(state.arcSub).some((x) => x.id === fromHash)) {
    fromHash = ''
  }
  if (fromHash !== '' && state.lastId[state.tab] !== undefined) {
    state.lastId[state.tab] = fromHash
  }
  let remembered = state.lastId[state.tab] ?? ''
  // ⚠️ 归档页的记忆也要按子页校验（记忆是**整个 archive 标签一份**的）。
  if (state.tab === 'archive' && remembered !== '' && !archiveListOf(state.arcSub).some((x) => x.id === remembered)) {
    remembered = ''
  }
  // ⭐⭐ **决策 131**：hash 没有、记忆也没有 ⇒ **兜底到列表第一条**（用户选 A）。
  //    ⚠️ 顺序即优先级：**hash > 记忆 > 第一条**。
  //       前两者都空才兜底 ⇒ 既满足"加载时默认展开"、又不破坏"切回来还在原条目"。
  const id = fromHash !== '' ? fromHash : (remembered !== '' ? remembered : defaultIdFor(state.tab))
  // 🔴 兜底命中时**也要把它记进 `lastId`**——否则从别处切回来时记忆仍是空的，
  //    会再次走兜底（虽然结果相同，但语义上"这条已经是当前选择"应被记住）。
  if (id !== '' && state.lastId[state.tab] === '') state.lastId[state.tab] = id

  // ⚠️ **把 id 补回 hash**：用户看到地址栏与页面一致，刷新/分享也拿得到。
  //    只在"原本没有 id"时补，且用 replaceState（**不新增历史记录**，
  //    否则每次切标签都会往历史里塞一条，后退变得很烦）。
  // ⭐ 决策 130：`review` **也加入**（它的"上次看的条目"记的是待批条目 id）。
  // ⭐ 决策 133：`archive` 也加入——但它的路径**多一段 kind**
  //    （`#/archive/<entry|project>/<id>`），否则刷新后不知道该去哪个子页找这个 id。
  const idTabs = state.tab === 'kb' || state.tab === 'projects' || state.tab === 'themes' ||
    state.tab === 'review' || state.tab === 'archive'
  if (fromHash === '' && id !== '' && idTabs) {
    const seg2 = state.tab === 'kb' ? 'kb' : state.tab === 'projects' ? 'project' : state.tab === 'themes' ? 'theme' : 'review'
    const path = state.tab === 'archive'
      ? `archive/${state.arcSub}/${encodeURIComponent(id)}`
      : `${seg2}/${encodeURIComponent(id)}`
    history.replaceState(null, '', `#/${path}`)
  }

  // ⭐⭐ **渲染详情 + 渲染完恢复滚动位置**（决策 138）。
  //    🔴 一律走 `renderDetailAndRestore()`：它保证"渲染完再恢复"
  //       （重画会清零 `scrollTop`，早恢复等于白做）。
  if (state.tab === 'kb') {
    renderKbList()
    renderDetailAndRestore('kb', id, () => renderEntryDetail(id))
  } else if (state.tab === 'projects') {
    renderProjectList()
    renderDetailAndRestore('projects', id, () => renderProjectDetail(id))
  } else if (state.tab === 'themes') {
    renderThemeList()
    renderDetailAndRestore('themes', id, () => renderThemeDetail(id))
  } else if (state.tab === 'archive') {
    // ⚠️ 两个列表都画（切子页只切显隐，不重新拉数据）；只画**当前子页**的详情。
    renderArchiveEntryList()
    renderArchiveProjectList()
    if (state.arcSub === 'project') renderDetailAndRestore('archive', id, () => renderArchiveProjectDetail(id))
    else renderDetailAndRestore('archive', id, () => renderArchiveEntryDetail(id))
  } else if (state.tab === 'settings') {
    // ⭐⭐ 切到设置页就**拉一次当前值预填**（决策 169）。
    //    🔴 只拉数据、不弹浮层 —— 它现在是**视图**，不是对话框。
    //    ⚠️ keepMessage:true ⇒ **不清空各页那行保存结果**：
    //       否则"保存成功"会被随后的预填冲掉（旧面板踩过这个，e2e 抓到过）。
    void openSettingsPage(state.setSub, { keepMessage: true })
  } else if (state.tab === 'review') {
    // ⭐ 决策 130：待批子页也支持"记住上次看的条目"。
    //    ⚠️ 只对 **pending** 子标签有意义（invalid / broken 是另一套列表，见下一步）。
    if (state.sub === 'pending') {
      renderPending()
      renderDetailAndRestore('review', id, () => renderPendingDetail(id))
    }
  }
}

/**
 * ⭐⭐ **渲染详情并在渲染完成后恢复滚动位置**（决策 138）。
 *
 * 🔴 **为什么必须"渲染完再恢复"**：`renderXxxDetail()` 内部会 `replaceChildren()`
 *    重画 ⇒ **`scrollTop` 被清零且不可逆**（CDP 实测：1500 → 清空 → 重新 append 仍是 0）。
 *    ⇒ 在渲染**之前**恢复等于白做。
 *
 * ⚠️ `prevId` **必须在调用渲染函数之前取**——渲染函数返回后
 *    `state.renderedId` 可能已被更新，那时就分不清"换条目"还是"回原条目"了。
 * @param tab - 标签名。
 * @param id - 本次要渲染的条目 id。
 * @param render - 渲染函数（返回 Promise）。
 */
function renderDetailAndRestore(tab, id, render) {
  const prevId = state.renderedId[tab] ?? ''
  void Promise.resolve(render()).then(() => {
    state.renderedId[tab] = id
    restoreScroll(tab, id, prevId)
    // ⭐⭐ **窄屏：选中某条 ⇒ 详情栏从右侧滑入**（用户 2026-09-24 要求）。
    // 🔴 **必须放在 `render()` 之后**：各 `renderXxxDetail()` 会 `replaceChildren()`
    //    重画详情栏 ⇒ 在这之前插的「收起」按钮**会被抹掉**（本项目老坑：
    //    "重画会把插进去的东西清掉"，滚动位置那段注释也记着同一件事）。
    //
    // 🔴🔴 **但不能"只要有 id 就滑入"** —— 实测踩到：
    //    `goto()` 会**带着"上次看的条目"**（`state.lastId[tab]`）调 `navigate`
    //    ⇒ 一进页面 `id` 就非空 ⇒ **窄屏下打开页面直接是详情页**，
    //    而用户要的是*"打开的时候，默认是全屏的左栏列表"*。
    //    ⭐ 用户还明确要了 `open` 这个语义（决策 107：切回来落回原来那条），
    //    ⇒ **折中（也是唯一说得通的）**：
    //      · **用户主动点列表** ⇒ 滑入（这是本条需求的主体）；
    //      · **页面/标签自己恢复出来的 id** ⇒ 只把详情**渲染好备着**，
    //        **但不滑入** —— 用户一进来先看列表，点那条才看到。
    //    ⚠️ 判据用 `state.narrowUserPick`（由列表点击置位，消费一次即清）——
    //       **不能靠"id 变没变"**：恢复出来的 id 与点出来的 id 长得一模一样。
    const userPicked = state.narrowUserPick
    state.narrowUserPick = false
    syncNarrowOpen(tab, userPicked ? id : '')
  })
}

/**
 * ⭐⭐⭐ **窄屏的两级导航**（用户 2026-09-24 要求）。
 *
 * 用户原话：*"所有有左右栏排版的页面（项目热知识的项目热知识编辑页另外设计先不动）。
 * 现在是上下结构。我希望的是，打开的时候，默认是全屏的左栏列表，点击某条进入详情页（右栏），
 * 右栏从右侧划入屏幕同样占全屏覆盖，应该有悬浮的半透明收起按钮，点击后收起详情页（右栏）。"*
 *
 * 🔴 **判据用 `matchMedia`，与 CSS 的断点共用同一个数字（900）**——
 *    ⚠️ **不能在 JS 里另写一个数字**（本项目铁律"实现只留一份"：
 *    两处各写一份，迟早会出现"CSS 认为是窄屏、JS 认为是宽屏"的错位，
 *    表现为**栏滑出去了但按钮没生成**这种半坏状态）。
 * ⚠️ 阈值与 CSS 的 `@media (max-width: 900px)` **必须一致**（改一处就要改两处，见注释）。
 */
const NARROW_QUERY = '(max-width: 900px)'
function isNarrow() {
  return window.matchMedia(NARROW_QUERY).matches
}

/**
 * ⭐ **按当前宽度同步"窄屏详情栏"的开合状态**。
 *
 * 做三件事：
 * 1. 给**当前可见**的两栏面板加/去 `data-narrow-open`（CSS 据它滑入滑出）；
 * 2. **补上悬浮的「收起」按钮**（只在窄屏、且那个详情栏里还没有时插一次）；
 * 3. 宽屏时**清掉**这个开关（否则把窗口拉宽后，那个属性还在，
 *    下次变窄会**一进来就是打开态**——而用户要的是"默认看列表"）。
 *
 * 🔴 **为什么"打开"由 JS 决定、而不是纯 CSS**：
 *    纯 CSS 做不到"点列表某条 ⇒ 滑入"——CSS 不知道"哪一条被选中了"。
 *    ⚠️ 但**滑入动画本身仍是纯 CSS**（`transform` + `transition`），
 *    JS 只负责加一个属性 ⇒ 改动面最小。
 *
 * @param tab - 当前标签。
 * @param id - 本次要显示在详情栏的条目 id（`''` = 空态 ⇒ **不收起来也不打开**）。
 */
function syncNarrowOpen(tab, id) {
  const ids = scrollBoxesOf(tab)
  const panel = ids.detail === null ? null : ids.detail.parentElement
  if (panel === null) return
  const narrow = isNarrow()
  if (!narrow) {
    // ⚠️ 宽屏：**清掉开关**（见上面第 3 条的理由）。
    panel.removeAttribute('data-narrow-open')
    return
  }
  // ⭐ **详情栏所在的 `.panel` 里补一个「收起」按钮**（幂等：已有就不再加）。
  //    🔴🔴 **必须插成 `.detail` 的【兄弟】、不能插进 `.detail` 里面** ——
  //    `.detail` 是 `overflow: auto` 的**滚动容器**，而 `position: absolute`
  //    在滚动容器里**会跟着内容一起滚走** ⇒ 正文一长按钮就没了（那就不是"悬浮"）。
  //    ⚠️ 也因此它**不跟着详情栏滑入滑出**，而是**只在打开态显示**
  //    （CSS 用 `[data-narrow-open='1'] > .narrow-back` 控制）——
  //    这正好符合直觉：详情栏收起时，那个按钮本来也不该在。
  if (panel.querySelector(':scope > .narrow-back') === null) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'narrow-back'
    // ⭐ 图标 + 文字（纯图标在手机上不好认，纯文字又占地方）。
    // ⭐ 文字**不带箭头**（用户 2026-09-24：*"返回列表按钮的文字不要前面的箭头。"*）。
    //    ⚠️ 原来写的是 `'‹ 返回列表'` —— 那个 `‹` 是**跳转/返回的暗示**，
    //       但它和卡片右侧的展开箭头 `▾` / 面包屑的 `›` **看起来像同一族**，
    //       而语义不同（那是"展开"，这是"返回"）⇒ 去掉更干净。
    //    ⭐ 判据：**同一个视觉符号在同一页里承担两种语义时，去掉一个**（本项目已记过同族）。
    btn.textContent = '返回列表'
    btn.title = '收起详情，回到列表'
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation()          // ⚠️ 别让它触发底下的卡片点击
      panel.removeAttribute('data-narrow-open')
    })
    panel.append(btn)
  }
  // ⭐⭐ **右滑收起手势**（用户 2026-09-24 要求）。
  //    🔴 **系统级的"手机返回键/侧滑"网页接管不了**（那是 iOS/Android 自己的），
  //      所以这是**网页内自己实现**的手势 —— 用户问"右滑的手势可以吗"，可以。
  attachNarrowSwipe(panel, panel.querySelector(':scope > .detail'))
  // ⭐ **只有"真的选了某条"才滑入**（`id !== ''`）。
  //    ⚠️ 空态不收起来：那是"这个列表没有可选项"的正常情况，
  //       用户还想看着列表（收起来会露出**同样空白**的列表，等于什么都没发生）。
  if (id !== '') {
    // ⚠️ **打开前清掉手势残留的行内 `transform`** ——
    //    否则它会**盖住 CSS 的打开态**（`translateX(0)`）⇒ 详情栏停在半路。
    const detail = panel.querySelector(':scope > .detail')
    if (detail !== null) { detail.style.transform = ''; detail.style.transition = '' }
    panel.setAttribute('data-narrow-open', '1')
  }
}

/**
 * ⭐⭐⭐ **在详情栏上做「右滑收起」手势**（用户 2026-09-24 要求）。
 *
 * 行为：手指从**左边缘附近**起、向右拖 ⇒ 详情栏**跟手平移**；
 *   松手时**超过 1/3 宽（或甩得够快）** ⇒ 收起；否则**弹回**。
 *
 * 🔴🔴 **四条必须处理的边界**（漏一条就会变成"页面变得很难用"）：
 * 1. **只在打开态生效** —— 关着的时候拖它没有意义（那栏在屏幕外）。
 * 2. **起手必须在左边缘**（`x < 36px`）—— 否则会和**横向可滚的内容**（宽表格/代码块）
 *    抢手势：用户想左右滚表格，结果把详情栏划走了。
 *    ⭐ 这是 iOS 侧滑返回的同一套判据（`edge` 手势）。
 * 3. **判"横向意图"** —— 起手后若纵向移动更多，说明用户是在**上下滚动正文**
 *    ⇒ **立刻放弃**手势（`touch-action` 已经只管纵向，但这里再拦一道更稳）。
 * 4. ⚠️ **不做 `preventDefault`**（用 `passive` 监听 + 只改 `transform`）——
 *    强行阻止默认滚动会让正文**滚不动**（本项目刚因为 `overflow` 踩过同族坑）。
 *    ⇒ 手势期间只改**行内 `transform`**，松手后立刻清掉、交还给 CSS 类控制。
 */
function attachNarrowSwipe(panel, detail) {
  if (detail === null || detail.dataset.swipeBound === '1') return
  detail.dataset.swipeBound = '1'
  let startX = 0
  let startY = 0
  let dx = 0
  let active = false
  const W = () => panel.getBoundingClientRect().width || window.innerWidth
  const isOpen = () => panel.getAttribute('data-narrow-open') === '1'
  /** 清掉跟手的行内样式（交还给 CSS）。 */
  const reset = () => {
    detail.style.transform = ''
    detail.style.transition = ''
  }
  detail.addEventListener('touchstart', (e) => {
    if (!isNarrow() || !isOpen()) return
    const t = e.touches[0]
    if (t === undefined) return
    // ⚠️ 条件 2：**必须从左侧边缘起手**（否则会跟横向滚动抢）。
    if (t.clientX > 36) return
    startX = t.clientX
    startY = t.clientY
    dx = 0
    active = true
  }, { passive: true })
  detail.addEventListener('touchmove', (e) => {
    if (!active) return
    const t = e.touches[0]
    if (t === undefined) return
    dx = t.clientX - startX
    const dy = t.clientY - startY
    // ⚠️ 条件 3：**纵向为主 ⇒ 放弃**（用户在滚正文，不是要收起）。
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) { active = false; reset(); return }
    if (dx <= 0) { reset(); return }        // 往左拖无意义（已在最右）
    // ⭐ 跟手：跟手期间**关掉过渡**（否则会"追着手指慢慢飘"）。
    detail.style.transition = 'none'
    detail.style.transform = `translateX(${Math.min(dx, W())}px)`
  }, { passive: true })
  const finish = () => {
    if (!active) return
    active = false
    // ⭐ 判据：**拖过 1/3 宽** ⇒ 收起（用户松手时多半有这个意图）。
    //    ⚠️ 用比例而不是固定 px —— 任意屏宽都对。
    const shouldClose = dx > W() / 3
    // 🔴🔴 **收尾必须分两步**（同一帧里既恢复 `transition` 又清 `transform`
    //    会被浏览器合并处理 ⇒ **跳变**而不是滑回去）。
    //    ⭐ 做法：① 先把过渡恢复；② **下一帧**再清行内 `transform`
    //      ⇒ 浏览器看到的是"transform 变到了新目标" ⇒ 从**手指所在的当前位置**
    //        平滑地滑过去。
    detail.style.transition = ''
    requestAnimationFrame(() => {
      if (shouldClose) panel.removeAttribute('data-narrow-open')
      detail.style.transform = ''
    })
  }
  detail.addEventListener('touchend', finish, { passive: true })
  detail.addEventListener('touchcancel', finish, { passive: true })
}

/**
 * ⭐ **窗口宽度变化时，重新同步所有两栏面板的窄屏状态**（用户 2026-09-24 要求）。
 *
 * 🔴 **不做这件事会留下一个坏状态**：窄屏下打开了详情（属性在），
 *    然后把窗口拉宽 ⇒ 属性**还在**（宽屏 CSS 不理会它，所以看不出问题），
 *    再拉窄 ⇒ **一进来就是详情打开态**，而用户要的是"默认看列表"。
 * ⇒ 所以**变宽就清掉所有打开态**（回到"默认看列表"），这也正是用户要的语义。
 *
 * ⚠️ **用 `resize` 而不是 `matchMedia` 的 `change`**：本函数要处理的不只是
 *    "跨过 900 这条线"，还包括"按钮还没生成"等情况；`resize` 覆盖面更大、
 *    而且这里做的事很轻（几次属性读写）⇒ 不必为省这点开销引入两套监听。
 */
function syncNarrowOnResize() {
  const narrow = isNarrow()
  // ⚠️ **遍历所有标签**（不只当前这个）：别的标签也可能残留着打开态
  //    （用户之前在窄屏下打开过它的详情，然后切走了）。
  for (const tab of TABS) {
    const ids = scrollBoxesOf(tab)
    if (ids.detail === null) continue
    const panel = ids.detail.parentElement
    if (panel === null) continue
    if (!narrow) {
      panel.removeAttribute('data-narrow-open')
      continue
    }
    // 窄屏：按钮若还没生成就补上（**不自动打开** —— 保持当前的收起/打开状态）。
    if (panel.querySelector(':scope > .narrow-back') === null) {
      // ⚠️ 复用同一条路径：传当前 id（`''` 表示"只补按钮、不打开"）。
      syncNarrowOpen(tab, state.renderedId[tab] ?? '')
    }
  }
  // ⭐⭐ **【提示词】页跨过断点时要整页重画**（2026-09-29 新增）。
  //    🔴 为什么必须重画：那一页的**结构随宽度不同** ——
  //       宽屏是"左列表 + 右详情"（卡片不含编辑区），
  //       窄屏是"卡片就地展开"（没有右栏）。
  //       ⚠️ 而这两套是**在渲染时按 `isNarrow()` 决定的**（卡片里放不放按钮、
  //          右栏渲不渲染）⇒ 只改 CSS 不够，必须重跑渲染。
  //    ⭐ 判据：**只要"渲染结果依赖当前宽度"，跨断点就必须重画** ——
  //       否则会出现"栏布局变了、但里面是上一套 DOM"的半坏状态。
  if (state.tab === 'settings' && state.setSub === 'prompts' && promptState.items.length > 0) {
    renderPromptsPage()
  }
}
window.addEventListener('resize', syncNarrowOnResize)

/** 按当前状态显示/隐藏各面板。 */
function renderTabs() {
  for (const t of TABS) {
    const btn = document.querySelector(`.tab[data-tab="${t}"]`)
    if (btn) btn.classList.toggle('active', t === state.tab)
    const panel = document.getElementById(`panel-${t}`)
    if (panel) panel.hidden = t !== state.tab
  }
  for (const s of SUBTABS) {
    const btn = document.querySelector(`.subtab[data-sub="${s}"]`)
    if (btn) btn.classList.toggle('active', s === state.sub)
    const panel = document.getElementById(`sub-${s}`)
    if (panel) panel.hidden = s !== state.sub
  }
  // ⭐ 归档页的**两个子导航页**（决策 133）——用 `data-arcsub` 与审批页的 `data-sub`
  //    严格分开，否则两页的子标签会互相抢 `active`。
  for (const s of ARC_SUBTABS) {
    const btn = document.querySelector(`.subtab[data-arcsub="${s}"]`)
    if (btn) btn.classList.toggle('active', s === state.arcSub)
    const panel = document.getElementById(`arcsub-${s}`)
    if (panel) panel.hidden = s !== state.arcSub
  }
  // ⭐⭐ 设置页的**四个子页**（决策 169）——与上面三套子导航严格分开（各自的 data-* 不同）。
  for (const p of SET_SUBTABS) {
    const btn = document.querySelector(`.subtab[data-setsub="${p}"]`)
    if (btn) btn.classList.toggle('active', p === state.setSub)
    const panel = document.getElementById(`setsub-${p}`)
    if (panel) panel.hidden = p !== state.setSub
  }
  // ⭐⭐ 热知识页（热知识方案 §8）——切过去时**按当前子导航渲染**。
  //    ⚠️ 用 `typeof` 守卫：`renderTabs()` 在文件更早处就被调用过，
  //       而热知识页的函数定义在文件末尾之后（函数声明会提升，但保险起见判一下）。
  if (state.tab === 'hot' && typeof renderHotPage === 'function') renderHotPage()
}

/**
 * ⭐⭐ **页内导航：只改 hash，不新增历史记录**（决策 129）。
 *
 * 🔴🔴 **为什么必须有这个函数**（2026-09-20 用户报告 + 实测）：
 *    此前所有导航都用 `location.hash = X`——它的语义**等价于 `pushState`**
 *    ⇒ **每次点击都往浏览器历史里塞一条**。
 *    实测：连点 6 次（4 个导航标签 + 2 个列表项）⇒ `history.length` **1 → 7**
 *    ⇒ 用户**要按 6 次后退才能离开这个记忆库页面**。
 *    ⚠️ 用户的反馈是"几乎每个点击都是新页面、点完可以后退"——
 *       **专业说法是「history 污染」**（页面其实没重载，但历史被塞满）。
 *
 * ⭐ **判据**：本页面是**单文档应用**（所有面板都在同一个 `index.html` 里，
 *    靠 `hidden` 切换）⇒ **这里发生的一切都是"同页状态切换"**
 *    ⇒ **一律 `replaceState`，不产生可后退的历史**。
 *    （这与决策 107 的取向一致——那里就写着"不用 push，否则每次切标签都塞一条"。）
 *
 * 🔴 **技术要点**：`history.replaceState()` **不派发 `hashchange` 事件**
 *    ⇒ **必须手动调 `applyRoute()`**，否则点了没反应。
 * @param hash - 目标 hash（含 `#`）。
 * @param userPick - ⭐ **本次导航是不是"用户主动点了列表某条"**（窄屏两级导航用）。
 *   ⚠️ 省略 = `false`（页面自己恢复出来的、程序化的跳转都算 false）。
 *   🔴 **必须显式传**：窄屏下只有"用户自己点的"才该让详情栏滑入 ——
 *      若按"有 id 就滑入"，那**一进页面就会直接是详情页**
 *      （因为 `goto()`/兜底都会自动带一个 id），而用户要的是*"打开时默认看列表"*。
 */
function navigate(hash, userPick = false) {
  // ⭐⭐ **先存下当前位置**（决策 138）——必须在改 hash / 重画**之前**读，
  //    因为重画会把 `scrollTop` 清零（CDP 实测：1500 → 重画后 0）。
  saveScroll()
  // ⭐ 记下"这次是用户点的"（`renderDetailAndRestore` 渲染完会消费它）。
  if (userPick) state.narrowUserPick = true
  if (location.hash === hash) {
    // ⭐ 同 hash：**什么都不做**（但也要保证视图正确——见 `applyRoute` 的重入保护）。
    applyRoute()
    return
  }
  history.replaceState(null, '', hash)
  applyRoute()
}

/**
 * 切换顶层标签（写进 hash，便于分享链接）。
 *
 * ⭐ **带上"这个标签上次看的条目"**（决策 107）——这样从别处跳走再点回来，
 * 会**直接落回原来那条**，而不是一个空白详情区。
 * ⚠️ 直接写最终 hash（而不是先写标签级、再由 `applyRoute` 补 id），
 * 免得中间多渲染一次空详情。
 * 🔴 决策 129：走 `navigate()`（**replaceState**），不再用 `location.hash =`
 *    ——否则每点一次标签就多一条历史。
 */
function goto(tab) {
  // ⭐⭐ **先存当前位置，再改 `state.tab`**（决策 138）。
  //    🔴🔴 **顺序不能反**：`saveScroll()` 按 `state.tab` 决定存哪个标签的位置，
  //       先改 `state.tab` 会把**新标签**的位置（此刻还是 0）记下来，
  //       而**旧标签的真实位置就此丢失**。
  //    ⚠️ `navigate()` 内部也会调一次 `saveScroll()`，那时 `state.tab` 已变 —
  //       但它带了"面板被隐藏就不存"的守卫 ⇒ 不会把 0 写进去（两道保险）。
  saveScroll()
  const prevTab = state.tab
  state.tab = tab
  // ⭐⭐ **窄屏：切标签 ⇒ 收回上一个标签的详情栏**（用户 2026-09-24 要求的配套）。
  //
  // 🔴 **为什么必须收**：详情栏的"打开态"是**逐面板**的属性。
  //    不收的话，窄屏下从 A 标签切到 B 标签，B 的详情栏会**自己滑进来**
  //    （属性还在，或 B 之前开着）⇒ 用户**看不到 B 的列表**，
  //    只看到"莫名其妙出现的另一条详情"。
  // ⚠️ **只收"上一个标签"的**：`navigate()` 随后会按"记住的条目"重新决定
  //    当前标签要不要打开（那是既有设计：切回来还落回原来那条）。
  //    ⇒ 所以这里收上一个、让新的自己决定，两者不冲突。
  if (isNarrow() && prevTab !== tab) {
    const prevIds = scrollBoxesOf(prevTab)
    const prevPanel = prevIds.detail === null ? null : prevIds.detail.parentElement
    if (prevPanel !== null) prevPanel.removeAttribute('data-narrow-open')
  }
  const remembered = state.lastId[tab] ?? ''
  if (tab === 'kb') navigate(remembered === '' ? '#/kb' : `#/kb/${encodeURIComponent(remembered)}`)
  else if (tab === 'projects') {
    navigate(remembered === '' ? '#/project' : `#/project/${encodeURIComponent(remembered)}`)
  } else if (tab === 'themes') {
    navigate(remembered === '' ? '#/theme' : `#/theme/${encodeURIComponent(remembered)}`)
  } else if (tab === 'archive') {
    // ⚠️ **不带 id**：归档页的"该看哪条"由 `applyRoute` 按**子页**校验后决定
    //    （记忆里的 id 可能属于另一个子页 ⇒ 在这里拼 id 会拼出 `#/archive/project/<条目id>`）。
    navigate(`#/archive/${state.arcSub}`)
  } else if (tab === 'settings') {
    // ⚠️ 设置页**没有"上次看的条目"** —— 路由就是子页名。
    navigate(`#/settings/${state.setSub}`)
  } else navigate(`#/${tab}`)
}

// ───────────────────────────────────────────────────────────────────────────
// 数据加载
// ───────────────────────────────────────────────────────────────────────────

/** 填一个下拉框（保留当前选中值）。 */
function fillSelect(id, pairs, allLabel) {
  const sel = document.getElementById(id)
  if (!sel) return
  const prev = sel.value
  sel.replaceChildren(h('option', { value: '', text: allLabel }))
  for (const [v, label] of pairs) sel.append(h('option', { value: v, text: label }))
  sel.value = prev
}

/** 拉全部数据并渲染。 */
async function load() {
  try {
    // ⭐⭐ **首屏优先：`covers` 一到就先把列表画出来**（2026-09-30，性能）。
    //
    // 🔴 **为什么**：下面那个 `Promise.all` 要等**全部 7 个**接口才渲染，而列表本身
    //    只依赖 `covers`（实测 ~1s）；其余接口（health / themes / archived…）让首屏
    //    多等约 0.6s —— 那段时间屏幕上**什么都还没有**（用户报的就是这个感觉）。
    //
    // ⭐ **只请求一次**：这里把 `covers` 的 promise 存下来，下面 `Promise.all` **复用同一个**
    //    —— 否则会重复拉一次 310KB，还要再付一次 414 条的"存在性检查"。
    //
    // ⚠️ 下面 `Promise.all` 之后**仍会统一重画一次**（保持既有语义：下拉框、归档列表、
    //    顶栏统计都到齐后再画一遍，各页数据因此保持一致）。
    // ⚠️ 首屏这次渲染**吞掉自己的异常**：真正决定成败的是下面那个 `Promise.all`
    //    （它失败才走 `catch` 弹 toast），首屏渲染失败不该改变错误语义。
    const coversP = getJson('/covers')
    void coversP
      .then((covers) => {
        state.covers = covers.covers ?? []
        state.broken = covers.brokenLinks ?? []
        state.invalid = covers.invalid ?? []
        renderKbList()
        renderInvalid()
        renderBroken()
      })
      .catch(() => {})

    const [health, projects, themes, covers, noms, arcE, arcP] = await Promise.all([
      getJson('/health'),
      getJson('/projects'),
      getJson('/themes'),
      coversP,
      getJson('/nominations'),
      // ⭐ 归档清单（决策 133）——**两个子页各一份**，与活跃清单分开拉。
      getJson('/archived?kind=entry'),
      getJson('/archived?kind=project'),
    ])
    /**
     * ⭐⭐⭐ **知识类型词表**（2026-10-05 收敛）——在前两个 `Promise.all` **之后**拉，
     *    因为它**不参与首屏**：丢了也只是"下拉里少几个选项"，不该拖慢/拖垮首屏。
     * ⚠️ 拉完**必须重填两个筛选下拉**（存量 <option> 是页面写死的占位）。
     * 🔴 **不放进 `Promise.all`**：它失败不该让整页进 `catch`（那会弹 toast 说"加载失败"，
     *    而其实别的数据都拿到了）。
     */
    await loadKinds()
    fillKindFilters()
    const stat = document.getElementById('stat')
    if (stat) {
      // ⭐ 归档数**只在非零时才显示**：常态下不该让顶栏多两个恒为 0 的数字。
      //    🔴 但**必须显示**——`封面 N` 口的是**活跃**封面（不含归档），
      //       用户对着库文件数封面块时会对不上，得有个东西解释这个差。
      const arch = (health.archivedCovers ?? 0) + (health.archivedProjects ?? 0) > 0
        ? ` ｜ 归档 ${health.archivedCovers ?? 0} 条 / ${health.archivedProjects ?? 0} 项目`
        : ''
      stat.textContent =
        `版本 ${health.version} ｜ 项目 ${health.projects} ｜ 主题 ${health.themes} ｜ ` +
        `封面 ${health.covers} ｜ 待批 ${health.nominations} ｜ 非法 ${health.invalidCovers}` + arch
    }

    state.covers = covers.covers ?? []
    state.broken = covers.brokenLinks ?? []
    state.invalid = covers.invalid ?? []
    state.projects = projects.projects ?? []
    state.themes = themes.themes ?? []
    state.nominations = noms.nominations ?? []
    state.archivedEntries = arcE.covers ?? []
    state.archivedProjects = arcP.projects ?? []

    fillSelect('kb-project', state.projects.map((p) => [p.id, p.id]), '全部项目')
    // ⚠️ `/themes` 现在返回**对象数组** `{id, desc, covers, projects}`（决策 106，
    //    为给主题页提供 desc 与计数）——下拉框只要 id，这里取 `t.id`。
    fillSelect('kb-theme', state.themes.map((t) => [t.id, t.id]), '全部主题')

    renderKbList()
    renderProjectList()
    renderThemeList()
    renderPending()
    renderInvalid()
    renderBroken()
    // ⭐ 归档页的两个列表（决策 133）——`load()` 里也要画，
    //    否则"在归档页点恢复"之后列表不会更新（`load()` 重画的是各页自己的列表）。
    renderArchiveEntryList()
    renderArchiveProjectList()

    // ⭐⭐ **决策 130**：`load()` 也要**重画待批详情**——否则「通过 / 否决」之后
    //    列表已刷新、而右侧详情还停在**已被移除的旧提名**上（数据与视图不一致）。
    //    ⚠️ 只在 review 页且 pending 子标签时做，避免无谓请求。
    if (state.tab === 'review' && state.sub === 'pending') {
      void renderPendingDetail(currentId())
    }

    const footer = document.getElementById('footer-info')
    if (footer) {
      footer.textContent = '库根由 $MEMJ_DATA_DIR 或 ~/.dsh-memj 决定 ｜ 除「修复 / 重填路径」外只读展示'
    }
  } catch (e) {
    toast(`加载失败：${e.message}`, true)
  }
}

// ───────────────────────────────────────────────────────────────────────────
// ⭐ 设置悬浮面板（决策 97 / §8.8）
//
// ⚠️ 它改的是**当前 profile 的 `cordis.patch.yml`**（不是库、不是库内设置）。
//    生效靠 `patchReload: 'live'` 热重载；不是 live 时必须**如实提示要重启**。
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⭐⭐ 渲染备份详情区（决策 135）。
 *
 * 🔴 **绝不做"本地假进度"**：这块里出现的每一行都来自服务端
 *    `/backup/status` 或 `/backup/setup` 的**真实返回**。
 *    若本地编一句"正在初始化仓库…"，而服务端其实失败了 ⇒ **界面在说谎**
 *    （本项目一贯判据：一个字段兼表两件事就会开始撒谎）。
 * @param {Array<{id:string,label:string,ok:boolean,detail:string}>} steps - setup 的逐步结果。
 * @param {object|null} status - /backup/status 的返回（有它就渲染状态摘要）。
 */
function renderBackupDetail(steps, status) {
  const box = document.getElementById('backup-detail')
  const list = document.getElementById('backup-steps')
  const info = document.getElementById('backup-info')
  if (!box || !list || !info) return
  box.hidden = false
  list.innerHTML = ''
  if (Array.isArray(steps) && steps.length > 0) {
    for (const s of steps) {
      const row = document.createElement('div')
      row.className = `backup-step ${s.ok ? 'ok' : 'bad'}`
      // ⭐ 用户 2026-09-28：去掉图标，**用文字**表达成败（`ok` / `失败`）。
      //    ⚠️ 但不能只删图标 —— 那样两种情况看起来一样 ⇒ 用文字把差异说出来。
      row.textContent = `${s.ok ? '' : '失败：'}${s.label}${s.detail ? ` —— ${s.detail}` : ''}`
      list.appendChild(row)
    }
  }
  if (status) {
    const lines = []
    lines.push(
      status.gitAvailable
        ? `git：可用（${status.gitVersion}）`
        : `git：❌ 不可用 —— ${status.gitError || '未找到'}`,
    )
    if (status.repoInitialized) {
      lines.push(`仓库：${status.repoPath}`)
      const id = status.identity || {}
      if (id.name) {
        const src = id.source === 'local' ? '仓库记录' : id.source === 'global' ? '全局配置' : '本次生成'
        lines.push(`提交者身份：${id.name} <${id.email}>（${src}）`)
      }
      if (status.lastCommit) lines.push(`最近提交：${status.lastCommit.hash}　${status.lastCommit.subject}`)
    } else {
      lines.push('仓库：尚未初始化（打开上面的开关会自动建立）')
    }
    info.textContent = lines.join('\n')
    info.style.whiteSpace = 'pre-wrap'
  }
  // ⚠️ 环境不可用 ⇒ 明确给出**可执行的**下一步（不是一句"失败了"）。
  if (status && !status.gitAvailable) {
    info.textContent += '\n\n👉 请先安装 git 并把它加入 PATH，然后重新打开这个开关。'
  }
}

/** 拉一次备份状态（只读）。 */
async function loadBackupStatus() {
  try {
    const s = await getJson('/backup/status')
    renderBackupDetail([], s)
    return s
  } catch (e) {
    const info = document.getElementById('backup-info')
    if (info) info.textContent = `读取备份状态失败：${e.message}`
    return null
  }
}

/**
 * ⭐⭐⭐ **加载知识类型词表**（`/kinds`）—— 前端所有 kind 下拉的**唯一数据源**。
 *
 * 🔴🔴 **为什么要有它**（2026-10-05 收敛）：收敛之前，词表在前端**写了三份**
 *   （编辑表单一个数组 + `index.html` 两个手写下拉），而**那两处下拉互相不一致**
 *   （一个带 `history` 不带"未分类"、另一个反过来）—— 抄多处的必然结果。
 *
 * ⚠️ **失败不阻断界面**：取不到就留空数组，下拉仍可用（至少还有"（未分类）"）
 *   —— **宁可少几个选项，也不要把面板卡死**。
 * 🔴 失败**必须留下痕迹**（`console.warn`）：否则用户看到的是"下拉里没有我的类型"，
 *   而**没有任何线索**指向"词表没加载成功"。
 *
 * 🔴🔴 **判据必须是"真的拿到了数组"，不能只看有没有抛错**（2026-10-05 实测踩到）：
 *   本项目的 `getJson` 是这样写的 ——
 *   ```js
 *   const body = await res.json().catch(() => ({}))   // 解析失败 ⇒ 静默变 {}
 *   if (!res.ok) throw ...
 *   return body
 *   ```
 *   ⇒ **路由没注册时**（请求落到 SPA 兜底、返回 HTML 且 HTTP 200）
 *     它**不抛错**、只返回 `{}` ⇒ 我第一版据此把 `kindsLoaded` 置成了 `true`，
 *     而 `items` 根本不存在 —— **`kindsLoaded` 在撒谎**。
 *   ⭐ 判据：**"没报错"不等于"拿到了东西"**；对象端点要校验**期待的那个字段**。
 * @returns 词表数组（失败时为空数组）。
 */
async function loadKinds() {
  try {
    const r = await getJson('/kinds')
    // ⭐ 校验**期待字段**（而不是"没抛错就算成功"）—— 理由见上。
    if (!Array.isArray(r.items)) {
      throw new Error('响应里没有 items 数组（多半是路由没注册：请求落到 SPA 兜底返回了 HTML）')
    }
    state.kinds = r.items
    state.kindsLoaded = true
    return state.kinds
  } catch (e) {
    state.kinds = []
    state.kindsLoaded = false
    console.warn('[memj] 知识类型词表（/kinds）加载失败，下拉将只剩「（未分类）」：', e.message)
    return []
  }
}

/**
 * ⭐ **给输入框 placeholder 用的 kind id 串**（`fact / trap / howto / decision`）。
 *
 * ⚠️ 排除保留项（`history`）—— 它不该出现在"你能填什么"的提示里。
 * @returns 形如 `fact / trap / howto / decision`；词表没加载出来时给一句提示。
 */
function kindIdsForPlaceholder() {
  const ids = state.kinds.filter((k) => k.reserved !== true).map((k) => k.id)
  return ids.length > 0 ? ids.join(' / ') : '（类型词表加载中）'
}

/**
 * ⭐⭐ **把词表填进两个筛选下拉**（`#kb-kind` / `#hot-kb-kind`）。
 *
 * 🔴🔴 **为什么需要它**（收敛前那两个下拉是**手写死的**，而且**两份还不一致**：
 *   一个带 `history` 却没有"未分类"、另一个反过来）——
 *   现在两边**从同一个词表生成**，且都补上"（未分类）"。
 *
 * ⚠️ **必须保留原有选项**：`全部类型`（`value=""`）与 `（未分类）`（`value="__none__"`）
 *   不是 kind，而是**筛选语义** ⇒ 先记住它们再重填，否则"未分类"筛选会消失。
 * @returns 无。
 */
function fillKindFilters() {
  for (const id of ['kb-kind', 'hot-kb-kind']) {
    const sel = document.getElementById(id)
    if (!sel) continue
    const keep = sel.value  // ⚠️ 重填会丢当前选择 ⇒ 先记住、填完还原
    // 只保留"非 kind"的两个语义选项，其余（旧的硬编码 kind）全清掉。
    for (const o of [...sel.querySelectorAll('option')]) {
      if (o.value !== '' && o.value !== '__none__') o.remove()
    }
    const noneOpt = [...sel.querySelectorAll('option')].find((o) => o.value === '__none__')
    for (const k of state.kinds) {
      const o = h('option', { value: k.id, text: k.label })
      // ⚠️ 插在"（未分类）"**之前**（保持"类型在前、未分类在后"的阅读顺序）。
      sel.insertBefore(o, noneOpt ?? null)
    }
    sel.value = keep
  }
}

/**
 * ⭐ **告警的插入锚点**：优先用**包住这个 `<select>` 的 `.set-row`**，而不是 `<select>` 自己。
 *
 * 🔴🔴 **为什么（我第一版就插错了，实测截图抓到）**：
 *    `.set-row` 是 **flex + `space-between`** 的"左标签 / 右控件"行。
 *    把告警插成 `<select>` 的**下一个兄弟** ⇒ 它落进**同一行**里当第三个 flex 子项
 *    ⇒ 三者互相挤压：**标签被压成竖排**（「翻译模型」四个字一行一个）。
 *    ⭐ 判据：**往一个 flex 行里插元素，等于改那一行的布局** ——
 *      这种"某段文字属于这个控件、但不属于这一行"的东西，要插在**行的外面**。
 *    ⚠️ 与既有约定一致：本项目"描述一律在控件下方"（`.set-desc` 就是这么放的），
 *      告警同理 —— 它是**控件脚下的一条说明**，不是行内元素。
 * @param sel - 目标 `<select>`。
 * @returns 插入锚点（`.set-row` 或退化成 `sel`）。
 */
function modelWarnAnchor(sel) {
  return sel.closest('.set-row') ?? sel
}

/**
 * ⭐⭐⭐ **一个"当前配置的模型已不在清单里"的告警行**（用户 2026-10-07 裁定）。
 *
 * 🔴🔴 **为什么要有它 —— 旧做法是错的**：
 *    以前把失效的模型**当成一个 option 插进下拉框**（`xxx（当前配置，不在清单里）`），
 *    理由是"否则用户会以为配置丢了"。**那个理由站不住**：
 *    · 它把**一个错误状态伪装成了一个合法选项** —— 用户看到它在下拉框里、
 *      以为能用，实际选了也跑不通（实测：翻译模型 `sf/…` 已不存在，
 *      **155 条知识全部翻译失败**，而界面只显示"（当前配置，不在清单里）"，**极不显眼**）；
 *    · 用户原话：*"我认为那个模型选择列表，就不应该显示，
 *      如果模版选了该模型应该提示用户去配置相关模型。"*
 *    ⇒ ⭐ **判据：失效的配置不该"降级成一个选项"，而该"升格成一条告警"。**
 *      下拉框是**可选项**待的地方；一个已知跑不通的东西**不属于那里**。
 *    ⚠️ 而"怕用户以为配置丢了"这个诉求，由**这条告警如实说明**来满足 ——
 *      它比一个静默的 option 说得更清楚（明说"已失效、请重选"）。
 *
 * ⚠️ **带 `data-model-warn` 标记**，重填下拉框前先清旧的 ——
 *    否则切通路/重开面板会**越插越多**（本项目踩过"插入式提示不清除"的同族坑）。
 * @param sel - 那个 `<select>`（告警插在**它所在的 `.set-row` 之后**，见 `modelWarnAnchor`）。
 * @param text - 告警文案（**必须说清"已失效"与"该做什么"**）。
 */
function showModelWarn(sel, text) {
  clearModelWarn(sel)
  const tip = document.createElement('div')
  tip.className = 'notice warn model-warn'
  tip.dataset.modelWarn = '1'
  tip.textContent = text
  modelWarnAnchor(sel).insertAdjacentElement('afterend', tip)
}

/** 清掉某个下拉框后面那条模型告警（**重填前必调**，否则会越插越多）。 */
function clearModelWarn(sel) {
  let n = modelWarnAnchor(sel).nextElementSibling
  while (n && n.dataset && n.dataset.modelWarn === '1') {
    const next = n.nextElementSibling
    n.remove()
    n = next
  }
}

/**
 * ⭐⭐⭐ **「翻译模板 ↔ 模型」配对判据**（前端侧；用户 2026-10-07 要求）。
 *
 * 🔴 **服务端才是权威**（`en-index.ts` 的 `pairingError()`，保存时返 400）。
 *    这里这份**只为了"还没点保存就先看见警告"** ——
 *    ⚠️ **两份规则必须字面一致**（本项目已因"同一语义两条实现"出过多次事故）。
 *    判据只有一条：**模板选 `mt` ⇒ 模型必须是翻译专用模型**。
 *    ⚠️ 模型为空（跟随主会话）⇒ **不报**（此刻无从判断，不该假装知道）。
 * @param template - `'instruct'` / `'mt'`。
 * @param provider - `translateProvider`。
 * @param model - `translateModel`（**可能含 `/`**）。
 * @returns 警告文案；`''` = 配对没问题。
 */
function translatePairingWarn(template, provider, model) {
  if (template !== 'mt') return ''
  if (String(model).trim() === '') return ''
  const m = `${provider}/${model}`.toLowerCase()
  // ⚠️ 词边界判 `mt`（别用子串：会误伤 `mtt` / `fmt`）+ 已知翻译模型家族。
  const isMt = /(^|[\W_])mt([\W_]|$)/.test(m) || /hunyuan-mt|opus-mt|nllb|m2m100|seamless-m4t/.test(m)
  if (isMt) return ''
  return `「${provider}/${model}」看起来不是翻译专用模型，但翻译模板选了 mt`
    + `（mt 要求模型按"编号 + 空行"输出，两者必须配对，否则会静默解析失败）。`
    + `请把模板改成 instruct，或换一个翻译专用模型（如 Hunyuan-MT 系列）。`
}

/**
 * ⭐⭐ **在「英文索引」版块实时显示配对警告**（选完立刻看得见，不必等保存）。
 *
 * ⚠️ 与"模型已失效"那条告警**分开**（不同原因、不同处置）：
 *    那条说"这个模型不存在了"，这条说"模型和模板不搭"。
 */
function refreshTranslatePairingWarn() {
  const modelSel = document.getElementById('tr-model')
  const tplSel = document.getElementById('tr-template')
  if (!modelSel || !tplSel) return
  const anchor = modelWarnAnchor(tplSel)
  // 先清旧的（本次这条）
  let n = anchor.nextElementSibling
  while (n && n.dataset && n.dataset.pairingWarn === '1') {
    const next = n.nextElementSibling
    n.remove()
    n = next
  }
  // 取当前下拉框的值（value 是 JSON 数组；空 = 跟随主会话）
  let provider = ''
  let model = ''
  if (modelSel.value) {
    try {
      const pair = JSON.parse(modelSel.value)
      provider = String(pair[0] ?? '')
      model = String(pair[1] ?? '')
    } catch { /* 值不是 JSON ⇒ 视为跟随主会话 */ }
  }
  const text = translatePairingWarn(tplSel.value, provider, model)
  if (text === '') return
  const tip = document.createElement('div')
  tip.className = 'notice warn model-warn'
  tip.dataset.pairingWarn = '1'
  tip.textContent = text
  anchor.insertAdjacentElement('afterend', tip)
}

/**
 * 填充「模型」下拉框（数据源 `GET /models`，按 provider 分组）。
 *
 * 🔴 **option 的 value 用 JSON 数组 `[provider, model]` 编码**：
 *    model id 里**可能含 `/`**（如 `tencent/Hunyuan-MT-7B`）
 *    ⇒ 用 `provider/model` 拼字符串会**歧义**，拆不回来。
 *
 * ⚠️ 拉不到模型清单**不阻塞设置面板**（只剩"跟随主会话"那一项）。
 *
 * ⭐⭐⭐ 用户 2026-10-07 裁定：**当前配置的模型若已不在清单里 ⇒
 *    「不显示为选项」+「给一条告警让它去重选」**（旧做法是插一个 option）。
 *    🔴 关键细节：**"读不到清单"（请求失败）与"清单里没有它"是两件事** ——
 *      前者无从判断，**不该报失效**（否则网络一抖就诬告用户配置坏了）。用 `listed` 区分。
 *
 * ⭐ 它是**两个下拉共用的一份实现**（翻译模型 / 标签裁决模型）——
 *    本项目铁律"实现只留一份"：抄第二遍迟早会漏掉"当前值不在清单里"那段处置。
 * @param elId - 目标 `<select>` 的 id。
 * @param curProvider - 当前配置的 provider（空 = 跟随主会话）。
 * @param curModel - 当前配置的 model。
 * @param label - 用于告警文案（如「翻译模型」/「裁决模型」）。
 */
async function fillModelSelect(elId, curProvider, curModel, label = '模型') {
  const sel = document.getElementById(elId)
  if (!sel) return
  clearModelWarn(sel)
  sel.innerHTML = ''
  const mkFollow = () => {
    const o = document.createElement('option')
    o.value = ''
    o.textContent = '（跟随主会话默认模型）'
    return o
  }
  sel.appendChild(mkFollow())
  /** ⚠️ 清单**是否真的读到了** —— 读不到时**不能**判"配置已失效"（那是诬告）。 */
  let listed = false
  try {
    const r = await getJson('/models')
    listed = true
    for (const p of r.providers ?? []) {
      const group = document.createElement('optgroup')
      group.label = p.name || p.provider
      for (const m of p.models ?? []) {
        const o = document.createElement('option')
        o.value = JSON.stringify([p.provider, m.id])
        o.textContent = m.name && m.name !== m.id ? `${m.id} — ${m.name}` : m.id
        group.appendChild(o)
      }
      if (group.children.length > 0) sel.appendChild(group)
    }
  } catch {
    /* 拉不到清单 ⇒ 只剩"跟随主会话"，不阻塞面板（也**不**据此报失效） */
  }
  if (curProvider === '' || curModel === '') {
    sel.value = ''
    return
  }
  const want = JSON.stringify([curProvider, curModel])
  sel.value = want
  if (sel.value === want) return // 在清单里 ⇒ 正常选中，无需告警
  // ── 以下：配置了、但在清单里找不到它 ──
  // ⚠️ 下拉框**停在"跟随主会话"**（不再把失效值当选项插进去）。
  sel.value = ''
  if (!listed) return // ① 读不到清单 ⇒ 无从判断 ⇒ **不报**（保留配置不动）
  // ② 清单读到了、里面确实没有它 ⇒ **明确告警**
  showModelWarn(sel, `${label}「${curProvider}/${curModel}」已不在可用模型清单里`
    + `（provider 被移除或改名？），该功能当前不会生效。`
    + `请在上面重新选一个${label}，或清空改用「跟随主会话默认模型」。`)
}

/**
 * ⭐⭐ 填充「召回模型」下拉框（主动注入）。**内容跟随通路**。
 *
 * 🔴🔴 **为什么两条通路的候选不一样**（这是本函数存在的全部理由）：
 *   · `chat` ⇒ 走 DSH 内部模型路由 ⇒ 数据源是 `GET /models`（provider 分组）；
 *   · `jev`  ⇒ 走 Knox 的 **`/v1/systemone`**（决策模型，**不是** chat 端点）
 *     ⇒ 数据源是网关的模型名（`jev-latest`）。
 *     ⚠️ **不能**把 `chat` 的清单拿给 `jev` 用：那里面 `knox/jev-latest` 的声明是
 *     `api: openai-completions`（普通 chat 模型）—— 选它会 **400**
 *     （`README-JEV-RECALL.md` 踩坑 2/3）。两件事共用一个下拉框，用户必然选错。
 * ⚠️ 切通路时**清空已选模型**：留着上一个通路的模型名 ⇒ 静默走错端点。
 * @param channel - 当前通路（`chat` / `jev`）。
 * @param curModel - 当前配置的模型（`provider/model` 或纯模型名，空 = 未配置）。
 */
async function fillActiveModelSelect(channel, curModel) {
  return fillChannelModelSelect('ai-model', 'ai-model-hint', channel, curModel, '召回模型')
}

/**
 * ⭐⭐ **填充「子代理模型」下拉框**（决策 178）。
 *
 * 🔴 **它与复盘模型的下拉框不是一回事**：
 *   · **复盘模型** ⇒ 内容**跟随通路**（chat 走 DSH 路由、jev 走 Knox 网关）；
 *   · **子代理模型**（本函数）⇒ **永远是 chat 形态** —— 子代理是 DSH 的 agent，
 *     只能走 DSH 的模型路由，**没有"jev 子代理"这回事**。
 * ⚠️ 所以它**不跟随通路**（照抄 `fillChannelModelSelect` 的通路判断会错）。
 * ⭐ 首项是「（跟随主会话默认模型）」—— 那是**合法且推荐的默认**（子代理只是壳）。
 * @param curProvider - 当前 provider（空 = 跟随主会话）。
 * @param curModel - 当前 model（空 = 跟随主会话）。
 */
async function fillSubagentModelSelect(curProvider, curModel) {
  const sel = document.getElementById('hs-subagent-model')
  if (!sel) return
  clearModelWarn(sel)
  sel.innerHTML = ''
  const o0 = document.createElement('option')
  o0.value = ''
  o0.textContent = '（跟随主会话默认模型）'
  sel.appendChild(o0)
  let listed = false
  try {
    const r = await getJson('/models')
    listed = true
    for (const p of r.providers ?? []) {
      const group = document.createElement('optgroup')
      group.label = p.name || p.provider
      for (const m of p.models ?? []) {
        const o = document.createElement('option')
        o.value = `[${JSON.stringify(p.provider)},${JSON.stringify(m.id)}]`
        o.textContent = m.name && m.name !== m.id ? `${m.id} — ${m.name}` : m.id
        group.appendChild(o)
      }
      if (group.children.length > 0) sel.appendChild(group)
    }
  } catch {
    /* 拉不到清单 ⇒ 只剩"跟随主会话"，不阻塞面板 */
  }
  const want = curProvider !== '' && curModel !== ''
    ? `[${JSON.stringify(curProvider)},${JSON.stringify(curModel)}]`
    : ''
  sel.value = want
  if (want === '' || sel.value === want) return
  // ⭐ 同 `fillModelSelect`：失效的配置**不插成选项**，改为一条告警（用户 2026-10-07 裁定）。
  sel.value = ''
  if (!listed) return
  showModelWarn(sel, `子代理模型「${curProvider}/${curModel}」已不在可用模型清单里`
    + `，该功能当前不会生效。请重新选一个，或清空改用「跟随主会话默认模型」。`)
}

/**
 * ⭐⭐ **填充「知识评分」的复盘模型下拉框**（决策 178）。
 *
 * ⭐ 与主动注入的召回模型**共用同一个实现**（`fillChannelModelSelect`）——
 *    ⚠️ 两条通路的候选来源与取值形态完全一样，复制一份必然漂移。
 * @param channel - 当前通路（`chat` / `jev`）。
 * @param curModel - 当前配置的模型。
 */
async function fillScoreModelSelect(channel, curModel) {
  return fillChannelModelSelect('hs-model', 'hs-model-hint', channel, curModel, '复盘模型')
}

/**
 * ⭐⭐ **填充「通路下的模型」下拉框**（通用实现；**内容跟随通路**）。
 *
 * 🔴🔴 **为什么两条通路的候选不一样**（这是本函数存在的全部理由）：
 *   · `chat` ⇒ 走 DSH 内部模型路由 ⇒ 数据源是 `GET /models`（provider 分组）；
 *   · `jev`  ⇒ 走 Knox 的 **`/v1/systemone`**（决策模型，**不是** chat 端点）
 *     ⇒ 数据源是网关的模型名（`jev-latest`）。
 *     （`README-JEV-RECALL.md` 踩坑 2/3）。两件事共用一个下拉框，用户必然选错。
 * ⚠️ 切通路时**清空已选模型**：留着上一个通路的模型名 ⇒ 静默走错端点。
 * @param elId - 下拉框元素 id。
 * @param hintId - 提示文案元素 id（可不存在）。
 * @param channel - 当前通路（`chat` / `jev`）。
 * @param curModel - 当前配置的模型（`provider/model` 或纯模型名，空 = 未配置）。
 * @param label - 用于提示文案（如「召回模型」/「复盘模型」）。
 */
async function fillChannelModelSelect(elId, hintId, channel, curModel, label) {
  const sel = document.getElementById(elId)
  const hint = document.getElementById(hintId)
  if (!sel) return
  // ⚠️ **重填前先清旧提示**（本函数会插"已失效"告警）—— 漏了会**越插越多**。
  clearModelWarn(sel)
  sel.innerHTML = ''
  const mkEmpty = (text) => {
    const o = document.createElement('option')
    o.value = ''
    o.textContent = text
    return o
  }
  sel.appendChild(mkEmpty('（未配置 ⇒ 功能不生效）'))
  // ⚠️ **两份清单各自记"读到了没有"** —— 判"配置已失效"时必须用**对应那一份**的判据。
  //    🔴 这里踩过一个真坑（`test-en-index.mjs` 的 3h 那条抓到的）：
  //       原来只有一个 `listed`（只反映 `/models`）⇒ 若 `/models` 成功、
  //       而 `/jev-status` 失败，一个**决策模型**的当前值会拿 chat 清单去比对，
  //       必然找不到 ⇒ **诬告"已不在清单里"**。这正是"读不到 ≠ 配置失效"那一族。
  let listedChat = false
  let listedDecision = false
  /** ⭐ 本次拉到的**决策 provider id 集合**（判"这个值属于哪一份清单"要用它）。
   *  ⚠️ **不能用 `jevState.rows`** —— 那个只在打开「决策模型配置」页时才填，
   *     而本函数在**任何一个设置子页**打开时都会跑 ⇒ 那时它可能是空的。 */
  const decisionIds = new Set()
  // ⭐⭐⭐ **2026-10-07 用户裁定：不再按通路筛选 —— 给全列表，让用户自己判断。**
  //    原话：*"和现在的 dsh 模型一样放在一起去选。就不要通路筛选了，
  //    就选决策型通路的时候，也给全列表。让用户判断是否是决策性模型，是否匹配通路。"*
  //    ⇒ 无论 `channel` 是什么，下拉框里**两类都放**：
  //      ① DSH 的 chat 模型（按 provider 分组 —— 与「翻译模型」那个下拉框同形）；
  //      ② 本插件配的**决策模型**（`<providerId>/<modelName>`，来自 `/jev-status`）。
  //    ⚠️ 值形态**两条都统一成 `provider/model`** ⇒ 读值处只有一套解析（别分叉）。
  try {
    const r = await getJson('/models')
    listedChat = true
    for (const p of r.providers ?? []) {
      const group = document.createElement('optgroup')
      group.label = p.name || p.provider
      for (const m of p.models ?? []) {
        const o = document.createElement('option')
        // ⚠️ 与翻译模型同一套编码：JSON 数组（model id 里可能含 `/`）
        o.value = `[${JSON.stringify(p.provider)},${JSON.stringify(m.id)}]`
        o.textContent = m.name && m.name !== m.id ? `${m.id} — ${m.name}` : m.id
        group.appendChild(o)
      }
      if (group.children.length > 0) sel.appendChild(group)
    }
  } catch {
    /* 拉不到清单 ⇒ 只剩"未配置"，不阻塞面板 */
  }
  try {
    const s = await getJson('/jev-status')
    listedDecision = true
    const rows = Array.isArray(s.providers) ? s.providers : []
    for (const p of rows) decisionIds.add(String(p.id))
    if (rows.length > 0) {
      const group = document.createElement('optgroup')
      // ⭐ 分组只是**方便找**，不构成"只有这组能用"的暗示（提示文案里会说清）。
      group.label = '决策模型（本插件配置的）'
      for (const p of rows) {
        for (const m of (p.models ?? [])) {
          const o = document.createElement('option')
          // ⭐ 与 chat 同一套编码：JSON 数组 `[providerId, modelName]`。
          o.value = `[${JSON.stringify(p.id)},${JSON.stringify(m)}]`
          o.textContent = `${p.displayName && p.displayName !== '' ? p.displayName : p.id} ／ ${m}`
          group.appendChild(o)
        }
      }
      if (group.children.length > 0) sel.appendChild(group)
    }
    if (hint) {
      hint.textContent = `——两条通路的候选**都列在这里**（DSH 的 chat 模型 + 本插件配的决策模型）：`
        + `由你判断哪个适合主会话、哪个适合${label}。名单里既有普通对话模型也有决策模型，`
        + `⚠️ 选错了会在运行期报错（chat 模型走 DSH 路由、决策模型直连它自己的端点）。`
    }
  } catch {
    /* 决策模型清单拉不到 ⇒ 只列 chat 那一组，不阻塞面板 */
  }
  // 回填当前值
  let want = ''
  let legacy = false
  // ⚠️ `i`（首个 `/` 的位置）**在下面那个分支之外也要用**（判"值属于哪一份清单"）
  //    ⇒ 必须声明在**函数作用域**，不能在 `if` 块里（那会 ReferenceError —— 真踩到过）。
  const i = curModel.indexOf('/')
  if (curModel !== '') {
    if (i > 0) want = `[${JSON.stringify(curModel.slice(0, i))},${JSON.stringify(curModel.slice(i + 1))}]`
    // 🔴 **没有 provider 前缀的历史值**（2026-09-26 之前从面板保存过的那种，
    //    例如裸的 `jev-latest`）。⭐ 这一种**不是"provider 被删了"**，
    //    而是"值本身的格式过时了" ⇒ 告警文案要说清区别（见下）。
    else legacy = true
  }
  sel.value = want
  if (legacy) {
    // ⚠️ 缺前缀：**也不插成选项**（同一个理由：失效配置不该伪装成可选项）。
    sel.value = ''
    showModelWarn(sel, `${label}「${curModel}」缺少 provider 前缀（旧版格式），`
      + `当前无法匹配到任何模型。请重新选一个。`)
  } else if (sel.value !== want && want !== '') {
    // ⚠️ 当前配置的模型不在清单里（被删/改名）⇒ **不插选项、改为告警**
    //    （与 `fillModelSelect` 同款处置；用户 2026-10-07 裁定）。
    sel.value = ''
    // 🔴 **判据必须用"该值所属那一份清单"的读没读到**：
    //    · 值的 provider 是 `decisionProviders` 里的 ⇒ 用 `/jev-status` 那份；
    //    · 否则 ⇒ 用 `/models` 那份。
    //    ⚠️ 只用一个 `listed` 会在"一份成功、另一份失败"时**诬告失效**（见上面的长注释）。
    const pid = i > 0 ? curModel.slice(0, i) : ''
    const isDecision = decisionIds.has(pid)
    if (isDecision ? listedDecision : listedChat) {
      showModelWarn(sel, `${label}「${curModel}」已不在可用模型清单里`
        + `，该功能当前不会生效。请重新选一个。`)
    }
  }
}

/** 从「召回模型」下拉框读出 `provider/model`（JEV 通路是纯模型名）。 */
function readActiveModel(channel) {
  return readChannelModel('ai-model', channel)
}

/**
 * ⭐⭐ **主动注入"开着却没选模型"的判据**（唯一出处，返回错误文案；没问题回 `''`）。
 *
 * 🔴 **为什么必须共用一份**：这个状态由**两个控件**共同决定——
 *    `ai-on`（总开关，现在**即时生效**）与 `ai-channel`/`ai-model`（在"召回模型"版块里）。
 *    ⇒ 两道门都要能发现它，而"什么叫没选模型"**只该判一次**：
 *      从开关那一侧、从模型那一侧，判据必须完全一样（抄两遍必然漂开，
 *      本项目已因"两份同类实现"出过多次事故）。
 *
 * ⚠️ 背景（为什么值得拦）：空模型会**存下去**，表现为"开关是开的、
 *    但一次判断都不做" —— 那是**看起来在工作、实际没工作**，最难排查的一类。
 * @returns 错误文案；`''` 表示没问题。
 */
function activeModelMissing() {
  const ch = document.getElementById('ai-channel')?.value || 'chat'
  const pair = readActiveModel(ch)
  const has = ch === 'jev' ? pair.model !== '' : (pair.provider !== '' && pair.model !== '')
  if (has) return ''
  return '未选召回模型：请在上面的「召回模型」里挑一个，或先关掉总开关。'
}

/**
 * ⭐⭐ **把"模型下拉框"的 value 拆成 `{provider, model}`**。
 *
 * 🔴 **value 是 JSON 数组** `[provider, model]`（见 `fillModelSelect`）——
 *   因为 model id 里**可能含 `/`**（如 `tencent/Hunyuan-MT-7B`），
 *   用 `provider/model` 拼字符串会**歧义、拆不回来**（本项目已知坑）。
 * ⚠️ 值不是 JSON（或空）⇒ 视为"跟随主会话"，两个字段都回空串。
 * ⭐ 它是**翻译模型 / 标签裁决模型两处共用的一份实现**（本项目铁律：实现只留一份）。
 * @param elId - 下拉框元素 id。
 * @returns `{provider, model}`
 */
function readModelPair(elId) {
  const raw = document.getElementById(elId)?.value ?? ''
  if (raw === '') return { provider: '', model: '' }
  try {
    const pair = JSON.parse(raw)
    return { provider: String(pair[0] ?? ''), model: String(pair[1] ?? '') }
  } catch {
    return { provider: '', model: '' }
  }
}

/**
 * ⭐⭐ **从「通路模型」下拉框读出 `{provider, model}`**（通用实现）。
 *
 * 🔴 它被**两处**用（主动注入的召回模型、知识评分的复盘模型）——
 *    ⚠️ 所以参数化元素 id，而不是复制两份（复制的那份迟早会漂移，
 *      本项目已因此出过"一个键兼两个语义"的同族事故 `决策 172`）。
 *
 * ⭐⭐⭐ **2026-10-07：不再按通路分叉**。用户裁定"给全列表、不按通路筛选"后，
 *    下拉框里的值**无论哪条通路都是 `[provider, model]` 的 JSON 数组**
 *    （决策模型那组也编码成 `[providerId, modelName]`）。
 *    ⇒ 读法只有一套 —— 去掉原来的 `if (channel === 'jev') return {provider:'', ...}` 分支。
 *    🔴 **别把那个分支加回来**：它会让决策模型丢掉 provider（存成裸模型名），
 *       而多 provider 下裸模型名是**歧义**的（两条 provider 可能有同名模型）。
 * @param elId - 下拉框元素 id。
 * @param channel - ⚠️ **仅为兼容调用签名保留**（值不再随它变）。
 * @returns `{provider, model}`（未选时都为空）。
 */
function readChannelModel(elId, channel) {
  void channel // ⚠️ 见上：值形态已统一，这个参数不再参与解析。
  const raw = document.getElementById(elId)?.value ?? ''
  if (raw === '') return { provider: '', model: '' }
  try {
    const pair = JSON.parse(raw)
    return { provider: String(pair[0] ?? ''), model: String(pair[1] ?? '') }
  } catch {
    // ⚠️ 不是 JSON ⇒ 视为旧格式（裸模型名）—— **provider 留空**，
    //    由读值处决定怎么报"缺少 provider 前缀"。
    return { provider: '', model: raw }
  }
}

/**
 * ⭐ 把设置值回填到「主动注入」那一组控件。
 *
 * ⚠️ 布尔键一律用 `=== true` 判断（配置里可能是字符串/缺失）。
 * @param s - `GET /settings` 的响应。
 */
function bindActiveSettings(s) {
  const setCheck = (id, v) => {
    const el = document.getElementById(id)
    if (el) el.checked = v === true
  }
  const setNum = (id, v) => {
    const el = document.getElementById(id)
    if (el) el.value = String(v ?? '')
  }
  setCheck('ai-on', s.activeInject)
  const ch = document.getElementById('ai-channel')
  if (ch) ch.value = String(s.activeInjectChannel ?? 'chat')
  const scope = document.getElementById('ai-scope')
  if (scope) scope.value = String(s.activeInjectScope ?? 'project+themes')
  setCheck('ai-jev-narrow', s.activeInjectJevNarrowScope)
  setCheck('ai-strict', s.activeInjectStrict)
  setCheck('ai-suff-gate', s.activeInjectSufficientGate)
  setCheck('ai-intent-gate', s.activeInjectSearchIntentGate)
  setCheck('ai-explain', s.activeInjectExplain)
  setNum('ai-topk', s.activeInjectTopK)
  // ⭐⭐ 2026-09-29：`activeInjectBand` 拆成两个键。
  //    ⚠️ 回显的是**生效值**（服务端已按"新键 → 旧键 → 默认"回落算好）——
  //       旧键有值、新键没写时这里显示的是那个旧值，用户一存就落到新键上（预期的迁移）。
  setNum('ai-need-min', s.activeInjectNeedMin)
  setNum('ai-item-min', s.activeInjectItemMin)
  setNum('ai-timeout', s.activeInjectTimeoutMs)
  // 🔴 **已作废的三个控件（`ai-rounds` / `ai-pool` / `ai-poolmin`）的 setNum 已删除** ——
  //    它们的 HTML 早已下架，这几行**只会去读不存在的元素**（`setNum` 内部有 `if (el)` 守卫
  //    所以不报错，但那是**死代码**）。
  //    ⭐ 判据（本项目已记过）：**界面上没有的东西，就不该出现在任何"读它的表"里** ——
  //       留着的风险是下一个人以为这些键还在生效。
  //    ⚠️ 配置键本身**仍然保留可写**（见上方 `aiDefs` 的注释），只是不再回填/提交。
  // ⭐ 2026-09-27：改名 —— 现在是"每 turn 最多**注入**几次"（旧名是"调用次数"）。
  setNum('ai-calls', s.activeInjectMaxInjectionsPerTurn)
  setNum('ai-reasoncap', s.activeInjectReasoningMaxChars)
  // ⭐⭐⭐ 预算与拆批（用户 2026-09-26 定稿方案）
  setCheck('ai-budget', s.activeInjectBudget)
  setNum('ai-budgettok', s.activeInjectBudgetTokens)
  setNum('ai-ctxtok', s.activeInjectContextTokens)
  setNum('ai-conc', s.activeInjectConcurrency)
  setNum('ai-chatratio', s.activeInjectChatWindowRatio)
  setNum('ai-suff-min', s.activeInjectSufficientMin)
  setNum('ai-intent-min', s.activeInjectSearchIntentMin)
  // ⭐⭐ 召回日志的"请求快照"档（B 档；默认关）。
  setCheck('ai-recall-log-req', s.activeRecallLogRequest)
  // ⭐ 提示里那个数字跟随"每 turn 最多注入几次"
  const hint = document.getElementById('ai-calls-hint')
  if (hint) hint.textContent = String(s.activeInjectMaxInjectionsPerTurn ?? '')
  // ⭐⭐⭐ **模型下拉框：候选不再随通路变**（用户 2026-10-07："给全列表、不要通路筛选"）。
  //    🔴 但**当前值**要按通路取对键：`jev` 通路的值在 `activeInjectDecisionPick`，
  //       `chat` 通路在 `activeInjectModel`（两者是**不同的键**，别读混）。
  void fillActiveModelSelect(
    String(s.activeInjectChannel ?? 'chat'),
    String((s.activeInjectChannel === 'jev' ? s.activeInjectDecisionPick : s.activeInjectModel) ?? ''),
  )
}

/** 打开设置面板（拉当前值 → 预填）。
 * @param opts.keepMessage - ⭐ **保留保存结果那行字**。
 *   🔴 为什么需要：保存成功后要**刷新**面板（让状态行反映新值），
 *   而本函数默认会清空消息区 ⇒ **用户根本看不到"已保存"**（e2e 抓到的真实缺陷）。
 */
async function openSettingsPage(sub = 'sink', { keepMessage = false } = {}) {
  const status = document.getElementById('settings-status')
  // ⭐⭐ 决策 169：**不再是浮层** —— 切到哪个子页由 `state.setSub` 定，
  //    显隐交给 `renderTabs()`（与其它页同构）。
  if (SET_SUBTABS.includes(sub)) state.setSub = sub
  // ⚠️ 只清**本页**那几行保存结果（别的页的各自留着）。
  //    🔴 **必须清"本页的全部保存单元"**（2026-10-07）：沉淀页拆成 4 个单元后，
  //       只清 `settings-msg-sink` 会**一个都没清到**（那个 id 已不存在）
  //       ⇒ 切页回来还挂着上一次的结果（本项目同族坑：删了控件却留着读它的代码）。
  if (!keepMessage) {
    for (const u of saveUnitsOf(state.setSub)) {
      const m = document.getElementById(`settings-msg-${u}`)
      if (m) m.textContent = ''
    }
  }
  if (status) status.textContent = '读取中…'

  try {
    const s = await getJson('/settings')
    const radios = document.querySelectorAll('input[name="themeCreation"]')
    for (const r of radios) r.checked = r.value === s.themeCreation
    // ⭐ 截断阈值与目标（决策 136）：回填当前生效值。
    const warnInput = document.getElementById('progress-warn')
    if (warnInput) warnInput.value = String(s.progressCharsWarn ?? '')
    const keepInput = document.getElementById('progress-keep')
    if (keepInput) keepInput.value = String(s.progressCharsKeep ?? '')
    // ⭐ git 版本维护开关（决策 135；台账开关已在决策 136 删除）。
    const gitBox = document.getElementById('backup-git')
    if (gitBox) gitBox.checked = s.backupGit === true
    // ⭐⭐ 热知识旋钮（用户 2026-09-22 裁定：预算设置放**设置面板**，不放实时状态页）。
    const hotInjectBox = document.getElementById('hot-inject-enabled')
    if (hotInjectBox) hotInjectBox.checked = s.hotInject === true
    const hotRatio = document.getElementById('hot-ratio')
    if (hotRatio) hotRatio.value = String(s.hotInjectRatio ?? '')
    const hotCpt = document.getElementById('hot-cpt')
    if (hotCpt) hotCpt.value = String(s.hotCharsPerToken ?? '')
    const hotBudget = document.getElementById('hot-budget')
    if (hotBudget) hotBudget.value = String(s.hotBudgetCharsFallback ?? '')
    const hotFullWarn = document.getElementById('hot-full-warn')
    if (hotFullWarn) hotFullWarn.value = String(s.hotFullWarnChars ?? '')
    const hotKeep = document.getElementById('hot-keep')
    if (hotKeep) hotKeep.value = String(s.hotSessionKeep ?? '')
    // ⭐⭐⭐ 知识评分（决策 177）：⭐ 每个控件都 `if (el)` 守卫 ——
    //    ⚠️ 缺了守卫时"读一个不存在的元素"会**静默拿到 undefined**，
    //       而本项目已因"删了控件却留着读它的代码"出过整页存不了的事故（决策 169）。
    const hsOn = document.getElementById('hs-on')
    if (hsOn) hsOn.checked = s.hotScoreOnTurnEnd === true
    const hsThreshold = document.getElementById('hs-threshold')
    if (hsThreshold) hsThreshold.value = String(s.hotScoreThreshold ?? '')
    const hsWindow = document.getElementById('hs-window')
    if (hsWindow) hsWindow.value = String(s.hotScoreWindowHours ?? '')
    const hsTopN = document.getElementById('hs-topn')
    if (hsTopN) hsTopN.value = String(s.hotScoreTopN ?? '')
    // ⭐ 决策 182：入围门槛（分数 / 上一轮）。
    const hsGateMin = document.getElementById('hs-gate-min')
    if (hsGateMin) hsGateMin.value = String(s.hotScoreGateMinScore ?? '')
    const hsGateLast = document.getElementById('hs-gate-last')
    if (hsGateLast) hsGateLast.checked = s.hotScoreGateLastTurn !== false
    // ⭐ 决策 180：每轮最多选几条（写入侧）。
    const hsMaxPicks = document.getElementById('hs-maxpicks')
    if (hsMaxPicks) hsMaxPicks.value = String(s.hotScoreMaxPicks ?? '')
    const hsMinChars = document.getElementById('hs-minchars')
    if (hsMinChars) hsMinChars.value = String(s.hotScoreMinChars ?? '')
    const hsTimeout = document.getElementById('hs-timeout')
    if (hsTimeout) hsTimeout.value = String(s.hotScoreTimeoutMs ?? '')
    // ⭐⭐ 通路口径 —— 与主动注入同一套：**先设通路，再按通路重填模型下拉框**。
    const hsChannel = document.getElementById('hs-channel')
    if (hsChannel) hsChannel.value = String(s.hotScoreChannel ?? 'chat')
    // ⭐ 复盘模型（候选**不再随通路变**；但当前值要按通路取对键 —— 同上面那条）。
    void fillScoreModelSelect(
      String(s.hotScoreChannel ?? 'chat'),
      String((s.hotScoreChannel === 'jev' ? s.hotScoreDecisionPick : s.hotScoreModel) ?? ''),
    )
    // ⭐ 子代理模型：**始终是 chat 形态**（子代理只能走 DSH 模型路由 ⇒ 与通路无关）。
    void fillSubagentModelSelect(String(s.hotScoreSubagentProvider ?? ''), String(s.hotScoreSubagentModel ?? ''))
    // ⭐⭐ 英文召回索引（设计文档 §9）：⚠️ **没有开关**（必要功能，用户 2026-09-26 裁定）
    //    ⇒ 只回填模型 / 模板 / 并发三个控件。
    const trTpl = document.getElementById('tr-template')
    if (trTpl) trTpl.value = String(s.translateTemplate ?? 'instruct')
    const trConc = document.getElementById('tr-conc')
    if (trConc) trConc.value = String(s.translateConcurrency ?? '')
    // ⭐⭐⭐ 配对警告要在**下拉框填完之后**算（它读的是下拉框的当前值）。
    //    ⚠️ `fillModelSelect` 是 async 的 ⇒ 用 `.then` 保证顺序。
    void fillModelSelect('tr-model', String(s.translateProvider ?? ''), String(s.translateModel ?? ''), '翻译模型')
      .then(() => refreshTranslatePairingWarn())
    // ⭐⭐ 决策 162：标签裁决模型（同一份填充实现）。
    //    ⚠️ **必须传 label** —— 失效时那条告警要说清"是哪一个模型坏了"（用户 2026-10-07）。
    void fillModelSelect('tag-model', String(s.tagNormalizeProvider ?? ''), String(s.tagNormalizeModel ?? ''), '裁决模型')
    // ⭐ 决策 165：轮次结束自动规范化的开关（默认开 ⇒ 缺省当 true 显示）。
    const tagAuto = document.getElementById('tag-auto')
    if (tagAuto) tagAuto.checked = s.tagNormalizeOnHandoff !== false
    // ⭐ 决策 168：思考等级（默认 off；缺省也按 off 显示）。
    const tagEffortEl = document.getElementById('tag-effort')
    if (tagEffortEl) tagEffortEl.value = String(s.tagNormalizeReasoningEffort ?? 'off')
    // ⭐⭐ 打开面板就**自动体检一次**（用户 2026-09-26 要求：状态要做新鲜的，
    //    而不是永远显示"未检查"）。⚠️ `silent` ⇒ 只更新显示、不弹 toast。
    //    ⚠️ 它**只读**（不传 force）⇒ 没问题就不会触发翻译。
    // ⭐ 只在【索引】子页体检（决策 169）——其它页看不到它的结果，没必要跑。
    if (state.setSub === 'index') void checkEnIndex(false, true)
    // ⭐⭐ 主动注入（设计文档 §10.1）：开关 / 通路 / 模型 / 范围 / 触发口径 / 阈值。
    //    🔴 **模型下拉框跟随通路**（两条通路的候选来源不同，见 `fillActiveModelSelect`）。
    bindActiveSettings(s)
    // ⭐ 裁定 8：详情区**跟着 git 开关走**（开着才展开）。
    const detail = document.getElementById('backup-detail')
    if (detail) detail.hidden = !(gitBox && gitBox.checked)
    if (gitBox && gitBox.checked) void loadBackupStatus()
    if (status) {
      const where = s.patchExists ? s.patchPath : '（文件尚不存在，保存时会新建）'
      // ⭐⭐ 用户 2026-09-28：*"所有那个示意的绿√的icon全都不要，文字提示足够了。"*
      //    ⇒ 去掉 `✅` / `⚠️`，只用文字说清"要不要重启"。
      //
      // 🔴🔴 **`unknown` 这一支只该在"路径都拿不到"时出现**（2026-10-07 实测纠正）：
      //    以前"profile 的 package.json 里没写 `patchReload`"也回落到这里，
      //    于是页头**常年**挂着「读不到…可能需要重启」——而实测 **10/10 项设置
      //    都在 ~0.5–2.5 秒内热生效**（`scripts/probe-hotreload-matrix.mjs`）
      //    ⇒ 界面在说谎，用户会去白重启一次。
      //    ⭐ 根因在服务端（`settings.ts` 的 `readPatchReload`）：0.2.0-rc.2 **删掉了**
      //      `patchReload` 字段、改成无条件热重载，而"没写"在两代里都等于 `live`。
      //      ⇒ 已修成"没写 = live"，这里只是把**真·拿不到**时的措辞说准。
      const reload = s.patchReload === 'live'
        ? '本 profile 是 live 热重载：保存后数秒内自动生效，无需重启。'
        : s.patchReload === 'startup'
          ? '本 profile 是 startup：保存后需要重启才生效。'
          : '读不到本 profile 的配置文件路径，无法判断热重载策略；保存后若未生效请重启。'
      // ⭐⭐ 决策 169：它现在是**页头一行小字**，不再是浮层里的一大段 ⇒ 只留最要紧的：
      //    「改完要不要重启」+ 配置文件在哪。⚠️ 具体各项当前值就在各页控件里，不必重复念。
      // ⭐⭐ 用户 2026-09-28：*"设置旁边描述和配置文件放到一行"* ⇒ **不再用 `\n` 断行**，
      //    改用分隔符（`.sep`）在同一行里隔开两段。
      //    🔴 同时**去掉 `whiteSpace = 'pre-wrap'`** —— 留着它会让地址里的 `/` 处被浏览器断行。
      status.replaceChildren()
      status.append(reload)
      const sep = document.createElement('span')
      sep.className = 'sep'
      sep.textContent = '|'
      status.append(sep, `配置文件：${where}`)
      if (s.error) status.append('（' + s.error + '）')
      status.style.whiteSpace = ''
    }
    if (s.error) toast(s.error, true)
  } catch (e) {
    if (status) status.textContent = `读取失败：${e.message}`
    toast(`读取设置失败：${e.message}`, true)
  }
  // ⭐⭐⭐ **【提示词】页的数据源不是 `/settings`**（它是 `GET /prompts`）——
  //    所以要在 `/settings` 读完之后**单独拉一次**。
  //    ⚠️ 放在 `try` 之外：提示词页拉取失败**不该**影响其它子页的"保存"按钮可用性。
  if (state.setSub === 'prompts') void openPromptsPage({ keepMessage: true })
  // ⭐⭐⭐ **【模板】页同理**：它的数据源是 `GET /templates`（不是 `/settings`）。
  if (state.setSub === 'templates') void openTemplatesPage()
  // ⭐ 决策 215：知识类型页（每次进入都重拉 —— 计数会变，别缓存旧值）。
  if (state.setSub === 'kinds') void openKindsPage()
  // ⭐⭐⭐ **【决策模型配置】页**：状态来自 `GET /jev-status`（不是 `/settings`）——
  //    因为"密钥有没有配"只在凭据 seam 里，`/settings` **看不到它**（也**不该**看到）。
  if (state.setSub === 'jev') void openJevPage({ keepMessage: true })
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐⭐ **【决策模型配置】子页**（2026-10-07，用户要求）
//
// 用户原话：*"我还是需要能够在 dsh 前端去配置决策模型的。而不是这样，
//   直接在环境里直连。哪怕是在插件的前端里面去配置。"*
//
// 🔴🔴 **为什么本插件必须自己给这一页**（不是重复建设）：
//    JEV **不是 OpenAI 兼容协议**（`/v1/systemone`：请求 `{model,state,questions}`、
//    响应 `{answers:{q0:{noul}}}`）⇒ **DSH 原生「模型」设置页装不下它** ——
//    那页只支持 `openai-completions` / `openai-responses` / `anthropic-messages`
//    （在 `dsh-llm-pi-ai` 里核过）。硬注册成 chat 模型 ⇒ 选它必 400（库内 `4a7b1931`）。
//
// 🔴 **三个动作分开**（语义与目标都不同，**不能**合成一个"保存"）：
//    ① 保存配置 ⇒ 写 patch 文件；② 保存密钥 ⇒ 写凭据 seam（只写不回显）；
//    ③ 测试连接 ⇒ 真发一次请求。合成一个按钮会分不清"存进去了"与"调通了"。
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐⭐⭐ **打开/刷新「决策模型配置」页**（读 `/jev-status` 拿 provider 清单并重画）。
 *
 * 🔴 **密钥输入框每次都被清空**（即使已经存过密钥）—— 这是**刻意的**：
 *    · 服务端**从不回显**密钥（`/jev-status` 只回"有没有、能不能写"）；
 *    · 空 = "保留原来那个"（服务端对空值的处置就是不动它）。
 *    ⚠️ 若这里显示个假占位（如 `****`）反而会被误当真实值提交上去。
 * @param opts.keepMessage - 保留各行结果（保存成功后刷新时用）。
 */
async function openJevPage({ keepMessage = false } = {}) {
  const statusLine = document.getElementById('jev-status-line')
  const emptyHint = document.getElementById('jev-empty-hint')
  // ⚠️ 只清**本页**那几行结果（别的页的各自留着）。
  if (!keepMessage) {
    for (const id of ['jev-config-msg', 'jev-pick-msg']) {
      const m = document.getElementById(id)
      if (m) m.textContent = ''
    }
  }
  if (statusLine) statusLine.textContent = '读取中…'
  if (emptyHint) emptyHint.hidden = true
  try {
    const s = await getJson('/jev-status')
    const rows = Array.isArray(s.providers) ? s.providers : []
    jevState.rows = rows
    // ── 状态行：一眼看出"一共几个 provider、有几个密钥就绪" ──
    if (statusLine) {
      const ready = rows.filter((r) => r.ready === true).length
      statusLine.textContent = rows.length === 0
        ? '还没有配置任何决策模型提供商。'
        : `共 ${rows.length} 个提供商　|　密钥就绪 ${ready}/${rows.length}　|　`
          + `主动注入选了 ${s.activeInjectPick || '(未选)'}　|　`
          + `轮末评分选了 ${s.hotScorePick || '(未选)'}`
    }
    // ⚠️ 空列表要给**可执行的下一步**（不是空白）——本项目一贯"报错要能指引到修法"。
    if (emptyHint && rows.length === 0) {
      emptyHint.textContent = s.reason || '点下面的「添加提供商」加一个（决策模型需要端点 + 模型名）。'
      emptyHint.hidden = false
    }
    renderJevProviderList()
    renderJevPickSelects(rows, String(s.activeInjectPick ?? ''), String(s.hotScorePick ?? ''))
  } catch (e) {
    if (statusLine) statusLine.textContent = `读取失败：${e.message}`
  }
}

/** 本页的**临时编辑态**（未保存的 provider 列表 + 当前展开的是哪一行）。 */
const jevState = {
  /** 从 `/jev-status` 拉回的 provider 清单（每项含 `keyRef` / `credential` / `ready`）。 */
  rows: [],
  /** 🔴 **一次只展开一张**（与 DSH 官方「模型」页同一交互）。 */
  openId: '',
}

/**
 * ⭐⭐⭐ **重画 provider 列表**（照 DSH 官方「模型」页的行形态）。
 *
 * 每行：`id`（+ 派生出的凭据名）+ 端点 + 模型数 + 密钥状态点 + 「编辑」。
 * 展开后（只一张）出现那张卡片：显示名 / 端点 / 模型列表 / 密钥 / 测试 / 删除。
 */
function renderJevProviderList() {
  const box = document.getElementById('jev-provider-list')
  if (!box) return
  box.replaceChildren()
  const rows = jevState.rows
  if (rows.length === 0) return
  for (const r of rows) {
    const open = jevState.openId === r.id
    // ── 行 ──
    const row = document.createElement('div')
    row.className = 'jev-row'
    const dot = document.createElement('span')
    // ⭐ 实心点表示"密钥就绪"（与官方同一视觉语言）；⚠️ 只表示"有密钥"，**不代表通**。
    dot.className = r.ready === true ? 'jev-dot ok' : 'jev-dot bad'
    dot.title = r.ready === true ? '密钥已配置' : '密钥未配置'
    const name = document.createElement('span')
    name.className = 'jev-name'
    name.textContent = (r.displayName && r.displayName !== '' ? r.displayName : r.id)
    const meta = document.createElement('span')
    meta.className = 'dim jev-meta'
    meta.textContent = `${r.id}　|　${r.endpoint}　|　模型 ${r.models.length} 个`
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'dim-btn'
    btn.textContent = open ? '收起' : '编辑'
    btn.addEventListener('click', () => {
      jevState.openId = open ? '' : r.id
      renderJevProviderList()
    })
    row.append(dot, name, meta, btn)
    box.appendChild(row)
    if (open) box.appendChild(buildJevEditor(r))
  }
}

/**
 * ⭐⭐ **构造一张 provider 编辑卡片**（展开态）。
 *
 * 🔴 **凭据名只读显示**（`<ID>_API_KEY`）—— 与官方同规则，**不问用户**。
 * ⚠️ 卡片里的控件**不用全局 id**（否则多张卡片会撞 id）⇒ 全部走闭包引用。
 */
function buildJevEditor(r) {
  const card = document.createElement('div')
  card.className = 'jev-card'
  const mk = (label, value, ph = '') => {
    const item = document.createElement('div')
    item.className = 'set-item'
    const row = document.createElement('div')
    row.className = 'set-row'
    const lb = document.createElement('span')
    lb.className = 'set-label'
    lb.textContent = label
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.value = value
    inp.placeholder = ph
    row.append(lb, inp)
    item.appendChild(row)
    return { item, inp }
  }
  // ⚠️ `id` 在本卡片里**不可改**（它是派生根，也是凭据名的词干）—— 只读展示。
  const idItem = document.createElement('div')
  idItem.className = 'set-item'
  const idRow = document.createElement('div')
  idRow.className = 'set-row'
  const idLb = document.createElement('span')
  idLb.className = 'set-label'
  idLb.textContent = 'provider id'
  const idVal = document.createElement('span')
  idVal.className = 'mono'
  idVal.textContent = r.id
  idRow.append(idLb, idVal)
  idItem.appendChild(idRow)
  const idDesc = document.createElement('p')
  idDesc.className = 'set-desc'
  idDesc.textContent = `凭据名由它派生：${r.keyRef}（密钥存在这个名字下，不用你填）。`
  idItem.appendChild(idDesc)

  const dn = mk('显示名', r.displayName || '', r.id)
  const dnDesc = document.createElement('p')
  dnDesc.className = 'set-desc'
  dnDesc.textContent = '只影响列表里显示什么，留空则显示 id。'
  dn.item.appendChild(dnDesc)

  const ep = mk('端点', r.endpoint || '', 'https://api.knox.chat/v1/systemone')
  const epDesc = document.createElement('p')
  epDesc.className = 'set-desc'
  epDesc.textContent = '必须是 http/https URL。Knox 的形态是 /v1/systemone（不是 chat/completions —— 那个会 400）。'
  ep.item.appendChild(epDesc)

  // ── 模型列表（**每行一个模型名**；与官方那页一样可增删）──
  const mItem = document.createElement('div')
  mItem.className = 'set-item'
  const mRow = document.createElement('div')
  mRow.className = 'set-row'
  const mLb = document.createElement('span')
  mLb.className = 'set-label'
  mLb.textContent = '模型列表'
  mRow.appendChild(mLb)
  mItem.appendChild(mRow)
  const list = document.createElement('div')
  list.className = 'jev-models'
  const models = [...(r.models ?? [])]
  const renderModels = () => {
    list.replaceChildren()
    models.forEach((m, i) => {
      const line = document.createElement('div')
      line.className = 'jev-model-line'
      const inp = document.createElement('input')
      inp.type = 'text'
      inp.value = m
      inp.placeholder = 'jev-latest'
      inp.addEventListener('input', () => { models[i] = inp.value })
      const del = document.createElement('button')
      del.type = 'button'
      del.className = 'dim-btn'
      del.textContent = '删除'
      del.addEventListener('click', () => {
        models.splice(i, 1)
        renderModels()
      })
      line.append(inp, del)
      list.appendChild(line)
    })
    const add = document.createElement('button')
    add.type = 'button'
    add.className = 'dim-btn'
    add.textContent = '加一个模型'
    add.addEventListener('click', () => {
      models.push('')
      renderModels()
    })
    list.appendChild(add)
  }
  renderModels()
  mItem.appendChild(list)
  const mDesc = document.createElement('p')
  mDesc.className = 'set-desc'
  mDesc.textContent = '该端点下可用的决策模型名（网关下的纯名字，**没有** provider/ 前缀）。'
  mItem.appendChild(mDesc)

  // ── 保存这一条（写回整份列表）──
  const foot = document.createElement('div')
  foot.className = 'set-foot set-foot-inline'
  const saveBtn = document.createElement('button')
  saveBtn.type = 'button'
  saveBtn.className = 'primary'
  saveBtn.textContent = '保存这一条'
  const msg = document.createElement('span')
  msg.className = 'dim set-msg'
  saveBtn.addEventListener('click', () => {
    void saveJevProvider(r.id, {
      id: r.id,
      displayName: dn.inp.value,
      endpoint: ep.inp.value,
      models: models.map((x) => x.trim()).filter((x) => x !== ''),
    }, msg)
  })
  foot.append(saveBtn, msg)
  card.append(idItem, dn.item, ep.item, mItem, foot)

  // ── 密钥 + 测试 + 删除（都在卡片里，与官方"展开后编辑密钥"一致）──
  const keyItem = document.createElement('div')
  keyItem.className = 'set-item'
  const kRow = document.createElement('div')
  kRow.className = 'set-row'
  const kLb = document.createElement('span')
  kLb.className = 'set-label'
  kLb.textContent = 'API 密钥'
  const kInp = document.createElement('input')
  kInp.type = 'password'
  kInp.autocomplete = 'new-password'
  // ⭐⭐⭐ **已保存 ⇒ 用 `*` 占位**（用户 2026-10-07 要求："不然用户看着会很迷惑"）。
  //    🔴🔴 **必须用 `placeholder`，绝不能用 `value`** —— 这是**数据安全**上的硬要求：
  //       · `placeholder` 是**纯显示**，**不参与表单取值**、不被 JS 读成"用户输入的值"；
  //       · 若塞进 `value`，那么"用户没动它就直接点保存"会把这一串 `***` **当成真密钥存进去**
  //         ⇒ **把用户的密钥覆盖成星号**（不可逆的数据损坏，且极难排查）。
  //    ⚠️ 空 `value` 才是对的：**空 = 保持原样**（服务端对空值的处置就是不动它）。
  //    ⭐ 与官方「模型」页同一套语义：*"每个卡片打开时它都是空的，即使已经存了密钥；
  //       空在那里表示保留原来那个。"*
  kInp.placeholder = r.ready === true
    // ⚠️ **固定 12 个星号**（不是按真实长度画）—— 免得顺带泄露"密钥多长"。
    ? '************（已保存，留空则不改动）'
    : '留空 = 不改动已保存的'
  kRow.append(kLb, kInp)
  keyItem.appendChild(kRow)
  const kDesc = document.createElement('p')
  kDesc.className = 'set-desc'
  kDesc.textContent = r.ready === true
    ? `已配置（凭据 ${r.keyRef}${r.credential?.source ? `，来源 ${r.credential.source}` : ''}）。只写不读：保存后永不回显。`
    : `未配置（凭据 ${r.keyRef}）。只写不读：保存后永不回显，也不会写进配置文件。`
  if (r.credential?.writable === false) {
    kDesc.textContent += '⚠️ 当前被只读来源（如环境变量）遮蔽 ⇒ 在这里存不进去。'
  }
  keyItem.appendChild(kDesc)
  const kFoot = document.createElement('div')
  kFoot.className = 'set-foot set-foot-inline'
  const kSave = document.createElement('button')
  kSave.type = 'button'
  kSave.className = 'primary'
  kSave.textContent = '保存密钥'
  const kMsg = document.createElement('span')
  kMsg.className = 'dim set-msg'
  kSave.addEventListener('click', () => {
    void saveJevKey(r.id, kInp.value, kMsg, () => { kInp.value = '' })
  })
  const kClear = document.createElement('button')
  kClear.type = 'button'
  kClear.className = 'dim-btn'
  kClear.textContent = '清除密钥'
  kClear.addEventListener('click', () => { void clearJevKey(r.id, kMsg) })
  const kTest = document.createElement('button')
  kTest.type = 'button'
  kTest.className = 'dim-btn'
  kTest.textContent = '测试连接'
  const tMsg = document.createElement('span')
  tMsg.className = 'dim set-msg'
  kTest.addEventListener('click', () => {
    void testJevConnection(r.id, (r.models ?? [])[0] ?? '', kMsg, tMsg)
  })
  kFoot.append(kSave, kClear, kTest, kMsg, tMsg)
  keyItem.appendChild(kFoot)
  card.appendChild(keyItem)

  // ── 删除这个 provider（⚠️ 有代价 ⇒ 先确认；官方那页也是确认后删）──
  const delFoot = document.createElement('div')
  delFoot.className = 'set-foot set-foot-inline'
  const delBtn = document.createElement('button')
  delBtn.type = 'button'
  delBtn.className = 'dim-btn'
  delBtn.textContent = '删除这个提供商'
  const delMsg = document.createElement('span')
  delMsg.className = 'dim set-msg'
  delBtn.addEventListener('click', () => {
    if (!window.confirm(`删除提供商「${r.id}」？它的配置会从配置文件里移除（密钥不会被动，但没人再引用它）。`)) return
    void deleteJevProvider(r.id, delMsg)
  })
  delFoot.append(delBtn, delMsg)
  card.appendChild(delFoot)
  return card
}

/**
 * ⭐ **把整份 provider 列表写回配置**（唯一写入口 —— 增/改/删都走它）。
 * @param extras - ⭐ 额外一起提交的键（目前只有"删除时一并清空指向它的选集"）。
 *   🔴 **必须同一次请求**：分两次写会在中间留下"选集指向不存在的 provider"
 *      的窗口，而那个窗口里服务端**会拒**（校验要求 provider 存在）⇒ 反而写不干净。
 *   ⚠️ 服务端处理顺序是 **先写 `decisionProviders`、再写选集** ⇒ 同请求里
 *      清空选集时，磁盘上的列表**已经**是新的一份（校验看到的是新列表）。
 */
async function writeJevProviders(next, msg, okText = '已保存', extras = {}) {
  if (msg) msg.textContent = '保存中…'
  try {
    const r = await postJson('/settings', { decisionProviders: next, ...extras })
    if (msg) msg.textContent = r.needsRestart
      ? `${okText}——需要重启才生效`
      : `${okText}——热重载将生效`
    toast(r.needsRestart ? '已保存；本 profile 需要重启才生效' : '已保存，数秒内热生效')
    void openJevPage({ keepMessage: true })
    return true
  } catch (e) {
    if (msg) msg.textContent = `保存失败：${e.message}`
    toast(`保存失败：${e.message}`, true)
    return false
  }
}

/** 取出"去掉展示字段"的纯配置数组（⚠️ 只留配置认识的四个字段）。 */
function jevPlainProviders() {
  return jevState.rows.map((r) => ({
    id: r.id, displayName: r.displayName ?? '', endpoint: r.endpoint ?? '',
    models: [...(r.models ?? [])],
  }))
}

/** ⭐ **保存某一条 provider 的编辑**（把整份列表替换成"这一条改过"的版本）。 */
async function saveJevProvider(id, edited, msg) {
  const next = jevPlainProviders().map((p) => (p.id === id ? edited : p))
  await writeJevProviders(next, msg)
}

/** ⭐ **删除一个 provider**。 */
async function deleteJevProvider(id, msg) {
  // ⚠️ **草稿还没写盘 ⇒ 直接本地删掉、不发请求**（否则会拿一个不存在的 id 去写）。
  const row = jevState.rows.find((r) => r.id === id)
  if (row?.draft === true) {
    jevState.rows = jevState.rows.filter((r) => r.id !== id)
    jevState.openId = ''
    if (msg) msg.textContent = '已丢弃这条未保存的草稿。'
    renderJevProviderList()
    return
  }
  // 🔴🔴 **删之前必须处理"选集正指着它"**（**实测踩到的静默坑**）：
  //    删掉 knox 后，`activeInjectDecisionPick=knox/jev-latest` **不会报错**，
  //    而是被 `resolveDecisionPick` **悄悄回落到另一个 provider**
  //    （实测变成 `my-gw/dec-a`）—— 用户完全不知道"我选的那个没了"，
  //    下一次召回就会拿一个**他没选过的模型**去跑。
  //    ⭐ 处置：**同一次请求里把指向它的选集清空**（清空 = 该功能不生效，
  //      是**显式**状态，用户能在界面上看见；比静默换一个模型好得多）。
  //
  //    ⚠️ 判据：**"指向已删除 provider"必须是显式的空，不能靠回落的巧合。**
  const dangling = []
  const activeNow = document.getElementById('jev-pick-active')?.value ?? ''
  const scoreNow = document.getElementById('jev-pick-score')?.value ?? ''
  if (activeNow.startsWith(`${id}/`)) dangling.push('activeInjectDecisionPick')
  if (scoreNow.startsWith(`${id}/`)) dangling.push('hotScoreDecisionPick')
  const next = jevPlainProviders().filter((p) => p.id !== id)
  if (msg && dangling.length > 0) {
    msg.textContent = `⚠️ 有选集正指向它（${dangling.length} 处）—— 将一并清空（否则会静默换用别的 provider）。`
  }
  const payload = { decisionProviders: next }
  // ⚠️ 一起提交：**分两次写**会在中间留下"选集指向不存在的 provider"的窗口，
  //    而那个窗口里服务端**会拒**（校验要求存在）⇒ 反而写不干净。
  for (const k of dangling) payload[k] = ''
  const ok = await writeJevProviders(next, msg, '已删除', dangling)
  if (!ok && msg && dangling.length > 0) {
    // ⚠️ 一起提交失败（例如选集清空那步被拒）⇒ **撤回删除**，别留下半套状态。
    msg.textContent += '（删除未生效 —— 请先在上面把选集改成别的 provider 再删。）'
  }
  if (ok) jevState.openId = ''
}

/**
 * ⭐⭐ **「添加提供商」**（用户 2026-10-07 要求"像 dsh 官方那样"）。
 *
 * 🔴🔴 **关键：新增时【不写盘】，只加一条本地草稿**（**实测踩到**）：
 *    第一版是"先往配置里写一条空模板、再让用户填"，结果**被自己的校验拒了** ——
 *    端点空 ⇒ `decisionProviders` 校验要求 http/https URL ⇒ **400**，
 *    用户看到的是"点添加就报错"（体验像坏了）。
 *    ⭐ 官方那页也是这个流程：**先开一张卡片让你填，填完才写**。
 *    ⇒ 草稿行带 `draft: true`，由「保存这一条」触发**唯一那次写盘**
 *      （那时端点已填好，校验自然过）。
 * ⚠️ `id` 在草稿阶段就定下来、**之后不可改**（它派生了凭据名 —— 见卡片里的只读展示）。
 * ⚠️ 本函数**不是 async**（它不发请求）；调用处的 `void` 只是习惯写法。
 */
function addJevProvider(msg) {
  // ⚠️ 生成一个**不撞车**的 id（与已有行、以及其它未保存的草稿都比一遍）。
  let n = jevState.rows.length + 1
  let id = `decision${n}`
  while (jevState.rows.some((r) => r.id === id)) { n += 1; id = `decision${n}` }
  jevState.rows.push({
    id,
    displayName: '',
    endpoint: '',
    models: [],
    // ⚠️ 展示字段（`keyRef`/`credential`/`ready`）平时由服务端算；
    //    草稿这一份**本地先给等价物**，免得渲染时读到 `undefined`。
    keyRef: `${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}_API_KEY`,
    credential: undefined,
    ready: false,
    draft: true,
  })
  jevState.openId = id
  if (msg) msg.textContent = '已加一条草稿 —— 填好端点与模型后点「保存这一条」才会写盘。'
  renderJevProviderList()
}

/** ⭐⭐ **重填两个通路的选择下拉框**（内容 = **全部 provider × 全部模型**平铺）。 */
function renderJevPickSelects(rows, activePick, scorePick) {
  for (const [elId, cur] of [
    ['jev-pick-active', activePick],
    ['jev-pick-score', scorePick],
  ]) {
    const sel = document.getElementById(elId)
    if (!sel) continue
    sel.replaceChildren()
    const none = document.createElement('option')
    none.value = ''
    none.textContent = '（未选 ⇒ 该功能不生效）'
    sel.appendChild(none)
    // ⭐⭐⭐ 用户明确要求：**不按通路筛选、也不分组过滤** —— 全部平铺，
    //    "让用户判断是否是决策性模型，是否匹配通路"。
    for (const r of rows) {
      for (const m of (r.models ?? [])) {
        const o = document.createElement('option')
        o.value = `${r.id}/${m}`
        o.textContent = `${r.displayName && r.displayName !== '' ? r.displayName : r.id} ／ ${m}`
        sel.appendChild(o)
      }
    }
    // ⚠️ 当前值若已不在列表里（provider 被删/模型被删）⇒ **补一项显示出来**，
    //    否则用户会以为"配置丢了"（与模型下拉框同款处置）。
    sel.value = cur
    if (sel.value !== cur && cur !== '') {
      const o = document.createElement('option')
      o.value = cur
      o.textContent = `${cur}（当前配置，已不在列表里）`
      sel.appendChild(o)
      sel.value = cur
    }
  }
}

/** ⭐ **保存两条通路的选择**（`<providerId>/<modelName>`）。 */
async function saveJevPicks() {
  const btn = document.getElementById('jev-save-picks')
  const msg = document.getElementById('jev-pick-msg')
  if (btn) btn.disabled = true
  if (msg) msg.textContent = '保存中…'
  try {
    const r = await postJson('/settings', {
      activeInjectDecisionPick: document.getElementById('jev-pick-active')?.value ?? '',
      hotScoreDecisionPick: document.getElementById('jev-pick-score')?.value ?? '',
    })
    if (msg) msg.textContent = r.needsRestart ? '已保存——需要重启才生效' : '已保存——热重载将生效'
    toast(r.needsRestart ? '已保存；本 profile 需要重启才生效' : '已保存，数秒内热生效')
    void openJevPage({ keepMessage: true })
  } catch (e) {
    if (msg) msg.textContent = `保存失败：${e.message}`
    toast(`保存失败：${e.message}`, true)
  } finally {
    if (btn) btn.disabled = false
  }
}

/**
 * ⭐⭐ **保存某个 provider 的密钥**（写凭据 seam；**只发不收**）。
 *
 * 🔴 四条纪律：
 *   ① **收 provider id**（不收凭据名 —— 名字由 id 派生，与官方同规则）；
 *   ② 空值**不发请求**（留空 = 保持原样，不是"清空"——清空是另一个按钮）；
 *   ③ 回执**只说成了**（服务端也不回值/长度/前几位）；
 *   ④ 成功后**立刻把输入框清掉**（别让密钥留在 DOM 里）。
 */
async function saveJevKey(providerId, value, msg, clearInput) {
  if (String(value).trim() === '') {
    if (msg) msg.textContent = '未填新密钥 —— 留空表示保持原样（要清掉请点「清除密钥」）。'
    return
  }
  if (msg) msg.textContent = '保存中…'
  try {
    const r = await postJson('/jev/key', { providerId, key: value })
    if (msg) msg.textContent = r.message ?? '已保存。'
    toast('密钥已保存（只写，不会回显）')
    if (typeof clearInput === 'function') clearInput() // ⚠️ 别把密钥留在 DOM 里
    void openJevPage({ keepMessage: true })
  } catch (e) {
    if (msg) msg.textContent = `保存失败：${e.message}`
    toast(`保存密钥失败：${e.message}`, true)
  }
}

/** ⭐ **清除某个 provider 的密钥**（走 seam 的 `unset`；⚠️ 有代价 ⇒ 先确认）。 */
async function clearJevKey(providerId, msg) {
  if (!window.confirm(`清除「${providerId}」的密钥？之后选了它会在运行期调用失败（除非环境变量里还有一份）。`)) return
  if (msg) msg.textContent = '清除中…'
  try {
    const r = await postJson('/jev/key/clear', { providerId })
    if (msg) msg.textContent = r.message ?? '已清除。'
    toast('已清除')
    void openJevPage({ keepMessage: true })
  } catch (e) {
    if (msg) msg.textContent = `清除失败：${e.message}`
    toast(`清除失败：${e.message}`, true)
  }
}

/**
 * ⭐⭐⭐ **测试连接**（真发一次最小请求）。
 *
 * 🔴 **为什么不能只看 `/jev-status`**：那只查"凭据**存不存在**"、**不发请求**
 *    ⇒ "配了密钥"与"真能调通"是两件事（端点写错 / 密钥失效 / 网关不通都过不了）。
 *    ⭐ 本项目一贯判据：**"配置读到了"不等于"功能能工作"**。
 * ⚠️ 连不上**不是**接口错误（服务端回 200 + `ok:false`）⇒ 这里当"测试结果"显示。
 */
async function testJevConnection(providerId, model, msg, tMsg) {
  if (msg) msg.textContent = '正在测试（最多 15 秒）…'
  if (tMsg) tMsg.textContent = ''
  try {
    const r = await postJson('/jev/test', { providerId, model })
    if (msg) msg.textContent = r.message ?? (r.ok ? '连接正常。' : '连接失败。')
    toast(r.ok ? 'JEV 连接正常' : 'JEV 连接失败', !r.ok)
    // ⭐ 明细用**两列网格**摊开（与英文索引页同一套 `.idx-rows` 样式，不另造）。
    if (tMsg) {
      const parts = [r.ok ? '通' : '不通']
      if (r.ms !== undefined) parts.push(`${r.ms}ms`)
      if (r.upstream !== undefined) parts.push(`上游 ${r.upstream}`)
      if (r.noul !== undefined) parts.push(`noul=${r.noul}`)
      tMsg.textContent = parts.join('　|　')
    }
  } catch (e) {
    if (msg) msg.textContent = `测试失败：${e.message}`
    toast(`测试失败：${e.message}`, true)
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐⭐ **【模板】子页**（决策 204 / 205）
//
// 作用：管理"交接文档模板" —— 用户可完全自定义文档结构（节名/节数/每节用途）。
//
// 🔴🔴 **它只影响【新建项目】**：已有文档记着自己建时的结构，与模板**已解耦**
//    ⇒ 改模板、删模板都**不影响任何已有文档**。⭐ 这句话必须显示在页面上
//    （否则用户会以为"我改了模板，怎么老文档没变"——那是**设计如此**，不是 bug）。
// ══════════════════════════════════════════════════════════════════════════

/** 模板页状态（当前正在编辑的表单）。 */
const tplState = {
  items: [],
  /** 表单里的节（`{ name, desc, truncate }`）。 */
  sections: [],
}

/**
 * 打开/刷新模板页：拉列表 + 重画。
 */
async function openTemplatesPage() {
  const status = document.getElementById('tpl-status')
  try {
    const r = await fetch(`${API}/templates`)
    const body = await r.json()
    if (!body.ok) throw new Error(body.error || '读取失败')
    tplState.items = body.items
    if (status) status.textContent = `共 ${body.items.length} 份`
    renderTemplatesList()
    // ⭐ 首次打开且表单为空 ⇒ 用**当前生效的默认模板**作起点（省得用户从零敲）。
    //    ⚠️ 不说死"六节"——默认模板**也落盘、用户可能改过**（决策 208）。
    if (tplState.sections.length === 0) loadTemplateIntoForm(body.items.find((t) => t.id === 'default'))
  } catch (e) {
    if (status) status.textContent = `读取失败：${e.message}`
    toast(`读取模板失败：${e.message}`, true)
  }
}

/** ⭐ 知识类型页的状态（决策 215）。 */
/**
 * ⭐ **知识类型页的状态**。
 *
 * 🔴 `originals` 是**服务端那份的原样快照**（每次拉到就抄一份）——
 *    用来在「保存」前判断"这次改动会不会破坏前缀缓存"。
 *    ⚠️ 不能拿 `items` 自己跟自己比（它**已被就地改过**，见 `kindField` 的 onInput）。
 */
const kindsState = { items: [], originals: new Map() }

/**
 * ⭐⭐⭐ **知识类型页**（决策 215）—— \`kind\` 的可配置词表。
 *
 * 🔴 **两条只读边界**（页面上也要写明白，否则用户会问"为什么删不掉"）：
 *   · \`builtin\`（内置）⇒ **不可删、显示名与 id 都锁**（存量几百条知识在用它们）；
 *   · \`reserved\`（保留）⇒ **不给模型选**（工具生成的那种，手工填会让知识搜不到）。
 * ⚠️ **保存的是"整张表"**（含顺序）—— 加/删/改/排序对顺序影响不同，
 *    让前端提交最终形态最不容易错（与模板保存同一取向）。
 * @returns Promise<void>
 */
async function openKindsPage() {
  try {
    const r = await fetch(API + '/kinds')
    const body = await r.json()
    if (!body.ok) throw new Error(body.error || '读取失败')
    kindsState.items = body.items
    // ⭐ 存一份**原样快照**（按 id）—— 保存前拿它比对"改了哪些字段"。
    kindsState.originals = new Map(body.items.map((x) => [x.id, { ...x }]))
    renderKindsList()
    showKindErrs([])
  } catch (e) {
    showKindErrs(['读取失败：' + e.message])
    toast('读取知识类型失败：' + e.message, true)
  }
}

/** 正在展开编辑的那一条的 id（一次只开一条；空串 = 都收起）。 */
let kindEditingId = ''
/**
 * ⭐ **草稿的编辑态用【下标】定位**（2026-10-05）。
 *
 * 🔴 **为什么不能用 id**：刚点「＋ 添加」那条**id 是空串**（要等用户填），
 *    而空串在 `kindEditingId` 里正表示"都收起" ⇒ 两者撞车。
 * ⚠️ 只在"刚添加、还没保存"这一段有效；保存成功后置回 -1。
 * ⭐ 判据：**用"值"当键时，先确认那个值在"还没填"的时候是否也唯一。**
 */
let kindDraftIndex = -1

/**
 * ⭐⭐⭐ **画知识类型列表**（2026-10-05 用户裁定改版）。
 *
 * ── 改了什么 ──────────────────────────────────────────────────────────────
 * · **默认全部收起**：列表态只给摘要（id + 徽标 + 计数 + when 预览）——
 *   原先把所有字段摊开，五个类型就是一屏半的输入框，找一条要翻半天。
 * · **点「编辑」才展开**：展开后是那一条的完整字段 + **它自己的「保存」**。
 * · **每条各自保存**（走 POST /kind/upsert）—— 不再有"保存整张表"的总按钮：
 *   那样"改了 A 条却顺手把 B 条的半成品也存了"是迟早的事。
 *
 * ⚠️ **一次只开一条**（kindEditingId）：多开会让"哪个保存按钮对应哪条"变得费解。
 * @returns void
 */
function renderKindsList() {
  const box = document.getElementById('kinds-list')
  if (!box) return
  box.replaceChildren()
  kindsState.items.forEach((k, i) => {
    // ⭐ 编辑态：按 id 匹配（正常条）**或**按草稿下标匹配（刚添加、id 还空着的那条）。
    const editing = (kindEditingId !== '' && kindEditingId === k.id) || i === kindDraftIndex
    const card = h('div', { class: 'kind-card' + (editing ? ' editing' : '') })
    card.append(editing ? kindEditor(k, i) : kindRow(k, i))
    box.append(card)
  })
}

/**
 * ⭐ **收起态：一行摘要**（不是"被藏起来"—— 关键信息都要看得见）。
 *
 * 🔴 **为什么要带上 when 预览**：用户原话是"不要全部展开"，
 *   但如果收起后只剩一个 id，**没人知道这条是干嘛的**（还得点开看）。
 *    ⇒ 摘要里必须给"这一类什么时候用"的一小段，**一眼能认出来**才算真的收起。
 * @param k - 该条类型。
 * @param i - 它在表里的下标。
 * @returns 摘要行元素。
 */
function kindRow(k, i) {
  const row = h('div', { class: 'kind-row' })
  const head = h('div', { class: 'kind-card-head' })
  head.append(h('span', { class: 'kind-id', text: k.id }))
  if (k.builtin) head.append(h('span', { class: 'kind-badge', text: '内置' }))
  if (k.reserved) head.append(h('span', { class: 'kind-badge reserved', text: '保留' }))
  // ⭐ 现报"有多少条在用" —— 删不掉时用户才知道卡在哪。
  head.append(h('span', { class: 'dim kind-count', text: k.count > 0 ? k.count + ' 条在用' : '还没人用' }))
  const btn = h('button', { type: 'button', class: 'kind-edit', text: '编辑' })
  btn.addEventListener('click', () => {
    kindEditingId = k.id
    renderKindsList()
    // ⭐ 展开后聚焦**第一格**（内置是"什么时候用"、自定义是"id"）—— 少一次点击。
    const box = document.getElementById('kinds-list')
    const editing = [...(box?.children ?? [])].find((c) => c.classList.contains('editing'))
    editing?.querySelector('input, textarea')?.focus()
  })
  head.append(btn)
  row.append(head)
  // ⭐ 预览：when 一行（收起态也要认得出这条是什么）。
  row.append(
    h('div', {
      class: 'kind-preview dim',
      text: k.when === '' ? '（还没写「什么时候用」）' : k.when,
    }),
  )
  return row
}

/**
 * ⭐⭐ **展开态：可编辑的完整字段 + 本条自己的「保存」。**
 *
 * 🔴🔴 **两个锁的粒度不一样**（决策 217 用户裁定：*"可编辑但不可删除"*）：
 *   · **身份**（id / 显示名）⇒ 内置项**锁死** ——
 *     改 id 会让存量那几百条知识**当场变非法值**（不可逆）；
 *   · **内容**（什么时候用 / 怎么写）⇒ **内置项也可编辑**。
 * ⭐ 判据：**"这是身份还是内容"决定它锁不锁**。
 * @param k - 该条类型。
 * @param i - 它在表里的下标。
 * @returns 展开态的卡片内容。
 */
function kindEditor(k, i) {
  const body = h('div', { class: 'kind-body' })
  const head = h('div', { class: 'kind-card-head' })
  head.append(h('span', { class: 'kind-id', text: k.id === '' ? '（新类型，请先填 id）' : k.id }))
  if (k.builtin) head.append(h('span', { class: 'kind-badge', text: '内置' }))
  if (k.reserved) head.append(h('span', { class: 'kind-badge reserved', text: '保留' }))
  body.append(head)

  const lockIdentity = k.builtin === true
  /**
   * ⭐⭐ **id 也要能填**（2026-10-05 实测补的缺口）。
   *
   * 🔴 **为什么之前漏了**：卡片头里已经把 id 显示出来了，
   *    我就想当然以为"id 是只读的、只有内置才有"。
   *    ⇒ 而**自定义类型的 id 必须由用户指定**（它就是写进封面 kind: 的值），
   *      没这个格子 ⇒ 用户点"添加"后**根本没法填 id** ⇒ 保存被校验拒
   *      （实测报「第 6 项：id 为空，不合法」）。
   * ⚠️ 内置项**没有这个格子**（它们的 id 锁死，见 lockIdentity）。
   */
  if (!lockIdentity) {
    body.append(
      kindField('id（机器名，写进封面用）', k.id, false, (v) => { k.id = v.trim() },
        '小写英文/数字/连字符，2–32 位，小写字母开头'),
    )
  }
  // ⚠️ 显示名只给非内置可编辑（它是**身份**的一部分）。
  body.append(kindField('显示名', k.label, lockIdentity, (v) => { k.label = v }))
  body.append(
    // ⭐ 内置项**也可编辑**（决策 217）—— when 是内容。
    kindField('什么时候用', k.when, false, (v) => { k.when = v },
      '一句话说清"什么内容该归到这一类" —— 它会进提示词，是模型选类型的唯一依据'),
  )
  // ⭐ 怎么写**可多行**（可能要写不少字），内置项也可编辑。
  body.append(
    kindField('怎么写（骨架 / 规范）', k.guide, false, (v) => { k.guide = v },
      '这一类知识该怎么写（可多行）—— 也会进提示词', true),
  )
  if (lockIdentity) {
    body.append(h('p', {
      class: 'set-note',
      text: '内置类型：id 与显示名锁死、不可删除（库里已有知识在用它）；但「什么时候用 / 怎么写」可以改。',
    }))
  }

  // ── 本条自己的操作行 ──
  const foot = h('div', { class: 'kind-foot' })
  const save = h('button', { type: 'button', class: 'primary kind-save', text: '保存' })
  save.addEventListener('click', () => { void saveOneKind(k, i) })
  foot.append(save)
  const cancel = h('button', { type: 'button', class: 'kind-cancel', text: '取消' })
  cancel.addEventListener('click', () => {
    kindEditingId = ''
    kindDraftIndex = -1
    // ⚠️ **取消要丢掉未保存的改动** ⇒ 从服务端重拉一次（否则本地对象还留着改过的值）。
    void openKindsPage()
  })
  foot.append(cancel)
  if (!k.builtin) {
    const del = h('button', { type: 'button', class: 'kind-del', text: '删除' })
    del.addEventListener('click', () => {
      if (k.count > 0) {
        toast('「' + k.id + '」还有 ' + k.count + ' 条知识在用，先把它们改成别的类型再删', true)
        return
      }
      void deleteKind(k.id)
    })
    foot.append(del)
  }
  body.append(foot)
  return body
}

/**
 * ⭐⭐⭐ **这次保存会不会破坏前缀缓存？**（是 ⇒ 返回要弹的确认文案；否 ⇒ 空串）
 *
 * ── 判据（2026-10-05 核实，不是猜）─────────────────────────────────────────
 * 只有**两条腿**会进 DSH 的 wire \`tools\`（那正是"tools 变 ⇒ node 0 重写"的触发源）：
 *
 * | 改动 | tools 侧会变吗 | 结论 |
 * |---|---|---|
 * | **只改 when / guide** | ❌ 不变 —— 那两份清单里**只有 id**（\`<!--memj:kind-list-->\`） | ✅ **不破** |
 * | 改 id / 新增 / 删除 | ✅ 变（可选值清单变了） | 🔴 **破** |
 * | 什么都没改 | ❌ | ✅ 不破（也不用弹） |
 *
 * ⚠️ 目录表（含 when + guide）走的是 **context()** —— 尾部 append、同值不发 ⇒ 不破。
 *
 * ⭐ **为什么只在该破时弹**：每次都弹的话，"改个错别字"也要吓用户一次
 *   ⇒ 他会开始**无脑点确认**，那时弹窗就等于不存在（本项目判据：
 *     **一个总在报警的警报，与没有警报等价**）。
 * @param k - 本次要保存的那条（已被就地改过）。
 * @returns 确认文案（空串 = 不必确认）。
 */
function kindChangeBreaksCache(k) {
  const before = kindsState.originals.get(k.id)
  const idsBefore = [...kindsState.originals.keys()]
  const idsNow = kindsState.items.map((x) => x.id)
  // ⚠️ 用**排序后**比集合：顺序变了不影响 tools（可选值清单按表顺序拼，
  //    所以顺序其实也影响 —— 但那属于"表变了"，一并算作会破更稳妥）。
  const setChanged = idsBefore.slice().sort().join('\u0000') !== idsNow.slice().sort().join('\u0000')

  const reasons = []
  // ⭐ 先判「改名」：旧 id 从表里消失、同时出现了一个新 id（总数不变）。
  //    ⚠️ 我第一版写成 before.id !== k.id —— 那是**死代码**：
  //      originals.get(k.id) 用的是**新 id**，改过名时必然 undefined
  //      ⇒ 会落到「新增」分支 ⇒ **文案说错**（实际是改名）。
  const idRenamed = before === undefined && idsNow.length === idsBefore.length && setChanged
  if (idRenamed) reasons.push('**改了一个类型的 id**')
  else if (before === undefined) reasons.push('**新增了一个类型**')
  else if (setChanged) reasons.push('**类型集合变了**（有新增或删除）')

  if (reasons.length === 0) return ''

  return (
    '这次改动会**破坏前缀缓存**：' + reasons.join('、') + '。\n\n' +
    '原因：知识类型的**可选值清单会写进工具的 schema**（模型靠它决定能填什么），\n' +
    '而它一变，DSH 就要**重写系统提示的开头** ⇒ **所有活跃会话的前缀缓存全部作废**' +
    '（下一轮会变慢、也更贵）。\n\n' +
    '⚠️ 影响范围是**所有正在进行的会话**，不只当前这个。\n\n' +
    '确定要保存吗？'
  )
}

/**
 * ⭐ **保存【这一条】**（POST /kind/upsert）—— 只动这一条，别条一概不碰。
 * @param k - 该条（**已被就地改过**的本地对象）。
 * @param i - 它在表里的下标（失败时要回滚用）。
 * @returns Promise<void>
 */
async function saveOneKind(k, i) {
  void i
  const msg = document.getElementById('settings-msg-kinds')
  // ⭐⭐ **保存前确认 —— 只在该破前缀缓存时弹**（判据见 `kindChangeBreaksCache`）。
  const why = kindChangeBreaksCache(k)
  if (why !== '' && !window.confirm(why)) return
  try {
    const r = await fetch(API + '/kind/upsert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item: k }),
    })
    const body = await r.json()
    if (!body.ok) {
      showKindErrs(body.errors || [body.error || '保存失败'])
      toast('这一条没保存：校验没过', true)
      return
    }
    showKindErrs([])
    kindsState.items = body.items
    kindEditingId = ''
    kindDraftIndex = -1
    renderKindsList()
    // ⭐⭐ 类型表变了 ⇒ **kind 下拉必须跟着重填**（否则编辑知识时选不到新类型）。
    await loadKinds()
    fillKindFilters()
    if (msg) msg.textContent = '已保存（' + new Date().toLocaleTimeString() + '）'
    toast('已保存「' + k.id + '」')
  } catch (e) {
    showKindErrs(['请求失败：' + e.message])
    toast('保存失败：' + e.message, true)
  }
}

/**
 * ⭐ **删一条**（走 /kind/delete，**服务端还会再查一次引用**）。
 * @param id - 要删的 id。
 * @returns Promise<void>
 */
async function deleteKind(id) {
  // 🔴🔴 **删除同样破前缀缓存**（可选值清单少一项 ⇒ tools 变）—— 而且它最该确认。
  //    ⚠️ 我第一版只给 saveOneKind 加了确认、**漏了这里** —— 而删除是**不可逆**的。
  if (
    !window.confirm(
      '删除「' + id + '」会**破坏前缀缓存**：知识类型的可选值清单会写进工具的 schema，' +
        '少一项也要**重写系统提示的开头** ⇒ **所有活跃会话的前缀缓存全部作废**。' +
        '\n\n⚠️ 这个动作**不可逆**（类型定义会被删掉）。确定吗？',
    )
  ) return
  try {
    const r = await fetch(API + '/kind/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const body = await r.json()
    if (!body.ok) {
      showKindErrs(body.errors || [body.error || '删除失败'])
      toast('删除被拒', true)
      return
    }
    showKindErrs([])
    kindsState.items = body.items
    kindEditingId = ''
    kindDraftIndex = -1
    renderKindsList()
    await loadKinds()
    fillKindFilters()
    toast('已删除「' + id + '」')
  } catch (e) {
    showKindErrs(['请求失败：' + e.message])
    toast('删除失败：' + e.message, true)
  }
}

/**
 * ⭐ **一个带标签的输入格**（内置项 ⇒ \`disabled\`）。
 * @param label - 标签文字。
 * @param value - 初值。
 * @param readonly - 是否只读。
 * @param onInput - 输入回调。
 * @param placeholder - 占位提示。
 * @param multiline - \`true\` ⇒ 用 \`textarea\`（自动长高）。
 * @returns 一个 \`.kind-field\` 元素。
 */
function kindField(label, value, readonly, onInput, placeholder, multiline) {
  const wrap = h('div', { class: 'kind-field' })
  wrap.append(h('span', { class: 'kind-field-label', text: label }))
  const el = multiline === true
    ? h('textarea', { rows: 2 })
    : h('input', { type: 'text' })
  el.value = value == null ? '' : value
  if (placeholder) el.placeholder = placeholder
  if (readonly) el.disabled = true
  if (multiline === true) {
    // ⚠️ 先归零再读 scrollHeight —— 否则框**只增不减**（删字后不会缩回去）。
    const grow = () => {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
    el.addEventListener('input', () => { onInput(el.value); grow() })
    queueMicrotask(grow)
  } else {
    el.addEventListener('input', () => onInput(el.value))
  }
  wrap.append(el)
  return wrap
}

/**
 * ⭐ 显示类型页的校验错误（与模板页同一套样式，但**自己的容器**）。
 * @param list - 错误清单；空 ⇒ 隐藏。
 * @returns void
 */
function showKindErrs(list) {
  const box = document.getElementById('kinds-errors')
  if (!box) return
  box.replaceChildren()
  if (!list || list.length === 0) { box.hidden = true; return }
  box.hidden = false
  const ul = h('ul')
  for (const e of list) ul.append(h('li', { text: e }))
  box.append(ul)
}

/**
 * 绑定类型页的按钮（放文件末尾 —— 同 TDZ 理由，见 bindTemplateButtons）。
 *
 * ⭐ **2026-10-05 改版**：不再有"保存整张表"的总按钮（每条各自保存，见 saveOneKind）
 *   ⇒ 这里只剩「＋ 添加」一个动作。
 * @returns void
 */
function bindKindButtons() {
  document.getElementById('kinds-add')?.addEventListener('click', () => {
    // 🔴 **插到【最前】**（2026-10-05 用户裁定：*"始终插最前，保存后也在最前"*）。
    //    ⚠️ 按钮本来就在列表上方 ⇒ 新条紧跟其后，**一眼就看得见**，不必往下翻。
    //    ⭐ 顺序 = 类型下拉里的顺序，**由用户自己控制**（想调就靠"删了重加"）。
    // ⚠️ **草稿 id 留空**、由用户填 —— 先写盘会让"空 id 被自己的校验拒"
    //    ⇒ 用户看到"点添加就报错"。
    // 🔴 **草稿的编辑键不能用 id**（id 是空串，而空串在 kindEditingId 里表示"都收起"）
    //    ⇒ 用**下标** 0 定位（它就是刚插到最前的那条）。
    kindsState.items.unshift({ id: '', label: '', when: '', guide: '', builtin: false, reserved: false, count: 0 })
    kindEditingId = ''
    kindDraftIndex = 0
    renderKindsList()
    const box = document.getElementById('kinds-list')
    const first = box?.firstElementChild
    first?.scrollIntoView({ block: 'nearest' })
    first?.querySelector('input, textarea')?.focus()
  })
}
/** 把一份模板灌进表单（编辑已有模板，或以它为起点）。 */
function loadTemplateIntoForm(t) {
  if (!t) return
  const idEl = document.getElementById('tpl-id')
  const titleEl = document.getElementById('tpl-title')
  // ⭐⭐ **决策 208（2026-10-12）：`default` 现在也可以编辑**（模板落成 .md、默认模板也落盘）
  //    ⇒ **必须把它的 id 也带进表单**，否则点"编辑默认模板"再保存会**新建一份**、
  //      而不是改掉默认模板（用户会看到"我改的没生效、还多出来一份"）。
  //    ⚠️ 原先这里刻意把 default 的 id 清空（那时它"不可覆盖"）—— 判据随设计更新。
  if (idEl) idEl.value = t.id
  if (titleEl) titleEl.value = t.title
  // ⚠️ **深拷一份**：直接引用 `t.sections` 会让"取消编辑"后仍改到列表里的对象。
  tplState.sections = t.sections.map((s) => ({ name: s.name, desc: s.desc, truncate: s.truncate === true }))
  renderTemplateSections()
}

/** 画模板列表（每份一行：节数 + 编辑/删除）。 */
function renderTemplatesList() {
  const box = document.getElementById('tpl-list')
  if (!box) return
  box.replaceChildren()
  for (const t of tplState.items) {
    const row = document.createElement('div')
    row.className = 'tpl-row'
    const info = document.createElement('div')
    info.className = 'tpl-row-info'
    const name = document.createElement('strong')
    name.textContent = `${t.id}${t.title && t.title !== t.id ? `（${t.title}）` : ''}`
    const meta = document.createElement('span')
    meta.className = 'dim'
    // ⭐ 决策 208：`default` 也可编辑（只是不可删）⇒ 文案跟着改，别再说"不可覆盖"。
    meta.textContent = `${t.sectionCount} 节${t.id === 'default' ? '｜默认模板（可编辑，不可删）' : ''}`
    info.append(name, meta)
    // ⚠️ 不合法的模板**逐条报出来**（否则它会静默不可用）。
    if (t.errors && t.errors.length > 0) {
      const err = document.createElement('div')
      err.className = 'tpl-row-err'
      err.textContent = `⚠️ 不合法：${t.errors.join('；')}`
      info.append(err)
    }
    row.append(info)

    const acts = document.createElement('span')
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = ''
    edit.textContent = '编辑'
    edit.addEventListener('click', () => loadTemplateIntoForm(t))
    acts.append(edit)
    if (t.deletable) {
      const del = document.createElement('button')
      del.type = 'button'
      del.className = ''
      del.textContent = '删除'
      // 🔴 **二次确认**（用户裁定：模板相关操作要用户确认）。
      del.addEventListener('click', () => {
        if (!window.confirm(`删除模板「${t.id}」？\n\n⭐ 不会影响任何已有文档（它们记着自己的结构）。`)) return
        void deleteTemplate(t.id)
      })
      acts.append(del)
    }
    row.append(acts)
    box.append(row)
  }
}

/** 画表单里的节（每行：节名 + 用途 + 可截断 + 删除）。 */
function renderTemplateSections() {
  const box = document.getElementById('tpl-sections')
  if (!box) return
  box.replaceChildren()
  tplState.sections.forEach((s, i) => {
    const row = document.createElement('div')
    row.className = 'tpl-sec'

    const name = document.createElement('input')
    name.type = 'text'
    name.className = 'tpl-sec-name'
    name.placeholder = '节名'
    name.value = s.name
    name.addEventListener('input', () => { s.name = name.value })

    // ⭐⭐ 2026-10-05（用户要求）：这一格从 `input` 改成 **`textarea`** ——
    //    它装的是**完整的书写规范**（要写什么 + 怎么写 + 截断/归档规则），
    //    可能要写不少字，单行输入框既写不下也看不到换行。
    const desc = document.createElement('textarea')
    desc.className = 'tpl-sec-desc'
    desc.rows = 2
    desc.placeholder = '这一节要干嘛（必填）—— 可多行；写清"要写什么 + 怎么写"。写得长不影响截断配额'
    desc.value = s.desc
    /**
     * ⭐ **自动长高**：让框跟着内容长，避免"写了 5 行却只看到 2 行"。
     * ⚠️ 必须先归零再读 `scrollHeight` —— 否则它**只增不减**（删字后框不会缩回去）。
     */
    const autoGrow = () => {
      desc.style.height = 'auto'
      desc.style.height = `${desc.scrollHeight}px`
    }
    desc.addEventListener('input', () => {
      s.desc = desc.value
      autoGrow()
    })
    // ⚠️ 插进 DOM 之前量不到真实高度（`scrollHeight` 是 0）⇒ 等一次微任务再量。
    queueMicrotask(autoGrow)

    const truncWrap = document.createElement('label')
    truncWrap.className = 'tpl-sec-trunc'
    const trunc = document.createElement('input')
    trunc.type = 'checkbox'
    trunc.checked = s.truncate === true
    trunc.addEventListener('change', () => {
      // ⭐⭐ 决策 206（用户 2026-10-02）：**可多选** —— 不再"勾一个取消其余"。
      //    每节各自独立：各自与阈值比、各自截、各自归档。
      s.truncate = trunc.checked
    })
    truncWrap.append(trunc, document.createTextNode('可截断'))

    const del = document.createElement('button')
    del.type = 'button'
    del.className = ''
    del.textContent = '×'
    del.title = '删除这一节'
    del.addEventListener('click', () => {
      tplState.sections.splice(i, 1)
      renderTemplateSections()
    })

    row.append(name, desc, truncWrap, del)
    box.append(row)
  })
}

/** 保存当前表单里的模板。 */
async function saveTemplateForm() {
  const errBox = document.getElementById('tpl-errors')
  /** ⭐ 把一份清单渲染进指定容器（错误与提醒共用同一套渲染）。 */
  const render = (box, list) => {
    if (!box) return
    box.replaceChildren()
    if (!list || list.length === 0) { box.hidden = true; return }
    box.hidden = false
    const ul = document.createElement('ul')
    for (const e of list) {
      const li = document.createElement('li')
      li.textContent = e
      ul.append(li)
    }
    box.append(ul)
  }
  const showErrs = (list) => render(errBox, list)
  /**
   * ⭐⭐ 2026-10-05：**提醒**（不阻断保存）。
   * 🔴 与错误**必须是两个容器** —— 同框会让人以为"保存没成功"，
   *    而其实它只是想说"这一节写得有点长，确认一下"。
   */
  const warnsBox = document.getElementById('tpl-warnings')
  const showWarns = (list) => render(warnsBox, list)
  const id = (document.getElementById('tpl-id')?.value ?? '').trim()
  const title = (document.getElementById('tpl-title')?.value ?? '').trim()
  const template = {
    id,
    title: title === '' ? id : title,
    sections: tplState.sections.map((s) => ({
      name: s.name.trim(),
      desc: s.desc.trim(),
      ...(s.truncate === true ? { truncate: true } : {}),
    })),
  }
  try {
    const r = await fetch(`${API}/template/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ template }),
    })
    const body = await r.json()
    if (!body.ok) {
      showErrs(body.errors || [body.error || '保存失败'])
      toast('模板未保存：校验没过', true)
      return
    }
    showErrs([])
    // ⭐⭐ 2026-10-05：**提醒**（`warnings`）与**错误**分开显示 ——
    //    错误拦保存、提醒只告知。⚠️ 保存**成功了**也要把它显示出来，
    //    否则"这一节的规范特别长"这条提示永远到不了人眼前。
    const warns = body.warnings || []
    if (warns.length > 0) showWarns(warns)
    else showWarns([])
    toast(warns.length > 0 ? `模板「${id}」已保存（有 ${warns.length} 条提醒）` : `模板「${id}」已保存`)
    await openTemplatesPage()
  } catch (e) {
    showErrs([`请求失败：${e.message}`])
    toast(`保存模板失败：${e.message}`, true)
  }
}

/** 删除一份模板。 */
async function deleteTemplate(id) {
  try {
    const r = await fetch(`${API}/template/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const body = await r.json()
    if (!body.ok) { toast(body.error || '删除失败', true); return }
    toast(`模板「${id}」已删除（已有文档不受影响）`)
    await openTemplatesPage()
  } catch (e) {
    toast(`删除模板失败：${e.message}`, true)
  }
}

/** 绑定模板页上的按钮（**只绑一次**）。 */
function bindTemplateButtons() {
  const add = document.getElementById('tpl-add-section')
  if (add && add.dataset['bound'] !== '1') {
    add.dataset['bound'] = '1'
    add.addEventListener('click', () => {
      tplState.sections.push({ name: '', desc: '', truncate: false })
      renderTemplateSections()
    })
  }
  const clear = document.getElementById('tpl-clear')
  if (clear && clear.dataset['bound'] !== '1') {
    clear.dataset['bound'] = '1'
    clear.addEventListener('click', () => {
      const idEl = document.getElementById('tpl-id')
      const titleEl = document.getElementById('tpl-title')
      if (idEl) idEl.value = ''
      if (titleEl) titleEl.value = ''
      tplState.sections = [{ name: '', desc: '', truncate: false }]
      renderTemplateSections()
    })
  }
  const save = document.getElementById('tpl-save')
  if (save && save.dataset['bound'] !== '1') {
    save.dataset['bound'] = '1'
    save.addEventListener('click', () => void saveTemplateForm())
  }
}


/**
 * ⭐⭐ 英文召回索引「检查并补全」（用户 2026-09-26 要求）。
 *
 * 🔴 **判据在服务端**（`checkIndex`，与启动兜底**同源**）——前端只负责：
 * ① 把四态如实显示出来；② 把明细（逐项计数）摊开给人看。
 * ⚠️ **前端不做任何判定**（否则就是第二份判据实现）。
 * @param force - `true` = 无论有没有问题都强制重建一次。
 * @param silent - `true` = 只更新显示、不弹 toast（打开面板时自动跑，不该弹通知）。
 */
async function checkEnIndex(force = false, silent = false) {
  const btn = document.getElementById('idx-check-btn')
  const btnForce = document.getElementById('idx-rebuild-btn')
  const msg = document.getElementById('idx-check-msg')
  const detail = document.getElementById('idx-check-detail')
  if (btn) btn.disabled = true
  if (btnForce) btnForce.disabled = true
  if (detail) {
    detail.hidden = true
    detail.textContent = ''
  }
  // ⚠️ **动态提示的分阶段**：补全可能触发翻译（几十秒）⇒ 必须先说清"正在做什么"，
  //    否则界面看起来像卡死了（本项目一贯：不许静默等待）。
  if (msg) msg.textContent = force ? '正在强制重建…（可能触发翻译，请稍候）' : '正在检查…'
  try {
    const r = await postJson('/index-check', force ? { force: true } : {})
    const h = r.health || {}
    // ⭐⭐ 用户 2026-09-28：*"所有那个示意的绿√的icon全都不要，文字提示足够了。"*
    //    ⇒ 下面这些提示语**一律去掉 ✅ / ⚠️**，只留文字。
    if (r.repaired) {
      const res = r.result || {}
      // ⭐ 补全后显示的是**补全后的真实状态**（服务端重建后会再体检一次）
      if (msg) {
        msg.textContent = res.skipped
          ? `已尝试补全，但被跳过：${res.skipped}`
          : `已补全：新增 ${res.added ?? 0} / 更新 ${res.updated ?? 0} / 移除 ${res.removed ?? 0}` +
            `，新翻 ${res.translated ?? 0} 条${res.failed ? `（失败 ${res.failed}）` : ''}`
      }
      if (!silent) toast('索引已补全')
    } else {
      if (msg) msg.textContent = '索引健康，无需补全'
      if (!silent) toast('索引健康')
    }
    // 明细：把每一项都摊开（⚠️ 用**文字**表示对错，不用图标 —— 用户 2026-09-28）
    //
    // 🔴🔴 **改成真正的两列布局**（用户 2026-09-28 复报：*"去掉icon后，没有对齐啊，都左对齐"*）。
    //    原来靠 `textContent` + `pre-wrap` 拼 `标签：值` ⇒ **标签长短不齐、
    //    于是每行的"值"起点各不相同**（看起来就是"都没对齐"）。
    //    ⭐ 图标在时它**顺便充当了一个固定宽度的前导**，掩盖了这个问题；去掉图标后暴露。
    //    ⇒ 现在用 **CSS grid**（`max-content 1fr`）：标签列按**最长标签**定宽，
    //      **所有值左边界必然对齐** —— 这才是"对齐"，而不是靠空格凑。
    if (detail) {
      const rows = [
        ['索引条数', h.indexed, `库里 ${h.visible}`, h.indexed !== h.visible],
        ['幽灵条目（库里已删、索引还在）', h.ghost, '', h.ghost !== 0],
        ['缺失条目（库里有、索引没跟上）', h.absent, '', h.absent !== 0],
        ['缺译文', h.untranslated, '', h.untranslated !== 0],
        ['指纹过期（中文 desc 变过）', h.staleHash, '', h.staleHash !== 0],
        ['译文残留中文', h.leaked, '', h.leaked !== 0],
        // ⭐ 归属漂移：project/theme 被改过（范围筛选用错归属）—— 2026-09-26 补的判据
        ['归属漂移（project/theme 改过）', h.metaDrift, '', h.metaDrift !== 0],
        ['项目主题映射漂移', h.projectDrift, '', h.projectDrift !== 0],
      ]
      const box = document.createElement('div')
      box.className = 'idx-rows'
      const addRow = (k, v, note, bad = false) => {
        const kEl = document.createElement('span')
        kEl.className = 'idx-k'
        kEl.textContent = k
        const vEl = document.createElement('span')
        vEl.className = 'idx-v'
        vEl.textContent = String(v)
        const nEl = document.createElement('span')
        nEl.className = bad ? 'idx-n idx-bad' : 'idx-n'
        nEl.textContent = bad ? '有问题' : (note ?? '')
        box.append(kEl, vEl, nEl)
      }
      // ⚠️ 判据与原来**逐字一致**（`got !== want`，`want` 除"索引条数"外都是 0）
      //    —— 只改**呈现方式**，不改判定。
      for (const [label, got, note, bad] of rows) addRow(label, got, note, bad)
      // ⭐ 元信息用**同一个网格** ⇒ 与上面的数值列也对齐（不再用 `　` 手工缩进）。
      addRow('翻译路由', h.route || '（跟随主会话）')
      addRow('上次重建', h.builtAt || '（无）')
      addRow('本次检查', h.checkedAt || '（无）')
      detail.replaceChildren(box)
      if (Array.isArray(h.problems) && h.problems.length > 0) {
        const p = document.createElement('p')
        p.className = 'idx-problems'
        p.textContent = h.problems.join('；')
        detail.appendChild(p)
      }
      // ⚠️ 不再用 `pre-wrap`（改成 DOM 网格后不需要它，留着只会干扰换行）。
      detail.style.whiteSpace = ''
      detail.hidden = false
    }
  } catch (e) {
    if (msg) msg.textContent = `检查失败：${e.message}`
    toast(`检查索引失败：${e.message}`, true)
  } finally {
    if (btn) btn.disabled = false
    if (btnForce) btnForce.disabled = false
  }
}

/**
 * ⭐⭐ 保存**某一页 / 某一个版块**的设置（决策 169 + 2026-10-07 拆分）。
 *
 * 🔴 **只提交本单元那几个键** —— 旧版一次提交全部 40 个键，
 *    任一处的读取 bug 都可能写坏别处；分页后**越权提交 = 写坏别人的数据**。
 *    ⚠️ 服务端契约**不变**（键全部可选、逐项写入）——裁剪只发生在前端。
 * @param unit - 保存单元 id（**一个设置版块一个**，共 14 个）。
 *   ⚠️ **别再往这里抄单元清单**——唯一出处是 `SAVE_UNITS`（抄第二遍必然漂开）。
 */
async function saveSettings(unit = state.setSub) {
  // ⚠️ **单元的粒度比子页细**（2026-10-07）：**每个设置版块一个单元**。
  const page = SAVE_UNITS[unit] ?? unit
  const btn = document.querySelector(`.set-save[data-savepage="${unit}"]`)
  const msg = document.getElementById(`settings-msg-${unit}`)
  // ⚠️ **只取本单元要用到的元素**（别的单元可能是 hidden，但值仍然读得到 —— 那正是要避免的）。
  const picked = document.querySelector('input[name="themeCreation"]:checked')
  if (unit === 'sink-theme' && !picked) {
    toast('请先选择一个模式', true)
    if (msg) msg.textContent = '请先选择一个模式。'
    return
  }

  /**
   * ⭐⭐ **只读本单元那几个数值控件**（决策 169 的核心纪律）。
   *
   * 🔴🔴 **为什么必须按单元裁剪**：这些 `num(...)` 原来是**无条件全跑**的 ⇒
   *    在 A 版块点保存时它仍去读 B 版块的输入框；B 那些框此刻可能是空的
   *    ⇒ 报「某某必须是 1–50 之间的整数」，而**那个字段在 A 版块界面上根本不存在**。
   *    ⚠️ **只裁一半比不裁更隐蔽**：写入那半是对的、代码审查看着完全正常，
   *       只有真去点那个按钮才暴露（本项目踩过两次）。
   *    ⭐ 判据：**"拆分"必须同时裁【写】与【读】两条路径**。
   * @returns `{ 配置键: Number }`；不合法时回 `null`（调用方直接 return）。
   */
  const readNumKeys = () => {
    const out = {}
    for (const [id, key, label, min, max, integer] of NUM_KEYS[unit] ?? []) {
      // ⚠️ **必须带 `if (el)` 语义**：控件被删了而这里还留着 ⇒ 读到空串 ⇒
      //    整块存不了，且报错指向一个**界面上根本没有的字段**。
      //    ⇒ 元素不存在就**直接跳过这个键**（不提交、也不拦路）。
      const el = document.getElementById(id)
      if (!el) continue
      const raw = (el.value ?? '').trim()
      const n = Number(raw)
      const bad = raw === ''
        || !Number.isFinite(n)
        || n < min
        || n > max
        || (integer && !Number.isInteger(n))
      if (bad) {
        const tip = `${label}必须是 ${min}–${max} 之间的${integer ? '整数' : '数'}`
        toast(tip, true)
        if (msg) msg.textContent = `${tip}。`
        return null
      }
      out[key] = n
    }
    return out
  }
  const nums = readNumKeys()
  if (nums === null) return
  // ⚠️ **截断目标必须 ≤ 触发阈值**——否则"超过阈值就截"会变成"截完仍超阈"
  //    ⇒ 下一轮又截，来回震荡。**这是跨键约束，前端能做就先做**（服务端分两次提交时做不到）。
  //    ⚠️ 两个数值**同属一个保存单元**（`sink-progress`）⇒ 这条约束照样成立
  //       （它们永远一起提交；⭐ 若哪天把它们拆到两个单元，这里必须重新审 ——
  //         拆开后前端**做不到**这个检查，得挪到服务端）。
  if (unit === 'sink-progress' && nums.progressCharsKeep > nums.progressCharsWarn) {
    toast('截断目标不能大于触发阈值', true)
    if (msg) msg.textContent = '截断目标必须 ≤ 触发阈值（否则每轮都会震荡）。'
    return
  }
  // ⭐⭐ 主动注入开着却**没选模型** ⇒ 拦住（服务端会存下一个空模型，
  //    表现为"开关是开的、但一次判断都不做" —— 那是**看起来在工作、实际没工作**）。
  // 🔴 2026-10-07：总开关已改成**即时生效**（见 `bindInstantToggles`）⇒ 这里只剩
  //    `active-recall` 一条路径。**两道门都要有**（同一判据，见 `instantToggleGuard`）：
  //    从"模型"这一侧保存时也要能发现"开着但没模型"。
  if (unit === 'active-recall' && document.getElementById('ai-on')?.checked) {
    const bad = activeModelMissing()
    if (bad !== '') {
      toast(bad, true)
      if (msg) msg.textContent = bad
      return
    }
  }
  btn.disabled = true
  if (msg) msg.textContent = '保存中…'
  try {
    // ⭐⭐ **git 开关：先做环境准备，成功了才存开关**（决策 135）。
    //
    // 🔴 为什么顺序不能反：若先把 `backupGit: true` 写进配置，
    //    而环境其实不通（没装 git），那这个开关就**写着"已开启"却永不工作**
    //    ⇒ **开关在说谎**。用户明确裁定过：环境不通时**拒绝开启**。
    //    ⚠️ 失败的处置：**把开关回弹到关**，并显示失败的那一步与可执行的下一步。
    const gitBox = document.getElementById('backup-git')
    // ⚠️ 只在**版本维护那个单元**才去探 git 环境（判据：只做本单元的事）——
    //    以前整页保存时，改个主题模式也会顺带探一次 git。
    const wantGit = unit === 'sink-git' && !!(gitBox && gitBox.checked)
    if (wantGit) {
      if (msg) msg.textContent = '正在准备 git 环境…'
      const setup = await postJson('/backup/setup', {})
      renderBackupDetail(setup.steps || [], null)
      if (!setup.ok) {
        gitBox.checked = false
        const detail = document.getElementById('backup-detail')
        if (detail) detail.hidden = false
        if (msg) msg.textContent = `git 环境未就绪：${setup.error}`
        toast(`未能开启 git 版本维护：${setup.error}`, true)
        // ⚠️ 环境不通 ⇒ **不写任何配置**（本次请求整体放弃）。
        btn.disabled = false
        return
      }
    }

    // ⭐⭐⭐ **按【保存单元】拼 payload**（决策 169 + 2026-10-07 全量拆分）——只提交本单元的键。
    //
    // 🔴 **两条铁律**（本项目各踩过一次）：
    //   ① **布尔值必须原样传 false**（不能省略）——省略 = "没给" = 不写这个键
    //      ⇒ 用户点了关闭却**关不掉**；
    //   ② **数值必须是 Number**（DOM 的 `.value` 是字符串 "3"）⇒ 服务端
    //      `typeof n !== 'number'` 会拒掉，报"必须是 1–20 之间的整数"。
    //
    // ⚠️ 各单元只提交自己那几项；**没列到的键一律不碰**（别单元的数据由别单元负责）。
    //    ⭐ 数值键统一由 `nums` 展开（它来自 `NUM_KEYS[unit]`，与校验同一份来源）。
    //
    // ⭐⭐⭐ 用户 2026-10-07：**全部设置页都按板块保存**。下面每个分支都很小，
    //    这是**有意的**：一个分支越大，越容易把"不该我管的键"卷进来
    //    （那正是"改个阈值顺带写坏模型配置"的成因）。
    /** 小工具：读一个复选框的勾选态（缺元素 ⇒ false，但**只在确实该提交时才用**）。 */
    const chk = (id) => !!(document.getElementById(id)?.checked)
    const val = (id, dflt = '') => document.getElementById(id)?.value ?? dflt

    let payload = {}
    switch (unit) {
      // ══════════════ 沉淀 ══════════════
      case 'sink-theme':
        payload = { themeCreation: picked.value }
        break
      case 'sink-progress':
        payload = nums
        break
      case 'sink-git':
        // ⚠️ **布尔原样传**（不能因为 false 就省略 —— 省略 = 关不掉这个开关）。
        payload = { backupGit: wantGit }
        break
      case 'sink-tag':
        payload = {
          // ⚠️ 两条铁律：布尔原样传 false；空串是合法值（= 不传档位）。
          tagNormalizeProvider: readModelPair('tag-model').provider,
          tagNormalizeModel: readModelPair('tag-model').model,
          tagNormalizeOnHandoff: chk('tag-auto'),
          tagNormalizeReasoningEffort: val('tag-effort', 'off'),
        }
        break

      // ══════════════ 热知识注入 ══════════════
      // ⚠️ `hot-inject`（启用热知识注入）**不在这里** —— 它是即时生效项
      //    （见 `INSTANT_TOGGLES` 与 `bindInstantToggles`）。
      case 'hot-budget':
        payload = nums
        break
      case 'hot-score':
        payload = {
          ...nums,
          hotScoreOnTurnEnd: chk('hs-on'),
          // ⭐ 决策 182：入围门槛的"上一轮那道门"。
          hotScoreGateLastTurn: chk('hs-gate-last'),
          // ⭐⭐⭐ 通路口径 + 模型。
          //    🔴 **2026-10-07 多 provider 化**：`jev` 通路的模型要写进
          //       `hotScoreDecisionPick`（`providerId/modelName`），
          //       **不是** `hotScoreModel`（那在 jev 下是旧的裸模型名键）。
          hotScoreChannel: val('hs-channel', 'chat'),
          ...(() => {
            const ch = val('hs-channel', 'chat')
            const r = readChannelModel('hs-model', ch)
            const full = r.provider !== '' ? `${r.provider}/${r.model}` : r.model
            // ⚠️ `chat` 通路照旧写 `hotScoreModel`（它本来就是 provider/model，没变）。
            return ch === 'jev'
              ? { hotScoreDecisionPick: full }
              : { hotScoreModel: full }
          })(),
          // ⭐ 子代理模型：**始终是 `provider/model`**（它只能走 DSH 模型路由）。
          hotScoreSubagentProvider: readChannelModel('hs-subagent-model', 'chat').provider,
          hotScoreSubagentModel: readChannelModel('hs-subagent-model', 'chat').model,
        }
        break

      // ══════════════ 主动注入 ══════════════
      // ⚠️ `active-on`（启用主动注入）**不在这里** —— 它是即时生效项（见 `INSTANT_TOGGLES`）。
      case 'active-recall':
        // ⭐⭐ 召回模型这一块：**通路必须先于模型读**（两条通路的编码不同）。
        //    🔴 **chat 通路必须拼回 `provider/model`**（实测踩到：下拉框的 value 是
        //       JSON 数组，第一版只把 model 部分写进配置 ⇒ 存成 `deepseek-v4.1-flash`
        //       少了 `workbuddy/` 前缀 ⇒ 召回直接报"模型要写成 provider/model"。
        //       ⚠️ 更坏的是：**用 API 直接写配置时是对的**，只有"从面板点保存"才坏
        //       ⇒ 端到端脚本若只走 API 就发现不了）。
        payload = {
          activeInjectChannel: val('ai-channel', 'chat'),
          // 🔴 **2026-10-07 多 provider 化**：两条通路的值形态**已统一**为
          //    `provider/model`（决策模型也编码成 `[providerId, modelName]`）。
          //    ⇒ `chat` 写 `activeInjectModel`、`jev` 写 `activeInjectDecisionPick`。
          //    ⚠️ 别把两者混写：`activeInjectModel` 在 jev 通路是**旧键**（裸模型名）。
          ...(() => {
            const ch = val('ai-channel', 'chat')
            const pair = readActiveModel(ch)
            const full = pair.provider !== '' && pair.model !== ''
              ? `${pair.provider}/${pair.model}`
              : pair.model
            return ch === 'jev'
              ? { activeInjectDecisionPick: full }
              : { activeInjectModel: full }
          })(),
          activeInjectScope: val('ai-scope', 'project+themes'),
          activeInjectJevNarrowScope: chk('ai-jev-narrow'),
          // ⚠️ 「严格触发口径」的控件**就渲染在本版块里**（保持用户原有的版面）⇒ 随本单元提交。
          activeInjectStrict: chk('ai-strict'),
        }
        break
      case 'active-judge':
        payload = nums
        break
      case 'active-budget':
        payload = { ...nums, activeInjectBudget: chk('ai-budget') }
        break
      case 'active-gate':
        payload = {
          ...nums,
          activeInjectSufficientGate: chk('ai-suff-gate'),
          activeInjectSearchIntentGate: chk('ai-intent-gate'),
        }
        break
      case 'active-debug':
        payload = {
          activeRecallLogRequest: chk('ai-recall-log-req'),
          activeInjectExplain: chk('ai-explain'),
        }
        break

      // ══════════════ 英文索引 ══════════════
      case 'index-en':
        payload = {
          ...nums,
          // ⚠️ **不提交 `enIndex`**：它是必要功能、没有开关（用户 2026-09-26 裁定）
          //    ⇒ 提交它会**覆盖掉配置文件里可能存在的值**。
          translateProvider: readModelPair('tr-model').provider,
          translateModel: readModelPair('tr-model').model,
          translateTemplate: val('tr-template', 'instruct'),
        }
        break

      default:
        // 🔴 **不静默提交空 body**：服务端对空 payload 返 400（"至少要给一个键"），
        //    但那时错误信息会很难懂。这里直接说清是**前端的单元没登记**。
        if (msg) msg.textContent = `内部错误：保存单元「${unit}」没有提交分支（请报告）。`
        toast(`保存单元「${unit}」没有提交分支`, true)
        btn.disabled = false
        return
    }
    const r = await postJson('/settings', payload)
    if (msg) msg.textContent = r.needsRestart ? '已保存——需要重启才生效' : '已保存——热重载将生效'
    toast(r.needsRestart ? '已保存；本 profile 需要重启才生效' : '已保存，数秒内热生效')
    // ⚠️ **不要**在这里假装"已经生效"：值要等热重载后由服务端重新读取。
    // 🔴 `keepMessage: true` —— 上面那行结果**必须留住**，否则刷新一冲就没了。
    // ⭐⭐ 决策 169：**只刷新本页**（不是整个设置面板）——
    //    否则会把别的页那行"已保存"一起冲掉。
    void openSettingsPage(state.setSub, { keepMessage: true })
  } catch (e) {
    if (msg) msg.textContent = `保存失败：${e.message}`
    toast(`保存失败：${e.message}`, true)
  } finally {
    btn.disabled = false
  }
}

/**
 * ⭐⭐⭐ **即时生效的开关**（用户 2026-10-07 裁定）：勾选/取消**立刻写配置**。
 *
 * 🔴 **为什么这两个不配保存按钮**：它们是"**一个勾选就是全部语义**"的独立开关
 *    （启用热知识注入 / 启用主动注入）—— 点了却还要再点一次"保存"是多余的。
 *    ⚠️ **反过来说，带配套参数的版块不能这么干**（见 `INSTANT_TOGGLES` 的注释）：
 *       那样会变成"每敲一个字符写一次盘"，且**半成品配置会被热重载吃进去**。
 *
 * 🔴🔴 **失败必须把勾选态弹回去**（与 `sink-git` 那条同一纪律）：
 *    写盘失败却让界面停在"已开启"⇒ **开关在说谎**，用户以为功能开了、其实没开。
 *    ⭐ 本项目既有裁定：环境不允许时**拒绝开启**，而不是"先记着、以后再试"。
 *
 * ⚠️ 成功/失败**都写回执行**（`settings-msg-<控件id>`）——与保存按钮同一套反馈位，
 *    这样用户不必猜"我刚才那下到底成没成"。
 */
function bindInstantToggles() {
  for (const [id, key] of INSTANT_TOGGLES) {
    const box = document.getElementById(id)
    if (!box) continue
    box.addEventListener('change', async () => {
      const want = box.checked
      const msg = document.getElementById(`settings-msg-${id}`)
      // ⭐⭐ **开之前先过守卫**（与"召回模型"保存时同一份判据，见 `activeModelMissing`）：
      //    主动注入开着却没选模型 = "看着在工作、其实一次都不判" ⇒ **拒绝开启**，
      //    并把勾选弹回去（不能让开关显示成已开启而功能不生效）。
      if (want && id === 'ai-on') {
        const bad = activeModelMissing()
        if (bad !== '') {
          box.checked = false
          if (msg) msg.textContent = bad
          toast(bad, true)
          return
        }
      }
      box.disabled = true
      if (msg) msg.textContent = '保存中…'
      try {
        const r = await postJson('/settings', { [key]: want })
        if (msg) msg.textContent = r.needsRestart ? '已保存——需要重启才生效' : '已保存——热重载将生效'
        toast(r.needsRestart ? '已保存；本 profile 需要重启才生效' : '已保存，数秒内热生效')
      } catch (e) {
        // ⚠️ **弹回原状**（不能让开关显示成"已开启"而配置里没写进去）。
        box.checked = !want
        if (msg) msg.textContent = `保存失败：${e.message}`
        toast(`保存失败：${e.message}`, true)
      } finally {
        box.disabled = false
      }
    })
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 启动
// ───────────────────────────────────────────────────────────────────────────

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab')
  if (btn) goto(btn.dataset.tab)
})
document.getElementById('subtabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.subtab')
  if (btn) {
    // ⭐ **切子标签也要先存位置**（决策 138）——这条路径**不经过 `navigate()`**
    //    （它只改显隐、不改 hash）⇒ 必须自己存，否则"待批 → 非法封面 → 待批"会丢位置。
    saveScroll()
    state.sub = btn.dataset.sub
    renderTabs()
    // ⭐ 决策 130：切到「待批」时要**把详情也画出来**——
    //    `renderTabs()` 只负责显隐，不管内容；不补这一步右侧会一直是空的。
    if (state.tab === 'review' && state.sub === 'pending') {
      renderPending()
      renderDetailAndRestore('review', currentId(), () => renderPendingDetail(currentId()))
    }
  }
})
// ⭐ 归档页的两个子导航页（决策 133）——**走 `navigate()`**，让 hash 跟着变
//    （刷新 / 分享链接都能落回同一个子页），随后由 `applyRoute()` 决定看哪一条。
document.getElementById('arc-subtabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.subtab')
  if (!btn || !btn.dataset.arcsub) return
  state.arcSub = btn.dataset.arcsub
  navigate(`#/archive/${state.arcSub}`)
})
window.addEventListener('hashchange', applyRoute)

// ⭐⭐ 设置入口（决策 169）：**切到设置视图**（不再是浮层）。
//    ⚠️ 走 goto() ⇒ 与其它标签同一条路径（hash 会跟着变、刷新能落回同一页）。
document.getElementById('settings-btn').addEventListener('click', () => goto('settings'))
// ⭐⭐ 设置页的**子导航**（决策 169）——与归档页同样走 navigate()
//    （让 hash 跟着变，刷新/分享都能落回同一个子页）。
document.getElementById('settings-subtabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.subtab')
  if (!btn || !btn.dataset.setsub) return
  state.setSub = btn.dataset.setsub
  navigate(`#/settings/${state.setSub}`)
})
// ⭐⭐ **每个设置版块各有一个保存按钮**——只提交本单元的键。
//    ⚠️ 单元粒度比子页细（见 `SAVE_UNITS`）；页级按钮已全部删除。
for (const b of document.querySelectorAll('.set-save')) {
  b.addEventListener('click', () => void saveSettings(b.dataset.savepage))
}
// ⭐⭐⭐ **总开关即时生效**（用户 2026-10-07）——两个总开关**没有保存按钮**。
bindInstantToggles()
// ⭐⭐⭐ **【决策模型配置】页的按钮绑定**（用户 2026-10-07，多 provider 化）。
//    🔴 **"保存密钥/测试连接/删除"都是每张卡片自己的按钮**（在 `buildJevEditor` 里
//       就地绑）—— 这里只绑**页面级**的两个：添加提供商、保存两条通路的选择。
//    理由：那三个动作**必须带上 provider id**，而 id 在卡片里；挂在页面级就得
//    再搞一个"当前选中谁"的状态（多一处可能与界面不一致的真相）。
document.getElementById('jev-add-provider')?.addEventListener('click', () => {
  void addJevProvider(document.getElementById('jev-config-msg'))
})
document.getElementById('jev-save-picks')?.addEventListener('click', () => void saveJevPicks())
// ⭐⭐⭐ 英文召回索引：「检查并补全」与「强制重建」（用户 2026-09-26 要求）。
//    ⚠️ 两个按钮**不是同一件事**：前者"有问题才补"，后者"无论如何都重建一次"。
//       ⇒ 分开两个按钮，避免把"检查"变成"每次点击都花钱翻译"。
document.getElementById('idx-check-btn')?.addEventListener('click', () => void checkEnIndex(false))
document.getElementById('idx-rebuild-btn')?.addEventListener('click', () => {
  // ⚠️ 强制重建会真花钱（可能触发翻译）⇒ 先确认（本项目一贯：有代价的动作要问一句）
  if (window.confirm('强制重建会重新体检索引，并对「缺译文 / 指纹过期」的条目重新翻译（可能产生费用）。继续？')) {
    void checkEnIndex(true)
  }
})
// ⭐⭐⭐ **「翻译模型 ↔ 翻译模板」改任一个都立刻重算配对警告**（用户 2026-10-07 要求：
//    *"如果选对应比如 mt 模版，但是没有响应的 mt 模型就要警告"*）。
//    ⚠️ 两个控件都要挂 —— 只挂模板那个的话，"先选模板再换模型"就看不到警告了。
for (const id of ['tr-model', 'tr-template']) {
  document.getElementById(id)?.addEventListener('change', () => refreshTranslatePairingWarn())
}
// ⭐⭐ 主动注入：**切通路就重填模型下拉框**（用户 2026-09-26）。
//    🔴 为什么必须重填：两条通路的候选**来源不同**（chat 走 DSH 模型路由、
//       jev 走 Knox 的 /v1/systemone）—— 留着上一个通路的模型名会**静默走错端点**。
document.getElementById('ai-channel')?.addEventListener('change', (e) => {
  void fillActiveModelSelect(e.target.value, '')
})
// ⭐⭐⭐ 知识评分：**切通路就重填复盘模型下拉框**（决策 178）。
//    🔴 同主动注入的理由：两条通路的候选来源不同（chat 走 DSH 路由、
//       jev 走 Knox）⇒ 留着上一个通路的模型名会**静默走错端点**。
//    ⚠️ 传空串 ⇒ **清空已选**（这正是"切通路"该有的行为，不是丢配置）。
document.getElementById('hs-channel')?.addEventListener('change', (e) => {
  void fillScoreModelSelect(e.target.value, '')
})
// ⭐⭐ 主动注入：勾选/取消时同步提示里那个数字（纯显示，不影响取值）。
document.getElementById('ai-calls')?.addEventListener('input', (e) => {
  const hint = document.getElementById('ai-calls-hint')
  if (hint) hint.textContent = String(e.target.value ?? '')
})
// ⭐⭐ git 开关：**打开时展开详情区并探测环境**（裁定 8：这块跟着开关走）。
//    ⚠️ 打开时只**探测**（只读），真正的 `init` 发生在保存时 —— 用户还没点保存
//       就建仓库是不合适的（开关本身也还没存进配置）。
document.getElementById('backup-git').addEventListener('change', (e) => {
  const on = e.target.checked
  const detail = document.getElementById('backup-detail')
  if (detail) detail.hidden = !on
  if (on) void loadBackupStatus()
})
document.getElementById('kb-filter').addEventListener('input', renderKbList)
document.getElementById('kb-kind').addEventListener('change', renderKbList)
document.getElementById('kb-project').addEventListener('change', renderKbList)
document.getElementById('kb-theme').addEventListener('change', renderKbList)

/**
 * ⭐⭐ **窄屏的「筛选」折叠按钮**（用户 2026-09-24 要求）。
 *
 * 用户原话：*"有左栏筛选的页面（知识库页面和热知识的项目热知识的编辑页），
 * 在窄屏时，默认把筛选区域收起，留【筛选】按钮，点击从上方滑出（占位）。"*
 *
 * 🔴 **开关状态记在 `data-open` 上、不记在 JS 变量里** ——
 *    这样 CSS 是唯一判据（本项目一贯：**状态只留一份**），
 *    且它**天然是"默认收起"**（没有这个属性就是收起态）。
 * ⚠️ **`aria-expanded` 要跟着改**（它是无障碍语义，也是我给展开态做视觉区分的依据）。
 * ⚠️ **不在宽屏时做任何事**：宽屏下 `.filter-body` 根本没有折叠规则
 *    （那条规则在媒体查询里），所以就算 `data-open` 不在，它也是展开的。
 *    反过来：**切到窄屏时会自动变成"收起"**（属性不在）⇒ 正好符合"默认收起"。
 *
 * @param toggleId - 「筛选」按钮的 id。
 * @param bodyId - 可折叠容器的 id。
 */
function bindFilterToggle(toggleId, bodyId) {
  const btn = document.getElementById(toggleId)
  const body = document.getElementById(bodyId)
  if (btn === null || body === null) return
  btn.addEventListener('click', () => {
    const open = body.getAttribute('data-open') !== '1'
    // ⚠️ **收起时移除属性**（而不是设成 `'0'`）—— 与"默认收起"同一个表示，
    //    免得出现"属性是 0 但看起来是收起"这种两套写法。
    if (open) body.setAttribute('data-open', '1')
    else body.removeAttribute('data-open')
    btn.setAttribute('aria-expanded', open ? 'true' : 'false')
  })
}
bindFilterToggle('kb-filter-toggle', 'kb-filter-body')
bindFilterToggle('hot-kb-filter-toggle', 'hot-kb-filter-body')
// ⭐ 会话实时状态页的「判定」按钮（用户 2026-09-24：*"判定与绑定板块默认收起，
//    留判定按钮，点击向下展开（占位）"*）—— **直接复用同一个函数**
//    （它的语义就是"点按钮切 `data-open` + 维护 `aria-expanded`"）。
bindFilterToggle('hot-live-bind-toggle', 'hot-live-bind-body')

/**
 * ⭐⭐ **窄屏：项目热知识编辑页的两个按钮**（用户 2026-09-24）。
 *
 * 用户原话：*"【返回项目列表按钮】固定在上方，下方打开页面时默认全屏展示项目热知识列表。
 * 右侧留【选择知识】按钮，点击从右侧滑出知识列表包括筛选和批量操作按钮（覆盖），
 * 右侧出现【热知识】按钮，点击收起知识列表。"*
 *
 * 🔴 **为什么另做一个「返回项目列表」按钮**（而不复用 `#hot-back-projects`）：
 *    原来那个在 `.side` 里，而窄屏下 `.side` 是**滑出层**（默认藏起来）
 *    ⇒ 用户一进来**看不到返回按钮**，就退不回去了。
 *    ⚠️ **不能给两个元素同一个 id**（HTML 里 id 必须唯一，否则
 *      `getElementById` 只返回第一个 ⇒ 另一个永远不生效，且不报错）。
 *    ⇒ 新 id `#narrow-back-projects`，**点击接到同一个处理逻辑上**（见下）。
 *    ⭐ 判据：**"同一个动作"可以用两个入口，但"同一个元素"不能有两个 id**。
 */
function bindNarrowEditorButtons() {
  // ① 「返回项目列表」：**与宽屏那个按钮走同一段逻辑**。
  //    ⚠️ 直接**转发点击**给原按钮（而不是把那段逻辑抄一份）——
  //      否则两个入口的行为迟早分叉（本项目铁律：实现只留一份）。
  const narrowBack = document.getElementById('narrow-back-projects')
  const realBack = document.getElementById('hot-back-projects')
  if (narrowBack !== null && realBack !== null) {
    narrowBack.addEventListener('click', () => realBack.click())
  }
  // ② 「选择知识」/「热知识」：切换左栏（`.side`）的滑入滑出。
  //    ⚠️ 与通用页**共用 `data-narrow-open` 这个属性**（同一套语义：
  //       "这一页的覆盖层开着"）⇒ 不另造状态。
  const picker = document.getElementById('narrow-picker-toggle')
  const editor = document.getElementById('hot-project-editor')
  if (picker === null || editor === null) return
  const syncLabel = () => {
    const open = editor.getAttribute('data-narrow-open') === '1'
    // ⭐ 用户明确要求：展开时那个位置显示【热知识】（点它收起）。
    picker.textContent = open ? '热知识' : '选择知识'
    picker.setAttribute('aria-expanded', open ? 'true' : 'false')
  }
  picker.addEventListener('click', () => {
    if (editor.getAttribute('data-narrow-open') === '1') editor.removeAttribute('data-narrow-open')
    else editor.setAttribute('data-narrow-open', '1')
    syncLabel()
  })
  // ⚠️ **每次进编辑页都要把标签复位**（用户可能上次离开时是展开态）
  //    ⇒ 由 `openHotProject` 调一次（见那里的调用）。
  hotState.syncNarrowPickerLabel = syncLabel
  syncLabel()
}
// 🔴🔴 **不要在这里调用 `bindNarrowEditorButtons()`！**
//    它内部访问 `hotState`（定义在文件更早的 `const`），**本行位置在它之前**
//    ⇒ 立即调用会撞 TDZ（`Cannot access 'hotState' before initialization`），
//      而且那个错会让**本行之后的所有顶层语句全部不执行**
//      ⇒ 实测后果：**热知识页的子导航绑定丢失、整页渲染不出来**。
//    ⭐ 调用放在**文件最末尾**（那里所有 `const` 都已初始化）。
//    ⚠️ 我第一版就是写在这里的，代价是"热知识页整个坏掉"——已修。

/**
 * ⭐ **窄屏下不给"知识列表的详情页"功能**（用户 2026-09-24：
 *    *"窄屏就不给知识列表的详情页功能了。"*）。
 *
 * 🔴 **为什么要显式判一下**：左栏每张卡都绑了"点卡片 ⇒ 就地展开正文"
 *    （第四十九批加的）。窄屏下左栏是**从右侧滑出的覆盖层**，
 *    再在它里面展开正文块会**极其局促**（半屏宽里塞一个正文区）——
 *    用户明确说不要。
 * ⚠️ **判据用 `isNarrow()`**（与 CSS 断点同一个 900），不在别处另写数字。
 * @returns 是否应当**跳过**详情展开（true = 窄屏，不展开）。
 */
function skipEntryDetailOnNarrow() {
  return isNarrow()
}

// ⭐ 归档页的搜索框（决策 133）——只过滤**列表**，不改选中项
//   （与知识库页一致：搜索是"缩小范围"，不是"换一条看"）。
document.getElementById('arc-filter').addEventListener('input', renderArchiveEntryList)

// `?session=` 由热知识页消费（决策 90 预留、热知识方案落地）——
// ⚠️ 具体的读取与渲染在上面的热知识页代码里（`hotSessionId` / `renderHotPage`）。

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐ 热知识页（热知识方案 §8）
//
// 🔴 **三个子导航**（用户裁定）：会话实时状态 / 全局热知识 / 项目热知识。
// ⚠️ 与审批页的 `data-sub`、归档页的 `data-arcsub` **分开命名**（`data-hotsub`），
//    否则三页的子标签会互相抢 `active`（本项目踩过同族坑）。
// ══════════════════════════════════════════════════════════════════════════

/** 三个子导航的 id（顺序即显示顺序）。 */
const HOT_SUBTABS = ['live', 'global', 'project']

/**
 * ⭐⭐ **当前会话 id**（热知识页的"当前会话"）。
 *
 * 来源有两个，**后者覆盖前者**：
 * 1. `?session=`（打开这个标签页那一刻烘焙进 URL 的）；
 * 2. ⭐ **`BroadcastChannel` 的实时广播**（用户 2026-09-22 要求：
 *    "我在 dsh 切换会话的时候，前端就要去获取到 sessionId"）。
 *
 * 🔴 **为什么必须有第 2 条**：本页是**独立标签页**，`?session=` 是**打开那一刻**的快照
 * ⇒ 之后在 DSH 里切会话，这个页面**不知道**，会一直对着旧会话显示状态、写绑定。
 *
 * ⚠️ **所以必须是 `let`**（会被广播改）；每次改完都要**重新渲染热知识页**。
 * ⚠️ **降级**：`BroadcastChannel` 不通时（不同浏览器 / 无痕窗口）页面就停在打开时的值
 * —— **不静默**：页面上始终显示着会话 id，用户看得见自己在看哪一个。
 */
let hotSessionId = new URLSearchParams(location.search).get('session') ?? ''

/**
 * ⭐ 监听 DSH 主页面广播的"当前会话变了"。
 *
 * ⚠️ **频道名与 `client/index.tsx` 的 `HOT_CHANNEL` 必须一致**（两边都写死 `'dsh-memj'`）。
 * ⚠️ **只在值真的变了时才重渲染**（否则每次广播都白重画一遍）。
 */
try {
  const hotCh = new BroadcastChannel('dsh-memj')
  hotCh.addEventListener('message', (e) => {
    const next = e?.data?.type === 'session' ? e.data.sessionId : undefined
    if (typeof next !== 'string' || next === '' || next === hotSessionId) return
    hotSessionId = next
    // ⭐ 顺带把地址栏的 `?session=` 也换掉（用 `replaceState`：**不产生历史** ——
    //    本项目既有纪律，条目 `59df519e`：hash/URL 赋值会污染历史）。
    try {
      const u = new URL(location.href)
      u.searchParams.set('session', next)
      history.replaceState(null, '', u)
    } catch { /* 改不动地址栏不影响功能 */ }
    // ⭐ 重新渲染。⚠️ 用 `typeof` 守卫：本段在 `renderHotPage` 定义之前执行
    //    （函数声明会提升，但守卫让意图更清楚、也不怕将来改成 const 箭头函数）。
    if (typeof renderHotPage === 'function') renderHotPage()
  })
} catch {
  /* 不支持 BroadcastChannel ⇒ 退化为"打开时的会话"（页面会显示 id，用户看得见） */
}

/** 热知识页的本地状态（**纯前端**，不落盘）。 */
const hotState = {
  sub: 'live',
  /** `/hot` 的返回（实时状态页）。 */
  info: null,
  /** 当前正在编辑的项目 id（`''` = 还在项目列表那一层）。 */
  project: '',
  /** 项目列表（第一层）。 */
  projects: [],
  /** 全局知识清单。 */
  globals: [],
  /** 画像条目。 */
  persona: [],
  /** 项目编辑页左侧筛选器选中态。 */
  pickFilter: { q: '', kind: '', project: '', theme: '' },
  /**
   * ⭐ **待补设的项目筛选值**（用户 2026-09-24："筛选应该默认选当前判定的项目"）。
   *
   * 🔴 **为什么需要它**：`openHotProject` 想给 `#hot-kb-project` 设值时，
   *    `<option>` 可能**还没铺**（`fill()` 在数据加载完之后才跑）⇒
   *    给一个不存在的 value 赋给 `<select>`，浏览器会把 value 设成 `''`
   *    ⇒ **数据源筛本项目、下拉框却显示『全部项目』**（界面撒谎）。
   * ⚠️ 所以设失败时把值留在这里，由 `fill()` 铺完选项后**补设一次**；
   *    设成功则清空（绝大多数情况走这条）。
   */
  pendingProjectFilter: '',
  /**
   * ⭐⭐ **当前在右栏展开正文的那条**（封面 id）；`''` = 没展开。
   *
   * 🔴 **为什么必须是显式状态、不能靠 DOM 反推**：
   * 左栏列表**每次重渲染都会重建 DOM**（`renderHotKbList` 里 `replaceChildren`）
   * ⇒ 若把"展开态"记在某个元素上，重画后**就丢了**（本项目记过同族坑：
   * "丢位置的真正原因是重画"）。
   * ⚠️ 且它是**逐条**的：展开 B 时 A 自动收起（`toggleHotEntryDetail` 里保证）。
   */
  openEntry: '',
  /**
   * ⭐⭐⭐ **知识评分开关（`hotScoreOnTurnEnd`）的当前值**（决策 184）。
   *
   * 🔴🔴 **为什么项目热知识页需要知道它**：开关**打开**时，注入侧按当初的裁定
   *    「**替换**」——项目层与主题层被**评分榜前 N 名**整个替换掉
   *    ⇒ ⭐ **那份手工清单（`selection.json`）根本不再参与注入**。
   *    ⚠️ 而页面当时还在显示它、还在让人「加入列表」⇒ **界面在展示一份已失效的清单**
   *    （用户实测报告：*"我看到把知识加入到会话实时状态了，但是项目热知识页面
   *    还是没有加入啊。……要不然，用户会迷茫的。"*）。
   * ⇒ ⭐ 开关打开时那一块**改成一段说明**（把真实情况讲清 + 指向实时状态页）；
   *    关掉后**自动恢复**显示手工清单（**不删数据**，只是不显示）。
   * ⚠️ **它必须是"页面真去读一次设置"**，不能靠缓存的旧值 ——
   *    否则在设置页改完开关回到这页，显示的还是旧状态（本项目记过同族坑：
   *    "同一数据存两份缓存导致刷新半生效"）。
   */
  scoreOn: false,
  /**
   * ⭐⭐ **三块列表里"就地展开了正文"的那些条目**（用户 2026-09-23 要求）。
   *
   * 三个分组（与 `attachBodyToggle` 的 `scope` 一一对应）：
   *  · `live` —— 会话实时状态页的清单；
   *  · `sel`  —— 项目热知识页**右栏**的「本项目热知识」；
   *  · `gelo` —— 项目热知识页**右栏**的「全局热知识」那块（只含全局知识；
   *    ⚠️ **画像不在这套机制里**，它点击只弹提示）。
   *
   * ⚠️ **key**：封面条目用封面 id；**画像用它的指纹 `fp`**（画像没有封面 id）。
   *
   * 🔴 **为什么必须记在 JS 状态里、不能靠 DOM 反推**：这几个列表**每次操作都会重画**
   *    （置顶 / 改形态 / 移出 / 加入 / 切筛选器都调 `renderHotEditor`）
   *    ⇒ 记在元素上会在重画时丢掉（本项目记过同族坑："丢位置的真正原因是重画"）。
   *
   * ⭐ **多条可同时展开**（与「全局热知识」页一致：那页每张卡各开各的，不互斥）
   *    ⇒ 用 `Set` 而不是单个 id。
   */
  expanded: { live: new Set(), sel: new Set(), gelo: new Set() },
  /**
   * ⭐ **本项目清单当前涉及的全部封面 id**（批量操作判"哪些已在清单里"用）。
   *
   * 🔴 **为什么不现查**：左栏卡片"该显示『加入列表』还是『移出列表』"与
   *    批量按钮的可用状态**都读它**，而 `renderHotEditor` 本来就已经拿到这份 id 列表了
   *    ⇒ 存下来避免**同一份事实算出两份**（本项目铁律：实现只留一份）。
   */
  selectionIds: new Set(),
  /**
   * ⭐ **本项目清单的整份 entries**（`[{ id, shape, pinnedAt }]`）。
   *
   * 🔴 **为什么不能只有 `selectionIds`**：「全部移出」要判**哪几条是置顶的**
   *    （用户要求"除了置顶的"）⇒ 光有 id 判不了。
   * ⚠️ **置顶与否是服务端给的**（`/hot/selection`）⇒ 这里只是记下来，不另算一份。
   */
  selectionEntries: [],
  /** ⭐ **本轮筛选出来的 id**（批量加入的目标；由 `syncHotBulkRow` 记）。 */
  bulkCandidates: [],
  /** ⭐ **清单现状的字符数**（超预算警告的基数；由 `renderHotEditor` 记）。 */
  bulkCharsNow: 0,
}

/**
 * ⭐⭐ **把一张卡片变成「整卡可点 ⇒ 就地展开正文」**（用户 2026-09-23 要求，
 *    形态与「全局热知识」页的**全局知识卡完全一致**）。
 *
 * 形态三条（与那一页逐条对齐）：
 *  ① 头部是 `.item-head`：**标题靠左、chevron 靠右**（chevron 随开合切 `▾` / `▴`）；
 *  ② **点卡片任意处**（标题、标签、空白）都切换，**点里面的按钮不算**；
 *  ③ 展开的正文放进 `<pre class="hot-body">` —— ⭐ **不渲染 markdown**
 *    （用户明确说"不需要渲染"；要渲染的那种是第五十批的「右栏正文详情」）。
 *
 * 🔴 **展开态记在 `hotState.expanded[scope]`，不记在元素上**——理由见那里的注释。
 *    ⚠️ 所以本函数初始化时会**按记账恢复**（含重新取一次正文）。
 *
 * ⚠️ **正文按需取**（首次展开时才请求）：不展开的条目**一个字节都不请求**。
 *
 * @param card - 卡片元素（点击热区 = **整张卡**）。
 * @param opts.scope - 记账分组：`'live'` / `'sel'` / `'gelo'`。
 * @param opts.key - 这一条的稳定标识（封面 id，或画像的指纹 `fp`）；
 *   ⚠️ **空串 = 不记账**（见下面的 `canRemember`）。
 * @param opts.title - 标题文本。
 * @param opts.load - 取正文的异步函数；返回空串 = 没有正文。
 * @param opts.emptyText - 没有正文时显示的文案。
 * @returns `{ head, body }` —— 调用方负责 append 到卡片里
 *   （`head` 在最前、`body` 在最后，与「全局热知识」页**同序**）。
 */
function attachBodyToggle(card, opts) {
  const store = hotState.expanded[opts.scope]
  /**
   * 🔴 **key 为空 ⇒ 不记账**（退化：展开态不跨重画保留）。
   *    为什么不能凑一个 key：`Set` 里所有空 key 会**互相串台**——
   *    展开 A，重画后 B、C 也跟着显示成展开（它们 key 都是 `''`）。
   *    ⚠️ 什么时候会空：画像正文不足 8 字符时 `personaFingerprint()` 返回空串。
   *    退让的代价只是"重画后收起"，**串台才是不能接受的**。
   */
  const canRemember = opts.key !== ''
  const chevron = h('span', { class: 'card-chevron', text: '▾' })
  const head = h('div', { class: 'item-head' },
    h('div', { class: 'item-title', text: opts.title }), chevron)
  const body = h('pre', { class: 'hot-body' })
  body.hidden = true
  // ⚠️ `loaded` 与"展开态"是**两件事**：收起再展开**不该**重新请求一次。
  let loaded = false

  const setOpen = (open) => {
    body.hidden = !open
    chevron.textContent = open ? '▴' : '▾'
    if (!canRemember) return
    if (open) store.add(opts.key)
    else store.delete(opts.key)
  }
  const load = async () => {
    if (loaded) return
    loaded = true
    // ⚠️ 先给"加载中"（正文要读盘 + 走一次接口），免得看着像点了没反应。
    body.textContent = '加载中…'
    try {
      const text = await opts.load()
      body.textContent = text.trim() === '' ? opts.emptyText : text
    } catch (e) {
      // ⚠️ 失败**不静默**（本项目一贯）——否则看着像"这条没有正文"。
      body.textContent = `正文加载失败：${e.message}`
    }
  }
  card.addEventListener('click', (e) => {
    // 🔴 **点里面的按钮不算**（「置顶」/「改为标题形态」/「移出列表」/「加入列表」
    //    各自执行动作）——与既有卡片同一判据（`closest('button')`）。
    if (e.target instanceof Element && e.target.closest('button') !== null) return
    const open = body.hidden   // 当前收起 ⇒ 要展开
    setOpen(open)
    if (open) void load()
  })

  // ⭐ 重画后**按记账恢复**（这几个列表每次操作都会重建 DOM）。
  if (canRemember && store.has(opts.key)) {
    setOpen(true)
    void load()
  }
  return { head, body }
}

/**
 * ⭐ **取一条知识条目的正文**（就地展开用）。
 *
 * ⚠️ 走 `/entry`（**与「右栏正文详情」同一个接口**，不另开数据源）。
 * 🔴 **空正文要分清两种原因**（本项目一贯：不撒谎）：
 *    · **外链读不到**（库外文件被移动/删除）⇒ 如实说明；
 *    · **内链本来就没有正文** ⇒ 返回空串，由调用方显示它自己的空态文案。
 */
async function loadEntryBody(id) {
  const data = await getJson(`/entry?id=${encodeURIComponent(id)}`)
  const body = typeof data.body === 'string' ? data.body : ''
  if (body.trim() !== '') return body
  return data.cover?.ext === true
    ? '这条是外部引用，且库外文件读不到正文（文件可能已被移动或删除）。'
    : ''
}

/**
 * ⭐ **按指纹取一条画像的正文**（就地展开用）。
 *
 * 🔴 **为什么用指纹而不是 id**：`/hot` 的 `items` 里**画像的 `id` 是空串**
 *    （它没有封面 id）——服务端就是**拿指纹当画像的身份**的
 *    （见 `hot-inject.ts` 的 `HotPreviewItem.fp`）。
 *
 * ⚠️ **匹配方式刻意写成"前缀"**：服务端给的 `fp` 就是**正文前 60 字符**
 *    ⇒ `t === fp || t.startsWith(fp)` 两条即可命中，
 *    **不必在这里重写一遍"取前 60 字符、不足 8 字符算空"的规则**
 *    （那是服务端的实现，抄一份过来迟早漂移）。
 *
 * ⚠️ **`fp` 为空串**（正文不足 8 字符时服务端不给指纹）⇒ 退回**按标题匹配**
 *    （标题 = 正文首行的显示口径，服务端已算好并传进来）。
 * @param fp - 指纹（来自 `/hot` 的 `items[].fp`）。
 * @param title - 标题（仅 `fp` 为空时作为兜底判据）。
 */
async function loadPersonaText(fp, title) {
  const r = await getJson('/hot/persona')
  const items = r.items ?? []
  const firstLine = (t) => (String(t ?? '').trim().split('\n')[0] ?? '').trim().slice(0, 80) || '(空)'
  const hit = fp !== ''
    ? items.find((p) => {
      const t = String(p.text ?? '').trim()
      return t === fp || t.startsWith(fp)
    })
    : items.find((p) => firstLine(p.text) === title)
  return String(hit?.text ?? '')
}

/** 切换热知识页的子导航。 */
function renderHotSubtabs() {
  for (const s of HOT_SUBTABS) {
    const btn = document.querySelector(`.subtab[data-hotsub="${s}"]`)
    if (btn) btn.classList.toggle('active', s === hotState.sub)
    const panel = document.getElementById(`hotsub-${s}`)
    if (panel) panel.hidden = s !== hotState.sub
  }
}

/**
 * 拉一次 `/hot`（实时状态页的数据源）。
 *
 * ⚠️ **没有 `?session=` 时也要拉**——`/hot` 会回**全局配置**（判定开关、预算口径），
 *    那些与会话无关。🔴 实测踩到：原来无 session 就直接 return ⇒ 页面把
 *    "比例" 显示成 `?? 0` 兜底的 **0**（而实际是 0.333）⇒ **界面在撒谎**。
 */
async function loadHotInfo() {
  const q = hotSessionId === '' ? '' : `?session=${encodeURIComponent(hotSessionId)}`
  try {
    hotState.info = await getJson(`/hot${q}`)
  } catch {
    hotState.info = null
  }
  // ⭐⭐⭐ **顺手读一次"知识评分开关"**（决策 184）——
  //    项目热知识页要用它决定"显示手工清单"还是"显示自动注入的说明"。
  //    🔴 **必须真去读设置**，不能用缓存：在设置页改完开关回到这页时，
  //       缓存里的旧值会让**显示与实际相反**（本项目记过"两份缓存 ⇒ 刷新半生效"）。
  //    ⚠️ **读失败 ⇒ 保守地当成"关"**（显示手工清单）—— 那是**旧行为**，
  //       而在"开关其实开着"时显示清单只是多显示了一份不生效的数据，
  //       比"开关关着却hid了清单"（用户看不到自己设的东西）轻。
  try {
    const s = await getJson('/settings')
    hotState.scoreOn = s.hotScoreOnTurnEnd === true
  } catch {
    hotState.scoreOn = false
  }
}

/** 渲染子页①：会话实时状态。 */
async function renderHotLive() {
  // ⭐ 当前会话状态**不再单占一块**（用户 2026-09-23 裁定）：它现在是「判定与绑定」块
  //    最下面的**动态描述**（`#hot-live-status`）。
  //    ⚠️ `#hot-live-session` 仍留着，但**只在"未带 ?session="的空态**里用
  //    （详见下方分支）——那种情况没有"当前会话"可言，提示放在块外更合适。
  const emptyBox = document.getElementById('hot-live-empty')
  const sess = document.getElementById('hot-live-session')
  const status = document.getElementById('hot-live-status')
  const list = document.getElementById('hot-live-list')
  // 🔴 **守卫里不能再含 `budget`**：预算区已按用户裁定搬去设置面板，
  //    那个元素**不存在了** ⇒ 若还守在守卫里，`getElementById` 返回 null
  //    ⇒ **整个实时状态页直接 return、什么都不渲染**（实测踩到）。
  if (status === null || list === null) return

  // 总开关（**显著位置**，裁定 H-1）
  const master = document.getElementById('hot-master')
  const masterMsg = document.getElementById('hot-master-msg')

  // ⚠️ **无论有没有 `?session=`，判定开关与预算都要能显示**——
  //    它们是**全局设置**，不是"某会话的事实"。
  //    🔴 实测踩到：原来无 `?session=` 时直接 return ⇒ 开关显示成"全未勾选"
  //       （而服务端默认 `doc-reads` 是 true）⇒ **界面在撒谎**。
  const applyGlobalBits = (info) => {
    if (master) master.checked = info?.inject === true
    if (masterMsg) masterMsg.textContent = info?.inject === true ? '' : '（当前未启用，不会注入任何内容）'
    const cbDoc = document.getElementById('hot-detect-docreads')
    const cbLlm = document.getElementById('hot-detect-llm')
    // ⚠️ 服务端读不到时才退回"服务端默认值"（doc-reads 开、LLM 关）——
    //    **不能**让界面显示成"全不勾"（那与真实配置不符 = 撒谎）。
    if (cbDoc) cbDoc.checked = info === null ? true : info.detect?.docReads === true
    if (cbLlm) cbLlm.checked = info === null ? false : info.detect?.llm === true
    // 🔴 **这里原来还有一段渲染 `#hot-detect-note`**（"② 已开启…会产生 token 成本" /
    //    "② 未开启（当前只有 ① 可用，零成本）"）—— 已按用户 2026-09-23 要求**删除**。
    //    用户原话："两个开关下面这行描述都不要了。不需要给用户再额外解释成本了，
    //    开关后面的描述已经解释过了。"
    //    ⭐ **连元素带渲染一起删**（本项目铁律：删变量/DOM 元素要把引用点一起清掉——
    //      曾因残留引用让整段渲染静默中断，连踩两次）。
    // ⚠️ **预算不在这里显示**（用户 2026-09-22 裁定：
    //    "预算应该有旋钮设置，应该把设置放到记忆库页的设置面板去。
    //      不要再会话实时状态页去显示。"）
    //    ⇒ 上限/比例/阈值都搬去「设置」面板了；本页只显示**判定开关**。
    //
    // 🔴🔴 **这里曾经写着一句 `void budget`** —— 而 `budget` 是**已删除的变量**
    //    ⇒ 引用它抛 `ReferenceError` ⇒ **`applyGlobalBits` 整个中断**
    //    ⇒ 它后面的「当前会话 / 判定项目」那一行**再也不会渲染**
    //    （用户实测报告："这里空白处，之前显示会话的项目匹配状态，咋没了"）。
    //    ⭐ 判据：**删一个变量时，要把它所有的引用点一起删**——
    //      包括这种"看起来无害"的占位引用。
  }

  if (hotSessionId === '') {
    // ⭐ **空态**：没有会话 id ⇒ 此时"判定与绑定"块里没有"当前会话"可言。
    //    ⇒ 把说明放在**块外**（`#hot-live-empty`），并**隐藏块内那条状态行**
    //      （否则会出现两处讲同一件事、其中一处还是空的）。
    if (emptyBox) emptyBox.hidden = false
    if (sess) {
      sess.textContent = '本页面 URL 上未带 ?session= 参数 ⇒ 无法显示"当前会话"的实时状态。'
      sess.className = 'hint'
    }
    if (status) status.hidden = true
    list.replaceChildren(h('div', { class: 'empty', text: '请从会话侧边栏的「memj 记忆库」入口打开本页。' }))
    // ⭐ 仍然显示**全局设置**（判定开关 + 预算口径）。
    await loadHotInfo()
    applyGlobalBits(hotState.info)
    return
  }
  // ⭐ 有会话 ⇒ **收掉块外那段**，状态改在块内显示（用户 2026-09-23 要求）。
  if (emptyBox) emptyBox.hidden = true
  await loadHotInfo()
  const info = hotState.info
  if (info === null) {
    if (status) {
      status.hidden = false
      status.replaceChildren(h('div', { text: `当前会话：${hotSessionId}` }))
      status.append(h('div', { class: 'dim small', text: '加载失败（服务端未生效或接口未注册）。' }))
    }
    list.replaceChildren(h('div', { class: 'empty', text: '加载失败（服务端未生效或接口未注册）。' }))
    return
  }

  applyGlobalBits(info)

  const pv = info.preview
  const bound = info.bound
  // ⭐ 状态作为「判定与绑定」块的**动态描述**渲染（用户 2026-09-23 裁定）。
  if (status) {
    status.hidden = false
    status.replaceChildren()
    // ⭐⭐ **顺序与层级**（用户 2026-09-23 第二次调整）：
    //    · **判定项目**（这一块真正要回答的问题）⇒ **正文样式、放上面**；
    //    · **当前会话**（会话 id 属于"环境信息"，是佐证）⇒ **动态描述、放下面**。
    //    ⚠️ 第一版反了（会话在上面、判定在下面）——用户当场纠正：
    //       "判定项目那一条应该是正文样式在上面，当前会话那条作为动态描述信息放下面"。
    //    ⭐ 判据：**哪一条是这个块的"结论"，哪一条是"上下文"** ——
    //       结论给正文口径、上下文给小灰字。
    //
    // ⚠️ 绑定来源要**如实**显示（否则用户分不清"是我定的还是它自己猜的"）。
    const srcLabel = bound === null || bound === undefined
      ? '未判定出项目（只注入 全局 + 画像）'
      // ⭐⭐ 来源标签要**分清"我自己的证据"与"继承来的"** ——
      //    `inherited` 是本会话为子代理时**从父会话继承**的项目，
      //    与"它自己 handoff 过 / 读过文档"是**完全不同的两件事**。
      //    🔴 不区分的话，用户会以为这个子会话自己判定出了项目。
      : `判定项目：\`${bound.project}\`（来源：${
        bound.source === 'manual' ? '手动绑定'
          : bound.source === 'doc-reads' ? 'doc-reads 自动'
            : bound.source === 'inherited' ? '继承自父会话（本会话是子代理）'
              : bound.source}）`
    status.append(h('div', { text: srcLabel }))
    status.append(h('div', { class: 'dim small', text: `当前会话：${hotSessionId}` }))
  }

  // ⭐⭐ **下拉框要跟着"当前实际判定结果"走**（用户 2026-09-22 报告）。
  //
  // 🔴 **原来的 bug**：只 `fill()` 了选项、**从没设过 `value`**
  //    ⇒ 下拉框永远停在第一项「（未知）」。
  //    于是同一块里出现**自相矛盾**：上面写着"判定项目：`dsh-memj`（来源：手动绑定）"，
  //    下面却显示「（未知）」⇒ 用户原话："看起来很有歧义"。
  //
  // ⭐ **判据**：下拉框回答的是"**现在**这个会话算哪个项目"，
  //    所以取值必须是 `info.bound.project`（**不管它是手动绑的还是判出来的**）；
  //    没绑定/判不出 ⇒ 落到「（未知）」（那个 option 的 `value` 就是空串）。
  // ⚠️ **选项还没铺好时不设**（`renderHotPage` 里先 `fill` 再调本函数；
  //    但刷新时可能顺序反过来）⇒ 先确保 option 存在，否则设了也会被浏览器忽略。
  {
    const sel = document.getElementById('hot-bind-project')
    if (sel) {
      const want = bound !== null && bound !== undefined ? String(bound.project ?? '') : ''
      // ⚠️ 只认**选项里真的有**的值：绑定指向一个已删/已归档项目时，
      //    硬设会变成"根本没有选中项"（浏览器显示空白，比显示未知更糟）。
      const has = [...sel.options].some((o) => o.value === want)
      sel.value = has ? want : ''
    }
  }

  // ⚠️ 判定开关与预算已由上面的 `applyGlobalBits()` 统一渲染（**不在这里重复画**）。

  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐ 条目清单：**本会话会注入的全部条目**（用户 2026-09-22 要求）
  //
  // 🔴🔴 **原来这里是坏的，两个问题**：
  //  1. 只拿到一串**封面 UUID**（`preview.expected`）⇒ 直接当标题渲染
  //     ⇒ 列表里是一列裸 id，**没有标题、看不出类型与形态**；
  //  2. **画像根本没有封面 id** ⇒ 它在列表里**没有位置**（永远看不见），
  //     尽管它每轮都在注入。
  //
  // ⭐ 现在服务端 `/hot` 的 `items` 给出**结构化条目**
  //   （`{ type, title, shape, fp }`），且**与「项目热知识」页同源**
  //   （都来自 `collectHotItems` + `buildHotInjection`）⇒ 两页不会互相矛盾。
  //
  // ⭐ 三列（用户点名的）：**类型** / **注入形式** / **注入状态**。
  // ══════════════════════════════════════════════════════════════════════
  // ⚠️ **窗口快照取 `info.window`**（服务端已把 `Set` 转成数组）——
  //    不能用 `pv.window`：它里面的 `present` 是 JS `Set`，
  //    经 JSON 序列化会变成 **`{}`** ⇒ `present.includes` 抛 TypeError
  //    ⇒ **整段列表渲染中断**（本项目实测踩到，见 `api.ts` 那里的注释）。
  const win = info.window ?? null
  const present = Array.isArray(win?.present) ? win.present : []
  const items = info.items ?? []
  const expectedFps = pv?.expected ?? []
  // ⚠️ **预算块已按用户裁定移除**（搬去设置面板），但**超限提醒不能丢**（裁定 4）
  //    ⇒ 并进清单的计数行：那是"这个会话要注入多少"的**状态**，不是"预算是多少"的**设置**。
  const used = pv?.chars ?? 0
  const cap = info.budget?.chars ?? 0
  const over = cap > 0 && used > cap
  const listHead = document.getElementById('hot-live-count')
  if (listHead) {
    listHead.replaceChildren()
    listHead.append(h('span', {
      class: over ? 'hot-over' : 'dim small',
      text: `共 ${items.length} 条，约 ${used} 字符`
        + (over ? `　⚠️ 已超上限 ${used - cap} —— 请自行精简条目（不会自动裁剪）` : ''),
    }))
    listHead.className = 'count'
  }
  list.replaceChildren()
  if (items.length === 0) {
    list.append(h('div', {
      class: 'empty',
      text: bound === null || bound === undefined
        ? '本会话还没判定出项目 ⇒ 只会注入「画像」与「全局知识」，而它们目前都是空的。'
        : '本项目还没有热知识会注入：① 全局知识（在「全局热知识」页纳入）；'
          + '② 项目/主题知识（在「项目热知识」页加入清单）。',
    }))
    return
  }
  /**
   * ⭐ **类型标签**（用户点名的四类）。
   * ⚠️ 与 `HotPreviewItem.type` 一一对应；**未知类型如实显示原文**
   *    （不静默吞掉——本项目一贯）。
   */
  const TYPE_LABEL = {
    persona: '画像',
    global: '全局知识',
    theme: '主题知识',
    project: '项目知识',
  }
  for (const it of items) {
    // ⭐⭐ **整卡可点 ⇒ 就地展开正文**（用户 2026-09-23：
    //    *"会话实时状态页的列表块……点击时，全都应该像全局热知识页那样展开显示其正文
    //      （不需要渲染）"*）——形态与「全局热知识」页**逐条对齐**。
    const card = h('div', { class: 'item', 'data-clickable': '1' })
    // ⚠️ 画像没有 id ⇒ 标题用它的正文首行（服务端已算好，与「全局热知识」页同口径）。
    //    ⚠️ 记账 key 也是：**画像用 `fp`（指纹）、封面条目用封面 id**。
    const isPersona = it.type === 'persona'
    const key = isPersona ? (it.fp ?? '') : (it.id ?? '')
    const { head, body } = attachBodyToggle(card, {
      scope: 'live',
      key,
      title: it.title || '(无标题)',
      load: () => (isPersona ? loadPersonaText(it.fp ?? '', it.title ?? '') : loadEntryBody(it.id ?? '')),
      emptyText: isPersona ? '（这条画像是空的）' : '这条没有正文（或正文为空）。',
    })
    card.append(head)
    const meta = h('div', { class: 'meta' })
    // ── 第 1 列：类型（四类，用户点名的） ──
    meta.append(h('span', {
      class: 'tag kind',
      text: TYPE_LABEL[it.type] ?? String(it.type ?? ''),
    }))
    // ── 第 2 列：注入形式（正文形态 / 标题形态） ──
    meta.append(h('span', {
      class: 'tag',
      text: it.shape === 'full' ? '正文形态' : '标题形态',
    }))
    // ── 第 3 列：注入状态 ──
    //
    // 🔴 **判据是"模型当前窗口里还在不在"**（= 最近一次真实出网消息的判定结果），
    //    **不是**插件的"打算注入"。用户 2026-09-22 裁定：
    //    **"没有就是未注入，丢了也是未注入，不需要做专门区分"**
    //    ⇒ 只有两态（原来有三态，含"已丢失·待补"）。
    // ⚠️ 画像用它的**文本指纹**（`fp`）判定，封面条目用封面 id —— 服务端已统一。
    const fp = it.fp ?? ''
    const inWin = win !== null && fp !== '' && present.includes(fp)
    meta.append(h('span', {
      class: inWin ? 'tag global' : 'tag missing',
      text: inWin ? '已注入' : '未注入',
    }))
    card.append(meta)
    card.append(body)
    list.append(card)
  }
  if (win) {
    const n = expectedFps.filter((fp) => present.includes(fp)).length
    // ⭐⭐ **如实说明快照的来源**（2026-09-23 加，用户实测反馈）。
    //
    // 🔴 **原来这里在撒谎**：内存快照"进程重启即失" ⇒ 重启后 `win` 为空
    //    ⇒ 走下面的 `else` 分支、把**每一条**都显示成「未注入」，
    //    而**注入内容其实还在会话里**（实测：本会话日志里最近一次注入含 14 个 id）。
    //    用户原话：*"只要重新启动之后，已注入的内容就会显示未注入，那这是不对的哇？"*
    // ⇒ 现在服务端会**从会话日志重建**，这里据 `windowSource` 说清是哪种。
    const fromLog = info.windowSource === 'log'
    list.append(h('div', {
      class: 'dim small',
      // ⚠️ 判据要说清来源（本项目一贯）——
      //    `memory` 是"最近一次真实出网"的直接结论；`log` 是重启后从会话日志重建的。
      text: fromLog
        ? `注入状态**由会话日志重建**（内存快照已随 DSH 重启丢失）：在窗口 ${n} 条 / 共 ${items.length} 条。`
          + `⭐ 结论与平时同一判据（看注入文本里有没有那条的 id），所以对得上。`
          + `⚠️ 它是"最后一次注入时的状态"，不是此刻的实时值——下次出网后自动换成实时快照。`
        : `注入状态取自最近一次出网（${win.at ?? ''}）：在窗口 ${n} 条 / 共 ${items.length} 条。`,
    }))
  } else {
    list.append(h('div', {
      class: 'dim small',
      // ⚠️ **只有"真的判不出来"才显示这段**（例如全新会话从没注入过）——
      //    重启不再落进这里（那由服务端从日志重建）。
      text: '本会话的日志里没有 memj 注入记录（新会话 / 从未注入过）⇒ 无法判定注入状态，'
        + '全部显示「未注入」。它会在该会话第一次注入后自动更新。',
    }))
  }
}

/** 渲染子页②：全局热知识（上：画像 / 下：全局知识）。 */
async function renderHotGlobal() {
  // ── 画像 ──
  const listBox = document.getElementById('hot-persona-list')
  try {
    const r = await getJson('/hot/persona')
    hotState.persona = r.items ?? []
  } catch { hotState.persona = [] }
  if (listBox) {
    listBox.replaceChildren()
    if (hotState.persona.length === 0) {
      listBox.append(h('div', { class: 'empty', text: '还没有画像条目。在上面的输入框里写一条并保存。' }))
    }
    for (const it of hotState.persona) {
      // ⭐ `data-clickable`：整卡可点 ⇒ CSS 给手型光标（见 `style.css` 的 `.item[data-clickable]`）。
      const card = h('div', { class: 'item', 'data-clickable': '1' })
      // ⭐⭐ **改成"整卡可点 + 右侧 chevron"**（用户 2026-09-23 要求：
      //    "画像也改一下，点击列表块就展开编辑"）——与**全局知识卡完全同一形态**。
      //    🔴 原来有个单独的「编辑」按钮负责切换显隐 ⇒ **已删**（用户要求点卡片就展开）。
      const meta = h('div', { class: 'meta' })
      meta.append(h('span', { class: 'tag', text: it.on ? '已纳入' : '未纳入' }))
      meta.append(h('span', { class: 'tag', text: it.channel }))
      if (it.updatedAt) meta.append(h('span', { class: 'dim small', text: it.updatedAt.slice(0, 10) }))

      /** ⭐ 右侧 chevron：收起 `▾` / 展开 `▴`（与全局知识卡同一对字符）。 */
      const chevron = h('span', { class: 'card-chevron', text: '▾' })
      const titleRow = h('div', { class: 'item-head' })
      titleRow.append(
        h('div', { class: 'item-title', text: it.text.split('\n')[0].slice(0, 80) || '(空)' }),
        chevron,
      )
      card.append(titleRow, meta)

      // ⭐⭐ **编辑区用「输入框 + 右下角按钮」的一体框**（用户 2026-09-23 要求：
      //    "画像条目编辑展开的输入框，也应该和改成一样的"）。
      //    ⭐ **做法与静态页里的画像输入框完全一致**：外层 `.composer` 画唯一的框，
      //    `textarea` 在里面无边框、按钮绝对定位到右下角。
      //    ⇒ **CSS 一行都不用加**：`.composer textarea` / `.composer > button`
      //      都是**后代/子选择器**，对动态创建的元素**同样命中**。
      //    ⭐ 这正是本项目那条判据的价值：**样式挂在结构上，不在"哪个元素"上**。
      const editor = h('div', { class: 'composer' })
      editor.hidden = true
      const ta = h('textarea', { rows: '4' })
      ta.value = it.text
      const save = h('button', { type: 'button', class: 'primary', text: '保存' })
      save.addEventListener('click', async () => {
        await postJson('/hot/persona', { op: 'update', id: it.id, text: ta.value })
        await renderHotGlobal()
      })
      const toggle = h('button', { type: 'button', text: it.on ? '取消纳入' : '纳入' })
      toggle.addEventListener('click', async () => {
        await postJson('/hot/persona', { op: 'update', id: it.id, on: !it.on })
        await renderHotGlobal()
      })
      // ⭐ **删除按钮用 `danger`**（用户 2026-09-23：*"删除按钮的文字应该是红色的"*）——
      //    样式**已有**（CSS 里的 `button.danger`：**只染文字、不染边框**），
      //    ⚠️ 所以这里**不新创写法**，直接用既有的那个 class（本项目一贯做法）。
      const del = h('button', { type: 'button', class: 'danger', text: '删除' })
      del.addEventListener('click', async () => {
        // ⭐⭐ **要弹窗确认**（用户 2026-09-24：*"全局热知识页，画像的删除按钮，点击后要弹窗确认。"*）
        //
        // 🔴 **为什么这个确认是必须的**（不只是"统一风格"）：
        //    画像的删除是**不可逆**的（`op:'delete'` 直接落盘删掉那一条），
        //    而它就摆在卡片上、**和「取消纳入」紧挨着**（两个按钮只差一个字），
        //    ⇒ **误点一下就没了**，而画像又是"每次注入都带上"的高价值内容。
        // ⚠️ **文案要说清"不可逆"**（与知识库那边删除同一口径）——
        //    用户判断"要不要点确定"的依据全在这一句里。
        // ⚠️ **带上正文首行**（画像没有标题，用首行当身份）：
        //    只说"确定删除画像？"的话，**用户看不出删的是哪一条**
        //    （画像是个列表，可能有好几条）。⚠️ 截断到 40 字，避免长正文把弹窗撑爆。
        // ⭐ 用的是**同一个 `confirm()`**（与「全部移出」「知识库删除」一致）⇒ 不新创确认组件。
        const first = String(it.text ?? '').trim().split('\n')[0].trim()
        const label = first.length > 40 ? `${first.slice(0, 40)}…` : first
        const ok = confirm(
          `确定删除这条画像？\n\n「${label}」\n\n`
          + '⚠️ 不可逆：删掉后不再随热知识注入，也无法恢复（需要重新添加）。',
        )
        if (!ok) return
        await postJson('/hot/persona', { op: 'delete', id: it.id })
        await renderHotGlobal()
      })
      // ⚠️ 保存按钮**必须放进 `.composer` 里面**（它是绝对定位的定位目标），
      //    不能再包一层 `.hot-row`——那会让它脱离 `.composer`、绝对定位失效。
      editor.append(ta, save)

      // ⭐ **切换展开态（唯一入口）** —— 与全局知识卡**同一套写法**。
      //    ⚠️ **定义要放在「编辑」按钮之前**：那个按钮的 handler 直接调它
      //       （`const` 有 TDZ，先引用后定义会在**点击时**才抛错，很难发现）。
      const setOpen = (open) => {
        editor.hidden = !open
        chevron.textContent = open ? '▴' : '▾'
      }

      // ⭐⭐ **「编辑」按钮保留**（用户 2026-09-23 中途叫停：
      //    *"你等一下，编辑按钮还是要保留的。"*）。
      //    ⭐ 它与"点卡片展开"是**两条并存的入口** —— 都调同一个 `setOpen`，
      //       所以两条路的状态永远一致（不会一个说开、一个说关）。
      //    ⚠️ **必须有 `stopPropagation`**：否则点击会冒泡到卡片 ⇒
      //       卡片 handler 再 `setOpen` 一次 ⇒ **开又立刻关**（表现为"点了没反应"）。
      //       （卡片的 handler 里虽然排除了 `closest('button')`，这里仍显式停一下，
      //        意图更清楚、也不依赖那个排除条件。）
      const editBtn = h('button', { type: 'button', text: '编辑' })
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        setOpen(editor.hidden)
      })

      const row = h('div', { class: 'hot-row' })
      // ⭐ 顺序：编辑 → 取消纳入 → 删除（用户之前要求"编辑放在取消纳入的前面"）。
      row.append(editBtn, toggle, del)

      card.addEventListener('click', (e) => {
        // 🔴 **点按钮不展开**（「编辑」/「取消纳入」/「删除」/ 编辑区里的「保存」
        //    各自执行动作）。
        if (e.target instanceof Element && e.target.closest('button') !== null) return
        // ⭐ 编辑区**内部**的点击也不该收起卡片（否则点文本框想改字，卡片就关了）。
        if (e.target instanceof Element && editor.contains(e.target) && !editor.hidden) return
        const open = editor.hidden   // 当前收起 ⇒ 要展开
        setOpen(open)
        // ⭐⭐ **展开时挂"点外面收起"**（与全局知识卡同一手法）。
        //    ⚠️ `setTimeout 0` 是必须的：本次点击还在冒泡，立刻挂会被自己触发
        //       ⇒ 展开又立刻收起（表现为"点了没反应"）。
        if (open) {
          setTimeout(() => {
            document.addEventListener('click', function onOutside(ev) {
              if (ev.target instanceof Element && card.contains(ev.target)) return
              setOpen(false)
              document.removeEventListener('click', onOutside)
            })
          }, 0)
        }
      })

      card.append(row, editor)
      listBox.append(card)
    }
  }

  // ── 全局知识 ──
  const gBox = document.getElementById('hot-global-list')
  try {
    const r = await getJson('/hot/global')
    hotState.globals = r.covers ?? []
  } catch { hotState.globals = [] }
  if (!gBox) return
  gBox.replaceChildren()
  if (hotState.globals.length === 0) {
    gBox.append(h('div', { class: 'empty', text: '库里还没有"全局"知识（`global: true` 且已批准）。' }))
    return
  }
  const warnAt = hotState.info?.budget?.fullWarnChars ?? 1000
  for (const c of hotState.globals) {
    // ⭐ `data-clickable`：整卡可点 ⇒ 手型光标。
    const card = h('div', { class: 'item', 'data-clickable': '1' })
    card.append(h('div', { class: 'item-title', text: c.title }))
    const meta = h('div', { class: 'meta' })
    meta.append(h('span', { class: 'tag', text: c.on ? '已纳入' : '未纳入' }))
    meta.append(h('span', { class: 'tag', text: c.shape === 'full' ? '正文形态' : '标题形态' }))
    // ⭐ 体量如实显示（`full` 是整篇正文，单条就能吃掉整个预算）。
    meta.append(h('span', { class: 'dim small', text: `${c.bodyChars} 字符` }))
    if (c.bodyChars > warnAt) {
      // ⭐ 超限标签**去掉前面的 ⚠️ icon**（用户 2026-09-23）。
      //    ⚠️ 红色边框 + 红字本身就说明了"这是警告"，再加 icon 是重复表达。
      meta.append(h('span', { class: 'tag missing', text: `超过 ${warnAt} 字符` }))
    }
    card.append(meta)
    // ⭐⭐ **展开正文改成"整卡可点 + 右侧一个 chevron"**（用户 2026-09-23 要求）。
    //
    // 🔴 **原来是 `<details><summary>展开正文</summary>`** —— 用户原话：
    //    *"不要现在那个展开正文按钮。只需要在列表块右边放一个向下的 icon 就好了，
    //      展开时是向上的 icon。另外只要点击列表块（除了取消纳入和改变形态的按钮）
    //      就展开。关闭时需要点击收起按钮（向上的 icon），或者列表块以外的地方。"*
    //
    // ⭐ **实现要点（四条，缺一就不符合要求）**：
    //    ① 箭头放在**卡片右侧**，随展开状态切换 `▾`/`▴`；
    //    ② **点卡片任意处**（标题、标签、空白）都能展开；
    //    ③ 🔴 **点卡片里的按钮不算**（`onBtn` / `shapeBtn` 要能正常点）——
    //       做法是在卡片点击处理里**排除按钮**（`closest('button')`）；
    //    ④ **点卡片外面收起**（用 document 上的一次性监听，见下）。
    const body = h('pre', { class: 'hot-body', text: c.body || '（无正文）' })
    body.hidden = true
    /** ⭐ 右侧 chevron：展开时朝上（用户指定的两种方向）。 */
    const chevron = h('span', { class: 'card-chevron', text: '▾' })
    // ⭐ 把 chevron 塞进**标题那一行**（右侧对齐）——
    //    ⚠️ 卡片是纵向布局，所以给标题行单独包一层 flex 才能"标题左、箭头右"。
    card.replaceChildren()
    const titleRow = h('div', { class: 'item-head' })
    titleRow.append(h('div', { class: 'item-title', text: c.title }), chevron)
    card.append(titleRow, meta)

    /** 切换展开态（**唯一的开关入口**，避免两处各写一份）。 */
    const setOpen = (open) => {
      body.hidden = !open
      chevron.textContent = open ? '▴' : '▾'
    }
    card.addEventListener('click', (e) => {
      // 🔴 **点按钮不展开**（用户明确排除"取消纳入"和"改变形态"两个按钮）——
      //    否则点按钮会连带把卡片展开/收起，很干扰。
      if (e.target instanceof Element && e.target.closest('button') !== null) return
      const open = body.hidden   // 当前收起 ⇒ 要展开
      setOpen(open)
      // ⭐⭐ **展开时挂"点外面收起"的监听**（用户要求：点列表块以外的地方收起）。
      //    ⚠️ **必须用 `{ once: true }` + 只挂一次**：否则每展开一次就积一个监听器。
      //    ⚠️ **注册要放到下一个事件循环**（`setTimeout 0`）：本次点击还在冒泡，
      //       若立刻挂上，这次点击自己就会把它触发掉 ⇒ 展开又立刻收起。
      if (open) {
        setTimeout(() => {
          document.addEventListener('click', function onOutside(ev) {
            if (ev.target instanceof Element && card.contains(ev.target)) return
            setOpen(false)
            document.removeEventListener('click', onOutside)
          })
        }, 0)
      }
    })

    const row = h('div', { class: 'hot-row' })
    const onBtn = h('button', { type: 'button', text: c.on ? '取消纳入' : '纳入' })
    onBtn.addEventListener('click', async () => {
      await postJson('/hot/item', { id: c.id, on: !c.on })
      await renderHotGlobal()
    })
    // ⭐ **正文注入开关**（用户要求：点击后正文以正文形式注入）
    const shapeBtn = h('button', { type: 'button', text: c.shape === 'full' ? '改为标题形态' : '正文形态注入' })
    shapeBtn.addEventListener('click', async () => {
      await postJson('/hot/item', { id: c.id, shape: c.shape === 'full' ? 'meta' : 'full' })
      await renderHotGlobal()
    })
    row.append(shapeBtn, onBtn)
    card.append(row, body)
    gBox.append(card)
  }
}

/** 渲染子页③第一层：项目列表（**先选项目**，用户要求）。 */
async function renderHotProjectList() {
  const box = document.getElementById('hot-project-list')
  const picker = document.getElementById('hot-project-picker')
  const editor = document.getElementById('hot-project-editor')
  // ⭐ 与"当前会话项目"联动：判定成功才可用（不给点了没反应的按钮）。
  const openBtn = document.getElementById('hot-open-current')
  const openNote = document.getElementById('hot-open-current-note')
  await loadHotInfo()
  const cur = hotState.info?.bound?.project ?? ''
  if (openBtn) openBtn.disabled = cur === '' || cur === '未知'
  if (openNote) {
    openNote.textContent = (cur === '' || cur === '未知')
      ? '（当前会话未判定出项目 —— 请先在「会话实时状态」里绑定）'
      : `（当前会话：${cur}）`
  }
  if (hotState.project !== '') { picker.hidden = true; editor.hidden = false; return }
  picker.hidden = false; editor.hidden = true
  if (!box) return
  try {
    const r = await getJson('/hot/projects')
    hotState.projects = r.projects ?? []
  } catch { hotState.projects = [] }
  // ⭐⭐ **分页**（用户 2026-09-25）。
  renderPagedList(box, hotState.projects, (p) => {
    // ⭐ `data-clickable`：整卡可点（点哪都进编辑页）⇒ 手型光标。
    const card = h('div', { class: 'item', 'data-clickable': '1' })
    const meta = h('div', { class: 'meta' })
    meta.append(h('span', { class: 'tag', text: `${p.coverCount} 条知识` }))
    meta.append(h('span', { class: 'tag theme', text: `已选 ${p.selectedCount}` }))
    // ⭐ 标签文案去掉"会"字（用户 2026-09-23：*"不要'会'字，就 注入XX"*）。
    meta.append(h('span', { class: 'tag global', text: `注入 ${p.injectCount}` }))

    // ⭐⭐ **去掉「进入编辑」按钮，改成"整卡可点 + 右侧三角"**（用户 2026-09-23 要求：
    //    *"去掉进入编辑按钮，列表块右侧留向右的三角，点击列表块直接进入编辑页"*）。
    //    ⚠️ **用 `›` 而不是 `▾`**：这张卡**不是展开/收起**（没有可折叠的内容），
    //       而是**跳转到下一层**（进入该项目的编辑页）⇒
    //       ⭐ **箭头方向要传达"进入"而不是"展开"**（本项目一贯：图标要名副其实）。
    //       ⭐ 复用 `.card-chevron` 那条样式（同色同字号），只是换个字符。
    const chevron = h('span', { class: 'card-chevron', text: '›' })
    const titleRow = h('div', { class: 'item-head' })
    titleRow.append(h('div', { class: 'item-title', text: p.title || p.id }), chevron)
    card.append(titleRow, meta)
    card.addEventListener('click', () => { void openHotProject(p.id) })
    return card
  }, { key: 'hot-projects', empty: '库里还没有项目。' })
}

/** 进入某项目的热知识编辑（第二层）。 */
async function openHotProject(projectId) {
  hotState.project = projectId
  // ⭐⭐ **窄屏：进页面时把"选择知识"层收起、标签复位**（用户 2026-09-24：
  //    *"下方打开页面时默认全屏展示项目热知识列表"*）。
  //    🔴 **必须显式清掉 `data-narrow-open`** —— 用户可能上次离开时是展开态，
  //      而那个属性**留在 DOM 上**（同一个面板元素，不会重建）⇒ 不清就会
  //      "一进来就是选择知识层盖着"，与用户要的"默认全屏展示列表"相反。
  const editorPanel = document.getElementById('hot-project-editor')
  if (editorPanel !== null) editorPanel.removeAttribute('data-narrow-open')
  if (typeof hotState.syncNarrowPickerLabel === 'function') hotState.syncNarrowPickerLabel()
  // ⚠️ **同时清掉"就地展开的正文"** —— 窄屏下不给详情功能，
  //    但用户可能刚刚在**宽屏**下展开过（切窄后那个状态还记着）
  //    ⇒ 留着会让"右栏的正文详情"在窄屏下凭空出现（而它本该只在宽屏用）。
  hotState.openEntry = ''
  // ⭐⭐ **筛选器默认选中「当前判定的这个项目」**（用户 2026-09-24 要求）。
  //
  // ⚠️ **只在这个筛选"还是默认值"时才设**（判据：`''` = 全部项目）——
  //    🔴 否则：用户手动切了筛选（比如看"全部项目"），
  //    **再点某条展开 / 做完一次置顶**（那些操作都会走本函数或重画），
  //    筛选就会被**悄悄重置回本项目** ⇒ 用户会以为"我的筛选自己跑了"。
  //    ⭐ 判据：**设默认值 ≠ 覆盖用户的选择** —— 只在"还没有选择"时给。
  // ⚠️ **同步写进 DOM**（`#hot-kb-project`）：`pickFilter` 是数据源，
  //    而 `renderHotEditor` 里读的是 `pickFilter`；但下拉框的**显示值**是 DOM 自己的
  //    ⇒ 只改数据源会出现"**筛的是这个项目、下拉框却显示『全部项目』**"（界面撒谎）。
  // 🔴 **但设 value 可能失败**：`<option>` 是 `fill('hot-kb-project', …)` 铺的，
  //    而那一步发生在**数据加载完之后**；若用户在选项铺好前就点进项目，
  //    给一个**不存在的 value** 赋给 `<select>` ⇒ 浏览器把 value 设成 `''`
  //    ⇒ **数据源筛本项目、下拉框却显示『全部项目』**（还是同一个"界面撒谎"）。
  //    ⇒ ⭐ **设完要回读校验**；没生效就**等选项铺好再补一次**（见 `fill()` 末尾的补挂）。
  if (hotState.pickFilter.project === '') {
    hotState.pickFilter.project = projectId
    hotState.pendingProjectFilter = projectId   // ⭐ 留给 `fill()` 铺完选项后补设
    const el = document.getElementById('hot-kb-project')
    if (el) {
      el.value = projectId
      // 回读：生效了就不用再补（绝大多数情况）。
      if (el.value === projectId) hotState.pendingProjectFilter = ''
    }
  }
  await renderHotProjectList()
  const title = document.getElementById('hot-editor-title')
  if (title) title.textContent = `项目热知识：${projectId}`
  // ⭐ **首次进入时生成默认清单**（最新 10 条项目知识 + 5 条不重复的主题知识）。
  //
  // 🔴🔴 **判据是"这份清单从未被生成过"，不是"时间戳为空"**（实测踩到）：
  //    早先的接口测试写过一个 `initializedAt` 非空、`entryIds` 为空的记录
  //    ⇒ 按"时间戳为空才生成"判定 ⇒ **永远不再生成** ⇒ 用户看到空清单、
  //      也**没有任何入口**能拿到默认清单（**卡死状态**）。
  //    ⭐ 正确判据：`initializedAt` **为空**（从没跑过）**或** `entryIds` 为空
  //      （跑过但没选出东西 —— 多半是当时库里没内容，之后该补一次）。
  //    ⚠️ 但**不能**在"用户手工清空了清单"时也重生成 ⇒ 那会覆盖用户的意图。
  //       ⇒ 折中：**只在 `initializedAt` 为空时自动生成**；非空但空清单时，
  //         由用户在界面上点「生成默认清单」显式触发（见下）。
  try {
    const sel = await getJson(`/hot/selection?project=${encodeURIComponent(projectId)}`)
    const neverInit = (sel.initializedAt ?? '') === ''
    if (neverInit) {
      await seedHotSelection(projectId)
    } else if ((sel.entryIds ?? []).length === 0) {
      // ⚠️ 已初始化但清单为空 ⇒ **不自动覆盖**，只提示（见 `renderHotEditor` 的按钮）。
      hotState.selectionEmptyButInit = true
    }
  } catch { /* 生成失败不阻塞进入 */ }
  await renderHotEditor()
}

/** ⭐ 生成默认清单（**只在首次**；之后尊重用户手工增删）。 */
async function seedHotSelection(projectId) {
  const covers = state.covers ?? []
  const byUpdated = [...covers].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  const own = byUpdated.filter((c) => c.project === projectId && !c.global).slice(0, 10)
  const p = hotState.projects.find((x) => x.id === projectId)
  const themes = p?.themes ?? []
  const seen = new Set(own.map((c) => c.id))
  const extra = []
  for (const c of byUpdated) {
    if (extra.length >= 5) break
    if (seen.has(c.id) || c.global) continue
    if (themes.length > 0 && !(c.theme ?? []).some((t) => themes.includes(t))) continue
    extra.push(c); seen.add(c.id)
  }
  await postJson(`/hot/selection?project=${encodeURIComponent(projectId)}`, {
    // ⚠️ 新结构：每条带 `shape` / `pinnedAt`（见 `HotProjectEntry`）。
    //    ⭐ **加入清单即会注入**（项目层没有第二道 `on` 开关）。
    entries: [...own, ...extra].map((c) => ({ id: c.id, shape: 'meta', pinnedAt: '' })),
    init: true,
  })
}

/** 渲染第二层：左库 + 右已选。 */
async function renderHotEditor() {
  const sel = document.getElementById('hot-editor-selected')
  const gbox = document.getElementById('hot-editor-global')
  if (!sel) return
  await loadHotInfo()
  // 右上：**所有会全局注入的内容**（可收起/展开）
  //
  // 🔴🔴 **用户 2026-09-22 纠正**：这块原来只列「全局知识」，
  //    而**画像也是全局注入的**（它对所有会话生效）。
  //    用户原话："全局已设置的知识也应该显示画像啊，不只是全局知识啊，
  //    本质就是把所有会全局注入的都要列出来啊。"
  // ⇒ ⭐ 判据从"**它是全局知识**"改成"**它会不会全局注入**"——
  //    后者才是这一块要回答的问题。
  if (gbox) {
    let gl = []
    try { gl = (await getJson('/hot/global')).covers ?? [] } catch { gl = [] }
    let persona = []
    try { persona = (await getJson('/hot/persona')).items ?? [] } catch { persona = [] }

    const onGlobal = gl.filter((c) => c.on)
    const onPersona = persona.filter((p) => p.on && String(p.text ?? '').trim() !== '')
    // ⭐⭐ **分页**（用户 2026-09-25）。
    //    🔴🔴 **画像与全局知识必须【合成一个数组】再分页** ——
    //       它们**共用一个 `gbox` 容器**（画像排前面、全局知识接在后面），
    //       若各自独立分页，两个游标会**互相打架**（各自往同一个容器里 append）。
    //    ⚠️ 用 `kind` 字段区分两类，`draw` 里分支 —— 而不是两个 for 循环。
    const merged = [
      ...onPersona.map((p) => ({ kind: 'persona', data: p })),
      ...onGlobal.map((c) => ({ kind: 'global', data: c })),
    ]
    // 🔴🔴 **两个 draw 定义必须在 `renderPagedList` 调用【之前】** ——
    //    它们是 `const`（TDZ），写在后面会在调用时抛
    //    `Cannot access 'drawPersonaCard' before initialization`。
    //    ⭐ 本项目第五十四批刚栽过同一个坑（`bindNarrowEditorButtons` 撞 `hotState`）。
    /** ⭐ 画像卡（**刻意不做就地展开** —— 见下）。 */
    const drawPersonaCard = (p) => {
      // 🔴🔴 **画像卡刻意【不做】就地展开**（用户 2026-09-23 明确排除：
      //    *"项目热知识页编辑页右栏的全局注入内容的画像条目除外，不需要展开，
      //      点击后可以浮现一下提示：'全局热知识请到对应页面进行编辑'"*）。
      //
      // ⭐ **为什么不给展开**：画像在这一页**没有编辑入口**（本页右栏的编辑动作都在
      //    左栏卡片上），展开只能"看"、看不出任何可做的事
      //    ⇒ 给个**指路**比给个"只能看的框"有用。
      // ⚠️ 所以这里**不挂 `attachBodyToggle`**，卡片也没有 chevron
      //    （有箭头就会让人以为"它能展开"——本项目一贯：**图标要名副其实**）。
      const card = h('div', { class: 'item' })
      card.append(h('div', { class: 'item-title', text: p.text.split('\n')[0].slice(0, 80) || '(空)' }))
      const meta = h('div', { class: 'meta' })
      meta.append(h('span', { class: 'tag kind', text: '画像' }))
      meta.append(h('span', { class: 'tag', text: p.channel === 'section' ? 'section' : 'inbox' }))
      meta.append(h('span', { class: 'dim small', text: `${String(p.text).length} 字符` }))
      card.append(meta)
      // ⭐ **点一下给指路提示**（toast，既有组件；不跳转——用户只说"浮现一下提示"）。
      card.addEventListener('click', () => {
        toast('全局热知识请到对应页面进行编辑')
      })
      return card
    };
    /** ⭐ 全局知识卡（整卡可点 ⇒ 就地展开正文）。 */
    const drawGlobalCard = (c) => {
      // ⭐⭐ **整卡可点 ⇒ 就地展开正文**（与上面"本项目热知识"、以及
      //    「全局热知识」页的全局知识卡**同一形态**）。
      const card = h('div', { class: 'item', 'data-clickable': '1' })
      // ⚠️ 正文**已经在手**（`/hot/global` 本来就把 `body` 一起回了，
      //    因为那一页要用来展开）⇒ 这里**不再多发一次请求**。
      const { head, body } = attachBodyToggle(card, {
        scope: 'gelo',
        key: c.id,
        title: c.title,
        load: async () => c.body ?? '',
        emptyText: '这条没有正文（或正文为空）。',
      })
      card.append(head)
      const meta = h('div', { class: 'meta' })
      meta.append(h('span', { class: 'tag global', text: '全局知识' }))
      meta.append(h('span', { class: 'tag', text: c.shape === 'full' ? '正文形态' : '标题形态' }))
      if (typeof c.bodyChars === 'number') {
        meta.append(h('span', { class: 'dim small', text: `${c.bodyChars} 字符` }))
      }
      card.append(meta, body)
      return card
    };
    // ⭐ **两个 draw 都定义好了 ⇒ 现在才调分页渲染**（⚠️ TDZ：见上面的说明）。
    renderPagedList(gbox, merged, (row) => {
      if (row.kind === 'persona') return drawPersonaCard(row.data)
      return drawGlobalCard(row.data)
    }, {
      key: 'hot-editor-global',
      empty: '（没有任何会全局注入的内容 —— 画像与全局知识都是空的）',
    })
  }
  // ══════════════════════════════════════════════════════════════════════
  // 右下：本项目清单
  //
  // 🔴🔴 **本批修的两个 bug**：
  //  1. **置顶永远是坏的**：原代码把 `/hot/global` 的返回（**数组**）
  //     当**按 id 查的表**用（`entries[r.id]`）⇒ 恒 `undefined`
  //     ⇒ 置顶标签永不显示、**置顶后按钮仍写着「置顶」、取消不掉**；
  //  2. **第二道隐形开关**：原来项目层要"在清单里 ∧ `on`"两道都过才注入，
  //     而 `on` 缺省 `false` ⇒ 选中 11 条、注入 0 条。
  //     ⇒ 现在 **在清单里 = 会注入**（用户 2026-09-22 裁定），
  //       逐项目的 `shape` / `pinnedAt` 由 `/hot/selection` 直接给。
  // ══════════════════════════════════════════════════════════════════════
  let selEntries = []
  try {
    const r = await getJson(`/hot/selection?project=${encodeURIComponent(hotState.project)}`)
    selEntries = r.entries ?? []
  } catch { selEntries = [] }
  const ids = selEntries.map((e) => e.id)
  // ⭐⭐ **把"清单里有哪些"与"清单现在多大"记下来**（批量操作要用）——
  //    ⚠️ 在这里记而不是在批量函数里现查：`renderHotEditor` 本来就拿到了 `ids`，
  //    且**每次改清单都会调它** ⇒ 这份账永远是最新的（不会漏更新）。
  //    🔴🔴 **它必须在"评分模式早退"【之前】**（决策 184 修）：左栏卡片要靠这份账
  //       判断"该显示『加入列表』还是『移出列表』"—— 早退跳过它会让**左栏用上一轮的旧状态**
  //       （本项目记过同族坑：同一数据两份状态 ⇒ 刷新半生效）。
  hotState.selectionIds = new Set(ids)
  hotState.selectionEntries = selEntries
  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐⭐ **评分模式打开时：本块改成"说明"而不是清单**（决策 184）
  //
  // 🔴🔴 **为什么必须这样**（用户原话）：*"只要打开开关的时候，项目热知识列表的
  //    列表不显示了，改一下项目热知识页项目那块的描述就好，就说现在是自动注入，
  //    可以到会话实时页去看具体注入了啥。"*
  // ⚠️ 根因：开关打开 ⇒ 注入侧**替换**掉项目/主题层 ⇒ 那份手工清单**不再生效**
  //    ⇒ 页面若照旧显示它、还让人「加入列表」，就是**在展示一份已失效的数据**
  //    （用户会以为"加了没生效"，那正是他报的"迷茫"）。
  // ⭐ **关掉开关 ⇒ 自动恢复显示**（数据一直在 `selection.json` 里，**一个字节都没动**）。
  // ══════════════════════════════════════════════════════════════════════
  if (hotState.scoreOn) {
    // ⚠️ **标题也要换** —— 否则写「本项目热知识（含置顶）」而下面是说明，
    //    会让人以为"清单加载失败"（本项目一贯：**界面不撒谎**）。
    const titleEl = document.getElementById('hot-editor-selected-title')
    if (titleEl) titleEl.textContent = '本项目热知识（当前由【知识评分】自动挑选）'
    sel.replaceChildren()
    const box = h('div', { class: 'empty' })
    box.append(h('div', {}, '⭐ 本项目正在用【知识评分】自动挑选要注入的知识（开关已打开）。'))
    box.append(h('div', { class: 'dim', style: 'margin-top:8px;' },
      '注入的项目知识 = 评分榜的【前 N 名】（按累计分排序，同分时按最近一次加分的先后）。'
      + '因此这份【手工清单】当前不参与注入 —— 它没有被删除，只是暂时不生效；'
      + '把设置页「热知识注入 → 知识评分」的开关关掉即会恢复显示。'))
    box.append(h('div', { class: 'dim', style: 'margin-top:8px;' },
      '👉 想看**实际注入了什么**：去「会话实时状态」页（那里列的就是真正要注入的内容）。'))
    box.append(h('div', { class: 'dim', style: 'margin-top:8px;' },
      '👉 想调**注入几条 / 入围门槛**：去「设置 → 热知识注入 → 知识评分」。'))
    sel.append(box)
    return
  }
  // ⭐⭐⭐ **自动清掉混在清单里的全局知识**（用户 2026-09-24 裁定：
  //    *"自动清掉——已无效，留着只会困惑"*）。
  //
  // 🔴 **为什么会有这种残留**：一条知识可以是 `global: true` **同时**又被写进项目清单
  //    （用户手工加过 / 历史遗留）。而**全局知识本来就无条件注入**
  //    ⇒ 它在清单里**没有任何作用**，只会造成**同一份注入里出现两遍**
  //    （服务端 `collectHotItems` 那侧也已去重）。
  // ⚠️ **只清清单、绝不动 `entries.json`** ⇒ 它照常全项目注入，行为不变。
  // ⚠️ **异步执行、不阻塞本帧渲染**（用了当前这份 `selEntries` 继续画，
  //    清完由它自己再重画一次）—— 否则每次进页面都要多等一个来回。
  void cleanupGlobalInSelection(selEntries)
  hotState.bulkCharsNow = estimateBulkChars(ids)
  // ⭐⭐ **恢复原来的标题**（决策 184）—— 开关关掉后这一块回到"手工清单"语义
  //    ⇒ 标题必须跟着回去（否则留着"由评分自动挑选"会**说反**）。
  const titleEl2 = document.getElementById('hot-editor-selected-title')
  if (titleEl2) titleEl2.textContent = '本项目热知识（含置顶）'
  sel.replaceChildren()
  if (selEntries.length === 0) {
    sel.append(h('div', { class: 'empty', text: '本项目还没有选中任何热知识。从左侧点「加入」即可。' }))
    // ⭐ **给一个显式的出口**（用户要求"默认选 10+5"，但清单已经被初始化过 ⇒
    //    不能自动覆盖用户意图 ⇒ 让他自己点一下）。
    const seedBtn = h('button', { type: 'button', class: 'btn', text: '生成默认清单（最新 10 条 + 主题 5 条）' })
    seedBtn.addEventListener('click', async () => {
      await seedHotSelection(hotState.project)
      await renderHotEditor()
    })
    sel.append(h('div', { class: 'hot-row' }, seedBtn))
  }
  // ⭐ 排序：置顶优先（按最后置顶时间倒序），其余保持清单顺序。
  const byId = new Map(selEntries.map((e) => [e.id, e]))
  const rows = selEntries.map((e) => ({ id: e.id, c: (state.covers ?? []).find((x) => x.id === e.id), e }))
  const pinned = rows.filter((r) => r.e.pinnedAt !== '')
    .sort((a, b) => String(b.e.pinnedAt).localeCompare(String(a.e.pinnedAt)))
  const rest = rows.filter((r) => r.e.pinnedAt === '')
  for (const r of [...pinned, ...rest]) {
    const isPinned = r.e.pinnedAt !== ''
    // ⭐⭐ **整卡可点 ⇒ 就地展开正文**（用户 2026-09-23：
    //    *"项目热知识的编辑页右栏的列表块，点击时，全都应该像全局热知识页那样
    //      展开显示其正文（不需要渲染）"*）。
    const card = h('div', { class: 'item', 'data-clickable': '1' })
    const { head, body } = attachBodyToggle(card, {
      scope: 'sel',
      key: r.id,
      title: r.c?.title ?? r.id,
      load: () => loadEntryBody(r.id),
      emptyText: r.c?.ext === true
        ? '这条是外部引用，且库外文件读不到正文（文件可能已被移动或删除）。'
        : '这条没有正文（或正文为空）。',
    })
    card.append(head)
    const meta = h('div', { class: 'meta' })
    // ⭐ 置顶标签**去掉前面的 📌 icon**（用户 2026-09-23）。
    //    ⚠️ `.tag.kind` 这个 class 本身就带区分色 ⇒ 再加 icon 是重复表达。
    if (isPinned) meta.append(h('span', { class: 'tag kind', text: '置顶' }))
    // ⭐ **形态如实显示**（它是逐项目的，见 `HotProjectEntry`）。
    meta.append(h('span', { class: 'tag', text: r.e.shape === 'full' ? '正文形态' : '标题形态' }))
    card.append(meta)
    const row = h('div', { class: 'hot-row' })
    const pinBtn = h('button', { type: 'button', class: 'btn', text: isPinned ? '取消置顶' : '置顶' })
    pinBtn.addEventListener('click', async () => {
      // ⚠️ **必须带 `project`**：项目/主题知识的形态与置顶是**逐项目**存的
      //    （服务端按"这条是不是全局知识"分流；缺 `project` 会被拒）。
      await postJson('/hot/item', { id: r.id, pin: !isPinned, project: hotState.project })
      await renderHotEditor()
    })
    // ⭐ **形态切换**（正文 / 标题）——逐项目设置。
    const shapeBtn = h('button', {
      type: 'button', class: 'btn',
      text: r.e.shape === 'full' ? '改为标题形态' : '正文形态注入',
    })
    shapeBtn.addEventListener('click', async () => {
      await postJson('/hot/item', {
        id: r.id, shape: r.e.shape === 'full' ? 'meta' : 'full', project: hotState.project,
      })
      await renderHotEditor()
    })
    // ⭐ **移出**：用户要求"如果是置顶的，取消置顶并移出" ⇒ 一步做完（服务端一次处理）。
    const rmBtn = h('button', { type: 'button', class: 'btn', text: '移出列表' })
    rmBtn.addEventListener('click', async () => {
      await postJson('/hot/item', { id: r.id, on: false, project: hotState.project })
      await renderHotEditor()
    })
    row.append(pinBtn, shapeBtn, rmBtn)
    card.append(row, body)
    sel.append(card)
  }
  // ⚠️ 传**数组**（`renderHotKbList` 用 `new Set(...)` 建索引）。
  void byId
  await renderHotKbList(ids)
  // ⭐⭐ **重画右栏的"正文详情"**（用户 2026-09-23 要求）。
  //    🔴 **必须在这里补一次**：`renderHotEditor` 会重画整个右栏
  //       （置顶/切形态/移出/加入 都会调它）⇒ 不补的话，
  //       **展开的正文会在这些操作后静默消失**（而 `openEntry` 还记着 ⇒ 状态与界面不一致）。
  //    ⚠️ 它自己会在 `openEntry === ''` 时直接返回（没展开就什么都不画）。
  await renderHotEntryDetail()
  // ⭐ **顺带照内容状态重画一次「全局热知识」的前导箭头**（用户 2026-09-24）——
  //    本函数会重画右栏内容区，箭头必须跟着内容走（详见 `syncGlobalToggle`）。
  syncGlobalToggle()
}

/**
 * ⭐⭐⭐ **清掉混在项目清单里的「全局知识」**（用户 2026-09-24 裁定"自动清掉"）。
 *
 * 🔴 **为什么会混进来**：一条知识可以 `global: true` **同时**又被写进项目清单
 *    （用户手工加过、或历史遗留）。而**全局知识无条件对所有会话注入**
 *    （走 `entries.json`，与项目清单无关）⇒ **它在清单里毫无作用**，
 *    只会让**同一份注入里出现两遍**（实测：`f871c7d0` 在渲染文本里出现 2 次）。
 *
 * ⚠️ **只清清单，绝不动 `entries.json`** —— 这是**安全边界**：
 *    全局知识的"纳入/形态"由 `entries.json` 管，本函数**一个字都不碰它**。
 * ⚠️ **幂等 + 静默**：没有残留时直接返回（不发请求）；清掉时不弹 toast
 *    （用户不会疑惑"我什么都没做，为什么数据变了"——它本来就是无效数据）。
 *    ⚠️ 但在 `console` 留一句，方便将来排查。
 * ⚠️ **失败不抛**（清不掉最多是留个残留，不该让页面挂）。
 * @param entries - 当前清单（服务端刚回的那份）。
 */
async function cleanupGlobalInSelection(entries) {
  const covers = new Map((state.covers ?? []).map((c) => [c.id, c]))
  const dirty = entries.filter((e) => covers.get(e.id)?.global === true)
  if (dirty.length === 0) return
  try {
    const q = `/hot/selection?project=${encodeURIComponent(hotState.project)}`
    await postJson(q, { entries: entries.filter((e) => covers.get(e.id)?.global !== true) })
    console.info(`[memj] 已从项目清单清掉 ${dirty.length} 条混入的全局知识：`
      + dirty.map((e) => e.id).join(', '))
    // ⚠️ **清完要让界面跟上**（重画一次）——否则页面上还显示着那几条。
    //    ⚠️ 但**只有当用户还在同一个项目页**时才重画（否则他切走了，重画会打断新页面）。
    if (hotState.project !== '') await renderHotEditor()
  } catch (e) {
    console.warn('[memj] 清理清单里的全局知识失败（不影响使用）：', e?.message ?? e)
  }
}

/** 左侧知识库列表（**复用知识库页的全部筛选功能**，用户要求）。 */
async function renderHotKbList(selectedIds) {
  const box = document.getElementById('hot-kb-list')
  if (!box) return
  const f = hotState.pickFilter
  const rows = (state.covers ?? []).filter((c) => {
    // 🔴🔴 **全局知识不进这个列表**（用户 2026-09-24 实测后裁定）：
    //    *"是项目热知识的清单里混进了本来已经在全局热知识里的知识。没有做去重。
    //      所以全局知识是不应该在项目热知识的可选列表里的（左栏）。
    //      因为他一定已经在本来就要注入的全局热知识里了。"*
    //    ⭐ 理由很硬：**全局知识本来就无条件注入** ⇒ 在这里"加入清单"不会让它多注入一次，
    //      只会造成**同一份注入里出现两遍**（服务端已同时修了那处去重）。
    //    ⚠️ 它自己的开关在「全局热知识」页 —— 那才是它的正当入口。
    if (c.global === true) return false
    if (f.kind === '__none__') { if (c.kind) return false }
    else if (f.kind !== '' && c.kind !== f.kind) return false
    if (f.project !== '' && c.project !== f.project) return false
    if (f.theme !== '' && !(c.theme ?? []).includes(f.theme)) return false
    if (f.q === '') return true
    return `${c.id} ${c.project} ${(c.theme ?? []).join(' ')} ${c.desc} ${c.ref} ${(c.tags ?? []).join(' ')} ${c.kind ?? ''}`
      .toLowerCase().includes(f.q.toLowerCase())
  }).sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  const cnt = document.getElementById('hot-kb-count')
  if (cnt) cnt.textContent = `${rows.length} / ${(state.covers ?? []).length} 条`
  // 🔴 **"已在清单里"只留一份判据**（本项目铁律）：
  //    `hotState.selectionIds` 与本次渲染用的集合**必须是同一个** ——
  //    否则左栏卡片说"已在列表"、而批量按钮的数字按另一份账去算 ⇒ **两处互相矛盾**。
  //    ⚠️ 本函数有**两个调用点**（`renderHotEditor` 传已知 ids；`toggleHotEntryDetail`
  //       现查一次）⇒ 在这里统一回写，两条路径都不会漂。
  const inList = new Set(selectedIds ?? [])
  hotState.selectionIds = inList

  // ⭐⭐ **批量操作行**（用户 2026-09-24 要求：*"当用户实际进行筛选后，
  //    筛选框内应该出现批量操作按钮。可以批量加入列表（全都按默认的标题形态去加入）"*）。
  //
  // 🔴 **出现时机（用户裁定）**：**筛选结果少于全部时**才出现 ——
  //    判据是 `rows.length < 全部条数`，**不是**"有没有填筛选条件"：
  //    填了条件但恰好覆盖全部 ⇒ **不出现**（此时"全部加入"与不筛选没区别，
  //    留着它只会让人误以为筛过）。
  syncHotBulkRow(rows, inList)

  // ⭐⭐ **分页**（用户 2026-09-25）——**这一页最需要**（实测 262 条）。
  //    ⚠️ `key` 带上筛选条件 ⇒ 换筛选就回到第 1 页。
  const pickKey = ['hot-kb-filter', 'hot-kb-kind', 'hot-kb-project', 'hot-kb-theme']
    .map((id) => document.getElementById(id)?.value ?? '').join('\u0000')
  renderPagedList(box, rows, (c) => {
    // ⭐⭐ **左栏卡片：点它就展开正文详情**（用户 2026-09-23 要求：
    //    *"点击左栏 entry 列表块，应该在右栏展开正文详情，需要渲染。再点击收回。
    //      正文详情页也应该有收起正文的按钮。"*）
    //
    // ⭐ **形态与全局知识卡一致**：整卡可点 + 右侧 chevron（收起 `▾` / 展开 `▴`），
    //    再点一次收回；正文要**渲染**（走 `renderBody()`，见下）。
    //
    // 🔴 **注意"右栏"的含义**：这个子页是**左右两栏**（`.side` 左、`.detail` 右），
    //    而左栏列表里的每张卡**自己不能往下长出一大块正文**（那会挤掉整个筛选区）。
    //    ⇒ **正文渲染在右栏**（`#hot-editor-selected` 那个 `.detail` 区域），
    //    卡片本身只标记"自己是当前展开的那条"。
    //    由 `renderHotEntryDetail()` 负责右栏的渲染与收起。
    const item = h('div', { class: 'item', 'data-clickable': '1' })
    const chevron = h('span', { class: 'card-chevron', text: '▾' })
    const titleRow = h('div', { class: 'item-head' })
    titleRow.append(h('div', { class: 'item-title', text: c.title || '(无标题)' }), chevron)
    const meta = h('div', { class: 'meta' })
    if (c.kind) meta.append(h('span', { class: 'tag kind', text: c.kind }))
    if (c.project) meta.append(h('span', { class: 'tag', text: c.project }))
    for (const t of (c.theme ?? []).slice(0, 2)) meta.append(h('span', { class: 'tag theme', text: t }))
    item.append(titleRow, meta)
    // ⭐ **展开态由 `hotState.openEntry` 记**（纯前端状态）——
    //    ⚠️ 不能用 DOM 的 `hidden` 反推：列表每次重渲染都会重建 DOM。
    const isOpen = hotState.openEntry === c.id
    if (isOpen) {
      chevron.textContent = '▴'
      item.classList.add('open')
    }
    item.addEventListener('click', (e) => {
      // 🔴 **点里面的按钮不算**（「加入列表」要能正常点）——与既有卡片同一判据。
      if (e.target instanceof Element && e.target.closest('button') !== null) return
      // ⭐⭐ **窄屏不给详情页功能**（用户 2026-09-24：
      //    *"窄屏就不给知识列表的详情页功能了。"*）。
      //    🔴 理由：窄屏下左栏是**从右侧滑出的覆盖层**，宽度只有一屏，
      //      再在里面展开一块正文会**极其局促**（而且右栏才是主视图）。
      //    ⚠️ 判据放在**点击时**判（而不是渲染时决定绑不绑）——
      //      因为窗口宽度**可以在不重画列表的情况下变化**
      //      （拖窗口 / 转屏）⇒ 渲染时判会留下一个"过期"的绑定。
      if (skipEntryDetailOnNarrow()) return
      // ⭐ **再点一次收回**（用户要求"再点击收回"）。
      void toggleHotEntryDetail(c.id)
    })
    if (inList.has(c.id)) {
      // ⭐⭐ **已在清单里 ⇒ 直接给「移出列表」按钮**（用户 2026-09-24 要求）：
      //    *"已列在列表里的知识，在左栏列表块里，不要显示那句状态描述，
      //      而是直接显示移出列表的按钮。"*
      //    ⚠️ 原来这里是一句 `✅ 已在热知识列表里`（**纯描述、不可点**）——
      //      用户要把它**换成一个可以立刻动作的按钮**（少一步"去右栏找它"）。
      //    ⚠️ **样式用 `btn`**（次要操作）——与右栏那个「移出列表」**同一个类**，
      //      不新创写法（本项目一贯）；「加入列表」才是 `primary`（主操作）。
      const rm = h('button', { type: 'button', class: 'btn', text: '移出列表' })
      rm.addEventListener('click', async () => {
        // ⚠️ **与「加入列表」同一套写法**（读当前清单 → 整份替换回去）——
        //    保持这一对操作**对称**，避免"加入走 A 路、移出走 B 路"两套实现。
        const q = `/hot/selection?project=${encodeURIComponent(hotState.project)}`
        const cur = (await getJson(q)).entries ?? []
        await postJson(q, {
          entries: cur
            .filter((e) => e.id !== c.id)
            .map((e) => ({ id: e.id, shape: e.shape, pinnedAt: e.pinnedAt })),
        })
        await renderHotEditor()
      })
      item.append(h('div', { class: 'hot-row' }, rm))
    } else {
      // ⭐ 按钮文案（用户 2026-09-23）：「＋ 加入热知识」→「**加入列表**」。
      const add = h('button', { type: 'button', class: 'primary', text: '加入列表' })
      add.addEventListener('click', async () => {
        const q = `/hot/selection?project=${encodeURIComponent(hotState.project)}`
        const cur = (await getJson(q)).entries ?? []
        // ⭐⭐ **加入清单 = 会注入**（2026-09-22 用户裁定）。
        //    ⚠️ 原来这里**额外**发一次 `/hot/item { on: true }` —— 那是为旧设计
        //    "清单 ∧ `on`"两道开关兜底的。现在项目层没有 `on` 了
        //    ⇒ 那个调用**多余**（且会给全局知识误写项目层设置）⇒ 已删。
        await postJson(q, {
          entries: [...cur.map((e) => ({ id: e.id, shape: e.shape, pinnedAt: e.pinnedAt })),
            { id: c.id, shape: 'meta', pinnedAt: '' }],
        })
        await renderHotEditor()
      })
      item.append(h('div', { class: 'hot-row' }, add))
    }
    return item
  }, {
    // ⚠️ **筛选条件进 key** ⇒ 换筛选回到第 1 页；
    //    🔴 **但"清单内容变了"不进 key** —— 加入/移出会让 `inList` 变，
    //       而那是"同一批数据的延续"（用户往往连着加好几条）⇒ 不该重置分页。
    key: `hot-kb|${pickKey}`,
    empty: '没有匹配的知识。',
  })
}

/**
 * ⭐⭐ **同步「批量操作」行的按钮状态**（用户 2026-09-24 要求 + 当日两次调整）。
 *
 * 🔴🔴 **本行现在【始终显示】**（用户最后一条：*"我改主意了，两个批量操作按钮应该始终显示
 *    （之前是只有进行过筛选才显示）"*）⇒ 这里**不再管显隐**，只管两个按钮的可用状态。
 *
 * ⚠️ **两个按钮的判据不同，别写成一套**：
 * · **「全部加入」= 针对当前筛选结果** ⇒ 判据是"筛选结果里有没有还没加入的"；
 * · **「全部移出」= 针对整个清单** ⇒ 判据是"清单里有没有可移出的"（见 `countRemovable`），
 *   🔴 **与筛选无关** —— 用户明确要求 *"就把所有项目知识移出列表"*，
 *   而且**主题知识也要一并移出**（只按"当前筛选结果"会漏掉：
 *   筛「项目 = 本项目」时，属于别的项目的主题知识会被筛掉）。
 *
 * ⚠️ **按钮文字不带条数、下面没有描述行**（用户：*"不需要后面的条数标注"*、
 *    *"他下面那段描述不要"*）⇒ 这里**不写任何文案**。
 *
 * @param rows - 当前筛选出来的条目（只用于「全部加入」）。
 * @param inList - **已在清单里的 id 集合**。
 */
function syncHotBulkRow(rows, inList) {
  const addBtn = document.getElementById('hot-kb-bulk-add')
  const rmBtn = document.getElementById('hot-kb-bulk-remove')
  if (addBtn === null) return
  // ⚠️ **缓存筛选结果**（「全部加入」用；「全部移出」不看它）。
  hotState.bulkCandidates = rows.map((c) => c.id)
  // ⭐ 「全部加入」：还有没加入的才可点。
  addBtn.disabled = rows.every((c) => inList.has(c.id))
  // ⭐ 「全部移出」：清单里还有"可移出的"才可点（**不看筛选结果**）。
  if (rmBtn !== null) rmBtn.disabled = countRemovable() === 0
}

/**
 * ⭐⭐ **数一数本项目清单里有多少条可以移出**。
 *
 * 🔴🔴 **判据（用户 2026-09-24 三轮裁定后的最终版）**：
 *    **清单里除「置顶」之外，全部移出** —— 包括**项目知识、主题知识、
 *    以及混进来的全局知识残留**。
 *
 * ── 为什么"全局知识也算可移出"（我在这里来回改过三次，把结论钉死）──
 * 用户原话有两句，**看着像矛盾、其实分别指两件事**：
 * ① *"总的来说就是除了画像、全局知识以及置顶知识。其他都要移出。"*
 * ② *"是项目热知识的清单里混进了本来已经在全局热知识里的知识。没有做去重。
 *    所以全局知识是不应该在项目热知识的可选列表里的（左栏）。"*
 * ⇒ ⭐ **①保护的是「全局知识这一类内容」（别影响它注入）**；
 *   **②说的是「全局知识不该出现在项目清单里」**。
 * ⚠️ 两者落在这个动作上**不冲突**：**从清单里清掉它，完全不影响它注入**
 *   （全局知识走 `entries.json`，**与项目清单无关**）。
 * ⇒ 所以**唯一的保留判据就是「置顶」**。
 * ⚠️ 用户已就"清单里那条已有残留（`f871c7d0`）"明确裁定：**自动清掉**
 *   （*"已无效，留着只会困惑"*）。
 *
 * ⚠️ **画像为什么不在判据里**：它不是封面、不进 `selection.json`
 *    （在 `hot/persona.json`）⇒ 本动作**碰不到它**。
 * @returns 可移出的条数。
 */
function countRemovable() {
  return removableEntries().length
}

/**
 * ⭐ 取出**应当移出的那些清单条目**（判据见 `countRemovable` 的表格）。
 * ⚠️ 一句话：**清单里除「置顶的」之外，全部移出**。
 * @returns `[{ id, shape, pinnedAt }]` 的子集。
 */
function removableEntries() {
  return (hotState.selectionEntries ?? []).filter((e) => e.pinnedAt === '')
}

/**
 * ⭐⭐ **批量移出本项目清单**（用户 2026-09-24 要求 + 当日补充）。
 *
 * 🔴🔴 **范围是整个清单，不是当前筛选结果**（用户裁定："1."）——
 *    理由：用户要的是"**把所有项目知识移出**"，
 *    而**主题知识（属于别的项目）在"按项目筛选"下会被筛掉**
 *    ⇒ 只看筛选结果会**漏掉它们**，做不到"清空清单"的语义。
 *
 * 保留（用户原话：*"除了画像、全局知识以及置顶知识"*）：
 * · **全局知识** —— 由 `entries.json` 管，清单里本来就不该有它（⚠️ 只清清单，**不动 `entries.json`**）；
 * · **置顶的** —— 用户刻意挑的；
 * · **画像** —— 不在清单里（`hot/persona.json`），本动作碰不到。
 */
async function removeFromSelection() {
  const q = `/hot/selection?project=${encodeURIComponent(hotState.project)}`
  let cur = []
  try {
    cur = (await getJson(q)).entries ?? []
  } catch (e) {
    toast(`读取清单失败：${e.message}`, true)
    return
  }
  // ⚠️ **用服务端刚回的这份算**（而不是缓存）——避免缓存过期导致误判。
  hotState.selectionEntries = cur
  const covers = new Map((state.covers ?? []).map((c) => [c.id, c]))
  // ⭐ **判据一句话：除「置顶的」之外，清单里全部移出**（见 `countRemovable` 的表格）。
  const remove = new Set(cur.filter((e) => e.pinnedAt === '').map((e) => e.id))
  if (remove.size === 0) {
    toast('清单里没有可移出的条目（只剩置顶的了）。')
    return
  }
  const keepPinned = cur.filter((e) => e.pinnedAt !== '').length
  // ⚠️ **数清"其中有多少条是混进来的全局知识"** —— 它们是**残留清理**，
  //    在确认框里说清（否则用户会疑惑"为什么我清单里的全局知识被动了"）。
  const globalDropped = cur.filter((e) => e.pinnedAt === '' && covers.get(e.id)?.global === true).length
  const ok = confirm(
    `把本项目清单里的 ${remove.size} 条**移出**？\n\n`
    + '· 移出后它们不再注入本会话；随时可以再「加入」；\n'
    + (keepPinned > 0 ? `· ⚠️ 置顶的 ${keepPinned} 条**保留不动**；\n` : '')
    + (globalDropped > 0
      ? `· ⚠️ 其中 ${globalDropped} 条是混进来的**全局知识**（它们本不该在项目清单里）——`
        + '清掉的是清单里的记录，**不影响它照常全项目注入**；\n'
      : '')
    + '· 「画像」不在清单里，不受影响。',
  )
  if (!ok) return
  try {
    // ⭐ 传**整份新 entries**（接口是"整份替换"语义）——被移出的那些自然消失。
    await postJson(q, { entries: cur.filter((e) => !remove.has(e.id)) })
    toast(`已移出 ${remove.size} 条`)
    await renderHotEditor()
  } catch (e) {
    toast(`移出失败：${e.message.split('\n')[0]}`, true)
  }
}

/**
 * ⭐⭐ **批量加入当前筛选结果**（用户 2026-09-24 要求）。
 *
 * ── 两步确认（缺一不可，用户点名要的）────────────────────────────────────────
 * ① **常规确认**：告知"要加入几条、都按标题形态"（用户原话：
 *    *"可以批量加入列表（全都按默认的标题形态去加入），需要提示确认"*）；
 * ② **超预算时的额外警告**：加入后清单总量会**超过注入上限**时，
 *    **再弹一次**更重的确认（用户原话：*"如果选择的知识超过设定阈值了，
 *    需要额外去弹警告确认"*）。
 *
 * ⭐ **阈值用既有的「注入上限」**（`info.budget.chars`，用户裁定）——
 *    **不新增旋钮**：那个数字本来就是"这个会话能容纳多少"的口径，
 *    而且它已经在设置面板里、也会随窗口大小自动变。
 *    🔴 判据：**"加入后会不会超"要用「清单总量」比，不是拿"这次加入的量"比** ——
 *    超预算从来是**累积**造成的（清单里原有的 10 条可能已经很接近上限了）。
 *
 * ⚠️ **形态一律 `meta`（标题形态）**（用户明确要求）：
 *    批量操作**不替用户决定"整篇正文注入"**（那会几十倍地吃预算，
 *    且要逐条取舍 —— 那是逐条操作该干的事）。
 * ⚠️ **已在清单里的条目跳过**（不覆盖它已有的 `shape`/`pinnedAt` ——
 *    用户可能专门把那几条设成了正文形态或置顶，批量操作**不该抹掉**）。
 */
async function addFilteredToSelection() {
  const ids = hotState.bulkCandidates ?? []
  const q = `/hot/selection?project=${encodeURIComponent(hotState.project)}`
  let cur = []
  try {
    cur = (await getJson(q)).entries ?? []
  } catch (e) {
    toast(`读取清单失败：${e.message}`, true)
    return
  }
  const have = new Set(cur.map((e) => e.id))
  // ⚠️ **真正要加的 = 筛选结果 ∖ 已在清单**（保持筛选结果的顺序）。
  const add = ids.filter((id) => !have.has(id))
  if (add.length === 0) {
    toast('筛选结果都已在本项目清单里，无需加入。')
    return
  }
  // ── ① 常规确认 ──
  const ok = confirm(
    `把当前筛选出的 ${add.length} 条加入本项目的热知识清单？\n\n`
    + '· 全部按**标题形态**加入（只给标题与描述，正文按需 memj_read）；\n'
    + '· 已在清单里的条目会跳过（不改动它们已有的形态/置顶）。',
  )
  if (!ok) return

  // ── ② 超预算的额外警告 ──
  //
  // 🔴 **判据**：`加入后的清单总量` vs `注入上限`。
  //    ⚠️ 拿"这次加入的量"去比上限是错的 —— 超限是累积出来的。
  //    ⚠️ 上限为 0 = **用户把比例设成 0（关闭预算检查）** ⇒ 不做这个检查
  //       （本项目既有语义，见 `/hot` 的 `budget.basis === 'off'`）。
  const cap = hotState.info?.budget?.chars ?? 0
  if (cap > 0) {
    const used = hotState.bulkCharsNow ?? 0     // 清单现状的字符数（`renderHotEditor` 里记的）
    const est = estimateBulkChars(add)
    const after = used + est
    if (after > cap) {
      const over = after - cap
      const warn = confirm(
        `⚠️ 加入后会超过注入上限\n\n`
        + `· 现在：约 ${used} 字符\n`
        + `· 本次加入：约 ${est} 字符（${add.length} 条，按标题形态估算）\n`
        + `· 加入后：约 ${after} 字符\n`
        + `· 上限：${cap} 字符（超出 ${over}）\n\n`
        + '⚠️ 超限不会自动裁剪，只会每轮多注入这些内容（占用模型的上下文）。\n'
        + '确定要继续吗？',
      )
      if (!warn) return
    }
  }

  try {
    await postJson(q, {
      entries: [
        ...cur.map((e) => ({ id: e.id, shape: e.shape, pinnedAt: e.pinnedAt })),
        ...add.map((id) => ({ id, shape: 'meta', pinnedAt: '' })),
      ],
    })
    toast(`已加入 ${add.length} 条`)
    await renderHotEditor()
  } catch (e) {
    toast(`加入失败：${e.message.split('\n')[0]}`, true)
  }
}

/**
 * ⭐ 估算一批条目**按标题形态**加入后的字符量（给超预算警告用）。
 *
 * ⚠️ **必须与服务端的渲染口径同源**：`meta` 行是
 * `` - `<id>`[kind] **title**（外部引用） — desc ``（见 `renderMetaLine`）。
 * ⇒ 这里按同一形状拼一遍再量长度，**不另创一套估法**。
 * 🔴 它是**估算**（用于弹警告），不追求逐字节相同 ⇒ 警告文案里写"约"。
 * @param ids - 待加入的封面 id。
 * @returns 估算字符数。
 */
function estimateBulkChars(ids) {
  const byId = new Map((state.covers ?? []).map((c) => [c.id, c]))
  let n = 0
  for (const id of ids) {
    const c = byId.get(id)
    if (c === undefined) continue
    const kind = c.kind === undefined || c.kind === '' ? '' : ` [${c.kind}]`
    const ext = c.ext === true ? '（外部引用）' : ''
    n += `- \`${id}\`${kind} **${c.title ?? ''}**${ext} — ${c.desc ?? ''}`.length + 1
  }
  return n
}

/**
 * ⭐⭐ **切换"右栏展开哪条正文"**（点左栏卡片时调用；再点同一条 ⇒ 收回）。
 *
 * 🔴 **为什么正文渲染在右栏、而不是在卡片下方展开**：
 * 这个子页是**左右两栏**（`.side` 左 / `.detail` 右），左栏还要放"返回 / 搜索 / 三个筛选器"。
 * 若让卡片自己往下长出一大块正文，**会把筛选区和整个列表挤没**
 * —— 用户也说了"应该在**右栏**展开正文详情"。
 *
 * ⚠️ **逐条互斥**：展开 B 时 A 自动收起（`: '' ` 覆盖赋值即可）。
 * @param id - 封面 id。
 */
async function toggleHotEntryDetail(id) {
  // ⭐ **再点一次同一条 ⇒ 收回**（用户明确要求）。
  hotState.openEntry = hotState.openEntry === id ? '' : id
  // ⚠️ **先重画左栏**（让 chevron 与"当前展开项"的高亮跟上），再画右栏。
  await renderHotKbList((await currentSelectionIds()))
  await renderHotEntryDetail()
}

/** ⭐ 取本项目当前清单的 id（**只有一处实现**——左栏/右栏都用它，避免两份判据漂移）。 */
async function currentSelectionIds() {
  try {
    const r = await getJson(`/hot/selection?project=${encodeURIComponent(hotState.project)}`)
    return (r.entries ?? []).map((e) => e.id)
  } catch { return [] }
}

/**
 * ⭐⭐ **右栏：展开某条的「正文详情」，或恢复原样**（第四十九批新增）。
 *
 * 🔴🔴 **形态是「替换」而不是「覆盖」**（用户 2026-09-23 二次纠正，原话：
 *    *"现在虽然是覆盖的，但是还是漏出了项目热知识的列表。他展开后的 entry 正文详情
 *      应该是直接覆盖整个右边栏的。或者说直接用 entry 的正文详情去替换掉右边栏才对的感觉。"*）
 *
 * ── 为什么"替换"比"浮层覆盖"好（我第一版做的是浮层，被用户否掉）──
 * 🔴 浮层**必须严丝合缝盖住下面的东西**，而右栏里那几块（标题 / 全局注入 / 本项目热知识）
 *    **高度不定、各自还能滚** ⇒ 浮层只要有一点对不齐（圆角、滚动条、padding、
 *    某个块自己的 `overflow`）就会**漏出底下的内容** —— 用户看到的就是这个。
 * ⇒ ⭐ **"替换"根本没有"对不齐"这回事**：把原有内容整体 `hidden`，
 *    只显示正文详情 ⇒ **物理上不可能漏出来**，也不需要 `position` / `z-index` / 不透明背景。
 *    ⚠️ 这正是本项目那条判据：**能用结构解决的，不要用层叠解决**。
 *
 * ⚠️ **必须是"隐藏"而不是"删除"**：收起时要能**原样恢复**
 *    （那三块里可能有用户刚输入的筛选、展开的全局块等状态）。
 */
async function renderHotEntryDetail() {
  const detail = document.querySelector('#hot-project-editor .detail')
  if (detail === null) return
  const id = hotState.openEntry

  // ── ① 先把右栏"原有的那些块"整体收起/恢复 ──
  //
  // ⭐ 做法：给它们包一个容器？—— **不**，那要改 HTML 结构与既有 CSS 选择器。
  //    ⇒ 更稳的是**逐个 `hidden`**：`.detail` 的直接子元素里，**除了**正文详情那块，
  //      其余全部隐藏。⚠️ 判据是"它是不是 `#hot-entry-detail`"，不写死具体有哪些块
  //      （将来加块也不用改这里）。
  const restore = () => {
    for (const child of [...detail.children]) {
      if (child.id === 'hot-entry-detail') continue
      if (child.dataset.hotHiddenBy === 'entry') {
        child.hidden = false
        delete child.dataset.hotHiddenBy   // ⚠️ 清掉标记，否则下次会误判"本来该是隐藏的"
      }
    }
  }
  if (id === '') {
    // 没展开 ⇒ 移除详情块 + 恢复原内容。
    detail.querySelector('#hot-entry-detail')?.remove()
    restore()
    return
  }
  for (const child of [...detail.children]) {
    // ⚠️ **只隐藏"当前可见"的**：已经是 `hidden` 的块（例如用户自己收起的
    //    「全局注入的内容」）**不能**打标记 —— 否则收起正文后会被"恢复"成可见，
    //    把用户自己的收起状态弄丢。
    if (child.id === 'hot-entry-detail' || child.hidden) continue
    child.hidden = true
    child.dataset.hotHiddenBy = 'entry'
  }

  // ── ② 画正文详情（复用它自己那块，避免反复重建）──
  let box = detail.querySelector('#hot-entry-detail')
  if (box === null) {
    box = h('div', { class: 'hot-block', id: 'hot-entry-detail' })
    detail.prepend(box)
  }
  // ⭐ 头部：**收起按钮**（用户要求"正文详情页也应该有收起正文的按钮"）。
  const head = h('div', { class: 'item-head' })
  const titleEl = h('h4', { text: '正文详情' })
  const close = h('button', { type: 'button', text: '收起正文' })
  close.addEventListener('click', () => { void toggleHotEntryDetail(id) })
  head.append(titleEl, close)
  // ⚠️ 先给"加载中"，避免大正文读盘期间看着像卡住。
  const bodySlot = h('div', { class: 'entry-body-slot' }, h('div', { class: 'empty', text: '加载中…' }))
  box.replaceChildren(head, bodySlot)

  try {
    const data = await getJson(`/entry?id=${encodeURIComponent(id)}`)
    const c = data.cover ?? {}
    // ⭐ 标题如实显示（它可能刚被改过 ⇒ 不沿用左栏那份）。
    titleEl.textContent = `${data.title || '(无标题)'}`
    const meta = h('div', { class: 'meta' })
    if (c.kind) meta.append(h('span', { class: 'tag kind', text: c.kind }))
    if (c.project) meta.append(h('span', { class: 'tag', text: c.project }))
    for (const t of (c.theme ?? []).slice(0, 3)) meta.append(h('span', { class: 'tag theme', text: t }))
    if (typeof c.ref === 'string' && c.ref !== '') {
      meta.append(h('span', { class: 'dim small', text: c.ext === true ? '外部引用' : c.ref }))
    }
    bodySlot.replaceChildren(meta)
    // ⭐⭐ **渲染正文**（用户要求"需要渲染"）——复用既有的 `renderBody()`：
    //    markdown → HTML + 标题锚点 + 条目 id 变可点链接。
    //    ⚠️ 外链条目读不到正文时**如实说**（不显示空白）。
    const body = typeof data.body === 'string' ? data.body : ''
    if (body.trim() === '') {
      bodySlot.append(h('div', {
        class: 'empty',
        text: c.ext === true
          ? '这条是外部引用，且库外文件读不到正文（文件可能已被移动或删除）。'
          : '这条没有正文（或正文为空）。',
      }))
    } else {
      bodySlot.append(renderBody(body))
    }
  } catch (e) {
    // ⚠️ 失败**不静默**：如实说，并保留"收起正文"按钮（否则用户被困在这块里）。
    bodySlot.replaceChildren(h('div', { class: 'empty', text: `正文加载失败：${e.message}` }))
  }
}

// ── 热知识页的事件绑定 ──
document.getElementById('hot-subtabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.subtab')
  if (btn === null || btn.dataset.hotsub === undefined) return
  hotState.sub = btn.dataset.hotsub
  renderHotSubtabs()
  if (hotState.sub === 'live') void renderHotLive()
  if (hotState.sub === 'global') void renderHotGlobal()
  if (hotState.sub === 'project') void renderHotProjectList()
})

document.getElementById('hot-master')?.addEventListener('change', async (e) => {
  const on = e.target.checked
  // ⭐ 总开关走**主设置**（`/settings`）——与设置卡片里的开关**同一个键**。
  //    ⚠️ 改配置需要重启才生效（服务端代码在进程里），所以回执要**如实说**。
  try {
    const r = await postJson('/settings', { hotInject: on })
    const msg = document.getElementById('hot-master-msg')
    if (msg) msg.textContent = r.needsRestart ? '已保存，需要重启 DSH 才生效。' : '已保存。'
  } catch (err) {
    const msg = document.getElementById('hot-master-msg')
    if (msg) msg.textContent = `保存失败：${err.message}`
  }
})

document.getElementById('hot-bind-save')?.addEventListener('click', async () => {
  const v = document.getElementById('hot-bind-project')?.value ?? ''
  if (hotSessionId === '') return
  await postJson('/hot/bind', { session: hotSessionId, project: v })
  await renderHotLive()
})
document.getElementById('hot-bind-clear')?.addEventListener('click', async () => {
  if (hotSessionId === '') return
  await postJson('/hot/bind', { session: hotSessionId, project: '' })
  await renderHotLive()
})
document.getElementById('hot-detect-docreads')?.addEventListener('change', async (e) => {
  await postJson('/hot/bind', { detectDocReads: e.target.checked })
  await renderHotLive()
})
document.getElementById('hot-detect-llm')?.addEventListener('change', async (e) => {
  await postJson('/hot/bind', { detectLlm: e.target.checked })
  await renderHotLive()
})
document.getElementById('hot-persona-save')?.addEventListener('click', async () => {
  const ta = document.getElementById('hot-persona-input')
  const msg = document.getElementById('hot-persona-msg')
  if (!ta || ta.value.trim() === '') { if (msg) msg.textContent = '请先写内容。'; return }
  try {
    await postJson('/hot/persona', { op: 'add', text: ta.value })
    ta.value = ''
    if (msg) msg.textContent = '已保存。'
    await renderHotGlobal()
  } catch (err) { if (msg) msg.textContent = `保存失败：${err.message}` }
})
document.getElementById('hot-open-current')?.addEventListener('click', async () => {
  await loadHotInfo()
  const cur = hotState.info?.bound?.project ?? ''
  if (cur === '' || cur === '未知') return
  await openHotProject(cur)
})
document.getElementById('hot-back-projects')?.addEventListener('click', () => {
  hotState.project = ''
  // ⭐⭐ **离开编辑页时把筛选器归零**（用户 2026-09-24 要求"默认选当前判定的项目"的配套）。
  //
  // 🔴 **不归零会串台**：`openHotProject` 只在"筛选还是默认值（`''`）"时才设默认项目，
  //    而"返回项目列表"**原来不清筛选** ⇒ 从项目 A 返回、再进项目 B 时，
  //    筛选**仍是 A**（非空 ⇒ 不会被设成 B）⇒ **列表筛的是上一个项目**。
  //    ⚠️ 而这个错误的表象很迷惑：**列表里一条都没有**（B 的页面用 A 的条件筛），
  //    用户会以为"这个项目没知识"，而不是"筛选没重置"。
  // ⭐ 判据：**"进出两级页面"时，页面的筛选状态该跟着页面走** ——
  //    编辑页是**逐项目**的，离开它就该回到中性状态（与展开态同理，见下）。
  hotState.pickFilter = { q: '', kind: '', project: '', theme: '' }
  hotState.pendingProjectFilter = ''
  for (const [id, v] of [['hot-kb-filter', ''], ['hot-kb-kind', ''], ['hot-kb-project', ''], ['hot-kb-theme', '']]) {
    const el = document.getElementById(id)
    if (el) el.value = v
  }
  // ⭐ **离开编辑页时清掉展开态**（用户 2026-09-23）——
  //    ⚠️ 不清的话，下次从项目列表再进这个项目，会**突然冒出一块正文**
  //       （`openEntry` 还记着上一条），而用户并没有点它。
  hotState.openEntry = ''
  // ⚠️ **右栏两套就地展开同理**（`sel` = 本项目热知识 / `gelo` = 全局热知识那块）：
  //    它们是**逐项目的**（同一个封面在不同项目里可以有不同展开态）
  //    ⇒ 离开时一起清，免得进另一个项目时"凭空展开着几条"。
  hotState.expanded.sel.clear()
  hotState.expanded.gelo.clear()
  void renderHotProjectList()
})
for (const [id, key] of [['hot-kb-filter', 'q'], ['hot-kb-kind', 'kind'], ['hot-kb-project', 'project'], ['hot-kb-theme', 'theme']]) {
  const el = document.getElementById(id)
  el?.addEventListener(id === 'hot-kb-filter' ? 'input' : 'change', () => {
    hotState.pickFilter[key] = el.value
    void renderHotEditor()
  })
}
/**
 * ⭐ **同步「全局热知识」那个折叠标题的前导箭头**（用户 2026-09-24：
 *    *"前面那个小箭头，在展开的时候，应该是箭头向下的"*）。
 *
 * 形状：收起 `▸`（朝右 = "点开才会有东西"）/ 展开 `▾`（朝下 = "东西在下面"）。
 *
 * 🔴 **为什么要有这个函数、而不是在点击处直接改**：
 *    标题是**静态 HTML 里的**，而内容区（`#hot-editor-global`）会随右栏重画，
 *    `renderHotEditor` 也会把 `#hot-editor-global` 重新 `replaceChildren`
 *    ⇒ 若只在点击处改一次箭头，**重画后箭头会与内容状态不一致**
 *       （内容开着、箭头却朝右）。
 *    ⭐ 所以判据交给**内容区的 `hidden`**（单一事实来源），本函数只负责"照它画"。
 *    ⚠️ 本项目铁律：**同一状态要有唯一来源**——不要让箭头自己记一份开合。
 */
function syncGlobalToggle() {
  const box = document.getElementById('hot-editor-global')
  const head = document.getElementById('hot-editor-global-toggle')
  if (box === null || head === null) return
  // ⚠️ 只换**前导箭头**，不重写整段 `textContent`——否则以后标题里加任何东西
  //    （例如顺便显示条数）都会被这里覆盖掉。
  const label = head.textContent.replace(/^[▸▾]\s*/, '')
  head.textContent = `${box.hidden ? '▸' : '▾'} ${label}`
}

document.getElementById('hot-editor-global-toggle')?.addEventListener('click', () => {
  const box = document.getElementById('hot-editor-global')
  if (box) box.hidden = !box.hidden
  syncGlobalToggle()
})

// ⭐⭐ **批量操作**（用户 2026-09-24 要求）——绑定一次即可
//    （按钮本身是静态 HTML，不像卡片那样每次重画）。
document.getElementById('hot-kb-bulk-add')?.addEventListener('click', () => {
  void addFilteredToSelection()
})
document.getElementById('hot-kb-bulk-remove')?.addEventListener('click', () => {
  void removeFromSelection()
})

/** ⭐ 切到热知识页时按当前子导航渲染（`renderTabs` 之后调用）。 */
function renderHotPage() {
  renderHotSubtabs()
  /**
   * 给一个 `<select>` 铺选项。
   *
   * 🔴🔴 **原来的守卫是 `el.options.length > 1`** —— 它有个**静默的坑**：
   *    若第一次调用时数据还没加载（`state.projects` 为空），
   *    那么只加了「（未知）」这一个 option ⇒ 判据成立（length 还是 1）
   *    ⇒ **以后每次调用都早退**，选项**永远填不上**。
   *    而 `renderTabs()` 确实可能在 `load()` 完成前就调到本函数。
   * ⇒ ⭐ 改成**按"这个 select 铺过没有"记账**（`dataset.filled`），
   *    与"当时有几条数据"解耦。
   */
  const fill = (id, opts, label) => {
    const el = document.getElementById(id)
    if (!el) return
    if (el.dataset.filled === '1') return
    if (opts.length === 0) return   // ⚠️ 没数据 ⇒ **这一轮先不铺**（下一轮数据到了再铺）
    for (const [v, t] of opts) { const o = h('option', { value: v, text: t }); el.append(o) }
    el.dataset.filled = '1'
    void label
  }
  fill('hot-bind-project', (state.projects ?? []).map((p) => [p.id, p.id]), '（未知）')
  fill('hot-kb-project', (state.projects ?? []).map((p) => [p.id, p.id]), '全部项目')
  fill('hot-kb-theme', (state.themes ?? []).map((t) => [t.id, t.id]), '全部主题')
  // ⭐⭐ **补设"项目热知识"筛选器**（用户 2026-09-24："筛选应该默认选当前判定的项目"）。
  //    🔴 为什么需要这一步：`openHotProject` 会设 `#hot-kb-project` 的值，
  //       但**那时 `<option>` 可能还没铺**（本函数在数据加载完之后才跑）
  //       ⇒ 那次赋值被浏览器丢弃（value 变成 `''`）⇒ 下拉框与筛选不一致。
  //    ⚠️ 所以 `openHotProject` 会把待设的值留在 `pendingProjectFilter` 里，
  //       **由这里在选项铺好之后补设一次**（且只在还没设成功时才补）。
  if (hotState.pendingProjectFilter !== '' && hotState.project !== '') {
    const el = document.getElementById('hot-kb-project')
    if (el) {
      el.value = hotState.project
      if (el.value === hotState.project) hotState.pendingProjectFilter = ''
    }
  }
  if (hotState.sub === 'live') void renderHotLive()
  if (hotState.sub === 'global') void renderHotGlobal()
  if (hotState.sub === 'project') void renderHotProjectList()
}

// ══════════════════════════════════════════════════════════════════════
// ⭐⭐⭐ 【提示词】子页（2026-09-29 新增）
//
// 用户需求原话：*"加个子页面【提示词】，需要把插件所有的提示词和工具描述都按照功能和
// 具体工具分块显示，同时要附上非常清楚的示意，是干嘛的？属于哪个工具或功能？
// 以具体什么方式注入的？是否会破坏缓存前缀？具体写在哪个文件里？修改后是能够热生效？
// 用户可以在该页去修改保存所修改的提示词。"*
//
// 🔴 **分区轴 = 生效方式与影响面**，不是功能（见 `PROMPT_ZONES` 与 `prompts.ts`）。
// ⚠️ 数据全部来自 `GET /prompts`（**服务端回结构化条目**）——不在前端拼候选集合。
// ══════════════════════════════════════════════════════════════════════

/** 本页的内存态（列表 + 当前筛选 + 展开/编辑状态）。 */
const promptState = {
  items: [],
  /**
   * ⭐⭐ **分组说明**（2026-10-12 新增）——由 `GET /api/prompts` 的 `groups` 回。
   *
   * 🔴 **为什么不让前端写死**：组标题与"这组是给谁看的"是**文案**，
   *   唯一出处是 `src/prompt-catalog.ts`。前端再抄一份必然漂开
   *   （本项目已记过多次"多副本"的坑）⇒ **服务端回结构化分组，前端只画**。
   * ⚠️ 空数组 = 服务端没回（旧进程）⇒ 用 `PROMPT_GROUP_FALLBACK` 兜底。
   * @type {Array<{ id: string, title: string, about: string, order: number }>}
   */
  groups: [],
  /** `all` | `overridden`（只看已改过的）。 */
  filter: 'all',
  /**
   * ⭐⭐ **哪些合并卡的「附：参数表 / 返回格式」是展开的**（2026-10-12 新增）。
   *
   * 🔴 **为什么必须记在状态里**：列表**每次操作都重画**（保存 / 筛选 / 懒加载回填），
   *   而 `<details>` 的展开态是 **DOM 属性** ⇒ 重画后会**丢掉**。
   *   ⚠️ 不记的话用户会看到"我展开看参数，它自己又合上了"。
   *   ⭐ 这与本项目记过的"跨标签滚动记忆"同族：**重画才是状态丢失的原因**。
   */
  partsOpen: new Set(),
  /** 正在编辑的 key（空 = 没有）。 */
  editing: '',
  /** 各条当前生效文本（懒加载；`key → text`）。 */
  text: {},
  /**
   * ⚠️ **`confirmKey` 已删除**（2026-09-29）：二次确认改回**原生 `confirm()`**
   *    （用户裁定；与项目既有 7 处确认写法一致）。
   *    🔴 原来那个"页内两步确认"是为规避"CDP 卡死"而做的 —— 而那个判断**实测是错的**
   *    （卡死源于探针没在 `Page.javascriptDialogOpening` 上应答，不是弹窗不可测；
   *      见 `probe-confirm-cdp.mjs` 5/0）。
   *    ⭐ 教训（免得有人再加回来）：**别为"测试不方便"改产品交互** ——
   *      先把那个"不方便"实测证实。
   */
  /**
   * ⭐ **每条的附加详情**（懒加载）：`key → { updatedAt, history[] }`。
   *
   * 🔴 **为什么与 `text` 分开**：`text` 是编辑框要的正文（大），
   *    而这里只有时间与历史**文件名列表**（很小）——分开存好让"只展示历史"
   *    不必把正文也拉回来。
   */
  detail: {},
  /**
   * ⭐⭐ **当前选中的条目**（宽屏右栏显示哪一条；**默认第一条**，用户要求）。
   *
   * ⚠️ 窄屏不用它 —— 窄屏是"卡片就地展开"（见 `promptState.openKey`）。
   */
  selected: '',
  /**
   * ⭐⭐⭐ **宽屏右栏处于"编辑中"的 key**（空 = **只读态**，用户要求）。
   *
   * 🔴 **两态是必须的**（用户 2026-09-29 明确要求）：
   *    · **初始只读** —— 右栏展示完整六字段 + 正文（`pre`），**没有输入框**；
   *    · 点「编辑」⇒ 正文换成 textarea、按钮换成「保存 / 取消」。
   *    ⚠️ 好处是**不会误改**：以前一展开就是可编辑的 textarea，光标点进去就可能改坏；
   *      现在"改"是一个**显式动作**。
   */
  editingKey: '',
  /**
   * ⭐ **窄屏"卡片就地展开"的 key**（空 = 都收起）。
   *
   * ⚠️ **与 `editingKey` 分开**：窄屏没有右栏，展开的是**卡片自己**（保持原设计，
   *    用户要求"窄屏就用现在的前端设计"）。两者语义不同，**不能合成一个**。
   */
  openKey: '',
  /**
   * ⚠️ **`draft` 已删除**（2026-09-29）。
   *
   * 它曾经用来在"页内两步确认"重画时保住用户输入 —— 而那个交互**已被换成原生弹窗**
   * （用户裁定"二次确认全都改成弹窗确认"），弹窗是**阻塞**的、点确定时直接读
   * `textarea` 的当下值 ⇒ **根本不存在"重画吃掉编辑"的机会** ⇒ 草稿缓存没有存在理由。
   * ⭐ 教训（免得有人加回来）：**去掉那个会吃掉输入的动作，比给输入做备份更简单**
   *   —— 我当时是先发明了备份机制，却一直没质疑"那个重画本身该不该存在"。
   */
}

/**
 * **打开【提示词】页**（拉清单 + 渲染三区）。
 * @param opts.keepMessage - true 时不清保存提示行。
 */
async function openPromptsPage({ keepMessage = false } = {}) {
  const status = document.getElementById('settings-status')
  if (status) status.textContent = '读取中…'
  if (!keepMessage) {
    const m = document.getElementById('settings-msg-prompts')
    if (m) m.textContent = ''
  }
  try {
    const r = await getJson('/prompts')
    if (!r.ok) throw new Error(r.error ?? '读取失败')
    promptState.items = r.items ?? []
    // ⭐⭐ **分组说明**（2026-10-12）：服务端回，前端只画（见 `promptState.groups` 的说明）。
    promptState.groups = (r.groups ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    // ⭐⭐ **默认选中第一条**（用户要求"默认第一条"）。
    //    ⚠️ 只在"当前没选中、或选中的那条已不存在"时才改 ——
    //       否则每次刷新页面都会把你正在看的那条踢回第一条。
    if (promptState.selected === '' || !promptState.items.some((x) => x.key === promptState.selected)) {
      promptState.selected = promptState.items[0]?.key ?? ''
    }
    // ⭐ 把覆盖表落点显示出来（用户要知道"改的东西存在哪"）。
    const p = document.getElementById('prompts-overrides-path')
    if (p) p.textContent = `覆盖表落点：${r.overridesPath ?? ''}（这是用户数据，跟着库走；插件升级不会覆盖它）`
    if (status) status.textContent = `共 ${promptState.items.length} 条提示词`
    renderPromptsPage()
    // ⭐ 宽屏：一进来就把选中那条的正文拉回来（右栏要显示它）。
    if (!isNarrow() && promptState.selected !== '') void loadPromptText(promptState.selected)
  } catch (err) {
    if (status) status.textContent = `读取失败：${err instanceof Error ? err.message : String(err)}`
  }
}

/**
 * **渲染提示词页**（左栏三区列表 + 下拉 + 宽屏右栏详情）。
 *
 * ⚠️ 三件事每次一起做（任一处状态变了都要重画）：列表、下拉选项、右栏。
 * @param opts.keepFilter - 内部调用用；目前无副作用，保留以便日后扩展。
 */
function renderPromptsPage() {
  renderPromptsList()
  renderPromptsJump()
  renderPromptsDetailOrInline()
}

/**
 * ⭐⭐⭐ **取当前该显示的条目**（筛选后）——并且**按需把工具的三部分合成一张卡**。
 *
 * 🔴 **为什么要合成**（2026-10-12，用户要求"该合并的合并"）：
 *    一个工具原本在页面上占**三条**（说明书 / 参数表 / 返回格式），
 *    而参数表与返回格式**只有两三行**（"本工具不需要参数"）⇒ 列表里全是碎片，
 *    **看不出这是一个工具**。
 * ⭐ **合成规则**：同一 `owner` 下的 `description` + `parameters` + `output`
 *    合成**一个条目**，以 `description` 那条为代表（`key` = description 的 key）。
 *    另两条挂在它的 `_parts` 上（前端**不显示为独立列表项**）。
 *
 * ⚠️ **只对 `tools` 分组生效**，且**只对有 `part` 字段的条目生效** ——
 *    其余分组（命令、注入文本……）的条目**互不相干，不能合**。
 * ⚠️ **筛选时按"整卡"判**：三条里任意一条被改过 ⇒ 整卡算"已改过"
 *    （否则筛选到"已改过"时会看到一张缺了参数的卡）。
 * @returns 列表项数组；每个元素形如 `{ rep, parts }`。
 */
function promptRows() {
  const items = promptState.items
  const overriddenOnly = promptState.filter === 'overridden'

  // ── 先按 key 分组：把 tool:* 的三部分收进同一格 ──
  const byOwner = new Map()
  const order = []
  for (const it of items) {
    // ⭐ 只有"工具"这种带 `part` 的才合并；其余每条独立。
    const groupKey = it.part !== '' && it.part !== undefined
      ? `tool:${it.owner}`
      : `solo:${it.key}`
    if (!byOwner.has(groupKey)) { byOwner.set(groupKey, []); order.push(groupKey) }
    byOwner.get(groupKey).push(it)
  }

  const rows = []
  for (const gk of order) {
    const group = byOwner.get(gk)
    // 代表 = description（没有就取第一条）
    const rep = group.find((x) => x.part === 'description') ?? group[0]
    const parts = group.filter((x) => x.key !== rep.key)
    const anyOverridden = group.some((x) => x.overridden)
    if (overriddenOnly && !anyOverridden) continue
    rows.push({ rep, parts, anyOverridden })
  }
  return rows
}

/**
 * 画**左栏分组的条目块**（2026-10-12 改版）。
 *
 * 🔴 **分组由服务端回**（`promptState.groups`）⇒ 这里**动态建 DOM**
 *    （旧版是三个手写死的 `<section>`）。⭐ 这样增删分组**不用改前端**。
 * ⚠️ **兜底**：服务端没回 `groups`（例如页面连到旧进程）时用 `PROMPT_GROUP_FALLBACK`
 *    的顺序，标题退化成 group id（**难看但能读**，且不会空白）。
 */
function renderPromptsList() {
  const host = document.getElementById('prompts-groups')
  if (!host) return
  const rows = promptRows()

  // 分组清单：服务端优先，兜底用本地顺序
  const groups = promptState.groups.length > 0
    ? promptState.groups
    : PROMPT_GROUP_FALLBACK.map((id) => ({ id, title: id, about: '', order: 0 }))

  host.replaceChildren()
  let rendered = 0
  for (const g of groups) {
    const gRows = rows.filter((r) => r.rep.zone === g.id)
    if (gRows.length === 0) continue
    rendered += gRows.length

    const sec = h('section', { class: 'set-section' })
    sec.dataset.promptGroup = g.id
    sec.append(h('h3', { class: 'set-section-title', text: g.title }))
    // ⭐⭐ **组说明**——用户要的"这组是给谁看的、什么时候看"（服务端回，前端不编）。
    if (g.about) sec.append(h('p', { class: 'prompt-group-about', text: g.about }))
    const box = h('div', { class: 'prompt-list' })
    for (const r of gRows) box.append(promptCard(r))
    sec.append(box)
    host.append(sec)
  }
  if (rendered === 0) {
    host.append(h('p', { class: 'set-desc', text: promptState.filter === 'overridden' ? '没有改过的条目。' : '（无）' }))
  }
  const cnt = document.getElementById('prompts-count')
  if (cnt) cnt.textContent = String(rendered)
}

/**
 * ⭐ **画「跳到」下拉**（用户要求：把条目按标题列出来，选一条就跳，免得划很久）。
 *
 * ⚠️ **每次重画都重建选项**（列表/筛选会变，缓存会漂）；
 *    并用 `optgroup` 按**分组**归类，长列表里好找。
 * ⚠️ **下拉里只列"代表条目"** —— 与左栏列表**同一份数据源**（`promptRows()`），
 *    否则会出现"下拉里能选、列表里没有"的不一致。
 */
function renderPromptsJump() {
  const sel = document.getElementById('prompts-jump')
  if (!sel) return
  sel.replaceChildren()
  const rows = promptRows()
  const groups = promptState.groups.length > 0
    ? promptState.groups
    : PROMPT_GROUP_FALLBACK.map((id) => ({ id, title: id, about: '', order: 0 }))
  for (const g of groups) {
    const gRows = rows.filter((r) => r.rep.zone === g.id)
    if (gRows.length === 0) continue
    const grp = document.createElement('optgroup')
    grp.label = g.title
    for (const r of gRows) {
      const o = document.createElement('option')
      o.value = r.rep.key
      // ⚠️ 只给标题（`owner`）——用户要的是"把对应提示词标题列出来"。
      o.textContent = r.anyOverridden ? `${r.rep.owner}（已改过）` : r.rep.owner
      if (r.rep.key === promptState.selected) o.selected = true
      grp.append(o)
    }
    sel.append(grp)
  }
  // ⚠️ 若当前选中的条目被筛掉了 ⇒ 下拉没有匹配项 ⇒ 视觉上会跳到第一项，
  //    但 `promptState.selected` 还没变 ⇒ 两者不一致（界面在撒谎）。
  //    ⇒ 以**实际能显示的第一项**为准，把 selected 同步过去。
  const first = sel.querySelector('option')
  if (first !== null && sel.value !== promptState.selected) {
    promptState.selected = sel.value
  }
  // 一个都没有（筛选后为空）⇒ 清掉选中，右栏显示空态。
  if (first === null) promptState.selected = ''
}


/**
 * ⭐⭐⭐ **右栏（宽屏）/ 卡片就地展开（窄屏）** —— 同一份逻辑按宽度分流。
 *
 * 🔴 **为什么必须分流**（用户要求"窄屏就用现在的设计"）：
 *   · **宽屏**：右栏是**详情区** —— 显示选中那条；卡片本体**不再展开**。
 *   · **窄屏**：**没有右栏** ⇒ 保持原设计：点卡片就地展开它的编辑区。
 *   ⚠️ 判据用 `isNarrow()`（与 CSS 断点共用 900），**不另写数字**。
 */
function renderPromptsDetailOrInline() {
  const detail = document.getElementById('prompts-detail')
  if (detail) {
    if (isNarrow()) {
      // 窄屏：右栏整块不渲染（CSS 也隐藏它，这里再省一次 DOM 构建）。
      detail.replaceChildren()
    } else {
      detail.replaceChildren(promptDetailPane())
    }
  }
}

/** 取当前选中的条目（`undefined` = 没有）。 */
function selectedPrompt() {
  return promptState.items.find((x) => x.key === promptState.selected)
}

/**
 * **画一条提示词的卡片**（含说明字段 + 展开查看/编辑）。
 *
 * ⭐⭐ **2026-10-12 改版：一个工具 = 一张卡**（用户要求"该合并的合并"）。
 *    旧版一个工具占**三条**（说明书 / 参数表 / 返回格式），而后者往往只有两三行
 *    ⇒ 列表里全是碎片、**看不出这是一个工具**。
 *    ⇒ 现在由 `promptRows()` 把它们合成一行，本函数接受 `{ rep, parts, anyOverridden }`：
 *      `rep` 是代表条目（description），`parts` 是随行的参数表 / 返回格式。
 *
 * ⭐ 六个字段**逐条显示**（用户要求）：干什么 / 属于谁 / 注入方式 / 破缓存 / 源文件 / 热生效。
 * @param row - `promptRows()` 产出的一行：`{ rep, parts, anyOverridden }`。
 * @returns 卡片元素。
 */
function promptCard(row) {
  const it = row.rep
  const parts = row.parts ?? []
  const anyOverridden = row.anyOverridden === true
  const card = h('div', { class: 'prompt-card' })
  // ⭐⭐ **给卡片一个稳定标识**（`data-prompt-key`）。
  //    🔴 **为什么必须有**：CDP 探针原先按**下标**取卡片（`cards[idx]`），而卡片会被
  //    `renderPromptsPage()` 重画、且列表顺序/筛选会变 ⇒ **下标会漂移** ⇒
  //    探针在"另一个条目"上断言（本项目记过同族：**按下标引用一组同类东西是脆弱写法**）。
  //    ⭐ 有了这个属性，探针可以直接 `querySelector('[data-prompt-key="…"]')` ——
  //    既稳，也让"测的是哪一条"在 DOM 里可读。
  card.dataset.promptKey = it.key
  // ⭐ 合并卡：把随行的 key 也写进 DOM，探针/测试能据此断言"这三条确实在一张卡里"。
  if (parts.length > 0) card.dataset.promptParts = parts.map((p) => p.key).join(',')

  // ── 标题行：工具/功能名 + 标记 ──
  const head = h('div', { class: 'prompt-head' })
  head.append(h('strong', { text: it.owner }))
  // ⭐ "已改过"标记：让用户一眼看出哪些不是原版。
  //    ⚠️ 合并卡按**整卡**判（三条里任意一条被改过就算）—— 否则筛选到"已改过"时
  //       会看到一张缺了参数的卡（`promptRows()` 里已按整卡筛）。
  if (anyOverridden) head.append(h('span', { class: 'prompt-tag prompt-tag-changed', text: '已改过' }))
  // ⭐⭐ 写回三态标签（2026-10-12 新增）。
  //    🔴 **为什么必须显示**：写回**保留覆盖项**（用户裁定）⇒ 覆盖值会一直挡着源码。
  //      不显示状态的话，用户**看不出写回做过没有**，也看不出"改了源码怎么没生效"。
  const wbStates = [it, ...parts].map((x) => x.writeBackState).filter((s) => s !== '')
  if (wbStates.includes('edited')) {
    head.append(h('span', { class: 'prompt-tag prompt-tag-edited', text: '⚠️ 已改未写回' }))
  } else if (wbStates.includes('written')) {
    head.append(h('span', { class: 'prompt-tag prompt-tag-written', text: '✅ 已写回源码' }))
  }
  if (!it.editable) head.append(h('span', { class: 'prompt-tag', text: '只读' }))
  card.append(head)

  // ── 干什么 ──
  card.append(h('p', { class: 'prompt-purpose', text: it.purpose }))

  // ── ⭐⭐ **随行的参数表 / 返回格式**（合并卡才有）──
  //
  // 🔴 **为什么要显示**：旧版它们是**两个独立列表项**，而正文（渲染后的 schema 文本）
  //    在旧构建里是**空的** ⇒ 用户看到"列了却没内容"。
  //    ⇒ 现在①合并进本卡 ②正文有真内容（`tools.ts` 注册时渲染后登记）。
  // ⚠️ **默认折叠**（`<details>`）：它们通常很短，展开会撑长列表。
  if (parts.length > 0) {
    const det = document.createElement('details')
    det.className = 'prompt-parts'
    // ⭐ 记住展开状态：列表重画（保存/筛选/加载）时不该把用户展开的卡收回去。
    //    ⚠️ 否则会出现"我展开看参数，它自己又合上了"（与本项目记过的"重画冲掉状态"同族）。
    if (promptState.partsOpen.has(it.key)) det.open = true
    det.addEventListener('toggle', () => {
      if (det.open) promptState.partsOpen.add(it.key)
      else promptState.partsOpen.delete(it.key)
    })
    const sum = document.createElement('summary')
    const names = { parameters: '参数表', output: '返回格式' }
    sum.textContent = `附：${parts.map((p) => names[p.part] ?? p.part).join(' / ')}（只读）`
    det.append(sum)
    for (const p of parts) {
      // 🔴 **缺正文就自己拉**（与 `promptDetailPane` 同一手法）——
      //    ⚠️ 只靠 `loadPromptText` 那条路不够：卡片**渲染时**就该发起加载，
      //      否则用户展开会一直停在"读取中…"（**假加载态**，本批实测踩到）。
      const txt = promptState.text[p.key]
      if (txt === undefined) void loadPromptText(p.key)
      det.append(h('p', { class: 'prompt-part-label', text: `▸ ${names[p.part] ?? p.part} —— ${p.purpose}` }))
      det.append(h('pre', { class: 'prompt-pre prompt-part-pre', text: txt ?? '读取中…' }))
    }
    card.append(det)
  }

  // ── 说明表（六件事里的后四件；前两件在标题与 purpose 里）──
  const rows = h('div', { class: 'prompt-meta' })
  const addRow = (label, value, cls) => {
    rows.append(h('span', { class: 'prompt-meta-label', text: label }))
    rows.append(h('span', { class: cls ?? '', text: value }))
  }
  addRow('注入方式', it.injectMode)
  // ⚠️ 破缓存要**醒目**：这是用户最容易忽略、代价最大的一条。
  if (it.breaksCache === 'yes') addRow('缓存影响', '⚠️ 会破坏前缀缓存（改一个字即全废一次）', 'prompt-warn')
  else if (it.breaksCache === 'no') addRow('缓存影响', '✅ 不破坏前缀缓存')
  else addRow('缓存影响', '— 与主会话缓存无关（不进主会话）')
  addRow('源文件', it.sourceFile)
  if (it.hotReload === 'immediate') addRow('保存后', '✅ 立即生效（无需重启）', 'prompt-ok')
  // ⭐⭐ 第三档（2026-10-12 新增）：**能改，但要重启才生效**。
  //    ⚠️ 必须如实说——原来标"不可改"是低估（重启后明明生效），
  //      若标"立即生效"则是撒谎（`dsh-commands` 注册时固化 descriptor，没有 getter 通路）。
  else if (it.hotReload === 'restart') addRow('保存后', '⚠️ 需重启实例才生效（本页改动已存，但运行时不会自动重读）', 'prompt-warn')
  else addRow('保存后', '🔒 不可改', 'prompt-warn')
  card.append(rows)

  // ── 只读说明（为什么不能改）──
  if (!it.editable && it.readonlyWhy) {
    card.append(h('p', { class: 'set-desc', text: `为什么只读：${it.readonlyWhy}` }))
  }

  // ── 校验规则提示（让用户改之前就知道边界）──
  const checkNotes = []
  for (const c of it.checks ?? []) {
    if (c.kind === 'maxChars') checkNotes.push(`最多 ${c.max} 字符（${c.why}）`)
    else if (c.kind === 'englishOnly') checkNotes.push('必须全英文（中文会让该功能静默失效）')
    else if (c.kind === 'fencesBalanced') checkNotes.push('markdown 围栏必须成对')
    else if (c.kind === 'nonEmpty') checkNotes.push('不能为空')
    // ⭐ 插槽校验要把"必须保留哪些"说清（否则用户改错名字只知道被拒，不知道正确的名字）。
    else if (c.kind === 'slots') checkNotes.push(`必须保留插槽：${(c.tokens ?? []).map((t) => `{{${t}}}`).join('、')}`)
  }
  if (checkNotes.length > 0) {
    card.append(h('p', { class: 'set-desc', text: `保存时会校验：${checkNotes.join('；')}。` }))
  }


  // ── 点整块 = 选中（宽屏）/ 展开（窄屏）──
  //
  // 🔴 **两种行为按宽度分流**（用户要求"窄屏就用现在的前端设计"）：
  //    · **宽屏**：点一下把这条**选中到右栏**（右栏是唯一的编辑场所）；
  //    · **窄屏**：没有右栏 ⇒ 点一下**就地展开**它的编辑区（原设计）。
  //    ⚠️ 判据用 `isNarrow()`（与 CSS 断点共用 900，不另写数字）。
  card.classList.add('prompt-card-clickable')
  if (!isNarrow() && it.key === promptState.selected) card.classList.add('prompt-card-active')
  card.addEventListener('click', (e) => {
    // ⚠️ **点里面的按钮不算"点卡片"**（否则点「恢复默认」会连带切换选中）。
    if (e.target.closest('button') !== null) return
    selectPromptKey(it.key)
  })

  // ── 操作行（窄屏用：「查看/编辑」就地展开；宽屏用：提示"在右侧编辑"）──
  const acts = h('div', { class: 'prompt-acts' })
  if (isNarrow()) {
    const viewBtn = h('button', { type: 'button', class: 'prompt-btn', text: promptState.openKey === it.key ? '收起' : '查看/编辑' })
    viewBtn.addEventListener('click', () => {
      promptState.openKey = promptState.openKey === it.key ? '' : it.key
      renderPromptsPage()
      if (promptState.openKey === it.key) void loadPromptText(it.key)
    })
    acts.append(viewBtn)
    if (it.overridden) {
      const resetBtn = h('button', { type: 'button', class: 'prompt-btn', text: '恢复默认' })
      resetBtn.addEventListener('click', () => void resetPrompt(it.key))
      acts.append(resetBtn)
    }
    card.append(acts)
    // 窄屏：就地展开编辑区（原设计）。
    if (promptState.openKey === it.key) card.append(promptEditorInline(it))
  } else {
    // 宽屏：卡片只是"选择器"，编辑都在右栏 ⇒ 这里不放任何按钮（避免两处入口）。
    card.append(acts)
  }
  return card
}

/**
 * ⭐ **选中一条**（宽屏：切右栏；窄屏：就地展开）。
 *
 * ⚠️ **切走时清掉"编辑中"状态** —— 否则在 A 上点了「编辑」、再点 B，
 *    右栏会带着"编辑中"的旗标显示 B（**界面在撒谎**：B 明明没在编辑）。
 * @param key - 稳定键。
 */
function selectPromptKey(key) {
  // ⚠️ **同一条重复选中也要滚**（用户 2026-10-02 的场景就是这个）：
  //    他在下拉里再选一次当前那条 ⇒ 期望"列表跳回去"，而不该因为
  //    "选中项没变"就什么都不做（那正是"点了没反应"）。
  if (promptState.selected === key) {
    scrollPromptCardIntoView(key)
    return
  }
  promptState.selected = key
  promptState.editingKey = ''
  renderPromptsPage()
  void loadPromptText(key)
  // ⭐⭐ 用户 2026-10-02 要求：**用顶部下拉选中时，左侧列表要跳到那一条**。
  //    🔴 **必须在 `renderPromptsPage()` 之后调** —— 重画会把列表重建、
  //       滚动位置清零；先滚后画等于白滚（本项目"滚动记忆"那条知识的同族）。
  scrollPromptCardIntoView(key)
}

/**
 * ⭐ **把左侧列表滚到指定条目**（用户 2026-10-02 要求）。
 *
 * 🔴🔴 **判据与坑**（都是本项目记过的）：
 *  · **滚动容器不是 `.prompt-card` 的父级**，而是**真正在滚的那个祖先** ——
 *    判据是 `scrollHeight > clientHeight`（`scrollHostOf`），**不是**"有没有 overflow:auto"；
 *    这里优先用 `.prompt-side-scroll`（宽屏列表的滚动区），取不到再退回 `scrollHostOf`。
 *  · **必须在渲染之后调用**（重画会重置滚动位置）。
 *  · 用 `block:'nearest'` 而不是 `'center'`：**已经在视野里就不动**，
 *    避免用户手动浏览时被莫名拽走。
 * @param key - 要定位的条目稳定键。
 */
function scrollPromptCardIntoView(key) {
  if (key === '') return
  // ⚠️ 卡片是重画出来的 ⇒ 用 `requestAnimationFrame` 等这一帧的 DOM 落地。
  requestAnimationFrame(() => {
    // 找那张卡片：⭐ 属性名是 **`data-prompt-key`**（`promptCard()` 里就有的稳定标识，
    //    当初就是为"按下标取卡片会漂移"而加的 —— 正好这里也用它）。
    let card = document.querySelector(`.prompt-card[data-prompt-key="${CSS.escape(key)}"]`)
    if (!card) card = document.querySelector('.prompt-card.prompt-card-active')
    if (!card) return
    const host = document.querySelector('.prompt-side-scroll') ?? scrollHostOf(card)
    if (!host) return
    // ⭐ 先算"卡片相对容器的位置"，只有**不在视野内**才滚。
    //    🔴🔴 **不用 `scrollIntoView`** —— 实测它在**嵌套滚动容器**里滚不到位
    //      （`block:'nearest'` 会去滚外层/整页，卡片仍停在视口外：实测 `cardTop=986`
    //       而容器底边只有 830）。⇒ 改为**直接算并设置容器的 `scrollTop`**，
    //      这是确定性的（也避免 `behavior:'smooth'` 的异步时序）。
    const c = card.getBoundingClientRect()
    const hn = host.getBoundingClientRect()
    const above = c.top < hn.top
    const below = c.bottom > hn.bottom
    if (!above && !below) return
    // 目标：把卡片顶对齐到容器顶部（留 8px 余量）；已在上方时同理。
    const delta = above ? c.top - hn.top - 8 : c.bottom - hn.bottom + 8
    host.scrollTop = host.scrollTop + delta
  })
}

/**
 * ⭐⭐⭐ **宽屏右栏：详情 / 编辑区**（用户要求的"右边栏详情"）。
 *
 * 两个状态（用户明确要求）：
 *  · **只读**（默认）：完整六字段 + 正文（`pre`，不可改）+「编辑」「恢复默认」按钮；
 *  · **编辑中**：正文换成 textarea，按钮换成「保存」「取消」。
 * ⚠️ **初始只读**是为了"不会误改"——"改"必须是一个**显式动作**。
 * @returns 右栏元素。
 */
function promptDetailPane() {
  const box = h('div', { class: 'prompt-detail-inner' })
  const it = selectedPrompt()
  if (it === undefined) {
    box.append(h('p', { class: 'empty', text: '从左侧选择一条提示词。' }))
    return box
  }
  const editing = promptState.editingKey === it.key

  // ⭐ **头部**（固定不滚）：归属 + 标记 + 一句话用途。
  //    🔴 **六字段不放这里**（用户 2026-09-29 要求："右栏就不用那6个字段了，左栏已经有了"）
  //    —— 左栏列表块里六字段齐全，右栏再重复一遍是**同一件事写两处**，
  //       而且会把正文挤到屏幕外（右栏的主要用途是**看/改正文**）。
  const head = h('div', { class: 'pd-head' })
  const headLine = h('div', { class: 'prompt-head' })
  headLine.append(h('strong', { text: it.owner }))
  if (it.overridden) headLine.append(h('span', { class: 'prompt-tag prompt-tag-changed', text: '已改过' }))
  if (!it.editable) headLine.append(h('span', { class: 'prompt-tag', text: '只读' }))
  head.append(headLine)
  head.append(h('p', { class: 'prompt-purpose', text: it.purpose }))
  // ⚠️ 只保留**改正文时必须知道**的两条（其余在左栏）：
  //    · 破缓存（代价最大）· 只读原因（否则用户会奇怪为什么不能编辑）
  if (it.breaksCache === 'yes') {
    head.append(h('p', { class: 'prompt-warn', text: '⚠️ 这条会破坏前缀缓存：保存后所有活跃会话的 node 0 会被整段重写、前缀缓存全废一次。' }))
  }
  if (!it.editable && it.readonlyWhy) {
    head.append(h('p', { class: 'set-desc', text: `只读：${it.readonlyWhy}` }))
  }
  box.append(head)

  const cur = promptState.text[it.key]
  if (cur === undefined) {
    // ⭐ **缺正文就自己拉**（唯一必经的渲染路径，见 `promptEditorInline` 的说明）。
    void loadPromptText(it.key)
    box.append(h('p', { class: 'set-desc', text: '读取中…' }))
    return box
  }

  // ⭐⭐⭐ **正文区**（`flex:1` + `overflow:auto`）——**只有它滚**（用户要求：
  //    "提示词部分是在屏幕区域内滚动才对"）。
  const body = h('div', { class: 'pd-body' })

  // ── 状态行（改于何时 / 是默认值）──
  const d = promptState.detail[it.key]
  if (it.overridden && d?.updatedAt) {
    body.append(h('p', { class: 'set-desc', text: `当前是你改过的版本（改于 ${fmtTime(d.updatedAt)}）。` }))
  } else if (it.overridden) {
    body.append(h('p', { class: 'set-desc', text: '当前是你改过的版本。' }))
  } else {
    body.append(h('p', { class: 'set-desc', text: '当前是源码默认值（你还没改过它）。' }))
  }

  const ta = h('textarea', { class: 'prompt-textarea' })
  if (editing && it.editable) {
    ta.value = cur
    ta.rows = 16
    body.append(h('p', { class: 'set-desc', text: '编辑中（改完点「保存」）：' }))
    body.append(ta)
    body.append(h('p', { class: 'set-desc', text: `当前 ${cur.length} 字符。` }))
  } else {
    body.append(h('p', { class: 'set-desc', text: '当前内容：' }))
    body.append(h('pre', { class: 'prompt-pre', text: cur }))
  }
  box.append(body)

  // ⭐⭐⭐ **底部按钮条**（固定不滚 —— 用户要求："编辑、恢复默认、退回历史版本应该在底部
  //    占位的，不跟随滚动的"）。
  const foot = h('div', { class: 'pd-foot' })
  if (editing && it.editable) {
    const saveBtn = h('button', { type: 'button', class: 'primary prompt-btn prompt-save', text: '保存' })
    saveBtn.addEventListener('click', () => void savePrompt(it.key, ta.value))
    const cancelBtn = h('button', { type: 'button', class: 'prompt-btn', text: '取消' })
    cancelBtn.addEventListener('click', () => {
      // ⭐ 取消 = 退出编辑态**不改任何东西**（`text` 缓存没动，重画即回原值）。
      promptState.editingKey = ''
      renderPromptsPage()
    })
    foot.append(saveBtn, cancelBtn)
  } else {
    if (it.editable) {
      const editBtn = h('button', { type: 'button', class: 'primary prompt-btn prompt-edit', text: '编辑' })
      editBtn.addEventListener('click', () => {
        promptState.editingKey = it.key
        renderPromptsPage()
      })
      foot.append(editBtn)
    }
    if (it.overridden) {
      const resetBtn = h('button', { type: 'button', class: 'prompt-btn prompt-reset', text: '恢复默认' })
      resetBtn.addEventListener('click', () => void resetPrompt(it.key))
      foot.append(resetBtn)
    }
    // ⭐⭐⭐ **「写回源码」按钮**（2026-10-12 新增，用户要求）。
    //
    // 🔴🔴 **它在做什么、不在做什么**（措辞必须准确，否则用户会误解）：
    //    · **在做的**：把当前生效文本**固化进 `src/*.ts` 的常量**，让它进版本库、
    //      不怕"恢复默认"、不随换机器丢失。
    //    · **不在做的**：**它不改变运行时行为**——运行期永远读覆盖层，
    //      所以这条编辑**本来就在生效**，写回**不需要重启**（用户确认过这个判据）。
    //    ⚠️ 唯一的例外是命令描述（`hotReload === 'restart'`）：那种**本来就要重启才生效**。
    //
    // ⚠️ **只在有改动、且与源码不同时**才给按钮——否则点了只会回一句"已相同"，
    //    徒增噪音（`already-same` 那条分支仍保留，用于批量写回的场景）。
    if (it.canWriteBack === true && it.writeBackState === 'edited') {
      const wbBtn = h('button', {
        type: 'button',
        class: 'prompt-btn prompt-writeback',
        text: '写回源码',
      })
      wbBtn.addEventListener('click', () => void writeBackPrompt(it.key))
      foot.append(wbBtn)
    }
    // ⭐⭐ **「历史版本」按钮**（用户要求："退回历史版本也应该有个按钮入口，不要全展开。
    //     点击后弹窗显示可选历史版本，应该有预览功能"）。
    //     ⚠️ **不再把历史整段铺在正文下面**（那会占掉正文的可见高度，且版本多了很长）。
    const histBtn = h('button', { type: 'button', class: 'prompt-btn prompt-history-btn', text: '历史版本' })
    histBtn.addEventListener('click', () => openHistoryDialog(it))
    foot.append(histBtn)
  }
  box.append(foot)
  return box
}

/**
 * ⭐⭐⭐ **历史版本弹窗**（用户要求：按钮入口 + 弹窗里选 + **有预览**）。
 *
 * 🔴 **为什么用原生 `<dialog>` + `showModal()`**：
 *    · 它自带**模态语义**（焦点陷阱、Esc 关闭、`::backdrop`）—— 自己造遮罩要写一堆
 *      且容易漏掉键盘可达性；
 *    · ⚠️ 与 `confirm()` 的区别：`confirm` 只能问"确定吗"，而这里需要**列出版本 + 预览**，
 *      所以必须是真弹窗。
 *
 * ⭐ **预览**：点某一版 ⇒ 右侧/下方显示那一版全文（`pre`），确认后才回退。
 *    🔴 **为什么预览是必需的**：历史文件名只有时间戳，**用户无法凭时间判断哪一版是他要的**
 *      ⇒ 不预览就等于让他盲选（而回退**会覆盖当前内容**）。
 * @param it - 条目元数据。
 */
function openHistoryDialog(it) {
  const d = promptState.detail[it.key]
  const hist = d?.history ?? []

  const dlg = document.createElement('dialog')
  dlg.className = 'prompt-dlg'
  dlg.dataset.promptKey = it.key
  /**
   * 🔴🔴 **关闭 = 关掉 + 从 DOM 摘掉**（本次修的真 bug）。
   *
   * ⚠️ **为什么不用 `dlg.addEventListener('close', ...)`**（我第一版就是这么写的，**没用**）：
   *    本环境实测 **`<dialog>` 的 `close` 事件根本不触发** —— 最小实验：
   *    `d.addEventListener('close', …); d.showModal(); d.close()`
   *    ⇒ `closeEventFired: false`、元素仍在 DOM 里。
   *    ⭐ 所以**不能依赖那个事件**，必须让"关闭"这个动作**自己**完成清理。
   * ✅ 做法：**所有关闭入口都走同一个 `closeAndRemove()`**（唯一漏斗，
   *    不会出现"某条路径关了但没清理"）。
   *
   * 🔴 **为什么"关闭"必须同时做到"不可见"与"不残留"**（两个层次，缺一即 bug）：
   *    · **不可见**靠 CSS（`dialog.prompt-dlg:not([open]){display:none}`）——
   *      ⚠️ 否则 `display:flex` 会盖掉 UA 的 `display:none`，元素从"居中模态"
   *      变成"左上角普通块"（用户看到的就是"两个窗口、位置不一样、关不掉"）；
   *    · **不残留**靠这里的 `remove()` —— 否则每开一次就在 DOM 里堆一个。
   *    ⚠️ 这类问题**只在开/关第二次时才暴露**（第一次看起来"关了"）。
   */
  const closeAndRemove = () => {
    dlg.close()
    dlg.remove()
  }
  /**
   * ⭐⭐ **兜底清扫**：把**已经关掉但还留在 DOM 里**的历史弹窗清掉。
   *
   * 🔴 **为什么要有它**（而不是只靠那几个关闭入口）：弹窗的关闭路径**不止一条**
   *    （关闭按钮 / backdrop / Esc / 浏览器行为 / 将来的新入口），漏一条就残留。
   *    ⭐ 判据：**凡是"有多个关闭入口"的东西，都要有一个"打开时清扫"的兜底** ——
   *      这样即使将来加了新入口忘了接清理，也只会残留到下次打开，不会永久堆积。
   *    ⚠️ **必须在创建时（而不是某个分支里）执行** —— 本函数有"无历史"的提前 `return`
   *      分支，放在分支里那条路径就没有清扫。
   */
  for (const old of document.querySelectorAll('dialog.prompt-dlg')) {
    if (!old.open) old.remove()
  }

  const head = h('div', { class: 'prompt-dlg-head' })
  head.append(h('strong', { text: `「${it.owner}」的历史版本` }))
  const closeX = h('button', { type: 'button', class: 'prompt-btn', text: '关闭' })
  closeX.addEventListener('click', () => closeAndRemove())
  head.append(closeX)
  dlg.append(head)

  if (hist.length === 0) {
    dlg.append(h('p', { class: 'set-desc', text: '还没有历史版本 —— 它第一次被改动时才会产生。' }))
    document.body.append(dlg)
    dlg.showModal()
    return
  }

  const bodyRow = h('div', { class: 'prompt-dlg-body' })
  // 左：版本列表（时间）
  const listBox = h('div', { class: 'prompt-dlg-list' })
  // 右：预览
  const previewBox = h('div', { class: 'prompt-dlg-preview' })
  previewBox.append(h('p', { class: 'set-desc', text: '点左侧任一版本查看它的内容。' }))

  let picked = ''
  const showPreview = async (file) => {
    picked = file
    previewBox.replaceChildren(h('p', { class: 'set-desc', text: '读取中…' }))
    try {
      const r = await getJson(`/prompt/history?key=${encodeURIComponent(it.key)}&file=${encodeURIComponent(file)}`)
      previewBox.replaceChildren()
      // ⭐ **预览要带标题条**：说明"这是哪一版、多少字符"。
      //    🔴 为什么：短内容时右边只有一行字、大片空白 ⇒ **看着像坏了**
      //    （截图实测）；给一条说明既解释了这是什么，也让空白不再像故障。
      const bar = h('div', { class: 'prompt-dlg-preview-bar' })
      bar.append(h('span', { class: 'dim', text: `预览：${histLabel(file)} · ${(r.text ?? '').length} 字符` }))
      previewBox.append(bar)
      // ⚠️ 用真换行渲染（`pre` + `pre-wrap`）。
      previewBox.append(h('pre', { class: 'prompt-pre prompt-dlg-pre', text: r.text ?? '' }))
      footerHint.textContent = '这一版就是下面要回退到的内容。'
    } catch (err) {
      previewBox.replaceChildren(h('p', { class: 'set-desc', text: `读不到这一版：${err instanceof Error ? err.message : String(err)}` }))
    }
  }

  for (const f of hist) {
    const b = h('button', { type: 'button', class: 'prompt-btn prompt-dlg-item', text: histLabel(f) })
    b.dataset.histFile = f
    b.addEventListener('click', () => {
      // 选中态：只标一个
      for (const x of listBox.querySelectorAll('.prompt-dlg-item')) x.classList.remove('active')
      b.classList.add('active')
      void showPreview(f)
    })
    listBox.append(b)
  }
  bodyRow.append(listBox, previewBox)
  dlg.append(bodyRow)

  // 底部：回退（需要先选一版）+ 关闭
  const foot = h('div', { class: 'prompt-dlg-foot' })
  const footerHint = h('span', { class: 'set-desc', text: `共 ${hist.length} 版，越靠上越新。` })
  const doBtn = h('button', { type: 'button', class: 'primary prompt-btn', text: '回退到这一版' })
  doBtn.dataset.histRestore = '1'
  doBtn.addEventListener('click', () => {
    if (picked === '') { footerHint.textContent = '请先在左侧点选一个版本。'; return }
    // 🔴 **回退前再确认**（它会覆盖当前内容）。
    const ok = confirm('确定回退到这一版？\n\n当前的提示词会被替换成你刚预览的那一版（当前这版会留在历史里）。')
    if (!ok) return
    // ⚠️ 走同一个"关+清理"漏斗（别直接 `dlg.close()`，那会留下残留）。
    closeAndRemove()
    void restorePrompt(it.key, picked)
  })
  foot.append(footerHint, doBtn)
  dlg.append(foot)

  // ⚠️ 点 backdrop 关闭（原生 dialog 默认不关）——用"点在 dialog 之外"判定。
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeAndRemove() })
  /**
   * ⚠️ **Esc 键也走同一条清理路径**。
   *
   * 🔴 为什么需要单独处理：按 Esc 时**浏览器自己**调用 `close()`（不是我们的代码），
   *    而本环境 `close` 事件**不触发**（实测）⇒ 那条路径不会清理 ⇒ **按 Esc 关闭会残留**。
   *    ⇒ 拦 `cancel`（Esc 触发它，且它**可 `preventDefault`**）自己关。
   */
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault()
    closeAndRemove()
  })
  document.body.append(dlg)
  dlg.showModal()
  // 默认预览**最新那一版**（用户多半要最近的一次改动）。
  const firstBtn = listBox.querySelector('.prompt-dlg-item')
  if (firstBtn !== null) firstBtn.click()
}

/**
 * **窄屏：卡片就地的编辑区**（保持原设计 —— 一展开就是可编辑的 textarea）。
 *
 * ⚠️ 与宽屏右栏的差别是**有意的**：窄屏空间小、没有右栏，
 *    "再点一次进入编辑态"会多一层点击 ⇒ 窄屏**展开即可编**。
 * @param it - 条目。
 * @returns 编辑区元素。
 */
function promptEditorInline(it) {
  const box = h('div', { class: 'prompt-editor' })
  const cur = promptState.text[it.key]
  if (cur === undefined) {
    // ⭐⭐⭐ **缺正文就自己拉**（把修复放在唯一必经之路上）。
    //    🔴 为什么要这样：`保存 / 恢复默认 / 回退` 都会让本地缓存的值失效，
    //       而重画后**只有本函数会读它** ⇒ 若在这里只显示"读取中…"、指望
    //       "某个调用方记得再拉一次"，那么**任何一个忘了拉的路径都会让界面永久卡住**
    //       （实测：恢复默认后编辑框一直转圈，因为重新拉取的唯一触发点是"点查看/编辑"）。
    //    ⭐ 判据：**修复要放在"唯一必经的渲染路径"上，不要放在"每个改值的入口"上** ——
    //       前者一处就够且不可能漏，后者要有几处就得改几处。
    void loadPromptText(it.key)
    box.append(h('p', { class: 'set-desc', text: '读取中…' }))
    return box
  }
  if (!it.editable) {
    // 只读项：只展示当前值（用户要求"也要展示，不能改"）。
    box.append(h('p', { class: 'set-desc', text: '以下是它的当前内容（只读）：' }))
    box.append(h('pre', { class: 'prompt-pre', text: cur }))
    return box
  }
  // ⭐ **如实显示"什么时候改的"**（未被覆盖时不显示"改动时间"—— 那是默认值，没有改动）。
  // ⚠️ **不要在这里写 markdown 的 `**`**：`h(..., {text})` 走的是 `textContent`，
  //    星号会**原样显示**出来（本项目页面文案一律纯文本）。
  const d = promptState.detail[it.key]
  if (it.overridden && d?.updatedAt) {
    box.append(h('p', { class: 'set-desc', text: `当前是你改过的版本（改于 ${fmtTime(d.updatedAt)}）。源码默认值仍保留，可用「恢复默认」回去。` }))
  } else if (it.overridden) {
    box.append(h('p', { class: 'set-desc', text: '当前是你改过的版本。源码默认值仍保留，可用「恢复默认」回去。' }))
  } else {
    box.append(h('p', { class: 'set-desc', text: '当前是源码默认值（你还没改过它）。' }))
  }
  box.append(h('p', { class: 'set-desc', text: '当前生效文本（可改）：' }))
  const ta = h('textarea', { class: 'prompt-textarea' })
  ta.value = cur
  ta.rows = 10
  box.append(ta)
  // ⚠️ **改协议前给二次确认**（用户要求第 5 条）——因为它是唯一"改完全废缓存"的那条。
  if (it.breaksCache === 'yes') {
    box.append(h('p', { class: 'prompt-warn', text: `⚠️ 这条会破坏前缀缓存：保存后所有活跃会话的 node 0 会被整段重写、前缀缓存全废一次。当前 ${cur.length} 字符。` }))
  } else {
    box.append(h('p', { class: 'set-desc', text: `当前 ${cur.length} 字符。` }))
  }
  const saveBtn = h('button', { type: 'button', class: 'primary prompt-btn prompt-save', text: '保存这条' })
  // ⭐⭐ **点保存 ⇒ 需要确认的弹窗 ⇒ 点确定就存**（就这么简单）。
  //    ⚠️ 传的是 `ta.value`（**输入框当下这一刻的内容**）——
  //      这是本功能唯一该存的来源；用加载时的 `cur` 会把用户的编辑存丢。
  saveBtn.addEventListener('click', () => void savePrompt(it.key, ta.value))
  box.append(saveBtn)
  // ⭐⭐ **历史版本区**（"备份回退"的入口；后端一直在写备份，这里是它第一次露出）。
  box.append(promptHistoryBox(it))
  return box
}

/**
 * **保存一条提示词**（用户 2026-09-29 明确要求的最简形态）。
 *
 * 流程就三步：**点「保存这条」→ 需要时弹确认框 → 点确定即落盘**。
 * 🔴 **不设任何中间状态**（曾经有过 `confirmKey` + 页内两步 + 草稿缓存，全是多余的）：
 *    弹窗是**阻塞**的，点确定那一刻 `text` 参数就是用户在输入框里写的内容
 *    ⇒ **不存在"重画吃掉编辑"的机会** ⇒ 那些机制没有存在理由。
 * @param key - 稳定键。
 * @param text - 输入框当下的内容。
 */
async function savePrompt(key, text) {
  const msg = document.getElementById('settings-msg-prompts')
  const item = promptState.items.find((x) => x.key === key)
  // ⚠️ **只有"会破坏前缀缓存"那条需要确认**（其余直接存，不打扰用户）。
  if (item && item.breaksCache === 'yes') {
    const ok = confirm(
      '这条提示词会破坏前缀缓存。\n\n'
      + '保存后所有活跃会话的 node 0 会被整段重写，前缀缓存全废一次。\n\n'
      + '确定保存吗？（旧版会留在历史里，可随时回退）',
    )
    if (!ok) return
  }
  try {
    const r = await postJson('/prompt/save', { key, text })
    // ⭐ 本地缓存同步成新值；`detail`（历史/改动时间）清掉 ⇒ 重画时由
    //    `promptEditor` / `promptHistoryBox` 自己按需拉回来。
    promptState.text[key] = text
    delete promptState.detail[key]
    if (msg) msg.textContent = `已保存：${key}${r.backupPath ? '（旧版已备份）' : ''}`
    await openPromptsPage({ keepMessage: true })
  } catch (err) {
    // 🔴 **校验失败走这里**（`postJson` 对非 2xx 抛错，错误体挂在 `err.body`）——
    //    ⚠️ 我第一版写成"看返回值 `r.ok`"，那永远为真（抛错时根本走不到）⇒ 校验信息被吞。
    const errs = err?.body?.errors
    const text2 = Array.isArray(errs) && errs.length > 0 ? errs.join('；') : (err instanceof Error ? err.message : String(err))
    if (msg) msg.textContent = `保存失败：${text2}`
    toast(text2, true)
  }
}

/**
 * 懒加载某条的当前文本 + 详情（避免一次拉全部正文）。
 *
 * 🔴🔴 **本函数的两个"已加载"判据必须分开**（这是一个被我自己的探针抓到的真 bug）：
 *    第一版写成 `if (promptState.text[key] !== undefined) return` —— 只看**文本**。
 *    ⚠️ 而 `savePrompt()` 在重画前**已经写了** `promptState.text[key]` ⇒
 *    紧接着调用本函数时**直接早退** ⇒ **`detail` 永远不被拉取**
 *    ⇒ 历史区拿到 `undefined` ⇒ 显示"还没有历史版本" —— 而历史明明有
 *    （**界面在撒谎**，正是本项目最忌讳的那类）。
 *    ⭐ 判据：**两个独立的数据源就要两个独立的"已加载"标记** ——
 *    用其中一个的存在去跳过另一个的加载，迟早错。
 */
async function loadPromptText(key) {
  const needText = promptState.text[key] === undefined
  const needDetail = promptState.detail[key] === undefined
  if (!needText && !needDetail) return
  // 占位：防并发重复请求（⚠️ 只在真需要文本时占位）。
  if (needText) promptState.text[key] = ''
  try {
    const r = await getJson(`/prompt?key=${encodeURIComponent(key)}`)
    if (r.ok) {
      // ⚠️ **文本只在需要时覆盖** —— 否则会把用户在编辑框里刚输的内容冲掉。
      if (needText) promptState.text[key] = r.current ?? ''
      promptState.detail[key] = {
        updatedAt: r.updatedAt ?? '',
        history: Array.isArray(r.history) ? r.history : [],
      }
    } else {
      if (needText) promptState.text[key] = `（读取失败：${r.error ?? ''}）`
      promptState.detail[key] = { updatedAt: '', history: [] }
    }
  } catch {
    if (needText) promptState.text[key] = '（读取失败）'
    promptState.detail[key] = { updatedAt: '', history: [] }
  }
  renderPromptsPage()
}

/** 把 `2026-09-29T07:12:33.123Z` 显示成人读的本地时间。 */
function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * ⭐ **把历史文件名显示成人读的时间**。
 *
 * 🔴 **不能按 `-` 切分取尾段**（我第一版就这么写，**实测被截断**）：
 *    文件名形如 `<消毒后的-key>-<ISO 时间戳>.txt`，而**key 自己就含连字符**
 *    （如 `tool-memj_promote-description`），且 ISO 里的 `:`/`.` 已被换成 `-`
 *    ⇒ `split('-').slice(-7)` 取到的**不是完整的 ISO**，界面上显示成
 *    `...01-43-27-60`（尾巴被吃掉，看不出是几毫秒/哪一秒）。
 *    ⭐ 判据：**用"形状"（正则）定位，不要用"位置"（切分）定位** ——
 *       时间戳有固定形状，而前缀的长度是可变的。
 * @param file - 历史文件名（含 `.txt`）。
 * @returns 显示用时间字符串（解析不出时回退成文件名）。
 */
function histLabel(file) {
  // 匹配 `YYYY-MM-DDTHH-MM-SS-mmmZ`（IsoStamp() 把 `:`/`.` 换成了 `-`）
  const m = /(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/.exec(file)
  if (m === null) return file.replace(/\.txt$/, '')
  // 还原成可被 `Date` 解析的形态
  const iso = m[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z')
  return fmtTime(iso)
}

/**
 * ⭐⭐ **历史版本区**（用户要求"备份回退"——这是它唯一露出的地方）。
 *
 * 🔴 **为什么必须做出来**：后端一直在写备份（每次保存都留一份旧值），
 *    但**界面上从来没有入口** ⇒ 用户根本不知道它存在、也用不上 ——
 *    那等于"功能没交付"（本项目判据：**做了但没人能用到 = 没做**）。
 *
 * ⚠️ 每条历史**只给"回退"按钮、不给"删除"**：删备份是破坏性动作，
 *    而这个功能的目的正是"别丢东西"；要清理就整目录清（人侧手工）。
 * @param it - 条目元数据。
 * @returns 历史区元素（无历史时返回一段说明，不隐藏 —— 让用户知道"这里会有东西"）。
 */
function promptHistoryBox(it) {
  const box = h('div', { class: 'prompt-history' })
  const d = promptState.detail[it.key]
  const hist = d?.history ?? []
  box.append(h('p', { class: 'set-desc', text: `历史版本（每次保存都会把上一版留在这里，共 ${hist.length} 版）：` }))
  if (hist.length === 0) {
    box.append(h('p', { class: 'set-desc', text: '（还没有历史版本 —— 它第一次被改动时才会产生。）' }))
    return box
  }
  for (const f of hist) {
    const row = h('div', { class: 'prompt-history-row' })
    // ⚠️ 用 `histLabel()`（**按形状解析**），不要按 `-` 切分 —— 见该函数的说明。
    row.append(h('span', { class: 'prompt-history-time', text: histLabel(f) }))
    const rb = h('button', { type: 'button', class: 'prompt-btn', text: '回退到这一版' })
    rb.dataset.restoreFile = f
    // ⭐ 同时标出它属于哪条（探针与人都能一眼看出"这是给哪一条的回退"）。
    rb.dataset.restoreKey = it.key
    rb.addEventListener('click', () => void restorePrompt(it.key, f))
    row.append(rb)
    box.append(row)
  }
  return box
}

/** ⭐⭐ **回退到某一版历史**（服务端会**走与保存同一条路径**：含校验 + 先备份当前版）。 */
async function restorePrompt(key, file) {
  const msg = document.getElementById('settings-msg-prompts')
  try {
    await postJson('/prompt/restore', { key, file })
    // ⭐ 缓存清掉 ⇒ 重画时 `promptEditor` 自己会把新值拉回来（见那边的说明）。
    delete promptState.text[key]
    delete promptState.detail[key]
    if (msg) msg.textContent = `已回退：${key}`
    await openPromptsPage({ keepMessage: true })
  } catch (err) {
    const errs = err?.body?.errors
    const t = Array.isArray(errs) && errs.length > 0 ? errs.join('；') : (err instanceof Error ? err.message : String(err))
    if (msg) msg.textContent = `回退失败：${t}`
  }
}

/**
 * **恢复某条的默认值**（删掉覆盖项）。
 *
 * ⭐ **二次确认**（用户 2026-09-29 要求："如果改了，恢复默认按钮也需要二次确认"）。
 *    ⚠️ 它**会丢掉你改过的内容**（虽然旧版进了历史，但页面上那条覆盖确实没了）
 *    ⇒ 与"保存"同级的破坏性动作，必须有确认。
 * @param key - 稳定键。
 */
async function resetPrompt(key) {
  const msg = document.getElementById('settings-msg-prompts')
  const it = promptState.items.find((x) => x.key === key)
  const label = it?.owner ?? key
  const ok = confirm(
    `把「${label}」恢复成源码默认值？\n\n`
    + '⚠️ 你改过的内容会被丢弃（当前这一版会留在历史里，之后仍可回退）。',
  )
  if (!ok) return
  try {
    await postJson('/prompt/reset', { key })
    // ⭐ 缓存清掉 ⇒ 重画时编辑区自己会把默认值拉回来（见 `promptDetailPane` 的说明）。
    delete promptState.text[key]
    delete promptState.detail[key]
    // ⚠️ 顺带退出编辑态：那条已经没有"你改过的内容"可编辑了。
    if (promptState.editingKey === key) promptState.editingKey = ''
    if (msg) msg.textContent = `已恢复默认：${key}`
    await openPromptsPage({ keepMessage: true })
  } catch (err) {
    const errs = err?.body?.errors
    const text2 = Array.isArray(errs) && errs.length > 0 ? errs.join('；') : (err instanceof Error ? err.message : String(err))
    if (msg) msg.textContent = `恢复失败：${text2}`
  }
}

/**
 * ⭐⭐⭐ **把某条提示词的改动「写回源码」**（2026-10-12 新增，用户要求）。
 *
 * ── 这个按钮到底在做什么（措辞必须准确）────────────────────────────────────
 * **在做的**：把**当前生效文本**固化进 `src/*.ts` 的常量 ⇒ 它进版本库、
 *   不怕"恢复默认"、不随换机器或拷库丢失。
 * **不在做的**：**它不改变运行时行为**——运行期读取值的优先级是
 *   `覆盖值 ?? 源码默认值`，所以这条编辑**本来就在生效**，
 *   ⇒ **写回不需要重启**（用户 2026-10-12 确认的判据）。
 *   ⚠️ **写回后覆盖项【保留】**（用户裁定）：写回是"固化"，不是"撤掉覆盖"。
 *      这也正是后面要提示"源码改动会被覆盖挡住"的原因。
 *
 * ⚠️ **唯一需要重启的情形**：`hotReload === 'restart'` 的条目（命令描述）——
 *   那种条目**本来就要重启才生效**（`dsh-commands` 注册时固化 descriptor，无 getter 通路）。
 *   ⇒ 提示语要**按这一档分叉**，不能一律说"无需重启"。
 *
 * 流程（用户要求）：**点按钮 → 弹窗确认 → 显示进度 → 报结果 → 提示是否需要重启**。
 * @param key - 稳定键。
 */
async function writeBackPrompt(key) {
  const msg = document.getElementById('settings-msg-prompts')
  const it = promptState.items.find((x) => x.key === key)
  const label = it?.owner ?? key
  const file = it?.sourceFile ?? '(未知)'
  const constName = it?.sourceConst ?? '(未知)'
  const needsRestart = it?.hotReload === 'restart'

  // ── ① 弹窗确认：把"要改哪个文件、会不会影响运行"一次说清 ──
  const lines = [
    `把「${label}」的当前内容写回源码？`,
    '',
    `目标文件：${file}`,
    `目标常量：${constName}`,
    '',
    '⭐ **这是"固化"，不是"生效"**：这条改动本来就在生效（运行期读的是覆盖层）。',
    '写回的意义是让它进版本库、不怕「恢复默认」、不随换机器丢失。',
    '',
    '⚠️ 写回后**覆盖项会保留** ⇒ 你之后直接改源码时，仍会被这条覆盖挡住。',
  ]
  if (needsRestart) {
    lines.push(
      '',
      '🔴 **注意：这一条属于「需重启才生效」**——它是命令描述，',
      '保存后运行时不会自动重读 ⇒ 想让改动真正起作用，**要重启实例**。',
    )
  }
  if (!confirm(lines.join('\n'))) return

  // ── ② 进度提示 ──
  if (msg) msg.textContent = `正在写回 ${label} …`
  try {
    const r = await postJson('/prompt/writeback', { key })
    const item = (r.items ?? []).find((x) => x.key === key) ?? (r.items ?? [])[0]
    const status = item?.status ?? '?'

    // ── ③ 结果 + ④ 是否需要重启 ──
    let text
    if (status === 'written') text = `已写回源码：${item.constName ?? constName}（${item.message ?? ''}）`
    else if (status === 'already-same') text = '源码里已经是这个值，无需写回。'
    else text = `写回失败：${item?.message ?? r.error ?? '未知原因'}`
    if (status === 'written' && needsRestart) text += '　⚠️ 该条需重启实例才生效。'
    if (msg) msg.textContent = text

    // ⭐ 三态与"已改过"标记都依赖服务端重算 ⇒ 重新拉一次列表。
    //    ⚠️ 清掉 detail 缓存，否则右栏还显示旧的状态行。
    delete promptState.detail[key]
    await openPromptsPage({ keepMessage: true })
    // ⚠️ `openPromptsPage` 会重画整页（含那行 msg）⇒ **重画后要把结果写回去**，
    //    否则用户看不到刚才的结果（本项目踩过"保存成功被重画冲掉"的坑）。
    const msg2 = document.getElementById('settings-msg-prompts')
    if (msg2) msg2.textContent = text
  } catch (err) {
    const errs = err?.body?.errors
    const t = Array.isArray(errs) && errs.length > 0 ? errs.join('；') : (err instanceof Error ? err.message : String(err))
    if (msg) msg.textContent = `写回失败：${t}`
  }
}

// ⭐⭐ **筛选切换**（全部 / 只看已改过的）+ **「跳到」下拉**。// ⚠️ 用**委托**监听（卡片是每次重画的，逐个绑会积监听器）。
document.addEventListener('change', (e) => {
  const t = e.target
  if (t && t.name === 'prompts-filter') {
    promptState.filter = t.value
    renderPromptsPage()
    return
  }
  // ⭐ 「跳到」下拉（用户要求：选一条直接切过去，免得在长列表里划）。
  if (t && t.id === 'prompts-jump') {
    selectPromptKey(t.value)
  }
})

// 初始标签：默认落「知识库」；hash 里已经指明某个标签时按其定位。
// ⭐ 决策 133 顺带补齐：原来只认 `kb|project`，而 `renderTabs()` 在这一行之后、
//    `applyRoute()`（首帧由 `load()` 的回调触发）之前**已经跑过一次**
//    ⇒ `#/review/...` 与 `#/archive/...` 会先闪一下知识库页。
if (!/^#\/(kb|project|theme|hot|review|archive)/.test(location.hash)) state.tab = 'kb'
// ⭐⭐ **窄屏编辑页那两个按钮在这里绑定**（文件最末尾）——
//    🔴 **不能提前**：它内部访问 `hotState`（`const`），提前调用会撞 TDZ，
//      而且那个错会让**它之后的所有顶层语句全部不执行**（实测：热知识页整页坏掉）。
//    ⭐ 判据：**顶层立即执行的初始化，只能放在"它依赖的全部 `const` 之后"**。
bindNarrowEditorButtons()
// ⭐ 【模板】页的按钮（决策 205）—— 同样放最末尾（同 TDZ 理由）。
bindTemplateButtons()
// ⭐ 【知识类型】页的按钮（决策 215）—— 同样放最末尾：它内部访问 `kindsState`（`const`）。
bindKindButtons()
renderTabs()
void load().then(() => applyRoute())
