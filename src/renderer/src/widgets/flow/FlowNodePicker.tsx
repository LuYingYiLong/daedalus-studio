import { Dropdown, Empty, Input } from "antd";
import type { InputRef, MenuProps } from "antd";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FlowNodeTypeId, FlowNodeTypeDefinition } from "@/platform/rpc/types";
import styles from "./FlowNodePicker.module.css";
import { Icon } from "@/assets/icons";
import { flowNodeTypeLabel } from "./flow-node-labels";

type FlowNodePickerProps = {
	open: boolean;
	position: { x: number; y: number };
	definitions: FlowNodeTypeDefinition[];
	workspaceAvailable: boolean;
	onSelect: (type: FlowNodeTypeId) => void;
	onClose: () => void;
};

const menuStyle: React.CSSProperties = {
	boxShadow: "none",
	border: 0,
};

const submenuMotion: NonNullable<MenuProps["motion"]> = {
	motionName: "",
	motionAppear: false,
	motionEnter: false,
	motionLeave: false,
};

export default function FlowNodePicker({
	open,
	position,
	definitions,
	workspaceAvailable,
	onSelect,
	onClose,
}: FlowNodePickerProps): React.JSX.Element {
	const { t } = useTranslation();
	const [query, setQuery] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);
	const [openCategoryKeys, setOpenCategoryKeys] = useState<string[]>([]);
	const inputRef = useRef<InputRef | null>(null);
	const filtered = useMemo((): FlowNodeTypeDefinition[] => {
		const normalized = query.trim().toLocaleLowerCase();
		return definitions.filter(
			(definition): boolean =>
				normalized.length === 0 ||
				`${flowNodeTypeLabel(t, definition)} ${definition.defaultTitle} ${definition.typeId} ${definition.category}`
					.toLocaleLowerCase()
					.includes(normalized),
		);
	}, [definitions, query, t]);
	const items = useMemo((): MenuProps["items"] => {
		const byCategory = new Map<string, FlowNodeTypeDefinition[]>();
		for (const definition of filtered) {
			const category = byCategory.get(definition.category) ?? [];
			category.push(definition);
			byCategory.set(definition.category, category);
		}
		return [...byCategory].map(([category, categoryDefinitions]) => ({
			key: `category:${category}`,
			label: t(`flow.editor.picker.categories.${category}`, { defaultValue: category }),
			onTitleMouseEnter: (): void => setOpenCategoryKeys([`category:${category}`]),
			children: categoryDefinitions.map((definition) => ({
				key: definition.typeId,
				label: flowNodeTypeLabel(t, definition),
				disabled: definition.workspaceRequired && !workspaceAvailable,
			})),
			expandIcon: <Icon name="arrow-forward" />,
		}));
	}, [filtered, t, workspaceAvailable]);
	const closePicker = (): void => {
		setOpenCategoryKeys([]);
		onClose();
	};
	const selectDefinition = (key: string): void => {
		const definition = filtered.find((candidate): boolean => candidate.typeId === key);
		if (definition === undefined) return;
		setOpenCategoryKeys([]);
		onSelect(definition.typeId);
	};

	useEffect((): void => {
		if (!open) {
			setOpenCategoryKeys([]);
			return;
		}
		setQuery("");
		setActiveIndex(0);
		setOpenCategoryKeys([]);
		window.setTimeout((): void => inputRef.current?.focus(), 0);
	}, [open]);
	useEffect((): void => {
		if (!open || query.trim().length === 0) return;
		setOpenCategoryKeys([...new Set(filtered.map((definition): string => `category:${definition.category}`))]);
	}, [filtered, open, query]);
	useEffect((): (() => void) | undefined => {
		if (!open) return undefined;
		const closeOnOutsidePointerDown = (event: PointerEvent): void => {
			const target = event.target;
			const element = target instanceof Element
				? target
				: target instanceof Node
					? target.parentElement
					: null;
			if (element?.closest("[data-flow-node-picker-popup]") !== null) return;
			closePicker();
		};
		document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
		return (): void => document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
	}, [open, onClose]);
	return (
		<Dropdown
			open={open}
			autoAdjustOverflow
			destroyOnHidden={false}
			placement="bottomLeft"
			trigger={[]}
			menu={{
				items,
				motion: submenuMotion,
				getPopupContainer: (triggerNode): HTMLElement =>
					triggerNode
						.closest<HTMLElement>("[data-flow-node-picker-popup]")
						?.querySelector<HTMLElement>("[data-flow-node-picker-submenu-host]") ?? document.body,
				selectable: true,
				selectedKeys: filtered[activeIndex] === undefined ? [] : [filtered[activeIndex].typeId],
				openKeys: open ? openCategoryKeys : [],
				triggerSubMenuAction: "click",
				onOpenChange: (keys): void => setOpenCategoryKeys(open ? keys.map(String) : []),
				onClick: ({ key }): void => selectDefinition(key),
			}}
			onOpenChange={(nextOpen): void => {
				if (!nextOpen) closePicker();
			}}
			popupRender={(menu): React.ReactNode => (
				<div
					className={styles.pickerOverlay}
					data-flow-node-picker-popup
					role="dialog"
					aria-label={t("flow.editor.picker.title")}
					onKeyDown={(event): void => {
						if (event.key === "Escape") {
							event.preventDefault();
							closePicker();
							return;
						}
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setActiveIndex((current): number =>
								filtered.length === 0 ? 0 : (current + 1) % filtered.length,
							);
							return;
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							setActiveIndex((current): number =>
								filtered.length === 0 ? 0 : (current - 1 + filtered.length) % filtered.length,
							);
							return;
						}
						if (event.key === "Enter") {
							const definition = filtered[activeIndex];
							if (definition !== undefined && (!definition.workspaceRequired || workspaceAvailable)) {
								event.preventDefault();
								selectDefinition(definition.typeId);
							}
						}
					}}
				>
					<Input
						ref={inputRef}
						allowClear
						placeholder={t("flow.editor.picker.search")}
						value={query}
						onChange={(event): void => {
							setQuery(event.target.value);
							setActiveIndex(0);
						}}
					/>
					{filtered.length === 0 ? (
						<Empty
							className={styles.empty}
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={t("flow.editor.picker.empty")}
						/>
					) : (
						React.cloneElement(
							menu as React.ReactElement<{
								style: React.CSSProperties;
							}>,
							{ style: menuStyle },
						)
					)}
					<div className={styles.submenuPortalHost} data-flow-node-picker-submenu-host />
				</div>
			)}
		>
			<span className={styles.pickerAnchor} style={{ left: position.x, top: position.y }} aria-hidden />
		</Dropdown>
	);
}
