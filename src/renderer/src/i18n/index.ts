import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
	getCachedClientPreferences,
	type LanguagePreference
} from "@/api/client-preferences-api";
import enUS from "./locales/en-US/common.json";
import zhCN from "./locales/zh-CN/common.json";

export type ResolvedLanguage = "en-US" | "zh-CN";

export function resolveSystemLanguage(language: string | undefined = navigator.language): ResolvedLanguage {
	return language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function resolveLanguagePreference(languagePreference: LanguagePreference): ResolvedLanguage {
	return languagePreference === "system" ? resolveSystemLanguage() : languagePreference;
}

void i18n
	.use(initReactI18next)
	.init({
		resources: {
			"en-US": {
				common: enUS
			},
			"zh-CN": {
				common: zhCN
			}
		},
		lng: resolveLanguagePreference(getCachedClientPreferences().language),
		fallbackLng: "en-US",
		defaultNS: "common",
		interpolation: {
			escapeValue: false
		},
		react: {
			useSuspense: false
		}
	});

export default i18n;
