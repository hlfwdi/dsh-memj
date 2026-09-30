/**
 * 标签规范化工具（决策 162）测试。
 *
 * ⚠️ **重点**（都是本设计最容易做错的地方）：
 *   ① **水位线语义**：`updatedAt > lastRunAt`；**无时间戳的必须 drop**
 *      （🔴 不是"宽大处理算在内"——写入刻意不碰 `updatedAt`，它们永远出不去）；
 *   ② **首次运行 = 水位线"现在"** ⇒ 范围为空、不花钱；
 *   ③ 🔴🔴 **A 层（全库纯查表）必须不受水位线限制** —— 这是本设计最关键的一层：
 *      词表的新决定要能传播到**老条目**，否则会出现"词表说要合、数据里还留着旧词"；
 *   ④ **alias 冲突必须拒绝**（不能"后来者覆盖"⇒ 结果取决于键序）；
 *   ⑤ **传递合并**（A→B、B→C ⇒ A→C）与**环检测**；
 *   ⑥ **安全阀**：合并后某条 tag 全空 ⇒ 回退原样（否则违反"至少 1 个"）。
 *
 * ⚠️ 必须在 `pnpm run build` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-tag-normalize.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-tagnorm-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const {
  emptyVocabulary, seedVocabulary, aliasIndex, resolveTag, findAliasConflicts,
  resolveMerges, applyMerges, loadVocabulary, saveVocabulary, extractJson,
} = mod

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}
const V = (canon) => ({
  version: 1, lastRunAt: '2026-01-01T00:00:00.000Z',
  canonical: Object.fromEntries(
    Object.entries(canon).map(([k, v]) => [k, { aliases: v.a ?? [], en: v.en ?? '' }]),
  ),
})

console.log(`库根: ${lib}\n`)

// ══════════════════════════════════════════════════════════════
console.log('【1】词表基础：空表 / 播种 / 反查')
// ══════════════════════════════════════════════════════════════
{
  const v = emptyVocabulary('2026-09-28T00:00:00.000Z')
  check('空词表 lastRunAt = 给定时间', v.lastRunAt === '2026-09-28T00:00:00.000Z')
  check('空词表没有规范词', Object.keys(v.canonical).length === 0)

  const n = seedVocabulary(v, ['插件', '缓存', '插件', '  '])
  check('播种登记了 2 个（去重、去空）', n === 2, String(n))
  check('  `插件` 已登记', v.canonical['插件'] !== undefined)
  check('  ⭐ 播种**不推水位线**（保持原值）', v.lastRunAt === '2026-09-28T00:00:00.000Z')

  const n2 = seedVocabulary(v, ['插件'])
  check('  ⭐ 幂等：重复播种不新增', n2 === 0, String(n2))

  // seedVocabulary 不能覆盖已有的 aliases / en
  v.canonical['缓存'].aliases = ['cache']
  v.canonical['缓存'].en = 'cache'
  seedVocabulary(v, ['缓存'])
  check('  ⭐ 播种不覆盖已有 aliases/en',
    v.canonical['缓存'].aliases.length === 1 && v.canonical['缓存'].en === 'cache')
}

// ══════════════════════════════════════════════════════════════
console.log('\n【2】aliasIndex + resolveTag（A 层的纯查表）')
// ══════════════════════════════════════════════════════════════
{
  const v = V({ 静默失败: { a: ['静默失效', '静默错误'] }, DSH: { a: ['dsh'] } })
  const idx = aliasIndex(v)
  check('  canonical 自身可解析', resolveTag('静默失败', idx) === '静默失败')
  check('  alias 解析到 canonical', resolveTag('静默失效', idx) === '静默失败')
  check('  另一个 alias 同理', resolveTag('静默错误', idx) === '静默失败')
  check('  大小写别名', resolveTag('dsh', idx) === 'DSH')
  check('⭐⭐ **词表里没有的** ⇒ undefined（= 待裁决的新词）', resolveTag('新词', idx) === undefined)
  check('  首尾空白被容错', resolveTag('  DSH  ', idx) === 'DSH')
}

// ══════════════════════════════════════════════════════════════
console.log('\n【3】⭐⭐ alias 冲突必须拒绝（不能"后来者覆盖"）')
// ══════════════════════════════════════════════════════════════
{
  const v = V({ A: { a: ['x'] }, B: { a: ['x'] } })
  const c = findAliasConflicts(v)
  check('⭐⭐ 检出一处冲突', c.length === 1, JSON.stringify(c))
  check('  冲突里列出两个目标', c[0]?.targets.length === 2, JSON.stringify(c[0]))
  check('  目标是排序过的（确定性）', JSON.stringify(c[0]?.targets) === JSON.stringify(['A', 'B']))

  const ok = V({ A: { a: ['x'] }, B: { a: ['y'] } })
  check('  无冲突 ⇒ 空数组', findAliasConflicts(ok).length === 0)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【4】⭐⭐ 传递合并与环检测')
// ══════════════════════════════════════════════════════════════
{
  const r1 = resolveMerges({ A: 'B', B: 'C' })
  check('⭐⭐ A→B、B→C 解析成 A→C', r1.ok && r1.map['A'] === 'C', JSON.stringify(r1))
  check('  B 也指向 C', r1.ok && r1.map['B'] === 'C')

  const r2 = resolveMerges({ A: 'A' })
  check('  自指被忽略（不入表）', r2.ok && r2.map['A'] === undefined, JSON.stringify(r2))

  const r3 = resolveMerges({ A: 'B', B: 'A' })
  check('⭐⭐ 环 ⇒ ok:false', r3.ok === false, JSON.stringify(r3))
  check('  环里列出涉及词', r3.ok === false && r3.cycle.length >= 3, JSON.stringify(r3.ok === false ? r3.cycle : []))

  const r4 = resolveMerges({ A: 'B', B: 'C', C: 'A' })
  check('  三元环也检出', r4.ok === false)

  const r5 = resolveMerges({ A: '', B: 'C' })
  check('  空目标被忽略', r5.ok && r5.map['A'] === undefined && r5.map['B'] === 'C')
}

// ══════════════════════════════════════════════════════════════
console.log('\n【5】⭐⭐ applyMerges：被并走的 canonical 降级成 alias')
// ══════════════════════════════════════════════════════════════
{
  const v = V({ 静默失败: { a: ['静默失效'] }, 静默故障: { a: ['静默异常'], en: 'silent fault' } })
  const applied = applyMerges(v, { 静默故障: '静默失败' })
  check('⭐ 目标 canonical 存在', applied.canonical['静默失败'] !== undefined)
  check('⭐⭐ 被并走的词**自己变成 alias**', applied.canonical['静默失败'].aliases.includes('静默故障'))
  check('  它原来的 alias 也一起带过来', applied.canonical['静默失败'].aliases.includes('静默异常'))
  check('  原 canonical 已不在表里', applied.canonical['静默故障'] === undefined)
  check('⭐ 英文被继承（没丢掉已翻好的）', applied.canonical['静默失败'].en === 'silent fault')

  // 关键：合并后不能再有冲突
  check('⭐⭐ 合并后无 alias 冲突', findAliasConflicts(applied).length === 0,
    JSON.stringify(findAliasConflicts(applied)))

  // 反证：若不合并，`静默故障` 与 `静默失败` 是两个独立 canonical
  check('  ⭐ 反证：合并前它们是两个不同的规范词',
    v.canonical['静默故障'] !== undefined && v.canonical['静默失败'] !== undefined)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【6】词表读写 + 损坏容错')
// ══════════════════════════════════════════════════════════════
{
  const before = await loadVocabulary()
  check('  未写过 ⇒ undefined（**不是空表**）', before === undefined,
    '⚠️ 损坏/缺失回空表会让调用方把全库 tag 当新词重判一遍')

  const v = V({ A: { a: ['a1'], en: 'aaa' } })
  v.lastRunAt = '2026-09-28T01:02:03.000Z'
  await saveVocabulary(v)
  const back = await loadVocabulary()
  check('  写完能读回', back !== undefined)
  check('  ⭐ lastRunAt 原样读回', back?.lastRunAt === '2026-09-28T01:02:03.000Z', String(back?.lastRunAt))
  check('  aliases 原样', JSON.stringify(back?.canonical['A']?.aliases) === JSON.stringify(['a1']))
  check('  en 原样', back?.canonical['A']?.en === 'aaa')
  check('⭐⭐ **水位线与词表在同一个文件**（用户裁定）',
    back !== undefined && 'lastRunAt' in back && 'canonical' in back)

  // 自净化：alias 等于自己的 canonical 名 ⇒ 丢弃
  const v2 = V({ A: { a: ['A', 'x'] } })
  await saveVocabulary(v2)
  const back2 = await loadVocabulary()
  check('  自指 alias 被净化掉', !back2?.canonical['A']?.aliases.includes('A'),
    JSON.stringify(back2?.canonical['A']?.aliases))
  check('  正常 alias 保留', back2?.canonical['A']?.aliases.includes('x'))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【7】extractJson：容忍围栏与噪音')
// ══════════════════════════════════════════════════════════════
{
  check('  纯 JSON', extractJson('{"a":1}') !== undefined)
  check('  ```json 围栏', JSON.stringify(extractJson('```json\n{"a":1}\n```')) === '{"a":1}')
  check('  前后有说明文字', JSON.stringify(extractJson('好的：\n{"a":1}\n以上')) === '{"a":1}')
  check('  非 JSON ⇒ undefined', extractJson('我不知道') === undefined)
  check('  空串 ⇒ undefined', extractJson('') === undefined)
  check('  截断的 JSON ⇒ undefined', extractJson('{"a":') === undefined)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【8】⭐⭐ 静态反证：水位线判据与 A 层的结构')
// ══════════════════════════════════════════════════════════════
{
  const { readFileSync } = await import('node:fs')
  const repoRoot = process.cwd()
  const src = readFileSync(join(repoRoot, 'src', 'tag-normalize.ts'), 'utf8')
  const vocabSrc = readFileSync(join(repoRoot, 'src', 'tag-vocab.ts'), 'utf8')

  // ① 水位线必须是"开工前取"
  check('⭐⭐ `openedAt` 在【开工前】取（不是收工后）',
    /const openedAt = nowIso/.test(src) && /nextVocab\.lastRunAt = openedAt/.test(src))
  // ② 无时间戳必须 drop
  check('⭐⭐ 无 updatedAt 的条目被判为**不在范围内**（drop）',
    /if \(t === ''\) return false/.test(src))
  // ③ A 层必须独立于水位线（全库遍历）
  //    🔴 **判据必须落在【真的遍历变量】上**：我第一版检查的是那句注释
  //    （`A 层：应用（**全库…**）`），而**注释当然一直在** ⇒ 把循环改成
  //    `for (const c of inScope)` 它**照样绿** —— 那就是个摆设。
  //    ⚠️ 这是本项目"断言要落在契约真正生效的那一层"的又一次实例。
  const applySection = src.slice(src.indexOf('const applyIdx = aliasIndex(nextVocab)'))
  check('⭐⭐ A 层遍历的是**全库快照 `snapshot.covers`**（不是 `inScope`）',
    /for \(const c of snapshot\.covers\)/.test(applySection),
    '⚠️ A 层若只跑 inScope，词表的新决定就传播不到老条目 ⇒ 永久不一致')
  check('  ⭐ 反证：A 层那段里**不得**出现 `of inScope`',
    !/for \(const c of inScope\)/.test(applySection))
  // ④ 绝不传 sessionId
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('⭐⭐ 反证：代码（去注释后）**不出现 `sessionId`**（防递归）',
    !/sessionId/.test(noComments), '⚠️ 传了 sessionId 会被 llm/stream 判成会话步 ⇒ 自己触发自己')
  // ⑤ ctx.get('llm') 而非 ctx.llm
  check('⭐⭐ 用 `ctx.get(\'llm\')` 而不是 `ctx.llm`',
    /ctx\.get\('llm'\)/.test(src) && !/ctx\.llm\b/.test(noComments))
  // ⑥ 词表不能有"重建"路径（它是 source data）
  check('⭐⭐ 词表模块**没有** rebuild 式函数（source data 不能重建）',
    !/export (async )?function (rebuild|regenerate)Vocabulary/.test(vocabSrc))
  // ⑦ 安全阀在
  check('⭐⭐ 安全阀：合并后全空 ⇒ 回退原样',
    /to\.length === 0 \? \[\.\.\.c\.cover\.tags\] : to/.test(src))
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
