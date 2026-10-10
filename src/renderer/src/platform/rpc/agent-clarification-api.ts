import { createBackendClient } from "@/platform/rpc/transport/backend-client";

export async function answerAgentClarification(sessionId: string, questionId: string, answer: string): Promise<void> {
	const client = await createBackendClient();
	await client.request("agent.clarification.answer", { sessionId, questionId, answer });
}
