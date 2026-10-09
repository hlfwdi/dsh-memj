// ⭐⭐⭐ **实验素材路径一律派生，不写死**（2026-10-09 收尾，为公开发布清理）。
//
// 🔴🔴 **为什么要有这个模块**：
//   本仓要发到 **GitHub + npm**。而 `scripts/` 里原本写死了**十几处本机绝对路径**
//   （`D:\dsh_test\…`、`D:\dsh_workplace\…`、`C:\Program Files (x86)\…`）——
//   它们**对任何别人都是死路径**，而且形态各异：有的静默走错库、有的直接 ENOENT。
//
// ⚠️ **为什么不是"逐处改一遍就完了"**：同一条"实验根在哪"的判据原本在 6 个探针里
//   **各写一遍**（都是同一个 `D:\dsh_test\2026-09-02_13-51-19-115`）。
//   本项目铁律：**同一判据只留一份实现**——两份必然漂移，六份就是灾难。
//   ⇒ 抽成本模块，探针只 import。
//
// ⭐ **与既有做法同族**：`MEMJ_DATA_DIR`（库根）早就这么干了（60+ 个脚本用它）。
//   本模块只是把**剩下那些没被覆盖的**补上，命名沿用 `MEMJ_` 前缀。
//
// ── 三条路径的语义 ──────────────────────────────────────────────────────
//   · `LAB_ROOT`   —— 隔离实验根，放 `verify/`、`testhome/` 等**一次性素材**。
//                     换机器必然没有 ⇒ 调用方应**跳过**而不是报红（见 labRoot()）。
//   · `DESIGN_DOC` —— `memj-design.md`，**已解耦**（不再是源头，只在迁移/对账时用）。
//   · `EDGE`       —— 无头浏览器可执行文件，**本机标准安装位置可枚举**。
//
// @module dsh-memj/scripts/shared/lab-paths
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 隔离实验根（`D:\dsh_test\2026-09-02_13-51-19-115` 那一级）。
 *
 * ⚠️ **它指向的是"某台机器上的一次性素材"**，不是仓库的一部分：
 *   `verify/`（探针脚本 + 基线数据）、`testhome/`（隔离实例的 home）都在里面。
 *   ⇒ 🔴 **换机器/换用户必然不存在**，这与本项目记过的"写死路径会让
 *     '没有那条数据' 与 '路径不对' 表现一样"是同一类坑。
 *
 * 来源：`MEMJ_LAB_ROOT`，或（向后兼容）`MEMJ_TEST_ROOT`。
 * 未设置 ⇒ 返回 `''`，调用方**自行决定**是跳过还是报错。
 */
export function labRoot() {
  return process.env['MEMJ_LAB_ROOT'] ?? process.env['MEMJ_TEST_ROOT'] ?? ''
}

/**
 * 实验根下的一个子路径；**实验根未设置时返回 `''`**（而不是拼出一个假路径）。
 *
 * @param {...string} parts - 相对实验根的路径片段。
 * @returns {string} 绝对路径；实验根未知时 `''`。
 */
export function labPath(...parts) {
  const root = labRoot()
  return root === '' ? '' : join(root, ...parts)
}

/**
 * `memj-design.md` 的路径。
 *
 * 🔴 **这个文件已不再是任何东西的源头**（2026-10-12 用户裁定解耦）：
 *   `src/protocol.ts` / `src/tool-descriptions.ts` 现在各自是源头，
 *   设计文档 §6 / §4.2 **必然逐渐过时**。
 *   ⇒ 只有 `gen-protocol` / `check-protocol` / `gen-descriptions` /
 *     `check-descriptions` 这四个**一次性迁移/对账**脚本还用它。
 *
 * 来源（按优先级）：`MEMJ_DESIGN_DOC` → `MEMJ_LAB_ROOT/memj-design.md`。
 * 都取不到 ⇒ 返回 `''`；调用方**必须**给出可操作的报错（写明怎么指定），
 * ⛔ 不许回落成某个本机路径——那正是本次要清掉的东西。
 */
