export const SHORTCUT_COMMAND_IDS = [
	"workbench.toggleWorkspaceSidebar",
	"workbench.toggleBottomPanel",
	"workbench.toggleSessionSidebar",
	"session.new",
	"session.previous",
	"session.next",
	"conversation.previousTurn",
	"conversation.nextTurn",
	"conversation.find"
] as const;

export type ShortcutCommandId = typeof SHORTCUT_COMMAND_IDS[number];
export type ShortcutPlatform = "mac" | "other";
export type KeyboardShortcutOverrides = Partial<Record<ShortcutCommandId, string>>;

export type ShortcutDefinition = {
	id: ShortcutCommandId;
	labelKey: string;
	defaultBinding: string;
};

export type ShortcutKeyboardEvent = {
	key: string;
	code: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
};

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
	{ id: "workbench.toggleWorkspaceSidebar", labelKey: "settings.keyboardShortcuts.commands.toggleWorkspaceSidebar", defaultBinding: "Mod+KeyB" },
	{ id: "workbench.toggleBottomPanel", labelKey: "settings.keyboardShortcuts.commands.toggleBottomPanel", defaultBinding: "Mod+KeyJ" },
	{ id: "workbench.toggleSessionSidebar", labelKey: "settings.keyboardShortcuts.commands.toggleSessionSidebar", defaultBinding: "Mod+Alt+KeyB" },
	{ id: "session.new", labelKey: "settings.keyboardShortcuts.commands.newSession", defaultBinding: "Mod+KeyN" },
	{ id: "session.previous", labelKey: "settings.keyboardShortcuts.commands.previousSession", defaultBinding: "Mod+PageUp" },
	{ id: "session.next", labelKey: "settings.keyboardShortcuts.commands.nextSession", defaultBinding: "Mod+PageDown" },
	{ id: "conversation.previousTurn", labelKey: "settings.keyboardShortcuts.commands.previousTurn", defaultBinding: "PageUp" },
	{ id: "conversation.nextTurn", labelKey: "settings.keyboardShortcuts.commands.nextTurn", defaultBinding: "PageDown" },
	{ id: "conversation.find", labelKey: "settings.keyboardShortcuts.commands.findInConversation", defaultBinding: "Mod+KeyF" }
];

