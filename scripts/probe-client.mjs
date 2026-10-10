/**
 * client 半边契约探针：用 stub `window.__ModuleLoader__` 跑 `lib/client.js` 的 apply()。
 *
 * 验证：
 *  - 入口能加载（banner 的 `id` 必须是包名，否则真实环境会 throw）；
 *  - `apply()` 注册了侧边栏入口；
 *  - `/memj-review` 的 `commandUi.decorate` 被调用，且 ui.kind = 'popupSelect'；
 *  - 运行时只 require 了 seed 表内的模块。
 *
 * 用法：node scripts/probe-client.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

let pass = 0, fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

// ── 1. 读 bundle，做静态契约校验 ──
const code = readFileSync('lib/client.js', 'utf8')
console.log('【1】bundle 静态契约')
check('用 __ModuleLoader__.load 注册', code.includes('__ModuleLoader__.load'))
check('id 恰为包名 "dsh-memj"', /id:\s*"dsh-memj"/.test(code))
const requires = [...code.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1])
const SEED = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])
const outside = [...new Set(requires)].filter((r) => !SEED.has(r))
check('运行时 require 全部在 seed 表内', outside.length === 0, `越界: ${outside.join(', ')}`)
console.log(`   require 到的模块: ${[...new Set(requires)].join(', ') || '(无)'}`)

// ── 2. 在 stub 环境里真的跑一遍 factory ──
console.log('\n【2】在 stub ModuleLoader 里执行 factory')
const registered = []
let capturedFactory
const fakeRequire = (id) => {
  if (id === 'react') {
    // 极简 React stub：createElement 记录调用；两个 hook 只要能跑通就行
    // （`useState` 直接回初值 ⇒ 组件函数可被当普通函数调用一次来读它产出的元素）。
    return {
      createElement: (type, props, ...kids) => ({ type, props, kids }),
      useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
      useEffect: () => {},
    }
  }
  throw new Error(`未供给的模块: ${id}`)
}

globalThis.window = {
  __ModuleLoader__: {
    load({ id, factory }) {
      registered.push(id)
      // 真实 loader 会调用 factory(require) 并取回 exports。
      capturedFactory = factory
    },
  },
}

// 执行 bundle（它会调用 load，从而拿到 factory）。
// eslint-disable-next-line no-new-func
new Function('require', 'module', 'exports', code)(fakeRequire, { exports: {} }, {})

check('load 被调用一次', registered.length === 1, String(registered.length))
check('注册 id 正确', registered[0] === 'dsh-memj', registered[0])
check('拿到了 factory', typeof capturedFactory === 'function')

const clientMod = capturedFactory(fakeRequire)
check('模块导出了 name', clientMod.name === 'dsh-memj', clientMod.name)
check('导出了 inject 数组', Array.isArray(clientMod.inject) || ArrayBuffer.isView(clientMod.inject),
  JSON.stringify(clientMod.inject))
check('导出了 apply', typeof clientMod.apply === 'function')

console.log('\n【3】apply() 注册行为')
const slotRegistrations = []
const decorations = []
const injectedSlots = []
/** 被探测过依赖的 `ctx.inject(deps, …)` 调用（本桩按"服务不存在"模拟 ⇒ 回调不跑）。 */
const injectedDeps = []

const ctx = {
  logger: { info() {}, warn() {}, error(...a) { console.log('   [error]', ...a) } },
  get(name) {
    if (name === 'commandUi') {
      return { decorate: (d) => { decorations.push(d); return () => {} } }
    }
    if (name === 'sessions') {
      return { binding: () => ({ session: { command: async () => {} } }) }
    }
    return undefined
  },
  effect(fn, name) { try { return fn() } catch (e) { console.log('   effect 抛错:', e.message) } },
  // ⭐ 复刻 cordis 的 `ctx.inject(deps, callback)`：**依赖服务不到 ⇒ 回调不执行，也不抛**
  //    （真实实现是"等声明/等服务"）。本桩按**老 DSH（没有右侧栏服务）**模拟。
  inject(deps) { injectedDeps.push(...deps) },
  slots: {
    inject(name, cb) {
      injectedSlots.push(name)
      // 复刻真实语义：注入回调是个 generator，yield 出注册结果。
      const it = cb()
      let r = it.next()
      while (!r.done) {
        slotRegistrations.push(r.value)
        r = it.next()
      }
    },
    register(def, comp) { slotRegistrations.push({ def, comp }); return () => {} },
  },
}

clientMod.apply(ctx)

check('用 slots.inject 注入 sidebar.footer.action',
  injectedSlots.includes('sidebar.footer.action'), JSON.stringify(injectedSlots))
check('探测了右侧栏服务（老 DSH 下回调不跑 ⇒ 零影响）',
  injectedDeps.includes('sidebarRight') && injectedDeps.includes('sidebarRightTabs'),
  JSON.stringify(injectedDeps))
