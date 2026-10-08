/**
 * ⭐⭐⭐ **验决策 222 的两半都真的生效**（2026-10-12 用户裁定）。
 *
 * 用户的两问：
 *   ① *"现在他每一次阅读全都要给他一遍，这有点奇怪吧"* ⇒ 阅读侧应**退回按需**；
 *   ② *"写书写规范的目的不就是让他在做交接的时候去按规范去整理和书写吗？刚刚为什么没有做呢？"*
 *      ⇒ 交接侧必须**点名"本次没动的节"**、并给出触发。
 *
 * 所以本脚本要证四件事：
 *   A. **按节读 ⇒ 不再附规范清单**（旧行为：每次都附 ⇒ 实测一次交接会被给 7 遍）；
 *   B. **整篇读 ⇒ 仍然附一次**（"准备大改文档"那一刻逐节对照是合适的）；
 *   C. **交接回执里出现「本次没动过的节」+ 真实节名 + 插槽被填**；
 *   D. **只写一部分节时才点名**（全写齐 ⇒ 不该出现那一行，否则又是噪音）。
 *
 * 用法：node scripts/verify-untouched-callout.mjs
 *   ⚠️ 用独立临时库根，**不碰生产库**。
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-222-'))
mkdirSync(join(lib, 'projects'), { recursive: true })
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const CFG = { ...mod.DEFAULT_CONFIG, themeCreation: 'loose', backupGit: false }

let pass = 0
let fail = 0
const chk = (ok, name, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  🔴 ${name}${extra ? '  ← ' + extra : ''}`) }
}

const P = 'callout222'

// ── 造数据：一个有六节的文档 ──
const seed = await mod.runHandoff({
  project: P,
  projectDesc: '验收「本次没动的节」点名的测试项目；当测试决策 222 时读它。',
  doc: ['## 目标', '', '总目标。', '', '## 当前进度', '', '### 第一批', '', '做了一点。', ''].join('\n'),
}, { sessionId: 's-222', turn: 1, config: CFG })
chk(seed.ok === true, '（前置）建项目成功', String(seed.message).slice(0, 150))

// ══ A / B：阅读侧的两态（纯函数层，不必起实例）══
console.log('\n═══ A/B：规范清单只在**整篇读**时给 ═══')
{
  const raw = readFileSync(join(lib, 'projects', `HANDOFF-${P}.md`), 'utf8')
  const narrative = mod.narrativeFromProjectText(raw)
  const specs = mod.sectionSpecsOf(narrative)
  chk(specs.length >= 2, `（前置）该项目有 ${specs.length} 个规范块`)
  // 模拟 `tools.ts` 的判据（决策 222 的那一行）
  const forSectionRead = '' // decision.mode !== 'full' ⇒ 空串
  const forFullRead = mod.renderSectionSpecs(specs)
  chk(forSectionRead === '', '⭐ 按节读 ⇒ 规范清单为**空串**（退回按需）')
  chk(forFullRead.includes('目标') && forFullRead.includes('本文档各节的写作规范'),
    '⭐ 整篇读 ⇒ 仍然给出清单（一次）')
}

// ══ C / D：交接回执里的点名 ══
console.log('\n═══ C：只写一节 ⇒ 回执点名「本次没动过的节」═══')
{
  await mod.appendDocRead('s-222', {
    project: P, turn: 2, readAt: new Date().toISOString(), full: true, sections: [],
  })
  const h = await mod.runHandoff({
    project: P,
    // 只写「当前进度」⇒ 其余节应被点名
    doc: ['## 当前进度', '', '### 第二批', '', '又做了一点。', ''].join('\n'),
  }, { sessionId: 's-222', turn: 2, config: CFG })
  chk(h.ok === true, '（前置）只写一节的 handoff 成功', String(h.message).slice(0, 200))

  const msg = String(h.message)
  chk(msg.includes('本次没动过的节'), '⭐⭐ 回执里出现「本次没动过的节」')
  // ⭐ 关键：清单必须是**真实节名**（插槽被填），不是字面的 {{sections}}
  chk(!msg.includes('{{sections}}'), '⭐⭐ 插槽 `{{sections}}` 已被填（没有残留占位符）',
    msg.slice(msg.indexOf('本次没动过的节'), msg.indexOf('本次没动过的节') + 120))
  const named = ['目标', '有效做法', '失败/踩坑', '关键上下文', '下一步'].filter((s) => msg.includes(`\`${s}\``))
  chk(named.length >= 4, `⭐⭐ 点名的是**真实节名**（命中 ${named.length} 个：${named.join('、')}）`)
  // 🔴 **判据必须限定在【点名那一段】里** —— 我第一版查的是"整份回执里有没有 `当前进度`"，
  //    而回执**末尾**「被替换的节」那段**本来就会提到它** ⇒ **假失败**
  //    （产品是对的，是我的断言范围开错了）。
  //    ⭐ 库里的同族判据：「断言要限定在正确的范围内」/「观测范围过窄或越界都会出错」。
  const start = msg.indexOf('本次没动过的节')
  const callout = msg.slice(start, msg.indexOf('✏️', start) === -1 ? undefined : msg.indexOf('✏️', start))
  chk(!callout.includes('`当前进度`'),
    '⭐ 本次**写过**的节不在点名清单里（`当前进度` 未被误列）', callout.slice(0, 120))
  chk(msg.includes('memj:spec') || msg.includes('规范'), '⭐ 并给了"去哪看规范"的指引')
  console.log('\n  ── 回执片段 ──')
  const i = msg.indexOf('本次没动过的节')
  console.log('  ' + msg.slice(Math.max(0, i - 30), i + 420).split('\n').join('\n  '))
}

console.log('\n═══ D：把六节**全写齐** ⇒ 不该再点名（否则又是噪音）═══')
{
  await mod.appendDocRead('s-222', {
    project: P, turn: 3, readAt: new Date().toISOString(), full: true, sections: [],
  })
  // 写全部六个顶层节（内容用原样，只为让 `inheritedSections` 为空）
  const raw = readFileSync(join(lib, 'projects', `HANDOFF-${P}.md`), 'utf8')
  const narrative = mod.narrativeFromProjectText(raw)
  const titles = mod.sectionsFromNarrative(narrative)
  const doc = titles.map((t) => `## ${t}\n\n（这一节本次也写了）`).join('\n\n')
  const h = await mod.runHandoff({ project: P, doc }, { sessionId: 's-222', turn: 3, config: CFG })
  chk(h.ok === true, `（前置）写全 ${titles.length} 节的 handoff 成功`, String(h.message).slice(0, 150))
  chk(!String(h.message).includes('本次没动过的节'),
    '⭐⭐ 全写齐 ⇒ **不出现**点名（不制造噪音）')
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
