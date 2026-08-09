import { Alert, Button, Flex, Modal, Typography } from "antd";
import { createJSONEditor, isJSONContent } from "vanilla-jsoneditor";
import type { Content, JsonEditor } from "vanilla-jsoneditor";
import { useEffect, useMemo, useRef, useState } from "react";
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
	const editorHostRef = useRef<HTMLDivElement | null>(null);
	const editorRef = useRef<JsonEditor | null>(null);
	const initialValueKey: string = useMemo((): string => JSON.stringify(initialValue ?? EMPTY_PROVIDER_REQUEST_OVERRIDES), [initialValue]);
	const [draft, setDraft] = useState<ProviderRequestOverrides | null>(null);
	const [validationErrorKey, setValidationErrorKey] = useState<string | null>(null);

	useEffect((): (() => void) | undefined => {
		if (!open || editorHostRef.current === null) {
			return undefined;
		}

		const initialContent: ProviderRequestOverrides = cloneProviderRequestOverrides(initialValue);
		setDraft(initialContent);
		setValidationErrorKey(null);

		const editor: JsonEditor = createJSONEditor({
			target: editorHostRef.current,
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

					const result = parseProviderRequestOverrides(content.json);
					setDraft(result.value);
					setValidationErrorKey(result.error);
				}
			}
		});
		editorRef.current = editor;

		return (): void => {
			editorRef.current = null;
			void editor.destroy();
		};
	}, [initialValue, initialValueKey, open]);

	function resetValue(): void {
		const nextValue: ProviderRequestOverrides = cloneProviderRequestOverrides(undefined);
		editorRef.current?.updateProps({ content: { json: nextValue } });
		setDraft(nextValue);
		setValidationErrorKey(null);
	}

	const displayedError: string | null = validationErrorKey === null ? errorMessage : t(validationErrorKey);

	return (
		<Modal
			open={open}
			title={t("settings.provider.requestConfiguration.title", { provider: providerName })}
			width={780}
			destroyOnHidden={true}
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
				<div ref={editorHostRef} className={styles.editorHost} />
			</div>
		</Modal>
	);
}

export default ProviderRequestConfigModal;
