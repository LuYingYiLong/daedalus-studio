import type { FileEditSnapshot } from "@/platform/rpc/file-edit-api";
import { createFileEditUnifiedDiff } from "@/domain/conversation/file-edit-diff";

export type InlineDiffPreviewRow = {
	kind: "context" | "addition" | "deletion" | "hunk";
	lineNumber: number | null;
	text: string;
};

export type InlineDiffPreviewModel = {
	rows: InlineDiffPreviewRow[];
	truncated: boolean;
	unavailable: boolean;
};

export type InlineDiffPreviewPosition = {
	left: number;
	width: number;
	maxHeight: number;
	top?: number;
	bottom?: number;
};

const MAX_PREVIEW_ROWS = 12;
const MAX_PREVIEW_EDIT_COUNT = 3;
const MAX_PREVIEW_TEXT_CHARS = 300_000;

export function getInlineDiffPreviewPosition(
	anchor: Pick<DOMRect, "left" | "top" | "bottom" | "width">,
	viewportWidth: number,
	viewportHeight: number,
): InlineDiffPreviewPosition {
	const margin = 8;
	const width = Math.min(anchor.width * 0.9, Math.max(0, viewportWidth - margin * 2));
	const centeredLeft = anchor.left + (anchor.width - width) / 2;
	const left = Math.max(margin, Math.min(centeredLeft, viewportWidth - margin - width));
	const spaceAbove = Math.max(0, anchor.top - margin);
	const spaceBelow = Math.max(0, viewportHeight - anchor.bottom - margin);
	const above = spaceAbove >= 320 || spaceAbove >= spaceBelow;
	const maxHeight = Math.min(360, above ? spaceAbove : spaceBelow);
	return above
		? { left, width, maxHeight, bottom: viewportHeight - anchor.top }
		: { left, width, maxHeight, top: anchor.bottom };
}

export function buildInlineDiffPreviewModel(edits: FileEditSnapshot[]): InlineDiffPreviewModel {
	const rows: InlineDiffPreviewRow[] = [];
	let truncated = edits.length > MAX_PREVIEW_EDIT_COUNT;
	let unavailable = false;
	for (const edit of edits.slice(-MAX_PREVIEW_EDIT_COUNT)) {
		if ((edit.beforeText?.length ?? 0) + (edit.afterText?.length ?? 0) > MAX_PREVIEW_TEXT_CHARS) {
			unavailable = true;
			continue;
		}
		const patch = createFileEditUnifiedDiff(edit);
		if (patch === null) {
			unavailable = true;
			continue;
		}
		let oldLine = 0;
		let newLine = 0;
		for (const line of patch.split("\n").slice(2)) {
			if (line.startsWith("@@")) {
				const range = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
				if (range !== null) {
					oldLine = Number(range[1]);
					newLine = Number(range[2]);
				}
				rows.push({ kind: "hunk", lineNumber: null, text: line });
			} else if (line.startsWith("+")) {
				rows.push({ kind: "addition", lineNumber: newLine++, text: line.slice(1) });
			} else if (line.startsWith("-")) {
				rows.push({ kind: "deletion", lineNumber: oldLine++, text: line.slice(1) });
			} else if (line.startsWith(" ")) {
				rows.push({ kind: "context", lineNumber: newLine++, text: line.slice(1) });
				oldLine += 1;
			}
		}
	}
	if (rows.length > MAX_PREVIEW_ROWS) {
		truncated = true;
		return {
			rows: [
				...rows.slice(0, 6),
				{ kind: "hunk", lineNumber: null, text: "…" },
				...rows.slice(-5),
			],
			truncated,
			unavailable,
		};
	}
	return { rows, truncated, unavailable };
}
