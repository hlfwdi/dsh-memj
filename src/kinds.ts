/**
 * dsh-memj —— **知识类型（`kind`）的可配置词表**（决策 215，2026-10-05）
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * 用户要求：*"用户可以在 memj 的设置页去配置知识类型，**已有的知识类型不可删除**。
 * 但用户可以自己**增删改**新的类型，并且配置**什么时候用**和**书写规范**。"*
 *
 * 决策 214 已经把词表**收敛到唯一来源**（`schema.ts` 的 `ENTRY_KIND_DEFS`）；
 * 本模块把那个来源从**编译期常量**升级成**运行期可读的文件**，
 * 而 `ENTRY_KIND_DEFS` **降级为"内置默认值"**（仍不可删改）。
 *
 * ── 🔴🔴 三条硬边界（用户裁定 + 安全性论证）────────────────────────────────
 * 1. **内置的不可删、不可改名** —— 存量 569 条全在用它们（实测分布：
 *    `trap` 319 / `howto` 96 / `fact` 65 / `decision` 53 / `history` 36）。
 *    改掉一个内置 id ⇒ 那几百条封面**当场变成非法值**。
 * 2. **保留项（`history`）连"改"都不行，且不进模型可选项** ——
 *    它是**工具生成**的（截断归档的原文），让人手工把一条知识改成它 ⇒
 *    **那条会从检索里消失**（`scanLibrary` 默认排除）。
 * 3. **有引用的类型不许删**（拒绝删，不级联清空）——
 *    与 `memj_promote` 的「只允许删空容器」同一纪律。
 *    ⚠️ 另一条路是"删并把引用清成未分类"，但那要**扫全库改 569 个文件**且**不可逆**。
 *
 * ── ⭐ 安全论证：为什么"用户定义词表"不违反"必须是受控词表"（决策 81）──────
 * 决策 81 的原话是：*"若允许自由取值，LLM 会自行发明命名，分类就失去聚合能力"*
 * （ETH Zurich 实测的失效模式）。⭐ 而本设计**仍然是受控的**，只是**词表由用户维护**：
 * 模型**不能自由填**，只能从这份表里选（工具 schema 的 `enum` 由它生成）。
 * ⇒ ⭐ 判据：**"受控"的敌人是"自由填"，不是"用户可维护"。**
 *
 * ── 数据形状（`<库根>/kinds.md`）───────────────────────────────────────────
 * ```
 * ---
 * version: 1
 * ---
 *
 * # 知识类型
 *
 * ## fact
 * 显示名：fact（事实 / 接口）
 * 什么时候用：是什么 + 出处/依据
 * 书写规范：
 * （多行，缩进或直奔到下一个 ## 之前）
 * ```
 * ⚠️ **内置项也写进文件**（而不是"只存自定义的增量"）——
 *    否则"文件里没有"就有两种含义（内置 / 被删），而**人读这份文件时看不全**。
 *    内置项靠行末 `<!-- 内置 -->` 标记，**读回来时据此判不可删**。
 *
 * @module dsh-memj/kinds
 */
import { ENTRY_KIND_DEFS, type EntryKindDef } from './schema.ts'
import { kindsFilePath } from './paths.ts'
import { renderFrontmatter, splitFrontmatter } from './parse.ts'
import { readTextIfExists, writeTextAtomic } from './files.ts'

// ══════════════════════════════════════════════════════════════════════════
// 形状
// ══════════════════════════════════════════════════════════════════════════

