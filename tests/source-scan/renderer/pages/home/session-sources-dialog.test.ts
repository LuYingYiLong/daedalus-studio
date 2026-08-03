import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("SessionSourcesDialog source title layout", (): void => {
	it("keeps Ant Design button content shrinkable and truncates long titles", (): void => {
		const source: string = readRepoFile("src", "renderer", "src", "pages", "home", "SessionSourcesDialog.tsx");
		const css: string = readRepoFile("src", "renderer", "src", "pages", "home", "SessionSourcesDialog.module.css");

		expect(source).toContain("classNames={{ content: styles.sourceGridButtonContent }}");
		expect(source).toContain("title={source.title}");
		expect(css).toContain(".sourceGridButtonContent");
		expect(css).toContain(".summaryItemTitle,");
		expect(css).toContain("text-overflow: ellipsis;");
		expect(css).toContain("min-width: 0;");
	});

	it("loads visible source images asynchronously after the dialog opens", (): void => {
		const dialogSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "SessionSourcesDialog.tsx");
		const homePageSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");

		expect(homePageSource).toContain("setSourcesModalOpen(true);");
		expect(homePageSource).toContain("window.requestAnimationFrame");
		expect(homePageSource).toContain("includeSourceImages: false");
		expect(dialogSource).toContain("new IntersectionObserver");
		expect(dialogSource).toContain("fetchSessionOverviewSourceImageDataUrl");
		expect(dialogSource).toContain("<Skeleton.Node active");
		expect(dialogSource).toContain('decoding="async"');
	});
});