export function designDocPath() {
  const explicit = process.env['MEMJ_DESIGN_DOC']
  if (explicit !== undefined && explicit !== '') return explicit
  const lab = labPath('memj-design.md')
  return lab
}

/**
 * 无头 Chromium 系浏览器（本机是 Edge）的可执行文件。
 *
 * ⭐ **这个是可以真正派生的**（与实验素材不同）：Windows 上只有三个标准安装位，
 *   **枚举一遍取第一个存在的**即可，不需要用户配任何东西。
 *   ⚠️ 原来 5 个探针各写死一份 `C:\Program Files (x86)\…` —— 32 位安装位上，
 *   但**用户级安装**（`LOCALAPPDATA`）的 Edge 也真实存在，写死就漏了。
 *
 * 来源（按优先级）：`MEMJ_EDGE` → 三个标准位置。
 * 都找不到 ⇒ 返回 `''`，调用方跳过（**报红是假红**：这台机器没装浏览器不是回归）。
 */
export function edgePath() {
  const explicit = process.env['MEMJ_EDGE']
  if (explicit !== undefined && explicit !== '') return explicit

  // ⚠️ `ProgramFiles(x86)` 这个名字带括号 ⇒ 只能用方括号取，点号取不到。
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files'
  const local = process.env['LOCALAPPDATA'] ?? ''

  const candidates = [
    join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ...(local === '' ? [] : [join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]),
  ]
  return candidates.find((c) => existsSync(c)) ?? ''
}

/**
 * 探针用：**素材不全就跳过（exit 0），不报红**。
 *
 * 🔴 **为什么是跳过而不是失败**：这类探针证的是「代码对**本机某份一次性素材**有效」。
 *   换台机器素材必然没有 ⇒ 它**证不了任何东西**，报红是**假红**
 *   （本项目既有判据；范本：`probe-hot-gethandoff-live.mjs` 的 `skipNote`）。
 *
 * ⚠️ **与 `requirePath` 的分工**：那个给"迁移/对账工具"用（**真需要**那份文件，
 *   缺了就干不了活 ⇒ 报错带用法）；这个给**探针**用（缺了只是这次不适用）。
 *
 * @param {string} what - 这次要证什么，如「热知识页实景截图」。
 * @param {string[]} missing - 缺什么（人话，含怎么补）。
 */
export function skipIfUnavailable(what, missing) {
  if (missing.length === 0) return
  console.log(
    `  ⏭️ 跳过：${what}\n` +
      missing.map((m) => `     原因：${m}`).join('\n') +
      '\n     这台机器上没有它 ⇒ **证不了任何东西**，所以是跳过、不是失败。',
  )
  process.exit(0)
}

/**
 * 取一个**必须存在**的路径，否则**带着可操作的说明**退出。
 *
 * ⭐ 判据（本项目既有）：**"文件不存在"与"路径不对"必须能被区分** ——
 *   写死路径最坏的地方就在于两者表现一样，看的人会去怀疑功能坏了。
 *   ⇒ 报错里必须写清 **怎么指定**（环境变量名 + 示例）。
 *
 * @param {string} value - 已派生的路径（可能为 `''`）。
 * @param {string} what - 人话描述，如「设计文档 memj-design.md」。
 * @param {string} how - 怎么指定它（环境变量名 + 示例）。
 * @returns {string} 原值（非空时）。
 */
export function requirePath(value, what, how) {
  if (value !== '') return value
  console.error(
    `\n❌ 找不到${what}的路径。\n` +
      `   ⚠️ 它**不属于本仓库**（是某台机器上的外部素材），所以没有内置默认值——\n` +
      `      写死默认值正是本次清掉的东西（换机器会静默走错）。\n` +
      `   ⇒ 这样指定：${how}\n`,
  )
  process.exit(2)
}
