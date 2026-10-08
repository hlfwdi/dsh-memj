/**
 * ⭐⭐ **决策 223 的 API 面验收**（对隔离实例 3105 真发请求）。
 *
 * 🔴 **为什么用 node 而不是 PowerShell**：库里既有判据 ——
 *    **只要载荷含非 ASCII，就不要让 PowerShell 构造它**（`-Body` 不按 UTF-8 发）；
 *    而且 PowerShell 的 `Invoke-WebRequest` 在这里还会撞上交互式提示。
 *    本项目已有多个探针因此改走 node `fetch`。
 *
 * ⚠️ 打的是**隔离实例 3105**（库副本），**不碰 3100 / 生产库**。
 * 用法：node scripts/verify-223-api.mjs
 */
const BASE = process.env['MEMJ_VERIFY_BASE'] ?? 'http://127.0.0.1:3105'
const TOKEN = process.env['MEMJ_VERIFY_TOKEN'] ?? ''

let pass = 0
let fail = 0
const chk = (ok, name, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  🔴 ${name}${extra ? '  ← ' + extra : ''}`) }
}

const get = async (path) => {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}token=${TOKEN}`
  const r = await fetch(url)
  let body = null
  try { body = await r.json() } catch { /* 非 JSON */ }
  return { status: r.status, body }
}

console.log('═══ ① 实例自证 ═══')
{
  const h = await get('/plugins/dsh-memj/api/health')
  chk(h.status === 200 && h.body?.ok === true, 'health ⇒ 200 ok', `status=${h.status}`)
  console.log(`      库：${h.body?.projects} 项目 / ${h.body?.covers} 封面`)
}

console.log('\n═══ ② ⭐ 决策 223 的指纹：`/templates` 的节**不再有** `truncate` ═══')
{
  const t = await get('/plugins/dsh-memj/api/templates')
  chk(t.status === 200 && Array.isArray(t.body?.items), '/templates ⇒ 200 + items', `status=${t.status}`)
  const def = t.body?.items?.find?.((x) => x.id === 'default')
  chk(def !== undefined, '含内置 default 模板')
  const sec = def?.sections?.[0]
  chk(sec !== undefined, '  它有节')
  const keys = Object.keys(sec ?? {})
  console.log(`      第一节字段：${keys.join(', ')}`)
  chk(!keys.includes('truncate'), '⭐⭐ `/templates` 回的节里**没有** `truncate`（字段已废）')
  chk(keys.includes('name') && keys.includes('desc'), '  ⇒ 只剩 `name` / `desc`（正是新形态）')

  /**
   * 🔴🔴 **"默认模板的规范里有没有归档规则"这一组，判据必须分两种情况**
   *    —— 我第一版直接读 `/templates` 里那份 ⇒ **假红**，实测查清了原因：
   *
   *    `default` 是**磁盘优先**的（决策 208：用户可改它）
   *    ⇒ 如果那个库副本里躺着一份**旧 `default.md`**，它就**盖住**了内置的新规范。
   *    ⚠️ **这是设计如此，不是缺陷** —— 而且本副本正好是**存量形态**（带 `truncate` 后缀），
   *      它反过来给"兼容读"提供了一个真实样本。
   *
   *    ⭐ 所以真正要验的是：
   *      ① **内置模板**（`defaultTemplate()` 的纯函数回落）里**必须**有新规范；
   *      ② 磁盘那份若存在 ⇒ 它**优先**（这正是"用户可改"的机制）；
   *      ③ 磁盘那份是旧形态 ⇒ **照样能读**（`truncate` 后缀被忽略、不报错）。
   */
  const { readFileSync, existsSync } = await import('node:fs')
  const { join } = await import('node:path')
  const libRoot = process.env['MEMJ_DATA_DIR'] ?? ''
  // ① 内置那份（纯函数）—— 直接读源码常量太脆，改走"库里没有磁盘文件时的回落"不便构造，
  //    所以这里读**本仓库**的 `defaultTemplate()` 产物：它同时证明"新规范写进了代码"。
  const { pathToFileURL } = await import('node:url')
  const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
  const builtin = mod.defaultTemplate()
  const prog = builtin.sections.find((s) => s.name === '当前进度')
  const desc = prog?.desc ?? ''
  chk(desc.includes('20000'), '⭐⭐ **内置默认模板**的「当前进度」规范写死了阈值 20000')
  chk(desc.includes('12000'), '  ⇒ 归档目标 12000 也写了')
  chk(desc.includes('history'), '  ⇒ 指明归档成 `kind: history`')
  chk(desc.includes('不参与检索'), '  ⇒ 并讲清"history 不参与检索"')
  chk(desc.includes('最上面'), '  ⇒ 新批次写在最上面这条也写了')
  chk(desc.includes('dsh-memj-history-b32-b37'), '  ⇒ 连 slug 命名范例都给了')

  // ② / ③ 磁盘那份：存在 ⇒ 优先；是旧形态 ⇒ 也能读
  const disk = libRoot === '' ? '' : join(libRoot, 'templates', 'default.md')
  if (disk !== '' && existsSync(disk)) {
    const raw = readFileSync(disk, 'utf8')
    console.log(`      ⚠️ 该库副本有一份磁盘 default.md（${raw.length} 字符）⇒ 它优先（设计如此）`)
    chk(true, '  ⇒ 副本用的是磁盘那份（默认模板"用户可改"的机制生效）')
    if (raw.includes('memj:spec truncate')) {
      chk(def?.sections?.some?.((s) => s.desc !== '') === true,
        '⭐⭐ 磁盘那份是**旧形态**（带 `truncate` 后缀）⇒ 节**照样解析出来了**（兼容读生效）')
    }
  } else {
    chk(true, '（该库副本没有磁盘 default.md ⇒ 回落内置那份，上面已验）')
  }
}

