import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CommandPaletteRegistry } from "../registry.ts";
import { registerPlanActions } from "./plan.ts";
import { registerWorkspaceActions } from "./workspace.ts";

/** Register deterministic, local UI actions here. */
export function registerCommandPaletteActions(
	pi: ExtensionAPI,
	registry: CommandPaletteRegistry,
): void {
	registerPlanActions(pi, registry);
	registerWorkspaceActions(registry);
}
