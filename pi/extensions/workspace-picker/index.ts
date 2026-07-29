import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { openWorkspacePicker } from "./picker.ts";

export default function workspacePickerExtension(
	pi: ExtensionAPI,
): void {
	pi.registerCommand("workspaces", {
		description: "Open a configured workspace in VS Code",
		handler: async (_args, ctx) => {
			try {
				await openWorkspacePicker(ctx);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Workspace Picker failed: ${message}`, "error");
			}
		},
	});
}
