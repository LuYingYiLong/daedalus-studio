import type { ChatMode } from "@/platform/rpc/chat-api";
import type { MessageQueueItem } from "@/platform/rpc/types";
import type { HomePageActionProps } from "./home-page-view-model";

export type HomePageComposerActionParams = {
	handleComposerCancel: () => Promise<void>;
	handleComposerSubmit: (
		message: string,
		modeOverride?: ChatMode,
	) => Promise<void>;
	handleGuideSubmit: (message: string) => Promise<void>;
	handleQueueMessageRemove: (queueId: number) => Promise<void>;
	handleQueueMessageEdit: (item: MessageQueueItem) => Promise<void>;
	handleQueueMessageReorder: (queueIds: number[]) => Promise<void>;
	handleGuideDelete: (guideId: string) => Promise<void>;
	handleGuideReorder: (guideIds: string[]) => Promise<void>;
};

export type HomePageComposerActions = Pick<
	HomePageActionProps,
	| "onCancel"
	| "onSubmit"
	| "onGuideSubmit"
	| "onQueueMessageRemove"
	| "onQueueMessageEdit"
	| "onQueueMessageReorder"
	| "onGuideDelete"
	| "onGuideReorder"
>;

export function createHomePageComposerActions({
	handleComposerCancel,
	handleComposerSubmit,
	handleGuideSubmit,
	handleQueueMessageRemove,
	handleQueueMessageEdit,
	handleQueueMessageReorder,
	handleGuideDelete,
	handleGuideReorder,
}: HomePageComposerActionParams): HomePageComposerActions {
	return {
		onCancel: (): void => {
			void handleComposerCancel();
		},
		onSubmit: (message: string, modeOverride?: ChatMode): void => {
			void handleComposerSubmit(message, modeOverride);
		},
		onGuideSubmit: (message: string): void => {
			void handleGuideSubmit(message);
		},
		onQueueMessageRemove: (queueId: number): void => {
			void handleQueueMessageRemove(queueId);
		},
		onQueueMessageEdit: (item: MessageQueueItem): void => {
			void handleQueueMessageEdit(item);
		},
		onQueueMessageReorder: (queueIds: number[]): void => {
			void handleQueueMessageReorder(queueIds);
		},
		onGuideDelete: (guideId: string): void => {
			void handleGuideDelete(guideId);
		},
		onGuideReorder: (guideIds: string[]): void => {
			void handleGuideReorder(guideIds);
		},
	};
}
