import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useComputerOverlay } from "@/features/computer-observation/useComputerOverlay";
import cursor from "@/assets/icons/ai-cursor.svg";
import { computerPauseHintKey } from "@/domain/computer-observation/control-feedback";
import i18n from "@/platform/i18n";
import styles from "./ComputerOverlay.module.css";

export default function ComputerOverlay(): React.JSX.Element {
	const state = useComputerOverlay();
	const { t } = useTranslation();
	useEffect(() => {
		const language = state.appearance?.resolvedLanguage;
		if (!language) return;
		document.documentElement.lang = language;
		void i18n.changeLanguage(language);
	}, [state.appearance?.resolvedLanguage]);
	const bar = new URLSearchParams(location.search).get("surface") === "bar";
	const label = state.resuming
		? t("computer.overlay.resuming")
		: {
				starting: t("computer.overlay.starting"),
				running: t("computer.overlay.running"),
				paused:
					state.code === "computer_activation_required"
						? t("computer.overlay.activationRequired")
						: t("computer.overlay.paused"),
				cancelled: t("computer.overlay.cancelled"),
			}[state.state];
	if (bar)
		return (
			<div
				className={styles.bar}
				role="status"
				data-testid="computer-control-bar"
			>
				<div className={styles.message}>
					<span>{label}</span>
					{state.preview && <small>{t("computer.overlay.preview")}</small>}
					{state.state === "paused" && (
						<small>
							{state.resuming
								? t("computer.overlay.resumeHint")
								: t(computerPauseHintKey(state.code))}
						</small>
					)}
				</div>
				{state.state === "paused" && (
					<button
						disabled={state.resuming}
						aria-busy={state.resuming}
						aria-label={t(state.resuming ? "computer.overlay.resumingShort" : "computer.overlay.resume")}
						onClick={() => window.computerOverlay.resume()}
					>
						{state.resuming ? t("computer.overlay.resumingShort") : t("computer.overlay.resume")}
					</button>
				)}
				<button
					aria-label={t("computer.overlay.cancel")}
					onClick={() => window.computerOverlay.cancel()}
					disabled={state.state === "cancelled"}
				>
					{t("computer.overlay.cancel")}
				</button>
			</div>
		);
	return (
		<div
			className={styles.edge}
			data-paused={state.state !== "running"}
			aria-hidden="true"
		>
			{state.state === "running" && state.highlight && <div className={styles.highlight} style={{ left: state.highlight.x, top: state.highlight.y, width: state.highlight.width, height: state.highlight.height }} />}
			{state.state === "running" && state.cursorVisible && (
				<div
					className={styles.cursor}
					data-testid="computer-ai-cursor"
					style={{
						transform: `translate(${state.cursor.x}px, ${state.cursor.y}px)`,
					}}
				>
					<img src={cursor} alt="" />
					{state.clickSequence > 0 && (
						<span
							key={state.clickSequence}
							className={styles.ripple}
						/>
					)}
				</div>
			)}
		</div>
	);
}
