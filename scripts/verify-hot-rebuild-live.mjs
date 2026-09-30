/**
 * ⭐⭐⭐ 端到端验证：**重启后"已注入"不再变成"未注入"**（2026-09-23 用户报告的场景）。
 *
 * 🔴 **为什么要端到端**：本修复依赖两样真东西 ——
 *   ① 真实的 `ctx.get('sessionQuery')`（API 层的 `deps.getService` 必须真的能拿到它）；
 *   ② 真实的会话日志（多帧 zstd、真实的 `user/message` 事件形态）。
 *   单元测试与 `handleApi` 直调**都测不到 ①**（那是组装期的注入）。
 *
 * ⭐ 判据：拿一个**真实跑过注入的会话**，`GET /hot?session=<id>` 应当回
 *    `windowSource: 'log'` 且 `window.present` **非空** ——
 *    而修复前它会回 `window: null`（页面于是全显"未注入"）。
 *
 * ⚠️ **只读**（不改库、不发消息）。
 * 用法：node verify-hot-rebuild-live.mjs <port> <sessionId>
 */
const PORT = process.argv[2] ?? '3096'
const SESSION = process.argv[3] ?? ''
const BASE = `http://127.0.0.1:${PORT}/plugins/dsh-memj/api`

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) } else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

console.log('════════ 端到端：重启后仍能判出"已注入" ════════\n')

if (SESSION === '') {
  console.error('用法：node verify-hot-rebuild-live.mjs <port> <sessionId>')
  process.exit(2)
}

const r = await fetch(`${BASE}/hot?session=${encodeURIComponent(SESSION)}`)
const j = await r.json()

console.log(`会话：${SESSION}`)
console.log(`判定项目：${j.bound?.project ?? '(无)'}｜items：${(j.items ?? []).length} 条`)
console.log(`windowSource：${String(j.windowSource)}｜window：${j.window === null ? 'null' : '有'}`)
if (j.window !== null && j.window !== undefined) {
  console.log(`  present：${(j.window.present ?? []).length} 条｜at=${j.window.at}`)
}
console.log('')

check('接口 200 且 ok', r.status === 200 && j.ok === true)
check('⭐ 服务端已是新版本（回了 `windowSource`）', 'windowSource' in j)
check('⭐ `windowSource` 合法', [null, 'memory', 'log'].includes(j.windowSource), String(j.windowSource))

// ⭐⭐ **核心断言**：内存快照为空时，必须能从日志重建出来。
//    ⚠️ 但若这个会话**刚跑过一轮**（内存里有），`windowSource` 会是 `memory`
//    ⇒ 那也**算通过**（说明状态是对的），只是这次没验到"重建"那条路。
//    ⭐ 判据：**`window` 不能是 null** —— 那才是用户看到的"全部未注入"。
if (j.window === null) {
  check('⭐⭐ **不该是 null**（这就是用户报的 bug：重启后全显"未注入"）', false,
    `windowSource=${String(j.windowSource)}`)
} else {
  check('⭐⭐ **`window` 非 null ⇒ 页面能正确显示"已注入"**（用户报的 bug 已修）', true)
  check('⭐⭐ `present` 非空（真的判出了"哪几条在窗口里"）',
    Array.isArray(j.window.present) && j.window.present.length > 0,
    JSON.stringify(j.window.present?.length))
  // ⭐ 一致性：`present` 必须与 `expected` 有交集（否则是另一份口径，等于撒谎）
  const exp = j.preview?.expected ?? []
  const inter = (j.window.present ?? []).filter((x) => exp.includes(x))
  check('⭐⭐ `present` 与 `expected` **有交集**（两侧同一口径，没比错量）',
    inter.length > 0, `present=${j.window.present?.length} expected=${exp.length} 交集=${inter.length}`)
  // ⭐ 页面要用 `items[].fp` 去 `present` 里查 ⇒ 必须真能查到，否则还是全显"未注入"
  const items = j.items ?? []
  const hit = items.filter((it) => (j.window.present ?? []).includes(it.fp))
  check('⭐⭐ **页面的判定路径真的能命中**（items[].fp ∈ present）',
    hit.length > 0, `命中 ${hit.length}/${items.length}`)
  console.log(`\n  ⭐ 命中明细（这几条会显示"已注入"）：`)
  for (const it of hit.slice(0, 8)) console.log(`     [${it.type}] ${it.title}`)
  // ⭐ 画像也必须能被判出来（它没 id，靠指纹）
  const persona = items.find((it) => it.type === 'persona')
  if (persona !== undefined) {
    check('⭐⭐ **画像也能被判成"已注入"**（它没有封面 id，靠文本指纹）',
      (j.window.present ?? []).includes(persona.fp),
      `fp=${JSON.stringify(persona.fp)}`)
  }
}

check('⭐ `windowSource` 与 `window` 一致',
  (j.windowSource === null) === (j.window === null),
  JSON.stringify({ src: j.windowSource, win: j.window }))

console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
if (fail > 0) process.exitCode = 1
