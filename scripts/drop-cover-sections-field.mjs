/**
 * 存量清理：把项目文档封面里的 **`sections:` 行删掉**（2026-10-05，用户裁定）。
 *
 * ── 为什么删 ──────────────────────────────────────────────────────────────
 *   模板改走 md 之后，那行成了"节名的最后一份副本"；而权威早已在**正文的 `##` 标题**
 *   （`docSectionsOf`，决策 207）。它剩下的唯一实际作用是个**副作用**：
 *   非空会让截断判据落到"以 `truncateSections` 为准"那一支 ⇒
 *   老文档"只被补了 `sections`、没补 `truncateSections`"时**自动截断静默关闭**（实测 11 份）。
 *   ⇒ ⭐ 判据：**同一事实有两份副本时，删掉那份"只是被回落的"，而不是给它加防线。**
 *
 * ── 纪律（与其它迁移脚本同一套）────────────────────────────────────────────
 *   1. 🔴 **只删这一行**：删完做**正文 sha256 比对**，逐字必须不变；
 *      其余 frontmatter 字段（project/desc/themes/时间/template/truncateSections）
 *      **逐个比对必须未变**；
 *   2. 🔴 **先建后删**：写前备份到库外 → 写后复验 → 不过就**回滚**；
 *   3. **幂等**：本来就没有这行的**跳过**；
 *   4. ⚠️ **不扫全库猜测**：只处理 `projects/` 下的 `HANDOFF-*.md`，且**只删完全匹配
 *      `sections: [...]` 的那一行**（不碰正文里任何同名文字）。
 *
 * 用法（插件仓根，先 build）：
 *   node scripts/drop-cover-sections-field.mjs --dry
 *   node scripts/drop-cover-sections-field.mjs [<库根>]
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DRY = process.argv.includes('--dry')
// ⚠️ **只扫 `slice(2)`**（`argv[0]` 是 node 路径，含 `/` 且 `existsSync` 为真 ⇒ 会误判；踩过）。
const rootArg = process.argv
  .slice(2)
  .find((a) => !a.startsWith('--') && /[\\/]/.test(a) && existsSync(a))
if (rootArg !== undefined) process.env['MEMJ_DATA_DIR'] = rootArg

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const { libraryRoot, projectsDir, splitFrontmatter } = mod

const dir = projectsDir()
const backupDir = join(libraryRoot(), '.bak-before-drop-sections-field')
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)

console.log(`库根  : ${libraryRoot()}`)
console.log(`文档  : ${dir}`)
console.log(`备份  : ${backupDir}`)
if (DRY) console.log('⚠️  DRY RUN —— 不写盘')
console.log()

const files = readdirSync(dir).filter((f) => f.startsWith('HANDOFF-') && f.endsWith('.md'))
let done = 0
let skipped = 0
let failed = 0

for (const f of files) {
  const p = join(dir, f)
  const raw = readFileSync(p, 'utf8')
  /** 🔴 **只删 frontmatter 里的那一行** —— 用 `splitFrontmatter` 拿边界，别全局替换。 */
  const { data, body } = splitFrontmatter(raw)
  const lines = raw.split('\n')
  const idx = lines.findIndex((l) => /^sections:\s*\[/.test(l))
  if (idx < 0 || data === undefined || data['sections'] === undefined) {
    skipped += 1
    continue
  }
  /** ⚠️ 必须在 frontmatter 区内（防误删正文里的同名行）。 */
  const fmEnd = lines.findIndex((l, i) => i > 0 && /^---\s*$/.test(l))
  if (fmEnd < 0 || idx > fmEnd) {
    console.log(`  ❌ ${f}：那一行不在 frontmatter 区内 ⇒ 不动`)
    failed += 1
    continue
  }

  const next = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join('\n')
  const after = splitFrontmatter(next)
  // ── 复验：正文逐字未变 + 其余字段逐个未变 ──
  const bodySame = sha(after.body ?? '') === sha(body ?? '')
  const keys = ['project', 'desc', 'themes', 'createdAt', 'updatedAt', 'archivedAt', 'template', 'truncateSections']
  const fieldsSame = keys.every(
    (k) => JSON.stringify(after.data?.[k] ?? null) === JSON.stringify(data[k] ?? null),
  )
  const lineDelta = next.split('\n').length - lines.length
  if (!bodySame || !fieldsSame || lineDelta !== -1 || after.data?.['sections'] !== undefined) {
    console.log(`  ❌ ${f}：复验不过（正文=${bodySame} 字段=${fieldsSame} 行数${lineDelta}）⇒ 不动`)
    failed += 1
    continue
  }

  if (DRY) {
    console.log(`  🔍 ${f}：可删（-1 行 \`${lines[idx].slice(0, 60)}\`，正文 sha ${sha(body ?? '')} 不变）`)
    done += 1
    continue
  }

  mkdirSync(backupDir, { recursive: true })
  copyFileSync(p, join(backupDir, f))
  writeFileSync(p, next, 'utf8')
  // ── 写后复验 ──
  const again = splitFrontmatter(readFileSync(p, 'utf8'))
  if (
    again.data?.['sections'] !== undefined ||
    sha(again.body ?? '') !== sha(body ?? '')
  ) {
    console.log(`  🔴 ${f}：写盘后复验不过 ⇒ **从备份回滚**`)
    copyFileSync(join(backupDir, f), p)
    failed += 1
    continue
  }
  console.log(`  ✅ ${f}：已删该行（正文 sha ${sha(body ?? '')} 未变；原文已备份）`)
  done += 1
}

console.log(`\n═══ 结果 ═══`)
console.log(`文档总数   : ${files.length}`)
console.log(`${DRY ? '可删' : '已删'}       : ${done}`)
console.log(`跳过（无此行）: ${skipped}`)
console.log(`失败/未动   : ${failed}`)
if (DRY) console.log('（DRY RUN —— 未写盘）')
process.exit(failed === 0 ? 0 : 1)
