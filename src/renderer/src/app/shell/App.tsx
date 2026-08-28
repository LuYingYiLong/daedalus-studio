import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import HomePage from "@/widgets/home/HomePage";
import FullTrustConfirmationModal from "@/widgets/approval/FullTrustConfirmationModal";
import WorkspaceProjectDialog from "@/widgets/workspace/WorkspaceProjectDialog";
import type { WorkspaceConfig } from "@/platform/rpc/types";
import styles from "./App.module.css";
import type { BootstrapData } from "../bootstrap/bootstrap";
import useAppController from "../runtime/useAppController";
import { waitForRendererPaint } from "../runtime/renderer-paint";

type AppProps = {
	bootstrapData: BootstrapData;
	onReady?: () => void;
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

function App({ bootstrapData, onReady }: AppProps): React.JSX.Element {
	const readyReportedRef = useRef<boolean>(false);
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
		onWorkspaceProjectSaved,
	}: AppViewModel = useAppController({ bootstrapData });

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		void waitForRendererPaint().then((): void => {
			if (cancelled || readyReportedRef.current) {
				return;
			}
			readyReportedRef.current = true;
			onReady?.();
		});
		return (): void => {
			cancelled = true;
		};
	}, [onReady]);

	return (
		<main className={styles.shell}>
			{messageContextHolder}
			<FullTrustConfirmationModal
				open={fullTrustOpen}
				value={fullTrustConfirmationText}
				token={fullTrustConfirmationToken}
				loading={isApprovalModeSaving}
				title={fullTrustTitle}
				enableLabel={fullTrustEnableLabel}
				cancelLabel={fullTrustCancelLabel}
				description={fullTrustDescription}
				confirmationPrefix={fullTrustConfirmationPrefix}
				confirmationSuffix={fullTrustConfirmationSuffix}
				onChange={onFullTrustConfirmationTextChange}
				onConfirm={onFullTrustConfirm}
				onCancel={onFullTrustCancel}
				onInvalidConfirmation={fullTrustConfirmationError}
			/>
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
