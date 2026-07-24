<p align="center">
  <img alt="banner" src="./docs/images/banner.png" />
</p>

<h1 align="center">Daedalus Studio</h1>

<p align="center">
  <b>AI-assisted Godot development workbench.</b>
</p>

<p align="center">
  <a href="./README.md" align="center">English</a>
</p>

![Daedalus Studio workflow](./docs/images/daedalus-studio-workflow.png)

Daedalus Studio 是一个面向 Godot 项目的桌面 AI 工作台。它不只是把聊天窗口放在编辑器旁边，而是让 AI 能理解项目文件、场景、脚本、工作流步骤、审批和验证结果，围绕 Godot 开发流程完成任务。

## 为什么选择 Daedalus Studio

- Godot 项目上下文：打开 Godot 项目、附加文件、检查场景结构，并让 AI 使用 `res://` 路径理解资源关系。
- 场景和项目操作：创建或 patch 场景、更新 project settings、处理 Input Map 和 Autoload，并检查实际写入结果。
- Workflow 模式：把需求拆成可审查的步骤，执行时展示进度，并在界面里保留清晰的任务列表。
- 更安全的工具调用：工具调用、文件写入、终端命令、生图导入和计划审批都会出现在时间线里，而不是藏在聊天正文中。
- 面向验证的执行结果：Daedalus 会在可用时运行检查、读取 Godot 输出，并明确区分“已验证完成”和“完成但未验证”。
- 原生桌面体验：托管后端启动、更新检测、系统托盘、原生通知和 Windows 安装包更新。

## 针对 Godot 强化的能力

Daedalus Studio 在连接 Godot workspace 后能力最完整：

- 理解 Godot 项目结构和资源路径
- 通过后端工具编辑 `.tscn`、`.tres`、`.gd`、`.gdshader` 和项目配置
- 支持 Godot 场景检查和 scene patch 工作流
- 通过后端 Godot 工具分析项目依赖、脚本引用、未使用资源和跨场景节点
- 可以配置 Godot 可执行文件，用于验证、编辑器和运行时相关检查
- 写入操作会被限制在当前选择的 workspace 边界内

## Workflow

Workflow 模式适合多步骤 Godot 任务：

1. 提出一个功能或修复需求，例如创建主场景、添加 UI、接入玩法逻辑。
2. Daedalus 在需要时生成计划或任务流。
3. 你可以批准、修改或补充澄清信息。
4. AI 通过后端工具执行操作并写入文件。
5. 结果视图会展示任务是已验证完成、带警告完成，还是失败。

## 支持的 AI Provider

Daedalus Studio 当前内置支持：

- DeepSeek
- Moonshot
- OpenAI
- Zhipu

API Key 在 **Settings -> Provider** 中配置。模型列表由后端加载；当模型能力可用时，界面会展示工具调用、推理、视觉、网页搜索和生图等能力标签。

## 后端

Daedalus Studio 通过 Daedalus backend 处理会话、工具、Workflow 执行、Godot 操作、Provider 路由和托管更新。

- 后端仓库：[LuYingYiLong/daedalus-backend](https://github.com/LuYingYiLong/daedalus-backend)
- 托管后端包：`daedalus-backend`

正式包可以自动安装和修复托管后端。开发环境下，需要先单独启动后端再使用前端。

## 快速开始

1. 从 [Releases](https://github.com/LuYingYiLong/daedalus-studio/releases/latest) 下载最新 Windows 安装包。
2. 启动 Daedalus Studio，并等待它准备托管后端。
3. 打开 **Settings -> Provider**，为支持的 Provider 配置 API Key。
4. 如果 Daedalus 没有自动检测到 Godot，打开 **Settings -> General** 设置 Godot 可执行文件路径。
5. 添加或选择一个 Godot workspace。
6. 开始聊天，并选择要使用的模型。

## 常见任务

- 用自然语言创建或修改 Godot 场景。
- 让 AI 检查场景结构并修复缺失节点。
- 为玩法功能生成计划，然后审批并执行 Workflow。
- 分析项目依赖或查找脚本引用。
- 在提交前查看文件变更和 Git diff。
- 将生成的图片资产导入当前 Godot workspace。

## 注意

Daedalus Studio 仍在快速迭代。建议保持 Studio 和托管后端同步更新；当任务需要写文件、运行终端命令或修改项目配置时，请认真查看审批内容。
