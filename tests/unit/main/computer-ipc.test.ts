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
        return method === "list"
          ? { sources: [{ sourceId: "source", title: "Fixture" }] }
          : { valid: true };
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
    });
    afterEach(() => vi.useRealTimers());

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
