/**
 * ⭐⭐ **封面删改通道**（决策 114）。
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * 在此之前，**封面一旦写错就几乎无法收拾**：
 *
 * | 对象 | 字段 | 改动前 |
 * |---|---|---|
 * | entry 封面 | `title`/`desc`/`tags` | ❌ 只能 `overwrite` **连正文一起**重写 |
 * | | `kind` | ❌ 无（§12-72 明确留待做） |
 * | | `theme` | ⚠️ 只能**追加**（`memj_promote`），**删不掉** |
 * | | `global` | ⚠️ 只能置真，**取消不了** |
 * | | `project` | ❌ 无 |
 * | | 整条删除 | ❌ 无 |
 * | 项目 | `desc` / 改名 / 删除 | ❌ 全无 |
 * | 主题 | `desc` / 改名 / 删除 | ❌ 全无 |
 *
 * ⚠️ **实际卡住的例子**：`c9bcc110` 被误挂到 `thm-dsh-skill`，
 * 用户要"摘掉改挂"——**却没有摘除通道**，只能手工改库文件（违反"取用按逻辑地址"）。
 *
 * ── 🔴 三条设计原则（用户拍板）────────────────────────────────────────────────
 * 1. **单一实现、两处入口**：本模块是唯一的实现；LLM 侧（`memj_promote` 工具）
 *    与人侧（网页 API）**都调它**——不写两遍（本项目的老坑）。
 * 2. **只管封面/元数据**：**正文的增删改查仍归 `memj_handoff`**
 *    （用户明确："交给写 handoff 的时候，只要记住是更新合并的角色即可"）。
 *    唯一的例外是**删整条 entry**——那必须连正文一起删，否则留孤儿文件。
 * 3. **能改就不删；改名 = 先建后删**（用户明确："项目能改先改，主题先添加再删除"）：
 *    改名**不改 id 本身**（id 是引用键），而是"把内容迁到新 id、再删旧的"
 *    ——这样引用不会断，且过程中**任何一步失败都不会丢数据**。
 *
 * ── 🔴 两个安全底线 ──────────────────────────────────────────────────────────
 * · **删项目/主题前，旗下必须已无知识**（否则拒绝）。理由：级联删知识是
 *   **不可逆的大面积损坏**，而"先迁走再删"多花一步却可恢复。
 * · **删 entry 时只删内部正文**：外部引用（`ext: true`）的文件在库外、
 *   **不属于 memj**，只移除封面、绝不动人家的文件。
 *
 * @module dsh-memj/edit
 */

import {
  addNomination,
  deleteEntryFile,
  deleteProjectDoc,
  deleteThemeDoc,
  loadProjectDoc,
  loadThemeFrontmatter,
  projectIdFromFile,
  readNominations,
  rebuildDerivedLayers,
  removeNomination,
  scanLibrary,
  syncEntryFrontmatter,
  writeProjectDoc,
  writeThemeDoc,
  // ⭐⭐ 决策 220：改完规范后，`truncateSections` **从正文反解**再回写
  //    （与 handoff 落盘同一条纪律：**正文权威、frontmatter 跟随**）。
  truncateTitlesFromBlocks,
} from './store.ts'
import { validateCoverShape } from './parse.ts'
import type { Cover, EntryKind } from './schema.ts'
// ⭐⭐⭐ 决策 220：规范块的**读写通道**（`sections.ts` 是零依赖叶子模块，直接引它）。
import { sectionSpecsOf, setSectionSpecBlock } from './sections.ts'

/** 一次删改的结果。 */
export interface EditResult {
  ok: boolean
  /** 给人/模型看的回执（成功时说明改了什么，失败时说明为什么）。 */
  message: string
  /**
   * ⭐ **归档时间**（决策 133）——只有"归档"成功时才有值。
   *
   * 🔴 **为什么要把时间回给调用方**：人侧的归档页列表要显示"归档于 X"，
   *    而归档动作一完成，前端手上的那一条**还没有**这个字段（它刚从活跃清单搬走）。
   *    只回一句文案的话，前端要么再拉一次全量、要么显示空时间。
   *    ⚠️ 与 `updatedAt` 不同：那是"最后一次改动"，不是"被归档的时刻"。
   */
  archivedAt?: string
}

/** 内部：成功。 */
function ok(message: string, archivedAt?: string): EditResult {
  return archivedAt === undefined ? { ok: true, message } : { ok: true, message, archivedAt }
}

/** 内部：失败。 */
function no(message: string): EditResult {
  return { ok: false, message }
}

/**
 * ⭐ **改一张封面并按需同步两处**（"两处都写"，§3.3）。
 *
 * 🔴 **走 `writeProjectDoc` 而不是"按行号局部替换"**：后者（`fixCoverBlock` 用的）
 *    需要**调用方先拿到行号**，而行号在并发/多次编辑下会漂移；
 *    更重要的是，`writeProjectDoc` **已经正确处理 `orphans`**
 *    （解析失败的封面块原样写回，§8.7④）——不会静默丢掉它们。
 * @param id - 封面 id。
 * @param mutate - 把旧封面映射成新封面。
 * @returns 结果（含新旧封面，供回执对比）。
 */
async function mutateCover(
  id: string,
  mutate: (c: Cover) => Cover,
  opts: { allowArchived?: boolean; preserveUpdatedAt?: boolean } = {},
): Promise<{ result: EditResult; before?: Cover; after?: Cover; owner?: string }> {
  // 🔴 **必须"含归档"地扫**（决策 133）：归档封面不在默认快照里，
  //    而"**恢复**"这个动作恰恰要找到它。⚠️ 也正因如此，下面那道归档守卫不可省——
  //    扫描范围放宽了，就得靠守卫把"不可编辑"这条边界补回来。
  const snapshot = await scanLibrary({ includeArchived: true })
  const found = snapshot.covers.find((c) => c.cover.id === id)
  if (found === undefined) {
    return { result: no(`库里没有 id 为 \`${id}\` 的封面。`) }
  }
  const before = found.cover
  // 🔴 **归档守卫**（决策 133 / 用户明确要求）：归档条目**不可编辑**。
  //    ⭐ 这道门同时挡住了**模型侧**（`memj_promote` 也走本函数）与人侧普通编辑；
  //    ⚠️ 而"归档 / 恢复"这两个动作本身要能穿过 ⇒ 它们显式传 `allowArchived: true`。
  if ((before.archivedAt ?? '') !== '' && opts.allowArchived !== true) {
    return { result: no(`条目 \`${id.slice(0, 8)}\` **已归档**，不可编辑。请先在「归档」页恢复它。`) }
  }
  const mutated = mutate(before)
  // ⭐⭐ **时间自动维护**（决策 119）：**所有**封面改动都经过本函数
  //    ⇒ `updatedAt` 在这里统一刷新，各调用点**不必自己记**（少一处漏刷的风险）。
  //    🔴 `createdAt` **永不覆盖**——它是"这条什么时候产生的"，不是"改过几次"。
  //
  // ⭐⭐ **`preserveUpdatedAt`**（决策 162，2026-09-28）：**标签规范化**用的是
  //    "**整理**、不是内容更新"的语义 ⇒ 它**不该刷新 `updatedAt`**。
  //    🔴 为什么必须保住时间：库里 **159 个不同时间值**是**排序与水位线的依据**；
  //       一次批量改 tag 若把它们全塌成同一个 `now` ⇒ **时间维度彻底失效**
  //       （本项目第 160 号决策刚给项目列表做了 `updatedAt` 倒序，那会一起废掉）。
  //    ⚠️ 这是**显式选项、不是默认行为**：普通编辑照旧刷新（那是"内容变了"）。
  const nowIso = new Date().toISOString()
  const after: Cover = {
    ...mutated,
    createdAt: (before.createdAt ?? '') !== '' ? before.createdAt : (mutated.createdAt ?? '') || nowIso,
    updatedAt: opts.preserveUpdatedAt === true ? (before.updatedAt ?? '') : nowIso,
  }

  // ── 硬校验（零 LLM）：改出来的封面必须仍然合法 ──
  //    ⭐ **方案 A**：待批提名（`global` 仍为 false）也要算一种归属，
  //    否则改一条待批的纯全局知识会被误判三空。
  const pendingIds = new Set((await readNominations()).map((n) => n.entryId))
  const issues = validateCoverShape(after, undefined, pendingIds.has(after.id))
  if (issues.length > 0) {
    return { result: no(`校验未通过，**未写入**：\n` + issues.map((s) => `  · ${s}`).join('\n')) }
  }

  // ⭐ **按封面真正所在的那份文档定位**（决策 133 顺带修正）：
  //    `sourceFile` 是"它实际躺着的 HANDOFF 文档"，比 `cover.project` 可靠——
  //    封面的 `project` 字段**可能为空**，也可能被人手改得与文件不一致。
  //    旧写法取 `before.project`，遇到前者会直接报"没有项目归属，暂不支持修改"。
  const owner = projectIdFromFile(found.sourceFile) ?? before.project
  if (owner === '') {
    return { result: no(`封面 \`${id.slice(0, 8)}\` 没有项目归属，暂不支持修改。`) }
  }
  const doc = await loadProjectDoc(owner)
  if (doc === undefined) {
    return { result: no(`找不到项目文档 \`${owner}\`。`) }
  }

  const covers = doc.covers.map((c) => (c.id === id ? after : c))
  await writeProjectDoc(owner, doc.frontmatter, doc.narrative, covers, doc.orphans)
  // ⚠️ **两处都写**：封面改了，条目正文的 frontmatter 也要跟上，
  //    否则下一次 `memj_rebuild` 会把封面按正文 frontmatter 改回去（或反之）。
  if (!after.ext) await syncEntryFrontmatter(after)

  return { result: ok(''), before, after, owner }
}

