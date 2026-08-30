// Test-only preload: loaded before the built Main entry, never shipped in the app.
const { appendFileSync } = require("node:fs");
const { app, dialog } = require("electron");
const logPath = process.env.DAEDALUS_E2E_HEALTH_LOG;
if (process.env.DAEDALUS_E2E !== "1" || app.isPackaged || !logPath) {
  throw new Error("electron_health_requires_isolated_test_launch");
}

function record(kind, detail) {
  appendFileSync(logPath, JSON.stringify({ kind, detail }) + "\n", "utf8");
}
function errorText(error) {
  return error?.stack ?? String(error);
}
// Monitor does not replace Electron's exception handling.
process.on("uncaughtExceptionMonitor", (error) =>
  record("uncaughtException", errorText(error)),
);
process.on("unhandledRejection", (error) =>
  record("unhandledRejection", errorText(error)),
);
// Native modal dialogs cannot be dismissed through Playwright's page dialog API.
// Record them as test failures, including those raised during app.quit().
dialog.showErrorBox = (title, content) =>
  record("errorBox", `${title}\n${content}`);
app.on("will-quit", () => record("willQuit", ""));
record("monitorReady", "");
