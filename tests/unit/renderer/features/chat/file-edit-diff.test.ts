import { describe, expect, it } from "vitest";
import { createFileEditUnifiedDiff } from "@/features/chat/file-edit-diff";

describe("file edit diff", () => {
	it("keeps surrounding context while rendering a bounded text replacement", (): void => {
		const diff = createFileEditUnifiedDiff({
			path: "src/example.ts",
			existedBefore: true,
			existsAfter: true,
			beforeText: "one\ntwo\nthree\nfour",
			afterText: "one\nsecond\nthree\nfour",
			additions: 1,
			deletions: 1
		});

		expect(diff).toContain("--- a/src/example.ts");
		expect(diff).toContain("-two");
		expect(diff).toContain("+second");
		expect(diff).toContain(" three");
	});

	it("does not attempt a text diff when snapshots are unavailable", (): void => {
		expect(createFileEditUnifiedDiff({
			path: "assets/preview.png",
			existedBefore: false,
			existsAfter: true,
			additions: 0,
			deletions: 0,
			unavailableReason: "Binary file"
		})).toBeNull();
	});
});
