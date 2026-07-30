export type StudioFontLoadStatus = "loaded" | "failed" | "timeout" | "unsupported";

export type StudioFontFaceSet = {
	load: (font: string, text?: string) => Promise<unknown>;
};

type CriticalStudioFont = {
	descriptor: string;
	sample: string;
};

export const STUDIO_FONT_LOAD_TIMEOUT_MS: number = 2_500;

export const CRITICAL_STUDIO_FONTS: readonly CriticalStudioFont[] = [
	{ descriptor: '400 14px "Mona Sans"', sample: "Daedalus Studio" },
	{ descriptor: '400 14px "Wen Yuan Sans SC"', sample: "代达罗斯工作室设置供应商模型会话" },
	{ descriptor: '500 14px "Wen Yuan Sans SC"', sample: "代达罗斯工作室设置供应商模型会话" },
	{ descriptor: '700 14px "Wen Yuan Sans SC"', sample: "代达罗斯工作室设置供应商模型会话" }
];

export async function waitForStudioFonts(
	fonts: StudioFontFaceSet | null | undefined,
	timeoutMs: number = STUDIO_FONT_LOAD_TIMEOUT_MS
): Promise<StudioFontLoadStatus> {
	if (fonts === null || fonts === undefined) {
		return "unsupported";
	}

	return await new Promise<StudioFontLoadStatus>((resolve): void => {
		let settled: boolean = false;
		const finish = (status: StudioFontLoadStatus): void => {
			if (settled) {
				return;
			}
			settled = true;
			globalThis.clearTimeout(timeout);
			resolve(status);
		};
		const timeout: ReturnType<typeof globalThis.setTimeout> = globalThis.setTimeout((): void => {
			finish("timeout");
		}, Math.max(0, timeoutMs));

		void Promise.all(
			CRITICAL_STUDIO_FONTS.map(async (font: CriticalStudioFont): Promise<void> => {
				await fonts.load(font.descriptor, font.sample);
			})
		).then(
			(): void => finish("loaded"),
			(): void => finish("failed")
		);
	});
}
