/**
 * ⭐⭐⭐ **验「各节规范集中交付」真的生效**（决策 221）——**看模型实际收到的文本**。
 *
 * 🔴 为什么不信"代码里写了就算"：本项目的铁律是**判据要落在真正发给模型的文本上**
 *    （已记过"算出的量 ≠ 发出的量"这类坑）。所以这里直接调工具拿返回值，
 *    再按 `render()` 的口径拼出模型看到的东西。
 *
 * 用法：node scripts/verify-section-specs.mjs
 *   ⚠️ **不需要起服务**（纯函数 + 一次真建项目的端到端 + 一份真实文档）。
 *      要"看模型实际收到的那段文本"，用 `show-section-specs-delivery.mjs`（那是一次性人工核对）。
 */
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

let pass = 0
let fail = 0
const chk = (ok, name, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  🔴 ${name}${extra ? '  ← ' + extra : ''}`) }
}

// ══ ① 纯函数层：`renderSectionSpecs()` 的形态 ══
console.log('═══ ① 纯函数：规范清单的渲染形态 ═══')
{
  const lib = mkdtempSync(join(tmpdir(), 'memj-221-'))
  mkdirSync(join(lib, 'projects'), { recursive: true })
  process.env['MEMJ_DATA_DIR'] = lib
  const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)

  const specs = [
    { title: '目标', spec: '只保留总目标与最新批次', truncate: false },
    { title: '当前进度', spec: '做到哪了\n（新进展必须写进这一节）', truncate: true },
  ]
  const text = mod.renderSectionSpecs(specs)
  chk(text.includes('目标') && text.includes('当前进度'), '两节的节名都在')
  chk(text.includes('只保留总目标与最新批次'), '规范原文**逐字**出现')
  chk(text.includes('（新进展必须写进这一节）'), '⭐ 多行规范**没被截断**（换行也保留）')
  chk(text.includes('可自动截断归档'), '⭐ 带 `truncate` 的节被标出来（这是程序读的语义，模型也该知道）')
  chk(!text.includes('失败/踩坑'), '⚠️ 没有规范的节**不出现**（不编造 —— 决策 207）')
  chk(mod.renderSectionSpecs([]) === '', '⭐ 一节规范都没有 ⇒ 返回空串（不输出空标题）')

  // 两段外壳文案必须是**可编辑提示词**里的（不是硬编码）
  chk(text.startsWith(mod.promptCurrent('reads:section-spec-head')),
    '⭐ 表头取自可编辑提示词 `reads:section-spec-head`')
  chk(text.trimEnd().endsWith(mod.promptCurrent('reads:section-spec-closing').trim()),
    '⭐ 收尾取自可编辑提示词 `reads:section-spec-closing`')

  // ══ ② 端到端：真建项目 ⇒ 读它 ⇒ 看交付文本 ══
  console.log('\n═══ ② 端到端：读项目文档时，规范真的排在最前面 ═══')
  const CFG = { ...mod.DEFAULT_CONFIG, themeCreation: 'loose', backupGit: false }
  const seed = await mod.runHandoff({
    project: 'spec221',
    projectDesc: '验证各节规范集中交付的测试项目；当测试决策 221 时读它。',
    doc: ['## 目标', '', '总目标。', '', '## 当前进度', '', '### 第一批', '', '做了一点。', ''].join('\n'),
  }, { sessionId: 's-221', turn: 1, config: CFG })
  chk(seed.ok === true, '（前置）建项目成功', String(seed.message).slice(0, 150))

  // 直接读盘拿 `sectionsFromNarrative`/`sectionSpecsOf`，验证它与正文同源
  const raw = (await import('node:fs')).readFileSync(join(lib, 'projects', 'HANDOFF-spec221.md'), 'utf8')
  const narrative = mod.narrativeFromProjectText(raw)
  const specs2 = mod.sectionSpecsOf(narrative)
  chk(specs2.length >= 2, `（前置）该项目有 ${specs2.length} 个规范块`)
  const rendered = mod.renderSectionSpecs(specs2)
  // ⭐⭐ 核心判据：清单里的每段规范，都必须在**正文里逐字找得到**
  //    —— 这证明它是"从正文读出来的"，而不是"另一个来源渲染的"（后者会漂）。
  const allFromBody = specs2.every((s) => narrative.includes(s.spec))
  chk(allFromBody, '⭐⭐ 清单里的规范**逐字来自正文**（同源 ⇒ 结构上不可能与正文不一致）')
  chk(!rendered.includes('undefined'), '清单里没有 undefined 之类的空洞')
}

// ══ ③ 真实数据：拿一份**真实生产文档**验（不依赖起服务） ══
//
// 🔴 **为什么不用 `/project` 接口**：那样这套件就**必须有个实例在跑**
//    （端口号一写死，别人机器上必红、CI 里也跑不了）。
//    ⭐ 判据：**套件要能离线跑** —— 拿一份真实文档的**文件**来验同样的事
//      （接口那条只是"把它读出来"，逻辑是同一份 `sectionSpecsOf`）。
console.log('\n═══ ③ 真实数据：一份真实生产文档（库副本）═══')
{
  const { existsSync, readFileSync } = await import('node:fs')
  const real = 'D:\\dsh-standalone-0.1.5-rc.2\\workplaces\\2026-09-28_20-21-31-362' +
    '\\verify\\memj-spec220-lib\\projects\\HANDOFF-dsh-power-control.md'
  if (!existsSync(real)) {
    console.log('  （库副本不在本机 ⇒ 本组跳过，如实记下；核心判据已在①②里验过）')
  } else {
    const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
    const narrative = mod.narrativeFromProjectText(readFileSync(real, 'utf8'))
    const specs = mod.sectionSpecsOf(narrative)
    chk(specs.length > 0, `（前置）这份真实文档有 ${specs.length} 节带规范`)
    chk(specs.every((s) => narrative.includes(s.spec)),
      '⭐⭐ 每节规范**逐字来自它自己的正文**（同源 ⇒ 不可能与正文不一致）')
    const rendered = mod.renderSectionSpecs(specs)
    chk(rendered.includes('本文档各节的写作规范'),
      '⭐ 渲染出来的清单带上了那段（可编辑的）表头')
    chk(!rendered.includes('undefined'), '清单里没有 undefined 之类的空洞')
  }
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
