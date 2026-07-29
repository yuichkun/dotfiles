import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { openToolOutputViewer } from "./viewer.ts";

export default function toolOutputViewerExtension(
	pi: ExtensionAPI,
): void {
	pi.registerCommand("outputs", {
		description: "Browse tool output history for the current branch",
		handler: async (_args, ctx) => {
			await openToolOutputViewer(ctx);
		},
	});
}
