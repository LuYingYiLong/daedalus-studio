import { App, Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/platform/electron/clipboard";
import { FileIcon } from "./file-icon";
import { useMarkdownResourceActions, type MarkdownWorkspaceLaunchTargetId } from "./markdown-resource-actions";
import { formatMarkdownResourceLabel, parseMarkdownResourceHref, type MarkdownResourceRef } from "@/domain/markdown/markdown-resource-path";
import styles from "./MarkdownResourceLink.module.css";

type MarkdownResourceLinkProps = {
	resource: MarkdownResourceRef;
	href: string;
	children: React.ReactNode;
	className?: string;
};

function getLaunchTargetIcon(targetId: MarkdownWorkspaceLaunchTargetId): React.JSX.Element {
	if (targetId === "file-explorer") {
		return <Icon name="folder" />;
	}
	if (targetId === "terminal") {
		return <Icon name="terminal" />;
	}
	if (targetId === "git-bash") {
		return <Icon name="git-bash" />;
	}
	if (targetId === "godot") {
		return <Icon name="godot" />;
	}
	return <Icon name="external-link" />;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error && error.message.trim().length > 0 ? error.message : "Unknown error";
}

function WorkspaceResourceLink({ resource, href, children, className }: MarkdownResourceLinkProps): React.JSX.Element {
	const { message } = App.useApp();
	const { t } = useTranslation();
	const actions = useMarkdownResourceActions();
	const [menuOpen, setMenuOpen] = useState<boolean>(false);
	const hasWorkspace: boolean = actions?.workspaceRoot !== null && actions?.workspaceRoot !== undefined;
	const resourceLabel: React.ReactNode = typeof children === "string"
		? formatMarkdownResourceLabel(resource, children)
		: children;

	async function runAction(action: () => Promise<void>): Promise<void> {
		try {
			await action();
		} catch (error: unknown) {
			console.error("[MarkdownResourceLink] action failed", error);
			message.error(getErrorMessage(error));
		}
	}

	function workspaceFileParams(): { workspaceRoot: string; filePath: string } | null {
		if (!hasWorkspace || actions?.workspaceRoot === null || actions?.workspaceRoot === undefined) {
			message.warning(t("chat.markdownResource.noWorkspace"));
			return null;
		}
		return { workspaceRoot: actions.workspaceRoot, filePath: resource.absolutePath };
	}

	function openFile(): Promise<void> {
		return runAction(async (): Promise<void> => {
			const params = workspaceFileParams();
			if (params !== null) {
				await window.electronAPI.workspaceFs.openFile(params);
			}
		});
	}

	function openInTarget(targetId: MarkdownWorkspaceLaunchTargetId): Promise<void> {
		return runAction(async (): Promise<void> => {
			const params = workspaceFileParams();
			if (params === null) {
				return;
			}
			await window.electronAPI.workspaceFs.openLaunchTarget({
				...params,
				targetId,
				godotExecutablePath: targetId === "godot" ? actions?.godotExecutablePath : undefined
			});
		});
	}

	function saveAs(): Promise<void> {
		return runAction(async (): Promise<void> => {
			const params = workspaceFileParams();
			if (params !== null) {
				const result = await window.electronAPI.workspaceFs.saveFileAs(params);
				if (result.saved) {
					message.success(t("chat.markdownResource.savedAs"));
				}
			}
		});
	}

	function revealInExplorer(): Promise<void> {
		return runAction(async (): Promise<void> => {
			const params = workspaceFileParams();
			if (params !== null) {
				await window.electronAPI.workspaceFs.revealFile(params);
			}
		});
	}

	const targetItems: NonNullable<MenuProps["items"]> = (actions?.launchTargets ?? []).map((target) => ({
		key: `open-with:${target.id}`,
		icon: getLaunchTargetIcon(target.id),
		label: target.label,
		disabled: !hasWorkspace
	}));
	const menuItems: MenuProps["items"] = useMemo((): MenuProps["items"] => [
		{
			key: "open-file",
			icon: <Icon name="file" />,
			label: t("chat.markdownResource.openFile"),
			disabled: !hasWorkspace
		},
		{
			key: "open-current",
			icon: actions?.currentWorkspaceLaunch === null || actions?.currentWorkspaceLaunch === undefined
				? <Icon name="external-link" />
				: getLaunchTargetIcon(actions.currentWorkspaceLaunch.id),
			label: actions?.currentWorkspaceLaunch === null || actions?.currentWorkspaceLaunch === undefined
				? t("chat.markdownResource.openInCurrentTarget")
				: t("chat.markdownResource.openInCurrentTargetNamed", { target: actions.currentWorkspaceLaunch.label }),
			disabled: !hasWorkspace || actions?.currentWorkspaceLaunch === null || actions?.currentWorkspaceLaunch === undefined
		},
		{
			key: "open-with",
			icon: <Icon name="external-link" />,
			label: t("chat.markdownResource.openWith"),
			disabled: !hasWorkspace || targetItems.length === 0,
			children: targetItems
		},
		{ type: "divider" },
		{
			key: "save-as",
			icon: <Icon name="download" />,
			label: t("chat.markdownResource.saveAs"),
			disabled: !hasWorkspace
		},
		{
			key: "copy-path",
			icon: <Icon name="copy" />,
			label: t("chat.markdownResource.copyPath")
		},
		{
			key: "reveal-file",
			icon: <Icon name="folder" />,
			label: t("chat.markdownResource.revealInExplorer"),
			disabled: !hasWorkspace
		}
	], [actions, hasWorkspace, t, targetItems.length]);

	const handleMenuClick: MenuProps["onClick"] = ({ key }): void => {
		setMenuOpen(false);
		const menuKey: string = String(key);
		if (menuKey === "open-file") {
			void openFile();
			return;
		}
		if (menuKey === "open-current" && actions?.currentWorkspaceLaunch !== null && actions?.currentWorkspaceLaunch !== undefined) {
			void openInTarget(actions.currentWorkspaceLaunch.id);
			return;
		}
		if (menuKey.startsWith("open-with:")) {
			void openInTarget(menuKey.slice("open-with:".length) as MarkdownWorkspaceLaunchTargetId);
			return;
		}
		if (menuKey === "save-as") {
			void saveAs();
			return;
		}
		if (menuKey === "copy-path") {
			void copyTextToClipboard(resource.absolutePath).then((): void => {
				message.success(t("chat.markdownResource.pathCopied"));
			}).catch((error: unknown): void => {
				console.error("[MarkdownResourceLink] copy path failed", error);
				message.error(getErrorMessage(error));
			});
			return;
		}
		if (menuKey === "reveal-file") {
			void revealInExplorer();
		}
	};

	return (
		<Dropdown
			trigger={["contextMenu"]}
			open={menuOpen}
			onOpenChange={setMenuOpen}
			menu={{ items: menuItems, onClick: handleMenuClick }}
		>
			<Tooltip title={resource.displayPath}>
				<a
					className={[styles.resourceLink, className].filter(Boolean).join(" ")}
					href={href}
					onClick={(event): void => {
						event.preventDefault();
						void openFile();
					}}
					onKeyDown={(event): void => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							void openFile();
						}
					}}
				>
					<FileIcon path={resource.displayPath} className={styles.resourceIcon} />
					<span className={styles.resourceLabel}>{resourceLabel}</span>
				</a>
			</Tooltip>
		</Dropdown>
	);
}

export function MarkdownLink({ href, children, node: _node, ...props }: React.ComponentProps<"a"> & { node?: unknown }): React.JSX.Element {
	const resource: MarkdownResourceRef | null = parseMarkdownResourceHref(href);
	if (resource === null || href === undefined) {
		return <a href={href} {...props}>{children}</a>;
	}

	return <WorkspaceResourceLink resource={resource} href={href} className={props.className}>{children}</WorkspaceResourceLink>;
}
