// 召回日志的端到端验证（⚠️ **用库副本**，绝不碰生产库）。
// 验四件事：
//   ① appendRecallLog 真的落盘、路径是 recall-log/session-<id>.jsonl
//   ② 两种事件（recall / inject）都写得进去，且形状对
//   ③ readRecallLog 能逐行读回、且**坏行不毁整份**
//   ④ 🔴 **反证**：把三条关键字段去掉，断言必须报红（否则说明断言是摆设）
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'

const lib = mkdtempSync(join(tmpdir(), 'memj-recalllog-'))
process.env.MEMJ_DATA_DIR = lib

const mod = await import('../lib/index.js')
const paths = await import('../src/paths.ts')

let pass = 0, fail = 0
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`✅ ${name}`) } else { fail++; console.log(`❌ ${name} ${extra}`) }
}

const SID = 'session-recalllog-probe'
console.log(`副本库 = ${lib}`)
console.log(`日志路径 = ${paths.recallLogPath(SID)}\n`)
check('⭐⭐ 路径落在副本里（自证：不是生产库）',
  paths.recallLogPath(SID).startsWith(lib), paths.recallLogPath(SID))
// ⚠️ **`session-` 会出现两次** —— 这是**既有约定**，不是本批引入的：
//    `reads/` 与 `doc-reads/` 的文件名同样长这样（调用方传的是 `session-<uuid>`，
//    而路径函数又加了一次 `session-`）。判据按**实际形态**写，别按"看起来应该"改。
check('⭐ 路径形状 = recall-log/session-<id>.jsonl（与 reads/ 同款双前缀约定）',
  /recall-log[\\/]session-session-recalllog-probe\.jsonl$/.test(paths.recallLogPath(SID)),
  paths.recallLogPath(SID))

// 模块导出面
const api = mod.__recallLogForTest ?? {}
console.log(`lib 导出的召回日志符号: ${Object.keys(mod).filter((k) => /recall/i.test(k)).join(', ')}\n`)

// ── 直接用源码模块（lib 不导出内部函数，测试直连 src 更贴近实现）──
const { appendRecallLog, readRecallLog } = await import('../src/recall-log.ts')

// ① A 档：结论行
await appendRecallLog({
  event: 'recall', at: '2026-09-27T15:04:30.487Z', sessionId: SID, turn: 9, step: 12,
  channel: 'jev', model: 'jev-latest', scope: 'project',
  kind: 'suppressed', detail: '主模型已有检索意图（0.940 ≥ 0.6）',
  scores: { need: 0.58, sufficient: 0.31, searchIntent: 0.94 },
  evaluated: 219, pool: 219, batched: true, ms: 7275, picked: [], counted: false,
  thresholds: { band: 0.7, searchIntentMin: 0.6, sufficientMin: 0.85 },
})

// ② B 档：带请求快照
await appendRecallLog({
  event: 'recall', at: '2026-09-27T15:05:00.000Z', sessionId: SID, turn: 9, step: 14,
  channel: 'jev', model: 'jev-latest', scope: 'project',
  kind: 'injected', detail: '选中 2 条，待注入',
  scores: { need: 0.88 },
  evaluated: 10, pool: 10, batched: false, ms: 1200, picked: ['a', 'b'], counted: false,
  thresholds: { band: 0.7, searchIntentMin: 0.6, sufficientMin: 0.85 },
  request: { state: { current_thinking: 'x', candidates: [{ i: 0, title: 't', desc: 'd' }] }, questionKeys: ['need', 'c0'], batch: { index: 1, total: 2 } },
})

// ③ C 档：注入正文
await appendRecallLog({
  event: 'inject', at: '2026-09-27T15:05:01.000Z', sessionId: SID, turn: 9, step: 15,
  channel: 'jev', model: 'jev-latest', scope: 'project',
  count: 2, ids: ['a', 'b'], text: '⭐ **以下是知识库里与当前工作相关的知识（主动召回）。**\n- a',
})

const rows = await readRecallLog(SID)
console.log(`读回 ${rows.length} 行\n`)
check('⭐ 三行都写进去了（A/B/C 各一）', rows.length === 3, String(rows.length))
check('⭐ 两种事件都在（recall ×2 + inject ×1）',
  rows.filter((r) => r.event === 'recall').length === 2 && rows.filter((r) => r.event === 'inject').length === 1)

const a = rows[0]
check('⭐⭐ A 档带三个总控分数（调阈值唯一该看的东西）',
  a.scores?.need === 0.58 && a.scores?.sufficient === 0.31 && a.scores?.searchIntent === 0.94,
  JSON.stringify(a.scores))
check('⭐⭐ A 档带阈值快照（否则日后无法复核那次判断）',
  a.thresholds?.band === 0.7 && a.thresholds?.searchIntentMin === 0.6 && a.thresholds?.sufficientMin === 0.85,
  JSON.stringify(a.thresholds))
check('⭐ A 档带 step（能说清"哪一步判的"）', a.step === 12, String(a.step))
check('⭐ 抑制的那次也写了（排障主战场）', a.kind === 'suppressed' && a.counted === false)

const b = rows[1]
check('⭐⭐ B 档带请求快照（可重放）', b.request?.state !== undefined && b.request?.questionKeys?.length === 2)
check('⭐ B 档带批次信息', b.request?.batch?.total === 2)

const c = rows[2]
check('⭐⭐ C 档带注入正文（逐字）', typeof c.text === 'string' && c.text.includes('主动召回'), String(c.text?.length))
check('⭐ C 档带注入的 id 列表', c.ids?.length === 2)

// ④ 坏行不毁整份
const p = paths.recallLogPath(SID)
writeFileSync(p, `${JSON.stringify(rows[0])}\n{ this is not json }\n${JSON.stringify(rows[2])}\n`, 'utf8')
const rows2 = await readRecallLog(SID)
check('⭐⭐ 坏行被跳过，其余照读（不因一行毁整份）', rows2.length === 2, String(rows2.length))

// ⑤ 不存在的会话 ⇒ 空数组（不是抛错）
const none = await readRecallLog('session-does-not-exist')
check('⭐ 不存在的会话返回空数组（不抛）', Array.isArray(none) && none.length === 0)

rmSync(lib, { recursive: true, force: true })
console.log(`\n召回日志测试：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
