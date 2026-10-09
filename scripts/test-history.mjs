/**
 * ⭐⭐⭐ **决策 223：归档交给模型 —— 工具的"监察者"职责**（2026-10-12 用户裁定）。
 *
 * ── 🔴🔴 这个文件替代了什么 ──────────────────────────────────────────────────
 * 它原来是 `test-history.mjs`（64 项），测的是**工具自动截断归档**：
 * `truncateProgress` / `batchNumberFromTitle` / `slugSegment` / `historySlug` /
 * `summarize` / 指针回填 / 占位符残留……
 * **那一整套已按用户裁定删除**（归档交给模型、工具读不懂自然语言规范 ⇒ 不再执行）。
 *
 * ── 现在要证什么 ────────────────────────────────────────────────────────────
 * 用户原话：*"归档交给模型，工具嘛，因为没法识别就不要了。完全交给模型吧。
 * 但本身对模型的强提醒和一定程度的校验还是要想办法的。"*
 * ⇒ 工具的**新职责**就是那两条：
 *   ① **强提醒** —— 交接回执里**报出各节字符数**（模型量不出来的那个数字）；
 *   ② **校验** —— 至少保证这个数字**如实、且每节都有**。
 *
 * ⚠️ 用独立临时库根，**不碰生产库**。
 * ⚠️ 必须在 `pnpm run build` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-history.mjs
 */
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-223-'))
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

const P = 'sizes223'

console.log('═══ 【1】`measureSections()`：各节字符数（强提醒的原料）═══')
{
  const doc = [
    '## 目标', '', '总目标。', '',
    '## 当前进度', '', '### 第一批', '', 'x'.repeat(500), '',
    '## 下一步', '', '待办一。', '',
  ].join('\n')
  const sizes = mod.measureSections(doc)
  chk(sizes.length === 3, `三节都量到了（实得 ${sizes.length}）`, JSON.stringify(sizes.map((s) => s.title)))
  const byTitle = new Map(sizes.map((s) => [s.title, s.chars]))
  chk((byTitle.get('当前进度') ?? 0) > 500, `「当前进度」>500（实得 ${byTitle.get('当前进度')}）`)
  // ⭐ 按字符数降序 ⇒ 最该归档的自然浮到最上面
  chk(sizes[0]?.title === '当前进度', '⭐ 结果是**按字符数降序**（最该归档的在最前）',
    JSON.stringify(sizes.map((s) => s.title)))
  // 🔴 规范块**不**计入（否则规范自己那几百字会让判断偏早）
  const withSpec = [
    '## 目标', '', '```memj:spec', '规范正文'.repeat(50), '```', '', '正文。', '',
  ].join('\n')
  const s2 = mod.measureSections(withSpec)
  chk((s2[0]?.chars ?? 999) < 100, `⭐ 规范块**剔出配额**（目标节仅 ${s2[0]?.chars} 字符）`, JSON.stringify(s2))

  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐ 2026-10-09（第二百零六批）：**子节也要量出来**
  // 🔴 为什么加这一组：归档挪走的正是 `###` 子节，而第一版只报顶层 `##` 节
  //    ⇒ 实测后果是**调用方自己去写脚本量子节**（还量错了边界）。
  //    ⭐ 判据：**报数要报到"能够直接动手"的那一级。**
  // ══════════════════════════════════════════════════════════════════════
  const withSubs = [
    '## 当前进度', '',
    '### 第三批（最后）', '', 'y'.repeat(100), '',
    '### 第一批（最早）', '', 'z'.repeat(900), '',
    '### 第二批（中间）', '', 'w'.repeat(400), '',
    '## 下一步', '', '待办。', '',
  ].join('\n')
  const s3 = mod.measureSections(withSubs)
  const prog = s3.find((s) => s.title === '当前进度')
  chk(Array.isArray(prog?.children) && prog.children.length === 3,
    `⭐⭐ 「当前进度」报出 **3 个子节**（实得 ${prog?.children?.length ?? 'undefined'}）`,
    JSON.stringify(prog?.children?.map((c) => c.title)))
  // 子节按字符数降序 ⇒ 最该挪的自然浮到最上面
  const c0 = prog?.children?.[0]
  chk(c0?.title.includes('第一批（最早）'),
    `⭐⭐ 子节也是**按字符数降序**（最该归档的在最前，实得「${c0?.title}」）`)
  chk((c0?.chars ?? 0) > 900, `  ⇒ 它的字符数含标题行（实得 ${c0?.chars}）`)
  // 没有子节的节 ⇒ 空数组（不是 undefined —— 调用方不必防两种形态）
  const nxt = s3.find((s) => s.title === '下一步')
  chk(Array.isArray(nxt?.children) && nxt.children.length === 0,
    '⭐ 没有子节的节 ⇒ `children` 是**空数组**（不是 undefined）')
  // ⚠️ 顶层字数必须**仍然含所有子节**（两级加起来不能对不上）
  const sumSubs = (prog?.children ?? []).reduce((n, c) => n + c.chars, 0)
  chk((prog?.chars ?? 0) >= sumSubs,
    `⭐ 顶层字数 ≥ 子节之和（${prog?.chars} ≥ ${sumSubs}）—— 两级能对得上`)
  // 反证臂：**没有 `###` 的文档** ⇒ children 必须为空（不能凭空造出子节）
  const noSubs = mod.measureSections(['## 甲', '', '正文。', ''].join('\n'))
  chk(noSubs[0]?.children?.length === 0,
    '⭐ 反证：没有 `###` 的节 ⇒ 不凭空造子节',
    JSON.stringify(noSubs[0]?.children))
}

