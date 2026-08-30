const { spawn, spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { join } = require("node:path");
const assert = require("node:assert/strict");
const directory = join(__dirname, "../build/computer-observation");
const executable = join(directory, "daedalus-computer-helper.exe");
function start() {
  return spawn(
    executable,
    ["--parent", String(process.pid), "--resources", directory],
    { windowsHide: true, stdio: "pipe" },
  );
}
function frame(value) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}
async function exchange(value) {
  const child = start();
  let bytes = Buffer.alloc(0);
  try {
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("native_protocol_timeout")),
        5000,
      );
      child.on("error", reject);
      child.stdout.on("data", (chunk) => {
        bytes = Buffer.concat([bytes, chunk]);
        if (bytes.length >= 4 && bytes.length >= bytes.readUInt32LE(0) + 4) {
          clearTimeout(timer);
          resolve(JSON.parse(bytes.subarray(4).toString()));
        }
      });
      child.stdin.write(frame(value));
    });
    return response;
  } finally {
    child.kill();
  }
}
async function main() {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json")));
  for (const [name, expected] of Object.entries(manifest.files)) {
    const bytes = readFileSync(join(directory, name));
    assert.equal(bytes.length, expected.byteSize, name);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      expected.sha256,
      name,
    );
  }
  const checks = [["--self-test"], ["--test-uia"], ["--test-ocr", directory]];
  if (process.argv.includes("--hardware")) checks.push(["--test-capture"], ["--test-input"]);
  for (const args of checks) {
    const result = spawnSync(executable, args, {
      windowsHide: true,
      stdio: "inherit",
      timeout: 20000,
    });
    assert.equal(result.status, 0);
  }
  assert.deepEqual(
    await exchange({ version: 2, id: "test", method: "hello", params: {} }),
    {
      id: "test",
      version: 2,
      ok: true,
      result: { version: 2, computerControl: true },
    },
  );
  for (const [method, params, code] of [
    ["click", {}, "computer_method_not_allowed"],
    ["select", { sourceId: "unknown" }, "computer_window_unavailable"],
    ["observe", {}, "computer_window_unavailable"],
    ["hello", { hwnd: 1 }, "computer_invalid_request"],
  ])
    assert.equal(
      (await exchange({ version: 2, id: "test", method, params })).error,
      code,
    );
  assert.equal(
    (await exchange({ version: 99, id: "test", method: "hello", params: {} }))
      .ok,
    false,
  );
  const child = start();
  const exit = new Promise((resolve) => child.on("exit", resolve));
  const oversized = Buffer.alloc(4);
  oversized.writeUInt32LE(16385);
  child.stdin.write(oversized);
  assert.equal(await exit, 3);
  // 模拟父进程退出，测试进程继续持有管道，确保不是仅靠 stdin EOF 退出
  const parent = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { windowsHide: true, stdio: "ignore" },
  );
  const supervised = spawn(
    executable,
    ["--parent", String(parent.pid), "--resources", directory],
    { windowsHide: true, stdio: "pipe" },
  );
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("parent_watchdog_start_timeout")),
        5000,
      );
      supervised.stdout.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
      supervised.stdin.write(
        frame({ version: 2, id: "parent", method: "hello", params: {} }),
      );
    });
    const exited = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("helper_survived_parent")),
        5000,
      );
      supervised.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    parent.kill();
    await exited;
  } finally {
    supervised.kill();
    parent.kill();
  }
  console.log(
    "Native resource hashes, offline OCR and control protocol tests passed (no user windows read).",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
