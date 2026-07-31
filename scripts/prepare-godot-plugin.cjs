const { createHash } = require("node:crypto");
const { deflateRawSync } = require("node:zlib");
const {
	mkdir,
	readFile,
	readdir,
	rm,
	stat,
	writeFile
} = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const https = require("node:https");
const { existsSync } = require("node:fs");
const { dirname, join, relative, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const packageManifest = require(join(root, "package.json"));
const outputRoot = join(root, "build", "godot-plugin");
const sourceRoot = resolve(
	process.env.GODOT_DAEDALUS_PLUGIN_SOURCE
		|| join(root, "..", "godot_projects", "godot-daedalus", "addons", "godot_daedalus")
);
const sourceRepository = resolve(sourceRoot, "..", "..");
const archiveName = `godot-daedalus-plugin-v${packageManifest.godotPluginVersion}.zip`;
const archivePath = join(outputRoot, archiveName);

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let index = 0; index < 256; index += 1) {
		let value = index;
		for (let bit = 0; bit < 8; bit += 1) {
			value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[index] = value >>> 0;
	}
	return table;
})();

function crc32(buffer) {
	let value = 0xffffffff;
	for (const byte of buffer) {
		value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
	}
	return (value ^ 0xffffffff) >>> 0;
}

function sha256(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}

function dosDateTime(date) {
	const year = Math.max(1980, date.getFullYear());
	return {
		date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
	};
}

function createZip(entries) {
	const localParts = [];
	const centralParts = [];
	let localOffset = 0;
	const timestamp = dosDateTime(new Date());
	for (const entry of entries) {
		const name = Buffer.from(entry.path, "utf8");
		const compressed = deflateRawSync(entry.content, { level: 9 });
		const checksum = crc32(entry.content);
		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4);
		localHeader.writeUInt16LE(0x0800, 6);
		localHeader.writeUInt16LE(8, 8);
		localHeader.writeUInt16LE(timestamp.time, 10);
		localHeader.writeUInt16LE(timestamp.date, 12);
		localHeader.writeUInt32LE(checksum, 14);
		localHeader.writeUInt32LE(compressed.length, 18);
		localHeader.writeUInt32LE(entry.content.length, 22);
		localHeader.writeUInt16LE(name.length, 26);
		localHeader.writeUInt16LE(0, 28);
		localParts.push(localHeader, name, compressed);

		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(0x02014b50, 0);
		centralHeader.writeUInt16LE(0x0314, 4);
		centralHeader.writeUInt16LE(20, 6);
		centralHeader.writeUInt16LE(0x0800, 8);
		centralHeader.writeUInt16LE(8, 10);
		centralHeader.writeUInt16LE(timestamp.time, 12);
		centralHeader.writeUInt16LE(timestamp.date, 14);
		centralHeader.writeUInt32LE(checksum, 16);
		centralHeader.writeUInt32LE(compressed.length, 20);
		centralHeader.writeUInt32LE(entry.content.length, 24);
		centralHeader.writeUInt16LE(name.length, 28);
		centralHeader.writeUInt16LE(0, 30);
		centralHeader.writeUInt16LE(0, 32);
		centralHeader.writeUInt16LE(0, 34);
		centralHeader.writeUInt16LE(0, 36);
		centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
		centralHeader.writeUInt32LE(localOffset, 42);
		centralParts.push(centralHeader, name);
		localOffset += localHeader.length + name.length + compressed.length;
	}
	const central = Buffer.concat(centralParts);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(central.length, 12);
	end.writeUInt32LE(localOffset, 16);
	end.writeUInt16LE(0, 20);
	return Buffer.concat([...localParts, central, end]);
}

function shouldInclude(relativePath) {
	const normalized = relativePath.replaceAll("\\", "/");
	return !normalized.startsWith("tests/")
		&& normalized !== "AGENTS.md"
		&& normalized !== "daedalus-integrity.json"
		&& normalized !== "assets/icons/normalize_daedalus_icons.py"
		&& normalized !== "tools/run_plugin_tests.ps1"
		&& !normalized.includes("/__pycache__/")
		&& !normalized.endsWith(".pyc");
}

