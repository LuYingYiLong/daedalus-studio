export type ConceptVideoLanguage = "en-US" | "zh-CN";

export type ConceptVideoCopy = {
	windowTitle: string;
	newSession: string;
	pinned: string;
	noPinned: string;
	projects: string;
	recent: string;
	recentSession: string;
	settings: string;
	projectNames: readonly string[];
	homeTitleLine1: string;
	homeTitleLine2: string;
	homeSubtitle: string;
	starterLabels: readonly string[];
	composerPlaceholder: string;
	model: string;
	reasoning: string;
	noWorkspace: string;
	conversationTitle: string;
	userMessage: string;
	responseTime: string;
	thinking: string;
	assistantLines: readonly string[];
	toolSummary: string;
	toolCount: string;
	workspaceContext: string;
};

const ENGLISH_CONCEPT_VIDEO_COPY: ConceptVideoCopy = {
	windowTitle: "Daedalus Studio",
	newSession: "New session",
	pinned: "Pinned",
	noPinned: "No pinned sessions",
	projects: "Projects",
	recent: "Recent",
	recentSession: "Project structure review",
	settings: "Settings",
	projectNames: ["l4d2-manager", "test2", "Miscard", "daedalus-backend", "test"],
	homeTitleLine1: "Good evening, what",
	homeTitleLine2: "shall we move forward?",
	homeSubtitle: "Choose a workspace, or just describe what is on your mind",
	starterLabels: ["Shape an idea", "Make a plan", "Explain a concept"],
	composerPlaceholder: "Describe what you want me to check, change, or do",
	model: "DeepSeek / DeepSeek V4 Flash",
	reasoning: "Max",
	noWorkspace: "No workspace",
	conversationTitle: "Daedalus v1.1.4 release notes",
	userMessage: "Summarize what changed from v1.1.3 to v1.1.4",
	responseTime: "Responded · 3m 07s",
	thinking: "Thinking",
	assistantLines: [
		"I checked the repositories in the current workspace and reviewed the commits between the two releases.",
		"The backend, studio, and bridge projects each contain a focused set of changes.",
		"I will organize the result by product area and call out the user-visible improvements first."
	],
	toolSummary: "Used tools",
	toolCount: "3 tools · 2 thoughts",
	workspaceContext: "daedalus-backend"
};

const CHINESE_CONCEPT_VIDEO_COPY: ConceptVideoCopy = {
	windowTitle: "Daedalus Studio",
	newSession: "新建会话",
	pinned: "置顶",
	noPinned: "暂无置顶会话",
	projects: "项目",
	recent: "最近",
	recentSession: "Daedalus v1.1.4 更新总结",
	settings: "打开设置",
	projectNames: ["l4d2-manager", "test2", "Miscard", "daedalus-backend", "test"],
	homeTitleLine1: "晚上好，今天还想推进",
	homeTitleLine2: "什么？",
	homeSubtitle: "先选择一个 workspace，或者直接说说你的想法",
	starterLabels: ["一起梳理想法", "做一份实施计划", "解释一个概念"],
	composerPlaceholder: "描述需要我检查、修改或执行的内容",
	model: "DeepSeek / DeepSeek V4 Flash",
	reasoning: "最大",
	noWorkspace: "无 workspace",
	conversationTitle: "Daedalus v1.1.4 更新总结",
	userMessage: "总结一下Daedalus从v1.1.3更新到v1.1.4的更新内容",
	responseTime: "已响应 · 3m 07s",
	thinking: "思考过程",
	assistantLines: [
		"我先确认当前工作区包含哪些仓库，再读取 v1.1.3 到 v1.1.4 之间的提交记录来总结。",
		"工作区里有三个仓库（backend / studio / bridge），我会检查每个仓库的版本变化。",
		"接下来我会按产品区域整理结果，并优先说明用户能感知到的改进。"
	],
	toolSummary: "使用了工具",
	toolCount: "使用了 3 次工具，思考了 2 次",
	workspaceContext: "daedalus-backend"
};

export function getConceptVideoCopy(language: ConceptVideoLanguage): ConceptVideoCopy {
	return language === "zh-CN" ? CHINESE_CONCEPT_VIDEO_COPY : ENGLISH_CONCEPT_VIDEO_COPY;
}
