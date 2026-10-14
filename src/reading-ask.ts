/**
 * dsh-memj —— **「文档内提问」的入口**（2026-10-14，第 4 期）
 *
 * ── 它做什么 ──────────────────────────────────────────────────────────────
 * 用户在阅读某条知识时选中一段、点「就此提问」⇒ 前端 POST 到本模块 ⇒
 * ① 查 `bindings`：这段**是否已有会话**（用户裁定「同一段节选只开一个会话」）；
 * ② 没有 ⇒ 建一条 `chat` 条目 + 开一个 DSH 会话 + 写绑定；
 * ③ `context()` 注入被提问条目的全文（按 sessionId 过滤，见 `registerDocContext`）；
 * ④ `agent.followup()` 提交首轮（**它会唤醒驱动器**）；
 * ⑤ 返回 `{sessionId, chatEntryId, reused}` 给前端（前端据此 `openSession`）。
 *
 * ── 🔴 三条设计红线 ────────────────────────────────────────────────────────
 * 1. **复用优先** —— 同一 `(entryId, blockId)` 已有绑定 ⇒ **不新建会话**，
 *    只把新问题追加进去。否则用户对同一段连问三次会开出三个会话，
 *    而他们要的是"这一段的讨论"（一个地方）。
 * 2. **首轮消息只放「锚点段落 + 问题」** —— 🔴 **绝不在里面再贴一遍全文**：
 *    全文已经由 `context()` 注入了，再贴一次等于发两遍（token 白烧，
 *    而且模型会以为是两份不同的东西）。
 * 3. **followup 而不是 inject** —— `inject()` **不唤醒驱动器**
 *    （空闲时会一直挂在「待注入」，模型一动不动，见 memj 库条目 `0de3c3b6`）。
 *
 * @module dsh-memj/reading-ask
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { appendBinding, createChatEntry, findBinding, type ReadingAnchor } from './reading.ts'

// ══════════════════════════════════════════════════════════════════════════
// 形状
// ══════════════════════════════════════════════════════════════════════════

/** 「就此提问」的入参。 */
export interface ReadingAskRequest {
  /** 被提问的那条知识 id。 */
  entryId: string
  /** 段落锚点四元组。 */
  anchor: ReadingAnchor
  /** 用户的问题。 */
  question: string
}

/** 「就此提问」的结果。 */
export type ReadingAskResult =
  | {
      ok: true
      /** 会话 id（复用或新建）。 */
      sessionId: string
      /** chat 条目 id。 */
      chatEntryId: string
      /** ⭐ `true` = 复用了已有会话（没开新的）。 */
      reused: boolean
    }
  | { ok: false; error: string }

/** 依赖（注入以便测试）。 */
export interface AskDeps {
  /** 建/复用会话。 */
  ensureSession(input: {
    entryId: string
    entryTitle: string
    anchor: ReadingAnchor
    question: string
  }): Promise<{ sessionId: string; chatEntryId: string; created: boolean }>
  /** 取被提问条目的标题（首轮消息与 chat 条目都要用）。 */
  entryTitle(entryId: string): Promise<string>
  /**
   * ⭐ **绑定写入后的回调**（刷新 `context()` 的同步缓存）。
   *
   * 🔴 **为什么必须有它**：`systemPrompt.context()` 的 `text()` 查的是内存 Map，
   *    而绑定刚写进 `bindings.jsonl` ⇒ 不刷新的话，同一会话的**下一轮**
   *    注入会查不到 ⇒ **文档上下文静默丢失**（不报错，只是模型突然"看不到全文"）。
   * ⚠️ 可选（测试里可以不给）；调用处用 `void` 触发，不 await。
   */
  onBound?: () => void
}

// ══════════════════════════════════════════════════════════════════════════
// 首轮消息
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ **渲染首轮消息**（`followup` 提交给模型的那条）。
 *
 * 🔴 **刻意不含全文** —— 全文由 `context()` 注入（见红线 2）。
 *    这里只放三样：**出处**（哪条知识）、**锚点段落**（问题针对哪里）、
 *    **问题本身**。
 *
 * ⭐ 「出处 + 锚点」是用户说的「方便 AI 锁定我读到哪里、到底要问什么」的落点：
 *    没有它，模型只知道"有人问了个问题"；有了它，模型知道
 *    "问题针对《某知识》里的这一小段"。
 *
 * @param entryTitle - 被提问条目的标题。
 * @param anchor - 段落锚点。
 * @param question - 用户的问题。
 * @returns 消息文本。
 */
export function renderAskPrompt(entryTitle: string, anchor: ReadingAnchor, question: string): string {
  return [
    `关于下面这段（出自知识条目《${entryTitle}》）：`,
    '',
    `> ${anchor.exact}`,
    '',
    `我的问题：${question.trim()}`,
    '',
    '（该条目的全文已在上下文里，可直接引用更远处的依据。）',
  ].join('\n')
}