console.log('\n═══ 【2】⛔ 反证：旧机制的函数**确实不在了** ═══')
{
  // 🔴 这条是"删除做干净了没有"的机械证据 —— 比读代码可靠。
  const gone = [
    'truncateProgress', 'truncateOneSection', 'batchNumberFromTitle',
    'slugSegment', 'historySlug', 'summarize', 'fillHistoryId',
    'countHistoryPlaceholders', 'truncateTitlesFromBlocks', 'truncateTitlesFromSpec',
    'defaultTruncateTitle', 'templateTruncateTitle',
  ]
  const stillThere = gone.filter((n) => typeof mod[n] === 'function')
  chk(stillThere.length === 0, `⛔ ${gone.length} 个旧函数**全部已删除**`, `仍在：${stillThere.join(', ')}`)
  // ⭐ 但**读侧**必须留着（存量文档的「历史进展」指针要能读）
  //    ⚠️ 它们**不在 `index.js` 里** —— `history.ts` 从来没被 `index.ts` 导出
  //    （旧测试走的是 `offline-bundle.js`，只有那条路导出它）⇒ 这里也从那儿取。
  const B = await import(pathToFileURL(join(process.cwd(), 'lib', 'offline-bundle.js')).href)
  chk(typeof B.readHistoryLines === 'function', '⭐ `readHistoryLines` 仍保留（读侧，存量兼容）')
  chk(B.HISTORY_SECTION === '历史进展', '⭐ `HISTORY_SECTION` 常量仍保留')
}

console.log('\n═══ 【3】端到端：交接回执里**报出各节体量**，且**不再自动改文档** ═══')
{
  const seed = await mod.runHandoff({
    project: P,
    projectDesc: '验收「报数」机制的测试项目；当测试决策 223 时读它。',
    doc: ['## 目标', '', '总目标。', '', '## 当前进度', '', '### 第一批', '', 'x'.repeat(300), ''].join('\n'),
  }, { sessionId: 's-223', turn: 1, config: CFG })
  chk(seed.ok === true, '（前置）建项目成功', String(seed.message).slice(0, 150))

  const before = readFileSync(join(lib, 'projects', `HANDOFF-${P}.md`), 'utf8')
  await mod.appendDocRead('s-223', {
    project: P, turn: 2, readAt: new Date().toISOString(), full: true, sections: [],
  })
  const h = await mod.runHandoff({
    project: P,
    // 🔴🔴 **用 `docSection` + `append`（只追加），不要整节重写** ——
    //    否则测不出"工具有没有动文档"：整节重写本来就会把旧内容换掉
    //    （那是 `mergeNarrative` 的**既定语义**，不是 bug —— 我第一版就误判过一次，
    //     用 `git stash` 回改动前跑同一场景才确认）。
    //    ⭐ 判据：**要测"工具没多做事"，就得让自己的输入不含"合法的删除"**。
    docSection: '当前进度',
    docOp: 'append',
    doc: '### 第二批\n\n又写了一点。\n',
  }, { sessionId: 's-223', turn: 2, config: CFG })
  chk(h.ok === true, '（前置）handoff 成功', String(h.message).slice(0, 150))

  const msg = String(h.message)
  chk(msg.includes('各节体量') || msg.includes('叙事共'), '⭐ 回执里报了体量', msg.slice(0, 200))
  // ⚠️ 判据要**松**：只要求"节名与数字同时出现"（措辞可能被改）。
  chk(/当前进度[^\n]{0,40}\d+/.test(msg), '⭐ 逐个列出**节名 + 字符数**',
    (msg.split('\n').find((l) => l.includes('当前进度')) ?? '').slice(0, 160))
  chk(msg.includes('工具**不会替你归档**') || msg.includes('不会替你归档'),
    '⭐⭐ 明确告诉模型"工具不会归档、要你自己做"（这就是"强提醒"）')
  chk(!msg.includes('历史归档（自动截断）'), '⛔ 不再有"自动截断"那句话（机制已废）')

  // 🔴🔴 **最要紧的一条：工具不再改正文**
  const after = readFileSync(join(lib, 'projects', `HANDOFF-${P}.md`), 'utf8')
  const growth = after.length - before.length
  chk(growth > 0, `⭐⭐ 只追加 ⇒ 文档**只增长**（+${growth} 字符）—— 工具没删任何东西`)
  // ⚠️⚠️ **判据必须剥掉规范块再判** —— 默认模板的**规范文字里本来就有**
  //    `kind: history`（它在教模型怎么做归档）⇒ 全文搜**必然命中**、报的是假红。
  //    ⭐ 与本项目既有那条同族：**"某东西不该出现"要指明在哪个范围内**。
  //    （这条是我第一版写错、被实测抓出来的 —— 记在这里防复发。）
  const B2 = await import(pathToFileURL(join(process.cwd(), 'lib', 'offline-bundle.js')).href)
  const body = B2.stripAllSpecBlocks(after)
  chk(!/kind: history/.test(body), '⛔ 纯正文里**没有** history 归档（工具不归档了）')
  chk(!body.includes('### 历史进展'), '⛔ 纯正文里**没有**「历史进展」小节（工具不归档了）')
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