check('注册了 1 个侧边栏入口', slotRegistrations.length >= 1, String(slotRegistrations.length))
// ⭐ 决策 110 之后共有 **3 个**装饰：`memj-review` + 两个「取交接」命令。
check('⭐ 注册了 3 个 commandUi.decorate', decorations.length === 3, String(decorations.length))
{
  const d = decorations[0]
  check('decorate[0] 的名字是 host 命令名 memj-review', d.name === 'memj-review', d.name)
  check("ui.kind = 'popupSelect'", d.ui?.kind === 'popupSelect', d.ui?.kind)
  check('options 是函数', typeof d.ui?.options === 'function')
  check('onSelect 是函数', typeof d.ui?.onSelect === 'function')
  check('有 available', typeof d.available === 'function')
}
// ⭐⭐ 两个取交接命令**也挂 popupSelect**，但语义与 memj-review **不同**：
//    它们**不在 onSelect 里执行命令**，而是把命令行**写回输入框**（决策 110）。
//    ⇒ 这里只验"它们注册了、且用的是同一种 UI 形态"；写回行为由真实浏览器验收。
{
  const names = decorations.map((x) => x.name)
  check('⭐ 含 memj-get-handoff-project', names.includes('memj-get-handoff-project'), JSON.stringify(names))
  check('⭐ 含 memj-get-handoff-theme', names.includes('memj-get-handoff-theme'), JSON.stringify(names))
  const gp = decorations.find((x) => x.name === 'memj-get-handoff-project')
  check('  取交接命令也复用 popupSelect（列表/搜索白送）', gp?.ui?.kind === 'popupSelect', gp?.ui?.kind)
  check('  取交接命令有 available', typeof gp?.available === 'function')
}

console.log('\n【4】options() 能取到数据（HTTP stub）')
if (decorations.length > 0) {
  // stub fetch 返回 health 形状。
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ projects: 3, themes: 2, covers: 10, nominations: 1, invalidCovers: 0 }),
  })
  const opts = await decorations[0].ui.options()
  check('返回 4 个选项', opts.length === 4, String(opts.length))
  check('选项 id 正确',
    JSON.stringify(opts.map((o) => o.id)) === JSON.stringify(['pending', 'broken', 'invalid', 'rebuild']),
    JSON.stringify(opts.map((o) => o.id)))
  check('待批提名选项带计数', opts[0].label.includes('1'), opts[0].label)
  check('有提名时标记 active', opts[0].active === true)

  // fetch 失败时返回空数组（弹窗显示 empty 态），不抛。
  globalThis.fetch = async () => { throw new Error('网络断开') }
  const opts2 = await decorations[0].ui.options()
  check('fetch 失败 ⇒ 返回空数组不抛', Array.isArray(opts2) && opts2.length === 0)
}

// ══════════════════════════════════════════════════════════════════════════
// 【5】右侧栏页类型（桌面版唯一的出路）—— 三态
//
// 🔴 为什么非测不可：这一段是**能力探测 + 两阶段注册**，它的失败模式**全是静默的**
//    （服务没 provide ⇒ 回调不跑；kind 没注册 ⇒ `openTab` 才抛）。
//    ⚠️ 顺序有讲究：模块级的"能不能应用内打开"是**一次性发布**的，
//       所以必须**先跑两个否证（老 DSH / 浏览器版）、最后跑桌面版**。
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【5】右侧栏页类型（桌面版入口）')

/**
 * 造一个客户端 ctx 桩。
 * @param withPanel - true：`ctx.inject(['sidebarRight',…])` 会执行回调、`scope.get` 回假服务（= 新 DSH）；
 *                     false：回调永不执行（= 老 DSH，服务根本没 provide）。
 * @returns 桩 ctx 与各处捕获。
 */
function makePanelCtx(withPanel) {
  const registered = []
  const injected = []
  const typeDefs = []
  const openedTabs = []
  /** 复刻真实语义：注入回调可能是 generator（footer action 那条就是）。 */
  const runCallback = (cb) => {
    const out = cb()
    if (out !== null && typeof out === 'object' && typeof out.next === 'function') {
      let r = out.next()
      while (!r.done) r = out.next()
      return undefined
    }
    return out
  }
  const slots = {
    inject(name, cb) { injected.push(name); runCallback(cb) },
    register(def, comp) { registered.push({ def, comp }); return () => {} },
  }
  const scope = {
    get: (n) =>
      n === 'sidebarRightTabs'
        ? { register: (def) => { typeDefs.push(def); return () => {} } }
        : n === 'sidebarRight'
          ? { openTab: (kind) => { openedTabs.push(kind) } }
          : undefined,
    effect: (fn) => fn(),
    slots,
  }
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    // commandUi / sessions 都不给 ⇒ apply() 早早返回，不掺进本节的断言。
    get: () => undefined,
    inject: (deps, cb) => { if (withPanel) cb(scope) },
    effect: (fn) => fn(),
    slots,
  }
  return { ctx, registered, injected, typeDefs, openedTabs }
}

