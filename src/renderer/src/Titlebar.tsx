import { Icon } from "@/assets/icons";
import type { MenuProps } from "antd";
import { Dropdown, Space } from "antd";
import { Select } from "antd";
import styles from "./css/Titlebar.module.css";

const topBarItems: MenuProps["items"] = [
    {
        label: "New session",
        key: "0",
    }
];

function Titlebar(): React.JSX.Element {
    return (
        <div className={styles.titlebar}>
				<Icon className={styles.titlebarIcon} name="icon" />
				<p>Daedalus Studio</p>
				<Dropdown
					menu={{ items: topBarItems }}
					trigger={["click"]}
				>
					<Space className={styles.titlebarAction}>
						Files
					</Space>
				</Dropdown>
				<Select
					size="small"
					placeholder="Search..."
					notFoundContent="No session"
					className={styles.searchBox}
					suffixIcon={<Icon name="collapse" style={{ opacity: 0.5 }}/>}
				/>
		</div>
    );
}

export default Titlebar;
