// 主动注入（设计文档《memj 主动注入 · 设计方案》§5/§6/§7）的测试。
//
// 覆盖五类：
//   ① **纯逻辑**：范围解析 / 粗筛 / 提示词组装 / 输出校验 / 上下文截取 / 文案渲染
//   ② **关键判据的反证**：越界编号必须被丢、被抑制必须不计额度、未绑定项目**不退化**成全量
//   ③ **静态反证**：`active-recall` 的代码里**不得出现 `sessionId`**（防递归）
//   ④ **静态检查**：`chunk.block.type` 而不是 `blockType`（防"静默死代码"）
//   ⑤ **默认值**：与设计文档 §10.1 的表逐项一致
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LIB = join(ROOT, 'lib', 'index.js')
const SRC = join(ROOT, 'src')

let pass = 0, fail = 0
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`) }
}

const mod = await import('file://' + LIB.replace(/\\/g, '/'))

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【1】范围解析（§6.0）—— 含"未绑定项目不退化"的反证')
{
  // 造一份**与真实索引同形**的假索引（含 projects 映射 —— 它不在封面里）
  const idx = {
    version: 1, builtAt: '', provider: '', model: '', template: 'instruct',
    coverCount: 5, translated: 5,
    projects: {
      pa: { themes: ['t1'] },
      pb: { themes: ['t2'] },
      pc: { themes: [] },
    },
    entries: {
      a1: { project: 'pa', theme: ['t1'], kind: 'fact', title: 'A1', desc: 'd', titleEn: 'A1', descEn: 'd', descHash: '', translatedAt: '' },
      a2: { project: 'pa', theme: [], kind: 'fact', title: 'A2', desc: 'd', titleEn: 'A2', descEn: 'd', descHash: '', translatedAt: '' },
      // b1 属于 pb，但**挂了 pa 也关联的主题 t1** ⇒ project+themes 应该收进来
      b1: { project: 'pb', theme: ['t1'], kind: 'fact', title: 'B1', desc: 'd', titleEn: 'B1', descEn: 'd', descHash: '', translatedAt: '' },
      b2: { project: 'pb', theme: ['t2'], kind: 'fact', title: 'B2', desc: 'd', titleEn: 'B2', descEn: 'd', descHash: '', translatedAt: '' },
      c1: { project: 'pc', theme: [], kind: 'fact', title: 'C1', desc: 'd', titleEn: 'C1', descEn: 'd', descHash: '', translatedAt: '' },
    },
  }
  const ids = (cs) => cs.map((c) => c.id).sort().join(',')

  check('project 档只收本项目的',
    ids(mod.candidatesForScope(idx, 'pa', 'project')) === 'a1,a2',
    ids(mod.candidatesForScope(idx, 'pa', 'project')))
  check('⭐ project+themes 带上"共享主题"下别项目的条目（b1）',
    ids(mod.candidatesForScope(idx, 'pa', 'project+themes')) === 'a1,a2,b1',
    ids(mod.candidatesForScope(idx, 'pa', 'project+themes')))
  check('⭐ 反证：project+themes **不含**无关主题的 b2（t2 不在 pa 的 themes 里）',
    !mod.candidatesForScope(idx, 'pa', 'project+themes').some((c) => c.id === 'b2'))
  check('all 档收全库', mod.candidatesForScope(idx, 'pa', 'all').length === 5)

  // 🔴🔴 最关键的一条：未绑定项目时**不能退化成全量**
  check('⭐⭐ 反证：未绑定项目 + project 档 ⇒ **空**（不是全量）',
    mod.candidatesForScope(idx, '', 'project').length === 0)
  check('⭐⭐ 反证：未绑定项目 + project+themes 档 ⇒ **空**（不是全量）',
    mod.candidatesForScope(idx, '', 'project+themes').length === 0)
  check('未绑定项目 + all 档 ⇒ 仍可用（这是设计允许的）',
    mod.candidatesForScope(idx, '', 'all').length === 5)

  // 去重：项目封面又挂了本项目主题 ⇒ 只能出现一次
  const dup = mod.candidatesForScope(idx, 'pa', 'project+themes').filter((c) => c.id === 'a1')
  check('⭐ 去重：既属本项目、又挂本项目主题的条目只出现一次', dup.length === 1)

  // ⭐ 裁定 B：JEV 通路把默认档降级
  check('⭐ 裁定 B：JEV + 默认档 ⇒ 降级成 project',
    mod.effectiveScope('project+themes', 'jev', true) === 'project')
  check('⭐ 裁定 B 的反证：chat 通路**不**降级（它没有 240 硬顶）',
    mod.effectiveScope('project+themes', 'chat', true) === 'project+themes')
  check('⭐ 裁定 B 的反证：`project` / `all` 档不受影响',
    mod.effectiveScope('project', 'jev', true) === 'project'
    && mod.effectiveScope('all', 'jev', true) === 'all')
  check('降级开关关掉 ⇒ JEV 也不降级',
    mod.effectiveScope('project+themes', 'jev', false) === 'project+themes')
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【2】🔴 本地粗筛已**整体删除**（后来的"裁切"也一并被"拆批并发"取代）')
{
  // 2026-09-26 演进三步（⚠️ 名字换了两次，因为**机制换了两次**）：
  //   `prefilted`（本地相关性粗筛）→ `trimmedByBudget`（按预算裁候选池）
  //   → ⭐ **`batched`（拆批并发，一条候选都不丢）**
  const recallSrc = readFileSync(join(SRC, 'active-recall.ts'), 'utf8')
  const code = recallSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('⭐⭐ 反证：`lexicalPrefilter` 已从代码里删除', !/function lexicalPrefilter/.test(code))
  check('⭐ 连它的辅助 `grams` 也删了', !/function grams/.test(code))
  // ⚠️ 判据要**去掉注释**再查 —— 注释里**应当**保留旧名字（那是"名字为什么换"的对照表），
  //    只在注释里出现不算残留（第一次写成全文匹配 ⇒ 假失败）。
  check('⭐⭐⭐ 字段是 `batched`（**不再叫 `prefilted` / `trimmedByBudget`**）',
    /batched: boolean/.test(recallSrc)
    && !/\bprefilted\b/.test(code) && !/\btrimmedByBudget\b/.test(code))
  check('⭐⭐ 反证：`chat` 提示词不再说"已按相关性粗筛过"（那句是错的）',
    !/已按相关性粗筛过/.test(recallSrc))

  // ⭐ 两个已作废的旋钮要**明确标注**（留着输入框会让人以为还在起作用 ⇒ 界面撒谎）
  //    ⚠️ 断言写法：注释在字段**上方十几行**处 ⇒ `[\s\S]{0,200}` 太短，
  //       要按"**紧邻该字段的最近一段注释**"来判（第一次写成 200 字符 ⇒ 假失败）。
  const cfgSrc = readFileSync(join(SRC, 'config.ts'), 'utf8')
  const before = (name) => {
    const i = cfgSrc.indexOf(`${name}: z.natural()`)
    return i < 0 ? '' : cfgSrc.slice(Math.max(0, i - 1200), i)
  }
  check('⭐⭐ `activeInjectPoolMax` 标注为"已作废"', before('activeInjectPoolMax').includes('已作废的旋钮'))
  check('⭐⭐ `activeInjectContextRounds` 标注为"已作废"', before('activeInjectContextRounds').includes('已作废的旋钮'))
  check('⭐ 且说明了"取代它的是什么"（否则读者不知道该怎么办）',
    before('activeInjectPoolMax').includes('activeInjectBudgetTokens'))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【3】输出校验（§6.4④）—— 越界/重复/坏 JSON 都必须挡住')
{
  // 正常
  const ok = mod.parseJudgeOutput('{"need":true,"picks":[3,1]}', 5, false)
  check('正常解析：need=true + 编号', ok.need === true && ok.picks.join(',') === '3,1')
  check('正常解析：无错误', ok.error === '')

  // need=false
  const no = mod.parseJudgeOutput('{"need":false}', 5, false)
  check('need=false ⇒ 不注入', no.need === false && no.picks.length === 0)

  // 🔴 越界必须丢
  const oob = mod.parseJudgeOutput('{"need":true,"picks":[1,99,0,-3]}', 5, false)
  check('⭐⭐ 越界编号被丢弃（99 / 0 / -3）', oob.picks.join(',') === '1', JSON.stringify(oob.picks))
  check('⭐ 全越界 ⇒ 当作"不注入"（模型自相矛盾）',
    mod.parseJudgeOutput('{"need":true,"picks":[99]}', 5, false).need === false)

  // 🔴 去重
  const dup = mod.parseJudgeOutput('{"need":true,"picks":[2,2,2,3]}', 5, false)
  check('⭐ 重复编号被去重', dup.picks.join(',') === '2,3', JSON.stringify(dup.picks))

  // 🔴 非整数 / 字符串数字
  const mixed = mod.parseJudgeOutput('{"need":true,"picks":[1,"2",2.5,null,true]}', 5, false)
  check('⭐ 只接受整数（2.5 / null / true 全丢，字符串 "2" 转成 2）',
    mixed.picks.join(',') === '1,2', JSON.stringify(mixed.picks))

  // 🔴 坏 JSON ⇒ 静默跳过（绝不影响主会话）
  check('坏 JSON ⇒ 报错且 need=false',
    mod.parseJudgeOutput('{"need":true,"picks":[1', 5, false).error !== '')
  check('空输出 ⇒ 报错', mod.parseJudgeOutput('   ', 5, false).error !== '')
  check('无 JSON 对象 ⇒ 报错', mod.parseJudgeOutput('需要知识', 5, false).error !== '')

  // 宽容：markdown 围栏 / 前后杂字
  const fenced = mod.parseJudgeOutput('好的，结果如下：\n```json\n{"need":true,"picks":[4]}\n```', 5, false)
  check('⭐ 容忍 markdown 围栏与前置说明（能抠出 JSON）', fenced.need === true && fenced.picks.join(',') === '4')

  // explain 开关
  const withWhy = mod.parseJudgeOutput('{"need":false,"why":"没有知识需求"}', 5, true)
  check('explain 打开 ⇒ 读出 why', withWhy.why === '没有知识需求')
  const noWhy = mod.parseJudgeOutput('{"need":false,"why":"没有知识需求"}', 5, false)
  check('⭐ explain 关闭 ⇒ **不读** why（"输出越少越好"）', noWhy.why === '')

  // 编号 → 候选映射（按清单顺序输出）
  const pool = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ id: x, project: '', theme: [], kind: '', title: x, desc: '', titleEn: '', descEn: '' }))
  check('⭐ 编号映射回候选，且**按清单顺序**输出（不是模型给的顺序）',
    mod.pickCandidates([5, 2], pool, 5).map((c) => c.id).join(',') === 'b,e',
    mod.pickCandidates([5, 2], pool, 5).map((c) => c.id).join(','))
  check('topK 上限生效', mod.pickCandidates([1, 2, 3, 4], pool, 2).length === 2)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【4】提示词组装（§6.4 / §8.2）—— 清单必须独占 system，K 只能在 user')
{
  const pool = [
    { id: 'x', project: 'p', theme: [], kind: 'trap', title: '中文标题一', desc: '中文描述一', titleEn: 'EN one', descEn: 'EN desc one' },
    { id: 'y', project: 'p', theme: [], kind: 'fact', title: '中文标题二', desc: '中文描述二', titleEn: '', descEn: '' },
  ]
  const sys = mod.buildSystemPrompt({ pool, english: true, sufficientGate: true, searchIntentGate: true, explain: false })
  const usr = mod.buildUserPrompt('【当前上下文】\n主模型本次的思考', 5)

  check('system 含清单标题行', sys.includes('【知识库清单】（共 2 条）'))
  check('⭐ 清单在 system 的**尾部**（身份/纪律在前 ⇒ 那段永远命中缓存）',
    sys.indexOf('你是一个知识召回判断器') < sys.indexOf('【知识库清单】'))
  check('⭐ 有英文译文 ⇒ 清单用英文（§9.1 JEV 英文更优）', sys.includes('EN one'))
  check('⭐⭐ 反证：译文为空 ⇒ **回落中文**（不是错误，§9.4）', sys.includes('中文标题二'))
  check('⭐ 编号从 1 开始（模型编号是 1-based）', sys.includes('1. TITLE: EN one'))
  check('⭐ 两条抑制条件都写进了 system',
    sys.includes('(a)') && sys.includes('(b)'))
  check('🔴 反证：system **不含**"最多选 K"（K 变化会把清单拖出缓存）', !sys.includes('最多选'))
  check('🔴 user **含**"最多选 5 条"', usr.includes('最多选 5 条'))
  check('🔴 反证：user **不含**清单（它每次都变，清单进去就每次都失效）', !usr.includes('知识库清单'))

  // 两条开关都关 ⇒ 退回单步
  const oneStep = mod.buildSystemPrompt({ pool, english: true, sufficientGate: false, searchIntentGate: false, explain: false })
  check('⭐ 两条抑制开关都关 ⇒ 第一步整段去掉（单步版本）',
    !oneStep.includes('第一步') && oneStep.includes('判断当前上下文是否需要清单里的知识'))
  const half = mod.buildSystemPrompt({ pool, english: true, sufficientGate: true, searchIntentGate: false, explain: false })
  check('只开 (a) ⇒ 只出现 (a)，不出现 (b)',
    half.includes('(a)') && !half.includes('(b)'))
  const half2 = mod.buildSystemPrompt({ pool, english: true, sufficientGate: false, searchIntentGate: true, explain: false })
  check('只开 (b) ⇒ 只出现 (b)，不出现 (a)',
    !half2.includes('(a)') && half2.includes('(b)'))

  // explain
  const ex = mod.buildSystemPrompt({ pool, english: true, sufficientGate: true, searchIntentGate: true, explain: true })
  check('explain 打开 ⇒ 输出格式里多一个 why', ex.includes('"why"'))
  check('⭐ explain 关闭 ⇒ 格式里**没有** why（"输出越少越好"）', !sys.includes('"why"'))

  // 🔴 设计文档 §6.4③ 的硬约束：**正面规定格式**，不要否定式
  check('⭐⭐ 反证：提示词里**没有**"不要输出/禁止"这类否定式硬约束（会让模型整段拒答）',
    !/禁止|不得输出额外|不要输出/.test(sys), '发现否定式措辞')
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【5】上下文组装（§6.5）—— 已迁到独立模块，本处只做静态反证')
{
  // ⚠️ **本节原来测 `sliceContext`（口径"最近 N 轮的 text 块"）—— 那个函数已删除**。
  //    原因（2026-09-26 生产实测）：它只给 reasoning 限长、消息部分不限
  //    ⇒ 长会话里截出 **146,591 字符** ⇒ JEV 直接 400；
  //    而且按"消息"取而不是按"轮"取 ⇒ 把思考（166 万字符）与工具调用（169 万字符）全带进来。
  // ⭐ 现在统一走 `active-context.ts` 的 **`planInjection`**（组装 + 拆批），
  //    覆盖面已迁到 **`test-active-context.mjs`（65 项）** —— 那里有 turn 划分、
  //    思考独立成字段、拆批与压上下文、候选一条不丢等完整断言。
  const src = readFileSync(join(SRC, 'active-recall.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('⭐⭐ 反证：`sliceContext` 已**从代码里删掉**（不留两份实现）',
    !/function sliceContext/.test(code))
  check('⭐⭐ 上下文与拆批改由 `planInjection` 统一产出（调模型之前算好）',
    /planInjection\(/.test(code))
  check('⭐ 且它**不再自己截上下文**（交给 planInjection，避免顺序打架）',
    !/sliceContext|extractTextMessages/.test(code))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【6】触发判据（§5.2）—— block.type 不是 blockType（防静默死代码）')
{
  // 🔴 正确形状
  check('⭐ block-end + block.type=reasoning ⇒ 命中（严格）',
    mod.isThoughtEnd({ type: 'block-end', index: 0, block: { type: 'reasoning', text: 't' } }, true))
  // 🔴🔴 最关键的假绿反证：写成 blockType 必须**不**命中
  check('⭐⭐ 反证：`blockType: "reasoning"`（错误字段）⇒ **不命中**',
    mod.isThoughtEnd({ type: 'block-end', blockType: 'reasoning' }, true) === false)
  check('⭐⭐ 反证：`block.blockType: "reasoning"`（错误字段）⇒ **不命中**',
    mod.isThoughtEnd({ type: 'block-end', block: { blockType: 'reasoning' } }, true) === false)

  // 严格档：text-delta 不触发
  check('🔴 严格档：text-delta **不**触发（只认 reasoning）',
    mod.isThoughtEnd({ type: 'text-delta', text: 'a' }, true) === false)
  // 宽松档：text-delta 触发
  check('宽松档：text-delta 触发',
    mod.isThoughtEnd({ type: 'text-delta', text: 'a' }, false) === true)
  check('宽松档：reasoning 结束同样触发', mod.isThoughtEnd({ type: 'block-end', block: { type: 'reasoning' } }, false))

  // 其它块/空值
  check('反证：非 reasoning 的 block-end 不触发',
    mod.isThoughtEnd({ type: 'block-end', block: { type: 'text', text: 'x' } }, false) === false)
  check('反证：undefined / null 不抛且不触发',
    mod.isThoughtEnd(undefined, false) === false && mod.isThoughtEnd(null, false) === false)

  // 攒思考的两条通道
  check('⭐ block-end 能拿到**完整**思考文本（以它为准更稳）',
    mod.reasoningTextOf({ type: 'block-end', block: { type: 'reasoning', text: '完整思考' } }) === '完整思考')
  check('reasoning-delta 能累加', mod.deltaTextOf({ type: 'reasoning-delta', text: '片段' }) === '片段')
  check('反证：text-delta **不算**思考（别把答案当思考攒进去）', mod.deltaTextOf({ type: 'text-delta', text: '答案' }) === '')

  // 窗口快照
  const win = mod.snapshotWindow([
    { role: 'user', content: [{ type: 'text', text: '见 `12345678-1234-1234-1234-123456789abc` 这条' }] },
    { role: 'assistant', content: [{ type: 'text', text: '另外 87654321-4321-4321-4321-cba987654321' }] },
  ])
  check('窗口快照扫出 2 个 id', win.size === 2, String(win.size))
  check('⭐ 快照认的是标准 uuid 形状', win.has('12345678-1234-1234-1234-123456789abc'))
  check('反证：非 uuid 的短串不进快照', mod.snapshotWindow([{ role: 'user', content: [{ type: 'text', text: 'abc-123' }] }]).size === 0)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【7】注入文本（§6.2 / §7.3）—— 只给编号内容，收尾指令必须在末尾')
{
  const picks = [
    { id: '11111111-1111-1111-1111-111111111111', project: 'p', theme: [], kind: 'trap', title: '标题甲', desc: '描述甲', titleEn: 'A', descEn: 'a' },
    { id: '22222222-2222-2222-2222-222222222222', project: 'p', theme: [], kind: '', title: '标题乙', desc: '描述乙', titleEn: 'B', descEn: 'b' },
  ]
  const text = mod.renderActiveInjection(picks)
  check('含两条条目的 id', text.includes(picks[0].id) && text.includes(picks[1].id))
  check('⭐ 用的是**中文** title/desc（注入文本给主模型看，§7.3）', text.includes('标题甲') && text.includes('描述甲'))
  check('⭐ 带 kind 标记（有 kind 时）', text.includes('[trap]'))
  check('反证：kind 为空时**不**写出空方括号', !text.includes('[]'))
  check('⭐ 告诉模型正文按需读（用 memj_read）', text.includes('memj_read'))
  // 🔴 收尾指令：所有分支之后
  check('⭐⭐ 收尾指令在**末尾**（"是背景知识、不是任务"）',
    text.trimEnd().endsWith(mod.ACTIVE_CLOSING_INSTRUCTION.trimEnd()))
  check('🔴 收尾指令写明了"不是任务"', text.includes('不是任务'))

  check('⭐ 空 picks ⇒ 返回空串（调用方据此不注入）', mod.renderActiveInjection([]) === '')
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【8】路由解析与 JEV 硬约束')
{
  check('拆 provider/model', JSON.stringify(mod.splitRoute('workbuddy/deepseek-v4.1-flash')) === JSON.stringify({ provider: 'workbuddy', model: 'deepseek-v4.1-flash' }))
  check('⭐ 只在**首个** `/` 拆（模型名里可能还有 `/`，如 tencent/Hunyuan-MT-7B）',
    mod.splitRoute('sf/tencent/Hunyuan-MT-7B')?.model === 'tencent/Hunyuan-MT-7B')
  check('没有 `/` ⇒ undefined', mod.splitRoute('novendor') === undefined)
  check('空 provider 或空 model ⇒ undefined',
    mod.splitRoute('/m') === undefined && mod.splitRoute('p/') === undefined)

  // 🔴 JEV 的 instructions 必须英文（中文会让分辨力归零）
  for (const [name, s] of [
    ['候选', mod.JEV_CANDIDATE_INSTRUCTION],
    ['need', mod.JEV_NEED_INSTRUCTION],
    ['sufficient', mod.JEV_SUFFICIENT_INSTRUCTION],
    ['search_intent', mod.JEV_SEARCH_INTENT_INSTRUCTION],
  ]) {
    check(`⭐⭐ JEV ${name} 提问**全是英文**（含中文会失去分辨力）`, !/[\u4e00-\u9fff]/.test(s), s.slice(0, 40))
  }
  check('JEV 候选提问用了 `candidates[N]` 占位（逐条 noul 的模板）', mod.JEV_CANDIDATE_INSTRUCTION.includes('candidates[N]'))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【9】静态反证：防递归（§12 风险 1）与"同一判据只有一份实现"')
{
  const recallSrc = readFileSync(join(SRC, 'active-recall.ts'), 'utf8')
  const injectSrc = readFileSync(join(SRC, 'active-inject.ts'), 'utf8')

  // 🔴 `active-recall` 里绝不能出现 sessionId —— 它调 ctx.llm.stream
  const recallCode = recallSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('⭐⭐ 反证：active-recall 的**代码里**不得出现 `sessionId`（否则触发自己 ⇒ 递归）',
    !/sessionId/.test(recallCode), '发现 sessionId')
  check('⭐ active-recall 用的是 `ctx.get(\'llm\')` 而**不是** `ctx.llm`（后者运行时 undefined）',
    /ctx\.get\('llm'\)/.test(recallSrc) && !/ctx\.llm[.\s]/.test(recallCode))

  // 触发判据必须读 chunk.block?.type
  check('⭐⭐ active-inject 读 `chunk.block?.type`（写 blockType 会成静默死代码）',
    /block\?\.type/.test(injectSrc))
  check('⭐ 反证：inject 里**没有**把块类型写成 `blockType`',
    !/chunk\.blockType|block\?\.blockType/.test(injectCode(injectSrc)))

  // 原样透传 chunk
  check('⭐⭐ active-inject 的 llm/stream 监听器**原样 `yield chunk`**（自造对象会毁落盘序列化）',
    /yield chunk/.test(injectSrc))

  // 共用的 uuid 形状定义
  check('⭐ 窗口快照与热知识共用 UUID_SCAN（同一判据只有一份实现）',
    injectSrc.includes('UUID_SCAN'))

  // 🔴 额度口径：被抑制不计
  check('⭐⭐ `called` 字段存在（额度口径的唯一依据）',
    /called: boolean/.test(recallSrc))
  check('⭐⭐ 反证：额度只在 `suppressed === \'\'` 时才计（被抑制的不计）',
    /out\.called && out\.suppressed === ''/.test(injectSrc))
}

