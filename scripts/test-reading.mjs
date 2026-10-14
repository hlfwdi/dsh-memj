#!/usr/bin/env node
/**
 * 「文档内提问」的**锚点与绑定**测试（2026-10-14，第 2 期）。
 *
 * ── 这个套件守的是什么 ────────────────────────────────────────────────────
 * 用户裁定：阅读知识文档时节选一段发起提问 ⇒ 会话问答同步成 `kind: chat` 条目，
 * 且「同一段节选只开一个会话」。本套件盯四件事：
 *
 *   ① **锚点四元组的形状与稳定性** —— 尤其是 `blockId` 用**内容哈希**
 *      （不是位置序号），且**规范化后再哈希**（改一个换行不算变）；
 *   ② **重锚定**（`relocateAnchor`）—— 条目被编辑后还能找回那段；
 *   ③ **bindings 的唯一键**（`entryId + blockId`）⇒ 复用而不是新建；
 *   ④ 🔴🔴 **游标必须落盘** —— 只存内存 ⇒ 重启后把整段会话历史当增量重跑一遍
 *      （chat 条目被重复追加）。这是本功能**最 silent 的失败模式**。
 *
 * ⚠️ 全部跑在**临时库副本**上（`MEMJ_DATA_DIR` 指向 tmpdir）——
 *    本项目铁律：测试绝不碰生产库。
 */
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const LIBDIR = process.env['MEMJ_LIBDIR'] ?? join(process.cwd(), 'lib')
const lib = mkdtempSync(join(tmpdir(), 'memj-reading-'))
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

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【1】锚点四元组：blockId 必须是【内容哈希】，不是序号')
// ══════════════════════════════════════════════════════════════════════════
{
  const doc = '第一段文字。\n\n第二段是要被选中的内容，足够长以便切前后文。\n\n第三段文字。'
  const blockText = '第二段是要被选中的内容，足够长以便切前后文。'
  const start = doc.indexOf('第二段')
  const end = start + blockText.length

  const a = mod.makeAnchor(blockText, doc, 1, start, end)
  check(typeof a.blockId === 'string' && a.blockId.length > 0, 'blockId 非空')
  check(a.index === 1, 'index 原样带上（仅辅助）')
  check(a.exact === '第二段是要被选中的内容，足够长以便切前后文。', 'exact = 选中原文')
  check(a.prefix === '第一段文字。\n\n', 'prefix 是选中处之前的文字', JSON.stringify(a.prefix))
  check(a.suffix === '\n\n第三段文字。', 'suffix 是选中处之后的文字', JSON.stringify(a.suffix))

  // ⭐⭐ **核心断言：blockId 必须是【块文本】的哈希，不是整篇的**
  //    在文档**前面插入一段** ⇒ 选中那段的位置从 1 变 0，但**那段文字没变**
  //    ⇒ 若哈希整篇文档，id 会变（所有历史绑定一起失效）；
  //      哈希块文本则不变 —— 这正是"内容锚点"的全部意义。
  const doc2 = `新插入的第一段。\n\n${doc}`
  const start2 = doc2.indexOf('第二段')
  const a2 = mod.makeAnchor(blockText, doc2, 0, start2, start2 + blockText.length)
  check(a2.blockId === a.blockId,
    '⭐⭐ 文档前面插入内容后 blockId **不变**（哈希块文本，与位置/邻域无关）',
    `${a.blockId} vs ${a2.blockId}`)
  check(a2.index !== a.index, '　⇒ 而 index 变了（证明确实是"位置"那个在动）')
  check(a2.prefix !== a.prefix, '　⇒ prefix 也变了（证明确实是"邻域"那个在动）')

  // 🔴 **反证：那段文字本身改了 ⇒ id 必须变**
  //    （否则两个不同段落会撞同一个 id ⇒ 绑定指错地方）
  const a3 = mod.makeAnchor(`${blockText}（改了一个字）`, doc2, 0, start2, start2 + blockText.length)
  check(a3.blockId !== a.blockId, '⭐⭐ 反证：块文本改了 ⇒ blockId 必须变')

  // ⭐ **规范化**：只改空白不该让哈希变（否则用户改个换行就弄丢历史绑定）。
  const spaced = '  第二段是要被选中的内容，足够长以便切前后文。  \n'
  check(mod.hashText(spaced) === mod.hashText(spaced.trim()),
    '⭐⭐ 哈希前会规范化（首尾空白不影响）')
  check(mod.hashText('a\n\nb') === mod.hashText('a b'),
    '⭐⭐ 哈希前会压缩连续空白（换行不影响）')
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【2】重锚定：条目被编辑后还能找回那段')
// ══════════════════════════════════════════════════════════════════════════
{
  const doc = '开头。\n\n目标段落在这里。\n\n结尾。'
  const blockText = '目标段落在这里。'
  const start = doc.indexOf('目标段落')
  const a = mod.makeAnchor(blockText, doc, 1, start, start + 4)

  // ① 原样 ⇒ 定位回原处
  const r1 = mod.relocateAnchor(doc, a)
  check(r1 !== undefined && r1.start === start, '原文未变 ⇒ 定位回原处')

  // ② 前面加了内容 ⇒ 位置变了，但仍定位得到（靠 exact 全文搜）
  const grown = `新增的一段。\n\n${doc}`
  const r2 = mod.relocateAnchor(grown, a)
  check(r2 !== undefined && r2.start === grown.indexOf('目标段落'),
    '⭐⭐ 文档变长后仍定位正确（不靠位置靠原文）', JSON.stringify(r2))

  // ③ 那段被删了 ⇒ 定位不到 ⇒ **必须返回 undefined**
  //    🔴 不能"找个差不多的顶上"—— 那是静默指错地方，比指向失败更糟。
  const r3 = mod.relocateAnchor('完全不同的内容。', a)
  check(r3 === undefined, '⭐⭐ 原文被删 ⇒ 返回 undefined（不静默指错地方）')

  // ④ exact 在文里出现多次 + prefix 能区分 ⇒ 仍定位对
  const dup = '前缀甲。\n\n重复句。\n\n中间。\n\n前缀乙。\n\n重复句。\n\n'
  const s = dup.indexOf('重复句', dup.indexOf('前缀乙'))
  const aDup = mod.makeAnchor('重复句。', dup, 4, s, s + 3)
  const r4 = mod.relocateAnchor(dup, aDup)
  check(r4 !== undefined && r4.start === s,
    '⭐⭐ exact 重复出现时靠 prefix 区分（消歧）', JSON.stringify(r4))
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【3】bindings：jsonl 追加 + 唯一键 + 落盘')
// ══════════════════════════════════════════════════════════════════════════
{
  const anchor = { blockId: 'b1', index: 2, exact: '某段原文', prefix: '前', suffix: '后' }
  const b1 = { entryId: 'e-1', anchor, chatEntryId: 'c-1', sessionId: 's-1', createdAt: '2026-10-14T00:00:00Z' }

  check((await mod.loadBindings()).length === 0, '初始为空')
  await mod.appendBinding(b1)
  const after1 = await mod.loadBindings()
  check(after1.length === 1, '追加一条 ⇒ 读回 1 条')
  check(existsSync(join(lib, 'reading', 'bindings.jsonl')), '⭐⭐ 落盘了（不是只存内存）')

  // ⭐ 同一段落再问 ⇒ **查重命中**（调用方据此复用，不新建会话）
  const hit = await mod.findBinding('e-1', 'b1')
  check(hit !== undefined && hit.chatEntryId === 'c-1', '⭐⭐ 同 (entryId, blockId) 查得到（⇒ 复用）')
  check((await mod.findBinding('e-1', 'b2')) === undefined, '不同段落 ⇒ 查不到（⇒ 新建）')
  check((await mod.findBinding('e-2', 'b1')) === undefined, '不同条目 ⇒ 查不到（⇒ 新建）')
  check((await mod.bindingsForEntry('e-1')).length === 1, '按条目查绑定')

  // ⭐ 坏行不能让它瘫掉（但也不能被当成有效绑定）
  const { appendFile } = await import('node:fs/promises')
  await appendFile(join(lib, 'reading', 'bindings.jsonl'), '{ 坏 JSON\n{"entryId":"e-9","chatEntryId":"c-9"}\n', 'utf8')
  const after2 = await mod.loadBindings()
  check(after2.length === 2, '⭐⭐ 坏行跳过、好行仍读出（不整体失败）', `实得 ${after2.length}`)
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【4】🔴 游标必须落盘（否则重启后重复追加整段历史）')
// ══════════════════════════════════════════════════════════════════════════
{
  check(Object.keys(await mod.loadCursors()).length === 0, '初始为空')
  await mod.saveCursor('session-abc', 42)
  const cur = await mod.loadCursors()
  check(cur['session-abc'] === 42, '写入后读回')

  // ⭐⭐ **关键断言：真的落盘了**
  //    🔴 这条是本品类的核心风险：游标只存内存 ⇒ 插件重启后归零 ⇒
  //       下一轮 turn/end 把**整段会话历史**当增量 ⇒ chat 条目被重复追加。
  //       用户看不到任何报错，只是"那篇问答越来越长、内容重复"。
  const cursorFile = join(lib, 'reading', 'cursors.json')
  check(existsSync(cursorFile), '⭐⭐ cursors.json 落盘')
  const onDisk = JSON.parse(readFileSync(cursorFile, 'utf8'))
  check(onDisk['session-abc'] === 42, '　⇒ 盘上的值就是刚写的那个')

  // ⭐ 第二个会话不冲掉第一个（读-改-写）
  await mod.saveCursor('session-xyz', 7)
  const cur2 = await mod.loadCursors()
  check(cur2['session-abc'] === 42 && cur2['session-xyz'] === 7,
    '⭐⭐ 多个会话的游标互不覆盖')
  // ⭐ 同一会话更新是覆写（不是追加）
  await mod.saveCursor('session-abc', 99)
  check((await mod.loadCursors())['session-abc'] === 99, '同一会话 ⇒ 覆写')
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【5】阅读位置（轻量状态，同样落盘）')
// ══════════════════════════════════════════════════════════════════════════
{
  check(Object.keys((await mod.loadReadingState()).positions).length === 0, '初始为空')
  await mod.saveReadingPosition('e-1', 'blk-7')
  check((await mod.loadReadingState()).positions['e-1'] === 'blk-7', '写入后读回')
  check(existsSync(join(lib, 'reading', 'state.json')), '落盘')
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n【6】chat 正文渲染')
// ══════════════════════════════════════════════════════════════════════════
{
  const anchor = { blockId: 'b1', index: 2, exact: '被选中的原文', prefix: '前', suffix: '后' }
  const body = mod.renderChatEntryBody('某条知识', anchor)
  check(body.startsWith('### '), '⭐⭐ 以 `###` 开头（标题兜底依赖它）')
  check(body.includes('被选中的原文'), '含被讨论的原文')
  check(body.includes('`b1`'), '含 blockId（可追溯）')
  check(body.includes('问答将随会话自动追加'), '有占位尾注（首轮后被换掉）')

  const turn = mod.renderChatTurn(1, '  这里为什么这样？  ', '  因为如此这般。  ')
  check(turn.includes('#### Q1：这里为什么这样？'), '轮次标题 + 问题（已 trim）')
  check(turn.includes('因为如此这般。'), '含回答')
  check(turn.startsWith('\n'), '片段以空行开头（追加时与上文隔开）')
}

console.log(`\n═══ 文档内提问·锚点与绑定：${pass} 通过 / ${fail} 失败 ═══`)
process.exit(fail === 0 ? 0 : 1)
