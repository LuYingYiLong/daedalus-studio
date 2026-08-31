import { describe, expect, it, vi } from "vitest";
import { NativeComputerHelper } from "../../../src/main/services/computer-observation/helper-client";

describe("native input readiness", () => {
  it.each([
    [{ version: 2, computerControl: true }, "computer_protocol_mismatch"],
    [{ version: 3, computerControl: true, inputTransports: ["synthetic_touch", "keyboard"] }, "computer_protocol_mismatch"],
    [{ version: 3, computerControl: true }, "computer_protocol_mismatch"],
    [{ version: 3 }, "computer_control_disabled"],
    [{ version: 3, computerControl: false, controlUnavailableReason: "computer_pointer_independence_unavailable" }, "computer_pointer_independence_unavailable"],
  ])("rejects unsupported input without starting a native process", async (hello, code) => {
    const helper = new NativeComputerHelper("unused-fixture-directory");
    vi.spyOn(helper, "request").mockResolvedValue(hello);
    await expect(helper.assertControlReady()).rejects.toThrow(code);
    expect(helper.request).toHaveBeenCalledExactlyOnceWith("hello");
  });
  it("requires an explicit v3 native capability", async () => {
    const helper = new NativeComputerHelper("unused-fixture-directory");
    vi.spyOn(helper, "request").mockResolvedValue({ version: 3, computerControl: true, inputTransports: ["uia", "keyboard"] });
    await expect(helper.assertControlReady()).resolves.toBeUndefined();
  });
});
