# Home widget structure

- `HomePage.tsx`：页面级组装、workspace 与 session runtime 的连接
- `surface/`：聊天 surface、首屏、定时任务切换、Composer、浏览器 runtime、快捷键、ActionBar 和 Workbench 布局
- `dock/`：侧边/底部 Dock、布局持久化和 Dock 配置
- `workspace/`：workspace tree/sidebar 展示
- `summary/`：session summary、plans、sources 及格式化逻辑
- `layout/`：只依赖数据的布局投影与默认值

新增文件先按运行时职责归类；不要把 RPC 编排重新放回页面 JSX。
