import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { ModalFrame } from "./modal-frame.ts";

const calls: Array<["fg" | "bg", string, string]> = [];
const spyTheme = {
	fg: (color: string, text: string) => {
		calls.push(["fg", color, text]);
		return text;
	},
	bg: (color: string, text: string) => {
		calls.push(["bg", color, text]);
		return text;
	},
	bold: (text: string) => text,
} as unknown as Theme;

test("uses quiet chrome and a primary title by default", () => {
	calls.length = 0;
	const frame = new ModalFrame(spyTheme, 40);
	frame.top("Command Palette");
	assert.ok(calls.some(([kind, color]) => kind === "fg" && color === "borderMuted"));
	assert.ok(
		calls.some(
			([kind, color, text]) =>
				kind === "fg" && color === "text" && text.includes("Command Palette"),
		),
	);
	assert.ok(!calls.some(([, color]) => color === "borderAccent" || color === "accent"));
});

test("keeps panel and selected row backgrounds distinct", () => {
	calls.length = 0;
	const frame = new ModalFrame(spyTheme, 30);
	assert.equal(visibleWidth(frame.row("normal")), 30);
	assert.equal(visibleWidth(frame.row("selected", { selected: true })), 30);
	assert.ok(calls.some(([kind, color]) => kind === "bg" && color === "customMessageBg"));
	assert.ok(calls.some(([kind, color]) => kind === "bg" && color === "selectedBg"));
});
