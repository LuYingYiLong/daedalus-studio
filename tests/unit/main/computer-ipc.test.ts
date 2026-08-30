import { EventEmitter } from "node:events";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerComputerIpc } from "../../../src/main/services/computer-observation/computer-ipc";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  ready: vi.fn(),
  on: vi.fn(),
  stop: vi.fn(),
  verify: vi.fn(),
  request: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { getAppPath: () => "/fixture", whenReady: mocks.ready, on: mocks.on },
  ipcMain: { handle: mocks.handle },
  powerMonitor: { on: vi.fn() },
}));
vi.mock("../../../src/main/services/client-preferences", () => ({
  clientPreferencesService: {
    load: async () => ({ allowComputerObservation: true }),
    update: async () => {},
  },
}));
vi.mock(
  "../../../src/main/services/computer-observation/helper-client",
  () => ({
    verifyComputerResources: mocks.verify,
    NativeComputerHelper: class {
      stop = mocks.stop;
      async request(method: string) {
        return mocks.request(method);
      }
    },
  }),
);

function windowFixture() {
  let contentsDestroyed = false;
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    isDestroyed: () => contentsDestroyed,
    send: vi.fn(() => {
      if (contentsDestroyed) throw new TypeError("Object has been destroyed");
    }),
  });
  const window = {
    isDestroyed: () => false,
    webContents: contents,
  } as unknown as BrowserWindow;
  return {
    window,
    contents,
    destroyContents() {
      contentsDestroyed = true;
      contents.emit("destroyed");
    },
  };
}

