<a href="./CONTRIBUTING-CN.md">简体中文
# Contributing to Daedalus Studio

This guide contains the local development, validation, and packaging instructions for Daedalus Studio. The README files link here so these commands have one canonical home.

## Development environment

- Node.js 24.x and npm.
- Windows for the supported packaged build.
- A local checkout of [daedalus-backend](https://github.com/LuYingYiLong/daedalus-backend) when running Studio in development mode.
- The optional [daedalus-bridge](https://github.com/LuYingYiLong/daedalus-bridge) checkout when developing or testing Godot Editor Bridge features.

## Run from source

Start the backend first:

```powershell
git clone https://github.com/LuYingYiLong/daedalus-backend.git
cd daedalus-backend
npm ci
npm run dev
```

Then start Studio in another terminal. A sibling Bridge checkout is optional for ordinary Studio development:

```powershell
git clone https://github.com/LuYingYiLong/daedalus-studio.git
cd daedalus-studio
npm ci
npm run dev
```

Development Studio connects to the backend on port `38181`. If the repositories are not siblings, set the development backend directory in Studio's startup settings.

The recommended development layout is:

```text
D:\Daedalus-Studio\
├─ daedalus-studio\
├─ daedalus-backend\
└─ daedalus-bridge\
```

When `daedalus-bridge` is not present, `npm run dev` first reuses a verified package in `build/daedalus-bridge`. If no cache is available, it tries the fixed Bridge release. A network or certificate failure does not prevent the Studio development server from starting; Godot Bridge features remain unavailable until a package is prepared. The same failure is fatal for `npm run build:win`, `npm run pack:win`, and other production packaging commands.

To use a Bridge checkout anywhere on disk, set the source before starting Studio. The value may be the repository root or its `addons/daedalus_bridge` directory:

```powershell
$env:DAEDALUS_BRIDGE_SOURCE = "D:\src\daedalus-bridge"
npm run dev
```

The local Bridge metadata must match `package.json` (`godotBridgeVersion`, `godotBridgeProtocolVersion`, Studio version, and `addons/daedalus_bridge` install path). For a corporate proxy or antivirus that re-signs HTTPS traffic, configure its trusted root certificate for Node instead of disabling TLS verification:

```powershell
$env:NODE_EXTRA_CA_CERTS = "C:\certs\company-root-ca.pem"
npm run dev
```

Do not use `NODE_TLS_REJECT_UNAUTHORIZED=0`; it disables certificate verification for every HTTPS request in the process.

## Troubleshooting development startup

If `npm run dev` fails before Electron starts with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, the failure is from Node's HTTPS certificate validation while preparing the optional Bridge package. It is not a renderer or backend startup failure.

Use these fixes in order:

1. Clone `daedalus-bridge` beside this repository, or set `DAEDALUS_BRIDGE_SOURCE` to an existing checkout.
2. If a previous Bridge package exists, keep `build/daedalus-bridge` so the preparation script can verify and reuse it offline.
3. If a proxy or antivirus re-signs HTTPS, set `NODE_EXTRA_CA_CERTS` to the organization's root CA and retry.
4. If Bridge is not needed, run `npm run dev` again. Development mode continues without Bridge packaging and shows the missing package in the Godot Projects page; this does not affect ordinary chat development.

Do not fix certificate errors by disabling TLS verification. Production packaging remains strict and must have a verified Bridge archive.

## Checks and builds

Run the checks that match your change:

```powershell
npm run typecheck
npm test
npm run build
npm run pack:win
```

- `npm run build` creates production Electron bundles in `out/`.
- `npm run pack:win` creates an unpacked Windows build.
- `npm run build:win` creates the NSIS installer and updater metadata in `release/`.
- Windows packaging first looks beside the Studio repository for `daedalus-backend` and `daedalus-bridge`. A sibling backend is built with `npm run release:sea:win`; a sibling Bridge is packaged from `addons/daedalus_bridge`.
- If a sibling repository is absent, set `DAEDALUS_BACKEND_SOURCE` to the backend repository root and `DAEDALUS_BRIDGE_SOURCE` to the Bridge repository or addon root. Sibling repositories intentionally take priority over these variables.
- If no source repository is available, packaging retains the verified fallback paths: `DAEDALUS_BACKEND_BOOTSTRAP_DIR` for a prepared backend payload, then the fixed backend and Bridge GitHub releases. All packaged artifacts are still checked for versions, manifests, hashes, protocols, and backend self-tests. A missing or unverifiable Bridge remains a packaging error; only the unbundled development server can continue without it.

### Application icon

Edit `src/renderer/src/assets/icons/icon-colorful.svg` as the single source for the Studio application icon. The onboarding page, About page, and desktop renderer favicon use it directly. Run `npm run prepare:icons` to update the tracked `build/icon.svg` and multi-resolution `build/icon.ico` used by the window, tray, executable, and installer. Commit these two icon resources together with the source SVG.

Development startup and desktop builds also run this step automatically. Unchanged resources are reused without downloading tools; the first conversion uses electron-builder's checksum-verified icon toolset and its normal cache. Use `npm run prepare:icons -- --force` to regenerate after upgrading the converter. Remote's separate branding is not changed.

Restart Studio to see the new window/tray icon. An existing executable or installed shortcut requires a new Windows package; changing the source does not patch an already installed application.

Do not commit generated dependencies, build output, release artifacts, logs, or local configuration. Keep changes focused and include the relevant typecheck, test, or build result when opening a change for review.
