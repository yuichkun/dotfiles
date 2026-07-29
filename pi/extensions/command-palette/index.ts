import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommandPaletteActions } from "./actions/index.ts";
import {
	COMMAND_PALETTE_SHORTCUT,
	openCommandPalette,
} from "./palette.ts";
import { CommandPaletteRegistry } from "./registry.ts";

export default function commandPaletteExtension(pi: ExtensionAPI): void {
	const registry = new CommandPaletteRegistry();
	registerCommandPaletteActions(registry);

	pi.registerShortcut(COMMAND_PALETTE_SHORTCUT, {
		description: "Open Command Palette",
		handler: async (ctx) => {
			await openCommandPalette(ctx, registry);
		},
	});

	pi.registerCommand("palette", {
		description: "Open the local UI command palette",
		handler: async (_args, ctx) => {
			await openCommandPalette(ctx, registry);
		},
	});
}
