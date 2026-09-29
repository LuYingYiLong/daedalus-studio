import { describe, expect, it } from "vitest";
import { parseDiff, type FileData, type HunkData } from "react-diff-view";
import {
	createReviewCommentTarget,
	getReviewLineCoordinates,
} from "@/widgets/git/review/git-diff-review-comment-selection";

const PATCH = [
	"diff --git a/demo.ts b/demo.ts",
	"index 1111111..2222222 100644",
	"--- a/demo.ts",
	"+++ b/demo.ts",
	"@@ -1,3 +1,3 @@",
	" alpha",
	"-old",
	"+new",
	" omega",
].join("\n");

const parsedFile: FileData = parseDiff(PATCH)[0];
const hunk: HunkData = parsedFile.hunks[0];

describe("Git diff review comment selection", () => {
	it("supports comments on unchanged lines with both line coordinates", () => {
		const target = createReviewCommentTarget("demo.ts", hunk, 0, 0, 0);
		expect(target).toMatchObject({
			oldLine: 1,
			newLine: 1,
			lineStart: 1,
			lineEnd: 1,
			lineText: "alpha",
		});
	});

	it("keeps old and new coordinates distinct on changed lines", () => {
		expect(getReviewLineCoordinates(hunk.changes[1])).toEqual({ oldLine: 2 });
		expect(getReviewLineCoordinates(hunk.changes[2])).toEqual({ newLine: 2 });
	});

	it("normalizes a reverse drag and anchors the inline editor after the range", () => {
		const target = createReviewCommentTarget("demo.ts", hunk, 0, 3, 0);
		expect(target).toMatchObject({
			startIndex: 0,
			endIndex: 3,
			oldLine: 3,
			newLine: 3,
			lineStart: 1,
			lineEnd: 3,
			lineText: "alpha\nold\nnew\nomega",
		});
	});
});
