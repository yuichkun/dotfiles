export const PLAN_SCHEMA_VERSION = 1 as const;
export const MAX_PLAN_STEPS = 50;

export type StoredStepStatus =
	| "pending"
	| "in_progress"
	| "done"
	| "superseded";

export type DisplayStepStatus =
	| "in_progress"
	| "ready"
	| "blocked"
	| "done"
	| "superseded";

export interface PlanStepInput {
	id: string;
	phase: string;
	title: string;
	shortTitle: string;
	goal: string;
	work: readonly string[];
	acceptance: readonly string[];
	dependsOn: readonly string[];
	relatedFiles: readonly string[];
	status: StoredStepStatus;
}

export interface PlanStep extends PlanStepInput {
	updatedAt: string;
	updatedBy: "agent";
}

export interface Plan {
	schemaVersion: typeof PLAN_SCHEMA_VERSION;
	id: string;
	requestId: string;
	request: string;
	consultationId: string;
	title: string;
	objective: string;
	revision: number;
	changeReason: string;
	createdAt: string;
	updatedAt: string;
	steps: readonly PlanStep[];
}

export interface SetPlanInput {
	baseRevision: number;
	title: string;
	objective: string;
	reason: string;
	steps: readonly PlanStepInput[];
}

export interface ProgressPlanInput {
	baseRevision: number;
	done?: string;
	start?: string;
	note: string;
}

export interface PlanStepView {
	step: PlanStep;
	status: DisplayStepStatus;
	blockers: readonly PlanStep[];
	dependents: readonly PlanStep[];
}

export interface PlanSummary {
	total: number;
	done: number;
	inProgress: number;
	ready: number;
	blocked: number;
	superseded: number;
}

export class PlanValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PlanValidationError";
	}
}

function requireText(value: unknown, label: string): string {
	if (typeof value !== "string") {
		throw new PlanValidationError(`${label} must be a string`);
	}
	const normalized = value.trim();
	if (!normalized) throw new PlanValidationError(`${label} must not be empty`);
	return normalized;
}

