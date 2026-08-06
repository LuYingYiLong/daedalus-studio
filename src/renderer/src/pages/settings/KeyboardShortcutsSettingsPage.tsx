import { Alert, Button, Empty, Flex, Input, Modal, Space, Table, Typography } from "antd";
import type { TableProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	SHORTCUT_DEFINITIONS,
	detectShortcutPlatform,
	findShortcutConflict,
	formatShortcutBinding,
	formatShortcutBindingParts,
	getEffectiveShortcutBinding,
	getShortcutBindingSignature,
	getShortcutDefinition,
	shortcutBindingFromKeyboardEvent,
	type KeyboardShortcutOverrides,
	type ShortcutCommandId,
	type ShortcutDefinition,
	type ShortcutPlatform
} from "@/api/keyboard-shortcuts";
import {
	fetchClientPreferences,
	updateClientPreferences,
	type ClientPreferences
} from "@/api/client-preferences-api";
import { Icon } from "@/assets/icons";
import styles from "./KeyboardShortcutsSettingsPage.module.css";

type KeyboardShortcutsSettingsPageProps = {
	clientPreferences: ClientPreferences;
	onClientPreferencesChange: (preferences: ClientPreferences) => void;
};

function KeyboardShortcutsSettingsPage({
	clientPreferences,
	onClientPreferencesChange
}: KeyboardShortcutsSettingsPageProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const platform: ShortcutPlatform = useMemo((): ShortcutPlatform => detectShortcutPlatform(), []);
	const [draftPreferences, setDraftPreferences] = useState<ClientPreferences>(clientPreferences);
	const [actionQuery, setActionQuery] = useState<string>("");
	const [mappingQuery, setMappingQuery] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [savingCommandId, setSavingCommandId] = useState<ShortcutCommandId | null>(null);
	const [pageError, setPageError] = useState<string | null>(null);
	const [editingCommandId, setEditingCommandId] = useState<ShortcutCommandId | null>(null);
	const [editingBinding, setEditingBinding] = useState<string>("");
	const [editorError, setEditorError] = useState<string | null>(null);

	useEffect((): void => {
		setDraftPreferences(clientPreferences);
	}, [clientPreferences]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		void fetchClientPreferences()
			.then((preferences: ClientPreferences): void => {
				if (cancelled) {
					return;
				}
				setDraftPreferences(preferences);
				onClientPreferencesChange(preferences);
			})
			.catch((error: unknown): void => {
				if (!cancelled) {
					setPageError(error instanceof Error ? error.message : t("settings.keyboardShortcuts.errors.load"));
				}
			})
			.finally((): void => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [onClientPreferencesChange, t]);

	const filteredDefinitions: ShortcutDefinition[] = useMemo((): ShortcutDefinition[] => {
		const normalizedQuery: string = actionQuery.trim().toLocaleLowerCase();
		const mappingSignature: string | null = mappingQuery.length > 0
			? getShortcutBindingSignature(mappingQuery, platform)
			: null;
		return SHORTCUT_DEFINITIONS.filter((definition: ShortcutDefinition): boolean => {
			const nameMatches: boolean = normalizedQuery.length === 0
				|| t(definition.labelKey).toLocaleLowerCase().includes(normalizedQuery);
			const binding: string = getEffectiveShortcutBinding(draftPreferences.keyboardShortcuts, definition.id);
			const mappingMatches: boolean = mappingQuery.length === 0
				|| getShortcutBindingSignature(binding, platform) === mappingSignature;
			return nameMatches && mappingMatches;
		});
	}, [actionQuery, draftPreferences.keyboardShortcuts, mappingQuery, platform, t]);

	async function saveKeyboardShortcuts(
		nextOverrides: KeyboardShortcutOverrides,
		commandId: ShortcutCommandId
	): Promise<boolean> {
		const previousPreferences: ClientPreferences = draftPreferences;
		const optimisticPreferences: ClientPreferences = {
			...previousPreferences,
			keyboardShortcuts: nextOverrides
		};
		try {
			setSavingCommandId(commandId);
			setPageError(null);
			setDraftPreferences(optimisticPreferences);
			onClientPreferencesChange(optimisticPreferences);
			const savedPreferences: ClientPreferences = await updateClientPreferences({
				keyboardShortcuts: nextOverrides
			});
			setDraftPreferences(savedPreferences);
			onClientPreferencesChange(savedPreferences);
			return true;
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error
				? error.message
				: t("settings.keyboardShortcuts.errors.save");
			setDraftPreferences(previousPreferences);
			onClientPreferencesChange(previousPreferences);
			setPageError(errorMessage);
			if (editingCommandId === commandId) {
				setEditorError(errorMessage);
			}
			return false;
		} finally {
			setSavingCommandId(null);
		}
	}

	function openEditor(commandId: ShortcutCommandId): void {
		setEditingBinding(getEffectiveShortcutBinding(draftPreferences.keyboardShortcuts, commandId));
		setEditorError(null);
		setEditingCommandId(commandId);
	}

	function closeEditor(): void {
		if (savingCommandId !== null) {
			return;
		}
		setEditingCommandId(null);
		setEditingBinding("");
		setEditorError(null);
	}

	function captureMappingQuery(event: React.KeyboardEvent<HTMLInputElement>): void {
		if (event.key === "Escape") {
			event.preventDefault();
			setMappingQuery("");
			event.currentTarget.blur();
			return;
		}
		if (event.key === "Backspace" || event.key === "Delete") {
			event.preventDefault();
			setMappingQuery("");
			return;
		}
		event.preventDefault();
		const binding: string | null = shortcutBindingFromKeyboardEvent(event.nativeEvent, platform);
		if (binding !== null) {
			setMappingQuery(binding);
		}
	}

	function captureEditingBinding(event: React.KeyboardEvent<HTMLInputElement>): void {
		if (event.key === "Escape") {
			return;
		}
		event.preventDefault();
		if (event.key === "Backspace" || event.key === "Delete") {
			setEditingBinding("");
			setEditorError(t("settings.keyboardShortcuts.editor.required"));
			return;
		}
		const binding: string | null = shortcutBindingFromKeyboardEvent(event.nativeEvent, platform);
		if (binding === null) {
			if (!["Control", "Meta", "Alt", "Shift"].includes(event.key)) {
				setEditorError(t("settings.keyboardShortcuts.editor.invalid"));
			}
			return;
		}
		setEditingBinding(binding);
		setEditorError(null);
	}

	async function saveEditingBinding(): Promise<void> {
		if (editingCommandId === null || editingBinding.length === 0) {
			setEditorError(t("settings.keyboardShortcuts.editor.required"));
			return;
		}
		const conflict: ShortcutDefinition | null = findShortcutConflict(
			draftPreferences.keyboardShortcuts,
			editingCommandId,
			editingBinding,
			platform
		);
		if (conflict !== null) {
			setEditorError(t("settings.keyboardShortcuts.editor.conflict", {
				action: t(conflict.labelKey)
			}));
			return;
		}
		const definition: ShortcutDefinition = getShortcutDefinition(editingCommandId);
		const nextOverrides: KeyboardShortcutOverrides = { ...draftPreferences.keyboardShortcuts };
		if (editingBinding === definition.defaultBinding) {
			delete nextOverrides[editingCommandId];
		} else {
			nextOverrides[editingCommandId] = editingBinding;
		}
		if (await saveKeyboardShortcuts(nextOverrides, editingCommandId)) {
			closeEditor();
		}
	}

	async function resetShortcut(commandId: ShortcutCommandId): Promise<void> {
		if (draftPreferences.keyboardShortcuts[commandId] === undefined) {
			return;
		}
		const nextOverrides: KeyboardShortcutOverrides = { ...draftPreferences.keyboardShortcuts };
		delete nextOverrides[commandId];
		const conflict: ShortcutDefinition | null = findShortcutConflict(
			nextOverrides,
			commandId,
			getShortcutDefinition(commandId).defaultBinding,
			platform
		);
		if (conflict !== null) {
			setPageError(t("settings.keyboardShortcuts.editor.conflict", {
				action: t(conflict.labelKey)
			}));
			return;
		}
		await saveKeyboardShortcuts(nextOverrides, commandId);
	}

	const columns: TableProps<ShortcutDefinition>["columns"] = [
		{
			title: t("settings.keyboardShortcuts.columns.name"),
			key: "name",
			ellipsis: true,
			render: (_value: unknown, definition: ShortcutDefinition): React.ReactNode => (
				<Typography.Text ellipsis={{ tooltip: t(definition.labelKey) }}>
					{t(definition.labelKey)}
				</Typography.Text>
			)
		},
		{
			title: t("settings.keyboardShortcuts.columns.shortcut"),
			key: "shortcut",
			width: "32%",
			render: (_value: unknown, definition: ShortcutDefinition): React.ReactNode => (
				<span className={styles.keycapGroup}>
					{formatShortcutBindingParts(
						getEffectiveShortcutBinding(draftPreferences.keyboardShortcuts, definition.id),
						platform
					).map((part: string): React.ReactNode => (
						<kbd className={styles.keycap} key={part}>{part}</kbd>
					))}
				</span>
			)
		},
		{
			title: t("settings.keyboardShortcuts.columns.actions"),
			key: "actions",
			width: 176,
			render: (_value: unknown, definition: ShortcutDefinition): React.ReactNode => (
				<Space size={0}>
					<Button
						type="text"
						disabled={savingCommandId !== null}
						onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
							event.stopPropagation();
							openEditor(definition.id);
						}}
						icon={<Icon name="pencil" />}
					>
						{t("settings.keyboardShortcuts.actions.edit")}
					</Button>
					<Button
						type="text"
						loading={savingCommandId === definition.id}
						disabled={savingCommandId !== null || draftPreferences.keyboardShortcuts[definition.id] === undefined}
						onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
							event.stopPropagation();
							void resetShortcut(definition.id);
						}}
						icon={<Icon name="reload" />}
					>
						{t("settings.keyboardShortcuts.actions.reset")}
					</Button>
				</Space>
			)
		}
	];

	const editingDefinition: ShortcutDefinition | null = editingCommandId === null
		? null
		: getShortcutDefinition(editingCommandId);

	if (isLoading) {
		return null;
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>
					{t("settings.keyboardShortcuts.title")}
				</Typography.Title>
				<Flex className={styles.filterRow} gap="small" wrap={false}>
					<Input
						className={styles.filterInput}
						prefix={<Icon name="search" />}
						allowClear={true}
						value={actionQuery}
						placeholder={t("settings.keyboardShortcuts.search.action")}
						onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setActionQuery(event.target.value)}
					/>
					<Input
						className={styles.filterInput}
						prefix={<Icon name="keyboard" />}
						allowClear={true}
						readOnly={true}
						value={mappingQuery.length > 0 ? formatShortcutBinding(mappingQuery, platform) : ""}
						placeholder={t("settings.keyboardShortcuts.search.mapping")}
						onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
							if (event.target.value.length === 0) {
								setMappingQuery("");
							}
						}}
						onKeyDown={captureMappingQuery}
					/>
				</Flex>
			</header>

			<div className={styles.body}>
				{pageError !== null ? <Alert showIcon={true} type="error" description={pageError} /> : null}
				<div className={styles.tableRegion}>
					<Table<ShortcutDefinition>
						rowKey="id"
						size="small"
						columns={columns}
						dataSource={filteredDefinitions}
						loading={false}
						pagination={false}
						onRow={(definition: ShortcutDefinition): React.HTMLAttributes<HTMLTableRowElement> => ({
							className: styles.editableRow,
							role: "button",
							tabIndex: savingCommandId === null ? 0 : -1,
							"aria-label": `${t("settings.keyboardShortcuts.actions.edit")} ${t(definition.labelKey)}`,
							onClick: (): void => {
								if (savingCommandId === null) {
									openEditor(definition.id);
								}
							},
							onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>): void => {
								if (
									savingCommandId === null
									&& event.target === event.currentTarget
									&& (event.key === "Enter" || event.key === " ")
								) {
									event.preventDefault();
									openEditor(definition.id);
								}
							}
						})}
						locale={{
							emptyText: (
								<Empty
									image={Empty.PRESENTED_IMAGE_SIMPLE}
									description={t("settings.keyboardShortcuts.empty")}
								/>
							)
						}}
					/>
				</div>
			</div>

			<Modal
				open={editingDefinition !== null}
				title={editingDefinition === null ? "" : t("settings.keyboardShortcuts.editor.title", {
					action: t(editingDefinition.labelKey)
				})}
				okText={t("settings.common.save")}
				cancelText={t("settings.common.cancel")}
				confirmLoading={savingCommandId !== null}
				closable={savingCommandId === null}
				keyboard={savingCommandId === null}
				mask={{ closable: savingCommandId === null }}
				destroyOnHidden={true}
				onCancel={closeEditor}
				onOk={(): void => {
					void saveEditingBinding();
				}}
			>
				<div className={styles.editor}>
					<Typography.Text type="secondary">
						{t("settings.keyboardShortcuts.editor.description")}
					</Typography.Text>
					<Input
						autoFocus={true}
						readOnly={true}
						status={editorError === null ? undefined : "error"}
						value={editingBinding.length > 0 ? formatShortcutBinding(editingBinding, platform) : ""}
						placeholder={t("settings.keyboardShortcuts.editor.placeholder")}
						onKeyDown={captureEditingBinding}
					/>
					{editorError !== null ? (
						<Typography.Text type="danger">{editorError}</Typography.Text>
					) : null}
				</div>
			</Modal>
		</section>
	);
}

export default KeyboardShortcutsSettingsPage;
