/**
 * ⭐⭐⭐ **面板内升级**的套件（2026-10-20）。
 *
 * ── 它守的是什么 ───────────────────────────────────────────────────────────
 * 用户原话：*"我希望在面板上加升级方案，应该参考 bili-scroll 本地我的分支版本的
 *            面板内升级方案…… 提示入口可以放在头部记忆库基础信息的右边。"*
 *
 * 参考实现是 `@jojoman2024/dsh-bili-scroll@0.1.9`（本项目验证过的一版真实实现）。
 * 它踩过的坑**全都是"退出码 0 但什么都没发生"这一类静默失败**，
 * 所以本文件的重点不在"功能能用"，而在**几条判据别写错**：
 *
 *  🔴 ① **`--registry` 必须等号形式**（空格形式在桌面版被 `runProfilePnpm` 当未知选项拒掉）；
 *  🔴 ② **成败判据是"装完再读一次磁盘"**，不是 pnpm 退出码；
 *  🔴 ③ **桌面版（Electron）不能直接用 `process.execPath` 跑 bin.js**
 *       （那时 execPath 是 `DeepSeek Harness.exe`，不是 node）；
 *  🔴 ④ **desktop profile 会被 `bin.js` 硬拒**，唯一正路是 `dsh-desktop-host/lib/cli.js`；
 *  🔴 ⑤ **`--profile` 要从 argv 里探**，不能写死 `web`（否则升的是另一个实例）。
 *
 * ⚠️ **本文件不真的执行升级**（`startUpgrade` 会 spawn 子进程）——
 *    只验纯函数 + 探测逻辑，那些是不发版也能验的部分。
 *    （bili-scroll 的做法是起**假 registry** 把整条链路跑通，见库内条目 `84df83d6`。）
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { statSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const mod = await import(`file:///${join(here, '..', 'lib', 'index.js').replace(/\\/g, '/')}`)

/**
 * ⚠️ **必须用【真实存在】的路径做夹具** —— `okDshBin()` 会 `statSync`，
 *    假路径（`D:\x\dsh\lib\bin.js`）一律被拒。
 *    🔴 我第一版就是拿假路径测的 ⇒ 3 条假红，差点去"修"产品代码。
 *    ⭐ 判据：**夹具要照真实数据的形状**（库内条目 `62f4b250` 的同族）。
 *
 * ⚠️ `lib/index.js` 本身**不是** dsh 的入口（`okDshBin` 要求路径含 `dsh`
 *    且以 `bin.js`/`cli.js` 结尾）⇒ 这里找一个**真实存在的 dsh bin.js**。
 * ⚠️ 找不到 ⇒ 相关断言**跳过并如实报出**（不让它们变成假绿）。
 */
const REAL_DSH_BIN = [
  'D:\\dsh-standalone-0.1.5-rc.2\\workplaces\\2026-09-28_20-21-31-362\\deploy-020rc2\\npm-global\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js',
  'C:\\Users\\jojoman\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js',
].find((p) => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
})

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

// ══════════════════════════════════════════════════════════════════════════
// 0. 版本比较（含预发布语义 —— 写错就会谎报"有新版本"或"已是最新"）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【0】版本比较：预发布语义 + 数值比较')

check('0.1.5 > 0.1.4', mod.cmpVer('0.1.5', '0.1.4') === 1)
check('0.1.4 < 0.1.5', mod.cmpVer('0.1.4', '0.1.5') === -1)
check('同版本 = 0', mod.cmpVer('0.1.4', '0.1.4') === 0)
// ⭐ **预发布比同号正式版小** —— 写在文档里容易记反。
check('⭐⭐ 1.0.0 > 1.0.0-rc.1（正式 > 预发布）', mod.cmpVer('1.0.0', '1.0.0-rc.1') === 1)
check('⭐⭐ 1.0.0-rc.1 < 1.0.0', mod.cmpVer('1.0.0-rc.1', '1.0.0') === -1)
// ⭐ 数字段必须按**数值**比（字符串比会得出 "0.9.0" > "0.10.0" 这种错）。
check('⭐⭐ 0.10.0 > 0.9.0（按数值不按字符串）', mod.cmpVer('0.10.0', '0.9.0') === 1)
check('⭐⭐ 0.2.0 < 0.10.0', mod.cmpVer('0.2.0', '0.10.0') === -1)
check('容忍 v 前缀', mod.cmpVer('v0.1.5', '0.1.5') === 0)
// ⚠️ 解析不出来 ⇒ 0（当作相同）。宁可说"没新版"，也别谎报。
check('⭐ 无法解析 ⇒ 0（不谎报有新版本）', mod.cmpVer('abc', '0.1.4') === 0)

