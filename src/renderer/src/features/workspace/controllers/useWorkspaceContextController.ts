import { useRef, type Dispatch, type SetStateAction } from "react";
import { saveImageAttachment, saveTextAttachment } from "@/platform/rpc/image-attachment-api";
import type { AdditionalContextItem, WorkbenchPatch, WorkbenchPatchResult, WorkbenchSnapshot, WorkspaceConfig } from "@/platform/rpc/types";
import { createImageImportTask, prepareImageFile, type ImageImport } from "./image-import";
import type { PastedTextAttachmentInput } from "@/domain/conversation/pasted-text-attachment";
import {
	CONTEXT_SUBTITLE_MAX_CHARS,
	RECENT_CONTEXT_FILE_WINDOW_MS,
	type WorkspacePickedEntry,
	createExternalFileContextItem,
	createSingleSourceWorkspaceSnapshot,
	createWorkspacePathContextItem,
	createContextFileSignature,
	getLocalPathForFile,
	isLocalPathInsideWorkspace,
	resolveSupportedImageMimeType,
} from "./context-helpers";

type ContextPatchAction = NonNullable<WorkbenchPatch["additionalContextAction"]>;

export type WorkspaceContextControllerParams = {
	getNavigationVersion: () => number;
	getActiveSessionId: () => string | null;
	getWorkbench: () => WorkbenchSnapshot | null;
	sendWorkbenchPatch: (patch: WorkbenchPatch, applyResult?: boolean, beforeSend?: () => void) => Promise<WorkbenchPatchResult | null>;
	applyWorkbench: (workbench: WorkbenchSnapshot) => void;
	ensureActiveSessionId: () => Promise<string | null>;
	activeWorkspace: WorkspaceConfig | null;
	activeSessionMetadata: {
		workspaceId?: string;
		workspaceName?: string;
		workspaceKind?: WorkspaceConfig["kind"];
		workspaceRoot?: string;
		godotExecutablePath?: string;
	} | null;
	queueWorkbenchPatch: (patch: WorkbenchPatch, immediate?: boolean) => void;
	setPendingTextAttachmentCount: Dispatch<SetStateAction<number>>;
	showTransientError: (message: string) => void;
};

export type WorkspaceContextController = {
	createImageImport: () => ImageImport;
	patchContext: (action: ContextPatchAction) => void;
	handleAddImageFiles: (files: File[]) => Promise<void>;
	handleAddPastedTextAttachment: (input: PastedTextAttachmentInput) => boolean;
	handleAddWorkspaceContext: (kind: "files" | "folder") => Promise<void>;
	handleAddContextFiles: (files: File[]) => Promise<void>;
};

