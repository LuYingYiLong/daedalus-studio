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
			<Dropdown
				menu={{ items: topBarItems }}
				trigger={["click"]}
			>
				<Space className={styles.menuTrigger}>
					Files
				</Space>
			</Dropdown>
			<p className={styles.brandName}>Daedalus Studio</p>
		</div>
	);
}

export default Titlebar;
