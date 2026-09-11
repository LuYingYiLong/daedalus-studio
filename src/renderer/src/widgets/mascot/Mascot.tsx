import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { finishMascotPreview, getMascotPreview, subscribeMascotPreview, type MascotStatus } from "@/domain/session/mascot-preview";
import { getBackendConnectionState, onBackendConnectionStateChanged } from "@/platform/rpc/transport/backend-client";
import { useIdleGaze } from "./useIdleGaze";
import { useMascotSleep } from "./useMascotSleep";
import styles from "./Mascot.module.css";

type MascotProps = {
	status?: MascotStatus;
	sessionId?: string | null;
	compact?: boolean;
};

function subscribeBackendConnection(listener: () => void): () => void {
	return onBackendConnectionStateChanged(() => listener());
}

export default function Mascot({ status = "idle", sessionId = null, compact = false }: MascotProps): React.JSX.Element {
	const preview = useSyncExternalStore(subscribeMascotPreview, () => getMascotPreview(sessionId), () => null);
	const connectionState = useSyncExternalStore(
		subscribeBackendConnection,
		getBackendConnectionState,
		getBackendConnectionState,
	);
	const effectiveStatus: MascotStatus = preview
		?? (connectionState === "disconnected" ? "disconnected" : status);
	return (
		<div className={compact ? styles.compact : styles.frame} aria-hidden="true">
			<MascotVisual key={sessionId ?? "home"} status={effectiveStatus} sessionId={sessionId} />
		</div>
	);
}

// 会话切换时重新挂载动画层，状态切换保留部件节点以便 CSS 过渡连续
function MascotVisual({ status, sessionId }: { status: MascotStatus; sessionId: string | null }): React.JSX.Element {
	const starRef = useRef<HTMLDivElement>(null);
	const gazeRef = useRef<HTMLDivElement>(null);
	const planetRef = useRef<HTMLDivElement>(null);
	const [finished, setFinished] = useState(false);
	const completedStatus: MascotStatus = status === "completed" && finished ? "idle" : status;
	const sleeping: boolean = useMascotSleep(completedStatus === "idle");
	const visibleStatus: MascotStatus = completedStatus === "idle" && sleeping ? "sleeping" : completedStatus;
	useIdleGaze(starRef, gazeRef, visibleStatus === "idle");

	useEffect(() => {
		setFinished(false);
	}, [status, sessionId]);

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
