/**
 * 「本档写作规范」节：模板与提示词解耦（2026-10-12）。
 *
 * ── 它测什么 ──────────────────────────────────────────────────────────────
 *  1. **规范节落进文档正文**（`## 本档写作规范`，排在叙事末尾）；
 *  2. **建项目 = 从模板复制**：新建时规范节内容来自该模板的 desc；
 *  3. ⭐ **已有文档按自己那份走**（改模板**不影响**它）——这是"解耦"的核心；
 *  4. **节名正文优先**：`docSectionsOf` 在 frontmatter 为空时靠正文拿到正确结构；
 *  5. **可截断节也从规范节反解**（`truncateTitlesFromSpec`）；
 *  6. ⭐⭐ **反证（本次真 bug 的根因）**：模拟 `rebuildDerivedLayers` 把 frontmatter
 *     字段抹掉后，节名**仍然正确** —— 证明权威真的落在正文上（而不是"恰好没被抹"）。
 *
 * ⚠️ 必须在 `node scripts/build.mjs` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-spec-section.mjs
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-spec-'))
process.env['MEMJ_DATA_DIR'] = lib

const LIBDIR = join(process.cwd(), 'lib')
const mod = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)

let pass = 0
let fail = 0
function check(name, ok, extra = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${extra !== '' ? `　← ${extra}` : ''}`) }
}

const CFG = mod.DEFAULT_CONFIG
const runHandoff = mod.runHandoff
const loadProjectDoc = mod.loadProjectDoc
const appendDocRead = mod.appendDocRead
const saveTpl = mod.saveTemplate
const rebuild = mod.rebuildDerivedLayers

console.log('\n【1】纯函数：规范节的渲染 / 提取 / 砍掉 / 反解')
{
  const t = {
    version: 1, id: 'demo', title: 'D',
    sections: [
      { name: '目标', desc: '要做什么' },
      { name: '进展', desc: '做到哪了', truncate: true },
    ],
  }
  const spec = mod.renderSpecSection(t)
  check('渲染出 `## 本档写作规范` 标题', spec.startsWith('## 本档写作规范'))
  check('含节数插槽被填（共 2 节）', spec.includes('2'))
  check('含每节的 desc（要做什么）', spec.includes('要做什么'))
  check('⭐ 带截断标记', spec.includes(mod.TPL_GUIDANCE_TRUNC_MARK))
  check('含「沉淀知识」由工具生成那句', spec.includes(mod.KNOWLEDGE_TITLE))
  check('声明本节由工具维护', spec.includes('由工具维护'))

  const doc = `## 目标\n\n正文 A\n\n${spec}\n\n## 沉淀知识\n\n（封面）\n`
  const got = mod.extractSpecSection(doc)
  check('extractSpecSection 取得完整一节', got.startsWith('## 本档写作规范') && got.includes(mod.TPL_GUIDANCE_TRUNC_MARK))
  const cut = mod.cutSpecSection(doc)
  check('cutSpecSection 砍掉规范节', !cut.includes('本档写作规范'))
  check('⭐ 保住它后面的「沉淀知识」', cut.includes('沉淀知识'))
  check('保住它前面的正文', cut.includes('正文 A'))

  check('反解可截断节 ⇒ 进展', mod.truncateTitlesFromSpec(spec).join(',') === '进展')
  const t2 = { version: 1, id: 'd2', title: 'D2', sections: [{ name: '目标', desc: 'x' }] }
  check('没有节声明 truncate ⇒ 反解为空', mod.truncateTitlesFromSpec(mod.renderSpecSection(t2)).length === 0)

  // 幂等：渲染两次必须逐字相同（否则每次落盘都会改文档）
  check('⭐ renderSpecSection 幂等', mod.renderSpecSection(t) === spec)
}

console.log('\n【2】节名正文优先（docSectionsOf）')
{
  const body = '## 研究目标\n\nA\n\n## 公司画像\n\nB\n\n## 沉淀知识\n\n'
  check('正文优先：从正文拿到节名',
    mod.docSectionsOf(body, ['目标', '进展']).join(',') === '研究目标,公司画像')
  check('⭐ 排除「沉淀知识」', !mod.docSectionsOf(body, []).includes('沉淀知识'))
  check('正文为空 ⇒ 回落 frontmatter', mod.docSectionsOf('', ['A', 'B']).join(',') === 'A,B')
  check('两者都空 ⇒ 默认六节', mod.docSectionsOf('', []).join(',') === mod.NARRATIVE_TITLES.join(','))
  const specBody = `## 目标\n\nx\n\n## 本档写作规范\n\n- \`## 目标\` —— y\n`
  check('⭐ 排除「本档写作规范」', !mod.docSectionsOf(specBody, []).includes('本档写作规范'))
}

console.log('\n【3】建项目 = 从模板复制规范（自定义模板）')
{
  await saveTpl({
    version: 1, id: 'spec-tpl', title: 'SP',
    sections: [
      { name: '研究目标', desc: '这家公司要回答什么问题' },
      { name: '证据', desc: '支撑结论的一手材料', truncate: true },
    ],
  })
  const r = await runHandoff(
    { project: 'spec-proj', projectDesc: 'sp；当 x 时读它。', doc: '## 研究目标\n\nQ\n\n## 证据\n\nE\n', template: 'spec-tpl', confirmCreate: true },
    { sessionId: 's-spec', config: CFG, turn: 1 },
  )
  check('用模板建项目成功', r.ok, r.message.slice(0, 200))
  const text = readFileSync(join(lib, 'projects', 'HANDOFF-spec-proj.md'), 'utf8')
  check('⭐ 文档正文里有 `## 本档写作规范`', text.includes('## 本档写作规范'))
  const spec = mod.extractSpecSection(text)
  check('⭐ 规范里有该模板的 desc（这家公司要回答什么问题）', spec.includes('这家公司要回答什么问题'))
  check('⭐ 规范里有截断标记（证据那节）', spec.includes(mod.TPL_GUIDANCE_TRUNC_MARK))
  const d = await loadProjectDoc('spec-proj')
  check('frontmatter 的 sections 是正文镜像',
    (d?.frontmatter.sections ?? []).join(',') === '研究目标,证据')
  check('frontmatter 的 truncateSections 由规范反解',
    (d?.frontmatter.truncateSections ?? []).join(',') === '证据')
}

console.log('\n【4】⭐⭐ 已有文档按自己那份走（改模板不影响它）')
{
  // 改掉模板内容（desc 大改 + 取消截断）
  await saveTpl({
    version: 1, id: 'spec-tpl', title: 'SP2',
    sections: [{ name: '研究目标', desc: '【改过了】全新的说明' }],
  })
  await appendDocRead('s-spec', { project: 'spec-proj', turn: 2, readAt: new Date().toISOString(), full: true, sections: [] })
  const r = await runHandoff(
    { project: 'spec-proj', doc: '## 证据\n\nE2\n' },
    { sessionId: 's-spec', config: CFG, turn: 2 },
  )
  check('更新成功', r.ok, r.message.slice(0, 200))
  const d = await loadProjectDoc('spec-proj')
  const spec = mod.extractSpecSection(d?.narrative ?? '')
  check('⭐⭐ 文档**仍保留**自己的旧规范（不被模板覆盖）', spec.includes('这家公司要回答什么问题'))
  check('⭐⭐ 且**没有**混进模板的新说明', !spec.includes('【改过了】'))
  check('⭐⭐ 节名仍按文档自己（研究目标,证据）',
    (d?.frontmatter.sections ?? []).join(',') === '研究目标,证据')
}

console.log('\n【5】⭐⭐⭐ 反证：rebuild 抹掉 frontmatter 后，节名仍然正确')
{
  // 模拟 `rebuildDerivedLayers()` 的旁路重写：只留它那张字段表（抹掉 sections/template/truncateSections）
  const p = join(lib, 'projects', 'HANDOFF-spec-proj.md')
  const raw = readFileSync(p, 'utf8')
  const rest = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  writeFileSync(p, [
    '---',
    'project: spec-proj',
    'desc: sp；当 x 时读它。',
    'themes: []',
    '---',
    '',
    rest,
  ].join('\n'), 'utf8')

  const d2 = await loadProjectDoc('spec-proj')
  check('前提：frontmatter 的 sections 确实被抹空了', (d2?.frontmatter.sections ?? []).length === 0)
  check('前提：frontmatter 的 truncateSections 也被抹空', (d2?.frontmatter.truncateSections ?? []).length === 0)
  check('⭐⭐⭐ 但节名**仍然正确**（从正文拿到）',
    mod.docSectionsOf(d2?.narrative ?? '', d2?.frontmatter.sections).join(',') === '研究目标,证据')
  check('⭐⭐⭐ 可截断节也仍然正确（从规范节反解）',
    mod.truncateTitlesFromSpec(mod.extractSpecSection(d2?.narrative ?? '')).join(',') === '证据')

  // 再跑一次 handoff：正文里还有规范 ⇒ 必须保住，且不得插进默认六节
  await appendDocRead('s-spec', { project: 'spec-proj', turn: 3, readAt: new Date().toISOString(), full: true, sections: [] })
  const r = await runHandoff(
    { project: 'spec-proj', doc: '## 证据\n\nE3\n' },
    { sessionId: 's-spec', config: CFG, turn: 3 },
  )
  check('被抹字段后 handoff 仍成功', r.ok, r.message.slice(0, 200))
  const after = readFileSync(p, 'utf8')
  const tops = mod.sectionsFromNarrative(mod.narrativeFromProjectText(after))
  check('⭐⭐⭐ 没有插进任何默认六节', !tops.some((t) => ['目标', '当前进度', '有效做法', '失败/踩坑', '关键上下文', '下一步'].includes(t)),
    `实际节：${tops.join(',')}`)
  check('⭐⭐⭐ 原有两节都在', tops.join(',') === '研究目标,证据')
  check('⭐ 规范节被保住（没被砍掉）', after.includes('## 本档写作规范'))
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 本档写作规范：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
