/**
 * 发布前闸门：**peer 范围必须真的覆盖我们在跑的那些 DSH 版本**。
 *
 * 🔴🔴 **为什么需要它**（2026-10-09 实测发现，这是本项目最"看不见"的一类错）：
 *
 * 原声明是 `>=0.1.5-rc.2 <0.3.0` —— 看起来很宽（覆盖 0.1.5 到 0.3 之间的一切），
 * ⚠️ **实际只匹配 2 个已发布版本**（`0.1.5-rc.2` / `0.1.5-rc.3`）。
 *
 * 根因是 **node-semver 对预发布版本的一条硬规则**：
 *   一个带预发布标签的版本，只有当范围里**存在某个比较符**，
 *   其 `major.minor.patch` 元组与该版本**完全相同**、**且自身也带预发布标签**时，才会被放行。
 *   ⇒ `<0.3.0` 不带预发布标签，所以 **`0.2.0-rc.2` 被静默排除**——
 *     而 `0.2.0`（正式版，尚未发布）反而能匹配。
 *
 * ⭐ **后果**：用户装到 **0.2.0-rc.2**（npm 上的 `next`，也正是本项目自己部署在跑的那个）上，
 *   pnpm 会报 `ERESOLVE`，还得手工绕开。**而声明本身看起来完全正常**。
 *
 * 📌 **实测**（32 个已发布版本逐个过）：
 *   修前 **2/32** 匹配；修后 **12/32**（救回 10 个，含 `0.2.0-rc.2`）。
 *
 * ── 判据 ────────────────────────────────────────────────────────────────
 * ⭐ **要断言的是「用真实的版本号算一遍」，不是「范围看起来宽不宽」**——
 *   与本项目既有那条（"要断言产物，不断言配置"）同族。
 *
 * ── 它做什么 ────────────────────────────────────────────────────────────
 * ① 从 `package.json` 读 `peerDependencies` 里所有 `@deepseek-ai/dsh-*` 的范围；
 * ② 断言它们**彼此一致**（同一批包应共用一个范围，否则用户会撞上更难查的错配）；
 * ③ 用一组**真实存在的 DSH 版本**逐个算，断言全部匹配；
 * ④ ⚠️ **反向断言**：必须不匹配 0.3.x（上界真的挡住了），
 *    否则"把范围写成 `*`"也能让 ③ 通过。
 *
 * ⚠️ **零依赖**：本项目从不依赖 `semver`（全仓 0 处引用），
 *    而发布闸门必须在**任何**环境能跑 ⇒ 自带一个最小匹配器（见下）。
 *    ✅ 它的正确性已用 **npm 自带的真 semver** 做过变量分离对照（32 个真实版本逐一比对）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

/**
 * 解析版本号为 `{ major, minor, patch, pre }`；`pre` 为空数组 = 正式版。
 * @param {string} v - 形如 `0.2.0-rc.2`。
 */
function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v.trim())
  if (m === null) throw new Error(`解析不了版本号：${v}`)
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] === undefined ? [] : m[4].split('.'),
  }
}

