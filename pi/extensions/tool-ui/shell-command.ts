import {
	highlightCode,
	type Theme,
} from "@earendil-works/pi-coding-agent";

type ChainOperator = "&&" | "||" | "|";

interface CommandSegment {
	operator?: ChainOperator;
	command: string;
}

const SHELL_KEYWORDS = new Set([
	"case",
	"do",
	"done",
	"elif",
	"else",
	"esac",
	"fi",
	"for",
	"function",
	"if",
	"in",
	"select",
	"then",
	"time",
	"until",
	"while",
]);

function splitCommandChain(command: string): CommandSegment[] {
	const segments: CommandSegment[] = [];
	let current = "";
	let pendingOperator: ChainOperator | undefined;
	let quote: "'" | '"' | "`" | undefined;
	let escaped = false;
	let parenDepth = 0;
	let braceDepth = 0;
	let testDepth = 0;

	const pushSegment = () => {
		const value = current.trim();
		if (value) {
			segments.push({ operator: pendingOperator, command: value });
		}
		current = "";
	};

	for (let index = 0; index < command.length; index++) {
		const char = command[index];
		const next = command[index + 1];

		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\" && quote !== "'") {
			current += char;
			escaped = true;
			continue;
		}
		if (quote) {
			current += char;
			if (char === quote) quote = undefined;
			continue;
		}
		if (char === "'" || char === '"' || char === "`") {
			quote = char;
			current += char;
			continue;
		}
		if (char === "[" && next === "[") {
			testDepth++;
			current += "[[";
			index++;
			continue;
		}
		if (char === "]" && next === "]" && testDepth > 0) {
			testDepth--;
			current += "]]";
			index++;
			continue;
		}
		if (char === "(") parenDepth++;
		if (char === ")" && parenDepth > 0) parenDepth--;
		if (char === "{") braceDepth++;
		if (char === "}" && braceDepth > 0) braceDepth--;

		const operator =
			parenDepth === 0 && braceDepth === 0 && testDepth === 0
				? char === "&" && next === "&"
					? "&&"
					: char === "|" && next === "|"
						? "||"
						: char === "|" && next !== "&"
							? "|"
							: undefined
				: undefined;
		if (operator) {
			pushSegment();
			pendingOperator = operator;
			if (operator.length === 2) index++;
			continue;
		}

		current += char;
	}

	pushSegment();
	return segments;
}

function highlightCommandSegment(command: string, theme: Theme): string {
	const match = command.match(/^(\s*)([^\s]+)([\s\S]*)$/);
	if (!match) return highlightCode(command, "bash").join("\n");

	const [, leading, executable, rest] = match;
	if (
		SHELL_KEYWORDS.has(executable) ||
		/^[A-Za-z_][A-Za-z0-9_]*=/.test(executable)
	) {
		return highlightCode(command, "bash").join("\n");
	}

	return (
		leading +
		theme.fg("syntaxFunction", theme.bold(executable)) +
		highlightCode(rest, "bash").join("\n")
	);
}

export function formatShellCommand(command: string, theme: Theme): string {
	const segments = splitCommandChain(command);
	if (segments.length === 0) return theme.fg("toolOutput", "...");

	return segments
		.map((segment, index) => {
			const prefix =
				index === 0
					? theme.fg("toolTitle", theme.bold("$ "))
					: `  ${theme.fg("syntaxOperator", segment.operator ?? "&&")} `;
			return prefix + highlightCommandSegment(segment.command, theme);
		})
		.join("\n");
}
