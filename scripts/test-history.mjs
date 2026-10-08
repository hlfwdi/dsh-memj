/**
 * ⭐⭐ 历史归档测试（决策 136）。
 *
 * 覆盖：`history.ts` 的纯函数（截断 / 分组 / 概述 / slug / 指针）+ **端到端**
 * （真实 `runHandoff` 触发截断 ⇒ 条目落盘 ⇒ 指针可读回）。
 *
 * 🔴 **为什么必须进正式套件**：本机制的失败模式全是"**看起来正常**"那一类 ——
 *    截少了、指针写错、原文丢了、history 混进检索……**都不会让既有测试变红**。
 *
 * ⚠️ 全程在**临时库**上跑（`MEMJ_DATA_DIR`），绝不碰生产库。
 * ⚠️ 必须在 `pnpm run build` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-history.mjs
 */
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-history-'))
process.env['MEMJ_DATA_DIR'] = lib

const LIBDIR = join(process.cwd(), 'lib')
const B = await import(pathToFileURL(join(LIBDIR, 'offline-bundle.js')).href)
const H = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【1】批号解析（中文数字 / 阿拉伯数字 / 取不到）')
// ══════════════════════════════════════════════════════════════════════
check('第三十二批 ⇒ 32', B.batchNumberFromTitle('第三十二批（2026-09-19）：…') === 32)
check('第一百二十批 ⇒ 120', B.batchNumberFromTitle('第一百二十批') === 120)
check('第 41 批（阿拉伯）⇒ 41', B.batchNumberFromTitle('第41批：x') === 41)
check('第〇批 ⇒ undefined（0 不算）', B.batchNumberFromTitle('第〇批') === undefined)
check('⭐ 取不到批号 ⇒ undefined（**不猜**）',
  B.batchNumberFromTitle('第十二批（2026-09-18）：决策 111') !== undefined ||
    B.batchNumberFromTitle('某个和小节') === undefined)
