# dsh-desktop-notify

English | [简体中文](./README.md)

Desktop notification plugin for dsh: get a native OS notification the moment the AI finishes its reply, so you can safely switch away.

## Features

- Native desktop notification when a reply completes, with a preview of the reply text
- Toggle in dsh Settings → General → **Desktop Notification on Done** (follows current UI language)
- Subagent background tasks stay silent — only the main conversation notifies

## Generic HTTP Push (HTTP Call)

Want an "AI is done" nudge on another device while you're away from the computer? Turn on the HTTP-call push:

1. Set up any service that accepts an HTTP POST (self-hosted or compatible) and grab its endpoint URL and an optional access token.
2. In dsh Settings → General → **Desktop Notification on Done**, turn it on; the **HTTP Call** row appears below it — flip that on.
3. Fill in the server URL and the access token.
4. When you step away, every completed reply POSTs a JSON `{ "title", "body", "token", "icon" }` to your endpoint.

> Desktop notification and HTTP call are two independent channels: enable either, or both.
> The access token is stored locally in `~/.dsh/desktop-notify.json` and is only sent to the server URL you provide.
> The **Icon URL** field defaults to the official DeepSeek Harness black-whale favicon (served via jsDelivr); leave it empty to omit the `icon` field entirely, set any image URL, or hit **Reset to default** to restore it.

## Screenshot

![Desktop Notification on Done settings](assets/settings-en.png)

## Install

```bash
dsh plugin --profile web add dsh-desktop-notify
```

Restart `dsh web` to activate.

## Uninstall

```bash
dsh plugin --profile web rm dsh-desktop-notify
```

## Contact

Questions or suggestions? Feel free to reach out:

- Email: crazy_l118@icloud.com

## Sponsor

If this plugin helped you, consider buying me a ham sausage for dinner 🌭

![WeChat reward QR](assets/sponsor.jpg)

## License

MIT
