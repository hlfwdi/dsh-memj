/**
 * 给 `dsh-memj` 补规范块声明（决策 215/216 的存量补齐）。
 *
 * ── 为什么单独给这一份补 ──────────────────────────────────────────────────
 * 上一轮迁移（`migrate-docs-to-spec-blocks.mjs` 白名单）**有意跳过了它**：
 * 那份脚本的判据是「**节名与模板逐字全等**」，而本份文档有 **7** 节
 * （多一个 `第十二批（2026-09-18）…`），模板是 6 节 ⇒ 判"结构不一致 ⇒ 不动"。
 *
 * ⭐ 而**建项目时**（`handoff.ts`）的判据更宽：**模板的每一节都在文档里就行**（容忍多出的节）。
 *   ⇒ 本次按**同一条判据**处理，并且**直接调那个真函数** `insertSpecBlocks`
 *     （决策 216 已把它导出；以前迁移脚本只能自己重抄一份 `insert()`，那是第二份副本）。
 *
 * 🔴 本次的**目的**：让「当前进度」拿到带 `truncate` 的规范块
 *   ⇒ `truncateSections` 有值 ⇒ **下一次 handoff 落盘时会自动归档**。
 *   ⚠️ 补块**本身不会**触发归档（`runHistoryArchive` 只被 handoff 调用）。
 *
 * ── 三条纪律 ──────────────────────────────────────────────────────────────
 *   1. ⭐ 复用 lib 的 `insertSpecBlocks`（不另写一份）；
 *   2. 🔴 先建后删：写前备份到库外 → 写后复验 → 不过就从备份回滚;
 *   3. **幂等**：已有规范块的节跳过。
 *
 * ⚠️ 安全断言（最重要）：插块后把**规范块全部剥掉**，必须与插块前**逐字相同**。
 *
 * 用法（插件仓根，先 build）：
 *   node scripts/migrate-dsh-memj-spec-blocks.mjs            # 只预演
 *   node scripts/migrate-dsh-memj-spec-blocks.mjs --write    # 真写
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DRY = !process.argv.includes('--write')
const PROJECT = 'dsh-memj'

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const {
  libraryRoot, projectsDir, splitFrontmatter, sectionsFromNarrative,
  specBlockRange, stripAllSpecBlocks, insertSpecBlocks, loadDefaultTemplate,
  truncateTitlesFromBlocks, DEFAULT_CONFIG,
} = mod
/**
 * ⚠️ **`truncateProgress` / `readHistoryLines` 在 `offline-bundle.js` 里**，
 *    `lib/index.js`（插件主入口）**不含它们** —— 这是本项目的既定事实，
 *    `scripts/test-template.mjs:157` 有一行注释专门记着它。
 *    ⭐ 判据：**"lib 里导出过" 不等于 "`index.js` 里有"** —— 两个 bundle 的导出面不同。
 */
const bundle = await import(pathToFileURL(join(process.cwd(), 'lib', 'offline-bundle.js')).href)
const { truncateProgress, readHistoryLines } = bundle
if (typeof truncateProgress !== 'function' || typeof readHistoryLines !== 'function') {
  throw new Error('offline-bundle.js 里没有 truncateProgress / readHistoryLines')
}

const p = join(projectsDir(), `HANDOFF-${PROJECT}.md`)
if (!existsSync(p)) throw new Error(`文档不存在：${p}`)
const backupDir = join(libraryRoot(), '.bak-before-dsh-memj-spec-blocks')
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)

const raw = readFileSync(p, 'utf8')
const { body } = splitFrontmatter(raw)
const narrative = body ?? ''

const tpl = await loadDefaultTemplate()
const tplNames = tpl.sections.map((s) => s.name)
const bodySecs = sectionsFromNarrative(narrative)

console.log(`库根   : ${libraryRoot()}`)
console.log(`文档   : ${p}`)
console.log(`模板   : default（${tplNames.length} 节）`)
console.log(`正文节 : ${bodySecs.join(' / ')}`)
console.log()

// ── ① 判据：**模板的每一节都在文档里**（容忍多出的节）——与 handoff.ts 建项目时同一条 ──
const names = new Set(bodySecs)
const allTplCovered = tpl.sections.length > 0 && tpl.sections.every((s) => names.has(s.name))
const extra = bodySecs.filter((n) => !tplNames.includes(n))
console.log(`① 模板节是否全被文档覆盖：${allTplCovered ? '✅ 是' : '🔴 否'}`)
console.log(`   文档多出的节（不补块）：${extra.length > 0 ? extra.join(' / ') : '（无）'}`)
if (!allTplCovered) throw new Error('判据不过 ⇒ 不补（宁可没有规范，也不贴错的）')

