const CATEGORY_COLORS: Readonly<Record<string, string>> = {
	media: "#1677ff",
	"media-input": "#2f54eb",
	"media-processing": "#1677ff",
	"media-generation": "#eb2f96",
	"media-output": "#fa8c16",
	parameters: "#d46b08",
	workspace: "#389e0d",
	"workspace-media": "#52c41a",
	basic: "#3ebadd",
	collections: "#08979c",
	ai: "#722ed1",
};

/** Header colors are keyed by the same category IDs used by FlowNodePicker. */
export function flowNodeCategoryColor(category: string | undefined): string {
	const key = category?.trim().toLocaleLowerCase();
	return key === undefined || key.length === 0 ? "#595959" : (CATEGORY_COLORS[key] ?? "#595959");
}

export const FLOW_NODE_CATEGORY_COLORS = CATEGORY_COLORS;
