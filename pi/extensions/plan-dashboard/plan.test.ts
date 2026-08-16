import assert from "node:assert/strict";
import test from "node:test";
import {
	applyPlanProgress,
	buildPlanViews,
	createOrRevisePlan,
	migratePlan,
	PlanValidationError,
	summarizePlan,
	validatePlan,
	type Plan,
	type PlanStepInput,
} from "./plan.ts";
import { TEST_PLAN } from "./test-fixture.ts";

function stepInputs(plan: Plan): PlanStepInput[] {
	return plan.steps.map((step) => ({
		id: step.id,
		phase: step.phase,
		title: step.title,
		shortTitle: step.shortTitle,
		goal: step.goal,
		work: [...step.work],
		acceptance: [...step.acceptance],
		dependsOn: [...step.dependsOn],
		relatedFiles: [...step.relatedFiles],
		status: step.status,
	}));
}

test("derives ready and blocked states from stored dependencies", () => {
	const views = buildPlanViews(TEST_PLAN);
	assert.deepEqual(summarizePlan(views), {
		total: 15,
		done: 3,
		inProgress: 1,
		ready: 2,
		blocked: 9,
		superseded: 0,
	});
	assert.equal(views.find((view) => view.step.id === "S05")?.status, "ready");
	assert.deepEqual(
		views.find((view) => view.step.id === "S07")?.blockers.map((step) => step.id),
		["S04", "S05", "S06"],
	);
});

test("rejects malformed status, missing dependencies, and cycles", () => {
	const malformed = structuredClone(TEST_PLAN);
	malformed.steps[4]!.status = "unknown" as never;
	assert.throws(() => validatePlan(malformed), /Invalid status/);

	const missing = structuredClone(TEST_PLAN);
	missing.steps[4]!.dependsOn = ["missing"];
	assert.throws(() => validatePlan(missing), /depends on missing step/);

	const cyclic = structuredClone(TEST_PLAN);
	cyclic.steps[0]!.dependsOn = ["S15"];
	assert.throws(() => validatePlan(cyclic), /Dependency cycle/);
});

test("migrates a schema-v1 snapshot without losing active steps", () => {
	const { archivedSteps: _archivedSteps, ...legacy } = TEST_PLAN;
	const migrated = migratePlan({ ...legacy, schemaVersion: 1 });
	assert.equal(migrated.schemaVersion, 2);
	assert.equal(migrated.steps.length, TEST_PLAN.steps.length);
	assert.deepEqual(migrated.archivedSteps, []);
});

test("rejects malformed persisted plan records with validation errors", () => {
	for (const value of [
		null,
		{ ...TEST_PLAN, steps: "not-an-array" },
		{ ...TEST_PLAN, archivedSteps: "not-an-array" },
		{ ...TEST_PLAN, steps: [null] },
		{ ...TEST_PLAN, archivedSteps: [null] },
	]) {
		assert.throws(
			() => migratePlan(value),
			(error: unknown) => error instanceof PlanValidationError,
		);
	}
});

test("validates archived dependencies and reserves their step ids", () => {
	const plan = structuredClone(TEST_PLAN);
	const archived = plan.steps.find((step) => step.id === "S01")!;
	plan.steps = plan.steps.filter((step) => step.id !== archived.id);
	plan.archivedSteps = [
		{
			id: archived.id,
			phase: archived.phase,
			status: "done",
			compactedAt: "2026-01-02T00:00:00.000Z",
		},
	];

	assert.doesNotThrow(() => validatePlan(plan));
	assert.ok(
		plan.steps.find((step) => step.id === "S04")?.dependsOn.includes(archived.id),
	);
	assert.deepEqual(
		buildPlanViews(plan).find((view) => view.step.id === "S04")?.blockers,
		[],
	);

	assert.throws(
		() =>
			createOrRevisePlan({
				current: plan,
				input: {
					baseRevision: plan.revision,
					title: plan.title,
					objective: plan.objective,
					reason: "Attempt archived id reuse",
					steps: [...stepInputs(plan), stepInputs(TEST_PLAN)[0]!],
				},
				requestId: plan.requestId,
				request: plan.request,
				now: "2026-01-03T00:00:00.000Z",
				createId: () => "unused",
			}),
		/Archived step id cannot be reused: S01/,
	);
});

