const CATEGORY_COLORS: Readonly<Record<string, string>> = {
	media: "#1677ff",
	"media-input": "#2f54eb",
	"media-processing": "#1677ff",
	"media-generation": "#eb2f96",
	"media-output": "#fa8c16",
	parameters: "#d46b08",
	workspace: "#389e0d",
	"workspace-media": "#52c41a",
	basic: "#444444",
	collections: "#08979c",
	ai: "#722ed1",
};

/** Header colors are keyed by the same category IDs used by FlowNodePicker. */
export function flowNodeCategoryColor(category: string | undefined): string {
	const key = category?.trim().toLocaleLowerCase();
	return key === undefined || key.length === 0 ? "#595959" : (CATEGORY_COLORS[key] ?? "#595959");
}

/** Returns a fixed contrast color for resize icons drawn over the node header. */
export function flowNodeResizeHandleColor(category: string | undefined): string {
	const color = flowNodeCategoryColor(category);
	const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
	const luminance = channels
		.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
		.reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
	return luminance > 0.179 ? "#1f1f1f" : "#ffffff";
}

export const FLOW_NODE_CATEGORY_COLORS = CATEGORY_COLORS;
