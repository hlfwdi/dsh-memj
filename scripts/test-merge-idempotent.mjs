/**
 * ⭐⭐ **验收：规范块不再被写两遍**（2026-10-12 修的那个【预先存在】的 bug）。
 *
 * ── 为什么它必须进套件 ──────────────────────────────────────────────────────
 * 它**静默潜伏了很久**（我用 `git stash` 回改动前跑同一场景才确认不是我引入的）：
 *   · 文档照常能读、规范照常生效（`sectionSpecsOf` 取第一个块）；
 *   · 只是**每轮交接多长一份** —— 而"没写全所有节"是**常态**。
 * ⚠️ 这类"看起来正常、只是慢慢变胖"的失败，**不会有任何既有断言报红**。
 *
 * ── 要证的四条 ──────────────────────────────────────────────────────────────
 *  ① 建项目：块数 == 节数（基线正确）；
 *  ② **连续 3 轮只写一节**：块数**保持**不变（原 bug：每轮 +N）；
 *  ③ **正文逐字没丢**（修的是"重复写块"，不能把正文一起剥掉）；
 *  ④ ⭐ 自定义节（非模板节名）那条通路**也要**不重复（它走另一支代码）。
 *
 * ⚠️ 独立临时库根，不碰生产库。用法：node scripts/test-merge-idempotent.mjs
 */
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-merge-'))
mkdirSync(join(lib, 'projects'), { recursive: true })
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
const CFG = { ...mod.DEFAULT_CONFIG, themeCreation: 'loose', backupGit: false }
const F = String.fromCharCode(96, 96, 96) + 'memj:spec'
const blocks = (t) => t.split(F).length - 1

let pass = 0
let fail = 0
const chk = (ok, name, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  🔴 ${name}${extra ? '  ← ' + extra : ''}`) }
}

const P = 'mergeidem'

console.log('═══ 【1】建项目：基线（块数 == 节数）═══')
const seed = await mod.runHandoff({
  project: P,
  projectDesc: '验收规范块不重复写；当测试合并幂等时读它。',
  doc: ['## 目标', '', '总目标（这句必须活下来）。', '', '## 当前进度', '', '### 第一批', '', '第一批的事。', ''].join('\n'),
}, { sessionId: 's-mi', turn: 1, config: CFG })
chk(seed.ok === true, '（前置）建项目成功', String(seed.message).slice(0, 150))
{
  const t = readFileSync(join(lib, 'projects', `HANDOFF-${P}.md`), 'utf8')
  const n = mod.sectionsFromNarrative(mod.narrativeFromProjectText(t)).length
  chk(blocks(t) === n, `块数 == 节数（${blocks(t)} vs ${n}）`)
}

console.log('\n═══ 【2】⭐⭐ 连续 3 轮只写「当前进度」⇒ 块数**不得增长** ═══')
{
  const counts = []
  const bodies = []
  for (let turn = 2; turn <= 4; turn += 1) {
    await mod.appendDocRead('s-mi', {
      project: P, turn, readAt: new Date().toISOString(), full: true, sections: [],
    })
    const h = await mod.runHandoff({
      project: P,
      doc: `## 当前进度\n\n### 第${turn}批\n\n第 ${turn} 轮写的内容。\n`,
    }, { sessionId: 's-mi', turn, config: CFG })
    if (h.ok !== true) { chk(false, `第 ${turn} 轮 handoff 成功`, String(h.message).slice(0, 200)); break }
    const t = readFileSync(join(lib, 'projects', `HANDOFF-${P}.md`), 'utf8')
    counts.push(blocks(t))
    bodies.push(t)
  }
  console.log(`      三轮后的块数：${counts.join(' → ')}`)
  // ⭐ 核心断言：三轮全部相同（原 bug 会 6 → 11 → 16 → 21）
  chk(counts.length === 3 && counts.every((c) => c === counts[0]),
    `⭐⭐ 三轮后块数**保持不变**（${counts.join(' → ')}）—— 原 bug 每轮 +5`)
  chk((counts[0] ?? 0) <= 6, `块数没有膨胀（${counts[0]} ≤ 6）`)

  console.log('\n═══ 【3】⭐ 正文逐字没丢（修的是重复，不是删正文）═══')
  const last = bodies[bodies.length - 1] ?? ''
  chk(last.includes('总目标（这句必须活下来）。'), '⭐ 未写过的节的**正文**仍在（逐字）')
  chk(last.includes('第 4 轮写的内容。'), '⭐ 写过的那一轮内容也在')
  chk(!/\{\{|undefined/.test(last), '文档里没有 `{{}}` / `undefined` 之类的空洞')
}

console.log('\n═══ 【4】⭐ 自定义节（非模板节名）那条通路也不重复 ═══')
{
  const P2 = 'mergeidem2'
  const P3 = 'zzz-custom-x'
  await mod.runHandoff({
    project: P3,
    projectDesc: '自定义节通路；当测试合并幂等时读它。',
    // ⚠️ 用一个**不在默认六节里**的节名 ⇒ 走"非标准节"那一支代码。
    doc: ['## 目标', '', '目标正文。', '', '## 我自己的节', '', '自定义节的正文（必须活下来）。', ''].join('\n'),
  }, { sessionId: 's-mi2', turn: 1, config: CFG })
  await mod.appendDocRead('s-mi2', {
    project: P3, turn: 2, readAt: new Date().toISOString(), full: true, sections: [],
  })
  const before = readFileSync(join(lib, 'projects', `HANDOFF-${P3}.md`), 'utf8')
  const b0 = blocks(before)
  await mod.runHandoff({
    project: P3,
    doc: '## 目标\n\n目标正文（改了一句）。\n',
  }, { sessionId: 's-mi2', turn: 2, config: CFG })
  const after = readFileSync(join(lib, 'projects', `HANDOFF-${P3}.md`), 'utf8')
  chk(blocks(after) === b0, `⭐ 自定义节那条通路也不重复（${b0} → ${blocks(after)}）`)
  chk(after.includes('自定义节的正文（必须活下来）。'), '⭐ 自定义节的正文没丢')
  void P2
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
