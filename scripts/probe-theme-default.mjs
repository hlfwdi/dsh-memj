/**
 * ⭐⭐ 探针：`themeCreation` 的**默认值真的是 `loose`（宽松）**。
 *
 * ── 它守的是什么 ──────────────────────────────────────────────────────────
 * 用户 **2026-10-12 裁定**把该键的默认值由 `strict` 改成 `loose`。
 * 🔴 这个默认值有**两处**必须同步（`.default()` 与 `DEFAULT_CONFIG`），
 *    而且"值写对了"**不等于**"行为真的变了"——`runHandoff` 读的是**生效配置**。
 *    ⇒ 本探针**不满足于断言那个字面量**：它**不显式传 `themeCreation`**，
 *      直接拿 `Config({})`（= DSH 加载器在用户 patch 里没写该键时产出的那份配置）
 *      跑一次真实的 `runHandoff`，看它是否**真的按宽松走**。
 *
 * ── 为什么每条都要有【反证】臂 ─────────────────────────────────────────────
 * 只断言"没证据也放行"**证明不了宽松生效**——"那道闸门被整体删掉"同样会让它绿。
 * ⇒ 【2b】用**同一份输入**、只把配置显式改回 `strict`，必须**拒绝**。
 *    两臂都过，才能说"是默认值在起作用"，而不是"闸门没了"。
 *    （本项目同族教训：单侧断言看不出闸门是否真的存在。）
 *
 * ── 与 `test-theme-mode.mjs` 的分工 ────────────────────────────────────────
 * · `test-theme-mode.mjs`【1】测**配置契约**（那两个字面量、取值受控）；
 * · 本探针测**端到端行为**（真的按宽松跑）+ 设置页生效路径。
 *   两者互补：前者管"写对了没有"，后者管"跑起来是不是那样"。
 *
 * ⚠️ 必须在 `node scripts/build.mjs` 之后跑（import `lib/` 产物）。
 * ⚠️ 库根是 `mkdtempSync` 的临时目录（`MEMJ_DATA_DIR`）——**绝不碰生产库**。
 * 用法：node scripts/probe-theme-default.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = mkdtempSync(join(tmpdir(), 'memj-theme-default-'))
process.env['MEMJ_DATA_DIR'] = lib

const mod = await import(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${extra === '' ? '' : `　← ${extra}`}`) }
}

// ══════════════════════════════════════════════════════════════════════
console.log('【1】配置契约：两处默认值都必须是 loose，且**不得漂开**')
// ══════════════════════════════════════════════════════════════════════
// `Config({})` = 用户 patch 里**什么都没写** ⇒ schemastery 填默认值。
// 这是"新默认值生效"的**唯一入口**（插件启动时 DSH 传的就是它）。
const defaultCfg = mod.Config({})
check('schemastery 默认值（Config({})）= loose',
  defaultCfg.themeCreation === 'loose', String(defaultCfg.themeCreation))
check('DEFAULT_CONFIG.themeCreation = loose',
  mod.DEFAULT_CONFIG.themeCreation === 'loose', String(mod.DEFAULT_CONFIG.themeCreation))
check('⭐ 两处一致（不同步 ⇒ 探针与真实启动会给出不同答案）',
  defaultCfg.themeCreation === mod.DEFAULT_CONFIG.themeCreation,
  `${defaultCfg.themeCreation} vs ${mod.DEFAULT_CONFIG.themeCreation}`)
check('strict 仍是**合法**取值（只是不再是默认）',
  mod.Config({ themeCreation: 'strict' }).themeCreation === 'strict')

// ══════════════════════════════════════════════════════════════════════
console.log('\n【2】⭐⭐ 强证据：不传 themeCreation ⇒ runHandoff 真的按宽松走')
// ══════════════════════════════════════════════════════════════════════
// 🔴 每一臂用**各自全新的项目 id**：项目一旦被建出来，"写 doc 前必须先读文档"
//    （决策 112）就会接管，掩盖掉本探针真正要测的那道闸门（那是**另一个**校验）。
//    第一版两臂共用同一个 project id ⇒ 第二臂假红。
const newThemeReq = (projectId, id) => ({
  project: projectId,                 // 全新项目（无文档 ⇒ 豁免"先读"校验）
  projectDesc: '探测默认主题模式的临时项目；当验证默认值时读它。',
  doc: '## 目标\n\n探测默认值。',
  newThemes: [{ id, desc: '探测默认值用的主题；当验证默认模式时读它。' }],
})

// ── 2a. 默认配置：零读快照（无任何跨项目证据）⇒ 宽松下必须放行 ──
const looseRes = await mod.runHandoff(
  newThemeReq('probe-proj-default', 'thm-probe-default'),
  { sessionId: 'probe-sess-default', turn: 1, config: defaultCfg },
)
check('⭐⭐ 无跨项目证据 ⇒ **放行**（宽松行为）', looseRes.ok === true,
  looseRes.ok ? '' : looseRes.message.slice(0, 220))
check('  真的建出了该主题', looseRes.createdThemes.includes('thm-probe-default'),
  JSON.stringify(looseRes.createdThemes))
check('  THEME 文档已落盘', existsSync(join(lib, 'themes', 'THEME-thm-probe-default.md')))
check('  ⭐ 回执自称"宽松模式"', looseRes.message.includes('宽松模式'), looseRes.message.slice(-300))

// ── 2b. 反证：同一份输入，只把 themeCreation 显式改回 strict ⇒ 必须拒绝 ──
// 🔴 没有这一臂，2a 的"放行"无法排除"闸门被整体删掉了"（那样两条都会绿）。
const strictRes = await mod.runHandoff(
  newThemeReq('probe-proj-strict', 'thm-probe-strict'),
  { sessionId: 'probe-sess-strict', turn: 1, config: { ...defaultCfg, themeCreation: 'strict' } },
)
check('⭐⭐ 显式 strict + 无证据 ⇒ **拒绝**（闸门仍在，2a 不是假绿）',
  strictRes.ok === false, strictRes.ok ? '竟然放行了' : '')
check('  拒绝理由提到"跨项目证据"',
  strictRes.message.includes('跨项目证据'), strictRes.message.slice(0, 220))
check('  未建出该主题', !existsSync(join(lib, 'themes', 'THEME-thm-probe-strict.md')))

// ══════════════════════════════════════════════════════════════════════
console.log('\n【3】⭐ 宽松**只拆闸门、不拆完整性**（另两条校验照跑）')
// ══════════════════════════════════════════════════════════════════════
const noDesc = await mod.runHandoff(
  {
    project: 'probe-proj-nodesc',
    projectDesc: '探测缺 desc 的项目；当验证时读它。',
    doc: '## 目标\n\nx',
    newThemes: [{ id: 'thm-probe-nodesc', desc: '' }],
  },
  { sessionId: 'probe-sess-default', turn: 2, config: defaultCfg },
)
check('新默认下缺 desc ⇒ 仍拒绝',
  noDesc.ok === false && noDesc.message.includes('desc'), noDesc.message.slice(0, 160))

// 近义 id ⇒ 仍要回确认（`thm-probe-default` 已存在，编辑距离 ≤2）。
const similar = await mod.runHandoff(
  {
    project: 'probe-proj-similar',
    projectDesc: '探测近义 id 的项目；当验证时读它。',
    doc: '## 目标\n\nx',
    newThemes: [{ id: 'thm-probe-defaul2', desc: '近义探测；当验证防重名时读它。' }],
  },
  { sessionId: 'probe-sess-default', turn: 3, config: defaultCfg },
)
check('新默认下近义 id ⇒ 仍回相似项确认', similar.ok === false, similar.message.slice(0, 200))
check('  相似项里点名了那个已有主题',
  (similar.similarThemes ?? []).includes('thm-probe-default'),
  JSON.stringify(similar.similarThemes))

// ══════════════════════════════════════════════════════════════════════
console.log('\n【4】⭐ 设置页生效路径：patch 里没写该键 ⇒ 面板回显 loose')
// ══════════════════════════════════════════════════════════════════════
// 🔴 这条补的是"**前端那个单选按钮会预选哪一个**"：它由 `GET /settings` 的返回值决定
//    （`app.js`：`r.checked = r.value === s.themeCreation`），HTML 里**没有**硬编码
//    `checked` ⇒ "面板预选宽松"完全取决于【1】那一处默认值。
{
  const prof = join(lib, 'fake-profile')
  mkdirSync(prof, { recursive: true })
  // ⚠️ patch 文件是**顶层 YAML 序列**（条目 id 是 `memj`，不是包名 `dsh-memj`）
  //    —— 与 `test-web-api.mjs` 里那份假 patch 同形。
  //    第一版手写成 `entries:` 映射 ⇒ 解析不到该条目 ⇒ 反证臂假红。
  const patch = join(prof, 'cordis.patch.yml')
  const NO_CONFIG = [
    '# Your patch layer for this dsh profile, applied after every bundle layer:',
    '- id: memj',
    '  name: dsh-memj',
    '',
  ].join('\n')
  writeFileSync(patch, NO_CONFIG, 'utf8')
  writeFileSync(
    join(prof, 'package.json'),
    JSON.stringify({ dsh: { profile: { patchReload: 'live' } } }),
    'utf8',
  )

  const callSettings = () => mod.handleApi(
    { version: 'probe', config: defaultCfg, baseUrl: pathToFileURL(prof + '\\').href, pluginId: 'memj' },
    'GET',
    '/plugins/dsh-memj/api/settings',
    '',
    new URL('http://x/').searchParams,
  )

  const res = await callSettings()
  check('GET /settings ⇒ 200', res.status === 200, String(res.status))
  check('⭐⭐ 面板拿到的 themeCreation = loose（⇒ 单选按钮预选「宽松」）',
    res.body.themeCreation === 'loose', String(res.body.themeCreation))

  // 反证：磁盘显式写了 ⇒ 面板**照磁盘**回显（"磁盘优先"那层没坏）。
  writeFileSync(patch, `${NO_CONFIG}  config:\n    themeCreation: strict\n`, 'utf8')
  const res2 = await callSettings()
  check('  反证：磁盘显式写了 strict ⇒ 面板照实回 strict',
    res2.body.themeCreation === 'strict', String(res2.body.themeCreation))
}

rmSync(lib, { recursive: true, force: true })
console.log(`\n═══ 探针结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
