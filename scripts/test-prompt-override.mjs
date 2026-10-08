/**
 * 测试：**提示词运行期覆盖层**（`src/prompts.ts` + 各取值点）。
 *
 * 🔴 **为什么这组测试必须存在**（本项目纪律）：
 *    "委托给外部/间接机制的功能，必须断言那个机制真的被接上了" ——
 *    覆盖值存在磁盘上、而取值点在**另一个模块**里读它 ⇒
 *    **"写进去了但没人读"** 这类缺陷不会有任何报错（表现为"我明明改了、没生效"）。
 *    ⇒ 本文件的【3】专门断言"**改了覆盖值之后，装配/取值真的变了**"。
 *
 * 覆盖五组：
 *   1. 校验规则（空 / 预算 / 英文 / 围栏）
 *   2. 保存 → 读回（含"覆盖优先于默认"）
 *   3. ⭐⭐ **运行期生效**：改覆盖值 ⇒ 取值点立刻返回新值（**核心**）
 *   4. 恢复默认（删覆盖项 ⇒ 回落源码常量）
 *   5. 历史备份（保存时留旧版 + 可读回）
 *
 * 用法：node scripts/test-prompt-override.mjs
 * ⚠️ **只用临时库**（`MEMJ_DATA_DIR` 指向 mkdtemp）——绝不碰生产库。
 */
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 🔴🔴 **必须在 import 插件模块之前设库根**（本项目踩过：晚了就写进生产库）。
const lib = mkdtempSync(join(tmpdir(), 'memj-prompt-test-'))
process.env['MEMJ_DATA_DIR'] = lib

// ⚠️ **从 `lib/index.js` 导入**（不是 `lib/prompts.js`）：本项目所有测试都走这个
//    公共 chunk —— `prompts.ts` 被静态 import 进主 chunk，**没有独立的 lib/prompts.js**。
const P = await import('../lib/index.js')
const { promptOverridesPath, promptHistoryDir, libraryRoot } = P

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  OK   ${n}`) }
  else { fail += 1; console.log(`  FAIL ${n}${e ? `  ⟵ ${e}` : ''}`) }
}

console.log('════════ 测试：提示词运行期覆盖层 ════════\n')
console.log(`（库根自证）MEMJ_DATA_DIR = ${libraryRoot()}`)
if (!libraryRoot().startsWith(tmpdir())) {
  console.error('🔴 库根不在临时目录里，拒绝继续（防写生产库）')
  process.exit(1)
}

// ══════════════════════════════════════════════════════════════════
// 【1】校验规则
// ══════════════════════════════════════════════════════════════════
console.log('\n【1】校验规则')

check('1a 空内容被拒', P.validatePrompt('section:memj:protocol', '   ').length > 0)
check('1b 协议超 2500 字符被拒',
  P.validatePrompt('section:memj:protocol', 'x'.repeat(2501)).some((s) => s.includes('超过预算')))
check('1c 协议 2500 字符刚好通过',
  P.validatePrompt('section:memj:protocol', 'x'.repeat(2500)).length === 0)
check('1d JEV 四条中文被拒',
  P.validatePrompt('jev:need', '是否需要外部知识？').some((s) => s.includes('必须全英文')))
check('1e JEV 英文通过',
  P.validatePrompt('jev:need', 'Does the context need external knowledge?').length === 0)
check('1f 围栏不成对被拒',
  P.validatePrompt('context:memj:usage-guidance', 'a\n```\nb').some((s) => s.includes('围栏不成对')))
// ⚠️ 样本**必须能通过该条目的全部校验**（含"交给 DSH 的通道禁 `{{}}`"，决策 217）。
//    ⭐ 判据：给一条提示词加校验后，**所有构造样本的地方都要跟着改**。
check('1g 围栏成对通过',
  P.validatePrompt('context:memj:usage-guidance', 'a\n```\nb\n```').length === 0)
