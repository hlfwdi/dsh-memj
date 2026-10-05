/**
 * dsh-memj 的客户端（web 端）入口。
 *
 * 两件事（对应设计 §8 与 §10）：
 *  1. ⭐ **给 `/memj-review` 挂 `popupSelect` 弹窗**——裸打命令时弹出人侧面板的四类入口；
 *  2. **侧边栏入口按钮**（`sidebar.footer.action`）——打开独立管理页面。
 *
 * ── 弹窗机制（本节最关键）───────────────────────────────────────────────────
 * 用**官方** `@deepseek-ai/dsh-client-ui-commands` 的 `ctx.commandUi.decorate`：
 *
 * ```ts
 * commandUi.decorate({
 *   name: '/memj-review 的 host 命令名',   // ← 必须 host 已注册同名命令
 *   available: () => true,
 *   ui: { kind: 'popupSelect', options, onSelect },
 * })
 * ```
 *
 * 🔴 **必须是 `decorate` 而不是 `register`**：`register` 是**纯客户端**命令，
 * 而我们的选项数据（提名/断链/非法封面）只有 host 有，且"批准"这个动作也必须
 * 由 host 侧执行（它是**人的动作的入口**，不能在 client 里直接改库）。
 * `decorate` 保留 host 命令的目录行与生命周期日志，只把**裸调用**换成弹窗
 * ——这正是官方 `/permission` 的形态。
 *
 * 🔴 **`options()` 取数据走我们自己的 HTTP API，不走命令 RPC**：
 * `commands.execute()` 会**无条件**往会话日志 append `command/run`+`command/done`
 * 并渲染成 chat flow node ⇒ 每开一次弹窗就留一条记录。HTTP 是旁路，不碰会话日志。
 *
 * 🔴 **弹窗 UI 不用自己写**：popupSelect shell（搜索、↑↓、Enter、Esc、
 * loading/error/retry、风险确认闸）由 ui-commands 自己注册进
 * `conversation.input.overlay`。
 *
 * @module dsh-memj/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// ⚠️ 这个 type-only import 是**必需的**：`ctx.slots` 不是在 ui-slots 里声明的，
// 而是 ui-renderer 通过 `declare module '@deepseek-ai/cordis'` 合并进 `Context` 的。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// ⭐ 提供 `ctx.commandUi` 与 `SelectOption` / `CommandUiContract`。
import type {
  CommandUiContract,
  SelectOption,
} from '@deepseek-ai/dsh-client-ui-commands/client'
// 提供 `ctx.sessions` 与 `SessionBinding.session.command()`。
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import * as React from 'react'

/** 页面基址，与 host 端 `PLUGIN_BASE` **必须一致**。 */
const PLUGIN_BASE = '/plugins/dsh-memj'

/** host 侧的人侧面板命令名（必须与 `commands.ts` 一致）。 */
const CMD_REVIEW = 'memj-review'

/**
 * 侧栏入口图标里那个渐变页层的 `id`。
 *
 * ⚠️ **必须全局唯一**：SVG 的 `id` 是全文档作用域，若与页面里别的 `defs` 撞名，
 * `url(#...)` 会静默指错（图标缺一块或变色，不报错）。
 * 实测本入口在侧栏**只渲染一份**，且 DSH 页面里当时没有别的 `linearGradient`
 * ⇒ 用一个带插件前缀的名字就足够安全。
 */
const MEMJ_MARK_GRAD_ID = 'dsh-memj-mark-grad'

/** ⭐ 两个「取交接」命令名（与 host 侧 `commands.ts` **必须一致**）。 */
const CMD_GET_PROJECT = 'memj-get-handoff-project'
const CMD_GET_THEME = 'memj-get-handoff-theme'

/**
 * 从 host HTTP API 取项目/主题清单，转成弹窗选项。
 *
 * ⚠️ **走 HTTP 而不是命令 RPC**：这是**旁路**，不往会话日志写记录。
 * @param kind - 取项目还是主题。
 * @returns 选项数组；失败时返回空数组（弹窗显示 empty 态）。
 */
