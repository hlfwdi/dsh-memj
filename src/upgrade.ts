/**
 * ⭐⭐⭐ **面板内升级**（2026-10-20，用户要求）。
 *
 * 用户原话：*"我希望在面板上加升级方案，应该参考 bili-scroll 本地我的分支版本的
 *             面板内升级方案…… 提示入口可以放在头部记忆库基础信息的右边。"*
 *
 * ── 参考实现 ─────────────────────────────────────────────────────────────
 * 照着 `@jojoman2024/dsh-bili-scroll@0.1.9`（本地分支版）的做法抄，
 * 那是本项目验证过的一版真实实现，抄它的**判据**而不是抄代码：
 *   · **检查**比的是 **npm 上的版本号**（不是 GitHub commit —— 后者要求本地已推）；
 *   · **先镜像后官方**（国内实测 55ms vs 1860ms，差 30 倍）；
 *   · **`/latest` 这个缓存键会落后** ⇒ 只在"看起来没新版"时才补查全量 metadata；
 *   · **本地比 npm 新**要如实说"你比它新"（改过没发版），不能谎报有新版本；
 *   · **缓存 10 分钟**，且 key 要带上本地版本号（改了版本号就失效）；
 *   · 升级一律 `--registry=<url>` **等号形式**（空格形式在桌面版会被拒）。
 *
 * ── 本文件与 bili-scroll 的一处【刻意不同】──────────────────────────────
 * bili-scroll 的升级要处理"桌面版换 CLI 入口"那套（`dsh-desktop-host/lib/cli.js`）。
 * memj 这里**先只做 Web 端**：调 `dsh plugin --profile <名> add <包>@<版本>`。
 * 桌面版那条路留了钩子（见 `buildUpgradeArgs`），但**没有实现** ——
 * 因为它的入口探测依赖 `process.resourcesPath`，在 Web 端恒为空，
 * 写了也验证不了。⚠️ 与其写一段没跑过的代码，不如如实留给下一个人。
 *
 * @module dsh-memj/upgrade
 */

import { execFile } from 'node:child_process'
import { appendFileSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pluginRoot } from './paths.ts'

/** 本插件的 npm 包名（检查与升级必须指向同一处）。 */
export const PKG_NAME = 'dsh-memj'

/** GitHub 仓库（只用于在回执里给一个"去看更新说明"的链接）。 */
export const GH_REPO = 'jojoman2024/dsh-memj'

/**
 * 镜像与官方源。
 *
 * ⭐ **可被环境变量覆盖**（照 bili-scroll 的做法，理由也一样）：
 * 「检查更新 → 点升级」这条链路**只能靠真发版本来测** —— 版本号写死在 npm 上。
 * 有了这两个变量，就能起一个本地假 registry 把整条链路跑通，不用发版。
 * ⚠️ **生产不设** ⇒ 行为与常量默认值完全一样。
 */
