import { Alert, Button, Flex, Input, Modal, Typography } from "antd";
import { createJSONEditor, isJSONContent } from "vanilla-jsoneditor";
import type { Content, JsonEditor } from "vanilla-jsoneditor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	cloneProviderRequestOverrides,
	EMPTY_PROVIDER_REQUEST_OVERRIDES,
	parseProviderRequestOverrides
} from "@/domain/settings/provider-request-overrides";
import type { ProviderRequestOverrides } from "@/platform/rpc/provider-api";
import styles from "./ProviderRequestConfigModal.module.css";

type ProviderRequestConfigModalProps = {
	open: boolean;
	providerName: string;
	initialValue: ProviderRequestOverrides | undefined;
	saving: boolean;
	errorMessage: string | null;
	onCancel: () => void;
	onSave: (value: ProviderRequestOverrides) => void;
};

function ProviderRequestConfigModal({
	open,
	providerName,
	initialValue,
	saving,
	errorMessage,
	onCancel,
	onSave
}: ProviderRequestConfigModalProps): React.JSX.Element {
	const { t } = useTranslation();
	const editorRef = useRef<JsonEditor | null>(null);
	const initialValueKey: string = useMemo((): string => JSON.stringify(initialValue ?? EMPTY_PROVIDER_REQUEST_OVERRIDES), [initialValue]);
	const initialContent: ProviderRequestOverrides = useMemo(
		(): ProviderRequestOverrides => cloneProviderRequestOverrides(initialValue),
		[initialValueKey]
	);
	const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
	const [draft, setDraft] = useState<ProviderRequestOverrides | null>(null);
	const [validationErrorKey, setValidationErrorKey] = useState<string | null>(null);
	const [textValue, setTextValue] = useState<string>("");
	const [usingTextEditor, setUsingTextEditor] = useState<boolean>(false);

	const applyDraft = useCallback((value: unknown): void => {
		const result = parseProviderRequestOverrides(value);
		setDraft(result.value);
		setValidationErrorKey(result.error);
	}, []);

	useEffect((): void => {
		if (!open) {
			return;
		}

		setDraft(initialContent);
		setTextValue(JSON.stringify(initialContent, null, 2));
		setValidationErrorKey(null);
		setUsingTextEditor(false);
	}, [initialContent, open]);

	useEffect((): (() => void) | undefined => {
		if (!open || editorHost === null || usingTextEditor) {
			return undefined;
		}

		let cancelled: boolean = false;
		let editor: JsonEditor | null = null;
		const frame: number = window.requestAnimationFrame((): void => {
			if (cancelled) {
				return;
			}

			try {
				editor = createJSONEditor({
					target: editorHost,
					props: {
						content: { json: initialContent },
						mode: "text",
						mainMenuBar: true,
						navigationBar: false,
						statusBar: true,
						onChange: (content: Content): void => {
							if (!isJSONContent(content)) {
								setDraft(null);
								setValidationErrorKey("settings.provider.requestConfiguration.validation.json");
								return;
							}

							applyDraft(content.json);
						}
					}
				});
				editorRef.current = editor;
			} catch {
				setUsingTextEditor(true);
			}
		});

		return (): void => {
			cancelled = true;
			window.cancelAnimationFrame(frame);
			editorRef.current = null;
			if (editor !== null) {
				void editor.destroy();
			}
		};
	}, [applyDraft, editorHost, initialContent, open, usingTextEditor]);

	function resetValue(): void {
		const nextValue: ProviderRequestOverrides = cloneProviderRequestOverrides(undefined);
		editorRef.current?.updateProps({ content: { json: nextValue } });
		setDraft(nextValue);
		setTextValue(JSON.stringify(nextValue, null, 2));
		setValidationErrorKey(null);
	}

	function handleTextChange(nextText: string): void {
		setTextValue(nextText);
		try {
			applyDraft(JSON.parse(nextText) as unknown);
		} catch {
			setDraft(null);
			setValidationErrorKey("settings.provider.requestConfiguration.validation.json");
		}
	}

	const displayedError: string | null = validationErrorKey === null ? errorMessage : t(validationErrorKey);

	return (
		<Modal
			open={open}
			title={t("settings.provider.requestConfiguration.title", { provider: providerName })}
			width={780}
			destroyOnHidden={true}
			forceRender={true}
			closable={!saving}
			keyboard={!saving}
			mask={{ closable: !saving }}
			footer={(
				<Flex justify="space-between" align="center" gap="small">
					<Button disabled={saving} onClick={resetValue}>{t("settings.provider.requestConfiguration.reset")}</Button>
					<Flex gap="small">
						<Button disabled={saving} onClick={onCancel}>{t("settings.common.cancel")}</Button>
						<Button type="primary" loading={saving} disabled={draft === null} onClick={(): void => {
							if (draft !== null) {
								onSave(draft);
							}
						}}>
							{t("settings.common.save")}
						</Button>
					</Flex>
				</Flex>
			)}
			onCancel={onCancel}
			className={styles.modal}
		>
			<div className={styles.content}>
				<Typography.Paragraph type="secondary" className={styles.description}>
					{t("settings.provider.requestConfiguration.description")}
				</Typography.Paragraph>
				<Alert type="info" showIcon={true} description={t("settings.provider.requestConfiguration.safetyHint")} />
				{displayedError !== null ? <Alert type="error" showIcon={true} description={displayedError} /> : null}
				<Flex justify="space-between" align="center" gap="small" className={styles.editorToolbar}>
					<Typography.Text type="secondary">{t("settings.provider.requestConfiguration.editorHint")}</Typography.Text>
					{usingTextEditor ? null : (
						<Button type="link" size="small" onClick={(): void => setUsingTextEditor(true)}>
							{t("settings.provider.requestConfiguration.useTextEditor")}
						</Button>
					)}
				</Flex>
				{usingTextEditor ? (
					<Input.TextArea
						value={textValue}
						onChange={(event): void => handleTextChange(event.target.value)}
						autoSize={false}
						spellCheck={false}
						className={styles.textEditor}
					/>
				) : <div ref={setEditorHost} className={styles.editorHost} />}
			</div>
		</Modal>
	);
}

export default ProviderRequestConfigModal;