/** 找到 footer 入口组件。 */
const entryCompOf = (r) => r.registered.find((x) => x?.def?.name === 'sidebar.footer.action')?.comp
/** 找到页类型正文组件（keyed seat 的 key 必须是页类型定义的 id）。 */
const bodyCompOf = (r) => r.registered.find((x) => x?.def?.key === 'dsh-memj/panel')?.comp
/** 把入口组件当普通函数调一次，读它产出的元素（hook 桩直接回初值）。 */
const renderEntry = (comp) => comp({ wide: true, useSessions: (sel) => sel({ current: 'session-1' }) })

// ── (a) 否证一：老 DSH（服务不存在）⇒ 与从前一字不差 ──
{
  const r = makePanelCtx(false)
  clientMod.apply(r.ctx)
  check('老 DSH：没注册任何页类型', r.typeDefs.length === 0, String(r.typeDefs.length))
  const entry = entryCompOf(r)
  check('老 DSH：入口仍注册', entry !== undefined)
  check('老 DSH：入口**没有** onClick（行为与从前一致）',
    typeof renderEntry(entry).props.onClick !== 'function')
}

// ── (b) 否证二：新 DSH + **浏览器**（没有 dshDesktop）⇒ 页类型照旧注册，但入口不改 ──
{
  delete globalThis.dshDesktop
  const r = makePanelCtx(true)
  clientMod.apply(r.ctx)
  check('浏览器版：页类型照常注册（与桌面无关）',
    r.typeDefs.length === 1 && r.typeDefs[0].id === 'dsh-memj/panel', JSON.stringify(r.typeDefs.map((d) => d.id)))
  check('浏览器版：入口仍**不接管点击**（继续开新标签）',
    typeof renderEntry(entryCompOf(r)).props.onClick !== 'function')
  check('浏览器版：一次都没调 openTab', r.openedTabs.length === 0, JSON.stringify(r.openedTabs))
}

// ── (c) 正例：新 DSH + 桌面壳 ⇒ 注册页类型 + 点击走右侧栏 ──
{
  globalThis.dshDesktop = { protocolVersion: 1 }
  const r = makePanelCtx(true)
  clientMod.apply(r.ctx)

  const def = r.typeDefs[0]
  check('桌面版：注册了 1 个页类型', r.typeDefs.length === 1, String(r.typeDefs.length))
  check('  kind = dshMemj', def?.kind === 'dshMemj', def?.kind)
  check('  priority = extension', def?.priority === 'extension', def?.priority)
  check('  keepMounted（否则每次展开都回到首页）', def?.keepMounted === true, String(def?.keepMounted))
  check('  title() = memj 记忆库', def?.title?.() === 'memj 记忆库', def?.title?.())
  check('  有 1 个引导页入口（提高可发现性）',
    Array.isArray(def?.guide) && def.guide.length === 1 && def.guide[0].id === 'panel' && def.guide[0].order === 40)
  check('正文注册进了 keyed seat sidebar.right.pane.tab', r.injected.includes('sidebar.right.pane.tab'),
    JSON.stringify(r.injected))
  check('  且 key = 页类型定义的 id（不是 kind）', r.registered.some((x) => x?.def?.key === 'dsh-memj/panel'))

  const body = bodyCompOf(r)
  const bodyEl = body({ sessionId: 'session-9' })
  check('正文是 iframe', bodyEl?.type === 'iframe', String(bodyEl?.type))
  check('  src 指向现有页面并带当前会话',
    bodyEl?.props?.src === '/plugins/dsh-memj/?session=session-9', String(bodyEl?.props?.src))

  const entryEl = renderEntry(entryCompOf(r))
  check('桌面版：入口接管点击', typeof entryEl.props.onClick === 'function')
  {
    let prevented = false
    entryEl.props.onClick({
      metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
      preventDefault() { prevented = true },
    })
    check('  点击调 openTab("dshMemj")', JSON.stringify(r.openedTabs) === '["dshMemj"]', JSON.stringify(r.openedTabs))
    check('  且阻止了默认跳转', prevented)
  }
  {
    const before = r.openedTabs.length
    entryEl.props.onClick({
      metaKey: false, ctrlKey: true, shiftKey: false, altKey: false,
      preventDefault() { throw new Error('带修饰键不该 preventDefault') },
    })
    check('  带 Ctrl 点击**不接管**（留给浏览器）', r.openedTabs.length === before)
  }
}

console.log(`\n═══ client 探针：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
