# dsh-memj —— 给模型一份跨会话的长期记忆

一个 DSH 记忆插件。核心模型是**「封面 + 正文」两段分离**：

```
封面（cover）  ← 只写在项目级 handoff 文档里（唯一源头），是一段 YAML 注释块
正文（body）   ← 一条知识一个独立文件（entries/<slug>-<uuid8>.md）
```

封面按 **项目 → 主题 → 全局** 三层聚合。整个库就是**一个目录**（`~/.dsh-memj/`），
**拷走即迁移**。

## 为什么这么设计

**「封面与正文分开」解决的是"查得动"与"读得少"的矛盾。**

模型要判断"库里有没有我要的东西"，需要的是**标题 + 场景描述**（封面）；
而真正要用的时候才需要正文。合在一起的话，
**每次检索都得把几千字的正文全读一遍**——而其中绝大多数这次用不上。

分开之后：

| | 放在哪 | 为什么 |
|---|---|---|
| **封面** | 项目文档底部的注释块 | ⭐ **唯一源头**——`memj_search` 只扫这里，不必打开任何正文文件 |
| **正文** | `entries/` 下一个独立文件 | 只在 `memj_read` 按 id 取时读，且长文档可**按节读** |

**三层聚合**（项目 / 主题 / 全局）回答的是"这条知识归谁"：

- **项目**：只对这个项目成立的知识（绝大多数）；
- **主题**：**跨项目**通用的那类（如"DSH 插件开发"），让别的项目能直接捡去用；
- **全局**：跨主题通用，无条件注入。

⚠️ 归属是**累加，不是搬家**：一条知识加了主题**仍然是项目知识**；
加入全局**仍然命中原来的主题**。

## 安装

插件本身是一个 DSH bundle，靠 `link:` 挂在 profile 里。
**两份清单都要有它**（profile 的 `package.json`）：

```json
{
  "dependencies": { "dsh-memj": "link:D:/.../adapt-memj" },
  "dsh": { "profile": { "bundles": ["...", "dsh-memj"] } }
}
```

⚠️ 还要在 profile 的 `node_modules` 建 junction 指向插件目录。

🔴 **`dsh.bundle.patch` 是必需的**：`package.json` 声明了它，
缺 `cordis.patch.yml` 会在 profile 加载期**硬失败**（`dsh-app-boot` 读 overlay 时直接抛）。

```yaml
# cordis.patch.yml
- insert:
    - id: memj
      name: dsh-memj
```

⭐ **`id` 是 `memj`，不是包名 `dsh-memj`** ——
设置面板要往 profile 的 patch 里写 `- id: <这个值>` 的 config 覆盖，
**写错 id 的后果极隐蔽**：boot 时只打一行 `patch: entry "dsh-memj" not found` 警告，
配置**静默不生效**，而面板还显示"已保存"。

## 模型侧的 11 个工具

| 工具 | 干什么 |
|---|---|
| `memj_info` | **只报语境**（有哪些项目/主题及 id），**不返回知识** |
| `memj_search` | **只找**：按 project / theme / query 筛，**只回封面** |
| `memj_read` | **只读**：按 id 取正文；长文档给**节名清单**，用 `section` 取具体节 |
| `memj_snapshots` | 读**本会话的读快照清单**（跨项目证据的来源） |
| `memj_handoff` | ⭐ **写库主入口**：叙事 + 封面 + 建主题 + 落盘知识 |
| `memj_promote` | 推进归属 / 改封面 / 项目与主题级操作 |
| `memj_update` | 更新**已有**一条知识的正文与封面字段 |
| `memj_rebuild` | 从项目文档**重建派生层**（主题 / 全局） |
| `memj_template` | 管理交接文档模板（两段式确认） |
| `memj_normalize_tags` | 标签规范化（合并同义、去泛化、补英文） |
| `memj_score_turn` | 轮末复盘评分（由子代理调用） |

**典型三步**：`memj_info` 拿语境 id ⇒ `memj_search` 筛封面 ⇒ `memj_read` 取正文。

⭐ **`memj_read` 匹配不到节名时会回【节名清单】**，这不是报错而是设计：
模型想按节读、但封面里没有章节信息 ⇒ 形成"想按节读就得先知道节名、
取节名只能先读全文"的死循环。**顺手把清单给它，这个循环就断了。**

## 人侧的网页

侧边栏入口按钮打开独立管理页，6 个顶层标签：
**知识库 / 项目 / 主题 / 热知识 / 审批 / 归档**。

