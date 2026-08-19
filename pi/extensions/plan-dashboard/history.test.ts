import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { openPlanHistory } from "./history.ts";
import { PLAN_REQUEST_ENTRY, PlanRuntime } from "./state.ts";
import { TEST_PLAN } from "./test-fixture.ts";

function entry(value: object): SessionEntry {
	return value as SessionEntry;
}

function requestEntry(id: string, task: string): SessionEntry {
	return entry({
		type: "custom",
		customType: PLAN_REQUEST_ENTRY,
		data: {
			schemaVersion: 1,
			id,
			task,
			createdAt: TEST_PLAN.createdAt,
		},
	});
}

function planEntry(
	id: string,
	title: string,
	requestId: string,
	status?: "done" | "superseded",
): SessionEntry {
	const plan = {
		...TEST_PLAN,
		id,
		title,
		requestId,
		request: title,
		steps: status
			? TEST_PLAN.steps.map((step) => ({ ...step, status }))
			: TEST_PLAN.steps,
	};
	return entry({
		type: "message",
		message: {
			role: "toolResult",
			toolName: "plan",
			details: { kind: "plan", operation: "set", plan },
			isError: false,
		},
	});
}

test("selects earlier branch Plans without mutating the current branch", async () => {
	const branch = [
		requestEntry("request-first", "First Plan"),
		planEntry("plan-first", "First Plan", "request-first", "done"),
		requestEntry("request-second", "Second Plan"),
		planEntry("plan-second", "Second Plan", "request-second", "superseded"),
		requestEntry("request-current", "Current Plan"),
		planEntry("plan-current", "Current Plan", "request-current"),
	];
	let choices: readonly string[] = [];
	let output = "";
	const notifications: Array<[string, string]> = [];
	const ctx = {
		mode: "tui",
		sessionManager: { getBranch: () => branch },
		ui: {
			select: async (_title: string, options: readonly string[]) => {
				choices = options;
				return options[1];
			},
			custom: async (factory: Function) => {
				const component = factory(
					{
						terminal: { rows: 30, columns: 120 },
						requestRender: () => {},
					},
					{
						fg: (_color: string, text: string) => text,
						bg: (_color: string, text: string) => text,
						bold: (text: string) => text,
						inverse: (text: string) => text,
					},
					{ matches: () => false },
					() => {},
				);
				output = component.render(120).join("\n");
				return undefined;
			},
			notify: (message: string, severity: string) => {
				notifications.push([message, severity]);
			},
		},
	} as unknown as ExtensionContext;

	await openPlanHistory(ctx);

	assert.equal(choices.length, 2);
	assert.match(choices[0] ?? "", /^1\. Second Plan · r4 · unfinished/);
	assert.match(choices[1] ?? "", /^2\. First Plan · r4 · complete/);
	assert.match(output, /Plan Dashboard · HISTORY · First Plan/);
	assert.doesNotMatch(output, /Second Plan/);
	assert.deepEqual(notifications, []);
	assert.equal(branch.length, 6);
	const restored = new PlanRuntime();
	restored.restore(branch);
	assert.equal(restored.getPlan()?.id, "plan-current");
	assert.deepEqual(restored.getPlanHistory().map((plan) => plan.id), [
		"plan-second",
		"plan-first",
	]);
});

test("leaves the branch untouched when History selection is cancelled", async () => {
	const branch = [
		requestEntry("request-first", "First Plan"),
		planEntry("plan-first", "First Plan", "request-first"),
		requestEntry("request-current", "Current Plan"),
		planEntry("plan-current", "Current Plan", "request-current"),
	];
	let customCalled = false;
	const ctx = {
		sessionManager: { getBranch: () => branch },
		ui: {
			select: async () => undefined,
			custom: async () => {
				customCalled = true;
			},
			notify: () => {},
		},
	} as unknown as ExtensionContext;

	await openPlanHistory(ctx);

	assert.equal(customCalled, false);
	assert.equal(branch.length, 4);
});

test("reports an empty Plan history", async () => {
	const notifications: Array<[string, string]> = [];
	const branch = [
		requestEntry("only-request", "Only Plan"),
		planEntry("only", "Only Plan", "only-request"),
	];
	const ctx = {
		sessionManager: { getBranch: () => branch },
		ui: {
			notify: (message: string, severity: string) => {
				notifications.push([message, severity]);
			},
		},
	} as unknown as ExtensionContext;
	await openPlanHistory(ctx);
	assert.deepEqual(notifications, [
		["No previous Living Plans exist on this branch", "info"],
	]);
});
