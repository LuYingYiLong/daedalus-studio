import type { BrowserAutomationPage, BrowserCdpTransport } from "./browser-transport";
import type { BrowserAutomationState } from "../../../contracts/browser";

const MAX_SCREENSHOT_BYTES: number = 2 * 1024 * 1024;
const MAX_VISIBLE_TEXT: number = 32 * 1024;
const MAX_ELEMENTS: number = 200;

type AutomationResult = Record<string, unknown>;

const OBSERVE_SCRIPT: string = `(() => {
  const stateKey = '__daedalus_browser_automation__';
  const selectors = 'a[href],button,input,textarea,select,summary,[role],[tabindex],[contenteditable="true"]';
  const candidates = Array.from(document.querySelectorAll(selectors));
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth;
  };
  const sensitive = (element) => element instanceof HTMLInputElement && (element.type === 'password' || /token|secret|password|api[-_ ]?key/i.test([element.name, element.id, element.placeholder, element.autocomplete].filter(Boolean).join(' ')));
  const elements = [];
  const refs = new Map();
  const signatures = new Map();
  for (const element of candidates) {
    if (elements.length >= ${MAX_ELEMENTS} || !isVisible(element)) continue;
    const rect = element.getBoundingClientRect();
    const id = elements.length;
    const role = element.getAttribute('role') || ({A:'link',BUTTON:'button',INPUT:'textbox',TEXTAREA:'textbox',SELECT:'combobox',SUMMARY:'button'}[element.tagName] || '');
    const name = element.getAttribute('aria-label') || element.getAttribute('alt') || element.getAttribute('title') || (element.innerText || '').trim().slice(0, 500);
    const item = {
      id,
      tagName: element.tagName.toLowerCase(),
      role,
      name,
      text: (element.innerText || element.textContent || '').trim().slice(0, 1000),
      type: element instanceof HTMLInputElement ? element.type : undefined,
      placeholder: 'placeholder' in element ? String(element.placeholder || '').slice(0, 500) : undefined,
      value: sensitive(element) ? undefined : ('value' in element ? String(element.value || '').slice(0, 1000) : undefined),
      href: element instanceof HTMLAnchorElement ? element.href.slice(0, 2048) : undefined,
      checked: 'checked' in element ? Boolean(element.checked) : undefined,
      disabled: 'disabled' in element ? Boolean(element.disabled) : element.getAttribute('aria-disabled') === 'true',
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
    elements.push(item);
    refs.set(id, element);
	const signature = [item.tagName, item.role, item.name, item.type || ''].join('\\u0000');
	signatures.set(id, signature);
  }
  const observationId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  window[stateKey] = { observationId, refs, signatures };
  const rawText = (document.body?.innerText || '').trim();
  return {
    observationId,
    url: location.href,
    title: document.title || '',
    viewport: { width: innerWidth, height: innerHeight },
    scroll: { x: scrollX, y: scrollY },
    visibleText: rawText.slice(0, ${MAX_VISIBLE_TEXT}),
    elements,
    truncated: { text: rawText.length > ${MAX_VISIBLE_TEXT}, elements: candidates.filter(isVisible).length > ${MAX_ELEMENTS} }
  };
})()`;

function serialized(value: unknown): string {
	return JSON.stringify(value);
}

export class BrowserAutomationController {
	private busy: boolean = false;
	private documentRevision: number = 0;
	private latestObservationId: string | null = null;
	private activeCallId: string | null = null;
	private releaseLease: (() => void) | null = null;

	constructor(
		private readonly browserId: string,
		private readonly webContents: BrowserAutomationPage,
		private readonly cdp: BrowserCdpTransport,
		private readonly isManualInspectionActive: () => boolean,
		private readonly onStateChanged: (
			state: BrowserAutomationState,
		) => void,
	) {}

	isBusy(): boolean {
		return this.busy;
	}

	invalidate(): void {
		this.documentRevision += 1;
		this.latestObservationId = null;
	}

	cancel(callId?: string): void {
		if (callId === undefined || this.activeCallId === callId)
			this.activeCallId = null;
	}

	async execute(
		callId: string,
		toolName: string,
		args: Record<string, unknown>,
	): Promise<AutomationResult> {
		if (this.busy) throw new Error("browser_automation_busy");
		if (this.isManualInspectionActive())
			throw new Error("browser_manual_inspection_active");
		this.busy = true;
		this.activeCallId = callId;
		this.onStateChanged({
			browserId: this.browserId,
			busy: true,
			toolName,
		});
		this.releaseLease = await this.cdp.acquire("automation");
		try {
			const result: AutomationResult = await this.run(toolName, args);
			if (this.activeCallId !== callId)
				throw new Error("browser_tool_cancelled");
			return result;
		} finally {
			this.releaseLease?.();
			this.releaseLease = null;
			this.busy = false;
			this.activeCallId = null;
			this.onStateChanged({
				browserId: this.browserId,
				busy: false,
				toolName: null,
			});
		}
	}

