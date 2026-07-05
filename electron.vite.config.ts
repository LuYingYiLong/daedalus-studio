import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

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
		plugins: [react()],
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