/** ⭐ 一条知识类型的**完整定义**（= 表里的一行）。 */
export interface KindDef {
  /** 机器用的 id；**它就是写进封面 `kind:` 的那个值**。 */
  id: string
  /** 给人看的短名（UI 下拉 / 报错文案）。 */
  label: string
  /** ⭐ "**什么时候用这一种**" —— 一句话，会进提示词。 */
  when: string
  /** ⭐⭐ "**书写规范**" —— 可多行，会进提示词（告诉模型这条知识该怎么写）。 */
  guide: string
  /**
   * 🔴 **内置项**：不可删、不可改名（id 与 label 都锁）。
   * ⚠️ 与 `reserved` 是**两个不同的锁**，别混：
   *   · `builtin` 锁的是"**这条是我预置的**"；
   *   · `reserved` 锁的是"**它不该给模型选**"。
   */
  builtin: boolean
  /**
   * 🔴 **保留项**：不作为**模型的可选项**（目前只有 `history`）。
   * 理由见模块头第 2 条。⚠️ 内置项**不一定**是保留项（4 个普通内置都可选）。
   */
  reserved: boolean
}

// ══════════════════════════════════════════════════════════════════════════
// id 规则（与 template id 同一套：小写英文/数字/连字符）
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ **kind id 的语法**：小写英文开头，2–32 位，只允许小写字母/数字/连字符。
 *
 * 🔴 **为什么必须校验**：`kind` 是**要写进封面 YAML 的值**，
 *   还会被拼进工具 schema 的 `enum` 与提示词 ⇒ 放行任意串会让"词表里有个怪东西"
 *   扩散到所有下游，而**那时已经很难回溯是谁写进去的**。
 * ⚠️ 刻意**比模板 id 更严**（模板允许 2–48 位）：kind 要**频繁出现在文档里**，
 *   短一点、纯小写更好认。
 */
export const KIND_ID_RE = /^[a-z][a-z0-9-]{1,31}$/

/** ⭐ 内置项的 id 集合（从唯一词表派生 —— 不另抄一份）。 */
const BUILTIN_IDS: readonly string[] = ENTRY_KIND_DEFS.map((d) => d.id)

// ══════════════════════════════════════════════════════════════════════════
// 默认表 = 内置（与决策 214 的 `ENTRY_KIND_DEFS` 同源）
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ **内置默认表**（文件不存在 / 读不出来时用它）。
 *
 * ⚠️ 它与 `schema.ts` 的 `ENTRY_KIND_DEFS` **是同一份数据**，但**用途不同**：
 *   · `ENTRY_KIND_DEFS` = **编译期内置值**（决策 214 的唯一来源，现在降级为默认值）；
 *   · 本函数 = **把它补全成 `KindDef`**（加上 `builtin` / `reserved` / `guide` 三个字段）。
 * 🔴 **不在这里抄第二份 id 列表** —— 一律从 `ENTRY_KIND_DEFS` 派生。
 * @returns 内置表的完整定义。
 */
export function builtinKindDefs(): KindDef[] {
  return ENTRY_KIND_DEFS.map((d: EntryKindDef) => ({
    id: d.id,
    label: d.label,
    when: d.when,
    /**
     * ⭐⭐ **内置项现在自带书写规范**（决策 217）。
     * 🔴 以前这里写死 `''`，而"骨架"其实装在 `when` 里（**字段名在撒谎**）——
     *    ✅ 本次把骨架搬进 `guide`、`when` 换成真判据。
     * ⚠️ 所以这两处**必须一起改**：只改 `when` 而这里仍给 `''`
     *    ⇒ 骨架会**凭空消失**（模型再也看不到"怎么写"）。
     */
    guide: d.guide,
    builtin: true,
    reserved: d.reserved === true,
  }))
}

// ══════════════════════════════════════════════════════════════════════════
// 渲染 / 解析（md 往返必须**幂等**）
// ══════════════════════════════════════════════════════════════════════════

/** 内置标记（行尾 HTML 注释，渲染页里不显示）。 */
const BUILTIN_MARK = '<!-- 内置 -->'
/** 保留标记。 */
const RESERVED_MARK = '<!-- 保留 -->'

/**
 * ⭐ **把一张类型表渲染成 markdown**（`<库根>/kinds.md`）。
 *
 * ⚠️ **必须与 `parseKindsDoc()` 往返幂等** —— 手工改过也要能读回来
 *   （与模板 md 同一套纪律，本项目为此踩过"改完读不回"的账）。
 * @param defs - 类型表（顺序即渲染顺序，也即 UI 下拉顺序）。
 * @returns 文件全文。
 */
