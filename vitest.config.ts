import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const configDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(configDirectory, "src/renderer/src"),
			"@renderer": resolve(configDirectory, "src/renderer/src"),
			"@main": resolve(configDirectory, "src/main")
		}
	},
	test: {
		include: [
			"tests/unit/**/*.test.ts",
			"tests/integration/**/*.test.ts",
			"tests/renderer/**/*.test.ts",
			"tests/static/**/*.test.ts",
			"tests/goal-state.test.ts",
			"tests/onboarding.test.ts",
		],
		globals: true,
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: [
				"src/**/*.ts",
				"src/renderer/src/app/runtime/**/*.tsx",
				"src/renderer/src/platform/rpc/**/*.ts",
			],
			exclude: ["node_modules/"]
		}
	}
});
