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

	interface ElectronAPI {
		versions: ElectronVersions;
		backend: BackendAPI;
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
			openWorkspaceDirectory: (workspaceRoot: string) => Promise<{ opened: true }>;
		};
	}

	interface Window {
		electronAPI: ElectronAPI;
	}
}
