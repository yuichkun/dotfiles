import { openToolOutputViewer } from "../../tool-output-viewer/viewer.ts";
import type { CommandPaletteRegistry } from "../registry.ts";

/** Thin adapter: discovery belongs to the palette, UI belongs to the viewer. */
export function registerToolOutputActions(
	registry: CommandPaletteRegistry,
): void {
	registry.register({
		id: "tool-outputs.browse",
		title: "Browse tool outputs",
		description: "Inspect previous tool results",
		keywords: ["stdout", "stderr", "history", "commands"],
		run: openToolOutputViewer,
	});
}
