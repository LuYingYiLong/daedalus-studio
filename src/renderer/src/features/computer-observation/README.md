# Computer observation feature

这个目录只放桌面感知的领域运行时，不放 React 视图、Ant Design 组件或 CSS。

- `computer-runtime.ts`：绑定会话与 Backend 事件，处理授权生命周期、调用转发和断连撤销
- `useComputerState.ts`：读取平台能力、权限状态和开发者模式
- `useComputerObservationDiagnostics.ts`：管理设置页本地诊断的选择、失效和结果生命周期
- `useComputerObservationHistory.ts`：加载轨迹中的历史观察证据并解析 detail level
- `useComputerObservationSession.ts`：把当前会话上下文绑定到桌面感知运行时

这些 hook 可以被 widget 使用，但不应反向依赖 `widgets/`。需要新增界面时放到
`src/renderer/src/widgets/computer-observation/`，需要新增领域行为时优先放在这里。
