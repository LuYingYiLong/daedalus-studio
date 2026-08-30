const { spawn } = require("node:child_process");
const { join } = require("node:path");
const { constants } = require("node:os");

function runManagedCommand(executable, args, { cwd, env = process.env }) {
	const windows = process.platform === "win32";
	const child = windows
		? spawn(join(process.env.SystemRoot || "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"), [
			"-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
			"-File", join(__dirname, "windows-process-job.ps1"),
		], {
			cwd, env: { ...env, DAEDALUS_MANAGED_COMMAND: JSON.stringify({ executable, args, cwd }) },
			stdio: ["pipe", "inherit", "inherit"], windowsHide: true,
		})
		: spawn(executable, args, { cwd, env, stdio: "inherit", detached: true });
	let stopping = false;
	let finished = false;
	let exitCode;
	let timer;
	const killGroup = (signal) => {
		if (!windows && child.pid) {
			try { process.kill(-child.pid, signal); } catch (error) {
				if (error.code !== "ESRCH") console.error("[dev-supervisor] Unable to stop process group.");
			}
		}
	};
	const force = () => {
		if (windows) {
			if (!finished) child.kill(); // OS closes the non-inherited job handle
		} else killGroup("SIGKILL");
	};
	const stop = (signal) => {
		if (stopping || finished) return;
		stopping = true;
		exitCode = 128 + (constants.signals[signal] || 1);
		if (windows) child.stdin.end();
		else killGroup(signal);
		timer = setTimeout(force, 3_000);
	};
	const signals = ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"];
	const listeners = signals.map((signal) => {
		const listener = () => stop(signal);
		process.on(signal, listener);
		return listener;
	});
	process.once("exit", force);
	child.stdin?.on("error", () => {});
	const finish = (code) => {
		if (finished) return;
		finished = true;
		clearTimeout(timer);
		killGroup("SIGKILL");
		process.removeListener("exit", force);
		signals.forEach((signal, index) => process.removeListener(signal, listeners[index]));
		process.exit(exitCode ?? code);
	};
	// Descendants can inherit stdout: waiting only for 'close' can hang forever.
	child.once("exit", (code, signal) => finish(code ?? (128 + (constants.signals[signal] || 1))));
	child.once("error", () => {
		console.error("[dev-supervisor] Failed to launch the development process.");
		finish(1);
	});
	return child;
}

module.exports = { runManagedCommand };
