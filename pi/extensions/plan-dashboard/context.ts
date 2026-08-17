import {
	buildPlanViews,
	summarizeArchiveByPhase,
	summarizePlan,
} from "./plan.ts";
import type { PlanRuntimeState } from "./state.ts";

export type StalenessLevel = 0 | 1 | 2;

const MAX_ARCHIVE_PHASES_IN_CONTEXT = 8;

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
2. Create the dependency-aware plan directly for routine work. Call the plan tool with op="set" and baseRevision=0; no consultation is required.
3. Use op="consult" only when the task is genuinely difficult, ambiguous, or high-risk and independent advice would materially help. Pass only observed facts, constraints, and open questions—never a proposed solution. Fable is optional advice, not an approval authority. Do not consult when the user asks you not to.
4. If you consulted, critically evaluate the response and include its consultationId in set. Otherwise omit consultationId.
5. Use 5–15 meaningful steps when appropriate. Keep near-term steps detailed and distant steps coarser. Set at most one step to in_progress.
6. After the plan is saved, continue the task normally without an approval gate. Keep the plan current with the plan tool at step boundaries and whenever the structure changes.
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
	if (!state.enabled) return undefined;
	const pending = pendingRequestContext(state);
	if (pending) return pending;
	const plan = state.plan;
	if (!plan) return undefined;

	const views = buildPlanViews(plan);
	const summary = summarizePlan(views, plan.archivedSteps);
	const current = views.find((view) => view.status === "in_progress");
	const ready = views.filter((view) => view.status === "ready");
	const level = getStalenessLevel(
		state.workSinceUpdate,
		state.turnsSinceUpdate,
	);
	const lines = [
		"<living-plan>",
		`Plan ${plan.id} r${plan.revision}: ${plan.title}`,
		`Progress: ${summary.done + summary.superseded}/${summary.total} resolved${summary.archived > 0 ? ` (${summary.archived} compacted)` : ""}`,
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
		const frontier = views.filter(
			(view) => view.status !== "done" && view.status !== "superseded",
		);
		if (frontier.length > 0) {
			lines.push("Synchronize the active plan frontier with reality before continuing substantial work:");
			for (const view of frontier) {
				lines.push(
					`${statusGlyph(view.status)} ${view.step.id} [${view.status}] ${view.step.title} <- ${view.step.dependsOn.join(",") || "root"}`,
				);
			}
		} else {
			lines.push("No unresolved active steps remain.");
		}

		const archivePhases = summarizeArchiveByPhase(plan.archivedSteps);
		if (archivePhases.length > 0) {
			const visiblePhases = archivePhases.slice(
				0,
				MAX_ARCHIVE_PHASES_IN_CONTEXT,
			);
			const omittedPhases = archivePhases.slice(
				MAX_ARCHIVE_PHASES_IN_CONTEXT,
			);
			const archiveParts = visiblePhases.map(
				(phase) => `${phase.phase}: ${phase.done + phase.superseded}`,
			);
			if (omittedPhases.length > 0) {
				const omittedSteps = omittedPhases.reduce(
					(total, phase) => total + phase.done + phase.superseded,
					0,
				);
				const phaseNoun = omittedPhases.length === 1 ? "phase" : "phases";
				const stepNoun = omittedSteps === 1 ? "step" : "steps";
				archiveParts.push(
					`${omittedPhases.length} more ${phaseNoun} (${omittedSteps} ${stepNoun})`,
				);
			}
			lines.push(`Compacted history: ${archiveParts.join(", ")}.`);
		}

		const resolvedDetailOmitted = views.some(
			(view) => view.status === "done" || view.status === "superseded",
		);
		if (resolvedDetailOmitted || archivePhases.length > 0) {
			lines.push(
				"Use plan op=\"get\" if the complete current snapshot, including omitted resolved active steps and archive tombstones, is needed for replanning. Full compacted-step details remain in earlier plan tool results.",
			);
		}
	}

	lines.push(
		"Fable consultation is optional. Use plan op=\"consult\" only for genuinely difficult, ambiguous, or high-risk planning where independent advice materially helps. Do not consult for routine updates or when the user asks you not to; consultation is never an approval gate.",
		"Ask the user before removing or deferring a requested deliverable, relaxing acceptance criteria, contradicting a user decision, or rolling back completed work. Apply routine implementation and dependency changes without asking.",
		"Keep routine plan updates out of the prose response; briefly report only material structural changes.",
		"</living-plan>",
	);
	return lines.join("\n");
}
