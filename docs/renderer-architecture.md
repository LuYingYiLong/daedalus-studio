# Renderer architecture

Daedalus Studio 的 renderer 按职责分层，而不是按页面名称堆放代码。新增代码应先判断它回答的是“如何组合页面”“如何完成业务用例”“如何表达纯规则”还是“如何显示结果”。

## 目录职责

| 目录 | 放置内容 | 不放置内容 |
| --- | --- | --- |
| `src/renderer/src/app` | Electron renderer 入口、窗口 shell、页面组装和 `app/composition` glue | 具体面板 UI、feature controller、可复用业务规则；不再设置 `app/runtime` 业务目录 |
| `src/renderer/src/features` | RPC 调用、事件订阅、缓存、运行时租约、控制器、业务用例和副作用 | 页面 JSX、CSS、通用按钮、纯格式化函数 |
| `src/renderer/src/domain` | 与 React 无关的类型、纯函数、格式化、校验、状态机和数据投影 | RPC 调用、Electron API、Ant Design、页面组合 |
| `src/renderer/src/widgets` | React 页面、面板、Modal、Dock、页面专用状态视图和 CSS | RPC 编排、平台 API、跨页面缓存 |
| `src/renderer/src/ui` | Button、SettingsItem、Icon、空状态、通用动画和设计系统适配 | 产品业务、会话/工作区规则 |
| `src/renderer/src/platform` | Electron preload、桌面能力适配器、RPC client、平台检测和窗口 API | 业务页面和模型选择逻辑 |

## 依赖方向

允许的主方向是：

```text
app -> widgets -> features -> domain
app -> features
widgets -> domain / ui / platform(rpc types only)
features -> domain / platform
platform -> domain
ui -> domain (仅设计系统需要的纯类型)
```

`domain` 和 `ui` 不得依赖 `app`、`features` 或 `widgets`。`features` 不得依赖页面组合、widget 或 UI 组件；需要展示时返回状态/事件，由 widget 订阅。`widgets` 不直接创建长生命周期 RPC 订阅，应该通过 feature controller 获取数据。平台能力只能从 `platform` 暴露给 renderer，页面不得导入 Electron。

## Home、Dock 和共享面板

- `HomePage` 只负责页面级组装；workspace/session runtime、Composer、Dock、轨迹等控制器属于 `features`，跨页面的编排只留在 `app/composition`。
- `widgets/home` 只保留 Home 专属视图。可被 Remote、Dock 或设置页复用的视图必须放到对应的中性 widget 目录。
- Home 左侧工作区栏及 Home 专属 surface 放在 `widgets/home/{workspace,surface}`；Dock shell 放在 `widgets/dock`，Home 对它的 slot wrapper 放在 `widgets/home/dock`。Dock 的 panel kind、placement 和 layout 数据类型放在 `domain`，共享面板分别放在 `widgets/{trajectory,browser,files,terminal,...}`。
- workspace tree 是可复用的 workspace widget；树筛选、来源判断和布局投影等纯规则放在 `domain`。

## Settings

`widgets/settings` 以页面域分组，避免根目录平铺所有页面：

```text
settings/
  pages/
    models/       Provider、默认模型及 provider 编辑器
    studio/       通用、外观、快捷键、搜索、统计、个性化
    extensions/   MCP、Skills、Hooks、Plugins
    workspace/    Browser、Remote、Computer、开发环境、Worktree、Godot
    resources/    About、Documentation、Import、Archived sessions
  components/     仅 settings 内复用的视图组件
  registry/       设置菜单和搜索目录
```

页面仍由 `app/shell/SettingsWindow` 组装。设置页的 RPC、存储和订阅逻辑属于 `features` 中对应产品域；纯 provider/model 表单规则属于 `domain/settings`。跨设置页共享的注册表和页面 motion 组件只保留在 `widgets/settings/registry`、`widgets/settings/components`。

## 当前 feature 分组

```text
features/
  application/       跨页面 bootstrap、偏好、事件桥和通知
  composer/          Composer 运行时、发送、队列和工作流控制器
  session/            会话激活、导航、生命周期和布局控制器
  workspace/          工作区、上下文和 worktree 控制器
  workbench/          Dock/timeline 的运行时缓存和 patch 队列
  home/               Home Dock、Home surface 和摘要数据控制器
  browser/            内置浏览器运行时
  external-browser/  外部浏览器连接运行时
```

`features/application` 只收跨产品域的应用级运行时；Composer、Session、Workspace 等业务 controller 不再回到一个通用 `app/runtime/hooks` 文件夹。

## 命名和迁移规则

- 负责 RPC、事件、缓存或运行时租约的 `use*Controller`、`*Runtime`、`*Cache` 应放在对应产品域的 `features`；只组装 React 节点（例如返回 `renderComposer`、Collapse items 的页面视图控制器）的局部 view controller 可以留在对应 `widgets` 页面目录。
- `*Page`、`*Panel`、`*Dialog`、`*.module.css` 不应放在 `features`。
- 共享视图不要通过 `widgets/home` 作为公共模块导出。
- 迁移时先移动文件，再更新绝对 alias import；不保留为了兼容的重复实现。
- 新的边界测试应扫描 import 路径，防止 feature/domain 重新依赖 widget。
- `app/composition` 只允许做页面 props、window shell 和跨 feature 的装配；新增业务副作用应先放入 feature。
