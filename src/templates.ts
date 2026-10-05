/**
 * dsh-memj —— **交接文档模板**（决策 204）
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * 交接文档原先**硬编码六节**（`sections.ts` 的 `NARRATIVE_TITLES`）。
 * 用户要求：能**完全自定义**——自己定节名、节数、**每一节要干嘛**。
 *
 * ── 🔴 两条硬边界（用户 2026-09-30 裁定）──────────────────────────────────
 * 1. **只作用于「新建项目」那一刻** ⇒ 模板**绝不回溯**已有文档。
 *    落地方式：建文档时把模板的节骨架与**「本档写作规范」一节**一起写进正文，
 *    此后那份文档**按自己正文里的 `##` 标题**工作（决策 207：**正文是节名的唯一权威**；
 *    `ProjectFrontmatter.sections` 只是工具维护的**镜像**，供快速读取，不作判据）。
 *    ⇒ ⭐ 这也意味着**改模板不影响任何已有文档**，删除模板同理。
 * 2. **「沉淀知识」节钉死**（`KNOWLEDGE_TITLE`）——封面物理存在那一节里，
 *    改名或删掉会让封面丢失或累积。⇒ 模板里**不许出现**这个节名。
 *
 * ── 数据形状（`<库根>/templates/<id>.md`，决策 208）───────────────────────
 * ⭐ 人可读的 markdown：frontmatter 放 `id` / `title`，**每个 `## ` 标题 = 节名，
 *    标题下的正文 = "这一节要干嘛"**（行末 `<!-- truncate -->` 标记参与截断）。
 *    ⇒ 用户在设置页改模板 ≈ 直接改这份文档（见 `renderTemplateDoc` / `parseTemplateDoc`）。
 * ⚠️ 旧的 `<id>.json` 仍**兼容读**（`legacyTemplatePath()`），但**不再写入**；
 *    想清掉旧格式用 `scripts/migrate-templates-to-md.mjs`。
 * | 字段 | 说明 |
 * |---|---|
 * | `id` | 模板 id（= 文件名，全小写英文/数字/连字符） |
 * | `title` | 给人看的名字 |
 * | `sections[]` | ⭐ **顺序即文档节顺序**；每条 `{ name, desc, truncate? }` |
 * | `sections[].name` | `## ` 标题本身 |
 * | `sections[].desc` | ⭐ **这一节要干嘛**（必填，渲染进该文档自己的「本档写作规范」一节） |
 * | `sections[].truncate` | 该节是否参与**自动截断**（**可多节**；全 false = 不自动截断） |
 *
 * @module dsh-memj/templates
 */
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { defaultTemplatePath, legacyTemplatePath, templatePath, templatesDir } from './paths.ts'
import { writeTextAtomic } from './files.ts'
import { fillSlots, promptText, registerPromptDefault } from './prompts.ts'
import { renderFrontmatter, splitFrontmatter, yamlScalar } from './parse.ts'
import {
  KNOWLEDGE_TITLE,
  NARRATIVE_TITLES,
  SPEC_SECTION,
  SPEC_TITLE,
} from './sections.ts'

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐⭐ **「本档写作规范」那一节的骨架**（2026-10-12 开放编辑；`{{…}}` 是插槽）
//
// 🔴 **它是什么**：`handoff` 落盘时把它渲染成**该文档正文里的一节**
//    （`## 本档写作规范`，排在叙事节之后、`## 沉淀知识` 之前）
//    —— 告诉模型"这份文档有几节、每节要干嘛、哪节会被自动截断"。
//    ⭐ **建项目时从模板复制进来，之后归文档自己所有**（改模板不影响已有文档）。
//
// ⚠️ **它【不再】是"`memj_read` 额外附一份"的投递通道** —— 那条通路已于 2026-10-12 退役
//    （规范就在正文里，`memj_read` 返回的 `content` 本来就带着它；再附一份就是第二份副本）。
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
 * ⭐ **内置默认模板**（= 改造前的硬编码六节）。
 *
 * 🔴 `truncate` 落在「当前进度」——与既有实现一致（`PROGRESS_TITLE`）。
 *
 * ⭐⭐ **2026-10-12（决策 208）：`default` 也落盘，用户可直接编辑它。**
 *   ⇒ 本函数是**纯函数回落值**（磁盘上没有那份文件时用它）；
 *     真正"当前生效的默认模板"请用 **`loadDefaultTemplate()`**（它读盘优先）。
 *   ⚠️ **为什么必须留一个纯函数的版本**：很多地方（校验、测试、UI 初值）要一个
 *     不依赖磁盘的确定值；而"用户改过默认模板"这件事只影响**新建项目**。
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
 * ⭐⭐ **取"当前生效的默认模板"**（决策 208）——**磁盘优先，回落内置**。
 *
 * 🔴 **为什么要它**：`default` 落盘之后，用户可能**改过它**
 *   （这正是"default 也落盘"的目的）⇒ 凡"要用默认模板去建项目 / 渲染规范"的地方，
 *   都该用本函数而不是 `defaultTemplate()`，否则**用户的修改会被内置值悄悄盖掉**。
 *
 * ⚠️ 与 `loadTemplate('default')` 的关系：那个也能读盘，但它**没有内置回落**
 *   （文件不在就 `undefined`）⇒ 默认模板**必须永远可用**（它是 `delete` 的拒绝理由、
 *   也是 `template` 参数的默认档），所以这里补上回落。
 * @returns 模板（**永不 `undefined`**）。
 */
