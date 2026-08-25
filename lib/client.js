window.__ModuleLoader__.load({
	id: "dsh-desktop-notify",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");

		/** Same-origin config endpoints exposed by the host half. */
		const CONFIG_ENDPOINT = "/desktop-notify-config";
		const CONFIG_SAVE_ENDPOINT = "/desktop-notify-config-save";

		/**
		 * Row styles. Inline-injected once per page like every dsh plugin bundle;
		 * colors reuse the host's --dsw-* design tokens so the switch follows the
		 * active theme (light/dark) automatically.
		 */
		const CSS_TAG = "dsh-desktop-notify/row.css";
		const css = [
			".dshdn-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}",
			".dshdn-text{display:flex;flex-direction:column;gap:4px;min-width:0}",
			".dshdn-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary)}",
			".dshdn-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
			".dshdn-switch{position:relative;width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-label-dimmed);border:none;padding:0;cursor:pointer;transition:background .2s;flex-shrink:0}",
			".dshdn-switch[data-on='true']{background:var(--dsw-alias-brand-primary)}",
			".dshdn-switch[data-on='false']{background:var(--dsw-alias-label-dimmed)}",
			".dshdn-switch:disabled{opacity:.45;cursor:default}",
			".dshdn-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .2s}",
			".dshdn-switch[data-on='true'] .dshdn-knob{left:18px}"
		].join("\n");
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_TAG}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-desktop-notify";
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		/** The one preference this plugin owns: master on/off for done-toasts. */
		function NotifyRow() {
			const [phase, setPhase] = react.useState("loading"); // loading | ready | error
			const [enabled, setEnabled] = react.useState(true);
			const [busy, setBusy] = react.useState(false);

			react.useEffect(() => {
				let alive = true;
				fetch(CONFIG_ENDPOINT)
					.then((res) => res.json())
					.then((body) => {
						if (!alive) return;
						if (body?.ok && body.config) {
							setEnabled(body.config.enabled !== false);
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
						if (body?.ok && body.config) setEnabled(body.config.enabled !== false);
						else setEnabled(!next); // roll back on failure
					})
					.catch(() => setEnabled(!next))
					.finally(() => setBusy(false));
			};

			return react_jsx_runtime.jsxs("div", {
				className: "dshdn-row",
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "dshdn-text",
						children: [
							react_jsx_runtime.jsx("div", { className: "dshdn-title", children: "桌面完成通知" }),
							react_jsx_runtime.jsx("div", { className: "dshdn-desc", children: "AI 完成一轮回复后弹出系统桌面通知（子代理不提醒）" })
						]
					}),
					react_jsx_runtime.jsx("button", {
						type: "button",
						className: "dshdn-switch",
						role: "switch",
						"aria-checked": phase === "ready" ? String(enabled) : undefined,
						"data-on": phase === "loading" ? "false" : String(enabled),
						disabled: phase !== "ready" || busy,
						onClick: toggle,
						children: react_jsx_runtime.jsx("span", { className: "dshdn-knob" })
					})
				]
			});
		}

		/** Client services: only the slots registry is needed. */
		const inject = ["slots"];

		/**
		 * Client plugin body: register the preference row into the General
		 * section's item slot — the same additive seat used by Appearance,
		 * Language, and Composer Enter.
		 * @param ctx - client cordis context.
		 */
		function apply(ctx) {
			ctx.slots.inject("settings.general.item", () =>
				ctx.slots.register(
					{
						name: "settings.general.item",
						id: "desktop-notify",
						order: 40
					},
					NotifyRow
				)
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
