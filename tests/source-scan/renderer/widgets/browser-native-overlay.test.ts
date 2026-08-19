import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("browser native view overlays", () => {
	it("keeps a captured page frame behind modal renderer overlays", () => {
		const panelSource: string = readRepoFile("src", "renderer", "src", "widgets", "browser", "BrowserPanel.tsx");
		const occlusionSource: string = readRepoFile("src", "renderer", "src", "widgets", "browser", "native-view-occlusion.ts");
		expect(panelSource).toContain("window.electronAPI.browser.view");
		expect(panelSource).toContain(".capture(browserId)");
		expect(panelSource).toContain("styles.occlusionPreview");
		expect(occlusionSource).toContain(".ant-dropdown, .ant-popover");
		expect(occlusionSource).not.toContain(".ds-native-view-occluder");
		expect(panelSource).not.toContain("getFullscreenComposerBottomInset");
	});

	it("positions annotation input from the inspected element viewport rectangle", () => {
		const panelSource: string = readRepoFile("src", "renderer", "src", "widgets", "browser", "BrowserPanel.tsx");
		const inspectorSource: string = readRepoFile("src", "main", "services", "browser", "browser-inspector.ts");
		expect(inspectorSource).toContain("element.getBoundingClientRect()");
		expect(inspectorSource).toContain("viewportRect");
		expect(panelSource).toContain("snapshot.viewportRect.y");
		expect(panelSource).toContain("snapshot.viewportRect.height");
		expect(panelSource).toContain("style={annotationEditorStyle}");
	});

	it("dismisses the annotation editor outside it and only reports add failures", () => {
		const panelSource: string = readRepoFile("src", "renderer", "src", "widgets", "browser", "BrowserPanel.tsx");
		expect(panelSource).toContain('document.addEventListener("pointerdown"');
		expect(panelSource).toContain("annotationEditorRef.current?.contains(target)");
		expect(panelSource).toContain('t("browser.annotation.addFailed")');
		expect(panelSource).not.toContain('t("browser.annotation.added")');
		expect(panelSource).not.toContain('t("browser.actions.cancel")');
	});
});
