/**
 * 新建主题双模式 + 设置读写（决策 95/96/97）。
 *
 * 覆盖两类：
 *  A. **`settings.ts` 的纯逻辑**——路径解析、YAML 定点改写（这是新代码里最容易出错的部分）；
 *  B. **模式开关的行为契约**——`DEFAULT_CONFIG` 必须是 **loose**（2026-10-12 改）、取值受控。
 *
 * ⚠️ 双模式的**端到端正反对照**在 `test-handoff.mjs`【17】–【19】；
 *    接口层的 GET/POST 在 `test-web-api.mjs`【8】。本文件补的是**模块内部契约**。
 *
 * ⚠️ 必须在 `pnpm run build` 之后跑（import `lib/` 产物）。
 * 用法：node scripts/test-theme-mode.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-theme-mode-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)

/**
 * 取 `settings.ts` 的导出。
 *
 * ⚠️ **不能写死文件名**：`settings.ts` 被**静态 import**，打包器会把它
 * **内联进主 chunk**（`lib/index.js`）——`lib/settings.js` 那个文件**根本不存在**。
 * 早先 `api.ts` 也有同样的形态问题（见 `test-web-api.mjs` 的 `loadApiModule`）。
 * ⇒ 先看 `index.js`；兜底再扫 `settings-*.js`（万一将来改回独立 chunk）。
 */
async function loadSettingsModule() {
  if (typeof mod.profileDirFrom === 'function') return mod
  const { readdirSync } = await import('node:fs')
  for (const f of readdirSync(join(process.cwd(), 'lib'))) {
    if (!f.startsWith('settings-') || !f.endsWith('.js')) continue
    const m = await import(pathToFileURL(join(process.cwd(), 'lib', f)).href)
    if (typeof m.profileDirFrom === 'function') return m
  }
  throw new Error('找不到 settings 的导出（既不在 index.js，也没有 settings-*.js）')
}
const { profileDirFrom, patchPathFrom, readSettings, writeSetting, THEME_CREATION_VALUES } =
  await loadSettingsModule()

