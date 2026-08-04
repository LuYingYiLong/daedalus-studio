import { Form, Input, Modal, Typography } from "antd";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export type GitDiffReviewCommentTarget = {
	path: string;
	oldLine?: number;
	newLine?: number;
	lineText: string;
};

export type GitDiffReviewCommentDialogProps = {
	target: GitDiffReviewCommentTarget | null;
	onCancel: () => void;
	onSubmit: (comment: string) => void;
};

type CommentFormValues = {
	comment: string;
};

function GitDiffReviewCommentDialog({ target, onCancel, onSubmit }: GitDiffReviewCommentDialogProps): React.JSX.Element {
	const { t } = useTranslation();
	const [form] = Form.useForm<CommentFormValues>();

	useEffect((): void => {
		if (target === null) {
			return;
		}
		form.resetFields();
	}, [form, target]);

	return (
		<Modal
			open={target !== null}
			title={t("review.commentDialog.title")}
			okText={t("review.commentDialog.submit")}
			cancelText={t("chat.user.actions.cancel")}
			forceRender
			destroyOnHidden
			onCancel={onCancel}
			onOk={(): void => {
				void form.validateFields().then((values: CommentFormValues): void => {
					onSubmit(values.comment.trim());
				});
			}}
		>
			{target !== null ? (
				<>
					<Typography.Paragraph type="secondary">
						{t("review.commentDialog.target", {
							path: target.path,
							line: target.newLine ?? target.oldLine ?? 0
						})}
					</Typography.Paragraph>
					<Typography.Paragraph code={true} ellipsis={{ rows: 2 }}>
						{target.lineText}
					</Typography.Paragraph>
				</>
			) : null}
			<Form form={form} preserve={false} layout="vertical">
				<Form.Item
					name="comment"
					label={t("review.commentDialog.label")}
					rules={[{ required: true, whitespace: true, message: t("review.commentDialog.required") }]}
				>
					<Input.TextArea autoFocus={true} autoSize={{ minRows: 3, maxRows: 8 }} maxLength={1200} />
				</Form.Item>
			</Form>
		</Modal>
	);
}

export default GitDiffReviewCommentDialog;
