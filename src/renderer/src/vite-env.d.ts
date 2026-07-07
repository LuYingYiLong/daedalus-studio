/// <reference types="vite-plugin-svgr/client" />

export {};

interface BackendAPI {
    getPort: () => Promise<number>;
    getStatus: () => Promise<string>;
    healthCheck: () => Promise<boolean>;
    onStatusChanged: (callback: (status: string) => void) => () => void;
}

interface ElectronAPI {
    versions: {
        chrome: string;
        electron: string;
        node: string;
    };
    backend: BackendAPI;
}

declare global {
	interface ElectronVersions {
		chrome: string;
		electron: string;
		node: string;
	}

	interface ElectronAPI {
		versions: ElectronVersions;
	}

	interface Window {
		electronAPI: ElectronAPI;
	}
}
