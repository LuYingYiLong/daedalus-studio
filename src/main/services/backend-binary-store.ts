import { app, net } from "electron";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import {
	copyFile,
	mkdir,
	open,
	readFile,
	rename,
	rm,
	stat,
	writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import {
	assertBackendManifestCompatible,
	parseBackendPayloadManifest,
	parseBackendReleaseManifest,
	payloadManifestsMatch,
	type BackendPayloadManifestV1,
	type BackendReleaseManifestV1
} from "./backend-binary-manifest";

const BACKEND_RELEASE_BASE_URL: string =
	"https://github.com/LuYingYiLong/daedalus-backend/releases";
const RELEASE_MANIFEST_FILE_NAME: string = "daedalus-backend-win32-x64.json";
const PAYLOAD_MANIFEST_FILE_NAME: string = "backend-manifest.json";
const EXECUTABLE_FILE_NAME: string = "daedalus-backend.exe";
const SANDBOX_HELPER_FILE_NAME: string = "daedalus-windows-sandbox-helper.exe";
const MAX_MANIFEST_BYTES: number = 1024 * 1024;
const MAX_ARCHIVE_BYTES: number = 256 * 1024 * 1024;
const SELF_TEST_TIMEOUT_MS: number = 30000;

export type BackendDistribution = "binary";

export type BackendCurrentFileV2 = {
	schemaVersion: 2;
	distribution: BackendDistribution;
	version: string;
	executablePath: string;
	manifestPath: string;
	protocolVersion: number;
	updatedAt: string;
	previousVersion?: string;
};

export type BackendPendingUpdateV1 = {
	schemaVersion: 1;
	createdAt: string;
	candidate: BackendCurrentFileV2;
	previous: BackendCurrentFileV2 | null;
};

export type InstalledBackendBinary = {
	version: string;
	versionDir: string;
	executablePath: string;
	sandboxHelperPath: string;
	manifestPath: string;
	manifest: BackendPayloadManifestV1;
};

type CommandResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
};

function getStudioVersion(): string {
	return typeof app?.getVersion === "function" ? app.getVersion() : "0.0.0";
}

export function getDaedalusDir(): string {
	return join(process.env.USERPROFILE ?? homedir(), ".daedalus");
}

export function getBackendRootDir(): string {
	return join(getDaedalusDir(), "backend");
}

export function getManagedBackendVersionsDir(): string {
	return join(getBackendRootDir(), "versions");
}

export function getManagedBackendCurrentPath(): string {
	return join(getBackendRootDir(), "current.json");
}

export function getBackendPendingUpdatePath(): string {
	return join(getBackendRootDir(), "pending-update.json");
}

export function getBundledBackendDir(): string {
	const override: string | undefined = process.env.DAEDALUS_BACKEND_BUNDLE_DIR;
	if (override !== undefined && override.trim().length > 0) {
		return resolve(override);
	}
	const resourcesPath: string = typeof process.resourcesPath === "string"
		? process.resourcesPath
		: app.getAppPath();
	return join(resourcesPath, "backend-bootstrap");
}

export function assertInside(parentDir: string, childPath: string): string {
	const resolvedParent: string = resolve(parentDir);
	const resolvedChild: string = resolve(childPath);
	if (resolvedChild !== resolvedParent && !resolvedChild.startsWith(`${resolvedParent}${sep}`)) {
		throw new Error(`Refusing to operate outside managed backend directory: ${resolvedChild}`);
	}
	return resolvedChild;
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
	try {
		return JSON.parse(await readFile(filePath, "utf8")) as unknown;
	} catch {
		return null;
	}
}

async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	const tempPath: string = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tempPath, filePath);
}

