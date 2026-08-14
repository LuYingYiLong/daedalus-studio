import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("session fork UI", () => {
	it("adds an accessible fork action to user messages", () => {
		const bubble: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "UserBubble.tsx");
		const messageList: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "MessageList.tsx");

		expect(bubble).toContain('icon={<Icon name="fork" />}');
		expect(bubble).toContain('aria-label={t("chat.user.forkAria")}');
		expect(bubble).toContain('title={t("chat.user.actions.forkFromHere")}');
		expect(bubble).toContain("loading={isForking}");
		expect(messageList).toContain("onForkFromUserMessage={onForkFromUserMessage}");
		expect(messageList).toContain("isForking={forkingRequestId === block.requestId}");
	});

	it("adds the same operation to the session context menu and disables running sources", () => {
		const tree: string = readRepoFile("src", "renderer", "src", "widgets", "workspace", "WorkspaceTree.tsx");

		expect(tree).toContain('key: "fork"');
		expect(tree).toContain('icon: <Icon name="fork" />');
		expect(tree).toContain("disabled: isRunning || options.forkingSessionId !== null");
		expect(tree).toContain("options.onFork(session);");
	});

	it("activates the fork result without clearing its composer and renders its origin divider", () => {
		const controller: string = readRepoFile("src", "renderer", "src", "app", "runtime", "useAppController.tsx");
		const home: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
		const divider: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "DividerPart.tsx");

		expect(controller).toContain("const result: SessionForkResult = await forkSession({");
		expect(controller).toContain("setWorkbench(result.workbench);");
		expect(controller).not.toContain("setWorkbench({ ...result.workbench, composer: { ...result.workbench.composer, text: \"\" } });");
		expect(home).toContain("activeSessionMetadata?.forkedFrom");
		expect(home).toContain('icon={<Icon name="fork" />}');
		expect(home).toContain("onForkSourceOpen(activeSessionMetadata.forkedFrom!.sessionId)");
		expect(home).toContain("onOpenForkSource={onForkSourceOpen}");
		expect(divider).toContain('block.dividerKind === "fork_origin"');
		expect(divider).toContain("origin.messagePreview");
		expect(divider).toContain("onOpenForkSource?.(origin.sessionId)");
		expect(divider).toContain('t("chat.fork.modelChanged"');
	});
});
