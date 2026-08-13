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
const outputRoot = join(root, "build", "daedalus-bridge");
const siblingRepositoryRoot = join(root, "..", "daedalus-bridge");
const canonicalSourceRoot = join(root, "..", "daedalus-bridge", "addons", "daedalus_bridge");
const configuredSourceValue = process.env.DAEDALUS_BRIDGE_SOURCE?.trim();
const configuredSourceCandidate = configuredSourceValue ? resolve(configuredSourceValue) : null;
const configuredSourceRoot = configuredSourceCandidate === null
	? null
	: existsSync(join(configuredSourceCandidate, "addons", "daedalus_bridge"))
		? join(configuredSourceCandidate, "addons", "daedalus_bridge")
		: configuredSourceCandidate;
const siblingRepositoryExists = existsSync(siblingRepositoryRoot);
const sourceRoot = resolve(
	siblingRepositoryExists
		? canonicalSourceRoot
		: configuredSourceRoot ?? canonicalSourceRoot
);
const sourceRepository = resolve(sourceRoot, "..", "..");
const archiveName = `daedalus-bridge-v${packageManifest.godotBridgeVersion}.zip`;
const archivePath = join(outputRoot, archiveName);
const manifestPath = join(outputRoot, "plugin-manifest.json");
const isDevelopmentPreparation = process.argv.includes("--development");

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
	const lower = normalized.toLowerCase();
	return !normalized.startsWith("tests/")
		&& normalized !== "AGENTS.md"
		&& normalized !== "daedalus-integrity.json"
		&& normalized !== "assets/icons/normalize_daedalus_icons.py"
		&& normalized !== "tools/run_plugin_tests.ps1"
		&& !normalized.includes("/__pycache__/")
		&& !normalized.endsWith(".pyc")
		&& ![".uid", ".import", ".dll", ".so", ".dylib", ".a", ".wasm"].some((extension) => lower.endsWith(extension))
		&& !lower.endsWith(".gdextension");
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
					path: `addons/daedalus_bridge/${relativePath}`,
					content: await readFile(path)
				});
			}
		}
	}
	return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function readSourceCommit() {
	if (process.env.DAEDALUS_BRIDGE_SOURCE_COMMIT) {
		return process.env.DAEDALUS_BRIDGE_SOURCE_COMMIT;
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
		return Promise.reject(new Error("Too many redirects while downloading Daedalus Bridge."));
	}
	return new Promise((resolveDownload, rejectDownload) => {
		const request = https.get(url, {
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
		});
		request.setTimeout(30_000, () => {
			request.destroy(Object.assign(new Error(`Timed out while downloading ${url}.`), { code: "ETIMEDOUT" }));
		});
		request.on("error", rejectDownload);
	});
}

function isNetworkError(error) {
	const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
	return [
		"CERT_HAS_EXPIRED",
		"ECONNREFUSED",
		"ECONNRESET",
		"EAI_AGAIN",
		"ENETUNREACH",
		"ENOTFOUND",
		"ETIMEDOUT",
		"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
		"UNABLE_TO_GET_ISSUER_CERT",
		"UNABLE_TO_GET_ISSUER_CERT_LOCALLY"
	].includes(code);
}

async function hasUsablePreparedRelease() {
	try {
		const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
		const archive = await readFile(archivePath);
		return manifest.schemaVersion === 2
			&& manifest.bridgeVersion === packageManifest.godotBridgeVersion
			&& manifest.studioVersion === packageManifest.version
			&& manifest.archive?.fileName === archiveName
			&& manifest.archive?.size === archive.length
			&& manifest.archive?.sha256 === sha256(archive)
			&& Array.isArray(manifest.files);
	} catch {
		return false;
	}
}

async function usePreparedReleaseIfAvailable() {
	if (!await hasUsablePreparedRelease()) {
		return false;
	}
	process.stdout.write(`Using cached ${relative(root, archivePath)}; no Bridge download required.\n`);
	return true;
}

function printDevelopmentFallback(error) {
	const detail = error instanceof Error ? error.message : String(error);
	console.warn([
		"Daedalus Bridge is unavailable in this development checkout; continuing without Bridge packaging.",
		`Reason: ${detail}`,
		"To enable Bridge development, clone daedalus-bridge beside daedalus-studio, or set DAEDALUS_BRIDGE_SOURCE.",
		"If HTTPS is intercepted by a proxy or antivirus, configure NODE_EXTRA_CA_CERTS with its trusted root certificate.",
		"A production build still requires a verified Bridge package."
	].join("\n"));
}

