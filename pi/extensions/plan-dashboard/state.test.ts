import assert from "node:assert/strict";
import test from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	isPlanControlChangedEvent,
	isPlanRequestChangedEvent,
	PLAN_CONTROL_ENTRY,
	PLAN_REQUEST_ENTRY,
	planHasUnfinishedWork,
	planIsComplete,
	PlanRuntime,
	type PlanConsultation,
	type PlanRequest,
} from "./state.ts";
import { TEST_PLAN } from "./test-fixture.ts";

const request: PlanRequest = {
	schemaVersion: 1,
	id: TEST_PLAN.requestId,
	task: TEST_PLAN.request,
	createdAt: TEST_PLAN.createdAt,
};

const consultation: PlanConsultation = {
	schemaVersion: 1,
	id: TEST_PLAN.consultationId ?? "consultation-test",
	requestId: TEST_PLAN.requestId,
	model: "fable",
	effort: "max",
	facts: [],
	constraints: [],
	openQuestions: [],
	response: "Independent advice",
	createdAt: TEST_PLAN.createdAt,
};

const secondRequest: PlanRequest = {
	schemaVersion: 1,
	id: "request-second",
	task: "Implement a second feature",
	createdAt: "2026-01-02T00:00:00.000Z",
};

const SECOND_PLAN = {
	...TEST_PLAN,
	id: "plan-second",
	requestId: secondRequest.id,
	request: secondRequest.task,
	title: "Second Plan",
	revision: 1,
	createdAt: secondRequest.createdAt,
	updatedAt: secondRequest.createdAt,
};

const thirdRequest: PlanRequest = {
	schemaVersion: 1,
	id: "request-third",
	task: "Implement a third feature",
	createdAt: "2026-01-03T00:00:00.000Z",
};

const THIRD_PLAN = {
	...SECOND_PLAN,
	id: "plan-third",
	requestId: thirdRequest.id,
	request: thirdRequest.task,
	title: "Third Plan",
	createdAt: thirdRequest.createdAt,
	updatedAt: thirdRequest.createdAt,
};

function entry(value: object): SessionEntry {
	return value as SessionEntry;
}

test("validates cross-extension Plan request and control events", () => {
	assert.equal(
		isPlanRequestChangedEvent({
			sessionId: "session-1",
			branchLeafId: "leaf-1",
			request,
		}),
		true,
	);
	assert.equal(
		isPlanRequestChangedEvent({
			sessionId: "session-1",
			branchLeafId: null,
			request,
		}),
		true,
	);
	assert.equal(
		isPlanRequestChangedEvent({
			sessionId: "session-1",
			branchLeafId: "",
			request,
		}),
		false,
	);
	assert.equal(
		isPlanRequestChangedEvent({
			sessionId: "session-1",
			branchLeafId: "leaf-1",
			request: { ...request, task: "" },
		}),
		false,
	);

	const control = {
		schemaVersion: 1,
		id: "control-1",
		enabled: false,
		createdAt: TEST_PLAN.createdAt,
	};
	assert.equal(
		isPlanControlChangedEvent({
			sessionId: "session-1",
			branchLeafId: "leaf-1",
			control,
		}),
		true,
	);
	assert.equal(
		isPlanControlChangedEvent({
			sessionId: "",
			branchLeafId: "leaf-1",
			control,
		}),
		false,
	);
	assert.equal(
		isPlanControlChangedEvent({
			sessionId: "session-1",
			branchLeafId: "",
			control,
		}),
		false,
	);
	assert.equal(
		isPlanControlChangedEvent({
			sessionId: "session-1",
			branchLeafId: "leaf-1",
			control: { ...control, enabled: "false" },
		}),
		false,
	);
});

test("restores a branch-local request, consultation, and latest plan", () => {
	const runtime = new PlanRuntime();
	runtime.restore([
		entry({
			type: "custom",
			id: "1",
			parentId: null,
			timestamp: TEST_PLAN.createdAt,
			customType: PLAN_REQUEST_ENTRY,
			data: request,
		}),
		entry({
			type: "message",
			id: "2",
			parentId: "1",
			timestamp: TEST_PLAN.createdAt,
			message: {
				role: "toolResult",
				toolCallId: "consult",
				toolName: "plan",
				content: [],
				details: { kind: "consultation", consultation },
				isError: false,
				timestamp: 1,
			},
		}),
		entry({
			type: "message",
			id: "3",
			parentId: "2",
			timestamp: TEST_PLAN.createdAt,
			message: {
				role: "toolResult",
				toolCallId: "set",
				toolName: "plan",
				content: [],
				details: { kind: "plan", operation: "set", plan: TEST_PLAN },
				isError: false,
				timestamp: 2,
			},
		}),
		entry({
			type: "message",
			id: "4",
			parentId: "3",
			timestamp: TEST_PLAN.createdAt,
			message: {
				role: "toolResult",
				toolCallId: "edit",
				toolName: "edit",
				content: [],
				isError: false,
				timestamp: 3,
			},
		}),
	]);

	assert.equal(runtime.getPendingRequest(), undefined);
	assert.equal(runtime.isEnabled(), true);
	assert.equal(runtime.getPlan()?.revision, TEST_PLAN.revision);
	assert.equal(runtime.getConsultation(consultation.id)?.response, "Independent advice");
	assert.equal(runtime.getState().workSinceUpdate, 1);
});

