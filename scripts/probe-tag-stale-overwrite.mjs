/**
 * Probe: is the stale GET echo DISPLAY-ONLY, or does it really lose the value?
 *
 * Sequence a user actually performs:
 *   1. GET /settings          (panel opens, old value O)
 *   2. POST { tag = X }       (user picks X, clicks save)   -> disk = X
 *   3. GET /settings          (panel refreshes)             -> stale echo O
 *   4. POST { tag = O }       (user saves again, or any other page save
 *                              that re-submits the re-filled control) -> disk = O
 *
 * Step 4 is the data loss. This probe prints the on-disk value after each step.
 *
 * Usage: node scripts/probe-tag-stale-overwrite.mjs <baseUrl> <token> <patchPath>
 */
import { readFileSync } from 'node:fs'

const [base, token, patchPath] = process.argv.slice(2)
if (!base || !token || !patchPath) {
  console.error('usage: node scripts/probe-tag-stale-overwrite.mjs <baseUrl> <token> <patchPath>')
  process.exit(2)
}

const H = { 'Content-Type': 'application/json', Cookie: `dsh_token=${token}` }
const disk = () => {
  const t = readFileSync(patchPath, 'utf8')
  const p = /tagNormalizeProvider:\s*(.*)/.exec(t)?.[1]?.trim()
  const m = /tagNormalizeModel:\s*(.*)/.exec(t)?.[1]?.trim()
  return `${p} / ${m}`
}
const api = async () => {
  const r = await fetch(`${base}/plugins/dsh-memj/api/settings`, { headers: H, cache: 'no-store' })
  const j = await r.json()
  return `${j.tagNormalizeProvider} / ${j.tagNormalizeModel}`
}
const post = async (body) => {
  const r = await fetch(`${base}/plugins/dsh-memj/api/settings`, {
    method: 'POST', headers: H, body: JSON.stringify(body),
  })
  return r.status
}

console.log('step 0  disk =', disk())

// 1. panel opens
const O = await api()
console.log('step 1  GET (panel shows) =', O, '   <- O 记下来')

// 2. user picks X and saves
const X = { tagNormalizeProvider: 'user-pick', tagNormalizeModel: 'user-pick-model' }
console.log('step 2  POST', X.tagNormalizeProvider, '=>', await post(X), '  disk =', disk())

// 3. panel refreshes immediately
const back = await api()
console.log('step 3  GET after save =', back, '   <- 面板把控件重新填成这个')

// 4. user saves again (or saves another page) => stale value goes back to disk
console.log('step 4  POST (stale echo) =>', await post({ tagNormalizeProvider: back.split('/')[0].trim(), tagNormalizeModel: back.split('/')[1].trim() }), '  disk =', disk())
console.log()
console.log('=> 若 step 4 的 disk 不再是 user-pick ⇒ **数据真的被写回去了**（不是显示问题）')
