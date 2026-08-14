import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { SEMANTIC_COLOR, paint } from "./color-policy.ts";

const spyTheme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
} as unknown as Theme;

test("maps semantic roles to Pi theme tokens", () => {
	assert.deepEqual(SEMANTIC_COLOR, {
		primary: "text",
		secondary: "muted",
		tertiary: "dim",
		focus: "accent",
		completed: "text",
		code: "mdCode",
		caution: "warning",
		failure: "error",
	});
	assert.equal(paint(spyTheme, "primary", "goal"), "<text>goal</text>");
	assert.equal(paint(spyTheme, "code", "src/app.ts"), "<mdCode>src/app.ts</mdCode>");
	assert.equal(paint(spyTheme, "caution", "stale"), "<warning>stale</warning>");
});

test("keeps the completed role neutral", () => {
	assert.equal(
		paint(spyTheme, "completed", "● Plan updated"),
		"<text>● Plan updated</text>",
	);
});
