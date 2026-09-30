/**
 * 修库中已有的 `source::` 脏数据（renderFrontmatter 旧 bug 的产物）。
 *
 * 症状：`source:: ` 多一个冒号 ⇒ YAML 把 `source` 解析成字符串 `":"`，
 * 其下的 `sessionId` / `from` **写入成功却读不回来**。
 *
 * 用法：node scripts/fix-source-block.mjs [--apply]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const lib = process.env['MEMJ_DATA_DIR'] ?? join(homedir(), '.dsh-memj')
const dir = join(lib, 'entries')
const apply = process.argv.includes('--apply')

let touched = 0
for (const name of readdirSync(dir)) {
  if (!name.endsWith('.md')) continue
  const p = join(dir, name)
  const text = readFileSync(p, 'utf8')
  if (!text.includes('source::')) {
    console.log(`  ✓ ${name}：无需处理`)
    continue
  }
  // 只改 `source::` 这一行（末尾可有空格），改成 `source:`。
  const fixed = text.replace(/^source::[ \t]*$/m, 'source:')
  if (!apply) {
    console.log(`  → ${name}：将修 source:: → source:`)
    touched += 1
    continue
  }
  writeFileSync(p, fixed, 'utf8')
  console.log(`  ✔ ${name}：已修`)
  touched += 1
}

console.log(`\n${apply ? '已修' : '待修'} ${touched} 个文件`)
if (!apply) {
  console.log('（未加 --apply，仅报告。）')
  process.exit(0)
}

// 验证：全部条目的 source 现在都能读回来
const mod = await import(new URL('../lib/index.js', import.meta.url).href)
let ok = 0
let bad = 0
for (const c of (await mod.scanLibrary()).covers) {
  if (c.cover.ext) continue
  const doc = await mod.loadEntryDoc(c.cover.ref, false)
  if (doc === undefined) { bad += 1; continue }
  if (doc.frontmatter.source !== undefined) ok += 1
}
console.log(`\n校验：${ok} 条读回 source，${bad} 条读不出`)