function envBase(name: string, fallback: string): string {
  const v = String(process.env[name] ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/\S+$/i.test(v) ? v : fallback
}

/** 镜像源（国内快 30 倍，先试它）。 */
export function registryMirror(): string {
  return envBase('MEMJ_NPM_REGISTRY', 'https://registry.npmmirror.com')
}

/** 官方源（镜像不通时兜底）。 */
export function registryOfficial(): string {
  return envBase('MEMJ_NPM_REGISTRY_2', 'https://registry.npmjs.org')
}

/**
 * 读**当前安装的**版本号。
 *
 * 🔴 **必须读磁盘上的那个 `package.json`，不能用构建期注入的版本** ——
 *    两者在升级后会分叉：注入值是"这次构建时的版本"，而升级换的是磁盘文件，
 *    进程还持有旧的内存值。用户点完升级、刷新前，界面上的版本号要是**新的**。
 *    ⭐ 这也是 bili-scroll 那条「升级别信退出码，装完要再读一次磁盘」的同一条判据。
 * @returns 版本号；读不到返回空串。
 */
export function installedVersion(): string {
  try {
    const pj = join(pluginRoot(), 'package.json')
    const v = JSON.parse(readFileSync(pj, 'utf8')) as { version?: unknown }
    return typeof v.version === 'string' ? v.version.trim() : ''
  } catch {
    return ''
  }
}

/**
 * 把 `1.2.3-rc.1` 拆成可比的段。
 *
 * ⚠️ 两条语义别写错（照 bili-scroll 的实测结论）：
 *   · **预发布比同号正式版小**：`1.0.0-rc.1 < 1.0.0`；
 *   · 数字段按**数值**比（`10 > 9`，不能按字符串）。
 */
export function parseVer(v: string): { nums: number[]; pre: string } | null {
  const s = String(v ?? '').trim().replace(/^v/i, '')
  const m = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/.exec(s)
  if (m === null) return null
  return {
    nums: (m[1] ?? '').split('.').map((x) => Number(x) || 0),
    pre: m[2] ?? '',
  }
}

/**
 * 比版本：`1` = a 更新 / `-1` = b 更新 / `0` = 相同。
 *
 * ⚠️ 只做**够用**的那部分 semver，不追求完整规范：
 *    本仓版本形如 `0.1.4` / `0.1.5-rc.2`，够判断"谁更新"就行。
 *    ⚠️ 解析失败**返回 0**（当作相同）—— 宁可说"没新版"，也别谎报。
 */
export function cmpVer(a: string, b: string): number {
  const A = parseVer(a)
  const B = parseVer(b)
  if (A === null || B === null) return 0
  const n = Math.max(A.nums.length, B.nums.length)
  for (let i = 0; i < n; i++) {
    const x = A.nums[i] ?? 0
    const y = B.nums[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }
  // 数字段一样 ⇒ 有预发布标记的更旧
  if (A.pre !== '' && B.pre === '') return -1
  if (A.pre === '' && B.pre !== '') return 1
  if (A.pre === B.pre) return 0
  return A.pre > B.pre ? 1 : -1
}

/** 一次 `/latest` 查询的结果。 */
interface LatestHit {
  version: string
  base: string
}

/** 查询某个 registry 的 `dist-tags.latest`（8 秒超时，与 bili-scroll 同值）。 */
async function latestFrom(base: string): Promise<LatestHit> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    // ⚠️ 包名要 encode（虽然是裸名，但保持与 bili-scroll 一致的写法，
    //    将来若改回 scoped 名不会漏）。
    const url = `${base}/${encodeURIComponent(PKG_NAME)}/latest`
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': PKG_NAME, Accept: 'application/json' },
    })
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status}`) as Error & { httpStatus?: number }
      err.httpStatus = r.status
      throw err
    }
    const j = (await r.json()) as { version?: unknown }
    return { version: String(j.version ?? '').trim(), base }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 拉**全量 metadata**，只为拿 `versions` 列表。
 *
 * 🔴🔴 **为什么需要它**（bili-scroll 实测踩到，我照抄这条判据）：
 *    `/latest` 是**独立的 CDN 缓存键**，会比包本身慢很多。发完新版后实测：
 *      · `registry.npmjs.org/…/latest` ⇒ 新版本 ✓
 *      · `registry.npmmirror.com/…/0.1.6` ⇒ 200，包在 ✓
 *      · `registry.npmmirror.com/…/latest` ⇒ **仍是旧版本**（CDN 缓存）✗
 *    ⇒ 用户点「检查更新」查不到新版，且这种"卡住"能持续几十分钟。
 *    `latest` 报得不比自己新时，再拉全量看 `versions` 里有没有更大的。
 *
 * ⚠️ 代价：那条请求大一些。所以**只在"看起来没新版"时才发**。
 */
async function versionsFrom(base: string): Promise<string[] | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const url = `${base}/${encodeURIComponent(PKG_NAME)}`
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': PKG_NAME, Accept: 'application/json' },
    })
    if (!r.ok) return null
    const j = (await r.json()) as { versions?: Record<string, unknown> }
    const list = Object.keys(j.versions ?? {})
    return list.length > 0 ? list : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** `/update` 的返回形状（前端直接消费，别再自己算）。 */
export interface UpdateCheck {
  ok: boolean
  /** 当前安装的版本（读磁盘）。 */
  current: string
  /** npm 上最新的版本。 */
  latest: string
  /** 是否真有新版（`latest > current`）。 */
  hasNew: boolean
  /** `ahead` = 本地更新 / `behind` = 有新版本 / `identical` = 一样。 */
  direction: 'ahead' | 'behind' | 'identical' | ''
  /** 实际用的源（让用户知道在比什么）。 */
  registry: string
  /** 结果来自缓存（10 分钟内）。 */
  cached?: boolean
  /** ⭐ `dist-tags.latest` 落后时，它原本报的那个版本（诊断用）。 */
  latestTagStale?: string
  /** 本地比 npm 新时的说明（**不是**"已是最新"）。 */
  note?: string
  /** 失败原因分类。`network` = 两个源都连不上。 */
  errorKind?: string
  error?: string
  /** 都试过哪些源、各自什么错（排障用）。 */
  tried?: Array<{ base: string; error: string }>
  /** 仓库地址（给"去看更新说明"用）。 */
  page?: string
}

/** 10 分钟缓存（与前端轮询粒度匹配；**只在成功时写**）。 */
let updateCache:
  | { at: number; key: string; latest: string; hasNew: boolean; direction: UpdateCheck['direction']; registry: string }
  | null = null

/**
 * ⭐⭐ **检查有没有新版本**（`GET /update`，也供前端头部自动预热）。
 *
 * 🔴 **只认 `dist-tags.latest`，不扫全部 versions**（除非 latest 看起来没新版）——
 *    npm 上有 `0.0.0-stage` 这种 staged publishing 的空壳占位版本，
 *    拿"所有版本里最大的"会挑出奇怪的东西。
 * @returns 检查结果（**永远不抛** —— 失败也要给前端一个能显示的对象）。
 */
export async function checkUpdate(): Promise<UpdateCheck> {
  const current = installedVersion()
  const out: UpdateCheck = {
    ok: true,
    current,
    latest: '',
    hasNew: false,
    direction: '',
    registry: '',
    page: `https://github.com/${GH_REPO}`,
  }

  // ⚠️ 缓存 key 必须带**本地版本号**：升级后立即失效（否则"我刚升了版"要等 10 分钟）。
  const cacheKey = `${current}|npm`
  if (updateCache !== null && updateCache.key === cacheKey && Date.now() - updateCache.at < 10 * 60 * 1000) {
    out.registry = updateCache.registry
    out.latest = updateCache.latest
    out.hasNew = updateCache.hasNew
    out.direction = updateCache.direction
    out.cached = true
    return out
  }

  // ⭐ 顺序：**先镜像、不通再官方**。反过来在国内会平白多等近 2 秒。
  const tried: Array<{ base: string; error: string }> = []
  let got: LatestHit | null = null
  for (const base of [registryMirror(), registryOfficial()]) {
    try {
      got = await latestFrom(base)
      break
    } catch (e) {
      const err = e as Error & { httpStatus?: number; name?: string }
      tried.push({
        base,
        error: err.httpStatus !== undefined
          ? `HTTP ${err.httpStatus}`
          : (err.name === 'AbortError' ? '超时 8 秒' : String(err.message ?? err)),
      })
    }
  }
  if (got === null) {
    out.ok = false
    out.errorKind = 'network'
    out.tried = tried
    // ⭐ 报错要说清**都试过哪些**（本项目：报错不得把多类原因压成一句）。
    out.error = '连不上 npm（镜像和官方都试过了）：'
      + tried.map((t) => `${t.base.replace(/^https?:\/\//, '')} ⇒ ${t.error}`).join('；')
    return out
  }

  out.registry = got.base
  out.latest = got.version
  let c = cmpVer(got.version, current)

  // 🔴 `latest` 可能落后（见 `versionsFrom` 的注释）⇒ 只在"看起来没新版"时补查。
  if (c <= 0) {
    const list = await versionsFrom(got.base)
    if (list !== null) {
      let best = ''
      for (const v of list) {
        if (cmpVer(v, current) > 0 && (best === '' || cmpVer(v, best) > 0)) best = v
      }
      if (best !== '' && cmpVer(best, got.version) > 0) {
        out.latest = best
        out.latestTagStale = got.version
        c = cmpVer(best, current)
      }
    }
  }

  out.hasNew = c > 0
  out.direction = c > 0 ? 'behind' : c < 0 ? 'ahead' : 'identical'
  if (c < 0) {
    // ⚠️ 本地比 npm 新 ⇒ "改过还没发版"。**不能说"已是最新"**（它明明更新），
    //    更不能谎报"有新版本"（那会让用户去降级）。
    out.note = `你本地是 ${current}，npm 上最新是 ${got.version} —— 你比它新（大概是改过还没发版）。不算需要升级。`
  }

  // ⚠️ **只在成功时写缓存**（失败别缓存，否则接下来 10 分钟都报同一个错）。
  updateCache = {
    at: Date.now(),
    key: cacheKey,
    latest: out.latest,
    hasNew: out.hasNew,
    direction: out.direction,
    registry: got.base,
  }
  return out
}

