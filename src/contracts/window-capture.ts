export type WindowCaptureSource = {
	sourceId: string;
	title: string;
	thumbnailDataUrl: string;
	appIconDataUrl?: string;
};

export type WindowScreenshot = {
	sourceId: string;
	dataUrl: string;
	mimeType: "image/png";
	width: number;
	height: number;
	byteSize: number;
	capturedAt: string;
};

export type WindowCaptureAPI = {
	list: (params: {
		pickerId: string;
	}) => Promise<{ sources: WindowCaptureSource[] }>;
	capture: (params: {
		pickerId: string;
		sourceId: string;
	}) => Promise<WindowScreenshot>;
	release: (params: { pickerId: string }) => Promise<void>;
};
