import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	newPlanNeedsConfirmation,
	startNewPlanRequest,
} from "./request.ts";
import {
	PLAN_CONTROL_CHANGED_EVENT,
	PLAN_CONTROL_ENTRY,
	PLAN_REQUEST_CHANGED_EVENT,
	PLAN_REQUEST_ENTRY,
	PlanRuntime,
} from "./state.ts";
import { TEST_PLAN } from "./test-fixture.ts";

function setup(): {
	pi: ExtensionAPI;
	ctx: ExtensionContext;
	entries: Array<{ type: string; data: unknown }>;
	emitted: Array<{ name: string; data: unknown }>;
} {
	const entries: Array<{ type: string; data: unknown }> = [];
	const emitted: Array<{ name: string; data: unknown }> = [];
	const pi = {
		appendEntry: (type: string, data: unknown) => entries.push({ type, data }),
		events: {
			emit: (name: string, data: unknown) => emitted.push({ name, data }),
		},
	} as unknown as ExtensionAPI;
	const ctx = {
		sessionManager: {
			getSessionId: () => "session-1",
			getLeafId: () => String(entries.length),
		},
	} as unknown as ExtensionContext;
	return { pi, ctx, entries, emitted };
}

test("starts the first plan request and enables the branch", () => {
	const runtime = new PlanRuntime();
	const { pi, ctx, entries, emitted } = setup();
	assert.equal(newPlanNeedsConfirmation(runtime), false);
	const request = startNewPlanRequest(
		pi,
		runtime,
		ctx,
		"  Implement passkeys  ",
	);
	assert.equal(request.task, "Implement passkeys");
	assert.equal(entries[0]?.type, PLAN_CONTROL_ENTRY);
	assert.equal((entries[0]?.data as { enabled?: boolean }).enabled, true);
	assert.equal(entries[1]?.type, PLAN_REQUEST_ENTRY);
	assert.equal(runtime.getPendingRequest()?.id, request.id);
	assert.equal(runtime.getPlanHistory().length, 0);
	assert.equal(runtime.isEnabled(), true);
	assert.deepEqual(emitted.map((event) => event.name), [
		PLAN_CONTROL_CHANGED_EVENT,
		PLAN_REQUEST_CHANGED_EVENT,
	]);
	assert.deepEqual(emitted[1], {
		name: PLAN_REQUEST_CHANGED_EVENT,
		data: {
			sessionId: "session-1",
			branchLeafId: "2",
			request,
		},
	});
});

test("rejects an empty Plan task without mutating state", () => {
	const runtime = new PlanRuntime();
	const { pi, ctx, entries, emitted } = setup();
	assert.throws(
		() => startNewPlanRequest(pi, runtime, ctx, "   "),
		/must not be empty/,
	);
	assert.equal(entries.length, 0);
	assert.equal(emitted.length, 0);
	assert.equal(runtime.getPendingRequest(), undefined);
});

test("resumes a disabled branch even when its latest Plan is invalid", () => {
	const runtime = new PlanRuntime();
	runtime.restore([
		{
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
		},
		{
			type: "custom",
			customType: PLAN_CONTROL_ENTRY,
			data: {
				schemaVersion: 1,
				id: "paused",
				enabled: false,
				createdAt: TEST_PLAN.createdAt,
			},
		},
	] as unknown as SessionEntry[]);
	assert.equal(runtime.getPlan(), undefined);
	assert.equal(runtime.getPendingRequest(), undefined);
	assert.equal(runtime.isEnabled(), false);

	const { pi, ctx, entries, emitted } = setup();
	startNewPlanRequest(pi, runtime, ctx, "Recovery Plan");
	assert.deepEqual(entries.map((entry) => entry.type), [
		PLAN_CONTROL_ENTRY,
		PLAN_REQUEST_ENTRY,
	]);
	assert.deepEqual(emitted.map((event) => event.name), [
		PLAN_CONTROL_CHANGED_EVENT,
		PLAN_REQUEST_CHANGED_EVENT,
	]);
	assert.equal(runtime.isEnabled(), true);
	assert.equal(runtime.getPendingRequest()?.task, "Recovery Plan");
});

test("moves a completed plan to history and resumes a paused branch", () => {
	const runtime = new PlanRuntime();
	const completed = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({
			...step,
			status: "done" as const,
		})),
	};
	runtime.applyPlan(completed);
	runtime.setEnabled(false);
	const { pi, ctx, entries, emitted } = setup();
	assert.equal(newPlanNeedsConfirmation(runtime), false);
	const request = startNewPlanRequest(pi, runtime, ctx, "Next task");
	assert.equal(entries[0]?.type, PLAN_CONTROL_ENTRY);
	assert.equal((entries[0]?.data as { enabled?: boolean }).enabled, true);
	assert.equal(entries[1]?.type, PLAN_REQUEST_ENTRY);
	assert.equal(runtime.getPlan(), undefined);
	assert.equal(runtime.getPlanHistory()[0]?.id, completed.id);
	assert.equal(runtime.getPendingRequest()?.id, request.id);
	assert.equal(runtime.isEnabled(), true);
	assert.deepEqual(emitted.map((event) => event.name), [
		PLAN_CONTROL_CHANGED_EVENT,
		PLAN_REQUEST_CHANGED_EVENT,
	]);
});

test("requires explicit confirmation before replacing unfinished work", () => {
	const runtime = new PlanRuntime();
	runtime.applyPlan(TEST_PLAN);
	runtime.setEnabled(true);
	const { pi, ctx, entries } = setup();
	assert.equal(newPlanNeedsConfirmation(runtime), true);
	assert.throws(
		() => startNewPlanRequest(pi, runtime, ctx, "Replacement"),
		/requires explicit confirmation/,
	);
	assert.equal(entries.length, 0);
	assert.equal(runtime.getPlan()?.id, TEST_PLAN.id);

	const request = startNewPlanRequest(
		pi,
		runtime,
		ctx,
		"Replacement",
		{ allowReplaceIncomplete: true },
	);
	assert.equal(entries[0]?.type, PLAN_REQUEST_ENTRY);
	assert.equal(runtime.getPlan(), undefined);
	assert.equal(runtime.getPlanHistory()[0]?.id, TEST_PLAN.id);
	assert.equal(runtime.getPendingRequest()?.id, request.id);
});

test("replaces a fully superseded Plan without confirmation", () => {
	const runtime = new PlanRuntime();
	const superseded = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({
			...step,
			status: "superseded" as const,
		})),
	};
	runtime.applyPlan(superseded);
	runtime.setEnabled(true);
	const { pi, ctx, entries } = setup();
	assert.equal(newPlanNeedsConfirmation(runtime), false);
	startNewPlanRequest(pi, runtime, ctx, "Next task");
	assert.equal(entries[0]?.type, PLAN_REQUEST_ENTRY);
	assert.equal(runtime.getPlan(), undefined);
	assert.equal(runtime.getPlanHistory()[0]?.id, superseded.id);
});

test("treats an existing pending request as unfinished", () => {
	const runtime = new PlanRuntime();
	runtime.setRequest({
		schemaVersion: 1,
		id: "pending",
		task: "Pending task",
		createdAt: "2026-01-01T00:00:00.000Z",
	});
	const { pi, ctx, entries } = setup();
	assert.equal(newPlanNeedsConfirmation(runtime), true);
	assert.throws(
		() => startNewPlanRequest(pi, runtime, ctx, "Replacement"),
		/requires explicit confirmation/,
	);
	assert.equal(entries.length, 0);
});
