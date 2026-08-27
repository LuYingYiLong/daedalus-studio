export type RemoteAccessServiceStatus =
	| "disabled"
	| "starting"
	| "running"
	| "error";

export type RemoteAccessDevice = {
	id: string;
	name: string;
	createdAt: string;
	lastSeenAt: string | null;
};

export type RemoteAccessState = {
	schemaVersion: 1;
	enabled: boolean;
	status: RemoteAccessServiceStatus;
	httpsPort: number;
	bootstrapPort: number;
	addresses: string[];
	certificateFingerprint: string | null;
	certificateExpiresAt: string | null;
	devices: RemoteAccessDevice[];
	error: string | null;
};

export type RemoteAccessPairingSession = {
	expiresAt: string;
	installUrls: string[];
	pairingUrls: string[];
	certificateFingerprint: string;
};

export type RemoteAccessPortPatch = {
	httpsPort: number;
	bootstrapPort: number;
};
