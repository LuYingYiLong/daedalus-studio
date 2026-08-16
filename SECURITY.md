# Security Policy

Daedalus Studio is a desktop application that can connect to model providers, execute approved tools, access local workspaces, and integrate with the Daedalus Backend and Godot Editor Bridge. Security reports are welcome, especially when they could expose credentials, bypass an approval boundary, escape a workspace, or compromise a packaged application.

## Supported versions

Security fixes are targeted at the latest published release and the default development branch.

| Version | Support |
| --- | --- |
| Latest release | Supported |
| Default development branch | Best effort |
| Older releases | Not supported |

If you are reporting an issue against an older release, please first verify that it is still reproducible on the latest release.

## Reporting a vulnerability

Please do not open a public issue, pull request, discussion, or commit containing vulnerability details.

Use GitHub's private vulnerability reporting flow for this repository when it is available:

1. Open the repository's **Security** tab.
2. Select **Advisories**.
3. Choose **Report a vulnerability** and provide the report privately.

If private vulnerability reporting is not available, contact the maintainers through a private GitHub channel and ask for a secure reporting route. Do not include exploit details in a public message.

### Include the following information

- A clear description of the vulnerability and its security impact.
- The affected component and version, such as Studio, Backend, Bridge, updater, renderer, or main process.
- The operating system and installation type, if relevant.
- Reproduction steps or a minimal proof of concept.
- Any required permissions, workspace state, provider configuration, or user interaction.
- Whether the issue can expose API keys, custom MCP secrets, workspace files, session data, or other local information.
- Suggested mitigations or a proposed fix, if available.

Please redact API keys, access tokens, private workspace paths, custom MCP credentials, personal data, and other secrets from logs and screenshots. If a secret was included accidentally, revoke or rotate it immediately and mention that fact in the private report.

## Response and disclosure

The maintainers will try to acknowledge a private report within five business days and will investigate its severity, affected versions, and remediation options. Timelines may vary for issues that require coordinated fixes across Studio, Backend, Bridge, or an upstream dependency.

Please allow time for a fix and release before making vulnerability details public. Coordinated disclosure dates can be discussed privately. The maintainers may credit the reporter in release notes unless the reporter requests anonymity.

## Scope

Reports are generally in scope when they demonstrate a realistic security impact in Daedalus Studio or its maintained packaging and integration code, including:

- Credential or secret disclosure through logs, configuration, IPC, renderer exposure, or packaged artifacts.
- Bypassing approval, tool-policy, workspace-boundary, or path-validation checks.
- Remote-code execution, arbitrary command execution, or unintended file access caused by Studio code.
- Update, installer, or artifact-integrity failures that allow an attacker to substitute executable components.
- Cross-origin, IPC, or privilege-boundary issues that allow an untrusted renderer or workspace to reach privileged APIs.
- Vulnerabilities in the maintained Studio-side integration with the Daedalus Backend or Godot Editor Bridge.

The following are normally out of scope unless they show a separate vulnerability in Studio:

- A model provider's service, API, account, or authentication system.
- Vulnerabilities in an unrelated third-party dependency that do not affect Daedalus Studio in a reachable way.
- A malicious project that already has permission to execute arbitrary code through its own tools or scripts.
- Denial of service that only affects the reporter's local process without crossing a trust boundary.
- General bugs, feature requests, or hardening suggestions without a demonstrated security impact.

## Security practices for contributors and users

- Never commit API keys, access tokens, custom MCP secrets, signing credentials, or private workspace data.
- Attach only sanitized diagnostics to public issues. API keys and custom MCP secrets must not appear in ordinary configuration files or logs.
- Keep the application, Backend, Bridge, and operating system up to date when handling sensitive projects.
- Review approval prompts and workspace paths before allowing write, command, or destructive operations.
- Treat third-party model providers, MCP servers, Bridge packages, and workspace projects as separate trust boundaries.

This policy is intended to provide a private reporting path and does not replace the security policies of model providers, GitHub, Godot, or third-party dependencies.