// ══════════════════════════════════════════════════════════════════════════
// 一、entry 封面
// ══════════════════════════════════════════════════════════════════════════

/** 可改的 entry 封面字段。 */
export interface EntryFieldChange {
  title?: string
  desc?: string
  tags?: readonly string[]
  /** ⭐ `kind` 的修改通道（补 §12-72 那个留待做）。空串 = 改回"未分类"。 */
  kind?: EntryKind | ''
}

/**
 * ⭐ **改 entry 封面的字段**（`title` / `desc` / `tags` / `kind`）。
 *
 * ⚠️ **只给要改的字段**；没给的保持不变（**不是**整份替换）。
 * @param id - 封面 id。
 * @param fields - 要改的字段。
 * @param opts - ⭐ `preserveUpdatedAt`（决策 162）：**标签规范化**这类"整理"动作用它，
 *   让 `updatedAt` **不被刷新**（否则批量整理会把库里的时间维度整个抹平）。
 *   ⚠️ `allowArchived`：规范化要含归档条目 ⇒ 显式放行。
 * @returns 结果。
 */
export async function setEntryFields(
  id: string,
  fields: EntryFieldChange,
  opts: { preserveUpdatedAt?: boolean; allowArchived?: boolean } = {},
): Promise<EditResult> {
  const changed: string[] = []
  const r = await mutateCover(id, (c) => {
    const next: Cover = { ...c }
    if (fields.title !== undefined && fields.title !== c.title) {
      next.title = fields.title
      changed.push(`title: 「${c.title}」→「${fields.title}」`)
    }
    if (fields.desc !== undefined && fields.desc !== c.desc) {
      next.desc = fields.desc
      changed.push('desc 已更新')
    }
    if (fields.tags !== undefined) {
      const tags = fields.tags.map((t) => t.trim()).filter((t) => t !== '')
      if (JSON.stringify(tags) !== JSON.stringify(c.tags)) {
        next.tags = tags
        changed.push(`tags: ${c.tags.join('/')} → ${tags.join('/')}`)
      }
    }
    if (fields.kind !== undefined && fields.kind !== c.kind) {
      next.kind = fields.kind
      changed.push(`kind: ${c.kind === '' ? '(未分类)' : c.kind} → ${fields.kind === '' ? '(未分类)' : fields.kind}`)
    }
    return next
  }, opts)
  if (!r.result.ok) return r.result
  if (changed.length === 0) return ok(`封面 \`${id.slice(0, 8)}\` 没有需要改的字段（值都相同）。`)
  // ⚠️ **规范化会批量调用本函数** ⇒ 那条路径自己最后 rebuild 一次；
  //    逐条 rebuild 实测 858ms × N，258 条就是 3.7 分钟（不可行）。
  if (opts.preserveUpdatedAt !== true) await rebuildDerivedLayers()
  return ok(`已更新封面 \`${id.slice(0, 8)}\`（项目 \`${r.owner}\`）：\n` + changed.map((s) => `  · ${s}`).join('\n'))
}

/**
 * ⭐⭐ **更新一条已有 entry 的内容**（决策 119）——**改正文**，这是此前缺的通道。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * 在此之前，**改一条知识的正文**只有一条路：`memj_handoff` + `overwrite: true`
 * ——那是**整条替换**，`body` 必填 ⇒ **改一个错字也得把整篇重贴一遍**，
 * 而且很容易在重贴时漏字段或改坏内容。
 *
 * ⚠️ **与 `memj_promote` 的分工**（两者不重叠）：
 *   · `memj_promote` = **只碰元数据**（主题/字段/global/项目/删除），**不碰正文**；
 *   · `memj_update` = **碰正文**（可选连封面字段一起改），**面向"这一条"**。
 * ⇒ 加新能力时想清楚归哪边：**要动 `body` 的只在这里**。
 *
 * ⭐ **用法场景**（用户明确）：
 *   ① handoff / 单步沉淀时，先 `memj_search` + `memj_read` 发现有**相似条目**
 *      ⇒ 考虑**更新原有那条**，而不是再写一条新的；
 *   ② 某条知识的**事实过期**了 ⇒ 在那个时机用本工具刷新它。
 *
 * 🔴 **`createdAt` 永不变**（那是"这条什么时候产生的"）；
 *    **`updatedAt` 每次真正改动都会刷新**（含只改正文、只改封面字段）。
 * @param id - 封面 id。
 * @param opts - `body`（新正文；给了就替换）与可选的封面字段（同 `setEntryFields`）。
 * @returns 结果。
 */
