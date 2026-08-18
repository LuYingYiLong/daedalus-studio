import { createDecipheriv, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { app, safeStorage, type Session } from "electron";
import type { BrowserImportProfile, BrowserImportResult, BrowserProfileSource } from "../../../contracts/browser";
import { isBrowserPasswordEncryptionAvailable, type BrowserPasswordStore } from "./browser-password-store";

const WINDOWS_EPOCH_SECONDS: number = 11_644_473_600;
const execFileAsync = promisify(execFile);

export type DiscoveredBrowserImportProfile = BrowserImportProfile & {
	profilePath: string;
};

function getBrowserRoot(source: BrowserProfileSource): string {
	const localAppData: string = process.env.LOCALAPPDATA ?? app.getPath("home");
	return source === "chrome"
		? join(localAppData, "Google", "Chrome", "User Data")
		: join(localAppData, "Microsoft", "Edge", "User Data");
}

async function unprotectWindowsData(value: Buffer): Promise<Buffer> {
	const script: string = "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($args[0]),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
	const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script, value.toString("base64")], {
		windowsHide: true,
		maxBuffer: 64 * 1024
	});
	return Buffer.from(stdout.trim(), "base64");
}

async function decodeMasterKey(localState: Record<string, unknown>): Promise<Buffer> {
	const osCrypt: unknown = localState.os_crypt;
	if (typeof osCrypt !== "object" || osCrypt === null || Array.isArray(osCrypt)) throw new Error("browser_import_key_missing");
	const encryptedKey: unknown = (osCrypt as Record<string, unknown>).encrypted_key;
	if (typeof encryptedKey !== "string") throw new Error("browser_import_key_missing");
	const raw: Buffer = Buffer.from(encryptedKey, "base64");
	const payload: Buffer = raw.subarray(raw.subarray(0, 5).toString("ascii") === "DPAPI" ? 5 : 0);
	return await unprotectWindowsData(payload);
}

function decryptChromiumValue(value: Buffer, masterKey: Buffer): { value: Buffer | null; unsupported: boolean } {
	const prefix: string = value.subarray(0, 3).toString("ascii");
	if (prefix === "v20") return { value: null, unsupported: true };
	if (prefix === "v10" || prefix === "v11") {
		try {
			const nonce: Buffer = value.subarray(3, 15);
			const encrypted: Buffer = value.subarray(15, -16);
			const authTag: Buffer = value.subarray(-16);
			const decipher = createDecipheriv("aes-256-gcm", masterKey, nonce);
			decipher.setAuthTag(authTag);
			return { value: Buffer.concat([decipher.update(encrypted), decipher.final()]), unsupported: false };
		} catch {
			return { value: null, unsupported: false };
		}
	}
	try {
		return { value: Buffer.from(safeStorage.decryptString(value), "utf8"), unsupported: false };
	} catch {
		return { value: null, unsupported: false };
	}
}

async function createDatabaseSnapshot(databasePath: string): Promise<{ directory: string; databasePath: string }> {
	const directory: string = await mkdtemp(join(tmpdir(), "daedalus-browser-import-"));
	const targetPath: string = join(directory, basename(databasePath));
	await copyFile(databasePath, targetPath);
	for (const suffix of ["-wal", "-shm"]) {
		try { await copyFile(`${databasePath}${suffix}`, `${targetPath}${suffix}`); } catch { /* optional SQLite sidecar */ }
	}
	return { directory, databasePath: targetPath };
}

export async function listBrowserImportProfiles(): Promise<DiscoveredBrowserImportProfile[]> {
	if (process.platform !== "win32") return [];
	const profiles: DiscoveredBrowserImportProfile[] = [];
	for (const source of ["chrome", "edge"] as const) {
		const root: string = getBrowserRoot(source);
		try {
			const localState = JSON.parse(await readFile(join(root, "Local State"), "utf8")) as Record<string, unknown>;
			const profile: unknown = localState.profile;
			const infoCache: unknown = typeof profile === "object" && profile !== null && !Array.isArray(profile)
				? (profile as Record<string, unknown>).info_cache
				: undefined;
			if (typeof infoCache !== "object" || infoCache === null || Array.isArray(infoCache)) continue;
			for (const [profileId, metadata] of Object.entries(infoCache as Record<string, unknown>)) {
				const name: unknown = typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
					? (metadata as Record<string, unknown>).name
					: undefined;
				profiles.push({ source, profileId, name: typeof name === "string" ? name : profileId, profilePath: join(root, profileId) });
			}
		} catch { /* browser not installed or profile unavailable */ }
	}
	return profiles;
}

