import { createBackendClient } from "./transport/backend-client";
import type { SubagentGraphSnapshot } from "./types";

export type SubagentGraphListResult = {
	graphs: SubagentGraphSnapshot[];
	nextCursor: string | null;
};

export async function listSubagentGraphs(
	sessionId: string,
	limit: number = 100,
): Promise<SubagentGraphListResult> {
	const client = await createBackendClient();
	return client.request<SubagentGraphListResult>("agent.subgraph.list", {
		sessionId,
		limit,
	});
}

export async function getSubagentGraph(
	graphId: string,
): Promise<SubagentGraphSnapshot> {
	const client = await createBackendClient();
	return client.request<SubagentGraphSnapshot>("agent.subgraph.get", { graphId });
}
