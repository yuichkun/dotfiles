import { randomUUID } from "node:crypto";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	PLAN_CONTROL_CHANGED_EVENT,
	PLAN_CONTROL_ENTRY,
	type PlanControl,
	type PlanControlChangedEvent,
	type PlanRuntime,
} from "./state.ts";

function createPlanControl(enabled: boolean): PlanControl {
	return {
		schemaVersion: 1,
		id: randomUUID(),
		enabled,
		createdAt: new Date().toISOString(),
	};
}

export function persistPlanEnabled(
	pi: ExtensionAPI,
	runtime: PlanRuntime,
	ctx: ExtensionContext,
	enabled: boolean,
): PlanControl {
	const control = createPlanControl(enabled);
	pi.appendEntry(PLAN_CONTROL_ENTRY, control);
	runtime.setEnabled(enabled);
	pi.events.emit(PLAN_CONTROL_CHANGED_EVENT, {
		sessionId: ctx.sessionManager.getSessionId(),
		branchLeafId: ctx.sessionManager.getLeafId(),
		control,
	} satisfies PlanControlChangedEvent);
	return control;
}
