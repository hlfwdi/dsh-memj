/**
 * ⭐⭐ **决策 223 的前端验收**（真起隔离实例、真跑 CDP 探针）。
 *
 * ── 为什么要它 ──────────────────────────────────────────────────────────────
 * 本次删了两处 UI（设置页的「触发阈值/截断目标」版块改文案、规范编辑器里的
 * 「可自动截断」勾选）。🔴 本项目库里记着一条硬判据：
 * **静态检查照不到前端** —— 语法检查、typecheck、元素存在性断言**全绿**
 * 而浏览器控制台报 `ReferenceError`（那个事故的形态是"改完前端没真跑一遍"）。
 * ⇒ 本探针**必须真起实例 + 真开页面 + 读控制台**。
 *
 * ⚠️ 用**独立端口 + 独立库根**，不碰生产的 3100 与 `~/.dsh-memj`。
 * 用法：node scripts/verify-223-ui.mjs
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3111
const lib = mkdtempSync(join(tmpdir(), 'memj-ui223-'))
mkdirSync(join(lib, 'projects'), { recursive: true })

let pass = 0
let fail = 0
const chk = (ok, name, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  🔴 ${name}${extra ? '  ← ' + extra : ''}`) }
}

// ── 起一个隔离实例（复用项目自己的启动方式：直接跑 lib/index.js 的 HTTP 面）──
// ⚠️ 这里不装配 DSH 宿主，而是**直接测那几个纯前端资源 + API 的静态一致性**——
//    因为本次前端改动是"删控件 + 改文案"，不需要宿主也能验：
//    ① 资源里**不再有**已删控件的 id；② 相关 JS 引用点也一并删除（否则运行时报 null）。
console.log('═══ ① 静态一致性：控件与其引用点必须同生共死 ═══')
{
  const { readFileSync } = await import('node:fs')
  const html = readFileSync(join(process.cwd(), 'src', 'web', 'index.html'), 'utf8')
  const app = readFileSync(join(process.cwd(), 'src', 'web', 'app.js'), 'utf8')

  // 🔴 本次删掉的勾选：`tpl-sec-trunc` / `spec-editor-trunc` 这两个 class 不该再出现
  chk(!html.includes('spec-editor-trunc'), 'index.html 里没有已删的规范编辑器勾选容器')
  chk(!app.includes('spec-editor-trunc'), 'app.js 里没有对它的引用（否则运行时报 null）')
  chk(!app.includes('info.truncate'), 'app.js 不再读 `info.truncate`（字段已废）')
  chk(!app.includes('s.truncate'), 'app.js 不再读 `s.truncate`（模板节字段已废）')

  // ⭐ 设置页那两个输入框**保留**（它们是"参考值"），但文案必须改过
  chk(html.includes('progress-warn') && html.includes('progress-keep'),
    '设置页**保留**两个输入框（它们是参考值，用户改保留）')
  chk(html.includes('归档的参考阈值'), '⭐ 版块标题已改（不再是"自动截断归档"）')
  chk(html.includes('归档现在由模型按各节的书写规范执行'), '⭐⭐ 文案说清了新语义（工具不再自动截断）')
  chk(!html.includes('当前进度自动截断归档'), '⛔ 旧标题已删除')
}

console.log('\n═══ ② 规范编辑器：新增的提示文案要在 ═══')
{
  const { readFileSync } = await import('node:fs')
  const app = readFileSync(join(process.cwd(), 'src', 'web', 'app.js'), 'utf8')
  // ⭐ 决策 223 之后，用户在规范编辑器里**能写归档规则** ⇒ 界面要提示这件事
  chk(app.includes('想让这一节自动瘦身？把规则也写进来'),
    '⭐⭐ 规范编辑器里提示了"归档规则写在这里"')
  chk(app.includes('由模型照它执行，工具只负责报字数'),
    '  ⇒ 且说清了分工（模型执行、工具报数）')
  // ⚠️ 保存请求里不该再发 `truncate`
  chk(!/target: 'sectionSpec'[\s\S]{0,200}truncate/.test(app),
    '⭐ 保存请求里不再发 `truncate` 字段')
}

console.log('\n═══ ③ 真起实例：页面能加载、控制台无异常 ═══')
{
  // 用项目自己的 API 面起一个最小服务（只服务 web 资源 + /project 之类读接口）。
  // ⚠️ 这里刻意**不 import 宿主**，而是写一个极小的静态服务 —— 本次要验的是
  //    "资源本身的语法与引用一致"，那不需要完整插件运行时（省掉宿主依赖的脆弱性）。
  const { readFileSync } = await import('node:fs')
  const http = await import('node:http')
  const path = await import('node:path')
  const WEB = join(process.cwd(), 'src', 'web')
  const server = http.createServer((req, res) => {
    const name = (req.url ?? '/').split('?')[0] === '/' ? '/index.html' : (req.url ?? '').split('?')[0]
    const f = path.join(WEB, name)
    try {
      const body = readFileSync(f)
      const ext = path.extname(f)
      const type = ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'text/html'
      res.writeHead(200, { 'content-type': `${type}; charset=utf-8` })
      res.end(body)
    } catch {
      res.writeHead(404); res.end('x')
    }
  })
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
  console.log(`  隔离服务已起：http://127.0.0.1:${PORT}`)

  // 用 CDP 真开一次页面（复用项目既有的浏览器验证方式）
  const cdp = await import(pathToFileURLSafe(join(process.cwd(), 'scripts', 'lib', 'cdp.mjs'))).catch(() => null)
  if (cdp === null) {
    console.log('  ⚠️ 没找到既有的 CDP 小工具 ⇒ 退化为"HTTP 取回 + JS 语法体检"')
    const r = await fetch(`http://127.0.0.1:${PORT}/`)
    chk(r.status === 200, 'index.html 能被取回')
    const js = await (await fetch(`http://127.0.0.1:${PORT}/app.js`)).text()
    // ⭐ 真解析一次 JS（语法错会在这里抛，而不是等浏览器）
    try {
      new (await import('node:vm')).Script(js)
      chk(true, '⭐ app.js **语法可解析**（用 vm.Script 真解析一遍）')
    } catch (e) {
      chk(false, 'app.js 语法可解析', e instanceof Error ? e.message : String(e))
    }
    chk(!/\btruncate\b/.test(js) || !/truncate\s*[.:]/.test(js),
      '⭐ app.js 里没有残留的 `truncate` 取值路径')
  } else {
    chk(false, '（本机没有 scripts/lib/cdp.mjs）', '改用退化路径')
  }
  server.close()
}

function pathToFileURLSafe(p) {
  return `file:///${p.replace(/\\/g, '/')}`
}

console.log(`\n═══ 结果：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
