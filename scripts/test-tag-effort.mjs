/**
 * ⭐⭐⭐ 裁决模型的**思考等级**（决策 168）测试。
 *
 * ── 用户要求（原话）──────────────────────────────────────────────────────
 * > *"还是要把裁决模型的思考关到最低。或者设置面板加思考等级的设置。
 * >   哪怕选的是跟随主会话模型，也要把裁决模型的思考关掉。"*
 *
 * ── 🔴 本套件最要紧的三件事 ───────────────────────────────────────────────
 * ① **`off` 真的进了请求**（不是"配置读到了"——本项目同族教训：
 *    "算出的量 ≠ 发出的量"，判据要落在**真正发给服务的那份 options** 上）；
 * ② ⭐⭐ **"跟随主会话模型"时也照样传**（否则 `defaultRoute()` 会继承主会话的
 *    `high` 档 —— 实测 parent 的 requestHeader 就是 `hy3 + reasoningEffort:high`）；
 * ③ **空串 = 不传这个字段**（`hy3` 那种关不掉思考的模型，用户得能退回"不传"）。
 *
 * ⚠️ 必须在 `pnpm run build` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-tag-effort.mjs
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lib = mkdtempSync(join(tmpdir(), 'memj-effort-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const {
  runHandoff, normalizeTags, loadVocabulary, saveVocabulary, emptyVocabulary, seedVocabulary,
  DEFAULT_CONFIG,
} = mod

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

console.log(`库根: ${lib}\n`)

// ── 造夹具：有 tag 可裁决 ──
const E = (slug, title, tags) => ({
  slug, title, tags, desc: `${title}；当测试时读它。`, body: `### ${title}\n\n正文。`,
})
await runHandoff({
  project: 'p-eff',
  projectDesc: '思考等级测试；当测试时读它。',
  entries: [E('e1', '思考等级测试条目一', ['agent']), E('e2', '思考等级测试条目二', ['子代理'])],
}, { sessionId: 's-eff', config: { ...DEFAULT_CONFIG, themeCreation: 'loose' } })

/** 抓一次真实发出去的 options。 */
async function capture(opts) {
  const nowIso = new Date().toISOString()
  const v = emptyVocabulary(nowIso)
  seedVocabulary(v, ['agent', '子代理'])
  v.lastRunAt = '2026-01-01T00:00:00.000Z'   // ⚠️ 每次都要重置水位线（否则范围空、不调模型）
  await saveVocabulary(v)
  let seen = null
  const ctx = {
    get: (n) => {
      if (n === 'llm') {
        return {
          async *stream(o) {
            seen = o
            const a = '{"merge":{},"add":{},"drop":{},"retag":{}}'
            yield { type: 'block-start', index: 0, blockType: 'text' }
            yield { type: 'text-delta', index: 0, text: a }
            yield { type: 'block-end', index: 0, block: { type: 'text', text: a } }
          },
        }
      }
      // ⭐⭐ **必须有这个桩**：两个模型键都留空时，`resolveRoute` 会走
      //    `defaultRoute()` 读**主会话默认模型**。缺了它 ⇒ 整条路走不通
      //    ⇒ 【2】那组会以"拿不到模型路由"失败（**我第一版就是这样假失败的**）。
      //    ⚠️ 而且这里**故意带 `high`** —— 正是要验"即使主会话是高档位，
      //       裁决也必须用 off"（实测真实 parent 的 requestHeader 就是 hy3+high）。
      if (n === 'agentDefaultModel') {
        return { currentSelection: () => ({ provider: 'main-session-provider', model: 'main-session-model', reasoningEffort: 'high' }) }
      }
      return undefined
    },
  }
  const r = await normalizeTags(ctx, { ...DEFAULT_CONFIG, ...opts }, { includeBody: 'none' })
  return { seen, r }
}

// ══════════════════════════════════════════════════════════════
console.log('【1】⭐⭐⭐ `off` 真的进了请求（判据落在发出去的 options 上）')
// ══════════════════════════════════════════════════════════════
{
  const { seen, r } = await capture({ tagNormalizeProvider: 'stub', tagNormalizeModel: 'stub' })
  check('  前置：真的调了模型（否则下面全是假绿）', seen !== null && r.ok, r.message?.slice(0, 80))
  check('⭐⭐ 请求里带了 `reasoningEffort`', seen?.reasoningEffort !== undefined,
    JSON.stringify(Object.keys(seen ?? {})))
  check('⭐⭐⭐ **值就是 `off`**（用户要求"关到最低"）', seen?.reasoningEffort === 'off',
    String(seen?.reasoningEffort))
  check('  默认值就是 off', DEFAULT_CONFIG.tagNormalizeReasoningEffort === 'off')
}

