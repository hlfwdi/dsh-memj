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
import { KNOWLEDGE_TITLE, NARRATIVE_TITLES } from './sections.ts'

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
  const lines: string[] = [`本文档共 **${t.sections.length} 节**（顺序固定，工具按此输出；缺的节补空标题）：`, '']
  for (const s of t.sections) {
    const trunc = s.truncate === true ? '　⭐ **本节的较早内容会被自动截断归档**' : ''
    lines.push(`- \`## ${s.name}\` —— ${s.desc}${trunc}`)
  }
  const truncs = t.sections.filter((s) => s.truncate === true)
  if (truncs.length === 0) {
    lines.push(
      '',
      '⚠️ **本模板没有声明可截断的节** ⇒ 文档**不会自动瘦身**（超过阈值也不会截）。',
      '压缩需要你按上面的规范手动归并。',
    )
  }
  lines.push(
    '',
    `🔴 **\`## ${KNOWLEDGE_TITLE}\` 由工具生成**（放封面，不是你写的），**不在上面这几节里**。`,
  )
  return lines.join('\n')
}

/** 供内部使用：默认六节的节名（= 无模板时的回落）。 */
export const DEFAULT_SECTION_NAMES: readonly string[] = NARRATIVE_TITLES
