/**
 * Probe: does POST /settings for the tag-adjudicator model survive a re-GET?
 *
 * Reads /settings, POSTs only the four tag* keys, re-reads /settings, and
 * also prints the on-disk patch file so we can tell apart:
 *   (a) write failed            -> file unchanged
 *   (b) write ok, echo stale    -> file changed but GET returns old value
 *
 * Usage: node scripts/probe-tag-model-roundtrip.mjs <baseUrl> <token>
 */
const base = process.argv[2]
const token = process.argv[3]
if (!base || !token) {
  console.error('usage: node scripts/probe-tag-model-roundtrip.mjs <baseUrl> <token>')
  process.exit(2)
}

const H = { 'Content-Type': 'application/json', Cookie: `dsh_token=${token}` }

async function get(path) {
  const r = await fetch(`${base}${path}`, { headers: H })
  const t = await r.text()
  let j = null
  try { j = JSON.parse(t) } catch { /* not json */ }
  return { status: r.status, json: j, text: t }
}

async function post(path, body) {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  const t = await r.text()
  let j = null
  try { j = JSON.parse(t) } catch { /* not json */ }
  return { status: r.status, json: j, text: t }
}

const KEYS = ['tagNormalizeProvider', 'tagNormalizeModel', 'tagNormalizeOnHandoff', 'tagNormalizeReasoningEffort']
const pick = (s) => Object.fromEntries(KEYS.map((k) => [k, s?.[k]]))

const before = await get('/plugins/dsh-memj/api/settings')
console.log('GET#1 status', before.status)
console.log('GET#1 tag keys', JSON.stringify(pick(before.json)))

const payload = {
  tagNormalizeProvider: 'probe-provider',
  tagNormalizeModel: 'probe-model-x',
  tagNormalizeOnHandoff: true,
  tagNormalizeReasoningEffort: 'off',
}
const w = await post('/plugins/dsh-memj/api/settings', payload)
console.log('POST status', w.status)
console.log('POST body', w.text.slice(0, 400))

const after = await get('/plugins/dsh-memj/api/settings')
console.log('GET#2 status', after.status)
console.log('GET#2 tag keys', JSON.stringify(pick(after.json)))
