import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function quietThinkingExtension(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setHiddenThinkingLabel("");
	});
}
