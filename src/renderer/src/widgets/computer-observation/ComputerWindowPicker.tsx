import { Alert, Button, Empty, Input, Modal, Spin, Typography } from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ComputerDiagnosticsWindowList, ComputerSource } from "../../../../contracts/computer-observation";
import styles from "@/widgets/window-capture/WindowScreenshotDialog.module.css";
import pickerStyles from "./ComputerWindowPicker.module.css";
export default function ComputerWindowPicker({
	open,
	reason,
	control = false,
	autoApproved = false,
	children,
	load,
	choose,
	close,
}: {
	open: boolean;
	reason?: string;
	control?: boolean;
	autoApproved?: boolean;
	children?: React.ReactNode;
	load(): Promise<ComputerSource[] | ComputerDiagnosticsWindowList>;
	choose(sourceId: string): Promise<void>;
	close(): void;
}): React.JSX.Element {
	const { t } = useTranslation();
	const generation = useRef(0);
	const [returnFocus, setReturnFocus] = useState(!control);
	useEffect(() => {
		// pending 清除时 control 也会变回 false；保留这一弹窗的关闭策略到动画结束
		if (open) setReturnFocus(!control);
	}, [open, control]);
	const [sources, setSources] = useState<ComputerSource[]>([]),
		[diagnostics, setDiagnostics] = useState<ComputerDiagnosticsWindowList["diagnostics"] | null>(null),
		[selected, setSelected] = useState<string | null>(null),
		[search, setSearch] = useState(""),
		[loading, setLoading] = useState(false),
		[saving, setSaving] = useState(false),
		[error, setError] = useState<string | null>(null);
	const refresh = async (): Promise<void> => {
		const current = ++generation.current;
		setLoading(true);
		setError(null);
		setSelected(null);
		setDiagnostics(null);
		try {
			const result = await load();
			if (generation.current === current) {
				if (Array.isArray(result)) {
					setSources(result);
					setDiagnostics(null);
				} else {
					setSources(result.sources);
					setDiagnostics(result.diagnostics);
				}
			}
		} catch {
			if (generation.current === current) setError(t("computer.failed"));
		} finally {
			if (generation.current === current) setLoading(false);
		}
	};
	useEffect(() => {
		if (open) {
			setSearch("");
			setSources([]);
			void refresh();
		}
		return () => {
			generation.current++;
		};
	}, [open, load]);
	return (
		<Modal
			open={open}
			focusable={{ focusTriggerAfterClose: returnFocus }}
			title={t(
				reason === undefined
					? "computer.diagnose"
					: control
						? "computer.controlConsentTitle"
						: "computer.consentTitle",
			)}
			width={900}
			centered
			classNames={{ body: pickerStyles.body }}
			className={styles.modal}
			onCancel={close}
			destroyOnHidden
			footer={
				<>
					<Button onClick={close}>{t("computer.cancel")}</Button>
					<Button
						type="primary"
						disabled={!selected || loading || saving}
						loading={saving}
						onClick={() => {
							if (!selected || saving) return;
							setSaving(true);
							setError(null);
							void choose(selected)
								.catch((reason: unknown) => {
									const code =
										reason instanceof Error
											? reason.message.match(/computer_[a-z_]+/)?.[0]
											: undefined;
									setError(
										t(
											code === "computer_window_capture_unavailable"
												? "computer.captureUnavailable"
												: "computer.failed",
										),
									);
								})
								.finally(() => setSaving(false));
						}}
					>
						{t(
							reason === undefined
								? "computer.observe"
								: control
									? autoApproved
										? "computer.selectTarget"
										: "computer.allowControl"
									: "computer.allow",
						)}
					</Button>
				</>
			}
		>
			<div className={styles.content}>
				{reason !== undefined && (
					<>
						<Typography.Paragraph>{reason}</Typography.Paragraph>
						<Alert type="warning" title={t(control ? "computer.controlPrivacy" : "computer.privacy")} />
					</>
				)}
				{error && <Alert type="error" title={error} />}
				<div className={styles.toolbar}>
					<Input
						aria-label={t("windowCapture.search")}
						placeholder={t("windowCapture.search")}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						allowClear
					/>
					<Button disabled={loading || saving} onClick={() => void refresh()}>
						{t("windowCapture.refresh")}
					</Button>
				</div>
				<Spin spinning={loading}>
					<div
						role="listbox"
						aria-label={t("windowCapture.windows")}
						className={styles.sources}
						aria-busy={loading || saving}
					>
						{sources
							.filter((source) => source.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
							.map((source) => (
								<button
									key={source.sourceId}
									type="button"
									role="option"
									aria-selected={selected === source.sourceId}
									aria-busy={(loading || saving) && selected === source.sourceId}
									aria-disabled={loading || saving}
									className={styles.source}
									disabled={loading || saving}
									onClick={() => setSelected(source.sourceId)}
								>
									{source.thumbnailDataUrl && (
										<img alt="" src={source.thumbnailDataUrl} className={styles.thumbnail} />
									)}
									{!source.thumbnailDataUrl && (
										<span className={styles.thumbnail}>{t("windowCapture.noPreview")}</span>
									)}
									<span className={styles.sourceTitle}>{source.title}</span>
								</button>
							))}
					</div>
					{!loading && sources.length === 0 && (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={diagnostics ? t("computer.windowListDiagnostics", diagnostics) : undefined}
						/>
					)}
				</Spin>
				{children}
			</div>
		</Modal>
	);
}
