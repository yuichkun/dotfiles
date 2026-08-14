import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	attachCompactMetadata,
	getCompactMetadata,
	getFallbackSemantic,
	getResultFacts,
} from "./facts.ts";
import {
	colorizeExpandedToolOutput,
	sanitizeTerminalAnsi,
} from "./output-color.ts";
import { parseSummaryResponse } from "./summary-format.ts";
import { COMPACT_TOOL_UI_VERSION } from "./types.ts";

test("recognizes a Python heredoc in fallback summaries", () => {
	const summary = getFallbackSemantic("bash", {
		command: "python3 - <<'PY'\nprint('ok')\nPY",
	});
	assert.equal(summary.running, "python heredocを実行しています");
	assert.equal(summary.success, "python heredocが完了しました");
});

test("uses meaningful command categories in fallback summaries", () => {
	const testSummary = getFallbackSemantic("bash", {
		command: "node --test --experimental-strip-types tool-ui.test.ts",
	});
	assert.equal(testSummary.success, "Node unit testsが完了しました");

	const validationSummary = getFallbackSemantic("bash", {
		command: "git diff --check && npx tsc --noEmit && git status --short",
	});
	assert.equal(
		validationSummary.success,
		"TypeScript typecheck + diff check + git statusが完了しました",
	);
});

test("preserves color SGR while removing terminal control sequences", () => {
	const result = sanitizeTerminalAnsi(
		"\u001b[31merror\u001b[0m\u001b[2J\u001b]0;unsafe title\u0007done",
	);
	assert.equal(result.hasSgr, true);
	assert.equal(result.text, "\u001b[31merror\u001b[0mdone\u001b[0m");
});

test("applies semantic colors when command output has no ANSI", () => {
	const theme = {
		fg: (color: string, value: string) => `<${color}>${value}</${color}>`,
	} as unknown as Theme;
	const output = colorizeExpandedToolOutput({
		toolName: "bash",
		args: { command: "node --test" },
		content: [{ type: "text", text: "✔ parser passed\nAssertionError: mismatch" }],
		theme,
	});
	assert.equal(
		output,
		"<text>✔ parser passed</text>\n<error>AssertionError: mismatch</error>",
	);
});

test("highlights grep matches as focus without warning-colored values", () => {
	const theme = {
		fg: (color: string, value: string) => `<${color}>${value}</${color}>`,
	} as unknown as Theme;
	const output = colorizeExpandedToolOutput({
		toolName: "grep",
		args: { pattern: "TODO" },
		content: [{ type: "text", text: "src/index.ts:12:before TODO after" }],
		theme,
	});
	assert.equal(
		output,
		"<muted>src/index.ts</muted><dim>:12:</dim><text>before </text><accent>TODO</accent><text> after</text>",
	);
	assert.ok(!output?.includes("<warning>"));
});

test("classifies explicit diff and info lines without success color", () => {
	const theme = {
		fg: (color: string, value: string) => `<${color}>${value}</${color}>`,
	} as unknown as Theme;
	assert.equal(
		colorizeExpandedToolOutput({
			toolName: "bash",
			args: { command: "node --test" },
			content: [{ type: "text", text: "+ 3 passing\nℹ 5 passed" }],
			theme,
		}),
		"<toolDiffAdded>+ 3 passing</toolDiffAdded>\n<muted>ℹ 5 passed</muted>",
	);
});

test("keeps find and list path names primary regardless of their words", () => {
	const theme = {
		fg: (color: string, value: string) => `<${color}>${value}</${color}>`,
	} as unknown as Theme;
	for (const toolName of ["find", "ls"] as const) {
		assert.equal(
			colorizeExpandedToolOutput({
				toolName,
				args: {},
				content: [
					{
						type: "text",
						text: "src/error-handling.ts\ndocs/warning-notes.md",
					},
				],
				theme,
			}),
			"<text>src/error-handling.ts</text>\n<text>docs/warning-notes.md</text>",
		);
	}
});

test("extracts edit diff facts", () => {
	const result = getResultFacts({
		toolName: "edit",
		args: { path: "src/example.ts", edits: [{ oldText: "a", newText: "b" }] },
		content: [{ type: "text", text: "Updated src/example.ts" }],
		details: {
			diff: ["--- a", "+++ b", "@@", "-old", "+new", "+another"].join("\n"),
		},
		isError: false,
		durationMs: 250,
	});
	assert.deepEqual(result.facts, ["edit", "src/example.ts", "+2 / -1", "0.3s"]);
});

test("keeps the final error line in collapsed facts", () => {
	const result = getResultFacts({
		toolName: "bash",
		args: { command: "pnpm test" },
		content: [{ type: "text", text: "FAIL renderer.test.ts\nCommand exited with code 1" }],
		details: undefined,
		isError: true,
		durationMs: 1_500,
	});
	assert.equal(result.errorTail, "Command exited with code 1");
	assert.deepEqual(result.facts, ["bash", "tests", "1.5s"]);
});

test("round-trips compact metadata without dropping built-in details", () => {
	const metadata = {
		version: COMPACT_TOOL_UI_VERSION,
		semantic: {
			running: "確認しています",
			success: "確認しました",
			failure: "確認に失敗しました",
		},
		facts: ["read", "README.md", "10 lines"],
		batch: { id: "call-1", index: 1, size: 2 },
	};
	const details = attachCompactMetadata({ truncation: { truncated: false } }, metadata);
	assert.deepEqual(details.truncation, { truncated: false });
	assert.deepEqual(getCompactMetadata(details), metadata);
});

test("parses fenced summary JSON and ignores unknown tool ids", () => {
	const parsed = parseSummaryResponse(
		'```json\n{"summaries":[{"toolCallId":"known","running":"調査中","success":"調査完了","failure":"調査失敗"},{"toolCallId":"unknown","running":"x","success":"y","failure":"z"}]}\n```',
		new Set(["known"]),
	);
	assert.equal(parsed.size, 1);
	assert.deepEqual(parsed.get("known"), {
		running: "調査中",
		success: "調査完了",
		failure: "調査失敗",
	});
});
