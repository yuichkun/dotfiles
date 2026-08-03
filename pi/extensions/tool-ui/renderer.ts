import type {
	Theme,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text, type Component } from "@earendil-works/pi-tui";
import {
	getCompactMetadata,
	getFallbackSemantic,
	getLiveFacts,
	getResultFacts,
	getTextOutput,
} from "./facts.ts";
import { colorizeExpandedToolOutput } from "./output-color.ts";
import type { ToolSummaryStore } from "./store.ts";
import type { ToolBatchInfo } from "./types.ts";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 120;

type AnyRenderCall = NonNullable<ToolDefinition<any, any, any>["renderCall"]>;
type AnyRenderResult = NonNullable<ToolDefinition<any, any, any>["renderResult"]>;
type AnyRenderContext = Parameters<AnyRenderCall>[2];
type AnyToolResult = Parameters<AnyRenderResult>[0];

function asArgs(value: unknown): Record<string, unknown> {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

function updateText(lastComponent: Component | undefined, value: string): Text {
	const component = lastComponent instanceof Text ? lastComponent : new Text("", 0, 0);
	component.setText(value);
	return component;
}

function spinner(startedAt: number | undefined): string {
	const elapsed = Math.max(0, Date.now() - (startedAt ?? Date.now()));
	return SPINNER_FRAMES[Math.floor(elapsed / SPINNER_INTERVAL_MS) % SPINNER_FRAMES.length]!;
}

function renderFact(fact: string, index: number, theme: Theme): string {
	if (index === 0) return theme.bold(theme.fg("accent", fact));

	const diff = fact.match(/^\+(\d+)\s*\/\s*-(\d+)$/);
	if (diff) {
		return `${theme.fg("toolDiffAdded", `+${diff[1]}`)} ${theme.fg("dim", "/")} ${theme.fg("toolDiffRemoved", `-${diff[2]}`)}`;
	}
	const tests = fact.match(/^(\d+ passed)\s*\/\s*(\d+ failed)$/i);
	if (tests) {
		return `${theme.fg("success", tests[1]!)} ${theme.fg("dim", "/")} ${theme.fg("error", tests[2]!)}`;
	}
	const running = fact.match(/^running\s+(.+)$/i);
	if (running) {
		return `${theme.fg("warning", "running")} ${theme.fg("dim", running[1]!)}`;
	}
	if (/^\d+(?:\.\d+)?s$/.test(fact) || /^batch call \d+\/\d+$/.test(fact)) {
		return theme.fg("dim", fact);
	}
	if (/\b(?:failed|error|exit|fatal)\b/i.test(fact)) return theme.fg("error", fact);
	if (/\b(?:passed|passing|success)\b/i.test(fact)) return theme.fg("success", fact);
	if (/\b(?:truncated|warning|no matches|summarizing)\b/i.test(fact)) {
		return theme.fg("warning", fact);
	}
	if (/^“.*”$/.test(fact)) return theme.fg("warning", fact);
	if (fact.startsWith("~") || fact.startsWith("/") || fact.includes("/") || /\.[A-Za-z0-9]+(?::\d+(?:-\d+)?)?$/.test(fact)) {
		return theme.fg("accent", fact);
	}
	return theme.fg("text", fact);
}

function renderFacts(facts: readonly string[], theme: Theme): string {
	const visibleFacts = facts.filter((fact) => fact !== "completed");
	return visibleFacts
		.map((fact, index) => renderFact(fact, index, theme))
		.join(theme.fg("dim", " · "));
}

function renderCompactText(options: {
	marker: string;
	markerColor: Parameters<Theme["fg"]>[0];
	summary: string;
	facts: readonly string[];
	errorTail?: string;
	summaryError?: string;
	theme: Theme;
}): string {
	const { theme } = options;
	let text = `${theme.fg(options.markerColor, options.marker)} ${theme.fg("text", options.summary)}`;
	const facts = renderFacts(options.facts, theme);
	if (facts) {
		text += `\n  ${facts}`;
	}
	if (options.errorTail) {
		text += `\n  ${theme.fg("error", `last: ${options.errorTail}`)}`;
	}
	if (options.summaryError) {
		const reason = options.summaryError.replace(/\s+/g, " ").trim().slice(0, 180);
		text += `\n  ${theme.fg("warning", `⚠ summary fallback: ${reason}`)}`;
	}
	return text;
}

function withBatchFact(facts: readonly string[], batch: ToolBatchInfo | undefined): string[] {
	const expandedFacts = [...facts];
	if (batch && batch.size > 1) {
		expandedFacts.push(`batch call ${batch.index}/${batch.size}`);
	}
	return expandedFacts;
}

function freshRenderContext(context: AnyRenderContext): AnyRenderContext {
	return { ...context, lastComponent: undefined };
}

function renderExactCall(
	toolName: string,
	args: Record<string, unknown>,
	theme: Theme,
	context: AnyRenderContext,
	original?: ToolDefinition<any, any, any>["renderCall"],
): Component {
	if (original) return original(args, theme, context);
	return new Text(
		`${theme.fg("toolTitle", theme.bold(toolName))}\n${theme.fg("toolOutput", JSON.stringify(args, null, 2))}`,
		0,
		0,
	);
}

function renderExactResult(
	toolName: string,
	args: Record<string, unknown>,
	result: AnyToolResult,
	options: { expanded: boolean; isPartial: boolean },
	theme: Theme,
	context: AnyRenderContext,
	original?: ToolDefinition<any, any, any>["renderResult"],
): Component {
	if (options.expanded) {
		const colored = colorizeExpandedToolOutput({
			toolName,
			args,
			content: result.content,
			theme,
		});
		if (colored !== undefined) return new Text(colored, 0, 0);
	}
	if (original) return original(result, options, theme, context);
	return new Text(theme.fg("text", getTextOutput(result.content)), 0, 0);
}

function renderExpandedCall(options: {
	toolName: string;
	args: Record<string, unknown>;
	summary: string;
	facts: readonly string[];
	started: boolean;
	startedAt?: number;
	batch?: ToolBatchInfo;
	theme: Theme;
	context: AnyRenderContext;
	original?: ToolDefinition<any, any, any>["renderCall"];
}): Component {
	const container = new Container();
	container.addChild(
		new Text(
			renderCompactText({
				marker: options.started ? spinner(options.startedAt) : "○",
				markerColor: options.started ? "accent" : "dim",
				summary: options.summary,
				facts: withBatchFact(options.facts, options.batch),
				theme: options.theme,
			}),
			0,
			0,
		),
	);
	container.addChild(new Spacer(1));
	container.addChild(
		renderExactCall(
			options.toolName,
			options.args,
			options.theme,
			freshRenderContext(options.context),
			options.original,
		),
	);
	return container;
}

function renderExpandedResult(options: {
	toolName: string;
	args: Record<string, unknown>;
	result: AnyToolResult;
	semanticSummary: string;
	facts: readonly string[];
	errorTail?: string;
	summaryError?: string;
	batch?: ToolBatchInfo;
	isError: boolean;
	theme: Theme;
	context: AnyRenderContext;
	originalCall?: ToolDefinition<any, any, any>["renderCall"];
	originalResult?: ToolDefinition<any, any, any>["renderResult"];
}): Component {
	const container = new Container();
	container.addChild(
		new Text(
			renderCompactText({
				marker: options.isError ? "✗" : "✓",
				markerColor: options.isError ? "error" : "success",
				summary: options.semanticSummary,
				facts: withBatchFact(options.facts, options.batch),
				errorTail: options.errorTail,
				summaryError: options.summaryError,
				theme: options.theme,
			}),
			0,
			0,
		),
	);
	container.addChild(new Spacer(1));
	const exactContext = freshRenderContext(options.context);
	container.addChild(
		renderExactCall(
			options.toolName,
			options.args,
			options.theme,
			exactContext,
			options.originalCall,
		),
	);
	container.addChild(
		renderExactResult(
			options.toolName,
			options.args,
			options.result,
			{ expanded: true, isPartial: false },
			options.theme,
			exactContext,
			options.originalResult,
		),
	);
	return container;
}

export function withCompactRenderer(
	definition: ToolDefinition<any, any, any>,
	store: ToolSummaryStore,
): ToolDefinition<any, any, any> {
	const originalCall = definition.renderCall;
	const originalResult = definition.renderResult;
	const toolName = definition.name;

	return {
		...definition,
		renderShell: "self",
		renderCall(args, theme, context) {
			const normalizedArgs = asArgs(args);
			if (!context.isPartial) {
				return updateText(context.lastComponent, "");
			}

			const state = store.ensure(context.toolCallId, toolName, normalizedArgs);
			store.bindInvalidator(context.toolCallId, context.invalidate);
			const semantic = state.semantic ?? getFallbackSemantic(toolName, normalizedArgs);
			const facts = getLiveFacts(
				toolName,
				normalizedArgs,
				store.getDurationMs(context.toolCallId),
			);
			if (!state.semantic) facts.push("summarizing…");
			if (context.expanded) {
				return renderExpandedCall({
					toolName,
					args: normalizedArgs,
					summary: semantic.running,
					facts,
					started: context.executionStarted,
					startedAt: state.startedAt,
					batch: state.batch,
					theme,
					context,
					original: originalCall,
				});
			}
			const value = renderCompactText({
				marker: context.executionStarted ? spinner(state.startedAt) : "○",
				markerColor: context.executionStarted ? "accent" : "dim",
				summary: semantic.running,
				facts,
				theme,
			});
			return updateText(context.lastComponent, value);
		},
		renderResult(result, options, theme, context) {
			if (options.expanded && options.isPartial) {
				return renderExactResult(
					toolName,
					asArgs(context.args),
					result,
					options,
					theme,
					freshRenderContext(context),
					originalResult,
				);
			}
			if (options.isPartial) {
				return updateText(context.lastComponent, "");
			}

			const normalizedArgs = asArgs(context.args);
			const runtime = store.get(context.toolCallId);
			const persisted = getCompactMetadata(result.details);
			const semantic =
				persisted?.semantic ??
				runtime?.semantic ??
				getFallbackSemantic(toolName, normalizedArgs);
			const observed = persisted
				? { facts: persisted.facts, errorTail: persisted.errorTail }
				: getResultFacts({
						toolName,
						args: normalizedArgs,
						content: result.content,
						details: result.details,
						isError: context.isError,
						durationMs: store.getDurationMs(context.toolCallId),
					});
			const semanticSummary = context.isError ? semantic.failure : semantic.success;
			if (options.expanded) {
				return renderExpandedResult({
					toolName,
					args: normalizedArgs,
					result,
					semanticSummary,
					facts: observed.facts,
					errorTail: observed.errorTail,
					summaryError: persisted?.summaryError,
					batch: persisted?.batch ?? runtime?.batch,
					isError: context.isError,
					theme,
					context,
					originalCall,
					originalResult,
				});
			}
			const value = renderCompactText({
				marker: context.isError ? "✗" : "✓",
				markerColor: context.isError ? "error" : "success",
				summary: semanticSummary,
				facts: observed.facts,
				errorTail: observed.errorTail,
				theme,
			});
			return updateText(context.lastComponent, value);
		},
	};
}
