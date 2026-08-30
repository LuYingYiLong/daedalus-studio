import { describe, expect, it } from "vitest";
import {
  isSettingsPageAvailable,
  SETTINGS_SEARCH_ENTRIES,
} from "@/widgets/settings/settings-search-catalog";
import en from "../../../../src/renderer/src/platform/i18n/locales/en-US/common.json";
import zh from "../../../../src/renderer/src/platform/i18n/locales/zh-CN/common.json";

describe("desktop perception settings navigation", () => {
  it("hides the page on runtimes without the Windows capability", () => {
    expect(isSettingsPageAvailable("computer_observation", false)).toBe(false);
    expect(isSettingsPageAvailable("computer_observation", true)).toBe(true);
    expect(isSettingsPageAvailable("general", false)).toBe(true);
  });
  it("indexes the standalone page, permission and diagnostics in both languages", () => {
    const entries = SETTINGS_SEARCH_ENTRIES.filter(
      (entry) => entry.page === "computer_observation",
    );
    expect(entries.map((entry) => entry.key)).toEqual([
      "page:computer_observation",
      "item:computer_observation.control",
      "item:computer_observation.enabled",
      "item:computer_observation.diagnostics",
    ]);
    for (const locale of [en, zh]) {
      for (const entry of entries) {
        const key = entry.titleKey.replace(
          "computer.",
          "",
        ) as keyof typeof en.computer;
        expect(locale.computer[key]).toBeTruthy();
      }
    }
  });
});
