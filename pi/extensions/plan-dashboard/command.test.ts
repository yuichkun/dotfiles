import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { registerPlanCommand } from "./command.ts";
import {
	PLAN_CONTROL_ENTRY,
	PLAN_REQUEST_ENTRY,
	PlanRuntime,
} from "./state.ts";
import { TEST_PLAN } from "./test-fixture.ts";

interface RegisteredCommand {
	handler(args: string, ctx: ExtensionCommandContext): Promise<void>;
}

test("runs /plan as a one-shot request without mode state", async () => {
	const runtime = new PlanRuntime();
	let command: RegisteredCommand | undefined;
	const entries: Array<{ type: string; data: unknown }> = [];
	const messages: string[] = [];
	const pi = {
		registerCommand: (_name: string, options: RegisteredCommand) => {
			command = options;
		},
		appendEntry: (type: string, data: unknown) => entries.push({ type, data }),
		sendUserMessage: (message: string) => messages.push(message),
	} as unknown as ExtensionAPI;
	registerPlanCommand(pi, runtime);
	assert.ok(command);

	const ctx = {
		waitForIdle: async () => {},
		hasUI: true,
		ui: {
			editor: async () => undefined,
			notify: () => {},
		},
	} as unknown as ExtensionCommandContext;
	await command.handler(" Implement passkeys ", ctx);

	assert.equal(entries.length, 1);
	assert.equal(entries[0]?.type, PLAN_REQUEST_ENTRY);
	assert.equal(messages[0], "Implement passkeys");
	assert.equal(runtime.getPendingRequest()?.task, "Implement passkeys");
	assert.equal(runtime.getPlan(), undefined);
	assert.equal(runtime.isEnabled(), true);
});

test("reports an existing plan as information rather than a warning", async () => {
	const runtime = new PlanRuntime();
	runtime.applyPlan(TEST_PLAN);
	let command: RegisteredCommand | undefined;
	const notifications: Array<[string, string]> = [];
	const pi = {
		registerCommand: (_name: string, options: RegisteredCommand) => {
			command = options;
		},
	} as unknown as ExtensionAPI;
	registerPlanCommand(pi, runtime);
	assert.ok(command);

	const ctx = {
		ui: {
			notify: (message: string, severity: string) => {
				notifications.push([message, severity]);
			},
		},
	} as unknown as ExtensionCommandContext;
	await command.handler("", ctx);

	assert.deepEqual(notifications, [
		[
			"This Pi session branch already has a living plan. Use /plan off to pause it, /plan on to resume it, or /plan-dashboard to inspect it.",
			"info",
		],
	]);
});

test("pauses and resumes an existing plan without replacing it", async () => {
	const runtime = new PlanRuntime();
	runtime.applyPlan(TEST_PLAN);
	runtime.setEnabled(true);
	let command: RegisteredCommand | undefined;
	const entries: Array<{ type: string; data: unknown }> = [];
	const pi = {
		registerCommand: (_name: string, options: RegisteredCommand) => {
			command = options;
		},
		appendEntry: (type: string, data: unknown) => entries.push({ type, data }),
	} as unknown as ExtensionAPI;
	registerPlanCommand(pi, runtime);
	assert.ok(command);
	const ctx = {
		waitForIdle: async () => {},
		ui: { notify: () => {} },
	} as unknown as ExtensionCommandContext;

	await command.handler("on", ctx);
	assert.equal(entries.length, 0);
	await command.handler("OFF", ctx);
	assert.equal(runtime.isEnabled(), false);
	assert.equal(runtime.getPlan()?.id, TEST_PLAN.id);
	await command.handler("off", ctx);
	assert.equal(entries.length, 1);
	await command.handler("on", ctx);
	assert.equal(runtime.isEnabled(), true);
	assert.equal(entries.length, 2);
	assert.equal(entries[0]?.type, PLAN_CONTROL_ENTRY);
	assert.equal((entries[0]?.data as { enabled?: boolean }).enabled, false);
	assert.equal(entries[1]?.type, PLAN_CONTROL_ENTRY);
	assert.equal((entries[1]?.data as { enabled?: boolean }).enabled, true);
});

test("persists resume before replacing a paused pending request", async () => {
	const runtime = new PlanRuntime();
	runtime.setRequest({
		schemaVersion: 1,
		id: "pending-request",
		task: "Old task",
		createdAt: "2026-01-01T00:00:00.000Z",
	});
	runtime.setEnabled(false);
	let command: RegisteredCommand | undefined;
	const entries: Array<{ type: string; data: unknown }> = [];
	const pi = {
		registerCommand: (_name: string, options: RegisteredCommand) => {
			command = options;
		},
		appendEntry: (type: string, data: unknown) => entries.push({ type, data }),
		sendUserMessage: () => {},
	} as unknown as ExtensionAPI;
	registerPlanCommand(pi, runtime);
	assert.ok(command);
	const ctx = {
		waitForIdle: async () => {},
		hasUI: true,
		ui: { notify: () => {} },
	} as unknown as ExtensionCommandContext;

	await command.handler("Replacement task", ctx);
	assert.equal(entries[0]?.type, PLAN_CONTROL_ENTRY);
	assert.equal((entries[0]?.data as { enabled?: boolean }).enabled, true);
	assert.equal(entries[1]?.type, PLAN_REQUEST_ENTRY);
	assert.equal(runtime.isEnabled(), true);
	assert.equal(runtime.getPendingRequest()?.task, "Replacement task");
});

test("rejects on/off controls when no plan workflow exists", async () => {
	const runtime = new PlanRuntime();
	let command: RegisteredCommand | undefined;
	const notifications: string[] = [];
	const pi = {
		registerCommand: (_name: string, options: RegisteredCommand) => {
			command = options;
		},
	} as unknown as ExtensionAPI;
	registerPlanCommand(pi, runtime);
	assert.ok(command);
	const ctx = {
		ui: { notify: (message: string) => notifications.push(message) },
	} as unknown as ExtensionCommandContext;
	await command.handler("on", ctx);
	assert.match(notifications[0] ?? "", /No living plan exists/);
});
