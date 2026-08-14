import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { PlanProgressHeader } from "./progress-header.ts";
import { TEST_PLAN } from "./test-fixture.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	italic: (text: string) => text,
	underline: (text: string) => text,
	inverse: (text: string) => text,
	strikethrough: (text: string) => text,
} as unknown as Theme;

function header(workSinceUpdate = 0, turnsSinceUpdate = 0): PlanProgressHeader {
	return new PlanProgressHeader(
		{ plan: TEST_PLAN, workSinceUpdate, turnsSinceUpdate },
		theme,
	);
}

test("renders a fixed-size progress bar and current-step line", () => {
	const lines = header().render(120);
	assert.equal(lines.length, 4);
	assert.match(lines.join("\n"), /PROGRESS/);
	assert.match(lines.join("\n"), /◆/);
	assert.match(lines.join("\n"), /▶ NOW  S04/);
	assert.match(lines.join("\n"), /DAGダッシュボードを実装する/);
	assert.doesNotMatch(lines.join("\n"), /3\/15/);
	assert.doesNotMatch(lines.join("\n"), /STALE/);
});

test("shows factual staleness only after the threshold", () => {
	assert.match(header(5, 1).render(120).join("\n"), /STALE 5 work \/ 1 turns/);
});

test("uses focus for NOW and NEXT while keeping completion neutral", () => {
	const tokenTheme = {
		fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	} as unknown as Theme;
	const current = new PlanProgressHeader(
		{ plan: TEST_PLAN, workSinceUpdate: 0, turnsSinceUpdate: 0 },
		tokenTheme,
	).render(180).join("\n");
	assert.match(current, /<accent>▶ NOW<\/accent>/);
	assert.doesNotMatch(current, /<success>/);

	const nextPlan = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) =>
			step.id === "S04" ? { ...step, status: "done" as const } : step,
		),
	};
	const next = new PlanProgressHeader(
		{ plan: nextPlan, workSinceUpdate: 0, turnsSinceUpdate: 0 },
		tokenTheme,
	).render(180).join("\n");
	assert.match(next, /<accent>● NEXT<\/accent>/);
	assert.doesNotMatch(next, /<success>● NEXT<\/success>/);
});

test("separates neutral completed progress from tertiary superseded progress", () => {
	const tokenTheme = {
		fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	} as unknown as Theme;
	const plan = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) =>
			step.id === "S01" ? { ...step, status: "superseded" as const } : step,
		),
	};
	const output = new PlanProgressHeader(
		{ plan, workSinceUpdate: 0, turnsSinceUpdate: 0 },
		tokenTheme,
	).render(240).join("\n");
	assert.match(output, /<text>━+<\/text>/);
	assert.match(output, /<dim>━+<\/dim>/);
	assert.doesNotMatch(output, /<success>/);
});

test("uses warning only for severe staleness", () => {
	const tokenTheme = {
		fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	} as unknown as Theme;
	const mild = new PlanProgressHeader(
		{ plan: TEST_PLAN, workSinceUpdate: 5, turnsSinceUpdate: 1 },
		tokenTheme,
	).render(240).join("\n");
	const severe = new PlanProgressHeader(
		{ plan: TEST_PLAN, workSinceUpdate: 12, turnsSinceUpdate: 1 },
		tokenTheme,
	).render(240).join("\n");
	assert.match(mild, /<muted> · ⚠ STALE/);
	assert.doesNotMatch(mild, /<warning>/);
	assert.match(severe, /<warning> · ⚠ STALE/);
});

test("keeps every header line within the terminal width", () => {
	for (const width of [40, 80, 120, 180]) {
		const lines = header(12, 8).render(width);
		for (const line of lines) {
			assert.ok(visibleWidth(line) <= width);
		}
	}
});
