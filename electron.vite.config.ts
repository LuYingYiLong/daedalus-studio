import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import svgr from "vite-plugin-svgr";

export default defineConfig({
	main: {
		build: {
			rollupOptions: {
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
			alias: {
				"@": resolve(__dirname, "src/renderer/src"),
				"@renderer": resolve(__dirname, "src/renderer/src")
			}
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
