# 外部浏览器（Windows x64）

外部浏览器功能与 Studio 内置浏览器、电脑操作授权分别管理。默认关闭；不使用远程调试端口、TCP 服务或系统鼠标，不读取全部标签页内容。Chrome/Edge 扩展通过 Native Messaging 和当前 Windows 用户的命名管道连接 Studio。

## 开发安装

1. 在 Studio 仓库执行 `npm run build:browser:host`（需要 MSVC、Windows SDK、CMake）和 `npm run build:browser:extension`。
2. 启动 Studio，在设置 → 浏览器 → 外部浏览器中启用功能，点击安装说明中的注册/打开扩展目录按钮。只写当前用户的 Native Messaging 注册项，无需管理员权限。
3. 打开 Chrome/Edge 扩展管理页，开启开发者模式，加载刚打开的目录。开发版目录为 `build/browser-extension/development`；安装版使用包内 `browser-extension/stable`。
4. 在扩展状态页启用“连接 Studio”。多个浏览器连接时，在 Studio 设置中选择默认连接。

正式版和开发版具有不同的扩展 ID、主机名与命名管道，不能交叉连接。ZIP 位于 `build/browser-extension/daedalus-browser-{development,stable}.zip`，先解压再加载。不要加载用户日常浏览器资料到自动测试。

“连接 Studio”勾选仅表示扩展允许尝试连接，不表示已连通；必须同时启用 Studio 中的“允许外部浏览器任务”。扩展收到 Studio 握手确认后才显示“已连接”。如果先开启扩展、后启动 Studio，可重新打开扩展状态页重试；页面会区分本地主机未注册、连接被拒绝和 Studio 不可用，并标明开发/正式通道。更新扩展后也要重启相应 Studio；仅替换扩展而不更新 Main 可能出现握手超时。重新连接不恢复任何旧标签页操作授权。

## 对话方式

用户提供完整 HTTP(S) URL。AI 只读检查后，发布列明字段值、点击/勾选/提交步骤及影响的方案，结束当轮。下一条实际用户消息用于解释授权，例如“可以，但不要提交”。无需固定口令，不弹逐步审批窗口；完全信任模式同样需要对话确认。

方案十分钟有效；执行授权仅驻内存，绑定本次连接、会话、轮次和运行。切换会话、关闭页面、断连、取消或重启均不会恢复执行权限。未知派发结果不自动重复。步骤外的内容改变需要重新提案。

只支持普通 DOM 及同源 iframe，不提供任意 JavaScript、Cookie、密码/验证码、文件上传下载、跨域 iframe 操作或 Windows 输入回退。后台执行不代表所有网站都支持；网页加载及网站脚本仍可能触发网络请求、自动保存等副作用。

## 调试与测试

```text
npm run verify:electron
npm run typecheck
npm run test:browser
npm test
npm run build:browser:host
npm run build
npm run test:browser:host
npm run test:e2e:built
```

`tests/e2e/external-browser.spec.ts` 使用真实 Electron、真实扩展和原生主机，配合 Mock Backend、本地测试表单、临时 Chromium 配置及随机 Native Messaging 注册项。测试退出会撤除这些随机注册项，不覆盖正式/开发注册项。需要 Playwright 的完整 Chromium（不是仅 headless shell）。

新增行为与证据存储测试位于 Backend 的 `browser-conversation-authority.test.ts`、`browser-activity-store.test.ts`。模型授权解释器有严格结构验证、一次请求及 30 秒截止；自动测试不证明自然语言模型理解准确率。

## 人工验收（单独记录）

- 使用无敏感数据的专用 Chrome/Edge 页面，确认现有登录状态能复用。
- 首轮字段和提交计数保持不变；确认子集只填写，明确批准提交才提交。
- 检查后台页操作不激活浏览器，不移动鼠标；其他标签页无 AI 光标。
- 测试多匹配、跨域跳转、弹窗、验证码、DevTools 断开、取消和退出 Studio。
- 在开发者模式的轨迹中回看授权与操作记录；关闭开发者模式隐藏正文，历史精简不恢复权限。
- Windows 打包验证主机、扩展和资源校验 manifest 位于 ASAR 外；Android 不包含它们。

实机/真实模型验收与 Mock E2E 分开报告。不要为通过测试放宽 URL 范围、隔离 world、用户授权或浏览器保护。
