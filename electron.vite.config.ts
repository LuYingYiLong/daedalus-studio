import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import svgr from "vite-plugin-svgr";

const projectDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	main: {
		build: {
			rollupOptions: {
				external: ["node-pty"],
				input: {
					index: resolve(projectDirectory, "src/main/index.ts")
				}
			}
		}
	},
	preload: {
		build: {
			rollupOptions: {
				input: {
					index: resolve(projectDirectory, "src/preload/index.ts")
				}
			}
		}
	},
	renderer: {
		root: resolve(projectDirectory, "src/renderer"),
		plugins: [react(), svgr()],
		resolve: {
			alias: [
				{
					find: /^decode-named-character-reference$/,
					replacement: resolve(projectDirectory, "node_modules/decode-named-character-reference/index.js")
				},
				{
					find: "@",
					replacement: resolve(projectDirectory, "src/renderer/src")
				},
				{
					find: "@renderer",
					replacement: resolve(projectDirectory, "src/renderer/src")
				}
			]
		},
		build: {
			// remote.html is consumed by Android Chrome/WebView as well as Electron.
			// Keep the shared renderer syntax at Vite's broadly available baseline.
			target: "chrome111",
			rollupOptions: {
				input: {
					index: resolve(projectDirectory, "src/renderer/index.html"),
					remote: resolve(projectDirectory, "src/renderer/remote.html")
				}
			}
		}
	}
});
