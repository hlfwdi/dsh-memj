/**
 * ⭐⭐⭐ **看模型实际收到的那段文本**（决策 221）——真注册工具 + 真调 `execute()`。
 *
 * 🔴 **为什么不能只看"代码里写了"**：本项目铁律 —— 判据要落在
 *    **真正发给模型的文本**上（已记过"算出的量 ≠ 发出的量"这类坑）。
 *    ⇒ 用一个**复刻了真实校验的假 ctx** 装配插件（照 `probe-host.mjs` 的既有范式），
 *      真调 `memj_read.execute()`，再按 `output.render()` 的口径拼出模型看到的字符串。
 *
 * 用法：node scripts/show-section-specs-delivery.mjs [库根] [项目id]
 *   ⭐ 默认库根按**本仓库位置**派生（`<仓根>/../verify/memj-spec220-lib`）——**不写死部署路径**。
 */
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const libRoot = process.argv[2] ??
  join(HERE, '..', '..', 'verify', 'memj-spec220-lib')
const PID = process.argv[3] ?? 'dsh-power-control'
process.env['MEMJ_DATA_DIR'] = libRoot
console.log(`[库根] ${libRoot}`)

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)

// ── 假 ctx：照 `probe-host.mjs` 的范式（`inject` 要手动回放）──
const tools = new Map()
const registeredSections = []
const injectedCallbacks = []
const base = {
  logger: { info() {}, warn() {}, error() {} },
  // ⚠️ `webServer` 要在**两处**都给：`apply` 一开始的 `ctx.get('webServer')`
  //    与 `inject` 回放后的 scoped ctx 都会取它（我第一版只给了 scoped ⇒ 崩在
  //    `Cannot read properties of undefined (reading 'register')`）。
  get(name) {
    if (name === 'webServer') return { register: () => () => {} }
    return undefined
  },
  effect(fn) { const d = fn(); return () => d?.() },
  inject(deps, cb) { injectedCallbacks.push({ deps, cb }) },
  on() { return () => {} },
}
const scoped = {
  logger: base.logger,
  systemPrompt: {
    section(def) { registeredSections.push(def); return () => {} },
    context(def) { registeredSections.push({ ...def, isContext: true }); return () => {} },
  },
  tools: {
    register(def) {
      if (typeof def.name !== 'string' || def.name === '') throw new Error('tool name required')
      if (typeof def.description !== 'string' || def.description === '') throw new Error('tool description required')
      if (typeof def.execute !== 'function') throw new Error('tool execute required')
      if (def.output === undefined || def.output.schema === undefined || typeof def.output.render !== 'function') {
        throw new Error(`tool ${def.name} output required`)
      }
      tools.set(def.name, def)
      return () => tools.delete(def.name)
    },
  },
  commands: { register: () => () => {} },
  webServer: { register: () => () => {} },
  get(name) {
    if (name === 'webServer') return { register: () => () => {} }
    return undefined
  },
}
mod.apply(base, { ...mod.DEFAULT_CONFIG, backupGit: false })
for (const { cb } of injectedCallbacks) cb(scoped)

const read = tools.get('memj_read')
if (read === undefined) {
  console.error(`没有注册 memj_read。已注册：${[...tools.keys()].join(', ')}`)
  process.exit(1)
}

const res = await read.execute({ project: PID, section: '目标' }, {
  agent: { id: 'session-show-221' },
})
const out = read.output.render({ project: PID, section: '目标' }, res)
const text = out.map((b) => b.text ?? '').join('\n')

console.log('════════ 模型实际收到的文本（前 2200 字符）════════')
console.log(text.slice(0, 2200))
console.log('\n════════ 判据 ════════')
const iSpec = text.indexOf('本文档各节的写作规范')
const iBody = text.indexOf('## 目标')
console.log(`总长度            : ${text.length} 字符`)
console.log(`规范清单在正文之前: ${iSpec >= 0 && iSpec < iBody ? '✅ 是' : `🔴 否（spec@${iSpec} body@${iBody}）`}`)
console.log(`列出的规范条数    : ${(text.match(/^· \*\*/gm) ?? []).length}`)
console.log(`含"可自动截断"标注: ${text.includes('可自动截断归档') ? '✅' : '—（本项目该节没有 truncate 标记）'}`)
