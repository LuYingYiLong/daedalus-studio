import { useRef } from "react";
import { useIdleGaze } from "./useIdleGaze";
import styles from "./Mascot.module.css";

/** 空闲态装饰角色，身体、视线和伴星分别控制，方便后续接入工作状态 */
export default function Mascot(): React.JSX.Element {
	const starRef = useRef<HTMLDivElement>(null);
	const gazeRef = useRef<HTMLDivElement>(null);
	useIdleGaze(starRef, gazeRef);

	return (
		<div className={styles.mascot} aria-hidden="true" data-state="idle">
			<div className={styles.shadow} />
			<div ref={starRef} className={styles.star}>
				<div ref={gazeRef} className={styles.gaze}>
					<span className={styles.eye} />
					<span className={styles.eye} />
				</div>
			</div>
			<div className={styles.planet} />
		</div>
	);
}
