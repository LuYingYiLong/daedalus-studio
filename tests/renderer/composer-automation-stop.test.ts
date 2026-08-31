import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComposerProps } from "@/widgets/composer/Composer";
import useHomePageComposerController, {
	type HomePageComposerControllerParams,
} from "@/widgets/home/surface/useHomePageComposerController";

const captured = vi.hoisted(() => ({ props: null as ComposerProps | null }));
vi.mock("@/widgets/composer/Composer", () => ({
	default: (props: ComposerProps) => {
		captured.props = props;
		return createElement("textarea", { "data-composer": true });
	},
}));
afterEach(() => {
	captured.props = null;
	vi.unstubAllGlobals();
});

function renderComposer(onCancel: () => void): string {
	function Harness() {
		const controller = useHomePageComposerController({
			state: { composerInstanceKey: "session", isHome: false },
			actions: { onCancel },
		} as HomePageComposerControllerParams);
		return controller.renderComposer(true);
	}
	return renderToStaticMarkup(createElement(Harness));
}

describe("Composer without automation banners", () => {
	it("renders only the composer and stops local automation before cancelling the run", () => {
		const order: string[] = [];
		vi.stubGlobal("window", {
			electronAPI: {
				externalBrowser: {
					stop: () => {
						order.push("browser");
						return Promise.resolve();
					},
				},
				computerObservation: {
					revoke: () => {
						order.push("computer");
						return Promise.resolve();
					},
				},
			},
		});
		expect(
			renderComposer(() => {
				order.push("run");
			}),
		).toBe('<textarea data-composer="true"></textarea>');
		captured.props!.onCancel!();
		expect(order).toEqual(["browser", "computer", "run"]);
	});
	it("keeps normal cancellation working when optional automation APIs are unavailable", () => {
		vi.stubGlobal("window", { electronAPI: {} });
		const cancel = vi.fn();
		renderComposer(cancel);
		captured.props!.onCancel!();
		expect(cancel).toHaveBeenCalledOnce();
	});
});
