import { useMemo } from "react";
import type { FileTabPreferences } from "@/domain/session/session-layout";
import MonacoFileEditor, {
	type FileBuffer,
	type MonacoFileEditorHandle,
} from "@/widgets/files/MonacoFileEditor";

export type HooksJsonEditorHandle = MonacoFileEditorHandle;

type HooksJsonEditorProps = {
	value: string;
	readOnly: boolean;
	onChange: (value: string) => void;
	editorRef: React.Ref<HooksJsonEditorHandle>;
};

const HOOKS_TAB: FileTabPreferences = {
	key: "hooks-settings:hooks.json",
	sourceFolderId: "hooks-settings",
	relativePath: "hooks.json",
	pinned: true,
};

function HooksJsonEditor({
	value,
	readOnly,
	onChange,
	editorRef,
}: HooksJsonEditorProps): React.JSX.Element {
	const buffer: FileBuffer = useMemo(
		(): FileBuffer => ({
			content: value,
			savedContent: value,
			isDirty: false,
			sha256: "",
			modifiedAtMs: 0,
			byteSize: new TextEncoder().encode(value).byteLength,
			readable: true,
			binary: false,
			oversized: false,
			loading: false,
			saving: false,
			conflict: false,
			error: null,
		}),
		[value],
	);

	return (
		<MonacoFileEditor
			activeTab={HOOKS_TAB}
			activeBuffer={buffer}
			tabKeys={[HOOKS_TAB.key]}
			panelKey="hooks-settings"
			workspace={null}
			bottomSafeArea={0}
			onContentChange={(
				_tab: FileTabPreferences,
				content: string,
			): void => onChange(content)}
			onAddContext={(): void => undefined}
			editorHandleRef={editorRef}
			ariaLabel="hooks.json"
			readOnly={readOnly}
			enableSelectionTools={false}
		/>
	);
}

export default HooksJsonEditor;
