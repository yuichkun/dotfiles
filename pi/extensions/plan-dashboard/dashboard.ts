import type {
	ExtensionContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	matchesKey,
	sliceByColumn,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
	paint,
	type SemanticColorRole,
} from "../shared/color-policy.ts";
import { ModalFrame } from "../shared/modal-frame.ts";
import {
	BaseModal,
	showModal,
	type ModalContext,
} from "../shared/modal.ts";
import { getStalenessLevel } from "./context.ts";
import {
	createGraphLayout,
	type GraphLayout,
	type GraphNodeLayout,
} from "./graph-layout.ts";
import {
	buildPlanViews,
	summarizePlan,
	type DisplayStepStatus,
	type Plan,
	type PlanStepView,
} from "./plan.ts";
import { PlanRuntime } from "./state.ts";

const DEFAULT_TERMINAL_ROWS = 30;
const RECENT_RESOLVED_STEP_LIMIT = 5;

type CanvasStyle =
	| "plain"
	| "edge"
	| "edge-highlight"
	| "phase"
	| "done"
	| "in_progress"
	| "ready"
	| "blocked"
	| "superseded"
	| "selected"
	| "unrelated"
	| "primary"
	| "secondary";

interface CanvasCell {
	text: string;
	style: CanvasStyle;
	continuation?: boolean;
}

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;

function statusIcon(status: DisplayStepStatus): string {
	switch (status) {
		case "in_progress":
			return "▶";
		case "ready":
			return "●";
		case "blocked":
			return "○";
		case "done":
			return "✔";
		case "superseded":
			return "⊘";
	}
}

function statusLabel(status: DisplayStepStatus): string {
	switch (status) {
		case "in_progress":
			return "IN PROGRESS";
		case "ready":
			return "READY";
		case "blocked":
			return "WAITING";
		case "done":
			return "DONE";
		case "superseded":
			return "SUPERSEDED";
	}
}

function statusRole(status: DisplayStepStatus): SemanticColorRole {
	switch (status) {
		case "done":
			return "completed";
		case "in_progress":
			return "focus";
		case "ready":
			return "primary";
		case "blocked":
			return "secondary";
		case "superseded":
			return "tertiary";
	}
}

function edgeGlyph(mask: number): string {
	switch (mask) {
		case NORTH | SOUTH:
			return "│";
		case EAST | WEST:
			return "─";
		case EAST | SOUTH:
			return "┌";
		case WEST | SOUTH:
			return "┐";
		case EAST | NORTH:
			return "└";
		case WEST | NORTH:
			return "┘";
		case NORTH | EAST | SOUTH:
			return "├";
		case NORTH | WEST | SOUTH:
			return "┤";
		case EAST | WEST | SOUTH:
			return "┬";
		case EAST | WEST | NORTH:
			return "┴";
		case NORTH | EAST | SOUTH | WEST:
			return "┼";
		case NORTH:
		case SOUTH:
			return "│";
		case EAST:
		case WEST:
			return "─";
		default:
			return " ";
	}
}

function oppositeDirection(direction: number): number {
	switch (direction) {
		case NORTH:
			return SOUTH;
		case EAST:
			return WEST;
		case SOUTH:
			return NORTH;
		case WEST:
			return EAST;
		default:
			return 0;
	}
}

function directionBetween(
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
): number {
	if (toX > fromX) return EAST;
	if (toX < fromX) return WEST;
	if (toY > fromY) return SOUTH;
	return NORTH;
}

function borderCharacters(status: DisplayStepStatus): {
	topLeft: string;
	top: string;
	topRight: string;
	left: string;
	right: string;
	bottomLeft: string;
	bottom: string;
	bottomRight: string;
} {
	switch (status) {
		case "in_progress":
			return {
				topLeft: "╔",
				top: "═",
				topRight: "╗",
				left: "║",
				right: "║",
				bottomLeft: "╚",
				bottom: "═",
				bottomRight: "╝",
			};
		case "ready":
			return {
				topLeft: "┏",
				top: "━",
				topRight: "┓",
				left: "┃",
				right: "┃",
				bottomLeft: "┗",
				bottom: "━",
				bottomRight: "┛",
			};
		case "blocked":
			return {
				topLeft: "┌",
				top: "┄",
				topRight: "┐",
				left: "┆",
				right: "┆",
				bottomLeft: "└",
				bottom: "┄",
				bottomRight: "┘",
			};
		case "done":
		case "superseded":
			return {
				topLeft: "┌",
				top: "─",
				topRight: "┐",
				left: "│",
				right: "│",
				bottomLeft: "└",
				bottom: "─",
				bottomRight: "┘",
			};
	}
}

