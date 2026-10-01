// host 契约探针：用 stub webServer/systemPrompt/tools/commands 直接跑 lib/index.js 的 apply()。
// 秒级验证"插件真的把工具/命令/协议注册上了"——这是最容易静默失败的一环。
// ⚠️ stub 必须**复刻真实校验**（尤其 commands 的 hint 非空），否则探针会全绿而线上全废。
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-probe-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')

let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}

// ── 构造 stub 上下文 ──
const registeredTools = []
const registeredCommands = []
const registeredSections = []
const registeredRoutes = []
const effects = []
const injectedCallbacks = []

const ctx = {
  logger: { info() {}, warn() {}, error(...a) { console.log('    [logger.error]', ...a) } },
  get(name) {
    if (name === 'webServer') return {
      register(route) { registeredRoutes.push(route); return () => {} },
    }
    return undefined
  },
  effect(fn, name) { effects.push({ name, dispose: fn() }) },
  inject(deps, cb) { injectedCallbacks.push({ deps, cb }) },
  on() { return () => {} },
}

// inject 的回调要手动喂一个 scoped ctx（模拟依赖就绪）。
const scoped = {
  logger: ctx.logger,
  systemPrompt: {
    section(def) { registeredSections.push(def); return () => {} },
    context(def) { registeredSections.push({ ...def, isContext: true }); return () => {} },
  },
  tools: {
    register(def) {
      // 真实 register 会校验定义；这里复刻最小校验集。
      if (typeof def.name !== 'string' || def.name === '') throw new Error('tool name required')
      if (typeof def.description !== 'string' || def.description === '') throw new Error(`tool ${def.name} description required`)
      if (typeof def.execute !== 'function') throw new Error(`tool ${def.name} execute required`)
      if (def.output === undefined || def.output.schema === undefined || typeof def.output.render !== 'function') {
        throw new Error(`tool ${def.name} output required`)
      }
      registeredTools.push(def)
      return () => {}
    },
  },
  commands: {
    register(def) {
      // 🔴 **必须逐条复刻真实校验**（`dsh-commands/lib/index.js` 的 `normalizeDefinition`）。
      //    ⚠️ 教训：这里曾经只判 `def.input.hint === ''`，而真实判据是
      //    **`hint.trim().length === 0`** ⇒ `hint: ' '`（纯空格）在真实实现里会被拒、
      //    在探针里却通过 ⇒ **探针全绿、线上命令静默没注册**（已实测踩到）。
      if (typeof def.name !== 'string' || def.name === '') throw new Error('command name required')
      if (!/^[a-z0-9_-]+$/.test(def.name)) throw new Error(`command name "${def.name}" must match /^[a-z0-9_-]+$/`)
      if (typeof def.description !== 'string') throw new Error(`command ${def.name} description must be a string`)
      if (def.description.trim().length === 0) throw new Error(`command ${def.name} description must not be empty`)
      if (typeof def.handler !== 'function') throw new Error(`command ${def.name} handler required`)
      const rawInput = def.input
      if (rawInput !== undefined) {
        if (typeof rawInput !== 'object' || rawInput === null || !('hint' in rawInput) || typeof rawInput.hint !== 'string') {
          throw new Error(`command "${def.name}" input hint must be a string`)
        }
        // ⭐ 真实判据是 `.trim().length === 0`——纯空格同样被拒。
        if (rawInput.hint.trim().length === 0) {
          throw new Error(`command "${def.name}" input hint must not be empty`)
        }
        if ('attachments' in rawInput && rawInput.attachments !== undefined && typeof rawInput.attachments !== 'boolean') {
          throw new Error(`command "${def.name}" input attachments flag must be a boolean`)
        }
      }
      registeredCommands.push(def)
      return () => {}
    },
  },
  get(name) { return this[name] },
  // ⭐⭐ **`on` / `off` 必须在这个 scoped 桩上**（2026-09-28 踩到）。
  //    🔴 缺了它的后果：`registerTagAutoNormalize` 抛 `ctx.on is not a function`
  //    ⇒ `tag-auto-THREW` ⇒ 探针报红。
  //    ⚠️ 为什么**以前没暴露**：热知识注入（`registerHotInjection`）也调 `ctx.on`，
  //       但它的开关**默认关** ⇒ 提前 return、根本走不到那一行；
  //       而 `tagNormalizeOnHandoff` **默认开** ⇒ 一上来就撞上。
  //    ⇒ ⭐ 判据：**测试桩要复刻"真实 ctx 有的东西"**，
  //       否则"默认关的功能"会让这个缺口一直藏着。
  on() { return () => {} },
  off() {},
  logger: ctx.logger,
  effect(fn, name) { effects.push({ name, dispose: fn() }); return () => {} },
}