function parseCurrentFile(value: unknown): BackendCurrentFileV2 | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const record = value as Record<string, unknown>;
	if (
		record.schemaVersion !== 2
		|| record.distribution !== "binary"
		|| typeof record.version !== "string"
		|| typeof record.executablePath !== "string"
		|| typeof record.manifestPath !== "string"
		|| typeof record.protocolVersion !== "number"
		|| typeof record.updatedAt !== "string"
	) {
		return null;
	}
	if (record.previousVersion !== undefined && typeof record.previousVersion !== "string") {
		return null;
	}
	const versionsDir: string = getManagedBackendVersionsDir();
	if (
		!isInside(versionsDir, record.executablePath)
		|| !isInside(versionsDir, record.manifestPath)
	) {
		return null;
	}
	return {
		schemaVersion: 2,
		distribution: "binary",
		version: record.version,
		executablePath: resolve(record.executablePath),
		manifestPath: resolve(record.manifestPath),
		protocolVersion: record.protocolVersion,
		updatedAt: record.updatedAt,
		...(typeof record.previousVersion === "string"
			? { previousVersion: record.previousVersion }
			: {})
	};
}

function isInside(parentDir: string, childPath: string): boolean {
	const resolvedParent: string = resolve(parentDir);
	const resolvedChild: string = resolve(childPath);
	return resolvedChild === resolvedParent || resolvedChild.startsWith(`${resolvedParent}${sep}`);
}

export async function readCurrentBackendFile(): Promise<BackendCurrentFileV2 | null> {
	return parseCurrentFile(await readJsonFile(getManagedBackendCurrentPath()));
}

export async function hasLegacyBackendMarker(): Promise<boolean> {
	const value: unknown | null = await readJsonFile(getManagedBackendCurrentPath());
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return record.schemaVersion === undefined
		&& typeof record.version === "string"
		&& typeof record.path === "string";
}

function parsePendingFile(value: unknown): BackendPendingUpdateV1 | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const record = value as Record<string, unknown>;
	const candidate: BackendCurrentFileV2 | null = parseCurrentFile(record.candidate);
	const previous: BackendCurrentFileV2 | null = record.previous === null
		? null
		: parseCurrentFile(record.previous);
	if (
		record.schemaVersion !== 1
		|| typeof record.createdAt !== "string"
		|| candidate === null
		|| (record.previous !== null && previous === null)
	) {
		return null;
	}
	return {
		schemaVersion: 1,
		createdAt: record.createdAt,
		candidate,
		previous
	};
}

export async function readPendingBackendUpdate(): Promise<BackendPendingUpdateV1 | null> {
	return parsePendingFile(await readJsonFile(getBackendPendingUpdatePath()));
}

export async function sha256File(filePath: string): Promise<string> {
	return await new Promise<string>((resolveHash, rejectHash): void => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("data", (chunk: Buffer): void => {
			hash.update(chunk);
		});
		stream.on("error", rejectHash);
		stream.on("end", (): void => {
			resolveHash(hash.digest("hex"));
		});
	});
}

async function verifyFile(
	filePath: string,
	expectedSize: number,
	expectedSha256: string,
	label: string
): Promise<void> {
	const fileStat = await stat(filePath);
	if (!fileStat.isFile() || fileStat.size !== expectedSize) {
		throw new Error(`${label} size does not match its manifest.`);
	}
	const digest: string = await sha256File(filePath);
	if (digest !== expectedSha256) {
		throw new Error(`${label} SHA-256 does not match its manifest.`);
	}
}

async function runCommand(
	command: string,
	args: readonly string[],
	options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<CommandResult> {
	return await new Promise<CommandResult>((resolveCommand): void => {
		const child = spawn(command, [...args], {
			env: options.env ?? process.env,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"]
		});
		let stdout: string = "";
		let stderr: string = "";
		let settled: boolean = false;
		let timedOut: boolean = false;
		const timeout = options.timeoutMs === undefined
			? null
			: setTimeout((): void => {
				timedOut = true;
				child.kill();
			}, options.timeoutMs);
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string): void => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string): void => {
			stderr += chunk;
		});
		const finish = (result: CommandResult): void => {
			if (settled) {
				return;
			}
			settled = true;
			if (timeout !== null) {
				clearTimeout(timeout);
			}
			resolveCommand(result);
		};
		child.on("error", (error: Error): void => {
			finish({ exitCode: 1, stdout, stderr: `${stderr}${error.message}`, timedOut });
		});
		child.on("exit", (code: number | null): void => {
			finish({ exitCode: code ?? 1, stdout, stderr, timedOut });
		});
	});
}