async function prepareFromRelease() {
	const version = packageManifest.godotBridgeVersion;
	const releaseRoot = `https://github.com/LuYingYiLong/daedalus-bridge/releases/download/v${version}`;
	const releaseManifestName = `daedalus-bridge-v${version}.manifest.json`;
	const [archive, manifestBuffer] = await Promise.all([
		download(`${releaseRoot}/${archiveName}`),
		download(`${releaseRoot}/${releaseManifestName}`)
	]);
	const releaseManifest = JSON.parse(manifestBuffer.toString("utf8"));
	if (
		releaseManifest.bridgeVersion !== version
		|| releaseManifest.archive?.fileName !== archiveName
		|| releaseManifest.archive?.size !== archive.length
		|| releaseManifest.archive?.sha256 !== sha256(archive)
		|| !Array.isArray(releaseManifest.files)
	) {
		throw new Error("Downloaded Daedalus Bridge release manifest failed verification.");
	}
	const manifest = {
		...releaseManifest,
		studioVersion: packageManifest.version
	};
	await rm(outputRoot, { recursive: true, force: true });
	await mkdir(outputRoot, { recursive: true });
	await writeFile(archivePath, archive);
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	process.stdout.write(`Prepared ${relative(root, archivePath)} from the fixed v${version} release.\n`);
}

async function main() {
	if (!existsSync(sourceRoot)) {
		if (siblingRepositoryExists) {
			throw new Error(`Sibling Daedalus Bridge repository is missing addons/daedalus_bridge: ${siblingRepositoryRoot}`);
		}
		if (configuredSourceRoot !== null) {
			throw new Error(`DAEDALUS_BRIDGE_SOURCE is not a Daedalus Bridge repository or addon root: ${configuredSourceRoot}`);
		}
		if (await usePreparedReleaseIfAvailable()) {
			return;
		}
		try {
			await prepareFromRelease();
		} catch (error) {
			if (isDevelopmentPreparation && isNetworkError(error)) {
				printDevelopmentFallback(error);
				return;
			}
			throw error;
		}
		return;
	}
	const pluginConfig = await readFile(join(sourceRoot, "plugin.cfg"), "utf8");
	const bridgeVersion = pluginConfig.match(/^\s*version\s*=\s*"([^"]+)"/mu)?.[1];
	if (bridgeVersion !== packageManifest.godotBridgeVersion) {
		throw new Error(
			`Bridge source version ${bridgeVersion || "unknown"} does not match package.json godotBridgeVersion ${packageManifest.godotBridgeVersion}.`
		);
	}
	const pluginMetadata = JSON.parse(await readFile(join(sourceRoot, "daedalus-bridge.json"), "utf8"));
	if (
		pluginMetadata.bridgeVersion !== bridgeVersion
		|| pluginMetadata.studioVersion !== packageManifest.version
		|| pluginMetadata.bridgeProtocolVersion !== packageManifest.godotBridgeProtocolVersion
		|| pluginMetadata.name !== "Daedalus Bridge"
		|| pluginMetadata.pluginId !== "DaedalusBridge"
		|| pluginMetadata.installDirectory !== "addons/daedalus_bridge"
		|| typeof pluginMetadata.minGodotVersion !== "string"
		|| !/^\d+\.\d+\.\d+$/u.test(pluginMetadata.minGodotVersion)
	) {
		throw new Error(
			"Bridge metadata does not match the Studio package manifest, product identity, install directory, protocol, or minimum Godot version."
		);
	}
	const bridgeProtocolVersion = pluginMetadata.bridgeProtocolVersion;
	const files = await collectFiles(sourceRoot);
	if (!files.some((entry) => entry.path === "addons/daedalus_bridge/plugin.cfg")) {
		throw new Error("Daedalus Bridge source does not contain plugin.cfg.");
	}
	for (const entry of files) {
		if (entry.path.endsWith(".gd") && /uid:\/\//u.test(entry.content.toString("utf8"))) {
			throw new Error(`Daedalus Bridge script contains a UID reference: ${entry.path}.`);
		}
	}
	const integrityContent = Buffer.from(`${JSON.stringify({
		schemaVersion: 2,
		bridgeVersion,
		bridgeProtocolVersion,
		files: files.map((entry) => ({
			path: entry.path,
			size: entry.content.length,
			sha256: sha256(entry.content)
		}))
	}, null, 2)}\n`, "utf8");
	files.push({
		path: "addons/daedalus_bridge/daedalus-bridge-integrity.json",
		content: integrityContent
	});
	files.sort((left, right) => left.path.localeCompare(right.path));
	const archive = createZip(files);
	const manifest = {
		schemaVersion: 2,
		bridgeVersion,
		bridgeProtocolVersion,
		studioVersion: packageManifest.version,
		minGodotVersion: pluginMetadata.minGodotVersion,
		sourceCommit: readSourceCommit(),
		sourceTag: `v${bridgeVersion}`,
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
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	process.stdout.write(`Prepared ${relative(root, archivePath)} (${files.length} files).\n`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