export function renderKindsDoc(defs: readonly KindDef[]): string {
  /**
   * 🔴 **`renderFrontmatter()` 自己就以 `\n` 结尾**（它的最后一行是 `'---', ''`）
   *    ⇒ 这里**不能再补一个空元素**，否则 frontmatter 与标题之间会多出一个空行，
   *      而**解析不回去**（`splitFrontmatter` 只吃一份）⇒ **往返不幂等**（实测抓到）。
   *    ⭐ 判据：**拼接自带换行的片段时，先看清它到底带没带** —— 多补一个就多一行。
   */
  const parts: string[] = [
    renderFrontmatter([['version', '1']]),
    '# 知识类型',
    '',
    '<!-- ⭐ 这张表就是"知识有哪几类"。',
    '     · 每条一个 `## <id>` 节；id 必须是小写英文/数字/连字符（2–32 位）。',
    '     · `什么时候用` 会进提示词，告诉模型**该选哪一种**。',
    '     · `书写规范` 可多行，也会进提示词，告诉它**这种知识该怎么写**。',
    '     · 带 `<!-- 内置 -->` 的**不可删、不可改名**（存量知识都在用它们）。',
    '     · 带 `<!-- 保留 -->` 的**不给模型选**（工具生成的，手工填会让那条搜不到）。',
    '     ⚠️ 改这份文件后，重启实例或等热重载即生效。 -->',
    '',
  ]
  for (const d of defs) {
    parts.push(`## ${d.id}`)
    parts.push('')
    parts.push(`显示名：${d.label}${d.builtin ? ` ${BUILTIN_MARK}` : ''}${d.reserved ? ` ${RESERVED_MARK}` : ''}`)
    parts.push(`什么时候用：${d.when}`)
    // ⚠️ 规范的**第一行直接跟在冒号后面**（同一行），其余行另起 ——
    //    这样 `书写规范：` 后面**不会先空一行**，文件读起来更紧凑，
    //    也避免"空行被解析成规范的第一个字符"（那正是先前幂等失败的根因）。
    const guideLines = d.guide.trim() === '' ? [] : d.guide.trimEnd().split('\n')
    parts.push(guideLines.length > 0 ? `书写规范：${guideLines[0]}` : '书写规范：')
    for (const g of guideLines.slice(1)) parts.push(g)
    parts.push('')
  }
  return parts.join('\n').replace(/\n{2,}/g, '\n\n').replace(/\n+$/, '\n')
}

/**
 * ⭐ **从 markdown 解析出类型表**。
 *
 * 🔴 **宽容读**（与模板同一纪律）：只认 `## <id>` 的标题行 + 紧跟着的
 *   `显示名：` / `什么时候用：` / `书写规范：` 三行；其余内容**当作书写规范的续行**。
 *   ⇒ 用户手写歪一点（多空行、少一个键）也能读出来。
 * @param text - 文件全文。
 * @returns 类型表；**一条都解析不出来**时返回 `undefined`（调用方回落内置）。
 */
