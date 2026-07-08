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
			<Select
				size="small"
				placeholder="Search..."
				notFoundContent="No session"
				className={styles.searchSelect}
				suffixIcon={<Icon name="collapse" style={{ opacity: 0.5 }} />}
			/>
		</div>
	);
}

export default Titlebar;
