const { spawn } = require("node:child_process");
if (process.argv[2] === "leaf") {
	console.log(JSON.stringify({ leaf: process.pid }));
	setInterval(() => {}, 1_000);
} else {
	spawn(process.execPath, [__filename, "leaf"], { stdio: "inherit", detached: true });
	console.log(JSON.stringify({ root: process.pid }));
	if (process.argv[2] === "exit") setTimeout(() => process.exit(17), 500);
	else setInterval(() => {}, 1_000);
}
