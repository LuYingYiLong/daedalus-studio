import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Session summary dialog layering", (): void => {
	it.each(["SessionSourcePreviewDialog.tsx", "SessionPlanPreviewDialog.tsx"])(
		"keeps %s above its list dialog",
		(fileName: string): void => {
			const source: string = readRepoFile("src", "renderer", "src", "widgets", "home", fileName);

			expect(source).toContain("theme.useToken()");
			expect(source).toContain("const { token } = theme.useToken();");
			expect(source).toContain("zIndex={token.zIndexPopupBase + 10}");
		}
	);
});
