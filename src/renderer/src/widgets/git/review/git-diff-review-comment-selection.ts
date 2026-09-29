import type { ChangeData, HunkData } from "react-diff-view";

export type GitDiffReviewCommentTarget = {
	path: string;
	hunkIndex: number;
	startIndex: number;
	endIndex: number;
	oldLine?: number;
	newLine?: number;
	lineStart: number;
	lineEnd: number;
	lineText: string;
};

export function getReviewLineNumber(change: ChangeData): number {
	return change.type === "normal" ? change.newLineNumber : change.lineNumber;
}

export function getReviewLineCoordinates(
	change: ChangeData,
): { oldLine?: number; newLine?: number } {
	if (change.type === "normal") {
		return {
			oldLine: change.oldLineNumber,
			newLine: change.newLineNumber,
		};
	}
	return change.type === "delete"
		? { oldLine: change.lineNumber }
		: { newLine: change.lineNumber };
}

export function createReviewCommentTarget(
	path: string,
	hunk: HunkData,
	hunkIndex: number,
	firstIndex: number,
	lastIndex: number,
): GitDiffReviewCommentTarget {
	const startIndex: number = Math.min(firstIndex, lastIndex);
	const endIndex: number = Math.max(firstIndex, lastIndex);
	const selectedChanges: ChangeData[] = hunk.changes.slice(
		startIndex,
		endIndex + 1,
	);
	const firstChange: ChangeData = selectedChanges[0];
	const lastChange: ChangeData = selectedChanges[selectedChanges.length - 1];
	return {
		path,
		hunkIndex,
		startIndex,
		endIndex,
		...getReviewLineCoordinates(lastChange),
		lineStart: getReviewLineNumber(firstChange),
		lineEnd: getReviewLineNumber(lastChange),
		lineText: selectedChanges
			.map((change: ChangeData): string => change.content)
			.join("\n")
			.slice(0, 2000),
	};
}
