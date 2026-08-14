import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Theme } from "@earendil-works/pi-coding-agent";
import {
	getCapabilities,
	setCapabilities,
	stripTerminalSequences,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { ToolHeaderComponent } from "./tool-header.ts";

const plainTheme = {
	fg: (_color: string, value: string) => value,
	bold: (value: string) => value,
	underline: (value: string) => value,
} as unknown as Theme;

const tokenTheme = {
	fg: (color: string, value: string) => `<${color}>${value}</${color}>`,
	bold: (value: string) => `<bold>${value}</bold>`,
	underline: (value: string) => `<underline>${value}</underline>`,
} as unknown as Theme;

interface ThemeJson {
	name: string;
	vars?: Record<string, string | number>;
	colors: Record<string, string | number>;
}

const BACKGROUND_TOKENS = new Set([
	"selectedBg",
	"scrollbarThumb",
	"userMessageBg",
	"customMessageBg",
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
]);

function loadThemeThroughPublicContract(): Theme {
	const sourcePath = fileURLToPath(
		new URL("../../themes/claude-code-dark.json", import.meta.url),
	);
	const json = JSON.parse(readFileSync(sourcePath, "utf8")) as ThemeJson;
	const resolveColor = (value: string | number, seen = new Set<string>()): string | number => {
		if (typeof value === "number" || value === "" || value.startsWith("#")) return value;
		assert.ok(!seen.has(value), `circular theme variable: ${value}`);
		const next = json.vars?.[value];
		assert.notEqual(next, undefined, `unknown theme variable: ${value}`);
		return resolveColor(next!, new Set([...seen, value]));
	};
	const foreground: Record<string, string | number> = {};
	const background: Record<string, string | number> = {};
	for (const [token, value] of Object.entries(json.colors)) {
		(BACKGROUND_TOKENS.has(token) ? background : foreground)[token] = resolveColor(value);
	}
	assert.equal(json.name, "claude-code-dark");
	assert.ok(Object.keys(foreground).length >= 40);
	assert.equal(Object.keys(background).length, BACKGROUND_TOKENS.size);
	return new Theme(
		foreground as ConstructorParameters<typeof Theme>[0],
		background as ConstructorParameters<typeof Theme>[1],
		"truecolor",
		{ name: json.name, sourcePath },
	);
}

test("renders a Claude-style anchor and indented branch", () => {
	const component = new ToolHeaderComponent({
		toolName: "edit",
		args: { path: "src/index.ts" },
		status: "success",
		marker: "⏺",
		markerColor: "success",
		semanticSummary: "型定義を修正しました",
		facts: ["edit", "src/index.ts", "+1 / -3", "0.3s"],
		theme: plainTheme,
	});

	assert.deepEqual(component.render(100), [
		"⏺ Update(src/index.ts)",
		"  ⎿ \u00a0Added 1 line, removed 3 lines · 型定義を修正しました · 0.3s",
	]);
});

test("keeps ordinary search values and neutral outcomes out of warning", () => {
	const component = new ToolHeaderComponent({
		toolName: "grep",
		args: { pattern: "TODO", path: "src" },
		status: "success",
		marker: "●",
		markerColor: "success",
		semanticSummary: "関連箇所を確認しました",
		facts: ["grep", "“TODO”", "no matches", "summarizing…"],
		theme: tokenTheme,
	});
	const rendered = component.render(200).join("\n");
	assert.match(rendered, /<text>“TODO”<\/text>/);
	assert.match(rendered, /<muted>No matches<\/muted>/);
	assert.match(rendered, /<muted>summarizing…<\/muted>/);
	assert.match(rendered, /<text>関連箇所を確認しました<\/text>/);
	assert.ok(!rendered.includes("<warning>"));
});

test("keeps semantic summaries primary when no deterministic fact exists", () => {
	const semanticSummary = "warning時のsuccess条件を確認しました";
	const component = new ToolHeaderComponent({
		toolName: "custom",
		args: {},
		status: "success",
		marker: "⏺",
		markerColor: "success",
		semanticSummary,
		facts: ["custom"],
		theme: tokenTheme,
	});
	const rendered = component.render(120).join("\n");
	assert.match(rendered, /<text>warning時のsuccess条件を確認しました<\/text>/);
	assert.ok(!rendered.includes(`<warning>${semanticSummary}</warning>`));
	assert.ok(!rendered.includes(`<success>${semanticSummary}</success>`));
});

test("keeps edit counts neutral while reserving warning for real caution", () => {
	const component = new ToolHeaderComponent({
		toolName: "edit",
		args: { path: "src/index.ts" },
		status: "success",
		marker: "●",
		markerColor: "success",
		semanticSummary: "更新しました",
		facts: ["edit", "src/index.ts", "+2 / -1", "truncated", "0.4s"],
		theme: tokenTheme,
	});
	const rendered = component.render(200).join("\n");
	assert.match(rendered, /Added <bold>2<\/bold> lines, removed <bold>1<\/bold> line/);
	assert.match(rendered, /<warning>truncated<\/warning>/);
	assert.match(rendered, /<text>更新しました<\/text>/);
	assert.match(rendered, /<dim>0\.4s<\/dim>/);
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
	assert.ok(lines[1]!.startsWith("  ⎿ \u00a0"));
	for (const line of lines.slice(2)) assert.ok(line.startsWith("     "));
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

test("renders paths with the public OSC 8 helper when capabilities allow it", () => {
	const previous = getCapabilities();
	setCapabilities({ ...previous, hyperlinks: true });
	try {
		const component = new ToolHeaderComponent({
			toolName: "edit",
			args: { path: "src/index.ts" },
			status: "success",
			marker: "⏺",
			markerColor: "success",
			semanticSummary: "",
			facts: ["edit", "src/index.ts"],
			cwd: "/workspace/project",
			theme: tokenTheme,
		});

		const anchor = component.render(100)[0]!;
		assert.match(anchor, /<bold><toolTitle>Update<\/toolTitle><\/bold>/);
		assert.match(anchor, /\u001b\]8;;file:\/\/\/workspace\/project\/src\/index\.ts\u001b\\/);
		assert.ok(!anchor.includes("<underline>"));
	} finally {
		setCapabilities(previous);
	}
});

test("falls back to a plain path when OSC 8 is unsupported", () => {
	const previous = getCapabilities();
	setCapabilities({ ...previous, hyperlinks: false });
	try {
		const component = new ToolHeaderComponent({
			toolName: "edit",
			args: { path: "src/index.ts" },
			status: "success",
			marker: "⏺",
			markerColor: "success",
			semanticSummary: "",
			facts: ["edit", "src/index.ts"],
			cwd: "/workspace/project",
			theme: plainTheme,
		});
		const anchor = component.render(100)[0]!;
		assert.equal(anchor, "⏺ Update(src/index.ts)");
		assert.ok(!anchor.includes("\u001b]8;"));
	} finally {
		setCapabilities(previous);
	}
});

test("matches Claude source ANSI through public Theme and hyperlink contracts", () => {
	const previous = getCapabilities();
	setCapabilities({ ...previous, hyperlinks: true });
	try {
		const theme = loadThemeThroughPublicContract();
		const component = new ToolHeaderComponent({
			toolName: "edit",
			args: { path: "packages/core/src/types.ts" },
			status: "success",
			marker: "⏺",
			markerColor: "success",
			semanticSummary: "generated prose is intentionally hidden",
			facts: ["edit", "packages/core/src/types.ts", "+1 / -1", "0.4s"],
			cwd: "/Users/yuichkun/workspace/unworklet",
			theme,
		});

		const [anchor, branch] = component.render(120);
		assert.equal(
			stripTerminalSequences(anchor!),
			"⏺ Update(packages/core/src/types.ts)",
		);
		assert.equal(
			stripTerminalSequences(branch!),
			"  ⎿ \u00a0Added 1 line, removed 1 line · generated prose is intentionally hidden · 0.4s",
		);
		assert.match(anchor!, /^\u001b\[38;2;78;186;101m⏺\u001b\[39m /);
		assert.match(
			anchor!,
			/\u001b\]8;;file:\/\/\/Users\/yuichkun\/workspace\/unworklet\/packages\/core\/src\/types\.ts\u001b\\/,
		);
		assert.match(branch!, /^\u001b\[38;2;153;153;153m  ⎿ \u00a0\u001b\[39mAdded /);
		assert.match(branch!, /\u001b\[38;2;117;113;94m0\.4s\u001b\[39m$/);
		assert.ok(!anchor!.includes("\u001b[4m"));
	} finally {
		setCapabilities(previous);
	}
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
	assert.ok(lines.some((line) => line.startsWith("⎿ \u00a0")));
	for (const line of lines) assert.ok(visibleWidth(line) <= 10);
});
