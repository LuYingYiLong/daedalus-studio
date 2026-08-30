# Windows 桌面感知验收记录

日期：2026-08-30。环境：Windows x64、Node 24.18.0、Electron 43.0.0、MSVC / Windows SDK。本次只验证本机源码和测试产物，没有发布版本或配置签名。

## 退出异常复核

用户反馈 E2E 反复弹出主进程 `Object has been destroyed` 错误后，撤销此前“17/17 通过即可验收”的结论。旧 fixture 只检查 UI，退出超时后强制终止 Electron 却不判失败，遗漏了窗口销毁期间的主进程异常。

已确认原因：`WebContents` 先于 `BrowserWindow` 销毁，感知服务撤销授权时只检查后者，仍向已销毁的页面发送 `computer:state` / `computer:revoked`。修复同时检查两者，并先清理授权及助手、再通知页面。

新门禁在构建后的 Main 入口之前加载仅供测试的监测器，将未捕获异常、未处理 rejection 和原生错误框写入逐用例 JSONL，退出后统一判定；强制退出、非零退出码、renderer 异常也会失败。原生错误框在测试中不会阻塞，但一定使测试失败；生产代码不安装全局吞错处理。

- 反向验证：旧构建 + 新门禁，`已完成引导的用户直接进入 Home` 的 UI 断言通过，但因退出时的同一异常被正确判失败。日志：`.cache/computer-lifecycle-old-build.log`。
- 新增回归覆盖空闲、等待授权、已有授权、设置窗口销毁、退出后资源校验完成和通知失败时的安全清理。
- 修复版 `npm run verify:electron`、`npm run typecheck`、`npm run build` 通过。
- 修复版 `npm test`：521 项 unit/integration/renderer + 6 项 static 通过，合计 527 项。
- 修复版完整 `npm run test:e2e:built`：17/17 通过（2.1 分钟），包括退出时仍保留有效授权的场景。17 份主进程记录均包含 `monitorReady` 和 `willQuit`；未捕获异常、未处理 rejection、原生错误框为 0，未触发强制退出兜底。
- 本轮日志：`.cache/computer-lifecycle-unit.log`、`.cache/computer-lifecycle-build.log`、`.cache/computer-lifecycle-e2e.log`；逐用例健康记录随 Playwright 报告保存为 `electron-main-health.jsonl`。测试环境的 GPU / 自签名证书 Service Worker 警告不等同于主进程未捕获异常；本轮未更改这些功能。

## 首次验证记录（修复前，保留追溯）

| 检查                                                           | 结果                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Backend `npm run typecheck`                                    | 通过                                                                                             |
| Backend `npm test`                                             | 1010 项，1009 通过、1 失败，见下方阻断项                                                         |
| Backend 感知 broker / 存储 / 脱敏定向测试                      | 8/8 通过                                                                                         |
| Studio `npm run verify:electron`                               | 通过                                                                                             |
| Studio `npm run typecheck`、`npm run build`                    | 通过                                                                                             |
| Studio unit / static                                           | 510 + 6 通过                                                                                     |
| Remote Gateway 定向权限回归                                    | 6/6 通过，包含伪造 capability 和感知 RPC 拒绝                                                    |
| Studio 原完整 `npm run test:e2e:built`                         | 原报告 17/17，退出异常漏报，不能作为有效验收；见上方复核                                          |
| `npm run build:computer -- --offline`、`npm run test:computer` | 通过                                                                                             |
| `npm run test:computer:hardware`                               | 专用测试窗口的真实 UIA/WGC/PNG、中英文离线 OCR 通过                                              |
| 从源码准备 Backend bootstrap                                   | 通过，build ID `1.4.0-005d67fcbe8e`，协议 3                                                      |
| Windows x64 解包构建                                           | 通过                                                                                             |
| Windows NSIS 测试安装包                                        | 通过，Authenticode 状态 `NotSigned`                                                              |
| 包内内容一致性                                                 | 260 个 `out` 文件与 ASAR 中内容一致；14 个原生资源大小/SHA-256 一致；Backend 清单与 exe 哈希一致 |

主要日志位于本地 `.cache/computer-*`，不提交日志或本机测试配置。原 E2E 日志 `.cache/computer-e2e-final-confirmation.log` 没有退出异常门禁，不能再作为最终通过依据。

此前生成的测试安装包：`release/computer-observation-installer-check/Daedalus-Studio-Setup-1.1.4.exe`，272,486,764 字节；SHA-256 为 `f00f37f219a46bb8451ddd33f1c533b640ffd7fa11e1c4c0572a5ae94735cd6a`。该包包含本次修复前的代码，不应再作为可验收安装包；本轮未重新打包或发布。它包含本地源码构建的 Backend，不代表线上同版本发布物已更新。没有安装此包或修改用户现有 Studio 数据。

### 测试波动说明

- 一轮 E2E 因测试重复点击已展开的证据 Collapse 而失败；已改为检查 `aria-expanded` 后再操作，未使用强制点击或延时掩盖。
- 另一轮完整 E2E 的 Remote 用例在刷新重连时未在断言时限内完成握手，随后出现连接拒绝。未更改 Remote 业务代码；单独复核以及最终完整套件均通过。保留这次波动记录，单次最终全绿不代表长期重连稳定性已充分验证。
- Windows 打包时曾与前端重建并发，旧资源名被删除导致 ENOENT；最终在构建完成后重新打包，并逐文件验证包内内容。

## 尚未通过的门禁

Backend 的 `tests/unit/plugins/plugin-harness.test.ts` 中，`fake Harness Sidecar performs the versioned handshake and publishes isolated tools` 失败：沙箱子进程 Node 启动时发生 `EPERM: operation not permitted, lstat 'C:\\'`。

这条路径使用已有 Harness / Windows sandbox helper，并非本轮独立的感知助手。没有降低沙箱权限、跳过该测试或把 Backend 全量结果标为通过。正式发布前仍需单独解决并重跑完整门禁。

## 实机覆盖边界

已验证：测试自行创建的普通顶层窗口、真实 Control View UIA、密码字段省略与遮盖、WGC 画面及实际 PNG 尺寸、生成中英文文字图片的本地 OCR、资源哈希、协议拒绝、父进程退出后的助手终止。

尚待人工验证：

- 多显示器、负坐标和 100%/150%/200% 缩放组合。
- 真实应用移动、缩放、最小化、关闭及句柄复用。
- 提权窗口、受保护窗口、锁屏和不同驱动表现。
- 使用已配置视觉模型理解专用测试窗口；自动测试没有访问真实模型或 API Key。

不能用 Mock E2E 或单个测试窗口替代这些实机矩阵。固定边界仍是不实现输入控制、不要求管理员权限、不绕过窗口保护。
