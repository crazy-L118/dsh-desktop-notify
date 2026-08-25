/**
 * Zero-dependency desktop notification senders for dsh-desktop-notify.
 *
 * One native strategy per OS, tried in order with a graceful fallback chain:
 * - Windows: WinRT toast via Windows PowerShell 5.1 (always present on
 *   Win10/11); falls back to a NotifyIcon balloon tip in the same process.
 * - macOS:   `osascript` (AppleScript user notification).
 * - Linux:   `notify-send` (freedesktop.org notifications), when installed.
 *
 * Every sender is fire-and-forget from the caller's perspective: failures are
 * reported through the returned result object, never thrown — a notification
 * must never break the agent loop.
 */
import { spawn } from "node:child_process";

/** Hard ceiling for one notifier child process; killed and reported on expiry. */
const SPAWN_TIMEOUT_MS = 15_000;

/** Maximum characters kept for the toast body; longer replies get an ellipsis. */
const MAX_BODY_CHARS = 180;

/** Collapse whitespace so multi-paragraph replies fit one or two toast lines. */
function condense(text) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= MAX_BODY_CHARS) return flat;
  return `${flat.slice(0, MAX_BODY_CHARS - 1).trimEnd()}…`;
}

/** Escape a value for embedding inside a single-quoted AppleScript string. */
function appleScriptEscape(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Escape a value for embedding inside a double-quoted PowerShell string. */
function powershellEscape(value) {
  return String(value ?? "").replace(/`/g, "``").replace(/\$/g, "`$").replace(/"/g, '`"');
}

/**
 * Run one short-lived child process and capture its outcome.
 *
 * All stdio is ignored on purpose: notifier output carries no actionable
 * signal, and fully detached children stay portable across hardened runtimes
 * where capturing child output is restricted.
 * @returns {Promise<{ok: boolean, detail?: string}>}
 */
function runOnce(command, args, spawnOptions = {}) {
  return new Promise((resolveOutcome) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveOutcome(outcome);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ ok: false, detail: `timeout after ${SPAWN_TIMEOUT_MS}ms` });
    }, SPAWN_TIMEOUT_MS);

    let child;
    try {
      child = spawn(command, args, { stdio: "ignore", windowsHide: true, ...spawnOptions });
    } catch (error) {
      finish({ ok: false, detail: String(error?.message ?? error) });
      return;
    }
    child.on("error", (error) => finish({ ok: false, detail: String(error?.message ?? error) }));
    child.on("exit", (code) => {
      if (code === 0) finish({ ok: true });
      else finish({ ok: false, detail: `${command} exited with code ${code}` });
    });
  });
}

/**
 * Windows strategy. A single PowerShell script tries the modern WinRT toast
 * first and falls back to a Forms balloon tip when WinRT is unavailable
 * (e.g. group policy or stripped-down SKUs).
 */
async function sendWindowsNotification(title, body, sound) {
  const appId = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";
  const t = powershellEscape(title);
  const b = powershellEscape(body);
  const a = powershellEscape(appId);
  // WinRT audio element: default system sound, or an explicitly silent toast.
  const audioTag = sound
    ? '<audio src="ms-winsoundevent:Notification.Default"/>'
    : '<audio silent="true"/>';
  const script = `
$ErrorActionPreference = 'Stop'
$t = "${t}"
$b = "${b}"
$a = "${a}"
$sent = $false
try {
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $audio = '${audioTag}'
  $xmlText = '<toast><visual><binding template="ToastGeneric"><text>' + [System.Security.SecurityElement]::Escape($t) + '</text><text>' + [System.Security.SecurityElement]::Escape($b) + '</text></binding></visual>' + $audio + '</toast>'
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml($xmlText)
  $toast = New-Object Windows.UI.Notifications.ToastNotification($doc)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($a).Show($toast)
  $sent = $true
} catch {
  $sent = $false
}
if (-not $sent) {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $icon = New-Object System.Windows.Forms.NotifyIcon
  $icon.Icon = [System.Drawing.SystemIcons]::Information
  $icon.Visible = $true
  $icon.ShowBalloonTip(8000, $t, $b, [System.Windows.Forms.ToolTipIcon]::Info)
  Start-Sleep -Seconds 9
  $icon.Dispose()
}
`;
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script];
  return runOnce("powershell.exe", args);
}

/** macOS strategy: AppleScript user notification. */
async function sendMacNotification(title, body, sound) {
  const soundPart = sound ? ' sound name "Glass"' : "";
  const script = `display notification "${appleScriptEscape(body)}" with title "${appleScriptEscape(title)}"${soundPart}`;
  return runOnce("osascript", ["-e", script]);
}

/** Linux/BSD strategy: notify-send when present; ENOENT is reported quietly. */
async function sendLinuxNotification(title, body) {
  return runOnce("notify-send", ["-a", "dsh", title, body]);
}

/**
 * Send one desktop notification with the best strategy for this OS.
 * Never throws.
 * @param {object} payload
 * @param {string} payload.title - Notification title line.
 * @param {string} payload.body - Notification body text (long input is condensed).
 * @param {boolean} [payload.sound] - Play the OS notification sound (default true).
 * @returns {Promise<{ok: boolean, strategy: string, detail?: string}>}
 */
export async function sendDesktopNotification(payload) {
  const title = String(payload?.title ?? "").trim() || "dsh";
  const body = condense(payload?.body);
  const sound = payload?.sound !== false;

  try {
    if (process.platform === "win32") {
      const result = await sendWindowsNotification(title, body || "（无文本回复）", sound);
      return { ...result, strategy: "windows-toast" };
    }
    if (process.platform === "darwin") {
      const result = await sendMacNotification(title, body || "(no text reply)", sound);
      return { ...result, strategy: "macos-notification" };
    }
    const result = await sendLinuxNotification(title, body || "(no text reply)");
    return { ...result, strategy: "linux-notify-send" };
  } catch (error) {
    return { ok: false, strategy: "none", detail: String(error?.message ?? error) };
  }
}
