const { spawn } = require("node:child_process");
const { join } = require("node:path");

const repositoryDir = join(__dirname, "..");
const playwrightCli = join(repositoryDir, "node_modules", "@playwright", "test", "cli.js");
const child = spawn(process.execPath, [
	playwrightCli,
	"test",
	"tests/e2e/remote.spec.ts",
	"--project=android-remote",
], {
	cwd: repositoryDir,
	env: {
		...process.env,
		DAEDALUS_REMOTE_PREVIEW: "1",
	},
	stdio: "inherit",
});

child.on("close", (code) => {
	process.exit(code ?? 0);
});

child.on("error", (error) => {
	console.error(error);
	process.exit(1);
});
