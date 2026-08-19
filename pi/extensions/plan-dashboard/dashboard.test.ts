import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionContext,
	KeybindingsManager,
	SessionEntry,
	Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { ModalContext } from "../shared/modal.ts";
import { openPlanDashboard, PlanDashboardComponent } from "./dashboard.ts";
import { compactPlan, createOrRevisePlan, type PlanStepInput } from "./plan.ts";
import { TEST_PLAN } from "./test-fixture.ts";

const keyByAction: Record<string, string> = {
	"tui.select.up": "\u001b[A",
	"tui.select.down": "\u001b[B",
	"tui.select.right": "\u001b[C",
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
	enabled = true,
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
	return new PlanDashboardComponent(plan, context, staleness, enabled);
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
		const output = lines.join("\n");
		assert.match(output, /Plan Dashboard · Living Plan実装/);
		assert.match(output, /OUTCOME/);
		assert.match(output, /▶ NOW/);
		assert.match(output, /STAGES/);
		assert.match(output, /S04/);
	}
});

test("degrades the overview before shrinking the graph on short terminals", () => {
	const full = createComponent(16).render(80);
	assert.equal(full.length, 16);
	assertWidthSafe(full, 80);
	assert.match(full.join("\n"), /OUTCOME/);
	assert.match(full.join("\n"), /▶ NOW/);
	assert.match(full.join("\n"), /STAGES/);

	const compact = createComponent(15).render(80);
	assert.equal(compact.length, 15);
	assertWidthSafe(compact, 80);
	assert.match(compact.join("\n"), /OUTCOME/);
	assert.match(compact.join("\n"), /▶ NOW/);
	assert.doesNotMatch(compact.join("\n"), /STAGES/);

	const minimal = createComponent(14).render(80);
	assert.equal(minimal.length, 14);
	assertWidthSafe(minimal, 80);
	assert.match(minimal.join("\n"), /▶ NOW/);
	assert.doesNotMatch(minimal.join("\n"), /OUTCOME/);

	for (const rows of [13, 12, 11]) {
		const constrained = createComponent(rows).render(80);
		assert.equal(constrained.length, rows);
		assertWidthSafe(constrained, 80);
		assert.match(constrained.join("\n"), /▶ NOW/);
	}
});

test("shows NEXT, completion, or waiting when nothing is in progress", () => {
	const nextPlan = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) =>
			step.id === "S04" ? { ...step, status: "done" as const } : step,
		),
	};
	const next = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		nextPlan,
	).render(120).join("\n");
	assert.match(next, /● NEXT {2}S05/);
	assert.doesNotMatch(next, /▶ NOW/);

	const reorderedNextPlan = {
		...nextPlan,
		steps: [
			...nextPlan.steps.filter((step) => step.id === "S06"),
			...nextPlan.steps.filter((step) => step.id === "S05"),
			...nextPlan.steps.filter(
				(step) => step.id !== "S05" && step.id !== "S06",
			),
		],
	};
	assert.match(
		createComponent(
			30,
			{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
			undefined,
			reorderedNextPlan,
		).render(120).join("\n"),
		/● NEXT {2}S06/,
	);

	const completedPlan = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({ ...step, status: "done" as const })),
	};
	const completed = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		completedPlan,
	).render(120).join("\n");
	assert.match(completed, /✔ PLAN COMPLETE/);
	assert.doesNotMatch(completed, /● NEXT/);

	const supersededPlan = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({
			...step,
			status: "superseded" as const,
		})),
	};
	const superseded = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		supersededPlan,
	).render(120).join("\n");
	assert.match(superseded, /⊘ PLAN SUPERSEDED/);
	assert.doesNotMatch(superseded, /PLAN COMPLETE/);

	const compactedCompletedPlan = {
		...supersededPlan,
		archivedSteps: [
			{
				id: "S00",
				phase: "調査",
				status: "done" as const,
				compactedAt: "2026-01-02T00:00:00.000Z",
			},
		],
	};
	const compactedCompleted = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		compactedCompletedPlan,
	).render(120).join("\n");
	assert.match(compactedCompleted, /✔ PLAN COMPLETE/);
	assert.doesNotMatch(compactedCompleted, /PLAN SUPERSEDED/);

	const blockedPlan = {
		...TEST_PLAN,
		archivedSteps: [],
		steps: TEST_PLAN.steps.slice(0, 2).map((step, index) => ({
			...step,
			status: "pending" as const,
			dependsOn: [index === 0 ? "S02" : "S01"],
		})),
	};
	const blocked = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		blockedPlan,
	).render(120).join("\n");
	assert.match(blocked, /○ WAITING {2}S01/);
	assert.doesNotMatch(blocked, /PLAN COMPLETE/);
});