async function fetchListOptions(kind: 'projects' | 'themes'): Promise<readonly SelectOption[]> {
  try {
    const res = await fetch(`${PLUGIN_BASE}/api/${kind}`, { cache: 'no-store' })
    if (!res.ok) return []
    const data = (await res.json()) as {
      projects?: Array<{ id: string; desc?: string }>
      themes?: Array<{ id: string; desc?: string; covers?: number }>
    }
    if (kind === 'projects') {
      return (data.projects ?? []).map((p) => ({
        id: p.id,
        label: p.id,
        detail: p.desc !== undefined && p.desc !== '' ? p.desc : '（无描述）',
      }))
    }
    return (data.themes ?? []).map((t) => ({
      id: t.id,
      label: t.id,
      detail: `${t.desc !== undefined && t.desc !== '' ? t.desc : '（无描述）'} ｜ ${t.covers ?? 0} 条知识`,
    }))
  } catch {
    return []
  }
}

/**
 * `useSessions` 选择器能看到的**会话列表状态**（跨版本并集，字段一律可选）。
 *
 * 🔴 **为什么要写成并集**：这个 state 的形状在 0.1.5-rc.2 → 0.2.0-rc.2 之间变过 ——
 * **`current` 被删掉了**（新契约注释写明 *"navigation belongs to view owners"*：
 * 0.2.0 起"当前在看哪个会话"归视图层管，不再放在 session list state 里）。
 * ⚠️ 只声明"我要读的那两个字段"，不 import 框架类型 ⇒ 两版都能编译。
 */
interface SessionListStateShape {
  /** 0.1.5-rc.2 及更早：当前被寻址的会话。**0.2.0 起已移除**。 */
  current?: unknown
  /** 会话行表（0.2.0+ 要在这里按 `retainedBy.mainView` 推出"当前会话"）。 */
  byId?: Record<string, { id?: unknown; retainedBy?: { mainView?: number } } | undefined>
}

/**
 * ⭐⭐ **跨版本取"当前会话 id"**。
 *
 * - **0.1.5-rc.2**：直接用 `state.current`；
 * - **0.2.0-rc.2**：`current` 已被删除 ⇒ 退到 **主视图持有的那个会话** ——
 *   这正是 DSH 自己的判据（`dsh-client-ui-layout` 的 `DocumentTitle`）：
 *   `Object.values(state.byId).find((s) => (s.retainedBy.mainView ?? 0) > 0)?.id`。
 *
 * ⚠️ **必须先认 `current`**：这样在 0.1.5 上行为一字不变，两版共用一份实现、不分叉。
 * ⚠️ 返回值是**字符串或 undefined**（选择器 hook 要求引用稳定的返回值，
 * 直接回 state 对象会让每次快照都被判成"变了"）。
 * @param state - `useSessions` 选择器的入参。
 * @returns 当前会话 id；取不到时 `undefined`。
 */
function currentSessionOf(state: SessionListStateShape): string | undefined {
  const cur = state.current
  if (typeof cur === 'string' && cur !== '') return cur
  for (const row of Object.values(state.byId ?? {})) {
    if (row === undefined) continue
    if ((row.retainedBy?.mainView ?? 0) > 0) {
      const id = row.id
      if (typeof id === 'string' && id !== '') return id
    }
  }
  return undefined
}

/** 侧边栏入口按钮的 props：root scope 下只有列宽 + 全局标准 props。 */
interface EntryButtonProps {
  wide: boolean
  /**
   * ⚠️ 入参形状是**跨版本并集**（见 `SessionListStateShape`）：0.2.0 删了 `current`。
   */
  useSessions: (selector: (state: SessionListStateShape) => string | undefined) => string | undefined
}

/**
 * ⭐⭐ **跨窗口广播当前会话**（用户 2026-09-22 要求："我在 dsh 切换会话的时候，
 * 前端就要去获取到 sessionId"）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * 记忆库是**独立标签页**（`target="_blank"`），它的 `?session=` 是
 * **打开那一刻**烘焙进 URL 的 ⇒ 之后你在 DSH 里切会话，**那个标签不知道**，
 * 会一直对着旧会话显示状态、写绑定。
 *
 * ── 做法照抄本项目已有的同类实现（**不另造**）────────────────────────────────
 * `dsh-prompt-inject/src/client/index.tsx:30-39` 用 `BroadcastChannel` 解决同一问题；
 * 本项目纪律：**引入新写法前，先看同一个载体里有没有人这么写**。
 * ⚠️ 频道名**必须用本插件自己的**（`dsh-memj`）——用别人的会串台
 * （同源策略下 `BroadcastChannel` 按名字隔离，但同名就会互相收）。
 *
 * ⚠️ **`BroadcastChannel` 只在同源、同浏览器、同 profile 下有效**；
 * 不同浏览器/无痕窗口之间**不通**（那时页面里的「当前会话」会停在打开时的值，
 * 用户可在页面上手动改绑定 —— 这是可接受的降级，**不静默**：页面会显示会话 id）。
 */
