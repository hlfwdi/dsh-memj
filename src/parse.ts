/**
 * 封面解析与硬校验（方案 §3.2 / §3.9）。
 *
 * 🔴 **这是全系统唯一的「确定性解析」处，也是写入校验与 rebuild 校验的共同底座。**
 * 决策 71：**可数的事实归程序，语义归模型**——本文件零 LLM、零网络、纯函数。
 *
 * ── 封面语法（§3.2）──────────────────────────────────────────────────────
 * ```
 * <!-- memj:entry
 * id: 3502af2f-797a-435b-933d-8ab873978ee1
 * project: dsh-memj
 * theme: [thm-a]
 * global: false
 * tags: 构建,陷阱
 * desc: <这是什么场景下的什么知识>；当<什么场景>时读它。
 * ref: entries/lib-is-real-source-3502af2f.md
 * -->
 * <!-- /memj:entry -->
 * ```
 * 围栏（`<!-- memj:entry` ↔ `-->`＋`<!-- /memj:entry -->`）是**唯一解析依据**。
 *
 * ── 两种校验的处置不同（§3.9.3，别混）─────────────────────────────────────
 * | | 写入校验（`memj_handoff`） | 重建校验（`memj_rebuild`） |
 * |---|---|---|
 * | 场景 | **你的输入**有问题 | **别人手改**坏了文档 |
 * | 处置 | 🔴 **报错并要求重写**（整份不写） | ⭐ **跳过非法封面 + 记入报告** |
 * 本文件**只负责发现并描述问题**，由调用方决定处置。
 *
 * @module dsh-memj/parse
 */

import { parse as parseYaml } from 'yaml'
import {
  isEntryKind,
  selectableKindList,
  type Cover,
  type CoverIssue,
  type EntryKind,
  type ParsedCover,
} from './schema.ts'
// ⭐ 节名走**唯一源头**（`sections.ts` 零依赖 ⇒ 不会形成 store ⇄ parse 循环引用）。
import { cutKnowledgeSection } from './sections.ts'

/** `desc` 的长度上限（字符数，§3.2）。 */
export const DESC_MAX_CHARS = 200

/** `slug` 的硬校验规则（§3.9.2 第 6 项）：全小写英文/数字/连字符，2–48 字符。 */
export const SLUG_RE = /^[a-z0-9-]{2,48}$/

/**
 * ⭐ `title` 的长度范围（字符数，决策 98 / §3.9.2 第 3b 项）。
 * 与 `slug` 同区间（2–48）——设计文档里两处都写"2–48 字符"。
 */
export const TITLE_MIN_CHARS = 2
/** `title` 的长度上限。 */
export const TITLE_MAX_CHARS = 48

/** UUID 形状（§3.4：`id` = UUID）。 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 封面围栏的起始标记。 */
const FENCE_OPEN = '<!-- memj:entry'

/** 封面围栏的结束标记（与 `-->` 配对出现，缺一不可）。 */
const FENCE_CLOSE = '<!-- /memj:entry -->'

/** 按**码点**计数，避免 emoji 被算成 2（`String.length` 数的是 UTF-16 码元）。 */
export function charCount(text: string): number {
  return [...text].length
}

/**
 * 判断一个标量能否**不加引号**安全地写进 YAML。
 *
 * ⚠️ 必要性：`desc` 里完全可能出现半角 `: `（如 `Why: …`）或行首 `-`，
 * 裸写会让 YAML 解析出错或截断。
 * @param value - 待写出的字符串。
 * @returns 可裸写返回 true。
 */
