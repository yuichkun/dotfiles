import assert from "node:assert/strict";
import test from "node:test";
import type {
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { ModalContext } from "../shared/modal.ts";
import { PlanDashboardComponent } from "./dashboard.ts";
import { compactPlan, createOrRevisePlan, type PlanStepInput } from "./plan.ts";
import { TEST_PLAN } from "./test-fixture.ts";

const keyByAction: Record<string, string> = {
	"tui.select.up": "\u001b[A",
	"tui.select.down": "\u001b[B",
	"tui.select.pageUp": "\u001b[5~",
	"tui.select.pageDown": "\u001b[6~",
	"tui.select.confirm": "\r",
	"tui.select.cancel": "\u001b",
};

function createComponent(
	rows = 30,
	staleness = { workSinceUpdate: 0, turnsSinceUpdate: 0 },
	themeOverride?: Theme,
	plan = TEST_PLAN,
): PlanDashboardComponent {
	const theme = themeOverride ?? ({
		fg: (_color: string, text: string) => text,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		underline: (text: string) => text,
		inverse: (text: string) => text,
		strikethrough: (text: string) => text,
	} as unknown as Theme);
	const tui = {
		terminal: { rows, columns: 160 },
		requestRender: () => {},
	} as unknown as TUI;
	const keybindings = {
		matches: (data: string, action: string) =>
			keyByAction[action] === data,
	} as unknown as KeybindingsManager;
	const context: ModalContext<void> = {
		tui,
		theme,
		keybindings,
		close: () => {},
	};
	return new PlanDashboardComponent(plan, context, staleness);
}

function assertWidthSafe(lines: readonly string[], width: number): void {
	for (const [index, line] of lines.entries()) {
		assert.ok(
			visibleWidth(line) <= width,
			`line ${index + 1} is ${visibleWidth(line)} columns at width ${width}: ${line}`,
		);
	}
}

test("renders width-safe overview layouts across terminal sizes", () => {
	for (const width of [48, 80, 100, 140, 180]) {
		const lines = createComponent(30).render(width);
		assert.equal(lines.length, 30, "the overlay should use every terminal row");
		assertWidthSafe(lines, width);
		assert.match(lines.join("\n"), /Plan Dashboard · Living Plan実装/);
		assert.match(lines.join("\n"), /S04/);
	}
});

test("wide overview renders the complete 15-step DAG", () => {
	const output = createComponent(40).render(140).join("\n");
	for (let step = 1; step <= 15; step++) {
		assert.match(output, new RegExp(`S${String(step).padStart(2, "0")}`));
	}
	assert.match(output, /╔/);
	assert.match(output, /┏/);
	assert.match(output, /┄/);
	assert.match(output, /DAGダッシュボ/);
});

test("keeps body readable and non-current statuses distinct", () => {
	const calls: Array<[string, string]> = [];
	const spyTheme = {
		fg: (color: string, text: string) => {
			calls.push([color, text]);
			return text;
		},
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		underline: (text: string) => text,
		inverse: (text: string) => text,
		strikethrough: (text: string) => text,
	} as unknown as Theme;
	const component = createComponent(
		40,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		spyTheme,
	);
	component.render(140);
	assert.ok(calls.some(([color, text]) => color === "text" && text.includes("要求を整理する")));
	assert.ok(calls.some(([color, text]) => color === "text" && text.includes("● S05")));
	assert.ok(calls.some(([color, text]) => color === "muted" && text.includes("○ S07")));
	assert.ok(!calls.some(([color]) => color === "success"));
	assert.ok(!calls.some(([color]) => color === "warning"));
	assert.ok(!calls.some(([color, text]) => color === "dim" && text.includes("○ S07")));
	assert.ok(calls.some(([color, text]) => color === "text" && text.includes("Goal:")));

	calls.length = 0;
	component.handleInput("\r");
	component.render(120);
	assert.ok(
		calls.some(
			([color, text]) =>
				color === "text" && text.includes("DAGダッシュボードを実装するが検証されている。"),
		),
	);
});

test("keeps superseded chrome tertiary while its title stays readable", () => {
	const calls: Array<[string, string]> = [];
	const spyTheme = {
		fg: (color: string, text: string) => {
			calls.push([color, text]);
			return text;
		},
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		underline: (text: string) => text,
		inverse: (text: string) => text,
		strikethrough: (text: string) => text,
	} as unknown as Theme;
	const plan = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) =>
			step.id === "S15"
				? { ...step, status: "superseded" as const, shortTitle: "SUPER" }
				: step,
		),
	};
	createComponent(
		40,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		spyTheme,
		plan,
	).render(140);

	assert.ok(calls.some(([color, text]) => color === "dim" && text.includes("⊘ S15")));
	assert.ok(
		calls.some(
			([color, text]) => color === "text" && text.includes("SUPER"),
		),
	);
	assert.ok(
		calls.some(([color, text]) => color === "muted" && text.includes("superseded")),
	);
});

