/**
 * 验证 `projectDrift` 判据修复（**只读**：只调 `checkIndex`，不重建、不写盘）。
 *
 * 🔴 判据：修前恒为 2（两个已归档项目被误判），修后应为 0。
 * ⭐⭐ **本脚本就该对着【生产库】跑** —— 那两个"已归档项目"**只存在于生产库里**
 *    （空库/副本里验不到这条判据）。⚠️ 它**只读**（`checkIndex` 不写任何文件）、
 *    且**不调** `checkAndRepair`（那才会重建/花钱）⇒ 这不是"探针跑在生产上"那种违规。
 *    🔴 与 `probe-hot-scope.mjs` 那类**写入型**探针的区别就在这里：那个必须用库副本。
 *
 * 🔴 **路径不写死**，按本项目自己的规则派生（见 `src/paths.ts`）：
 *    库根 = `MEMJ_DATA_DIR` → `~/.dsh-memj`（`homedir()`）。
 *    ⚠️ 写死 `C:\Users\<用户名>\.dsh-memj` 会让它在**换机器 / 换用户**时静默走错地方
 *    （报"没有那个项目"，而真原因是路径不对 ⇒ 与「搜不到不等于不存在」同族）。
 *
 * 用法：node scripts/probe-index-projectdrift.mjs
 * ⭐ 也可显式指定：`MEMJ_DATA_DIR=<副本> node scripts/probe-index-projectdrift.mjs`
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

// ⭐ **派生库根**（与 `src/paths.ts` 同一条规则：`MEMJ_DATA_DIR` → `~/.dsh-memj`）。
//    ⚠️ 用 `??=` 而不是 `=`：调用方显式指定副本时**尊重它**（本脚本虽以生产为默认，
//       但"能不能换库"这件事必须由调用方说了算）。
process.env['MEMJ_DATA_DIR'] ??= join(homedir(), '.dsh-memj')
const LIB_ROOT = process.env['MEMJ_DATA_DIR']
// ⭐ **自证**：把实际用的库根打出来 —— 否则"它到底看的哪个库"无法从输出判断
//    （本项目铁律：探针动手前先自证路径）。
console.log(`[库根] ${LIB_ROOT}（只读体检）`)

const lib = await import('file://' + join(ROOT, 'lib', 'index.js').replace(/\\/g, '/'))
const { checkIndex, DEFAULT_CONFIG } = lib
if (typeof checkIndex !== 'function') {
  console.error('lib 里没有导出 checkIndex —— 换一种查法（见「搜不到不等于不存在」）')
  process.exit(2)
}

// `checkIndex` 要 ctx（只为 resolveRoute 读 llm）；给个最小桩：拿不到路由 ⇒ route='' 不影响本项目漂移判据
const ctx = { get: () => undefined }
const h = await checkIndex({ ctx, config: DEFAULT_CONFIG })

console.log('=== checkIndex 结果（生产库，只读）===')
for (const k of ['indexed', 'visible', 'ghost', 'absent', 'untranslated', 'staleHash', 'leaked', 'metaDrift', 'projectDrift']) {
  console.log(`  ${k.padEnd(14)} = ${h[k]}`)
}
console.log(`  needsRepair    = ${h.needsRepair}`)
console.log(`  problems       = ${JSON.stringify(h.problems)}`)
console.log()
console.log(h.projectDrift === 0
  ? '=> ✅ projectDrift 已归零（不再把归档项目误判成漂移）'
  : `=> ❌ projectDrift 仍为 ${h.projectDrift}`)

// 顺带证明"那两条确实是已归档项目"（复现判据的依据）
// ⚠️ 用上面那个**派生出来的**库根，别再写死一份。
const dir = join(LIB_ROOT, 'projects')
for (const name of ['hindsight-research', 'qoder2api']) {
  try {
    const t = readFileSync(join(dir, `HANDOFF-${name}.md`), 'utf8')
    const fm = t.split('---')[1] ?? ''
    console.log(`  ${name}: archivedAt = ${(/^archivedAt:\s*(.+)$/m.exec(fm) ?? [])[1] ?? '(无)'}`)
  } catch { /* 不存在就算了 */ }
}
process.exit(h.projectDrift === 0 ? 0 : 1)
