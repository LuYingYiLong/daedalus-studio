import ColorBends from "./components/ColorBends";
import RotatingText from "./components/RotatingText";
import { Icon } from "@/assets/icons";
import styles from "./css/BootSplash.module.css";
import { theme } from "antd";


function BootSplash(): React.JSX.Element {
	const { token } = theme.useToken();

	return (
		<main className={styles.splash}>
			<ColorBends colors={["#925cff", "#478cbf", "#00ffd1"]} className={styles.bends} />
			<div className={styles.logoLayer}>
				<div className={styles.splashContent}>
					<Icon name="icon_large" className={styles.splashIcon} />
					<div className={styles.splashTitleBar} style={{ borderRadius: token.borderRadius }}>
						<span className={styles.splashLead}>Currently</span>
						<RotatingText
							texts={["Indexing Workspace", "Awakening in Godot", "Connecting", "Preparing the toolchain"]}
							mainClassName={styles.rotatingPill}
							rotationInterval={1800}
							
						/>
					</div>
				</div>
			</div>
		</main>
	);
}

export default BootSplash;
