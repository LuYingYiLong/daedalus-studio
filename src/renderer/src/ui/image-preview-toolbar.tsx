import { Image } from "antd";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { Icon } from "@/assets/icons";

type PreviewConfig = Exclude<React.ComponentProps<typeof Image.PreviewGroup>["preview"], boolean | undefined>;

type PreviewActionsRenderInfo = Parameters<NonNullable<PreviewConfig["actionsRender"]>>[1];

export type ImagePreviewActionsRender = (
	originalNode: React.ReactElement,
	info: Omit<PreviewActionsRenderInfo, "current" | "total"> &
		Partial<Pick<PreviewActionsRenderInfo, "current" | "total">>,
) => React.ReactNode;

function replaceToolbarIcon(button: ReactNode, icon: ReactNode): ReactNode {
	if (!isValidElement(button)) {
		return button;
	}
	return cloneElement(button, {}, icon);
}

export const imagePreviewCloseIcon: React.JSX.Element = <Icon name="close" />;

export const renderImagePreviewToolbar: ImagePreviewActionsRender = (originalNode, info): React.ReactNode => {
	return cloneElement(originalNode, {}, [
		replaceToolbarIcon(info.icons.flipYIcon, <Icon name="flip-y" />),
		replaceToolbarIcon(info.icons.flipXIcon, <Icon name="flip-x" />),
		replaceToolbarIcon(info.icons.rotateLeftIcon, <Icon name="rotate-left" />),
		replaceToolbarIcon(info.icons.rotateRightIcon, <Icon name="rotate-right" />),
		replaceToolbarIcon(info.icons.zoomOutIcon, <Icon name="zoom-out" />),
		replaceToolbarIcon(info.icons.zoomInIcon, <Icon name="zoom-in" />),
	]);
};
