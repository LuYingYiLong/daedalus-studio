import { createContext, useContext } from "react";

export type MarkdownWorkspaceLaunchTargetId = "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" | "godot";

export type MarkdownWorkspaceLaunchTarget = {
	id: MarkdownWorkspaceLaunchTargetId;
	label: string;
};

export type MarkdownResourceActionsContextValue = {
	workspaceRoots: readonly string[];
	godotExecutablePath: string | null;
	currentWorkspaceLaunch: MarkdownWorkspaceLaunchTarget | null;
	launchTargets: readonly MarkdownWorkspaceLaunchTarget[];
	openWebUrl: (url: string) => void;
	openHtmlFile: (params: { workspaceRoot: string; filePath: string }) => void;
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
