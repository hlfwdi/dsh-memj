// 🔴🔴 **已解耦 —— 不参与 run-all-tests 回路**（2026-10-12，用户裁定）。
//
// ⚠️ **它现在会报"不一致"，而那是预期的**：解耦后 `src/tool-descriptions.ts` 是
//    **源头**，会随「提示词」设置页的写回而变动 ⇒ 与设计文档 §4.2 **必然逐渐漂开**。
//    ⇒ **不要因为本脚本报红就去改代码**：该报红是设计文档过时的信号，不是代码错。
//
// ⭐ **保留它的唯一用途**：确认"解耦已完成"（即代码确实已不再与设计文档同步）。
//    以及万一要回滚解耦（重新从设计文档生成），它能先告诉你两边差多少。
//
// ── 以下为解耦前的原始定位（留档，说明它当初为什么存在）──────────────
// 校验 src/tool-descriptions.ts 里的**工具级 description** 与 memj-design.md §4.2
// 的「description 原文」块**逐字节相同**。
//
// ⚠️ **为什么当初要有这个文件**：`gen-descriptions.mjs` 的注释里一直写着
//    "见 scripts/check-descriptions.mjs"，但**这个文件从未存在过**——
//    也就是说：协议有 `check-protocol.mjs` 守着，而**工具描述没有**。
//    ⇒ 设计文档改了、忘了重跑生成器，**没有任何机制会报**。
//    （这正是"记在文档/注释里不构成防线"那条教训的又一实例。）
//
// 🔴 **判据口径（关键）**：**故意复用 `gen-descriptions.mjs` 的抽取函数**，
//    不另写一套。理由：实测教训——我另写的三个探针用 `indexOf('`\n')` 找模板收尾，
//    遇到文本内部的转义反引号 `\`` 会**截断错位**，于是报出"7 处不一致"的**假漂移**；
//    而用生成器自己的逻辑重跑，产物**零改动**（真相是全部一致）。
//    ⇒ **校验必须与生成用同一条路径**，否则校验本身成为新的错误源。
//
// 用法：node scripts/check-descriptions.mjs [设计文档路径]
import { readFileSync } from 'node:fs'

const DESIGN_DOC =
  process.argv[2] ??
  process.env['MEMJ_DESIGN_DOC'] ??
  'D:\\dsh_test\\2026-09-02_13-51-19-115\\memj-design.md'

// ══════════════════════════════════════════════════════════════════════
// ① 抽取：与 gen-descriptions.mjs **逐行同源**
// ══════════════════════════════════════════════════════════════════════
const md = readFileSync(DESIGN_DOC, 'utf8').replace(/\r\n/g, '\n')
const lines = md.split('\n')

const found = []
for (let i = 0; i < lines.length; i += 1) {
  if (lines[i].includes('description 原文')) {
    const start = i + 1
    let j = start
    while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) j += 1
    let k = j + 1
    while (k < lines.length && !/^\s*```\s*$/.test(lines[k])) k += 1
    found.push({ line: i + 1, text: lines.slice(j + 1, k).join('\n') })
  }
}
// 与生成器一致：按行号排序
found.sort((a, b) => a.line - b.line)

const names = [
  'memj_info',
  'memj_search',
  'memj_read',
  'memj_snapshots',
  'memj_handoff',
  'memj_promote',
  'memj_update',
  'memj_rebuild',
  // ⭐⭐⭐ 决策 205：交接文档模板（管理模板：list/create/delete；两段式确认）。
  'memj_template',
  // ⭐ 决策 162：标签规范化（独立工具，与沉淀解耦）。
  'memj_normalize_tags',
  // ⭐⭐⭐ 决策 177：轮末知识评分（由插件起子代理调）。
  'memj_score_turn',
]

if (found.length !== names.length) {
  console.error(`⚠️ 预期 ${names.length} 处 description 原文，实得 ${found.length} 处`)
  process.exit(1)
}

// ══════════════════════════════════════════════════════════════════════
// ② 比对：**用生成器的输出口径**，而不是自己解析 TS 字面量
// ══════════════════════════════════════════════════════════════════════
//
// ⭐ **做法**：把"生成器此刻会写出的文件内容"**在内存里重算一遍**，
//    与磁盘上的 `src/tool-descriptions.ts` 逐字节比对。
//    ⇒ 这样连"文件头注释被手改"都能抓到，且**不存在第二套解析逻辑**。
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

const out = []
out.push(`/**
 * §4.2 各工具的 \`description\` 原文（**逐字取自 \`memj-design.md\`**）。
 *
 * ⚠️ **为什么单独成文件而不是硬编码在 tools.ts 里**：
 * 这些文本是设计文档明确规定的"工具定义提示词"，且 §5 总表把它们列为
 * **每步都进上下文**的内容——一旦漂移，模型看到的行为规范就与设计不符。
 * 集中在此便于与设计文档做**逐字节比对**（见 \`scripts/check-descriptions.mjs\`）。
 *
 * 🔴 修改流程：**先改 \`memj-design.md\` §4.2，再重跑生成脚本**，不要直接改本文件。
 *
 * @module dsh-memj/tool-descriptions
 */
`)
for (let i = 0; i < names.length; i += 1) {
  out.push(`/** \`${names[i]}\` 的 description 原文。 */`)
  out.push(`export const ${names[i].toUpperCase()}_DESCRIPTION = \`${esc(found[i].text)}\``)
  out.push('')
}
const expected = out.join('\n')
const actual = readFileSync('src/tool-descriptions.ts', 'utf8')

