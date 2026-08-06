import { openPlanDashboard } from "../../plan-dashboard/dashboard.ts";
import type { CommandPaletteRegistry } from "../registry.ts";

export function registerPlanActions(
	registry: CommandPaletteRegistry,
): void {
	registry.register({
		id: "plan.dashboard",
		title: "Open Plan Dashboard…",
		description: "Inspect the current session's living plan",
		keywords: [
			"plan",
			"planning",
			"progress",
			"dashboard",
			"todo",
			"dependencies",
		],
		run: openPlanDashboard,
	});
}
