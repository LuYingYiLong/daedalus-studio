#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { chmod, copyFile, mkdir, readFile, rm } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

(async () => {
const projectRoot = resolve(__dirname, "..");
const studioPackage = require(join(projectRoot, "package.json"));
const configuredSource = process.env.DAEDALUS_BACKEND_SOURCE?.trim();
const backendSource = resolve(configuredSource || join(projectRoot, "..", "daedalus-backend"));
const backendPackagePath = join(backendSource, "package.json");
const backendBuildScript = join(backendSource, "scripts", "build-linux-sea.ts");
const payloadDir = join(backendSource, "dist", "sea-linux-x64", "work", "payload");
const targetDir = join(projectRoot, "build", "backend-bootstrap");
const executableName = "daedalus-backend";
const manifestName = "backend-manifest.json";

if (process.platform !== "linux") {
  console.log("[linux-backend] skipped outside Linux");
  process.exit(0);
}
if (!existsSync(backendPackagePath)) {
  throw new Error(`Backend source was not found at ${backendSource}. Set DAEDALUS_BACKEND_SOURCE to a checked-out backend repository.`);
}
if (!existsSync(backendBuildScript)) {
  throw new Error(`Linux backend build script was not found at ${backendBuildScript}.`);
}

const backendPackage = JSON.parse(require("node:fs").readFileSync(backendPackagePath, "utf8"));
if (backendPackage.version !== studioPackage.backendBootstrapVersion) {
  throw new Error(`Backend version ${backendPackage.version} does not match Studio backendBootstrapVersion ${studioPackage.backendBootstrapVersion}.`);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
console.log(`[linux-backend] building backend from ${backendSource}`);
execFileSync(npmCommand, ["run", "release:sea:linux"], {
  cwd: backendSource,
  env: process.env,
  stdio: "inherit",
});

const sourceExecutable = join(payloadDir, executableName);
const sourceManifest = join(payloadDir, manifestName);
if (!existsSync(sourceExecutable) || !existsSync(sourceManifest)) {
  throw new Error("[linux-backend] SEA build did not produce the expected payload.");
}

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
const targetExecutable = join(targetDir, executableName);
await copyFile(sourceExecutable, targetExecutable);
await chmod(targetExecutable, 0o755);
await copyFile(sourceManifest, join(targetDir, manifestName));
console.log(`[linux-backend] staged executable and manifest in ${targetDir}`);

})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
