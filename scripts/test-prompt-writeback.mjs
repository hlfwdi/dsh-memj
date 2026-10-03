/**
 * 端到端验证「写回源码」（用**隔离库**，不碰生产）。
 *
 * 判据（按重要性排序）：
 *  ① 写回后源码里确实变了；
 *  ② 写回的文本与**页面上的当前生效值**逐字相同（转义正确）；
 *  ③ 覆盖项**仍在**（用户裁定：保留）；
 *  ④ 三态从 `edited` 变成 `written`；
 *  ⑤ 再次写回 ⇒ `already-same`（**幂等**）；
 *  ⑥ 运行期取值不受影响（写回前后 `promptCurrent` 相同）。
 */
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ⚠️ **Windows 上 ESM 的裸绝对路径会被当成 URL scheme（`d:`）** ⇒ 必须用
//    **相对说明符**（本项目已有脚本踩过：`ERR_UNSUPPORTED_ESM_URL_SCHEME`）。
const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const PLUGIN = ROOT

const lib = mkdtempSync(join(tmpdir(), 'memj-wb-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import('../lib/index.js')
const WB = mod

let pass = 0
let fail = 0
const check = (ok, label, extra = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${extra !== '' ? '  [' + extra + ']' : ''}`)
  if (ok) pass += 1
  else fail += 1
}

// ── 准备：跑一遍 apply 让默认值登记上 ──
const injected = []
const logger = { info() {}, warn() {}, error() {} }
const mkCtx = (extra = {}) => ({
  logger, get: () => undefined, on: () => () => {},
  effect(fn) { try { fn() } catch { /* 忽略 */ } return () => {} },
  inject(deps, cb) { injected.push(cb) },
  ...extra,
})
mod.apply(mkCtx(), mod.DEFAULT_CONFIG)
for (const cb of injected) {
  try {
    cb(mkCtx({
      systemPrompt: { section: () => () => {}, context: () => () => {}, tools: () => () => {}, getSectionOrder: () => 1, getContextOrder: () => 1 },
      tools: { register: () => () => {} },
      commands: { register: () => () => {} },
    }))
  } catch { /* 忽略 */ }
}

console.log('库根（临时）:', lib)

// ── 选一条**单引号串**形态、且**无英文校验**的 key 做端到端 ──
//    ⚠️ 为什么避开 `jev:*`：它们带 `englishOnly` 校验 ⇒ 插中文会被**正当拒收**
//      （第一版就撞上它，报"必须全英文"——那是校验在正常工作，不是 bug）。
//    ⚠️ 这会真改插件源码 ⇒ 先读原文备份，`finally` 里还原。
const KEY = 'hot:body-closing'
const TARGET = join(PLUGIN, 'src', 'hot-inject.ts')
const CONST_NAME = 'HOT_BODY_CLOSING_INSTRUCTION'
const backup = readFileSync(TARGET, 'utf8')

let pass2 = 0
try {
  const before = mod.promptCurrent(KEY)
  const NEW = before + '\n【端到端验证插入的一行】'

  // ── ① 存一个覆盖值（模拟"用户在页面上改了"）──
  const saved = await mod.savePromptOverride(KEY, NEW)
  check(saved.ok, '① 保存覆盖值成功', saved.errors.join('；'))
  if (!saved.ok) throw new Error('保存失败，后续无从验证')

  // ── ② 三态应为 edited ──
  const st1 = WB.writeBackState(KEY)
  check(st1 === 'edited', '② 改完未写回 ⇒ 三态 = edited', st1)

  // ── ③ 运行期取值 = 新值 ──
  check(mod.promptCurrent(KEY) === NEW, '③ 运行期取到新值（覆盖层优先）')

  // ── ④ 执行写回 ──
  const r = await WB.writeBackToSource([KEY])
  const item = r.items.find((x) => x.key === KEY)
  check(item?.status === 'written', '④ 写回状态 = written', `${item?.status} ${item?.message ?? ''}`)

  // ── ⑤ 源码里确实变了，且与页面值**逐字相同**（验证转义正确）──
  const srcAfter = readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n')
  const loc = WB.locateTemplateBody(srcAfter, CONST_NAME)
  if (loc === undefined) {
    check(false, '⑤ 能在源码里重新定位到该常量', '定位失败')
  } else {
    const inSrc = WB.unescapeFromTemplate(srcAfter.slice(loc.bodyStart, loc.bodyEnd), loc.quote)
    check(inSrc === NEW, '⑤ 源码里的值与页面值逐字相同（转义/反转义对称）',
      `src=${inSrc.length} 期望=${NEW.length}`)
  }

  // ── ⑥ 覆盖项**仍在**（用户裁定：保留）──
  const ovPath = join(lib, 'prompts', 'overrides.json')
  const ov = JSON.parse(readFileSync(ovPath, 'utf8'))
  check(ov.overrides[KEY] !== undefined, '⑥ 覆盖项保留（未被删除）')

  // ── ⑦ 三态应变成 written ──
  const st2 = WB.writeBackState(KEY)
  check(st2 === 'written', '⑦ 写回后三态 = written', st2)

  // ── ⑧ 幂等：再写一次 ⇒ already-same ──
  const r2 = await WB.writeBackToSource([KEY])
  const item2 = r2.items.find((x) => x.key === KEY)
  check(item2?.status === 'already-same', '⑧ 重复写回 ⇒ already-same（幂等）', `${item2?.status}`)

  // ── ⑨ 运行期取值不受影响 ──
  check(mod.promptCurrent(KEY) === NEW, '⑨ 运行期取值不受写回影响（仍是同一个值）')

  // ── ⑩ 不支持写回的条目要明确报，而不是静默跳过 ──
  const r3 = await WB.writeBackToSource(['tool:memj_info:parameters'])
  const item3 = r3.items.find((x) => x.key === 'tool:memj_info:parameters')
  check(item3?.status === 'unsupported', '⑩ 参数 schema ⇒ 明确报 unsupported', `${item3?.status}`)

  // ── ⑪ ⭐ 三种源码形态都要能定位（回归：第一版漏了"值在下一行"那种）──
  const cases = [
    ['protocol.ts', 'PROTOCOL_TEXT', '模板串'],
    ['hot-inject.ts', CONST_NAME, '单引号串'],
    ['active-recall.ts', 'JEV_NEED_INSTRUCTION', '值在下一行'],
    ['tag-normalize.ts', 'ADJUDICATE_SYSTEM', '重构后的模板串（原数组）'],
  ]
  for (const [f, c, label] of cases) {
    const s = readFileSync(join(PLUGIN, 'src', f), 'utf8').replace(/\r\n/g, '\n')
    check(WB.locateTemplateBody(s, c) !== undefined, `⑪ 能定位 ${c}（${label}）`)
  }
} finally {
  // ⚠️ **必须还原源码**：这次验证真的改了插件文件。
  writeFileSync(TARGET, backup, 'utf8')
  console.log('\n（已还原源码）')
}

console.log(`\n═══ 端到端：${pass} 通过 / ${fail} 失败 ═══`)
try { rmSync(lib, { recursive: true, force: true }) } catch { /* 忽略 */ }
process.exit(fail === 0 ? 0 : 1)