/** 预发布标识符比较（数字段按数值比、其余按字典序；数字 < 字母）。 */
function cmpPre(a, b) {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1 // 正式版 > 预发布
  if (b.length === 0) return -1
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
    } else if (xn !== yn) {
      return xn ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** 版本比较：`-1` / `0` / `1`。 */
function cmpVer(a, b) {
  const A = parse(a)
  const B = parse(b)
  for (const k of ['major', 'minor', 'patch']) {
    if (A[k] !== B[k]) return A[k] < B[k] ? -1 : 1
  }
  return cmpPre(A.pre, B.pre)
}

/**
 * 判断 `version` 是否满足 `range`（支持 `||` 连接的比较符组）。
 *
 * ⚠️ **预发布门槛**（node-semver 的真实语义，也是本闸门存在的理由）：
 *   带预发布标签的版本，**必须**在某个比较符的元组上与它完全一致、
 *   且那个比较符**自己也带预发布标签**，才可能被放行。
 */
function satisfies(version, range) {
  const V = parse(version)
  if (V.pre.length > 0) {
    const [] = []
    const hasPreTuple = range.split('||').some((group) =>
      group
        .trim()
        .split(/\s+/)
        .filter((t) => /^[<>]=?/.test(t))
        .some((t) => {
          const target = parse(t.replace(/^[<>]=?/, ''))
          return (
            target.pre.length > 0 &&
            target.major === V.major &&
            target.minor === V.minor &&
            target.patch === V.patch
          )
        }),
    )
    if (!hasPreTuple) return false
  }
  return range.split('||').some((group) => {
    const terms = group.trim().split(/\s+/).filter((t) => t !== '')
    return terms.every((t) => {
      const op = /^([<>]=?|=)?/.exec(t)[1] ?? ''
      const target = t.replace(/^[<>]=?/, '')
      const c = cmpVer(version, target)
      if (op === '<') return c < 0
      if (op === '<=') return c <= 0
      if (op === '>') return c > 0
      if (op === '>=') return c >= 0
      return c === 0
    })
  })
}

// ── 数据 ──────────────────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const peers = pkg.peerDependencies ?? {}
const dshPeers = Object.entries(peers).filter(([n]) => n.startsWith('@deepseek-ai/dsh-'))

/**
 * 必须能装上的 DSH 版本。
 *
 * ⭐ 这些是**真实存在过/正在跑**的版本，不是编的：
 *   · `0.2.0-rc.2` —— 本项目自己的部署在跑的那个（`deploy-020rc2`），也是 npm 的 `next`；
 *   · `0.1.5-rc.2` —— 本仓 `node_modules` 里实际解析到的那个；
 *   · 其余为 npm 上已发布的代表性版本（rc / alpha 都取到）。
 * ⚠️ 失效判据：这些版本若不再匹配，说明**范围又被写窄了**（或 DSH 换了版本方案）。
 */
const MUST_MATCH = [
  '0.1.5-rc.2',
  '0.1.5-rc.3',
  '0.1.7-rc.2',
  '0.2.0-rc.1',
  '0.2.0-rc.2',
  '0.2.1-alpha.2',
]

/** ⚠️ 反向断言：上界必须真的挡住 —— 否则把范围写成 `*` 也能让上面全绿。 */
const MUST_NOT_MATCH = ['0.3.0-rc.1', '0.3.0', '1.0.0']

console.log('▶ 发布闸门：peer 范围要真的覆盖在跑的 DSH 版本')

let failed = 0
const fail = (msg) => {
  console.error(msg)
  failed += 1
}

if (dshPeers.length === 0) {
  fail('\n❌ `peerDependencies` 里没有任何 `@deepseek-ai/dsh-*` —— 声明是不是被删空了？')
}

// ── ① 全部 dsh-* peer 必须共用同一个范围 ─────────────────────────────────
const ranges = new Set(dshPeers.map(([, r]) => r))
if (ranges.size > 1) {
  fail(
    `\n❌ ${dshPeers.length} 个 \`@deepseek-ai/dsh-*\` peer 用了 ${ranges.size} 个不同的范围：\n` +
      [...ranges].map((r) => `     · ${r}`).join('\n') +
      '\n   ⚠️ 同一批包应共用一个范围 —— 否则用户会撞上"装得上 A、装不上 B"的错配，\n' +
      '      而那比整体装不上更难查。',
  )
}
const range = [...ranges][0] ?? ''

// ── ② 必须匹配的真实版本 ─────────────────────────────────────────────────
console.log(`   范围：${range}`)
const missed = MUST_MATCH.filter((v) => !satisfies(v, range))
if (missed.length > 0) {
  fail(
    `\n❌ 下列**真实存在的 DSH 版本装不上**（共 ${missed.length} 个）：\n` +
      missed.map((v) => `     · ${v}`).join('\n') +
      '\n   ⚠️ 最常见的原因：范围**没有给"每个 minor 段"配一个带预发布标签的比较符**。\n' +
      '      node-semver 只让预发布版本匹配"元组完全相同且自身带预发布标签"的比较符：\n' +
      '      `>=0.1.5-rc.2 <0.3.0` 看似很宽，实际只放行 0.1.5-rc.x。\n' +
      '   ⇒ 正确做法：给每个 minor 段各配一段，形如\n' +
      '      `>=X <0.1.6-0 || >=0.1.6-0 <0.1.7-0 || … || >=0.2.1-0 <0.3.0-0`。',
  )
} else {
  console.log(`   ✅ ${MUST_MATCH.length} 个真实版本全部装得上`)
}

// ── ③ 反向：上界必须真的挡住 ─────────────────────────────────────────────
const leaked = MUST_NOT_MATCH.filter((v) => satisfies(v, range))
if (leaked.length > 0) {
  fail(
    `\n❌ 上界没挡住：${leaked.join('、')} 也被判为可装。\n` +
      '   ⚠️ 这条是**反证**：没有它，把范围写成 `*` 也能让上一条全绿。',
  )
} else {
  console.log(`   ✅ 上界有效（${MUST_NOT_MATCH.join('、')} 均被挡住）`)
}

// ── ④ `engines.dsh` 必须与 peer 范围一致（生态约定，**两处都会被人读到**）──────
//
// 🔴 **为什么也守它**：`engines.dsh` 是 DSH 生态的约定字段——插件市场
//   （dsh-market）用它做**兼容性判断**并在卡片上显示"这个插件要求什么版本"。
//   ⚠️ 若它与 peer 范围不一致，市场会**告诉用户一个假事实**：
//     要么把人挡在能装的版本外，要么放行一个装不上的版本。
//   ⇒ 同一事实两处维护 ⇒ **必须有机械校验**（本项目铁律）。
const enginesDsh = pkg.engines?.dsh
if (enginesDsh === undefined) {
  fail(
    '\n❌ `engines.dsh` 缺失。\n' +
      '   ⚠️ 它是生态约定字段，插件市场读它来判断/展示"这个插件要求什么 DSH 版本"。\n' +
      `   ⇒ 填成与 peer 相同的范围：\n      "dsh": "${range}"`,
  )
} else if (enginesDsh !== range) {
  fail(
    `\n❌ \`engines.dsh\` 与 peer 范围不一致：\n` +
      `     engines.dsh : ${enginesDsh}\n` +
      `     peer        : ${range}\n` +
      '   ⚠️ 市场读前者、安装器读后者 ⇒ 不一致时市场会告诉用户一个假事实。',
  )
} else {
  console.log('   ✅ engines.dsh 与 peer 范围一致')
}

if (failed > 0) {
  console.error(`\n❌ peer 范围检查未通过（${failed} 项）。`)
  process.exit(1)
}
console.log('\n✅ peer 范围检查通过：在跑的 DSH 版本都装得上，且上界有效。')
