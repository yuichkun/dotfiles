import { buildPlanViews, summarizePlan } from "./plan.ts";
import type { PlanRuntimeState } from "./state.ts";

export type StalenessLevel = 0 | 1 | 2;

export function getStalenessLevel(
	workSinceUpdate: number,
	turnsSinceUpdate: number,
): StalenessLevel {
	if (workSinceUpdate >= 12 || turnsSinceUpdate >= 8) return 2;
	if (workSinceUpdate >= 5 || turnsSinceUpdate >= 4) return 1;
	return 0;
}

function pendingRequestContext(state: Readonly<PlanRuntimeState>): string | undefined {
	const request = state.request;
	if (!request || state.plan?.requestId === request.id) return undefined;
	return `<plan-workflow>
The user explicitly invoked /plan for the request below. Complete this one-shot planning workflow; this is not a persistent mode.

Request ID: ${request.id}
Raw request:
${request.task}

1. Investigate the request and codebase before implementation. Read-only investigation and necessary commands are allowed.
2. Before forming a candidate plan, call the plan tool with op="consult", requestId="${request.id}", and only observed facts, constraints, and open questions. Do not pass a proposed solution or desired conclusion.
3. Critically evaluate the independent Fable response, then call the plan tool with op="set", baseRevision=0, the returned consultationId, and the complete dependency-aware plan.
4. Use 5–15 meaningful steps when appropriate. Keep near-term steps detailed and distant steps coarser. Set at most one step to in_progress.
5. After the plan is saved, continue the task normally without an approval gate. Keep the plan current with the plan tool at step boundaries and whenever the structure changes.
</plan-workflow>`;
}

function statusGlyph(status: string): string {
	switch (status) {
		case "in_progress":
			return "▶";
		case "done":
			return "✔";
		case "superseded":
			return "⊘";
		case "ready":
			return "●";
		default:
			return "○";
	}
}

export function buildPlanContext(
	state: Readonly<PlanRuntimeState>,
): string | undefined {
	const pending = pendingRequestContext(state);
	if (pending) return pending;
	const plan = state.plan;
	if (!plan) return undefined;

	const views = buildPlanViews(plan);
	const summary = summarizePlan(views);
	const current = views.find((view) => view.status === "in_progress");
	const ready = views.filter((view) => view.status === "ready");
	const level = getStalenessLevel(
		state.workSinceUpdate,
		state.turnsSinceUpdate,
	);
	const lines = [
		"<living-plan>",
		`Plan ${plan.id} r${plan.revision}: ${plan.title}`,
		`Progress: ${summary.done + summary.superseded}/${summary.total} resolved`,
		current
			? `Current: ${current.step.id} — ${current.step.title}`
			: ready[0]
				? `Current: none; next ready: ${ready[0].step.id} — ${ready[0].step.title}`
				: "Current: complete",
		`Ready: ${ready.map((view) => view.step.id).join(", ") || "none"}`,
	];

	if (level >= 1) {
		lines.push(
			`The plan has not been updated for ${state.workSinceUpdate} successful work tool calls and ${state.turnsSinceUpdate} turns. If progress changed, call plan op="progress"; if assumptions, steps, or dependencies changed, inspect with plan op="get" when needed and call plan op="set" with baseRevision=${plan.revision}.`,
		);
	} else {
		lines.push(
			`At a step boundary use plan op="progress". When assumptions, steps, ordering, or dependencies change, inspect with plan op="get" if the complete snapshot is no longer in context, then use plan op="set" with baseRevision=${plan.revision}. Do not wait for the user to request synchronization.`,
		);
	}

	if (level >= 2) {
		lines.push("Synchronize the plan with reality before continuing substantial work:");
		for (const view of views) {
			lines.push(
				`${statusGlyph(view.status)} ${view.step.id} [${view.status}] ${view.step.title} <- ${view.step.dependsOn.join(",") || "root"}`,
			);
		}
	}

	lines.push(
		"Re-consult with plan op=\"consult\" before a structural replan that reinterprets the goal or acceptance criteria, reverses completed work, or changes the critical path.",
		"Ask the user before removing or deferring a requested deliverable, relaxing acceptance criteria, contradicting a user decision, or rolling back completed work. Apply routine implementation and dependency changes without asking.",
		"Keep routine plan updates out of the prose response; briefly report only material structural changes.",
		"</living-plan>",
	);
	return lines.join("\n");
}
