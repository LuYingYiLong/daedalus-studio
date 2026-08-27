const { existsSync, readdirSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repositoryDir = path.resolve(__dirname, "..");
const projectDir = path.join(repositoryDir, "android", "remote-control");
const toolchainDir = path.join(repositoryDir, ".android-toolchain");
const wrapper = path.join(projectDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
const localGradle = path.join(toolchainDir, "gradle-9.4.1", "bin", process.platform === "win32" ? "gradle.bat" : "gradle");
const command = existsSync(localGradle) ? localGradle : wrapper;

if (!existsSync(command)) {
	console.error("Android Gradle wrapper is missing. Generate it from android/remote-control before building.");
	process.exit(1);
}

const environment = { ...process.env };
const localSdk = path.join(toolchainDir, "android-sdk");
if (!environment.ANDROID_SDK_ROOT && existsSync(localSdk)) environment.ANDROID_SDK_ROOT = localSdk;
if (!environment.GRADLE_USER_HOME && existsSync(toolchainDir)) environment.GRADLE_USER_HOME = path.join(toolchainDir, "gradle-user-home");
if (!environment.JAVA_HOME && existsSync(toolchainDir)) {
	const javaExecutable = process.platform === "win32" ? "java.exe" : "java";
	const localJdk = readdirSync(toolchainDir).find((entry) => entry.startsWith("jdk-17") && existsSync(path.join(toolchainDir, entry, "bin", javaExecutable)));
	if (localJdk) environment.JAVA_HOME = path.join(toolchainDir, localJdk);
}
if (environment.DAEDALUS_ANDROID_TEMP) {
	environment.TEMP = environment.DAEDALUS_ANDROID_TEMP;
	environment.TMP = environment.DAEDALUS_ANDROID_TEMP;
	environment.TMPDIR = environment.DAEDALUS_ANDROID_TEMP;
}

const result = spawnSync(command, ["--no-daemon", ":app:assembleDebug"], {
	cwd: projectDir,
	env: environment,
	stdio: "inherit",
	shell: process.platform === "win32",
});

if (result.error) {
	console.error(result.error.message);
	process.exit(1);
}

process.exit(result.status ?? 1);
