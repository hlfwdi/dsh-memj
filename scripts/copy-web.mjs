/**
 * 把 `src/web/` 的网页资源拷进 `lib/web/`。
 *
 * 🔴 **为什么必须构建后拷贝**：host 条目的 tsdown 配了 `clean: true`，
 * 每次构建都会清空 `lib/`——手放在 `lib/web/` 里的资源会被删掉。
 * 所以资源源放 `src/web/`，构建后由本脚本拷回。
 *
 * ⚠️ `import.meta.url` 在 `link:` 安装下解析到**真实源码路径**，
 * 所以产物目录就是资源目录（`lib/web/`）。
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const from = join(root, 'src', 'web')
const to = join(root, 'lib', 'web')

if (!existsSync(from)) {
  console.error(`源目录不存在: ${from}`)
  process.exit(1)
}
mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
console.log(`已拷贝网页资源: ${from} -> ${to}`)