/** 升级状态（`GET /upgrade/status`）。 */
export interface UpgradeStatus {
  /** 是否正在升级（前端据此禁用按钮、显示"进行中"）。 */
  busy: boolean
  /** 最近一次升级的日志（尾部若干行）。 */
  log: string
  /** 日志文件路径（给人去看全文）。 */
  logFile: string
  /** 最近一次升级的结果；`null` = 本次进程内还没升过。 */
  last: { ok: boolean; at: number; want: string; got: string } | null
}

/** 升级中的互斥锁（防连点）。 */
let upgrading = false
/** 日志缓冲（内存 + 落盘，落盘是为了"重启后还能查"）。 */
const upgradeLog: string[] = []
/** 最近一次升级结果。 */
let lastUpgrade: { ok: boolean; at: number; want: string; got: string } | null = null

/** 日志最多留多少行（内存里）。 */
const MAX_LOG_LINES = 400

/**
 * 追加一行升级日志。
 * @param line - 一行文本（自动补时间戳）。
 */
function appendLog(line: string): void {
  const stamp = new Date().toISOString()
  for (const l of String(line).split('\n')) {
    if (l.trim() === '') continue
    upgradeLog.push(`${stamp} ${l}`)
  }
  while (upgradeLog.length > MAX_LOG_LINES) upgradeLog.shift()
}

/** 当前升级状态。 */
export function upgradeStatus(logFile: string): UpgradeStatus {
  return {
    busy: upgrading,
    log: upgradeLog.slice(-60).join('\n'),
    logFile,
    last: lastUpgrade,
  }
}

