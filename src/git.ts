/**
 * ⭐⭐ **库内 git 版本维护**（决策 135）。
 *
 * ── 它管什么 ───────────────────────────────────────────────────────────────
 * **仓库根 = `<库根>/backup/`**，`.gitignore` 是**白名单**，**只放行 `narrative/`**：
 * ```
 * *
 * !.gitignore
 * !narrative/
 * !narrative/**
 * ```
 * ⇒ 🔴 **"只维护正文"是这样成立的**：镜像文件里本来就只有正文（见 `narrative.ts`），
 *    所以白名单放行它 = 只版本化正文。`projects/`（含封面）、`entries/`、`reads/`、
 *    `snapshot/`（台账）、`GLOBAL.md` **一律不进仓库**。
 *
 * ── 🔴🔴 四条安全铁律（不做会出事）────────────────────────────────────────
 * 1. **绝不让 git 的失败影响 handoff**：全程 best-effort + 回执如实报警。
 * 2. **绝不让 git 卡住**：`execFile`（**不经 shell**）+ `timeout` +
 *    `windowsHide` + 关掉一切交互（凭据/分页/编辑器）。
 * 3. **绝不写用户的全局 git 配置**：身份只写仓库 `--local`，提交时再显式 `-c`。
 * 4. **只 `--local` 或 `-c`，永不 `--global`**（那会改用户全局身份）。
 *
 * ── 身份三级回落（用户要求"生成一个可复用的身份并记住"）────────────────────
 * ```
 * ① 仓库 local 有          ⇒ 沿用（这就是"插件记住了"）
 * ② 只有全局 global 有     ⇒ 用它并写入 local（此后不依赖全局）
 * ③ 两边都没有            ⇒ 生成 memj-handoff-<主机名> / memj-handoff@<主机名>，写入 local
 * ```
 * ⭐ **记在 `backup/.git/config`**（用户问"记在哪"）：与仓库**同生共死**、
 *    连 `backup/` 目录一起拷走就跟着走；不污染配置通道（那是"人会改的开关"该待的地方）。
 *    ⚠️ 代价如实说：`.git/` 被删 ⇒ 身份随仓库消失、下次开启会**重新生成**。
 *
 * @module dsh-memj/git
 */

import { execFile } from 'node:child_process'
import { hostname } from 'node:os'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { backupDir } from './paths.ts'
import { ensureDir, writeTextAtomic } from './files.ts'

/** 单次 git 调用的超时（毫秒）。🔴 宁可失败，也绝不卡住 handoff。 */
const GIT_TIMEOUT_MS = 10_000

/** 生成身份的形态（`<主机名>` 让多台机器可区分）。 */
export function defaultIdentity(): { name: string; email: string } {
  const host = hostname().replace(/[^A-Za-z0-9.-]/g, '-')
  return { name: `memj-handoff-${host}`, email: `memj-handoff@${host}` }
}

/** 一次 git 调用的结果。 */
export interface GitRun {
  ok: boolean
  stdout: string
  stderr: string
  /** 失败原因（超时 / 命令不存在 / 非零退出）。 */
  error: string
}

/** git 调用选项。 */
interface GitOptions {
  /** 额外 `-c key=value`（显式身份等）。 */
  config?: ReadonlyArray<readonly [string, string]>
  /** 超时（毫秒）。 */
  timeoutMs?: number
}

/**
 * 跑一次 git（**唯一的调用实现**）。
 *
 * 🔴 环境变量是安全边界的一部分：
 *   · `GIT_TERMINAL_PROMPT=0` —— 任何凭据提示直接失败，**绝不等待输入**；
 *   · `GIT_ASKPASS=echo` / `GCM_INTERACTIVE=never` —— 双层兜底；
 *   · `GIT_PAGER=cat` / `GIT_EDITOR=true` —— 不许分页器/编辑器挂住进程；
 *   · `LC_ALL=C` —— 让错误信息稳定（便于判据匹配），不被本地化影响。
 * @param cwd - 工作目录（一般是仓库根）。
 * @param args - git 参数。
 * @param options - 见 `GitOptions`。
 * @returns 结果（**不抛**）。
 */
