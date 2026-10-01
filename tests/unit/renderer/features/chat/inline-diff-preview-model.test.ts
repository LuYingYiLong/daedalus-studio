import { describe, expect, it } from "vitest";
import { buildInlineDiffPreviewModel, getInlineDiffPreviewPosition } from "@/widgets/conversation/inline-diff-preview-model";

describe("inline diff hover preview", () => {
	it("places the preview below a file near the top and above a file near the bottom", (): void => {
		const below = getInlineDiffPreviewPosition({ left: 100, top: 20, bottom: 60, width: 400 }, 1000, 700);
		expect(below.top).toBe(60);
		expect(below.bottom).toBeUndefined();
		expect(below.left).toBe(120);
		expect(below.width).toBe(360);
		expect(below.maxHeight).toBe(360);

		const above = getInlineDiffPreviewPosition({ left: 900, top: 620, bottom: 660, width: 200 }, 1000, 700);
		expect(above.bottom).toBe(80);
		expect(above.top).toBeUndefined();
		expect(above.width).toBe(180);
		expect(above.left + above.width).toBeLessThanOrEqual(992);
	});

	it("uses the edited file snapshot and keeps line numbers for additions and removals", (): void => {
		const preview = buildInlineDiffPreviewModel([{
			path: "src/example.ts",
			existedBefore: true,
			existsAfter: true,
			beforeText: "first\nold\nlast",
			afterText: "first\nnew\nlast",
			additions: 1,
			deletions: 1,
		}]);
		expect(preview.unavailable).toBe(false);
		expect(preview.rows).toContainEqual({ kind: "deletion", lineNumber: 2, text: "old" });
		expect(preview.rows).toContainEqual({ kind: "addition", lineNumber: 2, text: "new" });
	});

	it("reports non-text files without trying to render them", (): void => {
		const preview = buildInlineDiffPreviewModel([{
			path: "image.png",
			existedBefore: false,
			existsAfter: true,
			additions: 0,
			deletions: 0,
		}]);
		expect(preview.unavailable).toBe(true);
		expect(preview.rows).toHaveLength(0);
	});

	it("limits the number of preview rows for large text edits", (): void => {
		const preview = buildInlineDiffPreviewModel([{
			path: "log.txt",
			existedBefore: true,
			existsAfter: true,
			beforeText: Array.from({ length: 40 }, (_, index): string => `old ${index}`).join("\n"),
			afterText: Array.from({ length: 40 }, (_, index): string => `new ${index}`).join("\n"),
			additions: 40,
			deletions: 40,
		}]);
		expect(preview.rows.length).toBeLessThanOrEqual(12);
		expect(preview.truncated).toBe(true);
	});
});
