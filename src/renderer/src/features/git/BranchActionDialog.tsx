import type { ChangeEvent, JSX, KeyboardEvent } from "react";
import { Alert, Button, Empty, Input, Modal, Spin, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { WorkspaceGitBranchItem } from "@/api/workspace-git-api";
import type { WorkspaceGitDiffFileSummary } from "@/api/workspace-git-diff-api";
import { Icon } from "@/assets/icons";
import styles from "./GitActionDialog.module.css";

export type BranchCheckoutDraft = {
	branchName: string;
	files: WorkspaceGitDiffFileSummary[];
	changedFiles: number;
	additions: number;
	deletions: number;
};

export type BranchActionDialogProps = {
	open: boolean;
	branches: WorkspaceGitBranchItem[];
	branchSearch: string;
	selectedBranchName: string | null;
	isBranchesLoading: boolean;
	branchOperation: "checkout" | "create" | null;
	errorMessage: string | null;
	checkoutDraft: BranchCheckoutDraft | null;
	checkoutCommitMessage: string;
	checkoutDraftError: string | null;
	isCheckoutDraftCommitting: boolean;
	hasWorkspace: boolean;
	onClose: () => void;
	onCreateBranchOpen: () => void;
	onRefresh: () => void;
	onSearchChange: (search: string) => void;
	onBranchSelect: (branchName: string) => void;
	onBranchCheckout: (branchName?: string) => void;
	onCheckoutCommitMessageChange: (message: string) => void;
	onCheckoutDraftCancel: () => void;
	onCheckoutDraftCommit: () => void;
};

function filterBranches(branches: WorkspaceGitBranchItem[], search: string): WorkspaceGitBranchItem[] {
	const normalizedSearch: string = search.trim().toLowerCase();
	if (normalizedSearch.length === 0) {
		return branches;
	}

	return branches.filter((branch: WorkspaceGitBranchItem): boolean => {
		return branch.name.toLowerCase().includes(normalizedSearch)
			|| branch.fullName.toLowerCase().includes(normalizedSearch)
			|| (branch.upstream ?? "").toLowerCase().includes(normalizedSearch);
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
	onBranchSelect,
	onBranchCheckout,
	onCheckoutCommitMessageChange,
	onCheckoutDraftCancel,
	onCheckoutDraftCommit
}: BranchActionDialogProps): JSX.Element {
	const { t } = useTranslation();
	const isBranchOperationRunning: boolean = branchOperation !== null;
	const visibleBranches: WorkspaceGitBranchItem[] = filterBranches(branches, branchSearch);

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
				<div className={styles.branchList}>
					{isBranchesLoading ? (
						<div className={styles.branchLoading}>
							<Spin size="small" />
						</div>
					) : visibleBranches.length > 0 ? (
						visibleBranches.map((branch: WorkspaceGitBranchItem): JSX.Element => (
							<div
								key={branch.fullName}
								className={styles.branchItem}
								data-selected={branch.name === selectedBranchName}
								role="button"
								tabIndex={0}
								aria-selected={branch.name === selectedBranchName}
								onClick={(): void => onBranchSelect(branch.name)}
								onKeyDown={(event: KeyboardEvent<HTMLDivElement>): void => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										onBranchSelect(branch.name);
									}
								}}
							>
								<span className={styles.branchItemIcon}>
									<Icon name="git-branch" />
								</span>
								<span className={styles.branchItemMain}>
									<span className={styles.branchItemTitle}>
										<Typography.Text ellipsis={true}>{branch.name}</Typography.Text>
										{branch.current ? <Tag color="success">{t("git.branch.tags.current")}</Tag> : null}
										{branch.remote ? <Tag>{t("git.branch.tags.remote")}</Tag> : null}
									</span>
									<span className={styles.branchItemMeta}>
										{branch.upstream ?? branch.lastCommit ?? branch.fullName}
									</span>
								</span>
								<Button
									type={branch.name === selectedBranchName ? "primary" : "text"}
									disabled={!hasWorkspace || branch.current || isBranchesLoading || isBranchOperationRunning}
									loading={branchOperation === "checkout" && branch.name === selectedBranchName}
									onClick={(event): void => {
										event.stopPropagation();
										onBranchCheckout(branch.name);
									}}
								>
									{t("git.branch.actions.checkout")}
								</Button>
							</div>
						))
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