console.log('【A】apply() 能跑通且注册协议 / 工具 / 命令 / 路由')
mod.apply(ctx, mod.DEFAULT_CONFIG)
check('导出 name = dsh-memj', mod.name === 'dsh-memj')
check('导出了 inject 数组', Array.isArray(mod.inject) && mod.inject.length > 0, JSON.stringify(mod.inject))
check('调用了 ctx.inject', injectedCallbacks.length === 1)
check('effect 里注册了路由', effects.length >= 1)

// 触发 inject 回调（模拟依赖就绪）
for (const { cb } of injectedCallbacks) cb(scoped)

// ⚠️ **决策 124 起有两条通道**：`section()`（协议，node 0）与
//    `context()`（运行时上下文，user 角色）。stub 把两者都推进 `registeredSections`
//    （后者带 `isContext: true`）⇒ 这里必须**分开数**。
const sectionDefs = registeredSections.filter((s) => s.isContext !== true)
const contextDefs = registeredSections.filter((s) => s.isContext === true)
check('注册了静态协议 section（且只有一条）', sectionDefs.length === 1, `实际 ${sectionDefs.length}`)
check('协议 section 的 name 正确', sectionDefs[0]?.name === 'memj:protocol', sectionDefs[0]?.name)
check('协议是函数型 provider（内容恒定）', typeof sectionDefs[0]?.text === 'function')
check('协议文本非空且含工具名',
  typeof registeredSections[0]?.text === 'function' &&
  registeredSections[0].text().includes('memj_search') &&
  registeredSections[0].text().includes('memj_snapshots'))
check('协议 order = 3000', registeredSections[0]?.order === 3000, String(registeredSections[0]?.order))

console.log('\n【B】工具注册（十一个）')
// ⚠️ `defineTool` 会把 `parameters` **编译成 JSON Schema**
//    （`{type, properties, required[]}`），不是保留原始 DSL 定义。
//    所以下面的断言要看 `properties` 与 `required` 数组。
const propsOf = (t) => Object.keys(t.parameters?.properties ?? {})
const requiredOf = (t) => t.parameters?.required ?? []

const names = registeredTools.map((t) => t.name).sort()
// ⭐ 决策 119 新增 `memj_update`（改正文）⇒ 7 个变 8 个。
// ⭐⭐ 决策 162 新增 `memj_normalize_tags`（标签规范化）⇒ 8 个变 **9** 个。
// ⭐⭐⭐ 决策 177 新增 `memj_score_turn`（轮末知识评分）⇒ 9 个变 **10** 个。
// ⭐⭐⭐ 决策 205 新增 `memj_template`（交接文档模板管理）⇒ 10 个变 **11** 个。
const expected = ['memj_handoff', 'memj_info', 'memj_normalize_tags', 'memj_promote', 'memj_read', 'memj_rebuild', 'memj_score_turn', 'memj_search', 'memj_snapshots', 'memj_template', 'memj_update']
check('工具数量 = 11', registeredTools.length === 11, `实际 ${registeredTools.length}: ${names.join(', ')}`)
check('工具名齐全', JSON.stringify(names) === JSON.stringify(expected), names.join(', '))
check('每个工具都有 description', registeredTools.every((t) => t.description.length > 20))
check('每个工具都有 output.schema 与 render', registeredTools.every((t) => t.output?.schema && typeof t.output.render === 'function'))

const info = registeredTools.find((t) => t.name === 'memj_info')
check('memj_info 有 query/kind/withDesc',
  JSON.stringify(propsOf(info).sort()) === JSON.stringify(['kind', 'query', 'withDesc']),
  propsOf(info).join(','))

const read = registeredTools.find((t) => t.name === 'memj_read')
// ⭐⭐ 决策 112：`memj_read` 现在有**两个入口**（`id` 知识条目 / `project` 项目文档），
//    二选一 ⇒ **两者都不再单独必填**（必填会逼用户同时给两个）。
check('⭐⭐ memj_read 有 id 与 project 两个入口（决策 112）',
  propsOf(read).includes('id') && propsOf(read).includes('project'), propsOf(read).join(','))
check('  id 与 project **都不必填**（二选一）',
  !requiredOf(read).includes('id') && !requiredOf(read).includes('project'),
  JSON.stringify(requiredOf(read)))
check('  project 的 description 说明它是读项目文档',
  String(read.parameters?.properties?.project?.description ?? '').includes('项目文档'),
  String(read.parameters?.properties?.project?.description ?? '').slice(0, 100))