let pass = 0
let fail = 0
const check = (n, c, e = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n} ${e}`) }
}

// ══════════════════════════════════════════════════════════════════════
console.log('【1】配置契约：默认必须是 loose、取值受控（决策 95；默认值 2026-10-12 由 strict 改为 loose）')
// ══════════════════════════════════════════════════════════════════════
// ⭐ 用户 2026-10-12 裁定：默认改为宽松。本组断言跟着改——
//    ⚠️ 它测的是"**默认值是什么**"，默认值变了就该跟着变（不是"绕过"）。
check('⭐ 默认 themeCreation = loose', mod.DEFAULT_CONFIG.themeCreation === 'loose',
  String(mod.DEFAULT_CONFIG.themeCreation))
check('合法取值只有 strict / loose',
  JSON.stringify([...THEME_CREATION_VALUES].sort()) === JSON.stringify(['loose', 'strict']),
  JSON.stringify(THEME_CREATION_VALUES))
// ⚠️ schemastery 的 Config 是 schema 对象，`Config(raw)` 会校验并填默认值。
check('schemastery 接受 loose', mod.Config({ themeCreation: 'loose' }).themeCreation === 'loose')
check('schemastery 接受 strict（严格仍是可选值，只是不再是默认）',
  mod.Config({ themeCreation: 'strict' }).themeCreation === 'strict')
check('schemastery 未给时填 loose 默认值',
  mod.Config({}).themeCreation === 'loose', String(mod.Config({}).themeCreation))
check('⭐ `DEFAULT_CONFIG` 与 schemastery 默认值**一致**（两处必须同步）',
  mod.DEFAULT_CONFIG.themeCreation === mod.Config({}).themeCreation,
  `${mod.DEFAULT_CONFIG.themeCreation} vs ${mod.Config({}).themeCreation}`)
check('⭐ schemastery **拒绝**非法取值', (() => {
  try { mod.Config({ themeCreation: 'yolo' }); return false } catch { return true }
})())

// ══════════════════════════════════════════════════════════════════════
console.log('\n【2】路径解析：由 ctx.baseUrl 推出 profile 目录与 patch 文件')
// ══════════════════════════════════════════════════════════════════════
const fakeProfile = join(lib, 'prof')
mkdirSync(fakeProfile, { recursive: true })
const baseHref = pathToFileURL(fakeProfile + '\\').href

check('profileDirFrom 解析出目录', profileDirFrom(baseHref).replace(/[\\/]$/, '') === fakeProfile.replace(/[\\/]$/, ''),
  profileDirFrom(baseHref))
check('patchPathFrom 拼出 cordis.patch.yml',
  patchPathFrom(baseHref).endsWith('cordis.patch.yml'), patchPathFrom(baseHref))
check('⭐ baseUrl 不可用 ⇒ 回空串（不抛、不瞎猜）', profileDirFrom(undefined) === '', profileDirFrom(undefined))
check('  baseUrl 为空串 ⇒ 回空串', patchPathFrom('') === '')
check('  乱码 baseUrl ⇒ 回空串', patchPathFrom('not-a-url') === '', patchPathFrom('not-a-url'))

// ══════════════════════════════════════════════════════════════════════
console.log('\n【3】读设置：文件不存在时的降级（不报假成功）')
// ══════════════════════════════════════════════════════════════════════
let r = await readSettings(baseHref, mod.DEFAULT_CONFIG)
check('patchPath 正确', r.patchPath.endsWith('cordis.patch.yml'), r.patchPath)
check('⭐ 文件不存在 ⇒ patchExists=false（不是错误）', r.patchExists === false)
check('  explicitKeys 为空', r.explicitKeys.length === 0, JSON.stringify(r.explicitKeys))
check('⭐ 没有 profile/package.json ⇒ patchReload=unknown（**无从判断**，如实报）',
  r.patchReload === 'unknown', r.patchReload)

// ⭐⭐⭐ **2026-10-07：`package.json` 在、但**没写** `patchReload` ⇒ 必须是 `live`**
//
// 🔴🔴 这条钉住的是一个**真实误报**（用户问"是不是都热加载"时查出来的）：
//    两代 DSH 都规定"没写 = live"——
//      · 0.1.5：该字段**可选**，类型注释原文 *"omitted means `live` for custom profiles"*，
//               且 `DEFAULT_PROFILE_PATCH_RELOAD = 'live'`；
//      · 0.2.0-rc.2：**该字段已被整个删除**，patch 文件由 `dsh-hmr` **无条件**监听
//               （`watchConfig()` 里没有任何开关判断）⇒ 恒为 live。
//    ⚠️ 本插件原来把"没写"也报成 `unknown`，于是页头**常年**挂着
//       「读不到…可能需要重启才生效」——而实测 **10/10 项设置都在 ~0.5–2.5 秒内
//       热生效**（`scripts/probe-hotreload-matrix.mjs`）⇒ **界面在说谎**，用户会去白重启。
//    ⇒ ⭐ 判据：**"无从判断"（拿不到文件）与"文档写明的默认值"是两件事**，
//       不能都塞进 `unknown`。把后者报成前者，等于让界面永远给出错误的保守建议。
{
  writeFileSync(join(fakeProfile, 'package.json'),
    JSON.stringify({ name: 'dsh-profile-no-reload-key', dsh: { profile: { bundles: [] } } }), 'utf8')
  const r2 = await readSettings(baseHref, mod.DEFAULT_CONFIG)
  check('⭐⭐⭐ package.json 在、但没写 patchReload ⇒ **live**（两代 DSH 的默认都是 live）',
    r2.patchReload === 'live', r2.patchReload)

  // ⚠️ 反证：**`startup` 仍必须照实回**——0.1.5 上那是用户刻意的选择，
  //    不能因为"默认是 live"就把显式声明也吞掉（那会让真需要重启的人不重启）。
  writeFileSync(join(fakeProfile, 'package.json'),
    JSON.stringify({ dsh: { profile: { patchReload: 'startup' } } }), 'utf8')
  const r3 = await readSettings(baseHref, mod.DEFAULT_CONFIG)
  check('⭐⭐ 反证：显式 startup **不被默认值吞掉**（照实回 startup）',
    r3.patchReload === 'startup', r3.patchReload)

  // ⚠️ 反证：**值不认识**（脏数据）也按默认 live（不是 unknown）——同一条判据。
  writeFileSync(join(fakeProfile, 'package.json'),
    JSON.stringify({ dsh: { profile: { patchReload: 'wat' } } }), 'utf8')
  const r4 = await readSettings(baseHref, mod.DEFAULT_CONFIG)
  check('  ⭐ 认不出的值 ⇒ 也回 live（按"没写"处理，不报 unknown）',
    r4.patchReload === 'live', r4.patchReload)
}

// 补上 package.json 声明 live。
writeFileSync(join(fakeProfile, 'package.json'),
  JSON.stringify({ dsh: { profile: { patchReload: 'live' } } }), 'utf8')
r = await readSettings(baseHref, mod.DEFAULT_CONFIG)
check('⭐ 读到 live ⇒ patchReload=live', r.patchReload === 'live', r.patchReload)

writeFileSync(join(fakeProfile, 'package.json'),
  JSON.stringify({ dsh: { profile: { patchReload: 'startup' } } }), 'utf8')
r = await readSettings(baseHref, mod.DEFAULT_CONFIG)
check('⭐ 读到 startup ⇒ patchReload=startup（面板据此提示要重启）',
  r.patchReload === 'startup', r.patchReload)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【4】写设置：从零新建文件')
// ══════════════════════════════════════════════════════════════════════
writeFileSync(join(fakeProfile, 'package.json'),
  JSON.stringify({ dsh: { profile: { patchReload: 'live' } } }), 'utf8')
const patchFile = join(fakeProfile, 'cordis.patch.yml')

let w = await writeSetting(baseHref, 'themeCreation', 'loose')
check('写入成功', w.ok === true, w.message)
check('文件已创建', readFileSync(patchFile, 'utf8').length > 0)
let text = readFileSync(patchFile, 'utf8')
check('含 id: memj', /^-\s*id:\s*memj\s*$/m.test(text), text)
check('含 themeCreation: loose', /themeCreation:\s*loose/.test(text), text)
check('⭐ live ⇒ needsRestart=false', w.needsRestart === false)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【4b】⭐⭐ entry id 必须是 `memj`，**不是包名 `dsh-memj`**')
// 🔴 这条来自**真实实例实测**（2026-09-19）：插件 bundle patch 写的是
//    `insert: [{ id: memj, name: dsh-memj }]` ⇒ 条目 id 是 `memj`。
//    早先写死 `dsh-memj` 导致写入**一条永远匹配不到的死条目**：
//    boot 只打一行 `patch: entry "dsh-memj" not found` 警告，配置**静默不生效**，
//    而面板还显示"已保存"——**必须有一条断言钉住这个 id**。
check('⭐⭐ 写的是 id: memj（条目 id，非包名）', /^-\s*id:\s*memj\s*$/m.test(text), text)
check('⭐⭐ **没有**写出 `id: dsh-memj`（那是包名，loader 匹配不到）',
  !/^-\s*id:\s*dsh-memj\s*$/m.test(text), text)
check('  默认 entryId 就是 memj（不传也能对）',
  (await writeSetting(baseHref, 'themeCreation', 'strict')).ok === true)
text = readFileSync(patchFile, 'utf8')
check('  默认调用后仍只有一条 memj', (text.match(/id: memj/g) ?? []).length === 1, text)

// ⭐ 按包名兜底：用户把 id 改成了别的名字，仍要能定位到那一条。
const RENAMED = [
  '- id: my-memj',
  '  name: dsh-memj',
  '  config:',
  '    similarEditDistance: 2',
  '',
].join('\n')
writeFileSync(patchFile, RENAMED, 'utf8')
await writeSetting(baseHref, 'themeCreation', 'loose')
const renamedAfter = readFileSync(patchFile, 'utf8')
check('⭐ id 被改成 my-memj 时，仍能按 `name: dsh-memj` 定位并写入',
  /themeCreation:\s*loose/.test(renamedAfter), renamedAfter)
check('  ⭐ 写进了**那一条**（没有另起一条 id: memj）',
  !/^-\s*id:\s*memj\s*$/m.test(renamedAfter) && (renamedAfter.match(/id: my-memj/g) ?? []).length === 1,
  renamedAfter)
check('  原有键保留', /similarEditDistance:\s*2/.test(renamedAfter), renamedAfter)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【5】⭐ 保留既有内容：注释 / 其他条目 / 其他键')
// ══════════════════════════════════════════════════════════════════════
const RICH = [
  '# Your patch layer for this dsh profile, applied after every bundle layer:',
  '# 禁用旧插件 dsh-memory（2026-09-16）——中文注释必须留住。',
  '- id: memory',
  '  disabled: true',
  '',
  '- id: memj',
  '  config:',
  '    similarEditDistance: 2',
  '',
].join('\n')
writeFileSync(patchFile, RICH, 'utf8')

w = await writeSetting(baseHref, 'themeCreation', 'strict')
check('写入成功', w.ok === true, w.message)
text = readFileSync(patchFile, 'utf8')
check('⭐⭐ 中文注释完好（不是 mojibake）',
  text.includes('禁用旧插件 dsh-memory（2026-09-16）') && !text.includes('\uFFFD'), text)
check('⭐ 原条目 `- id: memory` 完好',
  text.includes('- id: memory') && text.includes('disabled: true'), text)
check('⭐ 同一条目下的**其他键**保留（similarEditDistance）',
  /similarEditDistance:\s*2/.test(text), text)
check('新键已写入', /themeCreation:\s*strict/.test(text), text)
check('⭐ 没有出现两条 memj', (text.match(/id: memj/g) ?? []).length === 1, text)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【6】⭐ 幂等：同一值写两次 ⇒ 内容完全一致')
// ══════════════════════════════════════════════════════════════════════
const once = readFileSync(patchFile, 'utf8')
await writeSetting(baseHref, 'themeCreation', 'strict')
const twice = readFileSync(patchFile, 'utf8')
check('⭐ 幂等', once === twice, `${once.length} vs ${twice.length}`)

await writeSetting(baseHref, 'themeCreation', 'loose')
const three = readFileSync(patchFile, 'utf8')
check('可以来回切换', /themeCreation:\s*loose/.test(three), three)
check('  切换后仍只有一条 memj', (three.match(/id: memj/g) ?? []).length === 1)
check('  切换后注释仍在', three.includes('禁用旧插件 dsh-memory'), three)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【7】🔴 坏文件必须**拒绝写入**（不破坏用户文件）')
// ══════════════════════════════════════════════════════════════════════
const BROKEN = '- id: memory\n  disabled: true\n  : : 这不是合法 YAML [[[\n'
writeFileSync(patchFile, BROKEN, 'utf8')
w = await writeSetting(baseHref, 'themeCreation', 'loose')
check('⭐ 非法 YAML ⇒ ok=false（拒绝）', w.ok === false, w.message)
check('  理由说明"未写入"', w.message.includes('未写入'), w.message)
check('⭐⭐ 原文件**一字未动**（不半写、不清空）', readFileSync(patchFile, 'utf8') === BROKEN)

// 读设置遇到坏文件也要如实报，而不是假装正常。
r = await readSettings(baseHref, mod.DEFAULT_CONFIG)
check('⭐ 读坏文件 ⇒ 在 error 里如实报', r.error !== '', r.error.slice(0, 120))

// ══════════════════════════════════════════════════════════════════════
console.log('\n【8】startup profile ⇒ 明确告知要重启（§8.8.4）')
// ══════════════════════════════════════════════════════════════════════
writeFileSync(join(fakeProfile, 'package.json'),
  JSON.stringify({ dsh: { profile: { patchReload: 'startup' } } }), 'utf8')
writeFileSync(patchFile, RICH, 'utf8')
w = await writeSetting(baseHref, 'themeCreation', 'loose')
check('写入成功', w.ok === true, w.message)
check('⭐ needsRestart=true', w.needsRestart === true)
check('⭐ 回执明说要重启（不假装已生效）', w.message.includes('重启'), w.message)

// ══════════════════════════════════════════════════════════════════════
console.log('\n【9】baseUrl 不可用 ⇒ 拒绝写入并说清原因')
// ══════════════════════════════════════════════════════════════════════
w = await writeSetting(undefined, 'themeCreation', 'loose')
check('⭐ ok=false', w.ok === false, w.message)
check('  说明是拿不到 profile 路径', w.message.includes('profile'), w.message)
check('  patchPath 为空', w.patchPath === '', w.patchPath)

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 双模式/设置结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
