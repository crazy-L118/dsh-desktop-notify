# dsh-desktop-notify

English | [简体中文](./README.md)

Desktop notification plugin for dsh: get a native OS notification the moment the AI finishes its reply, so you can safely switch away.

## Features

- Native desktop notification when a reply completes, with a preview of the reply text
- Toggle lives in dsh Settings → General → "桌面完成通知"
- Subagent background tasks stay silent — only the main conversation notifies
- Zero dependencies; works on Windows / macOS / Linux

## Install

```bash
dsh plugin --profile web add dsh-desktop-notify
```

Restart `dsh web` to activate.

Or install from GitHub:

```bash
dsh plugin --profile web add github:crazy-L118/dsh-desktop-notify
```

## Usage

After restarting, open **dsh Settings → General** and use the "桌面完成通知" toggle.

To verify the notification channel:

```bash
node lib/index.js --self-test
```

## Configuration (optional)

Advanced options in `~/.dsh/desktop-notify.json`:

```json
{
  "enabled": true,
  "title": "dsh · 回复完成",
  "sound": true,
  "preview": true
}
```

## License

MIT
