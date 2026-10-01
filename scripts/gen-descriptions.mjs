// 从 memj-design.md 抽取 §4.2 各工具的 description 原文，生成 tool-descriptions.ts。
// 目的：**逐字复制**，避免手打漂移（设计文档明写这些就是工具 description 的原文）。
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
writeFileSync('src/tool-descriptions.ts', out.join('\n'), 'utf8')
console.log('\n已生成 src/tool-descriptions.ts')
