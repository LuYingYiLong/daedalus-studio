import { Input, Modal, Typography } from "antd";

export type FullTrustConfirmationModalProps = {
	open: boolean;
	value: string;
	token: string;
	loading: boolean;
	title: string;
	enableLabel: string;
	cancelLabel: string;
	description: string;
	confirmationPrefix: string;
	confirmationSuffix: string;
	onChange: (value: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
	onInvalidConfirmation?: (token: string) => void;
};

function FullTrustConfirmationModal({
	open,
	value,
	token,
	loading,
	title,
	enableLabel,
	cancelLabel,
	description,
	confirmationPrefix,
	confirmationSuffix,
	onChange,
	onConfirm,
	onCancel,
	onInvalidConfirmation,
}: FullTrustConfirmationModalProps): React.JSX.Element {
	return (
		<Modal
			open={open}
			title={title}
			okText={enableLabel}
			cancelText={cancelLabel}
			okButtonProps={{ danger: true, disabled: value !== token }}
			confirmLoading={loading}
			onOk={onConfirm}
			onCancel={onCancel}
		>
			<Typography.Paragraph>{description}</Typography.Paragraph>
			<Typography.Paragraph type="secondary">
				{confirmationPrefix}{" "}
				<Typography.Text code>{token}</Typography.Text>{" "}
				{confirmationSuffix}
			</Typography.Paragraph>
			<Input
				value={value}
				placeholder={token}
				disabled={loading}
				onChange={(event): void => onChange(event.target.value)}
				onPressEnter={(): void => {
					if (value !== token) onInvalidConfirmation?.(token);
				}}
			/>
		</Modal>
	);
}

export default FullTrustConfirmationModal;
