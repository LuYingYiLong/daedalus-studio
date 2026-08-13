const {
	copyFileSync,
	createReadStream,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} = require("node:fs");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { dirname, join, resolve, sep } = require("node:path");

const projectRoot = resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const version = process.env.BACKEND_BOOTSTRAP_VERSION || packageJson.backendBootstrapVersion;
const targetDir = join(projectRoot, "build", "backend-bootstrap");
const manifestName = "backend-manifest.json";
const executableName = "daedalus-backend.exe";
const releaseManifestName = "daedalus-backend-win32-x64.json";
const releaseBaseUrl = "https://github.com/LuYingYiLong/daedalus-backend/releases";
const maxArchiveBytes = 256 * 1024 * 1024;
const expectedNodeVersion = "24.18.0";
const siblingBackendRoot = resolve(projectRoot, "..", "daedalus-backend");

function fail(message) {
	throw new Error(`[prepare-backend-bootstrap] ${message}`);
}

function assertProtocolVersion(value, fieldName) {
	if (!Number.isSafeInteger(value) || value <= 0) {
		fail(`package.json ${fieldName} must be a positive integer.`);
	}
	return value;
}

const expectedProtocolVersion = assertProtocolVersion(
	packageJson.backendProtocolVersion,
	"backendProtocolVersion"
);
const expectedBridgeProtocolVersion = assertProtocolVersion(
	packageJson.godotBridgeProtocolVersion,
	"godotBridgeProtocolVersion"
);

function assertVersion(value) {
	if (typeof value !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) {
		fail("BACKEND_BOOTSTRAP_VERSION must be a fixed semantic version.");
	}
	return value;
}

function validateBackendSource(sourceRoot, sourceKind) {
	const packagePath = join(sourceRoot, "package.json");
	const buildScriptPath = join(sourceRoot, "scripts", "build-windows-sea.ts");
	if (!existsSync(packagePath) || !existsSync(buildScriptPath)) {
		fail(`${sourceKind} is not a Daedalus Backend source repository: ${sourceRoot}`);
	}
	const sourceManifest = JSON.parse(readFileSync(packagePath, "utf8"));
	if (sourceManifest.name !== "daedalus-backend" || sourceManifest.version !== version) {
		fail(
			`${sourceKind} must contain daedalus-backend ${version}, found ${String(sourceManifest.name)} ${String(sourceManifest.version)}.`
		);
	}
	return sourceRoot;
}

function resolveBackendSource() {
	if (existsSync(siblingBackendRoot)) {
		return validateBackendSource(siblingBackendRoot, "Sibling backend repository");
	}
	const configuredSource = process.env.DAEDALUS_BACKEND_SOURCE;
	if (typeof configuredSource === "string" && configuredSource.trim().length > 0) {
		return validateBackendSource(resolve(configuredSource), "DAEDALUS_BACKEND_SOURCE");
	}
	return null;
}

function compareVersions(left, right) {
	const leftParts = assertVersion(left).split(/[+-]/)[0].split(".").map(Number);
	const rightParts = assertVersion(right).split(/[+-]/)[0].split(".").map(Number);
	for (let index = 0; index < 3; index += 1) {
		if (leftParts[index] !== rightParts[index]) {
			return leftParts[index] > rightParts[index] ? 1 : -1;
		}
	}
	return 0;
}

function assertPayloadManifest(manifest) {
	if (
		manifest.schemaVersion !== 1
		|| manifest.version !== version
		|| typeof manifest.buildId !== "string"
		|| manifest.buildId.length === 0
		|| manifest.platform !== "win32"
		|| manifest.arch !== "x64"
		|| manifest.nodeVersion !== expectedNodeVersion
		|| manifest.protocolVersion !== expectedProtocolVersion
		|| !Number.isSafeInteger(manifest.minBridgeProtocolVersion)
		|| !Number.isSafeInteger(manifest.maxBridgeProtocolVersion)
		|| manifest.minBridgeProtocolVersion > expectedBridgeProtocolVersion
		|| manifest.maxBridgeProtocolVersion < expectedBridgeProtocolVersion
		|| typeof manifest.minStudioVersion !== "string"
		|| compareVersions(packageJson.version, manifest.minStudioVersion) < 0
		|| typeof manifest.publishedAt !== "string"
		|| Number.isNaN(Date.parse(manifest.publishedAt))
		|| (manifest.authenticode !== "signed" && manifest.authenticode !== "unsigned")
		|| manifest.executable?.fileName !== executableName
		|| !Number.isSafeInteger(manifest.executable?.size)
		|| manifest.executable.size <= 0
		|| !/^[a-f0-9]{64}$/.test(manifest.executable?.sha256)
	) {
		fail("Backend payload manifest is invalid or incompatible with this Studio build.");
	}
}

