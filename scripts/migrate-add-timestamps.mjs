/**
 * 存量迁移：给已有 entry / 项目 / 主题**回填** `createdAt` / `updatedAt`（决策 119）。
 *
 * ── 🔴 为什么只能"回填"而不是"准确还原" ──────────────────────────────────────
 * 这两列是**新加的**，存量数据里没有。唯一的时间线索是文件系统：
 *
 * | 来源 | 可靠性 | 说明 |
 * |---|---|---|
 * | `mtime`（修改时间） | ✅ **可靠** | 每次写入都会更新，就是"最后改动时刻" |
 * | `birthtime`（创建时间） | ⚠️ **不可靠** | **复制/移动会刷新它**（实测：拷一份库，全部文件的"创建时间"都变成拷贝那一刻） |
 *
 * ⇒ `updatedAt` 用 **mtime**（可信）；`createdAt` 用 **birthtime**（偏晚，拷库后失真），
 * 缺 `birthtime` 时回落成 `mtime`。
 *
 * ⚠️ **只写"当前为空"的字段**——已有值的一律不动 ⇒ **重复跑是幂等的**，
 * 也不会覆盖真实数据。
 *
 * 用法：
 *   node scripts/migrate-add-timestamps.mjs            # dry-run（只看）
 *   node scripts/migrate-add-timestamps.mjs --write    # 真写
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { rename, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/**
 * ⚠️ **原子写**（同目录临时文件 + rename）——与 `src/files.ts` 的手法完全一致。
 *    🔴 不这样做的话，写到一半的文件会毁掉封面解析（本项目的老坑）。
 *    ⚠️ 插件的 `writeTextAtomic` **不在导出面**（它是内部函数），所以这里自己实现一份。
 * @param path - 目标路径。
 * @param content - 全文。
 */
async function atomicWrite(path, content) {
  const tmp = join(dirname(path), `.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, path)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}

const WRITE = process.argv.includes('--write')
const override = process.env['MEMJ_DATA_DIR']
const root = override !== undefined && override.trim() !== ''
  ? override.trim()
  : join(homedir(), '.dsh-memj')

console.log(`库根: ${root}`)
console.log(`模式: ${WRITE ? '**写入**' : 'dry-run（加 --write 才真写）'}\n`)

/** ISO 字符串（与 `new Date().toISOString()` 同格式）。 */
const iso = (d) => d.toISOString()

/**
 * 在 frontmatter 块里插入或替换某个键。
 * @returns 新全文；没有 frontmatter 时 `undefined`。
 */
function upsertFmKey(text, key, value) {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)/.exec(text)
  if (m === null) return undefined
  const [full, open, body, close] = m
  const lines = body.split(/\r?\n/)
  const at = lines.findIndex((l) => new RegExp(`^${key}:`).test(l))
  if (at >= 0) lines[at] = `${key}: ${value}`
  else lines.push(`${key}: ${value}`)
  return text.replace(full, `${open}${lines.join('\n')}${close}`)
}

/** 读 frontmatter 里某个键的当前值（无则空串）。 */
function readFmKey(text, key) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)
  if (m === null) return ''
  const line = m[1].split(/\r?\n/).find((l) => new RegExp(`^${key}:`).test(l))
  return line === undefined ? '' : line.slice(key.length + 1).trim()
}

// ── 收集目标 ──
const targets = []
for (const f of readdirSync(join(root, 'projects')).filter((n) => n.endsWith('.md'))) {
  targets.push([join(root, 'projects', f), `project ${f}`])
}
for (const f of readdirSync(join(root, 'entries')).filter((n) => n.endsWith('.md'))) {
  targets.push([join(root, 'entries', f), `entry   ${f}`])
}
for (const f of readdirSync(join(root, 'themes')).filter((n) => n.endsWith('.md'))) {
  targets.push([join(root, 'themes', f), `theme   ${f}`])
}

let touched = 0
let skipped = 0
let failed = 0
for (const [path, label] of targets) {
  const text = readFileSync(path, 'utf8')
  const st = statSync(path)
  const hasCreated = readFmKey(text, 'createdAt') !== ''
  const hasUpdated = readFmKey(text, 'updatedAt') !== ''
  if (hasCreated && hasUpdated) { skipped += 1; continue }

  let next = text
  const notes = []
  if (!hasCreated) {
    // ⚠️ `birthtime` 在部分文件系统上会等于 mtime（拿不到真实创建时间）——
    //    那就老实回落成 mtime（**不假装它是创建时间**）。
    const bt = st.birthtimeMs > 0 ? st.birthtime : st.mtime
    next = upsertFmKey(next, 'createdAt', iso(bt))
    notes.push('createdAt')
  }
  if (!hasUpdated) {
    next = upsertFmKey(next, 'updatedAt', iso(st.mtime))
    notes.push('updatedAt')
  }
  if (next === undefined) { failed += 1; console.log(`  [失败] ${label}（没有 frontmatter 块）`); continue }

  if (WRITE) await atomicWrite(path, next)
  touched += 1
  if (touched <= 5) console.log(`  [${WRITE ? '写入' : '待写'}] ${label}：补 ${notes.join(' + ')}`)
}

console.log(`\n共 ${targets.length} 个文件：${touched} ${WRITE ? '已写' : '待写'}、${skipped} 已有（跳过）、${failed} 失败`)
if (!WRITE) console.log('⚠️ dry-run——确认无误后加 `--write` 真写。')