test("shows factual staleness in the dashboard summary", () => {
	const output = createComponent(40, {
		workSinceUpdate: 5,
		turnsSinceUpdate: 1,
	}).render(140).join("\n");
	assert.match(output, /STALE 5 work \/ 1 turns/);
});

test("keeps automatically compacted progress visible", () => {
	const steps: PlanStepInput[] = Array.from({ length: 21 }, (_, index) => ({
		id: `S${String(index + 1).padStart(2, "0")}`,
		phase: "History",
		title: `Step ${index + 1}`,
		shortTitle: `Step ${index + 1}`,
		goal: "Bound active history",
		work: ["Perform the work"],
		acceptance: ["The work is complete"],
		dependsOn: index === 11 ? ["S01"] : [],
		relatedFiles: [],
		status: index < 11 ? "done" : "pending",
	}));
	const { plan } = createOrRevisePlan({
		input: {
			baseRevision: 0,
			title: "Automatically compacted plan",
			objective: "Keep automatic compaction visible",
			reason: "Initial plan",
			steps,
		},
		requestId: "request-dashboard-compact",
		request: "Compact dashboard history",
		now: "2026-01-02T00:00:00.000Z",
		createId: () => "plan-dashboard-compact",
	});
	for (const width of [48, 80, 100, 140]) {
		const lines = createComponent(
			40,
			{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
			undefined,
			plan,
		).render(width);
		assertWidthSafe(lines, width);
		if (width === 140) {
			assert.match(lines.join("\n"), /11\/21/);
			assert.match(lines.join("\n"), /compacted 6/);
		}
	}
	const interactive = createComponent(
		40,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		plan,
	);
	interactive.render(140);
	interactive.handleInput("d");
	assertWidthSafe(interactive.render(140), 140);
	interactive.handleInput("\r");
	const detail = interactive.render(120).join("\n");
	assert.match(detail, /Plan Step · S12/);
	assert.match(detail, /← S01/);
});

test("keeps manually compacted progress visible without requiring active history", () => {
	const { plan } = compactPlan(
		TEST_PLAN,
		{ baseRevision: TEST_PLAN.revision, note: "Archive resolved history" },
		"2026-01-02T00:00:00.000Z",
	);
	for (const width of [48, 80, 100, 140]) {
		const lines = createComponent(
			40,
			{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
			undefined,
			plan,
		).render(width);
		assertWidthSafe(lines, width);
		if (width === 140) {
			assert.match(lines.join("\n"), /3\/15/);
			assert.match(lines.join("\n"), /compacted 3/);
		}
	}

	const completed = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({ ...step, status: "done" as const })),
	};
	const archivedOnly = compactPlan(
		completed,
		{ baseRevision: completed.revision, note: "Archive completed plan" },
		"2026-01-02T00:00:00.000Z",
	).plan;
	for (const width of [48, 80, 100, 120, 140]) {
		const emptyOutput = createComponent(
			30,
			{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
			undefined,
			archivedOnly,
		).render(width);
		assertWidthSafe(emptyOutput, width);
		assert.match(emptyOutput.join("\n"), /15\/15/);
		if (width >= 80) {
			assert.match(emptyOutput.join("\n"), /compacted 15/);
		}
	}
	const emptyComponent = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		archivedOnly,
	);
	for (const input of [
		keyByAction["tui.select.up"]!,
		keyByAction["tui.select.down"]!,
		"\u001b[D",
		"\u001b[C",
		"\t",
		"d",
		"0",
		"a",
	]) {
		emptyComponent.handleInput(input);
		assertWidthSafe(emptyComponent.render(120), 120);
	}
	emptyComponent.handleInput(keyByAction["tui.select.confirm"]!);
	const afterEnter = emptyComponent.render(120).join("\n");
	assert.match(afterEnter, /Plan Dashboard/);
	assert.match(afterEnter, /a resolved/);
	assert.match(afterEnter, /h archive/);
	assert.doesNotMatch(afterEnter, /Plan Step/);
});

