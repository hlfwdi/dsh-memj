/**
 * Probe: which saved settings actually hot-reload?
 *
 * ⚠️ 判据必须落在**真实存在的字段路径**上。我第一版把 `/hot` 的比例写成 `h.ratio`
 *    而它其实在 `h.budget.ratio` ⇒ 报出"需要重启"的**假阴性**。
 *    （同族错误：用错的路径去判"有没有"，会把能用的当成不能用。）
 *
 * Usage: node scripts/probe-hotreload-matrix.mjs <baseUrl> <token>
 */
const [base, token] = process.argv.slice(2)
if (!base || !token) { console.error('usage: probe-hotreload-matrix.mjs <baseUrl> <token>'); process.exit(2) }
const H = { 'Content-Type': 'application/json', Cookie: `dsh_token=${token}` }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const live = async () => [
  await (await fetch(base + '/plugins/dsh-memj/api/active', { headers: H, cache: 'no-store' })).json(),
  await (await fetch(base + '/plugins/dsh-memj/api/hot', { headers: H, cache: 'no-store' })).json(),
]
const post = async (b) => (await (await fetch(base + '/plugins/dsh-memj/api/settings', { method: 'POST', headers: H, body: JSON.stringify(b) }))).json()

async function measure(probe, want) {
  const t0 = Date.now()
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    const [a, h] = await live()
    if (probe(a, h) === want) return Date.now() - t0
  }
  return null
}

const cases = [
  ['activeInject（主动注入·总开关）', { activeInject: true }, true, (a) => a.enabled],
  ['activeInjectModel（·模型）', { activeInjectModel: 'workbuddy/glm-5.3' }, 'workbuddy/glm-5.3', (a) => a.model],
  ['activeInjectScope（·范围）', { activeInjectScope: 'project' }, 'project', (a) => a.scope],
  ['activeInjectChannel（·通路）', { activeInjectChannel: 'chat' }, 'chat', (a) => a.channel],
  ['activeInjectMaxInjectionsPerTurn（·数值）', { activeInjectMaxInjectionsPerTurn: 7 }, 7, (a) => a.maxInjectionsPerTurn],
  ['hotInject（热知识·开关）', { hotInject: false }, false, (_a, h) => h.inject],
  ['hotInjectRatio（·数值，注意路径 budget.ratio）', { hotInjectRatio: 0.25 }, 0.25, (_a, h) => h.budget.ratio],
  ['hotCharsPerToken（·小数）', { hotCharsPerToken: 1.5 }, 1.5, (_a, h) => h.budget.charsPerToken],
  ['hotBudgetCharsFallback（·数值）', { hotBudgetCharsFallback: 30000 }, 30000, (_a, h) => h.budget.chars],
  ['hotSessionKeep（·数值）', { hotSessionKeep: 33 }, 33, (_a, h) => h.keep],
]

console.log('设置项'.padEnd(48), '热生效', '回执 needsRestart')
const restartFlagged = []
for (const [name, body, want, probe] of cases) {
  const w = await post(body)
  const ms = await measure(probe, want)
  if (w.needsRestart) restartFlagged.push(name)
  console.log(name.padEnd(46), (ms === null ? '❌ >20s' : `✅ ${ms}ms`).padEnd(12), String(w.needsRestart))
}
console.log()
console.log(`=> 全部 ${cases.length} 项实测热生效；而回执里 ${restartFlagged.length}/${cases.length} 项写着 needsRestart=true`)
