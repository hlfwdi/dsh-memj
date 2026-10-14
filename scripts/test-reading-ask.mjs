#!/usr/bin/env node
/**
 * 「文档内提问」的**入口与上下文注入**测试（2026-10-14，第 4 期）。
 *
 * ── 这个套件守的是什么 ────────────────────────────────────────────────────
 * 本批是整个功能**第一次碰运行时**（开真会话、挂 `context()`）。守五件事：
 *
 *   ① 🔴 **`text()` 必须按 sessionId 过滤** —— `systemPrompt.context()` 是
 *      **全局注册**的，不过滤 ⇒ 所有会话都被塞进同一条文档；
 *   ② 🔴 **内容完整性自检** —— 框架只保证「同值不发」，不保证「发的是完整全文」。
 *      **宁可不注入，也别注入半篇**（模型拿半篇自信回答，用户以为它看着全文）；
 *   ③ 🔴 **首轮消息绝不包含全文** —— 全文已由 `context()` 注入，再贴一遍是双倍 token；
 *   ④ **复用优先** —— 同一 `(entryId, blockId)` 已有绑定 ⇒ 不开新会话；
 *   ⑤ 🔴 **绑定必须在首轮之前写好** —— 否则第一轮 `turn-stopping` 反查不到，
 *      那一轮永久丢（而用户看得到"第一轮没同步"）。
 *
 * ⚠️ 全部跑在**临时库副本**上；`context()` 的 `text()` 是**纯函数**，可直接调。
 */
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const LIBDIR = process.env['MEMJ_LIBDIR'] ?? join(process.cwd(), 'lib')
const lib = mkdtempSync(join(tmpdir(), 'memj-reading-ask-'))
for (const d of ['projects', 'entries', 'themes', 'prompts', 'reading']) {
  mkdirSync(join(lib, d), { recursive: true })
}
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(LIBDIR, 'index.js')).href)

