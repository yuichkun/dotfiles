import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { compactPlan } from "./plan.ts";
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

test("renders only title, progress, count, and current-step title", () => {
	const lines = header().render(120);
	const output = lines.join("\n");
	assert.equal(lines.length, 4);
	assert.match(output, /PLAN · Living Plan実装/);
	assert.match(output, /◆/);
	assert.match(output, /3\/15/);
	assert.match(output, /DAGダッシュボードを実装する/);
	assert.doesNotMatch(output, /PROGRESS|NOW|NEXT|S04/);
	assert.doesNotMatch(output, /STALE/);
});

test("shows compact staleness without work or turn counts", () => {
	const output = header(5, 1).render(120).join("\n");
	assert.match(output, /⚠ STALE/);
	assert.doesNotMatch(output, /5 work|1 turns/);
});

test("uses focus for current and next titles while keeping completion neutral", () => {
	const tokenTheme = {
		fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	} as unknown as Theme;
	const current = new PlanProgressHeader(
		{ plan: TEST_PLAN, workSinceUpdate: 0, turnsSinceUpdate: 0 },
		tokenTheme,
	).render(180).join("\n");
	assert.match(current, /<accent>DAGダッシュボードを実装する<\/accent>/);
	assert.doesNotMatch(current, /NOW|S04|<success>/);

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
	assert.match(next, /<accent>評価基準を決める<\/accent>/);
	assert.doesNotMatch(next, /NEXT|S05|<success>/);
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

test("renders a completed header when every active step is compacted", () => {
	const completed = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({ ...step, status: "done" as const })),
	};
	const { plan } = compactPlan(
		completed,
		{ baseRevision: completed.revision, note: "Archive completed plan" },
		"2026-01-02T00:00:00.000Z",
	);
	const output = new PlanProgressHeader(
		{ plan, workSinceUpdate: 0, turnsSinceUpdate: 0 },
		theme,
	).render(120).join("\n");
	assert.match(output, /PLAN COMPLETE/);
});

test("keeps unbounded compacted totals width-safe", () => {
	const plan = {
		...TEST_PLAN,
		archivedSteps: Array.from({ length: 120 }, (_, index) => ({
			id: `A${String(index + 1).padStart(3, "0")}`,
			phase: "History",
			status: "done" as const,
			compactedAt: "2026-01-02T00:00:00.000Z",
		})),
	};
	for (const width of [40, 80, 120, 180]) {
		const lines = new PlanProgressHeader(
			{ plan, workSinceUpdate: 0, turnsSinceUpdate: 0 },
			theme,
		).render(width);
		assert.match(lines.join("\n"), /123\/135/);
		for (const line of lines) assert.ok(visibleWidth(line) <= width);
	}
});

test("keeps every header line within the terminal width", () => {
	for (const width of [40, 80, 120, 180]) {
		const lines = header(12, 8).render(width);
		for (const line of lines) {
			assert.ok(visibleWidth(line) <= width);
		}
	}
});
