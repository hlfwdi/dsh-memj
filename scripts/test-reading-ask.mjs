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

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【7】🔴 source 必须写在【封面】上（真机探针抓到的）')
// ══════════════════════════════════════════════════════════════════════════
{
  // 🔴🔴 **这条守的是一个真机才发现、单测却没覆盖的缺陷**：
  //     第一版只把 sessionId 传给 `writeEntryDoc`（它只写**正文**的 frontmatter）
  //     ⇒ `cover.source` 是空对象 ⇒ 前端「去会话」按钮拿不到 sessionId
  //     ⇒ **按钮永远不渲染**。而现象是"没有按钮"、不是报错 ⇒ 极易漏过。
  //     ⭐ 判据：**前端读的是封面侧**（`api.ts` 两个接口都只扫封面、不读正文）。
  //
  //    ⚠️ 本组要在**有项目的库**上跑（`createChatEntry` 要求源条目有 project 归属）
  //    ⇒ 临时库里先建一个项目 + 一条源条目。
  //    ⚠️ `writeFileSync` 是**同步** API（不在 `fs/promises` 里）⇒ 从 `node:fs` 取。
  const { writeFileSync } = await import('node:fs')
  const projId = 'reading-probe-proj'
  const projFile = join(lib, 'projects', `HANDOFF-${projId}.md`)
  const srcEntryId = '11111111-2222-3333-4444-555555555555'
  const shortId = srcEntryId.slice(0, 8)

  const fm = [
    '---',
    `project: ${projId}`,
    "title: ''",
    "desc: '探针用项目'",
    'themes: []',
    '---',
    '',
    '# 探针项目',
    '',
  ].join('\n')
  // ⭐ 封面块 —— **照真实形状手写**（从 `HANDOFF-ccaa-exam-prep.md` 第 98 行抄的）：
  //    · 围栏标记是 `<!-- memj:entry`（**不是** `memj:cover` —— 我第一版凭想象写错，
  //      结果 `scanLibrary` 扫不到 ⇒ "找不到源条目" 的假故障）；
  //    · 有**闭合标记** `<!-- /memj:entry -->`；
  //    · `kind: fact` / `ref: entries/…` **都不加引号**（YAML 裸标量）。
  //    ⚠️ 这正是库内 `62f4b250`「夹具要照真实形状」那一族 —— 正确做法第 3 条：
  //       **先把真实形状打出来看一眼**，别凭接口名想象。
  const coverBlock = [
    '<!-- memj:entry',
    `id: ${srcEntryId}`,
    `project: ${projId}`,
    'theme: []',
    'global: false',
    'kind: fact',
    'tags: probe',
    'title: 探针源条目',
    'desc: 给 reading 探针当源条目用',
    `ref: entries/probe-src-${shortId}.md`,
    'ext: false',
    'createdAt: 2026-10-14T00:00:00.000Z',
    'updatedAt: 2026-10-14T00:00:00.000Z',
    '-->',
    '<!-- /memj:entry -->',
    '',
  ].join('\n')
  writeFileSync(projFile, fm + coverBlock, 'utf8')
  writeFileSync(
    join(lib, 'entries', `probe-src-${shortId}.md`),
    '### 探针源条目\n\n这是正文，够长以便测试。\n',
    'utf8',
  )

  // 走真的 createChatEntry（它会 scanLibrary + writeEntryDoc + writeProjectDoc）
  const r = await mod.createChatEntry(
    srcEntryId,
    '探针源条目',
    { blockId: 'probe-blk', index: 0, exact: '探针源条目', prefix: '', suffix: '' },
    'session-probe-1',
  )
  if ('error' in r) {
    check(false, 'createChatEntry 成功', r.error)
  } else {
    // ⭐⭐ 关键断言：**封面**上的 source.sessionId
    const snap = await mod.scanLibrary()
    const mine = snap.covers.find((c) => c.cover.id === r.id)
    check(mine !== undefined, 'chat 条目在 scanLibrary 里（⇒ 列表看得到）')
    check(mine?.cover.source?.sessionId === 'session-probe-1',
      '⭐⭐ 封面带 source.sessionId（⇒ 「去会话」按钮有数据可渲染）',
      JSON.stringify(mine?.cover.source))
    check(mine?.cover.kind === 'chat', '　⇒ kind 是 chat')
    // ⭐ 顺带：DTO 层也拿得到（前端真正读的那层）
    //    ⚠️ **两个参数各有分工，别混**（第一版两个都写错过）：
    //      · `pathname` = **完整路径但不带 query**（`/plugins/dsh-memj/api/entry`）——
    //        `handleApi` 靠 `slice(base.length)` 切 route，带了 `?id=` 会切出
    //        `/entry?id=xxx` ⇒ 路由匹配不上 ⇒ 404「未知的 API 路径」；
    //      · `params` = `URLSearchParams`（放 `id`）。
    //    🔴 而**只传 `/entry`**（不带 `/plugins/dsh-memj/api` 前缀）又会切出乱码
    //       ⇒ 同样是 404，但错误信息是「库里没有这张封面」—— **更容易误判**。
    const dto = await mod.handleApi(
      { version: '0', config: mod.DEFAULT_CONFIG, baseUrl: '', pluginId: 'memj' },
      'GET',
      '/plugins/dsh-memj/api/entry',
      '',
      new URLSearchParams([['id', r.id]]),
    )
    const body = JSON.parse(JSON.stringify(dto.body))
    check(body?.cover?.source?.sessionId === 'session-probe-1',
      '⭐⭐ API DTO 也带 source.sessionId（前端拿到的就是这份）',
      JSON.stringify(body?.cover?.source))
  }
}

