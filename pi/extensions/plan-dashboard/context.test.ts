import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanContext, getStalenessLevel } from "./context.ts";
import { compactPlan, createOrRevisePlan, type PlanStepInput } from "./plan.ts";
import type { PlanRuntimeState } from "./state.ts";
import { TEST_PLAN } from "./test-fixture.ts";

test("stays completely silent without an explicit plan request", () => {
	assert.equal(
		buildPlanContext({ workSinceUpdate: 0, turnsSinceUpdate: 0 }),
		undefined,
	);
});

test("injects direct planning with optional consultation for an explicit request", () => {
	const context = buildPlanContext({
		request: {
			schemaVersion: 1,
			id: "request-1",
			task: "Implement passkeys",
			createdAt: "2026-01-01T00:00:00.000Z",
		},
		workSinceUpdate: 0,
		turnsSinceUpdate: 0,
	});
	assert.match(context ?? "", /explicitly invoked \/plan/);
	assert.match(context ?? "", /Request ID: request-1/);
	assert.match(context ?? "", /Implement passkeys/);
	assert.match(context ?? "", /no consultation is required/);
	assert.match(context ?? "", /genuinely difficult, ambiguous, or high-risk/);
	assert.match(context ?? "", /optional advice, not an approval authority/);
	assert.match(context ?? "", /Do not consult when the user asks you not to/);
});

test("reports automatically compacted progress in a fresh digest", () => {
	const steps: PlanStepInput[] = Array.from({ length: 21 }, (_, index) => ({
		id: `S${String(index + 1).padStart(2, "0")}`,
		phase: "History",
		title: `Step ${index + 1}`,
		shortTitle: `Step ${index + 1}`,
		goal: "Bound active history",
		work: ["Perform the work"],
		acceptance: ["The work is complete"],
		dependsOn: [],
		relatedFiles: [],
		status: index < 11 ? "done" : "pending",
	}));
	const { plan } = createOrRevisePlan({
		input: {
			baseRevision: 0,
			title: "Automatically compacted plan",
			objective: "Keep compacted progress accurate",
			reason: "Initial plan",
			steps,
		},
		requestId: "request-context-compact",
		request: "Compact context history",
		now: "2026-01-02T00:00:00.000Z",
		createId: () => "plan-context-compact",
	});
	const context = buildPlanContext({
		plan,
		workSinceUpdate: 0,
		turnsSinceUpdate: 0,
	}) ?? "";
	assert.match(context, /Progress: 11\/21 resolved \(6 compacted\)/);
});

test("reports a manually compacted completed plan", () => {
	const completed = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({ ...step, status: "done" as const })),
	};
	const plan = compactPlan(
		completed,
		{ baseRevision: completed.revision, note: "Archive completed plan" },
		"2026-01-02T00:00:00.000Z",
	).plan;
	const context = buildPlanContext({
		plan,
		workSinceUpdate: 0,
		turnsSinceUpdate: 0,
	}) ?? "";
	assert.match(context, /Progress: 15\/15 resolved \(15 compacted\)/);
	assert.match(context, /Current: complete/);
	assert.match(context, /Ready: none/);
});

test("escalates a stale living-plan digest without creating an extra turn", () => {
	const state: PlanRuntimeState = {
		plan: TEST_PLAN,
		workSinceUpdate: 12,
		turnsSinceUpdate: 2,
	};
	const context = buildPlanContext(state) ?? "";
	assert.equal(getStalenessLevel(12, 2), 2);
	assert.match(context, /Synchronize the plan with reality/);
	assert.match(context, /S01 \[done\]/);
	assert.match(context, /S15 \[blocked\]/);
	assert.match(context, /Fable consultation is optional/);
	assert.match(context, /never an approval gate/);
});
