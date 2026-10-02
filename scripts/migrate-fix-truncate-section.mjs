/**
 * 补丁：给**已经迁过 `sections` 但没迁 `truncateSection`** 的文档补上后者。
 *
 * ── 为什么需要它（真实事故，2026-10-02）──────────────────────────────────────
 * `migrate-add-sections.mjs` 的**第一版**只写了 `sections`、**漏了 `truncateSection`**。
 * 而读取侧的判据（`handoff.ts` 的 `defaultTruncateTitle`）是：
 *   · `sections` **空** ⇒ 用默认六节的目标（「当前进度」）；
 *   · `sections` **非空** ⇒ **以 `truncateSection` 为准**，空串 = **不截**。
 * ⇒ ⚠️ 后果：**迁过的项目「当前进度」再也不会自动截断**（文档无限膨胀）。
 * ⭐ 发现方式：`memj_handoff` 回执里那句「**历史归档未执行**：本模板没有声明可自动截断的节」
 *    —— 而那个项目**明明有「当前进度」**。
 *
 * 规则（与 migration 脚本同规）：文档的 `sections` 里**有「当前进度」** ⇒ 补 `truncateSection: 当前进度`；
 * **没有** ⇒ 不动（它就是真的不截）。
 *
 * ⚠️ **只补不删**、**幂等**（已有 `truncateSection` 的跳过）、支持 `--dry`。
 * 用法：node scripts/migrate-fix-truncate-section.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DRY = process.argv.includes('--dry')
const lib = process.env['MEMJ_DATA_DIR'] ?? join(process.env['USERPROFILE'] ?? '', '.dsh-memj')
const projectsDir = join(lib, 'projects')

let scanned = 0
let alreadyOk = 0
let noSections = 0
let migrated = 0
let failed = 0

console.log(`库根: ${lib}`)
if (DRY) console.log('⚠️  DRY RUN——不会写盘')
console.log()

if (!existsSync(projectsDir)) {
  console.log('❌ 没有 projects/ 目录')
  process.exit(1)
}

const files = readdirSync(projectsDir).filter((f) => f.startsWith('HANDOFF-') && f.endsWith('.md'))
console.log(`项目文档：${files.length} 个\n`)

for (const file of files) {
  const path = join(projectsDir, file)
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  scanned += 1

  if ((lines[0] ?? '').trim() !== '---') {
    console.log(`  ⏭️  ${file}：没有 frontmatter，跳过`)
    failed += 1
    continue
  }
  let fmEnd = -1
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] ?? '').trim() === '---') { fmEnd = i; break }
  }
  if (fmEnd === -1) {
    console.log(`  ⏭️  ${file}：frontmatter 未闭合，跳过`)
    failed += 1
    continue
  }

  const fm = lines.slice(1, fmEnd)
  // 已有 `truncateSection:` ⇒ 跳过（幂等）。
  if (fm.some((l) => /^truncateSection:/.test(l))) { alreadyOk += 1; continue }

  // 没有 `sections:` ⇒ 不归本补丁管（那是 migration 脚本的事）。
  const secLine = fm.find((l) => /^sections:/.test(l))
  if (secLine === undefined) { noSections += 1; continue }

  // 判据：`sections` 里有没有「当前进度」。
  const hasProgress = secLine.includes('当前进度')
  if (!hasProgress) {
    console.log(`  ⏭️  ${file}：sections 里没有「当前进度」⇒ 本当不截，不动`)
    noSections += 1
    continue
  }

  // 插在 `sections:` 行之后（保持同类字段相邻）。
  const idx = lines.findIndex((l) => /^sections:/.test(l))
  const next = [...lines.slice(0, idx + 1), 'truncateSection: 当前进度', ...lines.slice(idx + 1)].join('\n')
  if (!DRY) writeFileSync(path, next, 'utf8')
  migrated += 1
  console.log(`  ✅ ${file} → truncateSection: 当前进度`)
}

console.log(`\n═══ 补丁结果 ═══`)
console.log(`扫描文档：${scanned}`)
console.log(`已有 truncateSection（跳过）：${alreadyOk}`)
console.log(`无需处理（无 sections / 无「当前进度」）：${noSections}`)
console.log(`本次补写：${migrated}`)
console.log(`失败/跳过：${failed}`)
if (DRY) console.log('（DRY RUN，未写盘）')
process.exit(failed === 0 ? 0 : 1)
