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
import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
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
/**
 * 从源码里取出一个**模板串常量**的正文。
 *
 * 🔴🔴 **必须还原写入端的转义**（2026-10-09 修）：
 *   原来这里是 `` = `([\s\S]*?)`\n `` —— **非贪婪**，遇到**第一个反引号**就停。
 *    那个写法在"正文里没有反引号"时看着是对的；
 *    ⚠️ 而模板串里的**行内代码反引号是转义成 `\`` 的** ⇒ 正文里一出现行内代码，
 *    正则会**在第一个 `\`` 处截断**（实测：抓到 4525 / 实际 8843 字符），
 *    且**不报错** —— 于是"标记不在""骨架丢了"这类**假红**成片出现。
 *    ⭐ 判据（本项目既有）：**要读"这个项目自己的格式"时，用项目自己的解析器** ——
 *    这里就是 `prompt-writeback.ts` 的 `locateTemplateBody()` + `unescapeFromTemplate()`
 *    （**与写回同源**，写入端怎么转义，读侧就怎么还原）。
 * @param file - `src/` 下的文件名。
 * @param name - 常量名。
 * @returns 常量正文（**未转义的**）；取不到时回空串。
 */
const readConst = (file, name) => {
  const src = readFileSync(join(process.cwd(), 'src', file), 'utf8')
  const loc = mod.locateTemplateBody(src, name)
  if (loc === undefined) return ''
  // ⚠️ `locateTemplateBody` 回的是**字符偏移**（`bodyStart`/`bodyEnd`），**不是行号**
  //    —— 第一版我按行切，切出空串（三个常量全读不到 ⇒ 12 条假红）。
  //    ⭐ 判据：**用别人的定位器前先确认它的下标是"行"还是"字符"**（看它怎么算的就知道了）。
  const body = src.slice(loc.bodyStart, loc.bodyEnd)
  return mod.unescapeFromTemplate(body, loc.quote)
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
  // 🔴 **决策 223：`history` 现在**在表里**（它开放给模型了）⇒ 旧的"不在上表"说明已删。
  //    ⭐ 取而代之：表里那行 + 表后那句"它是留档不是知识、**不参与检索**"。
  check(!c.includes('`history` 不在上表'), '⭐ 旧的"不在上表"说明已删除（它现在就在表里）')
  check(c.includes('`history`'), '⭐ 但 `history` 仍出现在目录里（有它自己的判据与写法）')
  check(c.includes('不参与检索'), '⭐⭐ 且**明写"不参与检索"** —— 这是 `reserved` 曾经的职责，改由文案承担')
  const h = mod.fillKindMarkers(HD)
  check(!h.includes(MK_LIST), 'handoff 的标记已替换')
  check(h.includes('fact / trap / howto / decision / history'), '填成**五个**可选值（决策 223 加了 history）',
    (h.match(/fact[^\n]{0,60}/) ?? [''])[0])
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
  // 🔴 **决策 223：报错里现在**应当**包含 `history`** —— 它已是合法可选项。
  //    （旧版断言的是"不含保留项"，那个概念已不存在。）
  check(line.includes('history'), '⭐⭐ 报错里**含 `history`**（它现在给模型选，是合法值）')
}

