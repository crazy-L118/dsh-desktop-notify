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
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { sendDesktopNotification } from "./notify.js";

/** Plugin id; must match the cordis.patch.yml insert id. */
const name = "desktop-notify";

/** Services required before this plugin can mount: web routes + user settings.
 *  The workspace label is resolved by reading the durable workspace registry
 *  file from disk directly, because the `workspace` service is NOT part of the
 *  web profile bundles (declaring it in `inject` would stall dsh startup). */
const inject = ["webServer", "settings"];

/** Same-origin endpoints the General-settings row (client half) talks to. */
const CONFIG_ENDPOINT = "/desktop-notify-config";
const CONFIG_SAVE_ENDPOINT = "/desktop-notify-config-save";

/** Endpoint that serves the local copy of the official DeepSeek Harness favicon. */
const ICON_ENDPOINT = "/desktop-notify-icon";

/** Official DeepSeek Harness favicon (black whale) served from jsDelivr; used as the default push icon. */
const DEFAULT_ICON_URL = "https://cdn.jsdelivr.net/gh/deepseek-ai/deepseek-harness@main/apps/web/public/favicon.svg";

/** Local path to the bundled favicon (kept in sync with the default remote URL). */
const ICON_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "assets", "dsh-icon.svg");

/** Optional per-machine settings file; every field may be omitted. */
const SETTINGS_PATH = resolve(homedir(), ".dsh", "desktop-notify.json");

/** Per-locale copy for the toast title and the fallback body (no reply text). */
const LOCALE_COPY = Object.freeze({
	zh: Object.freeze({
		title: "dsh · 回复完成",
		fallbackBody: "回复已完成",
		workspaceLine: "工作区：{0}",
		sessionLine: "会话：{0}",
		workspaceUnspecified: "未指定"
	}),
	en: Object.freeze({
		title: "dsh · Done",
		fallbackBody: "Reply completed",
		workspaceLine: "Workspace: {0}",
		sessionLine: "Session: {0}",
		workspaceUnspecified: "unspecified"
	})
});

const DEFAULT_SETTINGS = Object.freeze({
	/** Set false to silence notifications without uninstalling. */
	enabled: true,
	/** Play the OS notification sound. */
	sound: true,
	/** Preview the last assistant reply in the toast body. */
	preview: true,
	/** Optional HTTP call that mirrors the done event to another device. */
	push: Object.freeze({ enabled: false, server: "", token: "", icon: DEFAULT_ICON_URL })
});

/** Hard ceiling for one HTTP push request; aborted and reported on expiry. */
const HTTP_TIMEOUT_MS = 10_000;

/** Cached settings snapshot; read at most once per process. */
let settingsCache;

/** Cached workspace registry (sessionId → workspace title). Refreshed on miss. */
let workspaceCache = { at: 0, map: null };

/** Path to the durable workspace registry dsh persists on disk. */
const WORKSPACE_REGISTRY_PATH = resolve(homedir(), ".dsh", "storages", "workspace.json");

/**
 * Build a sessionId → workspace title map from the durable registry file.
 * Returns a Map; falls back to an empty map when the file is missing/invalid.
 * The result is cached for a short TTL so we don't hit disk on every toast.
 */
function loadWorkspaceTitleMap() {
	const now = Date.now();
	if (workspaceCache.map && now - workspaceCache.at < 30_000) {
		return workspaceCache.map;
	}
	let map = new Map();
	try {
		if (existsSync(WORKSPACE_REGISTRY_PATH)) {
			const raw = readFileSync(WORKSPACE_REGISTRY_PATH, "utf8");
			const parsed = JSON.parse(raw);
			const workspaces = parsed?.tables?.workspaces;
			if (workspaces && typeof workspaces === "object") {
				for (const id of Object.keys(workspaces)) {
					const record = workspaces[id];
					const title = typeof record?.title === "string" ? record.title.trim() : "";
					const sessionIds = Array.isArray(record?.sessionIds) ? record.sessionIds : [];
					for (const sid of sessionIds) {
						map.set(sid, title);
					}
				}
			}
		}
	} catch {
		// A broken registry must never break the notification path; keep the map.
	}
	workspaceCache = { at: now, map };
	return map;
}

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
				preview: typeof parsed.preview === "boolean" ? parsed.preview : merged.preview,
				push: normalizePush(parsed.push)
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
		preview: typeof patch.preview === "boolean" ? patch.preview : current.preview,
		push: normalizePush(patch.push ? { ...current.push, ...patch.push } : current.push)
	};
	await mkdir(resolve(SETTINGS_PATH, ".."), { recursive: true });
	await writeFile(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
	settingsCache = next;
	return next;
}