function payloadManifestFieldsMatch(left, right) {
	return left.schemaVersion === right.schemaVersion
		&& left.version === right.version
		&& left.buildId === right.buildId
		&& left.platform === right.platform
		&& left.arch === right.arch
		&& left.nodeVersion === right.nodeVersion
		&& left.protocolVersion === right.protocolVersion
		&& left.minBridgeProtocolVersion === right.minBridgeProtocolVersion
		&& left.maxBridgeProtocolVersion === right.maxBridgeProtocolVersion
		&& left.minStudioVersion === right.minStudioVersion
		&& left.publishedAt === right.publishedAt
		&& left.authenticode === right.authenticode
		&& JSON.stringify(left.executable) === JSON.stringify(right.executable);
}

function assertInside(parentDir, childPath) {
	const parent = resolve(parentDir);
	const child = resolve(childPath);
	if (child !== parent && !child.startsWith(`${parent}${sep}`)) {
		fail(`Refusing to write outside ${parent}.`);
	}
	return child;
}

function sha256File(filePath) {
	const hash = createHash("sha256");
	const fd = require("node:fs").openSync(filePath, "r");
	const buffer = Buffer.allocUnsafe(1024 * 1024);
	try {
		while (true) {
			const count = require("node:fs").readSync(fd, buffer, 0, buffer.length, null);
			if (count === 0) {
				break;
			}
			hash.update(buffer.subarray(0, count));
		}
	} finally {
		require("node:fs").closeSync(fd);
	}
	return hash.digest("hex");
}

function readPayloadManifest(payloadDir) {
	const manifestPath = join(payloadDir, manifestName);
	const executablePath = join(payloadDir, executableName);
	if (!existsSync(manifestPath) || !existsSync(executablePath)) {
		fail(`Backend payload is incomplete at ${payloadDir}.`);
	}
	const manifestBytes = readFileSync(manifestPath);
	const manifest = JSON.parse(manifestBytes.toString("utf8"));
	assertPayloadManifest(manifest);
	const executableStat = statSync(executablePath);
	if (
		executableStat.size !== manifest.executable.size
		|| sha256File(executablePath) !== manifest.executable.sha256
	) {
		fail("Backend payload executable failed size or SHA-256 verification.");
	}
	return { manifest, manifestBytes, manifestPath, executablePath };
}

function installPayload(payloadDir) {
	const payload = readPayloadManifest(payloadDir);
	const tempDir = assertInside(dirname(targetDir), `${targetDir}.${process.pid}.staging`);
	rmSync(tempDir, { recursive: true, force: true });
	mkdirSync(tempDir, { recursive: true });
	copyFileSync(payload.executablePath, join(tempDir, executableName));
	writeFileSync(join(tempDir, manifestName), payload.manifestBytes);
	rmSync(targetDir, { recursive: true, force: true });
	renameSync(tempDir, targetDir);
	console.log(
		`[prepare-backend-bootstrap] prepared backend ${payload.manifest.version} (${payload.manifest.buildId})`
	);
}

function buildSourcePayload(sourceRoot) {
	const buildCommand = process.platform === "win32"
		? process.env.ComSpec || "cmd.exe"
		: "npm";
	const buildArguments = process.platform === "win32"
		? ["/d", "/s", "/c", "npm", "run", "release:sea:win"]
		: ["run", "release:sea:win"];
	console.log(`[prepare-backend-bootstrap] building backend from ${sourceRoot}`);
	const result = spawnSync(
		buildCommand,
		buildArguments,
		{
			cwd: sourceRoot,
			encoding: "utf8",
			env: process.env,
			maxBuffer: 32 * 1024 * 1024,
			windowsHide: true
		}
	);
	if (result.error !== undefined || result.status !== 0) {
		fail(
			result.stderr?.trim()
				|| result.stdout?.trim()
				|| result.error?.message
				|| `Backend source build exited with ${String(result.status)}.`
		);
	}
	const payloadDir = join(sourceRoot, "dist", "sea-win32-x64", "work", "payload");
	readPayloadManifest(payloadDir);
	return payloadDir;
}

async function download(url, targetPath, maxBytes) {
	const response = await fetch(url, {
		redirect: "follow",
		headers: { "User-Agent": "Daedalus-Studio-Build" }
	});
	if (!response.ok || response.body === null) {
		fail(`Cannot download ${url}, status ${response.status}.`);
	}
	const reader = response.body.getReader();
	const chunks = [];
	let total = 0;
	while (true) {
		const chunk = await reader.read();
		if (chunk.done) {
			break;
		}
		total += chunk.value.byteLength;
		if (total > maxBytes) {
			fail(`Download exceeds ${maxBytes} bytes.`);
		}
		chunks.push(Buffer.from(chunk.value));
	}
	const bytes = Buffer.concat(chunks);
	mkdirSync(dirname(targetPath), { recursive: true });
	writeFileSync(targetPath, bytes);
	return bytes;
}

