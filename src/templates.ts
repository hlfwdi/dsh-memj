/**
 * dsh-memj —— **交接文档模板**（决策 204）
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * 交接文档原先**硬编码六节**（`sections.ts` 的 `NARRATIVE_TITLES`）。
 * 用户要求：能**完全自定义**——自己定节名、节数、**每一节要干嘛**。
 *
 * ── 🔴 两条硬边界（用户 2026-09-30 裁定）──────────────────────────────────
 * 1. **只作用于「新建项目」那一刻** ⇒ 模板**绝不回溯**已有文档。
 *    落地方式：模板的节名在**建文档时写进 `ProjectFrontmatter.sections`**，
 *    此后那份文档**按自己记着的节名**工作（与"当前模板是什么"**解耦**）。
 *    ⇒ ⭐ 这也意味着**改模板不影响任何已有文档**，删除模板同理。
 * 2. **「沉淀知识」节钉死**（`KNOWLEDGE_TITLE`）——封面物理存在那一节里，
 *    改名或删掉会让封面丢失或累积。⇒ 模板里**不许出现**这个节名。
 *
 * ── 数据形状（`<库根>/templates/<id>.json`）──────────────────────────────
 * | 字段 | 说明 |
 * |---|---|
 * | `id` | 模板 id（= 文件名，全小写英文/数字/连字符） |
 * | `title` | 给人看的名字 |
 * | `sections[]` | ⭐ **顺序即文档节顺序**；每条 `{ name, desc, truncate? }` |
 * | `sections[].desc` | ⭐ **这一节要干嘛**（必填，会拼进按需注入的写作指导） |
 * | `sections[].truncate` | 该节是否参与**自动截断**（至多一节为 `true`；全 false = 不自动截断） |
 *
 * @module dsh-memj/templates
 */
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { templatesDir, templatePath } from './paths.ts'
import { writeTextAtomic } from './files.ts'
import { fillSlots, promptText, registerPromptDefault } from './prompts.ts'
import {
  KNOWLEDGE_TITLE,
  NARRATIVE_TITLES,
  SPEC_SECTION,
  SPEC_TITLE,
} from './sections.ts'

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐⭐ **「本文档的写作指导」的骨架**（2026-10-12 开放编辑；`{{…}}` 是插槽）
//
// 🔴 **它是什么**：读一个**用了自定义模板**的项目文档时，`memj_read` 会附上这份指导
//    —— 告诉模型"这份文档有几节、每节要干嘛、哪节会被自动截断"。
//    ⚠️ 默认六节的项目**一字不加**（既有行为零变化）。
//
// 🔴 **为什么它以前不可编辑**：正文里嵌着**运行时才知道的值**（节数、节名、每节用途、
//    可截断标记）⇒ 是模板不是常量。
// ⭐ **现在**：骨架走覆盖层、值由 `fillSlots` 填，`slots` 校验保证插槽不被删/写错。
//
// ⚠️ **`{{desc}}` 是用户自己在模板页写的"这一节要干嘛"**，不是本文件的内容 ——
//    改行模板时别把 `{{desc}}` 当成示例文字删掉。
// ══════════════════════════════════════════════════════════════════════════

export const TPL_GUIDANCE_HEAD: string =
  '本文档共 **{{count}} 节**（顺序固定，工具按此输出；缺的节补空标题）：'
export const TPL_GUIDANCE_ROW: string = '- `## {{name}}` —— {{desc}}{{trunc}}'
export const TPL_GUIDANCE_TRUNC_MARK: string = '　⭐ **本节的较早内容会被自动截断归档**'
export const TPL_GUIDANCE_NO_TRUNC: string =
  `⚠️ **本模板没有声明可截断的节** ⇒ 文档**不会自动瘦身**（超过阈值也不会截）。
压缩需要你按上面的规范手动归并。`
export const TPL_GUIDANCE_FOOT: string =
  '🔴 **`## {{knowledgeTitle}}` 由工具生成**（放封面，不是你写的），**不在上面这几节里**。'

