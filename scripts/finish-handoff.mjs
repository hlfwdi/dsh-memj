/**
 * 补写 handoff：第一次调用的**数据已成功落盘**，只是返回体被 schema 拒收。
 * 本脚本**走同一套 runHandoff 逻辑**（不绕过校验）补上缺失的知识并刷新叙事。
 *
 * 用法：node scripts/finish-handoff.mjs
 */
import { pathToFileURL } from 'node:url'

const modUrl = pathToFileURL('D:/dsh_workplace/2026-09-02_13-51-19-115/plugins-next/dsh-memj/lib/index.js').href
const mod = await import(modUrl)

const doc = `## 目标

实现全新的 DSH 记忆系统插件 \`dsh-memj\`——用户认为旧的 \`dsh-memory\` 太复杂、偏离初衷，决定**另行重写**。

核心设计（\`memj-design.md\`，含 80 条已拍板决策）：
- 库在 **\`~/.dsh-memj/\`**（不在工作区、不在 \`$DSH_HOME\`），**拷一个目录即迁移**；
- **封面 + 正文分离**：封面只写在项目级 handoff 文档底部「沉淀知识」节，正文独立落盘；
- 封面按 **项目 → 主题 → 全局** 三层聚合，主题/全局是**派生层**（投影）；
- **七个工具**：\`memj_info\` / \`search\` / \`read\` / \`snapshots\` / \`handoff\` / \`promote\` / \`rebuild\`；
- 归属三正交字段（\`project\` / \`theme[]\` / \`global\`），**推进是累加不是搬家**。

## 当前进度

**已全部实现并通过分层验证。**

| 项 | 状态 |
|---|---|
| 插件工程 | \`D:\\dsh_workplace\\2026-09-02_13-51-19-115\\plugins-next\\dsh-memj\`（18 个 src + \`src/web/\`） |
| host 半边 | 七个工具、两个斜杠命令、协议注入、API + 网页路由 |
| client 半边 | \`src/client/index.tsx\`——\`/memj-review\` 的 \`commandUi\` 弹窗 + 侧边栏入口 |
| 人侧网页 | \`src/web/\`——提名审批 / 断链 / 非法封面 / 封面清单 |
| 自动化测试 | **200 项全绿**：离线核心 63 + host 契约 51 + 端到端 64 + client 契约 22 |
| 真实浏览器 e2e | **4 项全过**（3097 实例） |
| 部署 | 已 link 进 profile 的 \`bundles\`；3096 / 3097 均已加载 |

## 有效做法

1. **协议与工具 description 用脚本从设计文档自动抽取**，不手打：
   \`scripts/gen-protocol.mjs\` + \`scripts/check-protocol.mjs\`（校验逐字节一致）、
   \`scripts/gen-descriptions.mjs\`。设计文档是唯一源头，改文档后重跑生成。
2. **分层验证，每层都要跑**：离线纯逻辑 → stub 契约探针 → 真实文件系统端到端 → 真实实例 → 真实浏览器。
   本次正是靠这套发现了 5 个真缺陷（见「失败/踩坑」）。
3. **\`memj_handoff\` 的全部内容先在内存构建，校验通过后再统一落盘**——
   这样决策 72 要求的"校验失败不半写"才真正成立。
4. ⭐ **探针必须用工具自己的 \`output.schema\` 校验它的返回值**（见踩坑 4，这条是补出来的）。
5. **探针的 stub 必须复刻真实校验**：只存不验的 stub 会让 bug 溜过去。
6. **用 CDP 驱动真实浏览器做最后一层验证**——契约探针只能证明"注册成功"，
   只有真实请求才能证明"协议真的进了模型上下文"。

## 失败/踩坑

1. **\`defineTool\` 会把 \`parameters\` 编译成 JSON Schema**——探针断言写错方向。
2. **\`CommandResult.kind\` 只有 \`'success'\` / \`'error'\`**，不是 \`'text'\`。
3. **\`dsh-agent\` / \`dsh-llm\` 不声明为依赖 ⇒ 类型解析到另一个副本**，报 \`[BRAND] is missing\`。
4. 🔴 **工具返回值多带字段会被整次拒收**——\`output.schema\` 是 \`additionalProperties: false\`，
   \`memj_handoff\` 返回了未声明的 \`issues\` / \`similarProjects\` / \`similarThemes\`。
   ⚠️ **注意其可观察行为**：工具**已经写盘成功**，只是回执没送达
   ——看起来像"handoff 失败"，实际数据是好的。这是**做 handoff 时才暴露**的：
   端到端测试直接调 \`runHandoff\`（纯函数），绕过了工具层 schema 校验。
5. **Windows 绝对路径不能直接 \`import()\`**（\`ERR_UNSUPPORTED_ESM_URL_SCHEME\`）。
6. **\`indexOf('## 沉淀知识')\` 会误命中正文里引用该标题的地方**，把真实叙事误删。
7. **LLM 只给部分节时 handoff 文档结构会漂**——必须规范化成固定七节。
8. **我自己犯的 3 处设计偏离**（已修）：\`GLOBAL.md\` 里私加「待批准」节
   （违反决策 42）、\`memj_rebuild\` 返回里列非法封面明细（同上）、
   \`ref\` 路径拼法在两处重复实现。

**一次判断失误**：\`memj_snapshots\` 最初设计成"在 handoff 之前调用、此时还不知道项目"，
导致 \`cross\` 没有比较基准、"别项目"无从判定，等于**取消了决策 76 那处唯一的工具校验**。
用户指出后改为：**先定项目 id（新建或更新），再带 id 调快照工具**，比对在工具内完成。

## 关键上下文

**产物位置**：
- 插件源码：\`D:\\dsh_workplace\\2026-09-02_13-51-19-115\\plugins-next\\dsh-memj\`
- 设计全文：\`D:\\dsh_test\\2026-09-02_13-51-19-115\\memj-design.md\`（git 跟踪，3 个提交）
- 验证脚本：插件内 \`scripts/\`，以及工作区 \`verify/e2e-memj.mjs\`、\`cdp-*-memj.mjs\`

**部署**：profile 在 \`D:\\dsh-standalone-0.1.5-rc.2\\home\\profiles\\web\`，
\`package.json\` 的 dependencies 用 link、\`dsh.profile.bundles\` 加包名，
\`node_modules\\dsh-memj\` 是 Junction。**改 bundles 或改代码后都要重启才生效**。

**库根**：\`~/.dsh-memj/\`（可用 \`$MEMJ_DATA_DIR\` 覆盖）。
探针跑完会留下空库与 \`.startup-diag.txt\`——**排查"插件加载了但工具没注册"就看它**。

**本工作区 git 约定**：仓**只跟踪 \`memj-design.md\`**（\`.gitignore\` 白名单），
其他文档与目录都不入库；每次改动该文档后提交一个版本。

## 下一步

1. 🔴 **重启 3096**（用户手动）—— 让它加载修复后的构建
   （当前 3096 启动于 14:15:54，早于修复构建 14:21:10）。
   判据：健康检查接口返回 200，且 \`memj_handoff\` 调用能正常回执。
2. **可选**：把工作区现存 \`HANDOFF-*.md\` 迁入库（设计 §12-9 标"本轮不动"）。
3. **留待做**（设计 §12 标 ⏳，**未实现**）：倒排索引/IDF、\`memj_read\` 的 \`around\` 兜底、
   项目/主题的删除与改名通道、事后独立归属推进。
4. **待用户表态**：§12 里 7 条 ⭐ 项——当前按文档倾向实现，已做成 \`config.ts\` 常量。

## 沉淀知识

见下方 entries。`

