/**
 * 「取交接」命令的注入内容与档位（决策 110）。
 *
 * ⚠️ **重点在三件事**：
 *   ① **三档的内容差异**（1 不含知识 / 2 含项目知识 / 3 再加主题知识）；
 *   ② ⭐⭐ **第 3 档的去重**——同一张封面既属项目又挂主题时，**只能出现一次**；
 *   ③ ⭐ **档位的语义解析**（认不出时必须**回落默认档**，而不是猜）。
 *
 * 用法：node scripts/test-get-handoff.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-get-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const { runHandoff, DEFAULT_CONFIG } = mod
const CFG = { ...DEFAULT_CONFIG, themeCreation: 'loose' }

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}
const E = (slug, title, extra = {}) => ({
  slug, title, tags: ['t'], desc: `${title}；当测试时读它。`, body: `### ${title}\n\n正文。`, ...extra,
})

console.log(`库根: ${lib}\n`)

// ── 造数据：一个项目，2 条专属知识 + 1 条只挂主题的知识 + 1 条**既属项目又挂主题**的 ──
//    ⭐ 最后那条正是"去重"要验的。
await runHandoff({
  project: 'p-get',
  projectDesc: '取交接测试项目；当测试时读它。',
  doc: '## 目标\n\n**这是项目叙事的关键内容**',
  newThemes: [{ id: 'thm-get', desc: '取交接测试主题；当测试时用它。' }],
  entries: [
    E('own-only', '只属项目', {}),
    E('both', '既属项目也挂主题', { theme: ['thm-get'] }),
  ],
}, { sessionId: 's', config: CFG })
// 再写一条**只挂主题、不属于本项目**的（用另一个项目写，然后挂到同一主题）
await runHandoff({
  project: 'p-other',
  projectDesc: '另一个项目；当测试时读它。',
  entries: [E('theme-only', '只挂主题', { theme: ['thm-get'] })],
}, { sessionId: 's2', config: CFG })

const inj = await import('../lib/index.js')

// ══════════════════════════════════════════════════════════════
console.log('【1】档位解析 parseLevel（语义选择）')
// ══════════════════════════════════════════════════════════════
{
  const P = inj.parseLevel
  check('导出 parseLevel', typeof P === 'function')
  check('「只看文档」⇒ 1 档', P('只看文档') === 1, String(P('只看文档')))
  check('「只要交接文档」⇒ 1 档', P('只要交接文档') === 1)
  check('「连带项目知识」⇒ 2 档', P('连带项目知识') === 2, String(P('连带项目知识')))
  check('「全部」⇒ 3 档', P('全部') === 3, String(P('全部')))
  check('「都要」⇒ 3 档', P('都要') === 3)
  check('⭐「全部」**不会被 1 档截走**（先判 3）', P('全部') === 3)
  check('⭐ 认不出 ⇒ undefined（**不猜**）', P('整理一下') === undefined, String(P('整理一下')))
  check('  空串 ⇒ undefined', P('') === undefined)
  check('  默认档是 2', inj.DEFAULT_LEVEL === 2, String(inj.DEFAULT_LEVEL))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【2】⭐ 三档的内容差异')
// ══════════════════════════════════════════════════════════════
{
  const r1 = await inj.renderProjectHandoff('p-get', 1)
  check('1 档渲染成功', r1 !== undefined)
  check('⭐⭐ 1 档含交接文档叙事', r1.text.includes('这是项目叙事的关键内容'))
  check('⭐⭐ 1 档**不含任何知识**', !r1.text.includes('只属项目') && !r1.text.includes('既属项目也挂主题'))
  check('  1 档计数值为 0', r1.counts.project === 0 && r1.counts.theme === 0)

  const r2 = await inj.renderProjectHandoff('p-get', 2)
  check('2 档含本项目的**两条**知识', r2.text.includes('只属项目') && r2.text.includes('既属项目也挂主题'))
  check('⭐ 2 档**不含**只挂主题那条', !r2.text.includes('只挂主题'))
  check('  2 档计入 2 条', r2.counts.project === 2, String(r2.counts.project))

  const r3 = await inj.renderProjectHandoff('p-get', 3)
  check('⭐⭐ 3 档**含**只挂主题那条（另一项目来的）', r3.text.includes('只挂主题'))
  // ⚠️ 判据必须用**唯一 id 的行数**，不能用标题词频——
  //    我第一版用 `match(/既属项目也挂主题/g)`，而那个词在**标题与 desc 里各出现一次**
  //    ⇒ 一条封面也算出"2 次"，**假失败**（踩过）。
  const bothId = (await inj.scanLibrary()).covers.find((c) => c.cover.title === '既属项目也挂主题')
    ?.cover.id
  check('⭐⭐ 3 档**去重**：既属项目又挂主题的只出现 **1 次**',
    (r3.text.match(new RegExp(bothId, 'g')) ?? []).length === 1,
    `出现 ${(r3.text.match(new RegExp(bothId, 'g')) ?? []).length} 次`)
  check('  3 档主题新增计数为 1（只挂主题那条）', r3.counts.theme === 1, String(r3.counts.theme))
  check('  3 档仍含交接文档', r3.text.includes('这是项目叙事的关键内容'))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【3】⭐⭐ 知识只给「标题+描述+id+阅读方式」，不给正文')
// ══════════════════════════════════════════════════════════════
{
  const r3 = await inj.renderProjectHandoff('p-get', 3)
  check('⭐ 给了 id', /[0-9a-f]{8}-/.test(r3.text))
  check('⭐ 给了标题', r3.text.includes('**只属项目**'))
  check('⭐ 给了描述', r3.text.includes('当测试时读它'))
  check('⭐ 给了阅读方式（memj_read）', r3.text.includes('memj_read'))
  check('⭐⭐ **不含正文**', !r3.text.includes('### 只属项目'))
  check('⭐ 明说"正文按需读"', r3.text.includes('按需读'))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【4】⭐ 提醒模型"本次目标是哪个项目"')
// ══════════════════════════════════════════════════════════════
{
  const r2 = await inj.renderProjectHandoff('p-get', 2)
  check('⭐ 明说目标项目 id', r2.text.includes('p-get'))
  check('⭐ 提到"不必再调 memj_info"', r2.text.includes('memj_info'))
  check('🔴 **用弱措辞**（"本次交接的目标"而非"本会话属于"）',
    r2.text.includes('本次交接的目标项目') && !r2.text.includes('本会话属于'))
  check('⚠️ 且提醒"换了话题仍要重新判断"', r2.text.includes('另一件事'))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【5】主题交接 renderThemeHandoff')
// ══════════════════════════════════════════════════════════════
{
  const t = await inj.renderThemeHandoff('thm-get')
  check('主题渲染成功', t !== undefined, 'undefined')
  check('含主题 id', t.text.includes('thm-get'))
  check('含主题描述', t.text.includes('取交接测试主题'))
  // ⚠️ 库里有 3 条知识，但**只有 2 条挂了这个主题**（"只属项目"那条没挂）
  //    ⇒ 主题视图给 2 条才对。我第一版把期望写成 3，是**断言错了**（踩过）。
  check('⭐ 只含**挂了这个主题**的知识（2 条，不是全部 3 条）',
    t.counts.covers === 2, String(t.counts.covers))
  check('  且不含没挂主题的那条', !t.text.includes('只属项目'))
  check('⭐ 含覆盖的项目（p-get 与 p-other）',
    t.counts.projects === 2 && t.text.includes('p-get') && t.text.includes('p-other'),
    String(t.counts.projects))
  check('⭐ 只给标题不给正文', t.text.includes('**只挂主题**') && !t.text.includes('### 只挂主题'))
  check('⭐ 提醒按需读', t.text.includes('memj_read'))
  check('  不存在的主题 ⇒ undefined', (await inj.renderThemeHandoff('nope')) === undefined)
  check('  不存在的项目 ⇒ undefined', (await inj.renderProjectHandoff('nope', 2)) === undefined)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【6】⭐⭐ 收尾指令：注入完就停，不许自行动作（用户拍板）')
// ══════════════════════════════════════════════════════════════
// 🔴 这条防的是：命令用 `followup`（**会唤醒**）⇒ 模型必然开始一轮，
//    而注入文本原来**以内容结尾、没有任何收尾** ⇒ 模型只能自己猜该干什么
//    ⇒ 容易**自行动作**（写库 / 改文档 / 调工具核对），而用户只想让它"知道上下文"。
{
  const C = inj.CLOSING_INSTRUCTION
  check('⭐ 导出了 CLOSING_INSTRUCTION（测试引用同一份，不手抄）',
    typeof C === 'string' && C.length > 0)

  // ⭐⭐ **三档都要有**（用户明确要求"不管什么档位"）
  for (const lv of [1, 2, 3]) {
    const r = await inj.renderProjectHandoff('p-get', lv)
    check(`⭐⭐ 项目第 ${lv} 档含收尾指令`, r.text.includes(C), `档位 ${lv}`)
    check(`  ⭐ 第 ${lv} 档明说"已注入完毕/这就够了"`,
      r.text.includes('以上内容已注入完毕——这就够了'))
  }

  // ⭐ 主题交接也要有（用户拍板"一起改"）
  const t = await inj.renderThemeHandoff('thm-get')
  check('⭐⭐ 主题交接也含**同一份**收尾指令', t.text.includes(C))

  // ── 硬措辞的三个要件：明确禁止项 + 唯一允许项 + 停下 ──
  check('🔴 明说"不要写库"', C.includes('不要写库'))
  check('🔴 明说"不要改交接文档"', C.includes('不要改交接文档'))
  check('🔴 明说"不要调工具去核对或补全"', C.includes('不要调工具去核对或补全'))
  check('⭐ 只允许"告诉用户接下来可以让你做什么"',
    C.includes('告诉用户接下来可以让你做什么'))
  check('⚠️ 明说"然后就停下"', C.includes('然后就停下'))
  check('⚠️ 明说"不要自行开始那件事"', C.includes('不要自行开始那件事'))
  check('⭐ 说清这些信息的作用是"知道上下文"而非"产出"',
    C.includes('让你知道上下文') && C.includes('不是**让你产出**'))

  // ── 注入文本**以收尾指令结尾**（不被别的内容甩在后面）──
  const r3 = await inj.renderProjectHandoff('p-get', 3)
  check('⭐⭐ 项目注入文本**以收尾指令结尾**', r3.text.trimEnd().endsWith(C.trimEnd()),
    JSON.stringify(r3.text.slice(-80)))
  check('⭐⭐ 主题注入文本**以收尾指令结尾**', t.text.trimEnd().endsWith(C.trimEnd()),
    JSON.stringify(t.text.slice(-80)))
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
