export type VisibleRange = {
	startIndex: number;
	endIndex: number;
};

export function createPrefixHeights(heights: number[]): number[] {
	const prefix: number[] = [0];

	for (const height of heights) {
		prefix.push((prefix[prefix.length - 1] ?? 0) + height);
	}

	return prefix;
}

export function findIndexForOffset(prefixHeights: number[], offset: number): number {
	let low: number = 0;
	let high: number = Math.max(0, prefixHeights.length - 1);

	while (low < high) {
		const mid: number = Math.floor((low + high) / 2);
		if ((prefixHeights[mid + 1] ?? 0) < offset) {
			low = mid + 1;
		} else {
			high = mid;
		}
	}

	return low;
}

export function calculateVisibleRange(prefixHeights: number[], scrollTop: number, viewportHeight: number, blockCount: number, overscanBlocks: number): VisibleRange {
	return {
		startIndex: Math.max(0, findIndexForOffset(prefixHeights, scrollTop) - overscanBlocks),
		endIndex: Math.min(
			blockCount,
			findIndexForOffset(prefixHeights, scrollTop + viewportHeight) + overscanBlocks + 1
		)
	};
}

export function areVisibleRangesEqual(left: VisibleRange, right: VisibleRange): boolean {
	return left.startIndex === right.startIndex && left.endIndex === right.endIndex;
}

export function isNearBottomByMetrics(scrollHeight: number, scrollTop: number, clientHeight: number, threshold: number): boolean {
	return scrollHeight - scrollTop - clientHeight < threshold;
}

export function shouldAutoFollowAppend(isNearBottom: boolean, hasRunningAssistantBlock: boolean, blockCountIncreased: boolean): boolean {
	return isNearBottom && (hasRunningAssistantBlock || blockCountIncreased);
}
