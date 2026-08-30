import {
  app,
  ipcMain,
  powerMonitor,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { basename, dirname, join } from "node:path";
import {
  computerId,
  computerObject,
  parseComputerObservation,
  type ComputerScope,
  type ComputerSource,
  type ComputerState,
} from "../../../contracts/computer-observation";
import { clientPreferencesService } from "../client-preferences";
import { ComputerService } from "./computer-service";
import { NativeComputerHelper, verifyComputerResources } from "./helper-client";
import { assertComputerSender } from "./sender-guard";

function sendToWindow(
  window: BrowserWindow | null,
  channel: "computer:state" | "computer:revoked",
  payload: ComputerState | (ComputerScope & { code: string }),
): void {
  // WebContents 会先于 BrowserWindow 销毁；撤销权限仍须完成，但不能再通知已销毁的页面
  if (!window || window.isDestroyed()) return;
  const contents = window.webContents;
  if (contents.isDestroyed()) return;
  try {
    contents.send(channel, payload);
  } catch (error) {
    // 仅忽略发送期间的销毁竞争，不掩盖有效页面上的 IPC 错误
    if (!contents.isDestroyed()) throw error;
  }
}

export function registerComputerIpc(
  getMain: () => BrowserWindow | null,
  getSettings: () => BrowserWindow | null,
): void {
  const appPath = app.getAppPath();
  const developmentRoot =
    basename(appPath) === "main" && basename(dirname(appPath)) === "out"
      ? dirname(dirname(appPath))
      : appPath;
  const directory = app.isPackaged
    ? join(process.resourcesPath, "computer-observation")
    : join(developmentRoot, "build/computer-observation");
  const helper = new NativeComputerHelper(directory);
  const diagnostic = new NativeComputerHelper(directory);
  let diagnosticGeneration = 0;
  let diagnosticSources = new Set<string>();
  const closeDiagnostics = (): void => {
    diagnosticGeneration++;
    diagnosticSources.clear();
    diagnostic.stop();
  };
  const broadcast = (state: ComputerState): void => {
    const main = getMain(),
      settings = getSettings();
    sendToWindow(main, "computer:state", state);
    sendToWindow(settings, "computer:state", {
      ...state,
      observation: null,
      sharing: null,
      pending: null,
    });
  };
  const service = new ComputerService(
    helper,
    broadcast,
    Date.now,
    (scope, code) => {
      sendToWindow(getMain(), "computer:revoked", { ...scope, code });
    },
  );
  const observed = new WeakSet<WebContents>();
  const guard = (event: IpcMainInvokeEvent, settings = false): void => {
    assertComputerSender(event, getMain(), settings ? getSettings() : null);
    if (!observed.has(event.sender)) {
      observed.add(event.sender);
      if (event.sender === getMain()?.webContents) {
        const revoke = (): void => {
          service.revoke();
          closeDiagnostics();
        };
        event.sender.on("destroyed", revoke);
        event.sender.on("render-process-gone", revoke);
        event.sender.on(
          "did-start-navigation",
          (_event, _url, inPlace, mainFrame) => {
            if (mainFrame && !inPlace) revoke();
          },
        );
      }
    }
  };
  const handle = (
    method: string,
    operation: (input: unknown, event: IpcMainInvokeEvent) => unknown,
    settings = false,
  ): void => {
    ipcMain.handle(`computer:${method}`, (event, input: unknown) => {
      guard(event, settings);
      return operation(input, event);
    });
  };
  handle(
    "getState",
    (_input, event) =>
      event.sender === getMain()?.webContents
        ? service.getState()
        : {
            ...service.getState(),
            observation: null,
            pending: null,
            sharing: null,
          },
    true,
  );
  handle(
    "setEnabled",
    async (input) => {
      if (typeof input !== "boolean")
        throw new Error("computer_invalid_request");
      if (!input) service.setEnabled(false);
      await clientPreferencesService.update({
        allowComputerObservation: input,
      });
      service.setEnabled(input);
    },
    true,
  );
  handle("setContext", (input) => {
    if (input === null) return service.setContext(null);
    const context = computerObject(input, [
      "connectionId",
      "sessionId",
      "workspaceId",
    ]);
    service.setContext({
      connectionId: computerId(context.connectionId),
      sessionId:
        context.sessionId === null ? null : computerId(context.sessionId),
      workspaceId:
        context.workspaceId === null ? null : computerId(context.workspaceId),
    });
  });
  handle("execute", (input) => {
    closeDiagnostics();
    return service.execute(input as Parameters<ComputerService["execute"]>[0]);
  });
  handle("cancel", (input) => service.cancel(computerId(input)));
  handle("finish", (input) => {
    const scope = computerObject(input, [
      "connectionId",
      "sessionId",
      "requestId",
      "runId",
    ]);
    for (const key of ["connectionId", "sessionId", "requestId", "runId"])
      computerId(scope[key]);
    service.finish(scope as ComputerScope);
  });
  handle("revoke", () => service.revoke());
  handle("list", () => service.list());
  handle("decide", (input) => {
    const p = computerObject(input, ["callId", "sourceId"]);
    return service.decide(
      computerId(p.callId),
      p.sourceId === null ? null : computerId(p.sourceId),
    );
  });
  handle("listDiagnostics", async () => {
    if (service.getState().sharing || service.getState().pending)
      throw new Error("computer_busy");
    closeDiagnostics();
    const generation = diagnosticGeneration;
    const result = await diagnostic.request("list");
    if (generation !== diagnosticGeneration)
      throw new Error("computer_cancelled");
    const sources = result.sources as ComputerSource[];
    if (
      !Array.isArray(sources) ||
      sources.length > 100 ||
      sources.some(
        (source) =>
          typeof source.title !== "string" || !computerId(source.sourceId),
      )
    )
      throw new Error("computer_protocol_invalid");
    diagnosticSources = new Set(sources.map((source) => source.sourceId));
    return sources;
  });
  handle("diagnose", async (input) => {
    if (
      service.getState().sharing ||
      service.getState().pending ||
      !diagnosticSources.has(computerId(input))
    )
      throw new Error("computer_window_unavailable");
    const generation = diagnosticGeneration;
    const deadline = setTimeout(closeDiagnostics, 20_000);
    try {
      await diagnostic.request("select", { sourceId: input });
      const result = parseComputerObservation(
        await diagnostic.request("observe"),
      );
      if (generation !== diagnosticGeneration)
        throw new Error("computer_cancelled");
      return result;
    } finally {
      clearTimeout(deadline);
    }
  });
  handle("closeDiagnostics", closeDiagnostics);
  app.on("before-quit", () => {
    service.revoke();
    closeDiagnostics();
  });
  void app.whenReady().then(async () => {
    if (process.platform !== "win32" || process.arch !== "x64") return;
    powerMonitor.on("lock-screen", () => {
      service.revoke();
      closeDiagnostics();
    });
    powerMonitor.on("suspend", () => {
      service.revoke();
      closeDiagnostics();
    });
    service.setEnabled(
      (await clientPreferencesService.load()).allowComputerObservation === true,
    );
    try {
      await verifyComputerResources(directory);
      service.setAvailability(true);
    } catch {
      service.setAvailability(false, "computer_resources_invalid");
    }
  });
}
