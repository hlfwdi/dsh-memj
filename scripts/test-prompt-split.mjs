/**
 * 真实实例验收：**提示词切分后，模型是否仍拿得到全部必要规范**（决策 105）。
 *
 * ⚠️ 这一步**不能省**——文本改动"看起来对" ≠ 模型行为对（前两轮的教训）。
 *
 * 验收判据：把**模型实际看到的全部文本**（协议 + 全部工具 description）拼起来，
 * 逐条检查**关键规范是否至少出现一次**。
 * 切分的原则是"一条信息只在一个地方"，但**不允许某条信息彻底消失**。
 *
 * 用法：node scripts/test-prompt-split.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 🔴🔴 **必须在 `import` 插件之前设好库根**（2026-09-27 修）：
//    `mod.apply()` 会走 `ensureLibraryDirs()` + 写 `.startup-diag.txt`，
//    而那些路径是**读 `MEMJ_DATA_DIR` 现算的** ⇒ 不设就会**落到生产库**
//    （实测：本脚本在 2026-09-27 给生产库连写了十几条 `apply-start`，
//      还在生产库根建了一个空的 `recall-log/`）。
//    ⚠️ 本项目铁律：**测试/探针一律用临时库**，绝不碰生产。
const lib = mkdtempSync(join(tmpdir(), 'memj-prompt-split-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(new URL('../lib/index.js', import.meta.url).href)

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  OK   ${n}`) }
  else { fail += 1; console.log(`  FAIL ${n} ${e}`) }
}

// ── 取"模型实际看到的全部文本" ──
// ⚠️ cordis **不允许同一个服务被 provide 两次**（会 throw）
//    ⇒ 必须**从一开始**就 provide 截获版，不能先真后换。
const ctx = new Context()
/** 截获 `systemPrompt.section()` 注册的每一段。 */
const sections = []
/** ⭐⭐ 截获 `systemPrompt.context()` 注册的每一段（决策 124 的第三条通道）。 */
const contextSections = []
ctx.provide('systemPrompt', {
  section: (s) => { sections.push(s); return () => {} },
  context: (c) => { contextSections.push(c); return () => {} },
  tools: () => () => {},
})
ctx.provide('commands', { register: () => () => {} })
ctx.provide('webServer', { register: () => () => {} })
await ctx.plugin(ToolRuntime)

mod.apply(ctx, { ...mod.DEFAULT_CONFIG, themeCreation: 'loose', injectProtocol: true })
await new Promise((r) => setTimeout(r, 300))

const tools = ctx.get('tools')
const schemas = tools.schemas ? tools.schemas() : []
const protoText = sections.map((s) => (typeof s.text === 'function' ? s.text() : '')).join('\n')
const descText = schemas.map((t) => t.description ?? '').join('\n')
// 🔴 **`parameters` 也属于「模型实际看到的文本」**（决策 124 分层改造时修）：
//    工具描述搬家的**主要去处**之一就是 `parameters.*.description`
//    ——wire `tools` 序列化 = description + parameters（见方案 §11.5.1 的口径：
//    14,389 + 8,038 = 22,427）。若这里只拼 `description`，
//    凡是"搬到参数说明里"的规范都会被误判为**丢失**。
const paramText = schemas
  .map((t) => JSON.stringify(t.parameters ?? {}))
  .join('\n')
// ⭐⭐ **`context()` 同样属于「模型实际看到的文本」**（决策 124 第 2 步）：
//    它是**第三条常驻通道**（user 角色、尾部 append）——第 2 步把大量指导文本
//    **搬到这里**（触发条件 / 判断准则 / 写作要求）。若不计入，
//    凡是"搬到 context()"的规范都会被误判为**丢失**。
const ctxText = contextSections
  .map((c) => (typeof c.text === 'function' ? c.text() : (c.text ?? '')))
  .join('\n')
const ALL = `${protoText}\n${descText}\n${paramText}\n${ctxText}`

console.log(
  `协议: ${protoText.length} | 工具描述: ${descText.length} | 参数: ${paramText.length} | ` +
    `上下文: ${ctxText.length} | 合计: ${ALL.length}\n`,
)