	private async run(
		toolName: string,
		args: Record<string, unknown>,
	): Promise<AutomationResult> {
		switch (toolName) {
			case "mcp_browser_observe":
				return await this.observe(args.includeScreenshot === true);
			case "mcp_browser_navigate":
				return await this.navigate(args.url);
			case "mcp_browser_navigation":
				return this.navigateHistory(args.action);
			case "mcp_browser_scroll":
				return await this.scroll(args.direction, args.pages);
			case "mcp_browser_wait":
				return await this.wait(
					args.condition,
					args.text,
					args.timeoutMs,
				);
			case "mcp_browser_screenshot":
				return await this.screenshot();
			case "mcp_browser_click":
				return await this.click(args);
			case "mcp_browser_type":
				return await this.type(args);
			case "mcp_browser_select":
				return await this.select(args);
			default:
				throw new Error("browser_tool_not_supported");
		}
	}

	private async evaluate<T>(expression: string): Promise<T> {
		const response = await this.cdp.sendCommand<{
			result?: { value?: T };
			exceptionDetails?: unknown;
		}>("Runtime.evaluate", {
			expression,
			returnByValue: true,
			awaitPromise: true,
		});
		if (
			response.exceptionDetails !== undefined ||
			response.result?.value === undefined
		)
			throw new Error("browser_script_failed");
		return response.result.value;
	}

	private assertNotCancelled(): void {
		if (this.activeCallId === null)
			throw new Error("browser_tool_cancelled");
	}

	private async observe(
		includeScreenshot: boolean,
	): Promise<AutomationResult> {
		const observation =
			await this.evaluate<Record<string, unknown>>(OBSERVE_SCRIPT);
		this.latestObservationId = String(observation.observationId ?? "");
		const result: AutomationResult = {
			...observation,
			documentRevision: this.documentRevision,
		};
		if (includeScreenshot) Object.assign(result, await this.screenshot());
		return result;
	}

	private async navigate(rawUrl: unknown): Promise<AutomationResult> {
		if (typeof rawUrl !== "string") throw new Error("browser_url_invalid");
		await this.webContents.loadURL(rawUrl);
		this.invalidate();
		return {
			url: this.webContents.getURL(),
			title: this.webContents.getTitle(),
		};
	}

	private navigateHistory(action: unknown): AutomationResult {
		if (action === "back" && this.webContents.navigationHistory.canGoBack())
			this.webContents.navigationHistory.goBack();
		else if (
			action === "forward" &&
			this.webContents.navigationHistory.canGoForward()
		)
			this.webContents.navigationHistory.goForward();
		else if (action === "reload") this.webContents.reload();
		else if (action !== "back" && action !== "forward")
			throw new Error("browser_action_invalid");
		this.invalidate();
		return { action };
	}

	private async scroll(
		direction: unknown,
		rawPages: unknown,
	): Promise<AutomationResult> {
		if (direction !== "up" && direction !== "down")
			throw new Error("browser_scroll_invalid");
		const pages: number =
			typeof rawPages === "number"
				? Math.min(3, Math.max(0.25, rawPages))
				: 0.8;
		const result = await this.evaluate<{ x: number; y: number }>(
			`(() => { scrollBy({ top: innerHeight * ${pages} * ${direction === "down" ? 1 : -1}, behavior: 'instant' }); return { x: scrollX, y: scrollY }; })()`,
		);
		this.invalidate();
		return { scroll: result };
	}

