import { List, Modal, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";
import studioPackage from "../../../../../../../package.json";
import styles from "./AboutCreditsModal.module.css";

type DependencyGroup = {
	key: "runtime" | "development";
	dependencies: Array<[string, string]>;
};

const dependencyGroups: DependencyGroup[] = [
	{
		key: "runtime",
		dependencies: Object.entries(studioPackage.dependencies ?? {}),
	},
	{
		key: "development",
		dependencies: Object.entries(studioPackage.devDependencies ?? {}),
	},
];

export type AboutCreditsModalProps = {
	open: boolean;
	onClose: () => void;
};

function AboutCreditsModal({
	open,
	onClose,
}: AboutCreditsModalProps): React.JSX.Element {
	const { t } = useTranslation();

	return (
		<Modal
			open={open}
			onCancel={onClose}
			title={t("settings.about.credits.title")}
			width={680}
			destroyOnHidden={true}
			footer={null}
		>
			<div className={styles.content}>
				<Typography.Paragraph type="secondary">
					{t("settings.about.credits.description")}
				</Typography.Paragraph>
				{dependencyGroups.map((group) => (
					<section className={styles.group} key={group.key}>
						<Typography.Title level={5} className={styles.groupTitle}>
							{t(`settings.about.credits.groups.${group.key}`)}
						</Typography.Title>
						<List
							className={styles.list}
							dataSource={group.dependencies}
							size="small"
							renderItem={([name, version]): React.JSX.Element => (
								<List.Item>
									<Space
										className={styles.dependency}
										align="baseline"
									>
										<Typography.Text className={styles.name}>
											{name}
										</Typography.Text>
										<Typography.Text
											code
											type="secondary"
											className={styles.version}
										>
											{version}
										</Typography.Text>
									</Space>
								</List.Item>
							)}
						/>
					</section>
				))}
			</div>
		</Modal>
	);
}

export default AboutCreditsModal;
