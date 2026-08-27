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

		/** A fresh, empty push target (device) record. The host assigns an id. */
		function emptyTarget(index) {
			return { label: index ? "设备 " + index : "", enabled: true, server: "", token: "", icon: DEFAULT_ICON_URL };
		}

		/**
		 * Row styles. Inline-injected once per page like every dsh plugin bundle.
		 * The ON track uses a fixed green so the active state is obvious in both
		 * light and dark themes; text colors still follow the host's --dsw-* tokens.
		 * The push sub-panel is visually nested under the master row via a left
		 * border + indent, and each device renders as a bordered card.
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
			".dshdn-reset:hover{text-decoration:underline}",
			".dshdn-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-fill-l1)}",
			".dshdn-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}",
			".dshdn-card-title{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dshdn-card-title .dshdn-text{min-width:0}",
			".dshdn-card-actions{display:flex;align-items:center;gap:10px;flex-shrink:0}",
			".dshdn-remove{font-size:12px;color:var(--dsw-alias-state-error-primary);background:none;border:none;padding:0;cursor:pointer;white-space:nowrap}",
			".dshdn-remove:hover{text-decoration:underline}",
			".dshdn-add{font-size:12px;color:var(--dsw-alias-brand-primary);background:none;border:none;padding:4px 0;cursor:pointer;align-self:flex-start}",
			".dshdn-add:hover{text-decoration:underline}",
			".dshdn-chip{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-left:8px;font-weight:400}",
			".dshdn-upgrade{margin-top:10px;border-radius:8px;padding:10px 12px;background:rgba(245,158,11,.12);border:1px solid var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;display:flex;flex-wrap:wrap;gap:4px;align-items:baseline}",
			".dshdn-upgrade code{background:var(--dsw-alias-fill-l1);padding:1px 5px;border-radius:4px;font-size:11px}"
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

		/**
		 * Bound locale translator for this plugin's namespace. When the locale
		 * service is unavailable (or unbound) it returns an identity translator
		 * so the settings row never crashes.
		 */
		function bindT(locale) {
			if (locale && typeof locale.bind === "function") return locale.bind(LOCALE_NS);
			return (key) => key;
		}

		/** Subscribe to the dsh locale snapshot and re-render on language switches. */
		function useLocaleSnapshot(locale) {
			return react.useSyncExternalStore(
				(callback) => locale.subscribe(callback),
				() => locale.getSnapshot(),
				() => locale.getSnapshot()
			);
		}

		/** Shared switch button used by the master row and each push sub-panel. */
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
		 * One device card inside the HTTP call section. Each device keeps its
		 * own name, enable switch, server URL, access token, and icon.
		 */
		function PushTargetCard(_ref2) {
			const locale = _ref2.locale;
			// Defensive: never let a missing/broken translator crash the settings panel.
			const t = typeof _ref2.t === "function" ? _ref2.t : (key) => key;
			const target = _ref2.target;
			const index = _ref2.index;
			const busy = _ref2.busy;
			const onCommit = _ref2.onCommit;
			const onRemove = _ref2.onRemove;

			const enabledState = react.useState(target.enabled === true);
			const enabled = enabledState[0];
			const setEnabled = enabledState[1];
			const serverState = react.useState(target.server || "");
			const server = serverState[0];
			const setServer = serverState[1];
			const tokenState = react.useState(target.token || "");
			const token = tokenState[0];
			const setToken = tokenState[1];
			const iconState = react.useState(target.icon || DEFAULT_ICON_URL);
			const icon = iconState[0];
			const setIcon = iconState[1];
			const labelState = react.useState(target.label || "");
			const label = labelState[0];
			const setLabel = labelState[1];

			const toggle = () => {
				const next = !enabled;
				setEnabled(next);
				onCommit({ ...target, enabled: next });
			};
			const commitField = (patch) => {
				onCommit({ ...target, ...patch });
			};
			const resetIcon = () => {
				setIcon(DEFAULT_ICON_URL);
				commitField({ icon: DEFAULT_ICON_URL });
			};

			const nameLabel = t("targetName");
			const serverLabel = t("serverLabel");
			const tokenLabel = t("tokenLabel");
			const tokenPlaceholder = t("tokenPlaceholder");
			const iconLabel = t("iconLabel");
			const iconPlaceholder = t("iconPlaceholder");
			const resetLabel = t("resetLabel");
			const removeLabel = t("remove");
			const title = (label && label.trim()) ? label.trim() : t("targetDefault") + " " + (index + 1);

			return e("div", { className: "dshdn-card" },
				e("div", { className: "dshdn-card-head" },
					e("div", { className: "dshdn-card-title", children: title }),
					e("div", { className: "dshdn-card-actions" },
						e(SwitchButton, { on: enabled, disabled: busy, onClick: toggle }),
						e("button", { className: "dshdn-remove", type: "button", disabled: busy, onClick: onRemove }, removeLabel)
					)
				),
				e("div", { className: "dshdn-field" },
					e("label", null, nameLabel),
					e("input", { className: "dshdn-input", type: "text", placeholder: t("targetNamePlaceholder"), value: label, onChange: (ev) => setLabel(ev.target.value), onBlur: () => commitField({ label }) })
				),
				e("div", { className: "dshdn-field" },
					e("label", null, serverLabel),
					e("input", { className: "dshdn-input", type: "text", placeholder: "https://example.com/push", value: server, onChange: (ev) => setServer(ev.target.value), onBlur: () => commitField({ server }) })
				),
				e("div", { className: "dshdn-field" },
					e("label", null, tokenLabel),
					e("input", { className: "dshdn-input", type: "password", placeholder: tokenPlaceholder, value: token, onChange: (ev) => setToken(ev.target.value), onBlur: () => commitField({ token }) })
				),
				e("div", { className: "dshdn-field" },
					e("label", null, iconLabel),
					e("div", { className: "dshdn-input-row" },
						e("input", { className: "dshdn-input", type: "text", placeholder: iconPlaceholder, value: icon, onChange: (ev) => setIcon(ev.target.value), onBlur: () => commitField({ icon }) }),
						e("button", { className: "dshdn-reset", type: "button", onClick: resetIcon }, resetLabel)
					)
				)
			);
		}

		/**
		 * HTTP call section: a master switch plus a fan-out list of device
		 * targets. Every enabled device with a server URL receives the done
		 * event, so you can push to many phones/PCs at once.
		 */
		function HttpPushPanel(_ref3) {
			const locale = _ref3.locale;
			const initial = _ref3.initialPush || { enabled: false, icon: DEFAULT_ICON_URL, targets: [] };

			const snapshot = useLocaleSnapshot(locale);
			const activeLocale = snapshot && snapshot.active;
			const t = bindT(locale);

			const enabledState = react.useState(initial.enabled === true);
			const [enabled, setEnabled] = enabledState;
			const targetsState = react.useState(
				Array.isArray(initial.targets) && initial.targets.length ? initial.targets : [emptyTarget(1)]
			);
			const [targets, setTargets] = targetsState;
			const [busy, setBusy] = react.useState(false);

			// Persist the whole push object so the server stays the source of
			// truth (ids/icons get normalized and echoed back).
			const save = (nextEnabled, nextTargets, rollback) => {
				if (busy) return;
				setBusy(true);
				fetch(CONFIG_SAVE_ENDPOINT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ push: { enabled: nextEnabled, icon: initial.icon || DEFAULT_ICON_URL, targets: nextTargets } })
				})
					.then((res) => res.json())
					.then((body) => {
						if (body && body.ok && body.config && body.config.push) {
							const p = body.config.push;
							setEnabled(p.enabled === true);
							setTargets(Array.isArray(p.targets) && p.targets.length ? p.targets : [emptyTarget(1)]);
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
				save(next, targets, () => setEnabled(!next));
			};

			const commitTarget = (nextTarget) => {
				const next = targets.map((t) => (t.id === nextTarget.id ? nextTarget : t));
				setTargets(next);
				save(enabled, next);
			};

			const removeTarget = (id) => {
				const next = targets.filter((t) => t.id !== id);
				setTargets(next);
				save(enabled, next);
			};

			const addTarget = () => {
				const next = targets.concat([emptyTarget(targets.length + 1)]);
				setTargets(next);
				save(enabled, next);
			};

			const pushTitle = t("pushTitle");
			const pushDesc = t("pushDesc");
			const addLabel = t("addTarget");

			return e("div", { className: "dshdn-sub" },
				e("div", { className: "dshdn-sub-row" },
					e("div", { className: "dshdn-text" },
						e("div", { className: "dshdn-sub-title" }, pushTitle),
						e("div", { className: "dshdn-sub-desc" }, pushDesc)
					),
					e(SwitchButton, { on: enabled, disabled: busy, onClick: toggle })
				),
				enabled ? targets.map((tgt, i) =>
					e(PushTargetCard, {
						key: tgt.id || "new" + i,
						locale,
						t,
						target: tgt,
						index: i,
						busy,
						onCommit: commitTarget,
						onRemove: () => removeTarget(tgt.id)
					})
				) : null,
				enabled ? e("button", { className: "dshdn-add", type: "button", disabled: busy, onClick: addTarget }, "+ " + addLabel) : null
			);
		}

		/** The preference row this plugin owns: master on/off for done notifications. */
		function NotifyRow(_ref4) {
			const locale = _ref4.locale;
			const [phase, setPhase] = react.useState("loading"); // loading | ready | error
			const [enabled, setEnabled] = react.useState(true);
			const pushConfigState = react.useState({ enabled: false, icon: DEFAULT_ICON_URL, targets: [] });
			const [pushConfig, setPushConfig] = pushConfigState;
			const [busy, setBusy] = react.useState(false);
			const versionInfoState = react.useState({ version: "", minVersion: "", upgradeRequired: false });
			const [versionInfo, setVersionInfo] = versionInfoState;

			const snapshot = useLocaleSnapshot(locale);
			const activeLocale = snapshot && snapshot.active;
			const t = bindT(locale);
			const title = t("title");
			const desc = t("desc");

			react.useEffect(() => {
				let alive = true;
				fetch(CONFIG_ENDPOINT)
					.then((res) => res.json())
					.then((body) => {
						if (!alive) return;
						if (body && body.ok && body.config) {
							const c = body.config;
							setEnabled(c.enabled !== false);
							const p = (c.push && typeof c.push === "object") ? c.push : { enabled: false, icon: DEFAULT_ICON_URL, targets: [] };
							setPushConfig({
								enabled: p.enabled === true,
								icon: p.icon || DEFAULT_ICON_URL,
								targets: Array.isArray(p.targets) ? p.targets : []
							});
							setVersionInfo({
								version: typeof body.version === "string" ? body.version : "",
								minVersion: typeof body.minVersion === "string" ? body.minVersion : "",
								upgradeRequired: body.upgradeRequired === true
							});
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
						e("div", { className: "dshdn-title" },
							title,
							(phase === "ready" && versionInfo.version) ? e("span", { className: "dshdn-chip" }, "v" + versionInfo.version) : null
						),
						e("div", { className: "dshdn-desc" }, desc)
					),
					e(SwitchButton, {
						on: phase === "loading" ? false : enabled,
						disabled: phase !== "ready" || busy,
						onClick: toggle
					})
				),
				(phase === "ready" && versionInfo.upgradeRequired) ? e("div", { className: "dshdn-upgrade" },
					t("upgradeA"), "v" + (versionInfo.version || "?"),
					t("upgradeB"), "v" + (versionInfo.minVersion || "?"),
					t("upgradeC"),
					e("code", null, "dsh plugin --profile web add dsh-desktop-notify")
				) : null,
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
			locale && locale.register && locale.register(LOCALE_NS, {
				zh: {
					title: "桌面完成通知",
					desc: "AI 完成一轮回复后弹出系统桌面通知（子代理不提醒）",
					pushTitle: "HTTP 调用",
					pushDesc: "通过任意 HTTP 接口把完成通知推送到多台设备",
					targetName: "设备名称",
					targetNamePlaceholder: "例如：我的手机",
					targetDefault: "设备",
					serverLabel: "服务器地址",
					tokenLabel: "访问令牌",
					tokenPlaceholder: "可留空",
					iconLabel: "图标地址",
					iconPlaceholder: "https://…",
					resetLabel: "恢复默认",
					remove: "删除",
					addTarget: "添加设备",
					upgradeA: "当前版本 ",
					upgradeB: " 低于最低要求 ",
					upgradeC: "，请重新安装升级到最新版："
				},
				en: {
					title: "Desktop Notification on Done",
					desc: "Show a system notification when AI finishes a reply (subagents stay silent)",
					pushTitle: "HTTP Call",
					pushDesc: "Push the done notification to any number of devices via HTTP endpoints you configure",
					targetName: "Device name",
					targetNamePlaceholder: "e.g. my phone",
					targetDefault: "Device",
					serverLabel: "Server URL",
					tokenLabel: "Access Token",
					tokenPlaceholder: "optional",
					iconLabel: "Icon URL",
					iconPlaceholder: "https://…",
					resetLabel: "Reset to default",
					remove: "Remove",
					addTarget: "Add device",
					upgradeA: "Current version ",
					upgradeB: " is below the required ",
					upgradeC: "; reinstall to upgrade to the latest:"
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
