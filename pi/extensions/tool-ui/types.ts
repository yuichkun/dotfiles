import type { Usage } from "@earendil-works/pi-ai";

export const COMPACT_TOOL_UI_DETAILS_KEY = "__compactToolUi";
export const COMPACT_TOOL_UI_VERSION = 1;

export interface ToolSemanticSummary {
	running: string;
	success: string;
	failure: string;
}

export interface SummaryGeneratorInfo {
	provider: string;
	model: string;
	promptVersion: number;
}

export interface CompactToolUiMetadata {
	version: number;
	semantic: ToolSemanticSummary;
	facts: string[];
	errorTail?: string;
	durationMs?: number;
	generator?: SummaryGeneratorInfo;
	summaryError?: string;
}

export interface ToolSummaryBatchResult {
	summaries: Map<string, ToolSemanticSummary>;
	generator?: SummaryGeneratorInfo;
	usage?: Usage;
	error?: string;
}

export type ToolExecutionStatus = "pending" | "running" | "success" | "error";

export interface RuntimeToolState {
	toolName: string;
	args: Record<string, unknown>;
	status: ToolExecutionStatus;
	startedAt?: number;
	endedAt?: number;
	semantic?: ToolSemanticSummary;
	invalidate?: () => void;
	timer?: ReturnType<typeof setInterval>;
}
