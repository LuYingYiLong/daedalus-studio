const { runManagedCommand } = require("../../../scripts/lib/managed-command.cjs");
runManagedCommand(process.execPath, process.argv.slice(2), { cwd: process.cwd() });
if (process.send) process.on("message", (message) => {
	if (message === "interrupt") process.emit("SIGINT");
});
