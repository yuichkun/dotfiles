import assert from "node:assert/strict";
import test from "node:test";
import type {
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth, type TUI } from "@earendil-works/pi-tui";
import type { ModalContext } from "../shared/modal.ts";
import { WorkspacePickerComponent } from "./picker.ts";

function context(theme: Theme): ModalContext<string> {
	return {
		tui: {
			terminal: { rows: 30, columns: 120 },
			requestRender: () => {},
		} as unknown as TUI,
		theme,
		keybindings: { matches: () => false } as unknown as KeybindingsManager,
		close: () => {},
	};
}

test("uses focus for the current workspace and primary for the selected path", () => {
	const calls: Array<[string, string]> = [];
	const theme = {
		fg: (color: string, text: string) => {
			calls.push([color, text]);
			return text;
		},
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	} as unknown as Theme;
	const component = new WorkspacePickerComponent(
		[
			{ name: "alpha", path: "/tmp/current", source: "configured" },
			{ name: "beta", path: "/tmp/other", source: "configured" },
		],
		"/tmp/current",
		context(theme),
	);
	component.render(100);

	assert.ok(
		calls.some(
			([color, text]) => color === "accent" && text === "  current",
		),
	);
	assert.ok(!calls.some(([color]) => color === "success"));
	assert.ok(calls.some(([color, text]) => color === "text" && text === "/tmp/current"));
	assert.ok(calls.some(([color, text]) => color === "muted" && text.includes("/tmp/other")));
});

test("keeps ANSI-styled workspace rows within narrow widths", () => {
	const theme = {
		fg: (_color: string, text: string) => `\u001b[35m${text}\u001b[39m`,
		bg: (_color: string, text: string) => `\u001b[44m${text}\u001b[49m`,
		bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
	} as unknown as Theme;
	const component = new WorkspacePickerComponent(
		[
			{
				name: "a-long-current-workspace-name",
				path: "/tmp/a/very/long/current/workspace/path",
				source: "configured",
			},
		],
		"/tmp/a/very/long/current/workspace/path",
		context(theme),
	);

	for (const width of [40, 60]) {
		for (const line of component.render(width)) {
			assert.ok(visibleWidth(line) <= width);
		}
	}
});