test("migrates a schema-v1 snapshot while restoring branch state", () => {
	const runtime = new PlanRuntime();
	const { archivedSteps: _archivedSteps, ...legacy } = TEST_PLAN;
	runtime.restore([
		entry({
			type: "message",
			id: "1",
			parentId: null,
			timestamp: TEST_PLAN.createdAt,
			message: {
				role: "toolResult",
				toolCallId: "set",
				toolName: "plan",
				content: [],
				details: {
					kind: "plan",
					operation: "set",
					plan: { ...legacy, schemaVersion: 1 },
				},
				isError: false,
				timestamp: 1,
			},
		}),
	]);
	assert.equal(runtime.getPlan()?.schemaVersion, 2);
	assert.deepEqual(runtime.getPlan()?.archivedSteps, []);
	assert.equal(runtime.isEnabled(), true);
});

test("treats a request without a plan snapshot as pending", () => {
	const runtime = new PlanRuntime();
	runtime.restore([
		entry({
			type: "custom",
			id: "1",
			parentId: null,
			timestamp: TEST_PLAN.createdAt,
			customType: PLAN_REQUEST_ENTRY,
			data: request,
		}),
	]);
	assert.equal(runtime.getPendingRequest()?.id, request.id);
	assert.equal(runtime.getPlan(), undefined);
	assert.equal(runtime.isEnabled(), true);
});

test("restores the latest plan as current and earlier plans as history", () => {
	const runtime = new PlanRuntime();
	const latestFirstPlan = {
		...TEST_PLAN,
		revision: TEST_PLAN.revision + 1,
		changeReason: "Final first-plan update",
		updatedAt: "2026-01-01T01:00:00.000Z",
	};
	const requestEntry = (value: PlanRequest) =>
		entry({
			type: "custom",
			customType: PLAN_REQUEST_ENTRY,
			data: value,
		});
	const planEntry = (plan: typeof TEST_PLAN) =>
		entry({
			type: "message",
			message: {
				role: "toolResult",
				toolName: "plan",
				details: { kind: "plan", operation: "set", plan },
				isError: false,
			},
		});

	runtime.restore([
		requestEntry(request),
		planEntry(TEST_PLAN),
		planEntry(latestFirstPlan),
		requestEntry(secondRequest),
		planEntry(SECOND_PLAN),
		requestEntry(thirdRequest),
		planEntry(THIRD_PLAN),
	]);
	assert.equal(runtime.getPlan()?.id, THIRD_PLAN.id);
	assert.equal(runtime.getPendingRequest(), undefined);
	assert.deepEqual(runtime.getPlanHistory().map((plan) => plan.id), [
		SECOND_PLAN.id,
		TEST_PLAN.id,
	]);
	assert.equal(runtime.getPlanHistory()[0]?.revision, SECOND_PLAN.revision);
	assert.equal(runtime.getPlanHistory()[1]?.revision, latestFirstPlan.revision);
});

test("keeps the previous plan in history while a new request is pending", () => {
	const runtime = new PlanRuntime();
	runtime.applyPlan(TEST_PLAN);
	runtime.setRequest(secondRequest);
	assert.equal(runtime.getPlan(), undefined);
	assert.equal(runtime.getPendingRequest()?.id, secondRequest.id);
	assert.equal(runtime.getPlanHistory()[0]?.id, TEST_PLAN.id);

	runtime.applyPlan(SECOND_PLAN);
	assert.equal(runtime.getPlan()?.id, SECOND_PLAN.id);
	assert.equal(runtime.getPlanHistory()[0]?.id, TEST_PLAN.id);
});

test("restores a Palette replacement as pending with the prior Plan in history", () => {
	const runtime = new PlanRuntime();
	runtime.restore([
		entry({
			type: "custom",
			customType: PLAN_REQUEST_ENTRY,
			data: request,
		}),
		entry({
			type: "message",
			message: {
				role: "toolResult",
				toolName: "plan",
				details: { kind: "plan", operation: "set", plan: TEST_PLAN },
				isError: false,
			},
		}),
		entry({
			type: "custom",
			customType: PLAN_CONTROL_ENTRY,
			data: {
				schemaVersion: 1,
				id: "control-replacement",
				enabled: true,
				createdAt: TEST_PLAN.createdAt,
			},
		}),
		entry({
			type: "custom",
			customType: PLAN_REQUEST_ENTRY,
			data: secondRequest,
		}),
	]);

	assert.equal(runtime.getPlan(), undefined);
	assert.equal(runtime.getPendingRequest()?.id, secondRequest.id);
	assert.equal(runtime.getPlanHistory()[0]?.id, TEST_PLAN.id);
	assert.equal(runtime.isEnabled(), true);
});

