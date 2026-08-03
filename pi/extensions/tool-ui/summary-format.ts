import type { ToolSemanticSummary } from "./types.ts";

function parseJsonObject(value: string): unknown {
	const trimmed = value
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "")
		.trim();
	try {
		return JSON.parse(trimmed);
	} catch {
		const start = trimmed.indexOf("{");
		const end = trimmed.lastIndexOf("}");
		if (start === -1 || end <= start) throw new Error("Summary model returned invalid JSON");
		return JSON.parse(trimmed.slice(start, end + 1));
	}
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

export function parseSummaryResponse(
	value: string,
	allowedToolCallIds: ReadonlySet<string>,
): Map<string, ToolSemanticSummary> {
	const parsed = parseJsonObject(value);
	if (!parsed || typeof parsed !== "object") throw new Error("Summary response must be an object");
	const summaries = (parsed as { summaries?: unknown }).summaries;
	if (!Array.isArray(summaries)) throw new Error("Summary response is missing summaries[]");

	const result = new Map<string, ToolSemanticSummary>();
	for (const item of summaries) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const toolCallId = record.toolCallId;
		if (
			!isNonEmptyString(toolCallId) ||
			!allowedToolCallIds.has(toolCallId) ||
			!isNonEmptyString(record.running) ||
			!isNonEmptyString(record.success) ||
			!isNonEmptyString(record.failure)
		) {
			continue;
		}
		result.set(toolCallId, {
			running: record.running.trim(),
			success: record.success.trim(),
			failure: record.failure.trim(),
		});
	}
	return result;
}
