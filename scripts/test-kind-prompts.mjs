#!/usr/bin/env node
/**
 * **知识类型 → 提示词** 的联动防线（决策 217）。
 *
 * ── 这个套件守什么 ────────────────────────────────────────────────────────
 * `kind` 从"编译期四值"变成"运行期可配"之后，模型看到的三处文本必须跟着变，
 * 否则会出现**同一个 schema 内部自相矛盾**（enum 有 `pitfall`、描述说"只能四个"）。
 *
 * ── 🔴🔴 最要紧的一条：**交给 DSH 的文本里不能有 `{{…}}`** ────────────────
 * 这是**真实事故**换来的：我用 `{{kindCatalog}}` 当插槽，而 `systemPrompt.context()`
 * 的文本会被 **DSH 自己再跑一遍 `interpolate()`**，它只认 `/^[a-z][a-z0-9_]*$/`
 * 且要求变量已在 DSH 注册 ⇒ **直接抛异常、整个会话装配失败**。
 * ⇒ 占位一律用 **HTML 注释标记**（DSH 不认，安全；且旧代码下只是"原样发出去"）。
 *
 * ⚠️ 但**范围要精确**：memj **自填**的通道（命令注入：`command:*` / `handoff:prompt-*` /
 *    `score:*`）里 `{{}}` 是**合法**的 —— 那套闸必须只管"交给 DSH"的那些。
 *    （第一版设成全局，当场误伤 `handoff:prompt-steps`，被 `check-prompt-specs` 抓到。）
 */
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const LIBDIR = process.env['MEMJ_LIBDIR'] ?? join(process.cwd(), 'lib')
const T = mkdtempSync(join(tmpdir(), 'memj-kindprompt-'))
for (const d of ['projects', 'entries', 'themes', 'prompts']) mkdirSync(join(T, d), { recursive: true })
process.env['MEMJ_DATA_DIR'] = T
const mod = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)

let pass = 0
let fail = 0
const check = (c, n, ex = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) } else { fail += 1; console.log(`  ❌ ${n}${ex ? '  ← ' + ex : ''}`) }
}
const MK_CAT = '<' + '!--memj:kind-catalog--' + '>'
const MK_LIST = '<' + '!--memj:kind-list--' + '>'
const readConst = (file, name) => {
  const src = readFileSync(join(process.cwd(), 'src', file), 'utf8')
  const m = new RegExp('export const ' + name + ' = `([\\s\\S]*?)`\\n').exec(src)
  return m?.[1] ?? ''
}
const CT = readConst('context.ts', 'CONTEXT_TEXT')
const HD = readConst('tool-descriptions.ts', 'MEMJ_HANDOFF_DESCRIPTION')
const PD = readConst('tool-descriptions.ts', 'MEMJ_PROMOTE_DESCRIPTION')

console.log('\n【1】🔴🔴 交给 DSH 的三段文本里**不许有 `{{…}}`**（否则会话装配会抛异常）')
{
  for (const [n, t] of [['context:memj:usage-guidance', CT], ['tool:memj_handoff:description', HD], ['tool:memj_promote:description', PD]]) {
    const hits = [...t.matchAll(/\{\{[^{}]*\}\}/g)].map((m) => m[0])
    check(hits.length === 0, `${n} 里 0 处 \`{{…}}\``, hits.slice(0, 3).join('、'))
  }
  // ⭐ 防线的**两条路**都要在：走设置页保存、以及直接调校验
  check(
    mod.validatePrompt('context:memj:usage-guidance', 'a\n{{kindCatalog}}\nb').some((s) => s.includes('{{')),
    '设置页保存这条路会拦下 `{{kindCatalog}}`',
  )
  // ⭐ 反向：memj 自填的通道里 `{{}}` **合法**（闸的范围必须精确）
  check(
    mod.validatePrompt('handoff:prompt-note', '内容是 {{userNote}} 结束').length === 0,
    '⭐ 反证：memj 自填的通道（命令注入）里 `{{}}` 仍合法 —— 闸不是全局的',
  )
}

console.log('\n【2】三段里各有一个**HTML 注释标记**（占位用它）')
{
  check(CT.includes(MK_CAT), 'context 有 kind-catalog 标记')
  check(HD.includes(MK_LIST), 'handoff 有 kind-list 标记')
  check(PD.includes(MK_LIST), 'promote 有 kind-list 标记')
  check(typeof mod.fillKindMarkers === 'function', 'fillKindMarkers() 已导出')
}

console.log('\n【3】标记能填掉（内置状态）')
{
  const c = mod.fillKindMarkers(CT)
  check(!c.includes(MK_CAT), 'context 的标记已替换')
  check(c.includes('是什么 + 出处/依据'), '填完含**骨架**（guide）')
  check(c.includes('陈述一个**可核实的结论**'), '填完含**判据**（when）')
  check(c.includes('`history` 不在上表'), 'history 的说明与表同段')
  const h = mod.fillKindMarkers(HD)
  check(!h.includes(MK_LIST), 'handoff 的标记已替换')
  check(h.includes('只能 fact / trap / howto / decision，或留空'), '填成四个可选值')
}

console.log('\n【4】⭐ 改类型 ⇒ 三段都跟着变（同一进程内，不用重启）')
{
  const defs = mod.builtinKindDefs()
  defs.find((d) => d.id === 'fact').when = '【改过的判据】'
  defs.find((d) => d.id === 'fact').guide = '【改过的骨架】'
  defs.push({ id: 'pitfall', label: 'pitfall', when: '【新类型】', guide: '【新骨架】', builtin: false, reserved: false })
  mod.setCurrentKindDefs(defs)
  const c = mod.fillKindMarkers(CT)
  const h = mod.fillKindMarkers(HD)
  const p = mod.fillKindMarkers(PD)
  check(c.includes('【改过的判据】'), 'context：改过的 when 出现')
  check(c.includes('【改过的骨架】'), 'context：改过的 guide 出现（骨架没丢）')
  check(c.includes('`pitfall`'), 'context：新类型出现')
  check(h.includes('pitfall') && p.includes('pitfall'), '两条工具描述都出现新类型')
  check(mod.selectableKindList(' / ').includes('pitfall'), '可选值清单也含新类型')

  // ⭐ 报错文案：含新类型、且**不含保留项**
  const errs = mod.checkEntryShape(
    { slug: 'a-b', title: '测试标题八个字', desc: '测试用；当测试时读它。', tags: ['t'], kind: '不存在', body: '### x\n内容' },
    'entries[0]',
  )
  const line = errs.find((e) => e.includes('kind')) ?? ''
  check(line.includes('pitfall'), '报错里含新类型（旧版读编译期表 ⇒ 不含）')
  check(!line.includes('history'), '⭐ 报错里**不含保留项**（旧版 `ENTRY_KINDS` 会把 history 列出来）')
}

console.log('\n【5】静态反证：不许再出现写死的四值')
{
  const all = CT + HD + PD
  check(!/fact\s*\/\s*trap\s*\/\s*howto/.test(all), '三段文本里没有写死的 `fact / trap / howto` 清单')
  check(!/\|\s*`fact`\s*\|\s*是什么/.test(CT), 'context 里没有写死的骨架表')
  const tools = readFileSync(join(process.cwd(), 'src', 'tools.ts'), 'utf8')
  check(!/只能是 fact\/trap\/howto\/decision/.test(tools), 'tools.ts 的报错文案不再是写死四值')
  check(/get: descOf/.test(tools), 'kindParam 的 description 用了 getter（每轮现算）')
}

console.log(`\n═══ 知识类型 → 提示词联动：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