export async function loadDefaultTemplate(): Promise<Template> {
  const t = await loadTemplate('default')
  return t ?? defaultTemplate()
}

/**
 * ⭐⭐ **确保 `default` 模板已落盘**（决策 208）——首次使用时写一份出来。
 *
 * 🔴 **为什么需要"确保"而不是"启动时无条件写"**：
 *   ① 它必须可被用户编辑 ⇒ 不能每次启动都把用户的改动**覆盖回内置值**；
 *   ⇒ 判据 = **文件不存在才写**（幂等，不碰已有内容）。
 * @returns 是否本次新建了该文件。
 */
export async function ensureDefaultTemplateFile(): Promise<boolean> {
  const p = defaultTemplatePath()
  let exists = false
  try {
    await readFile(p, 'utf8')
    exists = true
  } catch {
    exists = false
  }
  if (exists) return false
  await mkdir(templatesDir(), { recursive: true })
  await writeTextAtomic(p, renderTemplateDoc(defaultTemplate()))
  return true
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

/**
 * ⭐⭐⭐ **把一份模板渲染成 markdown 文档**（决策 208，2026-10-12）。
 *
 * ── 形态（人可读写，机器也能解析）────────────────────────────────────────
 * ```
 * ---
 * version: 1
 * id: company-deep-research
 * title: 公司深度研究交接文档
 * ---
 *
 * # <文件位置说明>
 *
 * ## 研究目标
 *
 * 本次要研究这家公司是为了回答哪些问题……（= 这一节要干嘛）
 *
 * ## 公司画像
 *
 * ……
 * ```
 *
 * 🔴 **每节 = 一个 `## ` 标题 + 一段"这一节要干嘛"**：
 *   · `## ` 标题就是**节名** → 它同时是 `renderSpecSection()` 里那条 `- \`## X\` —— desc`；
 *   · 标题下的正文就是 **`desc`**（决策 204 的"这一节要干嘛"）。
 *   ⭐ 于是**同一份文件**既是"模板"、又是人能直接读懂的结构说明 ——
 *     这正是用户要的"把初始模板作为一个文档模板存 md"。
 *
 * 🔴 **"可截断"怎么表达**：写成标题行末的 ` <!-- truncate -->`（HTML 注释，
 *   在渲染出的页面里**不显示**、不干扰人阅读）⇒ 与 `truncateTitlesFromSpec()` 的取向一致：
 *   **机器标记要能被人忽略**。
 * @param t - 模板。
 * @returns markdown 全文（末尾带换行）。
 */
export function renderTemplateDoc(t: Template): string {
  const fm = renderFrontmatter([
    ['version', String(TEMPLATE_VERSION)],
    ['id', yamlScalar(t.id)],
    ['title', yamlScalar(t.title)],
  ])
  const parts: string[] = [
    fm,
    `# 交接文档模板 — ${t.title || t.id}`,
    '',
    `<!-- 这是模板 \`${t.id}\`：\`## \` 标题 = 节名；标题下的正文 = "这一节要干嘛"（会进写作规范）。`,
    '     ⭐ 建项目时工具会把它复制成那份项目文档的结构，此后两者解耦（改这里不影响已有文档）。',
    '     ⚠️ 行末 `<!-- truncate -->` 表示该节参与自动截断归档。 -->',
    '',
  ]
  for (const s of t.sections) {
    parts.push(`## ${s.name}${s.truncate === true ? ' <!-- truncate -->' : ''}`, '')
    if (s.desc.trim() !== '') parts.push(s.desc.trim(), '')
  }
  return `${parts.join('\n').trimEnd()}\n`
}

/**
 * ⭐⭐ **解析 markdown 模板**（`renderTemplateDoc()` 的逆；决策 208）。
 *
 * 🔴 **必须能容忍人手改**（这是选 md 的理由之一）：
 *   · 标题级别只用 `## `；`# ` 那行是文件标题、**不是节**；
 *   · 行末的 `<!-- truncate -->` 决定该节是否可截断（⚠️ 用 `includes` 而非严格相等：
 *     人手改时很容易多打个空格）；
 *   · `id`/`title` 优先取 frontmatter；**缺 frontmatter 时从文件名兜底**
 *     （`fallbackId`）⇒ 用户新建一个裸 md 也能用。
 * @param text - markdown 全文。
 * @param fallbackId - 文件名推出的 id（frontmatter 没有时用）。
 * @returns 模板；**一个 `## ` 节都没有 ⇒ `undefined`**（不猜）。
 */
export function parseTemplateDoc(text: string, fallbackId: string): Template | undefined {
  const { data, body } = splitFrontmatter(text)
  const id = typeof data?.['id'] === 'string' && (data['id'] as string).trim() !== ''
    ? (data['id'] as string).trim()
    : fallbackId.trim()
  if (id === '') return undefined
  const fmTitle = typeof data?.['title'] === 'string' ? (data['title'] as string) : ''

  const sections: TemplateSection[] = []
  let cur: TemplateSection | undefined
  let inFence = false
  for (const line of body.split(/\r?\n/)) {
    // ⚠️ 跳过代码围栏内的伪标题（与人侧文档解析同规）。
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m !== null) {
      let name = (m[1] ?? '').trim()
      // ⚠️ **必须宽容**（这是"选 md 让人手改"的直接后果）：人手写时很容易
      //    写成 `<!--truncate-->`（没空格）或留多余空格 ⇒ 用正则而不是精确串匹配，
      //    否则用户"明明标了却没生效"，**而且不报错**。
      const trunc = /<!--\s*truncate\s*-->/i.test(name)
      name = name.replace(/<!--\s*truncate\s*-->/i, '').trim()
      if (name === '') continue
      cur = { name, desc: '' }
      if (trunc) cur.truncate = true
      sections.push(cur)
      continue
    }
    // ⚠️ 顶层 `# ` 是文件标题 ⇒ 结束当前节（"这一节要干嘛"不会跨过它）。
    if (/^#\s+/.test(line)) {
      cur = undefined
      continue
    }
    if (cur !== undefined) cur.desc = cur.desc === '' ? line.trim() : `${cur.desc}\n${line.trim()}`
  }
  if (sections.length === 0) return undefined
  for (const s of sections) s.desc = s.desc.trim()
  return { version: TEMPLATE_VERSION, id, title: fmTitle.trim() !== '' ? fmTitle.trim() : id, sections }
}

