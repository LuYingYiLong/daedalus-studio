export type FlowUnreadContext = {
	activeFlowId: string | null;
	flowId: string;
	surfaceVisible: boolean;
	windowFocused: boolean;
};

function addFlowId(currentFlowIds: ReadonlySet<string>, flowId: string): ReadonlySet<string> {
	if (currentFlowIds.has(flowId)) return currentFlowIds;
	const nextFlowIds: Set<string> = new Set(currentFlowIds);
	nextFlowIds.add(flowId);
	return nextFlowIds;
}

function removeFlowId(currentFlowIds: ReadonlySet<string>, flowId: string): ReadonlySet<string> {
	if (!currentFlowIds.has(flowId)) return currentFlowIds;
	const nextFlowIds: Set<string> = new Set(currentFlowIds);
	nextFlowIds.delete(flowId);
	return nextFlowIds;
}

export function applyFlowRunFinished(
	currentFlowIds: ReadonlySet<string>,
	context: FlowUnreadContext,
): ReadonlySet<string> {
	const isImmediatelyRead: boolean = context.windowFocused
		&& context.surfaceVisible
		&& context.activeFlowId === context.flowId;
	return isImmediatelyRead
		? removeFlowId(currentFlowIds, context.flowId)
		: addFlowId(currentFlowIds, context.flowId);
}

export function markActiveFlowRead(
	currentFlowIds: ReadonlySet<string>,
	activeFlowId: string | null,
	surfaceVisible: boolean,
	windowFocused: boolean,
): ReadonlySet<string> {
	if (!surfaceVisible || !windowFocused || activeFlowId === null) return currentFlowIds;
	return removeFlowId(currentFlowIds, activeFlowId);
}

export function removeUnreadFlows(
	currentFlowIds: ReadonlySet<string>,
	flowIds: Iterable<string>,
): ReadonlySet<string> {
	const removedFlowIds: Set<string> = new Set(flowIds);
	if (removedFlowIds.size === 0) return currentFlowIds;
	const nextFlowIds: Set<string> = new Set(
		[...currentFlowIds].filter((flowId: string): boolean => !removedFlowIds.has(flowId)),
	);
	return nextFlowIds.size === currentFlowIds.size ? currentFlowIds : nextFlowIds;
}