export async function updateEntry(
  id: string,
  opts: { body?: string; fields?: EntryFieldChange },
): Promise<EditResult> {
  // ⭐ 归档条目不可编辑（决策 133）——本函数**不走 `mutateCover`**，必须自己守。
  const blocked = await guardEntryEditable(id)
  if (blocked !== null) return blocked

  const snapshot = await scanLibrary()
  const found = snapshot.covers.find((c) => c.cover.id === id)
  if (found === undefined) return no(`库里没有 id 为 \`${id}\` 的封面。`)
  const cover = found.cover
  if (cover.ext) {
    return no(
      `\`${id.slice(0, 8)}\` 是**外部引用**（ext: true）——它的正文在库外、**不属于 memj**，` +
        '本工具**不改外部文件**。若要改，请直接编辑那个文件；封面字段仍可用 `memj_promote` 改。',
    )
  }

  const changed: string[] = []
  const bodyGiven = opts.body !== undefined
  if (bodyGiven) changed.push('正文已更新')

  // 封面字段的改动（与 `setEntryFields` 同一套判据，但**内联在这里**，
  // 因为要与正文改动**共用一次写入**——否则会写两遍文件、刷两次时间）。
  const fields = opts.fields ?? {}
  const nextTitle = fields.title !== undefined ? fields.title : cover.title
  const nextDesc = fields.desc !== undefined ? fields.desc : cover.desc
  const nextKind = fields.kind !== undefined ? fields.kind : cover.kind
  const nextTags = fields.tags !== undefined
    ? fields.tags.map((t) => t.trim()).filter((t) => t !== '')
    : cover.tags
  if (nextTitle !== cover.title) changed.push(`title: 「${cover.title}」→「${nextTitle}」`)
  if (nextDesc !== cover.desc) changed.push('desc 已更新')
  if (nextKind !== cover.kind) {
    changed.push(`kind: ${cover.kind === '' ? '(未分类)' : cover.kind} → ${nextKind === '' ? '(未分类)' : nextKind}`)
  }
  if (JSON.stringify(nextTags) !== JSON.stringify(cover.tags)) changed.push('tags 已更新')
  if (changed.length === 0) return ok(`封面 \`${id.slice(0, 8)}\` 没有任何改动（正文与字段都相同）。`)

  const nowIso = new Date().toISOString()
  const next: Cover = {
    ...cover,
    title: nextTitle,
    desc: nextDesc,
    kind: nextKind,
    tags: nextTags,
    // 🔴 `createdAt` **永不变**；`updatedAt` 刷新（决策 119）。
    createdAt: (cover.createdAt ?? '') !== '' ? cover.createdAt : nowIso,
    updatedAt: nowIso,
  }

  // 硬校验（与其它写入路径同一份规则）。
  // ⭐ 方案 A：待批提名也算一种归属（同 `mutateCover`）。
  const updatePending = new Set((await readNominations()).map((n) => n.entryId))
  const issues = validateCoverShape(next, undefined, updatePending.has(next.id))
  if (issues.length > 0) {
    return no(`校验未通过，**未写入**：\n` + issues.map((s) => `  · ${s}`).join('\n'))
  }

  // ① 写正文（连封面字段的 frontmatter 一起，**一次写入**）。
  //    ⚠️ 用 `writeEntryDoc` 会按 slug 重算路径 ⇒ 可能写出第二个文件；
  //    但这里**是要覆盖已有条目** ⇒ 必须按原 `ref` 就地写 ⇒ 用 `syncEntryFrontmatter`。
  const wrote = await syncEntryFrontmatter(next, opts.body)
  if (!wrote) {
    return no(`条目正文文件写不进去（\`${cover.ref}\` 可能已被移动或删除）。`)
  }

  // ② 写封面（项目文档里的那一块）。
  const owner = cover.project
  if (owner === '') return no(`封面 \`${id.slice(0, 8)}\` 没有项目归属，无法写回。`)
  const doc = await loadProjectDoc(owner)
  if (doc === undefined) return no(`找不到项目文档 \`${owner}\`。`)
  const covers = doc.covers.map((c) => (c.id === id ? next : c))
  await writeProjectDoc(owner, doc.frontmatter, doc.narrative, covers, doc.orphans)
  await rebuildDerivedLayers()

  return ok(
    `已更新条目 \`${id.slice(0, 8)}\`（「${next.title}」，项目 \`${owner}\`）：\n` +
      changed.map((s) => `  · ${s}`).join('\n') +
      (bodyGiven ? `\n  · 新正文 ${[...(opts.body ?? '')].length} 字符` : '') +
      '\n⚠️ `createdAt` 未变，`updatedAt` 已刷新。',
  )
}

/**
 * ⭐⭐ **增删 entry 的 `theme`**（决策 114——**这就是 `c9bcc110` 卡住的那个缺口**）。
 *
 * ⚠️ **累加语义**（与 §6 协议一致）：`add` 是追加、`remove` 是移除，
 * 两边都不影响原有归属；`project` 与 `global` **完全不动**。
 * @param id - 封面 id。
 * @param opts - `add` / `remove` 主题 id 数组。
 * @returns 结果。
 */
export async function editEntryThemes(
  id: string,
  opts: { add?: readonly string[]; remove?: readonly string[] },
): Promise<EditResult> {
  const snapshot = await scanLibrary()
  const known = new Set(snapshot.themeIds)
  const add = (opts.add ?? []).map((t) => t.trim()).filter((t) => t !== '')
  const remove = (opts.remove ?? []).map((t) => t.trim()).filter((t) => t !== '')

  // ⚠️ 只能挂**已存在**的主题（与 handoff 同一条规矩：新建主题是聚合判断，
  //    只有写项目文档那一次调用才有那个视角）。
  const unknown = add.filter((t) => !known.has(t))
  if (unknown.length > 0) {
    return no(
      `主题不存在：${unknown.map((t) => `\`${t}\``).join('、')}。\n` +
        `库里现有的主题：${snapshot.themeIds.length > 0 ? snapshot.themeIds.map((t) => `\`${t}\``).join('、') : '（暂无）'}`,
    )
  }

  const r = await mutateCover(id, (c) => {
    const set = new Set(c.theme)
    for (const t of add) set.add(t)
    for (const t of remove) set.delete(t)
    return { ...c, theme: [...set] }
  })
  if (!r.result.ok) return r.result

  const b = r.before?.theme ?? []
  const a = r.after?.theme ?? []
  if (JSON.stringify(b) === JSON.stringify(a)) {
    return ok(`封面 \`${id.slice(0, 8)}\` 的主题**没有变化**（当前：${a.length > 0 ? a.join('、') : '无'}）。`)
  }
  await rebuildDerivedLayers()
  return ok(
    `已更新封面 \`${id.slice(0, 8)}\` 的主题：\n` +
      `  · 改前：${b.length > 0 ? b.join('、') : '（无）'}\n` +
      `  · 改后：${a.length > 0 ? a.join('、') : '（无）'}\n` +
      '⚠️ **累加语义**：`project` 与 `global` 未受影响。',
  )
}

/**
 * **置 `global`**——⭐ **语义随"谁在做"而不同**（决策 116）。
 *
 * | 谁 | 置真时的行为 | 为什么 |
 * |---|---|---|
 * | 侧 | 行为 | 理由 |
 * |---|---|---|
 * | **人侧**（网页编辑面板） | ⭐ **直接生效**（置 `global: true`，清掉提名） | **人本来就是审批者**——他亲手勾选，再让他去审批自己，是多余的一步 |
 * | **LLM 侧**（`memj_promote`） | 只登记提名，**封面 `global` 保持 `false`** | §7.3 安全底线：**模型不能自己批准**全局知识 |
 *
 * ⭐⭐ **方案 A（2026-09-18）的核心语义**：
 * `global: true` **只表示"已批准"**；"待批"**只由提名表表达**。
 * 旧实现提名时就把 `global` 置 `true`、靠"在不在提名表里"区分是否已批
 * ⇒ 待批期间字段**在撒谎**，且用"队列成员身份"编码状态
 * （本项目已记过这类坑——「用『在队列里』编码状态，会让『移除』等于『完成』」）。
 *
 * 🔴🔴 **两侧都走本函数，但 `actor` 必须如实传**：
 *    - `actor: 'llm'`（缺省）⇒ **只登记提名，不置位**。
 *      ⚠️ 早先的注释写着"只置 `global` 而不登记提名会被当成已批准"——
 *      那是**旧判据**下的问题；现在**反过来了**：判据只看 `global`，
 *      所以**LLM 侧绝不能置位**（置了就等于自己批准了）。
 *    - `actor: 'human'` ⇒ **直接生效**：置 `global: true` 并**确保不在提名表里**。
 * @param id - 封面 id。
 * @param value - 目标值。
 * @param actor - 谁在做：`'llm'`（缺省，只提名）或 `'human'`（直接生效）。
 * @returns 结果。
 */