export function parseKindsDoc(text: string): KindDef[] | undefined {
  const { body } = splitFrontmatter(text)
  const lines = (body ?? '').split(/\r?\n/)
  const out: KindDef[] = []
  let cur: { id: string; label: string; when: string; guide: string[]; builtin: boolean; reserved: boolean } | undefined
  const flush = () => {
    if (cur === undefined) return
    out.push({
      id: cur.id,
      label: cur.label.trim() === '' ? cur.id : cur.label.trim(),
      when: cur.when.trim(),
      /**
       * ⚠️⚠️ **两端都要削**（实测踩到，往返不幂等）：
       *    渲染时 `书写规范：` 后面跟一个**空行**再是内容，而解析会把那个空行收进 `guide`
       *    ⇒ **开头多一个 `\n`**。只削末尾 ⇒ 第二次渲染又多一行 ⇒ **越读越长**。
       *    ⭐ 判据：**往返幂等要靠"两端都规整"，只削一边等于没削。**
       */
      guide: cur.guide.join('\n').replace(/^\s+|\s+$/g, ''),
      builtin: cur.builtin,
      reserved: cur.reserved,
    })
    cur = undefined
  }
  for (const line of lines) {
    const h = /^##\s+(\S+)\s*$/.exec(line)
    if (h !== null) {
      flush()
      cur = {
        id: (h[1] ?? '').trim(),
        label: '',
        when: '',
        guide: [],
        builtin: line.includes(BUILTIN_MARK),
        reserved: line.includes(RESERVED_MARK),
      }
      continue
    }
    if (cur === undefined) continue
    const mLabel = /^显示名：(.*)$/.exec(line)
    if (mLabel !== null) {
      // ⚠️ 标记可能写在**值**里（渲染时就是写在那一行的）⇒ 从值里剥掉再存。
      const v = (mLabel[1] ?? '')
      cur.builtin = cur.builtin || v.includes(BUILTIN_MARK)
      cur.reserved = cur.reserved || v.includes(RESERVED_MARK)
      cur.label = v.replace(BUILTIN_MARK, '').replace(RESERVED_MARK, '').trim()
      continue
    }
    const mWhen = /^什么时候用：(.*)$/.exec(line)
    if (mWhen !== null) { cur.when = mWhen[1] ?? ''; continue }
    const mGuide = /^书写规范：(.*)$/.exec(line)
    if (mGuide !== null) {
      const inline = (mGuide[1] ?? '').trim()
      if (inline !== '') cur.guide.push(inline)
      continue
    }
    // 其余行 ⇒ **书写规范的续行**（但要跳过 `## ` 前的空行噪声由上面的 flush 处理）。
    cur.guide.push(line)
  }
  flush()
  return out.length > 0 ? out : undefined
}

// ══════════════════════════════════════════════════════════════════════════
// 读 / 写
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐⭐⭐ **读取当前生效的类型表** —— 这是**唯一入口**，所有消费方都走它。
 *
 * 优先级（与 `loadDefaultTemplate()` 同一套纪律）：
 *   ① `<库根>/kinds.md` 存在且能解析 ⇒ 用它；
 *   ② 否则 ⇒ **内置默认表**。
 *
 * 🔴 **内置项即使文件里没写也要补回来**（"merge 而不是 replace"）——
 *   否则用户手删掉文件里某一行内置项 ⇒ 存量那些知识**当场变非法值**。
 *   ⭐ 判据：**文件是"用户可编辑的一份"，不是"唯一真相"** ——
 *     内置项的存在性由代码保证，不由文件保证。
 * @returns 生效的类型表（**保证含全部内置项**，且至少 1 条）。
 */
export async function loadKinds(): Promise<KindDef[]> {
  let fromFile: KindDef[] | undefined
  try {
    const text = await readTextIfExists(kindsFilePath())
    if (text !== undefined) fromFile = parseKindsDoc(text)
  } catch {
    fromFile = undefined
  }
  const base = fromFile ?? builtinKindDefs()
  // ⭐ 补回缺失的内置项（放在**原位**：按内置顺序插到前面，保持稳定）。
  const have = new Set(base.map((d) => d.id))
  const missing = builtinKindDefs().filter((d) => !have.has(d.id))
  return missing.length === 0 ? base : [...missing, ...base]
}

/**
 * ⭐ **写入类型表**（校验在前，不过不写盘）。
 *
 * @param defs - 要写入的完整表。
 * @returns 错误清单（空 = 写成功）。
 */
export async function saveKinds(defs: readonly KindDef[]): Promise<string[]> {
  const errs = validateKinds(defs)
  if (errs.length > 0) return errs
  await writeTextAtomic(kindsFilePath(), renderKindsDoc(defs))
  return []
}

