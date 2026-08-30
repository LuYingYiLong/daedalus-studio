import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { describe, it, expect } from "vitest";
import { assertComputerSender } from "../../../src/main/services/computer-observation/sender-guard";
import { verifyComputerResources } from "../../../src/main/services/computer-observation/helper-client";

describe("computer observation boundaries", () => {
  it.skipIf(process.platform !== "win32" || process.arch !== "x64")(
    "admits only the explicit main top frame, settings only when opted in",
    () => {
      const main = {
        isDestroyed: () => false,
        webContents: { mainFrame: {}, isDestroyed: () => false },
      } as BrowserWindow;
      const settings = {
        isDestroyed: () => false,
        webContents: { mainFrame: {}, isDestroyed: () => false },
      } as BrowserWindow;
      const event = (window: BrowserWindow) =>
        ({
          sender: window.webContents,
          senderFrame: window.webContents.mainFrame,
        }) as IpcMainInvokeEvent;
      expect(() => assertComputerSender(event(main), main)).not.toThrow();
      expect(() => assertComputerSender(event(settings), main)).toThrow(
        "computer_sender_not_allowed",
      );
      expect(() =>
        assertComputerSender(event(settings), main, settings),
      ).not.toThrow();
      expect(() =>
        assertComputerSender(
          {
            ...event(main),
            senderFrame: {} as IpcMainInvokeEvent["senderFrame"],
          },
          main,
        ),
      ).toThrow("computer_sender_not_allowed");
      expect(() => assertComputerSender(event(main), null)).toThrow(
        "computer_sender_not_allowed",
      );
      main.isDestroyed = () => true;
      expect(() => assertComputerSender(event(main), main)).toThrow(
        "computer_sender_not_allowed",
      );
    },
  );

  it("validates Chinese resource paths, required runtimes, hashes and manifest traversal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "感知资源-"));
    const names = [
      "daedalus-computer-helper.exe",
      "onnxruntime.dll",
      "det.onnx",
      "rec.onnx",
      "msvcp140.dll",
      "msvcp140_1.dll",
      "vcruntime140.dll",
      "vcruntime140_1.dll",
    ];
    const bytes = Buffer.from("offline fixture");
    const entry = {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.length,
    };
    const files: Record<string, typeof entry> = Object.fromEntries(
      names.map((name) => [name, entry]),
    );
    const manifest = () =>
      writeFile(
        join(directory, "manifest.json"),
        JSON.stringify({ protocolVersion: 1, files }),
      );
    try {
      await Promise.all(
        names.map((name) => writeFile(join(directory, name), bytes)),
      );
      await manifest();
      await expect(verifyComputerResources(directory)).resolves.toBeUndefined();
      await writeFile(join(directory, "rec.onnx"), "modified model");
      await expect(verifyComputerResources(directory)).rejects.toThrow(
        "computer_resources_invalid",
      );
      await writeFile(join(directory, "rec.onnx"), bytes);
      delete files["rec.onnx"];
      await manifest();
      await expect(verifyComputerResources(directory)).rejects.toThrow(
        "computer_resources_missing",
      );
      files["rec.onnx"] = entry;
      files["../outside"] = entry;
      await manifest();
      await expect(verifyComputerResources(directory)).rejects.toThrow(
        "computer_resources_invalid",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
