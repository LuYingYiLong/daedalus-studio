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
	recentSession: "Sample project structure",
	settings: "Settings",
	projectNames: ["Sample project", "Demo workspace", "Game prototype", "Docs", "Playground"],
	homeTitleLine1: "Good evening, what",
	homeTitleLine2: "shall we move forward?",
	homeSubtitle: "Choose a workspace, or just describe what is on your mind",
	starterLabels: ["Shape an idea", "Make a plan", "Explain a concept"],
	composerPlaceholder: "Describe what you want me to check, change, or do",
	model: "DeepSeek / DeepSeek V4 Flash",
	reasoning: "Max",
	noWorkspace: "No workspace",
	conversationTitle: "Sample project structure",
	userMessage: "Help me understand this sample project",
	responseTime: "Responded · 3m 07s",
	thinking: "Thinking",
	assistantLines: [
		"I checked the sample project's entry points and mapped the main folders and files.",
		"The structure is small enough to keep the first pass focused and easy to verify.",
		"I will organize the result by feature area and call out the safest next step first."
	],
	toolSummary: "Used tools",
	toolCount: "3 tools · 2 thoughts",
	workspaceContext: "Sample project"
};

const CHINESE_CONCEPT_VIDEO_COPY: ConceptVideoCopy = {
	windowTitle: "Daedalus Studio",
	newSession: "新建会话",
	pinned: "置顶",
	noPinned: "暂无置顶会话",
	projects: "项目",
	recent: "最近",
	recentSession: "示例项目结构分析",
	settings: "打开设置",
	projectNames: ["示例项目", "演示工作区", "游戏原型", "文档", "练习项目"],
	homeTitleLine1: "晚上好，今天还想推进",
	homeTitleLine2: "什么？",
	homeSubtitle: "先选择一个 workspace，或者直接说说你的想法",
	starterLabels: ["一起梳理想法", "做一份实施计划", "解释一个概念"],
	composerPlaceholder: "描述需要我检查、修改或执行的内容",
	model: "DeepSeek / DeepSeek V4 Flash",
	reasoning: "最大",
	noWorkspace: "无 workspace",
	conversationTitle: "示例项目结构分析",
	userMessage: "帮我梳理一下这个示例项目的结构",
	responseTime: "已响应 · 3m 07s",
	thinking: "思考过程",
	assistantLines: [
		"我先确认示例项目的入口和主要目录，再整理文件之间的关系。",
		"这个项目的结构比较清晰，我会把结果按功能区域分组，方便继续探索。",
		"接下来我会给出一个安全、具体的下一步建议。"
	],
	toolSummary: "使用了工具",
	toolCount: "使用了 3 次工具，思考了 2 次",
	workspaceContext: "示例项目"
};

export function getConceptVideoCopy(language: ConceptVideoLanguage): ConceptVideoCopy {
	return language === "zh-CN" ? CHINESE_CONCEPT_VIDEO_COPY : ENGLISH_CONCEPT_VIDEO_COPY;
}
