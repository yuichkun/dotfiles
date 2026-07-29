import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerBashTool } from "./bash.ts";

export default function (pi: ExtensionAPI) {
	registerBashTool(pi);
}