registerPromptDefault('tpl:guidance-head', TPL_GUIDANCE_HEAD)
registerPromptDefault('tpl:guidance-row', TPL_GUIDANCE_ROW)
registerPromptDefault('tpl:guidance-trunc-mark', TPL_GUIDANCE_TRUNC_MARK)
registerPromptDefault('tpl:guidance-no-trunc', TPL_GUIDANCE_NO_TRUNC)
registerPromptDefault('tpl:guidance-foot', TPL_GUIDANCE_FOOT)

/** 模板结构版本（变了就升 ⇒ 旧模板当不兼容，不猜）。 */
export const TEMPLATE_VERSION = 1

/** 模板 id 的允许形态（与 slug 同规，因为它同时是文件名）。 */
export const TEMPLATE_ID_RE = /^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/

/** 一节的定义。 */
export interface TemplateSection {
  /** 节名（`## ` 后面那个词）。 */
  name: string
  /** ⭐ **这一节要干嘛**（必填；会拼进写作指导）。 */
  desc: string
  /** 是否参与自动截断（至多一节为 true）。 */
  truncate?: boolean
}

/** 一份模板。 */
export interface Template {
  version: number
  id: string
  title: string
  sections: TemplateSection[]
}

/**
 * ⭐ 内置默认模板（= 改造前的硬编码六节，**行为一字不变**）。
 *
 * 🔴 `truncate` 落在「当前进度」——与既有实现一致（`PROGRESS_TITLE`）。
 */
export function defaultTemplate(): Template {
  return {
    version: TEMPLATE_VERSION,
    id: 'default',
    title: '默认（六节）',
    sections: [
      { name: '目标', desc: '这个项目要做什么' },
      { name: '当前进度', desc: '做到哪了（新进展必须写进这一节）', truncate: true },
      { name: '有效做法', desc: '被验证过的工作方法' },
      { name: '失败/踩坑', desc: '出过的错与根因' },
      { name: '关键上下文', desc: '接手人必须知道的事实（路径、id、机制）' },
      { name: '下一步', desc: '待办' },
    ],
  }
}

/**
 * ⭐⭐ **校验一份模板**（纯函数，不读盘）。
 *
 * 🔴🔴 **为什么"节名不得互为子串"是硬校验**（本次核实发现）：
 *    `read.ts` 的按节匹配是**子串匹配**（`title.toLowerCase().includes(key)`），
 *    而 `tools.ts` 累积"读到过哪些节"时**用同一条规则再筛一遍**
 *    ⇒ 若两节互为子串（如「进度」与「进度详述」），**一次读取会同时记下两节**
 *    ⇒ 「写前先读」闸门判"读全了"时**假绿**（它以为读过了，其实没有）。
 *
 * 🔴 **为什么必须挡「沉淀知识」**：封面物理存在那一节里（见 `sections.ts`）。
 * @param t - 待校验的模板。
 * @returns 问题清单（空 = 合法）。
 */
