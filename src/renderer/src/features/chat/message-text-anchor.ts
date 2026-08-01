import type { MessageTextAnchor } from "@/api/types";

const SEGMENT_SELECTOR = "[data-message-selection-segment]";
const IGNORE_SELECTOR = "[data-message-selection-ignore], [data-chat-search-ignore]";
const MAX_QUOTE_CHARS = 8000;
const CONTEXT_CHARS = 800;

function getElement(node: Node | null): Element | null {
	return node instanceof Element ? node : node?.parentElement ?? null;
}

function isVisibleTextNode(node: Node, segment: HTMLElement): boolean {
	const parent: Element | null = node.parentElement;
	return parent !== null && segment.contains(parent) && parent.closest(IGNORE_SELECTOR) === null;
}

function getTextNodes(segment: HTMLElement): Text[] {
	const nodes: Text[] = [];
	const walker: TreeWalker = document.createTreeWalker(segment, NodeFilter.SHOW_TEXT, {
		acceptNode: (node: Node): number => isVisibleTextNode(node, segment)
			? NodeFilter.FILTER_ACCEPT
			: NodeFilter.FILTER_REJECT
	});
	for (let node: Node | null = walker.nextNode(); node !== null; node = walker.nextNode()) {
		nodes.push(node as Text);
	}
	return nodes;
}

function getOffset(nodes: readonly Text[], targetNode: Node, targetOffset: number): number | null {
	let offset: number = 0;
	for (const node of nodes) {
		if (node === targetNode) {
			return offset + Math.min(targetOffset, node.data.length);
		}
		offset += node.data.length;
	}
	return null;
}

export function createMessageTextAnchor(selection: Selection): { anchor: MessageTextAnchor; range: Range; segment: HTMLElement } | null {
	if (selection.isCollapsed || selection.rangeCount !== 1 || selection.anchorNode === null || selection.focusNode === null) {
		return null;
	}
	const anchorSegment: HTMLElement | null = getElement(selection.anchorNode)?.closest<HTMLElement>(SEGMENT_SELECTOR) ?? null;
	const focusSegment: HTMLElement | null = getElement(selection.focusNode)?.closest<HTMLElement>(SEGMENT_SELECTOR) ?? null;
	if (anchorSegment === null || anchorSegment !== focusSegment || anchorSegment.dataset.messageSelectionEnabled !== "true") {
		return null;
	}
	if (getElement(selection.anchorNode)?.closest(IGNORE_SELECTOR) !== null || getElement(selection.focusNode)?.closest(IGNORE_SELECTOR) !== null) {
		return null;
	}
	const range: Range = selection.getRangeAt(0).cloneRange();
	const nodes: Text[] = getTextNodes(anchorSegment);
	const startOffset: number | null = getOffset(nodes, range.startContainer, range.startOffset);
	const endOffset: number | null = getOffset(nodes, range.endContainer, range.endOffset);
	if (startOffset === null || endOffset === null || endOffset <= startOffset) {
		return null;
	}
	const text: string = nodes.map((node: Text): string => node.data).join("");
	const quote: string = text.slice(startOffset, endOffset);
	if (quote.trim().length === 0 || quote.length > MAX_QUOTE_CHARS) {
		return null;
	}
	const entryId: string = anchorSegment.dataset.messageSelectionEntryId ?? "";
	const requestId: string = anchorSegment.dataset.messageSelectionRequestId ?? "";
	const role: string = anchorSegment.dataset.messageSelectionRole ?? "";
	const segmentKey: string = anchorSegment.dataset.messageSelectionSegment ?? "";
	if (entryId.length === 0 || requestId.length === 0 || segmentKey.length === 0 || (role !== "user" && role !== "assistant")) {
		return null;
	}
	return {
		anchor: {
			entryId,
			requestId,
			role,
			segmentKey,
			startOffset,
			endOffset,
			quote,
			contextBefore: text.slice(Math.max(0, startOffset - CONTEXT_CHARS), startOffset),
			contextAfter: text.slice(endOffset, endOffset + CONTEXT_CHARS)
		},
		range,
		segment: anchorSegment
	};
}

export function getMessageAnchorKey(anchor: MessageTextAnchor): string {
	return [anchor.entryId, anchor.segmentKey, anchor.startOffset, anchor.endOffset, anchor.quote].join("\u0000");
}

export function getMessageSelectionContextId(anchor: MessageTextAnchor): string {
	let hash: number = 2166136261;
	for (const char of getMessageAnchorKey(anchor)) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return `message-selection-${(hash >>> 0).toString(36)}`;
}

export function resolveMessageTextAnchor(anchor: MessageTextAnchor, root: HTMLElement): Range | null {
	const segments: NodeListOf<HTMLElement> = root.querySelectorAll<HTMLElement>(SEGMENT_SELECTOR);
	const segment: HTMLElement | undefined = [...segments].find((candidate: HTMLElement): boolean => (
		candidate.dataset.messageSelectionEntryId === anchor.entryId
		&& candidate.dataset.messageSelectionSegment === anchor.segmentKey
	));
	if (segment === undefined) {
		return null;
	}
	const nodes: Text[] = getTextNodes(segment);
	const text: string = nodes.map((node: Text): string => node.data).join("");
	let resolvedStartOffset: number = anchor.startOffset;
	let resolvedEndOffset: number = anchor.endOffset;
	if (text.slice(resolvedStartOffset, resolvedEndOffset) !== anchor.quote) {
		const candidates: number[] = [];
		for (let index: number = text.indexOf(anchor.quote); index >= 0; index = text.indexOf(anchor.quote, index + 1)) {
			const beforeMatches: boolean = anchor.contextBefore.length === 0
				|| text.slice(Math.max(0, index - anchor.contextBefore.length), index) === anchor.contextBefore;
			const afterMatches: boolean = anchor.contextAfter.length === 0
				|| text.slice(index + anchor.quote.length, index + anchor.quote.length + anchor.contextAfter.length) === anchor.contextAfter;
			if (beforeMatches && afterMatches) candidates.push(index);
		}
		if (candidates.length !== 1) {
			return null;
		}
		resolvedStartOffset = candidates[0] as number;
		resolvedEndOffset = resolvedStartOffset + anchor.quote.length;
	}
	let cursor: number = 0;
	let start: { node: Text; offset: number } | null = null;
	let end: { node: Text; offset: number } | null = null;
	for (const node of nodes) {
		const next: number = cursor + node.data.length;
		if (start === null && resolvedStartOffset >= cursor && resolvedStartOffset <= next) {
			start = { node, offset: resolvedStartOffset - cursor };
		}
		if (resolvedEndOffset >= cursor && resolvedEndOffset <= next) {
			end = { node, offset: resolvedEndOffset - cursor };
			break;
		}
		cursor = next;
	}
	if (start === null || end === null) {
		return null;
	}
	const range: Range = document.createRange();
	range.setStart(start.node, start.offset);
	range.setEnd(end.node, end.offset);
	return range;
}
