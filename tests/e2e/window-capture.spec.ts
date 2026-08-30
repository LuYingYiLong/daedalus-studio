import type { ElectronApplication, Page } from "@playwright/test";
import { test, expect } from "./fixtures/studio";
import { installImageAttachmentScenario } from "./fixtures/image-attachments";

const PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function mockCapture(app: ElectronApplication): Promise<string> {
	return app.evaluate(
		({ desktopCapturer, nativeImage, BrowserWindow }, png) => {
			const fullImage = nativeImage.createFromBitmap(
				Buffer.alloc(128 * 64 * 4, 160),
				{ width: 128, height: 64 },
			);
			desktopCapturer.getSources = async (options) => {
				if (options.types.length !== 1 || options.types[0] !== "window")
					throw new Error("test_only_windows_allowed");
				const image =
					options.thumbnailSize?.width === 2560
						? fullImage
						: nativeImage.createFromBuffer(Buffer.from(png, "base64"));
				return [
					{
						id: "window:1234:0",
						name: "Screenshot test window",
						thumbnail: image,
						appIcon: nativeImage.createEmpty(),
						display_id: "",
					},
					{
						id: BrowserWindow.getAllWindows()[0]!.getMediaSourceId(),
						name: "Studio private window",
						thumbnail: image,
						appIcon: nativeImage.createEmpty(),
						display_id: "",
					},
				];
			};
			return fullImage.toDataURL();
		},
		PNG,
	);
}
async function openPicker(page: Page) {
	await page.getByTestId("composer-options-button").click();
	await page
		.getByRole("menuitem", { name: /Window screenshot|窗口截图/ })
		.click();
	const dialog = page.getByRole("dialog", {
		name: /Window screenshot|窗口截图/,
	});
	await expect(
		dialog.getByRole("button", { name: "Screenshot test window" }),
	).toBeVisible();
	return dialog;
}