/**
 * 判断当前 profile 的名字（升级要指定装到哪个 profile）。
 *
 * 🔴 **必须从命令行里读**，不能写死 `web`：CLI 版的 HOME 可能是另一个目录，
 *    写死就会"升的是另一个实例，自己这边一个字都没变"（bili-scroll 真机踩过）。
 *
 * 两条判据（照 bili-scroll 的 `detectProfile`）：
 *   ① 路径形态 `…\profiles\<name>`（桌面版走这条）；
 *   ② 位置参数形态 `bin.js <profile> --port …`（CLI 版走这条）。
 * @returns profile 名与它从哪来（写进日志，便于排障）。
 */
export function detectProfile(): { name: string; via: string } {
  const argv = process.argv ?? []
  // ① 路径形态
  for (const a of argv) {
    const s = String(a ?? '')
    const m = /[\\/]profiles[\\/]([^\\/]+)[\\/]?$/.exec(s)
    if (m !== null && (m[1] ?? '') !== '') return { name: m[1] as string, via: 'argv 里的 profiles 路径' }
  }
  // ② 位置参数形态（跳过选项、它们的值、以及入口文件）
  for (const a of argv.slice(1)) {
    const s = String(a ?? '')
    if (s === '' || s.startsWith('-')) continue
    if (/\.(js|mjs|cjs|exe|cmd)$/i.test(s)) continue
    if (/[\\/]/.test(s)) continue
    if (!/^[A-Za-z0-9._-]+$/.test(s)) continue
    return { name: s, via: 'argv 里的位置参数' }
  }
  return { name: 'web', via: '拿不到，退回默认值' }
}

/**
 * 组装升级命令的参数（**纯函数，可离线断言**）。
 *
 * 🔴🔴 **`--registry` 必须写等号形式** —— 空格形式在桌面版的
 *   `runProfilePnpm` 里会被当成未知选项（它只 filter `startsWith('--registry=')`）。
 *   Web 端两种都行 ⇒ **统一用等号**，两端都过。
 *   ⭐ 这条来自 bili-scroll 的真机结论（桌面版报 `Unknown option: 'registry'`）。
 *
 * ⚠️ **必须带明确版本号**（`<包>@<版本>`）：profile 里写的是精确版本，
 *    只给包名时 pnpm 会说 "Already up to date" 什么也不做。
 * @param profile - 目标 profile 名。
 * @param want - 目标版本号。
 * @param registry - 走哪个源。
 * @returns 传给 `node <bin.js>` 的参数数组。
 */
/**
 * 🔴 **版本号格式是否合法**（`1.2.3` 或 `1.2.3-rc.1`）。
 *
 * ── 为什么必须校验（bili-scroll 的做法，我照抄）────────────────────────
 * `want` 是从**面板传上来的**（它来自 `/update` 的 `latest`），而 `latest`
 * 又来自**网络**（镜像 / 假源 / 将来某个坏掉的 registry）。
 * ⇒ 不校验就把它拼进命令，最坏会得到 `dsh-memj@undefined` 这种**非法包规格**，
 *   pnpm 会报一句跟根因无关的错（或者更糟：把它当成一个 tag 名去装）。
 *
 * ⚠️ **只做"够用"的校验**：本仓版本形如 `0.1.4` / `0.1.5-rc.2`，够用就行，
 *    不追求完整 semver（不需要处理 `1.2.3+build`，本仓没用过）。
 * @param v - 待校验的版本号。
 * @returns 是否形如一个合法版本号。
 */
export function isValidVersion(v: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(v ?? '').trim())
}

/**
 * 组装升级命令的参数（**纯函数，可离线断言**）。
 *
 * 🔴🔴 **`--registry` 必须写等号形式** —— 空格形式在桌面版的
 *   `runProfilePnpm` 里会被当成未知选项（它只 filter `startsWith('--registry=')`）。
 *   Web 端两种都行 ⇒ **统一用等号**，两端都过。
 *   ⭐ 这条来自 bili-scroll 的真机结论（桌面版报 `Unknown option: 'registry'`）。
 *
 * 🔴🔴 **必带明确版本号**（`<包>@<版本>`）：profile 里写的是**精确版本**，
 *    只给包名时 pnpm 一看"这个名字已经在依赖里了"就跳过，**根本不看有没有新版**
 *    ⇒ 输出 `Already up to date`、**退出码 0、版本没变**（bili-scroll 实测踩过）。
 *
 * ⚠️ **与 bili-scroll 的一处刻意不同**：它在拿不到版本号时会**退回裸包名**
 *    （注释写"老行为，至少不会更差"）。但那条路**必然导致"显示成功、版本没变"**，
 *    而这正是这条功能最该避免的失败方式。
 *    ⇒ 我选择**不退回**：`buildUpgradeArgs` 遇到非法版本号直接抛，
 *      由 `startUpgrade` 转成一句人话错误（"没有目标版本号，无法升级"）。
 *    ⭐ 判据：**宁可明确失败，也不要一次"看起来成功"的空操作。**
 * @param profile - 目标 profile 名。
 * @param want - 目标版本号（**必须合法**，见 `isValidVersion`）。
 * @param registry - 走哪个源。
 * @returns 传给 `node <bin.js>` 的参数数组。
 * @throws 版本号不合法时（调用方要处理 —— 这是**程序错误**，不是用户输入错）。
 */
