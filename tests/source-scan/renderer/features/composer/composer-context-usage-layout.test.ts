import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer context usage layout", () => {
	const source: string = readRepoFile("src", "renderer", "src", "widgets", "composer", "Composer.tsx");
	const styles: string = readRepoFile("src", "renderer", "src", "widgets", "composer", "Composer.module.css");
	const chineseLocale: string = readRepoFile("src", "renderer", "src", "platform", "i18n", "locales", "zh-CN", "common.json");
	const englishLocale: string = readRepoFile("src", "renderer", "src", "platform", "i18n", "locales", "en-US", "common.json");

	it("renders token totals and percentages as aligned columns without a text separator", () => {
		expect(source).toContain("contextUsageBreakdown");
		expect(source).toContain("contextUsageRow");
		expect(source).toContain("contextUsageValue");
		expect(source).toContain("contextUsagePercent");
		expect(source).not.toContain("formatTokenCount(item.tokens)} ·");
		expect(styles).toContain("grid-template-columns: minmax(0, 1fr) 56px 44px;");
		expect(styles).toContain("font-variant-numeric: tabular-nums;");
	});

	it("separates pressure and largest-contributor labels semantically", () => {
		expect(source).toContain("contextUsagePressure");
		expect(source).toContain("composer.contextUsage.pressureLevel");
		expect(source).toContain("composer.contextUsage.largestContributor");
	});

	it("uses one continuous progress bar with a success segment", () => {
		expect(source).toContain("success={{");
		expect(source).toContain("contextUsageRailColor");
		expect(source).not.toContain("contextUsageBase");
		expect(source).not.toContain("contextUsageOverlay");
	});

	it("localizes backend compression reasons before showing the disabled tooltip", () => {
		expect(source).toContain("localizeContextCompressionReason");
		expect(source).toContain("Not enough messages");
		expect(source).toContain("compressDisabled.notEnoughMessages");
		expect(chineseLocale).toContain('"notEnoughMessages": "消息数量不足"');
		expect(englishLocale).toContain('"notEnoughMessages": "Not enough messages"');
	});
});
