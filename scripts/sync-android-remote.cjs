const {
	copyFileSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const {
	createAssetManifest,
	isSafeRelativePath,
} = require("./android-remote-manifest.cjs");

const repositoryDir = path.resolve(__dirname, "..");
const packageName = "com.daedalus.studio.remote";
const generatedAssetsDir = path.join(
	repositoryDir,
	"android",
	"remote-control",
	"app",
	"build",
	"generated",
	"remoteAssets",
);
const toolchainDir = path.join(repositoryDir, ".android-toolchain");
const syncWorkDir = path.join(toolchainDir, "android-remote-sync");
const localAdb = path.join(
	toolchainDir,
	"android-sdk",
	"platform-tools",
	process.platform === "win32" ? "adb.exe" : "adb",
);
const remoteStage = `/data/local/tmp/daedalus-remote-ui-sync-${process.pid}`;
const requiredAssets = ["connect.html", "native-remote.html"];

function printHelp() {
	console.log(`Usage: node scripts/sync-android-remote.cjs [options]

Options:
  --watch          Keep Vite in build watch mode and sync after every successful build.
  --clear          Remove synchronized UI assets and return to APK-bundled assets.
  --no-restart     Do not restart Daedalus Remote after synchronization.
  --serial <id>    Target a specific device from adb devices.
  --help           Show this help.

Android 11+ wireless setup:
  adb pair <phone-ip>:<pair-port>
  adb connect <phone-ip>:<debug-port>`);
}

function parseArguments(values) {
	const options = {
		watch: false,
		clear: false,
		restart: true,
		serial: process.env.ANDROID_SERIAL || "",
	};
	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (value === "--watch") options.watch = true;
		else if (value === "--clear") options.clear = true;
		else if (value === "--no-restart") options.restart = false;
		else if (value === "--help") options.help = true;
		else if (value === "--serial") {
			options.serial = values[index + 1] || "";
			index += 1;
		} else if (value.startsWith("--serial=")) {
			options.serial = value.slice("--serial=".length);
		} else {
			throw new Error(`Unknown option: ${value}`);
		}
	}
	if (options.watch && options.clear) throw new Error("--watch and --clear cannot be combined");
	return options;
}

function run(command, args, options = {}) {
	const capture = options.capture === true;
	const result = spawnSync(command, args, {
		cwd: options.cwd || repositoryDir,
		encoding: capture ? "utf8" : undefined,
		stdio: capture ? "pipe" : "inherit",
		shell: false,
	});
	if (result.error) throw result.error;
	if ((result.status ?? 1) !== 0 && options.allowFailure !== true) {
		const detail = capture ? String(result.stderr || result.stdout || "").trim() : "";
		throw new Error(detail || `${path.basename(command)} exited with ${result.status}`);
	}
	return result;
}

function npmInvocation(args) {
	if (process.env.npm_execpath) {
		return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
	}
	return {
		command: process.platform === "win32" ? "npm.cmd" : "npm",
		args,
	};
}

function runNpm(args) {
	const invocation = npmInvocation(args);
	run(invocation.command, invocation.args);
}

function resolveAdb() {
	if (process.env.ANDROID_ADB) return path.resolve(process.env.ANDROID_ADB);
	if (existsSync(localAdb)) return localAdb;
	return process.platform === "win32" ? "adb.exe" : "adb";
}

function listDevices(adb) {
	const result = run(adb, ["devices"], { capture: true });
	return String(result.stdout)
		.split(/\r?\n/u)
		.map((line) => line.match(/^([^\s]+)\s+device$/u)?.[1])
		.filter(Boolean);
}

function selectDevice(adb, requestedSerial) {
	const devices = listDevices(adb);
	if (requestedSerial) {
		if (!devices.includes(requestedSerial)) {
			throw new Error(`ADB device ${requestedSerial} is not connected. Connected: ${devices.join(", ") || "none"}`);
		}
		return requestedSerial;
	}
	if (devices.length === 0) {
		throw new Error("No ADB device is connected. Pair Wireless debugging with `adb pair`, then run `adb connect`.");
	}
	if (devices.length > 1) {
		throw new Error(`Multiple ADB devices are connected. Pass --serial <id>: ${devices.join(", ")}`);
	}
	return devices[0];
}

function createAdb(adb, serial) {
	const prefix = ["-s", serial];
	return (args, options = {}) => run(adb, [...prefix, ...args], options);
}

function assertDebugPackage(adb) {
	const result = adb(["exec-out", "run-as", packageName, "pwd"], {
		capture: true,
		allowFailure: true,
	});
	if ((result.status ?? 1) !== 0) {
		throw new Error(
			"Daedalus Remote Debug APK is not installed or is not debuggable. Run `npm run build:android:debug` and install app-debug.apk first.",
		);
	}
}

