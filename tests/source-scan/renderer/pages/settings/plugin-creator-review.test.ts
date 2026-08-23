import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

async function source(path: string): Promise<string> {
	return await readFile(join(root, path), "utf8");
}

describe("@plugin-creator whole-package review", (): void => {
	it("routes backend review events into the Plugins settings page", async (): Promise<void> => {
		const eventStream = await source("src/renderer/src/app/runtime/hooks/useBackendEventStream.ts");
		const main = await source("src/main/index.ts");
		const settings = await source("src/renderer/src/widgets/settings/PluginsSettingsPage.tsx");

		expect(eventStream).toContain('event.event === "plugin.review.request"');
		expect(eventStream).toContain("openPluginReview");
		expect(main).toContain('openSettingsWindow("plugins")');
		expect(main).toContain('ipcMain.handle("window:consume-plugin-review"');
		expect(settings).toContain("consumePluginReview");
		expect(settings).toContain("developmentReview.reviewId");
		expect(settings).toContain("deferPluginReview");
	});

	it("shows generation and isolated-test context before trust", async (): Promise<void> => {
		const modal = await source("src/renderer/src/widgets/settings/plugins/PluginTrustModal.tsx");
		const chinese = JSON.parse(await source("src/renderer/src/platform/i18n/locales/zh-CN/common.json")) as Record<string, unknown>;
		const english = JSON.parse(await source("src/renderer/src/platform/i18n/locales/en-US/common.json")) as Record<string, unknown>;

		expect(modal).toContain("developmentReview.testCaseCount");
		expect(modal).toContain("settings.plugins.trustReview.later");
		expect(chinese).toBeTypeOf("object");
		expect(english).toBeTypeOf("object");
	});
});
