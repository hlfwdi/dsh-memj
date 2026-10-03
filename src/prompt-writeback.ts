/**
 * ⭐⭐⭐ **写回源码**：把【提示词】设置页的当前生效文本，固化进 `src/*.ts` 的常量。
 *
 * ── 这个功能解决什么 ────────────────────────────────────────────────────────
 * 运行期取值的优先级是 `覆盖值 ?? 源码默认值`（见 `prompts.ts` 的 `promptText`）。
 * ⇒ 页面上改的东西**只活在库里的 `overrides.json`**：
 *   · 换机器 / 拷库漏了 → 丢；
 *   · 点「恢复默认」→ **静默退回旧措辞**；
 *   · 想给别人 → 得手工抄。
 * ⇒ 本模块把编辑**固化回源码**，让它进版本库、成为新的默认值。
 *
 * 🔴🔴 **它不改变任何运行时行为**（2026-10-12 用户确认的判据）：
 *   运行期永远读覆盖层 ⇒ 写回**不需要重启即已"生效"**（本来就在生效）。
 *   它改变的是**"这条编辑的归属"**——从库里的临时覆盖，变成源码里的正式默认值。
 *   ⚠️ 所以界面上的措辞必须说清这一点，**不要让用户以为"不重启就没生效"**。
 *   ⭐ 唯一的例外是**命令描述**（`hotReload: 'restart'`）：它**本来就要重启才生效**
 *     （`dsh-commands` 注册时固化 descriptor，没有 getter 通路）。
 *
 * 🔴 **保留覆盖项**（用户 2026-10-12 裁定）：写回后**不删** `overrides.json` 里那条。
 *   理由：写回是"固化"，不是"撤掉覆盖"。删了会让生效来源突然切换
 *   （虽然文本相同、行为一样，但"我在页面上改的那个值还在不在"会变得难以回答）。
 *   ⚠️ 代价：下次改**源码**时，覆盖项仍会挡住它 ⇒ 界面必须显示三态让这件事可见
 *     （`未改` / `已改未写回` / `已写回`）。
 *
 * ⚠️ **它写的是插件仓，不是库**——与本项目"用户数据只进库根"的边界相反。
 *   这是**有意的例外**：本功能的语义就是"把库里的编辑搬进交付物"。
 *   因此它**只在用户点按钮时**发生，**绝不自动**。
 *
 * @module dsh-memj/prompt-writeback
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pluginRoot } from './paths.ts'
import { PROMPT_SPECS, hasOverride, promptCurrent } from './prompts.ts'
import { writeTextAtomic } from './files.ts'

/** 一次写回的结果（逐条）。 */
export interface WriteBackItem {
  key: string
  /** 结果状态。 */
  status:
    /** ✅ 已写入源码。 */
    | 'written'
    /** ⏭️ 源码里的值与当前值**已经相同**，无需写。 */
    | 'already-same'
    /** 🔴 该条**不支持写回**（没有 `sourceConst`）。 */
    | 'unsupported'
    /** 🔴 定位不到常量（源码被改过 / 命名变了）。 */
    | 'not-found'
    /** 🔴 值形态不是可替换的单字符串。 */
    | 'bad-form'
    /** 🔴 写盘失败。 */
    | 'error'
  /** 人可读的说明。 */
  message: string
  /** 源码文件（相对仓根）。 */
  file?: string
  /** 常量名。 */
  constName?: string
}

/** 整次写回的结果。 */
export interface WriteBackResult {
  ok: boolean
  items: WriteBackItem[]
  /** 实际改动的文件数。 */
  filesChanged: number
  /** 汇总一句话（回执用）。 */
  summary: string
}

/** 反引号（避免在模板串里直接写它）。 */
const BT = String.fromCharCode(96)

/**
 * 把文本转义成可放进**字符串字面量**的形式。
 *
 * ⚠️ **按引号类型分叉**（两者的危险字符不同，转义规则不能混）：
 *   · **模板串**：`\` 反斜杠、`` ` `` 反引号（会提前闭合）、`${`（会被当插值）；
 *   · **单引号串**：`\` 反斜杠、`'` 单引号、**换行**（单引号串不能跨行 ⇒ 必须转成 `\n`）。
 * ⚠️ 顺序重要：**先反斜杠**，否则后两步新引入的反斜杠会被二次转义。
 * @param text - 原文本。
 * @param quote - 目标引号（`` ` `` 或 `'`）。
 * @returns 可安全嵌入该字面量的文本。
 */
