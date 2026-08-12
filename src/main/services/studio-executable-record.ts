import { app } from "electron";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { getDaedalusDir } from "./backend-binary-store";

export type StudioExecutableRecordV1 = {
	schemaVersion: 1;
	version: string;
	executablePath: string;
	arguments: string[];
	updatedAt: string;
};

export function getStudioExecutableRecordPath(): string {
	return join(getDaedalusDir(), "studio", "current.json");
}

export async function publishStudioExecutableRecord(): Promise<void> {
	const executablePath: string = resolve(app.getPath("exe"));
	const record: StudioExecutableRecordV1 = {
		schemaVersion: 1,
		version: app.getVersion(),
		executablePath,
		arguments: app.isPackaged ? [] : [resolve(app.getAppPath())],
		updatedAt: new Date().toISOString()
	};
	const recordPath: string = getStudioExecutableRecordPath();
	await mkdir(dirname(recordPath), { recursive: true });
	const temporaryPath: string = `${recordPath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
	await rename(temporaryPath, recordPath);
}
