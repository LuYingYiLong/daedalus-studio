<p align="center">
  <img alt="Daedalus Studio 横幅" src="./docs/images/banner.png" />
</p>

<h1 align="center">Daedalus Studio</h1>

<p align="center">
  面向 Godot 项目的桌面 AI 开发工作台：理解项目、执行工具、修改文件，并验证实际结果。
</p>

<p align="center">
  <a href="https://github.com/LuYingYiLong/daedalus-studio/releases/latest">
    <img alt="最新版本" src="https://img.shields.io/github/v/release/LuYingYiLong/daedalus-studio?display_name=tag&sort=semver" />
  </a>
  <a href="https://github.com/LuYingYiLong/daedalus-studio/actions/workflows/build-release.yml">
    <img alt="发布构建" src="https://github.com/LuYingYiLong/daedalus-studio/actions/workflows/build-release.yml/badge.svg" />
  </a>
  <img alt="Windows x64" src="https://img.shields.io/badge/platform-Windows%20x64-0078D4" />
  <img alt="Godot 4.5 或更高版本" src="https://img.shields.io/badge/Godot-4.5%2B-478CBF" />
  <a href="./LICENSE">
    <img alt="GPL-3.0-only 许可证" src="https://img.shields.io/badge/license-GPL--3.0--only-blue" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/LuYingYiLong/daedalus-studio/releases/latest"><strong>下载</strong></a>
  |
  <a href="#快速开始">快速开始</a>
  |
  <a href="#开发">开发</a>
  |
  <a href="https://github.com/LuYingYiLong/daedalus-backend">后端</a>
  |
  <a href="./README.md">English</a>
</p>

![Daedalus Studio 工作区](./docs/images/daedalus-studio-workflow.png)

Daedalus Studio 是一套以 Godot 为核心的 AI 开发环境。它把持久化项目会话、可审查的工具调用、文件与 Git 差异、终端验证、MCP 集成以及受管本地后端整合进一个原生桌面应用。

它面向的是能够留下真实、可追溯项目改动的开发任务，而不只是一次聊天。

## 主要特点

- **理解 Godot 工作区**：识别 `res://` 路径、场景、资源、脚本、项目设置、Input Map、Autoload 和项目依赖。
- **具有明确状态的 Agent Run**：简单修改保持轻量；复杂任务可以升级为带 Todo、审批、验证、中断恢复和安全重试的 Workflow。
- **先审查，再信任**：在会话时间线中检查文件补丁、Git diff、工具参数、终端输出、警告和验证状态。
- **自由选择供应商**：使用内置供应商目录，或添加兼容 OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages 的自定义供应商与模型。
- **MCP 与 Skills**：连接自定义 MCP Server，启用项目或个人 Skill，同时保持工具策略与审批边界不被绕过。
- **持久化桌面工作区**：保存会话、面板布局、终端标签、归档会话、工作区外观以及未读完成状态。
- **受管组件**：由 Studio 校验、安装、更新、修复和回滚 Daedalus Backend 与内置 Godot 编辑器插件。

Studio 是桌面客户端与生命周期管理者；Backend 负责执行与持久化；Godot 插件是轻量编辑器客户端和 Editor Bridge。每个 Studio 版本都会固定并检查三端版本，避免不兼容组件被静默混用。

## 核心能力

### Agent 与 Workflow

- 支持直接回答、只读检查、轻量修改和多阶段 Workflow。
- 持久化 Run 状态，明确区分路由、执行、验证、审批和终态。
- 审批与工具预算恢复不会重放已经完成的写操作。
- 中断任务可以基于已有证据和写入 fingerprint 从安全检查点重试。
- 会话独立保存模型、上下文附件、计划、Todo 和布局偏好。

### Godot 项目开发

- 检查与编辑场景、资源、脚本、Shader、项目设置、Input Map 和 Autoload。
- 使用带预检、fingerprint 和 Godot Undo/Redo 事务的类型化 Editor Bridge Patch。
- 在插件声明对应能力时处理动画、TileMap/GridMap、音频总线、资源、编辑器导航与安全预览。
- 执行 Godot headless 检查，读取 LSP、诊断和只读 DAP 信息。
- 仅为 Godot 4.5 或更高版本的项目安装或修复内置插件。

