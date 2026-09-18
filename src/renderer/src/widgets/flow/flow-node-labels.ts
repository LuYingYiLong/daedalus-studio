import type { TFunction } from "i18next";
import type { FlowNodeTypeDefinition } from "@/platform/rpc/types";

export function flowNodeTypeLabel(t: TFunction, definition: FlowNodeTypeDefinition): string {
	return t(`flow.editor.nodes.${definition.typeId}`, { defaultValue: definition.defaultTitle });
}

export function flowNodeParameterLabel(
	t: TFunction,
	typeId: string,
	parameterId: string,
	fallback: string,
): string {
	return t(`flow.editor.parameters.${typeId}.${parameterId}`, { defaultValue: fallback });
}

export function flowNodeOutputLabel(
	t: TFunction,
	typeId: string,
	outputId: string,
	fallback: string,
): string {
	return t(`flow.editor.outputs.${typeId}.${outputId}`, { defaultValue: fallback });
}
