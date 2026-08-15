import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanContext, getStalenessLevel } from "./context.ts";
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
