import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import svgr from "vite-plugin-svgr";

export default defineConfig({
	main: {
		build: {
			rollupOptions: {
				external: ["node-pty"],
				input: {
					index: resolve(__dirname, "src/main/index.ts")
				}
			}
		}
	},
	preload: {
		build: {
			rollupOptions: {
				input: {
					index: resolve(__dirname, "src/preload/index.ts")
				}
			}
		}
	},
	renderer: {
		root: resolve(__dirname, "src/renderer"),
		plugins: [react(), svgr()],
		resolve: {
			alias: [
				{
					find: /^decode-named-character-reference$/,
					replacement: resolve(__dirname, "node_modules/decode-named-character-reference/index.js")
				},
				{
					find: "@",
					replacement: resolve(__dirname, "src/renderer/src")
				},
				{
					find: "@renderer",
					replacement: resolve(__dirname, "src/renderer/src")
				}
			]
		},
		build: {
			rollupOptions: {
				input: {
					index: resolve(__dirname, "src/renderer/index.html")
				}
			}
		}
	}
});