export function runGit(cwd: string, args: readonly string[], options: GitOptions = {}): Promise<GitRun> {
  const cfg: string[] = []
  for (const [k, v] of options.config ?? []) cfg.push('-c', `${k}=${v}`)
  return new Promise((resolve) => {
    execFile(
      'git',
      [...cfg, ...args],
      {
        cwd,
        timeout: options.timeoutMs ?? GIT_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: 'echo',
          GCM_INTERACTIVE: 'never',
          GIT_PAGER: 'cat',
          GIT_EDITOR: 'true',
          LC_ALL: 'C',
        },
      },
      (err, stdout, stderr) => {
        if (err !== null) {
          const e = err as NodeJS.ErrnoException & { killed?: boolean }
          const msg = e.killed === true
            ? `git 超时（>${options.timeoutMs ?? GIT_TIMEOUT_MS}ms）`
            : e.code === 'ENOENT'
              ? '找不到 git 可执行文件'
              : (stderr !== '' ? stderr.trim() : e.message)
          resolve({ ok: false, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), error: msg })
          return
        }
        resolve({ ok: true, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), error: '' })
      },
    )
  })
}

/**
 * 探测 git 环境（**只读**，不建任何东西）。
 *
 * ⭐ 用在 `POST /settings`（或 `/backup/setup`）里：**环境不通就拒绝开启开关**——
 *    否则开关会写着"已开启"却永不工作，**那是在说谎**（本项目一贯判据）。
 * @returns 探测结果。
 */
export async function probeGit(): Promise<{
  available: boolean
  version: string
  /** 库根是否已在**别的**仓库里（嵌套仓库会让我们的提交落到别人的仓库里）。 */
  nestedRepoAt: string
  error: string
}> {
  const root = backupDir()
  // 🔴🔴 **必须先建目录再探测**（实测踩到）：`execFile` 的 `cwd` 不存在时，
  //    Windows 上返回的是 **`ENOENT`** —— 与"**找不到 git 可执行文件**"同一个错误码！
  //    ⚠️ 后果极具欺骗性：**首次开启**（`backup/` 还不存在）会被报成
  //    "找不到 git 可执行文件"，让人去装一个**本来就装好了**的 git。
  //    ⇒ 目录先建好，这个歧义就不存在了。
  await ensureDir(root)

  const v = await runGit(root, ['--version'], { timeoutMs: 5000 })
  if (!v.ok) return { available: false, version: '', nestedRepoAt: '', error: v.error }
  const version = v.stdout.trim().replace(/^git version\s*/, '')

  // ⚠️ 嵌套检测：若 `backup/` 已在另一个仓库的工作区内，我们的提交会跑到那个仓库去。
  const top = await runGit(root, ['rev-parse', '--show-toplevel'], { timeoutMs: 5000 })
  let nestedRepoAt = ''
  if (top.ok) {
    const found = top.stdout.trim().replace(/\\/g, '/')
    const want = `${root.replace(/\\/g, '/')}/.git`
    // 只有"仓库根就是我们自己"才算没嵌套。
    if (!top.stdout.trim().replace(/\\/g, '/').endsWith(root.replace(/\\/g, '/')) && found !== '') {
      nestedRepoAt = top.stdout.trim()
    }
    if (existsSync(want)) nestedRepoAt = ''
  }
  return { available: true, version, nestedRepoAt, error: '' }
}

/** 仓库当前的配置（身份 + 是否已 init）。 */
export interface RepoState {
  /** `backup/.git` 是否存在。 */
  initialized: boolean
  /** 当前生效的提交者身份（可能来自 local / global / 生成）。 */
  identity: { name: string; email: string; source: 'local' | 'global' | 'generated' | 'none' }
  /** 仓库根绝对路径。 */
  repoPath: string
}

/** 写 `.gitignore`（白名单）与 `.gitattributes`（行尾）。 */
async function writeRepoMetadata(): Promise<void> {
  const root = backupDir()
  // 🔴 **白名单**（第一行 `*` 忽略一切，再显式放行）：
  //    失败方向安全——**将来 backup 下新增任何文件，默认不会被提交**。
  //    ⚠️ **不能写 `*` 后只放行镜像**：那会把 `.gitignore` 与 `.gitattributes` 自己排除掉
  //    ——提交后它们不在仓库里、**表现完全正常**，但 clone 出来就丢了规则（实测踩到）。
  //
  // ⭐⭐ **镜像现在直接在 `backup/` 根下**（决策 136，用户裁定：不要子目录）
  //    ⇒ 放行规则从 `!narrative/**` 改成 `!HANDOFF-*.md`：
  //    **按"与活跃文档同名"这个特征放行**，而不是按目录名。
  //    ⚠️ 好处：**将来若再加子目录，也不会被误提交**（白名单的失败方向仍然安全）。
  await writeTextAtomic(
    join(root, '.gitignore'),
    [
      '# dsh-memj 备份仓库：白名单（只维护正文镜像）',
      '*',
      '!.gitignore',
      '!.gitattributes',
      '!HANDOFF-*.md',
      '',
    ].join('\n'),
  )
  // 行尾：本项目的行尾纪律是**纯 LF**；不声明会在 Windows 上把 diff 搞成噪音
  // （`core.autocrlf` 也可能把 checkout 出来的文件改成 CRLF）。
  await writeTextAtomic(join(root, '.gitattributes'), ['*.md text eol=lf', ''].join('\n'))
}

