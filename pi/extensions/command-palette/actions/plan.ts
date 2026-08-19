import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { persistPlanEnabled } from "../../plan-dashboard/control.ts";
import { openPlanDashboard } from "../../plan-dashboard/dashboard.ts";
import {
	newPlanNeedsConfirmation,
	startNewPlanRequest,
} from "../../plan-dashboard/request.ts";
import { PlanRuntime } from "../../plan-dashboard/state.ts";
import type { CommandPaletteRegistry } from "../registry.ts";

function restoreRuntime(ctx: ExtensionContext): PlanRuntime {
	const runtime = new PlanRuntime();
	runtime.restore(ctx.sessionManager.getBranch());
	return runtime;
}

async function startNewPlan(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<void> {
	if (!ctx.isIdle()) {
		ctx.ui.notify(
			"Wait for the current agent turn before starting a new Living Plan",
			"info",
		);
		return;
	}
	const runtime = restoreRuntime(ctx);
	let allowReplaceIncomplete = false;
	if (newPlanNeedsConfirmation(runtime)) {
		const message = runtime.getPendingRequest()
			? "A Living Plan request is still pending. Starting a new one will replace it before a Plan is created."
			: "The current Plan is unfinished. It will remain in Plan History, but no longer be current.";
		allowReplaceIncomplete = await ctx.ui.confirm(
			"Start New Living Plan?",
			message,
		);
		if (!allowReplaceIncomplete) return;
	}
	const task = (
		await ctx.ui.editor("Start New Living Plan", "")
	)?.trim() ?? "";
	if (!task) return;
	startNewPlanRequest(pi, runtime, ctx, task, {
		allowReplaceIncomplete,
	});
	pi.sendUserMessage(task);
}

export function registerPlanActions(
	pi: ExtensionAPI,
	registry: CommandPaletteRegistry,
): void {
	registry.register({
		id: "plan.start",
		title: "Start New Living Plan…",
		description: "Create a new current Plan and keep earlier Plans in history",
		keywords: ["plan", "planning", "start", "new", "create"],
		run: (ctx) => startNewPlan(pi, ctx),
	});

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
			const runtime = restoreRuntime(ctx);
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
