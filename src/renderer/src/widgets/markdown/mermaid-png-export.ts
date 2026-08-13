const DEFAULT_WIDTH: number = 1200;
const DEFAULT_HEIGHT: number = 800;
const MAX_SOURCE_DIMENSION: number = 16_384;
const MAX_OUTPUT_DIMENSION: number = 8_192;
const MAX_OUTPUT_PIXELS: number = 32_000_000;
const MIN_PIXEL_RATIO: number = 2;
const MAX_PIXEL_RATIO: number = 3;
const EXPORT_PADDING: number = 24;

export type MermaidPngExportOptions = {
	svg: string;
	background: string;
	viewportWidth?: number;
	viewportHeight?: number;
	pixelRatio?: number;
};

type SvgSize = {
	width: number;
	height: number;
};

function parsePositiveNumber(value: string | null): number | null {
	if (value === null || value.trim().length === 0 || value.trim().endsWith("%")) {
		return null;
	}
	const parsed: number = Number.parseFloat(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseViewBox(value: string | null): SvgSize | null {
	if (value === null) {
		return null;
	}
	const parts: number[] = value
		.trim()
		.split(/[\s,]+/)
		.map((part: string): number => Number.parseFloat(part));
	if (parts.length !== 4 || parts.some((part: number): boolean => !Number.isFinite(part))) {
		return null;
	}
	const width: number = Math.abs(parts[2] ?? 0);
	const height: number = Math.abs(parts[3] ?? 0);
	return width > 0 && height > 0 ? { width, height } : null;
}

function normalizeDimension(value: number | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.min(value, MAX_SOURCE_DIMENSION)
		: null;
}

function resolveSvgSize(svgElement: SVGSVGElement): SvgSize {
	const width: number | null = parsePositiveNumber(svgElement.getAttribute("width"));
	const height: number | null = parsePositiveNumber(svgElement.getAttribute("height"));
	if (width !== null && height !== null) {
		return {
			width: Math.min(width, MAX_SOURCE_DIMENSION),
			height: Math.min(height, MAX_SOURCE_DIMENSION)
		};
	}

	return parseViewBox(svgElement.getAttribute("viewBox")) ?? {
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT
	};
}

function resolveViewportSize(options: MermaidPngExportOptions, diagramSize: SvgSize): SvgSize {
	const width: number | null = normalizeDimension(options.viewportWidth);
	const height: number | null = normalizeDimension(options.viewportHeight);
	return width !== null && height !== null ? { width, height } : diagramSize;
}

function resolveOutputSize(viewportSize: SvgSize, requestedPixelRatio: number | undefined): SvgSize {
	const normalizedPixelRatio: number = typeof requestedPixelRatio === "number" && Number.isFinite(requestedPixelRatio)
		? Math.min(MAX_PIXEL_RATIO, Math.max(MIN_PIXEL_RATIO, requestedPixelRatio))
		: MIN_PIXEL_RATIO;
	const dimensionScale: number = Math.min(
		normalizedPixelRatio,
		MAX_OUTPUT_DIMENSION / viewportSize.width,
		MAX_OUTPUT_DIMENSION / viewportSize.height
	);
	const areaScale: number = Math.sqrt(MAX_OUTPUT_PIXELS / (viewportSize.width * viewportSize.height));
	const scale: number = Math.max(0.1, Math.min(dimensionScale, areaScale));
	return {
		width: Math.max(1, Math.round(viewportSize.width * scale)),
		height: Math.max(1, Math.round(viewportSize.height * scale))
	};
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
	return new Promise<HTMLImageElement>((resolve, reject): void => {
		const image = new Image();
		const objectUrl: string = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
		const cleanup = (): void => URL.revokeObjectURL(objectUrl);
		image.onload = (): void => {
			cleanup();
			resolve(image);
		};
		image.onerror = (): void => {
			cleanup();
			reject(new Error("mermaid_png_svg_decode_failed"));
		};
		image.src = objectUrl;
	});
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise<Blob>((resolve, reject): void => {
		canvas.toBlob((blob: Blob | null): void => {
			if (blob === null) {
				reject(new Error("mermaid_png_encode_failed"));
				return;
			}
			resolve(blob);
		}, "image/png");
	});
}

export async function renderMermaidPng(options: MermaidPngExportOptions): Promise<Uint8Array> {
	const documentNode: Document = new DOMParser().parseFromString(options.svg, "image/svg+xml");
	if (documentNode.querySelector("parsererror") !== null || documentNode.documentElement.nodeName.toLowerCase() !== "svg") {
		throw new Error("mermaid_png_svg_invalid");
	}

	const svgElement: SVGSVGElement = documentNode.documentElement as unknown as SVGSVGElement;
	const diagramSize: SvgSize = resolveSvgSize(svgElement);
	const viewportSize: SvgSize = resolveViewportSize(options, diagramSize);
	const outputSize: SvgSize = resolveOutputSize(viewportSize, options.pixelRatio);
	svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	svgElement.setAttribute("width", String(diagramSize.width));
	svgElement.setAttribute("height", String(diagramSize.height));

	if ("fonts" in document) {
		await document.fonts.ready;
	}
	const image: HTMLImageElement = await loadSvgImage(new XMLSerializer().serializeToString(svgElement));
	const canvas: HTMLCanvasElement = document.createElement("canvas");
	canvas.width = outputSize.width;
	canvas.height = outputSize.height;
	const context: CanvasRenderingContext2D | null = canvas.getContext("2d");
	if (context === null) {
		throw new Error("mermaid_png_canvas_unavailable");
	}
	context.fillStyle = options.background;
	context.fillRect(0, 0, outputSize.width, outputSize.height);

	const outputScale: number = outputSize.width / viewportSize.width;
	const padding: number = Math.min(EXPORT_PADDING * outputScale, outputSize.width / 4, outputSize.height / 4);
	const availableWidth: number = Math.max(1, outputSize.width - padding * 2);
	const availableHeight: number = Math.max(1, outputSize.height - padding * 2);
	const diagramScale: number = Math.min(
		availableWidth / diagramSize.width,
		availableHeight / diagramSize.height
	);
	const drawWidth: number = diagramSize.width * diagramScale;
	const drawHeight: number = diagramSize.height * diagramScale;
	context.drawImage(
		image,
		(outputSize.width - drawWidth) / 2,
		(outputSize.height - drawHeight) / 2,
		drawWidth,
		drawHeight
	);

	const pngBlob: Blob = await canvasToPngBlob(canvas);
	return new Uint8Array(await pngBlob.arrayBuffer());
}