### 审查与工作区工具

- 行内文件差异和可停靠的 Git diff 审查面板。
- 按会话恢复侧边与底部面板的标签、顺序和尺寸。
- 集成终端标签；终端进程按会话隔离，应用重启后不会恢复旧进程。
- 工作区树展示置顶、最近、归档、运行中和未读会话状态。
- 支持系统托盘、原生通知、自动更新和独立的设置窗口。

### 供应商、联网搜索、MCP 与 Skills

供应商与模型列表由 Backend 动态提供。当前内置目录覆盖 DeepSeek、Moonshot/Kimi、OpenAI、智谱 AI、阿里云百炼、火山引擎方舟、MiniMax、阶跃星辰、讯飞星火、OpenCode、百度千帆和 Xiaomi MiMo。

Studio 支持远端模型发现和本地能力覆盖。独立联网搜索适配器当前支持智谱 AI 与 Xiaomi MiMo；联网搜索必须由用户明确配置和开启。

Daedalus Backend 内置了 85 个 Godot MCP 工具，覆盖离线项目分析、文件与场景编辑、项目设置、LSP 诊断、只读 DAP 调试、编辑器状态检查与运行时控制。

自定义 MCP Server 与自定义供应商都属于用户控制的外部集成。启用前应检查其地址、命令、环境变量和工具审批请求。

## 快速开始

### 系统要求

- Windows 10 或 Windows 11，x64。
- 可用的模型供应商账号与 API Key。
- 如需完整 Godot 工具和编辑器插件，需要 Godot 4.5 或更高版本。

### 安装

