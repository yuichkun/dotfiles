import { randomUUID } from "node:crypto";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { persistPlanEnabled } from "./control.ts";
import {
	PLAN_REQUEST_CHANGED_EVENT,
	PLAN_REQUEST_ENTRY,
	planHasUnfinishedWork,
	type PlanRequest,
	type PlanRequestChangedEvent,
	type PlanRuntime,
} from "./state.ts";

export function newPlanNeedsConfirmation(runtime: PlanRuntime): boolean {
	if (runtime.getPendingRequest()) return true;
	const current = runtime.getPlan();
	return current !== undefined && planHasUnfinishedWork(current);
}

export function startNewPlanRequest(
	pi: ExtensionAPI,
	runtime: PlanRuntime,
	ctx: ExtensionContext,
	task: string,
	options: { allowReplaceIncomplete?: boolean } = {},
): PlanRequest {
	const normalizedTask = task.trim();
	if (!normalizedTask) throw new Error("Plan task must not be empty");
	if (
		newPlanNeedsConfirmation(runtime) &&
		!options.allowReplaceIncomplete
	) {
		throw new Error(
			runtime.getPendingRequest()
				? "The pending Living Plan request requires explicit confirmation before replacement in the Command Palette."
				: "The current Living Plan is unfinished. Starting a new plan requires explicit confirmation in the Command Palette.",
		);
	}
	if (!runtime.isEnabled()) persistPlanEnabled(pi, runtime, ctx, true);
	const request: PlanRequest = {
		schemaVersion: 1,
		id: randomUUID(),
		task: normalizedTask,
		createdAt: new Date().toISOString(),
	};
	pi.appendEntry(PLAN_REQUEST_ENTRY, request);
	runtime.setRequest(request);
	pi.events.emit(PLAN_REQUEST_CHANGED_EVENT, {
		sessionId: ctx.sessionManager.getSessionId(),
		branchLeafId: ctx.sessionManager.getLeafId(),
		request,
	} satisfies PlanRequestChangedEvent);
	return request;
}