export function buildUpgradeArgs(profile: string, want: string, registry: string): string[] {
  const v = String(want ?? '').trim()
  if (!isValidVersion(v)) {
    // ⚠️ 抛而不是降级（理由见函数头）。
    throw new Error(`版本号不合法：「${v}」—— 无法组装升级命令`)
  }
  return [
    'plugin',
    '--profile', profile,
    'add',
    `${PKG_NAME}@${v}`,
    `--registry=${registry}`,
  ]
}

/**
 * 找到 `dsh` 的 bin.js 路径（升级要 spawn 一个新进程）。
 *
 * ⭐ 判据：**从当前进程的 argv 里取** —— 宿主就是 `node <…>/bin.js web …`，
 *    所以 `argv[1]` 就是那个 bin.js。比自己拼路径可靠（不依赖安装形态）。
 * @returns bin.js 的绝对路径；拿不到返回空串。
 */
/**
 * 🔴🔴 **当前进程是不是跑在 Electron 里**（桌面版）。
 *
 * ── 为什么必须判它（库内知识 `4f8c21fb` 的结论，我核实过）────────────
 * `spawn(process.execPath, [binJs, …])` 在 **CLI 版**下没问题（execPath 就是 node）；
 * 但在**桌面版**下 `process.execPath` 是 **`DeepSeek Harness.exe`**（Electron，内嵌 node）
 * —— 它**不是 node**，直接拿它跑 `bin.js` 等于"用浏览器去执行一段服务端脚本"。
 *
 * ⭐ **官方做法**（桌面版自己的 `resources/runtime/bin/node.cmd` 里写着）：
 *   ```bat
 *   set ELECTRON_RUN_AS_NODE=1
 *   "%DSH_DESKTOP_NODE_EXECUTABLE%" --expose-internals %*
 *   ```
 *   ⇒ 加了 `ELECTRON_RUN_AS_NODE=1`，Electron 的 exe **就变成 node**（Electron 官方开关）。
 *
 * 三条判据（任一成立即算 Electron，**偏保守**；普通 node 三条全不成立 ⇒ 零影响）：
 *   ① `process.versions.electron` 有值 —— 最硬（只在 Electron 运行时里存在）；
 *   ② 环境里有 `DSH_DESKTOP_NODE_EXECUTABLE` —— 桌面版用子进程方式起宿主时会设它，
 *      那时 `process.versions.electron` **反而不存在**（我们自己就是那个 node 子进程）；
 *   ③ 可执行文件名像 `DeepSeek Harness.exe` —— 兜底。
 *   ⚠️ **不能只判文件名**：开发模式下 Electron 的可执行名可能就叫 `electron`、也可能被改名。
 * @returns 是否处于 Electron 宿主。
 */
export function isElectronHost(): boolean {
  try {
    if (process.versions !== undefined && typeof process.versions.electron === 'string') return true
    if (String(process.env['DSH_DESKTOP_NODE_EXECUTABLE'] ?? '').trim() !== '') return true
    return /(?:^|[\\/])(DeepSeek Harness|dsh-desktop|electron)(?:\.exe)?$/i.test(String(process.execPath ?? ''))
  } catch {
    return false
  }
}

/**
 * 只认「真的是 dsh 的入口」：存在 + 是常规文件 + 名字对得上。
 * @param p - 候选路径。
 * @returns 是否可用。
 */
function okDshBin(p: string): boolean {
  const s = String(p ?? '').trim()
  if (s === '' || !isAbsolute(s)) return false
  try {
    if (!statSync(s).isFile()) return false
  } catch {
    return false
  }
  // `bin.js` = CLI 版；`cli.js` = 桌面版自己的 CLI 入口（两者都能当 node 脚本直接跑）
  return /(^|[\\/])(bin|cli)\.js$/.test(s) && /dsh/i.test(s)
}

/**
 * 🔴🔴 **是不是一个 asar 内部路径**（`…\app.asar\…`）。
 *
 * ── 为什么单独判它（我实测出来的，与 bili-scroll 的注释**不同**）──────
 * bili-scroll 的注释说 *"Electron 的 asar 对 `statSync` 是透明的，当普通路径用就行"*。
 * **那句话只在 Electron 进程内部成立。** 我在这台机器的**普通 node** 里实测：
 * ```
 * statSync("<res>\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js")
 *   ⇒ ENOENT
 * ```
 * （`app.asar` 是真 asar：182 MB、带 `\u0004\u0000\u0000\u0000` 魔数头。）
 *
 * ⭐ 但**升级恰恰是在 Electron 进程内跑的**（桌面版插件就住在那里）⇒ 那条路**能用**。
 * ⇒ 所以判据不是"能不能 stat"，而是 **"我是不是在 Electron 里"**：
 *    在 Electron 里 ⇒ asar 路径**直接采信**（不 stat，因为 asar 里的文件 stat 行为
 *    依 Electron 版本而异，赌它反而会**误杀**一条本来能用的路）；
 *    不在 Electron 里 ⇒ asar 路径**必然 ENOENT**，跳过。
 *
 * ⚠️ 这是**放宽**而不是收紧：少一次 `statSync` 换来"不会误杀"。
 *    代价是"路径确实不存在"这种情况要到 spawn 时才暴露 —— 那时会拿到明确的
 *    `MODULE_NOT_FOUND`，日志里看得见，比"探测阶段悄悄放弃"好。
 * @param p - 候选路径。
 * @returns 是否位于 asar 包内。
 */
