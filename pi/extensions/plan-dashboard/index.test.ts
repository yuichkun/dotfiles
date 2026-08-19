import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { registerPlanActions } from "../command-palette/actions/plan.ts";
import { CommandPaletteRegistry } from "../command-palette/registry.ts";
import { PLAN_BOOTSTRAP_TOOL_NAME } from "./bootstrap.ts";
import planDashboardExtension from "./index.ts";
import {
	PLAN_CONTROL_CHANGED_EVENT,
	PLAN_REQUEST_CHANGED_EVENT,
	PLAN_REQUEST_ENTRY,
} from "./state.ts";
import { TEST_PLAN } from "./test-fixture.ts";

interface RegisteredTool {
	name: string;
	execute(
		toolCallId: string,
		params: { task: string },
		signal: AbortSignal | undefined,
		onUpdate: undefined,
		ctx: ExtensionContext,
	): Promise<unknown>;
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

test("registers no Plan slash commands and activates full metadata only for workflows", async () => {
	const handlers = new Map<
		string,
		(event: unknown, ctx: ExtensionContext) => Promise<unknown>
	>();
	const commands: string[] = [];
	let activeTools = ["read", "edit", "plan", PLAN_BOOTSTRAP_TOOL_NAME];
	const pi = {
		registerCommand: (name: string) => commands.push(name),
		registerTool: () => {},
		on: (
			name: string,
			handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>,
		) => handlers.set(name, handler),
		events: { on: () => {} },
		getActiveTools: () => activeTools,
		setActiveTools: (names: string[]) => {
			activeTools = names;
		},
	} as unknown as ExtensionAPI;
	planDashboardExtension(pi);
	assert.deepEqual(commands, []);

	let branch: SessionEntry[] = [];
	const ctx = {
		mode: "json",
		sessionManager: { getBranch: () => branch },
		ui: { notify: () => {} },
	} as unknown as ExtensionContext;
	await handlers.get("session_start")?.({}, ctx);
	assert.deepEqual(activeTools, ["read", "edit", PLAN_BOOTSTRAP_TOOL_NAME]);

	branch = planBranch();
	await handlers.get("session_tree")?.({}, ctx);
	assert.deepEqual(activeTools, [
		"read",
		"edit",
		PLAN_BOOTSTRAP_TOOL_NAME,
		"plan",
	]);

	branch = [];
	await handlers.get("session_tree")?.({}, ctx);
	assert.deepEqual(activeTools, ["read", "edit", PLAN_BOOTSTRAP_TOOL_NAME]);
	await handlers.get("session_shutdown")?.({}, ctx);
});

test("activates the full plan workflow after the Agent bootstrap", async () => {
	const handlers = new Map<
		string,
		(event: unknown, ctx: ExtensionContext) => Promise<unknown>
	>();
	const eventHandlers = new Map<string, Array<(data: unknown) => void>>();
	const tools = new Map<string, RegisteredTool>();
	const branch: SessionEntry[] = [];
	let activeTools = ["read", "plan", PLAN_BOOTSTRAP_TOOL_NAME];
	const pi = {
		registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool),
		on: (
			name: string,
			handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>,
		) => handlers.set(name, handler),
		events: {
			on: (name: string, handler: (data: unknown) => void) => {
				const listeners = eventHandlers.get(name) ?? [];
				listeners.push(handler);
				eventHandlers.set(name, listeners);
			},
			emit: (name: string, data: unknown) => {
				for (const handler of eventHandlers.get(name) ?? []) handler(data);
			},
		},
		appendEntry: (customType: string, data: unknown) => {
			branch.push(entry({ type: "custom", customType, data }));
		},
		getActiveTools: () => activeTools,
		setActiveTools: (names: string[]) => {
			activeTools = names;
		},
	} as unknown as ExtensionAPI;
	planDashboardExtension(pi);
	const ctx = {
		mode: "json",
		sessionManager: {
			getBranch: () => branch,
			getSessionId: () => "session-bootstrap",
			getLeafId: () => String(branch.length),
		},
		ui: { notify: () => {} },
	} as unknown as ExtensionContext;
	await handlers.get("session_start")?.({}, ctx);
	assert.deepEqual(activeTools, ["read", PLAN_BOOTSTRAP_TOOL_NAME]);

	const bootstrap = tools.get(PLAN_BOOTSTRAP_TOOL_NAME);
	assert.ok(bootstrap);
	await bootstrap.execute(
		"bootstrap",
		{ task: "Plan a passkey migration" },
		undefined,
		undefined,
		ctx,
	);
	assert.deepEqual(activeTools, ["read", PLAN_BOOTSTRAP_TOOL_NAME, "plan"]);
	assert.equal(branch[0]?.type, "custom");

	const injected = await handlers.get("context")?.({ messages: [] }, ctx) as {
		messages?: Array<{ content?: string }>;
	} | undefined;
	assert.match(injected?.messages?.[0]?.content ?? "", /Plan a passkey migration/);
	await handlers.get("session_shutdown")?.({}, ctx);
});