const HOT_CHANNEL = 'dsh-memj'

/** 惰性建一次（`BroadcastChannel` 在旧浏览器可能不存在 ⇒ 整个广播降级为 no-op）。 */
let hotChannel: BroadcastChannel | null = null

/**
 * 广播"当前会话变了"。
 * @param sessionId - 当前选中的会话 id；空值**不广播**（没有意义且会覆盖页面上的有效值）。
 */
function broadcastSession(sessionId: unknown): void {
  if (typeof sessionId !== 'string' || sessionId === '') return
  try {
    if (hotChannel === null) hotChannel = new BroadcastChannel(HOT_CHANNEL)
    hotChannel.postMessage({ type: 'session', sessionId })
  } catch {
    /* 广播失败不影响入口按钮本身 */
  }
}

/**
 * 记忆库入口按钮。
 *
 * 🔴 root scope 的 props 里**没有 `sessionId`**——那是 session scope 才注入的，
 * 必须用全局 hook `useSessions` 自己取。
 * ⭐ 但 `useSessions` 是**订阅式**的：DSH 里切会话时会**重新渲染本组件**
 * ⇒ 借这次重渲染把新会话**广播**给已打开的页面（见上）。
 * @param props - 列宽状态与全局 hooks。
 * @returns 指向独立页面的链接。
 */
function MemjEntryButton({ wide, useSessions }: EntryButtonProps): React.ReactElement {
  // ⭐ 跨版本取"当前会话"（0.1.5: `state.current`；0.2.0+: 主视图持有的那个）。
  const sessionId = useSessions(currentSessionOf)
  const sid = sessionId === undefined || sessionId === null ? '' : String(sessionId)

  // ⭐ **挂载即广播一次**（页面首载兜底）+ **切会话时随重渲染再广播**（实时跟随）。
  //    ⚠️ 依赖数组必须是 `[sid]`：只在会话**真的变了**时才广播
  //       （每次渲染都广播会产生无谓噪音，也会让页面反复重拉）。
  React.useEffect(() => {
    broadcastSession(sid)
  }, [sid])

  const href =
    sid === ''
      ? `${PLUGIN_BASE}/`
      : `${PLUGIN_BASE}/?session=${encodeURIComponent(sid)}`

  return React.createElement(
    'a',
    {
      href,
      // ⚠️ 开新标签用 `<a target="_blank" rel="noopener noreferrer">`
      // （DSH 前端自身唯一在用模式）；`window.open` 也可用但必须同步调用。
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': '打开 memj 记忆库',
      title: 'memj 记忆库',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: wide ? 'flex-start' : 'center',
        gap: wide ? '8px' : '0',
        width: '100%',
        height: '32px',
        // ⭐ 对齐基准 = 「图标左缘对齐图标左缘」（实测官方各行容器 x 本就不一致：
        //    设置 x=10/图标 x=18、插件 x=14/图标 x=22 ⇒ 没法靠容器对齐）。
        //    memj 容器 x=12 ⇒ padL 取 6px 让图标左缘正好落在 x=18，与「设置」精确对齐。
        padding: wide ? '0 6px' : '0',
        boxSizing: 'border-box',
        borderRadius: '6px',
        color: 'var(--dsw-alias-label-primary, inherit)',
        textDecoration: 'none',
        fontSize: '13px',
        lineHeight: '32px',
        cursor: 'pointer',
      },
    },
    React.createElement(
      'span',
      {
        'aria-hidden': true,
        style: {
          // ⭐ 固定 16×16 图标槽（官方「插件」行同款：16px 槽 + 8px gap ⇒ 文字对齐官方 x=42）。
          width: '16px',
          height: '16px',
          flex: '0 0 16px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
      React.createElement(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': true,
        },
        React.createElement(
          'defs',
          null,
          React.createElement(
            'linearGradient',
            { id: MEMJ_MARK_GRAD_ID, x1: 0, y1: 1, x2: 1, y2: 0 },
            React.createElement('stop', { offset: 0, stopColor: '#9B4DFF' }),
            React.createElement('stop', { offset: 1, stopColor: '#6E7BFF' }),
          ),
        ),
        // ── 三层渐变"记忆页"：从 j 的钩后向右下层叠（用户 2026-10-03 认可的设计）──
        React.createElement(
          'g',
          { fill: `url(#${MEMJ_MARK_GRAD_ID})` },
          React.createElement('rect', { x: 15.2, y: 14.6, width: 6.4, height: 3.6, rx: 1.1, opacity: 0.85 }),
          React.createElement('rect', { x: 14.6, y: 16.8, width: 6.4, height: 3.6, rx: 1.1, opacity: 0.55 }),
          React.createElement('rect', { x: 14, y: 19, width: 6.4, height: 3.6, rx: 1.1, opacity: 0.3 }),
        ),
        // ── j：粗描边画出正规字母降部钩（深钩、末端上扬、全笔画等粗）──
        //    ⚠️ 16px 下实际线宽 = 4.6 × 16/24 ≈ 3.07px ⇒ 实心感，是刻意的"粗标记"，
        //       与齿轮那种 1.3px 细线条图标并置时形成主次对比。
        React.createElement('path', {
          d: 'M13.8 7.8 L13.8 14.5 C13.8 19.0 11.2 21.6 7.4 21.6 C5.0 21.6 3.4 20.0 3.4 18.2',
          stroke: 'currentColor',
          'stroke-width': 4.6,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          fill: 'none',
        }),
        // ── 四角星：替代 j 的点，右上悬浮（内径≈外径 1/3）──
        React.createElement('path', {
          d: 'M21.80 3.30L19.33 4.03L18.60 6.50L17.87 4.03L15.40 3.30L17.87 2.57L18.60 0.10L19.33 2.57Z',
          fill: 'currentColor',
        }),
      ),
    ),
    wide ? React.createElement('span', null, 'memj 记忆库') : null,
  )
}

