# Windows 窗口截图上下文

Composer 的“上下文与模式 → 窗口截图”仅在 Windows 桌面 Studio 提供。点击窗口缩略图即获取高清静态截图并添加到当前上下文，成功后关闭选择器，不再展示大图预览或二次确认。打开、搜索、刷新和未选择时取消均不保存、不创建会话。

截图或保存期间显示加载状态，连续点击不重复添加。失败后保留选择器，点击同一窗口可重试；保存失败重试复用已捕获的 PNG，刷新列表后会重新捕获。截图尚未完成时取消或切换会话会使迟到结果失效；已发送的保存请求不能撤回，但不会写入切换后的会话。

## 边界与实现

- `src/contracts/window-capture.ts`：可选平台能力。没有 Backend RPC、LLM 工具或 Remote 权限扩展。
- `src/main/services/window-capture/`：可注入的捕获适配器、串行队列、超时、临时来源映射，以及 Windows / Studio 主窗口顶层 frame 的 IPC 门禁。
- `src/renderer/src/widgets/window-capture/`：窗口截图选择器、预览和 CSS Module；窗口捕获运行时由 `features/window-capture` 相关平台控制器提供，来源标题、缩略图及 ID 仅在选择期间驻留内存。
- `features/workspace/controllers/image-import.ts`：可等待、带导航校验的单图导入；复用普通附件保存和 workbench context。每张最多 5 MiB，每条消息最多 3 张、合计 12 MiB。
- 捕获只请求 `types: ["window"]`，排除 Studio 进程与自身窗口。不移动、激活或恢复窗口，不绕过受保护内容。
- Electron 必须枚举来源才能取得缩略图。高分辨率枚举结果仅序列化所选图像，不保留未选中的大图；PNG 尺寸使用实际输出尺寸，最长边 2560、不放大。
- 导航版本绑定会话/主页草稿；异步保存与 workbench 更新在发送 RPC 前再次校验。临时会话响应在导航后不得重新激活旧草稿。

## 自动验证

```text
npm run verify:electron
npm run typecheck
npm test
npm run build
npm run test:e2e:built
```

窗口 E2E 使用真实 Electron，但替换 `desktopCapturer.getSources` 为固定测试图像，不读取实际窗口内容。Mock Backend 在内存中处理图片保存、取回、workbench 更新和会话重开，未知 RPC 会失败。

## 发布前 Windows 手工检查

自动测试不能替代以下实机检查，且不自动调用收费或外部模型：

- 使用没有敏感信息的测试窗口，分别在 100%、150%、200% 缩放和多屏环境确认附件图片的清晰度、比例与尺寸。
- 目标窗口关闭、最小化或受保护时，确认提示允许恢复窗口再试；不得绕过保护。黑色窗口内容不应一律误判成捕获错误。
- 确认 Studio 主窗口、设置窗口及其他 Studio 自有窗口不会出现在选择列表。
- 取消、连续点击、保存失败重试、截图中途切换会话/工作区/草稿，不产生重复或串会话附件。
- 在短窗口中确认搜索、窗口缩略图列表和关闭按钮仍可操作，没有大图预览和底部确认按钮。
- 单独使用已配置的视觉模型识别固定测试内容；没有视觉模型时沿用已有明确错误，不自动换模型。

点击窗口即表示添加该窗口截图；图片遵循普通会话附件生命周期，发送消息后可能交由配置的模型服务处理。未选择的窗口缩略图不落盘、不进入轨迹。此功能不授予 AI 自主桌面访问权限。
