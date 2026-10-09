// ⭐ test-kind-dynamic-enum.mjs —— 盯住「B：kind 的动态性由【运行期】保证，不是 schema」
//
// 🔴🔴 本套件的**结论在 2026-10-09 被实测推翻过一次**，这里如实记下来：
//
//   我第一版以为"要修 enum 的 getter 被展开吃掉"，于是用一个 symbol 标记穿过展开、
//   在最终参数对象上**重装 getter**。结果 **4 个工具整条注册失败**：
//     JsonSchemaError: unsupported JSON schema:
//       parameters.entries.items.properties.kind must be a value schema object
//   ⭐ 根因（`dsh-tools/lib/index.js` 的 `isJsonSchemaRecord`）：
//     DSH 要求参数对象 **只有 own enumerable string keys**
//     （`hasOnlyEnumerableStringKeys`：`Reflect.ownKeys(v).every(k => typeof k === 'string' && …)`）
//     ⇒ **symbol 键不合格**；**访问器属性**同样不合格（它要的是"value schema object"）。
//   ⇒ 🔴 **动态 schema 在参数层从原理上做不到**（DSH 会把 parameters 编译成 JSON Schema）。
//   ⚠️ 而"展开吃掉 getter"那个"bug"**恰好让 schema 变成静态数据属性** ——
//     它**无意中满足了 DSH 的要求**，所以那 5 个工具一直能注册。
//
// ✅ **所以正确设计是两级**：
//   · **参数层**（`enum`）：注册时快照、静态 —— 满足 DSH；它只是"告诉模型有哪些可选"的**建议面**；
//   · **运行期**（`validateEntryKinds` 里的 `isEntryKind` + `selectableKindList`）：
//     ⭐ 读**进程内当前词表** ⇒ **用户新加的类型立刻能通过校验**，且报错列出**当前**全部合法值。
//
// ⭐ 本套件因此断言的是**这个两级设计**，而不是"enum 是不是 getter"。

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '..', 'src')

/** 🔴 判源码前先剥注释（本项目已因此栽过两次：注释里逐字引用旧代码 ⇒ 假红）。 */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const toolsSrc = stripComments(readFileSync(join(SRC, 'tools.ts'), 'utf8'))
const handoffSrc = stripComments(readFileSync(join(SRC, 'handoff.ts'), 'utf8'))
const schemaSrc = stripComments(readFileSync(join(SRC, 'schema.ts'), 'utf8'))

let pass = 0
let fail = 0
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅', name) }
  catch (e) { fail++; console.log('  ❌', name, '\n       ', String(e.message).split('\n')[0]) }
}

console.log('【1】参数层必须是【静态数据属性】（DSH 的硬要求，违反 = 工具整条注册失败）')
t('`kindParam` 不再用 `Object.defineProperty` 造 getter', () => {
  // 只检查 kindParam 那一段（它到 safeRegister 之前结束）
  const start = toolsSrc.indexOf('const kindParam')
  const end = toolsSrc.indexOf('const safeRegister')
  assert.ok(start > 0 && end > start, '找不到 kindParam 段')
  const seg = toolsSrc.slice(start, end)
  assert.ok(!/defineProperty\(o, 'enum'/.test(seg),
    '🔴 kindParam 又去造 getter 了 ⇒ DSH 会判 "must be a value schema object"、工具整条挂掉')
  assert.ok(!/KIND_DYNAMIC|Symbol\(/.test(seg),
    '🔴 又引入了 symbol 标记 ⇒ 违反 hasOnlyEnumerableStringKeys、工具整条挂掉')
})
t('`enum` 是当场算出来的普通值', () => {
  const start = toolsSrc.indexOf('const kindParam')
  const end = toolsSrc.indexOf('const safeRegister')
  const seg = toolsSrc.slice(start, end)
  assert.ok(/enum:\s*currentKindsOf\(\)/.test(seg),
    '🔴 enum 不是"读当前词表算出的普通数组"')
})
t('全文件里没有 KIND_DYNAMIC 残留', () => {
  assert.ok(!/KIND_DYNAMIC/.test(toolsSrc), '🔴 还有 symbol 标记残留')
})

console.log('\n【2】⭐ 运行期必须现算（这才是"用户加的类能用"的真正保证）')
t('handoff 的 kind 校验走 `isEntryKind`（读进程内词表）', () => {
  assert.ok(/isEntryKind\(rawKind\)/.test(handoffSrc),
    '🔴 没在运行期校验 kind ⇒ 参数层的静态 enum 会变成真正的闸门（用户新加的类型会被拒）')
})
t('报错文案用 `selectableKindList()`（现算、且排除保留项）', () => {
  assert.ok(/selectableKindList\(\)/.test(handoffSrc),
    '🔴 报错没列当前合法值 ⇒ 用户改错时不知道正确名字')
  assert.ok(!/ENTRY_KINDS\.join/.test(handoffSrc),
    '🔴 又用 `ENTRY_KINDS.join()` 了 ⇒ 它是编译期表、不含用户加的类型')
})
t('`isEntryKind` 读的是【当前生效】的词表（不是编译期常量）', () => {
  assert.ok(/currentDefs\.some\(\(d\) => d\.id === value\)/.test(schemaSrc),
    '🔴 isEntryKind 改回读编译期表了 ⇒ 用户加的类型会被判非法')
})
t('`selectableKindList` 也读当前值且排除保留项', () => {
  assert.ok(/currentDefs\.filter\(\(d\) => !d\.reserved\)/.test(schemaSrc),
    '🔴 selectableKindList 没读当前值/没排除保留项')
})

console.log('\n【3】5 个调用点未被本修法波及（它们照旧写 `...kindParam(...)`）')
t('仍是 5 处 `...kindParam(...)`', () => {
  const n = (toolsSrc.match(/\.\.\.kindParam\(/g) ?? []).length
  assert.equal(n, 5, `期望 5 处，实得 ${n} 处`)
})
t('⚠️ 展开仍然会求值 enum —— 但那**现在是设计**（不是 bug）', () => {
  // ⭐ 这条断言是"把设计意图钉住"：若将来有人把 kindParam 改回 getter，
  //    上面【1】会报红；而这条说明"为什么当时那样写看起来能用"。
  const start = toolsSrc.indexOf('const kindParam')
  const end = toolsSrc.indexOf('const safeRegister')
  const seg = toolsSrc.slice(start, end)
  assert.ok(/enum:/.test(seg), 'kindParam 里没有 enum 了？')
})

console.log('\n【4】🔴 反证臂：把运行期校验拿掉 ⇒ 本套件必须报红')
t('（反证）若 handoff 不调 isEntryKind，断言会失败', () => {
  const fake = handoffSrc.replace(/isEntryKind\(rawKind\)/g, 'true')
  assert.ok(!/isEntryKind\(rawKind\)/.test(fake), '替换没生效')
  assert.throws(() => {
    assert.ok(/isEntryKind\(rawKind\)/.test(fake), '模拟"拿掉运行期校验"')
  }, '🔴 反证臂失效：这条断言不会因为缺少运行期校验而报红')
})

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
