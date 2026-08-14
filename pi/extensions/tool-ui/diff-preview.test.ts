import assert from "node:assert/strict";
import test from "node:test";
import {
	initTheme,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	stripTerminalSequences,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	highlightDiffPreviewRows,
	parseDisplayDiff,
	selectDiffPreviewRows,
	SyntaxDiffPreviewComponent,
	type DiffPreviewRow,
} from "./diff-preview.ts";

const tokenTheme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
} as unknown as Theme;

const plainTheme = {
	fg: (_color: string, text: string) => text,
} as unknown as Theme;

function display(rows: readonly DiffPreviewRow[]): string[] {
	return rows.map((row) =>
		row.kind === "ellipsis"
			? row.omission ?? "..."
			: `${row.kind}:${row.lineNumber.trim()}:${row.code}`,
	);
}

test("parses Pi display diffs without losing padding, empty code, or Unicode", () => {
	const rows = parseDisplayDiff([
		"  8 const before = true;",
		"- 9 const message = 'old';",
		"+ 9 const message = '新';",
		" 10 ",
		"    ...",
	].join("\n"));

	assert.deepEqual(rows, [
		{ kind: "context", lineNumber: " 8", code: "const before = true;" },
		{ kind: "removed", lineNumber: " 9", code: "const message = 'old';" },
		{ kind: "added", lineNumber: " 9", code: "const message = '新';" },
		{ kind: "context", lineNumber: "10", code: "" },
		{ kind: "ellipsis", lineNumber: "", code: "..." },
	]);
});

test("normalizes CRLF while preserving a final blank source line", () => {
	const rows = parseDisplayDiff("-1 old\r\n+1 new\r\n 2 ");
	assert.deepEqual(display(rows), [
		"removed:1:old",
		"added:1:new",
		"context:2:",
	]);
});

test("keeps all four leading and trailing context lines for a normal hunk", () => {
	const diff = [
		"   ...",
		"  6 before-1",
		"  7 before-2",
		"  8 before-3",
		"  9 before-4",
		"-10 old",
		"+10 new",
		" 11 after-1",
		" 12 after-2",
		" 13 after-3",
		" 14 after-4",
		"   ...",
	].join("\n");

	const selected = selectDiffPreviewRows(parseDisplayDiff(diff));
	assert.deepEqual(display(selected), [
		"...",
		"context:6:before-1",
		"context:7:before-2",
		"context:8:before-3",
		"context:9:before-4",
		"removed:10:old",
		"added:10:new",
		"context:11:after-1",
		"context:12:after-2",
		"context:13:after-3",
		"context:14:after-4",
		"...",
	]);
});

test("preserves complete context windows around two distant hunks", () => {
	const diff = [
		"  1 before-a",
		"- 2 old-a",
		"+ 2 new-a",
		"  3 after-a",
		"    ...",
		" 20 before-b",
		"-21 old-b",
		"+21 new-b",
		" 22 after-b",
	].join("\n");

	const selected = selectDiffPreviewRows(parseDisplayDiff(diff), { maxRows: 12 });
	assert.deepEqual(display(selected), [
		"context:1:before-a",
		"removed:2:old-a",
		"added:2:new-a",
		"context:3:after-a",
		"...",
		"context:20:before-b",
		"removed:21:old-b",
		"added:21:new-b",
		"context:22:after-b",
	]);
});

test("compacts a huge changed region symmetrically before dropping context", () => {
	const lines = [
		"  1 before-1",
		"  2 before-2",
		"  3 before-3",
		"  4 before-4",
		...Array.from({ length: 30 }, (_, index) => `+${String(index + 5).padStart(2, " ")} added-${index + 1}`),
		" 35 after-1",
		" 36 after-2",
		" 37 after-3",
		" 38 after-4",
	];

	const selected = selectDiffPreviewRows(parseDisplayDiff(lines.join("\n")), { maxRows: 16 });
	const rendered = display(selected);
	assert.equal(rendered.length, 16);
	assert.deepEqual(rendered.slice(0, 4), [
		"context:1:before-1",
		"context:2:before-2",
		"context:3:before-3",
		"context:4:before-4",
	]);
	assert.equal(rendered[8], "23 changed lines omitted");
	assert.deepEqual(rendered.slice(-4), [
		"context:35:after-1",
		"context:36:after-2",
		"context:37:after-3",
		"context:38:after-4",
	]);
	assert.ok(rendered.some((line) => line === "added:5:added-1"));
	assert.ok(rendered.some((line) => line === "added:34:added-30"));
});

