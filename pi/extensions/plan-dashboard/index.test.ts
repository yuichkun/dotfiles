import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import planDashboardExtension from "./index.ts";
import { TEST_PLAN } from "./test-fixture.ts";

interface RegisteredCommand {
	handler(args: string, ctx: ExtensionCommandContext): Promise<void>;
}

function entry(value: object): SessionEntry {
	return value as SessionEntry;
}

function planBranch(): SessionEntry[] {
	return [
		entry({
			type: "message",
			message: {
				role: "toolResult",
				toolName: "plan",
				details: { kind: "plan", operation: "set", plan: TEST_PLAN },
				isError: false,
			},
		}),
	];
}

test("activates plan metadata only for plan workflow branches", async () => {
	const handlers = new Map<
		string,
		(event: unknown, ctx: ExtensionContext) => Promise<unknown>
	>();
	let planCommand: RegisteredCommand | undefined;
	let activeTools = ["read", "edit", "plan"];
	const toolsAtDispatch: string[][] = [];
	const pi = {
		registerCommand: (name: string, command: RegisteredCommand) => {
			if (name === "plan") planCommand = command;
		},
		registerTool: () => {},
		on: (
			name: string,
			handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>,
		) => handlers.set(name, handler),
		appendEntry: () => {},
		sendUserMessage: () => toolsAtDispatch.push([...activeTools]),
		getActiveTools: () => activeTools,
		setActiveTools: (names: string[]) => {
			activeTools = names;
		},
	} as unknown as ExtensionAPI;
	planDashboardExtension(pi);
	assert.ok(planCommand);

	let branch: SessionEntry[] = [];
	const ctx = {
		mode: "json",
		hasUI: true,
		waitForIdle: async () => {},
		sessionManager: { getBranch: () => branch },
		ui: { notify: () => {} },
	} as unknown as ExtensionContext & ExtensionCommandContext;
	await handlers.get("session_start")?.({}, ctx);
	assert.deepEqual(activeTools, ["read", "edit"]);

	branch = planBranch();
	await handlers.get("session_tree")?.({}, ctx);
	assert.deepEqual(activeTools, ["read", "edit", "plan"]);

	branch = [];
	await handlers.get("session_tree")?.({}, ctx);
	assert.deepEqual(activeTools, ["read", "edit"]);
	await planCommand.handler("Implement passkeys", ctx);
	assert.deepEqual(toolsAtDispatch, [["read", "edit", "plan"]]);
	assert.deepEqual(activeTools, ["read", "edit", "plan"]);
	await handlers.get("session_shutdown")?.({}, ctx);
});
