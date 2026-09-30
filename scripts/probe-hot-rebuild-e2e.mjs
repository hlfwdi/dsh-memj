/**
 * ⭐⭐⭐ 端到端（组装级）：**重启后从会话日志重建窗口快照**。
 *
 * 🔴 **为什么不满足于单元测试**：本修复依赖 `deps.getService('sessionQuery')`
 *    —— 那是**组装期**注入的（`index.ts:311` 的 `getService: (n) => ctx.get(n)`）。
 *    ⚠️ 单元测试直接调 `fingerprintsFromInjectionEvents`（纯函数），
 *    **验不到"服务名对不对、通道走不走得通"**。
 *
 * ⭐ 本探针**模拟真实组装**：给 `handleApi` 传一个 `getService`，
 *    它对 `'sessionQuery'` 返回一个**真的会去读会话日志**的适配器
 *    （读法与 `SessionQuery` 同形：`observeSession(id, {projectionMode:'none'})`）。
 * ⇒ 于是整条链真的跑通了：`/hot` → `previewForSession` → `rebuildWindowFromSessionLog`
 *    → `sessionQuery.observeSession` → 解多帧 zstd → 解析事件 → 匹配指纹。
 *
 * 用法：node probe-hot-rebuild-e2e.mjs <session.v3.jsonl.zstd> <sessionId>
 */
import { readFileSync, readdirSync, statSync, cpSync, rmSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

const logFile = process.argv[2]
const sessionId = process.argv[3] ?? 'session-e2e-rebuild'
if (logFile === undefined) {
  console.error('用法：node probe-hot-rebuild-e2e.mjs <session.v3.jsonl.zstd> [sessionId]')
  process.exit(2)
}

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
function decodeEvents(f) {
  const buf = readFileSync(f)
  const offs = []
  let i = 0
  while (i >= 0) { i = buf.indexOf(MAGIC, i); if (i < 0) break; offs.push(i); i += 4 }
  const parts = []
  for (let k = 0; k < offs.length; k += 1) {
    const start = offs[k]
    const end = k + 1 < offs.length ? offs[k + 1] : buf.length
    try { parts.push(zstdDecompressSync(buf.subarray(start, end))) } catch { /* */ }
  }
  const out = []
  for (const l of Buffer.concat(parts).toString('utf8').split('\n')) {
    if (l.trim() === '') continue
    try { out.push(JSON.parse(l)) } catch { /* */ }
  }
  return out
}

/** ⚠️ 隔离库（**生产库副本**，绝不碰生产）。 */
const PROD = join(process.env['USERPROFILE'] ?? '', '.dsh-memj')
const COPY = join(process.cwd(), 'verify', 'memj-rebuild-e2e-lib')
if (existsSync(PROD)) {
  rmSync(COPY, { recursive: true, force: true })
  cpSync(PROD, COPY, { recursive: true })
}
const lib = mkdtempSync(join(tmpdir(), 'memj-rbe2e-'))
process.env['MEMJ_DATA_DIR'] = COPY

const LIBDIR = join(process.cwd(), 'lib')
const idx = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)
const apiMod = idx.handleApi !== undefined
  ? idx
  : await (async () => {
    for (const f of readdirSync(LIBDIR)) {
      if (f.startsWith('api-') && f.endsWith('.js')) {
        const m = await import(pathToFileURL(join(LIBDIR, f)).href)
        if (typeof m.handleApi === 'function') return m
      }
    }
    throw new Error('找不到 handleApi')
  })()

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) } else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

console.log('════════ 端到端：重启后从会话日志重建（组装级） ════════\n')

const events = decodeEvents(logFile)
console.log(`真实日志：${events.length} 个事件｜会话 id（探针用）：${sessionId}\n`)

/**
 * ⭐ **模拟真实的 `sessionQuery` 服务**（读法照 `detectProjectBySessionLog` 用的那两个方法）。
 *
 * ⚠️⚠️ **必须按 id 返回不同结果**（第一版对任何 id 都回同一份日志 ⇒
 * 反证"没有注入记录的会话"当场失败 —— **那是夹具有 bug，不是代码有 bug**；
 * ⭐ 真实实现就是按 id 去查那个会话的）。⇒ `events` 只对**已知那个 id** 返回。
 */
