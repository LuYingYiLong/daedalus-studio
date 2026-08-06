import { Skeleton } from "antd";
import styles from "./SettingsPageSkeleton.module.css";

type SettingsPageSkeletonProps = {
	rows?: number;
};

function SettingsPageSkeleton({ rows = 4 }: SettingsPageSkeletonProps): React.JSX.Element {
	return (
		<div className={styles.root} aria-hidden={true}>
			<Skeleton
				active={true}
				title={{ width: "38%" }}
				paragraph={{ rows }}
			/>
		</div>
	);
}

export default SettingsPageSkeleton;
