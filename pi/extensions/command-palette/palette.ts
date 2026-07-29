import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	fuzzyFilter,
	Input,
	matchesKey,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import { BaseModal, showModal, type ModalContext } from "../shared/modal.ts";
import { ModalFrame } from "../shared/modal-frame.ts";
import type {
	CommandPaletteAction,
	CommandPaletteRegistry,
} from "./registry.ts";
import { COMMAND_PALETTE_SHORTCUT } from "./shortcut.ts";

const MIN_VISIBLE_ACTION_ROWS = 5;
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

class CommandPaletteComponent extends BaseModal<string> {
	private readonly input = new Input();
	private readonly actions: readonly CommandPaletteAction[];
	private filteredActions: CommandPaletteAction[];
	private selectedIndex = 0;

	constructor(
		actions: readonly CommandPaletteAction[],
		context: ModalContext<string>,
	) {
		super(context);
		this.actions = actions;
		this.filteredActions = [...actions];
	}

	protected override onFocusChange(focused: boolean): void {
		this.input.focused = focused;
	}

	override handleInput(data: string): void {
		if (
			matchesKey(data, COMMAND_PALETTE_SHORTCUT) ||
			this.isCancelInput(data)
		) {
			this.cancel();
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
			if (action) this.close(action.id);
			return;
		}

		const previousQuery = this.input.getValue();
		this.input.handleInput(data);
		if (this.input.getValue() !== previousQuery) {
			this.updateFilter();
		}
		this.requestRender();
	}

	override invalidate(): void {
		this.input.invalidate();
	}

	override render(width: number): string[] {
		if (width < 4) return [truncateToWidth("Command Palette", width, "")];

		const frame = new ModalFrame(this.theme, width);
		const lines: string[] = [frame.top("Command Palette")];
		const inputWidth = Math.max(1, frame.innerWidth - 2);
		const inputLine = this.input.render(inputWidth)[0] ?? "";
		lines.push(frame.row(` ${inputLine}`));
		lines.push(frame.separator());

		let renderedActionRows = 0;
		if (this.filteredActions.length === 0) {
			const message =
				this.actions.length === 0
					? "No actions registered yet"
					: "No matching actions";
			lines.push(frame.row(`  ${this.theme.fg("dim", message)}`));
			renderedActionRows++;
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
					frame.row(prefix + titleText + description, { selected }),
				);
				renderedActionRows++;
			}
		}
		while (renderedActionRows < MIN_VISIBLE_ACTION_ROWS) {
			lines.push(frame.row());
			renderedActionRows++;
		}

		lines.push(frame.separator());
		const count = `${this.filteredActions.length}/${this.actions.length}`;
		lines.push(
			frame.row(
				` ${this.theme.fg("dim", `↑↓ navigate  Enter run  Esc close  ·  ${count}`)}`,
			),
		);
		lines.push(frame.bottom());

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
		this.requestRender();
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
}

export async function openCommandPalette(
	ctx: ExtensionContext,
	registry: CommandPaletteRegistry,
): Promise<void> {
	const actionId = await showModal<string>(
		ctx,
		(modalContext) =>
			new CommandPaletteComponent(registry.list(), modalContext),
		{
			overlayOptions: {
				width: 96,
				maxHeight: "80%",
			},
			unavailableMessage:
				"Command Palette is only available in TUI mode",
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
