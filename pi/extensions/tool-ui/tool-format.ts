import { getCommandLabel, getToolPath } from "./facts.ts";

export type ToolDisplayStatus = "pending" | "running" | "success" | "error";
export type SignatureArgumentKind = "path" | "pattern" | "command" | "value";

export interface SignatureArgument {
	kind: SignatureArgumentKind;
	text: string;
}

export interface ToolSignature {
	name: string;
	arguments: SignatureArgument[];
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function singleLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function quoteArgument(value: string): string {
	return `“${singleLine(value)}”`;
}

function readPath(args: Record<string, unknown>): string {
	const path = getToolPath(args, "?");
	const offset = typeof args.offset === "number" ? args.offset : undefined;
	const limit = typeof args.limit === "number" ? args.limit : undefined;
	if (offset === undefined && limit === undefined) return path;
	const start = offset ?? 1;
	return limit === undefined ? `${path}:${start}` : `${path}:${start}-${start + limit - 1}`;
}

export function getToolSignature(
	toolName: string,
	args: Record<string, unknown>,
): ToolSignature {
	const path = getToolPath(args, "?");
	const pattern = asString(args.pattern);

	switch (toolName) {
		case "read":
			return { name: "Read", arguments: [{ kind: "path", text: readPath(args) }] };
		case "edit":
			return { name: "Update", arguments: [{ kind: "path", text: path }] };
		case "write":
			return { name: "Write", arguments: [{ kind: "path", text: path }] };
		case "bash":
			return {
				name: "Bash",
				arguments: [
					{
						kind: "command",
						text: getCommandLabel(asString(args.command) ?? ""),
					},
				],
			};
		case "grep":
			return {
				name: "Search",
				arguments: [
					{ kind: "pattern", text: pattern ? quoteArgument(pattern) : "?" },
					{ kind: "path", text: path },
				],
			};
		case "find":
			return {
				name: "Find",
				arguments: [
					{ kind: "pattern", text: pattern ? quoteArgument(pattern) : "?" },
					{ kind: "path", text: path },
				],
			};
		case "ls":
			return { name: "List", arguments: [{ kind: "path", text: path }] };
		default:
			return {
				name: toolName.length > 0 ? toolName[0]!.toUpperCase() + toolName.slice(1) : "Tool",
				arguments: [],
			};
	}
}

export function formatPlainSignature(signature: ToolSignature): string {
	return `${signature.name}(${signature.arguments.map((argument) => argument.text).join(", ")})`;
}

function normalizeComparable(value: string): string {
	return singleLine(value)
		.toLocaleLowerCase()
		.replace(/[“”"'`]/g, "")
		.replace(/[()\[\]{},.:;・·/\\_-]/g, "")
		.replace(/\s+/g, "");
}

function isSignatureFact(fact: string, signature: ToolSignature): boolean {
	const normalizedFact = normalizeComparable(fact.replace(/:\d+(?:-\d+)?$/, ""));
	return signature.arguments.some((argument) => {
		const normalizedArgument = normalizeComparable(argument.text.replace(/:\d+(?:-\d+)?$/, ""));
		return normalizedArgument.length > 0 && normalizedFact === normalizedArgument;
	});
}

function countLabel(count: string): string {
	return Number(count) === 1 ? "line" : "lines";
}

function isLowValueFact(toolName: string, fact: string): boolean {
	if (toolName === "read" || toolName === "write") return /^\d+ lines$/.test(fact);
	if (toolName === "grep") return /^\d+ result lines$/.test(fact);
	if (toolName === "find") return /^[1-9]\d* files$/.test(fact);
	if (toolName === "ls") return /^[1-9]\d* entries$/.test(fact);
	if (toolName === "edit") {
		return /^\d+ replacements$/.test(fact) || /^\+\d+\s*\/\s*-\d+$/.test(fact);
	}
	return false;
}

function humanizeFact(toolName: string, fact: string): string {
	const diff = fact.match(/^\+(\d+)\s*\/\s*-(\d+)$/);
	if (diff) {
		return `Added ${diff[1]} ${countLabel(diff[1]!)}, removed ${diff[2]} ${countLabel(diff[2]!)}`;
	}

	const lines = fact.match(/^(\d+) lines$/);
	if (lines) {
		if (toolName === "read") return `Read ${lines[1]} ${countLabel(lines[1]!)}`;
		if (toolName === "write") return `Wrote ${lines[1]} ${countLabel(lines[1]!)}`;
	}

	if (
		fact === "no matches" ||
		(toolName === "find" && fact === "0 files") ||
		(toolName === "ls" && fact === "0 entries")
	) {
		return "No matches";
	}
	return fact;
}

const GENERIC_SUMMARY_REMAINDERS = new Set(
	[
		"を確認しています",
		"を確認しました",
		"の確認に失敗しました",
		"を検索しています",
		"の検索が完了しました",
		"の検索に失敗しました",
		"に一致するファイルを探しています",
		"に一致するファイルを確認しました",
		"のファイル検索に失敗しました",
		"の内容を確認しています",
		"の内容を確認しました",
		"の一覧取得に失敗しました",
		"を更新しています",
		"を更新しました",
		"の更新に失敗しました",
		"を書き込んでいます",
		"を書き込みました",
		"の書き込みに失敗しました",
		"を実行しています",
		"が完了しました",
		"の実行に失敗しました",
		"running",
		"completed",
		"failed",
	].map(normalizeComparable),
);

function summaryIsRedundant(
	summary: string,
	visibleFacts: readonly string[],
	signature: ToolSignature,
): boolean {
	const normalizedSummary = normalizeComparable(summary);
	if (normalizedSummary.length < 4) return false;
	if (
		visibleFacts.some((fact) => {
			const normalizedFact = normalizeComparable(fact);
			if (normalizedFact.length < 4) return false;
			return normalizedSummary === normalizedFact || normalizedFact.includes(normalizedSummary);
		})
	) {
		return true;
	}

	return signature.arguments.some((argument) => {
		const normalizedArgument = normalizeComparable(argument.text);
		if (normalizedArgument.length < 2 || !normalizedSummary.includes(normalizedArgument)) {
			return false;
		}
		const remainder = normalizedSummary.replace(normalizedArgument, "");
		return GENERIC_SUMMARY_REMAINDERS.has(remainder);
	});
}

export function getBranchParts(options: {
	toolName: string;
	args: Record<string, unknown>;
	facts: readonly string[];
	semanticSummary: string;
	status: ToolDisplayStatus;
	errorTail?: string;
	includeLowValueFacts?: boolean;
}): string[] {
	const signature = getToolSignature(options.toolName, options.args);
	const parts: string[] = [];

	if (options.errorTail) parts.push(`Error: ${singleLine(options.errorTail)}`);
	if (
		options.includeLowValueFacts &&
		options.toolName === "bash" &&
		options.status === "success"
	) {
		parts.push("Ran 1 shell command");
	} else if (options.toolName === "bash" && options.status === "error" && !options.errorTail) {
		parts.push("Shell command failed");
	}

	let duration: string | undefined;
	for (const fact of options.facts) {
		if (fact === options.toolName || fact === "completed") continue;
		if (/^running\s+\d/.test(fact)) continue;
		if (/^\d+(?:\.\d+)?s$/.test(fact)) {
			duration = options.includeLowValueFacts ? fact : undefined;
			continue;
		}
		if (isSignatureFact(fact, signature)) continue;
		if (options.toolName === "bash" && fact === signature.arguments[0]?.text) continue;
		if (!options.includeLowValueFacts && isLowValueFact(options.toolName, fact)) continue;
		const humanized = humanizeFact(options.toolName, fact);
		if (!parts.includes(humanized)) parts.push(humanized);
	}

	const summary = singleLine(options.semanticSummary);
	if (summary && !summaryIsRedundant(summary, parts, signature)) parts.push(summary);
	if (duration) parts.push(duration);
	return parts;
}
