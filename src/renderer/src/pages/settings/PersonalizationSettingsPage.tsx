import { Alert, Button, Input, Spin, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Icon } from "@/assets/icons";
import { fetchUserPromptConfig, saveUserPrompt, type UserPromptConfig } from "@/api/user-prompt-api";
import styles from "./PersonalizationSettingsPage.module.css";

function PersonalizationSettingsPage(): React.JSX.Element {
	const [savedPrompt, setSavedPrompt] = useState<string>("");
	const [draftPrompt, setDraftPrompt] = useState<string>("");
	const [savedGitCommitPrompt, setSavedGitCommitPrompt] = useState<string>("");
	const [draftGitCommitPrompt, setDraftGitCommitPrompt] = useState<string>("");
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
				setUpdatedAt(config.updatedAt);
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : "Failed to load personalization settings");
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
	}, []);

	const isDirty: boolean = useMemo((): boolean => {
		return draftPrompt !== savedPrompt || draftGitCommitPrompt !== savedGitCommitPrompt;
	}, [draftGitCommitPrompt, draftPrompt, savedGitCommitPrompt, savedPrompt]);

	async function handleSave(): Promise<void> {
		try {
			setIsSaving(true);
			setErrorMessage(null);
			const config: UserPromptConfig = await saveUserPrompt({
				prompt: draftPrompt,
				gitCommitPrompt: draftGitCommitPrompt
			});

			setSavedPrompt(config.prompt);
			setDraftPrompt(config.prompt);
			setSavedGitCommitPrompt(config.gitCommitPrompt);
			setDraftGitCommitPrompt(config.gitCommitPrompt);
			setUpdatedAt(config.updatedAt);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to save personalization settings");
		} finally {
			setIsSaving(false);
		}
	}

	function handleCancel(): void {
		setDraftPrompt(savedPrompt);
		setDraftGitCommitPrompt(savedGitCommitPrompt);
		setErrorMessage(null);
	}

	return (
		<section className={styles.page}>
			<article className={styles.card}>
				<div className={styles.header}>
					<Typography.Title level={4} className={styles.title}>
						User prompt
					</Typography.Title>
					<Typography.Text type="secondary" className={styles.description}>
						Custom instructions appended to new AI requests.
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
							autoSize={{ minRows: 8, maxRows: 18 }}
							maxLength={20000}
							showCount={true}
							onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
								setDraftPrompt(event.target.value);
							}}
						/>

						<div className={styles.header}>
							<Typography.Title level={4} className={styles.title}>
								Git commit prompt
							</Typography.Title>
							<Typography.Text type="secondary" className={styles.description}>
								Custom instructions used only when generating commit messages.
							</Typography.Text>
						</div>

						<Input.TextArea
							className={styles.textarea}
							value={draftGitCommitPrompt}
							autoSize={{ minRows: 8, maxRows: 18 }}
							maxLength={20000}
							showCount={true}
							onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
								setDraftGitCommitPrompt(event.target.value);
							}}
						/>

						<div className={styles.footer}>
							<Button disabled={!isDirty || isSaving} onClick={handleCancel}>
								Cancel
							</Button>
							<Button type="primary" disabled={!isDirty} loading={isSaving} onClick={(): void => void handleSave()}>
								Save
							</Button>
						</div>
					</>
				)}
			</article>
		</section>
	);
}

export default PersonalizationSettingsPage;
