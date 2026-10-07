/**
 * Probe: the OTHER half of disk-first echo — keys ABSENT from disk.
 *
 * `effectiveConfig` must be a **merge** (disk explicit over in-process), not a
 * replacement. If it were `{ ...explicit }`, every key the user never wrote would
 * become `undefined` and the panel would show blanks — the user would then "save"
 * those blanks over their real settings.
 *
 * This also covers the fallback-chain keys (`needMinOf` / `itemMinOf` /
 * `maxInjectionsPerTurn`), whose *displayed* value comes from an OLD key.
 *
 * Method: temporarily remove a key from the patch file on disk (the running
 * process keeps it in memory), then GET and check the value is still sane.
 *
 * Usage: node scripts/probe-tag-absent-echo.mjs <baseUrl> <token> <patchPath>
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'

const [base, token, patchPath] = process.argv.slice(2)
if (!base || !token || !patchPath) {
  console.error('usage: node scripts/probe-tag-absent-echo.mjs <baseUrl> <token> <patchPath>')
  process.exit(2)
}
const H = { 'Content-Type': 'application/json', Cookie: `dsh_token=${token}` }
const api = async () => (await (await fetch(`${base}/plugins/dsh-memj/api/settings`, { headers: H, cache: 'no-store' }))).json()

const backup = patchPath + '.probe-absent-bak'
copyFileSync(patchPath, backup)
const original = readFileSync(patchPath, 'utf8')

let failed = false
try {
  const before = await api()
  console.log('移除前： needMin =', before.activeInjectNeedMin, ' itemMin =', before.activeInjectItemMin,
    ' hotSessionKeep =', before.hotSessionKeep)

  // 从磁盘上删掉两个"新键"（进程内那份仍有 —— 它启动时就解析过了）
  const stripped = original
    .split('\n')
    .filter((l) => !/^\s*activeInject(NeedMin|ItemMin):/.test(l))
    .join('\n')
  writeFileSync(patchPath, stripped, 'utf8')
  console.log('已从磁盘删除 activeInjectNeedMin / activeInjectItemMin（进程内那份还在）')

  const after = await api()
  console.log('移除后： needMin =', after.activeInjectNeedMin, ' itemMin =', after.activeInjectItemMin,
    ' hotSessionKeep =', after.hotSessionKeep)

  // 这两个键在磁盘上没了 ⇒ 应回落到进程内那份（0.6 / 0.8），而不是 undefined
  const okFallback = typeof after.activeInjectNeedMin === 'number' && typeof after.activeInjectItemMin === 'number'
  const okOthers = after.hotSessionKeep === before.hotSessionKeep
  console.log()
  console.log(okFallback
    ? '=> ✅ 磁盘上**没有**的键仍回进程内那份（合并语义成立，没退化成"只认磁盘"）'
    : '=> ❌ 键变成了 undefined —— `effectiveConfig` 写成了替换而不是合并')
  console.log(okOthers
    ? '=> ✅ 无关的键不受影响'
    : `=> ❌ 无关的键被改动：${before.hotSessionKeep} -> ${after.hotSessionKeep}`)
  failed = !(okFallback && okOthers)
} finally {
  writeFileSync(patchPath, original, 'utf8')
  console.log('（已还原 patch 文件）')
}
process.exit(failed ? 1 : 0)