// ⭐ 反证：**交给 DSH 的通道里出现 `{{…}}` ⇒ 被拒**（这条是本次崩溃的直接防线）
check('1g2 🔴 交给 DSH 的通道里出现 `{{kindCatalog}}` ⇒ 被拒（DSH 只认小写且须已注册）',
  P.validatePrompt('context:memj:usage-guidance', 'a\n{{kindCatalog}}\nb').some((s) => s.includes('{{')))
// ⭐ 反向：**memj 自填的通道（命令注入）里 `{{}}` 合法** —— 别把闸设成全局
//    （第一版就是全局，当场误伤了 `handoff:prompt-steps`，被 check-prompt-specs 抓到）
check('1g3 ⭐ 反证：memj 自填的通道里 `{{}}` 合法（闸只管交给 DSH 的那些）',
  P.validatePrompt('handoff:prompt-note', '内容是 {{userNote}} 结束').length === 0)
check('1h 未知键被拒', P.validatePrompt('nonexistent:key', 'x').length > 0)
check('1i 只读项被拒（参数 schema）',
  P.validatePrompt('tool:memj_info:parameters', '{}').some((s) => s.includes('只读')))
check('1j 只读项被拒（输出 schema）',
  P.validatePrompt('tool:memj_info:output', '{}').some((s) => s.includes('只读')))
// ⭐ 反证：**可编辑**的那条目确实**能通过校验**（否则 1i/1j 的"被拒"可能只是全都在拒）
check('1k 反证：可编辑项空内容也能过（只有 nonEmpty 不挡非空）',
  P.validatePrompt('tool:memj_info:description', '正常文本').length === 0)

// ══════════════════════════════════════════════════════════════════
// 【2】保存 → 读回
// ══════════════════════════════════════════════════════════════════
console.log('\n【2】保存 → 读回')

// 先登记一个默认值（真实运行由各模块登记；测试里手工登记以便验证回落）。
P.registerPromptDefault('tool:memj_info:description', 'DEFAULT-TEXT')
P.registerPromptDefault('section:memj:protocol', 'PROTO-DEFAULT')

check('2a 未覆盖时取到默认值', P.promptText('tool:memj_info:description', 'DEFAULT-TEXT') === 'DEFAULT-TEXT')

const r1 = await P.savePromptOverride('tool:memj_info:description', 'OVERRIDDEN-1')
check('2b 保存返回 ok', r1.ok === true && r1.saved === true, JSON.stringify(r1.errors))
check('2c 覆盖文件真的落盘了', existsSync(promptOverridesPath()))
check('2d 有覆盖标记', P.hasOverride('tool:memj_info:description') === true)

// ⭐ 模拟**重启**：清空内存后走 `refreshPromptCacheSync()`（那才是 `apply` 时的真实路径）
//    ——证明覆盖值持久化，不只是内存态。
//    🔴 **注意别用 `resetPromptCache()` 来测这件事**：它只清内存、不读盘，
//       而 `promptText` 按设计**只读内存** ⇒ 清了之后必然回默认值（那是正确行为）。
P.resetPromptCache()
check('2e 清空缓存后（未读盘）回落到默认值 —— 这是设计如此', P.promptText('tool:memj_info:description', 'DEFAULT-TEXT') === 'DEFAULT-TEXT')
const loaded = P.refreshPromptCacheSync()
check('2f ⭐⭐ 走真实重启路径（refreshPromptCacheSync）后，覆盖值回来了',
  P.promptText('tool:memj_info:description', 'DEFAULT-TEXT') === 'OVERRIDDEN-1',
  `装载 ${loaded} 条；实得 ${JSON.stringify(P.promptText('tool:memj_info:description', 'DEFAULT-TEXT'))}`)

// ══════════════════════════════════════════════════════════════════
// 【3】⭐⭐ 运行期生效（本文件的**核心**）
// ══════════════════════════════════════════════════════════════════
console.log('\n【3】⭐⭐ 运行期生效（改覆盖值 ⇒ 取值点立刻变）')

