import { Modal, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { WorkspaceConfig } from "@/api/types";

export type DeleteWorkspaceDialogProps = {
	open: boolean;
	workspace: WorkspaceConfig | null;
	loading: boolean;
	onConfirm: () => void;
	onCancel: () => void;
};

export default function DeleteWorkspaceDialog({
	open,
	workspace,
	loading,
	onConfirm,
	onCancel
}: DeleteWorkspaceDialogProps): React.JSX.Element {
	const { t } = useTranslation();

	return (
		<Modal
			title={t("workspaceTree.modals.deleteWorkspace.title")}
			open={open}
			okText={t("workspaceTree.actions.delete")}
			cancelText={t("workspaceTree.projectEditor.cancel")}
			okButtonProps={{ danger: true }}
			confirmLoading={loading}
			onOk={onConfirm}
			onCancel={onCancel}
		>
			<Typography.Paragraph>
				{t("workspaceTree.modals.deleteWorkspace.body", { workspaceName: workspace?.name ?? "" })}
			</Typography.Paragraph>
			<Typography.Text type="secondary">
				{t("workspaceTree.modals.deleteWorkspace.sessionPolicy", {
					defaultValue: "Sessions are moved to another matching project when possible. Unmatched sessions are permanently deleted."
				})}
			</Typography.Text>
		</Modal>
	);
}
