import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { paint } from "../shared/color-policy.ts";
import { consultFable } from "./advisor.ts";
import {
	applyPlanProgress,
	buildPlanViews,
	compactPlan,
	createOrRevisePlan,
	summarizePlan,
	type CompactPlanInput,
	type PlanStepInput,
	type ProgressPlanInput,
	type SetPlanInput,
} from "./plan.ts";
import {
	PLAN_TOOL_NAME,
	type PlanConsultation,
	type PlanRuntime,
	type PlanToolDetails,
	type ObservedFact,
} from "./state.ts";

const NonEmptyString = Type.String({ minLength: 1 });
const StepStatusSchema = Type.Union([
	Type.Literal("pending"),
	Type.Literal("in_progress"),
	Type.Literal("done"),
	Type.Literal("superseded"),
]);
const StringList = Type.Array(NonEmptyString, { maxItems: 30 });
const RequiredStringList = Type.Array(NonEmptyString, {
	minItems: 1,
	maxItems: 30,
});
const StepSchema = Type.Object(
	{
		id: Type.String({
			minLength: 1,
			maxLength: 32,
			pattern: "^[A-Za-z][A-Za-z0-9_-]*$",
			description: "Stable ID such as S01; never renumber or reuse an ID",
		}),
		phase: Type.String({ minLength: 1, maxLength: 80 }),
		title: Type.String({ minLength: 1, maxLength: 240 }),
		shortTitle: Type.String({ minLength: 1, maxLength: 40 }),
		goal: NonEmptyString,
		work: RequiredStringList,
		acceptance: RequiredStringList,
		dependsOn: Type.Array(Type.String({ minLength: 1, maxLength: 32 }), {
			maxItems: 30,
		}),
		relatedFiles: StringList,
		status: StepStatusSchema,
	},
	{ additionalProperties: false },
);
const FactSchema = Type.Object(
	{
		statement: NonEmptyString,
		source: NonEmptyString,
	},
	{ additionalProperties: false },
);

const PlanToolParameters = Type.Union([
	Type.Object(
		{ op: Type.Literal("get") },
		{ additionalProperties: false },
	),
	Type.Object(
		{
			op: Type.Literal("consult"),
			requestId: NonEmptyString,
			facts: Type.Array(FactSchema, { maxItems: 100 }),
			constraints: StringList,
			openQuestions: StringList,
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			op: Type.Literal("set"),
			baseRevision: Type.Integer({ minimum: 0 }),
			consultationId: Type.Optional(NonEmptyString),
			title: Type.String({ minLength: 1, maxLength: 240 }),
			objective: NonEmptyString,
			reason: NonEmptyString,
			steps: Type.Array(StepSchema, { minItems: 1, maxItems: 50 }),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			op: Type.Literal("progress"),
			baseRevision: Type.Integer({ minimum: 1 }),
			done: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
			start: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
			note: NonEmptyString,
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			op: Type.Literal("compact"),
			baseRevision: Type.Integer({ minimum: 1 }),
			note: NonEmptyString,
		},
		{ additionalProperties: false },
	),
]);

function normalizeRequired(value: string, label: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`${label} must not be empty`);
	return normalized;
}

function normalizeList(values: readonly string[], label: string): string[] {
	return values.map((value, index) =>
		normalizeRequired(value, `${label}[${index}]`),
	);
}

function normalizeFact(fact: ObservedFact, index: number): ObservedFact {
	return {
		statement: normalizeRequired(fact.statement, `facts[${index}].statement`),
		source: normalizeRequired(fact.source, `facts[${index}].source`),
	};
}

function compactPlanResult(
	plan: ReturnType<PlanRuntime["getPlan"]>,
	compactedSteps: readonly PlanStepInput[] = [],
): string {
	if (!plan) return "Plan unavailable";
	const views = buildPlanViews(plan);
	const summary = summarizePlan(views, plan.archivedSteps);
	const current = views.find((view) => view.status === "in_progress");
	const ready = views.filter((view) => view.status === "ready");
	return [
		`Plan r${plan.revision} saved: ${plan.title}`,
		current
			? `Current: ${current.step.id} — ${current.step.title}`
			: "Current: none",
		`Ready: ${ready.map((view) => view.step.id).join(", ") || "none"}`,
		`Active: ${summary.active}; compacted: ${summary.archived}`,
		...(compactedSteps.length > 0
			? [`Compacted now: ${compactedSteps.map((step) => step.id).join(", ")}`]
			: []),
	].join("\n");
}