describe.skipIf(process.platform !== "win32" || process.arch !== "x64")(
  "computer IPC window teardown",
  () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.clearAllMocks();
      mocks.ready.mockResolvedValue(undefined);
      mocks.verify.mockResolvedValue(undefined);
      mocks.request.mockImplementation(async (method: string) =>
        method === "list"
          ? { sources: [{ sourceId: "source", title: "Fixture" }] }
          : method === "observe"
            ? {
                observationId: "observation",
                capturedAt: "2026-08-30T00:00:00Z",
                uiaCapturedAt: "2026-08-30T00:00:00Z",
                screenBounds: { x: 0, y: 0, width: 1, height: 1 },
                width: 1,
                height: 1,
                dpi: 96,
                nodes: [],
                texts: [],
                durationMs: 1,
                truncated: false,
              }
            : { valid: true },
      );
    });
    afterEach(() => vi.useRealTimers());

    function invoke(
      window: ReturnType<typeof windowFixture>,
      method: string,
      input?: unknown,
      frame = window.contents.mainFrame,
    ): unknown {
      const handler = mocks.handle.mock.calls.find(
        ([channel]) => channel === `computer:${method}`,
      )![1];
      return handler({ sender: window.contents, senderFrame: frame }, input);
    }

    it("only admits settings diagnostics, never AI authorization or tool execution", async () => {
      const main = windowFixture(),
        settings = windowFixture(),
        other = windowFixture();
      registerComputerIpc(
        () => main.window,
        () => settings.window,
      );
      await vi.advanceTimersByTimeAsync(0);
      for (const method of [
        "listDiagnostics",
        "diagnose",
        "closeDiagnostics",
      ]) {
        expect(() => invoke(main, method, "source")).toThrow(
          "computer_sender_not_allowed",
        );
        expect(() => invoke(other, method, "source")).toThrow(
          "computer_sender_not_allowed",
        );
        expect(() => invoke(settings, method, "source", {})).toThrow(
          "computer_sender_not_allowed",
        );
      }
      for (const method of [
        "setContext",
        "execute",
        "decide",
        "list",
        "cancel",
        "revoke",
        "finish",
      ]) {
        expect(() => invoke(settings, method)).toThrow(
          "computer_sender_not_allowed",
        );
      }
      await expect(invoke(settings, "listDiagnostics")).resolves.toEqual([
        { sourceId: "source", title: "Fixture" },
      ]);
      await expect(invoke(settings, "diagnose", "unknown")).rejects.toThrow(
        "computer_window_unavailable",
      );
      await expect(
        invoke(settings, "diagnose", "source"),
      ).resolves.toMatchObject({ observationId: "observation" });
      expect(invoke(main, "getState")).toMatchObject({
        pending: null,
        sharing: null,
        observation: null,
      });
      invoke(settings, "closeDiagnostics");
      await expect(invoke(settings, "diagnose", "source")).rejects.toThrow(
        "computer_window_unavailable",
      );
    });

    it.each(["destroyed", "render-process-gone", "did-start-navigation"])(
      "clears diagnostics on settings %s and drops late results",
      async (event) => {
        const main = windowFixture(),
          settings = windowFixture();
        registerComputerIpc(
          () => main.window,
          () => settings.window,
        );
        await vi.advanceTimersByTimeAsync(0);
        await invoke(settings, "listDiagnostics");
        let resolve!: (value: object) => void;
        mocks.request.mockImplementation(async (method: string) =>
          method === "observe"
            ? new Promise((done) => {
                resolve = done;
              })
            : {},
        );
        const pending = expect(
          invoke(settings, "diagnose", "source"),
        ).rejects.toThrow("computer_cancelled");
        await vi.advanceTimersByTimeAsync(0);
        mocks.stop.mockClear();
        settings.contents.emit(event, {}, "about:blank", false, true);
        expect(mocks.stop).toHaveBeenCalledOnce();
        resolve({
          observationId: "observation",
          capturedAt: "2026-08-30T00:00:00Z",
          uiaCapturedAt: "2026-08-30T00:00:00Z",
          screenBounds: { x: 0, y: 0, width: 1, height: 1 },
          width: 1,
          height: 1,
          dpi: 96,
          nodes: [],
          texts: [],
          durationMs: 1,
          truncated: false,
        });
        await pending;
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it("does not disclose or revoke Main's grant when settings closes", async () => {
      const main = windowFixture(),
        settings = windowFixture();
      registerComputerIpc(
        () => main.window,
        () => settings.window,
      );
      await vi.advanceTimersByTimeAsync(0);
      invoke(main, "setContext", {
        connectionId: "connection",
        sessionId: "session",
        workspaceId: null,
      });
      const access = invoke(main, "execute", {
        connectionId: "connection",
        sessionId: "session",
        requestId: "turn",
        runId: "run",
        toolCallId: "tool",
        callId: "call",
        toolName: "mcp_computer_request_access",
        args: { reason: "Fixture" },
      });
      await invoke(main, "list");
      await invoke(main, "decide", { callId: "call", sourceId: "source" });
      await access;
      expect(invoke(settings, "getState")).toMatchObject({
        pending: null,
        sharing: null,
        observation: null,
        diagnosticsBlocked: true,
      });
      await expect(invoke(settings, "listDiagnostics")).rejects.toThrow(
        "computer_busy",
      );
      settings.destroyContents();
      expect(invoke(main, "getState")).toMatchObject({
        sharing: { sessionId: "session" },
      });
      main.destroyContents();
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(["idle", "pending", "sharing"])(
      "revokes %s state when WebContents dies before BrowserWindow",
      async (state) => {
        const main = windowFixture();
        const settings = windowFixture();
        registerComputerIpc(
          () => main.window,
          () => settings.window,
        );
        await vi.advanceTimersByTimeAsync(0);
        const invoke = (method: string, input?: unknown): unknown => {
          const handler = mocks.handle.mock.calls.find(
            ([channel]) => channel === `computer:${method}`,
          )![1];
          return handler(
            {
              sender: main.contents,
              senderFrame: main.contents.mainFrame,
            } as unknown as IpcMainInvokeEvent,
            input,
          );
        };
        invoke("getState"); // Registers real destruction/reload listeners.
        invoke("setContext", {
          connectionId: "connection",
          sessionId: "session",
          workspaceId: null,
        });
        let pending: Promise<unknown> | undefined;
        if (state !== "idle") {
          pending = invoke("execute", {
            connectionId: "connection",
            sessionId: "session",
            requestId: "turn",
            runId: "run",
            toolCallId: "tool",
            callId: "call",
            toolName: "mcp_computer_request_access",
            args: { reason: "Fixture" },
          }) as Promise<unknown>;
          if (state === "sharing") {
            await invoke("list");
            await invoke("decide", { callId: "call", sourceId: "source" });
            await pending;
          }
        }
        const rejected =
          state === "pending"
            ? expect(pending).rejects.toThrow("computer_access_revoked")
            : undefined;
        const previousSends = main.contents.send.mock.calls.length;
        mocks.stop.mockClear();
        expect(() => main.destroyContents()).not.toThrow();
        await rejected;
        expect(main.window.isDestroyed()).toBe(false);
        expect(main.contents.send).toHaveBeenCalledTimes(previousSends);
        expect(mocks.stop).toHaveBeenCalledTimes(2); // Grant + independent diagnostic helper.
        expect(settings.contents.send).toHaveBeenLastCalledWith(
          "computer:state",
          expect.objectContaining({
            pending: null,
            sharing: null,
            observation: null,
          }),
        );
        expect(() => invoke("getState")).toThrow("computer_sender_not_allowed");
        expect(() => main.contents.emit("render-process-gone")).not.toThrow();
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it("ignores destroyed settings contents and late resource verification on quit", async () => {
      let resolveVerification!: () => void;
      mocks.verify.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveVerification = resolve;
        }),
      );
      const main = windowFixture();
      const settings = windowFixture();
      registerComputerIpc(
        () => main.window,
        () => settings.window,
      );
      await vi.advanceTimersByTimeAsync(0);
      main.destroyContents();
      settings.destroyContents();
      main.contents.send.mockClear();
      settings.contents.send.mockClear();
      resolveVerification();
      await vi.advanceTimersByTimeAsync(0);
      const quit = mocks.on.mock.calls.find(
        ([event]) => event === "before-quit",
      )![1];
      expect(() => quit()).not.toThrow();
      expect(main.contents.send).not.toHaveBeenCalled();
      expect(settings.contents.send).not.toHaveBeenCalled();
    });
  },
);
