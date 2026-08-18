import type { WebContents } from "electron";
import type { BrowserElementSnapshot } from "../../../contracts/browser";

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
  return {
    url: location.href,
    pageTitle: document.title || '',
    selector,
    tagName: (element.tagName || '').toLowerCase(),
    role: element.getAttribute('role') || '',
    accessibleName: element.getAttribute('aria-label') || element.getAttribute('alt') || element.getAttribute('title') || '',
    selectedText: (element.innerText || element.textContent || '').trim().slice(0, 8000),
    attributes
  };
}`;

export class BrowserInspector {
	private active: boolean = false;
	private messageListener: ((event: Electron.Event, method: string, params: DebuggerMessageParams) => void) | null = null;

	constructor(
		private readonly webContents: WebContents,
		private readonly onSelected: (snapshot: BrowserElementSnapshot) => void,
		private readonly onCancelled: () => void
	) {}

	async start(): Promise<void> {
		if (this.active) {
			await this.cancel();
			return;
		}
		if (!this.webContents.debugger.isAttached()) this.webContents.debugger.attach("1.3");
		await this.webContents.debugger.sendCommand("DOM.enable");
		await this.webContents.debugger.sendCommand("Overlay.enable");
		this.messageListener = (_event: Electron.Event, method: string, params: DebuggerMessageParams): void => {
			if (method === "Overlay.inspectNodeRequested" && typeof params.backendNodeId === "number") {
				void this.capture(params.backendNodeId);
			}
		};
		this.webContents.debugger.on("message", this.messageListener);
		await this.webContents.debugger.sendCommand("Overlay.setInspectMode", {
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
	}

	async cancel(): Promise<void> {
		if (!this.active && !this.webContents.debugger.isAttached()) return;
		try { await this.webContents.debugger.sendCommand("Overlay.setInspectMode", { mode: "none", highlightConfig: {} }); } catch { /* already detached */ }
		this.cleanup();
		this.onCancelled();
	}

	private async capture(backendNodeId: number): Promise<void> {
		try {
			const resolved = await this.webContents.debugger.sendCommand("DOM.resolveNode", { backendNodeId }) as { object?: { objectId?: string } };
			const objectId: string | undefined = resolved.object?.objectId;
			if (objectId === undefined) throw new Error("browser_inspect_node_unavailable");
			const result = await this.webContents.debugger.sendCommand("Runtime.callFunctionOn", {
				objectId,
				functionDeclaration: SNAPSHOT_FUNCTION,
				returnByValue: true
			}) as { result?: { value?: BrowserElementSnapshot } };
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
		if (this.messageListener !== null) this.webContents.debugger.removeListener("message", this.messageListener);
		this.messageListener = null;
		if (this.webContents.debugger.isAttached()) {
			try { this.webContents.debugger.detach(); } catch { /* renderer already closed */ }
		}
	}
}
