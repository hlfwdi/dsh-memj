// ⭐⭐⭐ 提示词账本一致性（测试套件入口）——**两项检查**。
//
// ── 检查 ①：工具名集合（`tools.ts` 实际注册 vs `prompts.ts` 的 `TOOL_META`）──
//   🔴 事故（2026-10-12）：决策 205 加了第 11 个工具 `memj_template`，却漏了登记
//   `TOOL_META` ⇒ **它整条不在【提示词】页上**（看不到 / 改不了 /
//   `/api/prompt?key=…` 直接 404），而**运行时一切正常** ⇒ 没有任何机制会报。
//   ⭐ 判据：同一个事实被两条路各自维护时，**必须有机械校验**。
//
// ── 检查 ②：可编辑但缺 `sourceConst`（2026-10-12 新增，同一天的第二次事故）──
//   🔴 事故：写回功能上线后，`section:memj:protocol` / `context:memj:usage-guidance`
//   两条**手工定义**的 spec 漏了 `sourceConst` ⇒ 它们的「写回源码」按钮**永不出现**，
//   而页面上看不出任何异常（**用户靠肉眼发现的**）。
//   ⭐ 为什么检查 ① 抓不住它：① 只比"**有没有这个工具**"，不比"**每条是否完整**"
//     ⇒ 两条检查**互补**，都要有。
//
// ⚠️ 解析逻辑在 `shared/prompt-ledger.mjs`（与 `build.mjs` 共用**同一份实现**）。
//   🔴 **别放 `scripts/lib/`**：`.gitignore` 的 `lib/` 规则会把该目录整个吞掉
//      （实测踩到：文件在盘上、构建能用，但**不进版本库**）。
//
// 用法：node scripts/check-prompt-specs.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  auditPromptLedger,
  auditEditableWithoutSourceConst,
  renderLedgerReport,
} from './shared/prompt-ledger.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
const check = (ok, label, extra = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${extra !== '' ? '\n     ' + extra : ''}`)
  if (!ok) failed += 1
}

// ── 检查 ①：工具名集合 ──
console.log('=== ① 工具名集合（注册 vs 页面账本）===')
const audit = auditPromptLedger(root)
console.log(renderLedgerReport(audit))
if (!audit.ok) failed += 1

// ── 检查 ②：可编辑 ⇒ 必须可写回（或有显式例外）──
//
// ⚠️ 必须走 `lib/`：`sourceConst` 由 `TOOL_META.flatMap` / `CMD_META.map` 在**运行时**生成，
//    静态扫源码看不出来。
// 🔴 **必须设隔离库根**（`apply()` 会 `ensureLibraryDirs()` + 写 `.startup-diag.txt`）
//    ⇒ 不设就**落到生产库**（本项目已有脚本踩过）。
console.log('\n=== ② 可编辑条目是否都登记了 sourceConst ===')
const lib = mkdtempSync(join(tmpdir(), 'memj-specs-'))
process.env['MEMJ_DATA_DIR'] = lib
try {
  // ⚠️ **必须用相对说明符**：Windows 上 ESM 会把裸绝对路径（`D:\...`）当成
  //    URL scheme 而报 `ERR_UNSUPPORTED_ESM_URL_SCHEME`（本脚本踩过一次）。
  const mod = await import('../lib/index.js')
  const injected = []
  const logger = { info() {}, warn() {}, error() {} }
  const mkCtx = (extra = {}) => ({
    logger, get: () => undefined, on: () => () => {},
    effect(fn) { try { fn() } catch { /* 忽略 */ } return () => {} },
    inject(deps, cb) { injected.push(cb) },
    ...extra,
  })
  mod.apply(mkCtx(), mod.DEFAULT_CONFIG)
  for (const cb of injected) {
    try {
      cb(mkCtx({
        systemPrompt: {
          section: () => () => {},
          context: () => () => {},
          tools: () => () => {},
          getSectionOrder: () => 1,
          getContextOrder: () => 1,
        },
        tools: { register: () => () => {} },
        commands: { register: () => () => {} },
      }))
    } catch { /* 忽略：只要能拿到 PROMPT_SPECS */ }
  }

  const specs = mod.PROMPT_SPECS ?? []
  const editable = specs.filter((s) => s.editable === true)
  check(editable.length > 0, `拿到 PROMPT_SPECS（可编辑 ${editable.length} 条；非空 ⇒ 这条检查是活的）`)

  const missing = auditEditableWithoutSourceConst(specs)
  check(
    missing.length === 0,
    missing.length === 0
      ? '每个**可编辑**条目都有 `sourceConst`（⇒ 写回按钮会出现）'
      : '🔴 这些**可编辑但没登记 sourceConst** ⇒ 它们的「写回源码」按钮永不出现：\n     ' +
        missing.join('、') +
        '\n     ⇒ 修法：在 `src/prompts.ts` 对应 spec 补 `sourceConst: \'<常量名>\'`。\n' +
        '     ⚠️ 若是**有意的例外**（如参数化模板无法整体替换），要在注释里显式说明。',
  )

  // ── 检查 ③：带 `slots` 的条目，其**默认模板必须通过自己的校验**（2026-10-12 新增）──
  //
  // 🔴 **为什么必须有**：`slots` 校验是**双向**的（缺一个拒、多一个也拒）。若某条的
  //    **默认模板本身**就不满足它自己的规则，那么用户点「恢复默认」时——
  //      · 页面上那条会**一直显示"已改"**（覆盖值 == 默认值但校验不过）；
  //      · 更糟的是**没法把它改回默认**（默认值存不进去）。
  //    ⭐ 判据：**"默认值必须满足默认值自己的校验"** —— 这是自洽性，不是偏好。
  console.log('\n=== ③ 带 slots 的默认模板是否自洽 ===')
  const withSlots = specs.filter((s) => (s.checks ?? []).some((c) => c.kind === 'slots'))
  check(withSlots.length > 0, `找到 ${withSlots.length} 条带 slots 校验的条目（非零 ⇒ 这条检查是活的）`)
  const bad = []
  for (const s of withSlots) {
    const def = mod.promptDefault(s.key)
    if (def === undefined) { bad.push(`${s.key}（未登记默认值）`); continue }
    const errs = mod.validatePrompt(s.key, def)
    if (errs.length > 0) bad.push(`${s.key}：${errs.join(' / ')}`)
  }
  check(
    bad.length === 0,
    bad.length === 0
      ? '每条带 slots 的默认模板都通过自己的校验'
      : '🔴 这些条的**默认模板自己不满足自己的 slots 规则** ⇒ 「恢复默认」会存不进去：\n     ' +
        bad.join('\n     '),
  )

  // ── 检查 ④：**目录覆盖双向一致**（2026-10-12 新增）──
  //
  // 🔴🔴 **为什么必须有**：2026-10-12 的重构把「人读文案」（分区/用途/归属）
  //   从 `prompts.ts` 搬到了 `prompt-catalog.ts`。搬完之后就出现了**新的漂移风险**：
  //     · 加了一条 spec 却忘了写目录条目 ⇒ 页面显示「（未登记说明）」；
  //     · 目录里留了一条已经不存在的 spec ⇒ 页面少一条、**而没有任何机制会报**。
  //   ⭐ 判据同本项目一贯：**同一事实被两条路各自维护 ⇒ 必须各配一条能报红的检查**。
  //   （这正是本批之前踩过三次的形态：TOOL_META / sourceConst / registerPromptDefault。）
  console.log('\n=== ④ 目录覆盖是否双向一致 ===')
  const specKeys = new Set(specs.map((s) => s.key))
  const noCatalog = specs.filter((s) => mod.catalogOf(s.key) === undefined).map((s) => s.key)
  const orphan = Object.keys(mod.PROMPT_CATALOG).filter((k) => !specKeys.has(k))
  check(
    noCatalog.length === 0,
    noCatalog.length === 0
      ? `每条 spec 都有目录条目（共 ${specKeys.size} 条）`
      : '🔴 这些 spec **没有目录条目** ⇒ 页面上会显示「（未登记说明）」：\n     ' +
        noCatalog.join('、') +
        '\n     ⇒ 修法：在 `src/prompt-catalog.ts` 的 `PROMPT_CATALOG` 补一条。',
  )
  check(
    orphan.length === 0,
    orphan.length === 0
      ? '目录里没有多余的 key（没有指向已删除的 spec）'
      : '🔴 这些**目录条目指向不存在的 spec**（多半是删 spec 时忘删说明）：\n     ' +
        orphan.join('、'),
  )
  // 顺带：分组 id 必须是受控的十个之一（防止手写错组名导致前端分组消失）
  const badGroup = specs.filter((s) => mod.PROMPT_GROUPS[s.zone] === undefined).map((s) => `${s.key}（zone=${String(s.zone)}）`)
  check(
    badGroup.length === 0,
    badGroup.length === 0
      ? '每条的分组 id 都在受控词表里'
      : '🔴 这些条目的分组 id 不在 `PROMPT_GROUPS` 里 ⇒ 前端会漏渲染：\n     ' + badGroup.join('、'),
  )
} catch (err) {
  check(false, '能加载 lib/index.js 取 PROMPT_SPECS', err instanceof Error ? err.message : String(err))
} finally {
  try { rmSync(lib, { recursive: true, force: true }) } catch { /* 忽略 */ }
}

console.log(failed === 0 ? '\n✅ 通过' : `\n❌ 失败 ${failed} 项`)
process.exit(failed === 0 ? 0 : 1)