function isIsoTimestamp(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const timestamp = Date.parse(value);
	return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function normalizeStrings(
	values: readonly string[],
	label: string,
): readonly string[] {
	const normalized = values.map((value, index) =>
		requireText(value, `${label}[${index}]`),
	);
	if (new Set(normalized).size !== normalized.length) {
		throw new PlanValidationError(`${label} contains duplicates`);
	}
	return normalized;
}

function normalizeStep(input: PlanStepInput): PlanStepInput {
	return {
		id: requireText(input.id, "step.id"),
		phase: requireText(input.phase, `${input.id}.phase`),
		title: requireText(input.title, `${input.id}.title`),
		shortTitle: requireText(input.shortTitle, `${input.id}.shortTitle`),
		goal: requireText(input.goal, `${input.id}.goal`),
		work: normalizeStrings(input.work, `${input.id}.work`),
		acceptance: normalizeStrings(
			input.acceptance,
			`${input.id}.acceptance`,
		),
		dependsOn: normalizeStrings(input.dependsOn, `${input.id}.dependsOn`),
		relatedFiles: normalizeStrings(
			input.relatedFiles,
			`${input.id}.relatedFiles`,
		),
		status: input.status,
	};
}

function comparableStep(step: PlanStep | PlanStepInput): PlanStepInput {
	return {
		id: step.id,
		phase: step.phase,
		title: step.title,
		shortTitle: step.shortTitle,
		goal: step.goal,
		work: [...step.work],
		acceptance: [...step.acceptance],
		dependsOn: [...step.dependsOn],
		relatedFiles: [...step.relatedFiles],
		status: step.status,
	};
}

function stepsEqual(left: PlanStep | PlanStepInput, right: PlanStepInput): boolean {
	return JSON.stringify(comparableStep(left)) === JSON.stringify(right);
}

export function dependencyIsResolved(step: PlanStep): boolean {
	return step.status === "done" || step.status === "superseded";
}

export function validatePlan(plan: Plan): void {
	if (plan.schemaVersion !== PLAN_SCHEMA_VERSION) {
		throw new PlanValidationError(
			`Unsupported plan schema version: ${String(plan.schemaVersion)}`,
		);
	}
	for (const [label, value] of [
		["plan.id", plan.id],
		["plan.requestId", plan.requestId],
		["plan.request", plan.request],
		["plan.consultationId", plan.consultationId],
		["plan.title", plan.title],
		["plan.objective", plan.objective],
		["plan.changeReason", plan.changeReason],
	] as const) {
		requireText(value, label);
	}
	for (const [label, value] of [
		["plan.createdAt", plan.createdAt],
		["plan.updatedAt", plan.updatedAt],
	] as const) {
		if (!isIsoTimestamp(value)) {
			throw new PlanValidationError(`${label} must be an ISO timestamp`);
		}
	}
	if (!Number.isInteger(plan.revision) || plan.revision < 1) {
		throw new PlanValidationError("plan.revision must be a positive integer");
	}
	const rawSteps: unknown = plan.steps;
	if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
		throw new PlanValidationError("A plan needs at least one step");
	}
	if (rawSteps.length > MAX_PLAN_STEPS) {
		throw new PlanValidationError(
			`A plan may contain at most ${MAX_PLAN_STEPS} steps`,
		);
	}
	const steps = rawSteps as readonly PlanStep[];

	const validStatuses = new Set<StoredStepStatus>([
		"pending",
		"in_progress",
		"done",
		"superseded",
	]);
	const stepsById = new Map<string, PlanStep>();
	for (const step of steps) {
		if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(step.id)) {
			throw new PlanValidationError(`Invalid step id: ${String(step.id)}`);
		}
		for (const [label, value] of [
			[`${step.id}.phase`, step.phase],
			[`${step.id}.title`, step.title],
			[`${step.id}.shortTitle`, step.shortTitle],
			[`${step.id}.goal`, step.goal],
		] as const) {
			requireText(value, label);
		}
		for (const [label, values, allowEmpty] of [
			[`${step.id}.work`, step.work, false],
			[`${step.id}.acceptance`, step.acceptance, false],
			[`${step.id}.dependsOn`, step.dependsOn, true],
			[`${step.id}.relatedFiles`, step.relatedFiles, true],
		] as const) {
			if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
				throw new PlanValidationError(`${label} must not be empty`);
			}
			normalizeStrings(values, label);
		}
		if (!validStatuses.has(step.status)) {
			throw new PlanValidationError(
				`Invalid status for ${step.id}: ${String(step.status)}`,
			);
		}
		if (step.updatedBy !== "agent") {
			throw new PlanValidationError(`Invalid updatedBy for ${step.id}`);
		}
		if (!isIsoTimestamp(step.updatedAt)) {
			throw new PlanValidationError(
				`${step.id}.updatedAt must be an ISO timestamp`,
			);
		}
		if (stepsById.has(step.id)) {
			throw new PlanValidationError(`Duplicate step id: ${step.id}`);
		}
		stepsById.set(step.id, step);
	}

	for (const step of steps) {
		for (const dependencyId of step.dependsOn) {
			if (dependencyId === step.id) {
				throw new PlanValidationError(`${step.id} depends on itself`);
			}
			if (!stepsById.has(dependencyId)) {
				throw new PlanValidationError(
					`${step.id} depends on missing step ${dependencyId}`,
				);
			}
		}
	}

	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (stepId: string): void => {
		if (visited.has(stepId)) return;
		if (visiting.has(stepId)) {
			throw new PlanValidationError(`Dependency cycle includes ${stepId}`);
		}
		visiting.add(stepId);
		for (const dependencyId of stepsById.get(stepId)?.dependsOn ?? []) {
			visit(dependencyId);
		}
		visiting.delete(stepId);
		visited.add(stepId);
	};
	for (const step of steps) visit(step.id);

	const active = steps.filter((step) => step.status === "in_progress");
	if (active.length > 1) {
		throw new PlanValidationError(
			`Only one step may be in progress: ${active.map((step) => step.id).join(", ")}`,
		);
	}

	for (const step of steps) {
		if (step.status !== "done" && step.status !== "in_progress") continue;
		const unresolved = step.dependsOn.filter((dependencyId) => {
			const dependency = stepsById.get(dependencyId);
			return dependency !== undefined && !dependencyIsResolved(dependency);
		});
		if (unresolved.length > 0) {
			throw new PlanValidationError(
				`${step.id} is ${step.status} but has unresolved dependencies: ${unresolved.join(", ")}`,
			);
		}
	}
}

