# Cai Header Bar (SillyTavern / TauriTavern Extension)

为 SillyTavern / TauriTavern（iOS）提供 1:1 仿 Character.AI 风格的顶栏与底部输入体验：

- **仿 c.ai 顶栏（原位切换、零遮挡）**：
  - 左侧 `<` / 中间 `[头像] 角色名`：实时显示当前角色或群聊，点击打开角色面板。
  - 右侧 `⋯`：原位隐藏标题栏并露出 ST 原生 9 图标顶栏与抽屉，关闭抽屉或点回聊天区自动切回 c.ai 标题栏。
  - 内置快捷命令 `/cai-header` 可随时开关。
- **底部左侧图标二合一（`+`）**：将 `☰ 聊天选项` 与 `🪄 扩展菜单` 合并为发送栏外侧的单个 `+` 图标，点击弹出紧凑二选一小菜单，且不影响原生菜单定位。
- **动态 c.ai 输入框占位文案**：支持在扩展设置中切换英文原版 `Message {{char}}...`、中文原版 `给 {{char}} 发消息` 或完全隐藏，切卡自动同步角色名。

## 安装 / 更新方式（通过 GitHub）
1. 将本目录（`manifest.json`、`index.js`、`style.css`、`README.md`）推送到你的公开 GitHub 仓库。
2. 在 TauriTavern 中打开 **扩展（Extensions）→ 安装扩展 / 更新扩展**。
3. 可在 **扩展 → Cai Header Bar** 中自由开关各项功能与切换占位文案语言。