function parseLastJsonObject(text: string): Record<string, unknown> {
	const lines: string[] = text
		.split(/\r?\n/u)
		.map((line: string): string => line.trim())
		.filter((line: string): boolean => line.length > 0);
	for (let index: number = lines.length - 1; index >= 0; index -= 1) {
		try {
			const value: unknown = JSON.parse(lines[index]!);
			if (typeof value === "object" && value !== null && !Array.isArray(value)) {
				return value as Record<string, unknown>;
			}
		} catch {
			// Continue looking for the structured CLI response.
		}
	}
	throw new Error("Backend command did not return a JSON result.");
}

export function assertBackendSelfTestResponse(
	response: Record<string, unknown>,
	installed: InstalledBackendBinary
): void {
	const build: Record<string, unknown> =
		typeof response.build === "object"
			&& response.build !== null
			&& !Array.isArray(response.build)
			? response.build as Record<string, unknown>
			: {};
	const checks: unknown[] = Array.isArray(response.checks) ? response.checks : [];
	const passedCheckNames: Set<string> = new Set(
		checks.flatMap((check: unknown): string[] => {
			if (typeof check !== "object" || check === null || Array.isArray(check)) {
				return [];
			}
			const record = check as Record<string, unknown>;
			return record.ok === true && typeof record.name === "string"
				? [record.name]
				: [];
		})
	);
	if (
		response.ok !== true
		|| build.version !== installed.version
		|| build.buildId !== installed.manifest.buildId
		|| build.buildNodeVersion !== installed.manifest.nodeVersion
		|| build.runtimeNodeVersion !== installed.manifest.nodeVersion
		|| build.distribution !== "sea"
		|| build.platform !== installed.manifest.platform
		|| build.arch !== installed.manifest.arch
		|| build.protocolVersion !== installed.manifest.protocolVersion
		|| !passedCheckNames.has("runtime-assets")
		|| !passedCheckNames.has("sqlite")
		|| !passedCheckNames.has("secret-store")
	) {
		throw new Error(`Backend ${installed.version} returned an invalid self-test result.`);
	}
}

export async function runBackendSelfTest(installed: InstalledBackendBinary): Promise<void> {
	const result: CommandResult = await runCommand(
		installed.executablePath,
		["self-test", "--json"],
		{
			env: {
				...process.env,
				DAEDALUS_BACKEND_EXPECTED_VERSION: installed.version
			},
			timeoutMs: SELF_TEST_TIMEOUT_MS
		}
	);
	if (result.exitCode !== 0) {
		throw new Error(
			result.timedOut
				? `Backend ${installed.version} self-test timed out.`
				: result.stderr.trim() || result.stdout.trim() || `Backend ${installed.version} self-test failed.`
		);
	}
	assertBackendSelfTestResponse(parseLastJsonObject(result.stdout), installed);
}

export async function inspectInstalledBackend(versionDir: string): Promise<InstalledBackendBinary> {
	const safeVersionDir: string = assertInside(getManagedBackendVersionsDir(), versionDir);
	const manifestPath: string = join(safeVersionDir, PAYLOAD_MANIFEST_FILE_NAME);
	const executablePath: string = join(safeVersionDir, EXECUTABLE_FILE_NAME);
	const sandboxHelperPath: string = join(safeVersionDir, SANDBOX_HELPER_FILE_NAME);
	const manifest: BackendPayloadManifestV1 = parseBackendPayloadManifest(
		JSON.parse(await readFile(manifestPath, "utf8")) as unknown
	);
	assertBackendManifestCompatible(manifest, getStudioVersion());
	if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
		throw new Error(
			`Backend ${manifest.version} targets ${manifest.platform}/${manifest.arch}, not ${process.platform}/${process.arch}.`
		);
	}
	await verifyFile(
		executablePath,
		manifest.executable.size,
		manifest.executable.sha256,
		"Backend executable"
	);
	await verifyFile(
		sandboxHelperPath,
		manifest.sandboxHelper.size,
		manifest.sandboxHelper.sha256,
		"Backend Windows sandbox helper"
	);
	return {
		version: manifest.version,
		versionDir: safeVersionDir,
		executablePath,
		sandboxHelperPath,
		manifestPath,
		manifest
	};
}

