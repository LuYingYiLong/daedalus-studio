# Computer observation widgets

这个目录只放桌面感知的 React 展示和交互组件：窗口选择器、授权提示、诊断视图、证据展示和轨迹历史证据。

组件通过 `features/computer-observation` 的 hook 获取状态和操作，不直接实现授权生命周期、Backend 事件关联或诊断结果失效规则。设置页的权限开关直接属于
`widgets/settings/ComputerObservationSettingsPage.tsx`，避免为一行设置再维护一个 feature 组件。
