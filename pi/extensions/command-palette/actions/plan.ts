import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { persistPlanEnabled } from "../../plan-dashboard/control.ts";
import { openPlanDashboard } from "../../plan-dashboard/dashboard.ts";
import { PlanRuntime } from "../../plan-dashboard/state.ts";
import type { CommandPaletteRegistry } from "../registry.ts";

export function registerPlanActions(
	pi: ExtensionAPI,
	registry: CommandPaletteRegistry,
): void {
	registry.register({
		id: "plan.toggle",
		title: "Toggle Living Plan",
		description: "Pause or resume the plan on this Pi Session branch",
		keywords: ["plan", "planning", "pause", "resume", "on", "off"],
		run: (ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify(
					"Wait for the current agent turn before toggling the living plan",
					"info",
				);
				return;
			}
			const runtime = new PlanRuntime();
			runtime.restore(ctx.sessionManager.getBranch());
			if (!runtime.getPlan() && !runtime.getPendingRequest()) {
				ctx.ui.notify(
					"No living plan exists in the current Pi Session branch",
					"info",
				);
				return;
			}
			const enabled = !runtime.isEnabled();
			persistPlanEnabled(pi, runtime, ctx, enabled);
			ctx.ui.notify(
				enabled ? "Living plan resumed." : "Living plan paused.",
				"info",
			);
		},
	});

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
