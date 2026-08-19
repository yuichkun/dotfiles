import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	PLAN_BOOTSTRAP_TOOL_NAME,
	registerPlanBootstrapTool,
} from "./bootstrap.ts";
import {
	PLAN_CONTROL_ENTRY,
	PLAN_REQUEST_ENTRY,
	PlanRuntime,
} from "./state.ts";
import { TEST_PLAN } from "./test-fixture.ts";

interface ExecutableBootstrapTool {
	name: string;
	description: string;
	promptGuidelines: string[];
	execute(
		toolCallId: string,
		params: { task: string },
		signal: AbortSignal | undefined,
		onUpdate: undefined,
		ctx: ExtensionContext,
	): Promise<{
		content: Array<{ type: "text"; text: string }>;
		details: { request: { id: string; task: string } };
	}>;
}

function setup(): {
	runtime: PlanRuntime;
	tool: ExecutableBootstrapTool;
	entries: Array<{ type: string; data: unknown }>;
	context: ExtensionContext;
} {
	const runtime = new PlanRuntime();
	const entries: Array<{ type: string; data: unknown }> = [];
	let tool: ExecutableBootstrapTool | undefined;
	const pi = {
		registerTool: (definition: unknown) => {
			tool = definition as ExecutableBootstrapTool;
		},
		appendEntry: (type: string, data: unknown) => entries.push({ type, data }),
		events: { emit: () => {} },
	} as unknown as ExtensionAPI;
	const context = {
		sessionManager: {
			getSessionId: () => "session-1",
			getLeafId: () => String(entries.length),
		},
	} as unknown as ExtensionContext;
	registerPlanBootstrapTool(pi, runtime);
	assert.ok(tool);
	return { runtime, tool, entries, context };
}

test("starts an explicit natural-language planning request", async () => {
	const { runtime, tool, entries, context } = setup();
	assert.equal(tool.name, PLAN_BOOTSTRAP_TOOL_NAME);
	assert.match(tool.description, /explicit natural-language request/);
	assert.match(tool.description, /PlanRequest is already pending/);
	assert.ok(
		tool.promptGuidelines.some((guideline) =>
			/never infer planning mode from an ordinary task request/.test(guideline),
		),
	);

	const result = await tool.execute(
		"start",
		{ task: "  Plan a passkey migration  " },
		undefined,
		undefined,
		context,
	);
	assert.equal(entries.length, 2);
	assert.equal(entries[0]?.type, PLAN_CONTROL_ENTRY);
	assert.equal(
		(entries[0]?.data as { enabled?: boolean }).enabled,
		true,
	);
	assert.equal(entries[1]?.type, PLAN_REQUEST_ENTRY);
	assert.equal(runtime.getPendingRequest()?.task, "Plan a passkey migration");
	assert.equal(runtime.isEnabled(), true);
	assert.equal(result.details.request.task, "Plan a passkey migration");
	assert.match(result.content[0]?.text ?? "", /full plan tool.*now active/i);
});

test("starts a new plan after archiving a completed current plan", async () => {
	const { runtime, tool, entries, context } = setup();
	const completed = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({
			...step,
			status: "done" as const,
		})),
	};
	runtime.applyPlan(completed);
	runtime.setEnabled(true);
	await tool.execute(
		"next",
		{ task: "Plan the next feature" },
		undefined,
		undefined,
		context,
	);
	assert.equal(entries.length, 1);
	assert.equal(runtime.getPlan(), undefined);
	assert.equal(runtime.getPlanHistory()[0]?.id, completed.id);
	assert.equal(runtime.getPendingRequest()?.task, "Plan the next feature");
});

test("resumes a paused branch when explicitly starting after completion", async () => {
	const { runtime, tool, entries, context } = setup();
	const completed = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({
			...step,
			status: "done" as const,
		})),
	};
	runtime.applyPlan(completed);
	runtime.setEnabled(false);
	await tool.execute(
		"next-paused",
		{ task: "Plan the next paused feature" },
		undefined,
		undefined,
		context,
	);
	assert.equal(entries.length, 2);
	assert.equal(entries[0]?.type, PLAN_CONTROL_ENTRY);
	assert.equal(
		(entries[0]?.data as { enabled?: boolean }).enabled,
		true,
	);
	assert.equal(entries[1]?.type, PLAN_REQUEST_ENTRY);
	assert.equal(runtime.isEnabled(), true);
	assert.equal(runtime.getPlanHistory()[0]?.id, completed.id);
	assert.equal(runtime.getPendingRequest()?.task, "Plan the next paused feature");
});

test("refuses to replace unfinished or pending work", async () => {
	const existing = setup();
	existing.runtime.applyPlan(TEST_PLAN);
	existing.runtime.setEnabled(true);
	await assert.rejects(
		existing.tool.execute(
			"existing",
			{ task: "Replacement" },
			undefined,
			undefined,
			existing.context,
		),
		/Command Palette.*Start New Living Plan/,
	);
	assert.equal(existing.entries.length, 0);
	assert.equal(existing.runtime.getPlan()?.id, TEST_PLAN.id);

	const pending = setup();
	pending.runtime.setRequest({
		schemaVersion: 1,
		id: "pending",
		task: "Original request",
		createdAt: "2026-01-01T00:00:00.000Z",
	});
	await assert.rejects(
		pending.tool.execute(
			"pending",
			{ task: "Replacement" },
			undefined,
			undefined,
			pending.context,
		),
		/request is already pending/,
	);
	assert.equal(pending.entries.length, 0);
});
