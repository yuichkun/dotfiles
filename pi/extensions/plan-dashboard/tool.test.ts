import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { compactPlan } from "./plan.ts";
import { PlanRuntime, type PlanToolDetails } from "./state.ts";
import { TEST_PLAN } from "./test-fixture.ts";
import { registerPlanTool } from "./tool.ts";

interface Renderable {
	render(width: number): string[];
}

interface ExecutablePlanTool {
	renderShell: "self";
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: undefined,
		ctx: ExtensionContext,
	): Promise<{
		content: Array<{ type: "text"; text: string }>;
		details: PlanToolDetails;
	}>;
	renderCall(args: { op: string }, theme: Theme): Renderable;
	renderResult(
		result: {
			content: Array<{ type: "text"; text: string }>;
			details?: PlanToolDetails;
		},
		options: { expanded: boolean; isPartial: boolean },
		theme: Theme,
	): Renderable;
}

function setup(withRequest = true): {
	runtime: PlanRuntime;
	tool: ExecutablePlanTool;
	execArgs: string[][];
} {
	const runtime = new PlanRuntime();
	if (withRequest) {
		runtime.setRequest({
			schemaVersion: 1,
			id: "request-1",
			task: "Implement passkeys",
			createdAt: "2026-01-01T00:00:00.000Z",
		});
	}
	let tool: ExecutablePlanTool | undefined;
	const execArgs: string[][] = [];
	const pi = {
		registerTool: (definition: unknown) => {
			tool = definition as ExecutablePlanTool;
		},
		exec: async (_command: string, args: string[]) => {
			execArgs.push(args);
			return {
				stdout: "Independent advice",
				stderr: "",
				code: 0,
				killed: false,
			};
		},
	} as unknown as ExtensionAPI;
	registerPlanTool(pi, runtime);
	assert.ok(tool);
	return { runtime, tool, execArgs };
}

const context = {} as ExtensionContext;

test("optionally consumes a branch-local Fable consultation for initial set", async () => {
	const { runtime, tool, execArgs } = setup();
	const consultationResult = await tool.execute(
		"consult",
		{
			op: "consult",
			requestId: "request-1",
			facts: [{ statement: "Passwords exist", source: "src/auth.ts" }],
			constraints: [],
			openQuestions: [],
		},
		undefined,
		undefined,
		context,
	);
	assert.equal(consultationResult.details.kind, "consultation");
	assert.deepEqual(execArgs[0]?.slice(0, 5), [
		"-p",
		"--model",
		"fable",
		"--effort",
		"max",
	]);
	const consultationId =
		consultationResult.details.kind === "consultation"
			? consultationResult.details.consultation.id
			: "";

	const setResult = await tool.execute(
		"set",
		{
			op: "set",
			baseRevision: 0,
			consultationId,
			title: "Passkey migration",
			objective: "Migrate existing users safely",
			reason: "Initial plan",
			steps: [
				{
					id: "S01",
					phase: "Investigation",
					title: "Inspect current authentication",
					shortTitle: "Inspect auth",
					goal: "Understand the current flow",
					work: ["Read authentication code"],
					acceptance: ["Current flow is documented"],
					dependsOn: [],
					relatedFiles: ["src/auth.ts"],
					status: "in_progress",
				},
			],
		},
		undefined,
		undefined,
		context,
	);
	assert.equal(setResult.details.kind, "plan");
	assert.equal(runtime.getPlan()?.revision, 1);
	assert.equal(runtime.getPlan()?.request, "Implement passkeys");

	const getResult = await tool.execute(
		"get",
		{ op: "get" },
		undefined,
		undefined,
		context,
	);
	assert.equal(getResult.details.kind, "inspection");
});

test("rendering keeps completion neutral and uses a self shell", () => {
	const { tool } = setup();
	assert.equal(tool.renderShell, "self");
	const theme = {
		fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
		bold: (text: string) => text,
	} as unknown as Theme;
	const call = tool
		.renderCall({ op: "get" }, theme)
		.render(120)
		.join("\n")
		.trimEnd();
	assert.equal(call, "<text>plan</text> <muted>get</muted>");

	const partial = tool.renderResult(
		{ content: [], details: { kind: "inspection", plan: TEST_PLAN } },
		{ expanded: false, isPartial: true },
		theme,
	).render(120).join("\n").trimEnd();
	assert.equal(partial, "<accent>Updating plan…</accent>");
	assert.ok(!partial.includes("<warning>"));

	const inspection = tool.renderResult(
		{ content: [], details: { kind: "inspection", plan: TEST_PLAN } },
		{ expanded: false, isPartial: false },
		theme,
	).render(120).join("\n").trimEnd();
	assert.equal(inspection, "<text>Plan r4 inspected</text>");

	const completed = tool.renderResult(
		{
			content: [],
			details: { kind: "plan", operation: "set", plan: TEST_PLAN },
		},
		{ expanded: false, isPartial: false },
		theme,
	).render(120).join("\n").trimEnd();
	assert.equal(completed, "<text>● Plan r4 · set</text>");
});

