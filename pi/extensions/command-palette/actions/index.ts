import type { CommandPaletteRegistry } from "../registry.ts";
import { registerToolOutputActions } from "./tool-outputs.ts";
import { registerWorkspaceActions } from "./workspace.ts";

/** Register deterministic, local UI actions here. */
export function registerCommandPaletteActions(
	registry: CommandPaletteRegistry,
): void {
	registerToolOutputActions(registry);
	registerWorkspaceActions(registry);
}