function isPlainSafe(value: string): boolean {
  if (value.length === 0) return false
  if (/[\n\r\t]/.test(value)) return false
  // 行首指示符（YAML 里这些开头有特殊含义）。
  if (/^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(value)) return false
  // 🔴 **逗号在任何位置都不能裸写**（2026-10-16 补）：
  //    本库的数组一律写成**流式**（`renderYamlArray` ⇒ `[a, b]`），
  //    而在流式序列里 `,` 就是**元素分隔符**。
  //    ⇒ 一个值里只要含 `,`，裸写会被解析成**两个元素**：
  //       写 `x,y` → 读回 `["x","y"]` ⇒ 标签被静默劈成两半。
  //    ⚠️ 旧判据只挡了"行首的逗号"（上一行那个字符类），漏了中间的。
  if (value.includes(',')) return false
  // `: ` 与 ` #` 会改变标量边界。
  if (/:\s/.test(value)) return false
  if (/\s#/.test(value)) return false
  // 结尾的冒号/井号同样有歧义。
  if (/[:#]$/.test(value)) return false
  // 结尾空格在 YAML 里会被吃掉。
  if (/\s$/.test(value)) return false
  return true
}

/**
 * 把一个字符串渲染成 YAML 标量：能裸写就裸写，否则用双引号形式。
 *
 * JSON 是 YAML 的子集，所以 `JSON.stringify` 的产物**一定是合法的 YAML 双引号标量**。
 * @param value - 待写出的字符串。
 * @returns YAML 标量文本。
 */
export function yamlScalar(value: string): string {
  return isPlainSafe(value) ? value : JSON.stringify(value)
}

/**
 * 把可能来自 YAML 的值规范成字符串数组。
 *
 * 同时接受：`[a, b]`（数组）、`a,b`（逗号分隔串）、`a，b`（中文逗号）。
 * @param value - 原始值。
 * @returns 去空、去重前的字符串数组。
 */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((s) => s !== '')
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter((s) => s !== '')
  }
  if (value === null || value === undefined) return []
  return [String(value).trim()].filter((s) => s !== '')
}

/** 取字符串字段（非字符串一律当空串，交由校验报错）。 */
function str(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** 取布尔字段（宽松：`true`/`"true"`/`1` 都算真）。 */
function bool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true'
  if (typeof value === 'number') return value !== 0
  return false
}

/**
 * 把一段 YAML 文本解析成 `Cover`（**不做校验**，缺失字段留空）。
 * @param yamlText - 围栏内的 YAML 原文。
 * @returns 封面对象。
 */
export function coverFromYaml(yamlText: string): Cover {
  const data = (parseYaml(yamlText) ?? {}) as Record<string, unknown>
  // ⭐ `kind` 是受控词表（决策 81）：**非法值落成空串**，
  //    由 `validateCoverShape` 拿原值报错——解析层不抛，保持两层职责分离。
  const rawKind = str(data['kind']).trim()
  const source = readSourceField(data['source'])
  return {
    id: str(data['id']),
    project: str(data['project']),
    theme: toStringArray(data['theme']),
    global: bool(data['global']),
    kind: isEntryKind(rawKind) ? rawKind : '',
    tags: toStringArray(data['tags']),
    // ⭐ `title` 是封面的字段（决策 98）——不再从正文现算。
    title: str(data['title']),
    desc: str(data['desc']),
    ref: str(data['ref']),
    ext: bool(data['ext']),
    // ⭐ 时间（决策 119）：老封面没这两行 ⇒ 空串（由迁移脚本回填）。
    createdAt: str(data['createdAt']),
    updatedAt: str(data['updatedAt']),
    // ⭐ 归档时间（决策 133）：**老封面没这行 ⇒ 空串 = 活跃**（有意选的失败方向，
    //    理由见 `Cover.archivedAt` 的注释）。
    archivedAt: str(data['archivedAt']),
    // ⭐⭐ 溯源（2026-10-14）：「文档内提问」的 chat 条目靠它跳回会话。
    //    ⚠️ **用条件展开而不是 `source`** —— 本项目开了
    //    `exactOptionalPropertyTypes`，给可选属性显式赋 `undefined` 会编译不过；
    //    而"键缺席"与"键在但值为 undefined"对下游是两件事
    //    （前端靠"键在不在"决定渲不渲染「去会话」按钮）。
    ...(source !== undefined ? { source } : {}),
  }
}

/**
 * ⭐ **读 `source` 字段**（封面 YAML 的嵌套块）。
 *
 * ⚠️ **宽容读**：块不存在 / 不是对象 / 两个子字段都空 ⇒ 返回 `undefined`
 *    （而不是空对象）—— 调用方与前端都靠"有没有这个字段"做判断。
 * @param raw - YAML 解析出来的原值。
 * @returns 规范化后的 source；没有 ⇒ `undefined`。
 */
function readSourceField(raw: unknown): Cover['source'] {
  if (typeof raw !== 'object' || raw === null) return undefined
  const s = raw as Record<string, unknown>
  const sessionId = str(s['sessionId'])
  const from = str(s['from'])
  if (sessionId === '' && from === '') return undefined
  return {
    ...(sessionId !== '' ? { sessionId } : {}),
    ...(from !== '' ? { from } : {}),
  }
}

/**
 * 从原始 YAML 里取 `kind` 的**原样字符串**（不做合法性过滤）。
 *
 * ⚠️ 必要性：`coverFromYaml` 会把非法 `kind` 落成空串，
 * 于是「填了 `bug`」与「根本没填」变得无法区分，校验就报不出错。
 * 校验前需要原值来判定。
 * @param yamlText - 围栏内的 YAML 原文。
 * @returns 原始 kind 字符串（无则空串）。
 */
export function rawKindFromYaml(yamlText: string): string {
  try {
    const data = (parseYaml(yamlText) ?? {}) as Record<string, unknown>
    return str(data['kind']).trim()
  } catch {
    return ''
  }
}

/**
 * 渲染一张封面为区块文本（含两侧围栏，**不含**尾随换行）。
 *
 * 字段顺序固定为 id / project / theme / global / kind / tags / **title** / desc / ref / ext——
 * 手改文档时肉眼好核对，也让 rebuild 的 diff 稳定。
 * @param cover - 封面。
 * @returns 可直接拼进 handoff 文档的文本块。
 */
export function renderCover(cover: Cover): string {
  const lines = [
    FENCE_OPEN,
    `id: ${yamlScalar(cover.id)}`,
    `project: ${yamlScalar(cover.project)}`,
    `theme: [${cover.theme.map((t) => yamlScalar(t)).join(', ')}]`,
    `global: ${cover.global ? 'true' : 'false'}`,
  ]
  // ⚠️ `kind` 留空时**整行不写**（不是写 `kind: ''`）——保持"未分类"就是字段缺席。
  //    🔴 判据必须是"**是不是合法 kind**"，不能写 `cover.kind !== ''`：
  //    调用方传进来的对象若**根本没有 kind 键**（`undefined`），
  //    `undefined !== ''` 为真，会把 `kind: undefined` 真的写进文档。
  if (isEntryKind(cover.kind)) lines.push(`kind: ${cover.kind}`)
  // 🔴🔴 **必须写成 YAML 数组 `[a, b]`，不能写成裸的逗号分隔串 `a,b`**（2026-10-16 修，
  //    事故：一份项目文档被撑到 **128 MB**、把 DSH 拖崩）。
  //
  // 为什么裸写会炸：`tags: a,b` 在 YAML 里是**一个普通标量字符串**，不是数组 ⇒
  //    读回时 `toStringArray` 走 `typeof value === 'string'` 分支，用 `split(/[,，]/)`
  //    切 ⇒ **切出来的片段不做转义还原**。于是：
  //      ① 某个标签需要加引号（以 `@ - : # [ ] { }` 等开头，或含 `: `），
  //         `yamlScalar` 会 `JSON.stringify` 它 ⇒ 写成 `"@通知"`；
  //      ② 读回时那对引号**留在标签内容里**（变成 `"@通知"` 这四个字面字符）；
  //      ③ 下一轮再写：它以 `"` 开头 ⇒ 又判定"不安全" ⇒ **再 stringify 一层**；
  //      ⇒ 反斜杠 1 → 3 → 7 → 15 …（2ⁿ−1），**每写一次文档就翻一倍**。
  //     ⚠️ 而 `mutateCover` 每次只改一条封面、却会**重写整份文档的全部封面**
  //        （`edit.ts` 的 `writeProjectDoc(owner, …, covers, …)`）⇒ 改任意一条都在加轮数。
  //     ⇒ 攒够约 27 轮（2²⁷ = 134217728，实测坏行 134217756 字符）就炸。
  //
  // 写成数组后：YAML 解析器**自己负责反转义**，`toStringArray` 走 `Array.isArray` 分支，
  //    引号/反斜杠全由解析器还原 ⇒ 往返**收敛**，不再有第 ③ 步。
  //
  // ⚠️ 与另两处保持一致：本文件 `theme:` 那行、以及 `store.ts` 的条目 frontmatter
  //    （那里用的是 `renderYamlArray`，本来就是数组 —— 所以只有封面这行是漏的）。
  if (cover.tags.length > 0) lines.push(`tags: ${renderYamlArray(cover.tags)}`)
  // ⭐ `title` 是必填字段（决策 98）——即便为空也写出来，
  //    好让"缺 title"在文档里**可见**（由校验报错），而不是静默少一行。
  lines.push(`title: ${yamlScalar(cover.title)}`)
  lines.push(`desc: ${yamlScalar(cover.desc)}`)
  lines.push(`ref: ${yamlScalar(cover.ref)}`)
  if (cover.ext) lines.push('ext: true')
  // ⭐ 时间（决策 119）：**空值不写行**（与 `kind` 同处理）。
  //    ⚠️ 判据用 `(x ?? '') !== ''`——调用方可能根本没给这两个键（旧夹具/旧路径），
  //    直接 `yamlScalar(undefined)` 会崩在 `value.length`（实测踩过一次）。
  if ((cover.createdAt ?? '') !== '') lines.push(`createdAt: ${yamlScalar(cover.createdAt)}`)
  if ((cover.updatedAt ?? '') !== '') lines.push(`updatedAt: ${yamlScalar(cover.updatedAt)}`)
  // ⭐ 归档时间（决策 133）：**空值不写行**（= 活跃；与 `kind`/时间同处理）。
  if ((cover.archivedAt ?? '') !== '') lines.push(`archivedAt: ${yamlScalar(cover.archivedAt)}`)
  // ⭐⭐ 溯源（2026-10-14）：**只在真有子字段时才写这个块**。
  //    ⚠️ 写空块（`source:` 下面什么都没有）会让 `coverFromYaml` 读出空对象，
  //       而前端靠"source 在不在"决定渲不渲染「去会话」按钮 ⇒ 会误判。
  //    ⚠️ 与 `store.writeEntryDoc` 的写法（`['source:', '']` 块头 + 缩进两空格）
  //       **必须一致** —— 两处渲染同一份 frontmatter，漂移就会让封面与正文不一致。
  if (cover.source !== undefined && (cover.source.sessionId !== undefined || cover.source.from !== undefined)) {
    lines.push('source:')
    if (cover.source.sessionId !== undefined) lines.push(`  sessionId: ${yamlScalar(cover.source.sessionId)}`)
    if (cover.source.from !== undefined) lines.push(`  from: ${yamlScalar(cover.source.from)}`)
  }
  lines.push('-->', FENCE_CLOSE)
  return lines.join('\n')
}

/**
 * 校验一张封面的**自包含**规则（§3.9.2 的第 1–5、7 项）。
 *
 * 「库内唯一」与「theme 必须已存在」需要库的全貌，由 `store` 侧另行校验。
 * @param cover - 封面。
 * @param rawKind - ⭐ 从 YAML 取的**原始** `kind` 字符串（未过滤）。
 *   ⚠️ 必须传它才能报出"填了非法值"——`cover.kind` 里非法值已被落成空串，
 *   与"没填"无法区分。不传则跳过这项校验。
 * @param pendingNomination - ⭐ **该封面是否在 global 提名表里**（方案 A）。
 *   传 `true` 表示"申请了全局、待批准"——三空校验把它**视为一种归属**
 *   （否则纯全局知识在批准前写不进去）。不传 ⇒ 不做这层豁免。
 * @returns 问题描述数组（空 = 通过）。
 */
export function validateCoverShape(
  cover: Cover,
  rawKind?: string,
  pendingNomination?: boolean,
): string[] {
  const issues: string[] = []

  // ① id 必填 + 形状（§3.9.2 第 2 项）。
  if (cover.id === '') issues.push('缺 id')
  else if (!UUID_RE.test(cover.id)) issues.push(`id 不是 UUID 形状：${cover.id}`)

  // ② desc 必填、非空、≤200 字符（§3.9.2 第 3 项）。
  if (cover.desc.trim() === '') issues.push('缺 desc')
  else {
    const n = charCount(cover.desc)
    if (n > DESC_MAX_CHARS) issues.push(`desc 超长：${n} 字符（上限 ${DESC_MAX_CHARS}）`)
  }

  // ②b ⭐ title 必填、2–48 字符（§3.9.2 第 3b 项 / 决策 98）。
  if (cover.title.trim() === '') issues.push('缺 title')
  else {
    const n = charCount(cover.title)
    if (n < TITLE_MIN_CHARS) issues.push(`title 过短：${n} 字符（下限 ${TITLE_MIN_CHARS}）`)
    if (n > TITLE_MAX_CHARS) issues.push(`title 超长：${n} 字符（上限 ${TITLE_MAX_CHARS}）`)
  }

  // ③ ref 必填（§3.9.2 第 4 项）。
  if (cover.ref.trim() === '') issues.push('缺 ref')
  else if (cover.ext && !isAbsolutePath(cover.ref)) {
    // 外部引用必须是绝对路径（§2.5）；相对路径会按进程 CWD 解析，必然错位。
    issues.push(`ext: true 但 ref 不是绝对路径：${cover.ref}`)
  }

  // ④ tags 至少 1 个（§3.9.2 第 5 项）。
  if (cover.tags.length === 0) issues.push('tags 为空（至少 1 个）')

  // ④b `kind` 若给了，必须是**当前词表**之一（§3.9.2 第 5b 项 / 决策 81 / 决策 217）。
  //     ⚠️ 留空**合法**（= 未分类），只有"填了非法值"才报错。
  if (rawKind !== undefined && rawKind !== '') {
    if (!isEntryKind(rawKind)) {
      issues.push(
        // 🔴 **决策 217 修**：旧写法是 `${ENTRY_KINDS.join(' / ')}`，有两个错 ——
        //    ① 读**编译期表** ⇒ **不含用户在【知识类型】页新加的类型**
        //      （而报错的用途恰恰是"告诉模型能填什么"）；
        //    ② `ENTRY_KINDS` **含保留项 `history`** ⇒ 把它也列给模型，
        //      等于诱导它手工造一条**检索不到的**条目。
        //    ✅ 改用 `selectableKindList()`：读**当前值**、且**排除保留项**。
        //    ⚠️ 同款错误在 `handoff.ts`（两处）也犯过，**那两处已于同批修掉** ——
        //      这里是**漏网的一处**（我当时只扫了 `handoff.ts` / `tools.ts`，没扫全）。
        //    ⭐ 判据：**改完一类文案要扫【全部】源码文件，不能只扫记得住的那几个。**
        `kind 的取值非法：「${rawKind}」——只能是 ${selectableKindList()} 之一，或留空`,
      )
    }
  }

  // ④c ⭐ `archivedAt` 若给了，必须是**可解析的时间**（决策 133）。
  //     🔴 为什么单独校验它（而 `createdAt`/`updatedAt` 没有同类校验）：
  //        该字段的**后果特别重**——值非空即"已归档"，而归档物会**从搜索、列表、
  //        工具里整体消失**。人手写错一个字（如 `archivedAt: true`）就会让一条知识
  //        **静默雪藏**；而时间字段写错只是显示不对，**不影响可见性**。
  if ((cover.archivedAt ?? '') !== '' && Number.isNaN(new Date(cover.archivedAt).getTime())) {
    issues.push(`archivedAt 不是可解析的时间：${cover.archivedAt}`)
  }

  // ⑤ 三空校验（§3.9.2 第 7 项 / 决策 34）。
  //
  // ⭐ **方案 A（2026-09-18）**：`global: true` 现在**只表示"已批准"**，
  //    提名时封面保持 `false`。⇒ 一条**纯全局知识在批准前**会是
  //    `project:'' + theme:[] + global:false` —— 若不把"**待批提名**"也算作归属，
  //    它会被判非法、**根本写不进去**（批准前就卡死）。
  //    ⚠️ 本函数是**纯函数**（不认识提名表）⇒ 由调用方把"该封面是否在提名表里"
  //    通过 `pendingNomination` 传进来；不传则退回旧判据（无提名上下文时）。
  if (cover.project === '' && cover.theme.length === 0 && !cover.global && pendingNomination !== true) {
    issues.push('三空：project 空 + theme 空 + 未申请/未批准全局 ⇒ 无任何归属层')
  }

  return issues
}

/**
 * 判断是否绝对路径（兼容 Windows 盘符、UNC 与 POSIX）。
 * @param path - 待判断路径。
 * @returns 是否绝对路径。
 */
export function isAbsolutePath(path: string): boolean {
  if (path.startsWith('/')) return true
  if (path.startsWith('\\\\')) return true
  return /^[a-zA-Z]:[\\/]/.test(path)
}

/**
 * 从一份 handoff 文档里**解析出全部封面**（§3.2）。
 *
 * 解析失败**不抛异常**——逐条记进 `issues`，由调用方决定处置
 * （写入时报错要求重写；rebuild 时跳过并报给人）。
 * @param text - 文档全文。
 * @param sourceFile - 来源文件名（用于报错定位）。
 * @returns 解析出的封面与问题清单。
 */
export function parseCovers(
  text: string,
  sourceFile: string,
): {
  covers: ParsedCover[]
  issues: CoverIssue[]
  orphans: string[]
  /**
   * ⭐ **每个围栏块的行区间**（1 起，闭区间），供"局部块替换"定位用（§8.6）。
   *
   * 🔴 **为什么需要它**：修复非法封面**必须做局部替换**，不能整篇重渲染——
   * 否则会碰掉同文档里的其它块。行区间是"只换这一块"的唯一可靠定位依据。
   *
   * ⚠️ 顺序与文档中的出现顺序一致；`issues` 里的 `line` 是**块首行**，可与之配对。
   */
  blocks: Array<{ startLine: number; endLine: number; text: string }>
} {
  const lines = text.split(/\r?\n/)
  const covers: ParsedCover[] = []
  const issues: CoverIssue[] = []
  /**
   * ⭐ **解析失败、但被原样保留的围栏块**（§8.7④ / §12-79）。
   *
   * 🔴 **为什么必须有它**：`writeProjectDoc` 只渲染 `covers`。若写回时不管这些块，
   * 它们就会**被静默删除**——表现为"人手改坏一个字符，下次 handoff 就把它弄丢了"。
   * 设计 §3.9.3 要求非法封面"**跳过并报给人**"，不是"丢掉"。
   *
   * 调用方（`loadProjectDoc`）把它们一并带出，写回时**原样附在封面区末尾**；
   * 修好后它们自然被解析、重复块消失。
   */
  const orphans: string[] = []
  /** ⭐ 全部围栏块的行区间（含合法与非法），供局部替换定位。 */
  const blocks: Array<{ startLine: number; endLine: number; text: string }> = []

  /** 记下一个块的区间（行号 1 起，闭区间）。 */
  const noteBlock = (from: number, to: number): void => {
    blocks.push({ startLine: from + 1, endLine: to + 1, text: lines.slice(from, to + 1).join('\n') })
  }

  /** 记一个问题。 */
  const fail = (line: number, reason: string): void => {
    issues.push({ file: sourceFile, line, reason })
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const openAt = line.indexOf(FENCE_OPEN)
    if (openAt === -1) {
      i += 1
      continue
    }

    // ⚠️ 必须在改动 `i` 之前记下块首行——后面每个失败分支都要靠它截取原文。
    const blockStart = i
    const startLine = i + 1
    const afterOpen = line.slice(openAt + FENCE_OPEN.length)

    let yamlText: string
    let endIndex: number

    // 单行形态：`<!-- memj:entry id: x ... -->`。
    const inlineEnd = afterOpen.indexOf('-->')
    if (inlineEnd !== -1) {
      yamlText = afterOpen.slice(0, inlineEnd)
      endIndex = i
    } else {
      // 多行形态：收集到独占一行的 `-->`。
      const collected: string[] = []
      if (afterOpen.trim() !== '') collected.push(afterOpen)
      let j = i + 1
      let closed = false
      while (j < lines.length) {
        if ((lines[j] ?? '').trim() === '-->') {
          closed = true
          break
        }
        collected.push(lines[j] ?? '')
        j += 1
      }
      if (!closed) {
        fail(startLine, '封面围栏未闭合：找了 `-->` 但没找到')
        // 未闭合 ⇒ 从开栏到文末整段都无法解析，原样保留。
        orphans.push(lines.slice(blockStart).join('\n').trimEnd())
        noteBlock(blockStart, lines.length - 1)
        break
      }
      yamlText = collected.join('\n')
      endIndex = j
    }

    // 结束标记 `<!-- /memj:entry -->` 必须紧跟其后（只允许空行）。
    let k = endIndex + 1
    while (k < lines.length && (lines[k] ?? '').trim() === '') k += 1
    if (k >= lines.length || (lines[k] ?? '').trim() !== FENCE_CLOSE) {
      fail(startLine, `缺少配对的 ${FENCE_CLOSE}`)
      orphans.push(lines.slice(blockStart, endIndex + 1).join('\n').trimEnd())
      noteBlock(blockStart, endIndex)
      i = endIndex + 1
      continue
    }

    // ── 解析 YAML 块 ──
    let cover: Cover
    try {
      cover = coverFromYaml(yamlText)
    } catch (err) {
      fail(startLine, `封面的 YAML 解析失败：${err instanceof Error ? err.message : String(err)}`)
      orphans.push(lines.slice(blockStart, k + 1).join('\n').trimEnd())
      noteBlock(blockStart, k)
      i = k + 1
      continue
    }

    const shapeIssues = validateCoverShape(cover, rawKindFromYaml(yamlText))
    if (shapeIssues.length > 0) {
      for (const reason of shapeIssues) {
        fail(startLine, `封面 ${cover.id === '' ? '(无 id)' : cover.id} 的 ${reason}`)
      }
      orphans.push(lines.slice(blockStart, k + 1).join('\n').trimEnd())
      noteBlock(blockStart, k)
      i = k + 1
      continue
    }

    covers.push({ cover, sourceFile, line: startLine })
    noteBlock(blockStart, k)
    i = k + 1
  }

  return { covers, issues, orphans, blocks }
}

/**
 * 从文档里移除全部封面围栏，只留下叙事部分。
 *
 * `memj_handoff` 写「沉淀知识」节时要先清掉旧封面再写新的，
 * 否则会把上一次的封面留在文档里造成重复。
 * @param text - 文档全文。
 * @returns 去掉封面块后的文本。
 */
export function stripCovers(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.includes(FENCE_OPEN)) {
      // 跳到结束标记之后。
      if (line.includes('-->')) {
        // 单行形态：继续看后面是否有 /memj:entry 行。
        let k = i + 1
        while (k < lines.length && (lines[k] ?? '').trim() === '') k += 1
        i = k < lines.length && (lines[k] ?? '').trim() === FENCE_CLOSE ? k + 1 : i + 1
        continue
      }
      let j = i + 1
      while (j < lines.length && (lines[j] ?? '').trim() !== '-->') j += 1
      let k = j + 1
      while (k < lines.length && (lines[k] ?? '').trim() === '') k += 1
      i = k < lines.length && (lines[k] ?? '').trim() === FENCE_CLOSE ? k + 1 : j + 1
      continue
    }
    out.push(line)
    i += 1
  }
  return out.join('\n')
}

