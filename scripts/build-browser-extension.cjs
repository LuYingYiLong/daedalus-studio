const { spawnSync } = require("node:child_process");
const path = require("node:path");
for (const channel of ["development", "stable"]) {
	const result = spawnSync(
		process.execPath,
		[
			path.resolve(__dirname, "../node_modules/vite/bin/vite.js"),
			"build",
			"--configLoader",
			"runner",
			"--config",
			"vite.browser-extension.config.ts",
		],
		{
			cwd: path.resolve(__dirname, ".."),
			stdio: "inherit",
			windowsHide: true,
			env: { ...process.env, DAEDALUS_BROWSER_CHANNEL: channel },
		},
	);
	if (result.error || result.status !== 0) {
		process.exitCode = 1;
		break;
	}
	require("./browser-extension-zip.cjs")(
		path.resolve(__dirname, `../build/browser-extension/${channel}`),
		path.resolve(
			__dirname,
			`../build/browser-extension/daedalus-browser-${channel}.zip`,
		),
	);
}