// ⭐⭐ 决策 112 修正：`render` 的 not-found 分支**必须带出 `notice`**。
//    🔴 为什么单列一条：原先写死"找不到该 id 的知识条目"，
//    于是读**项目文档**失败（项目不存在 / 两个入口都没给）时提示**文不对题**。
check('⭐⭐ memj_read 的 not-found 渲染带出 notice（不再写死"找不到该 id"）',
  (() => {
    const r = read.output?.render
    if (typeof r !== 'function') return false
    const out = r({ project: 'nope' }, {
      found: false, id: 'x', title: '', mode: 'not-found', content: '',
      availableSections: [], sectionRequested: '', sectionMatched: false,
      size: 0, notice: '没有项目 `nope`（不存在它的交接文档）。',
    })
    const text = Array.isArray(out) ? out.map((o) => o.text ?? '').join('') : ''
    return text.includes('没有项目')
  })(),
  '渲染没把 notice 带出来',
)

const handoff = registeredTools.find((t) => t.name === 'memj_handoff')
check('memj_handoff 的 project 必填', requiredOf(handoff).includes('project'), JSON.stringify(requiredOf(handoff)))

// ⭐⭐ 决策 111：`linkedSnapshots` 必须**真的出现在工具定义里**。
//    🔴 为什么单列一条断言：本项目有过一次真事故——`overwrite` 改了代码/schema/决策表，
//    **唯独漏了 description 原文**，而"那才是模型的输入" ⇒ 能力等于没实现。
//    这里同时断言 ① 参数存在 ② **不是必填**（省略 = 不挂，是合法输入）
//    ③ description 里**明写"省略 = 一条都不挂"**（否则模型会以为是"全挂"）。
check('⭐⭐ memj_handoff 有 linkedSnapshots 参数（决策 111）',
  propsOf(handoff).includes('linkedSnapshots'), propsOf(handoff).join(','))
check('  linkedSnapshots 不是必填（省略 = 不挂，合法）',
  !requiredOf(handoff).includes('linkedSnapshots'), JSON.stringify(requiredOf(handoff)))
check('  linkedSnapshots 的 description 明写 fail-closed 语义',
  String(handoff.parameters?.properties?.linkedSnapshots?.description ?? '').includes('省略 = 一条都不挂'),
  String(handoff.parameters?.properties?.linkedSnapshots?.description ?? '').slice(0, 120))
check('  linkedSnapshots 是 string 数组',
  handoff.parameters?.properties?.linkedSnapshots?.type === 'array',
  String(handoff.parameters?.properties?.linkedSnapshots?.type))

const snaps = registeredTools.find((t) => t.name === 'memj_snapshots')
check('memj_snapshots 有 project 与 scope',
  JSON.stringify(propsOf(snaps).sort()) === JSON.stringify(['project', 'scope']), propsOf(snaps).join(','))
check('⭐ memj_snapshots 的 project 必填（新时序）',
  requiredOf(snaps).includes('project'), JSON.stringify(requiredOf(snaps)))

const promote = registeredTools.find((t) => t.name === 'memj_promote')
check('memj_promote 已无 themeDesc（决策 80）',
  !propsOf(promote).includes('themeDesc'), propsOf(promote).join(','))

console.log('\n【C】命令注册（**四个**）')
// ⭐ 决策 110 加了两个「取交接」命令 ⇒ 从 2 个变 4 个。
check('命令数量 = 4', registeredCommands.length === 4, registeredCommands.map((c) => c.name).join(', '))
check('命令名正确',
  JSON.stringify(registeredCommands.map((c) => c.name).sort()) ===
    JSON.stringify([
      'memj-get-handoff-project',
      'memj-get-handoff-theme',
      'memj-handoff',
      'memj-review',
    ]),
  registeredCommands.map((c) => c.name).join(', '))
// ⭐⭐ 两个取交接命令**也必须声明 `input`**——这是"能补话（选档位）"的前提：
//    声明了才会落进输入框、跟着用户输入一起提交。
for (const name of ['memj-get-handoff-project', 'memj-get-handoff-theme']) {
  const c = registeredCommands.find((x) => x.name === name)
  check(`⭐ ${name} 声明了 input（⇒ 可补话）`, c?.input !== undefined && c.input.hint !== '',
    JSON.stringify(c?.input))
}

