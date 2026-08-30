const { runManagedCommand } = require("./lib/managed-command.cjs");
const { join } = require("node:path");

const childEnv = { ...process.env };

delete childEnv.ELECTRON_RUN_AS_NODE;

if (!childEnv.ELECTRON_MIRROR && !childEnv.npm_config_electron_mirror) {
	childEnv.ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/";
}

const electronViteCli = join(__dirname, "../node_modules/electron-vite/bin/electron-vite.js");
runManagedCommand(process.execPath, [electronViteCli, ...process.argv.slice(2)], {
	cwd: join(__dirname, ".."),
	env: childEnv
});
