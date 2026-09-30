/**
 * 离线测试入口（**不参与发布**）。
 *
 * 把纯逻辑模块重新导出，供 `scripts/test-core.mjs` 在**没有 DSH 运行时**的情况下
 * 直接验证解析、校验、检索、读取分流与落盘。
 *
 * ⚠️ 这里**故意不导出** `index.ts`——那个文件依赖 cordis 与 webServer，
 * 离线跑不起来。本文件只覆盖"确定性、零 LLM、零网络"的那部分，
 * 也正是最该被离线验证的部分。
 *
 * @module dsh-memj/offline
 */

export * from './config.ts'
export * from './git.ts'
export * from './history.ts'
export * from './narrative.ts'
export * from './parse.ts'
export * from './paths.ts'
export * from './read.ts'
export * from './reads.ts'
export * from './schema.ts'
export * from './search.ts'
export * from './store.ts'