export async function setEntryGlobal(
  id: string,
  value: boolean,
  actor: 'llm' | 'human' = 'llm',
): Promise<EditResult> {
  if (value) {
    if (actor === 'human') {
      // ⭐ **人侧 = 直接生效**：置位 + 清掉可能存在的提名（人本来就是审批者）。
      const r = await mutateCover(id, (c) => ({ ...c, global: true }))
      if (!r.result.ok) return r.result
      await removeNomination(id)
      await rebuildDerivedLayers()
      return ok(`封面 \`${id.slice(0, 8)}\` 已加入全局，**已当场生效**（你在人侧直接确认）。`)
    }
    // ⭐ **LLM 侧 = 只提名、不置位**（`global` 保持 false）。
    //    ⚠️ 这里**不先写一遍 `global: false`**：若它本来就是 false（正常情况），
    //        mutateCover 会白刷一次 updatedAt 并触发一次不必要的重建。
    //        存量可能残留 true（旧版提名时置过），那种情况下面显式清一次。
    const snapshot = await scanLibrary()
    const found = snapshot.covers.find((c) => c.cover.id === id)
    if (found === undefined) return no(`库里没有 id 为 \`${id}\` 的封面。`)
    if (found.cover.global) {
      const r = await mutateCover(id, (c) => ({ ...c, global: false }))
      if (!r.result.ok) return r.result
    }
    await addNomination({
      entryId: id,
      title: found.cover.title,
      desc: found.cover.desc,
      project: found.cover.project,
      nominatedAt: new Date().toISOString(),
    })
    await rebuildDerivedLayers()
    return ok(
      `封面 \`${id.slice(0, 8)}\` 已**登记为待批提名**（封面 \`global\` 仍为 \`false\`）。\n` +
        '⚠️ 需人在网页或 `/memj-review` 里**批准**后才置位进 GLOBAL——工具不会自己批准。',
    )
  }

  // ── 取消（置 false）：置回封面 + 清掉提名 ──
  //    ⚠️ 用 `removeNomination`（**只清提名表**）而不是 `approveNomination`
  //       ——后者在方案 A 下**会置 `global: true`**，与"取消"正好相反。
  const r = await mutateCover(id, (c) => ({ ...c, global: false }))
  if (!r.result.ok) return r.result
  await removeNomination(id)
  await rebuildDerivedLayers()
  return ok(`封面 \`${id.slice(0, 8)}\` 已**取消** global（置为 false），并清掉了它的提名。`)
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐ 归档 / 恢复（决策 133）——**纯人侧动作，不提供工具**
// ══════════════════════════════════════════════════════════════════════════
//
// 用户对语义的裁定：
//  · 归档的 entry：**不可读**（工具回执"该条目已归档，信息不可用"）、**不可编辑**；
//  · 归档的 project：**它本身**不再参与工具调用（且不能再往它下面新增知识），
//    但**旗下知识不归档**、封面里的挂靠信息**也不变更**；
//  · 归档时若在提名表里 ⇒ **清掉提名**；若 `global` 为 true ⇒ **改 false**；
//  · 恢复**直接生效**，与目标项目是否归档无关。
//
// 🔴 **为什么不给模型一个"归档"工具**：归档是**治理动作**（决定什么该继续参与检索）。
//    模型若能自行雪藏知识，检索面会**静默缩水**，而人根本不知道发生过——
//    这与本项目"给模型的返回文本不派活"是同一种克制的另一面。

/**
 * ⭐⭐ **条目侧的归档守卫**（决策 133）——给**不走 `mutateCover`** 的写通路用。
 *
 * 🔴 **为什么需要它**（实测踩到）：`mutateCover` 里的守卫只保护"经过它"的那几条路，
 *    而 `updateEntry`（`memj_update` 工具）与 `moveEntry` / `deleteEntry`
 *    各自 `scanLibrary()`（**默认不含归档**）找封面 ⇒ 归档条目会命中
 *    "**库里没有 id 为 X 的封面**"——🔴 **那是撒谎**：它在库里，只是被归档了。
 *    用户明确要求这种情形回"该条目已归档，不可编辑"。
 *
 * ⚠️ 判据用**含归档**的扫描；`undefined` 才算真的不存在。
 * @param id - 封面 id。
 * @returns 通过返回 `null`；否则返回应当直接返回给调用方的拒绝结果。
 */
async function guardEntryEditable(id: string): Promise<EditResult | null> {
  const cur = await findCoverAny(id)
  if (cur === undefined) return no(`库里没有 id 为 \`${id}\` 的封面。`)
  if ((cur.archivedAt ?? '') !== '') {
    return no(`条目 \`${id.slice(0, 8)}\` **已归档**，不可编辑。请先在「归档」页恢复它。`)
  }
  return null
}

/** 找一张封面（**含归档**）——给"先判后写"的归档动作做前置探测。 */
async function findCoverAny(id: string): Promise<Cover | undefined> {
  const snapshot = await scanLibrary({ includeArchived: true })
  return snapshot.covers.find((c) => c.cover.id === id)?.cover
}

/**
 * ⭐⭐ **只读探测：这张封面是不是"存在但已归档"**（决策 133）。
 *
 * 🔴 **为什么必须导出**：`memj_promote` 用默认快照（**不含归档**）找封面，
 *    归档条目会落到"库里没有这张封面"那条回执上——那是**撒谎**。
 *    要区分"真不存在"与"存在但归档"，调用方就得有一个**含归档**的探测手段。
 *    ⚠️ 刻意**不复用 `guardEntryEditable`**：那个是"写动作的闸门"（返回拒绝结果），
 *       而这里只回答"是不是归档的"这一个事实，调用方自己决定怎么措辞。
 * @param id - 封面 id。
 * @returns `'active'`（存在且活跃）/ `'archived'`（存在但已归档）/ `'missing'`（真没有）。
 */
export async function probeCoverState(id: string): Promise<'active' | 'archived' | 'missing'> {
  const cur = await findCoverAny(id)
  if (cur === undefined) return 'missing'
  return (cur.archivedAt ?? '') !== '' ? 'archived' : 'active'
}

/**
 * ⭐⭐ **项目侧的归档守卫**（决策 133）——项目类写动作的**统一入口检查**。
 *
 * 🔴 **为什么需要单独一个函数**：条目的守卫长在 `mutateCover` 里（**所有**条目改动
 *    都经过它），而项目**没有那样一个汇聚点**——`setProjectFields` / `renameProject` /
 *    `deleteProject` 各自 `loadProjectDoc`。若不显式检查，归档项目会：
 *    · `setProjectFields` ⇒ **真的写进去**（改动**成功**了，与"归档不可编辑"直接矛盾）；
 *    · `renameProject` / `deleteProject` ⇒ 用**默认快照**找项目 ⇒ 报"项目不存在"，
 *      而它其实在库里（只是归档了）⇒ 回执**撒谎**。
 *
 * ⚠️ 判据用 `loadProjectDoc`（**按 id 直接读文档**），不用 `scanLibrary` ——
 *    后者默认**不含**归档项目，用它检查等于没检查。
 * @param id - 项目 id。
 * @returns 通过返回 `null`；否则返回应当直接返回给调用方的拒绝结果。
 */
async function guardProjectEditable(id: string): Promise<EditResult | null> {
  const doc = await loadProjectDoc(id)
  if (doc === undefined) return no(`项目 \`${id}\` 不存在。`)
  if ((doc.frontmatter.archivedAt ?? '') !== '') {
    return no(`项目 \`${id}\` **已归档**，不可编辑。请先在「归档 → 项目」页恢复它。`)
  }
  return null
}

/**
 * 归档一条 entry（决策 133）。
 *
 * ⚠️ **连带把 `global` 置 false**（用户要求）：归档撤回了全局身份，
 * 若不置位，它会**仍以已批准的身份留在 `GLOBAL.md`** 里。
 * @param id - 封面 id。
 * @returns 结果。
 */
export async function archiveEntry(id: string): Promise<EditResult> {
  // ⚠️ **先判后写**（实测教训）：若把"已经是归档状态"的判断放在 `mutateCover` 之后，
  //    那时**盘已经写过了**——虽然改的是同一个值，但会白刷 `updatedAt`、
  //    还会把项目文档整篇重写一遍，然后才回一句"它本来就是归档的"。
  const cur = await findCoverAny(id)
  if (cur === undefined) return no(`库里没有 id 为 \`${id}\` 的封面。`)
  if ((cur.archivedAt ?? '') !== '') return no(`条目 \`${id.slice(0, 8)}\` **已经是归档状态**。`)

  const nowIso = new Date().toISOString()
  const r = await mutateCover(
    id,
    (c) => ({ ...c, archivedAt: nowIso, global: false }),
    { allowArchived: true },
  )
  if (!r.result.ok) return r.result
  // ⭐ **先改封面、再销提名**（与 `rejectNomination` 同序）：反了会留下
  //    "global:true 且不在提名表里"的瞬间，此刻重建会被当成已批准。
  //    （本函数把 global 一起置了 false，所以那瞬间其实不存在，但顺序保持一致。）
  await removeNomination(id)
  await rebuildDerivedLayers()
  return ok(
    `条目 \`${id.slice(0, 8)}\` 已**归档**（归档时间 ${nowIso}）：不再出现在知识库列表与工具检索里。\n` +
      '⚠️ 它已退出 `GLOBAL`（若原本在）；可在「归档」标签页恢复。',
    nowIso,
  )
}

/**
 * 恢复一条已归档的 entry（决策 133）。
 *
 * ⚠️ **不恢复 `global`**：归档撤回了全局身份，"恢复"只是让它回到活跃，
 * **不等于重新获批**（批准是人的动作）。要重新全局请再走一遍提名。
 * ⚠️ **不检查它的项目是否归档**（用户明确：恢复与项目状态无关）。
 * @param id - 封面 id。
 * @returns 结果。
 */
export async function unarchiveEntry(id: string): Promise<EditResult> {
  const cur = await findCoverAny(id)
  if (cur === undefined) return no(`库里没有 id 为 \`${id}\` 的封面。`)
  if ((cur.archivedAt ?? '') === '') return no(`条目 \`${id.slice(0, 8)}\` **本来就不是归档状态**。`)

  const r = await mutateCover(id, (c) => ({ ...c, archivedAt: '' }), { allowArchived: true })
  if (!r.result.ok) return r.result
  await rebuildDerivedLayers()
  return ok(
    `条目 \`${id.slice(0, 8)}\` 已**恢复**：重新回到知识库列表与工具检索里。\n` +
      '⚠️ 它的 `global` 仍为 `false`（归档时已撤回）——要重新全局请再提名、由人批准。',
  )
}

/**
 * 归档一个项目（决策 133）。
 *
 * 🔴 **只动项目文档自己的 `archivedAt`**——
 * **旗下封面一个都不碰**、封面的 `project` 字段也不变（用户明确裁定）。
 * ⇒ 效果是"**项目本身**不再出现在项目列表 / 工具里"，而**它的知识照旧活跃**。
 *
 * ⚠️ 为什么**不触发 rebuild**：派生层（`THEME-*.md` / `GLOBAL.md`）是从**封面**聚合的，
 *    而本动作不改任何封面 ⇒ 投影无变化。多跑一次只会白写文件。
 * @param id - 项目 id。
 * @returns 结果。
 */
export async function archiveProject(id: string): Promise<EditResult> {
  const doc = await loadProjectDoc(id)
  if (doc === undefined) return no(`项目 \`${id}\` 不存在。`)
  if ((doc.frontmatter.archivedAt ?? '') !== '') return no(`项目 \`${id}\` 已经是归档状态。`)
  const nowIso = new Date().toISOString()
  await writeProjectDoc(
    id,
    { ...doc.frontmatter, archivedAt: nowIso },
    doc.narrative, doc.covers, doc.orphans,
  )
  const n = doc.covers.length
  return ok(
    `项目 \`${id}\` 已**归档**：它本身不再参与工具调用（也不能再往它下面新增知识）。\n` +
      `⚠️ 它旗下的 **${n} 条知识不受影响**——照旧出现在知识库与检索里，挂靠关系也不变。`,
  )
}

/**
 * 恢复一个已归档的项目（决策 133）。
 * @param id - 项目 id。
 * @returns 结果。
 */
export async function unarchiveProject(id: string): Promise<EditResult> {
  const doc = await loadProjectDoc(id)
  if (doc === undefined) return no(`项目 \`${id}\` 不存在。`)
  if ((doc.frontmatter.archivedAt ?? '') === '') return no(`项目 \`${id}\` 本来就不是归档状态。`)
  await writeProjectDoc(
    id,
    { ...doc.frontmatter, archivedAt: '' },
    doc.narrative, doc.covers, doc.orphans,
  )
  return ok(`项目 \`${id}\` 已**恢复**：重新出现在项目列表里。`)
}

/**
 * **把一条 entry 迁到另一个项目**（`project` 字段只有一个来源，改它是"搬家"）。
 *
 * 🔴 **与"主题"不同**：主题是**累加**（可以同时属于多个），
 * 而 `project` 是**单值**——所以这里是**搬运**，旧项目文档里会移除该封面。
 * ⚠️ 目标项目**必须已存在**（不新建——新建项目要 `projectDesc`，那属于 handoff 的职责）。
 * @param id - 封面 id。
 * @param projectId - 目标项目 id。
 * @returns 结果。
 */
export async function moveEntry(id: string, projectId: string): Promise<EditResult> {
  const target = projectId.trim()
  // ⭐ 归档条目不可编辑（决策 133）——统一守卫，避免"某个写通路忘了守"。
  const blocked = await guardEntryEditable(id)
  if (blocked !== null) return blocked

  // ⚠️ 仍然**含归档地找**：守卫已保证它不是归档的，这里只是取它的封面字段。
  const snapshot = await scanLibrary({ includeArchived: true })
  const found = snapshot.covers.find((c) => c.cover.id === id)
  if (found === undefined) return no(`库里没有 id 为 \`${id}\` 的封面。`)
  const from = found.cover.project
  if (from === target) return ok(`封面 \`${id.slice(0, 8)}\` 本来就在项目 \`${target}\`。`)
  if (!snapshot.projects.some((p) => p.id === target)) {
    return no(
      `目标项目 \`${target}\` 不存在。\n` +
        `库里现有项目：${snapshot.projects.map((p) => `\`${p.id}\``).join('、')}\n` +
        '⚠️ 本通道**不新建项目**（新建要 `projectDesc`，请用 `memj_handoff`）。',
    )
  }

  const oldDoc = await loadProjectDoc(from)
  const newDoc = await loadProjectDoc(target)
  if (oldDoc === undefined || newDoc === undefined) {
    return no(`读不到项目文档（\`${from}\` 或 \`${target}\`）。`)
  }

  const moved: Cover = { ...found.cover, project: target }
  await writeProjectDoc(
    from,
    oldDoc.frontmatter,
    oldDoc.narrative,
    oldDoc.covers.filter((c) => c.id !== id),
    oldDoc.orphans,
  )
  await writeProjectDoc(
    target,
    newDoc.frontmatter,
    newDoc.narrative,
    [...newDoc.covers, moved],
    newDoc.orphans,
  )
  if (!moved.ext) await syncEntryFrontmatter(moved)
  await rebuildDerivedLayers()
  return ok(`已把封面 \`${id.slice(0, 8)}\` 从 \`${from}\` 迁到 \`${target}\`。`)
}

