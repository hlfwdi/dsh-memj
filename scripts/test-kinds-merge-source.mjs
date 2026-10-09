// ⭐ test-kinds-merge-source.mjs —— 盯住「C：内置项的【身份字段】以源码为准」
//
// 🔴 为什么需要它：决策 223 改了内置项 `history` 的 label，但库里的 `kinds.md` 还是旧的
//    ⇒ `loadKinds()` 当时只补"id 缺失"的内置项、**不更新已存在项的字段**
//    ⇒ 文件那份一直压着源码 ⇒ **`validateKinds()` 再也存不回去（库表被卡死）**。
//
// 判据（本项目既有）：**身份 vs 内容**
//   · `id` / `builtin` / `label` / `reserved` = **身份** ⇒ ⭐ 源码说了算
//   · `when` / `guide`                        = **内容**（决策 217 用户可编辑）⇒ ⭐ 文件说了算
//
// ⚠️ 本套件**必须用库副本**（`MEMJ_DATA_DIR` 指向临时目录）——
//    它会写 `kinds.md`。库里既有的判据：**测试里调 apply() 就等于写生产库**。

import { strict as assert } from 'node:assert'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ⭐ 先指副本目录，**再** import 库（模块级会读路径）。
const LIB = mkdtempSync(join(tmpdir(), 'memj-kinds-merge-'))
process.env.MEMJ_DATA_DIR = LIB
mkdirSync(join(LIB, 'projects'), { recursive: true })

const mod = await import('../lib/index.js')

// ── 自证：路径真的落在副本里（本项目判据：动手前先打印路径自证）──────────────
const actual = mod.kindsFilePath()
console.log('路径自证：kindsFilePath() =', actual)
if (!actual.startsWith(LIB)) {
  console.log('🔴 路径没落在副本里 ⇒ 拒绝运行（会写生产库）')
  process.exit(1)
}

let pass = 0
let fail = 0
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅', name) }
  catch (e) { fail++; console.log('  ❌', name, '\n       ', String(e.message).split('\n')[0]) }
}

/** 写一份"故意过时"的 kinds.md：history 的 label/when 都是旧的、还带保留标记。 */
function writeStaleKinds() {
  const doc = [
    '---', 'version: 1', '---', '',
    '# 知识类型', '',
    '## fact', '', '显示名：fact（事实 / 接口） <!-- 内置 -->', '什么时候用：陈述结论', '书写规范：是什么', '',
    '## trap', '', '显示名：trap（陷阱 / 纠错） <!-- 内置 -->', '什么时候用：出过错的事', '书写规范：现象', '',
    '## howto', '', '显示名：howto（流程步骤） <!-- 内置 -->', '什么时候用：有顺序的步骤', '书写规范：编号', '',
    '## decision', '', '显示名：decision（决策 + 理由） <!-- 内置 -->', '什么时候用：做过选择', '书写规范：结论', '',
    // 🔴 关键：**旧的** label + **旧** when + 保留标记（正是生产库当时的样子）
    '## history', '', '显示名：history（历史进展归档·不参与检索） <!-- 内置 --> <!-- 保留 -->',
    '什么时候用：（工具自动生成，不手工填写）', '书写规范：', '',
    // 用户自定义的类型（必须原样保住，连 when/guide 一起）
    '## mykind', '', '显示名：mykind（我的类型）', '什么时候用：我自己的场景', '书写规范：随便写', '',
  ].join('\n')
  writeFileSync(join(LIB, 'kinds.md'), doc, 'utf8')
}

console.log('\n【1】内置项的【身份】字段以源码为准（修 C 的核心）')
writeStaleKinds()
const merged = await mod.loadKinds()
const hist = merged.find((d) => d.id === 'history')
const builtinHist = mod.builtinKindDefs().find((d) => d.id === 'history')

t('history 的 label 被源码纠正了（不再是旧的「历史进展归档」）', () => {
  assert.equal(hist.label, builtinHist.label,
    `🔴 label 还是库里的旧值「${hist.label}」⇒ 源码的身份字段没生效`)
})
t('🔴 history 的 reserved 被源码纠正（旧文件写着保留）', () => {
  assert.equal(hist.reserved, builtinHist.reserved,
    '🔴 reserved 还是 true ⇒ 工具 enum 会漏掉 history（这正是本次的现场 bug）')
})
t('history 的 builtin 仍是 true', () => {
  assert.equal(hist.builtin, true)
})

console.log('\n【2】⭐ 内置项的【内容】字段以文件为准（不能抹掉用户的编辑）')
t('history 的 when 保留文件里的值（用户可编辑，不能被源码覆盖）', () => {
  assert.equal(hist.when, '（工具自动生成，不手工填写）',
    '🔴 when 被源码覆盖了 ⇒ 会静默抹掉用户对内置项的编辑（决策 217 明确允许改它）')
})
t('history 的 guide 也保留文件里的空值', () => {
  assert.equal(hist.guide, '', '🔴 guide 被源码覆盖了')
})

console.log('\n【3】用户自定义的类型完全不受影响')
const mine = merged.find((d) => d.id === 'mykind')
t('自定义类型还在', () => { assert.ok(mine, '🔴 自定义类型丢了') })
t('自定义类型的 when/guide 原样保留', () => {
  assert.equal(mine.when, '我自己的场景')
  assert.equal(mine.guide, '随便写')
})

console.log('\n【4】🔴 反证臂：修好之后，库那张表必须【能存回去】')
t('合并后的表能通过 validateKinds（= 设置页能保存）', () => {
  const errs = mod.validateKinds(merged)
  assert.equal(errs.length, 0,
    `🔴 仍被拒 ⇒ 库表依然卡死：\n       ${errs.join('\n       ')}`)
})
t('反证：**未合并**的旧表会被拒（证明这条断言真能报红）', () => {
  const stale = [
    { id: 'fact', label: 'fact（事实 / 接口）', when: 'x', guide: '', builtin: true, reserved: false },
    { id: 'trap', label: 'trap（陷阱 / 纠错）', when: 'x', guide: '', builtin: true, reserved: false },
    { id: 'howto', label: 'howto（流程步骤）', when: 'x', guide: '', builtin: true, reserved: false },
    { id: 'decision', label: 'decision（决策 + 理由）', when: 'x', guide: '', builtin: true, reserved: false },
    // 🔴 旧 label ⇒ 校验必须拒它
    { id: 'history', label: 'history（历史进展归档·不参与检索）', when: 'x', guide: '', builtin: true, reserved: true },
  ]
  const errs = mod.validateKinds(stale)
  assert.ok(errs.length > 0,
    '🔴 旧表竟然通过了校验 ⇒ 说明 validateKinds 不再锁 label，本套件的反证臂失效')
})

console.log('\n【5】文件读不到时整体回落内置表（原有行为不能坏）')
t('删掉文件 ⇒ loadKinds 回内置表', async () => {
  rmSync(join(LIB, 'kinds.md'), { force: true })
})
// ⭐ 上面的删除与断言分开：`t` 是同步的，这里单独 await 一次
rmSync(join(LIB, 'kinds.md'), { force: true })
const fallback = await mod.loadKinds()
t('回落表 = 内置表（5 条）', () => {
  assert.equal(fallback.length, mod.builtinKindDefs().length)
  assert.ok(fallback.every((d) => d.builtin === true))
})

// 收尾：清掉临时目录
try { rmSync(LIB, { recursive: true, force: true }) } catch { /* 忽略 */ }

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
