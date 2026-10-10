import { t as __exportAll } from "./rolldown-runtime-D7D4PA-g.js";
//#region src/hot-score.ts
var hot_score_exports = /* @__PURE__ */ __exportAll({
	SCORE_FILE_VERSION: () => 1,
	aggregate: () => aggregate,
	applyAdds: () => applyAdds,
	deltaFor: () => deltaFor,
	effectiveScore: () => effectiveScore,
	emptyScoreFile: () => emptyScoreFile,
	inWindow: () => inWindow,
	lastRunTurn: () => lastRunTurn,
	pruneEvents: () => pruneEvents,
	topScored: () => topScored
});
/** 当前文件版本（将来改结构时用它做迁移判据）。 */
const SCORE_FILE_VERSION = 1;
/** 空文件。 */
function emptyScoreFile() {
	return {
		version: 1,
		projects: {}
	};
}
/**
* ⭐⭐ **按 JEV 的分数算"该加几分"**（分档；见文件头的理由）。
*
* | 分数 | 加分 |
* |---|---|
* | **`< threshold`** | **0**（一分不加 —— ⚠️ **先判这一条**） |
* | `≥ threshold` | **+1** |
* | `≥ 0.8` | **+2** |
* | `≥ 0.9` | **+3** |
*
* 🔴🔴 **阈值必须【先】判，再判档位** —— 这是我第一版写错的地方，
*    而它是本项目 `决策 172`（"一个键兼两个语义"）的**同族**：
*    ```ts
*    // ❌ 错：档位在前 ⇒ 阈值被架空
*    if (score >= 0.9) return 3
*    if (score >= 0.8) return 2
*    if (score >= threshold) return 1
*    ```
*    ⚠️ 后果：阈值设成 **0.85** 时，**0.82 仍然得 2 分** ——
*    阈值对它上面的两档**完全失效**（用户调高阈值却拦不住 0.8~0.85 的）。
*    ⇒ ⭐ **阈值是硬门**（用户原话：*"只有超过阈值的，才加分"*），
*      过了门**才**按档位分。
*    ✅ 本项目的单元测试正是**用 `deltaFor(0.82, 0.85) === 1` 这条断言**抓到的。
*
* ⚠️ **`threshold` 高于 0.8 时，中间那档自然取不到**（因为 0.8~threshold 那段已被门挡住）——
*    这是**设计内行为**，不是 bug；⚠️ 别去"修"它。
* @param score - JEV 的 `noul` 分。
* @param threshold - 过线阈值（默认取配置里的 `hotScoreThreshold`）。
* @returns 加几分（0 / 1 / 2 / 3）。
*/
function deltaFor(score, threshold) {
	if (!Number.isFinite(score)) return 0;
	if (score < threshold) return 0;
	if (score >= .9) return 3;
	if (score >= .8) return 2;
	return 1;
}
/**
* ⭐⭐ **滚动窗口的判定**：这个事件还在窗口内吗？
*
* ⚠️ **边界取"含"**（`at >= now - window`）—— 本项目一贯要求"边界类判据要留容差"，
*    而这里用"含"就是那个容差（否则恰好在边界上的那次加分会被吃掉）。
* @param at - 事件时刻（ISO）。
* @param nowMs - 当前时刻（epoch ms）。
* @param windowHours - 窗口小时数。
* @returns 是否还在窗口内。
*/
function inWindow(at, nowMs, windowHours) {
	const t = Date.parse(at);
	if (!Number.isFinite(t)) return false;
	return t >= nowMs - windowHours * 36e5;
}
/**
* ⭐⭐⭐ **算一条知识的【有效分】**（= 窗口内各事件的 delta 之和）。
*
* 🔴 **必须逐事件判**（不能拿 `lastAt` 代表全部 —— 见文件头的反例）。
* @param score - 该条知识的评分记录。
* @param nowMs - 当前时刻（epoch ms）。
* @param windowHours - 窗口小时数。
* @returns 有效分；窗口内无事件时 `0`。
*/
function effectiveScore(score, nowMs, windowHours) {
	if (score === void 0 || !Array.isArray(score.events)) return 0;
	let sum = 0;
	for (const e of score.events) {
		if (!inWindow(e.at, nowMs, windowHours)) continue;
		const d = typeof e.delta === "number" && Number.isFinite(e.delta) ? e.delta : 0;
		sum += d;
	}
	return sum;
}
/**
* **清掉出窗的事件**（写入时调用 ⇒ 文件不会无限长）。
*
* ⭐ 读侧仍然要判窗口（`effectiveScore` 自己会判）——
*    因为"清"只在**有写入时**才发生，中间可能隔很久。
*    ⇒ ⭐ **清是"顺手瘦身"，判是"正确性"**，两者都不能省。
* @param score - 该条知识的评分记录。
* @param nowMs - 当前时刻。
* @param windowHours - 窗口小时数。
* @returns 只剩窗口内事件的新记录。
*/
function pruneEvents(score, nowMs, windowHours) {
	return { events: (Array.isArray(score.events) ? score.events : []).filter((e) => inWindow(e.at, nowMs, windowHours)) };
}
/**
* ⭐⭐⭐ **取有效分前 N 名**（注入侧就靠它决定"给哪几条"）。
*
* ⚠️ **只回 `score > 0` 的**：0 分表示"窗口内没被加过分"，
*    它**不属于"有分数的知识"**（用户原话：*"自动注入这些有分数的知识"*）。
*
* ── 🔴🔴 排序口径（决策 182 改过，这是本函数最要紧的一段）──────────────────
* 1. **分数降序**；
* 2. ⭐ **同分时按【最近一次加分时间】降序**（`lastAt`）；
* 3. 再同（都无事件或时间相同）⇒ **按 id 升序**兜底（保证确定性）。
*
* 🔴 **为什么第 2 条必须存在（这是实测出来的真问题）**：
*    `chat` 通路**没有分数**（选中即 +1）⇒ 分数只能是 1/2/3… ⇒ **并列是必然的**。
*    实测生产数据：**33 条有分，其中 25 条并列 1 分**，而位置只有 20 个
*    ⇒ 旧实现（同分按 **id 字典序**）会把 **13 条"只是 id 排在后面"的丢掉** ——
*    ⚠️ 那是**任意淘汰**，不是"选最相关的 20 条"。
*    ⭐ 改成按时间 ⇒ "**刚被证明有用的优先**"，且**仍然确定性**（时间来自事件，不随机）。
* @param project - 该项目的评分表（可能为 `undefined`）。
* @param nowMs - 当前时刻。
* @param windowHours - 窗口小时数。
* @param topN - 取前几名。
* @param opts - ⭐ 可选门槛（决策 182）；不传 = 旧行为。
* @returns 按上述口径排序的条目。
*/
function topScored(project, nowMs, windowHours, topN, opts) {
	if (project === void 0 || project.entries === null || typeof project.entries !== "object") return [];
	const gate = opts?.gate;
	const rows = [];
	for (const [id, sc] of Object.entries(project.entries)) {
		const agg = aggregate(sc, nowMs, windowHours);
		if (agg.score <= 0) continue;
		if (gate !== void 0) {
			const byScore = agg.score >= gate.minScore;
			const byRecency = gate.lastTurn >= 0 && agg.lastTurn === gate.lastTurn;
			if (!byScore && !byRecency) continue;
		}
		rows.push({
			id,
			score: agg.score,
			lastAt: agg.lastAt,
			lastTurn: agg.lastTurn
		});
	}
	rows.sort((a, b) => b.score - a.score || b.lastAt - a.lastAt || a.id.localeCompare(b.id));
	return rows.slice(0, Math.max(0, topN));
}
/**
* **把一条知识在窗口内的事件聚合起来**（有效分 / 最近加分时刻 / 最高 turn）。
*
* ⚠️ 与 `effectiveScore` **同源判据**（都逐事件判窗口），只是多带回两个派生量 ——
*    ⭐ 不另写一份"判窗口"的逻辑（本项目铁律：同一判据一份实现）。
* @param score - 该条知识的评分记录。
* @param nowMs - 当前时刻。
* @param windowHours - 窗口小时数。
* @returns 聚合结果（无窗口内事件时：`{score:0,lastAt:0,lastTurn:-1}`）。
*/
function aggregate(score, nowMs, windowHours) {
	let sum = 0;
	let lastAt = 0;
	let lastTurn = -1;
	for (const e of score?.events ?? []) {
		if (!inWindow(e.at, nowMs, windowHours)) continue;
		const d = typeof e.delta === "number" && Number.isFinite(e.delta) ? e.delta : 0;
		sum += d;
		const t = Date.parse(e.at);
		if (Number.isFinite(t) && t > lastAt) lastAt = t;
		if (typeof e.turn === "number" && e.turn > lastTurn) lastTurn = e.turn;
	}
	return {
		score: sum,
		lastAt,
		lastTurn
	};
}
/**
* **把一批加分并进评分表**（纯函数；I/O 在 `hot-score-store.ts`）。
*
* ⚠️ 它**只加不删条目**：某条知识的有效分掉到 0 后，它的外壳仍留在文件里
*    （`events` 被清空）。⭐ 这是**有意的** —— 删外壳需要"扫全库判断该不该删"，
*    而空外壳的代价只是几百字节；⚠️ 但**读取侧必须按 `score > 0` 过滤**
*    （`topScored` 已如此），否则空的也会被当成"有分数的知识"注入。
* @param project - 原评分表（`undefined` = 新建）。
* @param adds - `条目 id → { delta, score, turn }`。
* @param nowIso - 当前时刻（ISO）。
* @param nowMs - 当前时刻（epoch ms，用于顺手清出窗事件）。
* @param windowHours - 窗口小时数。
* @returns 新的评分表（不修改入参）。
*/
function applyAdds(project, adds, nowIso, nowMs, windowHours) {
	const entries = {};
	for (const [id, sc] of Object.entries(project?.entries ?? {})) entries[id] = pruneEvents(sc, nowMs, windowHours);
	let lastTurn = project?.lastTurn;
	for (const a of adds) {
		if (a.delta <= 0) continue;
		const cur = entries[a.id] ?? { events: [] };
		entries[a.id] = { events: [...cur.events, {
			at: nowIso,
			delta: a.delta,
			score: a.score,
			turn: a.turn
		}] };
		if (typeof a.turn === "number" && (lastTurn === void 0 || a.turn > lastTurn)) lastTurn = a.turn;
	}
	return {
		updatedAt: nowIso,
		...lastTurn !== void 0 ? { lastTurn } : {},
		entries
	};
}
/**
* ⭐⭐ **读"最近一次加分的轮次"**（决策 182）。
*
* 🔴 **旧数据没有 `lastTurn` 字段**（本决策之前写的 `scores.json`）⇒
*    兜底成"**全部事件里的最大 turn**"。
*    ⚠️ 那个兜底**不精确**（条目级的最大 turn 可能来自很久以前），但它是
*    **唯一能用的近似**，且只会让门槛**更松**（多放几条进来）——
*    ⭐ 按"失败模式不对称"（库内知识 `9d61d1e3`）：多给几条只是多花 token，
*      而**少给**会让"刚加入的知识"被静默漏掉。选更松的那侧。
* @param project - 该项目的评分表（可能为 `undefined`）。
* @returns 轮次号；**一个事件都没有时 `-1`**（表示"没有可依据的轮次" ⇒ 该门不生效）。
*/
function lastRunTurn(project) {
	if (project === void 0) return -1;
	if (typeof project.lastTurn === "number" && Number.isFinite(project.lastTurn)) return project.lastTurn;
	let mx = -1;
	for (const sc of Object.values(project.entries ?? {})) for (const e of sc.events ?? []) if (typeof e.turn === "number" && e.turn > mx) mx = e.turn;
	return mx;
}
//#endregion
export { effectiveScore as a, inWindow as c, topScored as d, deltaFor as i, lastRunTurn as l, aggregate as n, emptyScoreFile as o, applyAdds as r, hot_score_exports as s, SCORE_FILE_VERSION as t, pruneEvents as u };
