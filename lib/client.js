window.__ModuleLoader__.load({
	id: "dsh-desktop-notify",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		// dsh's client bundler only exposes the classic React API, so we build
		// every node with React.createElement directly (no jsx-runtime).
		const e = react.createElement;

		/** Same-origin config endpoints exposed by the host half. */
		const CONFIG_ENDPOINT = "/desktop-notify-config";
		const CONFIG_SAVE_ENDPOINT = "/desktop-notify-config-save";

		/** Default icon shipped by the plugin: a bundled character image. */
		const DEFAULT_ICON_URL = "https://raw.githubusercontent.com/crazy-L118/dsh-desktop-notify/main/assets/dsh-icon.jpg";

		/**
		 * Row styles. Inline-injected once per page like every dsh plugin bundle.
		 * The ON track uses a fixed green so the active state is obvious in both
		 * light and dark themes; text colors still follow the host's --dsw-* tokens.
		 * The push sub-panel is visually nested under the master row via a left
		 * border + indent.
		 */
		const CSS_TAG = "dsh-desktop-notify/row.css";
		const css = [
			".dshdn-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}",
			".dshdn-text{display:flex;flex-direction:column;gap:4px;min-width:0}",
			".dshdn-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary)}",
			".dshdn-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
			".dshdn-switch{position:relative;width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-label-dimmed);border:none;padding:0;cursor:pointer;transition:background .2s;flex-shrink:0}",
			".dshdn-switch[data-on='true']{background:#22c55e}",
			".dshdn-switch[data-on='false']{background:var(--dsw-alias-label-dimmed)}",
			".dshdn-switch:disabled{opacity:.45;cursor:default}",
			".dshdn-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .2s}",
			".dshdn-switch[data-on='true'] .dshdn-knob{left:18px}",
			".dshdn-sub{border-left:2px solid var(--dsw-alias-border-l2);margin-top:14px;padding-left:14px;display:flex;flex-direction:column;gap:14px}",
			".dshdn-sub-row{display:flex;align-items:center;justify-content:space-between;gap:12px}",
			".dshdn-sub-title{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}",
			".dshdn-sub-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);margin:2px 0 0}",
			".dshdn-field{display:flex;flex-direction:column;gap:6px}",
			".dshdn-field label{font-size:12px;color:var(--dsw-alias-label-secondary)}",
			".dshdn-input{width:100%;box-sizing:border-box;padding:8px 10px;font-size:13px;border-radius:8px;background:var(--dsw-alias-fill-l1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);outline:none}",
			".dshdn-input:focus{border-color:var(--dsw-alias-brand-primary)}",
			".dshdn-input-row{display:flex;align-items:center;gap:8px}",
			".dshdn-input-row .dshdn-input{flex:1}",
			".dshdn-reset{font-size:12px;color:var(--dsw-alias-brand-primary);background:none;border:none;padding:0;cursor:pointer;white-space:nowrap}",
			".dshdn-reset:hover{text-decoration:underline}"
		].join("\n");
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_TAG}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-desktop-notify";
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		/** i18n namespace for this plugin's settings-row copy. */
		const LOCALE_NS = "settings.desktop-notify";

		/** Subscribe to the dsh locale snapshot and re-render on language switches. */
		function useLocaleSnapshot(locale) {
			return react.useSyncExternalStore(
				(callback) => locale.subscribe(callback),
				() => locale.getSnapshot(),
				() => locale.getSnapshot()
			);
		}

		/** Shared switch button used by both the master row and the push sub-panel. */
		function SwitchButton(_ref) {
			const on = _ref.on;
			const disabled = _ref.disabled;
			const onClick = _ref.onClick;
			return e("button", {
				type: "button",
				className: "dshdn-switch",
				role: "switch",
				"aria-checked": String(on),
				"data-on": String(on),
				disabled,
				onClick,
				children: e("span", { className: "dshdn-knob" })
			});
		}

		/**
		 * HTTP push sub-panel. Rendered only when the master desktop-notify
		 * toggle is on. The user supplies their own server URL and token; which
		 * concrete service backs it is entirely their decision.
		 */
		function HttpPushPanel(_ref) {
			const locale = _ref.locale;
			const initial = _ref.initialPush || { enabled: false, server: "", token: "", icon: DEFAULT_ICON_URL };

			const snapshot = useLocaleSnapshot(locale);
			const activeLocale = snapshot && snapshot.active;
			const t = locale.bind(LOCALE_NS);

			const enabledState = react.useState(initial.enabled === true);
			const enabled = enabledState[0];
			const setEnabled = enabledState[1];
			const serverState = react.useState(initial.server || "");
			const server = serverState[0];
			const setServer = serverState[1];
			const tokenState = react.useState(initial.token || "");
			const token = tokenState[0];
			const setToken = tokenState[1];
			const iconState = react.useState(initial.icon || DEFAULT_ICON_URL);
			const icon = iconState[0];
			const setIcon = iconState[1];
			const busyState = react.useState(false);
			const busy = busyState[0];
			const setBusy = busyState[1];

			// Persist the full push object (merged with whichever field changed).
			const save = (patch, rollback) => {
				if (busy) return;
				setBusy(true);
				fetch(CONFIG_SAVE_ENDPOINT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(Object.assign({ push: { enabled, server, token, icon } }, patch))
				})
					.then((res) => res.json())
					.then((body) => {
						if (body && body.ok && body.config && body.config.push) {
							const p = body.config.push;
							setEnabled(p.enabled === true);
							setServer(p.server || "");
							setToken(p.token || "");
							setIcon(p.icon || DEFAULT_ICON_URL);
						} else if (rollback) {
							rollback();
						}
					})
					.catch(() => {
						if (rollback) rollback();
					})
					.finally(() => setBusy(false));
			};

			const toggle = () => {
				const next = !enabled;
				setEnabled(next);
				save({ push: { enabled: next } }, () => setEnabled(!next));
			};

			const onServerBlur = () => save({ push: { server } });
			const onTokenBlur = () => save({ push: { token } });
			const onIconBlur = () => save({ push: { icon } });
			const resetIcon = () => {
				setIcon(DEFAULT_ICON_URL);
				save({ push: { icon: DEFAULT_ICON_URL } });
			};

			const pushTitle = activeLocale ? t("pushTitle") : "HTTP 调用";
			const pushDesc = activeLocale ? t("pushDesc") : "通过任意 HTTP 接口把完成通知推送到其他设备";
			const serverLabel = activeLocale ? t("serverLabel") : "服务器地址";
			const tokenLabel = activeLocale ? t("tokenLabel") : "访问令牌";
			const tokenPlaceholder = activeLocale ? t("tokenPlaceholder") : "可留空";
			const iconLabel = activeLocale ? t("iconLabel") : "图标地址";
			const iconPlaceholder = activeLocale ? t("iconPlaceholder") : "https://…";
			const resetLabel = activeLocale ? t("resetLabel") : "恢复默认";

			return e("div", { className: "dshdn-sub" },
				e("div", { className: "dshdn-sub-row" },
					e("div", { className: "dshdn-text" },
						e("div", { className: "dshdn-sub-title" }, pushTitle),
						e("div", { className: "dshdn-sub-desc" }, pushDesc)
					),
					e(SwitchButton, { on: enabled, disabled: busy, onClick: toggle })
				),
				enabled ? e("div", { className: "dshdn-field" },
					e("label", null, serverLabel),
					e("input", {
						className: "dshdn-input",
						type: "text",
						placeholder: "https://example.com/push",
						value: server,
						onChange: (ev) => setServer(ev.target.value),
						onBlur: onServerBlur
					})
				) : null,
				enabled ? e("div", { className: "dshdn-field" },
					e("label", null, tokenLabel),
					e("input", {
						className: "dshdn-input",
						type: "password",
						placeholder: tokenPlaceholder,
						value: token,
						onChange: (ev) => setToken(ev.target.value),
						onBlur: onTokenBlur
					})
				) : null,
				enabled ? e("div", { className: "dshdn-field" },
					e("label", null, iconLabel),
					e("div", { className: "dshdn-input-row" },
						e("input", {
							className: "dshdn-input",
							type: "text",
							placeholder: iconPlaceholder,
							value: icon,
							onChange: (ev) => setIcon(ev.target.value),
							onBlur: onIconBlur
						}),
						e("button", { className: "dshdn-reset", type: "button", onClick: resetIcon }, resetLabel)
					)
				) : null
			);
		}

		/** The preference row this plugin owns: master on/off for done notifications. */
		function NotifyRow(_ref3) {
			const locale = _ref3.locale;
			const phaseState = react.useState("loading"); // loading | ready | error
			const phase = phaseState[0];
			const setPhase = phaseState[1];
			const enabledState = react.useState(true);
			const enabled = enabledState[0];
			const setEnabled = enabledState[1];
			const pushConfigState = react.useState({ enabled: false, server: "", token: "", icon: DEFAULT_ICON_URL });
			const pushConfig = pushConfigState[0];
			const setPushConfig = pushConfigState[1];
			const busyState = react.useState(false);
			const busy = busyState[0];
			const setBusy = busyState[1];

			// Read active locale from dsh's locale service; text follows the Language setting.
			const snapshot = useLocaleSnapshot(locale);
			const activeLocale = snapshot && snapshot.active;
			const t = locale.bind(LOCALE_NS);
			const title = activeLocale ? t("title") : "桌面完成通知";
			const desc = activeLocale ? t("desc") : "AI 完成一轮回复后弹出系统桌面通知（子代理不提醒）";

			react.useEffect(() => {
				let alive = true;
				fetch(CONFIG_ENDPOINT)
					.then((res) => res.json())
					.then((body) => {
						if (!alive) return;
						if (body && body.ok && body.config) {
							const c = body.config;
							setEnabled(c.enabled !== false);
							const p = (c.push && typeof c.push === "object") ? c.push : { enabled: false, server: "", token: "", icon: DEFAULT_ICON_URL };
							setPushConfig({ enabled: p.enabled === true, server: p.server || "", token: p.token || "", icon: p.icon || DEFAULT_ICON_URL });
							setPhase("ready");
						} else {
							setPhase("error");
						}
					})
					.catch(() => {
						if (alive) setPhase("error");
					});
				return () => {
					alive = false;
				};
			}, []);

			const toggle = () => {
				if (busy || phase === "loading") return;
				const next = !enabled;
				setEnabled(next); // optimistic
				setBusy(true);
				fetch(CONFIG_SAVE_ENDPOINT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ enabled: next })
				})
					.then((res) => res.json())
					.then((body) => {
						if (body && body.ok && body.config) {
							setEnabled(body.config.enabled !== false);
						} else {
							setEnabled(!next); // roll back on failure
						}
					})
					.catch(() => setEnabled(!next))
					.finally(() => setBusy(false));
			};

			return e("div", null,
				e("div", { className: "dshdn-row" },
					e("div", { className: "dshdn-text" },
						e("div", { className: "dshdn-title" }, title),
						e("div", { className: "dshdn-desc" }, desc)
					),
					e(SwitchButton, {
						on: phase === "loading" ? false : enabled,
						disabled: phase !== "ready" || busy,
						onClick: toggle
					})
				),
				(phase === "ready" && enabled) ? e(HttpPushPanel, { locale, initialPush: pushConfig }) : null
			);
		}

		/** Client services: slots registry plus the dsh locale service. */
		const inject = ["slots", "locale"];

		/**
		 * Client plugin body: register the preference row into the General
		 * section's item slot — the same additive seat used by Appearance,
		 * Language, and Composer Enter.
		 * @param ctx - client cordis context.
		 */
		function apply(ctx) {
			const locale = ctx.locale;
			// Register zh/en copy so the row follows dsh's Language setting.
			locale && locale.register && locale.register(LOCALE_NS, {
				zh: {
					title: "桌面完成通知",
					desc: "AI 完成一轮回复后弹出系统桌面通知（子代理不提醒）",
					pushTitle: "HTTP 调用",
					pushDesc: "通过任意 HTTP 接口把完成通知推送到其他设备",
					serverLabel: "服务器地址",
					tokenLabel: "访问令牌",
					tokenPlaceholder: "可留空",
					iconLabel: "图标地址",
					iconPlaceholder: "https://…",
					resetLabel: "恢复默认"
				},
				en: {
					title: "Desktop Notification on Done",
					desc: "Show a system notification when AI finishes a reply (subagents stay silent)",
					pushTitle: "HTTP Call",
					pushDesc: "Push the done notification to any other device via an HTTP endpoint you configure",
					serverLabel: "Server URL",
					tokenLabel: "Access Token",
					tokenPlaceholder: "optional",
					iconLabel: "Icon URL",
					iconPlaceholder: "https://…",
					resetLabel: "Reset to default"
				}
			});

			ctx.slots.inject("settings.general.item", () =>
				ctx.slots.register(
					{
						name: "settings.general.item",
						id: "desktop-notify",
						order: 40
					},
					(props) => e(NotifyRow, Object.assign({}, props, { locale }))
				)
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