function createManifest() {
	for (const requiredAsset of requiredAssets) {
		if (!existsSync(path.join(generatedAssetsDir, requiredAsset))) {
			throw new Error(`Android Remote web build is missing ${requiredAsset}`);
		}
	}
	return createAssetManifest(generatedAssetsDir);
}

function diffManifests(manifest, previous) {
	const previousFiles = previous?.files || {};
	return {
		changedPaths: Object.keys(manifest.files).filter((relativePath) => (
			previousFiles[relativePath]?.sha256 !== manifest.files[relativePath].sha256
		)),
		removedPaths: Object.keys(previousFiles).filter((relativePath) => (
			manifest.files[relativePath] === undefined
		)),
	};
}

function readDeviceManifest(adb) {
	const result = adb([
		"exec-out",
		"run-as",
		packageName,
		"cat",
		"files/dev-ui.manifest.json",
	], { capture: true, allowFailure: true });
	if ((result.status ?? 1) !== 0 || !String(result.stdout).trim()) return null;
	try {
		const value = JSON.parse(String(result.stdout));
		if (value?.version !== 1 || typeof value.files !== "object" || value.files === null) return null;
		for (const [relativePath, metadata] of Object.entries(value.files)) {
			if (!isSafeRelativePath(relativePath)
				|| typeof metadata?.sha256 !== "string"
				|| !/^[a-f0-9]{64}$/u.test(metadata.sha256)) return null;
		}
		return value;
	} catch {
		return null;
	}
}

function ensureDeviceManifest(adb) {
	let manifest = readDeviceManifest(adb);
	if (manifest !== null) return manifest;
	adb(["shell", "am", "start", "-n", `${packageName}/.MainActivity`]);
	adb(["shell", "sleep", "1"]);
	manifest = readDeviceManifest(adb);
	return manifest;
}

