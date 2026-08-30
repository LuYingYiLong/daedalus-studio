import type { BrowserWindow, IpcMainInvokeEvent } from "electron";

export function assertComputerSender(
  event: Pick<IpcMainInvokeEvent, "sender" | "senderFrame">,
  main: BrowserWindow | null,
  settings: BrowserWindow | null = null,
): void {
  if (
    process.platform !== "win32" ||
    process.arch !== "x64" ||
    process.argv.includes("--scheduled-task-runner")
  )
    throw new Error("computer_unsupported");
  if (
    ![main, settings].some(
      (window) =>
        window &&
        !window.isDestroyed() &&
        !window.webContents.isDestroyed() &&
        window.webContents === event.sender &&
        event.senderFrame === window.webContents.mainFrame,
    )
  )
    throw new Error("computer_sender_not_allowed");
}