export function validateTemplate(t: Template): string[] {
  const errs: string[] = []
  if (!TEMPLATE_ID_RE.test(t.id)) {
    errs.push(`\`id\` 必须是全小写英文/数字/连字符（2–48 字符），当前是 \`${t.id}\`。`)
  }
  if (t.title.trim() === '') errs.push('`title` 不能为空。')
  if (t.sections.length === 0) errs.push('`sections` 至少要有 1 节。')

  const names: string[] = []
  for (const [i, s] of t.sections.entries()) {
    const at = `第 ${i + 1} 节`
    const name = s.name.trim()
    if (name === '') errs.push(`${at}：节名不能为空。`)
    if (/[\r\n]/.test(s.name)) errs.push(`${at}：节名不能含换行。`)
    if (name.startsWith('#')) errs.push(`${at}：节名不要带 \`#\`（工具会自己加 \`## \`）。`)
    // ⭐ desc 必填（用户 2026-09-30 裁定："必须写"）——它要进写作指导。
    if (s.desc.trim() === '') errs.push(`${at}（${name || '未命名'}）：\`desc\` 必填——它是"这一节要干嘛"。`)
    if ([...s.desc].length > 200) errs.push(`${at}（${name}）：\`desc\` 超长（${[...s.desc].length} > 200 字符）。`)
    if (name === KNOWLEDGE_TITLE) {
      errs.push(`${at}：节名不能是「${KNOWLEDGE_TITLE}」——**那一节由工具维护**（封面存在那里），不开放给模板。`)
    }
    if (names.includes(name)) errs.push(`${at}：节名 \`${name}\` 重复。`)
    names.push(name)
  }

  // ⭐ 互为子串 ⇒ 读取时一次命中两节（见上方注释）。
  for (const a of names) {
    for (const b of names) {
      if (a === b || a === '' || b === '') continue
      if (a.includes(b)) {
        errs.push(`节名 \`${a}\` 含 \`${b}\` ⇒ 按节读取时会**一次命中两节**（读记录会误判"读全了"）。请改成互不包含的名字。`)
      }
    }
  }

  // ⭐⭐ 决策 206（用户 2026-10-02）：**允许多节声明可截断**。
  //    🔴 原先限制"至多 1 节"是**错的**（用户指出）——
  //       交接文档里可能有好几节都会无限膨胀（比如「当前进度」+「失败/踩坑」）。
  //    ⭐ 语义（用户拍板）：**各自独立** —— 每节各自与阈值比、各自截、
  //       各自产出自己的历史归档块（`history.ts` 的 `truncateProgress` 已支持）。
  //    （因此这里**不再有任何数量校验**。）
  return errs
}

/**
 * ⭐ 把模板拼成**该项目的节名清单**（顺序即文档顺序）。
 * @param t - 模板。
 * @returns 节名数组。
 */
export function templateSectionNames(t: Template): string[] {
  return t.sections.map((s) => s.name)
}

/** 读一份模板；文件不存在或结构不合法 ⇒ `undefined`（**不猜**）。 */
export async function loadTemplate(id: string): Promise<Template | undefined> {
  let text: string
  try {
    text = await readFile(templatePath(id), 'utf8')
  } catch {
    return undefined
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  return normalizeTemplate(raw)
}

/**
 * 宽松地把任意 JSON 规整成 `Template`（字段缺失用默认值兜）。
 * ⚠️ **不在这里做语义校验**（那是 `validateTemplate` 的事）——本函数只保证"形状可用"。
 */
export function normalizeTemplate(raw: unknown): Template | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const id = typeof o['id'] === 'string' ? o['id'] : ''
  if (id === '') return undefined
  const title = typeof o['title'] === 'string' ? o['title'] : id
  const secsRaw = Array.isArray(o['sections']) ? (o['sections'] as unknown[]) : []
  const sections: TemplateSection[] = []
  for (const s of secsRaw) {
    if (s === null || typeof s !== 'object') continue
    const so = s as Record<string, unknown>
    const name = typeof so['name'] === 'string' ? so['name'] : ''
    if (name === '') continue
    const sec: TemplateSection = {
      name,
      desc: typeof so['desc'] === 'string' ? so['desc'] : '',
    }
    if (so['truncate'] === true) sec.truncate = true
    sections.push(sec)
  }
  return { version: TEMPLATE_VERSION, id, title, sections }
}

/** 列出库里全部模板（含内置 default，它**总是可用**且不可删）。 */
export async function listTemplates(): Promise<Template[]> {
  const out: Template[] = [defaultTemplate()]
  let files: string[] = []
  try {
    files = await readdir(templatesDir())
  } catch {
    return out
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const t = await loadTemplate(f.slice(0, -'.json'.length))
    if (t === undefined) continue
    if (t.id === 'default') continue // 内置的优先，磁盘上的同名忽略
    out.push(t)
  }
  return out
}

/**
 * 保存一份模板（**先校验、不合法不写盘**）。
 * @param t - 模板。
 * @returns 问题清单（空 = 已写入）。
 */
export async function saveTemplate(t: Template): Promise<string[]> {
  const errs = validateTemplate(t)
  if (errs.length > 0) return errs
  await mkdir(templatesDir(), { recursive: true })
  await writeTextAtomic(
    templatePath(t.id),
    `${JSON.stringify({ version: TEMPLATE_VERSION, id: t.id, title: t.title, sections: t.sections }, null, 2)}\n`,
  )
  return []
}

