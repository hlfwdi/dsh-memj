/**
 * ⭐⭐⭐ **章节规范的就地编辑**（决策 220，2026-10-12 用户要求）——端到端测试。
 *
 * 用户原话：*"就 memj 存量的项目文档，章节下的章节规范，我希望也变成可编辑的。
 * 编辑入口就放在…右侧详情页，书写规范块上给一下编辑按钮。"*
 *
 * ── 本套件盯的是什么 ────────────────────────────────────────────────────────
 * ① **读与写必须定位到同一节、同一个块** —— 否则会出现"页面显示 A 节的规范、
 *    保存却写进 B 节"这类**静默错位**（错位不报错，只是把内容挪了地方）；
 * ② **只改那一块** —— 该节正文、其它节、封面必须**逐字节不动**
 *    （本项目吃过"整篇重渲染静默删块"的亏）；
 * ③ **没有块就绝不合成**（决策 207 的裁定）—— 三态返回里 `no-block` 必须真的不写盘；
 * ④ **`truncateSections` 镜像跟着正文走**（正文权威 + frontmatter 跟随），
 *    那是"哪节能自动截断"的判据 —— 不跟手就会变成"同一事实两份值"；
 * ⑤ **改完的规范要被下一次 handoff 保住** —— 规范块的权威在盘上
 *    （`mergeNarrative` 会回填），这条不成立的话用户改的东西会被下一轮冲掉。
 *
 * ⚠️ 全部走 `lib/` 产物 + 隔离库根（`MEMJ_DATA_DIR`），**不碰真实库**。
 * ⚠️ 必须 `node scripts/build.mjs` 之后再跑（与其余套件同规）。
 * 用法：`node scripts/test-section-spec.mjs`
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-spec220-'))
mkdirSync(join(lib, 'projects'), { recursive: true })
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const apiMod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const CFG = { ...mod.DEFAULT_CONFIG, themeCreation: 'loose', backupGit: false }

let pass = 0
let fail = 0
const chk = (ok, name, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  🔴 ${name}${extra ? '  ← ' + extra : ''}`) }
}
const F = '```'
const specOf = (desc, trunc) => [trunc ? `${F}memj:spec truncate` : `${F}memj:spec`, desc, F].join('\n')
const readDoc = (id) => readFileSync(join(lib, 'projects', `HANDOFF-${id}.md`), 'utf8')

console.log(`库根: ${lib}\n`)

// ══════════════════════════════════════════════════════════════════════
console.log('═══ 【1】纯函数：`sectionSpecsOf` 只列**真的有块**的节 ═══')
// ══════════════════════════════════════════════════════════════════════
{
  const doc = [
    '## 目标', '', specOf('这个项目要做什么'), '', '正文一。', '',
    '## 当前进度', '', specOf('做到哪了', true), '', '### 第一批', '', '做了 A。', '',
    '## 没有规范的一节', '', '只有正文。', '',
  ].join('\n')
  const specs = mod.sectionSpecsOf(doc)
  chk(specs.length === 2, '只回 2 条（第三节没有块 ⇒ 不在结果里）', JSON.stringify(specs.map((s) => s.title)))
  chk(specs[0]?.title === '目标' && specs[0]?.spec === '这个项目要做什么' && specs[0]?.truncate === false,
    '第一条：节名 / 规范 / 无截断标记', JSON.stringify(specs[0]))
  chk(specs[1]?.title === '当前进度' && specs[1]?.truncate === true,
    '⭐ 第二条带 `truncate` 标记（= 这一节参与自动截断）', JSON.stringify(specs[1]))
  chk(!specs.some((s) => s.title === '没有规范的一节'), '⚠️ 没有块的节**不在**结果里（前端据此不画按钮）')
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n═══ 【2】纯函数：写（`setSectionSpecBlock`）——三态 + 局部替换 ═══')
// ══════════════════════════════════════════════════════════════════════
{
  const doc = [
    '## 目标', '', specOf('旧规范'), '', '这是**正文**，一个字都不该动。', '',
    '## 下一步', '', specOf('待办', true), '', '- 第一件事', '',
  ].join('\n')

  const r1 = mod.setSectionSpecBlock(doc, '目标', '新规范（两行）\n第二行', false)
  chk(r1.status === 'ok', '改「目标」的规范 ⇒ ok', r1.status)
  chk(r1.narrative.includes(specOf('新规范（两行）\n第二行')), '⭐ 新规范是**多行**、逐字写进去了')
  chk(!r1.narrative.includes('旧规范'), '旧规范被换掉')
  chk(r1.narrative.includes('这是**正文**，一个字都不该动。'), '⭐⭐ 该节正文**一字不动**')
  chk(r1.narrative.includes(specOf('待办', true)), '⭐⭐ 其它节的块（含 truncate 标记）**原样**')
  chk(mod.sectionSpecsOf(r1.narrative).length === 2, '改完仍然是两个块（没多也没少）')

  // ⭐ 幂等：同样的内容再设一次 ⇒ **逐字节相同**（否则每次保存都会抖出 diff）
  const again = mod.setSectionSpecBlock(r1.narrative, '目标', '新规范（两行）\n第二行', false)
  chk(again.narrative === r1.narrative, '⭐⭐ 幂等：同样内容再设一次 ⇒ 结果逐字节相同')

  // ⭐ 只动 truncate 标记（不动文字）
  const r2 = mod.setSectionSpecBlock(doc, '下一步', '待办', false)
  chk(r2.status === 'ok' && mod.sectionSpecsOf(r2.narrative).find((s) => s.title === '下一步')?.truncate === false,
    '⭐ 只摘掉 `truncate` 标记也能生效（文字不变）')
  chk(r2.narrative.includes(specOf('待办')), '  摘标记后那一行是**裸的** memj:spec', '')

  // 三态：节名不存在
  const r3 = mod.setSectionSpecBlock(doc, '没这一节', 'x', false)
  chk(r3.status === 'no-section' && r3.narrative === doc, '节名不存在 ⇒ `no-section` 且**原文一字不动**', r3.status)

  // 三态：有节但没块 ⇒ **绝不合成**
  const doc2 = ['## 目标', '', specOf('有规范'), '', '## 没规范', '', '正文。', ''].join('\n')
  const r4 = mod.setSectionSpecBlock(doc2, '没规范', '硬塞进去', false)
  chk(r4.status === 'no-block', '有节但没块 ⇒ `no-block`', r4.status)
  chk(r4.narrative === doc2, '⭐⭐ `no-block` 时**原文一字不动**（绝不替它合成 —— 决策 207）')
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n═══ 【3】纯函数：围栏里的伪标题**不是节**（读写同规） ═══')
// ══════════════════════════════════════════════════════════════════════
{
  // 🔴 这一组守的是"读写两处必须同规"：
  //    若读（sectionSpecsOf）跳过围栏、而写（setSectionSpecBlock）不跳（或反之），
  //    就会出现"界面上列出来了、保存却报没有这一节"。
  const doc = [
    '## 目标', '', specOf('规范里写了示例：\n## 这只是示例标题'), '', '正文。', '',
  ].join('\n')
  const specs = mod.sectionSpecsOf(doc)
  chk(specs.length === 1, '⭐ 规范块里的 `## 示例` **没被当成一节**', JSON.stringify(specs.map((s) => s.title)))
  chk(specs[0]?.spec.includes('## 这只是示例标题'), '  它仍然在那段规范文字里（完整保留）')
  const r = mod.setSectionSpecBlock(doc, '目标', '换成别的\n## 示例2', false)
  chk(r.status === 'ok' && mod.sectionSpecsOf(r.narrative).length === 1,
    '⭐ 写侧同样只认一个节（读写的节定位同源）')

  // ⭐ 正文里的**普通代码块**（非 memj:spec）里的 `## x` 也不算节
  const doc2 = [
    '## 目标', '', specOf('规范'), '', '示例：', '', '```js', '// ## 这不是节', F, '',
  ].join('\n')
  chk(mod.sectionSpecsOf(doc2).length === 1, '⭐ 正文普通代码块里的 `## …` 也不算节')
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n═══ 【4】端到端：真建项目 ⇒ 改一节规范 ═══')
// ══════════════════════════════════════════════════════════════════════
const P = 'spec220'
{
  const seed = await mod.runHandoff({
    project: P,
    projectDesc: '章节规范就地编辑的测试项目；当要验决策 220 时读它。',
    doc: ['## 目标', '', '总目标。', '', '## 当前进度', '', '### 第一批', '', '做了一点。', ''].join('\n'),
  }, { sessionId: 's-220', turn: 1, config: CFG })
  chk(seed.ok === true, '建项目成功', String(seed.message).slice(0, 200))

  const raw0 = readDoc(P)
  const before = mod.sectionSpecsOf(mod.narrativeFromProjectText(raw0))
  chk(before.length >= 2, `⭐ 新建项目自带规范块（${before.length} 个）`, JSON.stringify(before.map((s) => s.title)))
  chk(before.some((s) => s.truncate), '  默认模板里有一节带 `truncate`（「当前进度」）')

  // ── 改「目标」这一节 ──
  const target = before.find((s) => s.title === '目标')
  const r = await mod.setSectionSpec(P, '目标', '**新的规范**：这一段要说清项目总目标。', target.truncate)
  chk(r.ok === true, '改「目标」的规范 ⇒ 成功', String(r.message).slice(0, 200))

  const raw1 = readDoc(P)
  const after = mod.sectionSpecsOf(mod.narrativeFromProjectText(raw1))
  chk(after.find((s) => s.title === '目标')?.spec === '**新的规范**：这一段要说清项目总目标。',
    '⭐⭐ 落盘后反解出来的规范就是新那份（读写闭环）')
  chk(after.length === before.length, '  块数不变（没多没少）', `${before.length} → ${after.length}`)
  chk(raw1.includes('总目标。') && raw1.includes('做了一点。'),
    '⭐⭐ 各节**正文一字不动**（含子节）')
  chk((raw1.match(/<!-- memj:entry/g) ?? []).length === 0 && raw1.includes('## 沉淀知识'),
    '  封面区与「沉淀知识」节结构完好')

  // ── 幂等：内容不变 ⇒ 不写盘（文件逐字节相同） ──
  const r2 = await mod.setSectionSpec(P, '目标', '**新的规范**：这一段要说清项目总目标。', target.truncate)
  chk(r2.ok === true && String(r2.message).includes('没有变化'), '⭐ 内容没变 ⇒ 明说"未写入"', String(r2.message))
  chk(readDoc(P) === raw1, '⭐⭐ 内容没变时**文件逐字节不变**（不白刷 updatedAt）')

  // ── 节名写错 ──
  const r3 = await mod.setSectionSpec(P, '没有这一节', 'x', false)
  chk(r3.ok === false, '节名不存在 ⇒ 拒绝', String(r3.message).slice(0, 120))
  chk(readDoc(P) === raw1, '⭐ 被拒时**不写盘**')

  // ── no-block：有节但没规范块 ⇒ 拒绝且不合成 ──
  {
    const raw = readDoc(P)
    // ⚠️ **动态定位那个块**，不写死模板文案 —— 内置默认模板的 desc 会随版本改
    //    （我第一版写死成"这个项目要做什么"，而实际带句号 ⇒ 替换没命中、用例假失败）。
    const m = /^```memj:spec[^\n]*\n[\s\S]*?\n```\n/m.exec(raw)
    chk(m !== null, '（前置）能在文档里定位到第一个规范块')
    const stripped = raw.replace(m[0], '').replace(/\n{3,}/g, '\n\n')
    chk(!/^```memj:spec/m.test(stripped.split('## 当前进度')[0] ?? ''),
      '（前置）「目标」那一节的块真的被剥掉了')
    writeFileSync(join(lib, 'projects', `HANDOFF-${P}.md`), stripped, 'utf8')
    const r4 = await mod.setSectionSpec(P, '目标', '硬塞', false)
    chk(r4.ok === false && String(r4.message).includes('没有书写规范块'),
      '⭐⭐ 有节无块 ⇒ 拒绝，且说明"本项目不会替已有文档合成规范"', String(r4.message).slice(0, 160))
    chk(readDoc(P) === stripped, '⭐⭐ 被拒时**原文一字不动**（真的没合成）')
    // 还原现场，后面的用例继续用
    writeFileSync(join(lib, 'projects', `HANDOFF-${P}.md`), raw1, 'utf8')
    chk(readDoc(P) === raw1, '（还原现场）')
  }
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n═══ 【5】⭐⭐ `truncateSections` 镜像跟着正文走 ═══')
// ══════════════════════════════════════════════════════════════════════
{
  const fmOf = (raw) => mod.splitFrontmatter(raw).data ?? {}
  const raw1 = readDoc(P)
  chk(JSON.stringify(fmOf(raw1)['truncateSections']) === JSON.stringify(['当前进度']),
    '改之前：镜像 = 当前进度（正文反解同值）', JSON.stringify(fmOf(raw1)['truncateSections']))

  // ① 给「目标」也打开自动截断 ⇒ 镜像应变两节
  await mod.setSectionSpec(P, '目标', '**新的规范**：这一段要说清项目总目标。', true)
  const raw2 = readDoc(P)
  const mirror2 = mod.toStringArray(fmOf(raw2)['truncateSections'])
  const fromBody2 = mod.truncateTitlesFromBlocks(mod.narrativeFromProjectText(raw2))
  chk(JSON.stringify(mirror2) === JSON.stringify(fromBody2),
    '⭐⭐ 镜像与**正文反解**一致（两个方向都查过）', `镜像=${JSON.stringify(mirror2)} 正文=${JSON.stringify(fromBody2)}`)
  chk(mirror2.includes('当前进度') && mirror2.includes('目标'), '  两节都在', JSON.stringify(mirror2))

  // ② 把「当前进度」的截断关掉 ⇒ 只剩「目标」
  await mod.setSectionSpec(P, '当前进度', mod.sectionSpecsOf(mod.narrativeFromProjectText(raw2))
    .find((s) => s.title === '当前进度').spec, false)
  const raw3 = readDoc(P)
  const mirror3 = mod.toStringArray(fmOf(raw3)['truncateSections'])
  chk(JSON.stringify(mirror3) === JSON.stringify(['目标']),
    '⭐⭐ 关掉一节的截断 ⇒ 镜像里就少一个（不是"只加不减"）', JSON.stringify(mirror3))
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n═══ 【6】⭐⭐ 改完的规范要被下一次 handoff 保住 ═══')
// ══════════════════════════════════════════════════════════════════════
{
  // 🔴 这条最要紧：用户在界面上改的规范若不落在"盘上那份权威"里，
  //    下一轮 handoff 就会把它冲回模板默认值 —— 用户的编辑白做（且**不报错**）。
  await mod.setSectionSpec(P, '有效做法', '这是**我手改的**有效做法规范。', false)
  const raw = readDoc(P)
  chk(raw.includes('这是**我手改的**有效做法规范。'), '（前置）规范已落盘')

  // 🔴 **必须先"登记一次本轮读过"** —— 写叙事硬校验（决策 112）要求
  //    "本次对话轮次里读过该文档"，那是**给模型的闸门**；探针不是模型、没有
  //    `memj_read` 这条路，所以直接按 `test-handoff.mjs` 的既有做法登记读记录
  //    （⚠️ 不是绕过校验：它正是不想让校验被绕过，只是换一条等价入口）。
  await mod.appendDocRead('s-220', {
    project: P, turn: 2, readAt: new Date().toISOString(), full: true, sections: [],
  })

  const h = await mod.runHandoff({
    project: P,
    doc: ['## 目标', '', '总目标（被更新了一次）。', ''].join('\n'),
  }, { sessionId: 's-220', turn: 2, config: CFG })
  chk(h.ok === true, '再跑一次 handoff（只写「目标」这一节）', String(h.message).slice(0, 160))

  const raw2 = readDoc(P)
  chk(raw2.includes('这是**我手改的**有效做法规范。'),
    '⭐⭐ 手改的规范**被 handoff 保住了**（没被模板默认值冲回去）')
  chk(raw2.includes('总目标（被更新了一次）。'), '  那次 handoff 的正文改动也进去了')
  chk(raw2.includes('**新的规范**：这一段要说清项目总目标。'),
    '⭐⭐ 「目标」那条手改的规范也还在')
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n═══ 【7】归档项目**不可编辑**（与其它项目级写通道同规） ═══')
// ══════════════════════════════════════════════════════════════════════
{
  const arch = await mod.archiveProject(P)
  chk(arch.ok === true, '先归档该项目', String(arch.message).slice(0, 120))
  const raw = readDoc(P)
  const r = await mod.setSectionSpec(P, '目标', '归档后不该改得动', false)
  chk(r.ok === false && String(r.message).includes('已归档'),
    '⭐⭐ 归档项目 ⇒ 拒绝，且回执点名"已归档"', String(r.message).slice(0, 160))
  chk(readDoc(P) === raw, '  被拒时**原文一字不动**')
  await mod.unarchiveProject(P)
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n═══ 【8】API：`/project` 回规范清单 + `/edit` 的 sectionSpec 通道 ═══')
// ══════════════════════════════════════════════════════════════════════
{
  const call = async (method, path, body) => {
    const raw = body === undefined ? '' : JSON.stringify(body)
    const url = new URL(`http://127.0.0.1${path}`)
    return apiMod.handleApi({ version: 'test' }, method, url.pathname, raw, url.searchParams)
  }
  let r = await call('GET', `/plugins/dsh-memj/api/project?id=${P}`)
  chk(r.status === 200, '/project 返回 200', `实际 ${r.status}`)
  chk(Array.isArray(r.body.sections) && r.body.sections.length >= 2,
    '⭐⭐ `/project` 回了 `sections`（前端据此画「编辑」按钮）', JSON.stringify(r.body.sections?.map?.((s) => s.title)))
  chk(r.body.sections.every((s) => typeof s.title === 'string' && typeof s.spec === 'string' && typeof s.truncate === 'boolean'),
    '  每条的形态是 `{title, spec, truncate}`')
  // ⭐ 与叙事同源：页面上"看到的"与"能改的"必须是同一份
  const titlesFromNarrative = mod.sectionsFromNarrative(r.body.narrative)
  chk(r.body.sections.every((s) => titlesFromNarrative.includes(s.title)),
    '⭐⭐ 每个可编辑的节**都在叙事里**（不会出现"按钮挂在一个不存在的节上"）',
    `sections=${JSON.stringify(r.body.sections.map((s) => s.title))} 叙事=${JSON.stringify(titlesFromNarrative)}`)

  // ── 参数校验 ──
  r = await call('POST', '/plugins/dsh-memj/api/edit', { target: 'sectionSpec', id: P, spec: 'x', truncate: false })
  chk(r.status === 400, '缺 section ⇒ 400', `实际 ${r.status}`)
  r = await call('POST', '/plugins/dsh-memj/api/edit', { target: 'sectionSpec', id: P, section: '目标' })
  chk(r.status === 400, '缺 spec ⇒ 400', `实际 ${r.status}`)

  // ── 正常写 ──
  r = await call('POST', '/plugins/dsh-memj/api/edit', {
    target: 'sectionSpec', id: P, section: '下一步', spec: '走 API 写进来的规范。', truncate: true,
  })
  chk(r.status === 200 && r.body.ok === true, '走 API 改一节规范 ⇒ 200', JSON.stringify(r.body).slice(0, 160))
  const raw = readDoc(P)
  chk(mod.sectionSpecsOf(mod.narrativeFromProjectText(raw)).find((s) => s.title === '下一步')?.spec === '走 API 写进来的规范。',
    '⭐⭐ API 那条路真的落盘了')
  chk(mod.truncateTitlesFromBlocks(mod.narrativeFromProjectText(raw)).includes('下一步'),
    '  它的 `truncate: true` 也生效了（正文反解里有它）')

  // ── 不存在的项目 ──
  r = await call('POST', '/plugins/dsh-memj/api/edit', {
    target: 'sectionSpec', id: 'no-such-project-xyz', section: '目标', spec: 'x', truncate: false,
  })
  chk(r.status === 400, '项目不存在 ⇒ 400（不是 500）', `实际 ${r.status}`)
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
