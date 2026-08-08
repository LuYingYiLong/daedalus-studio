import { Icon } from "@/assets/icons";
import { getFileIconName } from "@/domain/markdown/file-icon";

export type FileIconProps = {
	path?: string;
	className?: string;
};

export function FileIcon({ path, className }: FileIconProps): React.JSX.Element {
	return <Icon name={getFileIconName(path)} className={className} />;
}
