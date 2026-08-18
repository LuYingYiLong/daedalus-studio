import type { CopyConfig } from "antd/es/typography/Base";
import { Icon } from "@/assets/icons";

/** 创建统一的 Typography 复制操作配置，确保复制前后都使用 Studio 图标。 */
export function createStudioCopyableConfig(
	options: Omit<CopyConfig, "icon"> = {},
): CopyConfig {
	return {
		...options,
		icon: [
			<Icon name="copy" key="copy" />,
			<Icon name="check" key="copied" />,
		],
	};
}
