import { openWorkspacePicker } from "../../workspace-picker/picker.ts";
import type { CommandPaletteRegistry } from "../registry.ts";

export function registerWorkspaceActions(
	registry: CommandPaletteRegistry,
): void {
	registry.register({
		id: "workspace.open-vscode",
		title: "Open in VS Code…",
		description: "Open the current or another workspace",
		keywords: [
			"code",
			"editor",
			"repository",
			"folder",
			"project",
			"switch",
		],
		run: openWorkspacePicker,
	});
}
