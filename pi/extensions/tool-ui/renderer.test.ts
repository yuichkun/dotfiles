import assert from "node:assert/strict";
import test from "node:test";
import {
	initTheme,
	type Theme,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { attachCompactMetadata } from "./facts.ts";
import { withCompactRenderer } from "./renderer.ts";
import { ToolSummaryStore } from "./store.ts";
import { COMPACT_TOOL_UI_VERSION } from "./types.ts";

initTheme("dark", false);

const plainTheme = {
	fg: (_color: string, value: string) => value,
	bold: (value: string) => value,
	underline: (value: string) => value,
	getFgAnsi: (color: string) => color,
} as unknown as Theme;

const tokenTheme = {
	fg: (color: string, value: string) => `<${color}>${value}</${color}>`,
	bold: (value: string) => value,
	underline: (value: string) => value,
	getFgAnsi: (color: string) => color,
} as unknown as Theme;

const semantic = {
	running: "型定義を修正しています",
	success: "型定義を修正しました",
	failure: "型定義の修正に失敗しました",
};

function cleanLines(lines: string[]): string[] {
	return lines.map((line) => stripTerminalSequences(line).trimEnd());
}

function createDefinition(toolName = "edit"): ToolDefinition<any, any, any> {
	return {
		name: toolName,
		label: toolName,
		description: "test edit tool",
		parameters: {} as any,
		async execute() {
			return { content: [{ type: "text", text: "ok" }], details: {} };
		},
		renderCall() {
			return new Text("exact call\ncommand details", 0, 0);
		},
		renderResult() {
			return new Text("exact result", 0, 0);
		},
	};
}

function createContext(
	args: Record<string, unknown>,
	overrides: Record<string, unknown> = {},
): any {
	return {
		args,
		toolCallId: "call-1",
		invalidate() {},
		lastComponent: undefined,
		state: {},
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: false,
		showImages: true,
		isError: false,
		...overrides,
	};
}

test("renders pending calls without a collapsed duration", () => {
	const args = { path: "src/index.ts", edits: [] };
	const store = new ToolSummaryStore();
	store.ensure("call-1", "edit", args);
	store.setSemantic("call-1", semantic);
	store.start("call-1", "edit", args);
	const definition = withCompactRenderer(createDefinition(), store);
	const component = definition.renderCall!(
		args,
		plainTheme,
		createContext(args, { isPartial: true }),
	);
	const lines = cleanLines(component.render(80));
	assert.match(lines[0]!, /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Update\(src\/index\.ts\)$/);
	assert.ok(lines[1]!.startsWith("  ⎿ \u00a0"));
	store.clear();
});

test("renders a syntax-aware collapsed edit with context on both sides", () => {
	const args = { path: "src/index.ts", edits: [{ oldText: "old", newText: "new" }] };
	const store = new ToolSummaryStore();
	store.ensure("call-1", "edit", args);
	store.setSemantic("call-1", semantic);
	const definition = withCompactRenderer(createDefinition(), store);
	const result = {
		content: [{ type: "text" as const, text: "Successfully replaced 1 block" }],
		details: {
			diff: [
				"   ...",
				"  6 const before1 = true;",
				"  7 const before2 = true;",
				"  8 const before3 = true;",
				"  9 const before4 = true;",
				"-10 const value = 'old';",
				"+10 const value = 'new';",
				" 11 const after1 = true;",
				" 12 const after2 = true;",
				" 13 const after3 = true;",
				" 14 const after4 = true;",
				"   ...",
			].join("\n"),
		},
	};
	const component = definition.renderResult!(
		result,
		{ expanded: false, isPartial: false },
		plainTheme,
		createContext(args),
	);
	const rawLines = component.render(100);
	const lines = cleanLines(rawLines);
	assert.equal(lines[0], "⏺ Update(src/index.ts)");
	assert.equal(lines[1], "  ⎿ \u00a0型定義を修正しました");
	assert.ok(lines.slice(2).every((line) => line.startsWith("    ")));
	assert.ok(lines.some((line) => line.includes("-10 const value = 'old';")));
	assert.ok(lines.some((line) => line.includes("+10 const value = 'new';")));
	for (const name of ["after1", "after2", "after3", "after4"]) {
		assert.ok(lines.some((line) => line.includes(name)), `${name} must remain visible`);
	}
	assert.ok(rawLines.slice(2).some((line) => line.includes("\u001b[")));
	for (const line of rawLines) assert.ok(visibleWidth(line) <= 100);
});

test("restores edit counts with the full diff when expanded", () => {
	const args = { path: "src/index.ts", edits: [{ oldText: "old", newText: "new" }] };
	const store = new ToolSummaryStore();
	store.ensure("call-1", "edit", args);
	store.setSemantic("call-1", semantic);
	const definition = withCompactRenderer(createDefinition(), store);
	const component = definition.renderResult!(
		{
			content: [{ type: "text", text: "ok" }],
			details: { diff: "-1 old\n+1 new" },
		},
		{ expanded: true, isPartial: false },
		plainTheme,
		createContext(args, { expanded: true }),
	);
	const lines = cleanLines(component.render(100));
	assert.equal(lines[0], "⏺ Update(src/index.ts)");
	assert.equal(lines[1], "  ⎿ \u00a0Added 1 line, removed 1 line · 型定義を修正しました");
	assert.ok(lines.includes("    exact result"));
});

test("renders the source-derived Claude completed marker", () => {
	const args = { path: "src/index.ts" };
	const store = new ToolSummaryStore();
	store.ensure("call-1", "read", args);
	store.setSemantic("call-1", semantic);
	const definition = withCompactRenderer(createDefinition("read"), store);
	const component = definition.renderResult!(
		{ content: [{ type: "text", text: "ok" }], details: {} },
		{ expanded: false, isPartial: false },
		tokenTheme,
		createContext(args),
	);
	const rendered = component.render(100).join("\n");
	assert.match(rendered, /<success>⏺<\/success>/);
	assert.ok(!rendered.includes("<text>⏺</text>"));
});

test("keeps completed Bash outcome and summary without shell boilerplate", () => {
	const args = { command: "npm test" };
	const store = new ToolSummaryStore();
	store.ensure("call-1", "bash", args);
	store.setSemantic("call-1", semantic);
	const definition = withCompactRenderer(createDefinition("bash"), store);
	const result = { content: [{ type: "text" as const, text: "Exit code 1" }], details: {} };

	const success = definition.renderResult!(
		result,
		{ expanded: false, isPartial: false },
		plainTheme,
		createContext(args),
	);
	assert.deepEqual(cleanLines(success.render(100)), [
		"⏺ Bash(tests)",
		"  ⎿ \u00a0型定義を修正しました",
	]);

	const failure = definition.renderResult!(
		result,
		{ expanded: false, isPartial: false },
		plainTheme,
		createContext(args, { isError: true }),
	);
	assert.deepEqual(cleanLines(failure.render(100)), [
		"⏺ Bash(tests)",
		"  ⎿ \u00a0Error: Exit code 1 · 型定義の修正に失敗しました",
	]);
});

test("limits a collapsed write preview and shows the expansion hint", () => {
	const args = {
		path: "src/generated.ts",
		content: Array.from({ length: 10 }, (_, index) => `const value${index + 1} = ${index + 1};`).join("\n"),
	};
	const writeSemantic = {
		running: "生成ファイルを書き込んでいます",
		success: "生成ファイルを書き込みました",
		failure: "生成ファイルの書き込みに失敗しました",
	};
	const store = new ToolSummaryStore();
	store.ensure("call-1", "write", args);
	store.setSemantic("call-1", writeSemantic);
	const definition = withCompactRenderer(createDefinition("write"), store);
	const component = definition.renderResult!(
		{ content: [{ type: "text", text: "ok" }], details: {} },
		{ expanded: false, isPartial: false },
		plainTheme,
		createContext(args),
	);
	const lines = cleanLines(component.render(80));
	assert.equal(lines[0], "⏺ Write(src/generated.ts)");
	assert.equal(lines[1], "  ⎿ \u00a0生成ファイルを書き込みました");
	assert.ok(lines.some((line) => line.includes("const value1 = 1;")));
	assert.ok(lines.some((line) => line.includes("… 4 more lines")));
	assert.ok(lines.slice(2).every((line) => line.startsWith("    ")));
});

test("keeps exact call and result nested when expanded", () => {
	const args = { path: "src/index.ts" };
	const readSemantic = {
		running: "実装を確認しています",
		success: "実装を確認しました",
		failure: "実装の確認に失敗しました",
	};
	const store = new ToolSummaryStore();
	store.ensure("call-1", "read", args);
	store.setSemantic("call-1", readSemantic);
	const definition = withCompactRenderer(createDefinition("read"), store);
	const component = definition.renderResult!(
		{ content: [{ type: "text", text: "ok" }], details: {} },
		{ expanded: true, isPartial: false },
		plainTheme,
		createContext(args, { expanded: true }),
	);
	const lines = cleanLines(component.render(80));
	assert.equal(lines[0], "⏺ Read(src/index.ts)");
	assert.equal(lines[1], "  ⎿ \u00a0Read 1 line · 実装を確認しました");
	assert.ok(lines.includes("    exact call"));
	assert.ok(lines.includes("    command details"));
	assert.ok(lines.includes("    exact result"));
});

test("reuses the settled expanded tree across rerenders and Ctrl+O toggles", () => {
	const args = { path: "src/index.ts" };
	const result = {
		content: [{ type: "text" as const, text: "file content" }],
		details: {},
	};
	const readSemantic = {
		running: "実装を確認しています",
		success: "実装を確認しました",
		failure: "実装の確認に失敗しました",
	};
	const store = new ToolSummaryStore();
	store.ensure("call-1", "read", args);
	store.setSemantic("call-1", readSemantic);
	const original = createDefinition("read");
	let callRenderCount = 0;
	let resultRenderCount = 0;
	const originalRenderCall = original.renderCall!;
	const originalRenderResult = original.renderResult!;
	original.renderCall = (...parameters) => {
		callRenderCount++;
		return originalRenderCall(...parameters);
	};
	original.renderResult = (...parameters) => {
		resultRenderCount++;
		return originalRenderResult(...parameters);
	};
	const definition = withCompactRenderer(original, store);
	const context = createContext(args, { expanded: true });
	const first = definition.renderResult!(
		result,
		{ expanded: true, isPartial: false },
		plainTheme,
		context,
	);
	const second = definition.renderResult!(
		result,
		{ expanded: true, isPartial: false },
		plainTheme,
		context,
	);
	assert.strictEqual(second, first);
	assert.equal(callRenderCount, 1);
	assert.equal(resultRenderCount, 1);

	definition.renderResult!(
		result,
		{ expanded: false, isPartial: false },
		plainTheme,
		{ ...context, expanded: false },
	);
	const reopened = definition.renderResult!(
		result,
		{ expanded: true, isPartial: false },
		plainTheme,
		context,
	);
	assert.strictEqual(reopened, first);
	assert.equal(callRenderCount, 1);
	assert.equal(resultRenderCount, 1);
});

test("does not rerun the asynchronous edit call renderer for settled history", () => {
	const args = { path: "src/index.ts", edits: [] };
	const store = new ToolSummaryStore();
	store.ensure("call-1", "edit", args);
	store.setSemantic("call-1", semantic);
	const original = createDefinition();
	let callRenderCount = 0;
	const originalRenderCall = original.renderCall!;
	original.renderCall = (...parameters) => {
		callRenderCount++;
		return originalRenderCall(...parameters);
	};
	const definition = withCompactRenderer(original, store);
	const component = definition.renderResult!(
		{ content: [{ type: "text", text: "ok" }], details: {} },
		{ expanded: true, isPartial: false },
		plainTheme,
		createContext(args, { expanded: true }),
	);
	assert.equal(callRenderCount, 0);
	assert.ok(cleanLines(component.render(80)).includes("    exact result"));
});

test("renders error details on the branch without a mutation preview", () => {
	const args = { path: "src/index.ts", edits: [] };
	const store = new ToolSummaryStore();
	store.ensure("call-1", "edit", args);
	store.setSemantic("call-1", semantic);
	const definition = withCompactRenderer(createDefinition(), store);
	const component = definition.renderResult!(
		{ content: [{ type: "text", text: "Permission denied" }], details: {} },
		{ expanded: false, isPartial: false },
		plainTheme,
		createContext(args, { isError: true }),
	);
	const lines = cleanLines(component.render(80));
	assert.equal(lines[0], "⏺ Update(src/index.ts)");
	assert.equal(lines[1], "  ⎿ \u00a0Error: Permission denied · 型定義の修正に失敗しました");
	assert.equal(lines.length, 2);
});

test("renders persisted metadata without an in-memory summary", () => {
	const args = { path: "src/resumed.ts", edits: [] };
	const details = attachCompactMetadata(
		{},
		{
			version: COMPACT_TOOL_UI_VERSION,
			semantic,
			facts: ["edit", "src/resumed.ts", "+2 / -0", "0.4s"],
		},
	);
	const definition = withCompactRenderer(createDefinition(), new ToolSummaryStore());
	const component = definition.renderResult!(
		{ content: [{ type: "text", text: "ok" }], details },
		{ expanded: false, isPartial: false },
		plainTheme,
		createContext(args),
	);
	assert.deepEqual(cleanLines(component.render(100)), [
		"⏺ Update(src/resumed.ts)",
		"  ⎿ \u00a0型定義を修正しました",
	]);
});
