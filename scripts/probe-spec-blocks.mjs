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
/** ⚠️ 封面里还残留已废弃的 `sections:` 行。 */
const legacyField = []
/** ⭐ 「不截」的文档（= 正文规范里没写 `truncate`）—— 那是**设计**，不是异常。 */
const noCut = []

for (const f of files) {
  const raw = readFileSync(join(dir, f), 'utf8')
  const { data, body } = mod.splitFrontmatter(raw)
  const fm = data ?? {}
  const id = f.replace(/^HANDOFF-/, '').replace(/\.md$/, '')
  /** @deprecated 该字段已于 2026-10-05 删除 —— 这里只用来查"存量有没有清干净"。 */
  const fmSecs = mod.toStringArray(fm['sections'])
  const secs = mod.sectionsFromNarrative(body ?? '')
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
  // 🔴🔴 **判据已重写**（2026-10-05，封面 `sections` 字段删除之后）：
  //    老判据是"`sections` 非空 + `truncateSections` 空 ⇒ 截断被关" ——
  //    而 `sections` **整个没了**，那条判据无从谈起。
  //    ⭐ 现在的语义（用户裁定 ③-B）：**正文规范里没写 `truncate` ⇒ 就是不截**
  //      —— 那是**设计**，不是异常 ⇒ 不再报红，只如实标出来。
  //    ⚠️ **但仍要报一种情况**：老文档残留了 `sections:` 行（该字段已废弃）。
  if (fmSecs.length > 0) {
    legacyField.push(id)
    flags.push('⚠️ 封面里还残留已废弃的 `sections:` 行（跑 `drop-cover-sections-field.mjs` 清掉）')
  }
  // ⚠️ **漂移**：frontmatter 明确写了 `truncateSections`、且与正文反解不同。
  if (trunc.length > 0 && (hasBlock || legacySpec !== '') && JSON.stringify(fromBody) !== JSON.stringify(trunc)) {
    drift.push(id)
    flags.push(`⚠️ 正文反解 ${JSON.stringify(fromBody)} ≠ frontmatter ${JSON.stringify(trunc)}`)
  }
  if (secs.length > 0 && trunc.length === 0) noCut.push(id)

  const label = { block: '🆕 新形态', legacy: '📜 旧形态', none: '➖ 无规范' }[kind]
  console.log(
    `${label}  ${id}（${secs.length} 节｜${trunc.length > 0 ? `截断 ${trunc.join('/')}` : '不截'}）`,
  )
  for (const x of flags) console.log(`      ${x}`)
}

console.log('\n═══ 汇总 ═══')
console.log(`新形态（节内规范块）：${stat.block}`)
console.log(`旧形态（末尾一节）  ：${stat.legacy}`)
console.log(`无规范（老文档）    ：${stat.none}`)
console.log(`\n⭐ 不截（规范没写 truncate）：${noCut.length}${noCut.length > 0 ? '  —— ' + noCut.join('、') : ''}`)
console.log(`⚠️ 截断声明漂移      ：${drift.length}${drift.length > 0 ? '  —— ' + drift.join('、') : ''}`)
console.log(
  `⚠️ 残留废弃的 \`sections:\` 行：${legacyField.length}${legacyField.length > 0 ? '  —— ' + legacyField.join('、') : ''}`,
)
console.log(
  '\n⭐ **"不截"是设计**（2026-10-05 用户裁定）：**正文规范里没写 `truncate` ⇒ 就是不截** ——' +
    '\n   要让某一节自动瘦身，就在它的规范块起始行加上 `truncate`（如 ```` ```memj:spec truncate ````）。' +
    '\n⚠️ 漂移与残留字段**都不影响 handoff 成功**，也不会报错 —— 它们只是"静默地少干活"或"留了死数据"。',
)
process.exit(0)