const SHORTCUT_COMMAND_ID_SET: ReadonlySet<string> = new Set(SHORTCUT_COMMAND_IDS);
const MODIFIER_TOKENS: ReadonlySet<string> = new Set(["Mod", "Ctrl", "Meta", "Alt", "Shift"]);
const MODIFIER_ORDER: readonly string[] = ["Mod", "Ctrl", "Meta", "Alt", "Shift"];
const NAMED_KEY_TOKENS: ReadonlySet<string> = new Set([
	"ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End",
	"Insert", "Delete", "Backspace", "Enter", "Space", "Tab", "Escape", "Comma", "Period",
	"Slash", "Semicolon", "Quote", "BracketLeft", "BracketRight", "Backslash", "Minus", "Equal",
	"Backquote", "NumpadAdd", "NumpadSubtract", "NumpadMultiply", "NumpadDivide", "NumpadDecimal", "NumpadEnter"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKeyToken(value: string): string | null {
	const token: string = value.trim();
	if (/^Key[A-Z]$/u.test(token) || /^Digit[0-9]$/u.test(token) || /^Numpad[0-9]$/u.test(token)) {
		return token;
	}
	if (/^F(?:[1-9]|1[0-9]|2[0-4])$/u.test(token) || NAMED_KEY_TOKENS.has(token)) {
		return token;
	}
	return null;
}

function isPrintableKeyToken(token: string): boolean {
	return /^Key[A-Z]$/u.test(token)
		|| /^Digit[0-9]$/u.test(token)
		|| /^Numpad[0-9]$/u.test(token)
		|| [
			"Space", "Comma", "Period", "Slash", "Semicolon", "Quote", "BracketLeft", "BracketRight",
			"Backslash", "Minus", "Equal", "Backquote", "NumpadAdd", "NumpadSubtract", "NumpadMultiply",
			"NumpadDivide", "NumpadDecimal"
		].includes(token);
}

export function isShortcutCommandId(value: string): value is ShortcutCommandId {
	return SHORTCUT_COMMAND_ID_SET.has(value);
}

export function normalizeShortcutBinding(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const rawTokens: string[] = value
		.split("+")
		.map((token: string): string => token.trim())
		.filter((token: string): boolean => token.length > 0);
	const modifiers: Set<string> = new Set();
	let keyToken: string | null = null;
	for (const rawToken of rawTokens) {
		const modifier: string | undefined = [...MODIFIER_TOKENS].find(
			(candidate: string): boolean => candidate.toLowerCase() === rawToken.toLowerCase()
		);
		if (modifier !== undefined) {
			modifiers.add(modifier);
			continue;
		}
		const normalizedKey: string | null = normalizeKeyToken(rawToken);
		if (normalizedKey === null || keyToken !== null) {
			return null;
		}
		keyToken = normalizedKey;
	}
	if (keyToken === null || (isPrintableKeyToken(keyToken) && modifiers.size === 0)) {
		return null;
	}
	return [...MODIFIER_ORDER.filter((modifier: string): boolean => modifiers.has(modifier)), keyToken].join("+");
}

export function getShortcutDefinition(commandId: ShortcutCommandId): ShortcutDefinition {
	const definition: ShortcutDefinition | undefined = SHORTCUT_DEFINITIONS.find(
		(candidate: ShortcutDefinition): boolean => candidate.id === commandId
	);
	if (definition === undefined) {
		throw new Error(`Unknown shortcut command: ${commandId}`);
	}
	return definition;
}

export function getEffectiveShortcutBinding(overrides: KeyboardShortcutOverrides, commandId: ShortcutCommandId): string {
	return overrides[commandId] ?? getShortcutDefinition(commandId).defaultBinding;
}

function resolveModifierState(binding: string, platform: ShortcutPlatform): {
	ctrl: boolean;
	meta: boolean;
	alt: boolean;
	shift: boolean;
	key: string;
} | null {
	const normalized: string | null = normalizeShortcutBinding(binding);
	if (normalized === null) {
		return null;
	}
	const tokens: string[] = normalized.split("+");
	const key: string | undefined = tokens.at(-1);
	if (key === undefined) {
		return null;
	}
	return {
		ctrl: tokens.includes("Ctrl") || (tokens.includes("Mod") && platform === "other"),
		meta: tokens.includes("Meta") || (tokens.includes("Mod") && platform === "mac"),
		alt: tokens.includes("Alt"),
		shift: tokens.includes("Shift"),
		key
	};
}

export function getShortcutBindingSignature(binding: string, platform: ShortcutPlatform): string | null {
	const state = resolveModifierState(binding, platform);
	return state === null
		? null
		: `${state.ctrl ? "1" : "0"}${state.meta ? "1" : "0"}${state.alt ? "1" : "0"}${state.shift ? "1" : "0"}:${state.key}`;
}

export function findShortcutConflict(
	overrides: KeyboardShortcutOverrides,
	commandId: ShortcutCommandId,
	binding: string,
	platform: ShortcutPlatform
): ShortcutDefinition | null {
	const signature: string | null = getShortcutBindingSignature(binding, platform);
	if (signature === null) {
		return null;
	}
	for (const definition of SHORTCUT_DEFINITIONS) {
		if (
			definition.id !== commandId
			&& getShortcutBindingSignature(getEffectiveShortcutBinding(overrides, definition.id), platform) === signature
		) {
			return definition;
		}
	}
	return null;
}

export function normalizeKeyboardShortcutOverrides(value: unknown, platform: ShortcutPlatform): KeyboardShortcutOverrides {
	if (!isRecord(value)) {
		return {};
	}
	const candidates: KeyboardShortcutOverrides = {};
	for (const commandId of SHORTCUT_COMMAND_IDS) {
		const normalized: string | null = normalizeShortcutBinding(value[commandId]);
		if (normalized !== null && normalized !== getShortcutDefinition(commandId).defaultBinding) {
			candidates[commandId] = normalized;
		}
	}
	for (const commandId of SHORTCUT_COMMAND_IDS) {
		const binding: string | undefined = candidates[commandId];
		if (binding !== undefined && findShortcutConflict(candidates, commandId, binding, platform) !== null) {
			delete candidates[commandId];
		}
	}
	return candidates;
}

function normalizeEventKeyToken(event: ShortcutKeyboardEvent): string | null {
	const codeToken: string | null = normalizeKeyToken(event.code);
	if (codeToken !== null) {
		return codeToken;
	}
	if (/^[a-z]$/iu.test(event.key)) {
		return `Key${event.key.toUpperCase()}`;
	}
	if (/^[0-9]$/u.test(event.key)) {
		return `Digit${event.key}`;
	}
	const aliases: Record<string, string> = {
		" ": "Space",
		Esc: "Escape",
		Up: "ArrowUp",
		Down: "ArrowDown",
		Left: "ArrowLeft",
		Right: "ArrowRight"
	};
	return normalizeKeyToken(aliases[event.key] ?? event.key);
}

export function shortcutBindingFromKeyboardEvent(event: ShortcutKeyboardEvent, platform: ShortcutPlatform): string | null {
	if (["Control", "Meta", "Alt", "Shift"].includes(event.key)) {
		return null;
	}
	const keyToken: string | null = normalizeEventKeyToken(event);
	if (keyToken === null) {
		return null;
	}
	const modifiers: string[] = [];
	if (platform === "mac") {
		if (event.metaKey) modifiers.push("Mod");
		if (event.ctrlKey) modifiers.push("Ctrl");
	} else {
		if (event.ctrlKey) modifiers.push("Mod");
		if (event.metaKey) modifiers.push("Meta");
	}
	if (event.altKey) modifiers.push("Alt");
	if (event.shiftKey) modifiers.push("Shift");
	return normalizeShortcutBinding([...modifiers, keyToken].join("+"));
}

export function matchesShortcutKeyboardEvent(
	event: ShortcutKeyboardEvent,
	binding: string,
	platform: ShortcutPlatform
): boolean {
	const state = resolveModifierState(binding, platform);
	const eventKey: string | null = normalizeEventKeyToken(event);
	return state !== null
		&& eventKey === state.key
		&& event.ctrlKey === state.ctrl
		&& event.metaKey === state.meta
		&& event.altKey === state.alt
		&& event.shiftKey === state.shift;
}

export function findMatchingShortcutCommand(
	event: ShortcutKeyboardEvent,
	overrides: KeyboardShortcutOverrides,
	platform: ShortcutPlatform
): ShortcutCommandId | null {
	for (const definition of SHORTCUT_DEFINITIONS) {
		if (matchesShortcutKeyboardEvent(event, getEffectiveShortcutBinding(overrides, definition.id), platform)) {
			return definition.id;
		}
	}
	return null;
}

function formatKeyToken(token: string): string {
	if (/^Key[A-Z]$/u.test(token)) return token.slice(3);
	if (/^Digit[0-9]$/u.test(token)) return token.slice(5);
	if (/^Numpad[0-9]$/u.test(token)) return `Num ${token.slice(6)}`;
	const labels: Record<string, string> = {
		ArrowUp: "↑",
		ArrowDown: "↓",
		ArrowLeft: "←",
		ArrowRight: "→",
		Space: "Space",
		Comma: ",",
		Period: ".",
		Slash: "/",
		Semicolon: ";",
		Quote: "'",
		BracketLeft: "[",
		BracketRight: "]",
		Backslash: "\\",
		Minus: "-",
		Equal: "=",
		Backquote: "`",
		NumpadAdd: "Num +",
		NumpadSubtract: "Num -",
		NumpadMultiply: "Num *",
		NumpadDivide: "Num /",
		NumpadDecimal: "Num .",
		NumpadEnter: "Num Enter"
	};
	return labels[token] ?? token;
}

export function formatShortcutBindingParts(binding: string, platform: ShortcutPlatform): string[] {
	const normalized: string | null = normalizeShortcutBinding(binding);
	if (normalized === null) {
		return [];
	}
	const labels: string[] = normalized.split("+").map((token: string): string => {
		if (token === "Mod") return platform === "mac" ? "Cmd" : "Ctrl";
		if (token === "Alt") return platform === "mac" ? "Option" : "Alt";
		if (token === "Meta") return platform === "mac" ? "Cmd" : "Win";
		return MODIFIER_TOKENS.has(token) ? token : formatKeyToken(token);
	});
	return [...new Set(labels)];
}

export function formatShortcutBinding(binding: string, platform: ShortcutPlatform): string {
	return formatShortcutBindingParts(binding, platform).join("+");
}

export function detectShortcutPlatform(
	platformText: string = typeof navigator === "undefined" ? "" : `${navigator.platform} ${navigator.userAgent}`
): ShortcutPlatform {
	return /Mac|iPhone|iPad|iPod/iu.test(platformText) ? "mac" : "other";
}
