// 工作区
export type WorkspaceConfig = {
    id: string;
    name: string;
    kind: "godot";
    rootPath: string;
    godotExecutablePath?: string;
};

export type WorkspaceListResult = {
    workspaces: WorkspaceConfig[];
    active: string | null;
    connected: string[];
};

// 会话
export type SessionMetadata = {
    id: string;
    title: string;
    workspaceId?: string;
    activeSkillId?: string;
    provider?: string;
    model?: string;
    createdAt: string;
    updatedAt: string;
}

// 客户端信息
export type ClientHelloResult = {
    connection: {
        connectionId: string;
        clientType: string;
        clientName: string;
        connectedAt: string;
        capabilities: Record<string, boolean>;
    };
    multiClient: {
        enabled: boolean;
        protocolVersion: number;
    };
};