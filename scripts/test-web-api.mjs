/**
 * 网页 API 契约 + 修复写通道测试（§8.2 / §8.6 / 决策 88/89/91）。
 *
 * 直接跑 `handleApi()`（与真实路由同一入口），覆盖：
 *  1. **详情数据源**：`/entry`、`/project` —— 按 id 取，**不靠前端拼路径**；
 *  2. **`/block`**：取出非法封面的原始块（修复表单的数据源）；
 *  3. ⭐ **`/fix-cover`**：局部块替换 + 硬校验 —— **同文档里其它块一个都不能少**；
 *  4. ⭐ **`/fix-ref`**：只改 ref、**不允许改 ext**、目标文件必须存在；
 *  5. **方法约束**：写接口只接受 POST；
 *  6. **`ext: true` 不返回正文**（§12-80）。
 *
 * ⚠️ 必须在 `pnpm run build` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-web-api.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-webapi-'))
process.env['MEMJ_DATA_DIR'] = lib

const LIBDIR = join(process.cwd(), 'lib')
const mod = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)
const B = await import(pathToFileURL(join(LIBDIR, 'offline-bundle.js')).href)
const { renderCover } = B

/**
 * 找导出 `handleApi` 的模块。
 *
 * ⚠️ **不能写死文件名**。历史上 `api.ts` 是**动态 import** 的，打包成
 * `api-<hash>.js`（哈希每次构建都变）；2026-09-19 改为**静态 import** 后
 * 它被**内联进 `index.js`**，那个 chunk 不再存在。
 * ⇒ 这里两种形态都试：先看 `index.js`，再兜底扫 `api-*.js`。
 */
async function loadApiModule() {
  const idx = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)
  if (typeof idx.handleApi === 'function') return idx
  for (const f of readdirSync(LIBDIR)) {
    if (!f.startsWith('api-') || !f.endsWith('.js')) continue
    const m = await import(pathToFileURL(join(LIBDIR, f)).href)
    if (typeof m.handleApi === 'function') return m
  }
  throw new Error('找不到导出 handleApi 的模块（既不在 index.js，也没有 api-*.js）')
}
const apiMod = await loadApiModule()

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

const OK_ID = 'aaaaaaaa-1111-4111-8111-111111111111'
const BAD_ID = 'ffffffff-9999-4999-8999-999999999999'
const EXT_ID = 'eeeeeeee-7777-4777-8777-777777777777'
/** ⭐⭐ 决策 128：一条**可读**的外部引用（目标文件真实存在、有正文）——用来验证"外链也渲染正文"。 */
const EXT_OK_ID = 'eeeeeeee-8888-4888-8888-888888888888'

/** 一个不存在的绝对路径（用于造断链）。 */
const MISSING_EXT = join(lib, 'no-such-doc.md')
/** 一个真实存在的外部文件（用于验证"重填成功"）。 */
const REAL_EXT = join(lib, 'real-ext.md')

mkdirSync(join(lib, 'projects'), { recursive: true })
mkdirSync(join(lib, 'entries'), { recursive: true })
writeFileSync(REAL_EXT, '# 外部文档\n\n正文。\n', 'utf8')

// p1：1 合法 + 1 非法（desc 超长）+ 1 断链外部引用
writeFileSync(
  join(lib, 'projects', 'HANDOFF-p1.md'),
  [
    '---', 'project: p1', 'desc: 测试项目；当测试时读它。', 'themes: []', '---', '',
    '# HANDOFF — p1', '',
    '## 目标', '', '测试目标。', '',
    '## 沉淀知识', '',
    renderCover({
      id: OK_ID, project: 'p1', theme: [], global: false, kind: 'fact',
      tags: ['t'], title: '合法条目', desc: '合法条目；当测试时读它。', ref: 'entries/e1-aaaaaaaa.md', ext: false,
      // ⭐ 时间（决策 119）——真实库里封面一定有；这里补上以便断言"详情页能拿到时间"。
      createdAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T01:00:00.000Z',
    }), '',
    '<!-- memj:entry', `id: ${BAD_ID}`, 'project: p1', 'theme: []', 'global: false',
    'kind: fact', 'tags: t', 'title: 非法条目', `desc: ${'x'.repeat(260)}`,
    'ref: entries/bad-ffffffff.md', '-->', '<!-- /memj:entry -->', '',
    renderCover({
      id: EXT_ID, project: 'p1', theme: ['thm-t1'], global: false, kind: '',
      tags: ['ext'], title: '外部引用条目', desc: '外部引用；当测试时读它。', ref: MISSING_EXT, ext: true,
      // ⭐ 外链**也有**封面时间（决策 119）；它没有正文 ⇒ 时间只能从封面取。
      createdAt: '2026-09-19T02:00:00.000Z', updatedAt: '2026-09-19T03:00:00.000Z',
    }), '',
    // ⭐⭐ 决策 128：**可读**的外链（目标文件真实存在）。
    //    🔴 为什么必须单独造一条：原来那条是**断链**的 ⇒ 断链时本来就不渲染，
    //       用它根本测不出"外链渲染正文"这个新语义（会假绿）。
    renderCover({
      id: EXT_OK_ID, project: 'p1', theme: [], global: false, kind: '',
      tags: ['ext'], title: '可读的外部引用', desc: '可读外链；当测试时读它。',
      ref: REAL_EXT, ext: true,
      createdAt: '2026-09-19T04:00:00.000Z', updatedAt: '2026-09-19T05:00:00.000Z',
    }), '',
  ].join('\n'),
  'utf8',
)
// ⭐ 主题文档（决策 106）——主题页右侧详情要读它的 frontmatter 取 desc。
mkdirSync(join(lib, 'themes'), { recursive: true })
writeFileSync(
  join(lib, 'themes', 'THEME-thm-t1.md'),
  [
    '---', 'theme: thm-t1', 'desc: 测试主题；当测试时用它。', '---', '',
    '# THEME — thm-t1', '',
    '## 覆盖的项目', '',
    '| 项目 id | 项目 desc |', '|---|---|', '| p1 | 测试项目 |', '',
    '## 知识封面', '',
  ].join('\n'),
  'utf8',
)
writeFileSync(
  join(lib, 'entries', 'e1-aaaaaaaa.md'),
  `---\nid: ${OK_ID}\nslug: e1\nproject: p1\ntheme: []\nglobal: false\ntags: [t]\ndesc: 合法条目；当测试时读它。\n---\n\n### 合法标题\n\n## 小节\n\n正文内容。\n`,
  'utf8',
)

