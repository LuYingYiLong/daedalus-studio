import { describe, expect, it } from "vitest";
import { FLOW_NODE_CATEGORY_COLORS, flowNodeCategoryColor } from "@/widgets/flow/flow-node-category-colors";

describe("Flow node category colors", () => {
	it("uses one stable color for every picker category", () => {
		for (const [category, color] of Object.entries(FLOW_NODE_CATEGORY_COLORS))
			expect(flowNodeCategoryColor(category)).toBe(color);
		expect(flowNodeCategoryColor("AI")).toBe(FLOW_NODE_CATEGORY_COLORS.ai);
	});

	it("uses a neutral color for unknown or missing plugin categories", () => {
		expect(flowNodeCategoryColor(undefined)).toBe("#595959");
		expect(flowNodeCategoryColor("community/custom")).toBe("#595959");
	});
});
