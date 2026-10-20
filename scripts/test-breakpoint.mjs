/**
 * ⭐⭐⭐ **窄屏断点**（2026-10-20，用户裁定从 900 → 700）。
 *
 * ── 用户原话 ─────────────────────────────────────────────────────────────
 * *"我觉得现在 memj 的窄屏判定有点宽，现在是 900？看能不能改小一点呢？
 *   或者就能够判定是否是在手机端？或者看看现在主流手机的宽度？"*
 *
 * ── 为什么是 700（依据是量出来的，不是拍的）────────────────────────────
 * 主流手机的 **CSS 视口宽度**（不是物理分辨率）：
 *   iPhone 12/13/14/15 390 ｜ 14/15 Pro 393 ｜ 16 Pro 402 ｜ Pro Max 430
 *   Galaxy S22–S24 360 ｜ S24 Ultra 412 ｜ Pixel 6/7/8 412
 *   小米/红米/OPPO/vivo 主流 360–412
 *   ⇒ **手机全部落在 360–430**（没有一台超过 430）。
 * 平板竖屏：iPad mini 744 ｜ iPad 10.9 820 ｜ iPad Pro 11 834。
 *
 *   ⇒ 900 的毛病是**把平板竖屏也判成窄屏**（744–834 全中）。
 *   700 的好处：手机（≤430）全包、平板竖屏（≥744）放开成两栏，
 *   而**右侧栏 iframe（400–600）仍然走窄屏**（那是 memj 在侧栏里的正常形态）。
 *   ⚠️ 600–700 这段是刻意留的**缓冲带**：右侧栏被拖宽到 600+ 时不至于突然变两栏。
 *
 * ── 这个套件守什么 ───────────────────────────────────────────────────────
 * 🔴🔴 **本项目文档里明写着**：「`@media (max-width: 900px)` 与 JS 的 `isNarrow()`
 *   **是两个必须一致的数字，改一处要改两处**」。
 *   ⚠️ 漏一处的后果是**半坏状态**：CSS 认为是窄屏、JS 认为是宽屏
 *   ⇒ 表现为「栏滑出去了但按钮没生成」——这种状态**不报错**，只是看着怪。
 *   ⇒ 所以本套件最核心的断言是：**这两个数字必须相等**，
 *     并且**任何地方都不许再出现旧值**（注释也不行 —— 注释写错会误导后来人）。
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1
    return
  }
  fail += 1
  console.log(`  ❌ ${name}${detail === '' ? '' : ` —— ${detail}`}`)
}

const css = await readFile(join(root, 'src', 'web', 'style.css'), 'utf8')
const app = await readFile(join(root, 'src', 'web', 'app.js'), 'utf8')
const client = await readFile(join(root, 'src', 'client', 'index.tsx'), 'utf8')
const html = await readFile(join(root, 'src', 'web', 'index.html'), 'utf8')
const builtCss = await readFile(join(root, 'lib', 'web', 'style.css'), 'utf8')

/** 期望的断点值。改这里等于改契约 —— 会同时要求 CSS 与 JS 一起改。 */
const EXPECTED = 700

// ══════════════════════════════════════════════════════════════════════════
// 0. 🔴 最核心：CSS 与 JS 必须是同一个数字
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【0】CSS 与 JS 的断点必须一致（漏一处 = 半坏状态，且不报错）')

