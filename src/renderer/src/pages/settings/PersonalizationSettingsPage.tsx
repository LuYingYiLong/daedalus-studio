import { Alert, Button, Input, Spin, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { fetchUserPromptConfig, saveUserPrompt, type UserPromptConfig } from "@/api/user-prompt-api";
import styles from "./PersonalizationSettingsPage.module.css";

function PersonalizationSettingsPage(): React.JSX.Element {
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
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadUserPrompt(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const config: UserPromptConfig = await fetchUserPromptConfig();

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
	}, [t]);

	const isDirty: boolean = useMemo((): boolean => {
		return draftPrompt !== savedPrompt
			|| draftGitCommitPrompt !== savedGitCommitPrompt
			|| draftCommandReviewPrompt !== savedCommandReviewPrompt;
	}, [
		draftCommandReviewPrompt,
		draftGitCommitPrompt,
		draftPrompt,
		savedCommandReviewPrompt,
		savedGitCommitPrompt,
		savedPrompt
	]);

	async function handleSave(): Promise<void> {
		try {
			setIsSaving(true);
			setErrorMessage(null);
			const config: UserPromptConfig = await saveUserPrompt({
				prompt: draftPrompt,
				gitCommitPrompt: draftGitCommitPrompt,
				commandReviewPrompt: draftCommandReviewPrompt
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

	return (
		<section className={styles.page}>
			<article className={styles.card}>
				<div className={styles.header}>
					<Typography.Title level={4} className={styles.title}>
						{t("settings.personalization.userPrompt.title")}
					</Typography.Title>
					<Typography.Text type="secondary" className={styles.description}>
						{t("settings.personalization.userPrompt.description")}
					</Typography.Text>
				</div>

				{errorMessage !== null ? (
					<Alert
						type="warning"
						showIcon={true}
						description={errorMessage}
						action={(
							<Button
								size="small"
								type="text"
								icon={<Icon name="close" />}
								onClick={(): void => setErrorMessage(null)}
							/>
						)}
					/>
				) : null}

				{isLoading ? (
					<div className={styles.loading}>
						<Spin />
					</div>
				) : (
					<>
						<Input.TextArea
							className={styles.textarea}
							value={draftPrompt}
							autoSize={{ minRows: 6, maxRows: 14 }}
							maxLength={20000}
							showCount={true}
							onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
								setDraftPrompt(event.target.value);
							}}
						/>

						<div className={styles.header}>
							<Typography.Title level={4} className={styles.title}>
								{t("settings.personalization.gitCommitPrompt.title")}
							</Typography.Title>
							<Typography.Text type="secondary" className={styles.description}>
								{t("settings.personalization.gitCommitPrompt.description")}
							</Typography.Text>
						</div>

						<Input.TextArea
							className={styles.textarea}
							value={draftGitCommitPrompt}
							autoSize={{ minRows: 6, maxRows: 14 }}
							maxLength={20000}
							showCount={true}
							onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
								setDraftGitCommitPrompt(event.target.value);
							}}
						/>

						<div className={styles.header}>
							<Typography.Title level={4} className={styles.title}>
								{t("settings.personalization.commandReviewPrompt.title")}
							</Typography.Title>
							<Typography.Text type="secondary" className={styles.description}>
								{t("settings.personalization.commandReviewPrompt.description")}
							</Typography.Text>
						</div>

						<Input.TextArea
							className={styles.textarea}
							value={draftCommandReviewPrompt}
							autoSize={{ minRows: 6, maxRows: 14 }}
							maxLength={20000}
							showCount={true}
							placeholder={t("settings.personalization.commandReviewPrompt.placeholder")}
							onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
								setDraftCommandReviewPrompt(event.target.value);
							}}
						/>

						<div className={styles.footer}>
							<Button disabled={!isDirty || isSaving} onClick={handleCancel}>
								{t("settings.common.cancel")}
							</Button>
							<Button type="primary" disabled={!isDirty} loading={isSaving} onClick={(): void => void handleSave()}>
								{t("settings.common.save")}
							</Button>
						</div>
					</>
				)}
			</article>
		</section>
	);
}

export default PersonalizationSettingsPage;
