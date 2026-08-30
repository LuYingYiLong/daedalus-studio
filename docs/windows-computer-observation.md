# Windows 桌面感知（只读）

此功能只观察用户为当前轮次明确授权的一个窗口，不支持点击、输入、滚动、激活窗口、提权或全桌面扫描。原有“窗口截图 → 直接添加图片上下文”流程保持独立。

## 使用入口

1. 使用匹配的 Backend 源码构建。启动 Windows x64 Studio，在常规设置中开启“允许 AI 请求观察窗口”（默认关闭）。
2. AI 调用申请工具后，在弹窗中选择窗口并允许本轮观察。开关本身不授予权限，完全信任模式也不能跳过选窗。
3. Composer 附近显示共享状态，随时可停止共享。轮次终态、停止运行、导航、断连、锁屏或关窗会撤销授权；重连不会恢复授权，也不能在同一轮重复弹窗。
4. 开发者模式下可从 Dock 添加“桌面感知”。其中的本地诊断不授权 AI、不添加附件、不调用模型，也不持久化诊断内容。
5. 轨迹工具记录中的“查看桌面观察证据”可读取尚未精简的历史证据；不能重放授权或重新捕获已精简内容。

OCR 在本机执行，但 AI 工具返回的文字及按需截图可能发送给配置的模型服务。密码控件会按 UIA 信息遮盖，但不能保证应用暴露了所有敏感内容，请只选择可共享的窗口。

## 工具与数据

- `mcp_computer_request_access`：提供原因，等待当前轮次的选窗授权。
- `mcp_computer_observe`：返回新采集的 UIA、OCR、物理坐标映射、时间和完整性标志。
- `mcp_computer_screenshot`：引用已有 `observationId`，返回同一帧，不暗中重拍。

未请求的 PNG 只驻留内存。Backend schema 10 的独立观察表保存结构化观察及 AI 明确请求的 PNG；图片通过工具图片引用续接，不嵌入事件、日志或轨迹 Prompt 正文。旧观察与现有最近 10 个已完成轮次精简共用事务，删除 UIA/OCR 正文和 PNG，保留摘要及授权审计。

Remote、Android、非 Windows、定时任务及 Goal 不开放这些工具。Gateway 固定禁用 capability，并拒绝结果、撤销和历史查询方法。

## 构建与验证

```powershell
npm run build:computer
npm run test:computer
# 仅捕获原生测试自己创建的窗口，需要交互式 Windows 桌面
npm run test:computer:hardware
npm run verify:electron
npm run typecheck
npm test
npm run build
npm run test:e2e:built
```

`npm run pack:win` / `npm run build:win` 会构建原生助手并准备匹配的本地 Backend。独立工作区没有 Backend 源码时仍使用固定发布清单；正式发布需先发布兼容 Backend 并更新版本配置，不能沿用尚无新工具的旧后端。

Windows 包在 ASAR 外包含 C++ 助手、ONNX Runtime CPU、PP-OCRv5 mobile 模型、VC 运行库及许可。资源版本和 SHA-256 位于 `native/computer-observation/resources.lock.json`。安装后不下载模型；Android 不携带这些资源。构建脚本不安装系统服务或 VC redistributable。

实现与原生协议详见 [native README](../native/computer-observation/README.md)。

## 验收边界

自动化测试使用固定图片、Mock Backend 和模拟助手。原生自检使用自己创建的窗口及内存图像，验证真实 UIA/WGC 和离线中英文 OCR，不读取用户窗口、不调用真实模型。

仍需发布前人工验证：多屏和负坐标、100%/150%/200% 缩放、移动/缩放期间丢弃结果、最小化/关闭、提权/受保护窗口、锁屏，以及不同显卡驱动下的表现。水平中英文界面文字是当前 OCR 的主要目标，倾斜/曲线文字不保证识别完整。

本次验证结果和未通过项见 [验收记录](windows-computer-observation-validation.md)。不将测试包视为已经正式发布或签名的稳定版本。