function escapeForLiteral(text: string, quote: string): string {
  let out = text.replace(/\\/g, '\\\\')
  if (quote === BT) {
    out = out.replace(new RegExp(BT, 'g'), '\\' + BT).replace(/\$\{/g, '\\${')
  } else {
    out = out.replace(/'/g, "\\'").replace(/\n/g, '\\n')
  }
  return out
}

/**
 * 在源码里定位一个「字符串常量」的值正文范围——支持**三种**实际形态。
 *
 * ── 实测遇到的三种形态（`src/` 里真实存在）────────────────────────────────
 * 1. **模板串**：`export const X = \`...\``（`protocol.ts` / `tool-descriptions.ts` …）
 * 2. **单引号串**：`export const X = '...'`
 * 3. ⭐ **值在下一行**：`export const X =\n  '...'`
 *    ⚠️ 这是**实测踩到的真 bug**：第一版正则要求 `=` 后**紧跟**引号，
 *    于是 `active-recall.ts` 里那几条（`JEV_NEED_INSTRUCTION` 等）**永远定位不到**，
 *    写回直接报 `not-found`。
 *
 * ⚠️ **不用正则跨行匹配正文**：正文里可能含转义引号（`\'` / `` \` ``），
 *   正则会**提前收尾**（本项目记过这个坑：`indexOf` 找收尾遇到转义反引号
 *   会截断错位、报出"7 处不一致"的假漂移）⇒ 必须**逐字符扫描并跳过转义**。
 *
 * ⚠️ **只支持单段字面量**：形如 `'a' + 'b'` 的多段拼接**不支持**
 *   （替换它要重排多行、风险高）⇒ 返回 `undefined`，由调用方报"不支持写回"，
 *   **绝不半改**（改一半会让源码语法坏掉）。
 * @param src - 源文件全文（已把 CRLF 归一为 LF）。
 * @param constName - 常量名。
 * @returns `{ bodyStart, bodyEnd, quote }`——正文首尾下标与引号字符；不支持 ⇒ `undefined`。
 */
export function locateTemplateBody(
  src: string,
  constName: string,
): { bodyStart: number; bodyEnd: number; quote: string } | undefined {
  // ⚠️ 允许 `=` 与值之间**有换行与空白**（形态 3）。
  const headRe = new RegExp(
    '(?:^|\\n)(?:export )?const ' + constName + '\\s*(?::[^=\\n]+)?=\\s*',
  )
  const m = headRe.exec(src)
  if (m === null) return undefined
  let i = m.index + m[0].length
  // 跳过换行/缩进（形态 3）
  while (i < src.length && (src[i] === ' ' || src[i] === '\t' || src[i] === '\n' || src[i] === '\r')) i += 1
  const quote = src[i]
  if (quote !== BT && quote !== "'") return undefined // 不是字符串字面量（数组/对象/其它）
  const bodyStart = i + 1
  // 逐字符找**未转义**的同种引号收尾
  let j = bodyStart
  while (j < src.length) {
    const ch = src[j]
    if (ch === '\\') { j += 2; continue } // 跳过被转义的字符
    if (ch === quote) {
      // ⭐ **检查是不是"多段拼接"**：引号之后（跳过空白/换行）若是 `+` ⇒ 不支持。
      let k = j + 1
      while (k < src.length && /\s/.test(src[k] ?? '')) k += 1
      if (src[k] === '+') return undefined
      return { bodyStart, bodyEnd: j, quote }
    }
    if (ch === '\n') {
      // 单引号串不允许跨行（模板串可以）——遇到换行还没收尾 ⇒ 形态不支持。
      if (quote === "'") return undefined
    }
    j += 1
  }
  return undefined
}

/**
 * 把**字面量正文**还原成运行时文本（反转义）。
 *
 * ⚠️ 必须还原，否则"源码里的值 vs 当前值"比较会**永远不相等**，
 *   于是每次写回都重写文件（幂等性坏掉、且 `already-same` 永不触发）。
 *
 * 🔴🔴 **反转义必须按 JS 的规则做，不能只处理自己转义的那几个字符**：
 *   源码里本来就可能含 `\n`（转义的换行，非模板串形态常见）——
 *   若不还原它，比较时会把"一个换行"与"两个字符 `\` `n`"判成不同 ⇒ **假不等**。
 *   ⭐ 判据：**转义/反转义是一对，写这一侧时必须想到对侧**。
 * @param body - 字面量内部原文。
 * @param quote - 该字面量的引号。
 * @returns 运行期文本。
 */
export function unescapeFromTemplate(body: string, quote = BT): string {
  let out = body
  if (quote === BT) {
    out = out.replace(new RegExp('\\\\' + BT, 'g'), BT).replace(/\\\$\{/g, '${')
  } else {
    out = out.replace(/\\'/g, "'")
  }
  // 通用的 JS 转义还原（顺序：先把 `\\` 放最后，避免二次还原）
  out = out
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
  return out
}

/**
 * ⭐⭐ **执行写回**。
 *
 * 逐条处理；**一条失败不影响其余**（与 `safeRegister` 同一取向：
 * 一个坏掉的条目不该让整次操作白费——用户可以只对成功的那几条得到结果）。
 *
 * @param keys - 要写回的 key 列表（来自设置页的勾选/单选）。
 * @returns 汇总结果。
 */
export async function writeBackToSource(keys: readonly string[]): Promise<WriteBackResult> {
  const root = pluginRoot()
  const items: WriteBackItem[] = []
  /** 文件 → 新内容（同一文件多条改动要累积，不能各自写盘覆盖彼此）。 */
  const pending = new Map<string, string>()

  for (const key of keys) {
    const spec = PROMPT_SPECS.find((s) => s.key === key)
    if (spec === undefined) {
      items.push({ key, status: 'not-found', message: '设置页里没有这个 key（清单可能已变）' })
      continue
    }
    const constName = spec.sourceConst ?? ''
    if (constName === '') {
      items.push({
        key,
        status: 'unsupported',
        message: '该条不支持写回（参数/输出 schema 或值形态不可机械替换）',
        file: spec.sourceFile,
      })
      continue
    }

    const rel = spec.sourceFile
    const abs = join(root, rel)
    let src: string
    try {
      src = (pending.get(rel) ?? readFileSync(abs, 'utf8')).replace(/\r\n/g, '\n')
    } catch (err) {
      items.push({
        key,
        status: 'error',
        message: `读不到 ${rel}：${err instanceof Error ? err.message : String(err)}`,
        file: rel,
        constName,
      })
      continue
    }

    const loc = locateTemplateBody(src, constName)
    if (loc === undefined) {
      items.push({
        key,
        status: 'not-found',
        message: `在 ${rel} 里找不到 \`export const ${constName} = \\\`…\\\`\` 形式（可能已改名或改成了数组）`,
        file: rel,
        constName,
      })
      continue
    }

    const current = promptCurrent(key)
    const inSource = unescapeFromTemplate(src.slice(loc.bodyStart, loc.bodyEnd), loc.quote)
    if (inSource === current) {
      items.push({
        key,
        status: 'already-same',
        message: '源码里已经是这个值，无需写回',
        file: rel,
        constName,
      })
      continue
    }

    const nextSrc =
      src.slice(0, loc.bodyStart) + escapeForLiteral(current, loc.quote) + src.slice(loc.bodyEnd)
    pending.set(rel, nextSrc)
    items.push({
      key,
      status: 'written',
      message: `已写入（${inSource.length} → ${current.length} 字符）`,
      file: rel,
      constName,
    })
  }

  // ── 落盘（每个文件一次，**原子写**——同本项目其余写盘的纪律）──
  let filesChanged = 0
  for (const [rel, content] of pending) {
    try {
      await writeTextAtomic(join(root, rel), content)
      filesChanged += 1
    } catch (err) {
      // 该文件的所有条目改判为失败（避免"报成功其实没写"）
      const msg = `写盘失败：${err instanceof Error ? err.message : String(err)}`
      for (const it of items) {
        if (it.file === rel && it.status === 'written') {
          it.status = 'error'
          it.message = msg
        }
      }
    }
  }

  const written = items.filter((i) => i.status === 'written').length
  const same = items.filter((i) => i.status === 'already-same').length
  const bad = items.filter(
    (i) => i.status !== 'written' && i.status !== 'already-same',
  ).length
  const summary =
    `写回 ${written} 条（改动 ${filesChanged} 个文件）` +
    (same > 0 ? `，${same} 条已相同` : '') +
    (bad > 0 ? `，🔴 ${bad} 条失败` : '')
  return { ok: bad === 0, items, filesChanged, summary }
}

/**
 * ⭐⭐ **三态**：判断某条 key 相对源码处于哪种状态（供设置页显示）。
 *
 * 🔴 **为什么必须有**：写回**保留覆盖项**（用户裁定）⇒ 覆盖值会一直挡着源码。
 *   若不显示状态，用户**看不出写回做过没有**，也看不出"我改了源码怎么没生效"。
 *
 * ⭐ **判据（三态的定义别看错）**：
 *   · 没有覆盖项 ⇒ `untouched`（页面值就是源码值，没什么可写回的）；
 *   · 有覆盖项，且**覆盖值 == 源码值** ⇒ `written`（写回过了——写回的结果就是这个状态）；
 *   · 有覆盖项，且**覆盖值 != 源码值** ⇒ `edited`（改了但还没写回）。
 * ⚠️ 第一版把"有覆盖"一律当 `edited`，于是**写回成功后仍显示"已改未写回"**
 *   （用户会以为写回没生效）——正是"界面在撒谎"。
 * @param key - 稳定键。
 * @returns `untouched` 未改 / `edited` 已改未写回 / `written` 已写回 / `unsupported` 不支持。
 */
export function writeBackState(key: string): 'untouched' | 'edited' | 'written' | 'unsupported' {
  const spec = PROMPT_SPECS.find((s) => s.key === key)
  if (spec === undefined) return 'unsupported'
  const constName = spec.sourceConst ?? ''
  if (constName === '') return 'unsupported'
  let src: string
  try {
    src = readFileSync(join(pluginRoot(), spec.sourceFile), 'utf8').replace(/\r\n/g, '\n')
  } catch {
    return 'unsupported'
  }
  const loc = locateTemplateBody(src, constName)
  if (loc === undefined) return 'unsupported'
  const inSource = unescapeFromTemplate(src.slice(loc.bodyStart, loc.bodyEnd), loc.quote)
  const current = promptCurrent(key)
  // 覆盖值 == 源码值 ⇒ 要么从没改过、要么写回过了。
  // ⚠️ 这两种在**行为上等价**（都不需要再写回），但语义不同 ⇒ 用 `hasOverride` 区分。
  if (inSource === current) return hasOverride(key) ? 'written' : 'untouched'
  return 'edited'
}
