const { createHash } = require("node:crypto");
const { readdirSync, readFileSync } = require("node:fs");
const path = require("node:path");

// Android's asset packager may omit dot-prefixed files, so this baseline must
// use a visible name to remain readable through AssetManager at runtime.
const MANIFEST_FILE_NAME = "daedalus-sync-manifest.json";

function isSafeRelativePath(value) {
	return typeof value === "string"
		&& value.length > 0
		&& value.length <= 512
		&& !value.startsWith("/")
		&& !value.includes("\\")
		&& value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
		&& /^[A-Za-z0-9._/-]+$/u.test(value);
}

function walkFiles(directory, root = directory) {
	const result = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) result.push(...walkFiles(absolutePath, root));
		else if (entry.isFile()) {
			const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
			if (relativePath === MANIFEST_FILE_NAME) continue;
			if (!isSafeRelativePath(relativePath)) throw new Error(`Unsafe generated asset path: ${relativePath}`);
			result.push({ absolutePath, relativePath });
		}
	}
	return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function createAssetManifest(directory) {
	const files = {};
	for (const file of walkFiles(directory)) {
		const content = readFileSync(file.absolutePath);
		files[file.relativePath] = {
			size: content.byteLength,
			sha256: createHash("sha256").update(content).digest("hex"),
		};
	}
	const revision = createHash("sha256").update(JSON.stringify(files)).digest("hex");
	return { version: 1, revision, files };
}

module.exports = {
	MANIFEST_FILE_NAME,
	createAssetManifest,
	isSafeRelativePath,
};
