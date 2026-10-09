// 🔴🔴 **一次性迁移工具 —— 已解耦，不参与 run-all-tests 回路**（2026-10-12，用户裁定）。
//
// 用途：把 `memj-design.md` §6 的协议全文**逐字**抽出来，重写成 `src/protocol.ts`。
// **只在"要从设计文档重新拉一次正文"时才手工跑**。
//
// ⚠️ **它会覆写 `src/protocol.ts`**（连头注释一起）⇒ 平时**不要跑**：
//   该文件现在是**源头**，直接改它即可（或从【提示词】设置页写回）。跑本脚本会丢掉那些修改。
//
// ⭐ **为什么解耦**：「提示词」设置页要有「把页面的修改写回源码」的能力——
//   只要生成链还在回路里，写回的代码就会被本脚本**静默覆盖**。
// 目的：**逐字复制，避免手打漂移**（§6 明写"section() 注入的实际文本"）。
//
// ⚠️ **直接从设计文档抽取**，不依赖手工中间文件（同 check-protocol.mjs）。
import { readFileSync, writeFileSync } from 'node:fs'
import { designDocPath, requirePath } from './shared/lab-paths.mjs'

// ⚠️ **不写死本机路径**（2026-10-09 为公开发布清理，见 `shared/lab-paths.mjs`）。
const DESIGN_DOC = requirePath(
  process.env['MEMJ_DESIGN_DOC'] ?? designDocPath(),
  '设计文档 memj-design.md（§6 协议全文）',
  'MEMJ_DESIGN_DOC=<路径> node scripts/gen-protocol.mjs',
)

/** 从设计文档里抽出 §6「协议全文」那个 ```text 代码块的内容。 */
function extractProtocolFromDesign() {
  const md = readFileSync(DESIGN_DOC, 'utf8').replace(/\r\n/g, '\n')
  const lines = md.split('\n')
  let i = lines.findIndex((l) => /^## 6\.\s*协议全文/.test(l))
  if (i === -1) throw new Error(`在 ${DESIGN_DOC} 里找不到「## 6. 协议全文」`)
  while (i < lines.length && !/^```text\s*$/.test(lines[i])) i += 1
  if (i >= lines.length) throw new Error('§6 之后找不到 ```text 开栏')
  const start = i + 1
  let j = start
  while (j < lines.length && !/^```\s*$/.test(lines[j])) j += 1
  if (j >= lines.length) throw new Error('§6 的 ```text 围栏未闭合')
  return lines.slice(start, j).join('\n').trimEnd()
}

const raw = extractProtocolFromDesign()

// 模板字面量里只需转义反斜杠与反引号（无 ${ 已核）。
const escaped = raw.replace(/\\/g, '\\\\').replace(/`/g, '\\`')

const header = `/**
 * §6 协议全文——\`systemPrompt.section()\` 注入的**实际文本**。
 *
 * 🔴🔴 **本文件的文本必须逐字节恒定。**
 *
 * 已核实（\`dsh-plugin-knowledge.md\` §3.1）：
 *  - \`section()\` 的 provider **每次 assembly 都会被调用**，但下游**按内容字符串比较**收口
 *    （\`dsh-agent-loop/lib/index.js:276,279\`）⇒ 返回相同字符串 = 空提交 = 无事件；
 *  - 但本机路由（\`dsh-llm-pi-ai\`）**未声明 \`systemPromptUpdate\`**
 *    ⇒ 走**头部重写模式**：文本一变 ⇒ 重写 node 0 ⇒ **从第一个 token 起全前缀缓存失效**。
 *
 * ⇒ **绝不把"库里已有 N 条""本次依据 M 条快照"这类运行时数字写进本文本。**
 *   需要动态数字时走工具返回值。
 *
 * 🔴🔴 **本文件是【源头】——直接改它，不需要动任何设计文档。**
 *   ⚠️ 它以前由 \`scripts/gen-protocol.mjs\` 从 \`memj-design.md\` §6 生成，
 *     **现已解耦**（2026-10-12，用户裁定）：那条生成链**不在 \`run-all-tests\` 回路里**，
 *     也不会再重写本文件。生成器降级为**一次性迁移工具**。
 *   ⭐ **为什么解耦**：「提示词」设置页要有「把页面的修改**写回源码**」这个能力，
 *     而只要生成链还在回路里，写回的代码就会被生成器**静默覆盖**。
 *   ⚠️ **代价（已知并接受）**：设计文档 §6 会**逐渐过时**，不再有逐字节校验；
 *     已在该节顶部加了「本节已不再与代码同步」的提示。
 *
 * @module dsh-memj/protocol
 */

/**
 * 协议正文（恒定）。
 *
 * 内容结构：**何时查**（检索三步 + 两处必查）→ **何时写**（项目判据 + 归属两块）
 * → **推进归属**（累加不是搬家）→ **边界**。
 */
export const PROTOCOL_TEXT = \``

const footer = `\`

/**
 * 协议在系统提示里的 order。
 *
 * 取 \`3000\`：排在全部工具指引（官方最大 \`TOOL_REPORT = 2900\`）之后、
 * \`TOOLS_SDK = 5000\` 之前——即在"工具怎么用"之后给出"记忆怎么写"。
 * 与旧 \`dsh-memory\` 保持同一位置，便于对照。
 */
export const PROTOCOL_SECTION_ORDER = 3000

/**
 * 取当前协议文本。
 * @returns 恒定不变的协议字符串。
 */
export function protocolText(): string {
  return PROTOCOL_TEXT
}
`

// ⚠️ **不要在这里插入任何换行**：header 以反引号（模板起始）结尾、
// footer 以反引号（模板结束）开头，中间必须**恰好**是协议正文本身，
// 否则首个字符就会多一个 `\n`、尾字符多一个 `\n`，与设计文档 §6 不符。
writeFileSync('src/protocol.ts', `${header}${escaped}${footer}`, 'utf8')
console.log(`protocol.ts 已生成，协议 ${raw.length} 字符`)
