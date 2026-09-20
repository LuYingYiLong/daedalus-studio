# Flow 混合渲染

Flow 保留原有文档、插件协议、操作日志和 outbox，不需要重置数据或升级后端协议。

## 渲染与状态

- `FlowDocumentStore` 维护节点、边和入边/出边索引；`FlowRunStore` 按节点通知运行状态。
- `FlowCanvasStore` 管理显示层级、编辑锁、输入法组合状态和独立草稿；`FlowGeometryStore` 管理矩形、端口及均匀网格索引。
- `HomeFlowSurface` 向 XYFlow 提供稳定的节点 ID 与 runtime。XYFlow 本地维护拖动状态，外部文档变化才合并节点；保存 ACK 不重新同步整图。
- `FlowNodeShell` 始终保留节点交互壳。完整模式挂载实际控件，轮廓模式只保留固定尺寸和不可见的测量端口。框选、移动、键盘焦点仍由 XYFlow 管理。
- `FlowCanvasLayer` 绘制网格、节点轮廓（包含 header 色带和标题）和普通连线。标题复用完整节点的 i18n 和自定义名称，超长时省略，测量结果按节点缓存；轮廓不挂载控件。选中、悬停、重连及连接预览使用少量 SVG 覆盖层，拓扑校验仍读取完整文档。

运行事件不读取完整 Flow 或运行历史。模型数据保持页面缓存，Markdown 解析结果最多缓存 32 项/50 万字符，媒体预览按 artifact ID 去重并使用 16MiB LRU。插件默认使用宿主表单，明确进入插件编辑才挂载 iframe。

## 几何和显示层级

阈值集中在 `FlowCanvasStore.updateDetail()`，当前初始缩放以 0.5 为界；缩小至 0.15 切换轮廓，放大至 0.25 恢复完整。缩放期间冻结层级，停止 150ms 后分帧处理，每帧最多两个节点、准备预算 4ms；输出及插件等重 DOM 单独占用一帧。新输入立即取消未执行任务。

视口外扩 320 CSS px 预备完整控件，离开 640px 保留区后释放。焦点、Select、输入法、插件编辑固定为完整。批量选择不会提升显示级别。轮廓节点双击或 Enter 会居中并放大至至少 0.75 后编辑。

测量完整节点后缓存端口位置。轮廓壳只能复用缓存，不能将 DOM 缩放舍入误差回写为新锚点。隐藏端口统一使用 border-box 与中心偏移，避免左右端口默认 transform 不一致引起位置漂移。

Canvas 与 SVG 使用同一贝塞尔算法及端点颜色，基准线宽 2px。边以控制点凸包进行空间查询，因此两端不在屏幕内的跨屏曲线仍可显示。命中宽度按屏幕像素折算。

Canvas 仅分配视口加四周 256px 的缓冲区，位图不超过 64MiB。平移时复用缓冲区并更新合成变换，越界后补画；交互补画使用 DPR 1，静止 500ms 后恢复至 min(DPR, 2)。网格也包含在缓存内，避免 SVG pattern 每帧更新。没有节点微位移动画或定时拆卸合成层。

## 持久化与生命周期

拖动过程中没有位置操作；结束后每个移动节点产生一次最终操作，多选拖动合并为一个历史命令。viewport 保存合并且不进入内容历史。输入草稿及定时提交存于 runtime，不依赖控件是否挂载；同一次聚焦编辑的防抖提交合并为一次撤销。窗口失焦、切换 Flow、卸载时 flush。

每个 Flow 拥有独立 runtime。清理会取消动画帧、定时器、观察器和订阅；媒体请求有卸载校验。普通 Chat 不启用 Flow 的 Markdown 解析缓存。

## 验证方式

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e:built -- tests/e2e/flow.spec.ts tests/e2e/flow-hybrid.spec.ts --project=electron
npm run test:flow:performance:built
```

`npm run test:flow:performance` 会先构建。性能配置独立启用硬件加速，普通功能 E2E 继续使用原有配置。测试使用隔离配置目录与 Mock Backend，不改动用户 Flow。

性能场景使用固定 1600×1000 窗口、生产构建、200 节点/400 边以及 500 节点/1000 边。混合普通表单、长 Markdown、图片产物与插件 schema fallback，包含正常缩放、轮廓缩放、快速反向平移和停止后立即再拖动。

每轮输出 `metrics.json`、`chromium-trace.json` 和截图至 `test-results/flow-performance/`，记录 CPU、内存、DPR、实际 WebGL renderer、GPU 特性、逐帧间隔、每段开始/停止尖峰、长任务及布局/绘制/GC 汇总。200 节点要求 p95 ≤25ms、p99 ≤50ms；500 节点只报告数据。无法证明硬件加速时测试失败，不以软件渲染代替验收。

### 2026-09-20 本机验收

最终构建使用 AMD Ryzen 7 7435H、RTX 4060 Laptop（ANGLE / D3D11）、DPR 1.25。实际 GPU renderer 已检查，不是 SwiftShader。200 节点各交互分段也通过 p95/p99 阈值。

| 场景 | 总体 p95 | 总体 p99 | 最大开始尖峰 | 最大停止尖峰 |
| --- | ---: | ---: | ---: | ---: |
| 200 节点 / 400 边 | 13.9ms | 14.0ms | 14.1ms | 27.8ms |
| 500 节点 / 1000 边 | 27.9ms | 41.6ms | 41.8ms | 41.6ms |

最终数据位于 `test-results/flow-final-gpu/`，功能 E2E 位于 `test-results/flow-final-e2e-verified/`。`typecheck`、`build`、835 项单元/集成/静态测试及 3 项 Flow 功能 E2E 均通过。功能场景覆盖连接与断连、审批、运行、节点删除、草稿恢复、连续编辑撤销、轮廓几何稳定性及无关节点运行事件隔离。

500 节点仍是压力场景，不宣称达到 200 节点的门槛；改造期间混合场景曾出现 p95 48.6ms、p99 76.4ms，后续仍需在多台机器上观察长尾。上述数据仅证明本机固定场景结果，不保证任意插件控件或任意媒体内容的性能。

基线和改造期间的测试数据保留在本机 `test-results/flow-gpu-baseline/`、`flow-hybrid-mixed/`、`flow-performance-final/`、`flow-performance-grid/` 等目录，不提交生成物。场景曾逐步加入混合内容与固定正常缩放，跨场景数字不能直接作为同条件提升比例。

### 轮廓 header 验证

新增 Canvas header 色带和标题后，`build`（含 `typecheck`）以及两项混合渲染 E2E 通过。用户将轮廓阈值调为 0.15 后，原性能场景的 Fit View 未必进入轮廓，保留 94 个完整节点控件时测得 p95 34.7ms / p99 69.5ms，未达标，数据保留在 `test-results/flow-outline-header-gpu/`。

概览测试现明确缩小至不高于 0.12，并断言完整控件已释放，避免把完整模式当作轮廓模式测量；正常缩放的前六段交互保持不变。本机 200 节点 / 400 边复测 p95 13.9ms / p99 20.8ms，各交互分段也通过门槛。数据和 header 截图位于 `test-results/flow-outline-header-gpu-outline/`。这不代表低 LOD 阈值下同时挂载大量控件的性能问题已经消除。

参考：[XYFlow 性能建议](https://reactflow.dev/learn/advanced-use/performance)、[节点尺寸和端口几何](https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration)。
