import { useCallback, useEffect, useMemo, useState } from "react";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import { copyTextToClipboard, readTextFromClipboard } from "@/platform/electron/clipboard";

type EditableTextInput = HTMLInputElement | HTMLTextAreaElement;

type InputContextMenuState = {
	target: EditableTextInput;
	selectionStart: number;
	selectionEnd: number;
	clientX: number;
	clientY: number;
};

const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set<string>([
	"text",
	"search",
	"email",
	"password",
	"tel",
	"url",
	"number"
]);

function getEditableTextInput(target: EventTarget | null): EditableTextInput | null {
	if (!(target instanceof Element)) {
		return null;
	}

	const input: Element | null = target.closest("input, textarea");
	if (input instanceof HTMLTextAreaElement) {
		return input.disabled ? null : input;
	}
	if (!(input instanceof HTMLInputElement) || input.disabled || !TEXT_INPUT_TYPES.has(input.type)) {
		return null;
	}
	return input;
}

function setInputValue(target: EditableTextInput, value: string): void {
	const prototype: typeof HTMLInputElement.prototype | typeof HTMLTextAreaElement.prototype = target instanceof HTMLTextAreaElement
		? HTMLTextAreaElement.prototype
		: HTMLInputElement.prototype;
	const valueSetter: ((this: EditableTextInput, nextValue: string) => void) | undefined = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
	valueSetter?.call(target, value);
	target.dispatchEvent(new Event("input", { bubbles: true }));
}

function restoreSelection(target: EditableTextInput, start: number, end: number): void {
	window.requestAnimationFrame((): void => {
		if (!target.isConnected) {
			return;
		}
		target.focus({ preventScroll: true });
		target.setSelectionRange(start, end);
	});
}

function InputContextMenu(): React.JSX.Element {
	const { t } = useTranslation();
	const [contextMenu, setContextMenu] = useState<InputContextMenuState | null>(null);

	const closeContextMenu = useCallback((): void => {
		setContextMenu(null);
	}, []);

	useEffect((): (() => void) => {
		function handleContextMenu(event: MouseEvent): void {
			const input: EditableTextInput | null = getEditableTextInput(event.target);
			if (input === null || input.closest("[data-studio-input-context-menu='custom']") !== null) {
				return;
			}

			event.preventDefault();
			input.focus({ preventScroll: true });
			const selectionStart: number = input.selectionStart ?? 0;
			const selectionEnd: number = input.selectionEnd ?? selectionStart;
			setContextMenu({
				target: input,
				selectionStart,
				selectionEnd,
				clientX: event.clientX,
				clientY: event.clientY
			});
		}

		document.addEventListener("contextmenu", handleContextMenu, true);
		return (): void => {
			document.removeEventListener("contextmenu", handleContextMenu, true);
		};
	}, []);

	useEffect((): (() => void) | void => {
		const menuState: InputContextMenuState | null = contextMenu;
		if (menuState === null) {
			return;
		}
		const menuTarget: EditableTextInput = menuState.target;

		function isMenuInteraction(target: EventTarget | null): boolean {
			return target instanceof Element
				&& target.closest("[data-studio-input-context-menu-popup]") !== null;
		}

		function handlePointerDown(event: PointerEvent): void {
			if (event.target === menuTarget || isMenuInteraction(event.target)) {
				return;
			}
			closeContextMenu();
		}

		function handleFocusIn(event: FocusEvent): void {
			if (event.target === menuTarget || isMenuInteraction(event.target)) {
				return;
			}
			closeContextMenu();
		}

		function handleKeyDown(event: KeyboardEvent): void {
			if (event.key === "Escape") {
				closeContextMenu();
			}
		}

		window.addEventListener("blur", closeContextMenu);
		document.addEventListener("pointerdown", handlePointerDown, true);
		document.addEventListener("focusin", handleFocusIn, true);
		document.addEventListener("keydown", handleKeyDown, true);
		return (): void => {
			window.removeEventListener("blur", closeContextMenu);
			document.removeEventListener("pointerdown", handlePointerDown, true);
			document.removeEventListener("focusin", handleFocusIn, true);
			document.removeEventListener("keydown", handleKeyDown, true);
		};
	}, [closeContextMenu, contextMenu]);

	const contextMenuItems: MenuProps["items"] = useMemo((): MenuProps["items"] => {
		const target: EditableTextInput | null = contextMenu?.target ?? null;
		const selectedText: string = target === null || contextMenu === null
			? ""
			: target.value.slice(contextMenu.selectionStart, contextMenu.selectionEnd);
		const editable: boolean = target !== null && !target.readOnly;

		return [
			{ key: "cut", label: t("composer.textAreaMenu.cut"), disabled: !editable || selectedText.length === 0 },
			{ key: "copy", label: t("composer.textAreaMenu.copy"), disabled: selectedText.length === 0 },
			{ key: "paste", label: t("composer.textAreaMenu.paste"), disabled: !editable },
			{ key: "select-all", label: t("composer.textAreaMenu.selectAll"), disabled: target === null || target.value.length === 0 }
		];
	}, [contextMenu, t]);

	const handleContextMenuAction: MenuProps["onClick"] = useCallback(({ key }): void => {
		const menuState: InputContextMenuState | null = contextMenu;
		closeContextMenu();
		if (menuState === null || !menuState.target.isConnected) {
			return;
		}

		const { target, selectionStart, selectionEnd } = menuState;
		const selectedText: string = target.value.slice(selectionStart, selectionEnd);
		const replaceSelection = (replacement: string): void => {
			const value: string = target.value;
			setInputValue(target, `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`);
			restoreSelection(target, selectionStart + replacement.length, selectionStart + replacement.length);
		};

		switch (String(key)) {
			case "cut":
				if (!target.readOnly && selectedText.length > 0) {
					void copyTextToClipboard(selectedText)
						.then((): void => replaceSelection(""))
						.catch((error: unknown): void => console.error("[InputContextMenu] cut failed", error));
				}
				return;
			case "copy":
				if (selectedText.length > 0) {
					void copyTextToClipboard(selectedText).catch((error: unknown): void => console.error("[InputContextMenu] copy failed", error));
				}
				return;
			case "paste":
				if (!target.readOnly) {
					void readTextFromClipboard()
						.then((text: string): void => replaceSelection(text))
						.catch((error: unknown): void => console.error("[InputContextMenu] paste failed", error));
				}
				return;
			case "select-all":
				target.focus({ preventScroll: true });
				target.select();
				return;
			default:
				return;
		}
	}, [closeContextMenu, contextMenu]);

	return (
		<Dropdown
			open={contextMenu !== null}
			trigger={[]}
			placement="bottomLeft"
			menu={{ items: contextMenuItems, onClick: handleContextMenuAction }}
			popupRender={(menu: React.ReactNode): React.ReactNode => (
				<div data-studio-input-context-menu-popup>{menu}</div>
			)}
			onOpenChange={(open: boolean): void => {
				if (!open) {
					closeContextMenu();
				}
			}}
		>
			<span
				aria-hidden="true"
				style={{
					position: "fixed",
					left: contextMenu?.clientX ?? -1,
					top: contextMenu?.clientY ?? -1,
					width: 1,
					height: 1,
					pointerEvents: "none"
				}}
			/>
		</Dropdown>
	);
}

export default InputContextMenu;