function extractArchive(archivePath, destinationDir) {
	const script = [
		"$ErrorActionPreference = 'Stop'",
		"Add-Type -AssemblyName System.IO.Compression.FileSystem",
		"$archive = [System.IO.Compression.ZipFile]::OpenRead($env:DAEDALUS_ARCHIVE_PATH)",
		"try {",
		"  $allowed = @('daedalus-backend.exe', 'backend-manifest.json')",
		"  $seen = @{}",
		"  foreach ($entry in $archive.Entries) {",
		"    if ($entry.FullName -notin $allowed -or $seen.ContainsKey($entry.FullName)) {",
		"      throw \"Unexpected or duplicate archive entry: $($entry.FullName)\"",
		"    }",
		"    $seen[$entry.FullName] = $true",
		"    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $env:DAEDALUS_EXTRACT_DIR $entry.FullName), $false)",
		"  }",
		"  foreach ($required in $allowed) { if (-not $seen.ContainsKey($required)) { throw \"Missing archive entry: $required\" } }",
		"} finally { $archive.Dispose() }"
	].join("\n");
	const result = spawnSync(
		"powershell.exe",
		["-NoProfile", "-NonInteractive", "-Command", script],
		{
			env: {
				...process.env,
				DAEDALUS_ARCHIVE_PATH: archivePath,
				DAEDALUS_EXTRACT_DIR: destinationDir
			},
			encoding: "utf8",
			windowsHide: true
		}
	);
	if (result.status !== 0) {
		fail(result.stderr.trim() || result.stdout.trim() || "Failed to extract backend archive.");
	}
}

async function downloadReleasePayload() {
	const downloadRoot = join(projectRoot, ".cache", "backend-bootstrap", version);
	const releaseManifestUrl = `${releaseBaseUrl}/download/v${encodeURIComponent(version)}/${releaseManifestName}`;
	const releaseManifestBytes = await download(
		releaseManifestUrl,
		join(downloadRoot, releaseManifestName),
		1024 * 1024
	);
	const releaseManifest = JSON.parse(releaseManifestBytes.toString("utf8"));
	assertPayloadManifest(releaseManifest);
	if (
		releaseManifest.archive?.fileName !== "daedalus-backend-win32-x64.zip"
		|| !Number.isSafeInteger(releaseManifest.archive?.size)
		|| releaseManifest.archive.size <= 0
		|| releaseManifest.archive.size > maxArchiveBytes
		|| !/^[a-f0-9]{64}$/.test(releaseManifest.archive?.sha256)
		|| !/^[a-f0-9]{64}$/.test(releaseManifest.payloadManifestSha256)
	) {
		fail("Backend release manifest is invalid.");
	}
	const archivePath = join(downloadRoot, releaseManifest.archive.fileName);
	await download(
		`${releaseBaseUrl}/download/v${encodeURIComponent(version)}/${releaseManifest.archive.fileName}`,
		archivePath,
		maxArchiveBytes
	);
	if (
		statSync(archivePath).size !== releaseManifest.archive.size
		|| sha256File(archivePath) !== releaseManifest.archive.sha256
	) {
		fail("Backend release archive failed size or SHA-256 verification.");
	}
	const extractedDir = join(downloadRoot, "payload");
	rmSync(extractedDir, { recursive: true, force: true });
	mkdirSync(extractedDir, { recursive: true });
	extractArchive(archivePath, extractedDir);
	if (
		createHash("sha256").update(readFileSync(join(extractedDir, manifestName))).digest("hex")
		!== releaseManifest.payloadManifestSha256
	) {
		fail("Backend payload manifest failed SHA-256 verification.");
	}
	const payload = readPayloadManifest(extractedDir);
	if (!payloadManifestFieldsMatch(payload.manifest, releaseManifest)) {
		fail("Backend release and payload manifests describe different binaries.");
	}
	return extractedDir;
}

async function main() {
	assertVersion(version);
	const backendSource = resolveBackendSource();
	if (backendSource !== null) {
		installPayload(buildSourcePayload(backendSource));
		return;
	}
	const override = process.env.DAEDALUS_BACKEND_BOOTSTRAP_DIR;
	if (typeof override === "string" && override.trim().length > 0) {
		installPayload(resolve(override));
		return;
	}
	if (existsSync(targetDir)) {
		try {
			installPayload(targetDir);
			return;
		} catch {
			// Refresh an incomplete or stale local cache from the fixed release.
		}
	}
	installPayload(await downloadReleasePayload());
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
