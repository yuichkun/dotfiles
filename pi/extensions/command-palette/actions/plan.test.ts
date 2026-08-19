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

function controlEntry(enabled: boolean): SessionEntry {
	return entry({
		type: "custom",
		customType: PLAN_CONTROL_ENTRY,
		data: {
			schemaVersion: 1,
			id: `control-${enabled}`,
			enabled,
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
			mode: "json",
			hasUI: true,
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

async function availability(
	registry: CommandPaletteRegistry,
	ctx: ExtensionContext,
): Promise<Record<string, boolean>> {
	const result: Record<string, boolean> = {};
	for (const action of registry.list()) {
		result[action.id] = action.isAvailable
			? await action.isAvailable(ctx)
			: true;
	}
	return result;
}

test("shows only controls valid for the current Plan state", async () => {
	const empty = setupStart([]);
	assert.deepEqual(await availability(empty.registry, empty.context()), {
		"plan.start": true,
		"plan.current": false,
		"plan.history": false,
		"plan.pause": false,
		"plan.resume": false,
	});

	const pending = setupStart([requestEntry()]);
	assert.deepEqual(await availability(pending.registry, pending.context()), {
		"plan.start": true,
		"plan.current": false,
		"plan.history": false,
		"plan.pause": true,
		"plan.resume": false,
	});

	const pausedPending = setupStart([requestEntry(), controlEntry(false)]);
	assert.deepEqual(
		await availability(pausedPending.registry, pausedPending.context()),
		{
			"plan.start": true,
			"plan.current": false,
			"plan.history": false,
			"plan.pause": false,
			"plan.resume": true,
		},
	);

	const active = setupStart([planEntry()]);
	assert.deepEqual(await availability(active.registry, active.context()), {
		"plan.start": true,
		"plan.current": true,
		"plan.history": false,
		"plan.pause": true,
		"plan.resume": false,
	});

	const paused = setupStart([planEntry(), controlEntry(false)]);
	assert.deepEqual(await availability(paused.registry, paused.context()), {
		"plan.start": true,
		"plan.current": true,
		"plan.history": false,
		"plan.pause": false,
		"plan.resume": true,
	});
	const secondPlan = {
		...TEST_PLAN,
		id: "plan-second",
		requestId: "request-pending",
		request: "Pending Plan",
		title: "Second Plan",
	};
	const withHistory = setupStart([
		planEntry(),
		requestEntry(),
		entry({
			type: "message",
			message: {
				role: "toolResult",
				toolName: "plan",
				details: { kind: "plan", operation: "set", plan: secondPlan },
				isError: false,
			},
		}),
	]);
	assert.deepEqual(
		await availability(withHistory.registry, withHistory.context()),
		{
			"plan.start": true,
			"plan.current": true,
			"plan.history": true,
			"plan.pause": true,
			"plan.resume": false,
		},
	);
	const historyAction = withHistory.registry.get("plan.history");
	assert.ok(historyAction);
	let selectorTitle = "";
	const historyContext = withHistory.context();
	historyContext.ui.select = async (title: string) => {
		selectorTitle = title;
		return undefined;
	};
	await historyAction.run(historyContext);
	assert.equal(selectorTitle, "Open Plan History");

	assert.equal(paused.registry.get("plan.toggle"), undefined);
	assert.equal(paused.registry.get("plan.dashboard"), undefined);
});

test("pauses and resumes through separate state-specific actions", async () => {
	const state = setupStart([planEntry()]);
	const ctx = state.context();
	await state.registry.get("plan.pause")?.run(ctx);
	assert.equal(
		(state.entries.at(-1) as { customType?: string }).customType,
		PLAN_CONTROL_ENTRY,
	);
	assert.equal(
		((state.entries.at(-1) as { data?: { enabled?: boolean } }).data?.enabled),
		false,
	);
	assert.equal(state.emitted.at(-1)?.name, PLAN_CONTROL_CHANGED_EVENT);
	assert.deepEqual(state.emitted.at(-1)?.data, {
		sessionId: "session-1",
		branchLeafId: "2",
		control: (state.entries.at(-1) as { data?: unknown }).data,
	});
	assert.equal(state.notifications.at(-1), "Living plan paused.");

	await state.registry.get("plan.resume")?.run(ctx);
	assert.equal(
		((state.entries.at(-1) as { data?: { enabled?: boolean } }).data?.enabled),
		true,
	);
	assert.equal(state.emitted.at(-1)?.name, PLAN_CONTROL_CHANGED_EVENT);
	assert.deepEqual(state.emitted.at(-1)?.data, {
		sessionId: "session-1",
		branchLeafId: "3",
		control: (state.entries.at(-1) as { data?: unknown }).data,
	});
	assert.equal(state.notifications.at(-1), "Living plan resumed.");
});

test("guards direct control mutations and opens the current Dashboard", async () => {
	const busy = setupStart([planEntry()]);
	await busy.registry.get("plan.pause")?.run(busy.context({ idle: false }));
	assert.equal(busy.entries.length, 1);
	assert.match(busy.notifications.at(-1) ?? "", /before pausing/);

	const busyResume = setupStart([planEntry(), controlEntry(false)]);
	await busyResume.registry.get("plan.resume")?.run(
		busyResume.context({ idle: false }),
	);
	assert.equal(busyResume.entries.length, 2);
	assert.match(busyResume.notifications.at(-1) ?? "", /before resuming/);

	const empty = setupStart([]);
	await empty.registry.get("plan.pause")?.run(empty.context());
	assert.equal(empty.entries.length, 0);
	assert.match(empty.notifications.at(-1) ?? "", /No Living Plan exists/);

	const alreadyPaused = setupStart([planEntry(), controlEntry(false)]);
	await alreadyPaused.registry.get("plan.pause")?.run(alreadyPaused.context());
	assert.equal(alreadyPaused.entries.length, 2);
	assert.equal(
		alreadyPaused.notifications.at(-1),
		"Living plan is already paused.",
	);

	const alreadyActive = setupStart([planEntry()]);
	await alreadyActive.registry.get("plan.resume")?.run(alreadyActive.context());
	assert.equal(alreadyActive.entries.length, 1);
	assert.equal(
		alreadyActive.notifications.at(-1),
		"Living plan is already active.",
	);

	const current = setupStart([planEntry()]);
	await current.registry.get("plan.current")?.run(current.context());
	assert.equal(
		current.notifications.at(-1),
		"Plan Dashboard is only available in TUI mode",
	);
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
