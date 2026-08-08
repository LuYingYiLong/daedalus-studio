import type { ConversationSearchMatch } from "@/domain/conversation/conversation-search-engine";

const ALL_HIGHLIGHT_NAME: string = "daedalus-conversation-search";
const ACTIVE_HIGHLIGHT_NAME: string = "daedalus-conversation-search-active";
const SEARCH_BLOCK_SELECTOR: string = "p,h1,h2,h3,h4,h5,h6,li,td,th,pre";

type HighlightLike = object;
type HighlightConstructor = new (...ranges: Range[]) => HighlightLike;
type HighlightRegistry = {
	set: (name: string, highlight: HighlightLike) => void;
	delete: (name: string) => void;
};

type TextPosition = {
	node: Text;
	offset: number;
};

type SearchTextMap = {
	text: string;
	positions: TextPosition[];
};

export type ConversationSearchHighlightResult = {
	activeElement: HTMLElement | null;
	usedHighlightApi: boolean;
};

function getHighlightApi(): { registry: HighlightRegistry; HighlightClass: HighlightConstructor } | null {
	const registry: HighlightRegistry | undefined = (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
	const HighlightClass: HighlightConstructor | undefined = (
		window as unknown as { Highlight?: HighlightConstructor }
	).Highlight;
	return registry === undefined || HighlightClass === undefined ? null : { registry, HighlightClass };
}

function isIgnoredTextNode(root: HTMLElement, textNode: Text): boolean {
	const parent: HTMLElement | null = textNode.parentElement;
	const ignoredAncestor: Element | null = parent?.closest("[data-chat-search-ignore]") ?? null;
	if (ignoredAncestor !== null && root.contains(ignoredAncestor)) {
		return true;
	}
	const owningSearchBlock: Element | null = parent?.closest(SEARCH_BLOCK_SELECTOR) ?? null;
	return owningSearchBlock !== null && owningSearchBlock !== root && root.contains(owningSearchBlock);
}

function createSearchTextMap(root: HTMLElement): SearchTextMap {
	const preserveWhitespace: boolean = root.tagName === "CODE" || root.tagName === "PRE";
	const walker: TreeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const positions: TextPosition[] = [];
	let text: string = "";
	let currentNode: Node | null = walker.nextNode();
	while (currentNode !== null) {
		const textNode: Text = currentNode as Text;
		if (!isIgnoredTextNode(root, textNode)) {
			const value: string = textNode.data;
			for (let offset: number = 0; offset < value.length; offset += 1) {
				const character: string = value[offset]!;
				if (!preserveWhitespace && /\s/u.test(character)) {
					if (text.length === 0 || text.endsWith(" ")) {
						continue;
					}
					text += " ";
					positions.push({ node: textNode, offset });
					continue;
				}
				text += character;
				positions.push({ node: textNode, offset });
			}
		}
		currentNode = walker.nextNode();
	}
	return { text: text.trimEnd(), positions };
}

function getSearchBlocks(wrapper: HTMLElement): HTMLElement[] {
	const primary: HTMLElement[] = Array.from(wrapper.querySelectorAll<HTMLElement>(SEARCH_BLOCK_SELECTOR));
	const codeBlocks: HTMLElement[] = Array.from(wrapper.querySelectorAll<HTMLElement>("code")).filter(
		(code: HTMLElement): boolean => {
			const containingPrimary: Element | null = code.parentElement?.closest(SEARCH_BLOCK_SELECTOR) ?? null;
			return containingPrimary === null || !wrapper.contains(containingPrimary);
		}
	);
	const blocks: HTMLElement[] = [...primary, ...codeBlocks]
		.filter((element: HTMLElement): boolean => !element.matches("[data-chat-search-ignore]"))
		.sort((left: HTMLElement, right: HTMLElement): number => {
			if (left === right) {
				return 0;
			}
			return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
		});
	return blocks.length > 0 ? blocks : [wrapper];
}

function createRange(textMap: SearchTextMap, start: number, length: number): Range | null {
	const startPosition: TextPosition | undefined = textMap.positions[start];
	const endPosition: TextPosition | undefined = textMap.positions[start + length - 1];
	if (startPosition === undefined || endPosition === undefined) {
		return null;
	}
	const range: Range = document.createRange();
	range.setStart(startPosition.node, startPosition.offset);
	range.setEnd(endPosition.node, endPosition.offset + 1);
	return range;
}

export function clearConversationSearchHighlights(container?: HTMLElement | null): void {
	const api = getHighlightApi();
	api?.registry.delete(ALL_HIGHLIGHT_NAME);
	api?.registry.delete(ACTIVE_HIGHLIGHT_NAME);
	if (container !== undefined && container !== null) {
		for (const element of container.querySelectorAll<HTMLElement>('[data-chat-search-active="true"]')) {
			element.removeAttribute("data-chat-search-active");
		}
	}
}

export function applyConversationSearchHighlights(
	container: HTMLElement,
	rawQuery: string,
	activeMatch: ConversationSearchMatch | null
): ConversationSearchHighlightResult {
	clearConversationSearchHighlights(container);
	const query: string = rawQuery.trim().toLowerCase();
	if (query.length === 0) {
		return { activeElement: null, usedHighlightApi: getHighlightApi() !== null };
	}

	const allRanges: Range[] = [];
	let activeRange: Range | null = null;
	let activeElement: HTMLElement | null = null;
	const occurrenceByBlockOffset: Map<number, number> = new Map();
	const wrappers: NodeListOf<HTMLElement> = container.querySelectorAll(
		"[data-chat-search-text][data-chat-search-block-offset]"
	);
	for (const wrapper of wrappers) {
		const blockOffset: number = Number(wrapper.dataset.chatSearchBlockOffset);
		if (!Number.isInteger(blockOffset)) {
			continue;
		}
		let occurrenceIndex: number = occurrenceByBlockOffset.get(blockOffset) ?? 0;
		for (const searchBlock of getSearchBlocks(wrapper)) {
			const textMap: SearchTextMap = createSearchTextMap(searchBlock);
			const normalizedText: string = textMap.text.toLowerCase();
			let fromIndex: number = 0;
			while (fromIndex <= normalizedText.length - query.length) {
				const matchIndex: number = normalizedText.indexOf(query, fromIndex);
				if (matchIndex < 0) {
					break;
				}
				const range: Range | null = createRange(textMap, matchIndex, query.length);
				if (range !== null) {
					allRanges.push(range);
					if (
						activeMatch !== null
						&& activeMatch.blockOffset === blockOffset
						&& activeMatch.occurrenceIndexInBlock === occurrenceIndex
					) {
						activeRange = range;
						activeElement = searchBlock;
					}
				}
				occurrenceIndex += 1;
				fromIndex = matchIndex + query.length;
			}
		}
		occurrenceByBlockOffset.set(blockOffset, occurrenceIndex);
	}

	const api = getHighlightApi();
	if (api !== null) {
		api.registry.set(ALL_HIGHLIGHT_NAME, new api.HighlightClass(...allRanges));
		if (activeRange !== null) {
			api.registry.set(ACTIVE_HIGHLIGHT_NAME, new api.HighlightClass(activeRange));
		}
	} else if (activeElement !== null) {
		activeElement.closest<HTMLElement>("[data-entry-id]")?.setAttribute("data-chat-search-active", "true");
	}
	return { activeElement, usedHighlightApi: api !== null };
}