function insideAsar(p: string): boolean {
  return /[\\/]app\.asar[\\/]/i.test(p)
}

/**
 * ⭐⭐⭐ **找到 dsh 的启动器入口**（升级要 spawn 一个新进程）。
 *
 * ── 顺序（按可靠度）────────────────────────────────────────────────────
 * | # | 候选 | 谁命中 |
 * |---|---|---|
 * | ① | `process.argv[1]` | **CLI 版**（插件就跑在 dsh 进程里 ⇒ 天然是 `lib/bin.js`） |
 * | ①b | `<resources>\app.asar\dsh\node_modules\…\dsh-desktop-host\lib\cli.js` | **桌面版首选** |
 * | ①c | `<resources>\app.asar\dsh\node_modules\…\dsh\lib\bin.js` | 桌面版备选 |
 * | ③ | `%APPDATA%\npm\…` / POSIX 常见路径 | 兜底 |
 *
 * 🔴 **桌面版为什么首选 `dsh-desktop-host/lib/cli.js` 而不是完整 `bin.js`**：
 *   这不是我挑的 —— **桌面版自己的 `resources/runtime/cli/bin/dsh.cmd` 就是这么写的**：
 *   ```bat
 *   set "ELECTRON_RUN_AS_NODE=1"
 *   "%~dp0..\..\..\..\DeepSeek Harness.exe" --expose-internals
 *     "%~dp0..\..\..\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" %*
 *   ```
 *   ⭐ 而且它是**唯一能合法管理 `desktop` profile** 的通道：`bin.js:119` 是
 *   `if (!manageDesktopProfile) rejectElectronProfile(plugin, options.profile)`，
 *   而 `cli.js` 传 `manageDesktopProfile: true` ⇒ 跳过那道硬拒。
 *   ⚠️ 用 `bin.js` 去 `--profile desktop` 会报
 *   `profile "desktop" is managed exclusively by the Electron application`。
 *
 * ⚠️ **普通 node 下 `process.resourcesPath` 恒为空** ⇒ 桌面那几条自动跳过，
 *   CLI 路径行为**完全不变**。
 * @returns 入口信息；找不到返回 `{ error }`（**不降级** —— 降级到 shell 会静默出各种怪问题）。
 */
