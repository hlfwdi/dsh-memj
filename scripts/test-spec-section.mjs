/**
 * 「本档写作规范」相关机制的验收（**决策 209 之后重写**）。
 *
 * ── 本套件测什么 ──────────────────────────────────────────────────────────
 * 决策 207 时规范住在**文档末尾单列一节**（`renderSpecSection` / `extractSpecSection` /
 * `cutSpecSection` / `truncateTitlesFromSpec`）。决策 209 把它改成**长在各节自己身上**
 * （`## 节名` 下的 ```memj:spec 围栏）⇒ 本套件按新形态重写，
 * **同时保留旧形态的兼容读验收**（那几个函数仍在服役，服务存量文档）。
 *
 * ⚠️ 必须在 `node scripts/build.mjs` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-spec-section.mjs
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-spec-sec-'))
mkdirSync(join(lib, 'projects'), { recursive: true })
mkdirSync(join(lib, 'prompts'), { recursive: true })
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)

let pass = 0
let fail = 0
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) } else { fail += 1; console.log(`  🔴 ${name}${extra ? '  ← ' + extra : ''}`) }
}

const F = '```'
const FENCE = `${F}memj:spec`

console.log('\n【1】新形态：抓取 / 切除（决策 209）')
{
  const sec = ['## 目标', '', FENCE, '这个项目要做什么', F, '', '正文一行。']
  check('specBlockRange 找得到', mod.specBlockRange(sec) !== undefined)
  check('extractSpecBlock 取到规范文字', mod.extractSpecBlock(sec) === '这个项目要做什么')
  check('extractSpecBlockLines 取到原文行（含围栏）',
    JSON.stringify(mod.extractSpecBlockLines(sec)) === JSON.stringify([FENCE, '这个项目要做什么', F]))
  const stripped = mod.stripSpecBlock(sec).join('\n')
  check('stripSpecBlock 保住正文', stripped.includes('正文一行。'))
  check('stripSpecBlock 去掉围栏', !stripped.includes('memj:spec'))
  check('没有规范块 ⇒ 原样返回', mod.stripSpecBlock(['## 甲', '', 'x']).join('\n') === '## 甲\n\nx')
}
{
  const doc = ['## 目标', '', FENCE, 'g', F, '', '## 当前进度', '', FENCE, 'p', F, '', '## 下一步', '', FENCE, 'n', F, ''].join('\n')
  check('围栏里的伪标题不算节', JSON.stringify(mod.sectionsFromNarrative(doc)) === '["目标","当前进度","下一步"]')
  const broken = ['## 甲', '', FENCE, '规范没关围栏', ''].join('\n')
  check('⭐ 围栏不闭合 ⇒ 当作没有规范块（不半取）', mod.specBlockRange(broken.split('\n')) === undefined)
}
{
  const sec = ['## 甲', '', FENCE, '第一行', '第二行', '第三行', F]
  check('多行规范块能取全', mod.extractSpecBlock(sec) === '第一行\n第二行\n第三行')
}

console.log('\n【1b】⭐⭐ 决策 223：`truncate` 标记**已废除**，但**读侧必须宽容**')
{
  // 🔴 **这是本次改造最要紧的一条兼容性断言**：
  //    存量 21 份文档的围栏起始行**写着 ` truncate`**（那时它是机器标记）。
  //    若不宽容 ⇒ 那些行**认不出是起始行** ⇒ 规范块整块失效
  //    ⇒ 「节规范」功能（显示、就地编辑、交接点名）**全部静默失灵**。
  //    ⭐ 判据：**放宽解析、收紧渲染** —— 读要能读旧的，写只写新的。
  const legacyOpen = `${FENCE} truncate`
  const sec = ['## 甲', '', legacyOpen, '规范文字', F]
  check('⭐ 带旧 `truncate` 后缀的行**仍被认作起始行**',
    mod.specBlockFenceInfo(legacyOpen) === true)
  check('  ⇒ 规范块照样能取出', mod.specBlockRange(sec) !== undefined)
  check('  ⇒ 规范文字照样取到', mod.extractSpecBlock(sec) === '规范文字')
  // ⭐ 渲染侧：**只写最简形态**（不再带后缀）
  const rendered = mod.renderSpecBlockLines('新的规范')
  check('⭐ 渲染出的起始行**不带任何后缀**', rendered[0] === FENCE, rendered[0])
  // 🔴 反证：`truncateTitlesFromBlocks` 真的删了
  check('⛔ `truncateTitlesFromBlocks` 已删除（归档不再由工具判定）',
    typeof mod.truncateTitlesFromBlocks !== 'function')
}

console.log('\n【2】旧形态兼容读（决策 207 的存量文档）')
{
  // ⚠️ **这两个函数仍然活着**（`handoff.ts` 用它保住存量文档末尾那节「本档写作规范」）
  //    ⇒ 它们的断言**必须留着**（只去掉"反解可截断节"那一条 —— 那个消费者已删）。
  const legacy = ['## 目标', '', '正文', '', '## 本档写作规范', '', '本文档共 **2 节**：', '',
    '- `## 目标` —— g', '- `## 进展` —— p', '',
    '## 沉淀知识', '', '<!-- memj:entry', '...', '-->', '<!-- /memj:entry -->'].join('\n')
  const spec = mod.extractSpecSection(legacy)
  check('extractSpecSection 取得旧形态那一节', spec.startsWith('## 本档写作规范'))
  const cut = mod.cutSpecSection(legacy)
  check('cutSpecSection 砍掉它', !cut.includes('本档写作规范'))
  check('  且保住「沉淀知识」', cut.includes('沉淀知识'))
  check('  且保住前面的正文', cut.includes('正文'))
  check('⭐ 它与「沉淀知识」都从叙事节里排除',
    !mod.sectionsFromNarrative(legacy).includes('本档写作规范') && !mod.sectionsFromNarrative(legacy).includes('沉淀知识'))
}

console.log('\n【3】模板 md：desc 住在规范块里')
{
  // 🔴 **决策 223：`truncate` 字段已从 `TemplateSection` 删除** ⇒ 这里的样例
  //    不再带它；断言也改成"渲染出的起始行**不带后缀**"。
  const t = { version: 1, id: 't1', title: 'T', sections: [
    { name: '目标', desc: '这个项目要做什么' },
    { name: '进展', desc: '做到哪了' },
  ] }
  const md = mod.renderTemplateDoc(t)
  check('渲染出规范块', md.includes(FENCE))
  check('⭐ 起始行**不带任何后缀**（`truncate` 已废除）', !md.includes(`${FENCE} truncate`))
  const back = mod.parseTemplateDoc(md, 't1')
  check('解析回来 desc 一致', back?.sections.map((s) => s.desc).join('|') === '这个项目要做什么|做到哪了')
  check('⭐ 解析回来**没有** truncate 字段（不再有这个概念）',
    back?.sections.every((s) => s.truncate === undefined) === true)
  check('⭐⭐ 幂等（再渲染逐字相同）', mod.renderTemplateDoc(back) === md)
}

console.log('\n【4】建项目：骨架连规范块一起长出来')
{
  const t = { version: 1, id: 't1', title: 'T', sections: [
    { name: '目标', desc: 'g' },
    { name: '进展', desc: 'p' },
  ] }
  const sk = mod.renderSpecBlocksSkeleton(t)
  check('骨架含规范块', sk.includes(FENCE))
  check('骨架的节名正确', JSON.stringify(mod.sectionsFromNarrative(sk)) === '["目标","进展"]')
  check('⭐ 骨架的起始行也不带后缀', !sk.includes(`${FENCE} truncate`))
}

console.log('\n【5】端到端：用模板建项目 ⇒ 文档里每节都有规范块')
{
  const CFG = { progressCharsWarn: 20000, progressCharsKeep: 12000 }
  await mod.saveTemplate({ version: 1, id: 'e2e-tpl', title: 'E2E', sections: [
    { name: '研究目标', desc: '这家公司要回答什么问题' },
    { name: '证据', desc: '一手材料' },
  ] })
  await mod.appendDocRead('s-e2e', { project: 'e2e-proj', turn: 1, readAt: new Date().toISOString(), full: true, sections: [] })
  const r = await mod.runHandoff(
    { project: 'e2e-proj', projectDesc: 'e2e；当 x 时读它。', doc: '## 研究目标\n\n甲\n## 证据\n\n乙\n', template: 'e2e-tpl', confirmCreate: true },
    { sessionId: 's-e2e', config: CFG, turn: 1 },
  )
  check('用模板建项目成功', r.ok, r.message.slice(0, 200))
  const d = await mod.loadProjectDoc('e2e-proj')
  check('⭐ 文档正文里每节都有规范块', d?.narrative.includes(FENCE) === true)
  check('⭐ 规范块里是该模板的 desc', d?.narrative.includes('这家公司要回答什么问题') === true)
  check('⭐⭐ 文档里**没有**末尾的「本档写作规范」节', !d?.narrative.includes('## 本档写作规范'))
  // ⭐ 2026-10-05：`sections` 字段已删 ⇒ 直接看正文（权威）。
  check('⭐ 正文里的节名正确', mod.sectionsFromNarrative(d?.narrative ?? '').join(',') === '研究目标,证据')
  // 🔴 **决策 223：`truncateSections` 不再被维护** ⇒ 不再断言它被刷新。
  //    ⚠️ 但**存量值要原样透传**（不主动清空）⇒ 新建文档它是空的，这是对的。
  check('⭐ `truncateSections` 不再被写（决策 223）',
    (d?.frontmatter.truncateSections ?? []).length === 0)

  await mod.appendDocRead('s-e2e', { project: 'e2e-proj', turn: 2, readAt: new Date().toISOString(), full: true, sections: [] })
  const r2 = await mod.runHandoff(
    { project: 'e2e-proj', doc: '## 研究目标\n\n甲改过了。\n' },
    { sessionId: 's-e2e', config: CFG, turn: 2 },
  )
  check('更新成功', r2.ok, r2.message.slice(0, 200))
  const d2 = await mod.loadProjectDoc('e2e-proj')
  check('⭐⭐ 规范块**没被模型回传的正文冲掉**', d2?.narrative.includes('这家公司要回答什么问题') === true)
  check('⭐ 正文确实更新了', d2?.narrative.includes('甲改过了。') === true)
  check('⭐ 节名仍按文档自己', mod.sectionsFromNarrative(d2?.narrative ?? '').join(',') === '研究目标,证据')
}

console.log('\n【6】红线：存量老文档**不该**被合成规范（决策 207 的裁定仍在）')
{
  const CFG = { progressCharsWarn: 20000, progressCharsKeep: 12000 }
  const p = join(lib, 'projects', 'HANDOFF-old-proj.md')
  writeFileSync(p, ['---', 'project: old-proj', 'desc: old；当 x 时读它。', 'themes: []', '---', '',
    '# HANDOFF — old-proj', '', '## 目标', '', '旧内容。', '', '## 沉淀知识', ''].join('\n'), 'utf8')
  await mod.appendDocRead('s-old', { project: 'old-proj', turn: 1, readAt: new Date().toISOString(), full: true, sections: [] })
  const r = await mod.runHandoff(
    { project: 'old-proj', doc: '## 目标\n\n新内容。\n' },
    { sessionId: 's-old', config: CFG, turn: 1 },
  )
  check('老文档更新成功', r.ok, r.message.slice(0, 200))
  const after = readFileSync(p, 'utf8')
  check('⭐⭐⭐ 没有替它合成规范块（不知道它该有哪几节）', !after.includes('memj:spec'))
  check('⭐⭐ 没有插进默认六节', !after.includes('## 当前进度'))
  check('原有节都在', after.includes('## 目标') && after.includes('新内容。'))
}

console.log('\n【7】老文档的旧形态规范节**原样保住**（不按新模板重建）')
{
  const CFG = { progressCharsWarn: 20000, progressCharsKeep: 12000 }
  const p = join(lib, 'projects', 'HANDOFF-legacy-spec.md')
  writeFileSync(p, ['---', 'project: legacy-spec', 'desc: ls；当 x 时读它。', 'themes: []', '---', '',
    '# HANDOFF — legacy-spec', '', '## 目标', '', '旧内容。', '',
    '## 本档写作规范', '', '本文档共 **2 节**：', '', '- `## 目标` —— g', '', '## 沉淀知识', ''].join('\n'), 'utf8')
  await mod.appendDocRead('s-ls', { project: 'legacy-spec', turn: 1, readAt: new Date().toISOString(), full: true, sections: [] })
  const r = await mod.runHandoff(
    { project: 'legacy-spec', doc: '## 目标\n\n改过了。\n' },
    { sessionId: 's-ls', config: CFG, turn: 1 },
  )
  check('更新成功', r.ok, r.message.slice(0, 200))
  const after = readFileSync(p, 'utf8')
  check('⭐⭐ 旧形态规范节被原样保住', after.includes('## 本档写作规范'))
  check('⭐⭐ 且没被替成新形态的规范块', !after.includes('memj:spec'))
  check('  正文更新了', after.includes('改过了。'))
}

console.log(`\n═══ 本档写作规范（决策 209 新形态）：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
