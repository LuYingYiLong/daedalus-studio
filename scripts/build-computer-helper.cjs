const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const cache = path.join(root, ".cache/computer");
const output = path.join(root, "build/computer-observation");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw result.error || new Error(`${command} failed: ${result.status}`);
}
async function main() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("Windows x64 required");
  const lock = JSON.parse(
    await fs.readFile(
      path.join(root, "native/computer-observation/resources.lock.json"),
      "utf8",
    ),
  );
  await fs.mkdir(cache, { recursive: true });
  for (const resource of lock.resources) {
    const dest = path.join(cache, resource.name);
    let bytes = await fs.readFile(dest).catch(() => null);
    if (!bytes || digest(bytes) !== resource.sha256) {
      if (process.argv.includes("--offline"))
        throw new Error(`Missing verified resource: ${resource.name}`);
      const response = await fetch(resource.url);
      if (!response.ok)
        throw new Error(
          `Download failed: ${resource.name} (${response.status})`,
        );
      bytes = Buffer.from(await response.arrayBuffer());
      if (digest(bytes) !== resource.sha256)
        throw new Error(`SHA-256 mismatch: ${resource.name}`);
      await fs.writeFile(dest, bytes);
    }
  }
  run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(__dirname, "build-computer-helper.ps1"),
  ]);
  await fs.mkdir(output, { recursive: true });
  for (const name of [
    "det.onnx",
    "rec.onnx",
    "RapidOCR-LICENSE.txt",
    "PaddleOCR-LICENSE.txt",
  ])
    await fs.copyFile(path.join(cache, name), path.join(output, name));
  await require("./prepare-computer-vc-runtime.cjs").extractVCRuntime(
    cache,
    output,
  );
  run(path.join(output, "daedalus-computer-helper.exe"), [
    "--test-ocr",
    output,
  ]);
  const manifest = {
    protocolVersion: 1,
    modelVersion: lock.modelVersion,
    files: {},
  };
  for (const name of await fs.readdir(output)) {
    if (name === "manifest.json") continue;
    const bytes = await fs.readFile(path.join(output, name));
    manifest.files[name] = { sha256: digest(bytes), byteSize: bytes.length };
  }
  await fs.writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(`Computer observation runtime prepared: ${output}`);
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { digest };
