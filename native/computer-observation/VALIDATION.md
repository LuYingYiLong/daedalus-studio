# UIA + restricted keyboard validation — 2026-08-31

This is a local test build, not a published or fully hardware-qualified release.

## Delivered scope

- Six explicit UIA operations: invoke, toggle, select, set value, scroll, expand/collapse.
- Unicode typing and the existing restricted keyboard allowlist.
- No coordinate clicks/double-clicks, synthetic touch, mouse-wheel injection or mouse fallback.
- Protocol 3 with the exact native input profile `uia` / `keyboard`; matching Backend `computerControl=3` negotiation.
- Per-turn consent, foreground/window identity, password/read-only checks, pause/cancel and stale-result rejection remain enforced.
- UIA highlights target controls; it does not present semantic operations as pointer clicks.

## Automated results

| Check | Result |
| --- | --- |
| Backend `npm run typecheck` | Passed |
| Backend complete `npm test` | 1,024 passed, 1 failed in the plugin Harness Sidecar fixture |
| Studio `npm run verify:electron` | Passed, Electron 43.0.0 |
| Studio `npm run typecheck` | Passed |
| Studio `npm test` | 610 unit/integration/renderer tests + 6 static checks passed |
| Studio `npm run build` | Passed |
| Studio `npm run test:e2e:built` | 20 passed, including Android Remote |
| Native offline build and `npm run test:computer` | Passed |
| Windows x64 NSIS packaging | Passed, unsigned local installer |

The failing Backend test is `tests/unit/plugins/plugin-harness.test.ts`: `fake Harness Sidecar performs the versioned handshake and publishes isolated tools`. Its temporary profile cleanup fails with `EPERM` when unlinking `profiles/daedalus/package.json`. The failure has not been suppressed or counted as passed. Full output is in Backend `.cache/uia-keyboard-tests-20260831.log`.

Computer E2E uses a Mock Backend and a simulated helper; it never dispatches input into user applications. Invalid coordinate actions are also tested directly against real Main IPC, since invalid Backend events are rejected by the renderer parser before execution. Native self-tests cover resource hashes, offline English/Chinese OCR, a dedicated read-only UIA fixture, protocol rejection and parent-exit supervision; they do not inject input.

## Hardware qualification still required

`npm run test:computer:hardware` has **not passed end to end** in this environment. Dedicated-window runs exercised UIA set-value/clear, toggle, invoke, select, scroll and expansion. The collapse fixture initially selected a leaf node; selection was corrected to require the expand/collapse pattern. Subsequent complete runs were stopped by the Windows foreground gate (`computer_fixture_manual_activation_required`), so the corrected collapse plus full keyboard/takeover/cursor checks still need a complete run.

Run the command in an interactive Windows terminal. If prompted, click only the dedicated Daedalus input test window within 30 seconds, then leave input idle during its checks. It must not be made to pass by elevating privileges, weakening foreground checks or skipping takeover protection. Multi-monitor/negative coordinates, 100%/150%/200% DPI, physical concurrent input, lock/unlock and nonstandard providers remain separate manual acceptance cases.

Custom-rendered games may not expose usable UIA controls. OCR text is not a clickable control; if UIA and allowed keyboard navigation are insufficient, the assistant must report the limitation and ask the user to act.

## Local artifact

`release/uia-keyboard/Daedalus-Studio-Setup-1.1.4.exe`

- SHA-256: `25f536d75727e4f0f243dd57bc6d504e64adae074b2307a1a039822e9328d18f`
- Size: 272,560,945 bytes.
- Authenticode: not signed. Nothing was installed or published.
- Packaged Main and Preload exactly match the current build. All native and bundled Backend files match their SHA-256 manifests. The helper import table contains no synthetic-touch injection API.
- Backend bootstrap was built from the matching source and packaged as `1.4.0-d1f5dccb3371`. This local build does not bump release versions. An existing managed Backend of the same version is not automatically replaced: use Studio's existing **Repair backend** action to select the bundled build if control reports a compatibility mismatch. Development mode requires restarting both the source Backend and Studio.

The installer was built in a separate `release/uia-keyboard` directory with native dependency rebuilding disabled because the current Electron native modules had already been verified; no existing release output was removed.
