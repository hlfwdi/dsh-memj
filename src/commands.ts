/**
 * 斜杠命令（host 半边）。
 *
 * | 命令 | 作用 |
 * |---|---|
 * | `/memj-handoff` | 让 agent 按规范做一次 handoff（六节叙事 + 知识封面 + 落盘） |
 * | `/memj-review` | ⭐ **给人看的状态面板**：待批提名 / 断链 / 非法封面 |
 *
 * ── 两条硬约束（都是踩过的坑）─────────────────────────────────────────────
 * 1. **无参命令不要给 `input` 字段**——`normalizeDefinition` 对空 `input.hint`
 *    **直接 throw**（`input hint must not be empty`）。
 * 2. **逐个 try 注册**——一个命令抛异常会**拖垮其后全部注册且无日志**。
 *
 * ⚠️ 带参调用与裸调用的分工（与旧 `dsh-memory` 同构）：裸调 `/memj-review`
 * 时，client 侧可用 `commandUi.decorate` 把它变成选择列表；**host 侧则必须
 * 同时支持两种形态**——无参时回机读清单，带参时执行。
 *
 * @module dsh-memj/commands
 */

import type { Context } from '@deepseek-ai/cordis'
// type-only import 提供声明合并：`ctx.commands` 来自 dsh-commands。
import type {} from '@deepseek-ai/dsh-commands'
import { createUserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { MemjConfig } from './config.ts'
import { readNominations, scanLibrary } from './store.ts'
// ⭐⭐ 判定线索（2026-09-22）：get-handoff 也记一笔 `doc-reads`（强度等同"读了项目文档"）。
import { appendDocRead } from './store.ts'
import { sessionIdOf, turnOf } from './tools.ts'
import { resolveRef } from './paths.ts'
import { loadEntryDoc, loadThemeFrontmatter } from './store.ts'
// ⭐ 分步（决策 101）：命令要能识别"只做某几步"。
import { HANDOFF_STEP_ORDER, type HandoffStep } from './handoff.ts'
// ⭐⭐ 「取交接」的三档渲染（决策 110）。
import { DEFAULT_LEVEL, LEVEL_LABELS, parseLevel, renderProjectHandoff, renderThemeHandoff } from './inject.ts'

/** 命令依赖。 */
export interface CommandDeps {
  ctx: Context
  config: MemjConfig
}

/** 机读清单的头部标识（client 的 `options()` 会解析它）。 */
export const LIST_HEADER = 'items='

/**
 * 把清单编码成**机读文本**（client 侧 `popupSelect.options()` 解析）。
 *
 * 用 `\t` 分隔、`\n` 分行——简单且不怕内容里有逗号。
 * @param rows - 每行 `[id, label, detail]`。
 * @returns 编码后的文本。
 */
export function encodeList(rows: ReadonlyArray<readonly [string, string, string]>): string {
  const lines = [`${LIST_HEADER}${rows.length}`]
  for (const [id, label, detail] of rows) {
    const clean = (s: string): string => s.replace(/[\t\n\r]/g, ' ')
    lines.push(`${clean(id)}\t${clean(label)}\t${clean(detail)}`)
  }
  return lines.join('\n')
}

/**
 * 把一段文本作为**独立的一轮**送进当前 agent，并**唤醒驱动器**。
 *
 * 🔴 **为什么必须是 `followup` 而不是 `inject`**（本会话实测踩到，是本命令的核心）：
 * `dsh-agent` 的类型文档写得很明确，两者**唤醒语义不同**——
 *
 * | API | 文档原文 | 空闲时 |
 * |---|---|---|
 * | `agent.inject()` | "Queue model-facing context for the next pre-step **without waking the driver**… **idle drivers leave it pending**" | ❌ **一直挂着** |
 * | `agent.followup()` | "Queue an ordinary follow-up turn **and wake the driver**" | ✅ **立刻开始一轮** |
 *
 * ⇒ 早先用 `inject` 时，命令执行后模型**根本不动**，界面停在「上下文注入 / 待注入」状态
 * ——用户看到的就是"打了命令没反应"。官方 `/goal` 用的也是 `followup`。
 *
 * ⚠️ 另一条已知事实（`form` 只是语义标签，**不提供"取代上一次"的机制**）：
 * 队列一律 `surfaceOp:'append'` ⇒ **重复执行会累积**（旧内容留在历史里持续计费），**不替换**。
 * 但它追加在尾部、不碰 node 0，**不破坏前缀缓存**。
 * @param agent - 目标 agent。
 * @param text - 要送进上下文的文本。
 * @param tag - 分节名（溯源用）。
 */
function submitContext(agent: Agent, text: string, tag: string): void {
  agent.followup(
    createUserMessage({
      content: [{ type: 'text', text } as ContentBlock],
      source: {
        kind: 'plugin:dsh-memj',
        form: 'instructions',
        sections: [{ name: tag, text }],
      },
    }),
  )
}

/**
 * ⭐ **从用户补充的话里识别"要做哪几步"**（决策 101 的"指令直达某步"）。
 *
 * 用法示例：`/memj-handoff knowledge`、`/memj-handoff theme, knowledge`。
 *
 * 🔴 **只认"整句就是步骤列表"这一种形式**——不做模糊匹配。
 *    理由：用户补充的话**可能是一句自然语言**（"这次记网页改造"），
 *    在里面**猜**步骤会把正常描述误判成步骤（例如"主题"二字出现在句子里）。
 *    ⇒ 判据收紧成：**每个词都是合法步骤名**（以空格/逗号/顿号/`+` 分隔），
 *    才认为是在指定步骤；否则整句当普通补充语。
 * @param userNote - 用户在命令后补充的那句话。
 * @returns 识别出的步骤；没识别出来时 `undefined`。
 */
export function parseStepRequest(userNote: string): HandoffStep[] | undefined {
  const text = userNote.trim()
  if (text === '') return undefined
  const parts = text
    .split(/[\s,，、+]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
  if (parts.length === 0) return undefined
  // ⚠️ `all` 单独出现是合法的"做全部"；与其它并存则不认（留给工具报错更清楚，
  //    这里直接当"没识别出步骤"，按普通补充语处理）。
  if (parts.includes('all')) {
    return parts.length === 1 ? ['all'] : undefined
  }
  const ok = parts.every((p) => (HANDOFF_STEP_ORDER as readonly string[]).includes(p))
  return ok ? (parts as HandoffStep[]) : undefined
}

/**
 * 渲染一次 handoff 的**启动指令**给模型。
 *
 * 它只负责"让模型按规范去做"，真正的落盘由模型调用 `memj_handoff` 完成。
 * @param userNote - ⭐ 用户在命令后**随手补充的那句话**（空串 = 没写）。
 *   它来自 `invocation.rawInput`——因为本命令声明了 `input`，
 *   客户端会把 `/memj-handoff ` 落进输入框、允许用户接着写，提交时整行回传。
 *   ⚠️ **不要假设它是"重点/范围"**：用户可能写的是范围（"这次记网页改造"），
 *   也可能是做法或程度（"整理一下"、"写详细点"）。所以措辞保持中性（"用户补充"）。
 *   ⭐ 但它**也可能是在指定步骤**（如 `knowledge`）——那种情况下整句就是步骤列表，
 *   见 `parseStepRequest`。
 * @returns 模型可见文本。
 */
function renderHandoffPrompt(userNote = ''): string {
  const steps = parseStepRequest(userNote)
  // ⭐ 识别出步骤 ⇒ 走"只做这几步"的短提示词，不必再讲全套规范。
  if (steps !== undefined && steps[0] !== 'all') {
    return [
      '## 请做一次记忆 handoff（分步）',
      '',
      `用户指定**只做这几步**：${steps.map((s) => `\`${s}\``).join('、')}`,
      '',
      `请调用 \`memj_handoff\`，带上 \`step: ${JSON.stringify(steps)}\`——**各步要见该工具的说明**。`,
      '',
      '🔴 **参数必须与 `step` 一致**——传了不属于这几步的参数会被**直接拒绝**',
      '（这是防"你以为写了、其实没写"）。',
      '🔴 **执行顺序固定** narrative → theme → knowledge，与你给的顺序无关。',
      '🔴 **只做这几步**——其余步骤**不在本次范围**，**不是欠账**：',
      '回执会列出"本次范围之外"的步骤，**不要为了"补齐"再调一次**。',
    ].join('\n')
  }

  const lines = [
    '## 请做一次记忆 handoff',
    '',
    '按 `memj_handoff` 工具的说明执行。要点：',
    '',
    // ⭐⭐ **决策 124 第 2 步**：本条的完整判断方法**已搬到 `systemPrompt.context()`**
    //    （§5.2 块 B「落到哪个项目（handoff 时）」）——那里**每轮可见**，
    //    且**改它不破缓存**。此处只留**指针**，避免同一件事在第三处再抄一遍。
    //    ⚠️ 代价：命令提示词不再自带全套判据；但 context() 与工具说明都比它更权威。
    '1. **写哪个项目**——判据见 `memj_handoff` 的说明与运行时上下文；',
    '   ⭐ **上文能确定就直接沿用，不必再查库**（那才是重复劳动）。',
    '2. **先读一遍现有交接文档，再写叙事**（**硬性要求**）：',
    '   `memj_read({ project: "<项目 id>" })` 读全文；或按 `section` **逐节读完**。',
    '   ⚠️ **不读就写 `doc` 会被直接拒绝**——凭记忆重写必然压缩、丢细节；',
    '   ⚠️ **上一轮读过也不算**（有效期是**一个完整轮次**），要看**最新**内容。',
    '   写的是六节：目标 / 当前进度 / 有效做法 / 失败踩坑 / 关键上下文 / 下一步。',
    '   ⚠️ **既有节要写在它自己那一节里**——别为了让新内容不覆盖旧内容就另起一个平行节，',
    '      那是把"该写没写"伪装成"结构选择"。',
    '3. **沉淀知识**：把值得跨会话复用的知识写进 `entries`（每条一个 `slug`/`desc`/`body`/`tags`）。',
    '   `desc` 是**检索键不是摘要**——写清"什么场景下的什么知识；当什么场景时读它"。',
    '4. **归属**：能挂到本项目已关联的主题就挂（免批准）；',
    '   要建主题就用 `newThemes` 声明 `{ id, desc }`——',
    '   ⚠️ **能不能建取决于本实例的校验模式**（严格 / 宽松），`memj_snapshots` 的返回值会明说；',
    '   要进全局就登记提名（`entries[].global = true`）——**封面 `global` 保持 false、批准时才置位**；',
    '   ⚠️ **不要自己把封面写成 `global: true`**（那等于自己批准了，而你不能批准）。',
    '',
    '⚠️ 没有值得记的内容时**不要硬凑**——只更新叙事即可，`entries` 留空是正确行为。',
    // ⭐ 提示"可以分步"，让模型/用户知道这个能力存在（否则没人会用）。
    '💡 **只想做其中一步**？可以带上 `step`（`narrative` / `theme` / `knowledge`），',
    '   或直接用 `/memj-handoff knowledge` 这样的命令。',
  ]
  // ⭐ 用户补充的话：它不是**替代**上面的规范，而是对本次的**额外交代**。
  if (userNote !== '') {
    lines.push(
      '',
      '---',
      '',
      `⭐ **用户随命令补充的话**：${userNote}`,
      '',
      '⚠️ 这是**额外交代**，**不是对上面规范的替代**——四条照常走，再按这句调整侧重。',
    )
  }
  return lines.join('\n')
}

