import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type {
	ToolCall,
	ToolResultMessage,
} from "@earendil-works/pi-ai";

export interface ToolOutputRecord {
	id: string;
	toolName: string;
	arguments: Record<string, unknown>;
	result: ToolResultMessage;
	timestamp: number;
	summary: string;
	searchText: string;
	turnNumber: number;
	totalTurns: number;
	toolIndexInTurn: number;
	toolCountInTurn: number;
	userPrompt: string;
}

const SUMMARY_KEYS = [
	"command",
	"path",
	"pattern",
	"query",
	"url",
] as const;

function normalizeSingleLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function stringifyArguments(args: Record<string, unknown>): string {
	try {
		return JSON.stringify(args);
	} catch {
		return String(args);
	}
}

function summarizeArguments(
	toolName: string,
	args: Record<string, unknown>,
): string {
	if (toolName === "grep") {
		const pattern =
			typeof args.pattern === "string" ? args.pattern : undefined;
		const path = typeof args.path === "string" ? args.path : undefined;
		if (pattern && path) {
			return normalizeSingleLine(`${pattern} — ${path}`);
		}
	}

	for (const key of SUMMARY_KEYS) {
		const value = args[key];
		if (typeof value === "string" && value.trim()) {
			return normalizeSingleLine(value);
		}
	}

	const firstString = Object.values(args).find(
		(value): value is string =>
			typeof value === "string" && value.trim().length > 0,
	);
	if (firstString) return normalizeSingleLine(firstString);

	const serialized = stringifyArguments(args);
	return serialized === "{}" ? "" : normalizeSingleLine(serialized);
}

interface ToolCallContext {
	call: ToolCall;
	turnNumber: number;
	toolIndexInTurn: number;
	userPrompt: string;
}

interface CollectedToolCalls {
	calls: Map<string, ToolCallContext>;
	toolCountsByTurn: Map<number, number>;
	totalTurns: number;
}

function getUserPrompt(entry: SessionEntry): string | undefined {
	if (entry.type !== "message" || entry.message.role !== "user") {
		return undefined;
	}
	const { content } = entry.message;
	if (typeof content === "string") return normalizeSingleLine(content);
	return normalizeSingleLine(
		content
			.map((block) =>
				block.type === "text" ? block.text : `[Image: ${block.mimeType}]`,
			)
			.join(" "),
	);
}

function collectToolCalls(
	entries: readonly SessionEntry[],
): CollectedToolCalls {
	const calls = new Map<string, ToolCallContext>();
	const toolCountsByTurn = new Map<number, number>();
	let turnNumber = 0;
	let userPrompt = "";

	for (const entry of entries) {
		const nextUserPrompt = getUserPrompt(entry);
		if (nextUserPrompt !== undefined) {
			turnNumber++;
			userPrompt = nextUserPrompt;
			continue;
		}
		if (
			entry.type !== "message" ||
			entry.message.role !== "assistant"
		) {
			continue;
		}
		for (const block of entry.message.content) {
			if (block.type !== "toolCall") continue;
			const toolIndexInTurn =
				(toolCountsByTurn.get(turnNumber) ?? 0) + 1;
			toolCountsByTurn.set(turnNumber, toolIndexInTurn);
			calls.set(block.id, {
				call: block,
				turnNumber,
				toolIndexInTurn,
				userPrompt,
			});
		}
	}

	return { calls, toolCountsByTurn, totalTurns: turnNumber };
}

export function collectToolOutputs(
	entries: readonly SessionEntry[],
): ToolOutputRecord[] {
	const { calls, toolCountsByTurn, totalTurns } =
		collectToolCalls(entries);
	const outputs: ToolOutputRecord[] = [];

	for (const entry of entries) {
		if (
			entry.type !== "message" ||
			entry.message.role !== "toolResult"
		) {
			continue;
		}

		const result = entry.message;
		const context = calls.get(result.toolCallId);
		const args = (context?.call.arguments ?? {}) as Record<
			string,
			unknown
		>;
		const summary = summarizeArguments(result.toolName, args);
		const serializedArgs = stringifyArguments(args);
		const turnNumber = context?.turnNumber ?? 0;
		const userPrompt = context?.userPrompt ?? "";

		outputs.push({
			id: result.toolCallId,
			toolName: result.toolName,
			arguments: args,
			result,
			timestamp: result.timestamp,
			summary,
			searchText: [
				result.toolName,
				summary,
				serializedArgs,
				userPrompt,
			].join(" "),
			turnNumber,
			totalTurns,
			toolIndexInTurn: context?.toolIndexInTurn ?? 0,
			toolCountInTurn: toolCountsByTurn.get(turnNumber) ?? 0,
			userPrompt,
		});
	}

	return outputs;
}

export function getToolOutputText(record: ToolOutputRecord): string {
	return record.result.content
		.map((block) =>
			block.type === "text"
				? block.text
				: `[Image: ${block.mimeType}]`,
		)
		.join("\n")
		.trimEnd();
}

export function formatToolArguments(record: ToolOutputRecord): string {
	if (
		record.toolName === "bash" &&
		typeof record.arguments.command === "string"
	) {
		return record.arguments.command;
	}
	try {
		return JSON.stringify(record.arguments, null, 2);
	} catch {
		return String(record.arguments);
	}
}

export function getFullOutputPath(
	record: ToolOutputRecord,
): string | undefined {
	const details = record.result.details;
	if (!details || typeof details !== "object") return undefined;
	const path = (details as Record<string, unknown>).fullOutputPath;
	return typeof path === "string" ? path : undefined;
}