test("rejects snapshots without an active step", () => {
	const archivedOnly = structuredClone(TEST_PLAN);
	archivedOnly.steps = [];
	archivedOnly.archivedSteps = [
		{
			id: "S16",
			phase: "Archive",
			status: "done",
			compactedAt: "2026-01-02T00:00:00.000Z",
		},
	];
	assert.throws(() => validatePlan(archivedOnly), /at least one active step/);
	assert.throws(
		() => validatePlan({ ...archivedOnly, archivedSteps: [] }),
		/at least one active step/,
	);
});

test("rejects malformed archived tombstones", () => {
	const malformed = structuredClone(TEST_PLAN);
	malformed.archivedSteps = [
		{
			id: "S16",
			phase: "Archive",
			status: "pending" as never,
			compactedAt: "2026-01-02T00:00:00.000Z",
		},
	];
	assert.throws(() => validatePlan(malformed), /must be done or superseded/);

	malformed.archivedSteps[0]!.status = "done";
	malformed.archivedSteps[0]!.compactedAt = "not-a-timestamp";
	assert.throws(() => validatePlan(malformed), /must be an ISO timestamp/);

	malformed.archivedSteps = [
		{
			...malformed.archivedSteps[0]!,
			id: TEST_PLAN.steps[0]!.id,
			compactedAt: "2026-01-02T00:00:00.000Z",
		},
	];
	assert.throws(() => validatePlan(malformed), /Duplicate step id: S01/);
});

test("revises a plan with stable ids and supersedes omitted steps", () => {
	const inputs = stepInputs(TEST_PLAN).filter((step) => step.id !== "S15");
	inputs.find((step) => step.id === "S05")!.title = "評価観点を更新する";
	const revised = createOrRevisePlan({
		current: TEST_PLAN,
		input: {
			baseRevision: 4,
			title: TEST_PLAN.title,
			objective: TEST_PLAN.objective,
			reason: "Evaluation changed",
			steps: inputs,
		},
		requestId: TEST_PLAN.requestId,
		request: TEST_PLAN.request,
		consultationId: TEST_PLAN.consultationId,
		now: "2026-01-02T00:00:00.000Z",
		createId: () => "must-not-be-used",
	});

	assert.equal(revised.id, TEST_PLAN.id);
	assert.equal(revised.revision, 5);
	assert.equal(revised.steps.find((step) => step.id === "S15")?.status, "superseded");
	assert.equal(
		revised.steps.find((step) => step.id === "S04")?.updatedAt,
		TEST_PLAN.steps.find((step) => step.id === "S04")?.updatedAt,
	);
	assert.equal(
		revised.steps.find((step) => step.id === "S05")?.updatedAt,
		"2026-01-02T00:00:00.000Z",
	);
});

test("atomically completes the current step and starts a ready step", () => {
	const revised = applyPlanProgress(
		TEST_PLAN,
		{
			baseRevision: 4,
			done: "S04",
			start: "S05",
			note: "DAG complete; begin evaluation",
		},
		"2026-01-02T00:00:00.000Z",
	);
	assert.equal(revised.revision, 5);
	assert.equal(revised.steps.find((step) => step.id === "S04")?.status, "done");
	assert.equal(
		revised.steps.find((step) => step.id === "S05")?.status,
		"in_progress",
	);
});

test("rejects stale progress and blocked starts", () => {
	assert.throws(
		() =>
			applyPlanProgress(
				TEST_PLAN,
				{ baseRevision: 3, done: "S04", note: "stale" },
				"2026-01-02T00:00:00.000Z",
			),
		/expected 4, received 3/,
	);
	assert.throws(
		() =>
			applyPlanProgress(
				TEST_PLAN,
				{ baseRevision: 4, done: "S04", start: "S07", note: "blocked" },
				"2026-01-02T00:00:00.000Z",
			),
		(error: unknown) =>
			error instanceof PlanValidationError && /blocked by/.test(error.message),
	);
});
