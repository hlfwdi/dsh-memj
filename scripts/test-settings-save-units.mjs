/**
 * ⭐⭐⭐ **设置页"按版块保存"的接线体检**（2026-10-07 用户裁定）。
 *
 * ── 用户要求（原话，两次）────────────────────────────────────────────────
 * > *"另外版本维护和标签规范化分别给两个单独的保存按钮吧，不要按页去保存了。"*
 * > *"还是把所有设置页面的子页面，全都按设置板块去分别保存吧。不要按页去保存了。"*
 *
 * ── 🔴 为什么这需要一套机械检查 ────────────────────────────────────────────
 * 把"一个子页一个保存按钮"改成"一个版块一个"时，**要动五处**，
 * 而**漏掉任何一处都不会报错**（页面照常打开、按钮照常能点）：
 *   ① `index.html` 里按钮的 `data-savepage`
 *   ② `index.html` 里结果行的 `id="settings-msg-<单元>"`
 *   ③ `app.js` 里 `SAVE_UNITS`（单元 → 子页）
 *   ④ `app.js` 里 `saveSettings()` 的 payload 分支
 *   ⑤ `app.js` 里 `NUM_KEYS`（数值键的校验/提交表）
 * 本项目**已经因为"只改一半"出过真实事故**：
 *   · 只裁提交体、不裁读值 ⇒ 某页保存时报"另一个页才有那个字段"（决策 169）；
 *   · 删了控件却留着读它的代码 ⇒ 同上。
 * ⇒ 这类"多份清单必须对齐"的东西，**必须由机械检查守**，不能靠记性。
 *
 * ⚠️ **本套件是纯静态的**（读 `src/web/*`，不起服务、不开浏览器）——
 *    它守的是"接线对齐"；真点按钮的端到端验证在 CDP 探针里做。
 * 用法：node scripts/test-settings-save-units.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

let pass = 0, fail = 0
const check = (n, c, e = '') => {
  if (c) { pass++; console.log(`  ✅ ${n}`) }
  else { fail++; console.log(`  ❌ ${n}${e ? ' — ' + e : ''}`) }
}

const html = readFileSync(join(ROOT, 'src', 'web', 'index.html'), 'utf8')
const js = readFileSync(join(ROOT, 'src', 'web', 'app.js'), 'utf8')

/** HTML 里所有保存按钮的 `data-savepage`。 */
const savepages = [...html.matchAll(/data-savepage="([^"]+)"/g)].map((m) => m[1])
/** HTML 里所有结果行的 id（去掉 `settings-msg-` 前缀）。 */
const msgIds = [...html.matchAll(/id="settings-msg-([^"]+)"/g)].map((m) => m[1])

/**
 * ⭐ **权威的"单元 → 它该提交的键"清单**（由人按界面语义写在这里）。
 *
 * 🔴 它是本套件的**独立第二来源**：`app.js` 里的 `SAVE_UNITS` / `NUM_KEYS`
 *    是"实现"，这里是"期望"。**两边不一致就是接线漏了**。
 *    ⚠️ 故意**不**从 `app.js` 反推（那样等于自己证明自己）。
 */
