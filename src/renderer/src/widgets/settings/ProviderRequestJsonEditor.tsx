import { useMemo } from "react";
import type { FileTabPreferences } from "@/domain/session/session-layout";
import MonacoFileEditor, {
	type FileBuffer,
	type MonacoFileEditorHandle,
} from "@/widgets/files/MonacoFileEditor";

export type ProviderRequestJsonEditorHandle = MonacoFileEditorHandle;

type ProviderRequestJsonEditorProps = {
	value: string;
	readOnly: boolean;
	onChange: (value: string) => void;
	editorRef: React.Ref<ProviderRequestJsonEditorHandle>;
	ariaLabel: string;
};

const PROVIDER_REQUEST_TAB: FileTabPreferences = {
	key: "provider-request-config:request-overrides.json",
	sourceFolderId: "provider-settings",
	relativePath: "request-overrides.json",
	pinned: true,
};

function ProviderRequestJsonEditor({
	value,
	readOnly,
	onChange,
	editorRef,
	ariaLabel,
}: ProviderRequestJsonEditorProps): React.JSX.Element {
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
			activeTab={PROVIDER_REQUEST_TAB}
			activeBuffer={buffer}
			tabKeys={[PROVIDER_REQUEST_TAB.key]}
			panelKey="provider-request-config"
			workspace={null}
			bottomSafeArea={0}
			onContentChange={(_tab: FileTabPreferences, content: string): void => onChange(content)}
			onAddContext={(): void => undefined}
			editorHandleRef={editorRef}
			ariaLabel={ariaLabel}
			readOnly={readOnly}
			enableSelectionTools={false}
		/>
	);
}

export default ProviderRequestJsonEditor;
