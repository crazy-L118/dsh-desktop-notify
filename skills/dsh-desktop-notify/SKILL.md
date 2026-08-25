---
name: dsh-desktop-notify
description: 安装、卸载或检查 dsh 的桌面通知插件（dsh-desktop-notify）。用户提到「完成通知」「桌面通知」「弹窗提醒」「装通知插件」等时使用本技能。
---

# dsh-desktop-notify 安装技能

在用户的 dsh（DeepSeek Harness）中安装 / 卸载 / 检查「对话完成桌面通知」插件。

## 背景

- 包名：`dsh-desktop-notify`（GitHub 开源）
- 作用：当主会话一轮回复真正落定（agent/status → idle）时弹出系统原生桌面通知，正文预览最新一条回复；子代理完成不通知。
- 机制：与所有 dsh bundle 相同——`dsh plugin --profile web add <包>` 在 pnpm 安装成功后自动把声明了 `dsh.bundle` 的包注册进 `dsh.profile.bundles`。

## 安装步骤

1. **检查前置**：确认 `dsh --version` 与 `pnpm --version` 可用。
2. **安装**（按优先级尝试）：
   ```bash
   dsh plugin --profile web add dsh-desktop-notify              # npm（发布后）
   dsh plugin --profile web add github:crazy-L118/dsh-desktop-notify # GitHub 直装，需要 git
   dsh plugin --profile web add file:/本地/源码/目录             # 本地源码
   ```
3. **验证注册**：读取 `~/.dsh/profiles/web/package.json`，确认：
   - `dependencies` 中有 `dsh-desktop-notify`
   - `dsh.profile.bundles` 数组包含 `dsh-desktop-notify`
   - 若 bundles 缺失，用编辑工具把包名追加进 `dsh.profile.bundles`。
4. **通道自测**：在包目录运行 `node lib/index.js --self-test`，确认系统通知可弹出。
5. **提示用户**：重启 `dsh web` 后生效；Windows 需允许 PowerShell 通知、macOS 需允许「脚本编辑器」通知。

## 配置

- **总开关**：dsh 设置 → 通用 → 「桌面完成通知」行内开关（插件向 `settings.general.item` 槽注册的原生偏好行）。
- 高级选项：`~/.dsh/desktop-notify.json`（均可省略）：
  `{ "enabled": true, "title": "dsh · 回复完成", "sound": true, "preview": true }`

## 卸载

```bash
dsh plugin --profile web rm dsh-desktop-notify
```

若残留，从 `~/.dsh/profiles/web/package.json` 的 `dependencies` 与 `dsh.profile.bundles` 中删除同名条目。

## 注意

- 安装后必须重启 `dsh web` 才生效；不要替用户重启 dsh 服务。
- 插件零 npm 依赖；自测失败先查系统通知权限，再查 `notify-send` 是否安装（Linux）。
