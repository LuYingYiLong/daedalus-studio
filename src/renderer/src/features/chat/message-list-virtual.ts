export function isNearBottomByMetrics(scrollHeight: number, scrollTop: number, clientHeight: number, threshold: number): boolean {
	return scrollHeight - scrollTop - clientHeight < threshold;
}

export function shouldAutoFollowAppend(isNearBottom: boolean, hasRunningAssistantBlock: boolean, blockCountIncreased: boolean): boolean {
	return isNearBottom && (hasRunningAssistantBlock || blockCountIncreased);
}
