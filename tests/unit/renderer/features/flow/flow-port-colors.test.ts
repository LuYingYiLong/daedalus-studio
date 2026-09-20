import { describe, expect, it } from "vitest";
import {
	FLOW_PORT_COLORS,
	flowPortColor,
	flowPortColorKind,
	flowDefaultControl,
	type FlowPortDataType,
} from "@/widgets/flow/flow-port-colors";

const ALL_DATA_TYPES: FlowPortDataType[] = [
	"text",
	"json",
	"image",
	"video",
	"audio",
	"frames",
	"artifact",
	"number", "boolean", "color", "size", "mask",
];

describe("Flow port colors", () => {
	it("uses a stable color for every single data type", () => {
		for (const dataType of ALL_DATA_TYPES) {
			expect(flowPortColorKind([dataType])).toBe(dataType);
			expect(flowPortColor([dataType])).toBe(FLOW_PORT_COLORS[dataType]);
		}
		expect(FLOW_PORT_COLORS.text).toBe("#a65f2a");
	});

	it("uses blue for multi-type and all-type ports", () => {
		expect(flowPortColorKind(["text", "json"])).toBe("multiple");
		expect(flowPortColor(["text", "json"])).toBe("#1677ff");
		expect(flowPortColorKind(ALL_DATA_TYPES)).toBe("multiple");
		expect(flowPortColor(ALL_DATA_TYPES)).toBe("#1677ff");
	});

	it("uses gray when port metadata is unavailable", () => {
		expect(flowPortColorKind(undefined)).toBe("unknown");
		expect(flowPortColor([])).toBe("#8c8c8c");
	});
	it("selects generic controls from the shared type metadata", () => {
		expect(flowDefaultControl(["color"])).toBe("color");
		expect(flowDefaultControl(["size"])).toBe("size");
		expect(flowDefaultControl(["text", "json"])).toBeUndefined();
	});
});
