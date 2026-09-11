import { Alert, Button, Input, Slider, Switch, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	fetchClientPreferences,
	updateClientPreferences,
	type ClientPreferences,
} from "@/platform/rpc/client-preferences-api";
import { MIN_MASCOT_SIZE, MAX_MASCOT_SIZE } from "../../../../../../contracts/mascot-preferences";
import { fetchUserPromptConfig, saveUserPrompt, type UserPromptConfig } from "@/platform/rpc/user-prompt-api";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import styles from "./PersonalizationSettingsPage.module.css";

type PersonalizationSettingsPageProps = {
	clientPreferences: ClientPreferences;
	onClientPreferencesChange: (preferences: ClientPreferences) => void;
};

type MascotSettingKey = "mascotEnabled" | "mascotSize";

function PersonalizationSettingsPage({
	clientPreferences,
	onClientPreferencesChange,
}: PersonalizationSettingsPageProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const [savedPrompt, setSavedPrompt] = useState<string>("");
	const [draftPrompt, setDraftPrompt] = useState<string>("");
	const [savedGitCommitPrompt, setSavedGitCommitPrompt] = useState<string>("");
	const [draftGitCommitPrompt, setDraftGitCommitPrompt] = useState<string>("");
	const [savedCommandReviewPrompt, setSavedCommandReviewPrompt] = useState<string>("");
	const [draftCommandReviewPrompt, setDraftCommandReviewPrompt] = useState<string>("");
	const [updatedAt, setUpdatedAt] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [draftClientPreferences, setDraftClientPreferences] = useState<ClientPreferences>(clientPreferences);
	const [savingMascotKey, setSavingMascotKey] = useState<MascotSettingKey | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect((): void => {
		setDraftClientPreferences(clientPreferences);
	}, [clientPreferences]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadUserPrompt(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const [config, preferences]: [UserPromptConfig, ClientPreferences] = await Promise.all([
					fetchUserPromptConfig(),
					fetchClientPreferences(),
				]);

				if (cancelled) {
					return;
				}

				setSavedPrompt(config.prompt);
				setDraftPrompt(config.prompt);
				setSavedGitCommitPrompt(config.gitCommitPrompt);
				setDraftGitCommitPrompt(config.gitCommitPrompt);
				setSavedCommandReviewPrompt(config.commandReviewPrompt);
				setDraftCommandReviewPrompt(config.commandReviewPrompt);
				setUpdatedAt(config.updatedAt);
				setDraftClientPreferences(preferences);
				onClientPreferencesChange(preferences);
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : t("settings.personalization.errors.load"));
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		void loadUserPrompt();

		return (): void => {
			cancelled = true;
		};
	}, [onClientPreferencesChange, t]);

	const isDirty: boolean = useMemo((): boolean => {
		return (
			draftPrompt !== savedPrompt ||
			draftGitCommitPrompt !== savedGitCommitPrompt ||
			draftCommandReviewPrompt !== savedCommandReviewPrompt
		);
	}, [
		draftCommandReviewPrompt,
		draftGitCommitPrompt,
		draftPrompt,
		savedCommandReviewPrompt,
		savedGitCommitPrompt,
		savedPrompt,
	]);

	async function handleSave(): Promise<void> {
		try {
			setIsSaving(true);
			setErrorMessage(null);
			const config: UserPromptConfig = await saveUserPrompt({
				prompt: draftPrompt,
				gitCommitPrompt: draftGitCommitPrompt,
				commandReviewPrompt: draftCommandReviewPrompt,
			});

			setSavedPrompt(config.prompt);
			setDraftPrompt(config.prompt);
			setSavedGitCommitPrompt(config.gitCommitPrompt);
			setDraftGitCommitPrompt(config.gitCommitPrompt);
			setSavedCommandReviewPrompt(config.commandReviewPrompt);
			setDraftCommandReviewPrompt(config.commandReviewPrompt);
			setUpdatedAt(config.updatedAt);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.personalization.errors.save"));
		} finally {
			setIsSaving(false);
		}
	}

	function handleCancel(): void {
		setDraftPrompt(savedPrompt);
		setDraftGitCommitPrompt(savedGitCommitPrompt);
		setDraftCommandReviewPrompt(savedCommandReviewPrompt);
		setErrorMessage(null);
	}

	async function saveMascotPreference(key: MascotSettingKey, value: boolean | number): Promise<void> {
		if (savingMascotKey !== null) return;
		const previousPreferences: ClientPreferences = draftClientPreferences;
		const optimisticPreferences: ClientPreferences = {
			...previousPreferences,
			[key]: value,
		};
		try {
			setSavingMascotKey(key);
			setErrorMessage(null);
			setDraftClientPreferences(optimisticPreferences);
			onClientPreferencesChange(optimisticPreferences);
			const savedPreferences: ClientPreferences = await updateClientPreferences({
				[key]: value,
			});
			setDraftClientPreferences(savedPreferences);
			onClientPreferencesChange(savedPreferences);
		} catch (error: unknown) {
			setDraftClientPreferences(previousPreferences);
			onClientPreferencesChange(previousPreferences);
			setErrorMessage(error instanceof Error ? error.message : t("settings.personalization.errors.save"));
		} finally {
			setSavingMascotKey(null);
		}
	}

	if (isLoading) {
		return null;
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>
					{t("settings.personalization.title")}
				</Typography.Title>
			</header>
			<div className={styles.body}>
				{errorMessage !== null ? (
					<Alert
						type="warning"
						showIcon={true}
						description={errorMessage}
						action={
							<Button
								size="small"
								type="text"
								icon={<Icon name="close" />}
								onClick={(): void => setErrorMessage(null)}
							/>
						}
					/>
				) : null}
				<SettingsList title={t("settings.personalization.mascot.title")}>
					<div className={styles.preferenceList}>
						<SettingsItem
							searchKey="item:personalization.mascotEnabled"
							title={t("settings.personalization.mascot.enabled.title")}
							description={t("settings.personalization.mascot.enabled.description")}
						>
							<Switch
								checked={draftClientPreferences.mascotEnabled}
								loading={savingMascotKey === "mascotEnabled"}
								disabled={savingMascotKey !== null && savingMascotKey !== "mascotEnabled"}
								onChange={(checked: boolean): void => {
									void saveMascotPreference("mascotEnabled", checked);
								}}
							/>
						</SettingsItem>
						<SettingsItem
							searchKey="item:personalization.mascotSize"
							title={t("settings.personalization.mascot.size.title")}
							description={t("settings.personalization.mascot.size.description")}
						>
							<div className={styles.sliderControl}>
								<Slider
									className={styles.slider}
									min={MIN_MASCOT_SIZE}
									max={MAX_MASCOT_SIZE}
									step={5}
									value={draftClientPreferences.mascotSize}
									disabled={savingMascotKey !== null}
									onChange={(value: number): void => {
										setDraftClientPreferences(
											(preferences: ClientPreferences): ClientPreferences => ({
												...preferences,
												mascotSize: value,
											}),
										);
									}}
									onChangeComplete={(value: number): void => {
										void saveMascotPreference("mascotSize", value);
									}}
								/>
								<Typography.Text type="secondary" className={styles.sliderValue}>
									{draftClientPreferences.mascotSize}%
								</Typography.Text>
							</div>
						</SettingsItem>
					</div>
				</SettingsList>

				<div>
					<SettingsItem
						searchKey="item:personalization.userPrompt"
						vertical={true}
						ghost={true}
						title={t("settings.personalization.userPrompt.title")}
						description={t("settings.personalization.userPrompt.description")}
					>
						<Input.TextArea
							className={styles.textarea}
							value={draftPrompt}
							autoSize={{ minRows: 6, maxRows: 6 }}
							maxLength={20000}
							showCount={true}
							onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
								setDraftPrompt(event.target.value);
							}}
						/>
					</SettingsItem>

					<SettingsItem
						searchKey="item:personalization.gitCommitPrompt"
						vertical={true}
						ghost={true}
						title={t("settings.personalization.gitCommitPrompt.title")}
						description={t("settings.personalization.gitCommitPrompt.description")}
					>
						<Input.TextArea
							className={styles.textarea}
							value={draftGitCommitPrompt}
							autoSize={{ minRows: 6, maxRows: 6 }}
							maxLength={20000}
							showCount={true}
							onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
								setDraftGitCommitPrompt(event.target.value);
							}}
						/>
					</SettingsItem>

					<SettingsItem
						searchKey="item:personalization.commandReviewPrompt"
						vertical={true}
						ghost={true}
						title={t("settings.personalization.commandReviewPrompt.title")}
						description={t("settings.personalization.commandReviewPrompt.description")}
					>
						<Input.TextArea
							className={styles.textarea}
							value={draftCommandReviewPrompt}
							autoSize={{ minRows: 6, maxRows: 6 }}
							maxLength={20000}
							showCount={true}
							placeholder={t("settings.personalization.commandReviewPrompt.placeholder")}
							onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
								setDraftCommandReviewPrompt(event.target.value);
							}}
						/>
					</SettingsItem>

					<div className={styles.footer}>
						<Button disabled={!isDirty || isSaving} onClick={handleCancel}>
							{t("settings.common.cancel")}
						</Button>
						<Button
							type="primary"
							disabled={!isDirty}
							loading={isSaving}
							onClick={(): void => void handleSave()}
						>
							{t("settings.common.save")}
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}

export default PersonalizationSettingsPage;
