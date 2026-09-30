/**
 * ⭐⭐ **网页脚本的语法体检**（`src/web/app.js`）。
 *
 * ── 为什么必须有这一套（2026-09-26 实测踩到的真事故）────────────────────────
 *    我给设置面板加一组控件时，在 `saveSettings()` 里**多写了一个 `}`**
 *    ⇒ 该函数被提前闭合 ⇒ 后面的 `await` 落在**函数外**
 *    ⇒ 整个 `app.js` **语法错误、一个字节都不执行**
 *    ⇒ 现象：页面能打开、**控件都在**（HTML 是静态的）、
 *      但点 ⚙ **毫无反应**、所有控件都是空的、保存也不работа。
 *
 * 🔴🔴 **为什么现有的四套测试一条都没抓到**：
 *    · `pnpm run typecheck` 只查 **TypeScript**（`src/*.ts`、`src/client/*.tsx`），
 *      `src/web/app.js` 是**纯 JS**，**根本不进 tsc**；
 *    · `web-api` 那套测的是**服务端**路由，不加载前端脚本；
 *    · `probe-client` 那套测的是 `lib/client.js`（另一份 bundle），也不碰它；
 *    · HTML 里的控件是静态的 ⇒ "元素存在"的断言**照样全绿**。
 *    ⇒ ⭐ 也就是说：**"页面坏了"这件事当时没有任何自动化能发现**，
 *      我是靠 CDP 真点一下才看见的。
 * ⚠️ 本项目铁律：**改完前端必须真在浏览器里看一眼** —— 这一套就是那道闸门的自动化版本。
 *
 * 做法：用 `node --check` 做**真实语法解析**（不是猜、不是正则）。
 *  ⚠️ 顺带查一遍 `lib/web/app.js`：**跑起来的是它**（构建产物），
 *    若它没跟上 `src/`，改了也没用。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

let pass = 0, fail = 0
const check = (n, c, e = '') => {
  if (c) { pass++; console.log(`  ✅ ${n}`) }
  else { fail++; console.log(`  ❌ ${n}${e ? ' — ' + e : ''}`) }
}

/** 用 Node 自己解析一遍（`.js` 当 CommonJS 解析不出 ESM 的 `import` ⇒ 用 --input-type=module 走 stdin）。 */
function syntaxOk(path) {
  try {
    // 🔴 `node --check` 对 `.js` 按 CommonJS 解析，而 app.js 里有顶层 `import`
    //    （它是 `<script type="module">`）⇒ 直接 `--check` 会**误报**语法错。
    //    ⇒ 用 `--input-type=module` + stdin 让它按模块解析（等价于浏览器里的行为）。
    execFileSync(process.execPath, ['--input-type=module', '--check'], {
      input: readFileSync(path, 'utf8'),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { ok: true, err: '' }
  } catch (e) {
    const err = String(e.stderr ?? e.message ?? '')
    return { ok: false, err: err.split('\n').slice(0, 6).join(' | ') }
  }
}

console.log('【1】src/web/app.js 语法')
const srcPath = join(ROOT, 'src', 'web', 'app.js')
check('文件存在', existsSync(srcPath))
const srcRes = syntaxOk(srcPath)
check('⭐⭐ 能通过**真实的语法解析**（解析失败 ⇒ 整个页面一个字节都不执行）',
  srcRes.ok, srcRes.err)

console.log('\n【2】lib/web/app.js（跑起来的是这一份）')
const libPath = join(ROOT, 'lib', 'web', 'app.js')
check('文件存在', existsSync(libPath))
if (existsSync(libPath)) {
  const libRes = syntaxOk(libPath)
  check('⭐ lib 那份也能通过语法解析', libRes.ok, libRes.err)
  // ⭐ 构建产物必须与源码同步（不同步 ⇒ 改了没生效，而人会以为"改了"）
  const same = readFileSync(srcPath, 'utf8') === readFileSync(libPath, 'utf8')
  check('⭐⭐ lib/web/app.js 与 src/web/app.js **逐字节相同**（不同步 ⇒ 改了没生效）',
    same, same ? '' : '构建产物落后于源码 —— 跑 `pnpm run build`')
}

console.log('\n【3】`await` 必须都在 async 上下文里（本次事故的直接形态）')
{
  // ⚠️ 语法解析已经能挡住"函数外 await"（因为那在公司里是合法 ESM！
  //    顶层 await 在 module 里**是合法语法**）⇒ 语法检查**挡不住这一种**。
  //    🔴 本次事故恰恰如此：那个 `await` 落在**模块顶层**（多了一个 `}`
  //      把函数提前闭合），而 ESM 顶层 await **语法合法** ⇒ 解析通过。
  //    ⭐ 所以这里要有**第二道、针对本事故**的检查：
  //      对每个 `export function`/`async function` 之外的 `await` 报出来。
  const code = readFileSync(srcPath, 'utf8')
  // 只做**极保守**的判断：找"行首缩进为 0 的 await"（模块顶层）——
  // app.js 没有任何顶层 await 的正当理由（它的 init 都是 DOMContentLoaded 之后跑的）。
  const lines = code.split(/\r?\n/)
  const topLevelAwait = []
  lines.forEach((l, i) => {
    if (/^await\s/.test(l)) topLevelAwait.push(i + 1)
  })
  check('⭐⭐ 反证：没有**模块顶层**的 `await`（本次事故就是它 —— 多一个 `}` 把函数提前闭合）',
    topLevelAwait.length === 0, `第 ${topLevelAwait.join(',')} 行`)
}

console.log(`\n网页脚本语法体检：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
