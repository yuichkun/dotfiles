import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { ModalFrame } from "../shared/modal-frame.ts";
import { getStalenessLevel } from "./context.ts";
import {
	buildPlanViews,
	summarizePlan,
	type Plan,
	type PlanStepView,
} from "./plan.ts";

export interface ProgressHeaderState {
	plan: Plan;
	workSinceUpdate: number;
	turnsSinceUpdate: number;
}

export class PlanProgressHeader {
	private state: ProgressHeaderState;
	private readonly theme: Theme;
	private readonly requestRender: () => void;

	constructor(
		state: ProgressHeaderState,
		theme: Theme,
		requestRender: () => void = () => {},
	) {
		this.state = state;
		this.theme = theme;
		this.requestRender = requestRender;
	}

	setState(state: ProgressHeaderState): void {
		this.state = state;
		this.requestRender();
	}

	render(width: number): string[] {
		if (width < 4) return ["PLAN"];
		const frame = new ModalFrame(this.theme, width);
		const views = buildPlanViews(this.state.plan);
		const staleness = getStalenessLevel(
			this.state.workSinceUpdate,
			this.state.turnsSinceUpdate,
		);
		const staleLabel =
			staleness === 0
				? ""
				: this.theme.fg(
						staleness === 2 ? "warning" : "muted",
						` · ⚠ STALE ${this.state.workSinceUpdate} work / ${this.state.turnsSinceUpdate} turns`,
					);
		return [
			frame.top(`PLAN${staleLabel} · ${this.state.plan.title}`),
			frame.row(this.renderProgress(frame.innerWidth, views)),
			frame.row(this.renderCurrent(views)),
			frame.bottom(),
		];
	}

	invalidate(): void {}

	private renderProgress(
		width: number,
		views: readonly PlanStepView[],
	): string {
		const summary = summarizePlan(views);
		const label = " PROGRESS  ";
		const bracketWidth = 2;
		const barWidth = Math.max(
			4,
			width - visibleWidth(label) - bracketWidth - 1,
		);
		const resolvedCount = summary.done + summary.superseded;
		const doneWidth = Math.min(
			barWidth,
			Math.round(
				(resolvedCount / Math.max(1, summary.total)) * barWidth,
			),
		);
		const activeWidth =
			summary.inProgress > 0 && doneWidth < barWidth ? 1 : 0;
		const remainingWidth = Math.max(
			0,
			barWidth - doneWidth - activeWidth,
		);
		const bar =
			this.theme.fg("success", "━".repeat(doneWidth)) +
			this.theme.fg("accent", "◆".repeat(activeWidth)) +
			this.theme.fg("borderMuted", "─".repeat(remainingWidth));
		return `${this.theme.fg("muted", label)}[${bar}]`;
	}

	private renderCurrent(views: readonly PlanStepView[]): string {
		const current = views.find((view) => view.status === "in_progress");
		if (current) {
			return ` ${this.theme.fg("accent", this.theme.bold("▶ NOW"))}  ${this.theme.fg("muted", current.step.id)}  ${this.theme.fg("text", this.theme.bold(current.step.title))}`;
		}
		const next = views.find((view) => view.status === "ready");
		if (next) {
			return ` ${this.theme.fg("success", this.theme.bold("● NEXT"))}  ${this.theme.fg("muted", next.step.id)}  ${this.theme.fg("text", this.theme.bold(next.step.title))}`;
		}
		return ` ${this.theme.fg("success", this.theme.bold("✔ PLAN COMPLETE"))}`;
	}
}
