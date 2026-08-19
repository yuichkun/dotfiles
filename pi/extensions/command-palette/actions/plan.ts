import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { persistPlanEnabled } from "../../plan-dashboard/control.ts";
import { openPlanDashboard } from "../../plan-dashboard/dashboard.ts";
import { openPlanHistory } from "../../plan-dashboard/history.ts";
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

function hasPlanWorkflow(runtime: PlanRuntime): boolean {
	return Boolean(runtime.getPlan() || runtime.getPendingRequest());
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

function changePlanActivity(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	enabled: boolean,
): void {
	if (!ctx.isIdle()) {
		ctx.ui.notify(
			`Wait for the current agent turn before ${enabled ? "resuming" : "pausing"} the Living Plan`,
			"info",
		);
		return;
	}
	const runtime = restoreRuntime(ctx);
	if (!hasPlanWorkflow(runtime)) {
		ctx.ui.notify(
			"No Living Plan exists in the current Pi Session branch",
			"info",
		);
		return;
	}
	if (runtime.isEnabled() === enabled) {
		ctx.ui.notify(
			`Living plan is already ${enabled ? "active" : "paused"}.`,
			"info",
		);
		return;
	}
	persistPlanEnabled(pi, runtime, ctx, enabled);
	ctx.ui.notify(
		enabled ? "Living plan resumed." : "Living plan paused.",
		"info",
	);
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
		id: "plan.current",
		title: "Open Current Plan…",
		description: "Inspect the current branch's Living Plan",
		keywords: [
			"plan",
			"planning",
			"current",
			"progress",
			"dashboard",
			"todo",
			"dependencies",
		],
		isAvailable: (ctx) => Boolean(restoreRuntime(ctx).getPlan()),
		run: (ctx) => openPlanDashboard(ctx),
	});

	registry.register({
		id: "plan.history",
		title: "Open Plan History…",
		description: "Choose an earlier Plan from this branch",
		keywords: ["plan", "planning", "history", "previous", "archive"],
		isAvailable: (ctx) => restoreRuntime(ctx).getPlanHistory().length > 0,
		run: openPlanHistory,
	});

	registry.register({
		id: "plan.pause",
		title: "Pause Living Plan",
		description: "Pause planning context and the plan tool on this branch",
		keywords: ["plan", "planning", "pause", "suspend", "toggle", "off"],
		isAvailable: (ctx) => {
			const runtime = restoreRuntime(ctx);
			return hasPlanWorkflow(runtime) && runtime.isEnabled();
		},
		run: (ctx) => changePlanActivity(pi, ctx, false),
	});

	registry.register({
		id: "plan.resume",
		title: "Resume Living Plan",
		description: "Resume a paused Living Plan on this branch",
		keywords: ["plan", "planning", "resume", "continue", "toggle", "on"],
		isAvailable: (ctx) => {
			const runtime = restoreRuntime(ctx);
			return hasPlanWorkflow(runtime) && !runtime.isEnabled();
		},
		run: (ctx) => changePlanActivity(pi, ctx, true),
	});
}