console.log('\n【8】🔴 注入消息的 source.kind 必须是【产出者标识】（真机抓到的）')
// ══════════════════════════════════════════════════════════════════════════
{
  // 🔴🔴 **这条守的是一个让我绕了三轮真机的坑**：
  //     `followup` 的消息 source 我写成了 0.1.5 时代的旧形状
  //       `{ kind: 'plugin', plugin: 'dsh-memj' }`        ← ❌ 0.2.0 硬拒
  //     而 0.2.0 的 v4 准入会抛
  //       `format v4 message requires a producer-owned source kind`
  //     🔴 **它的失败现象完全不像 source 问题**：
  //        · `/reading/ask` 返回 **200**（会话建了、条目建了、绑定写了）；
  //        · 会话事件里 `turn/start` **正常开了**；
  //        · 紧接着 `turn/end{reason:error}`、**tokenUsage 全 0**（模型一次没调）；
  //        · 磁盘日志还**看不到**那条错误（turn 边界不 flush）。
  //     ⇒ 表面看像"模型不可用 / 驱动没起来"，实际是消息形状非法。
  //     ⭐ 正确取值本项目早有定论（`message-source.ts`：`plugin:dsh-memj`，
  //       逐帧解 8 个真实 v4 日志、51 处实测都是它）。
  //     ⚠️ 库内条目 `441e5db2` 早就记了这个坑 —— **判据是"我该先查库"**。
  //
  //    ⭐⭐ **静态反证**：源码里不得再出现旧形状（`kind: 'plugin'` + `plugin:`）。
  //       它防的是"后人照 0.1.5 的样例又写回去"——而那在 tsc 层**看不出来**
  //       （`MessageSource` 类型里 `kind: string` 依然成立，只有运行时才校验）。
  const { readFileSync } = await import('node:fs')
  const { join: j } = await import('node:path')
  for (const f of ['reading-ask.ts', 'reading-sync.ts', 'reading.ts']) {
    const src = readFileSync(j(process.cwd(), 'src', f), 'utf8')
    // ⚠️ 去掉注释再扫（注释里**应该**能写这个坑的解释）。
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    check(!/kind:\s*'plugin'/.test(code),
      `⭐⭐ ${f} 里没有旧形状 kind:'plugin'（0.2.0 会硬拒 ⇒ 整轮失败）`)
  }
  // ⭐ 正面断言：真用了正确取值
  const askSrc = readFileSync(j(process.cwd(), 'src', 'reading-ask.ts'), 'utf8')
  check(askSrc.includes("kind: 'plugin:dsh-memj'"),
    "⭐⭐ reading-ask.ts 用了正确取值 kind:'plugin:dsh-memj'")
}