/**
 * 🔴 **删掉一条 entry**（封面 + 正文文件，不可逆）。
 *
 * ⚠️ **只删内部正文**：外部引用（`ext: true`）的文件在库外，**只移除封面**。
 * @param id - 封面 id。
 * @returns 结果。
 */
export async function deleteEntry(id: string): Promise<EditResult> {
  // ⭐ 归档条目不可编辑（决策 133）——统一守卫。
  //    ⭐ 人侧也**不给删归档物**（前端在归档态不画「删除」按钮）；这里挡的是
  //       直接调接口 / 旧书签等旁路。
  const blocked = await guardEntryEditable(id)
  if (blocked !== null) return blocked

  const snapshot = await scanLibrary()
  const found = snapshot.covers.find((c) => c.cover.id === id)
  if (found === undefined) return no(`库里没有 id 为 \`${id}\` 的封面。`)
  const cover = found.cover
  if (cover.project === '') return no(`封面 \`${id.slice(0, 8)}\` 没有项目归属，暂不支持删除。`)

  const doc = await loadProjectDoc(cover.project)
  if (doc === undefined) return no(`找不到项目文档 \`${cover.project}\`。`)

  // ① 先移除封面（这一步成功，条目就"不在库里"了）。
  await writeProjectDoc(
    cover.project,
    doc.frontmatter,
    doc.narrative,
    doc.covers.filter((c) => c.id !== id),
    doc.orphans,
  )
  // ② 再删正文文件（内部条目才有）。⚠️ 失败也不回滚——封面已移除，
  //    留一个孤儿文件比"封面还在、正文没了"安全得多。
  const removed = await deleteEntryFile(cover.ref, cover.ext)
  await rebuildDerivedLayers()

  return ok(
    `已删除条目 \`${id.slice(0, 8)}\`（「${cover.title}」）。\n` +
      (cover.ext
        ? '  · 它是**外部引用**——只移除了封面，**库外那个文件没有动**。'
        : `  · 正文文件${removed ? '已删除' : '**未找到**（可能早就不在了），封面已移除'}。`),
  )
}

