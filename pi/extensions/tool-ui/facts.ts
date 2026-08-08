import { homedir } from "node:os";
import type { TextContent } from "@earendil-works/pi-ai";
import {
	COMPACT_TOOL_UI_DETAILS_KEY,
	type CompactToolUiMetadata,
	type ToolSemanticSummary,
} from "./types.ts";

const MAX_LABEL_LENGTH = 92;
const MAX_ERROR_TAIL_LENGTH = 180;

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function shortenPath(path: string): string {
	const home = homedir();
	return path === home
		? "~"
		: path.startsWith(`${home}/`)
			? `~/${path.slice(home.length + 1)}`
			: path;
}

function truncateSingleLine(value: string, limit = MAX_LABEL_LENGTH): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length <= limit
		? normalized
		: `${normalized.slice(0, Math.max(1, limit - 1))}…`;
}

function quote(value: string): string {
	return `“${truncateSingleLine(value, 48)}”`;
}

function getText(content: readonly unknown[]): string {
	return content
		.filter(
			(block): block is TextContent =>
				Boolean(
					block &&
						typeof block === "object" &&
						(block as { type?: unknown }).type === "text" &&
						typeof (block as { text?: unknown }).text === "string",
				),
		)
		.map((block) => block.text)
		.join("\n");
}

function countNonEmptyLines(value: string): number {
	if (!value.trim()) return 0;
	return value.split("\n").filter((line) => line.trim()).length;
}

function formatDuration(durationMs: number | undefined): string | undefined {
	if (durationMs === undefined) return undefined;
	if (durationMs < 1000) return `${Math.max(0.1, durationMs / 1000).toFixed(1)}s`;
	if (durationMs < 10_000) return `${(durationMs / 1000).toFixed(1)}s`;
	return `${Math.round(durationMs / 1000)}s`;
}

