import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";

type ForegroundColor = Parameters<Theme["fg"]>[0];
type BackgroundColor = Parameters<Theme["bg"]>[0];

export interface ModalFrameStyle {
	borderColor?: ForegroundColor;
	titleColor?: ForegroundColor;
	backgroundColor?: BackgroundColor;
	selectedBackgroundColor?: BackgroundColor;
}

export interface ModalRowOptions {
	selected?: boolean;
}

const DEFAULT_STYLE: Required<ModalFrameStyle> = {
	borderColor: "borderAccent",
	titleColor: "accent",
	backgroundColor: "customMessageBg",
	selectedBackgroundColor: "selectedBg",
};

/** Renders width-safe, consistently themed modal chrome. */
export class ModalFrame {
	readonly innerWidth: number;
	private readonly style: Required<ModalFrameStyle>;
	private readonly theme: Theme;
	private readonly width: number;

	constructor(
		theme: Theme,
		width: number,
		style: ModalFrameStyle = {},
	) {
		this.theme = theme;
		this.width = Math.max(1, width);
		this.innerWidth = Math.max(0, this.width - 2);
		this.style = { ...DEFAULT_STYLE, ...style };
	}

	top(title: string): string {
		if (this.width < 3) return truncateToWidth(title, this.width, "");

		const rawTitle = `─ ${title} `;
		const titleText = truncateToWidth(rawTitle, this.innerWidth, "");
		const fill = "─".repeat(
			Math.max(0, this.innerWidth - visibleWidth(titleText)),
		);
		return (
			this.theme.fg(this.style.borderColor, "╭") +
			this.theme.fg(
				this.style.titleColor,
				this.theme.bold(titleText),
			) +
			this.theme.fg(this.style.borderColor, `${fill}╮`)
		);
	}

	row(content = "", options: ModalRowOptions = {}): string {
		if (this.width < 3) {
			return truncateToWidth(content, this.width, "");
		}

		const truncated = truncateToWidth(content, this.innerWidth, "");
		const padding = " ".repeat(
			Math.max(0, this.innerWidth - visibleWidth(truncated)),
		);
		const background = options.selected
			? this.style.selectedBackgroundColor
			: this.style.backgroundColor;
		return (
			this.theme.fg(this.style.borderColor, "│") +
			this.theme.bg(background, truncated + padding) +
			this.theme.fg(this.style.borderColor, "│")
		);
	}

	separator(): string {
		if (this.width < 3) return "─".repeat(this.width);
		return this.theme.fg(
			this.style.borderColor,
			`├${"─".repeat(this.innerWidth)}┤`,
		);
	}

	bottom(): string {
		if (this.width < 3) return "─".repeat(this.width);
		return this.theme.fg(
			this.style.borderColor,
			`╰${"─".repeat(this.innerWidth)}╯`,
		);
	}
}
