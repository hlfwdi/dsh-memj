/**
 * dsh-memj —— **「文档内提问」的上下文注入**（2026-10-14，第 4 期）
 *
 * ── 它做什么 ──────────────────────────────────────────────────────────────
 * 用户裁定的核心诉求：**「把文档本身作为上下文通过 context 注入的方式注入」**。
 * 本模块把「被提问的那条知识的全文」注入进**那个阅读会话**的模型上下文。
 *
 * ── 🔴 三条设计红线 ────────────────────────────────────────────────────────
 * 1. **必须按 sessionId 过滤** —— `systemPrompt.context()` 是**全局注册**的，
 *    它的 `text(ctx)` 对**所有 agent** 返回同一份内容。不在里面判
 *    「这个会话绑定了哪条知识」⇒ **所有会话都被塞进同一条文档**。
 *    ⚠️ 空字符串是安全值：`project()` 里 `current.length === 0` 走 CLEARED 分支，
 *    不会给无关会话塞东西。
 * 2. **内容完整性自检** —— 框架保证「同值不发 / 丢了补发」，
 *    **不保证「发出去的确实是完整全文」**。渲染前后校验首尾片段在不在；
 *    ⚠️ **宁可不注入，也别注入半篇**（模型会拿着半篇自信回答，
 *    而用户以为它看着全文 —— 这个失败模式是静默的）。
 * 3. **`text()` 必须快** —— 它**每轮都调用** ⇒ 查库要带**同步内存缓存**
 *    （缓存失效：bindings 变更时清）。
 *
 * @module dsh-memj/reading-context
 */

import type { Context } from '@deepseek-ai/cordis'
import { loadBindings } from './reading.ts'
import { loadEntryDoc, scanLibrary } from './store.ts'

/** 依赖（注入以便测试）。 */
export interface DocContextDeps {
  /**
   * 查「这个会话绑定了哪条知识」。
   * ⚠️ **必须同步**（`text()` 要同步返回）⇒ 背后是内存 Map。
   */
  docOf(sessionId: string): { entryId: string; blockId: string } | undefined
  /** 读某条知识的正文（同步，走缓存）。 */
  entryBody(entryId: string): string | undefined
  /** 读某条知识的标题（同步，走缓存）。 */
  entryTitle(entryId: string): string | undefined
}

/** 前后各校验多少字符（首尾片段）。 */
const INTEGRITY_CHARS = 64

/**
 * ⭐⭐ **装配「正在阅读的知识条目」注入**（供 `apply()` 在 `ctx.inject` 回调里调用）。
 *
 * 🔴🔴 **为什么需要"同步缓存"这一层**：
 *    `systemPrompt.context()` 的 `text()` 必须**同步返回**（签名就是 `(ctx) => string`），
 *    而 bindings 与条目正文都是**异步读盘**的。
 *    · 直接在 `text()` 里 `await` ⇒ 不可能（签名不允许）；
 *    · 用 `fs.readFileSync` ⇒ 每轮一次磁盘 IO，且项目已有 `readTextIfExists` 那套
 *      异步封装，另起一套会漂移；
 *    · ⇒ **预热进内存 Map**，`text()` 只查 Map（红线 3「必须快」）。
 *
 * ⭐ **缓存什么时候刷新**：
 *    · 启动时预热一次（异步，不阻塞 apply；失败由 catch 兜住）；
 *    · `askAboutSelection` 建完绑定后调返回的 `refresh()`（否则同一会话的**下一轮**
 *      注入会查不到刚建的绑定 ⇒ 文档上下文丢了 —— 而那是静默的）；
 *    · ⚠️ **不做定时刷新**：库文件可能在别处被改，但「阅读会话」的生命周期很短
 *      （一次阅读几分钟），重启即刷新，收益不足以换取每轮读盘。
 *
 * ⚠️ **它不自己注册**（不像第一版那样内部 `ctx.inject`）：
 *    调用方**已经在** `ctx.inject(['systemPrompt'], cb)` 回调里了 ⇒
 *    那里拿到的 `scoped` 没有 `.inject` 方法（`probe-host.mjs` 抓到过
 *    `ctx.inject is not a function`）⇒ 注册那一步由调用方用 `scoped` 直接做。
 *
 * @returns 缓存三件套 + `refresh`（建绑定后调用 `refresh`）。
 */