test("omits later hunks as units instead of slicing away trailing context", () => {
	const hunk = (base: number, name: string): string[] => [
		` ${String(base).padStart(2, " ")} before-${name}`,
		`-${String(base + 1).padStart(2, " ")} old-${name}`,
		`+${String(base + 1).padStart(2, " ")} new-${name}`,
		` ${String(base + 2).padStart(2, " ")} after-${name}`,
	];
	const diff = [...hunk(1, "a"), "    ...", ...hunk(20, "b"), "    ...", ...hunk(40, "c")];

	const selected = selectDiffPreviewRows(parseDisplayDiff(diff.join("\n")), { maxRows: 7 });
	assert.deepEqual(display(selected), [
		"context:1:before-a",
		"removed:2:old-a",
		"added:2:new-a",
		"context:3:after-a",
		"2 more hunks omitted",
	]);
});

test("keeps malformed resumed-session rows readable", () => {
	const selected = parseDisplayDiff("@@ legacy hunk @@\nplain text");
	assert.deepEqual(selected, [
		{ kind: "context", lineNumber: "", code: "@@ legacy hunk @@" },
		{ kind: "context", lineNumber: "", code: "plain text" },
	]);
});

test("highlights old and new streams separately and uses new syntax for context", () => {
	const rows = parseDisplayDiff([
		" 1 const value =",
		"-2   oldValue;",
		"+2   newValue;",
		" 3 return value;",
	].join("\n"));
	const calls: string[] = [];
	const highlighted = highlightDiffPreviewRows(rows, "src/value.ts", tokenTheme, (source) => {
		calls.push(source);
		const version = source.includes("oldValue") ? "old" : "new";
		return source.split("\n").map((line) => `${version}<${line}>`);
	});

	assert.deepEqual(calls, [
		"const value =\n  oldValue;\nreturn value;",
		"const value =\n  newValue;\nreturn value;",
	]);
	assert.deepEqual(highlighted.map((row) => row.highlightedCode), [
		"new<const value =>",
		"old<  oldValue;>",
		"new<  newValue;>",
		"new<return value;>",
	]);
});

test("renders syntax as code while coloring only the diff gutter", () => {
	let highlightCalls = 0;
	const component = new SyntaxDiffPreviewComponent(
		"-1 const oldValue = 1;\n+1 const newValue = 2;\n 2 return newValue;",
		"src/value.ts",
		tokenTheme,
		{},
		(source) => {
			highlightCalls++;
			return source.split("\n").map((line) => `<syntax>${line}</syntax>`);
		},
	);

	const first = component.render(120);
	const second = component.render(120);
	assert.equal(first, second);
	assert.equal(highlightCalls, 2);
	assert.match(first[0]!, /^<toolDiffRemoved>-1 <\/toolDiffRemoved><syntax>const oldValue = 1;<\/syntax>$/);
	assert.match(first[1]!, /^<toolDiffAdded>\+1 <\/toolDiffAdded><syntax>const newValue = 2;<\/syntax>$/);
	assert.match(first[2]!, /^<dim> 2 <\/dim><syntax>return newValue;<\/syntax>$/);
	assert.ok(!first[0]!.includes("<toolDiffRemoved><syntax>"));
	component.invalidate();
	component.render(120);
	assert.equal(highlightCalls, 4);
});

test("uses Pi's public syntax highlighter and remains width-safe", () => {
	initTheme("dark");
	const component = new SyntaxDiffPreviewComponent(
		"-1 const oldValue = 'old';\n+1 const newValue = 'new';\n 2 return newValue;",
		"src/value.ts",
		plainTheme,
	);
	for (const width of [12, 40, 80]) {
		const lines = component.render(width);
		assert.equal(lines.length, 3);
		for (const line of lines) assert.ok(visibleWidth(line) <= width);
		assert.match(stripTerminalSequences(lines[0]!), /^-1 const ol/);
		assert.match(stripTerminalSequences(lines[1]!), /^\+1 const ne/);
	}
	assert.ok(component.render(80).some((line) => line.includes("\u001b[")));
});

test("highlights JSON and Markdown while keeping unknown extensions neutral", () => {
	initTheme("dark");
	const cases = [
		{ path: "config.json", diff: "-1 {\"enabled\": false}\n+1 {\"enabled\": true}", ansi: "required" },
		// Pi recognizes Markdown, but its public highlighter intentionally leaves some headings plain.
		{ path: "README.md", diff: "-1 ## Old heading\n+1 ## New heading", ansi: "optional" },
		{ path: "data.unknown", diff: "-1 old value\n+1 new value", ansi: "forbidden" },
	] as const;
	for (const fixture of cases) {
		const component = new SyntaxDiffPreviewComponent(
			fixture.diff,
			fixture.path,
			plainTheme,
		);
		const lines = component.render(40);
		assert.equal(lines.length, 2);
		for (const line of lines) assert.ok(visibleWidth(line) <= 40);
		const hasAnsi = lines.some((line) => line.includes("\u001b["));
		if (fixture.ansi === "required") assert.equal(hasAnsi, true);
		if (fixture.ansi === "forbidden") assert.equal(hasAnsi, false);
		assert.match(stripTerminalSequences(lines[0]!), /^-1 /);
		assert.match(stripTerminalSequences(lines[1]!), /^\+1 /);
	}
});
