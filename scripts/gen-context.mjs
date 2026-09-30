// 生成器：把 memj-design.md §5.2 的「运行时上下文」各块转成 src/context.ts。
//
// 与 `gen-protocol.mjs` 同一思路：**逐字复制，避免手打漂移**。
// 设计文档 §5.2 明写这些文本是"移 `context()`"的成品，必须与方案 §11 一致。
//
// 用法：node scripts/gen-context.mjs <memj-design.md 路径>
import { readFileSync, writeFileSync } from 'node:fs'

const DESIGN_DOC = process.argv[2]
if (DESIGN_DOC === undefined || DESIGN_DOC === '') {
  throw new Error('用法：node scripts/gen-context.mjs <memj-design.md 路径>')
}
const md = readFileSync(DESIGN_DOC, 'utf8').replace(/\r\n/g, '\n')
const lines = md.split('\n')

// ── 定位 §5.2 ──
const start = lines.findIndex((l) => /^### 5\.2 /.test(l))
if (start === -1) throw new Error('找不到「### 5.2 运行时上下文」')
const end = lines.findIndex((l, i) => i > start && /^## 6\.\s*协议全文/.test(l))
if (end === -1) throw new Error('找不到 §5.2 的结束（## 6. 协议全文）')

// ── 按 `#### X. ` 切块，取每块下的 ```text 围栏 ──
/** @type {Array<{letter: string, text: string}>} */
const blocks = []
let cur = null
let inFence = false
let buf = []
for (let i = start; i < end; i += 1) {
  const line = lines[i]
  const m = /^#### ([A-M])\.\s/.exec(line)
  if (m !== null) {
    cur = { letter: m[1], text: '' }
    blocks.push(cur)
    continue
  }
  if (/^```/.test(line)) {
    if (!inFence) {
      inFence = true
      buf = []
    } else {
      inFence = false
      if (cur !== null) {
        if (cur.text !== '') throw new Error(`块 ${cur.letter} 有两个围栏`)
        cur.text = buf.join('\n')
      }
    }
    continue
  }
  if (inFence) buf.push(line)
}

const missing = blocks.filter((b) => b.text.trim() === '')
if (blocks.length === 0) throw new Error('§5.2 里没找到任何 `#### X.` 块')
if (missing.length > 0) {
  throw new Error(`这些块没有内容：${missing.map((b) => b.letter).join(', ')}`)
}

// ── 组装 ──
const joined = blocks.map((b) => b.text.trim()).join('\n\n')
const escaped = joined.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

const header = `/**
 * ⚠️ **本文件由 \`scripts/gen-context.mjs\` 从 \`memj-design.md\` §5.2 生成**——
 * 不要直接改本文件。要改内容，**先改设计文档 §5.2**，再重跑生成脚本。
 *
 * 这些文本走 \`ctx.systemPrompt.context()\`（**user 角色、尾部 append**）——
 * ⭐ 与协议（\`section()\`，node 0）不同：**改它不破前缀缓存**。
 *
 * 用途：承载"会经常改"的指导文本（触发条件 / 判断准则 / 写作要求 / 行为纪律）。
 * 契约（硬边界、"会被拒"的情形）**不在这里**——它们在工具 description 与协议里。
 *
 * ⚠️ \`context()\` 的成本（知识 940f3bfe 实测）：**同值不发**；
 * 但改了文本 ⇒ **append 一条新消息、旧的留在历史**直到 compaction
 * ⇒ **不要频繁改**。
 */

/** 注册用的稳定名（同一 scope 内重名会 throw）。 */
export const CONTEXT_NAME = 'memj:usage-guidance'

/**
 * ⭐ **排序值**（实测 \`dsh-system-prompt\` 的类型定义）：
 * \`CONTEXT_ORDERS\` 现有 \`SANDBOX_POLICY 110\` / \`APPROVAL_POLICY 115\` /
 * \`SUBAGENT_DELEGATION 120\`；而 \`context()\` 的 \`order\` 字段就是**普通数字**
 * （\`getContextOrder(name)\` 只是查表的便捷方法）⇒ 可用任意有限值。
 * memj 取 **125**：排在三个已知项之后，不与它们争位置。
 */
export const CONTEXT_ORDER = 125

`
const footer = `
/** 运行时上下文全文（逐字取自 \`memj-design.md\` §5.2）。 */
export const CONTEXT_TEXT = \`${escaped}\`
`

writeFileSync('src/context.ts', `${header}${footer}`, 'utf8')
console.log(`context.ts 已生成，${joined.length} 字符（${blocks.length} 块：${blocks.map((b) => b.letter).join('')}）`)