export async function inspectCurrentBackend(): Promise<InstalledBackendBinary | null> {
	const current: BackendCurrentFileV2 | null = await readCurrentBackendFile();
	if (current === null) {
		return null;
	}
	const installed: InstalledBackendBinary = await inspectInstalledBackend(
		dirname(current.executablePath)
	);
	if (
		installed.version !== current.version
		|| installed.executablePath !== current.executablePath
		|| installed.manifestPath !== current.manifestPath
		|| installed.manifest.protocolVersion !== current.protocolVersion
	) {
		throw new Error("The active backend marker does not match the installed backend payload.");
	}
	return installed;
}

export async function inspectBundledBackend(): Promise<InstalledBackendBinary> {
	const bundleDir: string = getBundledBackendDir();
	const manifestPath: string = join(bundleDir, PAYLOAD_MANIFEST_FILE_NAME);
	const executablePath: string = join(bundleDir, EXECUTABLE_FILE_NAME);
	const sandboxHelperPath: string = join(bundleDir, SANDBOX_HELPER_FILE_NAME);
	const manifest: BackendPayloadManifestV1 = parseBackendPayloadManifest(
		JSON.parse(await readFile(manifestPath, "utf8")) as unknown
	);
	assertBackendManifestCompatible(manifest, getStudioVersion());
	if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
		throw new Error(
			`Bundled backend targets ${manifest.platform}/${manifest.arch}, not ${process.platform}/${process.arch}.`
		);
	}
	await verifyFile(
		executablePath,
		manifest.executable.size,
		manifest.executable.sha256,
		"Bundled backend executable"
	);
	await verifyFile(
		sandboxHelperPath,
		manifest.sandboxHelper.size,
		manifest.sandboxHelper.sha256,
		"Bundled Windows sandbox helper"
	);
	return {
		version: manifest.version,
		versionDir: bundleDir,
		executablePath,
		sandboxHelperPath,
		manifestPath,
		manifest
	};
}

async function fetchChecked(url: string): Promise<Response> {
	// Backend updates run inside Electron, so use Chromium's network stack. It
	// honors the OS certificate store and configured proxy instead of relying on
	// Node's bundled CA set, which can reject valid enterprise TLS interception.
	const updateFetch: typeof globalThis.fetch = typeof net?.fetch === "function"
		? net.fetch.bind(net) as typeof globalThis.fetch
		: globalThis.fetch;
	const response: Response = await updateFetch(url, {
		redirect: "follow",
		headers: {
			"Accept": "application/octet-stream, application/json",
			"User-Agent": "Daedalus-Studio"
		}
	});
	if (!response.ok) {
		throw new Error(`Cannot download "${url}", status ${response.status}.`);
	}
	return response;
}

async function fetchJson(url: string, maxBytes: number): Promise<unknown> {
	const response: Response = await fetchChecked(url);
	const contentLength: number = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
	if (contentLength > maxBytes) {
		throw new Error("Backend manifest exceeds the maximum allowed size.");
	}
	const bytes: Uint8Array = new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength > maxBytes) {
		throw new Error("Backend manifest exceeds the maximum allowed size.");
	}
	return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function getReleaseAssetUrl(version: string, fileName: string): string {
	return `${BACKEND_RELEASE_BASE_URL}/download/v${encodeURIComponent(version)}/${fileName}`;
}

export async function fetchBackendReleaseManifest(
	version: string | null = null
): Promise<BackendReleaseManifestV1> {
	const url: string = version === null
		? `${BACKEND_RELEASE_BASE_URL}/latest/download/${RELEASE_MANIFEST_FILE_NAME}`
		: getReleaseAssetUrl(version, RELEASE_MANIFEST_FILE_NAME);
	const manifest: BackendReleaseManifestV1 = parseBackendReleaseManifest(
		await fetchJson(url, MAX_MANIFEST_BYTES)
	);
	assertBackendManifestCompatible(manifest, getStudioVersion());
	if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
		throw new Error(
			`Backend release targets ${manifest.platform}/${manifest.arch}, not ${process.platform}/${process.arch}.`
		);
	}
	if (version !== null && manifest.version !== version) {
		throw new Error(`Backend release returned version ${manifest.version}; expected ${version}.`);
	}
	return manifest;
}

