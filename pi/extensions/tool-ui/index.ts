import type { ToolCall, Usage } from "@earendil-works/pi-ai";
import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type ExtensionAPI,
	type SessionEntry,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
	attachCompactMetadata,
	getFallbackSemantic,
	getResultFacts,
} from "./facts.ts";
import { withCompactRenderer } from "./renderer.ts";
import { ToolSummaryStore } from "./store.ts";
import { summarizeToolCalls } from "./summarizer.ts";
import {
	COMPACT_TOOL_UI_VERSION,
	type ToolSummaryBatchResult,
} from "./types.ts";

interface SummaryBatchHandle {
	promise: Promise<ToolSummaryBatchResult>;
	chargeToolCallId: string;
	usageCharged: boolean;
}

function getMessageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter(
			(block) =>
				block &&
				typeof block === "object" &&
				(block as { type?: unknown }).type === "text" &&
				typeof (block as { text?: unknown }).text === "string",
		)
		.map((block) => (block as { text: string }).text)
		.join("\n")
		.trim();
}

function getAssistantContext(content: unknown): string {
	if (!Array.isArray(content)) return getMessageText(content);
	return content
		.filter(
			(block) =>
				block &&
				typeof block === "object" &&
				((block as { type?: unknown }).type === "text" ||
					(block as { type?: unknown }).type === "thinking"),
		)
		.map((block) => {
			const record = block as { type: string; text?: string; thinking?: string };
			return record.type === "thinking" ? (record.thinking ?? "") : (record.text ?? "");
		})
		.filter(Boolean)
		.join("\n")
		.trim();
}

function buildConversationContext(entries: readonly SessionEntry[]): string {
	const sections: string[] = [];
	for (const entry of entries) {
		if (entry.type !== "message") continue;
		if (entry.message.role === "user") {
			const text = getMessageText(entry.message.content);
			if (text) sections.push(`User:\n${text}`);
			continue;
		}
		if (entry.message.role === "assistant") {
			const context = getAssistantContext(entry.message.content);
			if (context) sections.push(`Assistant context:\n${context}`);
		}
	}
	return sections.join("\n\n");
}

function getToolCalls(content: unknown): ToolCall[] {
	if (!Array.isArray(content)) return [];
	return content.filter(
		(block): block is ToolCall =>
			Boolean(
				block &&
					typeof block === "object" &&
					(block as { type?: unknown }).type === "toolCall" &&
					typeof (block as { id?: unknown }).id === "string" &&
					typeof (block as { name?: unknown }).name === "string",
			),
	);
}

function addUsage(left: Usage | undefined, right: Usage | undefined): Usage | undefined {
	if (!left) return right;
	if (!right) return left;
	return {
		input: left.input + right.input,
		output: left.output + right.output,
		cacheRead: left.cacheRead + right.cacheRead,
		cacheWrite: left.cacheWrite + right.cacheWrite,
		cacheWrite1h: (left.cacheWrite1h ?? 0) + (right.cacheWrite1h ?? 0) || undefined,
		reasoning: (left.reasoning ?? 0) + (right.reasoning ?? 0) || undefined,
		totalTokens: left.totalTokens + right.totalTokens,
		cost: {
			input: left.cost.input + right.cost.input,
			output: left.cost.output + right.cost.output,
			cacheRead: left.cost.cacheRead + right.cost.cacheRead,
			cacheWrite: left.cost.cacheWrite + right.cost.cacheWrite,
			total: left.cost.total + right.cost.total,
		},
	};
}

function createBuiltInDefinitions(cwd: string): ToolDefinition<any, any, any>[] {
	return [
		createReadToolDefinition(cwd),
		createBashToolDefinition(cwd),
		createEditToolDefinition(cwd),
		createWriteToolDefinition(cwd),
		createGrepToolDefinition(cwd),
		createFindToolDefinition(cwd),
		createLsToolDefinition(cwd),
	];
}

export default function compactToolUiExtension(pi: ExtensionAPI): void {
	const store = new ToolSummaryStore();
	const lifecycleController = new AbortController();
	const batchesByToolCallId = new Map<string, SummaryBatchHandle>();
	let lastUserGoal = "";

	for (const definition of createBuiltInDefinitions(process.cwd())) {
		pi.registerTool(withCompactRenderer(definition, store));
	}

	pi.on("message_end", (event, ctx) => {
		if (event.message.role === "user") {
			lastUserGoal = getMessageText(event.message.content);
			return;
		}
		if (event.message.role !== "assistant") return;

		const calls = getToolCalls(event.message.content);
		if (calls.length === 0) return;
		for (const call of calls) {
			store.ensure(call.id, call.name, call.arguments);
		}

		const promise = summarizeToolCalls({
			calls,
			userGoal: lastUserGoal,
			assistantContext: getAssistantContext(event.message.content),
			conversationContext: buildConversationContext(ctx.sessionManager.getBranch()),
			ctx,
			lifecycleSignal: lifecycleController.signal,
		}).then((result) => {
			for (const call of calls) {
				const semantic = result.summaries.get(call.id);
				if (semantic) store.setSemantic(call.id, semantic);
			}
			return result;
		});
		const handle: SummaryBatchHandle = {
			promise,
			chargeToolCallId: calls[0]!.id,
			usageCharged: false,
		};
		for (const call of calls) batchesByToolCallId.set(call.id, handle);
	});

	pi.on("tool_execution_start", (event) => {
		store.start(event.toolCallId, event.toolName, event.args);
	});

	pi.on("tool_result", async (event) => {
		const resultReceivedAt = Date.now();
		const durationMs = store.getDurationMs(event.toolCallId, resultReceivedAt);
		const handle = batchesByToolCallId.get(event.toolCallId);
		const batch = handle ? await handle.promise : undefined;
		const runtime = store.ensure(event.toolCallId, event.toolName, event.input);
		const semantic = runtime.semantic ?? getFallbackSemantic(event.toolName, event.input);
		const observed = getResultFacts({
			toolName: event.toolName,
			args: event.input,
			content: event.content,
			details: event.details,
			isError: event.isError,
			durationMs,
		});
		const metadata = {
			version: COMPACT_TOOL_UI_VERSION,
			semantic,
			facts: observed.facts,
			errorTail: observed.errorTail,
			durationMs,
			generator: batch?.summaries.has(event.toolCallId) ? batch.generator : undefined,
			summaryError: batch?.summaries.has(event.toolCallId) ? undefined : batch?.error,
		};

		let usage = event.usage;
		if (
			handle &&
			!handle.usageCharged &&
			handle.chargeToolCallId === event.toolCallId
		) {
			handle.usageCharged = true;
			usage = addUsage(usage, batch?.usage);
		}

		return {
			details: attachCompactMetadata(event.details, metadata),
			usage,
		};
	});

	pi.on("tool_execution_end", (event) => {
		store.finish(event.toolCallId, event.isError);
		store.release(event.toolCallId);
		batchesByToolCallId.delete(event.toolCallId);
	});

	pi.on("session_shutdown", () => {
		lifecycleController.abort();
		store.clear();
		batchesByToolCallId.clear();
	});
}
