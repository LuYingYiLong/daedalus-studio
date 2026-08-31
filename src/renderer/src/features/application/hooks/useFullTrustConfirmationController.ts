import { useCallback, useState } from "react";
import type { ApprovalMode } from "@/platform/rpc/approval-api";

export type FullTrustConfirmationControllerParams = {
	confirmationToken: string;
	isSaving: boolean;
	saveApprovalMode: (
		nextMode: ApprovalMode,
		confirmationText?: string,
	) => Promise<boolean>;
	onInvalidConfirmation: (confirmationToken: string) => void;
};

export type FullTrustConfirmationController = {
	isOpen: boolean;
	confirmationText: string;
	open: () => void;
	confirm: () => Promise<void>;
	cancel: () => void;
	setConfirmationText: (value: string) => void;
};

export default function useFullTrustConfirmationController({
	confirmationToken,
	isSaving,
	saveApprovalMode,
	onInvalidConfirmation,
}: FullTrustConfirmationControllerParams): FullTrustConfirmationController {
	const [isOpen, setIsOpen] = useState<boolean>(false);
	const [confirmationText, setConfirmationText] = useState<string>("");

	const open = useCallback((): void => {
		setConfirmationText("");
		setIsOpen(true);
	}, []);

	const confirm = useCallback(async (): Promise<void> => {
		if (confirmationText !== confirmationToken) {
			onInvalidConfirmation(confirmationToken);
			return;
		}

		const didSave: boolean = await saveApprovalMode(
			"full-trust",
			confirmationText,
		);
		if (didSave) {
			setIsOpen(false);
			setConfirmationText("");
		}
	}, [confirmationText, confirmationToken, onInvalidConfirmation, saveApprovalMode]);

	const cancel = useCallback((): void => {
		if (isSaving) {
			return;
		}
		setIsOpen(false);
		setConfirmationText("");
	}, [isSaving]);

	return {
		isOpen,
		confirmationText,
		open,
		confirm,
		cancel,
		setConfirmationText,
	};
}
