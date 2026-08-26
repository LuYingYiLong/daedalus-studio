export type SettingsPageKey =
	| "provider"
	| "default_model"
	| "general"
	| "appearance"
	| "keyboard_shortcuts"
	| "search"
	| "statistics"
	| "personalization"
	| "mcp_servers"
	| "skills"
	| "hooks"
	| "browser"
	| "environments"
	| "worktrees"
	| "plugins"
	| "documentation"
	| "godot_projects"
	| "archived_sessions"
	| "import"
	| "about";

export type SettingsSearchEntry = {
	key: string;
	page: SettingsPageKey;
	titleKey: string;
	descriptionKey?: string;
};

/** Static index for pages that are not mounted until selected. */
export const SETTINGS_SEARCH_ENTRIES: readonly SettingsSearchEntry[] = [
	{ key: "page:provider", page: "provider", titleKey: "settings.menu.provider" },
	{ key: "page:default_model", page: "default_model", titleKey: "settings.menu.defaultModel" },
	{ key: "page:general", page: "general", titleKey: "settings.menu.general" },
	{ key: "page:appearance", page: "appearance", titleKey: "settings.menu.appearance" },
	{ key: "page:keyboard_shortcuts", page: "keyboard_shortcuts", titleKey: "settings.menu.keyboardShortcuts" },
	{ key: "page:search", page: "search", titleKey: "settings.menu.search" },
	{ key: "page:statistics", page: "statistics", titleKey: "settings.menu.statistics" },
	{ key: "page:personalization", page: "personalization", titleKey: "settings.menu.personalization" },
	{ key: "page:mcp_servers", page: "mcp_servers", titleKey: "settings.menu.mcpServers" },
	{ key: "page:skills", page: "skills", titleKey: "settings.menu.skills" },
	{ key: "page:hooks", page: "hooks", titleKey: "settings.menu.hooks" },
	{ key: "page:plugins", page: "plugins", titleKey: "settings.menu.plugins" },
	{ key: "page:browser", page: "browser", titleKey: "settings.menu.browser" },
	{ key: "page:environments", page: "environments", titleKey: "settings.menu.environments" },
	{ key: "page:worktrees", page: "worktrees", titleKey: "settings.menu.worktrees" },
	{ key: "page:documentation", page: "documentation", titleKey: "settings.menu.documentation" },
	{ key: "page:godot_projects", page: "godot_projects", titleKey: "settings.menu.godotProjects" },
	{ key: "page:archived_sessions", page: "archived_sessions", titleKey: "settings.menu.archivedSessions" },
	{ key: "page:import", page: "import", titleKey: "settings.menu.import" },
	{ key: "page:about", page: "about", titleKey: "settings.menu.about" },

	{ key: "item:default_model.sessionTitle", page: "default_model", titleKey: "settings.defaultModel.routing.sessionTitle.title", descriptionKey: "settings.defaultModel.routing.sessionTitle.description" },
	{ key: "item:default_model.nextStepHints", page: "default_model", titleKey: "settings.defaultModel.routing.nextStepHints.title", descriptionKey: "settings.defaultModel.routing.nextStepHints.description" },
	{ key: "item:default_model.goalEvaluator", page: "default_model", titleKey: "settings.defaultModel.routing.goalEvaluator.title", descriptionKey: "settings.defaultModel.routing.goalEvaluator.description" },
	{ key: "item:default_model.contextCompression", page: "default_model", titleKey: "settings.defaultModel.routing.contextCompression.title", descriptionKey: "settings.defaultModel.routing.contextCompression.description" },
	{ key: "item:default_model.imageRecognition", page: "default_model", titleKey: "settings.defaultModel.routing.imageRecognition.title", descriptionKey: "settings.defaultModel.routing.imageRecognition.description" },
	{ key: "item:default_model.imageGeneration", page: "default_model", titleKey: "settings.defaultModel.routing.imageGeneration.title", descriptionKey: "settings.defaultModel.routing.imageGeneration.description" },
	{ key: "item:default_model.gitCommit", page: "default_model", titleKey: "settings.defaultModel.routing.gitCommit.title", descriptionKey: "settings.defaultModel.routing.gitCommit.description" },
	{ key: "item:default_model.commandReview", page: "default_model", titleKey: "settings.defaultModel.routing.commandReview.title", descriptionKey: "settings.defaultModel.routing.commandReview.description" },

	{ key: "item:general.language", page: "general", titleKey: "settings.general.display.language.title", descriptionKey: "settings.general.display.language.description" },
	{ key: "item:general.notifyOnRunCompleted", page: "general", titleKey: "settings.general.notifications.runCompleted.title", descriptionKey: "settings.general.notifications.runCompleted.description" },
	{ key: "item:general.autoCompactActivityDetails", page: "general", titleKey: "settings.general.general.autoCompactActivityDetails.title", descriptionKey: "settings.general.general.autoCompactActivityDetails.description" },
	{ key: "item:general.developerMode", page: "general", titleKey: "settings.general.general.developerMode.title", descriptionKey: "settings.general.general.developerMode.description" },
	{ key: "item:general.nextStepHintsEnabled", page: "general", titleKey: "settings.general.general.nextStepHintsEnabled.title", descriptionKey: "settings.general.general.nextStepHintsEnabled.description" },
	{ key: "item:general.autoCheckForUpdates", page: "general", titleKey: "settings.general.general.autoCheckForUpdates.title", descriptionKey: "settings.general.general.autoCheckForUpdates.description" },
	{ key: "item:general.minimizeToTrayOnClose", page: "general", titleKey: "settings.general.general.minimizeToTrayOnClose.title", descriptionKey: "settings.general.general.minimizeToTrayOnClose.description" },

	{ key: "item:appearance.themeMode", page: "appearance", titleKey: "settings.appearance.theme.mode.title", descriptionKey: "settings.appearance.theme.mode.description" },
	{ key: "item:appearance.themeColor", page: "appearance", titleKey: "settings.appearance.theme.color.title", descriptionKey: "settings.appearance.theme.color.description" },
	{ key: "item:appearance.motion", page: "appearance", titleKey: "settings.appearance.interface.motion.title", descriptionKey: "settings.appearance.interface.motion.description" },
	{ key: "item:appearance.uiFontSize", page: "appearance", titleKey: "settings.appearance.interface.uiFontSize.title", descriptionKey: "settings.appearance.interface.uiFontSize.description" },
	{ key: "item:appearance.fontFamily", page: "appearance", titleKey: "settings.appearance.fonts.body.title", descriptionKey: "settings.appearance.fonts.body.description" },
	{ key: "item:appearance.fontFamilyCode", page: "appearance", titleKey: "settings.appearance.fonts.code.title", descriptionKey: "settings.appearance.fonts.code.description" },
	{ key: "item:appearance.codeFontSize", page: "appearance", titleKey: "settings.appearance.fonts.codeSize.title", descriptionKey: "settings.appearance.fonts.codeSize.description" },

	{ key: "item:personalization.userPrompt", page: "personalization", titleKey: "settings.personalization.userPrompt.title", descriptionKey: "settings.personalization.userPrompt.description" },
	{ key: "item:personalization.gitCommitPrompt", page: "personalization", titleKey: "settings.personalization.gitCommitPrompt.title", descriptionKey: "settings.personalization.gitCommitPrompt.description" },
	{ key: "item:personalization.commandReviewPrompt", page: "personalization", titleKey: "settings.personalization.commandReviewPrompt.title", descriptionKey: "settings.personalization.commandReviewPrompt.description" },

	{ key: "item:search.enabled", page: "search", titleKey: "settings.search.enabled.title", descriptionKey: "settings.search.enabled.description" },
	{ key: "item:search.model", page: "search", titleKey: "settings.search.model.title", descriptionKey: "settings.search.model.description" },
	{ key: "item:search.maxResults", page: "search", titleKey: "settings.search.maxResults.title", descriptionKey: "settings.search.maxResults.description" },
	{ key: "item:search.maxKeywords", page: "search", titleKey: "settings.search.maxKeywords.title", descriptionKey: "settings.search.maxKeywords.description" },

	{ key: "item:browser.downloadDirectory", page: "browser", titleKey: "settings.browser.downloads.directory" },
	{ key: "item:browser.askEveryTime", page: "browser", titleKey: "settings.browser.downloads.askEveryTime", descriptionKey: "settings.browser.downloads.askEveryTimeDescription" },
	{ key: "item:browser.manageDownloads", page: "browser", titleKey: "settings.browser.downloads.manage", descriptionKey: "settings.browser.downloads.manageDescription" },
	{ key: "item:browser.openMode", page: "browser", titleKey: "settings.browser.links.openMode", descriptionKey: "settings.browser.links.openModeDescription" },
	{ key: "item:browser.history", page: "browser", titleKey: "settings.browser.privacy.history", descriptionKey: "settings.browser.privacy.historyDescription" },
	{ key: "item:browser.permissions", page: "browser", titleKey: "settings.browser.privacy.permissions", descriptionKey: "settings.browser.privacy.permissionsDescription" },
	{ key: "item:browser.clearData", page: "browser", titleKey: "settings.browser.privacy.clearData", descriptionKey: "settings.browser.privacy.clearDataDescription" },
	{ key: "item:browser.savePasswords", page: "browser", titleKey: "settings.browser.passwords.save", descriptionKey: "settings.browser.passwords.saveDescription" },
	{ key: "item:browser.managePasswords", page: "browser", titleKey: "settings.browser.passwords.manage", descriptionKey: "settings.browser.passwords.manageDescription" },
	{ key: "item:browser.aiCdp", page: "browser", titleKey: "settings.browser.aiControl.enable", descriptionKey: "settings.browser.aiControl.description" },

	{ key: "item:environments.godot", page: "environments", titleKey: "settings.environments.runtime.godot.title", descriptionKey: "settings.environments.runtime.godot.notConfigured" },
	{ key: "item:environments.harness", page: "environments", titleKey: "settings.environments.runtime.harness.title", descriptionKey: "settings.environments.runtime.harness.description" },
	{ key: "item:worktrees.rootDirectory", page: "worktrees", titleKey: "settings.worktrees.rootDirectory" },
	{ key: "item:worktrees.fetchBeforeCreate", page: "worktrees", titleKey: "settings.worktrees.fetchBeforeCreate", descriptionKey: "settings.worktrees.fetchBeforeCreateDescription" },
	{ key: "item:worktrees.autoDelete", page: "worktrees", titleKey: "settings.worktrees.autoDelete", descriptionKey: "settings.worktrees.autoDeleteDescription" },
	{ key: "item:worktrees.autoDeleteLimit", page: "worktrees", titleKey: "settings.worktrees.autoDeleteLimit", descriptionKey: "settings.worktrees.autoDeleteLimitDescription" },

	{ key: "item:import.session", page: "import", titleKey: "settings.import.session.importSession.title", descriptionKey: "settings.import.session.importSession.description" },
	{ key: "item:import.plugin", page: "import", titleKey: "settings.import.plugin.title", descriptionKey: "settings.import.plugin.description" },
];
