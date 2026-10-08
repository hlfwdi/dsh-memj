/**
 * ⭐⭐⭐ **按"先设置页、再固化写回"的流程落这三条提示词**（决策 221）。
 *
 * 🔴🔴 **为什么必须是 node、不能用 PowerShell**（本次真实事故换来的）：
 *    我第一版用 `Invoke-WebRequest -Body <含中文的 JSON 字符串>`，
 *    而 PowerShell 的 `-Body`(string) **不是按 UTF-8 发的** ⇒ 中文在**发出之前**
 *    就变成了 `?` ⇒ 插件忠实写入收到的内容 ⇒
 *    **三条提示词的中文全被写成 `????`**（覆盖层被污染、源码被固化污染）。
 *    ⚠️ 库里的既有知识早就警告过这类事（"DSH 会话里做 HTTP 探针要用 node 而不是 PowerShell"）。
 *    ⭐ 判据：**只要载荷含非 ASCII，就不要让 PowerShell 构造它。**
 *
 * 用法：node scripts/apply-section-spec-prompts.mjs [port]
 *   ⚠️ 它做的是"运维动作"（改库里的覆盖层 + 固化源码），**不进 run-all-tests**。
 */
const PORT = Number(process.argv[2] ?? 3107)
const API = `http://127.0.0.1:${PORT}/plugins/dsh-memj/api`

/** 三条要落的提示词（与源码常量逐字一致）。 */
const PROMPTS = {
  'reads:section-spec-head':
    '📐 **本文档各节的写作规范**（逐节对照——写之前先看有没有哪一节已经不符合它自己的规范）：',
  'reads:section-spec-closing':
    '⚠️ 上面每一条都取自**这份文档自己的正文**（不是通用清单）。' +
    '若某节的内容已经明显不符合它自己的规范，**顺手整理它**——' +
    '「没写某一节」只能靠这一眼发现，工具不会替你检查。',
  'reads:snapshot-closing':
    '🔴 **逐条判断"它确实和本次要落盘的项目相关吗"**——读了不等于用上了；' +
    '不相关的要排除，否则会拿无关知识去凑主题证据。',
}

const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

console.log('【1】设置页保存（= 页面上点保存那条通道）')
for (const [key, text] of Object.entries(PROMPTS)) {
  const r = await post('/prompt/save', { key, text })
  console.log(`  ${r.status === 200 && r.body.ok ? '✅' : '🔴'} ${key} ⇒ ${r.status} ${JSON.stringify(r.body)}`)
}

console.log('\n【2】回读校验：**每条都必须是中文、且与源码常量逐字一致**')
// 🔴 **回读要走 `/prompt?key=`**（它才有 `current`）——
//    我第一版读的是列表 `/prompts` 的 `item.text`，而那个字段**根本不存在**
//    ⇒ 每条都读到空串 ⇒ 三条全报"污染"（**假警报**，白拦下一次固化）。
//    ⭐ 判据：**先打印实际结构再写断言**（本项目已记过"字段路径读错"这条）。
let bad = 0
for (const [key, want] of Object.entries(PROMPTS)) {
  const res = await fetch(`${API}/prompt?key=${encodeURIComponent(key)}`)
  const got = ((await res.json()).current ?? '')
  // ⭐ 判据：既比"等于期望值"，也**独立地查"有没有变成问号"**——
  //    只比相等会在"期望值本身也被污染"时全绿（那种假绿正是本次要防的）。
  const hasCJK = /[\u4e00-\u9fa5]/.test(got)
  const noMojibake = !got.includes('??')
  const ok = got === want && hasCJK && noMojibake
  if (!ok) bad += 1
  console.log(`  ${ok ? '✅' : '🔴'} ${key}：${got.length} 字符｜含中文=${hasCJK}｜无??=${noMojibake}`)
  if (!ok) console.log(`      实际：${got.slice(0, 80)}`)
}

console.log('\n【3】固化写回源码（= 页面上点"写回"那条通道）')
if (bad > 0) {
  console.log('  🔴 上面有污染 ⇒ **拒绝固化**（否则会把问号写进源码，本次已因此栽过一次）')
  process.exit(1)
}
const wb = await post('/prompt/writeback', { keys: Object.keys(PROMPTS) })
console.log(`  ${wb.status === 200 ? '✅' : '🔴'} ${JSON.stringify(wb.body.summary ?? wb.body)}`)
for (const it of wb.body.items ?? []) {
  console.log(`      ${it.status === 'written' || it.status === 'already-same' ? '✅' : '🔴'} ${it.key}｜${it.constName}｜${it.message}`)
}
process.exit(wb.body.ok === true ? 0 : 1)
