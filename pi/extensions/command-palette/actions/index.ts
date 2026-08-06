import type { CommandPaletteRegistry } from "../registry.ts";
import { registerPlanActions } from "./plan.ts";
import { registerWorkspaceActions } from "./workspace.ts";

/** Register deterministic, local UI actions here. */
export function registerCommandPaletteActions(
	registry: CommandPaletteRegistry,
): void {
	registerPlanActions(registry);
	registerWorkspaceActions(registry);
}
