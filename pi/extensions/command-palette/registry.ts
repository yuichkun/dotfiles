import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface CommandPaletteAction {
	id: string;
	title: string;
	description?: string;
	keywords?: readonly string[];
	run(ctx: ExtensionContext): void | Promise<void>;
}

const ACTION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export class CommandPaletteRegistry {
	private readonly actions = new Map<string, CommandPaletteAction>();

	register(action: CommandPaletteAction): void {
		if (!ACTION_ID_PATTERN.test(action.id)) {
			throw new Error(
				`Invalid command palette action id: ${action.id}`,
			);
		}
		if (!action.title.trim()) {
			throw new Error(
				`Command palette action ${action.id} needs a title`,
			);
		}
		if (this.actions.has(action.id)) {
			throw new Error(
				`Duplicate command palette action id: ${action.id}`,
			);
		}

		this.actions.set(action.id, action);
	}

	get(id: string): CommandPaletteAction | undefined {
		return this.actions.get(id);
	}

	list(): readonly CommandPaletteAction[] {
		return [...this.actions.values()];
	}
}