// ══════════════════════════════════════════════════════════════════════════
// 1. 升级命令的形状（两个必须写对的细节）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【1】升级命令：--registry 等号形式 + 明确版本号')

const args = mod.buildUpgradeArgs('web', '0.1.5', 'https://registry.npmmirror.com')
check('⭐ 含 plugin 子命令', args[0] === 'plugin')
check('⭐ 含 --profile 与 profile 名', args[1] === '--profile' && args[2] === 'web')
check('⭐ 含 add', args[3] === 'add')

// 🔴 坑 ①：桌面版的 `runProfilePnpm` 只 filter `startsWith('--registry=')`
//    ⇒ 空格形式会被当成**未知选项**整条拒绝（而 Web 端两种都行）。
const regArg = args.find((a) => a.startsWith('--registry'))
check('⭐⭐⭐ --registry 是【等号形式】（空格形式在桌面版会被拒）',
  regArg === '--registry=https://registry.npmmirror.com', String(regArg))
check('⭐⭐ 没有把 --registry 与 url 拆成两个元素',
  !args.includes('--registry'), args.join(' '))

// 🔴 坑 ⑤：profile 里写的是精确版本，只给包名时 pnpm 会说
//    "Already up to date" 什么也不做 ⇒ **必须带 @版本号**。
check('⭐⭐⭐ 包规格带明确版本号（否则 pnpm 什么都不做）',
  args.includes('dsh-memj@0.1.5'), args.join(' '))

// ⭐ 版本号格式校验（2026-10-20 补，照 bili-scroll 的做法）：
//    `want` 来自**网络**（`/update` 的 `latest`）⇒ 不校验就会拼出 `dsh-memj@undefined`。
check('⭐⭐ isValidVersion 认 0.1.4', mod.isValidVersion('0.1.4') === true)
check('⭐⭐ isValidVersion 认 0.1.5-rc.2（预发布）', mod.isValidVersion('0.1.5-rc.2') === true)
for (const bad of ['', 'undefined', 'latest', 'v0.1.5', '0.1', '^0.1.5', '0.1.5.6.7.8.9.10']) {
  check(`⭐⭐ 拒绝非法版本号 ${JSON.stringify(bad)}`, mod.isValidVersion(bad) === false, bad)
}

// 🔴🔴 **与 bili-scroll 的一处刻意不同，必须有断言守着**：
//    它在拿不到版本号时**退回裸包名**（`pnpm add dsh-memj`），
//    而那条路**必然**输出 `Already up to date`、退出码 0、版本没变
//    —— 正是这条功能最该避免的失败方式。
//    ⇒ 我们**不退回**：非法版本号直接抛（`startUpgrade` 转成人话错误）。
let threw = false
try {
  mod.buildUpgradeArgs('web', '', 'https://registry.npmmirror.com')
} catch {
  threw = true
}
check('⭐⭐⭐ 没版本号时【抛错】而不是退回裸包名（避免"显示成功却没升级"）', threw)
check('⭐⭐ 错误文案说明"无法组装升级命令"',
  (() => {
    try {
      mod.buildUpgradeArgs('web', 'undefined', 'https://x')
      return false
    } catch (e) {
      return /无法组装升级命令/.test(e.message)
    }
  })())
