import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("statistics metric grid", () => {
	it("keeps all metrics in one container-responsive row without horizontal scrolling", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "StatisticsSettingsPage.tsx");
		const stylesSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "StatisticsSettingsPage.module.css");

		expect(pageSource).not.toContain("<Divider");
		expect(pageSource).toContain("classNames={METRIC_CLASS_NAMES}");
		expect(stylesSource).toMatch(/\.content \{\s+container-type: inline-size;/);
		expect(stylesSource).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
		expect(stylesSource).toContain("@container (max-width: 650px)");
		expect(stylesSource).toContain("text-overflow: ellipsis");
		expect(stylesSource).not.toContain(".metricGrid,\n\t.chartGrid");
		expect(stylesSource).not.toMatch(/\.metricGrid \{[^}]*overflow: hidden;/s);
	});
});