async function downloadFile(
	url: string,
	targetPath: string,
	maxBytes: number,
	expectedSize: number,
	expectedSha256: string
): Promise<void> {
	const response: Response = await fetchChecked(url);
	const declaredSize: number = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
	if (declaredSize > maxBytes || (declaredSize > 0 && declaredSize !== expectedSize)) {
		throw new Error("Backend archive Content-Length is invalid.");
	}
	if (response.body === null) {
		throw new Error("Backend archive response has no body.");
	}
	await mkdir(dirname(targetPath), { recursive: true });
	const file = await open(targetPath, "w");
	const reader = response.body.getReader();
	const hash = createHash("sha256");
	let totalBytes: number = 0;
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) {
				break;
			}
			totalBytes += chunk.value.byteLength;
			if (totalBytes > maxBytes || totalBytes > expectedSize) {
				throw new Error("Backend archive exceeds the expected size.");
			}
			hash.update(chunk.value);
			await file.write(chunk.value);
		}
	} finally {
		await file.close();
	}
	if (totalBytes !== expectedSize || hash.digest("hex") !== expectedSha256) {
		await rm(targetPath, { force: true });
		throw new Error("Backend archive failed its size or SHA-256 verification.");
	}
}

const POWERSHELL_EXTRACT_SCRIPT: string = [
	"$ErrorActionPreference = 'Stop'",
	"Add-Type -AssemblyName System.IO.Compression.FileSystem",
	"$archive = [System.IO.Compression.ZipFile]::OpenRead($env:DAEDALUS_ARCHIVE_PATH)",
	"try {",
	"  $allowed = @('daedalus-backend.exe', 'daedalus-windows-sandbox-helper.exe', 'backend-manifest.json')",
	"  $seen = @{}",
	"  foreach ($entry in $archive.Entries) {",
	"    if ($entry.FullName -notin $allowed -or $seen.ContainsKey($entry.FullName)) {",
	"      throw \"Unexpected or duplicate backend archive entry: $($entry.FullName)\"",
	"    }",
	"    $seen[$entry.FullName] = $true",
	"    $target = Join-Path $env:DAEDALUS_EXTRACT_DIR $entry.FullName",
	"    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)",
	"  }",
	"  foreach ($required in $allowed) {",
	"    if (-not $seen.ContainsKey($required)) { throw \"Missing backend archive entry: $required\" }",
	"  }",
	"} finally { $archive.Dispose() }"
].join("\n");

async function extractBackendArchive(archivePath: string, destinationDir: string): Promise<void> {
	await mkdir(destinationDir, { recursive: true });
	const result: CommandResult = await runCommand(
		"powershell.exe",
		["-NoProfile", "-NonInteractive", "-Command", POWERSHELL_EXTRACT_SCRIPT],
		{
			env: {
				...process.env,
				DAEDALUS_ARCHIVE_PATH: archivePath,
				DAEDALUS_EXTRACT_DIR: destinationDir
			},
			timeoutMs: 60000
		}
	);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || "Failed to extract backend archive.");
	}
}