test("distinguishes unfinished, completed, and fully superseded Plans", () => {
	const completed = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({
			...step,
			status: "done" as const,
		})),
	};
	const superseded = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({
			...step,
			status: "superseded" as const,
		})),
	};
	const archivedOnly = {
		...TEST_PLAN,
		steps: [],
		archivedSteps: [
			{
				id: "S01",
				phase: "調査",
				status: "done" as const,
				compactedAt: TEST_PLAN.updatedAt,
			},
		],
	};

	assert.equal(planHasUnfinishedWork(TEST_PLAN), true);
	assert.equal(planIsComplete(TEST_PLAN), false);
	assert.equal(planHasUnfinishedWork(completed), false);
	assert.equal(planIsComplete(completed), true);
	assert.equal(planHasUnfinishedWork(superseded), false);
	assert.equal(planIsComplete(superseded), false);
	assert.equal(planHasUnfinishedWork(archivedOnly), false);
	assert.equal(planIsComplete(archivedOnly), true);
});

test("never displays an invalid latest snapshot as plausible progress", () => {
	const runtime = new PlanRuntime();
	const invalid = { ...TEST_PLAN, schemaVersion: 99 };
	runtime.restore([
		entry({
			type: "message",
			message: {
				role: "toolResult",
				toolName: "plan",
				details: { kind: "plan", operation: "set", plan: TEST_PLAN },
				isError: false,
			},
		}),
		entry({
			type: "message",
			id: "1",
			parentId: null,
			timestamp: TEST_PLAN.createdAt,
			message: {
				role: "toolResult",
				toolCallId: "set",
				toolName: "plan",
				content: [],
				details: { kind: "plan", operation: "set", plan: invalid },
				isError: false,
				timestamp: 1,
			},
		}),
	]);
	assert.equal(runtime.getPlan(), undefined);
	assert.equal(runtime.isEnabled(), false);
	assert.match(runtime.getState().error ?? "", /Unsupported plan schema/);
});

test("clears invalid snapshot errors when a later request starts", () => {
	const runtime = new PlanRuntime();
	runtime.restore([
		entry({
			type: "custom",
			customType: PLAN_REQUEST_ENTRY,
			data: request,
		}),
		entry({
			type: "message",
			message: {
				role: "toolResult",
				toolName: "plan",
				details: {
					kind: "plan",
					operation: "set",
					plan: { ...TEST_PLAN, schemaVersion: 99 },
				},
				isError: false,
			},
		}),
		entry({
			type: "custom",
			customType: PLAN_REQUEST_ENTRY,
			data: secondRequest,
		}),
	]);
	assert.equal(runtime.getState().error, undefined);
	assert.equal(runtime.getPlan(), undefined);
	assert.equal(runtime.getPendingRequest()?.id, secondRequest.id);
	assert.equal(runtime.getPlanHistory().length, 0);
});

test("replays branch-local controls and freezes staleness while paused", () => {
	const control = (enabled: boolean) =>
		entry({
			type: "custom",
			customType: PLAN_CONTROL_ENTRY,
			data: {
				schemaVersion: 1,
				id: `control-${enabled}`,
				enabled,
				createdAt: TEST_PLAN.createdAt,
			},
		});
	const work = () =>
		entry({
			type: "message",
			message: {
				role: "toolResult",
				toolName: "edit",
				isError: false,
			},
		});
	const turn = () => entry({ type: "message", message: { role: "assistant" } });
	const runtime = new PlanRuntime();
	runtime.restore([
		entry({
			type: "custom",
			customType: PLAN_REQUEST_ENTRY,
			data: request,
		}),
		entry({
			type: "message",
			message: {
				role: "toolResult",
				toolName: "plan",
				details: { kind: "plan", operation: "set", plan: TEST_PLAN },
				isError: false,
			},
		}),
		work(),
		turn(),
		control(false),
		work(),
		turn(),
		control(true),
		work(),
		turn(),
		control(false),
		work(),
		turn(),
	]);
	assert.equal(runtime.isEnabled(), false);
	assert.equal(runtime.getState().workSinceUpdate, 2);
	assert.equal(runtime.getState().turnsSinceUpdate, 2);
	runtime.recordToolResult("edit", false);
	runtime.recordTurn();
	assert.equal(runtime.getState().workSinceUpdate, 2);
	assert.equal(runtime.getState().turnsSinceUpdate, 2);
});
