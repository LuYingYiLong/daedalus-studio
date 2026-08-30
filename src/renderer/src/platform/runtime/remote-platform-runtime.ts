import type { PlatformRuntime } from "./platform-runtime";

export const remotePlatformRuntime: PlatformRuntime = {
	kind: "remote",
	getBackendTransport: async () => ({
		url: `wss://${globalThis.location.host}/api/v1/rpc`,
		authProtocol: null,
	}),
	getClientHello: async () => ({
		clientType: "studio_remote",
		clientName: "Daedalus Remote",
		capabilities: {
			remoteControl: true,
			sessionSubscribe: true,
			approval: true,
			inlineDiffView: false,
			browserTools: false,
			computerObservation: false,
			scheduledTasks: false,
		},
	}),
};
