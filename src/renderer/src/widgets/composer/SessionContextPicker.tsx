import { useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Flex, Input, Menu, Modal, Select, Spin, type MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import { searchSessionContexts, type SessionContextSearchHit } from "@/platform/rpc/session-context-api";
import type { WorkspaceConfig } from "@/platform/rpc/types";
import styles from "./SessionContextPicker.module.css";
import { Icon } from "@/assets/icons";

export type SessionContextPickerProps = {
	open: boolean;
	currentSessionId: string | null;
	preferredWorkspaceId: string | null;
	attachedSessionIds: readonly string[];
	workspaces: readonly WorkspaceConfig[];
	onAttach: (session: SessionContextSearchHit) => void;
	onClose: () => void;
};

export default function SessionContextPicker({
	open,
	currentSessionId,
	preferredWorkspaceId,
	attachedSessionIds,
	workspaces,
	onAttach,
	onClose,
}: SessionContextPickerProps): React.JSX.Element {
	const { t } = useTranslation();
	const [query, setQuery] = useState("");
	const [workspaceId, setWorkspaceId] = useState<string | undefined>();
	const [hits, setHits] = useState<SessionContextSearchHit[]>([]);
	const [nextOffset, setNextOffset] = useState<number | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const searchRequestRef = useRef(0);

	useEffect((): (() => void) | void => {
		if (!open) return;
		const requestId = ++searchRequestRef.current;
		setLoading(true);
		setError(null);
		setHits([]);
		setNextOffset(null);
		const timer = window.setTimeout(
			(): void => {
				void searchSessionContexts({
					query,
					workspaceId,
					preferredWorkspaceId: preferredWorkspaceId ?? undefined,
					includeArchived: false,
					limit: 20,
				})
					.then((result): void => {
						if (requestId !== searchRequestRef.current) return;
						setHits(result.sessions);
						setNextOffset(result.nextOffset);
					})
					.catch((cause: unknown): void => {
						if (requestId !== searchRequestRef.current) return;
						setError(cause instanceof Error ? cause.message : t("composer.sessionPicker.searchFailed"));
					})
					.finally((): void => {
						if (requestId === searchRequestRef.current) setLoading(false);
					});
			},
			query.length > 0 ? 200 : 0,
		);
		return (): void => {
			searchRequestRef.current += 1;
			window.clearTimeout(timer);
		};
	}, [open, query, workspaceId, preferredWorkspaceId, t]);

	async function loadMore(): Promise<void> {
		if (nextOffset === null || loading) return;
		const requestId = searchRequestRef.current;
		setLoading(true);
		try {
			const result = await searchSessionContexts({
				query,
				workspaceId,
				preferredWorkspaceId: preferredWorkspaceId ?? undefined,
				includeArchived: false,
				limit: 20,
				offset: nextOffset,
			});
			if (requestId !== searchRequestRef.current) return;
			setHits((current): SessionContextSearchHit[] => [...current, ...result.sessions]);
			setNextOffset(result.nextOffset);
		} catch (cause: unknown) {
			if (requestId !== searchRequestRef.current) return;
			setError(cause instanceof Error ? cause.message : t("composer.sessionPicker.searchFailed"));
		} finally {
			if (requestId === searchRequestRef.current) setLoading(false);
		}
	}

	const atLimit = attachedSessionIds.length >= 3;
	const items: MenuProps["items"] = hits.map((hit) => {
		const id = hit.metadata.id;
		const isCurrent = id === currentSessionId;
		const isAttached = attachedSessionIds.includes(id);
		return {
			key: id,
			disabled: isCurrent || isAttached || atLimit,
			title: isCurrent
				? t("composer.sessionPicker.selfReference")
				: isAttached
					? t("composer.sessionPicker.alreadyAttached")
					: atLimit
						? t("composer.sessionPicker.limit")
						: hit.metadata.title,
			label: (
				<Flex align="center" justify="center" gap="small">
					<Icon name="chat" />
					<strong>{hit.metadata.title}</strong>
				</Flex>
			),
		};
	});

	return (
		<Modal
			open={open}
			title={t("composer.sessionPicker.title")}
			onCancel={onClose}
			width={560}
			footer={null}
			className={styles.modal}
		>
			<div className={styles.filters}>
				<Input.Search
					value={query}
					onChange={(event): void => setQuery(event.target.value)}
					placeholder={t("composer.sessionPicker.search")}
					allowClear
				/>
				<Select
					value={workspaceId}
					onChange={setWorkspaceId}
					allowClear
					placeholder={t("composer.sessionPicker.allWorkspaces")}
					options={workspaces.map((workspace) => ({
						value: workspace.id,
						label: workspace.name,
					}))}
					className={styles.workspaceSelect}
				/>
			</div>
			{error !== null ? <Alert type="error" showIcon message={error} className={styles.error} /> : null}
			<div className={styles.results}>
				{hits.length > 0 ? (
					<Menu
						className={styles.menu}
						items={items}
						selectable={false}
						onClick={({ key }): void => {
							const hit = hits.find((item): boolean => item.metadata.id === key);
							if (
								hit === undefined ||
								key === currentSessionId ||
								attachedSessionIds.includes(key) ||
								atLimit
							)
								return;
							onAttach(hit);
							onClose();
						}}
					/>
				) : null}
				{hits.length === 0 && !loading ? <Empty description={t("composer.sessionPicker.noResults")} /> : null}
				{loading ? <Spin className={styles.loading} /> : null}
				{nextOffset !== null && !loading ? (
					<Button
						type="link"
						onClick={(): void => {
							void loadMore();
						}}
					>
						{t("composer.sessionPicker.loadMore")}
					</Button>
				) : null}
			</div>
		</Modal>
	);
}
