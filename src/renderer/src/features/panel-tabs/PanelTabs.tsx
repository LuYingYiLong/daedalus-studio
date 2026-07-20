import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Button, Dropdown, Tabs } from "antd";
import type { MenuProps, TabsProps } from "antd";
import { Icon } from "@/assets/icons";
import styles from "./PanelTabs.module.css";

export type PanelTabsAddItem = {
	key: string;
	label: ReactNode;
	icon?: ReactNode;
	disabled?: boolean;
};

export type PanelTabsItem = {
	key: string;
	label: ReactNode;
	children: ReactNode;
	forceRender?: boolean;
};

export type PanelTabsProps = {
	activeKey: string | null;
	items: PanelTabsItem[];
	addItems: PanelTabsAddItem[];
	addLabel: string;
	className?: string;
	onActiveChange: (key: string) => void;
	onAdd: (key: string) => void;
	onClose: (key: string) => void;
};

type EditTargetKey = MouseEvent | KeyboardEvent | string;

function joinClassNames(...classNames: Array<string | undefined>): string | undefined {
	const joined: string = classNames.filter((className): className is string => className !== undefined && className.length > 0).join(" ");
	return joined.length > 0 ? joined : undefined;
}

function toTabsItems(items: PanelTabsItem[]): NonNullable<TabsProps["items"]> {
	return items.map((item: PanelTabsItem): NonNullable<TabsProps["items"]>[number] => ({
		key: item.key,
		label: item.label,
		children: item.children,
		forceRender: item.forceRender,
		closable: true
	}));
}

function PanelTabs({
	activeKey,
	items,
	addItems,
	addLabel,
	className,
	onActiveChange,
	onAdd,
	onClose
}: PanelTabsProps): React.JSX.Element {
	const menuItems: MenuProps["items"] = addItems.map((item: PanelTabsAddItem) => ({
		key: item.key,
		label: item.label,
		icon: item.icon,
		disabled: item.disabled
	}));

	function handleEdit(targetKey: EditTargetKey, action: "add" | "remove"): void {
		if (action !== "remove" || typeof targetKey !== "string") {
			return;
		}
		onClose(targetKey);
	}

	return (
		<Tabs
			activeKey={activeKey ?? undefined}
			type="editable-card"
			size="small"
			hideAdd={true}
			animated={false}
			items={toTabsItems(items)}
			className={joinClassNames(styles.panelTabs, className)}
			onChange={onActiveChange}
			onEdit={handleEdit}
			tabBarExtraContent={{
				right: (
					<Dropdown
						trigger={["click"]}
						menu={{
							items: menuItems,
							onClick: ({ key }): void => {
								onAdd(String(key));
							}
						}}
					>
						<Button
							type="text"
							size="small"
							shape="circle"
							aria-label={addLabel}
							className={styles.addButton}
							icon={<Icon name="add" />}
						/>
					</Dropdown>
				)
			}}
		/>
	);
}

export default PanelTabs;
