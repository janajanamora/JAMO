# Cai Header Bar (SillyTavern / TauriTavern Extension) v1.4.1

为 SillyTavern / TauriTavern（iOS）提供仿 Character.AI 的顶栏与底部输入体验，配合 `Cai-Inspired Mod (iOS Polished)` 主题使用效果最好。

- **c.ai 顶栏**：`<` 打开角色列表；中间 `[头像] 角色名` 打开当前角色卡（群聊同理）；`⋯` 露出 ST 原生图标栏。
  - 打开任何抽屉时顶栏自动让位，抽屉关闭后自动切回（切换抽屉时不会闪）。
  - 原位挂在 `#top-settings-holder` 内，从不修改 `top` / 安全区，TauriTavern iOS 下不会钻进状态栏。
  - 高度可在 `style.css` 顶部的 `--cai-header-h` / `--cai-header-avatar` 调。
- **底部 `+`**：把 ☰ 聊天选项 与 🪄 扩展菜单 合成一个按钮，弹出二选一小菜单。
- **占位文案**：`Message {{char}}...` / `给 {{char}} 发消息` / 隐藏。断开 API 时保留 ST 原本的 “Not connected” 提示；关闭扩展会还原原文案。
- **本地字体（无外链）**：c.ai 同款 Open Sans / Lion 原版 Fira Sans / 跟随主题，扩展设置里切换。字体文件在 `fonts/`，SIL OFL 授权。
- 快捷命令 `/cai-header` 开关整个扩展（万一顶栏出问题也能救回来）。

## 安装 / 更新（GitHub）
1. 把本目录全部内容（含 `fonts/`）推到你的公开 GitHub 仓库。
2. TauriTavern → 扩展 → 安装扩展 / 更新。
3. 扩展 → Cai Header Bar 里调开关、占位文案、字体。
