import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { registerPlanCommand } from "./command.ts";
import { PLAN_REQUEST_ENTRY, PlanRuntime } from "./state.ts";
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
			"This session branch already has a living plan. Use /plan-dashboard to inspect it.",
			"info",
		],
	]);
});
