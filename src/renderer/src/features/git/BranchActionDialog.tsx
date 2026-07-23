import type { ChangeEvent, JSX, KeyboardEvent } from "react";
import { Alert, Button, Empty, Input, Modal, Spin, Tag, Typography } from "antd";
import type { WorkspaceGitBranchItem } from "@/api/workspace-git-api";
import { Icon } from "@/assets/icons";
import styles from "./GitActionDialog.module.css";

export type BranchActionDialogProps = {
	open: boolean;
	branches: WorkspaceGitBranchItem[];
	branchSearch: string;
	selectedBranchName: string | null;
	isBranchesLoading: boolean;
	branchOperation: "checkout" | "create" | null;
	errorMessage: string | null;
	hasWorkspace: boolean;
	onClose: () => void;
	onCreateBranchOpen: () => void;
	onRefresh: () => void;
	onSearchChange: (search: string) => void;
	onBranchSelect: (branchName: string) => void;
	onBranchCheckout: (branchName?: string) => void;
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
	hasWorkspace,
	onClose,
	onCreateBranchOpen,
	onRefresh,
	onSearchChange,
	onBranchSelect,
	onBranchCheckout
}: BranchActionDialogProps): JSX.Element {
	const isBranchOperationRunning: boolean = branchOperation !== null;
	const visibleBranches: WorkspaceGitBranchItem[] = filterBranches(branches, branchSearch);

	return (
		<Modal
			title="Branch"
			open={open}
			onCancel={onClose}
			footer={null}
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
						placeholder="Search branch"
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
						Refresh
					</Button>
					<Button
						type="primary"
						icon={<Icon name="add" />}
						disabled={isBranchOperationRunning || !hasWorkspace}
						onClick={onCreateBranchOpen}
					>
						Create & Checkout
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
										{branch.current ? <Tag color="success">Current</Tag> : null}
										{branch.remote ? <Tag>Remote</Tag> : null}
									</span>
									<span className={styles.branchItemMeta}>
										{branch.upstream ?? branch.lastCommit ?? branch.fullName}
									</span>
								</span>
								<Button
									size="small"
									type={branch.name === selectedBranchName ? "primary" : "default"}
									disabled={!hasWorkspace || branch.current || isBranchesLoading || isBranchOperationRunning}
									loading={branchOperation === "checkout" && branch.name === selectedBranchName}
									onClick={(event): void => {
										event.stopPropagation();
										onBranchCheckout(branch.name);
									}}
								>
									Checkout
								</Button>
							</div>
						))
					) : (
						<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No branches found" />
					)}
				</div>
			</div>
		</Modal>
	);
}

export default BranchActionDialog;
