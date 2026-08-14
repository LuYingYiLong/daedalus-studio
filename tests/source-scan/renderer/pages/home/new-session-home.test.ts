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
		expect(styles).toContain("transform: translateY(4px);");
		expect(styles).toContain("starter-group-enter 160ms");
		expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
	});

	it("keeps the subtitle and starter actions in one responsive flow", () => {
		expect(source).toContain("<div className={styles.homeCenter}>");
		expect(source.indexOf("<div className={styles.homeCenter}>")).toBeLessThan(source.indexOf("<div className={styles.homeContent}>"));
		expect(styles).toContain(".homeCenter {");
		expect(styles).toContain("align-content: center;");
		expect(styles).toContain("overflow-x: hidden;");
		expect(styles).toContain("overflow-y: auto;");
		expect(styles).toContain("scrollbar-width: none;");
		expect(styles).toContain("-ms-overflow-style: none;");
		expect(styles).toContain(".homeCenter::-webkit-scrollbar {");
		expect(styles).toContain("display: none;");
		expect(styles).toContain("gap: var(--ds-space-3);");
		expect(styles).toContain("width: 100%;");
		expect(styles).toContain("overflow-wrap: anywhere;");
		expect(styles).toContain(".starterGroup {");
	});

	it("keeps errors out of the centered text layer", () => {
		const centerEnd: number = source.indexOf("</div>\n\t\t\t{errorMessage !== null ?");
		expect(centerEnd).toBeGreaterThan(0);
		const errorStart: number = source.indexOf("<Alert");
		expect(errorStart).toBeGreaterThan(centerEnd);
		expect(styles).toContain("bottom: var(--ds-space-4, 16px);");
	});

});