export function installDocContext(): DocContextCache {
  /** sessionId → 绑定（`text()` 查它）。 */
  const index = new Map<string, { entryId: string; blockId: string }>()
  /** entryId → 正文。 */
  const bodies = new Map<string, string>()
  /** entryId → 标题。 */
  const titles = new Map<string, string>()

  const refresh = async (): Promise<void> => {
    try {
      const all = await loadBindings()
      index.clear()
      for (const b of all) index.set(b.sessionId, { entryId: b.entryId, blockId: b.anchor.blockId })
      // ⭐ 只预热**被绑定过的**条目（阅读功能碰过的知识通常很少）。
      const need = new Set(all.map((b) => b.entryId))
      const snap = await scanLibrary()
      for (const { cover } of snap.covers) {
        if (!need.has(cover.id)) continue
        titles.set(cover.id, cover.title)
        const doc = await loadEntryDoc(cover.ref, false)
        if (doc !== undefined) bodies.set(cover.id, doc.body)
      }
    } catch {
      // ⚠️ 预热失败 ⇒ 缓存可能不全，但**不清空**（留着旧的好过全没有）。
      //    ⇒ 表现是"某些会话注入不到文档"，而那比"所有会话都注入不到"好。
    }
  }

  // ⭐ 启动即预热（异步，不阻塞 apply；失败由上面的 catch 兜住）。
  void refresh()

  return { refresh, index, bodies, titles }
}

/**
 * ⭐ **渲染「正在阅读的知识条目」上下文块**。
 *
 * ⭐ **形态照 memj 已有的 `context()` 用法**（`order=125` 那一类）：
 *    状态类内容、cache-safe（尾部 append，不破前缀缓存）、
 *    同值不发、压缩后自动补 —— 这三条是框架给的（`RuntimeContextProjection`）。
 *
 * ⚠️ **刻意不把「被讨论的段落」单独复制一遍到 `<doc>` 外面** ——
 *    那会把那段文本发两次。用标记（❖）指向即可（`markAnchor`）。
 *
 * @param entryTitle - 条目标题。
 * @param body - 条目正文（全文）。
 * @param anchorExact - 用户选中的原文（用于在正文里打标记）。
 * @returns 注入文本；正文为空 ⇒ 空串（调用方据此跳过注入）。
 */
export function renderDocContext(
  entryTitle: string,
  body: string,
  anchorExact: string,
): string {
  if (body.trim() === '') return ''
  return [
    '## 正在阅读的知识条目',
    '',
    `**《${entryTitle}》**`,
    '',
    '你正在与用户讨论下面这条知识。用户当前关注的段落已用 ❖ 标出。',
    '回答时优先基于该段落及其上下文；需要更远处的依据时，可在全文中定位后引用。',
    '',
    '<entry>',
    markAnchor(body, anchorExact),
    '</entry>',
    '',
  ].join('\n')
}

/**
 * ⭐ **在正文里给锚点段落打标记**（❖ 包裹）。
 *
 * ⚠️ **找不到就原样返回**（不抛错）：锚点可能因为条目被编辑而位移，
 *    但全文仍然有效 ⇒ 打不上标记不该让整个注入失败。
 * @param body - 条目正文。
 * @param exact - 选中的原文。
 * @returns 打过标记的正文。
 */
