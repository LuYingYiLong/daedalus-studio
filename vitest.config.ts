import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(__dirname, "src/renderer/src"),
			"@renderer": resolve(__dirname, "src/renderer/src"),
			"@main": resolve(__dirname, "src/main")
		}
	},
	test: {
		include: ["tests/**/*.test.ts"],
		globals: true,
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: ["node_modules/", "src/renderer/"]
		}
	}
});
