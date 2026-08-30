# Windows 电脑操作与只读观察

此功能只覆盖用户选定的一个窗口。观察和操作分别开关、默认关闭；操作支持受限左键点击、Unicode 文本、滚动和白名单按键。没有跨应用控制、提权、脚本、拖拽、右键菜单或剪贴板通道。原有“窗口截图 → 直接添加图片上下文”流程保持独立。

## 使用入口

1. 使用匹配的 Backend 源码构建。启动 Windows x64 Studio，在“设置 → 电脑操作”中开启“允许 AI 请求观察窗口”（默认关闭）。
2. AI 调用申请工具后，选窗并允许本轮观察或操作。manual/auto-safe 每轮只做一次操作审批；full-trust 由 Backend 真实模式判定，首次仍需选窗，后续轮次可复用同会话、同连接中仍存活的目标。权限本身不跨轮次保留。问答与计划编写始终只读，输入仅在 Agent 或已批准计划执行阶段可用。
3. Composer 附近显示共享状态，随时可停止共享。轮次终态、停止运行、导航、断连、锁屏或关窗会撤销授权；重连不会恢复授权，也不能在同一轮重复弹窗。
4. “设置 → 电脑操作”集中提供权限开关和本地诊断；诊断需要先在常规设置开启开发者模式，由 SettingsItem 按钮打开单个 Modal。本地诊断不授权 AI、不添加附件、不调用模型，也不持久化诊断内容，离开页面或关闭设置窗口会清理结果。旧的感知 Dock 项会被移除，其他面板及尺寸保留。
5. 轨迹工具记录中的“查看桌面观察证据”可读取尚未精简的历史证据；不能重放授权或重新捕获已精简内容。

OCR 在本机执行，但 AI 工具返回的文字及按需截图可能发送给配置的模型服务。密码控件会按 UIA 信息遮盖，但不能保证应用暴露了所有敏感内容，请只选择可共享的窗口。

## 工具与数据

- `mcp_computer_request_access`：提供原因及可选 `mode: observe | control`，缺省保持只读。
- `mcp_computer_observe`：返回新采集的 UIA、OCR、物理坐标映射、时间和完整性标志。
- `mcp_computer_screenshot`：引用已有 `observationId`，返回同一帧，不暗中重拍。
- `mcp_computer_action`：关联最新 observationId 的单动作。Backend 生成稳定 actionId；同一动作去重，结果未知不自动重试。每次动作后需重新观察。

操作批准后，目标显示器短暂播放边缘光晕，随后保留边框、真实指针标记和 `AI正在使用你的电脑 [取消]` 状态条。用户接管立即暂停，显示 `已暂停 [继续] [取消]`；继续前获取新观察，不重放旧动作。取消先停止输入，再严格取消该轮 LLM；Ctrl+Alt+Esc 为紧急停止。等待超过五分钟、断连、心跳超时、覆盖层故障或失去窗口身份均不会自动续权。

Main、主 renderer/Backend 和原生助手分别有心跳保护。覆盖层使用独立受限 preload；原生助手校验捕获排除后才接受输入。前台激活失败时等待用户手动切换，不强行抢焦点。

未请求的 PNG 只驻留内存。Backend schema 10 的独立观察表保存结构化观察及 AI 明确请求的 PNG；图片通过工具图片引用续接，不嵌入事件、日志或轨迹 Prompt 正文。旧观察与现有最近 10 个已完成轮次精简共用事务，删除 UIA/OCR 正文和 PNG，保留摘要及授权审计。

Remote、Android、非 Windows、定时任务及 Goal 不开放这些工具。Gateway 固定禁用 computerObservation/computerControl，并拒绝控制状态、结果、撤销和历史查询方法。旧 Backend 未声明 `client.info.features.computerControl: 2` 时操作不可用。

设置窗口的顶层 frame 仅可读取脱敏状态、修改开关和运行本地诊断；不能发起 AI 工具调用、确认授权或读取当前会话的观察正文。授权弹窗和“停止共享”仍在主会话窗口，关闭设置窗口不会撤销其有效授权。

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

电脑操作升级的验证结果和未通过项见 [电脑操作验收记录](windows-computer-control-validation.md)；此前的只读阶段保留在 [桌面感知验收记录](windows-computer-observation-validation.md)。不将测试包视为已经正式发布或签名的稳定版本。
