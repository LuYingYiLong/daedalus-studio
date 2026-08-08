import type { FileEditSnapshot } from "@/platform/rpc/file-edit-api";

function splitLines(text: string): string[] {
	return text.replace(/\r\n?/gu, "\n").split("\n");
}

function formatRange(start: number, count: number): string {
	return count === 1 ? String(start) : `${start},${count}`;
}

/**
 * File tools normally replace one bounded region. Keeping the shared prefix
 * and suffix gives a deterministic, bounded unified patch without adding a
 * general-purpose diff dependency to the renderer.
 */
export function createFileEditUnifiedDiff(edit: FileEditSnapshot): string | null {
	if (edit.beforeText === undefined || edit.afterText === undefined) {
		return null;
	}
	const before: string[] = splitLines(edit.beforeText);
	const after: string[] = splitLines(edit.afterText);
	let prefix: number = 0;
	while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
		prefix += 1;
	}
	let suffix: number = 0;
	while (
		suffix < before.length - prefix
		&& suffix < after.length - prefix
		&& before[before.length - suffix - 1] === after[after.length - suffix - 1]
	) {
		suffix += 1;
	}
	const context: number = 3;
	const beforeStart: number = Math.max(0, prefix - context);
	const afterStart: number = Math.max(0, prefix - context);
	const beforeEnd: number = Math.min(before.length, before.length - suffix + context);
	const afterEnd: number = Math.min(after.length, after.length - suffix + context);
	const leadingContext: string[] = before.slice(beforeStart, prefix);
	const removed: string[] = before.slice(prefix, before.length - suffix);
	const added: string[] = after.slice(prefix, after.length - suffix);
	const trailingContext: string[] = before.slice(before.length - suffix, beforeEnd);
	const beforeChunkLength: number = leadingContext.length + removed.length + trailingContext.length;
	const afterChunkLength: number = leadingContext.length + added.length + trailingContext.length;
	const lines: string[] = [
		`--- a/${edit.path}`,
		`+++ b/${edit.path}`,
		`@@ -${formatRange(beforeStart + 1, beforeChunkLength)} +${formatRange(afterStart + 1, afterChunkLength)} @@`
	];
	for (const line of leadingContext) lines.push(` ${line}`);
	for (const line of removed) lines.push(`-${line}`);
	for (const line of added) lines.push(`+${line}`);
	for (const line of trailingContext) lines.push(` ${line}`);
	return lines.join("\n");
}
