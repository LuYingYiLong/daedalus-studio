import packageJson from "../../../package.json";

export const BACKEND_BINARY_MANIFEST_SCHEMA_VERSION: 1 = 1;
export const BACKEND_PROTOCOL_VERSION: number = packageJson.backendProtocolVersion;
export const GODOT_BRIDGE_PROTOCOL_VERSION: number = packageJson.godotBridgeProtocolVersion;

const SHA256_PATTERN: RegExp = /^[a-f0-9]{64}$/u;
const VERSION_PATTERN: RegExp = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

export type BackendPlatform = "win32" | "linux";
export type BackendAuthenticodeStatus = "signed" | "unsigned";

export type BackendExecutableManifest = {
        fileName: "daedalus-backend.exe" | "daedalus-backend";
        size: number;
        sha256: string;
};

export type BackendSandboxHelperManifest = {
        fileName: "daedalus-windows-sandbox-helper.exe";
        size: number;
        sha256: string;
};

export type BackendPayloadManifestV1 = {
        schemaVersion: 1;
        version: string;
        buildId: string;
        platform: BackendPlatform;
        arch: "x64";
        nodeVersion: string;
        protocolVersion: number;
        minBridgeProtocolVersion: number;
        maxBridgeProtocolVersion: number;
        minStudioVersion: string;
        publishedAt: string;
        authenticode: BackendAuthenticodeStatus;
        executable: BackendExecutableManifest;
        sandboxHelper: BackendSandboxHelperManifest | null;
};

export type BackendReleaseManifestV1 = BackendPayloadManifestV1 & {
        archive: {
                fileName: "daedalus-backend-win32-x64.zip" | "daedalus-backend-linux-x64.zip";
                size: number;
                sha256: string;
        };
        payloadManifestSha256: string;
};

export class BackendManifestCompatibilityError extends Error {
        public constructor(message: string) {
                super(message);
                this.name = "BackendManifestCompatibilityError";
        }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
                throw new Error(`${label} must be a JSON object.`);
        }
        return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
        const value: unknown = record[key];
        if (typeof value !== "string" || value.trim().length === 0) {
                throw new Error(`Backend manifest field "${key}" must be a non-empty string.`);
        }
        return value.trim();
}

function requireLiteral<TValue extends string | number>(
        record: Record<string, unknown>,
        key: string,
        expected: TValue
): TValue {
        if (record[key] !== expected) {
                throw new Error(`Backend manifest field "${key}" must be ${JSON.stringify(expected)}.`);
        }
        return expected;
}

function requirePositiveInteger(record: Record<string, unknown>, key: string): number {
        const value: unknown = record[key];
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
                throw new Error(`Backend manifest field "${key}" must be a positive integer.`);
        }
        return value;
}

function requireVersion(record: Record<string, unknown>, key: string): string {
        const value: string = requireString(record, key);
        if (!VERSION_PATTERN.test(value)) {
                throw new Error(`Backend manifest field "${key}" is not a supported semantic version.`);
        }
        return value;
}

function requireSha256(record: Record<string, unknown>, key: string): string {
        const value: string = requireString(record, key).toLowerCase();
        if (!SHA256_PATTERN.test(value)) {
                throw new Error(`Backend manifest field "${key}" must be a lowercase SHA-256 digest.`);
        }
        return value;
}

function requireBackendPlatform(record: Record<string, unknown>): BackendPlatform {
        const value: string = requireString(record, "platform");
        if (value !== "win32" && value !== "linux") {
                throw new Error(`Backend manifest platform "${value}" is not supported.`);
        }
        return value;
}

function getExecutableFileName(platform: BackendPlatform): BackendExecutableManifest["fileName"] {
        return platform === "win32" ? "daedalus-backend.exe" : "daedalus-backend";
}

function getArchiveFileName(platform: BackendPlatform): BackendReleaseManifestV1["archive"]["fileName"] {
        return `daedalus-backend-${platform}-x64.zip`;
}

