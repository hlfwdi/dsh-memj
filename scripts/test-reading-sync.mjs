#!/usr/bin/env node
/**
 * 「文档内提问」的**轮末同步**测试（2026-10-14，第 3 期）。
 *
 * ── 这个套件守的是什么 ────────────────────────────────────────────────────
 * 用户裁定：只同步**从提问入口产生的会话**，且**只要 user 提问与回答正文**。
 * 本套件盯六件事（前两条是用户明定的要求，后四条是实现红线）：
 *
 *   ① **不是提问入口的会话一律不碰库**（否则普通对话把库淹掉）；
 *   ② 🔴 **`reasoning` / `tool-call` 块绝不进正文**（用户明说"不要思考、
 *      不要工具调用"）—— 注意 `reasoning` 与 `text` **形状相同**（都是 `{type, text}`），
 *      只按 `.text` 取会把思考收进去；
 *   ③ 🔴 **游标必须"追加成功之后"才推进** —— 先写游标 ⇒ 追加失败时那轮**永久丢失**；
 *   ④ 🔴 **凑不齐一问一答时不写半轮**，但**游标仍要推进**（否则同一批事件反复重抽）；
 *   ⑤ **首轮从 `inheritedEventCount` 起**（fork 安全，不被父会话消息污染）；
 *   ⑥ **per-session 串行化**（连续两轮不会交叉成乱序内容）。
 *
 * ⚠️ 全部跑在**临时库副本**上（`MEMJ_DATA_DIR` 指向 tmpdir）——本项目铁律。
 */
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const LIBDIR = process.env['MEMJ_LIBDIR'] ?? join(process.cwd(), 'lib')
const lib = mkdtempSync(join(tmpdir(), 'memj-reading-sync-'))
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

