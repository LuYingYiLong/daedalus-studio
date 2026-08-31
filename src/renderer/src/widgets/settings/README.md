# Settings widget structure

Settings 页面按用户能理解的产品域组织，页面入口由 `app/shell/SettingsWindow.tsx` 统一组装：

- `pages/models`：Provider、默认模型和 Provider 请求编辑器
- `pages/studio`：通用、外观、快捷键、搜索、统计和个性化
- `pages/extensions`：MCP、Skills、Hooks 和 Plugins
- `pages/workspace`：浏览器、远程访问、电脑操作、开发环境、Worktree 和 Godot
- `pages/resources`：关于、文档、导入和归档会话
- `components`：Settings 内复用的样式/视图基础件
- `registry`：设置菜单和搜索目录

页面只负责渲染和用户交互。RPC、持久化和订阅逻辑放在 `features`，纯模型/表单规则放在 `domain`，不要在根目录重新堆放页面文件。
