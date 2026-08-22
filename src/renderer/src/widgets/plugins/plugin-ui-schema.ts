export type PluginUiNode =
	| { type: "Text"; text: string }
	| { type: "Icon"; name: string }
	| { type: "Tag"; text: string; color?: string }
	| { type: "Alert"; message: string; typeValue?: "info" | "success" | "warning" | "error" }
	| { type: "Descriptions"; items: Array<{ label: string; value: string }> }
	| { type: "Input"; id: string; label?: string; value?: string; placeholder?: string }
	| { type: "Select"; id: string; label?: string; value?: string; options: Array<{ label: string; value: string }> }
	| { type: "Switch"; id: string; label?: string; checked?: boolean }
	| { type: "Button"; id: string; label: string; action?: string }
	| { type: "List"; items: Array<{ title: string; description?: string }> };

const allowedTypes = new Set<PluginUiNode["type"]>(["Text", "Icon", "Tag", "Alert", "Descriptions", "Input", "Select", "Switch", "Button", "List"]);

export function parsePluginUiView(value: unknown): PluginUiNode[] {
	if (!Array.isArray(value)) return [];
	return value.filter((node): node is PluginUiNode => {
		if (node === null || typeof node !== "object") return false;
		const type = (node as { type?: unknown }).type;
		return typeof type === "string" && allowedTypes.has(type as PluginUiNode["type"]);
	}).slice(0, 128);
}
