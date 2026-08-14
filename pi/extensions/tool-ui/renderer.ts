import {
	getLanguageFromPath,
	highlightCode,
	keyHint,
	renderDiff,
	type Theme,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component } from "@earendil-works/pi-tui";
import {
	getCompactMetadata,
	getFallbackSemantic,
	getLiveFacts,
	getResultFacts,
	getTextOutput,
} from "./facts.ts";
import { paint } from "../shared/color-policy.ts";
import {
	CachedCompositeComponent,
	IndentedComponent,
} from "./indented-component.ts";
import { colorizeExpandedToolOutput } from "./output-color.ts";
import type { ToolSummaryStore } from "./store.ts";
import { ToolHeaderComponent, type ToolHeaderOptions } from "./tool-header.ts";
import type { ToolBatchInfo } from "./types.ts";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 120;
const MUTATION_PREVIEW_LINES = 6;
const COMPLETED_MARKER = "⏺";

type AnyRenderCall = NonNullable<ToolDefinition<any, any, any>["renderCall"]>;
type AnyRenderResult = NonNullable<ToolDefinition<any, any, any>["renderResult"]>;
type AnyRenderContext = Parameters<AnyRenderCall>[2];
type AnyToolResult = Parameters<AnyRenderResult>[0];

const EXPANDED_RESULT_CACHE = Symbol("compact-tool-ui-expanded-result");

interface ExpandedResultCache {
	args: Record<string, unknown>;
	content: AnyToolResult["content"];
	details: AnyToolResult["details"];
	isError: boolean;
	showImages: boolean;
	themeKey: string;
	component: Component;
}

function getThemeCacheKey(theme: Theme): string {
	return ["text", "muted", "dim", "success", "error", "warning", "toolOutput"]
		.map((color) => theme.getFgAnsi(color as Parameters<Theme["getFgAnsi"]>[0]))
		.join("|");
}

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

function formatRunningDuration(startedAt: number | undefined): string | undefined {
	if (startedAt === undefined) return undefined;
	const durationMs = Math.max(0, Date.now() - startedAt);
	if (durationMs < 10_000) return `${Math.max(0.1, durationMs / 1000).toFixed(1)}s`;
	return `${Math.round(durationMs / 1000)}s`;
}