// ⚠️ 反向：**绝不能**在非法版本时拼出裸包名那种规格
check('⭐⭐ 非法版本号不会产出 `dsh-memj`（裸包名）这种规格',
  (() => {
    try {
      const a = mod.buildUpgradeArgs('web', 'latest', 'https://x')
      return !a.includes('dsh-memj')
    } catch {
      return true // 抛了就不会产出，符合预期
    }
  })())

// ══════════════════════════════════════════════════════════════════════════
// 2. profile 探测（写死 `web` 会升错实例）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【2】profile 探测：从 argv 读，不写死')

const realArgv = process.argv
try {
  // CLI 形态：`node bin.js web --port 3100`
  process.argv = ['C:\\node.exe', 'D:\\x\\dsh\\lib\\bin.js', 'web', '--port', '3100']
  const cli = mod.detectProfile()
  check('⭐⭐ CLI 形态 ⇒ 认出 web', cli.name === 'web', JSON.stringify(cli))

  // 桌面形态：`… dsh-desktop-host/lib/index.js <home>\profiles\desktop`
  process.argv = ['node.exe', 'D:\\x\\dsh-desktop-host\\lib\\index.js', 'C:\\Users\\u\\.dsh\\profiles\\desktop']
  const dt = mod.detectProfile()
  check('⭐⭐⭐ 桌面形态 ⇒ 认出 desktop（这条错了会去升 web profile）',
    dt.name === 'desktop', JSON.stringify(dt))

  // ⚠️ 拿不到时退回 web（老行为，但不许抛）
  process.argv = ['node.exe']
  const none = mod.detectProfile()
  check('拿不到 ⇒ 退回 web（不抛）', none.name === 'web', JSON.stringify(none))
} finally {
  process.argv = realArgv
}

// ══════════════════════════════════════════════════════════════════════════
// 3. 宿主探测：CLI vs 桌面版（Electron）—— 两套完全不同的启动方式
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【3】宿主探测：普通 node 与 Electron 要分开')

// ⚠️ 本进程是普通 node ⇒ 必须判成"不是 Electron"（否则 CLI 路径会被污染）。
check('⭐⭐ 普通 node ⇒ isElectronHost() === false', mod.isElectronHost() === false)

try {
  // 模拟真实 CLI 宿主（⚠️ 路径必须真实存在，见 `REAL_DSH_BIN` 的注释）
  if (REAL_DSH_BIN === undefined) {
    console.log('  ⚠️ 本机找不到真实的 dsh bin.js ⇒ 【3】CLI 那几条跳过（不是通过）')
  } else {
    process.argv = ['C:\\node.exe', REAL_DSH_BIN, 'web']
    const cliEntry = mod.resolveDshEntry()
    check('⭐⭐ CLI 宿主 ⇒ 从 argv 拿到入口',
      !('error' in cliEntry) && cliEntry.via === 'argv', JSON.stringify(cliEntry).slice(0, 160))
    check('⭐⭐ CLI 宿主 ⇒ 不加 --expose-internals',
      !('error' in cliEntry) && !cliEntry.args.includes('--expose-internals'))
    check('⭐⭐ CLI 宿主 ⇒ electron=false',
      !('error' in cliEntry) && cliEntry.electron === false)
  }

  // 模拟桌面版：`resourcesPath` + `process.versions.electron`
  //   ⚠️ 用真实桌面安装路径（本机装着 —— 但 asar 内路径在普通 node 里 stat 不到，
  //      这正是"必须按 electron 判、不能按 stat 判"的原因）。
  const RES = 'C:\\Users\\jojoman\\AppData\\Local\\Programs\\DeepSeek Harness\\resources'
  process.argv = ['C:\\...\\DeepSeek Harness.exe', 'undefined']
  process.resourcesPath = RES
  process.versions.electron = '44.0.0'

  check('⭐⭐⭐ 模拟 Electron ⇒ isElectronHost() === true', mod.isElectronHost() === true)

  const dtEntry = mod.resolveDshEntry()
  check('⭐⭐⭐ 桌面版 ⇒ 认出了入口（asar 内路径在 Electron 里可直接用）',
    !('error' in dtEntry), JSON.stringify(dtEntry).slice(0, 200))
  if (!('error' in dtEntry)) {
    // 🔴 坑 ④：**必须选 `dsh-desktop-host/lib/cli.js`** —— 桌面版自己的
    //    `runtime/cli/bin/dsh.cmd` 用的就是它，而且它是唯一
    //    `manageDesktopProfile: true` 的入口（只有它能吃 `--profile desktop`）。
    check('⭐⭐⭐ 桌面版首选 dsh-desktop-host/lib/cli.js（官方 dsh.cmd 同款）',
      /dsh-desktop-host[\\/]lib[\\/]cli\.js$/i.test(dtEntry.bin), dtEntry.bin)
    check('⭐⭐⭐ 桌面版必须带 --expose-internals（官方 dsh.cmd 里就有）',
      dtEntry.args.includes('--expose-internals'), JSON.stringify(dtEntry.args))
    check('⭐⭐ 桌面版 electron=true（决定 spawn 时要不要加 ELECTRON_RUN_AS_NODE）',
      dtEntry.electron === true)
  }
} finally {
  process.argv = realArgv
  // ⚠️ 清理模拟：`delete` 才有意义（赋 undefined 会让属性存在但为 undefined）。
  delete process.resourcesPath
  delete process.versions.electron
}

