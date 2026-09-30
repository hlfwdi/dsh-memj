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

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** 确保目录存在（递归）。 */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

/**
 * 读文本文件；不存在或读不动时返回 `undefined`（**不抛**）。
 *
 * 库是用户可手改的，任何一处读失败都不该让整个插件挂掉。
 * @param path - 文件路径。
 * @returns 内容或 `undefined`。
 */
export async function readTextIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
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
export async function writeTextAtomic(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path))
  const tmp = join(dirname(path), `.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await writeFile(tmp, content, 'utf8')
    await renameWithRetry(tmp, path)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}

/** Windows 上 `rename` 的瞬时错误码（被短暂占用）。 */
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

/**
 * `rename` + **瞬时错误重试**（见 `writeTextAtomic` 的说明）。
 *
 * ⚠️ **只能重试"瞬时"错误**：真的权限不足（如目录只读）重试也没用，
 * 但多试几次的代价极小（最多 ~40ms），换来的是**不再偶发崩溃**。
 * @param from - 源路径。
 * @param to - 目标路径。
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  const delaysMs = [5, 10, 20, 40]
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      if (attempt >= delaysMs.length || !TRANSIENT_RENAME_CODES.has(code)) throw err
      await new Promise((r) => setTimeout(r, delaysMs[attempt]))
    }
  }
}

/**
 * 列出目录下的文件（不递归）；目录不存在时返回空数组。
 * @param dir - 目录。
 * @param filter - 可选的过滤谓词（按文件名）。
 * @returns 文件名数组。
 */
export async function listFiles(
  dir: string,
  filter?: (name: string) => boolean,
): Promise<string[]> {
  try {
    const names = await readdir(dir)
    return filter === undefined ? names : names.filter(filter)
  } catch {
    return []
  }
}

/** 删除文件；不存在时静默成功。 */
export async function removeFile(path: string): Promise<void> {
  await unlink(path).catch(() => {})
}

/** 判断路径是否存在（文件或目录）。 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch {
    try {
      await readdir(path)
      return true
    } catch {
      return false
    }
  }
}
