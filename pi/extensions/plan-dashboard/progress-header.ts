import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { paint } from "../shared/color-policy.ts";
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
				: paint(
						this.theme,
						staleness === 2 ? "caution" : "secondary",
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
			Math.round((summary.done / Math.max(1, summary.total)) * barWidth),
		);
		const resolvedWidth = Math.min(
			barWidth,
			Math.round((resolvedCount / Math.max(1, summary.total)) * barWidth),
		);
		const supersededWidth = Math.max(0, resolvedWidth - doneWidth);
		const activeWidth =
			summary.inProgress > 0 && resolvedWidth < barWidth ? 1 : 0;
		const remainingWidth = Math.max(
			0,
			barWidth - resolvedWidth - activeWidth,
		);
		const bar =
			paint(this.theme, "completed", "━".repeat(doneWidth)) +
			paint(this.theme, "tertiary", "━".repeat(supersededWidth)) +
			paint(this.theme, "focus", "◆".repeat(activeWidth)) +
			this.theme.fg("borderMuted", "─".repeat(remainingWidth));
		return `${paint(this.theme, "secondary", label)}[${bar}]`;
	}

	private renderCurrent(views: readonly PlanStepView[]): string {
		const current = views.find((view) => view.status === "in_progress");
		if (current) {
			return ` ${paint(this.theme, "focus", this.theme.bold("▶ NOW"))}  ${paint(this.theme, "secondary", current.step.id)}  ${paint(this.theme, "primary", this.theme.bold(current.step.title))}`;
		}
		const next = views.find((view) => view.status === "ready");
		if (next) {
			return ` ${paint(this.theme, "focus", this.theme.bold("● NEXT"))}  ${paint(this.theme, "secondary", next.step.id)}  ${paint(this.theme, "primary", this.theme.bold(next.step.title))}`;
		}
		return ` ${paint(this.theme, "completed", this.theme.bold("✔ PLAN COMPLETE"))}`;
	}
}