// ══════════════════════════════════════════════════════════════════════════
// 主体
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐⭐ **「就此提问」的主流程**。
 *
 * @param req - 入参。
 * @param deps - 依赖。
 * @returns 结果（含复用与否）。
 */
export async function askAboutSelection(
  req: ReadingAskRequest,
  deps: AskDeps,
): Promise<ReadingAskResult> {
  const { entryId, anchor, question } = req
  if (question.trim() === '') return { ok: false, error: '问题不能为空。' }

  // ① 🔴 复用优先（红线 1）：同一段落已有会话 ⇒ 不开新的。
  const existing = await findBinding(entryId, anchor.blockId)
  if (existing !== undefined) {
    return {
      ok: true,
      sessionId: existing.sessionId,
      chatEntryId: existing.chatEntryId,
      reused: true,
    }
  }

  // ② 新建：chat 条目 + 会话 + 绑定。
  const entryTitle = await deps.entryTitle(entryId)
  const { sessionId, chatEntryId, created } = await deps.ensureSession({
    entryId,
    entryTitle,
    anchor,
    question,
  })
  if (!created) {
    // ⚠️ `ensureSession` 里发现并发下已经建过了（两次点击几乎同时进来）
    //    ⇒ 它自己会补绑定，这里只要如实回报。
    return { ok: true, sessionId, chatEntryId, reused: true }
  }

  // ③ 写绑定（**必须在首轮之前**：同步侧第一道门就是查它，
  //    见红线 —— 否则第一轮 `turn-stopping` 时反查不到 ⇒ 那一轮永久丢）。
  await appendBinding({
    entryId,
    anchor,
    chatEntryId,
    sessionId,
    createdAt: new Date().toISOString(),
  })

  // ④ 🔴 刷新 `context()` 的同步缓存（**必须在首轮之前**）。
  //    ⚠️ `followup` 已经提交了首轮 ⇒ 这一轮结束时 `turn-stopping` 就会跑同步，
  //    而**下一轮**的 `text()` 要能查到刚建的绑定 ⇒ 这里不刷，文档上下文就丢了。
  //    ⚠️ `void`（fire-and-forget）：刷新是异步读盘，不该拖住这次 HTTP 回执。
  if (deps.onBound !== undefined) void deps.onBound()

  return { ok: true, sessionId, chatEntryId, reused: false }
}

// ══════════════════════════════════════════════════════════════════════════
// 运行时装配（建真会话那一步）
// ══════════════════════════════════════════════════════════════════════════

/** 阅读会话专用工作区的目录名（相对库根）。 */
export const READING_WORKSPACE_DIR = 'reading-sessions'

/**
 * ⭐⭐ **建一个阅读会话**（真实 DSH 会话）。
 *
 * 🔴🔴 **这一步是整个功能唯一"碰运行时"的地方**，顺序照 `dsh-webhook`
 *    （官方从外部请求建会话的先例，`lib/index.js:148-198`）：
 *
 *    1. `workspaceRegistry.create(path)` —— 建/取工作区；
 *    2. `agents.create({sessionId, meta:{cwd, agentPreset}, agentOptions})`；
 *    3. `workspace.attachSession(sessionId)` —— 挂到工作区（否则会话列表里看不到）；
 *    4. `sessionTitle.rename(...)` + `agent.followup(...)` —— 设标题、提交首轮
 *       （`followup` **会唤醒驱动器**）。
 *
 * ⭐⭐ **为什么"建会话"排在"建 chat 条目"之前**（本批特意调的次序）：
 *    chat 条目的 frontmatter 要写 `source.sessionId`（「去会话」按钮的数据来源），
 *    · 先建条目 ⇒ 那时候还没有 sessionId ⇒ 要么留空、要么事后补写；
 *    · 🔴 而 `EntryFieldChange`（`edit.ts` 的字段修改通道）**没有 `source`**，
 *      为它单独加一个口子会把那条"给人用的"通道弄胖；
 *    · ⇒ **先建会话、再建条目** ⇒ `source.sessionId` **一次写对**，没有后补动作。
 *    ⚠️ 代价：若建条目失败，会话已经开了（孤儿）。但那比"按钮永远失效"好——
 *      而且失败会**如实报错**（`ok:false`），用户看得到。
 *
 * ⚠️ **为什么要独立工作区**（`READING_WORKSPACE_DIR`）：一段一会话 ⇒
 *    会话条数会很多。混在日常工作区里会把**用户的会话列表淹掉**
 *    （这正是 v2 反对"真实会话"的主要理由，用工作区隔离来解决）。
 *
 * ⚠️ **`agentOptions` 必须显式给 `{provider, model}`** ——
 *    不传会继承 parent 的 requestHeader（memj 库条目 `d8bf9b47`：
 *    实测继承到 `hy3` 后 maxTokens 被烧光、输出 0 字符）。
 *
 * @param ctx - 插件上下文（untraced，由调用方从 `scoped` 转来）。
 * @param input - 出处 + 锚点 + 问题。
 * @returns 会话 id 与 chat 条目 id。
 */