// ══════════════════════════════════════════════════════════════════════════
// 二、项目
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ **改项目的显示名与描述**（决策 115）。
 *
 * 🔴 **"改名"改的是 `title`，不是 `project`**（用户明确："可以改名，但是不能改 ID，
 *    相当于只是改标题"）。`project` 是**文件名 + 全部封面的引用键**，
 *    动它要同时改 N 处；而 `title` 只是个显示名，**改了不影响任何引用**。
 *
 * ⚠️ **只改你给的字段**；没给的保持不变。
 * ⚠️ `title` 允许**清空**（空串 = 回落到显示 id）——那是有意义的操作，不是错误。
 * @param id - 项目 id。
 * @param fields - 要改的字段（`title` / `desc`）。
 * @returns 结果。
 */
export async function setProjectFields(
  id: string,
  fields: { title?: string; desc?: string },
): Promise<EditResult> {
  // ⭐ **归档项目不可编辑**（决策 133）——走统一守卫，避免漏掉某一条通路。
  const blocked = await guardProjectEditable(id)
  if (blocked !== null) return blocked

  const doc = await loadProjectDoc(id)
  if (doc === undefined) return no(`项目 \`${id}\` 不存在。`)

  const next = { ...doc.frontmatter }
  const changed: string[] = []
  if (fields.title !== undefined) {
    const t = fields.title.trim()
    if ([...t].length > 48) return no(`项目名超长：${[...t].length} 字符（上限 48）。`)
    if (t !== doc.frontmatter.title) {
      next.title = t
      changed.push(`title: ${doc.frontmatter.title === '' ? '(未设置)' : `「${doc.frontmatter.title}」`} → ${t === '' ? '(已清空)' : `「${t}」`}`)
    }
  }
  if (fields.desc !== undefined) {
    const d = fields.desc.trim()
    if (d === '') return no('项目描述不能为空。')
    if ([...d].length > 200) return no(`项目描述超长：${[...d].length} 字符（上限 200）。`)
    if (d !== doc.frontmatter.desc) {
      next.desc = d
      changed.push('desc 已更新')
    }
  }
  if (changed.length === 0) return ok(`项目 \`${id}\` 没有需要改的字段。`)

  // ⭐ 时间（决策 119）：`createdAt` 保留、`updatedAt` 刷新。
  const nowIso = new Date().toISOString()
  await writeProjectDoc(
    id,
    {
      ...next,
      createdAt: (doc.frontmatter.createdAt ?? '') !== '' ? doc.frontmatter.createdAt : nowIso,
      updatedAt: nowIso,
    },
    doc.narrative,
    doc.covers,
    doc.orphans,
  )
  await rebuildDerivedLayers()
  return ok(`已更新项目 \`${id}\`：\n` + changed.map((s) => `  · ${s}`).join('\n'))
}

/**
 * **改项目描述**（`desc`）——`setProjectFields` 的薄包装（保留旧调用点）。
 * @param id - 项目 id。
 * @param desc - 新描述（≤200 字符）。
 * @returns 结果。
 */
export async function setProjectDesc(id: string, desc: string): Promise<EditResult> {
  return await setProjectFields(id, { desc })
}

/**
 * ⭐⭐⭐ **改某一节的「书写规范」**（决策 220 —— 用户 2026-10-12 要求可编辑）。
 *
 * ── 它改的是什么 ────────────────────────────────────────────────────────────
 * `## <节名>` 下那个 ```memj:spec 围栏块（**块内文字 + 起始行的 `truncate` 标记**）。
 * 用户原话：*"就 memj 存量的项目文档，章节下的章节规范，我希望也变成可编辑的。
 * 编辑入口就放在…右侧详情页，书写规范块上给一下编辑按钮。"*
 *
 * ── 🔴🔴 四条设计边界（都是既有裁定，不是这次新定的）────────────────────────
 * 1. **只改这一节自己的块** —— 该节正文、其它节、封面、（末尾那个旧的）
 *    「本档写作规范」节**一字不动**。本项目既有分工是"正文的增删改查归 `memj_handoff`"，
 *    本函数只碰**工具自己生成的**那一块。
 * 2. **没有块就拒绝（`no-block`），绝不合成** —— 决策 207：
 *    "已有文档没有规范就绝不替它合成"（不知道它该有哪几节，硬贴默认规范是主动误导）。
 * 3. **`truncate` 标记改完要回写 frontmatter 镜像** —— 正文是权威
 *    （`truncateTitlesFromBlocks`），而 `frontmatter.truncateSections` 是它的镜像；
 *    ⚠️ **不跟手会把"哪节能自动截断"两处写成两样**（本项目最忌的"同一事实两份值"）。
 *    ⇒ 这里**从新正文反解**再写，而不是"在旧数组上加减一个名字"
 *      （后者在"旧镜像本来就与正文不一致"时会把错的那份固化下来）。
 * 4. **走同一道归档守卫** —— 归档项目不可编辑（决策 133），与其它项目级写通道一致。
 *
 * ⚠️ **`metaOnly` 与正文长度无关**：不设上限（与模板那句"不限"一致）——
 *    它不吃截断配额（`sectionCharCount` 把整块剔除），写长没有副作用。
 * @param id - 项目 id。
 * @param title - 节名（**精确匹配**）。
 * @param spec - 新的规范正文。
 * @param truncate - 新的截断标记（该节是否参与自动截断归档）。
 * @returns 结果。
 */
