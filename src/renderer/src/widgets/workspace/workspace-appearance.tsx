import type { CSSProperties } from "react";
import type { WorkspaceColor, WorkspaceConfig, WorkspaceIcon } from "@/platform/rpc/types";
import { Icon } from "@/assets/icons";

export const WORKSPACE_ICON_NAMES: Record<WorkspaceIcon, string> = {
	0: "folder",
	1: "test",
	2: "repair",
	3: "note",
	4: "heart",
	5: "code",
	6: "brain"
};

export const WORKSPACE_COLOR_VALUES: Record<WorkspaceColor, string> = {
	0: "currentColor",
	1: "#cf1322",
	2: "#d46b08",
	3: "#d4b106",
	4: "#389e0d",
	5: "#1677ff",
	6: "#722ed1",
	7: "#c41d7f"
};

export function getWorkspaceIconStyle(color: WorkspaceColor): CSSProperties | undefined {
	return color === 0 ? undefined : { color: WORKSPACE_COLOR_VALUES[color] };
}

export function WorkspaceIconView({
	workspace,
	width,
	height
}: {
	workspace: Pick<WorkspaceConfig, "icon" | "color">;
	width?: number;
	height?: number;
}): React.JSX.Element {
	return (
		<Icon
			name={WORKSPACE_ICON_NAMES[workspace.icon]}
			width={width}
			height={height}
			style={getWorkspaceIconStyle(workspace.color)}
		/>
	);
}
