import type {
	Theme,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component } from "@earendil-works/pi-tui";
import {
	getCompactMetadata,
	getFallbackSemantic,
	getLiveFacts,
	getResultFacts,
	getTextOutput,
} from "./facts.ts";
import type { ToolSummaryStore } from "./store.ts";

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

function renderCompactText(options: {
	marker: string;
	markerColor: Parameters<Theme["fg"]>[0];
	summary: string;
	facts: readonly string[];
	errorTail?: string;
	theme: Theme;
}): string {
	const { theme } = options;
	let text = `${theme.fg(options.markerColor, options.marker)} ${theme.fg("text", options.summary)}`;
	if (options.facts.length > 0) {
		text += `\n  ${theme.fg("muted", options.facts.join(" · "))}`;
	}
	if (options.errorTail) {
		text += `\n  ${theme.fg("error", `last: ${options.errorTail}`)}`;
	}
	return text;
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
	result: AnyToolResult,
	options: { expanded: boolean; isPartial: boolean },
	theme: Theme,
	context: AnyRenderContext,
	original?: ToolDefinition<any, any, any>["renderResult"],
): Component {
	if (original) return original(result, options, theme, context);
	return new Text(theme.fg("toolOutput", getTextOutput(result.content)), 0, 0);
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
			if (context.expanded) {
				return renderExactCall(toolName, normalizedArgs, theme, context, originalCall);
			}
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
			if (options.expanded) {
				return renderExactResult(result, options, theme, context, originalResult);
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
			const value = renderCompactText({
				marker: context.isError ? "✗" : "✓",
				markerColor: context.isError ? "error" : "success",
				summary: context.isError ? semantic.failure : semantic.success,
				facts: observed.facts,
				errorTail: observed.errorTail,
				theme,
			});
			return updateText(context.lastComponent, value);
		},
	};
}