function shellQuote(value) {
	return `'${String(value).replace(/'/gu, `'\\''`)}'`;
}

function prepareStage(changedPaths, manifest) {
	const expectedPrefix = `${path.resolve(toolchainDir)}${path.sep}`;
	if (!path.resolve(syncWorkDir).startsWith(expectedPrefix)) {
		throw new Error("Android sync staging directory escaped .android-toolchain");
	}
	rmSync(syncWorkDir, { recursive: true, force: true });
	const payloadDir = path.join(syncWorkDir, "payload");
	mkdirSync(payloadDir, { recursive: true });
	for (const relativePath of changedPaths) {
		const source = path.join(generatedAssetsDir, ...relativePath.split("/"));
		const destination = path.join(payloadDir, ...relativePath.split("/"));
		mkdirSync(path.dirname(destination), { recursive: true });
		copyFileSync(source, destination);
	}
	writeFileSync(path.join(syncWorkDir, "manifest.json"), JSON.stringify(manifest), "utf8");
}

function removeStaleAssets(adb, removedPaths) {
	for (let offset = 0; offset < removedPaths.length; offset += 40) {
		const chunk = removedPaths.slice(offset, offset + 40);
		const command = ["set -e", ...chunk.map((relativePath) => (
			`rm -f ${shellQuote(`files/dev-ui/${relativePath}`)}`
		))].join("; ");
		adb(["exec-out", "run-as", packageName, "sh", "-c", command]);
	}
}

function restartApp(adb) {
	adb(["shell", "am", "force-stop", packageName]);
	adb(["shell", "am", "start", "-n", `${packageName}/.MainActivity`]);
}

function synchronize(adb, restart) {
	const manifest = createManifest();
	const previous = ensureDeviceManifest(adb);
	const { changedPaths, removedPaths } = diffManifests(manifest, previous);

	if (changedPaths.length === 0 && removedPaths.length === 0) {
		console.log(`[android-sync] ${manifest.revision.slice(0, 12)} already matches the device baseline.`);
		return;
	}

	prepareStage(changedPaths, manifest);
	if (!/^\/data\/local\/tmp\/daedalus-remote-ui-sync-[0-9]+$/u.test(remoteStage)) {
		throw new Error("Unsafe Android remote staging path");
	}
	adb(["shell", "rm", "-rf", remoteStage]);
	try {
		adb(["shell", "mkdir", "-p", remoteStage]);
		if (changedPaths.length > 0) {
			adb(["push", path.join(syncWorkDir, "payload"), `${remoteStage}/payload`]);
		}
		adb(["push", path.join(syncWorkDir, "manifest.json"), `${remoteStage}/manifest.json`]);
		adb([
			"exec-out",
			"run-as",
			packageName,
			"sh",
			"-c",
			[
				"set -e",
				"mkdir -p files/dev-ui",
				"rm -f files/dev-ui/.complete",
				changedPaths.length > 0
					? `cp -R ${shellQuote(`${remoteStage}/payload/.`)} files/dev-ui/`
					: "true",
			].join("; "),
		]);
		removeStaleAssets(adb, removedPaths);
		adb([
			"exec-out",
			"run-as",
			packageName,
			"sh",
			"-c",
			[
				"set -e",
				`cp ${shellQuote(`${remoteStage}/manifest.json`)} files/dev-ui.manifest.json`,
				`printf '%s\\n' ${shellQuote(manifest.revision)} > files/dev-ui/.complete.next`,
				"mv files/dev-ui/.complete.next files/dev-ui/.complete",
			].join("; "),
		]);
	} finally {
		adb(["shell", "rm", "-rf", remoteStage], { allowFailure: true });
		rmSync(syncWorkDir, { recursive: true, force: true });
	}

	const transferredBytes = changedPaths.reduce(
		(total, relativePath) => total + manifest.files[relativePath].size,
		0,
	);
	console.log(
		`[android-sync] Activated ${manifest.revision.slice(0, 12)}: `
			+ `${changedPaths.length} changed, ${removedPaths.length} removed, `
			+ `${(transferredBytes / 1024 / 1024).toFixed(1)} MiB transferred.`,
	);
	if (restart) restartApp(adb);
}

function clearSynchronizedAssets(adb, restart) {
	adb([
		"exec-out",
		"run-as",
		packageName,
		"rm",
		"-rf",
		"files/dev-ui",
		"files/dev-ui.manifest.json",
		"files/dev-ui.packaged-manifest.json",
	]);
	console.log("[android-sync] Removed synchronized assets; APK-bundled UI will be used.");
	if (restart) restartApp(adb);
}

function isSuccessfulBuildLine(line) {
	return /(?:^|\s)(?:[✓✔]\s*)?built in\s+\d+(?:\.\d+)?\s*(?:ms|s)\.?\s*$/iu
		.test(line.trim());
}

function startWatch(adb, restart) {
	const invocation = npmInvocation(["run", "build:android:web", "--", "--watch"]);
	const child = spawn(invocation.command, invocation.args, {
		cwd: repositoryDir,
		env: process.env,
		stdio: ["inherit", "pipe", "pipe"],
		shell: false,
	});
	const lineBuffers = { stdout: "", stderr: "" };
	let syncTimer;
	const consume = (chunk, destination, stream) => {
		destination.write(chunk);
		lineBuffers[stream] += chunk.toString("utf8").replace(/\u001b\[[0-9;]*m/gu, "");
		const lines = lineBuffers[stream].split(/\r?\n/u);
		lineBuffers[stream] = lines.pop() || "";
		for (const line of lines) {
			if (!isSuccessfulBuildLine(line)) continue;
			clearTimeout(syncTimer);
			syncTimer = setTimeout(() => {
				console.log("[android-sync] Web build completed; synchronizing changed assets...");
				try {
					synchronize(adb, restart);
				} catch (error) {
					console.error(`[android-sync] ${error instanceof Error ? error.message : String(error)}`);
				}
			}, 100);
		}
	};
	child.stdout.on("data", (chunk) => consume(chunk, process.stdout, "stdout"));
	child.stderr.on("data", (chunk) => consume(chunk, process.stderr, "stderr"));
	child.on("error", (error) => {
		console.error(`[android-sync] Failed to start Vite watch: ${error.message}`);
		process.exitCode = 1;
	});
	child.on("exit", (code) => {
		if (code !== 0 && code !== null) process.exitCode = code;
	});
	let stopping = false;
	const stop = () => {
		if (stopping) return;
		stopping = true;
		clearTimeout(syncTimer);
		if (process.platform === "win32" && child.pid !== undefined) {
			const terminated = spawnSync(
				"taskkill",
				["/PID", String(child.pid), "/T", "/F"],
				{ stdio: "ignore", shell: false },
			);
			if ((terminated.status ?? 1) !== 0) child.kill();
			process.exit(0);
		}
		child.kill("SIGTERM");
		const forceExitTimer = setTimeout(() => {
			child.kill("SIGKILL");
			process.exit(0);
		}, 2_000);
		child.once("exit", () => {
			clearTimeout(forceExitTimer);
			process.exit(0);
		});
	};
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
	console.log("[android-sync] Watching Android Remote UI. Press Ctrl+C to stop.");
}

function main() {
	const options = parseArguments(process.argv.slice(2));
	if (options.help) {
		printHelp();
		return;
	}
	const adbPath = resolveAdb();
	const serial = selectDevice(adbPath, options.serial);
	const adb = createAdb(adbPath, serial);
	assertDebugPackage(adb);
	console.log(`[android-sync] Target device: ${serial}`);
	if (options.clear) {
		clearSynchronizedAssets(adb, options.restart);
		return;
	}
	if (options.watch) {
		startWatch(adb, options.restart);
		return;
	}
	runNpm(["run", "build:android:web"]);
	synchronize(adb, options.restart);
}

if (require.main === module) {
	try {
		main();
	} catch (error) {
		console.error(`[android-sync] ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
}

module.exports = {
	diffManifests,
	isSafeRelativePath,
	isSuccessfulBuildLine,
	parseArguments,
};
