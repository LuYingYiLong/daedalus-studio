const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const result = spawnSync(process.execPath, [
	resolve(__dirname, "../node_modules/@playwright/test/cli.js"),
	"test", "tests/e2e/flow-performance.spec.ts", "--project=electron",
	"--output=test-results/flow-performance", ...process.argv.slice(2),
], {
	cwd: resolve(__dirname, ".."),
	env: { ...process.env, FLOW_PERF: "1" },
	stdio: "inherit",
	windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
