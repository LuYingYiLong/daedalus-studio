import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { finishMascotPreview, getMascotPreview, subscribeMascotPreview, type MascotStatus } from "@/domain/session/mascot-preview";
import { useIdleGaze } from "./useIdleGaze";
import styles from "./Mascot.module.css";

type MascotProps = {
	status?: MascotStatus;
	sessionId?: string | null;
	compact?: boolean;
};

export default function Mascot({ status = "idle", sessionId = null, compact = false }: MascotProps): React.JSX.Element {
	const preview = useSyncExternalStore(subscribeMascotPreview, () => getMascotPreview(sessionId), () => null);
	const effectiveStatus = preview ?? status;
	return (
		<div className={compact ? styles.compact : styles.frame} aria-hidden="true">
			<MascotVisual key={`${sessionId}:${effectiveStatus}`} status={effectiveStatus} sessionId={sessionId} />
		</div>
	);
}

// 切换状态时重新挂载动画层，清除旧视线监听并统一重置各部位动画时钟
function MascotVisual({ status, sessionId }: { status: MascotStatus; sessionId: string | null }): React.JSX.Element {
	const starRef = useRef<HTMLDivElement>(null);
	const gazeRef = useRef<HTMLDivElement>(null);
	const planetRef = useRef<HTMLDivElement>(null);
	const [finished, setFinished] = useState(false);
	const visibleStatus = status === "completed" && finished ? "idle" : status;
	useIdleGaze(starRef, gazeRef, visibleStatus === "idle");

	useEffect(() => {
		if (status !== "completed") return;
		let cancelled = false;
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const finish = (): void => {
			if (cancelled) return;
			setFinished(true);
			finishMascotPreview(sessionId);
		};
		const handleMotionChange = (): void => {
			if (reducedMotion.matches) finish();
		};
		// 等待行星收拢及整圈轨道实际结束，避免计时器与 CSS 节奏脱节
		const animations = planetRef.current?.getAnimations() ?? [];
		if (reducedMotion.matches || animations.length === 0) finish();
		else void Promise.all(animations.map((animation) => animation.finished)).then(finish, () => {});
		reducedMotion.addEventListener("change", handleMotionChange);
		return (): void => {
			cancelled = true;
			reducedMotion.removeEventListener("change", handleMotionChange);
		};
	}, [status, sessionId]);

	return (
			<div className={styles.mascot} data-state={visibleStatus}>
				<div className={styles.shadow} />
				<svg className={`${styles.ring} ${styles.ringBack}`} viewBox="0 0 176 132">
					<path d="M 19 70 A 69 24 0 0 1 157 70" />
				</svg>
				<div ref={starRef} className={styles.star}>
					<div className={styles.bodyRotation}>
						<div ref={gazeRef} className={styles.gaze}>
							<span className={styles.eye} />
							<span className={styles.eye} />
						</div>
					</div>
				</div>
				<div ref={planetRef} className={styles.planet} />
				<div className={styles.failureMark} aria-hidden="true">!</div>
				<svg className={`${styles.ring} ${styles.ringFront}`} viewBox="0 0 176 132">
					<path d="M 19 70 A 69 24 0 0 0 157 70" />
					<path className={styles.ringHighlight} d="M 19 70 A 69 24 0 0 0 157 70" />
				</svg>
			</div>
	);
}
