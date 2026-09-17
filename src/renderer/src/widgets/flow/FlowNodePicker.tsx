import { Empty, Input, Tag, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FlowDocumentNodeType, FlowNodeTypeDefinition } from "@/platform/rpc/types";
import styles from "./FlowNodePicker.module.css";

const RECENT_NODE_TYPES_KEY = "daedalus.flow.recent-node-types";
const MAX_RECENT_NODE_TYPES = 5;

type FlowNodePickerProps = {
	open: boolean;
	position: { x: number; y: number };
	definitions: FlowNodeTypeDefinition[];
	workspaceAvailable: boolean;
	onSelect: (type: FlowDocumentNodeType) => void;
	onClose: () => void;
};

function readRecentNodeTypes(): FlowDocumentNodeType[] {
	try {
		const value = JSON.parse(window.localStorage.getItem(RECENT_NODE_TYPES_KEY) ?? "[]") as unknown;
		return Array.isArray(value) ? value.filter((item): item is FlowDocumentNodeType => typeof item === "string").slice(0, MAX_RECENT_NODE_TYPES) : [];
	} catch {
		return [];
	}
}

export default function FlowNodePicker({ open, position, definitions, workspaceAvailable, onSelect, onClose }: FlowNodePickerProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const [query, setQuery] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);
	const [recentNodeTypes, setRecentNodeTypes] = useState<FlowDocumentNodeType[]>(readRecentNodeTypes);
	const panelRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<React.ComponentRef<typeof Input> | null>(null);
	const filtered = useMemo((): FlowNodeTypeDefinition[] => {
		const normalized = query.trim().toLocaleLowerCase();
		const matches = definitions.filter((definition): boolean => normalized.length === 0 || `${definition.defaultTitle} ${definition.type} ${definition.category}`.toLocaleLowerCase().includes(normalized));
		if (normalized.length > 0) return matches;
		const recentOrder = new Map(recentNodeTypes.map((type, index): [FlowDocumentNodeType, number] => [type, index]));
		return [...matches].sort((left, right): number => (recentOrder.get(left.type) ?? Number.MAX_SAFE_INTEGER) - (recentOrder.get(right.type) ?? Number.MAX_SAFE_INTEGER));
	}, [definitions, query, recentNodeTypes]);
	const selectNode = (type: FlowDocumentNodeType): void => {
		const next = [type, ...recentNodeTypes.filter((candidate): boolean => candidate !== type)].slice(0, MAX_RECENT_NODE_TYPES);
		setRecentNodeTypes(next);
		try { window.localStorage.setItem(RECENT_NODE_TYPES_KEY, JSON.stringify(next)); } catch { /* The picker still works when storage is unavailable. */ }
		onSelect(type);
	};

	useEffect((): void => {
		if (!open) return;
		setQuery("");
		setActiveIndex(0);
		window.setTimeout((): void => inputRef.current?.focus(), 0);
	}, [open]);
	useEffect((): (() => void) | undefined => {
		if (!open) return undefined;
		const onPointerDown = (event: PointerEvent): void => { if (!panelRef.current?.contains(event.target as globalThis.Node)) onClose(); };
		window.addEventListener("pointerdown", onPointerDown, true);
		return (): void => window.removeEventListener("pointerdown", onPointerDown, true);
	}, [onClose, open]);
	if (!open) return null;
	return <div ref={panelRef} className={styles.picker} style={{ left: position.x, top: position.y }} role="dialog" aria-label={t("flow.editor.picker.title")} onKeyDown={(event): void => {
		if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
		if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((current): number => filtered.length === 0 ? 0 : (current + 1) % filtered.length); return; }
		if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current): number => filtered.length === 0 ? 0 : (current - 1 + filtered.length) % filtered.length); return; }
		if (event.key === "Enter") { const definition = filtered[activeIndex]; if (definition !== undefined && (!definition.workspaceRequired || workspaceAvailable)) { event.preventDefault(); selectNode(definition.type); } }
	}}>
		<Input ref={inputRef} allowClear placeholder={t("flow.editor.picker.search")} value={query} onChange={(event): void => { setQuery(event.target.value); setActiveIndex(0); }} />
		<div className={styles.list} role="listbox">{filtered.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("flow.editor.picker.empty")} /> : filtered.map((definition, index): React.JSX.Element => {
			const disabled = definition.workspaceRequired && !workspaceAvailable;
			const isRecent = query.trim().length === 0 && recentNodeTypes.includes(definition.type);
			return <button key={definition.type} type="button" role="option" data-flow-node-type={definition.type} aria-selected={index === activeIndex} disabled={disabled} className={`${styles.item} ${index === activeIndex ? styles.itemActive : ""}`} onMouseEnter={(): void => setActiveIndex(index)} onClick={(): void => selectNode(definition.type)}>
				<span className={styles.itemCopy}><Typography.Text strong>{t(`flow.editor.nodes.${definition.type}`, { defaultValue: definition.defaultTitle })}</Typography.Text><Typography.Text type="secondary" className={styles.itemDescription}>{disabled ? t("flow.editor.picker.workspaceRequired") : definition.ports.map((port): string => port.label).join(" · ") || t("flow.editor.picker.visualOnly")}</Typography.Text></span>
				<span className={styles.itemTags}>{isRecent ? <Tag color="blue">{t("flow.editor.picker.recent")}</Tag> : null}<Tag>{t(`flow.editor.picker.categories.${definition.category}`)}</Tag></span>
			</button>;
		})}</div>
		<div className={styles.hint}>{t("flow.editor.picker.hint")}</div>
	</div>;
}