test.describe("Windows window screenshot context", () => {
	test.skip(
		process.platform !== "win32",
		"Only Windows desktop provides window capture",
	);
	test("cancel is side-effect free; clicking a thumbnail imports the full capture, sends and reopens", async ({
		launchStudio,
		mockBackend,
	}, testInfo) => {
		installImageAttachmentScenario(mockBackend);
		const { mainWindow, electronApp } = await launchStudio();
		const dataUrl = await mockCapture(electronApp);
		let dialog = await openPicker(mainWindow);
		await expect(dialog.getByText("Studio private window")).toHaveCount(0);
		await expect(
			dialog.getByRole("button", {
				name: /Add to context|添加到上下文|Capture again|重新截图/,
			}),
		).toHaveCount(0);
		await expect(
			dialog.getByRole("region", { name: /Screenshot preview|截图预览/ }),
		).toHaveCount(0);
		await dialog.getByRole("textbox").fill("missing");
		await expect(
			dialog.getByText(/No matching windows|没有匹配的窗口/),
		).toBeVisible();
		await dialog.getByRole("textbox").fill("Screenshot");
		expect(mockBackend.getRequests("session.create")).toHaveLength(0);
		expect(mockBackend.getRequests("attachment.image.save")).toHaveLength(0);
		await mainWindow.keyboard.press("Escape");
		await expect(dialog).not.toBeVisible();
		await expect(mainWindow.getByTestId("composer-input")).toBeFocused();
		dialog = await openPicker(mainWindow);
		await mainWindow.screenshot({
			animations: "disabled",
			path: testInfo.outputPath("window-screenshot-picker.png"),
		});
		await dialog
			.getByRole("button", { name: "Screenshot test window" })
			.press("Enter");
		await expect(dialog).not.toBeVisible();
		const save = await mockBackend.waitForRequest("attachment.image.save");
		expect(save.params).toMatchObject({
			dataUrl,
			mimeType: "image/png",
			width: 128,
			height: 64,
		});
		expect(save.params).not.toHaveProperty("sourcePath");
		expect(JSON.stringify(save.params)).not.toContain("Screenshot test window");
		expect(mockBackend.getRequests("attachment.image.save")).toHaveLength(1);
		expect(mockBackend.getRequests("session.create")).toHaveLength(1);
		await expect(mainWindow.getByTestId("composer-input")).toBeFocused();
		await expect(
			mainWindow.getByText(/(?:窗口截图|Window screenshot)-.*\.png/).first(),
		).toBeVisible();
		await mainWindow
			.getByTestId("composer-input")
			.fill("Describe my screenshot");
		await mainWindow.getByTestId("composer-input").press("Enter");
		const chat = await mockBackend.waitForRequest("ai.chat");
		expect(chat.params).toMatchObject({
			additionalContext: [expect.objectContaining({ kind: "image" })],
		});
		await mainWindow.getByText("Screenshot history", { exact: true }).click();
		await mainWindow
			.getByText("Captured window session", { exact: true })
			.first()
			.click();
		await expect(
			mainWindow.getByText("Mock screenshot received", { exact: true }),
		).toBeVisible();
		await expect(
			mainWindow.getByText(/(?:窗口截图|Window screenshot)-.*\.png/).first(),
		).toBeVisible();
		expect(mockBackend.getUnhandledRequests()).toEqual([]);
	});
	test("failed captures can retry by clicking; navigation invalidates pending capture", async ({
		launchStudio,
		mockBackend,
	}) => {
		installImageAttachmentScenario(mockBackend);
		const { mainWindow, electronApp } = await launchStudio();
		await mockCapture(electronApp);
		let dialog = await openPicker(mainWindow);
		await electronApp.evaluate(({ desktopCapturer }) => {
			desktopCapturer.getSources = async () => [];
		});
		await dialog
			.getByRole("button", { name: "Screenshot test window" })
			.click();
		await expect(
			dialog.getByText(/window has closed|目标窗口已关闭/),
		).toBeVisible();
		await mockCapture(electronApp);
		await dialog
			.getByRole("button", { name: "Screenshot test window" })
			.click();
		await expect(dialog).not.toBeVisible();
		expect(mockBackend.getRequests("attachment.image.save")).toHaveLength(1);
		dialog = await openPicker(mainWindow);
		await dialog
			.getByRole("button", { name: /Refresh windows|刷新列表/ })
			.click();
		await expect(
			dialog.getByRole("button", { name: "Screenshot test window" }),
		).toHaveAttribute("aria-disabled", "false");
		await electronApp.evaluate(({ desktopCapturer }) => {
			const mockSources = desktopCapturer.getSources;
			desktopCapturer.getSources = async (options) => {
				await new Promise((resolve) => setTimeout(resolve, 500));
				return mockSources(options);
			};
		});
		await dialog
			.getByRole("button", { name: "Screenshot test window" })
			.click();
		await mainWindow
			.getByText("Screenshot history", { exact: true })
			.dispatchEvent("click");
		await expect(dialog).not.toBeVisible();
		await expect(mainWindow.getByTestId("composer-input")).toBeVisible();
		expect(mockBackend.getRequests("attachment.image.save")).toHaveLength(1);
		expect(mockBackend.getUnhandledRequests()).toEqual([]);
	});
	test("a short window shows a compact list and clicking imports without a preview", async ({
		launchStudio,
		mockBackend,
	}, testInfo) => {
		installImageAttachmentScenario(mockBackend);
		const { mainWindow, electronApp } = await launchStudio();
		await mainWindow.setViewportSize({ width: 900, height: 600 });
		await electronApp.evaluate(({ desktopCapturer, nativeImage }) => {
			const image = nativeImage.createFromBitmap(
				Buffer.alloc(1200 * 720 * 4, 220),
				{ width: 1200, height: 720 },
			);
			desktopCapturer.getSources = async () =>
				Array.from({ length: 12 }, (_, index) => ({
					id: `window:${8000 + index}:0`,
					name:
						index === 0 ? "Screenshot test window" : `Fixture window ${index}`,
					thumbnail: image,
					appIcon: nativeImage.createEmpty(),
					display_id: "",
				}));
		});
		const dialog = await openPicker(mainWindow);
		await expect(
			dialog.getByRole("button", { name: /Refresh windows|刷新列表/ }),
		).toBeInViewport();
		await expect(
			dialog.getByRole("button", { name: "Close", exact: true }),
		).toBeInViewport();
		await expect(
			dialog.getByRole("region", { name: /Screenshot preview|截图预览/ }),
		).toHaveCount(0);
		await mainWindow.screenshot({
			animations: "disabled",
			path: testInfo.outputPath("short-window-picker.png"),
		});
		await dialog
			.getByRole("button", { name: "Fixture window 11", exact: true })
			.click();
		await expect(dialog).not.toBeVisible();
		const save = await mockBackend.waitForRequest("attachment.image.save");
		expect(save.params).toMatchObject({ width: 1200, height: 720 });
		expect(mockBackend.getUnhandledRequests()).toEqual([]);
	});
	test("save failure retries on the same tile and the fourth image never reaches storage", async ({
		launchStudio,
		mockBackend,
	}) => {
		installImageAttachmentScenario(mockBackend);
		const { mainWindow, electronApp } = await launchStudio();
		await mockCapture(electronApp);
		let dialog = await openPicker(mainWindow);
		mockBackend.setResponseError(
			"attachment.image.save",
			"test_save_failed",
			"test_save_failed",
		);
		await dialog
			.getByRole("button", { name: "Screenshot test window" })
			.click();
		await expect(
			dialog.getByText(
				/Could not save the attachment|附件保存或上下文更新失败/,
			),
		).toBeVisible();
		mockBackend.clearResponseError("attachment.image.save");
		await dialog
			.getByRole("button", { name: "Screenshot test window" })
			.click();
		await expect(dialog).not.toBeVisible();
		for (let index = 0; index < 2; index += 1) {
			dialog = await openPicker(mainWindow);
			await dialog
				.getByRole("button", { name: "Screenshot test window" })
				.click();
			await expect(dialog).not.toBeVisible();
		}
		const saves = mockBackend.getRequests("attachment.image.save").length;
		dialog = await openPicker(mainWindow);
		await dialog
			.getByRole("button", { name: "Screenshot test window" })
			.click();
		await expect(
			dialog.getByText(/up to 3 images|最多添加 3 张图片/),
		).toBeVisible();
		expect(mockBackend.getRequests("attachment.image.save")).toHaveLength(
			saves,
		);
		await mainWindow.keyboard.press("Escape");
		await expect(dialog).not.toBeVisible();
		expect(mockBackend.getUnhandledRequests()).toEqual([]);
	});
});
