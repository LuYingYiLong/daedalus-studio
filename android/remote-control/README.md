# Daedalus Remote Android shell

Daedalus Remote is a hybrid Android application. The APK bundles the React UI, uses an origin-restricted native bridge for scanning and secure profile storage, and connects only to a paired Studio Remote Gateway. It does not bundle or expose the Backend, bypass TLS errors, or allow public hosts.

## Build

The project uses Android Gradle Plugin 9.2.0, Gradle 9.4.1, JDK 17, Android SDK Platform 36, and Build Tools 36.0.0.

From the Studio repository root:

```powershell
npm run build:android:debug
```

The APK is written to `android/remote-control/app/build/outputs/apk/debug/app-debug.apk`.

The build script automatically uses a repository-local `.android-toolchain` when present, otherwise it uses `JAVA_HOME`, `ANDROID_SDK_ROOT`, and the checked-in Gradle wrapper. Sandboxed Windows environments that cannot create JVM loopback pipes can set `DAEDALUS_ANDROID_TEMP` to a short writable path.

## UI development over ADB

Install the Debug APK once, enable Android Wireless debugging, and pair/connect the device with ADB:

```powershell
adb pair <phone-ip>:<pair-port>
adb connect <phone-ip>:<debug-port>
```

Start incremental Android UI development from the repository root:

```powershell
npm run dev:android
```

Vite stays in build watch mode. The Debug APK carries a SHA-256 baseline for its bundled UI. After each successful build, the sync script transfers only files that differ from that baseline into the app's private `files/dev-ui` overlay, removes stale hashed overrides, and restarts Daedalus Remote. Missing override files fall back to the APK bundle, so the first unchanged sync transfers nothing and later UI or CSS changes are incremental.

For a single build and sync, or to return the Debug APK to bundled assets:

```powershell
npm run sync:android:remote
npm run clear:android:remote
```

Use `--serial <adb-device-id>` after `--` when multiple devices are connected. Synchronized assets are accepted only by a debuggable build and only after both HTML entrypoints and the completion marker exist. Release builds always use APK-bundled assets.

## Pair

1. Enable Remote access in Studio.
2. Install and explicitly trust the CA certificate shown by Studio, then compare the fingerprint.
3. Generate a pairing session and copy its APK pairing link.
4. Paste or share the link into Daedalus Remote.

The one-time secret is not persisted. The WebView stores only the device cookie and the last HTTPS Studio endpoint.
