/**
 * dsh-memj —— **模板工具的决策逻辑**（决策 205，纯函数）
 *
 * 🔴 **为什么单独一个模块**：`memj_template` 的"两段式确认"是**可单测的纯逻辑**，
 *   而 `tools.ts` 里的 `execute` 依赖 `ctx`、不好单测（本项目判据：
 *   **纯函数测试覆盖不到工具层契约，但工具层逻辑该抽出来就抽出来**）。
 *
 * ── 两段式确认（用户 2026-09-30 裁定：走 (b) 方案）──────────────────────
 * 模型**不能**自己建模板 / 自己选模板建项目 —— 必须**用户在主会话确认**。
 *   · 第一次调用（不给 `confirm`）⇒ 返回"待确认"回执，**什么都不做**；
 *   · 用户在主会话说"确认"后，模型带 `confirm: true` 再调一次 ⇒ 才执行。
 *
 * ⭐ 这与本项目既有的 `confirmCreate`（相似 id 的两段式确认）**同一套路**。
 *
 * @module dsh-memj/template-tool
 */
import type { Template } from './templates.ts'

/** 模板工具的动作。 */
export type TemplateAction = 'list' | 'create' | 'delete'

/** 请求（来自模型）。 */
export interface TemplateToolRequest {
  action: TemplateAction
  /** `create` 时的模板（形状宽松，由 `normalizeTemplate` 规整）。 */
  template?: unknown
  /** `delete` 时的模板 id。 */
  id?: string
  /** ⭐ 用户的确认（第一段不给 ⇒ 只回"待确认"）。 */
  confirm?: boolean
}

/** 决策结果。 */
export type TemplateToolDecision =
  /** 需要用户确认 —— **本次什么都没做**。 */
  | { kind: 'needs-confirm'; message: string }
  /** 直接执行（`list`，或已确认）。 */
  | { kind: 'run' }
  /** 明确拒绝（输入不对）。 */
  | { kind: 'reject'; message: string }

/**
 * 决定该次调用是"待确认"、"执行"还是"拒绝"。
 *
 * 🔴 **`list` 不需确认**（只读、零副作用）—— 要求确认反而会让模型没法先看有哪些模板。
 * @param req - 模型给的请求。
 * @returns 决策。
 */
export function decideTemplateTool(req: TemplateToolRequest): TemplateToolDecision {
  const action = req.action
  if (action !== 'list' && action !== 'create' && action !== 'delete') {
    return { kind: 'reject', message: `未知的 action：\`${String(action)}\`。只能是 list / create / delete。` }
  }
  // ⭐ 只读动作不需要确认。
  if (action === 'list') return { kind: 'run' }

  if (action === 'create') {
    if (req.template === undefined || req.template === null) {
      return { kind: 'reject', message: '`action: "create"` 必须给 `template`。' }
    }
  }
  if (action === 'delete') {
    const id = (req.id ?? '').trim()
    if (id === '') return { kind: 'reject', message: '`action: "delete"` 必须给 `id`。' }
    if (id === 'default') return { kind: 'reject', message: '内置模板 `default` 不可删除。' }
  }

  // ⭐⭐ 关键：未确认 ⇒ **只回一份"待确认"回执，什么都不做**。
  if (req.confirm !== true) {
    return { kind: 'needs-confirm', message: confirmMessage(req) }
  }
  return { kind: 'run' }
}

/**
 * 生成"待用户确认"的回执。
 *
 * 🔴 **这份文案是给模型看的**，要求它把内容转达给用户、并在**用户明确同意后**
 *   才带 `confirm: true` 再调 —— ⚠️ 措辞必须**明确要求用户确认**，
 *   不能写成"已保存"（那会让模型以为做完了）。
 * @param req - 模型给的请求。
 * @returns 回执文本。
 */
export function confirmMessage(req: TemplateToolRequest): string {
  if (req.action === 'delete') {
    return (
      `⏸️ **待确认**：要删除模板 \`${(req.id ?? '').trim()}\`。\n\n` +
      '请把这个操作**告诉用户并取得同意**；用户同意后，带 `confirm: true` 重调一次。\n' +
      '⚠️ 本次**什么都没做**。\n' +
      '⭐ 删除模板**不影响任何已有文档** —— 文档记着自己的节名，与模板已解耦。'
    )
  }
  const t = req.template as Partial<Template> | undefined
  const id = typeof t?.id === 'string' ? t.id : '(未命名)'
  const title = typeof t?.title === 'string' ? t.title : ''
  const secs = Array.isArray(t?.sections) ? t.sections : []
  const names = secs
    .map((s) => (s !== null && typeof s === 'object' ? String((s as { name?: unknown }).name ?? '') : ''))
    .filter((s) => s !== '')
  // 🔴 **决策 223（2026-10-09 修）**：这里原来数的是"有几节声明了 `truncate`" ——
  //   而那个字段**已废除** ⇒ 计数**恒为 0** ⇒ 待确认回执**永远**说"没有可截断的节"。
  //   ⭐ 换成新机制的真事实：这些节的**规范里有没有写归档规则**。
  const hasArchiving = secs.some(
    (s) => s !== null && typeof s === 'object' && /归档|history/i.test(String((s as { desc?: unknown }).desc ?? '')),
  )
  return (
    `⏸️ **待确认**：要新建/覆盖模板 \`${id}\`${title !== '' ? `（${title}）` : ''}，共 ${names.length} 节：\n` +
    (names.length > 0 ? `${names.map((n) => `  · ${n}`).join('\n')}\n` : '') +
    (hasArchiving
      ? ''
      : '⚠️ **这些节的规范里都没有写归档规则** ⇒ 用它的文档**超长时不会自动瘦身**。\n' +
        '⭐ 归档现在由模型按**各节规范里的自然语言**执行；若希望某一节瘦身，把规则写进那一节的 `desc`。\n') +
    '\n请把这个模板**逐节告诉用户并取得同意**；用户同意后，带 `confirm: true` 重调一次。\n' +
    '⚠️ 本次**什么都没做**（模板尚未写入）。'
  )
}