// ══════════════════════════════════════════════════════════════
console.log('\n【2】⭐⭐⭐ **"跟随主会话模型"时也照样传**（本套件最要紧的一条）')
// ══════════════════════════════════════════════════════════════
{
  // ⚠️ 关键：**两个键都留空** ⇒ `resolveRoute` 走 `defaultRoute()`（主会话模型）
  const { seen, r } = await capture({ tagNormalizeProvider: '', tagNormalizeModel: '' })
  check('  前置：真的调了模型', seen !== null && r.ok, r.message?.slice(0, 80))
  check('⭐⭐⭐ 跟随主会话时，**仍然显式传了 `off`**（不继承主会话的高档位）',
    seen?.reasoningEffort === 'off',
    `实得 ${JSON.stringify(seen?.reasoningEffort)} —— 若不传，主会话的 high 会漏进来`)
}

// ══════════════════════════════════════════════════════════════
console.log('\n【3】⭐ 空串 = **不传这个字段**（关不掉思考的模型要能退回）')
// ══════════════════════════════════════════════════════════════
{
  const { seen, r } = await capture({
    tagNormalizeProvider: 'stub', tagNormalizeModel: 'stub',
    tagNormalizeReasoningEffort: '',
  })
  check('  前置：真的调了模型', seen !== null && r.ok, r.message?.slice(0, 80))
  check('⭐ 空串 ⇒ **字段整个不出现**（不是传 `""`）',
    seen !== null && !('reasoningEffort' in seen),
    JSON.stringify(Object.keys(seen ?? {})))
}

// ══════════════════════════════════════════════════════════════
console.log('\n【4】各档位原样透传（面板选什么就是什么）')
// ══════════════════════════════════════════════════════════════
{
  for (const eff of ['low', 'medium', 'high']) {
    const { seen } = await capture({
      tagNormalizeProvider: 'stub', tagNormalizeModel: 'stub',
      tagNormalizeReasoningEffort: eff,
    })
    check(`  「${eff}」原样透传`, seen?.reasoningEffort === eff, String(seen?.reasoningEffort))
  }
}

// ══════════════════════════════════════════════════════════════
console.log('\n【5】⭐ C 层（英文翻译）也必须带档位 —— 同一份 callModel')
// ══════════════════════════════════════════════════════════════
{
  // C 层走的是同一个 `callModel`，所以只要 A/B 层验过就成立；
  // 但这里**静态核一眼**：`callModel` 里不得出现"只在某层传"的分叉。
  const src = readFileSync(join(process.cwd(), 'src', 'tag-normalize.ts'), 'utf8')
  const callModelBody = src.slice(src.indexOf('async function callModel'), src.indexOf('/** 从模型输出里抠出第一个 JSON'))
  check('⭐ `callModel` 里只有**一处** `llm.stream`（所有层共用）',
    (callModelBody.match(/llm\.stream\(/g) ?? []).length === 1,
    String((callModelBody.match(/llm\.stream\(/g) ?? []).length))
  check('⭐ 且档位就在那一处里（不存在"某层漏传"的可能）',
    callModelBody.includes('reasoningEffort: effort') || callModelBody.includes('reasoningEffort'),
    'callModel 是三层共用入口 ⇒ 一处传即三层都有')
}

// ══════════════════════════════════════════════════════════════
console.log('\n【6】⭐ 面板与接口接线（漏一个就静默失效）')
// ══════════════════════════════════════════════════════════════
{
  const html = readFileSync(join(process.cwd(), 'src', 'web', 'index.html'), 'utf8')
  const js = readFileSync(join(process.cwd(), 'src', 'web', 'app.js'), 'utf8')
  const api = readFileSync(join(process.cwd(), 'src', 'api.ts'), 'utf8')
  const st = readFileSync(join(process.cwd(), 'src', 'settings.ts'), 'utf8')
  check('  HTML 有 `#tag-effort` 下拉', html.includes('id="tag-effort"'))
  check('  HTML 选项含 off（关闭）', /id="tag-effort"[\s\S]{0,400}value="off"/.test(html))
  check('  HTML 选项含空串（不传）', /id="tag-effort"[\s\S]{0,600}value=""/.test(html))
  check('  app.js **回填**（读到面板）', js.includes(`getElementById('tag-effort')`))
  check('  app.js **提交**该键', js.includes('tagNormalizeReasoningEffort:'))
  check('  api.ts GET 回读该键', api.includes('tagNormalizeReasoningEffort: r.config.tagNormalizeReasoningEffort'))
  check('  api.ts POST 校验该键（受控枚举）', api.includes(`['', 'off', 'low', 'medium', 'high'].includes`))
  check('  ⭐⭐ 该键进了"至少给一个"的条件（上一批漏过这个，返 400）',
    api.includes('!wantsTagEffort'))
  check('  settings.ts 白名单含该键', st.includes(`'tagNormalizeReasoningEffort'`))
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
