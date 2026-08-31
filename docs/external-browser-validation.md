# 外部浏览器实现验收记录

日期：2026-08-31。环境：Windows x64、Node.js 24.18.0、Electron 43。

## 自动验证

- Studio `npm run verify:electron`、`npm run typecheck`、`npm run build` 通过。
- Studio `npm test`：747 项单元/组件测试和 6 项静态检查通过，共 753 项。
- Studio `npm run test:browser`：10 项边界与本地 DOM 集成测试通过。
- Studio `npm run test:e2e:built`：26 项通过，包含真实扩展、Native Messaging 主机、Electron、Mock Backend 和本地表单的完整链路。
- 两个通道的 C++ 主机构建、自检、资源 SHA-256 与扩展 manifest 验证通过。E2E 退出后未发现遗留的浏览器主机进程。
- Backend 类型检查通过；完整 `npm test` 为 1107/1108 通过。外部浏览器、对话确认、执行隔离与观察存储相关测试全部通过。

Backend 唯一未通过项：`tests/unit/plugins/plugin-harness.test.ts` 中的 `fake Harness Sidecar performs the versioned handshake and publishes isolated tools`。最后一次运行在清理临时 `harness-runtime/.../profiles/daedalus` 目录时返回 `EPERM`。未修改 Harness 的隔离策略或绕过该失败，因此不能将 Backend 完整测试报告为全绿。

## Windows 打包

本地验证使用未签名 NSIS 安装包；产物放在仓库内 `.cache/external-browser-package`，不写入正式 Release 目录，也没有安装到用户系统。通过 `--prepackaged` 更新最终 Backend 后重新封装，避免安装包包含验证过程中的旧 Backend。

包内 `resources/browser-host`、`resources/browser-extension` 均位于 ASAR 外。原生主机 SHA-256、自检及 MV3 权限清单通过验证；Backend 与沙箱助手逐项比对最终构建的 manifest 和 SHA-256。构建时未新增发布签名。

## 仍需人工验收

自动测试使用临时 Chromium 配置和专用测试页，没有访问用户账号、真实模型或外部网站。以下内容不能用 Mock 通过代替：

- Chrome、Edge 正式发行版中首次注册主机、加载扩展和复用已有登录状态。
- 实际配置模型对自由表达、否定和有条件授权的理解质量。
- 真实网站后台节流、登录过期、验证码、跨域跳转及停止行为。
- 安装/卸载体验与用户设备上的浏览器策略差异。

安装步骤、权限边界和逐项手工检查见 [外部浏览器说明](./external-browser.md)。

## 连接状态修复补充验收

- 扩展仅在收到 Studio 的 `hello_ack` 后报告已连接；补充缺少主机、拒绝连接、Studio 不可用和握手失败说明，并显示开发/正式通道。
- 验证两端开关启用顺序、显式断开清理、迟到 Port 回调、重连后旧结果丢弃，以及设置快照不能覆盖新连接事件。
- 外部设置直接并入 `BrowserSettingsPage`，复用 `SettingsItem`；删除独立的 `ExternalBrowserSettings` 视图，状态订阅仍放在 feature 中。
- Studio 类型检查、构建、Electron 校验、浏览器主机资源自检通过；完整测试为 757 项加 6 项静态检查，共 763 项通过。
- 更新后的外部浏览器 E2E 单项通过，覆盖“扩展先启用 → Studio 开启 → 两端显示已连接 → 停用/重启连接”及原有只读、后台操作、光标、取消流程，并保存设置页和扩展页截图。
- 本次重新生成了开发/正式扩展目录及 ZIP；未重打前述 NSIS 安装包。开发测试请重启 `npm run dev`，并在浏览器扩展管理页重新加载开发版扩展。