console.log('【1】切分目标达成：协议瘦身、总量下降')
check('协议 ≤ 2,500 字符（切分前 5,438）', protoText.length <= 2500, `${protoText.length}`)
// ⚠️ 这条断言**在决策 124 后已改口径**：原来要求 handoff 描述"仍完整（≥5,000）"，
//    但那正是本次改造要**削减**的对象（8,729 → 3,414）。
//    ⇒ 判据改为：**描述仍在，且总量没有异常膨胀**（真正的"没丢"由下面【3】的
//      逐条规范检查把关——那才是本测试的核心价值）。
const handoffDescLen = (schemas.find((t) => t.name === 'memj_handoff')?.description ?? '').length
check('handoff 描述仍在（非空）', handoffDescLen > 0, `${handoffDescLen}`)
// 🔴 **阈值 2026-10-12 从 5000 放宽到 5200**（用户裁定）。
//    ⚠️ **为什么放宽，而不是删内容**：本次净增的 173 字符是**防"文档被写坏"的硬约束**——
//      原描述硬编码「项目文档共七节」，在**自定义模板**的项目里会让模型**凭印象猜节名**
//      ⇒ 实测把整份文档结构写坏（多出 6 个默认节 + 31 个空壳节）。
//      ⭐ 判据：**"防数据损坏"的规范优先于"防上下文膨胀"**——前者是资产损失，后者是可量化成本。
//    ⚠️ **怎么拿这个数字**：从「新建项目时传 `template`」→「回执回声节名」→「误命中要停」三件事
//      各留一句最小表述后，**已压到 5002**（净增 173，其中含必要重复的格式开销）。
//      再压就要删掉判据本身了 ⇒ 那等于把防线拆掉换体积。
//    🔴 **它不是"可以随便涨"的配额**：下次加内容前先问「能不能搬到 `context()` 或参数说明里」
//      （决策 124 的分层改造就是为此）；**能搬就必须搬**，不能直接抬这个数。
check('⭐ handoff 描述未异常膨胀（< 5,200）', handoffDescLen < 5200, `${handoffDescLen}`)

console.log('\n【2】⭐ 协议保留项（应有的）')
for (const [name, key] of [
  ['三层结构（项目→主题→全局）', '三层结构'],
  ['何时查：四个读工具', 'memj_info'],
  ['memj_search 用法', 'memj_search'],
  ['memj_read 用法', 'memj_read'],
  ['两处必须查', '两处必须查'],
  ['推进归属（累加不是搬家）', '累加，不是搬家'],
  ['边界', '边界'],
  ['⭐ 指针：写库规范见 handoff 描述', 'memj_handoff'],
  ['⭐ 跨工具查重（写前先搜）', '不要写出重复的知识'],
  ['⭐ 两种校验模式各自是什么', '严格'],
  ['⭐ 模式由快照返回值告知', '返回值会明说'],
]) {
  check(`协议含：${name}`, protoText.includes(key))
}

// ⚠️ **决策 124 第 3 步**：`memj_snapshots` 的**调用时序**已从协议**移入 `context()`**
//    （方案 §11.8 块 S-2 的移侧明确列了它）——协议只留"只读本会话的读快照清单"。
//    ⇒ 判据改为在 **context()** 里检查（模型同样可见；**不是**放宽——
//      两处都没有照样失败）。
check('⭐ memj_snapshots 调用时序（已移入 context()）', ctxText.includes('调用时序'))

console.log('\n【3】⭐⭐ 关键技术规范**必须仍然存在**（切走了，但不能丢）')
for (const [name, key] of [
  ['项目判据：先看上文/何时查库', '先看本会话上文'],
  ['归错比多建更糟', '比多建一个项目更糟'],
  ['相似 id 两段式确认', 'confirmCreate'],
  ['挂靠 vs 新建主题', '优先并入已有主题'],
  ['主题只能填已存在的', '只能填已存在的主题 id'],
  ['归属字段不是三选一（累加）', '不是三选一'],
  ['kind 四值', 'fact'],
  ['title 必填 2–48', 'title'],
  ['desc 两段式 + 检索键', '检索键'],
  ['⭐ 四问（搬到描述）', '四问'],
  ['⭐ 空操作出口（搬到描述）', '空操作出口'],
  ['知识分两种', '落盘方式'],
  ['adopt copy/extract', 'extract'],
  ['七节结构', '沉淀知识'],
  ['step 分步', 'step'],
  ['slug 查重 overwrite', 'overwrite'],
  ['正文写清为什么', '为什么'],
  ['禁存清单', '禁存'],
]) {
  check(`全部文本含：${name}`, ALL.includes(key), '⚠️ 规范丢失！')
}

