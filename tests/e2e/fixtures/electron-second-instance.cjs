// Test-only entry preload: use the real single-instance lock, but retain the
// isolated profile and native-dialog health reporting from the E2E harness.
require("./electron-health.cjs");
const { writeFileSync } = require("node:fs");
const { app, BrowserWindow } = require("electron");

app.once("before-quit", () => {
  writeFileSync(
    `${process.env.DAEDALUS_E2E_HEALTH_LOG}.startup.json`,
    JSON.stringify({
      ready: app.isReady(),
      hasLock: app.hasSingleInstanceLock(),
      windowCount: BrowserWindow.getAllWindows().length,
    }),
    "utf8",
  );
});
delete process.env.DAEDALUS_E2E;
