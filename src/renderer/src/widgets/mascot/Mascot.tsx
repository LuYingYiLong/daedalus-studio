import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { finishMascotPreview, getMascotPreview, subscribeMascotPreview, type MascotStatus } from "@/domain/session/mascot-preview";
import { getBackendConnectionState, onBackendConnectionStateChanged } from "@/platform/rpc/transport/backend-client";
import { useIdleGaze } from "./useIdleGaze";
import { useMascotPetting } from "./useMascotPetting";
import { useMascotSleep } from "./useMascotSleep";
import styles from "./Mascot.module.css";

type MascotProps = {
	status?: MascotStatus;
	sessionId?: string | null;
};

const IDLE_ORBIT_DURATION_MS: number = 10_000;
const COMPLETED_ORBIT_DURATION_MS: number = 2_400;

function subscribeBackendConnection(listener: () => void): () => void {
	return onBackendConnectionStateChanged(() => listener());
}

export default function Mascot({ status = "idle", sessionId = null }: MascotProps): React.JSX.Element {
	const preview = useSyncExternalStore(subscribeMascotPreview, () => getMascotPreview(sessionId), () => null);
	const connectionState = useSyncExternalStore(
		subscribeBackendConnection,
		getBackendConnectionState,
		getBackendConnectionState,
	);
	const effectiveStatus: MascotStatus = preview
		?? (connectionState === "disconnected" ? "disconnected" : status);
	return (
		<div className={styles.frame} aria-hidden="true">
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
	const enjoying: boolean = useMascotPetting(starRef, gazeRef, completedStatus === "idle");
	const visibleStatus: MascotStatus = enjoying
		? "enjoying"
		: completedStatus === "idle" && sleeping
			? "sleeping"
			: completedStatus;
	useIdleGaze(starRef, gazeRef, visibleStatus === "idle");

	useEffect(() => {
		setFinished(false);
	}, [status, sessionId]);

	useEffect(() => {
		if (status !== "completed") return;
		let cancelled = false;
		let cycleTimer: number | null = null;
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const animations = planetRef.current?.getAnimations() ?? [];
		const orbitAnimation: Animation | null = animations.find((animation): boolean => {
			const animationName: unknown = (animation as Animation & { animationName?: unknown }).animationName;
			return animationName === "orbit";
		}) ?? null;
		const previousPlaybackRate: number = orbitAnimation?.playbackRate ?? 1;
		const restoreOrbitRate = (): void => {
			if (orbitAnimation === null) return;
			orbitAnimation.playbackRate = previousPlaybackRate;
		};
		if (orbitAnimation !== null) {
			orbitAnimation.playbackRate = IDLE_ORBIT_DURATION_MS / COMPLETED_ORBIT_DURATION_MS;
		}
		const finish = (): void => {
			if (cancelled) return;
			if (cycleTimer !== null) {
				window.clearTimeout(cycleTimer);
				cycleTimer = null;
			}
			restoreOrbitRate();
			setFinished(true);
			finishMascotPreview(sessionId);
		};
		const handleMotionChange = (): void => {
			if (reducedMotion.matches) finish();
		};
		// 完成状态与 idle 共用同一个轨道动画，只临时加速一整圈，切换时不会重置位置
		const finiteAnimations = animations.filter((animation): boolean => {
			const endTime: CSSNumberish | null = animation.effect?.getComputedTiming().endTime ?? null;
			return typeof endTime === "number" && Number.isFinite(endTime);
		}) ?? [];
		const animationFinished: Promise<unknown> = finiteAnimations.length === 0
			? Promise.resolve()
			: Promise.all(finiteAnimations.map((animation) => animation.finished));
		const orbitFinished: Promise<void> = orbitAnimation === null
			? Promise.resolve()
			: new Promise<void>((resolve): void => {
				cycleTimer = window.setTimeout(resolve, COMPLETED_ORBIT_DURATION_MS);
			});
		if (reducedMotion.matches) finish();
		else void Promise.all([animationFinished, orbitFinished]).then(finish, () => {});
		reducedMotion.addEventListener("change", handleMotionChange);
		return (): void => {
			cancelled = true;
			if (cycleTimer !== null) window.clearTimeout(cycleTimer);
			restoreOrbitRate();
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
							<div className={styles.eyeGroup}>
								<span className={styles.eye} />
								<span className={styles.eye} />
							</div>
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
