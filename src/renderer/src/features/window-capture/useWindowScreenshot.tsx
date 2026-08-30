import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
import type { ImageImport } from "../workspace/controllers/image-import";
import { WindowScreenshotController } from "./window-screenshot-controller";
import WindowScreenshotDialog from "./WindowScreenshotDialog";

export default function useWindowScreenshot(params: {
	getScope: () => number;
	createImport: () => ImageImport;
}) {
	const { t } = useTranslation();
	const latest = useRef(params);
	latest.current = params;
	const controller = useRef<WindowScreenshotController | null>(null);
	const api = getPlatformRuntime().system?.windowCapture;
	if (!controller.current && api)
		controller.current = new WindowScreenshotController({
			api,
			getScope: () => latest.current.getScope(),
			createImport: () => latest.current.createImport(),
			filename: () =>
				`${t("windowCapture.filename")}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
		});
	useEffect(() => {
		controller.current?.validateScope();
	});
	useEffect(() => () => controller.current?.close(), []);
	return {
		onAddWindowScreenshot: controller.current?.open,
		windowScreenshotDialog: controller.current ? (
			<WindowScreenshotDialog controller={controller.current} />
		) : null,
	};
}
