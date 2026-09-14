const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const projectRoot = join(__dirname, "..");
const childEnv = { ...process.env };
const configuredNodeOptions = childEnv.NODE_OPTIONS?.trim() ?? "";
const hasHeapLimit = /(?:^|\s)--max-old-space-size=\d+(?:\s|$)/u.test(configuredNodeOptions);
if (!hasHeapLimit) {
  const heapSizeMb = childEnv.DAEDALUS_NODE_HEAP_MB?.trim() || "4096";
  childEnv.NODE_OPTIONS = [configuredNodeOptions, `--max-old-space-size=${heapSizeMb}`].filter(Boolean).join(" ");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: childEnv,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    console.error(`[build:linux] ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
run(process.execPath, [join(projectRoot, "scripts", "prepare-linux-backend-bootstrap.cjs")]);
run(npmCommand, ["run", "build"]);
run(process.execPath, [
  join(projectRoot, "node_modules", "electron-builder", "cli.js"),
  "--linux",
  ...process.argv.slice(2),
]);