class DiagramCanvas {
	readonly width: number;
	readonly height: number;
	private readonly cells: (CanvasCell | undefined)[][];
	private readonly edgeMasks: number[][];
	private readonly edgeStyles: (CanvasStyle | undefined)[][];
	private readonly segmenter = new Intl.Segmenter(undefined, {
		granularity: "grapheme",
	});

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.cells = Array.from({ length: height }, () =>
			Array.from({ length: width }),
		);
		this.edgeMasks = Array.from({ length: height }, () =>
			Array.from({ length: width }, () => 0),
		);
		this.edgeStyles = Array.from({ length: height }, () =>
			Array.from({ length: width }),
		);
	}

	drawEdge(
		fromX: number,
		fromY: number,
		toX: number,
		toY: number,
		style: "edge" | "edge-highlight",
	): void {
		if (toX < fromX) return;
		const channelX = Math.floor((fromX + toX) / 2);
		const points: [number, number][] = [[fromX, fromY]];
		for (let x = fromX + 1; x <= channelX; x++) {
			points.push([x, fromY]);
		}
		const verticalDirection = toY >= fromY ? 1 : -1;
		for (
			let y = fromY + verticalDirection;
			y !== toY + verticalDirection;
			y += verticalDirection
		) {
			points.push([channelX, y]);
		}
		for (let x = channelX + 1; x <= toX; x++) {
			points.push([x, toY]);
		}

		this.addEdgeMask(fromX, fromY, WEST, style);
		this.addEdgeMask(toX, toY, EAST, style);
		for (let index = 0; index < points.length - 1; index++) {
			const current = points[index];
			const next = points[index + 1];
			if (!current || !next) continue;
			const direction = directionBetween(
				current[0],
				current[1],
				next[0],
				next[1],
			);
			this.addEdgeMask(current[0], current[1], direction, style);
			this.addEdgeMask(
				next[0],
				next[1],
				oppositeDirection(direction),
				style,
			);
		}
	}

	materializeEdges(): void {
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				const mask = this.edgeMasks[y]?.[x] ?? 0;
				if (mask === 0) continue;
				this.writeText(
					x,
					y,
					edgeGlyph(mask),
					1,
					this.edgeStyles[y]?.[x] ?? "edge",
				);
			}
		}
	}

	fillRect(
		x: number,
		y: number,
		width: number,
		height: number,
		style: CanvasStyle,
	): void {
		for (let row = y; row < y + height; row++) {
			for (let col = x; col < x + width; col++) {
				if (!this.inBounds(col, row)) continue;
				this.cells[row]![col] = { text: " ", style };
			}
		}
	}

	writeText(
		x: number,
		y: number,
		text: string,
		maxWidth: number,
		style: CanvasStyle,
		align: "left" | "center" = "left",
	): void {
		if (y < 0 || y >= this.height || maxWidth <= 0) return;
		const graphemes: { text: string; width: number }[] = [];
		let textWidth = 0;
		for (const part of this.segmenter.segment(text)) {
			const grapheme = part.segment;
			const graphemeWidth = Math.max(1, visibleWidth(grapheme));
			if (textWidth + graphemeWidth > maxWidth) break;
			graphemes.push({ text: grapheme, width: graphemeWidth });
			textWidth += graphemeWidth;
		}
		let cursor =
			x + (align === "center" ? Math.max(0, Math.floor((maxWidth - textWidth) / 2)) : 0);
		for (const grapheme of graphemes) {
			if (!this.inBounds(cursor, y)) break;
			this.cells[y]![cursor] = {
				text: grapheme.text,
				style,
			};
			for (let offset = 1; offset < grapheme.width; offset++) {
				if (this.inBounds(cursor + offset, y)) {
					this.cells[y]![cursor + offset] = {
						text: "",
						style,
						continuation: true,
					};
				}
			}
			cursor += grapheme.width;
		}
	}

	render(theme: Theme): string[] {
		return this.cells.map((row) => {
			let output = "";
			let buffer = "";
			let activeStyle: CanvasStyle = "plain";
			const flush = (): void => {
				if (!buffer) return;
				output += this.applyStyle(activeStyle, buffer, theme);
				buffer = "";
			};

			for (let column = 0; column < this.width; column++) {
				const cell = row[column];
				if (cell?.continuation) continue;
				const style = cell?.style ?? "plain";
				const text = cell?.text ?? " ";
				if (style !== activeStyle) {
					flush();
					activeStyle = style;
				}
				buffer += text;
			}
			flush();
			return output;
		});
	}

	private addEdgeMask(
		x: number,
		y: number,
		mask: number,
		style: "edge" | "edge-highlight",
	): void {
		if (!this.inBounds(x, y)) return;
		this.edgeMasks[y]![x] = (this.edgeMasks[y]?.[x] ?? 0) | mask;
		if (
			style === "edge-highlight" ||
			this.edgeStyles[y]?.[x] === undefined
		) {
			this.edgeStyles[y]![x] = style;
		}
	}

	private inBounds(x: number, y: number): boolean {
		return x >= 0 && x < this.width && y >= 0 && y < this.height;
	}

	private applyStyle(
		style: CanvasStyle,
		text: string,
		theme: Theme,
	): string {
		switch (style) {
			case "edge":
				return theme.fg("borderMuted", text);
			case "edge-highlight":
				return paint(theme, "focus", theme.bold(text));
			case "phase":
				return paint(theme, "secondary", theme.bold(text));
			case "done":
			case "in_progress":
			case "ready":
			case "blocked":
			case "superseded":
				return paint(
					theme,
					statusRole(style),
					style === "in_progress" || style === "ready"
						? theme.bold(text)
						: text,
				);
			case "selected":
				return theme.inverse(theme.bold(text));
			case "unrelated":
				return paint(theme, "tertiary", text);
			case "primary":
				return paint(theme, "primary", theme.bold(text));
			case "secondary":
				return paint(theme, "secondary", text);
			case "plain":
				return text;
		}
	}
}

