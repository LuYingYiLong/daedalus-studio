import type { FlowNodePortDefinition } from "@/platform/rpc/types";

export type FlowPortDataType = FlowNodePortDefinition["dataTypes"][number];
export type FlowPortColorKind = FlowPortDataType | "multiple" | "unknown";

export const FLOW_PORT_COLORS: Readonly<Record<FlowPortColorKind, string>> = {
	text: "#a65f2a",
	json: "#722ed1",
	image: "#13a8a8",
	video: "#d4388f",
	audio: "#d46b08",
	frames: "#2f54eb",
	artifact: "#d4b106",
	multiple: "#1677ff",
	unknown: "#8c8c8c",
};

export function flowPortColorKind(
	dataTypes: readonly FlowPortDataType[] | null | undefined,
): FlowPortColorKind {
	if (dataTypes === null || dataTypes === undefined || dataTypes.length === 0) return "unknown";
	const uniqueTypes = new Set<FlowPortDataType>(dataTypes);
	if (uniqueTypes.size !== 1) return "multiple";
	return uniqueTypes.values().next().value ?? "unknown";
}

export function flowPortColor(
	dataTypes: readonly FlowPortDataType[] | null | undefined,
): string {
	return FLOW_PORT_COLORS[flowPortColorKind(dataTypes)];
}