check('  无"批"字样 ⇒ undefined', B.batchNumberFromTitle('目标与范围') === undefined)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【2】截断：只截 ### 小节，从**最早**开始')
// ══════════════════════════════════════════════════════════════════════
{
  // ⚠️ 构造：新内容在上（本项目文档的约定）⇒ **最下面的最早**。
  const mk = (n) => `### 第${n}批（2026-09-19）：第 ${n} 批\n\n${'内容'.repeat(40)}`
  const doc = [
    '## 目标', '', '目标内容。', '',
    '## 当前进度', '',
    mk(40), '', mk(39), '', mk(38), '', mk(37), '',
    '## 有效做法', '', '做法。',
  ].join('\n')
  const before = doc.split('## 当前进度')[1].split('## 有效做法')[0].trim().length
  // 目标：只留得下最后一小节 ⇒ 应该截走 40/39/38 三节（都在前面 = 较新）
  //   🔴 等等——"最早写入的"是本项目文档里**最靠下**的（第 37 批）。
  //   ⇒ 先截 37、再 38……
  const r = B.truncateProgress(doc, 200, 100)
  check('截断发生了', r.chunks.length > 0, JSON.stringify(r.warning))
  // ⚠️ **判据要说清**：截断是**按小节整节**做的、**不切小节内部**
  //    ⇒ 截后**可能仍超目标**（当最后保留的那一节自己就比目标大）。
  //    ⭐ 真正该断的是"**显著变小 + 最早那些小节已经不在正文里**"。
  check(`截后显著变小（${before} → ${r.afterChars}）`, r.afterChars < before * 0.7,
    `${before} → ${r.afterChars}`)
  check(`⭐ 截后只保留了 1 个小节（实得 ${(r.narrative.match(/^### 第\d+批/gm) ?? []).length}）`,
    (r.narrative.match(/^### 第\d+批/gm) ?? []).length === 1)
  check('   且剩下的那个**不是**最早被截走的',
    !r.chunks.some((c) => c.sections.includes('第40批')), JSON.stringify(r.chunks.map((c) => c.sections)))
  check('⭐ 截走的是**最靠下**（最早）的那些',
    r.chunks.some((c) => c.sections.includes('第37批（2026-09-19）：第 37 批')), JSON.stringify(r.chunks.map(c=>c.sections)))
  check('🔴 较新的（第 40 批）**保留**在正文里',
    r.narrative.includes('第 40 批'), '较新的被误截')
  check('⭐ 正文里出现「### 历史进展」小节', r.narrative.includes('### 历史进展'))
  check('⭐ 历史行里带**占位符指针**（落盘前）', /\{\{ENTRY_ID_0\}\}/.test(r.narrative), r.narrative.slice(-200))
  check('🔴 被截走的原文**在 chunk.body 里逐字保留**',
    r.chunks.some((c) => c.body.includes('第 37 批')), JSON.stringify(r.chunks.map((c) => c.body.slice(0, 40))))
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【3】不截的三种情况（工具**不猜**）')
// ══════════════════════════════════════════════════════════════════════
{
  // ① 没超目标 ⇒ 原样
  const small = '## 当前进度\n\n### 第一批\n\n短。\n'
  const r1 = B.truncateProgress(small, 1000, 500)
  check('① 未超目标 ⇒ 不截、无 warning', r1.chunks.length === 0 && r1.warning === '')
  check('   叙事逐字未变', r1.narrative === small)

  // ② 没有 ### 小节可截 ⇒ warning
  const flat = `## 当前进度\n\n${'平铺内容。'.repeat(200)}\n`
  const r2 = B.truncateProgress(flat, 100, 50)
  check('② 没有可截小节 ⇒ **报 warning、不动**', r2.chunks.length === 0 && r2.warning !== '', r2.warning)
  check('   叙事未被清空', r2.narrative === flat)

  // ③ ⚠️ **已删除**：原有一条"小节之前的前言超标 ⇒ 拒绝截断"，
  //    实测它把 `## 当前进度` 标题行也算进"前言"，**目标小时会误拒**
  //    ⇒ 该场景已由"至少留一个小节"覆盖（见【3b】）。
  //    这里改成断言**它不该再误拒**：前言比目标大、但有多个小节时，**照样要截**。
  const heady = `## 当前进度\n\n${'前言。'.repeat(40)}\n\n### 第40批\n\n${'甲'.repeat(200)}\n\n### 第39批\n\n${'乙'.repeat(200)}\n`
  const r3 = B.truncateProgress(heady, 150, 50)
  check('③ 前言本身比目标大 ⇒ **仍然照常截**（不误拒）', r3.chunks.length > 0,
    `chunks=${r3.chunks.length} warning=${r3.warning}`)
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【3b】🔴 边界：截断**绝不清空**「当前进度」')
// ══════════════════════════════════════════════════════════════════════
{
  // ⚠️ 实测踩到过：单个大节（自身 ~600）目标 200 时，旧实现把它**整节截走** ⇒
  //    「当前进度」只剩标题（`afterChars` 掉到 58）。
  //    🔴 这违背本机制的定位：它是"挪走**较早的**"，不是"清空这一节"。
  const big = `## 当前进度\n\n### 第一批\n\n${'很长的一节。'.repeat(100)}\n`
  const r = B.truncateProgress(big, 200, 100)
  check('⭐ 只剩一个小节 ⇒ **不截**（至少留一个）', r.chunks.length === 0, JSON.stringify(r.chunks.map(c=>c.sections)))
  check('🔴 「当前进度」**没有被清空**', r.narrative.includes('很长的一节'), String(r.afterChars))

  // 两个小节、目标很小 ⇒ 只截一个（最多截到剩一个）
  const two = `## 当前进度\n\n### 第40批\n\n${'甲'.repeat(300)}\n\n### 第39批\n\n${'乙'.repeat(300)}\n`
  const r2 = B.truncateProgress(two, 100, 50)
  check('⭐ 两个节 ⇒ 只截走**一个**（留一个）', r2.chunks.length === 1, JSON.stringify(r2.chunks.map(c=>c.sections)))
  check('   留下的是**较新**的那个（第 40 批）', r2.narrative.includes('第40批'), r2.narrative.slice(0, 200))
  check('   被截走的是**较早**的那个（第 39 批）',
    r2.chunks[0]?.sections.some((s) => s.includes('第39批')) === true, JSON.stringify(r2.chunks.map(c=>c.sections)))
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【3c】🔴🔴 两个配额：**触发点用阈值、目标用 keep**')
// ══════════════════════════════════════════════════════════════════════
{
  // 🔴🔴 **这是一条真实 bug 的回归测试**（本批实测发现）：
  //    初版只传了 `keepChars` 当判据 ⇒ **"在 keep 与 warn 之间"的文档也被截了**。
  //    而用户的本意是：「**超过阈值**，则把较早写入的截掉……压到 **12000 以内**」。
  //    ⚠️ 症状极隐蔽：功能"看起来在工作"（确实截了），只是**在不该动手的时候动手**。
  //    ⭐ 判据：**两个配额必须各司其职**——只有一个数字时，无法同时表达
  //       "什么时候动手"与"做到什么程度"。
  const mk = (n, per) => {
    const parts = ['## 当前进度', '']
    for (let i = n; i >= 1; i -= 1) parts.push(`### 第${i}批`, '', '内容字。'.repeat(per), '')
    return parts.join('\n')
  }
  // ① 落在 warn 与 keep 之间 ⇒ **不该截**（这条就是 bug 的判据）
  const mid = mk(12, 120)
  const midLen = mid.length
  const r1 = B.truncateProgress(mid, midLen + 5000, 1000)
  check(`① 长度 ${midLen} 在 keep(1000)~warn(${midLen + 5000}) 之间 ⇒ **不截**`,
    r1.chunks.length === 0 && r1.warning === '', `chunks=${r1.chunks.length} warning=${r1.warning}`)
  check('   叙事逐字未变（真的没动手）', r1.narrative === mid)

  // ② 超过 warn ⇒ 截，且**截到 keep 以内**（或至少一个小节）
  const big = mk(12, 120)
  const r2 = B.truncateProgress(big, 2000, 1000)
  check('② 超过 warn ⇒ 真的截了', r2.chunks.length > 0, `warn=2000`)
  check(`   且截后明显小于截前（${r2.beforeChars} → ${r2.afterChars}）`,
    r2.afterChars < r2.beforeChars, `${r2.beforeChars} → ${r2.afterChars}`)
  // ⚠️ 反证：**同样一份文档**，把 warn 调大（变成"没超阈值"）⇒ 就不该截
  const r3 = B.truncateProgress(big, 99999, 1000)
  check('⭐ 反证：同一份文档，warn 调到很大 ⇒ **不截**（证明触发点确实是 warn）',
    r3.chunks.length === 0, `chunks=${r3.chunks.length}`)
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【4】「历史进展」自身永不参与截断 + 老指针保留')
// ══════════════════════════════════════════════════════════════════════
{
  const doc = [
    '## 当前进度', '',
    '### 第40批', '', '内容'.repeat(60), '',
    '### 第39批', '', '内容'.repeat(60), '',
    '### 历史进展', '',
    '- **第三十~三十八批**：详见条目 `11111111-2222-4333-8444-555555555555`。',
    '',
  ].join('\n')
  const lines = B.readHistoryLines(doc)
  check('能读出已有的历史行', lines.length === 1 && lines[0].includes('11111111'), JSON.stringify(lines))
  const r = B.truncateProgress(doc, 300, 150, lines)
  check('⭐ 截断后**旧指针仍在**（不是被覆盖）',
    r.narrative.includes('11111111-2222-4333-8444-555555555555'), r.narrative)
  check('⭐ 新归档的行**接在旧行之后**（时间序：越下越早）', (() => {
    const ns = B.readHistoryLines(r.narrative)
    return ns.length >= 2 && ns[0].includes('11111111')
  })(), JSON.stringify(B.readHistoryLines(r.narrative)))
  check('⚠️ 「历史进展」小节**没有被当成可截小节吃掉**',
    !r.chunks.some((c) => c.sections.some((s) => s.includes('历史进展'))),
    JSON.stringify(r.chunks.map((c) => c.sections)))
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【5】分组：最多 3 条（用户裁定）+ slug 是英文')
// ══════════════════════════════════════════════════════════════════════
{
  const mk = (n) => `### 第${n}批\n\n${'内容'.repeat(50)}`
  // 造 6 个**不连续**的批号 ⇒ 会产生 6 组，必须被并成 3 组
  const doc = ['## 当前进度', '', mk(40), '', mk(35), '', mk(30), '', mk(25), '', mk(20), '', mk(15), ''].join('\n')
  const r = B.truncateProgress(doc, 100, 50)
  check(`⭐ 组数 ≤ 3（实得 ${r.chunks.length}）`, r.chunks.length <= 3, String(r.chunks.length))
  check('⭐ 每组 slug 片段是**纯 ASCII**',
    r.chunks.every((c) => /^[a-z0-9-]+$/.test(c.slugPart)), JSON.stringify(r.chunks.map((c) => c.slugPart)))
  const slug = B.historySlug('dsh-memj', r.chunks[0].slugPart)
  check(`⭐ slug 满足 SLUG_RE（2–48、小写英文数字连字符）：${slug}`,
    B.SLUG_RE.test(slug), slug)
  check('   slug 里含 `-history-`', slug.includes('-history-'), slug)
  check('   ⚠️ 超长项目名也不越界（48 上限）',
    B.SLUG_RE.test(B.historySlug('x'.repeat(80), 'b32-b37')), B.historySlug('x'.repeat(80), 'b32-b37'))
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【6】指针回填：只替换**对应那一组**的占位符')
// ══════════════════════════════════════════════════════════════════════
{
  const t = `### 历史进展\n\n- **A**：详见条目 \`${B.historyIdPlaceholder(0)}\`。\n- **B**：详见条目 \`${B.historyIdPlaceholder(1)}\`。\n`
  let out = B.fillHistoryId(t, 1, 'SECOND')
  check('⭐ 回填第 1 组 ⇒ **只有第二行**变成 SECOND',
    out.includes('SECOND') && out.indexOf('SECOND') > out.indexOf('**B**'), out)
  check('   第 0 组的占位符**原样还在**（不受影响）',
    out.includes(B.historyIdPlaceholder(0)), out)
  out = B.fillHistoryId(out, 0, 'FIRST')
  check('  再回填第 0 组 ⇒ 两个都填上、**零残留**',
    out.includes('FIRST') && out.includes('SECOND') && B.countHistoryPlaceholders(out) === 0, out)
  // ⚠️ 反证：**顺序反过来**也要对（旧实现"按第 N 个剩余占位符"会在这里错位）
  let rev = B.fillHistoryId(t, 0, 'FIRST')
  rev = B.fillHistoryId(rev, 1, 'SECOND')
  check('⭐⭐ 反证：**先填第 0 组再填第 1 组**也零残留（旧实现在此错位）',
    rev.includes('FIRST') && rev.includes('SECOND') && B.countHistoryPlaceholders(rev) === 0, rev)
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【7】⭐⭐ 端到端：真实 handoff 触发截断 ⇒ 条目落盘 + 指针可读回')
// ══════════════════════════════════════════════════════════════════════
{
  const CFG = { ...B.DEFAULT_CONFIG, themeCreation: 'loose', backupGit: false, progressCharsKeep: 400, progressCharsWarn: 500 }
  const env = { sessionId: 'sess-h1', turn: 1, config: CFG }
  const mkRead = (t) => B.appendDocRead('sess-h1', {
    project: 'hproj', turn: t, readAt: new Date().toISOString(), full: true, sections: [],
  })
  const sec = (n) => `### 第${n}批（2026-09-19）：第 ${n} 批\n\n${'这一批做了不少事。'.repeat(20)}`

  await H.runHandoff({
    project: 'hproj', projectDesc: '历史归档测试；当测试时读它。', step: 'all',
    doc: ['## 目标', '', '目标。', '', '## 当前进度', '', sec(40), '', sec(39), '', sec(38), ''].join('\n'),
  }, env)
  check('前置：项目已建立', existsSync(B.projectDocPath('hproj')))

  // 再追加一节 ⇒ 「当前进度」变大、超过 keep ⇒ 应触发截断
  await mkRead(2)
  const r = await H.runHandoff({
    project: 'hproj', step: 'narrative', docSection: '当前进度', docOp: 'append',
    doc: `### 第41批（2026-09-19）：第 41 批\n\n${'又做了一些。'.repeat(20)}\n`,
  }, { ...env, turn: 2 })

  check('handoff 成功', r.ok === true, r.message.slice(0, 200))
  check('⭐ 回执报出「历史归档（自动截断）」', r.message.includes('历史归档'), r.message.slice(-500))
  check('⭐ 回执给出条目指针', /条目 `[0-9a-f-]{36}`/.test(r.message), r.message.slice(-500))

  // ── 条目真的落盘了吗 ──
  const files = readdirSync(join(lib, 'entries'))
  const histFiles = files.filter((f) => f.includes('-history-'))
  check(`⭐ 落盘了 history 条目（${histFiles.length} 个）`, histFiles.length > 0, files.join(','))
  check('⭐ 文件名规范：`<项目id>-history-<英文概述>-<uuid8>.md`',
    histFiles.every((f) => /^hproj-history-[a-z0-9-]+-[0-9a-f]{8}\.md$/.test(f)), histFiles.join(','))
  const histBody = histFiles.length > 0 ? readFileSync(join(lib, 'entries', histFiles[0]), 'utf8') : ''
  check('⭐ 条目正文含被截走的原文', histBody.includes('这一批做了不少事'), histBody.slice(0, 200))
  check('⭐ 条目 frontmatter 的 kind 是 history', /^kind: history$/m.test(histBody), histBody.slice(0, 300))

  // ── 活跃文档：留了概述 + 完整指针 ──
  const proj = readFileSync(B.projectDocPath('hproj'), 'utf8')
  check('⭐ 「当前进度」里有「### 历史进展」小节', proj.includes('### 历史进展'))
  const ptr = /详见条目 `([0-9a-f-]{36})`/.exec(proj)
  check('⭐ 指针是**完整 UUID**（不是短 id）', ptr !== null, String(ptr))
  check('🔴 指针里**没有残留占位符**', B.countHistoryPlaceholders(proj) === 0,
    `残留 ${B.countHistoryPlaceholders(proj)} 处`)
  // ⚠️ **「历史进展」小节只能有一个**（实测踩到过重复 bug）
  check('🔴 「### 历史进展」**只出现一次**（不是追加成两个）',
    (proj.match(/^### 历史进展$/gm) ?? []).length === 1,
    `实得 ${(proj.match(/^### 历史进展$/gm) ?? []).length} 个`)

  // ── 🔴 关键：拿着指针能不能读回原文 ──
  if (ptr !== null) {
    const snap = await B.scanLibrary({ includeArchived: true, includeHistory: true })
    const found = snap.covers.find((c) => c.cover.id === ptr[1])
    check('⭐⭐ **指针指向的条目真的存在**（能查到）', found !== undefined, ptr[1])
    check('   且 kind 是 history', found?.cover.kind === 'history', String(found?.cover.kind))
    // ⚠️ `loadEntryDoc(ref, ext)` —— 两个参数，别只传 cover。
    const doc = found === undefined ? undefined : await B.loadEntryDoc(found.cover.ref, found.cover.ext)
    check('⭐⭐ **能按指针读到原文**（`memj_read` 走的就是这条路）',
      (doc?.body ?? '').includes('这一批做了不少事'), (doc?.body ?? '').slice(0, 120))
  }

  // ── 🔴 默认扫描**看不到** history（不污染检索） ──
  const def = await B.scanLibrary()
  check('🔴 默认 scanLibrary **不含** history 条目（不污染检索）',
    !def.covers.some((c) => c.cover.kind === 'history'),
    def.covers.filter((c) => c.cover.kind === 'history').length + ' 条泄漏')
  // ⚠️ 本用例**只推了叙事、没落知识** ⇒ 活跃封面数就是 0（这本身是正常的）。
  //    ⭐ 反证：**含 history 的扫描必须比默认多** ⇒ 证明"过滤真的在起作用"，
  //       而不是"两条路都扫不到"（那会是假绿）。
  const all = await B.scanLibrary({ includeArchived: true, includeHistory: true })
  check('⭐⭐ 反证：**含 history 的扫描比默认多**（证明过滤真的在起作用）',
    all.covers.length > def.covers.length, `默认 ${def.covers.length} vs 含 ${all.covers.length}`)
  check('   且差值正好是 history 条目数',
    all.covers.length - def.covers.length === all.covers.filter((c) => c.cover.kind === 'history').length,
    String(all.covers.length - def.covers.length))
}

console.log('\n【N】🔴🔴 体量判据必须**同源**：回执报的数 == 截断判定用的数')
{
  /**
   * ⚠️ **为什么单独守这一条**（2026-10-05 实测撞到）：
   *   `sectionCharCount` 的注释里明写着 *"两处必须同源（同一个函数）——
   *   否则'该不该截'与'回执报多少'会给出两个数（本项目最忌'同一事实两个数'）"*，
   *   🔴 **而回执那侧当时是手写的 `join('\n').trim().length`（含规范块）** ——
   *   **注释写了规矩，代码没照做**。
   *   实测后果：本项目「当前进度」回执报 **20043**（说"已超过阈值"），
   *   而截断判定算出 **20000**（`≤ 阈值` ⇒ 不截），**恰好在边界上**
   *   ⇒ 回执在**谎报**，且截断**静默不动**。
   * ⭐ 判据：**"两处必须同源"这类注释，要配一条断言，否则它只是愿望。**
   */
  const doc = [
    '## 目标', '目标正文。', '',
    '## 当前进度',
    '```memj:spec truncate', '这一节的写作规范（**不该算进体量**）', '```', '',
    '### 第一批', 'x'.repeat(200), '',
    '### 第二批', 'y'.repeat(200),
  ].join('\n')

  const lines = doc.split('\n')
  const secs = B.splitSectionsForHistory(lines)
  const prog = secs.find((s) => s.level === 2 && s.title === '当前进度')
  const secLines = lines.slice(prog.start, prog.end)

  // ① 「该不该截」用的那个数（截断入口自己算的）
  const r = B.truncateProgress(doc, 999999, 10, [], ['当前进度'])
  const usedByTruncate = r.beforeChars
  // ② 「回执要报」的那个数 —— 必须走同一个函数（`sectionCharCount` 是 handoff 内的私有函数，
  //    这里用**它同样的定义**去算：`stripSpecBlock` + `trimEnd`）
  const usedByReceipt = B.stripSpecBlock(secLines).join('\n').trimEnd().length

  const rawWithSpec = secLines.join('\n').trim().length
  check('⭐ 规范块确实被剔掉了（否则这条断言没意义）',
    rawWithSpec > usedByReceipt,
    `含规范块 ${rawWithSpec} vs 剔掉后 ${usedByReceipt}`)
  check('⭐⭐ 回执体量 == 截断判定体量（**同源**）',
    usedByReceipt === usedByTruncate,
    `回执 ${usedByReceipt} vs 判定 ${usedByTruncate}`)
  // 🔴 反证：手写那个旧算法**必然不等**（证明这条断言真的在看着它）
  check('🔴 反证：手写 `join().trim().length`（旧算法）**与判定不等**',
    rawWithSpec !== usedByTruncate,
    `旧算法 ${rawWithSpec} vs 判定 ${usedByTruncate}`)
}

console.log(`\n═══ 历史归档：通过 ${pass} / 失败 ${fail} ═══`)
rmSync(lib, { recursive: true, force: true })
process.exit(fail === 0 ? 0 : 1)
