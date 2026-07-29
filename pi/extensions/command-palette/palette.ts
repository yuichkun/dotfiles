import type {
	ExtensionContext,
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	fuzzyFilter,
	Input,
	truncateToWidth,
	visibleWidth,
	type Component,
	type Focusable,
	type TUI,
} from "@earendil-works/pi-tui";
import type {
	CommandPaletteAction,
	CommandPaletteRegistry,
} from "./registry.ts";

const MAX_VISIBLE_ACTIONS = 8;

function getSearchText(action: CommandPaletteAction): string {
	return [
		action.title,
		action.id,
		action.description,
		...(action.keywords ?? []),
	]
		.filter(Boolean)
		.join(" ");
}

class CommandPaletteComponent implements Component, Focusable {
	private readonly input = new Input();
	private readonly actions: readonly CommandPaletteAction[];
	private readonly theme: Theme;
	private readonly keybindings: KeybindingsManager;
	private readonly tui: TUI;
	private readonly done: (actionId: string | undefined) => void;
	private filteredActions: CommandPaletteAction[];
	private selectedIndex = 0;
	private _focused = false;

	constructor(
		actions: readonly CommandPaletteAction[],
		theme: Theme,
		keybindings: KeybindingsManager,
		tui: TUI,
		done: (actionId: string | undefined) => void,
	) {
		this.actions = actions;
		this.filteredActions = [...actions];
		this.theme = theme;
		this.keybindings = keybindings;
		this.tui = tui;
		this.done = done;
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.done(undefined);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			this.moveSelection(-1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.moveSelection(1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.moveSelection(-MAX_VISIBLE_ACTIONS, false);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.moveSelection(MAX_VISIBLE_ACTIONS, false);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			const action = this.filteredActions[this.selectedIndex];
			if (action) this.done(action.id);
			return;
		}

		const previousQuery = this.input.getValue();
		this.input.handleInput(data);
		if (this.input.getValue() !== previousQuery) {
			this.updateFilter();
		}
		this.tui.requestRender();
	}

	invalidate(): void {
		this.input.invalidate();
	}

	render(width: number): string[] {
		if (width < 4) return [truncateToWidth("Command Palette", width, "")];

		const innerWidth = width - 2;
		const lines: string[] = [];
		const title = "─ Command Palette ";
		const titleFill = "─".repeat(
			Math.max(0, innerWidth - visibleWidth(title)),
		);

		lines.push(
			this.theme.fg("borderAccent", "╭") +
				this.theme.fg("accent", this.theme.bold(title)) +
				this.theme.fg("borderAccent", `${titleFill}╮`),
		);

		const inputWidth = Math.max(1, innerWidth - 2);
		const inputLine = this.input.render(inputWidth)[0] ?? "";
		lines.push(this.renderRow(` ${inputLine}`, innerWidth));
		lines.push(this.renderSeparator(innerWidth));

		if (this.filteredActions.length === 0) {
			const message =
				this.actions.length === 0
					? "No actions registered yet"
					: "No matching actions";
			lines.push(
				this.renderRow(
					`  ${this.theme.fg("dim", message)}`,
					innerWidth,
				),
			);
		} else {
			const { start, end } = this.getVisibleRange();
			for (let index = start; index < end; index++) {
				const action = this.filteredActions[index];
				if (!action) continue;

				const selected = index === this.selectedIndex;
				const prefix = selected ? " › " : "   ";
				const titleText = selected
					? this.theme.fg("accent", this.theme.bold(action.title))
					: this.theme.fg("text", action.title);
				const description = action.description
					? this.theme.fg("muted", `  ${action.description}`)
					: "";

				lines.push(
					this.renderRow(
						prefix + titleText + description,
						innerWidth,
						selected,
					),
				);
			}
		}

		lines.push(this.renderSeparator(innerWidth));
		const count = `${this.filteredActions.length}/${this.actions.length}`;
		lines.push(
			this.renderRow(
				` ${this.theme.fg("dim", `↑↓ navigate  Enter run  Esc close  ·  ${count}`)}`,
				innerWidth,
			),
		);
		lines.push(
			this.theme.fg("borderAccent", `╰${"─".repeat(innerWidth)}╯`),
		);

		return lines;
	}

	private updateFilter(): void {
		const query = this.input.getValue().trim();
		this.filteredActions = query
			? fuzzyFilter([...this.actions], query, getSearchText)
			: [...this.actions];
		this.selectedIndex = 0;
	}

	private moveSelection(delta: number, wrap = true): void {
		const count = this.filteredActions.length;
		if (count === 0) return;

		if (wrap) {
			this.selectedIndex =
				(this.selectedIndex + delta + count) % count;
		} else {
			this.selectedIndex = Math.max(
				0,
				Math.min(this.selectedIndex + delta, count - 1),
			);
		}
		this.tui.requestRender();
	}

	private getVisibleRange(): { start: number; end: number } {
		const count = this.filteredActions.length;
		const start = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(MAX_VISIBLE_ACTIONS / 2),
				count - MAX_VISIBLE_ACTIONS,
			),
		);
		return {
			start,
			end: Math.min(start + MAX_VISIBLE_ACTIONS, count),
		};
	}

	private renderRow(
		content: string,
		innerWidth: number,
		selected = false,
	): string {
		const truncated = truncateToWidth(content, innerWidth, "");
		const padding = " ".repeat(
			Math.max(0, innerWidth - visibleWidth(truncated)),
		);
		const background = selected ? "selectedBg" : "customMessageBg";
		return (
			this.theme.fg("borderAccent", "│") +
			this.theme.bg(background, truncated + padding) +
			this.theme.fg("borderAccent", "│")
		);
	}

	private renderSeparator(innerWidth: number): string {
		return this.theme.fg(
			"borderAccent",
			`├${"─".repeat(innerWidth)}┤`,
		);
	}
}

export async function openCommandPalette(
	ctx: ExtensionContext,
	registry: CommandPaletteRegistry,
): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("Command Palette is only available in TUI mode", "warning");
		return;
	}

	const actionId = await ctx.ui.custom<string | undefined>(
		(tui, theme, keybindings, done) =>
			new CommandPaletteComponent(
				registry.list(),
				theme,
				keybindings,
				tui,
				done,
			),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: 96,
				maxHeight: "80%",
				margin: 1,
			},
		},
	);

	if (!actionId) return;
	const action = registry.get(actionId);
	if (!action) {
		ctx.ui.notify(`Unknown palette action: ${actionId}`, "error");
		return;
	}

	try {
		await action.run(ctx);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`${action.title} failed: ${message}`, "error");
	}
}
