import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { ToolCall, Usage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { parseSummaryResponse } from "./summary-format.ts";
import {
	type SummaryGeneratorInfo,
	type ToolSummaryBatchResult,
} from "./types.ts";

const PROMPT_VERSION = 4;
const SUMMARY_TIMEOUT_MS = 20_000;
const MAX_USER_GOAL_CHARS = 12_000;
const MAX_ASSISTANT_CONTEXT_CHARS = 12_000;
const MAX_CONVERSATION_CONTEXT_CHARS = 48_000;
const MAX_SERIALIZED_ARGS_CHARS = 24_000;
const MAX_CONTENT_PREVIEW_CHARS = 4_000;

const SYSTEM_PROMPT = `You generate compact semantic labels for coding-agent tool rows.

Return strict JSON only, with this exact shape:
{"summaries":[{"toolCallId":"...","running":"...","success":"...","failure":"..."}]}

Rules:
- Return one item for every supplied toolCallId, in the same order.
- Every label must answer both WHY this operation is needed and WHAT it is doing.
- Use the same language as the user's goal. Default to concise English when unclear.
- Do not merely restate the executable, tool name, path, command syntax, or generic action such as "run", "read", "search", or "check".
- Use the full recent conversation, current user goal, and assistant reasoning summary to infer the overarching task—not just the latest short message.
- Give sibling tools distinct labels that explain each tool's contribution to the shared goal.
- For shell commands, inspect the full command body and explain why that concrete command is being run. Never summarize it as only "node completed", "npx completed", or "git completed".
- running describes the operation in progress.
- success describes the operation after successful completion.
- failure describes the same operation after failure.
- In Japanese, prefer the purpose-action form 「〜するため、〜しています」. running should normally end in 「しています」, success in 「しました」, and failure in 「失敗しました」.
- Keep each label to one sentence, ideally under 100 Japanese characters or 20 English words. Clarity is more important than extreme brevity.
- Good Japanese example: 「fallback表示の原因を特定するため、Session内の要約metadataを集計しています」.
- Good Japanese example: 「変更後の型整合性を確認するため、Tool UIのstrict typecheckを実行しています」.
- Good Japanese example: 「削除予定と未コミット変更を確認するため、関連ファイルのgit statusを取得しています」.
- Bad Japanese examples: 「pythonが完了しました」, 「nodeが完了しました」, 「gitが完了しました」.
- Use available user goal and assistant context to make labels specific.
- Do not invent counts, test results, changed files, or success claims. The UI adds observed facts separately.
- Do not mention approval, permissions, risk, or safety.
- Do not wrap JSON in markdown fences.`;

interface NormalizedToolCall {
	toolCallId: string;
	toolName: string;
	arguments: unknown;
}

function truncate(value: string, limit: number): string {
	return value.length <= limit ? value : `${value.slice(0, limit)}\n…[truncated]`;
}

function truncateTail(value: string, limit: number): string {
	return value.length <= limit
		? value
		: `…[earlier context truncated]\n${value.slice(value.length - limit)}`;
}

function preview(value: unknown): unknown {
	if (typeof value !== "string") return value;
	return truncate(value, MAX_CONTENT_PREVIEW_CHARS);
}

function normalizeArguments(call: ToolCall): unknown {
	const args = call.arguments as Record<string, unknown>;
	if (call.name === "write") {
		const content = typeof args.content === "string" ? args.content : "";
		return {
			path: args.path,
			lineCount: content ? content.split("\n").length : 0,
			contentPreview: preview(content),
		};
	}
	if (call.name === "edit") {
		const edits = Array.isArray(args.edits) ? args.edits : [];
		return {
			path: args.path,
			edits: edits.map((edit) => {
				const record =
					edit && typeof edit === "object"
						? (edit as Record<string, unknown>)
						: {};
				return {
					oldTextPreview: preview(record.oldText),
					newTextPreview: preview(record.newText),
				};
			}),
		};
	}
	if (call.name === "bash") {
		return {
			command: truncate(
				typeof args.command === "string" ? args.command : "",
				MAX_SERIALIZED_ARGS_CHARS,
			),
			timeout: args.timeout,
		};
	}

	const serialized = JSON.stringify(args);
	if (serialized.length <= MAX_SERIALIZED_ARGS_CHARS) return args;
	return { serialized: truncate(serialized, MAX_SERIALIZED_ARGS_CHARS) };
}

function normalizeCalls(calls: readonly ToolCall[]): NormalizedToolCall[] {
	return calls.map((call) => ({
		toolCallId: call.id,
		toolName: call.name,
		arguments: normalizeArguments(call),
	}));
}

function extractText(response: {
	content: ReadonlyArray<{ type: string; text?: string }>;
}): string {
	return response.content
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text ?? "")
		.join("\n")
		.trim();
}

function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal {
	const available = signals.filter((signal): signal is AbortSignal => Boolean(signal));
	return available.length === 1 ? available[0]! : AbortSignal.any(available);
}

export async function summarizeToolCalls(options: {
	calls: readonly ToolCall[];
	userGoal: string;
	assistantContext: string;
	conversationContext: string;
	ctx: ExtensionContext;
	lifecycleSignal: AbortSignal;
}): Promise<ToolSummaryBatchResult> {
	const { calls, ctx } = options;
	const model = ctx.model;
	if (!model || calls.length === 0) {
		return { summaries: new Map(), error: "No active model" };
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) {
		return {
			summaries: new Map(),
			error: auth.ok ? "No API key for active model" : auth.error,
		};
	}

	const generator: SummaryGeneratorInfo = {
		provider: model.provider,
		model: model.id,
		promptVersion: PROMPT_VERSION,
	};
	const payload = {
		conversationContext: truncateTail(
			options.conversationContext,
			MAX_CONVERSATION_CONTEXT_CHARS,
		),
		currentUserGoal: truncate(options.userGoal, MAX_USER_GOAL_CHARS),
		currentAssistantContext: truncate(
			options.assistantContext,
			MAX_ASSISTANT_CONTEXT_CHARS,
		),
		tools: normalizeCalls(calls),
	};
	const timeoutSignal = AbortSignal.timeout(SUMMARY_TIMEOUT_MS);
	const signal = combineSignals([options.lifecycleSignal, ctx.signal, timeoutSignal]);

	try {
		const response = await completeSimple(
			model,
			{
				systemPrompt: SYSTEM_PROMPT,
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: JSON.stringify(payload) }],
						timestamp: Date.now(),
					},
				],
			},
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				env: auth.env,
				signal,
				reasoning: model.reasoning ? "minimal" : undefined,
				cacheRetention: "none",
			},
		);
		const text = extractText(response);
		const summaries = parseSummaryResponse(text, new Set(calls.map((call) => call.id)));
		return {
			summaries,
			generator,
			usage: response.usage as Usage,
			error:
				summaries.size === calls.length
					? undefined
					: `Summary model returned ${summaries.size}/${calls.length} tool labels`,
		};
	} catch (error) {
		return {
			summaries: new Map(),
			generator,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
