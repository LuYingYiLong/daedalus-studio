import type { ComponentProps, ReactNode } from "react";
import { Input, Modal, Typography } from "antd";
import HomePage from "@/pages/home/HomePage";
import WorkspaceProjectDialog from "@/features/workspace/WorkspaceProjectDialog";
import type { WorkspaceConfig } from "@/api/types";
import styles from "./App.module.css";
import type { BootstrapData } from "./bootstrap";
import useAppController from "./useAppController";

type AppProps = {
	bootstrapData: BootstrapData;
};

type HomePageProps = ComponentProps<typeof HomePage>;

type AppViewModel = {
	messageContextHolder: ReactNode;
	homePageProps: HomePageProps;
	fullTrustOpen: boolean;
	fullTrustConfirmationText: string;
	isApprovalModeSaving: boolean;
	fullTrustConfirmationToken: string;
	fullTrustTitle: string;
	fullTrustEnableLabel: string;
	fullTrustCancelLabel: string;
	fullTrustDescription: string;
	fullTrustConfirmationPrefix: string;
	fullTrustConfirmationSuffix: string;
	fullTrustConfirmationError: (confirmationText: string) => void;
	onFullTrustConfirm: () => void;
	onFullTrustCancel: () => void;
	onFullTrustConfirmationTextChange: (value: string) => void;
	workspaceProjectDialogOpen: boolean;
	onWorkspaceProjectDialogCancel: () => void;
	onWorkspaceProjectSaved: (workspace: WorkspaceConfig) => void;
};

function App({ bootstrapData }: AppProps): React.JSX.Element {
	const {
		messageContextHolder,
		homePageProps,
		fullTrustOpen,
		fullTrustConfirmationText,
		isApprovalModeSaving,
		fullTrustConfirmationToken,
		fullTrustTitle,
		fullTrustEnableLabel,
		fullTrustCancelLabel,
		fullTrustDescription,
		fullTrustConfirmationPrefix,
		fullTrustConfirmationSuffix,
		fullTrustConfirmationError,
		onFullTrustConfirm,
		onFullTrustCancel,
		onFullTrustConfirmationTextChange,
		workspaceProjectDialogOpen,
		onWorkspaceProjectDialogCancel,
		onWorkspaceProjectSaved
	}: AppViewModel = useAppController({ bootstrapData });

	return (
		<main className={styles.shell}>
			{messageContextHolder}
			<Modal
				open={fullTrustOpen}
				title={fullTrustTitle}
				okText={fullTrustEnableLabel}
				cancelText={fullTrustCancelLabel}
				okButtonProps={{
					danger: true,
					disabled: fullTrustConfirmationText !== fullTrustConfirmationToken
				}}
				confirmLoading={isApprovalModeSaving}
				onOk={onFullTrustConfirm}
				onCancel={onFullTrustCancel}
			>
				<Typography.Paragraph>{fullTrustDescription}</Typography.Paragraph>
				<Typography.Paragraph type="secondary">
					{fullTrustConfirmationPrefix}{" "}
					<Typography.Text code>{fullTrustConfirmationToken}</Typography.Text>{" "}
					{fullTrustConfirmationSuffix}
				</Typography.Paragraph>
				<Input
					value={fullTrustConfirmationText}
					placeholder={fullTrustConfirmationToken}
					disabled={isApprovalModeSaving}
					onChange={(event): void => onFullTrustConfirmationTextChange(event.target.value)}
					onPressEnter={(): void => {
						if (fullTrustConfirmationText !== fullTrustConfirmationToken) {
							fullTrustConfirmationError(fullTrustConfirmationToken);
						}
					}}
				/>
			</Modal>
			<WorkspaceProjectDialog
				open={workspaceProjectDialogOpen}
				workspace={null}
				onCancel={onWorkspaceProjectDialogCancel}
				onSaved={onWorkspaceProjectSaved}
			/>
			<div className={styles.pageSurface}>
				<HomePage {...homePageProps} />
			</div>
		</main>
	);
}

export default App;
