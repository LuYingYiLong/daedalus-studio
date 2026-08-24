# Release notes for maintainers

Windows x64 remains the current distribution target. The release workflow validates the bundled Backend and Editor Bridge manifests, runs the built Electron smoke suite, and then produces the Windows installer.

Code signing is intentionally not configured in this repository. The generated installer is therefore an unsigned build artifact and must pass through the external signing process before it is presented as a formally stable Windows release. Do not add signing secrets to the CI workflow as part of routine release changes.
