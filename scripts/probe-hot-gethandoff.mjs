/**
 * 探针：⭐⭐ **从会话日志里找出 `get-handoff` 痕迹来判定项目**（2026-09-22 用户要求）。
 *
 * 用户原话：
 *   "看一下这个会话，session-68cf45d8-07e5-41e5-bd61-416a396de270。
 *    这个会话是做过 gethandoff 的，是个非常强的项目判定的判据，但是没有自动判定项目。
 *    这个有点问题，这个也应该能够从历史 session 里读出 …… 这个方式也应该加到
 *    doc-reads 开启后的判定方法里。"
 *
 * ── 本探针证【A】：**纯函数**的解析规则 ──────────────────────────────────────
 * `parseGetHandoffFromEvents` —— 造事件验规则，**每条带反证**。
 * ⭐ 真实会话那一半在 **`probe-hot-gethandoff-live.mjs`**（直接解 zstd 读日志）。
 *
 * ⚠️ **不碰生产库、不改会话**。
 * 用法：node scripts/probe-hot-gethandoff.mjs
 */

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`) }
}

import { homedir } from 'node:os'
import { join } from 'node:path'

// ⭐ **派生库根**（与 `src/paths.ts` 同一条规则：`MEMJ_DATA_DIR` → `~/.dsh-memj`）。
//    ⚠️ 曾写死 `C:\Users\<用户名>\.dsh-memj` ⇒ 换机器/换用户时**静默走错库**。
//    ⚠️ 且原注释写着"用临时库根"，而代码给的**是生产库** —— 注释与实现不一致，
//       已按实现改正：本探针**只跑纯函数**（不读盘、不写库），所以用默认库根也无副作用；
//       要隔离就跑 `MEMJ_DATA_DIR=<副本> node scripts/probe-hot-gethandoff.mjs`。
process.env['MEMJ_DATA_DIR'] ??= join(homedir(), '.dsh-memj')
const mod = await import('../lib/index.js')

console.log('════════ 【A】纯函数：从事件里解析 get-handoff ════════\n')

/** 造一条 `command/run` 事件（形态**逐字照实测的日志**）。 */
const cmdEvent = (name, args, time) => ({
  type: 'command/run',
  seq: 1,
  time,
  data: { commandId: 'cmd-x', name, args, source: { kind: 'user' } },
})

const KNOWN = ['dsh-memj', 'dsh-memory', 'dsh-plugin-adapt']

// ① 基本：能认出来
{
  const r = mod.parseGetHandoffFromEvents([cmdEvent('memj-get-handoff-project', ' dsh-memj 档1', 1000)], KNOWN)
  check('⭐ 能认出 `memj-get-handoff-project` 并解析出项目 id', r.project === 'dsh-memj', JSON.stringify(r))
  check('⭐ 返回了发生时刻', r.atMs === 1000, String(r.atMs))
}

// ② ⭐ 用户实测的那个 args 形态（**前导空格**，实测日志就是 `" dsh-memj 档1"`）
{
  const r = mod.parseGetHandoffFromEvents([cmdEvent('memj-get-handoff-project', ' dsh-memj 档1', 5)], KNOWN)
  check('⭐（用户实测形态）`" dsh-memj 档1"` 带前导空格也能解析', r.project === 'dsh-memj', JSON.stringify(r))
}

// ③ 取最新的那一次
{
  const r = mod.parseGetHandoffFromEvents([
    cmdEvent('memj-get-handoff-project', 'dsh-memory', 100),
    cmdEvent('memj-get-handoff-project', 'dsh-memj', 900),
    cmdEvent('memj-get-handoff-project', 'dsh-plugin-adapt', 500),
  ], KNOWN)
  check('⭐ 多次取**最新**那次（不是第一条、也不是最后一条）', r.project === 'dsh-memj', JSON.stringify(r))
}

// ④ ⚠️ 反证：主题级命令**不算项目判据**
{
  const r = mod.parseGetHandoffFromEvents([cmdEvent('memj-get-handoff-theme', 'thm-dsh-plugin', 900)], KNOWN)
  check('⚠️（反证）`memj-get-handoff-theme` **不算**项目判据（它给的是主题 id）',
    r.project === '未知', JSON.stringify(r))
}

// ⑤ ⚠️ 反证：项目已删/已归档 ⇒ 跳过（但继续找更早的）
{
  const r = mod.parseGetHandoffFromEvents([
    cmdEvent('memj-get-handoff-project', 'dsh-memj', 100),
    cmdEvent('memj-get-handoff-project', 'project-deleted', 900),
  ], KNOWN)
  check('⚠️（反证）已删项目被跳过、**回退到更早的合法记录**', r.project === 'dsh-memj', JSON.stringify(r))
}

// ⑥ ⚠️ 反证：没有痕迹 / 事件形状异常 ⇒ 未知，**不抛**
{
  check('⚠️（反证）空事件 ⇒ 未知', mod.parseGetHandoffFromEvents([], KNOWN).project === '未知')
  check('⚠️（反证）无关命令 ⇒ 未知',
    mod.parseGetHandoffFromEvents([cmdEvent('rewind', '@9 chat', 1)], KNOWN).project === '未知')
  check('⚠️（反证）坏事件（null/undefined/异形）⇒ 未知，不抛',
    mod.parseGetHandoffFromEvents([null, undefined, {}, { type: 'command/run' }, { type: 'command/run', data: {} }], KNOWN).project === '未知')
  check('⚠️（反证）args 为空 ⇒ 未知',
    mod.parseGetHandoffFromEvents([cmdEvent('memj-get-handoff-project', '', 1)], KNOWN).project === '未知')
  check('⚠️（反证）已知项目列表为空 ⇒ 未知（不认不存在的项目）',
    mod.parseGetHandoffFromEvents([cmdEvent('memj-get-handoff-project', 'dsh-memj', 1)], []).project === '未知')
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n════════ 【B】真实会话 ════════\n')
// 🔴 **这里刻意不装配 `sessionQuery`**（原来试过，装配不起来）：
//    它的 provider 是 `dsh-session-query-sqlite`，需要 `path`（sqlite 索引）
//    **加上** `sessionPersistence` 服务 —— **依赖链太长**，而本探针要证的事
//    不需要整个 query 引擎。
// ⇒ ⭐ 真实会话那半**独立成 `probe-hot-gethandoff-live.mjs`**（直接解 zstd 读日志，
//    再把真实事件喂给同一个解析函数）。**判据一样硬，装配成本却低得多。**
console.log('  ⏭ 跳过（真实会话的验证在 probe-hot-gethandoff-live.mjs）')
console.log('     原因：sessionQuery 的 provider 需要 sqlite 索引 + sessionPersistence，')
console.log('     依赖链太长；而"能不能读出痕迹"这件事不需要整个 query 引擎。')

console.log(`\n════════ 结果：通过 ${pass} / 失败 ${fail} ════════`)
if (fail > 0) process.exitCode = 1

