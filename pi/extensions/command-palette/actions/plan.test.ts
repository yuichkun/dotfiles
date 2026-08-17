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
} from "../../plan-dashboard/state.ts";
import { TEST_PLAN } from "../../plan-dashboard/test-fixture.ts";
import { CommandPaletteRegistry } from "../registry.ts";
import { registerPlanActions } from "./plan.ts";

function entry(value: object): SessionEntry {
	return value as SessionEntry;
}

function planEntry(): SessionEntry {
	return entry({
		type: "message",
		message: {
			role: "toolResult",
			toolName: "plan",
			details: { kind: "plan", operation: "set", plan: TEST_PLAN },
			isError: false,
		},
	});
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
