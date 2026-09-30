/**
 * 给库里已有的条目**补 `kind` 分类**（决策 81 落地时的一次性数据维护）。
 *
 * ⚠️ **为什么需要脚本**：`kind` 是**单值**字段，没有"追加"通道
 * （不像 `theme` 可以 `memj_promote` 追加）。目前工具面**没有**改 `kind` 的入口，
 * 所以补分类只能直接改项目文档里的封面 + entries 的 frontmatter。
 *
 * 用法：node scripts/backfill-kind.mjs [--apply]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const lib = process.env['MEMJ_DATA_DIR'] ?? join(homedir(), '.dsh-memj')
const apply = process.argv.includes('--apply')

/** 逐条人工判定（依据是标题与正文的实际形态）。 */
const KIND_BY_SLUG = {
  // 事实 / 接口：世界是这样的
  'dsh-command-result-kind': 'fact',
  'dsh-tool-param-compiled-to-jsonschema': 'fact',
  // 陷阱 / 纠错：这样做会错，或曾被推翻
  'dsh-peer-dep-type-duplication': 'trap',
  'dsh-tool-output-schema-strict': 'trap',
  'windows-esm-absolute-path-import': 'trap',
  // 决策 / 做法 + 理由
  'handoff-body-built-before-write': 'decision',
  'tool-contract-needs-tool-layer-test': 'decision',
}

// ── 1. 改项目文档里的封面块 ──
const projPath = join(lib, 'projects', 'HANDOFF-dsh-memj.md')
let text = readFileSync(projPath, 'utf8')
const blockRe = /<!-- memj:entry\r?\n([\s\S]*?)\r?\n-->\r?\n<!-- \/memj:entry -->/g

let changed = 0
const plan = []
text = text.replace(blockRe, (full, body) => {
  const ref = /^ref:\s*(.+)$/m.exec(body)?.[1]?.trim() ?? ''
  const slug = ref.replace(/^entries\//, '').replace(/-[0-9a-f]{8}\.md$/, '')
  const want = KIND_BY_SLUG[slug]
  if (want === undefined) return full
  if (/^kind:\s*/m.test(body)) {
    plan.push({ slug, action: '已有 kind，跳过' })
    return full
  }
  plan.push({ slug, action: `补 kind: ${want}` })
  changed += 1
  // 插在 global 行之后（与 renderCover 的字段顺序一致）。
  return full.replace(/^(global:.*)$/m, `$1\nkind: ${want}`)
})

console.log(`库根: ${lib}`)
console.log(`计划（${plan.length} 条）：`)
for (const p of plan) console.log(`  - ${p.slug}: ${p.action}`)

// ── 2. 改各 entry 的 frontmatter ──
const entryPlan = []
for (const [slug, kind] of Object.entries(KIND_BY_SLUG)) {
  const dir = join(lib, 'entries')
  if (!existsSync(dir)) break
  const { readdirSync } = await import('node:fs')
  const f = readdirSync(dir).find((n) => n.startsWith(`${slug}-`) && n.endsWith('.md'))
  if (f === undefined) { entryPlan.push({ slug, action: '找不到文件' }); continue }
  const p = join(dir, f)
  const t = readFileSync(p, 'utf8')
  if (/^kind:\s*/m.test(t)) { entryPlan.push({ slug, action: '已有 kind，跳过' }); continue }
  entryPlan.push({ slug, action: `补 kind: ${kind}` })
  if (apply) {
    writeFileSync(p, t.replace(/^(global:.*)$/m, `$1\nkind: ${kind}`), 'utf8')
  }
}
console.log(`\nentry frontmatter（${entryPlan.length} 条）：`)
for (const p of entryPlan) console.log(`  - ${p.slug}: ${p.action}`)

if (!apply) {
  console.log('\n（未加 --apply，仅报告。加 --apply 才真正写入。）')
  process.exit(0)
}

writeFileSync(projPath, text, 'utf8')
console.log(`\n已写入：项目文档封面 ${changed} 处 + entry frontmatter`)

// ── 3. 重建派生层 ──
const mod = await import(new URL('../lib/index.js', import.meta.url).href)
await mod.rebuildDerivedLayers()
const snap = await mod.scanLibrary()
const byKind = {}
for (const { cover } of snap.covers) {
  const k = cover.kind === '' ? '(未分类)' : cover.kind
  byKind[k] = (byKind[k] ?? 0) + 1
}
console.log('\n分类结果：')
for (const [k, n] of Object.entries(byKind).sort()) console.log(`  ${k}: ${n}`)
