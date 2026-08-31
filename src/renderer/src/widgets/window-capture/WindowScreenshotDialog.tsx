import { Alert, Button, Empty, Input, Modal, Spin } from "antd";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
	filterWindowSources,
	type WindowScreenshotController,
} from "@/features/window-capture/window-screenshot-controller";
import styles from "./WindowScreenshotDialog.module.css";

export default function WindowScreenshotDialog({
	controller,
}: {
	controller: WindowScreenshotController;
}): React.JSX.Element {
	const { t } = useTranslation();
	const state = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
	);
	const sources = filterWindowSources(state.sources, state.search);
	const busy = state.loading || state.capturing || state.saving;
	return (
		<Modal
			open={state.open}
			title={t("windowCapture.title")}
			width={900}
			centered
			onCancel={controller.close}
			modalRender={(content) => (
				<div
					onKeyDownCapture={(event) => {
						// 焦点位于选择器时优先取消，避免仍在退场的菜单消费第一次 Esc。
						if (event.key === "Escape" && !event.nativeEvent.isComposing) {
							event.preventDefault();
							event.stopPropagation();
							controller.close();
						}
					}}
				>
					{content}
				</div>
			)}
			footer={null}
			destroyOnHidden
			afterClose={() =>
				document
					.querySelector<HTMLTextAreaElement>('[data-testid="composer-input"]')
					?.focus({ preventScroll: true })
			}
			className={styles.modal}
		>
			<div className={styles.content}>
				{state.error && (
					<Alert
						type="error"
						showIcon
						title={t(`windowCapture.errors.${state.error}`, {
							defaultValue: t("windowCapture.errors.window_capture_failed"),
						})}
					/>
				)}
				<div className={styles.toolbar}>
					<Input
						aria-label={t("windowCapture.search")}
						placeholder={t("windowCapture.search")}
						value={state.search}
						onChange={(event) => controller.setSearch(event.target.value)}
						allowClear
					/>
					<Button disabled={busy} onClick={() => void controller.refresh()}>
						{t("windowCapture.refresh")}
					</Button>
				</div>
				<Spin spinning={busy}>
					<div
						className={styles.sources}
						role="group"
						aria-label={t("windowCapture.windows")}
						aria-busy={busy}
					>
						{sources.map((source) => (
							<button
								key={source.sourceId}
								type="button"
								aria-busy={busy && source.sourceId === state.selectedSourceId}
								className={styles.source}
								aria-disabled={busy}
								onClick={() => void controller.select(source.sourceId)}
							>
								{source.thumbnailDataUrl ? (
									<img
										className={styles.thumbnail}
										src={source.thumbnailDataUrl}
										alt=""
									/>
								) : (
									<span className={styles.thumbnail}>
										{t("windowCapture.noPreview")}
									</span>
								)}
								<span className={styles.sourceTitle}>
									{source.appIconDataUrl && (
										<img src={source.appIconDataUrl} alt="" />
									)}
									<span>{source.title}</span>
								</span>
							</button>
						))}
						{!state.loading && sources.length === 0 && (
							<Empty
								description={t(
									state.sources.length
										? "windowCapture.noMatches"
										: "windowCapture.empty",
								)}
							/>
						)}
					</div>
				</Spin>
			</div>
		</Modal>
	);
}
