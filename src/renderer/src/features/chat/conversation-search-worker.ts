/// <reference lib="webworker" />

import {
	ConversationSearchEngine,
	type ConversationSearchWorkerRequest,
	type ConversationSearchWorkerResponse
} from "./conversation-search-engine";

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const engine = new ConversationSearchEngine();

function respond(message: ConversationSearchWorkerResponse): void {
	workerScope.postMessage(message);
}

workerScope.addEventListener("message", (event: MessageEvent<ConversationSearchWorkerRequest>): void => {
	const request: ConversationSearchWorkerRequest = event.data;
	if (request.type === "reset") {
		engine.reset();
		respond({ type: "ready" });
		return;
	}
	if (request.type === "upsert") {
		engine.upsertDocuments(request.documents);
		respond({ type: "indexed" });
		return;
	}
	if (request.type === "search") {
		const result = engine.search(request.query, request.ordinal);
		respond({
			type: "result",
			requestId: request.requestId,
			total: result.total,
			ordinal: result.ordinal,
			match: result.match
		});
		return;
	}
	const match = engine.resolve(request.ordinal);
	respond({
		type: "result",
		requestId: request.requestId,
		total: engine.getTotal(),
		ordinal: match === null ? -1 : request.ordinal,
		match
	});
});