const EXPECT = {
  // ── 沉淀 ──
  'sink-theme': ['themeCreation'],
  'sink-progress': ['progressCharsWarn', 'progressCharsKeep'],
  // ⭐⭐⭐ 上下文占用上报（决策 226；2026-10-12）——
  //    ⚠️ 它**带配套参数**（阈值 + 台阶）⇒ 按本项目判据（"一个勾选就是全部语义"才适合即时）
  //       必须走**保存按钮**，**不是**即时开关。
  //    ⭐ 台阶（`contextReportStepPercent`）是"边沿触发"用的：治"过线后每轮刷屏"。
  'sink-ctxreport': ['contextReportOnTurnEnd', 'contextReportMinPercent', 'contextReportStepPercent'],
  'sink-git': ['backupGit'],
  'sink-tag': ['tagNormalizeProvider', 'tagNormalizeModel', 'tagNormalizeOnHandoff', 'tagNormalizeReasoningEffort'],
  // ── 热知识注入 ──
  // ⚠️ `hot-inject`（启用热知识注入）**不在本表** —— 用户 2026-10-07 裁定
  //    *"总开关不需要保存按钮，应该是点击开关直接生效的"* ⇒ 它是**即时生效项**，
  //    由 `INSTANT_TOGGLES` + `bindInstantToggles()` 驱动（见【9】）。
  'hot-budget': ['hotInjectRatio', 'hotCharsPerToken', 'hotBudgetCharsFallback', 'hotFullWarnChars', 'hotSessionKeep'],
  'hot-score': [
    'hotScoreThreshold', 'hotScoreWindowHours', 'hotScoreTopN', 'hotScoreMaxPicks',
    'hotScoreGateMinScore', 'hotScoreMinChars', 'hotScoreTimeoutMs',
    'hotScoreOnTurnEnd', 'hotScoreGateLastTurn',
    'hotScoreChannel', 'hotScoreModel', 'hotScoreSubagentProvider', 'hotScoreSubagentModel',
    // ⭐⭐⭐ 2026-10-07 多 provider 化：`jev` 通路的模型改写到这个键
    //    （`hotScoreModel` 在 jev 下是**旧键**，存的是裸模型名）。
    //    ⚠️ 两个键**按通路二选一**写 ⇒ 本单元"可能写"的集合里两个都在。
    'hotScoreDecisionPick',
  ],
  // ── 主动注入 ──
  // ⚠️ `active-on`（启用主动注入）**不在本表** —— 同上，它是即时生效项。
  // ⚠️ 「严格触发口径」的控件**渲染在「召回模型」那个 section 里**（保持用户原有版面）
  //    ⇒ 它由 `active-recall` 提交，不是 `active-on`。⭐ 本清单按**控件在界面上的位置**写，
  //      不按"语义上像哪一类"写 —— 否则测试会逼着代码把控件搬走。
  'active-recall': [
    'activeInjectChannel', 'activeInjectModel', 'activeInjectScope',
    'activeInjectJevNarrowScope', 'activeInjectStrict',
    // ⭐⭐⭐ 同上：`jev` 通路的召回模型写到这个键（与 `activeInjectModel` 二选一）。
    'activeInjectDecisionPick',
  ],
  'active-judge': [
    'activeInjectTopK', 'activeInjectNeedMin', 'activeInjectItemMin',
    'activeInjectTimeoutMs', 'activeInjectMaxInjectionsPerTurn', 'activeInjectReasoningMaxChars',
  ],
  'active-budget': ['activeInjectBudgetTokens', 'activeInjectContextTokens', 'activeInjectConcurrency', 'activeInjectChatWindowRatio', 'activeInjectBudget'],
  'active-gate': ['activeInjectSufficientMin', 'activeInjectSearchIntentMin', 'activeInjectSufficientGate', 'activeInjectSearchIntentGate'],
  'active-debug': ['activeRecallLogRequest', 'activeInjectExplain'],
  // ── 英文索引 ──
  'index-en': ['translateProvider', 'translateModel', 'translateTemplate', 'translateConcurrency'],
}
/** 每个单元归属的子页（同样是人写的期望值）。 */
const EXPECT_PAGE = {
  'sink-theme': 'sink', 'sink-progress': 'sink', 'sink-git': 'sink', 'sink-tag': 'sink',
  'hot-budget': 'hot', 'hot-score': 'hot',
  'active-recall': 'active', 'active-judge': 'active',
  'active-budget': 'active', 'active-gate': 'active', 'active-debug': 'active',
  'index-en': 'index',
}
/**
 * ⭐⭐⭐ **即时生效的开关**（用户 2026-10-07 裁定）：`控件 id → 配置键`。
 *
 * 🔴 它们**故意没有保存按钮** ⇒ **不在这张 `EXPECT` 里**（那张表是"按钮驱动"的）。
 *    本套件【9】专门核它们：控件在、有 change 监听、且**没有**残留保存按钮。
 */
const EXPECT_INSTANT = {
  'hot-inject-enabled': 'hotInject',
  'ai-on': 'activeInject',
}
const UNITS = Object.keys(EXPECT)

console.log('【1】按钮与结果行**一一对应**')
// ⚠️ **这里曾经写死 `=== 12`** —— 2026-10-12 加「上下文占用上报」那一单元时它报红，
//    而**产品侧完全正确**（按钮、结果行、五处接线都在）。
//    ⭐ 判据：这种"数一数"的断言**不该写死数字**（每加一个单元都要来改它，
//       而它守的其实不是数量）⇒ 它要守的是"两份清单一致"，
//       而那件事【3】已经用 `mappedUnits`（从实现解析出来的）守着了。
//    ⇒ 本行只做一个**不钉数字**的粗核对（单元数 > 0 且能数出来）。
check(`共 ${UNITS.length} 个保存单元（另有 ${Object.keys(EXPECT_INSTANT).length} 个即时开关，见【9】）`,
  UNITS.length > 0, `EXPECT 里一个单元都没有（${UNITS.length}）`)
