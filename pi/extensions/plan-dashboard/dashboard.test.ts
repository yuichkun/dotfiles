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
): PlanDashboardComponent {
	const theme = {
		fg: (_color: string, text: string) => text,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		underline: (text: string) => text,
		inverse: (text: string) => text,
		strikethrough: (text: string) => text,
	} as unknown as Theme;
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
	return new PlanDashboardComponent(TEST_PLAN, context, staleness);
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

test("shows factual staleness in the dashboard summary", () => {
	const output = createComponent(40, {
		workSinceUpdate: 5,
		turnsSinceUpdate: 1,
	}).render(140).join("\n");
	assert.match(output, /STALE 5 work \/ 1 turns/);
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
