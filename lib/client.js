window.__ModuleLoader__.load({
	id: "dsh-memj",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		//#region src/client/index.tsx
		/** 页面基址，与 host 端 `PLUGIN_BASE` **必须一致**。 */
		const PLUGIN_BASE = "/plugins/dsh-memj";
		/** host 侧的人侧面板命令名（必须与 `commands.ts` 一致）。 */
		const CMD_REVIEW = "memj-review";
		/**
		* 侧栏入口图标里那个渐变页层的 `id`。
		*
		* ⚠️ **必须全局唯一**：SVG 的 `id` 是全文档作用域，若与页面里别的 `defs` 撞名，
		* `url(#...)` 会静默指错（图标缺一块或变色，不报错）。
		* 实测本入口在侧栏**只渲染一份**，且 DSH 页面里当时没有别的 `linearGradient`
		* ⇒ 用一个带插件前缀的名字就足够安全。
		*/
		const MEMJ_MARK_GRAD_ID = "dsh-memj-mark-grad";
		/** ⭐ 两个「取交接」命令名（与 host 侧 `commands.ts` **必须一致**）。 */
		const CMD_GET_PROJECT = "memj-get-handoff-project";
		const CMD_GET_THEME = "memj-get-handoff-theme";
		/** 右侧栏页类型的 kind —— `openTab` 用它指名要开哪一个。 */
		const SIDEBAR_KIND = "dshMemj";
		/**
		* 页类型的**实现 id** —— 它同时是 `sidebar.right.pane.tab` 那个 seat 的 key
		* （⚠️ 不是 kind：kind 可以被别的实现接管，id 才是实现自己的身份）。
		*/
		const SIDEBAR_TYPE_ID = "dsh-memj/panel";
		/** 页签标题（DSH 在打开时把 `title()` 的返回值捕获进布局记录）。 */
		const SIDEBAR_TITLE = "memj 记忆库";
		/**
		* ⭐ 桌面壳检测：桌面版的 preload 会往 window 上挂 `dshDesktop`
		* （`electron.contextBridge.exposeInMainWorld("dshDesktop", …)`）。
		*
		* ⚠️ **这是 DSH 自己客户端代码用的同一判据**（`ui-chat` 用它挑默认转写视图、
		* `ui-settings-account` 用它决定要不要显示 onboarding），**不是我编的 UA 嗅探**。
		* @returns 是否跑在桌面壳里。
		*/
		function isDesktopShell() {
			try {
				return typeof globalThis === "object" && globalThis !== null && "dshDesktop" in globalThis;
			} catch {
				return false;
			}
		}
		/**
		* 「点入口能在应用内右侧栏打开」这件事，由 `apply()` 期的能力探测决定，
		* 而入口按钮组件**拿不到**那对服务 ⇒ 用这个极小的订阅点把结论传过去。
		*
		* ⚠️ `null` = 不可用（老 DSH / 浏览器版）⇒ 入口退回原来的"开新标签"。
		*/
		let openInSidebar = null;
		const sidebarReadyListeners = /* @__PURE__ */ new Set();
		/**
		* 公布/撤销"应用内打开"这个能力，并通知入口按钮重画。
		* @param opener - 打开函数；`null` 表示不可用。
		*/
		function publishSidebarOpener(opener) {
			openInSidebar = opener;
			for (const listener of sidebarReadyListeners) listener();
		}
		/**
		* 面板页址 —— ⭐ **与独立页完全同一个地址**（`?session=` 也照旧），
		* 所以右侧栏里跑的就是那一整页，没有第二份 UI 要维护。
		* @param sessionId - 当前会话 id；空串表示不带会话。
		* @returns 相对页址。
		*/
		function memjPageUrl(sessionId) {
			return sessionId === "" ? `${PLUGIN_BASE}/` : `${PLUGIN_BASE}/?session=${encodeURIComponent(sessionId)}`;
		}
		/**
		* 右侧栏里的 memj 面板：把**现有那一整页**用 iframe 嵌进来。
		*
		* ⚠️ **刻意不重写一份 UI**：那一页自带 9 个子页、目录按钮与**窄屏两级导航**
		* （`@media (max-width: 900px)`），在右侧栏这种窄容器里会自己走窄屏形态。
		* @param props - 会话槽位注入的标准 props（只用 `sessionId`）。
		* @returns iframe。
		*/
		function MemjPanelBody(props) {
			const sid = typeof props.sessionId === "string" ? props.sessionId : "";
			return react.createElement("iframe", {
				key: sid,
				src: memjPageUrl(sid),
				title: SIDEBAR_TITLE,
				style: {
					display: "block",
					width: "100%",
					height: "100%",
					border: "0"
				}
			});
		}
		/**
		* 注册「右侧栏页类型」（DSH 0.2.0-rc.2+ 的两阶段注册）。
		*
		* ⭐ 整体包在 `ctx.inject(['sidebarRight','sidebarRightTabs'], …)` 里 ——
		* 宿主不提供这两个服务时回调**永不执行**（`registry.ts` 的 inject 是
		* "等声明/等服务"，不是抛错）⇒ 老版本零影响。
		* @param ctx - 客户端上下文。
		*/
		function installSidebarPanel(ctx) {
			ctx.inject(["sidebarRight", "sidebarRightTabs"], (scope) => {
				const tabs = scope.get("sidebarRightTabs");
				const nav = scope.get("sidebarRight");
				if (tabs === void 0 || nav === void 0) return;
				scope.effect(() => tabs.register({
					id: SIDEBAR_TYPE_ID,
					kind: SIDEBAR_KIND,
					priority: "extension",
					keepMounted: true,
					title: () => SIDEBAR_TITLE,
					guide: [{
						id: "panel",
						order: 40,
						title: () => SIDEBAR_TITLE,
						description: () => "在右侧栏打开 memj 记忆库"
					}]
				}), "dsh-memj: sidebar tab type");
				const slots = scope.slots;
				scope.effect(() => slots.inject("sidebar.right.pane.tab", () => slots.register({
					name: "sidebar.right.pane.tab",
					key: SIDEBAR_TYPE_ID
				}, MemjPanelBody)), "dsh-memj: sidebar panel body");
				if (!isDesktopShell()) return;
				publishSidebarOpener((sessionId) => {
					if (sessionId === "") return;
					try {
						nav.openTab(SIDEBAR_KIND);
					} catch {}
				});
			});
		}
		/**
		* 从 host HTTP API 取项目/主题清单，转成弹窗选项。
		*
		* ⚠️ **走 HTTP 而不是命令 RPC**：这是**旁路**，不往会话日志写记录。
		* @param kind - 取项目还是主题。
		* @returns 选项数组；失败时返回空数组（弹窗显示 empty 态）。
		*/
		async function fetchListOptions(kind) {
			try {
				const res = await fetch(`${PLUGIN_BASE}/api/${kind}`, { cache: "no-store" });
				if (!res.ok) return [];
				const data = await res.json();
				if (kind === "projects") return (data.projects ?? []).map((p) => ({
					id: p.id,
					label: p.id,
					detail: p.desc !== void 0 && p.desc !== "" ? p.desc : "（无描述）"
				}));
				return (data.themes ?? []).map((t) => ({
					id: t.id,
					label: t.id,
					detail: `${t.desc !== void 0 && t.desc !== "" ? t.desc : "（无描述）"} ｜ ${t.covers ?? 0} 条知识`
				}));
			} catch {
				return [];
			}
		}
		/**
		* ⭐⭐ **跨版本取"当前会话 id"**。
		*
		* - **0.1.5-rc.2**：直接用 `state.current`；
		* - **0.2.0-rc.2**：`current` 已被删除 ⇒ 退到 **主视图持有的那个会话** ——
		*   这正是 DSH 自己的判据（`dsh-client-ui-layout` 的 `DocumentTitle`）：
		*   `Object.values(state.byId).find((s) => (s.retainedBy.mainView ?? 0) > 0)?.id`。
		*
		* ⚠️ **必须先认 `current`**：这样在 0.1.5 上行为一字不变，两版共用一份实现、不分叉。
		* ⚠️ 返回值是**字符串或 undefined**（选择器 hook 要求引用稳定的返回值，
		* 直接回 state 对象会让每次快照都被判成"变了"）。
		* @param state - `useSessions` 选择器的入参。
		* @returns 当前会话 id；取不到时 `undefined`。
		*/
		function currentSessionOf(state) {
			const cur = state.current;
			if (typeof cur === "string" && cur !== "") return cur;
			for (const row of Object.values(state.byId ?? {})) {
				if (row === void 0) continue;
				if ((row.retainedBy?.mainView ?? 0) > 0) {
					const id = row.id;
					if (typeof id === "string" && id !== "") return id;
				}
			}
		}
		/**
		* ⭐⭐ **跨窗口广播当前会话**（用户 2026-09-22 要求："我在 dsh 切换会话的时候，
		* 前端就要去获取到 sessionId"）。
		*
		* ── 为什么需要它 ────────────────────────────────────────────────────────────
		* 记忆库是**独立标签页**（`target="_blank"`），它的 `?session=` 是
		* **打开那一刻**烘焙进 URL 的 ⇒ 之后你在 DSH 里切会话，**那个标签不知道**，
		* 会一直对着旧会话显示状态、写绑定。
		*
		* ── 做法照抄本项目已有的同类实现（**不另造**）────────────────────────────────
		* `dsh-prompt-inject/src/client/index.tsx:30-39` 用 `BroadcastChannel` 解决同一问题；
		* 本项目纪律：**引入新写法前，先看同一个载体里有没有人这么写**。
		* ⚠️ 频道名**必须用本插件自己的**（`dsh-memj`）——用别人的会串台
		* （同源策略下 `BroadcastChannel` 按名字隔离，但同名就会互相收）。
		*
		* ⚠️ **`BroadcastChannel` 只在同源、同浏览器、同 profile 下有效**；
		* 不同浏览器/无痕窗口之间**不通**（那时页面里的「当前会话」会停在打开时的值，
		* 用户可在页面上手动改绑定 —— 这是可接受的降级，**不静默**：页面会显示会话 id）。
		*/
		const HOT_CHANNEL = "dsh-memj";
		/**
		* ⭐ **「去会话」跳转的广播频道名**（2026-10-14，第 7 期）。
		*
		* ⚠️ **与 `HOT_CHANNEL` 同名但消息类型不同**（`memj:open-session`）——
		*    刻意复用同一个频道：`BroadcastChannel` 本身按名字隔离，
		*    再开一个只是多一份资源；而消息靠 `type` 字段区分已经够。
		* 🔴 **不要改成别的插件的频道名**（同源下同名会串台）。
		*/
		const SESSION_JUMP_CHANNEL = "dsh-memj";
		/** 惰性建一次（`BroadcastChannel` 在旧浏览器可能不存在 ⇒ 整个广播降级为 no-op）。 */
		let hotChannel = null;
		/**
		* 广播"当前会话变了"。
		* @param sessionId - 当前选中的会话 id；空值**不广播**（没有意义且会覆盖页面上的有效值）。
		*/
		function broadcastSession(sessionId) {
			if (typeof sessionId !== "string" || sessionId === "") return;
			try {
				if (hotChannel === null) hotChannel = new BroadcastChannel(HOT_CHANNEL);
				hotChannel.postMessage({
					type: "session",
					sessionId
				});
			} catch {}
		}
		/**
		* 记忆库入口按钮。
		*
		* 🔴 root scope 的 props 里**没有 `sessionId`**——那是 session scope 才注入的，
		* 必须用全局 hook `useSessions` 自己取。
		* ⭐ 但 `useSessions` 是**订阅式**的：DSH 里切会话时会**重新渲染本组件**
		* ⇒ 借这次重渲染把新会话**广播**给已打开的页面（见上）。
		* @param props - 列宽状态与全局 hooks。
		* @returns 指向独立页面的链接。
		*/
		function MemjEntryButton({ wide, useSessions }) {
			const sessionId = useSessions(currentSessionOf);
			const sid = sessionId === void 0 || sessionId === null ? "" : String(sessionId);
			react.useEffect(() => {
				broadcastSession(sid);
			}, [sid]);
			const [inApp, setInApp] = react.useState(openInSidebar !== null);
			react.useEffect(() => {
				const sync = () => setInApp(openInSidebar !== null);
				sidebarReadyListeners.add(sync);
				sync();
				return () => {
					sidebarReadyListeners.delete(sync);
				};
			}, []);
			/** 没有在屏会话时 `openTab` 无处落 ⇒ 那种情况仍走新标签。 */
			const inAppReady = inApp && sid !== "";
			const href = memjPageUrl(sid);
			return react.createElement("a", {
				href,
				target: "_blank",
				rel: "noopener noreferrer",
				...inAppReady ? { onClick: (event) => {
					if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
					event.preventDefault();
					openInSidebar?.(sid);
				} } : {},
				"aria-label": "打开 memj 记忆库",
				title: inAppReady ? "memj 记忆库（在右侧栏打开）" : "memj 记忆库",
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: wide ? "flex-start" : "center",
					gap: wide ? "8px" : "0",
					width: "100%",
					height: "32px",
					padding: wide ? "0 6px" : "0",
					boxSizing: "border-box",
					borderRadius: "6px",
					color: "var(--dsw-alias-label-primary, inherit)",
					textDecoration: "none",
					fontSize: "13px",
					lineHeight: "32px",
					cursor: "pointer"
				}
			}, react.createElement("span", {
				"aria-hidden": true,
				style: {
					width: "16px",
					height: "16px",
					flex: "0 0 16px",
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center"
				}
			}, react.createElement("svg", {
				width: 16,
				height: 16,
				viewBox: "0 0 24 24",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": true
			}, react.createElement("defs", null, react.createElement("linearGradient", {
				id: MEMJ_MARK_GRAD_ID,
				x1: 0,
				y1: 1,
				x2: 1,
				y2: 0
			}, react.createElement("stop", {
				offset: 0,
				stopColor: "#9B4DFF"
			}), react.createElement("stop", {
				offset: 1,
				stopColor: "#6E7BFF"
			}))), react.createElement("g", { fill: `url(#${MEMJ_MARK_GRAD_ID})` }, react.createElement("rect", {
				x: 15.2,
				y: 14.6,
				width: 6.4,
				height: 3.6,
				rx: 1.1,
				opacity: .85
			}), react.createElement("rect", {
				x: 14.6,
				y: 16.8,
				width: 6.4,
				height: 3.6,
				rx: 1.1,
				opacity: .55
			}), react.createElement("rect", {
				x: 14,
				y: 19,
				width: 6.4,
				height: 3.6,
				rx: 1.1,
				opacity: .3
			})), react.createElement("path", {
				d: "M13.8 7.8 L13.8 14.5 C13.8 19.0 11.2 21.6 7.4 21.6 C5.0 21.6 3.4 20.0 3.4 18.2",
				stroke: "currentColor",
				"stroke-width": 4.6,
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				fill: "none"
			}), react.createElement("path", {
				d: "M21.80 3.30L19.33 4.03L18.60 6.50L17.87 4.03L15.40 3.30L17.87 2.57L18.60 0.10L19.33 2.57Z",
				fill: "currentColor"
			}))), wide ? react.createElement("span", null, "memj 记忆库") : null);
		}
		/**
		* 从 host 的 HTTP API 取人侧状态摘要，转成弹窗选项。
		*
		* 🔴 **为什么不用 `session.command(...)`**：那会往会话日志写命令记录；
		* HTTP 是旁路，不碰会话日志。
		* @returns 四个入口选项；失败时返回空数组（弹窗显示 empty 态）。
		*/
		async function fetchReviewOptions() {
			try {
				const res = await fetch(`${PLUGIN_BASE}/api/health`, { cache: "no-store" });
				if (!res.ok) return [];
				const data = await res.json();
				const n = data.nominations ?? 0;
				const bad = data.invalidCovers ?? 0;
				return [
					{
						id: "pending",
						label: `待批 global 提名（${n}）`,
						detail: n === 0 ? "当前没有待批准的提名" : "选中后查看明细，并可在网页界面批准 / 否决",
						...n > 0 ? { active: true } : {}
					},
					{
						id: "broken",
						label: "断链的外部引用",
						detail: "ext: true 但目标文件已不存在——需要人工补档或删封面"
					},
					{
						id: "invalid",
						label: `非法封面（${bad}）`,
						detail: bad === 0 ? "全部封面格式合法" : "格式不合法，重建时已被跳过",
						...bad > 0 ? { active: true } : {}
					},
					{
						id: "rebuild",
						label: "重建派生层",
						detail: `从项目文档重新聚合 THEME / GLOBAL（当前 ${data.projects ?? 0} 个项目、${data.themes ?? 0} 个主题）`
					}
				];
			} catch {
				return [];
			}
		}
		/**
		* ⭐⭐⭐ **「去会话」跳转的接收端**（2026-10-14，第 7 期）。
		*
		* ── 为什么要两半 ──────────────────────────────────────────────────────────
		* 阅读页是**独立页面**（`/plugins/dsh-memj/`），它**碰不到**主应用的视图状态；
		* 而"切到某个会话"必须由主应用做。
		*
		* 🔴 **不能靠 URL 参数**（实测推翻，见 `src/web/app.js` 的注释）：
		*    DSH 的 `authorizeIndex` 在 token 校验后**无条件 303 到 `./`**
		*    ⇒ 任何 query（含 `?session=`）都进不来。
		*
		* ⇒ 用 **`BroadcastChannel`**（同源跨页通信）。本项目已有先例：
		*    主应用 → 插件页那条（`HOT_CHANNEL`，见 `broadcastSession`）。
		*    本条是**反方向**：插件页 → 主应用。
		*
		* ── 关键机制 ──────────────────────────────────────────────────────────────
		* `uiWorkspace.openSession(target)`：
		*   · 签名 `openSession(target: SessionTarget): void`（**同步**，不返回 Promise）；
		*   · `SessionTarget = SessionId | SubagentAddress` ⇒ **直接传 id 字符串**即可；
		*   · 它就是侧栏点会话走的那条路 ⇒ 与手工点击**行为一致**。
		*
		* ⚠️ 服务取法照本项目纪律：`ctx.inject(['uiWorkspace'], cb)` + `scope.get(...)`
		*    （**不是** `ctx.uiWorkspace` 属性访问 —— 那是 undefined，库内 `4cfbb8d6`）。
		* @param ctx - 客户端上下文。
		*/
		function installSessionJumpReceiver(ctx) {
			ctx.inject(["uiWorkspace"], (scope) => {
				const ws = scope.get("uiWorkspace");
				if (ws === void 0) return;
				let channel = null;
				const onMessage = (ev) => {
					const d = ev.data;
					if (d === null || typeof d !== "object") return;
					if (d.type !== "memj:open-session") return;
					const sessionId = d.sessionId;
					if (typeof sessionId !== "string" || sessionId === "") return;
					try {
						ws.openSession(sessionId);
					} catch (err) {
						console.warn("[dsh-memj] openSession 失败（会话可能已不存在）：", err);
					}
				};
				scope.effect(() => {
					try {
						channel = new BroadcastChannel(SESSION_JUMP_CHANNEL);
						channel.addEventListener("message", onMessage);
						return () => {
							try {
								channel?.removeEventListener("message", onMessage);
								channel?.close();
							} catch {}
							channel = null;
						};
					} catch {
						return () => {};
					}
				}, "dsh-memj: session jump receiver");
			});
		}
		const name = "dsh-memj";
		/**
		* ⚠️ 这些是 **cordis 服务名**，不是包名。
		* 客户端**包名边**由 `package.json` 的 `dsh.client.inject` 单独声明——两者是两套东西。
		*/
		const inject = [
			"slots",
			"commandUi",
			"sessions"
		];
		/**
		* 注册侧边栏入口与 `/memj-review` 的弹窗。
		* @param ctx - 客户端上下文。
		*/
		function apply(ctx) {
			installSessionJumpReceiver(ctx);
			ctx.slots.inject("sidebar.footer.action", function* () {
				yield ctx.slots.register({
					name: "sidebar.footer.action",
					id: "dsh-memj",
					order: 70,
					label: () => "memj 记忆库"
				}, MemjEntryButton);
			});
			installSidebarPanel(ctx);
			const commandUi = ctx.get("commandUi");
			if (commandUi === void 0) return;
			const sessions = ctx.get("sessions");
			if (sessions === void 0) return;
			/**
			* 选项选中后：**把完整命令行回交 host**，由 host 的命令 handler 产出内容。
			*
			* ⚠️ **为什么不在 client 直接处理**：人侧面板的内容（提名明细、断链清单）
			* 与"批准/否决"动作都在 host 侧；client 只负责发起。
			* ⚠️ `ClientSessionContext` **只有 `{ sessionId }`**（刻意的极小投影）。
			* 要拿能执行命令的会话对象，得用 `ctx.sessions.binding(id)?.session`。
			*/
			const decoration = {
				name: CMD_REVIEW,
				available: () => true,
				ui: {
					kind: "popupSelect",
					options: async () => fetchReviewOptions(),
					onSelect: async (option, session) => {
						const face = sessions.binding(session.sessionId);
						if (face !== void 0) await face.session.command(`/${CMD_REVIEW} ${option.id}`);
					}
				}
			};
			ctx.effect(() => commandUi.decorate(decoration), "dsh-memj: review popup");
			/**
			* 造一个"选中后写回输入框"的装饰。
			* @param name - host 命令名。
			* @param kind - 列表来源（projects / themes）。
			* @returns 装饰定义。
			*/
			const makeDraftDecoration = (name, kind) => ({
				name,
				available: () => true,
				ui: {
					kind: "popupSelect",
					options: async () => fetchListOptions(kind),
					onSelect: async (option, session) => {
						const face = sessions.binding(session.sessionId);
						if (face === void 0) return;
						const line = `/${name} ${option.id} `;
						queueMicrotask(() => {
							try {
								const sctx = face.ctx;
								((sctx?.get?.("conversation"))?.input?.for?.(sctx))?.setDraft?.(line);
							} catch {}
						});
					}
				}
			});
			for (const decoration of [makeDraftDecoration(CMD_GET_PROJECT, "projects"), makeDraftDecoration(CMD_GET_THEME, "themes")]) ctx.effect(() => commandUi.decorate(decoration), `dsh-memj: ${decoration.name} popup`);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
