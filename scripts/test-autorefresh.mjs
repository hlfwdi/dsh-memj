/**
 * ⭐⭐⭐ **入库自动刷新**（2026-10-20，用户要求）。
 *
 * ── 用户原话 ─────────────────────────────────────────────────────────────
 * *"我希望当有 entry、或者项目、或者主题新入库的时候，面板的列表应该要自动刷新。"*
 * 用户裁定的边界（问过、已答）：
 *   · **只在页面可见时轮询**（Page Visibility）；
 *   · 刷新必须保住四样：选中项、滚动位置、搜索框与筛选、**正在编辑时不刷新**。
 *
 * ── 这个套件守什么 ───────────────────────────────────────────────────────
 * ① **指纹的正确性**（服务端的 `libraryFingerprint`）——它错了就"永远不刷新"或
 *    "每次都刷新"，两种都很难受，而且**两种都不报错**；
 * ② **三条用户边界真的接线了**（可见性 / 编辑中 / 滚动）；
 * ③ **反证**：把指纹函数改成"恒返回常量"⇒ 必须报红。
 *
 * 🔴🔴 **本套件记了一次真实的失败（值得留档）**：
 *   我第一版自己写了个 `captureListScroll()` 遍历 8 个列表 id 记 `scrollTop`、
 *   `load()` 之后写回 —— **看起来完全正确，实测却没保住**（1200 → 95）。
 *   查下来是三层原因叠在一起：
 *     · ① 项目里**早就有**一套滚动记忆（`saveScroll`/`restoreScroll`），两套抢同一个值；
 *     · ② 我凭命名规律猜了 4 个 DOM id，**四个全错**（`project-list` 实际叫 `pj-list`…）；
 *     · ③ 最要命的一层：**`scrollTop` 不是被 JS 改的，是浏览器在
 *          `replaceChildren()` 期间自己夹的**（我在 `scrollTop` 上装 setter 拦截器，
 *          跑真实自动刷新时**一条记录都没有**，但值确实变了）
 *          ⇒ 所以"在 `load()` 之后立刻写回"是**错的时机**，必须**等内容填满再写**。
 *   ⭐ 判据：**"我写了对的代码"与"它真的生效"是两件事** ——
 *      这次是靠"用 setter 拦截器查谁在改"才定位到第三层的。
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { mkdtemp, mkdir, writeFile, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1
    return
  }
  fail += 1
  console.log(`  ❌ ${name}${detail === '' ? '' : ` —— ${detail}`}`)
}

// ⚠️ **必须在 import 插件之前设 `MEMJ_DATA_DIR`**：`libraryRoot()` 在模块加载时
//    就会被 `requiredDirs()` 等消费，晚设会指到生产库。
const lib = await mkdtemp(join(tmpdir(), 'memj-autorefresh-'))
process.env['MEMJ_DATA_DIR'] = lib
for (const d of ['entries', 'projects', 'themes']) await mkdir(join(lib, d), { recursive: true })

const mod = await import(`file:///${join(here, '..', 'lib', 'index.js').replace(/\\/g, '/')}`)

// ══════════════════════════════════════════════════════════════════════════
// 0. 指纹：稳定性与"变了就变"
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【0】指纹：同样内容稳定，一变就变')

await writeFile(join(lib, 'entries', 'a.md'), 'hello', 'utf8')
const f0 = await mod.libraryFingerprint()
check('⭐⭐ 两次查询相同（否则每次轮询都会误判"变了"）',
  f0 === (await mod.libraryFingerprint()), f0)
check('⭐ 指纹非空', typeof f0 === 'string' && f0.length > 0, f0)

// ⭐⭐ **用户点名的三种入库，逐个验**
await writeFile(join(lib, 'entries', 'b.md'), 'world', 'utf8')
const fEntry = await mod.libraryFingerprint()
check('⭐⭐⭐ 新增 **entry** ⇒ 指纹必须变', fEntry !== f0, fEntry)

await writeFile(join(lib, 'projects', 'HANDOFF-x.md'), 'p', 'utf8')
const fProj = await mod.libraryFingerprint()
check('⭐⭐⭐ 新增 **项目** ⇒ 指纹必须变', fProj !== fEntry, fProj)

await writeFile(join(lib, 'themes', 'THEME-t.md'), 't', 'utf8')
const fTheme = await mod.libraryFingerprint()
check('⭐⭐⭐ 新增 **主题** ⇒ 指纹必须变', fTheme !== fProj, fTheme)

// 改内容（长度变）
await writeFile(join(lib, 'entries', 'a.md'), 'hello world!!!', 'utf8')
const fContent = await mod.libraryFingerprint()
check('⭐⭐ 改内容（长度变）⇒ 指纹必须变', fContent !== fTheme, fContent)

// ⭐ **同长度覆盖**也必须变（靠 mtime）——这条是"只有大小没变"的那类失败
await new Promise((r) => setTimeout(r, 20))
await writeFile(join(lib, 'entries', 'a.md'), 'hello world???', 'utf8')
check('⭐⭐ 同长度覆盖（只靠 mtime 才能发现）⇒ 指纹必须变',
  (await mod.libraryFingerprint()) !== fContent)

// 删除
await unlink(join(lib, 'entries', 'b.md'))
const fDel = await mod.libraryFingerprint()
check('⭐⭐ 删除 ⇒ 指纹必须变', fDel !== fContent)

// 非 .md 不该影响
const before = await mod.libraryFingerprint()
await writeFile(join(lib, 'entries', 'note.txt'), 'x', 'utf8')
check('⭐ 非 .md 文件不影响指纹（否则噪音太多）',
  (await mod.libraryFingerprint()) === before)

// 空库不抛
const lib2 = await mkdtemp(join(tmpdir(), 'memj-autorefresh2-'))
process.env['MEMJ_DATA_DIR'] = lib2
let emptyOk = true
try {
  const e = await mod.libraryFingerprint()
  emptyOk = typeof e === 'string' && e.length > 0
} catch {
  emptyOk = false
}
check('⭐ 空库/目录不存在 ⇒ 不抛，返回一个指纹', emptyOk)
process.env['MEMJ_DATA_DIR'] = lib

// ══════════════════════════════════════════════════════════════════════════
// 1. `/health` 真的把它带出去了
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【1】/health 带回 fingerprint')

const deps = { version: 'test', config: mod.DEFAULT_CONFIG, baseUrl: '', pluginId: 'memj' }
const h = await mod.handleApi(deps, 'GET', '/plugins/dsh-memj/api/health', '', new URLSearchParams())
check('⭐⭐ /health 有 fingerprint 字段', typeof h.body.fingerprint === 'string' && h.body.fingerprint !== '',
  String(h.body.fingerprint))
check('⭐⭐ 它等于 libraryFingerprint() 的值（同一份判据，不是第二条通路）',
  h.body.fingerprint === (await mod.libraryFingerprint()))

// ══════════════════════════════════════════════════════════════════════════
// 2. 前端：三条用户边界都要接线
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【2】前端：可见性 / 编辑中 / 滚动')

const appSrc = await readFile(join(here, '..', 'src', 'web', 'app.js'), 'utf8')

// ① 只在页面可见时轮询
check('⭐⭐⭐ 有 bindAutoRefresh', /function bindAutoRefresh\(\)/.test(appSrc))
check('⭐⭐⭐ 监听 visibilitychange（用户选的方案）',
  /addEventListener\('visibilitychange'/.test(appSrc))
check('⭐⭐ 不可见时停表（clearInterval）', /clearInterval\(autoRefreshTimer\)/.test(appSrc))
check('⭐⭐ 切回来立刻补一次（不等下一个周期）',
  /visibilityState === 'visible'[\s\S]{0,120}autoRefreshOnce\(true\)/.test(appSrc))

// ② 正在编辑时不刷新
check('⭐⭐⭐ 有 shouldSkipAutoRefresh', /function shouldSkipAutoRefresh\(\)/.test(appSrc))
check('⭐⭐⭐ 有打开的 dialog 时跳过（用户正在确认某事）',
  /querySelector\('dialog\[open\]'\) !== null\) return true/.test(appSrc))
check('⭐⭐⭐ 焦点在 input/textarea/select 时跳过',
  /tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'SELECT'/.test(appSrc))
check('⭐⭐ contenteditable 也跳过', /isContentEditable === true/.test(appSrc))

// ③ 滚动位置
check('⭐⭐⭐ 有 restoreScrollWhenFilled（等内容填满再写）',
  /function restoreScrollWhenFilled\(/.test(appSrc))
check('⭐⭐⭐ 判据是 scrollHeight 够长才写（不是"立刻写"）',
  /host\.scrollHeight - host\.clientHeight >= top/.test(appSrc))
check('⭐⭐ 有重试上限（不无限等）', /MAX_FRAMES/.test(appSrc))
// 🔴 反面：不许再出现"只写一次、不等内容"的老写法（那是我第一版的 bug）
check('⭐⭐⭐ 不再有"load() 之后立刻写回"的老写法',
  !/await load\(\)\s*\n\s*restore\(\)\s*\n\s*\/\/\s*⚠️\s*不弹 toast/.test(appSrc))

// ⭐ 复用既有滚动记忆（而不是另造一套）
check('⭐⭐⭐ captureListScroll 复用 saveScroll()（本项目铁律：实现只留一份）',
  /try \{\s*\n\s*saveScroll\(\)/.test(appSrc))

// ⭐ DOM id 必须真实存在（我第一版猜错了 4 个，全静默失效）
const htmlSrc = await readFile(join(here, '..', 'src', 'web', 'index.html'), 'utf8')
const idsMatch = appSrc.match(/const ids = \['kb-list',([\s\S]*?)\]/)
check('能从源码里抽出列表 id 清单', idsMatch !== null)
if (idsMatch !== null) {
  const ids = ['kb-list', ...idsMatch[1].split(',').map((s) => s.trim().replace(/['"\]]/g, '')).filter((s) => s !== '')]
  const missing = ids.filter((id) => !htmlSrc.includes(`id="${id}"`))
  check('⭐⭐⭐ 清单里每个 id 在 index.html 里都真实存在（不许凭命名规律猜）',
    missing.length === 0, `缺：${missing.join(', ')}`)
}

// ④ 首次不算"变了"（否则首屏刚 load 完又重拉一遍）
check('⭐⭐⭐ 第一次拿到指纹不算"变了"（记下它但不重拉）',
  /const isFirst = lastFingerprint === ''/.test(appSrc))
check('⭐⭐ 指纹没变 ⇒ 直接 return（不重拉 7 个列表）',
  /if \(fp === lastFingerprint\) return/.test(appSrc))

// ⑤ 失败静默（后台动作不该打扰用户）
check('⭐⭐ 自动刷新失败不弹 toast（用户没要求过它）',
  /} catch \{\s*\n\s*\/\/ 静默（理由见函数头）/.test(appSrc))
check('⭐ 但留 console 痕（"列表怎么变了"要能查）',
  /console\.info\('\[memj\] 库有变化，已自动刷新列表'/.test(appSrc))

// ⑥ 初始化放在文件末尾（本项目 TDZ 纪律）
const bindIdx = appSrc.lastIndexOf('bindAutoRefresh()')
const totalLen = appSrc.length
check('⭐⭐ bindAutoRefresh() 的调用在文件末尾附近（TDZ 纪律）',
  bindIdx > totalLen * 0.95, `${bindIdx} / ${totalLen}`)

// ══════════════════════════════════════════════════════════════════════════
// 3. 轮询间隔（不能太密：每次都要 scanLibrary）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【3】轮询间隔不能太密')

const m = appSrc.match(/const AUTO_REFRESH_MS = ([\d_]+)/)
check('能抽出 AUTO_REFRESH_MS', m !== null)
if (m !== null) {
  const ms = Number(m[1].replace(/_/g, ''))
  // ⚠️ 每次轮询服务端要 `scanLibrary`（实测 450–755ms）⇒ 间隔必须给够。
  check('⭐⭐⭐ 间隔 ≥ 5 秒（别把服务端问趴下）', ms >= 5000, `${ms}ms`)
  // ⚠️ 但也不能太长（用户会觉得"没自动刷新"）。
  check('⭐⭐ 间隔 ≤ 30 秒（否则人感觉不到"自动"）', ms <= 30000, `${ms}ms`)
}

await rm(lib, { recursive: true, force: true })
await rm(lib2, { recursive: true, force: true })

console.log(`\n═══ 入库自动刷新：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
