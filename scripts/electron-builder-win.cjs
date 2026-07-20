const { existsSync, readdirSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawn } = require("node:child_process");

function compareVersion(left, right) {
	const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
	const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
	const length = Math.max(leftParts.length, rightParts.length);
	for (let index = 0; index < length; index += 1) {
		const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (delta !== 0) {
			return delta;
		}
	}
	return 0;
}

function getVisualStudioRoots() {
	const roots = [];
	const programFiles = process.env.ProgramFiles || "C:\\Program Files";
	for (const major of ["18", "17", "2022"]) {
		for (const edition of ["Community", "Professional", "Enterprise", "BuildTools"]) {
			roots.push(join(programFiles, "Microsoft Visual Studio", major, edition, "VC", "Tools", "MSVC"));
		}
	}
	return roots;
}

function findSpectreMsvcVersion() {
	const candidates = [];
	for (const root of getVisualStudioRoots()) {
		if (!existsSync(root)) {
			continue;
		}
		for (const entry of readdirSync(root, { withFileTypes: true })) {
			if (!entry.isDirectory()) {
				continue;
			}
			const version = entry.name;
			const versionRoot = join(root, version);
			if (existsSync(join(versionRoot, "lib", "spectre", "x64")) && existsSync(join(versionRoot, "lib", "spectre", "x86"))) {
				candidates.push(version);
			}
		}
	}
	return candidates.sort(compareVersion).at(-1) ?? null;
}

function cleanWinUnpacked(projectRoot) {
	const releaseRoot = resolve(projectRoot, "release");
	const winUnpackedRoot = resolve(releaseRoot, "win-unpacked");
	if (!existsSync(winUnpackedRoot)) {
		return;
	}
	if (!winUnpackedRoot.startsWith(`${releaseRoot}\\`) && winUnpackedRoot !== releaseRoot) {
		throw new Error(`Refusing to clean unexpected output path: ${winUnpackedRoot}`);
	}
	rmSync(winUnpackedRoot, {
		force: true,
		maxRetries: 8,
		recursive: true,
		retryDelay: 750
	});
}

const childEnv = { ...process.env };
if (process.platform === "win32" && !childEnv.VCToolsVersion) {
	const spectreVersion = findSpectreMsvcVersion();
	if (spectreVersion !== null) {
		childEnv.VCToolsVersion = spectreVersion;
		console.log(`[electron-builder-win] using VCToolsVersion=${spectreVersion}`);
	}
}

const projectRoot = join(__dirname, "..");
cleanWinUnpacked(projectRoot);

const electronBuilderCli = join(__dirname, "..", "node_modules", "electron-builder", "cli.js");
const child = spawn(process.execPath, [electronBuilderCli, "--win", ...process.argv.slice(2)], {
	cwd: projectRoot,
	env: childEnv,
	stdio: "inherit",
	shell: false
});

child.on("close", (code) => {
	process.exit(code || 0);
});
