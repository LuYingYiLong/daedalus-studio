import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

const projectDirectory: string = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: resolve(projectDirectory, "src/renderer"),
	base: "./",
	plugins: [react(), svgr()],
	resolve: {
		alias: [
			{
				find: /^decode-named-character-reference$/,
				replacement: resolve(projectDirectory, "node_modules/decode-named-character-reference/index.js"),
			},
			{
				find: "@",
				replacement: resolve(projectDirectory, "src/renderer/src"),
			},
			{
				find: "@renderer",
				replacement: resolve(projectDirectory, "src/renderer/src"),
			},
		],
	},
	build: {
		target: "chrome111",
		// AssetsPathHandler removes the /__app__/ URL prefix before resolving the
		// remaining path from the APK assets root.
		outDir: resolve(projectDirectory, "android/remote-control/app/build/generated/remoteAssets"),
		emptyOutDir: true,
		rollupOptions: {
			input: {
				connect: resolve(projectDirectory, "src/renderer/connect.html"),
				remote: resolve(projectDirectory, "src/renderer/native-remote.html"),
			},
		},
	},
});