export function registerPlanTool(
	pi: ExtensionAPI,
	runtime: PlanRuntime,
): void {
	pi.registerTool<typeof PlanToolParameters, PlanToolDetails>({
		name: PLAN_TOOL_NAME,
		label: "Plan",
		description:
			"Create and maintain the living plan explicitly requested with /plan. Do not create a plan unless a /plan request is pending. Consultation is optional: use consult only for genuinely difficult, ambiguous, or high-risk planning where independent Fable advice materially helps; never treat it as an approval gate. get returns the complete current snapshot; set creates or fully replaces the active structure (omitted existing steps become superseded); progress atomically completes the current step and/or starts a ready step; compact archives every resolved active step while retaining dependency tombstones. Large mutations may also compact automatically. Archived step IDs must not be reintroduced by set; use get after compaction when the active snapshot is unclear.",
		promptSnippet:
			"Create and update an explicitly requested living plan",
		promptGuidelines: [
			"Use plan only when a /plan workflow is pending or a living plan already exists; never create a plan automatically for an ordinary session.",
			"Fable consultation is optional. Use consult only for genuinely difficult, ambiguous, or high-risk planning; do not consult for routine work or when the user asks you not to.",
			"When a living plan exists, use plan at step boundaries and revise it proactively when reality changes instead of waiting for the user to ask.",
			"After plan compaction, never include archived step IDs in a later plan set operation; use plan get first when the active snapshot is unclear.",
			"Before changing a living plan in a way that removes or defers a requested deliverable, relaxes acceptance criteria, contradicts a user decision, or rolls back completed work, ask the user; routine implementation and dependency changes do not need confirmation.",
		],
		parameters: PlanToolParameters,
		executionMode: "sequential",
		renderShell: "self",
		async execute(_toolCallId, params, signal, _onUpdate) {
			switch (params.op) {
				case "get": {
					const plan = runtime.getPlan();
					if (!plan) {
						throw new Error("No living plan exists on the current session branch");
					}
					return {
						content: [
							{
								type: "text",
								text: `Complete living plan snapshot:\n\n${JSON.stringify(plan, null, 2)}`,
							},
						],
						details: { kind: "inspection", plan },
					};
				}
				case "consult": {
					const request = runtime.getState().request;
					if (!request || request.id !== params.requestId) {
						throw new Error(
							`Unknown plan request ${params.requestId}. Invoke /plan with the task first.`,
						);
					}
					const facts = params.facts.map(normalizeFact);
					const constraints = normalizeList(params.constraints, "constraints");
					const openQuestions = normalizeList(
						params.openQuestions,
						"openQuestions",
					);
					const response = await consultFable(
						pi,
						{
							request,
							facts,
							constraints,
							openQuestions,
						},
						signal,
					);
					const consultation: PlanConsultation = {
						schemaVersion: 1,
						id: randomUUID(),
						requestId: request.id,
						model: "fable",
						effort: "max",
						facts,
						constraints,
						openQuestions,
						response,
						createdAt: new Date().toISOString(),
					};
					runtime.applyConsultation(consultation);
					return {
						content: [
							{
								type: "text",
								text: `Independent Fable consultation ${consultation.id}:\n\n${response}\n\nCritically evaluate this advice, then create or revise the plan with op=\"set\" and consultationId=\"${consultation.id}\".`,
							},
						],
						details: { kind: "consultation", consultation },
					};
				}
				case "set": {
					const current = runtime.getPlan();
					const request = runtime.getState().request;
					if (!request) {
						throw new Error("No /plan request exists in this session branch");
					}
					if (current && current.requestId !== request.id) {
						throw new Error(
							"The current plan and latest /plan request belong to different branch histories",
						);
					}
					const consultationId =
						params.consultationId ?? current?.consultationId;
					if (consultationId) {
						const consultation = runtime.getConsultation(consultationId);
						if (!consultation || consultation.requestId !== request.id) {
							throw new Error(
								`Consultation ${consultationId} is unavailable on the current session branch`,
							);
						}
					}
					const input: SetPlanInput = {
						baseRevision: params.baseRevision,
						title: params.title,
						objective: params.objective,
						reason: params.reason,
						steps: params.steps as readonly PlanStepInput[],
					};
					const mutation = createOrRevisePlan({
						current,
						input,
						requestId: request.id,
						request: request.task,
						consultationId,
						now: new Date().toISOString(),
						createId: randomUUID,
					});
					runtime.applyPlan(mutation.plan);
					return {
						content: [{
							type: "text",
							text: compactPlanResult(mutation.plan, mutation.compactedSteps),
						}],
						details: {
							kind: "plan",
							operation: "set",
							plan: mutation.plan,
							...(mutation.compactedSteps.length > 0
								? { compactedSteps: mutation.compactedSteps }
								: {}),
						},
					};
				}
				case "progress": {
					const current = runtime.getPlan();
					if (!current) {
						throw new Error("No living plan exists on the current session branch");
					}
					const input: ProgressPlanInput = {
						baseRevision: params.baseRevision,
						done: params.done,
						start: params.start,
						note: params.note,
					};
					const mutation = applyPlanProgress(
						current,
						input,
						new Date().toISOString(),
					);
					runtime.applyPlan(mutation.plan);
					return {
						content: [{
							type: "text",
							text: compactPlanResult(mutation.plan, mutation.compactedSteps),
						}],
						details: {
							kind: "plan",
							operation: "progress",
							plan: mutation.plan,
							...(mutation.compactedSteps.length > 0
								? { compactedSteps: mutation.compactedSteps }
								: {}),
						},
					};
				}
				case "compact": {
					const current = runtime.getPlan();
					if (!current) {
						throw new Error("No living plan exists on the current session branch");
					}
					const input: CompactPlanInput = {
						baseRevision: params.baseRevision,
						note: params.note,
					};
					const mutation = compactPlan(
						current,
						input,
						new Date().toISOString(),
					);
					runtime.applyPlan(mutation.plan, { preserveStaleness: true });
					return {
						content: [
							{
								type: "text",
								text: compactPlanResult(mutation.plan, mutation.compactedSteps),
							},
						],
						details: {
							kind: "plan",
							operation: "compact",
							plan: mutation.plan,
							compactedSteps: mutation.compactedSteps,
						},
					};
				}
			}
		},
		renderCall(args, theme) {
			const suffix =
				args.op === "progress"
					? [args.done ? `done ${args.done}` : "", args.start ? `start ${args.start}` : ""]
						.filter(Boolean)
						.join(" · ")
					: args.op;
			return new Text(
				`${paint(theme, "primary", theme.bold("plan"))} ${paint(theme, "secondary", suffix)}`,
				0,
				0,
			);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(paint(theme, "focus", "Updating plan…"), 0, 0);
			const content = result.content.find((item) => item.type === "text");
			const details = result.details;
			if (!details) {
				return new Text(
					paint(
						theme,
						"failure",
						content?.type === "text" ? content.text : "Plan tool failed",
					),
					0,
					0,
				);
			}
			if (
				expanded &&
				(details.kind === "consultation" || details.kind === "inspection") &&
				content?.type === "text"
			) {
				return new Text(content.text, 0, 0);
			}
			if (details.kind === "consultation") {
				return new Text(
					paint(theme, "completed", "● Fable consultation complete"),
					0,
					0,
				);
			}
			if (details.kind === "inspection") {
				return new Text(
					paint(theme, "primary", `Plan r${details.plan.revision} inspected`),
					0,
					0,
				);
			}
			return new Text(
				paint(
					theme,
					"completed",
					`● Plan r${details.plan.revision} · ${details.operation}`,
				),
				0,
				0,
			);
		},
	});
}