// ⭐ `memj-handoff` **必须声明 `input`**：声明后客户端才把它当 `leadingInput`
//    （参数声明）——从菜单选中时**不立即执行**，而是把 `/memj-handoff ` 落进输入框，
//    让用户接着补充、回车时整行提交。这与官方 `/goal` 是同一机制。
const handoffCmd = registeredCommands.find((c) => c.name === 'memj-handoff')
const reviewCmd = registeredCommands.find((c) => c.name === 'memj-review')
check('⭐ memj-handoff 声明了 input（⇒ leadingInput，不再一选就发）',
  handoffCmd?.input !== undefined, JSON.stringify(handoffCmd?.input))
check('  且 hint 非空（空 hint 会 throw）',
  typeof handoffCmd?.input?.hint === 'string' && handoffCmd.input.hint !== '',
  JSON.stringify(handoffCmd?.input?.hint))
check('memj-review 不声明 input（它是 popupSelect 装饰，保持原样）',
  reviewCmd?.input === undefined, JSON.stringify(reviewCmd?.input))

// ⭐⭐ 防回归：**证明 stub 的 hint 校验与真实实现同强度**。
//   真要防的是"hint 只含空白字符"——真实实现用 `.trim().length === 0` 判空，
//   而探针曾经只判 `=== ''` ⇒ 纯空格 hint 在探针里通过、在线上被拒，
//   命令**静默没注册**（本会话实测踩到）。这里把那批"空白字符"逐个试一遍，
//   只要有一个能通过 stub，就说明 stub 又变松了。
{
  const blanks = [
    ['空串', ''],
    ['单空格 U+0020', ' '],
    ['全角空格 U+3000', '\u3000'],
    ['不换行空格 U+00A0', '\u00A0'],
    ['制表符', '\t'],
    ['换行', '\n'],
  ]
  const accepted = []
  for (const [label, hint] of blanks) {
    try {
      scoped.commands.register({ name: 'probe-blank', description: 'x', input: { hint }, handler: () => ({ kind: 'success' }) })
      accepted.push(label)
    } catch {
      /* 预期：被拒 */
    }
  }
  check('⭐⭐ stub 会拒绝全部「空白 hint」（与真实实现的 trim 判据同强度）',
    accepted.length === 0, `竟然接受了：${accepted.join(', ')}`)

  // 对照：真实文字要能通过（证明上面的"全拒"不是因为 register 坏掉了）
  let textOk = false
  try {
    scoped.commands.register({ name: 'probe-text', description: 'x', input: { hint: '正常提示' }, handler: () => ({ kind: 'success' }) })
    textOk = true
  } catch { /* 不该发生 */ }
  check('  对照：非空 hint 能通过（上一条不是假阳性）', textOk)
}

// ⭐ 第 1 条：**不要把"判断项目"写成无条件查库**（用户 2026-09-19 要求）。
//    旧写法是"先调 memj_info 判断项目"⇒ 每次 handoff 都要白查一遍，
//    哪怕上一轮刚写过、项目 id 就在几分钟前的回执里。
//    判据：规范里必须同时说清「何时可跳过」与「何时才调」，并**点明看哪里**。
//
//    🔴 **决策 124 第 2 步**：这段完整判据**已搬到 `systemPrompt.context()`**
//    （设计文档 §5.2 块 B）——它**每轮可见**、且**改它不破缓存**。
//    ⇒ 断言相应改为在「**命令注入文本 + context()**」的**合并文本**里检查：
//      🔴 判据不变（"规范必须在模型可见处"），只是**可见处换了一条通道**。
//      ⚠️ 这**不是放宽**——若两处都没有，断言照样失败。
{
  const injected = []
  const fakeAgent = { followup: (msg) => injected.push(msg), inject: () => {} }
  handoffCmd.handler({ agent: fakeAgent, rawInput: '' })
  const cmdText = injected.map((m) => (m.content ?? []).map((b) => b.text ?? '').join('')).join('\n')
  // ⭐ context() 的文本（`isContext: true` 由 stub 标记）。
  const ctxText = registeredSections
    .filter((s) => s.isContext === true)
    .map((s) => (typeof s.text === 'function' ? s.text() : (s.text ?? '')))
    .join('\n')
  // 🔴 **合并文本** = 模型实际能看到的两条通道。
  const text = `${cmdText}\n${ctxText}`

  check('⭐ 规范允许「上文能确定时跳过 memj_info」',
    /跳过\s*`?memj_info`?/.test(text), text.slice(0, 400))
  check('⭐ 规范点明了「看哪里」——上一次的调用与回执',
    text.includes('上一次') && text.includes('memj_handoff') &&
      text.includes('调用') && text.includes('回执'))
  check('⭐ 规范点明了回执里含项目 id（已更新/已新建项目 X）',
    text.includes('已更新项目') && text.includes('已新建项目'))
  check('⭐ 规范列出「才调 memj_info」的情形（不是无条件查）',
    /只有(下列|这几种)情况才调/.test(text))
  check('  仍保留了"拿不准宁可新建"这条底线',
    text.includes('宁可新建'))
  check('  第一条的判据仍是语义（同一件事）',
    text.includes('同一件事'))
  // ⭐ 新增：确认这段判据**确实在 context() 里**（而不只是"某处有"）
  check('⭐ 上述判据确实落在 context()（决策 124 的新通道）',
    ctxText.includes('落到哪个项目') && ctxText.includes('已更新项目'))
}