export async function setSectionSpec(
  id: string,
  title: string,
  spec: string,
  truncate: boolean,
): Promise<EditResult> {
  const blocked = await guardProjectEditable(id)
  if (blocked !== null) return blocked

  const name = title.trim()
  if (name === '') return no('缺少节名。')

  const doc = await loadProjectDoc(id)
  if (doc === undefined) return no(`项目 \`${id}\` 不存在。`)

  const before = sectionSpecsOf(doc.narrative).find((s) => s.title === name)
  // ⚠️ **只调一次**（读 status 与 narrative 都从这一次拿）——调两次是白算一遍、
  //    且两处若传入参数不一致就会静默分叉（本项目"同一件事两条实现"的老坑）。
  const applied = setSectionSpecBlock(doc.narrative, name, spec, truncate)
  if (applied.status === 'no-section') {
    return no(`项目 \`${id}\` 的文档里没有「${name}」这一节（节名必须与正文的 \`## \` 标题逐字相同）。`)
  }
  if (applied.status === 'no-block') {
    // 🔴 与决策 207 一致：**不合成**。如实说明"为什么没有这个按钮该出现的地方"。
    //    ⚠️ 提示里那串围栏**不能写成字面量裸反引号**（本文件/上游对"裸围栏"有过教训）
    //       ⇒ 用 `\u0060` 转义写出来，读起来仍是三个反引号。
    return no(
      `「${name}」这一节**没有书写规范块**——本项目不会替已有文档合成规范` +
        '（不知道它该有哪几节，硬贴一份默认规范是主动误导）。' +
        '要给它加规范，请直接在该项目的交接文档里手写一个 \u0060\u0060\u0060memj:spec 围栏块。',
    )
  }
  if (before !== undefined && before.spec === spec.trim() && before.truncate === truncate) {
    return ok(`「${name}」的规范没有变化，未写入。`)
  }

  // 🔴🔴 **只换那一节的那个块** —— `setSectionSpecBlock()` 是**局部替换**：
  //    除目标块以外的字节**逐字不动**（含其它节、正文、封面）。
  //    ⚠️ 为什么不能用"整篇重渲染"：本项目吃过那个亏 —— `fixCoverBlock` 的头注释记着
  //       那次真实事故（整篇重渲染把**同文档里其它解析失败的块静默删掉**）。
  //    ⚠️ 也不能借 `mergeNarrative`：它的语义是"用补丁合并旧文档"，
  //       没写正文的节会被清空（"插入 ≠ 合并"，本项目已记过这条）。
  const narrative = applied.narrative

  const nowIso = new Date().toISOString()
  await writeProjectDoc(
    id,
    {
      ...doc.frontmatter,
      createdAt: (doc.frontmatter.createdAt ?? '') !== '' ? doc.frontmatter.createdAt : nowIso,
      updatedAt: nowIso,
      // ⭐ 边界 3：**从新正文反解**截断目标（正文权威），而不是在旧数组上加减。
      //    ⚠️ 旧镜像本来就与正文不一致时，"加减一个名字"会把错的那份固化下来。
      truncateSections: truncateTitlesFromBlocks(narrative),
    },
    narrative,
    doc.covers,
    doc.orphans,
  )
  await rebuildDerivedLayers()

  const marks: string[] = []
  if (before !== undefined && before.spec !== spec.trim()) {
    marks.push(`规范 ${[...before.spec].length} → ${[...spec.trim()].length} 字符`)
  }
  if (before !== undefined && before.truncate !== truncate) {
    marks.push(`可自动截断：${before.truncate ? '是' : '否'} → ${truncate ? '是' : '否'}`)
  }
  return ok(
    `已更新项目 \`${id}\` 的「${name}」规范${marks.length > 0 ? `（${marks.join('；')}）` : ''}。`,
  )
}

/**
 * ⭐ **项目改名**——**先建后删**（用户拍板："能改先改，主题先添加再删除"）。
 *
 * 🔴 **为什么不是"就地改 frontmatter"**：项目 id **同时是文件名与全部封面的引用键**
 *    （`HANDOFF-<id>.md`、封面的 `project` 字段、派生层里的归属）。
 *    就地改要同时动 N 处，中途失败会留下**半迁移状态**（既不在旧、也不在新）。
 *    ⇒ 改成：**把内容整体写到新 id → 校验 → 再删旧的**，任一步失败旧数据都在。
 * @param oldId - 现项目 id。
 * @param newId - 新项目 id。
 * @returns 结果。
 */
export async function renameProject(oldId: string, newId: string): Promise<EditResult> {
  const to = newId.trim()
  if (to === '') return no('新项目 id 不能为空。')
  if (to === oldId) return ok(`新旧 id 相同（\`${oldId}\`），未改动。`)

  // ⭐ 归档项目不可编辑（决策 133）——⚠️ 必须**在默认快照的存在性检查之前**，
  //    否则归档项目会先命中"项目不存在"（默认快照不含归档项目）⇒ 回执撒谎。
  const blocked = await guardProjectEditable(oldId)
  if (blocked !== null) return blocked

  const snapshot = await scanLibrary()
  if (!snapshot.projects.some((p) => p.id === oldId)) return no(`项目 \`${oldId}\` 不存在。`)
  if (snapshot.projects.some((p) => p.id === to)) {
    return no(`项目 \`${to}\` **已存在**——改名不能覆盖已有项目。请先确认目标 id，或先删/改那个项目。`)
  }

  const doc = await loadProjectDoc(oldId)
  if (doc === undefined) return no(`读不到项目文档 \`${oldId}\`。`)

  // ① 新项目文档：叙事与封面原样搬过去，只改 project 字段。
  const movedCovers: Cover[] = doc.covers.map((c) => ({ ...c, project: to }))
  await writeProjectDoc(
    to,
    { ...doc.frontmatter, project: to },
    doc.narrative,
    movedCovers,
    doc.orphans,
  )
  // ② 逐条同步正文 frontmatter（"两处都写"）。
  for (const c of movedCovers) {
    if (!c.ext) await syncEntryFrontmatter(c)
  }
  // ③ 确认新文档真的建好了，**再**删旧的（先建后删的关键）。
  const check = await loadProjectDoc(to)
  if (check === undefined || check.covers.length !== doc.covers.length) {
    return no(
      `**改名中止**：新项目文档 \`${to}\` 写入后核对不上（封面数 ${check?.covers.length ?? 0} ≠ ${doc.covers.length}）。\n` +
        '⚠️ **旧项目未删除**，数据没有丢——请检查库后重试。',
    )
  }
  await deleteProjectDoc(oldId)
  await rebuildDerivedLayers()
  return ok(`已把项目 \`${oldId}\` 改名为 \`${to}\`（${movedCovers.length} 张封面一并迁移，旧文档已删除）。`)
}

/**
 * 🔴 **删掉一个项目**（不可逆）。
 *
 * ⚠️ **旗下必须已无封面**——否则拒绝。
 * 理由：级联删知识是**不可逆的大面积损坏**；而"先把知识迁走/删掉，再删项目"
 * 只多一步，却随时可停。⇒ 默认站在**不毁数据**那侧（同决策 104 的偏置）。
 * @param id - 项目 id。
 * @returns 结果。
 */
export async function deleteProject(id: string): Promise<EditResult> {
  // ⭐ 归档项目不可编辑（决策 133）——同样**抢在默认快照的存在性检查之前**。
  const blocked = await guardProjectEditable(id)
  if (blocked !== null) return blocked

  const snapshot = await scanLibrary()
  if (!snapshot.projects.some((p) => p.id === id)) return no(`项目 \`${id}\` 不存在。`)
  const own = snapshot.covers.filter((c) => c.cover.project === id)
  if (own.length > 0) {
    return no(
      `项目 \`${id}\` 下还有 **${own.length} 条知识**，**拒绝删除**。\n` +
        '⚠️ 本项目**不级联删知识**——那会不可逆地毁掉这些内容。\n' +
        '请二选一：\n' +
        '  · 把它们**迁到别的项目**（改封面的 `project`）；\n' +
        '  · 或**逐条删除**这些 entry（各带一次确认）。\n' +
        `涉及：${own.slice(0, 5).map((c) => `\`${c.cover.id.slice(0, 8)}\``).join('、')}${own.length > 5 ? ` 等 ${own.length} 条` : ''}`,
    )
  }
  await deleteProjectDoc(id)
  await rebuildDerivedLayers()
  return ok(`已删除空项目 \`${id}\`。`)
}

