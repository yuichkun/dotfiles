import assert from "node:assert/strict";
import test from "node:test";
import {
	formatPlainSignature,
	getBranchParts,
	getToolSignature,
} from "./tool-format.ts";

test("maps built-in tools to Claude-style signatures", () => {
	assert.equal(
		formatPlainSignature(getToolSignature("read", { path: "src/index.ts", offset: 10, limit: 5 })),
		"Read(src/index.ts:10-14)",
	);
	assert.equal(
		formatPlainSignature(getToolSignature("edit", { path: "src/index.ts" })),
		"Update(src/index.ts)",
	);
	assert.equal(
		formatPlainSignature(getToolSignature("write", { path: "src/new.ts" })),
		"Write(src/new.ts)",
	);
	assert.equal(
		formatPlainSignature(getToolSignature("bash", { command: "git status --short" })),
		"Bash(git status)",
	);
	assert.equal(
		formatPlainSignature(getToolSignature("grep", { pattern: "TODO", path: "src" })),
		"Search(“TODO”, src)",
	);
	assert.equal(
		formatPlainSignature(getToolSignature("find", { pattern: "**/*.ts", path: "." })),
		"Find(“**/*.ts”, .)",
	);
	assert.equal(
		formatPlainSignature(getToolSignature("ls", { path: "src" })),
		"List(src)",
	);
});

test("hides edit counts and duration behind the semantic summary", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "edit",
			args: { path: "src/index.ts" },
			facts: ["edit", "src/index.ts", "+1 / -3", "0.3s"],
			semanticSummary: "型定義を修正しました",
			status: "success",
		}),
		["型定義を修正しました"],
	);
});

test("restores low-value facts and duration for expanded headers", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "read",
			args: { path: "src/index.ts" },
			facts: ["read", "src/index.ts", "42 lines", "0.3s"],
			semanticSummary: "実装を確認しました",
			status: "success",
			includeLowValueFacts: true,
		}),
		["Read 42 lines", "実装を確認しました", "0.3s"],
	);
	assert.deepEqual(
		getBranchParts({
			toolName: "edit",
			args: { path: "src/index.ts" },
			facts: ["edit", "src/index.ts", "+1 / -3", "0.4s"],
			semanticSummary: "型定義を修正しました",
			status: "success",
			includeLowValueFacts: true,
		}),
		["Added 1 line, removed 3 lines", "型定義を修正しました", "0.4s"],
	);
});

test("hides long durations collapsed and restores them expanded", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "read",
			args: { path: "src/index.ts" },
			facts: ["read", "src/index.ts", "90s"],
			semanticSummary: "実装を確認しました",
			status: "success",
		}),
		["実装を確認しました"],
	);
	assert.deepEqual(
		getBranchParts({
			toolName: "read",
			args: { path: "src/index.ts" },
			facts: ["read", "src/index.ts", "90s"],
			semanticSummary: "実装を確認しました",
			status: "success",
			includeLowValueFacts: true,
		}),
		["実装を確認しました", "90s"],
	);
});

test("keeps live summarizing state alongside semantic purpose", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "read",
			args: { path: "src/index.ts" },
			facts: ["read", "src/index.ts", "running 2.1s", "summarizing…"],
			semanticSummary: "実装を確認しています",
			status: "running",
		}),
		["summarizing…", "実装を確認しています"],
	);
});

test("keeps Bash outcome facts and purpose while removing shell boilerplate", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "bash",
			args: { command: "npm test" },
			facts: ["bash", "tests", "8 tests passed", "1.5s"],
			semanticSummary: "Tool UIの回帰テストを実行しました",
			status: "success",
		}),
		["8 tests passed", "Tool UIの回帰テストを実行しました"],
	);
});

test("suppresses deterministic fallback summaries that repeat signature arguments", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "read",
			args: { path: "src/index.ts" },
			facts: ["read", "src/index.ts", "42 lines"],
			semanticSummary: "src/index.tsを確認しました",
			status: "success",
		}),
		[],
	);
	assert.deepEqual(
		getBranchParts({
			toolName: "bash",
			args: { command: "npm test" },
			facts: ["bash", "tests", "8 tests passed"],
			semanticSummary: "testsが完了しました",
			status: "success",
		}),
		["8 tests passed"],
	);
});

test("keeps deterministic Bash facts and generated purpose prose", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "bash",
			args: { command: "npm test" },
			facts: ["bash", "tests", "8 tests passed"],
			semanticSummary: "Tool UIの回帰を防ぐため、testsを実行しました",
			status: "success",
		}),
		["8 tests passed", "Tool UIの回帰を防ぐため、testsを実行しました"],
	);
});

test("removes generic positive counts but preserves no-match outcomes", () => {
	for (const testCase of [
		{ toolName: "write", args: { path: "src/new.ts" }, facts: ["write", "src/new.ts", "42 lines"] },
		{ toolName: "grep", args: {}, facts: ["grep", "12 result lines"] },
		{ toolName: "find", args: {}, facts: ["find", "12 files"] },
		{ toolName: "ls", args: { path: "src" }, facts: ["ls", "src", "12 entries"] },
	]) {
		assert.deepEqual(
			getBranchParts({
				...testCase,
				semanticSummary: "目的の処理を完了しました",
				status: "success",
			}),
			["目的の処理を完了しました"],
		);
	}
	for (const testCase of [
		{
			toolName: "find",
			args: { pattern: "*.ts", path: "src" },
			facts: ["find", "0 files"],
		},
		{
			toolName: "ls",
			args: { path: "src" },
			facts: ["ls", "src", "0 entries"],
		},
	]) {
		assert.deepEqual(
			getBranchParts({
				...testCase,
				semanticSummary: "対象を確認しました",
				status: "success",
			}),
			["No matches", "対象を確認しました"],
		);
	}
});

test("keeps truncated and error details while collapsed", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "edit",
			args: { path: "src/index.ts" },
			facts: ["edit", "src/index.ts", "+2 / -1", "truncated", "0.4s"],
			semanticSummary: "更新内容を確認しました",
			status: "error",
			errorTail: "write failed",
		}),
		["Error: write failed", "truncated", "更新内容を確認しました"],
	);
});

test("keeps a semantic summary when a custom Tool has no deterministic fact", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "custom",
			args: {},
			facts: ["custom"],
			semanticSummary: "目的の処理を完了しました",
			status: "success",
		}),
		["目的の処理を完了しました"],
	);
});

test("suppresses a semantic summary that exactly repeats a high-value fact", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "grep",
			args: { pattern: "TODO", path: "src" },
			facts: ["grep", "no matches"],
			semanticSummary: "No matches",
			status: "success",
		}),
		["No matches"],
	);
});
