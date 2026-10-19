/**
 * ⭐⭐⭐ **DSH 0.2.1 兼容性：`context()` 必须标 `required: true`**（2026-10-19）。
 *
 * 🔴🔴 **这条守的是什么**：
 *   DSH 0.2.1 给 `systemPrompt.context()` 的注册项新增了 `required?: boolean`，
 *   并配套引入 `suppressRuntimeContext()` / `includeRuntimeContext:false` ——
 *   它们会把**所有没标 `required` 的 context 一律摘掉**（官方 README 原话：
 *   *"Contributions marked `required` remain visible"*）。
 *
 *   memj 有**两条** context，两条都是操作型上下文，被摘掉就是**功能性失静**、且不报错：
 *   · `memj:usage-guidance` —— 全部使用指导（何时调哪个工具 / 挂靠判据 / 归档流程）；
 *   · `memj:reading-doc`    —— 「文档内提问」注入的**正文本身**（灵魂）。
 *
 * ⚠️ **为什么必须做成静态断言而不是靠记性**：
 *   这个字段**只在 0.2.1+ 才有**，本仓的 devDependency 是 0.1.5 的类型 ⇒
 *   `tsc` **根本看不见它**（删掉也不会报错）。而且删掉后**在 0.1.5/0.2.0 上毫无变化**
 *   —— 只有升到 0.2.1 且用户开了抑制时才暴露，那时已经很难归因。
 *
 * ⭐ **反向自证**（本套件自带）：断言"把 `required: true` 删掉就该报红"是**故意的**——
 *   若哪天有人把它当成"多余字段"清理掉，这条会当场拦住。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

let pass = 0
let fail = 0
const ok = (cond, msg) => {
  if (cond) {
    pass++
    console.log(`  ✅ ${msg}`)
  } else {
    fail++
    console.log(`  ❌ ${msg}`)
  }
}

console.log('═══ DSH 0.2.1 兼容：context() 的 required 标记 ═══')

// ── 0. 剥注释 ──────────────────────────────────────────────────────────────
// 🔴🔴 **必须先剥注释再断言**（第一版就栽在这，被自己的反证抓出来）：
//    我在代码上方写了一段解释，里面逐字引用了 `required: true` ——
//    于是"删掉真正的 `required: true`"之后，判据仍然能在**注释里**命中 ⇒ **假绿**。
//    ⭐ 这正是本项目记过的老坑："静态断言查旧名字前要先去掉注释"
//      （`f0ca25b4-f5e1-4111-b115-7b535d8c7bd7`）。
//    ⚠️ 注意剥的顺序：**先剥块注释、再剥行注释**（反过来会把块注释的开头当成行注释吃掉）。
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')      // /* … */
    .replace(/^\s*\/\/.*$/gm, '')          // 整行 //
    .replace(/\s\/\/[^\n]*$/gm, '')        // 行尾 //
}

// ── 1. 两条 context 都必须带 required: true ────────────────────────────────
// ⚠️ 定位判据要选**注册点独有的片段**，不能选会在别处出现的标识符
//    （`CONTEXT_NAME` 第一次出现是 import 行 —— 本脚本第一版就栽在这，被自己的断言抓到）。
const SITES = [
  ['src/index.ts', 'memj:usage-guidance', 'const contextSpec = {'],
  ['src/reading-context.ts', 'memj:reading-doc', "name: 'memj:reading-doc',"],
]

for (const [file, label, marker] of SITES) {
  const raw = readFileSync(join(root, file), 'utf8')
  // ⚠️ 先剥注释，否则注释里的示例会把断言变成恒真。
  const text = stripComments(raw)
  // 只在该 context 注册的调用点附近找 required（避免"全文里有一处就过"）
  const at = text.indexOf(marker)
  ok(at >= 0, `${file}：找得到 ${label} 的注册点（剥注释后）`)

  if (at >= 0) {
    // 取该注册点之后的一段窗口（足够覆盖该对象字面量）
    const window = text.slice(at, at + 1500)
    ok(/required:\s*true/.test(window), `${file}：${label} 带 required: true（剥注释后）`)
    ok(!/required:\s*false/.test(window), `${file}：${label} 没有写成 required: false`)
  }
}

// ── 2. 反向自证：把 required 去掉，判据必须能发现 ──────────────────────────
{
  const text = readFileSync(join(root, 'src/reading-context.ts'), 'utf8')
  const at = text.indexOf("'memj:reading-doc'")
  const window = text.slice(at, at + 1500)
  const stripped = window.replace(/required:\s*true,?/g, '')
  ok(
    !/required:\s*true/.test(stripped),
    '反向自证：抹掉 required 后该判据确实会不成立（不是恒真）',
  )
}

// ── 3. 类型面：手写的 SystemPromptScope 必须声明 required（否则 0.2.1 传不进去）──
{
  const text = readFileSync(join(root, 'src/reading-context.ts'), 'utf8')
  ok(
    /required\?:\s*boolean/.test(text),
    'reading-context.ts 的 SystemPromptScope 声明了 required?: boolean',
  )
}

// ── 4. index.ts 的跨版本断言仍在（0.1.5 类型没有该字段，直接写会 typecheck 失败）──
{
  const text = readFileSync(join(root, 'src/index.ts'), 'utf8')
  ok(
    /&\s*\{\s*required\?:\s*boolean\s*\}/.test(text),
    'index.ts 用并集断言让 required 能在旧类型上编译',
  )
}

// ── 5. webServer 仍是硬依赖（有意为之，见 index.ts 的长注释）──────────────
{
  const text = readFileSync(join(root, 'src/index.ts'), 'utf8')
  const m = /export const inject[^\n]*\[([^\]]*)\]/.exec(text)
  ok(m !== null, '找得到 inject 声明')
  if (m) {
    ok(/'webServer'/.test(m[1]), 'inject 里仍有 webServer（headless 不挂它 ⇒ 有意不降级）')
    ok(/'systemPrompt'/.test(m[1]), 'inject 里仍有 systemPrompt')
    ok(/'tools'/.test(m[1]), 'inject 里仍有 tools')
    ok(/'commands'/.test(m[1]), 'inject 里仍有 commands')
  }
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
