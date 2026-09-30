/**
 * ⭐⭐⭐ **子代理的"发起方"登记表**（2026-09-29 新增，用户裁定）。
 *
 * ── 为什么需要这张表 ────────────────────────────────────────────────────────
 * 用户裁定（原话）：
 *   *"由主会话 llm 发起的子代理需要继承，纯由我插件发起的子代理不继承
 *     比如现在那个做标签规范的。"*
 *
 * ⇒ 「主会话 LLM 发起的子代理」**继承父会话的项目绑定**；
 *   「插件自己发起的子代理」**不继承**（它只是工具的一个壳，没有项目语境）。
 *
 * ── 难点：DSH 的会话头**区分不出这两种** ──────────────────────────────────
 * 🔴 **实测（2026-09-29）**：解压 169 个会话的 `session.v3.jsonl.zstd` 首事件后比对 ——
 *    两种子代理的头**逐字段相同**：
 *    ```json
 *    { "origin": "subagent", "delegationDepth": 1,
 *      "parentSession": "session-<父>", "agentPreset": "cordis", "isSeeded": false }
 *    ```
 *    ⚠️ 我逐一核过 `origin` / `agentPreset` / `delegationDepth` / `parentSession`
 *       四个字段，**没有一个能区分"谁发起的"**
 *       （LLM 发起的 `514dbad5` 与插件发起的 `a4e6311d` 完全同形）。
 *    ⚠️ `SubagentStartRequest`（`@deepseek-ai/dsh-subagent` 的 `types.d.ts:136`）
 *       也**没有**任何"发起方"字段 —— 两条路都只是传一个 `parent: Agent`。
 *
 * ⇒ ⭐ **只能由插件自己记账**：**插件发起时把子会话 id 记下来**，
 *   "在这一列里 ⇒ 是我发起的 ⇒ 不继承"；"不在 ⇒ 是别处发起的 ⇒ 继承"。
 *
 * ── 为什么记在内存而不是落盘 ────────────────────────────────────────────────
 * ⚠️ 这里记的是**刚 spawn 出来的子会话**，而继承判定发生在**该子会话自己的
 *    首个 `pre-step`**（秒级之内、同一进程内）⇒ 内存足够。
 * 🔴 **不用落盘的理由**：落盘会引入"什么时候清"的问题（子会话结束后要删，
 *    否则文件无限长），而**漏删的后果是"下一次同 id 复用时不继承"**——
 *    这类跨版本残留脏数据正是本项目栽过的坑（如 `entries.json` 的残留）。
 * ⚠️ **代价（如实写明）**：**进程重启后这张表就空了** ⇒ 重启前起的插件子代理
 *    在重启后会被当成"别处发起的"而**继承**。
 *    ⇒ 但那个子代理**早就跑完了**（它是 fire-and-forget 的一次性调用），
 *      重启后不会再有它的 `pre-step` ⇒ **实际不会有影响**。
 */

/** 插件自己发起的子会话 id（`session-<uuid>` 形态）。 */
const pluginSpawned = new Set<string>()

/**
 * 记下"这个子会话是我（插件）发起的"。
 *
 * ⚠️ 必须在**拿到子会话 id 之后立刻**调用 —— 子代理的首个 `pre-step`
 *    可能几乎同时发生。
 * @param childId - 子会话 id（`run.id`）。
 */
export function markPluginSpawned(childId: string): void {
  const id = childId.trim()
  if (id === '') return
  pluginSpawned.add(id)
}

/**
 * 这个会话是不是**插件自己发起**的子代理？
 *
 * @param sessionId - 会话 id。
 * @returns `true` = 插件发起（**不继承**父会话项目）；`false` = 别处发起（可继承）。
 */
export function isPluginSpawned(sessionId: string): boolean {
  return pluginSpawned.has(sessionId.trim())
}

/** ⚠️ 仅供测试：清空登记表（生产代码不该调）。 */
export function clearPluginSpawnedForTest(): void {
  pluginSpawned.clear()
}