/**
 * ⭐ 读一份模板 —— **`.md` 优先，回落旧的 `.json`**（决策 208 + 兼容读）。
 *
 * 🔴 **两种格式都必须接住**：决策 204 的存量是 `.json`（生产库当时有一份
 *   `company-deep-research.json`）⇒ 只顾新格式会让它**静默消失**。
 * @param id - 模板 id。
 * @returns 模板；两种都不存在或都不可解析 ⇒ `undefined`（**不猜**）。
 */
export async function loadTemplate(id: string): Promise<Template | undefined> {
  // ① 新格式（.md）。
  let text: string | undefined
  try {
    text = await readFile(templatePath(id), 'utf8')
  } catch {
    text = undefined
  }
  if (text !== undefined) {
    const t = parseTemplateDoc(text, id)
    if (t !== undefined) return t
  }
  // ② 旧格式（.json）——兼容读。
  try {
    const json = await readFile(legacyTemplatePath(id), 'utf8')
    return normalizeTemplate(JSON.parse(json))
  } catch {
    return undefined
  }
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

/**
 * 列出库里全部模板（含默认，它**总是可用**且不可删）。
 *
 * ⭐⭐ **2026-10-12（决策 208）**：`default` 现在**也在磁盘上**
 *   （`ensureDefaultTemplateFile()` 首次落盘）⇒ 列表里那份**以磁盘为准**
 *   （用户可能改过它）；磁盘上没有才回落内置值。
 * ⚠️ 兼容读旧的 `.json`（存量模板不会因为改格式而消失）。
 */
export async function listTemplates(): Promise<Template[]> {
  // ⭐ 默认模板：磁盘优先（用户可编辑），否则内置。
  const def = await loadDefaultTemplate()
  const out: Template[] = [def]
  let files: string[] = []
  try {
    files = await readdir(templatesDir())
  } catch {
    return out
  }
  const seen = new Set<string>(['default'])
  // ① 新格式（.md）优先；② 再收旧的 .json 里"还没有 .md 版本"的（兼容读）。
  for (const ext of ['.md', '.json'] as const) {
    for (const f of files) {
      if (!f.endsWith(ext)) continue
      const id = f.slice(0, -ext.length)
      if (seen.has(id)) continue
      const t = await loadTemplate(id)
      if (t === undefined) continue
      seen.add(id)
      out.push(t)
    }
  }
  return out
}

/**
 * 保存一份模板（**先校验、不合法不写盘**）。
 *
 * ⭐ **决策 208**：写 `.md`（`renderTemplateDoc`）。
 * ⭐ **`default` 现在可以保存**（用户可编辑它）—— 落盘后 `loadDefaultTemplate()` 会读到它。
 * @param t - 模板。
 * @returns 问题清单（空 = 已写入）。
 */
export async function saveTemplate(t: Template): Promise<string[]> {
  const errs = validateTemplate(t)
  if (errs.length > 0) return errs
  await mkdir(templatesDir(), { recursive: true })
  await writeTextAtomic(templatePath(t.id), renderTemplateDoc(t))
  return []
}

/**
 * 删除一份模板。
 * 🔴 **`default` 不可删**（它是回落目标）。
 * @param id - 模板 id。
 * @returns 是否真的删了。
 */
export async function deleteTemplate(id: string): Promise<boolean> {
  if (id === 'default') return false
  let deleted = false
  // ⚠️ 两种格式都要删（否则旧的 .json 会让它"删了又回来"——`loadTemplate` 会回落读它）。
  for (const p of [templatePath(id), legacyTemplatePath(id)]) {
    try {
      await rm(p, { force: true })
      deleted = true
    } catch {
      /* 不存在就算了 */
    }
  }
  return deleted
}

/**
 * 🔴🔴 **`renderTemplateGuidance()` 已删除**（2026-10-12，决策 207）。
 *
 * 它的职责是"按模板拼一段写作指导、由 `memj_read` **按需附在返回值末尾**"。
 * 那条通路**已退役**：规范现在**就写在文档正文里**（`## 本档写作规范` 一节，
 * 由 `renderSpecSection()` 渲染、建项目时从模板复制）
 * ⇒ `memj_read` 返回的 `content` **本来就带着它**。
 *
 * ⚠️ 留着它等于**同一事实两份实现**：本项目的判据是
 *   "一段代码里已经有了一种实现，就问其他几条路径为什么还需要"，
 *   而两条路都会输出去给模型看 ⇒ **迟早漂开、且两个副本会同时出现**。
 * @see renderSpecSection 它的替代者（落点是**文档正文**，不是工具返回值）。
 */

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
