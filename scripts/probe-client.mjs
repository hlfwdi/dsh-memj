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
    // 极简 React stub：只需要 createElement 能记录调用。
    return {
      createElement: (type, props, ...kids) => ({ type, props, kids }),
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

console.log(`\n═══ client 探针：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
