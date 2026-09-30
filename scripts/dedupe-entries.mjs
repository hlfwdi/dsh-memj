/**
 * 清理一次**误操作产生的重复条目**。
 *
 * 背景：同一条知识被写了两遍（slug 相同、uuid 不同，因为设计上"不去重"）。
 * 保留**先写入的那份**（uuid 出现在项目文档更早的位置），删掉后写入的。
 *
 * 用法：node scripts/dedupe-entries.mjs [--apply]
 * 不带 --apply 时**只报告不改**。
 */
import { readFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const lib = process.env['MEMJ_DATA_DIR'] ?? join(homedir(), '.dsh-memj')
const projPath = join(lib, 'projects', 'HANDOFF-dsh-memj.md')
const entriesDir = join(lib, 'entries')
const apply = process.argv.includes('--apply')

let text = readFileSync(projPath, 'utf8')

// 逐个封面块解析：取出 id / ref / slug。
const blockRe = /<!-- memj:entry\r?\n([\s\S]*?)\r?\n-->\r?\n<!-- \/memj:entry -->/g
const blocks = []
for (const m of text.matchAll(blockRe)) {
  const body = m[1]
  const id = /^id:\s*(.+)$/m.exec(body)?.[1]?.trim() ?? ''
  const ref = /^ref:\s*(.+)$/m.exec(body)?.[1]?.trim() ?? ''
  const slug = ref.replace(/^entries\//, '').replace(/-[0-9a-f]{8}\.md$/, '')
  blocks.push({ id, ref, slug, full: m[0] })
}

// 每个 slug 只保留**第一个**（先写入的那份）。
const seen = new Set()
const toRemove = []
for (const b of blocks) {
  if (seen.has(b.slug)) toRemove.push(b)
  else seen.add(b.slug)
}

console.log(`库根: ${lib}`)
console.log(`封面总数 ${blocks.length}，其中需要删除的重复项 ${toRemove.length} 个：`)
for (const b of toRemove) console.log(`  - ${b.id}  ${b.ref}`)

if (toRemove.length === 0) {
  console.log('没有重复项，无需处理。')
  process.exit(0)
}

if (!apply) {
  console.log('\n（未加 --apply，仅报告。加 --apply 才真正删除。）')
  process.exit(0)
}

// ── 1. 从项目文档里摘掉这些封面块 ──
for (const b of toRemove) {
  text = text.replace(b.full, '')
}
// 清掉因摘除而留下的多余空行（3 个以上换行压成 2 个）。
text = text.replace(/\n{3,}/g, '\n\n')
// 保留文件末尾的单个换行。
text = `${text.trimEnd()}\n`
const { writeFileSync } = await import('node:fs')
writeFileSync(projPath, text, 'utf8')
console.log(`\n已从项目文档移除 ${toRemove.length} 个重复封面`)

// ── 2. 删掉对应的 entry 正文文件 ──
let removed = 0
for (const b of toRemove) {
  const p = join(lib, b.ref)
  if (existsSync(p)) {
    unlinkSync(p)
    removed += 1
  }
}
console.log(`已删除 ${removed} 个正文文件`)

// ── 3. 重建派生层（让索引与封面一致）──
const modUrl = new URL('../lib/index.js', import.meta.url).href
const mod = await import(modUrl)
const stats = await mod.rebuildDerivedLayers()
console.log(`已重建派生层：${stats.themes} 主题 / ${stats.projects} 项目 frontmatter 更新 / ${stats.globalApproved} 全局`)

const snap = await mod.scanLibrary()
console.log(`\n最终封面数 = ${snap.covers.length}`)
