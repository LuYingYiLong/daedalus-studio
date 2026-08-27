import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	testMatch: /\.spec\.ts$/,
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	expect: {
		timeout: 10_000,
	},
	retries: process.env.CI === "true" ? 1 : 0,
	projects: [
		{
			name: "electron",
			testIgnore: /remote\.spec\.ts$/,
		},
		{
			name: "android-remote",
			testMatch: /remote\.spec\.ts$/,
			use: {
				...devices["Pixel 7"],
				ignoreHTTPSErrors: true,
			},
		},
	],
	outputDir: "test-results/e2e",
	reporter: process.env.CI === "true"
		? [["line"], ["html", { outputFolder: "test-results/e2e-report", open: "never" }]]
		: "list",
	use: {
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
});