/**
 * 从 host 的 HTTP API 取人侧状态摘要，转成弹窗选项。
 *
 * 🔴 **为什么不用 `session.command(...)`**：那会往会话日志写命令记录；
 * HTTP 是旁路，不碰会话日志。
 * @returns 四个入口选项；失败时返回空数组（弹窗显示 empty 态）。
 */
async function fetchReviewOptions(): Promise<readonly SelectOption[]> {
  try {
    const res = await fetch(`${PLUGIN_BASE}/api/health`, { cache: 'no-store' })
    if (!res.ok) return []
    const data = (await res.json()) as {
      projects?: number
      themes?: number
      covers?: number
      nominations?: number
      invalidCovers?: number
    }
    const n = data.nominations ?? 0
    const bad = data.invalidCovers ?? 0
    return [
      {
        id: 'pending',
        label: `待批 global 提名（${n}）`,
        detail: n === 0 ? '当前没有待批准的提名' : '选中后查看明细，并可在网页界面批准 / 否决',
        ...(n > 0 ? { active: true } : {}),
      },
      {
        id: 'broken',
        label: '断链的外部引用',
        detail: 'ext: true 但目标文件已不存在——需要人工补档或删封面',
      },
      {
        id: 'invalid',
        label: `非法封面（${bad}）`,
        detail: bad === 0 ? '全部封面格式合法' : '格式不合法，重建时已被跳过',
        ...(bad > 0 ? { active: true } : {}),
      },
      {
        id: 'rebuild',
        label: '重建派生层',
        detail: `从项目文档重新聚合 THEME / GLOBAL（当前 ${data.projects ?? 0} 个项目、${data.themes ?? 0} 个主题）`,
      },
    ]
  } catch {
    return []
  }
}

export const name = 'dsh-memj'

/**
 * ⚠️ 这些是 **cordis 服务名**，不是包名。
 * 客户端**包名边**由 `package.json` 的 `dsh.client.inject` 单独声明——两者是两套东西。
 */
export const inject = ['slots', 'commandUi', 'sessions'] as const

/**
 * 注册侧边栏入口与 `/memj-review` 的弹窗。
 * @param ctx - 客户端上下文。
 */
