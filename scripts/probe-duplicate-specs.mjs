/**
 * 🔴 **存量体检：哪些文档的规范块被重复写过多份**（只读，不改任何东西）。
 *
 * 背景：2026-10-12 修掉的那个 bug（`mergeNarrative` 未剥规范块 ⇒ 未写的节
 * 每轮多长一份）**潜伏了很久** ⇒ 存量文档里可能已经积了多份。
 *
 * ⚠️ **它只报数**：不修、不写盘。修复方案由人定（见输出末尾的说明）。
 *
 * 用法：node scripts/probe-duplicate-specs.mjs [库根]
 *   不给库根 ⇒ 用 `MEMJ_DATA_DIR` / `~/.dsh-memj`（**生产库，只读**）。
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

const F = String.fromCharCode(96, 96, 96) + 'memj:spec'
const blocks = (t) => t.split(F).length - 1
const topSections = (t) => (t.match(/^##\s+/gm) ?? []).length

console.log(`库根: ${mod.libraryRoot()}`)
console.log(`文档: ${files.length} 份\n`)

let clean = 0
const dirty = []
for (const f of files) {
  const raw = readFileSync(join(dir, f), 'utf8')
  const id = f.replace(/^HANDOFF-/, '').replace(/\.md$/, '')
  const nBlocks = blocks(raw)
  const nSecs = topSections(raw)
  // ⚠️ 判据是"**规范块数 > 顶层节数**" ——
  //    正常情况两者相等（每节最多一个块；没有块的节会让块数**少于**节数）。
  //    ⇒ **多于**就说明有节带了不止一个块（= 中招）。
  const extra = nBlocks - nSecs
  if (extra <= 0) { clean += 1; continue }
  // 找出**具体哪几节**重复（这才是可操作的）
  const dup = []
  const parts = raw.split(/^##\s+/m).slice(1)
  for (const p of parts) {
    const title = (p.split('\n')[0] ?? '').trim()
    const c = blocks(p)
    if (c > 1) dup.push(`${title}×${c}`)
  }
  dirty.push({ id, nBlocks, nSecs, extra, dup })
}

console.log(`✅ 正常：${clean} 份`)
console.log(`🔴 有重复块：${dirty.length} 份\n`)
for (const d of dirty) {
  console.log(`  ${d.id}`)
  console.log(`     块 ${d.nBlocks} / 节 ${d.nSecs}（多 ${d.extra}）`)
  console.log(`     重复的节：${d.dup.join('、')}`)
}

console.log('\n── 说明 ──')
console.log('⚠️ **本探针只读**。修法（需人决定）：对每份中招的文档，')
console.log('   把多余的规范块删掉、只留**每个节的第一个** —— 因为 `sectionSpecsOf()`')
console.log('   本来就只取第一个块 ⇒ 删掉多余的**不改变任何现有行为**，只是不再虚胖。')
console.log('⭐ 但 `### 历史进展` 等正文**必须逐字保住** ⇒ 迁移脚本要按块的行区间精确删。')
process.exit(0)
