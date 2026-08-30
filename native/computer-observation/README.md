# Windows single-window computer use

Opt-in Windows x64 observation and separately authorized input. There is no network listener, elevation, UIAccess, desktop-wide target, clipboard or scripting interface. The existing manual window-screenshot attachment flow is independent and unchanged.

## Build and verify

Install Visual Studio C++ desktop tools (MSVC, CMake, Windows SDK). Node 24 and the existing Studio dependencies are required at build time. No Python/.NET runtime is shipped.

```powershell
npm run build:computer
npm run test:computer
# Requires an interactive Windows desktop; captures only its own test window:
npm run test:computer:hardware
# Subsequent builds can use only hash-verified cached resources:
npm run build:computer -- --offline
npm run build
npm run test:e2e:built -- --project=electron tests/e2e/computer-observation.spec.ts
```

`resources.lock.json` pins ONNX Runtime, PP-OCRv5 mobile detection/recognition models, upstream licenses and the Visual C++ redistributable by version and SHA-256. The dictionary is embedded in the recognition model's `character` metadata (therefore covered by the model hash). Build scripts extract only required VC DLLs and its license; they never execute or install the redistributable. Models are not downloaded at runtime.

`build/computer-observation` is generated and ignored by Git. Its manifest lists every shipped file's size/hash. Electron checks these before spawning a helper. Windows packaging adds this directory outside ASAR; Android and other platforms do not ship it. Build the Backend from the matching source before end-to-end product use; publishing a new Backend release and changing its pinned bootstrap manifest is a separate release operation. An older Backend simply has no observation tools.

## Runtime contracts

- Binary LE uint32 length followed by UTF-8 JSON. Version 2, matching request ID; 16 KiB request / 8 MiB response maximum. Stdout contains frames only. Stderr is drained without recording native exception text.
- Parent-process watchdog; lazy startup, one normal request in flight, priority stop/pause/heartbeat on the pipe reader and input monitoring on an independent thread, hard 20-second observation deadline, kill on invalid frames/timeouts/crashes. No service or background acquisition.
- Window identities combine a short-lived registry ID, PID/process start time and a WGC item with a Closed listener. HWNDs/PIDs never cross into renderer/tool arguments. Window discovery occurs only for an open picker/refresh.
- MTA UI Automation reads only the selected Control View. Depth 20, 1,000 nodes, 500 OCR blocks, combined UTF-8 text 64 KiB. Password names/IDs are omitted and trustworthy rectangles masked before OCR and PNG encoding. Truncation is explicit. This is not a guarantee that arbitrary applications expose all sensitive fields correctly.
- WGC captures only the chosen window. No full-desktop fallback. Observation never activates the target; control startup/resume may attempt activation once. Failure pauses instead of stealing focus. Physical screen rectangle, image dimensions and DPI define the transform. UIA/OCR boxes are image pixels; screen X/Y may be negative. UIA and capture timestamps are separate. Scoped geometry monitoring and before/after checks reject moving/resizing/DPI-changing acquisitions.
- OCR: CPU only, two intra-op threads, telemetry disabled. Connected-component DB-mask postprocessing with bounded line crops and CTC decoding. Horizontal Chinese/English UI text is the primary target; heavily rotated/curved text is not guaranteed.
- Unrequested PNGs remain in memory. Up to eight frames / 32 MiB encoded PNG data are retained in the current grant; evicted observation IDs fail explicitly and never recapture. Requested images alone enter the Backend observation table and existing vision/image-recognition route.

## Input safety

Only click/double-click, Unicode text, wheel and an explicit key allowlist are accepted. Every action consumes the latest frame and revalidates target identity, geometry/DPI, foreground, focus/hit and password protection. Input pairs are not held across calls. Partial dispatch is unknown and cannot be replayed. Human input pauses, own tagged injection is ignored; cursor movement above 8 DIP counts as takeover. A two-second native watchdog and independent emergency-key handling stop input even while OCR/UIA is busy. Main also stops when the controller renderer heartbeat expires.

Two protected overlay HWNDs are accepted only from Main, checked against its PID and WDA_EXCLUDEFROMCAPTURE. These HWNDs are never model/renderer tool arguments. The overlay cannot authorize or execute input. Backend mirrors the verified lease, gates model/tool starts and reconnect attempts, and expires missing heartbeats after five seconds.

## Consent / privacy

The Windows client preference is off by default. Enabling it allows a request, not access. A human must select one window and explicitly allow the current canonical user turn. Main owns this fact. Manual/auto-safe explicitly approve each control turn. Full-trust is supplied by the real Backend approval gateway and can reuse a living, previously user-selected target in this session/connection, but never bypasses platform/input switches or read-only execution policy. Grants die on terminal/interrupted runs, stop, context change, disconnect, lock/suspend, window invalidation, preference disable and app exit. A denied/revoked turn cannot prompt repeatedly. Reconnecting never restores a grant.

Remote, scheduler, Goal and non-Windows clients do not receive the tools. The Gateway's allowlist rejects all observation/result/history methods. All window content is untrusted model evidence. Local OCR text and requested screenshots may be sent to the user's configured model service.

Settings → Computer use contains separate observation/input switches and a developer-only, read-only diagnostics Modal. Only the registered settings window's top frame may run local diagnostics; it cannot execute AI tools or grant access. Leaving the page or closing the window clears diagnostic results without revoking Main's AI grant. Diagnostics do not authorize AI, attach context, persist evidence or contact a model. Trace records link to desktop-only historical evidence; compacted records cannot recapture. Backend schema 10 stores observations independently, removes old bodies/PNGs in the existing ten-completed-turn compaction transaction, updates search revision and keeps authorization audit entries.

## Validation boundaries

`test:computer` verifies resource hashes, real offline Chinese/English OCR on generated memory images, a dedicated UIA window with a password field, and framed-protocol rejection. It does not enumerate the user's windows. Playwright uses a fake helper process with real framing, real Electron IPC/Main consent and a Mock Backend.

`test:computer:hardware` additionally captures a dedicated window with WGC and runs `--test-input`, which creates its own edit/password fields to test click, Unicode input, scroll, key dispatch and takeover. Input checks require OS foreground permission; a focus failure must not be bypassed with elevated privileges. It never enumerates the user's windows. This check is separate from CI because hosted runners may not provide a capturable desktop.

Before release, manually check WGC and OCR on dedicated, non-sensitive windows on multiple monitors at 100%/150%/200% scaling, negative screen coordinates, move/resize, minimize/close, high-integrity/protected windows, lock/unlock and helper termination. Mock E2E and the dedicated-window check are not evidence that all these hardware/driver combinations have passed. Do not disable protections to make a test pass.