设置页 8 个子页：**沉淀 · 热知识注入 · 主动注入 · 英文索引 · 提示词 ·
决策模型配置 · 模板 · 知识类型**。

⚠️ **设置是按「版块」保存的，不是按页** —— 每个版块有自己的保存按钮与结果行。
（把"一页一个按钮"改成"一个版块一个"时**要动五处**，漏任一处都**不报错**：
页面照常打开、按钮照常能点 ⇒ 有专门的机械体检 `test-settings-save-units.mjs`。）

### ⭐ 提示词设置页是运行期的**唯一源头**

写给模型的文本（协议 / 使用指导 / 工具描述 / 命令文案 / 各类内部提示词）
都可以在【提示词】子页改，**改完即生效、不必重启**，也不必改源码。

| 文本类别 | 怎么做到热更新 |
|---|---|
| `section()` / `context()` | 它们的 `text` **本来就是函数**，每次装配求值 |
| 工具 `description` | 注册后**用 `defineProperty` 改成 getter**，每轮装配重新解构 |
| 命令 / 注入 / 内部调用 | 本来就是**调用点现读常量** |

⚠️ **命令描述是例外**：`dsh-commands` 注册时把 descriptor 固化，**改它要重启**。

🔴🔴 **但"做成 getter"只对上面这一类有效 —— 参数 schema 里的 getter 是无效的**：

| | 能用 getter 吗 | 为什么 |
|---|---|---|
| 工具**顶层** `description` | ✅ 能 | 直接挂在 def 上，装配时解构取值 |
| **`parameters` 里的字段**（如 `kind.enum`） | 🔴 **不能** | ① 调用点写 `{ ...kindParam(...) }`，**对象展开会求值 getter**；② 更根本：DSH 要求参数对象是**纯静态数据记录**（只有 own enumerable string keys、且必须是 value schema object）⇒ **getter / symbol 键一律导致整个工具注册失败** |

⇒ ⭐ **用户可配的枚举走"参数层静态快照 + 运行期现算校验"**（见 `src/tools.ts` 的 `kindParam` 注释）：
参数层只负责"告诉模型有哪些可选"，真正的合法性判断在 `execute` 里（读进程内词表）。
⚠️ **注册失败是静默的**（`safeRegister` 只记 `logger.error`）⇒ 验收要**直接查工具名清单**。

**三层关系**（排查"改了没生效"时先分清改的是哪一层）：

```
① 源码默认值（src/*.ts）  ──┐
② 库里的覆盖值（prompts/overrides.json）──┴─▶ ③ 模型实际拿到的 = ① 没被②覆盖时用①，否则用②
```

⭐ 「**写回源码**」按钮把②固化进①（让它进版本库、成为新默认值）。
🔴 **它不改变运行时行为**——运行期永远读覆盖层，所以写回**不需要重启**；
它改变的是**这条编辑的归属**（从库里的临时覆盖，变成源码里的正式默认值）。

另注意：**改协议（`section()`）会让所有进行中会话的前缀缓存作废一次**，
因为它在消息最前面（node 0）。使用指导（`context()`）落在尾部，**改它不破缓存**。

## 库长什么样

```
~/.dsh-memj/                        ← 整个库 = 一个目录，拷走即迁移
├─ projects/HANDOFF-<项目>.md       ← 项目层：【唯一写入源头】（叙事 + 底部封面清单）
├─ entries/<slug>-<uuid8>.md        ← 内部条目正文（一条知识一个文档）
├─ themes/THEME-<id>.md             ← 主题层：派生（手改会被 rebuild 覆盖）
├─ GLOBAL.md                        ← 全局层：派生
├─ reads/session-<id>.jsonl         ← 读快照（跨项目证据）
├─ doc-reads/session-<id>.jsonl     ← 项目文档读记录
├─ recall-log/  score-log/          ← 两张追加型 jsonl 日志
├─ hot/                             ← 热知识：画像 / 逐条设置 / 逐项目清单 / 会话绑定 / 评分表
├─ tags/vocabulary.json             ← 标签词表
├─ prompts/overrides.json           ← ⭐ 提示词覆盖值（运行期唯一源头）
├─ templates/<id>.md                ← 交接文档模板
├─ kinds.md                         ← 知识类型词表
├─ nominations.json                 ← 待批 global 提名
├─ backup/                          ← 正文镜像 + 它自己的 git 仓库
├─ recall/en-index.json             ← 英文召回索引
└─ .startup-diag.txt                ← 启动诊断（排障第一手证据）
```

**库根可用 `MEMJ_DATA_DIR` 覆盖**（空白环境变量视为未设置）。