/**
 * 删除一份模板。
 * 🔴 **`default` 不可删**（它是回落目标）；⚠️ **不影响任何已有文档**
 *    （文档记着自己的节名，与模板解耦）。
 * @param id - 模板 id。
 * @returns 是否真的删了。
 */
export async function deleteTemplate(id: string): Promise<boolean> {
  if (id === 'default') return false
  try {
    await rm(templatePath(id), { force: true })
    return true
  } catch {
    return false
  }
}

/**
 * ⭐⭐ **按模板拼"每一节要干嘛"的写作指导片段**（按需注入用，决策 204 / 问题 C①）。
 *
 * 🔴 **为什么不放常驻 `context()`**：`context()` 是**单条快照、按整条文本比较**
 *    （库内知识 `74a18e19`）⇒ 按项目动态改它会**每轮 append 一条新消息**
 *    （旧的不删、直到 compaction）。而模板说明**只在交接那一刻有用**
 *    ⇒ 放在**交接时按需注入**，不占常驻预算、也不破缓存。
 * @param t - 模板。
 * @returns markdown 片段（含节顺序、每节用途、截断提示）。
 */
export function renderTemplateGuidance(t: Template): string {
  const lines: string[] = [
    fillSlots(promptText('tpl:guidance-head', TPL_GUIDANCE_HEAD), { count: String(t.sections.length) }),
    '',
  ]
  for (const s of t.sections) {
    const trunc = s.truncate === true ? promptText('tpl:guidance-trunc-mark', TPL_GUIDANCE_TRUNC_MARK) : ''
    lines.push(
      fillSlots(promptText('tpl:guidance-row', TPL_GUIDANCE_ROW), { name: s.name, desc: s.desc, trunc }),
    )
  }
  const truncs = t.sections.filter((s) => s.truncate === true)
  if (truncs.length === 0) {
    lines.push('', promptText('tpl:guidance-no-trunc', TPL_GUIDANCE_NO_TRUNC))
  }
  lines.push(
    '',
    fillSlots(promptText('tpl:guidance-foot', TPL_GUIDANCE_FOOT), { knowledgeTitle: KNOWLEDGE_TITLE }),
  )
  return lines.join('\n')
}

/** 供内部使用：默认六节的节名（= 无模板时的回落）。 */
export const DEFAULT_SECTION_NAMES: readonly string[] = NARRATIVE_TITLES

/**
 * ⭐⭐⭐ **渲染「本档写作规范」整节**（2026-10-12，模板与提示词解耦）。
 *
 * ── 它是什么 ──────────────────────────────────────────────────────────────
 * 把"这份文档有几节、每节要干嘛、哪节会被自动截断"写成**文档正文里的一节**，
 * 排在叙事末尾、`## 沉淀知识` 之前。**建项目时从模板复制进来，之后归文档自己所有。**
 *
 * 🔴 **为什么放正文、不放 `memj_read` 的按需注入**（这是本次解耦的核心）：
 *   ① **常驻不了**：`context()` 是单条快照、按整条文本比较 ⇒ 按项目动态改它会
 *      **每轮 append 一条新消息**（库内知识 `74a18e19`）；
 *   ② **按需注入也有代价**：那要求"读文档时现去查模板" ⇒ 模板被删就得走 fallback、
 *      且**模型不读那份文档就永远看不到规范**（而它正是"该怎么写这份文档"）；
 *   ③ ⭐ **落进正文之后它天然免疫一类 bug**：`rebuildDerivedLayers()` 会重写
 *      frontmatter 且**只带它自己那张字段表** ⇒ `sections` / `truncateSections` /
 *      `template` 全被抹掉（已实测复现）；而**正文是 rebuild 唯一不碰的东西**
 *      （实测 sha256 逐字相同）。
 *
 * 🔴 **必须是纯函数 + 幂等**：落盘路径上每次都会调它，而它旁边那份旧规范会被
 *   `cutSpecSection()` 砍掉 ⇒ 同一个输入永远得到同一个输出。
 * @param t - 模板。
 * @returns 完整的该节文本（含 `## ` 标题行、末尾无多余空行）。
 */