export async function createReadingSession(
  ctx: Context,
  input: {
    entryId: string
    entryTitle: string
    anchor: ReadingAnchor
    question: string
  },
): Promise<{ sessionId: string; chatEntryId: string; created: boolean }> {
  // ①② 工作区 + 建会话（见上方次序说明）。
  const registry = ctx.get('workspaceRegistry') as {
    create(path: string): Promise<{ path: string; attachSession(id: string): Promise<void> }>
  }
  const workspace = await registry.create(READING_WORKSPACE_DIR)

  // ⭐ sessionId 带 `reading-` 前缀 —— 一眼看出它是哪来的（排障/列表都受益）。
  const sessionId = `reading-${randomUUID()}`
  const preset = await (ctx.get('agentPresets') as {
    resolve(id?: string): Promise<{ id: string }>
  }).resolve()
  const selected = (ctx.get('agentDefaultModel') as {
    currentSelection(): { provider: string; model: string }
  }).currentSelection()

  // ⭐ `agents` 有真实类型（`AgentRegistry`）⇒ **直接用，不写断言**
  //    （第一版写了 `as {create(...)}` 被 TS 拒：参数形状不兼容。
  //     而"先转 unknown 再断言"会绕过这个检查 —— 那正是会静默踩坑的写法）。
  //    ⚠️ 取不到（服务不在）⇒ **如实报错**，不静默走一条残路。
  const agents = ctx.get('agents')
  if (agents === undefined) throw new Error('拿不到 agents 服务，无法创建阅读会话。')

  // ⭐ `sessionId` 是 branded 类型（`SessionId`），而其运行时实现就是
  //    **原样返回**（同 `active-recall.ts` 对 `credentialRef` 的处理：
  //    不 import brand 函数，直接传字符串）⇒ 一次窄断言即可。
  const handle = await agents.create({
    sessionId: sessionId as Parameters<typeof agents.create>[0]['sessionId'],
    meta: { cwd: workspace.path, agentPreset: preset.id },
    // 🔴 显式给模型（见上方警告）。
    agentOptions: { provider: selected.provider, model: selected.model },
  })

  // ③ 建 chat 条目（**此时已有 sessionId** ⇒ source 一次写对）。
  const chat = await createChatEntry(input.entryId, input.entryTitle, input.anchor, sessionId)
  if ('error' in chat) {
    // ⚠️ 条目建不出来 ⇒ 把会话回收掉（不留孤儿）。
    try { await handle.dispose() } catch { /* 回收失败不影响原始错误 */ }
    throw new Error(chat.error)
  }
  const chatEntryId = chat.id

  // ④ 挂工作区 + 设标题 + 提交首轮。
  try {
    await workspace.attachSession(sessionId)
    ;(ctx.get('sessionTitle') as { rename(s: unknown, t: string): void }).rename(
      handle.agent.session,
      `《${input.entryTitle}》问答`,
    )
    handle.agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: renderAskPrompt(input.entryTitle, input.anchor, input.question) }],
        source: { kind: 'plugin', plugin: 'dsh-memj' },
      }),
    )
  } catch (err) {
    // ⚠️ 建到一半失败 ⇒ 回收（照 `dsh-webhook` 的 rollback 形态）。
    try { await handle.dispose() } catch { /* 回收失败不影响原始错误 */ }
    throw err
  }

  return { sessionId, chatEntryId, created: true }
}

/**
 * ⭐ **把本模块的依赖装配好**（供 `api.ts` 的路由调用）。
 *
 * ⚠️ **`onBound` 必须由调用方给**（刷新 `context()` 的同步缓存）：
 *    绑定写进 `bindings.jsonl` 之后，`text()` 查的那张内存 Map 还是旧的
 *    ⇒ 同一会话的**下一轮**注入会查不到 ⇒ 文档上下文静默丢失。
 *    ⚠️ 它是 `void` 调用（fire-and-forget）⇒ 刷新失败不影响本次提问的成功回执。
 *
 * @param ctx - 插件上下文。
 * @param onBound - 绑定写入后的回调（刷新缓存）。
 * @returns `AskDeps`。
 */
export function readingAskDeps(ctx: Context, onBound?: () => void): AskDeps {
  return {
    ensureSession: (input) => createReadingSession(ctx, input),
    entryTitle: async (entryId) => {
      // ⭐ 标题从库里取（封面是权威来源，决策 98）。
      const { scanLibrary } = await import('./store.ts')
      const snap = await scanLibrary()
      const hit = snap.covers.find((c) => c.cover.id === entryId)
      return hit?.cover.title ?? entryId.slice(0, 8)
    },
    // ⚠️ 条件展开（同 `coverFromYaml` 的理由）：本项目开着
    //    `exactOptionalPropertyTypes`，给可选属性显式赋 `undefined` 编译不过；
    //    而"键缺席"与"键在但值为 undefined"对下游是两件事。
    ...(onBound !== undefined ? { onBound } : {}),
  }
}