⚠️ **量库体积时 `Get-ChildItem -Recurse` 要加 `-Force`**：
`backup/.git/` 是隐藏目录，不加会静默跳过 ⇒ 得到一个**偏小 43%** 的数字
（实测踩到：两次测量差 12.6 → 22.2 MB，一度误判成"库被写胖了"）。

### 三种数据的性质（**务必分清**）

| | 纯投影（derived） | 积累的判断（source） | 用户数据 |
|---|---|---|---|
| 例 | `themes/` · `GLOBAL.md` · `recall/en-index.json` | `tags/vocabulary.json` · `hot/scores.json` | `prompts/` · `templates/` · `kinds.md` |
| 丢了 | 重建就有 | 🔴 **永久丢失** | 手工重配 |
| 维护法 | **全量重建 + diff** | ⚠️ **只能增量对账，绝不重建** | 随库迁移 |

🔴 **最大的一处陷阱**：给 `tags/vocabulary.json` 照抄 `en-index` 那套"重建"逻辑，
会**静默抹掉所有积累的裁决**——而且看起来像"修好了"（条数对、结构对，就是判断没了）。

### 项目文档是「活文档」

每个项目一份 `HANDOFF-<项目>.md`，按节组织（默认六节，可自定义模板）。
**节名不是文案，是程序协议** —— `read.ts` 按它做子串匹配、
`store.ts` 按它重建骨架、`handoff.ts` 按它统计信息。

⭐ **每节标题下面那个 `memj:spec` 围栏块，是"这一节该写什么"的规范**
（建项目时从模板复制过来），由工具维护。读文档的模型会拿到它。

**归档**：「当前进度」超过阈值时，把最早的 `###` 小节**整节**归档成
`kind: history` 条目（原文照收），原处只留完整 uuid + 一句话主题。
⚠️ `history` 条目**不参与检索**——它是留档，不是知识。

## 配置

配置走 profile 的 `cordis.patch.yml`（`- id: memj` 那条的 `config`），
或者**直接用人侧设置页改**（写的是同一个文件）。

78 个配置键，按功能分 8 组：**读取 / 沉淀 / 热知识 / 知识评分 / 英文索引 /
标签规范化 / 主动注入 / JEV**。设置页每一项下面都有一行「保存后」说明它怎么生效
（`✅ 立即生效（无需重启）` 或 `⚠️ 需重启实例才生效`）。

⚠️ **三个总开关默认关**（`hotInject` / `hotScoreOnTurnEnd` / `activeInject`），
与 memj 的一贯姿态一致：**插件不推、模型主动查**，用户显式开启才注入。
关着的时候**一个监听器都不挂**（零开销，也不出现在事件链上），
诊断行会如实区分 `xxx-registered` 与 `xxx-skipped(disabled)`。

## 挂载与生效

| 改了什么 | 怎么生效 |
|---|---|
| `src/web/*`（前端静态资源） | **刷新页面即可**（每次请求现读磁盘） |
| `src/*.ts`（host 半边） | 🔴 **必须重启实例**（启动时 import 完，之后不再读盘） |
| 【提示词】设置页里的任何文本 | **改完即生效**（命令描述除外，那个要重启） |
| `cordis.patch.yml` 的 config | 看 profile 的 `patchReload`：`live` ⇒ **热重载**；`startup` ⇒ 要重启（没写 = `live`） |

⚠️ **`pnpm run build` 之后必须重启**才能让运行中的实例生效。
⭐ **改了前端刷新就变、只有 API 是旧的**这种情况是有意为之（静态文件每次读盘），
别据此判断"构建已生效"。

## 构建与验收

```bash
pnpm run build      # tsdown（host + client 两个条目）→ copy-web → 产物自检 → 提示词账本对账
pnpm run typecheck  # tsc（src） + tsc（src/client）
pnpm run test       # 50 个套件
pnpm run check      # 上面三合一
```

🔴 **别自己拼构建命令行**：`tsdown.config.ts` 导出的是**数组**（两个条目），
会打印**两次** `Build complete`；用管道截断输出会**杀掉上游进程**
⇒ `lib/` 里只剩 `client.js`。用 `scripts/build.mjs`，它把顺序写死并做产物自检。

⚠️ **`run-all-tests.mjs` 用 `spawnSync(stdio:'pipe')`**：在**管道受限的环境**下
（如某些沙箱）它会**把全部套件报红且失败详情为空**。那是环境问题、不是回归 ——
排障时先用一个最小 `spawnSync` 探针确认环境。

## 实现要点（改代码前先读）

