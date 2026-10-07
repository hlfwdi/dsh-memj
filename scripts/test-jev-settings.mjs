/**
 * ⭐⭐⭐ **「决策模型配置」接线体检**（2026-10-07，用户要求）。
 *
 * ── 用户要求（原话）──────────────────────────────────────────────────────
 * > *"我还是需要能够在 dsh 前端去配置决策模型的。而不是这样，直接在环境里直连。
 * >   哪怕是在插件的前端里面去配置。"*
 * > *"路线A，密钥走 seAm，两条都做。设置界面里给个统一配置的地方，
 * >   子导航页叫决策模型配置。"*
 *
 * ── 🔴 为什么这需要一套机械检查 ────────────────────────────────────────────
 * 这件事要动**六处**，而**漏掉任何一处都不会报错**（页面照常打开、按钮照常能点）：
 *   ① `config.ts` 的新键 + 两个回落后缀（`jevModelOf` / `scoreJevModelOf`）
 *   ② `active-recall.ts` / `score-turn.ts` **两条通路都改读它**
 *   ③ `settings.ts` 白名单（漏了 ⇒ `writeSetting` 直接拒）
 *   ④ `api.ts` 的 GET 透出 / POST 校验 / "至少给一个"条件（漏了 ⇒ 400）
 *   ⑤ `index.html` 子导航按钮 + 页面骨架（id 对不上 ⇒ 点了没反应）
 *   ⑥ `app.js` 打开函数 + 三个动作的绑定
 * 本项目**已多次因"只改一半"出事故**，所以这里逐条钉住。
 *
 * 🔴🔴 **本套件最要紧的一条**：**密钥绝不回显**。
 *    这是一条**安全断言**，不是功能断言 —— 回归会直接泄露用户密钥。
 *
 * ⚠️ 纯静态（读源码）。真发请求的端到端在隔离实例上用浏览器验。
 * 用法：node scripts/test-jev-settings.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

let pass = 0, fail = 0
const check = (n, c, e = '') => {
  if (c) { pass++; console.log(`  ✅ ${n}`) }
  else { fail++; console.log(`  ❌ ${n}${e ? ' — ' + e : ''}`) }
}
/** 去注释（判"某写法不该出现"时，注释里提到它是**正常**的 —— 本项目踩过）。 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const cfg = read('src/config.ts')
const cfgCode = strip(cfg)
const ar = read('src/active-recall.ts')
const arCode = strip(ar)
const st = read('src/score-turn.ts')
const stCode = strip(st)
const set = read('src/settings.ts')
const api = read('src/api.ts')
const apiCode = strip(api)
const html = read('src/web/index.html')
const app = read('src/web/app.js')
const appCode = strip(app)

console.log('【1】⭐ 多 provider × 各自模型（用户："像 dsh 官方那样，可以配多个决策型模型"）')
{
  check('config.ts 有 `decisionProviders` 键',
    /decisionProviders: z\.array\(DecisionProviderSchema\)\.default\(\[\]\)/.test(cfgCode))
  check('⭐⭐ provider schema 是**具名常量**（内联会 TS2742 ⇒ 构建失败）',
    /const DecisionProviderSchema/.test(cfgCode))
  check('⭐⭐⭐ 且**带显式类型注解**（只具名不加注解**仍**报 TS2742 —— 已实测两次）',
    /const DecisionProviderSchema:\s*Schemastery</.test(cfgCode))
  check('⭐ provider schema 含 id/displayName/endpoint/models 四项',
    /id: z\.string\(\)[\s\S]{0,200}?displayName: z\.string\(\)[\s\S]{0,140}?endpoint: z\.string\(\)[\s\S]{0,140}?models: z\.array\(z\.string\(\)\)/.test(cfgCode))
  // ⭐ 凭据名**由 id 派生**、不问用户（与官方 README 同规则："页面从不询问环境变量名"）。
  check('⭐⭐ 有 `deriveDecisionKeyRef`（凭据名按 id 派生）',
    /export function deriveDecisionKeyRef\(/.test(cfgCode))
  check('⭐⭐⭐ 派生规则 = `<ID>_API_KEY`（knox → KNOX_API_KEY；与旧键默认值恰好相同 ⇒ 无缝）',
    /\$\{stem === '' \? 'DECISION' : stem\}_API_KEY/.test(cfgCode))
  check('⭐⭐ 有 `decisionProvidersOf`（生效列表的唯一出处）',
    /export function decisionProvidersOf\(/.test(cfgCode))
  check('⭐⭐ 有 `resolveDecisionPick`（`provider/model` 的唯一解析入口）',
    /export function resolveDecisionPick\(/.test(cfgCode))
  // ⭐ 空列表回落旧单 provider 三键（"改名不丢旧值"的既有纪律）。
  check('⭐⭐ 空列表时回落到旧的单 provider 三键（不丢已写在 patch 里的值）',
    /export function decisionProvidersOf\([\s\S]{0,900}?activeInjectJevEndpoint/.test(cfgCode))
  // 🔴 两条通路**各自选各自的**（不是共用一份）。
  check('⭐⭐ 有 `activeInjectDecisionPick` 与 `hotScoreDecisionPick` 两个选集键',
    /activeInjectDecisionPick: z\.string\(\)/.test(cfgCode)
    && /hotScoreDecisionPick: z\.string\(\)/.test(cfgCode))
  check('⭐⭐⭐ 主动注入走 `activeDecisionOf`', /activeDecisionOf\(config\)/.test(arCode))
  check('⭐⭐⭐ 轮末评分走 `scoreDecisionOf`', /const pick = scoreDecisionOf\(config\)/.test(stCode))
  // 🔴 反证：不许再直接读旧的单 provider 端点键（那正是"一份端点"的来源）。
  check('⭐⭐ 反证：`active-recall` 不再 `fetch(opts.config.activeInjectJevEndpoint`',
    !/fetch\(opts\.config\.activeInjectJevEndpoint/.test(arCode))
  // ⚠️ **判据必须限定在"JEV 那条请求体"上**，不能搜全文件（第一版搜全文件 ⇒ 误报）：
  //    `score-turn` 里另有一处 `model: config.hotScoreModel` 是 **chat 通路**的回执
  //    文案，**本来就该读它**。⇒ "某写法不该出现"要指明范围（本项目已记过同族）。
  const jevBody = /body: JSON\.stringify\(\{ model: ([^,]+), state, questions \}\)/.exec(stCode)?.[1] ?? ''
  check('⭐⭐⭐ `score-turn` 的 JEV 请求体用**选中的那条 provider 的** model',
    jevBody.trim() === 'pick.model', `实得：${jevBody.trim() || '(找不到)'}`)
  check('⭐⭐ 反证：`score-turn` 不再 `fetch(config.activeInjectJevEndpoint`',
    !/fetch\(config\.activeInjectJevEndpoint/.test(stCode))
}

console.log('\n【2】⭐ 新键进了保存白名单、且 `writeSetting` 能写数组')
{
  for (const k of ['decisionProviders', 'activeInjectDecisionPick', 'hotScoreDecisionPick']) {
    check(`settings.ts 白名单含 \`${k}\``, set.includes(`'${k}'`))
  }
  // ⭐ provider 列表是**结构化数组** ⇒ 写入入口必须收得下（否则 YAML 里写不进去）。
  check('⭐⭐ `writeSetting` 的 value 收数组/对象',
    /value: string \| number \| boolean \| unknown\[\] \| Record<string, unknown>/.test(set))
  // 🔴 反证：**密钥本身不在配置里**（它走凭据 seam，不该出现在 patch 白名单）。
  check('⭐⭐ 反证：没有把"密钥值"的键加进白名单（密钥只走 seam）',
    !/'\w*Jev\w*Key'\s*\|/.test(set) && !/'jevApiKey'/.test(set))
}

console.log('\n【3】⭐ API 齐活（GET 透出 / POST 校验 / "至少给一个"条件 / 回声）')
{
  check('⭐⭐ GET /settings 透出 `decisionProviders`（回**生效列表**，不必前端拼回落）',
    /decisionProviders: decisionProvidersOf\(cfg\)/.test(apiCode))
  check('⭐⭐ GET 透出两个选集', /activeInjectDecisionPick: cfg\.activeInjectDecisionPick/.test(apiCode)
    && /hotScoreDecisionPick: cfg\.hotScoreDecisionPick/.test(apiCode))
  check('⭐ POST 有 `wantsDecisionProviders` 等三个存在性判据',
    /const wantsDecisionProviders = /.test(apiCode)
    && /const wantsActiveDecisionPick = /.test(apiCode)
    && /const wantsHotScoreDecisionPick = /.test(apiCode))
  // ⚠️ 漏进"至少给一个"的条件 ⇒ 单独提交它们会被判"什么都没给"⇒ 400（踩过两次）。
  check('⭐⭐ 三个都进了"至少给一个"的条件（`&& !wants*`）',
    /&&\s*!wantsDecisionProviders\s*&&\s*!wantsActiveDecisionPick\s*&&\s*!wantsHotScoreDecisionPick/.test(apiCode))
  check('⭐ 回执回声了这三个键', /wantsDecisionProviders \? \{ decisionProviders: payload\.decisionProviders \}/.test(apiCode))
  // ── 校验：每一条都要能挡住"运行期才炸"的写法 ──
  check('⭐⭐ provider 端点校验成 http/https URL（档在保存前，而不是运行期报个难懂的错）',
    /\^https\?:\\\/\\\/\\S\+\$\/i\.test\(endpoint\)/.test(apiCode))
  check('⭐⭐⭐ provider id 有语法校验（它派生凭据名 ⇒ 写错会静默取不到值）',
    /\^\[A-Za-z0-9\]\[A-Za-z0-9_-\]\{0,47\}\$/.test(apiCode))
  check('⭐⭐ id 查重（同一份配置里必须唯一）', /provider id「\$\{id\}」重复了/.test(apiCode))
  check('⭐⭐⭐ 选集**必须指向存在的 provider**（否则会静默回落到别的 provider）',
    /指向的 provider「\$\{pid\}」不存在/.test(apiCode))
}

console.log('\n【4】🔴🔴 **密钥只写不读**（安全断言 —— 回归会直接泄露用户密钥）')
{
  check('⭐⭐ 有 `POST /jev/key`（保存密钥）', /route === '\/jev\/key'/.test(apiCode))
  check('⭐⭐ 有 `POST /jev/key/clear`（清除密钥）', /route === '\/jev\/key\/clear'/.test(apiCode))
  // 🔴🔴 **最要紧**：回执里**不得**出现密钥值 / 长度 / 前几位。
  const keyBlock = /route === '\/jev\/key'[\s\S]*?\n    \}/.exec(apiCode)?.[0] ?? ''
  check('  能定位 `/jev/key` 处理块', keyBlock !== '')
  check('⭐⭐⭐ 回执里**不含密钥片段**（`slice` / `substring`）',
    !/\.slice\(|\.substring\(/.test(keyBlock))
  check('⭐⭐ 回执文案明确说"只写、永不回显"', /只写/.test(keyBlock) && /不回显|永不回显/.test(keyBlock))
  // ⭐⭐ 收的是 **providerId**，不收凭据名（名字由 id 派生 —— 与官方同规则）。
  check('⭐⭐⭐ `/jev/key` 收 `providerId` 而不是凭据名（名字派生，不问用户）',
    /缺少 providerId（密钥要存到某个 provider 名下）/.test(apiCode)
    && !/payload\.activeInjectJevApiKeyEnv/.test(apiCode))
  check('⭐⭐ 且要求该 provider **真的存在**（否则存到一个谁也不用的名字下 ⇒ 静默无效）',
    /找不到 provider「\$\{pid\}」—— 请先保存 provider 配置/.test(apiCode))
  // ② 读半边走 `describe`（`CredentialInfo` 类型里**没有**放值的槽位）。
  check('⭐⭐⭐ 读半边用 `describe`（而不是 `resolve` 后回值）',
    /async function describeCredential/.test(apiCode) && /\.describe\?\./.test(apiCode))
  check('⭐⭐ `describeCredential` 只回三个事实（configured/source/writable）',
    /configured: got\.configured === true[\s\S]{0,200}?source:[\s\S]{0,120}?writable: got\.writable === true/.test(apiCode))
  check('⭐⭐ `/jev-status` 逐条 provider 回**派生凭据名 + 只读状态**（一次画完，不必逐条问）',
    /keyRef,[\s\S]{0,120}?credential: meta,[\s\S]{0,80}?ready: meta\?\.configured === true/.test(apiCode))
  // ③ 前端：密钥框是 password，已保存时用 `*` 占位。
  check('⭐⭐ 密钥输入框是 `type="password"`', /kInp\.type = 'password'/.test(appCode))
  check('⭐⭐⭐ 保存密钥成功后**立刻清掉输入框**（别把密钥留在 DOM 里）',
    /clearInput\(\)/.test(appCode) && /kInp\.value = ''/.test(appCode))
  // ⭐⭐⭐ **已保存 ⇒ 用星号占位**（用户 2026-10-07 要求："不然用户看着会很迷惑"）。
  check('⭐⭐ 已保存时 placeholder 显示星号',
    /kInp\.placeholder = r\.ready === true[\s\S]{0,200}?\*{12}/.test(appCode))
  // 🔴🔴 **最要紧的安全断言**：星号**只能放 `placeholder`，绝不能放 `value`**。
  //    放进 `value` 的后果：用户没动它直接点保存 ⇒ **把真密钥覆盖成 `************`**
  //    （不可逆的数据损坏，而且极难排查 —— 看起来"密钥配了"但其实是星号）。
  check('⭐⭐⭐ 反证：星号**没有**被写进 `value`（否则会覆盖掉真密钥）',
    !/kInp\.value\s*=\s*r\.ready/.test(appCode))
  check('⭐⭐ 反证：`value` 只被赋成空串（空 = 保持原样，与服务端语义一致）',
    !/kInp\.value\s*=\s*['"][^*'"]/.test(appCode))
  // ⭐ 固定 12 个星号（不按真实长度画 ⇒ 不泄露"密钥多长"）。
  check('⭐⭐ 星号是**固定个数**（不按真实长度画，免得泄露密钥长度）',
    /\*{12}（已保存/.test(appCode))
  // ④ 空值不发请求（空 = 保持原样，不是清空）。
  check('⭐⭐ 空密钥**不发请求**、并说明"留空 = 保持原样"',
    /if \(String\(value\)\.trim\(\) === ''\)[\s\S]{0,220}?保持原样/.test(appCode))
  // ⑤ 不 import dsh-credentials（未声明为 peer 的包会解析到另一份副本）。
  check('⭐⭐ 反证：没有 import `dsh-credentials`（它不在 peerDependencies 里）',
    !/from '@deepseek-ai\/dsh-credentials'/.test(apiCode))
}

console.log('\n【5】⭐ 测试连接：真发请求，且"200 但形态不对"要单独报')
{
  check('⭐⭐ 有 `POST /jev/test`', /route === '\/jev\/test'/.test(apiCode))
  check('⭐⭐ 收 `providerId`（测哪一条由调用方指定）', /缺少 providerId（要测哪一条？）/.test(apiCode))
  check('⭐⭐ 与真实召回**同源**取密钥（复用 `resolveJevKey`）', /resolveJevKey\(/.test(apiCode))
  check('⭐⭐ 且用**该 provider 派生的**凭据名', /deriveDecisionKeyRef\(prov\.id\)/.test(apiCode))
  check('⭐⭐⭐ 拿到 `noul` 才算通（只有 200 不算）',
    /num === undefined[\s\S]{0,400}?没有 noul/.test(apiCode))
  check('⭐⭐ 超时与网络失败**分开说**（下一步动作不同）',
    /timeout[\s\S]{0,300}?超时（15 秒/.test(apiCode))
  check('⭐⭐ 连不上回 200 + `ok:false`（是用户配置问题，不是接口挂了）',
    /await testJevConnection\(deps, pid, model\)[\s\S]{0,220}?status: 200/.test(apiCode))
  check('⭐ 上游自报版本也回出来（确认"真到了网关"）', /upstream/.test(apiCode))
}

console.log('\n【6】⭐ 前端「决策模型配置」页：provider 列表 + 展开编辑')
{
  // ⚠️ `SET_SUBTABS` 与 HTML 的 `data-setsub` / `setsub-*` 必须一一对应。
  check('⭐⭐ `SET_SUBTABS` 含 `jev`', /SET_SUBTABS = \[[^\]]*'jev'/.test(appCode))
  check('⭐⭐ HTML 有子导航按钮 `data-setsub="jev"`', /data-setsub="jev"/.test(html))
  check('⭐⭐ HTML 有面板 `id="setsub-jev"`', /id="setsub-jev"/.test(html))
  check('⭐ 按钮文字是「决策模型配置」（用户点名要这个名字）', /决策模型配置/.test(html))
  check('⭐⭐ HTML 有 provider 列表容器', /id="jev-provider-list"/.test(html))
  // ⭐ 官方式的两个页面级按钮（新增 + 保存选择）。
  for (const [id, why] of [
    ['jev-add-provider', '添加提供商（官方那页也是这个入口）'],
    ['jev-save-picks', '保存两条通路的选择'],
  ]) {
    check(`⭐⭐ 有按钮 \`#${id}\`（${why}）`, new RegExp(`id="${id}"`).test(html))
    check('⭐⭐ 且它被绑定了处理器',
      new RegExp(`getElementById\\('${id}'\\)\\?\\.addEventListener`).test(appCode))
  }
  // ⭐ provider 行 + 展开卡片（一次只开一张 —— 与官方同一交互）。
  check('⭐⭐ 有行渲染函数 `renderJevProviderList`', /function renderJevProviderList\(/.test(appCode))
  check('⭐⭐ 有展开编辑器 `buildJevEditor`', /function buildJevEditor\(/.test(appCode))
  check('⭐⭐⭐ **一次只展开一张**（`jevState.openId` 单个值，不是集合）',
    /openId: ''/.test(appCode) && /jevState\.openId = open \? '' : r\.id/.test(appCode))
  // ⭐ 凭据名在界面上只读展示（派生，不问用户）。
  check('⭐⭐ 卡片里凭据名是**只读展示**（`r.keyRef`），没有输入框',
    /凭据名由它派生：\$\{r\.keyRef\}/.test(appCode)
    && !/id="jev-keyenv"/.test(html))
  // ⭐ 增/改/删都走**同一个写入口**（避免三套逻辑漂移）。
  check('⭐⭐ 增改删共用一个写入口 `writeJevProviders`',
    /async function writeJevProviders\(/.test(appCode)
    && /await writeJevProviders\(next, msg\)/.test(appCode)
    && /await writeJevProviders\(next, msg, '已删除', dangling\)/.test(appCode))
  // 🔴🔴 **删除时若选集正指向它，必须一并清空**（**实测踩到的静默坑**）：
  //    删掉 provider 不报错，选集被 `resolveDecisionPick` **悄悄回落到另一个**
  //    ⇒ 用户不知道"我选的那个没了"，下次召回拿一个**他没选过的模型**去跑。
  check('⭐⭐⭐ 删除时检测"选集指向它"（否则会静默换用别的 provider）',
    /msg\.textContent = `⚠️ 有选集正指向它/.test(appCode))
  check('⭐⭐⭐ 且**同一次请求**里一并清空（分两次写会留下校验会拒的中间窗口）',
    /for \(const k of dangling\) payload\[k\] = ''/.test(appCode)
    && /postJson\('\/settings', \{ decisionProviders: next, \.\.\.extras \}\)/.test(appCode))
  // ⭐ 草稿期**不写盘**（第一版"先写空模板"被自己的 URL 校验拒了 ⇒ 点添加就报错）。
  check('⭐⭐⭐ 新增 provider 只加**本地草稿**、不立刻写盘（否则空端点被校验拒 ⇒ 体验像坏了）',
    /function addJevProvider\(msg\) \{/.test(appCode)
    && /draft: true/.test(appCode)
    && !/async function addJevProvider/.test(appCode))
  check('⭐⭐ 草稿行能被"丢弃"而不发请求（`row\?\.draft === true` 分支）',
    /if \(row\?\.draft === true\)/.test(appCode))
  check('⭐⭐ 打开该页会拉 `/jev-status`（provider 状态不在 /settings 里）',
    /state\.setSub === 'jev'[\s\S]{0,80}?openJevPage/.test(appCode))
  check('⭐ `openJevPage` 里读了 `GET /jev-status`',
    /openJevPage[\s\S]{0,1200}?getJson\('\/jev-status'\)/.test(appCode))
  // ⚠️ 它**不进** `SAVE_UNITS`（那套是"一个版块一个保存按钮"）。
  const unitBlock = /const SAVE_UNITS = \{([\s\S]*?)\n\}/.exec(appCode)?.[1] ?? ''
  check('⭐⭐ 反证：`jev` **不在** `SAVE_UNITS` 里（它有自己的动作）', !/'jev/.test(unitBlock))
}

console.log('\n【7】⭐⭐⭐ 用户裁定：模型下拉框**给全列表、不做通路筛选**')
{
  // 用户原话：*"和现在的 dsh 模型一样放在一起去选。就不要通路筛选了，
  //   就选决策型通路的时候，也给全列表。让用户判断是否是决策性模型，是否匹配通路。"*
  const fn = /async function fillChannelModelSelect[\s\S]*?\n\}/.exec(appCode)?.[0] ?? ''
  check('  能定位 `fillChannelModelSelect`', fn !== '')
  // 🔴 核心：**不再有 `if (channel === 'jev') {...} else {...}` 这种按通路分叉取候选**。
  check('⭐⭐⭐ 反证：下拉框里**没有**按通路分叉取候选（`if (channel === \'jev\')`）',
    !/if \(channel === 'jev'\) \{/.test(fn))
  // ⭐ 两类清单**都放**（chat 的 + 决策模型那组）。
  check('⭐⭐⭐ 放了 DSH 的 chat 模型（`/models` 按 provider 分组）',
    /getJson\('\/models'\)[\s\S]{0,600}?optgroup/.test(fn))
  check('⭐⭐⭐ 也放了本插件配的决策模型（来自 `/jev-status` 的 providers）',
    /getJson\('\/jev-status'\)[\s\S]{0,900}?decision|决策模型（本插件配置的）/.test(fn))
  check('⭐⭐ 决策模型那组用**与 chat 同一套编码**（`[providerId, modelName]` JSON 数组）',
    /o\.value = `\[\$\{JSON\.stringify\(p\.id\)\},\$\{JSON\.stringify\(m\)\}\]`/.test(fn))
  // 🔴 值形态统一后，读值处**不能**再有按通路分叉（否则决策模型会丢掉 provider）。
  const readFn = /function readChannelModel\([\s\S]*?\n\}/.exec(appCode)?.[0] ?? ''
  check('  能定位 `readChannelModel`', readFn !== '')
  check('⭐⭐⭐ 反证：`readChannelModel` 里**没有** `if (channel === \'jev\') return { provider: \'\'`',
    !/if \(channel === 'jev'\) return \{ provider: ''/.test(readFn))
  // ⭐ 两条通路写**各自**的键（`jev` 走 `*DecisionPick`，`chat` 走旧的 Model 键）。
  check('⭐⭐ 保存时按通路写对键（activeInject：jev→DecisionPick）',
    /activeInjectDecisionPick: full/.test(appCode))
  check('⭐⭐ 保存时按通路写对键（hotScore：jev→DecisionPick）',
    /hotScoreDecisionPick: full/.test(appCode))
  // ⭐ 回填时也按通路取对键（读混了会显示"当前配置已不在列表里"）。
  check('⭐⭐ 回填按通路取对键（`activeInjectChannel === \'jev\' ? …DecisionPick : …Model`）',
    /s\.activeInjectChannel === 'jev' \? s\.activeInjectDecisionPick : s\.activeInjectModel/.test(appCode))
  check('⭐⭐ 回填按通路取对键（hotScore 那一侧）',
    /s\.hotScoreChannel === 'jev' \? s\.hotScoreDecisionPick : s\.hotScoreModel/.test(appCode))
  // 🔴🔴 **作用域陷阱**（**实测踩到、且只有真浏览器才报**）：
  //    我一度把 `const i = curModel.indexOf('/')` 留在 `if (curModel !== '')` 块里，
  //    却在块**外面**用它判"值属于哪一份清单" ⇒ `ReferenceError: i is not defined`
  //    ⇒ **整个 `fillChannelModelSelect` 抛异常**（下拉框填不出来、告警也不出）。
  //    ⚠️ 静态检查（语法/类型）**都抓不到**它 —— 只有浏览器控制台会报。
  //    ⭐ 这是"面板静默坏掉"那一族 ⇒ 必须有一条机器判据钉住。
  const fnSrc = /async function fillChannelModelSelect[\s\S]*?\n\}/.exec(appCode)?.[0] ?? ''
  check('  能定位 `fillChannelModelSelect` 全文', fnSrc !== '')
  check('⭐⭐⭐ `i` 声明在**函数作用域**（不是 `if` 块里）—— 否则块外引用会 ReferenceError',
    /const i = curModel\.indexOf\('\/'\)/.test(fnSrc)
    && !/if \(curModel !== ''\) \{\s*const i = /.test(fnSrc))
  check('⭐⭐ 且块外那次使用确实存在（这条判据才有意义）',
    /const pid = i > 0 \? curModel\.slice\(0, i\) : ''/.test(fnSrc))
}

console.log(`\n═══ 结果：通过 ${pass} / 失败 ${fail} ═══`)
process.exit(fail === 0 ? 0 : 1)
