// 决策 209 的 4 条反证 + 新形态验收（跑 lib/ 产物，不碰生产库）
//
// ⚠️ 必须 `node scripts/build.mjs` 之后再跑（与其余套件同规）。
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const T = mkdtempSync(join(tmpdir(), 'memj-209-'))
mkdirSync(join(T, 'projects'), { recursive: true })
mkdirSync(join(T, 'prompts'), { recursive: true })
process.env['MEMJ_DATA_DIR'] = T

// ⭐ 全部走 lib/（否则与其余套件不同规：那几个都 import 产物，
//    而产物才是**运行期真正加载的东西**）。
const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const H = mod
const S = mod
const TPL = mod

const F = '```'
let pass = 0
let fail = 0
const chk = (ok, name, extra = '') => {
  if (ok) pass += 1
  else fail += 1
  console.log(`  ${ok ? '✅' : '🔴'} ${name}${extra && !ok ? '  ← ' + extra : ''}`)
}

const M = (n) => `${F}memj:spec`
// 🔴 **决策 223：起始行不再带后缀** ⇒ `trunc` 参数保留只是为了建"存量形态"的样本
//    （那条兼容读断言要用它），新写的样本一律不带。
const specOf = (desc, trunc) => [trunc ? `${F}memj:spec truncate` : `${F}memj:spec`, desc, F].join('\n')

// ── 文档样本：每个顶级节标题下都有规范块 ──
// ⚠️ 「当前进度」那一节**故意用旧形态**（带 ` truncate`）—— 它就是存量 21 份文档的样子，
//    下面那条兼容读断言盯着"它照样能被认出来"。
const doc = [
  '## 目标', '', specOf('这个项目要做什么'), '', '目标是把 X 做完。', '',
  '## 当前进度', '', specOf('做到哪了', true), '',
  '### 第一批', '', '做了 A。', '',
  '### 第二批', '', '做了 B。', '',
  '## 下一步', '', specOf('待办'), '',
].join('\n')

console.log('═══ 新形态基础 ═══')
console.log(`  sectionsFromNarrative ⇒ ${JSON.stringify(S.sectionsFromNarrative(doc))}`)
chk(JSON.stringify(S.sectionsFromNarrative(doc)) === '["目标","当前进度","下一步"]', '围栏块不被当成节')
// ⚠️ 该节的行区间要按真实边界取（`## 目标` 到下一个 `##` 之前）——
//    我第一版写死 `slice(0,6)` ⇒ 只到围栏结束、**取不到正文** ⇒ 假失败。
const goalLines = doc.split('\n').slice(0, doc.split('\n').indexOf('## 当前进度'))
chk(S.extractSpecBlock(goalLines) === '这个项目要做什么', 'extractSpecBlock 取到规范文字')
chk(S.stripSpecBlock(goalLines).join('\n').includes('目标是把 X 做完。'), 'stripSpecBlock 保住正文')
// ⭐⭐ **决策 223 的兼容读**：旧形态（带 ` truncate`）的行**仍被认作起始行**。
{
  const progressLines = doc.split('\n').slice(
    doc.split('\n').indexOf('## 当前进度'),
    doc.split('\n').indexOf('## 下一步'),
  )
  chk(S.extractSpecBlock(progressLines) === '做到哪了',
    '⭐⭐ 旧形态（`memj:spec truncate`）的规范块**照样取得到**（存量兼容）')
  chk(S.specBlockRange(progressLines) !== undefined, '  ⇒ 边界也认得出来')
}

console.log('\n═══ ① 模型回传某节（不带规范块）⇒ 规范块不丢 ═══')
const incoming = ['## 目标', '', '目标是把 X 和 Y 都做完。', ''].join('\n')
const merged = H.mergeNarrative(incoming, doc, ['目标', '当前进度', '下一步'])
const goalSeg = merged.split('## 目标')[1]?.split('\n## ')[0] ?? ''
chk(goalSeg.includes('memj:spec'), 'R1 规范块保住了')
chk(goalSeg.includes('这个项目要做什么'), 'R1 规范文字逐字保住')
chk(goalSeg.includes('目标是把 X 和 Y 都做完。'), 'R1 正文更新了')
chk(merged.includes(specOf('做到哪了', true)), 'R1 未触碰的节规范块也保住')