export function markAnchor(body: string, exact: string): string {
  // 🔴🔴 **紧贴包裹，绝不加空白** —— 第一批写的是 `❖ ${exact} ❖`，
  //     剥掉 ❖ 后多出两个空格 ⇒ 正文回不到逐字相同 ⇒ 完整性自检恒不过关
  //     ⇒ 现象是"永远不注入"，而极易被误判成"校验太严"。
  //     ⭐ 判据：**"可逆的装饰"才配参与判据** —— 打标记只为让人看得见，
  //       不能顺手改动原文本身（`stripAnchorMarks` 是它的严格逆运算）。
  if (exact === '' || !body.includes(exact)) return body
  return body.replace(exact, `❖${exact}❖`)
}

/**
 * ⭐⭐ **内容完整性自检**（红线 2）。
 *
 * 🔴 **为什么需要它**：框架的 `project()` 只判「与上次是否同值」，
 *     不判「这次渲染出来的是不是完整的」。若 `entryBody` 因为某种原因
 *     只读到一半（文件被截断、读盘中断、缓存污染），
 *     ⇒ 注入半篇 ⇒ 模型拿着半篇**自信地回答**，用户以为它看着全文。
 *     ⭐ **宁可不注入**：用户会看到"AI 好像不知道后面内容"，
 *     而那至少是可察觉的；注入半篇则是**静默的错**。
 *
 * ⚠️⚠️ **必须先剥掉锚点标记再比** —— 第一批实现就在这里错：
 *     `markAnchor` 会把 `exact` 替换成 `❖ exact ❖`（**插入了 4 个字符**）
 *     ⇒ 含 `exact` 的头/尾片段在渲染文本里**不再逐字存在** ⇒ 自检恒不过关
 *     ⇒ 表现是"永远不注入"（而现象看起来像"完整性校验太严"，很容易误判）。
 *     ⭐ 判据：**"比对原文"与"原文被装饰过"是两件事** ——
 *        装饰（打标记）只服务于人/模型的**阅读**，不该参与完整性判据。
 *
 * @param rendered - 渲染后的注入文本（**可能带 ❖ 标记**）。
 * @param body - 原始正文（未打标记）。
 * @returns 是否完整（首尾片段都在）。
 */
export function isCompleteContext(rendered: string, body: string): boolean {
  if (body.trim() === '') return false
  // ⭐ 剥掉标记再比（见上方警告）。
  const plain = stripAnchorMarks(rendered)
  const head = body.slice(0, INTEGRITY_CHARS)
  const tail = body.slice(-INTEGRITY_CHARS)
  return plain.includes(head) && plain.includes(tail)
}

/**
 * ⭐ **剥掉锚点标记**（`❖ x ❖` ⇒ `x`）。
 *
 * ⚠️ **只剥这一种模式**：`markAnchor` 是唯一写入方，模式固定
 *    ⇒ 用同一个字面量反向替换即可，不需要通用 markdown 解析。
 * @param text - 可能带标记的文本。
 * @returns 剥掉标记的文本。
 */
export function stripAnchorMarks(text: string): string {
  // ⚠️ **只剥 `❖` 这一个字符，不碰任何空白** —— 与 `markAnchor` 严格互逆
  //    （第一批在这里写了 `\s*` 把空白也吞了，反而与写入端不匹配）。
  return text.replace(/❖/g, '')
}

/**
 * ⭐⭐ **注册「正在阅读的知识条目」上下文**（供 `apply()` 调用）。
 *
 * 🔴 **`scoped` 是 `ctx.inject([...])` 回调里的那个对象**，不是 `ctx` 本身 ——
 *    `ctx.inject` 在回调里**不存在**（第一版在这里写了 `ctx.inject(['systemPrompt'], …)`，
 *    被 `probe-host.mjs` 当场抓到 `ctx.inject is not a function`）。
 *    ⭐ 直接用它注册（照 `index.ts` 既有的 `scoped.systemPrompt.context({...})` 写法）。
 *
 * 🔴 **`text()` 的三条纪律**（见文件头红线）：
 *    1. 按 sessionId 过滤（无关会话返回 `''`）；
 *    2. 完整性自检（不过关返回 `''`）；
 *    3. **同步、快**（依赖全是内存缓存）。
 *
 * @param scoped - `ctx.inject(['systemPrompt'], cb)` 回调里的作用域对象。
 * @param deps - 依赖。
 * @param order - 插入顺序（照 memj 既有 `context()` 的取值往后排）。
 */
