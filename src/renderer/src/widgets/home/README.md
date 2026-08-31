# Home widget structure

- `HomePage.tsx`：页面级组装，不持有跨页面的 RPC runtime
- `surface/`：聊天 surface、首屏、定时任务切换、Composer、快捷键、ActionBar 和 Workbench 视图
- `dock/`：侧边/底部 Dock 视图和 Home 专用 Dock 配置
- `workspace/`：workspace tree/sidebar 展示
- `summary/`：Home 专用 session summary、plans、sources 和对话框视图

新增文件先按运行时职责归类；不要把 RPC 编排重新放回页面 JSX。

运行时控制器现在位于 `features/home`、`features/browser`、`features/trajectory`；纯布局、Dock 数据和会话首页规则位于 `domain`。跨 Home、Remote 或 Dock 复用的视图放在 `widgets/session-home`、`widgets/trajectory` 等中性目录。`widgets/home` 只保留 Home 专属视图。
