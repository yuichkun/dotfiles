import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	newPlanNeedsConfirmation,
	startNewPlanRequest,
} from "./request.ts";
import type { PlanRequest, PlanRuntime } from "./state.ts";

export const PLAN_BOOTSTRAP_TOOL_NAME = "start_plan";

const StartPlanParameters = Type.Object(
	{
		task: Type.String({
			minLength: 1,
			description: "The planning task explicitly requested by the user",
		}),
	},
	{ additionalProperties: false },
);

interface StartPlanDetails {
	request: PlanRequest;
}

export function registerPlanBootstrapTool(
	pi: ExtensionAPI,
	runtime: PlanRuntime,
): void {
	pi.registerTool<typeof StartPlanParameters, StartPlanDetails>({
		name: PLAN_BOOTSTRAP_TOOL_NAME,
		label: "Start Plan",
		description:
			"Start a Living Plan workflow from an explicit natural-language request to plan before implementation. Do not use for ordinary implementation requests, informal discussion, when a PlanRequest is already pending, or when an unfinished Living Plan exists.",
		promptSnippet:
			"Start a Living Plan when the user explicitly asks to plan before implementation",
		promptGuidelines: [
			"Use start_plan only when the user explicitly asks to create a plan or plan before implementation; never infer planning mode from an ordinary task request.",
		],
		parameters: StartPlanParameters,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (newPlanNeedsConfirmation(runtime)) {
				throw new Error(
					runtime.getPendingRequest()
						? "A Living Plan request is already pending. Use Command Palette → Start New Living Plan… to confirm replacing it."
						: "The current Living Plan is unfinished. Use Command Palette → Start New Living Plan… to confirm replacing it.",
				);
			}
			const request = startNewPlanRequest(
				pi,
				runtime,
				ctx,
				params.task,
			);
			return {
				content: [
					{
						type: "text",
						text: `Living Plan request ${request.id} started for: ${request.task}\nThe full plan tool and planning context are now active. Investigate the task, then create the plan.`,
					},
				],
				details: { request },
			};
		},
	});
}