// ══════════════════════════════════════════════════════════════════════════
// 三、主题
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ **改主题的显示名与描述**（决策 115）。
 *
 * 🔴 **"改名"改的是 `title`，不是 `theme`**（同项目：`theme` 是**所有封面的引用键**）。
 * ⚠️ 只改给的字段；`title` 允许清空。
 * @param id - 主题 id。
 * @param fields - 要改的字段（`title` / `desc`）。
 * @returns 结果。
 */
export async function setThemeFields(
  id: string,
  fields: { title?: string; desc?: string },
): Promise<EditResult> {
  const snapshot = await scanLibrary()
  if (!snapshot.themeIds.includes(id)) return no(`主题 \`${id}\` 不存在。`)
  const prior = await loadThemeFrontmatter(id)

  const nextTitle = fields.title !== undefined ? fields.title.trim() : undefined
  if (nextTitle !== undefined && [...nextTitle].length > 48) {
    return no(`主题名超长：${[...nextTitle].length} 字符（上限 48）。`)
  }
  const nextDesc = fields.desc !== undefined ? fields.desc.trim() : undefined
  if (nextDesc !== undefined) {
    if (nextDesc === '') return no('主题描述不能为空。')
    if ([...nextDesc].length > 200) return no(`主题描述超长：${[...nextDesc].length} 字符（上限 200）。`)
  }
  if (nextTitle === undefined && nextDesc === undefined) {
    return ok(`主题 \`${id}\` 没有需要改的字段。`)
  }

  const changed: string[] = []
  if (nextTitle !== undefined && nextTitle !== (prior?.title ?? '')) {
    changed.push(`title: ${(prior?.title ?? '') === '' ? '(未设置)' : `「${prior?.title}」`} → ${nextTitle === '' ? '(已清空)' : `「${nextTitle}」`}`)
  }
  if (nextDesc !== undefined && nextDesc !== (prior?.desc ?? '')) changed.push('desc 已更新')
  if (changed.length === 0) return ok(`主题 \`${id}\` 没有需要改的字段（值都相同）。`)

  const covers = snapshot.covers.filter((c) => c.cover.theme.includes(id)).map((c) => c.cover)
  const projectIds = [...new Set(covers.map((c) => c.project).filter((p) => p !== ''))]
  await writeThemeDoc(
    id,
    nextDesc ?? (prior?.desc ?? ''),
    covers,
    projectIds.map((p) => ({ id: p, desc: snapshot.projects.find((x) => x.id === p)?.frontmatter.desc ?? '' })),
    // ⭐ **显式改** ⇒ 以传入值为准（`writeThemeDoc` 默认会"保留旧值"给 rebuild 用）。
    true,
    nextTitle,   // ⭐ 显示名：给了就用它（含空串=清空）
    // ⭐ 时间（决策 119）：显式刷新 `updatedAt`（`createdAt` 由 `writeThemeDoc` 继承）。
    new Date().toISOString(),
  )
  return ok(`已更新主题 \`${id}\`：\n` + changed.map((s) => `  · ${s}`).join('\n'))
}

/**
 * **改主题描述**（`desc`）——`setThemeFields` 的薄包装（保留旧调用点）。
 * @param id - 主题 id。
 * @param desc - 新描述（≤200 字符）。
 * @returns 结果。
 */
export async function setThemeDesc(id: string, desc: string): Promise<EditResult> {
  return await setThemeFields(id, { desc })
}

/**
 * ⭐ **主题改名**——**先建后删**（同 `renameProject` 的理由）。
 *
 * 主题是封面的 `theme` 数组里的**引用键** ⇒ 改名要把所有引用它的封面一并换掉。
 * @param oldId - 现主题 id。
 * @param newId - 新主题 id。
 * @returns 结果。
 */
export async function renameTheme(oldId: string, newId: string): Promise<EditResult> {
  const to = newId.trim()
  if (to === '') return no('新主题 id 不能为空。')
  if (to === oldId) return ok(`新旧 id 相同（\`${oldId}\`），未改动。`)

  const snapshot = await scanLibrary()
  if (!snapshot.themeIds.includes(oldId)) return no(`主题 \`${oldId}\` 不存在。`)
  if (snapshot.themeIds.includes(to)) {
    return no(`主题 \`${to}\` **已存在**——改名不能覆盖。请先确认目标 id，或先删/改那个主题。`)
  }

  // ① 保留原 desc 与显示名（THEME 文档里它们没有别的来源，§4.3）。
  const prior = await loadThemeFrontmatter(oldId)
  const desc = prior?.desc ?? ''
  const title = prior?.title ?? ''

  // ② 把所有引用旧 id 的封面改成新 id（按项目分组写回）。
  const affected = snapshot.covers.filter((c) => c.cover.theme.includes(oldId))
  const byProject = new Map<string, Cover[]>()
  for (const c of affected) {
    const list = byProject.get(c.cover.project)
    if (list === undefined) byProject.set(c.cover.project, [c.cover])
    else list.push(c.cover)
  }
  for (const [projectId, list] of byProject) {
    if (projectId === '') continue
    const doc = await loadProjectDoc(projectId)
    if (doc === undefined) continue
    const next = doc.covers.map((c) =>
      c.theme.includes(oldId) ? { ...c, theme: [...new Set(c.theme.map((t) => (t === oldId ? to : t)))] } : c,
    )
    await writeProjectDoc(projectId, doc.frontmatter, doc.narrative, next, doc.orphans)
    for (const c of next) {
      if (c.theme.includes(to) && !c.ext) await syncEntryFrontmatter(c)
    }
  }

  // ③ 建新主题文档 → 核对 → 删旧的（先建后删）。
  //    ⚠️ **显示名要一并带过去**（决策 115），否则改名会把主题名丢掉。
  await writeThemeDoc(to, desc, [], [], false, title)
  await rebuildDerivedLayers()
  const after = await scanLibrary()
  if (!after.themeIds.includes(to)) {
    return no(`**改名中止**：新主题 \`${to}\` 未能建立。⚠️ 旧主题未删，请检查库后重试。`)
  }
  const stillOld = after.covers.filter((c) => c.cover.theme.includes(oldId)).length
  if (stillOld > 0) {
    return no(
      `**改名中止**：仍有 ${stillOld} 张封面指向旧主题 \`${oldId}\`。\n` +
        '⚠️ 未删除旧主题文档，请检查后重试。',
    )
  }
  await deleteThemeDoc(oldId)
  await rebuildDerivedLayers()
  return ok(`已把主题 \`${oldId}\` 改名为 \`${to}\`（${affected.length} 张封面的引用一并更新，旧主题文档已删除）。`)
}

/**
 * 🔴 **删掉一个主题**（不可逆）。
 *
 * ⚠️ **旗下必须已无封面**——同 `deleteProject` 的理由（不级联）。
 * ⚠️ 主题是**派生层**：光删 `THEME-*.md` 没用，只要还有封面提它就会被重建回来
 * ——所以本函数**强制要求先摘干净引用**。
 * @param id - 主题 id。
 * @returns 结果。
 */
export async function deleteTheme(id: string): Promise<EditResult> {
  const snapshot = await scanLibrary()
  if (!snapshot.themeIds.includes(id)) return no(`主题 \`${id}\` 不存在。`)
  const users = snapshot.covers.filter((c) => c.cover.theme.includes(id))
  if (users.length > 0) {
    return no(
      `主题 \`${id}\` 还被 **${users.length} 张封面**引用着，**拒绝删除**。\n` +
        '⚠️ 主题只是**派生索引**——不摘干净引用，删了也会被下次重建带回来。\n' +
        '请先摘除这些引用（每条改封面的 `theme`），再删主题。\n' +
        `涉及：${users.slice(0, 5).map((c) => `\`${c.cover.id.slice(0, 8)}\``).join('、')}${users.length > 5 ? ` 等 ${users.length} 条` : ''}`,
    )
  }
  await deleteThemeDoc(id)
  await rebuildDerivedLayers()
  return ok(`已删除空主题 \`${id}\`。`)
}