/**
 * ⭐ **确保仓库存在并可用**（幂等；`POST /backup/setup` 的主实现）。
 *
 * 顺序：探测 git → 判嵌套 → `git init` → 写 `.gitignore`/`.gitattributes` → 决定身份。
 * @returns 逐步骤的真实结果（前端要按它逐个点亮，**不许本地假进度**）。
 */
export async function ensureRepo(): Promise<{
  ok: boolean
  steps: Array<{ id: string; label: string; ok: boolean; detail: string }>
  repoPath: string
  identity: RepoState['identity']
}> {
  const steps: Array<{ id: string; label: string; ok: boolean; detail: string }> = []
  const root = backupDir()
  let identity: RepoState['identity'] = { name: '', email: '', source: 'none' }

  // ── ① 探测 ──
  const probe = await probeGit()
  steps.push({
    id: 'probe',
    label: '检测 git 可执行文件',
    ok: probe.available,
    detail: probe.available ? `git ${probe.version}` : probe.error,
  })
  if (!probe.available) return { ok: false, steps, repoPath: '', identity }

  // ── ② 嵌套检测 ──
  const gitDir = join(root, '.git')
  const alreadyInit = existsSync(gitDir)
  if (!alreadyInit && probe.nestedRepoAt !== '') {
    // 🔴 不静默：提交会落到**别人的仓库**里，必须让用户知道并自己决定。
    steps.push({
      id: 'nested',
      label: '检查仓库位置',
      ok: false,
      detail: `当前目录已在另一个 git 仓库内（${probe.nestedRepoAt}）——为避免把提交写进那个仓库，已停止。请先把该目录移出。`,
    })
    return { ok: false, steps, repoPath: '', identity }
  }
  steps.push({
    id: 'nested',
    label: '检查仓库位置',
    ok: true,
    detail: alreadyInit ? '仓库已存在' : '不在其它仓库内',
  })

  // ── ③ init ──
  // ⚠️ `backup/` 本身可能还不存在（首次开启）⇒ 先建出来，
  //    否则 `git init` 的 cwd 不存在会报 **ENOENT**（与"找不到 git"同码，见 `probeGit`）。
  await ensureDir(root)
  if (!alreadyInit) {
    const init = await runGit(root, ['init', '--initial-branch=main'])
    steps.push({
      id: 'init',
      label: '初始化仓库',
      ok: init.ok,
      // ⚠️ 老 git 不认 `--initial-branch` ⇒ 退一步用默认分支名重试一次，别因此判失败。
      detail: init.ok ? '已创建 backup/.git' : init.error,
    })
    if (!init.ok) {
      const retry = await runGit(root, ['init'])
      if (!retry.ok) return { ok: false, steps, repoPath: '', identity }
      steps[steps.length - 1] = { ...steps[steps.length - 1]!, ok: true, detail: '已创建 backup/.git（默认分支）' }
    }
  } else {
    steps.push({ id: 'init', label: '初始化仓库', ok: true, detail: '已存在，无需重建' })
  }

  // ── ④ 忽略与行尾规则 ──
  try {
    await writeRepoMetadata()
    steps.push({ id: 'metadata', label: '写入忽略与行尾规则', ok: true, detail: '.gitignore（白名单）+ .gitattributes（LF）' })
  } catch (err) {
    steps.push({
      id: 'metadata',
      label: '写入忽略与行尾规则',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, steps, repoPath: root, identity }
  }
  // 仓库级 `autocrlf=false`（只写 local）。
  await runGit(root, ['config', '--local', 'core.autocrlf', 'false'])

  // ── ⑤ 身份三级回落 ──
  const localName = await runGit(root, ['config', '--local', 'user.name'])
  const localMail = await runGit(root, ['config', '--local', 'user.email'])
  if (localName.ok && localMail.ok && localName.stdout.trim() !== '' && localMail.stdout.trim() !== '') {
    identity = { name: localName.stdout.trim(), email: localMail.stdout.trim(), source: 'local' }
  } else {
    const gName = await runGit(root, ['config', '--global', 'user.name'])
    const gMail = await runGit(root, ['config', '--global', 'user.email'])
    if (gName.ok && gMail.ok && gName.stdout.trim() !== '' && gMail.stdout.trim() !== '') {
      identity = { name: gName.stdout.trim(), email: gMail.stdout.trim(), source: 'global' }
    } else {
      const gen = defaultIdentity()
      identity = { ...gen, source: 'generated' }
    }
    // 🔴 **只写 `--local`**（绝不 `--global`：那会改用户的全局身份）。
    await runGit(root, ['config', '--local', 'user.name', identity.name])
    await runGit(root, ['config', '--local', 'user.email', identity.email])
  }
  steps.push({
    id: 'identity',
    label: '决定提交者身份',
    ok: true,
    detail:
      identity.source === 'local'
        ? `沿用仓库记录：${identity.name} <${identity.email}>`
        : identity.source === 'global'
          ? `取自全局配置并记入仓库：${identity.name} <${identity.email}>`
          : `本次生成并记入仓库：${identity.name} <${identity.email}>`,
  })

  return { ok: true, steps, repoPath: root, identity }
}

/**
 * 读仓库现状（**只读**，供设置卡片显示）。
 * @returns 现状（仓库不存在时 `initialized: false`）。
 */
export async function readRepoState(): Promise<RepoState> {
  const root = backupDir()
  const initialized = existsSync(join(root, '.git'))
  if (!initialized) return { initialized: false, identity: { name: '', email: '', source: 'none' }, repoPath: root }
  const n = await runGit(root, ['config', '--local', 'user.name'], { timeoutMs: 5000 })
  const m = await runGit(root, ['config', '--local', 'user.email'], { timeoutMs: 5000 })
  const name = n.stdout.trim()
  const email = m.stdout.trim()
  return {
    initialized: true,
    identity: name !== '' && email !== '' ? { name, email, source: 'local' } : { name: '', email: '', source: 'none' },
    repoPath: root,
  }
}

/**
 * ⭐ **规范化提交信息**：标题行与正文之间强制留一个空行。
 *
 * 🔴 为什么必须做（实测）：`git commit -F` 的消息里，
 *    **连续的非空行属于同一段** ⇒ `"标题\n正文"` 会让 `%s` = `"标题 正文"`、
 *    `%b` 为空。表现是"提交成功、内容也在"，但 **`git log --oneline` 里主题被污染**，
 *    而 `%b`（我们用来读"这次正文变了多少"）**永远是空的**。
 * @param message - 原始信息（一般为"标题\n正文"）。
 * @returns 规范化后的信息（标题 + 空行 + 正文）。
 */
export function normalizeCommitMessage(message: string): string {
  const lines = message.replace(/\r\n/g, '\n').trimEnd().split('\n')
  const subject = (lines[0] ?? '').trim()
  const rest = lines.slice(1).join('\n').replace(/^\n+/, '').trimEnd()
  return rest === '' ? subject : `${subject}\n\n${rest}`
}

/**
 * ⭐ **提交一次**（`git add` + 有变化才 commit）。
 *
 * 🔴 身份**每次显式传**（`-c`），不隐式依赖任何配置文件——
 *    用户明确要求"显式去给身份做相关操作"。
 *
 * ⭐⭐ **只起 2 个 git 进程**（本轮优化，实测 874ms → 约 400ms）：
 *    · 旧写法是 `add` → `status --porcelain` → `commit` → `rev-parse` **四个**，
 *      而**进程启动本身就是主要开销**（Windows 上每个约 200ms）。
 *    · 现在：**无变化时 `commit` 会返回非零** ⇒ 直接用它的退出码判断"要不要提交"，
 *      **省掉 `status`**；**提交号从 `commit` 的 stdout 里抠**（`[main abc1234]`），
 *      **省掉 `rev-parse`**。
 * @param identity - 生效身份。
 * @param message - 提交信息（**多行必须走 `-F` 文件**：`-m` 会把多行中文拆坏，本项目踩过）。
 * @returns 结果；`committed: false` 表示无变化（**不是失败**）。
 */
export async function commitAll(
  identity: { name: string; email: string },
  message: string,
): Promise<{ ok: boolean; committed: boolean; hash: string; error: string }> {
  const root = backupDir()
  const cfg: ReadonlyArray<readonly [string, string]> = [
    ['user.name', identity.name],
    ['user.email', identity.email],
    // 防用户全局开了签名导致弹窗/失败（本插件不做签名）。
    ['commit.gpgsign', 'false'],
    ['core.autocrlf', 'false'],
    // 库里是本地仓库，不该去问任何凭据助手。
    ['credential.helper', ''],
  ]

  const add = await runGit(root, ['add', '-A'], { config: cfg })
  if (!add.ok) return { ok: false, committed: false, hash: '', error: `git add 失败：${add.error}` }

  // 提交信息走临时文件（在 `.git` 里，天然被忽略、且随仓库走）。
  //
  // 🔴🔴 **必须把标题与正文用空行隔开**（实测踩到）：git 的 `commit -F` 会把
  //    **连续的非空行合并成同一个段落** ⇒ 写成 `subject\nbody` 时，
  //    `%s` 会变成 `subject body`（两行挤成一行）、**`%b` 为空**。
  //    ⚠️ 这是"看起来提交成功了、内容也对，但历史信息结构坏掉"的静默问题——
  //    本项目 `git log --oneline` 一读就会发现主题里混进了正文。
  //    ⇒ 在这里统一规范化（**调用方只给"标题\n正文"即可**）。
  const normalized = normalizeCommitMessage(message)
  const msgPath = join(root, '.git', 'MEMJ_COMMIT_MSG')
  await writeTextAtomic(msgPath, `${normalized}\n`)
  const commit = await runGit(root, ['commit', '-F', msgPath], { config: cfg })

  if (commit.ok) {
    // ⭐ 提交号从 stdout 抠（形如 `[main abc1234] 标题`），**省掉一次 `rev-parse`**。
    // ⚠️ 抠不到也不能算失败——那只是"拿不到短号"，提交**已经成功了**。
    const m = /\[[^\]]*?\s([0-9a-f]{7,})\]/i.exec(commit.stdout)
    return { ok: true, committed: true, hash: m?.[1] ?? '', error: '' }
  }

  // ⭐ **无变化 ⇒ `commit` 返回非零，且 stderr 里含 "nothing to commit"**。
  //    这是**正常的"无可提交"**，不是失败 ⇒ 据此判掉，**省掉一次 `status`**。
  //    ⚠️ 判据必须**同时**看 stdout+stderr，且**大小写不敏感**——
  //      git 的措辞与本地化会影响这一行（本项目已用 `LC_ALL=C` 稳定它）。
  const combined = `${commit.stdout}\n${commit.stderr}`
  if (/nothing to commit|no changes added to commit|nothing added to commit/i.test(combined)) {
    return { ok: true, committed: false, hash: '', error: '' }
  }
  return { ok: false, committed: false, hash: '', error: `git commit 失败：${commit.error}` }
}