// ⭐⭐ 防回归（本会话实测踩到，且是本命令的**核心**）：
//    `agent.inject()` **不唤醒**驱动器——空闲时它会一直挂着，界面停在
//    「上下文注入 / 待注入」，**模型根本不动**（用户看到的是"打了命令没反应"）。
//    必须用 `agent.followup()`：文档原文 "Queue an ordinary follow-up turn
//    **and wake the driver**"。
//    🔴 这条断言的价值：`inject` 与 `followup` **都能把文本送进上下文**，
//    所以只断言"文本进去了"是**抓不到**这个 bug 的——必须断言**用了哪个方法**。
{
  const calls = []
  const fakeAgent = {
    inject: (m) => calls.push({ method: 'inject', m }),
    followup: (m) => calls.push({ method: 'followup', m }),
  }
  handoffCmd.handler({ agent: fakeAgent, rawInput: '整理一下' })
  check('⭐⭐ 用的是 followup（会唤醒驱动器），不是 inject（不唤醒、会停在待注入）',
    calls.length === 1 && calls[0].method === 'followup',
    `实际调用了：${calls.map((c) => c.method).join(', ') || '(什么都没调)'}`)
}

// ⭐ 补充的话要作为「额外交代」进入文本，且**不替代**原规范、措辞保持中性。
{
  const injected = []
  const fakeAgent = { followup: (msg) => injected.push(msg), inject: () => {} }
  handoffCmd.handler({ agent: fakeAgent, rawInput: '整理一下' })
  const text = injected.map((m) => (m.content ?? []).map((b) => b.text ?? '').join('')).join('\n')
  check('⭐ 补充的话进入注入文本', text.includes('用户随命令补充的话') && text.includes('整理一下'),
    text.slice(-300))
  check('  且原规范仍在（补充的话不是替代）',
    // ⚠️ 锚点用**语义稳定的词**，不用会被文案调整带走的字面：
    //    决策 112 把第 2 条从"写六节叙事"改成"先读再写六节"，字面变了但规范仍在。
    text.includes('memj_handoff') && text.includes('六节') && text.includes('归属'))
  check('  措辞中性（不预设它是"重点"——用户可能写的是做法/程度）',
    !text.includes('本次重点'), text.slice(-200))
  check('  没有数错条数（上面实际列了 4 条，不该说"三步"）',
    !text.includes('三步'), text.slice(-200))
}
{
  const injected = []
  const fakeAgent = { followup: (msg) => injected.push(msg), inject: () => {} }
  handoffCmd.handler({ agent: fakeAgent, rawInput: '   ' })
  const text = injected.map((m) => (m.content ?? []).map((b) => b.text ?? '').join('')).join('\n')
  check('未补充时：不出现空的「用户补充」段', !text.includes('用户随命令补充的话'), text.slice(-160))
  check('  未补充时原规范照常注入', text.includes('memj_handoff') && text.includes('六节'))
}

console.log('\n【D】路由注册（exact + 前缀冲突规避）')
check('注册了至少 8 条 exact', registeredRoutes.filter((r) => r.kind === 'exact').length >= 8,
  String(registeredRoutes.filter((r) => r.kind === 'exact').length))
check('全部路径都带包名前缀',
  registeredRoutes.every((r) => r.path.startsWith('/plugins/dsh-memj')))
check('无重复 (kind,path)',
  new Set(registeredRoutes.map((r) => `${r.kind}:${r.path}`)).size === registeredRoutes.length)
check('无尾斜杠', registeredRoutes.every((r) => !r.path.endsWith('/')))