console.log('\n【9】🔴 块 id 必须由【服务端】算（前端不得自己哈希）')
// ══════════════════════════════════════════════════════════════════════════
{
  // 🔴🔴 **这条守的是一个真机探针抓到的设计缺陷**：
  //    前端要从 DOM 反推块 id，而 DOM 里 `**粗体**` 的星号**已被浏览器吃掉**
  //    ⇒ 前端按 `textContent` 算哈希，与后端按 **markdown 原文**算的**永远对不上**
  //    ⇒ 段落标记永远不显示，且**不报任何错**。
  //    ⭐ 实测同一个块：原文 `1mpx8by` vs 渲染后 `191ccmm`。
  //    ⇒ ⭐ **判据：内容哈希必须由「拥有原文的那一侧」算** ——
  //      所以块清单由 `/reading/blocks` 给（含 `plain`），前端只做文本匹配。
  //
  //    ⚠️ 反证：`app.js` 里若出现**调用** `readingHashText`（不带 Unused 后缀）
  //       就说明有人又把它接回调用链了 ⇒ 报红。
  const { readFileSync } = await import('node:fs')
  const { join: j } = await import('node:path')
  const appSrc = readFileSync(j(process.cwd(), 'src', 'web', 'app.js'), 'utf8')
  const code = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  // ⭐ 只允许那个"留作说明"的 `function readingHashTextUnused(`，不允许多余调用。
  check(!/\breadingHashText\s*\(/.test(code),
    '⭐⭐ app.js 里没有调用 readingHashText（前端不该自己算块哈希）')
  check(/function readingHashTextUnused\s*\(/.test(code),
    '　⇒ 且那份"为什么不能用"的说明还在（不是被删掉了）')
  // ⭐ 正面断言：块 id 从 DOM 属性取（服务端写上的那个）。
  check(code.includes('block.dataset.blockId'),
    "⭐⭐ 锚点的 blockId 取自 DOM 的 data-block-id（服务端算好写上的）")
  // ⭐ 后端侧：blocks 接口必须回 plain（前端匹配 DOM 要用）。
  const readSrc = readFileSync(j(process.cwd(), 'src', 'reading.ts'), 'utf8')
  check(readSrc.includes('export function extractReadingBlocks'),
    '　⇒ 服务端有 extractReadingBlocks（块清单的产出方）')
  // ⚠️ 判据要**宽松但方向明确**：只要源码里出现 `hashText(c)` 就说明用的是原文变量。
  check(readSrc.includes('hashText(c)'),
    '⭐⭐ blockId 用【原文】(c) 算，不是用剥了标记的 plain')
}

console.log('\n【10】🔴 提问前必须【锁下锚点快照】（真机抓到的真 bug）')
// ══════════════════════════════════════════════════════════════════════════
{
  // 🔴🔴 **这条守的是一个只在真实操作路径上出现的真 bug**：
  //    `pending` 是一个会被 `selectionchange` 改写的闭包变量，而 `onAsk` 里
  //    `await askQuestionDialog(...)` 期间**用户一点输入框，选区就没了**
  //    ⇒ `selectionchange` 触发 `hide()` ⇒ **`pending` 被清成 `null`**
  //    ⇒ 提交时发出去的是 `anchor: null` ⇒ 后端 400「anchor 不完整」。
  //    ⭐ 实测抓到的请求体：`{"entryId":"…","anchor":null,"question":"…"}`。
  //
  //    ⚠️ **它为什么值一条静态反证**：探针**不点输入框就碰不到**
  //      ⇒ 属于"功能测试全绿、用户一用就坏"那一类；
  //      而重犯的发现成本极高（要在真机上点一遍，且症状"提问失败"看着像后端问题）。
  const { readFileSync } = await import('node:fs')
  const { join: j } = await import('node:path')
  const appSrc = readFileSync(j(process.cwd(), 'src', 'web', 'app.js'), 'utf8')
  const code = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  // ⭐ 正面断言：提交前先把 pending 锁成快照。
  check(/anchor\s*=\s*pending/.test(code),
    '⭐⭐ onAsk 里先把 pending 锁成快照（const anchor = pending）')
  // 🔴 反面：提交那一行里**不得**出现活的 `pending`。
  const askLine = code.split('\n').find((l) => l.includes("postJson('/reading/ask'")) ?? ''
  check(askLine !== '' && !/\bpending\b/.test(askLine),
    '⭐⭐ 提交那一行用的是快照 anchor，不是活的 pending', askLine.trim().slice(0, 120))
}

console.log('\n【11】🔴 「返回源知识」：源指针由服务端给，且滚动不能靠 scrollIntoView')
// ══════════════════════════════════════════════════════════════════════════
{
  const { readFileSync } = await import('node:fs')
  const { join: j } = await import('node:path')
  const apiSrc = readFileSync(j(process.cwd(), 'src', 'api.ts'), 'utf8')
  const readSrc = readFileSync(j(process.cwd(), 'src', 'reading.ts'), 'utf8')
  const appSrc = readFileSync(j(process.cwd(), 'src', 'web', 'app.js'), 'utf8')
  const code = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  // ① 后端要有反查（chat 条目 → 源条目/块）。
  check(readSrc.includes('export async function findBindingByChatEntry'),
    '⭐⭐ 服务端有 findBindingByChatEntry（chat 条目 → 源条目/块）')
  // ② `/entry` DTO 要透出 readingSource（前端据此渲染按钮，不自己反查 bindings）。
  check(apiSrc.includes('readingSource'),
    '⭐⭐ /entry DTO 透出 readingSource（服务端算好给前端）')
  // ③ 前端用返回的字段渲染。
  check(code.includes('data.readingSource') || code.includes('readingSource'),
    '⭐⭐ 前端消费 readingSource 渲染「返回源知识」')
  check(code.includes('gotoSourceEntry'),
    '⭐⭐ 有 gotoSourceEntry（跳源条目 + 滚到那段）')
  // ④ 🔴 **滚动不能用 `scrollIntoView`** —— 🔴🔴 **这是本项目第三次踩同一个坑**：
  //    项目里已经写过三遍这条教训（`app.js` 的目录跳转 1126 行、滚动记忆 1559 行、
  //    9168 行），原话是"`scrollIntoView` 会**滚动所有可滚祖先**——包括那些
  //    `overflow: hidden` 的容器 …… 不要用会自动沿祖先链找目标的 `scrollIntoView`"。
  //    ⚠️ 而我实现「返回源知识」时**又用了它** ⇒ 真机实测目标块没进视口、
  //      容器 `scrollTop` 仍是 0，**且不报任何错**（页面看起来只是"停住了"）。
  //    ⭐ 判据：**定位到某元素要用「已知容器 + 手动 scrollTop」**，不用自动找祖先的那个 API。
  //    ⚠️ 项目里只剩一处合法用法（`first?.scrollIntoView({block:'nearest'})`，
  //      那是焦点管理、不要求精确定位）⇒ 断言写成"**不得新增**"：
  //      统计出现次数，不得超过那 1 处。
  const siw = (code.match(/\.scrollIntoView\s*\(/g) ?? []).length
  check(siw <= 1,
    '⭐⭐ 没有新增 scrollIntoView 用法（本页布局下它滚不到位且不报错）', `实际 ${siw} 处`)
  check(code.includes('scrollHostOf(detail)'),
    '⭐⭐ 滚动容器由 scrollHostOf 判定（与分页用的同一个判据）')
  // ⑤ 高亮（否则用户不知道"到了哪一段"）。
  check(code.includes('reading-target-flash'),
    '⭐⭐ 目标块会高亮一下（让"到了"这件事可见）')
}

console.log(`\n═══ 文档内提问·入口与注入：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
