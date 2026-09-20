import type { FlowNodePortDefinition } from "@/platform/rpc/types";

export type FlowPortDataType = FlowNodePortDefinition["dataTypes"][number];
export type FlowPortColorKind = FlowPortDataType | "multiple" | "unknown";

export const FLOW_PORT_COLORS: Readonly<Record<FlowPortColorKind, string>> = {
	number: "#9299a3", boolean: "#d78dba", color: "#d4c345", size: "#718ed9", mask: "#b9bec8",
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

export function installFlowTypePresentation(types: Record<string, { color: string; control: string }>): void {
	for (const [type, metadata] of Object.entries(types)) {
		if (/^#[a-f0-9]{6}$/iu.test(metadata.color)) (FLOW_PORT_COLORS as Record<string, string>)[type] = metadata.color;
		controls.set(type, metadata.control);
	}
}

const controls = new Map<string, string>([["number", "number"], ["boolean", "boolean"], ["color", "color"], ["size", "size"], ["text", "text"], ["json", "json"]]);
export function flowDefaultControl(types: readonly FlowPortDataType[] | undefined): string | undefined {
	return types?.length === 1 ? controls.get(types[0]!) : undefined;
}