// 这就是 DSH 装配路径上发生的事：`text: () => promptText(key, FALLBACK)`。
// ⚠️ 断言的是"**取值点**看到的文本"，而不是"文件里写着什么" —— 后者不能证明接上了。
const before = P.promptText('tool:memj_info:description', 'DEFAULT-TEXT')
const r2 = await P.savePromptOverride('tool:memj_info:description', 'OVERRIDDEN-2')
const after = P.promptText('tool:memj_info:description', 'DEFAULT-TEXT')
check('3a ⭐ 保存后**无需重启**，取值点即为新值', after === 'OVERRIDDEN-2' && before !== after,
  `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
check('3b 保存结果 ok', r2.ok === true)

// ⭐⭐ 反证：**不同键互不干扰**（证明不是"改一个全变"的假象）
await P.savePromptOverride('section:memj:protocol', 'PROTO-CUSTOM')
check('3c ⭐ 反证：改协议键**不影响**工具描述键',
  P.promptText('tool:memj_info:description', 'DEFAULT-TEXT') === 'OVERRIDDEN-2')
check('3d 协议键确实是新值', P.promptText('section:memj:protocol', 'PROTO-DEFAULT') === 'PROTO-CUSTOM')

// ⭐⭐ 反证：**未覆盖的键仍回默认值**（证明覆盖不是全局污染）
check('3e ⭐ 反证：未覆盖的键仍返回它自己的默认值',
  P.promptText('context:memj:usage-guidance', 'GUIDE-FALLBACK') === 'GUIDE-FALLBACK')

// ══════════════════════════════════════════════════════════════════
// 【4】恢复默认
// ══════════════════════════════════════════════════════════════════
console.log('\n【4】恢复默认')

const r3 = await P.resetPromptOverride('tool:memj_info:description')
check('4a 恢复默认返回 ok', r3.ok === true)
check('4b 覆盖标记消失', P.hasOverride('tool:memj_info:description') === false)
check('4c ⭐ 恢复后取值点回落到源码默认值',
  P.promptText('tool:memj_info:description', 'DEFAULT-TEXT') === 'DEFAULT-TEXT')
// ⭐ 反证：别的键**不受影响**（恢复一个不该把全部恢复）
check('4d ⭐ 反证：恢复本键**不影响**另一个键的覆盖',
  P.promptText('section:memj:protocol', 'PROTO-DEFAULT') === 'PROTO-CUSTOM')
// ⭐ 幂等：对没有覆盖的键再恢复一次应当安全
const r4 = await P.resetPromptOverride('tool:memj_info:description')
check('4e 重复恢复是幂等的（saved=false 但不报错）', r4.ok === true && r4.saved === false)

// ══════════════════════════════════════════════════════════════════
// 【5】历史备份
// ══════════════════════════════════════════════════════════════════
console.log('\n【5】历史备份')

await P.savePromptOverride('tool:memj_info:description', 'V-A')
await P.savePromptOverride('tool:memj_info:description', 'V-B')
await P.savePromptOverride('tool:memj_info:description', 'V-C')
const hist = await P.listPromptHistory('tool:memj_info:description')
check('5a 历史目录里有备份', hist.length >= 2, `实得 ${hist.length} 条`)
check('5b 历史倒序（最新在前）', hist.length >= 2 && hist[0] > hist[1])
const oldText = await P.readPromptHistory(hist[hist.length - 1])
check('5c 能读回某版历史', typeof oldText === 'string' && oldText.length > 0, `实得 ${JSON.stringify(oldText)}`)
// ⭐ 反证：历史里**能读到被替换掉的旧值**（否则备份没意义）。
//    ⚠️ **扫全部历史、不假定具体是哪一版** —— 哪一次保存产生备份取决于
//    "上一次的值"是否存在过覆盖（本项目刚因此把断言写窄过一次）。
const allHist = []
for (const f of hist) {
  const t = await P.readPromptHistory(f)
  if (typeof t === 'string') allHist.push(t)
}
check('5d ⭐ 历史里含被替换掉的旧值（V-A 或 V-B）',
  allHist.includes('V-A') || allHist.includes('V-B') || allHist.includes('OVERRIDDEN-1') || allHist.includes('OVERRIDDEN-2'),
  `实得 ${JSON.stringify(allHist)}`)
// ⭐⭐ **同毫秒不撞名**（本文件刚加的一条真防线）：连续快速保存必须产生**多份**备份。
check('5e ⭐⭐ 连续三次保存产生 ≥2 份不同备份（同毫秒也不互相覆盖）', hist.length >= 2, `实得 ${hist.length}`)

// 🔴 **路径穿越防护**（安全边界）
check('5f 🔴 拒绝带路径分隔符的历史文件名', (await P.readPromptHistory('../../etc/passwd')) === undefined)
check('5g 🔴 拒绝带 .. 的历史文件名', (await P.readPromptHistory('..\\secrets.txt')) === undefined)

// ══════════════════════════════════════════════════════════════════
// 【7】⭐⭐ 回退到历史版本（"备份回退"的第二个方向）
// ══════════════════════════════════════════════════════════════════
console.log('\n【7】回退到历史版本')

// 造一个可预测的三步历史：H1 → H2 → H3（当前是 H3）
const RK = 'tool:memj_search:description'
P.registerPromptDefault(RK, 'SEARCH-DEFAULT')
await P.savePromptOverride(RK, 'H1')
await P.savePromptOverride(RK, 'H2')
await P.savePromptOverride(RK, 'H3')
check('7a 当前是最后一版', P.promptText(RK, 'SEARCH-DEFAULT') === 'H3')

const rHist = await P.listPromptHistory(RK)
check('7b 有历史可回退', rHist.length >= 1, `实得 ${rHist.length}`)

// ⭐ 回退到**最早那一版**（列表倒序 ⇒ 最后一项）
const oldest = rHist[rHist.length - 1]
const r7 = await P.restorePromptHistory(RK, oldest)
check('7c 回退返回 ok', r7.ok === true, JSON.stringify(r7.errors))
const afterRestore = P.promptText(RK, 'SEARCH-DEFAULT')
check('7d ⭐⭐ 回退后取值点即为那一版的文本', afterRestore === 'H1' || afterRestore === 'H2',
  `实得 ${JSON.stringify(afterRestore)}`)
// ⭐ 反证：回退确实改变了值（不是"原本就是它"）
check('7e ⭐ 反证：回退前是 H3，回退后不同', afterRestore !== 'H3')

// ⭐⭐ **回退也走校验**（关键：历史文本是过去写的，规则可能已变严）
const r7f = await P.restorePromptHistory('jev:need', '不存在的文件.txt')
check('7f 读不到历史 ⇒ 明确失败（不静默）', r7f.ok === false && r7f.errors.length > 0)

// ⭐ **回退不存在的 key/文件不写盘**
const before7 = JSON.stringify(await P.loadPromptOverrides())
await P.restorePromptHistory('jev:need', 'nope.txt')
const after7 = JSON.stringify(await P.loadPromptOverrides())
check('7g ⭐ 反证：失败的回退**没有改覆盖表**', before7 === after7)

// ⭐ **时间戳真的落盘并能读回**（第一版这里是硬写的 '' ⇒ 界面撒谎）
const det = await P.loadPromptOverrides()
check('7h ⭐⭐ 覆盖表里存了 updatedAt', typeof det.overrides[RK]?.updatedAt === 'string' && det.overrides[RK].updatedAt !== '',
  JSON.stringify(det.overrides[RK]?.updatedAt))
check('7i ⭐⭐ `overrideUpdatedAt()` 能同步读到它（界面要显示"改于何时"）',
  P.overrideUpdatedAt(RK) !== '', `实得 ${JSON.stringify(P.overrideUpdatedAt(RK))}`)
check('7j 未被覆盖的键时间为空（不撒谎）', P.overrideUpdatedAt('context:memj:usage-guidance') === '')

// ⭐⭐ **重启后时间也在**（它必须持久化，不能只在内存）
P.refreshPromptCacheSync()
check('7k ⭐⭐ 走重启路径后 updatedAt 仍在', P.overrideUpdatedAt(RK) !== '',
  `实得 ${JSON.stringify(P.overrideUpdatedAt(RK))}`)

// ══════════════════════════════════════════════════════════════════
// 【6】元数据表完整性（展示页的账本）
// ══════════════════════════════════════════════════════════════════
console.log('\n【6】元数据表完整性')

const specs = P.PROMPT_SPECS
check('6a 规格表非空', specs.length > 0, `实得 ${specs.length}`)
check('6b key 唯一（无重复）', new Set(specs.map((s) => s.key)).size === specs.length)
// ⭐⭐⭐ **2026-10-12 判据更新**：分区轴从"生效方式/影响面"（3 个）
//    换成"**谁在什么时候看到这段文本**"（10 个，见 `prompt-catalog.ts` 的 `PROMPT_GROUPS`）。
//    ⚠️ 旧断言写死了 `['resident','tools','internal']` ⇒ 换轴后必然报红。
//    ⭐ **判据要跟着设计走，不是改代码迁就旧判据** —— 但**必须真的生效**：
//       所以这里改成"**在受控词表里**"（而不是把词表再抄一遍 ⇒ 那又是多副本）。
check('6c 每条的分组都在受控词表里（`PROMPT_GROUPS`）',
  specs.every((s) => P.PROMPT_GROUPS[s.zone] !== undefined),
  `受控词表：${Object.keys(P.PROMPT_GROUPS).join('/')}`)
// ⭐⭐ **新不变量**（本次重构的核心）：每条 spec 都必须有目录条目。
//    ⚠️ 这正是"人读文案搬去 prompt-catalog.ts"之后新增的漂移风险。
check('6c2 每条都有目录条目（分组说明 / 用途 / 归属齐全）',
  specs.every((s) => P.catalogOf(s.key) !== undefined),
  specs.filter((s) => P.catalogOf(s.key) === undefined).map((s) => s.key).join('、'))
check('6d 每条都有 purpose / owner / injectMode / sourceFile（展示六字段齐）',
  specs.every((s) => s.purpose !== '' && s.owner !== '' && s.injectMode !== '' && s.sourceFile !== ''))
check('6e 每条都标了 breaksCache', specs.every((s) => ['yes', 'no', 'na'].includes(s.breaksCache)))
check('6f 只读项必须给出 readonlyWhy（界面要解释"为什么不能改"）',
  specs.filter((s) => !s.editable).every((s) => (s.readonlyWhy ?? '') !== ''))
check('6g 十个工具都在表里', ['memj_info', 'memj_search', 'memj_read', 'memj_snapshots', 'memj_handoff', 'memj_promote', 'memj_update', 'memj_rebuild', 'memj_normalize_tags', 'memj_score_turn']
  .every((t) => specs.some((s) => s.key === `tool:${t}:description`)))
check('6h 每个工具都有 parameters 与 output 的只读项',
  ['memj_info', 'memj_handoff'].every((t) => specs.some((s) => s.key === `tool:${t}:parameters` && !s.editable) && specs.some((s) => s.key === `tool:${t}:output` && !s.editable)))
check('6i 两个常驻通道都在（section + context）',
  specs.some((s) => s.key === 'section:memj:protocol') && specs.some((s) => s.key === 'context:memj:usage-guidance'))
check('6j JEV 四条都在且都要求英文',
  ['jev:candidate', 'jev:need', 'jev:sufficient', 'jev:search-intent']
    .every((k) => specs.some((s) => s.key === k && s.checks.some((c) => c.kind === 'englishOnly'))))
// ⭐⭐ 协议是唯一"超预算会被拦"的条目 —— 断言它确实带 maxChars 校验
check('6k 协议带预算校验（2500）',
  specs.some((s) => s.key === 'section:memj:protocol' && s.checks.some((c) => c.kind === 'maxChars' && c.max === 2500)))

// ══════════════════════════════════════════════════════════════════
// 【8】⭐⭐ **防遗漏：源码里"写给模型的常量"必须都在规格表里**
// ══════════════════════════════════════════════════════════════════
//
// 🔴🔴 **为什么要这条**：本页的口号是"所有提示词"，而**新增一个提示词常量时
//    极易忘记登记**（我的第一版就漏了 `score-turn.ts` 的 `JEV_SCORE_INSTRUCTION`
//    —— 它被使用、却不出现在页面上 ⇒ **用户看不到、也改不了**）。
//    ⚠️ 这类遗漏**没有任何报错**：常量照常生效，只是"隐形"。
//    ⭐ 判据：**扫源码里的可疑常量名，要求它们都出现在规格表里**（白名单放行"不是提示词"的）。
console.log('\n【8】防遗漏：源码常量 ↔ 规格表')

import { readFileSync as rf, readdirSync as rd } from 'node:fs'
import { join as jp, dirname as dn } from 'node:path'
import { fileURLToPath as f2u } from 'node:url'
const SRC = jp(dn(f2u(import.meta.url)), '..', 'src')
/** 名字像"提示词"的常量（大写 + 关键词结尾）。 */
const NAME_RE = /^(?:export )?const ([A-Z][A-Z0-9_]*(?:_SYS|_SYSTEM|_PROMPT|_INSTRUCTION|_CLOSING|_TEXT|_DESCRIPTION|_GUIDANCE))\b/g
/** 🔴 **白名单**：名字像提示词、但**不是写给模型的文本**。 */
const NOT_A_PROMPT = new Set([
  'CONTEXT_TEXT',          // 就是 context 通道那一段（已由 `context:memj:usage-guidance` 覆盖）
  'PROTOCOL_TEXT',         // 同上（`section:memj:protocol`）
  'DEFAULT_TEXT',          // 测试夹具名，不会出现在 src
])
const found = []
for (const f of rd(SRC).filter((x) => x.endsWith('.ts'))) {
  const code = rf(jp(SRC, f), 'utf8')
  for (const m of code.matchAll(NAME_RE)) {
    if (NOT_A_PROMPT.has(m[1])) continue
    found.push({ file: f, name: m[1] })
  }
}
// ⭐ 本测试**只做"存在性提醒"**：列出源码里像提示词的常量，并检查它们的**文本**
//    是否能在规格表里找到同名 key 的登记（判据：该常量文本 === 某个 key 的默认值）。
const registeredTexts = new Set()
for (const k of specs.map((x) => x.key)) {
  const d = P.promptDefault(k)
  if (d !== undefined) registeredTexts.add(d)
}
const suspicious = []
for (const { file, name } of found) {
  // 取该常量的**源码文本**（不 eval，只判"它的值是否已作为某个 key 的默认值登记"）
  const code = rf(jp(SRC, file), 'utf8')
  const i = code.indexOf(`const ${name}`)
  const snippet = code.slice(i, i + 400)
  // 若它的文本片段与任何已登记默认值有 ≥40 字符的重叠 ⇒ 认为已登记
  const hit = [...registeredTexts].some((d) => {
    const head = d.slice(0, 40)
    return head !== '' && snippet.includes(head.slice(0, 20)) && d.length > 20
  })
  if (!hit) suspicious.push(`${file}:${name}`)
}
// ⚠️ 这条**先按"提醒"实现**：报出来但不判红 —— 因为"像提示词的名字"会有误报
//    （如 `XXX_DESCRIPTION` 可能只是给人看的注释常量）。
//    ⭐ 但**空列表是强信号**：说明没有漏网的。
check('8a 源码里没有"像提示词却未登记"的常量', suspicious.length === 0,
  suspicious.length > 0 ? `可疑：${suspicious.join('、')}` : '')
// 🔴 **8b 的判据在 2026-10-12 改过**：原来把数字**写死**（工具 36）——
//    而"加一个工具"是**合法变更**（决策 205 加了 `memj_template`，工具区 36 → 39）
//    ⇒ 写死的数字会**必然假红**，且逼着人每次去改测试（那正是"测试跟着实现跑"的坏味道）。
//    ⭐ 改成**从源头推导期望值**：工具区 = 工具数 × 3（description/parameters/output）
//      + 命令数 + 其它手工项；工具数直接**读 `TOOL_META`**（与 `check-prompt-specs.mjs`
//      同一份判据口径：账本 = 实际注册的工具）。
//    ⚠️ 这样它仍然抓得住"分区串了/少登记了"，但**不再因合法增删而假红**。
const metaToolCount = (() => {
  const src = rf(jp(SRC, 'prompts.ts'), 'utf8').replace(/\r\n/g, '\n')
  const i = src.indexOf('const TOOL_META')
  const a = src.indexOf('[', i)
  const b = src.indexOf('\n]', a)
  return (src.slice(a, b).match(/\{\s*name:\s*'[a-z_]+'/g) ?? []).length
})()
const toolsZone = specs.filter((s) => s.zone === 'tools').length
// 工具类条目 = 每工具 3 条；其余是命令描述(4) + inject:closing + handoff:prompt。
const expectedToolsMin = metaToolCount * 3
// ⭐⭐⭐ **2026-10-12 判据更新**：分组轴换成"谁在什么时候看到"（10 组）之后，
//    "工具 ≥33 / 内部 ≥13"这种按**旧轴**算的数字不再成立。新判据落在**不变的部分**上：
//      · 常驻**正好 2 条**（协议 + 使用指导，这是硬事实）；
//      · **工具说明书**每组 3 条（11 工具 × 3）—— 分组变了但这个结构没变；
//      · **10 个分组每一个都至少有一条**（否则那一组是空壳，页面上不会显示 ⇒ 静默少内容）。
const groupCounts = {}
for (const s of specs) groupCounts[s.zone] = (groupCounts[s.zone] ?? 0) + 1
const emptyGroups = Object.keys(P.PROMPT_GROUPS).filter((g) => (groupCounts[g] ?? 0) === 0)
check(
  `8b 分组结构合理（常驻 2 / 工具说明书 ≥${expectedToolsMin} / 10 组无空组）`,
  specs.filter((s) => s.zone === 'resident').length === 2 &&
    toolsZone >= expectedToolsMin &&
    emptyGroups.length === 0,
  `实际：常驻 ${specs.filter((s) => s.zone === 'resident').length} / ` +
    `工具说明书 ${toolsZone} / 空组 ${emptyGroups.length === 0 ? '无' : emptyGroups.join('、')} / ` +
    `共 ${Object.keys(groupCounts).length} 组有内容`,
)
check('8c ⭐ 知识评分 JEV 通路的提问也在表里（第一版漏过它）',
  specs.some((s) => s.key === 'score:jev-instruction' && s.checks.some((c) => c.kind === 'englishOnly')))

// ══════════════════════════════════════════════════════════════════
console.log(`\n════════ 结果：${pass} 通过 / ${fail} 失败 ════════`)

// 清理临时库
try { rmSync(lib, { recursive: true, force: true }) } catch { /* 忽略 */ }

if (fail > 0) process.exit(1)
