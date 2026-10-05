/**
 * ⭐⭐ **规范围栏的存量体检**（决策 209）——**只读**，不写任何东西。
 *
 * ── 它回答三个问题 ────────────────────────────────────────────────────────
 *   ① 每份文档用的是**新形态**（各节标题下的 ```memj:spec 围栏）、
 *      **旧形态**（末尾 `## 本档写作规范` 一节），还是**两者都没有**（决策 207 之前的老文档）？
 *   ② `frontmatter.truncateSections` 与**正文反解出来的**是否一致（漂移 = 有人的判据会错）？
 *   ③ ⚠️ **自动截断是否已关**：`sections` 非空 + `truncateSections` 空
 *      ⇒ `defaultTruncateTitle()` 落到"不截，不猜"分支（**静默**）。
 *      这是决策 204 的迁移（补 `sections`）与决策 206 的判据（以 `truncateSections` 为准）
 *      **叠加**出来的存量问题 —— 本项目实测 20 份里 11 份处于这个状态。
 *
 * 用法（插件仓根，先 build）：
 *   node scripts/probe-spec-blocks.mjs            # 查生产库（~/.dsh-memj）
 *   node scripts/probe-spec-blocks.mjs <库根>      # 查指定库
 *   MEMJ_DATA_DIR=<库根> node scripts/probe-spec-blocks.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.argv[2] ?? process.env['MEMJ_DATA_DIR'] ?? ''
if (root !== '') process.env['MEMJ_DATA_DIR'] = root

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const dir = join(mod.libraryRoot(), 'projects')

let files
try {
  files = readdirSync(dir).filter((f) => f.startsWith('HANDOFF-') && f.endsWith('.md'))
} catch (err) {
  console.error(`读不到 ${dir}：${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

console.log(`库根: ${mod.libraryRoot()}`)
console.log(`文档: ${files.length} 份\n`)

const stat = { block: 0, legacy: 0, none: 0 }
const drift = []
const closed = []

for (const f of files) {
  const raw = readFileSync(join(dir, f), 'utf8')
  const { data, body } = mod.splitFrontmatter(raw)
  const fm = data ?? {}
  const id = f.replace(/^HANDOFF-/, '').replace(/\.md$/, '')
  const secs = mod.toStringArray(fm['sections'])
  const trunc = mod.toStringArray(fm['truncateSections'])
  const narrative = body ?? ''

  const hasBlock = mod.specBlockRange(narrative.split(/\r?\n/)) !== undefined
  const legacySpec = mod.extractSpecSection(narrative)
  const fromBody = hasBlock
    ? mod.truncateTitlesFromBlocks(narrative)
    : legacySpec !== ''
      ? mod.truncateTitlesFromSpec(legacySpec)
      : []
  const kind = hasBlock ? 'block' : legacySpec !== '' ? 'legacy' : 'none'
  stat[kind] += 1

  const flags = []
  if (secs.length > 0 && trunc.length === 0) {
    closed.push(id)
    flags.push('🔴 sections 非空但 truncateSections 空 ⇒ **已不再自动截断**')
  }
  if ((hasBlock || legacySpec !== '') && JSON.stringify(fromBody) !== JSON.stringify(trunc)) {
    drift.push(id)
    flags.push(`⚠️ 正文反解 ${JSON.stringify(fromBody)} ≠ frontmatter ${JSON.stringify(trunc)}`)
  }

  const label = { block: '🆕 新形态', legacy: '📜 旧形态', none: '➖ 无规范' }[kind]
  console.log(`${label}  ${id}（${secs.length} 节${trunc.length > 0 ? `，可截断 ${trunc.join('/')}` : ''}）`)
  for (const x of flags) console.log(`      ${x}`)
}

console.log('\n═══ 汇总 ═══')
console.log(`新形态（节内规范块）：${stat.block}`)
console.log(`旧形态（末尾一节）  ：${stat.legacy}`)
console.log(`无规范（老文档）    ：${stat.none}`)
console.log(`\n🔴 自动截断已关闭    ：${closed.length}${closed.length > 0 ? '  —— ' + closed.join('、') : ''}`)
console.log(`⚠️ 截断声明漂移      ：${drift.length}${drift.length > 0 ? '  —— ' + drift.join('、') : ''}`)
console.log(
  '\n⚠️ 这两项都**不影响本次 handoff 成功**，也不会报错 —— 它们只是**静默地少干活**。' +
    '\n   截断关闭的修法：在文档里给它想要自动瘦身的那一节补一个 `memj:spec truncate` 围栏块' +
    '（或把 `truncateSections` 写进 frontmatter）。',
)
process.exit(0)
