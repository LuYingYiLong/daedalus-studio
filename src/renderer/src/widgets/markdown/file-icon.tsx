import { Icon } from "@/assets/icons";
import { getFileIconName } from "@/domain/markdown/file-icon";

export type FileIconProps = {
	path?: string;
	className?: string;
};

export function FileIcon({ path, className }: FileIconProps): React.JSX.Element {
	const iconName: string = getFileIconName(path);
	return <Icon name={iconName} className={className} data-file-icon={iconName} aria-hidden="true" />;
}