console.log('\n═══ ② append / prepend ⇒ 规范块仍在最前 ═══')
for (const op of ['append', 'prepend']) {
  const r = H.applySectionOp(doc, '当前进度', op, '### 第三批\n\n做了 C。')
  const seg = r.narrative.split('## 当前进度')[1]?.split('\n## ')[0] ?? ''
  const iSpec = seg.indexOf('memj:spec')
  const iBatch = seg.indexOf('第三批')
  chk(iSpec >= 0 && iSpec < iBatch, `R2 ${op}：规范块在正文之前`, `spec@${iSpec} batch@${iBatch}`)
}

console.log('\n═══ ③ replace ⇒ 规范块不丢 ═══')
const rep = H.applySectionOp(doc, '目标', 'replace', '## 目标\n\n新正文。')
chk(rep.narrative.includes(specOf('这个项目要做什么')), 'R3 replace 保住规范块')
chk(rep.narrative.includes('新正文。'), 'R3 正文被换掉')

console.log('\n═══ ④ 只有规范块、无正文的节仍判空壳 ═══')
const onlySpec = ['## 目标', '', specOf('这一节要干嘛'), '', '## 下一步', '', '有内容', ''].join('\n')
chk(H.findEmptySections(onlySpec).includes('目标'), 'R4 判为空壳', JSON.stringify(H.findEmptySections(onlySpec)))

console.log('\n═══ ⑤ 截断配额剔除规范块 ═══')
const big = ['## 当前进度', '', specOf('做到哪了', true), '']
for (let i = 0; i < 6; i += 1) big.push(`### 第${i + 1}批`, '', 'x'.repeat(4000), '')
const bigDoc = big.join('\n')
// ⚠️ `splitSectionsForHistory` 未从 lib 导出（内部实现）⇒ 这里改用等价的边界：
//    该节 = 从 `## 当前进度` 到下一个顶层 `##`（这一段没有别的顶层节 ⇒ 到文件尾）。
const startLine = 0
const wholeLen = bigDoc.split('\n').slice(startLine).join('\n').trimEnd().length
const strippedLen = S.stripSpecBlock(bigDoc.split('\n').slice(startLine)).join('\n').trimEnd().length
chk(strippedLen < wholeLen, `R5 剔掉规范块（${wholeLen} → ${strippedLen}）`)

console.log('\n═══ ⑥ 模板：渲染/解析往返 ═══')
// 🔴 **决策 223：`truncate` 已从模板节里删除**（归档规则改写成 `desc` 里的自然语言）。
const tpl = { version: 1, id: 't1', title: 'T', sections: [
  { name: '目标', desc: '这个项目要做什么' },
  { name: '当前进度', desc: '第一行\n第二行（多行 desc）' },
] }
const md = TPL.renderTemplateDoc(tpl)
console.log(md.split('\n').map((l) => '  | ' + l).join('\n'))
const back = TPL.parseTemplateDoc(md, 't1')
chk(back?.sections.length === 2, '往返：节数')
chk(back?.sections[0].desc === '这个项目要做什么', '往返：desc 逐字')
chk(back?.sections[1].desc === '第一行\n第二行（多行 desc）', '往返：多行 desc 逐字')
// 🔴 **决策 223：往返后不该再有 `truncate` 字段**（它已从类型里删除）。
chk(back?.sections.every((s) => s.truncate === undefined) === true, '⭐ 往返：**没有** truncate 字段')
chk(TPL.renderTemplateDoc(back) === md, '往返幂等（逐字节）')

console.log('\n═══ ⑦ 校验补的两个缺口 ═══')
const mk = (names) => ({ version: 1, id: 't1', title: 'T', sections: names.map((n) => ({ name: n, desc: 'd' })) })
chk(TPL.validateTemplate(mk(['本档写作规范', '其它'])).length > 0, '节名撞「本档写作规范」⇒ 报错')
chk(TPL.validateTemplate(mk(['目标`x', '其它'])).length > 0, '节名含反引号 ⇒ 报错')
chk(TPL.validateTemplate(mk(['含|竖线', '其它'])).length > 0, '节名含竖线 ⇒ 报错')
chk(TPL.validateTemplate(mk(['沉淀知识', '其它'])).length > 0, '节名撞「沉淀知识」⇒ 仍报错')

