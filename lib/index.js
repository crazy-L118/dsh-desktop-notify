/**
 * dsh-desktop-notify: a DeepSeek Harness (dsh) bundle that fires a native
 * desktop notification whenever a main conversation turn completes.
 *
 * How it works: dsh's agent loop publishes `agent/status` on every lifecycle
 * transition. When the status enters `idle`, the agent has no driver left
 * scheduled or active — i.e. the reply the user is waiting for is done.
 * Subagents (delegated children) are filtered out so only top-level
 * conversations notify. The last assistant message is read from the session's
 * durable event log to preview the reply in the toast body.
 *
 * This module is also directly runnable for a self test:
 *
 *     node lib/index.js --self-test
 */
import { pathToFileURL } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { sendDesktopNotification } from "./notify.js";

/** Plugin id; must match the cordis.patch.yml insert id. */
const name = "desktop-notify";

/** Services required before this plugin can mount: loopback config routes. */
const inject = ["webServer"];

/** Same-origin endpoints the General-settings row (client half) talks to. */
const CONFIG_ENDPOINT = "/desktop-notify-config";
const CONFIG_SAVE_ENDPOINT = "/desktop-notify-config-save";

/** Optional per-machine settings file; every field may be omitted. */
const SETTINGS_PATH = resolve(homedir(), ".dsh", "desktop-notify.json");

/** Per-locale copy for the toast title and the fallback body (no reply text). */
const LOCALE_COPY = Object.freeze({
	zh: Object.freeze({ title: "dsh · 回复完成", fallbackBody: "回复已完成" }),
	en: Object.freeze({ title: "dsh · Done", fallbackBody: "Reply completed" })
});

const DEFAULT_SETTINGS = Object.freeze({
	/** Set false to silence notifications without uninstalling. */
	enabled: true,
	/** Play the OS notification sound. */
	sound: true,
	/** Preview the last assistant reply in the toast body. */
	preview: true
});

/** Cached settings snapshot; read at most once per process. */
let settingsCache;

/** Reference to the dsh settings service, captured when available. */
let settingsServiceRef;

/** Load ~/.dsh/desktop-notify.json when present; invalid files fall back to defaults quietly. */
async function loadSettings() {
	if (settingsCache) return settingsCache;
	let merged = { ...DEFAULT_SETTINGS };
	try {
		const raw = await readFile(SETTINGS_PATH, "utf8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") {
			merged = {
				enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : merged.enabled,
				sound: typeof parsed.sound === "boolean" ? parsed.sound : merged.sound,
				preview: typeof parsed.preview === "boolean" ? parsed.preview : merged.preview
			};
		}
	} catch {
		// Missing file is the normal path; malformed file silently keeps defaults.
	}
	settingsCache = merged;
	return merged;
}