function parseSandboxHelper(
        record: Record<string, unknown>,
        platform: BackendPlatform
): BackendSandboxHelperManifest | null {
        if (platform === "linux") {
                if (record.sandboxHelper !== undefined && record.sandboxHelper !== null) {
                        throw new Error("Linux backend manifests must not include a Windows sandbox helper.");
                }
                return null;
        }
        const sandboxHelperRecord: Record<string, unknown> = requireRecord(
                record.sandboxHelper,
                "Backend sandbox helper manifest"
        );
        return {
                fileName: requireLiteral(
                        sandboxHelperRecord,
                        "fileName",
                        "daedalus-windows-sandbox-helper.exe"
                ),
                size: requirePositiveInteger(sandboxHelperRecord, "size"),
                sha256: requireSha256(sandboxHelperRecord, "sha256")
        };
}

function parsePayloadManifestRecord(record: Record<string, unknown>): BackendPayloadManifestV1 {
        const platform: BackendPlatform = requireBackendPlatform(record);
        const executableRecord: Record<string, unknown> = requireRecord(
                record.executable,
                "Backend executable manifest"
        );
        const executableFileName: BackendExecutableManifest["fileName"] = requireString(
                executableRecord,
                "fileName"
        ) as BackendExecutableManifest["fileName"];
        const expectedExecutableFileName: BackendExecutableManifest["fileName"] = getExecutableFileName(platform);
        if (executableFileName !== expectedExecutableFileName) {
                throw new Error(
                        `Backend executable fileName must be "${expectedExecutableFileName}" for ${platform}.`
                );
        }
        const authenticode: string = requireString(record, "authenticode");
        if (authenticode !== "signed" && authenticode !== "unsigned") {
                throw new Error("Backend manifest field " + JSON.stringify("authenticode") + " must be signed or unsigned.");
        }
        const publishedAt: string = requireString(record, "publishedAt");
        if (Number.isNaN(Date.parse(publishedAt))) {
                throw new Error("Backend manifest field " + JSON.stringify("publishedAt") + " must be an ISO timestamp.");
        }
        return {
                schemaVersion: requireLiteral(record, "schemaVersion", BACKEND_BINARY_MANIFEST_SCHEMA_VERSION),
                version: requireVersion(record, "version"),
                buildId: requireString(record, "buildId"),
                platform,
                arch: requireLiteral(record, "arch", "x64"),
                nodeVersion: requireVersion(record, "nodeVersion"),
                protocolVersion: requirePositiveInteger(record, "protocolVersion"),
                minBridgeProtocolVersion: requirePositiveInteger(record, "minBridgeProtocolVersion"),
                maxBridgeProtocolVersion: requirePositiveInteger(record, "maxBridgeProtocolVersion"),
                minStudioVersion: requireVersion(record, "minStudioVersion"),
                publishedAt,
                authenticode,
                executable: {
                        fileName: executableFileName,
                        size: requirePositiveInteger(executableRecord, "size"),
                        sha256: requireSha256(executableRecord, "sha256")
                },
                sandboxHelper: parseSandboxHelper(record, platform)
        };
}

export function parseBackendPayloadManifest(value: unknown): BackendPayloadManifestV1 {
        return parsePayloadManifestRecord(requireRecord(value, "Backend payload manifest"));
}

export function parseBackendReleaseManifest(value: unknown): BackendReleaseManifestV1 {
        const record: Record<string, unknown> = requireRecord(value, "Backend release manifest");
        const payload: BackendPayloadManifestV1 = parsePayloadManifestRecord(record);
        const archiveRecord: Record<string, unknown> = requireRecord(
                record.archive,
                "Backend archive manifest"
        );
        const archiveFileName: BackendReleaseManifestV1["archive"]["fileName"] = requireString(
                archiveRecord,
                "fileName"
        ) as BackendReleaseManifestV1["archive"]["fileName"];
        const expectedArchiveFileName: BackendReleaseManifestV1["archive"]["fileName"] = getArchiveFileName(payload.platform);
        if (archiveFileName !== expectedArchiveFileName) {
                throw new Error(`Backend archive file name must be "${expectedArchiveFileName}".`);
        }
        return {
                ...payload,
                archive: {
                        fileName: archiveFileName,
                        size: requirePositiveInteger(archiveRecord, "size"),
                        sha256: requireSha256(archiveRecord, "sha256")
                },
                payloadManifestSha256: requireSha256(record, "payloadManifestSha256")
        };
}

