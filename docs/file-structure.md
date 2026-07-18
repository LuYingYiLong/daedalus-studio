# 文件结构与测试目录规范

## 生产代码边界

`src/` 只放 Studio 的 main、preload 与 renderer 生产代码，不放 `*.test.ts`。测试、源码扫描测试和测试 helper 统一放在 `tests/` 下。

Studio 目录职责：

- `src/main/`：Electron main process、窗口生命周期、本地服务、文件选择与系统集成。
- `src/preload/`：Electron preload 暴露给 renderer 的安全 IPC 边界。
- `src/renderer/src/api/`：renderer 侧 API 封装。
- `src/renderer/src/app/`：应用级状态与路由组装。
- `src/renderer/src/features/`：Agent、Composer、MessageList、WorkspaceTree 等业务组件。
- `src/renderer/src/pages/`：Settings 与页面级 UI。

## 测试目录

测试按测试类型分层，再按运行环境与领域分组：

- `tests/unit/main/...`：main process 纯逻辑和轻量服务单元测试。
- `tests/unit/renderer/...`：renderer 纯函数、状态 helper、组件相关轻量单元测试。
- `tests/integration/main/...`：涉及文件系统、窗口生命周期、系统 shell、目录选择、进程启动的 main 集成测试。
- `tests/source-scan/renderer/...`：读取生产源码文本来断言 UI 文案、API 暴露和结构约束的源码扫描测试。
- `tests/helpers/...`：测试 helper，例如 repo root 路径解析。

当前稳定导入规则：

- renderer 测试导入生产代码使用 `@/...`。
- main 测试导入生产代码使用 `@main/...`。
- source-scan 测试通过 `tests/helpers/repo-paths.ts` 解析仓库根目录，不依赖测试文件所在目录。

## 新增测试规则

- 不在 `src/` 中新增测试文件。
- 纯函数或轻量组件行为放 `tests/unit/renderer/`。
- Electron main 的文件系统、窗口、托盘、进程、系统打开操作放 `tests/integration/main/`。
- 只检查源码文本、文案存在性、IPC 暴露形状的测试放 `tests/source-scan/renderer/`。
- 测试 helper 只能放 `tests/helpers/`，生产代码不能引用它。
- 如果测试为了访问私有实现而需要同目录 colocated，优先把被测逻辑提升为明确导出的 helper。

## 命令

`npm run typecheck` 显式包含 `tests/**/*.ts`，确保迁移后的测试也参与类型检查。

`npm test` 由 Vitest 显式匹配：

```powershell
vitest run --config vitest.config.ts
```

Vitest 配置中的测试入口限制为 `tests/**/*.test.ts`，coverage 只统计生产代码，不统计 `tests/`。