test("wide overview renders the complete 15-step DAG", () => {
	const output = createComponent(40).render(140).join("\n");
	assert.match(output, /OUTCOME {2}依存関係付きの計画を継続的に更新する。/);
	assert.match(output, /▶ NOW {2}S04 {2}DAGダッシュボードを実装する/);
	for (let step = 1; step <= 15; step++) {
		assert.match(output, new RegExp(`S${String(step).padStart(2, "0")}`));
	}
	assert.match(output, /╔/);
	assert.match(output, /┏/);
	assert.match(output, /┄/);
	assert.match(output, /DAGダッシュボ/);
	assert.match(output, /✔ 調査 3\/3/);
	assert.match(output, /▶ UI 0\/2/);
	assert.match(output, /● 基盤/);
	assert.match(output, /✔ 調査 3\/3.*▶ UI 0\/2.*● 基盤/);
});

test("orders and classifies archived and active phase progress", () => {
	const plan = {
		...TEST_PLAN,
		archivedSteps: [
			{
				id: "A01",
				phase: "履歴",
				status: "done" as const,
				compactedAt: "2026-01-02T00:00:00.000Z",
			},
			{
				id: "A02",
				phase: "共有",
				status: "done" as const,
				compactedAt: "2026-01-02T00:00:00.000Z",
			},
			{
				id: "A03",
				phase: "廃止",
				status: "superseded" as const,
				compactedAt: "2026-01-02T00:00:00.000Z",
			},
			{
				id: "A04",
				phase: "待機",
				status: "done" as const,
				compactedAt: "2026-01-02T00:00:00.000Z",
			},
		],
		steps: [
			{ ...TEST_PLAN.steps[0]!, phase: "共有" },
			{
				...TEST_PLAN.steps[3]!,
				phase: "現在",
				dependsOn: ["S01"],
			},
			{
				...TEST_PLAN.steps[4]!,
				phase: "次",
				dependsOn: ["S01"],
			},
			{
				...TEST_PLAN.steps[2]!,
				phase: "未着手",
				status: "pending" as const,
				dependsOn: ["S01"],
			},
			{
				...TEST_PLAN.steps[5]!,
				phase: "待機",
				dependsOn: ["S03"],
			},
			{
				...TEST_PLAN.steps[6]!,
				phase: "停止",
				dependsOn: ["S03"],
			},
		],
	};
	const output = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		plan,
	).render(240).join("\n");
	assert.match(
		output,
		/✔ 履歴 1\/1.*✔ 共有 2\/2.*⊘ 廃止 1\/1.*○ 待機 1\/2.*▶ 現在 0\/1.*● 次.*● 未着手.*○ 停止/,
	);
	assert.doesNotMatch(output, /○ 停止 \d/);
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

test("checks every Definition of Done item only for completed steps", () => {
	const incomplete = createComponent();
	incomplete.handleInput("\r");
	const incompleteDetail = incomplete.render(120).join("\n");
	assert.match(incompleteDetail, /IN PROGRESS/);
	assert.match(incompleteDetail, /□ DAGダッシュボードを実装するが検証されている。/);
	assert.doesNotMatch(incompleteDetail, /✓ DAGダッシュボードを実装するが検証されている。/);

	const completedPlan = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({ ...step, status: "done" as const })),
	};
	const completed = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		completedPlan,
	);
	completed.handleInput("\r");
	const completedDetail = completed.render(120).join("\n");
	assert.match(completedDetail, /✓ .*が検証されている。/);
	assert.doesNotMatch(completedDetail, /□ .*が検証されている。/);

	const pendingPlan = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) =>
			step.id === "S04" ? { ...step, status: "done" as const } : step,
		),
	};
	const pending = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		pendingPlan,
	);
	assert.match(pending.render(120).join("\n"), /● S05 READY/);
	pending.handleInput("\r");
	assert.match(pending.render(120).join("\n"), /□ 評価基準を決めるが検証されている。/);

	const blockedPlan = {
		...TEST_PLAN,
		archivedSteps: [],
		steps: TEST_PLAN.steps.slice(0, 2).map((step, index) => ({
			...step,
			status: "pending" as const,
			dependsOn: index === 0 ? [] : ["S01"],
		})),
	};
	const blocked = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		blockedPlan,
	);
	assert.match(blocked.render(120).join("\n"), /● S01 READY/);
	blocked.handleInput(keyByAction["tui.select.right"]!);
	assert.match(blocked.render(120).join("\n"), /○ S02 WAITING/);
	blocked.handleInput("\r");
	const blockedDetail = blocked.render(120).join("\n");
	assert.match(blockedDetail, /○ WAITING/);
	assert.match(blockedDetail, /□ Pi APIを調査するが検証されている。/);
	assert.doesNotMatch(blockedDetail, /✓ Pi APIを調査するが検証されている。/);

	const supersededPlan = {
		...TEST_PLAN,
		steps: TEST_PLAN.steps.map((step) => ({
			...step,
			status: "superseded" as const,
		})),
	};
	const superseded = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		supersededPlan,
	);
	superseded.handleInput("\r");
	const supersededDetail = superseded.render(120).join("\n");
	assert.match(supersededDetail, /□ .*が検証されている。/);
	assert.doesNotMatch(supersededDetail, /✓ .*が検証されている。/);
});

