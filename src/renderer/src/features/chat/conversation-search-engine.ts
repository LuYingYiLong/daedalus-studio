import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { SessionTimelineSearchDocument } from "@/api/types";

type MarkdownNode = {
	type: string;
	value?: unknown;
	children?: MarkdownNode[];
};

type SearchableTextBlock = {
	blockOffset: number;
	requestId: string;
	role: "user" | "assistant";
	text: string;
	normalizedText: string;
};

type MatchGroup = {
	searchBlockIndex: number;
	count: number;
	prefixCount: number;
	blockOccurrenceBase: number;
};

export type ConversationSearchMatch = {
	blockOffset: number;
	requestId: string;
	role: "user" | "assistant";
	occurrenceIndexInBlock: number;
};

export type ConversationSearchSummary = {
	total: number;
	ordinal: number;
	match: ConversationSearchMatch | null;
};

export type ConversationSearchWorkerRequest =
	| { type: "reset" }
	| { type: "upsert"; documents: SessionTimelineSearchDocument[] }
	| { type: "search"; requestId: number; query: string; ordinal?: number }
	| { type: "resolve"; requestId: number; ordinal: number };

export type ConversationSearchWorkerResponse =
	| { type: "ready" }
	| { type: "indexed" }
	| { type: "result"; requestId: number; total: number; ordinal: number; match: ConversationSearchMatch | null };

function asChildren(node: MarkdownNode): MarkdownNode[] {
	return Array.isArray(node.children) ? node.children : [];
}

