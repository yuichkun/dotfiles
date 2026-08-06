import assert from "node:assert/strict";
import test from "node:test";
import { createGraphLayout } from "./graph-layout.ts";
import { buildPlanViews } from "./plan.ts";
import { TEST_PLAN } from "./test-fixture.ts";

const views = buildPlanViews(TEST_PLAN);

test("lays the plan out in seven left-to-right ranks", () => {
	const layout = createGraphLayout(views, 138, 32);
	assert.equal(layout.rankCount, 7);
	assert.deepEqual(
		layout.ranks.map((rank) => rank.map((node) => node.view.step.id).sort()),
		[
			["S01", "S02", "S03"],
			["S04", "S05", "S06"],
			["S07", "S10", "S11", "S12"],
			["S08", "S09"],
			["S13"],
			["S14"],
			["S15"],
		],
	);
});

test("fits every node into a 140x40 dashboard graph area", () => {
	const layout = createGraphLayout(views, 138, 32);
	assert.ok(layout.worldWidth <= 138);
	assert.ok(layout.worldHeight <= 32);
	for (const node of layout.nodes) {
		assert.ok(node.x >= 0 && node.x + node.width <= layout.worldWidth);
		assert.ok(node.y >= 0 && node.y + node.height <= layout.worldHeight);
	}
});

test("uses compact nodes so a 100x30 dashboard still shows the whole graph", () => {
	const layout = createGraphLayout(views, 98, 22);
	assert.ok(layout.worldWidth <= 98);
	assert.ok(layout.worldHeight <= 22);
	assert.equal(layout.nodeHeight, 4);
});