// ── ② 插块 ──
const alreadyHasBlock = specBlockRange(narrative.split(/\r?\n/)) !== undefined
if (alreadyHasBlock) {
  console.log('② 已有规范块 ⇒ 跳过插入（幂等）')
}
const newNarr = alreadyHasBlock ? narrative : insertSpecBlocks(narrative, tpl)
console.log(`② 插块：${narrative.length} → ${newNarr.length} 字符（+${newNarr.length - narrative.length}）`)

// ── ③ 安全断言：剥掉规范块后必须与原文逐字相同 ──
const stripped = stripAllSpecBlocks(newNarr)
const sameBack = sha(stripped) === sha(narrative.trim())
const blocksOk = specBlockRange(newNarr.split(/\r?\n/)) !== undefined
const secsSame = sectionsFromNarrative(newNarr).join(',') === bodySecs.join(',')
console.log(`③ 安全断言：正文剥块后逐字相同=${sameBack ? '✅' : '🔴'} / 有块=${blocksOk ? '✅' : '🔴'} / 节名不变=${secsSame ? '✅' : '🔴'}`)
if (!sameBack || !blocksOk || !secsSame) throw new Error('复验不过 ⇒ 不写盘')

// ── ④ 截断声明反解（这是本次的目的） ──
const titles = truncateTitlesFromBlocks(newNarr)
console.log(`④ 反解出的「可自动截断的节」= ${JSON.stringify(titles)}  ${titles.includes('当前进度') ? '✅ 正是本次要的' : '🔴 没拿到'}`)

// ── ⑤ 预演：下一次 handoff 会归档掉什么（**纯函数，不写盘**） ──
const warn = DEFAULT_CONFIG.progressCharsWarn
const historyLines = readHistoryLines(newNarr)
console.log()
console.log(`⑤ 归档预演（触发点 ${warn}）—— 不同「截断目标」各会归档多少：`)
for (const keep of [12000, 18000, 24000]) {
  const t = truncateProgress(newNarr, warn, keep, historyLines, titles)
  console.log(`\n   ── 目标 ${keep} ⇒ 「当前进度」${t.beforeChars} → ${t.afterChars} 字符，归档成 ${t.chunks.length} 条`)
  for (const c of t.chunks) {
    const ct = (c.sections ?? []).map((s) => s.title ?? String(s))
    console.log(`      · ${ct.length} 个小节（${(c.body ?? '').length} 字符）：${ct.map((x) => x.slice(0, 22)).join(' / ')}`)
  }
  if (t.warning !== '') console.log(`      ⚠️ ${t.warning}`)
}


// ── ⑥ 写盘（含备份与写后复验） ──
if (DRY) {
  console.log('\n（预演结束 —— 未写盘。加 --write 才真写）')
  process.exit(0)
}
if (alreadyHasBlock) {
  console.log('\n已有规范块 ⇒ 无需写盘。')
  process.exit(0)
}
mkdirSync(backupDir, { recursive: true })
copyFileSync(p, join(backupDir, `HANDOFF-${PROJECT}.md`))
const fmText = raw.slice(0, raw.length - narrative.length)
writeFileSync(p, fmText + newNarr + (raw.endsWith('\n') ? '\n' : ''), 'utf8')

const after = splitFrontmatter(readFileSync(p, 'utf8'))
const afterBody = after.body ?? ''
const okAfter =
  specBlockRange(afterBody.split(/\r?\n/)) !== undefined &&
  sha(stripAllSpecBlocks(afterBody)) === sha(narrative.trim()) &&
  sectionsFromNarrative(afterBody).join(',') === bodySecs.join(',') &&
  truncateTitlesFromBlocks(afterBody).includes('当前进度')
if (!okAfter) {
  console.log('\n🔴 写盘后复验不过 ⇒ 从备份回滚')
  copyFileSync(join(backupDir, `HANDOFF-${PROJECT}.md`), p)
  process.exit(1)
}
console.log(`\n✅ 已写入规范块（备份在 ${backupDir}）`)
console.log('⚠️ 补块本身**不会**触发归档 —— 归档发生在下一次 handoff 落盘时。')