/**
 * ⭐⭐ **校验一张类型表**（保存前的**硬闸门**）。
 *
 * 除了形状，还管三条**业务规则**（用户裁定的那些）：
 *   · 内置项的 **id 与 label 都不能改**（改 id ⇒ 存量知识当场非法）；
 *   · 内置项**不能少**（少一条 ⇒ 原来用它那些知识变非法值）；
 *   · 保留项的 `reserved` **不能被摘掉**（摘了模型就能手工造 `history`）。
 *
 * ⭐⭐ **2026-10-05 用户裁定（决策 217）：内置项的 `when` / `guide` 【可以编辑】**
 *   —— *"可编辑但不可删除"*。
 *   ⇒ 本函数**刻意不校验这两项**：它们是**内容**（描述性文字），
 *     而"内置"锁的是**身份**（`id` / `label` / 存在性）。
 *   ⭐ 判据：**"这是身份还是内容"决定它锁不锁** ——
 *     改身份会让存量数据非法（不可逆），改内容只影响措辞（随时可改回）。
 * @param defs - 待校验的表。
 * @returns 问题清单（空 = 合法）。
 */
export function validateKinds(defs: readonly KindDef[]): string[] {
  const errs: string[] = []
  if (defs.length === 0) errs.push('至少要有 1 个知识类型。')

  const seen = new Set<string>()
  for (const [i, d] of defs.entries()) {
    const at = `第 ${i + 1} 项`
    if (!KIND_ID_RE.test(d.id)) {
      errs.push(`${at}：id \`${d.id}\` 不合法 —— 必须是**小写英文开头**、2–32 位、只含小写字母/数字/连字符。`)
    }
    if (d.label.trim() === '') errs.push(`${at}（${d.id}）：显示名不能为空。`)
    if (d.when.trim() === '') errs.push(`${at}（${d.id}）：\`什么时候用\` 不能为空 —— 它是告诉模型"该选哪一种"的唯一依据。`)
    if (seen.has(d.id)) errs.push(`${at}：id \`${d.id}\` 重复。`)
    seen.add(d.id)
  }

  // ── 三个内置项的保护（逐条对照内置默认表）──
  const builtinDefaults = builtinKindDefs()
  for (const b of builtinDefaults) {
    const mine = defs.find((d) => d.id === b.id)
    if (mine === undefined) {
      // ⭐ 读侧会自动补回（`loadKinds`），但**保存时缺了要报** ——
      //    否则用户会以为"删掉了"，而实际它下次又回来了（更迷惑）。
      errs.push(`内置类型 \`${b.id}\` **不能删除**（存量知识都在用它）。`)
      continue
    }
    if (mine.label !== b.label) {
      errs.push(`内置类型 \`${b.id}\` 的显示名**不能改**（当前是「${b.label}」）。`)
    }
    if (b.reserved && !mine.reserved) {
      errs.push(`类型 \`${b.id}\` 是**保留项**，不能把它的"保留"标记去掉 —— 那会让模型手工造出检索不到的知识。`)
    }
  }
  return errs
}

/**
 * ⭐⭐⭐ **删除一条类型前的前置检查**（用户裁定的"引用保护"）。
 *
 * 🔴 **为什么拒绝删而不是"删了顺带清引用"**：
 *   清引用要**扫全库、改 569 个封面文件**，而且**不可逆**（原 kind 再也找不回）。
 *   ⇒ 与 `memj_promote` 的「只允许删空容器」**同一纪律**：
 *     **容器不空就不删，让用户先自己决定那些条目该归到哪**。
 * @param id - 想删的类型 id。
 * @param defs - 当前表。
 * @param usedCount - 该 id 当前被多少条封面引用（调用方扫库传入）。
 * @returns 拒绝理由；空串 = 可以删。
 */
export function deleteKindBlockReason(id: string, defs: readonly KindDef[], usedCount: number): string {
  const d = defs.find((x) => x.id === id)
  if (d === undefined) return `类型 \`${id}\` 不在表里。`
  if (d.builtin) return `\`${id}\` 是**内置类型**，不能删除（存量知识都在用它）。`
  if (usedCount > 0) {
    return `\`${id}\` 还有 **${usedCount}** 条知识在用 —— 请先把它们改成别的类型（或留空），再删。`
  }
  return ''
}


