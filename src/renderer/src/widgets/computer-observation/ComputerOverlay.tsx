import { useComputerOverlay } from "@/features/computer-observation/useComputerOverlay";
import cursor from "@/assets/icons/ai-cursor.svg";
import { computerPauseHint } from "@/domain/computer-observation/control-feedback";
import styles from "./ComputerOverlay.module.css";

export default function ComputerOverlay(): React.JSX.Element {
	const state = useComputerOverlay();
	const bar = new URLSearchParams(location.search).get("surface") === "bar";
	const label = state.resuming
		? "正在恢复…"
		: {
				starting: "正在准备电脑操作…",
				running: "AI正在使用你的电脑",
				paused:
					state.code === "computer_activation_required"
						? "等待窗口激活"
						: "已暂停",
				cancelled: "正在取消…",
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
					{state.preview && <small>调试预览 · 不会操作电脑</small>}
					{state.state === "paused" && (
						<small>
							{state.resuming
								? "正在验证目标窗口并获取新画面，请稍候。"
								: computerPauseHint(state.code)}
						</small>
					)}
				</div>
				{state.state === "paused" && (
					<button
						disabled={state.resuming}
						aria-busy={state.resuming}
						onClick={() => window.computerOverlay.resume()}
					>
						{state.resuming ? "恢复中…" : "继续"}
					</button>
				)}
				<button
					onClick={() => window.computerOverlay.cancel()}
					disabled={state.state === "cancelled"}
				>
					取消
				</button>
			</div>
		);
	return (
		<div
			className={styles.edge}
			data-paused={state.state !== "running"}
			aria-hidden="true"
		>
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
