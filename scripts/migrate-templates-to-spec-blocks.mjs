/**
 * 模板**形态升级**：`desc 裸写在标题下`（决策 208）⇒ `desc 写进节名下的 ```memj:spec 围栏`（决策 209）。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────────
 * 决策 209 改的是**模板与项目文档的形态**：每节的"要干嘛"从**裸正文**搬进
 * **标题下的规范围栏块**。而**读侧保留了兼容读**（`parseTemplateDoc` 两种都认）
 * ⇒ 存量模板**仍能用**，但**永远不会自动变成新形态**
 * ⇒ 用户在库根 `templates/` 里看到的仍是旧样子，
 *    而"模板文件本身就是一份带规范的说明文档"这个**唯一好处**享受不到。
 *
 * ── 三条纪律（与 `migrate-templates-to-md.mjs` 同一套）────────────────────
 * 1. ⭐ **复用 lib 的渲染器**（`renderTemplateDoc` / `parseTemplateDoc`），**不另写一份**
 *    —— 本项目铁律："同一语义两条实现 ⇒ 迟早漂开"；
 * 2. 🔴 **先建后删**：先渲染成新文本 → **读回校验与旧文本逐字段等价**（id/title/节数/
 *    每节 name+desc 逐字/truncate）→ 等价才写盘；**不等价就不写**（宁可用旧形态）；
 * 3. **幂等 + 只升级不降级**：已经是新形态（含 ```memj:spec 围栏）的 id **跳过**。
 *
 * ⚠️ **备份**：本脚本**不改文件名**，所以"先建后删"在这里体现为
 *    **写前把原文备份到库外**（`<库根>/.bak-templates-before-spec-blocks/`），
 *    写坏了可以从那里拿回来。
 *
 * 用法（在插件仓根跑，**先 build**）：
 *   node scripts/migrate-templates-to-spec-blocks.mjs --dry      # 只报告
 *   node scripts/migrate-templates-to-spec-blocks.mjs            # 真迁移
 *   node scripts/migrate-templates-to-spec-blocks.mjs --refresh-comments
 *       ⭐ **只刷新顶部那段说明注释**（形态已是新的、但注释文案过时时用）——
 *         它**仍然逐字段校验**：字段有任何变化就**不写**（注释更新不等于可以改内容）。
 *         它也会**先备份**。
 *
 * ⚠️ 默认读写**库里**的 `templates/`（受 `MEMJ_DATA_DIR` 影响 ⇒ 可先在库副本上试）。
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DRY = process.argv.includes('--dry')
/** ⭐ 只刷新顶部说明注释（形态已是新的、但注释文案过时）。 */
const REFRESH = process.argv.includes('--refresh-comments')

// ⚠️ Windows 上 ESM 的**裸绝对路径**会被当成 URL scheme（ERR_UNSUPPORTED_ESM_URL_SCHEME）。
const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const {
  libraryRoot, templatesDir, templatePath,
  renderTemplateDoc, parseTemplateDoc, validateTemplate, specBlockRange, SPEC_BLOCK_FENCE,
} = mod

const dir = templatesDir()
const backupDir = join(libraryRoot(), '.bak-templates-before-spec-blocks')
console.log(`库根      : ${libraryRoot()}`)
console.log(`模板目录  : ${dir}`)
console.log(`备份目录  : ${backupDir}`)
if (DRY) console.log('⚠️  DRY RUN —— 不会写盘')
console.log()

if (!existsSync(dir)) {
  console.log('❌ 没有 templates/ 目录 —— 无需迁移')
  process.exit(0)
}

const mdIds = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -'.md'.length))
console.log(`目录里共 ${readdirSync(dir).length} 个文件，其中 .md ${mdIds.length} 个\n`)

/** 逐字段等价（与 `migrate-templates-to-md.mjs` 同一套判据）。 */
function sameShape(a, b) {
  return (
    a !== undefined &&
    b !== undefined &&
    a.id === b.id &&
    a.title === b.title &&
    a.sections.length === b.sections.length &&
    a.sections.every((s, i) => {
      const o = b.sections[i]
      return o !== undefined && s.name === o.name && s.desc === o.desc && (s.truncate === true) === (o.truncate === true)
    })
  )
}

let upgraded = 0
let skipped = 0
let failed = 0

for (const id of mdIds) {
  const p = templatePath(id)
  const text = readFileSync(p, 'utf8')
  const before = parseTemplateDoc(text, id)

  // ── 幂等：已经是新形态 ⇒ 跳过（**除非**是"只刷新注释"模式）──
  const alreadyNew = specBlockRange(text.split(/\r?\n/)) !== undefined
  if (alreadyNew && !REFRESH) {
    console.log(`  ⏭️  ${id}：已是新形态（含 \`\`\`${SPEC_BLOCK_FENCE}）⇒ 跳过`)
    skipped += 1
    continue
  }
  if (before === undefined) {
    console.log(`  ❌ ${id}：解析不出任何节 ⇒ 不动`)
    failed += 1
    continue
  }
  const errs = validateTemplate(before)
  if (errs.length > 0) {
    console.log(`  ❌ ${id}：模板本身不合法 ⇒ 不动：\n      ${errs.join('\n      ')}`)
    failed += 1
    continue
  }

  // ── 渲染成新形态 → **读回校验逐字段等价**（这是"先建后删"里的"建 + 验"）──
  const next = renderTemplateDoc(before)
  const back = parseTemplateDoc(next, id)
  if (!sameShape(back, before)) {
    console.log(`  ❌ ${id}：新形态读回后与旧形态**不等价** ⇒ 不写（宁可用旧形态）`)
    failed += 1
    continue
  }

  // ⭐ **"只刷新注释"模式**下，若渲染结果与盘上那份**一字不差**，说明没什么可刷的。
  if (REFRESH && next === text) {
    console.log(`  ⏭️  ${id}：注释已是最新（渲染结果与盘上逐字相同）⇒ 跳过`)
    skipped += 1
    continue
  }

  if (DRY) {
    console.log(`  🔍 ${id}：${REFRESH ? '可刷新注释' : '可升级'}（${before.sections.length} 节，${text.length} → ${next.length} 字符，往返等价 ✅）`)
    upgraded += 1
    continue
  }

  // ── 备份 → 写盘 → 复验 ──
  //    🔴 **两种模式共用同一套纪律**：字段等价校验照做（注释更新**不等于**可以改内容）。
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(p, join(backupDir, `${id}.md`))
  writeFileSync(p, next, 'utf8')
  const after = parseTemplateDoc(readFileSync(p, 'utf8'), id)
  if (!sameShape(after, before)) {
    console.log(`  🔴 ${id}：写盘后复验不等价 ⇒ **从备份恢复**`)
    copyFileSync(join(backupDir, `${id}.md`), p)
    failed += 1
    continue
  }
  console.log(`  ✅ ${id}（${before.sections.length} 节，${text.length} → ${next.length} 字符；原文已备份）`)
  upgraded += 1
}

console.log(`\n═══ 结果 ═══`)
console.log(`.md 总数      : ${mdIds.length}`)
console.log(`${DRY ? '可升级' : '已升级'}        : ${upgraded}`)
console.log(`跳过（已是新形态）: ${skipped}`)
console.log(`失败/未动     : ${failed}`)
if (DRY) console.log('（DRY RUN —— 未写盘）')
else if (failed > 0) console.log(`⚠️ 有 ${failed} 份未动 —— 原文仍在，未丢任何东西`)
process.exit(failed === 0 ? 0 : 1)