- **库的读写必须走 `node:fs`，不能用 `ctx.fs`**：后者受 `DSH_PERMISSION_MODE` /
  `sandboxPolicy` 管辖，默认 `workspace-write` 的可写根只有 workspace + tmp，
  而库在 `~/.dsh-memj/` ⇒ 会被 `FS_SANDBOX_DENIED` 拒掉。
- **`ctx.inject(['systemPrompt','tools','commands'], cb)` 缺任何一个服务，
  回调就永不执行且无报错** —— 表现是"插件加载了但工具/命令一个都没有"。
  所以启动诊断写进 `.startup-diag.txt`（`ctx.logger` 不一定落在能读到的地方）。
- 🔴 **`api.ts` 的路由必须在 `index.ts` 里逐个注册**：漏一个 ⇒ 请求落到 SPA 兜底、
  返回 **HTML** 而不是 JSON，前端 `JSON.parse` 报错，而**服务端毫无异常**。
  本项目已因此踩过 4 次 ⇒ 有一条每次必跑的机械对账。
- ⭐ **同一事实只能有一份实现**：`paths`（库根）/ `store`（落盘）/ `parse`（封面解析）/
  `prompts`（提示词取值）/ `sections`（节名）/ `edit`（封面删改，LLM 侧与人侧共用）
  —— **任何新增的"第二条维护路径"都必须同时新增一条能报红的检查**。
- **`source.kind` 是 `plugin:dsh-memj`**（0.2.0 起没有 catch-all `plugin` 了）：
  V4 会话日志会**硬拒**旧形状。⚠️ 别名插件用的是**裸包名**（如 `dsh-prompt-inject`），
  **前缀规则不统一**——写夹具前先把真实取值表拉出来。
- **给模型写提示词时，绝不把运行时数字写进常驻文本**（那会导致前缀缓存永不命中）。
  需要动态数字走工具返回值。
- 🔴 **改"看起来是 bug"的地方之前，先确认它不是"在替别的东西兜底"** ——
  实例（2026-10-09）：`kind` 的 `enum` 被 `{ ...kindParam(...) }` 展开求值成静态值，
  看起来是"getter 失效"的 bug；**但它恰好满足了 DSH"参数必须是静态数据记录"的要求**
  ⇒ 按"修 bug"的思路加回 getter，**4 个工具整条注册失败**。
  ⭐ 判据：**"能注册上" ≠ "设计对了"** —— 两者可能由同一个 bug 维持。
- ⭐ **改动 `loadKinds()` 前先读它的分流注释**：内置项的 **身份**（id/label/reserved）随源码、
  **内容**（when/guide）随文件。⚠️ 两边都用一条规则管会出事：
  只随源码 ⇒ 抹掉用户对内置项的编辑；只随文件 ⇒ 源码改了 label 后**库表被 `validateKinds` 卡死**。

## 免责与边界

- **不做向量检索 / rerank**：检索是整词 `includes` + 权重累加（查询词由模型提炼）。
  ⚠️ 因此**不做二次切分**（`入缓` 这种无意义字串永远不会被凭空造出来）。
- **不做多实例隔离**：一个库给全部实例用。⚠️ 多个实例同时评同一个项目时会丢更新
  （评分表的互斥作用域是**本进程**）——单用户单实例下够用，已知边界。
- **不自动修复断链的外部引用**：只报告 + 给人一个"重填路径"的入口，**不猜路径**。
- **不迁移工作区里现存的 `HANDOFF-*.md`**。

## 发布（给维护者）

```bash
pnpm publish        # prepublishOnly = build + 发布闸门，两道都过才发得出去
```

🔴🔴 **`lib/` 是构建产物、被 `.gitignore` 排除，而 `files` 又必须列它** ——
这两条都对，**错在它们之间没有守卫**：

> **从 git 克隆出来的仓库里直接 `npm pack`，打出来的是个 10.3 KB 的空壳包**
> （只有 `LICENSE` / `README.md` / `cordis.patch.yml` / `package.json`），
> 而 npm **不报错** —— `files` 里列了不存在的路径，它只是**跳过**。
> ⚠️ 回执上 name / version / shasum 一应俱全，**看起来完全正常**。

⭐ 判据：**要断言的是「产物」，不是「配置」**。所以 `scripts/check-pack.mjs`
**实测打包**（`npm pack --dry-run --json`）再断言里面真有 `lib/index.js` / `lib/client.js`，
**不看 `files` 字段**。它同时挂在 `prepublishOnly` 和测试套件里
（前者保证发布时必过，后者保证**平时就能报红**）。

## License

MIT
