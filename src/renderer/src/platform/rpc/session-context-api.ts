import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type { SessionMetadata } from "./types";

export type SessionContextMetadata = Pick<
  SessionMetadata,
  | "id"
  | "title"
  | "createdAt"
  | "updatedAt"
  | "workspaceId"
  | "workspaceName"
  | "archivedAt"
>;

export type SessionContextSearchHit = {
  metadata: SessionContextMetadata;
  snippet: string;
};

export type SessionContextSearchResult = {
  sessions: SessionContextSearchHit[];
  nextOffset: number | null;
};

export type SessionContextPage = {
  metadata: SessionContextMetadata;
  summary: string | null;
  messages: Array<{
    sequence: number;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
  messageCount: number;
  nextCursor: number | null;
  truncated: boolean;
  updatedAt: string;
};

export async function searchSessionContexts(params: {
  query?: string;
  workspaceId?: string;
  preferredWorkspaceId?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}): Promise<SessionContextSearchResult> {
  return (await createBackendClient()).request<SessionContextSearchResult>(
    "session.context.search",
    params,
  );
}

export async function readSessionContext(
  sessionId: string,
  cursor?: number,
): Promise<SessionContextPage> {
  return (await createBackendClient()).request<SessionContextPage>(
    "session.context.read",
    { sessionId, ...(cursor === undefined ? {} : { cursor }) },
  );
}