async function finalizeStagingDirectory(
	stagingDir: string,
	expectedManifest: BackendPayloadManifestV1
): Promise<InstalledBackendBinary> {
	const payloadManifestPath: string = join(stagingDir, PAYLOAD_MANIFEST_FILE_NAME);
	const manifestBytes: Buffer = await readFile(payloadManifestPath);
	const payloadManifest: BackendPayloadManifestV1 = parseBackendPayloadManifest(
		JSON.parse(manifestBytes.toString("utf8")) as unknown
	);
	if (!payloadManifestsMatch(payloadManifest, expectedManifest)) {
		throw new Error("Backend payload manifest does not match its release manifest.");
	}
	const stagingExecutablePath: string = join(stagingDir, EXECUTABLE_FILE_NAME);
	const stagingSandboxHelperPath: string = join(stagingDir, SANDBOX_HELPER_FILE_NAME);
	await verifyFile(
		stagingExecutablePath,
		payloadManifest.executable.size,
		payloadManifest.executable.sha256,
		"Backend executable"
	);
	await verifyFile(
		stagingSandboxHelperPath,
		payloadManifest.sandboxHelper.size,
		payloadManifest.sandboxHelper.sha256,
		"Backend Windows sandbox helper"
	);

	const versionDir: string = assertInside(
		getManagedBackendVersionsDir(),
		join(getManagedBackendVersionsDir(), payloadManifest.version)
	);
	if (existsSync(versionDir)) {
		try {
			const installed: InstalledBackendBinary = await inspectInstalledBackend(versionDir);
			if (installed.manifest.executable.sha256 === payloadManifest.executable.sha256) {
				await rm(stagingDir, { recursive: true, force: true });
				await runBackendSelfTest(installed);
				return installed;
			}
		} catch {
			// Replace only a payload that failed full validation.
		}
		await rm(versionDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
	}
	await rename(stagingDir, versionDir);
	const installed: InstalledBackendBinary = await inspectInstalledBackend(versionDir);
	await runBackendSelfTest(installed);
	return installed;
}

export async function stageBackendRelease(
	version: string | null = null
): Promise<InstalledBackendBinary> {
	const manifest: BackendReleaseManifestV1 = await fetchBackendReleaseManifest(version);
	const versionsDir: string = getManagedBackendVersionsDir();
	const downloadsDir: string = join(getBackendRootDir(), "downloads");
	const archivePath: string = assertInside(
		getBackendRootDir(),
		join(downloadsDir, `${manifest.version}-${Date.now()}.download`)
	);
	const stagingDir: string = assertInside(versionsDir, join(versionsDir, `${manifest.version}.staging`));
	await mkdir(versionsDir, { recursive: true });
	await rm(stagingDir, { recursive: true, force: true });
	try {
		await downloadFile(
			getReleaseAssetUrl(manifest.version, manifest.archive.fileName),
			archivePath,
			MAX_ARCHIVE_BYTES,
			manifest.archive.size,
			manifest.archive.sha256
		);
		await extractBackendArchive(archivePath, stagingDir);
		const payloadManifestBytes: Buffer = await readFile(join(stagingDir, PAYLOAD_MANIFEST_FILE_NAME));
		if (createHash("sha256").update(payloadManifestBytes).digest("hex") !== manifest.payloadManifestSha256) {
			throw new Error("Backend payload manifest SHA-256 does not match the release manifest.");
		}
		return await finalizeStagingDirectory(stagingDir, manifest);
	} catch (error: unknown) {
		await rm(stagingDir, { recursive: true, force: true });
		throw error;
	} finally {
		await rm(archivePath, { force: true });
	}
}

export async function stageBundledBackend(): Promise<InstalledBackendBinary> {
	const bundled: InstalledBackendBinary = await inspectBundledBackend();
	const manifestBytes: Buffer = await readFile(bundled.manifestPath);
	const versionsDir: string = getManagedBackendVersionsDir();
	const stagingDir: string = assertInside(
		versionsDir,
		join(versionsDir, `${bundled.manifest.version}.staging`)
	);
	await mkdir(versionsDir, { recursive: true });
	await rm(stagingDir, { recursive: true, force: true });
	await mkdir(stagingDir, { recursive: true });
	try {
		await copyFile(bundled.executablePath, join(stagingDir, EXECUTABLE_FILE_NAME));
		await copyFile(bundled.sandboxHelperPath, join(stagingDir, SANDBOX_HELPER_FILE_NAME));
		await writeFile(join(stagingDir, PAYLOAD_MANIFEST_FILE_NAME), manifestBytes);
		return await finalizeStagingDirectory(stagingDir, bundled.manifest);
	} catch (error: unknown) {
		await rm(stagingDir, { recursive: true, force: true });
		throw error;
	}
}

function createCurrentFile(
	installed: InstalledBackendBinary,
	previousVersion?: string
): BackendCurrentFileV2 {
	return {
		schemaVersion: 2,
		distribution: "binary",
		version: installed.version,
		executablePath: installed.executablePath,
		manifestPath: installed.manifestPath,
		protocolVersion: installed.manifest.protocolVersion,
		updatedAt: new Date().toISOString(),
		...(previousVersion === undefined ? {} : { previousVersion })
	};
}

export async function activateBackendCandidate(
	installed: InstalledBackendBinary
): Promise<BackendPendingUpdateV1> {
	const previous: BackendCurrentFileV2 | null = await readCurrentBackendFile();
	const candidate: BackendCurrentFileV2 = createCurrentFile(installed, previous?.version);
	const pending: BackendPendingUpdateV1 = {
		schemaVersion: 1,
		createdAt: new Date().toISOString(),
		candidate,
		previous
	};
	await writeJsonFileAtomic(getBackendPendingUpdatePath(), pending);
	await writeJsonFileAtomic(getManagedBackendCurrentPath(), candidate);
	return pending;
}

export async function commitBackendCandidate(expectedVersion: string): Promise<void> {
	const pending: BackendPendingUpdateV1 | null = await readPendingBackendUpdate();
	const current: BackendCurrentFileV2 | null = await readCurrentBackendFile();
	if (current === null || current.version !== expectedVersion) {
		throw new Error(`Cannot commit backend ${expectedVersion}; it is not the active candidate.`);
	}
	if (pending !== null && pending.candidate.version !== expectedVersion) {
		throw new Error("Pending backend transaction does not match the active candidate.");
	}
	await writeJsonFileAtomic(getManagedBackendCurrentPath(), {
		...current,
		previousVersion: undefined,
		updatedAt: new Date().toISOString()
	});
	const previous: BackendCurrentFileV2 | null = pending?.previous ?? null;
	if (previous !== null && previous.version !== expectedVersion) {
		const previousDir: string = dirname(previous.executablePath);
		await rm(assertInside(getManagedBackendVersionsDir(), previousDir), {
			recursive: true,
			force: true,
			maxRetries: 8,
			retryDelay: 250
		});
		await rm(join(getBackendRootDir(), "native", previous.version), {
			recursive: true,
			force: true,
			maxRetries: 8,
			retryDelay: 250
		});
	}
	await rm(getBackendPendingUpdatePath(), { force: true });
}

export async function rollbackBackendCandidate(): Promise<BackendCurrentFileV2 | null> {
	const pending: BackendPendingUpdateV1 | null = await readPendingBackendUpdate();
	if (pending === null) {
		return await readCurrentBackendFile();
	}
	if (pending.previous === null) {
		await rm(getManagedBackendCurrentPath(), { force: true });
	} else {
		await writeJsonFileAtomic(getManagedBackendCurrentPath(), {
			...pending.previous,
			previousVersion: undefined,
			updatedAt: new Date().toISOString()
		});
	}
	if (pending.candidate.version !== pending.previous?.version) {
		await rm(dirname(pending.candidate.executablePath), {
			recursive: true,
			force: true,
			maxRetries: 8,
			retryDelay: 250
		});
		await rm(
			assertInside(
				getBackendRootDir(),
				join(getBackendRootDir(), "native", pending.candidate.version)
			),
			{
				recursive: true,
				force: true,
				maxRetries: 8,
				retryDelay: 250
			}
		);
	}
	await rm(getBackendPendingUpdatePath(), { force: true });
	return pending.previous;
}

export async function removeLegacyManagedBackends(): Promise<void> {
	const current: BackendCurrentFileV2 | null = await readCurrentBackendFile();
	const versionsDir: string = getManagedBackendVersionsDir();
	const entries = await import("node:fs/promises").then(({ readdir }) =>
		readdir(versionsDir, { withFileTypes: true }).catch(() => [])
	);
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.endsWith(".staging") || entry.name === current?.version) {
			continue;
		}
		await rm(assertInside(versionsDir, join(versionsDir, entry.name)), {
			recursive: true,
			force: true,
			maxRetries: 8,
			retryDelay: 250
		});
		await rm(
			assertInside(getBackendRootDir(), join(getBackendRootDir(), "native", entry.name)),
			{
				recursive: true,
				force: true,
				maxRetries: 8,
				retryDelay: 250
			}
		);
	}
}