export function renderSpecSection(t: Template): string {
  const lines: string[] = [
    SPEC_SECTION,
    '',
    fillSlots(promptText('tpl:guidance-head', TPL_GUIDANCE_HEAD), { count: String(t.sections.length) }),
    '',
  ]
  for (const s of t.sections) {
    const trunc = s.truncate === true ? promptText('tpl:guidance-trunc-mark', TPL_GUIDANCE_TRUNC_MARK) : ''
    lines.push(
      fillSlots(promptText('tpl:guidance-row', TPL_GUIDANCE_ROW), { name: s.name, desc: s.desc, trunc }),
    )
  }
  const truncs = t.sections.filter((s) => s.truncate === true)
  if (truncs.length === 0) {
    lines.push('', promptText('tpl:guidance-no-trunc', TPL_GUIDANCE_NO_TRUNC))
  }
  lines.push(
    '',
    fillSlots(promptText('tpl:guidance-foot', TPL_GUIDANCE_FOOT), { knowledgeTitle: KNOWLEDGE_TITLE }),
    '',
    // ⭐⭐ **必须显式写清"这一节由工具维护"** —— 否则模型会顺手去改它，
    //    而它的每一次改动都会被下次落盘**静默覆盖**（同「沉淀知识」的纪律）。
    `🔴 **本节由工具维护**（从模板 \`${t.id}\` 复制而来），**不要手工改**——`,
    '改模板不会影响已有文档（它们是解耦的）；要改**这一份文档**的规范，直接改本节即可。',
  )
  return lines.join('\n').trimEnd()
}

/**
 * ⭐⭐ **从「本档写作规范」节里解析出"哪些节可自动截断"**（2026-10-12）。
 *
 * 🔴 **为什么需要它**：截断目标原先只记在 `frontmatter.truncateSections`，
 *   而那个字段**会被 `rebuildDerivedLayers()` 的旁路重写抹掉**（实测复现）。
 *   ⇒ 与节名同样，把**权威放回正文**：规范节里已经写着"哪节会被自动截断"，
 *   那是**给人/模型看的同一份事实**，顺手就能读出来。
 *
 * ⚠️ **判据是"这一行带不带截断标记"**，因此要与 `renderSpecSection()` **同源**：
 *   两边都用 `promptText('tpl:guidance-trunc-mark')` ⇒ 用户改了那句文案时
 *   **写与读会一起变**（这正是"配对"的意义）。
 *   为防"文档渲染于旧文案、后来文案被改"的错配，本函数**同时认内置默认文案**。
 * @param specSection - 规范节原文（`extractSpecSection()` 的产物）。
 * @returns 可截断的节名数组（顺序即文档顺序）；解析不出 ⇒ 空数组。
 */
export function truncateTitlesFromSpec(specSection: string): string[] {
  if (specSection.trim() === '') return []
  const marks = [
    promptText('tpl:guidance-trunc-mark', TPL_GUIDANCE_TRUNC_MARK),
    TPL_GUIDANCE_TRUNC_MARK,
  ].filter((m) => m.trim() !== '')
  const out: string[] = []
  for (const line of specSection.split(/\r?\n/)) {
    // 规范节里每个叙事节一行：`- \`## <节名>\` —— <用途><截断标记>`
    const m = /^\s*-\s+`##\s+(.+?)`/.exec(line)
    if (m === null) continue
    const name = (m[1] ?? '').trim()
    if (name === '' || name === KNOWLEDGE_TITLE || name === SPEC_TITLE) continue
    if (marks.some((mk) => mk !== '' && line.includes(mk)) && !out.includes(name)) out.push(name)
  }
  return out
}

/**
 * ⭐ 取「本档写作规范」的**节名**（供回执/前端显示，避免各处硬编码）。
 * @returns 节名（无 `## ` 前缀）。
 */
export function specTitle(): string {
  return SPEC_TITLE
}