function injectCode(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') }

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【10】默认值（与设计文档 §10.1 的表逐项一致）')
{
  const cfg = mod.DEFAULT_CONFIG
  const expect = {
    activeInject: false,
    activeInjectChannel: 'chat',
    activeInjectModel: '',
    activeInjectScope: 'project+themes',
    activeInjectStrict: true,
    activeInjectTopK: 5,
    // ⭐⭐ 2026-09-29：`activeInjectBand` 拆成两个键（各自默认 0.7，与拆前一致）。
    activeInjectNeedMin: 0.7,
    activeInjectItemMin: 0.7,
    activeInjectTimeoutMs: 8000,
    activeInjectContextRounds: 3,
    activeInjectPoolMax: 240,
    activeInjectExplain: false,
    activeInjectSearchIntentGate: true,
    activeInjectSearchIntentMin: 0.85,
    activeInjectSufficientGate: true,
    activeInjectSufficientMin: 0.85,
    // ⭐ 2026-09-27：改名 —— 每 turn 最多**注入**几次（旧名 `activeInjectMaxCallsPerTurn`）。
    activeInjectMaxInjectionsPerTurn: 3,
    activeInjectReasoningMaxChars: 800,
  }
  for (const [k, v] of Object.entries(expect)) {
    check(`默认值 ${k} = ${JSON.stringify(v)}`, cfg[k] === v, String(cfg[k]))
  }
  // 🔴 总开关默认必须是 false（用户裁定 B-1）
  check('⭐⭐ 总开关默认 **关**（失败模式不对称：漏做只是少做、误做会烧 token）', cfg.activeInject === false)
  check('⭐ 裁定 B：JEV 降级开关默认**开**（实测默认档在 JEV 上 245 条 > 240 硬顶）',
    cfg.activeInjectJevNarrowScope === true)
}

console.log('\n【11】挂号可观测性 —— "什么都没发生"不能靠自觉（本项目铁律）')
{
  const idxSrc = readFileSync(join(SRC, 'index.ts'), 'utf8')
  // 🔴 关键：诊断行必须**跟着返回值**走，不能无条件打"已注册"
  check('⭐⭐ 反证：诊断行不得无条件写 `active-injection-registered`（那是假绿）',
    !/diag\('active-injection-registered', config\)/.test(idxSrc))
  check('⭐ 诊断区分"挂上了"与"开关关着所以没挂"',
    idxSrc.includes('active-injection-skipped(disabled)'))
  check('⭐ 返回值被接住并用于诊断', /const hooked = registerActiveInjection/.test(idxSrc))

  // 关掉开关时 registerActiveInjection 必须**不挂任何钩子**并返回 false
  const calls = []
  const fakeCtx = {
    on: (name) => { calls.push(name) },
    logger: { info: () => {}, warn: () => {} },
  }
  const off = mod.registerActiveInjection({ ctx: fakeCtx, config: { ...mod.DEFAULT_CONFIG, activeInject: false } })
  check('⭐⭐ 总开关关 ⇒ 返回 false 且**一个监听器都不挂**（零开销）',
    off === false && calls.length === 0, `返回 ${off}，挂了 ${calls.length} 个`)
  const on = mod.registerActiveInjection({ ctx: fakeCtx, config: { ...mod.DEFAULT_CONFIG, activeInject: true } })
  check('⭐ 总开关开 ⇒ 返回 true', on === true)
  check('⭐ 开时挂了三个钩子（llm/stream + agent/pre-step + agent/turn-stopping）',
    calls.length === 3 && calls.includes('llm/stream') && calls.includes('agent/pre-step'),
    calls.join(','))
  check('⭐ 反证：挂的是 `llm/stream` 而不是别的名字（写错会静默不触发）',
    calls.filter((c) => c === 'llm/stream').length === 1)

  // 内存态可清（测试隔离用）
  mod.activeState.queue.set('s1', { picks: [], turn: 1, at: '', timer: setTimeout(() => {}, 10) })
  mod.resetActiveState()
  check('resetActiveState 清空队列（测试隔离）', mod.activeState.queue.size === 0)
}

console.log('\n【12】真跑一轮才发现的四个缺陷 —— 每个都补一条回归断言')
{
  const recallSrc = readFileSync(join(SRC, 'active-recall.ts'), 'utf8')
  const injectSrc = readFileSync(join(SRC, 'active-inject.ts'), 'utf8')

  // 🔴 缺陷 1：降级只看"抛异常" ⇒ 模型"不抛但回空"时降级从不发生
  //    （实测 hy3：`off` 档毫秒级返回空正文、降级从未触发）
  check('⭐⭐ 反证：可用的判据必须是 `usable(text)`，不能只看 try/catch 有没有抛',
    /const usable = \(text: string\)/.test(recallSrc) && /usable\(text\)/.test(recallSrc))
  check('⭐⭐ 反证：空正文时**也要**落到"不带档位再试"（不是直接返回空）',
    /空正文 ⇒ 落到下面不带档位再试/.test(recallSrc))

  // 🔴 缺陷 2：`last` 会被后续召回覆盖 ⇒ "这个会话注入过没有"永远看不出来
  //    （实测：日志里明明注入了、`/active` 显示 queued）
  check('⭐⭐ `lastInjection` 与 `last` 是**两个** map（前者不被覆盖）',
    /lastInjection: Map<string, ActiveLastRecall>/.test(injectSrc))
  check('⭐⭐ 注入成功时**同时**写两份（`last` 会被覆盖、`lastInjection` 不会）',
    (injectSrc.match(/activeState\.lastInjection\.set\(/g) ?? []).length === 1)
  check('⭐ 累计计数单独记（页面回答"注入了多少"）',
    /injectTotals: Map<string/.test(injectSrc) && /injectTotalsOf/.test(injectSrc))

  // 🔴 缺陷 3：额度口径不能从"累计值"反推（累计混了历史 ⇒ 假失败）
  check('⭐⭐ 每次召回的结论里带 `counted`（这一次计没计，可观测而非推断）',
    /counted: boolean/.test(injectSrc) && /counted = true/.test(injectSrc))

  // ══════════════════════════════════════════════════════════════════════
  // ⭐⭐⭐ 【12b】2026-09-27：额度口径从"调用"改成"注入"（用户裁定）
  //    原话：*"每轮最多 3 次注入，没有注入的不算次数。"*
  //    🔴 旧口径的实测危害：一个 turn 前几步全是"没选出条目" ⇒ 3 次额度
  //       在真正需要知识的几步之前耗光（实测会话 2b809b4a 的 turn 6 零注入）。
  //    🔴🔴 **这些"反证"必须先去掉注释再查** —— 注释里**应当**保留旧名字
  //       （那是演进记录）；把注释算进来 = 自己制造假失败（本项目已踩过）。
  // ══════════════════════════════════════════════════════════════════════
  const injectNoComment = injectCode(injectSrc)
  check('⭐⭐ 计数表已改名为 `injections`（语义 = 注入次数，不再是调用次数）',
    /injections: Map<string, \{ turn: number; n: number \}>/.test(injectNoComment))
  check('⭐⭐ 旧名 `calls: Map<...>` 已消失（不留两份实现）',
    !/\bcalls: Map<string/.test(injectNoComment))
  check('⭐⭐ `noteCall` 已改名 `noteInjection`（名字要名副其实）',
    /function noteInjection\(/.test(injectNoComment) && !/\bnoteCall\(/.test(injectNoComment))
  check('⭐⭐ 上限读取走 `maxInjectionsPerTurn`（新键优先、旧键回落 —— 只此一份判据）',
    /maxInjectionsPerTurn\(/.test(injectNoComment))
  // 🔴🔴 **本批最核心的判据**：计数必须发生在"消息真的 push 之后"。
  //    若它跑在前面，就又会把"选中了但没注成"算进额度 —— 那是旧 bug 的复发。
  {
    const pushAt = injectNoComment.indexOf('messages.push({')
    const noteAt = injectNoComment.indexOf('noteInjection(sid, item.turn)')
    check('⭐⭐⭐ 反证：`noteInjection` 必须在 `messages.push(` **之后**（否则旧 bug 复发）',
      pushAt >= 0 && noteAt > pushAt, `push@${pushAt} note@${noteAt}`)
  }
  // 🔴 反证：召回侧**不得**再计额度（那是旧口径的落点）
  check('⭐⭐⭐ 反证：召回返回后不再计额度（`counts = out.called && …` 已删除）',
    !/counts = out\.called/.test(injectNoComment))
  check('⭐⭐ 召回侧如实标 `counted: false`（那一刻确实还没注入）',
    /const counts = false/.test(injectNoComment))
  // 🔴 反证：额度检查读的必须是**注入次数**，不是调用次数
  check('⭐⭐⭐ 反证：额度检查用 `injectionsLeft`（不是 `callsLeft`）',
    /injectionsLeft\(sid, turn, config\)/.test(injectNoComment) && !/\bcallsLeft\(/.test(injectNoComment))
  check('⭐ 跳过文案说清是"注入已达上限"（别再写"召回调用"）',
    /本 turn 注入已达上限/.test(injectNoComment))

  // 🔴 缺陷 4：`chat` 通路失败时**说不出为什么** ⇒ 四种故障混成一句
  check('⭐⭐ chat 调用留诊断（记下收到了哪些块类型）',
    /lastChatDiagnostic/.test(recallSrc) && /kinds: string\[\]/.test(recallSrc))
  check('⭐⭐ 只收到 reasoning（没有 text）要**单独报出来**（该换模型，不是索引坏了）',
    /若只收到 reasoning，说明该模型关不掉思考/.test(recallSrc))
  check('⭐ 诊断经 `/active` 透出（排障不用再猜）', readFileSync(join(SRC, 'api.ts'), 'utf8').includes('lastChatCall'))

  // ⭐ 内存态清理要覆盖新表（否则测试之间会互相污染）
  mod.activeState.lastInjection.set('s9', { at: '', turn: 1, kind: 'injected', detail: '', injected: [], ms: 0, batched: false, evaluated: 0, pool: 0, counted: true })
  mod.activeState.injectTotals.set('s9', { times: 1, entries: 1, at: '' })
  // ⭐ 2026-09-27：`injections` 表也要被 reset 清掉（漏了它 ⇒ 用例之间互相污染）。
  mod.activeState.injections.set('s9', { turn: 1, n: 2 })
  mod.resetActiveState()
  check('resetActiveState 清掉 lastInjection 与 injectTotals',
    mod.activeState.lastInjection.size === 0 && mod.activeState.injectTotals.size === 0)
  check('⭐⭐ resetActiveState **也清 `injections`**（漏了会跨用例污染额度）',
    mod.activeState.injections.size === 0)
  check('两个新读取器存在且是函数',
    typeof mod.lastInjectionOf === 'function' && typeof mod.injectTotalsOf === 'function')
  check('⭐⭐ 读取器已改名 `activeInjectionsUsed`（旧名 `activeCallsUsed` 不留）',
    typeof mod.activeInjectionsUsed === 'function' && mod.activeCallsUsed === undefined)
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【14】🔴🔴 前端提交**不得按下标**（同一 bug 踩了两次，第二次直接报错）')
{
  // 事故（2026-09-26，用户在面板上真踩到）：
  //   面板的数值控件原先是数组 + `aiR[n].value` 提交。
  //   我在**中间插入了 3 个新控件**（预算/比例/下限）⇒ **后面所有键错位**：
  //     · `activeInjectBand: aiR[1]` 碰巧还对；
  //     · `activeInjectSufficientMin: aiR[7]` 拿到的却是 `ai-poolmin`（1–500）
  //       ⇒ 服务端校验 0–1 ⇒ 报 *"activeInjectSufficientMin 必须是 0–1 之间的数"*。
  // ⇒ ⭐ 判据：**"按下标引用一组同类东西"是脆弱写法** —— 任何插入/删除都静默错位。
  const appSrc = readFileSync(join(SRC, 'web', 'app.js'), 'utf8')

  check('⭐⭐⭐ 反证：提交处**不得**出现 `aiR[n].value`（按下标必错位）',
    !/activeInject\w+:\s*aiR\[\d+\]\.value/.test(appSrc),
    '仍在按下标提交')
  check('⭐⭐ 改成按**键名**取（`aiDefs` + `aiVals`）',
    /const aiDefs = \[/.test(appSrc) && /\.\.\.aiVals/.test(appSrc))
  check('⭐ 且校验循环也走 `aiDefs`（不再出现 `...aiR`）', !/\.\.\.aiR\b/.test(appSrc))

  // ⭐ **逐对核**：每个数值控件的 id 与配置键必须成对声明（插入新控件不再错位）
  const pairs = appSrc.match(/\['ai-[a-z-]+',\s*'activeInject\w+'/g) ?? []
  console.log(`     成对声明的控件 = ${pairs.length} 个`)
  // 🔴🔴 **门槛 11 → 12（2026-09-29）** —— 因为把 `ai-band` **拆成了两个控件**
  //    （`ai-need-min` / `ai-item-min`）。⚠️ **这不是放宽断言**，而是契约跟着界面走：
  //    数量恒等于「界面上数值控件的总数」⇒ **加/删控件必须同步改这个数字**，
  //    否则它要么假红、要么变成一条"其实已经不对但没人知道"的摆设。
  check('⭐⭐ 每个数值控件都以【id + 配置键】成对声明（= 12 个，即界面上的全部）',
    pairs.length === 12, String(pairs.length))
  // ⭐⭐ **反向也要核**：三个已作废键**必须已从「映射表」里消失**。
  //    🔴 **判据只看映射表那一段、不看整个文件** —— 因为文件里**注释**仍然提到这些 id
  //       （那是在解释"为什么删它们"，是**应该留**的）。
  //       ⚠️ 我第一版写成"整个 appSrc 里不含 'ai-poolmin'" ⇒ **把注释也算成违规** ⇒ 3 条假红。
  //       ⭐ 判据：**"某东西不该出现"要指明在【哪个范围内】不该出现**。
  const aiDefsBlock = /const aiDefs = \[([\s\S]*?)\]/.exec(appSrc)?.[1] ?? ''
  check('⭐ 取到了 aiDefs 映射表（前置条件）', aiDefsBlock !== '', '取不到 ⇒ 下面三条会恒真')
  for (const [id, key] of [['ai-rounds', 'activeInjectContextRounds'], ['ai-pool', 'activeInjectPoolMax'], ['ai-poolmin', 'activeInjectPoolMin']]) {
    check(`⭐⭐⭐ 已作废字段 \`${key}\` 已从**映射表**移除（控件已删）`,
      !new RegExp(`\\['${id}', '${key}'`).test(aiDefsBlock),
      '⚠️ 删了控件却留着映射 ⇒ 会读到不存在的元素 ⇒ 整页存不了')
  }

  // 🔴 **最该盯的一条**：那个具体报错的键必须真的映射到自己的输入框
  check('⭐⭐⭐ 反证：`activeInjectSufficientMin` 必须映射到 **`ai-suff-min`**（不是 poolmin）',
    /\['ai-suff-min', 'activeInjectSufficientMin'/.test(appSrc))
  check('⭐⭐⭐ 反证：`activeInjectSearchIntentMin` 必须映射到 **`ai-intent-min`**',
    /\['ai-intent-min', 'activeInjectSearchIntentMin'/.test(appSrc))
  // ⭐ 两个新键也各自映射正确
  check('⭐ `activeInjectBudgetTokens` ↔ `ai-budgettok`',
    /\['ai-budgettok', 'activeInjectBudgetTokens'/.test(appSrc))
  check('⭐ `activeInjectChatWindowRatio` ↔ `ai-chatratio`',
    /\['ai-chatratio', 'activeInjectChatWindowRatio'/.test(appSrc))

  // ⭐⭐⭐ **拆键后的两条最关键反证**（2026-09-29）：
  //    两个阈值都是 0–1 的合法分数 ⇒ **写反了不报错**，
  //    只表现为"筛选行为莫名改变"（一个本该管整轮、一个本该管单条）。
  //    ⇒ 必须逐条盯住"哪个 id 映射到哪个键"。
  check('⭐⭐⭐ 反证：`ai-need-min` 必须映射到 `activeInjectNeedMin`（「要不要注入」）',
    /\['ai-need-min', 'activeInjectNeedMin'/.test(appSrc))
  check('⭐⭐⭐ 反证：`ai-item-min` 必须映射到 `activeInjectItemMin`（「哪几条够格」）',
    /\['ai-item-min', 'activeInjectItemMin'/.test(appSrc))
  // ⭐⭐ **已作废的 `ai-band` 必须已从映射表消失**（控件已拆成上面两个）。
  //    ⚠️ 判据限定在 `aiDefs` 段内（不含注释）—— 同 `:531` 的教训。
  check('⭐⭐⭐ 已作废的 `ai-band` 已从**映射表**移除（控件已拆成两个）',
    !/\['ai-band', 'activeInjectBand'/.test(aiDefsBlock),
    '⚠️ 留着它 ⇒ 会读到不存在的元素 ⇒ 整页存不了')

  // ⭐ 2026-09-27 改名：`ai-calls` 必须映射到**新键**（旧键已废弃，面板不得再提交它）
  check('⭐⭐⭐ 反证：`ai-calls` 映射到**新键** `activeInjectMaxInjectionsPerTurn`',
    /\['ai-calls', 'activeInjectMaxInjectionsPerTurn'/.test(appSrc))
  check('⭐⭐⭐ 反证：面板**不再提交**旧键 `activeInjectMaxCallsPerTurn`',
    !/'activeInjectMaxCallsPerTurn'/.test(appSrc))
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n【15】⭐⭐⭐ 意图门必须【点名 memj 工具】（2026-09-27 用户裁定收窄）')
{
  // 用户原话：*"应该是只有他有打算用 memj_search 或者 memj_info 工具去获取信息的
  //   检索意图时，才去拦。而不是只要他有检索意图我就要拦。"*
  // 🔴 旧文案（`search the knowledge base itself`）没限定手段 ⇒ 任何"我该查一下"
  //    都算命中 ⇒ 实测生产 `search_intent` 0.910/0.940/0.960 ⇒ 主动注入被常态性关闭。
  //    ⚠️ **本块自己读源码** —— 上面那些块的 `recallSrc` 是**块级 `const`**，这里取不到
  //    （实测踩到 `ReferenceError: recallSrc is not defined`）。
  const recallSrcHere = readFileSync(join(SRC, 'active-recall.ts'), 'utf8')
  const q = mod.JEV_SEARCH_INTENT_INSTRUCTION ?? ''
  check('⭐⭐⭐ 意图门提问**点名 `memj_search`**',
    q.includes('memj_search'), String(q).slice(0, 80))
  check('⭐⭐⭐ 意图门提问**点名 `memj_info`**',
    q.includes('memj_info'), String(q).slice(0, 80))
  check('⭐⭐ 意图门提问要求"**明确说要调**"（explicitly stated），不是泛泛的想查',
    /explicitly stated/i.test(q))
  check('⭐⭐ 意图门**明说泛泛的想查不算**（A general wish … is NOT enough）',
    /is NOT enough/i.test(q))
  // 🔴 反证：旧文案不得残留（它会重新把门放宽）
  check('⭐⭐⭐ 反证：旧文案 `search the knowledge base itself` 已消失',
    !/search the knowledge base itself/i.test(recallSrcHere))
  // 🔴 必须仍是英文（中文会让 JEV 分辨力归零 —— 条目 efdebc4e）
  check('⭐⭐⭐ 反证：意图门提问仍是**英文**（中文会让 JEV 分辨力归零）',
    !/[\u4e00-\u9fff]/.test(q))

  // ⭐⭐ B 档的开关必须**接得通**（面板控件 ↔ app.js 读写 ↔ 服务端白名单）
  //    🔴 判据：三处**都要有** —— 少了任何一处，这个旋钮就是"看得见、改不动"
  //    （本项目记过："能力写在描述里、schema 里没有入口"）。
  const htmlSrc = readFileSync(join(SRC, 'web', 'index.html'), 'utf8')
  const settingsSrc = readFileSync(join(SRC, 'settings.ts'), 'utf8')
  const apiSrcHere = readFileSync(join(SRC, 'api.ts'), 'utf8')
  // ⚠️ 本块自己读 app.js（上面那块的 `appSrc` 是块级 `const`，这里取不到）。
  const appSrcHere = readFileSync(join(SRC, 'web', 'app.js'), 'utf8')
  check('⭐⭐ 面板有 `ai-recall-log-req` 勾选框', /id="ai-recall-log-req"/.test(htmlSrc))
  check('⭐⭐ app.js 回填它（setCheck）', /setCheck\('ai-recall-log-req'/.test(appSrcHere))
  check('⭐⭐ app.js 提交它', /activeRecallLogRequest:/.test(appSrcHere))
  check('⭐⭐ 服务端 settings.ts 白名单里有它', /'activeRecallLogRequest'/.test(settingsSrc))
  check('⭐⭐ 服务端 api.ts 有布尔校验（不是数值校验）',
    /activeRecallLogRequest 必须是布尔值/.test(apiSrcHere))
}

// ══════════════════════════════════════════════════════════════════════════
// 【16】⭐⭐⭐ 提交触发：用户从输入框 submit ⇒ 用他的话当判据再召回一次
//      （2026-09-29 用户裁定）
//
// 用户原话：*"之前是只在思考后去调用。我需要加个情况，就是用户从输入框 submit 后，
//           也要用用户的输入内容作为判据去调用一次。"*
//
// 🔴 背景（为什么要加这一条触发点）：老触发点只认 **reasoning 块结束** ——
//    实测本会话 345 条 assistant 消息里 reasoning 块 = **0** ⇒ 严格档**永不触发**。
//    ⭐ 而"用户提交"是**必然发生**的事件 ⇒ 不依赖模型行为。
//
// ⚠️ 本节夹具**照真实会话日志的形状**（`source.kind`）—— 不是我以为的形状。
//    本项目刚因为这个栽过一次（`parentSessionIdOf` 读错了字段位置），
//    那次是"假夹具让错的实现全绿"。
{
  const { extractUserSubmit } = mod

  // ── 夹具：真实日志里出现过的 source 形态（逐条抄自实测数据）──
  const realUser       = { kind: 'user', rpcId: 'cf87a6cc-e7cf-4a99-9a83-a4cfd5f0dd3e', clientTimeZone: 'Asia/Shanghai' }
  const realPluginMemj = { kind: 'plugin', plugin: 'dsh-memj', form: 'instructions' }
  const realSnapshot   = { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt', form: 'snapshot', sections: [] }
  const realRelay      = { kind: 'agent-message', form: 'relay', senderSessionId: 'x' }
  const msg = (source, text) => ({ id: 'm1', role: 'user', source, content: [{ type: 'text', text }] })

  check('⭐ 夹具用的是**真实** source 形态（`kind:\'user\'` 且带 rpcId）',
    realUser.kind === 'user' && typeof realUser.rpcId === 'string')

  // ── 正例：真人提交能被取出来 ──
  const got = extractUserSubmit([msg(realUser, '帮我把这个插件的日志查一下')], 1000)
  check('⭐⭐⭐ **真人提交能被识别并取出**（判据 = `source.kind===\'user\'`）',
    got === '帮我把这个插件的日志查一下', JSON.stringify(got))

  // ── 🔴🔴 最关键的反证：**插件自己的注入不能被当成用户输入** ──
  //
  // ⚠️ 若判据写成"消息里有文字就算"，会把 memj 自己注入的热知识当用户输入
  //    ⇒ **每次注入都自我触发出新一轮召回**（自我放大）。
  const pluginOnly = extractUserSubmit([msg(realPluginMemj, '## memj 热知识\n\n以下是知识…')], 1000)
  check('🔴🔴（反证）**插件注入的内容不会被当成用户输入**（否则会自我触发）',
    pluginOnly === '', JSON.stringify(pluginOnly))
  check('🔴（反证）system-prompt 的 snapshot 也不算',
    extractUserSubmit([msg(realSnapshot, 'Current DSH file policy: …')], 1000) === '')
  check('🔴（反证）别的 agent 的 relay 也不算',
    extractUserSubmit([msg(realRelay, '子代理完成')], 1000) === '')

  // ── 混合：同一步里既有用户提交又有插件注入 ⇒ 只取用户的 ──
  const mixed = extractUserSubmit(
    [msg(realSnapshot, 'policy…'), msg(realUser, '查一下日志'), msg(realPluginMemj, '热知识…')], 1000)
  check('⭐⭐ 同一步里混合多种来源 ⇒ **只取用户那句**',
    mixed === '查一下日志', JSON.stringify(mixed))

  // ── 截断（判据要进召回输入，会挤预算）──
  const long = extractUserSubmit([msg(realUser, 'x'.repeat(500))], 100)
  check('⭐ 超长输入被截断到上限', long.length === 100, String(long.length))

  // ── 空/异常输入不炸 ──
  check('⭐ 空数组 ⇒ 空串', extractUserSubmit([], 100) === '')
  check('⭐ 没有 content 时不炸', extractUserSubmit([{ role: 'user', source: realUser }], 100) === '')
  check('⭐ 空白文本不算输入', extractUserSubmit([msg(realUser, '   ')], 100) === '')

  // ── 静态核对：两条触发点都在，且互不干扰 ──
  const aiSrc = readFileSync(join(SRC, 'active-inject.ts'), 'utf8')
  const logSrc = readFileSync(join(SRC, 'recall-log.ts'), 'utf8')
  check('⭐⭐⭐ 源码里**老触发点**仍标 `trigger: \'reasoning\'`', /trigger: 'reasoning'/.test(aiSrc))
  check('⭐⭐⭐ 源码里**新触发点**标 `trigger: \'submit\'`', /trigger: 'submit'/.test(aiSrc))
  check('⭐⭐ 提交触发**独立于注入段**（必须在"队列为空就 return"之前）', (() => {
    // ⚠️ 判据：`submitTriggered.get(sid)` 的位置必须**早于**注入段的 `queue.get(sid)`。
    //    放错位置 ⇒ 第一步队列必然为空 ⇒ 早退 ⇒ **永不触发**（我第一版就是这样）。
    const sub = aiSrc.indexOf('activeState.submitTriggered.get(sid)')
    const inj = aiSrc.indexOf('const item = activeState.queue.get(sid)')
    return sub > 0 && inj > 0 && sub < inj
  })())
  check('⭐⭐ **一个 turn 只触发一次**（按 turn 号去重，不是布尔）',
    /submitTriggered\.get\(sid\) !== turn/.test(aiSrc))
  check('⭐ 触发失败不影响 step（try/catch 兜底）', /提交触发失败/.test(aiSrc))
  check('⭐⭐ 召回日志记了 `trigger` 字段（两个触发点的分数**不混着看**）',
    /trigger\?: string/.test(logSrc))
}

console.log(`\n主动注入测试：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)