/**
 * 标签规范化工具的**端到端**测试（决策 162）——用**打桩的 LLM**，不真调模型。
 *
 * ⚠️ 为什么必须有这一层：上面的 `test-tag-normalize.mjs` 测的是**纯函数**
 * （词表读写、合并解析、冲突检测）。而"三层怎么串起来"是**另一回事**：
 *   · 水位线选范围对不对；
 *   · **A 层有没有把 B 层的新决定传播到【水位线之外的老条目】**
 *     （🔴 这是本设计最关键、也最容易漏的一条）；
 *   · 写入有没有**真的不碰 `updatedAt`**;
 *   · C 层有没有给 canonical 补上英文。
 *
 * 🔴 **打桩的关键**：`ctx.get('llm')` 必须返回一个带 `stream()` 的对象
 *   （⚠️ **不是** `ctx.llm` —— 声明合并让它能过类型检查、运行时却是 undefined）。
 *   桩还会**断言 `sessionId` 没被传**（传了会触发 llm/stream 监听 ⇒ 自己触发自己）。
 *
 * 用法：node scripts/test-tag-normalize-e2e.mjs
 */
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-tag-e2e-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const {
  runHandoff, scanLibrary, loadVocabulary, saveVocabulary, emptyVocabulary,
  seedVocabulary, normalizeTags, DEFAULT_CONFIG,
} = mod

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

console.log(`库根: ${lib}\n`)

// ══════════════════════════════════════════════════════════════════════════
// 打桩的 LLM：按调用顺序返回预设答案；并记录每次调用的 options
// ══════════════════════════════════════════════════════════════════════════
const calls = []
function makeCtx(answers) {
  let i = 0
  return {
    calls,
    get(name) {
      if (name !== 'llm') return undefined
      return {
        async *stream(options) {
          calls.push(options)
          const text = answers[Math.min(i, answers.length - 1)] ?? '{}'
          i += 1
          // 一个最小的"文本块"流：assembler 能吃 block-end 携带的完整块。
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'text-delta', index: 0, text }
          yield { type: 'block-end', index: 0, block: { type: 'text', text } }
        },
      }
    },
  }
}

const CFG = {
  ...DEFAULT_CONFIG,
  themeCreation: 'loose',
  tagNormalizeProvider: 'stub',
  tagNormalizeModel: 'stub-model',
  translateProvider: 'stub',
  translateModel: 'stub-model',
}

const E = (slug, title, tags, extra = {}) => ({
  slug, title, tags,
  desc: `${title}；当测试时读它。`,
  body: `### ${title}\n\n这是关于 ${title} 的正文，用来验证 tag 是否合适。`,
  ...extra,
})

// ── 造数据：先写两条知识（tag 故意脏）────────────────────────────────────
await runHandoff({
  project: 'p-tag',
  projectDesc: '标签端到端测试项目；当测试时读它。',
  doc: '## 目标\n\n测试。',
  entries: [
    E('old-one', '老条目一', ['dsh', '缓存']),
    E('old-two', '老条目二', ['dsh', '静默失效']),
  ],
}, { sessionId: 's1', config: CFG })

const snap0 = await scanLibrary()
const old1 = snap0.covers.find((c) => c.cover.title === '老条目一').cover
const old2 = snap0.covers.find((c) => c.cover.title === '老条目二').cover
console.log(`造了两条：${old1.id.slice(0, 8)} / ${old2.id.slice(0, 8)}`)
console.log(`  updatedAt = ${old1.updatedAt}\n`)

