/**
 * 模板的 **markdown 格式**（决策 208，2026-10-12）。
 *
 * ── 它测什么 ──────────────────────────────────────────────────────────────
 *  1. `renderTemplateDoc()` ↔ `parseTemplateDoc()` **逐字段往返**；
 *  2. ⭐ **人手改过的 md 也能读**（这是选 md 格式的理由）——
 *     含 `# ` 标题不算节、`<!--truncate-->` 这种没空格的写法也要认；
 *  3. ⭐⭐ **`default` 也落盘且可被用户编辑**，且 `ensureDefaultTemplateFile()`
 *     **幂等、绝不覆盖用户的改动**（否则每次重启都会把用户的修改吃掉）；
 *  4. ⭐ **兼容读旧的 `.json`**（决策 204 的存量不能因改格式而静默消失）；
 *     同名时 `.md` 优先；删除要**清掉两种格式**（否则会"删了又回来"）。
 *
 * ⚠️ 必须在 `node scripts/build.mjs` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-template-md.mjs
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-tplmd-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
let pass = 0
let fail = 0
function check(name, ok, extra = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${extra !== '' ? `　← ${extra}` : ''}`) }
}

console.log('\n【1】渲染成 md')
{
  const T = {
    version: 1, id: 'md-tpl', title: 'MD 模板',
    sections: [{ name: '研究目标', desc: '要回答什么问题' }, { name: '证据', desc: '一手材料', truncate: true }],
  }
  const md = mod.renderTemplateDoc(T)
  check('含 frontmatter id', /^---[\s\S]*id: md-tpl/.test(md))
  check('含 `## 研究目标`', md.includes('## 研究目标'))
  check('含 desc 正文', md.includes('要回答什么问题'))
  // ⭐⭐ 决策 209 改：可截断标记从"标题行末的 HTML 注释"挪到**规范块的围栏起始行**；
  //    desc 也从"标题下裸正文"搬进了 **```memj:spec 围栏**（与项目文档同形）。
  check('⭐ 可截断节的规范块带 `truncate`', md.includes('```memj:spec truncate'))
  check('⭐ desc 写在规范块里', /```memj:spec[^\n]*\n要回答什么问题/.test(md))
  check('不可截断节的规范块不带 `truncate`', md.includes('```memj:spec\n'))
  // ⚠️ **兼容读**：旧形态（标题行末 `<!-- truncate -->` + 裸正文 desc）仍要能解析（存量模板）。
  check('⭐⭐ 旧形态模板仍能解析（存量兼容）', (() => {
    const legacy = ['---', 'version: 1', 'id: lt', 'title: L', '---', '', '## A <!-- truncate -->', '', '甲的说明', ''].join('\n')
    const t = mod.parseTemplateDoc(legacy, 'lt')
    return t?.sections[0]?.truncate === true && t?.sections[0]?.desc === '甲的说明'
  })())

  console.log('\n【2】md → 模板 逐字段往返')
  const back = mod.parseTemplateDoc(md, 'x')
  check('id 一致', back?.id === 'md-tpl')
  check('title 一致', back?.title === 'MD 模板')
  check('节数一致', back?.sections.length === 2)
  check('⭐ 节名一致', back?.sections.map((s) => s.name).join(',') === '研究目标,证据')
  check('⭐ desc 一致', back?.sections.map((s) => s.desc).join('|') === '要回答什么问题|一手材料')
  check('⭐ truncate 还原', back?.sections[0]?.truncate !== true && back?.sections[1]?.truncate === true)
  // ⭐ 幂等：渲染 → 解析 → 再渲染，必须逐字相同（否则每次保存都会改文件）
  check('⭐ 幂等（再渲染逐字相同）', mod.renderTemplateDoc(back) === md)
}

console.log('\n【3】人手改过的 md 也要能读（选 md 格式的理由）')
{
  const hand = [
    '---', 'id: hand', 'title: 手改的', '---', '',
    '# 随便一个标题（不是节）', '',
    '## 甲节', '', '甲要干嘛', '',
    '## 乙节 <!--truncate-->  ', '', '乙要干嘛（标记没空格、标题行尾还有多余空格）', '',
  ].join('\n')
  const h = mod.parseTemplateDoc(hand, 'x')
  check('节名正确（`# ` 不算节）', h?.sections.map((s) => s.name).join(',') === '甲节,乙节')
  check('⭐ 宽容的 truncate 标记也认（`<!--truncate-->`，存量兼容）', h?.sections[1]?.truncate === true)
  check('title 取 frontmatter', h?.title === '手改的')
  // ⭐ 决策 209 新形态：人手写的规范块（缩进、多余空格、`TRUNCATE` 大小写）也要认。
  const hand2 = [
    '## 甲节', '', '  ```memj:spec  ', '  甲要干嘛  ', '  ```', '',
    '## 乙节', '', '```MEMJ:SPEC TRUNCATE', '乙要干嘛', '```', '',
  ].join('\n')
  const h2 = mod.parseTemplateDoc(hand2, 'y')
  check('⭐ 人手写的规范块能读（缩进/空格）', h2?.sections[0]?.desc.trim() === '甲要干嘛')
  check('⭐ 大小写不敏感的 `TRUNCATE` 也认', h2?.sections[1]?.truncate === true)
}

console.log('\n【4】没有 frontmatter ⇒ 用文件名兜底')
{
  const h = mod.parseTemplateDoc('## 只有一节\n\n说明\n', 'from-file')
  check('⭐ id 回落文件名', h?.id === 'from-file')
  check('一个 `## ` 都没有 ⇒ undefined（不猜）', mod.parseTemplateDoc('没有节', 'x') === undefined)
}

console.log('\n【5】⭐ default 落盘 + 幂等（绝不覆盖用户改动）')
{
  const p = join(lib, 'templates', 'default.md')
  check('起始不存在', !existsSync(p))
  check('① ensure ⇒ true（新建了）', (await mod.ensureDefaultTemplateFile()) === true)
  check('① 文件已在盘上', existsSync(p))
  check('  ⭐ 是 md 格式（含 `## 当前进度`）', readFileSync(p, 'utf8').includes('## 当前进度'))
  await mod.saveTemplate({
    version: 1, id: 'default', title: '我改的', sections: [{ name: '唯一节', desc: '改了' }],
  })
  check('② 用户改动落盘', (await mod.loadDefaultTemplate()).sections[0].name === '唯一节')
  check('⭐⭐ 再 ensure ⇒ false（不覆盖）', (await mod.ensureDefaultTemplateFile()) === false)
  check('⭐⭐ 内容仍是用户那份', (await mod.loadDefaultTemplate()).sections[0].name === '唯一节')
}

console.log('\n【6】⭐ 兼容读旧 .json + 优先级 + 删除')
{
  writeFileSync(join(lib, 'templates', 'legacy.json'), JSON.stringify({
    version: 1, id: 'legacy', title: '旧格式', sections: [{ name: '旧节', desc: '旧说明' }],
  }), 'utf8')
  check('⭐ 旧 .json 仍能读出来', (await mod.loadTemplate('legacy'))?.sections[0].name === '旧节')
  const all = await mod.listTemplates()
  check('⭐ 它出现在列表里', all.some((t) => t.id === 'legacy'))
  check('  default 也在列表里（且是用户改过那份）',
    all.find((t) => t.id === 'default')?.sections[0].name === '唯一节')

  writeFileSync(join(lib, 'templates', 'both.md'), '---\nid: both\ntitle: 新\n---\n\n## 新节\n\n新说明\n', 'utf8')
  writeFileSync(join(lib, 'templates', 'both.json'), JSON.stringify({
    version: 1, id: 'both', title: '旧', sections: [{ name: '旧节', desc: 'x' }],
  }), 'utf8')
  check('⭐⭐ 同名时 .md 优先', (await mod.loadTemplate('both'))?.sections[0].name === '新节')

  await mod.deleteTemplate('both')
  check('⭐ 删除清掉 .md', !existsSync(join(lib, 'templates', 'both.md')))
  check('⭐ 删除也清掉 .json（否则会"删了又回来"）', !existsSync(join(lib, 'templates', 'both.json')))
  check('🔴 default 不可删', (await mod.deleteTemplate('default')) === false)
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 模板 md 格式：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
