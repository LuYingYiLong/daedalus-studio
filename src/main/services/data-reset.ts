import { readdir, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

const DAEDALUS_DIRECTORY_NAME: string = ".daedalus";
const PRESERVED_BACKEND_DIRECTORY: string = "versions";

const STUDIO_DATA_ENTRIES: readonly string[] = [
	"client-preferences.json",
	"session-layouts.json",
	"scheduled-tasks.json",
	"scheduled-task-runs.json",
	"godot-projects.json",
	"daedalus-bridge-staging"
];

export type DataResetOptions = {
	daedalusRoot: string;
	userProfile: string;
	studioDataRoot: string;
};

export type DataResetPlan = {
	daedalusRoot: string;
	studioDataRoot: string;
	backendVersionsRoot: string;
};

type ResetDirectoryEntry = {
	name: string;
	symbolicLink: boolean;
};

function isPathInside(parentPath: string, childPath: string): boolean {
	const parent: string = resolve(parentPath);
	const child: string = resolve(childPath);
	return child !== parent && child.startsWith(`${parent}${sep}`);
}

function assertSafeDaedalusRoot(daedalusRoot: string, userProfile: string): string {
	const expectedRoot: string = resolve(userProfile, DAEDALUS_DIRECTORY_NAME);
	const resolvedRoot: string = resolve(daedalusRoot);
	if (resolvedRoot !== expectedRoot || dirname(resolvedRoot) !== resolve(userProfile)) {
		throw new Error("Refusing to reset an unrecognized Daedalus data directory.");
	}
	return resolvedRoot;
}

function assertSafeChild(parentPath: string, childPath: string): string {
	const resolvedChild: string = resolve(childPath);
	if (!isPathInside(parentPath, resolvedChild)) {
		throw new Error(`Refusing to reset a path outside the managed data directory: ${resolvedChild}`);
	}
	return resolvedChild;
}

async function listEntries(directoryPath: string): Promise<ResetDirectoryEntry[]> {
	try {
		const entries = await readdir(directoryPath, { withFileTypes: true });
		return entries.map((entry): ResetDirectoryEntry => ({
			name: entry.name,
			symbolicLink: entry.isSymbolicLink()
		}));
	} catch (error: unknown) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

export function createDataResetPlan(options: DataResetOptions): DataResetPlan {
	const daedalusRoot: string = assertSafeDaedalusRoot(options.daedalusRoot, options.userProfile);
	const studioDataRoot: string = resolve(options.studioDataRoot);
	if (
		studioDataRoot === resolve(daedalusRoot)
		|| studioDataRoot === resolve(options.userProfile)
		|| dirname(studioDataRoot) === studioDataRoot
	) {
		throw new Error("Refusing to reset an unsafe Studio data directory.");
	}

	return {
		daedalusRoot,
		studioDataRoot,
		backendVersionsRoot: join(daedalusRoot, "backend", PRESERVED_BACKEND_DIRECTORY)
	};
}

export async function resetDaedalusData(options: DataResetOptions): Promise<DataResetPlan> {
	const plan: DataResetPlan = createDataResetPlan(options);
	const daedalusEntries: ResetDirectoryEntry[] = await listEntries(plan.daedalusRoot);
	for (const entry of daedalusEntries) {
		const entryPath: string = assertSafeChild(plan.daedalusRoot, join(plan.daedalusRoot, entry.name));
		if (entry.name !== "backend" || entry.symbolicLink) {
			await rm(entryPath, { force: true, recursive: true });
			continue;
		}

		const backendEntries: ResetDirectoryEntry[] = await listEntries(entryPath);
		for (const backendEntry of backendEntries) {
			if (backendEntry.name === PRESERVED_BACKEND_DIRECTORY && !backendEntry.symbolicLink) {
				continue;
			}
			const backendEntryPath: string = assertSafeChild(entryPath, join(entryPath, backendEntry.name));
			await rm(backendEntryPath, { force: true, recursive: true });
		}
	}

	for (const entryName of STUDIO_DATA_ENTRIES) {
		const entryPath: string = assertSafeChild(plan.studioDataRoot, join(plan.studioDataRoot, entryName));
		await rm(entryPath, { force: true, recursive: true });
	}

	return plan;
}