/**
 * 注册两个斜杠命令（逐个 try）。
 * @param deps - 依赖。
 */
export function registerCommands(deps: CommandDeps): void {
  const { ctx } = deps

  /**
   * 逐个注册，一个失败不拖垮其余。
   * @param name - 命令名（日志用）。
   * @param register - 注册动作。
   */
  const safeRegister = (name: string, register: () => void): void => {
    try {
      register()
    } catch (err) {
      ctx.logger?.error?.('dsh-memj: 命令 %s 注册失败（该命令将不可用）: %o', name, err)
    }
  }

  // ── /memj-handoff ──
  //
  // ⭐ **声明 `input` ⇒ 该命令变成 `leadingInput`（参数声明）**：
  //    从菜单选中它时**不再立即执行**，而是把 `/memj-handoff ` 这个 token
  //    连同 `hint` **落进输入框**，等用户接着补充、按回车时再整行提交。
  //    （与官方 `/goal` 同一机制；见 `dsh-client-ui-commands` 的决策表：
  //     `if (desc.input !== void 0) return { claim: leadingClaim(...) }`，
  //     否则走 `runDetached` 直接执行。）
  //
  // 🔴 **`hint` 不能是空白串**——真实校验是 `rawInput.hint.trim().length === 0`
  //    （`dsh-commands/lib/index.js` 的 `normalizeDefinition`），所以
  //    **单空格、全角空格 U+3000、不换行空格 U+00A0 都会被判为空并 throw**
  //    （已实测）；而 `safeRegister` 会**吞掉异常**，
  //    表现为「命令静默没注册、但插件看起来一切正常」。
  //    ⚠️ `probe-host.mjs` 的 stub 曾只判 `hint === ''`，比真实实现宽松
  //    ⇒ 探针全绿、线上全废。**stub 必须复刻真实校验**（已同步修正）。
  //    ⇒ 只能给**真实的文字**，不能靠空白字符糊弄过去。
  safeRegister('memj-handoff', () =>
    ctx.commands.register({
      name: 'memj-handoff',
      description: '按 memj 规范做一次记忆 handoff（写叙事 + 沉淀知识 + 归属推进）。',
      input: { hint: '（可补充本次重点，或直接回车）' },
      handler: (invocation) => {
        const agent = invocation.agent
        if (agent === undefined) {
          return { kind: 'success', text: '当前上下文没有 agent，无法发起 handoff。' }
        }
        // ⭐ 用户在命令后补充的那句话 ⇒ 作为「额外交代」附在规范后面。
        const userNote = (invocation.rawInput ?? '').trim()
        // ⚠️ 必须是 `followup`（会唤醒）而不是 `inject`（不唤醒，会停在"待注入"）。
        submitContext(agent, renderHandoffPrompt(userNote), 'memj-handoff')
        return {
          kind: 'success',
          text:
            userNote === ''
              ? '已把 handoff 规范送进上下文，模型将据此执行。'
              : `已把 handoff 规范送进上下文，并附上你补充的话：${userNote}`,
        }
      },
    }),
  )

  // ── /memj-review ──
  safeRegister('memj-review', () =>
    ctx.commands.register({
      name: 'memj-review',
      description: '人侧状态面板：待批 global 提名 / 断链 / 非法封面。',
      handler: async (invocation) => {
        const raw = (invocation.rawInput ?? '').trim()
        const lines: string[] = []

        if (raw === '') {
          // 无参 ⇒ 回**机读清单**，供 client 的 popupSelect 解析；
          // 没有 client 时也能直接把数字看明白。
          const noms = await readNominations()
          const snapshot = await scanLibrary()
          const { broken, invalidCount } = await countProblems(snapshot)
          const rows: Array<readonly [string, string, string]> = [
            ['pending', `待批 global 提名（${noms.length}）`, noms.map((n) => n.desc.slice(0, 40)).join('；')],
            ['broken', `断链的外部引用（${broken}）`, '目标文件已不存在，需要人工处理'],
            ['invalid', `非法封面（${invalidCount}）`, '格式不合法，已在重建时跳过'],
            ['rebuild', '重建派生层', '从项目文档重新聚合 THEME / GLOBAL'],
          ]
          return { kind: 'success', text: encodeList(rows) }
        }

        if (raw === 'pending') {
          const noms = await readNominations()
          if (noms.length === 0) return { kind: 'success', text: '没有待批准的 global 提名。' }
          lines.push(`## 待批 global 提名（${noms.length}）`, '')
          for (const n of noms) {
            lines.push(`- \`${n.entryId}\`（项目 \`${n.project}\`）— ${n.desc}`)
          }
          lines.push('', `批准：POST /plugins/dsh-memj/api/approve  {"entryId":"..."}`)
          lines.push(`否决：POST /plugins/dsh-memj/api/reject  {"entryId":"..."}`)
          return { kind: 'success', text: lines.join('\n') }
        }

        if (raw === 'broken') {
          const snapshot = await scanLibrary()
          const brokenItems: string[] = []
          for (const { cover } of snapshot.covers) {
            if (!cover.ext) continue
            const abs = resolveRef(cover.ref, cover.ext)
            const doc = abs === undefined ? undefined : await loadEntryDoc(cover.ref, cover.ext)
            if (doc === undefined) brokenItems.push(`- \`${cover.id}\` — ${cover.ref}`)
          }
          if (brokenItems.length === 0) return { kind: 'success', text: '没有断链的外部引用。' }
          lines.push('## 断链的外部引用', '', ...brokenItems, '',
            '⚠️ 外部文档不归 memj 管，**不自动修复**——请补档或删封面。')
          return { kind: 'success', text: lines.join('\n') }
        }

        if (raw === 'invalid') {
          const snapshot = await scanLibrary()
          if (snapshot.issues.length === 0) return { kind: 'success', text: '全部封面格式合法。' }
          lines.push(`## 非法封面（${snapshot.issues.length}）`, '')
          for (const i of snapshot.issues) lines.push(`- ${i.file}:${i.line} — ${i.reason}`)
          return { kind: 'success', text: lines.join('\n') }
        }

        if (raw === 'rebuild') {
          const { rebuildDerivedLayers } = await import('./store.ts')
          const stats = await rebuildDerivedLayers()
          return {
            kind: 'success',
            text: `派生层已重建：${stats.themes} 个主题、${stats.projects} 个项目 frontmatter 更新。`,
          }
        }

        return { kind: 'success', text: `未知的子命令「${raw}」。可用：pending / broken / invalid / rebuild。` }
      },
    }),
  )

  // ══════════════════════════════════════════════════════════════════════════
  // ⭐⭐ 两个「取交接」命令（决策 110）
  //
  // 🔴 **交互设计的核心**：**不做 popupSelect 装饰**——
  //    实测「装饰优先级高于 `input`」⇒ 挂装饰就"选中即执行"，**没有补话的机会**。
  //    而用户要的正是"**选完还能补话**"（补的是档位）。
  //
  // ⇒ 所以走**两条腿**：
  //    ① 命令 itself **声明 `input`** ⇒ 裸打时落进输入框，用户可补档位；
  //    ② client 侧挂**自建弹窗**（不是 popupSelect 装饰）⇒ 选中项目后用
  //       `setDraft` 把命令行**写回输入框**，用户仍能补话。
  // ⚠️ 两条腿的产物是**同一个输入框内容**：`/memj-get-handoff-project <项目> <档位词>`。
  // ══════════════════════════════════════════════════════════════════════════

  // ── /memj-get-handoff-project ──
  safeRegister('memj-get-handoff-project', () =>
    ctx.commands.register({
      name: 'memj-get-handoff-project',
      description: '把某个项目的交接内容注入会话（文档 / +项目知识 / +主题知识）。',
      input: { hint: '（项目 id，可再补档位：只看文档 / 连带项目知识 / 全部）' },
      handler: async (invocation) => {
        const agent = invocation.agent
        if (agent === undefined) return { kind: 'success', text: '当前上下文没有 agent。' }
        const raw = (invocation.rawInput ?? '').trim()

        // 无参 ⇒ 回**机读清单**（headless 兜底；client 侧有自己的弹窗，不解析它）。
        const snapshot = await scanLibrary()
        if (raw === '') {
          const rows = snapshot.projects.map(
            (p) => [p.id, p.id, p.frontmatter.desc] as const,
          )
          return { kind: 'success', text: encodeList(rows) }
        }

        // 解析：第一个词是项目 id，**其余全当档位描述**（"语义选择"）。
        const [projectId = '', ...rest] = raw.split(/\s+/)
        const note = rest.join(' ')
        const level = parseLevel(note) ?? DEFAULT_LEVEL
        // ⚠️ 回执里**必须明说用了哪一档**——尤其"没识别出来、用了默认"时，
        //    否则用户以为自己的话生效了。
        const levelNote =
          parseLevel(note) !== undefined
            ? `按你说的「${note}」定为**第 ${level} 档**（${LEVEL_LABELS[level]}）`
            : note === ''
              ? `未指定档位 ⇒ 用**默认第 ${level} 档**（${LEVEL_LABELS[level]}）`
              : `⚠️ 没看懂「${note}」指的哪一档 ⇒ 用**默认第 ${level} 档**（${LEVEL_LABELS[level]}）；` +
                '可用说法：只看文档 / 连带项目知识 / 全部'

        const rendered = await renderProjectHandoff(projectId, level)
        if (rendered === undefined) {
          const known = snapshot.projects.map((p) => `\`${p.id}\``).join('、') || '（库里还没有项目）'
          return { kind: 'error', text: `没有该项目：\`${projectId}\`。库里有：${known}` }
        }

        // ⭐⭐ **顺手记一笔"取过这个项目的交接"**（2026-09-22 新增，用户要求）。
        //
        // 🔴 **为什么必须记**：`/memj-get-handoff-project <项目>` 是
        //    **"人明确要了那个项目的上下文"** —— 与"模型读了项目文档"**强度等同**
        //    （用户裁定）。而它**以前什么都不写** ⇒ 判定侧看不见
        //    ⇒ 用户实测："这个会话做过 get-handoff，但没自动判定出项目"。
        //
        // ⭐ **与 `doc-reads` 共用同一份文件与同一套读取**（方案 §7.2）：
        //    判定侧只认"最新一条是哪个项目"，**不关心它怎么来的**；
        //    `via` 字段只用于**显示来源**与调试。
        //
        // ⚠️ 记录失败**不能影响命令本身**（注入已经成功了，那是主职责）。
        try {
          await appendDocRead(sessionIdOf(agent), {
            project: projectId,
            // ⚠️ 命令执行时**未必拿得到轮次号**（不是模型直呼）⇒ 用 `-1`（已知约定：
            //    校验侧对 `-1` 退化为"本会话读过即可"）。
            turn: turnOf(ctx, agent),
            readAt: new Date().toISOString(),
            full: true,
            sections: [],
            via: 'gethandoff',
          })
        } catch {
          /* 只是判定用的线索，记不上不该让命令失败 */
        }

        // ⚠️ 用 `followup`（**会唤醒**），不是 `inject`（不唤醒 ⇒ 停在"待注入"）。
        submitContext(agent, rendered.text, 'memj-get-handoff-project')
        return {
          kind: 'success',
          text:
            `已注入项目 \`${projectId}\` 的交接内容（${levelNote}）。` +
            `其中：交接文档 ✅、本项目知识 ${rendered.counts.project} 条` +
            (level >= 3 ? `、主题新增知识 ${rendered.counts.theme} 条（已去重）` : '') +
            '。\n' +
            // 🔴 原话是「模型将据此继续」——**与用户要求相反**（那等于预告模型自行动作）。
            //    ⇒ 改成如实描述注入文本里的收尾指令。
            '⚠️ 已提示模型**到此为止**——它只应确认收到、（可选）告诉你下一步能做什么，' +
            '**不会再自行动作**（不写库、不改文档、不调工具核对）。',
        }
      },
    }),
  )

  // ── /memj-get-handoff-theme ──
  safeRegister('memj-get-handoff-theme', () =>
    ctx.commands.register({
      name: 'memj-get-handoff-theme',
      description: '把某个主题的封面与知识清单注入会话（正文按需读）。',
      input: { hint: '（主题 id）' },
      handler: async (invocation) => {
        const agent = invocation.agent
        if (agent === undefined) return { kind: 'success', text: '当前上下文没有 agent。' }
        const raw = (invocation.rawInput ?? '').trim()
        const snapshot = await scanLibrary()

        if (raw === '') {
          const rows: Array<readonly [string, string, string]> = []
          for (const id of snapshot.themeIds) {
            const fm = await loadThemeFrontmatter(id)
            rows.push([id, id, fm?.desc ?? ''])
          }
          return { kind: 'success', text: encodeList(rows) }
        }

        const themeId = raw.split(/\s+/)[0] ?? ''
        const rendered = await renderThemeHandoff(themeId)
        if (rendered === undefined) {
          const known = snapshot.themeIds.map((t) => `\`${t}\``).join('、') || '（库里还没有主题）'
          return { kind: 'error', text: `没有该主题：\`${themeId}\`。库里有：${known}` }
        }
        submitContext(agent, rendered.text, 'memj-get-handoff-theme')
        return {
          kind: 'success',
          text:
            `已注入主题 \`${themeId}\`（覆盖项目 ${rendered.counts.projects} 个、` +
            `知识 ${rendered.counts.covers} 条；⚠️ 只给了标题与描述，正文按需读）。\n` +
            // ⭐ 主题命令与项目命令**措辞一致**（同一份收尾指令，回执也要一致）。
            '⚠️ 已提示模型**到此为止**——它只应确认收到、（可选）告诉你下一步能做什么，' +
            '**不会再自行动作**（不写库、不改文档、不调工具核对）。',
        }
      },
    }),
  )
}

/**
 * 数一下断链与非法封面（`/memj-review` 无参时给概要）。
 * @param snapshot - 库快照。
 * @returns 断链数与非法封面数。
 */
async function countProblems(
  snapshot: Awaited<ReturnType<typeof scanLibrary>>,
): Promise<{ broken: number; invalidCount: number }> {
  let broken = 0
  for (const { cover } of snapshot.covers) {
    if (!cover.ext) continue
    const doc = await loadEntryDoc(cover.ref, cover.ext)
    if (doc === undefined) broken += 1
  }
  return { broken, invalidCount: snapshot.issues.length }
}