async function collectFiles(directory) {
	const entries = [];
	for (const name of await readdir(directory)) {
		const path = join(directory, name);
		const info = await stat(path);
		if (info.isDirectory()) {
			entries.push(...await collectFiles(path));
		} else {
			const relativePath = relative(sourceRoot, path).replaceAll("\\", "/");
			if (shouldInclude(relativePath)) {
				entries.push({
					path: `addons/godot_daedalus/${relativePath}`,
					content: await readFile(path)
				});
			}
		}
	}
	return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function buildGodotUidPaths(entries) {
	const pathByUid = new Map();
	const uidByPath = new Map();
	const register = (uid, resourcePath) => {
		if (!uid || !resourcePath || pathByUid.has(uid)) {
			return;
		}
		pathByUid.set(uid, resourcePath);
		uidByPath.set(resourcePath, uid);
	};

	for (const entry of entries) {
		const relativePath = entry.path.replace("addons/godot_daedalus/", "");
		const resourcePath = `res://addons/godot_daedalus/${relativePath}`;
		const content = entry.content.toString("utf8");
		if (entry.path.endsWith(".uid")) {
			register(content.trim(), resourcePath.slice(0, -4));
			continue;
		}
		if (entry.path.endsWith(".tscn") || entry.path.endsWith(".tres")) {
			register(content.match(/^\[(?:gd_scene|gd_resource).*?uid="(uid:\/\/[^"]+)"/mu)?.[1], resourcePath);
			for (const line of content.split(/\r?\n/u)) {
				if (!line.startsWith("[ext_resource")) {
					continue;
				}
				register(
					line.match(/\buid="(uid:\/\/[^"]+)"/u)?.[1],
					line.match(/\bpath="([^"]+)"/u)?.[1]
				);
			}
		}
	}

	return { pathByUid, uidByPath };
}

