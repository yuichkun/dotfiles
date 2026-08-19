import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import {
	formatFooterCwd,
	parseGitPorcelain,
	StatusFooterComponent,
	type StatusFooterState,
} from "./footer.ts";

const plainTheme = {
	fg: (_color: string, text: string) => text,
} as unknown as Theme;

const tokenTheme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
} as unknown as Theme;

const ansiTheme = {
	fg: (_color: string, text: string) => `\u001b[32m${text}\u001b[39m`,
} as unknown as Theme;

function state(overrides: Partial<StatusFooterState> = {}): StatusFooterState {
	return {
		cwd: join(homedir(), "workspace", "dotfiles"),
		branch: "master",
		workingTree: "clean",
		model: "gpt-5.6-sol",
		thinkingLevel: "xhigh",
		contextPercent: 34.2,
		...overrides,
	};
}

test("formats only real home descendants with a tilde", () => {
	assert.equal(formatFooterCwd(join(homedir(), "workspace")), `~${join("/", "workspace")}`);
	assert.equal(formatFooterCwd(`${homedir()}-other/project`), `${homedir()}-other/project`);
});

test("classifies clean, staged-only, and dirty porcelain states", () => {
	assert.equal(parseGitPorcelain(""), "clean");
	assert.equal(parseGitPorcelain("M  staged.ts\nA  added.ts\n"), "staged");
	assert.equal(parseGitPorcelain(" M unstaged.ts\n"), "dirty");
	assert.equal(parseGitPorcelain("?? new.ts\n"), "dirty");
	assert.equal(parseGitPorcelain("M  staged.ts\n M unstaged.ts\n"), "dirty");
	assert.equal(parseGitPorcelain("UU conflict.ts\n"), "dirty");
});

test("uses one row with project left and runtime right when both fit", () => {
	const component = new StatusFooterComponent(() => state(), plainTheme);
	const [line] = component.render(100);
	assert.ok(line?.startsWith("~/workspace/dotfiles [master]"));
	assert.ok(line?.endsWith("gpt-5.6-sol · xhigh · ctx 34%"));
	assert.equal(visibleWidth(line!), 100);
});

test("switches to two rows instead of dropping fields at narrow widths", () => {
	const component = new StatusFooterComponent(() => state(), plainTheme);
	const lines = component.render(50);
	assert.deepEqual(lines, [
		"~/workspace/dotfiles [master]",
		"gpt-5.6-sol · xhigh · ctx 34%",
	]);
	assert.ok(lines.every((line) => visibleWidth(line) <= 50));
});

test("keeps every row width-safe while retaining recognizable runtime fields", () => {
	const component = new StatusFooterComponent(
		() => state({ cwd: join(homedir(), "a", "very", "long", "project", "directory") }),
		plainTheme,
	);
	for (const width of [24, 32, 40, 80]) {
		const lines = component.render(width);
		assert.ok(lines.length >= 1 && lines.length <= 2);
		assert.ok(lines.every((line) => visibleWidth(line) <= width));
		if (lines.length === 2) {
			assert.match(lines[1]!, /·/);
			assert.match(lines[1]!, /ctx|ct…/);
		}
	}
});

test("keeps real ANSI-styled rows width-safe at narrow and wide widths", () => {
	const component = new StatusFooterComponent(() => state(), ansiTheme);
	for (const width of [24, 40, 80, 100]) {
		const lines = component.render(width);
		for (const line of lines) {
			assert.match(line, /\u001b\[32m/);
			assert.ok(visibleWidth(line) <= width);
			assert.ok(!stripTerminalSequences(line).includes("\u001b"));
		}
		if (width === 100) assert.equal(visibleWidth(lines[0]!), 100);
	}
});

test("maps Git states to semantic colors while keeping context neutral", () => {
	for (const [workingTree, token] of [
		["clean", "success"],
		["staged", "warning"],
		["dirty", "error"],
		["unknown", "muted"],
	] as const) {
		const rendered = new StatusFooterComponent(
			() => state({ workingTree, contextPercent: 91 }),
			tokenTheme,
		).render(240).join("\n");
		assert.match(rendered, new RegExp(`<${token}>\\[master\\]</${token}>`));
		assert.match(rendered, /<muted>ctx 91%<\/muted>/);
	}
});

test("omits a missing Git branch and marks unknown context neutrally", () => {
	const rendered = new StatusFooterComponent(
		() => state({ branch: null, workingTree: "unknown", contextPercent: null }),
		tokenTheme,
	).render(240).join("\n");
	assert.doesNotMatch(rendered, /\[master\]/);
	assert.match(rendered, /<muted>ctx \?<\/muted>/);
});

test("disposes its listener exactly once", () => {
	let disposals = 0;
	const component = new StatusFooterComponent(() => state(), plainTheme, () => disposals++);
	component.dispose();
	component.dispose();
	assert.equal(disposals, 1);
});