test("marks a paused plan without hiding its dashboard", () => {
	assert.doesNotMatch(createComponent().render(120).join("\n"), /PAUSED/);
	const component = createComponent(
		30,
		{ workSinceUpdate: 0, turnsSinceUpdate: 0 },
		undefined,
		TEST_PLAN,
		false,
	);
	assert.match(
		component.render(120).join("\n"),
		/Plan Dashboard · PAUSED · Living Plan実装/,
	);
	component.handleInput("\r");
	assert.match(component.render(120).join("\n"), /Plan Step · PAUSED · S04/);
});

test("restores paused state through the dashboard entry point", async () => {
	const branch = [
		{
			type: "message",
			message: {
				role: "toolResult",
				toolName: "plan",
				details: { kind: "plan", operation: "set", plan: TEST_PLAN },
				isError: false,
			},
		},
		{
			type: "custom",
			customType: "living-plan.control",
			data: {
				schemaVersion: 1,
				id: "control-1",
				enabled: false,
				createdAt: TEST_PLAN.createdAt,
			},
		},
	] as unknown as SessionEntry[];
	let output = "";
	const theme = {
		fg: (_color: string, text: string) => text,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		inverse: (text: string) => text,
	} as unknown as Theme;
	const keybindings = {
		matches: (data: string, action: string) => keyByAction[action] === data,
	} as unknown as KeybindingsManager;
	const tui = {
		terminal: { rows: 30, columns: 120 },
		requestRender: () => {},
	} as unknown as TUI;
	const ctx = {
		mode: "tui",
		sessionManager: { getBranch: () => branch },
		ui: {
			notify: () => {},
			custom: async (factory: Function) => {
				const component = factory(tui, theme, keybindings, () => {});
				output = component.render(120).join("\n");
				return undefined;
			},
		},
	} as unknown as ExtensionContext;
	await openPlanDashboard(ctx);
	assert.match(output, /Plan Dashboard · PAUSED · Living Plan実装/);
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
		false,
	);
	assert.match(component.render(120).join("\n"), /compacted 15/);
	component.handleInput("h");
	for (const width of [48, 80, 120, 140]) {
		const archive = component.render(width);
		assertWidthSafe(archive, width);
		assert.match(
			archive.join("\n"),
			/Plan Archive · PAUSED · Living Plan実装/,
		);
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