export class PlanDashboardComponent extends BaseModal<void> {
	private readonly plan: Plan;
	private readonly workSinceUpdate: number;
	private readonly turnsSinceUpdate: number;
	private readonly views: readonly PlanStepView[];
	private readonly viewsById: ReadonlyMap<string, PlanStepView>;
	private selectedStepId = "";
	private detailOpen = false;
	private showResolved = false;
	private detailScroll = 0;
	private lastDetailMaxScroll = 0;
	private dependencyHighlight = false;
	private lastLayout?: GraphLayout;

	constructor(
		plan: Plan,
		context: ModalContext<void>,
		staleness: { workSinceUpdate: number; turnsSinceUpdate: number } = {
			workSinceUpdate: 0,
			turnsSinceUpdate: 0,
		},
	) {
		super(context);
		this.plan = plan;
		this.workSinceUpdate = staleness.workSinceUpdate;
		this.turnsSinceUpdate = staleness.turnsSinceUpdate;
		this.views = buildPlanViews(plan);
		this.viewsById = new Map(
			this.views.map((view) => [view.step.id, view]),
		);
		this.returnToCurrentOrFrontier();
	}

	override handleInput(data: string): void {
		if (this.detailOpen) {
			this.handleDetailInput(data);
			return;
		}
		if (this.isCancelInput(data)) {
			this.close();
			return;
		}
		if (matchesKey(data, "a")) {
			this.showResolved = !this.showResolved;
			if (
				!this.getVisibleViews().some(
					(view) => view.step.id === this.selectedStepId,
				)
			) {
				this.returnToCurrentOrFrontier();
			}
			this.lastLayout = undefined;
			this.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			this.navigateVertical(-1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.navigateVertical(1);
			return;
		}
		if (matchesKey(data, "left")) {
			this.navigateHorizontal(-1);
			return;
		}
		if (matchesKey(data, "right")) {
			this.navigateHorizontal(1);
			return;
		}
		if (matchesKey(data, "tab")) {
			this.cycleFrontier();
			return;
		}
		if (matchesKey(data, "home") || matchesKey(data, "0")) {
			this.returnToCurrent();
			return;
		}
		if (matchesKey(data, "d")) {
			this.dependencyHighlight = !this.dependencyHighlight;
			this.requestRender();
			return;
		}
		if (
			this.keybindings.matches(data, "tui.select.confirm") &&
			this.getSelectedView()
		) {
			this.detailOpen = true;
			this.detailScroll = 0;
			this.requestRender();
		}
	}

	override render(width: number): string[] {
		if (width < 4) return [truncateToWidth("Plan", width, "")];
		return this.detailOpen
			? this.renderDetail(width)
			: this.renderOverview(width);
	}

	private renderOverview(width: number): string[] {
		const frame = new ModalFrame(this.theme, width);
		const bodyHeight = this.getOverviewBodyHeight();
		const lines = [
			frame.top(`Plan Dashboard · ${this.plan.title}`),
			frame.row(this.renderSummaryLine(frame.innerWidth)),
			frame.separator(),
		];
		for (const line of this.renderGraph(frame.innerWidth, bodyHeight)) {
			lines.push(frame.row(line));
		}
		lines.push(frame.separator());
		const selected = this.getSelectedView();
		lines.push(frame.row(this.renderSelectedSummary(selected)));
		lines.push(frame.row(this.renderSelectedGoal(selected)));
		lines.push(
			frame.row(
				` ${paint(this.theme, "tertiary", "←→ stages · ↑↓ lane · Tab frontier · d trace · a resolved · 0 current · Enter details · Esc close")}`,
			),
		);
		lines.push(frame.bottom());
		return lines;
	}

	private renderSummaryLine(width: number): string {
		const summary = summarizePlan(this.views, this.plan.archivedSteps);
		const progressWidth = Math.max(12, Math.min(30, Math.floor(width * 0.24)));
		const resolved = summary.done + summary.superseded;
		const doneWidth = Math.round(
			(summary.done / Math.max(1, summary.total)) * progressWidth,
		);
		const resolvedWidth = Math.round(
			(resolved / Math.max(1, summary.total)) * progressWidth,
		);
		const supersededWidth = Math.max(0, resolvedWidth - doneWidth);
		const active = summary.inProgress > 0 && resolvedWidth < progressWidth ? 1 : 0;
		const bar =
			paint(this.theme, "completed", "━".repeat(doneWidth)) +
			paint(this.theme, "tertiary", "━".repeat(supersededWidth)) +
			paint(this.theme, "focus", "━".repeat(active)) +
			this.theme.fg(
				"borderMuted",
				"─".repeat(Math.max(0, progressWidth - resolvedWidth - active)),
			);
		const metrics = [
			paint(this.theme, "completed", `✔ done ${summary.done}`),
			...(summary.archived > 0
				? [paint(this.theme, "tertiary", `▣ compacted ${summary.archived}`)]
				: []),
			...(summary.superseded > 0
				? [paint(this.theme, "tertiary", `⊘ superseded ${summary.superseded}`)]
				: []),
			paint(this.theme, "focus", `▶ now ${summary.inProgress}`),
			paint(this.theme, "primary", `● ready ${summary.ready}`),
			paint(this.theme, "secondary", `○ waiting ${summary.blocked}`),
		].join(paint(this.theme, "tertiary", "  ·  "));
		const trace = this.dependencyHighlight
			? paint(this.theme, "focus", "  ·  TRACE ON")
			: "";
		const staleness = getStalenessLevel(
			this.workSinceUpdate,
			this.turnsSinceUpdate,
		);
		const stale =
			staleness === 0
				? ""
				: paint(
						this.theme,
						staleness === 2 ? "caution" : "secondary",
						`  ·  ⚠ STALE ${this.workSinceUpdate} work / ${this.turnsSinceUpdate} turns`,
					);
		return ` ${bar}  ${resolved}/${summary.total}${stale}  ${metrics}${trace}`;
	}

	private renderGraph(width: number, height: number): string[] {
		const layout = createGraphLayout(this.getVisibleViews(), width, height);
		this.lastLayout = layout;
		const canvas = new DiagramCanvas(layout.worldWidth, layout.worldHeight);
		const nodesById = new Map(
			layout.nodes.map((node) => [node.view.step.id, node]),
		);
		const related = this.getRelatedStepIds();

		for (let rank = 0; rank < layout.ranks.length; rank++) {
			const rankNodes = layout.ranks[rank] ?? [];
			const first = rankNodes[0];
			if (!first) continue;
			const phases = [
				...new Set(rankNodes.map((node) => node.view.step.phase)),
			];
			canvas.writeText(
				first.x,
				0,
				phases.length === 1 ? (phases[0] ?? "") : `stage ${rank + 1}`,
				layout.nodeWidth,
				"phase",
				"center",
			);
		}

		for (const target of layout.nodes) {
			for (const dependencyId of target.view.step.dependsOn) {
				const source = nodesById.get(dependencyId);
				if (!source) continue;
				const highlighted =
					this.dependencyHighlight &&
					related.has(source.view.step.id) &&
					related.has(target.view.step.id);
				canvas.drawEdge(
					source.x + source.width,
					source.y + Math.floor(source.height / 2),
					target.x - 1,
					target.y + Math.floor(target.height / 2),
					highlighted ? "edge-highlight" : "edge",
				);
			}
		}
		canvas.materializeEdges();

		for (const node of layout.nodes) {
			this.drawNode(canvas, node, related);
		}

		const selectedNode = nodesById.get(this.selectedStepId);
		const cameraX = selectedNode
			? Math.max(
					0,
					Math.min(
						layout.worldWidth - width,
						Math.floor(
							selectedNode.x + selectedNode.width / 2 - width / 2,
						),
					),
				)
			: 0;
		const cameraY = selectedNode
			? Math.max(
					0,
					Math.min(
						layout.worldHeight - height,
						Math.floor(
							selectedNode.y + selectedNode.height / 2 - height / 2,
						),
					),
				)
			: 0;
		const worldLines = canvas.render(this.theme);
		const visible: string[] = [];
		for (let row = cameraY; row < cameraY + height; row++) {
			const worldLine = worldLines[row] ?? "";
			visible.push(
				truncateToWidth(
					sliceByColumn(worldLine, cameraX, width, true),
					width,
					"",
					true,
				),
			);
		}
		return visible;
	}

	private drawNode(
		canvas: DiagramCanvas,
		node: GraphNodeLayout,
		related: ReadonlySet<string>,
	): void {
		const selected = node.view.step.id === this.selectedStepId;
		const unrelated = this.dependencyHighlight && !related.has(node.view.step.id);
		const style: CanvasStyle = selected
			? "selected"
			: unrelated
				? "unrelated"
				: node.view.status;
		const titleStyle: CanvasStyle = selected
			? "selected"
			: unrelated
				? "unrelated"
				: "primary";
		const metadataStyle: CanvasStyle = selected
			? "selected"
			: unrelated
				? "unrelated"
				: "secondary";
		const border = borderCharacters(node.view.status);
		canvas.fillRect(node.x, node.y, node.width, node.height, style);
		canvas.writeText(node.x, node.y, border.topLeft, 1, style);
		canvas.writeText(
			node.x + 1,
			node.y,
			border.top.repeat(Math.max(0, node.width - 2)),
			Math.max(0, node.width - 2),
			style,
		);
		canvas.writeText(
			node.x + node.width - 1,
			node.y,
			border.topRight,
			1,
			style,
		);
		for (let row = node.y + 1; row < node.y + node.height - 1; row++) {
			canvas.writeText(node.x, row, border.left, 1, style);
			canvas.writeText(
				node.x + node.width - 1,
				row,
				border.right,
				1,
				style,
			);
		}
		canvas.writeText(
			node.x,
			node.y + node.height - 1,
			border.bottomLeft,
			1,
			style,
		);
		canvas.writeText(
			node.x + 1,
			node.y + node.height - 1,
			border.bottom.repeat(Math.max(0, node.width - 2)),
			Math.max(0, node.width - 2),
			style,
		);
		canvas.writeText(
			node.x + node.width - 1,
			node.y + node.height - 1,
			border.bottomRight,
			1,
			style,
		);

		const innerWidth = Math.max(1, node.width - 2);
		canvas.writeText(
			node.x + 1,
			node.y + 1,
			`${statusIcon(node.view.status)} ${node.view.step.id}`,
			innerWidth,
			style,
			"center",
		);
		canvas.writeText(
			node.x + 1,
			node.y + 2,
			node.view.step.shortTitle ?? node.view.step.title,
			innerWidth,
			titleStyle,
			"center",
		);
		if (node.height >= 5) {
			const state =
				node.view.status === "blocked"
					? `wait:${node.view.blockers.length}`
					: statusLabel(node.view.status).toLowerCase();
			canvas.writeText(
				node.x + 1,
				node.y + 3,
				state,
				innerWidth,
				metadataStyle,
				"center",
			);
		}
	}

	private renderSelectedSummary(view: PlanStepView | undefined): string {
		if (!view) return "";
		const dependencies = view.step.dependsOn.length
			? view.step.dependsOn.join(",")
			: "root";
		const downstream = view.dependents.length
			? view.dependents.map((step) => step.id).join(",")
			: "end";
		return ` ${paint(this.theme, statusRole(view.status), `${statusIcon(view.status)} ${view.step.id} ${statusLabel(view.status)}`)}  ${paint(this.theme, "primary", this.theme.bold(view.step.title))}  ${paint(this.theme, "secondary", `← ${dependencies}  → ${downstream}`)}`;
	}

	private renderSelectedGoal(view: PlanStepView | undefined): string {
		if (!view) return "";
		return ` ${paint(this.theme, "primary", `Goal: ${view.step.goal}`)}`;
	}

	private getRelatedStepIds(): Set<string> {
		if (!this.dependencyHighlight) {
			return new Set(this.getVisibleViews().map((view) => view.step.id));
		}
		const related = new Set<string>([this.selectedStepId]);
		const addAncestors = (stepId: string): void => {
			const view = this.viewsById.get(stepId);
			for (const dependencyId of view?.step.dependsOn ?? []) {
				if (related.has(dependencyId)) continue;
				related.add(dependencyId);
				addAncestors(dependencyId);
			}
		};
		const addDescendants = (stepId: string): void => {
			const view = this.viewsById.get(stepId);
			for (const dependent of view?.dependents ?? []) {
				if (related.has(dependent.id)) continue;
				related.add(dependent.id);
				addDescendants(dependent.id);
			}
		};
		addAncestors(this.selectedStepId);
		addDescendants(this.selectedStepId);
		return related;
	}

	private navigateVertical(direction: -1 | 1): void {
		const current = this.getSelectedLayoutNode();
		if (!current || !this.lastLayout) return;
		const rank = this.lastLayout.ranks[current.rank] ?? [];
		const nextIndex = Math.max(
			0,
			Math.min(current.order + direction, rank.length - 1),
		);
		const next = rank[nextIndex];
		if (next) this.selectStep(next.view.step.id);
	}

	private navigateHorizontal(direction: -1 | 1): void {
		const current = this.getSelectedLayoutNode();
		if (!current || !this.lastLayout) return;
		const targetRank = this.lastLayout.ranks[current.rank + direction];
		if (!targetRank || targetRank.length === 0) return;
		const currentCenter = current.y + current.height / 2;
		const next = [...targetRank].sort(
			(left, right) =>
				Math.abs(left.y + left.height / 2 - currentCenter) -
				Math.abs(right.y + right.height / 2 - currentCenter),
		)[0];
		if (next) this.selectStep(next.view.step.id);
	}

	private cycleFrontier(): void {
		const frontier = this.views.filter(
			(view) =>
				view.status === "in_progress" || view.status === "ready",
		);
		if (frontier.length === 0) return;
		const currentIndex = frontier.findIndex(
			(view) => view.step.id === this.selectedStepId,
		);
		const next = frontier[(currentIndex + 1 + frontier.length) % frontier.length];
		if (next) this.selectStep(next.step.id);
	}

	private returnToCurrent(): void {
		const current = this.views.find(
			(view) => view.status === "in_progress",
		);
		if (current) this.selectStep(current.step.id);
	}

	private returnToCurrentOrFrontier(): void {
		const visible = this.getVisibleViews();
		const target =
			visible.find((view) => view.status === "in_progress") ??
			visible.find((view) => view.status === "ready") ??
			visible[0];
		if (target) this.selectedStepId = target.step.id;
	}

	private getVisibleViews(): readonly PlanStepView[] {
		if (this.showResolved) return this.views;
		const resolved = this.views.filter(
			(view) => view.status === "done" || view.status === "superseded",
		);
		const sourceOrder = new Map(
			this.views.map((view, index) => [view.step.id, index]),
		);
		const recentResolved = new Set(
			[...resolved]
				.sort((left, right) => {
					const timeDifference =
						Date.parse(right.step.updatedAt) - Date.parse(left.step.updatedAt);
					if (timeDifference !== 0) return timeDifference;
					return (
						(sourceOrder.get(right.step.id) ?? 0) -
						(sourceOrder.get(left.step.id) ?? 0)
					);
				})
				.slice(0, RECENT_RESOLVED_STEP_LIMIT)
				.map((view) => view.step.id),
		);
		return this.views.filter(
			(view) =>
				(view.status !== "done" && view.status !== "superseded") ||
				recentResolved.has(view.step.id),
		);
	}

	private selectStep(stepId: string): void {
		this.selectedStepId = stepId;
		this.requestRender();
	}

	private getSelectedLayoutNode(): GraphNodeLayout | undefined {
		return this.lastLayout?.nodes.find(
			(node) => node.view.step.id === this.selectedStepId,
		);
	}

	private getSelectedView(): PlanStepView | undefined {
		return this.viewsById.get(this.selectedStepId);
	}

	private handleDetailInput(data: string): void {
		if (this.isCancelInput(data)) {
			this.detailOpen = false;
			this.detailScroll = 0;
			this.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			this.detailScroll = Math.max(0, this.detailScroll - 1);
			this.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.detailScroll = Math.min(
				this.lastDetailMaxScroll,
				this.detailScroll + 1,
			);
			this.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.detailScroll = Math.max(
				0,
				this.detailScroll - this.getDetailBodyHeight(),
			);
			this.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.detailScroll = Math.min(
				this.lastDetailMaxScroll,
				this.detailScroll + this.getDetailBodyHeight(),
			);
			this.requestRender();
		}
	}

	private renderDetail(width: number): string[] {
		const frame = new ModalFrame(this.theme, width);
		const selected = this.getSelectedView();
		if (!selected) return [frame.top("Plan Step"), frame.bottom()];
		const bodyHeight = this.getDetailBodyHeight();
		const detailLines = this.buildDetailLines(selected, frame.innerWidth);
		this.lastDetailMaxScroll = Math.max(0, detailLines.length - bodyHeight);
		this.detailScroll = Math.min(this.detailScroll, this.lastDetailMaxScroll);
		const visible = detailLines.slice(
			this.detailScroll,
			this.detailScroll + bodyHeight,
		);
		while (visible.length < bodyHeight) visible.push("");
		const lines = [
			frame.top(`Plan Step · ${selected.step.id}`),
			frame.row(
				` ${paint(this.theme, statusRole(selected.status), `${statusIcon(selected.status)} ${statusLabel(selected.status)}`)}  ${paint(this.theme, "tertiary", `${selected.step.phase} · updated ${new Date(selected.step.updatedAt).toLocaleString()} by ${selected.step.updatedBy}`)}`,
			),
			frame.separator(),
		];
		for (const line of visible) lines.push(frame.row(line));
		lines.push(frame.separator());
		const scroll =
			this.lastDetailMaxScroll > 0
				? ` · ${this.detailScroll + 1}-${Math.min(detailLines.length, this.detailScroll + bodyHeight)}/${detailLines.length}`
				: "";
		lines.push(
			frame.row(
				` ${paint(this.theme, "tertiary", `↑↓ scroll · PgUp/PgDn page · Esc back${scroll}`)}`,
			),
		);
		lines.push(frame.bottom());
		return lines;
	}

	private buildDetailLines(view: PlanStepView, width: number): string[] {
		const lines: string[] = [];
		lines.push(` ${paint(this.theme, "primary", this.theme.bold(view.step.title))}`);
		lines.push("");
		lines.push(` ${this.sectionTitle("DEPENDENCIES")}`);
		lines.push(
			`   ${paint(this.theme, "secondary", `← ${view.step.dependsOn.join(", ") || "root"}`)}`,
		);
		lines.push(
			`   ${paint(this.theme, "secondary", `→ ${view.dependents.map((step) => step.id).join(", ") || "end"}`)}`,
		);
		lines.push("");
		lines.push(` ${this.sectionTitle("GOAL")}`);
		this.pushWrappedText(lines, view.step.goal, width, "primary", " ");
		lines.push("");
		lines.push(` ${this.sectionTitle("WORK")}`);
		for (const item of view.step.work) {
			this.pushWrappedBullet(
				lines,
				paint(this.theme, "secondary", "• "),
				item,
				width,
				"primary",
				" ",
			);
		}
		lines.push("");
		lines.push(` ${this.sectionTitle("DEFINITION OF DONE")}`);
		for (const criterion of view.step.acceptance) {
			this.pushWrappedBullet(
				lines,
				paint(this.theme, "secondary", "□ "),
				criterion,
				width,
				"primary",
				" ",
			);
		}
		lines.push("");
		lines.push(` ${this.sectionTitle("RELATED FILES")}`);
		if (view.step.relatedFiles.length === 0) {
			lines.push(`   ${paint(this.theme, "tertiary", "No files recorded")}`);
		} else {
			for (const path of view.step.relatedFiles) {
				this.pushWrappedBullet(
					lines,
					paint(this.theme, "tertiary", "· "),
					path,
					width,
					"code",
					" ",
				);
			}
		}
		return lines;
	}

	private sectionTitle(title: string): string {
		return paint(this.theme, "primary", this.theme.bold(title));
	}

	private pushWrappedText(
		lines: string[],
		text: string,
		width: number,
		color: SemanticColorRole,
		indent = "",
	): void {
		const available = Math.max(1, width - visibleWidth(indent));
		for (const line of wrapTextWithAnsi(paint(this.theme, color, text), available)) {
			lines.push(`${indent}${line}`);
		}
	}

	private pushWrappedBullet(
		lines: string[],
		prefix: string,
		text: string,
		width: number,
		color: SemanticColorRole,
		outerIndent = "",
	): void {
		const prefixWidth = visibleWidth(prefix);
		const available = Math.max(
			1,
			width - visibleWidth(outerIndent) - prefixWidth,
		);
		const wrapped = wrapTextWithAnsi(
			paint(this.theme, color, text),
			available,
		);
		for (let index = 0; index < wrapped.length; index++) {
			lines.push(
				`${outerIndent}${index === 0 ? prefix : " ".repeat(prefixWidth)}${wrapped[index] ?? ""}`,
			);
		}
	}

	private getTargetModalHeight(): number {
		return this.tui.terminal?.rows ?? DEFAULT_TERMINAL_ROWS;
	}

	private getOverviewBodyHeight(): number {
		return Math.max(4, this.getTargetModalHeight() - 8);
	}

	private getDetailBodyHeight(): number {
		return Math.max(4, this.getTargetModalHeight() - 6);
	}
}

export async function openPlanDashboard(
	ctx: ExtensionContext,
	plan?: Plan,
): Promise<void> {
	let resolvedPlan = plan;
	let restoreError: string | undefined;
	let staleness = { workSinceUpdate: 0, turnsSinceUpdate: 0 };
	if (!resolvedPlan) {
		const runtime = new PlanRuntime();
		runtime.restore(ctx.sessionManager.getBranch());
		const state = runtime.getState();
		resolvedPlan = state.plan;
		restoreError = state.error;
		staleness = {
			workSinceUpdate: state.workSinceUpdate,
			turnsSinceUpdate: state.turnsSinceUpdate,
		};
	}
	if (!resolvedPlan) {
		ctx.ui.notify(
			restoreError
				? `Living plan state is invalid: ${restoreError}`
				: "No living plan exists in the current session branch",
			restoreError ? "error" : "info",
		);
		return;
	}
	await showModal<void>(
		ctx,
		(modalContext) =>
			new PlanDashboardComponent(resolvedPlan, modalContext, staleness),
		{
			overlayOptions: {
				width: "100%",
				maxHeight: "100%",
				margin: 0,
			},
			unavailableMessage:
				"Plan Dashboard is only available in TUI mode",
		},
	);
}