const cssNums = [...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map((m) => Number(m[1]))
const jsNums = [...app.matchAll(/max-width: (\d+)px/g)].map((m) => Number(m[1]))

check('⭐ CSS 里确实有 @media 断点', cssNums.length > 0, `${cssNums.length} 处`)
check('⭐ JS 里确实有 matchMedia 断点', jsNums.length > 0, `${jsNums.length} 处`)

const cssSet = [...new Set(cssNums)]
const jsSet = [...new Set(jsNums)]
check('⭐⭐⭐ CSS 的断点只有【一个】值（不是有的 900 有的 700）',
  cssSet.length === 1, `实际：${cssSet.join(', ')}`)
check('⭐⭐⭐ JS 的断点只有【一个】值',
  jsSet.length === 1, `实际：${jsSet.join(', ')}`)
check('⭐⭐⭐ CSS 与 JS 的断点【相等】（这是本项目写明的硬约束）',
  cssSet.length === 1 && jsSet.length === 1 && cssSet[0] === jsSet[0],
  `CSS=${cssSet.join(',')} vs JS=${jsSet.join(',')}`)

// 具体值（用户裁定 700）
check(`⭐⭐ 断点等于用户裁定的 ${EXPECTED}px`,
  cssSet.length === 1 && cssSet[0] === EXPECTED, `CSS=${cssSet.join(',')}`)

// ══════════════════════════════════════════════════════════════════════════
// 1. 旧值不许残留（**注释也算** —— 注释写错会误导后来人）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【1】旧值 900 不许有任何残留（含注释）')

const sources = [
  ['src/web/style.css', css],
  ['src/web/app.js', app],
  ['src/client/index.tsx', client],
  ['src/web/index.html', html],
]
for (const [name, text] of sources) {
  const hits = text.split('\n')
    .map((l, i) => [l, i + 1])
    .filter(([l]) => /\b900\b/.test(l))
  check(`⭐⭐ ${name} 里没有 900 残留`, hits.length === 0,
    hits.slice(0, 3).map(([l, n]) => `${n}: ${l.trim().slice(0, 60)}`).join(' / '))
}

// ══════════════════════════════════════════════════════════════════════════
// 2. 手机必须落在窄屏一侧（这是改断点的**全部目的**）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【2】主流手机宽度必须落在窄屏一侧')

/**
 * 主流手机的 CSS 视口宽度（业界公开数据；**不是物理分辨率**）。
 * ⚠️ 这份清单是"判据"，不是"装饰" —— 它是为什么选 700 而不是 500/600 的依据。
 */
const PHONES = [
  ['iPhone 12/13/14/15', 390],
  ['iPhone 14/15 Pro', 393],
  ['iPhone 16 Pro', 402],
  ['iPhone Pro Max', 430],
  ['iPhone SE / mini', 375],
  ['Galaxy S22–S24', 360],
  ['Galaxy S24 Ultra', 412],
  ['Pixel 6/7/8', 412],
]
for (const [name, w] of PHONES) {
  check(`⭐⭐ ${name}（${w}px）走窄屏`, w <= EXPECTED, `${w} > ${EXPECTED}`)
}

// ⭐ 最强的手机宽度是 430 —— 断点必须**大于它**，否则最大的手机会掉进两栏。
const MAX_PHONE = Math.max(...PHONES.map(([, w]) => w))
check(`⭐⭐⭐ 断点(${EXPECTED}) > 最大的手机宽度(${MAX_PHONE})`,
  EXPECTED > MAX_PHONE, `${EXPECTED} vs ${MAX_PHONE}`)

// ══════════════════════════════════════════════════════════════════════════
// 3. 平板竖屏必须落在宽屏一侧（用户嫌 900 太宽，就是为了这个）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【3】平板竖屏必须落在宽屏一侧（这是用户嫌 900 太宽的动机）')

const TABLETS = [
  ['iPad mini 竖屏', 744],
  ['iPad 10.9 竖屏', 820],
  ['iPad Pro 11 竖屏', 834],
]
for (const [name, w] of TABLETS) {
  check(`⭐⭐ ${name}（${w}px）走**宽屏**两栏`, w > EXPECTED, `${w} <= ${EXPECTED}`)
}

// ⚠️ 但要留缓冲：断点不能贴着平板的最小值（744），否则右侧栏被拖宽时会突然变两栏。
const MIN_TABLET = Math.min(...TABLETS.map(([, w]) => w))
check(`⭐⭐ 断点(${EXPECTED}) 与最小平板(${MIN_TABLET}) 之间留了 ≥40px 缓冲`,
  MIN_TABLET - EXPECTED >= 40, `只差 ${MIN_TABLET - EXPECTED}px`)

// ══════════════════════════════════════════════════════════════════════════
// 4. 右侧栏 iframe 仍应走窄屏（memj 在侧栏里的正常形态）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【4】右侧栏 iframe（窄容器）仍走窄屏')

// ⚠️ 侧栏宽度是 DSH 决定的，实际见过 400–600；断点必须**大于这个区间**。
for (const w of [400, 480, 560, 600]) {
  check(`⭐ 侧栏 ${w}px 仍走窄屏`, w <= EXPECTED, `${w} > ${EXPECTED}`)
}

// ══════════════════════════════════════════════════════════════════════════
// 5. 产物也要对（改完不构建 = 白改）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【5】构建产物同步')

const builtNums = [...builtCss.matchAll(/@media \(max-width: (\d+)px\)/g)].map((m) => Number(m[1]))
check('⭐⭐ lib/web/style.css 里的断点也是新值（改完必须 build）',
  builtNums.length > 0 && [...new Set(builtNums)].every((n) => n === EXPECTED),
  `实际：${[...new Set(builtNums)].join(', ')}`)

// ══════════════════════════════════════════════════════════════════════════
// 6. CSS 结构完好（搬断点容易留下多余的 `}`）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【6】CSS 结构完好（改媒体查询容易把块弄坏）')

const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
let depth = 0
let minDepth = 0
for (const ch of stripped) {
  if (ch === '{') depth += 1
  else if (ch === '}') { depth -= 1; minDepth = Math.min(minDepth, depth) }
}
check('⭐⭐ 括号平衡（最终深度 0）', depth === 0, `最终 ${depth}`)
check('⭐⭐ 没有提前闭合（最小深度 ≥ 0）', minDepth >= 0, `最小 ${minDepth}`)

// ⭐ 每个 @media 都必须在深度 0 进入
let d = 0
let badMedia = 0
for (const line of stripped.split('\n')) {
  if (/@media/.test(line) && d !== 0) badMedia += 1
  d += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length
}
check('⭐⭐ 每个 @media 都在深度 0 进入（嵌套错位会让后面整段变全局）',
  badMedia === 0, `${badMedia} 处`)

console.log(`\n═══ 窄屏断点：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
