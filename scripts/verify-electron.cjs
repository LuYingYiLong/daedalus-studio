const { existsSync, readFileSync, statSync } = require("node:fs");
const { dirname, isAbsolute, join } = require("node:path");

const packageJsonPath = require.resolve("electron/package.json");
const packageDirectory = dirname(packageJsonPath);
const packageVersion = JSON.parse(readFileSync(packageJsonPath, "utf8")).version;

// Electron 43 downloads its binary on the first require. Do this once before
// parallel test workers start so they cannot race while extracting the archive.
const electronPath = require("electron");

if (typeof electronPath !== "string" || !isAbsolute(electronPath)) {
	throw new Error("Electron did not resolve to an absolute executable path.");
}
if (!existsSync(electronPath) || !statSync(electronPath).isFile()) {
	throw new Error(`Electron executable is missing after installation: ${electronPath}`);
}

const installedVersionPath = join(packageDirectory, "dist", "version");
if (!existsSync(installedVersionPath)) {
	throw new Error("Electron installation is missing its version marker.");
}

const installedVersion = readFileSync(installedVersionPath, "utf8").trim().replace(/^v/, "");
if (installedVersion !== packageVersion) {
	throw new Error(
		`Electron binary version ${installedVersion || "<empty>"} does not match package version ${packageVersion}.`,
	);
}

console.log(`[verify-electron] Electron ${installedVersion} ready at ${electronPath}`);