test("removes full plan metadata and context while a branch is paused", async () => {
	const handlers = new Map<
		string,
		(event: unknown, ctx: ExtensionContext) => Promise<unknown>
	>();
	let activeTools = ["read", "edit", PLAN_BOOTSTRAP_TOOL_NAME, "plan"];
	const branch = planBranch();
	const pi = {
		registerTool: () => {},
		on: (
			name: string,
			handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>,
		) => handlers.set(name, handler),
		events: { on: () => {} },
		getActiveTools: () => activeTools,
		setActiveTools: (names: string[]) => {
			activeTools = names;
		},
	} as unknown as ExtensionAPI;
	planDashboardExtension(pi);
	const ctx = {
		mode: "json",
		sessionManager: { getBranch: () => branch },
		ui: { notify: () => {} },
	} as unknown as ExtensionContext;
	const contextEvent = { messages: [] };
	await handlers.get("session_start")?.({}, ctx);
	assert.equal(
		((await handlers.get("context")?.(contextEvent, ctx)) as {
			messages?: unknown[];
		} | undefined)?.messages?.length,
		1,
	);

	branch.push(controlEntry(false));
	await handlers.get("session_tree")?.({}, ctx);
	assert.deepEqual(activeTools, ["read", "edit", PLAN_BOOTSTRAP_TOOL_NAME]);
	assert.equal(await handlers.get("context")?.(contextEvent, ctx), undefined);

	branch.push(controlEntry(true));
	await handlers.get("session_tree")?.({}, ctx);
	assert.deepEqual(activeTools, [
		"read",
		"edit",
		PLAN_BOOTSTRAP_TOOL_NAME,
		"plan",
	]);
	await handlers.get("session_shutdown")?.({}, ctx);
});

