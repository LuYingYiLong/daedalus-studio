const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
async function main() {
	if (process.platform !== "win32" || process.arch !== "x64")
		throw new Error("Windows x64 required");
	const result = spawnSync(
		"powershell.exe",
		[
			"-NoProfile",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			path.join(__dirname, "build-browser-host.ps1"),
		],
		{ stdio: "inherit", windowsHide: true },
	);
	if (result.error || result.status !== 0)
		throw result.error || new Error("Browser host build failed");
	const root = path.resolve(__dirname, "../build/browser-host");
	const manifest = { protocolVersion: 1, files: {} };
	for (const channel of ["stable", "development"]) {
		const name = `daedalus-browser-${channel}.exe`,
			bytes = await fs.readFile(path.join(root, name));
		manifest.files[name] = {
			sha256: createHash("sha256").update(bytes).digest("hex"),
			byteSize: bytes.length,
		};
	}
	await fs.writeFile(
		path.join(root, "manifest.json"),
		JSON.stringify(manifest, null, 2) + "\n",
	);
}
main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
