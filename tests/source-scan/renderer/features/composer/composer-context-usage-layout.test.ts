import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer context usage layout", () => {
	const source: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");
	const styles: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.module.css");

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
});
