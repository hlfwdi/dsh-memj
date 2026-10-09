/**
 * 整理「目标」节前的**覆盖度核对**（不是猜，是量）。
 *
 * 要回答的问题：那 16 个旧批次的内容，在**其它节**里有没有对应记录？
 *   · 有 ⇒ 从「目标」删掉不丢信息（规范本来就要求它只留总目标+最新批次）；
 *   · 没有 ⇒ 要么合并进别的节，要么保留指针。
 *
 * 🔴 做法：拿每个批次**自己那句话**里的特征串（去标点后的连续片段）去其它节里找。
 *    ⚠️ 不用"关键词命中"（会虚高），用**逐字子串**（与本项目"挂靠依据核对"同一取向：
 *       连续字符命中才算数）。
 *
 * 用法：node scripts/check-goal-overlap.mjs [项目 id]
 *   ⭐ 默认 `dsh-memj`；库根按本项目规则派生（`MEMJ_DATA_DIR` → `~/.dsh-memj`），**不写死路径**。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LIB_ROOT = process.env['MEMJ_DATA_DIR'] ?? join(homedir(), '.dsh-memj')
const PROJECT = process.argv[2] ?? 'dsh-memj'
const DOC = join(LIB_ROOT, 'projects', `HANDOFF-${PROJECT}.md`)
console.log(`[库根] ${LIB_ROOT}\n[文档] ${DOC}`)
const text = readFileSync(DOC, 'utf8')

/** 按 `## ` 切顶层节。 */
function splitTop(t) {
  const out = new Map()
  const re = /^## (.+)$/gm
  const marks = []
  let m
  while ((m = re.exec(t)) !== null) marks.push({ title: m[1].trim(), at: m.index })
  for (let i = 0; i < marks.length; i += 1) {
    const end = i + 1 < marks.length ? marks[i + 1].at : t.length
    out.set(marks[i].title, t.slice(marks[i].at, end))
  }
  return out
}

const secs = splitTop(text)
const goal = secs.get('目标') ?? ''
// 「其它节」= 除 目标 之外的全部
const others = [...secs.entries()].filter(([k]) => k !== '目标').map(([, v]) => v).join('\n')

/** 去标点/空白，便于做"连续片段"比较（与挂靠依据核对同一套做法）。 */
const strip = (s) => s.replace(/[\s，。、；：？！“”‘’（）《》【】「」『』—－·*`|#>-]/g, '')

const goalStripped = strip(goal)
const othersStripped = strip(others)

// 切出「目标」里的每个批次块
const blocks = []
{
  const re = /^- \*\*第([一二三四五六七八九十百]+)批[^\n]*/gm
  const marks = []
  let mm
  while ((mm = re.exec(goal)) !== null) marks.push({ batch: mm[1], at: mm.index })
  for (let i = 0; i < marks.length; i += 1) {
    const end = i + 1 < marks.length ? marks[i + 1].at : goal.length
    blocks.push({ batch: marks[i].batch, body: goal.slice(marks[i].at, end) })
  }
}

console.log(`「目标」节共 ${blocks.length} 个批次块\n`)
console.log('批次      字符数   最长共有片段  判定')
console.log('─'.repeat(64))

let covered = 0
for (const b of blocks) {
  const bs = strip(b.body)
  // 找该块里**最长的、在其它节里也出现的连续片段**
  // 做法：取若干采样窗口（滑动，步长 20），逐个在 others 里找；记最长命中。
  let best = 0
  const WIN = 40
  for (let i = 0; i + WIN <= bs.length; i += 20) {
    const w = bs.slice(i, i + WIN)
    if (othersStripped.includes(w)) { best = Math.max(best, WIN) }
  }
  // 若 40 字窗口全不中，再逐级降窗找最长命中（粗略估计）
  if (best === 0) {
    for (let len = 36; len >= 12 && best === 0; len -= 4) {
      for (let i = 0; i + len <= bs.length; i += 8) {
        if (othersStripped.includes(bs.slice(i, i + len))) { best = len; break }
      }
    }
  }
  const verdict = best >= 40 ? '✅ 已覆盖' : best >= 20 ? '⚠️ 部分覆盖' : '🔴 未覆盖'
  if (best >= 40) covered += 1
  console.log(`${b.batch.padEnd(8)}  ${String(b.body.length).padStart(6)}   ${String(best).padStart(10)}  ${verdict}`)
}

console.log('─'.repeat(64))
console.log(`已覆盖（≥40 字连续片段命中其它节）：${covered} / ${blocks.length}`)
console.log('\n⚠️ 口径说明：这里量的是"**逐字重合**"，不等于"语义已归档"。')
console.log('   ⭐ 语义层面的兜底是 git 正文镜像（backup/HANDOFF-dsh-memj.md，90+ 次提交）。')
