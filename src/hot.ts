/**
 * ⭐⭐ **热知识注入的数据层**（热知识方案 §5）。
 *
 * ── 它是什么 ────────────────────────────────────────────────────────────────
 * 把"**与该会话相关的知识**（封面 / 正文）按会话推送给模型"这件事所需的
 * **人侧设置**收在一处：画像、逐条设置、项目清单、会话绑定。
 *
 * ── 为什么单独一个模块 ──────────────────────────────────────────────────────
 * ① **职责单一**：它只管"读 / 写 / 归一化 `hot/` 下的四个 JSON"，
 *    **不做判定、不做渲染、不碰会话** ⇒ 可单测、无副作用；
 * ② 🔴 **这些文件不是知识**（不属于"封面 + 正文"模型）——
 *    放进 `store.ts` 会让"store 只管库里内容"这条边界模糊；
 * ③ ⭐ 判定（§7）、渲染（§6）、注入（§6.2）都要读它 ⇒ **只能有一份实现**
 *    （本项目铁律：**一套逻辑两处入口，实现只留一份**）。
 *
 * ── 🔴 四条设计约束（都来自方案，改动前先读）────────────────────────────────
 * 1. **缺省 = 不纳入**（裁定 H-1）：`entries.json` 里没有的条目**一律不注入**。
 *    理由：本项目自己有 140+ 张封面，一开就爆预算。
 * 2. **画像可以有多条**（用户第二轮要求"保存后加入列表"）⇒ 是数组，不是单文件。
 * 3. **`entries.json` 与 `selection.json` 正交**（跨项目属性 vs 逐项目清单）。
 * 4. 🔴 **一切读取都容错**：库是用户可手改的，任一文件坏掉**不该让插件挂**
 *    ⇒ 解析失败时**退化为空结构**（并**不静默**：由调用方在页面/回执上说明）。
 *
 * @module dsh-memj/hot
 */

import {
  hotDir,
  hotEntriesPath,
  hotPersonaPath,
  hotSelectionPath,
  hotSessionsPath,
} from './paths.ts'
import { ensureDir, readTextIfExists, writeTextAtomic } from './files.ts'
import {
  HOT_PROJECT_UNKNOWN,
  type HotChannel,
  type HotEntriesFile,
  type HotEntrySetting,
  type HotPersonaFile,
  type HotPersonaItem,
  type HotProjectEntry,
  type HotProjectSelection,
  type HotSelectionFile,
  type HotSessionBinding,
  type HotSessionsFile,
  type HotShape,
} from './schema.ts'

/** 当前文件格式版本（与 `hot/` 下四个文件共用）。 */
export const HOT_FILE_VERSION = 1

/** 设置所属的层（⚠️ **2026-09-22 后只有 `global` 会落到 `entries.json`**）。 */
export type HotLayer = 'global' | 'project' | 'theme'

/**
 * ⭐⭐ 一条**全局知识**设置的默认值。
 *
 * | 层 | 缺省 | 为什么 |
 * |---|---|---|
 * | **全局** | ✅ **纳入** | ⭐ **用户最初的需求原话**：「**global 为 true 的知识条目，应该是所有主题都会注入的**」。<br>⚠️ 且全局条目按定义就是"所有会话都该看到"的（数量极少，不会撑爆预算）。 |
 *
 * 🔴🔴 **历史与收窄（两个阶段，都要记住）**：
 * 1. **第一阶段**：本函数**按层返回不同缺省**（项目/主题层 = 不纳入，裁定 H-1）。
 * 2. **第二阶段（2026-09-22，用户裁定）**：🔴 **项目/主题知识不再走本结构**
 *    ⇒ 它们存进 `selection.json`，而**"在清单里 = 会注入"**（没有 `on` 这个字段）。
 *    ⇒ ⚠️ **`layer` 参数保留只为兼容调用点的签名**，值不再影响结果。
 *
 * ⭐ **为什么项目层不该有"缺省不纳入"**：H-1 的本意是
 * "**项目层有 140+ 条、一开就爆预算**"——而候选集**已经被项目清单限住了**
 * （默认清单最多 15 条）⇒ 那个担忧在清单这一层**早已被解决**，
 * 再叠一道 `on` 只会造成"**选了却不生效**"（实测：选中 11 条、注入 0 条）。
 *
 * ⚠️ **显式值永远优先**：`entries.json` 里存了 `on: false` 就是 false
 * （缺省只在"这条**没有任何记录**"时生效）。
 * @param layer - ⚠️ **已不再影响返回值**（保留只为签名兼容，见上）。
 * @returns 全局知识条目的默认设置。
 */