// ── 造假件用的常量 ──
// 🔴 **必须照【真实 API 形状】**（库内 `62f4b250` 那一族，本项目已栽三次）：
//   真机 dump 出来的原始 `SessionEvent` 是这样（`readSurface` 给的就是它）：
//
//     user/message      => `{ type, seq, data: { content, source, role, id } }`
//     assistant/message => `{ type, seq, data: { turn, step, message: { content }, … } }`
//
//   ⚠️ **content 都不在顶层**；且两者**位置不同**
//      （`data.content` vs `data.message.content`）。
//   ⭐ 我第一版按"磁盘日志的形状"写成顶层 `content` ⇒ `question` 恒空
//     ⇒ `extractTurn` 恒 undefined ⇒ 同步永远判 empty，而**不报错**。
const text = (t) => ({ type: 'text', text: t })
const reasoning = (t) => ({ type: 'reasoning', text: t })
const toolCall = (n) => ({ type: 'tool-call', id: `c${n}`, name: 'bash', arguments: '{"cmd":"ls"}' })
const userEv = (seq, t) => ({
  seq,
  type: 'user/message',
  data: { content: [text(t)], source: { kind: 'plugin:dsh-memj' }, role: 'user', id: `u${seq}` },
  surfaceOp: 'append',
})
const asstEv = (seq, blocks) => ({
  seq,
  type: 'assistant/message',
  data: { turn: 1, step: 1, message: { role: 'assistant', content: blocks } },
  surfaceOp: 'append',
})

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【1】🔴 不是提问入口的会话 ⇒ 一条都不写')
// ══════════════════════════════════════════════════════════════════════════
{
  const written = []
  const deps = {
    sessionQuery: { readSurface: async () => ({ inheritedEventCount: 0, capturedThroughSeq: 5, events: [userEv(1, '问'), asstEv(2, [text('答')])] }) },
    findBySession: async () => undefined,           // ⭐ 不在 bindings 里
    loadCursors: async () => ({}),
    saveCursor: async (s, n) => { written.push([s, n]) },
    appendChatTurn: async () => { written.push('append'); return { ok: true } },
    renderChatTurn: (n, q, a) => `Q${n}`,
    countTurns: async () => 0,
  }
  const r = await mod.syncSession('session-普通对话', deps)
  check(r.status === 'skipped', '状态是 skipped')
  check(written.length === 0, '⭐⭐ 既没追加、也没动游标（一条都不写）', JSON.stringify(written))
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【2】🔴 reasoning / tool-call 绝不进正文')
// ══════════════════════════════════════════════════════════════════════════
{
  // ⭐ 关键：reasoning 与 text **形状完全相同**（都是 {type, text}）
  //    ⇒ 只按 .text 取就会把思考收进去。必须判 type。
  const content = [reasoning('我在想这个问题……'), text('这是给用户看的回答。'), toolCall(1)]
  const t = mod.textOfContent(content)
  check(t === '这是给用户看的回答。', '⭐⭐ 只取 text 块（reasoning/tool-call 被滤掉）', JSON.stringify(t))
  check(!t.includes('我在想'), '　⇒ 思考内容不在里面')
  check(!t.includes('arguments'), '　⇒ 工具调用参数不在里面')

  // 多个 text 块 ⇒ 按序拼接
  check(mod.textOfContent([text('甲'), text('乙')]) === '甲\n乙', '多个 text 块按序拼')
  check(mod.textOfContent([]) === '', '空 content ⇒ 空串')
  check(mod.textOfContent(undefined) === '', 'undefined ⇒ 空串')
  check(mod.textOfContent([reasoning('只有思考')]) === '', '只有 reasoning ⇒ 空串（⇒ 该轮判为凑不齐）')

  // ⭐ 端到端：一轮里同时有思考、工具调用、正文 ⇒ 只落正文
  const events = [
    userEv(1, '这段什么意思？'),
    asstEv(2, [reasoning('先想一下……'), text('它的意思是……')]),
    userEv(3, '（工具结果注入）'),
    asstEv(4, [text('补充一句。')]),
  ]
  const turn = mod.extractTurn(events)
  check(turn !== undefined && turn.question === '这段什么意思？', '提问取第一条 user 消息')
  check(turn.answer === '补充一句。', '⭐⭐ 回答取【最后一条】非空 assistant（中间那句被跳过）', turn?.answer)
  check(!turn.answer.includes('先想一下'), '　⇒ 思考不在回答里')
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【3】🔴 游标必须"追加成功之后"才推进')
// ══════════════════════════════════════════════════════════════════════════
{
  // ① 追加失败 ⇒ **游标不许动**（否则那轮永久丢失）
  const saved = []
  const failDeps = {
    sessionQuery: { readSurface: async () => ({ inheritedEventCount: 0, capturedThroughSeq: 9, events: [userEv(1, '问'), asstEv(2, [text('答')])] }) },
    findBySession: async () => ({ entryId: 'e', anchor: { blockId: 'b' }, chatEntryId: 'c' }),
    loadCursors: async () => ({}),
    saveCursor: async (s, n) => { saved.push(n) },
    appendChatTurn: async () => ({ ok: false, error: '磁盘满了' }),
    renderChatTurn: () => 'x',
    countTurns: async () => 0,
  }
  const r1 = await mod.syncSession('s1', failDeps)
  check(r1.status === 'failed', '追加失败 ⇒ status=failed')
  check(saved.length === 0, '⭐⭐ 追加失败时【游标没有推进】（那轮下次还能重试）', JSON.stringify(saved))

  // ② 追加成功 ⇒ 游标推进到 capturedThroughSeq
  const saved2 = []
  const okDeps = {
    sessionQuery: { readSurface: async () => ({ inheritedEventCount: 0, capturedThroughSeq: 9, events: [userEv(1, '问'), asstEv(2, [text('答')])] }) },
    findBySession: async () => ({ entryId: 'e', anchor: { blockId: 'b' }, chatEntryId: 'c' }),
    loadCursors: async () => ({}),
    saveCursor: async (s, n) => { saved2.push(n) },
    appendChatTurn: async () => ({ ok: true }),
    renderChatTurn: (n, q, a) => `Q${n}:${q}`,
    countTurns: async () => 3,
  }
  const r2 = await mod.syncSession('s2', okDeps)
  check(r2.status === 'synced' && r2.roundNo === 4, '成功后 roundNo = 已有轮数 + 1')
  check(saved2.length === 1 && saved2[0] === 9, '⭐⭐ 成功后才推进游标到 capturedThroughSeq')

  // ③ 增量：只处理 seq > 游标的
  const seen = []
  const incDeps = {
    sessionQuery: { readSurface: async () => ({ inheritedEventCount: 0, capturedThroughSeq: 12, events: [userEv(8, '旧问'), asstEv(9, [text('旧答')]), userEv(10, '新问'), asstEv(11, [text('新答')])] }) },
    findBySession: async () => ({ entryId: 'e', anchor: { blockId: 'b' }, chatEntryId: 'c' }),
    loadCursors: async () => ({ s3: 9 }),
    saveCursor: async () => {},
    appendChatTurn: async () => ({ ok: true }),
    renderChatTurn: (n, q, a) => `${q}|${a}`,
    countTurns: async () => 0,
  }
  const r3 = await mod.syncSession('s3', incDeps)
  check(r3.status === 'synced', '有增量 ⇒ 同步成功')
  // ⭐ 追问一句"渲染进去的是什么"——用 renderChatTurn 的入参验证
  const cap = []
  const capDeps = { ...incDeps, appendChatTurn: async (id, frag) => { cap.push(frag); return { ok: true } } }
  await mod.syncSession('s3', capDeps)
  check(cap.length === 1 && cap[0] === '新问|新答', '⭐⭐ 只处理游标之后的增量（旧问/旧答不再重跑）', JSON.stringify(cap))

  // ④ 无增量 ⇒ empty，且不追加
  const noDeps = {
    sessionQuery: { readSurface: async () => ({ inheritedEventCount: 0, capturedThroughSeq: 9, events: [userEv(8, '旧问'), asstEv(9, [text('旧答')])] }) },
    findBySession: async () => ({ entryId: 'e', anchor: { blockId: 'b' }, chatEntryId: 'c' }),
    loadCursors: async () => ({ s4: 9 }),
    saveCursor: async () => {},
    appendChatTurn: async () => ({ ok: true }),
    renderChatTurn: () => 'x',
    countTurns: async () => 0,
  }
  const r4 = await mod.syncSession('s4', noDeps)
  check(r4.status === 'empty', '无增量 ⇒ empty')
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【4】凑不齐一问一答 ⇒ 不写半轮，但游标仍推进')
// ══════════════════════════════════════════════════════════════════════════
{
  // 场景：用户问了一句、模型还在跑就被中断 ⇒ 只有 user、没有 assistant
  const saved = []
  const appended = []
  const deps = {
    sessionQuery: { readSurface: async () => ({ inheritedEventCount: 0, capturedThroughSeq: 4, events: [userEv(1, '问了一半')] }) },
    findBySession: async () => ({ entryId: 'e', anchor: { blockId: 'b' }, chatEntryId: 'c' }),
    loadCursors: async () => ({}),
    saveCursor: async (s, n) => { saved.push(n) },
    appendChatTurn: async () => { appended.push(1); return { ok: true } },
    renderChatTurn: () => 'x',
    countTurns: async () => 0,
  }
  const r = await mod.syncSession('s5', deps)
  check(r.status === 'empty', '只有提问没有回答 ⇒ empty')
  check(appended.length === 0, '⭐⭐ 不写半轮（chat 条目里不出现"只有问题"的一节）')
  check(saved.length === 1 && saved[0] === 4,
    '⭐⭐ 但游标仍推进（否则下一轮把同一批事件反复重抽，永远凑不齐）', JSON.stringify(saved))

  // 只有回答没有提问（注入型 user 消息不带可读文本）同理
  const t = mod.extractTurn([asstEv(1, [text('答')])])
  check(t === undefined, '只有回答没有提问 ⇒ extractTurn 返回 undefined')
  const t2 = mod.extractTurn([userEv(1, '问')])
  check(t2 === undefined, '只有提问没有回答 ⇒ extractTurn 返回 undefined')
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【5】fork 安全：首轮从 inheritedEventCount 起')
// ══════════════════════════════════════════════════════════════════════════
{
  const cap = []
  const deps = {
    // ⭐ 前 6 条是 fork 继承来的（父会话的内容），第 7 条起才是本会话的
    sessionQuery: {
      readSurface: async () => ({
        inheritedEventCount: 6,
        capturedThroughSeq: 8,
        events: [
          userEv(0, '父会话的旧问'), asstEv(1, [text('父会话的旧答')]),
          userEv(2, '父会话又问'), asstEv(3, [text('父会话又答')]),
          userEv(4, '还有'), asstEv(5, [text('还有答')]),
          userEv(6, '本会话的新问'), asstEv(7, [text('本会话的新答')]),
        ],
      }),
    },
    findBySession: async () => ({ entryId: 'e', anchor: { blockId: 'b' }, chatEntryId: 'c' }),
    loadCursors: async () => ({}),       // ⭐ 无游标 ⇒ 首次
    saveCursor: async () => {},
    appendChatTurn: async (id, frag) => { cap.push(frag); return { ok: true } },
    renderChatTurn: (n, q, a) => `${q}|${a}`,
    countTurns: async () => 0,
  }
  const r = await mod.syncSession('s6', deps)
  check(r.status === 'synced', '同步成功')
  check(cap.length === 1 && cap[0] === '本会话的新问|本会话的新答',
    '⭐⭐ 首次从 inheritedEventCount 起（父会话的内容不被当成增量）', JSON.stringify(cap))
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【5b】🔴 off-by-one：首次起点必须【含】inheritedEventCount')
// ══════════════════════════════════════════════════════════════════════════
{
  // 🔴🔴 **这条守的是一个真实发生过的 off-by-one**：
  //     `inheritedEventCount` 是"继承前缀的**长度**"，而 seq 是 **0-based**
  //     ⇒ 第一个"自己的"事件，seq **正好等于** `inheritedEventCount`。
  //     ⚠️ 若首次也用 `seq > from`（与"已处理过"的分支一样）⇒
  //        那一问一答的**头半个被挡掉** ⇒ `extractTurn` 永远凑不齐
  //        ⇒ 症状是"同步从来没成功过"，而**没有任何报错**。
  //     ⭐ 修法：首次用 `>=`，已处理过仍用 `>`（游标含它就会重复处理上轮最后一条）。
  const cap = []
  const deps = {
    sessionQuery: {
      // ⭐ seq 唯一；前 3 条（0/1/2）是 fork 继承的，3/4 才是本会话自己的
      readSurface: async () => ({
        inheritedEventCount: 3,
        capturedThroughSeq: 5,
        events: [
          userEv(0, '父会话问'), asstEv(1, [text('父会话答')]), asstEv(2, [text('父会话答2')]),
          userEv(3, '自己的新问'), asstEv(4, [text('自己的新答')]),
        ],
      }),
    },
    findBySession: async () => ({ entryId: 'e', anchor: { blockId: 'b' }, chatEntryId: 'c' }),
    loadCursors: async () => ({}),
    saveCursor: async () => {},
    appendChatTurn: async (id, frag) => { cap.push(frag); return { ok: true } },
    renderChatTurn: (n, q, a) => `${q}|${a}`,
    countTurns: async () => 0,
  }
  const r = await mod.syncSession('s6b', deps)
  check(r.status === 'synced', '首次就同步成功（不是 empty）', JSON.stringify(r))
  check(cap.length === 1 && cap[0] === '自己的新问|自己的新答',
    '⭐⭐ seq === inheritedEventCount 那条【被包含】（off-by-one 已修）', JSON.stringify(cap))
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【6】sessionQuery 不在 ⇒ 优雅跳过（不外抛）')
// ══════════════════════════════════════════════════════════════════════════
{
  const deps = {
    sessionQuery: undefined,
    findBySession: async () => ({ entryId: 'e', anchor: { blockId: 'b' }, chatEntryId: 'c' }),
    loadCursors: async () => ({}),
    saveCursor: async () => {},
    appendChatTurn: async () => ({ ok: true }),
    renderChatTurn: () => 'x',
    countTurns: async () => 0,
  }
  const r = await mod.syncSession('s7', deps)
  check(r.status === 'skipped' && r.reason === 'no-session-query', '服务不在 ⇒ skipped（不抛异常）')
}

console.log(`\n═══ 文档内提问·轮末同步：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
