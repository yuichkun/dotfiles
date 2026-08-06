import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ObservedFact, PlanRequest } from "./state.ts";

const FABLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_ADVISOR_PROMPT_BYTES = 180_000;

export interface AdvisorPacket {
	request: PlanRequest;
	facts: readonly ObservedFact[];
	constraints: readonly string[];
	openQuestions: readonly string[];
}

function renderList(items: readonly string[], emptyLabel: string): string {
	if (items.length === 0) return `- ${emptyLabel}`;
	return items.map((item) => `- ${item}`).join("\n");
}

export function buildAdvisorPrompt(packet: AdvisorPacket): string {
	const facts = packet.facts.map(
		(fact) => `- ${fact.statement}\n  Source: ${fact.source}`,
	);
	return `You are an independent planning adviser for a coding task.

Evaluate the raw request and observed facts below from first principles. No candidate plan or preferred implementation from the working agent is included. Do not infer that any unstated approach is desired.

Return practical advice for the working agent to consider before it creates the plan:
1. Clarify the intended outcome and important constraints.
2. Identify missing facts, risky assumptions, and user-owned decisions.
3. Recommend a dependency-aware implementation and verification sequence.
4. Point out likely ways the plan could drift from the original request.
5. Distinguish verified facts from your recommendations.

## Raw user request (verbatim)

<request>
${packet.request.task}
</request>

## Observed facts

${facts.length > 0 ? facts.join("\n") : "- No facts recorded yet."}

## Constraints

${renderList(packet.constraints, "No additional constraints recorded.")}

## Open questions

${renderList(packet.openQuestions, "No open questions recorded.")}
`;
}

export async function consultFable(
	pi: ExtensionAPI,
	packet: AdvisorPacket,
	signal?: AbortSignal,
): Promise<string> {
	const prompt = buildAdvisorPrompt(packet);
	if (Buffer.byteLength(prompt, "utf8") > MAX_ADVISOR_PROMPT_BYTES) {
		throw new Error(
			`Fable consultation packet exceeds ${MAX_ADVISOR_PROMPT_BYTES} bytes`,
		);
	}
	const result = await pi.exec(
		"claude",
		[
			"-p",
			"--model",
			"fable",
			"--effort",
			"max",
			"--safe-mode",
			"--tools",
			"",
			"--no-session-persistence",
			prompt,
		],
		{ signal, timeout: FABLE_TIMEOUT_MS },
	);
	const response = result.stdout.trim();
	if (result.code !== 0 || result.killed || !response) {
		const detail = result.killed
			? "Claude was aborted or exceeded the 30-minute timeout"
			: result.stderr.trim() || "Claude returned no response";
		throw new Error(`Fable consultation failed: ${detail.slice(0, 1000)}`);
	}
	return response;
}