export async function importBrowserProfile(params: {
	profile: DiscoveredBrowserImportProfile;
	includeCookies: boolean;
	includePasswords: boolean;
	session: Session;
	passwordStore: BrowserPasswordStore;
}): Promise<BrowserImportResult> {
	const result: BrowserImportResult = { cookiesImported: 0, passwordsImported: 0, skipped: 0, unsupported: 0, errors: [] };
	if (process.platform !== "win32") throw new Error("browser_import_platform_unsupported");
	if (params.includePasswords && !isBrowserPasswordEncryptionAvailable()) throw new Error("browser_password_encryption_unavailable");
	const root: string = getBrowserRoot(params.profile.source);
	const localState = JSON.parse(await readFile(join(root, "Local State"), "utf8")) as Record<string, unknown>;
	const masterKey: Buffer = await decodeMasterKey(localState);

	if (params.includeCookies) {
		const sourcePath: string = join(params.profile.profilePath, "Network", "Cookies");
		let snapshot: { directory: string; databasePath: string } | null = null;
		try {
			snapshot = await createDatabaseSnapshot(sourcePath);
			const database = new DatabaseSync(snapshot.databasePath, { readOnly: true });
			const rows = database.prepare("SELECT host_key, name, path, encrypted_value, expires_utc, is_secure, is_httponly, samesite FROM cookies LIMIT 20000").all() as Array<Record<string, unknown>>;
			database.close();
			for (const row of rows) {
				const decrypted = decryptChromiumValue(Buffer.from(row.encrypted_value as Uint8Array), masterKey);
				if (decrypted.unsupported) { result.unsupported += 1; continue; }
				if (decrypted.value === null) { result.skipped += 1; continue; }
				const domain: string = String(row.host_key ?? "");
				const secure: boolean = Number(row.is_secure ?? 0) === 1;
				const domainDigest: Buffer = createHash("sha256").update(domain).digest();
				const cookieValue: string = (decrypted.value.subarray(0, domainDigest.length).equals(domainDigest)
					? decrypted.value.subarray(domainDigest.length)
					: decrypted.value).toString("utf8");
				try {
					await params.session.cookies.set({
						url: `${secure ? "https" : "http"}://${domain.replace(/^\./u, "")}${String(row.path ?? "/")}`,
						name: String(row.name ?? ""), value: cookieValue, domain, path: String(row.path ?? "/"),
						secure, httpOnly: Number(row.is_httponly ?? 0) === 1,
						...(Number(row.expires_utc ?? 0) > 0 ? { expirationDate: Number(row.expires_utc) / 1_000_000 - WINDOWS_EPOCH_SECONDS } : {}),
						sameSite: Number(row.samesite ?? 0) === 1 ? "lax" : Number(row.samesite ?? 0) === 2 ? "strict" : Number(row.samesite ?? 0) === 0 ? "no_restriction" : "unspecified"
					});
					result.cookiesImported += 1;
				} catch { result.skipped += 1; }
			}
		} catch (error: unknown) {
			result.errors.push(error instanceof Error ? error.message : String(error));
		} finally {
			if (snapshot !== null) await rm(snapshot.directory, { recursive: true, force: true });
		}
	}

	if (params.includePasswords) {
		let snapshot: { directory: string; databasePath: string } | null = null;
		try {
			snapshot = await createDatabaseSnapshot(join(params.profile.profilePath, "Login Data"));
			const database = new DatabaseSync(snapshot.databasePath, { readOnly: true });
			const rows = database.prepare("SELECT origin_url, username_value, password_value FROM logins LIMIT 5000").all() as Array<Record<string, unknown>>;
			database.close();
			for (const row of rows) {
				const decrypted = decryptChromiumValue(Buffer.from(row.password_value as Uint8Array), masterKey);
				if (decrypted.unsupported) { result.unsupported += 1; continue; }
				if (decrypted.value === null || decrypted.value.length === 0) { result.skipped += 1; continue; }
				try {
					await params.passwordStore.save(String(row.origin_url ?? ""), String(row.username_value ?? ""), decrypted.value.toString("utf8"));
					result.passwordsImported += 1;
				} catch { result.skipped += 1; }
			}
		} catch (error: unknown) {
			result.errors.push(error instanceof Error ? error.message : String(error));
		} finally {
			if (snapshot !== null) await rm(snapshot.directory, { recursive: true, force: true });
		}
	}

	return result;
}
