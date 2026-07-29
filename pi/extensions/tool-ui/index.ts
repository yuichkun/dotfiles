import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerBashTool } from "./bash.ts";
import { registerHiddenResultTools } from "./hidden-results.ts";

export default function (pi: ExtensionAPI) {
	registerBashTool(pi);
	registerHiddenResultTools(pi);
}
