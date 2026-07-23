import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("MessageQueuePanel source", () => {
	const panelSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "MessageQueuePanel.tsx");
	const panelStyleSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "MessageQueuePanel.module.css");
	const composerSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");
	const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
	const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");
	const queueApiSource: string = readRepoFile("src", "renderer", "src", "api", "message-queue-api.ts");
	const guideApiSource: string = readRepoFile("src", "renderer", "src", "api", "guide-api.ts");
	const packageJsonSource: string = readRepoFile("package.json");

	it("uses sortable dnd-kit rows with explicit draggable and guide icons", () => {
		expect(packageJsonSource).toContain("\"@dnd-kit/core\"");
		expect(packageJsonSource).toContain("\"@dnd-kit/sortable\"");
		expect(packageJsonSource).toContain("\"@dnd-kit/utilities\"");
		expect(panelSource).toContain("from \"@dnd-kit/core\"");
		expect(panelSource).toContain("from \"@dnd-kit/sortable\"");
		expect(panelSource).toContain("verticalListSortingStrategy");
		expect(panelSource).toContain("useSortable({");
		expect(panelSource).toContain("<DndContext");
		expect(panelSource).toContain("<SortableContext");
		expect(panelSource).toContain("Icon name=\"draggable\"");
		expect(panelSource).toContain("Icon name=\"guide\"");
	});

	it("keeps the queue panel visibly rounded", () => {
		expect(panelStyleSource).toContain("border-radius: var(--ds-radius-lg) var(--ds-radius-lg) 0 0;");
		expect(panelStyleSource).toContain("overflow-y: auto;");
		expect(panelStyleSource).toContain("overflow-x: hidden;");
		expect(panelStyleSource).not.toContain("--ds-radius-md");
	});

	it("keeps guide and queued message reorder flows separate", () => {
		expect(panelSource).toContain("function handleQueueDragEnd(event: DragEndEvent): void");
		expect(panelSource).toContain("function handleGuideDragEnd(event: DragEndEvent): void");
		expect(panelSource).toContain("onQueueReorder(nextIds.map((queueId: string): number => Number(queueId)))");
		expect(panelSource).toContain("onGuideReorder(moveBefore(guideIds, String(event.active.id), String(event.over.id)))");
		expect(panelSource).toContain("item.status === \"pending\"");
		expect(panelSource).toContain("disabled={item.status !== \"pending\"}");
		expect(panelSource).toContain("function shouldShowQueueItem(item: MessageQueueItem, activeQueueItemId: number | null | undefined): boolean");
		expect(panelSource).toContain("item.status !== \"sending\" && item.status !== \"approval\"");
		expect(panelSource).toContain("item.id !== activeQueueItemId");
		expect(panelSource).toContain("visibleMessageQueue.map");
	});

	it("wires running sends to queue and Ctrl+Enter to guides", () => {
		expect(composerSource).toContain("onGuideSubmit?: (message: string) => void;");
		expect(composerSource).toContain("function submitGuideMessage(): void");
		expect(composerSource).toContain("event.ctrlKey && !event.shiftKey");
		expect(composerSource).toContain("submitGuideMessage();");
		expect(composerSource).toContain("\"Queue message\"");
		expect(appSource).toContain("async function handleQueueMessageSubmit(nextMessage: string): Promise<void>");
		expect(appSource).toContain("if (isRunControllerActive(runState))");
		expect(appSource).toContain("await addQueuedMessage({");
		expect(appSource).toContain("function appendQueuedRunUserBlock(workbenchSnapshot: WorkbenchSnapshot): void");
		expect(appSource).toContain("appendQueuedRunUserBlock(eventWorkbench)");
		expect(appSource).toContain("async function handleGuideSubmit(nextMessage: string): Promise<void>");
		expect(appSource).toContain("await addGuide(message, getRunControllerRequestId(runState) ?? undefined)");
		expect(appSource).toContain("const composerIsSending: boolean = isRunControllerActive(runState) || isHomeSubmitting;");
		expect(appSource).toContain("getRunControllerRequestId(runState)");
	});

	it("passes workbench queue state through AgentPage and API wrappers", () => {
		expect(agentSource).toContain("<MessageQueuePanel");
		expect(agentSource).toContain("messageQueue={messageQueue}");
		expect(agentSource).toContain("pendingGuides={pendingGuides}");
		expect(queueApiSource).toContain("message.queue.add");
		expect(queueApiSource).toContain("message.queue.remove");
		expect(queueApiSource).toContain("message.queue.reorder");
		expect(guideApiSource).toContain("session.guide.add");
		expect(guideApiSource).toContain("session.guide.delete");
		expect(guideApiSource).toContain("session.guide.reorder");
	});
});
