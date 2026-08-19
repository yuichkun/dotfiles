import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
	Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import statusFooterExtension from "./index.ts";

const theme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
} as unknown as Theme;

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("refreshes Git state after mutations and disposes branch/session resources", async () => {
	const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
	const statuses = ["M  staged.ts\n", "?? new.ts\n"];
	const signals: AbortSignal[] = [];
	const execCalls: Array<{ command: string; args: string[]; cwd: string }> = [];
	let execCount = 0;
	let thinking = "xhigh";
	const pi = {
		on(event: string, handler: (event: any, ctx: any) => unknown) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
		async exec(
			command: string,
			args: string[],
			options: { cwd: string; signal: AbortSignal },
		) {
			execCalls.push({ command, args, cwd: options.cwd });
			signals.push(options.signal);
			const stdout = statuses[Math.min(execCount, statuses.length - 1)]!;
			execCount++;
			return { stdout, stderr: "", code: 0, killed: false };
		},
		getThinkingLevel() {
			return thinking;
		},
	} as unknown as ExtensionAPI;
	statusFooterExtension(pi);

	let branchCallback: (() => void) | undefined;
	let unsubscribeCount = 0;
	const footerData = {
		getGitBranch: () => "master",
		getExtensionStatuses: () => new Map(),
		getAvailableProviderCount: () => 1,
		onBranchChange(callback: () => void) {
			branchCallback = callback;
			return () => unsubscribeCount++;
		},
	} satisfies ReadonlyFooterDataProvider;
	let renders = 0;
	const tui = { requestRender: () => renders++ } as unknown as TUI;
	let footer: (Component & { dispose?(): void }) | undefined;
	let contextPercent = 34;
	let modelId = "gpt-5.6-sol";
	const ctx = {
		cwd: "/workspace/project",
		get model() {
			return { id: modelId };
		},
		getContextUsage: () => ({ percent: contextPercent }),
		ui: {
			setFooter(factory: any) {
				footer = factory(tui, theme, footerData);
			},
		},
	} as unknown as ExtensionContext;

	for (const handler of handlers.get("session_start") ?? []) handler({}, ctx);
	await flush();
	assert.equal(execCount, 1);
	assert.deepEqual(execCalls[0], {
		command: "git",
		args: ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=normal"],
		cwd: "/workspace/project",
	});
	assert.match(footer!.render(200).join("\n"), /<warning>\[master\]<\/warning>/);
	assert.match(footer!.render(200).join("\n"), /gpt-5\.6-sol/);
	assert.match(footer!.render(200).join("\n"), /xhigh/);
	assert.match(footer!.render(200).join("\n"), /ctx 34%/);

	for (const handler of handlers.get("tool_execution_end") ?? []) {
		handler({ toolName: "read" }, ctx);
	}
	await flush();
	assert.equal(execCount, 1, "read must not run git status");

	for (const handler of handlers.get("tool_execution_end") ?? []) {
		handler({ toolName: "edit" }, ctx);
	}
	await flush();
	assert.equal(execCount, 2);
	assert.match(footer!.render(200).join("\n"), /<error>\[master\]<\/error>/);

	thinking = "high";
	contextPercent = 72;
	const beforeThinking = renders;
	for (const handler of handlers.get("thinking_level_select") ?? []) handler({}, ctx);
	assert.equal(renders, beforeThinking + 1);
	assert.match(footer!.render(200).join("\n"), /high/);
	assert.match(footer!.render(200).join("\n"), /<muted>ctx 72%<\/muted>/);

	modelId = "gpt-5.7";
	const beforeModel = renders;
	for (const handler of handlers.get("model_select") ?? []) handler({}, ctx);
	assert.equal(renders, beforeModel + 1);
	assert.match(footer!.render(200).join("\n"), /gpt-5\.7/);

	contextPercent = 73;
	const beforeMessage = renders;
	for (const handler of handlers.get("message_end") ?? []) {
		handler({ message: { role: "user" } }, ctx);
	}
	assert.equal(renders, beforeMessage);
	for (const handler of handlers.get("message_end") ?? []) {
		handler({ message: { role: "assistant" } }, ctx);
	}
	assert.equal(renders, beforeMessage + 1);
	assert.match(footer!.render(200).join("\n"), /<muted>ctx 73%<\/muted>/);

	branchCallback?.();
	await flush();
	assert.equal(execCount, 3);

	const firstFooter = footer!;
	const firstSignal = signals[0]!;
	for (const handler of handlers.get("session_start") ?? []) handler({}, ctx);
	await flush();
	assert.equal(execCount, 4);
	assert.equal(unsubscribeCount, 1, "reload must unsubscribe the previous runtime");
	assert.ok(firstSignal.aborted, "reload must abort the previous Git controller");
	firstFooter.dispose?.();
	assert.equal(unsubscribeCount, 1, "stale footer disposal must remain idempotent");

	for (const handler of handlers.get("session_shutdown") ?? []) handler({}, ctx);
	assert.equal(unsubscribeCount, 2);
	assert.ok(signals.at(-1)?.aborted);
	footer?.dispose?.();
	assert.equal(unsubscribeCount, 2, "dispose must be idempotent");
});
