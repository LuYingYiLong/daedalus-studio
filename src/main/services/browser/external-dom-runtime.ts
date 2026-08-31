// 此函数只在 CDP 创建的隔离 world 中运行；不要闭包引用主进程变量
export function createExternalDomRuntime(presentation: {
	cursorSvg: string;
	color: string;
}): void {
	const state = globalThis as typeof globalThis & {
		__daedalusExternal?: (op: string, args: Record<string, unknown>) => unknown;
	};
	if (state.__daedalusExternal) return;
	type Item = {
		element: HTMLElement;
		signature: string;
		frame: number[];
		name: string;
		rect: { x: number; y: number; width: number; height: number };
		blocked: boolean;
	};
	let observationId = "",
		items: Item[] = [],
		host: HTMLElement | null = null;
	const plans = new Map<
		string,
		{
			steps: Record<string, unknown>[];
			signatures: Map<string, string>;
			form: string;
		}
	>();
	const seen = new Map<string, Record<string, unknown>>();
	let screenshotMask: HTMLElement | null = null;
	let cursor: HTMLElement | null = null,
		outline: HTMLElement | null = null,
		generation: string | null = null,
		deadline = 0,
		screenshotHidden = false,
		point = { x: 0, y: 0 };
	const retired = new Set<string>();
	const color = /^#[\da-f]{6}$/iu.test(presentation.color)
		? presentation.color
		: "#488fc1";
	let leaseTimer: ReturnType<typeof setTimeout> | undefined,
		activityTimer: ReturnType<typeof setTimeout> | undefined;
	const animations = new Set<Animation>();
	const cancelAnimations = (): void => {
		for (const animation of animations) animation.cancel();
		animations.clear();
	};
	const clearVisuals = (): void => {
		clearTimeout(leaseTimer);
		clearTimeout(activityTimer);
		cancelAnimations();
		if (generation) retired.add(generation);
		generation = null;
		if (retired.size > 32) retired.delete(retired.values().next().value!);
		screenshotMask?.remove();
		host?.remove();
		screenshotMask = null;
		host = null;
		cursor = outline = null;
		screenshotHidden = false;
	};
	const positionCursor = (): void => {
		point.x = Math.max(8, Math.min(point.x, innerWidth - 80));
		point.y = Math.max(8, Math.min(point.y, innerHeight - 44));
		if (cursor)
			cursor.style.transform = `translate(${point.x}px, ${point.y}px)`;
	};
	const syncVisibility = (): void => {
		if (generation && Date.now() >= deadline) clearVisuals();
		if (!host) return;
		const hidden = document.hidden || screenshotHidden;
		host.style.setProperty("display", hidden ? "none" : "block", "important");
		if (hidden) cancelAnimations();
	};
	const renewVisualLease = (): void => {
		clearTimeout(leaseTimer);
		deadline = Date.now() + 5000;
		// 只清理失联残影，不再按最后一次工具调用的时间隐藏光标
		leaseTimer = setTimeout(clearVisuals, 5000);
	};
	const activity = (kind: string, settle = false): void => {
		if (!host) return;
		clearTimeout(activityTimer);
		host.dataset.activity = kind;
		if (settle)
			activityTimer = setTimeout(() => {
				if (host) host.dataset.activity = "waiting";
			}, 900);
	};
	const activate = (next: string): void => {
		if (retired.has(next)) fail("browser_scope_stale");
		if (generation === next) return;
		clearVisuals();
		generation = next;
		renewVisualLease();
		host = document.createElement("div");
		host.setAttribute("data-daedalus-feedback", "true");
		host.setAttribute("aria-hidden", "true");
		host.style.cssText =
			"all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;pointer-events:none!important;z-index:2147483647!important;contain:strict!important";
		const shadow = host.attachShadow({ mode: "closed" });
		outline = document.createElement("div");
		outline.style.cssText = `position:absolute;display:none;box-sizing:border-box;border:2px solid ${color};border-radius:4px;pointer-events:none`;
		cursor = document.createElement("div");
		cursor.style.cssText =
			"position:absolute;left:0;top:0;will-change:transform;pointer-events:none";
		const icon = document.createElement("div");
		icon.style.cssText = "width:28px;height:28px;line-height:0";
		// SVG 只来自 Studio 打包资源，网页和模型不能提供标记
		icon.innerHTML = presentation.cursorSvg;
		const svg = icon.querySelector("svg");
		if (svg) {
			svg.style.width = "100%";
			svg.style.height = "100%";
		}
		cursor.append(icon);
		shadow.append(outline, cursor);
		document.documentElement.append(host);
		// 尚未操作具体控件时停靠右上角，不暗示正在点击某个目标
		point = { x: innerWidth - 100, y: 24 };
		positionCursor();
		activity("reading");
		syncVisibility();
	};
	document.addEventListener("visibilitychange", syncVisibility);
	window.addEventListener("resize", positionCursor);
	window.addEventListener(
		"scroll",
		() => {
			if (outline) outline.style.display = "none";
		},
		true,
	);
	function fail(code: string): never {
		throw new Error(code);
	}
	const sensitive = (element: HTMLElement): boolean =>
		/password|file|hidden/i.test(element.getAttribute("type") || "") ||
		/password|one-time-code|cc-number|cc-csc|secret|api[-_ ]?key|captcha|token/i.test(
			[
				element.id,
				element.getAttribute("name"),
				element.getAttribute("autocomplete"),
				element.getAttribute("aria-label"),
			].join(" "),
		);
	const sameOriginDocument = (frame: HTMLIFrameElement): Document | null => {
		try {
			// contentDocument 已受浏览器同源检查；srcdoc/初始 blank 的有效来源继承父页
			const doc = frame.contentDocument;
			if (
				doc &&
				(doc.location.origin === location.origin ||
					/^about:(blank|srcdoc)$/u.test(doc.location.href))
			)
				return doc;
		} catch {
			/* 跨域子页不继承访问权限 */
		}
		return null;
	};
	const collect = (): { nodes: Item[]; text: string; truncated: boolean } => {
		const nodes: Item[] = [],
			text: string[] = [];
		let truncated = false;
		const walk = (doc: Document, frame: number[], x = 0, y = 0): void => {
			if (frame.length > 8) {
				truncated = true;
				return;
			}
			const win = doc.defaultView!;
			const visit = (root: Document | ShadowRoot): void => {
				for (const raw of root.querySelectorAll<HTMLElement>("*")) {
					if (
						raw === host ||
						raw.getAttribute("data-daedalus-feedback") === "true"
					)
						continue;
					if (raw.shadowRoot) visit(raw.shadowRoot);
					if (
						!raw.matches(
							"a[href],button,input,textarea,select,summary,[role],[tabindex],[contenteditable=true]",
						)
					)
						continue;
					const box = raw.getBoundingClientRect(),
						style = win.getComputedStyle(raw);
					if (
						box.width <= 0 ||
						box.height <= 0 ||
						style.visibility === "hidden" ||
						style.display === "none" ||
						Number(style.opacity) === 0
					)
						continue;
					if (nodes.length >= 200) {
						truncated = true;
						break;
					}
					const name = (
						raw.getAttribute("aria-label") ||
						raw.getAttribute("title") ||
						("labels" in raw
							? Array.from((raw as HTMLInputElement).labels || [])
									.map((label) => label.textContent)
									.join(" ")
							: "") ||
						raw.innerText ||
						""
					)
						.trim()
						.slice(0, 500);
					const form = (raw as HTMLInputElement).form;
					const signature = JSON.stringify({
						frame,
						documentUrl: doc.location.href,
						tag: raw.tagName,
						id: raw.id,
						name: raw.getAttribute("name"),
						role: raw.getAttribute("role"),
						label: name,
						type: raw.getAttribute("type"),
						href: raw.getAttribute("href"),
						action: form?.action,
						method: form?.method,
						options:
							raw.tagName === "SELECT"
								? Array.from((raw as HTMLSelectElement).options).map((o) => [
										o.value,
										o.label,
									])
								: undefined,
					});
					nodes.push({
						element: raw,
						signature,
						frame,
						name,
						blocked:
							sensitive(raw) ||
							(raw as HTMLInputElement).disabled === true ||
							raw.getAttribute("aria-disabled") === "true",
						rect: {
							x: box.x + x,
							y: box.y + y,
							width: box.width,
							height: box.height,
						},
					});
				}
			};
			visit(doc);
			// 不读取表单密码值、隐藏节点或跨域子文档；文字是外部证据，不是指令
			const walker = doc.createTreeWalker(
				doc.body || doc.documentElement,
				NodeFilter.SHOW_TEXT,
			);
			let node: Node | null;
			while ((node = walker.nextNode())) {
				const parent = node.parentElement;
				if (
					!parent ||
					parent.closest("script,style,input,textarea,[data-daedalus-feedback]")
				)
					continue;
				const style = win.getComputedStyle(parent);
				if (
					parent.getClientRects().length &&
					style.visibility !== "hidden" &&
					style.display !== "none"
				)
					text.push(node.textContent?.trim() || "");
				if (text.join("\n").length > 32000) {
					truncated = true;
					break;
				}
			}
			Array.from(doc.querySelectorAll("iframe"))
				.slice(0, 20)
				.forEach((el, index) => {
					try {
						const child = sameOriginDocument(el);
						if (child) {
							const box = el.getBoundingClientRect();
							walk(
								child,
								[...frame, index],
								x + box.x + el.clientLeft,
								y + box.y + el.clientTop,
							);
						}
					} catch {
						/* 跨域不继承权限 */
					}
				});
		};
		walk(document, []);
		return { nodes, text: text.join("\n").slice(0, 32000), truncated };
	};
	const formState = (nodes: Item[]): string =>
		JSON.stringify(
			nodes.map((item) => ({
				signature: item.signature,
				blocked: item.blocked,
				value: item.blocked
					? undefined
					: (item.element as HTMLInputElement).value,
				checked: item.blocked
					? undefined
					: (item.element as HTMLInputElement).checked,
			})),
		);
	const privateRegions = (): Item["rect"][] => {
		const regions: Item["rect"][] = [];
		let visited = 0;
		const walk = (doc: Document, x = 0, y = 0, depth = 0): void => {
			if (depth > 8) fail("browser_screenshot_redaction_limit");
			for (const element of doc.querySelectorAll<HTMLElement>(
				"input,textarea,iframe,[contenteditable]",
			)) {
				if (++visited > 2000) fail("browser_screenshot_redaction_limit");
				const box = element.getBoundingClientRect();
				if (box.width <= 0 || box.height <= 0) continue;
				const rect = {
					x: x + box.x,
					y: y + box.y,
					width: box.width,
					height: box.height,
				};
				if (element.tagName !== "IFRAME") {
					if (sensitive(element)) regions.push(rect);
					continue;
				}
				const frame = element as HTMLIFrameElement;
				const child = sameOriginDocument(frame);
				const style = doc.defaultView!.getComputedStyle(frame);
				if (
					!child ||
					style.transform !== "none" ||
					Math.abs(frame.offsetWidth - box.width) > 2 ||
					Math.abs(frame.offsetHeight - box.height) > 2
				)
					regions.push(rect);
				else
					walk(
						child,
						rect.x + frame.clientLeft,
						rect.y + frame.clientTop,
						depth + 1,
					);
			}
		};
		walk(document);
		return regions;
	};
	const highlight = (item: Item, clicked: boolean): void => {
		if (!host || !outline) return;
		cancelAnimations();
		const { x, y, width, height } = item.rect;
		Object.assign(outline.style, {
			display: "block",
			left: `${x}px`,
			top: `${y}px`,
			width: `${width}px`,
			height: `${height}px`,
		});
		point = { x: x + width / 2 - 7, y: y + height / 2 - 4 };
		positionCursor();
		activity(clicked ? "click" : "input");
		if (
			clicked &&
			!document.hidden &&
			!screenshotHidden &&
			!matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			const animation = outline.animate(
				[{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }],
				{
					duration: 240,
					easing: "cubic-bezier(0.23, 1, 0.32, 1)",
				},
			);
			animations.add(animation);
			animation.onfinish = () => animations.delete(animation);
		}
	};
	state.__daedalusExternal = (op, args) => {
		if (op === "activate") {
			if (
				typeof args.generation !== "string" ||
				!args.generation ||
				args.generation.length > 200
			)
				fail("browser_scope_stale");
			activate(args.generation as string);
			return {};
		}
		if (op === "heartbeat") {
			// 心跳只延长已有显示，旧代次和结束后的迟到心跳不能复活光标
			if (generation && Date.now() >= deadline) clearVisuals();
			if (generation && args.generation === generation) renewVisualLease();
			return {};
		}
		if (op === "clear") {
			clearVisuals();
			plans.clear();
			items = [];
			observationId = "";
			return {};
		}
		if (op === "suspend") {
			clearVisuals();
			return {};
		}
		if (op === "hide") {
			screenshotHidden = true;
			syncVisibility();
			screenshotMask?.remove();
			screenshotMask = document.createElement("div");
			screenshotMask.setAttribute("data-daedalus-feedback", "true");
			screenshotMask.style.cssText =
				"position:fixed;inset:0;z-index:2147483647;pointer-events:none";
			// 脱敏遍历独立于 200 个观察控件的限制；无法完整遮盖时不返回截图
			for (const r of privateRegions()) {
				const cover = document.createElement("div");
				cover.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;background:#777`;
				screenshotMask.append(cover);
			}
			document.documentElement.append(screenshotMask);
			return {};
		}
		if (op === "show") {
			screenshotMask?.remove();
			screenshotMask = null;
			screenshotHidden = false;
			syncVisibility();
			return {};
		}
		if (op === "observe") {
			activity("reading");
			if (outline) outline.style.display = "none";
			const result = collect();
			items = result.nodes;
			observationId = crypto.randomUUID();
			return {
				observationId,
				url: location.href,
				title: document.title.slice(0, 500),
				visibleText: result.text,
				truncated: result.truncated,
				viewport: { width: innerWidth, height: innerHeight },
				elements: items.map((item, id) => ({
					id,
					tagName: item.element.tagName.toLowerCase(),
					name: item.name,
					disabled: item.blocked,
					rect: item.rect,
					type: item.element.getAttribute("type"),
					value: item.blocked
						? undefined
						: (item.element as HTMLInputElement).value?.slice(0, 2000),
					formAction: (item.element as HTMLInputElement).form?.action,
					frame: item.frame,
				})),
			};
		}
		if (op === "scroll") {
			const direction = args.direction,
				pages = args.pages ?? 0.8;
			if (
				(direction !== "up" && direction !== "down") ||
				typeof pages !== "number" ||
				!Number.isFinite(pages) ||
				pages < 0.25 ||
				pages > 3
			)
				fail("browser_invalid_scroll");
			window.scrollBy({
				top: (direction === "up" ? -1 : 1) * innerHeight * pages,
				behavior: "instant",
			});
			activity("scroll", true);
			observationId = "";
			items = [];
			return { url: location.href, scrollY, pages };
		}
		if (op === "wait") {
			activity("waiting");
			if (args.condition === "load" || args.condition === "network_idle")
				return { ready: document.readyState === "complete" };
			if (
				args.condition !== "text" ||
				typeof args.text !== "string" ||
				!args.text.trim() ||
				args.text.length > 1000
			)
				fail("browser_invalid_wait");
			return { ready: collect().text.includes(args.text) };
		}
		if (op === "prepare") {
			if (args.observationId !== observationId)
				fail("browser_observation_stale");
			const steps = args.steps as Record<string, unknown>[],
				signatures = new Map<string, string>(),
				labels: Record<string, string> = {},
				effects: Record<string, string> = {};
			for (const step of steps) {
				const item = items[Number(step.elementId)];
				if (!item || item.blocked) fail("browser_target_forbidden");
				if (
					items.filter((other) => other.signature === item.signature).length !==
					1
				)
					fail("browser_target_ambiguous");
				const el = item.element;
				if (
					el.hasAttribute("download") ||
					(el.tagName === "A" &&
						!/^https?:/u.test((el as HTMLAnchorElement).href))
				)
					fail("browser_download_forbidden");
				if (
					step.action === "fill" &&
					(!["INPUT", "TEXTAREA"].includes(el.tagName) ||
						(el as HTMLInputElement).readOnly ||
						!["", "text", "email", "search", "url", "tel", "number"].includes(
							el.getAttribute("type") || "",
						))
				)
					fail("browser_field_not_editable");
				if (
					step.action === "select" &&
					(el.tagName !== "SELECT" ||
						!Array.from((el as HTMLSelectElement).options).some(
							(o) => !o.disabled && o.value === step.value,
						))
				)
					fail("browser_option_invalid");
				if (
					step.action === "check" &&
					(el.tagName !== "INPUT" || el.getAttribute("type") !== "checkbox")
				)
					fail("browser_checkbox_invalid");
				const isSubmit =
					((el.tagName === "BUTTON" &&
						(!el.getAttribute("type") ||
							el.getAttribute("type") === "submit")) ||
						(el.tagName === "INPUT" && el.getAttribute("type") === "submit")) &&
					!!(el as HTMLInputElement).form;
				if (
					(isSubmit && step.action !== "submit") ||
					(step.action === "submit" && !isSubmit)
				)
					fail("browser_submit_must_be_explicit");
				signatures.set(String(step.id), item.signature);
				labels[String(step.id)] = item.name || el.tagName;
				effects[String(step.id)] = isSubmit
					? `Submit to ${(el as HTMLInputElement).form!.action}`
					: "Website scripts may autosave or cause external effects.";
			}
			const prepareId = crypto.randomUUID();
			plans.set(prepareId, { steps, signatures, form: formState(items) });
			return { prepareId, labels, effects };
		}
		if (op === "execute") {
			const actionId = String(args.actionId);
			if (seen.has(actionId)) return seen.get(actionId);
			const plan = plans.get(String(args.prepareId));
			if (!plan) fail("browser_proposal_stale");
			const step = plan.steps.find((step) => step.id === args.stepId);
			if (!step) fail("browser_step_invalid");
			const latest = collect().nodes;
			if (formState(latest) !== plan.form) fail("browser_form_changed");
			const matches = latest.filter(
				(item) => item.signature === plan.signatures.get(String(step.id)),
			);
			if (matches.length !== 1 || matches[0].blocked)
				fail("browser_target_changed");
			const item = matches[0],
				el = item.element,
				win = el.ownerDocument.defaultView!;
			let frameDocument = document;
			for (const index of item.frame) {
				const frame = frameDocument.querySelectorAll("iframe")[index];
				const child = frame && sameOriginDocument(frame);
				if (!child) fail("browser_target_changed");
				const bounds = frame.getBoundingClientRect(),
					style = frameDocument.defaultView!.getComputedStyle(frame);
				if (
					style.transform !== "none" ||
					!["1", "normal", ""].includes(style.zoom)
				)
					fail("browser_target_changed");
				const hit = frameDocument.elementFromPoint(
					bounds.x + bounds.width / 2,
					bounds.y + bounds.height / 2,
				);
				if (hit !== frame) fail("browser_target_obscured");
				frameDocument = child;
			}
			if (
				item.rect.x < 0 ||
				item.rect.y < 0 ||
				item.rect.x + item.rect.width > innerWidth ||
				item.rect.y + item.rect.height > innerHeight
			)
				fail("browser_target_outside_viewport");
			const local = el.getBoundingClientRect(),
				root = el.getRootNode() as Document | ShadowRoot;
			const hit = root.elementFromPoint(
				local.x + local.width / 2,
				local.y + local.height / 2,
			);
			if (!hit || (hit !== el && !el.contains(hit)))
				fail("browser_target_obscured");
			seen.set(actionId, { actionId, status: "unknown" });
			try {
				if (step.action === "fill" || step.action === "select") {
					const prototype = Object.getPrototypeOf(el),
						setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
					if (!setter) fail("browser_field_unsupported");
					setter.call(el, String(step.value));
					el.dispatchEvent(new win.Event("input", { bubbles: true }));
					el.dispatchEvent(new win.Event("change", { bubbles: true }));
				} else if (step.action === "check") {
					if ((el as HTMLInputElement).checked !== step.checked) el.click();
				} else if (step.action === "click" || step.action === "submit")
					el.click();
				else fail("browser_action_invalid");
				highlight(item, step.action === "click" || step.action === "submit");
				// 只更新自身已批准字段的值；新增字段或其他字段变化要求新方案
				const expected = JSON.parse(plan.form) as Record<string, unknown>[];
				const ownIndex = latest.indexOf(item);
				if (step.action === "fill" || step.action === "select")
					expected[ownIndex].value = String(step.value);
				if (step.action === "check") expected[ownIndex].checked = step.checked;
				plan.form = JSON.stringify(expected);
				const result = {
					actionId,
					status: "dispatched",
					effectConfirmed: false,
					url: location.href,
				};
				seen.set(actionId, result);
				return result;
			} catch {
				return {
					actionId,
					status: "unknown",
					code: "browser_action_unconfirmed",
				};
			}
		}
		return fail("browser_operation_forbidden");
	};
}
