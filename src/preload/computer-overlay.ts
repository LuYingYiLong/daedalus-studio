import { contextBridge, ipcRenderer } from "electron";

// 覆盖层不能读取窗口、执行输入或授予权限
contextBridge.exposeInMainWorld("computerOverlay", {
  ready: () => ipcRenderer.send("computer-overlay:ready"),
  pulse: () => ipcRenderer.send("computer-overlay:pulse"),
  cancel: () => ipcRenderer.send("computer-overlay:cancel"),
  resume: () => ipcRenderer.send("computer-overlay:resume"),
  subscribe: (listener: (state: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown): void =>
      listener(state);
    ipcRenderer.on("computer-overlay:state", handler);
    return () => ipcRenderer.removeListener("computer-overlay:state", handler);
  },
});
