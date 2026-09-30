/**
 * 套件：热知识注入（热知识方案 §5 / §6 / §7）。
 *
 * 🔴 **为什么必须有这个套件**：热知识是**每步自动注入**的功能——
 * 一旦判据写错，会**静默地**给每个会话塞进不该塞的内容（或该塞的不塞），
 * 而"模型没按预期做事"极难归因到注入。
 *
 * ⚠️ **本套件测的是纯逻辑**（判定 / 分层 / 去重 / 渲染 / 看门狗集合差 / 淘汰），
 * **不测钩子注册**（那要起真实例，见 `probe-hot-inject.mjs` 与本方案 §13 的实测清单）。
 *
 * ⭐ **每个关键判据都带反证**（本项目铁律：只跑一遍绿证明不了任何事）。
 * 用法：node scripts/test-hot.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-hot-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}
const section = (t) => console.log(`\n── ${t} ──`)

/** 造一张封面（只填渲染/判定用得到的字段）。 */
const cover = (over = {}) => ({
  id: over.id ?? 'aaaaaaaa-1111-2222-3333-444444444444',
  project: over.project ?? 'proj-a',
  theme: over.theme ?? [],
  global: over.global ?? false,
  kind: over.kind ?? '',
  tags: ['t'],
  title: over.title ?? '某条知识',
  desc: over.desc ?? '某场景下的某知识；当某场景时读它。',
  ref: over.ref ?? 'entries/x-aaaaaaaa.md',
  ext: over.ext ?? false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  archivedAt: '',
})

const item = (c, setting = {}, pinnedAt = '') => ({
  cover: c,
  // ⚠️ **`pinnedAt` 不在 `setting` 里**（2026-09-22：它是逐项目属性，见 `HotItem`）。
  setting: { on: true, channel: 'inbox', shape: 'meta', ...setting },
  layer: c.global ? 'global' : 'project',
  pinnedAt,
})

console.log('════════ 套件：热知识注入 ════════')

// ══════════════════════════════════════════════════════════════════════════
section('【1】数据层：默认值 / 容错 / 淘汰')
// ══════════════════════════════════════════════════════════════════════════

// ⭐⭐ **缺省值（2026-09-22 用户裁定后收窄）**
//    🔴 **本结构现在只服务全局层**——项目/主题知识**不再走 `entries.json`**，
//       它们存进项目清单（`selection.json`），而**"在清单里 = 会注入"**。
//    ⚠️ 所以 `layer` 参数**不再影响返回值**（保留只为签名兼容）。
//    历史：H-1 曾要求项目/主题层缺省"不纳入"——那条**已随本次裁定作废**，
//    因为它与清单那道开关**串行**，导致"选中 11 条、注入 0 条"（实测）。
check('⭐ 全局层缺省 = **纳入**', mod.defaultEntrySetting('global').on === true,
  JSON.stringify(mod.defaultEntrySetting('global')))
check('⭐（新）项目层缺省**也是纳入**——本结构已不收项目层，`layer` 不再影响结果',
  mod.defaultEntrySetting('project').on === true)
check('⭐（新）主题层同项目层', mod.defaultEntrySetting('theme').on === true)
check('（新）不传层时同样纳入（不再有"最保守"的分支）',
  mod.defaultEntrySetting().on === true)
check('缺省通道 = inbox', mod.defaultEntrySetting('global').channel === 'inbox')
check('缺省形态 = meta', mod.defaultEntrySetting('global').shape === 'meta')
// ⭐ `pinnedAt` 已**移出**本结构（它是逐项目属性，存 `selection.json`）——
//    见 `HotEntrySetting` 的注释。这里断言它**不再出现**（防将来又被塞回来）。
check('⭐（新）缺省里**没有** `pinnedAt`（它已改为逐项目属性）',
  mod.defaultEntrySetting('global').pinnedAt === undefined)
// ⭐ `settingOf` 的缺省同样只有一种。
check('⭐ settingOf 对全局层缺省纳入', mod.settingOf({}, 'x', 'global').on === true)
check('⭐（新）settingOf 对项目层同样纳入', mod.settingOf({}, 'x', 'project').on === true)
check('⭐ 显式值永远优先（存了 on:false 就是 false，不被缺省顶掉）',
  mod.settingOf({ x: { on: false, channel: 'inbox', shape: 'meta' } }, 'x', 'global').on === false)

// 文件不存在时读出来必须是"空结构"（**不抛**）
check('空库读画像不抛', (await mod.loadPersona()).length === 0)
check('空库读设置为空对象', Object.keys(await mod.loadEntrySettings()).length === 0)
check('空库读清单为空对象', Object.keys(await mod.loadSelections()).length === 0)
const sess0 = await mod.loadSessionsFile()
check('⭐ 空库的判定开关：doc-reads **默认开**、LLM **默认关**',
  sess0.detectDocReads === true && sess0.detectLlm === false, JSON.stringify({ d: sess0.detectDocReads, l: sess0.detectLlm }))

// ⭐ 淘汰：留最新 N，按 lastActiveAt 倒序（裁定 H-4）
const mk = (iso) => ({ project: 'p', source: 'doc-reads', boundAt: iso, lastActiveAt: iso })
const many = {}
for (let i = 0; i < 60; i += 1) {
  const day = String(1 + (i % 28)).padStart(2, '0')
  many[`s-${String(i).padStart(2, '0')}`] = mk(`2026-09-${day}T00:00:00.000Z`)
}
many['s-NEW'] = mk('2026-12-31T00:00:00.000Z')   // 最新的一个
many['s-OLD'] = mk('2020-01-01T00:00:00.000Z')   // 最旧的一个
const pruned = mod.pruneSessions(many, 50)
check('淘汰后只剩 50 条', Object.keys(pruned.kept).length === 50, `实得 ${Object.keys(pruned.kept).length}`)
check('⭐ 最新的那条**一定留下**', pruned.kept['s-NEW'] !== undefined)
check('⭐ 最旧的那条**一定淘汰**', pruned.kept['s-OLD'] === undefined)
check('淘汰列表长度正确', pruned.dropped.length === Object.keys(many).length - 50)

// ⭐ 反证：不超量时**一条都不淘汰**
const few = { a: mk('2026-01-01T00:00:00.000Z'), b: mk('2026-01-02T00:00:00.000Z') }
const pruned2 = mod.pruneSessions(few, 50)
check('（反证）不超量 ⇒ 不淘汰任何一条', pruned2.dropped.length === 0 && Object.keys(pruned2.kept).length === 2)

// ⚠️ 空 lastActiveAt 排最后（从未活跃过的优先淘汰）
const mixed = { has: mk('2026-01-01T00:00:00.000Z'), empty: { project: 'p', source: 'doc-reads', boundAt: '', lastActiveAt: '' } }
const pruned3 = mod.pruneSessions(mixed, 1)
check('⭐ 空活跃时间的**优先被淘汰**', pruned3.kept['has'] !== undefined && pruned3.dropped.includes('empty'),
  JSON.stringify(pruned3.dropped))

// ══════════════════════════════════════════════════════════════════════════
section('【2】渲染：两种形态 + 收尾指令')
// ══════════════════════════════════════════════════════════════════════════

