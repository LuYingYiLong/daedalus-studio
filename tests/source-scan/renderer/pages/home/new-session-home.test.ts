import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("NewSessionHome source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "widgets", "home", "NewSessionHome.tsx");
	const styles: string = readRepoFile("src", "renderer", "src", "widgets", "home", "NewSessionHome.module.css");
	const homePage: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
	const composer: string = readRepoFile("src", "renderer", "src", "widgets", "composer", "Composer.tsx");

	it("uses a local-time greeting and workspace-aware starter prompts", () => {
		expect(source).toContain("getNewSessionGreetingPeriod(new Date().getHours())");
		expect(source).toContain("const hasComposerText: boolean = message.trim().length > 0;");
		expect(source).toContain("{hasComposerText === false ? (");
		expect(source).toContain('const starterScope: "unbound" | "workspace"');
		expect(source).toContain("app.home.starters.${starterScope}.${starter.id}.prompt");
	});

	it("keeps starter prompts reversible by inserting and focusing the composer", () => {
		expect(homePage).toContain("const handleHomeStarterSelect = useCallback");
		expect(homePage).toContain("setComposerInputRequest");
		expect(homePage).toContain("inputRequest={composerInputRequest ?? undefined}");
		expect(composer).toContain("lastInputRequestIdRef");
		expect(composer).toContain("window.requestAnimationFrame");
		expect(composer).toContain("focus({ preventScroll: true })");
		expect(composer).toContain("const caretIndex: number = inputRequest.message.length;");
		expect(composer).toContain("nativeTextArea.setSelectionRange(caretIndex, caretIndex);");
	});

	it("uses a concise entrance and respects reduced motion", () => {
		expect(styles).toContain("home-content-enter 160ms");
		expect(styles).toContain("transform: translate(-50%, calc(-50% + 4px));");
		expect(styles).toContain("starter-group-enter 160ms");
		expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
	});

	it("centers the text layer independently from the starter actions", () => {
		const contentEnd: number = source.indexOf("</div>\n\t\t\t{hasComposerText === false ?");
		expect(contentEnd).toBeGreaterThan(0);
		expect(source.indexOf("<div className={styles.homeContent}")).toBeLessThan(contentEnd);
		expect(styles).toContain("position: relative;");
		expect(styles).toContain("top: 50%;");
		expect(styles).toContain("left: 50%;");
		expect(styles).toContain("transform: translate(-50%, -50%);");
		expect(styles).toContain(".starterGroup {");
		expect(styles).toContain("top: calc(50% + clamp(");
	});

	it("keeps errors out of the centered text layer", () => {
		const contentEnd: number = source.indexOf("</div>\n\t\t\t{hasComposerText === false ?");
		const errorStart: number = source.indexOf("<Alert");
		expect(errorStart).toBeGreaterThan(contentEnd);
		expect(styles).toContain("bottom: var(--ds-space-4, 16px);");
	});
});
