import { describe, expect, it } from "vitest";
import { computerPauseHintKey } from "@/domain/computer-observation/control-feedback";

describe("computer overlay pause feedback", () => {
  it.each([
    ["computer_activation_required", "computer.overlay.pauseHints.activation"],
    ["computer_user_takeover", "computer.overlay.pauseHints.userTakeover"],
    ["computer_display_changed", "computer.overlay.pauseHints.displayChanged"],
    ["computer_target_occluded", "computer.overlay.pauseHints.targetOccluded"],
    ["computer_password_protected", "computer.overlay.pauseHints.passwordProtected"],
    ["computer_busy", "computer.overlay.pauseHints.busy"],
    ["computer_window_unavailable", "computer.overlay.pauseHints.windowUnavailable"],
    ["unknown", "computer.overlay.pauseHints.default"],
  ])("maps %s to a localized message key", (code, key) => {
    expect(computerPauseHintKey(code)).toBe(key);
  });
});