function normalizeGodotResourceReferences(entries) {
	const { pathByUid, uidByPath } = buildGodotUidPaths(entries);
	const normalizedImports = entries.map((entry) => {
		if (!entry.path.endsWith(".import")) {
			return entry;
		}
		const content = entry.content.toString("utf8");
		const sourcePath = content.match(/^source_file="([^"]+)"/mu)?.[1];
		const expectedUid = sourcePath === undefined ? undefined : uidByPath.get(sourcePath);
		const normalizedUid = expectedUid === undefined
			? content
			: content.replace(/^uid="uid:\/\/[^"]+"/mu, `uid="${expectedUid}"`);
		const normalized = normalizedUid
			// Preserve the importer for static SVG/TTF preloads, but never ship stale cache.
			.replace(/^path="[^"]+"\r?\n/mu, "")
			.replace(/^metadata=\{[\s\S]*?^\}\r?\n?/mu, "")
			.replace(/^dest_files=\[[^\r\n]*\]\r?\n/mu, "");
		return { ...entry, content: Buffer.from(normalized, "utf8") };
	});
	const portableSceneResources = normalizedImports.map((entry) => {
		if (!entry.path.endsWith(".tscn") && !entry.path.endsWith(".tres")) {
			return entry;
		}
		const normalized = entry.content
			.toString("utf8")
			.replace(/(\[ext_resource[^\r\n]*?)\suid="uid:\/\/[^"]+"/gu, "$1");
		return { ...entry, content: Buffer.from(normalized, "utf8") };
	});

	const unresolvedUids = new Set();
	const normalizedEntries = portableSceneResources.map((entry) => {
		if (!entry.path.endsWith(".gd")) {
			return entry;
		}
		const normalized = entry.content.toString("utf8").replace(/preload\("(uid:\/\/[^"]+)"\)/gu, (match, uid) => {
			const resourcePath = pathByUid.get(uid);
			if (resourcePath === undefined) {
				unresolvedUids.add(uid);
				return match;
			}
			return `preload("${resourcePath}")`;
		});
		return { ...entry, content: Buffer.from(normalized, "utf8") };
	});

	if (unresolvedUids.size > 0) {
		throw new Error(`Plugin contains UID-only preloads without a packaged resource path: ${[...unresolvedUids].sort().join(", ")}.`);
	}
	for (const entry of normalizedEntries) {
		const content = entry.content.toString("utf8");
		if ((entry.path.endsWith(".tscn") || entry.path.endsWith(".tres")) && /\[ext_resource[^\r\n]*\suid="uid:\/\//u.test(content)) {
			throw new Error(`Plugin scene resource still has a UID-based external dependency: ${entry.path}.`);
		}
		if (entry.path.endsWith(".gd") && /preload\("uid:\/\//u.test(content)) {
			throw new Error(`Plugin script still has a UID-only preload: ${entry.path}.`);
		}
	}

	return normalizedEntries;
}

function readSourceCommit() {
	if (process.env.GODOT_DAEDALUS_SOURCE_COMMIT) {
		return process.env.GODOT_DAEDALUS_SOURCE_COMMIT;
	}
	try {
		return execFileSync("git", ["-c", `safe.directory=${sourceRepository.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], {
			cwd: sourceRepository,
			encoding: "utf8",
			windowsHide: true
		}).trim();
	} catch {
		return "unknown";
	}
}

function download(url, redirects = 0) {
	if (redirects > 5) {
		return Promise.reject(new Error("Too many redirects while downloading the Godot plugin."));
	}
	return new Promise((resolveDownload, rejectDownload) => {
		https.get(url, {
			headers: { "User-Agent": "daedalus-studio-build" }
		}, (response) => {
			if (
				response.statusCode >= 300
				&& response.statusCode < 400
				&& typeof response.headers.location === "string"
			) {
				response.resume();
				resolveDownload(download(new URL(response.headers.location, url).toString(), redirects + 1));
				return;
			}
			if (response.statusCode !== 200) {
				response.resume();
				rejectDownload(new Error(`Cannot download ${url}, status ${response.statusCode}.`));
				return;
			}
			const chunks = [];
			response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
			response.on("end", () => resolveDownload(Buffer.concat(chunks)));
			response.on("error", rejectDownload);
		}).on("error", rejectDownload);
	});
}

async function prepareFromRelease() {
	const version = packageManifest.godotPluginVersion;
	const releaseRoot = `https://github.com/LuYingYiLong/godot-daedalus/releases/download/v${version}`;
	const releaseManifestName = `godot-daedalus-plugin-v${version}.manifest.json`;
	const [archive, manifestBuffer] = await Promise.all([
		download(`${releaseRoot}/${archiveName}`),
		download(`${releaseRoot}/${releaseManifestName}`)
	]);
	const releaseManifest = JSON.parse(manifestBuffer.toString("utf8"));
	if (
		releaseManifest.pluginVersion !== version
		|| releaseManifest.archive?.fileName !== archiveName
		|| releaseManifest.archive?.size !== archive.length
		|| releaseManifest.archive?.sha256 !== sha256(archive)
		|| !Array.isArray(releaseManifest.files)
	) {
		throw new Error("Downloaded Godot plugin release manifest failed verification.");
	}
	const manifest = {
		...releaseManifest,
		studioVersion: packageManifest.version
	};
	await rm(outputRoot, { recursive: true, force: true });
	await mkdir(outputRoot, { recursive: true });
	await writeFile(archivePath, archive);
	await writeFile(join(outputRoot, "plugin-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	process.stdout.write(`Prepared ${relative(root, archivePath)} from the fixed v${version} release.\n`);
}

async function main() {
	if (!existsSync(sourceRoot)) {
		await prepareFromRelease();
		return;
	}
	const pluginConfig = await readFile(join(sourceRoot, "plugin.cfg"), "utf8");
	const pluginVersion = pluginConfig.match(/^\s*version\s*=\s*"([^"]+)"/mu)?.[1];
	if (pluginVersion !== packageManifest.godotPluginVersion) {
		throw new Error(
			`Plugin source version ${pluginVersion || "unknown"} does not match package.json godotPluginVersion ${packageManifest.godotPluginVersion}.`
		);
	}
	const pluginMetadata = JSON.parse(await readFile(join(sourceRoot, "daedalus-plugin.json"), "utf8"));
	if (
		pluginMetadata.pluginVersion !== pluginVersion
		|| pluginMetadata.studioVersion !== packageManifest.version
		|| !Number.isInteger(pluginMetadata.pluginProtocolVersion)
		|| pluginMetadata.pluginProtocolVersion < 1
		|| typeof pluginMetadata.minGodotVersion !== "string"
		|| !/^\d+\.\d+\.\d+$/u.test(pluginMetadata.minGodotVersion)
	) {
		throw new Error(
			"Plugin metadata does not match the Studio package manifest or contains an invalid protocol/minimum Godot version."
		);
	}
	const pluginProtocolVersion = pluginMetadata.pluginProtocolVersion;
	const files = normalizeGodotResourceReferences(await collectFiles(sourceRoot));
	if (!files.some((entry) => entry.path === "addons/godot_daedalus/plugin.cfg")) {
		throw new Error("Godot plugin source does not contain plugin.cfg.");
	}
	const integrityContent = Buffer.from(`${JSON.stringify({
		schemaVersion: 1,
		pluginVersion,
		pluginProtocolVersion,
		files: files.map((entry) => ({
			path: entry.path,
			size: entry.content.length,
			sha256: sha256(entry.content)
		}))
	}, null, 2)}\n`, "utf8");
	files.push({
		path: "addons/godot_daedalus/daedalus-integrity.json",
		content: integrityContent
	});
	files.sort((left, right) => left.path.localeCompare(right.path));
	const archive = createZip(files);
	const manifest = {
		schemaVersion: 1,
		pluginVersion,
		pluginProtocolVersion,
		studioVersion: packageManifest.version,
		minGodotVersion: pluginMetadata.minGodotVersion,
		sourceCommit: readSourceCommit(),
		sourceTag: `v${pluginVersion}`,
		publishedAt: new Date().toISOString(),
		archive: {
			fileName: archiveName,
			size: archive.length,
			sha256: sha256(archive)
		},
		files: files.map((entry) => ({
			path: entry.path,
			size: entry.content.length,
			sha256: sha256(entry.content)
		}))
	};
	await rm(outputRoot, { recursive: true, force: true });
	await mkdir(outputRoot, { recursive: true });
	await writeFile(archivePath, archive);
	await writeFile(join(outputRoot, "plugin-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	process.stdout.write(`Prepared ${relative(root, archivePath)} (${files.length} files).\n`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
