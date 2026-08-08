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

test("formats deterministic edit facts before the semantic summary", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "edit",
			args: { path: "src/index.ts" },
			facts: ["edit", "src/index.ts", "+1 / -3", "0.3s"],
			semanticSummary: "型定義を修正しました",
			status: "success",
		}),
		["Added 1 line, removed 3 lines", "0.3s", "型定義を修正しました"],
	);
});

test("removes signature facts and live duration from branch content", () => {
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

test("uses Claude-style shell activity wording and keeps result facts", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "bash",
			args: { command: "npm test" },
			facts: ["bash", "tests", "8 tests passed", "1.5s"],
			semanticSummary: "Tool UIの回帰テストを実行しました",
			status: "success",
		}),
		["Ran 1 shell command", "8 tests passed", "1.5s", "Tool UIの回帰テストを実行しました"],
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
		["Read 42 lines"],
	);
	assert.deepEqual(
		getBranchParts({
			toolName: "bash",
			args: { command: "npm test" },
			facts: ["bash", "tests", "8 tests passed"],
			semanticSummary: "testsが完了しました",
			status: "success",
		}),
		["Ran 1 shell command", "8 tests passed"],
	);
});

test("keeps a purpose summary even when it mentions the signature argument", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "bash",
			args: { command: "npm test" },
			facts: ["bash", "tests", "8 tests passed"],
			semanticSummary: "Tool UIの回帰を防ぐため、testsを実行しました",
			status: "success",
		}),
		["Ran 1 shell command", "8 tests passed", "Tool UIの回帰を防ぐため、testsを実行しました"],
	);
});

test("suppresses a semantic summary that exactly repeats a fact", () => {
	assert.deepEqual(
		getBranchParts({
			toolName: "find",
			args: { pattern: "*.ts", path: "src" },
			facts: ["find", "“*.ts”", "12 files"],
			semanticSummary: "12 files",
			status: "success",
		}),
		["12 files"],
	);
});
