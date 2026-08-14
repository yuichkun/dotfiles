import type { Theme } from "@earendil-works/pi-coding-agent";
import { paint } from "../shared/color-policy.ts";

export function styleAttachmentChip(
	theme: Theme,
	text: string,
	selected: boolean,
): string {
	return selected
		? theme.bg("selectedBg", paint(theme, "focus", theme.bold(text)))
		: paint(theme, "primary", text);
}
