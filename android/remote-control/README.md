# Daedalus Remote Android shell

This is a deliberately small WebView shell for the LAN Remote PWA served by a running Daedalus Studio instance. It does not bundle the Backend, expose a JavaScript bridge, bypass TLS errors, or allow public hosts.

## Build

The project uses Android Gradle Plugin 9.2.0, Gradle 9.4.1, JDK 17, Android SDK Platform 36, and Build Tools 36.0.0.

From the Studio repository root:

```powershell
npm run build:android:debug
```

The APK is written to `android/remote-control/app/build/outputs/apk/debug/app-debug.apk`.

The build script automatically uses a repository-local `.android-toolchain` when present, otherwise it uses `JAVA_HOME`, `ANDROID_SDK_ROOT`, and the checked-in Gradle wrapper. Sandboxed Windows environments that cannot create JVM loopback pipes can set `DAEDALUS_ANDROID_TEMP` to a short writable path.

## Pair

1. Enable Remote access in Studio.
2. Install and explicitly trust the CA certificate shown by Studio, then compare the fingerprint.
3. Generate a pairing session and copy its APK pairing link.
4. Paste or share the link into Daedalus Remote.

The one-time secret is not persisted. The WebView stores only the device cookie and the last HTTPS Studio endpoint.
