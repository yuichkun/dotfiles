import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
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
	): Promise<{ details: PlanToolDetails }>;
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

function setup(): {
	runtime: PlanRuntime;
	tool: ExecutablePlanTool;
	execArgs: string[][];
} {
	const runtime = new PlanRuntime();
	runtime.setRequest({
		schemaVersion: 1,
		id: "request-1",
		task: "Implement passkeys",
		createdAt: "2026-01-01T00:00:00.000Z",
	});
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

test("requires and consumes a branch-local Fable consultation for initial set", async () => {
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

test("rejects initial plan creation without consultation", async () => {
	const { tool } = setup();
	await assert.rejects(
		tool.execute(
			"set",
			{
				op: "set",
				baseRevision: 0,
				title: "Invalid",
				objective: "No consultation",
				reason: "Should fail",
				steps: [],
			},
			undefined,
			undefined,
			context,
		),
		/requires a successful Fable consultation/,
	);
});
