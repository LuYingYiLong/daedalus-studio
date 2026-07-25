import { notification } from "antd";
import { useRequest } from "ahooks";

function delay(ms: number): Promise<void> {
	return new Promise((resolve: () => void): void => {
		window.setTimeout(resolve, ms);
	});
}

export function useDiskSpaceCheck(): { checked: boolean } {
	const { data: checked = false } = useRequest(async (): Promise<boolean> => {
		await delay(1000);

		const result = await window.electronAPI.checkDiskSpace();
		if (!result) {
			console.warn("Failed to check disk space");
			return true;
		}

		const freeSpaceGiB: number = result.free / (1024 ** 3);
		if (freeSpaceGiB < 1) {
			notification.warning({
				message: "Low Disk Space",
				description: `The disk containing your Daedalus data has less than 1 GiB of free space remaining (${freeSpaceGiB.toFixed(2)} GiB available). To ensure a smooth experience, please free up some disk space.`,
				duration: 0,
				placement: "topRight"
			});
		}

		console.log(`Disk space check completed: ${freeSpaceGiB.toFixed(2)} GiB free on drive ${result.drive}`);
		return true;
	}, {
		onError: (error: Error): void => {
			console.error("Error checking disk space:", error);
		}
	});

	return { checked };
}
