// 英文召回索引（设计文档 §9）的测试。
//
// 覆盖四类：
//   ① **纯逻辑**（`descHashOf` / 漏翻判据）—— 直接 import 构建产物
//   ② **防递归的静态反证**：`en-index` 的**代码里不得出现 `sessionId`**
//   ③ **静态检查**：产物里含 `MEMJ_EN_INDEX_TIMEOUT`、配置默认关
//   ④ **索引文件体检**（存在才做）：结构 / 字段 / 与库的封面数一致
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LIB = join(ROOT, 'lib', 'index.js')

let pass = 0, fail = 0
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`) }
}

console.log('【1】纯逻辑：descHashOf 与漏翻判据')
let mod
try {
  mod = await import('file://' + LIB.replace(/\\/g, '/'))
  check('能 import 构建产物 lib/index.js', true)
} catch (e) {
  check('能 import 构建产物 lib/index.js', false, e.message)
}
if (mod) {
  check('导出了 descHashOf', typeof mod.descHashOf === 'function')
  check('导出了 leakedHan', typeof mod.leakedHan === 'function')
  check('导出了 enIndexPath', typeof mod.enIndexPath === 'function')

  if (typeof mod.descHashOf === 'function') {
    const a = mod.descHashOf('同一段描述')
    const b = mod.descHashOf('同一段描述')
    const c = mod.descHashOf('另一段描述')
    check('同 desc ⇒ 同 hash（幂等）', a === b)
    check('⭐ 反证：不同 desc ⇒ 不同 hash（否则保鲜判据失效）', a !== c)
    check('hash 是 8 位十六进制', /^[0-9a-f]{8}$/.test(a), a)
  }

  if (typeof mod.leakedHan === 'function') {
    // 正向：普通词被原样搬进译文 ⇒ 判为漏翻
    const leak = mod.leakedHan({
      title: '纯函数测试覆盖不到工具层契约', desc: '正文',
      titleEn: 'Pure functions miss the tool-layer 契约', descEn: 'body',
    })
    check('⭐ 普通中文词残留在译文里 ⇒ 判为漏翻', leak.includes('契约'), JSON.stringify(leak))

    // 🔴 反证：原文里被引号包裹的示例串**不该**判为漏翻
    const quoted = mod.leakedHan({
      title: '读到「鏂规」这类乱码', desc: '正文',
      titleEn: 'corrupted characters (such as “鏂规”)', descEn: 'body',
    })
    check('⭐⭐ 反证：原文引号包裹的示例串 ⇒ **不**判为漏翻', quoted.length === 0, JSON.stringify(quoted))

    check('无中文 ⇒ 返回空数组', mod.leakedHan({ title: 'a', desc: 'b', titleEn: 'A', descEn: 'B' }).length === 0)
  }
}

console.log('\n【2】🔴 防递归：en-index 的代码里不得出现 `sessionId`')
{
  const src = readFileSync(join(ROOT, 'src', 'en-index.ts'), 'utf8')
  // 去掉注释后再查（注释里**可以**写 sessionId —— 那正是解释为什么不能传的地方）
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('⭐⭐ 代码里不出现 sessionId（否则会触发 llm/stream 监听 ⇒ 递归）', !/sessionId/.test(code))
  // 反证：确认上面的"去注释"没把整段代码也去掉
  check('⭐ 反证：去注释后仍含 llm 取用', /llm\.stream|llm\?\.stream/.test(code))
}

console.log('\n【2b】🔴🔴 取 llm 服务必须用 `ctx.get(\'llm\')`，不是 `ctx.llm`')
{
  // 🔴 2026-09-26 实测踩到：写成 `ctx.llm` ⇒ undefined ⇒ TypeError 被 catch 吞掉
  //    ⇒ 3 条新知识进了索引、**译文全是空串**，而索引顶层却记着正确的 provider
  //    ⇒ 看着像"上游拒绝翻译"，实际**根本没发出去**。
  const src = readFileSync(join(ROOT, 'src', 'en-index.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('⭐⭐ 代码里用 ctx.get(\'llm\') 取服务', /ctx\.get\(['"]llm['"]\)/.test(code))
  check('⭐⭐ 反证：代码里**不出现** `ctx.llm.`（属性访问恒为 undefined）', !/ctx\.llm\./.test(code))
  // 与仓库既有写法对齐（hot-watch 的 resolveContextWindow 就是 ctx.get('llm')）
  const hw = readFileSync(join(ROOT, 'src', 'hot-watch.ts'), 'utf8')
  check('⭐ 与既有先例一致（hot-watch.ts 也用 ctx.get(\'llm\')）', /ctx\.get\(['"]llm['"]\)/.test(hw))
}

console.log('\n【3】静态检查：产物与默认值')
{
  const lib = readFileSync(LIB, 'utf8')
  check('产物含超时码 MEMJ_EN_INDEX_TIMEOUT（走了官方 deadline）', lib.includes('MEMJ_EN_INDEX_TIMEOUT'))
  check('产物含 /models 路由（设置面板的下拉框数据源）', lib.includes('/models'))
  check('产物含两个模板常量（mt 的强指令与 instruct 的 JSON 要求）',
    lib.includes('EXACTLY two lines') && lib.includes('english description'))

  const cfg = readFileSync(join(ROOT, 'src', 'config.ts'), 'utf8')
  // 🔴🔴 **必要功能 ⇒ 默认开**（用户 2026-09-26 裁定："英文索引功能不需要开关。是必要功能。"）
  check('⭐⭐ 默认**开**（必要功能，不是可选开关）', /enIndex:\s*z\.boolean\(\)\.default\(true\)/.test(cfg))
  check('默认配置里也是 true', /^\s*enIndex:\s*true,/m.test(cfg))
  check('translateTemplate 是受控两值', /z\.const\('instruct'\),\s*z\.const\('mt'\)/.test(cfg))

  // ⭐ 面板上**不该有**这个开关（它是必要功能）—— 反证式检查
  const html = readFileSync(join(ROOT, 'src', 'web', 'index.html'), 'utf8')
  check('⭐⭐ 设置面板上**没有** enIndex 开关（必要功能不给人关）', !html.includes('id="en-index-enabled"'))

  const idx = readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8')
  check('已注册 /models 路由（漏了会静默返回 HTML）', idx.includes('${API_BASE}/models'))
}

console.log('\n【3c】⭐⭐ 同档重试必须存在（否则一次抖动烧掉全部三级）')
{
  // 🔴 2026-09-26 实测：3 条里有 1 条**三级全失败**（MT 把标题与描述合并成一行），
  //    而同一输入再跑一次就成功 ⇒ 偶发。三级是**换策略**、不是**重试**
  //    ⇒ 没有同档重试时，那次抖动会直接烧掉全部三级、该条留空到下次重建。
  const src = readFileSync(join(ROOT, 'src', 'en-index.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('⭐⭐ 存在 withRetry 辅助', /async function withRetry/.test(code))
  check('⭐⭐ 三级修法的每一级都走 withRetry', (code.match(/await withRetry\(/g) ?? []).length >= 3)
  // ⚠️ 配置项在 **config.ts**，不在 en-index.ts —— 我第一次查错了文件（断言读的是 src）
  const cfg2 = readFileSync(join(ROOT, 'src', 'config.ts'), 'utf8')
  check('⭐⭐ 配置项 translateRetries 存在（范围 0–5）',
    /translateRetries:\s*z\.natural\(\)\.min\(0\)\.max\(5\)\.default\(\d\)/.test(cfg2))
  check('默认值 ≥1（默认每级试 2 次）', /translateRetries:\s*[1-5],/.test(cfg2))
  check('⭐ 退避用了 sleep（不是忙等/裸重试）', /function sleep\(/.test(code) && /\bawait sleep\(/.test(code))

  // 反证：确认去掉注释后仍能看到三级模板常量（否则上面的"≥3"可能是别处来的）
  check('⭐ 反证：去注释后仍含两个 MT 模板常量',
    code.includes('EXACTLY two lines') && code.includes('Translate the following numbered'))
}

console.log('\n【3d】⭐⭐ 「检查并补全」按钮：判据必须与启动兜底同源')
{
  // 🔴 本项目铁律「同一判据只能有一份实现」：
  //    页面体检与启动兜底若各算各的，迟早出现"页面说健康、启动说要重建"。
  const src = readFileSync(join(ROOT, 'src', 'en-index.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('⭐⭐ 导出了 checkIndex（体检报告）', /export async function checkIndex/.test(code))
  check('⭐⭐ 导出了 checkAndRepair（检查+按需补全）', /export async function checkAndRepair/.test(code))
  // ⭐ 关键：启动兜底**也调用 checkIndex**（而不是自己再算一遍）
  // ⚠️ 反证要**只取 registerEnIndex 的函数体** —— 它调用 checkIndex，
  //    而 checkIndex 定义在它**之后** ⇒ 单纯 `indexOf` 切片会把它俩连起来
  //    （我第一次就是这么误报的）。
  const regStart = code.indexOf('export function registerEnIndex')
  const regBody = code.slice(regStart, code.indexOf('})()', regStart) + 4)
  check('⭐⭐ 启动兜底也走 checkIndex（判据同源）', /await checkIndex\(/.test(regBody))
  check('⭐⭐ 反证：启动兜底**函数体内**不再自己算 coverCount 比对',
    !/coverCount/.test(regBody), `regBody 长度 ${regBody.length}`)
  // 没拿到 force 时不得无条件重建
  check('⭐ checkAndRepair 按 needsRepair 决定要不要重建', /if \(!health\.needsRepair/.test(code))

  const api = readFileSync(join(ROOT, 'src', 'api.ts'), 'utf8')
  check('⭐⭐ 已加 /index-check 路由', api.includes("'/index-check'"))
  check('⭐⭐ 该路由只接受 POST（它是写操作）', /route === '\/index-check'[\s\S]{0,160}method !== 'POST'/.test(api))
  const idx2 = readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8')
  check('⭐⭐ 路由白名单里也注册了（漏了会静默返回 HTML）', idx2.includes('${API_BASE}/index-check'))

  const app = readFileSync(join(ROOT, 'src', 'web', 'app.js'), 'utf8')
  check('⭐ 前端有两个按钮的监听', /idx-check-btn'\)\?\.addEventListener/.test(app) && /idx-rebuild-btn'\)\?\.addEventListener/.test(app))
  check('⭐ 强制重建前有确认（它会真花钱）', /window\.confirm\(/.test(app))
  const html = readFileSync(join(ROOT, 'src', 'web', 'index.html'), 'utf8')
  check('⭐ 面板里有检查按钮与提示区', html.includes('id="idx-check-btn"') && html.includes('id="idx-check-msg"'))
  check('⭐ 有明细区（逐项摊开）', html.includes('id="idx-check-detail"'))
}

console.log('\n【3e】🔴 needsRepair 的构成（隔离实测修正过的判据）')
{
  // 🔴 实测踩到：第一版把"缺译文"也算进 needsRepair ⇒ 在**没有翻译路由**的环境里
  //    每次点「检查并补全」都会白重建一次（重建也翻不出来）。
  //    ⇒ 判据必须是：**结构类**（重建能修）or **有路由的内容类**。
  const src = readFileSync(join(ROOT, 'src', 'en-index.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('⭐⭐ 有 structural 数组（结构类问题单独归类）', /const structural: string\[\] = \[\]/.test(code))
  check('⭐⭐ needsRepair 由 structural 与"有路由的内容类"两项构成',
    /const needsRepair = structural\.length > 0 \|\| contentFixable/.test(code))
  check('⭐⭐ contentFixable 要求 route 存在', /const contentFixable = route !== undefined/.test(code))
  // 🔴 反证：返回对象里**不得**再用旧的 `problems.some(...)` 算 needsRepair
  check('⭐⭐ 反证：返回值里不再用 problems.some 现算 needsRepair',
    !/needsRepair: problems\.some\(/.test(code))
  check('⭐ 返回的是上面算好的 needsRepair', /^\s*needsRepair,\s*$/m.test(code))
}

console.log('\n【3f】⭐⭐ 归属漂移必须是判据之一（2026-09-26 核实的判据盲区）')
{
  // 🔴 实测：把某条的 project/theme 改掉后，原来那六项判据**一条都发现不了**
  //    （ghost=0 / absent=0 / staleHash=0 / untranslated=0 / leaked=0）
  //    ⇒ 而 `project`/`project+themes` **范围筛选会用错归属**。
  //    ⭐ 人侧（网页）与 LLM 侧都能改它（moveEntry / editEntryThemes / renameProject …）。
  const src = readFileSync(join(ROOT, 'src', 'en-index.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('⭐⭐ 算了 metaDrift（条目 project/theme 与库对比）', /let metaDrift = 0/.test(code) && /metaDrift\+\+/.test(code))
  check('⭐⭐ 算了 projectDrift（项目 themes 映射对比）', /let projectDrift = 0/.test(code) && /projectDrift\+\+/.test(code))
  check('⭐⭐ metaDrift 进了 structural（⇒ 会触发重建）',
    /metaDrift > 0[\s\S]{0,160}structural\.push/.test(code))
  check('⭐⭐ projectDrift 进了 structural', /projectDrift > 0[\s\S]{0,160}structural\.push/.test(code))
  check('⭐ 接口暴露了这两个字段', /metaDrift: number/.test(src) && /projectDrift: number/.test(src))
  const app2 = readFileSync(join(ROOT, 'src', 'web', 'app.js'), 'utf8')
  check('⭐ 面板明细里显示这两项', /归属漂移/.test(app2) && /项目主题映射漂移/.test(app2))
}

console.log('\n【3b】🔴 前端提交的数字必须是 Number（踩过的真 bug）')
{
  const app = readFileSync(join(ROOT, 'src', 'web', 'app.js'), 'utf8')
  // 🔴 实测踩到：直接提交 DOM 的 `.value`（字符串 "3"）⇒ 服务端 `typeof n !== 'number'` 判真
  //    ⇒ 报「translateConcurrency 必须是 1–20 之间的整数」，而输入框里明明写着 3。
  // ⚠️ 决策 169：改成"**只在本页才去读值**"（`onIndex ? num(...) : SKIP`）——
  //    因为别页的输入框**没预填**，无条件读会拿到空串 ⇒ 报错 ⇒ 那页存不了（实测踩到）。
  //    ⇒ 断言同步成新形态（**不是放宽**：仍要求它必须是 `num()` 出来的 Number）。
  check('⭐ translateConcurrency 走 `num()` 校验（拿到 Number，不是 DOM 字符串）',
    /const trConcR = (onIndex \? )?num\('tr-conc'/.test(app))
  check('提交的是 `trConcR.value`（num 返回的 Number）', /translateConcurrency:\s*trConcR\.value,/.test(app))
  check('⭐⭐ 反证：不再出现 `enBoxR`（面板上已无该开关）', !/enBoxR/.test(app))
}

console.log('\n【4】索引文件体检（存在才做）')
{
  const p = join(homedir(), '.dsh-memj', 'recall', 'en-index.json')
  if (!existsSync(p)) {
    console.log('  ⏭  索引文件不存在（总开关未开时正常）——跳过')
  } else {
    const j = JSON.parse(readFileSync(p, 'utf8'))
    const ids = Object.keys(j.entries ?? {})
    check('version === 1', j.version === 1)
    check('entries 非空', ids.length > 0, String(ids.length))
    check('coverCount 与 entries 条数一致', j.coverCount === ids.length, `${j.coverCount} vs ${ids.length}`)

    const need = ['project', 'theme', 'kind', 'title', 'desc', 'titleEn', 'descEn', 'descHash', 'translatedAt']
    const missing = need.filter((k) => Object.values(j.entries).some((e) => e[k] === undefined))
    check('⭐ 9 个字段**一个都不缺**（B 方案要能独立支撑召回）', missing.length === 0, missing.join(','))

    const noEn = Object.values(j.entries).filter((e) => e.titleEn === '' || e.descEn === '')
    console.log(`  ℹ️ 无译文的条目：${noEn.length}（未配翻译模型时正常）`)

    check('⭐ 带 projects 映射（project+themes 范围要用）', j.projects !== undefined && Object.keys(j.projects).length > 0)
    const themeOk = Object.values(j.projects).every((v) => Array.isArray(v.themes))
    check('projects 每项都有 themes 数组', themeOk)

    const hashBad = Object.values(j.entries).filter((e) => mod?.descHashOf && e.descHash !== mod.descHashOf(e.desc)).length
    check('⭐ descHash 与中文 desc 一一对应', hashBad === 0, String(hashBad))

    if (mod?.leakedHan) {
      const leaks = Object.values(j.entries).filter((e) => e.titleEn !== '' && mod.leakedHan(e).length > 0)
      check('⭐ 无漏翻残留（判据：未被原文引号包裹的中文）', leaks.length === 0,
        leaks.slice(0, 3).map((e) => e.title.slice(0, 16)).join(' | '))
    }
  }
}

console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
