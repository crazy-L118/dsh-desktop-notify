# dsh-desktop-notify

[English](./README_EN.md) | 简体中文

dsh 桌面通知插件：AI 完成回复时弹出系统桌面通知，切走干别的也能第一时间知道。

## 功能

- AI 回复完成时弹出系统原生通知，正文预览回复摘要
- 开关在 dsh 设置 → 通用 →「桌面完成通知」
- 子代理的后台任务完成不弹窗，只提醒主对话
- 零依赖，支持 Windows / macOS / Linux

## 安装

```bash
dsh plugin --profile web add dsh-desktop-notify
```

重启 `dsh web` 生效。

也可以从 GitHub 安装：

```bash
dsh plugin --profile web add github:crazy-L118/dsh-desktop-notify
```

## 使用

重启后打开 **dsh 设置 → 通用**，用「桌面完成通知」开关控制启停。

验证通知通道可运行自测：

```bash
node lib/index.js --self-test
```

## 配置（可选）

高级选项写入 `~/.dsh/desktop-notify.json`：

```json
{
  "enabled": true,
  "title": "dsh · 回复完成",
  "sound": true,
  "preview": true
}
```

## 许可证

MIT
