import type { ChangeEvent, JSX } from "react";
import { Alert, Button, Empty, Input, Menu, Modal, Spin, Typography } from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import type { WorkspaceGitBranchItem } from "@/platform/rpc/workspace-git-api";
import type { WorkspaceGitDiffFileSummary } from "@/platform/rpc/workspace-git-diff-api";
import type { BranchActionDialogProps } from "@/features/git/dialog-types";
import { Icon } from "@/assets/icons";
import styles from "./GitActionDialog.module.css";

function filterBranches(branches: WorkspaceGitBranchItem[], search: string): WorkspaceGitBranchItem[] {
	const normalizedSearch: string = search.trim().toLowerCase();
	return branches.filter((branch: WorkspaceGitBranchItem): boolean => {
		if (branch.remote) {
			return false;
		}
		if (normalizedSearch.length === 0) {
			return true;
		}
		return branch.name.toLowerCase().includes(normalizedSearch)
			|| branch.fullName.toLowerCase().includes(normalizedSearch);
	});
}

function BranchActionDialog({
	open,
	branches,
	branchSearch,
	selectedBranchName,
	isBranchesLoading,
	branchOperation,
	errorMessage,
	checkoutDraft,
	checkoutCommitMessage,
	checkoutDraftError,
	isCheckoutDraftCommitting,
	hasWorkspace,
	onClose,
	onCreateBranchOpen,
	onRefresh,
	onSearchChange,
	onBranchCheckout,
	onCheckoutCommitMessageChange,
	onCheckoutDraftCancel,
	onCheckoutDraftCommit
}: BranchActionDialogProps): JSX.Element {
	const { t } = useTranslation();
	const isBranchOperationRunning: boolean = branchOperation !== null;
	const visibleBranches: WorkspaceGitBranchItem[] = filterBranches(branches, branchSearch);
	const branchMenuItems: MenuProps["items"] = visibleBranches.map((branch: WorkspaceGitBranchItem): NonNullable<MenuProps["items"]>[number] => ({
		key: branch.name,
		icon: branchOperation === "checkout" && branch.name === selectedBranchName
			? <Spin size="small" />
			: <Icon name="git-branch" />,
		label: branch.name,
		disabled: !hasWorkspace || isBranchesLoading || isBranchOperationRunning
	}));

	const hiddenDraftFileCount: number = Math.max(0, (checkoutDraft?.changedFiles ?? 0) - (checkoutDraft?.files.length ?? 0));
	const canCommitDraft: boolean = checkoutCommitMessage.trim().length > 0 && !isCheckoutDraftCommitting;

	return (
		<>
			<Modal
			title={t("git.branch.title")}
			open={open}
			onCancel={onClose}
			footer={null}
			className={styles.modal}
		>
			<div className={styles.branchDialogBody}>
				{errorMessage !== null ? (
					<Alert type="error" showIcon={true} description={errorMessage} />
				) : null}
				<div className={styles.branchToolbar}>
					<Input
						allowClear={true}
						value={branchSearch}
						prefix={<Icon name="search" />}
						placeholder={t("git.branch.searchPlaceholder")}
						className={styles.searchBox}
						disabled={isBranchesLoading || isBranchOperationRunning}
						onChange={(event: ChangeEvent<HTMLInputElement>): void => {
							onSearchChange(event.target.value);
						}}
					/>
					<Button
						icon={<Icon name="reload" />}
						disabled={isBranchOperationRunning || !hasWorkspace}
						loading={isBranchesLoading}
						onClick={onRefresh}
					>
						{t("git.actions.refresh")}
					</Button>
					<Button
						type="primary"
						icon={<Icon name="add" />}
						disabled={isBranchOperationRunning || !hasWorkspace}
						onClick={onCreateBranchOpen}
					>
						{t("git.branch.actions.createAndCheckout")}
					</Button>
				</div>
				<div className={styles.branchMenuViewport}>
					{isBranchesLoading ? (
						<div className={styles.branchLoading}>
							<Spin size="small" />
						</div>
					) : visibleBranches.length > 0 ? (
						<Menu
							className="daedalus-compact-menu"
							mode="inline"
							inlineIndent={8}
							items={branchMenuItems}
							selectedKeys={selectedBranchName === null ? [] : [selectedBranchName]}
							onClick={({ key }): void => {
								const branch: WorkspaceGitBranchItem | undefined = visibleBranches.find((item: WorkspaceGitBranchItem): boolean => item.name === key);
								if (branch === undefined || branch.current || isBranchOperationRunning) {
									return;
								}
								onBranchCheckout(branch.name);
							}}
						/>
					) : (
						<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("git.branch.empty")} />
					)}
				</div>
			</div>
			</Modal>
			<Modal
				title={t("git.branch.checkoutDraft.title")}
				open={checkoutDraft !== null}
				destroyOnHidden={true}
				mask={{ closable: !isCheckoutDraftCommitting }}
				closable={!isCheckoutDraftCommitting}
				keyboard={!isCheckoutDraftCommitting}
				okText={t("git.branch.checkoutDraft.commitAndCheckout")}
				cancelText={t("git.branch.checkoutDraft.cancel")}
				confirmLoading={isCheckoutDraftCommitting}
				okButtonProps={{ disabled: !canCommitDraft }}
				onCancel={onCheckoutDraftCancel}
				onOk={onCheckoutDraftCommit}
				className={styles.modal}
			>
				<div className={styles.checkoutDraftBody}>
					<Typography.Paragraph type="secondary" className={styles.checkoutDraftDescription}>
						{t("git.branch.checkoutDraft.description", { branch: checkoutDraft?.branchName ?? "" })}
					</Typography.Paragraph>
					{checkoutDraftError !== null ? <Alert type="error" showIcon={true} description={checkoutDraftError} /> : null}
					<div className={styles.checkoutDraftFiles}>
						{checkoutDraft?.files.map((file: WorkspaceGitDiffFileSummary): JSX.Element => (
							<div key={`${file.oldPath ?? ""}:${file.path}`} className={styles.checkoutDraftFile}>
								<Typography.Text ellipsis={{ tooltip: file.path }} className={styles.checkoutDraftPath}>
									{file.path}
								</Typography.Text>
								<span className={styles.checkoutDraftStats}>
									<span className={styles.additions}>+{file.additions ?? 0}</span>
									<span className={styles.deletions}>-{file.deletions ?? 0}</span>
								</span>
							</div>
						))}
						{hiddenDraftFileCount > 0 ? (
							<Typography.Text type="secondary" className={styles.checkoutDraftMore}>
								{t("git.branch.checkoutDraft.moreFiles", { count: hiddenDraftFileCount })}
							</Typography.Text>
						) : null}
					</div>
					<div className={styles.checkoutDraftSummary}>
						<span>{t("git.branch.checkoutDraft.summary", { count: checkoutDraft?.changedFiles ?? 0 })}</span>
						<span className={styles.checkoutDraftStats}>
							<span className={styles.additions}>+{checkoutDraft?.additions ?? 0}</span>
							<span className={styles.deletions}>-{checkoutDraft?.deletions ?? 0}</span>
						</span>
					</div>
					<Input
						value={checkoutCommitMessage}
						maxLength={20000}
						disabled={isCheckoutDraftCommitting}
						placeholder={t("git.branch.checkoutDraft.commitMessagePlaceholder")}
						onChange={(event: ChangeEvent<HTMLInputElement>): void => onCheckoutCommitMessageChange(event.target.value)}
						onPressEnter={(): void => {
							if (canCommitDraft) onCheckoutDraftCommit();
						}}
					/>
				</div>
			</Modal>
		</>
	);
}

export default BranchActionDialog;
