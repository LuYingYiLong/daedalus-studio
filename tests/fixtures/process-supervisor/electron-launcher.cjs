const { join } = require("node:path");
const { runManagedCommand } = require("../../../scripts/lib/managed-command.cjs");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
runManagedCommand(require("electron"), [
	"--disable-gpu", "--disable-software-rasterizer", "--in-process-gpu",
	join(__dirname, "electron-window.cjs"), `--user-data-dir=${process.argv[2]}`,
], { cwd: process.cwd(), env });