test("lays out successors safely when older resolved dependencies are hidden", () => {
	const plan = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step, index) => {
			if (index < 6) {
				return {
					...step,
					status: "done" as const,
					...(step.id === "S01" ? { shortTitle: "RESOLVED1" } : {}),
				};
			}
			if (step.id === "S07") {
				return {
					...step,
					shortTitle: "SUCCESSOR",
					dependsOn: [...step.dependsOn, "S01"],
				};
			}
			return step;
		}),
	};
	const component = createComponent(
		40,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		plan,
	);
	const compact = component.render(180);
	assertWidthSafe(compact, 180);
	assert.doesNotMatch(compact.join("\n"), /RESOLVED1/);
	assert.match(compact.join("\n"), /SUCCESSOR/);
	component.handleInput("a");
	component.handleInput(keyByAction["tui.select.down"]!);
	const all = component.render(180);
	assertWidthSafe(all, 180);
	assert.match(all.join("\n"), /RESOLVED1/);
	component.handleInput("a");
	assert.doesNotMatch(component.render(180).join("\n"), /RESOLVED1/);
});

test("dependency trace keeps the full map and marks trace mode", () => {
	const component = createComponent(40);
	component.render(140);
	component.handleInput("d");
	const output = component.render(140).join("\n");
	assert.match(output, /TRACE ON/);
	assert.match(output, /S01/);
	assert.match(output, /S15/);
});

test("enter opens a scrollable full detail view and escape returns", () => {
	const component = createComponent();
	component.handleInput("\r");
	const detail = component.render(120);
	assertWidthSafe(detail, 120);
	assert.match(detail.join("\n"), /Plan Step · S04/);
	assert.match(detail.join("\n"), /DEFINITION OF DONE/);

	component.handleInput("\u001b");
	assert.match(component.render(120).join("\n"), /Plan Dashboard · Living Plan実装/);
});

test("opens compacted history grouped by phase", () => {
	const noArchive = createComponent();
	assert.doesNotMatch(noArchive.render(120).join("\n"), /h archive/);
	noArchive.handleInput("h");
	assert.doesNotMatch(noArchive.render(120).join("\n"), /Plan Archive/);
	const completed = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({ ...step, status: "done" as const })),
	};
	const { plan } = compactPlan(
		completed,
		{ baseRevision: completed.revision, note: "Archive history" },
		"2026-01-02T00:00:00.000Z",
	);
	const component = createComponent(
		10,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		plan,
	);
	assert.match(component.render(120).join("\n"), /compacted 15/);
	component.handleInput("h");
	for (const width of [48, 80, 120, 140]) {
		const archive = component.render(width);
		assertWidthSafe(archive, width);
		assert.match(archive.join("\n"), /Plan Archive/);
		if (width === 48) {
			assert.match(archive.join("\n"), /Full step details remain/);
			assert.match(archive.join("\n"), /earlier plan tool/);
			assert.match(archive.join("\n"), /results on this branch/);
			assert.match(archive.join("\n"), /✔ 3 · ⊘ 0/);
		}
		if (width >= 80) assert.match(archive.join("\n"), /S01, S02, S03/);
	}
	const firstPage = component.render(120).join("\n");
	component.handleInput(keyByAction["tui.select.pageDown"]!);
	const secondPage = component.render(120).join("\n");
	assert.notEqual(secondPage, firstPage);
	assert.match(secondPage, /6-10\//);
	component.handleInput(keyByAction["tui.select.up"]!);
	assert.match(component.render(120).join("\n"), /5-9\//);
	component.handleInput(keyByAction["tui.select.down"]!);
	assert.match(component.render(120).join("\n"), /6-10\//);
	component.handleInput(keyByAction["tui.select.pageUp"]!);
	assert.equal(component.render(120).join("\n"), firstPage);
	component.handleInput(keyByAction["tui.select.cancel"]!);
	assert.match(component.render(120).join("\n"), /Plan Dashboard/);
});