console.log('\n【E】启动诊断文件（排查"静默不注册"的依据）')
// ⚠️ 诊断是**异步追加写**（不阻塞 apply），所以要给它一点时间落盘。
const diag = join(lib, '.startup-diag.txt')
for (let i = 0; i < 50 && !existsSync(diag); i += 1) {
  await new Promise((r) => setTimeout(r, 20))
}
check('诊断文件已写出', existsSync(diag))
if (existsSync(diag)) {
  const text = readFileSync(diag, 'utf8')
  check('记录了 apply-start', text.includes('apply-start'))
  check('记录了 inject-callback-ran', text.includes('inject-callback-ran'))
  check('记录了 tools-registered', text.includes('tools-registered'))
  check('没有 THREW', !text.includes('THREW'), text.split('\n').filter((l) => l.includes('THREW')).join('|'))
}

console.log('\n【F】工具真的能跑（端到端调 execute）')
const infoTool = registeredTools.find((t) => t.name === 'memj_info')
const r1 = await infoTool.execute({ kind: 'project' }, { agent: undefined })
check('memj_info 空库返回空项目', Array.isArray(r1.projects) && r1.projects.length === 0)

const snapsTool = registeredTools.find((t) => t.name === 'memj_snapshots')
const r2 = await snapsTool.execute({ project: 'probe-proj' }, { agent: { session: { id: 'probe-sess' } } })
check('memj_snapshots 空快照返回 total=0', r2.total === 0, JSON.stringify(r2))
check('memj_snapshots 的 hint 提到目标项目', typeof r2.hint === 'string' && r2.hint.includes('probe-proj'))
check('memj_snapshots 的 hint 说明工具已代做比较', r2.hint.includes('工具已替你完成'))

const promoteTool = registeredTools.find((t) => t.name === 'memj_promote')
const r3 = await promoteTool.execute({ refs: ['x'], addThemes: ['nope'] }, { agent: undefined })
check('promote 对不存在主题报错（决策 80）', r3.ok === false && r3.message.includes('不新建主题'))
// ⭐ 理由必须是**结构性的**（与模式无关）——早先绑在"需要跨项目快照作证据"上，
//    宽松模式下那句话会自相矛盾。
check('  ⭐ 理由与模式无关（结构性），不绑在证据上',
  r3.message.includes('聚合判断') || r3.message.includes('只有写项目文档'),
  r3.message.slice(0, 200))
check('  ⭐ 不再说"需要跨项目快照作证据"（那会与宽松模式矛盾）',
  !r3.message.includes('跨项目快照'), r3.message.slice(0, 240))

const rebuildTool = registeredTools.find((t) => t.name === 'memj_rebuild')
const r4 = await rebuildTool.execute({}, { agent: undefined })
check('memj_rebuild 可跑通', r4.ok === true, r4.message)

console.log(`\n【G】⭐ 每个工具的返回值都符合自己的 output.schema`)
// 🔴 **为什么必须测这一条**：`defineTool` 的 `output.schema` 是
//    `additionalProperties: false`，运行时**多带一个字段就会被整次拒收**
//    （报 "value.X is not a declared property"）。我们正是被这个坑到过：
//    `memj_handoff` 返回了 schema 里没声明的 issues/similarProjects，
//    导致真实调用**整次失败**。
//
// 这里用最小自研校验器（只覆盖本插件用到的 JSON Schema 子集：
// type / properties / required / additionalProperties / items / enum），
// 逐个调用工具并用它自己的 schema 校验，把"声明的返回"与"实际返回"对齐。
function validate(value, schema, path = 'value') {
  const errs = []
  const t = schema.type
  if (t === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return [`${path} 应为 object`]
    }
    for (const key of schema.required ?? []) {
      if (!(key in value)) errs.push(`${path}.${key} 是必填但缺失`)
    }
    const props = schema.properties ?? {}
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) errs.push(`${path}.${key} 未声明（会被运行时拒收）`)
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) errs.push(...validate(value[key], sub, `${path}.${key}`))
    }
    return errs
  }
  if (t === 'array') {
    if (!Array.isArray(value)) return [`${path} 应为 array`]
    value.forEach((v, i) => errs.push(...validate(v, schema.items ?? {}, `${path}[${i}]`)))
    return errs
  }
  if (t === 'string') {
    if (typeof value !== 'string') errs.push(`${path} 应为 string`)
    else if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      errs.push(`${path} 不在 enum 内`)
    }
    return errs
  }
  if (t === 'integer' && !Number.isInteger(value)) errs.push(`${path} 应为 integer`)
  if (t === 'number' && typeof value !== 'number') errs.push(`${path} 应为 number`)
  if (t === 'boolean' && typeof value !== 'boolean') errs.push(`${path} 应为 boolean`)
  return errs
}