// ⚠️ 这两条是第一次调用**没写进去**的（那次只写了 5 条就因回执校验失败中断了后续认知）。
// ⚠️ theme 一律留空：本会话**没有跨项目快照证据** ⇒ 当时（默认还是 strict）按协议**不能新建主题**，
//    也不存在可挂靠的已有主题。⚠️ 2026-10-12 起默认已改为 `loose`，这条注释记录的是**当时的判断**。
const entries = [
  {
    slug: 'dsh-tool-output-schema-strict',
    tags: ['dsh', '插件', '工具', 'schema', '验证'],
    desc: '定义 DSH 插件的 defineTool 工具时，output.schema 是运行时强校验且 additionalProperties:false，多返回一个字段会导致整次调用被拒收；当工具在真实调用时报 value.X is not a declared property、而单独调 execute 却毫无问题时读它。',
    body: `### 工具返回值必须严格匹配 output.schema

**规则**：\`defineTool({ output: { schema } })\` 里的 schema 是**运行时强校验**的，
且通常写着 \`additionalProperties: false\` ⇒ **多返回一个未声明的字段，整次工具调用会被拒收**，
报 \`value.X is not a declared property\`。

**Why:** 这个错误的隐蔽性在于三点：
- 直接调 \`execute()\` 返回一个对象，**什么错也没有**；
- TypeScript 也不拦（\`execute\` 的返回类型是 \`Promise<unknown>\`）；
- 只有走**真实工具调度链**时才被 schema 拒掉。\n
**⚠️ 还有一个更误导人的表现**：若工具在返回前**已经写了盘**，
那么"调用失败"只意味着**回执没送达，数据其实是好的**——
看起来像整件事失败了，实际只是最后一跳被拒。

**How to apply:**
- 写 \`execute\` 时**只 return schema 里声明过的字段**；内部诊断信息合并进 \`message\` 字符串透出；
- 探针里加一条通用检查：遍历全部工具，用**它自己的 \`output.schema\`** 校验 \`execute\` 的返回值；
- 同时要测 \`render\` 不被调用时抛错（它是必填的最后一跳）。`,
  },
  {
    slug: 'tool-contract-needs-tool-layer-test',
    tags: ['dsh', '插件', '测试', '验证'],
    desc: '写完 DSH 插件工具后只测背后纯函数会漏掉工具层契约（output.schema 拒收、render 抛错）；当要决定"这个工具算不算测过了"、或测试全绿但真实调用失败时读它。',
    body: `### 纯函数测试覆盖不到工具层契约

**规则**：测一个工具，**必须走工具的 \`execute\` + \`output.schema\` + \`render\` 三层**，
不能只调它背后那个纯函数。

**Why:** 纯函数测试绕过了工具注册时声明的契约：
- \`output.schema\` 的字段约束（多字段会被拒收）；
- \`render\` 是否抛错（它是必填的最后一跳）；
- 参数 DSL 编译后的真实形状。

本项目因此漏掉了 \`memj_handoff\` 的 schema 不匹配 bug——
**200 项测试全绿**，真实使用时才炸。

**How to apply:**
- 业务逻辑用纯函数测（快、好定位），**另加一层**「契约探针」：
  从 \`ctx.tools.register\` 截获注册结果，拿真实返回的对象逐个调用；
- 探针要**覆盖成功路径**（成功才有返回体可校验），失败路径另测；
- 探针的 stub 必须**复刻真实校验**（例：commands 的空 \`input.hint\` 会 throw）。`,
  },
]

const r = await mod.runHandoff(
  {
    project: 'dsh-memj',
    // 不传 projectDesc：项目已存在，保留原描述（§4.2：更新时可保留）。
    doc,
    entries,
  },
  { sessionId: 'cli-finish-handoff', config: mod.DEFAULT_CONFIG },
)

console.log('ok =', r.ok)
console.log('--- 回执 ---')
console.log(r.message)
if (!r.ok) {
  console.log('--- issues ---')
  for (const i of r.issues) console.log(' -', i)
  process.exit(1)
}
