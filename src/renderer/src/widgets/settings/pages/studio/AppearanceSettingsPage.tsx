import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Alert,
	Button,
	ColorPicker,
	Input,
	InputNumber,
	Segmented,
	Space,
	Switch,
	Tooltip,
	Typography,
} from "antd";
import type { ColorPickerProps } from "antd";
import { Icon } from "@/assets/icons";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import {
	DEFAULT_STUDIO_FONT_FAMILY,
	DEFAULT_STUDIO_FONT_FAMILY_CODE,
} from "../../../../../../contracts/studio-fonts";
import {
	DEFAULT_THEME_COLOR,
	fetchClientPreferences,
	updateClientPreferences,
	type ClientPreferences,
} from "@/platform/rpc/client-preferences-api";
import pageMotionStyles from "@/widgets/settings/components/SettingsPageMotion.module.css";
import styles from "./AppearanceSettingsPage.module.css";

type AppearanceSettingsPageProps = {
	clientPreferences: ClientPreferences;
	onClientPreferencesChange: (preferences: ClientPreferences) => void;
};

type FontFamilyKey = "fontFamily" | "fontFamilyCode";
type SettingKey =
	| FontFamilyKey
	| "theme"
	| "themeColor"
	| "animationsEnabled"
	| "uiFontSize"
	| "codeFontSize";

const DEFAULT_FONT_FAMILIES: Record<FontFamilyKey, string> = {
	fontFamily: DEFAULT_STUDIO_FONT_FAMILY,
	fontFamilyCode: DEFAULT_STUDIO_FONT_FAMILY_CODE,
};

const colorPickerProps: ColorPickerProps = {
	styles: {
		root: { height: 20 },
		body: { height: 20, width: 20 },
	},
};

