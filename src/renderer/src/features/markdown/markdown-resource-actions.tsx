import { createContext, useContext } from "react";

export type MarkdownWorkspaceLaunchTargetId = "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" | "godot";

export type MarkdownWorkspaceLaunchTarget = {
	id: MarkdownWorkspaceLaunchTargetId;
	label: string;
};

export type MarkdownResourceActionsContextValue = {
	workspaceRoot: string | null;
	godotExecutablePath: string | null;
	currentWorkspaceLaunch: MarkdownWorkspaceLaunchTarget | null;
	launchTargets: readonly MarkdownWorkspaceLaunchTarget[];
};

const MarkdownResourceActionsContext = createContext<MarkdownResourceActionsContextValue | null>(null);

export type MarkdownResourceActionsProviderProps = {
	value: MarkdownResourceActionsContextValue;
	children: React.ReactNode;
};

export function MarkdownResourceActionsProvider({ value, children }: MarkdownResourceActionsProviderProps): React.JSX.Element {
	return (
		<MarkdownResourceActionsContext.Provider value={value}>
			{children}
		</MarkdownResourceActionsContext.Provider>
	);
}

export function useMarkdownResourceActions(): MarkdownResourceActionsContextValue | null {
	return useContext(MarkdownResourceActionsContext);
}
