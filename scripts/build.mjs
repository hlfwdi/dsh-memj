/**
 * 一键构建：**先 tsdown（跑满两个条目），再拷网页资源，最后自检产物**。
 *
 * 🔴🔴 **为什么需要这个脚本**（实测踩过两次，第二次才查清真因）：
 *
 * **坑 A：`tsdown` 是"两个条目"，必须在同一个进程里跑完。**
 *   `tsdown.config.ts` 导出的是**数组**（host 条目 + client 条目）⇒ 会打印**两次**
 *   `Build complete`。若用管道截断输出（例如
 *   `node .../tsdown/dist/run.mjs | Select-Object -First 1`），
 *   **收到第一条后管道关闭 ⇒ 上游进程被杀** ⇒ 第二条没跑完，
 *   `lib/` 里**只剩 `client.js`**（host 的产物被 `clean: true` 清掉、又没重建完）。
 *   ⚠️ 我两次都误判成"构建顺序"或"copy-web 不重建 JS"——**真因是管道杀进程**。
 *
 * **坑 B：host 条目配了 `clean: true`。**
 *   ⇒ 每次构建**先清空 `lib/`**，所以网页资源（`src/web/` → `lib/web/`）
 *   **必须在构建之后**拷回，否则会被清掉。
 *
 * ⇒ 这两条都被这个脚本固化：**顺序写死 + 产物自检**，不靠"记得别写错命令行"。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const lib = join(root, 'lib')

/** 跑一条命令；**不截断它的输出**（截断会杀掉 tsdown 的第二个条目）。 */
function run(label, cmd, args) {
  console.log(`\n▶ ${label}`)
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`\n❌ ${label} 失败（exit ${r.status}）`)
    process.exit(1)
  }
}

// ── ① 构建（两个条目都必须跑完）─────────────────────────────────────────────
run('tsdown（host + client 两个条目）', process.execPath, [
  join(root, 'node_modules', 'tsdown', 'dist', 'run.mjs'),
])
// ── ② 拷网页资源（必须在构建之后：clean: true 会清空 lib/）─────────────────
run('copy-web（src/web → lib/web）', process.execPath, [join(here, 'copy-web.mjs')])

// ── ③ 自检：产物完整性（把"静默半成品"变成"硬失败"）────────────────────────
const REQUIRED = ['index.js', 'index.d.ts', 'client.js', 'offline-bundle.js']
const missing = REQUIRED.filter((f) => !existsSync(join(lib, f)))
if (missing.length > 0) {
  console.error(
    `\n❌ 构建产物不完整，缺少：${missing.join(', ')}\n` +
      '   ⚠️ 若只有 client.js，多半是 tsdown 被**中途杀掉**（例如管道被截断）。\n' +
      '   ⇒ 用本脚本构建，别自己拼命令行。',
  )
  process.exit(1)
}
if (!existsSync(join(lib, 'web', 'app.js'))) {
  console.error('\n❌ 网页资源没拷进来（lib/web/app.js 不存在）——构建顺序是否颠倒？')
  process.exit(1)
}

const jsCount = readdirSync(lib).filter((f) => f.endsWith('.js')).length
console.log(
  `\n✅ 构建完成且自检通过：lib/ 有 ${jsCount} 个 .js（含 web/ 资源）\n` +
    '   ⚠️ **改了代码后要让运行中的实例生效，必须重启那个实例**——' +
    '实例在启动时就 import 完了，构建不会热更新它。',
)