/** 最近一次提交（供设置卡片显示）。 */
export async function lastCommit(): Promise<{ hash: string; subject: string } | undefined> {
  const root = backupDir()
  if (!existsSync(join(root, '.git'))) return undefined
  const r = await runGit(root, ['log', '-1', '--pretty=%h%x09%s'], { timeoutMs: 5000 })
  if (!r.ok || r.stdout.trim() === '') return undefined
  const [hash = '', subject = ''] = r.stdout.trim().split('\t')
  return { hash, subject }
}

// ───────────────────────────────────────────────────────────────────────────
// ⭐⭐ 连续失败的"防脱敏"计数（决策 135）
//
// 🔴 **为什么必须有**：本项目实测过"同一句警告连报 7 次、一次没被处理"
//    ⇒ **高频警报会脱敏**（噪音训练人忽略警告）。
//    而 git 失败往往是**持续性的**（没装 git / 仓库被删 / 权限不对），
//    若每轮 handoff 都刷同一句，那句就会变成背景音。
//    ⇒ 连败到阈值后**不再逐轮复述**，改为一条"需要你去处理"的说明。
//
// ⚠️ 计数只在**进程内**（不落盘）：重启后重新开始。
//    这是刻意的——重启往往意味着"人已经介入过了"，此时重新提醒是对的。
// ───────────────────────────────────────────────────────────────────────────

/** 连续失败次数（进程内）。 */
let gitFailStreak = 0

/** 记一次成功（清零）。 */
export function noteGitSuccess(): void {
  gitFailStreak = 0
}

/**
 * 记一次失败。
 * @returns 当前连续失败次数。
 */
export function noteGitFailure(): number {
  gitFailStreak += 1
  return gitFailStreak
}

/** 读当前连续失败次数（测试与回执判断用）。 */
export function gitFailureStreak(): number {
  return gitFailStreak
}

/** 重置计数（测试用）。 */
export function resetGitFailureStreak(): void {
  gitFailStreak = 0
}