export default function useWorkspaceContextController(params: WorkspaceContextControllerParams): WorkspaceContextController {
	const recentContextFileSignaturesRef = useRef<Map<string, number>>(new Map());
	const latest = useRef(params);
	latest.current = params;
	const imageQueue = useRef<Promise<unknown>>(Promise.resolve());

	function createImageImport(): ImageImport {
		const version = params.getNavigationVersion();
		const task = createImageImportTask({
			assertCurrent: () => {
				if (latest.current.getNavigationVersion() !== version) throw new Error("image_import_scope_changed");
			},
			getSessionId: () => latest.current.getActiveSessionId(),
			ensureSession: () => latest.current.ensureActiveSessionId(),
			getItems: () => latest.current.getWorkbench()?.composer.additionalContext ?? [],
			save: saveImageAttachment,
			commit: async (item, assertCurrent) => {
				assertCurrent();
				const result = await latest.current.sendWorkbenchPatch({ additionalContextAction: { action: "addOrReplace", item } }, false, assertCurrent);
				assertCurrent();
				if (!result || result.workbench.sessionId !== latest.current.getActiveSessionId()) throw new Error("image_import_scope_changed");
				latest.current.applyWorkbench(result.workbench);
			},
		});
		return (image, isCancelled) => {
			const result = imageQueue.current.then(() => task(image, isCancelled));
			imageQueue.current = result.catch(() => undefined);
			return result;
		};
	}

	function patchContext(action: ContextPatchAction): void {
		params.queueWorkbenchPatch({ additionalContextAction: action }, true);
	}

	async function handleAddImageFiles(files: File[]): Promise<void> {
		const importImage = createImageImport();
		try {
			for (const file of files) {
				await importImage(await prepareImageFile(file));
			}
		} catch (error: unknown) {
			params.showTransientError(error instanceof Error ? error.message : "Failed to add image");
			console.error("[App] add image failed", error);
		}
	}

	function handleAddPastedTextAttachment(input: PastedTextAttachmentInput): boolean {
		params.setPendingTextAttachmentCount((count: number): number => count + 1);
		void params.ensureActiveSessionId()
			.then((sessionId: string | null) => {
				if (sessionId === null) {
					throw new Error("Please open a session before adding pasted text.");
				}
				return saveTextAttachment({ sessionId, content: input.content });
			})
			.then((result): void => {
				const data: Record<string, unknown> = typeof result.attachment.data === "object" && result.attachment.data !== null && !Array.isArray(result.attachment.data)
					? result.attachment.data as Record<string, unknown>
					: {};
				patchContext({
					action: "addOrReplace",
					item: {
						...result.attachment,
						data: { ...data, composerPasteOrigin: input.origin }
					}
				});
			})
			.catch((error: unknown): void => {
				params.showTransientError(error instanceof Error ? error.message : "Failed to save pasted text");
				console.error("[App] save pasted text attachment failed", error);
			})
			.finally((): void => {
				params.setPendingTextAttachmentCount((count: number): number => Math.max(0, count - 1));
			});
		return true;
	}

	function getContextWorkspace(): WorkspaceConfig | null {
		if (params.activeWorkspace !== null) {
			return params.activeWorkspace;
		}
		if (params.activeSessionMetadata?.workspaceId !== undefined && params.activeSessionMetadata.workspaceRoot !== undefined) {
			return createSingleSourceWorkspaceSnapshot({
				id: params.activeSessionMetadata.workspaceId,
				name: params.activeSessionMetadata.workspaceName ?? params.activeSessionMetadata.workspaceId,
				kind: params.activeSessionMetadata.workspaceKind ?? "workspace",
				rootPath: params.activeSessionMetadata.workspaceRoot,
				godotExecutablePath: params.activeSessionMetadata.godotExecutablePath
			});
		}
		return null;
	}

	async function handleAddWorkspaceContext(kind: "files" | "folder"): Promise<void> {
		if (await params.ensureActiveSessionId() === null) {
			params.showTransientError("Please open a session before adding files or folders.");
			return;
		}
		const workspace: WorkspaceConfig | null = getContextWorkspace();
		if (workspace === null) {
			params.showTransientError("Please select a workspace before adding files or folders.");
			return;
		}

		try {
			const entries: WorkspacePickedEntry[] | null = kind === "files"
				? await window.electronAPI.workspaceFs.pickWorkspaceFiles({ workspaceRoot: workspace.rootPath })
				: await window.electronAPI.workspaceFs.pickWorkspaceFolder({ workspaceRoot: workspace.rootPath });
			if (entries === null || entries.length === 0) {
				return;
			}
			for (const entry of entries) {
				patchContext({ action: "addOrReplace", item: createWorkspacePathContextItem(entry, workspace) });
			}
		} catch (error: unknown) {
			params.showTransientError(error instanceof Error ? error.message : "Failed to add workspace context");
			console.error("[App] add workspace context failed", error);
		}
	}

	async function handleAddContextFiles(files: File[]): Promise<void> {
		if (await params.ensureActiveSessionId() === null) {
			params.showTransientError("Please open a session before adding files.");
			return;
		}

		const now: number = Date.now();
		for (const [signature, timestamp] of recentContextFileSignaturesRef.current) {
			if (now - timestamp > RECENT_CONTEXT_FILE_WINDOW_MS) {
				recentContextFileSignaturesRef.current.delete(signature);
			}
		}

		const nextFiles: File[] = [];
		for (const file of files) {
			const signature: string = createContextFileSignature(file);
			if (recentContextFileSignaturesRef.current.has(signature)) {
				continue;
			}
			recentContextFileSignaturesRef.current.set(signature, now);
			nextFiles.push(file);
		}
		if (nextFiles.length === 0) {
			return;
		}

		const imageFiles: File[] = [];
		const workspaceFiles: File[] = [];
		for (const file of nextFiles) {
			if (resolveSupportedImageMimeType(file) !== null) imageFiles.push(file);
			else workspaceFiles.push(file);
		}

		try {
			if (imageFiles.length > 0) await handleAddImageFiles(imageFiles);
			if (workspaceFiles.length === 0) return;

			const localFiles: Array<{ file: File; path: string }> = workspaceFiles.flatMap((file: File): Array<{ file: File; path: string }> => {
				const filePath: string | null = getLocalPathForFile(file);
				return filePath === null ? [] : [{ file, path: filePath }];
			});
			if (localFiles.length === 0) {
				params.showTransientError(imageFiles.length > 0 ? "Images added. Dropped files did not expose local paths." : "Dropped files did not expose local paths.");
				return;
			}

			const workspace: WorkspaceConfig | null = getContextWorkspace();
			const workspaceLocalFiles = workspace === null ? [] : localFiles.filter((entry): boolean => isLocalPathInsideWorkspace(entry.path, workspace.rootPath));
			const externalLocalFiles = workspace === null ? localFiles : localFiles.filter((entry): boolean => !isLocalPathInsideWorkspace(entry.path, workspace.rootPath));

			if (workspace !== null && workspaceLocalFiles.length > 0) {
				const entries: WorkspacePickedEntry[] = await window.electronAPI.workspaceFs.createEntriesFromPaths({
					workspaceRoot: workspace.rootPath,
					paths: workspaceLocalFiles.map((entry): string => entry.path)
				});
				for (const entry of entries) {
					patchContext({ action: "addOrReplace", item: createWorkspacePathContextItem(entry, workspace) });
				}
			}
			for (const entry of externalLocalFiles) {
				patchContext({ action: "addOrReplace", item: createExternalFileContextItem(entry.file, entry.path) });
			}
		} catch (error: unknown) {
			params.showTransientError(error instanceof Error ? error.message : "Failed to add files");
			console.error("[App] add context files failed", error);
		}
	}

	return {
		createImageImport,
		patchContext,
		handleAddImageFiles,
		handleAddPastedTextAttachment,
		handleAddWorkspaceContext,
		handleAddContextFiles
	};
}