export function apply(ctx: ClientContext): void {
  // ── 1. 侧边栏入口按钮 ──────────────────────────────────────────────────────
  // 必须用 `ctx.slots.inject`——slot 声明与本插件的激活顺序不受约束。
  ctx.slots.inject('sidebar.footer.action', function* () {
    yield ctx.slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'dsh-memj',
        // 与 power-control（90/100）、dsh-memory（80）错开。
        order: 70,
        label: () => 'memj 记忆库',
      },
      MemjEntryButton as never,
    )
  })

  // ── 2. `/memj-review` 的 popupSelect 装饰 ─────────────────────────────────
  const commandUi = ctx.get('commandUi') as CommandUiContract | undefined
  if (commandUi === undefined) return
  const sessions = ctx.get('sessions') as ISessions | undefined
  if (sessions === undefined) return

  /**
   * 选项选中后：**把完整命令行回交 host**，由 host 的命令 handler 产出内容。
   *
   * ⚠️ **为什么不在 client 直接处理**：人侧面板的内容（提名明细、断链清单）
   * 与"批准/否决"动作都在 host 侧；client 只负责发起。
   * ⚠️ `ClientSessionContext` **只有 `{ sessionId }`**（刻意的极小投影）。
   * 要拿能执行命令的会话对象，得用 `ctx.sessions.binding(id)?.session`。
   */
  const decoration = {
    name: CMD_REVIEW,
    available: () => true,
    ui: {
      kind: 'popupSelect' as const,
      options: async (): Promise<readonly SelectOption[]> => fetchReviewOptions(),
      onSelect: async (
        option: SelectOption,
        session: { sessionId: string },
      ): Promise<void> => {
        const face = sessions.binding(session.sessionId as never)
        if (face !== undefined) {
          // 回交完整命令行 ⇒ host 的 handler 执行。
          await face.session.command(`/${CMD_REVIEW} ${option.id}`)
        }
      },
    },
  }

  ctx.effect(() => commandUi.decorate(decoration), 'dsh-memj: review popup')

  // ══════════════════════════════════════════════════════════════════════════
  // ⭐⭐ 两个「取交接」命令的弹窗（决策 110）
  //
  // 🔴 **与 `/memj-review` 的关键区别**：那条是**选中即执行**（回交完整命令行），
  //    而这里**要的恰恰是"选中不执行"**——把命令行**写回输入框**，
  //    让用户**再补一句档位**（只看文档 / 连带项目知识 / 全部），回车才执行。
  //
  // ⭐ **所以这里仍然用 `popupSelect`**（列表/搜索/键盘导航都白送），
  //    只是 `onSelect` 里**不调 `session.command(...)`**，改成 `setDraft`。
  //    ⇒ 既拿到现成的列表 UI，又拿到"选完能补话"。
  //
  // 🔴 **必须延后一拍写草稿**：宿主的流程是
  //    `onSelect()` → `consume(token)` → `focusComposer()`，
  //    ⚠️ `consume` 会**把触发 token 从草稿里去掉**——若我们同步 `setDraft`，
  //    刚写进去的命令行会被它清掉。⇒ 用 `queueMicrotask` 排在它之后。
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * 造一个"选中后写回输入框"的装饰。
   * @param name - host 命令名。
   * @param kind - 列表来源（projects / themes）。
   * @returns 装饰定义。
   */
  const makeDraftDecoration = (name: string, kind: 'projects' | 'themes') => ({
    name,
    available: () => true,
    ui: {
      kind: 'popupSelect' as const,
      options: async (): Promise<readonly SelectOption[]> => fetchListOptions(kind),
      onSelect: async (option: SelectOption, session: { sessionId: string }): Promise<void> => {
        const face = sessions.binding(session.sessionId as never)
        if (face === undefined) return
        const line = `/${name} ${option.id} `
        // ⚠️ 延后：让宿主的 `consume` / `focusComposer` 先跑完。
        queueMicrotask(() => {
          try {
            // ⭐ `binding.ctx` 是 **session scope 的 ctx**——
            //    `conversation` 服务只在那个 scope 拿得到（root scope 是 undefined，已实测）。
            const sctx = (face as unknown as { ctx?: { get?: (n: string) => unknown } }).ctx
            const conv = sctx?.get?.('conversation') as
              | { input?: { for?: (a: unknown) => { setDraft?: (t: string) => void } } }
              | undefined
            const facade = conv?.input?.for?.(sctx)
            facade?.setDraft?.(line)
          } catch {
            /* 静默：拿不到就退化成"用户自己手打" */
          }
        })
      },
    },
  })

  for (const decoration of [
    makeDraftDecoration(CMD_GET_PROJECT, 'projects'),
    makeDraftDecoration(CMD_GET_THEME, 'themes'),
  ]) {
    ctx.effect(() => commandUi.decorate(decoration), `dsh-memj: ${decoration.name} popup`)
  }
}
