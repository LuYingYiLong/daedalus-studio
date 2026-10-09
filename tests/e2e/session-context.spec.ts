import { expect, test } from "./fixtures/studio";

const SOURCE_ID = "session-reference-source";

test("searches and attaches a Chat session from the menu", async ({
  launchStudio,
  mockBackend,
}) => {
  const attached: Array<{
    id: string;
    kind: string;
    title: string;
    data: { sessionId: string };
  }> = [];
  const workbench = () => ({
    revision: 2,
    sessionId: "session-e2e-1",
    composer: {
      text: "",
      chatMode: "agent",
      provider: "openai",
      model: "gpt-4o-mini",
      additionalContext: attached,
    },
    messageQueue: [],
    pendingGuides: [],
    activeRun: { status: "idle" },
    pendingApproval: { count: 0, first: null },
    pendingToolBudget: null,
    nextStepHints: { hints: [] },
    activeSelection: {
      workspaceId: null,
      workspaceName: null,
      workspaceRoot: null,
    },
  });
  mockBackend.setHandler("session.workbench.patch", ({ params }) => {
    const action = (
      params as {
        additionalContextAction?: {
          action?: string;
          item?: (typeof attached)[number];
        };
      }
    ).additionalContextAction;
    if (action?.action === "addOrReplace" && action.item !== undefined) {
      const index = attached.findIndex((item) => item.id === action.item!.id);
      if (index >= 0) attached[index] = action.item;
      else attached.push(action.item);
    }
    return { changed: true, workbench: workbench() };
  });
  mockBackend.setHandler("session.workbench.get", () => ({
    changed: false,
    workbench: workbench(),
  }));
  const source = {
    id: SOURCE_ID,
    title: "Historical design notes",
    workspaceId: "workspace-reference",
    workspaceName: "Research",
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T01:00:00.000Z",
  };
  mockBackend.setHandler("session.list", () => ({ sessions: [source] }));
  mockBackend.setHandler("session.context.search", () => ({
    sessions: [{ metadata: source, snippet: "The original design decision" }],
    nextOffset: null,
  }));
  const { mainWindow } = await launchStudio();
  await mainWindow.getByTestId("composer-options-button").click();
  await mainWindow
    .getByRole("menuitem", { name: /Add session|添加会话/ })
    .click();
  await expect(
    mainWindow.getByRole("dialog", {
      name: /Add session context|添加会话上下文/,
    }),
  ).toBeVisible();
  await mainWindow
    .getByPlaceholder(/Search session titles or messages|搜索会话标题或内容/)
    .fill("design");
  await expect
    .poll(() => mockBackend.getRequests("session.context.search").length)
    .toBeGreaterThan(0);
  const dialog = mainWindow.getByRole("dialog", {
    name: /Add session context|添加会话上下文/,
  });
  await expect(dialog.locator(".ant-modal-footer")).toHaveCount(0);
  await expect(dialog.getByRole("switch")).toHaveCount(0);
  await dialog
    .getByRole("menuitem", { name: /Historical design notes/ })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    mainWindow
      .locator("[data-studio-composer]")
      .getByText("Historical design notes"),
  ).toBeVisible();
  const composer = mainWindow.locator("[data-studio-composer] textarea");
  await composer.fill("Use the design notes");
  await composer.press("Enter");
  await expect.poll(() => mockBackend.getRequests("ai.chat").length).toBe(1);
  const request = mockBackend.getRequests("ai.chat")[0]!;
  const params = request.params as {
    additionalContext?: Array<{ kind: string; data: { sessionId: string } }>;
  };
  expect(
    params.additionalContext?.some(
      (item) => item.kind === "session" && item.data.sessionId === SOURCE_ID,
    ),
  ).toBe(true);
  const openSource = mainWindow
    .locator('[data-entry-kind="user"]')
    .getByRole("button", { name: /Open source session|打开来源会话/ });
  await expect(openSource).toBeVisible();
  await openSource.click();
  await expect
    .poll(() =>
      mockBackend
        .getRequests("session.open")
        .some(
          (entry) =>
            (entry.params as { sessionId?: string }).sessionId === SOURCE_ID,
        ),
    )
    .toBe(true);
});