// ══════════════════════════════════════════════════════════════════════════
// 4. 桌面版的两条硬约束（都是源码级核实过的，不是猜）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【4】桌面版的两条硬约束（核实：DSH / plugin-manager 源码）')

const upgradeSrc = await readFile(join(here, '..', 'src', 'upgrade.ts'), 'utf8')

// ① Electron 的 exe 要 `ELECTRON_RUN_AS_NODE=1` 才变成 node
check('⭐⭐⭐ spawn 时给 Electron 加 ELECTRON_RUN_AS_NODE=1',
  /ELECTRON_RUN_AS_NODE:\s*'1'/.test(upgradeSrc))
// ② desktop profile 必须走 cli.js，否则被 rejectElectronProfile 硬拒
check('⭐⭐⭐ 认出 desktop profile 但入口不是 cli.js ⇒ 明确报错（不白跑）',
  /isDesktopProfile\s*&&\s*!usingDesktopCli/.test(upgradeSrc))
check('⭐⭐ 报错里告诉用户去应用内插件页升级',
  /应用内「插件」页/.test(upgradeSrc))

// ══════════════════════════════════════════════════════════════════════════
// 5. 成败判据：装完要再读一次磁盘（不是看退出码）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【5】成败判据：装完再读磁盘（不信退出码）')

check('⭐⭐⭐ 升级后有 installedVersion() 复核', /const got = installedVersion\(\)/.test(upgradeSrc))
check('⭐⭐ 判据是 got === want（不是 code === 0）',
  /const ok = want !== '' \? got === want/.test(upgradeSrc))
check('⭐⭐ "退出码 0 但版本没变" 要单独说出来（已知失败方式）',
  /退出码 0 但版本没变/.test(upgradeSrc))
check('⭐⭐ 提示用户重启后重试（运行时占着目录）', /重启 DSH.*重试|重启.*后重试/.test(upgradeSrc))

// ══════════════════════════════════════════════════════════════════════════
// 6. 镜像源（用户明确要求：用国内镜像）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【6】镜像源：默认 npmmirror，且检查与升级同一处')

check('⭐⭐⭐ 默认源是 registry.npmmirror.com（用户要求国内镜像）',
  mod.registryMirror() === 'https://registry.npmmirror.com', mod.registryMirror())
check('⭐⭐ 官方源作为兜底', mod.registryOfficial() === 'https://registry.npmjs.org')
check('⭐⭐ 检查更新也是"先镜像后官方"',
  /for \(const base of \[registryMirror\(\), registryOfficial\(\)\]\)/.test(upgradeSrc))
check('⭐⭐ 升级命令用的也是同一个 registryMirror()（两边同源）',
  /const mirror = registryMirror\(\)/.test(upgradeSrc))

