import assert from "node:assert/strict";
import test from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	isPlanControlChangedEvent,
	PLAN_CONTROL_ENTRY,
	PLAN_REQUEST_ENTRY,
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

function entry(value: object): SessionEntry {
	return value as SessionEntry;
}

test("validates cross-extension plan control events", () => {
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
