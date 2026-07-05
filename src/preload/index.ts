import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	versions: {
		chrome: process.versions.chrome,
		electron: process.versions.electron,
		node: process.versions.node
	}
});
