/**
 * memj 的**消息来源 kind** 声明（0.2.0-rc.2 迁移）。
 *
 * 🔴 **为什么需要这个文件**：
 *   0.1.5 的 `dsh-llm` 里 `MessageSourceMap` 有一个 **catch-all `plugin`** 条目
 *   （`plugin: { kind: 'plugin'; plugin: string } & ContextFormed`），
 *   所以插件只要写 `{ kind: 'plugin', plugin: 'dsh-memj' }` 就合法。
 *
 *   0.2.0 **删掉了它**。`MessageSourceMap` 的注释原话：
 *     「Merge-extensible sum type — each producer declares its own `kind` in its
 *       own module; **there is no shared catch-all `plugin` kind**.」
 *   并且 `dsh-session-format-v3-to-v4` 的原生 V4 准入会**硬拒**旧形状：
 *     `SessionFormatError: format v4 message requires a producer-owned source kind`
 *   （判定条件：`kind` 非空字符串且 **!== 'plugin'**）。
 *
 * ⭐ **本插件的 kind 为什么是 `plugin:dsh-memj`**：
 *   V3→V4 迁移侧用 `producerKind(plugin, role)` 把旧形状映射为新 kind ——
 *   先查 `RENAMED_PRODUCERS`，再查 `RELEASED_SAME_NAME_PRODUCERS`，
 *   都没有就返回 `` `plugin:${plugin}` ``。`dsh-memj` 两张表都不在 ⇒ `plugin:dsh-memj`。
 *   ⇒ **与迁移器保持一致**，旧会话里的历史注入也能被同一个判据认出来。
 *
 * ⚠️ 只声明不写运行时：本文件被 `index.ts` 以 `import type {} from './message-source.ts'`
 *    引入，目的是把这次 module augmentation 纳入编译。
 *
 * 🔴🔴 **那一行 import 是必需的，别删**（2026-10-08 实测记一笔）：
 *    本文件此前**没有任何消费者** —— 它只是靠 `tsconfig.json` 的 `include: ["src"]`
 *    被捎带进编译程序，而**文件头当时却写着"被 index.ts 引入"**（注释与事实不符）。
 *    两者在"能编过"这一点上效果相同，但**可靠性不同**：
 *    `include` 一旦被收窄成显式清单，augmentation 会**静默失效**
 *    （各处都写字符串字面量 `'plugin:dsh-memj'`，没有类型约束会报错）。
 *    ⇒ 已按注释补上 `index.ts` 的 import：**让注释描述的事实真的成立**。
 *
 * ⭐ **这个 kind 的取值已被实测证实**（不是照文档推的）：逐帧解本机 8 个
 *    `session.v4.jsonl.zstd`（16 313 条 source），memj 的注入一律是
 *    `{"kind":"plugin:dsh-memj","form":"instructions"}`（51 处），全库无 `kind:"plugin"`。
 */

/** 一条注入指令块里的分节（保留以便溯源）。 */
export interface MemjInjectedSection {
  readonly name: string
  readonly text: string
}

/**
 * 本插件写入的每一条消息的 `source` 形状。
 *
 * ⚠️ `sections` 在 rc.2 的 `ContextFormed` 里**只与 `form: 'snapshot'` 配对**
 *    —— 它与 `form: 'instructions'` 同时出现是既有的类型不符（0.1.5 亦然），
 *    运行期 V4 准入不校验 `form`/`sections`，故不影响加载；此处如实照搬实际形状。
 */
export interface MemjMessageSource {
  readonly kind: 'plugin:dsh-memj'
  readonly form?: 'instructions'
  readonly sections?: readonly MemjInjectedSection[]
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'plugin:dsh-memj': MemjMessageSource
  }
}
