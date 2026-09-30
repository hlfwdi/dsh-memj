import { readFileSync } from 'node:fs'
import type { UserConfig } from 'tsdown'

const PACKAGE_VERSION = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version as string

/**
 * 客户端 externals —— **只能是 seed 表那 9 个**。
 *
 * 浏览器半边 `require(...)` 的每个模块，都必须由 DSH 启动模块表（seed word）
 * 或另一条图行回答；一个**没有任何行供给**的构建期 external 会让 bundle
 * 在 materialization 阶段 **throw**。
 *
 * 本插件 client 半边只把 cordis 与各 DSH 包当**类型**导入，
 * 所以运行时 external 全集就是 react 相关三项。
 */
const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime', 'react-dom'] as const

export default [
  {
    entry: {
      index: 'src/index.ts',
      // 离线测试入口（不发布，仅本地验证纯逻辑）。
      'offline-bundle': 'src/offline.ts',
    },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    clean: true,
    define: { __DSH_MEMJ_VERSION__: JSON.stringify(PACKAGE_VERSION) },
    deps: {
      // 宿主提供单例的包一律不打包；`yaml` 是本插件自己的依赖，
      // 打包进产物可以避免运行期解析不到（它是纯 JS、无原生模块）。
      neverBundle: [
        '@deepseek-ai/cordis',
        '@deepseek-ai/dsh-atomic-write',
        '@deepseek-ai/dsh-commands',
        '@deepseek-ai/dsh-home-paths',
        '@deepseek-ai/dsh-host-webserver',
        '@deepseek-ai/dsh-system-prompt',
        '@deepseek-ai/dsh-tools',
        '@deepseek-ai/schemastery',
      ],
    },
  },
  {
    // ── client 半边 ──
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    dts: false,
    // host 条目已经清过目录；这里必须 false，否则会把 index.js 删掉。
    clean: false,
    define: { __DSH_MEMJ_VERSION__: JSON.stringify(PACKAGE_VERSION) },
    deps: { neverBundle: [...CLIENT_EXTERNALS] },
    outputOptions: {
      entryFileNames: 'client.js',
      // 硬协议：`id` **必须 = 包名**（写错 ⇒ 以错 id 注册，运行时 throw）。
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify('dsh-memj')}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
] satisfies UserConfig[]