export function defaultEntrySetting(layer: HotLayer = 'global'): HotEntrySetting {
  void layer
  return { on: true, channel: 'inbox', shape: 'meta' }
}

/**
 * 容错解析一个 JSON 文件。
 *
 * 🔴 **为什么吞掉异常**：库可手改 ⇒ 一个坏文件不该让整个插件/页面挂掉。
 * ⚠️ 但**不静默**：坏掉时返回 `undefined`，由调用方决定怎么告知人。
 * @param path - 文件绝对路径。
 * @returns 解析结果；文件不存在或解析失败时 `undefined`。
 */
async function readJson<T>(path: string): Promise<T | undefined> {
  const text = await readTextIfExists(path)
  if (text === undefined || text.trim() === '') return undefined
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed === null || typeof parsed !== 'object') return undefined
    return parsed as T
  } catch {
    return undefined
  }
}

/** 写一个 JSON 文件（**原子写** + 末尾换行，便于人查看与 git 版本维护）。 */
async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(hotDir())
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`)
}

// ───────────────────────────────────────────────────────────────────────────
// ① 用户画像（`hot/persona.json`，**多条**）
// ───────────────────────────────────────────────────────────────────────────

/** 画像的默认通道——⚠️ 画像**可以用 `section`**（方案 §3.2：它是"所有会话一样"的内容）。 */
const PERSONA_DEFAULT_CHANNEL: HotChannel = 'inbox'

/**
 * 读全部画像条目（**保序**）。
 *
 * ⚠️ **不做任何过滤**——`on: false` 的也返回（页面要显示它、允许再次打开）。
 * 过滤由调用方（渲染层）按 `on` 做。
 * @returns 画像条目数组；文件缺失/损坏时为空数组。
 */
export async function loadPersona(): Promise<HotPersonaItem[]> {
  const file = await readJson<HotPersonaFile>(hotPersonaPath())
  if (file === undefined || !Array.isArray(file.items)) return []
  const out: HotPersonaItem[] = []
  for (const raw of file.items) {
    if (raw === null || typeof raw !== 'object') continue
    const it = raw as Partial<HotPersonaItem>
    // ⚠️ 只认**形状完整**的条目：缺 id 或 text 的丢弃（避免下游到处判空）。
    if (typeof it.id !== 'string' || it.id === '') continue
    if (typeof it.text !== 'string') continue
    out.push({
      id: it.id,
      text: it.text,
      on: it.on !== false,
      channel: it.channel === 'section' ? 'section' : PERSONA_DEFAULT_CHANNEL,
      createdAt: typeof it.createdAt === 'string' ? it.createdAt : '',
      updatedAt: typeof it.updatedAt === 'string' ? it.updatedAt : '',
    })
  }
  return out
}

/** 覆盖写全部画像条目。 */
export async function savePersona(items: readonly HotPersonaItem[]): Promise<void> {
  await writeJson(hotPersonaPath(), { version: HOT_FILE_VERSION, items: [...items] } satisfies HotPersonaFile)
}

/**
 * 生成一个画像条目 id（本地即可，**不必**是封面 UUID）。
 * ⚠️ 前缀 `p-` 让它一眼区别于封面 id（后者是纯 UUID）。
 * @returns 新 id。
 */
export function newPersonaId(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `p-${Date.now().toString(36)}${rand}`
}

// ───────────────────────────────────────────────────────────────────────────
// ② 逐条设置（`hot/entries.json`）
// ───────────────────────────────────────────────────────────────────────────

/**
 * 读全部**全局知识**的逐条设置（**原样返回**，不补默认值——补默认由 `settingOf` 做）。
 *
 * ⚠️ **2026-09-22 起本表只服务全局层**（见 `HotEntrySetting` 的注释）。
 * 旧文件里项目/主题条目的记录**仍会被读出来**，但 `collectHotItems` 不再消费它们
 * ⇒ 无害残留。
 *
 * 🔴🔴 **这些残留【不会被自动清理】**（用户 2026-09-22 裁定的"惰性"同一条：
 * **读操作不该有副作用**）⇒ `entries.json` 里会**长期**留着那几条不再生效的记录。
 * ⚠️ **所以"entries.json 里有 5 条"不等于"有 5 条在生效"**——
 * 实测：5 条里 **4 条是残留**（2 条 history 条目 + 2 条别的项目的知识），
 * 真正起作用的只有那 1 条 `global: true` 的。
 * ⭐ 要看"到底哪几条在生效"，**看 `GET /hot/global`**（那是人侧接口，已按新逻辑过滤）。
 * ⚠️ **为什么留着不删**：用户回滚到旧版本时还要用（旧代码会把它们当有效设置读）。
 */
export async function loadEntrySettings(): Promise<Record<string, HotEntrySetting>> {
  const file = await readJson<HotEntriesFile>(hotEntriesPath())
  if (file === undefined || file.entries === null || typeof file.entries !== 'object') return {}
  const out: Record<string, HotEntrySetting> = {}
  for (const [id, raw] of Object.entries(file.entries)) {
    if (raw === null || typeof raw !== 'object') continue
    const v = raw as Partial<HotEntrySetting>
    out[id] = {
      on: v.on === true,
      channel: v.channel === 'section' ? 'section' : 'inbox',
      shape: v.shape === 'full' ? 'full' : 'meta',
    }
  }
  return out
}

/**
 * ⭐ 取某一**条**的设置；**没有记录 ⇒ 返回"不纳入"的默认值**（裁定 H-1）。
 * @param all - 已读出的全部设置。
 * @param entryId - 封面 id。
 * @param layer - ⚠️ **已不再影响结果**（保留只为签名兼容，见 `defaultEntrySetting`）。
 * @returns 该条的设置（永远是完整形状）。
 */
export function settingOf(
  all: Readonly<Record<string, HotEntrySetting>>,
  entryId: string,
  layer: HotLayer = 'global',
): HotEntrySetting {
  return all[entryId] ?? defaultEntrySetting(layer)
}

/** 覆盖写全部逐条设置。 */
export async function saveEntrySettings(
  entries: Readonly<Record<string, HotEntrySetting>>,
): Promise<void> {
  await writeJson(hotEntriesPath(), {
    version: HOT_FILE_VERSION,
    entries: { ...entries },
  } satisfies HotEntriesFile)
}

// ───────────────────────────────────────────────────────────────────────────
// ③ 项目清单（`hot/selection.json`）
// ───────────────────────────────────────────────────────────────────────────

/**
 * 读全部项目清单（**含旧结构自动迁移**）。
 *
 * 🔴🔴 **2026-09-22 结构变更**：`entryIds: string[]` → `entries: HotProjectEntry[]`。
 * 迁移规则（**读时惰性迁移**，不单独写迁移脚本）：
 *
 * | 旧字段 | 新归属 |
 * |---|---|
 * | `entryIds[i]` | `entries[i].id`，`shape` 取 `'meta'`、`pinnedAt` 取 `''` |
 * | `entries.json[封面id].shape` | ⚠️ **不迁移**——旧值是按"知识自己的属性"设的， |
 * | `entries.json[封面id].pinnedAt` | 而新语义是"逐项目" ⇒ 搬过来等于**替用户做决定** |
 *
 * ⚠️ **为什么 shape 不迁移**：旧 `shape` 只对**全局知识**有意义（旧设计里项目层
 * 因 `on` 缺省 `false` 而**从未真正注入过**，所以它们的 `shape` 也从未生效）
 * ⇒ 项目层一律以 `'meta'` 起步，等用户在项目页显式改成正文形态。
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 🔴🔴 **"惰性"的确切含义：只读时【不回写磁盘】。这是用户 2026-09-22 的裁定。**
 *
 * 后果（**有意如此，别当 bug 去"修"**）：
 * - **只要用户不动这个项目的清单** ⇒ `selection.json` **会一直保持旧结构**
 *   （`entryIds: string[]`），程序照样读得对；
 * - 一旦发生**任何写**（置顶 / 切形态 / 加入 / 移出 / 生成默认清单）⇒
 *   `saveSelections()` 用**新结构**覆盖整个文件，那一刻它才落盘。
 *
 * ⚠️ **为什么当初考虑过"读到就落盘"又否掉了**：
 * > 那样**肉眼可验证**（用户能直接看到文件变了），但代价是
 * > **一次纯读取动作会改用户的库文件** —— 与"只读不写"的直觉相反，
 * > 而且用户若回滚到旧版本，会看到一份它读不懂的结构。
 * ⇒ ⭐ **判据：读操作不该有副作用**（用户选了这个）。
 *
 * 🔴🔴 **所以"文件还是旧的"≠"迁移没生效"** —— 这两件事要分清：
 * | 你想知道 | 看哪里 |
 * |---|---|
 * | 迁移生效了吗 | **`GET /hot/selection` 的 `entries` 字段**（人侧接口，已归一） |
 * | 文件落盘了吗 | `selection.json` 的 mtime 与内容（**只写时才变**） |
 * ⚠️ 实测踩到：用户看到"库根的 entries/selection 还是没变化"而怀疑迁移没跑
 * —— 真相是**磁盘本来就不该变**（且当时 3096 还跑着旧代码，见下）。
 *
 * ⚠️ **另一个容易误判的点**：这个文件是**服务端**读的 ⇒
 * 改了 `hot.ts` **必须重启实例**才生效（进程启动时就 import 完了）。
 * 旧进程读到的仍是旧逻辑 ⇒ **接口也回旧结构**（有 `entryIds`、没有 `entries`）。
 * ⭐ 判据：**先看接口回的是哪个结构**，再判断"迁移到底跑没跑"。
 */
export async function loadSelections(): Promise<Record<string, HotProjectSelection>> {
  const file = await readJson<HotSelectionFile>(hotSelectionPath())
  if (file === undefined || file.projects === null || typeof file.projects !== 'object') return {}
  const out: Record<string, HotProjectSelection> = {}
  for (const [pid, raw] of Object.entries(file.projects)) {
    if (raw === null || typeof raw !== 'object') continue
    const v = raw as Partial<HotProjectSelection> & { entryIds?: unknown }
    // ── 新结构：`entries` 数组 ──
    let entries: HotProjectEntry[] = []
    if (Array.isArray(v.entries)) {
      for (const e of v.entries) {
        if (e === null || typeof e !== 'object') continue
        const it = e as Partial<HotProjectEntry>
        if (typeof it.id !== 'string' || it.id === '') continue
        entries.push({
          id: it.id,
          shape: it.shape === 'full' ? 'full' : 'meta',
          pinnedAt: typeof it.pinnedAt === 'string' ? it.pinnedAt : '',
        })
      }
    } else if (Array.isArray(v.entryIds)) {
      // ── 旧结构：`entryIds: string[]` ⇒ 迁移（见上方注释） ──
      entries = v.entryIds
        .filter((x): x is string => typeof x === 'string' && x !== '')
        .map((id) => ({ id, shape: 'meta' as HotShape, pinnedAt: '' }))
    }
    out[pid] = {
      entries,
      initializedAt: typeof v.initializedAt === 'string' ? v.initializedAt : '',
    }
  }
  return out
}

/** 覆盖写全部项目清单。 */
export async function saveSelections(
  projects: Readonly<Record<string, HotProjectSelection>>,
): Promise<void> {
  await writeJson(hotSelectionPath(), {
    version: HOT_FILE_VERSION,
    projects: { ...projects },
  } satisfies HotSelectionFile)
}

// ───────────────────────────────────────────────────────────────────────────
// ④ 会话绑定（`hot/sessions.json`）
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⭐ **保留多少个会话绑定**（裁定 H-4：留最新 50 个，按最新活跃时间倒序淘汰）。
 *
 * 🔴 **淘汰只动这个文件，绝不删 DSH 的会话数据**——
 * 官方持久化层**根本没有删除接口**（README 明文 "Nothing deletes session files"），
 * 归档也只是不可逆的显示过滤 ⇒ 我们更不该越界删用户的会话。
 */
export const HOT_SESSION_KEEP = 50

/** 读会话绑定文件的**完整内容**（含三个判定开关）。 */
export async function loadSessionsFile(): Promise<HotSessionsFile> {
  const file = await readJson<HotSessionsFile>(hotSessionsPath())
  const sessions: Record<string, HotSessionBinding> = {}
  if (file !== undefined && file.sessions !== null && typeof file.sessions === 'object') {
    for (const [sid, raw] of Object.entries(file.sessions)) {
      if (raw === null || typeof raw !== 'object') continue
      const v = raw as Partial<HotSessionBinding>
      if (typeof v.project !== 'string' || v.project === '') continue
      const src = v.source
      sessions[sid] = {
        project: v.project,
        // ⚠️ 认四个合法来源；**认不出的一律归 `doc-reads`**（历史行为）。
        //    🔴 别把 `inherited` 漏在这里 —— 漏了它会被静默改写成 `doc-reads`，
        //       于是 UI 会**撒谎**说"这个子会话自己读过项目文档"。
        source: src === 'llm' || src === 'manual' || src === 'inherited' ? src : 'doc-reads',
        boundAt: typeof v.boundAt === 'string' ? v.boundAt : '',
        lastActiveAt: typeof v.lastActiveAt === 'string' ? v.lastActiveAt : '',
      }
    }
  }
  const m = file?.detectLlmModel
  return {
    version: HOT_FILE_VERSION,
    // ① 强判定**默认开**（方案 §7.2）；② 默认关（会花钱）。
    detectDocReads: file?.detectDocReads !== false,
    detectLlm: file?.detectLlm === true,
    detectLlmModel:
      m !== null && m !== undefined && typeof m.provider === 'string' && typeof m.model === 'string'
        ? { provider: m.provider, model: m.model }
        : null,
    sessions,
  }
}

/** 覆盖写会话绑定文件。 */
export async function saveSessionsFile(file: HotSessionsFile): Promise<void> {
  await writeJson(hotSessionsPath(), {
    version: HOT_FILE_VERSION,
    detectDocReads: file.detectDocReads,
    detectLlm: file.detectLlm,
    detectLlmModel: file.detectLlmModel,
    sessions: file.sessions,
  } satisfies HotSessionsFile)
}

/**
 * ⭐⭐ **按最新活跃时间淘汰**，只留最新 `keep` 个（裁定 H-4）。
 *
 * 🔴 **纯函数**（不碰磁盘）⇒ 可单测；且**只处理这个文件的数据**，
 * 与 DSH 的会话存储无关。
 *
 * ⚠️ **排序判据是 `lastActiveAt` 倒序**；空串（从未记过）排最后。
 * @param sessions - 全部绑定。
 * @param keep - 保留条数（默认 `HOT_SESSION_KEEP`）。
 * @returns 淘汰后的新对象 + 被丢弃的会话 id 列表。
 */
export function pruneSessions(
  sessions: Readonly<Record<string, HotSessionBinding>>,
  keep: number = HOT_SESSION_KEEP,
): { kept: Record<string, HotSessionBinding>; dropped: string[] } {
  const ids = Object.keys(sessions)
  if (ids.length <= keep) return { kept: { ...sessions }, dropped: [] }
  // ⚠️ 空串排最后（`localeCompare` 下 `''` 自然最小 ⇒ 降序时在末尾，正好）。
  const sorted = [...ids].sort((a, b) => {
    const av = sessions[a]?.lastActiveAt ?? ''
    const bv = sessions[b]?.lastActiveAt ?? ''
    return bv.localeCompare(av)
  })
  const keptIds = sorted.slice(0, keep)
  const dropped = sorted.slice(keep)
  const kept: Record<string, HotSessionBinding> = {}
  for (const id of keptIds) {
    const v = sessions[id]
    if (v !== undefined) kept[id] = v
  }
  return { kept, dropped }
}

/**
 * ⭐ **记一次"这个会话还活跃"**（写 `lastActiveAt`）。
 *
 * 🔴 **为什么要有**：`Session` 上**没有任何"最后活跃"字段**（已核实），
 * 而裁定 H-4 要按最新活跃时间淘汰 ⇒ 只能**我们在真的跑过时**写一笔。
 * ⚠️ **不新建绑定**：只更新**已存在**的绑定（没有绑定就什么都不做）——
 * 否则会把每个路过的会话都记进来（那正是要淘汰的东西）。
 * @param sessionId - 会话 id。
 * @param nowIso - 当前时间（ISO；注入便于测试）。
 * @returns 是否发生了更新。
 */
export async function touchSession(sessionId: string, nowIso: string): Promise<boolean> {
  const file = await loadSessionsFile()
  const cur = file.sessions[sessionId]
  if (cur === undefined) return false
  cur.lastActiveAt = nowIso
  await saveSessionsFile(file)
  return true
}

/**
 * ⭐ 写一个会话的**绑定**（并顺手淘汰超量的旧绑定）。
 * @param sessionId - 会话 id。
 * @param binding - 绑定内容。
 */
export async function setSessionBinding(
  sessionId: string,
  binding: HotSessionBinding,
): Promise<{ dropped: string[] }> {
  const file = await loadSessionsFile()
  file.sessions[sessionId] = binding
  const { kept, dropped } = pruneSessions(file.sessions)
  file.sessions = kept
  await saveSessionsFile(file)
  return { dropped }
}

/**
 * ⭐ 取一个会话的绑定（**不落盘、不新建**）。
 * @param sessionId - 会话 id。
 * @returns 绑定；没有则 `undefined`。
 */
export async function getSessionBinding(
  sessionId: string,
): Promise<HotSessionBinding | undefined> {
  const file = await loadSessionsFile()
  return file.sessions[sessionId]
}

/** ⭐ 便捷：`未知` 常量（判定失败时的统一取值）。 */
export { HOT_PROJECT_UNKNOWN }
export type { HotEntrySetting, HotPersonaItem, HotProjectSelection, HotSessionBinding, HotShape, HotChannel }
