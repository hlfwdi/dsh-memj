// 🔴🔴 **已解耦 —— 不参与 run-all-tests 回路**（2026-10-12，用户裁定）。
//
// ⚠️ **它现在会报"不一致"，而那是预期的**：解耦后 `src/protocol.ts` 是**源头**，
//    会随「提示词」设置页的写回而变动 ⇒ 与设计文档 §6 **必然逐渐漂开**。
//    ⇒ **不要因为本脚本报红就去改代码**：该报红是设计文档过时的信号，不是代码错。
//
// ⭐ **保留它的唯一用途**：确认"解耦已完成"，以及万一要回滚解耦时先看两边差多少。
//
// ── 以下为解耦前的原始定位（留档）────────────────────────────────
// 校验 protocol.ts 里的协议文本与 memj-design.md §6 的原文**逐字节相同**。
// 目的：§6 明写"section() 注入的实际文本"，抄错一个字符就是线上协议错。
//
// ⚠️ **直接从设计文档抽取**，不依赖任何手工中间文件——
// 先前版本读 `_proto_raw.txt`（人工抽取的临时文件），一旦它被清理，
// 校验就报 ENOENT 而**看起来像协议不一致**，是很容易误判的假失败。
import { readFileSync } from 'node:fs'

const DESIGN_DOC =
  process.env['MEMJ_DESIGN_DOC'] ?? 'D:\\dsh_test\\2026-09-02_13-51-19-115\\memj-design.md'

/** 从设计文档里抽出 §6「协议全文」那个 ```text 代码块的内容。 */
function extractProtocolFromDesign() {
  const md = readFileSync(DESIGN_DOC, 'utf8').replace(/\r\n/g, '\n')
  const lines = md.split('\n')
  // 定位 §6 标题。
  let i = lines.findIndex((l) => /^## 6\.\s*协议全文/.test(l))
  if (i === -1) throw new Error(`在 ${DESIGN_DOC} 里找不到「## 6. 协议全文」`)
  // 往下找 ```text 开栏。
  while (i < lines.length && !/^```text\s*$/.test(lines[i])) i += 1
  if (i >= lines.length) throw new Error('§6 之后找不到 ```text 开栏')
  const start = i + 1
  // 找收栏。
  let j = start
  while (j < lines.length && !/^```\s*$/.test(lines[j])) j += 1
  if (j >= lines.length) throw new Error('§6 的 ```text 围栏未闭合')
  return lines.slice(start, j).join('\n').trimEnd()
}

const src = readFileSync('src/protocol.ts', 'utf8')
const raw = extractProtocolFromDesign()

const start = src.indexOf('export const PROTOCOL_TEXT = `')
if (start === -1) {
  console.error('未找到 PROTOCOL_TEXT 起始标记')
  process.exit(1)
}
const bodyStart = start + 'export const PROTOCOL_TEXT = `'.length
// 结束标记：正文尾字符之后**紧跟**的裸反引号 + 换行（footer 以反引号开头）。
// 正文里的反引号一律转义成 \`（前面有反斜杠），所以 bodyStart 之后
// 第一个"反引号 + 换行"必然是模板的收尾。
const end = src.indexOf('`\n', bodyStart)
if (end === -1) {
  console.error('未找到 PROTOCOL_TEXT 结束标记')
  process.exit(1)
}
const literal = src.slice(bodyStart, end)

// 还原 TS 模板字面量的转义：\` -> ` ，\\ -> \
const rendered = literal.replace(/\\`/g, '`').replace(/\\\\/g, '\\')

console.log('生成文本长度 =', rendered.length)
console.log('设计原文长度 =', raw.length)
const same = rendered === raw
console.log('逐字节相同 =', same)

if (!same) {
  // 找出第一处差异，便于定位。
  const n = Math.min(rendered.length, raw.length)
  for (let i = 0; i < n; i += 1) {
    if (rendered[i] !== raw[i]) {
      console.error(`首处差异在第 ${i} 字符：`)
      console.error('  生成:', JSON.stringify(rendered.slice(Math.max(0, i - 40), i + 40)))
      console.error('  原文:', JSON.stringify(raw.slice(Math.max(0, i - 40), i + 40)))
      break
    }
  }
  if (rendered.length !== raw.length) {
    console.error('长度不同，可能是末尾空白差异')
    console.error('  生成尾部:', JSON.stringify(rendered.slice(-80)))
    console.error('  原文尾部:', JSON.stringify(raw.slice(-80)))
  }
  process.exit(1)
}
console.log('✅ 协议文本与设计文档 §6 一致')
