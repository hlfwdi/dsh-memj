/**
 * 存量迁移：给**已有的封面**补上 `title` 字段（决策 98）。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────────
 * `title` 在 2026-09-19 之前**不是封面的字段**——那时标题是"从正文现算"的
 * （内部条目取首个 `###`、外部引用取首个 `#`）。
 * 决策 98 把 `title` 提为**封面必填字段**并**新增了硬校验**：
 * ⇒ **旧封面没有 `title`，会被判非法**，在 `memj_rebuild` 里**整份跳过**
 *   （不是报错拦住，而是**静默少掉**）。
 * 所以**必须先迁移、再让新校验生效**。
 *
 * ── 🔴 为什么不能靠 `scanLibrary()` 找待迁移的封面 ──────────────────────────
 * 加了新校验之后，**旧封面恰恰因为"缺 title"而被 `scanLibrary` 判为非法、
 * 根本不出现在 `covers` 里**（实测：23 张全部落到 `issues`）。
 * ⇒ 迁移脚本**必须直接读原始文件**（`projects/*.md`），
 *   用**放宽的解析**（`coverFromYaml` + 只挑"缺 title"这一种问题）来定位。
 *
 * ── 做法 ────────────────────────────────────────────────────────────────────
 * 对每张缺 `title` 的封面：
 *   1. 从它指向的**正文**里提取标题（内部条目 `###` / 外部引用 `#`）；
 *   2. 用**局部块替换**（`replaceBlockAtLines`）把 `title:` 行插进那一块——
 *      🔴 **绝不整篇重渲染**（那会碰掉同文档里的其它块与人的手改）。
 *
 * ⚠️ **只补不删**：正文里那份标题**一律保留**（用户明确要求）。
 * ⚠️ **幂等**：已有 `title` 的封面**不动**，可以反复跑。
 *
 * 用法：node scripts/migrate-add-title.mjs [--dry]
 *   --dry  只报告要改什么，不写盘
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DRY = process.argv.includes('--dry')
const lib = process.env['MEMJ_DATA_DIR'] ?? join(process.env['USERPROFILE'] ?? '', '.dsh-memj')
const projectsDir = join(lib, 'projects')

const mod = await import(new URL('../lib/index.js', import.meta.url).href)
const { coverFromYaml, parseCovers, renderCover, replaceBlockAtLines, loadEntryDoc } = mod

let scanned = 0
let alreadyOk = 0
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
  let text = readFileSync(path, 'utf8')

  // 🔴 **放宽解析**：`parseCovers` 会把"缺 title"的块归入 issues（但**不发进 covers**），
  //    所以这里只能用 `blocks`（全部围栏块，含非法的）+ 自己解析 YAML。
  const { blocks } = parseCovers(text, file)
  // ⚠️ 从后往前改，前面的块行号才不会失效。
  const ordered = [...blocks].sort((a, b) => b.startLine - a.startLine)
  let changed = 0

  for (const blk of ordered) {
    // 抠出围栏内的 YAML（去掉 `<!-- memj:entry` 与结尾 `-->`）。
    const inner = blk.text
      .replace(/^<!--\s*memj:entry\s*/, '')
      .replace(/-->\s*<!--\s*\/memj:entry\s*-->\s*$/, '')
      .replace(/-->\s*$/, '')
      .trim()
    let cover
    try {
      cover = coverFromYaml(inner)
    } catch {
      continue // 解析不了的块（人手改坏）——不归本脚本管，交给 /memj-review
    }
    // 只认"有 id + 有 ref"的真封面块。
    if (cover.id.trim() === '' || cover.ref.trim() === '') continue

    scanned += 1
    if (cover.title.trim() !== '') {
      alreadyOk += 1
      continue
    }

    // 从正文提取标题（与旧行为一致：内部条目 `###`，外部引用 `#`）。
    const entry = await loadEntryDoc(cover.ref, cover.ext)
    const fallback = entry?.title ?? ''
    // ⚠️ 正文读不到（如外部文件已移走）时，退而用 desc 前缀，保证 title 非空。
    const title = (fallback.trim() !== '' ? fallback : cover.desc.slice(0, 40)).trim()

    if (title === '') {
      console.log(`  ❌ ${file} / ${cover.id.slice(0, 8)}：正文无标题、desc 也为空，无法补`)
      failed += 1
      continue
    }

    const next = renderCover({ ...cover, title })
    text = replaceBlockAtLines(text, blk.startLine, blk.endLine, next)
    changed += 1
    migrated += 1
    console.log(`  ✅ ${file} / ${cover.id.slice(0, 8)} → title: ${title}`)
  }

  if (changed > 0 && !DRY) {
    writeFileSync(path, text, 'utf8')
    console.log(`  💾 已写回 ${file}（${changed} 处）`)
  }
}

console.log(`\n═══ 迁移结果 ═══`)
console.log(`扫描封面：${scanned}`)
console.log(`已有 title（跳过）：${alreadyOk}`)
console.log(`本次补写：${migrated}`)
console.log(`失败：${failed}`)
if (DRY) console.log('（DRY RUN，未写盘）')
process.exit(failed === 0 ? 0 : 1)