/** 每个工具用一组**能成功走通**的参数调用（覆盖成功路径，否则测不到返回体）。 */
const execAgent = { session: { id: 'probe-schema' } }
// ⭐ 决策 119：`memj_update` 需要一个**真实存在的条目**才走得到成功路径
//    ——先用 handoff 造一条（探针的库是隔离的，本来没有数据）。
const seedTool = registeredTools.find((t) => t.name === 'memj_handoff')
await seedTool.execute({
  project: 'update-probe',
  projectDesc: '供 memj_update 探针用的项目；当测试 tool schema 时读它。',
  doc: '## 目标\n\nx',
  entries: [{
    slug: 'upd-probe', title: '探针条目', tags: ['t'],
    desc: '探针条目；当测试 memj_update 的 schema 时读它。', body: '### P\n正文。',
  }],
}, { agent: { session: { id: 'probe-update-seed' } } })
const seededCover = (await mod.scanLibrary()).covers.find((c) => c.cover.project === 'update-probe')

const callPlan = {
  memj_info: { withDesc: true },
  memj_search: { query: ['x'] },
  memj_read: { id: '00000000-0000-0000-0000-000000000000' },
  memj_snapshots: { project: 'p' },
  // ⭐ 重点：handoff 的**成功路径**（此前正是它多返回了字段）。
  memj_handoff: {
    project: 'schema-probe-proj',
    projectDesc: '探针项目；当测试 tool schema 时读它。',
    doc: '## 目标\n\nx',
  },
  memj_promote: { refs: [], setGlobal: true },
  // ⭐ 决策 119 新增：`memj_update`（改正文）——用**刚造的那条**走成功路径。
  memj_update: { id: seededCover?.cover.id ?? '', body: '### P2\n更新后的正文。' },
  memj_rebuild: {},
  // ⭐ 决策 162 新增：`memj_normalize_tags` —— 走 **preview 路径**
  //    🔴 探针**绝不能真写库**（那是生产/隔离库，不是这个探针该动的东西）；
  //    `preview: true` 保证只看不改（它内部压根不落盘）。
  memj_normalize_tags: { preview: true, includeBody: 'none' },
  // ⭐⭐⭐ 决策 177 新增：`memj_score_turn` —— **走"判不出内容"的短路路径**。
  //    🔴 探针**绝不能真评一次分**（那会起子代理、调模型、写 `scores.json`）；
  //    ⚠️ 这里给一个**不存在的 session** ⇒ 它读不到该轮内容 ⇒
  //       走 `readTurnContent` 返回空串那条早退 ⇒ **只返回一个 `ok:false` 的结果**，
  //       不碰网络、不落盘。⭐ 目的只是验 `output.schema`（两个必填字段都在）。
  //    ⚠️ `turn: 0` 是合法整数（schema 要求 `type: 'integer'`）。
  memj_score_turn: { session: 'session-does-not-exist-probe', turn: 0 },
  // ⭐⭐⭐ 决策 205 新增：`memj_template` —— **走 `list` 这条只读路径**。
  //    🔴 探针**绝不能真建/真删模板**（会写库根的 `templates/`）；
  //    `list` 零副作用、且不需要用户确认（两段式确认只针对 create/delete）。
  //    ⭐ 顺带验证了"list 不需要 confirm"这条设计。
  memj_template: { action: 'list' },
}

for (const tool of registeredTools) {
  const plan = callPlan[tool.name]
  if (plan === undefined) { check(`${tool.name} 有校验计划`, false, '缺 callPlan'); continue }
  let value
  try {
    value = await tool.execute(plan, { agent: execAgent })
  } catch (err) {
    check(`${tool.name} execute 不抛`, false, err.message)
    continue
  }
  const errs = validate(value, tool.output.schema, tool.name)
  check(`${tool.name} 返回值符合 output.schema`, errs.length === 0, errs.join(' | '))
  try {
    const blocks = tool.output.render(plan, value)
    check(`${tool.name} render 返回非空内容块`, Array.isArray(blocks) && blocks.length > 0)
  } catch (err) {
    check(`${tool.name} render 不抛`, false, err.message)
  }
}

