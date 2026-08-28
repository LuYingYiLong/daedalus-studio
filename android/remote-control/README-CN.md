# Daedalus Remote Android shell

Daedalus Remote 是一款混合型 Android 应用。其 APK 内打包了 React UI，使用受来源限制的原生桥接层进行扫描和安全配置文件存储，并且仅连接至配对的 Studio Remote Gateway。该应用不打包或暴露后端服务，不会绕过 TLS 错误，也不允许连接公共主机。

## 构建

项目使用 Android Gradle Plugin 9.2.0、Gradle 9.4.1、JDK 17、Android SDK Platform 36 和 Build Tools 36.0.0。（请确保已安装全部依赖）

在 Studio 仓库根目录下执行：

```powershell
npm run build:android:debug
```

APK将输出至 `android/remote-control/app/build/outputs/apk/debug/app-debug.apk`.

构建脚本会自动使用仓库本地的 `.android-toolchain`（若存在）, 否则会使用 `JAVA_HOME`, `ANDROID_SDK_ROOT`, 以及已检入的 Gradle wrapper. 在沙盒化 Windows 环境中，若无法创建 JVM 回环管道 可将`DAEDALUS_ANDROID_TEMP`设置为一个较短的可写路径

## 通过 ADB 进行 UI 开发

首先安装一次 Debug APK，启用 Android 无线调试（需安卓11及以上），并通过 ADB 配对/连接设备：

```powershell
adb pair <手机ip>:<配对端口>
adb connect <手机ip>:<配对端口>
```

在仓库根目录下启动增量式 Android UI 开发：

```powershell
npm run dev:android
```

Vite 会持续处于构建监视模式。Debug APK 携带了其打包 UI 的 SHA‑256 基线。每次成功构建后，同步脚本仅将 `files/dev-ui` 中与基线不同的文件传输到应用的私有覆盖目录，删除过期的哈希覆盖文件，并重启 Daedalus Remote。缺失的覆盖文件会回退到 APK 中的打包资源，因此首次无变化的同步不会传输任何内容，后续的 UI 或 CSS 变更则是增量式的。

如需单次构建并同步，或将 Debug APK 恢复为仅使用打包资源，可执行：

```powershell
npm run sync:android:remote
npm run clear:android:remote
```

当连接了多台设备时，请使用 `--serial <adb设备ID>` 指定目标设备。同步的资产仅会被可调试构建接受，且要求两个 HTML 入口文件和完成标记文件均存在。Release 构建始终只使用 APK 内打包的资源。

## 配对

1. 在 Studio 中启用远程访问。.
2. 安装并明确信任 Studio 显示的 CA 证书，然后比对指纹。
3. 生成配对二维码并复制其 APK 配对链接。
4. 将链接粘贴或分享至 Daedalus Remote。

一次性密钥不会被持久化。WebView 仅存储设备 cookie 和最近的 HTTPS Studio 端点地址。
