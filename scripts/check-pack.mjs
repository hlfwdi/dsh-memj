/**
 * 发布前闸门：**tarball 里必须真的有东西**。
 *
 * 🔴🔴 **为什么需要它（2026-10-09 实测发现）**：
 * `lib/` 是**构建产物**，因此被 `.gitignore` 排除（它含内容哈希 chunk、每次构建换名字）。
 * ⚠️ 但 `package.json` 的 `files` 又**必须**列它（它就是运行时入口）。
 * ⇒ 这两条本身没错，**错在它们之间没有任何守卫**：
 *
 *   在**刚从 git 克隆出来的仓库**里跑 `npm pack` / `npm publish`，
 *   打出来的是**一个 10.3 KB 的废包**——只有 `LICENSE` / `README.md` /
 *   `cordis.patch.yml` / `package.json` 四个文件，**没有 `lib/`**。
 *   ⚠️ 而 npm **不会报错**：`files` 里列了不存在的路径，它只是**跳过**。
 *
 * ⇒ 这正是本项目反复记过的那类失败：**"配置在说谎" + 静默**。
 *   真到了 `npm publish` 那一刻，发出去的会是一个**装不起来的空壳**，
 *   而且**从回执上看完全正常**（有 name / version / shasum，一切齐全）。
 *
 * ⭐ 判据（本项目既有）：**"配置写对了"不等于"产物对了"** ——
 *   要断言的是**产物**，不是**配置**。所以这里不看 `files` 字段，直接**实测打包**。
 *
 * ── 它做什么 ────────────────────────────────────────────────────────────
 * ① 跑 `npm pack --dry-run --json`（**只读，不写盘**），拿到真实文件清单；
 * ② 断言 `lib/index.js` 与 `lib/client.js` **都在里面**（少一个就硬失败）；
 * ③ 断言**总文件数 ≥ 10**（一个"只有配置文件的空包"会立刻被这条抓住）。
 *
 * ⚠️ 它挂在 `prepublishOnly` 上，所以 `pnpm publish` / `npm publish` 都会先过它。
 *   它**不替代** `build`：`prepublishOnly` 里先 `build`、再跑本脚本 ——
 *   顺序是"**先造出产物，再断言产物真的被装进去了**"。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

/**
 * 必须在 tarball 里的文件（相对仓库根，npm 用 `/` 分隔）。
 *
 * ⚠️ `README.en.md` 也要列 —— 它是英文版正文，README.md 顶部的语言切换行指着它；
 *    漏发 ⇒ GitHub 上点「English」是 404，而**本地一切正常**（同"两边不一致"那一族）。
 */
const REQUIRED = [
  'lib/index.js',
  'lib/client.js',
  'cordis.patch.yml',
  'README.md',
  'README.en.md',
  'LICENSE',
]

/**
 * **每一份** README 里引用的图片都必须随包发出去。
 *
 * 🔴 **为什么单独断言它**：npm 页面用的是**包内**的 README。
 *   `files` 里漏掉 `docs/` ⇒ README 照发，但**图全裂**（GitHub 上却完全正常，
 *   因为那边读的是仓库）⇒ ⭐ **本地与 GitHub 都看不出问题，只有 npm 读者看得见**。
 *   ⇒ 这正是本项目一贯的判据：**要断言的是产物**，而"两边表现不一致"的地方
 *     必须有一条只有它才能发现的检查。
 *
 * ⚠️ **必须扫全部 README***（不只 README.md）：多语言时，`.en` 那份额外的图
 *   若单独漏发，只有该语言的读者看得见坏图 ⇒ 扫一份等于**给另一份开了后门**。
 */
function readmeImages() {
  const found = []
  for (const name of readmeFiles()) {
    let text
    try {
      text = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
    } catch {
      continue
    }
    for (const m of text.matchAll(/\]\((docs\/[^)]+\.(?:png|jpe?g|webp|gif))\)/gi)) {
      if (!found.includes(m[1])) found.push(m[1])
    }
  }
  return found
}

/** 仓库根下的全部 README*.md（多语言版本会自动纳入检查）。 */
function readmeFiles() {
  return readdirSync(root)
    .filter((n) => /^README(\.[a-z]{2}(-[A-Za-z]{2,4})?)?\.md$/i.test(n))
    .sort()
}

/** 低于这个文件数 ⇒ 一定是"空壳包"（实测正常包是 16 个）。 */
const MIN_FILES = 10

console.log('▶ 发布闸门：实测 tarball 内容（npm pack --dry-run）')

let parsed
try {
  // ⚠️ Windows 上 `npm` 是 `npm.cmd` 批处理 ⇒ `execFileSync('npm', …)` 会 ENOENT。
  //    必须 `shell: true`（代价：多一层 cmd.exe，但这是唯一跨平台稳的写法）。
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  parsed = JSON.parse(out)
} catch (err) {
  console.error(`\n❌ 跑 npm pack --dry-run 失败：${err?.message ?? err}`)
  process.exit(1)
}

const entry = Array.isArray(parsed) ? parsed[0] : parsed
const files = new Set((entry?.files ?? []).map((f) => f.path.replace(/\\/g, '/')))
const total = entry?.entryCount ?? files.size

console.log(`   实测：${total} 个文件 / ${((entry?.size ?? 0) / 1024).toFixed(1)} KB（打包后）`)

// ── ① 必需的几个文件在不在 ────────────────────────────────────────────────
const missing = REQUIRED.filter((f) => !files.has(f))
if (missing.length > 0) {
  console.error(
    `\n❌ tarball 缺少必需文件：${missing.join('、')}\n` +
      '   ⚠️ 最常见的原因：**你在一个还没构建过的仓库里发布**。\n' +
      '      `lib/` 是构建产物、被 `.gitignore` 排除 ⇒ 克隆下来它是空的，\n' +
      '      而 `files` 里列了它、npm 只是**跳过**（不报错）。\n' +
      '   ⇒ 先 `node scripts/build.mjs` 造出 `lib/`，再发布。',
  )
  process.exit(1)
}

// ── ② 文件数下限（抓"只有配置文件的空壳包"）─────────────────────────────
if (total < MIN_FILES) {
  console.error(
    `\n❌ tarball 只有 ${total} 个文件（少于下限 ${MIN_FILES}）—— 这多半是个空壳包。\n` +
      '   实测正常包是 26 个（lib/ 下 10 个产物 + web/3 个 + 根文件 + README 引用的截图）。',
  )
  process.exit(1)
}

// ── ③ README 引用的图片必须真的在包里（否则 npm 页面上图全裂）───────────
const images = readmeImages()
if (images.length > 0) {
  const missingImages = images.filter((f) => !files.has(f))
  if (missingImages.length > 0) {
    console.error(
      `\n❌ README 引用了 ${images.length} 张图，其中 ${missingImages.length} 张**不在 tarball 里**：\n` +
        missingImages.map((f) => `     · ${f}`).join('\n') +
        '\n   ⚠️ npm 页面用的是**包内**的 README ⇒ 这些图在 npm 上是**裂的**，\n' +
        '      而 GitHub 上完全正常（那边读仓库）⇒ **本地与 GitHub 都看不出问题**。\n' +
        '   ⇒ 把 `docs/screenshots` 加进 package.json 的 `files`。',
    )
    process.exit(1)
  }
  console.log(`   README 引用的 ${images.length} 张截图都在包里。`)
}

console.log(`\n✅ 发布闸门通过：${total} 个文件，lib/、网页资源与 README 截图都在包里。`)
