import { defineConfig } from "vite";
import { resolve } from "node:path";
import identities from "./native/browser-host/identities.json";
const channel =
	process.env.DAEDALUS_BROWSER_CHANNEL === "stable" ? "stable" : "development";
export default defineConfig({
	root: resolve("src/browser-extension"),
	base: "./",
	define: { __BROWSER_CHANNEL__: JSON.stringify(channel) },
	build: {
		target: "chrome120",
		outDir: resolve(`build/browser-extension/${channel}`),
		emptyOutDir: true,
		rollupOptions: {
			input: {
				worker: resolve("src/browser-extension/worker.ts"),
				status: resolve("src/browser-extension/status.html"),
			},
			output: { entryFileNames: "[name].js" },
		},
	},
	plugins: [
		{
			name: "extension-manifest",
			generateBundle() {
				this.emitFile({
					type: "asset",
					fileName: "manifest.json",
					source: JSON.stringify(
						{
							manifest_version: 3,
							name: `Daedalus Browser${channel === "development" ? " (Development)" : ""}`,
							version: "1.0.0",
							minimum_chrome_version: "120",
							key: identities[channel].key,
							permissions: ["debugger", "tabs", "nativeMessaging", "storage"],
							background: { service_worker: "worker.js", type: "module" },
							action: { default_popup: "status.html" },
							options_page: "status.html",
							content_security_policy: {
								extension_pages: "script-src 'self'; object-src 'none'",
							},
						},
						null,
						2,
					),
				});
			},
		},
	],
});
