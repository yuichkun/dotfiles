import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	listAvailablePaletteActions,
	runPaletteAction,
} from "./palette.ts";
import { CommandPaletteRegistry } from "./registry.ts";

function createContext(): {
	context: ExtensionContext;
	notifications: Array<{ message: string; level: string }>;
} {
	const notifications: Array<{ message: string; level: string }> = [];
	const context = {
		ui: {
			notify(message: string, level: string) {
				notifications.push({ message, level });
			},
		},
	} as unknown as ExtensionContext;
	return { context, notifications };
}

test("filters Palette actions by the current context", async () => {
	const registry = new CommandPaletteRegistry();
	const context = {} as ExtensionContext;
	let receivedContext: ExtensionContext | undefined;
	registry.register({
		id: "always",
		title: "Always",
		run: () => {},
	});
	registry.register({
		id: "available",
		title: "Available",
		isAvailable: async (received) => {
			receivedContext = received;
			return true;
		},
		run: () => {},
	});
	registry.register({
		id: "hidden",
		title: "Hidden",
		isAvailable: () => false,
		run: () => {},
	});

	assert.deepEqual(
		(await listAvailablePaletteActions(context, registry)).map(
			(action) => action.id,
		),
		["always", "available"],
	);
	assert.equal(receivedContext, context);
});

test("propagates an availability error while listing", async () => {
	const registry = new CommandPaletteRegistry();
	registry.register({
		id: "broken",
		title: "Broken",
		isAvailable: () => {
			throw new Error("listing failed");
		},
		run: () => {},
	});

	await assert.rejects(
		listAvailablePaletteActions({} as ExtensionContext, registry),
		/listing failed/,
	);
});

test("does not run an action that became unavailable after listing", async () => {
	const registry = new CommandPaletteRegistry();
	const { context, notifications } = createContext();
	let available = true;
	let availabilityChecks = 0;
	let runCount = 0;
	registry.register({
		id: "mutable",
		title: "Mutable",
		isAvailable: () => {
			availabilityChecks++;
			return available;
		},
		run: () => {
			runCount++;
		},
	});

	assert.deepEqual(
		(await listAvailablePaletteActions(context, registry)).map(
			(action) => action.id,
		),
		["mutable"],
	);
	available = false;
	await runPaletteAction(context, registry, "mutable");

	assert.equal(availabilityChecks, 2);
	assert.equal(runCount, 0);
	assert.deepEqual(notifications, [
		{ message: "Mutable is no longer available", level: "info" },
	]);
});

test("reports an availability error before execution without running", async () => {
	const registry = new CommandPaletteRegistry();
	const { context, notifications } = createContext();
	let runCount = 0;
	registry.register({
		id: "broken",
		title: "Broken",
		isAvailable: () => {
			throw new Error("recheck failed");
		},
		run: () => {
			runCount++;
		},
	});

	await runPaletteAction(context, registry, "broken");

	assert.equal(runCount, 0);
	assert.deepEqual(notifications, [
		{
			message: "Broken availability check failed: recheck failed",
			level: "error",
		},
	]);
});

test("runs an action that remains available", async () => {
	const registry = new CommandPaletteRegistry();
	const { context, notifications } = createContext();
	let runContext: ExtensionContext | undefined;
	registry.register({
		id: "available",
		title: "Available",
		isAvailable: () => true,
		run: (received) => {
			runContext = received;
		},
	});

	await runPaletteAction(context, registry, "available");

	assert.equal(runContext, context);
	assert.deepEqual(notifications, []);
});

test("reports an action body error distinctly", async () => {
	const registry = new CommandPaletteRegistry();
	const { context, notifications } = createContext();
	registry.register({
		id: "broken",
		title: "Broken",
		run: () => {
			throw new Error("boom");
		},
	});

	await runPaletteAction(context, registry, "broken");

	assert.deepEqual(notifications, [
		{ message: "Broken failed: boom", level: "error" },
	]);
});

test("reports an unknown selected action", async () => {
	const registry = new CommandPaletteRegistry();
	const { context, notifications } = createContext();

	await runPaletteAction(context, registry, "missing");

	assert.deepEqual(notifications, [
		{ message: "Unknown palette action: missing", level: "error" },
	]);
});