// ══════════════════════════════════════════════════════════════
console.log('【1】首次运行：水位线 = 现在 ⇒ 范围为空、不花钱')
// ══════════════════════════════════════════════════════════════
{
  calls.length = 0
  const ctx = makeCtx([])
  const r = await normalizeTags(ctx, CFG, {})
  check('  首次运行 ok', r.ok, r.message)
  check('⭐⭐ **范围为空**（没把老条目全喂一遍）', r.scanned === 0, `scanned=${r.scanned}`)
  check('⭐⭐ **零 LLM 调用**（不花钱）', calls.length === 0, `实际调了 ${calls.length} 次`)
  check('  新建了词表文件', existsSync(join(lib, 'tags', 'vocabulary.json')))
  const v = await loadVocabulary()
  check('  ⭐ 词表已落盘', v !== undefined)
  check('  ⭐ 水位线 = 一个近期时间', (v?.lastRunAt ?? '') > '2026-09-27', String(v?.lastRunAt))
  check('  ⚠️ 词表里**没有**自动登记库里的老 tag（首次运行不播种）',
    Object.keys(v?.canonical ?? {}).length === 0, JSON.stringify(Object.keys(v?.canonical ?? {})))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【2】⭐⭐ A 层必须把词表决定传播到【水位线之外】的老条目')
// ══════════════════════════════════════════════════════════════
{
  // 手工往词表加一条：`dsh` 是 `DSH` 的同义词、`静默失效` 是 `静默失败` 的同义词。
  // ⚠️ 这两条老条目的 updatedAt **早于**水位线 ⇒ B 层不会碰它们。
  const v = await loadVocabulary()
  v.canonical['DSH'] = { aliases: ['dsh'], en: '' }
  v.canonical['静默失败'] = { aliases: ['静默失效'], en: '' }
  v.canonical['缓存'] = { aliases: [], en: '' }
  await saveVocabulary(v)

  calls.length = 0
  const ctx = makeCtx(['{}'])
  const r = await normalizeTags(ctx, CFG, {})
  check('⭐⭐ **A 层改了老条目**（尽管它们不在水位线之内）',
    r.affected.length === 2, `实际改了 ${r.affected.length} 条：${JSON.stringify(r.affected.map((a) => a.id.slice(0, 8)))}`)
  // ⚠️ 判据要落在 **B 层**上：C 层（英文）**允许**被调用（那几条 canonical 还没英文）。
  //    我第一版断言"零 LLM 调用"，把 C 层算进去了 ⇒ **假失败**。
  //    🔴 教训：断言要说清"哪一层的调用"，否则会把正常行为判成 bug。
  const bLayerCalls = calls.filter((c) => String(c.system ?? '').includes('curate a knowledge base tag vocabulary'))
  check('⭐⭐ **B 层没被触发**（范围内的 tag 都已在词表里）⇒ 0 次裁决调用',
    bLayerCalls.length === 0, `B 层调了 ${bLayerCalls.length} 次（总调用 ${calls.length} 次）`)

  const after = await scanLibrary()
  const a1 = after.covers.find((c) => c.cover.id === old1.id).cover
  const a2 = after.covers.find((c) => c.cover.id === old2.id).cover
  check('⭐⭐ `dsh` → `DSH`（老条目一）', a1.tags.includes('DSH') && !a1.tags.includes('dsh'), JSON.stringify(a1.tags))
  check('⭐⭐ `静默失效` → `静默失败`（老条目二）',
    a2.tags.includes('静默失败') && !a2.tags.includes('静默失效'), JSON.stringify(a2.tags))
  check('  不该动的 `缓存` 保留', a1.tags.includes('缓存'), JSON.stringify(a1.tags))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【3】⭐⭐⭐ 写入【不碰 updatedAt】（否则时间维度被抹平）')
// ══════════════════════════════════════════════════════════════
{
  const after = await scanLibrary()
  const a1 = after.covers.find((c) => c.cover.id === old1.id).cover
  const a2 = after.covers.find((c) => c.cover.id === old2.id).cover
  check('⭐⭐ 老条目一的 updatedAt **一个字符都没变**',
    a1.updatedAt === old1.updatedAt, `前 ${old1.updatedAt} → 后 ${a1.updatedAt}`)
  check('⭐⭐ 老条目二的 updatedAt 同理', a2.updatedAt === old2.updatedAt,
    `前 ${old2.updatedAt} → 后 ${a2.updatedAt}`)
  check('  条目正文 frontmatter 也同步了（两处都写）', (() => {
    const abs = join(lib, 'entries', `old-one-${old1.id.slice(0, 8)}.md`)
    if (!existsSync(abs)) return false
    return readFileSync(abs, 'utf8').includes('DSH')
  })())
}

// ══════════════════════════════════════════════════════════════
console.log('\n【4】⭐⭐ B 层裁决：新 tag 触发 LLM，且结论落到词表')
// ══════════════════════════════════════════════════════════════
{
  // 写一条**新**知识，带一个词表里没有的 tag（`静默故障`）。
  // ⚠️ 它的 updatedAt **晚于**水位线 ⇒ 会进 B 层范围。
  await runHandoff({
    project: 'p-tag',
    projectDesc: '标签端到端测试项目；当测试时读它。',
    entries: [E('new-one', '新条目', ['静默故障', 'DSH'])],
  }, { sessionId: 's2', config: CFG })

  calls.length = 0
  // 桩：先回裁决结果（合并 静默故障 → 静默失败），再回英文翻译结果。
  // ⚠️ **新形状**：每条决定都要 `{ to, why }`（缺 why 会被硬校验丢掉）。
  const ctx = makeCtx([
    JSON.stringify({ merge: { 静默故障: { to: '静默失败', why: '静默故障与静默失败是同义，指同一类问题' } }, add: {}, drop: {}, retag: {} }),
    JSON.stringify({ DSH: 'DSH', 静默失败: 'silent failure', 缓存: 'cache' }),
  ])
  const r = await normalizeTags(ctx, CFG, { includeBody: 'truncated' })

  check('  运行成功', r.ok, r.message)
  check('⭐⭐ 检出了新 tag', r.pending.length >= 1, JSON.stringify(r.pending.map((p) => p.tag)))
  check('⭐⭐ 调了 LLM（B 层裁决）', calls.length >= 1, `调了 ${calls.length} 次`)
  check('  ⭐ 合并结论成立', r.decided.merged['静默故障'] === '静默失败', JSON.stringify(r.decided.merged))

  const v = await loadVocabulary()
  check('⭐⭐ 词表里 `静默故障` 变成 `静默失败` 的 alias',
    (v?.canonical['静默失败']?.aliases ?? []).includes('静默故障'),
    JSON.stringify(v?.canonical['静默失败']))
  check('  ⭐ 该条目的 tag 已改成规范词', r.affected.some((a) => a.id.length > 0))

  const after = await scanLibrary()
  const n1 = after.covers.find((c) => c.cover.title === '新条目').cover
  check('⭐⭐ `静默故障` 已被换成 `静默失败`',
    n1.tags.includes('静默失败') && !n1.tags.includes('静默故障'), JSON.stringify(n1.tags))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【5】⭐⭐ 防递归：绝不把 sessionId 传给模型')
// ══════════════════════════════════════════════════════════════
{
  check('⭐⭐ 所有调用都没带 `sessionId`',
    calls.every((c) => !('sessionId' in c)), JSON.stringify(calls.map((c) => Object.keys(c))))
  check('  ⭐ 也没带 `purpose`（受控两值，填哪个都是冒用语义）',
    calls.every((c) => !('purpose' in c)))
  check('  用的是配置里的裁决模型', calls[0]?.provider === 'stub' && calls[0]?.model === 'stub-model',
    JSON.stringify({ p: calls[0]?.provider, m: calls[0]?.model }))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【6】⭐ 幂等 + 水位线推进（第二次跑不该重复干活）')
// ══════════════════════════════════════════════════════════════
{
  const v1 = await loadVocabulary()
  calls.length = 0
  const ctx = makeCtx(['{}'])
  const r = await normalizeTags(ctx, CFG, {})
  check('⭐⭐ 第二次运行：词表已覆盖 ⇒ **不再裁决**', r.pending.length === 0,
    JSON.stringify(r.pending.map((p) => p.tag)))
  check('⭐⭐ 零 LLM 调用（B 层范围空、C 层已翻过）', calls.length === 0, `调了 ${calls.length} 次`)
  check('  条目改动为 0（都已规范）', r.affected.length === 0,
    JSON.stringify(r.affected.map((a) => a.id.slice(0, 8))))
  const v2 = await loadVocabulary()
  check('  水位线被推进', (v2?.lastRunAt ?? '') >= (v1?.lastRunAt ?? ''))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【7】⭐ preview 只看不改')
// ══════════════════════════════════════════════════════════════
{
  // 造一条带新 tag 的
  await runHandoff({
    project: 'p-tag',
    projectDesc: '标签端到端测试项目；当测试时读它。',
    entries: [E('pv-one', '预览条目', ['未知新词', 'DSH'])],
  }, { sessionId: 's3', config: CFG })

  const before = await loadVocabulary()
  calls.length = 0
  const ctx = makeCtx([JSON.stringify({ merge: {}, add: ['未知新词'], drop: [] })])
  const r = await normalizeTags(ctx, CFG, { preview: true })
  check('  previewOnly 标记为 true', r.previewOnly === true)
  check('⭐⭐ 回执明说"预览（未写入）"', r.message.includes('预览'), r.message.slice(0, 60))
  const after = await loadVocabulary()
  check('⭐⭐ 词表**没被改**（水位线也没推）',
    before?.lastRunAt === after?.lastRunAt && JSON.stringify(before?.canonical) === JSON.stringify(after?.canonical))
  const snap = await scanLibrary()
  const pv = snap.covers.find((c) => c.cover.title === '预览条目').cover
  check('⭐⭐ 数据里仍保留原 tag `未知新词`', pv.tags.includes('未知新词'), JSON.stringify(pv.tags))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【8】⭐ full 模式：无视水位线')
// ══════════════════════════════════════════════════════════════
{
  calls.length = 0
  const ctx = makeCtx(['{}'])
  const r = await normalizeTags(ctx, CFG, { full: true })
  const total = (await scanLibrary({ includeArchived: true })).covers.length
  check('⭐⭐ full 模式扫全部封面', r.scanned === total, `scanned=${r.scanned} 总数=${total}`)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【9】⭐⭐⭐ 反证（上批缺的那条）：播种后 LLM 仍必须被调用')
// ══════════════════════════════════════════════════════════════
// 🔴 这是**上批漏掉的那条断言**，而漏掉它的代价是：**整个工具在空转**
//    （实测：253 条参与裁决、0 个候选、**LLM 调用 0 次**）。
//    ⚠️ 当时全部测试都是绿的 —— 因为没有任何一条断言在问
//      "**LLM 到底有没有被叫到**"。测试只验了"结果长什么样"，
//      而空转的结果（"没有需要改的"）**看起来完全正常**。
//    ⇒ ⭐ 教训：验证一个"委托给 LLM 的工具"时，**"调了没调"本身必须是一条断言**。
{
  // ⚠️ 这个库是**空新建**的（不是播种过的生产库）⇒ 词表里只有前面测试累积的那几个词。
  //    所以这里**先确认前提**：把 `DSH`/`测试` 登记进词表（模拟"已播种"的状态）。
  //    🔴 前提不成立的话，这条测试就测不到它要测的东西（会假绿）。
  const v0 = (await loadVocabulary()) ?? emptyVocabulary(new Date().toISOString())
  seedVocabulary(v0, ['DSH', '测试', '静默失败', '缓存', '前端', '排障', '验证'])
  await saveVocabulary(v0)

  await runHandoff({
    project: 'p-tag',
    projectDesc: '标签端到端测试项目；当测试时读它。',
    entries: [E('seed-check', '播种后仍要裁决', ['DSH', '测试'])],
  }, { sessionId: 's9', config: CFG })

  const v = await loadVocabulary()
  check('  ⭐ 前提：「DSH」「测试」都**已在词表里**',
    v?.canonical['DSH'] !== undefined && v?.canonical['测试'] !== undefined,
    JSON.stringify({ DSH: v?.canonical['DSH'] !== undefined, 测试: v?.canonical['测试'] !== undefined }))

  calls.length = 0
  const ctx = makeCtx([JSON.stringify({ merge: {}, add: {}, drop: {}, retag: {} })])
  const r = await normalizeTags(ctx, CFG, { includeBody: 'none' })

  const bLayer = calls.filter((c) => String(c.system ?? '').includes('curate the TAG VOCABULARY'))
  check('⭐⭐⭐ **B 层真的被调用了**（这正是上批漏掉的断言）',
    bLayer.length === 1, `B 层调用 ${bLayer.length} 次`)
  check('⭐⭐ 候选里**包含已在词表里的词**（词表不是过滤器）',
    r.pending.some((p) => p.inVocabulary === true),
    JSON.stringify(r.pending.slice(0, 5).map((p) => ({ t: p.tag, inVocab: p.inVocabulary }))))
  check('⭐⭐ 回执**明说**有多少个已在词表里',
    r.message.includes('已在词表里'), r.message.split('\n').find((l) => l.includes('候选 tag')) ?? '')
  // 反证：若把候选过滤回"词表里没有的"，这条会红（因为库里没有新词 ⇒ 候选为空 ⇒ 不调用）
  check('  ⭐ 反证：候选数 > 0（若按词表过滤，这里会是 0 ⇒ 工具空转）',
    r.pending.length > 0, String(r.pending.length))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【10】⭐⭐ 硬校验：改/删/新增**没有理由**一律丢弃')
// ══════════════════════════════════════════════════════════════
{
  await runHandoff({
    project: 'p-tag',
    projectDesc: '标签端到端测试项目；当测试时读它。',
    entries: [E('why-check', '理由校验', ['缓存', '前缀缓存'])],
  }, { sessionId: 's10', config: CFG })

  // 桩：故意给出**缺理由 / 理由太短 / 已在词表里还 add / 不在候选里** 的四种坏输出
  const bad = JSON.stringify({
    merge: {
      // ⚠️ `缓存` 是候选（在条目里）⇒ 会走到"缺理由"这一关；理由太短 ⇒ 拒
      缓存: { to: '前缀缓存', why: 'same' },
      不存在的词: { to: '缓存', why: '这是一个足够长的理由说明为什么' }, // ❌ 不在候选里
    },
    add: {
      缓存: { why: '这个理由足够长足够长足够长足够长' },   // ❌ 已在词表里，应走复用
    },
    drop: {
      前缀缓存: { },                                    // ❌ 缺 why
    },
    retag: {
      'no-such-id': { tags: ['x'], why: '这是一个足够长的理由说明为什么' }, // ❌ 不在范围内
    },
  })
  calls.length = 0
  const ctx = makeCtx([bad])
  const r = await normalizeTags(ctx, CFG, { includeBody: 'none' })

  // ⚠️ 判据要**按类别**核，不能只数总数 —— 我第一版断言"恰好 4 条"，
  //    而实际是 5 条（`缓存` 在 merge 与 add 里各触发一次）。
  //    🔴 "数总数"这种断言很脆：新增一条校验就会红，而红的原因与本案无关。
  check('⭐⭐ 缺理由的 merge 被拒', r.rejected.some((x) => x.includes('merge `缓存`') && x.includes('缺理由')),
    JSON.stringify(r.rejected))
  check('⭐⭐ 不在候选里的键被拒', r.rejected.some((x) => x.includes('不存在的词')))
  check('⭐⭐ 已在词表里还 add ⇒ 被拒', r.rejected.some((x) => x.includes('已在词表里')))
  check('⭐⭐ 缺 why 的 drop 被拒', r.rejected.some((x) => x.includes('drop `前缀缓存`')))
  check('⭐⭐ 不在范围内的 retag id 被拒', r.rejected.some((x) => x.includes('no-such-')))
  check('  → 至少 5 条被丢弃', r.rejected.length >= 5, `实得 ${r.rejected.length}`)
  check('  合并 0 条（理由太短被拒）', Object.keys(r.decided.merged).length === 0,
    JSON.stringify(r.decided.merged))
  check('  新增 0 条（已在词表里被拒）', Object.keys(r.decided.added).length === 0,
    JSON.stringify(r.decided.added))
  check('  丢弃 0 条（缺理由被拒）', Object.keys(r.decided.dropped).length === 0)
  check('⭐⭐ 回执**如实报**被丢弃的条数',
    r.message.includes('被硬校验丢弃'), r.message.split('\n').find((l) => l.includes('硬校验')) ?? '')
}

// ══════════════════════════════════════════════════════════════
console.log('\n【11】⭐⭐ 合法决定：带理由的合并被接受，且理由进回执')
// ══════════════════════════════════════════════════════════════
{
  // ⚠️ `add` 的键**必须是本轮候选**（在范围内条目的 tag 里）——
  //    所以要造一条**带着那个新 tag** 的知识，否则它不在候选里、会被拒。
  //    🔴 我第一版直接 `add` 了一个库里不存在的词 ⇒ 被"不在候选里"拒掉 ⇒ **假失败**。
  await runHandoff({
    project: 'p-tag',
    projectDesc: '标签端到端测试项目；当测试时读它。',
    entries: [E('good-merge', '合法合并', ['前缀缓存', '缓存', '分布式锁超时'])],
  }, { sessionId: 's11', config: CFG })

  const good = JSON.stringify({
    merge: { 前缀缓存: { to: '缓存', why: '前缀缓存是缓存的一种具体形态，作为话题入口太窄' } },
    add: { 分布式锁超时: { why: '正文讲的是词表里完全没有覆盖过的分布式锁超时策略这件事' } },
    drop: {},
    retag: {},
  })
  calls.length = 0
  const ctx = makeCtx([good, '{}'])
  const r = await normalizeTags(ctx, CFG, { preview: true, includeBody: 'none' })

  check('⭐⭐ 合法的合并被接受', r.decided.merged['前缀缓存'] === '缓存', JSON.stringify(r.decided.merged))
  check('⭐⭐ **理由被保留**', (r.decided.mergeWhy['前缀缓存'] ?? '').length > 10,
    JSON.stringify(r.decided.mergeWhy))
  check('⭐⭐ 合法的新增被接受', r.decided.added['分布式锁超时'] !== undefined, JSON.stringify(r.decided.added))
  check('⭐⭐ **回执里把理由报出来了**', r.message.includes('前缀缓存是缓存的一种具体形态'),
    r.message.split('\n').filter((l) => l.includes('合并')).join(' | ').slice(0, 200))
  check('  没有任何被丢弃的', r.rejected.length === 0, JSON.stringify(r.rejected))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【12】⭐⭐ retag：按正文修条目的 tag（唯一允许增删的通道）')
// ══════════════════════════════════════════════════════════════
{
  await runHandoff({
    project: 'p-tag',
    projectDesc: '标签端到端测试项目；当测试时读它。',
    entries: [E('retag-me', '该补 CSS 标签的条目', ['前端'])],
  }, { sessionId: 's12', config: CFG })
  const target = (await scanLibrary()).covers.find((c) => c.cover.title === '该补 CSS 标签的条目').cover

  calls.length = 0
  const ctx = makeCtx([JSON.stringify({
    merge: {}, add: {}, drop: {},
    retag: { [target.id]: { tags: ['前端', 'CSS'], why: '正文讨论的是 CSS 优先级计算，当前缺 CSS 标签' } },
  })])
  const r = await normalizeTags(ctx, CFG, { preview: true, includeBody: 'truncated' })

  check('⭐⭐ retag 被接受', r.retagged.length === 1, JSON.stringify(r.retagged))
  check('⭐⭐ 新 tag 列表正确（补上了 CSS）',
    JSON.stringify(r.retagged[0]?.to) === JSON.stringify(['前端', 'CSS']),
    JSON.stringify(r.retagged[0]?.to))
  check('  回执里带理由', r.message.includes('CSS 优先级计算'), r.message.slice(0, 200))
  check('⭐ 该条目出现在 affected 里', r.affected.some((a) => a.id === target.id),
    JSON.stringify(r.affected.map((a) => a.id.slice(0, 8))))
  check('  preview 下**没写库**', (() => {
    const c = scanLibrary()
    return true // 下面用 await 版本核对
  })())
}
{
  const after = await scanLibrary()
  const t2 = after.covers.find((c) => c.cover.title === '该补 CSS 标签的条目').cover
  check('⭐⭐ preview 下数据**未变**（仍是 [前端]）',
    JSON.stringify(t2.tags) === JSON.stringify(['前端']), JSON.stringify(t2.tags))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【13】⭐ retag 改成空列表 ⇒ 安全阀拒绝')
// ══════════════════════════════════════════════════════════════
{
  const target = (await scanLibrary()).covers.find((c) => c.cover.title === '该补 CSS 标签的条目').cover
  calls.length = 0
  const ctx = makeCtx([JSON.stringify({
    merge: {}, add: {}, drop: {},
    retag: { [target.id]: { tags: [], why: '这是一个足够长的理由说明为什么要清空' } },
  })])
  const r = await normalizeTags(ctx, CFG, { preview: true, includeBody: 'none' })
  check('⭐⭐ 空列表被拒绝（否则违反"tags 至少 1 个"）', r.retagged.length === 0, JSON.stringify(r.retagged))
  check('  且如实报出被丢弃', r.rejected.some((x) => x.includes('空列表')), JSON.stringify(r.rejected))
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
