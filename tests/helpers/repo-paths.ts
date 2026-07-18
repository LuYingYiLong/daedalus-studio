import { readFileSync } from "node:fs";
import { join } from "node:path";

export function repoPath(...segments: string[]): string {
	return join(process.cwd(), ...segments);
}

export function readRepoFile(...segments: string[]): string {
	return readFileSync(repoPath(...segments), "utf8");
}
