const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const root = resolve(process.argv[2] || join(__dirname, "../build"));
const host = join(root, "browser-host");
const manifest = JSON.parse(readFileSync(join(host, "manifest.json"), "utf8"));
if (manifest.protocolVersion !== 1)
	throw new Error("Browser host protocol mismatch");
for (const channel of ["development", "stable"]) {
	const name = `daedalus-browser-${channel}.exe`;
	const bytes = readFileSync(join(host, name));
	if (
		createHash("sha256").update(bytes).digest("hex") !==
		manifest.files?.[name]?.sha256
	)
		throw new Error(`Browser host integrity failed: ${name}`);
	if (process.platform === "win32")
		execFileSync(join(host, name), ["--self-test"], {
			windowsHide: true,
			timeout: 10000,
			maxBuffer: 65536,
			stdio: "pipe",
		});
}
const extension = JSON.parse(
	readFileSync(join(root, "browser-extension/stable/manifest.json"), "utf8"),
);
const expected = require("../native/browser-host/identities.json").stable;
if (
	extension.manifest_version !== 3 ||
	extension.key !== expected.key ||
	JSON.stringify([...extension.permissions].sort()) !==
		JSON.stringify(["debugger", "nativeMessaging", "storage", "tabs"]) ||
	extension.host_permissions?.length
)
	throw new Error("Browser extension manifest mismatch");
console.log(
	"Browser host hashes, self-tests and MV3 extension manifest verified.",
);