test("creates an initial plan without consultation", async () => {
	const { runtime, tool, execArgs } = setup();
	const result = await tool.execute(
		"set",
		{
			op: "set",
			baseRevision: 0,
			title: "Direct plan",
			objective: "Plan routine work directly",
			reason: "Consultation is unnecessary",
			steps: [
				{
					id: "S01",
					phase: "Implementation",
					title: "Implement the change",
					shortTitle: "Implement",
					goal: "Complete the routine task",
					work: ["Make the focused change"],
					acceptance: ["The change is validated"],
					dependsOn: [],
					relatedFiles: [],
					status: "in_progress",
				},
			],
		},
		undefined,
		undefined,
		context,
	);
	assert.equal(result.details.kind, "plan");
	assert.equal(runtime.getPlan()?.consultationId, undefined);
	assert.equal(execArgs.length, 0);
});

test("returns full details for steps compacted automatically by set", async () => {
	const { runtime, tool } = setup();
	const steps = Array.from({ length: 21 }, (_, index) => ({
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
	const result = await tool.execute(
		"set",
		{
			op: "set",
			baseRevision: 0,
			title: "Automatically compacted plan",
			objective: "Persist compacted details",
			reason: "Initial plan",
			steps,
		},
		undefined,
		undefined,
		context,
	);
	assert.equal(result.details.kind, "plan");
	if (result.details.kind === "plan") {
		assert.equal(result.details.operation, "set");
		assert.deepEqual(
			result.details.compactedSteps?.map((step) => step.id),
			["S01", "S02", "S03", "S04", "S05", "S06"],
		);
	}
	assert.equal(runtime.getPlan()?.archivedSteps.length, 6);
	assert.match(result.content[0]?.text ?? "", /Active: 15; compacted: 6/);
	assert.match(
		result.content[0]?.text ?? "",
		/Compacted now: S01, S02, S03, S04, S05, S06/,
	);

	const inspection = await tool.execute(
		"get",
		{ op: "get" },
		undefined,
		undefined,
		context,
	);
	assert.match(inspection.content[0]?.text ?? "", /"archivedSteps"/);
	assert.match(inspection.content[0]?.text ?? "", /"id": "S01"/);
});

test("compacts resolved steps without clearing staleness", async () => {
	const { runtime, tool } = setup();
	runtime.applyPlan(TEST_PLAN);
	runtime.recordToolResult("edit", false);
	runtime.recordTurn();
	const result = await tool.execute(
		"compact",
		{
			op: "compact",
			baseRevision: TEST_PLAN.revision,
			note: "Archive resolved history",
		},
		undefined,
		undefined,
		context,
	);
	assert.equal(result.details.kind, "plan");
	if (result.details.kind === "plan") {
		assert.equal(result.details.operation, "compact");
		assert.deepEqual(
			result.details.compactedSteps,
			TEST_PLAN.steps.filter((step) =>
				step.status === "done" || step.status === "superseded"
			),
		);
		assert.equal(result.details.plan.archivedSteps.length, 3);
	}
	assert.equal(runtime.getState().workSinceUpdate, 1);
	assert.equal(runtime.getState().turnsSinceUpdate, 1);
	assert.match(result.content[0]?.text ?? "", /Active: 12; compacted: 3/);
	assert.match(result.content[0]?.text ?? "", /Compacted now: S01, S02, S03/);

	const theme = {
		fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
		bold: (text: string) => text,
	} as unknown as Theme;
	const renderedCall = tool
		.renderCall({ op: "compact" }, theme)
		.render(120)
		.join("\n")
		.trimEnd();
	assert.equal(renderedCall, "<text>plan</text> <muted>compact</muted>");
	const rendered = tool
		.renderResult(result, { expanded: false, isPartial: false }, theme)
		.render(120)
		.join("\n")
		.trimEnd();
	assert.equal(rendered, "<text>● Plan r5 · compact</text>");
});

test("restores compact snapshots without clearing prior staleness", () => {
	const runtime = new PlanRuntime();
	const compacted = compactPlan(
		TEST_PLAN,
		{ baseRevision: TEST_PLAN.revision, note: "Archive resolved history" },
		"2026-01-02T00:00:00.000Z",
	).plan;
	const entry = (value: object): SessionEntry => value as SessionEntry;
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
			message: {
				role: "toolResult",
				toolName: "edit",
				isError: false,
			},
		}),
		entry({ type: "message", message: { role: "assistant" } }),
		entry({
			type: "message",
			message: {
				role: "toolResult",
				toolName: "plan",
				details: { kind: "plan", operation: "compact", plan: compacted },
				isError: false,
			},
		}),
	]);
	assert.equal(runtime.getPlan()?.revision, compacted.revision);
	assert.equal(runtime.getState().workSinceUpdate, 1);
	assert.equal(runtime.getState().turnsSinceUpdate, 1);
});

test("rejects tool execution while the plan is paused", async () => {
	const { runtime, tool } = setup();
	runtime.setEnabled(false);
	await assert.rejects(
		tool.execute("get", { op: "get" }, undefined, undefined, context),
		/living plan is inactive/,
	);
});

test("rejects execution outside a plan workflow", async () => {
	const { tool } = setup(false);
	await assert.rejects(
		tool.execute("get", { op: "get" }, undefined, undefined, context),
		/living plan is inactive/,
	);
});

test("rejects an explicitly supplied unknown consultation", async () => {
	const { tool } = setup();
	await assert.rejects(
		tool.execute(
			"set",
			{
				op: "set",
				baseRevision: 0,
				consultationId: "missing-consultation",
				title: "Invalid advice",
				objective: "Reject stale external advice",
				reason: "Invalid consultation",
				steps: [],
			},
			undefined,
			undefined,
			context,
		),
		/unavailable on the current session branch/,
	);
});
