import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { styleAttachmentChip } from "./attachment-style.ts";

const theme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
	bg: (color: string, text: string) => `<${color}>${text}</${color}>`,
	bold: (text: string) => text,
} as unknown as Theme;

test("renders unselected attachments as primary and selected ones as focus", () => {
	const chip = " ▣ 1 · 2 KB ";
	assert.equal(styleAttachmentChip(theme, chip, false), `<text>${chip}</text>`);
	assert.equal(
		styleAttachmentChip(theme, chip, true),
		`<selectedBg><accent>${chip}</accent></selectedBg>`,
	);
	assert.ok(!styleAttachmentChip(theme, chip, false).includes("<muted>"));
});
