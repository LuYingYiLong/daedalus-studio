import { cloneElement, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, type DragEndEvent } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
	onReorder?: (activeKey: string, overKey: string) => void;
};

type EditTargetKey = MouseEvent | KeyboardEvent | string;

type SortableTabNodeProps = HTMLAttributes<HTMLDivElement> & {
	"data-node-key": string;
};

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

function SortableTabNode({ className, ...props }: SortableTabNodeProps): React.JSX.Element {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition
	} = useSortable({
		id: props["data-node-key"]
	});
	const style: CSSProperties = {
		...props.style,
		transform: CSS.Translate.toString(transform),
		transition
	};

	return cloneElement(props.children as ReactElement<Record<string, unknown>>, {
		ref: setNodeRef,
		style,
		className: joinClassNames(className, styles.draggableTab),
		...attributes,
		...listeners
	});
}

function PanelTabs({
	activeKey,
	items,
	addItems,
	addLabel,
	className,
	onActiveChange,
	onAdd,
	onClose,
	onReorder
}: PanelTabsProps): React.JSX.Element {
	const pointerSensor = useSensor(PointerSensor, {
		activationConstraint: {
			distance: 8
		}
	});
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

	function handleDragEnd(event: DragEndEvent): void {
		if (event.over === null || event.active.id === event.over.id) {
			return;
		}
		onReorder?.(String(event.active.id), String(event.over.id));
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
			renderTabBar={(tabBarProps, DefaultTabBar): ReactElement => (
				<DndContext
					sensors={[pointerSensor]}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={items.map((item: PanelTabsItem): string => item.key)}
						strategy={horizontalListSortingStrategy}
					>
						<DefaultTabBar {...tabBarProps}>
							{(node): ReactElement => (
								<SortableTabNode
									{...(node as ReactElement<SortableTabNodeProps>).props}
									key={node.key}
								>
									{node}
								</SortableTabNode>
							)}
						</DefaultTabBar>
					</SortableContext>
				</DndContext>
			)}
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
