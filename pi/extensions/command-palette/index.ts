import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommandPaletteActions } from "./actions/index.ts";
import { openCommandPalette } from "./palette.ts";
import { CommandPaletteRegistry } from "./registry.ts";

export default function commandPaletteExtension(pi: ExtensionAPI): void {
	const registry = new CommandPaletteRegistry();
	registerCommandPaletteActions(registry);

	pi.registerCommand("palette", {
		description: "Open the local UI command palette",
		handler: async (_args, ctx) => {
			await openCommandPalette(ctx, registry);
		},
	});
}