/** Read the active dsh locale preference ("zh" | "en" | undefined). */
function getLocalePreference(ctx) {
	try {
		return ctx?.settings?.get?.("locale")?.preference;
	} catch {
		return undefined;
	}
}

/** Pick zh or en copy based on the active dsh locale (defaults to en when unknown). */
function localize(ctx, key, ...args) {
	try {
		const preference = getLocalePreference(ctx);
		const locale = preference?.startsWith("zh") ? "zh" : "en";
		let value = LOCALE_COPY[locale][key];
		if (typeof value !== "string") return "";
		for (let i = 0; i < args.length; i += 1) {
			value = value.replace(new RegExp(`\\{${i}\\}`, "g"), String(args[i]));
		}
		return value;
	} catch {
		return "";
	}
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

/**
 * Resolve a human-readable workspace label that matches the dsh sidebar.
 * Order of preference:
 *   1. The title of the workspace this session belongs to (looked up from the
 *      durable workspace registry file by sessionId). This mirrors what the
 *      sidebar renders and lets the user rename the workspace to any label.
 *   2. The basename of the session cwd when the session is ungrouped (not in
 *      any workspace) or the registry lookup finds nothing.
 *   3. A localized "unspecified" label when there is no cwd at all.
 */
function workspaceLabelOf(ctx, sessionId, cwd) {
	try {
		if (typeof sessionId === "string" && sessionId.length > 0) {
			const title = loadWorkspaceTitleMap().get(sessionId);
			if (typeof title === "string" && title.length > 0) return title;
		}
	} catch {
		// Workspace lookup must never break the notification path.
	}
	if (typeof cwd !== "string" || cwd.length === 0) return localize(ctx, "workspaceUnspecified");
	const trimmed = cwd.replace(/[/\\]+$/, "");
	const parts = trimmed.split(/[/\\]/);
	const last = parts[parts.length - 1];
	return (typeof last === "string" && last.length > 0) ? last : cwd;
}

/**
 * Walk the session event log backwards and return the most recently authored
 * session title (the same string the sidebar shows). Empty when none set.
 */
function extractSessionTitle(session) {
	try {
		const events = session?.events;
		if (!Array.isArray(events)) return "";
		for (let i = events.length - 1; i >= 0; i -= 1) {
			const ev = events[i];
			if (ev && ev.type === "session/title" && ev.data && typeof ev.data.title === "string" && ev.data.title.length > 0) {
				return ev.data.title;
			}
		}
	} catch {
		// Reading the transcript must never break the notification path.
	}
	return "";
}

/**
 * Coerce a raw `push` config blob into the canonical shape.
 * @param {unknown} raw
 * @returns {{ enabled: boolean, server: string, token: string, icon: string }}
 */
function normalizePush(raw) {
	const obj = (raw && typeof raw === "object") ? raw : {};
	return {
		enabled: typeof obj.enabled === "boolean" ? obj.enabled : false,
		server: typeof obj.server === "string" ? obj.server.trim() : "",
		token: typeof obj.token === "string" ? obj.token.trim() : "",
		icon: typeof obj.icon === "string" ? obj.icon.trim() : DEFAULT_ICON_URL
	};
}

/** Whether the push channel is live: enabled AND a server URL is present. */
function pushIsActive(settings) {
	const p = normalizePush((settings && settings.push) || undefined);
	return p.enabled && p.server.length > 0;
}

/**
 * POST the done event to an arbitrary HTTP endpoint supplied by the user.
 * The body is generic `{ title, body, token, icon }`; which concrete service backs
 * the endpoint is entirely the user's choice. Never throws.
 * @param {{ server: string, token: string, icon: string }} push
 * @param {{ title: string, body: string }} copy
 * @returns {Promise<{ ok: boolean, detail?: string }>}
 */
async function sendHttpPush(push, copy) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
	const payload = { title: copy.title, body: copy.body };
	if (push.token) payload.token = push.token; // omit the field when empty
	if (push.icon) payload.icon = push.icon;     // omit the field when empty
	try {
		const response = await fetch(push.server, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
			signal: controller.signal
		});
		let data = {};
		try {
			data = await response.json();
		} catch {
			// Some endpoints respond with empty/non-JSON bodies; that's fine.
		}
		if (response.ok && (data.code === undefined || data.code === 200)) {
			return { ok: true };
		}
		return { ok: false, detail: `HTTP ${response.status}${data.message ? `: ${data.message}` : ""}` };
	} catch (error) {
		return { ok: false, detail: String(error?.message ?? error) };
	} finally {
		clearTimeout(timer);
	}
}