console.log(`设计文档：${DESIGN_DOC}`)
console.log(`抽取到 ${found.length} 处 description 原文，长度：`)
for (let i = 0; i < names.length; i += 1) {
  console.log(`  ${names[i].padEnd(16)} ${String(found[i].text.length).padStart(5)} 字符`)
}

if (actual === expected) {
  console.log(`\n✅ tool-descriptions.ts 与设计文档 §4.2 逐字节相同（${expected.length} 字符）`)
  process.exit(0)
}

// 不一致 ⇒ 定位首处差异
console.error('\n❌ tool-descriptions.ts 与设计文档 §4.2 不一致！')
console.error('   ⇒ 多半是：改了 §4.2 但**忘了重跑** `node scripts/gen-descriptions.mjs`。')
const n = Math.min(actual.length, expected.length)
let shown = false
for (let i = 0; i < n; i += 1) {
  if (actual[i] !== expected[i]) {
    console.error(`\n   首处差异在第 ${i} 字符：`)
    console.error('     磁盘:', JSON.stringify(actual.slice(Math.max(0, i - 60), i + 60)))
    console.error('     期望:', JSON.stringify(expected.slice(Math.max(0, i - 60), i + 60)))
    shown = true
    break
  }
}
if (!shown) {
  console.error(`\n   前缀相同，长度不同：磁盘 ${actual.length} / 期望 ${expected.length}`)
  console.error('     磁盘尾部:', JSON.stringify(actual.slice(-100)))
  console.error('     期望尾部:', JSON.stringify(expected.slice(-100)))
}
// ⭐ 逐工具给结论，便于知道"是哪几个工具漂了"。
//
// 🔴 **不能用 `indexOf('`\n')` 截断**——这是本脚本第一版的 bug（反证时暴露）：
//    正文里含**转义反引号** `\`` 时，用它找"收尾反引号"会**提前截断**，
//    于是"漂移的那条"反而报长度相同。⭐ 与项目里那三个坏探针是同一个 bug。
//    ⇒ 改为**按常量名切段**：从本常量的 marker 起、到**下一个** marker 为止
//    （最后一个取到文件尾）。这样与内容无关，不会被转义字符骗到。
const markerOf = (n2) => `export const ${n2.toUpperCase()}_DESCRIPTION = \``
const segOf = (text, i) => {
  const start = text.indexOf(markerOf(names[i]))
  if (start === -1) return null
  const next = i + 1 < names.length ? text.indexOf(markerOf(names[i + 1])) : text.length
  return text.slice(start, next === -1 ? text.length : next)
}
console.error('\n   逐工具比对（按常量名切段，不受转义反引号影响）：')
let firstBad = null
for (let i = 0; i < names.length; i += 1) {
  const sa = segOf(actual, i)
  const sb = segOf(expected, i)
  if (sa === null) { console.error(`     ❌ ${names[i]}：磁盘上找不到该常量`); continue }
  const same = sa === sb
  if (!same && firstBad === null) firstBad = names[i]
  console.error(`     ${same ? '✅' : '❌'} ${names[i].padEnd(16)} 磁盘段 ${sa.length} / 期望段 ${sb.length}`)
}
// 🔴 **最后一行的质量很重要**：`run-all-tests.mjs` 在失败时把**最后一行非空输出**
//    当作 summary 展示 ⇒ 若最后一行是"✅ memj_rebuild 一致"，人看到的会是
//    "❌ 描述一致性  ✅ memj_rebuild 磁盘段 499 / 期望段 499"——**完全看不出哪条漂了**。
//    ⇒ 结尾**显式点出**漂移的工具名与修法。
console.error(
  `\n❌ 不一致的工具：${firstBad ?? '(见上)'}` +
  `　⇒ 修法：\`node scripts/gen-descriptions.mjs "<设计文档路径>"\` 后重新提交。`,
)
process.exit(1)