/** 调一次 API。 */
async function call(method, path, body) {
  const raw = body === undefined ? '' : JSON.stringify(body)
  const url = new URL(`http://127.0.0.1${path}`)
  return apiMod.handleApi({ version: 'test' }, method, url.pathname, raw, url.searchParams)
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【0】🔴 路由注册一致性：api 里处理了、index 里注册了吗？')
// ══════════════════════════════════════════════════════════════════════
// 🔴 **为什么必须测这条**（2026-09-19 真实事故）：
//    `handleApi` 里加了 `/theme` 分支，但 `index.ts` 的 `webServer.register`
//    是**显式逐个列出**路径的**白名单**——忘了加它 ⇒ 请求落到 SPA 兜底、
//    返回整个 HTML，前端拿不到 JSON、**主题详情空白**。
//    ⚠️ 而 `handleApi` 的单测**完全测不出来**：它是直接调函数的，不经路由。
//    ⇒ 这条测"两份清单是否一致"，正是补上那个缺口。
{
  const idxSrc = readFileSync(join(LIBDIR, 'index.js'), 'utf8')
  // 从 api 侧收集被处理的路由（`route === "/x"` 或 `route === '/x'`）。
  // ⚠️ 路径段允许**多层**（`/backup/status`）——只认单层会让深层路由**逃过这条检查**
  //    （2026-09-21 实测：加 `/backup/*` 时，旧的 `[A-Za-z0-9_-]+` 两侧都抠不到它）。
  const handled = new Set()
  for (const m of idxSrc.matchAll(/route === ["'](\/[A-Za-z0-9_/-]+)["']/g)) handled.add(m[1])
  check('能从产物里抠出 api 处理的路由', handled.size >= 10, `抠到 ${handled.size} 个：${[...handled].join(' ')}`)

  // 从注册侧收集已注册的路径。
  // ⚠️ 产物里的形态是**模板字面量**：`` `${API_BASE}/health` ``（未折叠），
  //    所以必须一起认反引号形态——只写 `"..."` 会**抠到 0 个**（踩过）。
  const registered = new Set()
  for (const m of idxSrc.matchAll(/[`"'](?:\.\.\.)?\/plugins\/dsh-memj\/api(\/[A-Za-z0-9_/-]+)[`"']/g)) {
    registered.add(m[1])
  }
  for (const m of idxSrc.matchAll(/API_BASE\}(\/[A-Za-z0-9_/-]+)/g)) {
    registered.add(m[1])
  }
  for (const m of idxSrc.matchAll(/API_BASE\s*\+\s*[`"'](\/[A-Za-z0-9_/-]+)[`"']/g)) {
    registered.add(m[1])
  }
  check('能从产物里抠出已注册的路由', registered.size >= 10, `抠到 ${registered.size} 个：${[...registered].join(' ')}`)

  // ⭐ 核心断言：**每个被处理的路由都必须被注册**。
  const missing = [...handled].filter((r) => !registered.has(r))
  check('⭐⭐ 每个 api 处理的路由都在 index 里注册了', missing.length === 0,
    `⚠️ 未注册：${missing.join(' ')} —— 这些请求会落到 SPA 兜底、返回 HTML 而不是 JSON！`)
  // ⭐ 反证：**必须能抠到那个多层的路由**，否则上面的断言对它是**空的**
  //    （"检查里没有它" ≠ "它注册了"——这正是本条要防的假绿）。
  check('⭐⭐ 多层路由确实进了检查范围（反证）',
    handled.has('/backup/status') && registered.has('/backup/status'),
    `handled 有 /backup/status=${handled.has('/backup/status')}，registered 有=${registered.has('/backup/status')}`)
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【1】详情数据源：/entry 与 /project')
// ══════════════════════════════════════════════════════════════════════
let r = await call('GET', `/plugins/dsh-memj/api/entry?id=${OK_ID}`)
check('/entry 返回 200', r.status === 200, `实际 ${r.status}`)
check('含文件头 frontmatter', r.body.frontmatter !== null && r.body.frontmatter !== undefined)
check('⭐ 标题取**封面**的 title（决策 98）', r.body.title === '合法条目', String(r.body.title))
check('  ⭐ 封面 title 与正文 `###` 不同时，以封面为准（这里两者刻意不同）',
  r.body.title !== '合法标题', String(r.body.title))
check('  详情里也带出 cover.title（供表单预填）', r.body.cover.title === '合法条目', String(r.body.cover.title))
// ⭐⭐ 时间必须能从 **cover** 拿到（决策 119）——🔴 修一个实测缺陷：
//    前端原来只从正文 `frontmatter` 读时间，而**外链没有正文** ⇒ 时间恒为空。
check('⭐ cover 带出 createdAt（决策 119）',
  typeof r.body.cover.createdAt === 'string' && r.body.cover.createdAt !== '',
  JSON.stringify(r.body.cover.createdAt))
check('⭐ cover 带出 updatedAt（决策 119）',
  typeof r.body.cover.updatedAt === 'string' && r.body.cover.updatedAt !== '',
  JSON.stringify(r.body.cover.updatedAt))
check('正文非空', typeof r.body.body === 'string' && r.body.body.length > 0)
check('块位置已给出（sourceFile / line）', r.body.sourceFile === 'HANDOFF-p1.md' && r.body.line > 0,
  JSON.stringify({ f: r.body.sourceFile, l: r.body.line }))

r = await call('GET', `/plugins/dsh-memj/api/entry?id=${EXT_ID}`)
// ⭐⭐ **决策 128 反转了这两条断言**（原 §12-80 要求"外链不返回正文"）。
//    新语义：外链**也返回正文**（`loadEntryDoc` 本来就读得到库外文件，只是以前被丢弃）。
//    ⚠️ 本条是**断链**外链 ⇒ `body` 仍是空串（没有内容可读）——这正好顺带验证"断链不炸"。
check('⭐ 断链外链 ⇒ body 为空串（没有内容可读，不是被策略清空）',
  r.body.body === '', JSON.stringify(r.body.body).slice(0, 60))
check('  ext 条目的 frontmatter 仍为 null（§3.3：外链不写 frontmatter）',
  r.body.frontmatter === null)
// ⭐⭐ **本用例就是那个缺陷的回归测试**：外链没有正文 ⇒ 时间只能从封面取。
check('⭐⭐ ext 条目**仍能拿到时间**（封面带出，实测曾恒为空）',
  typeof r.body.cover.createdAt === 'string' && r.body.cover.createdAt !== '' &&
    typeof r.body.cover.updatedAt === 'string' && r.body.cover.updatedAt !== '',
  JSON.stringify({ c: r.body.cover.createdAt, u: r.body.cover.updatedAt }))

// ⭐⭐ 决策 128 的核心：**可读的外链必须返回正文**（用真实存在的外部文件）。
r = await call('GET', `/plugins/dsh-memj/api/entry?id=${EXT_OK_ID}`)
check('⭐⭐ 可读外链 ⇒ **返回正文**（决策 128，取代 §12-80）',
  typeof r.body.body === 'string' && r.body.body.includes('外部文档'),
  JSON.stringify(r.body.body).slice(0, 80))
check('⭐⭐ 可读外链 ⇒ 正文**不是**空串（防止"忘了去掉 ext 特判"）',
  r.body.body !== '', JSON.stringify(r.body.body).slice(0, 60))
check('  ext 仍标记为 true（身份不变）', r.body.cover.ext === true, String(r.body.cover.ext))
check('  frontmatter 仍为 null（§3.3：外链不写 frontmatter）', r.body.frontmatter === null)
check('  未断链 ⇒ missing 为 false', r.body.missing === false, String(r.body.missing))

r = await call('GET', '/plugins/dsh-memj/api/entry?id=not-exist')
check('未知 id ⇒ 404', r.status === 404, `实际 ${r.status}`)

r = await call('GET', '/plugins/dsh-memj/api/project?id=p1')
check('/project 返回 200', r.status === 200, `实际 ${r.status}`)
check('⭐ 叙事是**纯叙事**（不含 frontmatter 分隔线）', !/^---$/m.test(r.body.narrative), r.body.narrative.slice(0, 80))
check('⭐ 叙事不含一级标题', !/^#\s+HANDOFF/m.test(r.body.narrative))
check('⭐ 叙事不含「沉淀知识」节', !/^##\s+沉淀知识/m.test(r.body.narrative))
check('报了封面数', r.body.coverCount === 3, `实际 ${r.body.coverCount}`)
check('⭐ 报了保留的非法块数 = 1', r.body.orphanCount === 1, `实际 ${r.body.orphanCount}`)
// ⭐⭐ 决策 220：`/project` 还要回**各节自己的规范块**（项目详情页据此画「编辑」按钮）。
//    🔴 这条守的是"前端不再自己解析 markdown"——
//       能不能编辑**只能由服务端说了算**，否则就有了第二份实现（迟早与后端漂开）。
//    ⚠️ fixture 里 `## 目标` 下**没有** `memj:spec` 块 ⇒ 必须是空数组
//       （"没有块 ⇒ 不在清单里 ⇒ 前端根本不画按钮"，这正是决策 207 的裁定形态）。
{
  const ps = await call('GET', '/plugins/dsh-memj/api/project?id=p1')
  check('⭐⭐ `/project` 回 `sections` 字段（决策 220），且只含**真的有规范块**的节',
    Array.isArray(ps.body.sections) && ps.body.sections.length === 0,
    JSON.stringify(ps.body.sections))
}

r = await call('GET', '/plugins/dsh-memj/api/project?id=nope')
check('未知项目 ⇒ 404', r.status === 404, `实际 ${r.status}`)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【1b】⭐ 主题页数据源：/themes 与 /theme（决策 106）')
// ══════════════════════════════════════════════════════════════════════
r = await call('GET', '/plugins/dsh-memj/api/themes')
check('/themes 返回 200', r.status === 200, `实际 ${r.status}`)
check('⭐ 返回**对象数组**（不再是裸 id 字符串）',
  Array.isArray(r.body.themes) && typeof r.body.themes[0] === 'object',
  JSON.stringify(r.body.themes).slice(0, 120))
const th = r.body.themes.find((t) => t.id === 'thm-t1')
check('含 fixture 主题 thm-t1', th !== undefined, JSON.stringify(r.body.themes))
check('⭐ 带出 desc（列表第二行要用）', th.desc === '测试主题；当测试时用它。', String(th?.desc))
check('⭐ 带出封面计数', th.covers === 1, String(th?.covers))
check('⭐ 带出覆盖的项目', Array.isArray(th.projects) && th.projects.includes('p1'), JSON.stringify(th?.projects))
check('  同时保留 themeIds（向后兼容）', Array.isArray(r.body.themeIds) && r.body.themeIds.includes('thm-t1'))

r = await call('GET', '/plugins/dsh-memj/api/theme?id=thm-t1')
check('/theme 返回 200', r.status === 200, `实际 ${r.status}`)
check('  含 frontmatter.theme', r.body.frontmatter?.theme === 'thm-t1', JSON.stringify(r.body.frontmatter))
check('  含 frontmatter.desc', r.body.frontmatter?.desc === '测试主题；当测试时用它。', JSON.stringify(r.body.frontmatter))
check('⭐ 覆盖的项目含 id 与 desc（从项目 frontmatter 取）',
  r.body.projects.length === 1 && r.body.projects[0].id === 'p1' && r.body.projects[0].desc === '测试项目；当测试时读它。',
  JSON.stringify(r.body.projects))
check('  封面数正确', r.body.coverCount === 1, String(r.body.coverCount))
check('  派生文档存在 ⇒ missingDoc=false', r.body.missingDoc === false, String(r.body.missingDoc))

r = await call('GET', '/plugins/dsh-memj/api/theme?id=nope')
check('未知主题 ⇒ 404', r.status === 404, `实际 ${r.status}`)
r = await call('GET', '/plugins/dsh-memj/api/theme')
check('缺 id ⇒ 400', r.status === 400, `实际 ${r.status}`)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【2】/covers 带上块位置（断链定位用）')
// ══════════════════════════════════════════════════════════════════════
r = await call('GET', '/plugins/dsh-memj/api/covers')
check('/covers 返回 200', r.status === 200)
const extCover = r.body.covers.find((c) => c.id === EXT_ID)
check('⭐ 封面项带 sourceFile / line', extCover.sourceFile === 'HANDOFF-p1.md' && extCover.line > 0,
  JSON.stringify({ f: extCover?.sourceFile, l: extCover?.line }))
check('断链被报出', r.body.brokenLinks.some((b) => b.id === EXT_ID))
const broken = r.body.brokenLinks.find((b) => b.id === EXT_ID)
check('⭐ 断链项也带块位置（供"重新填路径"定位）',
  broken.sourceFile === 'HANDOFF-p1.md' && broken.line > 0, JSON.stringify(broken))
check('非法封面被报出', r.body.invalid.length === 1, `实际 ${r.body.invalid.length}`)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【3】/block：取非法封面的原始块')
// ══════════════════════════════════════════════════════════════════════
const badIssue = r.body.invalid[0]
r = await call('GET', `/plugins/dsh-memj/api/block?file=${encodeURIComponent(badIssue.file)}&line=${badIssue.line}`)
check('/block 返回 200', r.status === 200, `实际 ${r.status}`)
check('给出 startLine / endLine', r.body.startLine === badIssue.line && r.body.endLine >= r.body.startLine,
  JSON.stringify({ s: r.body.startLine, e: r.body.endLine }))
check('原始块含该 id', String(r.body.raw).includes(BAD_ID))
check('给出失败原因', String(r.body.reason).includes('desc 超长'), String(r.body.reason))

// ══════════════════════════════════════════════════════════════════════
console.log('\n【4】⭐ /fix-cover：局部替换 + 硬校验')
// ══════════════════════════════════════════════════════════════════════
const p1Path = join(lib, 'projects', 'HANDOFF-p1.md')
const before = readFileSync(p1Path, 'utf8')

// 4a. 校验不通过 ⇒ 拒绝写入（决策 72：不半写）
r = await call('POST', '/plugins/dsh-memj/api/fix-cover', {
  file: badIssue.file, startLine: r.body.startLine, endLine: r.body.endLine,
  cover: { id: BAD_ID, project: 'p1', theme: [], global: false, kind: 'fact', tags: ['t'], title: '非法条目', desc: '', ref: 'entries/bad.md', ext: false },
})
check('空 desc ⇒ 400 拒绝', r.status === 400, `实际 ${r.status}`)
check('给出 issues（决策 62 报全部）', Array.isArray(r.body.issues) && r.body.issues.length > 0, JSON.stringify(r.body.issues))
check('⭐ 拒绝时**文件未被改动**（不半写）', readFileSync(p1Path, 'utf8') === before)

// 4b. 非法 kind ⇒ 拒绝（受控四值）
r = await call('POST', '/plugins/dsh-memj/api/fix-cover', {
  file: badIssue.file, startLine: badIssue.line, endLine: badIssue.line + 9,
  rawKind: 'bug',
  cover: { id: BAD_ID, project: 'p1', theme: [], global: false, kind: 'bug', tags: ['t'], title: '非法条目', desc: '修好了；当测试时读它。', ref: 'entries/bad-ffffffff.md', ext: false },
})
check('非法 kind ⇒ 400', r.status === 400, `实际 ${r.status}`)
check('原因提到 kind', JSON.stringify(r.body.issues ?? []).includes('kind'), JSON.stringify(r.body.issues))

// 4b2. ⭐ 缺 title ⇒ 拒绝（决策 98：title 也是封面的必填字段）
r = await call('POST', '/plugins/dsh-memj/api/fix-cover', {
  file: badIssue.file, startLine: badIssue.line, endLine: badIssue.line + 9,
  cover: { id: BAD_ID, project: 'p1', theme: [], global: false, kind: 'fact', tags: ['t'], title: '', desc: '修好了；当测试时读它。', ref: 'entries/bad-ffffffff.md', ext: false },
})
check('⭐ 缺 title ⇒ 400 拒绝', r.status === 400, `实际 ${r.status}`)
check('  原因提到 title', JSON.stringify(r.body.issues ?? []).includes('title'), JSON.stringify(r.body.issues))

// 4c. 行号定位失败 ⇒ 拒绝（防误改正文）
r = await call('POST', '/plugins/dsh-memj/api/fix-cover', {
  file: badIssue.file, startLine: 999, endLine: 1000,
  cover: { id: BAD_ID, project: 'p1', theme: [], global: false, kind: 'fact', tags: ['t'], title: '非法条目', desc: 'x；当y时读它。', ref: 'entries/bad-ffffffff.md', ext: false },
})
check('行号越界/非块 ⇒ 400', r.status === 400, `实际 ${r.status}`)

// 4d. 正常修复 ⇒ 成功，且**其它块一个不少**
const blk = await call('GET', `/plugins/dsh-memj/api/block?file=${encodeURIComponent(badIssue.file)}&line=${badIssue.line}`)
r = await call('POST', '/plugins/dsh-memj/api/fix-cover', {
  file: blk.body.file, startLine: blk.body.startLine, endLine: blk.body.endLine,
  cover: {
    id: BAD_ID, project: 'p1', theme: [], global: false, kind: 'trap',
    tags: ['t', 'fixed'], title: '修好后的条目', desc: '修好后的条目；当测试时读它。',
    ref: 'entries/bad-ffffffff.md', ext: false,
  },
})
check('⭐ 合法修复 ⇒ 200', r.status === 200, `${r.status} ${JSON.stringify(r.body)}`)

const after = readFileSync(p1Path, 'utf8')
check('⭐ 修复后：合法封面仍在', after.includes(OK_ID))
check('⭐ 修复后：外部引用块仍在', after.includes(EXT_ID))
check('⭐ 修复后：块数不变（没有增删）',
  (after.match(/<!-- memj:entry/g) ?? []).length === 4,
  `实际 ${(after.match(/<!-- memj:entry/g) ?? []).length}`)
check('⭐ 修复后：非法封面已变合法（scanLibrary 无 issues）',
  (await mod.scanLibrary()).issues.length === 0,
  JSON.stringify((await mod.scanLibrary()).issues))
check('修复后：frontmatter 仍只有一份', (after.match(/^---$/gm) ?? []).length === 2)
check('修复后：一级标题仍只有一个', (after.match(/^#\s+HANDOFF/gm) ?? []).length === 1)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【5】/fix-ref：只改 ref')
// ══════════════════════════════════════════════════════════════════════
const blkExt = await call('GET', `/plugins/dsh-memj/api/block?file=HANDOFF-p1.md&line=${broken.line}`)
check('取到断链块', blkExt.status === 200, `实际 ${blkExt.status}`)

// 5a. 非绝对路径 ⇒ 拒绝
r = await call('POST', '/plugins/dsh-memj/api/fix-ref', {
  file: 'HANDOFF-p1.md', startLine: broken.line, endLine: broken.line,
  ref: 'relative/path.md',
})
check('相对路径 ⇒ 400', r.status === 400, `实际 ${r.status}`)

// 5b. 目标不存在 ⇒ 拒绝
r = await call('POST', '/plugins/dsh-memj/api/fix-ref', {
  file: 'HANDOFF-p1.md', startLine: blkExt.body.startLine, endLine: blkExt.body.endLine,
  ref: join(lib, 'still-missing.md'),
})
check('目标不存在 ⇒ 400', r.status === 400, `实际 ${r.status}`)
check('原因提到"不存在"', String(r.body.error).includes('不存在'), String(r.body.error))

// 5c. 正常重填 ⇒ 成功
r = await call('POST', '/plugins/dsh-memj/api/fix-ref', {
  file: blkExt.body.file, startLine: blkExt.body.startLine, endLine: blkExt.body.endLine,
  ref: REAL_EXT,
})
check('⭐ 指向真实文件 ⇒ 200', r.status === 200, `${r.status} ${JSON.stringify(r.body)}`)

const afterRef = readFileSync(p1Path, 'utf8')
check('ref 已更新', afterRef.includes(REAL_EXT.replace(/\\/g, '\\')))
check('⭐ ext 仍是 true（不允许被改，§12-78）', /ext: true/.test(afterRef))
check('⭐ 重填后：其它块仍在',
  afterRef.includes(OK_ID) && afterRef.includes(BAD_ID))
const afterSnap = await mod.scanLibrary()
check('⭐ 重填后：不再有断链', afterSnap.issues.length === 0)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【6】方法约束：写接口只接受 POST')
// ══════════════════════════════════════════════════════════════════════
for (const p of ['/plugins/dsh-memj/api/fix-cover', '/plugins/dsh-memj/api/fix-ref', '/plugins/dsh-memj/api/rebuild']) {
  const g = await call('GET', p)
  check(`GET ${p.split('/').pop()} ⇒ 405`, g.status === 405, `实际 ${g.status}`)
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【7】写通道边界：不允许新增/删除封面')
// ══════════════════════════════════════════════════════════════════════
const snapBefore = await mod.scanLibrary()
r = await call('POST', '/plugins/dsh-memj/api/fix-cover', {
  file: 'HANDOFF-p1.md', startLine: 1, endLine: 1,
  cover: { id: '12345678-1234-4123-8123-123456789012', project: 'p1', theme: [], global: false, kind: 'fact', tags: ['t'], title: '注入尝试', desc: '注入尝试；当测试时读它。', ref: 'entries/new.md', ext: false },
})
check('对非封面块写入 ⇒ 400 拒绝', r.status === 400, `实际 ${r.status}`)
const snapAfter = await mod.scanLibrary()
check('⭐ 封面数未变（没有凭空多出）', snapAfter.covers.length === snapBefore.covers.length,
  `${snapBefore.covers.length} → ${snapAfter.covers.length}`)

// ══════════════════════════════════════════════════════════════════════
// ⭐ 【8】设置接口（§8.8 / 决策 97）——改 profile 的 cordis.patch.yml
//
// ⚠️ 这一节**不碰真实 profile**：`ctx.baseUrl` 由本测试**伪造成一个临时目录**，
//    于是写的是那个临时目录里的 `cordis.patch.yml`（与真实配置完全隔离）。
// ══════════════════════════════════════════════════════════════════════
console.log('\n【8】⭐ 设置接口：GET / POST /settings（决策 97）')

// 造一个"假的 profile 目录"：含 cordis.patch.yml（带中文注释 + 另一条目）+ package.json。
const fakeProfile = join(lib, 'fake-profile')
mkdirSync(fakeProfile, { recursive: true })
const patchFile = join(fakeProfile, 'cordis.patch.yml')
const PATCH_ORIGINAL = [
  '# Your patch layer for this dsh profile, applied after every bundle layer:',
  '# 禁用旧插件 dsh-memory（2026-09-16）。',
  '- id: memory',
  '  disabled: true',
  '',
].join('\n')
writeFileSync(patchFile, PATCH_ORIGINAL, 'utf8')
writeFileSync(
  join(fakeProfile, 'package.json'),
  JSON.stringify({ name: 'dsh-profile-fake', dsh: { profile: { bundles: [], patchReload: 'live' } } }),
  'utf8',
)

/** 带"假 baseUrl"调一次 API。 */
async function callWithBase(method, path, body) {
  const raw = body === undefined ? '' : JSON.stringify(body)
  const url = new URL(`http://127.0.0.1${path}`)
  return apiMod.handleApi(
    { version: 'test', config: { ...mod.DEFAULT_CONFIG, themeCreation: 'strict' }, baseUrl: pathToFileURL(fakeProfile + '\\').href },
    method,
    url.pathname,
    raw,
    url.searchParams,
  )
}

// ── GET：读出当前值与来源信息 ──
let s = await callWithBase('GET', '/plugins/dsh-memj/api/settings')
check('GET /settings ⇒ 200', s.status === 200, `实际 ${s.status}`)
check('回当前 themeCreation', s.body.themeCreation === 'strict', String(s.body.themeCreation))
check('⭐ 回 patch 文件路径', typeof s.body.patchPath === 'string' && s.body.patchPath.endsWith('cordis.patch.yml'),
  String(s.body.patchPath))
check('⭐ 回 patchReload（决定要不要重启）', s.body.patchReload === 'live', String(s.body.patchReload))
check('  live ⇒ needsRestart=false', s.body.needsRestart === false, String(s.body.needsRestart))

// ── POST：写入 loose ──
let w = await callWithBase('POST', '/plugins/dsh-memj/api/settings', { themeCreation: 'loose' })
check('POST /settings ⇒ 200', w.status === 200, `实际 ${w.status}`)
check('回执 ok', w.body.ok === true)
check('回执说明热重载生效', String(w.body.message).includes('热重载'), String(w.body.message))

const afterWrite = readFileSync(patchFile, 'utf8')
check('⭐ 值已写入文件', /themeCreation:\s*loose/.test(afterWrite), afterWrite)
check('⭐⭐ 中文注释**未被吃掉**', afterWrite.includes('禁用旧插件 dsh-memory（2026-09-16）'), afterWrite)
check('⭐ 原有条目 `- id: memory` 未被破坏',
  afterWrite.includes('- id: memory') && afterWrite.includes('disabled: true'), afterWrite)
// 🔴 `id` 是 **loader 树里的条目 id `memj`**，不是包名 `dsh-memj`
//    （插件 bundle patch 写的是 `insert: [{ id: memj, name: dsh-memj }]`）。
//    写错会产出**永远匹配不到的死条目**：boot 只警告一行，配置静默不生效。
check('⭐⭐ 只新增一条 `- id: memj`（条目 id，非包名）',
  (afterWrite.match(/id: memj/g) ?? []).length === 1, afterWrite)
check('  ⭐ 没有写出包名当 id', !/^-\s*id:\s*dsh-memj\s*$/m.test(afterWrite), afterWrite)

// ── 幂等：再写一次同样的值，结果应完全一致 ──
await callWithBase('POST', '/plugins/dsh-memj/api/settings', { themeCreation: 'loose' })
const afterSecond = readFileSync(patchFile, 'utf8')
check('⭐ 幂等：同样的值写两次 ⇒ 文件内容一致', afterSecond === afterWrite,
  `${afterWrite.length} vs ${afterSecond.length}`)

// ── 改回 strict（证明双向可写） ──
await callWithBase('POST', '/plugins/dsh-memj/api/settings', { themeCreation: 'strict' })
const afterThird = readFileSync(patchFile, 'utf8')
check('⭐ 可以改回 strict', /themeCreation:\s*strict/.test(afterThird), afterThird)
check('  仍然只有一条 memj 条目', (afterThird.match(/id: memj/g) ?? []).length === 1)
check('  注释仍在（三次写入后）', afterThird.includes('禁用旧插件 dsh-memory'), afterThird)

// ── 非法值必须被拒，且**不写文件** ──
const beforeInvalid = readFileSync(patchFile, 'utf8')
const bad = await callWithBase('POST', '/plugins/dsh-memj/api/settings', { themeCreation: 'yolo' })
check('⭐ 非法取值 ⇒ 400 拒绝', bad.status === 400, `实际 ${bad.status}`)
check('  文件**未被改动**', readFileSync(patchFile, 'utf8') === beforeInvalid)
check('  缺字段也拒绝', (await callWithBase('POST', '/plugins/dsh-memj/api/settings', {})).status === 400)
check('  非字符串也拒绝',
  (await callWithBase('POST', '/plugins/dsh-memj/api/settings', { themeCreation: 123 })).status === 400)

// ── 方法约束 ──
check('DELETE /settings ⇒ 405', (await callWithBase('DELETE', '/plugins/dsh-memj/api/settings')).status === 405)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【8.1】⭐⭐⭐ 回显必须"磁盘优先"（2026-10-07 用户报的真 bug）')
// ══════════════════════════════════════════════════════════════════════
// 🔴🔴 **这条钉住的是什么**（用户在设置页上看到的原话："裁决模型我设定完，
//    然后保存的时候又变成默认的了"）：
//    `GET /settings` 原来回的是 **`deps.config`** —— 即 `apply()` 那一刻解析出来的
//    **进程内**配置。而 `writeSetting` **只改文件**、不回头更新它，
//    要等热重载/重启才变。
//    ⇒ 面板保存后**立刻**重新拉 `/settings`（`openSettingsPage` 就在做这件事）
//      ⇒ 拿到**旧值** ⇒ 控件被填回旧值 ⇒ 用户看到"存完就弹回默认"。
//    ⚠️ 更坏的是它**真的丢数据**：控件填回旧值后，用户再点一次保存
//      ⇒ **旧值被写回磁盘**，用户的选择被静默抹掉。
//
// ⭐ 判据（**这是本次修复的核心**）：
//    POST 一个值 ⇒ **同一进程、立刻** GET ⇒ 必须回**刚写进去的那个值**。
//    🔴 它在旧实现下**必然失败**（回的是 `DEFAULT_CONFIG` 里的空串），
//      所以这条测试是**真的能抓住回归**的，不是形式主义。
{
  // 前置：确认进程内那份配置里**没有**这个值（否则测不出"磁盘优先"）
  check('  前置：进程内配置的 tagNormalizeProvider 是默认值（空串）',
    mod.DEFAULT_CONFIG.tagNormalizeProvider === '', String(mod.DEFAULT_CONFIG.tagNormalizeProvider))

  const wr = await callWithBase('POST', '/plugins/dsh-memj/api/settings', {
    tagNormalizeProvider: 'disk-prov',
    tagNormalizeModel: 'disk-model',
  })
  check('  POST 裁决模型 ⇒ 200', wr.status === 200, `实际 ${wr.status}`)
  check('  ⭐ 值已写进文件', /tagNormalizeProvider:\s*"?disk-prov"?/.test(readFileSync(patchFile, 'utf8')))

  // 🔴 核心断言：**立刻** GET，必须回刚写的值（进程内那份还是旧的）
  const immediately = await callWithBase('GET', '/plugins/dsh-memj/api/settings')
  check('⭐⭐⭐ POST 后**立刻** GET ⇒ 回的是**刚写进去的值**（不是进程内的旧值）',
    immediately.body.tagNormalizeProvider === 'disk-prov'
      && immediately.body.tagNormalizeModel === 'disk-model',
    `实际 ${immediately.body.tagNormalizeProvider}/${immediately.body.tagNormalizeModel}`)

  // ⭐ 反证：**没写过的**键仍走进程内配置（保住"旧键回落生效值"那类回显）
  //    ⚠️ 少了这半边，"磁盘优先"会退化成"只认磁盘" —— 那些靠回落算出来的键会变空。
  check('⭐⭐ 反证：磁盘上没写的键**仍回进程内配置**（回落值不能丢）',
    immediately.body.hotSessionKeep === mod.DEFAULT_CONFIG.hotSessionKeep,
    `${immediately.body.hotSessionKeep} vs ${mod.DEFAULT_CONFIG.hotSessionKeep}`)

  // ⭐⭐ 布尔 `false` 也必须能"磁盘优先"读到（同族坑：别用取值真伪判"写没写"）
  await callWithBase('POST', '/plugins/dsh-memj/api/settings', { tagNormalizeOnHandoff: false })
  const boolBack = await callWithBase('GET', '/plugins/dsh-memj/api/settings')
  check('⭐⭐ 显式 false 也走磁盘优先（不能因"假值"而回落）',
    boolBack.body.tagNormalizeOnHandoff === false, String(boolBack.body.tagNormalizeOnHandoff))

  // 收尾：恢复成默认，别把状态留给后面的用例
  await callWithBase('POST', '/plugins/dsh-memj/api/settings', {
    tagNormalizeProvider: '', tagNormalizeModel: '', tagNormalizeOnHandoff: true,
  })
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【9】⭐⭐ 备份两个开关（决策 135）')
// ══════════════════════════════════════════════════════════════════════
// 🔴 本段的重点是那条**布尔值最容易踩的坑**：
//    省略键 = "没给" = 不写；只有**显式传 false** 才真的关掉。
//    若前端把 `false` 也省略掉，用户点"关闭"就会**关不掉**（同族坑，本项目记过一次）。
{
  const g = await callWithBase('GET', '/plugins/dsh-memj/api/settings')
  // ⚠️ 本条**换过一次断言**（决策 136）：`backupSnapshot`（台账开关）**已删除**，
  //    取而代之的是 `progressCharsKeep`（截断目标）。
  check('GET 回 progressCharsKeep（截断目标）', typeof g.body.progressCharsKeep === 'number', String(g.body.progressCharsKeep))
  check('🔴 GET **不再回** backupSnapshot（台账开关已删）',
    g.body.backupSnapshot === undefined, String(g.body.backupSnapshot))
  check('GET 回 backupGit', typeof g.body.backupGit === 'boolean', String(g.body.backupGit))

  // ⭐ 关掉 git（显式 false）——**必须真的写进文件**
  const off = await callWithBase('POST', '/plugins/dsh-memj/api/settings', { backupGit: false })
  check('POST backupGit:false ⇒ 200', off.status === 200, `实际 ${off.status} ${JSON.stringify(off.body).slice(0, 120)}`)
  const afterOff = readFileSync(patchFile, 'utf8')
  check('⭐⭐ 显式 false **真的写进了文件**（不是被当成"没给"）',
    /backupGit:\s*false/.test(afterOff), afterOff.slice(-400))
  check('  回执回声了 backupGit', off.body.backupGit === false, JSON.stringify(off.body.backupGit))
  check('  注释仍在', afterOff.includes('禁用旧插件 dsh-memory'), afterOff)

  // ⭐ 打开 git（显式 true）
  const on = await callWithBase('POST', '/plugins/dsh-memj/api/settings', { backupGit: true })
  check('POST backupGit:true ⇒ 200', on.status === 200, JSON.stringify(on.body).slice(0, 120))
  const afterOn = readFileSync(patchFile, 'utf8')
  check('⭐ true 也写进去了', /backupGit:\s*true/.test(afterOn), afterOn.slice(-400))
  check('  ⭐ 仍然只有一条 memj 条目', (afterOn.match(/id: memj/g) ?? []).length === 1)

  // ⭐ 截断目标同一个套路（决策 136 新增的键）
  const kp = await callWithBase('POST', '/plugins/dsh-memj/api/settings', { progressCharsKeep: 12000 })
  check('POST progressCharsKeep ⇒ 200', kp.status === 200, JSON.stringify(kp.body).slice(0, 120))
  check('⭐⭐ 值写进文件', /progressCharsKeep:\s*12000/.test(readFileSync(patchFile, 'utf8')),
    readFileSync(patchFile, 'utf8').slice(-300))

  // ── 非法取值一律 400，且**不写文件** ──
  const snapBefore = readFileSync(patchFile, 'utf8')
  for (const [label, body] of [
    ['backupGit 传字符串', { backupGit: 'true' }],
    ['backupGit 传数字', { backupGit: 1 }],
    ['progressCharsKeep 传 null', { progressCharsKeep: null }],
    ['progressCharsKeep 超范围', { progressCharsKeep: 999 }],
    ['progressCharsKeep 传小数', { progressCharsKeep: 1.5 }],
  ]) {
    const r2 = await callWithBase('POST', '/plugins/dsh-memj/api/settings', body)
    check(`${label} ⇒ 400`, r2.status === 400, `实际 ${r2.status}`)
  }
  check('  非法取值后文件**未被改动**', readFileSync(patchFile, 'utf8') === snapBefore)

  // ── 至少给一个键 ──
  check('  空请求仍被拒（不能静默成功）',
    (await callWithBase('POST', '/plugins/dsh-memj/api/settings', {})).status === 400)

  // ══════════════════════════════════════════════════════════════════
  // ⭐⭐⭐ 每个"可写键"都必须被【至少给一个】那个条件认账
  //
  // 🔴 **这是一条真正的回归测试**，来自一次**实测事故**（2026-09-28）：
  //    我给标签规范化加了 `tagNormalizeProvider`/`Model` 的**写入块**与
  //    **报错文案**，却**漏了那个条件本身**（`!wantsTheme && … && !wantsTagProvider`）
  //    ⇒ 只提交这两个键会被判"什么都没给"、返回 400 —— **面板保存直接失败**。
  //    ⚠️ 类型检查（tsc）与既有单测**都照不到**：它们不跑那条条件。
  //       ⭐ 是**在隔离实例上真 POST 一次 settings** 才发现的。
  //
  // ⇒ 判据：**逐个键单独提交，都必须 200**。
  //    ⚠️ 用"每个键的值都合法"的形态（非法值会被别的分支 400，混淆判据）。
  // ══════════════════════════════════════════════════════════════════
  for (const [key, val] of [
    ['enIndex', true],
    ['enIndexDiag', false],
    ['translateProvider', 'p'],
    ['translateModel', 'm'],
    ['translateTemplate', 'instruct'],
    ['translateConcurrency', 3],
    ['translateRetries', 0],
    ['translateTimeoutMs', 20000],
    ['translateMaxTokens', 2000],
    ['tagNormalizeProvider', 'workbuddy'],
    ['tagNormalizeModel', 'hy3'],
    // ⭐ 决策 165：轮次结束自动规范化开关
    //    （上一批漏进"至少给一个"条件的正是这一类 —— 这条会盯住它）
    ['tagNormalizeOnHandoff', true],
    ['hotInject', false],
    ['hotInjectRatio', 0.25],
    ['hotCharsPerToken', 2],
    ['hotBudgetCharsFallback', 12000],
    ['hotFullWarnChars', 40000],
    ['hotSessionKeep', 3],
    ['activeInject', false],
    ['activeInjectChannel', 'chat'],
    ['activeInjectModel', ''],
    ['activeInjectScope', 'project'],
    ['activeInjectStrict', true],
    ['activeInjectTopK', 5],
    // ⭐⭐ 2026-09-29：`activeInjectBand` 拆成两个键 —— **两个都必须逐个提交验一遍**，
    //    否则漏进「至少给一个」那个大条件 ⇒ 面板单独保存这一页会 400
    //    （这就是本清单存在的理由，见上方注释里那次真实事故）。
    ['activeInjectNeedMin', 0.7],
    ['activeInjectItemMin', 0.7],
    ['activeInjectBand', 0.7],
    ['activeInjectTimeoutMs', 30000],
    ['activeInjectExplain', false],
    ['activeInjectSearchIntentGate', true],
    ['activeInjectSearchIntentMin', 0.6],
    ['activeInjectSufficientGate', true],
    ['activeInjectSufficientMin', 0.85],
    ['activeInjectMaxInjectionsPerTurn', 3],
    ['activeInjectConcurrency', 3],
    ['activeInjectContextTokens', 20000],
    ['activeRecallLogRequest', false],
    // ⭐⭐⭐ 2026-09-29 知识评分（决策 177 / 178）：**全部键逐个提交**。
    //    🔴 本清单存在的唯一理由就是"漏进「至少给一个」条件"那类事故
    //       （第六十六批真实发生过：加了写入块却漏了条件 ⇒ 面板保存 400，
    //        而 tsc 与单测**都照不到**；只有隔离实例真 POST 才抓到）。
    ['hotScoreOnTurnEnd', true],
    ['hotScoreThreshold', 0.7],
    ['hotScoreWindowHours', 30],
    ['hotScoreTopN', 20],
    // ⭐ 180：每轮最多选几条（写入侧；与 `hotScoreTopN` 读取侧不是一回事）。
    ['hotScoreMaxPicks', 10],
    // ⭐ 182：入围门槛（分数 + 上一轮那道门）。
    ['hotScoreGateMinScore', 2],
    ['hotScoreGateLastTurn', true],
    ['hotScoreMinChars', 100],
    // ⭐ 178：通路 + 模型（模型形态随通路）+ 子代理模型（始终 provider/model）。
    ['hotScoreChannel', 'chat'],
    ['hotScoreModel', 'workbuddy/deepseek-v4.1-flash'],
    ['hotScoreSubagentProvider', ''],
    ['hotScoreSubagentModel', ''],
    ['hotScoreTimeoutMs', 60000],
  ]) {
    const one = await callWithBase('POST', '/plugins/dsh-memj/api/settings', { [key]: val })
    check(`⭐⭐ 单独提交 \`${key}\` ⇒ 200（它进了"至少给一个"的条件）`,
      one.status === 200, `实际 ${one.status}：${JSON.stringify(one.body).slice(0, 100)}`)
  }
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n【10】⭐⭐ /backup/status 与 /backup/setup（决策 135）')
// ══════════════════════════════════════════════════════════════════════
{
  const st = await callWithBase('GET', '/plugins/dsh-memj/api/backup/status')
  check('GET /backup/status ⇒ 200', st.status === 200, `实际 ${st.status}`)
  check('⭐ 回 gitAvailable（真实探测，不是写死）', typeof st.body.gitAvailable === 'boolean', String(st.body.gitAvailable))
  check('  本机 git 确实可用 ⇒ gitAvailable=true', st.body.gitAvailable === true, JSON.stringify(st.body).slice(0, 200))
  check('  回 git 版本号', typeof st.body.gitVersion === 'string' && st.body.gitVersion !== '', String(st.body.gitVersion))
  check('  回 repoInitialized', typeof st.body.repoInitialized === 'boolean')
  check('  回身份对象', st.body.identity !== null && typeof st.body.identity === 'object')
  check('  回 git 开关值', typeof st.body.backupGit === 'boolean', String(st.body.backupGit))
  check('  ⭐ 也回两个阈值（决策 136）',
    typeof st.body.progressCharsWarn === 'number' && typeof st.body.progressCharsKeep === 'number',
    `${st.body.progressCharsWarn} / ${st.body.progressCharsKeep}`)

  // ⭐ setup 是幂等的、且真的建出仓库
  const su1 = await callWithBase('POST', '/plugins/dsh-memj/api/backup/setup', {})
  check('POST /backup/setup ⇒ 200', su1.status === 200, JSON.stringify(su1.body).slice(0, 250))
  check('  ok=true', su1.body.ok === true)
  check('⭐⭐ 回**逐步真实结果** steps（前端据此逐行点亮）',
    Array.isArray(su1.body.steps) && su1.body.steps.length >= 4, JSON.stringify(su1.body.steps)?.slice(0, 200))
  check('  每步都有 id/label/ok/detail',
    su1.body.steps.every((s) => typeof s.id === 'string' && typeof s.label === 'string' && typeof s.ok === 'boolean' && typeof s.detail === 'string'))
  check('  全部步骤成功', su1.body.steps.every((s) => s.ok === true), JSON.stringify(su1.body.steps))
  check('  ⭐ 决定了提交者身份', typeof su1.body.identity?.name === 'string' && su1.body.identity.name !== '',
    JSON.stringify(su1.body.identity))
  const repoRoot = join(lib, 'backup')
  check('  ⭐ 仓库真的建出来了（backup/.git）', existsSync(join(repoRoot, '.git')))
  // ⚠️ 白名单规则**换过一次**（决策 136）：镜像从 `backup/narrative/` 挪到 `backup/` 根下
  //    ⇒ 放行规则从 `!narrative/**` 改成 `!HANDOFF-*.md`。
  check('  ⭐ 白名单 .gitignore 已写（放行 backup 根下的镜像）',
    readFileSync(join(repoRoot, '.gitignore'), 'utf8').includes('!HANDOFF-*.md'))
  check('  ⭐ .gitattributes 已写（行尾 LF）', readFileSync(join(repoRoot, '.gitattributes'), 'utf8').includes('eol=lf'))

  // ⭐ 幂等：第二次调用不破坏，身份沿用
  const su2 = await callWithBase('POST', '/plugins/dsh-memj/api/backup/setup', {})
  check('  幂等：第二次仍 200', su2.status === 200)
  check('⭐⭐ 身份**沿用**（这就是"插件记住了"）',
    su2.body.identity.name === su1.body.identity.name && su2.body.identity.email === su1.body.identity.email,
    `${JSON.stringify(su1.body.identity)} vs ${JSON.stringify(su2.body.identity)}`)

  const st2 = await callWithBase('GET', '/plugins/dsh-memj/api/backup/status')
  check('  status 现在报 repoInitialized=true', st2.body.repoInitialized === true)
  check('  status 报身份来源', ['local', 'global', 'generated'].includes(st2.body.identity.source),
    String(st2.body.identity.source))

  // ── 方法约束 ──
  check('GET /backup/setup ⇒ 405', (await callWithBase('GET', '/plugins/dsh-memj/api/backup/setup')).status === 405)
  check('POST /backup/status ⇒ 405', (await callWithBase('POST', '/plugins/dsh-memj/api/backup/status', {})).status === 405)
}

// ── baseUrl 不可用时**如实报错**，不假装成功 ──
const noBase = await apiMod.handleApi(
  { version: 'test', config: mod.DEFAULT_CONFIG, baseUrl: undefined },
  'GET', '/plugins/dsh-memj/api/settings', '', new URL('http://x/').searchParams,
)
check('⭐ 拿不到 baseUrl ⇒ 200 但明确报错（不假装成功）',
  noBase.status === 200 && String(noBase.body.error).includes('baseUrl'), JSON.stringify(noBase.body).slice(0, 160))

// ══════════════════════════════════════════════════════════════════════
// 【11】⭐⭐ history 条目在 **Web 侧可见、模型侧不可见**（决策 137）
//
// 🔴 这是本机制最容易搞错的一点，所以单列一节：
//    · 模型侧（`memj_search` / `memj_info` / `scanLibrary()` 默认）⇒ **不含** history；
//    · 人侧（`/covers` / `/entry`）⇒ **必须含**，否则「历史进展」里的指针点进去会 404。
// ══════════════════════════════════════════════════════════════════════
console.log('\n【11】⭐⭐ history：Web 侧可见 / 模型侧不可见（决策 137）')
{
  // 造一张 history 封面（模拟自动截断的产物）。
  const fakeId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  const histBody = `# 历史进展：第99~100批\n\n### 第100批\n\n这是被截走的原文。\n`
  const entryRel = `entries/tst-history-b99-b100-${fakeId.slice(0, 8)}.md`
  mkdirSync(join(lib, 'entries'), { recursive: true })
  writeFileSync(join(lib, entryRel), histBody, 'utf8')
  const projFile = join(lib, 'projects', 'HANDOFF-hist.md')
  mkdirSync(join(lib, 'projects'), { recursive: true })
  // ⚠️ **必须用 `renderCover()` 生成封面块**（与真实落盘同源）——
  //    🔴 我第一版手拼 `<!-- memj:entry … -->`，**少了结束标记 `<!-- /memj:entry -->`**
  //    ⇒ 解析器认不出这张封面（`/covers` 里 0 条、`/entry` 报"库里没有"）。
  //    ⭐ 判据：**测试夹具要用生产代码的写入函数造**，手拼格式必然漏细节。
  const projHead = [
    '---', 'project: hist', 'title: 历史归档测试', 'desc: 测试项目；当测试时读它。',
    'themes: []', 'createdAt: 2026-09-21T00:00:00.000Z', 'updatedAt: 2026-09-21T00:00:00.000Z',
    '---', '', '# 项目交接文档 hist', '',
    '## 目标', '', '测试。', '',
    '## 当前进度', '', '### 历史进展', '',
    `- **第99~100批**：详见条目 \`${fakeId}\`。`, '',
    '## 沉淀知识', '',
    renderCover({
      id: fakeId, project: 'hist', theme: [], global: false, kind: 'history',
      tags: ['历史进展'], title: '历史进展：第99~100批', desc: '自动截断归档的原文；当查阅时读它。',
      ref: entryRel, ext: false,
      createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z',
    }), '',
  ].join('\n')
  writeFileSync(projFile, projHead, 'utf8')

  // ⚠️ 用既有的 `call()`（它会 `new URL()` 拆出 pathname + searchParams）；
  //    🔴 我第一版自己拼了 `/entry?id=…` 当 pathname ⇒ 路由匹配不上、报"未知的 API 路径"。
  const get = async (p) => call('GET', `/plugins/dsh-memj/api${p}`)

  // ① /covers **必须含** history（人侧列表 + 类型筛选要用）
  const cov = await get('/covers')
  const inList = (cov.body.covers ?? []).filter((x) => x.kind === 'history')
  check('⭐⭐ `/covers` **含** history 条目（知识库页要能看到）',
    inList.length === 1, `实得 ${inList.length} 条`)
  check('   且带 kind=history（类型筛选靠它）', inList[0]?.kind === 'history', String(inList[0]?.kind))
  check('   标题也带出来了', (inList[0]?.title ?? '').includes('历史进展'), String(inList[0]?.title))

  // ② /entry **必须能取到**（否则「历史进展」里的指针点进去 404）
  const ent = await get(`/entry?id=${fakeId}`)
  check('⭐⭐ `/entry` **能按 id 取到** history 条目（指针才点得通）',
    ent.status === 200 && ent.body.ok === true, `status=${ent.status} ${JSON.stringify(ent.body).slice(0, 120)}`)
  check('   回 kind=history（前端据此画「历史归档」横幅）', ent.body.cover?.kind === 'history')
  check('   正文能取到（原文可读）', String(ent.body.body ?? '').includes('被截走的原文'),
    String(ent.body.body ?? '').slice(0, 80))

  // ③ 🔴 **反证：模型侧不含** —— 默认 scanLibrary 里查不到它
  const modelSide = await B.scanLibrary()
  check('🔴 **反证：模型侧默认扫描 *不含* history**（不污染检索）',
    !modelSide.covers.some((c) => c.cover.id === fakeId),
    '模型侧竟然看到了它')
  // 且确认它**确实在库里**（否则上面那条是"因为压根没有"而假绿）
  const humanSide = await B.scanLibrary({ includeHistory: true })
  check('⭐ 但"含 history"的扫描**确实能看到**它（证明上面不是假绿）',
    humanSide.covers.some((c) => c.cover.id === fakeId))

  rmSync(projFile, { force: true })
  rmSync(join(lib, entryRel), { force: true })
}

// ══════════════════════════════════════════════════════════════════════
// 【12】⭐⭐ 外链条目的时间从**封面**取（决策 139）
//
// 🔴 修的是什么：`/covers` 原先只从**正文 frontmatter** 取 `createdAt`/`updatedAt`
//    ⇒ **外链条目的时间恒为空**（库外文件不是 memj 生成的、没有 frontmatter）
//    ⇒ 后果：外链在知识库列表里**不显示更新时间、且排序永远排到最后**。
//    ⚠️ 这与 `archivedAt` 是同一个坑（那行早就写着"必须从 cover 取"），当时漏了这两个字段。
// ══════════════════════════════════════════════════════════════════════
console.log('\n【12】⭐⭐ 外链时间：必须从封面取（决策 139）')
{
  const EXT_TIME_ID = 'cdcdcdcd-1111-4111-8111-111111111111'
  // ⚠️ 用一个**真实存在、但没有 frontmatter** 的库外文件 ⇒ 模拟外链的真实处境。
  const plainExternal = join(lib, 'plain-external.md')
  writeFileSync(plainExternal, '# 库外文档\n\n没有 frontmatter 的正文。\n', 'utf8')
  // 追加到已有的 p1 项目文档末尾（复用现有 fixture 项目）。
  const p1File = join(lib, 'projects', 'HANDOFF-p1.md')
  const before = readFileSync(p1File, 'utf8')
  writeFileSync(
    p1File,
    `${before}\n${renderCover({
      id: EXT_TIME_ID, project: 'p1', theme: [], global: false, kind: 'fact',
      tags: ['ext'], title: '带时间的库外引用', desc: '外链时间测试；当测试排序时读它。',
      ref: plainExternal, ext: true,
      // ⭐ 封面上**有**时间（决策 119 起就有）——这正是要取的值。
      createdAt: '2026-09-21T08:07:50.556Z', updatedAt: '2026-09-21T09:30:00.000Z',
    })}\n`,
    'utf8',
  )

  const cov2 = await call('GET', '/plugins/dsh-memj/api/covers')
  const extRow = (cov2.body.covers ?? []).find((c) => c.id === EXT_TIME_ID)
  check('外链条目出现在 /covers 里', extRow !== undefined, String(EXT_TIME_ID))
  check('⭐⭐ **外链的 updatedAt 非空**（修好后应等于封面上的值）',
    extRow?.updatedAt === '2026-09-21T09:30:00.000Z', JSON.stringify(extRow?.updatedAt))
  check('⭐⭐ **外链的 createdAt 非空**',
    extRow?.createdAt === '2026-09-21T08:07:50.556Z', JSON.stringify(extRow?.createdAt))
  // ⭐ 反证：**正文确实没有 frontmatter** ⇒ 若代码仍从正文取，上面两条必然为空。
  const extDoc = await B.loadEntryDoc(plainExternal, true)
  check('  ⭐ 反证：该库外文件确实**没有 frontmatter**（所以"非空"只能来自封面）',
    (extDoc?.frontmatter?.updatedAt ?? '') === '', JSON.stringify(extDoc?.frontmatter?.updatedAt))

  // ⭐ 内链不受影响（封面与正文同值，回退链仍能取到）。
  const innerRow = (cov2.body.covers ?? []).find((c) => c.id === OK_ID)
  check('⭐ 内链条目的时间照常（没有把内链改坏）',
    innerRow?.updatedAt === '2026-09-19T01:00:00.000Z', JSON.stringify(innerRow?.updatedAt))

  // 复原 fixture（后面的用例还要用这个文件）。
  writeFileSync(p1File, before, 'utf8')
}

// ══════════════════════════════════════════════════════════════════════
// 【13】⭐⭐ `/projects` 按 `updatedAt` **倒序**（最近更新的排最前）
//
// 🔴 修的是什么：`scanLibrary` 原来排序是 `a.id.localeCompare(b.id)`（**字母序**）——
//    `/projects` 直接吃它 ⇒ **`get-handoff` 的弹窗列表也是字母序**，
//    最近在做的项目要翻到底才找得到（用户报的就是这个）。
//    ⭐ 排序改在 `scanLibrary`（唯一全量扫描入口）⇒ 四个消费方一次全对。
//
// ⭐⭐ **本用例的夹具 id 与时间刻意【反序】**：
//    · `zzz-newer`（时间最新、id 字母序最后）
//    · `aaa-older`（时间较旧、id 字母序最前）
//    ⇒ 时间序 = `zzz-newer, aaa-older`，字母序 = `aaa-older, zzz-newer`。
//    ⚠️ **这是反证的关键**：若排序没生效（仍按 id），结果会**正好相反** ⇒ 必然报红。
//    若两者取同序，这条断言就永远绿（摆设），证明不了任何事。
// ══════════════════════════════════════════════════════════════════════
console.log('\n【13】⭐⭐ /projects 按 updatedAt 倒序（get-handoff 弹窗用的就是它）')
{
  const writeProjectFixture = (id, updatedAt, desc) =>
    writeFileSync(
      join(lib, 'projects', `HANDOFF-${id}.md`),
      [
        '---', `project: ${id}`, `title: ${id}`, `desc: ${desc}`, 'themes: []',
        'createdAt: 2026-09-01T00:00:00.000Z', `updatedAt: ${updatedAt}`,
        '---', '', `# HANDOFF — ${id}`, '',
        '## 目标', '', '测试。', '',
      ].join('\n'),
      'utf8',
    )

  writeProjectFixture('zzz-newer', '2026-09-25T00:00:00.000Z', '新的；当测试排序时读它。')
  writeProjectFixture('aaa-older', '2026-09-20T00:00:00.000Z', '旧的；当测试排序时读它。')

  const rp = await call('GET', '/plugins/dsh-memj/api/projects')
  check('/projects 返回 200', rp.status === 200, `实际 ${rp.status}`)
  const ids = (rp.body.projects ?? []).map((p) => p.id)
  check('  含夹具项目 zzz-newer 与 aaa-older',
    ids.includes('zzz-newer') && ids.includes('aaa-older'), JSON.stringify(ids))

  const iz = ids.indexOf('zzz-newer')
  const ia = ids.indexOf('aaa-older')
  check('⭐⭐ **时间新的排在前面**（zzz-newer 在 aaa-older 之前）',
    iz !== -1 && ia !== -1 && iz < ia,
    `实际顺序：${JSON.stringify(ids)}`)
  // ⭐ 反证：确认这个夹具**确实与字母序相反** —— 否则上面那条断言没有区分力。
  check('  ⭐ 反证：该夹具的**字母序与时间序相反**（否则本条测不出东西）',
    'aaa-older'.localeCompare('zzz-newer') < 0 && iz < ia,
    `字母序 = aaa-older 在前；时间序 = zzz-newer 在前`)

  // ⭐⭐ **空 `updatedAt` 必须排最后** —— 库里 `p1` 这个夹具就没有时间字段。
  //    🔴 不能让它靠"空串字典序最小"冒到最前面（`p1` 字母序也确实靠前）。
  const ip = ids.indexOf('p1')
  check('⭐⭐ **没有时间的项目排最后**（空串不冒头）',
    ip === -1 || ip > iz, `p1 在位置 ${ip}，实际顺序 ${JSON.stringify(ids)}`)
  check('  ⭐ 反证：p1 的 updatedAt **确实是空的**（否则本条测不出东西）',
    ((rp.body.projects ?? []).find((p) => p.id === 'p1')?.updatedAt ?? '') === '',
    JSON.stringify((rp.body.projects ?? []).find((p) => p.id === 'p1')?.updatedAt))

  // ⭐⭐ **确定性**：`updatedAt` 相同时用 id 兜底 ⇒ 同一份库两次排序结果一致。
  //    ⚠️ 不兜底的话 `Array.sort` 对相等元素不保证稳定顺序，列表会莫名跳动。
  const same = [
    { id: 'b', frontmatter: { updatedAt: '2026-09-22T00:00:00.000Z' } },
    { id: 'a', frontmatter: { updatedAt: '2026-09-22T00:00:00.000Z' } },
  ]
  check('⭐⭐ 时间相同 ⇒ 按 id 兜底比较（确定性，不随机跳）',
    mod.byUpdatedDesc(same[0], same[1]) > 0 && mod.byUpdatedDesc(same[1], same[0]) < 0,
    '相同 updatedAt 时未按 id 兜底')

  for (const id of ['zzz-newer', 'aaa-older']) rmSync(join(lib, 'projects', `HANDOFF-${id}.md`), { force: true })
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
