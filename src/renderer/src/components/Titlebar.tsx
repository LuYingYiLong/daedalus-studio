import { Icon } from "@/assets/icons";
import type { MenuProps } from "antd";
import { Dropdown, Select, Space } from "antd";
import styles from "./Titlebar.module.css";

const topBarItems: MenuProps["items"] = [
	{
		label: "New session",
		key: "0"
	}
];

function Titlebar(): React.JSX.Element {
	return (
		<div className={styles.root}>
			<Icon className={styles.brandIcon} name="daedalus_icon" />
			<p className={styles.brandName}>Daedalus Studio</p>
			<Dropdown
				menu={{ items: topBarItems }}
				trigger={["click"]}
			>
				<Space className={styles.menuTrigger}>
					Files
				</Space>
			</Dropdown>
		</div>
	);
}

export default Titlebar;
