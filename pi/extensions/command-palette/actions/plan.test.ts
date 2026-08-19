import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	PLAN_CONTROL_CHANGED_EVENT,
	PLAN_CONTROL_ENTRY,
	PLAN_REQUEST_CHANGED_EVENT,
	PLAN_REQUEST_ENTRY,
} from "../../plan-dashboard/state.ts";
import { TEST_PLAN } from "../../plan-dashboard/test-fixture.ts";
import { CommandPaletteRegistry } from "../registry.ts";
import { registerPlanActions } from "./plan.ts";

function entry(value: object): SessionEntry {
	return value as SessionEntry;
}

function planEntry(status?: "done" | "superseded"): SessionEntry {
	const plan = status
		? {
				...TEST_PLAN,
				steps: TEST_PLAN.steps.map((step) => ({ ...step, status })),
			}
		: TEST_PLAN;
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

function requestEntry(): SessionEntry {
	return entry({
		type: "custom",
		customType: PLAN_REQUEST_ENTRY,
		data: {
			schemaVersion: 1,
			id: "request-pending",
			task: "Pending Plan",
			createdAt: TEST_PLAN.createdAt,
		},
	});
}

function setupStart(branch: SessionEntry[]): {
	registry: CommandPaletteRegistry;
	entries: SessionEntry[];
	emitted: Array<{ name: string; data: unknown }>;
	messages: string[];
	notifications: string[];
	confirmations: Array<{ title: string; message: string }>;
	operations: string[];
	context(options?: {
		confirm?: boolean;
		editor?: string;
		idle?: boolean;
	}): ExtensionContext;
} {
	const entries = branch;
	const emitted: Array<{ name: string; data: unknown }> = [];
	const messages: string[] = [];
	const notifications: string[] = [];
	const confirmations: Array<{ title: string; message: string }> = [];
	const operations: string[] = [];
	const pi = {
		appendEntry: (customType: string, data: unknown) => {
			entries.push(entry({ type: "custom", customType, data }));
			operations.push(`entry:${customType}`);
		},
		sendUserMessage: (message: string) => {
			messages.push(message);
			operations.push(`message:${message}`);
		},
		events: {
			emit: (name: string, data: unknown) => {
				emitted.push({ name, data });
				operations.push(`event:${name}`);
			},
		},
	} as unknown as ExtensionAPI;
	const registry = new CommandPaletteRegistry();
	registerPlanActions(pi, registry);
	return {
		registry,
		entries,
		emitted,
		messages,
		notifications,
		confirmations,
		operations,
		context: (options = {}) => ({
			isIdle: () => options.idle ?? true,
			sessionManager: {
				getBranch: () => entries,
				getSessionId: () => "session-1",
				getLeafId: () => String(entries.length),
			},
			ui: {
				confirm: async (title: string, message: string) => {
					confirmations.push({ title, message });
					return options.confirm ?? false;
				},
				editor: async () => options.editor,
				notify: (message: string) => notifications.push(message),
			},
		}) as unknown as ExtensionContext,
	};
}

test("toggles and persists branch activity through the shared event", async () => {
	const branch = [planEntry()];
	const emitted: Array<{ name: string; data: unknown }> = [];
	const notifications: string[] = [];
	const pi = {
		appendEntry: (customType: string, data: unknown) => {
			branch.push(entry({ type: "custom", customType, data }));
		},
		events: {
			emit: (name: string, data: unknown) => emitted.push({ name, data }),
		},
	} as unknown as ExtensionAPI;
	const registry = new CommandPaletteRegistry();
	registerPlanActions(pi, registry);
	const toggle = registry.get("plan.toggle");
	assert.ok(toggle);
	const ctx = {
		isIdle: () => true,
		sessionManager: {
			getBranch: () => branch,
			getSessionId: () => "session-1",
			getLeafId: () => String(branch.length),
		},
		ui: { notify: (message: string) => notifications.push(message) },
	} as unknown as ExtensionContext;

	await toggle.run(ctx);
	const persisted = branch.at(-1) as {
		customType?: string;
		data?: { enabled?: boolean };
	};
	assert.equal(persisted.customType, PLAN_CONTROL_ENTRY);
	assert.equal(persisted.data?.enabled, false);
	assert.equal(emitted[0]?.name, PLAN_CONTROL_CHANGED_EVENT);
	assert.deepEqual(emitted[0]?.data, {
		sessionId: "session-1",
		branchLeafId: "2",
		control: persisted.data,
	});
	assert.equal(notifications.at(-1), "Living plan paused.");

	await toggle.run(ctx);
	assert.equal(
		((branch.at(-1) as { data?: { enabled?: boolean } }).data?.enabled),
		true,
	);
	assert.equal(emitted.length, 2);
	assert.equal(notifications.at(-1), "Living plan resumed.");
});

test("does not toggle while an agent turn is active", async () => {
	let appended = false;
	const notifications: string[] = [];
	const pi = {
		appendEntry: () => {
			appended = true;
		},
		events: { emit: () => {} },
	} as unknown as ExtensionAPI;
	const registry = new CommandPaletteRegistry();
	registerPlanActions(pi, registry);
	const toggle = registry.get("plan.toggle");
	assert.ok(toggle);
	const ctx = {
		isIdle: () => false,
		ui: { notify: (message: string) => notifications.push(message) },
	} as unknown as ExtensionContext;

	await toggle.run(ctx);
	assert.equal(appended, false);
	assert.match(notifications[0] ?? "", /Wait for the current agent turn/);
});

test("does not create controls on branches without a plan workflow", async () => {
	let appended = false;
	const notifications: string[] = [];
	const pi = {
		appendEntry: () => {
			appended = true;
		},
		events: { emit: () => {} },
	} as unknown as ExtensionAPI;
	const registry = new CommandPaletteRegistry();
	registerPlanActions(pi, registry);
	const toggle = registry.get("plan.toggle");
	assert.ok(toggle);
	const ctx = {
		isIdle: () => true,
		sessionManager: { getBranch: () => [] },
		ui: { notify: (message: string) => notifications.push(message) },
	} as unknown as ExtensionContext;

	await toggle.run(ctx);
	assert.equal(appended, false);
	assert.match(notifications[0] ?? "", /No living plan exists/);
});

test("starts the first Plan from the Palette editor", async () => {
	const state = setupStart([]);
	const start = state.registry.get("plan.start");
	assert.ok(start);
	await start.run(state.context({ editor: "  Plan passkey migration  " }));
	assert.equal(state.messages[0], "Plan passkey migration");
	const request = state.entries.find(
		(value) => (value as { customType?: string }).customType === PLAN_REQUEST_ENTRY,
	) as { data?: { task?: string } } | undefined;
	assert.equal(request?.data?.task, "Plan passkey migration");
	assert.equal(state.emitted.at(-1)?.name, PLAN_REQUEST_CHANGED_EVENT);
	assert.deepEqual(state.operations, [
		`entry:${PLAN_CONTROL_ENTRY}`,
		`event:${PLAN_CONTROL_CHANGED_EVENT}`,
		`entry:${PLAN_REQUEST_ENTRY}`,
		`event:${PLAN_REQUEST_CHANGED_EVENT}`,
		"message:Plan passkey migration",
	]);
});

test("confirms unfinished and pending work with accurate consequences", async () => {
	const unfinished = setupStart([planEntry()]);
	await unfinished.registry.get("plan.start")?.run(
		unfinished.context({ confirm: false, editor: "Replacement" }),
	);
	assert.equal(unfinished.entries.length, 1);
	assert.equal(unfinished.messages.length, 0);
	assert.deepEqual(unfinished.confirmations, [
		{
			title: "Start New Living Plan?",
			message: "The current Plan is unfinished. It will remain in Plan History, but no longer be current.",
		},
	]);

	const pending = setupStart([requestEntry()]);
	await pending.registry.get("plan.start")?.run(
		pending.context({ confirm: false, editor: "Replacement" }),
	);
	assert.equal(pending.entries.length, 1);
	assert.equal(pending.messages.length, 0);
	assert.deepEqual(pending.confirmations, [
		{
			title: "Start New Living Plan?",
			message: "A Living Plan request is still pending. Starting a new one will replace it before a Plan is created.",
		},
	]);

	const confirmed = setupStart([planEntry()]);
	await confirmed.registry.get("plan.start")?.run(
		confirmed.context({ confirm: true, editor: "Replacement" }),
	);
	assert.equal(confirmed.messages[0], "Replacement");
	assert.equal(
		(confirmed.entries.at(-1) as { customType?: string }).customType,
		PLAN_REQUEST_ENTRY,
	);

	for (const status of ["done", "superseded"] as const) {
		const state = setupStart([planEntry(status)]);
		let confirmCalls = 0;
		const ctx = state.context({ editor: "Next Plan" });
		ctx.ui.confirm = async () => {
			confirmCalls++;
			return false;
		};
		await state.registry.get("plan.start")?.run(ctx);
		assert.equal(confirmCalls, 0);
		assert.equal(state.messages[0], "Next Plan");
	}
});

test("does not start while busy or without a task", async () => {
	const busy = setupStart([]);
	await busy.registry.get("plan.start")?.run(
		busy.context({ idle: false, editor: "Blocked Plan" }),
	);
	assert.equal(busy.entries.length, 0);
	assert.equal(busy.messages.length, 0);
	assert.match(busy.notifications.at(-1) ?? "", /before starting/);

	const blank = setupStart([]);
	await blank.registry.get("plan.start")?.run(blank.context({ editor: "   " }));
	assert.equal(blank.entries.length, 0);
	assert.equal(blank.messages.length, 0);

	const cancelled = setupStart([]);
	await cancelled.registry.get("plan.start")?.run(cancelled.context());
	assert.equal(cancelled.entries.length, 0);
	assert.equal(cancelled.messages.length, 0);
});
