const { existsSync, mkdirSync, readdirSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repositoryDir = path.resolve(__dirname, "..");
const projectDir = path.join(repositoryDir, "android", "remote-control");
const toolchainDir = path.join(repositoryDir, ".android-toolchain");
const wrapper = path.join(projectDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
const localGradle = path.join(toolchainDir, "gradle-9.4.1", "bin", process.platform === "win32" ? "gradle.bat" : "gradle");
const command = existsSync(localGradle) ? localGradle : wrapper;

function run(commandPath, args, options = {}) {
	const result = spawnSync(commandPath, args, {
		cwd: options.cwd ?? repositoryDir,
		env: options.env ?? process.env,
		stdio: "inherit",
		shell: process.platform === "win32",
	});
	if (result.error) {
		console.error(result.error.message);
		process.exit(1);
	}
	if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(command)) {
	console.error("Android Gradle wrapper is missing. Generate it from android/remote-control before building.");
	process.exit(1);
}

const environment = { ...process.env };
const localSdk = path.join(toolchainDir, "android-sdk");
const javaSocketDir = path.join(toolchainDir, "java-sockets");
mkdirSync(javaSocketDir, { recursive: true });
if (!environment.ANDROID_SDK_ROOT && existsSync(localSdk)) environment.ANDROID_SDK_ROOT = localSdk;
if (!environment.GRADLE_USER_HOME && existsSync(toolchainDir)) environment.GRADLE_USER_HOME = path.join(toolchainDir, "gradle-user-home");
if (!environment.JAVA_HOME && existsSync(toolchainDir)) {
	const javaExecutable = process.platform === "win32" ? "java.exe" : "java";
	const localJdk = readdirSync(toolchainDir).find((entry) => entry.startsWith("jdk-17") && existsSync(path.join(toolchainDir, entry, "bin", javaExecutable)));
	if (localJdk) environment.JAVA_HOME = path.join(toolchainDir, localJdk);
}
if (!environment.GRADLE_OPTS) environment.GRADLE_OPTS = "-Xmx2048m -Dfile.encoding=UTF-8";
const javaSocketOption = `-Djdk.net.unixdomain.tmpdir="${javaSocketDir}"`;
environment.JAVA_TOOL_OPTIONS = [environment.JAVA_TOOL_OPTIONS, javaSocketOption]
	.filter(Boolean)
	.join(" ");
if (environment.DAEDALUS_ANDROID_TEMP) {
	environment.TEMP = environment.DAEDALUS_ANDROID_TEMP;
	environment.TMP = environment.DAEDALUS_ANDROID_TEMP;
	environment.TMPDIR = environment.DAEDALUS_ANDROID_TEMP;
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
run(npmCommand, ["run", "typecheck"]);
run(npmCommand, ["run", "build:android:web"]);

const generatedAssetsDir = path.join(projectDir, "app", "build", "generated", "remoteAssets");
const requiredAssets = ["connect.html", "native-remote.html"];
const missingAssets = requiredAssets.filter((asset) => !existsSync(path.join(generatedAssetsDir, asset)));
if (missingAssets.length > 0 || existsSync(path.join(generatedAssetsDir, "__app__"))) {
	console.error(
		"Android Remote assets must be emitted at the APK assets root because WebViewAssetLoader strips /__app__/.",
	);
	if (missingAssets.length > 0) console.error(`Missing assets: ${missingAssets.join(", ")}`);
	process.exit(1);
}

run(command, [
	"--no-daemon",
	":app:testDebugUnitTest",
	":app:lintDebug",
	":app:assembleDebug",
], { cwd: projectDir, env: environment });
