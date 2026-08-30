# Windows 电脑操作验收记录

日期：2026-08-30～2026-08-31。环境：Windows x64、Node 24.18.0、Electron 43.0.0、MSVC / Windows SDK。范围为当前工作区源码与未签名测试包，没有发布、安装或修改用户现有 Studio 数据。

## 已实现的链路

- 单窗口输入：左键单击/双击、Unicode 文本、水平/垂直滚动、受限按键；沿用原生窗口身份、UIA、OCR、同帧截图和观察存储。
- Main 持有授权事实；观察与输入权限分别设置，输入默认关闭。manual/auto-safe 每轮审批一次，full-trust 只复用当前会话、当前连接中仍有效的目标，不继承上轮权限。
- Ask、计划编写、Goal、定时任务和 Remote 不开放输入。旧 Backend 未声明兼容能力时输入不可用。
- 独立覆盖层和状态条、真实指针位置、派发后的点击反馈；人工接管暂停，继续时重新观察。取消先停止输入，再中止严格绑定的模型控制器，旧轮次不能取消下一轮。
- Main、renderer/Backend、原生助手独立心跳保护；暂停等待与单次观察超时分开。原生协议为 2，Backend 协议仍为 3。
- 设置页更名为“电脑操作”，保留原导航标识；诊断放入单个只读 Modal。features 负责运行时/控制器，widgets 负责界面，未增加 HomePage/useAppController 业务状态。
- 输入正文不写普通日志或审计；轨迹脱敏，结构化动作摘要关联 observationId。观察详情和 PNG 继续沿用已有 10 轮精简事务。

## 自动验证

| 门禁 | 结果 |
| --- | --- |
| Backend `npm run typecheck` | 通过（完整测试前置） |
| Backend `npm test` | 1019 项：1018 通过，1 项已有插件沙箱失败，见下方 |
| Studio `npm run verify:electron` | 通过，Electron 43.0.0 |
| Studio `npm run typecheck`、`npm run build` | 通过 |
| Studio `npm test` | 542 项 unit/integration/renderer + 6 项 static，共 548 项通过 |
| Studio `npm run test:e2e:built` | 18/18 通过（2.4 分钟），使用最终固定构建 |
| 诊断 Modal 截图与关闭状态复核 | 1/1 通过，已检查截图 |
| Windows x64 解包构建、NSIS 安装包及内容校验 | 通过，Authenticode 为 NotSigned |
| `npm run build:computer`、`npm run test:computer` | 通过：助手自检、专用 UIA 窗口、密码字段、离线中英文 OCR、资源哈希、协议拒绝与父进程退出 |
| `npm run test:computer:hardware` | 专用窗口的真实 WGC/UIA 捕获通过；输入 fixture 因焦点检查失败，整条命令未通过 |

完整 E2E 保持主进程异常和正常退出门禁。新用例覆盖选窗审批、受限覆盖层桥接、动作派发、显示器变化暂停、重新观察恢复、过期动作拒绝、取消和 full-trust 目标复用。自动测试使用 Mock Backend、模拟助手和固定图片；没有调用真实模型、读取 API Key 或操作用户应用。

本地日志：Backend `.cache/control-backend-final-lf.log`（最终 LF 源码复核仍为 1018/1019）；Studio `.cache/control-studio-acceptance.log`、`.cache/control-build-acceptance.log`、`.cache/control-e2e-acceptance.log`、`.cache/control-diagnostics-ui.log`、`.cache/control-electron-acceptance.log`、`.cache/control-final-native-build.log`。18 份完整 E2E 主进程健康记录均正常退出，没有未捕获异常或原生错误框。日志及生成产物不提交到仓库。

## Windows 测试安装包

- 位置：`release/computer-control-check/Daedalus-Studio-Setup-1.1.4.exe`。
- 大小：272,559,577 字节（约 260 MiB）。SHA-256：`092307f99624ecd9dc4ab89ac41a6abd63559465d590b2f5aac033fe0b05dce6`。
- ASAR 中 266 个 `out` 文件与最终 Studio 构建逐文件相同，包含独立 overlay renderer 和受限 preload。
- ASAR 外 14 个原生资源与资源清单的大小、SHA-256 全部匹配；助手协议为 2。
- 内置 Backend 来自本地最终源码，协议 3，build ID `1.4.0-89738584273b`，exe SHA-256 为 `ef93dc7d27a3bd7c97d1748a8c571bab7397cb96999e5ad9bc7b8b92732d3332`。这不是线上同版本发布物。
- 安装包为 NotSigned；未发布、未安装，也未删除此前测试包。原有用户主题修改和 `ai-cursor.svg` 保留。

初次构建在 Electron 下载阶段遇到证书校验失败，随后使用已验证的本地 `node_modules/electron/dist` 与 NSIS 缓存完成构建，没有关闭 TLS 校验或 ASAR 校验。依赖文件收集耗时较长，详细日志确认完成后生成安装包；最终 Backend 更新后通过 `--prepackaged` 重建 NSIS，重新校验所有内容。命令行参数仅用于本次本地构建，不修改项目发布配置。

日志：`.cache/control-windows-package-debug.log`、`.cache/control-bootstrap-final-lf.log`、`.cache/control-windows-package-final.log`、`.cache/control-package-content-verification.log`。

## 尚未通过的门禁

Backend `tests/unit/plugins/plugin-harness.test.ts` 的 `fake Harness Sidecar performs the versioned handshake and publishes isolated tools` 失败：其已有沙箱子进程在 Node 启动阶段发生 `EPERM: operation not permitted, lstat 'C:\\'`。相同问题也记录在此前的只读感知验收中；没有降低沙箱权限或跳过用例，不能把 Backend 全量测试标为通过。

新增原生输入 fixture 只创建并操作自己的测试窗口。完整硬件复核中，真实 WGC/UIA 捕获通过，输入 fixture 返回 `computer_focus_changed`；定向复核还出现了启动时 `computer_fixture_focus_failed`。输入测试受焦点校验阻断，真实点击、文本输入、滚动和人工接管矩阵不能标为通过。日志为 `.cache/control-native-hardware-acceptance.log`、`.cache/control-fixture-stage.log`。未绕过焦点检查、UIPI 或提权；Mock E2E 通过不能替代这项实测。

## 实机待验收

- 在可交互 Windows 桌面运行 `npm run test:computer:hardware`，完成专用窗口输入及 WGC 验证。
- 多显示器、负坐标、100%/150%/200% DPI；移动窗口或更改布局后必须暂停/重新观察。
- 最小化、窗口销毁/复用、密码控件、新顶层对话框、提权及受保护窗口。
- 人工接管、Ctrl+Alt+Esc、锁屏/挂起、覆盖层或助手故障以及真实 LLM 取消行为；真实模型测试需要独立人工确认，不属于自动 CI。
- 验证覆盖层捕获排除和不同显卡驱动的实际表现。

当前交付是待实机验收的测试实现，不是已签名或可宣称全部门禁通过的正式发布。
