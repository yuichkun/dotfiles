import type { Theme } from "@earendil-works/pi-coding-agent";

interface SanitizedAnsi {
	text: string;
	hasSgr: boolean;
}

function readEscapeSequence(value: string, start: number): { value: string; end: number } {
	const next = value[start + 1];
	if (next === "[") {
		let end = start + 2;
		while (end < value.length && !/[\x40-\x7e]/.test(value[end]!)) end++;
		return {
			value: end < value.length ? value.slice(start, end + 1) : "",
			end: end < value.length ? end + 1 : value.length,
		};
	}
	if (next === "]" || next === "_") {
		let end = start + 2;
		while (end < value.length) {
			if (value[end] === "\x07") return { value: value.slice(start, end + 1), end: end + 1 };
			if (value[end] === "\x1b" && value[end + 1] === "\\") {
				return { value: value.slice(start, end + 2), end: end + 2 };
			}
			end++;
		}
		return { value: "", end: value.length };
	}
	return { value: "", end: Math.min(value.length, start + 2) };
}

/** Preserve SGR styling while removing cursor movement and terminal-control sequences. */
export function sanitizeTerminalAnsi(value: string): SanitizedAnsi {
	let text = "";
	let hasSgr = false;
	for (let index = 0; index < value.length; ) {
		const char = value[index]!;
		if (char === "\x1b") {
			const sequence = readEscapeSequence(value, index);
			if (/^\x1b\[[0-9:;<=>?]*m$/.test(sequence.value)) {
				text += sequence.value;
				hasSgr = true;
			}
			index = sequence.end;
			continue;
		}
		if (char === "\r") {
			if (value[index + 1] !== "\n") text += "\n";
			index++;
			continue;
		}
		if (char === "\n" || char === "\t" || char >= " ") text += char;
		index++;
	}
	if (hasSgr && !text.endsWith("\x1b[0m")) text += "\x1b[0m";
	return { text, hasSgr };
}

function getRawText(content: readonly unknown[]): string {
	return content
		.filter(
			(block): block is { type: "text"; text: string } =>
				Boolean(
					block &&
						typeof block === "object" &&
						(block as { type?: unknown }).type === "text" &&
						typeof (block as { text?: unknown }).text === "string",
				),
		)
		.map((block) => block.text)
		.join("\n");
}

function colorizeSemanticLine(line: string, theme: Theme): string {
	if (/^\s*(?:✖|✗)|\b(?:FAIL|ERROR|Error|Exception|AssertionError|fatal)\b|\b[1-9]\d* failed\b/.test(line)) {
		return theme.fg("error", line);
	}
	if (/\b(?:WARN|WARNING|Warning|deprecated|truncated)\b/i.test(line)) {
		return theme.fg("warning", line);
	}
	if (/^\s*(?:✔|✓)|\b(?:PASS|passed|passing|success)\b/i.test(line)) {
		return theme.fg("success", line);
	}
	if (line.startsWith("+") && !line.startsWith("+++")) return theme.fg("toolDiffAdded", line);
	if (line.startsWith("-") && !line.startsWith("---")) return theme.fg("toolDiffRemoved", line);
	if (/^\s*(?:ℹ|info\b)/i.test(line)) return theme.fg("accent", line);
	return theme.fg("text", line);
}

function colorizeSemanticOutput(value: string, theme: Theme): string {
	return value
		.split("\n")
		.map((line) => colorizeSemanticLine(line, theme))
		.join("\n");
}

function patternRegex(args: Record<string, unknown>): RegExp | undefined {
	const pattern = typeof args.pattern === "string" ? args.pattern : "";
	if (!pattern) return undefined;
	const source = args.literal === true ? pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : pattern;
	try {
		const regex = new RegExp(source, args.ignoreCase === true ? "gi" : "g");
		return regex.test("") ? undefined : regex;
	} catch {
		return undefined;
	}
}

function colorizeMatches(value: string, regex: RegExp | undefined, theme: Theme): string {
	if (!regex) return theme.fg("text", value);
	regex.lastIndex = 0;
	let result = "";
	let cursor = 0;
	for (const match of value.matchAll(regex)) {
		const index = match.index ?? 0;
		if (index > cursor) result += theme.fg("text", value.slice(cursor, index));
		result += theme.fg("warning", match[0]);
		cursor = index + match[0].length;
	}
	if (cursor < value.length) result += theme.fg("text", value.slice(cursor));
	return result || theme.fg("text", value);
}

function colorizeGrepOutput(value: string, args: Record<string, unknown>, theme: Theme): string {
	const regex = patternRegex(args);
	return value
		.split("\n")
		.map((line) => {
			const match = line.match(/^(.*?)([:~-])(\d+)([:~-])(.*)$/);
			if (!match) return colorizeSemanticLine(line, theme);
			const [, path, firstSeparator, lineNumber, secondSeparator, body] = match;
			return (
				theme.fg("accent", path!) +
				theme.fg("dim", `${firstSeparator}${lineNumber}${secondSeparator}`) +
				colorizeMatches(body!, regex, theme)
			);
		})
		.join("\n");
}

function colorizePathOutput(value: string, theme: Theme): string {
	return value
		.split("\n")
		.map((line) => {
			if (!line.trim()) return line;
			if (/\b(?:error|failed|not found)\b/i.test(line)) return theme.fg("error", line);
			if (/\b(?:warning|truncated|limit reached)\b/i.test(line)) {
				return theme.fg("warning", line);
			}
			return theme.fg("accent", line);
		})
		.join("\n");
}

export function colorizeExpandedToolOutput(options: {
	toolName: string;
	args: Record<string, unknown>;
	content: readonly unknown[];
	theme: Theme;
}): string | undefined {
	if (!["bash", "grep", "find", "ls"].includes(options.toolName)) return undefined;
	const raw = getRawText(options.content);
	const sanitized = sanitizeTerminalAnsi(raw);
	if (options.toolName === "bash" && sanitized.hasSgr) return sanitized.text;
	if (options.toolName === "grep") {
		return colorizeGrepOutput(sanitized.text, options.args, options.theme);
	}
	if (options.toolName === "find" || options.toolName === "ls") {
		return colorizePathOutput(sanitized.text, options.theme);
	}
	return colorizeSemanticOutput(sanitized.text, options.theme);
}
