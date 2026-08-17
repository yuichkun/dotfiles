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

function controlEntry(enabled: boolean): SessionEntry {
	return entry({
		type: "custom",
		customType: "living-plan.control",
		data: {
			schemaVersion: 1,
			id: `control-${enabled}`,
			enabled,
			createdAt: TEST_PLAN.createdAt,
		},
	});
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

test("removes plan metadata and context while a branch is paused", async () => {
	const handlers = new Map<
		string,
		(event: unknown, ctx: ExtensionContext) => Promise<unknown>
	>();
	let activeTools = ["read", "edit", "plan"];
	let planCommand: RegisteredCommand | undefined;
	const branch = planBranch();
	const pi = {
		registerCommand: (name: string, command: RegisteredCommand) => {
			if (name === "plan") planCommand = command;
		},
		registerTool: () => {},
		on: (
			name: string,
			handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>,
		) => handlers.set(name, handler),
		appendEntry: (customType: string, data: unknown) => {
			branch.push(entry({ type: "custom", customType, data }));
		},
		getActiveTools: () => activeTools,
		setActiveTools: (names: string[]) => {
			activeTools = names;
		},
	} as unknown as ExtensionAPI;
	planDashboardExtension(pi);
	assert.ok(planCommand);
	const ctx = {
		mode: "json",
		waitForIdle: async () => {},
		sessionManager: { getBranch: () => branch },
		ui: { notify: () => {} },
	} as unknown as ExtensionContext & ExtensionCommandContext;
	const contextEvent = { messages: [] };
	await handlers.get("session_start")?.({}, ctx);
	assert.deepEqual(activeTools, ["read", "edit", "plan"]);
	const injected = await handlers.get("context")?.(contextEvent, ctx) as {
		messages?: unknown[];
	} | undefined;
	assert.equal(injected?.messages?.length, 1);

	await planCommand.handler("off", ctx);
	assert.deepEqual(activeTools, ["read", "edit"]);
	assert.equal(await handlers.get("context")?.(contextEvent, ctx), undefined);
	await handlers.get("session_tree")?.({}, ctx);
	assert.deepEqual(activeTools, ["read", "edit"]);

	await planCommand.handler("on", ctx);
	assert.deepEqual(activeTools, ["read", "edit", "plan"]);
	await handlers.get("session_shutdown")?.({}, ctx);
});

test("hides and restores the fixed header with branch pause state", async () => {
	const handlers = new Map<
		string,
		(event: unknown, ctx: ExtensionContext) => Promise<unknown>
	>();
	const hidden: boolean[] = [];
	let activeTools = ["read", "plan"];
	const handle = {
		setHidden: (value: boolean) => hidden.push(value),
		hide: () => {},
	};
	const pi = {
		registerCommand: () => {},
		registerTool: () => {},
		on: (
			name: string,
			handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>,
		) => handlers.set(name, handler),
		getActiveTools: () => activeTools,
		setActiveTools: (names: string[]) => {
			activeTools = names;
		},
	} as unknown as ExtensionAPI;
	planDashboardExtension(pi);
	const branch = planBranch();
	const ctx = {
		mode: "tui",
		sessionManager: { getBranch: () => branch },
		ui: {
			notify: () => {},
			custom: (
				factory: Function,
				options: { onHandle?: (value: typeof handle) => void },
			) => {
				factory(
					{ requestRender: () => {} },
					{
						fg: (_color: string, text: string) => text,
						bold: (text: string) => text,
					},
				);
				options.onHandle?.(handle);
				return new Promise<void>(() => {});
			},
		},
	} as unknown as ExtensionContext;
	await handlers.get("session_start")?.({}, ctx);
	assert.equal(hidden.at(-1), false);

	branch.push(controlEntry(false));
	await handlers.get("session_tree")?.({}, ctx);
	assert.equal(hidden.at(-1), true);
	branch.push(controlEntry(true));
	await handlers.get("session_tree")?.({}, ctx);
	assert.equal(hidden.at(-1), false);
	await handlers.get("session_shutdown")?.({}, ctx);
});