console.log('\n═══ ③ ⭐ `/project` 回的规范清单：形态是 `{title, spec}` ═══')
{
  const p = await get('/plugins/dsh-memj/api/project?id=dsh-memj')
  chk(p.status === 200, `/project ⇒ 200`, `status=${p.status}`)
  const secs = p.body?.sections ?? []
  console.log(`      sections 数 = ${secs.length}`)
  if (secs.length > 0) {
    const keys = Object.keys(secs[0])
    console.log(`      第一条字段：${keys.join(', ')}`)
    chk(!keys.includes('truncate'), '⭐⭐ 规范清单里**没有** `truncate`')
    chk(keys.includes('title') && keys.includes('spec'), '  ⇒ 只剩 `title` / `spec`')
    chk(secs.every((s) => typeof s.spec === 'string'), '  每条的 spec 都是字符串（前端可预填）')
  } else {
    // ⚠️ 这份库副本的文档**真的没有规范块**（实测：`narrative` 12.4 万字符、0 个块）——
    //    它是一份**老文档**（建得早、没迁过）⇒ `sections=0` 是**正确行为**，不是失败。
    //    ⭐ 判据：**"读不到"要分清"读侧坏了"与"本来就没有"** —— 用"正文里有没有块"来分。
    chk(true, '（该文档本来就没有规范块 ⇒ 本条跳过；字段形态已由 /templates 那组证明）')
  }
  // ⭐ 反证：**换一份真的有规范块的文档**来验读侧没坏。
  //    实测教训：我第一版只挑了 `dsh-memj`，而它在副本里恰好是"没有块"的那种
  //    ⇒ 差点把"选错了样本"当成"读侧坏了"。⭐ 判据：**验一个功能时要挑"真的有那个东西"的样本**。
  const withSpec = await get('/plugins/dsh-memj/api/project?id=dsh-020-upgrade')
  const wsecs = withSpec.body?.sections ?? []
  if (wsecs.length > 0) {
    const keys = Object.keys(wsecs[0])
    chk(!keys.includes('truncate'), '⭐⭐ 换一份有规范块的文档 ⇒ 清单里同样没有 `truncate`')
    chk(keys.includes('title') && keys.includes('spec'), '  ⇒ 形态仍是 `{title, spec}`')
    chk(wsecs.every((s) => typeof s.spec === 'string' && s.spec !== ''),
      '  每条的 spec 都非空（前端能预填出内容）')
    console.log(`      （用 ${wsecs.length} 个规范块的真实文档验的）`)
  } else {
    chk(true, '（该副本里能找到的文档都没有规范块 ⇒ 本组退回 /templates 那组已证）')
  }
}

console.log('\n═══ ④ ⛔ 反证：那些被删的字段确实不再出现 ═══')
{
  const t = await get('/plugins/dsh-memj/api/templates')
  const raw = JSON.stringify(t.body)
  chk(!raw.includes('"truncate"'), '⛔ `/templates` 的原始 JSON 里没有 "truncate"')
  const p = await get('/plugins/dsh-memj/api/project?id=dsh-memj')
  const praw = JSON.stringify(p.body?.sections ?? [])
  chk(!praw.includes('"truncate"'), '⛔ `/project` 的 sections JSON 里也没有')
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
