export {};

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