export function parseSemanticVersion(version: string): [number, number, number] | null {
        const core: string = version.trim().split(/[+-]/u)[0] ?? "";
        const match: RegExpMatchArray | null = core.match(/^(\d+)\.(\d+)\.(\d+)$/u);
        if (match === null) {
                return null;
        }
        return [
                Number.parseInt(match[1]!, 10),
                Number.parseInt(match[2]!, 10),
                Number.parseInt(match[3]!, 10)
        ];
}

export function compareSemanticVersions(leftVersion: string, rightVersion: string): number {
        const left: [number, number, number] | null = parseSemanticVersion(leftVersion);
        const right: [number, number, number] | null = parseSemanticVersion(rightVersion);
        if (left === null || right === null) {
                throw new Error(`Cannot compare backend versions "${leftVersion}" and "${rightVersion}".`);
        }
        for (let index: number = 0; index < left.length; index += 1) {
                if (left[index]! !== right[index]!) {
                        return left[index]! > right[index]! ? 1 : -1;
                }
        }
        return 0;
}

export function assertBackendManifestCompatible(
        manifest: BackendPayloadManifestV1,
        studioVersion: string
): void {
        if (manifest.protocolVersion !== BACKEND_PROTOCOL_VERSION) {
                throw new BackendManifestCompatibilityError(
                        `Backend protocol ${manifest.protocolVersion} is incompatible with Studio protocol ${BACKEND_PROTOCOL_VERSION}.`
                );
        }
        if (compareSemanticVersions(studioVersion, manifest.minStudioVersion) < 0) {
                throw new BackendManifestCompatibilityError(
                        `Backend ${manifest.version} requires Daedalus Studio ${manifest.minStudioVersion} or newer.`
                );
        }
        if (
                manifest.minBridgeProtocolVersion > GODOT_BRIDGE_PROTOCOL_VERSION
                || manifest.maxBridgeProtocolVersion < GODOT_BRIDGE_PROTOCOL_VERSION
        ) {
                throw new BackendManifestCompatibilityError(
                        `Backend ${manifest.version} does not support bundled Editor Bridge Protocol ${GODOT_BRIDGE_PROTOCOL_VERSION}.`
                );
        }
}

function sandboxHelpersMatch(
        left: BackendPayloadManifestV1,
        right: BackendPayloadManifestV1
): boolean {
        if (left.sandboxHelper === null || right.sandboxHelper === null) {
                return left.sandboxHelper === null && right.sandboxHelper === null;
        }
        return left.sandboxHelper.fileName === right.sandboxHelper.fileName
                && left.sandboxHelper.size === right.sandboxHelper.size
                && left.sandboxHelper.sha256 === right.sandboxHelper.sha256;
}

export function payloadManifestsMatch(
        left: BackendPayloadManifestV1,
        right: BackendPayloadManifestV1
): boolean {
        return left.version === right.version
                && left.buildId === right.buildId
                && left.platform === right.platform
                && left.arch === right.arch
                && left.nodeVersion === right.nodeVersion
                && left.protocolVersion === right.protocolVersion
                && left.minBridgeProtocolVersion === right.minBridgeProtocolVersion
                && left.maxBridgeProtocolVersion === right.maxBridgeProtocolVersion
                && left.minStudioVersion === right.minStudioVersion
                && left.publishedAt === right.publishedAt
                && left.authenticode === right.authenticode
                && left.executable.fileName === right.executable.fileName
                && left.executable.size === right.executable.size
                && left.executable.sha256 === right.executable.sha256
                && sandboxHelpersMatch(left, right);
}