console.log('\n═══ ⑧ 建项目骨架（renderSpecBlocksSkeleton）═══')
const sk = TPL.renderSpecBlocksSkeleton(tpl)
console.log(sk.split('\n').map((l) => '  | ' + l).join('\n'))
chk(sk.includes(`${F}memj:spec`), '骨架含规范块')
chk(sk.includes('这个项目要做什么'), '骨架含 desc')
chk(S.sectionsFromNarrative(sk).join(',') === '目标,当前进度', '骨架的节名正确')
// 🔴 **决策 223：骨架的起始行也不再带后缀**（`truncate` 已废除）。
chk(!sk.includes(`${F}memj:spec truncate`), '⭐ 骨架的起始行不带任何后缀')

// ═══ ⑨ 端到端：写得再多也**不自动截断**（决策 223）═══
//    🔴 **这一节原来是"超阈值 ⇒ 真截断"的 R5** —— 那个机制已按用户裁定删除
//    （归档交给模型）。现在要证的恰好**相反**：工具**不再动文档**，只**报数**。
console.log('\n═══ ⑨ 端到端：超阈值也**不自动截断**，只报数（决策 223）═══')
{
  const B = await import(pathToFileURL(join(process.cwd(), 'lib', 'offline-bundle.js')).href)
  const CFG = { ...B.DEFAULT_CONFIG, themeCreation: 'loose', backupGit: false, progressCharsKeep: 400, progressCharsWarn: 500 }
  const sec = (n) => `### 第${n}批\n\n${'这一批做了不少事。'.repeat(20)}`
  // ⚠️ 故意写成**远超阈值**（三个大批次，远超 warn=500）
  const r1 = await H.runHandoff(
    { project: 'r5-proj', projectDesc: 'r5；当测试时读它。',
      doc: ['## 目标', '', '目标。', '', '## 当前进度', '', sec(40), '', sec(39), '', sec(38), ''].join('\n') },
    { sessionId: 's-r5', config: CFG, turn: 1 },
  )
  chk(r1.ok === true, '建项目成功', r1.message.slice(0, 150))
  const { readFileSync } = await import('node:fs')
  const raw = readFileSync(join(T, 'projects', 'HANDOFF-r5-proj.md'), 'utf8')
  /**
   * 🔴🔴 **判据必须落在【正文】，不能全文搜** —— 我第一版就是这么错的：
   * 默认模板的**规范文字里本来就有** `kind: history` 与 `### 历史进展` 这些词
   * （它在教模型怎么做归档）⇒ 全文 `includes()` **必然命中**，报的是假红。
   * ⭐ 与本项目既有那条同族：**"某东西不该出现"要指明在哪个范围内**。
   * ⇒ 这里先**剥掉所有规范块**，只在**纯正文**里判。
   */
  const body = S.stripAllSpecBlocks(raw)
  chk(!body.includes('### 历史进展'), '⭐⭐ 纯正文里**没有**「历史进展」小节（不再自动归档）')
  chk(!/kind: history/.test(body), '⭐⭐ 纯正文里**没有** history 归档（工具不落条目）')
  chk(raw.includes('### 第38批') && raw.includes('### 第40批'),
    '⭐⭐ 三个批次**原样都在**（工具没截走任何一个）')
  // ③ 规范块仍在（没被截断逻辑波及）
  chk(raw.includes('memj:spec'), '规范块仍在')
  // ④ ⭐ **报数**：回执里给出各节字符数（这才是"强提醒"）
  chk(/当前进度[^\n]{0,40}\d+/.test(r1.message), '⭐⭐ 回执里**报出了「当前进度」的字符数**',
    (r1.message.split('\n').find((l) => l.includes('当前进度')) ?? '').slice(0, 160))
  chk(!r1.message.includes('历史归档（自动截断）'), '⛔ 回执里不再有"自动截断"那句话')
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