/**
 * 从**整份项目文档**里取出「纯叙事」——即 `writeProjectDoc` 期望的那种输入。
 *
 * 🔴 **为什么必须收成一处**（§8.7② / §12-74）：`writeProjectDoc` 会**自己生成**
 * frontmatter、一级标题与「沉淀知识」节。若调用方把"整份文档"当叙事塞进去，
 * 这三样就会被写**两遍**（实测：frontmatter 分隔线 4 条、`# HANDOFF` 标题 2 个）。
 *
 * 三条写回路径里，`memj_handoff` 主路径走的是 `narrativeFromDoc()`（从 LLM 输入剥离，干净）；
 * 而 `memj_promote` 与 `linkCoverToTheme` 这两条**事后路径**曾直接拿
 * `loadProjectDoc().narrative`（那是"整份文档仅剪掉封面块"）塞回去 ⇒ 重复写。
 *
 * ⇒ 本函数即"从已有文档取叙事"的**唯一实现**，剥四样：
 * ① frontmatter（由程序按库状态重新生成，不让旧值盖新值）；
 * ② 封面围栏块（由调用方按 `covers` 重新渲染）；
 * ③ 「沉淀知识」节及其后内容（同上）；
 * ④ 一级标题（按项目 id 重新拼）。
 *
 * ⚠️ **不做规范化**（不补空节、不重排）——调用方是程序自己写的文档，结构本就规范；
 * 规范化是给"LLM 输入不可信"的主路径用的，见 `handoff.ts` 的 `narrativeFromDoc`。
 * @param text - 项目文档全文（可含 frontmatter 与封面）。
 * @returns 纯叙事 markdown（不含 frontmatter / 标题 / 封面 / 沉淀知识节）。
 */
