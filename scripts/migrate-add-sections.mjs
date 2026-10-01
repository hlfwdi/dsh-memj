/**
 * 存量迁移：给**已有的项目文档**补上 `sections:` 字段（决策 204）。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────────
 * 决策 204 让"节名"从**全局硬编码六节**变成**每份文档自己记一份**：
 * `<项目文档>/frontmatter.sections`。
 * 老文档**没有这个字段** ⇒ 读出来是空数组 ⇒ `sectionsOf()` 回落默认六节
 * ⇒ ⭐ **行为完全正确、不迁移也能用**。
 *
 * 那为什么还要迁？——用户 2026-09-30 明确要求：
 *   *"老文档最好也补上字段，方便之后校验等完全统一。"*
 * ⇒ 补上之后，"这份文档的节名"是**显式记录**的，不再依赖"空 = 默认"这条隐含约定；
 *   将来做校验 / 体检 / 界面展示时口径统一。
 *
 * ── 🔴 补的值 ──────────────────────────────────────────────────────────────
 * **默认六节**（用户裁定："就是那六节"）——
 * ⚠️ 但**顺序取文档里的实际出现顺序**，不是硬编码顺序：
 *   有人手工调整过节顺序的文档，按实际顺序记才**不撒谎**。
 *   （文档里缺的默认节按标准顺序补在后面。）
 *
 * ── 做法（照 `migrate-add-title.mjs` 的范式）─────────────────────────────
 * · **只补不删**：已有 `sections:` 的文档**不动**（幂等，可反复跑）；
 * · 🔴 **绝不整篇重渲染** —— 那会碰掉封面块与人的手改；
 *   只**在 frontmatter 区间内**插一行（`archivedAt` 之后、第一个 `---` 之前）；
 * · `--dry` 只报告要改什么。
 *
 * 用法：node scripts/migrate-add-sections.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DRY = process.argv.includes('--dry')
const lib = process.env['MEMJ_DATA_DIR'] ?? join(process.env['USERPROFILE'] ?? '', '.dsh-memj')
const projectsDir = join(lib, 'projects')

/** 默认六节（与代码里的 `NARRATIVE_TITLES` 同值——本脚本有意不 import 构建产物）。 */
const DEFAULT_SIX = ['目标', '当前进度', '有效做法', '失败/踩坑', '关键上下文', '下一步']

/** 从文档正文里按出现顺序取出顶层 `## ` 节名（跳过围栏内的伪标题）。 */
function topSections(text) {
  const out = []
  let inFence = false
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m !== null) {
      const t = m[1].trim()
      // ⚠️ 「沉淀知识」不是叙事节（它由工具维护）⇒ 不记进 sections。
      if (t !== '沉淀知识' && !out.includes(t)) out.push(t)
    }
  }
  return out
}

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
  const text = readFileSync(path, 'utf8')
  scanned += 1

  // ① frontmatter 区间（第一个 `---` 到下一个 `---`）。
  const lines = text.split(/\r?\n/)
  if ((lines[0] ?? '').trim() !== '---') {
    console.log(`  ⏭️  ${file}：没有 frontmatter，跳过`)
    failed += 1
    continue
  }
  let fmEnd = -1
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] ?? '').trim() === '---') {
      fmEnd = i
      break
    }
  }
  if (fmEnd === -1) {
    console.log(`  ⏭️  ${file}：frontmatter 未闭合，跳过`)
    failed += 1
    continue
  }

  // ② 已有 `sections:` ⇒ 不动（幂等）。
  if (lines.slice(1, fmEnd).some((l) => /^sections:/.test(l))) {
    alreadyOk += 1
    continue
  }

  // ③ 取节名：**文档里实际的顺序**在前，缺的默认节按标准顺序补在后。
  const seen = topSections(text)
  const finalSections = [...seen, ...DEFAULT_SIX.filter((t) => !seen.includes(t))]

  // ④ 只动 frontmatter：插在 `archivedAt` 之后；没有它则插在最后一行之前。
  let insertAt = -1
  for (let i = fmEnd - 1; i >= 1; i -= 1) {
    if (/^archivedAt:/.test(lines[i] ?? '')) {
      insertAt = i + 1
      break
    }
  }
  if (insertAt === -1) insertAt = fmEnd

  const yamlArr = `[${finalSections.join(', ')}]`
  const next = [...lines.slice(0, insertAt), `sections: ${yamlArr}`, ...lines.slice(insertAt)].join('\n')

  if (!DRY) writeFileSync(path, next, 'utf8')
  migrated += 1
  console.log(`  ✅ ${file} → sections: ${yamlArr}`)
}

console.log(`\n═══ 迁移结果 ═══`)
console.log(`扫描文档：${scanned}`)
console.log(`已有 sections（跳过）：${alreadyOk}`)
console.log(`本次补写：${migrated}`)
console.log(`失败/跳过：${failed}`)
if (DRY) console.log('（DRY RUN，未写盘）')
process.exit(failed === 0 ? 0 : 1)
