import { app } from "electron";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { getDaedalusDir } from "./backend-binary-store";

export type StudioExecutableRecordV2 = {
	schemaVersion: 2;
	version: string;
	executablePath: string;
	arguments: string[];
	processId: number;
	runtime: {
		mode: "development" | "managed";
		authentication: "none" | "managed";
		url?: string;
	};
	updatedAt: string;
};

export type StudioExecutableRecordInput = {
	version: string;
	executablePath: string;
	appPath: string;
	isPackaged: boolean;
	processId: number;
	backendPort: number;
	updatedAt?: string;
};

export function getStudioExecutableRecordPath(): string {
	return join(getDaedalusDir(), "studio", "current.json");
}

export function createStudioExecutableRecord(input: StudioExecutableRecordInput): StudioExecutableRecordV2 {
	const executablePath: string = resolve(input.executablePath);
	return {
		schemaVersion: 2,
		version: input.version,
		executablePath,
		arguments: input.isPackaged ? [] : [resolve(input.appPath)],
		processId: input.processId,
		runtime: input.isPackaged
			? { mode: "managed", authentication: "managed" }
			: {
				mode: "development",
				authentication: "none",
				url: `ws://127.0.0.1:${input.backendPort}`
			},
		updatedAt: input.updatedAt ?? new Date().toISOString()
	};
}

export async function publishStudioExecutableRecord(backendPort: number): Promise<void> {
	const record: StudioExecutableRecordV2 = createStudioExecutableRecord({
		version: app.getVersion(),
		executablePath: app.getPath("exe"),
		appPath: app.getAppPath(),
		isPackaged: app.isPackaged,
		processId: process.pid,
		backendPort
	});
	const recordPath: string = getStudioExecutableRecordPath();
	await mkdir(dirname(recordPath), { recursive: true });
	const temporaryPath: string = `${recordPath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
	await rename(temporaryPath, recordPath);
}