function inlineChildrenVisibleText(children: MarkdownNode[]): string {
	let htmlDepth: number = 0;
	let output: string = "";
	for (const child of children) {
		if (child.type === "html") {
			const html: string = typeof child.value === "string" ? child.value.trim() : "";
			if (/^<\s*\//u.test(html)) {
				htmlDepth = Math.max(0, htmlDepth - 1);
			} else if (
				/^<\s*[A-Za-z]/u.test(html)
				&& !/\/\s*>$/u.test(html)
				&& !/^<\s*(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b/iu.test(html)
			) {
				htmlDepth += 1;
			}
			continue;
		}
		if (htmlDepth === 0) {
			output += inlineVisibleText(child);
		}
	}
	return output;
}

function inlineVisibleText(node: MarkdownNode): string {
	if (node.type === "text" || node.type === "inlineCode" || node.type === "code") {
		return typeof node.value === "string" ? node.value : "";
	}
	if (
		node.type === "html"
		|| node.type === "image"
		|| node.type === "imageReference"
		|| node.type === "definition"
		|| node.type === "footnoteDefinition"
	) {
		return "";
	}
	if (node.type === "break") {
		return "\n";
	}
	return inlineChildrenVisibleText(asChildren(node));
}

function pushVisibleBlock(output: string[], value: string, preserveWhitespace: boolean = false): void {
	const visibleText: string = preserveWhitespace
		? value.replace(/\r\n?/gu, "\n").replace(/\n$/u, "")
		: value.replace(/\s+/gu, " ").trim();
	if (visibleText.length > 0) {
		output.push(visibleText);
	}
}

function collectVisibleBlocks(node: MarkdownNode, output: string[]): void {
	if (node.type === "root" || node.type === "blockquote" || node.type === "list" || node.type === "listItem") {
		for (const child of asChildren(node)) {
			collectVisibleBlocks(child, output);
		}
		return;
	}
	if (node.type === "table") {
		for (const row of asChildren(node)) {
			for (const cell of asChildren(row)) {
				pushVisibleBlock(output, inlineVisibleText(cell));
			}
		}
		return;
	}
	if (node.type === "code") {
		pushVisibleBlock(output, typeof node.value === "string" ? node.value : "", true);
		return;
	}
	if (
		node.type === "paragraph"
		|| node.type === "heading"
		|| node.type === "tableCell"
		|| node.type === "delete"
	) {
		pushVisibleBlock(output, inlineVisibleText(node));
		return;
	}
	if (
		node.type === "html"
		|| node.type === "image"
		|| node.type === "imageReference"
		|| node.type === "definition"
		|| node.type === "footnoteDefinition"
		|| node.type === "thematicBreak"
	) {
		return;
	}
	for (const child of asChildren(node)) {
		collectVisibleBlocks(child, output);
	}
}

export function extractMarkdownVisibleBlocks(markdown: string): string[] {
	if (markdown.length === 0) {
		return [];
	}
	const tree: MarkdownNode = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.parse(markdown) as MarkdownNode;
	const output: string[] = [];
	collectVisibleBlocks(tree, output);
	return output;
}

function countNonOverlapping(text: string, query: string): number {
	let count: number = 0;
	let fromIndex: number = 0;
	while (fromIndex <= text.length - query.length) {
		const index: number = text.indexOf(query, fromIndex);
		if (index < 0) {
			break;
		}
		count += 1;
		fromIndex = index + query.length;
	}
	return count;
}

export class ConversationSearchEngine {
	private readonly searchableBlocksByOffset: Map<number, SearchableTextBlock[]> = new Map();
	private searchableBlocks: SearchableTextBlock[] = [];
	private matchGroups: MatchGroup[] = [];
	private total: number = 0;

	reset(): void {
		this.searchableBlocksByOffset.clear();
		this.searchableBlocks = [];
		this.matchGroups = [];
		this.total = 0;
	}

	upsertDocuments(documents: SessionTimelineSearchDocument[]): void {
		for (const document of documents) {
			this.searchableBlocksByOffset.set(
				document.blockOffset,
				document.markdownSegments.flatMap((markdown): SearchableTextBlock[] => (
					extractMarkdownVisibleBlocks(markdown).map((text): SearchableTextBlock => ({
						blockOffset: document.blockOffset,
						requestId: document.requestId,
						role: document.role,
						text,
						normalizedText: text.toLowerCase()
					}))
				))
			);
		}
		this.searchableBlocks = [...this.searchableBlocksByOffset.entries()]
			.sort(([leftOffset], [rightOffset]): number => leftOffset - rightOffset)
			.flatMap(([, blocks]): SearchableTextBlock[] => blocks);
	}

	search(rawQuery: string, requestedOrdinal?: number): ConversationSearchSummary {
		const query: string = rawQuery.trim().toLowerCase();
		this.matchGroups = [];
		this.total = 0;
		if (query.length === 0) {
			return { total: 0, ordinal: -1, match: null };
		}

		const occurrenceCountByBlock: Map<number, number> = new Map();
		for (let searchBlockIndex: number = 0; searchBlockIndex < this.searchableBlocks.length; searchBlockIndex += 1) {
			const block: SearchableTextBlock = this.searchableBlocks[searchBlockIndex]!;
			const count: number = countNonOverlapping(block.normalizedText, query);
			const blockOccurrenceBase: number = occurrenceCountByBlock.get(block.blockOffset) ?? 0;
			if (count > 0) {
				this.matchGroups.push({
					searchBlockIndex,
					count,
					prefixCount: this.total,
					blockOccurrenceBase
				});
				this.total += count;
			}
			occurrenceCountByBlock.set(block.blockOffset, blockOccurrenceBase + count);
		}
		const ordinal: number = this.total === 0
			? -1
			: requestedOrdinal === undefined
				? this.total - 1
				: Math.max(0, Math.min(requestedOrdinal, this.total - 1));
		return { total: this.total, ordinal, match: this.resolve(ordinal) };
	}

	resolve(ordinal: number): ConversationSearchMatch | null {
		if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= this.total) {
			return null;
		}
		let low: number = 0;
		let high: number = this.matchGroups.length - 1;
		while (low <= high) {
			const middle: number = Math.floor((low + high) / 2);
			const group: MatchGroup = this.matchGroups[middle]!;
			if (ordinal < group.prefixCount) {
				high = middle - 1;
				continue;
			}
			if (ordinal >= group.prefixCount + group.count) {
				low = middle + 1;
				continue;
			}
			const block: SearchableTextBlock = this.searchableBlocks[group.searchBlockIndex]!;
			return {
				blockOffset: block.blockOffset,
				requestId: block.requestId,
				role: block.role,
				occurrenceIndexInBlock: group.blockOccurrenceBase + ordinal - group.prefixCount
			};
		}
		return null;
	}

	getTotal(): number {
		return this.total;
	}
}