const KNOWN_ID = sessionId
let observeCalls = 0
const sessionQuery = {
  observeSession: async (id, opts) => {
    observeCalls += 1
    console.log(`  ⚙️ sessionQuery.observeSession('${id}', ${JSON.stringify(opts)}) 被调用`)
    // ⭐ 只有这个会话有日志 ⇒ 其他 id 回**空事件**（模拟"库里没有这个会话"）
    const ev = id === KNOWN_ID ? events : []
    return {
      events: ev,
      [Symbol.dispose]: () => { /* 真实实现要 dispose，这里给个空实现 */ },
    }
  },
  readSession: async (id) => ({ events: id === KNOWN_ID ? events : [] }),
}

const deps = {
  version: '0.1.0',
  config: { ...idx.DEFAULT_CONFIG, hotInject: true },
  baseUrl: COPY,
  pluginId: 'dsh-memj',
  // ⚠️ **关键**：这就是真实组装里那一行（`index.ts:311`）
  getService: (n) => (n === 'sessionQuery' ? sessionQuery : undefined),
}

async function api(path) {
  const url = new URL(`http://127.0.0.1/plugins/dsh-memj/api${path}`)
  const r = await apiMod.handleApi(deps, 'GET', url.pathname, '', url.searchParams)
  return { status: r.status, body: r.body }
}

// 先绑定这个会话到 dsh-memj（否则判不出项目 ⇒ 只有全局层，项目层那 10 条验不到）
{
  const url = new URL('http://127.0.0.1/plugins/dsh-memj/api/hot/bind')
  await apiMod.handleApi(deps, 'POST', url.pathname,
    JSON.stringify({ session: sessionId, project: 'dsh-memj' }), url.searchParams)
}

console.log('── 调 `GET /hot`（冷启动：内存快照为空）──')
const hot = await api(`/hot?session=${encodeURIComponent(sessionId)}`)
console.log('')

check('/hot 200', hot.status === 200, JSON.stringify(hot.body).slice(0, 140))
check('⭐ 服务端回了 `windowSource`（新代码）', 'windowSource' in hot.body)
check('⭐⭐ **走通了 sessionQuery 通道**（observeSession 真被调到）',
  observeCalls > 0, `调用次数 ${observeCalls}`)
check('⭐⭐ **`windowSource` = `log`**（内存没有 ⇒ 从会话日志重建 —— 这正是用户要的）',
  hot.body.windowSource === 'log', String(hot.body.windowSource))
check('⭐⭐ **`window` 非 null**（修复前这里是 null ⇒ 页面全显"未注入"）',
  hot.body.window !== null, JSON.stringify(hot.body.window))

const present = hot.body.window?.present ?? []
check('⭐⭐ `present` 非空（真的判出了"哪几条在窗口里"）', present.length > 0, `实得 ${present.length}`)
check('⭐ `present` 是**数组**（JSON 安全形状）', Array.isArray(present))

const items = hot.body.items ?? []
const hit = items.filter((it) => present.includes(it.fp))
check('⭐⭐ **页面判定路径命中**（`items[].fp ∈ present`）⇒ 会显示"已注入"',
  hit.length > 0, `命中 ${hit.length}/${items.length}`)
console.log(`\n  ⭐ 这几条会显示"已注入"（共 ${hit.length} 条）：`)
for (const it of hit.slice(0, 10)) console.log(`     [${it.type}] ${it.title}`)

const persona = items.find((it) => it.type === 'persona')
if (persona !== undefined) {
  check('⭐⭐ **画像也被判成"已注入"**（没 id，靠文本指纹）',
    present.includes(persona.fp), `fp=${JSON.stringify(persona.fp)}`)
}

// ⚠️ **反证：不存在的指纹不能命中**（否则等于"全都算注入过"）
check('⚠️（反证）不存在的指纹不在 `present` 里',
  !present.includes('ffffffff-ffff-4fff-8fff-ffffffffffff'))

// ⭐ **反证：拿一个日志里没有记录的会话** ⇒ 必须如实回 null（不编造）
console.log('\n── 反证：日志里没有注入记录的会话 ──')
const hot2 = await api('/hot?session=session-never-injected-xyz')
check('⚠️（反证）没有注入记录 ⇒ `windowSource: null` 且 `window: null`（**如实说判不出**）',
  hot2.body.windowSource === null && hot2.body.window === null,
  JSON.stringify({ src: hot2.body.windowSource, win: hot2.body.window }))

console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
try { rmSync(lib, { recursive: true, force: true }) } catch { /* */ }
if (fail > 0) process.exitCode = 1