// meta 形态
const cMeta = cover({ id: 'id-META-0001', title: '标题甲', desc: '描述甲' })
const r1 = mod.renderHotText([], [item(cMeta)])
check('meta 渲染出标题', r1.text.includes('标题甲'))
check('⭐ meta 渲染出完整 id（看门狗指纹，零额外成本）', r1.text.includes('id-META-0001'))
check('meta 渲染出描述', r1.text.includes('描述甲'))
check('meta 段带表头"全局知识"或"项目知识"', /### (全局知识|项目知识)/.test(r1.text))
check('meta 计数正确', r1.counts.projectMeta === 1 || r1.counts.globalMeta === 1)

// full 形态
const cFull = cover({ id: 'id-FULL-0002', title: '标题乙' })
const bodies = new Map([['id-FULL-0002', '这是正文内容。']])
const r2 = mod.renderHotText([], [item(cFull, { shape: 'full' })], bodies)
check('⭐ full 渲染出**正文**', r2.text.includes('这是正文内容。'))
check('⭐ full 仍保留 id（用户要求：看门狗要判）', r2.text.includes('id-FULL-0002'))
check('⭐ full 归入「直接可用的内容」段', r2.text.includes('直接可用的内容'))
check('full 不再作为 meta 行出现', !r2.text.includes(' — '), r2.text.slice(0, 200))
check('full 的字符数被计入 fullChars', r2.counts.fullChars >= '这是正文内容。'.length)

// ⚠️ **反证：正文取不到时不许静默丢弃** ⇒ 退回 meta 行
const r2b = mod.renderHotText([], [item(cFull, { shape: 'full' })], new Map())
check('⭐（反证）full 正文缺失 ⇒ **退回 meta 行**（不静默丢）',
  r2b.text.includes('id-FULL-0002') && r2b.text.includes('### 项目知识') && !r2b.text.includes('直接可用的内容'),
  r2b.text.slice(0, 120))

// 画像与 full 同段
const persona = [{ id: 'p-1', text: '我是用户画像。', on: true, channel: 'inbox', createdAt: '', updatedAt: '' }]
const r3 = mod.renderHotText(persona, [item(cFull, { shape: 'full' })], bodies)
check('⭐ 画像与 full **在同一个「直接可用」段里**（用户要求）',
  r3.text.includes('我是用户画像。') && r3.text.includes('这是正文内容。')
  && r3.text.indexOf('直接可用的内容') < r3.text.indexOf('我是用户画像。'))
check('画像计数正确', r3.counts.personaFull === 1)

// ⚠️ 画像 on:false 不注入
const r4 = mod.renderHotText([{ ...persona[0], on: false }], [])
check('（反证）画像 on:false ⇒ 不注入，且整体为空', r4.text === '', r4.text.slice(0, 80))
check('空白的画像正文不注入', mod.renderHotText([{ ...persona[0], text: '   ' }], []).text === '')

// ⭐ 收尾指令（用户逐字指定的措辞）
check('⭐ 收尾指令含"继续当前任务"', r1.text.includes('继续当前任务'))
check('⭐ 收尾指令含"你本身正在寻求的信息"（用户原话）', r1.text.includes('你本身正在寻求的信息'))
check('⭐ 收尾指令含"禁止额外的客套、寒暄"（用户原话）', r1.text.includes('禁止额外的客套、寒暄'))
check('⚠️ 收尾指令**不含**"停下"（那是"取交接"的语义，两者相反）', !r1.text.includes('然后就停下'))
check('收尾在末尾（不在开头）', r1.text.lastIndexOf('继续当前任务') > r1.text.indexOf('标题甲'))

// ⭐ 全空 ⇒ 空串（调用方据此"一条不注入"）
check('⭐ 无任何条目 ⇒ 文本为空串（一条不注入）', mod.renderHotText([], []).text === '')

// ══════════════════════════════════════════════════════════════════════════
section('【3】看门狗：集合差（忘了哪条补哪条）')
// ══════════════════════════════════════════════════════════════════════════

const msgsWith = (texts) => texts.map((t) => ({ role: 'user', content: [{ type: 'text', text: t }] }))

const found1 = mod.idsInWindow(msgsWith(['前言', '`id-META-0001` 某条', '`id-FULL-0002` 另一条']),
  ['id-META-0001', 'id-FULL-0002', 'id-MISSING-3'])
check('⭐ 能认出"还在窗口里"的 id', found1.has('id-META-0001') && found1.has('id-FULL-0002'))
check('⭐ 缺失的那条**没被认成在窗口**', !found1.has('id-MISSING-3'))
check('返回集合大小正确（2 在 / 1 缺）', found1.size === 2, `实得 ${found1.size}`)

// ⚠️ 反证：空消息 / undefined 不许抛、也不许假报"都在"
check('（反证）messages 为空数组 ⇒ 空集合', mod.idsInWindow([], ['id-META-0001']).size === 0)
check('（反证）messages 为 undefined ⇒ 空集合（不抛）', mod.idsInWindow(undefined, ['id-META-0001']).size === 0)
check('（反证）ids 为空 ⇒ 空集合', mod.idsInWindow(msgsWith(['任何']), []).size === 0)

// reasoning 块也要能被认出来（注入内容可能被模型复述进思考）
check('⭐ reasoning 块里的 id 也算"在窗口"',
  mod.idsInWindow([{ role: 'assistant', content: [{ type: 'reasoning', text: '我看过 id-META-0001' }] }], ['id-META-0001']).has('id-META-0001'))

// ══════════════════════════════════════════════════════════════════════════
section('【4】判定：只用 doc-reads / 未知是一等公民')
// ══════════════════════════════════════════════════════════════════════════

// ⚠️ 这里直接验"判定函数"，不落盘 doc-reads（那要造会话文件）
const d1 = await mod.detectProjectByDocReads('session-nonexistent-xyz', ['proj-a', 'proj-b'])
check('⭐ 无任何 doc-reads ⇒ 返回「未知」**而不是抛错**', d1.project === mod.HOT_PROJECT_UNKNOWN, d1.project)
check('未知时 at 为空串', d1.at === '')
check('未知常量就是中文「未知」', mod.HOT_PROJECT_UNKNOWN === '未知')

// ⭐ 通道降级：项目/主题层不许 section（方案 §3.2）
const e1 = mod.effectiveChannel('section', 'global')
check('全局层允许 section（不降级）', e1.channel === 'section' && e1.downgraded === false)
const e2 = mod.effectiveChannel('section', 'project')
check('⭐ 项目层**强制降级为 inbox**（section 装不下按项目的内容）',
  e2.channel === 'inbox' && e2.downgraded === true)
const e3 = mod.effectiveChannel('section', 'theme')
check('⭐ 主题层同样降级，且**标记 downgraded**（页面要提示，不静默）',
  e3.channel === 'inbox' && e3.downgraded === true)
const e4 = mod.effectiveChannel('inbox', 'project')
check('（反证）本来就是 inbox ⇒ 不算降级（不误报）', e4.downgraded === false)

// ══════════════════════════════════════════════════════════════════════════
section('【5】渲染行格式与既有实现一致')
// ══════════════════════════════════════════════════════════════════════════

const line = mod.renderMetaLine(cover({ id: 'id-X', kind: 'trap', title: 'T', desc: 'D' }))
check('⭐ 行首是反引号包住的 id', line.startsWith('- `id-X`'))
check('kind 有方括号标签', line.includes('[trap]'))
check('标题加粗', line.includes('**T**'))
check('desc 用破折号连接', line.includes('— D'))
const lineExt = mod.renderMetaLine(cover({ id: 'id-Y', ext: true, title: 'T2', desc: 'D2' }))
check('外部引用带标记', lineExt.includes('（外部引用）'))

// ══════════════════════════════════════════════════════════════════════════
section('【6】内存态与清理')
// ══════════════════════════════════════════════════════════════════════════

mod.hotState.windows.set('s', { present: new Set(), at: '', sessionId: 's' })
mod.hotState.warnedNoProject.add('s')
mod.resetHotState()
check('resetHotState 清空窗口快照', mod.hotState.windows.size === 0)
check('resetHotState 清空告警去重集', mod.hotState.warnedNoProject.size === 0)

// ══════════════════════════════════════════════════════════════════════════
section('【7】get-handoff 痕迹判定（读会话日志，2026-09-22 用户要求）')
// ══════════════════════════════════════════════════════════════════════════
//
// 🔴 用户实测报告：某会话做过 `/memj-get-handoff-project dsh-memj`，
//    但自动判定判不出项目（因为那条命令**当时不写任何记录**）。
// ⇒ 新增：从**会话日志**里读 `command/run` 的 `args` 来判。
// ⭐ **强度与 `doc-reads` 等同**、**取两者中较新者**（用户裁定）。
{
  const KN = ['dsh-memj', 'dsh-memory', 'dsh-plugin-adapt']
  const ev = (name, args, time) => ({
    type: 'command/run', seq: 1, time,
    data: { commandId: 'c', name, args, source: { kind: 'user' } },
  })

  check('⭐ 能认出 `memj-get-handoff-project` 并解析出项目',
    mod.parseGetHandoffFromEvents([ev('memj-get-handoff-project', ' dsh-memj 档1', 1000)], KN).project === 'dsh-memj')
  check('⭐（用户实测形态）前导空格 + 档位词也能解析', (() => {
    const r = mod.parseGetHandoffFromEvents([ev('memj-get-handoff-project', ' dsh-memj 档1', 5)], KN)
    return r.project === 'dsh-memj' && r.atMs === 5
  })())
  check('⭐ 多次取**最新**那次',
    mod.parseGetHandoffFromEvents([
      ev('memj-get-handoff-project', 'dsh-memory', 100),
      ev('memj-get-handoff-project', 'dsh-memj', 900),
      ev('memj-get-handoff-project', 'dsh-plugin-adapt', 500),
    ], KN).project === 'dsh-memj')

  // ⚠️ 反证组
  check('⚠️（反证）主题级命令**不算**项目判据',
    mod.parseGetHandoffFromEvents([ev('memj-get-handoff-theme', 'thm-x', 9)], KN).project === '未知')
  check('⚠️（反证）已删项目被跳过、回退到更早的合法记录',
    mod.parseGetHandoffFromEvents([
      ev('memj-get-handoff-project', 'dsh-memj', 100),
      ev('memj-get-handoff-project', 'gone-project', 900),
    ], KN).project === 'dsh-memj')
  check('⚠️（反证）空事件 / 无关命令 / 坏事件 / 空 args ⇒ 未知，且不抛',
    mod.parseGetHandoffFromEvents([], KN).project === '未知'
    && mod.parseGetHandoffFromEvents([ev('rewind', '@9', 1)], KN).project === '未知'
    && mod.parseGetHandoffFromEvents([null, undefined, {}, { type: 'command/run' }], KN).project === '未知'
    && mod.parseGetHandoffFromEvents([ev('memj-get-handoff-project', '', 1)], KN).project === '未知')
  check('⚠️（反证）已知项目列表为空 ⇒ 未知（不认不存在的项目）',
    mod.parseGetHandoffFromEvents([ev('memj-get-handoff-project', 'dsh-memj', 1)], []).project === '未知')
}

// ══════════════════════════════════════════════════════════════════════════
section('【8】memj_handoff 痕迹判定（最强判据，2026-09-22 用户要求）')
// ══════════════════════════════════════════════════════════════════════════
//
// 🔴 用户实测报告：某会话做过 **5 次 `memj_handoff`**（含一次"建立项目"的交接），
//    但自动判定判不出项目 —— 因为 `memj_handoff` **以前不写任何记录**。
// ⭐ 它是最强判据：**模型自己在入参里声明了 `project`**，且真写了那个项目的文档。
// ⭐ **优先级高于 doc-reads 与 get-handoff**（用户裁定）。
{
  const KN = ['dsh-memj', 'dsh-plugin-adapt', 'dsh-016-upgrade']
  const call = (project, time) => ({
    type: 'tool/call', seq: 1, time,
    data: { name: 'memj_handoff', arguments: { project, entries: [] } },
  })

  check('⭐ 能解析 `memj_handoff` 入参里的 `project`',
    mod.parseHandoffFromEvents([call('dsh-memj', 100)], KN).project === 'dsh-memj')
  check('⭐ 入参是 **JSON 字符串**时也能解析（工具调用参数的另一种形态）', (() => {
    const e = { type: 'tool/call', time: 5, data: { name: 'memj_handoff', arguments: JSON.stringify({ project: 'dsh-memj' }) } }
    return mod.parseHandoffFromEvents([e], KN).project === 'dsh-memj'
  })())
  check('⭐ **多次取最新那次**（用户裁定："会话中途换项目 ⇒ 认最近那个"）', (() => {
    const r = mod.parseHandoffFromEvents([
      call('dsh-plugin-adapt', 100), call('dsh-plugin-adapt', 200),
      call('dsh-plugin-adapt', 300), call('dsh-plugin-adapt', 400),
      call('dsh-016-upgrade', 500),
    ], KN)
    return r.project === 'dsh-016-upgrade' && r.atMs === 500
  })())

  // ⚠️ 反证组
  check('⚠️（反证）别的工具（`memj_read` / `memj_promote`）**不算** handoff 判据',
    mod.parseHandoffFromEvents([
      { type: 'tool/call', time: 1, data: { name: 'memj_read', arguments: { id: 'x' } } },
      { type: 'tool/call', time: 2, data: { name: 'memj_promote', arguments: { project: 'dsh-memj' } } },
    ], KN).project === '未知')
  check('⚠️（反证）已删项目被跳过、回退到更早的合法记录',
    mod.parseHandoffFromEvents([call('dsh-memj', 100), call('gone-project', 900)], KN).project === 'dsh-memj')
  check('⚠️（反证）缺 project / 坏 JSON / 坏事件 ⇒ 未知，且不抛',
    mod.parseHandoffFromEvents([], KN).project === '未知'
    && mod.parseHandoffFromEvents([{ type: 'tool/call', data: { name: 'memj_handoff', arguments: {} } }], KN).project === '未知'
    && mod.parseHandoffFromEvents([{ type: 'tool/call', data: { name: 'memj_handoff', arguments: 'not-json' } }], KN).project === '未知'
    && mod.parseHandoffFromEvents([null, undefined, {}], KN).project === '未知')
}

// ══════════════════════════════════════════════════════════════════════════
section('【9】⭐ 2026-09-22 收窄：entries 只管全局 + 清单带逐项目设置')
// ══════════════════════════════════════════════════════════════════════════
//
// 🔴 这一节盯的是**本批的结构性改动**（用户裁定："作用的层级 = 存的地方"）：
//  · `entries.json` **只管全局知识**；
//  · 项目/主题知识的 `shape` / `pinnedAt` **存进项目清单**（逐项目）；
//  · ⭐ 项目层**没有第二道 `on` 开关**——"在清单里 = 会注入"。

// ── ① 清单的新结构：`entries: [{id, shape, pinnedAt}]` ──
{
  const pid = 'proj-scope-a'
  await mod.saveSelections({
    [pid]: {
      entries: [
        { id: 'id-A', shape: 'full', pinnedAt: '2026-09-22T10:00:00.000Z' },
        { id: 'id-B', shape: 'meta', pinnedAt: '' },
      ],
      initializedAt: '2026-09-22T00:00:00.000Z',
    },
  })
  const back = await mod.loadSelections()
  const sel = back[pid]
  check('⭐ 清单新结构读回：2 条', sel?.entries.length === 2, JSON.stringify(sel))
  check('⭐ 逐项目的 `shape` 原样保留', sel?.entries[0]?.shape === 'full')
  check('⭐ 逐项目的 `pinnedAt` 原样保留',
    sel?.entries[0]?.pinnedAt === '2026-09-22T10:00:00.000Z')
  check('⭐ 未置顶的那条 `pinnedAt` 是空串', sel?.entries[1]?.pinnedAt === '')
}

// ── ② ⭐⭐ **旧结构自动迁移**（`entryIds: string[]` → `entries[]`）──
//
// 🔴 这是**生产库真实存在的形态**（现存 `selection.json` 就是 `entryIds`）
//    ⇒ 不迁移的话，用户打开项目页会看到**空清单**（= 静默丢数据）。
{
  const pid = 'proj-legacy'
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync(join(lib, 'hot'), { recursive: true })
  writeFileSync(join(lib, 'hot', 'selection.json'), JSON.stringify({
    version: 1,
    projects: {
      [pid]: {
        entryIds: ['legacy-1', 'legacy-2'],
        initializedAt: '2026-09-01T00:00:00.000Z',
      },
    },
  }), 'utf8')
  const back = await mod.loadSelections()
  const sel = back[pid]
  check('⭐⭐ **旧 `entryIds` 结构被自动迁移**（否则用户会看到空清单）',
    sel?.entries.length === 2, JSON.stringify(sel))
  check('⭐ 迁移后 id 顺序不变',
    sel?.entries[0]?.id === 'legacy-1' && sel?.entries[1]?.id === 'legacy-2')
  check('⭐ 迁移时 `initializedAt` 保留（否则会重生成默认清单、覆盖用户意图）',
    sel?.initializedAt === '2026-09-01T00:00:00.000Z')
  // ⚠️ **反证**：迁移**不能**替用户猜形态/置顶
  //    （旧值是按"知识自己的属性"设的，搬过来等于替用户做决定）。
  check('⭐（反证）迁移**不臆造** `shape`（一律 `meta` 起步）',
    sel?.entries.every((e) => e.shape === 'meta'))
  check('⭐（反证）迁移**不臆造** `pinnedAt`（一律空 = 未置顶）',
    sel?.entries.every((e) => e.pinnedAt === ''))
}

// ── ③ ⭐⭐ **画像指纹**（修"只有画像时一条都不注入" + "画像状态永远检测不到"）──
{
  // 长文本 ⇒ 有指纹
  const long = '我是一名中文用户，思考过程和回答都必须使用中文，这是硬性要求。'
  check('⭐ 长画像产出指纹', mod.personaFingerprint(long) !== '')
  check('⭐ 指纹是正文前 60 字符',
    mod.personaFingerprint(long) === long.slice(0, 60))
  // ⚠️ **反证：过短文本不给指纹**（否则"偶然撞上"会造成**假绿**：
  //    页面上显示"已注入"而实际根本没注入过）。
  //    🔴 **阈值是 8 而不是 20**——实测：生产库里用户的画像是
  //       「思考过程和回答使用中文。」（13 字符），按 20 的阈值它**没有指纹**
  //       ⇒ 永远显示"未注入"（而它其实每轮都在注入）⇒ **界面在撒谎**。
  //    ⭐ 判据：阈值按"真实用户会写多短"定，不按"我觉得多长才安全"定。
  check('⚠️（反证）极短文本（< 8 字符）**不参与指纹**',
    mod.personaFingerprint('中文。') === '' && mod.personaFingerprint('abc') === '')
  check('⭐⭐ **真实用户的短画像（13 字符）有指纹**（否则它的状态永远是"未注入"）',
    mod.personaFingerprint('思考过程和回答使用中文。') === '思考过程和回答使用中文。',
    JSON.stringify(mod.personaFingerprint('思考过程和回答使用中文。')))
  check('⚠️（反证）空白文本不参与指纹',
    mod.personaFingerprint('   ') === '' && mod.personaFingerprint('\n\n') === '')
  check('⭐ 前后空白被裁掉（同一份画像不因换行差异被当成两条）',
    mod.personaFingerprint(`  ${long}  `) === mod.personaFingerprint(long))
}

// ── ④ ⭐⭐ **`renderHotText` 必须产出 `preview`**（页面列表的数据源）──
//
// 🔴 这是本批**用户直接要求**的东西：列表要显示"标题 / 类型 / 形态"。
//    ⇒ 服务端必须**结构化**地给出这些，而不是只给一串 id。
{
  const cG = cover({ id: 'id-PREV-G', global: true, title: '全局甲' })
  const cP = cover({ id: 'id-PREV-P', project: 'p1', title: '项目乙' })
  const persona = [{
    id: 'p-1', text: '我是一名中文用户，思考过程和回答都必须使用中文，这是硬性要求。',
    on: true, channel: 'inbox', createdAt: '', updatedAt: '',
  }]
  const g = { ...item(cG), layer: 'global' }
  const p = { ...item(cP), layer: 'project' }
  const r = mod.renderHotText(persona, [g, p])
  check('⭐⭐ `preview` 非空（页面列表的数据源）', Array.isArray(r.preview) && r.preview.length === 3,
    JSON.stringify(r.preview))
  check('⭐ **画像也在 `preview` 里**（原来它没有 id ⇒ 列表里根本没有它）',
    r.preview.some((x) => x.type === 'persona'))
  check('⭐ 画像的类型 = `persona`、形态 = `full`（它整段原样注入）',
    r.preview.find((x) => x.type === 'persona')?.shape === 'full')
  check('⭐ 画像有指纹（`fp` 非空）⇒ 它能被判"已注入/未注入"',
    (r.preview.find((x) => x.type === 'persona')?.fp ?? '') !== '')
  check('⭐ 全局知识类型 = `global`、项目知识类型 = `project`',
    r.preview.some((x) => x.type === 'global') && r.preview.some((x) => x.type === 'project'))
  check('⭐ 每条都带标题（页面直接显示，不必再查库）',
    r.preview.every((x) => typeof x.title === 'string' && x.title !== ''))
}

// ── ⑤ ⭐⭐ **分层过滤（在 `collectHotItems` 这一层测）** ──
//
// 🔴 **为什么必须在这一层测**：`renderHotText` 是**纯渲染函数**，
//    它的输入契约是"**已经过滤过的**条目"（`@param items` 明写"已按层分组"）。
//    ⇒ 在它那里断言"on:false 不出现"**测的是我自己构造的假状态**，
//      而不是产品行为（我第一版正是这么写错的，被这条断言当场抓出来）。
//    ⭐ 真正决定"注不注入"的是 `collectHotItems` —— 它有 I/O，要建真库来测。
{
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { renderCover } = await import('../lib/offline-bundle.js')
  const pid = 'proj-collect'
  mkdirSync(join(lib, 'projects'), { recursive: true })
  const mk = (id, global) => ({
    id, project: pid, theme: [], global, kind: '', tags: ['t'],
    title: `标题-${id.slice(0, 8)}`, desc: '某场景下的某知识；当某场景时读它。',
    ref: `entries/x-${id.slice(0, 8)}.md`, ext: false,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    archivedAt: '',
  })
  // ⚠️ **id 必须是真正的 UUID 形状**——`parseCovers` 会校验，
  //    用 `g0000001-…` 这种假 UUID 会被**静默丢弃**（我第一版就是这么写错的：
  //    `collectHotItems` 返回空数组，看起来像"清单没生效"，实际是夹具坏了）。
  const G1 = '11111111-1111-4111-8111-111111111111'
  const P1 = '22222222-2222-4222-8222-222222222222'
  const P2 = '33333333-3333-4333-8333-333333333333'
  // ⚠️ 项目文档里要有 `themes:` 供主题层用（这里留空 ⇒ 只测全局 + 项目两层）。
  writeFileSync(join(lib, 'projects', `HANDOFF-${pid}.md`),
    `# HANDOFF — ${pid}\n\n## 目标\n\n测试用。\n\n## 沉淀知识\n\n`
    + `${renderCover(mk(G1, true))}\n\n${renderCover(mk(P1, false))}\n\n${renderCover(mk(P2, false))}\n`,
    'utf8')

  // ── 情形 A：只有 P1 在清单里 ⇒ 只注入 P1（+ 全局） ──
  await mod.saveSelections({
    [pid]: { entries: [{ id: P1, shape: 'full', pinnedAt: '' }], initializedAt: 'x' },
  })
  const a = await mod.collectHotItems(pid)
  const aIds = a.map((it) => it.cover.id)
  check('⭐⭐ **在清单里 = 会注入**（P1 没有任何 `entries.json` 记录，也必须注入）',
    aIds.includes(P1), JSON.stringify(aIds))
  check('⭐ 全局知识一并注入（它不需要被选中）', aIds.includes(G1), JSON.stringify(aIds))
  check('⭐ **不在清单里的 P2 不注入**（避免"项目层 150 条全上"）',
    !aIds.includes(P2), JSON.stringify(aIds))
  check('⭐ 清单里的逐项目 `shape` 生效（P1 = full）',
    a.find((it) => it.cover.id === P1)?.setting.shape === 'full')

  // ── 情形 A2：🔴🔴 **全局知识同时又在项目清单里 ⇒ 不许收两遍** ──
  //
  // ⭐ **用户 2026-09-24 实测发现**：*"是项目热知识的清单里混进了本来已经在全局热知识里的知识。
  //    没有做去重。所以全局知识是不应该在项目热知识的可选列表里的（左栏）。
  //    因为他一定已经在本来就要注入的全局热知识里了。"*
  // 🔴 **危害不只是"左栏显示重复"**：实测**渲染出的注入文本里同一行出现两遍**
  //    （`### 全局知识` 与 `### 项目知识` 各一次）⇒ 模型每轮看到两遍同一条、白烧 token。
  // ⚠️ 根因：全局层是**无条件**收的，而项目层**只看"在不在清单里"** ⇒ 两者之间没去重
  //    （主题层本来就有 `!shown.has(...)`，唯独这两层之间漏了）。
  await mod.saveSelections({
    [pid]: {
      entries: [
        { id: G1, shape: 'meta', pinnedAt: '' },   // ⚠️ 把**全局知识**也塞进项目清单
        { id: P1, shape: 'meta', pinnedAt: '' },
      ],
      initializedAt: 'x',
    },
  })
  const a2 = await mod.collectHotItems(pid)
  const a2Ids = a2.map((it) => it.cover.id)
  const g1Count = a2Ids.filter((id) => id === G1).length
  check('⭐⭐⭐ **全局知识只被收一次**（它同时在清单里 ⇒ 不许收两遍）',
    g1Count === 1, `G1 出现 ${g1Count} 次：${JSON.stringify(a2Ids)}`)
  check('⭐ 且它保留在**全局层**（全局层优先，形态由 `entries.json` 决定）',
    a2.find((it) => it.cover.id === G1)?.layer === 'global',
    JSON.stringify(a2.map((it) => `${it.cover.id.slice(0, 8)}:${it.layer}`)))
  check('⭐ 其余条目不受影响（P1 仍在、仍是项目层）',
    a2Ids.includes(P1) && a2.find((it) => it.cover.id === P1)?.layer === 'project',
    JSON.stringify(a2Ids))
  check('⭐⭐ **渲染文本里那条也只出现一次**（这才是真正影响模型的东西）',
    (await mod.buildHotInjection('s', pid)).text.split(G1).length - 1 === 1,
    `渲染文本里出现 ${(await mod.buildHotInjection('s', pid)).text.split(G1).length - 1} 次`)

  // ── 情形 B：⭐ 逐项目 `pinnedAt` 生效 + 排序 ──
  await mod.saveSelections({
    [pid]: {
      entries: [
        { id: P2, shape: 'meta', pinnedAt: '2026-09-22T09:00:00.000Z' },
        { id: P1, shape: 'meta', pinnedAt: '' },
      ],
      initializedAt: 'x',
    },
  })
  const b = await mod.collectHotItems(pid)
  const bIds = b.map((it) => it.cover.id)
  check('⭐ 置顶的排在最前（按 `pinnedAt` 倒序）', bIds[0] === P2, JSON.stringify(bIds))
  check('⭐ 置顶信息在 `HotItem.pinnedAt` 上（不在 `setting` 里）',
    b.find((it) => it.cover.id === P2)?.pinnedAt === '2026-09-22T09:00:00.000Z')
  check('⭐ 全局层的 `pinnedAt` 恒为空（置顶只对项目热知识有意义）',
    b.find((it) => it.cover.id === G1)?.pinnedAt === '')

  // ── 情形 C：⚠️ **反证** —— 全局知识可以被 `entries.json` 关掉 ──
  //
  // ⭐ 这才是 `entries.json` **收窄后仍然存在**的理由：**全局层的开关**。
  await mod.saveEntrySettings({
    [G1]: { on: false, channel: 'inbox', shape: 'meta' },
  })
  const c = await mod.collectHotItems(pid)
  check('⚠️（反证）全局知识 `on:false` ⇒ **不注入**（`entries.json` 收窄后仍然管这个）',
    !c.map((it) => it.cover.id).includes(G1), JSON.stringify(c.map((it) => it.cover.id)))
  check('⭐ 关掉全局不影响项目层（两层判据独立）',
    c.map((it) => it.cover.id).includes(P1) && c.map((it) => it.cover.id).includes(P2))
  // 还原，免得影响后续断言。
  await mod.saveEntrySettings({})
}

// ══════════════════════════════════════════════════════════════════════════
section('【10】⭐ 重启后从会话日志重建窗口快照（2026-09-23 用户要求）')
// ══════════════════════════════════════════════════════════════════════════
//
// 🔴 **用户实测报告**：*"隔了一整夜，此会话之前已经注入的内容，现在显示未注入了。
//    我怀疑，只要重新启动之后，已注入的内容就会显示未注入，那这是不对的哇？"*
// ⇒ ⭐ **用户说得对**：`hotState.windows` 是纯内存的（"进程重启即失"）
//    ⇒ 重启后页面把**每一条**都显示成"未注入"，而注入内容**其实还在会话里**。
//
// ⭐ **判据与看门狗完全一致**（注入文本里本来就带每条封面的完整 id）
//    ⇒ 重建出来的结论与平时的对得上。

/** 造一个 memj 注入事件（⚠️ **形态照真实日志**，见下）。 */
const injEvent = (seq, timeIso, text) => ({
  type: 'user/message',
  seq,
  time: Date.parse(timeIso),
  // ⚠️ **真实形态**：`data.source` + `data.message.content[]`
  //    （实测自 `session.v3.jsonl.zstd`：`source={kind:plugin,plugin:dsh-memj,form:instructions}`）
  data: {
    source: { kind: 'plugin', plugin: 'dsh-memj', form: 'instructions' },
    message: { role: 'user', content: [{ type: 'text', text }] },
  },
})

{
  const A = '11111111-2222-4333-8444-555555555555'
  const B = '66666666-7777-4888-8999-000000000000'
  const C = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  const personaFp = '思考过程和回答使用中文。'

  // ⚠️ 两次注入：**只认最近一次**（更早的只说明"曾经注入过"）。
  const events = [
    injEvent(10, '2026-09-22T10:00:00.000Z', `## memj 热知识（本次会话相关）\n\n- \`${A}\` 甲\n- \`${B}\` 乙`),
    // 中间夹一条**别的插件的**注入（⚠️ 不能被误当成 memj 的）
    {
      type: 'user/message', seq: 11, time: Date.parse('2026-09-22T10:05:00.000Z'),
      data: {
        source: { kind: 'plugin', plugin: 'dsh-prompt-inject', form: 'instructions' },
        message: { content: [{ type: 'text', text: `- \`${C}\` 别的插件注入的` }] },
      },
    },
    injEvent(20, '2026-09-23T08:00:00.000Z', `## memj 热知识（本次会话相关）\n\n### 直接可用的内容\n\n${personaFp}\n#### \`${A}\` 甲\n\n正文…\n\n- \`${B}\` 乙`),
  ]

  const r = mod.fingerprintsFromInjectionEvents(events, [A, B, C, personaFp])
  check('⭐⭐ 从会话日志重建出 `present`（非空）', r.present.size > 0, JSON.stringify([...r.present]))
  check('⭐ 找回最近一次注入里的封面 id（A / B 都在）',
    r.present.has(A) && r.present.has(B))
  check('⭐⭐ **画像指纹也找回了**（它没有 id，靠文本指纹）', r.present.has(personaFp))
  check('⭐ 注入时刻取自该事件', r.at === '2026-09-23T08:00:00.000Z', r.at)
  // ⚠️ **反证：别的插件的注入不能被算进来**（否则会把"别人注入的内容"报成我们注入的）
  check('⚠️（反证）**别的插件的注入不算数**（C 只出现在 dsh-prompt-inject 那条里）',
    !r.present.has(C), JSON.stringify([...r.present]))
  // ⚠️ **语义变更（2026-09-24 用户裁定）**：原来是"只认最近一次"，
  //    现在是**每条指纹各自累积**（见 `fingerprintsFromInjectionEvents` 的注释）。
  //    🔴 **为什么必须改**：用户当场指出 *"如果补了单条，那其他的不就被判断成未注入了？"* ——
  //    「只取最近一次」成立的**前提是"每次注入都是全量的"**，而补注方案恰恰是增量的。
  const twoInjections = mod.fingerprintsFromInjectionEvents(
    [injEvent(1, '2026-09-22T10:00:00.000Z', `- \`${A}\` 甲`),
      injEvent(2, '2026-09-23T08:00:00.000Z', `- \`${B}\` 乙`)],
    [A, B])
  check('⭐⭐⭐ **两次注入的指纹会合并**（A 在早的那次里 ⇒ 仍算已注入）',
    twoInjections.present.has(A) && twoInjections.present.has(B), JSON.stringify([...twoInjections.present]))
  check('⭐ `at` 取**最后一次含指纹的注入**时刻（页面显示"这是什么时候的判定"）',
    twoInjections.at === '2026-09-23T08:00:00.000Z', twoInjections.at)

  // ⭐⭐ **本批最要紧的那条**：模拟「全量 19 条 + 之后补注 1 条」
  //    ⇒ 全部 19 条都该显示"已注入"（旧实现在这里会把前 18 条判成未注入）。
  const full = [A, B, C]
  const fullThenPatch = mod.fingerprintsFromInjectionEvents(
    [injEvent(1, '2026-09-22T10:00:00.000Z', `- \`${A}\` 甲\n- \`${B}\` 乙`),
      // 之后只补了 C（增量补注）
      injEvent(2, '2026-09-23T08:00:00.000Z', `- \`${C}\` 丙`)],
    full)
  check('⭐⭐⭐ 模拟"全量 + 单条补注" ⇒ **三条全部算已注入**（补注不会把别人顶掉）',
    full.every((f) => fullThenPatch.present.has(f)), JSON.stringify([...fullThenPatch.present]))
  // ⚠️ **反证：没有 memj 注入 ⇒ 空集 + 空时刻**（不是"全都算注入过"）
  const none = mod.fingerprintsFromInjectionEvents(
    [{ type: 'user/message', time: 1, data: { source: { kind: 'user' }, message: { content: [{ type: 'text', text: `- \`${A}\` 甲` }] } } }],
    [A])
  check('⚠️（反证）没有 memj 注入事件 ⇒ 空集（**不把"任意消息里出现过"当成注入过**）',
    none.present.size === 0 && none.at === '', JSON.stringify([...none.present]))
  check('⚠️（反证）事件为空 / 坏事件 ⇒ 不抛、回空集',
    mod.fingerprintsFromInjectionEvents([], [A]).present.size === 0
    && mod.fingerprintsFromInjectionEvents([null, undefined, {}], [A]).present.size === 0)
  // ⚠️ 反证：**扁平形态**（`data.content` 而非 `data.message.content`）也要能吃
  const flat = mod.fingerprintsFromInjectionEvents(
    [{ type: 'user/message', time: 2, data: { source: { kind: 'plugin', plugin: 'dsh-memj' }, content: [{ type: 'text', text: `- \`${A}\` 甲` }] } }],
    [A])
  check('⭐ 两种正文形态都吃（`data.message.content` 与 `data.content`）',
    flat.present.has(A), JSON.stringify([...flat.present]))

  // ── ⭐⭐⭐ 【10b】命令注入排在热知识之后 ⇒ 不许把重建判成"从没注入过" ──
  //
  // 🔴 **用户 2026-09-24 实测报的 bug（方案 A）**：
  //    `plugin: 'dsh-memj'` **命令注入也在用**（如 `/memj-handoff` 的提示词）
  //    ⇒ 旧实现"只取最近一次 memj 注入"会取到那条**不含任何知识 id** 的文本
  //    ⇒ `present.size === 0` ⇒ 上层判成"从没注入过" ⇒ **页面把每一条都显示成「未注入」**。
  //    实测案例：本会话日志 `11:41:37` 有一条 979 字符、命中 0/19 的注入。
  const cmdInjection = {
    type: 'user/message', seq: 30, time: Date.parse('2026-09-23T09:00:00.000Z'),
    data: {
      source: { kind: 'plugin', plugin: 'dsh-memj', form: 'instructions' },
      message: { content: [{ type: 'text', text: '## 请做一次记忆 handoff\n\n按 `memj_handoff` 工具的说明执行。要点：…' }] },
    },
  }
  const hotThenCmd = [
    injEvent(20, '2026-09-23T08:00:00.000Z', `## memj 热知识（本次会话相关）\n\n- \`${A}\` 甲\n- \`${B}\` 乙`),
    cmdInjection,
  ]
  const r2 = mod.fingerprintsFromInjectionEvents(hotThenCmd, [A, B])
  check('⭐⭐⭐ 命令注入排在热知识之后 ⇒ **仍找回热知识那次的指纹**（方案 A 的核心）',
    r2.present.has(A) && r2.present.has(B), JSON.stringify([...r2.present]))
  check('⭐⭐ 且**不会**因为"最近那条不含指纹"而回空集（旧实现正是在这里撒谎）',
    r2.present.size > 0, `size=${r2.present.size}`)
  check('⭐ 时刻仍是**热知识那次**的（不是命令注入那次的）',
    r2.at === '2026-09-23T08:00:00.000Z', r2.at)

  // ⚠️ **反证：全是命令注入（从没注入过热知识）⇒ 仍必须是空集** ——
  //    否则"跳过不含指纹的"会被做成"随便找一条就算"，那就从"假红"变成"假绿"了。
  const onlyCmd = mod.fingerprintsFromInjectionEvents(
    [cmdInjection, { ...cmdInjection, seq: 31, time: Date.parse('2026-09-23T09:30:00.000Z') }], [A, B])
  check('⚠️（反证）**只有命令注入、没有热知识注入 ⇒ 空集**（不能"随便找一条就算"）',
    onlyCmd.present.size === 0 && onlyCmd.at === '', JSON.stringify([...onlyCmd.present]))

  // ⚠️ **反证：fps 全为空串 ⇒ 不能把"没有任何可判定的指纹"当成"命中"**
  const emptyFps = mod.fingerprintsFromInjectionEvents(hotThenCmd, ['', ''])
  check('⚠️（反证）指纹全为空 ⇒ 空集（**不把"无从判定"当命中**）',
    emptyFps.present.size === 0 && emptyFps.at === '', JSON.stringify([...emptyFps.present]))

  // ⭐ **多条热知识注入时，累加全部**（新语义）+ 命令注入不干扰
  const twoHot = mod.fingerprintsFromInjectionEvents(
    [injEvent(1, '2026-09-23T08:00:00.000Z', `- \`${A}\` 甲`), cmdInjection,
      injEvent(40, '2026-09-23T10:00:00.000Z', `- \`${B}\` 乙`)],
    [A, B])
  check('⭐ 夹着命令注入的两条热知识 ⇒ **两条都算已注入**（累加；命令注入不干扰）',
    twoHot.present.has(A) && twoHot.present.has(B), JSON.stringify([...twoHot.present]))
  check('⭐ 且 `at` 取**最后一次热知识**（10:00 那次，不是命令注入那次的 09:00）',
    twoHot.at === '2026-09-23T10:00:00.000Z', twoHot.at)
}

// ══════════════════════════════════════════════════════════════════════════
section('【10c】⭐⭐ 共享比对实现 `fingerprintsInText`（2026-09-24 两处统一）')
// ══════════════════════════════════════════════════════════════════════════

// 🔴 **为什么要单测它**：它是**看门狗与重建共用的那一份**（本项目"实现只留一份"），
//    改坏了会**同时**影响"每轮注入判定"与"重启后重建"两条路。
//    ⚠️ 而它最容易犯的错是：**只用 uuid 正则扫 ⇒ 漏掉画像的文本指纹**（画像没有封面 id）。
{
  const U1 = '11111111-2222-4333-8444-555555555555'
  const U2 = '66666666-7777-4888-8999-000000000000'
  const persona = '思考过程和回答使用中文。'   // 非 uuid 指纹（画像）

  const text = `## memj 热知识\n\n${persona}\n- \`${U1}\` 甲`

  const r = mod.fingerprintsInText(text, [U1, U2, persona])
  check('⭐ uuid 指纹能认出来（走正则扫 + 求交）', r.has(U1), JSON.stringify([...r]))
  check('⭐ 文本里没有的 uuid **不**被认成出现', !r.has(U2), JSON.stringify([...r]))
  check('⭐⭐⭐ **非 uuid 的画像指纹也能认出来**（正则扫不到它 ⇒ 必须有 includes 兜底）',
    r.has(persona), JSON.stringify([...r]))
  check('⭐ 空指纹被忽略（不污染结果）',
    mod.fingerprintsInText(text, ['', U1]).size === 1)
  check('⚠️（反证）空文本 ⇒ 空集', mod.fingerprintsInText('', [U1]).size === 0)
  check('⚠️（反证）待认清单为空 ⇒ 空集', mod.fingerprintsInText(text, []).size === 0)

  // ⚠️ **反证：正则形状必须与真实封面 id 一致**（大写不算）
  //    🔴 **第一版这条断言是个"永远不会失败"的检查**（我自己的测试数据坑）：
  //       我用的 `U1` 是**纯数字** uuid（`1111…`），`toUpperCase()` 对它**毫无改变**
  //       ⇒ `text.includes(U1)` 仍为 true ⇒ 断言无辜报红、且**根本没验到大小写**。
  //    ⭐ 判据：**造反例时先确认"这个改动真的让输入变了吗"**（同族：夹具要过同一套校验）。
  const UA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'   // ⚠️ **含字母**才测得到大小写
  check('⭐⭐（反证）**大写 uuid 不算**（封面 id 是全小写）——⚠️ 用含字母的 id 才测得到',
    mod.fingerprintsInText(['- ', String.fromCharCode(96), UA.toUpperCase(), String.fromCharCode(96), ' jia'].join(''), [UA]).size === 0)
  check('⭐（正向对照）同一个小写 id 在同样文本里**能**认出来',
    mod.fingerprintsInText(['- ', String.fromCharCode(96), UA, String.fromCharCode(96), ' jia'].join(''), [UA]).has(UA))
  // ⭐ **多次调用互不影响**（正则带 /g 时有 lastIndex 状态 ⇒ 复用它必须安全）
  const first = mod.fingerprintsInText(text, [U1]).size
  const second = mod.fingerprintsInText(text, [U1]).size
  check('⭐⭐ **同一正则可安全复用**（带 /g 的正则有 lastIndex 状态，复用不能影响结果）',
    first === 1 && second === 1, `first=${first} second=${second}`)

  // ⭐ **两处共用同一实现**：同一段文本，看门狗与重建给出的结论必须一致
  const msgs = [{ role: 'user', content: [{ type: 'text', text }] }]
  const viaWatchdog = mod.idsInWindow(msgs, [U1, U2, persona])
  const viaRebuild = mod.fingerprintsFromInjectionEvents(
    [{ type: 'user/message', time: Date.now(), data: { source: { kind: 'plugin', plugin: 'dsh-memj' }, message: { content: [{ type: 'text', text }] } } }],
    [U1, U2, persona]).present
  check('⭐⭐ **看门狗与重建的结论逐条一致**（共用实现的核心价值）',
    [...viaWatchdog].sort().join(',') === [...viaRebuild].sort().join(','),
    `watchdog=${JSON.stringify([...viaWatchdog])} rebuild=${JSON.stringify([...viaRebuild])}`)
  check('⭐ 且两边都认出了画像指纹',
    viaWatchdog.has(persona) && viaRebuild.has(persona))
}

// ══════════════════════════════════════════════════════════════════════════
section('【10d】⭐⭐⭐ decideInjection：内存缺失时从日志补快照（2026-09-24 用户报的 bug）')
// ══════════════════════════════════════════════════════════════════════════

// 🔴 **用户报的现象**：*"我重启之后，他明明显示全部已注入过的，
//    但是他还是重新注入了一遍所有热知识。"*
// ⭐ **根因**：重建只写在 `api.ts` 的 `/hot` 里（给人看页面用），
//    **注入侧（本函数）只读内存** ⇒ 两条路各算各的 ⇒
//    重启后 `present` 为空 ⇒ 判成"全缺" ⇒ 全量重注入。
// ⚠️ **本函数此前【零测试覆盖】** —— 这正是这个缺口能潜伏的原因（本项目已记过该模式）。
{
  const { writeFileSync, mkdirSync } = await import('node:fs')
  // 🔴🔴 **本 section 必须用【独立的库】**：整个测试文件共用一个 `lib` 目录，
  //    而 `collectHotItems` 会收**所有 `global: true` 的封面**（不分项目）
  //    ⇒ 别的 section 写进去的全局封面会**混进本节的 `expected`**
  //    ⇒ 断言全乱（实测：`expected` 变成 3 条，多出一个 `11111111-…`）。
  //    ⭐ 我一开始只改 id（以为避开重名就行）—— **没用**：污染源不是重名，是**同一个库**。
  //    ⚠️ 判据：**共用夹具目录时，要么各自用独立的库，要么保证互不干扰**。
  const { mkdtempSync: mkd } = await import('node:fs')
  const { tmpdir: tdir } = await import('node:os')
  const { join: pjoin } = await import('node:path')
  const savedLib = process.env['MEMJ_DATA_DIR']
  const myLib = mkd(pjoin(tdir(), 'memj-decide-'))
  process.env['MEMJ_DATA_DIR'] = myLib
  const lib = myLib   // ⚠️ 本块内**遮蔽**外层的 `lib`（后续都用这个独立库）
  // ⭐ **复用项目既有的真封面夹具**（`renderCover` + 写在项目 handoff 的「沉淀知识」节）——
  //    🔴 我第一版**手搓**了一个 `<!-- memj:entry ... -->`，格式不对 ⇒ 封面被静默丢弃
  //    ⇒ `preview` 为 0 ⇒ 断言**假绿**（"没有可注入的 ⇒ text 为空"看起来像"正确地没注入"）。
  //    ⭐ 判据（本项目已记过）：**夹具"看起来合理"不够，要过与被测代码同一套校验**。
  const { renderCover } = await import('../lib/offline-bundle.js')
  const pid = 'proj-decide'
  // 🔴 **id 必须与其它 section 不重复** —— 整个测试文件**共用一个 `lib` 目录**，
  //    我第一版复用了 `11111111-…`（【9】节也在用），结果封面被扫到**两次**
  //    ⇒ `expected` 变成 3 条 ⇒ 断言全乱。
  //    ⭐ 判据：**共用夹具目录时，各 section 的标识必须唯一**（否则会互相污染）。
  const ID1 = 'd1d1d1d1-1111-4111-8111-111111111111'
  const ID2 = 'd2d2d2d2-2222-4222-8222-222222222222'
  const mk = (id) => ({
    id, project: pid, theme: [], global: false, kind: '', tags: ['t'],
    title: `标题-${id.slice(0, 8)}`, desc: '某场景下的某知识；当某场景时读它。',
    ref: `entries/x-${id.slice(0, 8)}.md`, ext: false,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    archivedAt: '',
  })
  mkdirSync(join(lib, 'projects'), { recursive: true })
  writeFileSync(join(lib, 'projects', `HANDOFF-${pid}.md`),
    `# HANDOFF — ${pid}\n\n## 目标\n\n测试用。\n\n## 沉淀知识\n\n`
    + `${renderCover(mk(ID1))}\n\n${renderCover(mk(ID2))}\n`, 'utf8')
  // 项目清单：两条都在里面（= 都会注入）
  await mod.saveSelections({
    [pid]: {
      entries: [{ id: ID1, shape: 'meta', pinnedAt: '' }, { id: ID2, shape: 'meta', pinnedAt: '' }],
      initializedAt: '2026-09-01T00:00:00.000Z',
    },
  })

  /** 造一个"会话日志里有一条含 IDx 的 memj 注入"的假 query 服务。 */
  const fakeCtx = (events) => ({
    get: (n) => (n === 'sessionQuery' ? { readSession: async () => ({ events }) } : undefined),
  })
  const injEv = (texts) => ({
    type: 'user/message',
    time: Date.now(),
    data: { source: { kind: 'plugin', plugin: 'dsh-memj' }, message: { content: texts.map((t) => ({ type: 'text', text: t })) } },
  })

  // ⚠️ **前置条件**：先确认夹具真的被扫到了 —— 否则下面的断言全是假绿。
  const base = await mod.buildHotInjection('s-pre', pid)
  check('⚠️（前置条件）夹具的两条封面**真被扫到了**（否则后面全是假绿）',
    base.preview.length === 2, `preview=${JSON.stringify(base.preview.map((p) => p.id.slice(0, 8)))}`)

  // ── 场景 ①：内存没有 + 日志里有 ⇒ **应当重建，不重复注入**（本次修的核心）──
  const ctxWithLog = fakeCtx([injEv([`## memj 热知识\n- \`${ID1}\` AAA\n- \`${ID2}\` BBB`])])
  const d1 = await mod.decideInjection('sess-1', pid, undefined, ctxWithLog)
  check('⭐⭐⭐ 内存快照缺失 + 日志里有 ⇒ **不注入**（旧实现在这里会全量重注入）',
    d1.expected.length === 2 && d1.text === '' && d1.injected.length === 0,
    `expected=${d1.expected.length} text.length=${d1.text.length} injected=${JSON.stringify(d1.injected)}`)
  check('⭐⭐ 并把重建的那份**带回给调用方**（用于写回内存）',
    d1.rebuilt !== undefined && d1.rebuilt.present.size === 2, `rebuilt=${d1.rebuilt === undefined ? 'undefined' : d1.rebuilt.present.size}`)

  // ── 场景 ②：日志里只注入过 ID1 ⇒ **只补 ID2**（缺哪条补哪条）──
  const ctxPartial = fakeCtx([injEv([`## memj 热知识\n- \`${ID1}\` AAA`])])
  const d2 = await mod.decideInjection('sess-2', pid, undefined, ctxPartial)
  check('⭐⭐ 日志里只注入过 1 条 ⇒ 判定出"缺 1 条"（而不是全缺）',
    d2.injected.length === 1 && d2.injected[0] === ID2, JSON.stringify(d2.injected))

  // ── ⭐⭐⭐ 场景 ②b：**发出去的文本里【只含】缺的那条**（用户最早报的 bug）──
  //
  // 🔴 **这是本项目最能潜伏的缺陷**：`injected` 字段一直是对的（它列出缺了哪几条），
  //    **但发出去的 `text` 是整批** ⇒ 只断言 `injected` 的测试**全绿**，
  //    看日志的人以为"只补了 1 条"，**只有去读真正发出去的文本才能发现**。
  //    实测证据（修之前）：3 次注入逐字相同（4236 字符）；只新增一条 62 字符的画像，
  //    却重发了全部 4236 字符（4299 − 4236 ≈ 62）。
  check('⭐⭐⭐ 补注文本**只含缺的那条**（ID2），**不含已在窗口的 ID1**',
    d2.text.includes(ID2) && !d2.text.includes(ID1),
    `text 含 ID1=${d2.text.includes(ID1)} 含 ID2=${d2.text.includes(ID2)}｜长度 ${d2.text.length}`)

  // ── ⭐⭐ 场景 ②c：**分形态两段**（用户 2026-09-24 裁定）──
  check('⭐ 补注模式返回 `bodyText` / `metaText` 两个字段',
    typeof d2.bodyText === 'string' && typeof d2.metaText === 'string')
  check('⭐ 两条都是 meta 形态 ⇒ 内容落在 `metaText` 里、`bodyText` 为空',
    d2.metaText.includes(ID2) && d2.bodyText === '', `body=${d2.bodyText.length} meta=${d2.metaText.length}`)
  check('⭐⭐ **meta 段的收尾**含"正文按需 `memj_read`"（那句只对 meta 形态成立）',
    d2.metaText.includes('memj_read'), JSON.stringify(d2.metaText.slice(-120)))
  check('⭐⭐ **补注标题与首次区分**（用「补充」，免得模型以为又来了一整批新的）',
    d2.metaText.includes('（补充）') && !d2.metaText.includes('（本次会话相关）'),
    JSON.stringify(d2.metaText.slice(0, 60)))

  // ── 场景 ③：日志里压根没有 memj 注入 ⇒ 退化为"全缺 ⇒ 全注入"（首步的正确行为）──
  const ctxEmpty = fakeCtx([])
  const d3 = await mod.decideInjection('sess-3', pid, undefined, ctxEmpty)
  check('⭐ 日志里没有注入记录 ⇒ 全缺 ⇒ 全注入（**会话首步的正确行为**，别当 bug）',
    d3.injected.length === 2, JSON.stringify(d3.injected))
  check('⭐ 全缺时两条都在（ID1 + ID2）⇒ `metaText` 里都能找到',
    d3.metaText.includes(ID1) && d3.metaText.includes(ID2))
  // ⚠️ **这条必须在 `d3` 之后**（我第一次写在前面，撞了 `const` 的 TDZ —— 只在运行时才炸）。
  check('⭐⭐ 补注**比全量短**（只发缺的 ⇒ 省 token 的直接证据）',
    d2.text.length < d3.text.length, `补注 ${d2.text.length} vs 全量 ${d3.text.length}`)

  // ── 场景 ④：**给了内存快照 ⇒ 不许去读日志**（性能保证）──
  //    ⚠️ 这条是"方案 A 的边界"：读日志要解压十几 MB，而本函数**每步都跑**。
  let logReads = 0
  const ctxCounting = {
    get: (n) => (n === 'sessionQuery'
      ? { readSession: async () => { logReads += 1; return { events: [] } } }
      : undefined),
  }
  const haveAll = new Set([ID1, ID2])
  const d4 = await mod.decideInjection('sess-4', pid, haveAll, ctxCounting)
  check('⭐⭐⭐ **有内存快照时【不读日志】**（性能保证：本函数每步都跑）',
    logReads === 0, `logReads=${logReads}`)
  check('⭐ 且一条不缺 ⇒ 不注入', d4.text === '' && d4.injected.length === 0)
  check('⭐ 没有重建 ⇒ 不回传 `rebuilt`（调用方不必写回）', d4.rebuilt === undefined)

  // ── 场景 ⑤：**不给 ctx** ⇒ 退化为原行为（向后兼容）──
  const d5 = await mod.decideInjection('sess-5', pid, undefined)
  check('⭐ 不传 `ctx` ⇒ 退化为"全缺 ⇒ 全注入"（向后兼容）',
    d5.injected.length === 2 && d5.rebuilt === undefined, JSON.stringify(d5.injected))

  // ⚠️ **收尾：把库切回去**（否则这个独立库会污染后续 section）。
  process.env['MEMJ_DATA_DIR'] = savedLib
}

// ══════════════════════════════════════════════════════════════════════════
section('【11】⭐⭐ resolveProject：开关只管"重新判定"，不废除已有绑定（2026-09-23 用户报的 bug）')
// ══════════════════════════════════════════════════════════════════════════

//
// 🔴 **用户实测报告**（原话）：*"我在会话实时状态那一页。关闭程序化判断开关的时候，
//    热知识注入情况的列表就只显示画像和全局知识了。咋回事？
//    是说关闭开关的时候，就失去项目判定了？"*
//
// ⭐ 根因：旧实现**只有 `manual` 的绑定会被直接采纳**，其余一律走"重新判定"，
//    而重新判定的**前提是开关开着** ⇒ 开关一关，`sessions.json` 里那条
//    `doc-reads` 绑定就被**无视**（⚠️ 没被删）⇒ 返回 `未知`
//    ⇒ `collectHotItems('未知')` 只收全局 + 画像 ⇒ **项目/主题知识全消失**。
// 🔴 **两件事被混进了一个条件**：**"要不要继续判定"**（开关该管）
//    与 **"已判定的算不算数"**（与开关无关 —— 结果一旦落盘就是事实）。
//
// ⚠️ **本节是本项目第一次测 `resolveProject`**（此前 10 节都没测过它）——
//    这正是这个 bug 能溜过去的原因。
{
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { renderCover } = await import('../lib/offline-bundle.js')
  const PID = 'proj-resolve'

  // ── 造一个真项目（`resolveProject` 会用 `scanLibrary` 校验项目是否存在）──
  const mk = (id) => ({
    id, project: PID, theme: [], global: false, kind: '', tags: ['t'],
    title: `标题-${id.slice(0, 8)}`, desc: '某场景下的某知识；当某场景时读它。',
    ref: `entries/x-${id.slice(0, 8)}.md`, ext: false,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    archivedAt: '',
  })
  const E1 = '44444444-4444-4444-8444-444444444444'
  mkdirSync(join(lib, 'projects'), { recursive: true })
  writeFileSync(join(lib, 'projects', `HANDOFF-${PID}.md`),
    `# HANDOFF — ${PID}\n\n## 目标\n\n测试用。\n\n## 沉淀知识\n\n${renderCover(mk(E1))}\n`, 'utf8')

  /** 写一个会话绑定（直接落盘 ⇒ 模拟"以前判定过"）。 */
  const bind = async (sid, project, source) => {
    const f = await mod.loadSessionsFile()
    f.sessions[sid] = {
      project, source, boundAt: '2026-09-22T10:00:00.000Z', lastActiveAt: '2026-09-22T10:00:00.000Z',
    }
    await mod.saveSessionsFile(f)
  }
  /** 切换 detectDocReads 开关。 */
  const setDetect = async (on) => {
    const f = await mod.loadSessionsFile()
    f.detectDocReads = on
    await mod.saveSessionsFile(f)
  }
  /** 假的 ctx（本用例不需要读会话日志 ⇒ get 一律返回 undefined）。 */
  const ctx = { get: () => undefined }

  // ── 情形 A：开关**关着** + 已有 `doc-reads` 绑定 ⇒ 必须仍然判出该项目 ──
  //
  // 🔴 **这正是用户报的那个场景** —— 修复前这里会返回「未知」。
  await bind('sess-off-docreads', PID, 'doc-reads')
  await setDetect(false)
  const a = await mod.resolveProject(ctx, 'sess-off-docreads')
  check('⭐⭐ **开关关着时，已有的 `doc-reads` 绑定仍然生效**（用户报的 bug 已修）',
    a.project === PID, JSON.stringify(a))
  check('⭐ 且**来源如实回**（页面要显示"是谁定的"）', a.source === 'doc-reads', JSON.stringify(a))

  // ── 情形 B：`llm` 来源同等对待（用户裁定："llm 来源的绑定也保留"）──
  await bind('sess-off-llm', PID, 'llm')
  const b = await mod.resolveProject(ctx, 'sess-off-llm')
  check('⭐⭐ **`llm` 来源的绑定也保留**（与 manual 同等对待）',
    b.project === PID && b.source === 'llm', JSON.stringify(b))

  // ── 情形 C：`manual` 一直不受开关影响（旧行为，防回归）──
  await bind('sess-off-manual', PID, 'manual')
  const c = await mod.resolveProject(ctx, 'sess-off-manual')
  check('⭐ `manual` 绑定不受开关影响（旧行为不回归）',
    c.project === PID && c.source === 'manual', JSON.stringify(c))

  // ── 情形 D：⚠️ **反证** —— 项目已不在库里 ⇒ 必须**不算数** ──
  //
  // ⭐ 修复**不能**顺手把"项目校验"也放过：已删/已归档的项目**绝不能**被采纳
  //    （否则会去注入一个不存在的项目）。
  await bind('sess-off-gone', 'proj-does-not-exist', 'doc-reads')
  const d = await mod.resolveProject(ctx, 'sess-off-gone')
  check('⚠️（反证）**绑定指向一个不存在的项目 ⇒ 仍返回「未知」**（不注入不存在的项目）',
    d.project === mod.HOT_PROJECT_UNKNOWN, JSON.stringify(d))

  // ── 情形 E：⚠️ **反证** —— 从没判定过的会话 ⇒ 仍然是「未知」（不瞎猜）──
  const e = await mod.resolveProject(ctx, 'sess-never-judged')
  check('⚠️（反证）**从没判定过 ⇒ 仍是「未知」**（开关关着也不该凭空造一个）',
    e.project === mod.HOT_PROJECT_UNKNOWN, JSON.stringify(e))

  // ── 情形 F：开关**开着**时，判定链本身仍然优先于旧绑定（防"修复过头"）──
  //
  // ⚠️ 本用例没法造"新判定结果"（那要造 doc-reads 记录），
  //    所以退一步只验：**开关开着 + 无任何判据命中 + 有旧绑定 ⇒ 仍走旧绑定**。
  await setDetect(true)
  const f = await mod.resolveProject(ctx, 'sess-off-docreads')
  check('⭐ 开关开着、判据都没命中时，**旧绑定仍然是兜底**（不会反而变未知）',
    f.project === PID, JSON.stringify(f))

  // 还原本用例改过的开关（免得影响后续断言）。
  await setDetect(true)
}

// ══════════════════════════════════════════════════════════════════════════
// 【11b】⭐⭐⭐ 子代理**继承父会话项目绑定**（2026-09-29 用户裁定）
//
// 用户原话：*"由主会话 llm 发起的子代理需要继承，纯由我插件发起的子代理不继承
//           比如现在那个做标签规范的。"*
//
// 🔴 本节的**关键难点**：DSH 的会话头**区分不出这两种子代理**
//    （实测 LLM 发起的与插件发起的逐字段相同）⇒ 只能靠**插件自己记账**
//    （`subagent-origin.ts` 的 `markPluginSpawned`）。
//    ⇒ 所以本节必须**同时**验"该继承的继承了"与"不该继承的没继承"，
//       只验前一半会让"全都继承"这个错误实现也全绿。
{
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { renderCover } = await import('../lib/offline-bundle.js')
  const PID2 = 'proj-inherit'

  const mk2 = (id) => ({
    id, project: PID2, theme: [], global: false, kind: '', tags: ['t'],
    title: `标题-${id.slice(0, 8)}`, desc: '某场景下的某知识；当某场景时读它。',
    ref: `entries/y-${id.slice(0, 8)}.md`, ext: false,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    archivedAt: '',
  })
  const E2 = '55555555-5555-4555-8555-555555555555'
  mkdirSync(join(lib, 'projects'), { recursive: true })
  writeFileSync(join(lib, 'projects', `HANDOFF-${PID2}.md`),
    `# HANDOFF — ${PID2}\n\n## 目标\n\n测试用。\n\n## 沉淀知识\n\n${renderCover(mk2(E2))}\n`, 'utf8')

  const bind2 = async (sid, project, source) => {
    const f = await mod.loadSessionsFile()
    f.sessions[sid] = {
      project, source, boundAt: '2026-09-29T10:00:00.000Z', lastActiveAt: '2026-09-29T10:00:00.000Z',
    }
    await mod.saveSessionsFile(f)
  }
  // ⭐ 假 ctx：`sessionQuery.observeSession` 回一个**带 `parentSession` 的会话头**。
  //
  // 🔴🔴 **形状必须照真实 API，别照我的想象**（2026-09-29 实测纠正）：
  //    我第一版造的假 events 是 `[{type:'session', parentSession:…}]`，
  //    而**真实的 `parentSession` 在 `header` 上、不在 `events` 里** ——
  //    `events` 是 `session.snapshotEvents()`（只含对话/工具事件）。
  //    ⇒ 那个假夹具让**错的实现全绿**、而生产上静默失效。
  //    ⭐ 判据：**夹具要用"真实数据的形状"，不是"我以为的形状"**。
  //    实测来源：`dsh-session-query/lib/index.js:275-276`
  //      `observeSession` ⇒ `{ header: session.header, events: session.snapshotEvents() }`
  //      `readSession`    ⇒ `{ session: <header>, events: loaded.events }`
  //    ⇒ 本夹具**同时覆盖两种形状**（下面 G/H 用 observe、K' 用 read）。
  const ctxWithParent = (parent) => ({
    get: (name) => name === 'sessionQuery'
      ? {
        observeSession: async () => ({
          // ⭐ 真实形状：头在 `header`，`events` 里**没有**会话头那一条。
          header: { type: 'session', version: 3, id: 'child', parentSession: parent, origin: 'subagent', delegationDepth: 1 },
          events: [{ type: 'assistant/message', data: {} }],
          [Symbol.dispose]: () => {},
        }),
      }
      : undefined,
  })

  const PARENT = 'session-parent-0001'
  const CHILD_LLM = 'session-child-llm-01'      // LLM 发起 ⇒ 应继承
  const CHILD_PLUGIN = 'session-child-plugin-01' // 插件发起 ⇒ 不继承

  await bind2(PARENT, PID2, 'doc-reads')

  // ── 情形 G：**LLM 发起的子代理 ⇒ 继承父会话项目** ──
  const g = await mod.resolveProject(ctxWithParent(PARENT), CHILD_LLM)
  check('⭐⭐⭐ **LLM 发起的子代理继承父会话的项目绑定**（用户裁定）',
    g.project === PID2, JSON.stringify(g))
  check('⭐⭐ 且来源**单独标成 `inherited`**（不是 doc-reads）',
    g.source === 'inherited', JSON.stringify(g))

  // ── 情形 H：⚠️ **反证：插件发起的子代理【不】继承** ──
  //
  // 🔴 这一条是本节的重点：若实现写成"只要是子代理就继承"，
  //    G 仍会绿、而 H 会红 —— 所以**必须有 H**。
  await mod.markPluginSpawned(CHILD_PLUGIN)
  const h = await mod.resolveProject(ctxWithParent(PARENT), CHILD_PLUGIN)
  check('⚠️（反证）**插件发起的子代理【不】继承**（标签规范化那种）',
    h.project === mod.HOT_PROJECT_UNKNOWN, JSON.stringify(h))

  // ── 情形 I：⚠️ **反证：父会话自己也没绑定时，继承不了任何东西** ──
  const i = await mod.resolveProject(ctxWithParent('session-parent-unbound'), CHILD_LLM)
  check('⚠️（反证）父会话也没有绑定时 ⇒ 仍然「未知」（不凭空造）',
    i.project === mod.HOT_PROJECT_UNKNOWN, JSON.stringify(i))

  // ── 情形 J：⭐⭐ 顶层会话（无 `parentSession`）不受影响 ──
  const ctxTop = { get: (name) => name === 'sessionQuery'
    ? { observeSession: async () => ({ header: { type: 'session', version: 3, id: 'top' }, events: [], [Symbol.dispose]: () => {} }) }
    : undefined }
  const j = await mod.resolveProject(ctxTop, 'sess-top-level-xyz')
  check('⭐ 顶层会话（无 parentSession）⇒ 不触发继承，仍是「未知」',
    j.project === mod.HOT_PROJECT_UNKNOWN, JSON.stringify(j))

  // ── 情形 K：⭐⭐ 子代理**自己的证据优先于继承**（继承只是兜底）──
  await bind2(CHILD_LLM, PID2, 'doc-reads')
  const k = await mod.resolveProject(ctxWithParent(PARENT), CHILD_LLM)
  check('⭐⭐ 子代理自己有绑定时 ⇒ 用它自己的（来源不是 inherited）',
    k.project === PID2 && k.source !== 'inherited', JSON.stringify(k))

  // ── 情形 L：⚠️⚠️ **反证：父会话 id 只出现在 `events` 里（不在 header）⇒ 不该继承** ──
  //
  // 🔴 这一条**专门盯我第一版那个 bug**：我原来读 `events[].type==='session'`，
  //    而真实 API **把会话头放在 `header`、`events` 里没有它**。
  //    ⇒ 那种写法在生产上**静默失效**，但当时的假夹具喂的正是那种形状 ⇒ 全绿。
  //    ⭐ 本反证模拟"真实的 events 形状"（不含会话头）⇒ 必须**判不出来**。
  //    ⚠️ 也就是说：如果谁把实现改回"从 events 里找会话头"，这条会**报红**。
  const ctxEventsOnly = {
    get: (name) => name === 'sessionQuery'
      ? {
        observeSession: async () => ({
          // ⚠️ 故意**不给 header**，只在 events 里塞一条会话头 —— 真实的 events 不是这样。
          events: [{ type: 'session', parentSession: PARENT }],
          [Symbol.dispose]: () => {},
        }),
      }
      : undefined,
  }
  const l = await mod.resolveProject(ctxEventsOnly, 'sess-child-events-only')
  check('⚠️⚠️（反证）**父会话 id 只在 `events` 里（不在 header）⇒ 不继承**（真实 API 的形状）',
    l.project === mod.HOT_PROJECT_UNKNOWN, JSON.stringify(l))

  // ── 情形 M：⭐ `readSession` 兜底路径也要能读到父会话（字段名是 `session`）──
  const ctxReadFallback = {
    get: (name) => name === 'sessionQuery'
      ? {
        // observeSession 抛错 ⇒ 应落到 readSession
        observeSession: async () => { throw new Error('observe unavailable') },
        readSession: async () => ({
          session: { type: 'session', version: 3, id: 'child', parentSession: PARENT },
          events: [],
        }),
      }
      : undefined,
  }
  const m = await mod.resolveProject(ctxReadFallback, 'sess-child-read-fallback')
  check('⭐ `observeSession` 不可用时，**`readSession` 兜底仍能读到父会话**（字段名 `session`）',
    m.project === PID2 && m.source === 'inherited', JSON.stringify(m))
}

// ══════════════════════════════════════════════════════════════════════════
console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
try { rmSync(lib, { recursive: true, force: true }) } catch { /* 清理失败不影响结论 */ }
if (fail > 0) process.exitCode = 1
