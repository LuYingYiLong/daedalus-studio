import { Button, Empty, Input, Modal, Spin } from "antd";
import { useTranslation } from "react-i18next";
import BranchActionDialog from "@/widgets/git/BranchActionDialog";
import CommitActionDialog from "@/widgets/git/CommitActionDialog";
import CreateBranchDialog from "@/widgets/git/CreateBranchDialog";
import SessionPlansDialog from "./SessionPlansDialog";
import SessionPlanPreviewDialog from "./SessionPlanPreviewDialog";
import SessionSourcesDialog from "./SessionSourcesDialog";
import SessionSourcePreviewDialog from "./SessionSourcePreviewDialog";
import type {
	GodotSceneFile,
	HomePageSummaryController,
} from "./useHomePageSummaryController";
import styles from "../HomePage.module.css";
import { Icon } from "@/assets/icons";

export type HomePageDialogsProps = {
	summaryController: HomePageSummaryController;
};

function HomePageDialogs({
	summaryController,
}: HomePageDialogsProps): React.JSX.Element {
	const { t } = useTranslation();
	const {
		plansModalOpen,
		plansDialogOverview,
		isPlansDialogLoading,
		plansDialogError,
		setPlansModalOpen,
		openPlanPreview,
		previewPlan,
		isPlanPreviewLoading,
		planPreviewError,
		closePlanPreview,
		sourcesModalOpen,
		sourcesDialogOverview,
		isSourcesDialogLoading,
		sourcesDialogError,
		closeSourcesModal,
		previewSource,
		setPreviewSource,
		closeGodotSceneModal,
		isGodotSceneModalOpen,
		filteredGodotSceneFiles,
		isGodotSceneLoading,
		godotSceneSearch,
		setGodotSceneSearch,
		runGodotScene,
		gitActions,
	} = summaryController;

	return (
		<>
			<SessionPlansDialog
				overview={plansDialogOverview}
				open={plansModalOpen}
				loading={isPlansDialogLoading}
				error={plansDialogError}
				onClose={(): void => setPlansModalOpen(false)}
				onPlanSelect={openPlanPreview}
			/>
			<SessionPlanPreviewDialog
				plan={previewPlan}
				loading={isPlanPreviewLoading}
				error={planPreviewError}
				onClose={closePlanPreview}
			/>
			<SessionSourcesDialog
				overview={sourcesDialogOverview}
				open={sourcesModalOpen}
				loading={isSourcesDialogLoading}
				error={sourcesDialogError}
				onClose={closeSourcesModal}
				onSourceSelect={setPreviewSource}
			/>
			<SessionSourcePreviewDialog
				source={previewSource}
				onClose={(): void => setPreviewSource(null)}
			/>
			<Modal
				open={isGodotSceneModalOpen}
				title={t("agentPage.summary.godot.sceneModal.title")}
				footer={null}
				width={720}
				onCancel={closeGodotSceneModal}
			>
				<div className={styles.godotSceneModalBody}>
					<Input
						allowClear
						prefix={<Icon name="search" />}
						value={godotSceneSearch}
						placeholder={t(
							"agentPage.summary.godot.sceneModal.searchPlaceholder",
						)}
						onChange={(
							event: React.ChangeEvent<HTMLInputElement>,
						): void => {
							setGodotSceneSearch(event.target.value);
						}}
					/>
					{isGodotSceneLoading ? (
						<div className={styles.godotSceneLoading}>
							<Spin />
						</div>
					) : filteredGodotSceneFiles.length > 0 ? (
						<div className={styles.godotSceneList}>
							{filteredGodotSceneFiles.map(
								(scene: GodotSceneFile): React.ReactNode => (
									<Button
										key={scene.relativePath}
										type="text"
										block
										className={styles.godotSceneButton}
										onClick={(): void =>
											runGodotScene(scene)
										}
									>
										<span className={styles.godotSceneText}>
											<span
												className={
													styles.summaryItemTitle
												}
											>
												{scene.name}
											</span>
											<span
												className={styles.summaryMeta}
											>
												{scene.resourcePath}
											</span>
										</span>
									</Button>
								),
							)}
						</div>
					) : (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={t(
								"agentPage.summary.godot.sceneModal.empty",
							)}
						/>
					)}
				</div>
			</Modal>
			<CommitActionDialog {...gitActions.commitDialogProps} />
			<BranchActionDialog {...gitActions.branchDialogProps} />
			<CreateBranchDialog {...gitActions.createBranchDialogProps} />
		</>
	);
}

export default HomePageDialogs;
