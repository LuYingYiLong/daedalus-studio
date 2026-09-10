import { useRef, useSyncExternalStore } from "react";
import { getMascotPreview, subscribeMascotPreview, type MascotStatus } from "@/domain/session/mascot-preview";
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
			<MascotVisual key={effectiveStatus} status={effectiveStatus} />
		</div>
	);
}

// 切换状态时重新挂载动画层，清除旧视线监听并统一重置各部位动画时钟
function MascotVisual({ status }: { status: MascotStatus }): React.JSX.Element {
	const starRef = useRef<HTMLDivElement>(null);
	const gazeRef = useRef<HTMLDivElement>(null);
	useIdleGaze(starRef, gazeRef, status === "idle");

	return (
			<div className={styles.mascot} data-state={status}>
				<div className={styles.shadow} />
				<svg className={`${styles.ring} ${styles.ringBack}`} viewBox="0 0 176 132">
					<path d="M 19 70 A 69 24 0 0 1 157 70" />
				</svg>
				<div ref={starRef} className={styles.star}>
					<div ref={gazeRef} className={styles.gaze}>
						<span className={styles.eye} />
						<span className={styles.eye} />
					</div>
				</div>
				<div className={styles.planet} />
				<svg className={`${styles.ring} ${styles.ringFront}`} viewBox="0 0 176 132">
					<path d="M 19 70 A 69 24 0 0 0 157 70" />
					<path className={styles.ringHighlight} d="M 19 70 A 69 24 0 0 0 157 70" />
				</svg>
			</div>
	);
}
