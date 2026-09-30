// 导出插件注册的全部「写给模型的文本」：工具描述 / 参数 schema / 协议 section / context() / 命令描述。
// ⚠️ 用**与线上同一条注册路径**（mod.apply + inject 回调），导出的是运行时真实文本，不是源码转述。
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const built = join(here, '..', 'lib', 'index.js')

// 🔴🔴 **前置自检：产物在不在**（这一步防的是一次真实踩过的坑）。
//    host 条目的 tsdown 配了 `clean: true` ⇒ **每次构建先清空 `lib/`**。
//    所以在"构建 → copy-web → 再构建"这种顺序下，最后一次构建会把 `lib/` 清成
//    只剩网页资源，`index.js` 消失——而 `import` 失败的信息很长，容易被误读成
//    "脚本坏了"。此处直接给出**正确顺序**，不让下一个人重踩。
if (!existsSync(built)) {
  console.error(
    `❌ 找不到构建产物：${built}\n` +
      '   请先构建（注意顺序：**先 tsdown，再 copy-web**）：\n' +
      '     node node_modules/tsdown/dist/run.mjs && node scripts/copy-web.mjs\n' +
      '   ⚠️ 若在拷贝网页资源后又跑了一次构建，`lib/` 会被 `clean: true` 清空、网页资源也没了。\n',
  )
  process.exit(1)
}

const lib = mkdtempSync(join(tmpdir(), 'memj-dump-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')

const registeredTools = []
const registeredCommands = []
const registeredSections = []
const registeredRoutes = []

const logger = { info() {}, warn() {}, error() {} }
const ctx = {
  logger,
  get: () => undefined,
  effect(fn) { try { fn() } catch {} return () => {} },
  inject(deps, cb) { injected.push(cb) },
  on() { return () => {} },
}
const injected = []

const scoped = {
  logger,
  systemPrompt: {
    section(def) { registeredSections.push({ ...def, isContext: false }); return () => {} },
    context(def) { registeredSections.push({ ...def, isContext: true }); return () => {} },
  },
  tools: { register(def) { registeredTools.push(def); return () => {} } },
  commands: { register(def) { registeredCommands.push(def); return () => {} } },
  get(name) {
    if (name === 'webServer') return { register(r) { registeredRoutes.push(r); return () => {} } }
    return undefined
  },
  effect(fn) { try { fn() } catch {} return () => {} },
}

mod.apply(ctx, mod.DEFAULT_CONFIG)
for (const cb of injected) cb(scoped)

const render = (t) => (typeof t === 'function' ? t() : t)

const out = {
  generatedAt: new Date().toISOString(),
  plugin: mod.name,
  sections: registeredSections.map((s) => ({
    kind: s.isContext ? 'context' : 'section',
    name: s.name,
    order: s.order,
    isFunction: typeof s.text === 'function',
    text: render(s.text),
    textLen: render(s.text).length,
  })),
  tools: registeredTools.map((t) => ({
    name: t.name,
    description: t.description,
    descriptionLen: t.description.length,
    parameters: t.parameters,
    parametersJSON: JSON.stringify(t.parameters, null, 2),
    parametersLen: JSON.stringify(t.parameters).length,
    outputSchema: t.output?.schema,
    outputSchemaJSON: JSON.stringify(t.output?.schema, null, 2),
    outputSchemaLen: JSON.stringify(t.output?.schema).length,
    outputRender: typeof t.output?.render === 'function' ? 'present' : 'missing',
  })),
  commands: registeredCommands.map((c) => ({
    name: c.name,
    description: c.description,
    descriptionLen: (c.description ?? '').length,
    input: c.input ?? null,
    inputJSON: c.input ? JSON.stringify(c.input, null, 2) : null,
  })),
  routes: registeredRoutes.map((r) => ({ kind: r.kind, path: r.path })),
}

const target = process.argv[2] ?? 'dump-prompts.json'
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, JSON.stringify(out, null, 2), 'utf8')

// 人读摘要
const sum = []
sum.push(`# memj 提示词清单（运行时导出）`)
sum.push(``)
sum.push(`生成时间：${out.generatedAt}`)
sum.push(``)
sum.push(`## 通道总览`)
sum.push(``)
sum.push(`| 通道 | 名称 | 落点 | order | 字符数 |`)
sum.push(`|---|---|---|---|---|`)
for (const s of out.sections) {
  sum.push(`| ${s.kind === 'context' ? '⭐ `context()`' : '`section()`'} | \`${s.name}\` | ${s.kind === 'context' ? 'user 角色（不破缓存）' : 'system 角色 node 0（破缓存）'} | ${s.order} | ${s.textLen} |`)
}
sum.push(``)
sum.push(`## 工具（共 ${out.tools.length}）`)
sum.push(``)
sum.push(`| 工具 | 描述字符 | 参数 JSON 字符 | 输出 schema 字符 | 合计 |`)
sum.push(`|---|---|---|---|---|`)
let tAll = 0, pAll = 0, oAll = 0
for (const t of out.tools) {
  tAll += t.descriptionLen; pAll += t.parametersLen; oAll += t.outputSchemaLen
  sum.push(`| \`${t.name}\` | ${t.descriptionLen} | ${t.parametersLen} | ${t.outputSchemaLen} | ${t.descriptionLen + t.parametersLen + t.outputSchemaLen} |`)
}
sum.push(`| **合计** | **${tAll}** | **${pAll}** | **${oAll}** | **${tAll + pAll + oAll}** |`)
sum.push(``)
sum.push(`## 命令（共 ${out.commands.length}）`)
sum.push(``)
for (const c of out.commands) sum.push(`- \`${c.name}\`（描述 ${c.descriptionLen} 字符，input: ${c.input ? '有' : '无'}）`)
sum.push(``)
sum.push(`## 路由（共 ${out.routes.length}）`)
for (const r of out.routes) sum.push(`- ${r.kind} \`${r.path}\``)

writeFileSync(target.replace(/\.json$/, '.summary.md'), sum.join('\n'), 'utf8')
console.log(sum.join('\n'))
console.log(`\n✅ 完整 dump → ${target}`)
console.log(`✅ 摘要 → ${target.replace(/\.json$/, '.summary.md')}`)