/** Fire one contained notification; all failures are logged, never rethrown. */
async function notifyTurnDone(ctx, agent) {
	const settings = await loadSettings();
	if (!settings.enabled) return;

	const header = agent?.session?.header;
	const cwd = (header && typeof header.cwd === "string") ? header.cwd : "";
	const sessionId = (header && typeof header.id === "string") ? header.id : "";
	const workspaceName = workspaceLabelOf(ctx, sessionId, cwd);
	const sessionTitle = extractSessionTitle(agent?.session);
	const previewText = settings.preview ? extractLastAssistantText(agent?.session) : "";

	// Workspace + session ride along in the title so the user can tell at a
	// glance which conversation finished; the body keeps just the reply preview.
	const titleParts = [localize(ctx, "title")];
	if (workspaceName) titleParts.push(localize(ctx, "workspaceLine", workspaceName));
	if (sessionTitle) titleParts.push(localize(ctx, "sessionLine", sessionTitle));
	const titleText = titleParts.join(" · ");
	const body = previewText || localize(ctx, "fallbackBody");

	const result = await sendDesktopNotification({
		title: titleText,
		sound: settings.sound,
		body,
		icon: normalizePush(settings.push).icon
	});
	if (!result.ok) {
		try {
			ctx?.logger?.("desktop-notify")?.warn?.(`notification not delivered (${result.strategy}): ${result.detail ?? "unknown reason"}`);
		} catch {
			// Logging is best-effort only.
		}
	}

	// Independent HTTP channel (phone, etc.) — fire even if desktop failed.
	if (pushIsActive(settings)) {
		const pushResult = await sendHttpPush(normalizePush(settings.push), {
			title: titleText,
			body
		});
		if (!pushResult.ok) {
			try {
				ctx?.logger?.("desktop-notify")?.warn?.(`HTTP push not delivered: ${pushResult.detail ?? "unknown reason"}`);
			} catch {
				// Logging is best-effort only.
			}
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
	// `settings` is listed in `inject` so cordis binds it onto ctx; we read the
	// locale lazily inside notifyTurnDone. The workspace label is resolved from
	// the registry file (see workspaceLabelOf), not from any service.

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

	/** GET: serve the bundled DeepSeek Harness favicon (black whale) so the
	 *  desktop toast and the HTTP push payload can both reference an official icon. */
	ctx.effect(() => {
		const dispose = ctx.webServer.register({
			kind: "prefix",
			path: ICON_ENDPOINT,
			handler: async (req, res) => {
				const url = new URL(req.url ?? "/", "http://x");
				if (req.method !== "GET" || url.pathname !== ICON_ENDPOINT) {
					res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: false, error: "not found" }));
					return;
				}
				try {
					const data = await readFile(ICON_PATH);
					res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" });
					res.end(data);
				} catch (error) {
					res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
				}
			}
		});
		return dispose;
	}, "desktop-notify: icon route");
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

	// HTTP push smoke test (only if the user has configured a server URL).
	const settings = await loadSettings();
	if (pushIsActive(settings)) {
		console.log("[dsh-desktop-notify] sending a demo HTTP push…");
		const push = normalizePush(settings.push);
		const pushResult = await sendHttpPush(push, {
			title: isZh ? "dsh · 自测" : "dsh · self-test",
			body: isZh ? "如果你在其他设备上看到这条推送，HTTP 调用配置正常 🎉" : "If you see this on another device, the HTTP call is working 🎉"
		});
		if (pushResult.ok) {
			console.log("[dsh-desktop-notify] HTTP push delivered.");
		} else {
			console.error(`[dsh-desktop-notify] HTTP push FAILED: ${pushResult.detail ?? "unknown reason"}`);
			process.exitCode = 1;
		}
	} else {
		console.log("[dsh-desktop-notify] HTTP push not configured — skipping HTTP push smoke test.");
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
