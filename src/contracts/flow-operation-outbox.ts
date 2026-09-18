export type PersistedFlowOperation = {
	mutationId: string;
	kind: string;
	[key: string]: unknown;
};

export type FlowOperationOutboxDocument = Record<string, PersistedFlowOperation[]>;