// ══════════════════════════════════════════════════════════════════════════
// 7. `/latest` 缓存落后时的补强（bili-scroll 实测踩到的真坑）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【7】/latest 缓存落后：要补查全量 versions')

check('⭐⭐⭐ 有 versionsFrom（补查全量 metadata）', /async function versionsFrom/.test(upgradeSrc))
check('⭐⭐ 只在"看起来没新版"时才补查（省那条大请求）',
  /if \(c <= 0\) \{[\s\S]{0,200}versionsFrom/.test(upgradeSrc))
// ⚠️ 判据落在**真实的控制流**上（`if (list !== null)`），不是落在我的注释文字上 ——
//    我第一版写的是 `/补强|静默保留|list === null/`，那是**凭想象写断言**，
//    源码里根本没有那几个词 ⇒ 假红。⭐ 断言要贴代码，不贴我的记忆。
check('⭐⭐ 补查失败（返回 null）⇒ 走不进那个 if，静默保留原结论',
  /const list = await versionsFrom\([\s\S]{0,80}if \(list !== null\)/.test(upgradeSrc))
check('⭐⭐ 回 latestTagStale 让面板能说清"latest 标签是旧的"',
  /latestTagStale/.test(upgradeSrc))

// ══════════════════════════════════════════════════════════════════════════
// 8. 前端：入口位置与"只在真有新版时出现"
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【8】前端：入口位置 + 不常驻')

const appSrc = await readFile(join(here, '..', 'src', 'web', 'app.js'), 'utf8')
const htmlSrc = await readFile(join(here, '..', 'src', 'web', 'index.html'), 'utf8')

check('⭐⭐⭐ 入口在头部基础信息右边（#upd-slot 紧跟 #stat）',
  /<span class="stat" id="stat"><\/span>[\s\S]{0,400}<span class="upd-slot" id="upd-slot">/.test(htmlSrc))
check('⭐⭐⭐ 只在真有新版时才放内容（不常驻"已是最新"）',
  /info\.hasNew !== true\) return/.test(appSrc))
check('⭐⭐ 没查过（null）⇒ 什么都不显示（不闪"检查中"）',
  /if \(info === null \|\| info\.ok === false \|\| info\.hasNew !== true\) return/.test(appSrc))
check('⭐⭐ 本地比 npm 新时如实说"你比它新"，不谎报有新版',
  /direction === 'ahead'/.test(appSrc))
check('⭐⭐ 升级后轮询进度（不给过程用户会以为没反应）',
  /async function pollUpgrade/.test(appSrc))
check('⭐⭐ 轮询有上限（不无限跑）', /i < 60/.test(appSrc))

// ══════════════════════════════════════════════════════════════════════════
// 9. 路由注册（漏一条就落 SPA 兜底、返回 HTML ⇒ 前端 JSON 解析失败）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n【9】路由注册与 API 接线')

const idxSrc = await readFile(join(here, '..', 'src', 'index.ts'), 'utf8')
for (const r of ['/update', '/upgrade', '/upgrade/status']) {
  check(`⭐ 注册了 ${r}`, idxSrc.includes(`\${API_BASE}${r}\``), r)
}

const apiSrc = await readFile(join(here, '..', 'src', 'api.ts'), 'utf8')
check('⭐ api.ts 有 /update 分支', apiSrc.includes("route === '/update'"))
check('⭐ api.ts 有 /upgrade 分支', apiSrc.includes("route === '/upgrade'"))
check('⭐ api.ts 有 /upgrade/status 分支', apiSrc.includes("route === '/upgrade/status'"))
check('⭐⭐ /upgrade 必须是 POST（升级有副作用）',
  /route === '\/upgrade'[\s\S]{0,120}method !== 'POST'/.test(apiSrc))
check('⭐⭐ 缺 version 时 400（不带版本号 pnpm 什么都不做）',
  /缺少 version/.test(apiSrc))

console.log(`\n═══ 面板内升级：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
