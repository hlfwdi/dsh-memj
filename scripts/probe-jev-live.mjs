/**
 * JEV 通路**真实连通测试**（**真发一次最小请求**）。
 *
 * 🔴 为什么必须用 Node `fetch`：PowerShell / curl.exe 会 `SEC_E_NO_CREDENTIALS`
 *    （库内 `30025915` 记过）。
 * ⚠️ 绝不打印 key 本身（只打印长度）。
 *
 * ⭐ **它本来就该对着【生产凭据】跑** —— 目的是回答"这台机器上的 JEV 到底通不通"，
 *    用副本/假凭据就答不了这个问题。⚠️ 它**只读**（念一次凭据、发一次请求）。
 *
 * 🔴 **路径不写死**：默认按**脚本自身位置**推导
 *    （`<部署根>/workplaces/<会话>/adapt-memj/scripts/` ⇒ 上溯四级到 `<部署根>/home/`，
 *    与 `start-020rc2.ps1` 的 `$HOME_DIR = Join-Path $ROOT 'home'` 同一个目录）。
 *    写死 `D:\dsh-standalone-...\home\...` 会让它换机器 / 换部署根时**静默走错**：
 *    报的是"凭据文件里没有 KNOX_API_KEY"，而真原因是**路径不对**
 *    ⇒ 与「搜不到不等于不存在」同族（得换第二种查法才能把"没有"与"找错地方"分开）。
 * ⭐ 可用 `MEMJ_CREDENTIALS=<文件>` 显式覆盖（例如指向隔离实例的凭据文件）。
 *
 * 用法：node scripts/probe-jev-live.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * 找凭据文件（**按顺序试，第一个存在的就用**）。
 * ⚠️ 顺序有意义：显式覆盖 → 本部署根（生产那套）→ `~/.dsh`（另一套 home）。
 */
function findCredentials() {
  const explicit = process.env['MEMJ_CREDENTIALS']
  if (explicit !== undefined && explicit !== '') return explicit
  return [
    // `<部署根>/home/.credentials.yaml`（本机生产那套；由脚本位置上溯四级）
    join(HERE, '..', '..', '..', '..', 'home', '.credentials.yaml'),
    // `~/.dsh/.credentials.yaml`（另一套 home —— ⚠️ 但本机 **KNOX_API_KEY 不在这里**）
    join(homedir(), '.dsh', '.credentials.yaml'),
  ].find((p) => existsSync(p)) ?? ''
}

const CRED = findCredentials()
if (CRED === '') {
  console.error('找不到凭据文件 —— 用 MEMJ_CREDENTIALS=<路径> 显式指定一个。')
  process.exit(2)
}
// ⭐ **自证**：把实际读的文件打出来（否则"念的哪一份"无法从输出判断）。
console.log(`[凭据] ${CRED}`)
// ⚠️ **读失败要说清是"读不到"还是"里面没有那个键"** ——
//    这两件事表现很像（都导致"取不到凭据"），但下一步动作完全不同
//    （改路径 vs 去配密钥）。本项目已记过「**报错把多类原因压成一句会让排障靠猜**」。
let text
try {
  text = readFileSync(CRED, 'utf8')
} catch (e) {
  console.error(`读不到凭据文件（路径是否写对了？）：${CRED}`)
  console.error(`  ${e.code ?? ''} ${e.message}`)
  process.exit(2)
}
const m = /^\s*KNOX_API_KEY:\s*(\S+)\s*$/m.exec(text)
if (!m) {
  // ⚠️ 这里**是"文件在、但没这个键"**（与上面那条是两回事）。
  console.error(`凭据文件里没有 KNOX_API_KEY：${CRED}`)
  process.exit(2)
}
const key = m[1]
console.log(`KNOX_API_KEY 已读到（长度 ${key.length}，不打印内容）`)

const ENDPOINT = 'https://api.knox.chat/v1/systemone'
const t0 = Date.now()
try {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'jev-latest',
      state: { probe: 'connectivity test from memj diagnostics' },
      questions: { q0: { type: 'noul', instructions: 'Is this a connectivity test?' } },
    }),
  })
  const ms = Date.now() - t0
  console.log(`HTTP ${res.status}  耗时 ${ms}ms`)
  const txt = await res.text()
  console.log('响应（前 600 字）:', txt.slice(0, 600))
  process.exit(res.ok ? 0 : 1)
} catch (e) {
  console.log(`请求异常（${Date.now() - t0}ms）: ${e.message}`)
  process.exit(1)
}
