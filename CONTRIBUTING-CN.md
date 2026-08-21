# 为 Daedalus Studio 做贡献

本指南包含 Daedalus Studio 的本地开发、验证和打包说明。README 文件链接到此处以使这些命令有一个规范的出处。

## 开发环境

- Node.js 24.x 和 npm。
- 支持打包构建的 Windows 系统。
- 在开发模式下运行 Studio 时，需要本地检出 [daedalus-backend](https://github.com/LuYingYiLong/daedalus-backend)。
- 在开发或测试 Godot Editor Bridge 功能时，可选检出 [daedalus-bridge](https://github.com/LuYingYiLong/daedalus-bridge)。

## 从源码运行

首先启动后端：

```powershell
git clone https://github.com/LuYingYiLong/daedalus-backend.git
cd daedalus-backend
npm ci
npm run dev
```

然后在另一个终端中启动 Studio。对于常规的 Studio 开发，Bridge 的检出是可选的：

```powershell
git clone https://github.com/LuYingYiLong/daedalus-studio.git
cd daedalus-studio
npm ci
npm run dev
```

开发模式下的 Studio 连接到端口 38181 上的后端。如果仓库不是同级目录，请在 Studio 的启动设置中设置开发后端目录。

推荐的开发目录结构为：

```text
D:\Daedalus-Studio\
├─ daedalus-studio\
├─ daedalus-backend\
└─ daedalus-bridge\
```

当 `daedalus-bridge` 不存在时，`npm run dev` 首先复用 `build/daedalus-bridge` 中已验证的包。如果没有可用的缓存，则会尝试使用固定的 Bridge 发布版本。网络或证书错误不会阻止 Studio 开发服务器的启动；在包准备好之前，Godot Bridge 功能将保持不可用。同样的错误对于 `npm run build:win`、`npm run pack:win` 和其他生产打包命令是致命的。

要使用磁盘上任意位置的 Bridge 检出，请在启动 Studio 之前设置源路径。该值可以是仓库根目录或其 `addons/daedalus_bridge` 目录：

```powershell
$env:DAEDALUS_BRIDGE_SOURCE = "D:\src\daedalus-bridge"
npm run dev
```

本地 Bridge 元数据必须匹配 `package.json`（`godotBridgeVersion`、`godotBridgeProtocolVersion`、Studio 版本和 `addons/daedalus_bridge` 安装路径）。对于企业代理或对 HTTPS 流量重新签名的杀毒软件，请为其配置受信任的根证书供 Node 使用，而不是禁用 TLS 验证：

```powershell
$env:NODE_EXTRA_CA_CERTS = "C:\certs\company-root-ca.pem"
npm run dev
```

请勿使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`；它会禁用进程中所有 HTTPS 请求的证书验证。

开发启动故障排查

如果在 Electron 启动之前 `npm run dev` 失败并显示 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`，则该错误来自准备可选 Bridge 包时 Node 的 HTTPS 证书验证。这不是渲染器或后端启动失败。

请按顺序使用以下修复方法：

1. 在此仓库旁边克隆 `daedalus-bridge`，或将 `DAEDALUS_BRIDGE_SOURCE` 设置为现有的检出。
2. 如果之前存在 Bridge 包，请保留 `build/daedalus-bridge`，以便准备脚本可以离线验证并复用。
3. 如果代理或杀毒软件重新签名 HTTPS，请将 `NODE_EXTRA_CA_CERTS` 设置为组织的根 CA 并重试。
4. 如果不需要 Bridge，请再次运行 `npm run dev`。开发模式会在没有 Bridge 打包的情况下继续，并在 Godot Projects 页面显示缺少的包；这不会影响常规的聊天开发。

请勿通过禁用 TLS 验证来修复证书错误。生产打包仍然是严格的，并且必须有经过验证的 Bridge 归档包。

检查与构建

运行与您的更改匹配的检查：

```powershell
npm run typecheck
npm test
npm run build
npm run pack:win
```

- `npm run build` 在 `out/` 中创建生产环境的 Electron 捆绑包。
- `npm run pack:win` 创建未打包的 Windows 构建。
- `npm run build:win` 在 `release/` 中创建 NSIS 安装程序和更新器元数据。
- Windows 打包首先在 Studio 仓库旁边查找 `daedalus-backend` 和 `daedalus-bridge`。同级后端使用 `npm run release:sea:win` 构建；同级 Bridge 从 `addons/daedalus_bridge` 打包。
- 如果同级仓库不存在，请将 `DAEDALUS_BACKEND_SOURCE` 设置为后端仓库根目录，将 `DAEDALUS_BRIDGE_SOURCE` 设置为 Bridge 仓库或插件根目录。同级仓库有意优先于这些变量。
- 如果没有可用的源仓库，打包会保留验证过的回退路径：`DAEDALUS_BACKEND_BOOTSTRAP_DIR` 用于准备好的后端负载，然后是固定的后端和 Bridge GitHub 发布版本。所有打包的工件仍会进行版本、清单、哈希、协议和后端自检的验证。缺少或无法验证的 Bridge 仍然是打包错误；只有非捆绑的开发服务器可以在没有它的情况下继续。

请勿提交生成的依赖项、构建输出、发布工件、日志或本地配置。保持更改的聚焦性，并在提交审查时包含相关的类型检查、测试或构建结果。