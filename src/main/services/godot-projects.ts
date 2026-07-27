import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { createHash, randomBytes } from "node:crypto";
import {
	mkdir,
	readFile,
	realpath,
	rename,
	rm,
	stat,
	writeFile
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const PLUGIN_RESOURCE_PATH: string = "res://addons/godot_daedalus/plugin.cfg";
const PLUGIN_RELATIVE_ROOT: string = "addons/godot_daedalus";
const PROJECT_STATE_SCHEMA_VERSION: 1 = 1;
const MAX_ARCHIVE_BYTES: number = 64 * 1024 * 1024;
const MAX_FILE_COUNT: number = 2_000;
const MAX_EXTRACTED_BYTES: number = 128 * 1024 * 1024;

export type GodotProjectPluginStatus =
	| "not_installed"
	| "current"
	| "outdated"
	| "disabled"
	| "modified"
	| "pending"
	| "failed";

export type GodotProjectInfo = {
	id: string;
	name: string;
	path: string;
	godotVersion: string | null;
	pluginVersion: string | null;
	bundledPluginVersion: string | null;
	enabled: boolean;
	status: GodotProjectPluginStatus;
	errorMessage: string | null;
};

export type GodotProjectScanResult = {
	projects: GodotProjectInfo[];
	plugin: {
		available: boolean;
		version: string | null;
		studioVersion: string | null;
		errorMessage: string | null;
	};
};

type PluginFileManifest = {
	path: string;
	size: number;
	sha256: string;
};

type PluginPackageManifest = {
	schemaVersion: 1;
	pluginVersion: string;
	pluginProtocolVersion: number;
	studioVersion: string;
	minGodotVersion: string;
	sourceCommit: string;
	publishedAt: string;
	archive: {
		fileName: string;
		size: number;
		sha256: string;
	};
	files: PluginFileManifest[];
};

type InstalledIntegrityManifest = {
	schemaVersion: 1;
	pluginVersion: string;
	pluginProtocolVersion: number;
	files: PluginFileManifest[];
};

type ProjectState = {
	schemaVersion: 1;
	manualProjectPaths: string[];
	pendingErrors: Record<string, string>;
};

type ZipEntry = {
	name: string;
	compression: number;
	compressedSize: number;
	uncompressedSize: number;
	localHeaderOffset: number;
	externalAttributes: number;
};

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

function isInside(parentPath: string, childPath: string): boolean {
	const parent: string = resolve(parentPath);
	const child: string = resolve(childPath);
	return child === parent || child.startsWith(`${parent}${sep}`);
}

function validateArchivePath(value: string): string {
	const normalized: string = value.replaceAll("\\", "/");
	if (
		normalized.length === 0
		|| normalized.startsWith("/")
		|| /^[A-Za-z]:/u.test(normalized)
		|| normalized.split("/").some((part: string): boolean => part === "..")
	) {
		throw new Error(`Plugin archive contains an unsafe path: ${value}`);
	}
	return normalized;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
	const minimumOffset: number = Math.max(0, buffer.length - 65_557);
	for (let offset: number = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
		if (buffer.readUInt32LE(offset) === 0x06054b50) {
			return offset;
		}
	}
	throw new Error("Plugin archive is missing a ZIP central directory.");
}

export function inspectZipEntries(buffer: Buffer): ZipEntry[] {
	if (buffer.length > MAX_ARCHIVE_BYTES) {
		throw new Error("Plugin archive exceeds the maximum supported size.");
	}
	const endOffset: number = findEndOfCentralDirectory(buffer);
	const entryCount: number = buffer.readUInt16LE(endOffset + 10);
	const centralOffset: number = buffer.readUInt32LE(endOffset + 16);
	if (entryCount > MAX_FILE_COUNT) {
		throw new Error("Plugin archive contains too many files.");
	}
	const entries: ZipEntry[] = [];
	let offset: number = centralOffset;
	let totalSize: number = 0;
	for (let index: number = 0; index < entryCount; index += 1) {
		if (buffer.readUInt32LE(offset) !== 0x02014b50) {
			throw new Error("Plugin archive central directory is invalid.");
		}
		const compression: number = buffer.readUInt16LE(offset + 10);
		const compressedSize: number = buffer.readUInt32LE(offset + 20);
		const uncompressedSize: number = buffer.readUInt32LE(offset + 24);
		const nameLength: number = buffer.readUInt16LE(offset + 28);
		const extraLength: number = buffer.readUInt16LE(offset + 30);
		const commentLength: number = buffer.readUInt16LE(offset + 32);
		const externalAttributes: number = buffer.readUInt32LE(offset + 38);
		const localHeaderOffset: number = buffer.readUInt32LE(offset + 42);
		const name: string = validateArchivePath(
			buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8")
		);
		const unixMode: number = externalAttributes >>> 16;
		if ((unixMode & 0o170000) === 0o120000) {
			throw new Error(`Plugin archive contains a symbolic link: ${name}`);
		}
		if (compression !== 0 && compression !== 8) {
			throw new Error(`Plugin archive uses unsupported compression for ${name}.`);
		}
		totalSize += uncompressedSize;
		if (totalSize > MAX_EXTRACTED_BYTES) {
			throw new Error("Plugin archive expands beyond the maximum supported size.");
		}
		entries.push({
			name,
			compression,
			compressedSize,
			uncompressedSize,
			localHeaderOffset,
			externalAttributes
		});
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}

async function extractZip(buffer: Buffer, targetRoot: string): Promise<void> {
	const entries: ZipEntry[] = inspectZipEntries(buffer);
	for (const entry of entries) {
		const outputPath: string = resolve(targetRoot, ...entry.name.split("/"));
		if (!isInside(targetRoot, outputPath)) {
			throw new Error(`Plugin archive path escapes the staging directory: ${entry.name}`);
		}
		if (entry.name.endsWith("/")) {
			await mkdir(outputPath, { recursive: true });
			continue;
		}
		if (buffer.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) {
			throw new Error(`Plugin archive local header is invalid: ${entry.name}`);
		}
		const nameLength: number = buffer.readUInt16LE(entry.localHeaderOffset + 26);
		const extraLength: number = buffer.readUInt16LE(entry.localHeaderOffset + 28);
		const dataOffset: number = entry.localHeaderOffset + 30 + nameLength + extraLength;
		const compressed: Buffer = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
		const content: Buffer = entry.compression === 0 ? compressed : inflateRawSync(compressed);
		if (content.length !== entry.uncompressedSize) {
			throw new Error(`Plugin archive size check failed: ${entry.name}`);
		}
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, content, { flag: "wx" });
	}
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
	const value: unknown = record[key];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Plugin manifest field "${key}" is invalid.`);
	}
	return value.trim();
}

function parsePluginManifest(value: unknown): PluginPackageManifest {
	const record: Record<string, unknown> = requireRecord(value, "Plugin manifest");
	if (record.schemaVersion !== 1 || !Number.isSafeInteger(record.pluginProtocolVersion)) {
		throw new Error("Plugin manifest schema is unsupported.");
	}
	const archiveRecord: Record<string, unknown> = requireRecord(record.archive, "Plugin archive manifest");
	if (!Array.isArray(record.files)) {
		throw new Error("Plugin manifest files must be an array.");
	}
	const manifestPaths: Set<string> = new Set();
	const files: PluginFileManifest[] = record.files.map((item: unknown): PluginFileManifest => {
		const file: Record<string, unknown> = requireRecord(item, "Plugin file manifest");
		const path: string = validateArchivePath(requireString(file, "path"));
		const size: unknown = file.size;
		const digest: string = requireString(file, "sha256").toLowerCase();
		if (
			!path.startsWith(`${PLUGIN_RELATIVE_ROOT}/`)
			|| typeof size !== "number"
			|| !Number.isSafeInteger(size)
			|| size < 0
			|| !/^[a-f0-9]{64}$/u.test(digest)
		) {
			throw new Error(`Plugin file manifest is invalid: ${path}`);
		}
		if (manifestPaths.has(path)) {
			throw new Error(`Plugin file manifest contains a duplicate path: ${path}`);
		}
		manifestPaths.add(path);
		return { path, size, sha256: digest };
	});
	return {
		schemaVersion: 1,
		pluginVersion: requireString(record, "pluginVersion"),
		pluginProtocolVersion: record.pluginProtocolVersion as number,
		studioVersion: requireString(record, "studioVersion"),
		minGodotVersion: requireString(record, "minGodotVersion"),
		sourceCommit: requireString(record, "sourceCommit"),
		publishedAt: requireString(record, "publishedAt"),
		archive: {
			fileName: requireString(archiveRecord, "fileName"),
			size: Number(archiveRecord.size),
			sha256: requireString(archiveRecord, "sha256").toLowerCase()
		},
		files
	};
}

function parseInstalledIntegrityManifest(value: unknown): InstalledIntegrityManifest {
	const record: Record<string, unknown> = requireRecord(value, "Installed plugin integrity manifest");
	if (
		record.schemaVersion !== 1
		|| !Number.isSafeInteger(record.pluginProtocolVersion)
		|| !Array.isArray(record.files)
	) {
		throw new Error("Installed plugin integrity manifest schema is unsupported.");
	}
	const paths: Set<string> = new Set();
	const files: PluginFileManifest[] = record.files.map((item: unknown): PluginFileManifest => {
		const file: Record<string, unknown> = requireRecord(item, "Installed plugin file manifest");
		const path: string = validateArchivePath(requireString(file, "path"));
		const size: unknown = file.size;
		const digest: string = requireString(file, "sha256").toLowerCase();
		if (
			!path.startsWith(`${PLUGIN_RELATIVE_ROOT}/`)
			|| path === `${PLUGIN_RELATIVE_ROOT}/daedalus-integrity.json`
			|| typeof size !== "number"
			|| !Number.isSafeInteger(size)
			|| size < 0
			|| !/^[a-f0-9]{64}$/u.test(digest)
			|| paths.has(path)
		) {
			throw new Error(`Installed plugin file manifest is invalid: ${path}`);
		}
		paths.add(path);
		return { path, size, sha256: digest };
	});
	return {
		schemaVersion: 1,
		pluginVersion: requireString(record, "pluginVersion"),
		pluginProtocolVersion: record.pluginProtocolVersion as number,
		files
	};
}

function parseProjectName(projectText: string, projectPath: string): string {
	const match: RegExpMatchArray | null = projectText.match(
		/^\s*config\/name\s*=\s*"((?:\\.|[^"])*)"/mu
	);
	if (match === null) {
		return basename(projectPath);
	}
	return match[1]!.replaceAll('\\"', '"').replaceAll("\\\\", "\\");
}

function parseGodotVersion(projectText: string): string | null {
	const match: RegExpMatchArray | null = projectText.match(
		/^\s*config\/features\s*=\s*PackedStringArray\(([^)]*)\)/mu
	);
	const version: RegExpMatchArray | null = match?.[1]?.match(/"(\d+\.\d+(?:\.\d+)?)"/u) ?? null;
	return version?.[1] ?? null;
}

type ProjectSection = {
	start: number;
	end: number;
	headerEnd: number;
	text: string;
};

function findProjectSection(projectText: string, sectionName: string): ProjectSection | null {
	const headerPattern: RegExp = new RegExp(
		`^\\[${sectionName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\][^\\S\\r\\n]*(?:\\r?\\n|$)`,
		"mu"
	);
	const header: RegExpMatchArray | null = projectText.match(headerPattern);
	if (header === null || header.index === undefined) {
		return null;
	}
	const start: number = header.index;
	const headerEnd: number = start + header[0].length;
	const nextHeader: RegExpMatchArray | null = projectText
		.slice(headerEnd)
		.match(/^\[[^\]\r\n]+\][^\S\r\n]*(?:\r?\n|$)/mu);
	const end: number = nextHeader?.index === undefined
		? projectText.length
		: headerEnd + nextHeader.index;
	return {
		start,
		end,
		headerEnd,
		text: projectText.slice(start, end)
	};
}

function readEnabledPlugins(projectText: string): string[] {
	const section: ProjectSection | null = findProjectSection(projectText, "editor_plugins");
	const enabledMatch: RegExpMatchArray | null = section?.text.match(
		/^[^\S\r\n]*enabled[^\S\r\n]*=[^\S\r\n]*PackedStringArray\(([^)]*)\)/mu
	) ?? null;
	if (enabledMatch === null) {
		return [];
	}
	return Array.from(enabledMatch[1]!.matchAll(/"((?:\\.|[^"])*)"/gu))
		.map((match: RegExpMatchArray): string => match[1]!.replaceAll('\\"', '"').replaceAll("\\\\", "\\"));
}

export function updateEditorPluginEnabled(
	projectText: string,
	pluginPath: string,
	enabled: boolean
): string {
	const lineEnding: string = projectText.includes("\r\n") ? "\r\n" : "\n";
	const plugins: string[] = readEnabledPlugins(projectText)
		.filter((item: string): boolean => item !== pluginPath);
	if (enabled) {
		plugins.push(pluginPath);
	}
	const valueLine: string = `enabled=PackedStringArray(${plugins.map((item: string): string => JSON.stringify(item)).join(", ")})`;
	const section: ProjectSection | null = findProjectSection(projectText, "editor_plugins");
	if (section === null) {
		return `${projectText.trimEnd()}${lineEnding}${lineEnding}[editor_plugins]${lineEnding}${valueLine}${lineEnding}`;
	}
	const enabledPattern: RegExp =
		/^[^\S\r\n]*enabled[^\S\r\n]*=[^\S\r\n]*PackedStringArray\([^)]*\)[^\S\r\n]*$/mu;
	const nextSection: string = enabledPattern.test(section.text)
		? section.text.replace(enabledPattern, valueLine)
		: `${section.text.trimEnd()}${lineEnding}${valueLine}${lineEnding}${lineEnding}`;
	return `${projectText.slice(0, section.start)}${nextSection}${projectText.slice(section.end)}`;
}

function readPluginVersion(pluginConfigText: string): string | null {
	return pluginConfigText.match(/^\s*version\s*=\s*"([^"]+)"/mu)?.[1] ?? null;
}

function compareVersions(left: string, right: string): number {
	const parse = (value: string): number[] => value.split(/[.+-]/u)
		.slice(0, 3)
		.map((part: string): number => Number.parseInt(part, 10) || 0);
	const leftParts: number[] = parse(left);
	const rightParts: number[] = parse(right);
	for (let index: number = 0; index < 3; index += 1) {
		const difference: number = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference !== 0) {
			return difference;
		}
	}
	return 0;
}

class GodotProjectsService {
	private state: ProjectState = {
		schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
		manualProjectPaths: [],
		pendingErrors: {}
	};
	private loaded: boolean = false;

	private getStatePath(): string {
		return join(app.getPath("userData"), "godot-projects.json");
	}

	private getBundleRoot(): string {
		return app.isPackaged
			? join(process.resourcesPath, "godot-plugin")
			: join(app.getAppPath(), "build", "godot-plugin");
	}

	private async loadState(): Promise<void> {
		if (this.loaded) {
			return;
		}
		this.loaded = true;
		try {
			const value: unknown = JSON.parse(await readFile(this.getStatePath(), "utf8")) as unknown;
			const record: Record<string, unknown> = requireRecord(value, "Godot projects state");
			if (record.schemaVersion === 1 && Array.isArray(record.manualProjectPaths)) {
				this.state = {
					schemaVersion: 1,
					manualProjectPaths: record.manualProjectPaths.filter(
						(item: unknown): item is string => typeof item === "string" && isAbsolute(item)
					),
					pendingErrors: typeof record.pendingErrors === "object"
						&& record.pendingErrors !== null
						&& !Array.isArray(record.pendingErrors)
						? record.pendingErrors as Record<string, string>
						: {}
				};
			}
		} catch {
			// A missing or invalid state file starts with an empty discovery state.
		}
	}

	private async saveState(): Promise<void> {
		const statePath: string = this.getStatePath();
		await mkdir(dirname(statePath), { recursive: true });
		const temporaryPath: string = `${statePath}.${process.pid}.tmp`;
		await writeFile(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
		await rename(temporaryPath, statePath);
	}

	private async loadPackage(): Promise<{
		manifest: PluginPackageManifest;
		archive: Buffer;
	}> {
		const root: string = this.getBundleRoot();
		const manifest: PluginPackageManifest = parsePluginManifest(
			JSON.parse(await readFile(join(root, "plugin-manifest.json"), "utf8")) as unknown
		);
		if (manifest.studioVersion !== app.getVersion()) {
			throw new Error(
				`Bundled Godot plugin targets Studio ${manifest.studioVersion}, not ${app.getVersion()}.`
			);
		}
		const archivePath: string = join(root, manifest.archive.fileName);
		const archive: Buffer = await readFile(archivePath);
		if (
			archive.length !== manifest.archive.size
			|| sha256(archive) !== manifest.archive.sha256
		) {
			throw new Error("Bundled Godot plugin archive failed integrity verification.");
		}
		const entries: ZipEntry[] = inspectZipEntries(archive);
		const entryNames: Set<string> = new Set();
		for (const entry of entries) {
			if (!entry.name.startsWith(`${PLUGIN_RELATIVE_ROOT}/`)) {
				throw new Error(`Bundled plugin archive contains an unexpected path: ${entry.name}`);
			}
			if (entry.name.endsWith("/")) {
				continue;
			}
			if (entryNames.has(entry.name)) {
				throw new Error(`Bundled plugin archive contains a duplicate file: ${entry.name}`);
			}
			entryNames.add(entry.name);
		}
		const manifestNames: Set<string> = new Set(
			manifest.files.map((file: PluginFileManifest): string => file.path)
		);
		if (
			entryNames.size !== manifestNames.size
			|| Array.from(entryNames).some((name: string): boolean => !manifestNames.has(name))
		) {
			throw new Error("Bundled plugin archive contains files not declared by its manifest.");
		}
		for (const file of manifest.files) {
			if (!entryNames.has(file.path)) {
				throw new Error(`Bundled plugin archive is missing ${file.path}.`);
			}
		}
		return { manifest, archive };
	}

	private async normalizeProjectPath(candidate: string): Promise<string | null> {
		try {
			const normalized: string = await realpath(resolve(candidate));
			const projectFile: string = join(normalized, "project.godot");
			if (!(await stat(projectFile)).isFile()) {
				return null;
			}
			return normalized;
		} catch {
			return null;
		}
	}

	private async discoverProjectCandidates(): Promise<string[]> {
		await this.loadState();
		const candidates: string[] = [...this.state.manualProjectPaths];
		const appData: string | undefined = process.env.APPDATA;
		if (appData !== undefined) {
			try {
				const projectsText: string = await readFile(join(appData, "Godot", "projects.cfg"), "utf8");
				for (const match of projectsText.matchAll(/^\[([^\]\r\n]+)\]\s*$/gmu)) {
					candidates.push(match[1]!);
				}
			} catch {
				// Godot may not have created a project index yet.
			}
		}
		const userProfile: string | undefined = process.env.USERPROFILE;
		if (userProfile !== undefined) {
			try {
				const workspaces: unknown = JSON.parse(
					await readFile(join(userProfile, ".daedalus", "config", "workspaces.json"), "utf8")
				) as unknown;
				const records: unknown[] = Array.isArray(workspaces)
					? workspaces
					: Array.isArray((workspaces as { workspaces?: unknown })?.workspaces)
						? (workspaces as { workspaces: unknown[] }).workspaces
						: [];
				for (const item of records) {
					if (typeof item !== "object" || item === null) {
						continue;
					}
					const record = item as { rootPath?: unknown; sourceFolders?: unknown };
					if (typeof record.rootPath === "string") {
						candidates.push(record.rootPath);
					}
					if (Array.isArray(record.sourceFolders)) {
						for (const source of record.sourceFolders) {
							if (
								typeof source === "object"
								&& source !== null
								&& typeof (source as { path?: unknown }).path === "string"
							) {
								candidates.push((source as { path: string }).path);
							}
						}
					}
				}
			} catch {
				// Workspace discovery is additive and must not block Godot's own index.
			}
		}
		const normalizedByKey: Map<string, string> = new Map();
		for (const candidate of candidates) {
			const normalized: string | null = await this.normalizeProjectPath(candidate);
			if (normalized !== null) {
				normalizedByKey.set(normalized.toLocaleLowerCase("en-US"), normalized);
			}
		}
		return Array.from(normalizedByKey.values());
	}

	private async verifyInstalledFiles(
		projectPath: string,
		manifest: PluginPackageManifest
	): Promise<boolean> {
		for (const file of manifest.files) {
			const relativePluginPath: string = relative(
				PLUGIN_RELATIVE_ROOT,
				file.path
			);
			const installedPath: string = resolve(projectPath, PLUGIN_RELATIVE_ROOT, relativePluginPath);
			if (!isInside(resolve(projectPath, PLUGIN_RELATIVE_ROOT), installedPath)) {
				return false;
			}
			try {
				const content: Buffer = await readFile(installedPath);
				if (content.length !== file.size || sha256(content) !== file.sha256) {
					return false;
				}
			} catch {
				return false;
			}
		}
		return true;
	}

	private async verifyInstalledVersionIntegrity(
		projectPath: string,
		pluginVersion: string
	): Promise<boolean> {
		try {
			const integrity = parseInstalledIntegrityManifest(
				JSON.parse(await readFile(
					join(projectPath, PLUGIN_RELATIVE_ROOT, "daedalus-integrity.json"),
					"utf8"
				)) as unknown
			);
			if (integrity.pluginVersion !== pluginVersion) {
				return false;
			}
			for (const file of integrity.files) {
				const installedPath: string = resolve(projectPath, file.path);
				if (!isInside(resolve(projectPath, PLUGIN_RELATIVE_ROOT), installedPath)) {
					return false;
				}
				const content: Buffer = await readFile(installedPath);
				if (content.length !== file.size || sha256(content) !== file.sha256) {
					return false;
				}
			}
			return true;
		} catch {
			return false;
		}
	}

	private async inspectProject(
		projectPath: string,
		pluginPackage: { manifest: PluginPackageManifest } | null,
		packageError: string | null
	): Promise<GodotProjectInfo> {
		const projectText: string = await readFile(join(projectPath, "project.godot"), "utf8");
		const pluginConfigPath: string = join(projectPath, PLUGIN_RELATIVE_ROOT, "plugin.cfg");
		let pluginVersion: string | null = null;
		try {
			pluginVersion = readPluginVersion(await readFile(pluginConfigPath, "utf8"));
		} catch {
			pluginVersion = null;
		}
		const enabled: boolean = readEnabledPlugins(projectText).includes(PLUGIN_RESOURCE_PATH);
		let status: GodotProjectPluginStatus = "not_installed";
		let errorMessage: string | null = this.state.pendingErrors[projectPath] ?? packageError;
		if (pluginVersion !== null) {
			if (pluginPackage === null) {
				status = "failed";
			} else if (compareVersions(pluginVersion, pluginPackage.manifest.pluginVersion) < 0) {
				status = await this.verifyInstalledVersionIntegrity(projectPath, pluginVersion)
					? "outdated"
					: "modified";
			} else if (pluginVersion === pluginPackage.manifest.pluginVersion) {
				const intact: boolean = await this.verifyInstalledFiles(projectPath, pluginPackage.manifest);
				status = !intact ? "modified" : enabled ? "current" : "disabled";
			} else {
				status = "modified";
			}
		}
		if (this.state.pendingErrors[projectPath] !== undefined && status !== "modified") {
			status = "pending";
		}
		return {
			id: sha256(Buffer.from(projectPath.toLocaleLowerCase("en-US"), "utf8")).slice(0, 24),
			name: parseProjectName(projectText, projectPath),
			path: projectPath,
			godotVersion: parseGodotVersion(projectText),
			pluginVersion,
			bundledPluginVersion: pluginPackage?.manifest.pluginVersion ?? null,
			enabled,
			status,
			errorMessage
		};
	}

	public async scan(): Promise<GodotProjectScanResult> {
		await this.loadState();
		let pluginPackage: { manifest: PluginPackageManifest; archive: Buffer } | null = null;
		let packageError: string | null = null;
		try {
			pluginPackage = await this.loadPackage();
		} catch (error: unknown) {
			packageError = error instanceof Error ? error.message : String(error);
		}
		const projects: GodotProjectInfo[] = [];
		for (const projectPath of await this.discoverProjectCandidates()) {
			projects.push(await this.inspectProject(projectPath, pluginPackage, packageError));
		}
		projects.sort((left: GodotProjectInfo, right: GodotProjectInfo): number =>
			left.name.localeCompare(right.name) || left.path.localeCompare(right.path)
		);
		return {
			projects,
			plugin: {
				available: pluginPackage !== null,
				version: pluginPackage?.manifest.pluginVersion ?? null,
				studioVersion: pluginPackage?.manifest.studioVersion ?? null,
				errorMessage: packageError
			}
		};
	}

	public async addProject(owner: BrowserWindow | undefined): Promise<GodotProjectScanResult> {
		const options: Electron.OpenDialogOptions = {
			title: "Add Godot project",
			properties: ["openDirectory"]
		};
		const result = owner === undefined
			? await dialog.showOpenDialog(options)
			: await dialog.showOpenDialog(owner, options);
		const selected: string | undefined = result.canceled ? undefined : result.filePaths[0];
		if (selected === undefined) {
			return await this.scan();
		}
		const normalized: string | null = await this.normalizeProjectPath(selected);
		if (normalized === null) {
			throw new Error("The selected directory does not contain project.godot.");
		}
		await this.loadState();
		if (!this.state.manualProjectPaths.some(
			(item: string): boolean => item.toLocaleLowerCase("en-US") === normalized.toLocaleLowerCase("en-US")
		)) {
			this.state.manualProjectPaths.push(normalized);
			await this.saveState();
		}
		return await this.scan();
	}

	private async writeProjectFileAtomic(projectFile: string, content: string): Promise<void> {
		const temporaryPath: string = `${projectFile}.${process.pid}.${randomBytes(5).toString("hex")}.tmp`;
		await writeFile(temporaryPath, content, "utf8");
		await rename(temporaryPath, projectFile);
	}

	private async installOrUpgrade(projectPathInput: string, allowModified: boolean): Promise<GodotProjectScanResult> {
		const projectPath: string | null = await this.normalizeProjectPath(projectPathInput);
		if (projectPath === null) {
			throw new Error("Godot project is unavailable.");
		}
		const pluginPackage = await this.loadPackage();
		const current: GodotProjectInfo = await this.inspectProject(projectPath, pluginPackage, null);
		if (current.status === "modified" && !allowModified) {
			throw new Error("Installed plugin files were modified. Use Repair to replace them.");
		}
		if (
			current.godotVersion !== null
			&& compareVersions(current.godotVersion, pluginPackage.manifest.minGodotVersion) < 0
		) {
			throw new Error(
				`Godot ${pluginPackage.manifest.minGodotVersion} or newer is required for this plugin.`
			);
		}
		const projectFile: string = join(projectPath, "project.godot");
		const originalProjectText: string = await readFile(projectFile, "utf8");
		const wasEnabled: boolean = current.pluginVersion === null ? true : current.enabled;
		const addonsRoot: string = join(projectPath, "addons");
		const operationId: string = `${process.pid}-${randomBytes(6).toString("hex")}`;
		const stagingRoot: string = join(addonsRoot, `.godot_daedalus.staging-${operationId}`);
		const stagedPlugin: string = join(stagingRoot, PLUGIN_RELATIVE_ROOT);
		const targetPlugin: string = join(projectPath, PLUGIN_RELATIVE_ROOT);
		const backupPlugin: string = join(addonsRoot, `.godot_daedalus.backup-${operationId}`);
		let movedOriginal: boolean = false;
		let installedCandidate: boolean = false;
		let projectFileUpdated: boolean = false;
		try {
			await mkdir(stagingRoot, { recursive: true });
			await extractZip(pluginPackage.archive, stagingRoot);
			if (!existsSync(join(stagedPlugin, "plugin.cfg"))) {
				throw new Error("Plugin package does not contain plugin.cfg.");
			}
			for (const file of pluginPackage.manifest.files) {
				const stagedPath: string = resolve(stagingRoot, file.path);
				const content: Buffer = await readFile(stagedPath);
				if (content.length !== file.size || sha256(content) !== file.sha256) {
					throw new Error(`Plugin package file failed verification: ${file.path}`);
				}
			}
			await mkdir(addonsRoot, { recursive: true });
			if (existsSync(targetPlugin)) {
				await rename(targetPlugin, backupPlugin);
				movedOriginal = true;
			}
			await rename(stagedPlugin, targetPlugin);
			installedCandidate = true;
			if (await readFile(projectFile, "utf8") !== originalProjectText) {
				throw new Error("project.godot changed while the plugin update was being prepared.");
			}
			await this.writeProjectFileAtomic(
				projectFile,
				updateEditorPluginEnabled(originalProjectText, PLUGIN_RESOURCE_PATH, wasEnabled)
			);
			projectFileUpdated = true;
			await rm(backupPlugin, { recursive: true, force: true });
			delete this.state.pendingErrors[projectPath];
			await this.saveState();
		} catch (error: unknown) {
			if (installedCandidate) {
				await rm(targetPlugin, { recursive: true, force: true }).catch((): void => {});
			}
			if (movedOriginal) {
				await rename(backupPlugin, targetPlugin).catch((): void => {});
			}
			if (projectFileUpdated) {
				await this.writeProjectFileAtomic(projectFile, originalProjectText).catch((): void => {});
			}
			this.state.pendingErrors[projectPath] = error instanceof Error ? error.message : String(error);
			await this.saveState().catch((): void => {});
			throw error;
		} finally {
			await rm(stagingRoot, { recursive: true, force: true }).catch((): void => {});
		}
		return await this.scan();
	}

	public async setEnabled(projectPathInput: string, enabled: boolean): Promise<GodotProjectScanResult> {
		const projectPath: string | null = await this.normalizeProjectPath(projectPathInput);
		if (projectPath === null || !existsSync(join(projectPath, PLUGIN_RELATIVE_ROOT, "plugin.cfg"))) {
			throw new Error("Godot Daedalus is not installed in this project.");
		}
		const projectFile: string = join(projectPath, "project.godot");
		const original: string = await readFile(projectFile, "utf8");
		await this.writeProjectFileAtomic(
			projectFile,
			updateEditorPluginEnabled(original, PLUGIN_RESOURCE_PATH, enabled)
		);
		return await this.scan();
	}

	public async uninstall(projectPathInput: string): Promise<GodotProjectScanResult> {
		const projectPath: string | null = await this.normalizeProjectPath(projectPathInput);
		if (projectPath === null) {
			throw new Error("Godot project is unavailable.");
		}
		const projectFile: string = join(projectPath, "project.godot");
		const original: string = await readFile(projectFile, "utf8");
		const targetPlugin: string = join(projectPath, PLUGIN_RELATIVE_ROOT);
		if (!existsSync(targetPlugin)) {
			return await this.scan();
		}
		const trashPlugin: string = join(
			projectPath,
			"addons",
			`.godot_daedalus.remove-${process.pid}-${randomBytes(5).toString("hex")}`
		);
		let moved: boolean = false;
		let projectFileUpdated: boolean = false;
		try {
			await rename(targetPlugin, trashPlugin);
			moved = true;
			if (await readFile(projectFile, "utf8") !== original) {
				throw new Error("project.godot changed while the plugin removal was being prepared.");
			}
			await this.writeProjectFileAtomic(
				projectFile,
				updateEditorPluginEnabled(original, PLUGIN_RESOURCE_PATH, false)
			);
			projectFileUpdated = true;
			await rm(trashPlugin, { recursive: true, force: true });
			delete this.state.pendingErrors[projectPath];
			await this.saveState();
		} catch (error: unknown) {
			if (moved) {
				await rename(trashPlugin, targetPlugin).catch((): void => {});
			}
			if (projectFileUpdated) {
				await this.writeProjectFileAtomic(projectFile, original).catch((): void => {});
			}
			this.state.pendingErrors[projectPath] = error instanceof Error ? error.message : String(error);
			await this.saveState().catch((): void => {});
			throw error;
		}
		return await this.scan();
	}

	public async upgradeAll(): Promise<GodotProjectScanResult> {
		const scan: GodotProjectScanResult = await this.scan();
		for (const project of scan.projects) {
			if (project.status !== "outdated") {
				continue;
			}
			try {
				await this.installOrUpgrade(project.path, false);
			} catch {
				// Per-project pending errors are persisted; one locked project must not block the rest.
			}
		}
		return await this.scan();
	}

	public async retryPending(): Promise<GodotProjectScanResult> {
		const pendingPaths: string[] = Object.keys(this.state.pendingErrors);
		for (const projectPath of pendingPaths) {
			try {
				await this.installOrUpgrade(projectPath, false);
			} catch {
				// Keep the latest error for the settings page.
			}
		}
		return await this.scan();
	}

	public async startupMaintenance(): Promise<void> {
		await this.loadState();
		await this.upgradeAll().catch((): GodotProjectScanResult | undefined => undefined);
	}

	public registerIpc(): void {
		ipcMain.handle("godot-projects:scan", async (): Promise<GodotProjectScanResult> => await this.scan());
		ipcMain.handle("godot-projects:add", async (event): Promise<GodotProjectScanResult> =>
			await this.addProject(BrowserWindow.fromWebContents(event.sender) ?? undefined)
		);
		ipcMain.handle("godot-projects:install", async (_event, projectPath: string): Promise<GodotProjectScanResult> =>
			await this.installOrUpgrade(projectPath, false)
		);
		ipcMain.handle("godot-projects:repair", async (_event, projectPath: string): Promise<GodotProjectScanResult> =>
			await this.installOrUpgrade(projectPath, true)
		);
		ipcMain.handle("godot-projects:uninstall", async (_event, projectPath: string): Promise<GodotProjectScanResult> =>
			await this.uninstall(projectPath)
		);
		ipcMain.handle("godot-projects:set-enabled", async (_event, projectPath: string, enabled: boolean): Promise<GodotProjectScanResult> =>
			await this.setEnabled(projectPath, enabled)
		);
		ipcMain.handle("godot-projects:upgrade-all", async (): Promise<GodotProjectScanResult> => await this.upgradeAll());
		ipcMain.handle("godot-projects:retry-pending", async (): Promise<GodotProjectScanResult> => await this.retryPending());
	}
}

export const godotProjectsService = new GodotProjectsService();
