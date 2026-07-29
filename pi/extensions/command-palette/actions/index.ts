import type { CommandPaletteRegistry } from "../registry.ts";
import { registerToolOutputActions } from "./tool-outputs.ts";

/** Register deterministic, local UI actions here. */
export function registerCommandPaletteActions(
	registry: CommandPaletteRegistry,
): void {
	registerToolOutputActions(registry);
}