check('⭐ 每个单元的 `data-savepage` 都在 HTML 里（缺 ⇒ 那个版块没有保存按钮）',
  UNITS.every((u) => savepages.includes(u)),
  `缺：${UNITS.filter((u) => !savepages.includes(u)).join(',')}`)
check('⭐ 每个 `data-savepage` 都有同名的结果行（缺 ⇒ 保存后**没有任何反馈**）',
  savepages.every((p) => msgIds.includes(p)),
  `按钮：${savepages.join(',')} / 结果行：${msgIds.join(',')}`)
// ⚠️ **反向那一条要排除两类合法例外**：
//    ① `prompts` / `templates`：保存动作**不在 `.set-save` 体系里**（提示词是每张卡
//       自己的"保存"、模板是表单自己的"保存模板"）；
//    ② **即时开关**（`hot-inject-enabled` / `ai-on`）：用户 2026-10-07 裁定它们
//       **不要保存按钮、点即生效** ⇒ 它们有结果行、但**有意**没有 `data-savepage`。
//    ⇒ 都**不是**漏接线。
const MSG_ONLY_OK = ['prompts', 'templates', 'kinds', ...Object.keys(EXPECT_INSTANT)]
const orphans = msgIds.filter((m) => !savepages.includes(m) && !MSG_ONLY_OK.includes(m))
check('⭐ 反向：结果行都有归属（排除 prompts / templates 与两个即时开关）',
  orphans.length === 0, `孤儿：${orphans.join(',')}`)
check('  `data-savepage` 不重复（重复 ⇒ 只挂上最后一个监听器，另一个点了没反应）',
  new Set(savepages).size === savepages.length, savepages.join(','))

console.log('\n【2】旧的"按页保存"必须**全部删除**（用户两次明确要求）')
// 🔴 页级单元（`sink` / `hot` / `active` / `index`）留着就会出现
//    "两个按钮管同一批键"，而且旧按钮会提交一个**不存在的单元**
//    （`settings-msg-hot` 这类 id 已经没了）⇒ 点了**没有任何反馈**。
const PAGE_LEVEL = ['sink', 'hot', 'active', 'index']
check('⭐⭐ 页级按钮全部消失（`sink` / `hot` / `active` / `index`）',
  PAGE_LEVEL.every((p) => !savepages.includes(p)),
  `仍存在：${PAGE_LEVEL.filter((p) => savepages.includes(p)).join(',')}`)
check('⭐⭐ 也不再有 `settings-msg-<页名>` 那种结果行（留着就是死元素）',
  PAGE_LEVEL.every((p) => !msgIds.includes(p)),
  `仍存在：${PAGE_LEVEL.filter((p) => msgIds.includes(p)).join(',')}`)
check('  每个子页都至少有一个版块级按钮',
  ['sink', 'hot', 'active', 'index'].every((p) => UNITS.some((u) => EXPECT_PAGE[u] === p)))

