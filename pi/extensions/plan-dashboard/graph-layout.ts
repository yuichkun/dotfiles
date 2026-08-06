import type { PlanStepView } from "./plan.ts";

export interface GraphNodeLayout {
	view: PlanStepView;
	rank: number;
	order: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface GraphLayout {
	nodes: readonly GraphNodeLayout[];
	ranks: readonly (readonly GraphNodeLayout[])[];
	rankCount: number;
	nodeWidth: number;
	nodeHeight: number;
	worldWidth: number;
	worldHeight: number;
}

function average(values: readonly number[]): number {
	if (values.length === 0) return Number.POSITIVE_INFINITY;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizedIndex(index: number, count: number): number {
	return count <= 1 ? 0.5 : index / (count - 1);
}

export function createGraphLayout(
	views: readonly PlanStepView[],
	viewportWidth: number,
	viewportHeight: number,
): GraphLayout {
	const viewsById = new Map(views.map((view) => [view.step.id, view]));
	const sourceOrder = new Map(
		views.map((view, index) => [view.step.id, index]),
	);
	const rankById = new Map<string, number>();
	const visiting = new Set<string>();

	const resolveRank = (stepId: string): number => {
		const cached = rankById.get(stepId);
		if (cached !== undefined) return cached;
		if (visiting.has(stepId)) return 0;
		visiting.add(stepId);
		const view = viewsById.get(stepId);
		const dependencyRanks = (view?.step.dependsOn ?? [])
			.filter((id) => viewsById.has(id))
			.map(resolveRank);
		const rank =
			dependencyRanks.length === 0
				? 0
				: Math.max(...dependencyRanks) + 1;
		visiting.delete(stepId);
		rankById.set(stepId, rank);
		return rank;
	};

	for (const view of views) resolveRank(view.step.id);
	const rankCount = Math.max(0, ...rankById.values()) + 1;
	const orderedRanks: PlanStepView[][] = Array.from(
		{ length: rankCount },
		() => [],
	);
	for (const view of views) {
		orderedRanks[rankById.get(view.step.id) ?? 0]?.push(view);
	}

	const getPositions = (): Map<string, number> => {
		const positions = new Map<string, number>();
		for (const rank of orderedRanks) {
			for (let index = 0; index < rank.length; index++) {
				const view = rank[index];
				if (view) {
					positions.set(
						view.step.id,
						normalizedIndex(index, rank.length),
					);
				}
			}
		}
		return positions;
	};

	const stableSort = (
		rank: PlanStepView[],
		score: (view: PlanStepView) => number,
	): void => {
		rank.sort((left, right) => {
			const scoreDifference = score(left) - score(right);
			if (Number.isFinite(scoreDifference) && scoreDifference !== 0) {
				return scoreDifference;
			}
			return (
				(sourceOrder.get(left.step.id) ?? 0) -
				(sourceOrder.get(right.step.id) ?? 0)
			);
		});
	};

	for (let pass = 0; pass < 3; pass++) {
		let positions = getPositions();
		for (let rankIndex = 1; rankIndex < orderedRanks.length; rankIndex++) {
			const rank = orderedRanks[rankIndex];
			if (!rank) continue;
			stableSort(rank, (view) =>
				average(
					view.step.dependsOn
						.map((id) => positions.get(id))
						.filter((value): value is number => value !== undefined),
				),
			);
		}

		positions = getPositions();
		for (
			let rankIndex = orderedRanks.length - 2;
			rankIndex >= 0;
			rankIndex--
		) {
			const rank = orderedRanks[rankIndex];
			if (!rank) continue;
			stableSort(rank, (view) =>
				average(
					view.dependents
						.map((step) => positions.get(step.id))
						.filter((value): value is number => value !== undefined),
				),
			);
		}
	}

	const horizontalGap = 3;
	const preferredNodeWidth = Math.floor(
		(Math.max(1, viewportWidth) - horizontalGap * (rankCount - 1)) /
			rankCount,
	);
	const nodeWidth = Math.max(10, Math.min(18, preferredNodeWidth));
	const graphWidth =
		rankCount * nodeWidth + (rankCount - 1) * horizontalGap;
	const horizontalOffset = Math.max(
		0,
		Math.floor((viewportWidth - graphWidth) / 2),
	);
	const worldWidth = Math.max(viewportWidth, graphWidth + horizontalOffset * 2);

	const nodeHeight = viewportHeight >= 28 ? 5 : 4;
	const maxRankSize = Math.max(1, ...orderedRanks.map((rank) => rank.length));
	const minimumWorldHeight =
		2 + maxRankSize * nodeHeight + Math.max(0, maxRankSize - 1);
	const worldHeight = Math.max(viewportHeight, minimumWorldHeight);
	const nodeAreaHeight = worldHeight - 2;
	const nodes: GraphNodeLayout[] = [];
	const layoutRanks: GraphNodeLayout[][] = [];

	for (let rankIndex = 0; rankIndex < orderedRanks.length; rankIndex++) {
		const rank = orderedRanks[rankIndex] ?? [];
		const maximumGap = rank.length <= 1
			? 0
			: Math.floor(
					(nodeAreaHeight - rank.length * nodeHeight) /
						(rank.length - 1),
				);
		const verticalGap = Math.max(0, Math.min(3, maximumGap));
		const usedHeight =
			rank.length * nodeHeight + Math.max(0, rank.length - 1) * verticalGap;
		const verticalOffset =
			2 + Math.max(0, Math.floor((nodeAreaHeight - usedHeight) / 2));
		const layoutRank: GraphNodeLayout[] = [];

		for (let order = 0; order < rank.length; order++) {
			const view = rank[order];
			if (!view) continue;
			const node: GraphNodeLayout = {
				view,
				rank: rankIndex,
				order,
				x: horizontalOffset + rankIndex * (nodeWidth + horizontalGap),
				y: verticalOffset + order * (nodeHeight + verticalGap),
				width: nodeWidth,
				height: nodeHeight,
			};
			nodes.push(node);
			layoutRank.push(node);
		}
		layoutRanks.push(layoutRank);
	}

	return {
		nodes,
		ranks: layoutRanks,
		rankCount,
		nodeWidth,
		nodeHeight,
		worldWidth,
		worldHeight,
	};
}
