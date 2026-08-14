import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	PLAN_REQUEST_ENTRY,
	type PlanRequest,
	type PlanRuntime,
} from "./state.ts";

export function registerPlanCommand(
	pi: ExtensionAPI,
	runtime: PlanRuntime,
): void {
	pi.registerCommand("plan", {
		description: "Create a living plan for one task",
		handler: async (args, ctx) => {
			if (runtime.getPlan()) {
				ctx.ui.notify(
					"This session branch already has a living plan. Use /plan-dashboard to inspect it.",
					"info",
				);
				return;
			}

			await ctx.waitForIdle();
			let task = args.trim();
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
