import { t as __exportAll } from "./rolldown-runtime-D7D4PA-g.js";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
//#region src/files.ts
/**
* 文件读写小工具（原子写 + 容错读）。
*
* 🔴 **为什么用 `node:fs` 而不是 `ctx.fs`**（`dsh-plugin-knowledge.md` §6.2c）：
* `ctx.fs` 受 `DSH_PERMISSION_MODE` / `sandboxPolicy` 管辖，其默认模式
* `workspace-write` 的**可写根只有 workspace + tmp**——
* 而 memj 的库在 `~/.dsh-memj/`，**既不是 cwd 也不是 tmpdir，会被 `FS_SANDBOX_DENIED` 拒掉**。
* 插件在 `apply` 里直接调 `node:fs` 是宿主进程内的普通 Node 调用，
* **不经沙箱**，在任意权限模式下行为都稳定。
*
* @module dsh-memj/files
*/
var files_exports = /* @__PURE__ */ __exportAll({
	ensureDir: () => ensureDir,
	fileExistsStat: () => fileExistsStat,
	listFiles: () => listFiles,
	readTextIfExists: () => readTextIfExists,
	removeFile: () => removeFile,
	writeTextAtomic: () => writeTextAtomic
});
/** 确保目录存在（递归）。 */
async function ensureDir(dir) {
	await mkdir(dir, { recursive: true });
}
/**
* 读文本文件；不存在或读不动时返回 `undefined`（**不抛**）。
*
* 库是用户可手改的，任何一处读失败都不该让整个插件挂掉。
* @param path - 文件路径。
* @returns 内容或 `undefined`。
*/
async function readTextIfExists(path) {
	try {
		return await readFile(path, "utf8");
	} catch {
		return;
	}
}
/**
* **原子写**：先写同目录的临时文件，再 `rename` 覆盖。
*
* 必要性：`rename` 在同一文件系统内是原子的，因此**读者要么看到旧内容、
* 要么看到新内容，绝不会看到写了一半的文件**。memj 的库会被多个 DSH 实例
* 同时读（§11.4：一个库 = 所有实例共享），半截文件会直接毁掉封面解析。
*
* ⚠️ 临时文件名带随机后缀，避免两个实例同时写同一目标时互相踩。
*
* 🔴🔴 **为什么必须给 `rename` 加重试**（实测踩到，2026-09-19）：
* Windows 上 `rename` 覆盖一个**此刻正被其他句柄打开**的文件会抛
* `EPERM`（`errno: -4048`）或 `EBUSY`——**而那个句柄往往只是瞬时存在**
* （杀毒/索引/另一个实例正在读）。它**不是永久失败**，重试几十毫秒就过。
*
* 实测代价：这个错误曾让 `test-core` 在**全量跑**时偶发**整个进程崩掉**
* （表现为只打印 `Node.js v22.22.2`），单跑却永远绿 ⇒ 被记成"闪现未复现"。
* 抓到完整堆栈后确认就是这里。**生产里同样会中**（多实例共享库时）。
* @param path - 目标路径。
* @param content - 文本内容。
*/
async function writeTextAtomic(path, content) {
	await ensureDir(dirname(path));
	const tmp = join(dirname(path), `.${randomBytes(6).toString("hex")}.tmp`);
	try {
		await writeFile(tmp, content, "utf8");
		await renameWithRetry(tmp, path);
	} catch (err) {
		await unlink(tmp).catch(() => {});
		throw err;
	}
}
/** Windows 上 `rename` 的瞬时错误码（被短暂占用）。 */
const TRANSIENT_RENAME_CODES = /* @__PURE__ */ new Set([
	"EPERM",
	"EBUSY",
	"EACCES"
]);
/**
* `rename` + **瞬时错误重试**（见 `writeTextAtomic` 的说明）。
*
* ⚠️ **只能重试"瞬时"错误**：真的权限不足（如目录只读）重试也没用，
* 但多试几次的代价极小（最多 ~40ms），换来的是**不再偶发崩溃**。
* @param from - 源路径。
* @param to - 目标路径。
*/
async function renameWithRetry(from, to) {
	const delaysMs = [
		5,
		10,
		20,
		40
	];
	for (let attempt = 0;; attempt += 1) try {
		await rename(from, to);
		return;
	} catch (err) {
		const code = err.code ?? "";
		if (attempt >= delaysMs.length || !TRANSIENT_RENAME_CODES.has(code)) throw err;
		await new Promise((r) => setTimeout(r, delaysMs[attempt]));
	}
}
/**
* 列出目录下的文件（不递归）；目录不存在时返回空数组。
* @param dir - 目录。
* @param filter - 可选的过滤谓词（按文件名）。
* @returns 文件名数组。
*/
async function listFiles(dir, filter) {
	try {
		const names = await readdir(dir);
		return filter === void 0 ? names : names.filter(filter);
	} catch {
		return [];
	}
}
/** 删除文件；不存在时静默成功。 */
async function removeFile(path) {
	await unlink(path).catch(() => {});
}
/**
* ⭐ **只 `stat` 的轻量存在性判断**（2026-09-30 新增，为性能）。
*
* 🔴 **为什么不能直接用上面那个 `pathExists`**：它的实现是 `readFile(path)` ——
*    **会把整个文件读进内存**（只是不解码、不解析）。在"逐条判断几百个条目"的
*    循环里，那等于几百次全文 IO。
*
* ⭐ 用途：只需要"在不在"、**不需要内容**的场景。首个用户是 `/covers` 的
*    「缺正文 / 外链断链」判断 —— 414 张封面各读一次全文 ≈ 700ms（实测）。
*
* ⚠️ **语义差别（用之前先想清楚）**：本函数判的是**存在**；
*    `pathExists` 判的是**可读**（权限不足时它 `false`、本函数 `true`）。
*    ⇒ **不要拿它去替换既有的 `pathExists` 调用**，两者在"文件在但读不动"时会分叉。
* @param path - 文件路径。
* @returns 能 `stat` 到 ⇒ `true`。
*/
async function fileExistsStat(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}
//#endregion
export { readTextIfExists as a, listFiles as i, fileExistsStat as n, removeFile as o, files_exports as r, writeTextAtomic as s, ensureDir as t };