// ══════════════════════════════════════════════════════════════════════
// ⭐⭐ 【H】双模式（决策 95/96）：**协议不分叉、模式走返回值**
//
// 🔴 这一节要证明的是**架构性质**，不是行为：
//    ① 两种模式下 `section()` 的**文本完全相同**（⇒ 模式不写进系统提示
//       ⇒ 改模式**不会**重写 node 0、不会废掉前缀缓存）；
//    ② 同一模式下**连调两次相同**（`section()` 下游按字符串比较收口）；
//    ③ `memj_snapshots` 的**返回值**随模式变（模式信息走动态通道）；
//    ④ 工具的 description **不随模式变**（否则又变成文本分叉了）。
// ══════════════════════════════════════════════════════════════════════
console.log('\n【H】⭐⭐ 双模式：协议不分叉、模式走返回值（决策 95/96）')
{
  /** 用给定配置跑一次 apply，收集 section 文本与工具表。 */
  async function applyWith(config) {
    const sections = []
    const tools = []
    const cmds = []
    const routes = []
    const ctx2 = {
      logger: { error() {}, warn() {}, info() {} },
      get: () => undefined,
      provide() {},
      effect: (fn) => { try { fn() } catch { /* ignore */ } },
      inject: (_deps, cb) => {
        cb({
          systemPrompt: { section: (s) => sections.push(s) },
          tools: { register: (t) => tools.push(t) },
          commands: { register: (c) => cmds.push(c) },
        })
      },
    }
    mod.apply(ctx2, config)
    return { sections, tools, cmds, routes }
  }

  const strictRun = await applyWith({ ...mod.DEFAULT_CONFIG, themeCreation: 'strict' })
  const looseRun = await applyWith({ ...mod.DEFAULT_CONFIG, themeCreation: 'loose' })

  const strictText = strictRun.sections[0]?.text?.() ?? ''
  const looseText = looseRun.sections[0]?.text?.() ?? ''

  check('两模式都注册了协议', strictText.length > 0 && looseText.length > 0)
  check('⭐ 同一模式连调两次 ⇒ 文本恒定（不触发 node 0 重写）',
    strictRun.sections[0].text() === strictRun.sections[0].text())

  // 🔴 核心断言：模式**不进**系统提示。
  check('⭐⭐ 严格与宽松的协议文本**完全相同**（模式不写进 section ⇒ 不废缓存）',
    strictText === looseText,
    `strict ${strictText.length} 字符 vs loose ${looseText.length} 字符`)
  // ⭐ 中性写法的**正确形态**：协议里**同时**讲清两种模式各自是什么
  //    （用户要的"如果配置为严格……如果配置为宽松……"），
  //    但**不自己断言当前是哪种**——当前模式由 `memj_snapshots` 的返回值告知。
  //    🔴 上面"两模式文本完全相同"那条才是"没分叉"的真正证明：
  //       若协议按模式分叉，两段文本就会不同。
  check('  ⭐ 协议**同时**讲了两种模式各自是什么（用户要的中性写法）',
    strictText.includes('严格') && strictText.includes('宽松'))
  check('  且明说"哪一种"要去看 memj_snapshots 的返回值（不自作断言）',
    strictText.includes('memj_snapshots') && strictText.includes('返回值会明说'))

  // 工具 description 同样不分叉。
  const strictHandoff = strictRun.tools.find((t) => t.name === 'memj_handoff')
  const looseHandoff = looseRun.tools.find((t) => t.name === 'memj_handoff')
  check('⭐⭐ memj_handoff 的 description 两模式相同（描述也不分叉）',
    strictHandoff.description === looseHandoff.description)

  // ⭐ 模式信息在**返回值**里。
  const sStrict = strictRun.tools.find((t) => t.name === 'memj_snapshots')
  const sLoose = looseRun.tools.find((t) => t.name === 'memj_snapshots')
  const renderOf = (tool, value) => tool.output.render({}, value).map((b) => b.text).join('\n')
  const emptyVal = { entries: [], total: 0, hint: 'hint' }

  const strictOut = renderOf(sStrict, emptyVal)
  const looseOut = renderOf(sLoose, emptyVal)
  check('⭐ 严格模式返回值里明说"严格"', strictOut.includes('严格'), strictOut.slice(0, 120))
  check('⭐ 宽松模式返回值里明说"宽松"', looseOut.includes('宽松'), looseOut.slice(0, 120))
  check('⭐ 两者返回值**不同**（模式确实走了动态通道）', strictOut !== looseOut)
  check('  严格：说明"不能新建主题"', strictOut.includes('不能新建主题'))
  check('  宽松：说明"不妨碍你新建主题"', looseOut.includes('不妨碍你新建主题'))

  // 空清单的判定依据是 `entries.length`（不是 total），两种模式都要正确分流。
  check('  严格与宽松在空清单分支上都走了空分支',
    strictOut.includes('没有读过别的项目') && looseOut.includes('没有读过别的项目'))
}

console.log(`\n═══ 探针结果：通过 ${pass} / 失败 ${fail} ═══`)
rmSync(lib, { recursive: true, force: true })
process.exit(fail === 0 ? 0 : 1)