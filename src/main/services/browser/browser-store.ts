import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
	try {
		return JSON.parse(await readFile(filePath, "utf8")) as T;
	} catch {
		return fallback;
	}
}

export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	const temporaryPath: string = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(temporaryPath, filePath);
}
