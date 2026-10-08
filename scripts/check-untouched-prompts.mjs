/**
 * 核对：决策 222 那几条提示词常量，**固化后中文没坏、且都是单段字面量**。
 *
 * 🔴🔴 **本脚本第一版自己犯了库里记过的那个坑**（值得留在这里当教材）：
 *    我用 `new RegExp('...=\\s*`([^`]*)`')` 去抓常量正文 ——
 *    而 `HANDOFF_UNTOUCHED_CLOSING` 里**本来就有转义反引号**（`` \`memj:spec\` ``）
 *    ⇒ `[^`]*` **在第一个转义反引号处就停了** ⇒ 只读到 49 字符（实际 143）。
 *    ⚠️ 危险的是它**没报错**：长度对不上但断言仍"通过"（只要中文数 > 0）。
 *    ⭐ 判据（库里既有）：**要读"这个项目自己的格式"时，先找项目有没有现成的解析器** ——
 *      自写正则必然重造一个半成品，而它在"读"这一侧就是**误判**。
 *    ✅ 现在改用项目自己的 `locateTemplateBody()` + `unescapeFromTemplate()`
 *      （就是"写回"用的那一对），⇒ **核对口径与固化口径同源**。
 *
 * 用法：node scripts/check-untouched-prompts.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)

const src = readFileSync(join(process.cwd(), 'src', 'reads.ts'), 'utf8')
const NAMES = [
  'SECTION_SPEC_HEAD',
  'SECTION_SPEC_CLOSING',
  'HANDOFF_UNTOUCHED_SECTIONS',
  'HANDOFF_UNTOUCHED_CLOSING',
  'SNAPSHOT_CLOSING',
]

let bad = 0
for (const n of NAMES) {
  // ⭐ 用**项目自己的定位器**（= 写回按钮用的那一套）
  const loc = mod.locateTemplateBody(src, n)
  if (loc === undefined) {
    console.log(`🔴 ${n.padEnd(28)} 定位不到单段字面量（写回按钮不会出现）`)
    bad += 1
    continue
  }
  const v = mod.unescapeFromTemplate(src.slice(loc.bodyStart, loc.bodyEnd), loc.quote)
  const cjk = (v.match(/[\u4e00-\u9fa5]/g) ?? []).length
  const mojibake = v.includes('??')
  // ⚠️ 判据要看**内容**，不只看"有没有中文"——一个被截断的前半段也有中文。
  const looksTruncated = !v.endsWith('：') && !v.endsWith('。') && !v.endsWith('）') && !v.endsWith('的节**')
  const ok = cjk > 0 && !mojibake && !looksTruncated
  if (!ok) bad += 1
  console.log(
    `${ok ? '✅' : '🔴'} ${n.padEnd(28)} 长度=${String(v.length).padEnd(4)} 中文=${String(cjk).padEnd(4)}` +
      `${mojibake ? ' 🔴含??' : ' 无??'}${looksTruncated ? ' 🔴疑似被截断（结尾不完整）' : ''}`,
  )
  console.log(`      ↳ 结尾：…${v.slice(-24)}`)
}
console.log(bad === 0 ? '\n✅ 全部正常（单段形态 + 中文完好 + 完整）' : `\n🔴 ${bad} 条有问题`)
process.exit(bad === 0 ? 0 : 1)