console.log('\n【4】⭐ 重复消除：同一句**只在一处**')
const dupProbe = [
  ['项目判据那段长句', '本次工作是一条独立工作线'],
  ['四问', '跨会话有用吗'],
]
for (const [name, key] of dupProbe) {
  // ⭐ **决策 124 后有四条通道**：协议 / 工具描述 / 参数说明 / context()。
  //    判据的本意是「**恰好一处**」——既不丢（0 处），也不重复（≥2 处）。
  //    ⚠️ 不能只比"协议 vs 工具侧"：规范可能搬到 `context()`（同样模型可见）。
  const where = {
    协议: protoText.includes(key),
    描述: descText.includes(key),
    参数: paramText.includes(key),
    上下文: ctxText.includes(key),
  }
  const hitCount = Object.values(where).filter(Boolean).length
  const detail = Object.entries(where).filter(([, v]) => v).map(([k]) => k).join('/') || '(无)'
  check(`${name}：**恰好一处**（${detail}）`, hitCount === 1, `命中 ${hitCount} 处：${detail}`)
}

console.log('\n【5】⭐ 参数级说明的覆盖检查（补决策 126 暴露的盲区）')
//
// 🔴 **为什么必须补这一段**：
//    §4.2 里有一批「**`<参数>` 参数说明**」的 ``` 块**（narrative / step /
//    linkedSnapshots / projectDesc / slug / title / desc）——它们是**手写**，
//    `gen-descriptions.mjs` **只抽工具级 `description 原文` 块**，**参数级无人消费**。
//    ⇒ 实测后果：决策 126 改回执措辞时，设计文档 §4.2 的 `step` 参数说明已经改新，
//      而 `tools.ts` 里的参数描述**仍是旧措辞**（"回执会明确说'还差哪步'"），
//      两边**各说一套**，而**没有任何检查会报**。
//
// ⚠️ **为什么不做逐字节比对**：实测确认两者**不是逐字复制关系**
//    （§4.2 的 `step` 块 518 字符是"人读的叙述"，`tools.ts` 里的参数描述是"给模型的措辞"，
//    本来就不该相同）⇒ 逐字节比对会**全线误报**。
//    ⭐ 因此改为**"关键语义覆盖"检查**：设计文档承诺给模型的**关键约束**，
//      必须在**参数说明文本里真实存在**。这类检查才可判定。
const PARAM_SEMANTICS = [
  // [说明, 必须在 paramText 里出现的特征串]
  ['step：缺省 all', '缺省'],
  ['step：执行顺序固定', '执行顺序固定'],
  ['step：参数与 step 不一致会被拒', '直接拒绝'],
  // 🔴 决策 126 的核心（就是这次漏掉的那条）：
  //    ⚠️ **特征串不能含会被 JSON 转义的双引号**——`paramText` 是
  //    `JSON.stringify(parameters)`，里面的 `"` 会变成 `\"`
  //    ⇒ 用 `没有"欠账"` 当特征串**必然匹配不上**（本脚本第一版就是这么错的）。
  //    ⚠️ 也**不能取"没有"这种泛词**——它几乎必然命中，等于没检查。
  //    ⭐ 取**唯一且不含引号**的片段。
  ['step：明确"欠账"框架不可用', '欠账'],
  ['step：`step` 没列的步骤不在本次范围', '不在本次范围'],
  ['step：不为补齐再调一次', '不要为补齐再调一次'],
  ['linkedSnapshots：省略 = 一条都不挂', '省略'],
  ['overwrite：同 slug 默认拒绝', '拒绝'],
  ['overwrite：可显式覆盖', '就地替换'],
]
for (const [name, key] of PARAM_SEMANTICS) {
  check(`参数说明含：${name}`, paramText.includes(key), `缺特征串「${key}」`)
}

// ⚠️ 反向断言：旧的"欠账/补齐"祈使措辞**不得**出现在参数说明里（决策 126 防回归）。
check('⭐ 参数说明**不得**出现"还差哪步"（决策 126 旧措辞）',
  !paramText.includes('还差哪步'), '旧措辞复活了')

console.log('\n【6】⭐ 前缀缓存安全：协议文本恒定')
const s1 = sections.map((s) => (typeof s.text === 'function' ? s.text() : '')).join('\n')
await new Promise((r) => setTimeout(r, 100))
const s2 = sections.map((s) => (typeof s.text === 'function' ? s.text() : '')).join('\n')
check('连读两次 ⇒ 文本完全相同（不触发 node 0 重写）', s1 === s2)

console.log(`\n═══ 验收结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