export function getCommandLabel(command: string): string {
	const semanticLabels: string[] = [];
	const addLabel = (label: string) => {
		if (!semanticLabels.includes(label)) semanticLabels.push(label);
	};
	if (/\bnode\b[^\n]*\s--test\b/i.test(command)) addLabel("Node unit tests");
	if (/\b(?:npx|pnpm|npm|yarn)\b[^\n]*(?:\btsc\b|typecheck)/i.test(command)) {
		addLabel("TypeScript typecheck");
	}
	if (/\b(?:vitest|jest|pytest)\b|\b(?:pnpm|npm|yarn)\s+(?:run\s+)?test\b/i.test(command)) {
		addLabel("tests");
	}
	if (/\bgit\s+diff\s+--check\b/i.test(command)) addLabel("diff check");
	if (/\bgit\s+diff\s+--stat\b/i.test(command)) addLabel("diff summary");
	if (/\bgit\s+status\b/i.test(command)) addLabel("git status");
	if (semanticLabels.length > 0) return semanticLabels.slice(0, 3).join(" + ");

	if (/\bpython(?:3(?:\.\d+)?)?\s+-?\s*<<[-~]?['"]?\w+/i.test(command)) {
		return "python heredoc";
	}
	if (/\bnode\s+-?\s*<<[-~]?['"]?\w+/i.test(command)) {
		return "node heredoc";
	}

	const labels: string[] = [];
	for (const segment of command.split(/&&|\|\||(?<!\|)\|(?!\|)/)) {
		const words = segment.trim().split(/\s+/);
		const executable = words.find(
			(word) => word && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word),
		);
		if (!executable) continue;
		const label = executable.replace(/^.*\//, "");
		if (!labels.includes(label)) labels.push(label);
		if (labels.length === 3) break;
	}
	return labels.length > 0 ? labels.join(" + ") : "shell command";
}

export function getToolPath(
	args: Record<string, unknown>,
	fallback = ".",
): string {
	return shortenPath(asString(args.path) ?? fallback);
}

function getEditCounts(details: unknown): { additions: number; removals: number } | undefined {
	const diff = asString(asRecord(details)?.diff);
	if (!diff) return undefined;
	let additions = 0;
	let removals = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+") && !line.startsWith("+++")) additions++;
		if (line.startsWith("-") && !line.startsWith("---")) removals++;
	}
	return { additions, removals };
}

function extractTestFact(output: string): string | undefined {
	const vitest = output.match(/Tests\s+(?:(\d+)\s+failed[^\n]*?\|\s*)?(\d+)\s+passed/i);
	if (vitest) {
		const failed = Number(vitest[1] ?? 0);
		const passed = Number(vitest[2] ?? 0);
		return failed > 0 ? `${passed} passed / ${failed} failed` : `${passed} tests passed`;
	}
	const generic = output.match(/\b(\d+)\s+(?:tests?\s+)?passed\b/i);
	if (generic) return `${generic[1]} tests passed`;
	const passing = output.match(/\b(\d+)\s+passing\b/i);
	if (passing) return `${passing[1]} tests passed`;
	return undefined;
}

function hasTruncation(details: unknown): boolean {
	const truncation = asRecord(asRecord(details)?.truncation);
	return truncation?.truncated === true;
}

export function getFallbackSemantic(
	toolName: string,
	args: Record<string, unknown>,
): ToolSemanticSummary {
	const path = getToolPath(args);
	const pattern = asString(args.pattern);

	switch (toolName) {
		case "read":
			return {
				running: `${path}を確認しています`,
				success: `${path}を確認しました`,
				failure: `${path}の確認に失敗しました`,
			};
		case "grep": {
			const target = pattern ? quote(pattern) : "指定パターン";
			return {
				running: `${target}を検索しています`,
				success: `${target}の検索が完了しました`,
				failure: `${target}の検索に失敗しました`,
			};
		}
		case "find": {
			const target = pattern ? quote(pattern) : "ファイル";
			return {
				running: `${target}に一致するファイルを探しています`,
				success: `${target}に一致するファイルを確認しました`,
				failure: `${target}のファイル検索に失敗しました`,
			};
		}
		case "ls":
			return {
				running: `${path}の内容を確認しています`,
				success: `${path}の内容を確認しました`,
				failure: `${path}の一覧取得に失敗しました`,
			};
		case "edit":
			return {
				running: `${path}を更新しています`,
				success: `${path}を更新しました`,
				failure: `${path}の更新に失敗しました`,
			};
		case "write":
			return {
				running: `${path}を書き込んでいます`,
				success: `${path}を書き込みました`,
				failure: `${path}の書き込みに失敗しました`,
			};
		case "bash": {
			const command = asString(args.command) ?? "";
			const label = getCommandLabel(command);
			return {
				running: `${label}を実行しています`,
				success: `${label}が完了しました`,
				failure: `${label}の実行に失敗しました`,
			};
		}
		default:
			return {
				running: `${toolName}を実行しています`,
				success: `${toolName}が完了しました`,
				failure: `${toolName}に失敗しました`,
			};
	}
}

export function getLiveFacts(
	toolName: string,
	args: Record<string, unknown>,
	durationMs: number | undefined,
): string[] {
	const facts: string[] = [toolName];
	const path = getToolPath(args);

	switch (toolName) {
		case "read": {
			facts.push(path);
			const offset = typeof args.offset === "number" ? args.offset : undefined;
			const limit = typeof args.limit === "number" ? args.limit : undefined;
			if (offset !== undefined || limit !== undefined) {
				const start = offset ?? 1;
				facts[facts.length - 1] += limit ? `:${start}-${start + limit - 1}` : `:${start}`;
			}
			break;
		}
		case "edit":
			facts.push(path);
			if (Array.isArray(args.edits)) facts.push(`${args.edits.length} replacements`);
			break;
		case "write":
			facts.push(path);
			break;
		case "grep":
			if (asString(args.pattern)) facts.push(quote(args.pattern as string));
			facts.push(path);
			break;
		case "find":
			if (asString(args.pattern)) facts.push(quote(args.pattern as string));
			facts.push(path);
			break;
		case "ls":
			facts.push(path);
			break;
		case "bash":
			facts.push(getCommandLabel(asString(args.command) ?? ""));
			break;
	}

	const duration = formatDuration(durationMs);
	if (duration) facts.push(`running ${duration}`);
	return facts;
}

export function getResultFacts(options: {
	toolName: string;
	args: Record<string, unknown>;
	content: readonly unknown[];
	details: unknown;
	isError: boolean;
	durationMs?: number;
}): { facts: string[]; errorTail?: string } {
	const { toolName, args, content, details, isError, durationMs } = options;
	const output = getText(content);
	const facts: string[] = [toolName];
	const path = getToolPath(args);

	switch (toolName) {
		case "read": {
			facts.push(path);
			const lines = countNonEmptyLines(output);
			if (lines > 0) facts.push(`${lines} lines`);
			break;
		}
		case "grep": {
			if (asString(args.pattern)) facts.push(quote(args.pattern as string));
			const lines = countNonEmptyLines(output);
			facts.push(lines > 0 ? `${lines} result lines` : "no matches");
			break;
		}
		case "find": {
			if (asString(args.pattern)) facts.push(quote(args.pattern as string));
			const lines = countNonEmptyLines(output);
			facts.push(`${lines} files`);
			break;
		}
		case "ls": {
			facts.push(path);
			facts.push(`${countNonEmptyLines(output)} entries`);
			break;
		}
		case "edit": {
			facts.push(path);
			const counts = getEditCounts(details);
			if (counts) facts.push(`+${counts.additions} / -${counts.removals}`);
			break;
		}
		case "write": {
			facts.push(path);
			const value = asString(args.content) ?? "";
			facts.push(`${value ? value.split("\n").length : 0} lines`);
			break;
		}
		case "bash": {
			facts.push(getCommandLabel(asString(args.command) ?? ""));
			const testFact = extractTestFact(output);
			if (testFact) facts.push(testFact);
			break;
		}
		default: {
			const lines = countNonEmptyLines(output);
			if (lines > 0) facts.push(`${lines} output lines`);
		}
	}

	if (hasTruncation(details)) facts.push("truncated");
	const duration = formatDuration(durationMs);
	if (duration) facts.push(duration);

	let errorTail: string | undefined;
	if (isError && output.trim()) {
		const lastLine = output
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.at(-1);
		if (lastLine) errorTail = truncateSingleLine(lastLine, MAX_ERROR_TAIL_LENGTH);
	}
	return { facts, errorTail };
}

export function attachCompactMetadata(
	details: unknown,
	metadata: CompactToolUiMetadata,
): Record<string, unknown> {
	return {
		...(asRecord(details) ?? {}),
		[COMPACT_TOOL_UI_DETAILS_KEY]: metadata,
	};
}

export function getCompactMetadata(details: unknown): CompactToolUiMetadata | undefined {
	const value = asRecord(details)?.[COMPACT_TOOL_UI_DETAILS_KEY];
	const metadata = asRecord(value);
	if (
		!metadata ||
		typeof metadata.version !== "number" ||
		!asRecord(metadata.semantic) ||
		!Array.isArray(metadata.facts)
	) {
		return undefined;
	}
	return value as CompactToolUiMetadata;
}

export function getTextOutput(content: readonly unknown[]): string {
	return getText(content);
}
