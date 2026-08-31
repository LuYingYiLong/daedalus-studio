export type FileBuffer = {
	content: string;
	savedContent?: string;
	isDirty: boolean;
	sha256: string;
	modifiedAtMs: number;
	byteSize: number;
	readable: boolean;
	binary: boolean;
	oversized: boolean;
	loading: boolean;
	saving: boolean;
	conflict: boolean;
	error: string | null;
	mediaUrl?: string;
	mediaMimeType?: string;
	mediaKind?: "image" | "audio" | "video";
};