test("hides and restores the fixed header with branch pause state", async () => {
	const handlers = new Map<
		string,
		(event: unknown, ctx: ExtensionContext) => Promise<unknown>
	>();
	const hidden: boolean[] = [];
	let activeTools = ["read", PLAN_BOOTSTRAP_TOOL_NAME, "plan"];
	const handle = {
		setHidden: (value: boolean) => hidden.push(value),
		hide: () => {},
	};
	const pi = {
		registerTool: () => {},
		on: (
			name: string,
			handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>,
		) => handlers.set(name, handler),
		events: { on: () => {} },
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

test("applies Palette request and activity events to the active plan extension", async () => {
	const lifecycle = new Map<
		string,
		(event: unknown, ctx: ExtensionContext) => Promise<unknown>
	>();
	const eventHandlers = new Map<string, Array<(data: unknown) => void>>();
	const branch = planBranch();
	let activeTools = ["read", PLAN_BOOTSTRAP_TOOL_NAME, "plan"];
	const pi = {
		registerTool: () => {},
		on: (
			name: string,
			handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>,
		) => lifecycle.set(name, handler),
		events: {
			on: (name: string, handler: (data: unknown) => void) => {
				const listeners = eventHandlers.get(name) ?? [];
				listeners.push(handler);
				eventHandlers.set(name, listeners);
			},
			emit: (name: string, data: unknown) => {
				for (const handler of eventHandlers.get(name) ?? []) handler(data);
			},
		},
		appendEntry: (customType: string, data: unknown) => {
			branch.push(entry({ type: "custom", customType, data }));
		},
		sendUserMessage: () => {},
		getActiveTools: () => activeTools,
		setActiveTools: (names: string[]) => {
			activeTools = names;
		},
	} as unknown as ExtensionAPI;
	planDashboardExtension(pi);
	const ctx = {
		mode: "json",
		isIdle: () => true,
		sessionManager: {
			getBranch: () => branch,
			getSessionId: () => "session-shared",
			getLeafId: () => String(branch.length),
		},
		ui: {
			notify: () => {},
			confirm: async () => true,
			editor: async () => "Replacement Plan",
		},
	} as unknown as ExtensionContext;
	await lifecycle.get("session_start")?.({}, ctx);
	assert.deepEqual(activeTools, ["read", PLAN_BOOTSTRAP_TOOL_NAME, "plan"]);
	pi.events.emit(PLAN_CONTROL_CHANGED_EVENT, {
		sessionId: "session-shared",
		branchLeafId: "another-branch",
		control: {
			schemaVersion: 1,
			id: "other-control",
			enabled: false,
			createdAt: TEST_PLAN.createdAt,
		},
	});
	assert.deepEqual(activeTools, ["read", PLAN_BOOTSTRAP_TOOL_NAME, "plan"]);
	const contextBeforeForeign = await lifecycle.get("context")?.(
		{ messages: [] },
		ctx,
	) as { messages?: Array<{ content?: string }> } | undefined;
	const foreignRequest = {
		schemaVersion: 1,
		id: "request-foreign",
		task: "Foreign Plan",
		createdAt: TEST_PLAN.createdAt,
	};
	pi.events.emit(PLAN_REQUEST_CHANGED_EVENT, {
		sessionId: "another-session",
		branchLeafId: ctx.sessionManager.getLeafId(),
		request: foreignRequest,
	});
	pi.events.emit(PLAN_REQUEST_CHANGED_EVENT, {
		sessionId: "session-shared",
		branchLeafId: "another-branch",
		request: foreignRequest,
	});
	const contextAfterForeign = await lifecycle.get("context")?.(
		{ messages: [] },
		ctx,
	) as { messages?: Array<{ content?: string }> } | undefined;
	assert.equal(
		contextAfterForeign?.messages?.[0]?.content,
		contextBeforeForeign?.messages?.[0]?.content,
	);

	const registry = new CommandPaletteRegistry();
	registerPlanActions(pi, registry);
	await registry.get("plan.pause")?.run(ctx);
	assert.deepEqual(activeTools, ["read", PLAN_BOOTSTRAP_TOOL_NAME]);
	await registry.get("plan.resume")?.run(ctx);
	assert.deepEqual(activeTools, ["read", PLAN_BOOTSTRAP_TOOL_NAME, "plan"]);
	await registry.get("plan.start")?.run(ctx);
	assert.deepEqual(activeTools, ["read", PLAN_BOOTSTRAP_TOOL_NAME, "plan"]);
	assert.equal(
		(branch.at(-1) as { customType?: string }).customType,
		PLAN_REQUEST_ENTRY,
	);
	const injected = await lifecycle.get("context")?.({ messages: [] }, ctx) as {
		messages?: Array<{ content?: string }>;
	} | undefined;
	assert.match(injected?.messages?.[0]?.content ?? "", /Replacement Plan/);
	await lifecycle.get("session_shutdown")?.({}, ctx);
});