export function resolveDshEntry():
  | { command: string; args: string[]; electron: boolean; via: string; bin: string }
  | { error: string } {
  const electron = isElectronHost()
  const rp = String((process as { resourcesPath?: string }).resourcesPath ?? '').trim()

  /** 桌面版里 dsh 的候选入口（顺序 = 官方 `dsh.cmd` 的选择在前）。 */
  const desktopEntries: string[] = []
  if (rp !== '') {
    const nm = join(rp, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai')
    // ⭐ ① 官方 `dsh.cmd` 用的就是这个（也是唯一能吃 desktop profile 的）
    desktopEntries.push(join(nm, 'dsh-desktop-host', 'lib', 'cli.js'))
    // ⭐ ② 完整 dsh（与 CLI 版同一入口；但不能管理 desktop profile）
    desktopEntries.push(join(nm, 'dsh', 'lib', 'bin.js'))
    // ⭐ ③ 兜底：解包目录（本机实测**只有原生模块**，不含 dsh 的 JS 入口，
    //      但别的版本可能解包，留着不吃亏）
    const unpacked = join(rp, 'app.asar.unpacked', 'dsh', 'node_modules', '@deepseek-ai')
    desktopEntries.push(join(unpacked, 'dsh-desktop-host', 'lib', 'cli.js'))
    desktopEntries.push(join(unpacked, 'dsh', 'lib', 'bin.js'))
  }

  const candidates: Array<{ p: string; via: string }> = [
    // ① CLI 版（桌面版里 argv[1] 是 Electron 主进程入口 ⇒ okDshBin 会拒掉）
    { p: String((process.argv ?? [])[1] ?? ''), via: 'argv' },
    // ①b 桌面版
    ...desktopEntries.map((p) => ({ p, via: 'asar' })),
    // ③ 常见全局安装位置（兜底）
    { p: join(String(process.env['APPDATA'] ?? ''), 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'), via: 'guess' },
    { p: '/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js', via: 'guess' },
    { p: '/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js', via: 'guess' },
  ]

  for (const c of candidates) {
    /**
     * 🔴 **asar 内的候选：只要在 Electron 里就采信，不做 `statSync`** ——
     *    理由见 `insideAsar` 的注释（普通 node 里必 ENOENT，会让这条路被误杀）。
     */
    const usable = insideAsar(c.p)
      ? (electron && c.p.trim() !== '')
      : okDshBin(c.p)
    if (!usable) continue
    return {
      // ⚠️ 桌面版必须是 **Electron 的 exe + ELECTRON_RUN_AS_NODE=1**（见 `isElectronHost`）；
      //    CLI 版就是 node 自己。两处都是 `process.execPath`，区别在 env。
      command: process.execPath,
      // ⚠️ `--expose-internals`：桌面版的 `cli.js` 需要它（官方 `dsh.cmd` 里就带）。
      args: [...(electron ? ['--expose-internals'] : []), c.p],
      electron,
      via: c.via,
      bin: c.p,
    }
  }

  return {
    error: '找不到 dsh 的入口（lib/bin.js）。'
      + '正常情况下这一步是自动的 —— 自动探测全部失败时才需要手动处理。'
      + `本次试过：${candidates.map((c) => c.via).join(' / ')}`
      + `；electron=${electron}；resourcesPath=${rp === '' ? '(空)' : rp}`,
  }
}

/**
 * 找到 dsh 的 bin.js 路径（升级要 spawn 一个新进程）。
 *
 * @returns bin.js 的绝对路径；拿不到返回空串。
 * @deprecated 用 `resolveDshEntry()` —— 它同时处理桌面版（Electron）那条路。
 */
export function dshBinPath(): string {
  const r = resolveDshEntry()
  return 'error' in r ? '' : r.bin
}

/**
 * ⭐⭐⭐ **执行升级**（`POST /upgrade`）。
 *
 * 🔴 **异步、不阻塞 HTTP**：pnpm 要下载包，几秒到几十秒。
 *    ⇒ 立刻回"已开始"，过程写进日志，前端轮询 `/upgrade/status` 看进度。
 *    ⭐ 这也是 bili-scroll 的做法（它把过程写进 `install.log` 并让面板切到那一页）。
 *
 * 🔴🔴 **成败的判据是"装完再读一次磁盘"**，不是 pnpm 的退出码 ——
 *    bili-scroll 实测：pnpm **退出码 0**、日志写"完成"，但
 *    `node_modules` 里的实体**一个字都没换**（运行时占着目录，Windows 换不掉，
 *    而 pnpm 只改了声明与 lock 仍返回 0）。
 *    ⭐ 判据：**"操作成功返回"与"状态真的变了"是两件事。**
 *
 * @param want - 目标版本号。
 * @param logFile - 日志落盘路径（状态接口会回给用户去看全文）。
 * @returns 立刻返回的"已开始"回执；真正结果由 `upgradeStatus()` 反映。
 */
export function startUpgrade(
  want: string,
  logFile: string,
): { ok: boolean; busy?: boolean; started?: boolean; error?: string; hint?: string } {
  if (upgrading) return { ok: true, busy: true, hint: '正在升级，别重复点' }

  // 🔴🔴 **先校验版本号，再做任何别的事**（2026-10-20 补，照 bili-scroll 的做法）。
  //    理由见 `buildUpgradeArgs`：`want` 来自网络查到的 `latest`，不校验就会
  //    拼出 `dsh-memj@undefined` 这类非法包规格。
  //    ⚠️ **不退回裸包名**（bili-scroll 会退），因为裸包名**必然**是
  //       "退出码 0、版本没变"——那正是这条功能最该避免的失败方式。
  if (!isValidVersion(want)) {
    return {
      ok: false,
      error: `没有拿到合法的目标版本号（收到「${want}」）—— 无法升级。`
        + '请先点「检查更新」拿到最新版本号，再点升级。',
    }
  }

  // ⚠️ **用 `resolveDshEntry()`**（它同时处理 CLI 与桌面版）——
  //    原来只读 `argv[1]`，在桌面版下必然失败（那时 argv[1] 是 Electron 主进程入口）。
  const entry = resolveDshEntry()
  if ('error' in entry) return { ok: false, error: entry.error }
  const prof = detectProfile()

  /**
   * 🔴🔴 **桌面版必须换 profile 名 + 换 CLI 入口**（库内知识 `b007cc96` 的结论）：
   *   `dsh plugin --profile desktop add …` 会被
   *   `rejectElectronProfile()` **硬拒**（`bin.js` 里那句
   *   `profile "desktop" is managed exclusively by the Electron application`）。
   *   ⭐ 唯一正路是桌面版自己的 `dsh-desktop-host/lib/cli.js` —— 它传
   *   `manageDesktopProfile: true`，而 `bin.js:119` 是
   *   `if (!manageDesktopProfile) rejectElectronProfile(plugin, options.profile)`
   *   ⇒ **跳过那道检查**。
   *
   * ⚠️ 所以：**入口已经是 `cli.js` 时 profile 才能写 `desktop`**；
   *    若因为某种原因落到了 `bin.js`，给 desktop 也只会被拒 ⇒ 如实报错，别让它白跑。
   */
  const isDesktopProfile = prof.name.toLowerCase() === 'desktop'
  const usingDesktopCli = /dsh-desktop-host[\\/]lib[\\/]cli\.js$/i.test(entry.bin)
  if (isDesktopProfile && !usingDesktopCli) {
    return {
      ok: false,
      error: '检测到当前是桌面版的 desktop profile，但没找到桌面版自己的 CLI 入口'
        + '（`dsh-desktop-host/lib/cli.js`）—— 直连的 `bin.js` 会硬拒 desktop profile。'
        + ' ⇒ 请到应用内「插件」页升级，或手动执行：'
        + `dsh plugin --profile desktop add ${PKG_NAME}@${want}`,
    }
  }

  const mirror = registryMirror()
  upgrading = true
  appendLog(`=== 开始升级 ===`)
  appendLog(`目标版本：${want}`)
  appendLog(`当前 profile：${prof.name}（来自${prof.via}）`)
  appendLog(`源：${mirror}`)
  appendLog(`宿主：${entry.electron ? '桌面版（Electron）' : 'CLI（node）'} ｜ 入口来源：${entry.via}`)
  appendLog(`入口：${entry.bin}`)
  const args = buildUpgradeArgs(prof.name, want, mirror)
  appendLog(`命令：${entry.command} ${[...entry.args, ...args].join(' ')}`)

  /** 🔴 桌面版：Electron 的 exe 要加这个才变成 node（见 `isElectronHost`）。 */
  const childEnv = entry.electron
    ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    : undefined

  // ⚠️ **不 await**（fire-and-forget）—— 见上面的"不阻塞 HTTP"。
  void (async () => {
    try {
      const code = await new Promise<number>((resolve) => {
        const child = execFile(
          entry.command,
          [...entry.args, ...args],
          {
            timeout: 5 * 60 * 1000,
            maxBuffer: 4 * 1024 * 1024,
            windowsHide: true,
            // ⚠️ 条件展开：`undefined` 与"不传"语义不同，别显式传 undefined。
            ...(childEnv !== undefined ? { env: childEnv } : {}),
          },
          (err, stdout, stderr) => {
            if (stdout) appendLog(`[stdout]\n${stdout.trim()}`)
            if (stderr) appendLog(`[stderr]\n${stderr.trim()}`)
            // ⚠️ `err.code` 是退出码；被 timeout 杀掉时它是 undefined。
            const ec = err === null ? 0 : (typeof (err as { code?: unknown }).code === 'number'
              ? (err as { code: number }).code
              : -1)
            if (err !== null && ec === -1) appendLog(`[异常] ${err.message}`)
            resolve(ec)
          },
        )
        child.on('error', (e) => appendLog(`[spawn 失败] ${e.message}`))
      })
      appendLog(`pnpm/CLI 退出码：${code}`)

      // 🔴🔴 **真正的判据：装完再读一次磁盘**（理由见函数头）。
      const got = installedVersion()
      const ok = want !== '' ? got === want : got !== ''
      appendLog(`装完实读版本：${got === '' ? '(读不到)' : got}（目标 ${want}）`)
      if (ok) {
        appendLog('✅ 升级成功（磁盘上的版本号已变）')
      } else if (code === 0) {
        appendLog(
          '⚠️ **退出码 0 但版本没变** —— 这是已知的失败方式：'
          + '运行时占着插件目录，pnpm 只改了声明与 lock、换不掉实体。'
          + ' ⇒ 请**重启 DSH** 后重试，或到「插件」页升级。',
        )
      } else {
        appendLog('❌ 升级失败（非零退出码，见上面的 stdout/stderr）')
      }
      lastUpgrade = { ok, at: Date.now(), want, got }
    } catch (e) {
      appendLog(`[升级过程抛错] ${e instanceof Error ? e.message : String(e)}`)
      lastUpgrade = { ok: false, at: Date.now(), want, got: installedVersion() }
    } finally {
      upgrading = false
      // ⚠️ 升完**必须让缓存失效**（否则前端马上查更新还会说"有新版本"）。
      updateCache = null
    }
  })()

  return { ok: true, started: true, hint: '已开始升级，进度见下方日志' }
}

/**
 * 升级日志的落盘路径（`<库根>/upgrade-install.log`）。
 *
 * ⭐ 放库根而不是插件目录：插件目录会被升级**整个换掉**，
 *    日志放那里会跟着丢掉（bili-scroll 把 install.log 放家目录也是这个理由）。
 * @param libraryRoot - 库根。
 * @returns 日志绝对路径。
 */
export function upgradeLogPath(libraryRoot: string): string {
  return join(libraryRoot, 'upgrade-install.log')
}

/**
 * 把内存里的日志追加落盘（供 `GET /upgrade/status` 顺手调）。
 *
 * ⚠️ **全程 try/catch 不抛** —— 写日志失败绝不能连累升级本身。
 * ⚠️ 用**同步写**：日志量很小（几十行），且要保证"进程崩了还能查"。
 * @param file - 日志文件路径。
 * @param text - 要追加的文本。
 */
export function appendLogFile(file: string, text: string): void {
  try {
    appendFileSync(file, `${text}\n`, 'utf8')
  } catch {
    /* 日志写不进去不该影响任何东西 */
  }
}
