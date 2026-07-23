export function getDistanceFromBottomByMetrics(scrollHeight: number, scrollTop: number, clientHeight: number): number {
	return Math.max(0, scrollHeight - scrollTop - clientHeight);
}

export function isNearBottomByMetrics(scrollHeight: number, scrollTop: number, clientHeight: number, threshold: number): boolean {
	return getDistanceFromBottomByMetrics(scrollHeight, scrollTop, clientHeight) <= threshold;
}

export function shouldAutoFollowViewport(isCurrentlyFollowing: boolean, distanceFromBottom: number, pauseThreshold: number, resumeThreshold: number): boolean {
	return distanceFromBottom <= (isCurrentlyFollowing ? pauseThreshold : resumeThreshold);
}

export function shouldAutoFollowAppend(isNearBottom: boolean, hasRunningAssistantBlock: boolean, blockCountIncreased: boolean): boolean {
	return isNearBottom && (hasRunningAssistantBlock || blockCountIncreased);
}
