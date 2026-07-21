# Daedalus Studio UI 设计规范

本文档记录 Studio 当前统一采用的暗色紧凑界面规则。新增或修改 UI 时，优先使用全局 `--ds-*` token 和 Ant Design `ConfigProvider` 主题，不在局部组件中重新定义一套色值、圆角或间距。

## 基础原则

- 界面基调是功能优先、紧凑、安静的桌面工具，而不是营销页或装饰型页面。
- 默认背景使用 `#141414`，边框使用 `#3b3b3b`，主题色使用 `#478cbf`。
- 默认间距优先使用 `8px`；只有图标与文字、列表内部密集区域可使用 `4px`。
- 小控件、Tag、Badge、状态标签使用 `4px` 圆角；Composer、Modal、Popover、Table 外框等大控件使用 `8px` 圆角。
- 不使用超过 `8px` 的圆角，不使用 `999px` 胶囊形圆角。

## Design Tokens

核心 token 定义在 `src/renderer/src/styles/global.css`：

| Token | 用途 |
| --- | --- |
| `--ds-bg` | 应用基础背景，固定为 `#141414` |
| `--ds-code-bg` | Markdown的代码块背景 |
| `--ds-bg-sunken` | 输入框、代码块、低层级内容背景 |
| `--ds-surface` | 普通面板、卡片、Composer 背景 |
| `--ds-surface-elevated` | Dropdown、Popover、菜单、浮层背景 |
| `--ds-surface-hover` | hover 背景 |
| `--ds-surface-active` | active/selected 背景 |
| `--ds-border` | 标准边框，固定为 `#3b3b3b` |
| `--ds-accent` | 主题色，固定为 `#478cbf` |
| `--ds-accent-muted` | 选中态、弱强调背景 |
| `--ds-text-primary` | 主文字 |
| `--ds-text-secondary` | 次级文字 |
| `--ds-text-muted` | 弱提示、meta 信息 |
| `--ds-git-addition` | Git diff 增加行/增加数量文字，语义为绿色 |
| `--ds-git-deletion` | Git diff 删除行/删除数量文字，语义为红色 |
| `--ds-git-addition-bg` | Git diff 增加区域弱背景 |
| `--ds-git-deletion-bg` | Git diff 删除区域弱背景 |
| `--ds-radius-sm` | 小圆角，固定为 `4px` |
| `--ds-radius-lg` | 大控件圆角，固定为 `8px` |
| `--ds-space-1` | `4px` |
| `--ds-space-2` | `8px` |
| `--ds-space-3` | `12px` |
| `--ds-space-4` | `16px` |

语义色如 success、warning、danger 可以保留自身语义，但应通过 `--ds-success`、`--ds-warning`、`--ds-danger` 使用。

Git 差异 UI 统一使用 `--ds-git-addition` / `--ds-git-deletion` 及对应背景 token；增加为绿色，删除为红色，不在局部组件硬编码 diff 色值。

## Ant Design

- 全局主题由 `src/renderer/src/main.tsx` 的 `ConfigProvider` 管理。
- 紧凑感来自局部间距、列表高度和页面密度，不使用全局 `componentSize="small"` 压缩所有控件尺寸。
- Menu 控件自身不绘制背景，背景由所在容器提供；只在 hover、active、selected 状态显示状态底色。
- 新增 Ant Design 组件时优先依赖全局 token；只有组件确实需要局部状态时才写 CSS module。
- `Button`、`Input`、`Select`、`Menu`、`Table`、`Modal`、`Dropdown`、`Popover`、`Tag` 的圆角和边框应与全局规范一致。
- 弹层类组件使用 `--ds-surface-elevated` 作为背景，使用 `--ds-border` 作为边框。
- 表格内部 cell padding 默认使用 `8px`；只在密集工具栏中使用更小间距。

## 组件规则

- **Shell / Nav**：侧边导航使用 `--ds-surface-elevated`，选中态使用 `--ds-accent-muted`，active indicator 使用 `--ds-accent`。
- **WorkspaceTree**：列表项高度保持紧凑；图标按钮只在 hover/focus 时显现；菜单项内部 gap 优先 `4px`。
- **AgentPage**：聊天主体可以居中限制内容宽度，但 Header 应保持横向 `space-between`，不被聊天内容宽度约束。
- **Composer**：外框使用 `8px`，内部按钮和状态控件使用 `4px`；focus 边框使用 `--ds-accent`；footer 使用统一 surface 层级。
- **FloatingWorkflowTodoPanel**：浮层本体只显示当前阶段进度和 Git 变更摘要；详细 Todo 列表、失败说明、dismiss 等低频信息放入 Popover。
- **MessageList**：内容宽度保持稳定，滚动容器可以占满右侧空间；消息正文不应因滚动条位置改变而变窄或跳动。
- **UserBubble**：发送气泡使用 `--ds-accent` 背景，圆角 `4px`。
- **AssistantBubble**：正文不使用卡片化背景；未知事件、JSON、工具详情等辅助块使用统一边框和低层级背景。
- **Settings**：页面边界和分组间距优先 `8px`；详情面板可使用 `16px` 作为外边距；占位块、表格外框使用 `8px` 圆角。
- **Markdown**：保持可读行高和段落节奏，只统一链接、代码块、表格、引用、图片的颜色、边框和圆角。

## Checklist

新增或修改 UI 前检查：

- 是否优先使用了 `--ds-*` token，而不是新增散落 hex 色值。
- 是否没有使用 `999px`、`12px`、`16px` 等超过 `8px` 的圆角。
- 小控件是否使用 `4px`，大容器是否使用 `8px`。
- 普通间距是否优先使用 `8px`，密集图标间距是否使用 `4px`。
- hover、active、selected、disabled 状态是否和 Ant Design 主题一致。
- Dropdown、Popover、Modal 等弹层是否有统一背景、边框和圆角。
- 文本是否在窄宽度下截断或换行，不应挤压按钮或与相邻内容重叠。
