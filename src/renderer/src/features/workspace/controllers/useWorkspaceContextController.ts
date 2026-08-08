import { useRef, type Dispatch, type SetStateAction } from "react";
import { saveImageAttachment, saveTextAttachment } from "@/api/image-attachment-api";
import type { AdditionalContextItem, WorkbenchPatch, WorkspaceConfig } from "@/api/types";
import {
	CONTEXT_SUBTITLE_MAX_CHARS,
	MAX_IMAGE_ATTACHMENT_BYTES,
	RECENT_CONTEXT_FILE_WINDOW_MS,
	type WorkspacePickedEntry,
	createExternalFileContextItem,
	createSingleSourceWorkspaceSnapshot,
	createWorkspacePathContextItem,
	createContextFileSignature,
	getLocalPathForFile,
	isLocalPathInsideWorkspace,
	isSupportedImageMimeType,
	readFileAsDataUrl,
	readImageDimensions
} from "./context-helpers";

type ContextPatchAction = NonNullable<WorkbenchPatch["additionalContextAction"]>;

export type WorkspaceContextControllerParams = {
	activeSessionId: string | null;
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
	patchContext: (action: ContextPatchAction) => void;
	handleAddImageFiles: (files: File[]) => Promise<void>;
	handleAddPastedTextAttachment: (content: string) => boolean;
	handleAddWorkspaceContext: (kind: "files" | "folder") => Promise<void>;
	handleAddContextFiles: (files: File[]) => Promise<void>;
};

export default function useWorkspaceContextController(params: WorkspaceContextControllerParams): WorkspaceContextController {
	const recentContextFileSignaturesRef = useRef<Map<string, number>>(new Map());

	function patchContext(action: ContextPatchAction): void {
		params.queueWorkbenchPatch({ additionalContextAction: action }, true);
	}

	async function handleAddImageFiles(files: File[]): Promise<void> {
		if (params.activeSessionId === null) {
			params.showTransientError("Please open a session before adding images.");
			return;
		}

		try {
			for (const file of files.slice(0, 3)) {
				if (!isSupportedImageMimeType(file.type)) {
					throw new Error(`Unsupported image type: ${file.type || file.name}`);
				}
				if (file.size <= 0 || file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
					throw new Error(`${file.name} is larger than 5 MiB.`);
				}
				const dataUrl: string = await readFileAsDataUrl(file);
				const dimensions = await readImageDimensions(dataUrl);
				const sourcePath: string | null = getLocalPathForFile(file);
				const result = await saveImageAttachment({
					sessionId: params.activeSessionId,
					mimeType: file.type,
					dataUrl,
					byteSize: file.size,
					width: dimensions.width,
					height: dimensions.height,
					title: file.name,
					sourcePath: sourcePath ?? undefined
				});
				patchContext({ action: "addOrReplace", item: result.attachment });
			}
		} catch (error: unknown) {
			params.showTransientError(error instanceof Error ? error.message : "Failed to add image");
			console.error("[App] add image failed", error);
		}
	}

	function handleAddPastedTextAttachment(content: string): boolean {
		if (params.activeSessionId === null) {
			return false;
		}

		params.setPendingTextAttachmentCount((count: number): number => count + 1);
		void saveTextAttachment({ sessionId: params.activeSessionId, content })
			.then((result): void => {
				patchContext({ action: "addOrReplace", item: result.attachment });
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
				kind: params.activeSessionMetadata.workspaceKind ?? "godot",
				rootPath: params.activeSessionMetadata.workspaceRoot,
				godotExecutablePath: params.activeSessionMetadata.godotExecutablePath
			});
		}
		return null;
	}

	async function handleAddWorkspaceContext(kind: "files" | "folder"): Promise<void> {
		if (params.activeSessionId === null) {
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
		if (params.activeSessionId === null) {
			params.showTransientError("Please open a session before adding files.");
			return;
		}

		const imageFiles: File[] = [];
		const workspaceFiles: File[] = [];
		for (const file of nextFiles) {
			if (isSupportedImageMimeType(file.type)) imageFiles.push(file);
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
		patchContext,
		handleAddImageFiles,
		handleAddPastedTextAttachment,
		handleAddWorkspaceContext,
		handleAddContextFiles
	};
}


