import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { ToolHeaderComponent } from "./tool-header.ts";

const plainTheme = {
	fg: (_color: string, value: string) => value,
	bold: (value: string) => value,
	underline: (value: string) => value,
} as unknown as Theme;

test("renders a Claude-style anchor and indented branch", () => {
	const component = new ToolHeaderComponent({
		toolName: "edit",
		args: { path: "src/index.ts" },
		status: "success",
		marker: "●",
		markerColor: "success",
		semanticSummary: "型定義を修正しました",
		facts: ["edit", "src/index.ts", "+1 / -3", "0.3s"],
		theme: plainTheme,
	});

	assert.deepEqual(component.render(100), [
		"● Update(src/index.ts)",
		"  └ Added 1 line, removed 3 lines · 0.3s · 型定義を修正しました",
	]);
});

test("wraps branch continuations at the content column", () => {
	const component = new ToolHeaderComponent({
		toolName: "read",
		args: { path: "src/very-long-directory/implementation.ts" },
		status: "running",
		marker: "⠼",
		markerColor: "accent",
		semanticSummary: "Tool rendererのsignatureを一括更新するため、現在の実装を詳しく確認しています",
		facts: ["read", "src/very-long-directory/implementation.ts"],
		runningDuration: "2.1s",
		theme: plainTheme,
	});

	const lines = component.render(40);
	assert.match(lines[0]!, /^⠼ Read\(.+\) · 2\.1s$/);
	assert.ok(lines[1]!.startsWith("  └ "));
	for (const line of lines.slice(2)) assert.ok(line.startsWith("    "));
	for (const line of lines) assert.ok(visibleWidth(line) <= 40);
});

test("keeps the tail of a truncated path and closes the signature", () => {
	const component = new ToolHeaderComponent({
		toolName: "edit",
		args: { path: "packages/a/very/long/path/to/component.ts" },
		status: "success",
		marker: "●",
		markerColor: "success",
		semanticSummary: "更新しました",
		facts: ["edit", "packages/a/very/long/path/to/component.ts"],
		theme: plainTheme,
	});

	const anchor = component.render(30)[0]!;
	assert.match(anchor, /^● Update\(….*component\.ts\)$/);
	assert.ok(visibleWidth(anchor) <= 30);
});

test("keeps every built-in signature within 40, 80, and 120 columns", () => {
	const cases = [
		["read", { path: "src/a/very/long/path/to/index.ts", offset: 20, limit: 30 }],
		["edit", { path: "src/a/very/long/path/to/index.ts", edits: [] }],
		["write", { path: "src/a/very/long/path/to/generated.ts", content: "" }],
		["bash", { command: "npm test && npm run typecheck && git status --short" }],
		["grep", { pattern: "a very long search pattern", path: "src/a/very/long/path" }],
		["find", { pattern: "**/*.integration.test.ts", path: "src/a/very/long/path" }],
		["ls", { path: "src/a/very/long/path" }],
	] as const;
	for (const [toolName, args] of cases) {
		const component = new ToolHeaderComponent({
			toolName,
			args,
			status: "success",
			marker: "●",
			markerColor: "success",
			semanticSummary: "操作が完了しました",
			facts: [toolName, "1.2s"],
			theme: plainTheme,
		});
		for (const width of [40, 80, 120]) {
			const lines = component.render(width);
			assert.match(lines[0]!, /^● [A-Z][A-Za-z]+\(.*\)$/);
			for (const line of lines) assert.ok(visibleWidth(line) <= width);
		}
	}
});

test("shrinks indentation without exceeding a narrow width", () => {
	const component = new ToolHeaderComponent({
		toolName: "bash",
		args: { command: "npm test" },
		status: "error",
		marker: "✗",
		markerColor: "error",
		semanticSummary: "テストに失敗しました",
		facts: ["bash", "tests"],
		errorTail: "Command exited with code 1",
		theme: plainTheme,
	});

	const lines = component.render(10);
	assert.ok(lines.some((line) => line.startsWith("└ ")));
	for (const line of lines) assert.ok(visibleWidth(line) <= 10);
});