export function narrativeFromProjectText(text: string): string {
  // ① 去 frontmatter。
  const { body } = splitFrontmatter(text)
  // ② 去封面围栏块。
  const withoutCovers = stripCovers(body)
  // ③ 砍掉「沉淀知识」节及其后内容（**行首精确匹配**，避免命中正文里的引用）。
  //    ⭐ 判定走 `sections.ts` 的唯一实现（历史上这里与 `handoff.ts` 各写了一遍）。
  const narrative = cutKnowledgeSection(withoutCovers)
  // ④ 去一级标题。
  const noTitle = narrative.replace(/^\s*#\s+HANDOFF[^\n]*\n+/i, '')
  // ⑤ 🔴 **去掉「文件位置」行内注释**（2026-09-19 真实实例验收抓到的累积 bug）。
  //    `writeProjectDoc` 每次都会**自己生成**一条这样的注释；
  //    若从已有文档取叙事时不剥掉旧的，它就会**每轮 +1**（实测累积到 4 条）。
  //    ⚠️ 只删这一种固定形态的注释，不碰用户的其它 HTML 注释。
  const noLocComment = noTitle.replace(/^\s*<!--\s*文件位置：[^>]*-->\s*$/gm, '')
  // 折叠因删除而产生的多余空行（最多保留一个空行）。
  return noLocComment.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * ⭐ **按行区间局部替换一个封面块**（§8.6「修复」的核心操作）。
 *
 * 🔴 **为什么必须局部替换**（实测）：`writeProjectDoc` 只渲染能解析成功的 `covers`，
 * 而非法封面**进不了 `covers`**。若修复时图省事"整篇重渲染"，
 * **同文档里其它非法封面块会被静默删掉**（`verify/probe-memj-invalid-cover-loss.mjs` 实测确认）。
 * ⇒ 只换目标块，其余字节原样不动。
 *
 * @param text - 原文档全文。
 * @param startLine - 目标块起始行（**1 起**，闭区间）。
 * @param endLine - 目标块结束行（**1 起**，闭区间）。
 * @param replacement - 新块文本（一般由 `renderCover` 生成）。
 * @returns 替换后的全文。
 * @throws 区间越界或非法时抛错（调用方应视为"定位失败，拒绝写入"）。
 */
export function replaceBlockAtLines(
  text: string,
  startLine: number,
  endLine: number,
  replacement: string,
): string {
  const lines = text.split(/\r?\n/)
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine ||
    endLine > lines.length
  ) {
    throw new Error(`行区间非法：${startLine}-${endLine}（文档共 ${lines.length} 行）`)
  }
  const before = lines.slice(0, startLine - 1)
  const after = lines.slice(endLine)
  return [...before, ...replacement.split('\n'), ...after].join('\n')
}

/**
 * 拆出文档头部的 YAML frontmatter 与正文。
 *
 * 没有 frontmatter 时 `data` 为 `null`、`body` 为全文——**不报错**，
 * 因为「没有 frontmatter」是合法状态（项目文档尚未建时）。
 * @param text - 文档全文。
 * @returns frontmatter 数据、正文、以及 frontmatter 的结束行号。
 */
export function splitFrontmatter(text: string): {
  data: Record<string, unknown> | null
  body: string
  endLine: number
  error?: string
} {
  const lines = text.split(/\r?\n/)
  if ((lines[0] ?? '').trim() !== '---') {
    return { data: null, body: text, endLine: 0 }
  }
  let j = 1
  while (j < lines.length && (lines[j] ?? '').trim() !== '---') j += 1
  if (j >= lines.length) {
    return { data: null, body: text, endLine: 0, error: 'frontmatter 未闭合（缺第二个 `---`）' }
  }
  const yamlText = lines.slice(1, j).join('\n')
  try {
    const data = (parseYaml(yamlText) ?? {}) as Record<string, unknown>
    return { data, body: lines.slice(j + 1).join('\n'), endLine: j + 1 }
  } catch (err) {
    return {
      data: null,
      body: lines.slice(j + 1).join('\n'),
      endLine: j + 1,
      error: `frontmatter 的 YAML 解析失败：${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * 渲染 YAML frontmatter（含两侧 `---`，末尾带换行）。
 * @param entries - 有序的键值对（顺序即输出顺序）。
 * @returns frontmatter 文本块。
 */
/**
 * 渲染 YAML frontmatter（含两侧 `---`，末尾带换行）。
 *
 * ⚠️ **块头要写成 `source:`（带冒号）**，不能是 `source`，也不能是 `source:: `。
 * 调用方约定：**块头传 `['source:', '']`**（key 自带冒号、值为空串）。
 *  - 若一律拼 `${key}: ${value}` ⇒ 渲染成 `source:: ` ——
 *    YAML 会把它解析成**字符串** `":"`，整棵子树（`sessionId`/`from`）**丢了**；
 *  - 若把冒号剥掉 ⇒ 渲染成 `source` —— YAML 直接**解析失败**
 *    （`Implicit keys need to be on a single line`）。
 * ⇒ 空值时**原样输出 key**（它已含所需的冒号）。
 * @param entries - 有序的键值对（顺序即输出顺序）。
 * @returns frontmatter 文本块。
 */
export function renderFrontmatter(entries: ReadonlyArray<readonly [string, string]>): string {
  const lines = ['---']
  for (const [key, value] of entries) {
    // 空值 ⇒ 原样写 key（块头，形如 `source:`）；非空 ⇒ 写 `key: value`。
    lines.push(value === '' ? key : `${key}: ${value}`)
  }
  lines.push('---', '')
  return lines.join('\n')
}

/** 渲染字符串数组为 YAML 流式序列（`[a, b]`）。 */
export function renderYamlArray(values: readonly string[]): string {
  return `[${values.map((v) => yamlScalar(v)).join(', ')}]`
}

/**
 * 从正文里提取标题（§3.2「标题」行）。
 *
 * - **内部条目**取首个 `###`；**外部引用**取首个 `#`。
 * - 都取不到时返回空串（调用方用 slug 或 id 兜底显示）。
 * @param body - 正文（不含 frontmatter）。
 * @param level - 要找的标题级别。
 * @returns 标题文本。
 */
export function extractTitle(body: string, level: '###' | '#' = '###'): string {
  const re = level === '###' ? /^###\s+(.+)$/m : /^#\s+(.+)$/m
  const m = re.exec(body)
  return m?.[1]?.trim() ?? ''
}

/**
 * 计算两串的 Levenshtein 编辑距离（用于 §3.9.2 第 10 项的近义判定）。
 *
 * 采用滚动数组，空间 O(min(n,m))；id 很短（几十字符），无需更快的算法。
 * @param a - 串 A。
 * @param b - 串 B。
 * @returns 编辑距离。
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
    }
    prev = cur
  }
  return prev[b.length] ?? 0
}

/**
 * 判断两个 id 是否**近义**（§3.9.2 第 10 项）。
 *
 * 判据：**互为子串** 或 **编辑距离 ≤ maxDistance**。
 * 命中时工具**不直接建**，而是回相似项让 LLM/人确认。
 * @param a - 已有 id。
 * @param b - 新 id。
 * @param maxDistance - 编辑距离上限。
 * @returns 是否近义。
 */
export function isSimilarId(a: string, b: string, maxDistance: number): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (x === '' || y === '') return false
  if (x === y) return true
  if (x.includes(y) || y.includes(x)) return true
  return editDistance(x, y) <= maxDistance
}

/**
 * 在已有 id 清单里找出与新 id 近义的那些（§3.9.2 第 10 项）。
 * @param candidate - 想新建的 id。
 * @param existing - 已有 id 清单。
 * @param maxDistance - 编辑距离上限。
 * @returns 近义的已有 id（保持原清单顺序）。
 */
export function findSimilarIds(
  candidate: string,
  existing: readonly string[],
  maxDistance: number,
): string[] {
  return existing.filter((id) => id !== candidate && isSimilarId(id, candidate, maxDistance))
}
