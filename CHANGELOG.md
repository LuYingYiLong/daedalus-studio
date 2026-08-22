# Daedalus Studio Changelog

> Scope: v1.0.8 (`81eb465`) → Current version (v1.1.4).
> Note: The repository does not have a local v1.0.8 tag (no tag references were fetched during cloning; packed-refs only contains origin/main). Therefore, the commit `81eb465` (2026-08-01), where `package.json` `version` first became 1.0.8, is used as the baseline. Version boundaries are determined by the `version` field in `package.json`.

## [1.1.4] - 2026-08-16

### Added
- File panel and Monaco editor, with support for file tree, tabs, text editing, and workspace context selection
- Session forking and source hints, making it easy to reproduce the same issue with different models
- Vendor official website, vendor editing, and model capability configuration
- Persistence for workspace layout preferences, Dock fullscreen, and Composer compact layout
- General settings support for custom body font and code font

### Fixed
- Improved file tree lazy loading, scrolling performance, and editor bottom safe area
- Fixed issue where main window did not sync after modifying fonts in settings window
- Update flow now automatically waits during active LLM responses to avoid interrupting ongoing responses

## [1.1.0] - 2026-08-06

### Added
- Timeline tool activity collapse grouping with expand/collapse summaries (`f1fb68e`, `91d06d3`, `bb994b0`)
- File write activity with change statistics display (`18e5f73`)
- Timeline display of context compression and file editing diffs (`941e6f3`)
- File editing tool partial display of source folder id (`05194ed`)
- Session import from SQLite file (`df7efa5`)
- Full Trust dialog, context bar, and tool tag localization (`85b30e7`, `04b3f90`)
- Terminal scroll handoff and improved tool result display (`c920e35`)

### Fixed
- Cleaned up stale running session indicators (`959b7b6`)
- Wait for backend to fully shut down before exiting (`eaf567b`)
- Restore workspace context when archiving active sessions (`63e8ab6`)
- Deduplicate replayed backend events (`13dcb07`)
- Force shiny text font family (`76ff5d8`)
- Display latest non-empty tool-call arguments (`deb06c1`)

### Refactored
- Reworked session layout state and UI polish (`32e20a8`)
- Changed settings page cards to SettingsList and fixed layout (`2377f5a`)

### Documentation
- Updated README and fixed terminal section styles (`721a2e6`)

## [1.0.9] - 2026-08-04

### Added
- Goal mode: execution panel and evaluation model (`aec5952`)
- Composer slash commands and Goal dismissal (`9207e3a`)
- Context usage polling and Goal telemetry refresh (`e45074a`)
- Local Godot documentation import and branch checkout commit workflow (`d938ca1`)
- Document index health check and repair (`3f7ac07`)
- First-run onboarding wizard (`debc90c`)
- Session data export as SQLite file (`88185eb`)
- Persistence of new session composer defaults (`6203900`)
- Session navigation history and input context menu (`8e4359a`)
- Completion status display and backend management actions (`1303529`)
- Chat: Ask thread delete action (`5c79677`), changed select all to copy all (`351b836`), terminal command rendering (`4fd9f7a`), timeline search streaming results (`70061a5`), navigator and scroll sync (`3732a15`), provider reconnection status display (`37b96e3`), code block header sticky (`7f8edd3`), textarea context menu (`a1e8941`)
- Workspace: running session agent run tracking (`c99edd1`)
- Git: refresh workspace and diff review after commit/branch changes (`c5e4bc6`, `7a65ae6`)
- Settings: archive sessions and theme chart refresh (`b3aa6bc`)
- Home: session plans and progressive source image loading (`e7191e9`), summary silent refresh (`605dc22`)
- Composer: context usage layout and summary pre-warming (`dfb8891`), draft saved per session in renderer memory (`94f5d1e`)

### Fixed
- Prevent expired Goal snapshots from overwriting new state (`d9a85d6`)
- Session navigator and active turn sync (`a3fc913`)
- Show renderer after first paint (`b4e239e`)
- Corrected overscan line filtering (`0799fc5`)
- Hide diff stats when no changes in Home (`2135790`)
- Layout persistence debounce and review comment form reset (`3931ebb`)

### Refactored
- Renamed `updatesEnabled` to `appReady` and gated sidebar buttons (`a26aa14`)
- Extracted execution status panel visibility logic (`c0ce63b`)
- Replaced Git branch list with antd Menu (`6709f98`)

### Styling
- Unified box-shadow usage (`c604d3a`)
- Renamed translucent background token and updated icons (`cafd94b`)
- Summary content rearrangement and lowered background adjustment (`07361f6`)

---

## Version Boundaries

| Version | First Version Commit | package.json version | Date |
|---|---|---|---|
| v1.0.8 | `81eb465` | 1.0.8 | 2026-08-01 |
| v1.0.9 | `a1e8941` | 1.0.9 | 2026-08-04 |
| v1.1.0 | `32e20a8` | 1.1.0 | 2026-08-06 |
| v1.1.4 | — | 1.1.4 | 2026-08-16 |