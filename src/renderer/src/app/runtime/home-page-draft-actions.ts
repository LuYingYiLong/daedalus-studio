import type { Dispatch, SetStateAction } from "react";
import type { HomePageActionProps, HomePageProps } from "./home-page-view-model";

export type HomePageDraftActionParams = {
	onNewSession: HomePageProps["onNewSession"];
	setActiveRetryRequestId: Dispatch<SetStateAction<string | null>>;
};

export type HomePageDraftActions = Pick<
	HomePageActionProps,
	| "onNewUnboundSession"
	| "onRetryEditStart"
	| "onRetryEditCancel"
>;

export function createHomePageDraftActions({
	onNewSession,
	setActiveRetryRequestId,
}: HomePageDraftActionParams): HomePageDraftActions {
	return {
		onNewUnboundSession: (): void => {
			onNewSession({ restoreTemporaryDraft: false });
		},
		onRetryEditStart: (requestId: string): void => {
			setActiveRetryRequestId(requestId);
		},
		onRetryEditCancel: (requestId: string): void => {
			setActiveRetryRequestId(
				(currentRequestId: string | null): string | null =>
					(currentRequestId === requestId ? null : currentRequestId),
			);
		},
	};
}
