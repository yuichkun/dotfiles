import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	PLAN_CONTROL_ENTRY,
	PLAN_REQUEST_ENTRY,
	type PlanControl,
	type PlanRequest,
	type PlanRuntime,
} from "./state.ts";

function hasPlanWorkflow(runtime: PlanRuntime): boolean {
	return (
		runtime.getPlan() !== undefined ||
		runtime.getPendingRequest() !== undefined
	);
}

function persistPlanEnabled(
	pi: ExtensionAPI,
	runtime: PlanRuntime,
	enabled: boolean,
): void {
	const control: PlanControl = {
		schemaVersion: 1,
		id: randomUUID(),
		enabled,
		createdAt: new Date().toISOString(),
	};
	pi.appendEntry(PLAN_CONTROL_ENTRY, control);
	runtime.setEnabled(enabled);
}

export function registerPlanCommand(
	pi: ExtensionAPI,
	runtime: PlanRuntime,
): void {
	pi.registerCommand("plan", {
		description: "Create, pause, or resume a living plan",
		handler: async (args, ctx) => {
			const raw = args.trim();
			const subcommand = raw.toLowerCase();

			if (subcommand === "on" || subcommand === "off") {
				if (!hasPlanWorkflow(runtime)) {
					ctx.ui.notify(
						"No living plan exists on this Pi session branch. Use /plan <task> first.",
						"info",
					);
					return;
				}
				await ctx.waitForIdle();
				const enabled = subcommand === "on";
				if (runtime.isEnabled() === enabled) {
					ctx.ui.notify(
						enabled
							? "Living plan is already ON."
							: "Living plan is already OFF (paused).",
						"info",
					);
					return;
				}
				persistPlanEnabled(pi, runtime, enabled);
				ctx.ui.notify(
					enabled
						? "Living plan resumed. Plan context and tool are active."
						: "Living plan paused. Plan context and tool are inactive.",
					"info",
				);
				return;
			}

			if (runtime.getPlan()) {
				ctx.ui.notify(
					"This Pi session branch already has a living plan. Use /plan off to pause it, /plan on to resume it, or /plan-dashboard to inspect it.",
					"info",
				);
				return;
			}

			await ctx.waitForIdle();
			let task = raw;
			if (!task) {
				if (!ctx.hasUI) {
					ctx.ui.notify("Usage: /plan <task>", "error");
					return;
				}
				task =
					(
						await ctx.ui.editor(
							"Plan task",
							runtime.getPendingRequest()?.task ?? "",
						)
					)?.trim() ?? "";
			}
			if (!task) return;

			if (!runtime.isEnabled() && runtime.getPendingRequest()) {
				persistPlanEnabled(pi, runtime, true);
			}
			const request: PlanRequest = {
				schemaVersion: 1,
				id: randomUUID(),
				task,
				createdAt: new Date().toISOString(),
			};
			pi.appendEntry(PLAN_REQUEST_ENTRY, request);
			runtime.setRequest(request);
			pi.sendUserMessage(task);
		},
	});
}
