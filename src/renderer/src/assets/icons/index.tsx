import type * as React from "react";

type SvgComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;
const iconModules = import.meta.glob<SvgComponent>("./*.svg", {
	eager: true,
	import: "default",
	query: "?react"
});

export type IconName = keyof typeof iconModules extends `./${infer Name}.svg` ? Name : never;

export function getIconComponent(name: string): SvgComponent | null {
	const IconComponent = iconModules[`./${name}.svg`];

	if (!IconComponent) {
		return null;
	}

	return IconComponent;
}

export type IconProps = React.SVGProps<SVGSVGElement> & {
	name: string;
	tone?: "currentColor" | "native";
};

const NATIVE_COLOR_ICON_NAMES: ReadonlySet<string> = new Set([
	"daedalus_icon",
	"icon_large",
	"status_success",
	"status_warning",
	"todo_checked",
	"todo_failed",
	"warning"
]);

function joinClassNames(...classNames: Array<string | undefined>): string | undefined {
	const joined: string = classNames.filter((className): className is string => className !== undefined && className.length > 0).join(" ");
	return joined.length > 0 ? joined : undefined;
}

export function Icon({ name, tone, className, ...props }: IconProps): React.JSX.Element | null {
	const IconComponent = getIconComponent(name);

	if (!IconComponent) {
		return null;
	}

	const resolvedTone: "currentColor" | "native" = tone ?? (NATIVE_COLOR_ICON_NAMES.has(name) ? "native" : "currentColor");

	return <IconComponent {...props} className={joinClassNames("daedalus-icon", className)} data-tone={resolvedTone} />;
}