export function createOrRevisePlan(options: {
	current?: Plan;
	input: SetPlanInput;
	requestId: string;
	request: string;
	consultationId: string;
	now: string;
	createId: () => string;
}): Plan {
	const { current, input, now } = options;
	const expectedRevision = current?.revision ?? 0;
	if (input.baseRevision !== expectedRevision) {
		throw new PlanValidationError(
			`Stale plan revision: expected ${expectedRevision}, received ${input.baseRevision}`,
		);
	}

	const previousById = new Map(
		(current?.steps ?? []).map((step) => [step.id, step]),
	);
	const incoming = input.steps.map(normalizeStep);
	const incomingIds = new Set<string>();
	const steps: PlanStep[] = [];

	for (const step of incoming) {
		if (incomingIds.has(step.id)) {
			throw new PlanValidationError(`Duplicate step id: ${step.id}`);
		}
		incomingIds.add(step.id);
		const previous = previousById.get(step.id);
		steps.push({
			...step,
			updatedAt: previous && stepsEqual(previous, step) ? previous.updatedAt : now,
			updatedBy: "agent",
		});
	}

	for (const previous of current?.steps ?? []) {
		if (incomingIds.has(previous.id)) continue;
		steps.push({
			...previous,
			status: "superseded",
			updatedAt: previous.status === "superseded" ? previous.updatedAt : now,
			updatedBy: "agent",
		});
	}

	const plan: Plan = {
		schemaVersion: PLAN_SCHEMA_VERSION,
		id: current?.id ?? options.createId(),
		requestId: current?.requestId ?? options.requestId,
		request: current?.request ?? requireText(options.request, "request"),
		consultationId: options.consultationId,
		title: requireText(input.title, "plan.title"),
		objective: requireText(input.objective, "plan.objective"),
		revision: expectedRevision + 1,
		changeReason: requireText(input.reason, "reason"),
		createdAt: current?.createdAt ?? now,
		updatedAt: now,
		steps,
	};
	validatePlan(plan);
	return plan;
}

export function applyPlanProgress(
	current: Plan,
	input: ProgressPlanInput,
	now: string,
): Plan {
	if (input.baseRevision !== current.revision) {
		throw new PlanValidationError(
			`Stale plan revision: expected ${current.revision}, received ${input.baseRevision}`,
		);
	}
	if (!input.done && !input.start) {
		throw new PlanValidationError("progress needs done, start, or both");
	}
	if (input.done && input.start && input.done === input.start) {
		throw new PlanValidationError("A step cannot be completed and started together");
	}

	const steps = current.steps.map((step) => ({ ...step }));
	const stepsById = new Map(steps.map((step) => [step.id, step]));

	if (input.done) {
		const step = stepsById.get(input.done);
		if (!step) throw new PlanValidationError(`Unknown step: ${input.done}`);
		if (step.status !== "in_progress") {
			throw new PlanValidationError(
				`${step.id} must be in_progress before it can be completed`,
			);
		}
		step.status = "done";
		step.updatedAt = now;
	}

	if (input.start) {
		const step = stepsById.get(input.start);
		if (!step) throw new PlanValidationError(`Unknown step: ${input.start}`);
		if (step.status !== "pending") {
			throw new PlanValidationError(
				`${step.id} must be pending before it can be started`,
			);
		}
		const active = steps.find((candidate) => candidate.status === "in_progress");
		if (active) {
			throw new PlanValidationError(
				`Complete ${active.id} before starting ${step.id}`,
			);
		}
		const unresolved = step.dependsOn.filter((dependencyId) => {
			const dependency = stepsById.get(dependencyId);
			return dependency !== undefined && !dependencyIsResolved(dependency);
		});
		if (unresolved.length > 0) {
			throw new PlanValidationError(
				`${step.id} is blocked by ${unresolved.join(", ")}`,
			);
		}
		step.status = "in_progress";
		step.updatedAt = now;
	}

	const plan: Plan = {
		...current,
		revision: current.revision + 1,
		changeReason: requireText(input.note, "note"),
		updatedAt: now,
		steps,
	};
	validatePlan(plan);
	return plan;
}

export function buildPlanViews(plan: Plan): PlanStepView[] {
	const stepsById = new Map(plan.steps.map((step) => [step.id, step]));
	const dependentsById = new Map<string, PlanStep[]>();

	for (const step of plan.steps) {
		for (const dependencyId of step.dependsOn) {
			const dependents = dependentsById.get(dependencyId) ?? [];
			dependents.push(step);
			dependentsById.set(dependencyId, dependents);
		}
	}

	return plan.steps.map((step) => {
		const blockers = step.dependsOn
			.map((id) => stepsById.get(id))
			.filter(
				(dependency): dependency is PlanStep =>
					dependency !== undefined && !dependencyIsResolved(dependency),
			);

		let status: DisplayStepStatus;
		if (step.status === "done") status = "done";
		else if (step.status === "superseded") status = "superseded";
		else if (step.status === "in_progress") status = "in_progress";
		else status = blockers.length === 0 ? "ready" : "blocked";

		return {
			step,
			status,
			blockers,
			dependents: dependentsById.get(step.id) ?? [],
		};
	});
}

export function summarizePlan(views: readonly PlanStepView[]): PlanSummary {
	return {
		total: views.length,
		done: views.filter((view) => view.status === "done").length,
		inProgress: views.filter((view) => view.status === "in_progress").length,
		ready: views.filter((view) => view.status === "ready").length,
		blocked: views.filter((view) => view.status === "blocked").length,
		superseded: views.filter((view) => view.status === "superseded").length,
	};
}