let pass = 0
let fail = 0
const check = (cond, name, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${extra ? '  ← ' + extra : ''}`) }
}

const anchor = { blockId: 'b-1', index: 3, exact: '被选中的原文', prefix: '前', suffix: '后' }
const BODY = '开头段落。\n\n被选中的原文在这里，足够长以便切前后文做完整性校验。\n\n结尾段落。'

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【1】🔴 首轮消息：只放「锚点 + 问题」，绝不包含全文')
// ══════════════════════════════════════════════════════════════════════════
{
  const prompt = mod.renderAskPrompt('某条知识', anchor, '  这里为什么这样？  ')
  check(prompt.includes('某条知识'), '含出处（哪条知识）')
  check(prompt.includes('被选中的原文'), '含锚点段落')
  check(prompt.includes('我的问题：这里为什么这样？'), '含问题（已 trim）')
  check(!prompt.includes('结尾段落'), '⭐⭐ 不含全文（别处的内容不在里面）')
  check(!prompt.includes('开头段落'), '⭐⭐ 不含全文（开头也不在）')
  check(prompt.length < 400, '　⇒ 整条很短（全文走 context()，不走这里）', `${prompt.length} 字符`)
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【2】context() 注入：渲染形态')
// ══════════════════════════════════════════════════════════════════════════
{
  const rendered = mod.renderDocContext('某条知识', BODY, '被选中的原文')
  check(rendered.includes('## 正在阅读的知识条目'), '有节标题')
  check(rendered.includes('**《某条知识》**'), '含标题')
  check(rendered.includes('<entry>'), '有 <entry> 包裹（模型好识别边界）')
  check(rendered.includes('❖被选中的原文❖'), '⭐⭐ 锚点段落打了 ❖ 标记（紧贴，不加空白）')
  // ⚠️ 首尾断言要按「剥标记后」判 —— 渲染文本里 legitimately 带 ❖，
  //    直接 `includes(BODY.slice(...))` 会假红（第一批这三条就是这么挂的）。
  const plain = mod.stripAnchorMarks(rendered)
  check(plain.includes(BODY.slice(0, 64)), '含正文开头（剥标记后）')
  check(plain.includes(BODY.slice(-64)), '含正文结尾（剥标记后）')
  // ⭐ 空正文 ⇒ 空串（调用方据此跳过注入，不注入一个空壳）
  check(mod.renderDocContext('x', '', '') === '', '空正文 ⇒ 空串')
  check(mod.renderDocContext('x', '   \n  ', '') === '', '纯空白正文 ⇒ 空串')
  // ⭐ 打不上标记不该抛错（条目被编辑过、锚点位移时全文仍有效）
  const noMark = mod.renderDocContext('x', BODY, '完全不存在的句子')
  check(mod.stripAnchorMarks(noMark).includes(BODY), '锚点找不到 ⇒ 原样注入全文（不抛错）')
  // ⚠️ 不能断言"整段无 ❖" —— `renderDocContext` 的说明文字里就写着
  //    「已用 ❖ 标出」（那句话本身含 ❖）⇒ 只能断言 **正文区**没被打标记。
  const entryOnly = noMark.slice(noMark.indexOf('<entry>'), noMark.indexOf('</entry>'))
  check(!entryOnly.includes('❖'), '　⇒ 正文区没被打标记（说明文字里的 ❖ 不算）')
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【3】🔴 内容完整性自检（宁可不注入，也别注入半篇）')
// ══════════════════════════════════════════════════════════════════════════
{
  const full = mod.renderDocContext('t', BODY, '被选中的原文')
  check(mod.isCompleteContext(full, BODY) === true, '完整全文 ⇒ 通过')

  // 🔴🔴 **这条守的是一个真实发生过的缺陷**：
  //     `markAnchor` 把 `exact` 换成 `❖ exact ❖`（插入 4 个字符）
  //     ⇒ 含 `exact` 的头/尾片段在渲染文本里**不再逐字存在**
  //     ⇒ 自检恒不过关 ⇒ 表现是"永远不注入"。
  //     ⭐ 修法：**先剥标记再比**（装饰只服务阅读，不参与完整性判据）。
  check(mod.stripAnchorMarks(full).includes(BODY),
    '⭐⭐ 剥掉 ❖ 标记后逐字含全文（⇒ 打标记不破坏完整性判据）')
  check(mod.stripAnchorMarks('❖甲❖') === '甲', '　⇒ stripAnchorMarks 严格可逆')
  check(mod.markAnchor('甲乙', '乙') === '甲❖乙❖',
    '⭐⭐ markAnchor 紧贴包裹（不加空白 —— 否则剥掉后多空格，自检恒挂）')

  // 🔴 只注入前半篇 ⇒ 必须判出不完整
  const half = BODY.slice(0, Math.floor(BODY.length / 2))
  const halfRendered = mod.renderDocContext('t', half, '被选中的原文')
  check(mod.isCompleteContext(halfRendered, BODY) === false,
    '⭐⭐ 只有半篇 ⇒ 判为不完整（⇒ text() 返回空串，不注入）')
  check(mod.isCompleteContext('', BODY) === false, '空渲染 ⇒ 不完整')
  check(mod.isCompleteContext(full, '') === false, '空正文 ⇒ 不完整')
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【4】🔴 text() 必须按 sessionId 过滤（context() 是全局注册的）')
// ══════════════════════════════════════════════════════════════════════════
{
  // ⭐ 用 installDocContext 建出的缓存 + registerDocContext 注册的 text()
  //    —— 这里直接调 text()（它是纯函数，不需要真装配 cordis）。
  const cache = mod.installDocContext()
  // 手工塞缓存（模拟"预热过"）
  cache.index.set('session-A', { entryId: 'e-1', blockId: 'b-1' })
  cache.bodies.set('e-1', BODY)
  cache.titles.set('e-1', '某条知识')

  let textFn
  const fakeScoped = {
    systemPrompt: {
      context: (spec) => { textFn = spec.text },
    },
  }
  mod.registerDocContext(fakeScoped, {
    docOf: (id) => cache.index.get(id),
    entryBody: (id) => cache.bodies.get(id),
    entryTitle: (id) => cache.titles.get(id),
  })
  check(typeof textFn === 'function', '注册成功（拿到 text）')

  // ① 绑定的会话 ⇒ 注入
  const a = textFn({ agent: { session: { id: 'session-A' } } })
  check(a !== '' && a.includes('被选中的原文'), '⭐ 绑定过的会话 ⇒ 注入全文')

  // ② 🔴 没绑定的会话 ⇒ **空串**（不塞文档）
  const b = textFn({ agent: { session: { id: 'session-无关' } } })
  check(b === '', '⭐⭐ 没绑定的会话 ⇒ 空串（不被塞进同一条文档）')

  // ③ 取不到 sessionId ⇒ 空串
  check(textFn({}) === '', '无 sessionId ⇒ 空串')
  check(textFn({ agent: {} }) === '', 'agent 无 session ⇒ 空串')
  check(textFn({ agent: { session: {} } }) === '', 'session 无 id ⇒ 空串')

  // ④ 🔴 text() 抛异常必须被吞掉（否则毁掉整个 step）
  const boomScoped = {
    systemPrompt: {
      context: (spec) => {
        spec.text.__probe = true
        // 造一个会抛的：用一个取不到就抛的 Proxy
        try {
          const r = spec.text({ agent: { session: { id: 'session-A' } } })
          globalThis.__lastText = r
        } catch { /* 不该发生 */ }
      },
    },
  }
  mod.registerDocContext(boomScoped, {
    docOf: () => { throw new Error('缓存炸了') },
    entryBody: () => BODY,
    entryTitle: () => 't',
  })
  check(globalThis.__lastText === '', '⭐⭐ 依赖抛异常 ⇒ 退化成空串（不外抛）')
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【5】复用优先：同一段落不开新会话')
// ══════════════════════════════════════════════════════════════════════════
{
  const calls = []
  const deps = {
    ensureSession: async (i) => { calls.push('create'); return { sessionId: 's-new', chatEntryId: 'c-new', created: true } },
    entryTitle: async () => '某条知识',
    onBound: () => { calls.push('onBound') },
  }
  const r1 = await mod.askAboutSelection({ entryId: 'e-1', anchor, question: '第一问' }, deps)
  check(r1.ok === true, '首次提问成功')
  check(r1.reused === false, '　⇒ reused=false（新建）')
  check(calls.includes('create'), '　⇒ 真的建了会话')
  check(calls.includes('onBound'), '⭐⭐ 建完绑定触发了 onBound（刷新 context 缓存）')

  // ⭐ 同一段落再问 ⇒ 复用（不开新的）
  const calls2 = []
  const deps2 = { ...deps, ensureSession: async (i) => { calls2.push('create'); return { sessionId: 'x', chatEntryId: 'y', created: true } } }
  const r2 = await mod.askAboutSelection({ entryId: 'e-1', anchor, question: '第二问' }, deps2)
  check(r2.ok === true && r2.reused === true, '⭐⭐ 同段落再问 ⇒ reused=true（复用）')
  check(!calls2.includes('create'), '　⇒ 没有建新会话')
  check(r2.sessionId === 's-new' && r2.chatEntryId === 'c-new', '　⇒ 返回的是原来那个会话/条目')

  // ⭐ 不同段落 ⇒ 新建
  const calls3 = []
  const deps3 = { ...deps, ensureSession: async (i) => { calls3.push('create'); return { sessionId: 's2', chatEntryId: 'c2', created: true } } }
  const r3 = await mod.askAboutSelection(
    { entryId: 'e-1', anchor: { ...anchor, blockId: 'b-2' }, question: '另一段' },
    deps3,
  )
  check(r3.ok === true && r3.reused === false, '不同段落 ⇒ 新建')
  check(calls3.includes('create'), '　⇒ 真的建了')

  // ⭐ 不同条目同一 blockId ⇒ 也新建（唯一键是 (entryId, blockId)）
  const calls4 = []
  const deps4 = { ...deps, ensureSession: async (i) => { calls4.push('create'); return { sessionId: 's3', chatEntryId: 'c3', created: true } } }
  const r4 = await mod.askAboutSelection({ entryId: 'e-2', anchor, question: '另一条知识' }, deps4)
  check(r4.reused === false, '不同条目（同 blockId）⇒ 新建')

  // ⭐ 空问题 ⇒ 拒（不建任何东西）
  const calls5 = []
  const deps5 = { ...deps, ensureSession: async (i) => { calls5.push('create'); return { sessionId: 's4', chatEntryId: 'c4', created: true } } }
  const r5 = await mod.askAboutSelection({ entryId: 'e-3', anchor, question: '   ' }, deps5)
  check(r5.ok === false, '空问题 ⇒ 拒绝')
  check(!calls5.includes('create'), '　⇒ 没建会话')
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【6】绑定落盘（供 turn-stopping 的第一道门反查）')
// ══════════════════════════════════════════════════════════════════════════
{
  // 上一个【5】已经在临时库里写了绑定 ⇒ 直接读盘验证。
  check(existsSync(join(lib, 'reading', 'bindings.jsonl')), 'bindings.jsonl 落盘了')
  const all = await mod.loadBindings()
  check(all.length >= 1, `有绑定（${all.length} 条）`)
  const first = all[0]
  check(first.sessionId === 's-new' && first.chatEntryId === 'c-new', '绑定里带了 sessionId 与 chatEntryId')
  check(first.anchor.blockId === 'b-1', '　⇒ 且带锚点')

  // ⭐ 第一道门：按 sessionId 反查（同步侧就靠这个）
  const hit = await mod.findBindingBySession('s-new')
  check(hit !== undefined && hit.entryId === 'e-1', '⭐⭐ 按 sessionId 反查得到（⇒ turn-stopping 认得出它）')
  const miss = await mod.findBindingBySession('session-普通对话')
  check(miss === undefined, '普通会话反查不到（⇒ 不会被同步）')
}

console.log(`\n═══ 文档内提问·入口与注入：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
