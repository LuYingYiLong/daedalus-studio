import type { WebContents } from "electron";
import type { BrowserElementSnapshot } from "../../../contracts/browser";
import { BrowserCdpSession } from "./browser-cdp-session";

type DebuggerMessageParams = Record<string, unknown>;

const SNAPSHOT_FUNCTION: string = `function () {
  const element = this;
  const escape = (value) => CSS.escape(String(value));
  const selector = (() => {
    if (element.id) return '#' + escape(element.id);
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
      let part = current.tagName.toLowerCase();
	  const testAttribute = current.hasAttribute('data-testid') ? 'data-testid' : current.hasAttribute('data-test') ? 'data-test' : '';
	  const testId = testAttribute ? current.getAttribute(testAttribute) : '';
	  if (testId) { part += '[' + testAttribute + '="' + escape(testId) + '"]'; parts.unshift(part); break; }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((node) => node.tagName === current.tagName);
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(' > ');
  })();
  const attributes = {};
  for (const attribute of Array.from(element.attributes || []).slice(0, 20)) {
	if (!/^on/i.test(attribute.name) && !['style', 'value', 'srcdoc'].includes(attribute.name.toLowerCase())) attributes[attribute.name] = attribute.value.slice(0, 500);
  }
  const rect = element.getBoundingClientRect();
  return {
    url: location.href,
    pageTitle: document.title || '',
    selector,
    tagName: (element.tagName || '').toLowerCase(),
    role: element.getAttribute('role') || '',
    accessibleName: element.getAttribute('aria-label') || element.getAttribute('alt') || element.getAttribute('title') || '',
    selectedText: (element.innerText || element.textContent || '').trim().slice(0, 8000),
    attributes,
    viewportRect: {
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
      width: Math.max(0, rect.width),
      height: Math.max(0, rect.height)
    }
  };
}`;

export class BrowserInspector {
	private active: boolean = false;
	private messageListener: ((method: string, params: DebuggerMessageParams) => void) | null = null;
	private removeMessageListener: (() => void) | null = null;
	private contextMenuListener: ((event: Electron.Event) => void) | null = null;
	private releaseLease: (() => void) | null = null;

	constructor(
		private readonly webContents: WebContents,
		private readonly cdp: BrowserCdpSession,
		private readonly onSelected: (snapshot: BrowserElementSnapshot) => void,
		private readonly onCancelled: () => void
	) {}

	isActive(): boolean { return this.active; }

	async start(): Promise<void> {
		if (this.active) {
			await this.cancel();
			return;
		}
		try {
			this.releaseLease = await this.cdp.acquire("inspector");
			await this.cdp.sendCommand("DOM.enable");
			await this.cdp.sendCommand("Overlay.enable");
			this.messageListener = (method: string, params: DebuggerMessageParams): void => {
				if (method === "Overlay.inspectNodeRequested" && typeof params.backendNodeId === "number") {
					void this.capture(params.backendNodeId);
					return;
				}
				if (method === "Overlay.inspectModeCanceled") {
					this.cleanup();
					this.onCancelled();
				}
			};
			this.removeMessageListener = this.cdp.onMessage((method, params): void => this.messageListener?.(method, params));
			this.contextMenuListener = (event: Electron.Event): void => {
				event.preventDefault();
				void this.cancel();
			};
			this.webContents.on("context-menu", this.contextMenuListener);
			await this.cdp.sendCommand("Overlay.setInspectMode", {
				mode: "searchForNode",
				highlightConfig: {
					showInfo: true,
					showStyles: false,
					contentColor: { r: 70, g: 145, b: 210, a: 0.24 },
					borderColor: { r: 70, g: 145, b: 210, a: 0.9 },
					marginColor: { r: 246, g: 178, b: 107, a: 0.18 }
				}
			});
			this.active = true;
		} catch (error) {
			this.cleanup();
			throw error;
		}
	}

	async cancel(): Promise<void> {
		if (!this.active && this.releaseLease === null) return;
		try { await this.cdp.sendCommand("Overlay.setInspectMode", { mode: "none", highlightConfig: {} }); } catch { /* already detached */ }
		this.cleanup();
		this.onCancelled();
	}

	private async capture(backendNodeId: number): Promise<void> {
		try {
			const resolved = await this.cdp.sendCommand<{ object?: { objectId?: string } }>("DOM.resolveNode", { backendNodeId });
			const objectId: string | undefined = resolved.object?.objectId;
			if (objectId === undefined) throw new Error("browser_inspect_node_unavailable");
			const result = await this.cdp.sendCommand<{ result?: { value?: BrowserElementSnapshot } }>("Runtime.callFunctionOn", {
				objectId,
				functionDeclaration: SNAPSHOT_FUNCTION,
				returnByValue: true
			});
			const snapshot: BrowserElementSnapshot | undefined = result.result?.value;
			if (snapshot === undefined) throw new Error("browser_inspect_snapshot_unavailable");
			this.cleanup();
			this.onSelected(snapshot);
		} catch {
			this.cleanup();
			this.onCancelled();
		}
	}

	private cleanup(): void {
		this.active = false;
		this.removeMessageListener?.();
		this.removeMessageListener = null;
		this.messageListener = null;
		if (this.contextMenuListener !== null) this.webContents.removeListener("context-menu", this.contextMenuListener);
		this.contextMenuListener = null;
		this.releaseLease?.();
		this.releaseLease = null;
	}
}
