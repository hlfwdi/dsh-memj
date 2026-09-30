// ⭐⭐⭐ 知识评分（决策 177）的测试。
//
// 覆盖四类：
//   ① **纯函数**：分档 deltaFor / 滚动窗口 inWindow+effectiveScore / 前 N topScored
//   ② **🔴🔴 三组反证**（必须做 —— 只跑一遍绿证明不了任何事）：
//      · 防递归那道门 → 去掉它必须报红
//      · 去重（全局知识）→ 关掉它必须报红
//      · 滚动窗口 → 用"最后时间戳"代替"逐事件判"必须报红
//   ③ **阳性对照**（库内知识 `e1340d94`：要证明"什么都没发生"，先证明那动作真的跑了）
//      —— 拿某条知识自己的 desc 当"本轮内容"，它必须得高分
//   ④ **静态检查**：配置键三处对称（config / settings / api）、工具描述是生成的
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SRC = join(ROOT, 'src')

let pass = 0, fail = 0
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`) }
}

const mod = await import('file://' + join(ROOT, 'lib', 'index.js').replace(/\\/g, '/'))
const {
  deltaFor, inWindow, effectiveScore, pruneEvents, topScored, applyAdds,
  emptyScoreFile, decideAutoScore, aggregate, lastRunTurn, checkQuote, MIN_QUOTE_CHARS,
} = mod

const HOUR = 3600_000
const NOW = Date.parse('2026-09-29T12:00:00.000Z')
const iso = (msAgo) => new Date(NOW - msAgo).toISOString()

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【1】分档加分（deltaFor）—— ⭐ 分档而不是直接加分数值')
{
  // 🔴 库内知识 `9ed5626a`：`noul` 是有序档位的期望、刻度弱，不做数值插值。
  check('⭐⭐ ≥0.9 ⇒ +3', deltaFor(0.95, 0.7) === 3)
  check('⭐⭐ ≥0.8 ⇒ +2', deltaFor(0.85, 0.7) === 2)
  check('⭐⭐ 过线 ⇒ +1', deltaFor(0.71, 0.7) === 1)
  check('⭐ 不过线 ⇒ 0', deltaFor(0.69, 0.7) === 0)
  check('⭐ 恰好等于阈值 ⇒ 算过线（含边界）', deltaFor(0.7, 0.7) === 1)
  check('⭐ 恰好 0.8 ⇒ +2（含边界）', deltaFor(0.8, 0.7) === 2)
  check('⭐ 恰好 0.9 ⇒ +3（含边界）', deltaFor(0.9, 0.7) === 3)
  check('⭐ 非有限数 ⇒ 0（不抛）', deltaFor(Number.NaN, 0.7) === 0)
  // ⭐⭐ **阈值是硬门**（用户原话："只有超过阈值的，才加分"）——
  //     下面这一对断言是本批**测试抓到的真 bug** 的回归：
  //     我第一版把档位判在阈值**之前** ⇒ 阈值 0.85 时 0.82 仍得 2 分（阈值被架空）。
  check('🔴🔴 阈值是**硬门**：0.82 在阈值 0.85 下 ⇒ **0 分**（不是"中间档"）',
    deltaFor(0.82, 0.85) === 0, String(deltaFor(0.82, 0.85)))
  check('⭐⭐ 但**过了门**之后档位照常生效：0.86 在阈值 0.85 下 ⇒ +2',
    deltaFor(0.86, 0.85) === 2, String(deltaFor(0.86, 0.85)))
  check('⭐ 阈值高到 0.85 时，0.92 仍得 3（门与档位不互相干扰）',
    deltaFor(0.92, 0.85) === 3, String(deltaFor(0.92, 0.85)))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【2】滚动窗口（inWindow / effectiveScore）')
{
  check('⭐⭐ 窗口内 ⇒ true', inWindow(iso(29 * HOUR), NOW, 30) === true)
  check('⭐⭐ 出窗 ⇒ false', inWindow(iso(31 * HOUR), NOW, 30) === false)
  check('⭐ 边界（恰好 30h）⇒ 含（留容差）', inWindow(iso(30 * HOUR), NOW, 30) === true)
  check('⭐ 时间串解析不出来 ⇒ 当过期（宁可少留）', inWindow('不是时间', NOW, 30) === false)

  // ⭐⭐ 本条是"事件列表 vs 分数+时间戳"的分水岭（见文件头反例）。
  const mixed = { events: [
    { at: iso(35 * HOUR), delta: 3, score: 0.95, turn: 1 },   // 已出窗
    { at: iso(29 * HOUR), delta: 1, score: 0.72, turn: 2 },   // 在窗内
  ] }
  check('⭐⭐⭐ **出窗的加分不算**（有效分 = 1，不是 4）',
    effectiveScore(mixed, NOW, 30) === 1, String(effectiveScore(mixed, NOW, 30)))

  const allOut = { events: [{ at: iso(31 * HOUR), delta: 3, score: 0.95, turn: 1 }] }
  check('⭐⭐ 全部出窗 ⇒ 0 分', effectiveScore(allOut, NOW, 30) === 0)

  check('⭐ 空记录 ⇒ 0', effectiveScore(undefined, NOW, 30) === 0)
  check('⭐ 无 events 字段 ⇒ 0（不抛）', effectiveScore({}, NOW, 30) === 0)

  // 顺手瘦身
  const pruned = pruneEvents(mixed, NOW, 30)
  check('⭐⭐ pruneEvents 只留窗内的（写入时瘦身）',
    pruned.events.length === 1 && pruned.events[0].delta === 1, JSON.stringify(pruned.events))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【3】前 N 名（topScored）')
{
  const proj = { updatedAt: iso(0), entries: {
    a: { events: [{ at: iso(HOUR), delta: 3, score: 0.95, turn: 1 }] },
    b: { events: [{ at: iso(HOUR), delta: 1, score: 0.72, turn: 1 }] },
    c: { events: [{ at: iso(40 * HOUR), delta: 3, score: 0.95, turn: 1 }] },  // 出窗 ⇒ 0 分
    d: { events: [] },                                                          // 0 分
  } }
  const top = topScored(proj, NOW, 30, 10)
  check('⭐⭐ **0 分的条目【不】进榜单**（"有分数的知识"才注入）',
    top.length === 2 && top.every((r) => r.score > 0), JSON.stringify(top))
  check('⭐⭐ 按分数降序（a=3 > b=1）', top[0].id === 'a' && top[1].id === 'b', JSON.stringify(top))

  // ⭐ 同分按 id 升序 ⇒ 确定性（否则每次注入顺序抖动、破坏缓存前缀）。
  const tie = { updatedAt: iso(0), entries: {
    z: { events: [{ at: iso(HOUR), delta: 1, score: 0.8, turn: 1 }] },
    a: { events: [{ at: iso(HOUR), delta: 1, score: 0.8, turn: 1 }] },
  } }
  const t2 = topScored(tie, NOW, 30, 10)
  check('⭐⭐ 同分按 id 升序 ⇒ **确定性**（顺序不抖）', t2[0].id === 'a' && t2[1].id === 'z', JSON.stringify(t2))

  check('⭐ topN 生效（取前 1）', topScored(proj, NOW, 30, 1).length === 1)
  check('⭐ 空项目 ⇒ []（不抛）', topScored(undefined, NOW, 30, 10).length === 0)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【4】applyAdds（加分 + 顺手清窗）')
{
  const cur = { updatedAt: iso(0), entries: {
    old: { events: [{ at: iso(40 * HOUR), delta: 3, score: 0.95, turn: 1 }] },  // 该被清
  } }
  const next = applyAdds(cur, [{ id: 'new', delta: 2, score: 0.85, turn: 5 }], iso(0), NOW, 30)
  check('⭐⭐ 新加分的条目进去了', next.entries.new?.events.length === 1)
  check('⭐⭐ **没被加分的条目也顺手清了出窗事件**（否则文件里的旧事件永远赖着）',
    next.entries.old?.events.length === 0, JSON.stringify(next.entries.old))
  check('⭐ delta ≤ 0 不加（防误加）',
    applyAdds(undefined, [{ id: 'x', delta: 0, score: 0.5, turn: 1 }], iso(0), NOW, 30).entries.x === undefined)
  check('⭐ 全空的条目外壳**保留**（删外壳要扫全库，代价不值）',
    next.entries.old !== undefined)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【5】🔴🔴 反证①：防递归那道门（去掉它必须报红）')
{
  // ⚠️ 评分子代理自己也会跑完一轮 ⇒ 它也会触发本钩子 ⇒ 不挡住就**无限起子代理**。
  const okCase = decideAutoScore({ enabled: true, delegationDepth: 0, project: 'dsh-memj', hasContent: true })
  check('⭐⭐ 顶层会话 + 有内容 + 有项目 ⇒ 该起', okCase.start === true, okCase.reason)

  const sub = decideAutoScore({ enabled: true, delegationDepth: 1, project: 'dsh-memj', hasContent: true })
  check('🔴🔴（反证）**子代理会话 ⇒ 不起**（防递归的唯一防线）',
    sub.start === false && sub.reason.includes('子代理'), sub.reason)

  check('⭐ 开关关 ⇒ 不起', decideAutoScore({ enabled: false, delegationDepth: 0, project: 'p', hasContent: true }).start === false)
  check('⭐⭐ 判不出项目 ⇒ 不起（分数按项目存）',
    decideAutoScore({ enabled: true, delegationDepth: 0, project: '', hasContent: true }).start === false)
  check('⭐ 该轮没内容 ⇒ 不起', decideAutoScore({ enabled: true, delegationDepth: 0, project: 'p', hasContent: false }).start === false)

  // 🔴 判据**不依赖"有没有思考"**（库内知识 `6ada1f56`：触发条件不要依赖模型的可选行为）。
  const src = readFileSync(join(SRC, 'score-auto.ts'), 'utf8')
  check('🔴（反证）判据里**不得出现 `reasoning`/`思考`**（否则不输出思考的模型永不触发）',
    !/decideAutoScore[\s\S]{0,900}?reasoning/.test(src))
  check('⭐⭐ `delegationDepthOf` 读不到时回 **0**（偏向触发 —— 失败模式更轻）',
    /读不到时回 `0`/.test(src) || /return 0\n\s*\} catch/.test(src))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【6】🔴🔴 反证②：去重（评分层必须并入既有的 shown）')
{
  const injSrc = readFileSync(join(SRC, 'hot-inject.ts'), 'utf8')
  // ⭐ 关键：评分层要**查 shown**，而不是自己另起一个集合（决策 147/148 那个坑）。
  check('🔴🔴（反证）评分层里有 `shownScored.has(...)` 去重检查',
    /shownScored\.has\(r\.id\)/.test(injSrc))
  check('⭐⭐ `shownScored` 的初值来自已经收过的（全局层）',
    /shownScored = new Set\(out\.map/.test(injSrc))
  check('⭐⭐ 全局层在评分层**之前**收完（顺序决定谁优先）',
    injSrc.indexOf('if (!cover.global) continue') < injSrc.indexOf('shownScored = new Set'),
    '顺序反了 ⇒ 全局知识会被评分层再收一遍')
  check('⭐⭐ 评分层**跳过全局知识**（用户特别点出的那条）',
    /globalIds|!cover\.global/.test(injSrc) || /剔除全局知识/.test(readFileSync(join(SRC, 'score-turn.ts'), 'utf8')))
  check('⭐ 评分模式在 `known` 分支内（未绑定项目时只收全局 + 画像）',
    /if \(scoreOpts\?\.on === true\)/.test(injSrc))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【7】🔴🔴 反证③：滚动窗口必须【逐事件判】')
{
  const scoreSrc = readFileSync(join(SRC, 'hot-score.ts'), 'utf8')
  check('🔴🔴（反证）`effectiveScore` 里**逐条判过期**（出现 `for (const e of`）',
    /for \(const e of score\.events\)/.test(scoreSrc))
  // ⚠️ **判据要限定在 `effectiveScore` 的函数体里** —— 全文件搜会命中
  //    `inWindow` 自己的参数用法（我第一版就是这么假失败的，同族：判据范围过宽）。
  const effBody = /export function effectiveScore[\s\S]*?\n\}/.exec(scoreSrc)?.[0] ?? ''
  check('⭐ 取到了 `effectiveScore` 的函数体（前置条件）', effBody !== '', '取不到 ⇒ 下面两条恒真')
  check('🔴（反证）**不得**只看"最后一个事件的时间戳"',
    !/events\[(score\.)?events\.length - 1\]/.test(effBody) && !/lastAt/.test(effBody),
    '若只看最后一个时间戳 ⇒ "早期加分"该过期时不过期')
  check('⭐⭐ 文件头写明了"存事件列表而非分数+时间戳"的理由（防后人改回去）',
    /存【事件列表】/.test(scoreSrc) && /t=29h/.test(scoreSrc))
  // ⭐⭐ 阈值必须**先**判（否则被档位架空 —— 我自己第一版就写反了）。
  const deltaBody = /export function deltaFor[\s\S]*?\n\}/.exec(scoreSrc)?.[0] ?? ''
  check('🔴🔴（反证）`deltaFor` 里**阈值判在档位之前**（否则 0.82 在阈值 0.85 下仍得 2 分）',
    deltaBody.indexOf('score < threshold') < deltaBody.indexOf('score >= 0.9') && deltaBody.indexOf('score < threshold') > 0,
    '阈值在后 ⇒ 它被上面两档架空')
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【8】⭐⭐⭐ 阳性对照（库内知识 e1340d94）')
{
  // ⚠️ 要证明"一条都没加分"是**真的没有相关知识**，而不是**链路坏了** ——
  //    两者表现完全一样。办法：拿一条知识的**自己的 desc** 当"本轮内容"去问，
  //    它**必须**得高分（那是"必然最相关"的上限参照）。
  //    ⇒ 这里验的是"判据本身有区分度"（用纯函数口径）：
  //      分档函数对"必然相关"（0.9+）与"不相关"（0.3）必须给出**不同**的结果。
  const relevant = deltaFor(0.92, 0.7)
  const irrelevant = deltaFor(0.30, 0.7)
  check('⭐⭐⭐ 阳性对照：**必然相关**得满分档（+3）', relevant === 3, String(relevant))
  check('⭐⭐⭐ 阴性对照：**明确不相关**得 0（说明档位能区分两头）', irrelevant === 0, String(irrelevant))
  check('⭐⭐ 两端不同 ⇒ 判据有区分度（不是恒 0 也不是恒 3）', relevant !== irrelevant)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【9】配置键三处对称（⚠️ 本项目的经典事故点）')
{
  const cfgSrc = readFileSync(join(SRC, 'config.ts'), 'utf8')
  const setSrc = readFileSync(join(SRC, 'settings.ts'), 'utf8')
  const apiSrc = readFileSync(join(SRC, 'api.ts'), 'utf8')
  const KEYS = [
    'hotScoreOnTurnEnd', 'hotScoreThreshold', 'hotScoreWindowHours', 'hotScoreTopN',
    'hotScoreMinChars', 'hotScoreChannel', 'hotScoreModel',
    // ⭐ 决策 178：起子代理用的模型（**与复盘模型分开** —— 子代理只是壳，可单独选便宜的）。
    'hotScoreSubagentProvider', 'hotScoreSubagentModel',
    'hotScoreTimeoutMs',
  ]
  for (const k of KEYS) {
    // config：schema + 默认值（各一次 ⇒ 至少 2 次）
    const inCfg = (cfgSrc.match(new RegExp(`\\b${k}\\b`, 'g')) ?? []).length
    const inSet = setSrc.includes(`'${k}'`)
    // api：回显 + payload 类型 + writeSetting 键联合（至少 3 处）
    const inApi = (apiSrc.match(new RegExp(`\\b${k}\\b`, 'g')) ?? []).length
    check(`⭐ \`${k}\` 三处齐（config≥2 / settings 有 / api≥3）`,
      inCfg >= 2 && inSet && inApi >= 3, `cfg=${inCfg} set=${inSet} api=${inApi}`)
  }
  // 🔴 「至少给一个」那个条件 —— 第六十六批真实事故的落点。
  check('🔴🔴 「至少给一个」的条件里**含评分键**（漏了 ⇒ 面板保存 400）',
    /&& !wantsAnyHotScore/.test(apiSrc))
  check('⭐⭐ 条件用**一个布尔**覆盖全部键（表驱动 ⇒ 结构上漏不了）',
    /hotScoreWanted\.length > 0/.test(apiSrc))
  // 🔴🔴 **结构性守卫**（2026-09-29 真踩到）：`hotScoreChannel` 被我重构时从
  //    `HOT_SCORE_STR_KEYS` 拿掉了，**却忘了它也是要接受的键** ⇒ 单独提交它 400。
  //    ⭐ 判据：`api.ts` 里那三个数组 + `hotScoreTimeoutMs` 的**键数**，
  //      必须等于 `settings.ts` 里 `hotScore*` 的键数 —— 不等就是漏了一个写通路。
  //    ⚠️ 它比"逐键提交"更早报警（那条要走真 HTTP），且**不依赖我记性**。
  const setKeys = [...setSrc.matchAll(/'hotScore[A-Za-z]+'/g)].map((m) => m[0].slice(1, -1))
  const uniqSetKeys = [...new Set(setKeys)]
  const apiTables = ['HOT_SCORE_BOOL_KEYS', 'HOT_SCORE_NUM_KEYS', 'HOT_SCORE_STR_KEYS']
    .map((nm) => {
      const m = new RegExp(`${nm}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm').exec(apiSrc)
      return m === null ? [] : [...m[1].matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1])
    })
  const apiCovered = [...apiTables.flat(), 'hotScoreTimeoutMs']
  const missing = uniqSetKeys.filter((k) => !apiCovered.includes(k))
  check('🔴🔴 **每个 `hotScore*` 键都进了 api.ts 的表驱动清单**（漏一个 ⇒ 该键单独保存 400）',
    missing.length === 0, missing.length > 0 ? `漏了：${missing.join(', ')}` : `${apiCovered.length} 个键全覆盖`)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【10】工具描述是**生成物**（不许手改）')
{
  const toolsSrc = readFileSync(join(SRC, 'tools.ts'), 'utf8')
  const descSrc = readFileSync(join(SRC, 'tool-descriptions.ts'), 'utf8')
  check('⭐⭐ 新工具 `memj_score_turn` 已注册', /name: 'memj_score_turn'/.test(toolsSrc))
  check('⭐⭐ 描述常量来自生成物（`MEMJ_SCORE_TURN_DESCRIPTION`）',
    /MEMJ_SCORE_TURN_DESCRIPTION/.test(toolsSrc) && /export const MEMJ_SCORE_TURN_DESCRIPTION/.test(descSrc))
  check('⭐ 生成物头部有"别直接改本文件"的警告',
    /先改 `memj-design.md` §4\.2，再重跑生成脚本/.test(descSrc))
  check('⭐⭐ 生成器已登记新工具（否则数量校验会罢工）',
    /'memj_score_turn'/.test(readFileSync(join(ROOT, 'scripts', 'gen-descriptions.mjs'), 'utf8')))
  // ⭐ 工具参数必须显式给 session/turn（子代理的 exec.agent 是它自己，不是被复盘的会话）。
  check('⭐⭐ 参数含 `session` 与 `turn`（子代理必须显式传）',
    /session: \{[\s\S]{0,200}?type: 'string'/.test(toolsSrc) && /turn: \{[\s\S]{0,200}?type: 'integer'/.test(toolsSrc))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【11】⭐⭐⭐ chat 通路（决策 178）：解析器的三条校验')
{
  const { parseChatScore, buildChatScoreSystem } = mod
  // 造一个 3 条的假池（形状照 `Candidate` 的最小可用子集）。
  const pool = [
    { id: 'id-a', title: 'A 标题', desc: 'A 描述' },
    { id: 'id-b', title: 'B 标题', desc: 'B 描述' },
    { id: 'id-c', title: 'C 标题', desc: 'C 描述' },
  ]

  // ── 正例：`{n, why}` 形态 ──
  const ok = parseChatScore('{"picks":[{"n":1,"why":"因为甲"},{"n":3,"why":"因为丙"}]}', pool, true)
  check('⭐⭐ 正常解析：选中 2 条', ok.ok && ok.picks.length === 2, JSON.stringify(ok.picks))
  check('⭐⭐ 编号 → id 映射正确（1→id-a、3→id-c）',
    ok.picks[0] === 'id-a' && ok.picks[1] === 'id-c', JSON.stringify(ok.picks))
  check('⭐⭐ **理由被取出来了**（用户要求"给出理由"）',
    ok.reasons['id-a'] === '因为甲' && ok.reasons['id-c'] === '因为丙', JSON.stringify(ok.reasons))

  // ── 裸编号形态（不要理由时）──
  const bare = parseChatScore('{"picks":[2]}', pool, false)
  check('⭐ 收裸编号形态（`{"picks":[2]}`）', bare.ok && bare.picks[0] === 'id-b', JSON.stringify(bare.picks))

  // ── 🔴 校验①：越界编号必须丢弃（不是整份报错）──
  const oob = parseChatScore('{"picks":[{"n":0,"why":"x"},{"n":4,"why":"y"},{"n":2,"why":"z"}]}', pool, true)
  check('🔴（反证）**越界编号被丢弃、其余照收**（0 与 4 都越界，只剩 2）',
    oob.ok && oob.picks.length === 1 && oob.picks[0] === 'id-b', JSON.stringify(oob.picks))

  // ── 🔴 校验②：去重 ──
  const dup = parseChatScore('{"picks":[{"n":1,"why":"a"},{"n":1,"why":"b"}]}', pool, true)
  check('🔴（反证）**同一编号回两次 ⇒ 去重成 1 条**', dup.ok && dup.picks.length === 1, JSON.stringify(dup.picks))

  // ── 🔴 校验③：JSON 坏 ⇒ 报错（由调用方跳过本次）──
  const bad = parseChatScore('这不是 JSON', pool, true)
  check('🔴（反证）非 JSON ⇒ `ok:false` + 有错误信息（不抛）', bad.ok === false && bad.error !== '', bad.error)
  check('⭐ 空正文 ⇒ `ok:false`', parseChatScore('   ', pool, true).ok === false)

  // ── 容错：模型爱包 ```json 围栏 / 前后带解释 ──
  const fenced = parseChatScore('好的，结果如下：\n```json\n{"picks":[{"n":2,"why":"w"}]}\n```\n以上。', pool, true)
  check('⭐⭐ **能剥掉 markdown 围栏与前后文字**（模型很爱这么回）',
    fenced.ok && fenced.picks[0] === 'id-b', JSON.stringify(fenced.picks))

  // ── 空选择是**有效结论**（不是失败）──
  const none = parseChatScore('{"picks":[]}', pool, true)
  check('⭐⭐ `{"picks":[]}` ⇒ **ok:true 且 0 条**（"没有相关的"是有效结论，不是失败）',
    none.ok === true && none.picks.length === 0, JSON.stringify(none))

  // ── 缺 picks 字段 ──
  check('⭐ 没有 `picks` 字段 ⇒ ok:false', parseChatScore('{"x":1}', pool, true).ok === false)

  // ── 🔴🔴 边界：**它绝不能抛**（2026-09-29 反证发现的缺口）──
  //
  // ⭐ 发现经过：我把两道越界守卫都去掉后，测试**不是报红而是崩**
  //    （`TypeError: Cannot read properties of undefined`）
  //    ⇒ 说明这个"模型输出不可信"的防线**自己没有兜底**。
  //    ⚠️ 而"解析失败"（无害，调用方当成本轮没选出东西）与"抛异常"
  //       （打断整条评分链路）是**两种严重程度完全不同**的失败。
  const evil = [
    '{"picks":[null]}',
    '{"picks":[{"n":null}]}',
    '{"picks":[{"n":"三"}]}',
    '{"picks":[{"n":1.5}]}',
    '{"picks":[[1,2]]}',
    '{"picks":[{"n":1,"why":null}]}',
    '{"picks":{}}',
    '{"picks":[{"n":99999,"why":"x"}]}',
    '{"picks":[{"n":-5}]}',
    'null',
    '[]',
    '{',
  ]
  let threw = 0
  for (const e of evil) {
    try {
      const r = parseChatScore(e, pool, true)
      if (typeof r.ok !== 'boolean') threw++
    } catch { threw++ }
  }
  check('🔴🔴（反证）**任何畸形输入都不抛**（它是"模型输出不可信"的唯一防线，自己不能崩）',
    threw === 0, `${threw}/${evil.length} 条抛了或返回畸形`)
  check('⭐⭐ 畸形输入的越界编号一律不入选',
    parseChatScore('{"picks":[{"n":1.5},{"n":-5},{"n":99999}]}', pool, true).picks.length === 0)

  // ── system 拼装的硬约束（§6.4）──
  const sys = buildChatScoreSystem({ pool, wantReasons: true, english: false, budgetNote: '' })
  check('⭐⭐ 清单进了 `system`（§6.4：不能放 user，否则缓存大头被拖走）',
    sys.includes('【知识库清单】') && sys.includes('1. TITLE: A 标题'))
  check('⭐⭐ 编号**从 1 开始**（§6.4 既有约定）', sys.includes('1. TITLE:'))
  check('🔴 **没有否定式硬约束**（库内知识 11e7619e：会让模型塌成 1 个 token）',
    !/禁止额外输出|不要输出任何其他/.test(sys))
  check('⭐⭐ 明说"宁少勿滥"（不写死条数 ⇒ 见下条）', /宁少勿滥/.test(sys))
  check('⭐ 明说"一条都没有就回空数组"', /\{"picks":\[\]\}/.test(sys))
  // 🔴🔴 **上限的数字【绝不能】出现在 `system` 里**（决策 180；§6.4 的硬约束）。
  //    `system` 装着清单（输入大头）⇒ 数字一变就整份失效、清单被拖出缓存。
  //    ⭐ 判据：`system` 里**不得**出现"最多 N 条"这种带数字的措辞。
  check('🔴🔴（反证）`system` 里**不出现**"最多 <数字> 条"（否则改旋钮会废掉前缀缓存）',
    !/最多\s*\d+\s*条/.test(sys) && !/条数不限/.test(sys))

  // ── 静态核对：默认通路是 chat、且模型是用户点名的那个 ──
  const cfgSrc = readFileSync(join(SRC, 'config.ts'), 'utf8')
  check('⭐⭐⭐ 默认通路 = `chat`（用户裁定"先把 jev 搁置"）',
    /hotScoreChannel: 'chat'/.test(cfgSrc))
  check('⭐⭐⭐ 默认模型 = WorkBuddy 的 deepseek-v4.1-flash（用户点名）',
    /hotScoreModel: 'workbuddy\/deepseek-v4\.1-flash'/.test(cfgSrc))
  // ⭐⭐ 决策 178 的 UI 要求：**模型必须是下拉框**（用户原话："你都要给下拉框去选模型啊"）。
  //    🔴 判据落在**源码里真的是 `<select>`**（而不是 `<input type="text">`）——
  //       只检查"有没有那个 id"是不够的（我这批第一版就是文本输入框）。
  const htmlSrc = readFileSync(join(SRC, 'web', 'index.html'), 'utf8')
  check('🔴🔴 复盘模型是 `<select>` 下拉框（不是文本输入框）',
    /<select id="hs-model">/.test(htmlSrc) && !/<input[^>]*id="hs-model"/.test(htmlSrc))
  check('🔴🔴 有「复盘通路」下拉框（模型内容跟随它）', /<select id="hs-channel">/.test(htmlSrc))
  check('🔴🔴 子代理模型也是下拉框', /<select id="hs-subagent-model">/.test(htmlSrc))
  // ⭐ 与主动注入**共用同一个填充实现**（不复制两份 ⇒ 不会漂移）。
  const webSrc = readFileSync(join(SRC, 'web', 'app.js'), 'utf8')
  check('⭐⭐ 两处共用 `fillChannelModelSelect`（主动注入 + 知识评分）',
    (webSrc.match(/fillChannelModelSelect\(/g) ?? []).length >= 3)   // 定义 + 两个包装
  check('⭐⭐ 子代理下拉框**不跟随通路**（子代理只能走 DSH 模型路由）',
    /async function fillSubagentModelSelect/.test(webSrc) && !/fillChannelModelSelect\('hs-subagent-model'/.test(webSrc))
  check('⭐⭐ 切通路时重填复盘模型下拉框（防静默走错端点）',
    /getElementById\('hs-channel'\)\?\.addEventListener\('change'/.test(webSrc))
  const turnSrc = readFileSync(join(SRC, 'score-turn.ts'), 'utf8')
  check('⭐⭐ 按通路分派（`=== \'chat\'` 分支存在）', /config\.hotScoreChannel === 'chat'/.test(turnSrc))
  check('⭐⭐⭐ **chat 通路"选中即 +1"**（它没有分数 ⇒ 分档不适用）',
    /out\.picks\.map\(\(id\) => \(\{ id, delta: 1, score: 0, turn \}\)\)/.test(turnSrc))
  const chatSrc = readFileSync(join(SRC, 'score-chat.ts'), 'utf8')
  check('🔴 chat 通路**不传 sessionId**（库内知识 02252b4b：会自己触发自己）',
    !/sessionId/.test(chatSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')))

  // ── 🔴🔴 取正文必须用**真实的** `BlockAssembler` API（2026-09-29 生产事故）──
  //
  // ⭐ 事故：我写了 `t.text()`，而 `BlockAssembler` **根本没有这个方法**
  //    （只有 `blocks()` / `message()` / `usage` / `finish` / `interruptedBlocks()`）
  //    ⇒ text 恒空 ⇒ 每次评分都报"模型没有返回任何内容"，
  //      而**同一句日志里 kinds 却写着 `text`**（那个自相矛盾就是指纹）。
  // 🔴 **为什么单测当时照不到**：我用的是**自己编的假汇编器**（有 `text()`），
  //    ⇒ 假对象符合我的错误假设。⭐ 判据：**凡引用外部库的 API，必须拿【真定义】核**，
  //    不能拿自己的 mock 核。
  {
    // ⚠️ 动态 import 真库（拿真实类定义）。
    const { BlockAssembler } = await import('@deepseek-ai/dsh-llm')
    const a = new BlockAssembler()
    const hasText = typeof a.text === 'function'
    check('🔴🔴（反证）`BlockAssembler` **没有** `text()` 方法（我当初就是照它写的）',
      hasText === false, hasText ? '它居然有？那本条的判据要重写' : 'ok')
    check('⭐⭐ `BlockAssembler` **有** `blocks()`（正确取法）', typeof a.blocks === 'function')
    // ⭐ 真喂一段文本块，确认 `blocks()` 真能拿到正文（而不是"有方法但拿不到"）。
    a.push({ type: 'block-start', index: 0, block: { type: 'text' } })
    a.push({ type: 'text-delta', index: 0, text: '你好' })
    a.push({ type: 'block-end', index: 0, block: { type: 'text', text: '你好，世界' } })
    const blks = a.blocks()
    const txt = blks.filter((b) => b.type === 'text').map((b) => b.text).join('')
    check('⭐⭐⭐ 真数据往返：`blocks()` 取得到正文（证明修法对）',
      txt !== '' , `取到「${txt}」`)
    // 🔴 静态核对：**代码里**不得再出现 `.text()` 这种发明调用。
    //    ⚠️ **必须先剥注释** —— 我的修复说明里**逐字引用了那段错代码**
    //       （那是给后人看的指纹，不该删）；不剥注释会**假失败**。
    const chatCode = chatSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')   // 块注释
      .replace(/^\s*\/\/.*$/gm, '')       // 行注释
      .replace(/^\s*\*.*$/gm, '')         // JSDoc 续行（形如 ` * …`）
    check('🔴🔴（反证）代码里**不再**出现 `t.text()` 式的发明调用（注释里的引用不算）',
      !/typeof\s+t\.text\s*===/.test(chatCode) && !/\bt\.text\(\)/.test(chatCode))
    // ⭐ 必须与既有实现**同源**（照抄已验证的那份）。
    check('⭐⭐ 取正文的写法与 `active-recall.ts` 的 `textOf` 同源（都走 `blocks()`）',
      /blocks\(\)[\s\S]{0,200}?filter\(\(b\) => b\.type === 'text'\)/.test(chatSrc))
  }
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【12】⭐⭐⭐ 每轮最多选几条（决策 180）')
{
  const { parseChatScore, buildChatScoreUser } = mod
  const pool = Array.from({ length: 8 }, (_, i) => ({ id: `id-${i + 1}`, title: `T${i + 1}`, desc: `D${i + 1}` }))
  /** 造一个"回了 n 条"的模型输出。 */
  const reply = (n) => JSON.stringify({ picks: Array.from({ length: n }, (_, i) => ({ n: i + 1, why: `w${i + 1}` })) })

  // ── 🔴 核心：解析器必须**真的截断**（不能只靠提示词 —— 模型会超发）──
  const capped = parseChatScore(reply(8), pool, true, 3)
  check('🔴🔴 模型回 8 条、上限 3 ⇒ **只留 3 条**（代码兜底，不信模型）',
    capped.ok && capped.picks.length === 3, `实际 ${capped.picks.length}`)
  check('⭐⭐ **按模型给的顺序取前 K**（顺序携带优先级 ⇒ 不能重排）',
    capped.picks[0] === 'id-1' && capped.picks[2] === 'id-3', JSON.stringify(capped.picks))
  check('⭐ 被截掉的那些**没有理由残留**', Object.keys(capped.reasons).length === 3)
  check('🔴 上限 = 1 时只留 1 条', parseChatScore(reply(5), pool, true, 1).picks.length === 1)
  check('⭐ 不超上限 ⇒ 原样全留', parseChatScore(reply(2), pool, true, 5).picks.length === 2)
  // ⚠️ 省略 maxPicks ⇒ 不截（保持既有调用/测试的行为不变）。
  check('⭐⭐ 省略上限 ⇒ **不截**（既有行为不变）', parseChatScore(reply(8), pool, true).picks.length === 8)
  check('⭐ 上限为 0/负数 ⇒ 至少留 1（不会变成 0 条）',
    parseChatScore(reply(8), pool, true, 0).picks.length === 1)

  // ── ⭐⭐ 数字必须**出现在 `user` 里**（§6.4：K 放 user，不放 system）──
  const u = buildChatScoreUser('本轮内容', 7)
  check('⭐⭐ 上限写进 `user`（§6.4：K 是可配变量，不能进 system）', u.includes('最多 7 条'))
  check('⭐⭐⭐ 措辞是**排序要求**而不只是数字（否则模型会当成"随便挑 K 条"）',
    /排序/.test(u) && /只留最前面的 7 条/.test(u))
  check('⭐ 明说"宁缺勿滥"（防凑数）', /宁缺勿滥/.test(u))

  // ── 静态核对：配置键三处齐 + 确定性 ──
  const cfgSrc2 = readFileSync(join(SRC, 'config.ts'), 'utf8')
  const apiSrc2 = readFileSync(join(SRC, 'api.ts'), 'utf8')
  const setSrc2 = readFileSync(join(SRC, 'settings.ts'), 'utf8')
  check('⭐⭐ 默认 10 条', /hotScoreMaxPicks: 10/.test(cfgSrc2))
  check('⭐⭐ 进了 api 的表驱动清单（否则单独保存它 400）',
    /'hotScoreMaxPicks'/.test(apiSrc2) && /'hotScoreMaxPicks'/.test(setSrc2))
  // 🔴🔴 与 `hotScoreTopN` **必须是两个键**（一个管进、一个管出）——
  //    合成一个就是决策 172 那族（一个键兼两个语义）。
  check('🔴🔴 `hotScoreMaxPicks`（写入侧）与 `hotScoreTopN`（读取侧）**是两个键**',
    /hotScoreMaxPicks/.test(cfgSrc2) && /hotScoreTopN/.test(cfgSrc2)
    && cfgSrc2.indexOf('hotScoreMaxPicks') !== cfgSrc2.indexOf('hotScoreTopN'))
  // ⭐ 提示词里"排序 + 数字"这两半必须在**同一句**里（分开写会丢关联）。
  const userSrc = readFileSync(join(SRC, 'score-chat.ts'), 'utf8')
  check('⭐⭐ "最多 K 条"与"按能改变做法的程度排序"在同一条 user 消息里',
    /最多 \$\{k\} 条[\s\S]{0,400}?排序/.test(userSrc))
  // ⚠️ 前端：新增旋钮存在且被提交。
  const htmlSrc2 = readFileSync(join(SRC, 'web', 'index.html'), 'utf8')
  const webSrc2 = readFileSync(join(SRC, 'web', 'app.js'), 'utf8')
  check('⭐⭐ 面板上有 `hs-maxpicks` 控件', /id="hs-maxpicks"/.test(htmlSrc2))
  check('⭐⭐ 前端会提交它', /hotScoreMaxPicks:\s*hsMaxPicksR\.value/.test(webSrc2))
  check('⭐ 前端按整数校验（1–200）', /num\('hs-maxpicks', '每轮最多选几条', 1, 200, true\)/.test(webSrc2))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【13】🔴🔴 评分模式必须**四个调用点全部同源**（2026-09-29 真踩到的 bug）')
{
  // ⭐ 事故（用户报）：*"已经有不少加过分的知识了，但好像没有真的加到项目热知识列表啊"*。
  // 🔴 根因：我只给**注入侧**传了 `score` 选项，**漏了另外三条路** ——
  //    · `previewForSession`（**页面列表的唯一来源**）⇒ 界面按原清单渲染
  //      ⇒ **看到的与实际注入的是两个集合**（这正是用户看到的症状）；
  //    · `llm/stream`（算 `present` 指纹）⇒ 与 `expected` 不同源
  //      ⇒ `missing = expected − present` **算错** ⇒ 重复注入或该注没注；
  //    · `decideInjection` 里的**补注**那次调用 ⇒ 补注内容与实际该注入的对不上。
  // ⭐ 判据：`buildHotInjection` 的**每一处**调用，只要那条路服务于评分模式，
  //    就必须把 `score` 传下去 —— **少一处就是"两个集合"**。
  const hw = readFileSync(join(SRC, 'hot-watch.ts'), 'utf8')

  // 取所有 `buildHotInjection(` 调用点，逐个看它附近有没有 score。
  const calls = [...hw.matchAll(/buildHotInjection\(/g)].map((m) => m.index ?? 0)
  check('⭐ 一共 4 个 `buildHotInjection` 调用点（数量变了 ⇒ 本条的判据要复核）',
    calls.length === 4, `实际 ${calls.length}`)
  let missingScore = 0
  for (const at of calls) {
    // 往后看 400 字符（够覆盖实参列表）。
    const seg = hw.slice(at, at + 400)
    if (!/\bscore\b/.test(seg)) { missingScore++; console.log(`     ⚠️ 第 ${at} 字符处的调用没传 score`) }
  }
  check('🔴🔴（反证）**4 个调用点全都传了 `score`**（漏一个 ⇒ 界面与实际注入不一致）',
    missingScore === 0, missingScore > 0 ? `${missingScore} 处漏传` : '4/4')

  // ⭐ 页面那条路（`previewForSession` 的签名）必须收 `score` 参数。
  check('⭐⭐ `previewForSession` 的签名里有 `score` 形参', /previewForSession\([\s\S]{0,200}?score\?:/.test(hw))
  // ⭐ api.ts 调用它时必须把配置传进去（否则形参是死的）。
  const api = readFileSync(join(SRC, 'api.ts'), 'utf8')
  check('⭐⭐ `api.ts` 调 `previewForSession` 时传了 `hotScoreOnTurnEnd`',
    /previewForSession\(getSvc, sessionId, \{[\s\S]{0,200}?hotScoreOnTurnEnd/.test(api))
  // ⭐ `llm/stream` 那条也要（它算 present，与 expected 必须同源）。
  //    ⚠️ 决策 182 抽了共用助手 `scoreOptsOf(config)` ⇒ 判据改成"**用了那个助手**"
  //      （比检查字段名更强：它保证四处**同一份映射**）。
  check('⭐⭐⭐ 四处都用**同一个助手** `scoreOptsOf(config)`（结构上不可能再漏字段）',
    (hw.match(/scoreOptsOf\(config\)/g) ?? []).length >= 2
    && /const scoreOptsOf = /.test(hw))
  check('⭐⭐ `scoreOptsOf` 里含门槛两个字段（映射只有一份）',
    /const scoreOptsOf[\s\S]{0,400}?gateMinScore[\s\S]{0,200}?gateLastTurn/.test(hw))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【14】⭐⭐⭐ 门槛 + 同分按时间排（决策 182）')
{
  const mk = (events) => ({ events })
  const now2 = NOW
  // 三条同分（各 1 分）但**加分时间不同**：c 最新、b 次之、a 最旧。
  const proj = { updatedAt: iso(0), entries: {
    a: mk([{ at: iso(20 * HOUR), delta: 1, score: 0.8, turn: 5 }]),
    b: mk([{ at: iso(10 * HOUR), delta: 1, score: 0.8, turn: 6 }]),
    c: mk([{ at: iso(1 * HOUR), delta: 1, score: 0.8, turn: 7 }]),
    hi: mk([{ at: iso(30 * HOUR), delta: 3, score: 0.95, turn: 3 }]),   // 高分但很旧
  } }

  // ── ① 同分按【最近加分时间】降序（而不是 id 字典序）──
  const r1 = topScored(proj, now2, 30, 10)
  check('🔴🔴 同分时**按最近加分时间降序**（c→b→a，不是 id 升序）',
    r1[1].id === 'c' && r1[2].id === 'b' && r1[3].id === 'a',
    r1.map((x) => `${x.id}(${x.score})`).join(' '))
  check('⭐⭐ 高分仍然优先（hi=3 排第 1）', r1[0].id === 'hi')
  check('⭐⭐ 每条都带 `lastAt`/`lastTurn`（门槛与排序要用）',
    r1.every((x) => typeof x.lastAt === 'number' && typeof x.lastTurn === 'number'))
  check('⭐ `lastTurn` 取窗口内**最大** turn', r1.find((x) => x.id === 'c').lastTurn === 7)

  // ── ② 门槛：**分数 ≥ N 或 上一轮加入的（OR）** ──
  //    场景：`hi` 3 分（过分数门）、`c` 是上一轮（turn=7）加入的但只有 1 分、
  //          `a`/`b` 既不够分也不是上一轮 ⇒ 只应剩 hi 与 c。
  const gated = topScored(proj, now2, 30, 10, { gate: { minScore: 2, lastTurn: 7 } })
  const ids = gated.map((x) => x.id).sort()
  check('⭐⭐⭐ 门槛是 **OR**：分数够的（hi）**和** 上一轮加入的（c）都进',
    ids.length === 2 && ids.includes('hi') && ids.includes('c'), ids.join(','))
  check('🔴（反证）**不够分、也不是上一轮的被挡掉**（a/b 不在）',
    !ids.includes('a') && !ids.includes('b'))
  // ⚠️ 若误做成 AND ⇒ 只剩 hi（c 分不够）⇒ 这条会红。
  check('🔴🔴（反证）**不是 AND** —— 若做成 AND，c（1 分）会被丢掉',
    ids.includes('c'), 'AND 会让"刚加入的低分知识"永远进不来')

  // ── ③ 上一轮那道门可以单独关掉（纯分数门槛）──
  const pure = topScored(proj, now2, 30, 10, { gate: { minScore: 2, lastTurn: -1 } })
  check('⭐⭐ `lastTurn: -1` ⇒ 那道门**不生效**（退回纯分数门槛，只剩 hi）',
    pure.length === 1 && pure[0].id === 'hi', pure.map((x) => x.id).join(','))

  // ── ④ `lastRunTurn`：优先读项目级 `lastTurn`；旧数据兜底到最大 turn ──
  check('⭐⭐ `lastRunTurn` 优先读项目级 `lastTurn`',
    lastRunTurn({ updatedAt: iso(0), lastTurn: 9, entries: { x: mk([{ at: iso(HOUR), delta: 1, score: 0.8, turn: 3 }]) } }) === 9)
  check('⭐⭐⭐ 旧数据（无 `lastTurn`）兜底成**全部事件的最大 turn**',
    lastRunTurn({ updatedAt: iso(0), entries: { x: mk([{ at: iso(HOUR), delta: 1, score: 0.8, turn: 4 }]), y: mk([{ at: iso(HOUR), delta: 1, score: 0.8, turn: 8 }]) } }) === 8)
  check('⭐ 完全空 ⇒ -1（那道门不生效，不抛）', lastRunTurn(undefined) === -1)

  // ── ⑤ `applyAdds` 必须推进 `lastTurn`（否则门槛拿不到"上一轮"）──
  const afterAdd = applyAdds(undefined, [{ id: 'z', delta: 1, score: 0, turn: 12 }], iso(0), now2, 30)
  check('⭐⭐⭐ `applyAdds` 记下本次的 turn（`lastTurn`）⇒ 门槛才拿得到"上一轮"',
    afterAdd.lastTurn === 12, String(afterAdd.lastTurn))
  const afterMore = applyAdds(afterAdd, [{ id: 'y', delta: 1, score: 0, turn: 15 }], iso(0), now2, 30)
  check('⭐ 后续加分取**更大**的 turn（不回退）', afterMore.lastTurn === 15, String(afterMore.lastTurn))

  // ── ⑥ `aggregate` 与 `effectiveScore` **同源**（不重复实现窗口判定）──
  const sc = mk([{ at: iso(40 * HOUR), delta: 3, score: 0.95, turn: 1 }, { at: iso(2 * HOUR), delta: 1, score: 0.8, turn: 9 }])
  check('⭐⭐ `aggregate().score` 与 `effectiveScore()` **一致**（同源判据）',
    aggregate(sc, now2, 30).score === effectiveScore(sc, now2, 30))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【15】🔴🔴 硬校验：引文必须逐字出现在上下文里（决策 183）')
{
  const ctx = [
    '用户报：jev 主动注入一次都没触发。',
    '我查了 recall-log，发现 630 条「该范围无候选」的日志。',
    '修复方向：补一条不依赖模型行为的触发点。',
  ].join('\n')

  // ── 正例：逐字引用 ──
  check('⭐⭐ 逐字引用 ⇒ 通过', checkQuote('jev 主动注入一次都没触发', ctx).ok === true)
  check('⭐⭐ 跨行引用（空白差异）⇒ 仍然通过',
    checkQuote('一次都没触发。\n我查了 recall-log', ctx).ok === true)
  check('⭐ 前后带空白 ⇒ 通过（归一化）', checkQuote('   630 条「该范围无候选」的日志   ', ctx).ok === true)

  // ── 🔴 反例：改写 / 编造 ⇒ 必须不通过 ──
  check('🔴🔴（反证）**改写**（换了词）⇒ 不通过',
    checkQuote('jev 主动注入从来没有触发过', ctx).ok === false)
  check('🔴🔴（反证）**编造**（上下文里没有）⇒ 不通过',
    checkQuote('我发现是钩子注册顺序的问题', ctx).ok === false)
  check('🔴（反证）**拼接两句**（原文没有这个连续子串）⇒ 不通过',
    checkQuote('一次都没触发。修复方向：补一条', ctx).ok === false)
  check('🔴（反证）**太短的**（"触发"两字必然出现）⇒ 不通过',
    checkQuote('触发', ctx).ok === false, `下限 ${MIN_QUOTE_CHARS}`)
  check('⭐ 没给 `quote` 字段 ⇒ 不通过（不是抛异常）', checkQuote(undefined, ctx).ok === false)
  check('⭐ 给了非字符串 ⇒ 不通过', checkQuote(123, ctx).ok === false)
  check('⭐ 上下文为空 ⇒ 不通过（不误判成通过）', checkQuote('随便一句话拿来比', '').ok === false)
  // 🔴 **绝不能抛**（它是"模型输出不可信"的防线）→
  let threw = 0
  for (const bad of [null, '', '   ', {}, [], Number.NaN]) {
    try { checkQuote(bad, ctx) } catch { threw++ }
  }
  check('🔴🔴 任何畸形输入都**不抛**', threw === 0, `${threw} 条抛了`)

  // ── 提示词必须**说清**是逐字复制（否则全被机械校验丢掉）──
  const { buildChatScoreSystem } = mod
  const pool2 = [{ id: 'x', title: 'T', desc: 'D' }]
  const sys2 = buildChatScoreSystem({ pool: pool2, wantReasons: true, english: false, budgetNote: '' })
  check('⭐⭐⭐ `system` 里要求 `quote` **逐字复制**（并说明会做逐字比对）',
    /逐字复制/.test(sys2) && /逐字比对/.test(sys2))
  check('⭐ `system` 里明说"不是原句 ⇒ 不予加分"（让模型知道后果）', /不予加分/.test(sys2))
  check('⭐ 输出格式示例含 `quote` 字段', /"quote":"原句"/.test(sys2))
  check('⭐⭐ `why` 要说明"**哪句原话**的需求被**哪一点**解决了"', /哪一点解决/.test(sys2))

  // ── 解析器：quote 不过 ⇒ **整条丢掉**（不是降级成没理由）──
  const { parseChatScore } = mod
  const pool3 = [{ id: 'id-1', title: 'T1', desc: 'D1' }, { id: 'id-2', title: 'T2', desc: 'D2' }]
  const reply = JSON.stringify({ picks: [
    { n: 1, quote: 'jev 主动注入一次都没触发', why: 'w1' },   // 有原句 ⇒ 留
    { n: 2, quote: '我编的一句不存在的话', why: 'w2' },        // 编的 ⇒ 丢
  ] })
  const pr = parseChatScore(reply, pool3, true, undefined, ctx)
  check('🔴🔴 **引文不过的条目被整条丢掉**', pr.ok && pr.picks.length === 1 && pr.picks[0] === 'id-1',
    JSON.stringify(pr.picks))
  check('⭐⭐ 通过的条目**带上了原句**（`quotes`）', pr.quotes['id-1'] === 'jev 主动注入一次都没触发')
  check('⭐⭐ 被丢掉的**如实记进 `rejected`**（提示词质量的唯一反馈）',
    pr.rejected.length === 1 && pr.rejected[0].n === 2, JSON.stringify(pr.rejected))
  // ⚠️ 不传 ctxForQuote ⇒ 跳过校验（保持既有调用/测试行为不变）。
  const pr2 = parseChatScore(reply, pool3, true)
  check('⭐ 不传比对基准 ⇒ **跳过引文校验**（既有行为不变）', pr2.picks.length === 2, JSON.stringify(pr2.picks))

  // ── 结构核对：api / settings / 前端 都齐 ──
  const apiS = readFileSync(join(SRC, 'api.ts'), 'utf8')
  const setS = readFileSync(join(SRC, 'settings.ts'), 'utf8')
  const htmlS = readFileSync(join(SRC, 'web', 'index.html'), 'utf8')
  const webS = readFileSync(join(SRC, 'web', 'app.js'), 'utf8')
  for (const k of ['hotScoreGateMinScore', 'hotScoreGateLastTurn']) {
    check(`⭐⭐ \`${k}\` 三处齐（config/settings/api）`,
      /hotScoreGate/.test(readFileSync(join(SRC, 'config.ts'), 'utf8')) && setS.includes(`'${k}'`) && apiS.includes(k))
  }
  check('⭐⭐ 面板上有「入围门槛：至少几分」控件', /id="hs-gate-min"/.test(htmlS))
  check('⭐⭐ 面板上有「放行上一轮刚加入的」开关', /id="hs-gate-last"/.test(htmlS))
  check('⭐⭐ 前端提交这两个键', /hotScoreGateMinScore:\s*hsGateMinR\.value/.test(webS)
    && /hotScoreGateLastTurn:\s*!!\(document\.getElementById\('hs-gate-last'\)/.test(webS))
  // 🔴 **门槛值必须与注入侧同值**（否则页面与实际注入又是两个集合 —— 决策 181 的教训）。
  //    ⚠️ 窗口要**够宽**：这段调用里夹着一段 6 行的注释（我第一版给 400 字符 ⇒ **假失败**）。
  check('🔴🔴 `api.ts` 把门槛也传给 `previewForSession`（与注入侧同值）',
    /previewForSession\(getSvc, sessionId, \{[\s\S]{0,900}?hotScoreGateMinScore/.test(apiS))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【16】⭐⭐⭐ 开关打开时，项目热知识页改说"自动注入"（决策 184）')
{
  // 🔴 **用户报的问题**：*"我看到把知识加入到会话实时状态了，但是项目热知识页面
  //    还是没有加入啊。我需要那个页面也要同步啊。要不然，用户会迷茫的。"*
  // ⭐ 查清的真相：**接口没问题**（「加入列表」写的确实是 `/hot/selection`）——
  //    而是**开关打开后那份手工清单不再参与注入**（当初裁定"替换"）
  //    ⇒ 页面还在显示它 = **在展示一份已失效的数据**。
  // ⇒ 用户裁定：开关开着时**不显示列表**、改成说明；**关掉则恢复**。
  const webS = readFileSync(join(SRC, 'web', 'app.js'), 'utf8')
  const htmlS = readFileSync(join(SRC, 'web', 'index.html'), 'utf8')

  check('⭐⭐⭐ 有 `hotState.scoreOn` 这个状态', /scoreOn: false/.test(webS))
  check('⭐⭐⭐ **真去读设置**（不是用缓存 —— 否则改完开关回来显示相反）',
    /getJson\('\/settings'\)[\s\S]{0,120}?hotScoreOnTurnEnd === true/.test(webS))
  check('⭐⭐ 读失败 ⇒ 保守当成"关"（显示手工清单 = 旧行为，比 hid 住更轻）',
    /catch \{\s*\n\s*hotState\.scoreOn = false/.test(webS))

  // ── 关键：早退**必须在**记完 `selectionIds` 之后（否则左栏用旧状态）──
  const iIds = webS.indexOf('hotState.selectionIds = new Set(ids)')
  const iEarly = webS.indexOf('if (hotState.scoreOn)')
  check('🔴🔴（反证）**早退在 `selectionIds` 之后** —— 否则左栏「加入/移出」按钮用旧状态',
    iIds > 0 && iEarly > 0 && iIds < iEarly, `ids@${iIds} early@${iEarly}`)

  // ── 说明文案的三要素（用户要求"就说现在是自动注入，可以到会话实时页去看"）──
  const earlySeg = webS.slice(iEarly, iEarly + 2200)
  check('⭐⭐ 文案说明"现在是自动注入"', /自动挑选要注入的知识/.test(earlySeg))
  check('⭐⭐⭐ **指向会话实时状态页**（用户明确要求）', /会话实时状态/.test(earlySeg))
  check('⭐⭐ 说明**手工清单没被删除、关掉开关即恢复**（否则用户以为数据丢了）',
    /没有被删除/.test(earlySeg) && /关掉即会恢复|关掉开关/.test(earlySeg))

  // ── 标题：两态都要对（否则"说反"）──
  check('⭐⭐ 开关开着时标题改成"由知识评分自动挑选"',
    /hot-editor-selected-title'\)\s*\n\s*if \(titleEl\) titleEl\.textContent = '本项目热知识（当前由【知识评分】自动挑选）'/.test(webS))
  check('⭐⭐⭐ **关掉后标题恢复**成"本项目热知识（含置顶）"（决策 184 的"恢复"那一半）',
    /if \(titleEl2\) titleEl2\.textContent = '本项目热知识（含置顶）'/.test(webS))
  check('⭐ `index.html` 里那个标题有 id（能被 JS 改）', /id="hot-editor-selected-title"/.test(htmlS))

  // ── 数据层：`selection.json` **一个字节都不该被动**（只是不显示）──
  //    ⚠️ 判据：开关那条分支里**不得**出现任何写操作。
  check('🔴🔴（反证）开关开着那条分支里**没有任何写操作**（数据不能被动）',
    !/postJson|deleteJson/.test(earlySeg), '早退分支里出现了写请求')
}

console.log(`\n知识评分测试：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)