	private async wait(
		condition: unknown,
		text: unknown,
		rawTimeout: unknown,
	): Promise<AutomationResult> {
		if (
			condition !== "load" &&
			condition !== "network_idle" &&
			condition !== "text"
		)
			throw new Error("browser_wait_invalid");
		if (condition === "text" && typeof text !== "string")
			throw new Error("browser_wait_text_required");
		const timeoutMs: number =
			typeof rawTimeout === "number"
				? Math.min(10_000, Math.max(100, rawTimeout))
				: 5_000;
		const startedAt: number = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			this.assertNotCancelled();
			const ready: boolean =
				condition === "text"
					? await this.evaluate<boolean>(
							`document.body?.innerText.includes(${serialized(text)}) === true`,
						)
					: !this.webContents.isLoading();
			if (ready) {
				this.invalidate();
				return {
					condition,
					satisfied: true,
					elapsedMs: Date.now() - startedAt,
				};
			}
			await new Promise<void>((resolve): void => {
				setTimeout(resolve, 100);
			});
		}
		throw new Error("browser_wait_timeout");
	}

	private async screenshot(): Promise<AutomationResult> {
		const image = await this.webContents.capturePage();
		const buffer: Buffer = image.toPNG();
		if (buffer.byteLength > MAX_SCREENSHOT_BYTES)
			throw new Error("browser_screenshot_too_large");
		return {
			mimeType: "image/png",
			byteSize: buffer.byteLength,
			dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
		};
	}

	private validateElementArgs(args: Record<string, unknown>): {
		observationId: string;
		elementId: number;
	} {
		if (
			typeof args.observationId !== "string" ||
			!Number.isInteger(args.elementId)
		)
			throw new Error("browser_element_invalid");
		if (
			this.latestObservationId === null ||
			args.observationId !== this.latestObservationId
		)
			throw new Error("browser_element_stale");
		return {
			observationId: args.observationId,
			elementId: args.elementId as number,
		};
	}

	private async resolveElement(
		args: Record<string, unknown>,
	): Promise<{ x: number; y: number }> {
		const { observationId, elementId } = this.validateElementArgs(args);
		const result = await this.evaluate<{
			ok: boolean;
			x?: number;
			y?: number;
		}>(`(() => {
          const state = window.__daedalus_browser_automation__;
          if (!state || state.observationId !== ${serialized(observationId)}) return { ok: false };
          const element = state.refs.get(${elementId});
          if (!element || !element.isConnected) return { ok: false };
          const role = element.getAttribute('role') || ({A:'link',BUTTON:'button',INPUT:'textbox',TEXTAREA:'textbox',SELECT:'combobox',SUMMARY:'button'}[element.tagName] || '');
          const name = element.getAttribute('aria-label') || element.getAttribute('alt') || element.getAttribute('title') || (element.innerText || '').trim().slice(0, 500);
          const type = element instanceof HTMLInputElement ? element.type : '';
          if ([element.tagName.toLowerCase(), role, name, type].join('\\u0000') !== state.signatures.get(${elementId})) return { ok: false };
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return { ok: false };
          element.scrollIntoView({ block: 'center', inline: 'center' });
          const next = element.getBoundingClientRect();
          return { ok: true, x: next.left + next.width / 2, y: next.top + next.height / 2 };
        })()`);
		if (!result.ok || result.x === undefined || result.y === undefined)
			throw new Error("browser_element_stale");
		return { x: result.x, y: result.y };
	}

	private async click(
		args: Record<string, unknown>,
	): Promise<AutomationResult> {
		const point = await this.resolveElement(args);
		this.assertNotCancelled();
		await this.cdp.sendCommand("Input.dispatchMouseEvent", {
			type: "mousePressed",
			x: point.x,
			y: point.y,
			button: "left",
			clickCount: 1,
		});
		await this.cdp.sendCommand("Input.dispatchMouseEvent", {
			type: "mouseReleased",
			x: point.x,
			y: point.y,
			button: "left",
			clickCount: 1,
		});
		this.invalidate();
		return { clicked: true };
	}

	private async type(
		args: Record<string, unknown>,
	): Promise<AutomationResult> {
		if (typeof args.text !== "string" || args.text.length > 16_000)
			throw new Error("browser_type_invalid");
		await this.resolveElement(args);
		const { observationId, elementId } = this.validateElementArgs(args);
		const focused = await this.evaluate<boolean>(
			`(() => { const state = window.__daedalus_browser_automation__; if (!state || state.observationId !== ${serialized(observationId)}) return false; const element = state.refs.get(${elementId}); if (!element) return false; element.focus(); ${args.clearFirst === false ? "" : "if ('select' in element) element.select(); else if (element.isContentEditable) document.execCommand('selectAll', false);"} return true; })()`,
		);
		if (!focused) throw new Error("browser_element_stale");
		this.assertNotCancelled();
		if (args.clearFirst !== false)
			await this.cdp.sendCommand("Input.dispatchKeyEvent", {
				type: "keyDown",
				key: "Backspace",
				code: "Backspace",
			});
		await this.cdp.sendCommand("Input.insertText", { text: args.text });
		this.invalidate();
		return { typed: true, chars: args.text.length };
	}

	private async select(
		args: Record<string, unknown>,
	): Promise<AutomationResult> {
		if (typeof args.value !== "string" || args.value.length > 4000)
			throw new Error("browser_select_invalid");
		await this.resolveElement(args);
		const { observationId, elementId } = this.validateElementArgs(args);
		this.assertNotCancelled();
		const selected = await this.evaluate<boolean>(
			`(() => { const state = window.__daedalus_browser_automation__; if (!state || state.observationId !== ${serialized(observationId)}) return false; const element = state.refs.get(${elementId}); if (!(element instanceof HTMLSelectElement) || !Array.from(element.options).some(option => option.value === ${serialized(args.value)})) return false; element.value = ${serialized(args.value)}; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
		);
		if (!selected) throw new Error("browser_select_option_invalid");
		this.invalidate();
		return { selected: true, value: args.value };
	}
}
