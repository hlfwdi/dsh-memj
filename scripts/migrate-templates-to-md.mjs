/**
 * 模板迁移：把旧的 `<库根>/templates/<id>.json` 转成新的 `<id>.md`（决策 208 的收尾）。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────────
 * 决策 208 把模板从 JSON 改成 markdown（人可读、可手改），而**读侧保留了兼容读**
 * ⇒ 旧 `.json` **仍能用**，但**不会自动变成 md** ⇒ 用户在库根看到的仍是 json，
 * 想手改时拿不到"文档样子"的那份。
 *
 * ── 三条纪律（照 `migrate-add-sections.mjs` 的范式）─────────────────────────
 * 1. ⭐ **复用 lib 的渲染器**（`renderTemplateDoc` / `parseTemplateDoc`），
 *    **不另写一份** —— 本项目铁律："同一语义两条实现 ⇒ 迟早漂开"。
 * 2. 🔴 **先建后删**：先写 `.md`、**读回校验**它与旧 `.json` **逐字段等价**，
 *    等价才删旧文件。**校验不过就不删**（宁可用着旧格式，也不丢模板）。
 * 3. **幂等 + 只补不覆盖**：已有 `.md` 的 id **跳过**（绝不用旧 json 盖掉手改过的新 md）。
 *
 * 用法（在插件仓根跑）：
 *   node scripts/migrate-templates-to-md.mjs --dry     # 只报告
 *   node scripts/migrate-templates-to-md.mjs           # 真迁移
 * ⚠️ 默认读写**库里**的 `templates/`（受 `MEMJ_DATA_DIR` 影响，便于在副本上先试）。
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DRY = process.argv.includes('--dry')

// ⚠️ Windows 上 ESM 的**裸绝对路径**会被当成 URL scheme（ERR_UNSUPPORTED_ESM_URL_SCHEME）
//    ⇒ 必须用**相对说明符**（本项目已撞过三次）。
const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const {
  libraryRoot, templatesDir, templatePath, legacyTemplatePath,
  loadTemplate, renderTemplateDoc, parseTemplateDoc, validateTemplate,
} = mod

const dir = templatesDir()
console.log(`库根      : ${libraryRoot()}`)
console.log(`模板目录  : ${dir}`)
if (DRY) console.log('⚠️  DRY RUN —— 不会写盘、不会删文件')
console.log()

if (!existsSync(dir)) {
  console.log('❌ 没有 templates/ 目录 —— 无需迁移')
  process.exit(0)
}

const files = readdirSync(dir)
const jsonIds = files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length))
console.log(`目录里共 ${files.length} 个文件，其中旧 .json ${jsonIds.length} 个\n`)

let migrated = 0
let skipped = 0
let failed = 0

for (const id of jsonIds) {
  const mdPath = templatePath(id)
  const jsonPath = legacyTemplatePath(id)

  // ── 幂等：已有 .md ⇒ 跳过（**绝不用旧 json 覆盖**，那可能是用户手改过的）──
  if (existsSync(mdPath)) {
    console.log(`  ⏭️  ${id}：已有 .md ⇒ 跳过（不覆盖）`)
    skipped += 1
    continue
  }

  // ── 读旧 json（经 lib 的 loadTemplate ⇒ 它已经处理了两种格式）──
  const t = await loadTemplate(id)
  if (t === undefined) {
    console.log(`  ❌ ${id}：读不出来（json 坏了？）⇒ 不动`)
    failed += 1
    continue
  }

  // ── 先校验它本身合法（坏的模板不该被"迁移"成看起来正常的新文件）──
  const errs = validateTemplate(t)
  if (errs.length > 0) {
    console.log(`  ❌ ${id}：模板本身不合法 ⇒ 不动：\n      ${errs.join('\n      ')}`)
    failed += 1
    continue
  }

  // ── 渲染成 md，并**读回校验逐字段等价**（这是"先建后删"里的"建 + 验"）──
  const md = renderTemplateDoc(t)
  const back = parseTemplateDoc(md, id)
  const same = back !== undefined
    && back.id === t.id
    && back.title === t.title
    && back.sections.length === t.sections.length
    && back.sections.every((s, i) => {
      const o = t.sections[i]
      return o !== undefined && s.name === o.name && s.desc === o.desc
        && (s.truncate === true) === (o.truncate === true)
    })
  if (!same) {
    console.log(`  ❌ ${id}：md 读回后与旧 json **不等价** ⇒ 不写、不删（宁可用旧格式）`)
    failed += 1
    continue
  }

  if (DRY) {
    console.log(`  🔍 ${id}：可迁移（${t.sections.length} 节，md ${md.length} 字符，往返等价 ✅）`)
    migrated += 1
    continue
  }

  // ── 写新文件 →（校验已过）→ 删旧文件 ──
  //    ⚠️ 用 writeFileSync 而不是 lib 的原子写：这里要的是"写成功了才删"，
  //       而原子写失败会抛 ⇒ 走不到 unlink（正是我们要的语义）。
  writeFileSync(mdPath, md, 'utf8')
  if (!existsSync(mdPath)) {
    console.log(`  ❌ ${id}：.md 没写成功 ⇒ 保留旧 json`)
    failed += 1
    continue
  }
  unlinkSync(jsonPath)
  console.log(`  ✅ ${id} → ${id}.md（${t.sections.length} 节，往返等价；旧 json 已删）`)
  migrated += 1
}

console.log(`\n═══ 迁移结果 ═══`)
console.log(`旧 .json 总数 : ${jsonIds.length}`)
console.log(`${DRY ? '可迁移' : '已迁移'}      : ${migrated}`)
console.log(`跳过（已有 md）: ${skipped}`)
console.log(`失败/未动     : ${failed}`)
if (DRY) console.log('（DRY RUN —— 未写盘、未删文件）')

// ── 收尾：打印迁移后的目录，便于人核对 ──
if (!DRY) {
  console.log('\n迁移后 templates/：')
  for (const f of readdirSync(dir)) console.log(`  ${f}`)
}
process.exit(failed === 0 ? 0 : 1)
