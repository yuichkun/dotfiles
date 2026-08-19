import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

interface ThemeJson {
	vars?: Record<string, string | number>;
	colors: Record<string, string | number>;
}

test("uses the agreed subtle panel only for user messages", () => {
	const theme = JSON.parse(
		readFileSync(new URL("./claude-code-dark.json", import.meta.url), "utf8"),
	) as ThemeJson;
	assert.equal(theme.vars?.userPanel, "#211f2a");
	assert.equal(theme.colors.userMessageBg, "userPanel");
	assert.equal(theme.colors.userMessageText, "terminal");
	assert.equal(theme.colors.customMessageBg, "terminal");
});
