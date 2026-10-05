/**
 * 修存量：给 11 份文档补回 `truncateSections`（决策 204 迁移 + 决策 206 判据叠加的后果）。
 *
 * ── 病因（实测）────────────────────────────────────────────────────────────
 *   · 决策 204 的迁移脚本给老文档补了 `frontmatter.sections`（那次**没有** `truncateSections`，
 *     因为那个字段是决策 206 才引入的）；
 *   · 决策 206 把判据改成"`sections` 非空 ⇒ 以 `truncateSections` 为准，空 = 不截，**不猜**"；
 *   ⇒ 两者叠加 ⇒ 这 11 份文档落到"**不截**"分支 ⇒ **自动截断静默关闭**。
 *
 * ── 修法（只做一件事）──────────────────────────────────────────────────────
 *   给它们补回 `truncateSections: [当前进度]` —— 这是**它们本来就该有的值**
 *   （默认六节模板声明「当前进度」可截断；这几份的节名也正是默认六节）。
 *   🔴 **不动正文、不补规范块** —— 它们属于"模板绝不回溯"（决策 204）的老文档。
 *
 * ── 三条纪律（与其它迁移脚本同一套）────────────────────────────────────────
 *   1. ⭐ **只改 frontmatter 的这一行**，正文逐字不动（改完做 sha 比对）；
 *   2. 🔴 **先建后删**：写前备份到库外（`<库根>/.bak-before-truncate-fix/`）→
 *      写后**读回复验**（那一行确实写进去了、正文 sha 未变）→ 不等价就从备份回滚；
 *   3. **幂等**：已经有非空 `truncateSections` 的文档 **跳过**。
 *
 * ⚠️ 只对**白名单**里的 11 份动手（不扫全库）—— 避免误改用户手写的文档。
 *    白名单来自 `scripts/probe-spec-blocks.mjs` 的实测输出。
 *
 * 用法（插件仓根，先 build）：
 *   node scripts/migrate-fix-truncate-sections.mjs --dry    # 只报告
 *   node scripts/migrate-fix-truncate-sections.mjs          # 真修
 *   node scripts/migrate-fix-truncate-sections.mjs <库根>    # 指定库（副本上用）
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DRY = process.argv.includes('--dry')
const rootArg = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1])
if (rootArg !== undefined && existsSync(rootArg)) process.env['MEMJ_DATA_DIR'] = rootArg

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const { libraryRoot, projectsDir, splitFrontmatter, toStringArray, docSectionsOf } = mod

const dir = projectsDir()
const backupDir = join(libraryRoot(), '.bak-before-truncate-fix')

/** ⚠️ 白名单（来自 `probe-spec-blocks.mjs` 的实测输出，**不扫全库**）。 */
const TARGETS = [
  'dsh-016-upgrade', 'dsh-cua-browser-use', 'dsh-memory', 'dsh-mobile-nav',
  'dsh-power-control', 'dsh-qoder-connect', 'dsh-sandbox-whitelist',
  'dsh-workbuddy-connect', 'hindsight-research', 'qoder2api', 'selfhost-vpn',
]

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)

console.log(`库根  : ${libraryRoot()}`)
console.log(`文档  : ${dir}`)
console.log(`备份  : ${backupDir}`)
if (DRY) console.log('⚠️  DRY RUN —— 不写盘')
console.log()

let fixed = 0
let skipped = 0
let failed = 0

for (const id of TARGETS) {
  const p = join(dir, `HANDOFF-${id}.md`)
  if (!existsSync(p)) {
    console.log(`  ❌ ${id}：文件不存在 ⇒ 跳过`)
    failed += 1
    continue
  }
  const raw = readFileSync(p, 'utf8')
  const { data, body } = splitFrontmatter(raw)
  const secs = toStringArray(data?.['sections'])
  const trunc = toStringArray(data?.['truncateSections'])

  // ── 幂等：已经有值 ⇒ 跳过 ──
  if (trunc.length > 0) {
    console.log(`  ⏭️  ${id}：已有 truncateSections=[${trunc.join(', ')}] ⇒ 跳过`)
    skipped += 1
    continue
  }

  // ── 定该给它什么值：**只认文档自己的节名里有没有「当前进度」** ──
  const bodySecs = docSectionsOf(body ?? '', secs)
  if (!bodySecs.includes('当前进度')) {
    console.log(`  ❌ ${id}：正文里没有「当前进度」节（节名：${bodySecs.join('/')}）⇒ **不动**（不猜）`)
    failed += 1
    continue
  }
  /** 🔴 只加这一行；放在 `sections:` 之后（与正常写入的顺序一致）。 */
  const line = 'truncateSections: [当前进度]'
  if (!/^sections:.*$/m.test(raw)) {
    console.log(`  ❌ ${id}：连 sections 行都没有 ⇒ **不动**（不猜）`)
    failed += 1
    continue
  }
  const next = raw.replace(/^(sections:.*)$/m, `$1\n${line}`)

  // ── 复验 1：正文必须**逐字未变** ──
  const after = splitFrontmatter(next)
  const bodySame = sha(after.body ?? '') === sha(body ?? '')
  // ── 复验 2：那一行确实写进去了、且只多了一行 ──
  const linesBefore = raw.split('\n').length
  const linesAfter = next.split('\n').length
  const ok = bodySame && linesAfter === linesBefore + 1
  if (!ok) {
    console.log(`  ❌ ${id}：改完复验不过（正文未变=${bodySame}，行数 ${linesBefore}→${linesAfter}）⇒ 不动`)
    failed += 1
    continue
  }

  if (DRY) {
    console.log(`  🔍 ${id}：可修（+1 行 \`${line}\`，正文 sha ${sha(body ?? '')} 不变）`)
    fixed += 1
    continue
  }

  // ── 备份 → 写 → 读回复验 ──
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(p, join(backupDir, `HANDOFF-${id}.md`))
  writeFileSync(p, next, 'utf8')
  const again = splitFrontmatter(readFileSync(p, 'utf8'))
  const truncNow = toStringArray(again.data?.['truncateSections'])
  const bodyStillSame = sha(again.body ?? '') === sha(body ?? '')
  if (truncNow.join(',') !== '当前进度' || !bodyStillSame) {
    console.log(`  🔴 ${id}：写盘后复验不过 ⇒ **从备份回滚**`)
    copyFileSync(join(backupDir, `HANDOFF-${id}.md`), p)
    failed += 1
    continue
  }
  console.log(`  ✅ ${id}：补上 \`${line}\`（正文 sha ${sha(body ?? '')} 未变；原文已备份）`)
  fixed += 1
}

console.log(`\n═══ 结果 ═══`)
console.log(`白名单     : ${TARGETS.length}`)
console.log(`${DRY ? '可修' : '已修'}       : ${fixed}`)
console.log(`跳过（已有值）: ${skipped}`)
console.log(`失败/未动  : ${failed}`)
if (DRY) console.log('（DRY RUN —— 未写盘）')
process.exit(failed === 0 ? 0 : 1)