console.log('\n【5】静态反证：不许再出现写死的四值')
{
  const all = CT + HD + PD
  check(!/fact\s*\/\s*trap\s*\/\s*howto/.test(all), '三段文本里没有写死的 `fact / trap / howto` 清单')
  check(!/\|\s*`fact`\s*\|\s*是什么/.test(CT), 'context 里没有写死的骨架表')

  /**
   * 🔴🔴 **范围必须扫【全部源码】，不能只扫记得住的那几个文件**（决策 217 补）。
   *
   * ⚠️ **我第一版就写成了 `readFileSync('src/tools.ts')`** —— 而**同一批我在 `handoff.ts`
   *    修掉了同款错误、却漏了 `parse.ts`**（那里的 `ENTRY_KINDS.join()` 一直没被发现）。
   *    ⭐ 这条防线**当时是绿的**，因为**它根本没看那个文件** ——
   *      正是库里 `5f063b9b`「**校验范围过窄会比"漏检"更糟：它报绿**」讲的形态。
   * ⭐ 判据：**静态扫源码时，作用域要覆盖"这类错误可能出现的地方"，而不是"我这次改的地方"。**
   */
  const srcDir = join(process.cwd(), 'src')
  const files = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) { if (e.name !== 'web') walk(p) } else if (e.name.endsWith('.ts')) files.push(p)
    }
  }
  walk(srcDir)
  check(files.length >= 15, `扫到 ${files.length} 个 .ts 文件（作用域够宽）`)

  /** 写死四值的各种形态（斜杠 / 顿号 / 竖线分隔都算）。 */
  const HARDCODED = [
    /fact\s*\/\s*trap\s*\/\s*howto/,
    /fact\s*、\s*trap\s*、\s*howto/,
    /'fact'[\s\S]{0,40}'trap'[\s\S]{0,40}'howto'/,
    /ENUM_OF_KINDS|ENTRY_KINDS\.join/,
  ]
  const hits = []
  for (const f of files) {
    const t = readFileSync(f, 'utf8')
    // 逐行判：**跳过注释行**（本文件里就有大量解释性注释会谈起这些字面量）
    const lines = t.split('\n')
    for (const [i, l] of lines.entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) continue
      if (HARDCODED.some((re) => re.test(l))) {
        hits.push(`${f.replace(process.cwd(), '.')}:${i + 1}  ${l.trim().slice(0, 90)}`)
      }
    }
  }
  check(hits.length === 0, `全部 ${files.length} 个源码文件里没有写死四值 / \`ENTRY_KINDS.join()\``, hits.slice(0, 4).join(' | '))

  const tools = readFileSync(join(process.cwd(), 'src', 'tools.ts'), 'utf8')
  /**
   * 🔴🔴 **本条断言在 2026-10-09 被【改写】**（原来断言的是 `get: descOf` = "description 用 getter"）。
   *
   * ── 为什么改判据（而不是改代码去迁就它）──────────────────────────────────
   * 那条旧断言守的是**一个从原理上做不到的设计**：
   *   · `kindParam` 曾经把 `enum`/`description` 做成 getter（想"每轮现算"）；
   *   · 🔴 **但 DSH 不允许动态 schema** —— `dsh-tools` 的 `isJsonSchemaRecord`
   *     要求参数对象**只有 own enumerable string keys**（`hasOnlyEnumerableStringKeys`），
   *     且必须是"value schema object" ⇒ **访问器属性直接判不合格**：
   *     `JsonSchemaError: parameters.…properties.kind must be a value schema object`
   *     ⇒ **整个工具注册失败**（我实测过：4 个工具一起挂）。
   *   · ⚠️ 而 5 个调用点写的 `{ ...kindParam(...) }` 恰好把 getter **求值成静态值**，
   *     **无意中满足了 DSH** ⇒ 所以这个"坏设计"一直没暴露。
   * ⇒ ✅ **正确设计是两级**：**参数层静态快照**（满足 DSH）+ **运行期现算校验**
   *   （`handoff.ts` 的 `isEntryKind` / `selectableKindList`，读进程内词表）。
   *   ⭐ 那条判据由 `test-kind-dynamic-enum.mjs` 专门守着（含反证臂）。
   *
   * ⭐ 判据：**设计变了就改判据，不去改代码迁就旧判据**；
   *   但**改判据前要先确认"是判据过期还是代码真错"** —— 这里是前者（旧的从原理上做不到）。
   */
  check(!/get: descOf/.test(tools),
    'kindParam【不再】用 getter（DSH 不接受动态 schema；动态性改由运行期保证）')
  check(/enum:\s*currentKindsOf\(\)/.test(tools),
    'kindParam 的 enum 是注册时快照（普通数据属性）')
}

console.log(`\n═══ 知识类型 → 提示词联动：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
