import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { registerCommandPaletteActions } from "./actions/index.ts";
import { openCommandPalette } from "./palette.ts";
import { CommandPaletteRegistry } from "./registry.ts";

export default function commandPaletteExtension(pi: ExtensionAPI): void {
	const registry = new CommandPaletteRegistry();
	registerCommandPaletteActions(registry);

	pi.registerShortcut(Key.ctrl("o"), {
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