export function registerDocContext(
  scoped: SystemPromptScope,
  deps: DocContextDeps,
  order = 130,
): void {
  scoped.systemPrompt.context({
    name: 'memj:reading-doc',
    order,
    // 🔴🔴 **`required: true` 必须传**（2026-10-19，DSH 0.2.1 新增字段）。
    //
    // ⚠️ **不传的后果**：0.2.1 的 `suppressRuntimeContext()`（`includeRuntimeContext:false`
    //    也走它）会把**所有没标 `required` 的 context 一律摘掉**。
    //    而这一条**正是"用户正在读这篇知识"的全文注入**（文档内提问的命脉）——
    //    被摘掉后模型只会看到一句「用户就某段提了个问题」，**手里没有正文**
    //    ⇒ 答非所问，且**不报任何错**（表现为"它怎么忽然不知道我在说什么了"）。
    //
    // ⭐ **为什么它算 operational context**：它不是"锦上添花的动态信息"，
    //    而是**这一轮回答所依据的材料本身** —— 与官方 sandbox/approval 同类。
    //
    // ⚠️ **旧版本（0.1.5 / 0.2.0）不认识这个字段 ⇒ 原样忽略**，无害。
    //    类型上本仓的 `SystemPromptScope` 是**手写的最小面**（见文件末尾），
    //    把 `required` 直接加进那个接口即可，不需要并集断言。
    required: true,
    text: (c: { agent?: { session?: { id?: string } } }) => {
      try {
        const sessionId = c.agent?.session?.id
        if (typeof sessionId !== 'string' || sessionId === '') return ''
        const bound = deps.docOf(sessionId)
        if (bound === undefined) return ''
        const body = deps.entryBody(bound.entryId)
        if (body === undefined || body.trim() === '') return ''
        const title = deps.entryTitle(bound.entryId) ?? ''
        const rendered = renderDocContext(title, body, bound.blockId)
        // 🔴 红线 2：不完整 ⇒ 不注入（宁缺毋滥）。
        if (!isCompleteContext(rendered, body)) return ''
        return rendered
      } catch {
        // 🔴 `text()` 抛异常会**毁掉整个 step** ⇒ 必须吞掉、退化成"不注入"。
        return ''
      }
    },
  })
}

/** `ctx.inject(['systemPrompt'], cb)` 回调里那个作用域的**最小面**。 */
interface SystemPromptScope {
  systemPrompt: {
    context(spec: {
      name: string
      order: number
      /**
       * ⭐ DSH **0.2.1+** 才有的字段：标记"这是操作型上下文"，
       * 使它在 `suppressRuntimeContext()` / `includeRuntimeContext:false` 时**不被摘掉**。
       * ⚠️ 旧版本只是忽略它（多传一个不认识的键无害）。
       */
      required?: boolean
      text: (ctx: { agent?: { session?: { id?: string } } }) => string
    }): unknown
  }
}

/**
 * ⭐ **`installDocContext()` 的返回值**：三张同步表 + 刷新函数。
 *
 * ⚠️ **刻意把三张表直接暴露**（而不是包成 getter）：
 *    调用方（`index.ts`）要把它们接进 `registerDocContext` 的 `deps`，
 *    而 `deps` 的三个方法就是同步查表 ⇒ 直接给表最直白，少一层间接。
 */
export interface DocContextCache {
  /** `refresh()` —— 重新预热（建绑定后必须调）。 */
  refresh(): Promise<void>
  /** sessionId → 绑定。 */
  index: Map<string, { entryId: string; blockId: string }>
  /** entryId → 正文。 */
  bodies: Map<string, string>
  /** entryId → 标题。 */
  titles: Map<string, string>
}
