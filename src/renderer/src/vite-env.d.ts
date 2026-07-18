/// <reference types="vite-plugin-svgr/client" />

export {};

declare global {
	interface ElectronVersions {
		chrome: string;
		electron: string;
		node: string;
	}

	interface BackendAPI {
		getPort: () => Promise<number>;
		getStatus: () => Promise<string>;
		healthCheck: () => Promise<boolean>;
		onStatusChanged: (callback: (status: string) => void) => () => void;
	}

	interface ClientPreferences {
		minimizeToTrayOnClose: boolean;
		lastComposerModel: {
			providerId: string;
			modelId: string;
		} | null;
	}

	interface ClientPreferencesAPI {
		get: () => Promise<ClientPreferences>;
		update: (patch: Partial<ClientPreferences>) => Promise<ClientPreferences>;
	}

	type WorkspaceLaunchTargetId = "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash";

	interface ElectronAPI {
		versions: ElectronVersions;
		backend: BackendAPI;
		clientPreferences: ClientPreferencesAPI;
		workspaceFs: {
			listChildren: (params: {
				workspaceRoot: string;
				relativePath?: string;
			}) => Promise<{
				entries: Array<{
					name: string;
					relativePath: string;
					resourcePath: string;
					kind: "file" | "folder";
				}>;
			}>;
			pickWorkspaceDirectory: () => Promise<string | null>;
			pickWorkspaceFiles: (params: { workspaceRoot: string }) => Promise<Array<{
				name: string;
				relativePath: string;
				resourcePath: string;
				kind: "file" | "folder";
			}> | null>;
			pickWorkspaceFolder: (params: { workspaceRoot: string }) => Promise<Array<{
				name: string;
				relativePath: string;
				resourcePath: string;
				kind: "file" | "folder";
			}> | null>;
			getPathForFile: (file: File) => string;
			createEntriesFromPaths: (params: { workspaceRoot: string; paths: string[] }) => Promise<Array<{
				name: string;
				relativePath: string;
				resourcePath: string;
				kind: "file" | "folder";
			}>>;
			openWorkspaceDirectory: (workspaceRoot: string) => Promise<{ opened: true }>;
			listLaunchTargets: () => Promise<Array<{
				id: WorkspaceLaunchTargetId;
				label: string;
			}>>;
			openLaunchTarget: (params: {
				workspaceRoot: string;
				targetId: WorkspaceLaunchTargetId;
			}) => Promise<{ opened: true; targetId: WorkspaceLaunchTargetId }>;
		};
		skillFs: {
			pickSkillZip: () => Promise<string | null>;
			pickSkillDirectory: () => Promise<string | null>;
		};
	}

	interface Window {
		electronAPI: ElectronAPI;
	}
}
