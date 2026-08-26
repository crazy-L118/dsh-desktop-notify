# dsh-desktop-notify

English | [简体中文](./README.md)

Desktop notification plugin for dsh: get a native OS notification the moment the AI finishes its reply, so you can safely switch away.

## Features

- Native desktop notification when a reply completes, with a preview of the reply text
- Toggle in dsh Settings → General → **Desktop Notification on Done** (follows current UI language)
- Subagent background tasks stay silent — only the main conversation notifies

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
