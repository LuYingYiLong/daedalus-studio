export type BackendHealthResult = {
	name: string;
	version: string;
	pid: number;
	mode: string;
	port: number;
	multiClient: {
		enabled: boolean;
		protocolVersion: number;
	};
	logPath: string | null;
};
