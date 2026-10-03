// 🔴🔴 **一次性迁移工具 —— 已解耦，不参与 run-all-tests 回路**（2026-10-12，用户裁定）。
//
// 用途：把 `memj-design.md` §4.2 各工具的 description 原文**逐字**抽出来，
// 重写成 `src/tool-descriptions.ts`。**只在"要从设计文档重新拉一次正文"时才手工跑**。
//
// ⚠️ **它会覆写 `src/tool-descriptions.ts`**（连头注释一起）⇒ 平时**不要跑**：
//   该文件现在是**源头**，直接改它即可。跑本脚本会丢掉那些直接修改。
//
// ⭐ **为什么解耦**：「提示词」设置页要有「把页面的修改写回源码」的能力——
//   只要生成链还在回路里，写回的代码就会被本脚本**静默覆盖**。
//   （与 `context.ts` 当初的解耦同一做法：`gen-context.mjs` 也不在回路里。）
//
// 用法：node scripts/gen-descriptions.mjs "<memj-design.md 路径>"
import { readFileSync, writeFileSync } from 'node:fs'

const md = readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n')
const lines = md.split('\n')

/** 取「从 marker 起、其后第一个 ``` 围栏块」的内容。 */
function blockAfter(marker, { nth = 1 } = {}) {
  let seen = 0
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes(marker)) continue
    seen += 1
    if (seen < nth) continue
    // 往下找开栏
    let j = i + 1
    while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) j += 1
    if (j >= lines.length) throw new Error(`marker「${marker}」之后没有开栏`)
    const start = j + 1
    let k = start
    while (k < lines.length && !/^\s*```\s*$/.test(lines[k])) k += 1
    if (k >= lines.length) throw new Error(`marker「${marker}」的围栏未闭合`)
    return lines.slice(start, k).join('\n')
  }
  throw new Error(`找不到 marker「${marker}」`)
}

// ⚠️ §4.2 里每个工具的 "**description 原文**：" 标记是唯一的定位依据。
const found = []
let idx = 0
for (let i = 0; i < lines.length; i += 1) {
  if (lines[i].includes('description 原文')) {
    idx += 1
    const start = i + 1
    let j = start
    while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) j += 1
    let k = j + 1
    while (k < lines.length && !/^\s*```\s*$/.test(lines[k])) k += 1
    found.push({ line: i + 1, text: lines.slice(j + 1, k).join('\n') })
  }
}

console.log(`共找到 ${found.length} 处 description 原文：`)
for (const f of found) {
  console.log(`  L${f.line}  ${f.text.length} 字符  首行: ${f.text.split('\n')[0].slice(0, 50)}`)
}

// ⚠️ 块是按**文档出现顺序**收集的，而 §4.2 里 memj_snapshots 插在 memj_read 之后、
//    memj_handoff 之前——所以这里**按行号排序**后与 names 一一对应，
//    并额外校验每块首行确实提到对应的工具名，避免错位。
found.sort((a, b) => a.line - b.line)

// 顺序应随 §4.2 的文档顺序：memj_info, memj_search, memj_read,
// memj_snapshots, memj_handoff, memj_promote, memj_update, memj_rebuild,
// memj_template, memj_normalize_tags, memj_score_turn
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
  // ⭐⭐⭐ 决策 177：轮末知识评分（由插件起子代理调；⚠️ 不是主会话模型自己调）。
  'memj_score_turn',
]
if (found.length !== names.length) {
  console.error(`⚠️ 预期 ${names.length} 处，实得 ${found.length} 处——需要人工核对`)
  process.exit(1)
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

const out = []
out.push(`/**
 * 各工具的 \`description\` 原文。
 *
 * 🔴🔴 **本文件是【源头】——直接改它，不需要动任何设计文档。**
 *   ⚠️ 它以前由 \`scripts/gen-descriptions.mjs\` 从 \`memj-design.md\` §4.2 生成，
 *     **现已解耦**（2026-10-12，用户裁定）：那条生成链**不在 \`run-all-tests\` 回路里**，
 *     也不会再重写本文件。生成器降级为**一次性迁移工具**（万一要从设计文档重拉一次正文）。
 *   ⭐ **为什么解耦**：「提示词」设置页要有「把页面的修改**写回源码**」这个能力——
 *     而只要生成链还在回路里，写回的代码就会被生成器**静默覆盖** ⇒ 写回等于白写。
 *     （与 \`context.ts\` 当初的解耦同一做法。）
 *   ⚠️ **代价（已知并接受）**：设计文档 §4.2 会**逐渐过时**，不再有逐字节校验。
 *     已在该节顶部加了「本节已不再与代码同步」的提示。
 *
 * ⚠️ **为什么这些文本要集中在一个文件**：它们是**每步都进上下文**的内容
 *   （wire \`tools\` 段），一旦漂移，模型看到的行为规范就与实现不符。
 *
 * @module dsh-memj/tool-descriptions
 */
`)
for (let i = 0; i < names.length; i += 1) {
  out.push(`/** \`${names[i]}\` 的 description 原文。 */`)
  out.push(`export const ${names[i].toUpperCase()}_DESCRIPTION = \`${esc(found[i].text)}\``)
  out.push('')
}
writeFileSync('src/tool-descriptions.ts', out.join('\n'), 'utf8')
console.log('\n已生成 src/tool-descriptions.ts')
