import { Alert, Button, Flex, Modal, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	cloneProviderRequestOverrides,
	EMPTY_PROVIDER_REQUEST_OVERRIDES,
	parseProviderRequestOverrides,
} from "@/domain/settings/provider-request-overrides";
import type { ProviderRequestOverrides } from "@/platform/rpc/provider-api";
import ProviderRequestJsonEditor, {
	type ProviderRequestJsonEditorHandle,
} from "./ProviderRequestJsonEditor";
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
	onSave,
}: ProviderRequestConfigModalProps): React.JSX.Element {
	const { t } = useTranslation();
	const editorRef = useRef<ProviderRequestJsonEditorHandle | null>(null);
	const initialValueKey: string = useMemo(
		(): string =>
			JSON.stringify(initialValue ?? EMPTY_PROVIDER_REQUEST_OVERRIDES),
		[initialValue],
	);
	const initialContent: ProviderRequestOverrides = useMemo(
		(): ProviderRequestOverrides =>
			cloneProviderRequestOverrides(initialValue),
		[initialValueKey],
	);
	const [draft, setDraft] = useState<ProviderRequestOverrides | null>(null);
	const [validationErrorKey, setValidationErrorKey] = useState<string | null>(
		null,
	);
	const [textValue, setTextValue] = useState<string>("");

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
	}, [initialContent, open]);

	function resetValue(): void {
		const nextValue: ProviderRequestOverrides =
			cloneProviderRequestOverrides(undefined);
		setDraft(nextValue);
		setTextValue(JSON.stringify(nextValue, null, 2));
		setValidationErrorKey(null);
	}

	const handleTextChange = useCallback(
		(nextText: string): void => {
			setTextValue(nextText);
			try {
				applyDraft(JSON.parse(nextText) as unknown);
			} catch {
				setDraft(null);
				setValidationErrorKey(
					"settings.provider.requestConfiguration.validation.json",
				);
			}
		},
		[applyDraft],
	);

	const displayedError: string | null =
		validationErrorKey === null ? errorMessage : t(validationErrorKey);

	return (
		<Modal
			open={open}
			title={t("settings.provider.requestConfiguration.title", {
				provider: providerName,
			})}
			width={780}
			destroyOnHidden={true}
			forceRender={true}
			closable={!saving}
			keyboard={!saving}
			mask={{ closable: !saving }}
			footer={
				<Flex justify="space-between" align="center" gap="small">
					<Button disabled={saving} onClick={resetValue}>
						{t("settings.provider.requestConfiguration.reset")}
					</Button>
					<Flex gap="small">
						<Button disabled={saving} onClick={onCancel}>
							{t("settings.common.cancel")}
						</Button>
						<Button
							type="primary"
							loading={saving}
							disabled={draft === null}
							onClick={(): void => {
								if (draft !== null) {
									onSave(draft);
								}
							}}
						>
							{t("settings.common.save")}
						</Button>
					</Flex>
				</Flex>
			}
			onCancel={onCancel}
			className={styles.modal}
		>
			<div className={styles.content}>
				<Typography.Paragraph
					type="secondary"
					className={styles.description}
				>
					{t("settings.provider.requestConfiguration.description")}
				</Typography.Paragraph>
				<Alert
					type="info"
					showIcon={true}
					description={t(
						"settings.provider.requestConfiguration.safetyHint",
					)}
				/>
				{displayedError !== null ? (
					<Alert
						type="error"
						showIcon={true}
						description={displayedError}
					/>
				) : null}
				<Flex
					justify="space-between"
					align="center"
					gap="small"
					className={styles.editorToolbar}
				>
					<Typography.Text type="secondary">
						{t("settings.provider.requestConfiguration.editorHint")}
					</Typography.Text>
					<Button
						icon={<Icon name="format" />}
						disabled={saving}
						onClick={(): void => void editorRef.current?.format()}
					>
						{t("settings.provider.requestConfiguration.format")}
					</Button>
				</Flex>
				<div className={styles.editorFrame}>
					<ProviderRequestJsonEditor
						value={textValue}
						readOnly={saving}
						onChange={handleTextChange}
						editorRef={editorRef}
						ariaLabel={t(
							"settings.provider.requestConfiguration.editorAriaLabel",
						)}
					/>
				</div>
			</div>
		</Modal>
	);
}

export default ProviderRequestConfigModal;
