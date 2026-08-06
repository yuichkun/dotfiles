import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvisorPrompt } from "./advisor.ts";

test("builds a neutral packet from the verbatim request and sourced facts", () => {
	const prompt = buildAdvisorPrompt({
		request: {
			schemaVersion: 1,
			id: "request-1",
			task: "Passkeyへ移行する",
			createdAt: "2026-01-01T00:00:00.000Z",
		},
		facts: [
			{
				statement: "The application currently uses passwords.",
				source: "src/auth.ts:20",
			},
		],
		constraints: ["Existing users must retain access."],
		openQuestions: ["Which WebAuthn library is acceptable?"],
	});
	assert.match(prompt, /Passkeyへ移行する/);
	assert.match(prompt, /src\/auth\.ts:20/);
	assert.match(prompt, /No candidate plan or preferred implementation/);
	assert.doesNotMatch(prompt, /Codex recommends/);
});
