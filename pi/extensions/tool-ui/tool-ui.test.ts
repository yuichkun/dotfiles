import assert from "node:assert/strict";
import test from "node:test";
import {
	attachCompactMetadata,
	getCompactMetadata,
	getFallbackSemantic,
	getResultFacts,
} from "./facts.ts";
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