function AppearanceSettingsPage({
	clientPreferences,
	onClientPreferencesChange,
}: AppearanceSettingsPageProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const [draft, setDraft] = useState<ClientPreferences>(clientPreferences);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [savingKey, setSavingKey] = useState<SettingKey | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect((): void => {
		setDraft(clientPreferences);
	}, [clientPreferences]);

	useEffect((): (() => void) => {
		let cancelled = false;
		void fetchClientPreferences()
			.then((preferences: ClientPreferences): void => {
				if (cancelled) return;
				setDraft(preferences);
				onClientPreferencesChange(preferences);
			})
			.catch((error: unknown): void => {
				if (!cancelled) {
					setErrorMessage(
						error instanceof Error
							? error.message
							: t("settings.appearance.errors.load"),
					);
				}
			})
			.finally((): void => {
				if (!cancelled) setIsLoading(false);
			});
		return (): void => {
			cancelled = true;
		};
	}, [onClientPreferencesChange, t]);

	async function save(
		patch: Partial<ClientPreferences>,
		key: SettingKey,
	): Promise<void> {
		if (savingKey !== null) return;
		const previous = draft;
		const optimistic = { ...previous, ...patch };
		try {
			setSavingKey(key);
			setErrorMessage(null);
			setDraft(optimistic);
			onClientPreferencesChange(optimistic);
			const saved = await updateClientPreferences(patch);
			setDraft(saved);
			onClientPreferencesChange(saved);
		} catch (error: unknown) {
			setDraft(previous);
			onClientPreferencesChange(previous);
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.appearance.errors.save"),
			);
		} finally {
			setSavingKey(null);
		}
	}

	function updateFont(key: FontFamilyKey, value: string): void {
		setDraft(
			(preferences: ClientPreferences): ClientPreferences => ({
				...preferences,
				[key]: value,
			}),
		);
	}

	function saveFont(key: FontFamilyKey): void {
		const value = draft[key].trim();
		if (value !== clientPreferences[key].trim()) {
			void save({ [key]: value }, key);
		}
	}

	function saveFontSize(
		key: "uiFontSize" | "codeFontSize",
		value: number | null,
	): void {
		if (value === null || value === draft[key]) return;
		void save({ [key]: value }, key);
	}

	if (isLoading) return null;

	return (
		<section className={`${styles.page} ${pageMotionStyles.enter}`}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>
					{t("settings.appearance.title")}
				</Typography.Title>
			</header>
			<div className={styles.settingsStack}>
				{errorMessage === null ? null : (
					<Alert
						type="warning"
						showIcon={true}
						description={errorMessage}
						closable={{
							onClose: (): void => setErrorMessage(null),
						}}
						className={styles.alert}
					/>
				)}
				<SettingsList title={t("settings.appearance.theme.title")}>
					<div className={styles.preferenceList}>
						<SettingsItem
							searchKey="item:appearance.themeMode"
							title={t("settings.appearance.theme.mode.title")}
							description={t(
								"settings.appearance.theme.mode.description",
							)}
						>
							<Segmented<ClientPreferences["theme"]>
								className={styles.themeControl}
								value={draft.theme}
								disabled={
									savingKey !== null && savingKey !== "theme"
								}
								options={[
									{
										label: t(
											"settings.appearance.theme.mode.system",
										),
										value: "system",
									},
									{
										label: t(
											"settings.appearance.theme.mode.light",
										),
										value: "light",
									},
									{
										label: t(
											"settings.appearance.theme.mode.dark",
										),
										value: "dark",
									},
								]}
								onChange={(theme): void => {
									void save({ theme }, "theme");
								}}
							/>
						</SettingsItem>
						<SettingsItem
							searchKey="item:appearance.themeColor"
							title={t("settings.appearance.theme.color.title")}
							description={t(
								"settings.appearance.theme.color.description",
							)}
						>
							<Space.Compact>
								<ColorPicker
									{...colorPickerProps}
									value={draft.themeColor}
									format="hex"
									disabledAlpha={true}
									disabledFormat={true}
									showText={(color): React.ReactNode =>
										color.toHexString().toUpperCase()
									}
									disabled={savingKey !== null}
									onChange={(color): void => {
										const themeColor = color.toHexString();
										setDraft(
											(
												preferences: ClientPreferences,
											): ClientPreferences => ({
												...preferences,
												themeColor,
											}),
										);
									}}
									onChangeComplete={(color): void => {
										void save(
											{ themeColor: color.toHexString() },
											"themeColor",
										);
									}}
								/>
								<Button
									icon={<Icon name="reload" />}
									loading={savingKey === "themeColor"}
									disabled={
										savingKey !== null ||
										draft.themeColor === DEFAULT_THEME_COLOR
									}
									onClick={(): void => {
										void save(
											{ themeColor: DEFAULT_THEME_COLOR },
											"themeColor",
										);
									}}
								/>
							</Space.Compact>
						</SettingsItem>
					</div>
				</SettingsList>
				<SettingsList title={t("settings.appearance.interface.title")}>
					<div className={styles.preferenceList}>
						<SettingsItem
							searchKey="item:appearance.motion"
							title={t(
								"settings.appearance.interface.motion.title",
							)}
							description={t(
								"settings.appearance.interface.motion.description",
							)}
						>
							<Switch
								checked={draft.animationsEnabled}
								loading={savingKey === "animationsEnabled"}
								disabled={
									savingKey !== null &&
									savingKey !== "animationsEnabled"
								}
								onChange={(
									animationsEnabled: boolean,
								): void => {
									void save(
										{ animationsEnabled },
										"animationsEnabled",
									);
								}}
							/>
						</SettingsItem>
						<SettingsItem
							searchKey="item:appearance.uiFontSize"
							title={t(
								"settings.appearance.interface.uiFontSize.title",
							)}
							description={t(
								"settings.appearance.interface.uiFontSize.description",
							)}
						>
							<InputNumber
								className={styles.fontSizeInput}
								value={draft.uiFontSize}
								min={12}
								max={18}
								precision={0}
								suffix="px"
								disabled={savingKey !== null}
								onChange={(value: number | null): void =>
									saveFontSize("uiFontSize", value)
								}
							/>
						</SettingsItem>
					</div>
				</SettingsList>
				<SettingsList title={t("settings.appearance.fonts.title")}>
					<div className={styles.preferenceList}>
						{(["fontFamily", "fontFamilyCode"] as const).map(
							(key): React.JSX.Element => (
								<SettingsItem
									key={key}
									searchKey={`item:appearance.${key}`}
									title={t(
										`settings.appearance.fonts.${key === "fontFamily" ? "body" : "code"}.title`,
									)}
									description={t(
										`settings.appearance.fonts.${key === "fontFamily" ? "body" : "code"}.description`,
									)}
								>
									<Space.Compact>
										<Input
											className={styles.fontFamilyInput}
											value={draft[key]}
											maxLength={512}
											allowClear
											placeholder={t(
												`settings.appearance.fonts.${key === "fontFamily" ? "body" : "code"}.placeholder`,
											)}
											disabled={savingKey !== null}
											onChange={(event): void =>
												updateFont(
													key,
													event.target.value,
												)
											}
											onBlur={(): void => saveFont(key)}
											onPressEnter={(event): void =>
												event.currentTarget.blur()
											}
										/>
										<Tooltip
											title={t(
												`settings.appearance.fonts.${key === "fontFamily" ? "body" : "code"}.reset`,
											)}
										>
											<Button
												aria-label={t(
													`settings.appearance.fonts.${key === "fontFamily" ? "body" : "code"}.reset`,
												)}
												icon={<Icon name="reload" />}
												loading={savingKey === key}
												disabled={
													savingKey !== null ||
													draft[key] ===
														DEFAULT_FONT_FAMILIES[
															key
														]
												}
												onMouseDown={(event): void =>
													event.preventDefault()
												}
												onClick={(): void => {
													void save(
														{
															[key]: DEFAULT_FONT_FAMILIES[
																key
															],
														},
														key,
													);
												}}
											/>
										</Tooltip>
									</Space.Compact>
								</SettingsItem>
							),
						)}
						<SettingsItem
							searchKey="item:appearance.codeFontSize"
							title={t(
								"settings.appearance.fonts.codeSize.title",
							)}
							description={t(
								"settings.appearance.fonts.codeSize.description",
							)}
						>
							<InputNumber
								className={styles.fontSizeInput}
								value={draft.codeFontSize}
								min={11}
								max={20}
								precision={0}
								suffix="px"
								disabled={savingKey !== null}
								onChange={(value: number | null): void =>
									saveFontSize("codeFontSize", value)
								}
							/>
						</SettingsItem>
					</div>
				</SettingsList>
			</div>
		</section>
	);
}

export default AppearanceSettingsPage;
