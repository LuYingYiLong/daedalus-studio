import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("SessionPlansDialog progressive loading", (): void => {
	it("opens before loading the metadata-only plan list", (): void => {
		const homePageSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");

		expect(homePageSource).toContain("setPlansModalOpen(true);");
		expect(homePageSource).toContain("window.requestAnimationFrame");
		expect(homePageSource).toContain("includePlanPreviews: false");
	});

	it("loads one plan preview on demand and exposes local loading states", (): void => {
		const homePageSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
		const listDialogSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "SessionPlansDialog.tsx");
		const previewDialogSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "SessionPlanPreviewDialog.tsx");

		expect(homePageSource).toContain("void getPlan(plan.planId, activeSessionId)");
		expect(listDialogSource).toContain('<Spin size="small" />');
		expect(previewDialogSource).toContain("<Spin />");
		expect(previewDialogSource).toContain('<Alert type="error" showIcon message={error} />');
	});
});
