const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
async function extractVCRuntime(cache, output) {
  const bytes = await fs.readFile(path.join(cache, "vcredist.exe"));
  const directory = path.join(cache, "vcredist");
  await fs.mkdir(directory, { recursive: true });
  let index = 0;
  for (
    let offset = bytes.indexOf("MSCF");
    offset >= 0;
    offset = bytes.indexOf("MSCF", offset + 4)
  ) {
    if (offset + 36 >= bytes.length || bytes.readUInt32LE(offset + 4) !== 0)
      continue;
    const size = bytes.readUInt32LE(offset + 8);
    if (
      size < 36 ||
      offset + size > bytes.length ||
      bytes[offset + 24] !== 3 ||
      bytes[offset + 25] !== 1
    )
      continue;
    const cab = path.join(directory, `payload-${index}.cab`),
      target = path.join(directory, `payload-${index++}`);
    await fs.writeFile(cab, bytes.subarray(offset, offset + size));
    await fs.mkdir(target, { recursive: true });
    const result = spawnSync("expand.exe", ["-F:*", cab, target], {
      windowsHide: true,
      encoding: "utf8",
    });
    if (result.status !== 0)
      throw new Error("VC runtime cabinet extraction failed");
    console.log("Extracted VC cabinet:", target);
  }
  const manifest = await fs.readFile(
    path.join(directory, "payload-0/0"),
    "utf8",
  );
  const payloads = [
    ...manifest.matchAll(
      /<Payload\b[^>]*FilePath="([^"]+)"[^>]*SourcePath="([^"]+)"[^>]*>/g,
    ),
  ];
  const payload = payloads.find(
    (match) =>
      match[1].includes("vcRuntimeMinimum_amd64") && match[1].endsWith(".cab"),
  );
  if (!payload || !/^a\d+$/.test(payload[2]))
    throw new Error("VC runtime payload not found");
  const runtime = path.join(directory, "runtime");
  await fs.mkdir(runtime, { recursive: true });
  const result = spawnSync(
    "expand.exe",
    ["-F:*", path.join(directory, "payload-1", payload[2]), runtime],
    { windowsHide: true },
  );
  if (result.status !== 0) throw new Error("VC runtime DLL extraction failed");
  await fs.mkdir(output, { recursive: true });
  for (const name of [
    "msvcp140.dll",
    "msvcp140_1.dll",
    "vcruntime140.dll",
    "vcruntime140_1.dll",
  ])
    await fs.copyFile(
      path.join(runtime, `${name}_amd64`),
      path.join(output, name),
    );
  // 此固定版安装包的英文再分发许可，随 DLL 提供；不运行安装程序
  await fs.copyFile(
    path.join(directory, "payload-0/u4"),
    path.join(output, "VC-RUNTIME-LICENSE.rtf"),
  );
  return directory;
}
module.exports = { extractVCRuntime };
if (require.main === module)
  extractVCRuntime(
    path.resolve(".cache/computer"),
    path.resolve("build/computer-observation"),
  ).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
