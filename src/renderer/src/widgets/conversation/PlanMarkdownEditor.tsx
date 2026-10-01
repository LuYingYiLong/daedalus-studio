import { useMemo } from "react";
import type { FileTabPreferences } from "@/domain/session/session-layout";
import MonacoFileEditor, { type FileBuffer } from "@/widgets/files/MonacoFileEditor";

type PlanMarkdownEditorProps = {
	planId: string;
	value: string;
	readOnly: boolean;
	onChange: (value: string) => void;
};

export default function PlanMarkdownEditor({ planId, value, readOnly, onChange }: PlanMarkdownEditorProps): React.JSX.Element {
	const tab: FileTabPreferences = useMemo((): FileTabPreferences => ({
		key: `plan:${planId}`,
		sourceFolderId: `plan:${planId}`,
		relativePath: "PLAN.md",
		pinned: true,
	}), [planId]);
	const buffer: FileBuffer = useMemo((): FileBuffer => ({
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
	}), [value]);
	return <MonacoFileEditor
		activeTab={tab}
		activeBuffer={buffer}
		tabKeys={[tab.key]}
		panelKey={`plan:${planId}`}
		workspace={null}
		bottomSafeArea={0}
		onContentChange={(_tab: FileTabPreferences, content: string): void => onChange(content)}
		onAddContext={(): void => undefined}
		ariaLabel="PLAN.md"
		readOnly={readOnly}
		enableSelectionTools={false}
	/>;
}
