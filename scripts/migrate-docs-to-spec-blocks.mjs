/**
 * 把**老项目文档**迁成新形态：给每一节标题下插入它的规范块（决策 209 的存量迁移）。
 *
 * ── 先决认知（实测过，别想当然）────────────────────────────────────────────
 *   · 规范从**模板**来（`default.md` / `company-deep-research.md` 的 desc）；
 *   · **只对"正文节名与模板节名逐字一致"的文档动手** —— 对不上就是结构不同，
 *     硬贴规范 = 主动误导（决策 207 的裁定：不知道就什么都不写）；
 *   · `frontmatter.sections` **不影响本脚本**（它是兼容读，且只在正文没节时用）。
 *
 * ── 三条纪律（与其它迁移脚本同一套）────────────────────────────────────────
 *   1. ⭐ **复用 lib 的渲染器**（`renderSpecBlocksSkeleton` / `specBlockRange`），不另写一份；
 *   2. 🔴 **先建后删**：写前备份到库外 → 写后**逐字段复验**（节名逐字/正文原有内容一字不少/
 *      每节都拿到块）→ 不过就**从备份回滚**；
 *   3. **幂等**：已有规范块的**跳过**。
 *
 * ⚠️ **正文的安全断言**（本脚本最重要的一条）：
 *    迁完后把正文里的**规范块全部剥掉**，必须与迁前的正文**逐字相同**。
 *    这一条挡的是"插入时把原有内容吃掉/改掉"这一类静默损坏。
 *
 * 用法（插件仓根，先 build）：
 *   node scripts/migrate-docs-to-spec-blocks.mjs --dry
 *   node scripts/migrate-docs-to-spec-blocks.mjs [<库根>]
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DRY = process.argv.includes('--dry')
// 🔴 **只扫 `slice(2)`**（`argv[0]` 是 node 可执行文件的完整路径 ——
//    我第一版扫了全量 argv，于是 `existsSync` 命中了 node.exe 自己，
//    把库根设成了 `…/node.exe` ⇒ 读不到任何模板。实测抓到的。）
const rootArg = process.argv
  .slice(2)
  .find((a) => !a.startsWith('--') && /[\\/]/.test(a) && existsSync(a))
if (rootArg !== undefined) process.env['MEMJ_DATA_DIR'] = rootArg

// ⚠️ 诊断：`loadTemplate` 读的是 `promptsDir()`/`templatesDir()`，都跟 `MEMJ_DATA_DIR` 走。
if (process.env['MEMJ_DEBUG'] === '1') {
  console.error('[dbg] argv =', JSON.stringify(process.argv.slice(2)))
  console.error('[dbg] rootArg =', JSON.stringify(rootArg))
  console.error('[dbg] MEMJ_DATA_DIR =', JSON.stringify(process.env['MEMJ_DATA_DIR']))
}

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const {
  libraryRoot, projectsDir, splitFrontmatter, docSectionsOf, toStringArray,
  specBlockRange, stripAllSpecBlocks, stripSpecBlock, sectionsFromNarrative,
  loadDefaultTemplate, loadTemplate, renderSpecBlocksSkeleton,
} = mod
if (process.env['MEMJ_DEBUG'] === '1') {
  console.error('[dbg] libraryRoot =', libraryRoot())
  console.error('[dbg] templatesDir =', mod.templatesDir())
}

const dir = projectsDir()
const backupDir = join(libraryRoot(), '.bak-docs-before-spec-blocks')
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)

/** ⚠️ **白名单**（本次只迁"结构对得上"的：默认六节 + metax）。 */
const DEFAULT6 = ['dsh-016-upgrade', 'dsh-020-upgrade', 'ccaa-exam-prep', 'dsh-ccaa-open',
  'dsh-cua-browser-use', 'dsh-memory', 'dsh-mobile-nav', 'dsh-mobile-relay', 'dsh-plugin-adapt',
  'dsh-power-control', 'dsh-qoder-connect', 'dsh-workbuddy-connect', 'hindsight-research',
  'qoder2api', 'selfhost-vpn', 'video-production', 'dsh-notify']
/** `metax-688802` 的结构 = `company-deep-research` 模板那套（实测逐字一致）。 */
const CDR = ['metax-688802']

const tplDefault = await loadDefaultTemplate()
const tplCdr = await loadTemplate('company-deep-research')
if (tplCdr === undefined) throw new Error('读不到 company-deep-research 模板')

console.log(`库根  : ${libraryRoot()}`)
console.log(`文档  : ${dir}`)
console.log(`备份  : ${backupDir}`)
console.log(`模板  : default(${tplDefault.sections.length} 节) / company-deep-research(${tplCdr.sections.length} 节)`)
if (DRY) console.log('⚠️  DRY RUN —— 不写盘')
console.log()

/**
 * ⭐ **把规范块逐节插进已有正文**（只插、不改任何原有行）。
 * 与 `handoff.ts` 的 `insertSpecBlocks` 同一手法 —— 但那个是内部函数未导出，
 * 所以这里用 `renderSpecBlocksSkeleton` 生成后再按节贴。
 */
