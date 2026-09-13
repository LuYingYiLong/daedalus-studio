const { existsSync, mkdirSync, readdirSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const {
	MANIFEST_FILE_NAME,
	createAssetManifest,
} = require("./android-remote-manifest.cjs");

const repositoryDir = path.resolve(__dirname, "..");
const projectDir = path.join(repositoryDir, "android", "remote-control");
const toolchainDir = path.join(repositoryDir, ".android-toolchain");
const wrapper = path.join(projectDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
const localGradle = path.join(toolchainDir, "gradle-9.4.1", "bin", process.platform === "win32" ? "gradle.bat" : "gradle");
const command = existsSync(localGradle) ? localGradle : wrapper;

function readRegistryEnvironmentValue(name, hive) {
	if (process.platform !== "win32") return null;
	const environmentKey = hive === "HKLM"
		? "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"
		: `${hive}\\Environment`;
	const result = spawnSync("reg.exe", ["query", environmentKey, "/v", name], {
		encoding: "utf8",
		windowsHide: true,
	});
	if (result.status !== 0 || typeof result.stdout !== "string") return null;
	const valueLine = result.stdout.split(/\r?\n/).find((line) => new RegExp(`\\s${name}\\s+REG_\\w+\\s+`, "i").test(line));
	if (!valueLine) return null;
	const valueMatch = valueLine.match(new RegExp(`\\s${name}\\s+REG_\\w+\\s+(.+)$`, "i"));
	return valueMatch?.[1]?.trim() || null;
}

function expandEnvironmentVariables(value) {
	return value.replace(/%([^%]+)%/g, (_match, name) => process.env[name] ?? `%${name}%`);
}

function firstExistingDirectory(candidates) {
	return candidates
		.map((candidate) => typeof candidate === "string" ? expandEnvironmentVariables(candidate).trim() : "")
		.find((candidate) => candidate.length > 0 && existsSync(candidate)) ?? null;
}

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
if (!environment.ANDROID_SDK_ROOT) {
	const registeredSdk = [
		readRegistryEnvironmentValue("ANDROID_SDK_ROOT", "HKCU"),
		readRegistryEnvironmentValue("ANDROID_HOME", "HKCU"),
		readRegistryEnvironmentValue("ANDROID_SDK_ROOT", "HKLM"),
		readRegistryEnvironmentValue("ANDROID_HOME", "HKLM"),
	];
	const defaultSdk = path.join(environment.LOCALAPPDATA ?? "", "Android", "Sdk");
	const detectedSdk = firstExistingDirectory([
		...registeredSdk,
		localSdk,
		environment.ANDROID_HOME,
		defaultSdk,
		path.join(environment.USERPROFILE ?? "", "AppData", "Local", "Android", "Sdk"),
	]);
	if (detectedSdk) environment.ANDROID_SDK_ROOT = detectedSdk;
}
if (!environment.ANDROID_HOME && environment.ANDROID_SDK_ROOT) environment.ANDROID_HOME = environment.ANDROID_SDK_ROOT;
if (!environment.GRADLE_USER_HOME && existsSync(toolchainDir)) environment.GRADLE_USER_HOME = path.join(toolchainDir, "gradle-user-home");
if (!environment.JAVA_HOME) {
	const javaExecutable = process.platform === "win32" ? "java.exe" : "java";
	const localJdk = existsSync(toolchainDir)
		? readdirSync(toolchainDir).find((entry) => entry.startsWith("jdk-17") && existsSync(path.join(toolchainDir, entry, "bin", javaExecutable)))
		: null;
	const registeredJavaHome = [
		readRegistryEnvironmentValue("JAVA_HOME", "HKCU"),
		readRegistryEnvironmentValue("JAVA_HOME", "HKLM"),
	];
	const androidStudioJdks = process.platform === "win32" ? [
		path.join(environment.ProgramFiles ?? "C:\\Program Files", "Android", "Android Studio", "jbr"),
		path.join(environment["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Android", "Android Studio", "jbr"),
	] : [];
	const detectedJavaHome = firstExistingDirectory([
		localJdk ? path.join(toolchainDir, localJdk) : null,
		...registeredJavaHome,
		...androidStudioJdks,
	]);
	if (detectedJavaHome) environment.JAVA_HOME = detectedJavaHome;
}
// Android packaging handles the bundled web assets in a separate worker. Keep
// enough heap for that step, while still allowing callers/CI to override it.
if (!environment.GRADLE_OPTS) environment.GRADLE_OPTS = "-Xmx4096m -Dfile.encoding=UTF-8";
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

writeFileSync(
	path.join(generatedAssetsDir, MANIFEST_FILE_NAME),
	JSON.stringify(createAssetManifest(generatedAssetsDir)),
	"utf8",
);

run(command, [
	"--no-daemon",
	"--no-parallel",
	"--stacktrace",
	":app:testDebugUnitTest",
	":app:lintDebug",
	":app:assembleDebug",
], { cwd: projectDir, env: environment });