/** Persist a partial settings patch (JSON-merge) and refresh the process cache. */
async function saveSettings(patch) {
	const current = await loadSettings();
	const next = {
		enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
		sound: typeof patch.sound === "boolean" ? patch.sound : current.sound,
		preview: typeof patch.preview === "boolean" ? patch.preview : current.preview
	};
	await mkdir(resolve(SETTINGS_PATH, ".."), { recursive: true });
	await writeFile(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
	settingsCache = next;
	return next;
}

/** Read the active dsh locale preference ("zh" | "en" | undefined). */
function getLocalePreference() {
	try {
		return settingsServiceRef?.get("locale")?.preference;
	} catch {
		return undefined;
	}
}

/** Pick zh or en copy based on the active dsh locale (defaults to en when unknown). */
function localize(key) {
	const preference = getLocalePreference();
	const locale = preference?.startsWith("zh") ? "zh" : "en";
	return LOCALE_COPY[locale][key];
}

/** Whether this agent is a delegated child (subagent/fork), which must stay quiet. */
function isDelegatedAgent(agent) {
	try {
		const header = agent?.session?.header;
		if (!header) return false;
		if (header.origin === "subagent") return true;
		return typeof header.delegationDepth === "number" && header.delegationDepth > 0;
	} catch {
		return false;
	}
}

/**
 * Read the newest assistant text reply from the session's append-only log.
 * Returns "" when the turn produced no visible text (tool-only, empty, error).
 */
function extractLastAssistantText(session) {
	try {
		const events = session?.events;
		if (!Array.isArray(events)) return "";
		for (let index = events.length - 1; index >= 0; index -= 1) {
			const event = events[index];
			if (event?.type !== "assistant/message") continue;
			const blocks = event?.data?.message?.content;
			if (!Array.isArray(blocks)) continue;
			return blocks
				.filter((block) => block?.type === "text" && typeof block.text === "string")
				.map((block) => block.text)
				.join("\n")
				.trim();
		}
	} catch {
		// Reading the transcript must never break the notification path.
	}
	return "";
}

/** Fire one contained notification; all failures are logged, never rethrown. */
async function notifyTurnDone(ctx, agent) {
	const settings = await loadSettings();
	if (!settings.enabled) return;

	const previewText = settings.preview ? extractLastAssistantText(agent?.session) : "";
	const result = await sendDesktopNotification({
		title: localize("title"),
		sound: settings.sound,
		body: previewText || localize("fallbackBody")
	});
	if (!result.ok) {
		try {
			ctx?.logger?.("desktop-notify")?.warn?.(`notification not delivered (${result.strategy}): ${result.detail ?? "unknown reason"}`);
		} catch {
			// Logging is best-effort only.
		}
	}
}

/** Read one request body as UTF-8 text (small payloads only). */
function readBody(req) {
	return new Promise((resolveBody, rejectBody) => {
		const chunks = [];
		req.on("data", (chunk) => {
			chunks.push(chunk);
			if (chunks.reduce((sum, c) => sum + c.length, 0) > 64 * 1024) {
				rejectBody(new Error("request body too large"));
				req.destroy();
			}
		});
		req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
		req.on("error", rejectBody);
	});
}

/** Cordis plugin entry: observe agent lifecycle transitions + serve the settings row. */
function apply(ctx) {
	// Optionally wire into dsh's user settings so notification copy follows the Language setting.
	ctx.inject(["settings"], (sctx) => {
		settingsServiceRef = sctx.settings;
	});

	ctx.effect(() => {
		const dispose = ctx.on("agent/status", (payload) => {
			// Only the moment work fully settles is "done": no driver scheduled or active.
			if (payload?.status !== "idle") return;
			// Delegated subagents finish constantly mid-turn; never surface them.
			if (isDelegatedAgent(payload.agent)) return;
			void notifyTurnDone(ctx, payload.agent).catch(() => {});
		});
		return dispose;
	}, "desktop-notify: main-agent idle listener");

	/** GET: current notification preferences for the General-settings row. */
	ctx.effect(() => {
		const dispose = ctx.webServer.register({
			kind: "prefix",
			path: CONFIG_ENDPOINT,
			handler: async (req, res) => {
				const url = new URL(req.url ?? "/", "http://x");
				if (req.method !== "GET" || url.pathname !== CONFIG_ENDPOINT) {
					res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: false, error: "not found" }));
					return;
				}
				try {
					const config = await loadSettings();
					res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: true, config }));
				} catch (error) {
					res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
				}
			}
		});
		return dispose;
	}, "desktop-notify: config read route");

	/** POST: merge a partial patch into the persisted preferences. */
	ctx.effect(() => {
		const dispose = ctx.webServer.register({
			kind: "prefix",
			path: CONFIG_SAVE_ENDPOINT,
			handler: async (req, res) => {
				const url = new URL(req.url ?? "/", "http://x");
				if (req.method !== "POST" || url.pathname !== CONFIG_SAVE_ENDPOINT) {
					res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: false, error: "not found" }));
					return;
				}
				try {
					const patch = JSON.parse((await readBody(req)) || "{}");
					const config = await saveSettings(patch);
					res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: true, config }));
				} catch (error) {
					res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
				}
			}
		});
		return dispose;
	}, "desktop-notify: config write route");
}

export { name, inject, apply };

/** Standalone smoke test: fire one demo toast and exit (run: node lib/index.js --self-test). */
async function selfTest() {
	const systemLocale = (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().locale : process.env.LANG) || "en";
	const isZh = systemLocale.startsWith("zh");
	console.log("[dsh-desktop-notify] sending a demo desktop notification…");
	const result = await sendDesktopNotification({
		title: isZh ? "dsh · 回复完成（自测）" : "dsh · Done (self-test)",
		sound: true,
		body: isZh ? "如果你看到了这条通知，插件工作正常 🎉" : "If you see this toast, the plugin is working 🎉"
	});
	if (result.ok) {
		console.log(`[dsh-desktop-notify] delivered via ${result.strategy}.`);
	} else {
		console.error(`[dsh-desktop-notify] delivery FAILED via ${result.strategy}: ${result.detail ?? "unknown reason"}`);
		process.exitCode = 1;
	}
}

const invokedDirectly = (() => {
	try {
		if (process.argv.includes("--self-test")) return true;
		const entry = resolve(process.argv[1] ?? "");
		return entry !== "" && import.meta.url === pathToFileURL(entry).href;
	} catch {
		return false;
	}
})();

if (invokedDirectly) {
	await selfTest();
}