function insert(template, text) {
  const descOf = new Map(template.sections.map((s) => [s.name, s]))
  const lines = text.split(/\r?\n/)
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m === null) { out.push(line); i += 1; continue }
    const title = (m[1] ?? '').trim()
    let j = i + 1
    while (j < lines.length && !/^##\s+/.test(lines[j] ?? '')) j += 1
    const seg = lines.slice(i, j)
    out.push(line)
    const s = descOf.get(title)
    if (s !== undefined && specBlockRange(seg) === undefined) {
      out.push('', `\`\`\`${mod.SPEC_BLOCK_FENCE}${s.truncate === true ? ' truncate' : ''}`)
      if (s.desc.trim() !== '') out.push(s.desc.trim())
      out.push('```', '')
    }
    out.push(...seg.slice(1))
    i = j
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

let done = 0
let skipped = 0
let failed = 0

for (const [ids, tpl, label] of [[DEFAULT6, tplDefault, 'default'], [CDR, tplCdr, 'company-deep-research']]) {
  console.log(`─── 用模板 ${label}（${ids.length} 份）`)
  const tplNames = tpl.sections.map((s) => s.name)
  for (const id of ids) {
    const p = join(dir, `HANDOFF-${id}.md`)
    if (!existsSync(p)) { console.log(`  ❌ ${id}：文件不存在`); failed += 1; continue }
    const raw = readFileSync(p, 'utf8')
    const { data, body } = splitFrontmatter(raw)
    const narrative = body ?? ''

    if (specBlockRange(narrative.split(/\r?\n/)) !== undefined) {
      console.log(`  ⏭️  ${id}：已有规范块 ⇒ 跳过`)
      skipped += 1
      continue
    }
    // 🔴 **只对"节名逐字一致"的动手**（结构不同 ⇒ 不猜、不贴）
    const bodySecs = sectionsFromNarrative(narrative)
    const same = bodySecs.length === tplNames.length && bodySecs.every((s, i) => s === tplNames[i])
    if (!same) {
      console.log(`  ⚠️  ${id}：正文节名与模板 ${label} **不一致** ⇒ **不动**（不猜）`)
      console.log(`        正文：${bodySecs.join(' / ')}`)
      console.log(`        模板：${tplNames.join(' / ')}`)
      failed += 1
      continue
    }

    const newNarr = insert(tpl, narrative)
    // ── 🔴 安全断言：剥掉规范块后必须与原文**逐字相同**（挡"插入时吃掉原内容"）──
    const stripped = stripAllSpecBlocks(newNarr)
    const sameBack = sha(stripped) === sha(narrative.trim())
    const blocksOk = specBlockRange(newNarr.split(/\r?\n/)) !== undefined
    const secsStillSame = sectionsFromNarrative(newNarr).join(',') === bodySecs.join(',')
    if (!sameBack || !blocksOk || !secsStillSame) {
      console.log(`  ❌ ${id}：插入后复验不过（正文还原=${sameBack} 有块=${blocksOk} 节名=${secsStillSame}）⇒ 不动`)
      failed += 1
      continue
    }
    /** frontmatter 原样保留（**只换正文**）；这里重建整份文本。 */
    const fmText = raw.slice(0, raw.length - narrative.length)
    const next = fmText + newNarr + (raw.endsWith('\n') ? '\n' : '')

    if (DRY) {
      console.log(`  🔍 ${id}：可迁（+${newNarr.length - narrative.length} 字符，正文剥块后 sha ${sha(narrative.trim())} 不变）`)
      done += 1
      continue
    }

    mkdirSync(backupDir, { recursive: true })
    copyFileSync(p, join(backupDir, `HANDOFF-${id}.md`))
    writeFileSync(p, next, 'utf8')

    // ── 写后复验 ──
    const after = splitFrontmatter(readFileSync(p, 'utf8'))
    const afterBody = after.body ?? ''
    const okAfter =
      specBlockRange(afterBody.split(/\r?\n/)) !== undefined &&
      sha(stripAllSpecBlocks(afterBody)) === sha(narrative.trim()) &&
      sectionsFromNarrative(afterBody).join(',') === bodySecs.join(',') &&
      toStringArray(after.data?.['sections']).join(',') === toStringArray(data?.['sections']).join(',')
    if (!okAfter) {
      console.log(`  🔴 ${id}：写盘后复验不过 ⇒ **从备份回滚**`)
      copyFileSync(join(backupDir, `HANDOFF-${id}.md`), p)
      failed += 1
      continue
    }
    console.log(`  ✅ ${id}：已插入规范块（${tplNames.length} 节；正文剥块后 sha ${sha(narrative.trim())} 未变）`)
    done += 1
  }
}

console.log(`\n═══ 结果 ═══`)
console.log(`${DRY ? '可迁' : '已迁'}      : ${done}`)
console.log(`跳过（已有块）: ${skipped}`)
console.log(`失败/未动   : ${failed}`)
if (DRY) console.log('（DRY RUN —— 未写盘）')
process.exit(failed === 0 ? 0 : 1)
