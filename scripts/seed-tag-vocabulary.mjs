/**
 * 播种标签词表（决策 162）：把库里**现有的全部 tag** 一次性登记为规范词。
 *
 * ── 为什么必须播种（用户 2026-09-28 批准）────────────────────────────────
 * 不播种的话，词表从空开始 ⇒ `插件`(51)、`缓存`(12) 这些**老词**会在首次运行时
 * 被当成"新 tag"交给模型裁决一遍 —— 能判对，但**白花一大笔 token**
 * （还要把带上正文的条目一并喂进去），而且**可能被误判**成泛化词丢掉。
 *
 * ⚠️ **播种不推水位线**：`lastRunAt` 保持"现在"。
 * 否则首次运行就会把 276 条正文全喂一遍（≈138k token），而用户明确要求
 * "首次运行要带水位线，水位线直接填现在的时间"。
 *
 * ⚠️ **幂等**：已在词表里的 tag 不重复登记、不改动已有信息（aliases / en）。
 *
 * 用法：
 *   $env:MEMJ_DATA_DIR="<库副本>"; node scripts/seed-tag-vocabulary.mjs          # dry-run
 *   $env:MEMJ_DATA_DIR="<库副本>"; node scripts/seed-tag-vocabulary.mjs --write  # 真写
 */
import { join } from 'node:path'
import { homedir } from 'node:os'

const WRITE = process.argv.includes('--write')
const ALLOW_PROD = process.argv.includes('--allow-production')
const override = process.env['MEMJ_DATA_DIR']
const root = override !== undefined && override.trim() !== ''
  ? override.trim()
  : join(homedir(), '.dsh-memj')

console.log(`库根: ${root}`)
console.log(`模式: ${WRITE ? '**写入**' : 'dry-run（加 --write 才真写）'}`)
if (ALLOW_PROD) console.log('⚠️ 已显式开启 --allow-production')
console.log('')

// ⭐ 动手前自证落点（本项目纪律：迁移/探针先打印路径）。
if (WRITE && !ALLOW_PROD && !/temp|tmp/i.test(root)) {
  console.error(
    '🔴 库根不像是副本 —— 真写前请把 MEMJ_DATA_DIR 指向库副本。\n' +
      '   ⚠️ 若这**确实是**要播种生产库，显式加 `--allow-production`。',
  )
  process.exit(1)
}

const mod = await import(new URL('../lib/index.js', import.meta.url).href)
const { scanLibrary, loadVocabulary, saveVocabulary, emptyVocabulary, seedVocabulary } = mod

console.log(`库根（自证）: ${mod.libraryRoot()}`)

const snap = await scanLibrary({ includeArchived: true, includeHistory: true })
const freq = new Map()
for (const c of snap.covers) for (const t of c.cover.tags) freq.set(t, (freq.get(t) ?? 0) + 1)
const allTags = [...freq.keys()]
console.log(`封面 ${snap.covers.length} / 不同 tag ${allTags.length}\n`)

// ⭐ 首次运行时**水位线 = 现在**（用户要求）⇒ 只建词表、不花钱。
const nowIso = new Date().toISOString()
let vocab = await loadVocabulary()
const existed = vocab !== undefined
if (vocab === undefined) vocab = emptyVocabulary(nowIso)

const before = Object.keys(vocab.canonical).length
const added = seedVocabulary(vocab, allTags)
const after = Object.keys(vocab.canonical).length

console.log('═══ 结果 ═══')
console.log(`  词表: ${existed ? '已存在' : '**新建**'}`)
console.log(`  规范词: ${before} → ${after}（本次新增 ${added}）`)
console.log(`  水位线 lastRunAt: ${vocab.lastRunAt}${existed ? '（保持原值，未推进）' : '（= 现在）'}`)
console.log(`  ⭐ 有英文的: ${Object.values(vocab.canonical).filter((v) => v.en !== '').length}`)

if (added > 0) {
  console.log('\n═══ 新增的规范词（前 15 个，按频次）═══')
  const sorted = allTags.filter((t) => vocab.canonical[t] !== undefined).sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0))
  for (const t of sorted.slice(0, 15)) console.log(`  ${String(freq.get(t)).padStart(3)}  ${t}`)
}

if (WRITE) {
  await saveVocabulary(vocab)
  console.log('\n✅ 已写入词表。')
} else {
  console.log('\n⚠️ dry-run —— 确认无误后加 `--write` 真写。')
}
