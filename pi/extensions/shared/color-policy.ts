import type { Theme } from "@earendil-works/pi-coding-agent";

export const SEMANTIC_COLOR = {
	primary: "text",
	secondary: "muted",
	tertiary: "dim",
	focus: "accent",
	completed: "text",
	code: "mdCode",
	caution: "warning",
	failure: "error",
} as const satisfies Record<string, Parameters<Theme["fg"]>[0]>;

export type SemanticColorRole = keyof typeof SEMANTIC_COLOR;

export function paint(
	theme: Theme,
	role: SemanticColorRole,
	text: string,
): string {
	return theme.fg(SEMANTIC_COLOR[role], text);
}