console.log('\n【3】`SAVE_UNITS` 映射（单元 → 子页）')
// 从 JS 源码里把这张表读出来（不 import：app.js 依赖 DOM，不能在 node 里跑）。
const unitBlock = /const SAVE_UNITS = \{([\s\S]*?)\n\}/.exec(js)?.[1] ?? ''
const mappedUnits = [...unitBlock.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
check('  能找到 `SAVE_UNITS` 表', mappedUnits.length > 0)
check('⭐⭐ 表里的单元与期望**完全一致**（多/少都是接线漂移）',
  mappedUnits.length === UNITS.length && UNITS.every((u) => mappedUnits.some(([k]) => k === u)),
  `实现：${mappedUnits.map(([k]) => k).join(',')}`)
for (const [u, page] of Object.entries(EXPECT_PAGE)) {
  check(`  ${u} → ${page}`,
    mappedUnits.some(([k, v]) => k === u && v === page),
    JSON.stringify(mappedUnits.find(([k]) => k === u) ?? null))
}

console.log('\n【4】payload 分支覆盖每个单元（漏一个 ⇒ 点了保存但**什么都不提交**）')
// 🔴 `saveSettings` 的 payload 区：`switch (unit) { case 'x': … }`。
const payloadStart = js.indexOf('let payload = {}')
const payloadEnd = js.indexOf('const r = await postJson', payloadStart)
const payloadCode = payloadStart >= 0 && payloadEnd > payloadStart ? js.slice(payloadStart, payloadEnd) : ''
check('  能定位 payload 区', payloadCode.length > 0)
for (const u of UNITS) {
  check(`  ⭐ 有 \`case '${u}':\` 的提交分支`,
    payloadCode.includes(`case '${u}':`), '')
}
// ⭐ 反证：**不得**再按子页分支（老的 `page === 'hot'` 那种写法正是"没拆"的证据）。
check('⭐⭐ 反证：payload 区不再按【子页】分支（`page === \'hot\'` 之类）',
  !/page === '(hot|active|index|sink)'/.test(payloadCode),
  (payloadCode.match(/.*page === '.*/) ?? [''])[0].trim().slice(0, 120))
check('⭐ 有 default 分支**明确拒绝**未登记的单元（不能静默提交空 body）',
  /default:[\s\S]{0,500}?没有提交分支/.test(payloadCode))

console.log('\n【5】每个单元**只提交自己的键**（本次拆分的全部意义）')
// 🔴 逐版块钉死键集合 —— 同时防"拆了按钮但 payload 还粘在一起"（那等于没拆）。
//    ⚠️ 数值键走 `nums`（来自 `NUM_KEYS[unit]`），所以这里分两路核对：
//       · 分支里**直接写出来的**键（布尔/模型/枚举）；
//       · 分支里 `nums` 展开的键（去 `NUM_KEYS` 里查）。
const numBlock = /const NUM_KEYS = \{([\s\S]*?)\n\}/.exec(js)?.[1] ?? ''
/** `{ 单元: [配置键...] }` —— 从 `NUM_KEYS` 表里读出来。 */
const numKeysOf = {}
for (const m of numBlock.matchAll(/'([^']+)':\s*\[([\s\S]*?)\n  \]/g)) {
  numKeysOf[m[1]] = [...m[2].matchAll(/\['[^']+',\s*'([A-Za-z][A-Za-z0-9]*)'/g)].map((x) => x[1])
}
/**
 * 🔴 **必须比"集合相等"，不能比"子串包含"**。
 *    踩过：`body.includes('activeInject')` 对 `activeInjectScope` 也成立
 *    ⇒ 误报"越权提交"（测试自己写歪，把正确的代码判成错的）。
 *    ⇒ 先把注释剥掉，再抽出真正写出来的键名。
 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
for (const [unit, keys] of Object.entries(EXPECT)) {
  // 取该 case 到下一个 case/default 之间的代码。
  const m = new RegExp(`case '${unit}':([\\s\\S]*?)(?=\\n      case '|\\n      default:)`).exec(payloadCode)
  const body = stripComments(m?.[1] ?? '')
  // `payload = nums` 或 `payload = { ...nums, … }` 都算"用了数值表"。
  const usesNums = /(=\s*nums\b)|(\.\.\.nums\b)/.test(body)
  const fromNums = usesNums ? (numKeysOf[unit] ?? []) : []
  // 抽出直接写出来的键：`key:`（对象字面量的键）。
  const written = new Set([...body.matchAll(/(?:^|[\s,{])([A-Za-z][A-Za-z0-9]*)\s*:/g)].map((x) => x[1]))
  const actual = new Set([...fromNums, ...written])
  const want = new Set(keys)
  const missing = keys.filter((k) => !actual.has(k))
  const extra = [...actual].filter((k) => !want.has(k))
  check(`  ${unit}：键集合**恰好等于**期望的 ${keys.length} 个`,
    missing.length === 0 && extra.length === 0,
    `缺：${missing.join(',')} ｜ 多：${extra.join(',')}`)
  // ⭐ 反证：**不得**出现别的单元的键（那正是"越权提交 = 写坏别人的数据"）。
  const others = Object.entries(EXPECT).filter(([u]) => u !== unit).flatMap(([, ks]) => ks)
  const leaked = others.filter((k) => actual.has(k))
  check(`  ${unit}：**不含**其它单元的键`,
    leaked.length === 0, leaked.join(','))
}
check('⭐ 数值键只在 `NUM_KEYS` 里定义一次（`switch` 里靠 `nums` 展开）',
  Object.keys(numKeysOf).length > 0, JSON.stringify(Object.keys(numKeysOf)))

console.log('\n【6】`NUM_KEYS` 的 id/键/范围与期望一致（数值校验的表驱动来源）')
// 🔴 这一条防的是**最贵的一类错**：把 `integer` 标错（小数键标成整数 ⇒
//    用户存的 0.6 被前端拒掉），或 min/max 与服务端不一致
//    （网页存得进、插件启动却被 schemastery 拒）。
const EXPECT_NUM = {
  'sink-progress': [['progress-warn', 'progressCharsWarn', 1000, 1000000, true], ['progress-keep', 'progressCharsKeep', 1000, 1000000, true]],
  'hot-budget': [
    ['hot-ratio', 'hotInjectRatio', 0, 100, false], ['hot-cpt', 'hotCharsPerToken', 0.1, 10, false],
    ['hot-budget', 'hotBudgetCharsFallback', 1000, 10000000, true], ['hot-full-warn', 'hotFullWarnChars', 1, 1000000, true],
    ['hot-keep', 'hotSessionKeep', 1, 10000, true],
  ],
  'hot-score': [
    ['hs-threshold', 'hotScoreThreshold', 0, 1, false], ['hs-window', 'hotScoreWindowHours', 0.1, 10000, false],
    ['hs-topn', 'hotScoreTopN', 1, 200, true], ['hs-maxpicks', 'hotScoreMaxPicks', 1, 200, true],
    ['hs-gate-min', 'hotScoreGateMinScore', 1, 1000, true], ['hs-minchars', 'hotScoreMinChars', 0, 1000000, true],
    ['hs-timeout', 'hotScoreTimeoutMs', 1000, 300000, true],
  ],
  'index-en': [['tr-conc', 'translateConcurrency', 1, 20, true]],
  'active-judge': [
    ['ai-topk', 'activeInjectTopK', 1, 50, true], ['ai-need-min', 'activeInjectNeedMin', 0, 1, false],
    ['ai-item-min', 'activeInjectItemMin', 0, 1, false], ['ai-timeout', 'activeInjectTimeoutMs', 500, 120000, true],
    ['ai-calls', 'activeInjectMaxInjectionsPerTurn', 0, 50, true], ['ai-reasoncap', 'activeInjectReasoningMaxChars', 100, 100000, true],
  ],
  'active-budget': [
    ['ai-budgettok', 'activeInjectBudgetTokens', 1000, 200000, true], ['ai-ctxtok', 'activeInjectContextTokens', 1000, 200000, true],
    ['ai-conc', 'activeInjectConcurrency', 1, 16, true], ['ai-chatratio', 'activeInjectChatWindowRatio', 0.1, 1, false],
  ],
  'active-gate': [['ai-suff-min', 'activeInjectSufficientMin', 0, 1, false], ['ai-intent-min', 'activeInjectSearchIntentMin', 0, 1, false]],
}
// 逐行解析 `NUM_KEYS`（元素形态：['id', 'key', 'label', min, max, bool]）。
for (const [unit, want] of Object.entries(EXPECT_NUM)) {
  const block = new RegExp(`'${unit}':\\s*\\[([\\s\\S]*?)\\n  \\]`).exec(numBlock)?.[1] ?? ''
  const rows = [...block.matchAll(/\['([^']+)',\s*'([^']+)',\s*'[^']*',\s*([\d.]+),\s*([\d.]+),\s*(true|false)\]/g)]
    .map((m) => [m[1], m[2], Number(m[3]), Number(m[4]), m[5] === 'true'])
  check(`  ${unit}：${want.length} 行都对得上`,
    rows.length === want.length && want.every((w, i) => JSON.stringify(rows[i]) === JSON.stringify(w)),
    `实现 ${rows.length} 行：${JSON.stringify(rows)}`)
}

console.log('\n【7】`saveUnitsOf` 由 `SAVE_UNITS` **推导**（不手抄第二份）')
check('⭐ 有 `saveUnitsOf`', js.includes('function saveUnitsOf('))
check('  它是从 `SAVE_UNITS` 现算的（不是写死的数组）',
  /function saveUnitsOf\(page\)\s*\{[\s\S]*?Object\.keys\(SAVE_UNITS\)/.test(js))
check('⭐ `openSettingsPage` 清消息时用 `saveUnitsOf`（否则清不到已拆分的单元）',
  /saveUnitsOf\(state\.setSub\)/.test(js))

console.log('\n【8】"只读本单元"的纪律（决策 169 的教训：只裁一半更隐蔽）')
check('⭐⭐ 数值读取走 `NUM_KEYS[unit]`（不是无条件全跑）',
  /for \(const \[id, key, label, min, max, integer\] of NUM_KEYS\[unit\]/.test(js))
check('⭐ 元素不存在时**跳过该键**（删了控件却留着读它的代码 ⇒ 整块存不了）',
  /const el = document\.getElementById\(id\)[\s\S]{0,80}?if \(!el\) continue/.test(js))
check('⭐⭐ git 环境探测只在 `sink-git` 单元里跑（以前改个主题模式也会顺带探 git）',
  js.includes("unit === 'sink-git' && !!(gitBox && gitBox.checked)"))

console.log('\n【9】⭐⭐⭐ 两个总开关**即时生效**（用户 2026-10-07 裁定）')
// 用户原话：*"热知识注入和主动注入的总开关不需要保存按钮，应该是点击开关直接生效的。"*
// 🔴 **要动的地方比想象的多**（漏任何一处都不报错）：
//    ① 表单里**删掉**保存按钮；② 结果行**保留**（反馈不能丢）；
//    ③ 从 `SAVE_UNITS` 移除；④ 从 payload `switch` 移除；
//    ⑤ 新增 `change` 监听真的去写配置；⑥ **失败要弹回勾选态**。
{
  const instBlock = /const INSTANT_TOGGLES = \[([\s\S]*?)\n\]/.exec(js)?.[1] ?? ''
  check('  能找到 `INSTANT_TOGGLES` 表', instBlock !== '')
  for (const [id, key] of Object.entries(EXPECT_INSTANT)) {
    check(`  ⭐ ${id} → \`${key}\`（含所属子页，供消息清理）`,
      new RegExp(`\\['${id}',\\s*'${key}',\\s*'\\w+'\\]`).test(instBlock),
      instBlock.slice(0, 200))
    // ① 不许再有保存按钮。
    check(`  ⭐⭐ \`${id}\` **没有**保存按钮（否则"点了开关还要再点保存"）`,
      !savepages.includes(id), `仍有 data-savepage="${id}"`)
    // ② 但结果行必须留着（用户要看到成没成）。
    check(`  ⭐ \`${id}\` 仍**有结果行**（反馈不能丢）`, msgIds.includes(id))
    // ③④ 不得再出现在"按钮驱动"的两张表里。
    check(`  ⭐⭐ \`${id}\` 不在 \`SAVE_UNITS\` 里（那是按钮驱动的表）`,
      !new RegExp(`'${id}':`).test(unitBlock))
    check(`  ⭐⭐ \`${id}\` 不在 payload \`switch\` 里（否则两条通道会打架）`,
      !payloadCode.includes(`case '${id}':`))
  }
  // ⑤ 真的有 change 监听并写配置。
  check('⭐⭐ `bindInstantToggles` 已定义', js.includes('function bindInstantToggles('))
  check('⭐⭐ 它监听 `change`（用户点开关的那一刻就生效）',
    /function bindInstantToggles\(\)[\s\S]{0,900}?addEventListener\('change'/.test(js))
  check('⭐⭐ 它真的写配置（`postJson(\'/settings\'`）',
    /function bindInstantToggles\(\)[\s\S]{0,1200}?postJson\('\/settings'/.test(js))
  check('⭐⭐ 它在启动时被调用（漏了 ⇒ 开关点了没反应）',
    /^bindInstantToggles\(\)$/m.test(js))
  // ⑥ 失败必须弹回勾选态（否则开关在说谎：界面显示已开启、配置里没写）。
  check('⭐⭐⭐ 保存失败时**弹回勾选态**（不能让开关显示成已开启而实际没生效）',
    /box\.checked = !want/.test(js))
  // ⭐ 反证：不许把"带配套参数"的项也做成即时（那会变成每敲一个字符写一次盘，
  //    且半成品配置会被热重载吃进去）。`ai-strict` 是最像的那个诱饵。
  check('⭐⭐ 反证：`ai-strict` **仍走保存按钮**（它与通路/模型同属一块、且过模型守卫）',
    /\['ai-strict'/.test(js) === false && payloadCode.includes("chk('ai-strict')"))
  check('⭐⭐ 即时开关的"缺模型"守卫与召回模型保存处**共用一份判据**',
    js.includes('function activeModelMissing(') && /activeModelMissing\(\)/.test(js))
}

console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