1. 从 [最新 Release](https://github.com/LuYingYiLong/daedalus-studio/releases/latest) 下载 `Daedalus-Studio-Setup-<version>.exe`。
2. 安装并启动 Daedalus Studio。
3. 等待首次启动页面校验并安装内置 Backend。
4. 完成新手引导。
5. 添加**工作区**。对于 Godot 项目，请配置或自动检测 Godot 可执行文件，并在 **设置 → Godot 项目** 中安装内置插件。
6. 新建会话、选择模型，然后描述需要完成的修改或检查。

Studio 的应用偏好保存在 Electron user-data 目录，Daedalus 运行数据保存在 `%USERPROFILE%\.daedalus`。API Key 通过操作系统凭据存储保存，不会写入 Daedalus 的普通 JSON 配置。

## 安全模型

Daedalus 是能够在获得批准后修改文件和执行命令的 Agent 工具。它使用可执行的边界控制风险：

- 文件、Git、Godot 和终端操作执行前都会校验工作区路径。
- Read、Verify、Propose、Write 和 Destructive 工具有不同策略。
- 写入和高风险外部操作必须经过审批网关。
- 场景与资源 Patch 会完整预检，再以单个 Undo/Redo 事务提交。
- API Key 和自定义 MCP Secret 不会进入普通配置或日志。
- 缺少验证环境会明确显示警告；实际执行失败的适用验证器不会被包装成成功。

仍然建议使用版本控制，并在接受改动前进行人工审查。

## 开发

### 开发环境

- Node.js 24.x 与 npm。
- 受支持的正式打包需要 Windows。
- 开发模式需要本地的 [daedalus-backend](https://github.com/LuYingYiLong/daedalus-backend) 仓库。
- 如果需要开发或测试 Godot Editor Bridge，还需要本地的 [daedalus-bridge](https://github.com/LuYingYiLong/daedalus-bridge) 仓库；普通 Studio 开发不强制要求它。

### 从源码运行

先启动 Backend：

```powershell
git clone https://github.com/LuYingYiLong/daedalus-backend.git
cd daedalus-backend
npm ci
npm run dev
```

然后在另一个终端启动 Studio。Bridge 仓库对普通 Studio 开发是可选的：

```powershell
git clone https://github.com/LuYingYiLong/daedalus-studio.git
cd daedalus-studio
npm ci
npm run dev
```

开发版 Studio 默认连接 `38181` 端口。如果两个仓库不在相邻目录，请在 Studio 启动设置中配置开发 Backend 目录。

推荐的开发目录结构如下：

```text
D:\Daedalus-Studio\
├─ daedalus-studio\
├─ daedalus-backend\
└─ daedalus-bridge\
```

当 `daedalus-bridge` 不存在时，`npm run dev` 会先复用 `build/daedalus-bridge` 中已经通过校验的缓存；没有缓存时才尝试下载固定版本。若下载遇到网络或证书问题，开发服务器会继续启动，但 Godot Bridge 功能暂时不可用；`npm run build:win`、`npm run pack:win` 等正式打包命令仍会严格失败。

如果 Bridge 仓库位于其他路径，可以在启动前配置仓库根目录或 `addons/daedalus_bridge` 目录：

```powershell
$env:DAEDALUS_BRIDGE_SOURCE = "D:\src\daedalus-bridge"
npm run dev
```

本地 Bridge 的版本、协议、Studio 版本和安装目录必须与 Studio 的 `package.json` 一致。若公司代理或杀毒软件重新签发 HTTPS 证书，请为 Node 配置可信根证书：

```powershell
$env:NODE_EXTRA_CA_CERTS = "C:\certs\company-root-ca.pem"
npm run dev
```

不要使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`，它会关闭当前进程所有 HTTPS 请求的证书校验。

### 开发启动故障排查

如果 `npm run dev` 还没启动 Electron 就报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`，说明失败发生在 Node 通过 HTTPS 准备可选 Bridge 包时，原因是证书链无法验证，不是 Renderer 或 Backend 启动失败。

建议按以下顺序处理：

1. 将 `daedalus-bridge` 克隆到本仓库旁边，或设置 `DAEDALUS_BRIDGE_SOURCE` 指向已有仓库。
2. 如果之前生成过 Bridge 包，请保留 `build/daedalus-bridge`，准备脚本会先校验并离线复用它。
3. 如果代理或杀毒软件重新签发了 HTTPS 证书，为 Node 设置 `NODE_EXTRA_CA_CERTS` 指向组织的根证书，然后重试。
4. 如果当前不需要 Bridge，直接再次执行 `npm run dev`。开发模式会跳过 Bridge 打包并继续启动，Godot 项目页会显示插件暂不可用；普通聊天开发不受影响。

不要通过关闭 TLS 校验来绕过证书错误。正式打包仍会严格要求通过校验的 Bridge 压缩包。

### 检查与构建

```powershell
npm run typecheck
npm test
npm run build
npm run pack:win
```

- `npm run build` 在 `out/` 中生成 Electron 生产 Bundle。
- `npm run pack:win` 生成未安装的 Windows 应用目录。
- `npm run build:win` 在 `release/` 中生成 NSIS 安装包与更新元数据。
- 发布构建会准备固定版本的 Backend 和 Godot Bridge，并在打包前检查清单、大小、哈希、协议与 Backend self-test。Bridge 缺失或无法校验仍会阻止正式打包，只有未打包的开发服务器可以在 Bridge 暂不可用时继续运行。

## 项目状态

Daedalus Studio 正在积极开发中。会话和项目数据以持久、可恢复为目标；内部协议与扩展契约可能在 Studio、Backend 和插件协同发布时继续演进。

提交问题时，请提供 Studio 版本、Backend 版本、Godot 版本、复现步骤和脱敏后的启动或会话诊断。请勿提交 API Key 或自定义 MCP Secret。

## 相关项目

- [Daedalus Backend](https://github.com/LuYingYiLong/daedalus-backend)：运行时、会话、供应商、Workflow、工具、MCP 与 Godot 服务。
- [Godot Daedalus](https://github.com/LuYingYiLong/godot-daedalus)：Godot 编辑器插件与 Editor Bridge。

## 许可证

Daedalus Studio 使用 [GNU General Public License v3.0 only](./LICENSE) 许可证。