function updateHeader(
	lastComponent: Component | undefined,
	options: ToolHeaderOptions,
): ToolHeaderComponent {
	const component =
		lastComponent instanceof ToolHeaderComponent
			? lastComponent
			: new ToolHeaderComponent(options);
	component.setOptions(options);
	return component;
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
		`${theme.fg("toolTitle", theme.bold(toolName))}\n${paint(theme, "primary", JSON.stringify(args, null, 2))}`,
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
	return new Text(paint(theme, "primary", getTextOutput(result.content)), 0, 0);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function mutationPreview(options: {
	toolName: string;
	args: Record<string, unknown>;
	result: AnyToolResult;
	theme: Theme;
}): Component | undefined {
	let content: string | undefined;
	if (options.toolName === "edit") {
		const diff = asRecord(options.result.details)?.diff;
		if (typeof diff !== "string" || !diff.trim()) return undefined;
		content = renderDiff(diff, {
			filePath: typeof options.args.path === "string" ? options.args.path : undefined,
		});
	} else if (options.toolName === "write") {
		const source = typeof options.args.content === "string" ? options.args.content : "";
		if (!source.trim()) return undefined;
		const normalized = source.replace(/\r\n?/g, "\n").replace(/\t/g, "   ");
		const path = typeof options.args.path === "string" ? options.args.path : undefined;
		const language = path ? getLanguageFromPath(path) : undefined;
		content = language
			? highlightCode(normalized, language).join("\n")
			: normalized
					.split("\n")
					.map((line) => paint(options.theme, "primary", line))
					.join("\n");
	} else {
		return undefined;
	}

	return new IndentedComponent(new Text(content, 0, 0), {
		indent: 4,
		maxLines: MUTATION_PREVIEW_LINES,
		overflowText: (remaining) =>
			options.theme.fg("dim", `… ${remaining} more lines (${keyHint("app.tools.expand", "to expand")})`),
	});
}

function nested(component: Component): Component {
	return new IndentedComponent(component, { indent: 4 });
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
	return new CachedCompositeComponent([
		new ToolHeaderComponent({
			toolName: options.toolName,
			args: options.args,
			status: options.started ? "running" : "pending",
			marker: options.started ? spinner(options.startedAt) : "○",
			markerColor: options.started ? "accent" : "dim",
			semanticSummary: options.summary,
			facts: withBatchFact(options.facts, options.batch),
			runningDuration: options.started
				? formatRunningDuration(options.startedAt)
				: undefined,
			cwd: options.context.cwd,
			theme: options.theme,
		}),
		nested(
			renderExactCall(
				options.toolName,
				options.args,
				options.theme,
				freshRenderContext(options.context),
				options.original,
			),
		),
	]);
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
	const exactContext = freshRenderContext(options.context);
	const children: Component[] = [
		new ToolHeaderComponent({
			toolName: options.toolName,
			args: options.args,
			status: options.isError ? "error" : "success",
			marker: COMPLETED_MARKER,
			markerColor: options.isError ? "error" : "success",
			semanticSummary: options.semanticSummary,
			facts: withBatchFact(options.facts, options.batch),
			errorTail: options.errorTail,
			summaryError: options.summaryError,
			cwd: options.context.cwd,
			theme: options.theme,
		}),
	];
	// The built-in edit call renderer recomputes a filesystem diff asynchronously.
	// Settled results already contain the authoritative diff, so rendering the call
	// again causes invalidation storms across every historical edit when Ctrl+O opens.
	if (options.toolName !== "edit") {
		children.push(
			nested(
				renderExactCall(
					options.toolName,
					options.args,
					options.theme,
					exactContext,
					options.originalCall,
				),
			),
		);
	}
	children.push(
		nested(
			renderExactResult(
				options.toolName,
				options.args,
				options.result,
				{ expanded: true, isPartial: false },
				options.theme,
				exactContext,
				options.originalResult,
			),
		),
	);
	return new CachedCompositeComponent(children);
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
			return updateHeader(context.lastComponent, {
				toolName,
				args: normalizedArgs,
				status: context.executionStarted ? "running" : "pending",
				marker: context.executionStarted ? spinner(state.startedAt) : "○",
				markerColor: context.executionStarted ? "accent" : "dim",
				semanticSummary: semantic.running,
				facts,
				runningDuration: context.executionStarted
					? formatRunningDuration(state.startedAt)
					: undefined,
				cwd: context.cwd,
				theme,
			});
		},
		renderResult(result, options, theme, context) {
			if (options.expanded && options.isPartial) {
				return nested(
					renderExactResult(
						toolName,
						asArgs(context.args),
						result,
						options,
						theme,
						freshRenderContext(context),
						originalResult,
					),
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
				const state = context.state as Record<PropertyKey, unknown>;
				const cached = state[EXPANDED_RESULT_CACHE] as
					| ExpandedResultCache
					| undefined;
				const themeKey = getThemeCacheKey(theme);
				if (
					cached?.args === normalizedArgs &&
					cached.content === result.content &&
					cached.details === result.details &&
					cached.isError === context.isError &&
					cached.showImages === context.showImages &&
					cached.themeKey === themeKey
				) {
					return cached.component;
				}
				const component = renderExpandedResult({
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
				state[EXPANDED_RESULT_CACHE] = {
					args: normalizedArgs,
					content: result.content,
					details: result.details,
					isError: context.isError,
					showImages: context.showImages,
					themeKey,
					component,
				} satisfies ExpandedResultCache;
				return component;
			}
			const headerOptions: ToolHeaderOptions = {
				toolName,
				args: normalizedArgs,
				status: context.isError ? "error" : "success",
				marker: COMPLETED_MARKER,
				markerColor: context.isError ? "error" : "success",
				semanticSummary,
				facts: observed.facts,
				errorTail: observed.errorTail,
				cwd: context.cwd,
				theme,
			};
			if (context.isError) return updateHeader(context.lastComponent, headerOptions);
			const preview = mutationPreview({
				toolName,
				args: normalizedArgs,
				result,
				theme,
			});
			if (!preview) return updateHeader(context.lastComponent, headerOptions);
			return new CachedCompositeComponent([
				new ToolHeaderComponent(headerOptions),
				preview,
			]);
		},
	};
}
