import { ipcMain } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FlowOperationOutboxDocument, PersistedFlowOperation } from "../../contracts/flow-operation-outbox";
import { getDaedalusDir } from "./backend-binary-store";

const MAX_DOCUMENT_BYTES: number = 2 * 1024 * 1024;
const MAX_OPERATIONS_PER_FLOW: number = 2_000;
const WRITE_DEBOUNCE_MS: number = 40;
let writeTail: Promise<void> = Promise.resolve();
let cachedDocumentPromise: Promise<FlowOperationOutboxDocument> | null = null;
let writeTimer: NodeJS.Timeout | null = null;
let pendingWriteWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

function getOutboxPath(): string {
	return join(getDaedalusDir(), "studio", "flow-operation-outbox.json");
}

function isOperation(value: unknown): value is PersistedFlowOperation {
	return typeof value === "object" && value !== null && typeof (value as PersistedFlowOperation).mutationId === "string" && typeof (value as PersistedFlowOperation).kind === "string";
}

function normalizeDocument(value: unknown): FlowOperationOutboxDocument {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
	const result: FlowOperationOutboxDocument = {};
	for (const [flowId, operations] of Object.entries(value)) {
		if (flowId.length === 0 || flowId.length > 256 || !Array.isArray(operations)) continue;
		const normalized = operations.filter(isOperation).slice(-MAX_OPERATIONS_PER_FLOW);
		if (normalized.length > 0) result[flowId] = normalized;
	}
	return result;
}

async function readOutbox(): Promise<FlowOperationOutboxDocument> {
	try {
		const content = await readFile(getOutboxPath(), "utf8");
		if (Buffer.byteLength(content, "utf8") > MAX_DOCUMENT_BYTES) return {};
		return normalizeDocument(JSON.parse(content) as unknown);
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		return {};
	}
}

function getCachedDocument(): Promise<FlowOperationOutboxDocument> {
	cachedDocumentPromise ??= readOutbox();
	return cachedDocumentPromise;
}

async function writeOutbox(document: FlowOperationOutboxDocument): Promise<void> {
	const content = JSON.stringify(document);
	if (Buffer.byteLength(content, "utf8") > MAX_DOCUMENT_BYTES) throw new Error("flow_operation_outbox_too_large");
	const path = getOutboxPath();
	const temporaryPath = `${path}.${process.pid}.tmp`;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(temporaryPath, content, "utf8");
	await rename(temporaryPath, path);
}

function scheduleOutboxWrite(document: FlowOperationOutboxDocument): Promise<void> {
	if (writeTimer !== null) clearTimeout(writeTimer);
	const completion = new Promise<void>((resolve, reject): void => {
		pendingWriteWaiters.push({ resolve, reject });
	});
	writeTimer = setTimeout((): void => {
		writeTimer = null;
		const waiters = pendingWriteWaiters;
		pendingWriteWaiters = [];
		const snapshot = structuredClone(document);
		const operation = writeTail.then(async (): Promise<void> => await writeOutbox(snapshot));
		writeTail = operation.catch((): void => undefined);
		void operation.then(
			(): void => waiters.forEach((waiter): void => waiter.resolve()),
			(error: unknown): void => waiters.forEach((waiter): void => waiter.reject(error)),
		);
	}, WRITE_DEBOUNCE_MS);
	return completion;
}

async function replaceFlowOperations(flowId: string, operations: unknown): Promise<void> {
	if (flowId.length === 0 || flowId.length > 256 || !Array.isArray(operations)) throw new Error("flow_operation_outbox_invalid");
	const normalized = operations.filter(isOperation);
	if (normalized.length !== operations.length || normalized.length > MAX_OPERATIONS_PER_FLOW) throw new Error("flow_operation_outbox_invalid");
	const document = await getCachedDocument();
	if (normalized.length === 0) delete document[flowId];
	else document[flowId] = normalized;
	await scheduleOutboxWrite(document);
}

export function registerFlowOperationOutboxIpc(): void {
	ipcMain.handle("flow-operation-outbox:load", async (): Promise<FlowOperationOutboxDocument> => structuredClone(await getCachedDocument()));
	ipcMain.handle("flow-operation-outbox:replace", async (_event, flowId: unknown, operations: unknown): Promise<void> => {
		if (typeof flowId !== "string") throw new Error("flow_operation_outbox_invalid");
		await replaceFlowOperations(flowId, operations);
	});
}
