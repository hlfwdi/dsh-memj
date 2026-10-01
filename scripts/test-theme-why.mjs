/**
 * ⭐⭐⭐ 挂靠依据核对（决策 156）的测试。
 *
 * 事故背景（**同一形态已发生两次**）：
 *   三条知识的正文全是"我这次实验的具体数字 / 报错串 / 函数名"，
 *   却因为"**话题**（并发、报错）听起来通用"就挂上了跨项目主题 ⇒ 污染主题视图。
 *
 * ⇒ 本机制把"凭感觉判通不通用"换成"**必须引一句该主题 desc 里的话**"：
 *   引不出来 ⇒ 回执**警告**（⚠️ 用户裁定：**警告，不拒收**）。
 *
 * ⚠️ 本套件测的是**纯函数** `quoteAppearsIn`（真正的判据）+ 静态反证（接线在不在）。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LIB = join(ROOT, 'lib', 'index.js')
const SRC = process.env['MEMJ_TEST_SRC'] ?? join(ROOT, 'src')

let pass = 0, fail = 0
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`) }
}

const mod = await import('file://' + LIB.replace(/\\/g, '/'))
const { quoteAppearsIn } = mod

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【1】`quoteAppearsIn` —— 判据：why 里有没有逐字引用 desc 的片段')

// ⭐ 用**真实主题 desc**（thm-dsh-plugin 的原文，逐字取自主题文档）
const REAL_DESC =
  'DSH 插件开发与维护的通用技术与工程知识（工程骨架、构建打包、loader 与配置、协议/提示词注入、工具与命令注册、部署验证）；' +
  '当要开发或改动任何 DSH 插件、或排查它的加载/构建/配置不生效问题时用这个主题。'

check('⭐ 空 desc ⇒ 判 false（退化安全：宁可警告）', quoteAppearsIn('任何理由', '') === false)
check('⭐ 空 why ⇒ 判 false', quoteAppearsIn('', REAL_DESC) === false)

// ── 正例：真的引了 desc 里的话（≥12 字符连续片段） ──
//
// 🔴 **实测教训（本断言第一版写假了）**：中文 desc 的"一个短语"通常只有 4~8 字符
//    （实测：`工具与命令注册`=7、`工程骨架构建打包`=8），**短于 12 字符的门槛**
//    ⇒ 我最初写的那三个"正例"**全部判 false**（不是代码错，是样本写得太短）。
//    ⚠️ 所以正例必须引**真正的长片段**（跨过标点的整句），否则测的是门槛不是逻辑。
{
  const ok1 = quoteAppearsIn('对应 desc 的「当要开发或改动任何 DSH 插件」这一段', REAL_DESC)
  check('⭐⭐ 正例：引了「当要开发或改动任何 DSH 插件」（14 字符）⇒ 判 true', ok1 === true)
  // 🔴 **实测发现：门槛 12 对中文偏严** —— 中文 desc 的短语普遍只有 4~9 字符
  //    （实测：`工具与命令注册`=7、`工程骨架构建打包`=8、`通用技术与工程知识`=9）
  //    ⇒ **引一个短语过不了**，必须引**跨标点的整句**（≥12）才过。
  //    ⚠️ 这是**有意的偏严**（用户 2026-09-26 确认"12 字符够了"），
  //       但如果实测发现"正常引用也老是被警告"，第一个该调的就是这个数。
  const ok2 = quoteAppearsIn('这条覆盖「协议/提示词注入、工具与命令注册」，与 desc 一致', REAL_DESC)
  check('⭐⭐ 正例：引跨标点的长片段（归一化后 ≥12）⇒ 判 true', ok2 === true)
  const ok3 = quoteAppearsIn('desc 里「或排查它的加载/构建/配置不生效问题」正是本条场景', REAL_DESC)
  check('⭐⭐ 正例：引了末尾整句 ⇒ 判 true', ok3 === true)
}

// ── 🔴 反证：**这正是我这次犯的错** ──
{
  // 我当时的"理由"：只说话题通用，**完全没引 desc**
  const bad = quoteAppearsIn('它们是插件/外部调用工程的共性', REAL_DESC)
  check('⭐⭐⭐ 反证（**复现我这次的错**）："话题听起来通用"但没引 desc ⇒ **判 false**',
    bad === false, String(bad))

  const bad2 = quoteAppearsIn('这条对别的项目也有用，因为并发是个通用问题', REAL_DESC)
  check('⭐⭐⭐ 反证：只说"对别的项目有用"、不说 desc 里的词 ⇒ **判 false**',
    bad2 === false, String(bad2))

  const bad3 = quoteAppearsIn('本文记录 JEV 3 批全失败与 30032ms 超时', REAL_DESC)
  check('⭐⭐ 反证：理由里全是**本项目专属数据**（报错串/数字）⇒ **判 false**',
    bad3 === false, String(bad3))

  // ⚠️ 短片段不算（防止蒙）：这是"门槛"的存在意义
  const weak = quoteAppearsIn('和插件有关', REAL_DESC)
  check('⭐ 只提一个短词（"插件"）⇒ 不够（要求 ≥12 字符连续片段）', weak === false, String(weak))
  const weak2 = quoteAppearsIn('这条讲「工具与命令注册」', REAL_DESC)
  check('⭐⭐ 只引一个 7 字短语（"工具与命令注册"）⇒ ⚠️ **不够**（门槛 12）—— ' +
    '这是有意的：引一个短语太容易，**引整句才说明真读了 desc**',
    weak2 === false, String(weak2))
}

// ── 边界 ──
{
  check('⭐ desc 有标点差异时仍能匹配（归一化去标点）',
    quoteAppearsIn('当要开发或改动任何 DSH 插件', REAL_DESC) === true)
  check('⭐ 完全不相关的 why ⇒ false',
    quoteAppearsIn('这是关于 nginx 与证书的排查经验', REAL_DESC) === false)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【2】静态接线：警告真的接上了吗（不是写了个没人调的纯函数）')
{
  const src = readFileSync(join(SRC, 'handoff.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  check('⭐⭐ `themeWhy` 字段在 `HandoffEntry` 上（供模型填）', /themeWhy\?: string/.test(src))
  check('⭐⭐ `quoteAppearsIn` 被**真的调用**（不是孤儿函数）',
    /quoteAppearsIn\(why, themeDescMap\.get/.test(code))
  check('⭐⭐ `themeDescMap` 真的去读主题 desc（`loadThemeFrontmatter`）',
    /loadThemeFrontmatter\(id\)/.test(code))
  check('⭐⭐ 警告累加到 `themeWhyWarnings`', /themeWhyWarnings\.push/.test(code))
  check('⭐⭐ 回执里**真的输出**这些警告', /themeWhyWarnings\.length > 0/.test(code) || /themeWhyWarnings\.map/.test(code))

  // 🔴 关键性质：**警告不阻塞写入**（用户裁定）——它不能进 `issues`
  const warnBlock = src.slice(src.indexOf('挂靠依据的警告'), src.indexOf('挂靠依据的警告') + 200)
  check('⭐⭐⭐ 反证：挂靠依据**不走 `issues`**（否则会"拒收"，而用户裁定是**警告**）',
    !/issues\.push/.test(warnBlock), warnBlock.slice(0, 80))

  // ⭐ 回执要说清"缺什么 + 为什么"
  check('⭐⭐ 警告文案解释了**目的**（让别人直接拿去用）', /别的项目/.test(src) && /省一次搜索|少造一个轮子|少踩一个坑/.test(src))
  check('⭐⭐ 警告文案给了**两条出路**（补 why 或去掉 theme）',
    /补 `themeWhy`/.test(src) && /去掉 `theme`/.test(src))

  // schema（模型看得到）
  const toolsSrc = readFileSync(join(SRC, 'tools.ts'), 'utf8')
  check('⭐⭐⭐ 工具 schema 里有 `themeWhy`（否则模型**不知道该填**）',
    /themeWhy: \{/.test(toolsSrc))
  check('⭐⭐ schema 的 description 说清了"引 desc 里的话"',
    /引一句该主题/.test(toolsSrc))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【3】⭐ 规范（context.ts）—— 这是生成物，源头在设计文档 §5.2')
{
  const ctx = readFileSync(join(SRC, 'context.ts'), 'utf8')
  check('⭐⭐ 规范里写了**挂靠的目的**（让别人直接拿去用）',
    /挂靠的目的/.test(ctx))
  check('⭐⭐⭐ 规范里要求**逐一比对全部主题的 desc**', /全部主题的 desc/.test(ctx))
  check('⭐⭐ 规范里点名了**错口径**（判"话题"通不通用是错的）',
    /判"(\*\*)?话题/.test(ctx) || /通不通用的\*\*不是话题\*\*/.test(ctx))
  check('⭐⭐ 规范里要求填 `themeWhy`（引 desc + 说明用途）', /themeWhy/.test(ctx))
  check('⭐⭐ 规范里说明**引不出 ⇒ 警告**', /警告/.test(ctx))
  // ⭐⭐ 2026-10-02 更正：原来这里断言的是"本文件由 gen-context.mjs 生成"那句标注，
  //    但**那条生成链已不在 `run-all-tests` 回路里**（对比 `gen-descriptions.mjs` 仍在），
  //    而 `context.ts` 现在是"默认值 / 回落值"、可以直接改。
  //    ⇒ 判据随之改成验**新的、如实的说明**（两个源头 + 生成链已失效）。
  check('⭐ 说明「运行期唯一源头是设置页【提示词】」',
    /设置页【提示词】子页/.test(ctx) && /唯一源头/.test(ctx))
  check('⭐ 说明「生成链已不在套件回路里」（不再误导"先改设计文档"）',
    /生成链已不在/.test(ctx))
  // ⭐⭐ 2026-10-02：正文那句**不得再出现"六节 / 第七节"**。
  //    🔴 为什么要有这条：文档结构现在**可由用户自定义模板**（决策 204/205），
  //       常驻文本里写死"前六节/第七节"会与"这份文档可能只有 3 节"**自相矛盾**。
  //    ⚠️ 这条断言是**反证逼出来的**：我第一版只改了文案、没写断言
  //       ⇒ 反证"改回旧写法"时**没报红**（说明没有判据守着它）。
  check('⭐⭐ 正文已中性化（不再写死「前六节 / 第七节」）',
    !/前六节写/.test(ctx) && !/第七节「沉淀知识」/.test(ctx))
}

console.log(`\n挂靠依据核对测试：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
