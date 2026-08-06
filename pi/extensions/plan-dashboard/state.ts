import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { validatePlan, type Plan } from "./plan.ts";

export const PLAN_REQUEST_ENTRY = "living-plan.request";
export const PLAN_TOOL_NAME = "plan";

export interface PlanRequest {
	schemaVersion: 1;
	id: string;
	task: string;
	createdAt: string;
}

export interface ObservedFact {
	statement: string;
	source: string;
}

export interface PlanConsultation {
	schemaVersion: 1;
	id: string;
	requestId: string;
	model: "fable";
	effort: "max";
	facts: readonly ObservedFact[];
	constraints: readonly string[];
	openQuestions: readonly string[];
	response: string;
	createdAt: string;
}

export interface ConsultationToolDetails {
	kind: "consultation";
	consultation: PlanConsultation;
}

export interface PlanSnapshotToolDetails {
	kind: "plan";
	operation: "set" | "progress";
	plan: Plan;
}

export interface PlanInspectionToolDetails {
	kind: "inspection";
	plan: Plan;
}

export type PlanToolDetails =
	| ConsultationToolDetails
	| PlanSnapshotToolDetails
	| PlanInspectionToolDetails;

export interface PlanRuntimeState {
	request?: PlanRequest;
	plan?: Plan;
	workSinceUpdate: number;
	turnsSinceUpdate: number;
	error?: string;
}

type RuntimeListener = (state: Readonly<PlanRuntimeState>) => void;

const TRACKED_WORK_TOOLS = new Set(["edit", "write", "bash"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(isNonEmptyString);
}

function isIsoTimestamp(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const timestamp = Date.parse(value);
	return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

export function isPlanRequest(value: unknown): value is PlanRequest {
	return (
		isRecord(value) &&
		value.schemaVersion === 1 &&
		isNonEmptyString(value.id) &&
		isNonEmptyString(value.task) &&
		isIsoTimestamp(value.createdAt)
	);
}

export function isPlanConsultation(
	value: unknown,
): value is PlanConsultation {
	return (
		isRecord(value) &&
		value.schemaVersion === 1 &&
		typeof value.id === "string" &&
		typeof value.requestId === "string" &&
		value.model === "fable" &&
		value.effort === "max" &&
		Array.isArray(value.facts) &&
		value.facts.every(
			(fact) =>
				isRecord(fact) &&
				isNonEmptyString(fact.statement) &&
				isNonEmptyString(fact.source),
		) &&
		isStringArray(value.constraints) &&
		isStringArray(value.openQuestions) &&
		isNonEmptyString(value.response) &&
		isIsoTimestamp(value.createdAt)
	);
}

export function isPlanToolDetails(value: unknown): value is PlanToolDetails {
	if (!isRecord(value)) return false;
	if (value.kind === "consultation") {
		return isPlanConsultation(value.consultation);
	}
	if (value.kind === "inspection") return isRecord(value.plan);
	return (
		value.kind === "plan" &&
		(value.operation === "set" || value.operation === "progress") &&
		isRecord(value.plan)
	);
}

export class PlanRuntime {
	private state: PlanRuntimeState = {
		workSinceUpdate: 0,
		turnsSinceUpdate: 0,
	};
	private readonly consultations = new Map<string, PlanConsultation>();
	private readonly listeners = new Set<RuntimeListener>();

	getState(): Readonly<PlanRuntimeState> {
		return this.state;
	}

	getPlan(): Plan | undefined {
		return this.state.plan;
	}

	getPendingRequest(): PlanRequest | undefined {
		const { request, plan } = this.state;
		if (!request || plan?.requestId === request.id) return undefined;
		return request;
	}

	getConsultation(id: string): PlanConsultation | undefined {
		return this.consultations.get(id);
	}

	subscribe(listener: RuntimeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	restore(entries: readonly SessionEntry[]): void {
		this.state = { workSinceUpdate: 0, turnsSinceUpdate: 0 };
		this.consultations.clear();

		for (const entry of entries) {
			if (
				entry.type === "custom" &&
				entry.customType === PLAN_REQUEST_ENTRY &&
				isPlanRequest(entry.data)
			) {
				this.state.request = entry.data;
				continue;
			}
			if (entry.type !== "message") continue;
			const message = entry.message;
			if (message.role === "assistant" && this.state.plan) {
				this.state.turnsSinceUpdate++;
				continue;
			}
			if (message.role !== "toolResult") continue;

			if (message.toolName === PLAN_TOOL_NAME) {
				this.restorePlanToolResult(message.details);
				continue;
			}
			if (
				this.state.plan &&
				!message.isError &&
				TRACKED_WORK_TOOLS.has(message.toolName)
			) {
				this.state.workSinceUpdate++;
			}
		}
		this.emit();
	}

	setRequest(request: PlanRequest): void {
		this.state = { ...this.state, request, error: undefined };
		this.emit();
	}

	applyConsultation(consultation: PlanConsultation): void {
		this.consultations.set(consultation.id, consultation);
	}

	applyPlan(plan: Plan): void {
		validatePlan(plan);
		this.state = {
			...this.state,
			plan,
			workSinceUpdate: 0,
			turnsSinceUpdate: 0,
			error: undefined,
		};
		this.emit();
	}

	recordToolResult(toolName: string, isError: boolean): void {
		if (
			!this.state.plan ||
			isError ||
			!TRACKED_WORK_TOOLS.has(toolName)
		) {
			return;
		}
		this.state = {
			...this.state,
			workSinceUpdate: this.state.workSinceUpdate + 1,
		};
		this.emit();
	}

	recordTurn(): void {
		if (!this.state.plan) return;
		this.state = {
			...this.state,
			turnsSinceUpdate: this.state.turnsSinceUpdate + 1,
		};
		this.emit();
	}

	private restorePlanToolResult(details: unknown): void {
		if (!isPlanToolDetails(details)) return;
		if (details.kind === "consultation") {
			this.consultations.set(
				details.consultation.id,
				details.consultation,
			);
			return;
		}
		if (details.kind === "inspection") return;
		try {
			validatePlan(details.plan);
			this.state.plan = details.plan;
			this.state.workSinceUpdate = 0;
			this.state.turnsSinceUpdate = 0;
			this.state.error = undefined;
		} catch (error) {
			this.state.plan = undefined;
			this.state.error =
				error instanceof Error ? error.message : String(error);
		}
	}

	private emit(): void {
		for (const listener of this.listeners) listener(this.state);
	}
}

export const planRuntime = new PlanRuntime();
